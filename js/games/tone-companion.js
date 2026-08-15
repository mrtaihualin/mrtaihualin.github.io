// ════════════════════════════════════════════════════════════
// tone-companion.js — ส่วนที่ "เกมเสียง" (tone-finder.html) ใช้เฉพาะ ไม่มีในอีก 4 เกม
// FILE MAP: [01] admin unlock → [02] auth binding
// Lin 2026-07-16: แยกออกมาจาก supabase-auth.js ตอนรวมระบบล็อกอินของเกมเสียงเข้ากับ reading-auth.js
//   (เดิมเกมเสียงมีระบบล็อกอิน/ปุ่ม/modal เป็นของตัวเอง แยกจากอีก 4 เกม — ตอนนี้ใช้ไฟล์เดียวกันหมดแล้ว
//    ปุ่ม/modal ล็อกอินทั้งหมดอยู่ใน reading-auth.js ไฟล์นี้ไม่มีปุ่ม/modal ล็อกอินเลย)
// ต้องโหลดหลัง: supabase-js CDN, supabase-config.js, auth-widget.js (SITE_AUTH), reading-auth.js (READING_AUTH)
//
// S29 2026-08-15: ยกเลิกการดัก GA4 เพื่อเขียน tone_sessions โดยตรงแล้ว
// คะแนนเกมเสียงส่งหลักฐานผ่าน READING_AUTH.saveScore() → score-submit เหมือน Core 5 เกมอื่น
// ไฟล์นี้เหลือเฉพาะปลดล็อกเหรียญรางวัลอัตโนมัติสำหรับบัญชี Lin (admin)
//
// ⚠️ สิ่งที่ "ไม่ได้" ย้ายมา (ของเดิมมีแต่ตัดออกตอนรวมระบบ — Lin รับทราบแล้ว):
//   - "lead gate" เก็บอีเมลแบบไม่ยืนยันแล้วเล่นต่อได้ (submitLeadEmail/leads table) — requireLogin ตายอยู่แล้วมาตลอด ไม่เคยบังคับจริง
//     ผลคือ: คนที่เคยแค่กรอกอีเมล (ไม่ได้ล็อกอินจริง) จะไม่มีระบบจำคำ/ทบทวน (SRS) อีกต่อไป ต้องล็อกอินจริงเหมือนอีก 4 เกม (Lin ยืนยันแล้ว 2026-07-16)
//   - ป๊อปอัพสำรวจแบบ modal เต็มจอ (เด้งเวลาปิดหน้าล็อกอินของเกมเสียงเองโดยยังไม่ล็อกอิน) — ผูกกับปุ่มปิด gate เดิมของ supabase-auth.js โดยตรง
//     ตอนนี้ปุ่มล็อกอินใช้ของ reading-auth.js ร่วมกับเกมอื่นแล้ว ไม่ได้ต่อ hook นี้ไว้ (Lin บอกยังไม่ต้องทำ 2026-07-16)
//   - (เดิมข้อ 3) ป๊อปอัพสำรวจก่อนออกจากหน้าแบบแถบล่างของไฟล์นี้เอง — ลบออกแล้ว 2026-07-18 เพราะซ้ำกับระบบกลาง
//     ใน shared.js (ใช้ร่วมทุกหน้าเกม+หน้าราคา) ของเดิมจำ "เคยโชว์แล้ว" แค่ตอนเปิดหน้าอยู่ ไม่ถาวรเหมือน shared.js
//     ทำให้ก่อนหน้านี้เจอบั๊กขึ้นซ้อนกัน 2 แถบ/โชว์ซ้ำทุกครั้งที่รีเฟรชหน้า — Lin ยืนยันให้เหลือระบบเดียว (shared.js)
// ════════════════════════════════════════════════════════════
(function () {
  'use strict';

  var cfg = window.SUPABASE_CONFIG || {};
  var ready = cfg.url && cfg.anonKey &&
              cfg.url.indexOf('YOUR_') === -1 &&
              cfg.anonKey.indexOf('YOUR_') === -1 &&
              window.supabase && window.supabase.createClient;
  if (!ready) return; // Supabase ยังไม่ตั้งค่า/โหลดไม่ได้ — เกมเล่นได้ปกติ แค่ไม่มีฟีเจอร์พวกนี้

  var ADMIN_EMAIL = 'mr.taihualin@gmail.com';

  // ════════ admin: ปลดล็อกทุก badge สำหรับ mr.taihualin@gmail.com ════════
  function adminUnlockAll(email) {
    if (email !== ADMIN_EMAIL) return;
    try {
      var defs = window.TF_BADGES_DEF;
      var load = window.tfLoadBadges;
      var save = window.tfSaveBadges;
      if (!defs || !load || !save) return;
      var today = new Date().toISOString().slice(0, 10);
      var data = load();
      var added = 0;
      defs.forEach(function (b) {
        if (!data.unlocked[b.id]) { data.unlocked[b.id] = today; added++; }
      });
      if (added > 0) {
        save(data);
        console.info('[admin] ปลดล็อก ' + added + ' badge(s) สำหรับ ' + email);
        if (typeof render === 'function') setTimeout(render, 200);
      }
    } catch (e) {}
  }

  // ── ผูกกับ SITE_AUTH: ล็อกอิน/สลับบัญชี → ปลดล็อก admin เท่านั้น
  // ห้ามบันทึกรอบ Guest ย้อนหลังหลัง Login ตาม Phase 1 boundary
  try {
    if (window.SITE_AUTH && SITE_AUTH.onChange) {
      SITE_AUTH.onChange(function (u) {
        if (!u) return;
        adminUnlockAll(u.email || '');
      });
    }
  } catch (e) {}

  // 2026-07-18: ลบ exit-survey แถบล่างของไฟล์นี้ออกแล้ว (ซ้ำกับระบบกลางใน shared.js
  // ที่ใช้ร่วมทุกหน้าเกม + หน้าราคา ทำให้ก่อนหน้านี้เจอบั๊กขึ้นซ้อนกัน 2 แถบ/โชว์ซ้ำทุกครั้งที่รีเฟรช
  // เพราะไฟล์นี้จำ "เคยโชว์แล้ว" แค่ตอนเปิดหน้าอยู่ ไม่ได้บันทึกถาวรเหมือน shared.js — Lin ยืนยันให้เหลือระบบเดียว)
})();
