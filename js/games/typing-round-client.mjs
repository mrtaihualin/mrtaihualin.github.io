// Inactive, existing-round adapter. No UI, content loading, Auth, round issuance,
// cross-round Combo or partial-character resume is activated by this module.
// The caller supplies a verified session's opaque owner context and a transport
// bound to that context. scopeId/contextToken are fencing labels, NOT role claims
// or authorization. Use a stable, random non-PII scopeId per owner; never a user
// identifier or credential. contextToken is memory-only and must change when the
// verified session changes. The server remains the sole authorization authority.
//
// transport(request, { ownerContext }) -> Promise<{ status, body }>.
// storage implements synchronous getItem/setItem/removeItem. Its sole record is
// the pending primitive request (including the user's submitted answer when
// completed), never a checkpoint, canonical answer, queue, score or credential.
// The caller must await every event before rendering confirmed progress. Only
// checkpoint/currentPrompt returned by the server may update confirmed UI; the
// canonical game-content owner still supplies display content by current ref.
// The integration must assign one active writer per scope (e.g. a browser lock);
// synchronous storage is not a cross-tab compare-and-swap primitive. Detect an
// already present different operation rather than overwriting its retry record.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SCOPE = /^[A-Za-z0-9_-]{8,128}$/;
const TYPES = ['wrong', 'hint_opened', 'completed', 'skipped'];
const PREFIX = 'typing-round-pending:v1:';
const CHECKPOINT_KEYS = ['version', 'serverVerified', 'game', 'difficulty', 'roundId',
  'stateVersion', 'confirmedThroughOperationId', 'targetCompleted', 'confirmedEventCount',
  'consumedPromptCount', 'currentPromptIndex', 'currentWrongCount', 'currentGuide',
  'completedCount', 'skipCount', 'hadGuide', 'cleanCount', 'combo', 'maxCombo', 'complete',
  'perfectEligible', 'scoreBeforeRoundBonus', 'roundBonus', 'confirmedScore', 'finalScore', 'confirmedItems'];
const ITEM_KEYS = ['operationId', 'contentRef', 'outcome', 'completedOrdinal', 'wrong', 'guide',
  'quota', 'clean', 'combo', 'goldenAwarded', 'srsBonusAwarded', 'baseScore', 'awardedScore'];
const copy = (value) => value == null ? value : JSON.parse(JSON.stringify(value));
const integer = (value, min = 0) => Number.isSafeInteger(value) && value >= min;
const fail = (code) => { throw Object.assign(new Error(code), { code }); };
const keys = (value, allowed) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).every((key) => allowed.includes(key));
const id = (value) => typeof value === 'string' && UUID.test(value);
const ref = (value) => keys(value, ['source', 'key']) && value.source === 'game_words'
  && typeof value.key === 'string' && value.key.length > 0 && value.key.trim() === value.key;
const fraction = (value) => keys(value, ['numerator', 'denominator', 'decimal'])
  && integer(value.numerator) && integer(value.denominator, 1)
  && value.decimal === value.numerator / value.denominator;

function validateEvent(value) {
  if (!keys(value, ['type', 'answer']) || !TYPES.includes(value.type)) fail('invalid_event');
  if (value.type === 'completed') {
    if (typeof value.answer !== 'string' || !value.answer || value.answer.trim() !== value.answer
        || [...value.answer].length > 512) fail('invalid_answer');
  } else if (Object.hasOwn(value, 'answer')) fail('unexpected_answer');
}

function validateRequest(value) {
  if (!keys(value, ['action', 'round_id', 'operation_id', 'expected_sequence', 'prompt_ordinal', 'type', 'answer'])
      || value.action !== 'typing_round_event' || !id(value.round_id) || !id(value.operation_id)
      || !integer(value.expected_sequence, 1) || !integer(value.prompt_ordinal, 1)) fail('invalid_journal');
  validateEvent({ type: value.type, ...(Object.hasOwn(value, 'answer') ? { answer: value.answer } : {}) });
}

function verifiedResponse(body, roundId, previous, pending) {
  const cp = body?.checkpoint;
  const prompt = body?.current_prompt;
  if (!keys(body, ['ok', 'checkpoint', 'current_prompt', 'operation_id', 'idempotent']) || body.ok !== true
      || !keys(cp, CHECKPOINT_KEYS) || cp.version !== 'typing-resume-checkpoint-v1'
      || cp.serverVerified !== true || cp.game !== 'typing' || !['初', '中'].includes(cp.difficulty)
      || !id(cp.roundId) || (roundId && cp.roundId !== roundId)
      || !integer(cp.stateVersion) || cp.confirmedEventCount !== cp.stateVersion
      || cp.targetCompleted !== 5 || !integer(cp.completedCount) || cp.completedCount > 5
      || !integer(cp.skipCount) || cp.consumedPromptCount !== cp.completedCount + cp.skipCount
      || cp.complete !== (cp.completedCount === 5)
      || cp.currentPromptIndex !== (cp.complete ? null : cp.consumedPromptCount)
      || !['currentWrongCount', 'cleanCount', 'combo', 'maxCombo'].every((k) => integer(cp[k]))
      || !['currentGuide', 'hadGuide', 'perfectEligible'].every((k) => typeof cp[k] === 'boolean')
      || cp.cleanCount > cp.completedCount || cp.maxCombo < cp.combo
      || (cp.stateVersion === 0 ? cp.confirmedThroughOperationId !== null : !id(cp.confirmedThroughOperationId))
      || !fraction(cp.scoreBeforeRoundBonus) || !fraction(cp.confirmedScore)
      || !keys(cp.roundBonus, ['completion', 'perfect', 'total'])
      || ![0, 20].includes(cp.roundBonus.completion) || ![0, 50].includes(cp.roundBonus.perfect)
      || cp.roundBonus.total !== cp.roundBonus.completion + cp.roundBonus.perfect
      || (cp.complete ? !integer(cp.finalScore) : cp.finalScore !== null)
      || !Array.isArray(cp.confirmedItems) || cp.confirmedItems.length !== cp.consumedPromptCount) fail('invalid_checkpoint');
  for (const item of cp.confirmedItems) {
    if (!keys(item, ITEM_KEYS) || !id(item.operationId) || !ref(item.contentRef)
        || !['completed', 'skipped'].includes(item.outcome) || !integer(item.combo)
        || !fraction(item.awardedScore)
        || (item.outcome === 'skipped' ? item.completedOrdinal !== null : !integer(item.completedOrdinal, 1))
        || ['wrong', 'quota'].some((key) => Object.hasOwn(item, key) && !integer(item[key]))
        || ['guide', 'clean', 'goldenAwarded', 'srsBonusAwarded'].some((key) => Object.hasOwn(item, key) && typeof item[key] !== 'boolean')
        || (Object.hasOwn(item, 'baseScore') && !fraction(item.baseScore))) fail('invalid_checkpoint');
  }
  if (cp.complete ? prompt !== null : (!keys(prompt, ['ordinal', 'content_ref', 'golden'])
      || prompt.ordinal !== cp.currentPromptIndex + 1 || !ref(prompt.content_ref)
      || typeof prompt.golden !== 'boolean')) fail('invalid_checkpoint');
  if (previous && (cp.roundId !== previous.roundId || cp.difficulty !== previous.difficulty
      || cp.stateVersion < previous.stateVersion || cp.completedCount < previous.completedCount
      || cp.skipCount < previous.skipCount
      || (cp.stateVersion === previous.stateVersion && JSON.stringify(cp) !== JSON.stringify(previous)))) fail('checkpoint_conflict');
  if (pending && (body.operation_id !== pending.operation_id || typeof body.idempotent !== 'boolean'
      || cp.stateVersion < pending.expected_sequence
      || (cp.stateVersion === pending.expected_sequence && cp.confirmedThroughOperationId !== pending.operation_id))) fail('operation_conflict');
  return { checkpoint: copy(cp), currentPrompt: copy(prompt) };
}

export function createTypingRoundClient({ transport, storage, createOperationId = () => globalThis.crypto.randomUUID() }) {
  if (typeof transport !== 'function' || typeof createOperationId !== 'function'
      || !['getItem', 'setItem', 'removeItem'].every((key) => typeof storage?.[key] === 'function')) fail('invalid_client_options');
  let owner = null;
  let generation = 0;
  let tail = Promise.resolve();
  let pending = null;
  let checkpoint = null;
  let currentPrompt = null;
  let status = 'signed_out';
  let error = null;

  function getState() {
    return copy({ status, checkpoint, currentPrompt, pendingOperationId: pending?.operation_id ?? null, error });
  }
  function fence(epoch) {
    if (!owner || epoch !== generation) fail('owner_changed');
  }
  function enqueue(work) {
    const epoch = generation;
    const result = tail.then(() => { fence(epoch); return work(epoch); });
    tail = result.catch(() => {});
    return result;
  }
  function journal() {
    try {
      const serialized = JSON.stringify({ version: 1, scopeId: owner.scopeId, request: pending });
      const existing = storage.getItem(PREFIX + owner.scopeId);
      if (existing != null && existing !== serialized) fail('journal_conflict');
      storage.setItem(PREFIX + owner.scopeId, serialized);
    } catch (cause) {
      status = 'blocked'; error = cause.code === 'journal_conflict' ? cause.code : 'persistence_unavailable'; fail(error);
    }
  }
  function clearPending() {
    try {
      const expected = JSON.stringify({ version: 1, scopeId: owner.scopeId, request: pending });
      if (storage.getItem(PREFIX + owner.scopeId) !== expected) fail('journal_conflict');
      storage.removeItem(PREFIX + owner.scopeId);
    } catch (cause) { status = 'retry_pending'; error = cause.code === 'journal_conflict' ? cause.code : 'persistence_unavailable'; fail(error); }
    pending = null;
  }
  function setOwner(context) {
    if (context !== null && (!keys(context, ['scopeId', 'contextToken']) || typeof context.scopeId !== 'string' || !SCOPE.test(context.scopeId)
        || typeof context.contextToken !== 'string' || !context.contextToken)) fail('invalid_owner_context');
    generation += 1;
    owner = context ? Object.freeze({ ...context }) : null;
    tail = Promise.resolve();
    pending = null; checkpoint = null; currentPrompt = null; error = null;
    status = owner ? 'needs_resume' : 'signed_out';
    if (owner) {
      try {
        const raw = storage.getItem(PREFIX + owner.scopeId);
        if (raw !== null && raw !== undefined) {
          const record = JSON.parse(raw);
          if (!keys(record, ['version', 'scopeId', 'request']) || record.version !== 1
              || record.scopeId !== owner.scopeId) fail('invalid_journal');
          validateRequest(record.request);
          pending = copy(record.request);
          status = 'retry_pending';
        }
      } catch (_) { status = 'blocked'; error = 'invalid_journal'; }
    }
    return getState();
  }
  async function exchange(request, epoch) {
    fence(epoch);
    const write = request.action === 'typing_round_event';
    if (write) journal(); // No transport until the exact operation is durable.
    status = write ? 'sending' : 'resuming'; error = null;
    let response;
    try { response = await transport(copy(request), { ownerContext: owner }); }
    catch (_) {
      fence(epoch);
      status = write ? 'retry_pending' : 'needs_resume'; error = 'transport_unavailable'; fail(error);
    }
    fence(epoch); // A late old-owner response must never read/write new state.
    const body = response?.body;
    if (!integer(response?.status, 100) || response.status > 599 || !body || typeof body !== 'object') {
      status = 'blocked'; error = 'invalid_response'; fail(error);
    }
    if (response.status !== 200 || body.ok !== true) {
      const uncertain = write && (response.status >= 500 || body.retry_same_operation === true);
      if (uncertain && body.operation_id && body.operation_id !== request.operation_id) {
        status = 'blocked'; error = 'operation_conflict'; fail(error);
      }
      // Even a definite rejection keeps the identity until an authoritative
      // success. A reserve refill may make this same operation retryable later.
      status = uncertain ? 'retry_pending' : write ? 'blocked' : 'needs_resume';
      // Do not propagate arbitrary response text or possible private values.
      error = typeof body.error === 'string' && /^[a-z_]{1,80}$/.test(body.error) ? body.error : 'request_failed';
      fail(error);
    }
    let verified;
    try { verified = verifiedResponse(body, request.round_id, checkpoint, write ? request : null); }
    catch (cause) { status = 'blocked'; error = cause.code; throw cause; }
    if (write) clearPending();
    checkpoint = verified.checkpoint; currentPrompt = verified.currentPrompt;
    status = checkpoint.complete ? 'complete' : 'ready'; error = null;
    return getState();
  }
  function resume(roundId) {
    return enqueue((epoch) => {
      if (status === 'blocked' && !pending) fail(error || 'client_blocked');
      if (roundId !== undefined && !id(roundId)) fail('invalid_round_id');
      const selected = roundId?.toLowerCase() || checkpoint?.roundId || pending?.round_id;
      if ((pending && selected !== pending.round_id) || (checkpoint && selected !== checkpoint.roundId)) fail('round_conflict');
      if (pending) return exchange(pending, epoch);
      return exchange({ action: 'typing_round_resume', ...(selected ? { round_id: selected } : {}) }, epoch);
    });
  }
  function sendEvent(event) {
    let submitted;
    try { validateEvent(event); submitted = copy(event); }
    catch (cause) { return Promise.reject(cause); }
    const intendedRound = checkpoint?.roundId;
    const intendedOrdinal = currentPrompt?.ordinal;
    return enqueue((epoch) => {
      if (pending) fail('pending_operation');
      if (status !== 'ready' || !checkpoint || !currentPrompt) fail('resume_required');
      if (checkpoint.roundId !== intendedRound || currentPrompt.ordinal !== intendedOrdinal) fail('stale_prompt');
      const operationId = createOperationId();
      if (!id(operationId)) fail('invalid_operation_id');
      pending = { action: 'typing_round_event', round_id: checkpoint.roundId, operation_id: operationId.toLowerCase(),
        expected_sequence: checkpoint.stateVersion + 1, prompt_ordinal: currentPrompt.ordinal, ...submitted };
      return exchange(pending, epoch);
    });
  }
  function retryPending() {
    return enqueue((epoch) => {
      if (!pending) fail('no_pending_operation');
      return exchange(pending, epoch);
    });
  }
  return Object.freeze({ setOwner, resume, sendEvent, retryPending, getState });
}
