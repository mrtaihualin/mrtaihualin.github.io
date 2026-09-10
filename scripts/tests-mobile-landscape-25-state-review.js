#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'scripts/browser-tests/mobile-landscape-25-state-review.html'), 'utf8');
const ids = Array.from(html.matchAll(/\{id:'([^']+)'/g), (match) => match[1]);

assert.strictEqual(ids.length, 20, 'review harness must expose exactly 20 current states');
assert.strictEqual(new Set(ids).size, 20, 'review state ids must be unique');
assert.strictEqual(ids.filter((id) => id.includes('howto')).length, 8);
assert.strictEqual(ids.filter((id) => id.startsWith('alpha-')).length, 12);
for (const page of ['tone-finder.html', 'typing-game.html', 'reading-game.html', 'word-order.html']) {
  assert.match(html, new RegExp(`page:'${page.replace('.', '\\.')}'`), `${page}: missing real-source state`);
}
assert.match(html, /fetch\('\.\.\/\.\.\/' \+ state\.page/);
assert.match(html, /frame\.srcdoc = html/);
assert.match(html, /verifyState\(state, doc\)/);
assert.match(html, /noHorizontalOverflow/);
assert.doesNotMatch(html, /tone-derive|tone-helper|tone-error|推導/);

console.log('✅ FB-02 combined real-source review passed (20 states: 8 + 12)');
