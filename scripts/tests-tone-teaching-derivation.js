#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'js/games/tone-finder-game.js'), 'utf8');
const readingSource = fs.readFileSync(path.join(root, 'js/games/reading-game-app.js'), 'utf8');
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'data/approved-vocabulary-catalog.json'), 'utf8'));

const defsStart = source.indexOf('var DEFS = {');
const defsEnd = source.indexOf('// ════════════════════════════════════════════════════════════\n// 字母練習區');
const teachingStart = source.indexOf('function catalogPedagogySyllable()');
const teachingEnd = source.indexOf('// Lin 2026-07-31:', teachingStart);
const wordScoreStart = source.indexOf('var TF_WORDSCORE = {');
const wordScoreEnd = source.indexOf('// Lin 2026-07-06:', wordScoreStart);
const forceRevealStart = source.indexOf('function tfForceRevealZero()');
const forceRevealEnd = source.indexOf('// overlay เฉลยเมื่อกดมั่วครบ 3 ครั้ง', forceRevealStart);
const startSessionStart = source.indexOf('function startSetSession(words, opts)');
const startSessionEnd = source.indexOf('// ── สเปก 2026-07-03 ข้อ 3:', startSessionStart);
const initialToneMistakeStart = source.indexOf('function tfHandleInitialToneMistake(entry)');
const initialToneMistakeEnd = source.indexOf('function stepSessionGuess()', initialToneMistakeStart);
const deduceMistakeStart = source.indexOf('function tfHandleDeduceMistake(choiceLabel, errMsg)');
const deduceMistakeEnd = source.indexOf('// เผยคำตอบจาก canonical catalog', deduceMistakeStart);
const guideLockStart = source.indexOf('function tfLockCurrentWordForGuide()');
const guideLockEnd = source.indexOf('// คำปัจจุบันเป็นหลายพยางค์ไหม', guideLockStart);
const useHintStart = source.indexOf('function tfUseHint(keys)');
const useHintEnd = source.indexOf('function tfHandleDeduceMistake(choiceLabel, errMsg)', useHintStart);
const guideStateStart = source.indexOf('var tfGuideMode =');
const guideStateEnd = source.indexOf('function tfSyncGuideBtn()', guideStateStart);
const scoreEngineStart = source.indexOf('var TF_SCORE_CFG = {');
const scoreEngineEnd = source.indexOf('// ===== TF_WORDSCORE', scoreEngineStart);
const sessionBonusStart = source.indexOf('function tfResultIsNeutral(result)');
const neutralHelperEnd = source.indexOf('function tfApplySessionBonus()', sessionBonusStart);
const sessionBonusEnd = source.indexOf('function act(fn)', sessionBonusStart);
const skipStart = source.indexOf('  skipCurrentWord: function() {');
const skipEnd = source.indexOf('\n  },\n  // 高級', skipStart);
const reportInnerStart = source.indexOf('function buildReportInner()');
const reportInnerEnd = source.indexOf('function buildReportHTML()', reportInnerStart);
const sessionSummaryStart = source.indexOf('function stepSessionSummary()');
const sessionSummaryEnd = source.indexOf('function stepMistakeReview()', sessionSummaryStart);
assert.ok(defsStart >= 0 && defsEnd > defsStart && teachingStart >= 0 && teachingEnd > teachingStart);
assert.ok(wordScoreStart >= 0 && wordScoreEnd > wordScoreStart);
assert.ok(forceRevealStart >= 0 && forceRevealEnd > forceRevealStart);
assert.ok(startSessionStart >= 0 && startSessionEnd > startSessionStart);
assert.ok(initialToneMistakeStart >= 0 && initialToneMistakeEnd > initialToneMistakeStart);
assert.ok(deduceMistakeStart >= 0 && deduceMistakeEnd > deduceMistakeStart);
assert.ok(guideLockStart >= 0 && guideLockEnd > guideLockStart);
assert.ok(useHintStart >= 0 && useHintEnd > useHintStart);
assert.ok(guideStateStart >= 0 && guideStateEnd > guideStateStart);
assert.ok(scoreEngineStart >= 0 && scoreEngineEnd > scoreEngineStart);
assert.ok(sessionBonusStart >= 0 && sessionBonusEnd > sessionBonusStart);
assert.ok(neutralHelperEnd > sessionBonusStart);
assert.ok(skipStart >= 0 && skipEnd > skipStart);
assert.ok(reportInnerStart >= 0 && reportInnerEnd > reportInnerStart);
assert.ok(sessionSummaryStart >= 0 && sessionSummaryEnd > sessionSummaryStart);

const sandbox = {
  __syllable: null,
  currentAnswerSyl() { return { catalog: sandbox.__syllable }; },
};
vm.createContext(sandbox);
vm.runInContext(source.slice(defsStart, defsEnd), sandbox);
vm.runInContext(source.slice(teachingStart, teachingEnd), sandbox);
vm.runInContext(source.slice(wordScoreStart, wordScoreEnd), sandbox);

const scoreSession = {};
assert.deepStrictEqual(Array.from(sandbox.TF_WORDSCORE.LADDER), [10, 7, 4, 1, 0]);
assert.strictEqual(sandbox.TF_WORDSCORE.score(scoreSession), 10);
for (const expected of [7, 4, 1, 0]) {
  sandbox.TF_WORDSCORE.onWrong(scoreSession);
  assert.strictEqual(sandbox.TF_WORDSCORE.score(scoreSession), expected);
}
assert.strictEqual(sandbox.TF_WORDSCORE.isDead(scoreSession), true);

const initialWrongSandbox = {
  session: {
    combo: 4,
    currentWordDeduct: 0,
    currentWordMistakes: 0,
    currentWordMistakesTotal: 0,
    curWordAllFirstTry: true
  },
  __gaugeUpdates: 0,
  __multi: true,
  __errors: [],
  tfCurWordIsMulti() { return initialWrongSandbox.__multi; },
  tfCurWordIsParticle() { return false; },
  tfUpdateWordScoreGauge() { initialWrongSandbox.__gaugeUpdates += 1; },
  recordMistake() {
    initialWrongSandbox.session.currentWordMistakes += 1;
    initialWrongSandbox.session.currentWordMistakesTotal += 1;
  },
  showError(message) { initialWrongSandbox.__errors.push(message); },
  tfMinaToast() {},
  tfForceRevealZero() { throw new Error('first derivation mistake must not reveal'); }
};
initialWrongSandbox.window = initialWrongSandbox;
vm.createContext(initialWrongSandbox);
vm.runInContext(source.slice(wordScoreStart, wordScoreEnd), initialWrongSandbox);
vm.runInContext(source.slice(initialToneMistakeStart, initialToneMistakeEnd), initialWrongSandbox);
vm.runInContext(source.slice(deduceMistakeStart, deduceMistakeEnd), initialWrongSandbox);

initialWrongSandbox.tfHandleInitialToneMistake({ isParticle: false });
assert.strictEqual(initialWrongSandbox.session.curWordWrongGuess, true);
assert.strictEqual(initialWrongSandbox.session.combo, 4);
assert.strictEqual(initialWrongSandbox.session.curWordAllFirstTry, true);
assert.strictEqual(initialWrongSandbox.session.currentWordDeduct, 0);
assert.strictEqual(initialWrongSandbox.session.currentWordMistakes, 0);
assert.strictEqual(initialWrongSandbox.session.currentWordMistakesTotal, 0);
assert.strictEqual(initialWrongSandbox.TF_WORDSCORE.score(initialWrongSandbox.session), 10);

initialWrongSandbox.tfHandleDeduceMistake('ตัวเลือกผิด', '推導ผิด');
assert.strictEqual(initialWrongSandbox.session.currentWordDeduct, 1);
assert.strictEqual(initialWrongSandbox.session.currentWordMistakes, 1);
assert.strictEqual(initialWrongSandbox.session.currentWordMistakesTotal, 1);
assert.strictEqual(initialWrongSandbox.session.combo, 0);
assert.strictEqual(initialWrongSandbox.TF_WORDSCORE.score(initialWrongSandbox.session), 7);

initialWrongSandbox.session.combo = 4;
initialWrongSandbox.session.currentWordGuideUsed = true;
initialWrongSandbox.session.currentWordDeduct = 1;
initialWrongSandbox.session.currentWordMistakes = 0;
initialWrongSandbox.session.currentWordMistakesTotal = 0;
initialWrongSandbox.session.curWordAllFirstTry = true;
initialWrongSandbox.tfHandleDeduceMistake('ฝึกผิด', 'ฝึก推導ผิด');
assert.strictEqual(initialWrongSandbox.session.currentWordDeduct, 1);
assert.strictEqual(initialWrongSandbox.session.currentWordMistakes, 1);
assert.strictEqual(initialWrongSandbox.session.currentWordMistakesTotal, 1);
assert.strictEqual(initialWrongSandbox.session.combo, 4);
assert.strictEqual(initialWrongSandbox.session.curWordAllFirstTry, true);
assert.strictEqual(initialWrongSandbox.TF_WORDSCORE.score(initialWrongSandbox.session), 7);

const guideSandbox = {
  session: {
    score: 25,
    combo: 4,
    currentWordScore: 10,
    curWordSylRawSum: 10,
    currentWordFirstTry: true,
    curWordAllFirstTry: true,
    currentWordGuideUsed: false,
    hintUsed: false,
    currentWordGolden: true
  },
  __tips: 0,
  __renderCount: 0,
  tfCurWordIsParticle() { return false; },
  tfUpdateScoreHud() {},
  render() { guideSandbox.__renderCount += 1; },
  showTip() { guideSandbox.__tips += 1; }
};
vm.createContext(guideSandbox);
vm.runInContext(source.slice(guideLockStart, guideLockEnd), guideSandbox);
vm.runInContext(source.slice(useHintStart, useHintEnd), guideSandbox);
guideSandbox.tfUseHint(['high']);
assert.strictEqual(guideSandbox.session.score, 15);
assert.strictEqual(guideSandbox.session.currentWordScore, 0);
assert.strictEqual(guideSandbox.session.currentWordGuideUsed, true);
assert.strictEqual(guideSandbox.session.hintUsed, true);
assert.strictEqual(guideSandbox.session.currentWordGolden, false);
assert.strictEqual(guideSandbox.session.combo, 4);
assert.strictEqual(guideSandbox.__renderCount, 1);
assert.strictEqual(guideSandbox.__tips, 1);

assert.doesNotMatch(source, /tfResetGuideForNextUnit/, 'Tone must not reset the saved Hint choice when a word or page starts');
assert.doesNotMatch(source, /rg_guide_mode/, 'Tone must not read or write Reading guide preference');
assert.match(source, /localStorage\.getItem\('tf_guide_mode'\)/);
assert.match(source, /localStorage\.setItem\('tf_guide_mode', tfGuideMode \? '1' : '0'\)/);
assert.match(readingSource, /localStorage\.getItem\('rg_guide_mode'\)/);
assert.match(readingSource, /localStorage\.setItem\('rg_guide_mode',rgGuideMode\?'1':'0'\)/);

for (const [readingMode, toneMode] of [['1', '0'], ['0', '1']]) {
  const isolatedGuideSandbox = {
    localStorage: { getItem(key) { return { rg_guide_mode: readingMode, tf_guide_mode: toneMode }[key]; } }
  };
  vm.createContext(isolatedGuideSandbox);
  vm.runInContext(source.slice(guideStateStart, guideStateEnd), isolatedGuideSandbox);
  assert.strictEqual(isolatedGuideSandbox.tfGuideMode, toneMode === '1');
}

const bonusSandbox = {
  session: null,
  setTimeout(fn) { fn(); },
  tfRecordWordWrong() {},
  tfApplyStreakOnSetComplete() { return null; },
  tfUpdateBadgesOnSetComplete() { return []; },
  tfChallengeBump() {},
  tfRenderExtBar() {},
  tfScorePop() {}
};
bonusSandbox.window = bonusSandbox;
vm.createContext(bonusSandbox);
vm.runInContext(source.slice(scoreEngineStart, scoreEngineEnd), bonusSandbox);
vm.runInContext(source.slice(sessionBonusStart, sessionBonusEnd), bonusSandbox);
bonusSandbox.session = {
  results: Array.from({ length: 5 }, () => ({ firstTry: true, hintUsed: false })),
  score: 50,
  hardStarsEarned: 0,
  maxCombo: 5
};
bonusSandbox.tfApplySessionBonus();
assert.strictEqual(bonusSandbox.session.bonusAwarded, 70);
assert.strictEqual(bonusSandbox.session.score, 120);
assert.strictEqual(bonusSandbox.session.isPerfect, true);

const neutralSessionShapes = [
  ['hintUsed', { firstTry: true, hintUsed: true }],
  ['hint_used', { firstTry: true, hint_used: true }],
  ['skipped', { firstTry: true, skipped: true }],
  ['is_skipped', { firstTry: true, is_skipped: true }],
  ['is_practice', { firstTry: true, is_practice: true }]
];
for (const [label, neutralResult] of neutralSessionShapes) {
  bonusSandbox.session = {
    results: [neutralResult],
    score: 10,
    hardStarsEarned: 0,
    maxCombo: 1
  };
  bonusSandbox.tfApplySessionBonus();
  assert.strictEqual(bonusSandbox.session.bonusAwarded, 0, `${label} neutral-only round must receive no bonus`);
  assert.strictEqual(bonusSandbox.session.score, 10, `${label} neutral-only round must not change score`);
  assert.strictEqual(bonusSandbox.session.isPerfect, false, `${label} neutral-only round must not be Perfect`);
}

bonusSandbox.session = {
  results: [
    { firstTry: true, hintUsed: false },
    { firstTry: true, hintUsed: false },
    { firstTry: false, hintUsed: true },
    { firstTry: true, hintUsed: false },
    { firstTry: true, hintUsed: false }
  ],
  score: 40,
  hardStarsEarned: 0,
  maxCombo: 4
};
bonusSandbox.tfApplySessionBonus();
assert.strictEqual(bonusSandbox.session.results.length, 5);
assert.strictEqual(bonusSandbox.session.bonusAwarded, 0);
assert.strictEqual(bonusSandbox.session.score, 40);
assert.strictEqual(bonusSandbox.session.isPerfect, false);

const skipSandbox = {
  session: {
    words: [
      { word: 'กา', zh: '合成測試', readingTH: 'กา' },
      { word: 'นา', zh: '合成測試二', readingTH: 'นา' }
    ],
    index: 0,
    score: 40,
    combo: 4,
    currentWordScore: 0,
    curWordSylRawSum: 0,
    currentWordGuideUsed: true,
    hintUsed: true,
    results: Array.from({ length: 4 }, () => ({ firstTry: true, hintUsed: false })),
    hardStarsEarned: 0,
    maxCombo: 4
  },
  selectedLevel: 1,
  advSentenceCtx: null,
  roundReport: { items: [] },
  tfNeutralSkipSurface() { return true; },
  catalogToneNumber() { return 1; },
  tfWordContentKey() { return 'synthetic@初'; },
  RoundReport: { addItem(report, item) { report.items.push(item); } },
  advances: 0,
  tfAdvanceCommittedWord() { skipSandbox.advances += 1; skipSandbox.session.index += 1; },
  setTimeout(fn) { fn(); },
  tfRecordWordWrong() {},
  tfApplyStreakOnSetComplete() { return null; },
  tfUpdateBadgesOnSetComplete() { return []; },
  tfChallengeBump() {},
  tfRenderExtBar() {},
  tfScorePop() {}
};
skipSandbox.window = skipSandbox;
vm.createContext(skipSandbox);
vm.runInContext(source.slice(scoreEngineStart, scoreEngineEnd), skipSandbox);
vm.runInContext(source.slice(sessionBonusStart, sessionBonusEnd), skipSandbox);
vm.runInContext(source.slice(skipStart, skipEnd).replace(/^\s*skipCurrentWord:\s*/, 'var skipCurrentWord = ') + '\n};', skipSandbox);
skipSandbox.skipCurrentWord();
skipSandbox.skipCurrentWord();
assert.strictEqual(skipSandbox.session.results[4].hintUsed, true);
assert.strictEqual(skipSandbox.roundReport.items[0].hint_used, true);
assert.strictEqual(skipSandbox.session.results.length, 5, 'rapid double Skip must record one neutral result');
assert.strictEqual(skipSandbox.roundReport.items.length, 1, 'rapid double Skip must emit one report item');
assert.strictEqual(skipSandbox.advances, 1, 'rapid double Skip must advance one word');
skipSandbox.tfApplySessionBonus();
assert.strictEqual(skipSandbox.session.bonusAwarded, 0);
assert.strictEqual(skipSandbox.session.score, 40);

const oldAsyncSession = {
  words: [
    { word: 'เก่า', zh: '舊回合', readingTH: 'เก่า' },
    { word: 'เก่าสอง', zh: '舊回合二', readingTH: 'เก่า-สอง' }
  ],
  index: 0,
  score: 0,
  combo: 0,
  currentWordScore: 0,
  curWordSylRawSum: 0,
  currentWordGuideUsed: false,
  hintUsed: false,
  results: []
};
skipSandbox.session = oldAsyncSession;
skipSandbox.pendingSkipAdvance = null;
skipSandbox.LearningReview = {
  runtimeEnabled() { return true; },
  advance(report, callback) { skipSandbox.pendingSkipAdvance = callback; }
};
skipSandbox.skipCurrentWord();
assert.strictEqual(oldAsyncSession.results.length, 1, 'async Skip must record the old question once');
assert.strictEqual(oldAsyncSession.index, 0, 'async Skip must wait for the save acknowledgement');
assert.strictEqual(oldAsyncSession.skipCommitPending, true, 'async Skip must stay locked while save is pending');
const freshSession = {
  words: [
    { word: 'ใหม่', zh: '新回合', readingTH: 'ใหม่' },
    { word: 'ใหม่สอง', zh: '新回合二', readingTH: 'ใหม่-สอง' }
  ],
  index: 0,
  score: 0,
  combo: 0,
  currentWordScore: 0,
  curWordSylRawSum: 0,
  currentWordGuideUsed: false,
  hintUsed: false,
  results: []
};
skipSandbox.session = freshSession;
skipSandbox.pendingSkipAdvance();
skipSandbox.pendingSkipAdvance();
assert.strictEqual(freshSession.index, 0, 'late old-session Skip callback must not advance a fresh session');
assert.strictEqual(freshSession.results.length, 0, 'late old-session Skip callback must not add fresh-session evidence');
assert.strictEqual(oldAsyncSession.skipCommitPending, false, 'ignored late callback must release only its old-session lock');
skipSandbox.LearningReview.runtimeEnabled = function () { return false; };
skipSandbox.skipCurrentWord();
assert.strictEqual(freshSession.index, 1, 'fresh session must not inherit the old Skip lock');
assert.strictEqual(freshSession.results.length, 1, 'fresh session must still record its own Skip');

const isolatedNeutralReportItems = [
  {
    question: '練習優先', meaning: '合成測試', attempts: [], user_answer: '', correct_answer: '第五聲',
    is_correct: true, is_practice: true, is_skipped: false, hint_used: false, wrong_count: 0, item_score: 0,
    linguistic: { correct_tone: 5 }
  },
  {
    question: '跳過優先', meaning: '合成測試', attempts: [], user_answer: '', correct_answer: '第五聲',
    is_correct: true, is_practice: false, is_skipped: true, hint_used: false, wrong_count: 0, item_score: 0,
    linguistic: { correct_tone: 5 }
  },
  {
    question: '提示優先', meaning: '合成測試', attempts: [], user_answer: '', correct_answer: '第五聲',
    is_correct: true, is_practice: false, is_skipped: false, hint_used: true, wrong_count: 0, item_score: 0,
    linguistic: { correct_tone: 5 }
  }
];

const reportModelSandbox = {
  session: { results: [] },
  roundReport: { items: isolatedNeutralReportItems, score: 0 },
  selectedLevel: 1,
  TONES: { 5: { zh: '第五聲', color: '#000' } },
  TF_SCORE: { weightedScore(score) { return score; } },
  RoundReport: { loginSectionsHtml() { return ''; } },
  tfSrsLoggedIn() { return false; },
  Date
};
reportModelSandbox.window = reportModelSandbox;
vm.createContext(reportModelSandbox);
vm.runInContext(source.slice(sessionBonusStart, neutralHelperEnd), reportModelSandbox);
vm.runInContext(source.slice(reportInnerStart, reportInnerEnd), reportModelSandbox);
const reportModelHtml = reportModelSandbox.buildReportInner();
assert.match(reportModelHtml, /一次答對題數<\/td><td[^>]*>0 \/ 3<\/td>/, 'Tone report model must exclude isolated contradictory practice/Skip/Hint flags from Clean');
assert.match(reportModelHtml, /跳過優先[\s\S]{0,500}<span[^>]*>跳過<\/span>/, 'Hint → Skip must keep Skip priority in Tone report rows');
assert.match(reportModelHtml, /提示優先[\s\S]{0,500}<span[^>]*>純練習<\/span>/, 'isolated Tone hint_used must render as neutral practice, never correct');

function renderToneSummary(reportItems, scoreResults) {
  const events = [];
  const summarySandbox = {
    session: {
      results: scoreResults,
      score: 0,
      bonusAwarded: 0,
      submissionLinked: true,
      isPerfect: false,
      newBadges: [],
      streakResult: { state: { streak: 0 }, events: {} }
    },
    roundReport: { items: reportItems },
    selectedLevel: 1,
    TONES: { 5: { zh: '第五聲', color: '#000' } },
    TF_SCORE: { weightedScore(score) { return score; } },
    TF_SCORE_CFG: { LEVEL_WEIGHT: { 1: 1 } },
    gtag() { events.push(Array.from(arguments)); },
    tfDesktopOrPortrait() { return false; },
    tfLoadStreak() { return { streak: 0 }; },
    tfMinaSay() { return ''; },
    tfMinaBubble() { return ''; },
    tfBadgeIcon() { return ''; },
    Math,
    Number
  };
  summarySandbox.window = summarySandbox;
  vm.createContext(summarySandbox);
  vm.runInContext(source.slice(sessionBonusStart, neutralHelperEnd), summarySandbox);
  vm.runInContext(source.slice(sessionSummaryStart, sessionSummaryEnd), summarySandbox);
  return { html: summarySandbox.stepSessionSummary(), events };
}

const reportModelScoreResults = isolatedNeutralReportItems.map(function (row) {
  return { entry: { word: row.question }, firstTry: true, mistakes: 0, score: 0 };
});
const scoreResultsWithNeutralFlags = [
  { entry: { word: 'hintUsed' }, firstTry: true, hintUsed: true, mistakes: 0, score: 0 },
  { entry: { word: 'skipped' }, firstTry: true, skipped: true, mistakes: 0, score: 0 },
  { entry: { word: 'is_practice' }, firstTry: true, is_practice: true, mistakes: 0, score: 0 },
  { entry: { word: 'is_skipped' }, firstTry: true, is_skipped: true, mistakes: 0, score: 0 },
  { entry: { word: 'hint_used' }, firstTry: true, hint_used: true, mistakes: 0, score: 0 }
];
const resultModel = renderToneSummary(isolatedNeutralReportItems, reportModelScoreResults);
assert.match(resultModel.html, /class="tf-sum-score gsh-end-score">0 \/ 3<\/div>/, 'Tone Result report model must exclude isolated contradictory practice/Skip/Hint flags from Clean');
assert.strictEqual(resultModel.events[0][2].perfect, 0, 'Tone Result analytics must use the neutral-safe report count');

const resultFallback = renderToneSummary([], scoreResultsWithNeutralFlags);
assert.match(resultFallback.html, /class="tf-sum-score gsh-end-score">0 \/ 5<\/div>/, 'Tone Result fallback must exclude canonical, DTO, and snake_case neutral flags from Clean');
assert.strictEqual(resultFallback.events[0][2].perfect, 0, 'Tone fallback analytics must use the neutral-safe count');

const challengeStart = source.indexOf('function tfChallengeBump(session) {');
const challengeEnd = source.indexOf('// Lin 2026-07-04:', challengeStart);
assert.ok(challengeStart >= 0 && challengeEnd > challengeStart);
const challengeState = { progress: 0, done: false };
const challengeSandbox = {
  tfChallengeState() { return { ch: { type: 'correct', target: 30 }, st: challengeState }; },
  tfSaveChallenge() {}
};
vm.createContext(challengeSandbox);
vm.runInContext(source.slice(sessionBonusStart, neutralHelperEnd), challengeSandbox);
vm.runInContext(source.slice(challengeStart, challengeEnd), challengeSandbox);
challengeSandbox.tfChallengeBump({ results: [
  { mistakes: 0, firstTry: true },
  { mistakes: 0, firstTry: true, hintUsed: true },
  { mistakes: 0, firstTry: true, is_practice: true },
  { mistakes: 0, firstTry: true, is_skipped: true },
  { mistakes: 0, firstTry: true, forced: true },
  { mistakes: 0, firstTry: false },
  { mistakes: 1, firstTry: false }
] });
assert.strictEqual(challengeState.progress, 1, 'weekly correct challenge must credit only the complete clean answer');

const enhanceStart = source.indexOf("var actions=body.querySelector('.gsh-end-actions');");
const enhanceEndMarker = 'tfFinalizeAlignedResultPresentation(body);';
const enhanceEnd = source.indexOf(enhanceEndMarker, enhanceStart);
assert.ok(enhanceStart >= 0 && enhanceEnd > enhanceStart);
let enhancedResult;
const enhanceSandbox = {
  body: { querySelector() { return null; } },
  session: { results: [
    { mistakes: 0, firstTry: true },
    { mistakes: 0, firstTry: true, hintUsed: true },
    { mistakes: 0, firstTry: true, skipped: true },
    { mistakes: 0, firstTry: true, forced: true },
    { mistakes: 0, firstTry: false },
    { mistakes: 1, firstTry: false }
  ], newBadges: [] },
  roundReport: null,
  tfSrsLoggedIn() { return false; },
  GameFlow: { enhanceResult(options) { enhancedResult = options; } },
  tfFinalizeAlignedResultPresentation() {}
};
enhanceSandbox.window = enhanceSandbox;
vm.createContext(enhanceSandbox);
vm.runInContext(source.slice(sessionBonusStart, neutralHelperEnd), enhanceSandbox);
vm.runInContext('(function(){' + source.slice(enhanceStart, enhanceEnd + enhanceEndMarker.length) + '})()', enhanceSandbox);
assert.strictEqual(enhancedResult.correct, 1, 'shared Result fallback must exclude Free Practice, Skip, forced, and wrong answers');
assert.strictEqual(enhancedResult.total, 6, 'shared Result fallback must preserve the round denominator');
enhanceSandbox.roundReport = { correct_count: 0, total_items: 6 };
vm.runInContext('(function(){' + source.slice(enhanceStart, enhanceEnd + enhanceEndMarker.length) + '})()', enhanceSandbox);
assert.strictEqual(enhancedResult.correct, 0, 'shared Result must prefer the authoritative report count when present');

const firstMultiRecord = catalog.records.find((record) => record.level === '中' && record.syllables.length > 1);
assert.ok(firstMultiRecord, 'canonical intermediate multi-syllable fixture is required');
const firstWordSandbox = {
  advSentenceCtx: null,
  WORD_LIST: [],
  tfGuideMode: false,
  selectedLevel: 2,
  selectedCategory: 'ทั้งหมด',
  session: null,
  hist: [],
  histPos: -1,
  randomEntry: null,
  S: null,
  __reveal: null,
  tfRollGolden() { return false; },
  tfSetupSrsFlagsForCurrentWord() {},
  tfCurWordNoTools() { return false; },
  tfSaveResumeState() {},
  render() {},
  tfMinaToast() {},
  setTimeout() {},
  CustomEvent: function CustomEvent() {},
  tfCurWordIsMulti() { return true; },
  TF_SCORE_CFG: { SCORE_FAIL_ZERO: 0 },
  catalogToneNumber() { return firstMultiRecord.syllables[0].toneNumber; },
  tfShowRevealOverlay(entry, tone, options) {
    firstWordSandbox.__reveal = { entry, tone, options };
  }
};
firstWordSandbox.window = firstWordSandbox;
vm.createContext(firstWordSandbox);
vm.runInContext(source.slice(wordScoreStart, wordScoreEnd), firstWordSandbox);
vm.runInContext(source.slice(startSessionStart, startSessionEnd), firstWordSandbox);
vm.runInContext(source.slice(forceRevealStart, forceRevealEnd), firstWordSandbox);
const firstMultiEntry = {
  word: firstMultiRecord.word,
  contentKey: firstMultiRecord.contentKey,
  readingTH: firstMultiRecord.readingTH,
  zh: firstMultiRecord.zhTW,
  level: 2,
  syls: firstMultiRecord.syllables.map((syllable) => ({ toneNumber: syllable.toneNumber, catalog: syllable }))
};
firstWordSandbox.startSetSession([firstMultiEntry], { keepOrder: true });
assert.deepStrictEqual(Array.from(firstWordSandbox.session.learningComponentWrongCounts), []);
for (const expected of [7, 4, 1, 0]) {
  firstWordSandbox.TF_WORDSCORE.onWrong(firstWordSandbox.session);
  assert.strictEqual(firstWordSandbox.TF_WORDSCORE.score(firstWordSandbox.session), expected);
}
assert.doesNotThrow(() => firstWordSandbox.tfForceRevealZero());
assert.strictEqual(firstWordSandbox.session.learningComponentWrongCounts[0], 4);
assert.strictEqual(firstWordSandbox.__reveal.tone, firstMultiRecord.syllables[0].toneNumber);
assert.strictEqual(firstWordSandbox.__reveal.options.sylIdx, 0);
firstWordSandbox.tfGuideMode = true;
firstWordSandbox.startSetSession([firstMultiEntry], { keepOrder: true });
assert.strictEqual(firstWordSandbox.tfGuideMode, true, 'a new round must retain the saved Hint choice');
assert.strictEqual(firstWordSandbox.session.currentWordGuideUsed, true, 'the new question must inherit Hint as Free Practice');

let syllableCount = 0;
for (const record of catalog.records) {
  for (const syllable of record.syllables) {
    syllableCount += 1;
    sandbox.__syllable = syllable;
    const markChoice = sandbox.catalogExpectedTeachingChoice('s1');
    if (markChoice === 'hasMark') {
      const family = sandbox.catalogExpectedTeachingChoice('s2a');
      if (family === 'low') {
        assert.ok(['่', '้'].includes(syllable.toneMark));
        assert.strictEqual(sandbox.catalogExpectedTeachingChoice('s2a_low'), syllable.toneMark);
      } else {
        const cls = sandbox.catalogExpectedTeachingChoice('s2a_other');
        assert.ok(['mid', 'high', 'lead'].includes(cls));
        assert.ok((cls === 'mid' ? ['่', '้', '๊', '๋'] : ['่', '้']).includes(syllable.toneMark));
        assert.strictEqual(sandbox.catalogExpectedTeachingChoice(cls === 'mid' ? 's2a_mid' : 's2a_hi'), syllable.toneMark);
      }
    } else {
      const liveDead = sandbox.catalogExpectedTeachingChoice('s2b');
      assert.ok(liveDead === 'live' || liveDead === 'dead');
      const classChoice = sandbox.catalogExpectedTeachingChoice(liveDead === 'live' ? 's2b_live' : 's2b_dead');
      if (classChoice === 'low_dead') {
        assert.ok(['long_vowel', 'short_vowel'].includes(sandbox.catalogExpectedTeachingChoice('s2b_dl')));
      }
    }
    const tailChoice = sandbox.catalogExpectedTeachingChoice('helper');
    if (tailChoice === 'has_tail') {
      assert.ok(['long_tail', 'short_tail'].includes(sandbox.catalogExpectedTeachingChoice('h_with')));
    } else {
      assert.ok(['long_vowel_h', 'short_vowel_h'].includes(sandbox.catalogExpectedTeachingChoice('h_no')));
    }
  }
}

assert.strictEqual(catalog.records.length, 200);
assert.ok(syllableCount > 200);
assert.match(source, /function navigateToInflection\(\)/);
assert.match(source, /if \(tfCurWordNoTools\(\)\) tfForceRevealZero\(\);\s*else navigateToInflection\(\);/);
assert.match(source, /tfHandleInitialToneMistake\(entry\);[\s\S]{0,260}navigateToInflection\(\);/);
assert.doesNotMatch(source.slice(initialToneMistakeStart, initialToneMistakeEnd), /recordMistake|TF_WORDSCORE\.onWrong|TF_WORDSCORE\.onNextStep/);
assert.match(source.slice(deduceMistakeStart, deduceMistakeEnd), /recordMistake\([\s\S]{0,420}TF_WORDSCORE\.onWrong\(session\)/);
assert.match(source.slice(deduceMistakeStart, deduceMistakeEnd), /if \(session\.currentWordGuideUsed\)[\s\S]{0,260}return;[\s\S]{0,80}TF_WORDSCORE\.onWrong\(session\)/);
assert.match(source, /function tfScoreDeduce\(\)[\s\S]{0,1500}TF_WORDSCORE\.score\(session\)/);
assert.match(source, /function tfScoreDeduce\(\)[\s\S]{0,700}currentWordDeduct[\s\S]{0,180}tfScoreFirstTry\(\)/);
assert.match(source, /if \(TF_WORDSCORE\.isDead\(session\)\) \{\s*tfForceRevealZero\(\);/);
assert.match(source, /session\.initialGuess = 0;[\s\S]{0,650}navigateToInflection\(\);/);
assert.match(source, /function tfAdvanceCommittedWord\(\)[\s\S]{0,120}tfResetWordScoring\(\)/);
assert.match(source, /function tfResultIsNeutral\(result\)[\s\S]{0,180}result\.is_practice[\s\S]{0,180}result\.hint_used[\s\S]{0,180}result\.skipped/);
assert.match(source, /var perfectCount\s*=\s*scoredResults\.filter[\s\S]{0,180}!tfResultIsNeutral\(r\)[\s\S]{0,220}hadNeutralResult[\s\S]{0,220}sessionBonus\(total, perfectCount\)/);
assert.match(source, /needReview:\s*!session\.currentWordGuideUsed\s*&&/);
assert.match(source, /is_practice:\s*_tfResult\.hintUsed/);
assert.match(source, /isNeutral\s*\?\s*'純練習'/);
assert.match(source, /var isWrong\s*=\s*!r\.is_correct\s*&&\s*!isNeutral/);
assert.match(source, /if \(!entry\.isParticle && !session\.currentWordGuideUsed && tfSrsLoggedIn\(\)\)/);
assert.match(source, /if \(_tfResult\.hintUsed\) roundReport\.learning_exempt = true;/);
assert.match(source, /finally \{\s*roundReport\.learning_exempt = _tfRoundWasLearningExempt;/);
assert.doesNotMatch(source.slice(guideLockStart, guideLockEnd), /session\.combo\s*=/);
assert.doesNotMatch(source.slice(useHintStart, useHintEnd), /TF_WORDSCORE\.onPeek|tfForceRevealZero/);
assert.match(source, /startGuidedQuestion:[\s\S]{0,420}navigateToInflection\(\)/);
assert.match(source, /var newTone = nextStep === 'result' \? catalogToneNumber\(\) : null/);
assert.doesNotMatch(source, /\bTH\.|TH_ENGINE|computeTone|TONE_OVERRIDE|getInitClass|getVowelType|isLiveWord/);

console.log(`TONE_TEACHING_DERIVATION_PASS (${catalog.records.length} records, ${syllableCount} syllables)`);
