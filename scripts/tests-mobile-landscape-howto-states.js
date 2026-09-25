#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const css = read('css/mobile-landscape.css');

const games = [
  { name: 'Tone', file: 'tone-finder.html', modal: 'tf-howto-modal', detail: 'tf-howto-detail', trigger: 'tf-howto-btn' },
  { name: 'Typing', file: 'typing-game.html', modal: 'rg-howto-modal', detail: 'rg-howto-detail', trigger: 'rg-howto-btn' },
  { name: 'Reading', file: 'reading-game.html', modal: 'rg-howto-modal', detail: 'rg-howto-detail', trigger: 'rg-howto-btn' },
  { name: 'Word Order', file: 'word-order.html', modal: 'wo-howto-modal', detail: 'wo-howto-detail', trigger: 'wo-howto-btn' }
];

let checks = 0;
function check(label, fn) {
  fn();
  checks += 1;
  console.log(`✓ ${label}`);
}

for (const game of games) {
  const html = read(game.file);

  check(`${game.name} keeps the original collapsed 玩法 state and open handler`, () => {
    assert.match(html, new RegExp(`id=["']${game.modal}["'][\\s\\S]{0,5200}id=["']${game.detail}["'][^>]*style=["'][^"']*display:none`));
    assert.match(html, new RegExp(`id=["']${game.trigger}["'][\\s\\S]{0,460}getElementById\\(["']${game.modal}["']\\)\\.style\\.display=["']flex["']`));
  });

  check(`${game.name} keeps the original expanded 玩法 state and close/action nodes`, () => {
    assert.match(html, new RegExp(`getElementById\\(["']${game.detail}["']\\)[\\s\\S]{0,220}display===["']block["'][\\s\\S]{0,180}display=open\\?["']none["']:["']block["']`));
    assert.match(html, new RegExp(`getElementById\\(["']${game.modal}["']\\)\\.style\\.display=["']none["']`));
  });
}

check('all four 玩法 dialogs share the bounded Landscape shell', () => {
  assert.match(css, /#tf-howto-modal,[\s\S]{0,180}#rg-howto-modal,[\s\S]{0,180}#wo-howto-modal[\s\S]{0,180}z-index: 100002 !important/);
  assert.match(css, /#tf-howto-modal > :first-child,[\s\S]{0,240}#wo-howto-modal > :first-child[\s\S]{0,420}width: min\(72vw, 640px\) !important[\s\S]{0,320}overflow-y: auto !important/);
});

console.log(`\n✅ Shared Landscape 玩法 states passed (${checks} checks)`);
