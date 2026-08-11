#!/usr/bin/env node
/**
 * scripts/tests-word-vault-sync.js
 * ────────────────────────────────────────────────────────────────────────────
 * ตัวทดสอบคุ้มกัน "คลังคำ sync ข้ามเครื่อง" (js/games/word-vault.js)
 *
 * ทำไมต้องมี: กติกาที่ Lin สั่งไว้มีข้อที่ผิดแล้วเสียหายถาวร —
 *   "ห้ามลบคำอัตโนมัติ" · "ห้ามทำข้อมูลเดิมหาย" · "Guest/local เดิมต้องไม่พัง"
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
function loadVault() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'games', 'word-vault.js'), 'utf8');
  const win = makeWindow();
  const sandboxGlobals = {
    window: win, localStorage: win.localStorage, document: win.document,
    CustomEvent: win.CustomEvent, console: { warn() {} }
  };
  // word-vault.js เป็น IIFE ที่รับ global เข้าไป — ยิง (window) ให้ตรงกับของจริงในเบราว์เซอร์
  const fn = new Function(...Object.keys(sandboxGlobals), src + '\n;return window.WordVault;');
  const vault = fn(...Object.values(sandboxGlobals));
  return { vault, win };
}

/** client ปลอมที่จดไว้ว่าถูกสั่งทำอะไร + ตอบผลตามที่กำหนด */
function makeClient(remoteRows, opts) {
  opts = opts || {};
  const log = { upserts: [], deletes: [], selects: 0 };
  const client = {
    from() {
      const b = {
        select() { log.selects++; b._mode = 'select'; return b; },
        upsert(rows) { log.upserts.push(rows); b._mode = 'upsert'; return b; },
        delete() { b._mode = 'delete'; return b; },
        eq(col, val) { (b._eq = b._eq || []).push([col, val]); return b; },
        then(onOk) {
          if (b._mode === 'select') {
            onOk(opts.selectError ? { error: { message: opts.selectError } } : { data: remoteRows, error: null });
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
// 1) Guest (ยังไม่ล็อกอิน) — ต้องทำงานแบบเดิม 100% และไม่ยิงเซิร์ฟเวอร์เลย
// ════════════════════════════════════════════════════════════════════════════
{
  const { vault } = loadVault();
  vault.addWord('ข้าว', { zh: '飯', source: 'reading-game' });
  const { client, log } = makeClient([]);
  vault.sync(client, null);                    // ไม่มี user = guest
  ok('1a guest: คำในเครื่องยังอยู่', vault.count() === 1);
  ok('1b guest: ไม่ยิงเซิร์ฟเวอร์เลย', log.selects === 0 && log.upserts.length === 0);
  vault.addWord('กิน', { zh: '吃' });
  ok('1c guest: เพิ่มคำต่อได้ปกติ', vault.count() === 2);
  vault.removeWord('กิน');
  ok('1d guest: ลบคำได้ปกติ', vault.count() === 1 && !vault.has('กิน'));
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
  const row = log.upserts[0][0];
  ok('2b แถวที่ส่งมี user_id + vault_key + word_th ถูกต้อง',
     row.user_id === UID && row.vault_key === 'linvault' && row.word_th === 'ข้าว', JSON.stringify(row));
  ok('2c ส่ง source ดิบลง source_raw (ไม่ใช่ source_surface ที่มี FK)',
     row.source_raw === 'reading-game' && row.source_surface === undefined, JSON.stringify(row));
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
// 6) 🔴 รวมคำ 2 เครื่องแล้วเกินเพดาน 30 — ห้ามตัดคำทิ้ง ให้บล็อกการเพิ่มใหม่แทน
// ════════════════════════════════════════════════════════════════════════════
{
  const { vault } = loadVault();
  for (let i = 0; i < 30; i++) vault.addWord('คำA' + i, { zh: 'A' + i });   // เครื่องนี้เต็ม 30
  const remote = [];
  for (let i = 0; i < 25; i++) remote.push({ word_th: 'คำB' + i, zh: 'B' + i, tags: [] }); // เครื่องอื่นอีก 25
  const { client } = makeClient(remote);
  vault.sync(client, UID);
  ok('6a รวมคำได้ครบทั้ง 55 คำ แม้เกินเพดาน 30', vault.count() === 55, 'ได้ ' + vault.count());
  ok('6b ไม่มีคำไหนถูกตัดทิ้ง (เครื่องนี้ครบ 30)',
     vault.has('คำA0') && vault.has('คำA29'));
  ok('6c ของเครื่องอื่นครบ 25', vault.has('คำB0') && vault.has('คำB24'));
  ok('6d เกินเพดาน = ถือว่าเต็ม', vault.isFull() === true);
  const added = vault.addWord('คำใหม่', { zh: 'new' });
  ok('6e บล็อกการเพิ่มคำใหม่ชั่วคราว (ไม่ใช่ตัดคำเก่าทิ้ง)',
     added === false && vault.count() === 55 && !vault.has('คำใหม่'));
  vault.removeWord('คำA0');
  ok('6f ผู้ใช้ลบเองได้ตามปกติ (ทางออกจากสถานะเกินเพดาน)', vault.count() === 54 && !vault.has('คำA0'));
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
  ok('7a ส่งคำสั่งลบไปเซิร์ฟเวอร์ 1 ครั้ง', log.deletes.length === 1, JSON.stringify(log.deletes));
  const cols = (log.deletes[0] || []).map((p) => p[0]);
  ok('7b ลบแบบเจาะจง user + vault_key + คำ (ไม่ลบเหวี่ยง)',
     cols.indexOf('user_id') !== -1 && cols.indexOf('vault_key') !== -1 && cols.indexOf('word_th') !== -1,
     JSON.stringify(cols));
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
// 9) ล็อกเอาท์ (uid = null หลังเคยล็อกอิน) → กลับเป็น local ไม่ลบคำทิ้ง
// ════════════════════════════════════════════════════════════════════════════
{
  const { vault } = loadVault();
  vault.addWord('ข้าว', { zh: '飯' });
  const a = makeClient([]);
  vault.sync(a.client, UID);
  vault.sync(a.client, null);                 // ล็อกเอาท์
  ok('9a คำในเครื่องยังอยู่หลังล็อกเอาท์', vault.count() === 1);
  const b = makeClient([]);
  vault.addWord('กิน', { zh: '吃' });
  ok('9b เพิ่มคำหลังล็อกเอาท์ได้ และไม่ยิงเซิร์ฟเวอร์', vault.count() === 2 && b.log.upserts.length === 0);
}

// ── สรุป ────────────────────────────────────────────────────────────────────
if (fails.length) {
  console.error('❌ ตัวทดสอบคลังคำ sync ไม่ผ่าน ' + fails.length + ' ข้อ (ผ่าน ' + pass + '):');
  fails.forEach((f) => console.error('  - ' + f));
  process.exit(1);
}
console.log('✓ word-vault sync tests: ผ่านครบ ' + pass + ' ข้อ (guest/รวมคำ 4 กรณี/เกินเพดาน/ลบ/เซิร์ฟเวอร์ล่ม/ล็อกเอาท์)');
