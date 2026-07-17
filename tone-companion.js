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
//   3) ป๊อปอัพสำรวจก่อนออกจากหน้าแบบแถบล่าง (mouseout ขอบบน / idle 45วิ บนมือถือ)
//
// ⚠️ สิ่งที่ "ไม่ได้" ย้ายมา (ของเดิมมีแต่ตัดออกตอนรวมระบบ — Lin รับทราบแล้ว):
//   - "lead gate" เก็บอีเมลแบบไม่ยืนยันแล้วเล่นต่อได้ (submitLeadEmail/leads table) — requireLogin ตายอยู่แล้วมาตลอด ไม่เคยบังคับจริง
//     ผลคือ: คนที่เคยแค่กรอกอีเมล (ไม่ได้ล็อกอินจริง) จะไม่มีระบบจำคำ/ทบทวน (SRS) อีกต่อไป ต้องล็อกอินจริงเหมือนอีก 4 เกม (Lin ยืนยันแล้ว 2026-07-16)
//   - ป๊อปอัพสำรวจแบบ modal เต็มจอ (เด้งเวลาปิดหน้าล็อกอินของเกมเสียงเองโดยยังไม่ล็อกอิน) — ผูกกับปุ่มปิด gate เดิมของ supabase-auth.js โดยตรง
//     ตอนนี้ปุ่มล็อกอินใช้ของ reading-auth.js ร่วมกับเกมอื่นแล้ว ไม่ได้ต่อ hook นี้ไว้ (Lin บอกยังไม่ต้องทำ 2026-07-16)
//     เหลือแค่แถบล่าง (ข้อ 3 ด้านบน) ซึ่งเป็นตัวหลักที่คนเจอจริงอยู่แล้ว
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

  // ════════ 3) น้องมีนา exit-survey แถบล่าง — mouseout ขอบบน (desktop) / idle 45วิ (มือถือ) LIN 2026-07-05 ════════
  var exitSurveyShown = false;   // โชว์ครั้งเดียวต่อ session (ไม่กวน)
  var PUBLIC_W3F_KEY = 'b3bfdb97-19dd-4910-bd15-89720be846c2';   // public submit-only key (โชว์ในเว็บได้)

  function anyModalOpen() { try { return !!document.querySelector('.modal-overlay.open'); } catch (e) { return false; } }
  function gateOpen() { try { var g = document.getElementById('rg-gate'); return !!g && g.style.display === 'flex'; } catch (e) { return false; } }

  function exitSurveyEmail(choice, text, surface) {
    try {
      var fields = {
        subject: '【離開問卷】遊戲頁 exit survey',
        from_name: '泰華遊戲・exit survey',
        '原因': choice || '(未選)',
        '留言': text || '',
        '觸發方式': surface || '',
        '頁面': location.pathname
      };
      if (typeof window.web3Send === 'function') { window.web3Send({ fields: fields }); return; }
      fetch('https://api.web3forms.com/submit', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }, keepalive: true,
        body: JSON.stringify(Object.assign({ access_key: PUBLIC_W3F_KEY }, fields))
      }).catch(function () {});
    } catch (e) {}
  }

  function maybeShowExitBar(trigger) {
    var loggedIn = !!(window.READING_AUTH && READING_AUTH.user);
    if (loggedIn || exitSurveyShown) return;
    if (gateOpen()) return;                 // กำแพงล็อกอินเปิดอยู่ = ไม่เด้งทับ
    try { if (anyModalOpen()) return; } catch (e) {}   // มี modal เปิด = ไม่เด้งทับ
    showExitBar(trigger);
  }

  function showExitBar(trigger) {
    exitSurveyShown = true;
    try { window.gtag('event', 'exit_survey_shown', { surface: 'bar', trigger: trigger || '' }); } catch (e) {}
    var opts = [['no_login', '不想登入'], ['login_broken', '登入怪怪的'], ['just_play', '隨便玩玩'], ['no_email', '還不想留 Email'], ['other', '其他…']];
    var chips = opts.map(function (o) {
      return '<button class="tf-eb-opt" data-v="' + o[0] + '" style="flex:0 0 auto;background:#fff;border:1px solid rgba(70,179,119,0.4);border-radius:20px;padding:7px 13px;font-size:13px;color:#2E7D4F;cursor:pointer;font-family:inherit;white-space:nowrap;">' + o[1] + '</button>';
    }).join('');
    var bar = document.createElement('div');
    bar.id = 'tf-exit-bar';
    bar.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:100001;background:#FBF5E7;border-top:1px solid rgba(70,179,119,0.35);box-shadow:0 -8px 24px rgba(0,0,0,0.14);padding:12px 14px calc(12px + env(safe-area-inset-bottom));font-family:\'Noto Sans TC\',\'Noto Sans Thai\',sans-serif;transform:translateY(115%);transition:transform .32s ease;';
    bar.innerHTML =
      '<div style="max-width:680px;margin:0 auto;position:relative;">' +
        '<button id="tf-eb-close" aria-label="關閉" style="position:absolute;top:-2px;right:0;border:none;background:none;font-size:18px;color:#5A3E0A;cursor:pointer;line-height:1;">✕</button>' +
        '<div style="display:flex;align-items:center;gap:8px;margin:0 26px 9px 0;font-size:14px;color:#2E7D4F;"><span style="font-size:22px;">👧🏻</span><b>要走了嗎？是哪裡卡住了？告訴米娜一下 🙏</b></div>' +
        '<div style="display:flex;gap:7px;overflow-x:auto;padding-bottom:2px;">' + chips + '</div>' +
        '<textarea id="tf-eb-text" rows="1" placeholder="想說的話…（可不填）" style="display:none;width:100%;box-sizing:border-box;margin-top:8px;padding:8px 11px;border:1px solid rgba(70,179,119,0.4);border-radius:10px;font-size:13px;color:#2E7D4F;font-family:inherit;resize:none;"></textarea>' +
        '<div style="display:flex;align-items:center;gap:10px;margin-top:9px;">' +
          '<span style="font-size:12px;color:#5A3E0A;">先看看課程也可以喔 😊</span>' +
          '<button id="tf-eb-book" style="margin-left:auto;background:#C8973A;color:#FBF5E7;border:none;border-radius:10px;padding:8px 16px;font-size:14px;font-weight:800;cursor:pointer;">免費體驗課</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(bar);
    requestAnimationFrame(function () { bar.style.transform = 'translateY(0)'; });
    function done(choice, text) {
      if (choice) {
        try { window.gtag('event', 'exit_survey_choice', { choice: choice, surface: 'bar', trigger: trigger || '' }); } catch (e) {}
        exitSurveyEmail(choice, text || '', trigger || 'bar');
      }
      bar.style.transform = 'translateY(115%)';
      setTimeout(function () { if (bar.parentNode) bar.remove(); }, 320);
    }
    bar.querySelector('#tf-eb-close').onclick = function () { done(null); };
    bar.querySelector('#tf-eb-book').onclick = function () {
      try { window.gtag('event', 'book_trial_click', { from: 'exit_bar' }); } catch (e) {}
      done('book_trial');
      if (typeof window.openModal === 'function') window.openModal('modal-line-qr');
    };
    [].forEach.call(bar.querySelectorAll('.tf-eb-opt'), function (b) {
      b.onclick = function () {
        var v = b.getAttribute('data-v');
        if (v === 'other') {
          var ta = bar.querySelector('#tf-eb-text');
          ta.style.display = 'block'; ta.focus();
          b.textContent = '送出 →'; b.style.background = '#CDEBD6';
          b.onclick = function () { done('other:' + (ta.value || '').slice(0, 200), (ta.value || '').slice(0, 200)); };
        } else { done(v); }
      };
    });
  }

  function setupExitTriggers() {
    var isTouch = false;
    try { isTouch = window.matchMedia && window.matchMedia('(hover: none) and (pointer: coarse)').matches; } catch (e) {}
    if (isTouch) {
      var idleT;
      var arm = function () { clearTimeout(idleT); idleT = setTimeout(function () { maybeShowExitBar('idle'); }, 45000); };
      ['touchstart', 'scroll', 'click', 'keydown'].forEach(function (ev) { document.addEventListener(ev, arm, { passive: true }); });
      arm();
    } else {
      document.addEventListener('mouseout', function (e) {
        if (e.clientY <= 0 && !e.relatedTarget && !e.toElement) maybeShowExitBar('exit_intent');   // เมาส์ออกทางขอบบนเท่านั้น
      });
    }
  }

  function boot() { setupExitTriggers(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
