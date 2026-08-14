/**
 * lego-vault.js — คลังคำเฉพาะเกมเลโก้ (Login Free)
 *
 * Phase 1 rules:
 * - Guest เล่น Lego ได้ แต่คลังส่วนตัวเริ่มหลัง Login เท่านั้น
 * - cache ในเครื่องผูกกับ account owner และห้าม import Guest data ย้อนหลัง
 * - sync กับ learning_saved_items โดยใช้ vault_key='lego_vault'
 * - การลบใช้ tombstone เมื่อ schema พร้อม เพื่อไม่ให้คำกลับมาจากเครื่องอื่น
 */
(function (global) {
  'use strict';

  var STORAGE_KEY = 'lego_vault_v1';
  var MAX_WORDS = 15;
  var TABLE = 'learning_saved_items';
  var VAULT_KEY = 'lego_vault';
  var _sb = null;
  var _uid = null;
  var _tombstoneOk = null;
  var _syncingUid = null;

  function warn(where, err) {
    try { console.warn('[lego-vault] ' + where + ':', (err && err.message) || err); } catch (_) {}
  }
  function load() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
    catch (e) { return []; }
  }
  function save(list) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); } catch (e) {}
  }
  function ready() { return !!(_sb && _uid); }
  function fireChanged() {
    try { global.dispatchEvent(new CustomEvent('legovault:changed')); } catch (e) {}
    try { if (typeof global.refreshLegoAcctUI === 'function') global.refreshLegoAcctUI(); } catch (e) {}
    try { if (typeof global.renderBaseplate === 'function') global.renderBaseplate(); } catch (e) {}
  }
  function rowFor(word) {
    return {
      user_id: _uid,
      vault_key: VAULT_KEY,
      word_th: word.th,
      zh: word.zh || null,
      source_raw: 'lego',
      tags: [],
      deleted_at: null
    };
  }
  function missingTombstone(err) {
    var msg = String((err && err.message) || err || '');
    return !!err && (err.code === '42703' || msg.indexOf('deleted_at') !== -1);
  }
  function pushRows(words, done) {
    if (!ready() || !words.length) { if (done) done(); return; }
    _sb.from(TABLE).upsert(words.map(rowFor), { onConflict: 'user_id,vault_key,word_th' })
      .then(function (res) {
        if (res && res.error) warn('อัปโหลดไม่สำเร็จ', res.error);
        if (done) done(res && res.error);
      }, function (err) { warn('อัปโหลดไม่สำเร็จ', err); if (done) done(err); });
  }
  function readRemote(done) {
    var cols = _tombstoneOk === false
      ? 'word_th,zh,source_raw,saved_at'
      : 'word_th,zh,source_raw,saved_at,deleted_at';
    _sb.from(TABLE).select(cols).eq('user_id', _uid).eq('vault_key', VAULT_KEY)
      .then(function (res) {
        if (res && res.error) {
          if (_tombstoneOk !== false && missingTombstone(res.error)) {
            _tombstoneOk = false;
            warn('ยังไม่มี deleted_at — sync แบบ legacy', res.error);
            readRemote(done);
          } else warn('อ่านข้อมูลไม่สำเร็จ', res.error);
          return;
        }
        if (_tombstoneOk !== false) _tombstoneOk = true;
        done((res && res.data) || []);
      }, function (err) { warn('อ่านข้อมูลไม่สำเร็จ', err); });
  }
  function merge(remote) {
    var local = load();
    var active = {};
    var deleted = {};
    remote.forEach(function (row) {
      if (!row || !row.word_th) return;
      if (row.deleted_at) deleted[row.word_th] = row;
      else active[row.word_th] = row;
    });
    var localMap = {};
    var merged = [];
    var upload = [];
    local.forEach(function (word) {
      if (!word || !word.th) return;
      localMap[word.th] = true;
      if (active[word.th]) {
        word.synced = true;
        merged.push(word);
      } else if (deleted[word.th] && word.synced === true) {
        // เจ้าของลบจากอีกเครื่องแล้ว
      } else {
        merged.push(word);
        if (word.synced !== true) upload.push(word);
      }
    });
    remote.forEach(function (row) {
      if (!row || !row.word_th || row.deleted_at || localMap[row.word_th]) return;
      merged.push({
        th: row.word_th,
        zh: row.zh || '',
        source: row.source_raw || 'lego',
        saved_at: row.saved_at ? Date.parse(row.saved_at) || Date.now() : Date.now(),
        synced: true
      });
    });
    save(merged);
    fireChanged();
    if (upload.length) pushRows(upload, function (err) {
      if (err) return;
      var uploaded = {};
      upload.forEach(function (word) { uploaded[word.th] = true; });
      var latest = load();
      latest.forEach(function (word) { if (uploaded[word.th]) word.synced = true; });
      save(latest);
    });
  }
  function sync(client, userId) {
    var nextUid = userId || null;
    var previousUid = _uid;
    try {
      if (global.PHASE1_ACCOUNT_BOUNDARY && global.PHASE1_ACCOUNT_BOUNDARY.bind) {
        global.PHASE1_ACCOUNT_BOUNDARY.bind(nextUid ? { id: nextUid } : null);
      } else if (previousUid !== nextUid) {
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch (e) {}
    _sb = (client && client.from) ? client : null;
    _uid = nextUid;
    if (!ready()) {
      _sb = null;
      _uid = null;
      _syncingUid = null;
      fireChanged();
      return;
    }
    if (_syncingUid === _uid) return;
    _syncingUid = _uid;
    readRemote(function (rows) { merge(rows); });
  }
  function addWord(th, meta) {
    if (!ready()) return false;
    var list = load();
    if (list.some(function (word) { return word.th === th; })) return false;
    if (list.length >= MAX_WORDS) return false;
    var word = {
      th: th,
      zh: (meta && meta.zh) || '',
      source: 'lego',
      saved_at: Date.now()
    };
    list.push(word);
    save(list);
    pushRows([word], function (err) {
      if (err) return;
      var latest = load();
      latest.forEach(function (item) { if (item.th === th) item.synced = true; });
      save(latest);
    });
    fireChanged();
    return true;
  }
  function hardDelete(th) {
    _sb.from(TABLE).delete().eq('user_id', _uid).eq('vault_key', VAULT_KEY).eq('word_th', th)
      .then(function (res) { if (res && res.error) warn('ลบแบบ legacy ไม่สำเร็จ', res.error); },
            function (err) { warn('ลบแบบ legacy ไม่สำเร็จ', err); });
  }
  function removeWord(th) {
    if (!ready()) return false;
    save(load().filter(function (word) { return word.th !== th; }));
    fireChanged();
    if (_tombstoneOk === false) { hardDelete(th); return true; }
    _sb.from(TABLE).upsert([{
      user_id: _uid,
      vault_key: VAULT_KEY,
      word_th: th,
      deleted_at: new Date().toISOString()
    }], { onConflict: 'user_id,vault_key,word_th' }).then(function (res) {
      if (!res || !res.error) { _tombstoneOk = true; return; }
      if (missingTombstone(res.error)) {
        _tombstoneOk = false;
        hardDelete(th);
      } else warn('ลบไม่สำเร็จ', res.error);
    }, function (err) { warn('ลบไม่สำเร็จ', err); });
    return true;
  }
  function getAll() { return ready() ? load() : []; }
  function has(th) { return ready() && load().some(function (word) { return word.th === th; }); }
  function count() { return ready() ? load().length : 0; }
  function isFull() { return ready() && load().length >= MAX_WORDS; }

  global.LegoVault = {
    MAX_WORDS: MAX_WORDS,
    addWord: addWord,
    removeWord: removeWord,
    getAll: getAll,
    has: has,
    count: count,
    isFull: isFull,
    sync: sync,
    accountReady: ready
  };

  // ปิด race ที่ reading-auth อาจได้รับ session ก่อนสคริปต์นี้ execute
  try {
    if (global.SITE_AUTH && global.SITE_AUTH.onChange) {
      global.SITE_AUTH.onChange(function (user) {
        var client = global.getSupabaseClient ? global.getSupabaseClient() : null;
        sync(client, user && user.id);
      });
    }
  } catch (e) {}
})(window);
