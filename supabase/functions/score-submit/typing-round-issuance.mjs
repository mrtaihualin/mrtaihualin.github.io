// Internal source-only initial issuance. No HTTP route imports or enables this.
// The protected wrapper derives authenticated context, cross-round Combo and
// the first bounded ordered reserve batch without browser-owned values.
import { buildTypingInitialRoundAllocation } from './typing-initial-prompt-plan.mjs';
import { loadTypingInitialRoundContext } from './typing-round-context.mjs';
import { handleTypingRoundAction } from './typing-round-service.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RECEIPT_FIELDS = 'operation_id,user_id,round_id,operation_type,request_hash,request_payload,response';

function fail(code, status = 503) {
  throw Object.assign(new Error(code), { code, status, typingIssuanceError: true });
}

function uuid(value, code, status = 400) {
  if (typeof value !== 'string' || !UUID.test(value)) fail(code, status);
  return value.toLowerCase();
}

function request(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)
      || Object.keys(body).some(key => !['action', 'operation_id', 'level'].includes(key))
      || body.action !== 'typing_round_start') fail('invalid_typing_request', 400);
  const operationId = uuid(body.operation_id, 'invalid_operation_id');
  if (![1, 2].includes(body.level)) fail('invalid_typing_level', 400);
  return { operationId, level: body.level };
}

async function requestHash(userId, level) {
  const bytes = new TextEncoder().encode(JSON.stringify({ userId, action: 'typing_round_start', level }));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

// Also bound a callback that fails to honor its signal. Keep its rejection
// handled after timeout; it is a read-only trusted-context provider, not a writer.
function withinDeadline(work, signal) {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener('abort', abort, { once: true });
    Promise.resolve(work).then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}

async function resultOf(query, signal) {
  signal.throwIfAborted();
  const result = await withinDeadline(query.retry(false).abortSignal(signal), signal);
  signal.throwIfAborted();
  if (!result || result.error) fail('typing_storage_unavailable');
  return result.data;
}

async function receipt(admin, operationId, signal) {
  const data = await resultOf(admin.from('phase1_typing_round_operations')
    .select(RECEIPT_FIELDS).eq('operation_id', operationId).maybeSingle(), signal);
  if (data === null) return null;
  if (!data || typeof data !== 'object' || Array.isArray(data)) fail('invalid_typing_evidence');
  return data;
}

function confirmedRound(response, operationId, level) {
  if (!response || response.ok !== true || response.operation_id !== operationId
      || typeof response.idempotent !== 'boolean' || response.game !== 'typing'
      || response.level !== level) fail('invalid_typing_evidence');
  return uuid(response.round_id, 'invalid_typing_evidence', 503);
}

function replayRound(saved, userId, operationId, level, hash) {
  if (saved.operation_id !== operationId || saved.user_id !== userId
      || saved.operation_type !== 'create_round' || saved.request_hash !== hash
      || saved.request_payload?.level !== level) fail('replay_conflict', 409);
  const roundId = confirmedRound(saved.response, operationId, level);
  if (saved.round_id !== roundId
      || !Number.isSafeInteger(saved.request_payload?.starting_combo)
      || saved.request_payload.starting_combo < 0
      || saved.response.starting_combo !== saved.request_payload.starting_combo
      || !Array.isArray(saved.request_payload.prompts)
      || saved.request_payload.prompts.length !== 5
      || !Array.isArray(saved.request_payload.reserve_prompts)
      || saved.request_payload.reserve_prompts.length > 64
      || saved.response.prompt_count !== 5
      || saved.response.reserve_count !== saved.request_payload.reserve_prompts.length) fail('invalid_typing_evidence');
  return roundId;
}

// Resume already owns the protected projection. Keep its query builders intact
// while binding every read to this issuance request's original deadline.
function deadlineAdmin(admin, signal) {
  const bind = query => new Proxy(query, {
    get(target, key) {
      if (key === 'abortSignal') return () => target.abortSignal(signal);
      const value = Reflect.get(target, key, target);
      if (typeof value !== 'function') return value;
      if (key === 'then') return value.bind(target);
      return (...args) => bind(value.apply(target, args));
    },
  });
  return { rpc: (...args) => bind(admin.rpc(...args)), from: (...args) => bind(admin.from(...args)) };
}

export async function handleTypingRoundStart({ admin, user, body, loadTrustedContext, enabled = false }) {
  if (enabled !== true) return { status: 404, body: { error: 'feature_disabled' } };
  let start;
  let writeAttempted = false;
  let writeConfirmed = false;
  try {
    const userId = uuid(user?.id, 'unauthorized', 401);
    start = request(body);
    const signal = AbortSignal.timeout(10000);
    const hash = await withinDeadline(requestHash(userId, start.level), signal);
    let saved = await receipt(admin, start.operationId, signal);
    let roundId;
    let idempotent = true;
    if (saved) {
      roundId = replayRound(saved, userId, start.operationId, start.level, hash);
      writeConfirmed = true;
    } else {
      if (typeof loadTrustedContext !== 'function') fail('typing_context_unavailable');
      const context = await withinDeadline(loadTrustedContext({ userId, level: start.level, signal }), signal);
      signal.throwIfAborted();
      if (!context || !Number.isSafeInteger(context.startingCombo) || context.startingCombo < 0) {
        fail('invalid_typing_context');
      }
      let allocation;
      try {
        allocation = buildTypingInitialRoundAllocation({ level: start.level, today: context.today,
          snapshots: context.snapshots, canonicalRows: context.canonicalRows });
      } catch (_) { fail('invalid_typing_context'); }
      signal.throwIfAborted();
      writeAttempted = true;
      const created = await resultOf(admin.rpc('phase1_typing_round_issue', {
        p_operation_id: start.operationId, p_user_id: userId, p_request_hash: hash,
        p_level: start.level, p_starting_combo: context.startingCombo,
        p_prompts: allocation.prompts, p_reserve_prompts: allocation.reservePrompts,
      }), signal);
      if (created?.ok === true) {
        writeConfirmed = true;
        roundId = confirmedRound(created, start.operationId, start.level);
        idempotent = created.idempotent;
      } else if (created?.reason === 'replay_conflict') {
        // Concurrent callers may have generated different unissued candidates.
        // Only the saved winner is authoritative; never regenerate after commit.
        saved = await receipt(admin, start.operationId, signal);
        if (!saved) fail('replay_conflict', 409);
        roundId = replayRound(saved, userId, start.operationId, start.level, hash);
        writeConfirmed = true;
      } else if (created?.reason === 'active_round_exists') {
        fail('active_round_exists', 409);
      } else {
        fail('typing_storage_unavailable');
      }
    }
    const resumed = await withinDeadline(handleTypingRoundAction({
      admin: deadlineAdmin(admin, signal), user: { id: userId },
      body: { action: 'typing_round_resume', round_id: roundId }, enabled: true,
    }), signal);
    signal.throwIfAborted();
    if (resumed.status !== 200) {
      return { status: resumed.status, body: { ...resumed.body, operation_id: start.operationId,
        retry_same_operation: true, round_committed: true } };
    }
    return { status: 200, body: { ...resumed.body, operation_id: start.operationId, idempotent } };
  } catch (error) {
    const status = error?.typingIssuanceError === true ? error.status : 503;
    const code = error?.typingIssuanceError === true ? error.code : 'typing_round_unavailable';
    return { status, body: { error: code,
      ...((writeConfirmed || (writeAttempted && status >= 500))
        ? { operation_id: start.operationId, retry_same_operation: true,
          ...(writeConfirmed ? { round_committed: true } : {}) } : {}) } };
  }
}

function taipeiDay(now) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
}

// Future authenticated entrypoints use this owner-bound wrapper. It deliberately
// exposes no callback, day, catalog, learning state or Combo override to HTTP.
// The feature remains default OFF and is not imported by the live entrypoint.
export async function handleTypingRoundStartWithProtectedContext({
  admin, user, body, enabled = false, catalogMode = 'off', now = new Date(),
}) {
  return handleTypingRoundStart({ admin, user, body, enabled,
    loadTrustedContext: ({ userId, level, signal }) => loadTypingInitialRoundContext({
      admin, userId, level, signal, catalogMode, today: taipeiDay(now),
    }),
  });
}
