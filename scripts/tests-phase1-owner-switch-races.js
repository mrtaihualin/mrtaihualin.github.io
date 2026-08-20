#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
let passed = 0;

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function storage(initial) {
  const values = new Map(Object.entries(initial || {}).map(([k, v]) => [k, String(v)]));
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
    values
  };
}

function deferredClient() {
  const requests = [];
  function from(table) {
    let operation = 'select';
    let row = null;
    const filters = [];
    let request = null;
    function start() {
      if (!request) {
        request = Object.assign(deferred(), { table, operation, row, filters });
        requests.push(request);
      }
      return request;
    }
    const builder = {
      select() { return builder; },
      update(value) { operation = 'update'; row = value; return builder; },
      insert(value) { operation = 'insert'; row = value; return builder; },
      eq(column, value) { filters.push([column, String(value)]); return builder; },
      order() { return builder; },
      limit() { return builder; },
      maybeSingle() { return start().promise; },
      then(yes, no) { return start().promise.then(yes, no); }
    };
    return builder;
  }
  return { from, requests };
}

async function settle() {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setImmediate(resolve));
}

async function test(label, fn) {
  try {
    await fn();
    passed++;
    console.log('✓ ' + label);
  } catch (error) {
    console.error('✗ ' + label + ': ' + error.stack);
    process.exitCode = 1;
  }
}

function ownerBoundary(localStorage, siteAuth) {
  const ownerKey = 'phase1_learning_owner_v1';
  const keys = ['tf_srs_v1', 'rgv3_save', 'wo_srs_v1', 'thai_game_acct_v1', 'phase1_canonical_meta_v1'];
  return {
    ownerKey,
    bind(user) {
      const next = user && String(user.id) || '';
      const before = localStorage.getItem(ownerKey) || '';
      if (before !== next) {
        keys.forEach((key) => localStorage.removeItem(key));
        if (next) localStorage.setItem(ownerKey, next);
        else localStorage.removeItem(ownerKey);
        siteAuth.learningOwnerEpoch++;
      }
      siteAuth.learningOwnerId = next || null;
      return before !== next;
    }
  };
}

function canonicalHarness() {
  const localStorage = storage();
  const client = deferredClient();
  let authListener = null;
  const SITE_AUTH = {
    learningOwnerEpoch: 0,
    learningOwnerId: null,
    onChange(fn) { authListener = fn; }
  };
  const boundary = ownerBoundary(localStorage, SITE_AUTH);
  const window = {
    SUPABASE_CONFIG: { url: 'local', anonKey: 'anon' },
    supabase: { createClient() { return client; } },
    getSupabaseClient() { return client; },
    SITE_AUTH,
    PHASE1_ACCOUNT_BOUNDARY: boundary,
    localStorage,
    addEventListener() {}, dispatchEvent() {},
    setTimeout() { return 1; }, clearTimeout() {}, setInterval() {},
    Math, Date, JSON, Promise, console
  };
  const sandbox = {
    window, localStorage, CustomEvent: function CustomEvent() {},
    document: { visibilityState: 'visible' },
    setTimeout: window.setTimeout, clearTimeout: window.clearTimeout, setInterval: window.setInterval,
    Math, Date, JSON, Promise, console
  };
  vm.runInNewContext(read('js/score/phase1-canonical-state.js'), sandbox, { filename: 'phase1-canonical-state.js' });
  function change(user) { boundary.bind(user); authListener(user); }
  function emit(user) { authListener(user); }
  return { window, localStorage, client, change, emit };
}

function envelope(key, value, mutationId) {
  return { _phase1Canonical: { schema: 1, slices: {
    [key]: { mutationId: mutationId || 'remote', deleted: value == null, value }
  } } };
}

test('canonical pull discards Account A success after Account B becomes owner', async () => {
  const h = canonicalHarness();
  h.change({ id: 'account-a' });
  const pullA = h.client.requests[0];
  h.change({ id: 'account-b' });
  const pullB = h.client.requests[1];
  pullA.resolve({ data: { data: envelope('tf_srs_v1', { from: 'A' }), updated_at: 'a-token' } });
  await settle();
  assert.strictEqual(h.localStorage.getItem('tf_srs_v1'), null);
  pullB.resolve({ data: { data: envelope('tf_srs_v1', { from: 'B' }), updated_at: 'b-token' } });
  await settle();
  assert.deepStrictEqual(JSON.parse(h.localStorage.getItem('tf_srs_v1')), { from: 'B' });
  assert.deepStrictEqual(pullA.filters.find(([key]) => key === 'user_id'), ['user_id', 'account-a']);
});

test('canonical late push cannot clear or poison the newer owner request/meta', async () => {
  const h = canonicalHarness();
  h.change({ id: 'account-a' });
  h.client.requests[0].resolve({ data: { data: envelope('tf_srs_v1', { from: 'A0' }), updated_at: 'a-base' } });
  await settle();
  h.localStorage.setItem('tf_srs_v1', JSON.stringify({ from: 'A1' }));
  h.window.PHASE1_CANONICAL.flush();
  const pushA = h.client.requests.find((request) => request.operation === 'update');
  assert.ok(pushA, 'Account A push was not started');
  h.change({ id: 'account-b' });
  const pullB = h.client.requests[h.client.requests.length - 1];
  pullB.resolve({ data: { data: envelope('tf_srs_v1', { from: 'B' }), updated_at: 'b-base' } });
  await settle();
  pushA.resolve({ data: { data: envelope('tf_srs_v1', { from: 'A1' }), updated_at: 'a-saved' } });
  await settle();
  assert.deepStrictEqual(JSON.parse(h.localStorage.getItem('tf_srs_v1')), { from: 'B' });
  assert.strictEqual(h.window.PHASE1_CANONICAL.status().baseToken, 'b-base');
});

test('canonical stale rejection after logout does not arm Guest retry state', async () => {
  const h = canonicalHarness();
  h.change({ id: 'account-a' });
  const pullA = h.client.requests[0];
  h.change(null);
  pullA.reject(new Error('late offline'));
  await settle();
  assert.strictEqual(h.window.PHASE1_CANONICAL.status().retryPending, false);
  assert.strictEqual(h.window.PHASE1_CANONICAL.status().owner, null);
});

test('canonical same-id new owner epoch invalidates old push without deadlocking the next push', async () => {
  const h = canonicalHarness();
  h.change({ id: 'account-a' });
  h.client.requests[0].resolve({ data: { data: envelope('tf_srs_v1', { from: 'A0' }), updated_at: 'a-base' } });
  await settle();
  h.localStorage.setItem('tf_srs_v1', JSON.stringify({ from: 'A1' }));
  h.window.PHASE1_CANONICAL.flush();
  const oldPush = h.client.requests.find((request) => request.operation === 'update');
  assert.ok(oldPush, 'old epoch push was not started');

  h.window.SITE_AUTH.learningOwnerEpoch++;
  h.emit({ id: 'account-a' });
  const newEpochPull = h.client.requests[h.client.requests.length - 1];
  assert.strictEqual(newEpochPull.operation, 'select');
  oldPush.resolve({ data: { data: envelope('tf_srs_v1', { from: 'stale' }), updated_at: 'stale-token' } });
  await settle();
  newEpochPull.resolve({ data: { data: envelope('tf_srs_v1', { from: 'A0' }), updated_at: 'fresh-base' } });
  await settle();

  const pushes = h.client.requests.filter((request) => request.operation === 'update');
  assert.strictEqual(pushes.length, 2, 'new epoch pending state could not start a fresh push');
  assert.notStrictEqual(pushes[1], oldPush);
  assert.strictEqual(h.window.PHASE1_CANONICAL.status().baseToken, 'fresh-base');
});

test('canonical older same-owner pull cannot overwrite a newer pull result', async () => {
  const h = canonicalHarness();
  h.change({ id: 'account-a' });
  const oldPull = h.client.requests[0];
  h.window.PHASE1_CANONICAL.pull();
  const newPull = h.client.requests[1];
  newPull.resolve({ data: { data: envelope('tf_srs_v1', { version: 'new' }), updated_at: 'new-token' } });
  await settle();
  oldPull.resolve({ data: { data: envelope('tf_srs_v1', { version: 'old' }), updated_at: 'old-token' } });
  await settle();
  assert.deepStrictEqual(JSON.parse(h.localStorage.getItem('tf_srs_v1')), { version: 'new' });
  assert.strictEqual(h.window.PHASE1_CANONICAL.status().baseToken, 'new-token');
});

test('GAME_ACCOUNT rejects stale owner status and never reads the retired reward table', async () => {
  const localStorage = storage({ phase1_learning_owner_v1: 'account-a' });
  const client = deferredClient();
  const SITE_AUTH = { learningOwnerEpoch: 1 };
  const boundary = { ownerKey: 'phase1_learning_owner_v1' };
  let statusRequests = 0;
  const PracticeEvents = { gamificationStatus() { statusRequests++; return Promise.resolve(null); } };
  const window = { localStorage, SITE_AUTH, PracticeEvents, PHASE1_ACCOUNT_BOUNDARY: boundary, READING_AUTH: { user: { id: 'account-a' } } };
  vm.runInNewContext(read('js/games/game-account.js'), { window, localStorage, SITE_AUTH, PracticeEvents, PHASE1_ACCOUNT_BOUNDARY: boundary, READING_AUTH: window.READING_AUTH, Intl, Date, Math, JSON, Promise }, { filename: 'game-account.js' });
  window.GAME_ACCOUNT.sync(client, 'account-a');
  window.READING_AUTH.user = { id: 'account-b' }; SITE_AUTH.learningOwnerEpoch = 2;
  localStorage.setItem(boundary.ownerKey, 'account-b'); localStorage.removeItem('thai_game_acct_v1');
  window.GAME_ACCOUNT.sync(client, 'account-b');
  assert.strictEqual(statusRequests, 2);
  assert.strictEqual(client.requests.length, 0);
  assert.strictEqual(window.GAME_ACCOUNT.consumeStatus({ ok: true, current_streak: 2, status_as_of: '2026-08-17' }, 'account-b'), true);
  assert.strictEqual(window.GAME_ACCOUNT.consumeStatus({ ok: true, current_streak: 99, status_as_of: '2026-08-17' }, 'account-a'), false);
  assert.strictEqual(window.GAME_ACCOUNT.getStreak(), 2);
  assert.strictEqual(window.GAME_ACCOUNT.getStars(), 0);
});

function adaptiveHarness() {
  const source = read('js/games/reading-auth.js');
  const block = source.slice(source.indexOf('var ADAPTIVE_RATIO'), source.indexOf('function rgShuffle'));
  const localStorage = storage({ phase1_learning_owner_v1: 'account-a' });
  const client = deferredClient();
  const SITE_AUTH = { learningOwnerEpoch: 1 };
  const boundary = { ownerKey: 'phase1_learning_owner_v1' };
  const API = { user: { id: 'account-a' } };
  const context = { window: null, localStorage, SITE_AUTH, PHASE1_ACCOUNT_BOUNDARY: boundary, API, sb: client, pageGame() { return 'reading'; }, console };
  context.window = context;
  vm.runInNewContext(block, context, { filename: 'reading-auth-adaptive.js' });
  return { context, localStorage, client, SITE_AUTH, API, boundary };
}

test('adaptive history ignores late Account A success/error after Account B load', async () => {
  const h = adaptiveHarness();
  h.context.loadAdaptiveHistory();
  h.API.user = { id: 'account-b' }; h.SITE_AUTH.learningOwnerEpoch = 2;
  h.localStorage.setItem(h.boundary.ownerKey, 'account-b');
  h.context.loadAdaptiveHistory();
  const [requestA, requestB] = h.client.requests;
  requestB.resolve({ data: [{ wrong_items: [{ th: 'B-word', wrong: 2 }] }] });
  await settle();
  requestA.reject(new Error('late A error'));
  await settle();
  assert.strictEqual(h.context.adaptiveLoaded, true);
  assert.deepStrictEqual(Object.assign({}, h.context.adaptiveWrongCounts), { 'B-word': 2 });
});

function srsHarness(kind) {
  const specs = {
    reading: { file: 'js/games/reading-game-app.js', start: 'function rgSrsRank', end: '// ทริกเกอร์:', sync: 'rgSyncSrsFromServer', reset: 'rgResetAccountStateAtBoundary', promise: '__rgSrsSyncPromise', state: 'srsRecords', save: 'doSave', logged: 'rgLoggedIn', level: 1 },
    typing: { file: 'js/games/typing-game-app.js', start: 'function tgSrsRank', end: '// ⚠️ ต้องลงทะเบียน', sync: 'tgSyncSrsFromServer', reset: 'tgResetAccountStateAtBoundary', promise: '__tgSrsSyncPromise', state: 'srsRecords', save: 'doSave', logged: 'rgLoggedIn', level: 1 },
    wordorder: { file: 'js/games/word-order-app.js', start: 'function woSrsRank', end: '// เรียก init()', sync: 'woSyncSrsFromServer', reset: 'woResetAccountStateAtBoundary', promise: '__woSrsSyncPromise', state: 'srsRecords', save: 'woSaveSrs', logged: 'woLoggedIn', level: 3 },
    tone: { file: 'js/games/tone-finder-game.js', start: 'function tfSrsRank', end: '// ทริกเกอร์:', sync: 'tfSyncSrsFromServer', reset: 'tfResetAccountStateAtBoundary', promise: '__tfSrsSyncPromise', state: '_toneStore', save: 'tfSaveSrs', logged: null, level: 1 }
  };
  const spec = specs[kind];
  const source = read(spec.file);
  const block = source.slice(source.indexOf(spec.start), source.indexOf(spec.end, source.indexOf(spec.start)));
  const localStorage = storage({ phase1_learning_owner_v1: 'account-a' });
  const client = deferredClient();
  const SITE_AUTH = { learningOwnerEpoch: 1 };
  const boundary = { ownerKey: 'phase1_learning_owner_v1' };
  const READING_AUTH = { user: { id: 'account-a' } };
  const context = {
    window: null, localStorage, SITE_AUTH, PHASE1_ACCOUNT_BOUNDARY: boundary, READING_AUTH,
    srsRecords: {}, totalStars: 0, totalBadges: 0, LEVEL_NUM: 3,
    ADV_SENTENCES: [{ th: 'A-old' }, { th: 'B-new' }],
    getSupabaseClient() { return client; },
    doSave() { context.saveCount++; }, woSaveSrs() { context.saveCount++; },
    rgLoggedIn() { return !!READING_AUTH.user; }, woLoggedIn() { return !!READING_AUTH.user; },
    tfLoadSrs() { return Object.assign({}, context._toneStore); },
    tfSaveSrs(value) { context._toneStore = Object.assign({}, value); context.saveCount++; },
    TF_SRS: { keyFor(word, level) { return word + '@' + level; } },
    _toneStore: {}, saveCount: 0, console, Promise, String, Number
  };
  context.window = context;
  vm.runInNewContext(block, context, { filename: kind + '-srs-owner.js' });
  return { spec, context, localStorage, client, SITE_AUTH, READING_AUTH, boundary };
}

for (const kind of ['reading', 'typing', 'wordorder']) {
  test(kind + ' SRS discards Account A completion without clearing Account B request', async () => {
    const h = srsHarness(kind);
    const promiseA = h.context[h.spec.sync](true);
    h.READING_AUTH.user = { id: 'account-b' }; h.SITE_AUTH.learningOwnerEpoch = 2;
    h.localStorage.setItem(h.boundary.ownerKey, 'account-b');
    h.context[h.spec.reset]();
    const promiseB = h.context[h.spec.sync](true);
    const [requestA, requestB] = h.client.requests;
    requestB.resolve({ data: [{ word: 'B-new', level: h.spec.level, stage: 1, due_date: '2026-08-17', mastered: false }] });
    await promiseB; await settle();
    requestA.resolve({ data: [{ word: 'A-old', level: h.spec.level, stage: 2, due_date: '2026-08-20', mastered: false }] });
    await promiseA; await settle();
    const state = h.context[h.spec.state];
    assert.ok(state['B-new@' + h.spec.level], 'new owner SRS was not applied');
    assert.ok(!state['A-old@' + h.spec.level], 'old owner SRS leaked into new owner');
    assert.strictEqual(h.context[h.spec.promise], promiseB, 'stale completion replaced/cleared newer promise');
    assert.deepStrictEqual(requestA.filters.find(([key]) => key === 'user_id'), ['user_id', 'account-a']);
  });
}

test('Tone SRS resets on logout and discards the late authenticated response', async () => {
  const h = srsHarness('tone');
  const promiseA = h.context[h.spec.sync]();
  h.READING_AUTH.user = null; h.SITE_AUTH.learningOwnerEpoch = 2;
  h.localStorage.removeItem(h.boundary.ownerKey);
  h.context[h.spec.reset]();
  const requestA = h.client.requests[0];
  requestA.resolve({ data: [{ word: 'A-old', level: 1, stage: 2, due_date: '2026-08-20', mastered: false }] });
  await promiseA; await settle();
  assert.deepStrictEqual(h.context._toneStore, {});
  assert.strictEqual(h.context.__tfSrsSyncedOnce, false);
  assert.strictEqual(h.context.__tfSrsSyncPromise, null);
});

test('all affected pages ship the owner-safe runtime versions', async () => {
  const corePages = ['tone-finder.html', 'reading-game.html', 'listening-game.html', 'typing-game.html', 'word-order.html'];
  for (const page of corePages) {
    const html = read(page);
    assert.match(html, /phase1-canonical-state\.js\?v=2/, page + ' canonical cache');
    assert.match(html, /game-account\.js\?v=5/, page + ' GameAccount cache');
    assert.match(html, /reading-auth\.js\?v=26/, page + ' reading-auth cache');
  }
  for (const page of ['my-progress.html', 'vault.html']) {
    assert.match(read(page), /phase1-canonical-state\.js\?v=2/, page + ' canonical cache');
  }
  for (const page of ['lego.html', 'vault.html']) {
    assert.match(read(page), /reading-auth\.js\?v=26/, page + ' reading-auth cache');
  }
  assert.match(read('lego.html'), /game-account\.js\?v=4/);
  assert.match(read('tone-finder.html'), /tone-finder-game\.min\.js\?v=58/);
  assert.match(read('reading-game.html'), /reading-game-app\.min\.js\?v=39/);
  assert.match(read('typing-game.html'), /typing-game-app\.min\.js\?v=38/);
  assert.match(read('word-order.html'), /word-order-app\.min\.js\?v=30/);
  assert.match(read('listening-game.html'), /listening-game-app\.js\?v=18/);
});

process.on('beforeExit', () => {
  if (!process.exitCode) console.log('\n✅ Phase 1 owner-switch race tests passed (' + passed + ' checks)');
});
