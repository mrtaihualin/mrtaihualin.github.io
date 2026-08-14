#!/usr/bin/env node
/**
 * scripts/tests-word-vault-sync.js
 * ────────────────────────────────────────────────────────────────────────────
 * ตัวทดสอบคุ้มกัน "คลังคำ sync ข้ามเครื่อง" (js/games/word-vault.js)
 *
 * ทำไมต้องมี: กติกาที่ Lin สั่งไว้มีข้อที่ผิดแล้วเสียหายถาวร —
 *   "ห้ามลบคำอัตโนมัติ" · "ห้ามทำข้อมูลเดิมหาย" · "Guest ห้ามสร้าง personal library"
 * ถ้าวันหลังมีคนแก้กฎการรวมคำผิดไปนิดเดียว คำของนักเรียนหายได้จริงโดยไม่มีใครรู้
 * ไฟล์นี้โหลด word-vault.js ตัวจริง (ไม่ก๊อป logic มาเขียนซ้ำ) แล้วป้อนสถานการณ์จริงให้
 *
 * วิธีรัน: node scripts/tests-word-vault-sync.js   (ผูกเข้า scripts/check-site.js แล้ว)
 * ────────────────────────────────────────────────────────────────────────────
 */
'use strict';

const fs = require('fs');
const path = require('path');

let pass = 0;
const fails = [];
function ok(name, cond, extra) {
  if (cond) { pass++; return; }
  fails.push(name + (extra ? ' → ' + extra : ''));
}

/** อ่านแถวแรกของ log[i] แบบปลอดภัย — คืน {} ถ้าไม่มี
 *  จำเป็นจริง: ถ้า indexing ตรงๆ แล้วโค้ดพัง เทสจะ crash เป็น TypeError
 *  แทนที่จะรายงานว่าข้อไหนไม่ผ่าน (เจอจริงตอนทดสอบย้อนกลับ 2026-08-11) */
function firstRow(logArr, i) {
  const batch = (logArr || [])[i || 0];
  return (batch && batch[0]) || {};
}

// ── จำลองเบราว์เซอร์เท่าที่ word-vault.js ต้องใช้ ────────────────────────────
function makeWindow() {
  const store = {};
  const win = {
    localStorage: {
      getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; }
    },
    events: [],
    dispatchEvent(ev) { this.events.push(ev && ev.type); return true; }
  };
  win.CustomEvent = function (type) { this.type = type; };
  win.document = {
    getElementById: () => null,
    querySelectorAll: () => [],
    createElement: () => ({ style: { cssText: '' }, setAttribute() {}, addEventListener() {}, appendChild() {} }),
    head: { appendChild() {} },
    body: { appendChild() {} },
    createEvent: () => ({ initEvent() {} })
  };
  return win;
}

/** โหลด word-vault.js ตัวจริงเข้า sandbox (คนละชุดต่อการทดสอบ 1 เคส) */
function loadVault(guest) {
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'games', 'word-vault.js'), 'utf8');
  const win = makeWindow();
  const sandboxGlobals = {
    window: win, localStorage: win.localStorage, document: win.document,
    CustomEvent: win.CustomEvent, console: { warn() {} }
  };
  // word-vault.js เป็น IIFE ที่รับ global เข้าไป — ยิง (window) ให้ตรงกับของจริงในเบราว์เซอร์
  const fn = new Function(...Object.keys(sandboxGlobals), src + '\n;return window.WordVault;');
  const vault = fn(...Object.values(sandboxGlobals));
  // Account tests start from a verified Login owner. The offline write response
  // leaves newly-added words unsynced so the following explicit sync can test retry/merge.
  if (!guest) vault.sync(makeClient([], { upsertError: 'offline' }).client, UID);
  return { vault, win };
}

/** client ปลอมที่จดไว้ว่าถูกสั่งทำอะไร + ตอบผลตามที่กำหนด */
function makeClient(remoteRows, opts) {
  opts = opts || {};
  const log = { upserts: [], deletes: [], selects: 0, tombstones: [], selectedCols: [] };
  const client = {
    from() {
      const b = {
        select(cols) {
          log.selects++; log.selectedCols.push(cols); b._mode = 'select'; b._cols = cols; return b;
        },
        upsert(rows) {
          // แยก "ปั๊มตราการลบ" (มี deleted_at เป็นเวลา) ออกจากการเซฟคำปกติ (deleted_at = null)
          b._rows = rows;
          if (rows.length && rows[0].deleted_at) log.tombstones.push(rows);
          else log.upserts.push(rows);
          b._mode = 'upsert'; return b;
        },
        delete() { b._mode = 'delete'; return b; },
        eq(col, val) { (b._eq = b._eq || []).push([col, val]); return b; },
        then(onOk) {
          if (b._mode === 'select') {
            // จำลองฐานข้อมูลที่ยังไม่ได้รัน SQL: ขอคอลัมน์ deleted_at แล้วโดนปฏิเสธ
            if (opts.noTombstoneColumn && String(b._cols || '').indexOf('deleted_at') !== -1) {
              onOk({ error: { code: '42703', message: 'column learning_saved_items.deleted_at does not exist' } });
              return b;
            }
            onOk(opts.selectError ? { error: { message: opts.selectError } } : { data: remoteRows, error: null });
          } else if (b._mode === 'upsert' && opts.noTombstoneColumn && b._rows && b._rows[0] && b._rows[0].deleted_at) {
            onOk({ error: { code: '42703', message: 'column learning_saved_items.deleted_at does not exist' } });
          } else if (b._mode === 'delete') {
            log.deletes.push(b._eq.slice());
            onOk({ error: null });
          } else {
            onOk({ error: opts.upsertError ? { message: opts.upsertError } : null });
          }
          return b;
        }
      };
      return b;
    }
  };
  return { client, log };
}

const UID = 'user-1';
const words = (list) => list.map((w) => (typeof w === 'string' ? { th: w } : w));

// ════════════════════════════════════════════════════════════════════════════
// 1) Guest (ยังไม่ล็อกอิน) — ไม่มี personal library และไม่ยิงเซิร์ฟเวอร์
// ════════════════════════════════════════════════════════════════════════════
{
  const { vault } = loadVault(true);
  const added = vault.addWord('ข้าว', { zh: '飯', source: 'reading-game' });
  const { client, log } = makeClient([]);
  vault.sync(client, null);                    // ไม่มี user = guest
  ok('1a guest: ไม่สร้างคลังคำส่วนตัว', added === false && vault.count() === 0);
  ok('1b guest: ไม่ยิงเซิร์ฟเวอร์เลย', log.selects === 0 && log.upserts.length === 0);
  ok('1c guest: API เพิ่มคำตอบ false', vault.addWord('กิน', { zh: '吃' }) === false);
  ok('1d guest: API ลบคำตอบ false', vault.removeWord('กิน') === false && vault.count() === 0);
}

// ════════════════════════════════════════════════════════════════════════════
// 2) กรณี ข — คำใหม่ในเครื่องที่ยังไม่เคย sync → ต้องถูกส่งขึ้นเซิร์ฟเวอร์
// ════════════════════════════════════════════════════════════════════════════
{
  const { vault } = loadVault();
  vault.addWord('ข้าว', { zh: '飯', source: 'reading-game' });
  vault.addWord('กิน', { zh: '吃', source: 'typing-game' });
  const { client, log } = makeClient([]);
  vault.sync(client, UID);
  ok('2a ส่งคำใหม่ขึ้นเซิร์ฟเวอร์ครบ 2 คำ', log.upserts.length === 1 && log.upserts[0].length === 2,
     JSON.stringify(log.upserts));
  const row = firstRow(log.upserts, 0);
  ok('2b แถวที่ส่งมี user_id + vault_key + word_th ถูกต้อง',
     row.user_id === UID && row.vault_key === 'linvault' && row.word_th === 'ข้าว', JSON.stringify(row));
  const sourceMeta = JSON.parse(row.source_raw);
  ok('2c ส่ง provenance ลง source_raw โดยไม่ใช้ source_surface ที่มี FK',
     sourceMeta.kind === 'word' && sourceMeta.provenance[0].source === 'reading-game' && row.source_surface === undefined, JSON.stringify(row));
  ok('2d คำในเครื่องไม่หาย', vault.count() === 2);
}

// ════════════════════════════════════════════════════════════════════════════
// 3) กรณี ง — คำที่มีแต่บนเซิร์ฟเวอร์ (เครื่องใหม่) → ต้องดึงลงมา
// ════════════════════════════════════════════════════════════════════════════
{
  const { vault, win } = loadVault();
  const remote = [
    { word_th: 'โรงแรม', zh: '飯店', en: 'rongraem', source_raw: 'tone-finder', tags: ['ชอบ'], saved_at: '2026-08-01T00:00:00Z' },
    { word_th: 'สนามบิน', zh: '機場', en: '', source_raw: 'reading-game', tags: [], saved_at: null }
  ];
  const { client, log } = makeClient(remote);
  vault.sync(client, UID);
  ok('3a ดึงคำจากเครื่องอื่นลงมาครบ', vault.count() === 2, 'ได้ ' + vault.count());
  const all = vault.getAll();
  const hotel = all.filter((w) => w.th === 'โรงแรม')[0];
  ok('3b เก็บคำแปล/ที่มา/ป้ายกำกับมาด้วย',
     hotel && hotel.zh === '飯店' && hotel.source === 'tone-finder' && hotel.tags[0] === 'ชอบ',
     JSON.stringify(hotel));
  ok('3c ไม่ส่งซ้ำขึ้นเซิร์ฟเวอร์ (ของมาจากเซิร์ฟเวอร์อยู่แล้ว)', log.upserts.length === 0);
  ok('3d ยิง event บอกหน้าเว็บให้ render ใหม่', win.events.indexOf('wordvault:changed') !== -1,
     JSON.stringify(win.events));
}

// ════════════════════════════════════════════════════════════════════════════
// 4) กรณี ก — คำเดียวกันมีทั้ง 2 ฝั่ง → ต้องไม่ซ้ำ ไม่ส่งขึ้นใหม่
// ════════════════════════════════════════════════════════════════════════════
{
  const { vault } = loadVault();
  vault.addWord('ข้าว', { zh: '飯' });
  const { client, log } = makeClient([{ word_th: 'ข้าว', zh: '飯', tags: [] }]);
  vault.sync(client, UID);
  ok('4a ไม่เกิดคำซ้ำ', vault.count() === 1, 'ได้ ' + vault.count());
  ok('4b ไม่ส่งขึ้นซ้ำ', log.upserts.length === 0);
}

// ════════════════════════════════════════════════════════════════════════════
// 5) 🔴 กรณี ค — เคย sync แล้วแต่หายจากเซิร์ฟเวอร์ (เจ้าของลบจากเครื่องอื่น)
//    กฎที่ Lin สั่ง: ห้ามลบข้อมูลเดิม → ต้องเก็บไว้ในเครื่องนี้ และห้ามส่งขึ้นซ้ำ
// ════════════════════════════════════════════════════════════════════════════
{
  const { vault } = loadVault();
  vault.addWord('ข้าว', { zh: '飯' });
  vault.addWord('กิน', { zh: '吃' });
  // sync รอบแรก: ขึ้นเซิร์ฟเวอร์ทั้ง 2 คำ แล้วถูกปั๊มว่า synced
  const first = makeClient([]);
  vault.sync(first.client, UID);
  ok('5a รอบแรกส่งขึ้นครบ', first.log.upserts.length === 1 && first.log.upserts[0].length === 2);
  // sync รอบสอง: เซิร์ฟเวอร์เหลือแค่ 'ข้าว' (สมมติเจ้าของลบ 'กิน' จากเครื่องอื่น)
  const second = makeClient([{ word_th: 'ข้าว', zh: '飯', tags: [] }]);
  vault.sync(second.client, UID);
  ok('5b คำที่ถูกลบจากเครื่องอื่น ยังอยู่ในเครื่องนี้ (ห้ามข้อมูลหาย)', vault.has('กิน'),
     JSON.stringify(vault.getAll().map((w) => w.th)));
  ok('5c ไม่ส่งคำนั้นขึ้นซ้ำ (ไม่ปลุกคำที่เจ้าของลบแล้วให้กลับมา)', second.log.upserts.length === 0,
     JSON.stringify(second.log.upserts));
  ok('5d จำนวนคำไม่ลดลงเอง', vault.count() === 2);
}

// ════════════════════════════════════════════════════════════════════════════
// 6) 🔴 รวมคำ 2 เครื่องแล้วเกินเพดาน Login Free 20 — ห้ามตัดคำทิ้ง ให้บล็อกการเพิ่มใหม่แทน
// ════════════════════════════════════════════════════════════════════════════
{
  const { vault } = loadVault();
  for (let i = 0; i < 20; i++) vault.addWord('คำA' + i, { zh: 'A' + i });   // เครื่องนี้เต็ม 20
  const remote = [];
  for (let i = 0; i < 25; i++) remote.push({ word_th: 'คำB' + i, zh: 'B' + i, tags: [] }); // เครื่องอื่นอีก 25
  const { client } = makeClient(remote);
  vault.sync(client, UID);
  ok('6a รวมคำได้ครบทั้ง 45 คำ แม้เกินเพดาน 20', vault.count() === 45, 'ได้ ' + vault.count());
  ok('6b ไม่มีคำไหนถูกตัดทิ้ง (เครื่องนี้ครบ 20)',
     vault.has('คำA0') && vault.has('คำA19'));
  ok('6c ของเครื่องอื่นครบ 25', vault.has('คำB0') && vault.has('คำB24'));
  ok('6d เกินเพดาน = ถือว่าเต็ม', vault.isFull() === true);
  const added = vault.addWord('คำใหม่', { zh: 'new' });
  ok('6e บล็อกการเพิ่มคำใหม่ชั่วคราว (ไม่ใช่ตัดคำเก่าทิ้ง)',
     added === false && vault.count() === 45 && !vault.has('คำใหม่'));
  vault.removeWord('คำA0');
  ok('6f ผู้ใช้ลบเองได้ตามปกติ (ทางออกจากสถานะเกินเพดาน)', vault.count() === 44 && !vault.has('คำA0'));
}

// ════════════════════════════════════════════════════════════════════════════
// 7) ผู้ใช้กดลบเอง → ต้องลบบนเซิร์ฟเวอร์ด้วย (ไม่ให้กลับมาตอน sync รอบหน้า)
// ════════════════════════════════════════════════════════════════════════════
{
  const { vault } = loadVault();
  vault.addWord('ข้าว', { zh: '飯' });
  const { client, log } = makeClient([{ word_th: 'ข้าว', zh: '飯', tags: [] }]);
  vault.sync(client, UID);
  vault.removeWord('ข้าว');
  ok('7a ปั๊มตราการลบขึ้นเซิร์ฟเวอร์ 1 ครั้ง (ไม่ลบแถวทิ้ง)',
     log.tombstones.length === 1 && log.deletes.length === 0,
     'tombstones=' + JSON.stringify(log.tombstones) + ' deletes=' + JSON.stringify(log.deletes));
  const tomb = firstRow(log.tombstones, 0);
  ok('7b ตราระบุเจาะจง user + vault_key + คำ และมีเวลาที่ลบ',
     tomb.user_id === UID && tomb.vault_key === 'linvault' && tomb.word_th === 'ข้าว' && !!tomb.deleted_at,
     JSON.stringify(tomb));
  ok('7c คำหายจากเครื่องด้วย', vault.count() === 0);
}

// ════════════════════════════════════════════════════════════════════════════
// 8) 🔴 อ่านเซิร์ฟเวอร์ไม่สำเร็จ (ยังไม่ได้รัน SQL / เน็ตหลุด) → ห้ามแตะข้อมูลเดิม
// ════════════════════════════════════════════════════════════════════════════
{
  const { vault } = loadVault();
  vault.addWord('ข้าว', { zh: '飯' });
  vault.addWord('กิน', { zh: '吃' });
  const { client, log } = makeClient([], { selectError: 'relation "learning_saved_items" does not exist' });
  let threw = false;
  try { vault.sync(client, UID); } catch (e) { threw = true; }
  ok('8a ไม่โยน error ออกมาทำให้เกมพัง', threw === false);
  ok('8b คำในเครื่องยังอยู่ครบ ไม่ถูกแตะ', vault.count() === 2 && vault.has('ข้าว') && vault.has('กิน'));
  ok('8c ไม่พยายามเขียนอะไรขึ้นเซิร์ฟเวอร์', log.upserts.length === 0);
}

// ════════════════════════════════════════════════════════════════════════════
// 9) ล็อกเอาท์ (uid = null หลังเคยล็อกอิน) → ซ่อน/ล้าง account cache และห้ามเพิ่มคำ
// ════════════════════════════════════════════════════════════════════════════
{
  const { vault } = loadVault();
  vault.addWord('ข้าว', { zh: '飯' });
  const a = makeClient([]);
  vault.sync(a.client, UID);
  vault.sync(a.client, null);                 // ล็อกเอาท์
  ok('9a ล็อกเอาท์แล้วไม่เห็น account library', vault.count() === 0);
  const b = makeClient([]);
  ok('9b เพิ่มคำหลังล็อกเอาท์ไม่ได้และไม่ยิงเซิร์ฟเวอร์', vault.addWord('กิน', { zh: '吃' }) === false && vault.count() === 0 && b.log.upserts.length === 0);
}

// ════════════════════════════════════════════════════════════════════════════
// 10) 🔴 ลบข้ามเครื่อง — หัวใจของรอบนี้
//     เครื่อง A ลบคำ → ปั๊มตราบนเซิร์ฟเวอร์ → เครื่อง B ต้องลบตาม แต่คำอื่นต้องอยู่ครบ
// ════════════════════════════════════════════════════════════════════════════
{
  // ── เครื่อง A: มี 2 คำ sync ขึ้นแล้ว จากนั้นลบ 1 คำ ──
  const A = loadVault();
  A.vault.addWord('ข้าว', { zh: '飯' });
  A.vault.addWord('กิน', { zh: '吃' });
  const a1 = makeClient([]);
  A.vault.sync(a1.client, UID);
  A.vault.removeWord('ข้าว');
  ok('10a A: ปั๊มตราการลบขึ้นเซิร์ฟเวอร์', a1.log.tombstones.length === 1);
  ok('10b A: คำที่ลบหายจากเครื่อง A · คำอื่นอยู่ครบ',
     !A.vault.has('ข้าว') && A.vault.has('กิน') && A.vault.count() === 1);

  // ── สภาพเซิร์ฟเวอร์หลัง A ลบ: 'กิน' ยังอยู่ · 'ข้าว' มีตราการลบ ──
  const serverAfterDelete = [
    { word_th: 'กิน', zh: '吃', tags: [], deleted_at: null },
    { word_th: 'ข้าว', zh: '飯', tags: [], deleted_at: '2026-08-11T10:00:00Z' }
  ];

  // ── เครื่อง B: มีทั้ง 2 คำค้างอยู่ และเคย sync มาแล้ว ──
  const B = loadVault();
  B.vault.addWord('ข้าว', { zh: '飯' });
  B.vault.addWord('กิน', { zh: '吃' });
  const b0 = makeClient([]);
  B.vault.sync(b0.client, UID);              // ทำให้ทั้ง 2 คำเป็น synced
  ok('10c B: ก่อน sync ยังเห็นคำที่ A ลบอยู่', B.vault.has('ข้าว') && B.vault.count() === 2);

  const b1 = makeClient(serverAfterDelete);
  B.vault.sync(b1.client, UID);
  ok('10d 🔴 B: คำที่เจ้าของลบ หายจากเครื่อง B แล้ว', !B.vault.has('ข้าว'),
     JSON.stringify(B.vault.getAll().map((w) => w.th)));
  ok('10e 🔴 B: คำอื่นที่ไม่ได้ลบ ยังอยู่ครบ', B.vault.has('กิน') && B.vault.count() === 1);
  ok('10f B: ไม่ส่งคำที่ถูกลบกลับขึ้นเซิร์ฟเวอร์', b1.log.upserts.length === 0,
     JSON.stringify(b1.log.upserts));
  ok('10g B: ไม่เผลอลบแถวจริงบนเซิร์ฟเวอร์', b1.log.deletes.length === 0);

  // ── sync ซ้ำอีกรอบ ต้องได้ผลเหมือนเดิม (idempotent) และห้าม resurrect ──
  const b2 = makeClient(serverAfterDelete);
  B.vault.sync(b2.client, UID);
  ok('10h 🔴 sync ซ้ำ: คำที่ลบไม่กลับมาเกิดใหม่', !B.vault.has('ข้าว') && B.vault.count() === 1);
  ok('10i sync ซ้ำ: ไม่ส่งอะไรขึ้นซ้ำ', b2.log.upserts.length === 0);
}

// ════════════════════════════════════════════════════════════════════════════
// 11) 🔴 อ่านเซิร์ฟเวอร์มาไม่ครบ (ไม่มีตราการลบ) → ห้ามลบคำในเครื่องเด็ดขาด
//     นี่คือกรณีที่แยกออกจาก "เจ้าของลบจริง" ไม่ได้ถ้าไม่มีระบบตรา
// ════════════════════════════════════════════════════════════════════════════
{
  const { vault } = loadVault();
  vault.addWord('ข้าว', { zh: '飯' });
  vault.addWord('กิน', { zh: '吃' });
  vault.addWord('โรงแรม', { zh: '飯店' });
  const first = makeClient([]);
  vault.sync(first.client, UID);                       // ทั้ง 3 คำเป็น synced แล้ว

  // เซิร์ฟเวอร์ตอบกลับมาแค่ 1 คำ (อ่านไม่ครบ) และ **ไม่มีตราการลบเลย**
  const partial = makeClient([{ word_th: 'ข้าว', zh: '飯', tags: [], deleted_at: null }]);
  vault.sync(partial.client, UID);
  ok('11a 🔴 อ่านมาไม่ครบ → คำในเครื่องต้องอยู่ครบทั้ง 3 คำ', vault.count() === 3,
     'ได้ ' + vault.count() + ' ' + JSON.stringify(vault.getAll().map((w) => w.th)));
  ok('11b ไม่ส่งคำที่หายไปขึ้นซ้ำ (กันเขียนทับของที่อาจมีอยู่จริง)', partial.log.upserts.length === 0);

  // เซิร์ฟเวอร์ตอบว่าง (เช่นตารางเพิ่งถูกล้าง/อ่านพลาด) และไม่มีตรา → ห้ามลบ
  const empty = makeClient([]);
  vault.sync(empty.client, UID);
  ok('11c 🔴 เซิร์ฟเวอร์ตอบว่างแต่ไม่มีตรา → คำในเครื่องยังอยู่ครบ', vault.count() === 3);
}

// ════════════════════════════════════════════════════════════════════════════
// 12) ผู้ใช้เซฟคำเดิมใหม่ที่อีกเครื่อง หลังมีตราการลบอยู่แล้ว → ของใหม่ต้องชนะ
// ════════════════════════════════════════════════════════════════════════════
{
  const { vault } = loadVault();
  vault.addWord('ข้าว', { zh: '飯' });                  // เพิ่งเซฟที่เครื่องนี้ ยังไม่เคย sync
  const c = makeClient([{ word_th: 'ข้าว', zh: '飯', tags: [], deleted_at: '2026-08-11T09:00:00Z' }]);
  vault.sync(c.client, UID);
  ok('12a คำที่ผู้ใช้เพิ่งเซฟใหม่ ไม่ถูกตราเก่าลบทิ้ง', vault.has('ข้าว') && vault.count() === 1);
  ok('12b ส่งขึ้นเซิร์ฟเวอร์เพื่อล้างตราการลบ', c.log.upserts.length === 1,
     JSON.stringify(c.log.upserts));
  ok('12c แถวที่ส่งล้างตรา (deleted_at = null)', firstRow(c.log.upserts, 0).deleted_at === null,
     JSON.stringify(firstRow(c.log.upserts, 0)));
}

// ════════════════════════════════════════════════════════════════════════════
// 13) กดลบซ้ำ / retry → ต้องไม่ทำข้อมูลเสีย
// ════════════════════════════════════════════════════════════════════════════
{
  const { vault } = loadVault();
  vault.addWord('ข้าว', { zh: '飯' });
  vault.addWord('กิน', { zh: '吃' });
  const c = makeClient([]);
  vault.sync(c.client, UID);
  vault.removeWord('ข้าว');
  vault.removeWord('ข้าว');                              // กดซ้ำ (หรือ retry)
  ok('13a กดลบซ้ำ: ปั๊มตรา 2 ครั้ง ไม่ error ไม่พัง', c.log.tombstones.length === 2);
  ok('13b กดลบซ้ำ: คำอื่นยังอยู่ครบ', vault.has('กิน') && vault.count() === 1);
  ok('13c ตราทั้ง 2 ครั้งชี้คำเดิม (คีย์เดียวกัน = upsert ทับ ไม่เกิดแถวซ้ำ)',
     firstRow(c.log.tombstones, 0).word_th === 'ข้าว' && firstRow(c.log.tombstones, 1).word_th === 'ข้าว',
     JSON.stringify(c.log.tombstones));
}

// ════════════════════════════════════════════════════════════════════════════
// 14) ฐานข้อมูลยังไม่ได้รัน SQL (ไม่มีคอลัมน์ deleted_at) → ต้องถอยไปทำงานแบบเดิม
//     สำคัญ: โค้ดนี้ถูก push ขึ้นเว็บก่อน Lin รัน SQL บน production ได้
// ════════════════════════════════════════════════════════════════════════════
{
  const { vault } = loadVault();
  vault.addWord('ข้าว', { zh: '飯' });
  vault.addWord('กิน', { zh: '吃' });
  const c = makeClient([], { noTombstoneColumn: true });
  let threw = false;
  try { vault.sync(c.client, UID); } catch (e) { threw = true; }
  ok('14a ไม่โยน error ออกมา', threw === false);
  ok('14b sync ยังทำงาน (ลองใหม่ด้วยคอลัมน์ชุดเดิม)',
     c.log.selectedCols.length === 2
     && c.log.selectedCols[0].indexOf('deleted_at') !== -1
     && c.log.selectedCols[1].indexOf('deleted_at') === -1,
     JSON.stringify(c.log.selectedCols));
  ok('14c ยังส่งคำขึ้นเซิร์ฟเวอร์ได้ตามปกติ', c.log.upserts.length === 1 && c.log.upserts[0].length === 2);
  ok('14d คำในเครื่องอยู่ครบ', vault.count() === 2);
  vault.removeWord('ข้าว');
  ok('14e การลบถอยไปใช้วิธีเดิม (ลบแถวจริง) ไม่เงียบ ไม่พัง',
     c.log.deletes.length === 1, 'deletes=' + JSON.stringify(c.log.deletes));
  ok('14f คำหายจากเครื่อง', !vault.has('ข้าว') && vault.count() === 1);
}

// ════════════════════════════════════════════════════════════════════════════
// 15) บันทึกคำเดิมจากเกมใหม่ → 1 รายการ แต่ provenance ต้องมีครบทุกแหล่ง
// ════════════════════════════════════════════════════════════════════════════
{
  const { vault } = loadVault();
  vault.addWord('ข้าว', { zh: '飯', source: 'reading-game' });
  const c = makeClient([]);
  vault.sync(c.client, UID);
  vault.addWord('ข้าว', { zh: '飯', source: 'typing-game' });
  const all = vault.getAll();
  const sources = (all[0] && all[0].provenance || []).map((row) => row.source).sort();
  ok('15a คำซ้ำยังมีเพียง 1 รายการ', all.length === 1, JSON.stringify(all));
  ok('15b provenance รวมแหล่งเดิมและแหล่งใหม่',
     sources.join(',') === 'reading-game,typing-game', JSON.stringify(sources));
  const lastBatch = c.log.upserts[c.log.upserts.length - 1] || [];
  const pushedMeta = lastBatch[0] && JSON.parse(lastBatch[0].source_raw);
  ok('15c provenance ใหม่ถูกส่งขึ้นบัญชี',
     pushedMeta && pushedMeta.provenance.length === 2, JSON.stringify(lastBatch));
}

// ── สรุป ────────────────────────────────────────────────────────────────────
if (fails.length) {
  console.error('❌ ตัวทดสอบคลังคำ sync ไม่ผ่าน ' + fails.length + ' ข้อ (ผ่าน ' + pass + '):');
  fails.forEach((f) => console.error('  - ' + f));
  process.exit(1);
}
console.log('✓ word-vault sync tests: ผ่านครบ ' + pass + ' ข้อ (guest/รวมคำ 4 กรณี/เกินเพดาน/ลบ/เซิร์ฟเวอร์ล่ม/ล็อกเอาท์)');
