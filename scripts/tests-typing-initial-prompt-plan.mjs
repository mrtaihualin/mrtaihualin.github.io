#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildTypingInitialPromptPlan as plan, buildTypingInitialRoundAllocation as allocate,
  buildTypingReserveRefillPlan as refill } from '../supabase/functions/score-submit/typing-initial-prompt-plan.mjs';
import { buildTypingResumeCheckpoint } from '../supabase/functions/score-submit/typing-resume-checkpoint.mjs';

let passed = 0;
function check(name, fn) { fn(); passed++; console.log('PASS ' + name); }
const today = '2026-09-23';
function fixture(count = 8, level = 1) {
  const code = level === 1 ? '初' : '中';
  const canonicalRows = Array.from({ length: count }, (_, i) => ({ content_key: `fixture-${i}`,
    level: code, status: 'active', access_tier: 'login',
    catalog_version: 'free-canonical-v1', record_hash: (i + 1).toString(16).padStart(64, '0'),
    canonical_record: { contentKey: `fixture-${i}`, word: `answer-${i}`, level: code, syllables: [{}] } }));
  const snapshots = canonicalRows.map((row, i) => ({ item_id: `fixture-item-${i}`, state_token: `normal:${i}`,
    content_ref: { source: 'game_words', key: row.content_key }, state: 'normal', stage: null, due_on: null }));
  return { level, today, snapshots, canonicalRows };
}
const key = (row) => row.content_ref.key;
const fixed = () => 99;
function state(f, i, patch) { Object.assign(f.snapshots[i], patch); }
function rejects(f, code) { assert.throws(() => plan(f, fixed), (error) => error.code === code); }

check('exactly five unique canonical prompts at both Free levels; no input mutation', () => {
  for (const level of [1, 2]) {
    const f = fixture(100, level); const before = JSON.stringify(f);
    const result = plan(f, fixed);
    assert.equal(result.length, 5); assert.equal(new Set(result.map(key)).size, 5);
    for (const row of result) {
      assert.deepEqual(Object.keys(row), ['content_ref', 'answer', 'catalog_version', 'record_hash', 'golden', 'srs_bonus']);
      assert.equal(row.answer, f.canonicalRows.find((item) => item.content_key === key(row)).canonical_record.word);
      assert.equal(row.catalog_version, 'free-canonical-v1'); assert.match(row.record_hash, /^[0-9a-f]{64}$/);
      assert.equal(row.golden, false); assert.equal(row.srs_bonus, false);
    }
    assert.equal(JSON.stringify(f), before);
  }
});
check('independent Review/SRS caps and Next Day priority regardless of catalog order', () => {
  const f = fixture(12);
  state(f, 0, { state: 'review_needed', due_on: today });
  state(f, 1, { state: 'next_day_check', due_on: today });
  state(f, 2, { state: 'weak_4d', due_on: today });
  for (const i of [3, 4]) state(f, i, { state: 'srs', stage: 1, due_on: today });
  const result = plan(f, fixed); const keys = result.map(key);
  assert.equal(keys[0], 'fixture-1'); assert.equal(keys.filter((v) => ['fixture-0', 'fixture-1', 'fixture-2'].includes(v)).length, 1);
  assert.equal(keys.filter((v) => ['fixture-3', 'fixture-4'].includes(v)).length, 1);
  assert.equal(result.filter((row) => row.srs_bonus).length, 1);
});
check('Review Needed is not forced into the first slot', () => {
  const f = fixture(5); state(f, 0, { state: 'review_needed', due_on: today });
  const result = plan(f, () => 0);
  assert.notEqual(key(result[0]), 'fixture-0'); assert.ok(result.some((row) => key(row) === 'fixture-0'));
});
check('shared classifier excludes not-due, mastered, Retry and unresolved identity; ignores forged bucket', () => {
  const f = fixture(11);
  const patches = [
    { state: 'srs', stage: 1, due_on: '2026-09-24' },
    { state: 'mastered', stage: 3, mastered: true },
    { state: 'retry_end_round' }, { state: 'next_day_check', due_on: '2026-09-24' },
    { state: 'weak_4d', due_on: '2026-09-24' }, { state: 'legacy_identity_unresolved' },
  ];
  patches.forEach((patch, i) => state(f, i, { ...patch, bucket: 'regular_or_new' }));
  assert.deepEqual(plan(f, fixed).map(key).sort(), f.snapshots.slice(6).map(key).sort());
});
check('insufficient eligible unique content fails before randomness, without due overflow fallback', () => {
  const f = fixture(8);
  for (let i = 0; i < 5; i++) state(f, i, { state: 'srs', stage: 1, due_on: today });
  assert.throws(() => plan(f, () => { throw new Error('must not draw'); }), /insufficient_eligible_items/);
  rejects(fixture(4), 'insufficient_eligible_items');
});
check('duplicate item IDs, aliases and missing canonical matches fail shut', () => {
  let f = fixture(); f.snapshots[1].item_id = f.snapshots[0].item_id; rejects(f, 'invalid_typing_snapshot');
  f = fixture(); f.snapshots[1].content_ref = f.snapshots[0].content_ref; rejects(f, 'invalid_typing_snapshot');
  f = fixture(); f.canonicalRows.pop(); rejects(f, 'invalid_typing_snapshot');
  f = fixture(); f.canonicalRows.push(f.canonicalRows[0]); rejects(f, 'invalid_typing_catalog');
});
check('inactive, Paid, mismatched and malformed canonical records are never issued', () => {
  const mutate = [r => r.status = 'inactive', r => r.access_tier = 'paid', r => r.level = '中',
    r => r.catalog_version = '', r => r.record_hash = 'bad',
    r => r.canonical_record.contentKey = 'other', r => r.canonical_record.level = '中',
    r => r.canonical_record.word = ' ', r => r.canonical_record.syllables = [],
    r => r.canonical_record.word = 'a'.repeat(513)];
  for (const change of mutate) { const f = fixture(); change(f.canonicalRows[0]); rejects(f, 'invalid_typing_catalog'); }
});
check('High, invalid days and inconsistent Free SRS stages rejected', () => {
  rejects({ ...fixture(), level: 3 }, 'invalid_typing_level');
  rejects({ ...fixture(), today: '2026-02-30' }, 'invalid_typing_day');
  for (const stage of [3, '1', '3', -1, 4]) {
    const f = fixture(); state(f, 0, { state: 'srs', stage, due_on: today }); rejects(f, 'invalid_typing_snapshot');
  }
});
check('SRS bonus eligible only for due Day 1/7 stages, never stage zero or Review', () => {
  for (const stage of [0, 1, 2]) {
    const f = fixture(5); state(f, 0, { state: 'srs', stage, due_on: today });
    const result = plan(f, fixed).find((row) => key(row) === 'fixture-0');
    assert.equal(result.srs_bonus, stage > 0);
  }
});
check('Golden independent exact 18/100, with no guaranteed per-round count', () => {
  for (let bucket = 0; bucket < 100; bucket++) {
    const result = plan(fixture(5), () => bucket);
    assert.ok(result.every((row) => row.golden === (bucket < 18)));
  }
  let calls = 0; const values = [0, 17, 18, 99, 1];
  const result = plan(fixture(5), () => ++calls <= 8 ? 0 : values[calls - 9]);
  assert.deepEqual(result.map((row) => row.golden), [true, true, false, false, true]);
  assert.equal(calls, 13);
});
check('unbiased random rejection and bounded entropy failure', () => {
  let calls = 0;
  const result = plan(fixture(5), () => ++calls === 9 ? 0xffffffff : 0);
  assert.equal(calls, 14); assert.ok(result.every((row) => row.golden));
  for (const value of [-1, 0x100000000, 0.5, NaN]) assert.throws(() => plan(fixture(), () => value), /invalid_typing_random/);
  assert.throws(() => plan(fixture(5), () => 0xffffffff), /typing_random_unavailable/);
});
check('prepared output is reducer-compatible; persisted replay keeps Golden without redrawing', () => {
  const f = fixture(5); const prompts = JSON.parse(JSON.stringify(plan(f, () => 0)));
  const input = { serverRound: { roundId: '20000000-0000-4000-8000-000000000001', game: 'typing',
    difficulty: '初', startingCombo: 4, prompts: prompts.map((p) => ({ contentRef: p.content_ref, golden: p.golden, srsBonus: p.srs_bonus })) },
    serverEvents: [], canonicalRows: f.canonicalRows.map((r) => ({ content_key: r.content_key,
      word: r.canonical_record.word, level: r.level, syllables: r.canonical_record.syllables })) };
  const result = buildTypingResumeCheckpoint(input);
  assert.deepEqual(buildTypingResumeCheckpoint(input), result);
  assert.equal(result.combo, 4);
  const service = fs.readFileSync(new URL('../supabase/functions/score-submit/typing-round-service.mjs', import.meta.url), 'utf8');
  assert.match(service, /TYPING_ROUND_ACTIONS_ENABLED = false/);
  assert.doesNotMatch(service, /typing-initial-prompt-plan/);
});
check('initial allocation persists five prompts plus one bounded ordered reserve batch', () => {
  const f = fixture(100); const before = JSON.stringify(f);
  const result = allocate(f, fixed);
  assert.equal(result.prompts.length, 5); assert.equal(result.reservePrompts.length, 64);
  assert.deepEqual(result.prompts, plan(f, fixed));
  assert.equal(new Set([...result.prompts, ...result.reservePrompts].map(key)).size, 69);
  assert.ok(result.reservePrompts.every((row) => row.srs_bonus === false));
  assert.equal(JSON.stringify(f), before);
});
check('reserve never absorbs Due overflow, Retry, non-due or Mastered content', () => {
  const f = fixture(12);
  state(f, 0, { state: 'next_day_check', due_on: today });
  state(f, 1, { state: 'review_needed', due_on: today });
  state(f, 2, { state: 'srs', stage: 1, due_on: today });
  state(f, 3, { state: 'srs', stage: 2, due_on: today });
  state(f, 4, { state: 'retry_end_round' });
  state(f, 5, { state: 'srs', stage: 1, due_on: '2026-09-24' });
  state(f, 6, { state: 'mastered', stage: 3, mastered: true });
  const result = allocate(f, fixed); const all = [...result.prompts, ...result.reservePrompts].map(key);
  assert.equal(all.includes('fixture-0'), true); assert.equal(all.includes('fixture-2') || all.includes('fixture-3'), true);
  for (const excluded of ['fixture-1', 'fixture-4', 'fixture-5', 'fixture-6']) assert.equal(all.includes(excluded), false);
  assert.deepEqual(result.reservePrompts.map(key).sort(), f.snapshots.slice(7).map(key).filter((v) => !result.prompts.map(key).includes(v)).sort());
});
check('bounded refill prefers never-issued regular identities before recycled Skips', () => {
  const f = fixture(80);
  const result = refill({ ...f,
    issuedKeys: f.snapshots.slice(0, 8).map(key),
    completedKeys: f.snapshots.slice(0, 2).map(key),
    queuedKeys: f.snapshots.slice(2, 4).map(key),
  }, fixed);
  assert.equal(result.length, 64);
  assert.ok(result.every((row) => Number(key(row).split('-')[1]) >= 8));
  assert.ok(result.every((row) => row.srs_bonus === false));
});
check('refill recycles eligible skipped regular identities only after unseen pool', () => {
  const f = fixture(8);
  const result = refill({ ...f,
    issuedKeys: f.snapshots.slice(0, 6).map(key), completedKeys: [key(f.snapshots[0])],
    queuedKeys: [key(f.snapshots[1])],
  }, fixed);
  assert.deepEqual(new Set(result.slice(0, 2).map(key)), new Set(['fixture-6', 'fixture-7']));
  assert.deepEqual(new Set(result.slice(2).map(key)), new Set(['fixture-2', 'fixture-3', 'fixture-4', 'fixture-5']));
});
check('refill never admits Due, Retry, non-due, Mastered or unresolved content', () => {
  const f = fixture(9);
  const patches = [
    { state: 'next_day_check', due_on: today }, { state: 'srs', stage: 1, due_on: today },
    { state: 'retry_end_round' }, { state: 'srs', stage: 1, due_on: '2026-09-24' },
    { state: 'mastered', stage: 3, mastered: true }, { state: 'legacy_identity_unresolved' },
  ];
  patches.forEach((patch, i) => state(f, i, patch));
  const result = refill({ ...f, issuedKeys: [], completedKeys: [], queuedKeys: [] }, fixed);
  assert.deepEqual(new Set(result.map(key)), new Set(['fixture-6', 'fixture-7', 'fixture-8']));
});
check('refill evidence fails closed for impossible sets and an exhausted pool', () => {
  let f = fixture(5);
  assert.throws(() => refill({ ...f, issuedKeys: [], completedKeys: ['fixture-0'], queuedKeys: [] }, fixed),
    /invalid_typing_refill_evidence/);
  assert.throws(() => refill({ ...f, issuedKeys: ['fixture-0'], completedKeys: ['fixture-0'],
    queuedKeys: ['fixture-0'] }, fixed), /invalid_typing_refill_evidence/);
  assert.throws(() => refill({ ...f, issuedKeys: f.snapshots.map(key), completedKeys: [],
    queuedKeys: f.snapshots.map(key) }, fixed), /typing_refill_unavailable/);
});
console.log(`Typing initial prompt plan: ${passed}/${passed} PASS`);
