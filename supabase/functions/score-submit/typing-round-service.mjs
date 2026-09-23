// Existing-round bridge only. Round/prompt issuance and browser activation are
// separate units. Keep the HTTP route OFF until those owners are integrated.
import { buildTypingResumeCheckpoint } from './typing-resume-checkpoint.mjs';
import { catalogBatches } from './learning-catalog.mjs';

export const TYPING_ROUND_ACTIONS_ENABLED = false;
const PAGE_SIZE = 64;
const TIMEOUT_MS = 10000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RECORD_HASH = /^[0-9a-f]{64}$/;
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

function fail(code, status = 503) {
  throw Object.assign(new Error(code), { code, status, typingBridgeError: true });
}

function uuid(value, code, status = 400) {
  if (typeof value !== 'string' || !UUID.test(value)) fail(code, status);
  return value.toLowerCase();
}

function integer(value, min = 0) {
  return Number.isSafeInteger(value) && value >= min;
}

function exactKeys(value, allowed) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || Object.keys(value).some((key) => !allowed.includes(key))) fail('invalid_typing_request', 400);
}

function request(body) {
  const event = body?.action === 'typing_round_event';
  if (!event && body?.action !== 'typing_round_resume') fail('invalid_typing_action', 400);
  exactKeys(body, event
    ? ['action', 'round_id', 'operation_id', 'expected_sequence', 'prompt_ordinal', 'type', 'answer']
    : ['action', 'round_id']);
  const roundId = body.round_id == null && !event ? null : uuid(body.round_id, 'invalid_round_id');
  if (!event) return { action: body.action, roundId };
  const operationId = uuid(body.operation_id, 'invalid_operation_id');
  if (!integer(body.expected_sequence, 1) || !integer(body.prompt_ordinal, 1)
      || !['wrong', 'hint_opened', 'completed', 'skipped'].includes(body.type)) fail('invalid_typing_event', 400);
  if (body.type === 'completed') {
    if (typeof body.answer !== 'string' || !body.answer || body.answer.trim() !== body.answer
        || [...body.answer].length > 512) fail('invalid_typing_answer', 400);
  } else if (own(body, 'answer')) fail('unexpected_typing_answer', 400);
  return { action: body.action, roundId, operationId, sequence: body.expected_sequence,
    promptOrdinal: body.prompt_ordinal, type: body.type, answer: body.answer ?? null };
}

async function resultOf(query, signal) {
  signal.throwIfAborted();
  // No hidden SDK retry: the caller retains the original operation ID after an
  // uncertain write. One deadline covers paging, canonical reads and the write.
  const result = await query.retry(false).abortSignal(signal);
  signal.throwIfAborted();
  if (result?.error || !result) fail('typing_storage_unavailable');
  return result.data;
}

function rpcResult(data) {
  if (data?.ok === true) return data;
  const reason = data?.reason;
  if (reason === 'round_not_found') fail(reason, 404);
  if (['replay_conflict', 'resync_required', 'round_not_active', 'replacement_prompt_required',
    'typing_reserve_exhausted', 'typing_canonical_changed'].includes(reason)) fail(reason, 409);
  if (['answer_mismatch', 'duplicate_completed_content', 'invalid_arguments'].includes(reason)) fail(reason, 400);
  fail('typing_storage_unavailable');
}

function roundShape(raw, requestedId) {
  const id = uuid(raw?.round_id, 'invalid_typing_evidence', 503);
  if ((requestedId && requestedId !== id) || raw.game !== 'typing' || ![1, 2].includes(raw.level)
      || !integer(raw.starting_combo) || !integer(raw.prompt_count, 5)
      || !integer(raw.next_event_sequence, 1) || !integer(raw.current_prompt_ordinal, 1)
      || !integer(raw.completed_count) || raw.completed_count > 5 || !integer(raw.skip_count)
      || raw.current_prompt_ordinal !== raw.completed_count + raw.skip_count + 1
      || !['active', 'completed'].includes(raw.status)
      || (raw.status === 'completed') !== (raw.completed_count === 5)) fail('invalid_typing_evidence');
  // Fixed order is also the snapshot fingerprint across separate RPC pages.
  return { round_id: id, game: raw.game, level: raw.level, starting_combo: raw.starting_combo,
    prompt_count: raw.prompt_count, next_event_sequence: raw.next_event_sequence,
    current_prompt_ordinal: raw.current_prompt_ordinal, completed_count: raw.completed_count,
    skip_count: raw.skip_count, status: raw.status };
}

function pageRows(page, kind, after, total) {
  const rows = page[kind === 'prompt' ? 'prompt_page' : 'event_page'];
  const next = page[`next_${kind}_after`];
  const hasMore = page[`has_more_${kind}s`];
  const field = kind === 'prompt' ? 'prompt_ordinal' : 'sequence';
  if (!Array.isArray(rows) || rows.length !== Math.min(PAGE_SIZE, total - after)
      || next !== after + rows.length || hasMore !== (next < total)
      || rows.some((row, i) => row?.[field] !== after + i + 1)) fail('invalid_typing_evidence');
  return rows;
}

async function loadEvidence(admin, userId, requestedId, signal) {
  let round = null;
  let promptAfter = 0;
  let eventAfter = 0;
  const prompts = [];
  const events = [];
  do {
    const page = rpcResult(await resultOf(admin.rpc('phase1_typing_round_load', {
      p_user_id: userId, p_round_id: round?.round_id || requestedId,
      p_prompt_after: promptAfter, p_event_after: eventAfter, p_page_size: PAGE_SIZE,
    }), signal));
    const current = roundShape(page.round, round?.round_id || requestedId);
    if (round && JSON.stringify(current) !== JSON.stringify(round)) fail('resync_required', 409);
    round = current;
    prompts.push(...pageRows(page, 'prompt', promptAfter, round.prompt_count));
    events.push(...pageRows(page, 'event', eventAfter, round.next_event_sequence - 1));
    promptAfter = page.next_prompt_after;
    eventAfter = page.next_event_after;
  } while (promptAfter < round.prompt_count || eventAfter < round.next_event_sequence - 1);

  let expectedOrdinal = 1;
  for (const event of events) {
    const prompt = prompts[event.prompt_ordinal - 1];
    if (!prompt || event.prompt_ordinal !== expectedOrdinal
        || event.content_ref?.source !== prompt.content_ref?.source
        || event.content_ref?.key !== prompt.content_ref?.key) fail('invalid_typing_evidence');
    if (event.type === 'completed' || event.type === 'skipped') expectedOrdinal += 1;
  }
  return { round, prompts, events };
}

async function canonicalRows(admin, evidence, signal) {
  const level = evidence.round.level === 1 ? '初' : '中';
  const keys = [...new Set(evidence.prompts.map((prompt) => {
    const ref = prompt?.content_ref;
    if (ref?.source !== 'game_words' || typeof ref.key !== 'string' || !ref.key
        || ref.key.trim() !== ref.key
        || typeof prompt.catalog_version !== 'string' || !prompt.catalog_version
        || prompt.catalog_version.trim() !== prompt.catalog_version || prompt.catalog_version.length > 128
        || !RECORD_HASH.test(prompt.record_hash || '')) fail('invalid_typing_evidence');
    return ref.key;
  }))];
  const rows = [];
  for (const batch of catalogBatches(keys)) {
    const data = await resultOf(admin.from('game_words')
      .select('content_key,level,canonical_record,status,access_tier,catalog_version,record_hash')
      .in('content_key', batch).eq('level', level), signal);
    if (!Array.isArray(data)) fail('typing_canonical_unavailable');
    for (const row of data) {
      const record = row?.canonical_record;
      if (row.status !== 'active' || !['guest', 'login'].includes(row.access_tier)
          || !batch.includes(row.content_key) || row.level !== level
          || typeof row.catalog_version !== 'string' || !row.catalog_version
          || row.catalog_version.trim() !== row.catalog_version || row.catalog_version.length > 128
          || !RECORD_HASH.test(row.record_hash || '')
          || record?.contentKey !== row.content_key || record.level !== level
          || !Array.isArray(record.syllables) || !record.syllables.length) fail('typing_canonical_unavailable');
      rows.push({ content_key: record.contentKey, word: record.word, level, syllables: record.syllables,
        catalog_version: row.catalog_version, record_hash: row.record_hash });
    }
  }
  const byKey = new Map(rows.map((row) => [row.content_key, row]));
  if (byKey.size !== rows.length || byKey.size !== keys.length) fail('typing_canonical_unavailable');
  for (const prompt of evidence.prompts) {
    const row = byKey.get(prompt.content_ref.key);
    if (row?.word !== prompt.answer || row?.catalog_version !== prompt.catalog_version
        || row?.record_hash !== prompt.record_hash) fail('typing_canonical_changed', 409);
  }
  return rows;
}

export async function loadTypingRoundCheckpoint({ admin, userId, roundId, signal }) {
  const evidence = await loadEvidence(admin, userId, roundId, signal);
  const { round, prompts, events } = evidence;
  const rows = await canonicalRows(admin, evidence, signal);
  let state;
  try {
    state = buildTypingResumeCheckpoint({
      serverRound: { roundId: round.round_id, game: 'typing', difficulty: round.level === 1 ? '初' : '中',
        startingCombo: round.starting_combo,
        prompts: prompts.map((p) => ({ contentRef: p.content_ref, golden: p.golden, srsBonus: p.srs_bonus })) },
      canonicalRows: rows, serverEvents: events,
    });
  } catch (_) { fail('invalid_typing_evidence'); }
  if (state.completedCount !== round.completed_count || state.skipCount !== round.skip_count
      || state.consumedPromptCount + 1 !== round.current_prompt_ordinal
      || state.complete !== (round.status === 'completed')) fail('invalid_typing_evidence');
  const prompt = state.complete ? null : prompts[state.currentPromptIndex];
  // No canonical answers, future queue, raw events or future Golden/SRS flags
  // cross the HTTP boundary. Only the current prompt identity/Golden is public.
  return { checkpoint: state, current_prompt: prompt ? {
    ordinal: prompt.prompt_ordinal, content_ref: prompt.content_ref, golden: prompt.golden,
  } : null };
}

async function eventHash(userId, event) {
  const bytes = new TextEncoder().encode(JSON.stringify({ userId, ...event }));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

// user must come from the entrypoint's verified auth.getUser(), never the body.
export async function handleTypingRoundAction({ admin, user, body, enabled = TYPING_ROUND_ACTIONS_ENABLED }) {
  if (!enabled) return { status: 404, body: { error: 'feature_disabled' } };
  let event;
  let writeAttempted = false;
  let writeConfirmed = false;
  try {
    const userId = uuid(user?.id, 'unauthorized', 401);
    event = request(body);
    const signal = AbortSignal.timeout(TIMEOUT_MS);
    let committed = null;
    if (event.action === 'typing_round_event') {
      writeAttempted = true;
      committed = rpcResult(await resultOf(admin.rpc('phase1_typing_round_append_event', {
        p_operation_id: event.operationId, p_user_id: userId,
        p_request_hash: await eventHash(userId, event), p_round_id: event.roundId,
        p_expected_sequence: event.sequence, p_prompt_ordinal: event.promptOrdinal,
        p_event_type: event.type, p_answer: event.answer,
      }), signal));
      writeConfirmed = true;
      if (committed.operation_id !== event.operationId || committed.round_id !== event.roundId
          || typeof committed.idempotent !== 'boolean') fail('invalid_typing_evidence');
    }
    const verified = await loadTypingRoundCheckpoint({ admin, userId, roundId: event.roundId, signal });
    if (committed && verified.checkpoint.stateVersion < event.sequence) fail('invalid_typing_evidence');
    return { status: 200, body: { ok: true, ...verified,
      ...(committed ? { operation_id: event.operationId, idempotent: committed.idempotent } : {}) } };
  } catch (error) {
    const status = error?.typingBridgeError === true ? error.status : 503;
    const code = error?.typingBridgeError === true ? error.code : 'typing_round_unavailable';
    return { status, body: { error: code,
      ...(writeAttempted && (status >= 500 || writeConfirmed)
        ? { operation_id: event.operationId, retry_same_operation: true,
          ...(writeConfirmed ? { event_committed: true } : {}) } : {}) } };
  }
}
