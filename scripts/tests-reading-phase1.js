#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'js/games/reading-game-app.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'reading-game.html'), 'utf8');
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

test('refresh tolerates the Phase 1 HUD without removed reward elements', () => {
  const refresh = block('function refreshUI()', 'function updateCombo()');
  const elements = {
    'rg-ws-fill': { style: {} },
    'rg-ws-num': { textContent: '' },
    pf: { style: {} },
    'prog-txt': { textContent: '' },
    qt: { textContent: '' },
  };
  const context = {
    SYL_SCORE: [10, 7, 4, 1],
    wordUsedGuide: false,
    rgCurSyllableScore: () => 10,
    rgScoreBarColor: () => '#8B6310',
    cur: 0,
    roundQueue: [1, 2, 3, 4, 5],
    Math,
    document: { getElementById: (id) => elements[id] || null },
  };
  vm.createContext(context);
  vm.runInContext(refresh, context);
  vm.runInContext('refreshUI()', context);
  assert.strictEqual(elements.qt.textContent, 5);
  assert.doesNotMatch(refresh, /star-count|badge-count|badge-emoji/);
});

test('Reading loads the rebuilt crash-safe bundle with a fresh cache key', () => {
  assert.match(html, /reading-game-app\.min\.js\?v=36/);
});

test('Reading option generator keeps displayed vowel choices complete and unique', () => {
  const dataStart = source.indexOf('var VOWEL_SYMBOL=');
  const dataEnd = source.indexOf('// ════════════════════════════════════════════\n// PHONETIC MAPS', dataStart);
  const readStart = source.indexOf('var VOWEL_READ=');
  const readEnd = source.indexOf('// ════════════════════════════════════════════\n// WORDS', readStart);
  const utilStart = source.indexOf('function shuffle(');
  const utilEnd = source.indexOf('// ════════════════════════════════════════════\n// LEVEL SWITCH', utilStart);
  assert.ok(dataStart >= 0 && dataEnd > dataStart && readStart >= 0 && readEnd > readStart && utilStart >= 0 && utilEnd > utilStart);
  const math = Object.create(Math);
  math.random = () => 0;
  const context = { Math: math, W: { cluster: '' } };
  vm.createContext(context);
  vm.runInContext(source.slice(dataStart, dataEnd), context);
  vm.runInContext(source.slice(readStart, readEnd), context);
  vm.runInContext(source.slice(utilStart, utilEnd), context);
  const raw = context.buildOpts('อา', 'vowel', [['อา']], ['อา', 'อั', 'อะ', 'เออ', 'เอิ', 'โอ'], 4, null, []);
  const shown = raw.map((value) => context.dispOpt('vowel', value));
  assert.strictEqual(raw.length, 4);
  assert.strictEqual(new Set(shown).size, 4);
  assert.strictEqual(shown.filter((value) => value === context.dispOpt('vowel', 'อา')).length, 1);
  const cases = [
    ['cons', context.CONS_GROUPS, context.CP],
    ['vowel', context.VOWEL_GROUPS, context.VP],
    ['final', context.FINAL_GROUPS, context.FP],
    ['tone', [context.TONE_POOL], context.TONE_POOL],
  ];
  for (const [comp, groups, pool] of cases) {
    for (const answer of pool) {
      for (const count of [2, 3, 4]) {
        const options = context.buildOpts(answer, comp, groups, pool, count, null, []);
        const visible = options.map((value) => context.dispOpt(comp, value));
        assert.strictEqual(options.length, count, `${comp}/${answer} should have ${count} options`);
        assert.strictEqual(new Set(visible).size, count, `${comp}/${answer} should be visually unique`);
        assert.strictEqual(visible.filter((value) => value === context.dispOpt(comp, answer)).length, 1, `${comp}/${answer} should have one answer`);
      }
    }
  }
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

test('resume report restore fails safe and cannot strand the question UI', () => {
  const restoreSource = block('function rgRestoreRoundReport(', '// เรียกครั้งเดียวตอนโหลดหน้า');
  const context = {
    curLevel: '中',
    window: { RoundReport: null },
  };
  context.window.RoundReport = {
    restore() { throw new Error('legacy snapshot'); },
    create(defaults) { return { fallback: true, defaults }; },
  };
  context.RoundReport = context.window.RoundReport;
  vm.createContext(context);
  vm.runInContext(restoreSource, context);
  const restored = context.rgRestoreRoundReport('malformed');
  assert.strictEqual(restored.fallback, true);
  assert.strictEqual(restored.defaults.game_type, 'reading');
  const resume = block('function rgResumeContinue()', 'function rgResumeRestartSame()');
  assert.match(resume, /roundReport=rgRestoreRoundReport\(st\.report\)/);
  assert.match(resume, /refreshUI\(\);\s*loadWord\(\)/);
});

test('direct word practice bypasses a saved Resume without deleting it', () => {
  const resumeGate = block('function rgHasDirectWordQuery()', 'function rgResumeContinue()');
  const banner = { style: { display: 'stale' } };
  const detail = { textContent: '' };
  const saved = { level: '中', wordIds: ['เขา'], cur: 0 };
  let loadCount = 0;
  const GameResume = {
    load() { loadCount++; return saved; },
  };
  const context = {
    RG_RESUME_ID: 'reading-game',
    location: { search: '?word=%E0%B8%81%E0%B8%B4%E0%B8%99' },
    document: {
      getElementById(id) {
        if (id === 'rg-resume-banner') return banner;
        if (id === 'rg-resume-detail') return detail;
        return null;
      },
    },
    GameResume,
    window: { GameResume, __rgPendingResume: { stale: true } },
  };
  vm.createContext(context);
  vm.runInContext(resumeGate, context);

  assert.strictEqual(context.rgTryLoadResumeBanner(), false);
  assert.strictEqual(loadCount, 0);
  assert.strictEqual(banner.style.display, 'none');
  assert.strictEqual(context.window.__rgPendingResume, null);

  context.location.search = '';
  assert.strictEqual(context.rgTryLoadResumeBanner(), true);
  assert.strictEqual(loadCount, 1);
  assert.strictEqual(banner.style.display, '');
  assert.strictEqual(context.window.__rgPendingResume, saved);
  assert.match(detail.textContent, /第 1\/1 字/);
});

console.log(`\n${passed} Phase 1 Reading tests passed.`);
