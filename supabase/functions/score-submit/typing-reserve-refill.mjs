// Protected Typing reserve refill owner for the authenticated HTTP route.
import { buildTypingReserveRefillPlan } from './typing-initial-prompt-plan.mjs';
import { loadTypingReserveRefillContext } from './typing-round-context.mjs';
import { loadTypingRoundEvidence } from './typing-round-service.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RECORD_HASH = /^[0-9a-f]{64}$/;
const PAGE_SIZE = 64;
const RECEIPT_FIELDS = 'batch_id,user_id,round_id,request_hash,request_payload,response';

function fail(code, status = 503) {
  throw Object.assign(new Error(code), { code, status, typingRefillError: true });
}

function uuid(value, code, status = 400) {
  if (typeof value !== 'string' || !UUID.test(value)) fail(code, status);
  return value.toLowerCase();
}

function integer(value, min = 0) {
  return Number.isSafeInteger(value) && value >= min;
}

function exactKeys(value, allowed) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === allowed.length
    && Object.keys(value).every((key) => allowed.includes(key));
}

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

async function requestHash(userId, roundId, batchId) {
  const bytes = new TextEncoder().encode(JSON.stringify({
    userId, action: 'typing_reserve_refill', roundId, batchId,
  }));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function receipt(admin, batchId, signal) {
  const data = await resultOf(admin.from('phase1_typing_round_reserve_batches')
    .select(RECEIPT_FIELDS).eq('batch_id', batchId).maybeSingle(), signal);
  if (data === null) return null;
  if (!data || typeof data !== 'object' || Array.isArray(data)) fail('invalid_typing_evidence');
  return data;
}

function pinnedPrompt(prompt) {
  return prompt?.content_ref?.source === 'game_words'
    && typeof prompt.content_ref.key === 'string' && prompt.content_ref.key.trim() === prompt.content_ref.key
    && prompt.content_ref.key.length > 0 && prompt.content_ref.key.length <= 512
    && typeof prompt.answer === 'string' && prompt.answer.trim() === prompt.answer
    && prompt.answer.length > 0 && [...prompt.answer].length <= 512
    && typeof prompt.catalog_version === 'string' && prompt.catalog_version.trim() === prompt.catalog_version
    && prompt.catalog_version.length > 0 && prompt.catalog_version.length <= 128
    && RECORD_HASH.test(prompt.record_hash || '')
    && typeof prompt.golden === 'boolean' && prompt.srs_bonus === false;
}

function confirmedReceipt(saved, userId, roundId, batchId, hash) {
  const payload = saved.request_payload;
  const response = saved.response;
  if (saved.batch_id !== batchId) fail('invalid_typing_evidence');
  if (saved.user_id !== userId || saved.round_id !== roundId || saved.request_hash !== hash) {
    fail('replay_conflict', 409);
  }
  if (!exactKeys(payload, ['round_id', 'expected_reserve_count', 'prompts'])
      || payload.round_id !== roundId || !integer(payload.expected_reserve_count)
      || !Array.isArray(payload.prompts) || payload.prompts.length < 1 || payload.prompts.length > 64
      || payload.prompts.some((prompt) => !pinnedPrompt(prompt))
      || !exactKeys(response, ['ok', 'idempotent', 'batch_id', 'round_id', 'added_reserve_count', 'reserve_count'])
      || response.ok !== true || response.idempotent !== false || response.batch_id !== batchId
      || response.round_id !== roundId || response.added_reserve_count !== payload.prompts.length
      || response.reserve_count !== payload.expected_reserve_count + payload.prompts.length) {
    fail('invalid_typing_evidence');
  }
  return { ok: true, idempotent: true, batch_id: batchId, round_id: roundId,
    added_reserve_count: response.added_reserve_count, reserve_count: response.reserve_count };
}

function reserveRound(raw, requestedId) {
  const id = uuid(raw?.round_id, 'invalid_typing_evidence', 503);
  if (id !== requestedId || ![1, 2].includes(raw.level) || raw.status !== 'active'
      || !integer(raw.next_event_sequence, 1) || !integer(raw.current_prompt_ordinal, 1)
      || !integer(raw.prompt_count, 5) || !integer(raw.completed_count) || raw.completed_count > 5
      || !integer(raw.skip_count)) fail('invalid_typing_evidence');
  return { round_id: id, level: raw.level, status: raw.status,
    next_event_sequence: raw.next_event_sequence, current_prompt_ordinal: raw.current_prompt_ordinal,
    prompt_count: raw.prompt_count, completed_count: raw.completed_count, skip_count: raw.skip_count };
}

function reserveState(raw) {
  if (!integer(raw?.reserve_count) || !integer(raw?.reserve_cursor)
      || raw.reserve_cursor > raw.reserve_count) fail('invalid_typing_evidence');
  return { reserve_count: raw.reserve_count, reserve_cursor: raw.reserve_cursor };
}

async function loadReserveEvidence(admin, userId, roundId, signal) {
  let snapshot = null;
  let after = 0;
  const prompts = [];
  do {
    const page = await resultOf(admin.rpc('phase1_typing_round_reserve_load', {
      p_user_id: userId, p_round_id: roundId, p_reserve_after: after, p_page_size: PAGE_SIZE,
    }), signal);
    if (page?.ok !== true) {
      if (page?.reason === 'round_not_found') fail('round_not_found', 404);
      if (page?.reason === 'typing_canonical_changed' || page?.reason === 'round_not_active') {
        fail(page.reason, 409);
      }
      fail('typing_storage_unavailable');
    }
    const current = { round: reserveRound(page.round, roundId), reserve: reserveState(page.reserve) };
    if (snapshot && JSON.stringify(current) !== JSON.stringify(snapshot)) fail('resync_required', 409);
    snapshot = current;
    const rows = page.reserve_page;
    const expected = Math.min(PAGE_SIZE, snapshot.reserve.reserve_count - after);
    if (!Array.isArray(rows) || rows.length !== expected
        || page.next_reserve_after !== after + rows.length
        || page.has_more_reserves !== (page.next_reserve_after < snapshot.reserve.reserve_count)) {
      fail('invalid_typing_evidence');
    }
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (row?.reserve_ordinal !== after + i + 1 || row.content_ref?.source !== 'game_words'
          || typeof row.content_ref.key !== 'string' || !row.content_ref.key
          || row.content_ref.key.trim() !== row.content_ref.key
          || typeof row.catalog_version !== 'string' || !row.catalog_version
          || row.catalog_version.trim() !== row.catalog_version || row.catalog_version.length > 128
          || !RECORD_HASH.test(row.record_hash || '')) fail('invalid_typing_evidence');
      prompts.push(row);
    }
    after = page.next_reserve_after;
  } while (after < snapshot.reserve.reserve_count);
  return { ...snapshot, prompts };
}

function sameRound(evidence, reserve) {
  const left = evidence.round;
  const right = reserve.round;
  if (left.round_id !== right.round_id || left.level !== right.level || left.status !== right.status
      || left.next_event_sequence !== right.next_event_sequence
      || left.current_prompt_ordinal !== right.current_prompt_ordinal
      || left.prompt_count !== right.prompt_count || left.completed_count !== right.completed_count
      || left.skip_count !== right.skip_count) fail('resync_required', 409);
}

function planEvidence(evidence, reserve) {
  const completed = new Set();
  for (const event of evidence.events) {
    if (event.type === 'completed') completed.add(evidence.prompts[event.prompt_ordinal - 1].content_ref.key);
  }
  const queued = new Set(evidence.prompts
    .filter((prompt) => prompt.prompt_ordinal >= evidence.round.current_prompt_ordinal)
    .map((prompt) => prompt.content_ref.key));
  for (const prompt of reserve.prompts) {
    if (prompt.reserve_ordinal > reserve.reserve.reserve_cursor) queued.add(prompt.content_ref.key);
  }
  const issued = new Set([
    ...evidence.prompts.map((prompt) => prompt.content_ref.key),
    ...reserve.prompts.map((prompt) => prompt.content_ref.key),
  ]);
  return { issuedKeys: [...issued], completedKeys: [...completed], queuedKeys: [...queued] };
}

function confirmedWrite(data, batchId, roundId, expectedCount, addedCount) {
  if (!data || data.ok !== true || data.batch_id !== batchId || data.round_id !== roundId
      || typeof data.idempotent !== 'boolean' || data.added_reserve_count !== addedCount
      || data.reserve_count !== expectedCount + addedCount) fail('invalid_typing_evidence');
  return { ok: true, idempotent: data.idempotent, batch_id: batchId, round_id: roundId,
    added_reserve_count: data.added_reserve_count, reserve_count: data.reserve_count };
}

export async function handleTypingReserveRefill({
  admin, user, batchId, roundId, loadTrustedContext, enabled = false,
}) {
  if (enabled !== true) return { status: 404, body: { error: 'feature_disabled' } };
  let ids;
  let writeAttempted = false;
  let writeConfirmed = false;
  try {
    ids = { userId: uuid(user?.id, 'unauthorized', 401),
      batchId: uuid(batchId, 'invalid_batch_id'), roundId: uuid(roundId, 'invalid_round_id') };
    const signal = AbortSignal.timeout(10000);
    const hash = await withinDeadline(requestHash(ids.userId, ids.roundId, ids.batchId), signal);
    let saved = await receipt(admin, ids.batchId, signal);
    if (saved) {
      const replayed = confirmedReceipt(saved, ids.userId, ids.roundId, ids.batchId, hash);
      writeConfirmed = true;
      return { status: 200, body: replayed };
    }
    const [evidence, reserve] = await Promise.all([
      loadTypingRoundEvidence({ admin, userId: ids.userId, roundId: ids.roundId, signal }),
      loadReserveEvidence(admin, ids.userId, ids.roundId, signal),
    ]);
    sameRound(evidence, reserve);
    if (evidence.round.status !== 'active') fail('round_not_active', 409);
    if (typeof loadTrustedContext !== 'function') fail('typing_context_unavailable');
    const context = await withinDeadline(loadTrustedContext({
      userId: ids.userId, level: evidence.round.level, signal,
    }), signal);
    signal.throwIfAborted();
    let prompts;
    try {
      prompts = buildTypingReserveRefillPlan({ level: evidence.round.level, today: context?.today,
        snapshots: context?.snapshots, canonicalRows: context?.canonicalRows,
        ...planEvidence(evidence, reserve) });
    } catch (error) {
      if (error?.code === 'typing_refill_unavailable') fail(error.code, 409);
      fail('invalid_typing_context');
    }
    writeAttempted = true;
    const created = await resultOf(admin.rpc('phase1_typing_round_refill', {
      p_batch_id: ids.batchId, p_user_id: ids.userId, p_request_hash: hash,
      p_round_id: ids.roundId, p_expected_event_sequence: evidence.round.next_event_sequence,
      p_expected_prompt_ordinal: evidence.round.current_prompt_ordinal,
      p_expected_prompt_count: evidence.round.prompt_count,
      p_expected_completed_count: evidence.round.completed_count,
      p_expected_skip_count: evidence.round.skip_count,
      p_expected_reserve_count: reserve.reserve.reserve_count,
      p_expected_reserve_cursor: reserve.reserve.reserve_cursor, p_prompts: prompts,
    }), signal);
    if (created?.ok === true) {
      const confirmed = confirmedWrite(created, ids.batchId, ids.roundId,
        reserve.reserve.reserve_count, prompts.length);
      writeConfirmed = true;
      return { status: 200, body: confirmed };
    }
    if (created?.reason === 'replay_conflict') {
      saved = await receipt(admin, ids.batchId, signal);
      if (!saved) fail('replay_conflict', 409);
      const replayed = confirmedReceipt(saved, ids.userId, ids.roundId, ids.batchId, hash);
      writeConfirmed = true;
      return { status: 200, body: replayed };
    }
    if (created?.reason === 'round_not_found') fail(created.reason, 404);
    if (['round_not_active', 'resync_required', 'typing_canonical_changed'].includes(created?.reason)) {
      fail(created.reason, 409);
    }
    fail('typing_storage_unavailable');
  } catch (error) {
    const ownedError = error?.typingRefillError === true || error?.typingBridgeError === true;
    const status = ownedError ? error.status : 503;
    const code = ownedError ? error.code : 'typing_refill_unavailable';
    return { status, body: { error: code,
      ...((writeConfirmed || (writeAttempted && status >= 500)) && ids
        ? { batch_id: ids.batchId, retry_same_batch: true,
          ...(writeConfirmed ? { refill_committed: true } : {}) } : {}) } };
  }
}

function taipeiDay(now) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
}

export async function handleTypingReserveRefillWithProtectedContext({
  admin, user, batchId, roundId, enabled = false, catalogMode = 'off', now = new Date(),
}) {
  return handleTypingReserveRefill({ admin, user, batchId, roundId, enabled,
    loadTrustedContext: ({ userId, level, signal }) => loadTypingReserveRefillContext({
      admin, userId, level, signal, catalogMode, today: taipeiDay(now),
    }),
  });
}
