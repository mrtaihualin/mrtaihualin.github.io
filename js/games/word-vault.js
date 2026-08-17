/**
 * word-vault.js — คลังคำร่วม (Shared Word Vault)
 * ใช้ร่วมกันทุกเกม: tone-finder, reading-game, typing-game, lego-game (อนาคต)
 * เก็บข้อมูลใน localStorage ภายใต้ key "linvault_v1"
 * FILE MAP: [01] storage → [02] sync ข้ามเครื่อง → [03] vault API → [04] UI helpers → [05] badge/styles → [06] export
 *
 * ════════════════════════════════════════════════════════════════════════
 * 🔄 sync ข้ามเครื่อง (เพิ่ม 2026-08-11 ตามกติกาที่ Lin กำหนด)
 * ────────────────────────────────────────────────────────────────────────
 * กติกาที่ Lin สั่งไว้ (ยึดตามนี้ทุกข้อ):
 *   1. รวมคำจากทุกเครื่องเข้าบัญชีเดียวกันได้ **แม้จำนวนรวมเกินเพดาน Login Free 20**
 *   2. **ห้ามลบคำอัตโนมัติเพื่อบังคับเพดาน**
 *   3. **ห้ามทำข้อมูลเดิมหาย**
 *   4. เกินเพดาน → **บล็อกการเพิ่มคำใหม่ชั่วคราว** (ไม่ใช่ตัดคำทิ้ง)
 *   5. ใช้ระบบ account/database/sync เดิม ห้ามสร้างระบบซ้ำ
 *   6. Phase 1: คลังส่วนตัวเริ่มหลัง Login เท่านั้น และห้าม import ของ Guest ย้อนหลัง
 *
 * ของเดิมที่ใช้ต่อ ไม่สร้างใหม่:
 *   · client + session — `window.getSupabaseClient()` / `window.SITE_AUTH` ตัวเดียวกับทุกหน้า
 *   · จุดเรียก sync — `setUser()` ใน js/games/reading-auth.js จุดเดียวกับ `GAME_ACCOUNT.sync()`
 *     (มีด่านกันยิงซ้ำอยู่แล้ว: ยิงเฉพาะตอน user id เปลี่ยนจริง)
 *   · ที่เก็บฝั่งเซิร์ฟเวอร์ — ตาราง `learning_saved_items` (จาก supabase/sql/2026-08-11_learning_foundation.sql)
 *   · รูปแบบ remote-authoritative — ท่าเดียวกับ `GAME_ACCOUNT.sync()`
 *
 * 🔑 กฎการรวม 6 กรณี — ยึดหลักเดียว: **"ไม่มีข้อมูลบนเซิร์ฟเวอร์" ห้ามแปลว่า "ถูกลบ"**
 *   ลบคำในเครื่องได้ทางเดียวคือ "เห็นตราการลบ (deleted_at) ชัดเจน" เท่านั้น
 *
 *   ก. มีทั้ง 2 ฝั่ง ยังใช้งานอยู่                → เก็บไว้ ปั๊มว่า synced แล้ว
 *   ข. มีตราลบ + คำในเครื่อง **เคย synced แล้ว**  → เจ้าของสั่งลบจริง → **ลบในเครื่องด้วย**
 *   ค. มีตราลบ + คำในเครื่อง **ยังไม่เคย synced** → ผู้ใช้เพิ่งเซฟใหม่ที่เครื่องนี้ → เก็บไว้ + ส่งขึ้น
 *                                                   (ของใหม่ชนะตราเก่า · `_rowFor` ล้างตราให้เอง)
 *   ง. ไม่มีแถวเลย + **เคย synced แล้ว**          → อาจเป็นเพราะอ่านมาไม่ครบ → **เก็บไว้ ไม่ลบ ไม่ส่งซ้ำ**
 *   จ. ไม่มีแถวเลย + ยังไม่เคย synced             → ของใหม่จากเครื่องนี้ → ส่งขึ้น
 *   ฉ. มีแต่บนเซิร์ฟเวอร์ (ยังใช้งานอยู่)          → ดึงลงมา (ไม่ตัดทิ้งแม้รวมกันเกิน 30)
 *
 * แยก 4 สถานการณ์ที่หน้าตาคล้ายกันออกจากกันได้เพราะหลักข้างบน:
 *   1. เจ้าของสั่งลบจริง       → มีแถว + deleted_at ไม่ว่าง → ลบตาม (กรณี ข.)
 *   2. เซิร์ฟเวอร์ยังไม่มีข้อมูล → ไม่มีแถวเลย              → เก็บไว้ + ส่งขึ้น (กรณี จ.)
 *   3. อ่านมาไม่ครบ             → แถวบางส่วนหาย            → เก็บไว้ ไม่ลบ (กรณี ง.)
 *   4. เน็ตหลุด/อ่านพลาด        → select ตอบ error          → ไม่แตะอะไรเลย (`_readRemote`)
 *
 * 🗑️ การลบ: ผู้ใช้กดลบ → **ปั๊มตรา `deleted_at`** ไม่ลบแถวทิ้ง (ดู `_deleteRemote`)
 *   ถ้าลบแถวทิ้ง เครื่องอื่นจะเห็นแค่ "ไม่มีแถว" ซึ่งแยกไม่ออกจากกรณี 3 → คำที่ลบแล้วจะไม่หายจริง
 *   ระบบไม่เคยลบคำเองอัตโนมัติ (ห้ามลบเพราะเกินเพดาน — เกินแล้วบล็อกการเพิ่มใหม่แทน)
 *
 * ⚠️ ต้องรัน `supabase/sql/2026-08-11_word_vault_deletion_sync.sql` ก่อน การลบข้ามเครื่องจึงทำงาน
 *   ถ้ายังไม่รัน โค้ดนี้ **ถอยไปทำงานแบบเดิมเองอัตโนมัติ** (sync ปกติ แต่ยังไม่ลบข้ามเครื่อง)
 *   ไม่พัง ไม่เงียบ — เขียน console.warn บอกไว้ (ดู `_isMissingTombstoneColumn`)
 *
 * ✅ ปลอดภัยแม้ยังไม่ได้รันไฟล์ SQL: ถ้าตาราง `learning_saved_items` ยังไม่มี
 *    ทุก query จะ error แล้วถูกกลืนเงียบ (เขียน console.warn ไว้ให้ debug) → คลังคำทำงานแบบเดิม 100%
 * ════════════════════════════════════════════════════════════════════════
 */

(function(global) {
  'use strict';

  var STORAGE_KEY = 'linvault_v1';
  // Phase 1 Login Free limit — Lin 2026-08-14. Paid quota remains Future.
  var MAX_WORDS = 20;

  // ── ค่าที่ใช้คุยกับเซิร์ฟเวอร์ ──
  var TABLE = 'learning_saved_items';
  var VAULT_KEY = 'linvault';        // ตรงกับคอลัมน์ vault_key (คลังของเกมเลโก้ใช้ 'lego_vault' — ยังไม่แตะรอบนี้)
  var _sb = null;                    // supabase client (null = ยังไม่ล็อกอิน / ไม่มี client)
  var _uid = null;                   // user id ที่ล็อกอินอยู่
  var _ownerGeneration = 0;         // invalidate async completions after account/client changes
  // ฐานข้อมูลนี้มีคอลัมน์ deleted_at (ตราการลบ) แล้วหรือยัง
  //   null = ยังไม่รู้ · true = มี · false = ยังไม่มี (ยังไม่ได้รัน 2026-08-11_word_vault_deletion_sync.sql)
  // ต้องมีตัวนี้เพราะโค้ดฝั่งเว็บถูก push ขึ้นเว็บก่อนที่ Lin จะรัน SQL บน production ได้
  // → ถ้าไม่เผื่อไว้ sync จะพังทั้งระบบระหว่างช่วงรอยต่อนั้น (แย่กว่าเดิม)
  var _tombstoneOk = null;
  var _deleteInFlight = Object.create(null);
  var _deleteIntent = Object.create(null);
  var _saveInFlight = Object.create(null);
  var _saveAgain = Object.create(null);
  var DELETE_TIMEOUT_MS = 10000;
  var COLS_WITH_TOMBSTONE = 'word_th,zh,en,source_raw,tags,saved_at,deleted_at';
  var COLS_LEGACY        = 'word_th,zh,en,source_raw,tags,saved_at';

  function _accountReady() {
    return !!(_sb && _uid);
  }

  function _requireLogin() {
    _showToast('登入後才能使用「我的單字」');
    try {
      if (global.READING_AUTH && global.READING_AUTH.openLoginGate) {
        global.READING_AUTH.openLoginGate();
      }
    } catch (e) {}
  }

  // ── โหลด/บันทึก ──────────────────────────────────────────────
  function _loadState() {
    try {
      var parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      if (Array.isArray(parsed)) return { items: parsed, pendingDeletes: {} };
      if (!parsed || typeof parsed !== 'object') return { items: [], pendingDeletes: {} };
      return {
        items: Array.isArray(parsed.items) ? parsed.items : [],
        pendingDeletes: parsed.pendingDeletes && typeof parsed.pendingDeletes === 'object' ? parsed.pendingDeletes : {}
      };
    } catch(e) { return { items: [], pendingDeletes: {} }; }
  }
  function _saveState(state) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch(e) {}
  }
  function load() { return _loadState().items; }
  function save(list) {
    var state = _loadState();
    state.items = list;
    _saveState(state);
  }

  // ── [02] sync ข้ามเครื่อง ─────────────────────────────────────
  // ทุกอย่างในก้อนนี้ "พังได้แบบไม่ทำให้เกมพัง" — error ทุกทางถูกกลืน + เขียน console.warn ไว้
  // (ท่าเดียวกับ GAME_ACCOUNT.sync ที่ห่อ try/catch ทั้งก้อน)

  function _warn(where, e) {
    try { console.warn('[word-vault] ' + where + ':', (e && e.message) || e); } catch (_) {}
  }

  function _ownerSnapshot() {
    return { client: _sb, uid: _uid, generation: _ownerGeneration };
  }

  function _ownerIsCurrent(owner) {
    return !!(owner && owner.client === _sb && owner.uid === _uid && owner.generation === _ownerGeneration);
  }

  function _bounded(operation, label, onDone, onLate) {
    var settled = false;
    var timer = setTimeout(function () {
      if (settled) return;
      settled = true;
      var error = new Error('NETWORK_TIMEOUT');
      error.code = 'NETWORK_TIMEOUT';
      _warn(label, error);
      onDone(error, null);
    }, DELETE_TIMEOUT_MS);
    function finish(error, result) {
      if (settled) { if (onLate) onLate(error, result); return; }
      settled = true;
      clearTimeout(timer);
      onDone(error, result);
    }
    try {
      var request = operation();
      if (!request || typeof request.then !== 'function') { finish(new Error('REQUEST_UNAVAILABLE'), null); return; }
      request.then(function (result) { finish(result && result.error, result); }, function (error) { finish(error, null); });
    } catch (error) { finish(error, null); }
  }

  function _pendingDelete(th) { return _loadState().pendingDeletes[th] || null; }
  function _queueDelete(th) {
    var state = _loadState();
    if (!state.pendingDeletes[th]) state.pendingDeletes[th] = { deleted_at: new Date().toISOString() };
    _deleteIntent[th] = state.pendingDeletes[th].deleted_at;
    state.items = state.items.filter(function (word) { return word.th !== th; });
    _saveState(state);
    return state.pendingDeletes[th];
  }
  function _clearPendingDelete(th, deletedAt) {
    var state = _loadState();
    var pending = state.pendingDeletes[th];
    if (pending && pending.deleted_at === deletedAt) {
      delete state.pendingDeletes[th];
      _saveState(state);
    }
  }
  function _pendingDeleteCount() { return Object.keys(_loadState().pendingDeletes).length; }

  /** บอกหน้าเว็บว่าคลังคำเปลี่ยนแล้ว (vault.html ฟัง event นี้เพื่อ render ใหม่หลัง sync เสร็จ) */
  function _fireChanged() {
    try { global.dispatchEvent(new CustomEvent('wordvault:changed')); }
    catch (_) {
      // เบราว์เซอร์เก่าที่ new CustomEvent ไม่ได้ — ไม่ใช่เรื่องคอขาดบาดตาย ข้ามไป
      try {
        var ev = document.createEvent('Event');
        ev.initEvent('wordvault:changed', true, true);
        global.dispatchEvent(ev);
      } catch (__) {}
    }
  }

  /** แปลงคำในเครื่อง → แถวสำหรับเซิร์ฟเวอร์
   *  ⚠️ source ของคลังคำ ('tone-finder') คนละรูปแบบกับรหัสเกมมาตรฐาน ('tone_finder')
   *     จึงลงช่อง source_raw (ไม่มี FK) ไม่ใช่ source_surface — ถ้ายัดผิดช่องจะผิด FK แล้วเซฟไม่สำเร็จ */
  function _provenanceFor(w) {
    var rows = Array.isArray(w && w.provenance) ? w.provenance.slice() : [];
    if (!rows.length && w && w.source) rows.push({ source: w.source, saved_at: w.saved_at || Date.now() });
    return rows.filter(function (row) { return row && row.source; });
  }

  function _sourceRawFor(w) {
    return JSON.stringify({
      kind: 'word',
      readingTH: (w && w.readingTH) || '',
      provenance: _provenanceFor(w)
    });
  }

  function _decodeSourceRaw(raw, savedAt) {
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

  function _mergeMetaIntoWord(w, meta) {
    meta = meta || {};
    var changed = false;
    if (!w.zh && meta.zh) { w.zh = meta.zh; changed = true; }
    if (!w.en && meta.en) { w.en = meta.en; changed = true; }
    if (!w.readingTH && meta.readingTH) { w.readingTH = meta.readingTH; changed = true; }
    var source = meta.source || '';
    if (source) {
      var provenance = _provenanceFor(w);
      var exists = provenance.some(function (row) { return row.source === source; });
      if (!exists) {
        provenance.push({ source: source, saved_at: Date.now() });
        w.provenance = provenance;
        if (!w.source) w.source = source;
        changed = true;
      }
    }
    return changed;
  }

  function _rowFor(w, ownerUid) {
    return {
      user_id: ownerUid || _uid,
      vault_key: VAULT_KEY,
      word_th: w.th,
      zh: w.zh || null,
      en: w.en || null,
      source_raw: _sourceRawFor(w),
      tags: (w.tags && w.tags.length) ? w.tags : [],
      // 🔑 คำที่อยู่ในคลังของผู้ใช้ = ต้อง "ล้างตราการลบ" ทิ้งเสมอ
      //    เคสจริง: ลบคำที่เครื่อง A (ติดตรา) แล้วผู้ใช้เซฟคำเดิมใหม่ที่เครื่อง B
      //    ถ้าไม่ล้างตรา คำที่เพิ่งเซฟจะถูกลบทิ้งตอน sync รอบหน้า (ผู้ใช้งงว่าเซฟไม่ติด)
      deleted_at: null
    };
  }

  function _currentWord(th) {
    var found = null;
    load().some(function (word) { if (word && word.th === th) { found = word; return true; } return false; });
    return found;
  }

  function _sameRemoteRow(word, remoteRow, ownerUid) {
    if (!word || !remoteRow) return false;
    return JSON.stringify(_rowFor(word, ownerUid)) === JSON.stringify(remoteRow);
  }

  function _hasLocalDelta(word, remoteRow) {
    if (!word || !remoteRow) return true;
    var remoteMeta = _decodeSourceRaw(remoteRow.source_raw, remoteRow.saved_at);
    if (word.zh && word.zh !== (remoteRow.zh || '')) return true;
    if (word.en && word.en !== (remoteRow.en || '')) return true;
    if (word.readingTH && word.readingTH !== (remoteMeta.readingTH || '')) return true;
    var remoteSources = {};
    _provenanceFor({ source: remoteMeta.source, provenance: remoteMeta.provenance }).forEach(function (row) { remoteSources[row.source] = true; });
    if (_provenanceFor(word).some(function (row) { return !remoteSources[row.source]; })) return true;
    var remoteTags = remoteRow.tags || [];
    return (word.tags || []).some(function (tag) { return remoteTags.indexOf(tag) === -1; });
  }

  /** เขียนคำขึ้นเซิร์ฟเวอร์แบบ bounded และ serialize ต่อคำ */
  function _pushWords(thList, owner) {
    owner = owner || _ownerSnapshot();
    if (!_ownerIsCurrent(owner)) return;
    var rowsByWord = {};
    (thList || []).forEach(function (th) {
      if (!th || rowsByWord[th] || _pendingDelete(th)) return;
      var word = _currentWord(th);
      if (!word || word.synced === true) return;
      if (_saveInFlight[th]) { _saveAgain[th] = true; return; }
      delete _saveAgain[th];
      rowsByWord[th] = _rowFor(word, owner.uid);
      _saveInFlight[th] = true;
    });
    var words = Object.keys(rowsByWord);
    if (!words.length) return;
    _bounded(function () {
      return owner.client.from(TABLE).upsert(words.map(function (th) { return rowsByWord[th]; }), { onConflict: 'user_id,vault_key,word_th' });
    }, 'อัปโหลดคำขึ้นเซิร์ฟเวอร์ไม่สำเร็จ', function (error) {
      if (!_ownerIsCurrent(owner)) return;
      words.forEach(function (th) { delete _saveInFlight[th]; });
      if (error) { _warn('อัปโหลดคำขึ้นเซิร์ฟเวอร์ไม่สำเร็จ', error); return; }
      var list = load();
      var retry = [];
      words.forEach(function (th) {
        var current = null;
        list.some(function (row) { if (row.th === th) { current = row; return true; } return false; });
        if (_saveAgain[th] || (current && !_sameRemoteRow(current, rowsByWord[th], owner.uid))) {
          delete _saveAgain[th];
          if (current && !_pendingDelete(th)) retry.push(th);
          return;
        }
        if (current && !_pendingDelete(th)) current.synced = true;
      });
      save(list);
      _fireChanged();
      if (retry.length) _pushWords(retry, owner);
    }, function () {
      if (!_ownerIsCurrent(owner)) return;
      words.forEach(function (th) {
        var deletedAt = _deleteIntent[th];
        if (!deletedAt || _currentWord(th)) return;
        var state = _loadState();
        if (!state.pendingDeletes[th]) state.pendingDeletes[th] = { deleted_at: deletedAt };
        _saveState(state);
        _deleteRemote(th, owner);
      });
    });
  }

  function _pushWord(th, owner) { _pushWords([th], owner); }

  function _flushPendingSaves(owner) {
    owner = owner || _ownerSnapshot();
    if (!_ownerIsCurrent(owner)) return;
    _pushWords(load().filter(function (word) {
      return word && word.th && word.synced !== true && !_pendingDelete(word.th);
    }).map(function (word) { return word.th; }), owner);
  }

  function _handleOnline() {
    var owner = _ownerSnapshot();
    if (!_ownerIsCurrent(owner)) return;
    _flushPendingDeletes(owner);
    _flushPendingSaves(owner);
  }

  function _cancelQueuedSave(th) {
    delete _saveAgain[th];
  }

  /** error นี้แปลว่า "ฐานข้อมูลยังไม่มีคอลัมน์ deleted_at" ใช่ไหม
   *  (ท่าเดียวกับ isMissingGameColumn ใน js/games/reading-auth.js ที่ใช้มาก่อนแล้ว) */
  function _isMissingTombstoneColumn(err) {
    if (!err) return false;
    var msg = String(err.message || err || '');
    return err.code === '42703' || msg.indexOf('deleted_at') !== -1;
  }

  /** ลบคำแบบเก่า (ลบแถวทิ้งจริง) — ใช้เฉพาะฐานข้อมูลที่ยังไม่มีคอลัมน์ deleted_at */
  function _hardDeleteRemote(th, pending, owner) {
    if (!_ownerIsCurrent(owner)) return;
    _bounded(function () {
      return owner.client.from(TABLE).delete().eq('user_id', owner.uid).eq('vault_key', VAULT_KEY).eq('word_th', th);
    }, 'ลบคำบนเซิร์ฟเวอร์ไม่สำเร็จ', function (error) {
      if (!_ownerIsCurrent(owner)) return;
      delete _deleteInFlight[th];
      if (error) { _warn('ลบคำบนเซิร์ฟเวอร์ไม่สำเร็จ', error); return; }
      _clearPendingDelete(th, pending.deleted_at);
      _fireChanged();
    });
  }

  /** ผู้ใช้กดลบคำเอง → **ปั๊มตราว่าถูกลบ** ไม่ลบแถวทิ้ง
   *  เหตุผล: ถ้าลบแถวทิ้ง เครื่องอื่นจะเห็นแค่ "ไม่มีแถว" ซึ่งแยกไม่ออกจาก "อ่านมาไม่ครบ"
   *  → ต้องเก็บของไว้เพื่อความปลอดภัย = คำที่ลบแล้วไม่หายจากเครื่องอื่น (ปัญหาที่รอบนี้แก้)
   *  เรียกเฉพาะตอนผู้ใช้กดลบเองเท่านั้น ระบบไม่เคยลบเอง (ห้ามลบอัตโนมัติเพราะเกินเพดาน) */
  function _deleteRemote(th, owner) {
    owner = owner || _ownerSnapshot();
    if (!_ownerIsCurrent(owner) || _deleteInFlight[th]) return;
    var pending = _pendingDelete(th);
    if (!pending) return;
    _deleteInFlight[th] = true;
    if (_tombstoneOk === false) { _hardDeleteRemote(th, pending, owner); return; }
    var row = { user_id: owner.uid, vault_key: VAULT_KEY, word_th: th, deleted_at: pending.deleted_at };
    _bounded(function () {
      return owner.client.from(TABLE).upsert([row], { onConflict: 'user_id,vault_key,word_th' });
    }, 'ปั๊มตราการลบบนเซิร์ฟเวอร์ไม่สำเร็จ', function (error) {
      if (!_ownerIsCurrent(owner)) return;
      if (error && _isMissingTombstoneColumn(error)) {
        _tombstoneOk = false;
        _warn('ฐานข้อมูลยังไม่มีคอลัมน์ deleted_at — ถอยไปลบแบบเดิม (ยังไม่ได้รัน 2026-08-11_word_vault_deletion_sync.sql)', error);
        _hardDeleteRemote(th, pending, owner);
        return;
      }
      delete _deleteInFlight[th];
      if (error) { _warn('ปั๊มตราการลบบนเซิร์ฟเวอร์ไม่สำเร็จ', error); return; }
      _tombstoneOk = true;
      _clearPendingDelete(th, pending.deleted_at);
      _fireChanged();
    });
  }

  function _flushPendingDeletes(owner) {
    owner = owner || _ownerSnapshot();
    if (!_ownerIsCurrent(owner)) return;
    Object.keys(_loadState().pendingDeletes).forEach(function (th) { _deleteRemote(th, owner); });
  }

  /**
   * รวมคลังคำของเครื่องนี้กับของบัญชี แล้วเก็บผลรวมไว้ทั้ง 2 ฝั่ง
   * @param {object} client — supabase client (ตัวเดียวกับที่ทุกหน้าใช้)
   * @param {string} userId — user id ที่ล็อกอินอยู่ · ส่ง null/undefined = ออกจากระบบ (กลับเป็น local เหมือนเดิม)
   */
  function sync(client, userId) {
    var nextUid = userId || null;
    var nextClient = (client && client.from) ? client : null;
    var previousUid = _uid;
    try {
      if (global.PHASE1_ACCOUNT_BOUNDARY && global.PHASE1_ACCOUNT_BOUNDARY.bind) {
        global.PHASE1_ACCOUNT_BOUNDARY.bind(nextUid ? { id: nextUid } : null);
      } else if (previousUid !== nextUid) {
        // fallback เมื่อ auth-widget ไม่พร้อม: ห้ามนำ cache ของ Guest/account อื่นไปอัปโหลด
        localStorage.removeItem(STORAGE_KEY);
      }
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
    if (!_sb || !_uid) { _sb = null; _uid = null; _fireChanged(); return; }
    var owner = _ownerSnapshot();
    _readRemote(function (remote) { _mergeWith(remote, owner); }, owner);
  }

  /** อ่านคลังคำจากเซิร์ฟเวอร์ — ลองแบบมีตราการลบก่อน ถ้าฐานข้อมูลยังไม่มีคอลัมน์ค่อยถอยไปแบบเดิม */
  function _readRemote(onRows, owner) {
    owner = owner || _ownerSnapshot();
    if (!_ownerIsCurrent(owner)) return;
    var cols = (_tombstoneOk === false) ? COLS_LEGACY : COLS_WITH_TOMBSTONE;
    try {
      owner.client.from(TABLE).select(cols).eq('user_id', owner.uid).eq('vault_key', VAULT_KEY)
        .then(function (r) {
          if (!_ownerIsCurrent(owner)) return;
          if (r && r.error) {
            if (cols === COLS_WITH_TOMBSTONE && _isMissingTombstoneColumn(r.error)) {
              // ยังไม่ได้รันไฟล์ SQL บนฐานข้อมูลนี้ → ถอยไปอ่านแบบเดิม (sync ยังทำงาน ไม่พัง)
              _tombstoneOk = false;
              _warn('ฐานข้อมูลยังไม่มีคอลัมน์ deleted_at — sync ทำงานแบบเดิมไปก่อน (ยังไม่มีการลบข้ามเครื่อง)', r.error);
              _readRemote(onRows, owner);
              return;
            }
            // อ่านไม่สำเร็จจริง (เน็ตหลุด/สิทธิ์ไม่พอ/ตารางยังไม่มี) → ไม่แตะอะไรเลย ปลอดภัยที่สุด
            _warn('อ่านคลังคำจากเซิร์ฟเวอร์ไม่สำเร็จ', r.error);
            _flushPendingDeletes(owner);
            return;
          }
          if (!r) { _warn('อ่านคลังคำจากเซิร์ฟเวอร์ไม่สำเร็จ', 'ไม่มีผลลัพธ์'); _flushPendingDeletes(owner); return; }
          if (cols === COLS_WITH_TOMBSTONE) _tombstoneOk = true;
          onRows(r.data || []);
        }, function (e) {
          if (!_ownerIsCurrent(owner)) return;
          _warn('อ่านคลังคำจากเซิร์ฟเวอร์ไม่สำเร็จ', e); _flushPendingDeletes(owner);
        });
    } catch (e) {
      if (!_ownerIsCurrent(owner)) return;
      _warn('อ่านคลังคำจากเซิร์ฟเวอร์ไม่สำเร็จ', e); _flushPendingDeletes(owner);
    }
  }

  /** รวมของในเครื่องกับของบนเซิร์ฟเวอร์ตามกฎ 5 กรณี (ดูหัวไฟล์) */
  function _mergeWith(remote, owner) {
    if (!_ownerIsCurrent(owner)) return;
    var state = _loadState();
    var local = state.items;
    var pendingDeletes = state.pendingDeletes;

    // แยกของบนเซิร์ฟเวอร์เป็น 2 กอง: คำที่ยังอยู่ vs ตราการลบ
    var activeRemote = {}, deletedRemote = {};
    remote.forEach(function (x) {
      if (!x || !x.word_th) return;
      if (pendingDeletes[x.word_th]) return;
      if (x.deleted_at) deletedRemote[x.word_th] = x; else activeRemote[x.word_th] = x;
    });
    var inLocal = {};
    local.forEach(function (w) { if (w && w.th) inLocal[w.th] = true; });

    var merged = [], toPush = [], removedByOwner = 0;

    local.forEach(function (w) {
      if (!w || !w.th) return;
      // ก. มีทั้ง 2 ฝั่ง และยังใช้งานอยู่ → เก็บไว้
      if (activeRemote[w.th]) {
        var needsUpload = w.synced !== true && _hasLocalDelta(w, activeRemote[w.th]);
        var remoteMeta = _decodeSourceRaw(activeRemote[w.th].source_raw, activeRemote[w.th].saved_at);
        _mergeMetaIntoWord(w, {
          zh: activeRemote[w.th].zh || '', en: activeRemote[w.th].en || '',
          readingTH: remoteMeta.readingTH || '', source: remoteMeta.source || ''
        });
        (remoteMeta.provenance || []).forEach(function (row) {
          if (!row || !row.source) return;
          var provenance = _provenanceFor(w);
          if (!provenance.some(function (existing) { return existing.source === row.source; })) provenance.push(row);
          w.provenance = provenance;
        });
        w.synced = !needsUpload; merged.push(w);
        if (needsUpload) toPush.push(w);
        return;
      }

      if (deletedRemote[w.th]) {
        // ข. เจ้าของสั่งลบคำนี้ (มีตราชัดเจน) และคำในเครื่องนี้เคยขึ้นเซิร์ฟเวอร์แล้ว
        //    = "local copy เก่า" → ลบตามได้ นี่เป็น **ทางเดียว** ที่ระบบลบคำในเครื่อง
        if (w.synced === true) { removedByOwner++; return; }
        // ค. มีตราลบ แต่คำในเครื่องนี้ "ยังไม่เคยขึ้นเซิร์ฟเวอร์" = ผู้ใช้เพิ่งเซฟใหม่ที่เครื่องนี้
        //    ของใหม่ต้องชนะตราเก่า → เก็บไว้ + ส่งขึ้น (_rowFor ล้างตราให้เอง)
        merged.push(w); toPush.push(w); return;
      }

      // ง. ไม่มีแถวบนเซิร์ฟเวอร์เลย — **ห้ามแปลว่าถูกลบ** (อาจเป็นเพราะอ่านมาไม่ครบ)
      if (w.synced === true) { merged.push(w); return; }   // เคยขึ้นแล้วแต่หายไป → เก็บไว้ ไม่ส่งซ้ำ
      merged.push(w); toPush.push(w);                       // จ. ของใหม่จากเครื่องนี้ → ส่งขึ้น
    });

    // ฉ. ของที่มีแต่บนเซิร์ฟเวอร์ (และยังใช้งานอยู่) ดึงลงมาให้ครบ
    //    ห้ามตัดทิ้งแม้รวมกันเกินเพดาน · ตราการลบไม่ต้องดึงลงมาเก็บ
    remote.forEach(function (x) {
      if (!x || !x.word_th || x.deleted_at || inLocal[x.word_th] || pendingDeletes[x.word_th]) return;
      var ts = Date.now();
      if (x.saved_at) { var p = Date.parse(x.saved_at); if (!isNaN(p)) ts = p; }
      var sourceMeta = _decodeSourceRaw(x.source_raw, ts);
      merged.push({
        th: x.word_th, zh: x.zh || '', en: x.en || '', source: sourceMeta.source,
        readingTH: sourceMeta.readingTH, provenance: sourceMeta.provenance,
        saved_at: ts, tags: (x.tags && x.tags.length) ? x.tags : [], synced: true
      });
    });

    save(merged);
    if (removedByOwner) {
      // ห้ามเงียบ: บอกไว้ใน console ว่าลบไปกี่คำ เพราะเจ้าของสั่งลบจากเครื่องอื่น
      _warn('ลบคำในเครื่องนี้ ' + removedByOwner + ' คำ เพราะเจ้าของสั่งลบไว้จากเครื่องอื่น', 'ok');
    }
    _notifyBadges();
    _fireChanged();

    _pushWords(toPush.map(function (word) { return word.th; }), owner);
    _flushPendingDeletes(owner);
  }

  // ── [03] API หลัก ─────────────────────────────────────────────

  /** เซฟคำ — ถ้ามีอยู่แล้วไม่เพิ่มซ้ำ
   * @param {string} th  — คำภาษาไทย (key หลัก)
   * @param {object} meta — ข้อมูลเพิ่ม: { zh, en, source }  (optional)
   * @returns {boolean} true = เพิ่งเซฟใหม่, false = มีอยู่แล้ว
   */
  function addWord(th, meta) {
    if (!_accountReady()) { _requireLogin(); return false; }
    if (_pendingDelete(th)) { _showToast('正在同步刪除，請稍後再儲存'); _flushPendingDeletes(); return false; }
    delete _deleteIntent[th];
    var list = load();
    var existing = null;
    list.some(function(w){ if (w.th === th) { existing = w; return true; } return false; });
    if (existing) {
      // Same content remains one item. A newly observed Save source is appended
      // to provenance and synced onto the existing row instead of duplicating it.
      if (_mergeMetaIntoWord(existing, meta)) {
        existing.synced = false;
        save(list);
        if (_sb && _uid) _pushWord(existing.th, _ownerSnapshot());
        _fireChanged();
      }
      return false;
    }
    if (list.length >= MAX_WORDS) { _showFullToast(); return false; }
    var entry = {
      th: th,
      zh: (meta && meta.zh) || '',
      en: (meta && meta.en) || '',
      readingTH: (meta && meta.readingTH) || '',
      source: (meta && meta.source) || '',   // 'tone-finder' | 'reading-game' | 'typing-game' | ...
      saved_at: Date.now(),
      provenance: (meta && meta.source) ? [{ source: meta.source, saved_at: Date.now() }] : [],
      tags: []
    };
    list.push(entry);
    save(list);
    // ล็อกอินอยู่ → ส่งขึ้นเซิร์ฟเวอร์ทันที (ไม่รอผล ไม่บล็อก UI) · ส่งไม่สำเร็จก็ยังอยู่ในเครื่อง
    // และจะถูกส่งขึ้นให้เองในการ sync รอบหน้า เพราะยังไม่มีธง synced (ตามกฎกรณี ข.)
    if (_sb && _uid) _pushWord(th, _ownerSnapshot());
    return true;
  }

  /** ลบคำออกจากคลัง — เป็นการลบที่ "ผู้ใช้สั่งเอง" เท่านั้น (ระบบไม่เคยลบเองอัตโนมัติ) */
  function removeWord(th) {
    if (!_accountReady()) { _requireLogin(); return false; }
    _cancelQueuedSave(th);
    _queueDelete(th);
    _fireChanged();
    _flushPendingDeletes();
    return true;
  }

  /** คืนรายการคำทั้งหมด */
  function getAll() { return _accountReady() ? load() : []; }

  /** คืน true ถ้าคำนี้อยู่ในคลังแล้ว */
  function has(th) { return _accountReady() && load().some(function(w){ return w.th === th; }); }

  /** คืน true เมื่อรายการเดิมบันทึก provenance ของพื้นผิวนี้ไว้แล้ว */
  function _hasSource(th, source) {
    if (!source) return true;
    var match = null;
    load().some(function(w){ if (w.th === th) { match = w; return true; } return false; });
    return !!(match && _provenanceFor(match).some(function(row){ return row.source === source; }));
  }

  /** เต็มเพดาน Login Free 20 หรือยัง */
  function isFull() { return _accountReady() && load().length >= MAX_WORDS; }

  /** เพิ่ม/ลบ tag ในคำ
   * @param {string} th
   * @param {string} tag
   * @param {boolean} [on=true]  true=เพิ่ม, false=ลบ
   */
  function setTag(th, tag, on) {
    if (!_accountReady()) { _requireLogin(); return false; }
    var list = load();
    var changed = null;
    list.forEach(function(w) {
      if (w.th !== th) return;
      if (!w.tags) w.tags = [];
      var idx = w.tags.indexOf(tag);
      if (on !== false && idx === -1) w.tags.push(tag);
      if (on === false && idx !== -1) w.tags.splice(idx, 1);
      changed = w;
    });
    save(list);
    // ป้ายกำกับต้องตามไปทุกเครื่องด้วย (upsert ทับแถวเดิม ไม่สร้างซ้ำ)
    if (changed && _sb && _uid) {
      changed.synced = false;
      save(list);
      _pushWord(changed.th, _ownerSnapshot());
    }
    return !!changed;
  }

  // ── UI Helper ─────────────────────────────────────────────────

  /**
   * สร้างปุ่ม 🔖 พร้อม event
   * @param {string} th
   * @param {object} meta  { zh, en, source }
   * @param {object} opts  { onSave, onRemove }  callbacks (optional)
   * @returns {HTMLButtonElement}
   */
  function createSaveBtn(th, meta, opts) {
    opts = opts || {};
    var btn = document.createElement('button');
    btn.className = 'vault-save-btn';
    btn.title = '儲存到單字庫';
    _updateBtnState(btn, has(th));

    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      if (!_accountReady()) { _requireLogin(); return; }
      if (has(th)) {
        // รายการเดียวกันที่มาจากเกมใหม่ต้องคงเป็น 1 รายการและเพิ่มที่มา
        // การกดครั้งถัดไปจากพื้นผิวเดิมจึงค่อยหมายถึง "ลบ" ตามสถานะปุ่มปกติ
        if (meta && meta.source && !_hasSource(th, meta.source)) {
          addWord(th, meta);
          _updateBtnState(btn, true);
          _notifyBadges();
          if (opts.onSave) opts.onSave(th);
          _showToast('已更新「' + th + '」的儲存來源');
        } else {
          removeWord(th);
          _updateBtnState(btn, false);
          _notifyBadges();
          if (opts.onRemove) opts.onRemove(th);
          _showToast('已在本機移除「' + th + '」，正在同步刪除');
        }
      } else {
        if (isFull()) { _showFullToast(); return; }
        addWord(th, meta);
        _updateBtnState(btn, true);
        _notifyBadges();
        if (opts.onSave) opts.onSave(th);
        _showToast('已儲存「' + th + '」');
      }
    });
    return btn;
  }

  function _updateBtnState(btn, saved) {
    btn.setAttribute('data-saved', saved ? '1' : '0');
    btn.textContent = saved ? '🔖' : '🔖';
    btn.style.opacity = '1'; // ใช้สีพื้นหลัง (ดู CSS [data-saved]) แยกสถานะแทน ไม่ทำให้จางจนดูไม่ออกว่าเป็นปุ่ม
    btn.setAttribute('aria-label', saved ? '從單字庫移除' : '儲存到單字庫');
  }

  /** แสดง toast แจ้งเตือนเล็กๆ */
  function _showToast(msg) {
    var t = document.getElementById('vault-toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'vault-toast';
      t.style.cssText = [
        'position:fixed','bottom:80px','left:50%','transform:translateX(-50%)',
        'background:rgba(40,40,40,0.88)','color:#fff','padding:8px 18px',
        'border-radius:20px','font-size:14px','font-family:Sarabun,sans-serif',
        'z-index:9999','pointer-events:none','transition:opacity .3s','opacity:0'
      ].join(';');
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.style.opacity = '1';
    clearTimeout(t._timer);
    t._timer = setTimeout(function(){ t.style.opacity = '0'; }, 2000);
  }

  /** แสดง full gate — ห้ามเพิ่มและห้ามลบของเก่าอัตโนมัติ */
  function _showFullToast() {
    var t = document.getElementById('vault-toast-full');
    if (!t) {
      t = document.createElement('a');
      t.id = 'vault-toast-full';
      t.href = 'vault.html';
      t.style.cssText = [
        'position:fixed','bottom:80px','left:50%','transform:translateX(-50%)',
        'background:rgba(180,40,30,0.92)','color:#fff','padding:8px 18px',
        'border-radius:20px','font-size:14px','font-family:Sarabun,sans-serif',
        'z-index:9999','pointer-events:auto','transition:opacity .3s','opacity:0',
        'text-decoration:underline','cursor:pointer'
      ].join(';');
      document.body.appendChild(t);
    }
    // โชว์จำนวนจริง — หลังรวมคำจาก 2 เครื่องอาจเกินเพดานได้จริง (เช่น 32/20)
    // ตามกติกาที่ Lin สั่ง: เกินเพดาน = บล็อกการเพิ่มคำใหม่ชั่วคราว **ห้ามตัดคำทิ้งเอง**
    var n = load().length;
    t.textContent = '已達免費儲存上限。請管理已儲存內容後再新增，或升級方案以儲存更多。';
    t.style.opacity = '1';
    clearTimeout(t._timer);
    t._timer = setTimeout(function(){ t.style.opacity = '0'; }, 3000);
  }

  var BADGE_HTML = '<img src="assets/icons/kratip-plain.svg" alt="" style="width:14px;height:18px;vertical-align:-4px;margin-right:3px;">單字庫';

  function _refreshBadge(badge) {
    badge.innerHTML = BADGE_HTML;
    badge.style.display = '';
  }

  /** อัปเดต badge ทั้งหมดในหน้า */
  function _notifyBadges() {
    var badges = document.querySelectorAll('.vault-badge');
    for (var i = 0; i < badges.length; i++) _refreshBadge(badges[i]);
  }

  /** inject CSS สำหรับปุ่ม + badge (เรียกครั้งเดียว) */
  function injectStyles() {
    if (document.getElementById('vault-styles')) return;
    var s = document.createElement('style');
    s.id = 'vault-styles';
    s.textContent = [
      '.vault-save-btn{background:#fff;border:1.5px solid rgba(139,99,16,0.30);cursor:pointer;font-size:18px;',
        'width:32px;height:32px;border-radius:50%;line-height:1;vertical-align:middle;',
        'display:inline-flex;align-items:center;justify-content:center;',
        'transition:opacity .2s,transform .15s,background .15s;}',
      '.vault-save-btn:hover{transform:scale(1.12);background:rgba(139,99,16,0.10);}',
      '.vault-save-btn[data-saved="1"]{background:#fff3d8;border-color:#C8973A;}',
      '.vault-badge{display:inline-flex;align-items:center;gap:4px;',
        'font-size:12.5px;font-family:"Noto Sans TC",Sarabun,sans-serif;color:#7a5510;',
        'background:#fff;border:1.5px solid rgba(139,99,16,0.30);',
        'border-radius:20px;padding:6px 14px;text-decoration:none;',
        'white-space:nowrap;transition:background .15s,border-color .15s;}',
      '.vault-badge:hover{background:rgba(139,99,16,0.10);border-color:rgba(139,99,16,0.55);}'
    ].join('');
    document.head.appendChild(s);
  }

  // ── [06] Export ───────────────────────────────────────────────
  global.WordVault = {
    addWord: addWord,
    removeWord: removeWord,
    getAll: getAll,
    has: has,
    isFull: isFull,
    count: function () { return _accountReady() ? load().length : 0; },
    MAX_WORDS: MAX_WORDS,
    setTag: setTag,
    createSaveBtn: createSaveBtn,
    injectStyles: injectStyles,
    // sync ข้ามเครื่อง — เรียกจาก setUser() ใน js/games/reading-auth.js (จุดเดียวกับ GAME_ACCOUNT.sync)
    sync: sync,
    retryPendingDeletes: _flushPendingDeletes,
    pendingDeleteCount: _pendingDeleteCount
  };

  if (global.addEventListener) global.addEventListener('online', _handleOnline);

})(window);
