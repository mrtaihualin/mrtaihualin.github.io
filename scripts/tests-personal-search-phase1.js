#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const search = require('../js/score/personal-search.js');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'vault.html'), 'utf8');
const ui = fs.readFileSync(path.join(root, 'js/score/personal-content.js'), 'utf8');
let passed = 0;
function test(label, fn) {
  try { fn(); passed++; console.log('✓ ' + label); }
  catch (error) { console.error('✗ ' + label + ': ' + error.message); process.exitCode = 1; }
}

const labels = { 'reading-game': '拼讀練習室', 'word-order': '語序練習室' };
const items = [
  { th: 'สวัสดี', readingTH: 'สะ-หวัด-ดี', en: 'sawatdee', zh: '你好', provenance: [{ source: 'reading-game' }] },
  { th: 'ฉันกินข้าว', en: 'chan kin khao', zh: '我吃飯', provenance: [{ source: 'word-order' }] }
];

test('Personal Search is loaded before the personal-content UI', () => {
  assert.match(html, /personal-search\.js\?v=1[\s\S]*personal-content\.js\?v=2/);
});
test('search control only belongs to the authenticated render path', () => {
  const guestEnd = ui.indexOf('function renderLimit');
  assert.doesNotMatch(ui.slice(ui.indexOf('function renderGuest'), guestEnd), /searchControls/);
  assert.match(ui.slice(ui.indexOf('function renderAccount')), /searchControls\(update\)/);
});
test('Thai, Chinese and romanization fields are searchable', () => {
  assert.strictEqual(search.filter(items, 'สวัสดี', labels).length, 1);
  assert.strictEqual(search.filter(items, '吃飯', labels).length, 1);
  assert.strictEqual(search.filter(items, 'SAWATDEE', labels).length, 1);
});
test('reading field and source label are searchable', () => {
  assert.strictEqual(search.filter(items, 'สะ-หวัด', labels).length, 1);
  assert.strictEqual(search.filter(items, '語序練習室', labels)[0].th, 'ฉันกินข้าว');
});
test('multiple terms must match the same personal item', () => {
  assert.strictEqual(search.filter(items, 'chan 吃飯', labels).length, 1);
  assert.strictEqual(search.filter(items, 'chan 你好', labels).length, 0);
});
test('empty query safely returns a copy of the current tab data', () => {
  const result = search.filter(items, '   ', labels);
  assert.deepStrictEqual(result, items);
  assert.notStrictEqual(result, items);
});
test('UI has labeled search, clear and live result status', () => {
  assert.match(ui, /搜尋我的內容/);
  assert.match(ui, /pc-search-clear', '清除'/);
  assert.match(ui, /setAttribute\('aria-live', 'polite'\)/);
});
test('no-result branch is explicit and rendered with textContent helpers', () => {
  assert.match(ui, /找不到符合的個人內容/);
  assert.doesNotMatch(ui.slice(ui.indexOf('function searchControls'), ui.indexOf('function renderAccount')), /innerHTML\s*=\s*searchQuery/);
});

if (!process.exitCode) console.log('\n✅ Phase 1 Personal Search passed (' + passed + ' checks)');
