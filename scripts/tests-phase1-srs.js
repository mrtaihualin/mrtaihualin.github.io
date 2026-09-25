#!/usr/bin/env node
'use strict';

// Phase 1 Login Free learning/SRS contract. The pure transition module is shared
// with score-submit; the database transition is independently covered by the DB test.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const root = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

(async function () {
  const enginePath = path.join(root, 'supabase/functions/_shared/login-free-learning-engine.mjs');
  const { classifyLearningState, transitionLearningState } = await import(pathToFileURL(enginePath).href);
  const scoreSubmit = read('supabase/functions/score-submit/index.ts');
  const toneRound = read('supabase/functions/tone-round/index.ts');
  const migration = read('supabase/migrations/20260915165150_phase1_login_free_learning_engine_v2.sql');
  const learningClient = read('js/games/learning-review.js');

  let passes = 0;
  const check = (label, condition) => {
    assert.ok(condition, label);
    passes++;
    console.log('✓ ' + label);
  };

  const day = '2026-09-15';
  const day1 = '2026-09-16';
  const day4 = '2026-09-19';
  const day8 = '2026-09-23';

  for (const game of ['tone', 'reading', 'typing', 'word_order']) {
    const entered = transitionLearningState({ game, today: day, score: 10, state: { state: 'normal' } });
    check(`${game}: 10/10 enters SRS stage 0`, entered.toState === 'srs' && entered.srs.stage === 0);

    const weak = transitionLearningState({ game, today: day, score: 7, state: { state: 'normal' } });
    check(`${game}: 4-9 enters weak +4d`, weak.toState === 'weak_4d' && weak.dueOn === day4);

    const retry = transitionLearningState({ game, today: day, score: 3, roundId: 'round-1', state: { state: 'normal' } });
    check(`${game}: 0-3 retries at end of round`, retry.toState === 'retry_end_round' && retry.roundId === 'round-1');

    const nextDay = transitionLearningState({ game, today: day, score: 10, roundId: 'round-1', state: { ...retry, state: retry.toState } });
    check(`${game}: clean retry schedules next-day check`, nextDay.toState === 'next_day_check' && nextDay.dueOn === day1);

    const stage1 = transitionLearningState({ game, today: day, score: 10, state: { state: 'srs', stage: 0, dueOn: null, everFailed: false, mastered: false } });
    const stage2 = transitionLearningState({ game, today: day1, score: 10, state: { state: 'srs', ...stage1.srs } });
    const mastered = transitionLearningState({ game, today: day8, score: 10, state: { state: 'srs', ...stage2.srs } });
    check(`${game}: SRS is Day1 → Day7 → Mastered`, stage1.srs.dueOn === day1 && stage2.srs.dueOn === day8 && mastered.toState === 'mastered');

    const reset = transitionLearningState({ game, today: day8, score: 9, state: { state: 'srs', ...stage2.srs } });
    check(`${game}: SRS failure resets inside SRS`, reset.toState === 'srs' && reset.srs.stage === 0 && reset.srs.everFailed === true);
  }

  check('queue classification keeps due, non-due and mastered disjoint',
    classifyLearningState({ state: 'review_needed', dueOn: day }, day) === 'review_due' &&
    classifyLearningState({ state: 'srs', stage: 1, dueOn: day1, mastered: false }, day) === 'non_due_srs' &&
    classifyLearningState({ state: 'mastered', stage: 3, dueOn: null, mastered: true }, day) === 'mastered');
  check('Listening remains outside this four-game engine', (() => {
    try { transitionLearningState({ game: 'listening', today: day, score: 10, state: { state: 'normal' } }); return false; }
    catch (error) { return error && error.code === 'invalid_game'; }
  })());
  check('score-submit owns queue, score verification and transactional commit',
    /action === 'learning_queue'/.test(scoreSubmit) &&
    /reviewCanonical\(admin, game\.verifier, level, item\)/.test(scoreSubmit) &&
    /phase1_login_free_learning_commit/.test(scoreSubmit));
  check('database contract uses service role, state token and exact item identity',
    /security invoker/.test(migration) &&
    /grant execute on function public\.phase1_login_free_learning_commit[\s\S]*to service_role/.test(migration) &&
    /p_expected_state_token/.test(migration) &&
    /cardinality\(v_item_ids\), 0\) <> 1/.test(migration) &&
    /item_id, request_hash, response/.test(migration));
  check('legacy tone-round Free writer is inert while Paid beta remains isolated',
    /learning_engine_required/.test(toneRound) && /phase2_paid_srs_commit/.test(toneRound));
  check('client queue and commit both use the server learning protocol',
    /action: 'learning_queue'/.test(learningClient) && /action: 'learning_commit'/.test(learningClient));

  console.log(`\n✅ Phase 1 SRS ผ่านครบ ${passes} ข้อ`);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
