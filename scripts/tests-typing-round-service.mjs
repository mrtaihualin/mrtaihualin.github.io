#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { stripTypeScriptTypes } from 'node:module';
import { TYPING_ROUND_ACTIONS_ENABLED, handleTypingRoundAction } from '../supabase/functions/score-submit/typing-round-service.mjs';

const owner = '10000000-0000-4000-8000-000000000001';
const stranger = '10000000-0000-4000-8000-000000000002';
const roundId = '20000000-0000-4000-8000-000000000001';
const op = (n) => `30000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
const resume = { action: 'typing_round_resume', round_id: roundId };
const event = (extra = {}) => ({ action: 'typing_round_event', round_id: roundId,
  operation_id: op(1), expected_sequence: 1, prompt_ordinal: 1, type: 'wrong', ...extra });
let passed = 0;
async function check(name, fn) { await fn(); passed++; console.log('PASS ' + name); }

function fixture(count = 5, level = 1) {
  const code = level === 1 ? '初' : '中';
  const rows = Array.from({ length: Math.min(count, 100) }, (_, i) => ({
    content_key: `fixture-word-${i + 1}`, level: code, status: 'active', access_tier: 'login',
    canonical_record: { contentKey: `fixture-word-${i + 1}`, word: `fixture-answer-${i + 1}`,
      level: code, syllables: [{}] },
  }));
  const prompts = Array.from({ length: count }, (_, i) => {
    const row = rows[i % rows.length];
    return { prompt_ordinal: i + 1, content_ref: { source: 'game_words', key: row.content_key },
      answer: row.canonical_record.word, golden: i === 2, srs_bonus: i === 1 };
  });
  const round = { round_id: roundId, game: 'typing', level, starting_combo: 4,
    prompt_count: count, next_event_sequence: 1, current_prompt_ordinal: 1,
    completed_count: 0, skip_count: 0, status: 'active' };
  const state = { owner, round, prompts, rows, events: [], operations: new Map(), calls: [],
    queryHook: null, pageHook: null, failWrite: false, failLoad: false, lostWriteResponse: false };
  const query = (fn) => {
    let signal;
    return { retry(value) { assert.equal(value, false); return this; },
      abortSignal(value) { signal = value; return this; },
      then(resolve, reject) { return Promise.resolve().then(() => { assert.ok(signal); signal.throwIfAborted(); return fn(); }).then(resolve, reject); } };
  };
  state.admin = {
    rpc(name, args) {
      state.calls.push({ name, args: structuredClone(args) });
      return query(() => {
        if (args.p_user_id !== state.owner || (args.p_round_id && args.p_round_id !== roundId)) {
          return { data: { ok: false, reason: 'round_not_found' } };
        }
        if (name === 'phase1_typing_round_load') {
          if (state.failLoad) return { error: { message: 'PRIVATE SQL ERROR' } };
          const p = args.p_prompt_after; const e = args.p_event_after; const size = args.p_page_size;
          assert.equal(size, 64);
          const data = { ok: true, round: structuredClone(round),
            prompt_page: structuredClone(prompts.slice(p, p + size)),
            event_page: structuredClone(state.events.slice(e, e + size)),
            next_prompt_after: Math.min(prompts.length, p + size),
            next_event_after: Math.min(state.events.length, e + size),
            has_more_prompts: prompts.length > p + size,
            has_more_events: state.events.length > e + size };
          if (state.pageHook) state.pageHook(data, args);
          return { data };
        }
        assert.equal(name, 'phase1_typing_round_append_event');
        assert.match(args.p_request_hash, /^[a-f0-9]{64}$/);
        if (state.failWrite) return { error: { message: 'PRIVATE SQL ERROR' } };
        const old = state.operations.get(args.p_operation_id);
        if (old) return { data: old.hash === args.p_request_hash
          ? { ...old.response, idempotent: true } : { ok: false, reason: 'replay_conflict' } };
        if (round.status !== 'active') return { data: { ok: false, reason: 'round_not_active' } };
        if (args.p_expected_sequence !== round.next_event_sequence || args.p_prompt_ordinal !== round.current_prompt_ordinal) {
          return { data: { ok: false, reason: 'resync_required' } };
        }
        const prompt = prompts[args.p_prompt_ordinal - 1];
        if (args.p_event_type === 'completed' && args.p_answer !== prompt.answer) return { data: { ok: false, reason: 'answer_mismatch' } };
        const record = { operation_id: args.p_operation_id, sequence: args.p_expected_sequence,
          prompt_ordinal: args.p_prompt_ordinal, content_ref: prompt.content_ref, type: args.p_event_type,
          ...(args.p_event_type === 'completed' ? { answer: args.p_answer } : {}) };
        state.events.push(record);
        round.next_event_sequence++;
        if (record.type === 'completed') round.completed_count++;
        if (record.type === 'skipped') round.skip_count++;
        if (['completed', 'skipped'].includes(record.type)) round.current_prompt_ordinal++;
        if (round.completed_count === 5) round.status = 'completed';
        const response = { ok: true, idempotent: false, operation_id: args.p_operation_id, round_id: roundId };
        state.operations.set(args.p_operation_id, { hash: args.p_request_hash, response });
        if (state.lostWriteResponse) { state.lostWriteResponse = false; return { error: { message: 'connection lost after commit' } }; }
        return { data: response };
      });
    },
    from(name) {
      assert.equal(name, 'game_words');
      let keys; let requestedLevel;
      const result = query(() => {
        let data = structuredClone(state.rows.filter((row) => keys.includes(row.content_key) && row.level === requestedLevel));
        if (state.queryHook) data = state.queryHook(data);
        return { data };
      });
      return Object.assign(result, { select() { return this; }, in(field, values) { assert.equal(field, 'content_key'); keys = values; return this; },
        eq(field, value) { assert.equal(field, 'level'); requestedLevel = value; return this; } });
    },
  };
  state.call = (body = resume, user = { id: owner }) => handleTypingRoundAction({ admin: state.admin, user, body, enabled: true });
  return state;
}

await check('default OFF rejects before storage; verified owner is required', async () => {
  assert.equal(TYPING_ROUND_ACTIONS_ENABLED, false);
  const f = fixture();
  assert.equal((await handleTypingRoundAction({ admin: f.admin, user: { id: owner }, body: resume })).status, 404);
  assert.equal((await f.call(resume, null)).status, 401);
  assert.equal(f.calls.length, 0);
});

await check('Resume derives score and Combo from protected evidence and reveals no answers/future queue', async () => {
  const f = fixture();
  const result = await f.call({ action: 'typing_round_resume' });
  assert.equal(result.status, 200);
  assert.equal(result.body.checkpoint.combo, 4);
  assert.equal(result.body.checkpoint.confirmedScore.decimal, 0);
  assert.equal(result.body.current_prompt.ordinal, 1);
  const serialized = JSON.stringify(result.body);
  assert.ok(!serialized.includes('fixture-answer-'));
  assert.ok(!serialized.includes('fixture-word-2'));
  assert.ok(!serialized.includes('srs_bonus'));
});

await check('client-derived state, owner spoofing and unsupported actions fail before writes', async () => {
  for (const extra of [{ score: 999 }, { combo: 99 }, { events: [] }, { prompts: [] },
    { user_id: stranger }, { golden: true }, { srs_bonus: true }, { level: 3 }]) {
    const f = fixture();
    assert.equal((await f.call({ ...event(), ...extra })).status, 400);
    assert.equal(f.calls.length, 0);
  }
  const f = fixture();
  assert.equal((await f.call({ action: 'typing_round_create' })).status, 400);
  assert.equal((await f.call(event({ answer: null }))).status, 400);
});

await check('another account cannot load or append to the round', async () => {
  const f = fixture();
  assert.equal((await f.call(resume, { id: stranger })).status, 404);
  assert.equal((await f.call(event(), { id: stranger })).status, 404);
  assert.equal(f.events.length, 0);
});

await check('wrong and Hint events persist before reduction; same-ID replay cannot double count', async () => {
  const f = fixture();
  const wrong = await f.call(event());
  assert.equal(wrong.body.checkpoint.currentWrongCount, 1);
  assert.equal(wrong.body.checkpoint.combo, 0);
  const replay = await f.call(event());
  assert.equal(replay.body.idempotent, true);
  assert.equal(replay.body.checkpoint.currentWrongCount, 1);
  assert.equal((await f.call(event({ type: 'hint_opened' }))).body.error, 'replay_conflict');
  const hint = await f.call(event({ operation_id: op(2), expected_sequence: 2, type: 'hint_opened' }));
  assert.equal(hint.body.checkpoint.currentGuide, true);
  assert.equal(f.events.length, 2);
});

await check('exact completion, five-unit final score, completed-round replay and stale sequence', async () => {
  const f = fixture(5, 2);
  assert.equal((await f.call(event({ expected_sequence: 2 }))).body.error, 'resync_required');
  assert.equal((await f.call(event({ type: 'completed', answer: 'forged' }))).body.error, 'answer_mismatch');
  let body;
  for (let i = 1; i <= 5; i++) {
    body = event({ operation_id: op(i), expected_sequence: i, prompt_ordinal: i,
      type: 'completed', answer: f.prompts[i - 1].answer });
    assert.equal((await f.call(body)).status, 200);
  }
  const final = await f.call(body);
  assert.equal(final.body.idempotent, true);
  assert.equal(final.body.checkpoint.complete, true);
  assert.equal(final.body.checkpoint.combo, 9);
  assert.equal(final.body.checkpoint.finalScore, 351);
  assert.equal(final.body.current_prompt, null);
  assert.equal((await f.call(event({ operation_id: op(6), expected_sequence: 6, prompt_ordinal: 6 }))).body.error, 'round_not_active');
});

await check('load walks all 64-row pages across more than 100 Skips without a gameplay cap', async () => {
  const f = fixture(210);
  f.events = Array.from({ length: 205 }, (_, i) => ({ operation_id: op(i + 1), sequence: i + 1,
    prompt_ordinal: i + 1, content_ref: f.prompts[i].content_ref, type: 'skipped' }));
  Object.assign(f.round, { next_event_sequence: 206, current_prompt_ordinal: 206, skip_count: 205 });
  const result = await f.call();
  assert.equal(result.status, 200);
  assert.equal(result.body.checkpoint.skipCount, 205);
  assert.equal(result.body.checkpoint.combo, 0);
  assert.equal(result.body.current_prompt.ordinal, 206);
  assert.equal(f.calls.length, 4);
});

await check('changing snapshot and missing/malformed pages never produce a confirmed checkpoint', async () => {
  for (const hook of [
    (data, args) => { if (args.p_prompt_after) data.round.starting_combo++; },
    (data) => { data.prompt_page.pop(); },
    (data) => { data.next_prompt_after = 0; },
    (data) => { data.round.level = 3; },
  ]) {
    const f = fixture(70); f.pageHook = hook;
    const result = await f.call();
    assert.ok([409, 503].includes(result.status));
    assert.equal(result.body.checkpoint, undefined);
  }
});

await check('missing, duplicate, private and changed canonical content fail closed', async () => {
  for (const hook of [
    (rows) => rows.slice(1), (rows) => [...rows, rows[0]],
    (rows) => rows.map((row) => ({ ...row, access_tier: 'paid' })),
    (rows) => rows.map((row) => ({ ...row, canonical_record: { ...row.canonical_record, word: 'changed' } })),
  ]) {
    const f = fixture(); f.queryHook = hook;
    const result = await f.call();
    assert.ok([409, 503].includes(result.status));
    assert.equal(result.body.checkpoint, undefined);
  }
});

await check('lost commit response and post-commit read failure preserve same operation for retry', async () => {
  const f = fixture(); f.lostWriteResponse = true;
  const lost = await f.call(event());
  assert.equal(lost.status, 503);
  assert.equal(lost.body.retry_same_operation, true);
  assert.equal(lost.body.operation_id, op(1));
  assert.equal((await f.call(event())).body.idempotent, true);
  f.failLoad = true;
  const failedLoad = await f.call(event({ operation_id: op(2), expected_sequence: 2, type: 'hint_opened' }));
  assert.equal(failedLoad.body.event_committed, true);
  assert.equal(failedLoad.body.retry_same_operation, true);
  assert.ok(!JSON.stringify(failedLoad).includes('PRIVATE'));
  f.failLoad = false;
  assert.equal((await f.call(event({ operation_id: op(2), expected_sequence: 2, type: 'hint_opened' }))).body.idempotent, true);
  assert.equal(f.events.length, 2);
});

// Execute the real TypeScript request handler with in-memory dependencies. The
// fixture supplies only auth/storage; no remote imports or network are needed.
const source = fs.readFileSync(new URL('../supabase/functions/score-submit/index.ts', import.meta.url), 'utf8');
const runnable = stripTypeScriptTypes(source.replace(/^import .+ from .+;$/gm, ''), { mode: 'strip' });
function edge({ enabled = false, validAuth = true, rate = true } = {}) {
  const f = fixture(); let handler; let legacyCalls = 0; let rateCalls = 0;
  const admin = { ...f.admin, rpc(name, args) {
    if (name === 'game_content_rl_check') { rateCalls++; return Promise.resolve({ data: rate }); }
    return f.admin.rpc(name, args);
  } };
  vm.runInNewContext(runnable, { Request, Response, TextEncoder, crypto, URL, console,
    serve(value) { handler = value; },
    Deno: { env: { get(name) { return { SUPABASE_URL: 'https://fixture.invalid', SUPABASE_ANON_KEY: 'EXAMPLE_ANON', SUPABASE_SERVICE_ROLE_KEY: 'EXAMPLE_SERVICE_ROLE' }[name]; } } },
    createClient(_url, key) { return key === 'EXAMPLE_SERVICE_ROLE' ? admin
      : { auth: { getUser: async () => ({ data: { user: validAuth ? { id: owner } : null }, error: validAuth ? null : {} }) } }; },
    TYPING_ROUND_ACTIONS_ENABLED: enabled,
    handleTypingRoundAction: (options) => handleTypingRoundAction({ ...options, enabled }),
    validateScoreSubmission() { legacyCalls++; throw Object.assign(new Error(), { code: 'fixture_legacy' }); },
  });
  return { f, calls: () => ({ legacyCalls, rateCalls }),
    invoke: (body, headers = {}) => handler(new Request('https://fixture.invalid/score-submit', {
      method: 'POST', headers: { Origin: 'https://mrtaihualin.com', Authorization: 'Bearer fixture-user', ...headers },
      body: JSON.stringify(body),
    })) };
}

await check('actual Edge entrypoint enforces auth, OFF gate, rate limit and leaves legacy score route intact', async () => {
  const off = edge(); assert.equal((await off.invoke(resume)).status, 404);
  assert.equal(off.calls().rateCalls, 0); assert.equal(off.f.calls.length, 0);
  const unauthorized = edge({ enabled: true, validAuth: false });
  assert.equal((await unauthorized.invoke(resume)).status, 401);
  assert.equal(unauthorized.f.calls.length, 0);
  const rate = edge({ enabled: true, rate: false });
  assert.equal((await rate.invoke(resume)).status, 429); assert.equal(rate.f.calls.length, 0);
  const active = edge({ enabled: true });
  const response = await active.invoke(event());
  assert.equal(response.status, 200); assert.equal((await response.json()).checkpoint.currentWrongCount, 1);
  assert.equal(active.calls().legacyCalls, 0);
  assert.equal((await active.invoke({ game: 'typing' })).status, 400);
  assert.equal(active.calls().legacyCalls, 1);
  assert.equal((await active.invoke(resume, { Origin: 'https://untrusted.invalid' })).status, 403);
});

console.log(`TYPING_ROUND_SERVICE_PASS ${passed}`);
