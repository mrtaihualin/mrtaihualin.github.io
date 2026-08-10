#!/usr/bin/env node
/**
 * sync-search-gemini-whitelist.js
 *
 * ดึงรายชื่อ id + title ทั้งหมดจาก data/search-index.js (single source ของจริง)
 * แล้วเขียนทับบล็อก DESTINATIONS ใน supabase/functions/search-gemini/index.ts
 * (ระหว่าง marker GENERATED_WHITELIST_START / END) — กัน whitelist หลุดตกหล่น
 * เวลามีคน id ใหม่/ลบ id เข้า search-index.js แล้วลืมอัปเดตฝั่ง Edge Function
 *
 * รันซ้ำได้เสมอ (idempotent — เขียนทับบล็อกเดิมทุกครั้ง)
 *
 * วิธีรัน: node scripts/sync-search-gemini-whitelist.js
 * (รันทุกครั้งที่ data/search-index.js เปลี่ยน id/title — แล้ว Lin ค่อย deploy
 *  search-gemini ใหม่ตอนพร้อมจริง ไฟล์นี้แค่แก้โค้ดในเครื่อง ไม่ deploy อะไรเอง)
 */

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const SEARCH_INDEX_PATH = path.join(REPO_ROOT, 'data', 'search-index.js');
const TARGET_PATH = path.join(REPO_ROOT, 'supabase', 'functions', 'search-gemini', 'index.ts');

const START_MARKER = '// GENERATED_WHITELIST_START';
const END_MARKER = '// GENERATED_WHITELIST_END';

function main() {
  const SEARCH_INDEX = require(SEARCH_INDEX_PATH);
  const all = SEARCH_INDEX.ALL || [];
  if (!all.length) {
    console.error('❌ data/search-index.js ไม่มีรายการเลย (SEARCH_INDEX.ALL ว่าง) — หยุด ไม่เขียนทับอะไร');
    process.exit(1);
  }

  // เอาแค่ id + title ให้ Gemini เลือก (ไม่ส่ง desc/keywords/href ไปด้วย — กันพรอมต์ยาวเกินจำเป็น
  // และกัน href หลุดไปให้ Gemini เห็น เพราะ Gemini ไม่ควรรู้ URL เลย มันเลือกได้แค่ id)
  // 2026-08-10: ใช้ routingTitle แทน title ถ้ามี (เฉพาะ destination ที่ชื่อชนกันจนแยกไม่ออก
  // — ดู data/search-index.js) title เดิมยังคงอยู่ครบ ไม่แตะ เพราะยังใช้โชว์ผลค้นหา/SEO
  const destinations = all.map((e) => ({ id: e.id, title: e.routingTitle || e.title }));

  // ตรวจ id ซ้ำ — ถ้ามีจริงคือบั๊กใน search-index.js เอง ต้องหยุดแจ้งก่อน ไม่ใช่ปล่อยผ่าน
  const seen = new Set();
  const dupes = [];
  destinations.forEach((d) => {
    if (seen.has(d.id)) dupes.push(d.id);
    seen.add(d.id);
  });
  if (dupes.length) {
    console.error('❌ พบ id ซ้ำใน data/search-index.js: ' + dupes.join(', ') + ' — หยุด ไม่เขียนทับ');
    process.exit(1);
  }

  const literal = JSON.stringify(destinations, null, 2)
    .split('\n')
    .join('\n');

  const block =
    `${START_MARKER} — เกิดจาก scripts/sync-search-gemini-whitelist.js (ห้ามแก้มือ)\n` +
    `// รันสคริปต์นี้ใหม่ทุกครั้งที่ data/search-index.js เปลี่ยน id/title:\n` +
    `//   node scripts/sync-search-gemini-whitelist.js\n` +
    `// สร้างล่าสุด: ${new Date().toISOString().slice(0, 10)} · ${destinations.length} รายการ\n` +
    `const DESTINATIONS = ${literal};\n` +
    `${END_MARKER}`;

  let content;
  try {
    content = fs.readFileSync(TARGET_PATH, 'utf8');
  } catch (e) {
    console.error('❌ อ่านไฟล์ปลายทางไม่ได้: ' + e.message);
    process.exit(1);
  }

  const startIdx = content.indexOf(START_MARKER);
  const endIdx = content.indexOf(END_MARKER);
  if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) {
    console.error('❌ หา marker GENERATED_WHITELIST_START/END ใน search-gemini/index.ts ไม่เจอ — หยุด ไม่เขียนทับ');
    process.exit(1);
  }

  const before = content.slice(0, startIdx);
  const after = content.slice(endIdx + END_MARKER.length);
  const out = before + block + after;

  fs.writeFileSync(TARGET_PATH, out, 'utf8');
  console.log(`✓ อัปเดต DESTINATIONS ใน supabase/functions/search-gemini/index.ts แล้ว (${destinations.length} รายการ)`);
}

main();
