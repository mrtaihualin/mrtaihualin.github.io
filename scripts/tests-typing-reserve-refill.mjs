#!/usr/bin/env node
// Protected bounded reserve-refill owner contract. Synthetic storage only; no
// remote service, database or vocabulary is read.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { handleTypingReserveRefill,
  handleTypingReserveRefillWithProtectedContext } from '../supabase/functions/score-submit/typing-reserve-refill.mjs';

const OWNER = '10000000-0000-4000-8000-000000000001';
const OTHER = '10000000-0000-4000-8000-000000000002';
const ROUND = '20000000-0000-4000-8000-000000000001';
const OTHER_ROUND = '20000000-0000-4000-8000-000000000002';
const BATCH = '30000000-0000-4000-8000-000000000001';
const TODAY = '2026-09-23';
const clone = structuredClone;
let passed = 0;
async function check(name, fn) { await fn(); passed++; console.log('PASS ' + name); }

function refillHash(userId = OWNER, roundId = ROUND, batchId = BATCH) {
  return createHash('sha256').update(JSON.stringify({
    userId, action: 'typing_reserve_refill', roundId, batchId,
  })).digest('hex');
}

function fixture() {
  const canonicalRows = Array.from({ length: 12 }, (_, i) => ({
    content_key: `refill-${i}`, level: '初', status: 'active', access_tier: 'login',
    catalog_version: 'free-canonical-v1', record_hash: (i + 1).toString(16).padStart(64, '0'),
    canonical_record: { contentKey: `refill-${i}`, level: '初', word: `answer-${i}`, syllables: [{}] },
  }));
  const snapshots = canonicalRows.map((row, i) => ({ item_id: `item-${i}`, state_token: `normal:${i}`,
    content_ref: { source: 'game_words', key: row.content_key }, state: 'normal', stage: null, due_on: null }));
  const promptFor = (index, ordinal) => ({ prompt_ordinal: ordinal,
    content_ref: { source: 'game_words', key: canonicalRows[index].content_key },
    answer: canonicalRows[index].canonical_record.word, catalog_version: canonicalRows[index].catalog_version,
    record_hash: canonicalRows[index].record_hash, golden: false, srs_bonus: false });
  const prompts = [0, 1, 2, 3, 4, 6].map((index, i) => promptFor(index, i + 1));
  const events = prompts.slice(0, 4).map((prompt, i) => ({
    operation_id: `40000000-0000-4000-8000-${(i + 1).toString().padStart(12, '0')}`,
    sequence: i + 1, prompt_ordinal: i + 1, content_ref: prompt.content_ref,
    type: 'completed', answer: prompt.answer,
  }));
  events.push({ operation_id: '40000000-0000-4000-8000-000000000005', sequence: 5,
    prompt_ordinal: 5, content_ref: prompts[4].content_ref, type: 'skipped', answer: null });
  const reservePrompts = [6, 7].map((index, i) => ({ reserve_ordinal: i + 1,
    content_ref: { source: 'game_words', key: canonicalRows[index].content_key },
    catalog_version: canonicalRows[index].catalog_version, record_hash: canonicalRows[index].record_hash }));
  const round = { round_id: ROUND, game: 'typing', level: 1, starting_combo: 0,
    prompt_count: 6, next_event_sequence: 6, current_prompt_ordinal: 6,
    completed_count: 4, skip_count: 1, status: 'active' };
  const f = { canonicalRows, snapshots, prompts, events, reservePrompts, round,
    reserve: { reserve_count: 2, reserve_cursor: 1 }, receipts: new Map(), reads: [], rpcCalls: [],
    contextCalls: 0, loseWrite: false, refillReason: null, corruptReserve: null, corruptRound: null };
  const query = (fn) => {
    let signal;
    return { retry(value) { assert.equal(value, false); return this; },
      abortSignal(value) { signal = value; return this; },
      then(resolve, reject) { return Promise.resolve().then(() => {
        signal?.throwIfAborted(); return fn();
      }).then(resolve, reject); } };
  };
  f.admin = {
    from(table) {
      assert.equal(table, 'phase1_typing_round_reserve_batches'); let batch;
      return Object.assign(query(() => {
        f.reads.push(batch); return { data: clone(f.receipts.get(batch) || null) };
      }), {
        select(fields) { assert.equal(fields, 'batch_id,user_id,round_id,request_hash,request_payload,response'); return this; },
        eq(field, value) { assert.equal(field, 'batch_id'); batch = value; return this; },
        maybeSingle() { return this; },
      });
    },
    rpc(name, args) {
      f.rpcCalls.push({ name, args: clone(args) });
      return query(() => {
        if (name === 'phase1_typing_round_load') {
          if (args.p_user_id !== OWNER || args.p_round_id !== ROUND) return { data: { ok: false, reason: 'round_not_found' } };
          const roundResult = clone(f.round); f.corruptRound?.(roundResult);
          return { data: { ok: true, round: roundResult,
            prompt_page: clone(f.prompts.slice(args.p_prompt_after, args.p_prompt_after + args.p_page_size)),
            event_page: clone(f.events.slice(args.p_event_after, args.p_event_after + args.p_page_size)),
            next_prompt_after: f.prompts.length, next_event_after: f.events.length,
            has_more_prompts: false, has_more_events: false } };
        }
        if (name === 'phase1_typing_round_reserve_load') {
          if (args.p_user_id !== OWNER || args.p_round_id !== ROUND) return { data: { ok: false, reason: 'round_not_found' } };
          const value = { ok: true, round: clone(f.round), reserve: clone(f.reserve),
            reserve_page: clone(f.reservePrompts.slice(args.p_reserve_after, args.p_reserve_after + args.p_page_size)),
            next_reserve_after: f.reserve.reserve_count, has_more_reserves: false };
          delete value.round.game; delete value.round.starting_combo;
          f.corruptReserve?.(value);
          return { data: value };
        }
        assert.equal(name, 'phase1_typing_round_refill');
        assert.equal(args.p_user_id, OWNER); assert.equal(args.p_round_id, ROUND);
        assert.equal(args.p_request_hash, refillHash());
        assert.equal(args.p_expected_event_sequence, 6); assert.equal(args.p_expected_prompt_ordinal, 6);
        assert.equal(args.p_expected_prompt_count, 6); assert.equal(args.p_expected_completed_count, 4);
        assert.equal(args.p_expected_skip_count, 1);
        assert.equal(args.p_expected_reserve_count, 2); assert.equal(args.p_expected_reserve_cursor, 1);
        if (f.refillReason) return { data: { ok: false, reason: f.refillReason } };
        const old = f.receipts.get(args.p_batch_id);
        const requestPayload = { round_id: ROUND, expected_reserve_count: 2, prompts: clone(args.p_prompts) };
        if (old) return { data: { ok: false, reason: 'replay_conflict' } };
        const response = { ok: true, idempotent: false, batch_id: BATCH, round_id: ROUND,
          added_reserve_count: args.p_prompts.length, reserve_count: 2 + args.p_prompts.length };
        f.receipts.set(BATCH, { batch_id: BATCH, user_id: OWNER, round_id: ROUND,
          request_hash: refillHash(), request_payload: requestPayload, response });
        if (f.loseWrite) { f.loseWrite = false; return { error: { message: 'PRIVATE synthetic lost response' } }; }
        const returned = clone(response); f.corruptWrite?.(returned); return { data: returned };
      });
    },
  };
  f.context = async ({ userId, level, signal }) => {
    assert.equal(userId, OWNER); assert.equal(level, 1); signal.throwIfAborted(); f.contextCalls++;
    return { today: TODAY, snapshots: clone(f.snapshots), canonicalRows: clone(f.canonicalRows) };
  };
  f.call = (overrides = {}) => handleTypingReserveRefill({ admin: f.admin, user: { id: OWNER },
    batchId: BATCH, roundId: ROUND, loadTrustedContext: f.context, enabled: true, ...overrides });
  f.writes = () => f.rpcCalls.filter((call) => call.name === 'phase1_typing_round_refill');
  return f;
}

await check('default OFF rejects before receipt, round or context reads', async () => {
  const f = fixture(); const result = await handleTypingReserveRefill({ admin: f.admin, user: { id: OWNER },
    batchId: BATCH, roundId: ROUND, loadTrustedContext: f.context });
  assert.deepEqual(result, { status: 404, body: { error: 'feature_disabled' } });
  assert.equal(f.reads.length, 0); assert.equal(f.rpcCalls.length, 0); assert.equal(f.contextCalls, 0);
});

await check('protected refill appends one bounded regular batch with full snapshot CAS', async () => {
  const f = fixture(); const result = await f.call();
  assert.equal(result.status, 200); assert.equal(result.body.added_reserve_count, 6);
  assert.deepEqual(Object.keys(result.body).sort(), ['added_reserve_count', 'batch_id', 'idempotent', 'ok', 'reserve_count', 'round_id']);
  const write = f.writes()[0].args; assert.equal(write.p_prompts.length, 6);
  const keys = write.p_prompts.map((row) => row.content_ref.key);
  assert.deepEqual(new Set(keys.slice(0, 5)), new Set(['refill-5', 'refill-8', 'refill-9', 'refill-10', 'refill-11']));
  assert.equal(keys[5], 'refill-4');
  for (const forbidden of ['refill-0', 'refill-1', 'refill-2', 'refill-3', 'refill-6', 'refill-7']) {
    assert.equal(keys.includes(forbidden), false);
  }
  assert.ok(write.p_prompts.every((row) => row.srs_bonus === false && typeof row.golden === 'boolean'
    && /^[0-9a-f]{64}$/.test(row.record_hash)));
});

await check('saved receipt replays before context, evidence or Golden redraw', async () => {
  const f = fixture(); await f.call(); const writes = f.writes().length; const calls = f.contextCalls;
  f.rpcCalls.length = 0;
  const result = await f.call({ loadTrustedContext: () => { throw new Error('must not run'); } });
  assert.equal(result.status, 200); assert.equal(result.body.idempotent, true);
  assert.equal(f.contextCalls, calls); assert.equal(f.writes().length, 0); assert.equal(writes, 1);
});

await check('lost committed response retains batch identity and retry reads the receipt', async () => {
  const f = fixture(); f.loseWrite = true;
  const lost = await f.call(); assert.equal(lost.status, 503); assert.equal(lost.body.batch_id, BATCH);
  assert.equal(lost.body.retry_same_batch, true); assert.equal(f.receipts.has(BATCH), true);
  const contexts = f.contextCalls; const retried = await f.call();
  assert.equal(retried.status, 200); assert.equal(retried.body.idempotent, true); assert.equal(f.contextCalls, contexts);
});

await check('replay conflict converges on the already committed winner receipt', async () => {
  const f = fixture(); f.refillReason = 'replay_conflict';
  const prompt = { content_ref: { source: 'game_words', key: 'refill-5' }, answer: 'answer-5',
    catalog_version: 'free-canonical-v1', record_hash: '6'.padStart(64, '0'), golden: false, srs_bonus: false };
  const response = { ok: true, idempotent: false, batch_id: BATCH, round_id: ROUND,
    added_reserve_count: 1, reserve_count: 3 };
  const originalRpc = f.admin.rpc;
  f.admin.rpc = (name, args) => {
    const query = originalRpc(name, args);
    if (name !== 'phase1_typing_round_refill') return query;
    f.receipts.set(BATCH, { batch_id: BATCH, user_id: OWNER, round_id: ROUND,
      request_hash: refillHash(), request_payload: { round_id: ROUND, expected_reserve_count: 2, prompts: [prompt] }, response });
    return query;
  };
  const result = await f.call();
  assert.equal(result.status, 200); assert.equal(result.body.idempotent, true);
  assert.equal(result.body.added_reserve_count, 1);
});

await check('owner isolation and state CAS failures never append a batch', async () => {
  let f = fixture(); let result = await f.call({ user: { id: OTHER } });
  assert.equal(result.status, 404); assert.equal(result.body.error, 'round_not_found'); assert.equal(f.writes().length, 0);
  for (const reason of ['round_not_active', 'resync_required', 'typing_canonical_changed']) {
    f = fixture(); f.refillReason = reason; result = await f.call();
    assert.equal(result.status, 409); assert.equal(result.body.error, reason);
  }
});

await check('malformed reserve pages and snapshot disagreement fail before context or write', async () => {
  for (const corrupt of [
    (page) => { page.reserve_page[0].record_hash = 'bad'; },
    (page) => { page.reserve.reserve_cursor = 3; },
    (page) => { page.round.next_event_sequence = 7; },
    (page) => { page.next_reserve_after = 1; },
  ]) {
    const f = fixture(); f.corruptReserve = corrupt; const result = await f.call();
    assert.ok([409, 503].includes(result.status)); assert.equal(f.contextCalls, 0); assert.equal(f.writes().length, 0);
  }
});

await check('receipt corruption fails closed without exposing private prompt payload', async () => {
  const f = fixture(); await f.call(); f.receipts.get(BATCH).request_payload.prompts[0].record_hash = 'bad';
  const result = await f.call(); assert.equal(result.status, 503); assert.equal(result.body.error, 'invalid_typing_evidence');
  assert.equal(result.body.refill_committed, undefined); assert.equal(result.body.retry_same_batch, undefined);
  assert.equal(JSON.stringify(result).includes('answer-'), false);
});

await check('saved receipt identity collisions are permanent replay conflicts', async () => {
  const f = fixture(); await f.call();
  for (const overrides of [{ user: { id: OTHER } }, { roundId: OTHER_ROUND }]) {
    const result = await f.call(overrides); assert.equal(result.status, 409);
    assert.equal(result.body.error, 'replay_conflict'); assert.equal(result.body.retry_same_batch, undefined);
    assert.equal(result.body.refill_committed, undefined);
  }
});

await check('malformed write success is uncertain, never falsely confirmed', async () => {
  const f = fixture(); f.corruptWrite = (response) => { response.reserve_count += 1; };
  const result = await f.call(); assert.equal(result.status, 503);
  assert.equal(result.body.error, 'invalid_typing_evidence'); assert.equal(result.body.batch_id, BATCH);
  assert.equal(result.body.retry_same_batch, true); assert.equal(result.body.refill_committed, undefined);
  assert.equal(f.receipts.has(BATCH), true);
});

await check('protected wrapper remains explicit while the live entrypoint owns activation', async () => {
  const f = fixture(); const result = await handleTypingReserveRefillWithProtectedContext({
    admin: f.admin, user: { id: OWNER }, batchId: BATCH, roundId: ROUND,
  });
  assert.equal(result.status, 404); assert.equal(f.rpcCalls.length, 0);
  const entrypoint = fs.readFileSync(new URL('../supabase/functions/score-submit/index.ts', import.meta.url), 'utf8');
  assert.match(entrypoint, /typing-reserve-refill/);
  assert.match(entrypoint, /handleTypingReserveRefillWithProtectedContext/);
});

console.log(`TYPING_RESERVE_REFILL_PASS ${passed}`);
