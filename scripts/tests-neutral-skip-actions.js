#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const stage = read('js/core/mobile-landscape.js');
const tone = read('js/games/tone-finder-game.js');
const reading = read('js/games/reading-game-app.js');
const listening = read('js/games/listening-game-app.js');
const typing = read('js/games/typing-game-app.js');
const order = read('js/games/word-order-app.js');

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log('✓ ' + name);
}

function between(text, start, end) {
  const from = text.indexOf(start);
  assert.notStrictEqual(from, -1, 'missing start: ' + start);
  const to = text.indexOf(end, from + start.length);
  assert.notStrictEqual(to, -1, 'missing end: ' + end);
  return text.slice(from, to);
}

test('player-facing remembered controls are replaced by Skip in the four former owners', () => {
  const pages = ['tone-finder.html', 'reading-game.html', 'typing-game.html', 'word-order.html'];
  pages.forEach((file) => {
    const html = read(file);
    assert.doesNotMatch(html, />\s*[^<]*已記得[^<]*</, file + ': visible remembered copy remains');
    assert.match(html, /跳過/, file + ': missing Skip copy');
  });
  assert.match(read('reading-game.html'), /id="btn-skip" onclick="skipWord\(\)">跳過/);
  assert.match(read('typing-game.html'), /id="btn-skip" onclick="skipWord\(\)">跳過/);
  assert.match(read('word-order.html'), /id="wo-skip-btn"[\s\S]{0,180}woSkip\(\)">跳過/);
});

test('Tone stale remembered entry is neutralized and every surface renders neutral Skip', () => {
  assert.match(tone, /function tfNeutralSkipSurface\(\) \{\s*return true;\s*\}/);
  assert.match(tone, /markKnown: function\(\) \{\s*return this\.skipCurrentWord\(\);\s*\}/);
  assert.doesNotMatch(tone, /tone_finder_mark_known_click/);
  assert.match(tone, /skipCurrentWord:\s*function\(\)[\s\S]{0,1500}is_skipped:\s*true/);
});

test('Reading and Typing Skip log neutral evidence then advance without SRS calls', () => {
  [reading, typing].forEach((app) => {
    const body = between(app, 'function skipWord(){', '\n}\nfunction next(){');
    assert.match(body, /skipped:true/);
    assert.match(body, /wrong:0/);
    assert.match(body, /pts:0/);
    assert.match(body, /nextWord\(\)/);
    assert.doesNotMatch(body, /SRS|Srs|finishRound|roundScore|cleanC|streak/);
    assert.match(app, /if\(w\.skipped\) return '<span style="color:#777;">跳過<\/span>'/);
  });
});

test('Listening Skip is always available in a live question and bypasses answer or SRS mutation', () => {
  const body = between(listening, 'function skipCurrentQuestion() {', '\n  function renderMC(w) {');
  assert.match(body, /is_skipped: true/);
  assert.match(body, /state\.idx\+\+/);
  assert.doesNotMatch(body, /finishAnswer\(|claimAttempt\(|sendListeningSrs\(|state\.(correct|wrong|primaryTotal|typingBonusTotal)\+\+/);
  assert.match(listening, /function showQuestion\([\s\S]{0,1200}skipBtn\.style\.display = 'inline-flex'/);
});

test('Word Order uses manual Check only on Mobile Landscape and neutral Skip never touches SRS', () => {
  const skipBody = between(order, 'window.woSkip = function(){', '\n  window.woCheck = function(){');
  assert.match(skipBody, /skipped:true/);
  assert.match(skipBody, /window\.woNext\(\)/);
  assert.doesNotMatch(skipBody, /woServerFinish|srsRecords|score\s*[+\-]=|curCombo/);
  assert.match(order, /function woManualCheckSurface\(\)[\s\S]{0,240}orientation: landscape/);
  assert.match(order, /answer\.length === s\.words\.length && !woManualCheckSurface\(\)\) checkAnswer\(\)/);
  assert.match(order, /window\.woCheck = function\(\)[\s\S]{0,180}checkAnswer\(\)/);
  assert.match(order, /if \(w\.skipped\) return '<span style="color:#777;">跳過<\/span>'/);
});

test('Mobile Landscape top actions are ordered Skip, Check, Reset per game', () => {
  assert.match(stage, /mainAction\.append\(makeSlot\('skip'\), makeSlot\('check'\), makeSlot\('reset'\)\)/);
  assert.match(stage, /game === 'reading'\) \{ skip = q\('#btn-skip'\); check = q\('#btn-check'\); \}/);
  assert.match(stage, /game === 'word-order'[\s\S]{0,260}#wo-skip-btn[\s\S]{0,120}#wo-reset-btn/);
  assert.match(stage, /createWordOrderCheckAction/);
  assert.match(stage, /name === 'reset'[\s\S]{0,260}node\.textContent = '重新'/);
  assert.match(read('word-order.html'), /id="wo-reset-btn"[^>]*>↺ 重排這句<\/button>/);
});

test('Lego receives no Skip or action mapping', () => {
  assert.doesNotMatch(read('lego.html'), /id="(?:btn|lego)-skip"/);
  const mappings = between(stage, 'function syncTopActions(game) {', '\n  function resolveListeningGameplay() {');
  assert.doesNotMatch(mappings, /game === 'lego'/);
});

console.log(`\n✅ Neutral Skip and top-action tests passed (${passed} checks)`);
