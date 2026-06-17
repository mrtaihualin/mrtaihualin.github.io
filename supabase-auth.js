// ════════════════════════════════════════════════════════════
// supabase-auth.js — ล็อกอิน + เก็บคะแนน tone-finder ราย "หัว"
// ทำงานคู่กับ GA4 เดิม (ไม่แตะ ไม่แทนที่)
// ต้องโหลดหลัง: supabase-js CDN และ supabase-config.js
// ════════════════════════════════════════════════════════════
(function () {
  'use strict';

  var cfg = window.SUPABASE_CONFIG || {};
  var ready = cfg.url && cfg.anonKey &&
              cfg.url.indexOf('YOUR_') === -1 &&
              cfg.anonKey.indexOf('YOUR_') === -1 &&
              window.supabase && window.supabase.createClient;

  if (!ready) {
    // ยังไม่ตั้งค่า key → ไม่ทำอะไร เว็บทำงานปกติเหมือนเดิม
    console.info('[tone-finder] Supabase ยังไม่ตั้งค่า — ข้ามระบบล็อกอิน');
    return;
  }

  var sb = window.supabase.createClient(cfg.url, cfg.anonKey);
  var currentUser = null;

  // ── บัฟเฟอร์เก็บข้อมูลของรอบที่กำลังเล่น ────────────────────
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
      wrongBuffer.push({
        word: params.word,
        selected: params.selected,
        correct: params.correct
      });
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

  // ── UI ปุ่มล็อกอินลอยมุมขวาบน ──────────────────────────────
  var box;
  function buildUI() {
    box = document.createElement('div');
    box.id = 'tf-auth';
    box.style.cssText =
      'position:fixed;top:calc(var(--nav-h,56px) + 8px);right:12px;z-index:9999;' +
      'font-family:"Noto Sans TC",sans-serif;font-size:13px;';
    document.body.appendChild(box);
    renderUI();
  }

  function renderUI() {
    if (!box) return;
    if (currentUser) {
      var email = (currentUser.email || 'ผู้ใช้');
      box.innerHTML =
        '<div style="display:flex;align-items:center;gap:8px;background:#fff;' +
        'border:1px solid rgba(200,151,58,0.4);border-radius:999px;padding:5px 10px;' +
        'box-shadow:0 2px 8px rgba(0,0,0,0.08);">' +
        '<span style="color:#8B6310;max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">👤 ' + esc(email) + '</span>' +
        '<button id="tf-logout" style="border:none;background:#C8973A;color:#fff;' +
        'border-radius:999px;padding:4px 10px;cursor:pointer;font-size:12px;">ออกจากระบบ</button>' +
        '</div>';
      document.getElementById('tf-logout').onclick = doLogout;
    } else {
      box.innerHTML =
        '<button id="tf-login" style="border:none;background:#C8973A;color:#fff;' +
        'border-radius:999px;padding:7px 14px;cursor:pointer;font-weight:700;' +
        'box-shadow:0 2px 8px rgba(0,0,0,0.12);">เข้าสู่ระบบ / 登入</button>';
      document.getElementById('tf-login').onclick = doLogin;
    }
  }

  function doLogin() {
    var email = window.prompt('กรอกอีเมลเพื่อรับลิงก์เข้าสู่ระบบ\n請輸入 Email 以接收登入連結:');
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
      else alert('ส่งลิงก์เข้าสู่ระบบไปที่อีเมลแล้ว\n請到信箱點擊登入連結 ✉️\n(' + email + ')');
    });
  }

  function doLogout() {
    sb.auth.signOut().then(function () {
      currentUser = null;
      renderUI();
    });
  }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  // ── เริ่มต้น: เช็คสถานะล็อกอินปัจจุบัน + ฟังการเปลี่ยนแปลง ──
  sb.auth.getSession().then(function (res) {
    currentUser = (res.data && res.data.session && res.data.session.user) || null;
    renderUI();
  });
  sb.auth.onAuthStateChange(function (_event, session) {
    currentUser = (session && session.user) || null;
    renderUI();
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', buildUI);
  } else {
    buildUI();
  }
})();
