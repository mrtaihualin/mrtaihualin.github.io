#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'js/games/word-order-app.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'word-order.html'), 'utf8');
let passed = 0;

function test(name, fn) {
  fn();
  passed++;
  console.log(`✓ ${name}`);
}

function block(startText, endText) {
  const start = app.indexOf(startText);
  const end = app.indexOf(endText, start + startText.length);
  assert.ok(start >= 0 && end > start, `หา block ${startText} ไม่พบ`);
  return app.slice(start, end);
}

test('answer is validated only against the prescribed target order', () => {
  const check = block('function checkAnswer()', 'function popScore(');
  assert.match(check, /answer\.every\(function\(v, i\)\{ return v === i; \}\)/);
});

test('a wrong order remains playable and gives correction feedback', () => {
  const check = block('function checkAnswer()', 'function popScore(');
  assert.match(check, /attemptedWrongThisSentence = true/);
  assert.match(check, /點一下格子裡的詞塊，再排排看/);
  assert.match(check, /if \(life <= 0\)[\s\S]*else \{/);
});

test('Phase 1 SRS entry/checkpoint requires unassisted base 10/10', () => {
  assert.match(app, /srsPassed = life === SENTENCE_LIFE_START && !attemptedWrongThisSentence && !hintUsedThisSentence/);
  assert.match(app, /if \(srsPassed\)/);
});

test('new below-10 item does not create a local SRS record', () => {
  const check = block('function checkAnswer()', 'function popScore(');
  assert.match(check, /if \(existingRec\) \{[\s\S]*WO_SRS\.resetOnFail\(existingRec\)/);
  assert.doesNotMatch(check, /WO_SRS\.resetOnFail\(existingRec \|\| WO_SRS\.blank\(\)\)/);
});

test('failed checkpoint is sent as non-clean server evidence', () => {
  assert.match(app, /woServerFinish\(s\.th, false\); \/\/ Edge จะตอบ below_entry_score/);
});

test('SRS lifecycle is the Phase 1 Day 1 / Day 7 path', () => {
  assert.match(app, /INTERVALS: \[1, 7\]/);
  assert.match(app, /CLEAN_ROUNDS_TO_MASTER: 3/);
});

test('Guest can play while account SRS writes remain login-gated', () => {
  assert.match(app, /if \(woLoggedIn\(\) && !practiceMode\) \{/);
  assert.match(app, /else \{\s*pool = allIdx\.slice\(\);/);
});

test('round completion writes account evidence as word_order', () => {
  assert.match(app, /READING_AUTH\.saveScore\(weightedScore,1,'word_order',rgWrongItemsFromLog\(\),\{/);
  assert.match(app, /items:roundLog\.map/);
});

test('玩法 explains correction and prescribed order', () => {
  assert.match(html, /正確順序/);
  assert.match(html, /放回去重排/);
});

console.log(`\n${passed} Phase 1 Word Order tests passed.`);
