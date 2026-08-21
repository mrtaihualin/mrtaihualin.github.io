#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'js/games/typing-game-app.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'typing-game.html'), 'utf8');
const listeningHtml = fs.readFileSync(path.join(root, 'listening-game.html'), 'utf8');
const legoSource = fs.readFileSync(path.join(root, 'js/games/lego-game-app.js'), 'utf8');
const thaiKeyboardSource = fs.readFileSync(path.join(root, 'js/games/thai-keyboard.js'), 'utf8');
const mobileLandscapeSource = fs.readFileSync(path.join(root, 'js/core/mobile-landscape.js'), 'utf8');
const scoreSource = fs.readFileSync(path.join(root, 'js/games/typing-score.js'), 'utf8');
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

test('guide mode toggles in place and refreshes the current score', () => {
  const block = functionBlock('tgChooseGuideMode', 'rgToggleWebKbd');
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
  assert.match(source, /closest\('#wm-trigger, #rg-howto-btn'\)/);
  assert.match(functionBlock('setLevel', 'initGame'), /tgCloseMobileKeyboard\(\)/);
  assert.match(functionBlock('endRound', 'tgAttachLoginSummary'), /tgCloseMobileKeyboard\(\)/);
});

test('mobile landscape Typing uses only its equivalent in-game keyboard', () => {
  const start = source.indexOf('function tgLandscapeUsesGameKeyboardOnly(');
  const end = source.indexOf('// ── โหมดไกด์ไลน์', start);
  const policy = source.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.match(source, /TG_LANDSCAPE_KBD_QUERY='\(orientation: landscape\) and \(max-width: 1024px\) and \(max-height: 600px\)'/);
  assert.match(policy, /navigator\.maxTouchPoints/);
  assert.match(policy, /rgIsTouchDevice\(\)/);
  assert.match(policy, /document\.activeElement===mi\)mi\.blur\(\)/);
  assert.match(policy, /mi\.readOnly=true/);
  assert.match(policy, /setAttribute\('inputmode','none'\)/);
  assert.match(policy, /mi\.readOnly=false/);
  assert.match(policy, /setAttribute\('inputmode','text'\)/);
  assert.match(source, /if\(tgLandscapeUsesGameKeyboardOnly\(\)\)\{ mi\.blur\(\); return; \}/);
  assert.match(source, /RG_MOBILE_KBD_USED && rgIsTouchDevice\(\) && !tgLandscapeUsesGameKeyboardOnly\(\)/);
  assert.match(source, /RG_BASE_MAP=window\.GSHThaiKeyboard\.baseMap/);
  assert.match(source, /GSHThaiKeyboard\.render\(\{/);
  assert.match(source, /split:tgLandscapeUsesGameKeyboardOnly\(\)/);
  assert.match(source, /gsh:mobile-landscape-change/);
  assert.match(html, /body\.tg-landscape-game-keyboard-only \.tkbd\{display:flex !important/);
  assert.match(html, /orientation:landscape[\s\S]{0,300}pointer:coarse[\s\S]{0,220}\.mobile-kbd-input\{pointer-events:none !important;\}/);
  assert.match(html, /id="rg-kbd"/);
});

test('Listening Typed shares the keyboard while Lego custom input remains native', () => {
  assert.match(listeningHtml, /<input type="text" id="lg-type-input"/);
  assert.doesNotMatch(listeningHtml, /id="lg-type-input"[^>]+(?:readonly|inputmode="none")/);
  assert.match(listeningHtml, /js\/games\/thai-keyboard\.js\?v=1/);
  assert.match(mobileLandscapeSource, /input\.readOnly = true/);
  assert.match(mobileLandscapeSource, /input\.setAttribute\('inputmode', 'none'\)/);
  assert.match(mobileLandscapeSource, /input\.value \+= character/);
  assert.match(thaiKeyboardSource, /var codeRows = \[/);
  assert.match(thaiKeyboardSource, /var baseMap = \{/);
  assert.match(thaiKeyboardSource, /var shiftMap = \{/);
  assert.match(legoSource, /<input type="text" id="legoCustomTh-/);
  assert.match(legoSource, /<input class="lego-custom-zh" type="text" id="legoCustomZh-/);
  assert.doesNotMatch(legoSource, /legoCustom(?:Th|Zh)[^\n]+(?:readOnly|inputmode=['"]none)/);
});

test('refresh tolerates the Phase 1 HUD without removed reward elements', () => {
  const refresh = functionBlock('refreshUI', 'updateCombo');
  const elements = {
    pf: { style: {} },
    'prog-txt': { textContent: '' },
    qt: { textContent: '' },
  };
  const context = {
    tgUpdateScoreBar() {},
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

test('Typing loads the rebuilt crash-safe bundle with a fresh cache key', () => {
  assert.match(html, /typing-game-app\.min\.js\?v=40/);
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
  assert.match(source, /correctAnswer:submitted/);
  assert.match(source, /attempts:submitted\?\[\{answer:submitted,is_correct:true\}\]/);
  assert.doesNotMatch(source, /rawKeystrokes|raw_keystrokes|keypresses/);
});

test('non-perfect result copy never claims every question was correct', () => {
  const result = functionBlock('endRound', 'restart');
  assert.match(result, /乾淨答對 '\+cleanC\+'\/\'\+roundTotal\+' 題/);
  assert.doesNotMatch(result, /答對 '\+cleanC\+'\/\'\+roundTotal\+' 題全對/);
});

console.log(`\n${passed} Phase 1 Typing tests passed.`);
