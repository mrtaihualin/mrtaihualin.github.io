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
  }
  preventDefault() { this.defaultPrevented = true; }
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
    this.value = '';
    this.textContent = '';
    this._innerHTML = '';
  }
  get children() { return this.childNodes.filter((node) => node.nodeType === 1); }
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
  }
  append(...nodes) { nodes.forEach((node) => this.appendChild(node)); }
  appendChild(node) {
    if (node.parentNode) node.parentNode._detach(node);
    node.parentNode = this;
    this.childNodes.push(node);
    return node;
  }
  insertBefore(node, reference) {
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
  remove() { if (this.parentNode) this.parentNode._detach(this); }
  contains(node) {
    for (let current = node; current; current = current.parentNode) if (current === this) return true;
    return false;
  }
  addEventListener(type, listener) { (this.listeners[type] ||= []).push(listener); }
  removeEventListener(type, listener) {
    this.listeners[type] = (this.listeners[type] || []).filter((item) => item !== listener);
  }
  dispatchEvent(event) {
    if (!event.target) event.target = this;
    (this.listeners[event.type] || []).slice().forEach((listener) => listener.call(this, event));
    if (event.bubbles && this.parentNode) this.parentNode.dispatchEvent(event);
    return !event.defaultPrevented;
  }
  focus() { this.ownerDocument.activeElement = this; }
  blur() { if (this.ownerDocument.activeElement === this) this.ownerDocument.activeElement = this.ownerDocument.body; }
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
  querySelector(selector) { return this.selectors.get(selector) || null; }
  querySelectorAll(selector) {
    const value = this.selectors.get(selector);
    if (!value) return [];
    return Array.isArray(value) ? value : [value];
  }
  getElementById(id) { return this.querySelector('#' + id); }
  addEventListener(type, listener) { (this.listeners[type] ||= []).push(listener); }
  removeEventListener(type, listener) {
    this.listeners[type] = (this.listeners[type] || []).filter((item) => item !== listener);
  }
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
const window = {
  __GSH_ML_TEST__: true,
  document,
  innerWidth: 740,
  innerHeight: 360,
  matchMedia() { return { matches: false, addEventListener() {}, removeEventListener() {} }; },
  requestAnimationFrame(callback) { animationFrames.push(callback); return animationFrames.length; },
  addEventListener() {},
  removeEventListener() {},
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
  MutationObserver: class { observe() {} disconnect() {} },
  Map,
  Math,
  Number,
  Object,
  String,
  Array
});
vm.runInContext(fs.readFileSync(path.join(root, 'js/games/thai-keyboard.js'), 'utf8'), context);
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

console.log('PASS Mobile Landscape runtime lifecycle: idle Listening keyboard stability, input controls, stale-marker cleanup and reverse restoration');
