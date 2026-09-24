import { createTypingRoundClient } from './typing-round-client.mjs';
import {
  TYPING_ROUND_BROWSER_ENABLED,
  createTypingRoundBrowserSession,
} from './typing-round-browser-session.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SCOPE_KEY = 'typing_round_scope_v1';
const START_PREFIX = 'typing-round-start:v1:';
const REFILL_PREFIX = 'typing-round-refill:v1:';
const LEVEL_NUMBER = Object.freeze({ '初': 1, '中': 2 });
const copy = (value) => value == null ? value : JSON.parse(JSON.stringify(value));
const fail = (code) => { throw Object.assign(new Error(code), { code }); };

let activeOwner = null;
let authWired = false;
let authWait = null;
let session = null;

function supabaseClient() {
  const cfg = globalThis.SUPABASE_CONFIG || {};
  if (!cfg.url || !cfg.anonKey || !globalThis.supabase?.createClient) fail('typing_transport_unavailable');
  return globalThis.getSupabaseClient
    ? globalThis.getSupabaseClient()
    : globalThis.supabase.createClient(cfg.url, cfg.anonKey);
}

function currentAuth() {
  const auth = globalThis.SITE_AUTH;
  const user = auth?.user;
  if (!auth?.authResolved || !user?.id) return null;
  return { userId: String(user.id), epoch: Number(auth.learningOwnerEpoch) || 0 };
}

function ownerStillCurrent(context = activeOwner) {
  const current = currentAuth();
  if (!context || !current || current.userId !== context.userId || current.epoch !== context.epoch) return false;
  try {
    return globalThis.PHASE1_ACCOUNT_BOUNDARY
      && localStorage.getItem(globalThis.PHASE1_ACCOUNT_BOUNDARY.ownerKey) === current.userId;
  } catch (_) { return false; }
}

function wireAuth() {
  if (authWired || !globalThis.SITE_AUTH?.onChange) return;
  authWired = true;
  globalThis.SITE_AUTH.onChange(() => {
    if (activeOwner && !ownerStillCurrent()) {
      const old = session;
      activeOwner = null;
      session = null;
      if (old) old.stop().catch(() => {});
      globalThis.dispatchEvent?.(new CustomEvent('typing-round-owner-change'));
    }
  });
}

function waitForAuth() {
  wireAuth();
  if (globalThis.SITE_AUTH?.authResolved) return Promise.resolve(currentAuth());
  if (authWait) return authWait;
  authWait = new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done || !globalThis.SITE_AUTH?.authResolved) return;
      done = true;
      clearInterval(poll);
      resolve(currentAuth());
    };
    const poll = setInterval(() => { wireAuth(); finish(); }, 50);
    setTimeout(() => {
      if (done) return;
      done = true;
      clearInterval(poll);
      resolve(currentAuth());
    }, 8000);
    finish();
  }).finally(() => { authWait = null; });
  return authWait;
}

function scopeId() {
  let value;
  try { value = localStorage.getItem(SCOPE_KEY); } catch (_) { fail('persistence_unavailable'); }
  if (typeof value === 'string' && /^[A-Za-z0-9_-]{8,128}$/.test(value)) return value;
  value = 'scope_' + crypto.randomUUID().replaceAll('-', '');
  try { localStorage.setItem(SCOPE_KEY, value); } catch (_) { fail('persistence_unavailable'); }
  return value;
}

async function errorBody(error) {
  const response = error?.context;
  if (!response || typeof response.clone !== 'function') return { error: 'request_failed' };
  try {
    const body = await response.clone().json();
    return body && typeof body === 'object' ? body : { error: 'request_failed' };
  } catch (_) { return { error: 'request_failed' }; }
}

async function transport(request, { ownerContext } = {}) {
  if (!activeOwner || ownerContext?.contextToken !== activeOwner.contextToken || !ownerStillCurrent()) {
    fail('owner_changed');
  }
  const result = await supabaseClient().functions.invoke('score-submit', { body: copy(request) });
  if (!ownerStillCurrent() || ownerContext?.contextToken !== activeOwner?.contextToken) fail('owner_changed');
  if (!result?.error) return { status: 200, body: result?.data };
  const status = Number(result.error?.context?.status) || 503;
  return { status, body: await errorBody(result.error) };
}

function readOperation(key, shape) {
  let raw;
  try { raw = localStorage.getItem(key); } catch (_) { fail('persistence_unavailable'); }
  if (raw == null) return null;
  try {
    const value = JSON.parse(raw);
    if (!shape(value)) fail('invalid_operation_journal');
    return value;
  } catch (error) {
    fail(error?.code === 'invalid_operation_journal' ? error.code : 'invalid_operation_journal');
  }
}

function writeOperation(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); }
  catch (_) { fail('persistence_unavailable'); }
}

function removeOperation(key) {
  try { localStorage.removeItem(key); }
  catch (_) { fail('persistence_unavailable'); }
}

function pendingRoundId(scope) {
  const record = readOperation('typing-round-pending:v1:' + scope, (value) => value
    && value.version === 1 && value.scopeId === scope && value.request?.action === 'typing_round_event'
    && typeof value.request.round_id === 'string' && UUID.test(value.request.round_id));
  return record?.request?.round_id?.toLowerCase() || null;
}

async function ensureStarted(level) {
  const key = START_PREFIX + activeOwner.scopeId;
  let record = readOperation(key, (value) => value && Object.keys(value).length === 2
    && value.level === level && typeof value.operationId === 'string' && UUID.test(value.operationId));
  if (!record) {
    record = { level, operationId: crypto.randomUUID().toLowerCase() };
    writeOperation(key, record);
  }
  const response = await transport({ action: 'typing_round_start', operation_id: record.operationId,
    level: LEVEL_NUMBER[level] }, { ownerContext: activeOwner });
  if (response.status === 409 && response.body?.error === 'active_round_exists') {
    removeOperation(key);
    return session.resume();
  }
  if (response.status !== 200 || response.body?.ok !== true
      || response.body.operation_id !== record.operationId || !UUID.test(response.body?.checkpoint?.roundId || '')) {
    const error = typeof response.body?.error === 'string' ? response.body.error : 'typing_round_unavailable';
    fail(error);
  }
  removeOperation(key);
  return session.resume(response.body.checkpoint.roundId);
}

async function refillAndRetry(roundId) {
  const key = REFILL_PREFIX + activeOwner.scopeId + ':' + roundId;
  let record = readOperation(key, (value) => value && Object.keys(value).length === 1
    && typeof value.batchId === 'string' && UUID.test(value.batchId));
  if (!record) {
    record = { batchId: crypto.randomUUID().toLowerCase() };
    writeOperation(key, record);
  }
  const response = await transport({ action: 'typing_round_refill', round_id: roundId,
    batch_id: record.batchId }, { ownerContext: activeOwner });
  if (response.status !== 200 || response.body?.ok !== true
      || response.body.batch_id !== record.batchId || response.body.round_id !== roundId) {
    const error = typeof response.body?.error === 'string' ? response.body.error : 'typing_refill_unavailable';
    fail(error);
  }
  removeOperation(key);
  return session.retryPending();
}

async function activate(level) {
  if (!TYPING_ROUND_BROWSER_ENABLED || !Object.hasOwn(LEVEL_NUMBER, level)) fail('typing_round_ineligible');
  const auth = await waitForAuth();
  if (!auth) fail('typing_round_signed_out');
  if (session) await stop();
  globalThis.PHASE1_ACCOUNT_BOUNDARY?.bind?.(globalThis.SITE_AUTH.user);
  const context = { ...auth, scopeId: scopeId(), contextToken: crypto.randomUUID() };
  activeOwner = context;
  const roundClient = createTypingRoundClient({ transport, storage: localStorage });
  session = createTypingRoundBrowserSession({ roundClient, storage: localStorage });
  try {
    await session.start({ scopeId: context.scopeId, contextToken: context.contextToken });
    try {
      const resumed = await session.resume();
      if (resumed.status === 'ready' || resumed.status === 'complete') return resumed;
    } catch (error) {
      if (error?.code === 'typing_reserve_exhausted') {
        const roundId = pendingRoundId(context.scopeId);
        if (!roundId) throw error;
        return await refillAndRetry(roundId);
      }
      if (!['round_not_found', 'needs_resume'].includes(error?.code)) throw error;
    }
    return await ensureStarted(level);
  } catch (error) {
    const old = session;
    session = null;
    activeOwner = null;
    if (old) await old.stop().catch(() => {});
    throw error;
  }
}

async function sendEvent(event) {
  if (!session || !ownerStillCurrent()) fail('owner_changed');
  try { return await session.sendEvent(event); }
  catch (error) {
    if (error?.code !== 'typing_reserve_exhausted') throw error;
    const roundId = session.getState()?.checkpoint?.roundId;
    if (!UUID.test(roundId || '')) throw error;
    return refillAndRetry(roundId);
  }
}

async function stop() {
  const old = session;
  session = null;
  activeOwner = null;
  if (old) await old.stop();
}

function getState() { return session ? session.getState() : null; }
function savePartial(position) { if (!session) fail('writer_required'); return session.savePartial(position); }
function restorePartial(maximumPosition) {
  if (!session) fail('writer_required');
  return session.restorePartial(maximumPosition);
}

globalThis.TYPING_ROUND_LIVE = Object.freeze({
  enabled: TYPING_ROUND_BROWSER_ENABLED,
  ready: waitForAuth,
  eligible(level) { return Object.hasOwn(LEVEL_NUMBER, level) && Boolean(currentAuth()); },
  activate,
  stop,
  sendEvent,
  savePartial,
  restorePartial,
  getState,
});
