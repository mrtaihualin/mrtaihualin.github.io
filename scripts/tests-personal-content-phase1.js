#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const word = read('js/games/word-vault.js');
const sentence = read('js/games/sentence-vault.js');
const page = read('vault.html');
const ui = read('js/score/personal-content.js');
const auth = read('js/core/auth-widget.js');
const readingAuth = read('js/games/reading-auth.js');
const wordOrder = read('js/games/word-order-app.js');
const exportFn = read('supabase/functions/account-export/index.ts');
const failures = [];
let passes = 0;
const practiceBody = (ui.match(/function practiceSection\(item, games, kind\) \{([\s\S]*?)\n  \}/) || [])[1] || '';
const savedInfoBody = (ui.match(/function savedInfo\(item\) \{([\s\S]*?)\n  \}/) || [])[1] || '';
function check(label, condition) {
  if (condition) { passes++; console.log('✓ ' + label); }
  else failures.push(label);
}

check('Login Free word limit = 20', /var MAX_WORDS = 20;/.test(word));
check('Login Free sentence limit = 10', /var MAX_SENTENCES = 10;/.test(sentence));
check('Guest cannot add word/sentence personal content', /if \(!_accountReady\(\)\) \{ _requireLogin\(\); return false; \}/.test(word) && /if \(!ready\(\)\) \{ requireLogin\(\); return false; \}/.test(sentence));
check('sentence library reuses account-backed saved-items table', /var TABLE = 'learning_saved_items'/.test(sentence) && /var VAULT_KEY = 'sentence_vault'/.test(sentence));
check('all personal-content surfaces ship current durable-delete clients',
  ['tone-finder.html','reading-game.html','listening-game.html','typing-game.html','word-order.html','vault.html']
    .every((name) => /word-vault\.js\?v=6/.test(read(name))) &&
  ['word-order.html','vault.html'].every((name) => /sentence-vault\.js\?v=2/.test(read(name))));
check('same content merges provenance instead of duplicating', /_mergeMetaIntoWord\(existing, meta\)/.test(word) && /mergeMeta\(existing, meta\)/.test(sentence));
check('Save from a new surface adds provenance before delete behavior', /!_hasSource\(th, meta\.source\)/.test(word) && /!hasSource\(th, meta\.source\)/.test(sentence));
check('delete uses tombstone and does not touch SRS/history tables', /deleted_at: new Date\(\)\.toISOString\(\)/.test(sentence) && !/tone_srs_state|learning_memory|practice_events/.test(sentence));
check('personal deletes use bounded pending retry and online recovery',
  /DELETE_TIMEOUT_MS = 10000/.test(word) && /pendingDeleteCount/.test(word) && /addEventListener\('online', _flushPendingDeletes\)/.test(word) &&
  /DELETE_TIMEOUT_MS = 10000/.test(sentence) && /pendingDeleteCount/.test(sentence) && /addEventListener\('online', flushPendingDeletes\)/.test(sentence));
check('personal vault async completions are scoped to the active owner generation',
  /_ownerGeneration/.test(word) && /_ownerIsCurrent\(owner\)/.test(word) &&
  /_ownerGeneration/.test(sentence) && /ownerIsCurrent\(owner\)/.test(sentence));
check('delete UI does not claim durable success before remote confirmation',
  /已在本機移除/.test(word) && /正在同步刪除/.test(word) && /已在本機移除/.test(sentence) && /正在同步刪除/.test(sentence));
check('account boundary owns sentence local cache', /'sentence_vault_v1'/.test(auth));
check('auth syncs sentence vault on account transition', /SentenceVault\.sync\(sb, uid\)/.test(readingAuth));
check('one page has word and sentence tabs', /personal-content-root/.test(page) && /我的單字/.test(ui) && /我的句子/.test(ui));
check('direct links open the requested personal-content tab', /location\.hash === '#sentences'/.test(ui) && /history\.replaceState\(null, '', '#' \+ tab\)/.test(ui));
check('old tag filter UI is superseded and not executable', /type="text\/plain" data-superseded="phase1-personal-content"/.test(page) && !/currentFilter|vtag-btn/.test(ui));
check('Personal Search stays inside the account render path', /function renderAccount\(\)[\s\S]*searchControls\(update\)/.test(ui) && !/function renderGuest\(\)[\s\S]{0,600}searchControls/.test(ui));
check('near-limit and full-gate messages exist', /remaining <= 3/.test(ui) && /已達免費儲存上限/.test(ui));
check('full gate offers management and disabled upgrade', /管理已儲存內容/.test(ui) && /升級方案/.test(ui) && /upgrade\.disabled = true/.test(ui));
check('item detail exposes three optional information fields', /คำอ่านไทย/.test(ui) && /Romanization/.test(ui) && /中文翻譯/.test(ui));
check('practice actions and save provenance stay separated per item', /練習紀錄/.test(practiceBody) && /儲存資訊/.test(savedInfoBody) && /provenance\(item\)/.test(savedInfoBody));
check('Save provenance alone never labels an item as Played or re-practice', /開始練習/.test(practiceBody) && !/provenance\(item\)/.test(practiceBody) && /playedFor\(item, kind\)/.test(practiceBody));
check('verified gameplay evidence alone enables Played and re-practice copy', /evidence && evidence\.played/.test(practiceBody) && /已練習/.test(practiceBody) && /再練習/.test(practiceBody));
check('Played status has an explicit retry path without changing saved provenance', /playedRequestFailed/.test(practiceBody) && /重新載入練習紀錄/.test(practiceBody) && !/savedInfo\(/.test(practiceBody));
check('word-order Save writes sentence library', /SentenceVault\.createSaveBtn/.test(wordOrder) && !/WordVault\.createSaveBtn\(s\.th/.test(wordOrder));
check('sentence direct practice reuses existing practice mode', /location\.search\.match\(\/\[\?&\]sentence=/.test(wordOrder) && /practiceMode = true;[\s\S]{0,160}SET = \[requestedIndex\]/.test(wordOrder));
check('account export includes every vault key, not only words', /from\('learning_saved_items'\)/.test(exportFn) && !/eq\('vault_key', 'linvault'\)/.test(exportFn));

// Execute the real sentence-vault implementation: duplicate content must stay
// one row while the second Save surface is appended to provenance and upserted.
{
  const store = {};
  const win = {
    localStorage: {
      getItem: (key) => Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null,
      setItem: (key, value) => { store[key] = String(value); },
      removeItem: (key) => { delete store[key]; }
    },
    dispatchEvent() {}, CustomEvent: function () {}
  };
  const upserts = [];
  let failTombstone = false;
  let remoteRows = [];
  const client = {
    from() {
      let mode = '';
      let currentRows = [];
      return {
        select() { mode = 'select'; return this; },
        eq() { return this; },
        upsert(rows) { mode = 'upsert'; currentRows = rows; upserts.push(rows); return this; },
        then(resolve) {
          if (mode === 'select') resolve({ data: remoteRows, error: null });
          else resolve({ error: failTombstone && currentRows[0] && currentRows[0].deleted_at ? { message: 'offline' } : null });
          return this;
        }
      };
    }
  };
  const document = { createElement: () => ({ style: {}, setAttribute() {}, addEventListener() {} }), getElementById: () => null, body: { appendChild() {} } };
  const loadSentence = new Function('window', 'localStorage', 'document', 'CustomEvent', 'console', sentence + '\nreturn window.SentenceVault;');
  const vault = loadSentence(win, win.localStorage, document, win.CustomEvent, { warn() {} });
  vault.sync(client, 'user-1');
  vault.addSentence('ฉันกินข้าว', { zh: '我吃飯', source: 'word-order' });
  vault.addSentence('ฉันกินข้าว', { zh: '我吃飯', source: 'reading-game' });
  const saved = vault.getAll();
  const sources = (saved[0] && saved[0].provenance || []).map((row) => row.source).sort();
  check('sentence duplicate runtime stays one item with both provenance rows', saved.length === 1 && sources.join(',') === 'reading-game,word-order');
  const last = upserts[upserts.length - 1] && upserts[upserts.length - 1][0];
  check('sentence duplicate provenance is upserted to account storage', !!(last && JSON.parse(last.source_raw).provenance.length === 2));

  remoteRows = [{ word_th: 'ฉันกินข้าว', zh: '我吃飯', source_raw: '', deleted_at: null }];
  failTombstone = true;
  vault.removeSentence('ฉันกินข้าว');
  check('sentence failed delete remains hidden with durable pending marker', !vault.has('ฉันกินข้าว') && vault.pendingDeleteCount() === 1);
  check('sentence pending delete blocks a racing re-save', vault.addSentence('ฉันกินข้าว', { zh: '我吃飯' }) === false);
  vault.sync(client, 'user-1');
  check('sentence remote active row cannot resurrect while delete is pending', !vault.has('ฉันกินข้าว') && vault.pendingDeleteCount() === 1);
  failTombstone = false;
  vault.retryPendingDeletes();
  check('sentence successful retry clears pending only after tombstone write', vault.pendingDeleteCount() === 0 && !vault.has('ฉันกินข้าว'));
}

// Execute delayed account transitions against the real SentenceVault runtime.
// A response authorized for owner A must become inert after switching to B or Guest.
{
  function sentenceEnvironment() {
    const store = {};
    const win = {
      localStorage: {
        getItem: (key) => Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null,
        setItem: (key, value) => { store[key] = String(value); },
        removeItem: (key) => { delete store[key]; }
      },
      dispatchEvent() {}, CustomEvent: function () {}
    };
    const document = { createElement: () => ({ style: {}, setAttribute() {}, addEventListener() {} }), getElementById: () => null, body: { appendChild() {} } };
    const load = new Function('window', 'localStorage', 'document', 'CustomEvent', 'console', sentence + '\nreturn window.SentenceVault;');
    return { win, vault: load(win, win.localStorage, document, win.CustomEvent, { warn() {} }) };
  }
  function deferredSentenceClient() {
    const pending = [];
    const log = { tombstones: [], upserts: [] };
    const client = {
      from() {
        const request = { mode: '', rows: [] };
        return {
          select() { request.mode = 'select'; return this; },
          eq() { return this; },
          upsert(rows) {
            request.mode = 'upsert'; request.rows = rows;
            if (rows[0] && rows[0].deleted_at) log.tombstones.push(rows); else log.upserts.push(rows);
            return this;
          },
          then(resolve, reject) { pending.push({ mode: request.mode, resolve, reject }); return this; }
        };
      }
    };
    function settle(mode, result, reject) {
      const index = pending.findIndex((request) => request.mode === mode);
      if (index < 0) throw new Error('no pending sentence ' + mode + ' request');
      const request = pending.splice(index, 1)[0];
      if (reject) request.reject(result); else request.resolve(result);
    }
    return { client, log, pending, resolve(mode, result) { settle(mode, result, false); } };
  }
  function immediateSentenceClient(remote, options) {
    options = options || {};
    const log = { tombstones: [], upserts: [] };
    return {
      log,
      client: {
        from() {
          let mode = '', rows = [];
          return {
            select() { mode = 'select'; return this; },
            eq() { return this; },
            upsert(nextRows) {
              mode = 'upsert'; rows = nextRows;
              if (rows[0] && rows[0].deleted_at) log.tombstones.push(rows); else log.upserts.push(rows);
              return this;
            },
            then(resolve) {
              if (mode === 'select') resolve({ data: remote || [], error: null });
              else resolve({ error: options.upsertError ? { message: options.upsertError } : null });
              return this;
            }
          };
        }
      }
    };
  }

  {
    const { vault } = sentenceEnvironment();
    const ownerA = deferredSentenceClient();
    vault.sync(ownerA.client, 'user-a');
    const ownerB = immediateSentenceClient([{ word_th: 'ประโยคของบี', zh: 'B', source_raw: '', deleted_at: null }]);
    vault.sync(ownerB.client, 'user-b');
    ownerA.resolve('select', { data: [{ word_th: 'ความลับของเอ', zh: 'A', source_raw: '', deleted_at: null }], error: null });
    check('sentence delayed A read cannot merge into account B', vault.has('ประโยคของบี') && !vault.has('ความลับของเอ'));
  }
  {
    const { vault } = sentenceEnvironment();
    const ownerA = deferredSentenceClient();
    vault.sync(ownerA.client, 'user-a');
    vault.addSentence('ประโยคเดียวกัน', { zh: 'A' });
    const ownerB = immediateSentenceClient([], { upsertError: 'offline' });
    vault.sync(ownerB.client, 'user-b');
    vault.addSentence('ประโยคเดียวกัน', { zh: 'B' });
    ownerA.resolve('upsert', { error: null });
    const current = vault.getAll()[0];
    check('sentence delayed A save cannot mark same-key B item synced', current && current.zh === 'B' && current.synced !== true);
  }
  {
    const { vault } = sentenceEnvironment();
    vault.sync(immediateSentenceClient([{ word_th: 'ฉันกินข้าว', zh: 'A', source_raw: '', deleted_at: null }]).client, 'user-a');
    const ownerA = deferredSentenceClient();
    vault.sync(ownerA.client, 'user-a');
    vault.removeSentence('ฉันกินข้าว');
    const ownerB = deferredSentenceClient();
    vault.sync(ownerB.client, 'user-b');
    ownerB.resolve('select', { data: [{ word_th: 'ฉันกินข้าว', zh: 'B', source_raw: '', deleted_at: null }], error: null });
    vault.removeSentence('ฉันกินข้าว');
    ownerA.resolve('upsert', { error: null });
    vault.retryPendingDeletes();
    check('sentence stale A delete completion cannot unlock duplicate B tombstone writes', ownerB.log.tombstones.length === 1);
    ownerB.resolve('upsert', { error: null });
  }
  {
    const { win, vault } = sentenceEnvironment();
    const ownerA = deferredSentenceClient();
    vault.sync(ownerA.client, 'user-a');
    vault.sync(ownerA.client, null);
    ownerA.resolve('select', { data: [{ word_th: 'ความลับหลังล็อกเอาท์', zh: 'A', source_raw: '' }], error: null });
    const raw = JSON.parse(win.localStorage.getItem('sentence_vault_v1') || '[]');
    const rows = Array.isArray(raw) ? raw : (raw.items || []);
    check('sentence delayed A read after logout cannot restore account cache', !rows.some((row) => row.th === 'ความลับหลังล็อกเอาท์'));
  }
}

if (failures.length) {
  console.error('\n❌ 我的內容 Phase 1 ไม่ผ่าน ' + failures.length + ' ข้อ:');
  failures.forEach((failure) => console.error('- ' + failure));
  process.exit(1);
}
console.log('\n✅ 我的內容 Phase 1 ผ่านครบ ' + passes + ' ข้อ');
