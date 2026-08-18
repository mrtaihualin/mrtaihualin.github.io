export const CALENDAR_TERMINAL_STATE = Object.freeze({
  SUCCESS: 'SUCCESS',
  PARTIAL_SUCCESS: 'PARTIAL_SUCCESS',
  RETRY_PENDING: 'RETRY_PENDING',
  FAILED: 'FAILED',
});

export const GOOGLE_CALENDAR_LIMIT_MESSAGE =
  'ระบบ Google Calendar กำลังจำกัดการใช้งาน กรุณาลองใหม่อีกครั้งภายหลัง';

export const GOOGLE_CALENDAR_LIMIT_MESSAGE_ZH =
  'Google Calendar 目前限制使用量，請稍後再試。';

const RATE_LIMIT_REASONS = new Set([
  'dailylimitexceeded',
  'quotaexceeded',
  'ratelimitexceeded',
  'resourcelimitexceeded',
  'userratelimitexceeded',
]);

function collectProviderReasons(value, output) {
  if (!value || typeof value !== 'object') return;
  if (typeof value.reason === 'string') output.push(value.reason.toLowerCase());
  if (Array.isArray(value.errors)) {
    for (const error of value.errors) collectProviderReasons(error, output);
  }
  if (value.error && typeof value.error === 'object') collectProviderReasons(value.error, output);
}

export function classifyGoogleCalendarFailure(status, bodyText) {
  const numericStatus = Number(status) || 0;
  let parsed = null;
  try { parsed = bodyText ? JSON.parse(bodyText) : null; } catch (_error) { /* provider text is diagnostic only */ }
  const reasons = [];
  collectProviderReasons(parsed, reasons);
  const bodyLower = String(bodyText || '').toLowerCase();
  const rateLimited = numericStatus === 429
    || (numericStatus === 403 && (
      reasons.some((reason) => RATE_LIMIT_REASONS.has(reason))
      || /usage.?limits|rate.?limit|quota.?exceeded/.test(bodyLower)
    ));
  return {
    rateLimited,
    retryableRead: rateLimited || numericStatus === 408 || numericStatus >= 500,
    providerReasons: reasons,
  };
}

function retryAfterMs(headers, fallbackMs, maxDelayMs) {
  const raw = headers && typeof headers.get === 'function' ? headers.get('retry-after') : null;
  if (raw) {
    const seconds = Number(raw);
    if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, maxDelayMs);
    const dateMs = Date.parse(raw);
    if (Number.isFinite(dateMs)) return Math.min(Math.max(0, dateMs - Date.now()), maxDelayMs);
  }
  return Math.min(fallbackMs, maxDelayMs);
}

/**
 * Bounded retry wrapper for Google Calendar.
 *
 * Mutation retries are deliberately limited to explicit provider rate-limit
 * responses. A network error or 5xx after PATCH/DELETE is ambiguous, so it is
 * returned immediately and the caller must verify state instead of replaying.
 */
export async function googleCalendarRequest(fetchFn, url, init = {}, options = {}) {
  const method = String(init.method || 'GET').toUpperCase();
  const isRead = method === 'GET' || method === 'HEAD';
  const maxAttempts = Math.max(1, Number(options.maxAttempts) || 3);
  const baseDelayMs = Math.max(0, Number(options.baseDelayMs) || 250);
  const maxDelayMs = Math.max(baseDelayMs, Number(options.maxDelayMs) || 2000);
  const sleep = options.sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));

  let attempt = 0;
  while (attempt < maxAttempts) {
    attempt += 1;
    let response;
    try {
      response = await fetchFn(url, init);
    } catch (error) {
      if (isRead && attempt < maxAttempts) {
        await sleep(Math.min(baseDelayMs * (2 ** (attempt - 1)), maxDelayMs));
        continue;
      }
      return {
        ok: false,
        status: 0,
        reason: 'network_error',
        rateLimited: false,
        ambiguousMutation: !isRead,
        attempts: attempt,
        bodyText: '',
        error,
      };
    }

    const bodyText = await response.text().catch(() => '');
    if (response.ok) {
      return {
        ok: true,
        status: response.status,
        attempts: attempt,
        bodyText,
        json: bodyText ? (() => { try { return JSON.parse(bodyText); } catch (_error) { return null; } })() : null,
      };
    }

    const classification = classifyGoogleCalendarFailure(response.status, bodyText);
    const safeToRetry = classification.rateLimited || (isRead && classification.retryableRead);
    if (safeToRetry && attempt < maxAttempts) {
      const fallback = baseDelayMs * (2 ** (attempt - 1));
      await sleep(retryAfterMs(response.headers, fallback, maxDelayMs));
      continue;
    }

    return {
      ok: false,
      status: response.status,
      reason: classification.rateLimited ? 'rate_limited' : 'http_error',
      rateLimited: classification.rateLimited,
      ambiguousMutation: !isRead && !classification.rateLimited && response.status >= 500,
      attempts: attempt,
      bodyText,
      providerReasons: classification.providerReasons,
    };
  }

  return { ok: false, status: 0, reason: 'retry_exhausted', rateLimited: false, attempts: maxAttempts, bodyText: '' };
}

export function terminalStateForCalendarFailure(result) {
  if (result && result.rateLimited) return CALENDAR_TERMINAL_STATE.RETRY_PENDING;
  if (result && result.ambiguousMutation) return CALENDAR_TERMINAL_STATE.RETRY_PENDING;
  return CALENDAR_TERMINAL_STATE.FAILED;
}

export function formatCalendarTerminalMessage(result) {
  const state = result && result.state;
  const completed = Array.isArray(result && result.completed) ? result.completed.filter(Boolean) : [];
  const pending = Array.isArray(result && result.pending) ? result.pending.filter(Boolean) : [];

  if (state === CALENDAR_TERMINAL_STATE.SUCCESS) {
    return '✅ ' + (completed.join('，') || 'Calendar 操作已確認完成');
  }
  if (state === CALENDAR_TERMINAL_STATE.PARTIAL_SUCCESS) {
    return '⚠️ 已完成：' + (completed.join('、') || '部分步驟')
      + '\n仍待處理：' + (pending.join('、') || '後續同步');
  }
  if (state === CALENDAR_TERMINAL_STATE.RETRY_PENDING) {
    if (result && result.reason === 'RATE_LIMIT') {
      return '⏳ ' + GOOGLE_CALENDAR_LIMIT_MESSAGE_ZH
        + '\n這筆操作仍保留待處理，請不要連續重複點擊。';
    }
    return '⏳ Calendar 指令可能已送出，但目前無法確認最後狀態。'
      + '\n這筆操作仍保留待確認，請不要重複點擊；請先到 Google Calendar 查看。';
  }
  return '⚠️ Calendar 操作沒有完成。請稍後再試；若仍失敗，請到網站確認。';
}
