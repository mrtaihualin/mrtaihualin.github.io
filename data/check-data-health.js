/**
 * check-data-health.js — ตัวตรวจสุขภาพข้อมูลคำ+ประโยค (data/words-data.js + data/adv-sentences.js)
 * รันก่อน push ทุกครั้งที่แตะ data/words-data.js หรือ data/adv-sentences.js (ตามกฎ CLAUDE.md หัวข้อ 🗄️ ฐานข้อมูลเกมกลาง)
 *
 * วิธีรัน: node data/check-data-health.js
 * ผ่าน = ไม่มี error พิมพ์ออกมา (exit code 0)
 * ไม่ผ่าน = พิมพ์รายการที่ผิด (exit code 1) — ห้าม push จนกว่าจะแก้หมด
 *
 * เช็คอะไรบ้าง (เพิ่มหลังเจอบั๊ก 2026-07-14: syls[].th ดันใส่คำอ่านแทนตัวสะกดจริง เช่น
 * รถทัวร์ → th:'รด'+'ทัว' แทนที่จะเป็น th:'รถ'+'ทัวร์' → ตอนพิมพ์เกมพิมพ์เลยให้พิมพ์ผิดคำ):
 *   1. syls[].th ต่อกันแล้วต้อง = word เป๊ะ (ตัวพิมพ์เป็นตัวสะกดจริงเท่านั้น ห้ามใส่คำอ่าน/พยางค์แทรก)
 *      — เช็คทุกคำเสมอ (2026-07-15: หลังรวม schema ทุกคำมี syls แล้ว รวมคำพยางค์เดียวด้วย ไม่ใช่แค่คำหลายพยางค์)
 *   2. คำ 2 พยางค์ขึ้นไป ต้องมี readingTH ด้วย (ใช้แยกกับ syls โดยเจตนา — คำอ่านอยู่ readingTH
 *      อย่างเดียว ไม่ผูกกับจำนวน/เนื้อหาของ syls อีกต่อไป ตามที่ Lin ยืนยัน 2026-07-14)
 *   3. ทุกพยางค์ใน syls ต้องมี th (ไม่เว้นว่าง)
 *   4. ระดับ (level) ต้องตรงกฎที่ Lin ตั้ง 2026-07-14:
 *      - 1 พยางค์ → 初 เสมอ
 *      - 2 พยางค์ + อ่านตรงตัว (readingTH ตัด - แล้ว = ตัวสะกด, ง่าย) → 初
 *      - 2 พยางค์ + อ่านไม่ตรงตัว (ยาก เช่น ถนน อ่าน ถะ-หนน) → 中
 *      - 3 พยางค์ขึ้นไป (ไม่ว่าง่ายหรือยาก) → 中
 *
 * 2026-07-15: รวม schema words-data.js แล้ว (คำพยางค์เดียวห่อ syls:[{...}] เหมือนคำหลายพยางค์ทั้งหมด)
 * sylCount() เลยอ่าน w.syls.length ตรงๆ ได้เลย ไม่ต้อง fallback เป็น 1 อีกต่อไป และเช็ค 1 (concat)
 * รันได้กับทุกคำจริงๆ (เดิมมี early-return ข้ามคำพยางค์เดียวเพราะใช้ "มี/ไม่มี syls" เป็นตัวเช็คจำนวนพยางค์
 * — บั๊กคลาสเดียวกับที่พบใน reading-game.html/typing-game.html inLevel())
 *
 * 2026-07-16: เพิ่มเช็ค data/adv-sentences.js (ADV_SENTENCES) ด้วย — หลังพบว่าบั๊กคลาสเดียวกัน
 * (syls[].th สะกดผิด เช่น ภาษาไทย/อร่อย 9 จุด) หลุดเข้ามาในไฟล์ประโยค 高級 เพราะตัวตรวจเดิมเช็ค
 * แค่ words-data.js อย่างเดียว ไม่ได้แตะไฟล์ประโยคเลย โครงสร้างไฟล์ประโยคต่างจากไฟล์คำ
 * (ประโยค → words[] → syls[]) จึงต้องเช็คแยกอีกก้อนหนึ่ง แต่ใช้กติกาเดิม (syls[].th ต่อกัน = th จริง)
 * ⚠️ ต้องรันไฟล์นี้ก่อน push ทุกครั้งที่แตะ data/words-data.js หรือ data/adv-sentences.js ไฟล์ใดไฟล์หนึ่ง
 */
global.window = global;
require('./words-data.js');
const W = global.WORDS_MASTER;

let errors = [];

function sylCount(w) { return w.syls.length; }
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
  // เช็ค 4: ระดับตรงกฎไหม
  const exp = expectedLevel(w);
  if (w.level !== exp) {
    errors.push(w.word + ' → level เป็น "' + w.level + '" แต่ควรเป็น "' + exp + '" (' + sylCount(w) + ' พยางค์, ' + (isHardReading(w) ? 'อ่านยาก' : 'อ่านง่าย') + ')');
  }

  if (!w.syls || !w.syls.length) {
    errors.push(w.word + ' → ไม่มี syls เลย (schema ต้องห่อ syls ทุกคำหลังรวม 2026-07-15)');
    return;
  }

  // เช็ค 1: syls[].th ต่อกัน = word จริง — เช็คทุกคำ (พยางค์เดียวก็เช็คด้วย)
  const missingTh = w.syls.some(function (s) { return !s.th; });
  if (missingTh) {
    errors.push(w.word + ' → มีพยางค์ที่ไม่มี th');
    return;
  }
  const concat = w.syls.map(function (s) { return s.th; }).join('');
  if (concat !== w.word) {
    errors.push(w.word + ' → syls.th ต่อกันได้ "' + concat + '" ไม่ตรงกับคำจริง (พิมพ์เกมพิมพ์จะผิด)');
  }

  // เช็ค 2: คำ 2 พยางค์ขึ้นไปต้องมี readingTH (พยางค์เดียวไม่บังคับ เพราะคำอ่าน = ตัวสะกดอยู่แล้วปกติ)
  if (sylCount(w) > 1 && w.readingTH === undefined) {
    errors.push(w.word + ' → มีหลายพยางค์แต่ไม่มี readingTH (กล่องวรรณยุกต์จะโชว์คำอ่านไม่ได้)');
  }
});

// ════════════════════════════════════════════════════════════
// เช็คไฟล์ประโยค adv-sentences.js (ADV_SENTENCES) — เพิ่ม 2026-07-16
// โครงสร้างต่างจากไฟล์คำ: ประโยค → words[] → syls[] เลยต้องไล่เข้าไปอีกชั้น
// ════════════════════════════════════════════════════════════
require('./adv-sentences.js');
const S = global.ADV_SENTENCES;

S.forEach(function (sent) {
  sent.words.forEach(function (w) {
    if (!w.syls || !w.syls.length) {
      errors.push('[ประโยค] "' + sent.th + '" → คำ "' + w.th + '" ไม่มี syls เลย');
      return;
    }
    const missingTh = w.syls.some(function (s) { return !s.th; });
    if (missingTh) {
      errors.push('[ประโยค] "' + sent.th + '" → คำ "' + w.th + '" มีพยางค์ที่ไม่มี th');
      return;
    }
    const concat = w.syls.map(function (s) { return s.th; }).join('');
    if (concat !== w.th) {
      errors.push('[ประโยค] "' + sent.th + '" → คำ "' + w.th + '" syls.th ต่อกันได้ "' + concat + '" ไม่ตรงกับตัวสะกดจริง (' + w.th + ')');
    }
  });
});

if (errors.length) {
  console.log('❌ พบปัญหา ' + errors.length + ' จุด:\n');
  errors.forEach(function (e) { console.log('- ' + e); });
  process.exitCode = 1;
} else {
  console.log('✅ ผ่านหมด — คำ ' + W.length + ' คำ + ประโยค ' + S.length + ' ประโยค ตรวจแล้วโอเค');
}
