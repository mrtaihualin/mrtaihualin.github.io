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
assert.strictEqual(Review.predictedScore('word_order', { wrong_count: 1, learning_evidence: { hintCount: 2 } }), 3);

(async () => {
  const calls = [];
  const client = Review.create({ enabled: true, invoke(body) { calls.push(body); return body.action === 'review_queue' ? { ok: true, items: [] } : { ok: true, to_state: 'weak_4d' }; } });
  await client.loadQueue({ game: 'reading', level: 1, playSetSize: 5 });
  await client.commit({ game: 'reading', level: 1, roundId: 'round', operationId: 'op', item: { content_ref: { source: 'game_words', key: 'กา@初' } } });
  assert.deepStrictEqual(calls.map(x => x.action), ['review_queue', 'review_commit']);
  assert.throws(() => Review.create({ enabled: false, invoke() {} }), /FEATURE_DISABLED/);

  global.LOGIN_FREE_REVIEW_PUBLIC_ENTRY = true;
  global.GAME_CONTENT_TIER = 'anon';
  global.SITE_AUTH = { user: null };
  assert.strictEqual(Review.runtimeEnabled(), false, 'initial anonymous tier with no user keeps Review off');
  global.SITE_AUTH.user = { id: 'controlled-test' };
  assert.strictEqual(Review.runtimeEnabled(), false, 'restored user cannot enable Review while content tier is still anonymous');
  global.GAME_CONTENT_TIER = 'login';
  assert.strictEqual(Review.runtimeEnabled(), true, 'Review enables only after the restored session receives the Login Free tier');
  global.NetworkGuard = { request(fn) { return fn(); } };
  assert.throws(() => Review.registerRound({
    report: { round_id: 'listening-contract-check', game_type: 'listening', difficulty: '初' },
    game: 'listening', level: 1, idOf: x => x.id, contentRefOf: x => x.ref
  }), /INVALID_GAME/, 'Listening is outside the Review contract');
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
  await Review.handleItemComplete({ detail: {
    game_type: report.game_type,
    round_id: report.round_id,
    item: { key: original.ref.key, content_ref: original.ref, learning_evidence: { firstCheckSyllableWrongCounts: [3] }, wrong_count: 3 }
  } });
  assert.strictEqual(retryItems.length, 1, 'due Weak+4 gets the one same-round retry');
  assert.deepStrictEqual(runtimeCalls.map(x => x.action), ['review_queue', 'review_commit']);
  const callsBeforeSkip = runtimeCalls.length;
  const skipped = await Review.handleItemComplete({ detail: {
    game_type: report.game_type,
    round_id: report.round_id,
    item: { key: original.ref.key, content_ref: original.ref, is_skipped: true, skip_reason: 'user_skip' }
  } });
  assert.deepStrictEqual(skipped, { ok: true, skipped: true }, 'neutral Skip is acknowledged locally');
  assert.strictEqual(runtimeCalls.length, callsBeforeSkip, 'neutral Skip never reaches the Review transport');
  assert.strictEqual(Review.runtimeEnabled(), true, 'Login Free authenticated owner enables Review');
  const errorReport = { round_id: '00000000-0000-4000-8000-000000000002', game_type: 'typing', difficulty: '初' };
  const errorOriginal = { id: 2, ref: { source: 'game_words', key: 'เดิน@初' } };
  Review.registerRound({ report: errorReport, game: 'typing', level: 1, allItems: [errorOriginal], srsOwned: [], selectedReview: [], idOf: x => x.id, contentRefOf: x => x.ref });
  global.getSupabaseClient = () => ({ functions: { invoke() {
    const context = { status: 400, clone() { return this; }, json() { return Promise.resolve({ error: 'invalid_wrong_count' }); } };
    return Promise.resolve({ data: null, error: { context } });
  } } });
  await assert.rejects(() => Review.processItem(errorReport, {
    key: errorOriginal.ref.key, content_ref: errorOriginal.ref, wrong_count: 4,
    item_score: 0, is_correct: false, linguistic: { syls: [{}] }
  }), error => error.code === 'invalid_wrong_count' && error.status === 400,
  'browser transport preserves the server review error code for safe diagnosis');
  global.GAME_CONTENT_TIER = 'paid';
  assert.strictEqual(Review.runtimeEnabled(), false, 'Paid is outside the Login Free Review owner');
  global.GAME_CONTENT_TIER = 'guest';
  assert.strictEqual(Review.runtimeEnabled(), false, 'Guest is outside the Login Free Review owner');
  console.log('LEARNING_REVIEW_RUNTIME_PASS 24');
})().catch((error) => { console.error(error); process.exitCode = 1; });
