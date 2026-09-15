#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  classifyLearningState,
  transitionLearningState,
} from '../supabase/functions/_shared/login-free-learning-engine.mjs';

const day = '2026-09-15';
const add = (days) => new Date(Date.parse(day + 'T00:00:00Z') + days * 86400000).toISOString().slice(0, 10);

for (const game of ['tone', 'reading', 'typing', 'word_order']) {
  for (const [score, target] of [[0, 'retry_end_round'], [3, 'retry_end_round'], [4, 'weak_4d'], [9, 'weak_4d'], [10, 'srs']]) {
    const result = transitionLearningState({ game, today: day, score, state: { state: 'normal' } });
    assert.equal(result.toState, target, `${game}: NORMAL ${score}`);
    if (target === 'weak_4d') assert.equal(result.dueOn, add(4));
    if (target === 'srs') assert.deepEqual(result.srs, { stage: 0, dueOn: null, everFailed: false, mastered: false });
  }

  for (const [score, target] of [[0, 'review_needed'], [3, 'review_needed'], [4, 'review_needed'], [9, 'review_needed'], [10, 'next_day_check']]) {
    const result = transitionLearningState({
      game, today: day, score,
      state: { state: 'retry_end_round', roundId: 'round-1', reviewAttemptsUsed: 0 },
      roundId: 'round-1',
    });
    assert.equal(result.toState, target, `${game}: RETRY ${score}`);
    assert.equal(result.dueOn, add(1));
  }

  for (const state of ['next_day_check', 'review_needed']) {
    const early = transitionLearningState({ game, today: day, score: 10, state: { state, dueOn: add(1), reviewAttemptsUsed: 0 } });
    assert.equal(early.mutated, false);
    assert.equal(early.reason, 'not_due');
    for (const [score, target] of [[0, 'weak_4d'], [3, 'weak_4d'], [4, 'weak_4d'], [9, 'weak_4d'], [10, 'srs']]) {
      const result = transitionLearningState({ game, today: add(1), score, state: { state, dueOn: add(1), reviewAttemptsUsed: 0 } });
      assert.equal(result.toState, target, `${game}: ${state} ${score}`);
      if (target === 'weak_4d') assert.equal(result.dueOn, add(5));
    }
  }

  for (const [score, target] of [[0, 'retry_end_round'], [3, 'retry_end_round'], [4, 'weak_4d'], [9, 'weak_4d'], [10, 'srs']]) {
    const result = transitionLearningState({ game, today: add(4), score, state: { state: 'weak_4d', dueOn: add(4), reviewAttemptsUsed: 0 } });
    assert.equal(result.toState, target, `${game}: WEAK ${score}`);
    if (target === 'weak_4d') assert.equal(result.dueOn, add(8));
  }

  let current = { state: 'srs', stage: 0, dueOn: null, everFailed: false, mastered: false };
  const day1 = transitionLearningState({ game, today: day, score: 10, state: current });
  assert.equal(day1.toState, 'srs');
  assert.equal(day1.srs.stage, 1);
  assert.equal(day1.srs.dueOn, add(1));
  const notDue = transitionLearningState({ game, today: day, score: 10, state: { state: 'srs', ...day1.srs } });
  assert.equal(notDue.reason, 'not_due');
  const day7 = transitionLearningState({ game, today: add(1), score: 10, state: { state: 'srs', ...day1.srs } });
  assert.equal(day7.srs.stage, 2);
  assert.equal(day7.srs.dueOn, add(8));
  const mastered = transitionLearningState({ game, today: add(8), score: 10, state: { state: 'srs', ...day7.srs } });
  assert.equal(mastered.toState, 'mastered');
  assert.equal(mastered.srs.mastered, true);
  const reset = transitionLearningState({ game, today: add(8), score: 9, state: { state: 'srs', ...day7.srs } });
  assert.deepEqual(reset.srs, { stage: 0, dueOn: null, everFailed: true, mastered: false });
  const noBackflow = transitionLearningState({ game, today: add(8), score: 0, state: { state: 'srs', ...day7.srs } });
  assert.equal(noBackflow.toState, 'srs');

  const knownMaster = transitionLearningState({ game, today: add(1), score: 10, action: 'known_check', state: { state: 'srs', ...day1.srs } });
  assert.equal(knownMaster.toState, 'mastered');
  const knownReset = transitionLearningState({ game, today: add(1), score: 9, action: 'known_check', state: { state: 'srs', ...day1.srs } });
  assert.deepEqual(knownReset.srs, { stage: 0, dueOn: null, everFailed: true, mastered: false });
}

assert.equal(classifyLearningState({ state: 'normal' }, day), 'regular_or_new');
assert.equal(classifyLearningState({ state: 'review_needed', dueOn: add(1) }, day), 'non_due_review');
assert.equal(classifyLearningState({ state: 'review_needed', dueOn: day }, day), 'review_due');
assert.equal(classifyLearningState({ state: 'srs', stage: 1, dueOn: add(1), mastered: false }, day), 'non_due_srs');
assert.equal(classifyLearningState({ state: 'srs', stage: 1, dueOn: day, mastered: false }, day), 'srs_due');
assert.equal(classifyLearningState({ state: 'srs', stage: 3, dueOn: null, mastered: true }, day), 'mastered');

assert.throws(() => transitionLearningState({ game: 'listening', today: day, score: 10, state: { state: 'normal' } }), /invalid_game/);
assert.throws(() => transitionLearningState({ game: 'tone', today: day, score: 11, state: { state: 'normal' } }), /invalid_score/);

console.log('LOGIN_FREE_LEARNING_ENGINE_V2_PASS 4_GAMES');
