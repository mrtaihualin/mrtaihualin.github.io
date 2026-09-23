#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  TYPING_ROUND_BROWSER_ENABLED,
  createTypingRoundBrowserSession,
} from '../js/games/typing-round-browser-session.mjs';
import {
  TYPING_ROUND_CONTROL_RATE,
  TYPING_ROUND_EVENT_RATE,
  typingRoundRateArgs,
} from '../supabase/functions/score-submit/typing-round-rate-policy.mjs';

const ROUND = '10000000-0000-4000-8000-000000000001';
const owner = { scopeId: 'synthetic_scope_a', contextToken: 'session-a' };
const other = { scopeId: 'synthetic_scope_b', contextToken: 'session-b' };
const ref = (n) => ({ source: 'game_words', key: `synthetic-${n}` });
const clone = (value) => value == null ? value : JSON.parse(JSON.stringify(value));
const rejection = (promise, code) => assert.rejects(promise, (error) => error?.code === code);

function memoryStorage() {
  const records = new Map();
  return { records, getItem: (key) => records.get(key) ?? null,
    setItem: (key, value) => records.set(key, value), removeItem: (key) => records.delete(key) };
}

function lockManager() {
  const held = new Set();
  return {
    held,
    async request(name, options, callback) {
      assert.deepEqual(options, { mode: 'exclusive', ifAvailable: true });
      if (held.has(name)) return callback(null);
      held.add(name);
      try { return await callback({ name, mode: 'exclusive' }); }
      finally { held.delete(name); }
    },
  };
}

function roundClient() {
  let state = { status: 'signed_out', checkpoint: null, currentPrompt: null,
    pendingOperationId: null, error: null };
  let ownerContext = null;
  let failNext = null;
  const calls = [];
  const ready = () => {
    state = { ...state, status: 'ready', checkpoint: { roundId: ROUND, stateVersion: 0 },
      currentPrompt: { ordinal: 1, content_ref: ref(1), golden: false } };
  };
  return {
    calls,
    fail(code) { failNext = code; },
    setOwner(value) {
      calls.push(['owner', clone(value)]); ownerContext = value;
      state = value ? { status: 'needs_resume', checkpoint: null, currentPrompt: null,
        pendingOperationId: null, error: null } : { status: 'signed_out', checkpoint: null,
        currentPrompt: null, pendingOperationId: null, error: null };
      return clone(state);
    },
    async resume() {
      calls.push(['resume']);
      if (!ownerContext) throw Object.assign(new Error('owner_changed'), { code: 'owner_changed' });
      ready(); return clone(state);
    },
    async sendEvent(event) {
      calls.push(['event', clone(event)]);
      if (failNext) { const code = failNext; failNext = null; throw Object.assign(new Error(code), { code }); }
      state.checkpoint.stateVersion += 1;
      if (['completed', 'skipped'].includes(event.type)) {
        state.currentPrompt = { ordinal: state.currentPrompt.ordinal + 1,
          content_ref: ref(state.currentPrompt.ordinal + 1), golden: false };
      }
      return clone(state);
    },
    async retryPending() { calls.push(['retry']); return clone(state); },
    getState() { return clone(state); },
  };
}

let passed = 0;
async function test(name, work) {
  await work(); passed += 1; process.stdout.write(`PASS ${name}\n`);
}

await test('browser boundary is default OFF and has no live game import', () => {
  assert.equal(TYPING_ROUND_BROWSER_ENABLED, false);
  for (const file of ['typing-game.html', 'js/games/typing-game-app.js', 'js/games/typing-game-app.min.js']) {
    assert(!fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8').includes('typing-round-browser-session'));
  }
});

await test('writer lock is acquired before owner activation and held for the session', async () => {
  const locks = lockManager(); const storage = memoryStorage(); const client = roundClient();
  const session = createTypingRoundBrowserSession({ roundClient: client, storage, locks });
  const started = await session.start(owner);
  assert.equal(started.writer, true); assert.equal(started.scopeId, owner.scopeId);
  assert.equal(locks.held.size, 1);
  assert.deepEqual(client.calls.at(-1), ['owner', owner]);
  await session.stop(); assert.equal(locks.held.size, 0); assert.equal(session.getState().status, 'signed_out');
});

await test('second same-scope tab fails closed while a different scope may proceed', async () => {
  const locks = lockManager(); const storage = memoryStorage();
  const first = createTypingRoundBrowserSession({ roundClient: roundClient(), storage, locks });
  const secondClient = roundClient();
  const second = createTypingRoundBrowserSession({ roundClient: secondClient, storage, locks });
  const third = createTypingRoundBrowserSession({ roundClient: roundClient(), storage, locks });
  await first.start(owner);
  await rejection(second.start(owner), 'writer_busy');
  assert.equal(secondClient.calls.some(([kind, value]) => kind === 'owner' && value), false);
  await third.start(other); assert.equal(locks.held.size, 2);
  await Promise.all([first.stop(), third.stop()]);
});

await test('missing or failed Web Locks support never activates the client', async () => {
  for (const locks of [null, { request: async () => { throw new Error('denied'); } },
    { request() { throw new Error('sync denied'); } }]) {
    const client = roundClient();
    const session = createTypingRoundBrowserSession({ roundClient: client, storage: memoryStorage(), locks });
    await rejection(session.start(owner), 'writer_coordination_unavailable');
    assert.equal(client.calls.some(([kind, value]) => kind === 'owner' && value), false);
  }
});

await test('partial Resume stores position and prompt binding, never answer or credential', async () => {
  const storage = memoryStorage(); const client = roundClient();
  const session = createTypingRoundBrowserSession({ roundClient: client, storage, locks: lockManager() });
  await session.start(owner); await session.resume(); session.savePartial(3);
  const serialized = [...storage.records.values()][0]; const saved = JSON.parse(serialized);
  assert.equal(saved.position, 3); assert.equal(saved.promptOrdinal, 1); assert.deepEqual(saved.contentRef, ref(1));
  assert(!serialized.includes('session-a')); assert(!serialized.includes('answer')); assert(!serialized.includes('prefix'));
  assert.equal(session.restorePartial(7), 3);
  await session.stop();
});

await test('a fresh same-owner instance restores the exact partial position', async () => {
  const storage = memoryStorage(); const locks = lockManager();
  const first = createTypingRoundBrowserSession({ roundClient: roundClient(), storage, locks });
  await first.start(owner); await first.resume(); first.savePartial(4); await first.stop();
  const second = createTypingRoundBrowserSession({ roundClient: roundClient(), storage, locks });
  await second.start(owner); await second.resume(); assert.equal(second.restorePartial(8), 4);
  await second.stop();
});

await test('wrong or hint confirmation rebases the same prompt draft without losing it', async () => {
  const storage = memoryStorage(); const client = roundClient();
  const session = createTypingRoundBrowserSession({ roundClient: client, storage, locks: lockManager() });
  await session.start(owner); await session.resume(); session.savePartial(2);
  await session.sendEvent({ type: 'wrong' });
  assert.equal(session.restorePartial(10), 2);
  assert.equal(JSON.parse([...storage.records.values()][0]).stateVersion, 1);
  await session.stop();
});

await test('terminal confirmation clears stale partial only after server success', async () => {
  const storage = memoryStorage(); const client = roundClient();
  const session = createTypingRoundBrowserSession({ roundClient: client, storage, locks: lockManager() });
  await session.start(owner); await session.resume(); session.savePartial(5);
  client.fail('transport_unavailable');
  await rejection(session.sendEvent({ type: 'completed', answer: 'synthetic' }), 'transport_unavailable');
  assert.equal(storage.records.size, 1);
  await session.sendEvent({ type: 'completed', answer: 'synthetic' });
  assert.equal(storage.records.size, 0); assert.equal(session.restorePartial(10), 0);
  await session.stop();
});

await test('local partial input is blocked while a network operation is unresolved', async () => {
  const storage = memoryStorage(); const base = roundClient(); let release;
  const client = { ...base, async sendEvent(event) {
    await new Promise((resolve) => { release = resolve; });
    return base.sendEvent(event);
  } };
  const session = createTypingRoundBrowserSession({ roundClient: client, storage, locks: lockManager() });
  await session.start(owner); await session.resume(); session.savePartial(1);
  const sending = session.sendEvent({ type: 'wrong' });
  assert.throws(() => session.savePartial(2), /browser_operation_pending/);
  assert.throws(() => session.restorePartial(10), /browser_operation_pending/);
  release(); await sending; assert.equal(session.restorePartial(10), 1);
  await session.stop();
});

await test('mismatched prompt, overlong position and corrupt record fail closed', async () => {
  const storage = memoryStorage(); const client = roundClient(); const locks = lockManager();
  const session = createTypingRoundBrowserSession({ roundClient: client, storage, locks });
  await session.start(owner); await session.resume(); session.savePartial(5);
  assert.equal(session.restorePartial(4), 0); assert.equal(storage.records.size, 0);
  assert.throws(() => session.savePartial(513), /invalid_partial_position/);
  await session.stop();
  storage.records.set('typing-round-draft:v1:' + owner.scopeId, '{bad');
  const next = createTypingRoundBrowserSession({ roundClient: roundClient(), storage, locks });
  await rejection(next.start(owner), 'invalid_partial_resume');
  assert.equal(storage.records.size, 0); assert.equal(locks.held.size, 0);
});

await test('owner switch releases the old lock and never reuses its local draft', async () => {
  const storage = memoryStorage(); const locks = lockManager(); const client = roundClient();
  const session = createTypingRoundBrowserSession({ roundClient: client, storage, locks });
  await session.start(owner); await session.resume(); session.savePartial(2);
  await session.start(other); await session.resume();
  assert.equal(session.restorePartial(10), 0); assert.equal(locks.held.size, 1);
  assert.equal([...storage.records.keys()][0].endsWith(owner.scopeId), true);
  await session.stop();
});

await test('storage failure blocks partial progress instead of silently degrading Resume', async () => {
  const storage = memoryStorage(); const client = roundClient();
  const session = createTypingRoundBrowserSession({ roundClient: client, storage, locks: lockManager() });
  await session.start(owner); await session.resume();
  storage.setItem = () => { throw new Error('quota'); };
  assert.throws(() => session.savePartial(1), /persistence_unavailable/);
  await session.stop();
});

await test('Typing event traffic has a separate verified burst budget from controls and legacy score', () => {
  assert.deepEqual(typingRoundRateArgs('typing_round_event', 'user-a'), {
    p_key: 'typing-round-event:user-a', p_limit: 600, p_window: 60,
  });
  assert.deepEqual(typingRoundRateArgs('typing_round_resume', 'user-a'), {
    p_key: 'typing-round-control:user-a', p_limit: 120, p_window: 600,
  });
  assert.equal(TYPING_ROUND_EVENT_RATE.limit / TYPING_ROUND_EVENT_RATE.window, 10);
  assert.deepEqual(TYPING_ROUND_CONTROL_RATE, { limit: 120, window: 600 });
  assert.throws(() => typingRoundRateArgs('typing_round_event', ''), /invalid_rate_owner/);
});

await test('entrypoint keeps the OFF gate before the prepared Typing rate policy', () => {
  const source = fs.readFileSync(new URL('../supabase/functions/score-submit/index.ts', import.meta.url), 'utf8');
  const off = source.indexOf('isTypingRoundAction && !TYPING_ROUND_ACTIONS_ENABLED');
  const rate = source.indexOf('typingRoundRateArgs(action, user.id)');
  assert(off >= 0 && rate > off);
  assert.match(source, /isTypingRoundAction\s*\?\s*typingRoundRateArgs/);
  assert.match(source, /p_key:\s*`score-submit:\$\{user\.id\}`[^\n]+p_limit:\s*30/);
});

console.log(`Typing browser adoption: ${passed}/${passed} passed`);
