#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const edge = fs.readFileSync(path.join(root, 'supabase/functions/tone-round/index.ts'), 'utf8');
const learningClient = fs.readFileSync(path.join(root, 'js/games/learning-review.js'), 'utf8');

const games = [
  { id: 'tone', engine: 'tone', file: 'js/games/tone-finder-game.js', known: /learning_action:\s*session\.curWordIsKnownCheck\s*\?\s*'known_check'/,
    noScore: /noSoftPoints\s*=\s*!!\(session\.curWordIsKnownCheck\)/ },
  { id: 'reading', engine: 'reading', file: 'js/games/reading-game-app.js', known: /learningAction:'known_check'/,
    noScore: /rgLogWord\(\{mastered:!!passedClean,pts:0/ },
  { id: 'typing', engine: 'typing', file: 'js/games/typing-game-app.js', known: /learningAction:'known_check'/,
    noScore: /rgLogWord\(\{failed:!passedClean,pts:0,mastered:passedClean/ },
  { id: 'wordorder', engine: 'word_order', file: 'js/games/word-order-app.js', known: /learningAction:'known_check'/,
    noScore: /woLogSentence\(\{mastered:!!passedClean, pts:0/ },
];

assert.match(learningClient, /action:\s*'learning_queue'/, 'queue authority is score-submit Learning Engine');
assert.match(learningClient, /action:\s*'learning_commit'/, 'transition authority is score-submit Learning Engine');
assert.match(learningClient, /expected_state_token/, 'every commit carries the exact server CAS token');
assert.match(edge, /return json\(\{ error: 'learning_engine_required' \}, 409\)/,
  'tone-round fails closed for the retired Login Free path');
assert.match(edge, /if \(paidPrivateBeta\)/, 'tone-round preserves the separately gated Paid path');

for (const game of games) {
  const source = fs.readFileSync(path.join(root, game.file), 'utf8');
  assert.match(source, game.known, game.id + ': memory check is explicit Learning Engine evidence');
  assert.match(source, game.noScore, game.id + ': memory check awards no gameplay score');
  assert.doesNotMatch(source, /\.from\(['"]tone_srs_state['"]\)/,
    game.id + ': browser does not read authoritative SRS rows directly');
  if (game.id === 'tone') {
    assert.match(source, /if \(!window\.PAID_SRS_PRIVATE_BETA\) return/,
      'tone legacy client is unreachable for Login Free');
    assert.match(source, /window\.PAID_SRS_PRIVATE_BETA && window\.TONE_SERVER/,
      'Tone retains tone-round only behind Paid private beta');
  } else {
    assert.doesNotMatch(source, /TONE_SERVER|finishRound\(/,
      game.id + ': retired tone-round client path is absent');
  }
}

(async () => {
  const { transitionLearningState } = await import('../supabase/functions/_shared/login-free-learning-engine.mjs');
  const today = '2026-09-15';
  for (const game of games) {
    const entered = transitionLearningState({ game: game.engine, today, score: 10, state: { state: 'normal' } });
    assert.strictEqual(entered.toState, 'srs', game.id + ': 10/10 enters SRS stage 0');
    const day1 = transitionLearningState({ game: game.engine, today, score: 10,
      state: { state: 'srs', stage: 0, dueOn: null, everFailed: false, mastered: false } });
    assert.strictEqual(day1.srs.stage, 1);
    assert.strictEqual(day1.srs.dueOn, '2026-09-16');
    const reset = transitionLearningState({ game: game.engine, today: '2026-09-16', score: 9,
      state: { state: 'srs', stage: 1, dueOn: '2026-09-16', everFailed: false, mastered: false } });
    assert.deepStrictEqual(reset.srs, { stage: 0, dueOn: null, everFailed: true, mastered: false });
    const remembered = transitionLearningState({ game: game.engine, today: '2026-09-16', score: 10,
      action: 'known_check', state: { state: 'srs', stage: 1, dueOn: '2026-09-16', everFailed: false, mastered: false } });
    assert.strictEqual(remembered.toState, 'mastered');
  }
  console.log('LOGIN_FREE_SRS_FOUR_GAMES_PASS ' + games.length + '_GAMES');
})().catch((error) => { console.error(error); process.exitCode = 1; });
