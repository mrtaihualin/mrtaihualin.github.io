#!/usr/bin/env node
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Review = require('../js/games/learning-review.js');
const GameFlowSource = fs.readFileSync(path.join(__dirname, '../js/games/game-flow.js'), 'utf8');

function storage() {
  const data = {};
  return { getItem(k) { return data[k] || null; }, setItem(k, v) { data[k] = v; }, data };
}
function rows(n, prefix) { return Array.from({ length: n }, (_, i) => ({ id: prefix + (i + 1) })); }
function simpleSrs(input) { return { items: (input.due || []).concat(input.regular || []).slice(0, input.total) }; }

assert.strictEqual(Review.FEATURE_DEFAULT_ENABLED, false);
const s1 = storage();
let selected = 0;
for (let i = 0; i < 5; i++) {
  const out = Review.allocate({ total: 1, reviewDue: rows(5, 'r'), srsDue: [], regular: rows(5, 'n'), idOf: x => x.id, scope: 'tone-high', storage: s1, allocateSrs: simpleSrs });
  selected += out.selectedReview.length;
}
assert.strictEqual(selected, 1, '1+1+1+1+1 cumulatively allocates one Review item');

const s2 = storage();
const first = Review.allocate({ total: 3, reviewDue: rows(3, 'r'), srsDue: [], regular: rows(3, 'n'), idOf: x => x.id, scope: 'word-order', storage: s2, allocateSrs: simpleSrs });
const second = Review.allocate({ total: 2, reviewDue: rows(3, 'r'), srsDue: [], regular: rows(3, 'n'), idOf: x => x.id, scope: 'word-order', storage: s2, allocateSrs: simpleSrs });
assert.strictEqual(first.selectedReview.length, 0);
assert.strictEqual(second.selectedReview.length, 1, '3+2 cumulatively allocates one Review item');
assert.strictEqual(second.items[0].id, 'r1', 'Review is the front-priority group');

const s3 = storage();
Review.allocate({ total: 3, reviewDue: rows(3, 'r'), srsDue: [], regular: rows(3, 'n'), idOf: x => x.id, scope: 'refresh', storage: s3, allocateSrs: simpleSrs });
const refreshed = Review.allocate({ total: 2, reviewDue: rows(3, 'r'), srsDue: [], regular: rows(3, 'n'), idOf: x => x.id, scope: 'refresh', storage: s3, allocateSrs: simpleSrs });
assert.strictEqual(refreshed.selectedReview.length, 1, 'fractional carry survives refresh storage');

const overlap = { id: 'same' };
const isolated = Review.allocate({ total: 5, reviewDue: [overlap, overlap], srsDue: [overlap, { id: 'srs' }], regular: [overlap, { id: 'normal' }], idOf: x => x.id, scope: 'dedupe', storage: storage(), allocateSrs: simpleSrs });
assert.deepStrictEqual(isolated.items.map(x => x.id), ['same', 'srs', 'normal']);
assert.strictEqual(isolated.reviewCarryOver.length, 0);
assert.match(GameFlowSource, /quotaTotal/);
assert.strictEqual(Review.predictedScore('tone', { learning_evidence: { componentWrongCounts: [0, 4] }, wrong_count: 0 }), 5);
assert.strictEqual(Review.predictedScore('reading', { learning_evidence: { firstCheckSyllableWrongCounts: [3] } }), 1);
assert.strictEqual(Review.predictedScore('typing', { wrong_count: 4, linguistic: { syls: [{}] } }), 0);
assert.strictEqual(Review.predictedScore('listening', { is_correct: true, listen_count: 3, linguistic: { answer_mode: 'mc' } }), 3);
assert.strictEqual(Review.predictedScore('word_order', { wrong_count: 1, learning_evidence: { hintCount: 2 } }), 3);

(async () => {
  const calls = [];
  const client = Review.create({ enabled: true, invoke(body) { calls.push(body); return body.action === 'review_queue' ? { ok: true, items: [] } : { ok: true, to_state: 'weak_4d' }; } });
  await client.loadQueue({ game: 'reading', level: 1, playSetSize: 5 });
  await client.commit({ game: 'reading', level: 1, roundId: 'round', operationId: 'op', item: { content_ref: { source: 'game_words', key: 'กา@初' } } });
  assert.deepStrictEqual(calls.map(x => x.action), ['review_queue', 'review_commit']);
  assert.throws(() => Review.create({ enabled: false, invoke() {} }), /FEATURE_DISABLED/);

  global.LOGIN_FREE_REVIEW_PUBLIC_ENTRY = true;
  global.SITE_AUTH = { user: { id: 'controlled-test' } };
  global.NetworkGuard = { request(fn) { return fn(); } };
  const runtimeCalls = [];
  global.getSupabaseClient = () => ({ functions: { invoke(name, options) {
    runtimeCalls.push(options.body);
    if (options.body.action === 'review_queue') return Promise.resolve({ data: { ok: true, items: [{ content_ref: { source: 'game_words', key: 'weak@初' }, state: 'weak_4d' }] }, error: null });
    return Promise.resolve({ data: { ok: true, to_state: 'retry_end_round' }, error: null });
  } } });
  await Review.prime({ game: 'reading', level: 1, playSetSize: 5 });
  const retryItems = [];
  const report = { round_id: '00000000-0000-4000-8000-000000000001', game_type: 'reading', difficulty: '初' };
  const original = { id: 1, ref: { source: 'game_words', key: 'weak@初' } };
  Review.registerRound({ report, game: 'reading', level: 1, allItems: [original], srsOwned: [], selectedReview: [original], idOf: x => x.id, contentRefOf: x => x.ref, retry: x => retryItems.push(x) });
  await Review.processItem(report, { content_ref: original.ref, learning_evidence: { firstCheckSyllableWrongCounts: [3] }, wrong_count: 3 });
  assert.strictEqual(retryItems.length, 1, 'due Weak+4 gets the one same-round retry');
  assert.deepStrictEqual(runtimeCalls.map(x => x.action), ['review_queue', 'review_commit']);
  console.log('LEARNING_REVIEW_RUNTIME_PASS 15');
})().catch((error) => { console.error(error); process.exitCode = 1; });
