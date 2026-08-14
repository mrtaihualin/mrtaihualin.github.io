#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const gate = require('../js/core/clarity-consent-gate.js');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'vault.html'), 'utf8');
let passed = 0;

function test(label, fn) {
  try { fn(); passed++; console.log(`✓ ${label}`); }
  catch (error) { console.error(`✗ ${label}: ${error.message}`); process.exitCode = 1; }
}

function fixture(initial) {
  const values = {};
  if (initial) values.cookieConsent = initial;
  const inserted = [];
  const first = { parentNode: { insertBefore(node) { inserted.push(node); } } };
  const doc = {
    head: { appendChild(node) { inserted.push(node); } },
    getElementById(id) { return inserted.find((node) => node.id === id) || null; },
    createElement() { return {}; },
    getElementsByTagName() { return [first]; },
  };
  const win = {
    localStorage: {
      getItem(key) { return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null; },
      setItem(key, value) { values[key] = value; },
    },
  };
  return { win, doc, inserted, values, controller: gate.createController(win, doc, 'test-site') };
}

test('Vault replaces eager Clarity loader with consent gate', () => {
  assert.match(html, /clarity-consent-gate\.js\?v=1/);
  assert.doesNotMatch(html, /createElement\(["']script["']\)[\s\S]{0,200}clarity\.ms/);
});

test('unknown consent makes zero analytics requests', () => {
  const f = fixture();
  assert.strictEqual(f.controller.state(), 'unset');
  assert.strictEqual(f.controller.loadIfGranted(), false);
  assert.strictEqual(f.inserted.length, 0);
});

test('stored denial makes zero analytics requests', () => {
  const f = fixture('denied');
  assert.strictEqual(f.controller.loadIfGranted(), false);
  assert.strictEqual(f.inserted.length, 0);
});

test('accept stores consent and loads Clarity exactly once', () => {
  const f = fixture();
  assert.strictEqual(f.controller.decide(true), true);
  assert.strictEqual(f.values.cookieConsent, 'granted');
  assert.strictEqual(f.inserted.length, 1);
  assert.strictEqual(f.inserted[0].id, gate.SCRIPT_ID);
  assert.match(f.inserted[0].src, /^https:\/\/www\.clarity\.ms\/tag\/test-site$/);
  assert.strictEqual(f.controller.loadIfGranted(), true);
  assert.strictEqual(f.inserted.length, 1);
});

test('reject stores denial without loading Clarity', () => {
  const f = fixture();
  assert.strictEqual(f.controller.decide(false), false);
  assert.strictEqual(f.values.cookieConsent, 'denied');
  assert.strictEqual(f.inserted.length, 0);
});

test('Vault includes accessible Accept and Reject controls', () => {
  assert.match(html, /id="cookieConsentBanner"[^>]+role="dialog"/);
  assert.match(html, /onclick="window\.__cookieConsentDecide\(false\)"/);
  assert.match(html, /onclick="window\.__cookieConsentDecide\(true\)"/);
});

if (!process.exitCode) console.log(`\n✅ Phase 1 Vault consent gate passed (${passed} checks)`);
