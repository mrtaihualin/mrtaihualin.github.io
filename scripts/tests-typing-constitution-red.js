#!/usr/bin/env node
'use strict';

// Contract-first regression suite for deterministic Typing score seams.
// This suite is intentionally not wired into check-site.js while it is red.
// Stateful browser contracts (Hint, Skip, Combo, Resume, High gating) receive
// behavior tests immediately before their implementation unit.

const assert = require('assert');
const path = require('path');
const vm = require('vm');
const { pathToFileURL } = require('url');

const root = path.resolve(__dirname, '..');
const fs = require('fs');
const scoreSource = fs.readFileSync(path.join(root, 'js/games/typing-score.js'), 'utf8');
const scoreEnginePath = path.join(root, 'supabase/functions/score-submit/score-engine.mjs');

const scoreContext = { window: {} };
vm.createContext(scoreContext);
vm.runInContext(scoreSource, scoreContext, { filename: 'typing-score.js' });
const scoring = scoreContext.window.TYPING_SCORE;

function item(key, points, wrong = 0) {
  return {
    key,
    contentRef: { source: 'game_words', key },
    points,
    wrong,
    guide: false,
    failed: false,
    mastered: false,
  };
}

function submission(difficulty, items, roundBonus, srsBonus, clientScore) {
  return {
    submission_id: '11111111-1111-4111-8111-111111111111',
    game: 'typing',
    difficulty,
    evidence: { items, roundBonus, srsBonus },
    client_score: clientScore,
  };
}

const cases = [
  ['keeps the Typing base score fractional', async () => {
    assert.strictEqual(scoring.score(1, 1), 7.5);
    assert.strictEqual(scoring.score(6, 1), 10 - (10 / 6));
    assert.strictEqual(scoring.score(9, 8), 10 - (80 / 9));
  }],
  ['applies the level multiplier before adding an unmultiplied round bonus', async (engine) => {
    const rows = ['w1', 'w2', 'w3', 'w4', 'w5'].map((key) => item(key, 10));
    const result = engine.validateScoreSubmission(submission('中', rows, 20, 0, 120));
    assert.strictEqual(result.score, 120);
  }],
  ['rounds once after summing fractional item scores', async (engine) => {
    const rows = ['w1', 'w2', 'w3', 'w4', 'w5'].map((key) => item(key, 7.5, 1));
    const result = engine.validateScoreSubmission(submission('初', rows, 0, 0, 38));
    assert.strictEqual(result.score, 38);
  }],
  ['accepts one SRS point after the Middle multiplier without multiplying the bonus', async (engine) => {
    const rows = ['w1', 'w2', 'w3', 'w4', 'w5'].map((key) => item(key, 10));
    const result = engine.validateScoreSubmission(submission('中', rows, 0, 1, 101));
    assert.strictEqual(result.score, 101);
  }],
];

(async () => {
  const engine = await import(pathToFileURL(scoreEnginePath).href + `?typing-red=${Date.now()}`);
  const failures = [];
  for (const [name, run] of cases) {
    try {
      await run(engine);
      console.log(`✓ ${name}`);
    } catch (error) {
      failures.push({ name, error });
      console.error(`✗ ${name}`);
      console.error(`  ${String(error && (error.code || error.message) || error).split('\n')[0]}`);
    }
  }
  console.log(`\nTyping constitution RED suite: ${cases.length - failures.length}/${cases.length} green`);
  if (failures.length) {
    console.error(`${failures.length} deterministic constitutional regression(s) remain red.`);
    process.exitCode = 1;
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
