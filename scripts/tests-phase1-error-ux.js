#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const root = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const auth = read('js/core/auth-widget.js');
const audio = read('js/games/protected-word-audio.js');
const content = read('js/games/game-content-client.js');
let passed = 0;
function test(label, fn) {
  try { fn(); passed++; console.log('✓ ' + label); }
  catch (error) { console.error('✗ ' + label + ': ' + error.message); process.exitCode = 1; }
}

test('missing auth dependency exposes Guest recovery instead of a blank widget', () => {
  assert.match(auth, /authResolved: true, authError: 'unavailable'/);
  assert.match(auth, /登入服務暫時無法連線，可先使用訪客模式/);
  assert.match(auth, /renderBadge: renderUnavailable/);
  assert.match(auth, /重新載入/);
});
test('getSession rejection is handled as unknown state without clearing account cache', () => {
  const branch = auth.slice(auth.indexOf("console.warn('[auth] getSession failed:"), auth.indexOf('sb.auth.onAuthStateChange'));
  assert.match(branch, /authError = 'session_unavailable'/);
  assert.doesNotMatch(branch, /bindLearningOwner\(null\)|localStorage\.removeItem/);
});
test('a later auth event clears the temporary error and resumes normal state', () => {
  assert.match(auth, /onAuthStateChange[\s\S]{0,180}API\.authError = null/);
});
test('protected audio request has a bounded ten-second wait', () => {
  assert.match(audio, /NetworkGuard\.request[\s\S]{0,220}game-audio[\s\S]{0,220}10000/);
});
test('audio failure resets playing state and tells the learner how to recover', () => {
  assert.match(audio, /btn\.setAttribute\('data-playing', '0'\)/);
  assert.match(audio, /音檔播放失敗，請檢查網路後再試一次/);
  assert.match(audio, /signed\[text\] = null/);
});
test('content loading error has retry, home and support recovery', () => {
  assert.match(content, /gc-error-retry/);
  assert.match(content, /返回遊戲總覽/);
  assert.match(content, /用LINE問老師/);
});
test('all Core 5 pages ship current auth/audio error handling', () => {
  ['tone-finder.html','reading-game.html','listening-game.html','typing-game.html','word-order.html'].forEach((page) => {
    const html = read(page);
    assert.match(html, /auth-widget\.js\?v=8/);
    assert.match(html, /protected-word-audio\.js\?v=2/);
  });
});

if (!process.exitCode) console.log('\n✅ Phase 1 audio/loading/auth error UX passed (' + passed + ' checks)');
