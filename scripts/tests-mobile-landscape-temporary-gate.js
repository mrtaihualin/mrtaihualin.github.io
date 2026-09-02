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
  ['listening', 'listening-game.html'],
  ['typing', 'typing-game.html'],
  ['word-order', 'word-order.html'],
  ['lego', 'lego.html']
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

test('gate is allowlisted to the six public games only', () => {
  assert.match(shared, /var games = \['tone', 'reading', 'listening', 'typing', 'word-order', 'lego'\]/);
  assert.match(shared, /games\.indexOf\(game\) === -1/);
  assert.doesNotMatch(shared, /var games = \[[^\]]*(?:challenge|games|practice)/);
  games.forEach(([game, file]) => {
    const html = read(file);
    assert.match(html, new RegExp('<body[^>]+data-gsh-game="' + game + '"'));
    assert.match(html, /js\/core\/shared\.min\.js\?v=48/);
  });
});

test('only the current short-screen landscape contract activates the gate', () => {
  assert.match(shared, /matchMedia\('\(orientation: landscape\) and \(max-width: 1024px\) and \(max-height: 600px\)'\)/);
  assert.match(shared, /if \(query\.matches\) enterGate\(\);[\s\S]{0,80}else leaveGate\(\);/);
  assert.match(shared, /query\.addEventListener\('change', syncGate\)/);
  assert.match(shared, /window\.addEventListener\('orientationchange', syncGate\)/);
});

test('Traditional Chinese copy preserves the temporary Portrait instruction', () => {
  assert.match(shared, /請使用直向模式/);
  assert.match(shared, /手機橫向模式目前尚未開放，請先將手機轉回直向繼續使用。/);
  assert.ok(min.includes('請使用直向模式'));
  assert.ok(min.includes('手機橫向模式目前尚未開放'));
});

test('landscape surface is a blocking accessible dialog', () => {
  assert.match(shared, /overlay\.id = 'gsh-landscape-temporary-gate'/);
  assert.match(shared, /setAttribute\('role', 'dialog'\)/);
  assert.match(shared, /setAttribute\('aria-modal', 'true'\)/);
  assert.match(shared, /z-index:2147483647/);
  assert.match(shared, /touch-action:none/);
  assert.match(shared, /overlay\.focus/);
  assert.match(shared, /new MutationObserver/);
});

test('underlying interaction and accessibility state are restored on Portrait', () => {
  assert.match(shared, /node\.setAttribute\('aria-hidden', 'true'\)/);
  assert.match(shared, /node\.setAttribute\('inert', ''\)/);
  assert.match(shared, /entry\.ariaHidden === null[\s\S]{0,100}removeAttribute\('aria-hidden'\)/);
  assert.match(shared, /entry\.hadInert[\s\S]{0,100}removeAttribute\('inert'\)/);
  assert.match(shared, /previousFocus\.focus/);
  assert.match(shared, /overlay\.hidden = true/);
});

console.log('\n✅ Mobile Landscape temporary gate tests passed (' + passed + ' checks)');
