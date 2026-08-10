/**
 * tests-tone-engine.js — เทสง่ายๆ (input→output ชัดเจน) คุ้มกันไม่ให้ tone-engine.js พังตอนแก้โค้ดครั้งหน้า
 * ROLE: Node unit-test entrypoint for stable Thai tone-rule examples
 * ต่างจาก data/tools/regression-check-tone.js (เช็คคำทั้งคลัง 288+ คำจริงใน words-data.js) — ไฟล์นี้เช็คแค่
 * "กฎวรรณยุกต์พื้นฐาน" ด้วยคำจริงที่คนไทยทุกคนรู้จักเสียงแน่นอน (ไม่ใช่คำศัพท์ที่ต้องรอ Lin ยืนยันเนื้อหา
 * — กฎวรรณยุกต์เป็นกฎภาษาไทยมาตรฐาน ไม่ใช่ "เนื้อหาเกม" ตามกฎ 16) ไม่แก้ tone-engine.js เลย แค่เรียกใช้
 *
 * วิธีรัน: node data/tools/tests-tone-engine.js
 * ผ่าน = "✅ ผ่านหมด" + exit code 0 / ไม่ผ่าน = พิมพ์เคสที่พังทีละอัน + exit code 1
 */
global.window = global;
require('../tone-engine.js');
const TH = global.TH;
const computeToneFromSpelling = global.computeToneFromSpelling;
const getFullSyllableSpelling = global.getFullSyllableSpelling;

const TONE_NUM_NAME = ['', 'สามัญ', 'เอก', 'โท', 'ตรี', 'จัตวา'];

// ── ชุดที่ 1: computeToneFromSpelling(word) — คำจริงครอบคลุมกลาง/สูง/ต่ำ × มีวรรณยุกต์/ไม่มี × เป็น/ตาย ──
const SPELLING_CASES = [
  // อักษรกลาง (มีมาร์กครบ 4 + พื้นเสียงเป็น)
  { word: 'กา',  expect: 1, note: 'กลาง+เป็น ไม่มีมาร์ก = สามัญ' },
  { word: 'ก่า', expect: 2, note: 'กลาง+ ่ = เอก' },
  { word: 'ก้า', expect: 3, note: 'กลาง+ ้ = โท' },
  { word: 'ก๊า', expect: 4, note: 'กลาง+ ๊ = ตรี' },
  { word: 'ก๋า', expect: 5, note: 'กลาง+ ๋ = จัตวา' },
  { word: 'กะ',  expect: 2, note: 'กลาง+ตาย(สั้น) ไม่มีมาร์ก = เอก' },
  // อักษรสูง
  { word: 'ขา',  expect: 5, note: 'สูง+เป็น ไม่มีมาร์ก = จัตวา' },
  { word: 'ข่า', expect: 2, note: 'สูง+ ่ = เอก (ข่า = ข่าตะไคร้)' },
  { word: 'ข้า', expect: 3, note: 'สูง+ ้ = โท (ข้า = ข้าทาส)' },
  { word: 'ผัด', expect: 2, note: 'สูง+ตาย ไม่มีมาร์ก = เอก (ผัด = ผัดผัก)' },
  // อักษรต่ำ
  { word: 'คา',  expect: 1, note: 'ต่ำ+เป็น ไม่มีมาร์ก = สามัญ' },
  { word: 'ค่า', expect: 3, note: 'ต่ำ+ ่ = โท (ค่า = ราคา)' },
  { word: 'ค้า', expect: 4, note: 'ต่ำ+ ้ = ตรี (ค้า = ค้าขาย)' },
  { word: 'มาก', expect: 3, note: 'ต่ำ+ตาย+สระยาว = โท (มาก = จำนวนมาก)' },
  { word: 'มัก', expect: 4, note: 'ต่ำ+ตาย+สระสั้น = ตรี (มัก = มักจะ)' },
  // อักษรนำ (ห นำ) — แก้บั๊ก (a) ที่คอมเมนต์ในไฟล์เอง
  { word: 'หมา', expect: 5, note: 'ห+ม (อักษรนำ) นับเป็นสูง+เป็น = จัตวา (หมา = สัตว์)' },
  { word: 'หนู', expect: 5, note: 'ห+น (อักษรนำ) = จัตวา (หนู = สัตว์)' },
  // อ นำ (กรณีตายตัว)
  { word: 'อยาก', expect: 2, note: 'อย นำ + ตาย = เอก (อยาก = ต้องการ)' },
  // ควบกล้ำไม่แท้ สร/ศร/ษร — แก้บั๊ก (d)
  { word: 'สระ', expect: 2, note: 'ส+ร ไม่แท้ (ร ไม่ออกเสียง) → สะ = สูง+ตาย = เอก (สระ = สระว่ายน้ำ)' }
];

// ── ชุดที่ 2: getFullSyllableSpelling({th, lead, vowel}) — ต่อ lead กลับ / เติมสระที่ th ขาด ──
const SPELLING_BUILD_CASES = [
  { syl: { th: 'ลาด', lead: 'ห' }, expect: 'หลาด', note: 'ต่อ lead กลับ (ตลาด พยางค์ 2 เก็บ th ไม่มี ห)' },
  { syl: { th: 'หน้า' }, expect: 'หน้า', note: 'th มี ห อยู่แล้ว ไม่ต่อซ้ำ' },
  { syl: { th: 'บ', vowel: 'ออ' }, expect: 'บอ', note: 'th ตัวเดียวโดดๆ เติมสระ ออ กลับ (บริษัท พยางค์ 1)' }
];

// ── ชุดที่ 3: TRAILING_SILENT_FIX ผ่าน _normalize (ทดสอบทางอ้อมผ่าน computeToneFromSpelling) ──
const NORMALIZE_CASES = [
  { word: 'ญาติ', expect: 3, note: 'ญ ต่ำ + ติ ไม่ออกเสียง(ตัดเหลือ ญาต จบด้วย ต=ตาย) → ตาย(ยาว)+ต่ำ = โท (ยืนยัน: ญาติ ออกเสียงจริง "yâat" โท)' },
  { word: 'จันทร์', expect: 1, note: 'ทร์ การันต์ 2 ตัว (ตัดเหลือ จัน) → เป็น(น)+กลาง(จ) = สามัญ' }
];

let pass = 0, fail = 0;
function check(label, actual, expected, note) {
  if (actual === expected) { pass++; return; }
  fail++;
  console.log('❌ ' + label + ' → ได้ ' + JSON.stringify(actual) + ' ต้องการ ' + JSON.stringify(expected) + '  (' + note + ')');
}

SPELLING_CASES.forEach(function (c) {
  const got = computeToneFromSpelling(c.word);
  check('computeToneFromSpelling("' + c.word + '")', got, c.expect,
    c.note + ' — ได้ ' + (got ? TONE_NUM_NAME[got] : 'null') + ' ต้องการ ' + TONE_NUM_NAME[c.expect]);
});

SPELLING_BUILD_CASES.forEach(function (c) {
  const got = getFullSyllableSpelling(c.syl);
  check('getFullSyllableSpelling(' + JSON.stringify(c.syl) + ')', got, c.expect, c.note);
});

NORMALIZE_CASES.forEach(function (c) {
  const got = computeToneFromSpelling(c.word);
  check('computeToneFromSpelling("' + c.word + '") [normalize]', got, c.expect,
    c.note + ' — ได้ ' + (got ? TONE_NUM_NAME[got] : 'null') + ' ต้องการ ' + TONE_NUM_NAME[c.expect]);
});

console.log('');
if (fail) {
  console.log('❌ พัง ' + fail + ' เคส (ผ่าน ' + pass + '/' + (pass + fail) + ')');
  process.exitCode = 1;
} else {
  console.log('✅ ผ่านหมด ' + pass + '/' + pass + ' เคส');
}
