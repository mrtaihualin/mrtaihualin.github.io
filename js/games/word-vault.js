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
 *   1. รวมคำจากทุกเครื่องเข้าบัญชีเดียวกันได้ **แม้จำนวนรวมเกินเพดาน 30**
 *   2. **ห้ามลบคำอัตโนมัติเพื่อบังคับเพดาน**
 *   3. **ห้ามทำข้อมูลเดิมหาย**
 *   4. เกินเพดาน → **บล็อกการเพิ่มคำใหม่ชั่วคราว** (ไม่ใช่ตัดคำทิ้ง)
 *   5. ใช้ระบบ account/database/sync เดิม ห้ามสร้างระบบซ้ำ
 *   6. Guest/local เดิมต้องไม่พัง
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
  var MAX_WORDS = 30;

  // ── ค่าที่ใช้คุยกับเซิร์ฟเวอร์ ──
  var TABLE = 'learning_saved_items';
  var VAULT_KEY = 'linvault';        // ตรงกับคอลัมน์ vault_key (คลังของเกมเลโก้ใช้ 'lego_vault' — ยังไม่แตะรอบนี้)
  var _sb = null;                    // supabase client (null = ยังไม่ล็อกอิน / ไม่มี client)
  var _uid = null;                   // user id ที่ล็อกอินอยู่
  // ฐานข้อมูลนี้มีคอลัมน์ deleted_at (ตราการลบ) แล้วหรือยัง
  //   null = ยังไม่รู้ · true = มี · false = ยังไม่มี (ยังไม่ได้รัน 2026-08-11_word_vault_deletion_sync.sql)
  // ต้องมีตัวนี้เพราะโค้ดฝั่งเว็บถูก push ขึ้นเว็บก่อนที่ Lin จะรัน SQL บน production ได้
  // → ถ้าไม่เผื่อไว้ sync จะพังทั้งระบบระหว่างช่วงรอยต่อนั้น (แย่กว่าเดิม)
  var _tombstoneOk = null;
  var COLS_WITH_TOMBSTONE = 'word_th,zh,en,source_raw,tags,saved_at,deleted_at';
  var COLS_LEGACY        = 'word_th,zh,en,source_raw,tags,saved_at';

  // ── โหลด/บันทึก ──────────────────────────────────────────────
  function load() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
    catch(e) { return []; }
  }
  function save(list) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); } catch(e) {}
  }

  // ── [02] sync ข้ามเครื่อง ─────────────────────────────────────
  // ทุกอย่างในก้อนนี้ "พังได้แบบไม่ทำให้เกมพัง" — error ทุกทางถูกกลืน + เขียน console.warn ไว้
  // (ท่าเดียวกับ GAME_ACCOUNT.sync ที่ห่อ try/catch ทั้งก้อน)

  function _warn(where, e) {
    try { console.warn('[word-vault] ' + where + ':', (e && e.message) || e); } catch (_) {}
  }

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
  function _rowFor(w) {
    return {
      user_id: _uid,
      vault_key: VAULT_KEY,
      word_th: w.th,
      zh: w.zh || null,
      en: w.en || null,
      source_raw: w.source || null,
      tags: (w.tags && w.tags.length) ? w.tags : [],
      // 🔑 คำที่อยู่ในคลังของผู้ใช้ = ต้อง "ล้างตราการลบ" ทิ้งเสมอ
      //    เคสจริง: ลบคำที่เครื่อง A (ติดตรา) แล้วผู้ใช้เซฟคำเดิมใหม่ที่เครื่อง B
      //    ถ้าไม่ล้างตรา คำที่เพิ่งเซฟจะถูกลบทิ้งตอน sync รอบหน้า (ผู้ใช้งงว่าเซฟไม่ติด)
      deleted_at: null
    };
  }

  /** เขียนคำขึ้นเซิร์ฟเวอร์ (upsert — กดซ้ำ/แข่งกันเขียนก็ไม่พัง) */
  function _pushRows(rows, onDone) {
    if (!_sb || !_uid || !rows.length) { if (onDone) onDone(); return; }
    try {
      _sb.from(TABLE).upsert(rows, { onConflict: 'user_id,vault_key,word_th' }).then(function (r) {
        if (r && r.error) _warn('อัปโหลดคำขึ้นเซิร์ฟเวอร์ไม่สำเร็จ', r.error);
        if (onDone) onDone(r && r.error);
      }, function (e) { _warn('อัปโหลดคำขึ้นเซิร์ฟเวอร์ไม่สำเร็จ', e); if (onDone) onDone(e); });
    } catch (e) { _warn('อัปโหลดคำขึ้นเซิร์ฟเวอร์ไม่สำเร็จ', e); if (onDone) onDone(e); }
  }

  /** error นี้แปลว่า "ฐานข้อมูลยังไม่มีคอลัมน์ deleted_at" ใช่ไหม
   *  (ท่าเดียวกับ isMissingGameColumn ใน js/games/reading-auth.js ที่ใช้มาก่อนแล้ว) */
  function _isMissingTombstoneColumn(err) {
    if (!err) return false;
    var msg = String(err.message || err || '');
    return err.code === '42703' || msg.indexOf('deleted_at') !== -1;
  }

  /** ลบคำแบบเก่า (ลบแถวทิ้งจริง) — ใช้เฉพาะฐานข้อมูลที่ยังไม่มีคอลัมน์ deleted_at */
  function _hardDeleteRemote(th) {
    try {
      _sb.from(TABLE).delete().eq('user_id', _uid).eq('vault_key', VAULT_KEY).eq('word_th', th)
        .then(function (r) { if (r && r.error) _warn('ลบคำบนเซิร์ฟเวอร์ไม่สำเร็จ', r.error); },
              function (e) { _warn('ลบคำบนเซิร์ฟเวอร์ไม่สำเร็จ', e); });
    } catch (e) { _warn('ลบคำบนเซิร์ฟเวอร์ไม่สำเร็จ', e); }
  }

  /** ผู้ใช้กดลบคำเอง → **ปั๊มตราว่าถูกลบ** ไม่ลบแถวทิ้ง
   *  เหตุผล: ถ้าลบแถวทิ้ง เครื่องอื่นจะเห็นแค่ "ไม่มีแถว" ซึ่งแยกไม่ออกจาก "อ่านมาไม่ครบ"
   *  → ต้องเก็บของไว้เพื่อความปลอดภัย = คำที่ลบแล้วไม่หายจากเครื่องอื่น (ปัญหาที่รอบนี้แก้)
   *  เรียกเฉพาะตอนผู้ใช้กดลบเองเท่านั้น ระบบไม่เคยลบเอง (ห้ามลบอัตโนมัติเพราะเกินเพดาน) */
  function _deleteRemote(th) {
    if (!_sb || !_uid) return;
    if (_tombstoneOk === false) { _hardDeleteRemote(th); return; }
    var row = { user_id: _uid, vault_key: VAULT_KEY, word_th: th, deleted_at: new Date().toISOString() };
    try {
      // upsert = ปั๊มตราได้ทั้งกรณีมีแถวอยู่แล้ว และกรณีคำนั้นยังไม่เคยขึ้นเซิร์ฟเวอร์
      // (กรณีหลังสำคัญ: กันเครื่องอื่นที่มีคำนั้นค้างอยู่เอากลับขึ้นมาใหม่)
      // ส่งแค่ 4 ช่อง → คำแปล/ป้ายกำกับเดิมบนเซิร์ฟเวอร์ไม่ถูกล้างทิ้ง
      _sb.from(TABLE).upsert([row], { onConflict: 'user_id,vault_key,word_th' }).then(function (r) {
        if (r && r.error) {
          if (_isMissingTombstoneColumn(r.error)) {
            // ยังไม่ได้รันไฟล์ SQL → ถอยไปใช้วิธีเดิม (ลบข้ามเครื่องยังไม่ทำงาน แต่ไม่พัง)
            _tombstoneOk = false;
            _warn('ฐานข้อมูลยังไม่มีคอลัมน์ deleted_at — ถอยไปลบแบบเดิม (ยังไม่ได้รัน 2026-08-11_word_vault_deletion_sync.sql)', r.error);
            _hardDeleteRemote(th);
          } else {
            _warn('ปั๊มตราการลบบนเซิร์ฟเวอร์ไม่สำเร็จ', r.error);
          }
          return;
        }
        _tombstoneOk = true;
      }, function (e) { _warn('ปั๊มตราการลบบนเซิร์ฟเวอร์ไม่สำเร็จ', e); });
    } catch (e) { _warn('ปั๊มตราการลบบนเซิร์ฟเวอร์ไม่สำเร็จ', e); }
  }

  /** ปั๊มว่าคำเหล่านี้ขึ้นเซิร์ฟเวอร์แล้ว (อ่าน localStorage ใหม่ตอนเขียน กันทับของที่เพิ่งเปลี่ยนระหว่างรอ network) */
  function _markSynced(thList) {
    if (!thList.length) return;
    var mark = {};
    thList.forEach(function (t) { mark[t] = true; });
    var list = load();
    list.forEach(function (w) { if (mark[w.th]) w.synced = true; });
    save(list);
  }

  /**
   * รวมคลังคำของเครื่องนี้กับของบัญชี แล้วเก็บผลรวมไว้ทั้ง 2 ฝั่ง
   * @param {object} client — supabase client (ตัวเดียวกับที่ทุกหน้าใช้)
   * @param {string} userId — user id ที่ล็อกอินอยู่ · ส่ง null/undefined = ออกจากระบบ (กลับเป็น local เหมือนเดิม)
   */
  function sync(client, userId) {
    _sb = (client && client.from) ? client : null;
    _uid = userId || null;
    if (!_sb || !_uid) { _sb = null; _uid = null; return; }   // guest → ทำงานแบบ local เหมือนเดิมทุกอย่าง

    _readRemote(function (remote) { _mergeWith(remote); });
  }

  /** อ่านคลังคำจากเซิร์ฟเวอร์ — ลองแบบมีตราการลบก่อน ถ้าฐานข้อมูลยังไม่มีคอลัมน์ค่อยถอยไปแบบเดิม */
  function _readRemote(onRows) {
    var cols = (_tombstoneOk === false) ? COLS_LEGACY : COLS_WITH_TOMBSTONE;
    try {
      _sb.from(TABLE).select(cols).eq('user_id', _uid).eq('vault_key', VAULT_KEY)
        .then(function (r) {
          if (r && r.error) {
            if (cols === COLS_WITH_TOMBSTONE && _isMissingTombstoneColumn(r.error)) {
              // ยังไม่ได้รันไฟล์ SQL บนฐานข้อมูลนี้ → ถอยไปอ่านแบบเดิม (sync ยังทำงาน ไม่พัง)
              _tombstoneOk = false;
              _warn('ฐานข้อมูลยังไม่มีคอลัมน์ deleted_at — sync ทำงานแบบเดิมไปก่อน (ยังไม่มีการลบข้ามเครื่อง)', r.error);
              _readRemote(onRows);
              return;
            }
            // อ่านไม่สำเร็จจริง (เน็ตหลุด/สิทธิ์ไม่พอ/ตารางยังไม่มี) → ไม่แตะอะไรเลย ปลอดภัยที่สุด
            _warn('อ่านคลังคำจากเซิร์ฟเวอร์ไม่สำเร็จ', r.error);
            return;
          }
          if (!r) { _warn('อ่านคลังคำจากเซิร์ฟเวอร์ไม่สำเร็จ', 'ไม่มีผลลัพธ์'); return; }
          if (cols === COLS_WITH_TOMBSTONE) _tombstoneOk = true;
          onRows(r.data || []);
        }, function (e) { _warn('อ่านคลังคำจากเซิร์ฟเวอร์ไม่สำเร็จ', e); });
    } catch (e) { _warn('อ่านคลังคำจากเซิร์ฟเวอร์ไม่สำเร็จ', e); }
  }

  /** รวมของในเครื่องกับของบนเซิร์ฟเวอร์ตามกฎ 5 กรณี (ดูหัวไฟล์) */
  function _mergeWith(remote) {
    var local = load();

    // แยกของบนเซิร์ฟเวอร์เป็น 2 กอง: คำที่ยังอยู่ vs ตราการลบ
    var activeRemote = {}, deletedRemote = {};
    remote.forEach(function (x) {
      if (!x || !x.word_th) return;
      if (x.deleted_at) deletedRemote[x.word_th] = x; else activeRemote[x.word_th] = x;
    });
    var inLocal = {};
    local.forEach(function (w) { if (w && w.th) inLocal[w.th] = true; });

    var merged = [], toPush = [], removedByOwner = 0;

    local.forEach(function (w) {
      if (!w || !w.th) return;
      // ก. มีทั้ง 2 ฝั่ง และยังใช้งานอยู่ → เก็บไว้
      if (activeRemote[w.th]) { w.synced = true; merged.push(w); return; }

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
      if (!x || !x.word_th || x.deleted_at || inLocal[x.word_th]) return;
      var ts = Date.now();
      if (x.saved_at) { var p = Date.parse(x.saved_at); if (!isNaN(p)) ts = p; }
      merged.push({
        th: x.word_th, zh: x.zh || '', en: x.en || '', source: x.source_raw || '',
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

    if (toPush.length) {
      var pushed = toPush.map(function (w) { return w.th; });
      _pushRows(toPush.map(_rowFor), function (err) { if (!err) _markSynced(pushed); });
    }
  }

  // ── [03] API หลัก ─────────────────────────────────────────────

  /** เซฟคำ — ถ้ามีอยู่แล้วไม่เพิ่มซ้ำ
   * @param {string} th  — คำภาษาไทย (key หลัก)
   * @param {object} meta — ข้อมูลเพิ่ม: { zh, en, source }  (optional)
   * @returns {boolean} true = เพิ่งเซฟใหม่, false = มีอยู่แล้ว
   */
  function addWord(th, meta) {
    var list = load();
    if (list.some(function(w){ return w.th === th; })) return false;
    if (list.length >= MAX_WORDS) { _showFullToast(); return false; } // เต็ม 30/30 — บล็อก ห้าม auto-delete
    var entry = {
      th: th,
      zh: (meta && meta.zh) || '',
      en: (meta && meta.en) || '',
      source: (meta && meta.source) || '',   // 'tone-finder' | 'reading-game' | 'typing-game' | ...
      saved_at: Date.now(),
      tags: []
    };
    list.push(entry);
    save(list);
    // ล็อกอินอยู่ → ส่งขึ้นเซิร์ฟเวอร์ทันที (ไม่รอผล ไม่บล็อก UI) · ส่งไม่สำเร็จก็ยังอยู่ในเครื่อง
    // และจะถูกส่งขึ้นให้เองในการ sync รอบหน้า เพราะยังไม่มีธง synced (ตามกฎกรณี ข.)
    if (_sb && _uid) {
      _pushRows([_rowFor(entry)], function (err) { if (!err) _markSynced([th]); });
    }
    return true;
  }

  /** ลบคำออกจากคลัง — เป็นการลบที่ "ผู้ใช้สั่งเอง" เท่านั้น (ระบบไม่เคยลบเองอัตโนมัติ) */
  function removeWord(th) {
    save(load().filter(function(w){ return w.th !== th; }));
    _deleteRemote(th);   // ล็อกอินอยู่ → ลบบนเซิร์ฟเวอร์ด้วย ไม่ให้กลับมาตอน sync รอบหน้า
  }

  /** คืนรายการคำทั้งหมด */
  function getAll() { return load(); }

  /** คืน true ถ้าคำนี้อยู่ในคลังแล้ว */
  function has(th) { return load().some(function(w){ return w.th === th; }); }

  /** เต็ม 30/30 หรือยัง */
  function isFull() { return load().length >= MAX_WORDS; }

  /** เพิ่ม/ลบ tag ในคำ
   * @param {string} th
   * @param {string} tag
   * @param {boolean} [on=true]  true=เพิ่ม, false=ลบ
   */
  function setTag(th, tag, on) {
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
    if (changed && _sb && _uid) _pushRows([_rowFor(changed)], null);
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
      if (has(th)) {
        removeWord(th);
        _updateBtnState(btn, false);
        _notifyBadges();
        if (opts.onRemove) opts.onRemove(th);
        _showToast('已移除「' + th + '」');  // popup ตอนเอาออก เหมือนตอนบันทึก (Lin 2026-07-02)
      } else {
        if (isFull()) { _showFullToast(); return; } // เต็ม 30/30 — บล็อก ไม่บันทึก ไม่ auto-delete
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

  /** แสดง toast ตอนคลังเต็ม 30/30 — คลิกได้ ไปหน้า vault.html */
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
    // โชว์จำนวนจริง ไม่ใช่ '30/30' ตายตัว — หลังรวมคำจาก 2 เครื่องอาจเกินเพดานได้จริง (เช่น 42/30)
    // ตามกติกาที่ Lin สั่ง: เกินเพดาน = บล็อกการเพิ่มคำใหม่ชั่วคราว **ห้ามตัดคำทิ้งเอง**
    var n = load().length;
    t.textContent = '單字庫已滿（' + n + '/' + MAX_WORDS + '）請先刪除舊單字';
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
    count: function () { return load().length; },
    MAX_WORDS: MAX_WORDS,
    setTag: setTag,
    createSaveBtn: createSaveBtn,
    injectStyles: injectStyles,
    // sync ข้ามเครื่อง — เรียกจาก setUser() ใน js/games/reading-auth.js (จุดเดียวกับ GAME_ACCOUNT.sync)
    sync: sync
  };

})(window);
