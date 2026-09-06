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
const sharedJs = read('js/core/shared.js');
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

test('all pages bind the shared landscape system and the four in-scope games share one exact asset version', () => {
  for (const [game, file] of pages) {
    const html = read(file);
    assert.match(html, new RegExp(`<body[^>]*data-gsh-game="${game}"`), `${file}: missing game marker`);
    assert.match(html, /js\/games\/thai-keyboard\.js\?v=2/, `${file}: missing shared split keyboard`);
    const paused = game === 'listening' || game === 'lego';
    const fourGame = game === 'tone' || game === 'reading' || game === 'typing' || game === 'word-order';
    assert.match(html, new RegExp(`css/mobile-landscape\\.css\\?v=${fourGame ? 64 : 35}`), `${file}: wrong shared Landscape CSS version`);
    const controllerVersion = fourGame ? 38 : paused ? 25 : 26;
    assert.match(html, new RegExp(`js/core/mobile-landscape\\.js\\?v=${controllerVersion}`), `${file}: wrong scoped controller version`);
    assert.match(html, /js\/games\/game-switcher\.js\?v=8/, `${file}: missing fixed six-game navigation`);
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

test('four-game signed-in control reuses the Desktop account badge behind one compact trigger', () => {
  assert.match(stage, /\['tone', 'reading', 'typing', 'word-order'\]\.indexOf\(game\) >= 0/);
  assert.match(stage, /trigger\.id = 'gsh-ml-account-trigger'/);
  assert.match(stage, /trigger\.textContent = '已登入'/);
  assert.match(stage, /badge\.setAttribute\('data-gsh-ml-account-panel', 'true'\)/);
  assert.match(stage, /positionPanelBelow\(trigger, badge, 224\)/);
  assert.doesNotMatch(stage, /className = 'sa-(?:nick|edit|logout)'/);
  assert.match(read('js/core/auth-widget.js'), /class="sa-nick"[\s\S]{0,600}class="sa-account-action sa-edit"[\s\S]{0,800}class="sa-account-action sa-logout"/);
  assert.match(css, /#gsh-ml-account-trigger[\s\S]{0,1400}#sa-badge-rg-login-slot/);
  assert.match(css, /\.sa-edit::after[\s\S]{0,100}編輯個人檔案/);
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
  assert.match(read('reading-game.html'), /css\/mobile-landscape\.css\?v=64/);
});

test('all six Resume screens reuse Tone 640px geometry and exact three-action copy', () => {
  assert.match(css, /body\[data-gsh-game\]\.gsh-ml-active #gsh-ml-stage\[data-gsh-ml-view="resume"\] \[data-gsh-ml-slot="exclusive-center"\][\s\S]{0,220}grid-column:\s*1 \/ 4[\s\S]{0,120}width:\s*min\(100%, 680px\)/);
  assert.match(css, /body\[data-gsh-game\]\.gsh-ml-active #gsh-ml-stage\[data-gsh-ml-view="resume"\] \.gsh-resume-banner[\s\S]{0,180}max-width:\s*640px !important/);
  assert.match(css, /body\[data-gsh-game\]\.gsh-ml-active #gsh-ml-stage\[data-gsh-ml-view="resume"\] \.gsh-resume-actions[\s\S]{0,180}grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/);
  for (const [game, file] of pages) {
    const html = read(file);
    const fourGame = game === 'tone' || game === 'reading' || game === 'typing' || game === 'word-order';
    assert.match(html, new RegExp(`css/mobile-landscape\\.css\\?v=${fourGame ? 64 : 35}`), `${file}: must load its current shared Resume CSS`);
    assert.match(html, new RegExp(`js/core/shared\\.min\\.js\\?v=${fourGame ? 50 : 47}`), `${file}: must load exact Resume copy`);
  }
  const shared = read('js/core/shared.js');
  assert.match(shared, /continueAction: '繼續上次練習'/);
  assert.match(shared, /restartAction: '重新開始本次練習'/);
  assert.match(shared, /newAction: '開始新一輪'/);
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
  assert.match(stage, /game === 'tone'\) skip = q\('\.tf-known-btn', slot\('skip'\)\) \|\| q\('#tf-body \.tf-known-btn'\)/);
  assert.match(stage, /children\.length === 6 \? 3/);
  assert.match(stage, /mountExistingNode\(uncertain, container\)/);
  assert.match(stage, /function syncToneRevealActions\([\s\S]{0,900}result-audio[\s\S]{0,260}result-english[\s\S]{0,260}result-next/);
  assert.match(toneApp, /skipCurrentWord:\s*function\(\)[\s\S]{0,1500}is_skipped:\s*true/);
  assert.match(css, /--gsh-ml-position-two-size:\s*clamp\(64px, 22\.5dvh, 88px\)/);
  assert.match(css, /data-gsh-game="tone"[^}]+--gsh-ml-tone-choice:\s*var\(--gsh-ml-position-two-size\)/);
  assert.match(css, /data-gsh-ml-split="tone"[^}]+align-content:\s*center/);
  assert.match(css, /data-gsh-ml-role="skip"[\s\S]{0,900}background:\s*#242322 !important/);
  assert.match(css, /--gsh-ml-top-control-gap:\s*5px/);
  assert.match(css, /data-gsh-ml-slot="dropdowns"[^}]+gap:\s*var\(--gsh-ml-top-control-gap\)/);
  assert.match(css, /data-gsh-ml-slot="main-action"[^}]+gap:\s*var\(--gsh-ml-top-control-gap\)/);
  assert.match(css, /data-gsh-game="tone"[^}]+data-gsh-ml-slot="main-action"[^}]+\.rg-ctl-wrap[^}]+gap:\s*var\(--gsh-ml-top-control-gap\)/);
  assert.match(css, /body\.gsh-ml-active \[data-gsh-ml-slot="main-action"\] \.rg-ctl-wrap[^}]+position:\s*static !important[^}]+gap:\s*var\(--gsh-ml-top-control-gap\)/);
});

test('active games reuse their requested Desktop top actions while Listening preserves its audio-failure recovery', () => {
  assert.match(stage, /game === 'reading'\) skip = q\('#btn-skip'\)/);
  assert.match(stage, /game === 'listening'\) skip = q\('#lg-skip-btn'\)/);
  assert.match(stage, /game === 'typing'\) skip = q\('#btn-skip'\)/);
  assert.match(stage, /game === 'word-order'\) skip = q\('#wo-skip-btn'\)/);
  assert.doesNotMatch(stage, /createWordOrderCheckAction|data-gsh-ml-owned-action="word-order-check"/);
  assert.match(readingApp, /function skipWord\(\)[\s\S]{0,420}skipped:true[\s\S]{0,180}nextWord\(\)/);
  assert.match(typingApp, /function skipWord\(\)[\s\S]{0,420}skipped:true[\s\S]{0,180}nextWord\(\)/);
  assert.match(listeningApp, /function skipCurrentQuestion\(\)[\s\S]{0,180}state\.answered \|\| !state\.audioFailed/);
  assert.match(listeningApp, /function skipCurrentQuestion\(\)[\s\S]{0,1200}已跳過這題：不加分、不扣分，也不算作答/);
  assert.match(wordOrderApp, /window\.woSkip = function\(\)[\s\S]{0,500}skipped:true[\s\S]{0,160}window\.woNext\(\)/);
  assert.match(wordOrderApp, /window\.woCheck = function\(\)[\s\S]{0,180}checkAnswer\(\)/);
  assert.doesNotMatch(wordOrderApp, /woManualCheckSurface|orientation: landscape[^\n]+max-height: 600px/);
  assert.match(wordOrderApp, /answer\.length === s\.words\.length\) checkAnswer\(\)/);
  assert.match(stage, /mountMany\(\['#btn-check', '#btn-next', '#btn-next-syl'\], slot\('right'\)\)/);
  assert.match(stage, /mountMany\(\['#btn-check', '#btn-next'\], slot\('right'\)\)/);
  assert.match(stage, /mountMany\(\['#wo-reset-btn', '#wo-next-btn'\], slot\('right'\)\)/);
  assert.doesNotMatch(stage, /data-gsh-ml-tool-label', '重排這句'/);
  assert.match(stage, /quickAction\('#wo-hint-btn', '提示 \(-2\)'\)/);
  assert.doesNotMatch(stage, /reset = q\('#wo-reset-btn'\)/);
  assert.doesNotMatch(css, /data-gsh-game="word-order"[^}]+#wo-hint-btn/);
});

test('approved position two reuses Tone uncertain geometry and exact labels', () => {
  assert.match(stage, /function syncPositionTwoActions\(game\)/);
  assert.match(stage, /function syncWordOrderRevealActions\(game\)[\s\S]{0,900}#wo-sound-btn[\s\S]{0,900}#wo-zh-toggle[\s\S]{0,900}data-gsh-ml-word-order-revealed/);
  assert.match(stage, /toneAction[\s\S]{0,260}slot\('right'\)/);
  assert.match(stage, /actions = \[readingCheck, readingNextSyl, readingNext\]/);
  assert.match(stage, /actions = \[typingCheck, typingNext\]/);
  assert.match(stage, /actions = \[wordOrderReset, wordOrderNext\]/);
  assert.match(stage, /applyPositionTwoLabel\(node, '檢查', '檢查'\)/);
  assert.match(stage, /applyPositionTwoLabel\(node, '下一個<br>音節', '下一個音節'\)/);
  assert.match(stage, /applyPositionTwoLabel\(node, '重新', '重新'\)/);
  assert.doesNotMatch(stage, /applyPositionTwoLabel\(node, '(?:↺ )?重排這句'/);
  assert.match(stage, /syncToneRevealActions\(game\);[\s\S]{0,100}syncWordOrderRevealActions\(game\);[\s\S]{0,100}syncPositionTwoActions\(game\);/);
  assert.match(css, /#wo-sound-btn \{[\s\S]{0,160}grid-row:\s*1/);
  assert.match(css, /#wo-zh-toggle \{[\s\S]{0,160}grid-row:\s*2/);
  assert.match(css, /data-gsh-ml-word-order-revealed="true"\] \[data-gsh-ml-slot="right"\] \{[\s\S]{0,300}grid-column:\s*1 \/ 4[\s\S]{0,300}grid-row:\s*1 \/ 3[\s\S]{0,300}grid-template-rows:\s*repeat\(3, var\(--gsh-ml-position-two-size\)\)/);
  assert.match(css, /data-gsh-ml-word-order-revealed="true"\][\s\S]{0,1500}#wo-sound-btn \{[\s\S]{0,180}grid-row:\s*3[\s\S]{0,500}#wo-zh-toggle \{[\s\S]{0,180}grid-row:\s*3[\s\S]{0,500}#wo-next-btn \{[\s\S]{0,180}grid-row:\s*3/);
  assert.match(css, /data-gsh-ml-word-order-revealed="true"\] \.gsh-ml-play \{[\s\S]{0,120}grid-template-rows:\s*minmax\(0, 1fr\) var\(--gsh-ml-position-two-size\)/);
  assert.match(css, /data-gsh-ml-word-order-revealed="true"\] #wo-slots \{[\s\S]{0,160}overflow:\s*hidden/);
  assert.match(stage, /function setPositionTwoActive\(actions, activeNode\)/);
  assert.match(stage, /revealed = q\('#wo-slots \.wo-slot\.correct'\) !== null/);
  assert.match(css, /gsh-ml-position-two-inactive[\s\S]{0,120}display: none !important/);
  assert.match(css, /data-gsh-ml-position="2"[\s\S]{0,1200}grid-row: 3/);
  assert.match(css, /data-gsh-ml-slot="right"\] > \[data-gsh-ml-position="2"\]/);
  assert.doesNotMatch(css, /data-gsh-ml-slot="right"\] > #btn-check/);
  assert.doesNotMatch(css, /data-gsh-ml-slot="main-action"\] > #btn-check/);
  assert.match(css, /data-gsh-ml-position-two-zone="reserved"[\s\S]{0,180}data-gsh-ml-slot="right"[\s\S]{0,180}grid-template-rows: repeat\(3, var\(--gsh-ml-position-two-size\)\)/);
  assert.match(css, /#wo-reset-btn:disabled[\s\S]{0,180}#wo-next-btn:disabled[\s\S]{0,120}display: none !important/);
});

test('approved games keep position two while Word Order uses one full-width choice field', () => {
  assert.match(stage, /POSITION_TWO_GAMES = \['tone', 'reading', 'typing', 'word-order'\]/);
  assert.match(stage, /POSITION_TWO_OPTION_ROW_LIMIT = 65/);
  assert.match(stage, /data-gsh-ml-position-two-zone/);
  assert.match(stage, /reservesPositionTwoZone\(game\)[\s\S]{0,180}POSITION_TWO_OPTION_ROW_LIMIT/);
  assert.match(stage, /game === 'word-order'[\s\S]{0,520}container\.dataset\.gshMaxSideCount = String\(children\.length\)[\s\S]{0,80}return/);
  assert.match(stage, /--gsh-ml-row-start/);
  assert.match(stage, /--gsh-ml-row-span/);
  assert.match(css, /data-gsh-ml-position-two-zone="reserved"[\s\S]{0,260}data-gsh-ml-split\]:not\(\[data-gsh-ml-split="tone"\]\)[\s\S]{0,240}repeat\(100, minmax\(0, 1fr\)\)/);
  assert.match(css, /data-gsh-ml-position-two-zone="reserved"[\s\S]{0,520}data-gsh-side[\s\S]{0,180}grid-row: var\(--gsh-ml-row-start\) \/ span var\(--gsh-ml-row-span\)/);
  assert.match(css, /data-gsh-ml-split="reading"[\s\S]{0,300}repeat\(100, minmax\(0, 1fr\)\)/);
  assert.match(css, /grid-row: var\(--gsh-ml-row-start\) \/ span var\(--gsh-ml-row-span\)/);
  assert.match(css, /data-gsh-ml-position="2"[\s\S]{0,1200}grid-row: 3/);
  assert.match(stage, /function syncWordOrderQuestion\(game\)[\s\S]{0,800}data-gsh-ml-question/);
  assert.match(wordOrderApp, /landscapeSlots\.setAttribute\('data-gsh-ml-question', s\.zh \|\| ''\)/);
  assert.match(css, /#gsh-ml-word-order-question[\s\S]{0,420}text-align: center/);
  assert.match(css, /data-gsh-game="word-order"[\s\S]{0,180}\.gsh-ml-play[\s\S]{0,260}grid-template-rows: minmax\(104px, 40%\) minmax\(0, 1fr\)/);
  assert.match(css, /data-gsh-game="word-order"[\s\S]{0,180}data-gsh-ml-split="word-order"[\s\S]{0,360}grid-template-columns: repeat\(4, minmax\(0, 1fr\)\) !important/);
  assert.match(css, /data-gsh-game="word-order"[\s\S]{0,180}data-gsh-ml-slot="right"[\s\S]{0,200}grid-column: 1 \/ 4[\s\S]{0,100}grid-row: 1 \/ 3/);
});

test('Reading moves the original Desktop choices into two vertical sides without restyling them', () => {
  assert.match(stage, /game === 'reading'[\s\S]{0,120}container = q\('#pool'\)/);
  assert.match(stage, /mountExistingNode\(container, slot\('split-content'\)\)/);
  assert.match(css, /data-gsh-game="reading"[\s\S]{0,180}data-gsh-ml-split="reading"\][\s\S]{0,220}grid-template-rows: repeat\(100, minmax\(0, 1fr\)\)/);
  assert.match(css, /data-gsh-ml-split="reading"\][\s\S]{0,180}grid-template-columns: minmax\(0, 30fr\) minmax\(0, 40fr\) minmax\(0, 30fr\) !important/);
  const landscapeOptBlock = css.match(/body\[data-gsh-game="reading"\]\.gsh-ml-active \[data-gsh-ml-split="reading"\] > \.opt \{([^}]*)\}/);
  assert.ok(landscapeOptBlock, 'missing Reading split-placement rule');
  assert.doesNotMatch(landscapeOptBlock[1], /(?:width|height|padding|font-size|animation):/);
  assert.match(landscapeOptBlock[1], /justify-self: var\(--gsh-ml-inline-align, center\)/);
  assert.match(landscapeOptBlock[1], /margin-inline: var\(--gsh-ml-reading-choice-safe-x\) !important/);
  assert.match(read('reading-game.html'), /\.tone-drawn\{[\s\S]{0,100}overflow:visible;[\s\S]{0,80}fill:currentColor;[\s\S]{0,80}vertical-align:middle/);
  assert.match(readingApp, /var TONE_SVG=\{[\s\S]{0,4200}'่':[\s\S]*'้':[\s\S]*'๊':[\s\S]*'๋':[\s\S]*'์':/);
  assert.match(readingApp, /if\(TONE_SVG\[v\]\)return TONE_SVG\[v\]/);
  assert.match(readingApp, /'่':'<svg class="tone-drawn" width="\.18em" height="\.34em" viewBox="-18\.6 -90\.3 11\.8 21\.9"/);
  assert.match(readingApp, /'้':'<svg class="tone-drawn" width="\.48em" height="\.34em" viewBox="-37\.2 -97\.1 40\.8 28\.7"/);
  assert.match(readingApp, /'๊':'<svg class="tone-drawn" width="\.63em" height="\.34em" viewBox="-48\.3 -95\.5 50\.4 27\.1"/);
  assert.match(readingApp, /'๋':'<svg class="tone-drawn" width="\.41em" height="\.34em" viewBox="-27 -92\.3 28\.5 23\.9"/);
  assert.match(readingApp, /'์':'<svg class="tone-drawn" width="\.42em" height="\.34em" viewBox="37 -91\.8 29 27"/);
  assert.match(readingApp, /if\(t\.type==='tone'\)el\.setAttribute\('aria-label',t\.val\)/);
  const toneSvgBlock = readingApp.match(/var TONE_SVG=\{([\s\S]*?)\n\};/);
  assert.ok(toneSvgBlock, 'missing standalone tone SVG map');
  assert.doesNotMatch(toneSvgBlock[1], /(?:comb-base|>ก<|◌)/);
  assert.doesNotMatch(read('reading-game.html'), /clip-path:inset\(0 0 72% 0\)/);
  assert.doesNotMatch(css, /content: "◌" attr\(data-val\)/);
  assert.match(stage, /__GSH_ML_READING_LAYOUT_PREVIEW/);
  assert.match(stage, /readingInlinePatterns[\s\S]{0,620}\['start', 'end', 'start', 'end', 'start', 'end'/);
  assert.match(stage, /neighbouring choices overlap/);
  assert.doesNotMatch(stage, /readingInlinePatterns[\s\S]{0,620}\['(?:start|end)', 'center'/);
  assert.match(stage, /data\.gshReadingLayoutVariant|dataset\.gshReadingLayoutVariant/);
  assert.match(stage, /game === 'reading'[\s\S]{0,1600}--gsh-ml-inline-align/);
  assert.doesNotMatch(css, /data-gsh-ml-split="reading"\] > \.opt:hover[\s\S]{0,220}transform: none/);
  assert.match(css, /gsh-resume-banner\[style\*="display:none"\],[\s\S]{0,160}gsh-resume-banner\[style\*="display: none"\][\s\S]{0,100}display: none !important/);
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
  assert.match(read('typing-game.html'), /typing-game-app\.min\.js\?v=47/);
  assert.match(css, /data-gsh-game="typing"[\s\S]{0,180}#rg-kbd[^}]+max-width: none !important/);
  assert.match(css, /#rg-kbd \.gsh-split-kbd-row[^}]+grid-template-columns: minmax\(0, 30fr\) minmax\(0, 40fr\) minmax\(0, 30fr\) !important/);
  assert.match(css, /#rg-kbd\.shift-on \.tk-key \.tk-shift[\s\S]{0,160}font-weight: 700/);
  assert.strictEqual((typingApp.match(/(?:Backquote|Digit\d|Minus|Equal|Key[A-Z]|BracketLeft|BracketRight|Semicolon|Quote|Backslash|Comma|Period|Slash):/g) || []).length / 2, 47);
});

test('Tone two-choice derivation keeps the question and choices on one horizontal plane', () => {
  assert.match(stage, /game !== 'tone'[\s\S]{0,260}tf-options, #tf-body \.tf-mark-opts, #tf-body \.sg-tone-grid/);
  assert.match(stage, /return !toneChoices \|\| toneChoices\.classList\.contains\('sg-tone-grid'\)/);
  assert.match(css, /data-gsh-ml-position-two-zone="open"[\s\S]{0,240}grid-template-rows: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /tf-options:has\(> \.tf-opt-wrap:nth-child\(2\):last-child\)[\s\S]{0,420}grid-template-rows: min-content/);
  assert.match(css, /tf-options:has\(> \.tf-opt-wrap:nth-child\(2\):last-child\)[\s\S]{0,680}grid-row: 1/);
  assert.match(stage, /children\.length === 2[\s\S]{0,520}--gsh-ml-tone-plane-shift/);
  assert.match(css, /grid-row: 1;[\s\S]{0,120}translateY\(var\(--gsh-ml-tone-plane-shift, 0px\)\)/);
});

test('Tone reviewed ALPHA states reuse the live source in one scrollable Landscape surface', () => {
  assert.match(stage, /function syncToneAlphabetSurface\(game\)/);
  assert.match(stage, /data-gsh-ml-tone-alpha/);
  assert.match(css, /data-gsh-ml-tone-alpha="true"[\s\S]{0,2500}grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /data-gsh-ml-tone-alpha="true"[\s\S]{0,5200}\.afc-face[\s\S]{0,220}min-height: clamp/);
  assert.match(read('tone-finder.html'), /gsh-ml-active'[\s\S]{0,80}TF\.openAlpha\(\)[\s\S]{0,80}TF\.openAlphabetOverlay\('home'\)/);
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

test('four-game refinements expose original controls and one shared modal shell', () => {
  const tone = read('tone-finder.html');
  const wordOrder = read('word-order.html');
  assert.doesNotMatch(tone, /Mobile Landscape keeps the accepted three-level[\s\S]{0,220}#tf-alpha-btn \{ display:none !important; \}/);
  assert.match(stage, /labeledNode\('#wo-vault-btn-slot', '單字庫', '📚'\)/);
  assert.match(stage, /data-gsh-ml-unavailable[\s\S]{0,500}!control \|\| !!control\.disabled/);
  assert.match(css, /data-gsh-ml-unavailable="true"[\s\S]{0,180}cursor: not-allowed/);
  assert.match(css, /#tf-howto-modal,[\s\S]{0,180}#rg-howto-modal,[\s\S]{0,180}#wo-howto-modal[\s\S]{0,180}z-index: 100002 !important/);
  assert.match(wordOrder, /word-order-app\.min\.js\?v=38/);
});

test('local Landscape review pages load current game assets from the site root', () => {
  const toneReview = read('scripts/browser-tests/mobile-landscape-tone-position-review.html');
  const readingReview = read('scripts/browser-tests/mobile-landscape-reading-review.html');
  const wordOrderReview = read('scripts/browser-tests/mobile-landscape-word-order-review.html');
  assert.match(toneReview, /game-content-client\.js\?v=13/);
  assert.match(readingReview, /game-content-client\.js\?v=13/);
  assert.match(wordOrderReview, /game-content-client\.js\?v=12/);
  assert.match(toneReview, /new URL\('\.\.\/\.\.\/', location\.href\)\.href/);
  assert.match(readingReview, /new URL\('\.\.\/\.\.\/', location\.href\)\.href/);
  assert.match(wordOrderReview, /new URL\('\.\.\/\.\.\/', location\.href\)\.href/);
  assert.match(wordOrderReview, /th: 'วันนี้ผมอยากไปกินข้าวกับเพื่อนที่ร้านอาหาร'[\s\S]{0,700}wc: 10/);
  assert.match(wordOrderReview, /var expectedCount = fixture\[0\]\.words\.length/);
  assert.match(wordOrderReview, /new URLSearchParams\(location\.search\)\.get\('choices'\) === '16'/);
  assert.match(sharedJs, /gameOwnsTranslationControl = !!document\.getElementById\('wo-zh-toggle'\)/);
  assert.match(sharedJs, /gameMarker === 'word-order'\) GAME_ID = 'word_order'/);
  assert.match(wordOrderReview, /!doc\.getElementById\('zh-fab-standalone'\)/);
  assert.match(wordOrderReview, /doc\.querySelector\('button\[aria-label="更多功能"\]'\)/);
  assert.match(wordOrderReview, /!doc\.getElementById\('wo-check-btn'\)/);
});

console.log(`\n✅ Mobile Landscape 5.2 tests passed (${passed} checks)`);
