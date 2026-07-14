/**
 * check-data-health.js — ตัวตรวจสุขภาพข้อมูลคำ (data/words-data.js)
 * รันก่อน push ทุกครั้งที่แตะ data/words-data.js (ตามกฎ CLAUDE.md หัวข้อ 🗄️ ฐานข้อมูลเกมกลาง)
 *
 * วิธีรัน: node data/check-data-health.js
 * ผ่าน = ไม่มี error พิมพ์ออกมา (exit code 0)
 * ไม่ผ่าน = พิมพ์รายการที่ผิด (exit code 1) — ห้าม push จนกว่าจะแก้หมด
 *
 * เช็คอะไรบ้าง (เพิ่มหลังเจอบั๊ก 2026-07-14: syls[].th ดันใส่คำอ่านแทนตัวสะกดจริง เช่น
 * รถทัวร์ → th:'รด'+'ทัว' แทนที่จะเป็น th:'รถ'+'ทัวร์' → ตอนพิมพ์เกมพิมพ์เลยให้พิมพ์ผิดคำ):
 *   1. syls[].th ต่อกันแล้วต้อง = word เป๊ะ (ตัวพิมพ์เป็นตัวสะกดจริงเท่านั้น ห้ามใส่คำอ่าน/พยางค์แทรก)
 *   2. คำที่มี syls (หลายพยางค์) ต้องมี readingTH ด้วย (ใช้แยกกับ syls โดยเจตนา — คำอ่านอยู่ readingTH
 *      อย่างเดียว ไม่ผูกกับจำนวน/เนื้อหาของ syls อีกต่อไป ตามที่ Lin ยืนยัน 2026-07-14)
 *   3. ทุกพยางค์ใน syls ต้องมี th (ไม่เว้นว่าง)
 *   4. ระดับ (level) ต้องตรงกฎที่ Lin ตั้ง 2026-07-14:
 *      - 1 พยางค์ → 初 เสมอ
 *      - 2 พยางค์ + อ่านตรงตัว (readingTH ตัด - แล้ว = ตัวสะกด, ง่าย) → 初
 *      - 2 พยางค์ + อ่านไม่ตรงตัว (ยาก เช่น ถนน อ่าน ถะ-หนน) → 中
 *      - 3 พยางค์ขึ้นไป (ไม่ว่าง่ายหรือยาก) → 中
 */
global.window = global;
require('./words-data.js');
const W = global.WORDS_MASTER;

let errors = [];

function sylCount(w) { return (w.syls && w.syls.length) ? w.syls.length : 1; }
function isHardReading(w) {
  if (w.readingTH === undefined) return false;
  return w.readingTH.split('-').join('') !== w.word;
}
function expectedLevel(w) {
  const n = sylCount(w);
  if (n === 1) return '初';
  if (n === 2) return isHardReading(w) ? '中' : '初';
  return '中';
}

W.forEach(function (w) {
  // เช็ค 4: ระดับตรงกฎไหม (เช็คทุกคำ ไม่ว่ามี syls หรือไม่)
  const exp = expectedLevel(w);
  if (w.level !== exp) {
    errors.push(w.word + ' → level เป็น "' + w.level + '" แต่ควรเป็น "' + exp + '" (' + sylCount(w) + ' พยางค์, ' + (isHardReading(w) ? 'อ่านยาก' : 'อ่านง่าย') + ')');
  }

  if (!w.syls || !w.syls.length) return;

  // เช็ค 1: syls[].th ต่อกัน = word จริง
  const missingTh = w.syls.some(function (s) { return !s.th; });
  if (missingTh) {
    errors.push(w.word + ' → มีพยางค์ที่ไม่มี th');
    return;
  }
  const concat = w.syls.map(function (s) { return s.th; }).join('');
  if (concat !== w.word) {
    errors.push(w.word + ' → syls.th ต่อกันได้ "' + concat + '" ไม่ตรงกับคำจริง (พิมพ์เกมพิมพ์จะผิด)');
  }

  // เช็ค 2: คำหลายพยางค์ต้องมี readingTH
  if (w.readingTH === undefined) {
    errors.push(w.word + ' → มี syls แต่ไม่มี readingTH (กล่องวรรณยุกต์จะโชว์คำอ่านไม่ได้)');
  }
});

if (errors.length) {
  console.log('❌ พบปัญหา ' + errors.length + ' คำ:\n');
  errors.forEach(function (e) { console.log('- ' + e); });
  process.exitCode = 1;
} else {
  console.log('✅ ผ่านหมด — syls.th ตรงตัวสะกดจริง + level ตรงกฎ ครบทั้ง ' + W.length + ' คำ');
}
