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

test('all six pages bind one shared landscape system', () => {
  for (const [game, file] of pages) {
    const html = read(file);
    assert.match(html, new RegExp(`<body[^>]*data-gsh-game="${game}"`), `${file}: missing game marker`);
    assert.match(html, /css\/mobile-landscape\.css\?v=26/, `${file}: missing shared CSS`);
    assert.match(html, /js\/core\/mobile-landscape\.js\?v=18/, `${file}: missing shared controller`);
    assert.match(html, /js\/games\/thai-keyboard\.js\?v=2/, `${file}: missing shared split keyboard`);
  }
  assert.doesNotMatch(read('tone-finder.html'), /tone-mobile-landscape\.(?:css|js)/);
});

test('top band is Login, Chinese menus, title, Game, More and fixed Skip slot', () => {
  assert.match(stage, /mainAction\.appendChild\(makeSlot\('skip'\)\)/);
  assert.match(stage, /top\.append\(makeSlot\('dropdowns'\), makeSlot\('shared-controls'\), mainAction\)/);
  assert.match(stage, /createDropdown\('level', '等級', levels\)/);
  assert.match(stage, /createDropdown\('tools', '工具', tools\)/);
  assert.match(stage, /mountExistingNode\(login, slot\('dropdowns'\)\)/);
  assert.match(stage, /slot\('dropdowns'\)\.prepend\(login\)/);
  assert.match(stage, /mountExistingNode\(title, slot\('shared-controls'\)\)/);
  assert.match(stage, /insertBefore\(controls, slot\('skip'\)\)/);
  assert.match(css, /data-gsh-ml-slot="skip"[\s\S]{0,220}flex: 0 0 var\(--gsh-ml-control-h\)/);
});

test('five standard games lock visible 30 / 40 / 30 outer cards', () => {
  assert.match(css, /grid-template-columns: minmax\(0, 30fr\) minmax\(0, 40fr\) minmax\(0, 30fr\)/);
  assert.match(css, /not\(\[data-gsh-game="lego"\]\) \[data-gsh-ml-slot="left"\][\s\S]{0,260}border: 1\.5px solid/);
  assert.match(css, /not\(\[data-gsh-game="lego"\]\) \[data-gsh-ml-slot="center"\][\s\S]{0,420}overflow-y: auto/);
  assert.match(stage, /play\.append\(makeSlot\('sentence'\), left, center, right/);
});

test('menus open below their owner, expose six rows and keep icon labels functional', () => {
  assert.match(stage, /function positionPanelBelow\(trigger, panel, fallbackWidth\)[\s\S]{0,1800}rect\.bottom \+ 4/);
  assert.match(stage, /if \(name === 'tools'\)[\s\S]{0,1200}control\.click\(\)/);
  assert.match(css, /data-gsh-dropdown="tools"[\s\S]{0,2600}max-height: calc\(\(6 \* var\(--gsh-ml-control-h\)\)/);
  assert.match(css, /data-gsh-ml-tool-label[\s\S]{0,500}border: 0 !important/);
  assert.match(css, /game-switcher\[data-gsh-ml-utility-panel\][\s\S]{0,800}overflow-y: auto !important/);
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
  assert.match(css, /data-gsh-ml-slot="main-action"[^}]+\.rg-ctl-wrap[^}]+padding:\s*0 !important/);
});

test('Reading, Typing and Word Order keep game-owned actions in fixed right-side slots', () => {
  assert.match(stage, /mountMany\(\['#btn-check', '#btn-next', '#btn-next-syl'\], slot\('right'\)\)/);
  assert.match(stage, /mountMany\(\['#btn-check', '#btn-next'\], slot\('right'\)\)/);
  assert.match(stage, /mountMany\(\['#wo-hint-btn', '#wo-next-btn'\], slot\('right'\)\)/);
  assert.doesNotMatch(stage, /labeledNode\('#wo-hint-btn', '提示'/);
  assert.match(css, /data-gsh-game="word-order"[\s\S]{0,220}#wo-hint-btn/);
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
