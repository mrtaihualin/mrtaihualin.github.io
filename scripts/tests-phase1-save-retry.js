#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const root = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const progress = read('js/score/phase1-canonical-state.js');
const toneServer = read('js/games/tone-server.js');
const edge = read('supabase/functions/tone-round/index.ts');
const readingAuth = read('js/games/reading-auth.js');
const wordVault = read('js/games/word-vault.js');
const sentenceVault = read('js/games/sentence-vault.js');
const scoreSubmit = read('supabase/functions/score-submit/index.ts');
const learningReview = read('js/games/learning-review.js');
const learningSql = read('supabase/migrations/20260915165150_phase1_login_free_learning_engine_v2.sql');
const scoreSql = read('supabase/sql/2026-08-15_s29_authoritative_score_security.sql');
const scoreAtomicSql = read('supabase/sql/2026-08-16_phase1_score_submit_atomic.sql');
const toneAtomicSql = read('supabase/sql/2026-08-16_phase1_tone_round_atomic.sql');
const contentSql = read('supabase/sql/2026-08-02_game_content_schema.sql');
let passed = 0;
function test(label, fn) {
  try { fn(); passed++; console.log('✓ ' + label); }
  catch (error) { console.error('✗ ' + label + ': ' + error.message); process.exitCode = 1; }
}

test('failed progress read cannot be treated as empty remote state and overwritten', () => {
  const pullStart = progress.indexOf("guarded(request, 'phase1-canonical-pull')");
  const guard = progress.indexOf('if (!res || res.error)', pullStart);
  const apply = progress.indexOf('applyRemote(remoteData', pullStart);
  assert.ok(pullStart >= 0 && guard > pullStart && guard < apply);
});
test('progress writes are serialized and keep a retry-pending state', () => {
  assert.match(progress, /pushInFlight[\s\S]*pushAgain[\s\S]*retryPending/);
  assert.match(progress, /if \(pushInFlight\) \{ pushAgain = true; return; \}/);
  assert.match(progress, /retryPending = true/);
});
test('progress retry happens on a later online event, without a tight error loop', () => {
  assert.match(progress, /addEventListener\('online'[\s\S]*if \(retryPending\) pull\(false\)/);
  const finish = progress.slice(progress.indexOf('function finishPush'), progress.indexOf('function push(meta)'));
  assert.doesNotMatch(finish, /if \(error\)[^\n]*push\(\)/);
});
test('progress reads and writes have bounded waits', () => {
  assert.match(progress, /NetworkGuard\.request\(promiseFactory, label, \{\}, 10000/);
  assert.match(progress, /phase1-canonical-pull/);
  assert.match(progress, /phase1-canonical-push/);
});
test('round-save Edge call has a bounded wait and fails closed', () => {
  assert.match(toneServer, /NetworkGuard\.request[\s\S]*tone-round'[\s\S]{0,80}12000/);
  assert.match(toneServer, /return \{ ok: false, reason: 'exception'/);
});
test('server Learning Engine protects retry and concurrent duplicate writes', () => {
  assert.match(scoreSubmit, /phase1_login_free_learning_commit/);
  assert.match(scoreSubmit, /p_expected_state_token: expectedToken/);
  assert.match(learningSql, /pg_advisory_xact_lock/);
  assert.match(learningSql, /'reason', 'replay_conflict'/);
  assert.match(learningSql, /v_current_token is distinct from p_expected_state_token/);
  assert.match(learningSql, /'reason', 'resync_required'/);
  assert.match(edge, /learning_engine_required/);
});
test('client score retry reuses one idempotent payload', () => {
  assert.match(readingAuth, /submission_id: scoreSubmissionId\(\)/);
  assert.strictEqual((readingAuth.match(/submission_id: scoreSubmissionId\(\)/g) || []).length, 1);
  assert.match(readingAuth, /if \(remaining && !terminal\)[\s\S]{0,180}setTimeout\(resolve, 800\)[\s\S]{0,100}attempt\(remaining - 1\)/);
  assert.match(readingAuth, /return payload\.submission_id;/);
  assert.match(scoreSql, /submission_id uuid primary key/);
  assert.match(scoreSubmit, /phase1_score_submit_commit/);
  assert.match(scoreAtomicSql, /'idempotent', true/);
  assert.match(scoreSubmit, /replay_conflict/);
});
test('round retry reuses one idempotent operation payload', () => {
  assert.strictEqual((toneServer.match(/round_id: roundId\(\)/g) || []).length, 1);
  assert.match(toneServer, /for \(var attempt=0; attempt<2; attempt\+\+\)/);
  assert.match(toneServer, /functions\.invoke\('tone-round', \{ body: payload \}\)/);
});
test('hung client score submissions time out before the same payload retries once', () => {
  assert.match(readingAuth, /function sendScore\(payload, id, epoch\)/);
  assert.match(readingAuth, /NetworkGuard\.request\(function \(_, options\) \{[\s\S]{0,180}sb\.functions\.invoke\('score-submit', \{ body: payload, signal: options && options.signal \}\);[\s\S]{0,80}'score-submit', \{\}, 12000\)/);
  assert.match(readingAuth, /if \(!window\.NetworkGuard \|\| !NetworkGuard\.request\)[\s\S]{0,120}Promise\.reject/);
  assert.match(readingAuth, /return attempt\(1\);/);
  assert.match(readingAuth, /error.status !== 408 && error.status !== 429/);
});
test('personal vault saves and deletes use bounded owner-safe online retry', () => {
  assert.match(wordVault, /function _handleOnline\(\)[\s\S]*_flushPendingDeletes\(owner\)[\s\S]*_flushPendingSaves\(owner\)/);
  assert.match(sentenceVault, /function handleOnline\(\)[\s\S]*flushPendingDeletes\(owner\)[\s\S]*flushPendingSaves\(owner\)/);
  assert.match(wordVault, /_bounded\(function \(\) \{[\s\S]{0,220}upsert\(words\.map/);
  assert.match(sentenceVault, /bounded\(function \(\) \{[\s\S]{0,180}upsert\(\[remoteRow\]/);
  assert.match(wordVault, /if \(!_ownerIsCurrent\(owner\)\) return;[\s\S]{0,180}delete _saveInFlight\[th\]/);
  assert.match(sentenceVault, /if \(!ownerIsCurrent\(owner\)\) return;[\s\S]{0,180}delete _saveInFlight\[th\]/);
});
test('Login Core exposes idempotent SRS and Review transaction clients', () => {
  ['tone-finder.html','reading-game.html','typing-game.html','word-order.html'].forEach((page) => {
    const html = read(page);
    assert.match(html, /network-guard\.js\?v=1/);
    assert.match(html, /reading-auth\.js\?v=35/);
    assert.match(html, /learning-review\.js\?v=9/);
    assert.match(html, /game-account\.js\?v=6/);
    assert.match(html, /practice-events\.js\?v=5/);
    if (page === 'tone-finder.html') assert.match(html, /tone-server\.js\?v=6/);
    else assert.doesNotMatch(html, /tone-server\.js/);
  });
  const reading = read('reading-game.html');
  assert.match(reading, /network-guard\.js\?v=1/);
  assert.match(reading, /reading-auth\.js\?v=35/);
  assert.match(learningReview, /action: 'learning_queue'/);
  assert.match(learningReview, /action: 'learning_commit'/);
  assert.match(readingAuth, /if \(publicLoginOnly\) return null;/);
  assert.match(readingAuth, /API\.srsUser = publicLoginSrs \? loginUser : API\.user/);
  assert.doesNotMatch(read('listening-game.html'), /(?:tone-server|learning-review)\.js/);
});

if (!process.exitCode) console.log('\n✅ Phase 1 API/Edge/save/retry safety passed (' + passed + ' checks)');
