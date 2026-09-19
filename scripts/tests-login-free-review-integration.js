#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const edge = read('supabase/functions/score-submit/index.ts');
const catalogTransport = read('supabase/functions/score-submit/learning-catalog.mjs');
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
  assert.match(html, /js\/games\/learning-review\.js\?v=9/);
  assert.match(html, /js\/core\/auth-widget\.js/);
  assert.match(html, /js\/games\/reading-auth\.js/);
});
assert.match(read('js/score/phase1-canonical-state.js'), /whenReady:\s*whenReady/);
assert.match(read('js/games/game-content-client.js'), /whenLoginFreeCanonicalReady\(data, game\)/);
assert.match(games.typing, /_tgResumeHandled=tgTryResume\(\)[\s\S]*if\(!_tgResumeHandled\)[\s\S]*_tgInitialStarted[\s\S]*Promise\.all\(/);
assert.match(games.reading, /_rgLoginFreeResume[\s\S]*!rgTryLoadResumeBanner\(\)/);
assert.match(games.word_order, /LearningReview\.runtimeEnabled\(\)[\s\S]*woResumeContinue\(state,restoredSet\)/);
assert.match(games.tone, /__tfLoginFreeResume[\s\S]*TF\.resumeSavedSession\(\)/);
const readingSync = games.reading.slice(games.reading.indexOf('function rgWireSrsSync()'), games.reading.indexOf('// ════════════════════════════════════════════\n// UTILS'));
const typingSync = games.typing.slice(games.typing.indexOf('function tgWireSrsSync()'), games.typing.indexOf('// ════════════════════════════════════════════\n// UTILS'));
const wordOrderSync = games.word_order.slice(games.word_order.indexOf('function woWireSrsSync()'), games.word_order.indexOf('  var SET = []'));
assert.doesNotMatch(readingSync, /initGame\s*\(/, 'Reading SRS hydration must not replace canonical Resume');
assert.doesNotMatch(typingSync, /initGame\s*\(/, 'Typing SRS hydration must not replace canonical Resume');
assert.doesNotMatch(wordOrderSync, /woReinitSafe\s*\(/, 'Word Order SRS hydration must not replace canonical Resume');
assert.match(games.reading, /_rgInitialSrsReady[\s\S]*Promise\.all\(\[rgPrimeReview\(\),_rgInitialSrsReady\]\)\.then\(initGame\)/);
assert.match(games.typing, /Promise\.all\(\[_tgInitialReviewReady,_tgInitialSrsReady\]\)[\s\S]*\.then\(_tgInitialGo\)/);
assert.match(games.word_order, /function woInitialStartSafe\(\)[\s\S]*woInitialStartSafe\(\);/);
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
assert.match(edge, /login-free-learning:\$\{user\.id\}/);
assert.match(edge, /REVIEW_STAGING_PROJECT_REF = 'xufxvwcelbovzsxywawg'/);
assert.match(edge, /user\?\.app_metadata\?\.test_scope === REVIEW_STAGING_TEST_SCOPE/);
assert.match(edge, /isLearningRequest && !reviewCallerAllowed\(user, url\)/);
assert.match(edge, /handleLegacyReviewAction/);
assert.match(edge, /phase1_learning_review_commit/);
assert.match(edge, /verifyLearningScore/);
assert.match(edge, /phase1_login_free_learning_commit/);
assert.match(edge, /\.eq\('user_id', user\.id\)/);
assert.match(edge, /round_items: roundItems\.map\(clean\)/);
assert.match(edge, /state_token: learningToken\(/);
assert.match(edge, /legacy_srs_identity_ambiguous/);
assert.doesNotMatch(edge, /p_user_id:\s*body\./);
assert.doesNotMatch(edge, /item_id:\s*body\./);
assert.match(edge, /p_expected_state_token: expectedToken/);
assert.match(catalogTransport, /content_ref: \{ source, key \}/);
assert.match(edge, /item\.wrong == null \? Number\(item\.wrong_count/);
assert.match(edge, /item\.mode \|\| item\.linguistic\?\.answer_mode/);
assert.match(edge, /new Set\(\['tone', 'reading', 'typing', 'word_order'\]\)/);
assert.doesNotMatch(edge, /new Set\(\[[^\]]*'listening'/);
assert.match(edge, /https:\/\/mrtaihualin-preview-learning-e4ea92c\.mrtaihualin\.workers\.dev/);

for (const page of ['reading-game.html', 'typing-game.html', 'word-order.html']) {
  assert.doesNotMatch(read(page), /js\/games\/tone-server\.js/, page + ' does not load the retired Free writer');
}
assert.match(read('tone-finder.html'), /js\/games\/tone-server\.js/, 'Tone keeps the Paid-only client');
Object.entries(games).forEach(([game, source]) => {
  assert.doesNotMatch(source, /\.from\(['"]tone_srs_state['"]\)/, game + ' does not read authoritative SRS rows directly');
});

console.log('LOGIN_FREE_REVIEW_INTEGRATION_PASS 4_GAMES');
