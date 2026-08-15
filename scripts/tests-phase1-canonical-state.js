#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const root = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const source = read('js/score/phase1-canonical-state.js');
const shared = read('js/core/shared.js');
const auth = read('js/core/auth-widget.js');
let passed = 0;
function test(label, fn) {
  try { fn(); passed++; console.log('✓ ' + label); }
  catch (error) { console.error('✗ ' + label + ': ' + error.message); process.exitCode = 1; }
}

const values = new Map();
const localStorage = {
  getItem(key) { return values.has(key) ? values.get(key) : null; },
  setItem(key, value) { values.set(key, String(value)); },
  removeItem(key) { values.delete(key); }
};
const window = {
  SUPABASE_CONFIG: {}, localStorage,
  addEventListener() {}, dispatchEvent() {},
  setInterval() {}, setTimeout() {}, clearTimeout() {},
  Math, Date, JSON, Promise, console
};
const sandbox = {
  window, localStorage, CustomEvent: function CustomEvent() {}, document: { visibilityState: 'visible' },
  setInterval() {}, setTimeout() {}, clearTimeout() {}, Math, Date, JSON, Promise, console
};
vm.runInNewContext(source, sandbox, { filename: 'phase1-canonical-state.js' });
const api = window.PHASE1_CANONICAL;

test('architecture manifest covers every Phase 1 account datum family', () => {
  const manifest = api.manifest();
  ['profile','score','sessions','listening_srs','personal_words_sentences','learning_memory','client_learning_cache','account_resume']
    .forEach((key) => assert.ok(manifest[key], 'missing ' + key));
});
test('account cache registry includes SRS, progress and cross-device Resume', () => {
  const keys = api._test.syncKeys;
  ['tf_srs_v1','rgv3_save','wo_srs_v1','tf_badges_v1','tf_streak_v1','phase1_account_resume_v1']
    .forEach((key) => assert.ok(keys.includes(key), 'missing ' + key));
});
test('stable hashing ignores object key order', () => {
  assert.strictEqual(api._test.stable({ b: 2, a: 1 }), api._test.stable({ a: 1, b: 2 }));
});
test('remote apply never overwrites a pending local slice', () => {
  values.clear();
  localStorage.setItem('tf_srs_v1', JSON.stringify({ local: true }));
  localStorage.setItem('phase1_canonical_meta_v1', JSON.stringify({
    schema: 1, owner: '', baseToken: 'old', ack: {},
    pending: { tf_srs_v1: { mutationId: 'm-local', value: { local: true }, deleted: false } }
  }));
  api._test.applyRemote({ _phase1Canonical: { schema: 1, slices: {
    tf_srs_v1: { mutationId: 'm-remote', value: { remote: true }, deleted: false },
    tf_streak_v1: { mutationId: 'm-streak', value: { streak: 4 }, deleted: false }
  } } }, 'new-token');
  assert.deepStrictEqual(JSON.parse(localStorage.getItem('tf_srs_v1')), { local: true });
  assert.deepStrictEqual(JSON.parse(localStorage.getItem('tf_streak_v1')), { streak: 4 });
  assert.strictEqual(JSON.parse(localStorage.getItem('phase1_canonical_meta_v1')).baseToken, 'new-token');
});
test('writes use compare-and-swap and stale-device rebase, never blind upsert', () => {
  assert.match(source, /\.eq\('updated_at', meta\.baseToken\)/);
  assert.match(source, /CAS miss[\s\S]*pull\(true\)/);
  assert.doesNotMatch(source, /\.upsert\(/);
});
test('a newer local mutation made during an in-flight save is not acknowledged away', () => {
  assert.match(source, /current\.mutationId !== sent\[key\]\.mutationId/);
  assert.match(source, /delete meta\.pending\[key\]/);
});
test('Guest and account Resume use separate stores', () => {
  assert.match(shared, /phase1_account_resume_v1/);
  assert.match(shared, /if \(accountReady\(\)\)[\s\S]*accountRows/);
  assert.match(shared, /localStorage\.setItem\(key\(gameId\)/);
});
test('owner changes clear canonical account cache and metadata', () => {
  assert.match(auth, /'phase1_account_resume_v1', 'phase1_canonical_meta_v1'/);
});
test('all Login Free surfaces load the canonical runtime', () => {
  ['tone-finder.html','reading-game.html','listening-game.html','typing-game.html','word-order.html','my-progress.html','vault.html']
    .forEach((page) => assert.match(read(page), /phase1-canonical-state\.js\?v=1/, page));
});

if (!process.exitCode) console.log('\n✅ Phase 1 canonical persistence passed (' + passed + ' checks)');
