#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');
const guard = require('../js/core/network-guard.js');
const root = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const client = read('js/games/game-content-client.js');
let passed = 0;
async function test(label, fn) {
  try { await fn(); passed++; console.log('✓ ' + label); }
  catch (error) { console.error('✗ ' + label + ': ' + error.message); process.exitCode = 1; }
}

function createBootHarness(options = {}) {
  const listeners = Object.create(null);
  const requests = [];
  const storage = new Map();
  const body = {
    appendChild(element) {
      element.parentNode = body;
      if (element.tagName === 'SCRIPT' && typeof element.onload === 'function') {
        queueMicrotask(() => element.onload());
      }
    },
    removeChild(element) { element.parentNode = null; },
  };
  const document = {
    readyState: options.readyState || 'loading',
    body,
    createElement(tagName) {
      return {
        tagName: String(tagName).toUpperCase(),
        parentNode: null,
        setAttribute() {},
        querySelector() { return { addEventListener() {} }; },
      };
    },
    getElementById() { return null; },
    addEventListener(type, callback, eventOptions) {
      if (!listeners[type]) listeners[type] = [];
      listeners[type].push({ callback, once: !!(eventOptions && eventOptions.once) });
    },
  };
  const payload = {
    tier: 'anon',
    words: [{ word: 'ทดสอบ', level: '初', syls: [] }],
    sentences: [{ th: 'ทดสอบ', words: [] }],
    audioAvailable: [],
    capped: {},
  };
  const sandbox = {
    document,
    navigator: { onLine: true },
    location: { href: 'https://example.test/game.html', origin: 'https://example.test', reload() {} },
    localStorage: { getItem() { return null; } },
    sessionStorage: {
      getItem(key) { return storage.has(key) ? storage.get(key) : null; },
      setItem(key, value) { storage.set(key, String(value)); },
    },
    NetworkGuard: {
      request(fetchImpl, url, requestOptions, timeoutMs) {
        requests.push({ fetchImpl, url, requestOptions, timeoutMs });
        return Promise.resolve({ ok: true, json: () => Promise.resolve(payload) });
      },
    },
    fetch() {},
    console: { log() {}, warn() {}, error() {} },
    URL,
    Promise,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    addEventListener() {},
  };
  sandbox.window = sandbox;
  if (options.config) sandbox.SUPABASE_CONFIG = options.config;
  vm.runInNewContext(client, sandbox, { filename: 'game-content-client.js' });

  return {
    sandbox,
    requests,
    dispatchDomReady() {
      document.readyState = 'interactive';
      const queued = (listeners.DOMContentLoaded || []).slice();
      listeners.DOMContentLoaded = (listeners.DOMContentLoaded || []).filter((item) => !item.once);
      queued.forEach((item) => item.callback());
      document.readyState = 'complete';
    },
  };
}

const validConfig = { url: 'https://project.supabase.co', anonKey: 'public-anon-key' };

(async function () {
  await test('request resolves normally before the deadline', async () => {
    const result = await guard.request(() => Promise.resolve({ ok: true }), '/ok', {}, 50, null);
    assert.strictEqual(result.ok, true);
  });
  await test('request rejects deterministically when fetch never settles', async () => {
    await assert.rejects(guard.request(() => new Promise(() => {}), '/hang', {}, 10, null), (error) => error.code === 'NETWORK_TIMEOUT');
  });
  await test('timeout aborts an abort-capable request', async () => {
    let aborted = false;
    function FakeAbortController() { this.signal = {}; this.abort = () => { aborted = true; }; }
    await assert.rejects(guard.request(() => new Promise(() => {}), '/hang', {}, 10, FakeAbortController), /NETWORK_TIMEOUT/);
    assert.strictEqual(aborted, true);
  });
  await test('synchronous fetch failure becomes a rejected promise', async () => {
    await assert.rejects(guard.request(() => { throw new Error('offline'); }, '/fail', {}, 50, null), /offline/);
  });
  await test('Core 5 load the guard before the protected content client', async () => {
    ['tone-finder.html','reading-game.html','listening-game.html','typing-game.html','word-order.html'].forEach((page) => {
      assert.match(read(page), /network-guard\.js\?v=1[\s\S]*game-content-client\.js\?v=7/);
    });
  });
  await test('boot called before deferred config waits for DOM readiness instead of failing production', async () => {
    const harness = createBootHarness();
    let settled = false;
    const boot = harness.sandbox.GameContentLoader.boot([]);
    boot.then(() => { settled = true; }, () => { settled = true; });
    await Promise.resolve();
    assert.strictEqual(settled, false);
    assert.strictEqual(harness.requests.length, 0);

    harness.sandbox.SUPABASE_CONFIG = validConfig;
    harness.dispatchDomReady();
    await boot;
    assert.strictEqual(harness.requests.length, 1);
    assert.strictEqual(harness.requests[0].url, validConfig.url + '/functions/v1/game-content');
  });
  await test('missing deferred config fails closed without a request and can retry safely after config exists', async () => {
    const harness = createBootHarness();
    const firstBoot = harness.sandbox.GameContentLoader.boot([]);
    harness.dispatchDomReady();
    await assert.rejects(firstBoot, /Supabase config unavailable/);
    assert.strictEqual(harness.requests.length, 0);

    harness.sandbox.SUPABASE_CONFIG = validConfig;
    await harness.sandbox.GameContentLoader.boot([]);
    assert.strictEqual(harness.requests.length, 1);
  });
  await test('Listening-style boot after DOM ready keeps working without another DOM event', async () => {
    const harness = createBootHarness({ readyState: 'complete', config: validConfig });
    await harness.sandbox.GameContentLoader.boot([]);
    assert.strictEqual(harness.requests.length, 1);
  });
  await test('offline and timeout errors use an understandable recovery branch', async () => {
    assert.match(client, /navigator\.onLine === false/);
    assert.match(client, /NETWORK_TIMEOUT\|NETWORK_OFFLINE/);
    assert.match(client, /無法連線，請檢查網路訊號後再試一次/);
    assert.match(client, /gc-error-retry/);
    assert.match(client, /返回遊戲總覽/);
  });
  await test('content globals are assigned only after required data validation', async () => {
    const validation = client.indexOf("if (!data.words.length || !data.sentences.length)");
    const assignment = client.indexOf('global.WORDS_MASTER = data.words');
    assert.ok(validation >= 0 && assignment > validation);
  });
  if (!process.exitCode) console.log('\n✅ Phase 1 network recovery passed (' + passed + ' checks)');
})();
