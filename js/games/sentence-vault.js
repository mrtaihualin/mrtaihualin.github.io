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
  var _ownerGeneration = 0;
  var _deleteInFlight = Object.create(null);
  var _deleteIntent = Object.create(null);
  var _saveInFlight = Object.create(null);
  var _saveAgain = Object.create(null);
  var DELETE_TIMEOUT_MS = 10000;

  function ready() { return !!(_sb && _uid); }
  function loadState() {
    try {
      var parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      if (Array.isArray(parsed)) return { items: parsed, pendingDeletes: {} };
      if (!parsed || typeof parsed !== 'object') return { items: [], pendingDeletes: {} };
      return {
        items: Array.isArray(parsed.items) ? parsed.items : [],
        pendingDeletes: parsed.pendingDeletes && typeof parsed.pendingDeletes === 'object' ? parsed.pendingDeletes : {}
      };
    } catch (e) { return { items: [], pendingDeletes: {} }; }
  }
  function saveState(state) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) {}
  }
  function load() { return loadState().items; }
  function save(rows) {
    var state = loadState(); state.items = rows; saveState(state);
  }
  function warn(where, error) {
    try { console.warn('[sentence-vault] ' + where + ':', error && error.message || error); } catch (e) {}
  }
  function ownerSnapshot() {
    return { client: _sb, uid: _uid, generation: _ownerGeneration };
  }
  function ownerIsCurrent(owner) {
    return !!(owner && owner.client === _sb && owner.uid === _uid && owner.generation === _ownerGeneration);
  }
  function bounded(operation, label, done, onLate) {
    var settled = false;
    var timer = setTimeout(function () {
      if (settled) return;
      settled = true;
      var error = new Error('NETWORK_TIMEOUT'); error.code = 'NETWORK_TIMEOUT';
      warn(label, error); done(error);
    }, DELETE_TIMEOUT_MS);
    function finish(error) {
      if (settled) { if (onLate) onLate(error || null); return; }
      settled = true; clearTimeout(timer); done(error || null);
    }
    try {
      var request = operation();
      if (!request || typeof request.then !== 'function') { finish(new Error('REQUEST_UNAVAILABLE')); return; }
      request.then(function (res) { finish(res && res.error); }, finish);
    } catch (error) { finish(error); }
  }
  function pendingDelete(th) { return loadState().pendingDeletes[th] || null; }
  function queueDelete(th) {
    var state = loadState();
    if (!state.pendingDeletes[th]) state.pendingDeletes[th] = { deleted_at: new Date().toISOString() };
    _deleteIntent[th] = state.pendingDeletes[th].deleted_at;
    state.items = state.items.filter(function (row) { return row.th !== th; });
    saveState(state); return state.pendingDeletes[th];
  }
  function clearPendingDelete(th, deletedAt) {
    var state = loadState(); var pending = state.pendingDeletes[th];
    if (pending && pending.deleted_at === deletedAt) { delete state.pendingDeletes[th]; saveState(state); }
  }
  function pendingDeleteCount() { return Object.keys(loadState().pendingDeletes).length; }
  function currentSentence(th) {
    var found = null;
    load().some(function (row) { if (row && row.th === th) { found = row; return true; } return false; });
    return found;
  }
  function flushPendingDeletes(owner) {
    owner = owner || ownerSnapshot();
    if (!ownerIsCurrent(owner)) return;
    Object.keys(loadState().pendingDeletes).forEach(function (th) {
      if (_deleteInFlight[th]) return;
      var pending = pendingDelete(th); if (!pending) return;
      _deleteInFlight[th] = true;
      bounded(function () {
        return owner.client.from(TABLE).upsert([{
          user_id: owner.uid, vault_key: VAULT_KEY, word_th: th, deleted_at: pending.deleted_at
        }], { onConflict: 'user_id,vault_key,word_th' });
      }, 'delete failed', function (error) {
        if (!ownerIsCurrent(owner)) return;
        delete _deleteInFlight[th];
        if (error) { warn('delete failed', error); return; }
        clearPendingDelete(th, pending.deleted_at); changed();
      });
    });
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
  function rowFor(entry, ownerUid) {
    return {
      user_id: ownerUid || _uid, vault_key: VAULT_KEY, word_th: entry.th,
      zh: entry.zh || null, en: entry.en || null,
      source_raw: sourceRaw(entry), tags: [], deleted_at: null
    };
  }
  function sameRemoteRow(entry, remoteRow, ownerUid) {
    if (!entry || !remoteRow) return false;
    return JSON.stringify(rowFor(entry, ownerUid)) === JSON.stringify(remoteRow);
  }
  function push(th, owner) {
    owner = owner || ownerSnapshot();
    if (!ownerIsCurrent(owner) || pendingDelete(th)) return;
    var entry = currentSentence(th);
    if (!entry || entry.synced === true) return;
    if (_saveInFlight[th]) { _saveAgain[th] = true; return; }
    delete _saveAgain[th];
    var remoteRow = rowFor(entry, owner.uid);
    _saveInFlight[th] = true;
    bounded(function () {
      return owner.client.from(TABLE).upsert([remoteRow], { onConflict: 'user_id,vault_key,word_th' });
    }, 'save failed', function (error) {
      if (!ownerIsCurrent(owner)) return;
      delete _saveInFlight[th];
      if (error) { warn('save failed', error); return; }
      var current = currentSentence(th);
      if (_saveAgain[th] || (current && !sameRemoteRow(current, remoteRow, owner.uid))) {
        delete _saveAgain[th];
        if (current && !pendingDelete(th)) push(th, owner);
        return;
      }
      if (!current || pendingDelete(th)) return;
      var rows = load();
      rows.forEach(function (row) { if (row.th === th) row.synced = true; });
      save(rows); changed();
    }, function () {
      if (!ownerIsCurrent(owner)) return;
      var deletedAt = _deleteIntent[th];
      if (!deletedAt || currentSentence(th)) return;
      var state = loadState();
      if (!state.pendingDeletes[th]) state.pendingDeletes[th] = { deleted_at: deletedAt };
      saveState(state);
      flushPendingDeletes(owner);
    });
  }
  function flushPendingSaves(owner) {
    owner = owner || ownerSnapshot();
    if (!ownerIsCurrent(owner)) return;
    load().forEach(function (entry) {
      if (entry && entry.th && entry.synced !== true && !pendingDelete(entry.th)) push(entry.th, owner);
    });
  }
  function handleOnline() {
    var owner = ownerSnapshot();
    if (!ownerIsCurrent(owner)) return;
    flushPendingDeletes(owner);
    flushPendingSaves(owner);
  }
  function mergeRemote(remote, owner) {
    if (!ownerIsCurrent(owner)) return;
    var state = loadState();
    var local = state.items;
    var pendingDeletes = state.pendingDeletes;
    var active = {}, deleted = {};
    (remote || []).forEach(function (row) {
      if (!row || !row.word_th) return;
      if (pendingDeletes[row.word_th]) return;
      if (row.deleted_at) deleted[row.word_th] = row; else active[row.word_th] = row;
    });
    var seen = {}, merged = [], upload = [];
    local.forEach(function (entry) {
      if (!entry || !entry.th) return;
      seen[entry.th] = true;
      if (active[entry.th]) {
        var needsUpload = entry.synced !== true;
        var remoteMeta = decode(active[entry.th].source_raw, active[entry.th].saved_at);
        mergeMeta(entry, { zh: active[entry.th].zh || '', en: active[entry.th].en || '', readingTH: remoteMeta.readingTH, source: remoteMeta.source });
        remoteMeta.provenance.forEach(function (row) {
          if (!provenance(entry).some(function (existing) { return existing.source === row.source; })) entry.provenance.push(row);
        });
        entry.synced = !needsUpload;
        merged.push(entry);
        if (needsUpload) upload.push(entry);
      } else if (deleted[entry.th] && entry.synced === true) {
        // Explicit tombstone is the only condition that removes a synced local item.
      } else {
        merged.push(entry);
        if (entry.synced !== true) upload.push(entry);
      }
    });
    (remote || []).forEach(function (row) {
      if (!row || !row.word_th || row.deleted_at || seen[row.word_th] || pendingDeletes[row.word_th]) return;
      var meta = decode(row.source_raw, row.saved_at);
      merged.push({
        th: row.word_th, zh: row.zh || '', en: row.en || '', readingTH: meta.readingTH,
        source: meta.source, provenance: meta.provenance,
        saved_at: row.saved_at ? Date.parse(row.saved_at) || Date.now() : Date.now(), synced: true
      });
    });
    save(merged);
    changed();
    upload.forEach(function (entry) { push(entry.th, owner); });
    flushPendingDeletes(owner);
  }
  function sync(client, userId) {
    var nextUid = userId || null;
    var nextClient = client && client.from ? client : null;
    var previousUid = _uid;
    try {
      if (global.PHASE1_ACCOUNT_BOUNDARY && PHASE1_ACCOUNT_BOUNDARY.bind) PHASE1_ACCOUNT_BOUNDARY.bind(nextUid ? { id: nextUid } : null);
      else if (previousUid !== nextUid) localStorage.removeItem(STORAGE_KEY);
    } catch (e) {}
    if (_sb !== nextClient || _uid !== nextUid) {
      _ownerGeneration++;
      _deleteInFlight = Object.create(null);
      _deleteIntent = Object.create(null);
      _saveInFlight = Object.create(null);
      _saveAgain = Object.create(null);
    }
    _sb = nextClient;
    _uid = nextUid;
    if (!ready()) { _sb = null; _uid = null; changed(); return; }
    var owner = ownerSnapshot();
    owner.client.from(TABLE).select(COLS).eq('user_id', owner.uid).eq('vault_key', VAULT_KEY)
      .then(function (res) {
        if (!ownerIsCurrent(owner)) return;
        if (res && res.error) { warn('read failed', res.error); flushPendingDeletes(owner); return; }
        mergeRemote(res && res.data || [], owner);
      }, function (error) {
        if (!ownerIsCurrent(owner)) return;
        warn('read failed', error); flushPendingDeletes(owner);
      });
  }
  function addSentence(th, meta) {
    if (!ready()) { requireLogin(); return false; }
    if (pendingDelete(th)) { toast('正在同步刪除，請稍後再儲存'); flushPendingDeletes(); return false; }
    delete _deleteIntent[th];
    var rows = load(), existing = null;
    rows.some(function (row) { if (row.th === th) { existing = row; return true; } return false; });
    if (existing) {
      if (mergeMeta(existing, meta)) { existing.synced = false; save(rows); push(existing.th, ownerSnapshot()); changed(); }
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
    rows.push(entry); save(rows); push(entry.th, ownerSnapshot()); changed(); return true;
  }
  function removeSentence(th) {
    if (!ready()) { requireLogin(); return false; }
    delete _saveAgain[th];
    queueDelete(th); changed(); flushPendingDeletes();
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
          removeSentence(th); refresh(); toast('已在本機移除，正在同步刪除');
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
    MAX_SENTENCES: MAX_SENTENCES, createSaveBtn: createSaveBtn, sync: sync,
    retryPendingDeletes: flushPendingDeletes, pendingDeleteCount: pendingDeleteCount
  };
  if (global.addEventListener) global.addEventListener('online', handleOnline);
})(window);
