// Adapter-only contract tests: synthetic responses, no service/DB/UI activation.
import assert from 'node:assert/strict';
import { createTypingRoundClient } from '../js/games/typing-round-client.mjs';

const roundId = '10000000-0000-4000-8000-000000000001';
const otherRound = '10000000-0000-4000-8000-000000000002';
const owner = { scopeId: 'synthetic_owner_a', contextToken: 'synthetic-context-a' };
const otherOwner = { scopeId: 'synthetic_owner_b', contextToken: 'synthetic-context-b' };
const fraction = (n = 0) => ({ numerator: n, denominator: 1, decimal: n });
const contentRef = (n) => ({ source: 'game_words', key: 'synthetic-' + n });
const clone = (x) => JSON.parse(JSON.stringify(x));
function initial() {
  return { version: 'typing-resume-checkpoint-v1', serverVerified: true, game: 'typing', difficulty: '初',
    roundId, stateVersion: 0, confirmedThroughOperationId: null, targetCompleted: 5, confirmedEventCount: 0,
    consumedPromptCount: 0, currentPromptIndex: 0, currentWrongCount: 0, currentGuide: false,
    completedCount: 0, skipCount: 0, hadGuide: false, cleanCount: 0, combo: 0, maxCombo: 0,
    complete: false, perfectEligible: true, scoreBeforeRoundBonus: fraction(),
    roundBonus: { completion: 0, perfect: 0, total: 0 }, confirmedScore: fraction(), finalScore: null,
    confirmedItems: [] };
}
function fixture() {
  const records = new Map();
  const storage = { getItem: (k) => records.get(k) ?? null,
    setItem: (k, v) => records.set(k, v), removeItem: (k) => records.delete(k) };
  const wires = [];
  const accepted = new Set();
  let cp = initial();
  let operationCounter = 0;
  const options = { storage, createOperationId: () => `20000000-0000-4000-8000-${String(++operationCounter).padStart(12, '0')}` };
  const transport = async (request, context) => {
    wires.push({ request: clone(request), context });
    const isEvent = request.action === 'typing_round_event';
    const replay = accepted.has(request.operation_id);
    if (isEvent && !replay) {
      assert.equal(request.expected_sequence, cp.stateVersion + 1);
      assert.equal(request.prompt_ordinal, cp.currentPromptIndex + 1);
      accepted.add(request.operation_id);
      cp.stateVersion++; cp.confirmedEventCount++;
      cp.confirmedThroughOperationId = request.operation_id;
      if (request.type === 'wrong') cp.currentWrongCount++;
      if (request.type === 'hint_opened') { cp.currentGuide = true; cp.hadGuide = true; }
      if (['skipped', 'completed'].includes(request.type)) {
        const skipped = request.type === 'skipped';
        if (skipped) cp.skipCount++; else cp.completedCount++;
        cp.confirmedItems.push({ operationId: request.operation_id, contentRef: contentRef(request.prompt_ordinal),
          outcome: request.type, completedOrdinal: skipped ? null : cp.completedCount, combo: 0, awardedScore: fraction() });
        cp.consumedPromptCount++; cp.currentPromptIndex++; cp.currentWrongCount = 0; cp.currentGuide = false;
        cp.complete = cp.completedCount === 5;
        if (cp.complete) { cp.currentPromptIndex = null; cp.finalScore = 0; }
      }
    }
    return { status: 200, body: { ok: true, checkpoint: clone(cp), current_prompt: cp.complete ? null : {
      ordinal: cp.currentPromptIndex + 1, content_ref: contentRef(cp.currentPromptIndex + 1), golden: false },
    ...(isEvent ? { operation_id: request.operation_id, idempotent: replay } : {}) } };
  };
  const create = (override = transport) => createTypingRoundClient({ ...options, transport: override });
  return { records, storage, wires, accepted, transport, create, checkpoint: () => cp };
}
const reject = (promise, code) => assert.rejects(promise, (error) => error.code === code);
let passed = 0;
async function test(name, work) { await work(); passed++; console.log('PASS ' + name); }

await test('requires verified caller context and resume; never sends claims or derived state', async () => {
  const f = fixture(); const client = f.create();
  await reject(client.resume(), 'owner_changed');
  assert.throws(() => client.setOwner({ contextToken: 'x' }), /invalid_owner_context/);
  client.setOwner(owner);
  await reject(client.sendEvent({ type: 'wrong' }), 'resume_required');
  await client.resume(roundId);
  assert.equal(f.wires[0].context.ownerContext.contextToken, owner.contextToken);
  await reject(client.sendEvent({ type: 'wrong', score: 20 }), 'invalid_event');
  await reject(client.sendEvent({ type: 'skipped', answer: 'synthetic' }), 'unexpected_answer');
  await client.sendEvent({ type: 'wrong' });
  assert.deepEqual(Object.keys(f.wires[1].request).sort(), ['action', 'expected_sequence', 'operation_id', 'prompt_ordinal', 'round_id', 'type']);
  assert.equal(client.getState().checkpoint.currentWrongCount, 1);
});

await test('concurrent events serialize, and double skip cannot consume next prompt', async () => {
  const f = fixture(); const client = f.create(); client.setOwner(owner); await client.resume();
  await Promise.all([client.sendEvent({ type: 'wrong' }), client.sendEvent({ type: 'hint_opened' })]);
  assert.deepEqual(f.wires.slice(1).map((w) => w.request.expected_sequence), [1, 2]);
  const [a, b] = await Promise.allSettled([client.sendEvent({ type: 'skipped' }), client.sendEvent({ type: 'skipped' })]);
  assert.equal(a.status, 'fulfilled'); assert.equal(b.reason.code, 'stale_prompt');
  assert.equal(client.getState().checkpoint.skipCount, 1);
  assert.equal(client.getState().checkpoint.completedCount, 0);
  assert.equal(client.getState().currentPrompt.ordinal, 2);
});

await test('skip never counts as completion; five actual completions required', async () => {
  const f = fixture(); const client = f.create(); client.setOwner(owner); await client.resume();
  await client.sendEvent({ type: 'skipped' });
  for (let i = 0; i < 4; i++) await client.sendEvent({ type: 'completed', answer: 'synthetic-input' });
  assert.equal(client.getState().status, 'ready');
  await client.sendEvent({ type: 'completed', answer: 'synthetic-input' });
  assert.equal(client.getState().status, 'complete');
  assert.equal(client.getState().checkpoint.consumedPromptCount, 6);
  await reject(client.sendEvent({ type: 'wrong' }), 'resume_required');
});

await test('lost committed response, reload and resume replay the exact durable operation', async () => {
  const f = fixture(); let lose = true;
  const client = f.create(async (request, ctx) => {
    const result = await f.transport(request, ctx);
    if (request.action === 'typing_round_event' && lose) { lose = false; throw new Error('lost'); }
    return result;
  });
  client.setOwner(owner); await client.resume();
  await reject(client.sendEvent({ type: 'completed', answer: 'synthetic-input' }), 'transport_unavailable');
  assert.equal(client.getState().checkpoint.completedCount, 0);
  const stored = [...f.records.values()][0];
  assert(!stored.includes(owner.contextToken)); assert(!stored.includes('checkpoint')); assert(!stored.includes('golden'));
  const restarted = f.create(); restarted.setOwner(owner); await restarted.resume();
  assert.deepEqual(f.wires[1].request, f.wires[2].request);
  assert.equal(f.accepted.size, 1); assert.equal(restarted.getState().checkpoint.completedCount, 1);
  assert.equal(f.records.size, 0);
});

await test('503 and definite reserve rejection retain same primitive pending ID', async () => {
  const f = fixture(); let status = 503;
  const client = f.create((request, ctx) => request.action === 'typing_round_event' && status
    ? { status, body: { error: status === 503 ? 'unavailable' : 'typing_reserve_exhausted', retry_same_operation: status === 503 } }
    : f.transport(request, ctx));
  client.setOwner(owner); await client.resume();
  await reject(client.sendEvent({ type: 'skipped' }), 'unavailable');
  const pendingId = client.getState().pendingOperationId;
  await reject(client.sendEvent({ type: 'wrong' }), 'pending_operation');
  status = 409; await reject(client.retryPending(), 'typing_reserve_exhausted');
  assert.equal(client.getState().pendingOperationId, pendingId); assert.equal(f.records.size, 1);
  status = 0; await client.retryPending();
  assert.equal(f.wires.at(-1).request.operation_id, pendingId);
});

await test('journal write failure prevents transport and allows same-ID retry', async () => {
  const f = fixture(); const client = f.create(); client.setOwner(owner); await client.resume();
  const save = f.storage.setItem; f.storage.setItem = () => { throw new Error('full'); };
  await reject(client.sendEvent({ type: 'wrong' }), 'persistence_unavailable');
  const operationId = client.getState().pendingOperationId; assert.equal(f.wires.length, 1);
  f.storage.setItem = save; await client.retryPending();
  assert.equal(f.wires[1].request.operation_id, operationId);
});

await test('journal removal failure after commit requires same-ID replay without optimism', async () => {
  const f = fixture(); const client = f.create(); client.setOwner(owner); await client.resume();
  const remove = f.storage.removeItem; f.storage.removeItem = () => { throw new Error('blocked'); };
  await reject(client.sendEvent({ type: 'skipped' }), 'persistence_unavailable');
  assert.equal(client.getState().checkpoint.skipCount, 0); assert.equal(f.records.size, 1);
  f.storage.removeItem = remove; await client.retryPending();
  assert.deepEqual(f.wires[1].request, f.wires[2].request); assert.equal(f.accepted.size, 1);
});

for (const context of [otherOwner, { ...owner, contextToken: 'synthetic-new-session' }]) {
  await test('owner or session switch fences late response: ' + context.scopeId, async () => {
    const f = fixture(); let release;
    const client = f.create(async (request, ctx) => {
      const response = await f.transport(request, ctx);
      if (request.action === 'typing_round_event') await new Promise((resolve) => { release = resolve; });
      return response;
    });
    client.setOwner(owner); await client.resume();
    const send = client.sendEvent({ type: 'skipped' });
    while (!release) await new Promise((resolve) => setImmediate(resolve));
    client.setOwner(context); const before = client.getState();
    release(); await reject(send, 'owner_changed');
    assert.deepEqual(client.getState(), before); assert.equal(f.records.size, 1);
  });
}

await test('corrupt or cross-owner journal fails closed without sending', async () => {
  const f = fixture(); let client = f.create(); client.setOwner(owner); await client.resume();
  // Save a legitimate pending record, then corrupt the ownership binding.
  const client2 = f.create(async (req, ctx) => {
    if (req.action === 'typing_round_event') throw new Error('offline');
    return f.transport(req, ctx);
  });
  client2.setOwner(owner); await client2.resume();
  await reject(client2.sendEvent({ type: 'wrong' }), 'transport_unavailable');
  const [key, raw] = [...f.records.entries()][0];
  const record = JSON.parse(raw); record.scopeId = otherOwner.scopeId; f.records.set(key, JSON.stringify(record));
  client = f.create(); assert.equal(client.setOwner(owner).status, 'blocked');
  const calls = f.wires.length; await reject(client.resume(), 'invalid_journal'); assert.equal(f.wires.length, calls);
});

await test('mismatched round, operation and regressed sequence fail closed', async () => {
  for (const mutation of [
    (body) => { body.checkpoint.roundId = otherRound; },
    (body) => { body.operation_id = otherRound; },
    (body) => { body.checkpoint.stateVersion = 0; body.checkpoint.confirmedEventCount = 0; },
  ]) {
    const f = fixture(); const client = f.create(async (req, ctx) => {
      const response = await f.transport(req, ctx); if (req.action === 'typing_round_event') mutation(response.body); return response;
    });
    client.setOwner(owner); await client.resume(roundId);
    await assert.rejects(client.sendEvent({ type: 'wrong' }));
    assert.equal(client.getState().status, 'blocked'); assert.equal(client.getState().checkpoint.stateVersion, 0);
    assert.equal(f.records.size, 1);
  }
});

await test('resume binds round; detached snapshots and unknown server payloads cannot leak', async () => {
  const f = fixture(); let inject = false;
  const client = f.create(async (req, ctx) => {
    const response = await f.transport(req, ctx); if (inject) response.body.checkpoint.future_queue = [];
    return response;
  });
  client.setOwner(owner); await client.resume(roundId);
  const snapshot = client.getState(); snapshot.checkpoint.combo = 500;
  assert.equal(client.getState().checkpoint.combo, 0);
  await reject(client.resume(otherRound), 'round_conflict');
  inject = true; await reject(client.resume(), 'invalid_checkpoint');
  assert.equal(client.getState().checkpoint.stateVersion, 0);
});

await test('another local writer cannot overwrite an existing unresolved journal', async () => {
  const f = fixture();
  const first = f.create(async (req, ctx) => {
    if (req.action === 'typing_round_event') throw new Error('offline');
    return f.transport(req, ctx);
  });
  const second = f.create();
  first.setOwner(owner); second.setOwner(owner); await first.resume(); await second.resume();
  await reject(first.sendEvent({ type: 'wrong' }), 'transport_unavailable');
  const existing = [...f.records.values()][0]; const calls = f.wires.length;
  await reject(second.sendEvent({ type: 'skipped' }), 'journal_conflict');
  assert.equal([...f.records.values()][0], existing); assert.equal(f.wires.length, calls);
});

console.log(`Typing round client: ${passed}/${passed} passed`);
