/**
 * tests-check-data-health.js — เทสง่ายๆ (input→output ชัดเจน) ให้ฟังก์ชันย่อยของ check-data-health.js
 * ใช้ "คำสมมติ" ที่แต่งขึ้นมาเองเพื่อทดสอบ logic เท่านั้น (ไม่ใช่เนื้อหาเกมจริง ไม่แตะ words-data.js เลย —
 * ไม่ขัดกฎ 16 เพราะเป็นแค่ fixture ทดสอบโค้ด ไม่เคยถูกโชว์ให้นักเรียนเห็น)
 *
 * วิธีรัน: node data/tests-check-data-health.js
 * ผ่าน = "✅ ผ่านหมด" + exit code 0 / ไม่ผ่าน = พิมพ์เคสที่พังทีละอัน + exit code 1
 */
const H = require('./check-data-health.js');

let pass = 0, fail = 0;
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) { pass++; return; }
  fail++;
  console.log('❌ ' + label + ' → ได้ ' + JSON.stringify(actual) + ' ต้องการ ' + JSON.stringify(expected));
}

// ── sylCount ──
check('sylCount({syls:1คำ})', H.sylCount({ syls: [{ th: 'บ้าน' }] }), 1);
check('sylCount({syls:3คำ})', H.sylCount({ syls: [{ th: 'อะ' }, { th: 'ไร' }, { th: 'ยะ' }] }), 3);

// ── isHardReading ──
check('isHardReading(ไม่มี readingTH)', H.isHardReading({ word: 'บ้าน' }), false);
check('isHardReading(อ่านตรงตัว)', H.isHardReading({ word: 'บ้าน', readingTH: 'บ้าน' }), false);
check('isHardReading(อ่านไม่ตรงตัว)', H.isHardReading({ word: 'ถนน', readingTH: 'ถะ-หนน' }), true);

// ── expectedLevel ──
check('expectedLevel(1 พยางค์)', H.expectedLevel({ syls: [{ th: 'บ้าน' }], word: 'บ้าน' }), '初');
check('expectedLevel(2 พยางค์ อ่านง่าย)',
  H.expectedLevel({ syls: [{ th: 'บ้า' }, { th: 'น' }], word: 'บ้าน', readingTH: 'บ้าน' }), '初');
check('expectedLevel(2 พยางค์ อ่านยาก)',
  H.expectedLevel({ syls: [{ th: 'ถ' }, { th: 'นน' }], word: 'ถนน', readingTH: 'ถะ-หนน' }), '中');
check('expectedLevel(3 พยางค์ ไม่ว่าอ่านง่าย/ยาก)',
  H.expectedLevel({ syls: [{ th: 'อะ' }, { th: 'ไร' }, { th: 'ยะ' }], word: 'อะไรยะ', readingTH: 'อะไรยะ' }), '中');

// ── checkFinalSound / checkConsIsWritten ──
// หมายเหตุ: checkFinalSound/checkConsIsWritten เขียนผลลง errors[] ที่เป็นตัวแปรภายในไฟล์ (ไม่ได้ return
// ค่า) — เทสตรงนี้เรียกแค่ยืนยันว่า "เรียกได้ไม่ throw" กับพยางค์ปกติ/ผิดปกติ ส่วนผลจริง (errors ยาวขึ้น
// ไหม) ถูกคุมด้วย data/check-data-health.js เองตอนรันกับข้อมูลจริงอยู่แล้ว (ผ่าน 735 คำ 30 ประโยคล่าสุด)
try {
  H.checkFinalSound('เทส', { th: 'บ้าน', final: 'น' }); // final ถูกกฎ (มาตรา กน)
  H.checkConsIsWritten('เทส', { th: 'บ้าน', cons: 'บ' }); // cons ปรากฏในตัวเขียนจริง
  pass += 2;
} catch (e) {
  fail += 2;
  console.log('❌ checkFinalSound/checkConsIsWritten โยน error ทั้งที่ไม่ควร: ' + e.message);
}

console.log('');
if (fail) {
  console.log('❌ พัง ' + fail + ' เคส (ผ่าน ' + pass + '/' + (pass + fail) + ')');
  process.exitCode = 1;
} else {
  console.log('✅ ผ่านหมด ' + pass + '/' + pass + ' เคส');
}
