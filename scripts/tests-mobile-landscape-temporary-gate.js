#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const shared = read('js/core/shared.js');
const min = read('js/core/shared.min.js');
const games = [
  ['tone', 'tone-finder.html'],
  ['reading', 'reading-game.html'],
  ['typing', 'typing-game.html'],
  ['word-order', 'word-order.html']
];

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log('✓ ' + name);
  } catch (error) {
    console.error('✗ ' + name);
    throw error;
  }
}

test('accepted four-game Mobile Landscape no longer has the temporary blocker', () => {
  [shared, min].forEach((source) => {
    assert.doesNotMatch(source, /gsh-landscape-temporary-gate/);
    assert.doesNotMatch(source, /手機橫向模式目前尚未開放/);
    assert.doesNotMatch(source, /請使用直向模式/);
  });
});

test('the exact four accepted games fetch the released shared Landscape runtime', () => {
  games.forEach(([game, file]) => {
    const html = read(file);
    assert.match(html, new RegExp('<body[^>]+data-gsh-game="' + game + '"'));
    assert.match(html, /css\/mobile-landscape\.css\?v=64/);
    assert.match(html, /js\/core\/shared\.min\.js\?v=50/);
    assert.match(html, /js\/core\/mobile-landscape\.js\?v=38/);
  });
});

test('Listening and Lego remain outside the four-game activation cache key', () => {
  assert.match(read('listening-game.html'), /js\/core\/shared\.min\.js\?v=47/);
  assert.match(read('lego.html'), /js\/core\/shared\.min\.js\?v=47/);
});

console.log('\n✅ Mobile Landscape release-gate tests passed (' + passed + ' checks)');
