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

function catalogBundle(options = {}) {
  const word = options.word || 'ทดสอบ';
  const contentKey = options.contentKey || (word + '@' + (options.level || '初'));
  const spellings = options.spellings || [word];
  const syllables = spellings.map((spelling, index) => ({
    roman: (options.romans && options.romans[index]) || 'test',
    lead: 'ไม่มี', consonant: 'ท', cluster: 'ไม่มี', vowel: 'โอะ', writtenFinal: 'ไม่มี',
    toneMark: 'ไม่มี', toneNumber: 1, toneName: 'สามัญ', liveDead: '活音',
    consonantReadDifference: 'ไม่มี', finalReadDifference: 'ไม่มี', silent: 'ไม่มี'
  }));
  return {
    catalog: {
      contentKey, reviewSet: 'TEST-REVIEWED', word, spellingTH: options.spellingTH || spellings.join('-'),
      readingTH: Object.prototype.hasOwnProperty.call(options, 'readingTH') ? options.readingTH : word,
      roman: options.roman || 'test', zhTW: options.zh || '測試',
      level: options.level || '初', type: 'กริยา', category: 'ไม่มี', audioStatus: 'ยังไม่เช็ก',
      approvalRefs: ['TEST'], syllables,
      spellingSyllables: options.spellingSyllables || spellings.map((th) => ({ th }))
    }
  };
}

function sentenceFixture() {
  return { th: 'ทดสอบ', zh: '測試', readingTH: 'ทด-สอบ', wc: 2, politeF: null, words: [
    { th: 'ทดสอบ', zh: '測試', syls: [
      { th: 'ทด', en: 'thot', cons: 'ท', vowel: 'โอะ', tone_name: 'โท' },
      { th: 'สอบ', en: 'sop', cons: 'ส', vowel: 'ออ', tone_name: 'เอก' }
    ] }
  ] };
}

function createBootHarness(options = {}) {
  const listeners = Object.create(null);
  const globalListeners = Object.create(null);
  const requests = [];
  const appended = [];
  const storage = new Map();
  const elementsById = Object.create(null);
  const body = {
    appendChild(element) {
      appended.push(element);
      element.parentNode = body;
      if (element.id) elementsById[element.id] = element;
      if (element.tagName === 'SCRIPT' && typeof element.onload === 'function') {
        queueMicrotask(() => element.onload());
      }
    },
    removeChild(element) {
      if (element.id) delete elementsById[element.id];
      element.parentNode = null;
    },
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
    getElementById(id) { return elementsById[id] || null; },
    addEventListener(type, callback, eventOptions) {
      if (!listeners[type]) listeners[type] = [];
      listeners[type].push({ callback, once: !!(eventOptions && eventOptions.once) });
    },
  };
  const payload = options.payload || {
    tier: 'anon',
    words: [catalogBundle()],
    sentences: [sentenceFixture()],
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
    addEventListener(type, callback) {
      if (!globalListeners[type]) globalListeners[type] = [];
      globalListeners[type].push(callback);
    },
  };
  sandbox.window = sandbox;
  if (options.config) sandbox.SUPABASE_CONFIG = options.config;
  vm.runInNewContext(client, sandbox, { filename: 'game-content-client.js' });

  return {
    sandbox,
    requests,
    appended,
    dispatchDomReady() {
      document.readyState = 'interactive';
      const queued = (listeners.DOMContentLoaded || []).slice();
      listeners.DOMContentLoaded = (listeners.DOMContentLoaded || []).filter((item) => !item.once);
      queued.forEach((item) => item.callback());
      document.readyState = 'complete';
    },
    dispatchGlobal(type, event) {
      (globalListeners[type] || []).forEach((callback) => callback(event));
    },
  };
}

const validConfig = { url: 'https://project.supabase.co', anonKey: 'public-anon-key' };

(async function () {
  await test('app bytes preload before content, but execution waits for valid data', async () => {
    const harness = createBootHarness({ config: validConfig });
    const boot = harness.sandbox.GameContentLoader.boot(['js/games/example.js?v=1']);
    const hints = harness.appended.filter(el => el.tagName === 'LINK');
    assert.strictEqual(hints.length, 1);
    assert.strictEqual(hints[0].rel, 'preload');
    assert.strictEqual(hints[0].as, 'script');
    assert.strictEqual(hints[0].href, 'js/games/example.js?v=1');
    assert.strictEqual(harness.appended.filter(el => el.tagName === 'SCRIPT').length, 0);
    assert.strictEqual(harness.requests.length, 0);
    harness.dispatchDomReady();
    await boot;
    assert.strictEqual(harness.requests.length, 1);
    assert.strictEqual(harness.appended.filter(el => el.tagName === 'SCRIPT').length, 1);
  });
  await test('failed content never executes preloaded app code', async () => {
    const harness = createBootHarness({ readyState: 'complete', config: validConfig });
    harness.sandbox.NetworkGuard.request = () => Promise.reject(new Error('offline'));
    await assert.rejects(harness.sandbox.GameContentLoader.boot(['js/games/example.js']), /offline/);
    assert.strictEqual(harness.appended.filter(el => el.tagName === 'SCRIPT').length, 0);
  });
  await test('offline browser hint does not block a successful real content request', async () => {
    const harness = createBootHarness({ readyState: 'complete', config: validConfig });
    harness.sandbox.navigator.onLine = false;
    await harness.sandbox.GameContentLoader.boot(['js/games/example.js'], { game: 'typing' });
    assert.strictEqual(harness.requests.length, 1);
    assert.strictEqual(harness.requests[0].timeoutMs, 15000);
    assert.deepStrictEqual(JSON.parse(harness.requests[0].requestOptions.body), { game: 'typing', contract: 'canonical-v1' });
    assert.strictEqual(harness.appended.filter(el => el.tagName === 'SCRIPT').length, 1);
  });
  await test('actual network failure while browser reports offline still fails closed without retrying', async () => {
    const harness = createBootHarness({ readyState: 'complete', config: validConfig });
    harness.sandbox.navigator.onLine = false;
    let attempts = 0;
    harness.sandbox.NetworkGuard.request = () => { attempts++; return Promise.reject(new TypeError('Failed to fetch')); };
    await assert.rejects(harness.sandbox.GameContentLoader.boot(['js/games/example.js']), /Failed to fetch/);
    assert.strictEqual(attempts, 1);
    assert.strictEqual(harness.sandbox.WORDS_MASTER, undefined);
    assert.strictEqual(harness.appended.filter(el => el.tagName === 'SCRIPT').length, 0);
    assert.ok(harness.sandbox.document.getElementById('gc-error-banner'));
  });
  await test('request resolves normally before the deadline', async () => {
    const result = await guard.request(() => Promise.resolve({ ok: true }), '/ok', {}, 50, null);
    assert.strictEqual(result.ok, true);
  });
  await test('missing reviewed reading fails closed instead of falling back to the written word', async () => {
    const harness = createBootHarness({ readyState: 'complete', config: validConfig });
    assert.throws(() => harness.sandbox.buildWordListForToneFinder([
      catalogBundle({ word: 'จาก', readingTH: null, roman: 'jaak', zh: '從' }),
    ]), /catalog authority incomplete/);
    assert.throws(() => harness.sandbox.buildWordListForToneFinder([
      catalogBundle({ word: 'กิน', readingTH: '', roman: 'gin', zh: '吃' }),
    ]), /catalog authority incomplete/);
    const rows = harness.sandbox.buildWordListForToneFinder([
      catalogBundle({ word: 'เครื่องบิน', readingTH: 'เครื่อง-บิน', roman: 'khrueang-bin', zh: '飛機', level: '中', spellings: ['เครื่อง', 'บิน'] }),
    ]);
    assert.strictEqual(rows[0].readingTH, 'เครื่อง-บิน');
  });
  await test('sense identity survives the protected-content adapters without object-use metadata', async () => {
    const harness = createBootHarness({ readyState: 'complete', config: validConfig });
    const source = [catalogBundle({ word: 'ร้อง', contentKey: 'ร้อง@初#sing' })];
    const tone = harness.sandbox.buildWordListForToneFinder(source);
    const phonics = harness.sandbox.buildWordsForPhonicsGames(source);
    assert.strictEqual(tone[0].contentKey, 'ร้อง@初#sing');
    assert.strictEqual(phonics[0].contentKey, 'ร้อง@初#sing');
    assert.strictEqual(Object.prototype.hasOwnProperty.call(tone[0], 'objectUse'), false);
    assert.strictEqual(Object.prototype.hasOwnProperty.call(phonics[0], 'objectUse'), false);
  });
  await test('reviewed spelling authority hydrates syllable text before game boot', async () => {
    const payload = {
      tier: 'anon',
      words: [catalogBundle({ word: 'อธิบาย', contentKey: 'อธิบาย@中', spellingTH: 'อ-ธิ-บาย', readingTH: 'อะ-ธิ-บาย', level: '中', spellings: ['อ', 'ธิ', 'บาย'] })],
      sentences: [sentenceFixture()],
      audioAvailable: [],
      capped: {},
    };
    const harness = createBootHarness({ readyState: 'complete', config: validConfig, payload });
    await harness.sandbox.GameContentLoader.boot([]);
    assert.deepStrictEqual(Array.from(harness.sandbox.WORDS_MASTER[0].catalog.spellingSyllables, (s) => s.th), ['อ', 'ธิ', 'บาย']);
    const tone = harness.sandbox.buildWordListForToneFinder(harness.sandbox.WORDS_MASTER);
    const phonics = harness.sandbox.buildWordsForPhonicsGames(harness.sandbox.WORDS_MASTER);
    assert.strictEqual(tone[0].spellingTH, 'อ-ธิ-บาย');
    assert.strictEqual(phonics[0].spellingTH, 'อ-ธิ-บาย');
    assert.deepStrictEqual(Array.from(tone[0].syls, (s) => s.th), ['อ', 'ธิ', 'บาย']);
  });
  await test('reviewed syllable authority mismatch fails closed before content globals are assigned', async () => {
    const payload = {
      tier: 'anon',
      words: [catalogBundle({ word: 'อธิบาย', contentKey: 'อธิบาย@中', spellingTH: 'อ-ธิ-บาย', readingTH: 'อะ-ทิ-บาย', level: '中', spellings: ['อ', 'ธิ', 'บาย'], spellingSyllables: [{ th: 'อ' }] })],
      sentences: [sentenceFixture()],
      audioAvailable: [],
      capped: {},
    };
    const harness = createBootHarness({ readyState: 'complete', config: validConfig, payload });
    await assert.rejects(harness.sandbox.GameContentLoader.boot([]), /reviewed display segmentation missing/);
    assert.strictEqual(harness.sandbox.WORDS_MASTER, undefined);
  });
  await test('malformed sentence fails closed before any content global or game script is assigned', async () => {
    const malformedSentence = sentenceFixture();
    malformedSentence.words[0].syls[0].lead = ' ';
    const payload = {
      tier: 'anon', words: [catalogBundle()], sentences: [malformedSentence], audioAvailable: [], capped: {},
    };
    const harness = createBootHarness({ readyState: 'complete', config: validConfig, payload });
    await assert.rejects(harness.sandbox.GameContentLoader.boot(['js/games/example.js']), /sentence authority incomplete/);
    assert.strictEqual(harness.sandbox.WORDS_MASTER, undefined);
    assert.strictEqual(harness.sandbox.ADV_SENTENCES, undefined);
    assert.strictEqual(harness.appended.filter(el => el.tagName === 'SCRIPT').length, 0);
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
      const version = page === 'tone-finder.html' ? 17 : 16;
      assert.match(read(page), new RegExp('network-guard\\.js\\?v=1[\\s\\S]*game-content-client\\.js\\?v=' + version));
    });
  });
  await test('optional same-origin errors do not show a false fatal game banner', async () => {
    const harness = createBootHarness({ config: validConfig });
    harness.dispatchGlobal('error', {
      error: new Error('optional enhancement failed'),
      filename: 'https://example.test/js/core/shared.min.js?v=17',
    });
    assert.strictEqual(harness.sandbox.document.getElementById('gc-error-banner'), null);
  });
  await test('uncaught Core 5 app errors still show the fatal recovery banner', async () => {
    const harness = createBootHarness({ config: validConfig });
    harness.dispatchGlobal('error', {
      error: new Error('game render failed'),
      filename: 'https://example.test/js/games/tone-finder-game.min.js?v=49',
    });
    assert.ok(harness.sandbox.document.getElementById('gc-error-banner'));
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
  await test('scoped pages send the requested game while legacy pages keep an empty body', async () => {
    const scoped = createBootHarness({ readyState: 'complete', config: validConfig });
    await scoped.sandbox.GameContentLoader.boot([], { game: 'reading' });
    assert.deepStrictEqual(JSON.parse(scoped.requests[0].requestOptions.body), { game: 'reading', contract: 'canonical-v1' });
    const legacy = createBootHarness({ readyState: 'complete', config: validConfig });
    await legacy.sandbox.GameContentLoader.boot([]);
    assert.deepStrictEqual(JSON.parse(legacy.requests[0].requestOptions.body), { contract: 'canonical-v1' });
  });
  await test('offline and timeout errors use an understandable recovery branch', async () => {
    assert.doesNotMatch(client, /navigator\.onLine === false/);
    assert.match(client, /NETWORK_TIMEOUT\|NETWORK_OFFLINE/);
    assert.match(client, /無法連線，請檢查網路訊號後再試一次/);
    assert.match(client, /gc-error-retry/);
    assert.match(client, /返回遊戲總覽/);
  });
  await test('content globals are assigned only after required data validation', async () => {
    const validation = client.indexOf("if (!data.words.length || !data.sentences.length)");
    const assignment = client.indexOf('global.WORDS_MASTER = exactWords');
    assert.ok(validation >= 0 && assignment > validation);
    assert.ok(client.indexOf('var exactSentences = validateSentencePayload(data.sentences)') < assignment);
  });
  if (!process.exitCode) console.log('\n✅ Phase 1 network recovery passed (' + passed + ' checks)');
})();
