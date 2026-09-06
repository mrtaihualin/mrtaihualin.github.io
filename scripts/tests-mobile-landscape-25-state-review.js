#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'scripts/browser-tests/mobile-landscape-25-state-review.html'), 'utf8');
const ids = Array.from(html.matchAll(/\{id:'([^']+)'/g), (match) => match[1]);

assert.strictEqual(ids.length, 25, 'review harness must expose exactly 25 states');
assert.strictEqual(new Set(ids).size, 25, 'review state ids must be unique');
assert.strictEqual(ids.filter((id) => id.startsWith('tone-derive') || id === 'tone-helper' || id === 'tone-error').length, 5);
assert.strictEqual(ids.filter((id) => id.includes('howto')).length, 8);
assert.strictEqual(ids.filter((id) => id.startsWith('alpha-')).length, 12);
for (const page of ['tone-finder.html', 'typing-game.html', 'reading-game.html', 'word-order.html']) {
  assert.match(html, new RegExp(`page:'${page.replace('.', '\\.')}'`), `${page}: missing real-source state`);
}
assert.match(html, /fetch\('\.\.\/\.\.\/' \+ state\.page/);
assert.match(html, /frame\.srcdoc = html/);
assert.match(html, /verifyState\(state, doc\)/);
assert.match(html, /noHorizontalOverflow/);
assert.match(html, /twoChoiceRows[\s\S]{0,420}samePlane/);
assert.match(html, /Math\.abs\([\s\S]{0,180}questionCenter\) <= 2/);

console.log('✅ FB-02 combined real-source review passed (25 states: 5 + 8 + 12)');
