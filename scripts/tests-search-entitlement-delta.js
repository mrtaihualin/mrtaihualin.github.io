#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.resolve(__dirname, '..');
const GameProblemSearch = require(path.join(root, 'js/games/game-problem-search.js'));
const GlobalAdapter = require(path.join(root, 'js/core/global-search-game-adapter.js'));
const SearchEngine = require(path.join(root, 'js/core/search-engine.js'));
const SEARCH_INDEX = require(path.join(root, 'data/search-index.js'));
const gameUiSource = fs.readFileSync(path.join(root, 'js/games/games-search-ui.js'), 'utf8');
const globalUiSource = fs.readFileSync(path.join(root, 'js/core/search-ui.js'), 'utf8');

let passed = 0;
function assert(condition, message) { if (!condition) throw new Error(message); }
function pass(message) { passed++; console.log('✓ ' + message); }
function tick() { return new Promise(resolve => setImmediate(resolve)); }
async function settle() { for (let i = 0; i < 8; i++) await tick(); }

class FakeElement {
  constructor(id, document) {
    this.id = id;
    this.document = document;
    this.style = {};
    this.value = '';
    this.disabled = false;
    this.listeners = Object.create(null);
    this.attrs = Object.create(null);
    this._innerHTML = '';
  }
  set innerHTML(value) {
    this._innerHTML = String(value);
    if (this.id === 'gameSearchGate') this.document.syncGameControls(this._innerHTML);
  }
  get innerHTML() { return this._innerHTML; }
  addEventListener(type, callback) { this.listeners[type] = callback; }
  emit(type, event = {}) { if (this.listeners[type]) return this.listeners[type](event); }
  setAttribute(name, value) { this.attrs[name] = String(value); }
  getAttribute(name) { return Object.prototype.hasOwnProperty.call(this.attrs, name) ? this.attrs[name] : null; }
  removeAttribute(name) { delete this.attrs[name]; }
}

class FakeDocument {
  constructor(ids) {
    this.readyState = 'complete';
    this.elements = Object.create(null);
    ids.forEach(id => { this.elements[id] = new FakeElement(id, this); });
  }
  getElementById(id) { return this.elements[id] || null; }
  addEventListener() {}
  syncGameControls(html) {
    ['gameSearchInput', 'gameSearchBtn', 'gameSearchResult'].forEach(id => { delete this.elements[id]; });
    if (!html.includes('id="gameSearchInput"')) return;
    ['gameSearchInput', 'gameSearchBtn', 'gameSearchResult'].forEach(id => {
      this.elements[id] = new FakeElement(id, this);
    });
  }
}

function storage(backing = new Map()) {
  return {
    backing,
    getItem: key => backing.has(key) ? backing.get(key) : null,
    setItem: (key, value) => backing.set(key, String(value)),
    removeItem: key => backing.delete(key)
  };
}

function quotaBackend() {
  const accepted = new Set();
  const calls = [];
  return {
    calls,
    fetch: async (_url, options) => {
      const body = JSON.parse(options.body || '{}');
      calls.push({ body, authorization: options.headers && options.headers.Authorization });
      const id = body.request_id;
      if (accepted.has(id)) return response(200, { ok: true, allowed: true, idempotent: true, used: 1, cap: 1 });
      if (accepted.size) return response(429, { ok: false, allowed: false, reason: 'limit', used: 1, cap: 1 });
      accepted.add(id);
      return response(200, { ok: true, allowed: true, idempotent: false, used: 1, cap: 1 });
    }
  };
}

function response(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

let uuidCounter = 0;
function uuid() {
  uuidCounter++;
  return '00000000-0000-4000-8000-' + String(uuidCounter).padStart(12, '0');
}

function baseContext(document, user, backend, sharedStorage, gps = GameProblemSearch) {
  const auth = {
    ready: true,
    authResolved: true,
    authError: null,
    user: user,
    onChange(callback) { callback(this.user); }
  };
  const mockCredential = ['test', 'session', 'credential'].join('-');
  const session = user ? { user, access_token: mockCredential } : null;
  const window = {
    SITE_AUTH: auth,
    GameProblemSearch: gps,
    SEARCH_INDEX,
    SearchEngine,
    GlobalSearchGameAdapter: GlobalAdapter,
    SUPABASE_CONFIG: { url: 'https://example.supabase.co', anonKey: 'public-test-key' },
    getSupabaseClient: () => ({ auth: { getSession: async () => ({ data: { session } }) } }),
    crypto: { randomUUID: uuid },
    location: { href: 'https://mrtaihualin.com/games.html' }
  };
  return {
    window,
    document,
    sessionStorage: sharedStorage,
    fetch: backend.fetch,
    AbortController,
    Uint8Array,
    Array,
    JSON,
    Math,
    Promise,
    setTimeout,
    clearTimeout,
    console
  };
}

function loadGame(user, backend, sharedStorage = storage(), gps = GameProblemSearch) {
  const document = new FakeDocument(['gameSearchGate']);
  const context = baseContext(document, user, backend, sharedStorage, gps);
  vm.runInNewContext(gameUiSource, context, { filename: 'games-search-ui.js' });
  return { context, document, storage: sharedStorage };
}

function loadGlobal(user, backend, sharedStorage = storage(), searchEngine = SearchEngine) {
  const document = new FakeDocument(['homeSearchInput', 'homeSearchBtn', 'homeSearchResults']);
  const context = baseContext(document, user, backend, sharedStorage);
  context.window.SearchEngine = searchEngine;
  vm.runInNewContext(globalUiSource, context, { filename: 'search-ui.js' });
  return { context, document, storage: sharedStorage };
}

async function runGame(harness, query) {
  const input = harness.document.getElementById('gameSearchInput');
  const button = harness.document.getElementById('gameSearchBtn');
  assert(input && button, 'Login Free Game Search controls must exist');
  input.value = query;
  button.emit('click');
  await settle();
  return harness.document.getElementById('gameSearchResult');
}

async function runGlobal(harness, query) {
  const input = harness.document.getElementById('homeSearchInput');
  const button = harness.document.getElementById('homeSearchBtn');
  input.value = query;
  button.emit('click');
  await settle();
  return harness.document.getElementById('homeSearchResults');
}

(async function main() {
  {
    const backend = quotaBackend();
    const guest = loadGame(null, backend);
    const gate = guest.document.getElementById('gameSearchGate');
    assert(gate.innerHTML.includes('登入後可搜尋遊戲名稱或輸入你的學習問題。'), 'Guest message missing');
    assert(!guest.document.getElementById('gameSearchInput') && !guest.document.getElementById('gameSearchBtn'), 'Guest must have no usable search controls');
    assert(backend.calls.length === 0, 'Guest Game page must not call quota');
    pass('Guest games.html has login message, no controls, and zero quota calls');
  }

  {
    const order = [];
    const backend = quotaBackend();
    const originalFetch = backend.fetch;
    backend.fetch = async (...args) => { order.push('quota'); return originalFetch(...args); };
    const gps = Object.assign({}, GameProblemSearch, { analyze(query) { order.push('analyze'); return GameProblemSearch.analyze(query); } });
    const login = loadGame({ id: 'account-a' }, backend, storage(), gps);
    await runGame(login, '聲調');
    assert(order.join(',') === 'quota,analyze', 'Direct name must claim quota before analysis/navigation');
    assert(login.context.window.location.href === '/tone-finder.html', 'Direct name must navigate after quota success');
    assert(backend.calls.length === 1 && Object.keys(backend.calls[0].body).join(',') === 'request_id', 'Direct quota payload must be request_id only');
    pass('Login direct-name first search claims quota before navigation');
  }

  {
    const backend = quotaBackend();
    const login = loadGame({ id: 'account-a' }, backend);
    const out = await runGame(login, 'ฟังคนไทยไม่ทัน');
    assert(backend.calls.length === 1, 'Problem search must claim the shared quota once');
    assert(out.innerHTML.includes('泰語聽力練習室') && out.innerHTML.includes('泰語聲調練習室'), 'Problem search must render primary + secondary');
    assert(login.document.getElementById('gameSearchInput').disabled, 'Successful first problem search must exhaust controls');
    pass('Login problem first search returns existing primary 1 + secondary 1 and exhausts the day');
  }

  {
    const backend = quotaBackend();
    const shared = storage();
    const first = loadGame({ id: 'account-a' }, backend, shared);
    await runGame(first, '聲調');
    const second = loadGame({ id: 'account-a' }, backend, shared);
    const out = await runGame(second, 'ฟังคนไทยไม่ทัน');
    assert(backend.calls.length === 2 && out.innerHTML.includes('付費方案可不限次數搜尋'), 'direct -> problem second search must be denied');
    assert(!out.innerHTML.includes('泰語聽力練習室'), 'Denied second search must hide classifier details');
    pass('direct -> problem second search is denied');
  }

  {
    const backend = quotaBackend();
    const shared = storage();
    const first = loadGame({ id: 'account-a' }, backend, shared);
    await runGame(first, 'ฟังคนไทยไม่ทัน');
    const second = loadGame({ id: 'account-a' }, backend, shared);
    const out = await runGame(second, '聲調');
    assert(backend.calls.length === 2 && out.innerHTML.includes('付費方案可不限次數搜尋'), 'problem -> direct second search must be denied');
    assert(second.context.window.location.href.endsWith('/games.html'), 'Denied direct search must not navigate to a game');
    pass('problem -> direct second search is denied');
  }

  for (const query of ['聲調', 'ฟังคนไทยไม่ทัน']) {
    const backend = quotaBackend();
    const guest = loadGlobal(null, backend);
    const out = await runGlobal(guest, query);
    assert(backend.calls.length === 0, 'Guest Global game intent must not call quota');
    assert(out.innerHTML.includes('href="/games.html"'), 'Guest Global game intent must expose Game Hub');
    assert(!/tone-finder|reading-game|listening-game|typing-game|word-order-game|lego\.html/.test(out.innerHTML), 'Guest Global must not expose per-game href');
  }
  pass('Global Guest direct/problem intents are hub-only with zero quota calls');

  for (const query of ['聲調', 'ฟังคนไทยไม่ทัน']) {
    const backend = quotaBackend();
    const login = loadGlobal({ id: 'account-a' }, backend);
    const out = await runGlobal(login, query);
    assert(backend.calls.length === 1, 'Login Global direct/problem must consume quota');
    assert(out.innerHTML.includes('href="/games.html"'), 'Allowed Global result must remain Game Hub only');
    assert(!/tone-finder|reading-game|listening-game|typing-game|word-order-game|lego\.html/.test(out.innerHTML), 'Allowed Global result must not expose per-game href');
  }
  pass('Global Login direct/problem intents consume quota and remain hub-only');

  {
    const backend = quotaBackend();
    const shared = storage();
    const game = loadGame({ id: 'account-a' }, backend, shared);
    await runGame(game, 'ฟังคนไทยไม่ทัน');
    const global = loadGlobal({ id: 'account-a' }, backend, shared);
    const out = await runGlobal(global, '聲調');
    assert(backend.calls.length === 2 && out.innerHTML.includes('付費方案可不限次數搜尋'), 'Game -> Global must share the same cap');
    assert(out.innerHTML.includes('href="/games.html"') && !out.innerHTML.includes('tone-finder'), 'Exhausted Global must show hub without details');
    pass('Game Search -> Global Search shares the same endpoint/day cap');
  }

  {
    const backend = quotaBackend();
    const shared = storage();
    const global = loadGlobal({ id: 'account-a' }, backend, shared);
    await runGlobal(global, '聲調');
    const game = loadGame({ id: 'account-a' }, backend, shared);
    const out = await runGame(game, 'ฟังคนไทยไม่ทัน');
    assert(backend.calls.length === 2 && out.innerHTML.includes('付費方案可不限次數搜尋'), 'Global -> Game must share the same cap');
    assert(!out.innerHTML.includes('泰語聽力練習室'), 'Exhausted Game Search must hide recommendations');
    pass('Global Search -> Game Search shares the same endpoint/day cap');
  }

  {
    const backend = quotaBackend();
    const leakyGemini = Object.assign({}, SearchEngine, {
      geminiFallback: async () => ({ entry: SEARCH_INDEX.GAMES[0] })
    });
    const guest = loadGlobal(null, backend, storage(), leakyGemini);
    const out = await runGlobal(guest, 'zzzz-no-public-match-zzzz');
    assert(!/tone-finder|reading-game|listening-game|typing-game|word-order-game|lego\.html/.test(out.innerHTML), 'Gemini practice fallback must be rejected');
    assert(backend.calls.length === 0, 'Ordinary public query must not consume game quota');
    pass('Generic/Gemini public search cannot leak a practice/per-game destination');
  }

  console.log(`PASS ${passed} locked Search entitlement runtime contracts`);
})().catch(error => {
  console.error(error.stack || error);
  process.exit(1);
});
