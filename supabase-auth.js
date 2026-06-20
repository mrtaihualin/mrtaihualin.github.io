// ════════════════════════════════════════════════════════════
// supabase-auth.js — ล็อกอิน (Google) + เก็บคะแนน tone-finder ราย "หัว"
// ทำงานคู่กับ GA4 เดิม (ไม่แตะ ไม่แทนที่)
// ต้องโหลดหลัง: supabase-js CDN และ supabase-config.js
//
// โหมดบังคับล็อกอิน: คุมด้วย window.SUPABASE_CONFIG.requireLogin
//   - true  → มีฉากกั้นคลุมเกม ต้องล็อกอินก่อนถึงเล่นได้
//   - false → ล็อกอินเป็นออปชั่น (โชว์ปุ่มเล็กมุมขวาบน) เล่นได้เลยไม่บังคับ
//   - ถ้า Supabase ยังไม่ตั้งค่า / โหลดไม่ได้ → ไม่กั้น เล่นได้ปกติ (กันเว็บพัง)
// ════════════════════════════════════════════════════════════
(function () {
  'use strict';

  var cfg = window.SUPABASE_CONFIG || {};
  var requireLogin = cfg.requireLogin === true;
  var ready = cfg.url && cfg.anonKey &&
              cfg.url.indexOf('YOUR_') === -1 &&
              cfg.anonKey.indexOf('YOUR_') === -1 &&
              window.supabase && window.supabase.createClient;

  if (!ready) {
    console.info('[tone-finder] Supabase ยังไม่ตั้งค่า/โหลดไม่ได้ — ข้ามระบบล็อกอิน เล่นได้ปกติ');
    return;
  }

  var sb = window.supabase.createClient(cfg.url, cfg.anonKey);
  var currentUser = null;
  var authResolved = false;
  var gateOpen = false;          // gate เด้งเฉพาะตอนผู้ใช้กด "เริ่มเล่น" จริง
  var pendingAfterLogin = null;  // callback หลังล็อกอินสำเร็จในแท็บเดิม (เช่น OTP)

  var sessionMode = null;
  var wrongBuffer = [];

  // ── ดักจับ GA4 events โดยห่อ gtag เดิม (ไม่กระทบการยิง GA4) ──
  var origGtag = window.gtag || function () {};
  window.gtag = function () {
    try { origGtag.apply(this, arguments); } catch (e) {}
    try {
      if (arguments[0] === 'event') {
        handleEvent(arguments[1], arguments[2] || {});
      }
    } catch (e) { /* อย่าให้พังการเล่นเกม */ }
  };

  function handleEvent(name, params) {
    if (name === 'tone_finder_start') {
      sessionMode = params.mode || null;
      wrongBuffer = [];
    } else if (name === 'tone_answer_wrong') {
      wrongBuffer.push({ word: params.word, selected: params.selected, correct: params.correct });
    } else if (name === 'tone_finder_complete') {
      saveSession(params.score, params.total);
    }
  }

  function saveSession(score, total) {
    if (!currentUser) return; // ยังไม่ล็อกอิน → ไม่บันทึก (GA4 ยังนับภาพรวมให้)
    var row = {
      user_id: currentUser.id,
      mode: sessionMode,
      score: typeof score === 'number' ? score : null,
      total: typeof total === 'number' ? total : null,
      wrong_words: wrongBuffer.slice()
    };
    sb.from('tone_sessions').insert(row).then(function (res) {
      if (res.error) console.warn('[tone-finder] บันทึกไม่สำเร็จ:', res.error.message);
      else console.info('[tone-finder] บันทึกผลแล้ว');
    });
  }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  // ── การเข้าสู่ระบบ ─────────────────────────────────────────
  function doGoogleLogin() {
    sb.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.href }
    }).then(function (res) {
      if (res.error) alert('登入 Google 失敗：' + res.error.message);
    });
  }

  function doEmailLogin() {
    var email = window.prompt('請輸入 Email 以接收登入連結：');
    if (!email) return;
    email = email.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      alert('อีเมลไม่ถูกต้อง / Email 格式不正確');
      return;
    }
    sb.auth.signInWithOtp({
      email: email,
      options: { emailRedirectTo: window.location.href }
    }).then(function (res) {
      if (res.error) alert('ส่งลิงก์ไม่สำเร็จ: ' + res.error.message);
      else alert('登入連結已寄出，請到信箱點擊 ✉️\n(' + email + ')');
    });
  }

  function doLogout() {
    sb.auth.signOut().then(function () { currentUser = null; render(); });
  }

  // ── องค์ประกอบหน้าจอ ───────────────────────────────────────
  var gate, badge, miniBtn;

  function googleBtnHTML(id) {
    return '<button id="' + id + '" style="width:100%;display:flex;align-items:center;justify-content:center;gap:10px;' +
      'border:1px solid #dadce0;background:#fff;color:#3c4043;border-radius:10px;padding:12px;cursor:pointer;' +
      'font-size:15px;font-weight:600;box-shadow:0 1px 3px rgba(0,0,0,0.08);">' +
        '<svg width="18" height="18" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>' +
        '使用 Google 登入' +
      '</button>';
  }

  function buildGate() {
    gate = document.createElement('div');
    gate.id = 'tf-gate';
    gate.style.cssText =
      'position:fixed;inset:0;z-index:100000;display:none;align-items:center;justify-content:center;padding:20px;' +
      'background:rgba(28,18,4,0.82);backdrop-filter:blur(5px);-webkit-backdrop-filter:blur(5px);' +
      'font-family:"Noto Sans TC","Noto Sans Thai",sans-serif;';
    gate.innerHTML =
      '<div id="tf-gate-card" style="position:relative;background:#fff;max-width:380px;width:100%;border-radius:18px;padding:30px 26px;' +
      'box-shadow:0 18px 50px rgba(0,0,0,0.35);text-align:center;">' +
        '<button id="tf-gate-close" aria-label="ปิด / 關閉" style="position:absolute;top:10px;right:12px;border:none;background:none;' +
        'font-size:20px;line-height:1;color:#C3B594;cursor:pointer;">✕</button>' +
        '<div style="font-size:40px;line-height:1;margin-bottom:10px;">🎵</div>' +
        '<h2 style="margin:0 0 6px;font-size:20px;color:#5C4410;font-weight:800;">登入更好玩！🎉</h2>' +
        '<p style="margin:0 0 20px;font-size:14px;color:#8B7340;line-height:1.6;">免費試玩結束囉～登入就能<b>把分數存起來</b>、上<b>排行榜跟大家一起比賽</b>，還能解鎖徽章收藏！</p>' +
        googleBtnHTML('tf-google') +
        '<button id="tf-email" style="margin-top:12px;border:none;background:none;color:#A07A1E;' +
        'cursor:pointer;font-size:13px;text-decoration:underline;">用 Email 登入</button>' +
        '<p style="margin:16px 0 0;font-size:12px;color:#A07A1E;">點擊空白處可先返回瀏覽</p>' +
        '<p style="margin:10px 0 0;font-size:11px;color:#B0A080;line-height:1.5;">登入即表示同意<a href="terms.html" style="color:#A07A1E;">服務條款與資料收集</a></p>' +
      '</div>';
    document.body.appendChild(gate);
    gate.querySelector('#tf-google').onclick = doGoogleLogin;
    gate.querySelector('#tf-email').onclick = doEmailLogin;
    gate.querySelector('#tf-gate-close').onclick = hideGate;
    // กดพื้นที่ว่างรอบการ์ด (backdrop) → ปิด gate กลับไปดูหน้าเว็บ
    gate.addEventListener('click', function (e) { if (e.target === gate) hideGate(); });
  }

  function buildMiniBtn() {
    miniBtn = document.createElement('div');
    miniBtn.id = 'tf-mini';
    miniBtn.style.cssText =
      'position:fixed;top:calc(var(--nav-h,56px) + 8px);right:12px;z-index:9999;display:none;' +
      'font-family:"Noto Sans TC",sans-serif;';
    miniBtn.innerHTML =
      '<button id="tf-mini-login" style="display:flex;align-items:center;gap:7px;border:1px solid rgba(200,151,58,0.5);' +
      'background:#fff;color:#8B6310;border-radius:999px;padding:6px 13px;cursor:pointer;font-size:13px;font-weight:700;' +
      'box-shadow:0 2px 8px rgba(0,0,0,0.1);">登入</button>';
    document.body.appendChild(miniBtn);
    miniBtn.querySelector('#tf-mini-login').onclick = function () { showGate(); };
  }

  function buildBadge() {
    badge = document.createElement('div');
    badge.id = 'tf-auth';
    badge.style.cssText =
      'position:fixed;top:calc(var(--nav-h,56px) + 8px);right:12px;z-index:9999;display:none;' +
      'font-family:"Noto Sans TC",sans-serif;font-size:13px;';
    document.body.appendChild(badge);
  }

  function render() {
    if (!gate) buildGate();
    if (!miniBtn) buildMiniBtn();
    if (!badge) buildBadge();

    if (currentUser) {
      gateOpen = false;
      gate.style.display = 'none';
      miniBtn.style.display = 'none';
      var email = currentUser.email || '使用者';
      badge.style.display = 'block';
      badge.innerHTML =
        '<div style="display:flex;align-items:center;gap:8px;background:#fff;' +
        'border:1px solid rgba(200,151,58,0.4);border-radius:999px;padding:5px 10px;' +
        'box-shadow:0 2px 8px rgba(0,0,0,0.08);">' +
        '<a href="leaderboard.html" title="อันดับผู้เล่น" style="text-decoration:none;font-size:15px;">🏆</a>' +
        '<a href="my-progress.html" title="คะแนนของฉัน" style="text-decoration:none;color:#8B6310;font-size:15px;">📊</a>' +
        '<span style="color:#8B6310;max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + esc(email) + '</span>' +
        '<button id="tf-logout" style="border:none;background:#C8973A;color:#fff;' +
        'border-radius:999px;padding:4px 10px;cursor:pointer;font-size:12px;">登出</button>' +
        '</div>';
      badge.querySelector('#tf-logout').onclick = doLogout;
    } else {
      badge.style.display = 'none';
      // หน้าเว็บมองเห็นได้เสมอ — ไม่บล็อกตอนโหลด
      // gate เด้งเฉพาะเมื่อผู้ใช้กด "เริ่มเล่น" จริง (gateOpen) หรือกดปุ่มล็อกอินมุมขวา
      gate.style.display = (gateOpen && authResolved) ? 'flex' : 'none';
      // ปุ่มล็อกอินมุมขวาบนโชว์ทั้งสองโหมด (รู้ว่าล็อกอินได้ แต่ไม่บังคับให้ดูหน้า)
      miniBtn.style.display = authResolved ? 'block' : 'none';
    }
  }

  // ── เปิด/ปิด gate ตามคำขอ ───────────────────────────────────
  function showGate() {
    if (currentUser) { if (pendingAfterLogin) { var f = pendingAfterLogin; pendingAfterLogin = null; f(); } return; }
    gateOpen = true;
    render();
  }
  function hideGate() {
    gateOpen = false;
    pendingAfterLogin = null;
    render();
  }

  // ── API ให้หน้าเกมเรียกตอนจะเริ่มเล่นจริง ───────────────────
  // ใช้: if (window.TF_AUTH && !window.TF_AUTH.ensureLogin()) return;
  //   - ล็อกอินแล้ว หรือไม่บังคับล็อกอิน → คืน true (เล่นต่อได้)
  //   - ยังไม่ล็อกอิน + บังคับ → เด้ง gate แล้วคืน false (หยุดการเริ่มเกม)
  window.TF_AUTH = {
    loggedIn: function () { return !!currentUser; },
    requireLogin: requireLogin,
    ensureLogin: function () {
      // อนุญาต → คืน true เฉยๆ ให้ caller (startSetSession) เล่นต่อเอง
      // ห้ามเรียก callback ที่ re-run startSetSession ไม่งั้นจะ recursion ไม่รู้จบ
      if (!requireLogin || currentUser) return true;
      showGate();   // ยังไม่ล็อกอิน + บังคับ → เด้ง gate แล้วบล็อก
      return false;
    },
    showGate: showGate,
    hideGate: hideGate
  };

  // กด Esc เพื่อปิด gate (กลับไปดูหน้าเว็บ)
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && gateOpen) hideGate();
  });

  function boot() {
    render();
    sb.auth.getSession().then(function (res) {
      currentUser = (res.data && res.data.session && res.data.session.user) || null;
      authResolved = true;
      render();
    });
    sb.auth.onAuthStateChange(function (_event, session) {
      currentUser = (session && session.user) || null;
      authResolved = true;
      render();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
