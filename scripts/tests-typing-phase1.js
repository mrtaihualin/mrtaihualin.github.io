#!/usr/bin/env node
'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'js/games/typing-game-app.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'typing-game.html'), 'utf8');
const listeningHtml = fs.readFileSync(path.join(root, 'listening-game.html'), 'utf8');
const legoSource = fs.readFileSync(path.join(root, 'js/games/lego-game-app.js'), 'utf8');
const scoreSource = fs.readFileSync(path.join(root, 'js/games/typing-score.js'), 'utf8');
const reviewedDisplay = require(path.join(root, 'js/games/reviewed-vocabulary-display.js'));
let passed = 0;

function test(name, fn) {
  fn();
  passed++;
  console.log(`✓ ${name}`);
}

function functionBlock(name, nextName) {
  const start = source.indexOf(`function ${name}(`);
  const end = source.indexOf(`function ${nextName}(`, start + 1);
  assert.ok(start >= 0 && end > start, `หา function ${name} ไม่พบ`);
  return source.slice(start, end);
}

const context = { window: {} };
vm.createContext(context);
vm.runInContext(scoreSource, context, { filename: 'typing-score.js' });
const scoring = context.window.TYPING_SCORE;

test('shared Typing score exposes the locked formula', () => {
  assert.ok(scoring && typeof scoring.score === 'function');
  assert.strictEqual(scoring.quotaFor(1), 4);
  assert.strictEqual(scoring.quotaFor(6), 6);
  assert.strictEqual(scoring.quotaFor(20), 9);
});

test('score reaches zero at quota and stays zero after more errors', () => {
  for (const units of [1, 4, 6, 20]) {
    const quota = scoring.quotaFor(units);
    assert.strictEqual(scoring.score(units, quota), 0);
    assert.strictEqual(scoring.score(units, quota + 5), 0);
  }
});

test('High polite mode requires the approved particle text without changing score units', () => {
  const particle = functionBlock('tgShowParticleFor', 'tgScoreSylCount');
  const scoreUnits = functionBlock('tgScoreSylCount', 'tgSyncParticleBtn');
  const load = functionBlock('loadWord', 'loadSyl');
  const particleContext = { tgParticleMode: 'off' };
  vm.createContext(particleContext);
  vm.runInContext(particle, particleContext);

  const femaleSentence = { politeF: 'คะ' };
  const maleSentence = { politeF: null };
  assert.strictEqual(particleContext.tgShowParticleFor(femaleSentence), null);
  particleContext.tgParticleMode = 'm';
  assert.strictEqual(particleContext.tgShowParticleFor(femaleSentence), 'ครับ');
  particleContext.tgParticleMode = 'f';
  assert.strictEqual(particleContext.tgShowParticleFor(femaleSentence), 'คะ');
  assert.strictEqual(particleContext.tgShowParticleFor(maleSentence), 'ครับ');

  assert.match(load, /sylList=sylList\.concat\(\[\{th:_tgParticle,isParticle:true\}\]\)/);
  assert.match(load, /WORD\.th\+\(_tgParticle\|\|''\)/);
  assert.match(scoreUnits, /isParticle[\s\S]*sylList\.length-1/);
  assert.match(source, /function tgIsParticleSegment\(index\)/);
});

test('polite input mistakes retry without changing any statistics', () => {
  const makeFlow = (continuous, particle) => {
    const elements = {
      ok: { textContent: '' },
      bad: { textContent: '' },
      'retry-hint': { textContent: '', className: '' },
    };
    const flow = {
      RG_CONT_ON: continuous,
      RG_CONT_SEG: 0,
      RG_CONT_WRONG: 0,
      RG_TYPE: { on: true, pos: 0, wrong: 0, target: 'ก' },
      checked: false,
      sylList: [{ isParticle: particle }],
      sylIdx: 0,
      wordWrongTotal: 0,
      wordHadWrong: false,
      streak: 7,
      okC: 0,
      badC: 0,
      flashCount: 0,
      highlightCount: 0,
      document: { getElementById: (id) => elements[id] || null },
      tgCurWordScore() { return 10 - this.wordWrongTotal; },
      tgScoreSylCount() { return 1; },
      tgUpdateScoreBar() {},
      updateCombo() {},
      rgTypeFlashWrong() {},
      rgTypeHighlightNextKey() {},
      rgTypeRenderTarget() {},
      rgQuotaFor() { return 4; },
      rgToast() {},
    };
    flow.rgTypeFlashWrong = () => { flow.flashCount++; };
    flow.rgTypeHighlightNextKey = () => { flow.highlightCount++; };
    vm.createContext(flow);
    vm.runInContext([
      functionBlock('tgIsParticleSegment', 'tgSyncParticleBtn'),
      functionBlock('rgTypeChar', 'rgHandleEnterKey'),
      functionBlock('rgContChar', 'rgContAdvanceSegment'),
    ].join('\n'), flow);
    return flow;
  };

  for (const continuous of [false, true]) {
    const polite = makeFlow(continuous, true);
    if (continuous) polite.rgContChar('x'); else polite.rgTypeChar('x');
    assert.deepStrictEqual(
      {
        typeWrong: polite.RG_TYPE.wrong,
        continuousWrong: polite.RG_CONT_WRONG,
        wordWrongTotal: polite.wordWrongTotal,
        wordHadWrong: polite.wordHadWrong,
        streak: polite.streak,
        badC: polite.badC,
      },
      { typeWrong: 0, continuousWrong: 0, wordWrongTotal: 0, wordHadWrong: false, streak: 7, badC: 0 }
    );
    assert.strictEqual(polite.flashCount, 1);
    assert.strictEqual(polite.highlightCount, 1);

    const normal = makeFlow(continuous, false);
    if (continuous) normal.rgContChar('x'); else normal.rgTypeChar('x');
    assert.strictEqual(continuous ? normal.RG_CONT_WRONG : normal.RG_TYPE.wrong, 1);
    assert.strictEqual(normal.wordWrongTotal, 1);
    assert.strictEqual(normal.wordHadWrong, true);
    assert.strictEqual(normal.streak, 0);
    assert.strictEqual(normal.badC, 1);
  }
});

test('single-syllable zero score keeps accepting input without reveal/fail', () => {
  const block = functionBlock('rgTypeChar', 'rgHandleEnterKey');
  assert.match(block, /本題分數已是 0，還是要繼續打到正確為止/);
  assert.doesNotMatch(block, /rgTypeFailBranch\s*\(/);
  assert.doesNotMatch(block, /RG_TYPE\.pos\s*=\s*RG_TYPE\.target\.length/);
});

test('continuous typing zero score keeps accepting input without reveal/finish', () => {
  const block = functionBlock('rgContChar', 'rgContAdvanceSegment');
  assert.match(block, /本題分數已是 0，還是要繼續打到正確為止/);
  assert.doesNotMatch(block, /wordFailed\s*=\s*true/);
  assert.doesNotMatch(block, /rgContFinish\s*\(/);
  assert.doesNotMatch(block, /RG_TYPE\.pos\s*=\s*RG_TYPE\.target\.length/);
});

test('fully typed word reveals, shows Next, and Enter advances', () => {
  const wAssignments = Array.from(source.matchAll(/W=\{th:SY\.th,[^\n]+?\};/g), (match) => match[0]);
  assert.strictEqual(wAssignments.length, 2, 'Typing must have exactly two reviewed-syllable W assignments');
  wAssignments.forEach((assignment) => assert.match(assignment, /catalog:SY\.catalog/));

  function element() {
    return {
      className: '',
      innerHTML: '',
      textContent: '',
      style: { display: '' },
      classList: { contains() { return false; } },
      appendChild(child) { this.innerHTML += child.textContent || child.innerHTML || '<node>'; },
      querySelectorAll() { return []; },
    };
  }

  const elements = {
    'bonus-section': element(),
    'bonus-reason': element(),
    'retry-hint': element(),
    'btn-skip': element(),
    'btn-check': element(),
    'btn-next': element(),
    'rg-kbd': element(),
    ok: element(),
    bad: element(),
  };
  elements['btn-next'].style.display = 'none';
  elements['btn-next'].offsetParent = {};

  let advanced = 0;
  elements['btn-next'].click = () => { advanced++; };
  const flow = {
    Math,
    window: {},
    document: {
      getElementById: (id) => elements[id] || null,
      createElement: () => element(),
    },
    buildAnswerHeader: reviewedDisplay.buildAnswerHeader,
    buildAnswerRows: reviewedDisplay.buildAnswerRows,
    WORD: { th: 'สอน', zh: '教', readingTH: 'สอน' },
    SY: {
      th: 'สอน', read: 'สอน', cons: 'ส', vowel: 'ออ', final: 'น', tone_name: 'จัตวา',
      catalog: { consonant: 'ส', vowel: 'ออ', writtenFinal: 'น', toneName: 'จัตวา' },
    },
    W: null,
    RG_TYPE: { on: true, pos: 0, wrong: 0, target: 'สอน' },
    RG_CONT_ON: false,
    checked: false,
    sylList: [{}],
    sylIdx: 0,
    okC: 0,
    badC: 0,
    wordWrongTotal: 0,
    wordHadWrong: false,
    streak: 0,
    renderSylStrip() {},
    rgHideTypePanelForReveal() {},
    finalizeWord() {},
    updateCombo() {},
    refreshUI() {},
    tgSyncHintOffAction() {},
    rgTypeRenderTarget() {},
    rgTypeHighlightNextKey() {},
    rgTypeFlashWrong() {},
    rgShiftKeys() { return []; },
    showReveal() { flow.revealText = reviewedDisplay.buildAnswerHeader(flow.W); },
  };
  vm.createContext(flow);
  vm.runInContext(wAssignments[0], flow);
  vm.runInContext([
    functionBlock('buildRevealRules', 'renderBonusReason'),
    functionBlock('renderBonusReason', 'tgRoundSize'),
    functionBlock('evaluateBonus', 'tgHasDetailContent'),
    functionBlock('setGameBtns', 'markOpts'),
    functionBlock('rgTypeSuccessBranch', 'rgTypeFailBranch'),
    functionBlock('rgTypeOnFullyTyped', 'rgTypeChar'),
    functionBlock('rgTypeChar', 'rgHandleEnterKey'),
    functionBlock('rgHandleEnterKey', 'rgTypeBackspace'),
  ].join('\n'), flow);

  Array.from('สอน').forEach((character) => flow.rgTypeChar(character));
  assert.strictEqual(flow.checked, true);
  assert.match(flow.revealText, /^สอน/);
  assert.strictEqual(elements['btn-next'].style.display, '');
  assert.strictEqual(elements['btn-next'].textContent, '下一題 →');

  let prevented = false;
  assert.strictEqual(flow.rgHandleEnterKey({ preventDefault() { prevented = true; } }), true);
  assert.strictEqual(prevented, true);
  assert.strictEqual(advanced, 1);
});

test('guide mode toggles in place and refreshes the current score', () => {
  const block = functionBlock('tgChooseGuideMode', 'rgShiftKeys');
  assert.match(block, /setGuideMode\(!!on\)/);
  assert.match(block, /tgUpdateScoreBar\(\)/);
  assert.doesNotMatch(block, /initGame\s*\(/);
  assert.doesNotMatch(block, /GameResume\.clear/);
});

test('page routes the mode control through the active-question toggle', () => {
  assert.match(html, /id="guide-toggle"[^>]+tgChooseGuideMode\(_v\)/);
  assert.doesNotMatch(html, /id="guide-toggle"[^>]+setGuideMode\(_v\)/);
});

test('opening a guide permanently zeroes the current word after toggle-off', () => {
  const score = functionBlock('tgCurWordScore', 'tgUpdateScoreBar');
  const finalize = functionBlock('finalizeWord', 'next');
  assert.match(score, /wordUsedGuide/);
  assert.doesNotMatch(score, /wordUsedGuide[^\n]+guideMode/);
  assert.match(finalize, /if\(wordUsedGuide\)\s*\{/);
  assert.doesNotMatch(finalize, /wordUsedGuide\s*&&\s*guideMode/);
});

test('mobile software keyboard closes outside active Typing input states', () => {
  const close = functionBlock('tgCloseMobileKeyboard', 'tgInitKeyboardDismissControls');
  const hide = functionBlock('rgHideTypePanelForReveal', 'rgTypeRenderTarget');
  const success = functionBlock('rgTypeSuccessBranch', 'rgTypeFailBranch');
  assert.match(close, /document\.activeElement===mi/);
  assert.match(close, /mi\.blur\(\)/);
  assert.match(hide, /tgCloseMobileKeyboard\(\)/);
  assert.match(success, /else \{\s*tgCloseMobileKeyboard\(\)/);
  assert.match(source, /closest\('#word-ctl-row, #rg-howto-btn'\)/);
  assert.doesNotMatch(source, /#wm-trigger/);
  assert.match(functionBlock('setLevel', 'initGame'), /tgCloseMobileKeyboard\(\)/);
  assert.match(functionBlock('endRound', 'tgAttachLoginSummary'), /tgCloseMobileKeyboard\(\)/);
});

test('an unfinished normal round cannot be abandoned by changing level', () => {
  const levelSwitch = functionBlock('setLevel', 'initGame');
  const events = [];
  const elements = {
    'ltab-初': { classList: { add() { events.push('tab-add-initial'); } } },
    'ltab-中': { classList: { add() { events.push('tab-add-middle'); } } },
    end: { style: {} },
    'tg-resume-banner': { style: {} },
    'bars-wrap': { style: {} },
    'rg-stat-row': { style: {} },
    game: {
      style: {},
      inert: false,
      setAttribute() {},
      removeAttribute() {},
    },
  };
  const immediatePromise = {
    resolve() { return { then(resolve) { resolve(); } }; },
  };
  const reviewRuntime = { runtimeEnabled() { return true; } };
  const levelContext = {
    window: { LearningReview: reviewRuntime, __tgSrsSyncedOnce: false },
    LearningReview: reviewRuntime,
    Promise: immediatePromise,
    console,
    curLevel: '初',
    tgRoundActive: true,
    tgLevelSwitchRequest: 0,
    tgCloseMobileKeyboard() { events.push('keyboard-close'); },
    rgToast(message) { events.push(`toast:${message}`); },
    gtag() { events.push('analytics'); },
    localStorage: { setItem() { events.push('storage'); } },
    document: {
      querySelectorAll() { return [{ classList: { remove() { events.push('tab-remove'); } } }]; },
      getElementById(id) { return elements[id] || null; },
    },
    tgPrimeReview() { return {}; },
    rgLoggedIn() { return false; },
    initGame() { events.push('init'); },
  };
  vm.createContext(levelContext);
  vm.runInContext(levelSwitch, levelContext);

  assert.strictEqual(levelContext.setLevel('中'), false);
  assert.strictEqual(levelContext.curLevel, '初');
  assert.deepStrictEqual(events, ['toast:請先完成目前這一輪，再更換等級']);
  assert.strictEqual(levelContext.tgLevelSwitchRequest, 0);

  levelContext.tgRoundActive = false;
  assert.strictEqual(levelContext.setLevel('中'), true);
  assert.strictEqual(levelContext.curLevel, '中');
  assert.ok(events.includes('keyboard-close'));
  assert.ok(events.includes('storage'));
  assert.ok(events.includes('init'));
});

test('a pending or restored round cannot be abandoned through Resume controls', () => {
  const tryResume = functionBlock('tgTryResume', 'tgResumeContinue');
  const resume = functionBlock('tgResumeContinue', 'tgResumeRestartSame');
  const restartSame = functionBlock('tgResumeRestartSame', 'tgResumeNewRound');
  const newRound = functionBlock('tgResumeNewRound', 'tgResumeRestart');
  const gameResume = { clear() { events.push('clear'); } };
  assert.match(tryResume, /window\.__tgResumeData=saved;\s*tgRoundActive=true/);
  assert.match(resume, /tgRoundActive=true/);
  assert.match(restartSame, /if\(tgRoundActive\)[\s\S]*return false/);

  const events = [];
  const context = {
    tgRoundActive: true,
    window: {
      __tgResumeData: { level: '初' },
      GameResume: gameResume,
    },
    GameResume: gameResume,
    document: { getElementById() { return { style: {} }; } },
    rgToast(message) { events.push(`toast:${message}`); },
    gtag() { events.push('analytics'); },
    initGame() { events.push('init'); },
  };
  vm.createContext(context);
  vm.runInContext(newRound, context);
  assert.strictEqual(context.tgResumeNewRound(), false);
  assert.deepStrictEqual(events, ['toast:請繼續完成上次尚未結束的一輪']);
  assert.deepStrictEqual(context.window.__tgResumeData, { level: '初' });

  assert.strictEqual(context.tgResumeNewRound(true), true);
  assert.ok(events.includes('clear'));
  assert.ok(events.includes('init'));
  assert.strictEqual(context.window.__tgResumeData, null);
});

test('all-mastered prompt keeps the unfinished round visible and locked', () => {
  const allMastered = functionBlock('tgShowAllMastered', 'skipWord');
  assert.match(allMastered, /請先完成目前這一輪，再更換等級/);
  assert.doesNotMatch(allMastered, /getElementById\('game'\)[\s\S]*style\.display='none'/);
  assert.doesNotMatch(allMastered, /tgRoundActive=false|initGame\(\)/);
});

test('Phone landscape uses the game keyboard while iPad stays native unless Hint is on', () => {
  const start = source.indexOf('function tgLandscapeUsesGameKeyboardOnly(');
  const end = source.indexOf('// ── โหมดไกด์ไลน์', start);
  const policy = source.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.match(source, /TG_LANDSCAPE_KBD_QUERY='\(orientation: landscape\) and \(max-width: 1024px\) and \(max-height: 600px\)'/);
  assert.match(source, /function tgIsTabletTouchDevice\(\)/);
  assert.match(source, /shortSide>=600/);
  assert.match(policy, /!tgIsTabletTouchDevice\(\)/);
  assert.match(policy, /function tgTouchUsesGameKeyboardOnly\(\)/);
  assert.match(policy, /!!guideMode\|\|tgLandscapeUsesGameKeyboardOnly\(\)/);
  assert.match(policy, /navigator\.maxTouchPoints/);
  assert.match(policy, /rgIsTouchDevice\(\)/);
  assert.match(policy, /document\.activeElement===mi\)mi\.blur\(\)/);
  assert.match(policy, /mi\.readOnly=true/);
  assert.match(policy, /setAttribute\('inputmode','none'\)/);
  assert.match(policy, /mi\.readOnly=false/);
  assert.match(policy, /setAttribute\('inputmode','text'\)/);
  assert.match(source, /if\(tgTouchUsesGameKeyboardOnly\(\)\)\{ mi\.blur\(\); return; \}/);
  assert.match(source, /RG_MOBILE_KBD_USED && rgIsTouchDevice\(\) && !tgTouchUsesGameKeyboardOnly\(\)/);
  assert.match(html, /body\.tg-landscape-game-keyboard-only \.tkbd\{display:flex !important/);
  assert.match(html, /body\.tg-touch-game-keyboard-only \.mobile-kbd-input\{pointer-events:none !important;\}/);
  assert.doesNotMatch(html, /orientation:landscape[\s\S]{0,300}pointer:coarse[\s\S]{0,220}\.mobile-kbd-input\{pointer-events:none !important;\}/);
  assert.match(html, /id="rg-kbd"/);
});

test('keyboard policy distinguishes Phone, iPad default and iPad Hint at runtime', () => {
  const blocks = [
    functionBlock('tgIsTabletTouchDevice', 'tgLandscapeUsesGameKeyboardOnly'),
    functionBlock('tgLandscapeUsesGameKeyboardOnly', 'tgTouchUsesGameKeyboardOnly'),
    functionBlock('tgTouchUsesGameKeyboardOnly', 'tgSyncLandscapeKeyboardPolicy'),
  ].join('\n');
  const policyContext = {
    Math,
    navigator: { maxTouchPoints: 5 },
    screen: { width: 768, height: 1024 },
    window: { innerWidth: 1024, innerHeight: 768, matchMedia: () => ({ matches: true }) },
    rgIsTouchDevice: () => true,
    TG_LANDSCAPE_KBD_QUERY: '(landscape)',
    guideMode: false,
  };
  vm.createContext(policyContext);
  vm.runInContext(blocks, policyContext);
  assert.strictEqual(policyContext.tgIsTabletTouchDevice(), true);
  assert.strictEqual(policyContext.tgLandscapeUsesGameKeyboardOnly(), false);
  assert.strictEqual(policyContext.tgTouchUsesGameKeyboardOnly(), false);
  policyContext.guideMode = true;
  assert.strictEqual(policyContext.tgTouchUsesGameKeyboardOnly(), true);
  policyContext.guideMode = false;
  policyContext.screen = { width: 390, height: 844 };
  assert.strictEqual(policyContext.tgLandscapeUsesGameKeyboardOnly(), true);
});

test('typing keyboard no longer includes the retired touch magnifier', () => {
  assert.doesNotMatch(source, /TG_TOUCH_MAGNIFIER|tgTouchMagnifier|tgBindTouchMagnifier/);
  assert.doesNotMatch(html, /tg-touch-magnifier|tg-touch-selected/);
  assert.match(source, /k\.onclick=function\(\)\{ rgVirtualPress\(code\); \}/);
});

test('keyboard keeps the exact 47-row baseline inventory and direct-label renderer', () => {
  const mapStart = source.indexOf('var RG_BASE_MAP=');
  const mapEnd = source.indexOf('var RG_REVERSE=', mapStart);
  const mapContext = {};
  assert.ok(mapStart >= 0 && mapEnd > mapStart);
  vm.createContext(mapContext);
  vm.runInContext(source.slice(mapStart, mapEnd), mapContext);
  const inventory = Object.keys(mapContext.RG_BASE_MAP).map((code) => [
    code,
    mapContext.RG_BASE_MAP[code],
    mapContext.RG_SHIFT_MAP[code],
  ]);
  assert.strictEqual(inventory.length, 47);
  assert.strictEqual(
    crypto.createHash('sha256').update(JSON.stringify(inventory)).digest('hex'),
    '9f1ff4c25a95161691d33791e387ea2c61b16f2453041835bfd21df2ff5fbfe8'
  );
  const build = functionBlock('rgBuildKeyboard', 'rgVirtualPress');
  assert.match(build, /'<span class="tk-shift">'\+sh\+'<\/span><span class="tk-base">'\+un\+'<\/span>'/);
  assert.match(build, /if\(isCombining\(sh\)\)k\.querySelector\('\.tk-shift'\)\.classList\.add\('tk-combining-label'\)/);
  assert.match(build, /if\(isCombining\(un\)\)k\.querySelector\('\.tk-base'\)\.classList\.add\('tk-combining-label'\)/);
  assert.match(html, /#rg-kbd \.tk-combining-label\{display:inline-block;min-width:1em;text-align:center;\}/);
  assert.doesNotMatch(build, /rgKeyboardLabelHTML|dispHTML|comb-base|comb-disp/);
  assert.doesNotMatch(source, /function rgKeyboardLabelHTML\(/);
});

test('Phone landscape gives long Thai prompts and targets the full center width', () => {
  const css = fs.readFileSync(path.join(root, 'css/mobile-landscape.css'), 'utf8');
  assert.match(css, /@media \(min-width: 800px\) and \(max-width: 900px\) and \(max-height: 430px\)/);
  assert.match(css, /data-gsh-ml-slot="question"\] > \*[\s\S]{0,220}width: 100% !important;[\s\S]{0,80}max-width: 100% !important;/);
  assert.match(css, /data-gsh-ml-slot="current-input"\] \.type-target[\s\S]{0,260}overflow-wrap: anywhere;/);
});

test('Only Phone landscape shows two Shift controls while every other layout shows one', () => {
  const build = functionBlock('rgBuildKeyboard', 'rgVirtualPress');
  assert.match(build, /rgMakeShiftKey\('left'\)/);
  assert.match(build, /rgMakeShiftKey\('right'\)/);
  assert.match(html, /#rg-shift-key-right\{display:none !important;\}/);
  assert.match(html, /@media \(orientation:landscape\) and \(max-width:1024px\) and \(max-height:600px\)\{[\s\S]*?body\.tg-landscape-game-keyboard-only #rg-shift-key-right\{display:flex !important;\}/);
  assert.doesNotMatch(html, /nth-child[^{}]*\{[^}]*display\s*:\s*none/i);
});

test('typing menu contains only the current learning tools', () => {
  const menu = html.match(/WordMenu\.init\(\{rowId:'word-ctl-row',items:\[([\s\S]*?)\]\}\)/);
  assert.ok(menu);
  const ids = Array.from(menu[1].matchAll(/\{id:'([^']+)'/g), (match) => match[1]);
  assert.deepStrictEqual(ids, [
    'rg-sound-toggle', 'rg-pron-toggle', 'rg-en-toggle', 'zh-toggle-slot',
    'rg-vault-btn-slot', 'guide-toggle', 'font-toggle-slot', 'rg-particle-toggle',
  ]);
});

test('a shown Hint remains zero-score evidence when the word is skipped', () => {
  const skip = functionBlock('skipWord', 'next');
  const highlight = functionBlock('rgTypeHighlightNextKey', 'rgTypeFlashWrong');
  assert.match(skip, /guide:!!wordUsedGuide/);
  assert.match(highlight, /wordUsedGuide=true/);
  assert.match(highlight, /roundHadGuide=true/);
});

test('free-text inputs without an equivalent in-game keyboard remain native', () => {
  assert.match(listeningHtml, /<input type="text" id="lg-type-input"/);
  assert.doesNotMatch(listeningHtml, /id="lg-type-input"[^>]+(?:readonly|inputmode="none")/);
  assert.match(legoSource, /<input type="text" id="legoCustomTh-/);
  assert.match(legoSource, /<input class="lego-custom-zh" type="text" id="legoCustomZh-/);
  assert.doesNotMatch(legoSource, /legoCustom(?:Th|Zh)[^\n]+(?:readOnly|inputmode=['"]none)/);
});

test('refresh tolerates the Phase 1 HUD without removed reward elements', () => {
  const refresh = functionBlock('refreshUI', 'updateCombo');
  const elements = {
  };
  const context = {
    tgUpdateScoreBar() {},
    Math,
    document: { getElementById: (id) => elements[id] || null },
  };
  vm.createContext(context);
  vm.runInContext(refresh, context);
  vm.runInContext('refreshUI()', context);
  assert.doesNotMatch(refresh, /pf|prog-txt|roundQueue/);
  assert.doesNotMatch(refresh, /star-count|badge-count|badge-emoji/);
});

test('Typing counter follows active syllables including High continuous segments', () => {
  const helper = functionBlock('updateSyllableCounter', 'loadWord');
  const elements = { qn: { textContent: '' }, qt: { textContent: '' }, qu: { textContent: '' } };
  const context = { sylIdx: 5, sylList: [{}, {}, {}, {}, {}, {}], Math, document: { getElementById: (id) => elements[id] || null } };
  vm.createContext(context);
  vm.runInContext(helper, context);
  vm.runInContext('updateSyllableCounter()', context);
  assert.deepStrictEqual([elements.qn.textContent, elements.qt.textContent, elements.qu.textContent], [6, 6, '音節']);
  context.sylIdx = 0; context.sylList = [{}];
  vm.runInContext('updateSyllableCounter()', context);
  assert.deepStrictEqual([elements.qn.textContent, elements.qt.textContent, elements.qu.textContent], [1, 1, '字']);
  assert.doesNotMatch(helper, /roundQueue|roundScore|okC|badC/);
});

test('Typing loads the rebuilt crash-safe bundle with a fresh cache key', () => {
  assert.match(html, /typing-game-app\.min\.js\?v=62/);
});

test('Typing treats the shared-profile legacy stat row as optional', () => {
  assert.doesNotMatch(source, /document\.getElementById\('rg-stat-row'\)\.style/);
  const resume = functionBlock('tgResumeContinue', 'tgResumeRestartSame');
  assert.match(resume, /var _statRow=document\.getElementById\('rg-stat-row'\); if\(_statRow\)_statRow\.style\.display='flex'/);
});

test('Typing resolves SRS ownership before a recovered Review round becomes interactive', () => {
  const prepare = functionBlock('tgPrepareRestoredReview', 'tgSaveResume');
  assert.match(prepare, /Promise\.all\(\[reviewReady,srsReady\]\)\.then\(finish\)/);
  const resume = functionBlock('tgResumeContinue', 'tgResumeRestartSame');
  assert.match(resume, /tgPrepareRestoredReview\(function\(\)\{[\s\S]*loadWord\(\)/);
});

test('Typing keeps a recovered queue when its legacy report snapshot is malformed', () => {
  const restore = functionBlock('tgRestoreRoundReport', 'tgSaveResume');
  const created = { fresh: true };
  const context = {
    curLevel: '初',
    window: { RoundReport: true },
    RoundReport: {
      restore() { throw new Error('legacy snapshot'); },
      create(defaults) { assert.strictEqual(defaults.game_type, 'typing'); return created; },
    },
  };
  vm.createContext(context);
  vm.runInContext(restore, context);
  assert.strictEqual(vm.runInContext('tgRestoreRoundReport({legacy:true})', context), created);
  const resume = functionBlock('tgResumeContinue', 'tgResumeRestartSame');
  assert.match(resume, /roundReport=tgRestoreRoundReport\(saved\.report\)/);
});

test('玩法 explains both locked typing rules', () => {
  assert.match(html, /作答中可以隨時切換/);
  assert.match(html, /本題只要開過提示就不計分/);
  assert.match(html, /本題降到 0 分也要繼續打到正確為止/);
  assert.doesNotMatch(html, /額度用完直接公佈答案/);
});

test('Typing and Listening share the same bonus score module', () => {
  const listening = fs.readFileSync(path.join(root, 'listening-game.html'), 'utf8');
  assert.match(html, /js\/games\/typing-score\.js\?v=1/);
  assert.match(listening, /js\/games\/typing-score\.js\?v=1/);
});

test('Typing report uses the Thai target and never stores raw keystrokes', () => {
  assert.match(source, /correctAnswer:w\.th/);
  assert.match(source, /attempts:\[\{answer:submitted,is_correct:true\}\]/);
  assert.doesNotMatch(source, /correctAnswer\s*\|\|/);
  assert.doesNotMatch(source, /rawKeystrokes|raw_keystrokes|keypresses/);
});

test('non-perfect result copy never claims every question was correct', () => {
  const result = functionBlock('endRound', 'restart');
  assert.match(result, /乾淨答對 '\+cleanC\+'\/\'\+roundTotal\+' 題/);
  assert.doesNotMatch(result, /答對 '\+cleanC\+'\/\'\+roundTotal\+' 題全對/);
});

console.log(`\n${passed} Phase 1 Typing tests passed.`);
