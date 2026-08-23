#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = process.cwd();

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function write(rel, value) {
  fs.writeFileSync(path.join(root, rel), value, 'utf8');
}

function replaceOnce(text, from, to, label) {
  const first = text.indexOf(from);
  assert(first >= 0, 'missing patch anchor: ' + label);
  assert(text.indexOf(from, first + from.length) < 0, 'non-unique patch anchor: ' + label);
  return text.slice(0, first) + to + text.slice(first + from.length);
}

function insertBefore(text, marker, block, label) {
  const index = text.indexOf(marker);
  assert(index >= 0, 'missing insertion anchor: ' + label);
  return text.slice(0, index) + block + text.slice(index);
}

// ── Shared controller: state-owned Listening nodes only ──────────────────────
let controller = read('js/core/mobile-landscape.js');

controller = replaceOnce(
  controller,
  "  function isSourceVisible(node) {\n    return !!node && !node.hidden && node.style.display !== 'none' && isVisible(node);\n  }\n\n",
  "  function isSourceVisible(node) {\n    return !!node && !node.hidden && node.style.display !== 'none' && isVisible(node);\n  }\n\n  // Listening owns several mutually exclusive source states. Unlike the\n  // generic visibility helper, this walks source ancestors so controls inside\n  // #lg-game are not mounted while that screen is still display:none.\n  function isDisplayedInTree(node) {\n    if (!node || !node.isConnected || node.hidden) return false;\n    var current = node;\n    while (current && current.nodeType === 1) {\n      var style = window.getComputedStyle(current);\n      if (style.display === 'none' || style.visibility === 'hidden') return false;\n      if (current === document.body || current === stage) break;\n      current = current.parentNode;\n    }\n    return true;\n  }\n\n",
  'Listening tree visibility helper'
);

controller = replaceOnce(
  controller,
  "    } else if (game === 'listening') {\n      levels = nodesFor(['#lg-level-tabs']);\n      tools = nodesFor(['#lg-howto-btn', '#lg-skip-btn']);\n",
  "    } else if (game === 'listening') {\n      levels = nodesFor(['#lg-level-tabs']);\n      tools = [\n        labeledNode('#lg-howto-btn', '玩法'),\n        q('#lg-skip-btn'),\n        labeledNode('#lg-pron-toggle', '讀音'),\n        labeledNode('#lg-en-toggle', '英文讀音'),\n        labeledNode('#zh-toggle-slot', '翻譯'),\n        labeledNode('#rg-vault-btn-slot', '單字庫'),\n        labeledNode('#font-toggle-slot', '字體')\n      ];\n",
  'Listening Tools mapping'
);

controller = replaceOnce(
  controller,
  "    } else if (game === 'listening') {\n      mountMany(['.lg-word-area'], slot('question'));\n      mountMany(['#lg-type-wrap'], slot('current-input'));\n      mountMany(['#lg-type-submit', '#lg-next-btn'], slot('main-action'));\n",
  "    } else if (game === 'listening') {\n      // Listening start / Choice / Typed / Reveal are state-owned and are\n      // mounted by syncListeningGameplay(), never all at once.\n",
  'remove unconditional Listening mounts'
);

controller = replaceOnce(
  controller,
  "    else if (game === 'listening') container = q('#lg-mc-wrap');\n",
  '',
  'remove unconditional Listening split mount'
);

const listeningLifecycle = String.raw`  function resolveListeningGameplay() {
    var startScreen = q('#lg-start');
    var gameScreen = q('#lg-game');
    var wordArea = q('.lg-word-area');
    var mcWrap = q('#lg-mc-wrap');
    var typeWrap = q('#lg-type-wrap');
    var typeSubmit = q('#lg-type-submit');
    var feedback = q('#lg-result-banner');
    var reveal = q('#lg-reveal');
    var next = q('#lg-next-btn');
    var startVisible = isDisplayedInTree(startScreen);
    var gameVisible = isDisplayedInTree(gameScreen);
    var revealVisible = gameVisible && isDisplayedInTree(reveal);
    var typed = gameVisible && !revealVisible && isDisplayedInTree(typeWrap);
    var choice = gameVisible && !revealVisible && !typed && isDisplayedInTree(mcWrap);
    return {
      startScreen: startScreen,
      gameScreen: gameScreen,
      wordArea: wordArea,
      mcWrap: mcWrap,
      typeWrap: typeWrap,
      typeSubmit: typeSubmit,
      feedback: feedback,
      reveal: reveal,
      next: next,
      startVisible: startVisible,
      gameVisible: gameVisible,
      wordAreaVisible: gameVisible && isDisplayedInTree(wordArea),
      choice: choice,
      typed: typed,
      submitVisible: typed && isDisplayedInTree(typeSubmit),
      feedbackVisible: gameVisible && isDisplayedInTree(feedback),
      revealVisible: revealVisible,
      nextVisible: revealVisible && isDisplayedInTree(next)
    };
  }

  function restoreListeningNode(node) {
    if (node && moved.has(node)) restoreExistingNode(node);
  }

  function syncListeningGameplay(view) {
    view = view || resolveListeningGameplay();

    // Restore inactive children before their parent so nested markers stay
    // authoritative when Typed exits to Choice / Reveal / Result.
    if (!view.submitVisible) restoreListeningNode(view.typeSubmit);
    if (!view.typed) restoreListeningNode(view.typeWrap);
    if (!view.choice) restoreListeningNode(view.mcWrap);
    if (!view.nextVisible) restoreListeningNode(view.next);
    if (!view.revealVisible) restoreListeningNode(view.reveal);
    if (!view.feedbackVisible) restoreListeningNode(view.feedback);
    if (!view.wordAreaVisible) restoreListeningNode(view.wordArea);
    if (!view.startVisible) restoreListeningNode(view.startScreen);

    if (view.startVisible) mountExistingNode(view.startScreen, slot('question'));
    if (view.wordAreaVisible) mountExistingNode(view.wordArea, slot('question'));
    if (view.choice) {
      mountExistingNode(view.mcWrap, slot('split-content'));
      assignSides(view.mcWrap, 'listening');
    }
    if (view.typed) {
      mountExistingNode(view.typeWrap, slot('current-input'));
      if (view.submitVisible) mountExistingNode(view.typeSubmit, slot('main-action'));
    }
    if (view.feedbackVisible) mountExistingNode(view.feedback, slot('question'));
    if (view.revealVisible) mountExistingNode(view.reveal, slot('question'));
    if (view.nextVisible) mountExistingNode(view.next, slot('main-action'));
    return view;
  }

`;

controller = insertBefore(
  controller,
  '  function setInputPolicy(input, suppress) {',
  listeningLifecycle,
  'Listening lifecycle functions'
);

controller = replaceOnce(
  controller,
  "  function syncKeyboard(game) {\n",
  "  function syncKeyboard(game, listeningView) {\n",
  'syncKeyboard signature'
);

controller = replaceOnce(
  controller,
  "    } else if (game === 'listening') {\n      var typed = isVisible(q('#lg-type-wrap'));\n      setInputPolicy(q('#lg-type-input'), typed);\n",
  "    } else if (game === 'listening') {\n      var typed = listeningView ? listeningView.typed : isDisplayedInTree(q('#lg-type-wrap'));\n      setInputPolicy(q('#lg-type-input'), typed);\n",
  'Listening keyboard lifecycle ownership'
);

controller = replaceOnce(
  controller,
  "      mountStaticGameNodes(game);\n      syncSplitContent(game);\n      if (game === 'lego') syncLegoMenu();\n      syncDynamicMainAction();\n      syncKeyboard(game);\n      syncExclusiveView(game, exclusiveView);\n",
  "      mountStaticGameNodes(game);\n      var listeningView = game === 'listening' ? syncListeningGameplay() : null;\n      syncSplitContent(game);\n      if (game === 'lego') syncLegoMenu();\n      syncDynamicMainAction();\n      syncKeyboard(game, listeningView);\n      syncExclusiveView(game, exclusiveView);\n",
  'state-driven Listening sync order'
);

controller = replaceOnce(
  controller,
  "      syncKeyboard: syncKeyboard,\n      restoreDynamicMainActions: restoreDynamicMainActions,\n",
  "      syncKeyboard: syncKeyboard,\n      resolveListeningGameplay: resolveListeningGameplay,\n      syncListeningGameplay: syncListeningGameplay,\n      restoreDynamicMainActions: restoreDynamicMainActions,\n",
  'Listening test hooks'
);

write('js/core/mobile-landscape.js', controller);

// ── Shared responsive CSS ────────────────────────────────────────────────────
let css = read('css/mobile-landscape.css');

css = replaceOnce(
  css,
  "  body.gsh-ml-active {\n    --gsh-ml-safe-l: max(12px, env(safe-area-inset-left));\n",
  "  body.gsh-ml-active {\n    --gsh-ml-safe-l: max(12px, env(safe-area-inset-left));\n",
  'CSS base anchor validation'
);

css = insertBefore(
  css,
  '  #gsh-ml-stage {',
  "  body.gsh-ml-active #gc-cap-banner {\n    display: none !important;\n  }\n\n",
  'Landscape-only cap banner hide'
);

const listeningCss = String.raw`  body[data-gsh-game="listening"].gsh-ml-active [data-gsh-ml-slot="center"],
  body[data-gsh-game="listening"].gsh-ml-active [data-gsh-ml-slot="question"],
  body[data-gsh-game="listening"].gsh-ml-active [data-gsh-ml-slot="current-input"] {
    justify-content: flex-start;
  }
  body[data-gsh-game="listening"].gsh-ml-active [data-gsh-ml-slot="left"],
  body[data-gsh-game="listening"].gsh-ml-active [data-gsh-ml-slot="right"],
  body[data-gsh-game="listening"].gsh-ml-active [data-gsh-ml-split="listening"] {
    overflow-y: hidden;
    overscroll-behavior-y: none;
  }
  body[data-gsh-game="listening"].gsh-ml-active [data-gsh-ml-split="listening"] {
    --gsh-ml-listening-choice-h: clamp(56px, 18dvh, 88px);
    grid-template-rows: repeat(2, var(--gsh-ml-listening-choice-h));
    grid-auto-rows: var(--gsh-ml-listening-choice-h);
    align-content: center;
    overflow-x: hidden;
    padding-block: var(--gsh-ml-pad) !important;
  }
  body[data-gsh-game="listening"].gsh-ml-active [data-gsh-ml-split="listening"] > [data-gsh-side-index="0"] { grid-row: 1; }
  body[data-gsh-game="listening"].gsh-ml-active [data-gsh-ml-split="listening"] > [data-gsh-side-index="1"] { grid-row: 2; }
  body[data-gsh-game="listening"].gsh-ml-active [data-gsh-ml-split="listening"] > .lg-opt {
    width: calc(100% - (2 * var(--gsh-ml-pad))) !important;
    height: var(--gsh-ml-listening-choice-h) !important;
    min-height: var(--gsh-ml-listening-choice-h) !important;
    max-height: var(--gsh-ml-listening-choice-h) !important;
    justify-self: center;
    align-self: center;
    padding: clamp(8px, 2dvh, 12px) clamp(10px, 1.8vw, 16px) !important;
    font-size: clamp(20px, 6dvh, 30px) !important;
    animation: none;
    will-change: auto;
  }
  body[data-gsh-game="listening"].gsh-ml-active [data-gsh-ml-slot="question"] .lg-word-area {
    flex: 0 0 auto;
    margin: 0 !important;
    gap: clamp(2px, .7dvh, 5px);
    padding: 0 var(--gsh-ml-pad) !important;
    overflow: hidden;
  }
  body[data-gsh-game="listening"].gsh-ml-active .lg-word-area .word-audio-btn {
    width: clamp(44px, 12dvh, 52px);
    height: clamp(44px, 12dvh, 52px);
    min-width: clamp(44px, 12dvh, 52px);
    min-height: clamp(44px, 12dvh, 52px);
    font-size: clamp(18px, 5dvh, 23px);
  }
  body[data-gsh-game="listening"].gsh-ml-active .lg-listen-hint {
    font-size: var(--gsh-ml-font-sm);
    line-height: 1.2;
  }
  body[data-gsh-game="listening"].gsh-ml-active #lg-word-ctl-row {
    display: none !important;
  }
  body[data-gsh-game="listening"].gsh-ml-active [data-gsh-ml-slot="current-input"] #lg-type-wrap {
    width: 100% !important;
    max-width: 100% !important;
    margin: 0 !important;
    gap: var(--gsh-ml-gap);
  }
  body[data-gsh-game="listening"].gsh-ml-active #lg-type-input {
    width: 100% !important;
    max-width: 100% !important;
    min-height: var(--gsh-ml-control-h);
    padding: 5px 8px !important;
    font-size: clamp(19px, 5.4dvh, 27px);
  }
  body[data-gsh-game="listening"].gsh-ml-active [data-gsh-ml-slot="question"] #lg-result-banner,
  body[data-gsh-game="listening"].gsh-ml-active [data-gsh-ml-slot="question"] #lg-reveal {
    flex: 0 1 auto;
    width: 100% !important;
    max-width: 100% !important;
    margin: 0 !important;
    padding: clamp(5px, 1.4dvh, 8px) clamp(7px, 1.2vw, 11px) !important;
    overflow: hidden;
  }
  body[data-gsh-game="listening"].gsh-ml-active #lg-reveal .lg-rev-th {
    font-size: clamp(23px, 6.5dvh, 31px);
    line-height: 1.05;
  }
  body[data-gsh-game="listening"].gsh-ml-active #lg-reveal .lg-rev-pron,
  body[data-gsh-game="listening"].gsh-ml-active #lg-reveal .lg-rev-en,
  body[data-gsh-game="listening"].gsh-ml-active #lg-reveal .lg-rev-zh {
    margin-top: 1px;
    font-size: clamp(10px, 2.8dvh, 13px);
    line-height: 1.15;
  }
  body[data-gsh-game="listening"].gsh-ml-active [data-gsh-ml-slot="main-action"] > #lg-type-submit,
  body[data-gsh-game="listening"].gsh-ml-active [data-gsh-ml-slot="main-action"] > #lg-next-btn {
    min-height: var(--gsh-ml-control-h) !important;
    max-height: var(--gsh-ml-control-h) !important;
    align-items: center;
    justify-content: center;
    line-height: 1.05;
  }
  body[data-gsh-game="listening"].gsh-ml-active [data-gsh-ml-slot="question"] > #lg-start {
    width: 100% !important;
    max-width: 100% !important;
    max-height: 100% !important;
    padding: clamp(6px, 1.8dvh, 10px) !important;
    gap: clamp(3px, 1dvh, 6px) !important;
    overflow: hidden;
  }
  body[data-gsh-game="listening"].gsh-ml-active #lg-start .lg-start-emoji {
    font-size: clamp(27px, 8dvh, 38px);
    line-height: 1;
  }
  body[data-gsh-game="listening"].gsh-ml-active #lg-start .lg-start-title {
    font-size: clamp(14px, 4dvh, 18px);
    line-height: 1.15;
  }
  body[data-gsh-game="listening"].gsh-ml-active #lg-start .lg-start-desc {
    max-width: 100%;
    font-size: clamp(10px, 2.7dvh, 12px);
    line-height: 1.3;
  }
  body[data-gsh-game="listening"].gsh-ml-active #lg-start .lg-start-desc br { display: none; }
  body[data-gsh-game="listening"].gsh-ml-active #lg-start-btn {
    min-height: var(--gsh-ml-control-h);
    padding: 5px 12px !important;
  }
  body[data-gsh-game="listening"].gsh-ml-active #gsh-ml-stage .gsh-split-thai-keyboard {
    pointer-events: none;
  }
  body[data-gsh-game="listening"].gsh-ml-active #gsh-ml-stage .gsh-split-thai-keyboard .gsh-kbd-key {
    pointer-events: auto;
  }

`;

css = insertBefore(
  css,
  '  body[data-gsh-game="reading"].gsh-ml-active [data-gsh-ml-slot="center"],',
  listeningCss,
  'Listening responsive CSS'
);

write('css/mobile-landscape.css', css);

// ── Geometry contracts ───────────────────────────────────────────────────────
let geometry = read('scripts/tests-mobile-landscape-geometry.js');

const listeningGeometry = String.raw`function listeningChoiceLayout(width, height, totalChoices, safe) {
  const stage = layout(width, height, safe);
  const gap = clamp(4, height * 0.013, 10);
  const pad = clamp(6, height * 0.017, 12);
  const leftCount = Math.min(2, Math.ceil(totalChoices / 2));
  const rightCount = totalChoices - leftCount;
  const rows = Math.max(leftCount, rightCount);
  const choiceHeight = clamp(56, (stage.play.left.height - pad * 2 - gap * (rows - 1)) / rows, 88);
  const makeSide = (region, count) => {
    const groupHeight = count * choiceHeight + Math.max(0, count - 1) * gap;
    const y = region.y + (region.height - groupHeight) / 2;
    return Array.from({ length: count }, (_, index) => ({
      x: region.x + pad,
      y: y + index * (choiceHeight + gap),
      width: region.width - pad * 2,
      height: choiceHeight
    }));
  };
  return {
    stage,
    choiceHeight,
    left: makeSide(stage.play.left, leftCount),
    right: makeSide(stage.play.right, rightCount)
  };
}

`;

geometry = insertBefore(
  geometry,
  'function wordOrderLayout(width, height, safe) {',
  listeningGeometry,
  'Listening geometry helper'
);

geometry = replaceOnce(
  geometry,
  "  { name: 'physical-iphone', width: 932, height: 430 },\n",
  "  { name: 'physical-iphone-safari', width: 932, height: 366 },\n  { name: 'physical-iphone-screen', width: 932, height: 430 },\n",
  'physical iPhone geometry targets'
);

const listeningAssertions = String.raw`  const listening = listeningChoiceLayout(target.width, target.height, 4, { left: 12, right: 12, top: 8, bottom: 8 });
  listening.left.forEach((choice) => {
    assert(contained(choice, listening.stage.play.left), target.name + ': Listening left choice escaped its side column');
    assert(!intersects(choice, listening.stage.play.center), target.name + ': Listening left choice entered the center column');
  });
  listening.right.forEach((choice) => {
    assert(contained(choice, listening.stage.play.right), target.name + ': Listening right choice escaped its side column');
    assert(!intersects(choice, listening.stage.play.center), target.name + ': Listening right choice entered the center column');
  });
  assert(listening.choiceHeight >= 56, target.name + ': Listening choice touch height fell below 56 CSS px');
`;

geometry = insertBefore(
  geometry,
  '  const typing = typingKeyboardLayout(target.width, target.height, { left: 12, right: 12, top: 8, bottom: 8 });',
  listeningAssertions,
  'Listening geometry assertions'
);

const cssAssertions = String.raw`assert.match(css, /data-gsh-game="listening"[\s\S]*?data-gsh-ml-split="listening"[\s\S]*?overflow-y:\s*hidden/, 'Listening Choice must forbid vertical scrolling');
assert.match(css, /data-gsh-ml-split="listening"[\s\S]*?grid-template-rows:\s*repeat\(2,\s*var\(--gsh-ml-listening-choice-h\)\)/, 'Listening Choice must keep two large rows per side');
assert.match(css, /data-gsh-game="listening"[\s\S]*?gsh-split-thai-keyboard[\s\S]*?pointer-events:\s*none/, 'Listening keyboard layer must not intercept the center or inactive states');
assert.match(css, /gsh-split-thai-keyboard \.gsh-kbd-key[\s\S]*?pointer-events:\s*auto/, 'Listening keyboard keys must remain interactive');
assert.match(css, /body\.gsh-ml-active #gc-cap-banner\s*\{[^}]*display:\s*none\s*!important;/, 'Mobile Landscape must hide #gc-cap-banner without changing entitlement logic');
`;

geometry = insertBefore(
  geometry,
  "console.log(`Mobile Landscape geometry contracts: ${targets.length}/${targets.length} passed`);",
  cssAssertions,
  'Listening and shared cleanup CSS assertions'
);

write('scripts/tests-mobile-landscape-geometry.js', geometry);

// ── Runtime state/lifecycle contracts ────────────────────────────────────────
let runtime = read('scripts/tests-mobile-landscape-runtime.js');

const listeningRuntime = String.raw`// Listening mounts only the current source state: Start -> Choice -> Typed -> Reveal.
resetPage('listening');
const listeningControls = document.createElement('div');
listeningControls.className = 'rg-ctl-wrap';
const listeningMenu = makeButton('listening-game-menu', 'rg-ctl-fab');
const listeningFullscreen = makeButton('listening-fullscreen', 'rg-ctl-fab');
listeningFullscreen.setAttribute('aria-pressed', 'false');
listeningControls.append(listeningMenu, listeningFullscreen);

const listeningProfileSource = document.createElement('div');
const listeningLogin = document.createElement('div');
listeningLogin.id = 'rg-login-slot';
listeningProfileSource.appendChild(listeningLogin);

const listeningModeSource = document.createElement('div');
const listeningModes = document.createElement('div');
listeningModes.className = 'mode-tabs';
const listeningModeChoice = makeButton('listening-mode-choice');
const listeningModeTyped = makeButton('listening-mode-typed');
listeningModes.append(listeningModeChoice, listeningModeTyped);
listeningModeSource.appendChild(listeningModes);

const listeningLevelSource = document.createElement('div');
const listeningLevels = document.createElement('div');
listeningLevels.id = 'lg-level-tabs';
listeningLevels.append(makeButton('listening-level-basic'), makeButton('listening-level-intermediate'));
listeningLevelSource.appendChild(listeningLevels);

const listeningHowtoSource = document.createElement('div');
const listeningHowto = makeButton('lg-howto-btn');
listeningHowtoSource.appendChild(listeningHowto);

const listeningStartSource = document.createElement('div');
const listeningStart = document.createElement('section');
listeningStart.id = 'lg-start';
listeningStart.style.display = 'flex';
const listeningStartButton = makeButton('lg-start-btn');
listeningStart.appendChild(listeningStartButton);
listeningStartSource.appendChild(listeningStart);

const listeningGame = document.createElement('section');
listeningGame.id = 'lg-game';
listeningGame.style.display = 'none';
const listeningWordArea = document.createElement('div');
listeningWordArea.className = 'lg-word-area';
const listeningSound = makeButton('lg-sound-btn');
listeningWordArea.appendChild(listeningSound);

const listeningToolRow = document.createElement('div');
listeningToolRow.id = 'lg-word-ctl-row';
const listeningPron = makeButton('lg-pron-toggle');
const listeningEn = makeButton('lg-en-toggle');
const listeningZh = document.createElement('span');
listeningZh.id = 'zh-toggle-slot';
listeningZh.appendChild(makeButton('listening-zh-button'));
const listeningVault = document.createElement('span');
listeningVault.id = 'rg-vault-btn-slot';
listeningVault.appendChild(makeButton('listening-vault-button'));
const listeningFont = document.createElement('span');
listeningFont.id = 'font-toggle-slot';
listeningFont.appendChild(makeButton('listening-font-button'));
listeningToolRow.append(listeningPron, listeningEn, listeningZh, listeningVault, listeningFont);

const listeningChoiceWrap = document.createElement('div');
listeningChoiceWrap.id = 'lg-mc-wrap';
listeningChoiceWrap.style.display = 'flex';
const listeningChoices = Array.from({ length: 4 }, (_, index) => {
  const choice = makeButton('listening-choice-' + index, 'lg-opt');
  listeningChoiceWrap.appendChild(choice);
  return choice;
});

const listeningTypeWrap = document.createElement('div');
listeningTypeWrap.id = 'lg-type-wrap';
listeningTypeWrap.style.display = 'none';
const listeningInput = document.createElement('input');
listeningInput.id = 'lg-type-input';
listeningInput.setAttribute('inputmode', 'text');
const listeningSubmit = makeButton('lg-type-submit');
listeningTypeWrap.append(listeningInput, listeningSubmit);

const listeningFeedback = document.createElement('div');
listeningFeedback.id = 'lg-result-banner';
listeningFeedback.style.display = 'none';
const listeningReveal = document.createElement('div');
listeningReveal.id = 'lg-reveal';
listeningReveal.style.display = 'none';
const listeningActionRow = document.createElement('div');
const listeningSkip = makeButton('lg-skip-btn');
listeningSkip.style.display = 'none';
const listeningNext = makeButton('lg-next-btn');
listeningNext.style.display = 'none';
listeningActionRow.append(listeningSkip, listeningNext);
listeningGame.append(
  listeningWordArea,
  listeningToolRow,
  listeningChoiceWrap,
  listeningTypeWrap,
  listeningFeedback,
  listeningReveal,
  listeningActionRow
);

let listeningStartClicks = 0;
let listeningChoiceClicks = 0;
let listeningSubmitClicks = 0;
let listeningNextClicks = 0;
let listeningToolClicks = 0;
listeningStartButton.addEventListener('click', () => { listeningStartClicks += 1; });
listeningChoices.forEach((choice) => choice.addEventListener('click', () => { listeningChoiceClicks += 1; }));
listeningSubmit.addEventListener('click', () => { listeningSubmitClicks += 1; });
listeningNext.addEventListener('click', () => { listeningNextClicks += 1; });
[listeningHowto, listeningPron, listeningEn, listeningZh.children[0], listeningVault.children[0], listeningFont.children[0], listeningSkip]
  .forEach((tool) => tool.addEventListener('click', () => { listeningToolClicks += 1; }));

document.body.append(
  listeningControls,
  listeningProfileSource,
  listeningModeSource,
  listeningLevelSource,
  listeningHowtoSource,
  listeningStartSource,
  listeningGame
);

window.GSHMobileLandscape.activate();
const listeningStage = hooks.state().stage;
const listeningQuestionSlot = listeningStage.querySelector('[data-gsh-ml-slot="question"]');
const listeningInputSlot = listeningStage.querySelector('[data-gsh-ml-slot="current-input"]');
const listeningSplitSlot = listeningStage.querySelector('[data-gsh-ml-slot="split-content"]');
const listeningKeyboardSlot = listeningStage.querySelector('[data-gsh-ml-slot="split-keyboard"]');
const listeningMainSlot = listeningStage.querySelector('[data-gsh-ml-slot="main-action"]');
const listeningToolsDropdown = listeningStage.querySelector('[data-gsh-dropdown="tools"]');
const listeningToolsPanel = listeningToolsDropdown.querySelector('.gsh-ml-dropdown-panel');

assert.strictEqual(listeningStart.parentNode, listeningQuestionSlot, 'Listening Start must be the only mounted center state before play');
assert.strictEqual(listeningWordArea.parentNode, listeningGame, 'hidden gameplay must remain at its source before Start');
assert.strictEqual(listeningSubmit.parentNode, listeningTypeWrap, 'hidden Typed submit must not mount before Typed state');
assert.strictEqual(listeningMainSlot.children.length, 0, 'Listening Start must not expose a stale Main Action');
assert.deepStrictEqual(
  listeningToolsPanel.children,
  [listeningHowto, listeningSkip, listeningPron, listeningEn, listeningZh, listeningVault, listeningFont],
  'Listening Tools must own every live helper/display node in locked order'
);
assert.deepStrictEqual(
  [listeningHowto, listeningSkip, listeningPron, listeningEn, listeningZh, listeningVault, listeningFont]
    .map((node) => node.getAttribute('data-gsh-ml-tool-label')),
  ['玩法', null, '讀音', '英文讀音', '翻譯', '單字庫', '字體'],
  'Listening Tools labels must remain complete while hidden Skip keeps its own copy'
);
listeningStartButton.click();
assert.strictEqual(listeningStartClicks, 1, 'Listening Start must retain its handler after live movement');
stableForFrames('Listening Start');

listeningStart.style.display = 'none';
listeningGame.style.display = 'flex';
window.GSHMobileLandscape.sync();
assert.strictEqual(listeningStart.parentNode, listeningStartSource, 'Starting play must restore the Start root to its exact marker');
assert.strictEqual(listeningWordArea.parentNode, listeningQuestionSlot, 'Choice must mount the live audio question');
assert.strictEqual(listeningChoiceWrap.parentNode, listeningSplitSlot, 'Choice must own the split side region');
assert.strictEqual(listeningTypeWrap.parentNode, listeningGame, 'Choice must not mount hidden Typed input');
assert.strictEqual(listeningSubmit.parentNode, listeningTypeWrap, 'Choice must not expose Typed Submit');
assert.strictEqual(listeningKeyboardSlot.children.length, 0, 'Choice must not create the Typed keyboard');
listeningChoices.forEach((choice) => choice.click());
assert.strictEqual(listeningChoiceClicks, 4, 'all visible Choice controls must retain their handlers');
stableForFrames('Listening Choice');

listeningChoiceWrap.style.display = 'none';
listeningTypeWrap.style.display = 'flex';
window.GSHMobileLandscape.sync();
assert.strictEqual(listeningChoiceWrap.parentNode, listeningGame, 'Typed must restore Choice to source');
assert.strictEqual(listeningTypeWrap.parentNode, listeningInputSlot, 'Typed must mount the live input wrapper');
assert.strictEqual(listeningSubmit.parentNode, listeningMainSlot, 'Typed Submit must be the sole state-owned Main Action');
assert.strictEqual(listeningInput.readOnly, true, 'Typed must suppress the native keyboard');
assert.strictEqual(listeningInput.getAttribute('inputmode'), 'none', 'Typed must use the shared in-game Thai keyboard');
assert(hooks.state().listeningKeyboard, 'Typed must create the shared Thai keyboard');
listeningSubmit.click();
assert.strictEqual(listeningSubmitClicks, 1, 'Typed Submit must retain its handler');
stableForFrames('Listening Typed');

listeningFeedback.style.display = 'block';
window.GSHMobileLandscape.sync();
assert.strictEqual(listeningFeedback.parentNode, listeningQuestionSlot, 'Typed retry feedback must remain visible without leaving Typed');
assert.strictEqual(listeningTypeWrap.parentNode, listeningInputSlot, 'Typed retry feedback must not remove input ownership');

listeningReveal.style.display = 'block';
listeningNext.style.display = 'inline-flex';
window.GSHMobileLandscape.sync();
assert.strictEqual(listeningTypeWrap.parentNode, listeningGame, 'Reveal must restore the Typed wrapper');
assert.strictEqual(listeningSubmit.parentNode, listeningTypeWrap, 'Reveal must remove stale Typed Submit from Main Action');
assert.strictEqual(listeningReveal.parentNode, listeningQuestionSlot, 'Reveal must mount the live answer explanation');
assert.strictEqual(listeningNext.parentNode, listeningMainSlot, 'Reveal Next must own Main Action');
assert.strictEqual(listeningInput.readOnly, false, 'Reveal must restore the native-input policy');
assert.strictEqual(listeningInput.getAttribute('inputmode'), 'text', 'Reveal must restore the original inputmode');
assert.strictEqual(hooks.state().listeningKeyboard, null, 'Reveal must remove the Typed keyboard layer');
listeningNext.click();
assert.strictEqual(listeningNextClicks, 1, 'Reveal Next must retain its handler');
stableForFrames('Listening Reveal');

listeningReveal.style.display = 'none';
listeningNext.style.display = 'none';
listeningTypeWrap.style.display = 'none';
listeningFeedback.style.display = 'block';
window.GSHMobileLandscape.sync();
assert.strictEqual(listeningFeedback.parentNode, listeningQuestionSlot, 'Mode-selection feedback must remain visible');
assert.strictEqual(listeningMainSlot.children.length, 0, 'Mode selection must expose no stale Submit or Next');
assert.strictEqual(listeningSplitSlot.children.length, 0, 'Mode selection must expose no stale Choice controls');
assert.strictEqual(listeningKeyboardSlot.children.length, 0, 'Mode selection must expose no stale keyboard layer');
stableForFrames('Listening Mode Selection');

listeningFeedback.style.display = 'none';
listeningChoiceWrap.style.display = 'flex';
listeningSkip.style.display = 'inline-flex';
window.GSHMobileLandscape.sync();
listeningSkip.click();
assert.strictEqual(listeningToolClicks, 1, 'Listening Skip must preserve its live handler when it becomes visible in Tools');
[listeningHowto, listeningPron, listeningEn, listeningZh.children[0], listeningVault.children[0], listeningFont.children[0]].forEach((tool) => tool.click());
assert.strictEqual(listeningToolClicks, 7, 'every visible Listening Tool must preserve its handler');
assert.deepStrictEqual(duplicateIds(), [], 'Listening state changes must never duplicate live IDs');

window.GSHMobileLandscape.deactivate();
assert.strictEqual(listeningStart.parentNode, listeningStartSource, 'Portrait/Desktop must restore Listening Start');
assert.strictEqual(listeningWordArea.parentNode, listeningGame, 'Portrait/Desktop must restore Listening question');
assert.strictEqual(listeningChoiceWrap.parentNode, listeningGame, 'Portrait/Desktop must restore Listening Choice');
assert.deepStrictEqual(listeningTypeWrap.children, [listeningInput, listeningSubmit], 'Portrait/Desktop must restore Typed input and Submit order');
assert.deepStrictEqual(listeningActionRow.children, [listeningSkip, listeningNext], 'Portrait/Desktop must restore Skip and Next order');
assert.deepStrictEqual(listeningToolRow.children, [listeningPron, listeningEn, listeningZh, listeningVault, listeningFont], 'Portrait/Desktop must restore every Listening display control');
assert.strictEqual(restorationMarkerCount(), 0, 'Listening Portrait/Desktop restoration must not leak markers');
assert.deepStrictEqual(duplicateIds(), [], 'Listening Portrait/Desktop restoration must not duplicate IDs');

`;

runtime = insertBefore(
  runtime,
  '// Tone owns one live #tf-body across gameplay, detail and two Result rounds.',
  listeningRuntime,
  'Listening runtime lifecycle suite'
);

runtime = replaceOnce(
  runtime,
  "console.log('PASS Mobile Landscape runtime lifecycle: keyboard stability, marker cleanup, Tone/Typing/Word Order controls, stable Word Order sides/Login restoration, shared two-round Result, separate Result Detail rotation, action restoration, countdown rotation, exclusive inertness and observer stability');",
  "console.log('PASS Mobile Landscape runtime lifecycle: Listening Start/Choice/Typed/Reveal ownership, keyboard stability, marker cleanup, Tone/Typing/Word Order controls, stable Word Order sides/Login restoration, shared two-round Result, separate Result Detail rotation, action restoration, countdown rotation, exclusive inertness and observer stability');",
  'runtime final receipt'
);

write('scripts/tests-mobile-landscape-runtime.js', runtime);

const changed = [
  'css/mobile-landscape.css',
  'js/core/mobile-landscape.js',
  'scripts/tests-mobile-landscape-geometry.js',
  'scripts/tests-mobile-landscape-runtime.js'
];
console.log('PATCHED_FILES=' + changed.join(','));
