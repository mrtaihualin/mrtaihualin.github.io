#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const flowSource = fs.readFileSync(path.join(root, 'js/games/game-flow.js'), 'utf8');

class FakeClassList {
  constructor() { this.values = []; }
  add(value) { if (!this.values.includes(value)) this.values.push(value); }
  contains(value) { return this.values.includes(value); }
}

class FakeElement {
  constructor(tag) {
    this.tagName = String(tag || 'div').toUpperCase();
    this.children = [];
    this.attributes = {};
    this.classList = new FakeClassList();
    this.style = {};
    this.offsetParent = {};
    this.disabled = false;
    this.hidden = false;
    this.textContent = '';
    this.listeners = {};
    this.clicks = 0;
  }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name] || null; }
  addEventListener(name, fn) { (this.listeners[name] ||= []).push(fn); }
  appendChild(child) {
    if (child.parentNode) child.parentNode.children = child.parentNode.children.filter((item) => item !== child);
    child.parentNode = this;
    this.children.push(child);
    return child;
  }
  insertBefore(child, before) {
    if (child === before) return child;
    if (child.parentNode) child.parentNode.children = child.parentNode.children.filter((item) => item !== child);
    child.parentNode = this;
    const index = this.children.indexOf(before);
    if (index < 0) this.children.push(child); else this.children.splice(index, 0, child);
    return child;
  }
  get firstChild() { return this.children[0] || null; }
  get nextSibling() {
    if (!this.parentNode) return null;
    const index = this.parentNode.children.indexOf(this);
    return this.parentNode.children[index + 1] || null;
  }
  removeChild(child) { this.children = this.children.filter((item) => item !== child); child.parentNode = null; return child; }
  querySelector(selector) {
    const direct = selector.startsWith('.')
      ? this.children.find((child) => String(child.className || '').split(/\s+/).includes(selector.slice(1)))
      : (() => {
          const match = selector.match(/\[([^=]+)="([^"]+)"\]/);
          return match ? this.children.find((child) => child.getAttribute(match[1]) === match[2]) : null;
        })();
    if (direct) return direct;
    for (const child of this.children) {
      const nested = child.querySelector(selector);
      if (nested) return nested;
    }
    return null;
  }
  click() {
    (this.listeners.click || []).forEach((fn) => fn({ target: this }));
    this.clicks += 1;
  }
  focus() { this.focused = true; }
  remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter((child) => child !== this); }
}

const timerQueue = [];
const storage = {};
const document = {
  readyState: 'complete',
  listeners: {},
  activeElement: null,
  createElement: (tag) => new FakeElement(tag),
  querySelector: () => null,
  addEventListener(name, fn) { (this.listeners[name] ||= []).push(fn); }
};
const window = {
  document,
  setTimeout(fn) { timerQueue.push(fn); return timerQueue.length; },
  clearTimeout() {},
  gtag() {},
  localStorage: {
    getItem(key) { return Object.prototype.hasOwnProperty.call(storage, key) ? storage[key] : null; },
    setItem(key, value) { storage[key] = String(value); },
    removeItem(key) { delete storage[key]; }
  }
};
window.window = window;

vm.runInNewContext(flowSource, { window, document, console }, { filename: 'game-flow.js' });
const GameFlow = window.GameFlow;

const parent = new FakeElement('div');
const next = new FakeElement('button');
parent.appendChild(next);
assert.strictEqual(GameFlow.start({ key: 'test-game', nextButton: next, delaySeconds: 3 }), true);
const status = parent.querySelector('[data-game-flow-status="test-game"]');
const pause = parent.querySelector('[data-game-flow-pause="test-game"]');
assert.strictEqual(status.textContent, '3', 'countdown must start at 3');
assert.strictEqual(pause.textContent, '暫停', 'pause control must be available');
timerQueue.shift()();
assert.strictEqual(status.textContent, '2');
timerQueue.shift()();
assert.strictEqual(status.textContent, '1');
timerQueue.shift()();
assert.strictEqual(next.clicks, 1, 'countdown must advance automatically after 3→2→1');

GameFlow.start({ key: 'test-game', nextButton: next, delaySeconds: 3 });
const clicksBeforePause = next.clicks;
pause.onclick();
while (timerQueue.length) timerQueue.shift()();
assert.strictEqual(next.clicks, clicksBeforePause, 'pause must stop automatic progress');
assert.match(status.textContent, /已暫停/);
next.click();
assert.strictEqual(next.clicks, clicksBeforePause + 1, 'next remains available for immediate progress');

const older = { device: 'A', _savedAt: 100, saved: true, state: { index: 2 } };
const newest = { device: 'B', _savedAt: 200, saved: true, state: { index: 4 } };
const failed = { device: 'C', _savedAt: 300, saved: false, state: { index: 8 } };
assert.strictEqual(GameFlow.selectLatestSuccessful([older, failed, newest]), newest,
  'latest successfully saved state must win without merging rounds');

const result = new FakeElement('section');
assert.strictEqual(GameFlow.markResult(result), true);
assert.strictEqual(result.getAttribute('data-shared-result-ui'), 'v1');
assert(result.classList.contains('gsh-shared-result'));

assert.strictEqual(GameFlow.feedbackCopy(undefined, 0.5), null);
assert.strictEqual(GameFlow.recordResultFeedback('test', 1, 2), null);
assert(!flowSource.includes('gsh_result_feedback_v1'), 'Guest/Login result must not persist cross-round feedback');

const resultActions = new FakeElement('div');
const resultStatus = new FakeElement('div');
let replayed = 0;
GameFlow.startResultCountdown({ key: 'result-test', status: resultStatus, seconds: 7, onComplete() { replayed += 1; } });
assert.match(resultStatus.textContent, /7 秒/);
while (timerQueue.length) timerQueue.shift()();
assert.strictEqual(replayed, 1, '7-second result countdown must replay after 7→1');
GameFlow.startResultCountdown({ key: 'result-cancel', status: resultStatus, seconds: 7, onComplete() { replayed += 1; } });
GameFlow.cancelResult('result-cancel');
while (timerQueue.length) timerQueue.shift()();
assert.strictEqual(replayed, 1, 'result action cancellation must stop replay');

const enterResult = new FakeElement('section');
const enterActions = new FakeElement('div');
enterActions.className = 'gsh-end-actions';
const replayButton = new FakeElement('button');
replayButton.setAttribute('data-game-result-replay', 'v1');
enterResult.appendChild(enterActions);
enterActions.appendChild(replayButton);
GameFlow.enhanceResult({ key: 'enter-result', root: enterResult, actions: enterActions, correct: 5, total: 5, onReplay() {} });
const enterHandler = document.listeners.keydown[0];
let prevented = 0;
enterHandler({ key: 'Enter', target: { closest() { return null; } }, preventDefault() { prevented += 1; } });
assert.strictEqual(prevented, 1, 'plain Enter on a visible Result must be consumed');
assert.strictEqual(replayButton.clicks, 1, 'plain Enter must activate the real replay button');
enterHandler({ key: 'Enter', target: { closest() { return {}; } }, preventDefault() { prevented += 1; } });
assert.strictEqual(replayButton.clicks, 1, 'Enter from an editable/control context must not replay');
enterHandler({ key: 'Enter', repeat: true, target: { closest() { return null; } }, preventDefault() { prevented += 1; } });
assert.strictEqual(replayButton.clicks, 1, 'repeated Enter must not replay again');
GameFlow.enhanceResult({
  key: 'truth-result', root: enterResult, actions: enterActions, correct: 2, total: 3,
  report: { items: [
    { is_correct: true, wrong_count: 0, hint_used: false, attempts: [{ is_correct: true }] },
    { is_correct: true, wrong_count: 1, hint_used: false, attempts: [{ is_correct: false }, { is_correct: true }] },
    { is_correct: false, wrong_count: 0, hint_used: false, attempts: [] }
  ] }
});
const truthMeta = enterResult.querySelector('[data-game-result-meta="v1"]');
assert.strictEqual(truthMeta.querySelector('.gsh-result-completed').textContent, '完成 3 / 3');
assert.strictEqual(truthMeta.querySelector('.gsh-result-first-correct').textContent, '首次答對 1 / 3', 'later correction must not count as first-attempt proof');

delete storage.gsh_srs_quota_v1;
const due = Array.from({ length: 8 }, (_, i) => ({ id: `d${i}` }));
const regular = Array.from({ length: 12 }, (_, i) => ({ id: `r${i}` }));
const free = GameFlow.allocateSrs({ tier: 'free', total: 10, due, regular, idOf: (x) => x.id, scope: 'test-free' });
assert.strictEqual(free.selectedDue.length, 2, 'Login Free SRS Due quota must be 20%');
assert.strictEqual(free.reviewLimit, 1, 'Login Free Review Needed must be one time');
assert.notDeepStrictEqual(free.items.slice(0, 2).map((x) => x.id), ['d0', 'd1'], 'Due items must be distributed, not grouped at the front');
const paid = GameFlow.allocateSrs({ tier: 'paid', total: 10, due, regular, idOf: (x) => x.id, scope: 'test-paid' });
assert.strictEqual(paid.selectedDue.length, 3, 'Paid SRS Due quota architecture must be 30%');
assert.strictEqual(paid.reviewLimit, 4, 'Paid Review Needed must be capped at four times');
const deduped = GameFlow.allocateSrs({ tier: 'free', total: 5, due: [due[0], due[0]], regular: [due[0], regular[0], regular[0], regular[1], regular[2], regular[3]], idOf: (x) => x.id, scope: 'test-dedupe' });
assert.strictEqual(new Set(deduped.items.map((x) => x.id)).size, deduped.items.length, 'SRS allocation must dedupe questions');
delete storage.gsh_srs_quota_v1;
const small1 = GameFlow.allocateSrs({ tier: 'free', total: 3, due, regular, idOf: (x) => x.id, scope: 'small' });
const small2 = GameFlow.allocateSrs({ tier: 'free', total: 3, due, regular, idOf: (x) => x.id, scope: 'small' });
assert.strictEqual(small1.selectedDue.length + small2.selectedDue.length, 1, 'fractional SRS quota must carry into a later small round');
delete storage.gsh_srs_quota_v1;
const dueOnly = GameFlow.allocateSrs({ tier: 'free', total: 3, due, regular: [], idOf: (x) => x.id, scope: 'due-only' });
assert.strictEqual(dueOnly.items.length, 3, 'an all-Due queue must remain playable and carry quota debt forward');
assert(dueOnly.fractionCarry < 0, 'an all-Due overflow must become quota debt for later rounds');

[null, 42, 'bad-shape', [], '{malformed'].forEach((badState, index) => {
  storage.gsh_srs_quota_v1 = typeof badState === 'string' && badState === '{malformed'
    ? badState
    : JSON.stringify(badState);
  const scope = `recover-${index}`;
  const first = GameFlow.allocateSrs({ tier: 'free', total: 3, due, regular, idOf: (x) => x.id, scope });
  const second = GameFlow.allocateSrs({ tier: 'free', total: 3, due, regular, idOf: (x) => x.id, scope });
  const repaired = JSON.parse(storage.gsh_srs_quota_v1);
  assert.strictEqual(first.items.length, 3, 'invalid quota state must recover to a playable first round');
  assert.strictEqual(second.items.length, 3, 'repaired quota state must remain playable after refresh/reopen');
  assert.strictEqual(first.selectedDue.length + second.selectedDue.length, 1,
    'recovered quota state must preserve fractional carry across rounds');
  assert(repaired && typeof repaired === 'object' && !Array.isArray(repaired),
    'invalid quota state must be replaced by a durable object record');
});

const pages = ['tone-finder.html', 'reading-game.html', 'typing-game.html', 'word-order.html', 'listening-game.html'];
pages.forEach((file) => {
  const html = fs.readFileSync(path.join(root, file), 'utf8');
  assert(html.includes('js/games/game-flow.js?v=10'), `${file} must load the shared flow`);
  assert(/▶ 繼續上次/.test(html) || file === 'tone-finder.html', `${file} must expose resume continue where markup is static`);
  assert(/↺ 重新開始/.test(html) || file === 'tone-finder.html', `${file} must expose restart-same where markup is static`);
  assert(/＋ 開始新一輪/.test(html) || file === 'tone-finder.html', `${file} must expose new-round where markup is static`);
  assert(/data-game-result-replay="v1"/.test(html) || file === 'tone-finder.html', `${file} must expose the shared Result replay action`);
  ['switch', 'print', 'detail-action', 'cta', 'home'].forEach((role) => {
    assert(new RegExp(`data-game-result-${role}="v1"`).test(html) || file === 'tone-finder.html', `${file} must expose the shared Result ${role} role`);
  });
});

const toneSource = fs.readFileSync(path.join(root, 'js/games/tone-finder-game.js'), 'utf8');
['switch', 'print', 'detail-action', 'cta', 'home'].forEach((role) => {
  assert(toneSource.includes(`data-game-result-${role}="v1"`), `Tone must expose the shared Result ${role} role`);
});

const integrations = {
  'tone-finder-game.js': "key: 'tone-finder'",
  'reading-game-app.js': "key:'reading-game'",
  'typing-game-app.js': "key:'typing-game'",
  'word-order-app.js': "key:'word-order'",
  'listening-game-app.js': "key: 'listening-game'"
};
Object.entries(integrations).forEach(([file, marker]) => {
  const source = fs.readFileSync(path.join(root, 'js/games', file), 'utf8');
  assert(source.includes(marker), `${file} must use the shared automatic-next flow`);
  assert(source.includes('GameFlow.markResult'), `${file} must mark the shared result structure`);
  assert(source.includes('GameFlow.enhanceResult'), `${file} must use shared X/N, feedback, and 7-second result flow`);
});

assert(!/roundScore|totalStars|srsRecords|mastered\s*=/.test(flowSource),
  'shared flow must not change scoring, SRS, stars, or mastered rules');

console.log('PASS tests-game-flow-delta: auto-next/pause, compact resume, Result Enter/replay/countdown, SRS quota/carry/dedupe/distribution, scoring boundary');
