// Browser-adoption boundary for protected Typing Initial/Middle rounds.
// The caller must supply the already owner-bound round client. Server checkpoints
// remain authoritative; the only local Resume datum is the number of confirmed
// correct UTF-16 code units already accepted for the current prompt. No answer,
// canonical target, queue, score, credential or user identifier is persisted;
// scopeId is only the caller-provided random non-PII storage/lock partition.
//
// One Web Lock is held for the whole owner session. There is no unsafe fallback:
// if Web Locks are unavailable or another same-scope tab owns the lock, protected
// play must stay inactive. Server CAS still fences other devices and sessions.

export const TYPING_ROUND_BROWSER_ENABLED = true;

const SCOPE = /^[A-Za-z0-9_-]{8,128}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DRAFT_PREFIX = 'typing-round-draft:v1:';
const LOCK_PREFIX = 'typing-round-writer:v1:';
const DRAFT_KEYS = ['version', 'scopeId', 'roundId', 'stateVersion', 'promptOrdinal', 'contentRef', 'position'];
const REF_KEYS = ['source', 'key'];
const copy = (value) => value == null ? value : JSON.parse(JSON.stringify(value));
const integer = (value, min = 0) => Number.isSafeInteger(value) && value >= min;
const fail = (code) => { throw Object.assign(new Error(code), { code }); };
const exact = (value, allowed) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).every((key) => allowed.includes(key));
const sameRef = (a, b) => a?.source === b?.source && a?.key === b?.key;

function validRef(value) {
  return exact(value, REF_KEYS) && value.source === 'game_words'
    && typeof value.key === 'string' && value.key.length > 0 && value.key.trim() === value.key;
}

function ownerContext(value) {
  if (!exact(value, ['scopeId', 'contextToken']) || typeof value.scopeId !== 'string'
      || !SCOPE.test(value.scopeId) || typeof value.contextToken !== 'string' || !value.contextToken) {
    fail('invalid_owner_context');
  }
  return Object.freeze({ ...value });
}

function clientState(roundClient) {
  const state = roundClient.getState();
  if (!state || typeof state !== 'object' || Array.isArray(state)) fail('invalid_client_state');
  return state;
}

function currentIdentity(state) {
  const checkpoint = state.checkpoint;
  const prompt = state.currentPrompt;
  if (state.status !== 'ready' || !checkpoint || !prompt || !UUID.test(checkpoint.roundId)
      || !integer(checkpoint.stateVersion) || !integer(prompt.ordinal, 1) || !validRef(prompt.content_ref)) {
    fail('round_not_ready');
  }
  return { roundId: checkpoint.roundId.toLowerCase(), stateVersion: checkpoint.stateVersion,
    promptOrdinal: prompt.ordinal, contentRef: copy(prompt.content_ref) };
}

function validDraft(value, scopeId) {
  return exact(value, DRAFT_KEYS) && value.version === 1 && value.scopeId === scopeId
    && UUID.test(value.roundId) && integer(value.stateVersion) && integer(value.promptOrdinal, 1)
    && validRef(value.contentRef) && integer(value.position) && value.position <= 512;
}

export function createTypingRoundBrowserSession({ roundClient, storage, locks = globalThis.navigator?.locks } = {}) {
  if (!roundClient || !['setOwner', 'resume', 'sendEvent', 'retryPending', 'getState']
    .every((key) => typeof roundClient[key] === 'function')
      || !storage || !['getItem', 'setItem', 'removeItem'].every((key) => typeof storage[key] === 'function')) {
    fail('invalid_browser_session_options');
  }

  let owner = null;
  let writer = null;
  let generation = 0;
  let operation = null;
  let lifecycle = Promise.resolve();

  function draftKey(scopeId = owner?.scopeId) { return DRAFT_PREFIX + scopeId; }
  function requireWriter(epoch = generation) {
    if (!owner || !writer || writer.epoch !== epoch || epoch !== generation) fail('writer_required');
  }
  function beginOperation(kind) {
    requireWriter();
    if (operation) fail('browser_operation_pending');
    operation = { kind, epoch: generation };
    return generation;
  }
  function finishOperation(epoch) {
    if (operation?.epoch === epoch) operation = null;
  }
  function requireIdle() {
    requireWriter();
    if (operation) fail('browser_operation_pending');
  }
  function removeDraft() {
    requireWriter();
    try { storage.removeItem(draftKey()); }
    catch (_) { fail('persistence_unavailable'); }
  }
  function readDraft() {
    requireWriter();
    let raw;
    try { raw = storage.getItem(draftKey()); }
    catch (_) { fail('persistence_unavailable'); }
    if (raw == null) return null;
    try {
      const value = JSON.parse(raw);
      if (!validDraft(value, owner.scopeId)) fail('invalid_partial_resume');
      return value;
    } catch (error) {
      try { storage.removeItem(draftKey()); } catch (_) { fail('persistence_unavailable'); }
      fail(error?.code === 'invalid_partial_resume' ? error.code : 'invalid_partial_resume');
    }
  }
  function compatibleDraft(state, maximumPosition) {
    const draft = readDraft();
    if (!draft) return null;
    // Transient/retry states are not authority to destroy a valid local draft.
    // Only a confirmed completed checkpoint or a confirmed ready prompt can
    // prove that the record is stale.
    if (state?.status === 'complete' && state.checkpoint?.complete === true) {
      removeDraft();
      return null;
    }
    if (state?.status !== 'ready') fail('round_not_ready');
    const current = currentIdentity(state);
    if (draft.roundId !== current.roundId || draft.promptOrdinal !== current.promptOrdinal
        || !sameRef(draft.contentRef, current.contentRef) || draft.stateVersion > current.stateVersion
        || (maximumPosition !== undefined && (!integer(maximumPosition) || draft.position > maximumPosition))) {
      removeDraft();
      return null;
    }
    return draft;
  }
  function rebaseOrClear(state) {
    const draft = compatibleDraft(state);
    if (!draft) return;
    const current = currentIdentity(state);
    if (draft.stateVersion === current.stateVersion) return;
    const next = { ...draft, stateVersion: current.stateVersion };
    try { storage.setItem(draftKey(), JSON.stringify(next)); }
    catch (_) { fail('persistence_unavailable'); }
  }
  async function stopInternal() {
    generation += 1;
    operation = null;
    const previous = writer;
    writer = null;
    owner = null;
    roundClient.setOwner(null);
    if (previous) {
      previous.release();
      try { await previous.request; } catch (_) {}
    }
  }
  function lifecycleTransition(work) {
    const result = lifecycle.then(work);
    lifecycle = result.catch(() => {});
    return result;
  }
  function stop() {
    return lifecycleTransition(stopInternal);
  }
  function start(context) {
    return lifecycleTransition(async () => {
    const selected = ownerContext(context);
    await stopInternal();
    if (!locks || typeof locks.request !== 'function') fail('writer_coordination_unavailable');
    const epoch = generation;
    let release;
    let settle;
    let settled = false;
    let lockError = null;
    const acquired = new Promise((resolve, reject) => { settle = { resolve, reject }; });
    const hold = new Promise((resolve) => { release = resolve; });
    const done = (method, value) => {
      if (!settled) { settled = true; settle[method](value); }
    };
    const request = Promise.resolve().then(() => locks.request(LOCK_PREFIX + selected.scopeId,
      { mode: 'exclusive', ifAvailable: true }, async (lock) => {
        if (!lock || epoch !== generation) { done('resolve', false); return; }
        writer = { epoch, release, request: null };
        owner = selected;
        roundClient.setOwner(selected);
        done('resolve', true);
        await hold;
      })).catch((error) => { lockError = error; done('resolve', false); });
    const ok = await acquired;
    if (!ok) {
      try { await request; } catch (_) {}
      if (lockError) fail('writer_coordination_unavailable');
      fail('writer_busy');
    }
    if (!writer || writer.epoch !== epoch) fail('writer_coordination_unavailable');
    writer.request = request;
    // A corrupt local draft cannot silently downgrade exact Resume.
    try { readDraft(); }
    catch (error) { await stopInternal(); throw error; }
    return getState();
    });
  }
  function getState() {
    const state = clientState(roundClient);
    return copy({ ...state, writer: Boolean(owner && writer), scopeId: owner?.scopeId ?? null });
  }
  async function resume(roundId) {
    const epoch = beginOperation('resume');
    try {
      const result = await roundClient.resume(roundId);
      requireWriter(epoch);
      rebaseOrClear(result);
      return getState();
    } finally { finishOperation(epoch); }
  }
  function savePartial(position) {
    requireIdle();
    if (!integer(position) || position > 512) fail('invalid_partial_position');
    const current = currentIdentity(clientState(roundClient));
    if (position === 0) { removeDraft(); return getState(); }
    const record = { version: 1, scopeId: owner.scopeId, ...current, position };
    let existing;
    try { existing = storage.getItem(draftKey()); }
    catch (_) { fail('persistence_unavailable'); }
    if (existing != null) {
      let prior;
      try { prior = JSON.parse(existing); } catch (_) { fail('invalid_partial_resume'); }
      if (!validDraft(prior, owner.scopeId)
          || (prior.roundId === record.roundId && prior.promptOrdinal === record.promptOrdinal
            && !sameRef(prior.contentRef, record.contentRef))) fail('partial_resume_conflict');
    }
    try { storage.setItem(draftKey(), JSON.stringify(record)); }
    catch (_) { fail('persistence_unavailable'); }
    return getState();
  }
  function restorePartial(maximumPosition) {
    requireIdle();
    if (!integer(maximumPosition) || maximumPosition > 512) fail('invalid_partial_position');
    return compatibleDraft(clientState(roundClient), maximumPosition)?.position ?? 0;
  }
  async function sendEvent(event) {
    const epoch = beginOperation('event');
    try {
      const result = await roundClient.sendEvent(event);
      requireWriter(epoch);
      rebaseOrClear(result);
      return getState();
    } finally { finishOperation(epoch); }
  }
  async function retryPending() {
    const epoch = beginOperation('retry');
    try {
      const result = await roundClient.retryPending();
      requireWriter(epoch);
      rebaseOrClear(result);
      return getState();
    } finally { finishOperation(epoch); }
  }

  return Object.freeze({ start, stop, resume, savePartial, restorePartial, sendEvent, retryPending, getState });
}
