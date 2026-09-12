#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const edge = read('supabase/functions/score-submit/index.ts');
const runtime = read('js/games/learning-review.js');
const report = read('js/games/round-report.js');
const gate = read('js/core/minimum-guest-launch.js');
const games = {
  tone: read('js/games/tone-finder-game.js'),
  reading: read('js/games/reading-game-app.js'),
  typing: read('js/games/typing-game-app.js'),
  word_order: read('js/games/word-order-app.js')
};
const pages = ['tone-finder.html', 'reading-game.html', 'typing-game.html', 'word-order.html'];

assert.match(gate, /LOGIN_FREE_REVIEW_PUBLIC_ENTRY\s*=\s*loginFreeLearningGame/);
assert.doesNotMatch(gate, /PAID.*PUBLIC_ENTRY\s*=\s*true/i);
assert.match(report, /gsh:item-complete/);
assert.match(runtime, /LOGIN_FREE_REVIEW_PUBLIC_ENTRY === true/);
assert.match(runtime, /learning-review/);
assert.match(runtime, /quotaTotal: total/);
assert.match(runtime, /selectedReview\.concat\(tail\)/);
assert.match(runtime, /state === 'next_day_check' \|\| state === 'review_needed'/);
assert.match(runtime, /context\.pending = context\.pending\.catch\(function \(\) \{\}\)\.then/);
assert.match(runtime, /function settle\(reportOrId\)/);
assert.match(runtime, /function advance\(reportOrId, callback\)/);
assert.match(runtime, /CONTENT_REF_IDENTITY_MISMATCH/);
assert.doesNotMatch(runtime, /predictedScore\(context\.game, item\) <= 3\) scheduleRetry/);
assert.doesNotMatch(runtime, /getSession\(|access_token|refresh_token|service_role/i);

pages.forEach(page => {
  const html = read(page);
  assert.match(html, /js\/games\/learning-review\.js\?v=5/);
  assert.match(html, /js\/core\/auth-widget\.js/);
  assert.match(html, /js\/games\/reading-auth\.js/);
});
assert.doesNotMatch(read('listening-game.html'), /js\/games\/(?:learning-review|tone-server)\.js/);
Object.entries(games).forEach(([game, source]) => {
  assert.match(source, /LearningReview\.prime/, game + ' primes the Review queue');
  assert.match(source, /LearningReview\.matchQueue/, game + ' maps stable Review refs');
  assert.match(source, /LearningReview\.allocateRuntime/, game + ' uses cumulative Review allocation');
  assert.match(source, /LearningReview\.registerRound/, game + ' registers atomic result routing');
});
['tone', 'reading', 'typing', 'word_order'].forEach(game => {
  assert.match(games[game], /LearningReview\.advance/, game + ' waits for the acknowledged Review commit before advancing');
});

assert.match(edge, /auth\.getUser\(\)/);
assert.match(edge, /learning-review:\$\{user\.id\}/);
assert.match(edge, /REVIEW_STAGING_PROJECT_REF = 'xufxvwcelbovzsxywawg'/);
assert.match(edge, /user\?\.app_metadata\?\.test_scope === REVIEW_STAGING_TEST_SCOPE/);
assert.match(edge, /isReviewAction && !reviewCallerAllowed\(user, url\)/);
assert.match(edge, /verifyLearningScore/);
assert.match(edge, /phase1_learning_review_commit/);
assert.match(edge, /\.eq\('user_id', user\.id\)/);
assert.match(edge, /\.limit\(Math\.min\(100, playSetSize \* 5\)\)/);
assert.doesNotMatch(edge, /p_user_id:\s*body\./);
assert.doesNotMatch(edge, /item_id:\s*body\./);
assert.doesNotMatch(edge, /state_token:\s*row\.state_token/);
assert.match(edge, /content_ref: \{ source: ref\.content_source, key: ref\.content_key \}/);
assert.match(edge, /item\.wrong == null \? Number\(item\.wrong_count/);
assert.match(edge, /item\.mode \|\| item\.linguistic\?\.answer_mode/);
assert.match(edge, /new Set\(\['tone', 'reading', 'typing', 'word_order'\]\)/);
assert.doesNotMatch(edge, /new Set\(\[[^\]]*'listening'/);

console.log('LOGIN_FREE_REVIEW_INTEGRATION_PASS 4_GAMES');
