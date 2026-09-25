#!/usr/bin/env node
// Issuance source contract with synthetic protected storage. Real issuance,
// planner, Resume service and reducer run here; SQL atomicity/Auth/live routing
// are separate gates. No remote service, database or vocabulary is read.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { handleTypingRoundStart, handleTypingRoundStartWithProtectedContext } from '../supabase/functions/score-submit/typing-round-issuance.mjs';
import { loadTypingInitialRoundContext } from '../supabase/functions/score-submit/typing-round-context.mjs';

const OWNER = '10000000-0000-4000-8000-000000000001';
const OTHER = '10000000-0000-4000-8000-000000000002';
const ROUND = '20000000-0000-4000-8000-000000000001';
const OTHER_ROUND = '20000000-0000-4000-8000-000000000002';
const OP = '30000000-0000-4000-8000-000000000001';
const OP2 = '30000000-0000-4000-8000-000000000002';
const body = { action: 'typing_round_start', operation_id: OP, level: 1 };
const clone = (value) => structuredClone(value);
const hash = (userId, level) => createHash('sha256').update(JSON.stringify({ userId, action: 'typing_round_start', level })).digest('hex');
let passed = 0;
async function check(name, fn) { await fn(); passed++; console.log('PASS ' + name); }

function fixture(level = 1) {
  const code = level === 1 ? '初' : '中';
  const canonicalRows = Array.from({ length: 8 }, (_, i) => ({ content_key: `issuance-synthetic-${i + 1}`,
    level: code, status: 'active', access_tier: 'login', catalog_version: 'free-canonical-v1',
    record_hash: (i + 1).toString(16).padStart(64, '0'), canonical_record: {
      contentKey: `issuance-synthetic-${i + 1}`, level: code,
      word: `synthetic-answer-${i + 1}`, syllables: [{}],
    } }));
  const snapshots = canonicalRows.map((row, i) => ({ item_id: `synthetic-item-${i + 1}`,
    state_token: `normal:${i + 1}`, state: 'normal', stage: null, due_on: null,
    content_ref: { source: 'game_words', key: row.content_key } }));
  const f = { receipts: new Map(), rounds: new Map(), reserves: new Map(), rpcCalls: [], reads: [], contextCalls: [],
    context: { startingCombo: 5, today: '2026-09-23', canonicalRows, snapshots },
    loseWrite: false, failLoad: false, failReceipt: false, contextHook: null, receiptBarrier: null };
  const query = (fn, requireSignal = true) => {
    let signal;
    return { retry(value) { assert.equal(value, false); return this; },
      abortSignal(value) { signal = value; return this; },
      then(resolve, reject) { return Promise.resolve().then(() => {
        if (typeof requireSignal === 'function' ? requireSignal() : requireSignal) assert.ok(signal);
        signal?.throwIfAborted(); return fn();
      }).then(resolve, reject); } };
  };
  f.admin = {
    from(table) {
      if (table === 'phase1_typing_round_operations') {
        let selectedOp;
        return Object.assign(query(async () => {
          f.reads.push(selectedOp);
          if (f.failReceipt) return { error: { message: 'PRIVATE synthetic receipt error' } };
          // Snapshot before barrier: concurrent starts both see an absent row.
          const data = clone(f.receipts.get(selectedOp) || null);
          if (f.receiptBarrier) await f.receiptBarrier();
          return { data };
        }), { select(fields) {
          assert.deepEqual(new Set(fields.split(',')), new Set(['operation_id', 'user_id', 'round_id', 'operation_type', 'request_hash', 'request_payload', 'response']));
          return this;
        }, eq(field, value) { assert.equal(field, 'operation_id'); selectedOp = value; return this; }, maybeSingle() { return this; } });
      }
      if (table === 'phase1_learning_review_states' || table === 'tone_srs_state'
          || table === 'phase1_typing_rounds') {
        const chain = Object.assign(query(() => ({ data: [] })), {
          select() { return this; }, eq() { return this; }, limit() { return this; }, order() { return this; },
        });
        return chain;
      }
      if (table === 'learning_items') {
        let keys;
        return Object.assign(query(() => ({ data: canonicalRows.filter((r) => !keys || keys.includes(r.content_key))
          .map((r, i) => ({ item_id: `synthetic-item-${i + 1}`, content_source: 'game_words', content_key: r.content_key })) }), false), {
          select() { return this; }, is() { return this; }, eq() { return this; }, limit() { return this; },
          in(field, value) { assert.equal(field, 'content_key'); keys = value; return this; },
        });
      }
      assert.equal(table, 'game_words'); let keys; let requestedLevel;
      return Object.assign(query(() => ({ data: clone(canonicalRows.filter((r) => (!keys || keys.includes(r.content_key))
        && (!requestedLevel || r.level === requestedLevel))) }), () => Boolean(keys)), {
        select() { return this; }, limit() { return this; },
        in(field, value) { if (field === 'content_key') keys = value; return this; },
        eq(field, value) { if (field === 'level') requestedLevel = value; return this; },
      });
    },
    rpc(name, args) {
      f.rpcCalls.push({ name, args: clone(args) });
      return query(() => {
        if (name === 'phase1_typing_round_load') {
          if (f.failLoad) return { error: { message: 'PRIVATE synthetic load error' } };
          const stored = f.rounds.get(args.p_round_id);
          if (!stored || stored.owner !== args.p_user_id) return { data: { ok: false, reason: 'round_not_found' } };
          const p = args.p_prompt_after; const size = args.p_page_size;
          return { data: { ok: true, round: clone(stored.round), prompt_page: clone(stored.prompts.slice(p, p + size)),
            event_page: [], next_prompt_after: Math.min(stored.prompts.length, p + size), next_event_after: 0,
            has_more_prompts: stored.prompts.length > p + size, has_more_events: false } };
        }
        assert.equal(name, 'phase1_typing_round_issue');
        assert.equal(args.p_request_hash, hash(args.p_user_id, args.p_level));
        const requestPayload = { level: args.p_level, starting_combo: args.p_starting_combo,
          prompts: clone(args.p_prompts), reserve_prompts: clone(args.p_reserve_prompts) };
        const old = f.receipts.get(args.p_operation_id);
        if (old) return { data: old.user_id === args.p_user_id && old.operation_type === 'create_round'
          && old.request_hash === args.p_request_hash && JSON.stringify(old.request_payload) === JSON.stringify(requestPayload)
          ? { ...clone(old.response), idempotent: true } : { ok: false, reason: 'replay_conflict' } };
        if ([...f.rounds.values()].some((r) => r.owner === args.p_user_id && r.round.status === 'active')) {
          return { data: { ok: false, reason: 'active_round_exists', round_id: ROUND } };
        }
        const round = { round_id: ROUND, game: 'typing', level: args.p_level, starting_combo: args.p_starting_combo,
          prompt_count: args.p_prompts.length, next_event_sequence: 1, current_prompt_ordinal: 1,
          completed_count: 0, skip_count: 0, status: 'active' };
        const response = { ok: true, idempotent: false, operation_id: args.p_operation_id,
          reserve_count: args.p_reserve_prompts.length, ...round };
        const prompts = args.p_prompts.map((p, i) => ({ ...clone(p), prompt_ordinal: i + 1 }));
        f.rounds.set(ROUND, { owner: args.p_user_id, round, prompts });
        f.reserves.set(ROUND, clone(args.p_reserve_prompts));
        f.receipts.set(args.p_operation_id, { operation_id: args.p_operation_id, user_id: args.p_user_id,
          round_id: ROUND, operation_type: 'create_round', request_hash: args.p_request_hash,
          request_payload: requestPayload, response });
        if (f.loseWrite) { f.loseWrite = false; return { error: { message: 'PRIVATE synthetic lost commit response' } }; }
        return { data: clone(response) };
      });
    },
  };
  f.loadTrustedContext = async (input) => {
    assert.deepEqual(Object.keys(input).sort(), ['level', 'signal', 'userId']);
    assert.equal(input.userId, OWNER); assert.equal(input.level, level); input.signal.throwIfAborted();
    f.contextCalls.push({ userId: input.userId, level: input.level });
    return f.contextHook ? f.contextHook(f.contextCalls.length) : clone(f.context);
  };
  f.call = (overrides = {}) => handleTypingRoundStart({ admin: f.admin, user: { id: OWNER },
    body: { ...body, level }, loadTrustedContext: f.loadTrustedContext, enabled: true, ...overrides });
  f.creates = () => f.rpcCalls.filter((call) => call.name === 'phase1_typing_round_issue');
  return f;
}

await check('default OFF rejects before storage or trusted context', async () => {
  const f = fixture();
  const result = await handleTypingRoundStart({ admin: f.admin, user: { id: OWNER }, body, loadTrustedContext: f.loadTrustedContext });
  assert.equal(result.status, 404); assert.equal(result.body.error, 'feature_disabled');
  assert.equal(f.reads.length, 0); assert.equal(f.rpcCalls.length, 0); assert.equal(f.contextCalls.length, 0);
});

await check('protected owner wrapper stays OFF and accepts no context or Combo override', async () => {
  const f = fixture();
  const result = await handleTypingRoundStartWithProtectedContext({ admin: f.admin, user: { id: OWNER },
    body: { ...body, startingCombo: 99, today: '1999-01-01' },
    loadTrustedContext: () => { throw new Error('must not be accepted'); } });
  assert.equal(result.status, 404); assert.equal(result.body.error, 'feature_disabled');
  assert.equal(f.reads.length, 0); assert.equal(f.rpcCalls.length, 0); assert.equal(f.contextCalls.length, 0);

  const rejected = await handleTypingRoundStartWithProtectedContext({ admin: f.admin, user: { id: OWNER },
    body: { ...body, startingCombo: 99, today: '1999-01-01' }, enabled: true,
    now: new Date('2026-09-23T00:00:00Z') });
  assert.equal(rejected.status, 400); assert.equal(f.creates().length, 0);

  const protectedContext = await loadTypingInitialRoundContext({ admin: f.admin, userId: OWNER, level: 1,
    today: '2026-09-23', signal: AbortSignal.timeout(1000) });
  assert.equal(protectedContext.startingCombo, 0);
  const created = await handleTypingRoundStartWithProtectedContext({ admin: f.admin, user: { id: OWNER },
    body, enabled: true, now: new Date('2026-09-23T00:00:00Z') });
  assert.equal(created.status, 200, JSON.stringify(created)); assert.equal(created.body.checkpoint.combo, 0);
  assert.equal(f.creates().length, 1); assert.equal(f.creates()[0].args.p_starting_combo, 0);
});

await check('invalid owner, High, operation and forged state fail before storage', async () => {
  const cases = [
    [{ user: null }, 401], [{ user: { id: 'synthetic-invalid' } }, 401],
    [{ body: { ...body, level: 3 } }, 400], [{ body: { ...body, operation_id: 'invalid' } }, 400],
    ...['user_id', 'startingCombo', 'today', 'snapshots', 'canonicalRows', 'prompts', 'golden', 'score', 'round_id']
      .map((key) => [{ body: { ...body, [key]: key === 'user_id' ? OTHER : 99 } }, 400]),
  ];
  for (const [input, status] of cases) {
    const f = fixture(); assert.equal((await f.call(input)).status, status);
    assert.equal(f.reads.length, 0); assert.equal(f.rpcCalls.length, 0); assert.equal(f.contextCalls.length, 0);
  }
});

await check('first issuance uses trusted Combo five, unique canonical prompts, server hash and private plan', async () => {
  for (const level of [1, 2]) {
    const f = fixture(level); const result = await f.call();
    assert.equal(result.status, 200); assert.equal(result.body.operation_id, OP); assert.equal(result.body.idempotent, false);
    assert.equal(result.body.checkpoint.combo, 5); assert.equal(result.body.checkpoint.difficulty, level === 1 ? '初' : '中');
    assert.equal(result.body.checkpoint.completedCount, 0); assert.equal(result.body.checkpoint.confirmedScore.decimal, 0);
    assert.equal(f.contextCalls.length, 1); assert.equal(f.creates().length, 1); assert.equal(f.rounds.size, 1);
    const args = f.creates()[0].args;
    assert.equal(args.p_starting_combo, 5); assert.equal(args.p_prompts.length, 5);
    assert.equal(args.p_reserve_prompts.length, 3);
    assert.equal(new Set(args.p_prompts.map((p) => p.content_ref.key)).size, 5);
    assert.equal(new Set([...args.p_prompts, ...args.p_reserve_prompts].map((p) => p.content_ref.key)).size, 8);
    assert.ok(args.p_prompts.every((p) => typeof p.golden === 'boolean' && p.srs_bonus === false));
    assert.ok([...args.p_prompts, ...args.p_reserve_prompts].every((p) =>
      p.catalog_version === 'free-canonical-v1' && /^[0-9a-f]{64}$/.test(p.record_hash)));
    const visible = JSON.stringify(result.body);
    assert.ok(!visible.includes('synthetic-answer-')); assert.ok(!visible.includes('request_payload'));
    assert.ok(!visible.includes('srs_bonus')); assert.ok(!visible.includes('prompts'));
    for (const prompt of args.p_prompts.slice(1)) assert.ok(!visible.includes(prompt.content_ref.key));
    for (const prompt of args.p_reserve_prompts) assert.ok(!visible.includes(prompt.content_ref.key));
  }
});

await check('known receipt replays without trusted callback or Golden redraw and preserves exact plan', async () => {
  const f = fixture(); const initial = await f.call(); const persisted = clone(f.receipts.get(OP));
  const replay = await f.call({ loadTrustedContext: () => { throw new Error('must not load or redraw'); } });
  assert.equal(replay.status, 200); assert.equal(replay.body.idempotent, true);
  assert.deepEqual(replay.body.checkpoint, initial.body.checkpoint); assert.deepEqual(replay.body.current_prompt, initial.body.current_prompt);
  assert.deepEqual(f.receipts.get(OP), persisted); assert.equal(f.creates().length, 1); assert.equal(f.contextCalls.length, 1);
});

await check('receipt replay rejects missing or malformed canonical pins', async () => {
  for (const mutate of [
    (payload) => { delete payload.prompts[0].catalog_version; },
    (payload) => { payload.prompts[0].record_hash = 'bad'; },
    (payload) => { payload.reserve_prompts[0].catalog_version = ''; },
  ]) {
    const f = fixture(); assert.equal((await f.call()).status, 200);
    mutate(f.receipts.get(OP).request_payload);
    const result = await f.call({ loadTrustedContext: () => { throw new Error('must not redraw'); } });
    assert.equal(result.status, 503); assert.equal(result.body.checkpoint, undefined);
  }
});

await check('lost committed create response retains same operation and retry reads persisted winner', async () => {
  const f = fixture(); f.loseWrite = true;
  const uncertain = await f.call();
  assert.equal(uncertain.status, 503); assert.equal(uncertain.body.operation_id, OP);
  assert.equal(uncertain.body.retry_same_operation, true); assert.ok(!JSON.stringify(uncertain).includes('PRIVATE'));
  assert.equal(f.rounds.size, 1); assert.equal(f.receipts.size, 1);
  const stored = clone(f.receipts.get(OP));
  const retried = await f.call({ loadTrustedContext: () => { throw new Error('no redraw after commit'); } });
  assert.equal(retried.status, 200); assert.equal(retried.body.idempotent, true);
  assert.deepEqual(f.receipts.get(OP), stored); assert.equal(f.creates().length, 1);
});

await check('concurrent different candidates converge on one receipt after loser replay conflict', async () => {
  const f = fixture(); let reads = 0; let release;
  const bothReads = new Promise((resolve) => { release = resolve; });
  f.receiptBarrier = async () => { if (++reads <= 2) { if (reads === 2) release(); await bothReads; } };
  f.contextHook = (number) => ({ ...clone(f.context), startingCombo: number === 1 ? 5 : 6 });
  const results = await Promise.all([f.call(), f.call()]);
  assert.ok(results.every((r) => r.status === 200));
  assert.equal(f.contextCalls.length, 2); assert.equal(f.creates().length, 2);
  assert.equal(f.rounds.size, 1); assert.equal(f.receipts.size, 1);
  assert.deepEqual(results[0].body.checkpoint, results[1].body.checkpoint);
  assert.deepEqual(results[0].body.current_prompt, results[1].body.current_prompt);
  assert.deepEqual(results.map((r) => r.body.idempotent).sort(), [false, true]);
  assert.equal(results[0].body.checkpoint.combo, f.receipts.get(OP).request_payload.starting_combo);
  assert.ok(f.reads.length >= 3);
});

await check('foreign owner, changed level and mismatched receipt bindings cannot reuse an operation', async () => {
  const mutations = [
    (r) => { r.user_id = OTHER; }, (r) => { r.operation_id = OP2; },
    (r) => { r.operation_type = 'append_event'; }, (r) => { r.request_hash = 'a'.repeat(64); },
    (r) => { r.request_payload.level = 2; }, (r) => { r.round_id = OTHER_ROUND; },
    (r) => { r.response.operation_id = OP2; }, (r) => { r.response.round_id = OTHER_ROUND; },
    (r) => { r.response.level = 2; },
  ];
  for (const mutate of mutations) {
    const f = fixture(); assert.equal((await f.call()).status, 200);
    mutate(f.receipts.get(OP)); const calls = f.rpcCalls.length;
    const result = await f.call({ loadTrustedContext: () => { throw new Error('must not replace invalid receipt'); } });
    assert.ok([409, 503].includes(result.status)); assert.equal(result.body.checkpoint, undefined);
    assert.equal(f.rpcCalls.length, calls); assert.equal(f.creates().length, 1);
  }
  const f = fixture(); await f.call();
  assert.equal((await f.call({ user: { id: OTHER } })).status, 409);
  assert.equal((await f.call({ body: { ...body, level: 2 } })).status, 409);
  assert.equal(f.contextCalls.length, 1); assert.equal(f.creates().length, 1);
});

await check('another operation cannot silently replace or reset an existing active round', async () => {
  const f = fixture(); await f.call(); const stored = clone(f.rounds.get(ROUND));
  const result = await f.call({ body: { ...body, operation_id: OP2 } });
  assert.equal(result.status, 409); assert.equal(result.body.error, 'active_round_exists');
  assert.equal(f.receipts.has(OP2), false); assert.deepEqual(f.rounds.get(ROUND), stored);
});

await check('missing context and missing or invalid Combo never default to zero or create', async () => {
  const cases = [undefined, () => null, () => { throw new Error('PRIVATE context detail'); },
    ...[undefined, -1, '5', 0.5, Number.MAX_SAFE_INTEGER + 1]
      .map((startingCombo) => () => ({ startingCombo, today: '2026-09-23', snapshots: [], canonicalRows: [] }))];
  for (const loadTrustedContext of cases) {
    const f = fixture(); const result = await f.call({ loadTrustedContext });
    assert.equal(result.status, 503); assert.equal(f.creates().length, 0); assert.equal(f.receipts.size, 0);
    assert.ok(!JSON.stringify(result).includes('PRIVATE'));
  }
});

await check('receipt read failure prevents planning and postcommit Resume failure retains retry identity', async () => {
  const unavailable = fixture(); unavailable.failReceipt = true;
  const failure = await unavailable.call();
  assert.equal(failure.status, 503); assert.equal(unavailable.contextCalls.length, 0); assert.equal(unavailable.creates().length, 0);
  assert.ok(!JSON.stringify(failure).includes('PRIVATE'));
  const f = fixture(); f.failLoad = true;
  const committed = await f.call();
  assert.equal(committed.status, 503); assert.equal(committed.body.operation_id, OP);
  assert.equal(committed.body.retry_same_operation, true); assert.equal(committed.body.round_committed, true);
  assert.equal(committed.body.checkpoint, undefined); assert.ok(!JSON.stringify(committed).includes('PRIVATE'));
  f.failLoad = false;
  const retried = await f.call({ loadTrustedContext: () => { throw new Error('must replay receipt'); } });
  assert.equal(retried.status, 200); assert.equal(retried.body.idempotent, true); assert.equal(f.creates().length, 1);
});

console.log(`TYPING_ROUND_ISSUANCE_PASS ${passed}`);
