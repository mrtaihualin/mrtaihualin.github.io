#!/usr/bin/env node
// Inactive composition only: real browser adapter -> real service -> real
// reducer. Synthetic storage models the RPC contract; it does NOT prove SQL,
// auth verification, browser DOM/IME, learning commits or runtime activation.
import assert from 'node:assert/strict';
import { createTypingRoundClient } from '../js/games/typing-round-client.mjs';
import { handleTypingRoundAction, TYPING_ROUND_ACTIONS_ENABLED } from '../supabase/functions/score-submit/typing-round-service.mjs';

const OWNER = '10000000-0000-4000-8000-000000000001';
const OTHER = '10000000-0000-4000-8000-000000000002';
const ROUND = '20000000-0000-4000-8000-000000000001';
const SESSION = { scopeId: 'fixture_owner', contextToken: 'fixture-session-one' };
const OTHER_SESSION = { scopeId: 'fixture_other', contextToken: 'fixture-session-two' };
let passed = 0;
async function check(name, fn) { await fn(); passed++; console.log('PASS ' + name); }
const clone = (value) => structuredClone(value);

function storage() {
  const entries = new Map();
  return { entries, getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => entries.set(key, String(value)), removeItem: (key) => entries.delete(key) };
}

function fixture({ count = 5, level = 1, combo = 0, units = 1, golden = [], srs = [] } = {}) {
  const code = level === 1 ? '初' : '中';
  const rows = Array.from({ length: count }, (_, i) => ({ content_key: `composition-${i + 1}`,
    level: code, status: 'active', access_tier: 'login', canonical_record: {
      contentKey: `composition-${i + 1}`, level: code, word: `synthetic-answer-${i + 1}`,
      syllables: Array.from({ length: Array.isArray(units) ? units[i] : units }, () => ({})),
    } }));
  const prompts = rows.map((row, i) => ({ prompt_ordinal: i + 1,
    content_ref: { source: 'game_words', key: row.content_key }, answer: row.canonical_record.word,
    golden: golden.includes(i + 1), srs_bonus: srs.includes(i + 1) }));
  const round = { round_id: ROUND, game: 'typing', level, starting_combo: combo,
    prompt_count: count, next_event_sequence: 1, current_prompt_ordinal: 1,
    completed_count: 0, skip_count: 0, status: 'active' };
  const events = []; const operations = new Map(); const requests = []; const rpcCalls = [];
  const f = { rows, prompts, round, events, operations, requests, rpcCalls, storage: storage(),
    loseNextResponse: false, pauseNextResponse: null };
  // No reducers/scoring in the fake: only persist primitive events and enforce
  // the protected owner/order/idempotency contract already tested by DB tests.
  const query = (fn) => ({ retry(value) { assert.equal(value, false); return this; },
    abortSignal(signal) { signal.throwIfAborted(); return this; },
    then(resolve, reject) { return Promise.resolve().then(fn).then(resolve, reject); } });
  const admin = {
    rpc(name, args) {
      rpcCalls.push({ name, args: clone(args) });
      return query(() => {
        if (args.p_user_id !== OWNER || (args.p_round_id && args.p_round_id !== ROUND)) {
          return { data: { ok: false, reason: 'round_not_found' } };
        }
        if (name === 'phase1_typing_round_load') {
          const p = args.p_prompt_after; const e = args.p_event_after; const size = args.p_page_size;
          return { data: { ok: true, round: clone(round),
            prompt_page: clone(prompts.slice(p, p + size)), event_page: clone(events.slice(e, e + size)),
            next_prompt_after: Math.min(prompts.length, p + size), next_event_after: Math.min(events.length, e + size),
            has_more_prompts: prompts.length > p + size, has_more_events: events.length > e + size } };
        }
        assert.equal(name, 'phase1_typing_round_append_event');
        const previous = operations.get(args.p_operation_id);
        if (previous) return { data: previous.hash === args.p_request_hash
          ? { ...previous.response, idempotent: true } : { ok: false, reason: 'replay_conflict' } };
        if (round.status !== 'active') return { data: { ok: false, reason: 'round_not_active' } };
        if (args.p_expected_sequence !== round.next_event_sequence || args.p_prompt_ordinal !== round.current_prompt_ordinal) {
          return { data: { ok: false, reason: 'resync_required' } };
        }
        const prompt = prompts[args.p_prompt_ordinal - 1];
        if (args.p_event_type === 'completed' && args.p_answer !== prompt.answer) {
          return { data: { ok: false, reason: 'answer_mismatch' } };
        }
        const terminal = ['completed', 'skipped'].includes(args.p_event_type);
        const finishesRound = args.p_event_type === 'completed' && round.completed_count === 4;
        if (terminal && !finishesRound && !prompts[args.p_prompt_ordinal]) {
          return { data: { ok: false, reason: 'replacement_prompt_required' } };
        }
        events.push({ operation_id: args.p_operation_id, sequence: args.p_expected_sequence,
          prompt_ordinal: args.p_prompt_ordinal, content_ref: clone(prompt.content_ref), type: args.p_event_type,
          ...(args.p_event_type === 'completed' ? { answer: args.p_answer } : {}) });
        round.next_event_sequence++;
        if (args.p_event_type === 'completed') round.completed_count++;
        if (args.p_event_type === 'skipped') round.skip_count++;
        if (['completed', 'skipped'].includes(args.p_event_type)) round.current_prompt_ordinal++;
        if (round.completed_count === 5) round.status = 'completed';
        const response = { ok: true, idempotent: false, operation_id: args.p_operation_id, round_id: ROUND };
        operations.set(args.p_operation_id, { hash: args.p_request_hash, response });
        return { data: response };
      });
    },
    from(name) {
      assert.equal(name, 'game_words'); let keys; let requestedLevel;
      return Object.assign(query(() => ({ data: clone(rows.filter((r) => keys.includes(r.content_key) && r.level === requestedLevel)) })), {
        select() { return this; }, in(field, values) { assert.equal(field, 'content_key'); keys = values; return this; },
        eq(field, value) { assert.equal(field, 'level'); requestedLevel = value; return this; },
      });
    },
  };
  let nextId = 0;
  f.transport = async (body, { ownerContext }) => {
    requests.push({ body: clone(body), ownerContext: clone(ownerContext) });
    const userId = ownerContext.scopeId === SESSION.scopeId ? OWNER : OTHER;
    const response = await handleTypingRoundAction({ admin, user: { id: userId }, body, enabled: true });
    if (f.pauseNextResponse) {
      const pause = f.pauseNextResponse; f.pauseNextResponse = null;
      pause.reached(); await pause.wait;
    }
    if (f.loseNextResponse) { f.loseNextResponse = false; throw new Error('synthetic response loss'); }
    return response;
  };
  f.client = () => createTypingRoundClient({ storage: f.storage, transport: f.transport,
    createOperationId: () => `30000000-0000-4000-8000-${(++nextId).toString(16).padStart(12, '0')}` });
  f.connect = async () => { const c = f.client(); c.setOwner(SESSION); await c.resume(ROUND); return c; };
  f.finish = (client) => client.sendEvent({ type: 'completed', answer: prompts[client.getState().currentPrompt.ordinal - 1].answer });
  return f;
}

await check('composition remains explicitly inactive and Resume exposes only confirmed state', async () => {
  assert.equal(TYPING_ROUND_ACTIONS_ENABLED, false);
  const f = fixture({ combo: 4, golden: [1] }); const c = await f.connect(); const state = c.getState();
  assert.equal(state.checkpoint.combo, 4); assert.equal(state.checkpoint.confirmedScore.decimal, 0);
  assert.equal(state.currentPrompt.ordinal, 1); assert.equal(state.currentPrompt.golden, true);
  assert.ok(!JSON.stringify(state).includes('synthetic-answer-'));
  assert.ok(!JSON.stringify(state).includes('composition-2'));
  assert.equal(f.events.length, 0);
});

await check('lost completion response survives reload as the exact same operation and awards SRS only once', async () => {
  const f = fixture({ level: 2, combo: 4, golden: [1], srs: [1] }); let c = await f.connect();
  f.loseNextResponse = true;
  await assert.rejects(() => f.finish(c));
  const pending = c.getState().pendingOperationId;
  assert.ok(pending); assert.equal(c.getState().status, 'retry_pending');
  assert.equal(c.getState().checkpoint.completedCount, 0); assert.equal(f.events.length, 1);
  const original = clone(f.requests.at(-1).body);
  assert.equal(original.operation_id, pending);
  assert.ok(!JSON.stringify([...f.storage.entries]).includes(SESSION.contextToken));
  c = f.client(); c.setOwner(SESSION); await c.resume(ROUND);
  assert.deepEqual(f.requests.filter((r) => r.body.action === 'typing_round_event').map((r) => r.body), [original, original]);
  assert.equal(f.events.length, 1); assert.equal(f.operations.size, 1);
  assert.equal(c.getState().pendingOperationId, null);
  // 10 base x Middle 2 x Combo-five 2 x Golden 2 + SRS 1 = 81.
  assert.equal(c.getState().checkpoint.confirmedScore.decimal, 81);
  assert.equal(c.getState().checkpoint.combo, 5);
  assert.equal(c.getState().checkpoint.confirmedItems[0].srsBonusAwarded, true);
  assert.equal(c.getState().currentPrompt.ordinal, 2);
});

await check('a rejected canonical answer creates no completion and cannot invent a client score', async () => {
  const f = fixture(); const c = await f.connect();
  await assert.rejects(() => c.sendEvent({ type: 'completed', answer: 'synthetic-wrong-answer' }));
  assert.equal(f.events.length, 0); assert.equal(f.round.completed_count, 0);
  assert.equal(c.getState().checkpoint.confirmedScore.decimal, 0);
  await assert.rejects(() => c.sendEvent({ type: 'wrong', score: 999 }));
  assert.equal(f.events.length, 0);
});

await check('Skip advances existing queue, needs a successor only at its tail and never adds completions', async () => {
  const short = fixture(); const denied = await short.connect();
  for (let i = 0; i < 4; i++) await denied.sendEvent({ type: 'skipped' });
  assert.equal(short.events.length, 4); assert.equal(denied.getState().currentPrompt.ordinal, 5);
  assert.equal(denied.getState().checkpoint.completedCount, 0);
  assert.equal(denied.getState().checkpoint.skipCount, 4);
  await assert.rejects(() => denied.sendEvent({ type: 'skipped' }));
  assert.equal(short.events.length, 4); assert.equal(denied.getState().currentPrompt.ordinal, 5);
  assert.equal(denied.getState().checkpoint.completedCount, 0);
  const f = fixture({ count: 6, combo: 4 }); const c = await f.connect();
  await c.sendEvent({ type: 'skipped' });
  assert.equal(c.getState().checkpoint.completedCount, 0); assert.equal(c.getState().checkpoint.skipCount, 1);
  assert.equal(c.getState().checkpoint.combo, 4); assert.equal(c.getState().currentPrompt.ordinal, 2);
  for (let i = 0; i < 4; i++) await f.finish(c);
  assert.equal(c.getState().checkpoint.complete, false); assert.equal(c.getState().currentPrompt.ordinal, 6);
  await f.finish(c);
  const result = c.getState().checkpoint;
  assert.equal(result.completedCount, 5); assert.equal(result.consumedPromptCount, 6);
  assert.equal(result.complete, true); assert.equal(c.getState().currentPrompt, null);
  // Combo 5..9: 20+20+20+30+30, +20 completion, no Perfect after Skip.
  assert.equal(result.finalScore, 140);
  assert.deepEqual(result.roundBonus, { completion: 20, perfect: 0, total: 20 });
  assert.deepEqual(f.events.map((e) => e.prompt_ordinal), [1, 2, 3, 4, 5, 6]);
});

await check('five Clean Middle completions use server Combo/Golden/SRS and unmultiplied round bonuses', async () => {
  const f = fixture({ level: 2, combo: 4, golden: [3], srs: [2] }); const c = await f.connect();
  const expected = [40, 81, 161, 221, 351];
  for (let i = 0; i < 5; i++) {
    await f.finish(c);
    assert.equal(c.getState().checkpoint.confirmedScore.decimal, expected[i]);
    assert.equal(c.getState().checkpoint.completedCount, i + 1);
  }
  const result = c.getState().checkpoint;
  assert.equal(result.combo, 9); assert.equal(result.finalScore, 351);
  assert.deepEqual(result.roundBonus, { completion: 20, perfect: 50, total: 70 });
  await assert.rejects(() => c.sendEvent({ type: 'wrong' }));
  assert.equal(f.events.length, 5);
});

await check('wrong keeps exact fractional points, forfeits Golden/SRS/Clean and rounds only at final total', async () => {
  const f = fixture({ combo: 4, units: [6, 1, 1, 1, 1], golden: [1], srs: [1] }); const c = await f.connect();
  await c.sendEvent({ type: 'wrong' });
  assert.equal(c.getState().checkpoint.combo, 0); assert.equal(c.getState().checkpoint.currentWrongCount, 1);
  await f.finish(c);
  const first = c.getState().checkpoint.confirmedItems[0];
  assert.equal(first.clean, false); assert.equal(first.goldenAwarded, false); assert.equal(first.srsBonusAwarded, false);
  assert.deepEqual(first.awardedScore, { numerator: 25, denominator: 3, decimal: 25 / 3 });
  assert.equal(c.getState().checkpoint.finalScore, null);
  for (let i = 0; i < 4; i++) await f.finish(c);
  // 25/3 + 10 + 10 + 15 + 15 + completion 20 = 235/3 -> 78.
  assert.deepEqual(c.getState().checkpoint.confirmedScore, { numerator: 235, denominator: 3, decimal: 235 / 3 });
  assert.equal(c.getState().checkpoint.finalScore, 78);
});

await check('Hint then wrong is free practice, preserving Combo while awarding neither SRS nor round bonuses', async () => {
  const f = fixture({ combo: 4, golden: [1], srs: [1] }); const c = await f.connect();
  await c.sendEvent({ type: 'hint_opened' }); await c.sendEvent({ type: 'wrong' }); await f.finish(c);
  const first = c.getState().checkpoint.confirmedItems[0];
  assert.equal(first.guide, true); assert.equal(first.awardedScore.decimal, 0);
  assert.equal(first.goldenAwarded, false); assert.equal(first.srsBonusAwarded, false);
  assert.equal(c.getState().checkpoint.combo, 4);
  assert.equal(c.getState().checkpoint.currentGuide, false);
  for (let i = 0; i < 4; i++) await f.finish(c);
  assert.equal(c.getState().checkpoint.finalScore, 90); // 20+20+20+30; no bonuses.
  assert.deepEqual(c.getState().checkpoint.roundBonus, { completion: 0, perfect: 0, total: 0 });
});

await check('owner change fences an in-flight old response and other owners cannot replay its journal', async () => {
  const f = fixture(); const c = await f.connect();
  let reached; let release;
  const responseReady = new Promise((resolve) => { reached = resolve; });
  const wait = new Promise((resolve) => { release = resolve; });
  f.pauseNextResponse = { reached, wait };
  const sending = c.sendEvent({ type: 'wrong' });
  const rejection = assert.rejects(sending, (error) => error.code === 'owner_changed');
  await responseReady;
  c.setOwner(OTHER_SESSION); release(); await rejection;
  assert.equal(c.getState().checkpoint, null); assert.equal(c.getState().currentPrompt, null);
  assert.equal(f.events.length, 1);
  const before = f.requests.length;
  await assert.rejects(() => c.resume(ROUND));
  assert.equal(f.requests.length, before + 1);
  assert.equal(f.requests.at(-1).body.action, 'typing_round_resume');
  assert.deepEqual(f.requests.at(-1).ownerContext, OTHER_SESSION);
  assert.equal(f.events.length, 1); assert.equal(c.getState().checkpoint, null);
});

console.log(`TYPING_CLIENT_SERVICE_COMPOSITION_PASS ${passed}`);
