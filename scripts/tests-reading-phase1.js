#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'js/games/reading-game-app.js'), 'utf8');
const gameContentClient = fs.readFileSync(path.join(root, 'js/games/game-content-client.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'reading-game.html'), 'utf8');
const reviewedDisplay = require(path.join(root, 'js/games/reviewed-vocabulary-display.js'));
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

test('High sentence syllables expose exact reviewed fields to the shared answer display', () => {
  const browser = {
    location: { href: 'https://example.test/reading-game.html', origin: 'https://example.test' },
    addEventListener() {},
  };
  const context = { window: browser, URL, console };
  vm.createContext(context);
  vm.runInContext(gameContentClient, context, { filename: 'game-content-client.js' });
  const sentence = {
    th: 'กา', zh: 'fixture', readingTH: 'กา', wc: 1, politeF: '',
    words: [{
      th: 'กา', zh: 'fixture',
      syls: [{
        th: 'กา', en: 'gaa', cons: 'ก', vowel: 'อา', tone_name: 'สามัญ',
        lead: '', cluster: '', final: '', tone: '', liveDead: 'เป็น',
        consRead: '', finalRead: '', silent: ''
      }]
    }]
  };
  const projected = browser.buildSentencesForPhonicsGames([sentence])[0];
  const syllable = projected.syls[0];
  assert.deepStrictEqual(JSON.parse(JSON.stringify(syllable.catalog)), {
    roman: 'gaa', lead: '', consonant: 'ก', cluster: '', vowel: 'อา',
    writtenFinal: '', toneMark: '', toneName: 'สามัญ', toneNumber: 1, liveDead: 'เป็น',
    consonantReadDifference: '', finalReadDifference: '', silent: ''
  });
  assert.match(reviewedDisplay.buildAnswerHeader(syllable), /^กา/);
  assert.ok(reviewedDisplay.buildAnswerRows(syllable).some((row) => row.tag === '母音' && row.text === 'อา'));
});

test('attempt score and correction evidence reset for every new word', () => {
  const loadWord = block('function loadWord()', 'function loadSyl()');
  assert.match(loadWord, /readingAttemptScore=null;readingFirstCheckWrongCounts=null;readingCorrectionAttempts=0;readingFirstCheckDone=false/);
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
  };
  const context = {
    SYL_SCORE: [10, 7, 4, 1],
    wordUsedGuide: false,
    rgCurSyllableScore: () => 10,
    rgScoreBarColor: () => '#8B6310',
    Math,
    document: { getElementById: (id) => elements[id] || null },
  };
  vm.createContext(context);
  vm.runInContext(refresh, context);
  vm.runInContext('refreshUI()', context);
  assert.strictEqual(elements['rg-ws-num'].textContent, 10);
  assert.doesNotMatch(refresh, /pf|prog-txt|roundQueue/);
  assert.doesNotMatch(refresh, /star-count|badge-count|badge-emoji/);
});

test('Reading counter follows active syllables without changing the round queue', () => {
  const helper = block('function updateSyllableCounter()', 'function loadWord()');
  const elements = { qn: { textContent: '' }, qt: { textContent: '' }, qu: { textContent: '' } };
  const context = { sylIdx: 1, sylList: [{}, {}, {}], Math, document: { getElementById: (id) => elements[id] || null } };
  vm.createContext(context);
  vm.runInContext(helper, context);
  vm.runInContext('updateSyllableCounter()', context);
  assert.deepStrictEqual([elements.qn.textContent, elements.qt.textContent, elements.qu.textContent], [2, 3, '音節']);
  context.sylIdx = 0; context.sylList = [{}];
  vm.runInContext('updateSyllableCounter()', context);
  assert.deepStrictEqual([elements.qn.textContent, elements.qt.textContent, elements.qu.textContent], [1, 1, '字']);
  assert.doesNotMatch(helper, /roundQueue|roundScore|okC|badC/);
});

test('Reading keeps reviewed syllable authority through the live answer object', () => {
  const loadSyl = block('function loadSyl()', '// ─── Render options ───');
  assert.match(loadSyl, /catalog:SY\.catalog/);
  assert.match(source, /renderBonusReason\(W\)/);
});

test('Reading loads the rebuilt crash-safe bundle with a fresh cache key', () => {
  assert.match(html, /reading-game-app\.min\.js\?v=57/);
});

test('Reading keeps scattered choices collision-safe and tone boxes proportional', () => {
  assert.match(html, /\.opts\{display:flex;flex-wrap:wrap;gap:20px;/);
  assert.match(html, /--opt-safe-jx:clamp\(-4px,var\(--jx,0px\),4px\)/);
  assert.match(html, /--opt-safe-jy:clamp\(-3px,var\(--jy,0px\),3px\)/);
  assert.match(html, /--opt-safe-jr:clamp\(-4deg,var\(--jr,0deg\),4deg\)/);
  assert.match(html, /\.tone-drawn\{[\s\S]{0,100}overflow:visible;[\s\S]{0,80}vertical-align:middle;/);
  assert.match(source, /'่':'<svg class="tone-drawn" width="\.18em" height="\.34em" viewBox="-18\.6 -90\.3 11\.8 21\.9"/);
  assert.doesNotMatch(html, /\.opt\[data-type="tone"\][^{]*\{[^}]*(?:min-width|padding|font-size):/);
});

test('every standalone Reading mark has a browser-independent vector', () => {
  const toneSvgStart = source.indexOf('var TONE_SVG=');
  const toneSvgEnd = source.indexOf('function isCombining(', toneSvgStart);
  const tonePoolMatch = source.match(/var TONE_POOL=(\[[^;]+\]);/);
  assert.ok(toneSvgStart >= 0 && toneSvgEnd > toneSvgStart && tonePoolMatch);
  const context = {};
  vm.createContext(context);
  vm.runInContext(source.slice(toneSvgStart, toneSvgEnd), context);
  vm.runInContext(`var TONE_POOL=${tonePoolMatch[1]};`, context);
  for (const mark of context.TONE_POOL) {
    assert.match(context.TONE_SVG[mark] || '', /^<svg[\s\S]*<path[\s\S]*<\/svg>$/, `${mark} must have a visible SVG`);
  }
  assert.strictEqual(Object.keys(context.TONE_SVG).length, context.TONE_POOL.length);
});

test('every Reading syllable uses the locked consonant-vowel-final-tone slot order', () => {
  const slotOrder = block('function getSlotOrder()', '// ════════════════════════════════════════════\n// PHONETIC MAPS');
  const context = {};
  vm.createContext(context);
  vm.runInContext(slotOrder, context);
  assert.deepStrictEqual(Array.from(context.getSlotOrder()), ['cons', 'vowel', 'final', 'tone']);
});

test('Hint immediately refreshes the permanently zero word-score HUD', () => {
  const guideMode = block('function setRgGuideMode(on)', 'function updateActiveSlot()');
  assert.match(guideMode, /updateActiveSlot\(\);\s*\/\/ Hint[^\n]*\n\s*refreshUI\(\);/);
});

test('direct word boot binds the protected level before Reading starts and restores preferences', () => {
  const start = gameContentClient.indexOf('var restoreDirectReadingWordLevel = null;');
  const end = gameContentClient.indexOf('// ── UI ระหว่างโหลด/error', start);
  assert.ok(start >= 0 && end > start, 'direct-word protected-level bridge missing');
  const bridge = gameContentClient.slice(start, end);
  assert.match(bridge, /reading-game\\\.html/);
  assert.match(bridge, /record\.contentKey === wanted/);
  assert.doesNotMatch(bridge, /record\.word === wanted/);
  assert.match(bridge, /record\.level === '初' \|\| record\.level === '中'/);
  assert.match(bridge, /if \(rows\.length !== 1\) return null/);
  assert.match(bridge, /localStorage\.setItem\('rg_reading_level', level\)/);
  assert.match(bridge, /studyPlan\.preferredLevel = function \(game\)/);
  assert.match(bridge, /if \(game === 'reading'\) return level/);
  assert.match(bridge, /if \(hadStoredLevel\) localStorage\.setItem\('rg_reading_level', storedLevel\)/);
  assert.match(bridge, /else localStorage\.removeItem\('rg_reading_level'\)/);
  assert.match(bridge, /studyPlan\.preferredLevel = originalPreferredLevel/);

  const bootStart = gameContentClient.indexOf('global.GameContentLoader = {');
  const bootEnd = gameContentClient.indexOf('// ════════════════════════════════════════════════════════════\n  // GLOBAL CRASH HANDLER', bootStart);
  assert.ok(bootStart >= 0 && bootEnd > bootStart, 'game-content boot block missing');
  const boot = gameContentClient.slice(bootStart, bootEnd);
  assert.ok(boot.indexOf('applyDirectReadingWordLevel(data);') < boot.indexOf('var exactWords = validateCatalogPayload(data.words);'));
  assert.ok(boot.indexOf('applyDirectReadingWordLevel(data);') < boot.indexOf('injectScript(src)'));
  assert.strictEqual((boot.match(/restoreDirectReadingWordLevelOverride\(\)/g) || []).length, 2);
});

test('Reading option generator keeps displayed vowel choices complete and unique', () => {
  const dataStart = source.indexOf('var CONS_GROUPS=');
  const dataEnd = source.indexOf('// ════════════════════════════════════════════\n// PHONETIC MAPS', dataStart);
  const utilStart = source.indexOf('function shuffle(');
  const utilEnd = source.indexOf('// ════════════════════════════════════════════\n// LEVEL SWITCH', utilStart);
  assert.ok(dataStart >= 0 && dataEnd > dataStart && utilStart >= 0 && utilEnd > utilStart);
  const math = Object.create(Math);
  math.random = () => 0;
  const context = { Math: math, W: { cluster: '' } };
  vm.createContext(context);
  vm.runInContext(source.slice(dataStart, dataEnd), context);
  vm.runInContext(source.slice(utilStart, utilEnd), context);
  assert.strictEqual(context.dispOpt('vowel', 'ใอ'), 'ใอ', 'reviewed vowel must not be rewritten');
  assert.strictEqual(context.dispOpt('cons', 'ญ'), 'ญ', 'reviewed consonant must not be prefixed or rewritten');
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

test('multi-syllable bonus is included in authoritative score evidence', () => {
  const helper = block('function rgFinalizeAllBonuses()', 'function rgJumpForCheck(');
  const correctState = {
    comps: ['cons'],
    slotFills: { cons: 1 },
    optTiles: [{ id: 1, val: 'ก' }],
    correctVal: { cons: 'ก' },
  };
  const context = {
    sylCache: [correctState, correctState],
    sylIdx: 1,
    sylList: [{}, {}],
    rgCaptureSylState: () => correctState,
    wordUsedGuide: false,
    curWordIsKnownCheck: false,
    readingSyllableBonusAwarded: 0,
    roundScore: 10,
    pop() {},
    refreshUI() {},
    Number,
  };
  vm.createContext(context);
  vm.runInContext(helper, context);
  vm.runInContext('rgFinalizeAllBonuses()', context);
  assert.strictEqual(context.readingSyllableBonusAwarded, 2);
  assert.strictEqual(context.roundScore, 12);
  assert.strictEqual(context.rgItemEvidencePoints(10, 3), 15);
  const finalize = block('function finalizeWord()', 'function check()');
  assert.match(finalize, /pts:rgItemEvidencePoints\(failedLockedScore,0\)/);
  assert.match(finalize, /pts:rgItemEvidencePoints\(basePtsAwarded,srsBonusAwarded\)/);
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
  const GameUiCopy = {
    resumeLine(game, level, progress) { return '上次進度：' + [game, level, progress].join('・'); },
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
    GameUiCopy,
    window: { GameResume, GameUiCopy, __rgPendingResume: { stale: true } },
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
