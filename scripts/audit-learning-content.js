#!/usr/bin/env node
/**
 * scripts/audit-learning-content.js
 * FILE MAP: loader → [1] metadata gaps → [2] 2 แกนหมวดปนกัน → [3] จำนวนต่อหมวด → [4] กราฟคำ↔ประโยค → [5] เพดานกับของที่มีจริง → สรุป
 * ────────────────────────────────────────────────────────────────────────────
 * ตัวตรวจ "ช่องว่างของคลังเนื้อหา" สำหรับระบบเรียนกลาง (Learning System Foundation)
 * คู่กับ supabase/sql/2026-08-11_learning_foundation.sql
 *
 * 🔒 อ่านอย่างเดียว 100% — ไม่แก้ไฟล์ ไม่แตะฐานข้อมูล ไม่แต่งเนื้อหา ไม่เสนอคำใหม่
 *    (ตามกฎ 16: AI ห้ามแต่ง/เพิ่ม/ลบ/แก้เนื้อหาเกมเอง · หน้าที่ของไฟล์นี้คือ "ชี้ช่องว่างให้ Lin เห็น" เท่านั้น)
 *
 * วิธีรัน: node scripts/audit-learning-content.js            ← แบบย่อ (ใช้ใน check-site.js)
 *          node scripts/audit-learning-content.js --full     ← แบบเต็ม มีรายการทุกบรรทัด (Lin อ่านเอง)
 *          node scripts/audit-learning-content.js --words=<path> --sentences=<path>
 *                                                            ← ตรวจไฟล์ร่างก่อนเอาเข้าคลังจริง
 *   ผ่าน (exit 0)     = ไม่มีข้อมูลผิดรูปแบบ (รายงานช่องว่างยังพิมพ์ออกมาปกติ ไม่ถือว่าไม่ผ่าน)
 *   ไม่ผ่าน (exit 1)  = เจอข้อมูลที่ผิดรูปแบบจริง (ขาด zh / category / level) → ต้องแก้ก่อน push
 *
 * ทำไมแยกจาก data/tools/check-data-health.js (ไม่ทำซ้ำ):
 *   check-data-health.js  = ตรวจ "ความถูกต้องทางภาษา" (syls ต่อกันเป็นคำจริง · readingTH · ระดับ · final 8 มาตรา)
 *   ไฟล์นี้               = ตรวจ "ความพร้อมของคลังในฐานะระบบเรียน" (metadata ครบ · 2 แกนหมวด · จำนวนต่อหมวด ·
 *                           คำในประโยคมีตัวตนของตัวเองหรือยัง · ของที่มีจริง vs เพดานที่ผู้เล่นเข้าถึงได้)
 *   คำซ้ำ → มี data/tools/check-duplicate-words.js อยู่แล้ว ไฟล์นี้จึงไม่ตรวจซ้ำ
 * ────────────────────────────────────────────────────────────────────────────
 */
'use strict';

const path = require('path');

// ── อ่านตัวเลือกจากบรรทัดคำสั่ง ──
const argv = process.argv.slice(2);
const FULL = argv.includes('--full');
function argPath(name, def) {
  const hit = argv.find((a) => a.indexOf('--' + name + '=') === 0);
  return hit ? path.resolve(hit.split('=').slice(1).join('=')) : def;
}
const WORDS_FILE = argPath('words', path.join(__dirname, '..', 'data', 'words-data.js'));
const SENTS_FILE = argPath('sentences', path.join(__dirname, '..', 'data', 'adv-sentences.js'));

// โหลดไฟล์ข้อมูลแบบเดียวกับ data/tools/check-data-health.js (ไฟล์เขียนไว้สำหรับ browser)
global.window = global;
require(WORDS_FILE);
require(SENTS_FILE);

const WORDS = global.WORDS_MASTER_FULL || global.WORDS_MASTER || [];
const SENTS = global.ADV_SENTENCES_FULL || global.ADV_SENTENCES || [];

const errors = [];   // ผิดรูปแบบจริง → บล็อก push
const report = [];   // ช่องว่าง/ข้อสังเกต → ไม่บล็อก แต่ Lin ต้องเห็น

function say(s) { report.push(s); }
/** บรรทัดรายละเอียด — พิมพ์เฉพาะโหมด --full (กันรายงานยาวท่วม check-site.js) */
function detail(s) { if (FULL) report.push(s); }

if (!WORDS.length || !SENTS.length) {
  console.error('❌ อ่านคลังคำ/ประโยคไม่ได้ — โครงสร้างไฟล์ data/*.js อาจเปลี่ยน');
  process.exit(1);
}

say('📚 คลังที่อ่านได้: คำ ' + WORDS.length + ' คำ · ประโยค 高級 ' + SENTS.length + ' ประโยค');

// ════════════════════════════════════════════════════════════════════
// [1] metadata ที่ระบบเรียนกลางต้องใช้ — ขาดคือผิด (บล็อก push)
// ════════════════════════════════════════════════════════════════════
let noEn = 0;
WORDS.forEach((w, i) => {
  const id = 'คำที่ ' + (i + 1) + ' "' + (w.word || '(ไม่มีตัวสะกด)') + '"';
  if (!w.word) errors.push(id + ' ไม่มีฟิลด์ word');
  if (!w.level) errors.push(id + ' ไม่มีระดับ (level) — ระดับความยากเป็นแกนกลางของทั้งระบบ ขาดไม่ได้');
  if (!w.zh) errors.push(id + ' ไม่มีคำแปลจีน (zh) — ผู้เรียนอ่านไม่รู้เรื่อง');
  if (!w.category) errors.push(id + ' ไม่มีหมวด (category) — จัดเข้าระบบค้นหา/แนะนำไม่ได้');
  if (!w.en) noEn++;
});
SENTS.forEach((s, i) => {
  const id = 'ประโยคที่ ' + (i + 1) + ' "' + (s.th || '(ไม่มีตัวสะกด)') + '"';
  if (!s.th) errors.push(id + ' ไม่มีฟิลด์ th');
  if (!s.zh) errors.push(id + ' ไม่มีคำแปลจีน (zh)');
  if (!Array.isArray(s.words) || !s.words.length) errors.push(id + ' ไม่มีรายการคำ (words) — สร้างความสัมพันธ์คำ↔ประโยคไม่ได้');
});
if (noEn) say('⚠️  คำที่ไม่มีคำอ่านโรมัน (en): ' + noEn + ' คำ (เตือนเท่านั้น ไม่บล็อก)');

// ════════════════════════════════════════════════════════════════════
// [2] 🔴 ข้อสำคัญที่สุด — ช่อง category เดียววันนี้ "ปน 2 แกน" อยู่
//     สเปกของ Lin ต้องแยก 詞類 (ชนิดคำ) กับ 情境 (สถานการณ์) เป็น 2 แกน many-to-many
//     ไฟล์นี้ **ไม่จับคู่ให้** — จับคู่ = ตัดสิน Learning Design แทน Lin (ห้ามเดา)
//     หน้าที่ของหัวข้อนี้: โชว์ค่าที่มีจริงทั้งหมด + ชี้ว่าค่าไหนมีคำบอกชนิดคำอยู่ในตัว
// ════════════════════════════════════════════════════════════════════
const cats = {};
WORDS.forEach((w) => {
  const c = w.category || '(ไม่มี)';
  cats[c] = cats[c] || { total: 0, byLevel: {} };
  cats[c].total++;
  cats[c].byLevel[w.level] = (cats[c].byLevel[w.level] || 0) + 1;
});
const catNames = Object.keys(cats).sort();

// คำที่แปลว่า "ชนิดของคำ" ในภาษาไทย — ใช้เป็นเบาะแสว่าค่านั้นน่าจะอยู่แกน 詞類
// ⚠️ นี่คือการดูตัวหนังสือเท่านั้น ไม่ใช่คำตัดสินว่าค่านั้นอยู่แกนไหน — Lin ตัดสิน
const POS_HINT = ['กริยา', 'นาม', 'สรรพนาม', 'บุพบท', 'สันธาน', 'ลักษณนาม', 'คำขยาย', 'คำอุทาน', 'กิริยานุเคราะห์'];
const looksPos = catNames.filter((c) => POS_HINT.some((h) => c.indexOf(h) !== -1));
const noHint = catNames.filter((c) => looksPos.indexOf(c) === -1);

say('');
say('🏷️  [2] หมวดที่มีจริงในคลังวันนี้: ' + catNames.length + ' ค่า — ทั้งหมดอยู่ในช่อง category ช่องเดียว');
say('    ข้อสังเกต (ไม่ใช่ข้อสรุป — รอ Lin จับคู่เข้าแกน 詞類/情境 เอง): มีเบาะแสชนิดคำ ' +
    looksPos.length + ' ค่า · ไม่มีเบาะแส ' + noHint.length + ' ค่า');
detail('    · ค่าที่มีคำบอก "ชนิดคำ" อยู่ในชื่อ: ' + looksPos.join(' · '));
detail('    · ค่าที่ไม่มีเบาะแสชนิดคำ: ' + noHint.join(' · '));
say('    ⚠️ บางค่าปนทั้ง 2 แกนในตัวเดียว เช่น "นามอาหาร" (นาม = ชนิดคำ + อาหาร = สถานการณ์)');
say('       → โครงใหม่รองรับ 1 คำหลายป้ายหลายแกนแล้ว แต่ตาราง learning_tags ยังว่างอยู่');
say('       รอ Lin ตัดสินรายชื่อ 詞類/情境 ก่อน (CLAUDE.md: ห้าม hard-code taxonomy จากการเดา)');

// ════════════════════════════════════════════════════════════════════
// [3] จำนวนต่อหมวด vs เป้าประมาณ 20 (§24) — รายงานช่องว่าง ห้ามเติมเอง
// ════════════════════════════════════════════════════════════════════
const TARGET = 20;
const thin = [];
catNames.forEach((c) => {
  Object.keys(cats[c].byLevel).sort().forEach((lv) => {
    const n = cats[c].byLevel[lv];
    if (n < TARGET) thin.push({ cat: c, lv: lv, n: n });
  });
});
say('');
say('📊 [3] หมวด×ระดับ ที่ยังไม่ถึงประมาณ ' + TARGET + ' คำ: ' + thin.length + ' รายการ (เป้าอ้างอิง ไม่ใช่ด่านบังคับ)');
thin.sort((a, b) => a.n - b.n).forEach((t) => {
  detail('    ขาด ' + String(TARGET - t.n).padStart(2) + ' คำ → ' + t.lv + ' | ' + t.cat + ' (มี ' + t.n + ')');
});
if (!FULL && thin.length) say('    (ดูรายการทั้งหมดด้วย --full)');
say('    🔴 AI ห้ามเติมคำเองเพื่อให้ครบ 20 (กฎ 16 + ข้อ 24 ของสเปก) — รายการนี้ให้ Lin ตัดสินว่าจะเพิ่มหมวดไหนก่อน');

// ════════════════════════════════════════════════════════════════════
// [4] ความสัมพันธ์ คำ ↔ ประโยค (§3) — สร้างอัตโนมัติได้แค่ไหน
//     ตรวจว่า "คำที่อยู่ในประโยค 高級" มีตัวตนเป็นคำเดี่ยวในคลังหรือยัง
// ════════════════════════════════════════════════════════════════════
const masterWords = new Set(WORDS.map((w) => w.word));
let tokens = 0, matched = 0;
const unmatched = new Map();   // คำ → จำนวนประโยคที่ใช้
SENTS.forEach((s) => {
  (s.words || []).forEach((x) => {
    if (!x || !x.th) return;
    tokens++;
    if (masterWords.has(x.th)) matched++;
    else unmatched.set(x.th, (unmatched.get(x.th) || 0) + 1);
  });
});
const pct = tokens ? Math.round((matched / tokens) * 100) : 0;
say('');
say('🔗 [4] คำในประโยค 高級 ทั้งหมด ' + tokens + ' ตำแหน่ง — จับคู่กับคำเดี่ยวในคลังได้ ' + matched + ' (' + pct + '%)');
say('    → แปลว่าเส้นเชื่อม "ประโยค → คำ" สร้างอัตโนมัติได้ ' + pct + '% ที่เหลือยังไม่มีตัวตนคำเดี่ยว');
if (unmatched.size) {
  const list = [...unmatched.entries()].sort((a, b) => b[1] - a[1]);
  say('    คำที่ยังไม่มีตัวตนเป็นคำเดี่ยว: ' + unmatched.size + ' คำ');
  detail('      ' + list.map((e) => e[0] + '(' + e[1] + ')').join(' · '));
  say('    🔴 ห้าม AI เพิ่มคำพวกนี้เข้าคลังเองเพื่อให้กราฟครบ (สเปกข้อ 1: ห้ามสร้าง content ใหม่');
  say('       เพียงเพื่อให้ครบ game compatibility) — Lin ตัดสินว่าคำไหนควรเป็นคำเดี่ยวจริง');
}
say('    ⚠️ และห้ามใช้เส้นเชื่อมนี้แปลว่า "ทำประโยคได้ = คำทุกคำ mastered" (กฎที่ Lin ย้ำในสเปกข้อ 3)');

// ════════════════════════════════════════════════════════════════════
// [5] ของที่มีจริง vs เพดานที่ผู้เล่นเข้าถึงได้ (§19 — Free ต้องเป็นระบบเรียนจริง)
//     เพดานจริงอยู่ที่ CAPS ใน supabase/functions/game-content/index.ts (แหล่งเดียว)
//     ตัวเลขข้างล่างคัดลอกมาเทียบเพื่อรายงานเท่านั้น — ห้ามถือเป็นแหล่งความจริงที่สอง
// ════════════════════════════════════════════════════════════════════
const CAPS_FOR_REPORT = { anon: { '初': 50, '中': 50, s: 20 }, login: { '初': 100, '中': 100, s: 40 } };
const have = { '初': 0, '中': 0 };
WORDS.forEach((w) => { if (have[w.level] !== undefined) have[w.level]++; });
say('');
say('🔓 [5] ของที่มีในคลัง เทียบเพดานที่เข้าถึงได้จริงวันนี้');
['初', '中'].forEach((lv) => {
  const a = CAPS_FOR_REPORT.anon[lv], l = CAPS_FOR_REPORT.login[lv];
  say('    ' + lv + ': มี ' + have[lv] + ' คำ · ไม่ล็อกอินเห็น ' + a + ' · ล็อกอินฟรีเห็น ' + l +
      ' → ยังไม่มีใครเข้าถึงได้เลย ' + Math.max(0, have[lv] - l) + ' คำ');
});
say('    ประโยค 高: มี ' + SENTS.length + ' ประโยค · ไม่ล็อกอิน ' + CAPS_FOR_REPORT.anon.s +
    ' · ล็อกอินฟรี ' + CAPS_FOR_REPORT.login.s + ' → ยังไม่มีใครเข้าถึงได้เลย ' +
    Math.max(0, SENTS.length - CAPS_FOR_REPORT.login.s) + ' ประโยค');
say('    📌 ตัวเลขเพดานแก้ได้ที่ supabase/functions/game-content/index.ts (ค่า CAPS) ที่เดียวเท่านั้น');
say('       ยังไม่ย้ายมาเป็น Entitlement ในฐานข้อมูลโดยตั้งใจ — กันมีเพดาน 2 ที่แล้วไม่ตรงกัน');

// ════════════════════════════════════════════════════════════════════
// [6] สิ่งที่ตรวจจากในเครื่องไม่ได้ — ต้องถามฐานข้อมูลจริง (บอกตรงๆ ห้ามเงียบ)
// ════════════════════════════════════════════════════════════════════
say('');
say('❓ [6] เรื่องที่ไฟล์นี้ตรวจไม่ได้ (ต้องดูจากฐานข้อมูลจริง — ยังไม่ยืนยัน):');
say('    · ไฟล์เสียงครบไหม / เสียงพัง (ตาราง audio_assets อยู่บนเซิร์ฟเวอร์)');
say('    · item ไหนใช้กับเกมไหนได้จริง (learning_item_surfaces ตั้งใจยังว่าง รอ Lin ยืนยันเกณฑ์)');
say('    · คลังใน Supabase ตรงกับไฟล์ต้นฉบับหรือยัง (ต้องรัน scripts/migrate-game-content.js)');
say('    · เนื้อหาที่ผู้เรียนรายงานว่าผิด / อัตราตอบผิดผิดปกติ (ยังไม่มีระบบเก็บ — practice_events ยังว่าง)');

// ── สรุป ────────────────────────────────────────────────────────────
console.log(report.join('\n'));
if (errors.length) {
  console.error('\n❌ ข้อมูลผิดรูปแบบ ' + errors.length + ' รายการ — ต้องแก้ก่อน push:');
  errors.slice(0, 40).forEach((e) => console.error('  - ' + e));
  if (errors.length > 40) console.error('  … และอีก ' + (errors.length - 40) + ' รายการ');
  process.exit(1);
}
console.log('\n✅ metadata ที่ระบบเรียนกลางต้องใช้ครบทุกคำ/ทุกประโยค (ช่องว่างด้านบนเป็นรายงานให้ Lin ตัดสิน ไม่ใช่ข้อผิดพลาด)');
