/* sentence-vault.js — Phase 1 account-backed 我的句子
 * Reuses learning_saved_items with vault_key='sentence_vault'. No schema change.
 * Saved sentences are independent from SRS/learning history; delete only removes
 * the personal-library relationship. Duplicate Save merges provenance.
 */
(function (global) {
  'use strict';

  var STORAGE_KEY = 'sentence_vault_v1';
  var TABLE = 'learning_saved_items';
  var VAULT_KEY = 'sentence_vault';
  var MAX_SENTENCES = 10;
  var COLS = 'word_th,zh,en,source_raw,saved_at,deleted_at';
  var _sb = null;
  var _uid = null;

  function ready() { return !!(_sb && _uid); }
  function load() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
    catch (e) { return []; }
  }
  function save(rows) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(rows)); } catch (e) {}
  }
  function warn(where, error) {
    try { console.warn('[sentence-vault] ' + where + ':', error && error.message || error); } catch (e) {}
  }
  function changed() {
    try { global.dispatchEvent(new CustomEvent('sentencevault:changed')); } catch (e) {}
  }
  function requireLogin() {
    toast('登入後才能使用「我的句子」');
    try { if (global.READING_AUTH && READING_AUTH.openLoginGate) READING_AUTH.openLoginGate(); } catch (e) {}
  }
  function provenance(entry) {
    var rows = Array.isArray(entry && entry.provenance) ? entry.provenance.slice() : [];
    if (!rows.length && entry && entry.source) rows.push({ source: entry.source, saved_at: entry.saved_at || Date.now() });
    return rows.filter(function (row) { return row && row.source; });
  }
  function sourceRaw(entry) {
    return JSON.stringify({ kind: 'sentence', readingTH: entry.readingTH || '', provenance: provenance(entry) });
  }
  function decode(raw, savedAt) {
    var result = { source: '', readingTH: '', provenance: [] };
    if (!raw) return result;
    try {
      var parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        result.readingTH = parsed.readingTH || '';
        result.provenance = Array.isArray(parsed.provenance) ? parsed.provenance.filter(function (row) { return row && row.source; }) : [];
        result.source = result.provenance.length ? result.provenance[0].source : '';
        return result;
      }
    } catch (e) {}
    result.source = String(raw);
    result.provenance = [{ source: result.source, saved_at: savedAt || Date.now() }];
    return result;
  }
  function mergeMeta(entry, meta) {
    meta = meta || {};
    var changedMeta = false;
    if (!entry.zh && meta.zh) { entry.zh = meta.zh; changedMeta = true; }
    if (!entry.en && meta.en) { entry.en = meta.en; changedMeta = true; }
    if (!entry.readingTH && meta.readingTH) { entry.readingTH = meta.readingTH; changedMeta = true; }
    if (meta.source) {
      var rows = provenance(entry);
      if (!rows.some(function (row) { return row.source === meta.source; })) {
        rows.push({ source: meta.source, saved_at: Date.now() });
        entry.provenance = rows;
        if (!entry.source) entry.source = meta.source;
        changedMeta = true;
      }
    }
    return changedMeta;
  }
  function rowFor(entry) {
    return {
      user_id: _uid, vault_key: VAULT_KEY, word_th: entry.th,
      zh: entry.zh || null, en: entry.en || null,
      source_raw: sourceRaw(entry), tags: [], deleted_at: null
    };
  }
  function push(entry) {
    if (!ready()) return;
    _sb.from(TABLE).upsert([rowFor(entry)], { onConflict: 'user_id,vault_key,word_th' })
      .then(function (res) {
        if (res && res.error) { warn('save failed', res.error); return; }
        var rows = load();
        rows.forEach(function (row) { if (row.th === entry.th) row.synced = true; });
        save(rows);
      }, function (error) { warn('save failed', error); });
  }
  function mergeRemote(remote) {
    var local = load();
    var active = {}, deleted = {};
    (remote || []).forEach(function (row) {
      if (!row || !row.word_th) return;
      if (row.deleted_at) deleted[row.word_th] = row; else active[row.word_th] = row;
    });
    var seen = {}, merged = [], upload = [];
    local.forEach(function (entry) {
      if (!entry || !entry.th) return;
      seen[entry.th] = true;
      if (active[entry.th]) {
        var remoteMeta = decode(active[entry.th].source_raw, active[entry.th].saved_at);
        mergeMeta(entry, { zh: active[entry.th].zh || '', en: active[entry.th].en || '', readingTH: remoteMeta.readingTH, source: remoteMeta.source });
        remoteMeta.provenance.forEach(function (row) {
          if (!provenance(entry).some(function (existing) { return existing.source === row.source; })) entry.provenance.push(row);
        });
        entry.synced = true;
        merged.push(entry);
      } else if (deleted[entry.th] && entry.synced === true) {
        // Explicit tombstone is the only condition that removes a synced local item.
      } else {
        merged.push(entry);
        if (entry.synced !== true) upload.push(entry);
      }
    });
    (remote || []).forEach(function (row) {
      if (!row || !row.word_th || row.deleted_at || seen[row.word_th]) return;
      var meta = decode(row.source_raw, row.saved_at);
      merged.push({
        th: row.word_th, zh: row.zh || '', en: row.en || '', readingTH: meta.readingTH,
        source: meta.source, provenance: meta.provenance,
        saved_at: row.saved_at ? Date.parse(row.saved_at) || Date.now() : Date.now(), synced: true
      });
    });
    save(merged);
    changed();
    upload.forEach(push);
  }
  function sync(client, userId) {
    var nextUid = userId || null;
    var previousUid = _uid;
    try {
      if (global.PHASE1_ACCOUNT_BOUNDARY && PHASE1_ACCOUNT_BOUNDARY.bind) PHASE1_ACCOUNT_BOUNDARY.bind(nextUid ? { id: nextUid } : null);
      else if (previousUid !== nextUid) localStorage.removeItem(STORAGE_KEY);
    } catch (e) {}
    _sb = client && client.from ? client : null;
    _uid = nextUid;
    if (!ready()) { _sb = null; _uid = null; changed(); return; }
    _sb.from(TABLE).select(COLS).eq('user_id', _uid).eq('vault_key', VAULT_KEY)
      .then(function (res) {
        if (res && res.error) { warn('read failed', res.error); return; }
        mergeRemote(res && res.data || []);
      }, function (error) { warn('read failed', error); });
  }
  function addSentence(th, meta) {
    if (!ready()) { requireLogin(); return false; }
    var rows = load(), existing = null;
    rows.some(function (row) { if (row.th === th) { existing = row; return true; } return false; });
    if (existing) {
      if (mergeMeta(existing, meta)) { save(rows); push(existing); changed(); }
      return false;
    }
    if (rows.length >= MAX_SENTENCES) { fullToast(); return false; }
    var now = Date.now();
    var entry = {
      th: th, zh: meta && meta.zh || '', en: meta && meta.en || '',
      readingTH: meta && meta.readingTH || '', source: meta && meta.source || '',
      provenance: meta && meta.source ? [{ source: meta.source, saved_at: now }] : [],
      saved_at: now
    };
    rows.push(entry); save(rows); push(entry); changed(); return true;
  }
  function removeSentence(th) {
    if (!ready()) { requireLogin(); return false; }
    save(load().filter(function (row) { return row.th !== th; }));
    changed();
    _sb.from(TABLE).upsert([{
      user_id: _uid, vault_key: VAULT_KEY, word_th: th, deleted_at: new Date().toISOString()
    }], { onConflict: 'user_id,vault_key,word_th' }).then(function (res) {
      if (res && res.error) warn('delete failed', res.error);
    }, function (error) { warn('delete failed', error); });
    return true;
  }
  function has(th) { return ready() && load().some(function (row) { return row.th === th; }); }
  function hasSource(th, source) {
    if (!source) return true;
    var match = null;
    load().some(function (row) { if (row.th === th) { match = row; return true; } return false; });
    return !!(match && provenance(match).some(function (row) { return row.source === source; }));
  }
  function getAll() { return ready() ? load() : []; }
  function isFull() { return ready() && load().length >= MAX_SENTENCES; }
  function createSaveBtn(th, meta, options) {
    options = options || {};
    var button = document.createElement('button');
    button.className = 'vault-save-btn sentence-vault-save-btn';
    function refresh() {
      var saved = has(th);
      button.setAttribute('data-saved', saved ? '1' : '0');
      button.textContent = '🔖';
      button.setAttribute('aria-label', saved ? '從我的句子移除' : '儲存到我的句子');
    }
    refresh();
    button.addEventListener('click', function (event) {
      event.stopPropagation();
      if (!ready()) { requireLogin(); return; }
      if (has(th)) {
        if (meta && meta.source && !hasSource(th, meta.source)) {
          addSentence(th, meta); refresh(); toast('已更新句子的儲存來源');
          if (options.onSave) options.onSave(th);
        } else {
          removeSentence(th); refresh(); toast('已從「我的句子」移除');
          if (options.onRemove) options.onRemove(th);
        }
      } else if (addSentence(th, meta)) {
        refresh(); toast('已儲存到「我的句子」');
        if (options.onSave) options.onSave(th);
      }
    });
    return button;
  }
  function toast(message) {
    var node = document.getElementById('sentence-vault-toast');
    if (!node) {
      node = document.createElement('div'); node.id = 'sentence-vault-toast';
      node.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:rgba(40,40,40,.9);color:#fff;padding:8px 18px;border-radius:20px;font-size:14px;z-index:9999;opacity:0;transition:opacity .2s';
      document.body.appendChild(node);
    }
    node.textContent = message; node.style.opacity = '1';
    clearTimeout(node._timer); node._timer = setTimeout(function () { node.style.opacity = '0'; }, 2600);
  }
  function fullToast() {
    toast('已達免費儲存上限。請刪除部分內容後再新增，或升級方案以儲存更多。');
  }

  global.SentenceVault = {
    addSentence: addSentence, removeSentence: removeSentence,
    getAll: getAll, has: has, isFull: isFull,
    count: function () { return ready() ? load().length : 0; },
    MAX_SENTENCES: MAX_SENTENCES, createSaveBtn: createSaveBtn, sync: sync
  };
})(window);
