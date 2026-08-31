#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const stage = read('js/core/mobile-landscape.js');
const css = read('css/mobile-landscape.css');
const toneApp = read('js/games/tone-finder-game.js');
const readingApp = read('js/games/reading-game-app.js');
const listeningApp = read('js/games/listening-game-app.js');
const typingApp = read('js/games/typing-game-app.js');
const wordOrderApp = read('js/games/word-order-app.js');
const switcher = read('js/games/game-switcher.js');
const pages = [
  ['tone', 'tone-finder.html'],
  ['reading', 'reading-game.html'],
  ['listening', 'listening-game.html'],
  ['typing', 'typing-game.html'],
  ['word-order', 'word-order.html'],
  ['lego', 'lego.html'],
];

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log('✓ ' + name);
}

test('all six pages bind the shared landscape menu system and Core 4 owns this cache delta', () => {
  for (const [game, file] of pages) {
    const html = read(file);
    assert.match(html, new RegExp(`<body[^>]*data-gsh-game="${game}"`), `${file}: missing game marker`);
    assert.match(html, /js\/games\/thai-keyboard\.js\?v=2/, `${file}: missing shared split keyboard`);
    const paused = game === 'listening' || game === 'lego';
    assert.match(html, paused ? /css\/mobile-landscape\.css\?v=31/ : /css\/mobile-landscape\.css\?v=32/, `${file}: wrong scoped CSS version`);
    assert.match(html, paused ? /js\/core\/mobile-landscape\.js\?v=24/ : /js\/core\/mobile-landscape\.js\?v=25/, `${file}: wrong scoped controller version`);
    assert.match(html, /js\/games\/game-switcher\.js\?v=7/, `${file}: missing fixed six-game navigation`);
  }
  assert.doesNotMatch(read('tone-finder.html'), /tone-mobile-landscape\.(?:css|js)/);
});

test('top band is Login, Chinese menus, title, Game, More and ordered action slots', () => {
  assert.match(stage, /mainAction\.append\(makeSlot\('skip'\), makeSlot\('check'\), makeSlot\('reset'\)\)/);
  assert.match(stage, /top\.append\(makeSlot\('dropdowns'\), makeSlot\('shared-controls'\), mainAction\)/);
  assert.match(stage, /createDropdown\('level', '等級', levels\)/);
  assert.match(stage, /createDropdown\('tools', '工具', tools\)/);
  assert.match(stage, /mountExistingNode\(login, slot\('dropdowns'\)\)/);
  assert.match(stage, /slot\('dropdowns'\)\.prepend\(login\)/);
  assert.match(stage, /mountExistingNode\(title, slot\('shared-controls'\)\)/);
  assert.match(stage, /insertBefore\(controls, slot\('skip'\)\)/);
  assert.match(css, /data-gsh-ml-slot="skip"[\s\S]{0,120}data-gsh-ml-slot="check"[\s\S]{0,120}data-gsh-ml-slot="reset"[\s\S]{0,220}flex: 0 0 var\(--gsh-ml-control-h\)/);
});

test('five standard games lock visible 30 / 40 / 30 outer cards', () => {
  assert.match(css, /grid-template-columns: minmax\(0, 30fr\) minmax\(0, 40fr\) minmax\(0, 30fr\)/);
  assert.match(css, /not\(\[data-gsh-game="lego"\]\) \[data-gsh-ml-slot="left"\][\s\S]{0,260}border: 1\.5px solid/);
  assert.match(css, /not\(\[data-gsh-game="lego"\]\) \[data-gsh-ml-slot="center"\][\s\S]{0,420}overflow-y: auto/);
  assert.match(stage, /play\.append\(makeSlot\('sentence'\), left, center, right/);
});

test('menus open below their owner, expose seven navigation rows and keep icon labels functional', () => {
  assert.match(stage, /function positionPanelBelow\(trigger, panel, fallbackWidth\)[\s\S]{0,1800}rect\.bottom \+ 4/);
  assert.match(stage, /if \(name === 'tools'\)[\s\S]{0,1200}control\.click\(\)/);
  assert.match(css, /data-gsh-dropdown="tools"[\s\S]{0,2600}max-height: calc\(\(7 \* var\(--gsh-ml-control-h\)\)/);
  assert.match(css, /data-gsh-ml-tool-label[\s\S]{0,500}border: 0 !important/);
  assert.match(css, /game-switcher\[data-gsh-ml-utility-panel\][\s\S]{0,800}overflow-y: auto !important/);
});

test('Reading reuses Tone menu presentation without replacing Reading menu content', () => {
  assert.ok(css.includes('body.gsh-ml-active [data-gsh-dropdown="tools"] .gsh-ml-dropdown-panel > [data-gsh-ml-tool-label]'));
  assert.ok(css.includes('body.gsh-ml-active #game-switcher[data-gsh-ml-utility-panel] .gs-tab'));
  assert.ok(css.includes('body.gsh-ml-active .grw-menu[data-gsh-ml-utility-panel] .grw-item'));
  assert.match(stage, /game === 'reading'[\s\S]{0,900}labeledNode\('#rg-howto-btn', '玩法', '📖'\)[\s\S]{0,900}labeledNode\('#rg-en-toggle', '英文讀音', '🔤'\)[\s\S]{0,900}labeledNode\('#rg-particle-toggle', '禮貌詞', '🙏'\)/);
  assert.match(read('reading-game.html'), /css\/mobile-landscape\.css\?v=32/);
});

test('approved menus, hints and six-game navigation are exact', () => {
  assert.match(stage, /game === 'tone'[\s\S]{0,1200}'玩法'[\s\S]{0,220}'讀音'[\s\S]{0,220}'翻譯'[\s\S]{0,220}'單字庫'[\s\S]{0,220}'字體'[\s\S]{0,220}'禮貌詞'/);
  assert.match(stage, /game === 'reading'[\s\S]{0,1500}'玩法'[\s\S]{0,220}'發音'[\s\S]{0,220}'讀音'[\s\S]{0,220}'英文讀音'[\s\S]{0,220}'翻譯'[\s\S]{0,220}'單字庫'[\s\S]{0,220}'字體'[\s\S]{0,220}'禮貌詞'/);
  assert.match(stage, /game === 'word-order'[\s\S]{0,1300}'玩法'[\s\S]{0,220}'讀音'[\s\S]{0,220}'英文讀音'[\s\S]{0,220}'逐字翻譯'[\s\S]{0,220}'單字庫'[\s\S]{0,220}'字體'[\s\S]{0,220}'禮貌詞'/);
  assert.match(stage, /quickAction\('#tf-guide-toggle', '提示'\)[\s\S]{0,220}quickAction\('#rg-guide-toggle', '提示'\)[\s\S]{0,220}quickAction\('#guide-toggle', '提示'\)[\s\S]{0,220}quickAction\('#wo-hint-btn', '提示 \(-2\)'\)/);
  assert.match(switcher, /var tabs = CORE6_TABS\.concat\(\[VAULT_TAB\]\)/);
  assert.match(switcher, /label: '🔖 我的單字庫'/);
});

test('polite particles are playable but score-free in the four approved games', () => {
  assert.match(toneApp, /TF_PARTICLE_ENTRIES[\s\S]{0,900}isParticle:true/);
  assert.match(toneApp, /entries\.push\(TF_PARTICLE_ENTRIES\[_particle\]\)/);
  assert.match(toneApp, /scoredResults = session\.results\.filter[\s\S]{0,120}isParticle/);
  assert.match(readingApp, /var RG_PARTICLE_SYLS=[\s\S]{0,700}isParticle:true/);
  assert.match(readingApp, /sylList=sylList\.concat\(\[RG_PARTICLE_SYLS\[_rgParticle\]\]\)/);
  assert.match(readingApp, /function rgScoreSylCount\(\)[\s\S]{0,360}isParticle/);
  assert.match(typingApp, /var TG_PARTICLE_SYLS=[\s\S]{0,700}isParticle:true/);
  assert.match(wordOrderApp, /function woBuildPlayableSentence\(s\)[\s\S]{0,900}isParticle:true/);
  assert.match(wordOrderApp, /particleOnlyWrong[\s\S]{0,260}不扣分/);
  assert.match(wordOrderApp, /var particleHint =[\s\S]{0,180}if \(!particleHint\)/);
});

test('Tone preserves three left, three right and reveal actions in the right slots', () => {
  assert.match(stage, /children\.length === 6 \? 3/);
  assert.match(stage, /mountExistingNode\(uncertain, container\)/);
  assert.match(stage, /function syncToneRevealActions\([\s\S]{0,900}result-audio[\s\S]{0,260}result-english[\s\S]{0,260}result-next/);
  assert.match(toneApp, /skipCurrentWord:\s*function\(\)[\s\S]{0,1500}is_skipped:\s*true/);
  assert.match(css, /data-gsh-game="tone"[^}]+--gsh-ml-tone-choice:\s*clamp\(56px, 20dvh, 76px\)/);
  assert.match(css, /data-gsh-ml-split="tone"[^}]+align-content:\s*center/);
  assert.match(css, /data-gsh-ml-role="skip"[\s\S]{0,900}background:\s*#242322 !important/);
  assert.match(css, /--gsh-ml-top-control-gap:\s*5px/);
  assert.match(css, /data-gsh-ml-slot="dropdowns"[^}]+gap:\s*var\(--gsh-ml-top-control-gap\)/);
  assert.match(css, /data-gsh-ml-slot="main-action"[^}]+gap:\s*var\(--gsh-ml-top-control-gap\)/);
  assert.match(css, /data-gsh-game="tone"[^}]+data-gsh-ml-slot="main-action"[^}]+\.rg-ctl-wrap[^}]+gap:\s*var\(--gsh-ml-top-control-gap\)/);
  assert.match(css, /body\.gsh-ml-active \[data-gsh-ml-slot="main-action"\] \.rg-ctl-wrap[^}]+position:\s*static !important[^}]+gap:\s*var\(--gsh-ml-top-control-gap\)/);
});

test('five games expose the requested ordered top actions with neutral Skip', () => {
  assert.match(stage, /game === 'reading'\) \{ skip = q\('#btn-skip'\); check = q\('#btn-check'\); \}/);
  assert.match(stage, /game === 'listening'\) skip = q\('#lg-skip-btn'\)/);
  assert.match(stage, /game === 'typing'\) skip = q\('#btn-skip'\)/);
  assert.match(stage, /game === 'word-order'[\s\S]{0,260}#wo-skip-btn[\s\S]{0,260}word-order-check/);
  assert.match(readingApp, /function skipWord\(\)[\s\S]{0,420}skipped:true[\s\S]{0,180}nextWord\(\)/);
  assert.match(typingApp, /function skipWord\(\)[\s\S]{0,420}skipped:true[\s\S]{0,180}nextWord\(\)/);
  assert.match(listeningApp, /function skipCurrentQuestion\(\)[\s\S]{0,900}is_skipped: true[\s\S]{0,500}state\.idx\+\+/);
  assert.match(wordOrderApp, /window\.woSkip = function\(\)[\s\S]{0,500}skipped:true[\s\S]{0,160}window\.woNext\(\)/);
  assert.match(wordOrderApp, /window\.woCheck = function\(\)[\s\S]{0,180}checkAnswer\(\)/);
  assert.match(stage, /mountMany\(\['#btn-next', '#btn-next-syl'\], slot\('right'\)\)/);
  assert.match(stage, /mountMany\(\['#btn-check', '#btn-next'\], slot\('right'\)\)/);
  assert.match(stage, /mountMany\(\['#wo-reset-btn', '#wo-next-btn'\], slot\('right'\)\)/);
  assert.doesNotMatch(stage, /data-gsh-ml-tool-label', '重排這句'/);
  assert.match(stage, /quickAction\('#wo-hint-btn', '提示 \(-2\)'\)/);
  assert.doesNotMatch(stage, /reset = q\('#wo-reset-btn'\)/);
  assert.match(css, /data-gsh-game="word-order"[\s\S]{0,220}#wo-hint-btn/);
});

test('approved position two reuses Tone uncertain geometry and exact labels', () => {
  assert.match(stage, /function syncPositionTwoActions\(game\)/);
  assert.match(stage, /toneAction[\s\S]{0,260}slot\('right'\)/);
  assert.match(stage, /actions = \[readingNextSyl, readingNext\]/);
  assert.match(stage, /actions = \[wordOrderReset, wordOrderNext\]/);
  assert.match(stage, /applyPositionTwoLabel\(node, '下一個<br>音節', '下一個音節'\)/);
  assert.match(stage, /applyPositionTwoLabel\(node, '重新', '重新'\)/);
  assert.doesNotMatch(stage, /applyPositionTwoLabel\(node, '(?:↺ )?重排這句'/);
  assert.match(stage, /syncToneRevealActions\(game\);[\s\S]{0,100}syncPositionTwoActions\(game\);/);
  assert.match(stage, /function setPositionTwoActive\(actions, activeNode\)/);
  assert.match(stage, /revealed = q\('#wo-slots \.wo-slot\.correct'\) !== null/);
  assert.match(css, /gsh-ml-position-two-inactive[\s\S]{0,120}display: none !important/);
  assert.match(css, /data-gsh-ml-position="2"[\s\S]{0,1200}grid-row: 3/);
  assert.match(css, /#wo-reset-btn:disabled[\s\S]{0,180}#wo-next-btn:disabled[\s\S]{0,120}display: none !important/);
});

test('Reading and Word Order reserve the lower-right zone exclusively for position two', () => {
  assert.match(stage, /game === 'word-order'[\s\S]{0,420}children\.length \* 0\.6/);
  assert.match(stage, /availableRows = side === 'right' \? 68 : 100/);
  assert.match(stage, /--gsh-ml-row-start/);
  assert.match(stage, /--gsh-ml-row-span/);
  assert.match(css, /data-gsh-ml-split="word-order"[\s\S]{0,300}repeat\(100, minmax\(0, 1fr\)\)/);
  assert.match(css, /data-gsh-ml-split="reading"[\s\S]{0,300}repeat\(100, minmax\(0, 1fr\)\)/);
  assert.match(css, /grid-row: var\(--gsh-ml-row-start\) \/ span var\(--gsh-ml-row-span\)/);
  assert.match(css, /data-gsh-ml-position="2"[\s\S]{0,1200}grid-row: 3/);
  assert.match(stage, /function syncWordOrderQuestion\(game\)[\s\S]{0,800}data-gsh-ml-question/);
  assert.match(wordOrderApp, /landscapeSlots\.setAttribute\('data-gsh-ml-question', s\.zh \|\| ''\)/);
  assert.match(css, /#gsh-ml-word-order-question[\s\S]{0,420}text-align: center/);
  assert.match(css, /data-gsh-ml-split="word-order"[^}]+grid-template-columns: minmax\(0, 30fr\) minmax\(0, 40fr\) minmax\(0, 30fr\) !important/);
});

test('Typing exposes 47 character keys and two synchronized one-shot Shift controls', () => {
  assert.match(typingApp, /function rgShiftKeys\(\)[\s\S]{0,150}\.rg-shift-key/);
  assert.match(typingApp, /rgMakeShiftKey\('left'\)[\s\S]{0,100}rgMakeShiftKey\('right'\)/);
  assert.match(typingApp, /RG_TYPE\.shiftOn=!RG_TYPE\.shiftOn; rgSyncShiftKeys\(\)/);
  assert.match(typingApp, /if\(RG_TYPE\.shiftOn\)[\s\S]{0,100}RG_TYPE\.shiftOn=false;[\s\S]{0,100}rgSyncShiftKeys\(\)/);
  assert.doesNotMatch(typingApp, /spaceKey=document\.createElement|backKey=document\.createElement/);
  assert.match(typingApp, /KeyB:'ฺ'/);
  assert.match(typingApp, /rgKeyboardLabelHTML\(sh\)[\s\S]{0,100}rgKeyboardLabelHTML\(un\)/);
  assert.match(read('typing-game.html'), /\.tkbd\.shift-on \.tk-key \.tk-shift[^{]*\{font-size:15px/);
  assert.match(read('typing-game.html'), /typing-game-app\.min\.js\?v=45/);
  assert.match(css, /data-gsh-game="typing"[\s\S]{0,180}#rg-kbd[^}]+max-width: none !important/);
  assert.match(css, /#rg-kbd \.gsh-split-kbd-row[^}]+grid-template-columns: minmax\(0, 30fr\) minmax\(0, 40fr\) minmax\(0, 30fr\) !important/);
  assert.match(css, /#rg-kbd\.shift-on \.tk-key \.tk-shift[\s\S]{0,160}font-weight: 700/);
  assert.strictEqual((typingApp.match(/(?:Backquote|Digit\d|Minus|Equal|Key[A-Z]|BracketLeft|BracketRight|Semicolon|Quote|Backslash|Comma|Period|Slash):/g) || []).length / 2, 47);
});

test('Listening uses two choices per side and Typing keyboard geometry for typed mode', () => {
  assert.match(stage, /game === 'listening'[\s\S]{0,160}Math\.min\(2, Math\.ceil\(children\.length \/ 2\)\)/);
  assert.match(stage, /if \(view\.choice\)[\s\S]{0,220}assignSides\(view\.mcWrap, 'listening'\)/);
  assert.match(stage, /if \(view\.typed\)[\s\S]{0,260}slot\('current-input'\)/);
  assert.match(stage, /renderListeningKeyboard/);
  assert.match(stage, /slot\('split-keyboard'\)/);
  assert.match(stage, /function splitTypingKeyboard\(keyboard\)/);
  assert.match(stage, /splitTypingKeyboard\(keyboard\)/);
  assert.match(stage, /function restoreTypingKeyboard\(\)/);
  assert.match(stage, /restoreTypingKeyboard\(\)/);
});

test('Lego has a full-width sentence band and three independent lower frames', () => {
  assert.match(stage, /mountMany\(\['\.out-banner'\], slot\('sentence'\)\)/);
  assert.match(stage, /leftIds = \['time', 'subj', 'modal', 'verb'\]/);
  assert.match(stage, /centerIds = \['obj', 'prog', 'advObj'\]/);
  assert.match(stage, /data-gsh-ml-role', 'lego-menu'/);
  assert.match(css, /data-gsh-game="lego"[\s\S]{0,180}data-gsh-ml-slot="sentence"[\s\S]{0,220}grid-column: 1 \/ 4/);
  assert.match(css, /data-gsh-game="lego"[\s\S]{0,700}data-gsh-ml-slot="left"[\s\S]{0,240}border: 1\.5px solid/);
});

test('Landscape input and popup policies stay bounded and reversible', () => {
  assert.match(stage, /setInputPolicy\(q\('#rg-mobile-input'\), true\)/);
  assert.match(stage, /setInputPolicy\(q\('#lg-type-input'\), typed\)/);
  assert.match(stage, /function restoreInputs\(\)/);
  assert.match(css, /gsh-confirm-card[\s\S]{0,420}width: min\(72vw, 640px\)[\s\S]{0,220}max-height:/);
  assert.match(css, /@media \(orientation: landscape\) and \(max-width: 1024px\) and \(max-height: 600px\)/);
});

console.log(`\n✅ Mobile Landscape 5.2 tests passed (${passed} checks)`);
