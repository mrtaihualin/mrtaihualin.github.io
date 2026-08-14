#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const root = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const progress = read('js/score/progress-sync.js');
const toneServer = read('js/games/tone-server.js');
const edge = read('supabase/functions/tone-round/index.ts');
const toneCompanion = read('js/games/tone-companion.js');
let passed = 0;
function test(label, fn) {
  try { fn(); passed++; console.log('✓ ' + label); }
  catch (error) { console.error('✗ ' + label + ': ' + error.message); process.exitCode = 1; }
}

test('failed progress read cannot be treated as empty remote state and overwritten', () => {
  const pullStart = progress.indexOf("window.NetworkGuard.request(function () { return _fetchTP;");
  const guard = progress.indexOf('if (!res || res.error)', pullStart);
  const merge = progress.indexOf('applyMerged(remote)', pullStart);
  const push = progress.indexOf('push();   // เขียนผลรวมกลับขึ้นไป', pullStart);
  assert.ok(guard >= 0 && guard < merge && merge < push);
});
test('progress writes are serialized and keep a retry-pending state', () => {
  assert.match(progress, /pushInFlight[\s\S]*pushAgain[\s\S]*pushPending/);
  assert.match(progress, /if \(pushInFlight\) \{ pushAgain = true; return; \}/);
  assert.match(progress, /pushPending = !!error/);
});
test('progress retry happens on a later online event, without a tight error loop', () => {
  assert.match(progress, /addEventListener\('online'[\s\S]*if \(pushPending\) pushDebounced\(\)/);
  const finish = progress.slice(progress.indexOf('function finishPush'), progress.indexOf('function pushDebounced'));
  assert.doesNotMatch(finish, /if \(error\)[^\n]*push\(\)/);
});
test('progress reads and writes have bounded waits', () => {
  assert.match(progress, /tone-progress-pull'[\s\S]{0,80}10000/);
  assert.match(progress, /tone-progress-push'[\s\S]{0,80}10000/);
});
test('round-save Edge call has a bounded wait and fails closed', () => {
  assert.match(toneServer, /NetworkGuard\.request[\s\S]*tone-round'[\s\S]{0,80}12000/);
  assert.match(toneServer, /return \{ ok: false, reason: 'exception'/);
});
test('server SRS protects retry and concurrent duplicate writes', () => {
  assert.match(edge, /if \(!TF_SRS\.isDue\(rec, nowMs\)\) return reject\('not_due'/);
  assert.match(edge, /reason: "race_retry"/);
});
test('client score event dedup allows retry only after failure', () => {
  assert.match(toneCompanion, /saveStates\[saveKey\] = 'pending'/);
  assert.match(toneCompanion, /delete saveStates\[saveKey\]/);
  assert.match(toneCompanion, /saveStates\[saveKey\] = 'done'/);
});
test('Core 5 ship the current round-save client', () => {
  ['tone-finder.html','reading-game.html','listening-game.html','typing-game.html','word-order.html'].forEach((page) => {
    assert.match(read(page), /tone-server\.js\?v=3/);
  });
});

if (!process.exitCode) console.log('\n✅ Phase 1 API/Edge/save/retry safety passed (' + passed + ' checks)');
