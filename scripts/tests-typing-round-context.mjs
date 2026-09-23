#!/usr/bin/env node
import assert from 'node:assert/strict';
import { loadTypingInitialRoundContext } from '../supabase/functions/score-submit/typing-round-context.mjs';

const OWNER = '10000000-0000-4000-8000-000000000001';
const OTHER = '10000000-0000-4000-8000-000000000002';
const ROUND = '20000000-0000-4000-8000-000000000001';
const TODAY = '2026-09-23';
let passed = 0;
async function check(name, fn) { await fn(); passed++; console.log('PASS ' + name); }

function fixture({ previous = true, level = 1 } = {}) {
  const code = level === 1 ? '初' : '中';
  const canonical = Array.from({ length: 8 }, (_, i) => ({
    content_key: `context-${i + 1}`, level: code, status: 'active', access_tier: 'login',
    canonical_record: { contentKey: `context-${i + 1}`, level: code,
      word: `answer-${i + 1}`, syllables: [{}] },
  }));
  const items = canonical.map((row, i) => ({ item_id: `item-${i + 1}`,
    content_source: 'game_words', content_key: row.content_key }));
  const prompts = canonical.slice(0, 5).map((row, i) => ({ prompt_ordinal: i + 1,
    content_ref: { source: 'game_words', key: row.content_key }, answer: row.canonical_record.word,
    golden: false, srs_bonus: false }));
  const events = prompts.map((prompt, i) => ({ operation_id: `30000000-0000-4000-8000-00000000000${i + 1}`,
    sequence: i + 1, prompt_ordinal: i + 1, content_ref: prompt.content_ref,
    type: 'completed', answer: prompt.answer }));
  const reads = [];
  const query = (table) => {
    const state = { table, filters: [], selected: '', limit: null, orders: [], signal: null };
    const q = {
      select(value) { state.selected = value; return q; },
      eq(field, value) { state.filters.push(['eq', field, value]); return q; },
      in(field, value) { state.filters.push(['in', field, value]); return q; },
      is(field, value) { state.filters.push(['is', field, value]); return q; },
      limit(value) { state.limit = value; return q; },
      order(field, value) { state.orders.push([field, value]); return q; },
      retry(value) { assert.equal(value, false); return q; },
      abortSignal(value) { state.signal = value; return q; },
      then(resolve, reject) {
        return Promise.resolve().then(() => {
          state.signal?.throwIfAborted(); reads.push(structuredClone({ ...state, signal: Boolean(state.signal) }));
          if (table === 'game_words') {
            const keys = state.filters.find((row) => row[0] === 'in' && row[1] === 'content_key')?.[2];
            return { data: structuredClone(keys ? canonical.filter((row) => keys.includes(row.content_key)) : canonical) };
          }
          if (table === 'learning_items') {
            const keys = state.filters.find((row) => row[0] === 'in' && row[1] === 'content_key')?.[2];
            return { data: structuredClone(keys ? items.filter((row) => keys.includes(row.content_key)) : items) };
          }
          if (table === 'phase1_learning_review_states' || table === 'tone_srs_state') return { data: [] };
          if (table === 'phase1_typing_rounds') return { data: previous ? [{ round_id: ROUND }] : [] };
          throw new Error('unexpected table ' + table);
        }).then(resolve, reject);
      },
    };
    return q;
  };
  const f = { canonical, items, prompts, events, reads, corrupt: null };
  f.admin = {
    from: query,
    rpc(name, args) {
      assert.equal(name, 'phase1_typing_round_load');
      assert.equal(args.p_user_id, OWNER); assert.equal(args.p_round_id, ROUND);
      const result = { ok: true, round: { round_id: ROUND, game: 'typing', level, starting_combo: 0,
        prompt_count: 5, next_event_sequence: 6, current_prompt_ordinal: 6,
        completed_count: 5, skip_count: 0, status: 'completed' },
      prompt_page: structuredClone(prompts), event_page: structuredClone(events),
      next_prompt_after: 5, next_event_after: 5, has_more_prompts: false, has_more_events: false };
      f.corrupt?.(result);
      let signal;
      return { retry(value) { assert.equal(value, false); return this; },
        abortSignal(value) { signal = value; return this; },
        then(resolve, reject) { return Promise.resolve().then(() => {
          signal?.throwIfAborted(); return { data: result };
        }).then(resolve, reject); } };
    },
  };
  f.load = (overrides = {}) => loadTypingInitialRoundContext({ admin: f.admin, userId: OWNER,
    level, today: TODAY, signal: AbortSignal.timeout(1000), ...overrides });
  return f;
}

await check('first protected round receives explicit zero and server-owned catalog/state', async () => {
  const f = fixture({ previous: false }); const result = await f.load();
  assert.equal(result.startingCombo, 0); assert.equal(result.today, TODAY);
  assert.equal(result.snapshots.length, 8); assert.equal(result.canonicalRows.length, 8);
  assert.ok(result.snapshots.every((row) => row.state === 'normal' && row.bucket === 'regular_or_new'));
  const roundRead = f.reads.find((row) => row.table === 'phase1_typing_rounds');
  assert.deepEqual(roundRead.filters, [['eq', 'user_id', OWNER], ['eq', 'status', 'completed']]);
  assert.deepEqual(roundRead.orders, [['completed_at', { ascending: false }], ['round_id', { ascending: false }]]);
});

await check('latest completed server evidence carries Combo across level-independent round start', async () => {
  const f = fixture(); const result = await f.load();
  assert.equal(result.startingCombo, 5);
  assert.ok(!JSON.stringify(result).includes(ROUND));
});

await check('counted prior wrong resets the carried Combo', async () => {
  const f = fixture();
  f.events.splice(4, 0, { operation_id: '30000000-0000-4000-8000-000000000009', sequence: 5,
    prompt_ordinal: 5, content_ref: f.prompts[4].content_ref, type: 'wrong' });
  f.events[5].sequence = 6;
  f.corrupt = (result) => { result.round.next_event_sequence = 7; result.event_page = structuredClone(f.events);
    result.next_event_after = 6; };
  assert.equal((await f.load()).startingCombo, 0);
});

await check('missing or malformed prior evidence fails closed instead of defaulting Combo to zero', async () => {
  for (const corrupt of [
    (result) => { result.round.status = 'active'; result.round.completed_count = 4; result.round.current_prompt_ordinal = 5; },
    (result) => { result.prompt_page[0].answer = 'changed-answer'; },
    (result) => { result.event_page.pop(); result.next_event_after = 4; },
  ]) {
    const f = fixture(); f.corrupt = corrupt;
    await assert.rejects(f.load());
  }
});

await check('owner, level and day are server-contract validated', async () => {
  const f = fixture({ previous: false });
  await assert.rejects(f.load({ userId: OTHER.slice(0, -1) + 'x' }), /unauthorized/);
  await assert.rejects(f.load({ level: 3 }), /invalid_typing_level/);
  await assert.rejects(f.load({ today: '2026-02-30' }), /invalid_typing_day/);
});

await check('aborted protected context never returns partial state', async () => {
  const f = fixture({ previous: false }); const controller = new AbortController(); controller.abort();
  await assert.rejects(f.load({ signal: controller.signal }), (error) => error?.name === 'AbortError');
});

await check('null or malformed learning-state payload never becomes normal state', async () => {
  for (const table of ['phase1_learning_review_states', 'tone_srs_state']) {
    const f = fixture({ previous: false }); const original = f.admin.from;
    f.admin.from = (name) => {
      if (name !== table) return original(name);
      return { select() { return this; }, eq() { return this; }, limit() { return this; }, retry() { return this; },
        abortSignal() { return this; }, then(resolve, reject) { return Promise.resolve({ data: null, error: null }).then(resolve, reject); } };
    };
    await assert.rejects(f.load(), /learning_queue_unavailable/);
  }
});

console.log(`TYPING_ROUND_CONTEXT_PASS ${passed}`);
