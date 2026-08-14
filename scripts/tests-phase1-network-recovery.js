#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const guard = require('../js/core/network-guard.js');
const root = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const client = read('js/games/game-content-client.js');
let passed = 0;
async function test(label, fn) {
  try { await fn(); passed++; console.log('✓ ' + label); }
  catch (error) { console.error('✗ ' + label + ': ' + error.message); process.exitCode = 1; }
}

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
      assert.match(read(page), /network-guard\.js\?v=1[\s\S]*game-content-client\.js\?v=6/);
    });
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
