#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'js/games/reading-game-app.js'), 'utf8');
let passed = 0;

function test(name, fn) {
  fn();
  passed++;
  console.log(`✓ ${name}`);
}

function block(startText, endText) {
  const start = source.indexOf(startText);
  const end = source.indexOf(endText, start + startText.length);
  assert.ok(start >= 0 && end > start, `หา block ${startText} ไม่พบ`);
  return source.slice(start, end);
}

test('attempt score and correction evidence reset for every new word', () => {
  const loadWord = block('function loadWord()', 'function loadSyl()');
  assert.match(loadWord, /readingAttemptScore=null;readingCorrectionAttempts=0;readingFirstCheckDone=false/);
});

test('report captures only snapshots submitted by Check', () => {
  const check = block('function check()', 'function evaluateBonus()');
  assert.match(check, /readingSubmittedAttempts\.push\(rgSubmittedAttemptSnapshot\(\)\)/);
  assert.match(source, /userAnswer:readingSubmittedAttempts\.length/);
  assert.doesNotMatch(source, /userAnswer:\(picks\|\|\[\]\)\.join/);
});

test('the displayed score uses the first-check snapshot once available', () => {
  const score = block('function rgCurSyllableScore()', 'var HIGH_RAW_START_IDX');
  assert.match(score, /readingAttemptScore!=null/);
  assert.match(score, /return readingAttemptScore/);
});

test('single-syllable corrections cannot overwrite first-check score', () => {
  const check = block('function check()', 'function evaluateBonus()');
  assert.match(check, /isCorrectionCheck=readingFirstCheckDone/);
  assert.match(check, /if\(isCorrectionCheck\)readingCorrectionAttempts\+\+/);
  assert.match(check, /if\(!readingFirstCheckDone\)\{readingFirstCheckDone=true;readingAttemptScore=rgSnapshotExistingAttemptScore\(\);\}/);
});

test('multi-syllable corrections are counted separately from first score', () => {
  const whole = block('function rgCheckWholeWord()', '// Lin 2026-07-12: รีเฟรชหน้า');
  assert.match(whole, /wasCorrectionCheck=readingFirstCheckDone/);
  assert.match(whole, /if\(wasCorrectionCheck\)readingCorrectionAttempts\+\+/);
  assert.match(whole, /else\{readingFirstCheckDone=true;readingAttemptScore=rgSnapshotExistingAttemptScore\(\);\}/);
});

test('final scoring and reveal retain the locked first-check score', () => {
  const finalize = block('function finalizeWord()', 'function check()');
  assert.match(finalize, /failedLockedScore=readingAttemptScore==null\?0:readingAttemptScore/);
  assert.match(finalize, /var pts=readingAttemptScore==null\?.*:readingAttemptScore/);
});

test('account evidence carries attempt score and separate correction count', () => {
  assert.match(source, /attemptScore:readingAttemptScore,correctionAttempts:readingCorrectionAttempts/);
  assert.match(source, /attemptScore:w\.attemptScore,correctionAttempts:w\.correctionAttempts\|\|0/);
});

test('snapshot reuses the existing score ladder without a new component formula', () => {
  const start = source.indexOf('var SYL_SCORE=');
  const end = source.indexOf('var RG_LEVEL_TO_NUM=', start);
  const scoreSource = source.slice(start, end);
  const context = { sylWrongCount: [0], wordUsedGuide: false, Math };
  vm.createContext(context);
  vm.runInContext(scoreSource, context);
  assert.strictEqual(context.rgSnapshotExistingAttemptScore(), 10);
  context.sylWrongCount = [1];
  assert.strictEqual(context.rgSnapshotExistingAttemptScore(), 7);
  context.sylWrongCount = [1, 0];
  assert.strictEqual(context.rgSnapshotExistingAttemptScore(), 9);
  context.wordUsedGuide = true;
  assert.strictEqual(context.rgSnapshotExistingAttemptScore(), 0);
});

console.log(`\n${passed} Phase 1 Reading tests passed.`);
