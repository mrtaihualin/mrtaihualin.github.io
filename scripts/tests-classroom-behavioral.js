#!/usr/bin/env node
'use strict';
/**
 * scripts/tests-classroom-behavioral.js — Lin P5-B (2026-08-11)
 * ────────────────────────────────────────────────────────────
 * ตรวจ "พฤติกรรมห้องเรียน" แบบ static (อ่านโค้ด ไม่ยิงเน็ตจริง ไม่แตะ Calendar/LINE/Supabase)
 * คู่กับ scripts/tests-game-behavioral.js (ฝั่งเกม) และ scripts/tests-marketing-behavioral.js
 *
 * 🎯 หลักการเลือกสิ่งที่ตรวจ: ตรวจเฉพาะ "กฎที่เคยพังมาแล้วจริง" ตามที่บันทึกใน CLAUDE.md
 *    ไม่ได้เดาว่าอะไรน่าจะสำคัญ — ทุกเช็คด้านล่างอ้างอิงบทเรียนจริงที่มีวันที่กำกับ
 *    เพราะกฎพวกนี้เคยถูกละเมิดซ้ำ (บางข้อซ้ำ 2-3 รอบ) เวลาแก้โค้ดแล้วลืมแก้ให้ครบทุกประตู
 *
 * ⚠️ ข้อจำกัด (บอกตรงๆ): นี่คือ "ตัวกันลืม" ระดับอ่านโค้ด ไม่ใช่การพิสูจน์ว่าระบบจริงทำงานถูก
 *    การยืนยันจริงยังต้องกดมือตาม checklist ใน _dev/ (ตัวทดสอบ HTML) + ทดสอบกับ Calendar/LINE ของจริง
 *    เช็คนี้จับได้แค่ "โค้ดถูกแก้จนกฎหาย" ซึ่งเป็นรูปแบบความผิดพลาดที่เกิดจริงบ่อยที่สุดในระบบนี้
 * ────────────────────────────────────────────────────────────
 */

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const failures = [];

function read(relPath) {
  const full = path.join(root, relPath);
  if (!fs.existsSync(full)) return null;
  return fs.readFileSync(full, 'utf8');
}
function ok(label) { console.log(`  ✓ ${label}`); }
function fail(label, detail) { failures.push(`${label}${detail ? ': ' + detail : ''}`); }

/**
 * ตัดคอมเมนต์ออกก่อนค้นหา — จำเป็นมาก เพราะไฟล์ห้องเรียนเก็บ "ประวัติของที่ลบทิ้งแล้ว"
 * ไว้ในคอมเมนต์เยอะมาก (ตั้งใจ เพื่อกันคนเผลอสร้างกลับมา) ถ้าไม่ตัดจะฟ้องผิดทุกครั้ง
 * วิธี: ตัด /* *\/ ทั้งบล็อก แล้วตัดท้ายบรรทัดที่ขึ้นต้นด้วย // (เว้น "://" ของ URL)
 */
function stripComments(src) {
  let s = src.replace(/\/\*[\s\S]*?\*\//g, '');
  s = s.split('\n').map((line) => {
    const t = line.trim();
    if (t.startsWith('//') || t.startsWith('*')) return '';
    const i = line.indexOf('//');
    if (i > 0 && line[i - 1] !== ':') return line.slice(0, i);
    return line;
  }).join('\n');
  return s;
}

const FILES = {
  teacherAdmin: 'js/classroom/teacher-request-admin.js',
  addClass: 'js/classroom/add-class-scheduling.js',
  studentReq: 'js/classroom/student-requests.js',
  views: 'js/classroom/classroom-views.js',
  teacherOps: 'js/classroom/teacher-operations.js',
  webhook: 'supabase/functions/line-webhook/index.ts',
};

const src = {};
const code = {};
for (const [k, rel] of Object.entries(FILES)) {
  const raw = read(rel);
  if (raw === null) { fail(`หาไฟล์ไม่เจอ ${rel}`, 'โครงสร้างไฟล์ห้องเรียนเปลี่ยน — ต้องแก้เช็คนี้ให้ตรงก่อน'); continue; }
  src[k] = raw;
  code[k] = stripComments(raw);
}

// ════════════════════════════════════════════════════════════
// A) กฎล็อก — "เพิ่มคาบ" กับ "เลื่อนคาบ" ห้ามแย่งล็อก · "ยกเลิกคาบ" แย่งได้
//    (CLAUDE.md 2026-07-31 + 2026-08-02 — บทเรียนซ้ำ 2 รอบ: แก้ฝั่ง LINE แล้วลืมฝั่งเว็บ
//     ทำให้รูไม่ได้หาย แค่ย้ายที่ · เพิ่มคาบซ้ำ = ได้คาบซ้อนกันจริง 2 คาบในปฏิทิน)
// ════════════════════════════════════════════════════════════
console.log('A) กฎล็อกคำขอ (เพิ่ม/เลื่อน ห้ามแย่ง · ยกเลิก แย่งได้)');

function assertNoSteal(fileKey, fnName) {
  const c = code[fileKey];
  if (!c) return;
  const m = c.match(new RegExp('function\\s+' + fnName + '\\s*\\([^)]*\\)\\s*\\{([\\s\\S]{0,900}?)\\n\\}'));
  if (!m) { fail(`${fnName}() หายไปจาก ${FILES[fileKey]}`, 'ล็อกแบบ "ห้ามแย่ง" ต้องมีฟังก์ชันนี้เสมอ'); return; }
  const body = m[1];
  if (!/\.is\(\s*['"]processing_started_at['"]\s*,\s*null\s*\)/.test(body)) {
    fail(`${fnName}() ไม่มีด่าน .is('processing_started_at', null)`, 'กลายเป็นแย่งล็อกได้ = เสี่ยงคาบซ้อน/ย้ายซ้ำ');
    return;
  }
  if (/staleLockCutoff|stale_lock|STALE_LOCK/i.test(body)) {
    fail(`${fnName}() มีการปลดล็อกค้างอัตโนมัติ`, 'ผิดกฎ: เพิ่ม/เลื่อนคาบต้องให้ครูกด 🔓 解鎖這筆 เองเท่านั้น');
    return;
  }
  ok(`${fnName}() ห้ามแย่งล็อก (มี .is(processing_started_at,null) และไม่ปลดล็อกเอง)`);
}

assertNoSteal('teacherAdmin', 'claimAddClassRequest');
assertNoSteal('teacherAdmin', 'claimRescheduleRequest');

if (code.teacherAdmin || code.addClass || code.studentReq) {
  const anyCancelClaim = ['teacherAdmin', 'addClass', 'studentReq']
    .some((k) => code[k] && code[k].includes('claimRequestForProcessing'));
  if (anyCancelClaim) ok('claimRequestForProcessing() (ยกเลิกคาบ — แย่งล็อกค้างได้ตามกฎ) ยังอยู่');
  else fail('claimRequestForProcessing() หายไปจากฝั่งเว็บ', 'เส้นทางยกเลิกคาบจะไม่มีตัวจับล็อก');
}

if (code.webhook) {
  const wh = code.webhook;
  const hasNoStealLine = /\.is\(\s*['"]processing_started_at['"]\s*,\s*null\s*\)/.test(wh);
  if (hasNoStealLine) ok('ฝั่ง LINE มีด่าน .is(processing_started_at,null) (ประตูที่ 2 ของกฎเดียวกัน)');
  else fail('ฝั่ง LINE ไม่มีด่าน .is(processing_started_at,null)', 'แก้ล็อกไม่ครบทุกประตู — บทเรียนซ้ำรอบที่ 3');
}

// ════════════════════════════════════════════════════════════
// B) แตะ Google Calendar ต้อง "สำรองให้สำเร็จก่อน" เสมอ
//    (CLAUDE.md 2026-08-01 ข้อ 1 — เดิมลบก่อนแล้วค่อยสำรองแบบพังก็ช่างมัน
//     = สำรองพัง + คาบหาย = กู้คืนไม่ได้ตลอดกาล แต่ตอบครูว่า "✅ 已刪除")
// ════════════════════════════════════════════════════════════
console.log('B) สำรองข้อมูลก่อนแตะ Calendar');

if (code.webhook) {
  const wh = code.webhook;
  if (/function\s+deleteCalendarEventById\s*\([^)]*beforeDeleteHook/.test(wh)) {
    ok('deleteCalendarEventById() ยังรับ beforeDeleteHook (สำรองก่อนลบ)');
  } else {
    fail('deleteCalendarEventById() ไม่รับ beforeDeleteHook แล้ว', 'เส้นทางลบคาบทาง LINE จะกลับไปลบก่อนสำรอง');
  }
  // ต้อง "fail closed" จริง: มีจุดที่ hook คืน !ok แล้วหยุด ไม่แตะ Calendar
  if (/backup_failed/.test(wh)) ok("มีเส้นทางตอบ 'backup_failed' (สำรองพัง = ไม่แตะ Calendar)");
  else fail("ไม่พบเส้นทาง 'backup_failed'", 'สำรองพังแล้วอาจลบต่อเงียบๆ');

  if (/insertMoveBackupBeforeMove/.test(wh)) ok('insertMoveBackupBeforeMove() (สำรองก่อนย้ายคาบ) ยังอยู่');
  else fail('insertMoveBackupBeforeMove() หายไป', 'ย้ายคาบโดยไม่สำรองก่อน');
}

// ════════════════════════════════════════════════════════════
// C) ตรวจคาบชนของ "ย้ายคาบ" ห้ามใช้ freeBusy — ต้องตัดตัวเองด้วยเลข event
//    (CLAUDE.md 2026-08-02 ข้อ 2 — freeBusy บอกไม่ได้ว่าช่วงไม่ว่างเป็นของ event ไหน
//     → นัดอื่นที่ซ้อนในกรอบเวลาเดิมถูกกลืน = ระบบบอก "ไม่ชน" ทั้งที่ชนจริง)
//    ⚠️ checkFreebusyConflictService ต้องยังอยู่ เพราะระบบ "เพิ่มคาบ" ใช้และถูกต้องดีอยู่แล้ว
// ════════════════════════════════════════════════════════════
console.log('C) ตรวจคาบชนตอนย้ายคาบ (ห้ามใช้ freeBusy)');

if (code.webhook) {
  const wh = code.webhook;
  for (const fn of ['listConflictingEventsService', 'filterCandidateEvents', 'pickOverlappingEvents']) {
    if (wh.includes(fn)) ok(`${fn}() ยังอยู่`);
    else fail(`${fn}() หายไป`, 'เส้นทางย้ายคาบอาจถอยกลับไปใช้ freeBusy ที่ตัดตัวเองไม่ได้');
  }
  if (wh.includes('checkFreebusyConflictService')) {
    ok('checkFreebusyConflictService() ยังอยู่ (ของระบบเพิ่มคาบ — ห้ามลบ)');
  } else {
    fail('checkFreebusyConflictService() หายไป', 'ระบบเพิ่มคาบจะไม่มีด่านตรวจชน');
  }
}

// ════════════════════════════════════════════════════════════
// D) เว็บต้องส่ง p_original_time เสมอ ไม่งั้นฐานข้อมูลตีกลับทั้งหมด
//    (CLAUDE.md ระบบยกเลิกคาบ — เคยพลาดจนนักเรียนยกเลิกคาบไม่ได้เลยทั้งระบบ)
// ════════════════════════════════════════════════════════════
console.log('D) เว็บส่ง p_original_time ตอนยื่นคำขอ');

if (code.studentReq) {
  if (code.studentReq.includes('p_original_time')) ok('student-requests.js ยังส่ง p_original_time');
  else fail('student-requests.js ไม่ส่ง p_original_time แล้ว', 'ด่าน 24 ชม.ในฐานข้อมูลจะตีกลับคำขอทั้งหมด');
}

// ════════════════════════════════════════════════════════════
// E) ย้ายคาบเสร็จ ต้องอัปเดต classroom_schedule ทันที (ทั้งเว็บและ LINE)
//    (CLAUDE.md 2026-08-02 ข้อ 13 — เดิมมีแต่ฝั่ง LINE ทั้งที่กฎเขียนว่าต้องมีทั้ง 2 ฝั่ง
//     ผลคือ class-reminder-cron อ่านเวลาเก่า = เตือนนักเรียนผิดเวลา)
// ════════════════════════════════════════════════════════════
console.log('E) ย้ายคาบแล้วซิงค์ตารางเรียนทันที');

if (code.teacherAdmin) {
  const n = (code.teacherAdmin.match(/syncScheduleRowAfterMoveWeb/g) || []).length;
  if (n >= 2) ok(`syncScheduleRowAfterMoveWeb() ถูกใช้ ${n} จุด (นิยาม + เรียกจากเส้นทางย้ายคาบ)`);
  else fail('syncScheduleRowAfterMoveWeb() หายไปหรือไม่ถูกเรียก', 'ฝั่งเว็บย้ายคาบแล้วตารางเรียนไม่ตรง');
}
if (code.webhook) {
  if (code.webhook.includes('syncScheduleRowAfterMove')) ok('ฝั่ง LINE ยังมี syncScheduleRowAfterMove()');
  else fail('ฝั่ง LINE ไม่มี syncScheduleRowAfterMove()', 'ย้ายคาบทาง LINE แล้วตารางเรียนไม่ตรง');
}

// ════════════════════════════════════════════════════════════
// F) ระบบเก่า "ส่งไปรอนักเรียนกดยอมรับก่อนเพิ่มคาบ" ห้ามกลับมาเป็นโค้ดจริง
//    (CLAUDE.md 2026-07-30/31 — Lin ตัดสินใจลบถาวร "ไม่ว่าจะดูสมเหตุสมผลแค่ไหน")
//    หมายเหตุ: ชื่อพวกนี้ยังอยู่ในคอมเมนต์ได้ (ตั้งใจ กันคนสร้างกลับมา) จึงตัดคอมเมนต์ก่อนตรวจ
// ════════════════════════════════════════════════════════════
console.log('F) ระบบ "รอนักเรียนกดยอมรับก่อนเพิ่มคาบ" ต้องไม่กลับมา');

const BANNED = [
  'proposeAddClassRows', 'proposeAddClassDay', 'submitAddClassDayCombined',
  'confirmTeacherAddClass', 'teacherWithdrawOwnAddRequest', 'loadTeacherAddAckBanner',
  'ackTeacherAdd', 'declineTeacherAdd', 'teacherAddAckBanner',
];
const webKeys = ['teacherAdmin', 'addClass', 'studentReq', 'views', 'teacherOps'];
let revived = [];
for (const sym of BANNED) {
  for (const k of webKeys) {
    if (code[k] && new RegExp('\\b' + sym + '\\b').test(code[k])) revived.push(`${sym} (${FILES[k]})`);
  }
}
if (revived.length === 0) ok(`ไม่มีสักตัวใน ${BANNED.length} ชื่อที่ลบถาวรกลับมาเป็นโค้ดจริง`);
else fail('ระบบเก่าที่ลบถาวรกลับมาแล้ว', revived.join(', '));

// ════════════════════════════════════════════════════════════
// G) ปุ่ม ↩️ 復原 ต้องรีเซ็ตธงเตือน 24 ชม. ด้วย
//    (CLAUDE.md 2026-08-02 ข้อ 14 + ข้อ 5 — คาบที่กู้กลับมาไม่มีวันถูกเตือนถ้าไม่รีเซ็ตธง)
// ════════════════════════════════════════════════════════════
console.log('G) คืนค่าคาบแล้วรีเซ็ตธงเตือน 24 ชม.');

if (code.teacherAdmin) {
  const hasRevert = code.teacherAdmin.includes('revertCalendarBackup');
  const resets = (code.teacherAdmin.match(/line_reminder24h_sent\s*:\s*false/g) || []).length;
  if (!hasRevert) fail('revertCalendarBackup() หายไป', 'ปุ่ม ↩️ 復原 ใช้ไม่ได้');
  else if (resets >= 2) ok(`revertCalendarBackup อยู่ครบ + รีเซ็ต line_reminder24h_sent ${resets} จุด`);
  else fail('ไม่รีเซ็ต line_reminder24h_sent ให้ครบ', `เจอ ${resets} จุด (ต้องมีทั้งตอนย้ายและตอนคืนค่า)`);
}

// ════════════════════════════════════════════════════════════
// H) ปุ่มเลือกเวลาใน LINE ต้องพก &d=&t= ไปด้วยเสมอ
//    (CLAUDE.md 2026-08-02 ข้อ 8 — ปุ่มค้างในประวัติแชทตลอดกาล ถ้าเวลาถูกแก้ทีหลัง
//     กดปุ่มเก่า = ย้ายผิดเวลาเงียบๆ · ต้องเทียบกับฐานข้อมูลก่อนย้าย)
// ════════════════════════════════════════════════════════════
console.log('H) ปุ่มยืนยันเวลาใน LINE พกเวลาบนหน้าปุ่มไปด้วย');

if (code.webhook) {
  const wh = code.webhook;
  let bothOk = true;
  for (const act of ['confirm_reschedule_move', 'confirm_reschedule_pick']) {
    if (!wh.includes(act)) { fail(`ไม่พบตัวรับปุ่ม ${act}`, 'เส้นทางยืนยันเวลาใน LINE หายไป'); bothOk = false; }
  }
  if (bothOk) {
    if (/[?&]d=/.test(wh) && /[?&]t=/.test(wh)) ok('ทั้ง confirm_reschedule_move และ _pick ยังมีพารามิเตอร์ d=/t=');
    else fail('ไม่พบพารามิเตอร์ d=/t= ในปุ่มยืนยันเวลา', 'ปุ่มเก่าค้างในแชทอาจย้ายผิดเวลา');
  }
}

// ════════════════════════════════════════════════════════════
console.log('');
if (failures.length) {
  console.log(`❌ classroom behavioral: ไม่ผ่าน ${failures.length} รายการ`);
  failures.forEach((f) => console.log('  - ' + f));
  process.exit(1);
}
console.log('✅ classroom behavioral: ผ่านครบทุกข้อ');
