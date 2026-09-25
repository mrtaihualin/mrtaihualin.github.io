#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'js/core/account-toolbar-overflow.js'), 'utf8');
const auth = fs.readFileSync(path.join(root, 'js/core/auth-widget.js'), 'utf8');
const loginSurface = fs.readFileSync(path.join(root, 'js/core/login-surface.js'), 'utf8');
const minimumGuest = fs.readFileSync(path.join(root, 'js/core/minimum-guest-launch.js'), 'utf8');

const appended = [];
const documentStub = {
  getElementById() { return null; },
  createElement() { return { id: '', textContent: '' }; },
  head: { appendChild(node) { appended.push(node); } }
};
const windowStub = {};
vm.runInNewContext(source, { window: windowStub, document: documentStub }, { filename: 'account-toolbar-overflow.js' });

const api = windowStub.AccountToolbarOverflow;
assert(api && api.__test, 'account overflow test API must load');
assert.strictEqual(appended.length, 1, 'shared account overflow styles must be installed once');

const actionOrder = ['logout', 'help', 'search', 'vault', 'leaderboard', 'edit', 'progress', 'streak'];
assert.deepStrictEqual(Array.from(api.__test.order), actionOrder, 'secondary actions must overflow before Progress and Streak');

const widths = {
  logout: 60,
  help: 70,
  search: 65,
  vault: 60,
  leaderboard: 60,
  edit: 60,
  progress: 65,
  streak: 75
};
function plan(width, scale = 1) {
  const scaled = {};
  for (const id of actionOrder) scaled[id] = widths[id] * scale;
  return Array.from(api.__test.syntheticPlan(width, 100 * scale, scaled, 70 * scale, 6 * scale));
}

assert.deepStrictEqual(plan(800), [], 'wide containers must restore every action to the original one-line order');
assert.deepStrictEqual(plan(650).slice(0, 2), ['logout', 'help'], 'narrowing must move actions into More one at a time in priority order');
assert.deepStrictEqual(plan(240), actionOrder, 'the narrowest supported container must reduce to identity plus More');

for (const scale of [1, 1.25, 1.5]) {
  let previousMoved = actionOrder.length;
  for (let width = 240; width <= 900; width += 5) {
    const moved = plan(width, scale);
    assert(moved.length <= previousMoved, `actions must restore monotonically as width grows (scale=${scale}, width=${width})`);
    assert.deepStrictEqual(moved, actionOrder.slice(0, moved.length), 'the overflow set must never skip, duplicate or reorder an action');
    previousMoved = moved.length;
  }
}

assert.match(source, /bar\.scrollWidth <= bar\.clientWidth \+ 1/, 'fit decisions must use actual rendered container geometry');
assert.match(source, /\[data-reading-login-component="host"\]\{width:min\(100%,1120px\);\}[\s\S]*\[data-reading-login-component="row"\]\{max-width:1080px;\}/, 'the widest layout must retain enough room to show every original action');
assert.match(source, /new window\.ResizeObserver\(schedule\)/, 'continuous container resize must trigger refitting');
assert.doesNotMatch(source, /window\.innerWidth|matchMedia\(/, 'fit decisions must not use viewport breakpoints');
assert.doesNotMatch(source, /cloneNode\(/, 'existing action nodes and handlers must be moved, not cloned');
assert.match(source, /event\.key === 'ArrowDown'[\s\S]*event\.key === 'Escape'[\s\S]*event\.key === 'Home'/, 'More menu must provide keyboard navigation and Escape close');
assert.match(source, /active === more && more\.hidden[\s\S]*menu\.contains\(active\)[\s\S]*more\.focus\(\)/, 'responsive refitting must never strand focus in a hidden control or menu');
assert.match(source, /aria-controls/, 'More must expose its controlled menu');
assert.match(source, /document\.addEventListener\('pointerdown', onDocumentPointer, true\)/, 'outside pointer input must close More');
assert.match(source, /white-space:nowrap/, 'the toolbar and menu labels must never wrap');

for (const label of ['編輯', '排行', '連續', '進度', '字庫', '搜尋', '玩法', '登出', '＋ 更多']) {
  assert(source.includes(label) || auth.includes(label) || loginSurface.includes(label), `Traditional Chinese action label must remain present: ${label}`);
}

assert.match(auth, /destroyAccountOverflow\(el\);[\s\S]*if \(!API\.user\)/, 'auth repaint must tear down a prior overflow controller safely');
assert.match(auth, /accountOverflowReady\(\)[\s\S]*overflow\.setup\(el, \{ closeSearch:/, 'every shared authenticated badge must activate progressive overflow');
assert.match(loginSurface, /js\/core\/auth-widget\.js\?v=24/, 'dynamic shared surfaces must load the new account toolbar runtime');
assert.match(minimumGuest, /js\/core\/login-surface\.js\?v=16/, 'all shared surfaces must load the new Login controller cache key');

const scopedPages = [
  'tone-finder.html', 'reading-game.html', 'listening-game.html', 'typing-game.html', 'word-order.html', 'lego.html',
  'games.html', 'games-practice.html', 'games-challenge.html', 'my-progress.html', 'vault.html', 'all-board.html',
  'leaderboard.html', 'reading-board.html', 'listening-board.html', 'typing-board.html', 'word-order-board.html'
];
for (const file of scopedPages) {
  const html = fs.readFileSync(path.join(root, file), 'utf8');
  assert.match(html, /js\/core\/minimum-guest-launch\.js\?v=25/, `${file} must receive the shared toolbar through the current Login gate`);
}

console.log('Account toolbar progressive overflow tests passed.');
