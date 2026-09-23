#!/usr/bin/env node
import assert from 'node:assert/strict';
import { planTypingContinuation as plan } from '../supabase/functions/score-submit/typing-continuation-plan.mjs';
import { buildTypingResumeCheckpoint as reduce } from '../supabase/functions/score-submit/typing-resume-checkpoint.mjs';

let passed = 0;
function check(name, fn) { fn(); passed++; console.log('PASS ' + name); }
const op = (n) => `30000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
const ref = (n) => ({ source: 'game_words', key: `fixture-${n}` });
const prompt = (n) => ({ content_ref: ref(n), answer: `answer-${n}`, golden: n % 2 === 0, srs_bonus: n % 3 === 0 });
const protectedPrompt = (p) => ({ contentRef: p.content_ref, golden: p.golden, srsBonus: p.srs_bonus });
function fixture(level = '初') {
  return { serverRound: { roundId: '20000000-0000-4000-8000-000000000001', game: 'typing',
    difficulty: level, startingCombo: 4, prompts: Array.from({ length: 5 }, (_, n) => protectedPrompt(prompt(n))) },
    canonicalRows: Array.from({ length: 100 }, (_, n) => ({ content_key: ref(n).key, word: `answer-${n}`, level, syllables: [{}] })),
    serverEvents: [], serverReserve: { cursor: 0, prompts: Array.from({ length: 400 }, (_, n) => prompt((n + 5) % 100)) },
    nextEventType: 'skipped' };
}
function event(f, type) {
  const before = reduce(f); const current = f.serverRound.prompts[before.currentPromptIndex];
  const row = { operationId: op(f.serverEvents.length + 1), sequence: f.serverEvents.length + 1,
    contentRef: current.contentRef, type };
  if (type === 'completed') row.answer = f.canonicalRows.find((r) => r.content_key === current.contentRef.key).word;
  f.serverEvents.push(row);
}
function prepareAndApply(f, type) {
  const result = plan({ ...f, nextEventType: type });
  // In-memory composition only, NOT a persistence/transaction test.
  f.serverRound.prompts.push(...result.prompts.map(protectedPrompt));
  f.serverReserve.cursor = result.nextReserveCursor;
  event(f, type);
  return result;
}
function atTail() { const f = fixture(); for (let i = 0; i < 4; i++) event(f, 'skipped'); return f; }

check('Skip always uses the existing next prompt, including an SRS prompt', () => {
  const f = fixture(); f.serverRound.prompts[1].srsBonus = true;
  const before = JSON.stringify(f); const result = plan(f);
  assert.equal(JSON.stringify(f), before); assert.deepEqual(result.prompts, []); assert.equal(result.nextReserveCursor, 0);
  event(f, 'skipped'); const after = reduce(f);
  assert.equal(after.currentPromptIndex, 1); assert.equal(after.completedCount, 0); assert.equal(after.skipCount, 1);
  assert.equal(f.serverRound.prompts[after.currentPromptIndex].srsBonus, true);
});
check('reserve order and issued entitlements are preserved, without category matching or random redraw', () => {
  for (const srs of [false, true]) {
    const f = atTail(); f.serverReserve.prompts[0].srs_bonus = srs;
    const before = JSON.stringify(f); const a = plan(f); const b = plan(f);
    assert.deepEqual(a, b); assert.equal(JSON.stringify(f), before);
    assert.deepEqual(a.prompts, [f.serverReserve.prompts[0]]);
    assert.equal(a.expectedPromptCount, 5); assert.equal(a.expectedEventSequence, 5);
    assert.equal(a.expectedReserveCursor, 0); assert.equal(a.nextReserveCursor, 1);
    a.prompts[0].content_ref.key = 'mutated'; assert.equal(f.serverReserve.prompts[0].content_ref.key, 'fixture-5');
  }
});
check('wrong/Hint never consume reserve or advance; final completion needs no replacement', () => {
  const f = atTail(); f.serverReserve.prompts = [];
  for (const type of ['wrong', 'hint_opened']) assert.deepEqual(plan({ ...f, nextEventType: type }).prompts, []);
  const done = fixture(); for (let i = 0; i < 4; i++) event(done, 'completed');
  done.serverReserve.prompts = [];
  assert.deepEqual(plan({ ...done, nextEventType: 'completed' }).prompts, []);
  assert.throws(() => plan({ ...done, nextEventType: 'skipped' }), /typing_reserve_exhausted/);
});
check('completion short of five appends successor when earlier prompts were skipped', () => {
  const f = atTail(); const result = prepareAndApply(f, 'completed'); const after = reduce(f);
  assert.equal(result.prompts.length, 1); assert.equal(after.completedCount, 1); assert.equal(after.complete, false);
  assert.equal(after.currentPromptIndex, 5);
});
check('completed identities are bypassed in order, including the proposed completion', () => {
  const f = fixture(); event(f, 'completed'); for (let i = 0; i < 3; i++) event(f, 'skipped');
  f.serverReserve.prompts = [prompt(0), prompt(4), prompt(9), prompt(8)];
  const result = plan({ ...f, nextEventType: 'completed' });
  assert.equal(result.prompts[0].content_ref.key, 'fixture-9'); assert.equal(result.nextReserveCursor, 3);
});
check('a skipped identity is not blacklisted or reclassified', () => {
  const f = atTail(); f.serverReserve.prompts = [prompt(0), prompt(6)];
  assert.equal(plan(f).prompts[0].content_ref.key, 'fixture-0');
});
check('reserve exhaustion fails shut and leaves all evidence unchanged', () => {
  const f = atTail(); f.serverReserve.prompts = []; const before = JSON.stringify(f);
  assert.throws(() => plan(f), /typing_reserve_exhausted/); assert.equal(JSON.stringify(f), before);
});
check('malformed cursor, entitlement, answer and canonical reserve fail shut', () => {
  for (const cursor of [-1, 0.5, 401, '0']) { const f = atTail(); f.serverReserve.cursor = cursor; assert.throws(() => plan(f), /invalid_typing_reserve/); }
  for (const mutate of [p => p.golden = 1, p => p.srs_bonus = null, p => p.answer = ' ', p => p.content_ref.source = 'game_sentences']) {
    const f = atTail(); mutate(f.serverReserve.prompts[0]); assert.throws(() => plan(f), /invalid_typing_reserve/);
  }
  for (const mutate of [f => f.serverReserve.prompts[0].answer = 'wrong', f => f.canonicalRows[5].level = '中',
    f => f.canonicalRows.splice(5, 1), f => f.canonicalRows.push(f.canonicalRows[5])]) {
    const f = atTail(); mutate(f); assert.throws(() => plan(f), /typing_reserve_canonical_mismatch/);
  }
});
check('invalid or unconfirmed evidence is not converted to a continuation', () => {
  const f = atTail(); f.serverEvents[0].sequence = 9; assert.throws(() => plan(f), /non_contiguous/);
  assert.throws(() => plan({ ...fixture(), nextEventType: 'client_score' }), /invalid_typing_event_type/);
  const done = fixture(); for (let i = 0; i < 5; i++) event(done, 'completed');
  assert.throws(() => plan(done), /round_not_active/);
});
check('205 consecutive Skips then five completions preserve queue order and never finish on Skip', () => {
  for (const level of ['初', '中']) {
    const f = fixture(level);
    for (let n = 0; n < 205; n++) {
      assert.equal(f.serverRound.prompts[reduce(f).currentPromptIndex].contentRef.key, ref(n % 100).key);
      prepareAndApply(f, 'skipped'); const after = reduce(f);
      assert.equal(after.completedCount, 0); assert.equal(after.complete, false); assert.equal(after.skipCount, n + 1);
    }
    for (let n = 0; n < 5; n++) prepareAndApply(f, 'completed');
    const after = reduce(f); assert.equal(after.completedCount, 5); assert.equal(after.complete, true);
    assert.equal(after.skipCount, 205); assert.equal(after.roundBonus.total, 0);
  }
});
check('Hint practice completion counts, while Skip does not erase guide penalties', () => {
  const f = fixture(); event(f, 'hint_opened'); prepareAndApply(f, 'skipped');
  event(f, 'hint_opened'); prepareAndApply(f, 'completed');
  for (let n = 0; n < 4; n++) prepareAndApply(f, 'completed');
  const after = reduce(f); assert.equal(after.completedCount, 5); assert.equal(after.skipCount, 1);
  assert.equal(after.hadGuide, true); assert.equal(after.roundBonus.total, 0);
});
console.log(`Typing continuation plan: ${passed}/${passed} PASS`);
