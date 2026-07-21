// ════════════════════════════════════════════════════════════
// tone-companion.js — ส่วนที่ "เกมเสียง" (tone-finder.html) ใช้เฉพาะ ไม่มีในอีก 4 เกม
// Lin 2026-07-16: แยกออกมาจาก supabase-auth.js ตอนรวมระบบล็อกอินของเกมเสียงเข้ากับ reading-auth.js
//   (เดิมเกมเสียงมีระบบล็อกอิน/ปุ่ม/modal เป็นของตัวเอง แยกจากอีก 4 เกม — ตอนนี้ใช้ไฟล์เดียวกันหมดแล้ว
//    ปุ่ม/modal ล็อกอินทั้งหมดอยู่ใน reading-auth.js ไฟล์นี้ไม่มีปุ่ม/modal ล็อกอินเลย)
// ต้องโหลดหลัง: supabase-js CDN, supabase-config.js, auth-widget.js (SITE_AUTH), reading-auth.js (READING_AUTH)
//
// สิ่งที่ย้ายมา (ของเดิมเฉพาะเกมเสียง ไม่มีในอีก 4 เกม):
//   1) เซฟคะแนนรอบเล่นลงตาราง tone_sessions (คนละตารางกับ reading_sessions ของอีก 4 เกม — ยังไม่รวม ต้องคุยแยกถ้าจะรวม)
//   2) ปลดล็อกเหรียญรางวัลอัตโนมัติสำหรับบัญชี Lin (admin)
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

  var sb = window.getSupabaseClient ? window.getSupabaseClient() : window.supabase.createClient(cfg.url, cfg.anonKey);
  var ADMIN_EMAIL = 'mr.taihualin@gmail.com';

  // ════════ 1) เซฟคะแนนรอบเล่นลง tone_sessions (ดักจาก GA4 events ที่เกมยิงอยู่แล้ว) ════════
  var sessionMode = null;
  var wrongBuffer = [];
  var lastSession = null;   // snapshot รอบล่าสุด เผื่อ login ทีหลัง → บันทึกย้อนหลัง

  var origGtag = window.gtag || function () {};
  window.gtag = function () {
    try { origGtag.apply(this, arguments); } catch (e) {}
    try {
      if (arguments[0] === 'event') handleEvent(arguments[1], arguments[2] || {});
    } catch (e) { /* อย่าให้พังการเล่นเกม */ }
  };

  function handleEvent(name, params) {
    if (name === 'tone_finder_start') {
      sessionMode = params.mode || null;
      wrongBuffer = [];
    } else if (name === 'tone_answer_wrong') {
      wrongBuffer.push({ word: params.word, selected: params.selected, correct: params.correct });
    } else if (name === 'tone_finder_complete') {
      lastSession = {
        mode: sessionMode,
        score: typeof params.score === 'number' ? params.score : null,
        total: typeof params.total === 'number' ? params.total : null,
        wrong_words: wrongBuffer.slice()
      };
      saveSession(lastSession);
    }
  }

  function saveSession(s) {
    s = s || lastSession;
    if (!s) return;
    var u = window.READING_AUTH && READING_AUTH.user;
    if (!u) return; // ยังไม่ล็อกอิน → คะแนนค้างใน lastSession รอ login มาบันทึกย้อนหลัง (GA4 ยังนับภาพรวมให้)
    if ((u.email || '') === ADMIN_EMAIL) { lastSession = null; return; } // admin: ไม่นับคะแนนใน ranking
    var row = {
      user_id: u.id,
      mode: s.mode,
      score: typeof s.score === 'number' ? s.score : null,
      total: typeof s.total === 'number' ? s.total : null,
      wrong_words: s.wrong_words || []
    };
    sb.from('tone_sessions').insert(row).then(function (res) {
      if (res.error) {
        console.warn('[tone-finder] บันทึกไม่สำเร็จ:', res.error.message);
        showScoreToast('⚠️ บันทึกคะแนนไม่สำเร็จ: ' + res.error.message, false);
        try { if (window.gtag) gtag('event', 'score_save_fail', { reason: res.error.message, mode: s.mode || '' }); } catch (e) {}
      } else {
        console.info('[tone-finder] บันทึกผลแล้ว score=' + s.score);
        if (lastSession === s) lastSession = null;   // บันทึกสำเร็จ → เคลียร์ค้าง กันบันทึกซ้ำ
        showScoreToast('✅ บันทึกคะแนน ' + (s.score || 0) + ' 分 สำเร็จ', true);
        try { if (window.gtag) gtag('event', 'score_saved', { score: s.score || 0, mode: s.mode || '' }); } catch (e) {}
      }
    });
  }

  function showScoreToast(msg, ok) {
    var old = document.getElementById('tf-score-toast');
    if (old) old.remove();
    var d = document.createElement('div');
    d.id = 'tf-score-toast';
    d.style.cssText = 'position:fixed;bottom:90px;left:50%;transform:translateX(-50%);z-index:99999;' +
      'background:' + (ok ? '#2d7a2d' : '#8b2020') + ';color:#fff;border-radius:20px;' +
      'padding:8px 18px;font-size:13px;font-family:"Noto Sans TC",sans-serif;' +
      'box-shadow:0 4px 16px rgba(0,0,0,0.25);white-space:nowrap;pointer-events:none;';
    d.textContent = msg;
    document.body.appendChild(d);
    setTimeout(function () { if (d.parentNode) d.remove(); }, 3500);
  }

  // ════════ 2) admin: ปลดล็อกทุก badge สำหรับ mr.taihualin@gmail.com ════════
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

  // ── ผูกกับ SITE_AUTH: ล็อกอิน/สลับบัญชี → ปลดล็อก admin + บันทึกคะแนนค้าง (ถ้ามี) ──
  try {
    if (window.SITE_AUTH && SITE_AUTH.onChange) {
      SITE_AUTH.onChange(function (u) {
        if (!u) return;
        adminUnlockAll(u.email || '');
        if (lastSession) saveSession(lastSession);
      });
    }
  } catch (e) {}

  // 2026-07-18: ลบ exit-survey แถบล่างของไฟล์นี้ออกแล้ว (ซ้ำกับระบบกลางใน shared.js
  // ที่ใช้ร่วมทุกหน้าเกม + หน้าราคา ทำให้ก่อนหน้านี้เจอบั๊กขึ้นซ้อนกัน 2 แถบ/โชว์ซ้ำทุกครั้งที่รีเฟรช
  // เพราะไฟล์นี้จำ "เคยโชว์แล้ว" แค่ตอนเปิดหน้าอยู่ ไม่ได้บันทึกถาวรเหมือน shared.js — Lin ยืนยันให้เหลือระบบเดียว)
})();
