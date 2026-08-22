#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

class FakeEvent {
  constructor(type, options = {}) {
    this.type = type;
    this.bubbles = !!options.bubbles;
    this.inputType = options.inputType;
    this.detail = options.detail || 0;
    this.defaultPrevented = false;
    this.target = null;
    Object.assign(this, options);
  }
  preventDefault() { this.defaultPrevented = true; }
  stopImmediatePropagation() { this.immediatePropagationStopped = true; }
}

class FakeClassList {
  constructor(node) { this.node = node; this.values = new Set(); }
  set(value) { this.values = new Set(String(value || '').split(/\s+/).filter(Boolean)); }
  contains(value) { return this.values.has(value); }
  add(...values) { values.forEach((value) => this.values.add(value)); }
  remove(...values) { values.forEach((value) => this.values.delete(value)); }
  toggle(value, force) {
    const enabled = force == null ? !this.values.has(value) : !!force;
    if (enabled) this.values.add(value); else this.values.delete(value);
    return enabled;
  }
  toString() { return [...this.values].join(' '); }
}

class FakeNode {
  constructor(document, tagName, nodeType = 1, data = '') {
    this.ownerDocument = document;
    this.tagName = tagName ? String(tagName).toUpperCase() : undefined;
    this.nodeType = nodeType;
    this.data = data;
    this.parentNode = null;
    this.childNodes = [];
    this.attributes = new Map();
    this.dataset = Object.create(null);
    this.classList = new FakeClassList(this);
    this.style = Object.create(null);
    this.listeners = Object.create(null);
    this.hidden = false;
    this.disabled = false;
    this.readOnly = false;
    this.inert = false;
    this.offsetParent = {};
    this.value = '';
    this.textContent = '';
    this._innerHTML = '';
    this.clicks = 0;
  }
  get children() { return this.childNodes.filter((node) => node.nodeType === 1); }
  get firstChild() { return this.childNodes[0] || null; }
  get nextSibling() {
    if (!this.parentNode) return null;
    const index = this.parentNode.childNodes.indexOf(this);
    return index < 0 ? null : this.parentNode.childNodes[index + 1] || null;
  }
  get isConnected() {
    if (this === this.ownerDocument.body) return true;
    return !!this.parentNode && this.parentNode.isConnected;
  }
  get id() { return this.getAttribute('id') || ''; }
  set id(value) { this.setAttribute('id', value); }
  get className() { return this.classList.toString(); }
  set className(value) { this.classList.set(value); }
  get innerHTML() { return this._innerHTML; }
  set innerHTML(value) { this._innerHTML = String(value); this.replaceChildren(); }
  setAttribute(name, value) {
    const text = String(value);
    this.attributes.set(name, text);
    if (name === 'class') this.classList.set(text);
    if (name.startsWith('data-')) {
      const key = name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      this.dataset[key] = text;
    }
  }
  getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; }
  hasAttribute(name) { return this.attributes.has(name); }
  removeAttribute(name) {
    this.attributes.delete(name);
    if (name === 'class') this.classList.set('');
    if (name.startsWith('data-')) delete this.dataset[dataKey(name)];
  }
  append(...nodes) { nodes.forEach((node) => this.appendChild(node)); }
  appendChild(node) {
    if (node.parentNode) node.parentNode._detach(node);
    node.parentNode = this;
    this.childNodes.push(node);
    return node;
  }
  insertBefore(node, reference) {
    if (node === reference) return node;
    if (node.parentNode) node.parentNode._detach(node);
    const index = reference == null ? this.childNodes.length : this.childNodes.indexOf(reference);
    assert(index >= 0, 'insertBefore reference must belong to parent');
    node.parentNode = this;
    this.childNodes.splice(index, 0, node);
    return node;
  }
  replaceChildren(...nodes) {
    this.childNodes.forEach((node) => { node.parentNode = null; });
    this.childNodes = [];
    nodes.forEach((node) => this.appendChild(node));
  }
  replaceWith(node) {
    if (!this.parentNode) return;
    const parent = this.parentNode;
    const index = parent.childNodes.indexOf(this);
    if (node.parentNode) node.parentNode._detach(node);
    this.parentNode = null;
    node.parentNode = parent;
    parent.childNodes[index] = node;
  }
  _detach(node) {
    const index = this.childNodes.indexOf(node);
    if (index >= 0) this.childNodes.splice(index, 1);
    node.parentNode = null;
  }
  removeChild(node) { this._detach(node); return node; }
  remove() { if (this.parentNode) this.parentNode._detach(this); }
  contains(node) {
    for (let current = node; current; current = current.parentNode) if (current === this) return true;
    return false;
  }
  matches(selector) { return matchesSelector(this, selector); }
  closest(selector) {
    for (let current = this; current && current.nodeType === 1; current = current.parentNode) {
      if (matchesSelector(current, selector)) return current;
    }
    return null;
  }
  querySelector(selector) { return queryWithin(this, selector)[0] || null; }
  querySelectorAll(selector) { return queryWithin(this, selector); }
  addEventListener(type, listener) { (this.listeners[type] ||= []).push(listener); }
  removeEventListener(type, listener) {
    this.listeners[type] = (this.listeners[type] || []).filter((item) => item !== listener);
  }
  dispatchEvent(event) {
    if (!event.target) event.target = this;
    (this.listeners[event.type] || []).slice().forEach((listener) => listener.call(this, event));
    if (typeof this['on' + event.type] === 'function') this['on' + event.type].call(this, event);
    if (event.type === 'click') this.clicks += 1;
    if (event.bubbles && !event.immediatePropagationStopped && this.parentNode) this.parentNode.dispatchEvent(event);
    return !event.defaultPrevented;
  }
  click() { this.dispatchEvent(new FakeEvent('click', { bubbles: true })); }
  focus() { this.ownerDocument.activeElement = this; }
  blur() { if (this.ownerDocument.activeElement === this) this.ownerDocument.activeElement = this.ownerDocument.body; }
  getBoundingClientRect() { return { left: 12, right: 92, top: 8, bottom: 48, width: 80, height: 40 }; }
}

class FakeDocument {
  constructor() {
    this.readyState = 'loading';
    this.body = new FakeNode(this, 'body');
    this.activeElement = this.body;
    this.selectors = new Map();
    this.listeners = Object.create(null);
  }
  createElement(tagName) { return new FakeNode(this, tagName); }
  createComment(data) { return new FakeNode(this, null, 8, data); }
  querySelectorAll(selector) {
    const value = this.selectors.get(selector);
    if (!value) return queryWithin(this.body, selector, true);
    return Array.isArray(value) ? value : [value];
  }
  querySelector(selector) {
    if (this.selectors.has(selector)) return this.selectors.get(selector);
    return queryWithin(this.body, selector, true)[0] || null;
  }
  getElementById(id) { return this.querySelector('#' + id); }
  addEventListener(type, listener) { (this.listeners[type] ||= []).push(listener); }
  removeEventListener(type, listener) {
    this.listeners[type] = (this.listeners[type] || []).filter((item) => item !== listener);
  }
  dispatchEvent(event) {
    (this.listeners[event.type] || []).slice().forEach((listener) => listener.call(this, event));
  }
}

function dataKey(name) {
  return name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

function matchesSimple(node, selector) {
  if (!node || node.nodeType !== 1) return false;
  const nots = [...selector.matchAll(/:not\(([^)]+)\)/g)].map((match) => match[1]);
  selector = selector.replace(/:not\([^)]+\)/g, '');
  if (nots.some((part) => matchesSimple(node, part))) return false;
  const tag = selector.match(/^[a-z][a-z0-9-]*/i);
  if (tag && node.tagName !== tag[0].toUpperCase()) return false;
  for (const id of selector.matchAll(/#([\w-]+)/g)) if (node.id !== id[1]) return false;
  for (const cls of selector.matchAll(/\.([\w-]+)/g)) if (!node.classList.contains(cls[1])) return false;
  for (const attr of selector.matchAll(/\[([\w-]+)(?:="([^"]*)")?\]/g)) {
    const name = attr[1];
    const value = node.getAttribute(name) ?? (name.startsWith('data-') ? node.dataset[dataKey(name)] : null);
    if (value == null || (attr[2] != null && String(value) !== attr[2])) return false;
  }
  return true;
}

function matchesSelector(node, selector) {
  return String(selector).split(',').some((branch) => {
    const parts = branch.trim().split(/\s+/).filter(Boolean);
    let current = node;
    if (!parts.length || !matchesSimple(current, parts.pop())) return false;
    while (parts.length) {
      const expected = parts.pop();
      current = current.parentNode;
      while (current && !matchesSimple(current, expected)) current = current.parentNode;
      if (!current) return false;
    }
    return true;
  });
}

function queryWithin(root, selector, includeRoot = false) {
  const nodes = [];
  function visit(node, include) {
    if (include && matchesSelector(node, selector)) nodes.push(node);
    node.childNodes.forEach((child) => visit(child, true));
  }
  visit(root, includeRoot);
  return nodes;
}

function descendants(node) {
  return node.children.flatMap((child) => [child, ...descendants(child)]);
}

function click(node) {
  node.dispatchEvent(new FakeEvent('pointerdown'));
  node.dispatchEvent(new FakeEvent('click'));
}

const root = path.resolve(__dirname, '..');
const document = new FakeDocument();
const animationFrames = [];
const windowListeners = Object.create(null);
const timerQueue = [];
let timerId = 0;
class FakeMutationObserver {
  constructor(callback) { this.callback = callback; FakeMutationObserver.instances.push(this); }
  observe() { this.observing = true; }
  disconnect() { this.observing = false; }
  trigger() { if (this.observing) this.callback([]); }
}
FakeMutationObserver.instances = [];
const window = {
  __GSH_ML_TEST__: true,
  document,
  innerWidth: 740,
  innerHeight: 360,
  matchMedia() { return { matches: false, addEventListener() {}, removeEventListener() {} }; },
  requestAnimationFrame(callback) { animationFrames.push(callback); return animationFrames.length; },
  setTimeout(callback) { const id = ++timerId; timerQueue.push({ id, callback, cancelled: false }); return id; },
  clearTimeout(id) { const timer = timerQueue.find((item) => item.id === id); if (timer) timer.cancelled = true; },
  addEventListener(type, listener) { (windowListeners[type] ||= []).push(listener); },
  removeEventListener(type, listener) {
    windowListeners[type] = (windowListeners[type] || []).filter((item) => item !== listener);
  },
  localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
  gtag() {},
  getComputedStyle(node) {
    return {
      display: node.hidden ? 'none' : node.style.display || 'block',
      visibility: node.style.visibility || 'visible',
      getPropertyValue() { return ''; }
    };
  }
};

const context = vm.createContext({
  window,
  document,
  Event: FakeEvent,
  CustomEvent: FakeEvent,
  MutationObserver: FakeMutationObserver,
  console,
  Map,
  Math,
  Number,
  Object,
  String,
  Array
});
vm.runInContext(fs.readFileSync(path.join(root, 'js/games/thai-keyboard.js'), 'utf8'), context);
vm.runInContext(fs.readFileSync(path.join(root, 'js/games/game-flow.js'), 'utf8'), context);
vm.runInContext(fs.readFileSync(path.join(root, 'js/core/mobile-landscape.js'), 'utf8'), context);

const hooks = window.GSHMobileLandscape.__test;
assert(hooks, 'Mobile Landscape runtime test hooks must be available only in test mode');

// Listening Typed: idle observer/frame syncs must not rebuild the shared keyboard.
const typeWrap = document.createElement('div');
const input = document.createElement('input');
input.setAttribute('inputmode', 'text');
typeWrap.appendChild(input);
document.body.appendChild(typeWrap);
document.selectors.set('#lg-type-wrap', typeWrap);
document.selectors.set('#lg-type-input', input);
const keyboardSlot = document.createElement('div');
document.body.appendChild(keyboardSlot);
hooks.setSlot('split-keyboard', keyboardSlot);

let renderCount = 0;
const originalRender = window.GSHThaiKeyboard.render;
window.GSHThaiKeyboard.render = function (options) {
  renderCount += 1;
  return originalRender(options);
};

hooks.syncKeyboard('listening');
assert.strictEqual(renderCount, 1, 'entering Typed Landscape must render once');
assert.strictEqual(input.readOnly, true);
assert.strictEqual(input.getAttribute('inputmode'), 'none');
const keyboard = hooks.state().listeningKeyboard;
const firstKey = descendants(keyboard).find((node) => node.dataset.code === 'Digit1');

for (let index = 0; index < 12; index += 1) {
  window.requestAnimationFrame(() => hooks.syncKeyboard('listening'));
}
while (animationFrames.length) animationFrames.shift()();
assert.strictEqual(renderCount, 1, 'idle animation-frame syncs must not rebuild the keyboard');
assert.strictEqual(descendants(keyboard).find((node) => node.dataset.code === 'Digit1'), firstKey, 'idle key nodes must retain identity');

click(firstKey);
assert.strictEqual(input.value, 'ๅ', 'base Thai key must update Listening input');
let shift = descendants(keyboard).find((node) => node.textContent === '⇧ Shift');
click(shift);
assert.strictEqual(renderCount, 2, 'Shift state change must render exactly once');
assert.strictEqual(hooks.state().listeningShifted, true);
click(descendants(keyboard).find((node) => node.dataset.code === 'Digit1'));
assert.strictEqual(input.value, 'ๅ+', 'shifted Thai keyboard mapping must update Listening input');
assert.strictEqual(hooks.state().listeningShifted, false, 'Shift must reset after one character');
assert.strictEqual(renderCount, 3, 'one shifted character must render once to reset Shift');
const backspace = descendants(keyboard).find((node) => node.textContent === '⌫ 退格');
click(backspace);
assert.strictEqual(input.value, 'ๅ', 'Backspace must use the current Listening input path');
assert.strictEqual(renderCount, 3, 'Backspace must not rebuild the keyboard');

window.GSHThaiKeyboard.layoutVersion = 'runtime-layout-v2';
hooks.syncKeyboard('listening');
assert.strictEqual(renderCount, 4, 'a genuine keyboard layout change must render once');
hooks.syncKeyboard('listening');
assert.strictEqual(renderCount, 4, 'the changed layout must remain stable after rendering');

typeWrap.style.display = 'none';
hooks.syncKeyboard('listening');
assert.strictEqual(input.readOnly, false, 'leaving Typed mode must restore readOnly');
assert.strictEqual(input.getAttribute('inputmode'), 'text', 'leaving Typed mode must restore inputmode');
assert.strictEqual(hooks.state().listeningKeyboard, null, 'leaving Typed mode must remove the Landscape keyboard');

// Marker lifetime: original-parent rerender invalidates the moved node permanently.
const originalParent = document.createElement('div');
const stageSlot = document.createElement('div');
const oldChild = document.createElement('div');
const newChild = document.createElement('div');
oldChild.id = 'live-child';
newChild.id = 'replacement-child';
document.body.append(originalParent, stageSlot);
originalParent.appendChild(oldChild);
hooks.mountExistingNode(oldChild, stageSlot);
assert.strictEqual(hooks.state().movedCount, 1);
assert.strictEqual(hooks.state().moveOrderLength, 1);
originalParent.replaceChildren(newChild);
hooks.cleanupStaleMovedNodes();
assert.strictEqual(oldChild.isConnected, false, 'stale moved node must be removed from the stage');
assert.deepStrictEqual(originalParent.children, [newChild], 'source rerender content must remain authoritative');
assert.strictEqual(hooks.state().movedCount, 0, 'stale movement record must be removed');
assert.strictEqual(hooks.state().moveOrderLength, 0, 'stale move-order entry must be removed');
hooks.restoreAll();
assert.deepStrictEqual(originalParent.children, [newChild], 'later restoration must not resurrect the stale child');

// A connected marker still supports normal reverse restoration.
const normalParent = document.createElement('div');
const normalStage = document.createElement('div');
const normalChild = document.createElement('div');
document.body.append(normalParent, normalStage);
normalParent.appendChild(normalChild);
hooks.mountExistingNode(normalChild, normalStage);
hooks.restoreAll();
assert.deepStrictEqual(normalParent.children, [normalChild]);
assert.strictEqual(hooks.state().movedCount, 0);
assert.strictEqual(hooks.state().moveOrderLength, 0);

function flushAnimationFrames() {
  while (animationFrames.length) animationFrames.shift()();
}

function runNextTimer() {
  while (timerQueue.length) {
    const timer = timerQueue.shift();
    if (!timer.cancelled) { timer.callback(); return true; }
  }
  return false;
}

function runAllTimers(limit = 30) {
  let count = 0;
  while (runNextTimer()) {
    count += 1;
    assert(count <= limit, 'timer queue must remain bounded');
  }
}

function allNodes(node) {
  return node.childNodes.flatMap((child) => [child, ...allNodes(child)]);
}

function restorationMarkerCount() {
  return allNodes(document.body).filter((node) => node.nodeType === 8 && String(node.data).startsWith('gsh-ml:')).length;
}

function duplicateIds() {
  const ids = allNodes(document.body).filter((node) => node.nodeType === 1 && node.id).map((node) => node.id);
  return ids.filter((id, index) => ids.indexOf(id) !== index);
}

function stableForFrames(label) {
  const before = hooks.state();
  const markersBefore = restorationMarkerCount();
  const observer = FakeMutationObserver.instances[FakeMutationObserver.instances.length - 1];
  if (observer) {
    observer.trigger();
    observer.trigger();
    observer.trigger();
  }
  flushAnimationFrames();
  const afterObserver = hooks.state();
  assert(afterObserver.syncCount - before.syncCount <= 1, `${label}: observer callbacks must coalesce to one sync`);
  assert(afterObserver.observerCallbackCount - before.observerCallbackCount <= 3, `${label}: observer callbacks must stay bounded`);
  const moves = afterObserver.mountMoveCount;
  for (let index = 0; index < 12; index += 1) window.requestAnimationFrame(() => window.GSHMobileLandscape.sync());
  flushAnimationFrames();
  const after = hooks.state();
  assert.strictEqual(after.syncCount - afterObserver.syncCount, 12, `${label}: ten-plus idle frames must produce only requested syncs`);
  assert.strictEqual(after.mountMoveCount, moves, `${label}: idle frames must not move nodes between slots`);
  assert.strictEqual(restorationMarkerCount(), markersBefore, `${label}: restoration marker count must not leak`);
  assert.strictEqual(restorationMarkerCount(), after.movedCount, `${label}: every marker must belong to one live move record`);
  assert.deepStrictEqual(duplicateIds(), [], `${label}: duplicate IDs are forbidden`);
}

function makeButton(id, className) {
  const button = document.createElement('button');
  if (id) button.id = id;
  if (className) button.className = className;
  return button;
}

function makeResultGroups(prefix) {
  const primary = document.createElement('div');
  const utility = document.createElement('div');
  const home = document.createElement('div');
  primary.className = 'gsh-result-actions gsh-result-primary-actions';
  utility.className = 'gsh-result-actions gsh-result-utility-actions';
  home.className = 'gsh-result-actions gsh-result-home-actions';
  primary.id = `${prefix}-primary`;
  utility.id = `${prefix}-utility`;
  home.id = `${prefix}-home`;
  const replay = makeButton(`${prefix}-replay`);
  replay.setAttribute('data-game-result-replay', 'v1');
  primary.appendChild(replay);
  utility.appendChild(makeButton(`${prefix}-detail`));
  home.appendChild(makeButton(`${prefix}-home-button`));
  return { primary, utility, home };
}

function assertExclusive(viewName, gameplayControl, exclusiveControl) {
  const stage = hooks.state().stage;
  const top = stage.querySelector('.gsh-ml-top');
  const play = stage.querySelector('.gsh-ml-play');
  const exclusive = stage.querySelector('.gsh-ml-exclusive');
  assert.strictEqual(stage.getAttribute('data-gsh-ml-view'), viewName);
  assert.strictEqual(top.inert, true);
  assert.strictEqual(play.inert, true);
  assert.strictEqual(top.getAttribute('aria-hidden'), 'true');
  assert.strictEqual(play.getAttribute('aria-hidden'), 'true');
  assert.strictEqual(exclusive.inert, false);
  assert.strictEqual(exclusive.getAttribute('aria-hidden'), null);
  assert.strictEqual(stage.querySelector('[data-gsh-ml-slot="split-keyboard"]').inert, true);
  const pointer = new FakeEvent('pointerdown', { target: gameplayControl });
  hooks.windowPointerGuard(pointer);
  assert.strictEqual(pointer.defaultPrevented, true, `${viewName}: pointer must not reach hidden gameplay`);
  assert.strictEqual(pointer.immediatePropagationStopped, true, `${viewName}: hidden pointer propagation must stop`);
  const enter = new FakeEvent('keydown', { key: 'Enter', target: gameplayControl });
  hooks.windowKeydown(enter);
  assert.strictEqual(enter.defaultPrevented, true, `${viewName}: Enter must not reach hidden gameplay`);
  assert.strictEqual(enter.immediatePropagationStopped, true, `${viewName}: hidden keyboard propagation must stop`);
  if (exclusiveControl) {
    const allowed = new FakeEvent('keydown', { key: 'Enter', target: exclusiveControl });
    hooks.windowKeydown(allowed);
    assert.strictEqual(allowed.defaultPrevented, false, `${viewName}: exclusive control keeps its native key behavior`);
    assert.strictEqual(allowed.immediatePropagationStopped, undefined, `${viewName}: exclusive control keeps its own handlers`);
  }
}

function resetPage(game) {
  if (hooks.state().active) window.GSHMobileLandscape.deactivate();
  document.body.replaceChildren();
  document.selectors.clear();
  document.activeElement = document.body;
  document.body.setAttribute('data-gsh-game', game);
}

// Tone owns one live #tf-body across gameplay, detail and two Result rounds.
resetPage('tone');
const toneCard = document.createElement('section');
const toneControls = document.createElement('div');
const toneGameplayControl = makeButton('tone-gameplay-control');
toneControls.className = 'rg-ctl-wrap';
toneControls.appendChild(toneGameplayControl);
const toneBanner = document.createElement('div');
toneBanner.id = 'tf-banner';
const toneBody = document.createElement('div');
toneBody.id = 'tf-body';
toneCard.append(toneBanner, toneBody);
const toneLevelSource = document.createElement('div');
const toneLevelTabs = document.createElement('div');
toneLevelTabs.id = 'tf-level-tabs';
toneLevelSource.appendChild(toneLevelTabs);
const toneToolSource = document.createElement('div');
const toneToolIds = [
  'tf-howto-btn',
  'tf-alpha-btn',
  'rg-pron-toggle',
  'zh-toggle-slot',
  'tf-vault-btn-slot',
  'tf-guide-toggle',
  'font-toggle-slot',
  'tf-particle-toggle'
];
let toneToolClicks = 0;
const toneTools = toneToolIds.map((id) => {
  const tool = makeButton(id);
  tool.addEventListener('click', () => { toneToolClicks += 1; });
  toneToolSource.appendChild(tool);
  return tool;
});
document.body.append(toneControls, toneLevelSource, toneToolSource, toneCard);

function toneQuestion(id) {
  const options = document.createElement('div');
  options.className = 'tf-options';
  options.id = id;
  for (let index = 0; index < 6; index += 1) options.appendChild(makeButton(`${id}-${index}`));
  return options;
}

toneBody.appendChild(toneQuestion('tone-q1'));
window.GSHMobileLandscape.activate();
const toneToolsDropdown = hooks.state().stage.querySelector('[data-gsh-dropdown="tools"]');
const toneToolsPanel = toneToolsDropdown && toneToolsDropdown.querySelector('.gsh-ml-dropdown-panel');
assert(toneToolsPanel, 'Tone Tools dropdown must exist');
assert.strictEqual(toneToolsPanel.children.length, toneTools.length, 'Tone Tools must expose every existing live control');
toneTools.forEach((tool, index) => {
  assert.strictEqual(toneToolsPanel.children[index], tool, `Tone Tool ${toneToolIds[index]} must retain live-node identity and order`);
});
assert.deepStrictEqual(
  toneTools.map((tool) => tool.getAttribute('data-gsh-ml-tool-label')),
  ['玩法', '字母練習區', '讀音', '翻譯', '單字庫', '提示', '字體', '禮貌詞'],
  'Tone Tools must expose the locked helper/display labels'
);
toneTools.forEach((tool) => tool.click());
assert.strictEqual(toneToolClicks, toneTools.length, 'every live Tone Tools control must preserve its original click handler');
stableForFrames('Tone normal question');
toneBody.replaceChildren(toneQuestion('tone-q2'));
window.GSHMobileLandscape.sync();
stableForFrames('Tone next question');

let toneGroups = makeResultGroups('tone-r1');
toneBody.replaceChildren(toneGroups.primary, toneGroups.utility, toneGroups.home);
window.GameFlow.markResult(toneBody);
toneGameplayControl.focus();
window.GSHMobileLandscape.sync();
assert.strictEqual(document.activeElement, document.body, 'Tone Result must clear focus from hidden gameplay');
assertExclusive('result', toneGameplayControl, toneGroups.primary.children[0]);
stableForFrames('Tone Result');

const detail = document.createElement('div');
detail.id = 'tone-mistake-review';
toneBody.replaceChildren(detail);
window.GSHMobileLandscape.sync();
assert.strictEqual(hooks.state().activeResultRoot, toneBody, 'Tone mistake detail remains an active Result');
stableForFrames('Tone mistake detail');

toneGroups = makeResultGroups('tone-r1-back');
toneBody.replaceChildren(toneGroups.primary, toneGroups.utility, toneGroups.home);
window.GSHMobileLandscape.sync();
stableForFrames('Tone back to Result');

window.GameFlow.unmarkResult(toneBody);
toneBody.replaceChildren(toneQuestion('tone-q3'));
window.GSHMobileLandscape.sync();
assert.strictEqual(hooks.state().stage.getAttribute('data-gsh-ml-view'), 'gameplay', 'Tone replay must close Result');
assert.strictEqual(hooks.state().stage.querySelector('.gsh-ml-top').inert, false);
assert.strictEqual(hooks.state().stage.querySelector('.gsh-ml-exclusive').inert, true);
assert.strictEqual(document.querySelectorAll('#tf-body').length, 1);
assert.strictEqual(document.querySelectorAll('.tf-options').length, 1);
stableForFrames('Tone replay normal question');

toneGroups = makeResultGroups('tone-r2');
let toneRoundTwoActions = 0;
[toneGroups.primary, toneGroups.utility, toneGroups.home].forEach((group) => {
  group.children[0].addEventListener('click', () => { toneRoundTwoActions += 1; });
});
toneBody.replaceChildren(toneGroups.primary, toneGroups.utility, toneGroups.home);
window.GameFlow.markResult(toneBody);
window.GSHMobileLandscape.sync();
stableForFrames('Tone second Result');
assert.strictEqual(document.querySelectorAll('#tf-body').length, 1);
assert.strictEqual(document.querySelectorAll('.gsh-result-primary-actions').length, 1);
assert.strictEqual(document.querySelectorAll('.gsh-result-utility-actions').length, 1);
assert.strictEqual(document.querySelectorAll('.gsh-result-home-actions').length, 1);
[toneGroups.primary, toneGroups.utility, toneGroups.home].forEach((group) => group.children[0].click());
assert.strictEqual(toneRoundTwoActions, 3, 'all Tone Result actions must work in round two');
window.GSHMobileLandscape.deactivate();
assert.strictEqual(toneToolSource.children.length, toneTools.length, 'Portrait/Desktop must restore every Tone Tool');
toneTools.forEach((tool, index) => {
  assert(toneToolSource.children[index] === tool, `Portrait/Desktop must restore ${toneToolIds[index]} in exact source order`);
});
toneTools.forEach((tool) => assert.strictEqual(tool.getAttribute('data-gsh-ml-tool-label'), null, 'Landscape-only tool labels must be removed on exit'));

// Reading exposes every existing helper/display control, keeps choices in their side columns and restores live DOM.
resetPage('reading');
const readingControls = document.createElement('div');
readingControls.className = 'rg-ctl-wrap';
const readingFullscreen = makeButton('reading-fullscreen', 'rg-ctl-fab');
readingFullscreen.setAttribute('aria-pressed', 'false');
readingControls.appendChild(readingFullscreen);
const readingLevelSource = document.createElement('div');
const readingLevels = document.createElement('div');
readingLevels.className = 'gsh-level-selector';
readingLevelSource.appendChild(readingLevels);
const readingProfile = document.createElement('div');
const readingHowto = makeButton('rg-howto-btn');
readingProfile.appendChild(readingHowto);
const readingQuestionSource = document.createElement('div');
const readingWordArea = document.createElement('div');
readingWordArea.className = 'word-area';
const readingToolRow = document.createElement('div');
readingToolRow.id = 'word-ctl-row';
const readingToolIds = [
  'rg-sound-toggle', 'rg-pron-toggle', 'rg-en-toggle', 'zh-toggle-slot',
  'rg-vault-btn-slot', 'rg-guide-toggle', 'font-toggle-slot', 'rg-particle-toggle'
];
const readingDisplayTools = readingToolIds.map((id) => {
  const tool = makeButton(id);
  readingToolRow.appendChild(tool);
  return tool;
});
readingWordArea.appendChild(readingToolRow);
const readingSyllables = document.createElement('div');
readingSyllables.id = 'syl-strip';
const readingSlots = document.createElement('div');
readingSlots.id = 'slot-row';
const readingSlotBoxes = ['cons', 'vowel', 'final', 'tone'].map((id) => makeButton('sb-' + id));
readingSlotBoxes.forEach((box) => readingSlots.appendChild(box));
readingQuestionSource.append(readingWordArea, readingSyllables, readingSlots);
const readingPoolSource = document.createElement('div');
const readingPool = document.createElement('div');
readingPool.id = 'pool';
const readingChoices = Array.from({ length: 10 }, (_, index) => {
  const choice = makeButton('reading-choice-' + index, 'opt');
  readingPool.appendChild(choice);
  return choice;
});
readingPoolSource.appendChild(readingPool);
const readingActionSource = document.createElement('div');
const readingRemember = makeButton('btn-remember');
const readingCheck = makeButton('btn-check');
readingCheck.disabled = true;
const readingMainNext = makeButton('btn-next');
const readingMainNextSyl = makeButton('btn-next-syl');
readingActionSource.append(readingRemember, readingCheck, readingMainNext, readingMainNextSyl);
let readingToolClicks = 0;
let readingChoiceClicks = 0;
let readingSlotClicks = 0;
let readingActionClicks = 0;
[readingHowto, readingRemember, ...readingDisplayTools].forEach((control) => control.addEventListener('click', () => { readingToolClicks += 1; }));
readingChoices.forEach((control) => control.addEventListener('click', () => { readingChoiceClicks += 1; }));
readingSlotBoxes.forEach((control) => control.addEventListener('click', () => { readingSlotClicks += 1; }));
[readingMainNext, readingMainNextSyl].forEach((control) => control.addEventListener('click', () => { readingActionClicks += 1; }));
document.body.append(
  readingControls, readingLevelSource, readingProfile, readingQuestionSource,
  readingPoolSource, readingActionSource
);
window.GSHMobileLandscape.activate();
const readingStage = hooks.state().stage;
const readingToolsPanel = readingStage.querySelector('[data-gsh-dropdown="tools"] .gsh-ml-dropdown-panel');
const expectedReadingTools = [readingHowto, readingRemember, ...readingDisplayTools];
assert.deepStrictEqual(readingToolsPanel.children, expectedReadingTools, 'Reading Tools must own every existing helper/display control in locked order');
assert.deepStrictEqual(
  expectedReadingTools.map((tool) => tool.getAttribute('data-gsh-ml-tool-label')),
  ['玩法', '已記得', '發音', '讀音', '英文讀音', '翻譯', '單字庫', '提示', '字體', '禮貌詞'],
  'Reading Tools labels must describe the existing live controls'
);
assert.strictEqual(readingStage.querySelector('[data-gsh-ml-slot="question"]').contains(readingWordArea), true);
assert.strictEqual(readingStage.querySelector('[data-gsh-ml-slot="question"]').contains(readingSlots), true);
assert.strictEqual(readingStage.querySelector('[data-gsh-ml-slot="split-content"]').contains(readingPool), true);
assert.strictEqual(readingPool.dataset.gshMaxSideCount, '5', 'Reading live maximum must use five no-scroll rows per side');
readingChoices.forEach((choice, index) => {
  const expectedSide = index < 5 ? 'left' : 'right';
  assert.strictEqual(choice.dataset.gshSide, expectedSide, `Reading choice ${index} must stay in its side column`);
  assert.strictEqual(choice.dataset.gshSideIndex, String(index % 5), `Reading choice ${index} must use an in-column row`);
  assert.strictEqual(choice.dataset.gshSideCount, '5');
});
assert.strictEqual(readingStage.querySelector('[data-gsh-ml-slot="main-action"]').children.length, 3, 'Reading main-action geometry must retain Check, Next and Next Syllable including disabled Check');
assert.strictEqual(readingCheck.disabled, true, 'moving disabled Check must preserve state');
expectedReadingTools.forEach(click);
readingChoices.forEach(click);
readingSlotBoxes.forEach(click);
[readingMainNext, readingMainNextSyl].forEach(click);
assert.strictEqual(readingToolClicks, expectedReadingTools.length, 'every visible Reading Tool must retain its click handler');
assert.strictEqual(readingChoiceClicks, readingChoices.length, 'every Reading choice must retain its click handler');
assert.strictEqual(readingSlotClicks, readingSlotBoxes.length, 'every Reading answer target must retain its click handler');
assert.strictEqual(readingActionClicks, 2, 'every enabled Reading main action must retain its click handler');
assert.strictEqual(readingStage.querySelector('[data-gsh-ml-slot="shared-controls"] button.rg-ctl-fab[aria-pressed]'), readingFullscreen, 'Reading Full Screen must retain the scoped Mobile Landscape hide selector');
stableForFrames('Reading gameplay');
window.GSHMobileLandscape.deactivate();
assert.deepStrictEqual(readingToolRow.children, readingDisplayTools, 'Portrait/Desktop must restore Reading display controls in exact order');
assert.deepStrictEqual(readingActionSource.children, [readingRemember, readingCheck, readingMainNext, readingMainNextSyl], 'Portrait/Desktop must restore Reading actions in exact order');
assert.strictEqual(readingPool.parentNode, readingPoolSource, 'Portrait/Desktop must restore the same Reading pool');
assert.strictEqual(readingPool.dataset.gshMaxSideCount, undefined, 'Portrait/Desktop must clear Reading row metadata');
readingChoices.forEach((choice) => assert.strictEqual(choice.dataset.gshSide, undefined));
expectedReadingTools.forEach((tool) => assert.strictEqual(tool.getAttribute('data-gsh-ml-tool-label'), null));
assert.deepStrictEqual(duplicateIds(), [], 'Reading Portrait/Desktop restoration must not duplicate IDs');
assert.strictEqual(restorationMarkerCount(), 0, 'Reading Portrait/Desktop restoration must not leak markers');

// Typing moves the existing live Tools row, preserves Kedmanee order and restores every policy on exit.
resetPage('typing');
const typingControls = document.createElement('div');
typingControls.className = 'rg-ctl-wrap';
const typingMenu = makeButton('typing-game-menu', 'rg-ctl-fab');
const typingFullscreen = makeButton('typing-fullscreen', 'rg-ctl-fab');
typingFullscreen.setAttribute('aria-pressed', 'false');
typingControls.append(typingMenu, typingFullscreen);

const typingLevelSource = document.createElement('div');
const typingLevels = document.createElement('div');
typingLevels.className = 'gsh-level-selector';
let typingLevelClicks = 0;
['initial', 'middle', 'high'].forEach((id) => {
  const button = makeButton('typing-level-' + id);
  button.addEventListener('click', () => { typingLevelClicks += 1; });
  typingLevels.appendChild(button);
});
typingLevelSource.appendChild(typingLevels);

const typingProfile = document.createElement('div');
const typingHowto = makeButton('rg-howto-btn');
typingProfile.appendChild(typingHowto);
const typingQuestionSource = document.createElement('div');
const typingWordArea = document.createElement('div');
typingWordArea.className = 'word-area';
const typingWord = document.createElement('div');
typingWord.id = 'wth';
const typingToolRow = document.createElement('div');
typingToolRow.id = 'word-ctl-row';
const typingToolIds = [
  'rg-sound-toggle', 'rg-pron-toggle', 'rg-en-toggle', 'zh-toggle-slot',
  'rg-vault-btn-slot', 'guide-toggle', 'rg-webkbd-toggle', 'font-toggle-slot', 'rg-particle-toggle'
];
let typingToolClicks = 0;
const typingWordTools = typingToolIds.map((id) => {
  const tool = makeButton(id);
  tool.addEventListener('click', () => { typingToolClicks += 1; });
  typingToolRow.appendChild(tool);
  return tool;
});
typingWordArea.append(typingWord, typingToolRow);
const typingSlots = document.createElement('div');
typingSlots.id = 'slot-row';
typingQuestionSource.append(typingWordArea, typingSlots);

const typingInputSource = document.createElement('div');
const typingTypeWrap = document.createElement('div');
typingTypeWrap.id = 'rg-type-wrap';
const typingInput = document.createElement('input');
typingInput.id = 'rg-mobile-input';
typingInput.setAttribute('inputmode', 'text');
typingTypeWrap.appendChild(typingInput);
typingInputSource.appendChild(typingTypeWrap);

const typingKeyboardSource = document.createElement('div');
const typingKeyboard = document.createElement('div');
typingKeyboard.id = 'rg-kbd';
let typingShifted = false;
let typingValue = '';
function renderTypingKeyboard() {
  window.GSHThaiKeyboard.render({
    root: typingKeyboard,
    split: true,
    shifted: typingShifted,
    onCode(code) {
      const map = typingShifted ? window.GSHThaiKeyboard.shiftMap : window.GSHThaiKeyboard.baseMap;
      typingValue += map[code] || '';
      if (typingShifted) { typingShifted = false; renderTypingKeyboard(); }
    },
    onShift() { typingShifted = !typingShifted; renderTypingKeyboard(); },
    onBackspace() { typingValue = typingValue.slice(0, -1); }
  });
}
renderTypingKeyboard();
typingKeyboardSource.appendChild(typingKeyboard);

const typingActionSource = document.createElement('div');
const typingRemember = makeButton('btn-remember');
const typingCheck = makeButton('btn-check');
const typingNext = makeButton('btn-next');
let typingActionClicks = 0;
[typingHowto, typingRemember, typingCheck, typingNext].forEach((button) => {
  button.addEventListener('click', () => { typingActionClicks += 1; });
});
typingActionSource.append(typingRemember, typingCheck, typingNext);
document.body.append(
  typingControls, typingLevelSource, typingProfile, typingQuestionSource,
  typingInputSource, typingKeyboardSource, typingActionSource
);

window.GSHMobileLandscape.activate();
const typingStage = hooks.state().stage;
const typingLevelDropdown = typingStage.querySelector('[data-gsh-dropdown="level"]');
const typingToolsDropdown = typingStage.querySelector('[data-gsh-dropdown="tools"]');
const typingToolsPanel = typingToolsDropdown.querySelector('.gsh-ml-dropdown-panel');
assert.deepStrictEqual(typingLevelDropdown.querySelector('.gsh-ml-dropdown-panel').children, [typingLevels], 'Typing Level must own the existing live selector');
assert.deepStrictEqual(typingToolsPanel.children, [typingHowto, typingRemember, typingToolRow], 'Typing Tools must own How-to, Remember and the complete live Tool row');
assert.strictEqual(typingToolRow.children.length, typingToolIds.length, 'Typing Tools must not clone or extract children from #word-ctl-row');
assert.strictEqual(document.querySelectorAll('#word-ctl-row').length, 1, 'Typing must keep one live #word-ctl-row');
assert.strictEqual(typingStage.querySelector('[data-gsh-ml-slot="question"]').contains(typingRemember), false, 'Remember must not remain in center gameplay');
assert.strictEqual(typingStage.querySelector('[data-gsh-ml-slot="question"]').contains(typingToolRow), false, 'Tool row must not remain in center gameplay');
assert.strictEqual(typingStage.querySelector('[data-gsh-ml-slot="shared-controls"] button.rg-ctl-fab[aria-pressed]'), typingFullscreen, 'Full Screen must retain the stable semantic selector used by Mobile Landscape CSS');
const typingWebKeyboard = document.getElementById('rg-webkbd-toggle');
assert.strictEqual(typingWebKeyboard.disabled, true, 'Typing web-keyboard toggle must be disabled in Mobile Landscape');
assert.strictEqual(typingWebKeyboard.getAttribute('data-gsh-ml-keyboard-toggle'), 'disabled', 'Typing web-keyboard toggle must be hidden by its scoped marker');
assert.strictEqual(typingInput.readOnly, true, 'Typing native input must be read-only in Mobile Landscape');
assert.strictEqual(typingInput.getAttribute('inputmode'), 'none', 'Typing native input must suppress the native keyboard');

click(typingLevelDropdown.querySelector('.gsh-ml-dropdown-trigger'));
typingLevels.children.forEach(click);
click(typingToolsDropdown.querySelector('.gsh-ml-dropdown-trigger'));
click(typingHowto);
click(typingRemember);
typingWordTools.filter((tool) => tool !== typingWebKeyboard && !tool.disabled).forEach(click);
click(typingCheck);
click(typingNext);
assert.strictEqual(typingLevelClicks, 3, 'every Typing Level control must remain clickable');
assert.strictEqual(typingToolClicks, typingWordTools.length - 1, 'every visible enabled Typing Tool must remain clickable');
assert.strictEqual(typingActionClicks, 4, 'How-to, Remember and both Typing main actions must retain handlers');

const typingRows = typingKeyboard.children.slice(0, 4);
typingRows.forEach((row, rowIndex) => {
  const codes = row.children.flatMap((half) => half.children.map((key) => key.dataset.code));
  assert.deepStrictEqual(codes, Array.from(window.GSHThaiKeyboard.codeRows[rowIndex]), `Typing Kedmanee row ${rowIndex + 1} must keep normal order split only at its midpoint`);
});
click(descendants(typingKeyboard).find((node) => node.dataset.code === 'Digit1'));
click(descendants(typingKeyboard).find((node) => node.textContent === '⇧ Shift'));
click(descendants(typingKeyboard).find((node) => node.dataset.code === 'Digit1'));
assert.strictEqual(typingValue, 'ๅ+', 'Typing Shift must apply to exactly one Thai character');
assert.strictEqual(typingShifted, false, 'Typing Shift must reset after one character');
click(descendants(typingKeyboard).find((node) => node.textContent === '⌫ 退格'));
assert.strictEqual(typingValue, 'ๅ', 'Typing Backspace must remove the latest character');
stableForFrames('Typing gameplay');

window.GSHMobileLandscape.deactivate();
assert.strictEqual(typingInput.readOnly, false, 'Portrait/Desktop must restore Typing readOnly');
assert.strictEqual(typingInput.getAttribute('inputmode'), 'text', 'Portrait/Desktop must restore Typing inputmode');
assert.strictEqual(typingWebKeyboard.disabled, false, 'Portrait/Desktop must restore the web-keyboard toggle');
assert.strictEqual(typingWebKeyboard.getAttribute('data-gsh-ml-keyboard-toggle'), null, 'Portrait/Desktop must clear the keyboard marker');
assert.deepStrictEqual(typingWordArea.children, [typingWord, typingToolRow], 'Portrait/Desktop must restore #word-ctl-row to the original word area');
assert.deepStrictEqual(typingActionSource.children, [typingRemember, typingCheck, typingNext], 'Portrait/Desktop must restore Typing actions in exact order');
assert.strictEqual(typingKeyboard.parentNode, typingKeyboardSource, 'Portrait/Desktop must restore the same Typing keyboard root');
assert.deepStrictEqual(duplicateIds(), [], 'Typing Portrait/Desktop restoration must not duplicate IDs');
assert.strictEqual(restorationMarkerCount(), 0, 'Typing Portrait/Desktop restoration must not leak markers');

// Shared countdown keeps the same live controls and timer across two rotations.
resetPage('reading');
const readingWord = document.createElement('div');
readingWord.className = 'word-area';
const readingParent = document.createElement('div');
const readingNext = makeButton('btn-next');
readingParent.appendChild(readingNext);
document.body.append(readingWord, readingParent);
window.GSHMobileLandscape.activate();
assert.strictEqual(window.GameFlow.start({ key: 'reading-rotation', nextButton: readingNext, delaySeconds: 5 }), true);
const countdown = document.querySelector('[data-game-flow-status="reading-rotation"]');
const pause = document.querySelector('[data-game-flow-pause="reading-rotation"]');
assert.strictEqual(countdown.textContent, '5');
runNextTimer();
assert.strictEqual(countdown.textContent, '4');
window.GSHMobileLandscape.deactivate();
assert.deepStrictEqual(readingParent.children.slice(-3), [countdown, readingNext, pause]);
assert.strictEqual(countdown.textContent, '4');
window.GSHMobileLandscape.activate();
assert.strictEqual(document.querySelector('[data-game-flow-status="reading-rotation"]'), countdown);
assert.strictEqual(document.querySelector('[data-game-flow-pause="reading-rotation"]'), pause);
runAllTimers();
assert.strictEqual(readingNext.clicks, 1, 'rotated countdown must advance exactly once');

assert.strictEqual(window.GameFlow.start({ key: 'reading-rotation', nextButton: readingNext, delaySeconds: 5 }), true);
pause.click();
const clicksBeforePausedRotation = readingNext.clicks;
assert.match(countdown.textContent, /已暫停/);
window.GSHMobileLandscape.deactivate();
window.GSHMobileLandscape.activate();
assert.strictEqual(document.querySelector('[data-game-flow-status="reading-rotation"]'), countdown);
assert.match(countdown.textContent, /已暫停/, 'pause state must survive Portrait and Landscape');
runAllTimers();
assert.strictEqual(readingNext.clicks, clicksBeforePausedRotation, 'paused rotation must not auto-advance');

// Shared Result action groups restore on exit and remain live in round two.
const sharedResultParent = document.createElement('div');
const sharedResult = document.createElement('section');
sharedResult.id = 'shared-result';
sharedResultParent.appendChild(sharedResult);
document.body.appendChild(sharedResultParent);
const sharedGroups = makeResultGroups('shared');
sharedResult.append(sharedGroups.primary, sharedGroups.utility, sharedGroups.home);
let sharedActionClicks = 0;
[sharedGroups.primary, sharedGroups.utility, sharedGroups.home].forEach((group) => {
  group.children[0].addEventListener('click', () => { sharedActionClicks += 1; });
});
window.GameFlow.markResult(sharedResult);
window.GSHMobileLandscape.sync();
stableForFrames('shared Result');
sharedResult.style.display = 'none';
window.GSHMobileLandscape.sync();
assert.strictEqual(sharedResult.parentNode, sharedResultParent, 'Result root must restore before gameplay resumes');
assert.deepStrictEqual(sharedResult.children, [sharedGroups.primary, sharedGroups.utility, sharedGroups.home]);
assert.strictEqual(sharedResult.getAttribute('data-shared-result-active'), null);
sharedResult.style.display = 'flex';
window.GameFlow.markResult(sharedResult);
window.GSHMobileLandscape.sync();
stableForFrames('shared second Result');
const resultEnter = new FakeEvent('keydown', { key: 'Enter', target: document.body });
hooks.windowKeydown(resultEnter);
assert.strictEqual(resultEnter.defaultPrevented, true, 'Result Enter must be consumed by the exclusive replay action');
assert.strictEqual(sharedActionClicks, 1, 'Result Enter must trigger replay without reaching gameplay');
[sharedGroups.primary, sharedGroups.utility, sharedGroups.home].forEach((group) => group.children[0].click());
assert.strictEqual(sharedActionClicks, 4, 'all shared Result actions must work in round two');
assert.strictEqual(document.querySelectorAll('.gsh-result-primary-actions').length, 1);
assert.strictEqual(document.querySelectorAll('.gsh-result-utility-actions').length, 1);
assert.strictEqual(document.querySelectorAll('.gsh-result-home-actions').length, 1);

// Resume is truly exclusive and returns inert ownership to gameplay on exit.
sharedResult.style.display = 'none';
window.GSHMobileLandscape.sync();
const resume = document.createElement('div');
resume.id = 'rg-resume-banner';
const resumeButton = makeButton('resume-action');
resume.appendChild(resumeButton);
document.body.appendChild(resume);
window.GSHMobileLandscape.sync();
assertExclusive('resume', readingNext, resumeButton);
stableForFrames('Resume');
resume.style.display = 'none';
window.GSHMobileLandscape.sync();
assert.strictEqual(hooks.state().stage.getAttribute('data-gsh-ml-view'), 'gameplay');
assert.strictEqual(hooks.state().stage.querySelector('.gsh-ml-play').inert, false);

// Lego Custom Input is exclusive, keyboard-disabled and stable.
resetPage('lego');
const legoBase = document.createElement('div');
legoBase.id = 'baseplate';
const legoGameplay = makeButton('lego-gameplay');
legoBase.appendChild(legoGameplay);
const legoCustom = document.createElement('div');
legoCustom.className = 'opt-custom';
const legoInput = document.createElement('input');
legoCustom.appendChild(legoInput);
document.body.append(legoBase, legoCustom);
legoInput.focus();
window.GSHMobileLandscape.activate();
assertExclusive('custom-input', legoGameplay, legoInput);
stableForFrames('Lego Custom Input');
legoInput.blur();
window.GSHMobileLandscape.sync();
assert.strictEqual(hooks.state().stage.getAttribute('data-gsh-ml-view'), 'gameplay');
assert.strictEqual(legoCustom.parentNode, document.body, 'Lego Custom Input must restore to its source marker');
window.GSHMobileLandscape.deactivate();
assert.strictEqual(restorationMarkerCount(), 0, 'Landscape teardown must leave no restoration markers');

// Separate Result Detail roots stay exclusive, restore through rotation and return to the same live Result.
[
  { game: 'reading', resultId: 'end', detailId: 'rg-mistakes' },
  { game: 'listening', resultId: 'lg-end', detailId: 'lg-mistakes' },
  { game: 'typing', resultId: 'end', detailId: 'tg-mistakes-panel' },
  { game: 'lego', resultId: 'lego-result', detailId: 'lego-result-detail' }
].forEach(({ game, resultId, detailId }) => {
  resetPage(game);
  const source = document.createElement('div');
  const result = document.createElement('section');
  const detail = document.createElement('section');
  result.id = resultId;
  detail.id = detailId;
  detail.style.display = 'none';
  const groups = makeResultGroups(`${game}-detail`);
  result.append(groups.primary, groups.utility, groups.home);
  source.append(result, detail);
  document.body.appendChild(source);
  window.GSHMobileLandscape.activate();
  window.GameFlow.markResult(result);
  window.GSHMobileLandscape.sync();
  assert.strictEqual(hooks.state().stage.getAttribute('data-gsh-ml-view'), 'result');

  window.GameFlow.markResultDetail(result, detail);
  result.style.display = 'none';
  detail.style.display = 'flex';
  window.GSHMobileLandscape.sync();
  assertExclusive('result-detail', result, detail.querySelector('button'));
  assert.strictEqual(hooks.state().activeResultRoot, result, `${game}: Result owner must remain active behind Detail`);
  assert.strictEqual(hooks.state().activeResultDetailRoot, detail, `${game}: live Detail root must be tracked`);
  assert.strictEqual(detail.parentNode, hooks.state().stage.querySelector('[data-gsh-ml-slot="exclusive-center"]'));
  assert.strictEqual(result.parentNode, source, `${game}: Result root must restore while Detail owns the exclusive center`);
  assert.deepStrictEqual(result.children, [groups.primary, groups.utility, groups.home], `${game}: action groups must restore into Result before Detail`);
  stableForFrames(`${game} Result Detail`);

  window.GSHMobileLandscape.deactivate();
  assert.strictEqual(detail.parentNode, source, `${game}: Portrait must restore the same Detail root`);
  assert.strictEqual(result.parentNode, source, `${game}: Portrait must restore the same Result root`);
  assert.strictEqual(detail.getAttribute('data-shared-result-detail-active'), 'true', `${game}: rotation must preserve Detail activity`);
  assert.strictEqual(restorationMarkerCount(), 0, `${game}: Portrait rotation must clear movement markers`);
  window.GSHMobileLandscape.activate();
  assert.strictEqual(hooks.state().stage.getAttribute('data-gsh-ml-view'), 'result-detail', `${game}: Landscape must re-enter Detail`);
  assert.strictEqual(hooks.state().activeResultDetailRoot, detail, `${game}: rotation must retain live Detail identity`);

  window.GameFlow.unmarkResultDetail(result, detail);
  detail.style.display = 'none';
  result.style.display = 'flex';
  window.GSHMobileLandscape.sync();
  assert.strictEqual(detail.parentNode, source, `${game}: Back must restore Detail to its exact marker`);
  assert.strictEqual(hooks.state().stage.getAttribute('data-gsh-ml-view'), 'result', `${game}: Back must re-enter Result exclusivity`);
  assert.strictEqual(document.querySelectorAll('.gsh-result-primary-actions').length, 1);
  assert.strictEqual(document.querySelectorAll('.gsh-result-utility-actions').length, 1);
  assert.strictEqual(document.querySelectorAll('.gsh-result-home-actions').length, 1);

  result.style.display = 'none';
  window.GSHMobileLandscape.sync();
  assert.strictEqual(hooks.state().stage.getAttribute('data-gsh-ml-view'), 'gameplay', `${game}: Replay/new round must exit Result Detail lifecycle`);
  assert.strictEqual(result.getAttribute('data-shared-result-active'), null);
  assert.strictEqual(result.getAttribute('data-shared-result-detail-owner'), null);
  assert.strictEqual(detail.getAttribute('data-shared-result-detail-active'), null);
  window.GSHMobileLandscape.deactivate();
  assert.strictEqual(restorationMarkerCount(), 0, `${game}: lifecycle exit must not leak markers`);
});

resetPage('reading');
const teardownSource = document.createElement('div');
const teardownResult = document.createElement('section');
const teardownDetail = document.createElement('section');
teardownResult.id = 'end';
teardownDetail.id = 'rg-mistakes';
teardownSource.append(teardownResult, teardownDetail);
document.body.appendChild(teardownSource);
window.GSHMobileLandscape.activate();
window.GameFlow.markResultDetail(teardownResult, teardownDetail);
teardownResult.style.display = 'none';
teardownDetail.style.display = 'flex';
window.GSHMobileLandscape.sync();
window.GSHMobileLandscape.destroy();
assert.strictEqual(teardownResult.parentNode, teardownSource, 'page teardown must restore Result root');
assert.strictEqual(teardownDetail.parentNode, teardownSource, 'page teardown must restore Detail root first');
assert.strictEqual(teardownResult.getAttribute('data-shared-result-active'), null, 'page teardown must clear Result activity');
assert.strictEqual(teardownResult.getAttribute('data-shared-result-detail-owner'), null, 'page teardown must clear Result-detail ownership');
assert.strictEqual(teardownDetail.getAttribute('data-shared-result-detail-active'), null, 'page teardown must clear Detail activity');
assert.strictEqual(restorationMarkerCount(), 0, 'page teardown must not leak markers');

console.log('PASS Mobile Landscape runtime lifecycle: keyboard stability, marker cleanup, Tone/shared two-round Result, separate Result Detail rotation, action restoration, countdown rotation, exclusive inertness and observer stability');
