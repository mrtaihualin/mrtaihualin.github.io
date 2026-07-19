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

  var sb = window.getSupabaseClient ? window.getSupabaseClient() : window.supabase.createClient(cfg.url, cfg.anonKey);
  var currentUser = null;
  var authResolved = false;
  var gateOpen = false;          // gate เด้งเฉพาะตอนผู้ใช้กด "เริ่มเล่น" จริง
  var pendingAfterLogin = null;  // callback หลังล็อกอินสำเร็จในแท็บเดิม (เช่น OTP)

  var sessionMode = null;
  var wrongBuffer = [];
  var lastSession = null;   // snapshot รอบล่าสุด เผื่อ login ทีหลัง → บันทึกขึ้นกระดานย้อนหลัง LIN 2026-06-26

  // ── ตรวจเบราว์เซอร์ในแอป (Google ล็อกอินถูกบล็อกในเว็บวิวฝัง) LIN 2026-06-23 ──
  // FB/IG/Threads/TikTok/LINE/小紅書 = เว็บวิว → ซ่อนปุ่ม Google โชว์อีเมลแทน
  // YouTube/เบราว์เซอร์ปกติ = ไม่เข้าเงื่อนไข → โชว์ Google ได้
  function isInAppBrowser() {
    var ua = (navigator.userAgent || '') + ' ' + (navigator.vendor || '');
    return /FBAN|FBAV|FB_IAB|Instagram|Threads|musical_ly|Bytedance|TikTok|\bLine\/|MicroMessenger|XiaoHongShu|\bRedApp/i.test(ua);
  }

  // ── เก็บอีเมลแบบไม่ยืนยัน (frictionless) → ตาราง leads → เล่นต่อได้เลย LIN 2026-06-23 ──
  var LEAD_KEY = 'tf_lead_captured';
  var _leadMem = false;   // fallback หน่วยความจำ กันเว็บวิวที่บล็อก localStorage (ให้อีเมลแล้วต้องไม่โดนกำแพงซ้ำ)
  function leadCaptured() { if (_leadMem) return true; try { return localStorage.getItem(LEAD_KEY) === '1'; } catch (e) { return false; } }
  function markLeadCaptured() { _leadMem = true; try { localStorage.setItem(LEAD_KEY, '1'); } catch (e) {} }
  function leadSource() {
    try {
      var p = new URLSearchParams(location.search);
      var s = p.get('utm_source') || p.get('source');
      if (s) return s;
      var r = document.referrer || '';
      if (/facebook|fb\./i.test(r)) return 'facebook';
      if (/instagram/i.test(r)) return 'instagram';
      if (/threads/i.test(r)) return 'threads';
      if (/tiktok/i.test(r)) return 'tiktok';
      if (/youtube/i.test(r)) return 'youtube';
      if (/google/i.test(r)) return 'google';
      if (r) return (r.split('/')[2] || 'referral');
      return 'direct';
    } catch (e) { return 'unknown'; }
  }

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
      // เก็บ snapshot รอบนี้ไว้เสมอ → ถ้ายังไม่ล็อกอิน เก็บค้างไว้ พอ login (OTP/Google) ค่อยบันทึกย้อนหลัง
      lastSession = {
        mode: sessionMode,
        score: typeof params.score === 'number' ? params.score : null,
        total: typeof params.total === 'number' ? params.total : null,
        wrong_words: wrongBuffer.slice()
      };
      saveSession(lastSession);
    }
  }

  var ADMIN_EMAIL = 'mr.taihualin@gmail.com';

  // บันทึก snapshot รอบล่าสุดลง tone_sessions · ยังไม่ล็อกอิน = เก็บค้างไว้ใน lastSession (บันทึกตอน login)
  function saveSession(s) {
    s = s || lastSession;
    if (!s) return;
    if (!currentUser) return; // ยังไม่ล็อกอิน → คะแนนค้างใน lastSession รอ login มาบันทึกย้อนหลัง (GA4 ยังนับภาพรวมให้)
    if (currentUser.email === ADMIN_EMAIL) { lastSession = null; return; } // admin: ไม่นับคะแนนใน ranking
    var row = {
      user_id: currentUser.id,
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

  // ── admin: ปลดล็อกทุก badge สำหรับ mr.taihualin@gmail.com ──
  function adminUnlockAll(email) {
    if (email !== 'mr.taihualin@gmail.com') return;
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

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  // ── การเข้าสู่ระบบ ─────────────────────────────────────────
  function doGoogleLogin() {
    try { window.gtag('event', 'login_google', {}); } catch (e) {}
    sb.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.href }
    }).then(function (res) {
      if (res.error) alert('登入 Google 失敗：' + res.error.message);
    });
  }

  // เก็บอีเมลลง leads แล้วปลดล็อกเล่นต่อทันที (ไม่ต้องยืนยัน ไม่ต้องส่งอีเมล) LIN 2026-06-23
  // คืนค่า: ข้อความ error (string) ถ้าอีเมลผิด · null = สำเร็จ
  function submitLeadEmail(email, onDone) {
    email = (email || '').trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return 'Email 格式不正確 / อีเมลไม่ถูกต้อง';
    try {
      sb.from('leads').insert({ email: email, source: leadSource(), consent: true })
        .then(function (res) { if (res.error) console.warn('[tone-finder] เก็บ lead ไม่สำเร็จ:', res.error.message); });
    } catch (e) {}
    markLeadCaptured();
    try { window.gtag('event', 'email_capture', { source: leadSource() }); } catch (e) {}
    if (onDone) onDone();
    return null;
  }

  // ── ขอรหัส OTP 6 หลัก (passwordless · ไม่ส่งลิงก์เพราะไม่ใส่ emailRedirectTo) LIN 2026-06-27 ──
  function doStartOtp(email, isResend) {
    email = (email || '').trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { setOtpMsg('Email 格式不正確', true); try { window.gtag('event', 'login_fail', { stage: 'email_format' }); } catch (e) {} return; }
    otpEmail = email;
    setOtpMsg('寄送中…⏳', false);
    try { window.gtag('event', 'login_otp_start', { resend: !!isResend }); } catch (e) {}
    sb.auth.signInWithOtp({ email: email, options: { shouldCreateUser: true } })
      .then(function (res) {
        if (res.error) {
          setOtpMsg('寄送失敗：' + res.error.message, true);
          try { window.gtag('event', 'login_fail', { stage: 'otp_send', msg: res.error.message }); } catch (e) {}
          return;
        }
        showOtpStep2();              // โชว์ช่องกรอกรหัส + เริ่มนับถอยหลัง
        try { window.gtag('event', 'otp_sent', {}); } catch (e) {}   // ⭐ รหัสส่งออกสำเร็จ — แยก "ส่งไม่ออก" ออกจาก "ออกแล้วแต่คนไม่กรอก"
        setOtpMsg('驗證碼已寄到 ' + esc(email) + '，請查看信箱（含垃圾信匣）', false);
      });
  }

  // ── ยืนยันรหัส → กลายเป็นบัญชี verified (onAuthStateChange จะปิด gate ให้เอง) ──
  function doVerifyOtp(code) {
    code = (code || '').trim();
    if (!/^\d{6,10}$/.test(code)) { setOtpMsg('請輸入信中的驗證碼（純數字）', true); try { window.gtag('event', 'login_fail', { stage: 'code_format' }); } catch (e) {} return; }
    setOtpMsg('驗證中…⏳', false);
    try { window.gtag('event', 'otp_verify_attempt', {}); } catch (e) {}   // คนกดยืนยันรหัสจริง
    sb.auth.verifyOtp({ email: otpEmail, token: code, type: 'email' })
      .then(function (res) {
        if (res.error) {
          setOtpMsg('驗證碼錯誤或已過期，請重新輸入', true);
          try { window.gtag('event', 'login_fail', { stage: 'otp_verify', msg: res.error.message }); } catch (e) {}
          return;
        }
        try { window.gtag('event', 'otp_success', {}); } catch (e) {}
        markLeadCaptured();          // verified แล้ว = มีสิทธิ์เล่นต่อด้วย (กันโดนกำแพงซ้ำ)
        // currentUser ถูกตั้งโดย onAuthStateChange → render() ปิด gate + ดึงโปรไฟล์
      });
  }

  // แสดงข้อความสถานะใต้ฟอร์ม OTP
  function setOtpMsg(msg, isErr) {
    var el = gate && gate.querySelector('#tf-otp-msg');
    if (!el) return;
    el.style.display = 'block';
    el.style.color = isErr ? '#C0392B' : '#8B7340';
    el.innerHTML = msg;
  }

  // เผยช่องกรอกรหัส + เริ่มนับถอยหลังปุ่มส่งอีกครั้ง 60 วิ
  function showOtpStep2() {
    var step2 = gate && gate.querySelector('#tf-otp-step2');
    if (step2) step2.style.display = 'block';
    var sendBtn = gate && gate.querySelector('#tf-otp-send');
    if (sendBtn) sendBtn.style.display = 'none';
    startOtpCooldown();
    var codeInput = gate && gate.querySelector('#tf-otp-code');
    if (codeInput) codeInput.focus();
  }

  function startOtpCooldown() {
    otpCooldown = 60;
    if (otpTimer) clearInterval(otpTimer);
    function tick() {
      var b = gate && gate.querySelector('#tf-otp-resend');
      if (!b) { clearInterval(otpTimer); return; }
      if (otpCooldown > 0) {
        b.disabled = true; b.style.opacity = '0.5'; b.style.cursor = 'default';
        b.textContent = '重新寄送 (' + otpCooldown + ')';
        otpCooldown--;
      } else {
        clearInterval(otpTimer); otpTimer = null;
        b.disabled = false; b.style.opacity = '1'; b.style.cursor = 'pointer';
        b.textContent = '重新寄送驗證碼';
      }
    }
    tick();
    otpTimer = setInterval(tick, 1000);
  }

  // doLogout เดิมอยู่ที่นี่ — ย้ายไปรวมที่ auth-widget.js แล้ว (window.SITE_AUTH.doLogout)
  // เหลือไว้ไม่ได้ใช้แล้วเพราะ badge (ปุ่ม 登出) ย้ายไปให้ SITE_AUTH คุมทั้งหมด LIN 2026-07-03

  // ── องค์ประกอบหน้าจอ ───────────────────────────────────────
  var gate, miniBtn;

  // มี modal (จองเรียน/QR ฯลฯ) เปิดอยู่ไหม → ถ้าเปิด ซ่อนปุ่ม 登入/โปรไฟล์ กันทับปุ่มกากบาท LIN 2026-06-23
  function anyModalOpen() { try { return !!document.querySelector('.modal-overlay.open'); } catch (e) { return false; } }

  function googleBtnHTML(id) {
    return '<button id="' + id + '" style="width:100%;display:flex;align-items:center;justify-content:center;gap:10px;' +
      'border:1px solid #dadce0;background:#fff;color:#3c4043;border-radius:10px;padding:12px;cursor:pointer;' +
      'font-size:15px;font-weight:600;box-shadow:0 1px 3px rgba(0,0,0,0.08);">' +
        '<svg width="18" height="18" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>' +
        '使用 Google 登入' +
      '</button>';
  }

  // gate มี 2 โหมด: 'play' = เก็บอีเมลเล่นต่อ (auto หลังเล่นฟรีหมด) · 'login' = ล็อกอินจริงขึ้นกระดาน (กดปุ่ม 登入)
  var gateMode = 'play';

  // ── สถานะ OTP (ยืนยันรหัส 6 หลัก) LIN 2026-06-26 ──
  var otpEmail = '';        // อีเมลที่กำลังรอยืนยัน
  var otpCooldown = 0;      // วินาทีที่เหลือก่อนกด "ส่งอีกครั้ง" ได้
  var otpTimer = null;      // ตัวจับเวลานับถอยหลัง

  function buildGate() {
    gate = document.createElement('div');
    gate.id = 'tf-gate';
    gate.style.cssText =
      'position:fixed;inset:0;z-index:100000;display:none;align-items:center;justify-content:center;padding:20px;' +
      'background:rgba(28,18,4,0.82);backdrop-filter:blur(5px);-webkit-backdrop-filter:blur(5px);' +
      'font-family:"Noto Sans TC","Noto Sans Thai",sans-serif;';
    document.body.appendChild(gate);
    // กดพื้นที่ว่างรอบการ์ด (backdrop) → น้องมีนาเด้งถามก่อนปิด
    gate.addEventListener('click', function (e) { if (e.target === gate) requestCloseGate(); });
    renderGateContent();
  }

  function renderGateContent() {
    if (!gate) return;
    var inApp = isInAppBrowser();
    var closeBtn = '<button id="tf-gate-close" aria-label="ปิด / 關閉" style="position:absolute;top:10px;right:12px;border:none;background:none;font-size:20px;line-height:1;color:#C3B594;cursor:pointer;">✕</button>';
    var cardOpen = '<div id="tf-gate-card" style="position:relative;background:#fff;max-width:380px;width:100%;border-radius:18px;padding:30px 26px;box-shadow:0 18px 50px rgba(0,0,0,0.35);text-align:center;">';

    if (gateMode === 'login') {
      // ── โหมดล็อกอินจริง (ขึ้นกระดาน) — รหัส OTP ใช้ได้ทุกที่ + Google เฉพาะเบราว์เซอร์ปกติ LIN 2026-06-26 ──
      gate.innerHTML = cardOpen + closeBtn +
        '<div style="font-size:40px;line-height:1;margin-bottom:10px;">🏆</div>' +
        '<h2 style="margin:0 0 6px;font-size:20px;color:#5C4410;font-weight:800;">登入排行榜</h2>' +
        '<p style="margin:0 0 16px;font-size:14px;color:#8B7340;line-height:1.6;">登入後分數<b>同步保存</b>、上<b>排行榜</b>，換手機也記得你！</p>' +
        '<input id="tf-otp-email" type="email" inputmode="email" autocomplete="email" placeholder="輸入 Email" style="width:100%;box-sizing:border-box;padding:12px 14px;border:1.5px solid #E5D9B8;border-radius:10px;font-size:15px;color:#5C4410;outline:none;">' +
        '<button id="tf-otp-send" style="margin-top:10px;width:100%;border:none;background:#C8973A;color:#fff;border-radius:10px;padding:13px;cursor:pointer;font-size:16px;font-weight:800;">寄送驗證碼 →</button>' +
        '<div id="tf-otp-step2" style="display:none;margin-top:12px;">' +
          '<input id="tf-otp-code" inputmode="numeric" autocomplete="one-time-code" maxlength="10" placeholder="輸入信中的驗證碼" style="width:100%;box-sizing:border-box;padding:12px 14px;border:1.5px solid #E5D9B8;border-radius:10px;font-size:18px;letter-spacing:4px;text-align:center;color:#5C4410;outline:none;">' +
          '<button id="tf-otp-verify" style="margin-top:10px;width:100%;border:none;background:#2E7D4F;color:#fff;border-radius:10px;padding:13px;cursor:pointer;font-size:16px;font-weight:800;">確認登入</button>' +
          '<button id="tf-otp-resend" style="margin-top:8px;width:100%;border:1px solid #E5D9B8;background:#fff;color:#8B7340;border-radius:10px;padding:9px;cursor:pointer;font-size:13px;">重新寄送驗證碼</button>' +
        '</div>' +
        '<div id="tf-otp-msg" style="display:none;font-size:12.5px;margin:10px 0 0;text-align:left;line-height:1.5;"></div>' +
        (inApp
          ? '<div style="margin-top:14px;background:#FBF0DA;border:1px solid #EAC36B;border-radius:12px;padding:10px 12px;font-size:12.5px;color:#8B6310;line-height:1.6;">📩 在 App 內就用上面的 <b>Email 驗證碼</b>登入即可（Google 在 App 內無法使用）</div>'
          : ('<div style="display:flex;align-items:center;gap:10px;margin:16px 0;color:#C3B594;font-size:12px;"><span style="flex:1;height:1px;background:#EADFBF;"></span>或<span style="flex:1;height:1px;background:#EADFBF;"></span></div>' + googleBtnHTML('tf-google'))) +
        '<p style="margin:16px 0 0;font-size:12px;color:#A07A1E;">點擊空白處可先返回</p>' +
        '</div>';
      gate.querySelector('#tf-gate-close').onclick = requestCloseGate;
      var _se = gate.querySelector('#tf-otp-email');
      var _sBtn = gate.querySelector('#tf-otp-send');
      if (_sBtn) _sBtn.onclick = function () { doStartOtp(_se.value, false); };
      if (_se) _se.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') doStartOtp(_se.value, false); });
      var _ci = gate.querySelector('#tf-otp-code');
      var _vBtn = gate.querySelector('#tf-otp-verify');
      if (_vBtn) _vBtn.onclick = function () { doVerifyOtp(_ci.value); };
      if (_ci) _ci.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') doVerifyOtp(_ci.value); });
      var _rBtn = gate.querySelector('#tf-otp-resend');
      if (_rBtn) _rBtn.onclick = function () { if (otpCooldown <= 0) doStartOtp(otpEmail || _se.value, true); };
      if (!inApp) { var _g = gate.querySelector('#tf-google'); if (_g) _g.onclick = doGoogleLogin; }
      return;
    }

    // ── โหมดเก็บอีเมลเล่นต่อ (default) ──
    var showGoogle = !inApp;   // ในแอป FB/IG/TikTok → ซ่อน Google (กดไม่ได้)
    gate.innerHTML = cardOpen + closeBtn +
        '<div style="font-size:40px;line-height:1;margin-bottom:10px;">🎵</div>' +
        '<h2 style="margin:0 0 6px;font-size:20px;color:#5C4410;font-weight:800;">繼續玩，解鎖更多！🎉</h2>' +
        '<p style="margin:0 0 18px;font-size:14px;color:#8B7340;line-height:1.6;">免費試玩結束囉～留 Email 即可<b>繼續免費玩</b>，還會收到<b>老師精選的泰語單字速查表</b>！<br><span style="font-size:12px;color:#A07A1E;">（想存分數、上排行榜，點右上角登入帳號就行）</span></p>' +
        '<input id="tf-email-input" type="email" inputmode="email" autocomplete="email" placeholder="輸入 Email" style="width:100%;box-sizing:border-box;padding:12px 14px;border:1.5px solid #E5D9B8;border-radius:10px;font-size:15px;color:#5C4410;outline:none;">' +
        '<div id="tf-email-err" style="display:none;color:#C0392B;font-size:12px;margin:6px 0 0;text-align:left;"></div>' +
        '<button id="tf-email-go" style="margin-top:12px;width:100%;border:none;background:#C8973A;color:#fff;border-radius:10px;padding:13px;cursor:pointer;font-size:16px;font-weight:800;">繼續玩 →</button>' +
        (showGoogle
          ? ('<div style="display:flex;align-items:center;gap:10px;margin:16px 0;color:#C3B594;font-size:12px;"><span style="flex:1;height:1px;background:#EADFBF;"></span>或<span style="flex:1;height:1px;background:#EADFBF;"></span></div>' + googleBtnHTML('tf-google'))
          : '') +
        '<p style="margin:16px 0 0;font-size:11px;color:#B0A080;line-height:1.5;">輸入 Email 代表同意<a href="terms.html" style="color:#A07A1E;">服務條款與資料收集</a>，我們只用來寄學習資訊與通知，不會外流</p>' +
        '<p style="margin:10px 0 0;font-size:12px;color:#A07A1E;">點擊空白處可先返回瀏覽</p>' +
      '</div>';
    var _inp = gate.querySelector('#tf-email-input');
    var _err = gate.querySelector('#tf-email-err');
    function _trySubmit() {
      var msg = submitLeadEmail(_inp.value, function () {
        gateOpen = false; render();
        showScoreToast('✅ 開始囉～繼續玩吧 🎵', true);
        if (pendingAfterLogin) { var f = pendingAfterLogin; pendingAfterLogin = null; f(); }
      });
      if (msg) { _err.textContent = msg; _err.style.display = 'block'; }
    }
    gate.querySelector('#tf-email-go').onclick = _trySubmit;
    _inp.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') _trySubmit(); });
    if (showGoogle) { var _g2 = gate.querySelector('#tf-google'); if (_g2) _g2.onclick = doGoogleLogin; }
    gate.querySelector('#tf-gate-close').onclick = requestCloseGate;
  }

  function buildMiniBtn() {
    miniBtn = document.createElement('div');
    miniBtn.id = 'tf-mini';
    miniBtn.innerHTML =
      '<button id="tf-mini-login" style="display:flex;align-items:center;gap:6px;' +
      'background:linear-gradient(135deg,#8B6310,#C8973A);color:#fff;border:none;border-radius:20px;' +
      'padding:6px 16px;cursor:pointer;font-size:12.5px;font-weight:700;font-family:\'Noto Sans TC\',sans-serif;' +
      'box-shadow:0 2px 8px rgba(139,99,16,0.28);letter-spacing:0.3px;transition:filter .15s;"' +
      ' onmouseover="this.style.filter=\'brightness(1.1)\'" onmouseout="this.style.filter=\'none\'">🔑 登入保存分數</button>';
    var _mSlot = document.getElementById('tf-login-slot');
    if (_mSlot) {
      miniBtn.style.cssText = 'font-family:"Noto Sans TC",sans-serif;white-space:nowrap;display:none;';
      _mSlot.appendChild(miniBtn);
    } else {
      miniBtn.style.cssText = 'position:fixed;top:calc(var(--nav-h,56px)+14px);left:50%;transform:translateX(-50%);z-index:9999;display:none;font-family:"Noto Sans TC",sans-serif;white-space:nowrap;';
      document.body.appendChild(miniBtn);
    }
    miniBtn.querySelector('#tf-mini-login').onclick = function () { showGate(true); };
  }

  // buildBadge() / โปรไฟล์ (ชื่อ+รูป+แบดจ์) / openProfileEditor() เดิมอยู่ที่นี่ —
  // ย้ายไปรวมที่ auth-widget.js แล้ว ใช้ร่วมกับทุกหน้า (window.SITE_AUTH.openProfileEditor)
  // LIN 2026-07-03: รวม widget ล็อกอินให้เหมือนกันทุกหน้า กัน currentUser/badge แยกกันหลายจุด

  function render() {
    if (!gate) buildGate();
    if (!miniBtn) buildMiniBtn();
    // badge (ชื่อ/✏️/🏆/📊/登出) ไม่ได้สร้างที่นี่แล้ว — window.SITE_AUTH (auth-widget.js) คุมให้
    // ทั้งหมด (ลงทะเบียนไว้ครั้งเดียวใน boot() ด้านล่าง) render() นี้เหลือแค่ gate/miniBtn

    if (currentUser) {
      gateOpen = false;
      gate.style.display = 'none';
      miniBtn.style.display = 'none';
      adminUnlockAll(currentUser.email || '');
    } else {
      // หน้าเว็บมองเห็นได้เสมอ — ไม่บล็อกตอนโหลด
      // gate เด้งเฉพาะเมื่อผู้ใช้กด "เริ่มเล่น" จริง (gateOpen) หรือกดปุ่มล็อกอินมุมขวา
      gate.style.display = (gateOpen && authResolved) ? 'flex' : 'none';
      // ปุ่มล็อกอินมุมขวาบน — ซ่อนเมื่อมี modal เปิด (กันทับปุ่มกากบาท)
      miniBtn.style.display = (authResolved && !anyModalOpen()) ? 'block' : 'none';
      // ให้อีเมลแล้ว (ปลดล็อกแล้ว) → เปลี่ยนปุ่มเป็น "登入排行榜" ไม่ให้ดูเหมือนยังไม่ได้ทำอะไร
      var _mb = miniBtn.querySelector('#tf-mini-login');
      if (_mb) _mb.textContent = '🔑 登入保存分數';
    }
  }

  // ── เปิด/ปิด gate ตามคำขอ ───────────────────────────────────
  var gateShownFired = false;
  function showGate(force) {
    if (currentUser) { if (pendingAfterLogin) { var f = pendingAfterLogin; pendingAfterLogin = null; f(); } return; }
    if (leadCaptured() && !force) return;   // auto ไม่ nag คนที่ให้อีเมลแล้ว · ปุ่มกดเอง (force) เปิดได้เสมอ
    gateMode = force ? 'login' : 'play';     // กดปุ่มเอง = โหมดล็อกอินจริง(ขึ้นกระดาน) · auto = โหมดเก็บอีเมล
    if (!gate) buildGate(); else renderGateContent();
    gateOpen = true;
    if (!gateShownFired) { gateShownFired = true; try { window.gtag('event', 'gate_shown', { mode: gateMode }); } catch (e) {} }
    render();
  }
  function hideGate() {
    gateOpen = false;
    pendingAfterLogin = null;
    render();
  }

  // ── น้องมีนา exit survey — เด้งถามตอนคนจะปิด gate โดยยังไม่ล็อกอิน/ไม่ให้อีเมล LIN 2026-06-23 ──
  // 2026-07-19 แก้ (Lin สั่ง: เก็บไว้ได้ แต่ต้องไม่กวน เพราะไม่ได้มีประโยชน์มาก): เดิม exitSurveyShown
  // เป็นแค่ตัวแปรในหน้า รีเซ็ตทุกครั้งที่โหลดหน้าใหม่ — คนกลับมาเล่นเกมซ้ำแล้วปิดกำแพงล็อกอินอีก
  // จะเจอป๊อบอัพเต็มจอนี้ซ้ำทุกรอบ ไม่หยุดสักที ตอนนี้จำถาวรด้วย localStorage แบบเดียวกับแถบล่าง
  // exit-survey ใน shared.js (SHOWN_KEY 'exit_survey_shown_v1') — โชว์ครั้งเดียวตลอดไปต่อเครื่องพอ
  var GATE_SURVEY_SHOWN_KEY = 'tf_gate_exit_survey_shown_v1';
  function gateSurveyShown() { try { return localStorage.getItem(GATE_SURVEY_SHOWN_KEY) === '1'; } catch (e) { return false; } }
  function markGateSurveyShown() { try { localStorage.setItem(GATE_SURVEY_SHOWN_KEY, '1'); } catch (e) {} }
  var exitSurveyShown = false;   // กันโชว์ซ้อนภายในหน้าเดียวกัน (เสริมจาก localStorage ด้านบนที่กันข้ามหน้า/ข้าม session)
  function requestCloseGate() {
    if (currentUser || leadCaptured() || exitSurveyShown || gateSurveyShown()) { hideGate(); return; }
    showExitSurvey();
  }
  function finishExitSurvey(choice) {
    if (choice) {
      try { window.gtag('event', 'exit_survey_choice', { choice: choice, surface: 'modal' }); } catch (e) {}
      exitSurveyEmail(choice, choice.indexOf('other:') === 0 ? choice.slice(6) : '', 'modal');
    }
    var m = document.getElementById('tf-exit-survey');
    if (m) m.remove();
    hideGate();
  }
  function showExitSurvey() {
    exitSurveyShown = true;
    markGateSurveyShown();
    try { window.gtag('event', 'exit_survey_shown', { surface: 'modal' }); } catch (e) {}
    var opts = [['no_login', '不想登入 / 註冊'], ['login_broken', '登入怪怪的、按不動'],
                ['just_play', '只是想隨便玩玩'], ['no_email', '還不想留 Email'], ['other', '其他…']];
    var btns = opts.map(function (o) {
      return '<button class="tf-xs-opt" data-v="' + o[0] + '" style="display:block;width:100%;text-align:left;background:#fff;' +
        'border:1px solid rgba(70,179,119,0.4);border-radius:12px;padding:11px 14px;margin:0 0 8px;font-size:14px;color:#2E7D4F;cursor:pointer;font-family:inherit;">' + o[1] + '</button>';
    }).join('');
    var wrap = document.createElement('div');
    wrap.id = 'tf-exit-survey';
    wrap.style.cssText = 'position:fixed;inset:0;z-index:100002;display:flex;align-items:center;justify-content:center;padding:20px;' +
      'background:rgba(20,30,20,0.55);font-family:"Noto Sans TC","Noto Sans Thai",sans-serif;';
    wrap.innerHTML =
      '<div style="position:relative;background:#FBF5E7;max-width:360px;width:100%;border-radius:20px;padding:20px;box-shadow:0 18px 50px rgba(0,0,0,0.35);">' +
        '<button id="tf-xs-close" aria-label="關閉" style="position:absolute;top:12px;right:14px;border:none;background:none;font-size:18px;color:#5A3E0A;cursor:pointer;">✕</button>' +
        '<div style="display:flex;align-items:flex-start;gap:10px;margin:2px 0 14px;">' +
          '<div style="flex:none;width:56px;height:56px;border-radius:50%;background:#CDEBD6;display:flex;align-items:center;justify-content:center;font-size:34px;">👧🏻</div>' +
          '<div style="flex:1;background:#fff;border:1px solid rgba(70,179,119,0.35);border-radius:14px;border-top-left-radius:4px;padding:10px 12px;font-size:14px;line-height:1.55;color:#2E7D4F;">咦～要走了嗎？想知道是哪裡卡住了，米娜下次改進！</div>' +
        '</div>' + btns +
        '<textarea id="tf-xs-text" rows="2" placeholder="想說的話…（可不填）" style="display:none;width:100%;box-sizing:border-box;margin:2px 0 8px;padding:9px 12px;border:1px solid rgba(70,179,119,0.4);border-radius:12px;font-size:13px;color:#2E7D4F;font-family:inherit;resize:none;"></textarea>' +
        '<div style="border-top:1px dashed rgba(90,62,10,0.18);margin:12px 0 10px;"></div>' +
        '<div style="text-align:center;font-size:13px;color:#5A3E0A;margin-bottom:9px;">沒關係～你也可以先看看課程喔 😊</div>' +
        '<button id="tf-xs-book" style="display:flex;align-items:center;justify-content:center;gap:7px;width:100%;background:#C8973A;color:#FBF5E7;border:none;border-radius:12px;padding:11px;font-size:15px;font-weight:800;cursor:pointer;">免費體驗課</button>' +
      '</div>';
    document.body.appendChild(wrap);
    wrap.querySelector('#tf-xs-close').onclick = function () { finishExitSurvey(null); };
    wrap.addEventListener('click', function (e) { if (e.target === wrap) finishExitSurvey(null); });
    wrap.querySelector('#tf-xs-book').onclick = function () {
      try { window.gtag('event', 'book_trial_click', { from: 'exit_survey' }); } catch (e) {}
      finishExitSurvey('book_trial');
      if (typeof window.openModal === 'function') window.openModal('modal-line-qr');
    };
    [].forEach.call(wrap.querySelectorAll('.tf-xs-opt'), function (b) {
      b.onclick = function () {
        var v = b.getAttribute('data-v');
        if (v === 'other') {
          var ta = wrap.querySelector('#tf-xs-text');
          ta.style.display = 'block'; ta.focus();
          b.textContent = '送出 →'; b.style.background = '#CDEBD6';
          b.onclick = function () { finishExitSurvey('other:' + (ta.value || '').slice(0, 200)); };
        } else { finishExitSurvey(v); }
      };
    });
  }

  // ══ Exit survey แถบล่าง (ไม่เต็มจอ) — desktop จับเมาส์ออกขอบบน / มือถือ idle 45 วิ → GA4 + เมล Lin  LIN 2026-07-05 ══
  var PUBLIC_W3F_KEY = 'b3bfdb97-19dd-4910-bd15-89720be846c2';   // public submit-only key (โชว์ในเว็บได้)
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
    if (currentUser || leadCaptured() || exitSurveyShown) return;   // ล็อกอิน/ให้อีเมล/เคยเห็นแล้ว = ไม่กวน
    if (gateOpen) return;                                           // กำแพงล็อกอินเปิดอยู่ = ไม่เด้งทับ
    try { if (typeof anyModalOpen === 'function' && anyModalOpen()) return; } catch (e) {}   // มี modal เปิด = ไม่เด้งทับ
    showExitBar(trigger);
  }
  function showExitBar(trigger) {
    exitSurveyShown = true;   // flag เดียวกับ popup กำแพง → โชว์แค่อันเดียวต่อ session ไม่ซ้อน
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

  // ── API ให้หน้าเกมเรียกตอนจะเริ่มเล่นจริง ───────────────────
  // ใช้: if (window.TF_AUTH && !window.TF_AUTH.ensureLogin()) return;
  window.TF_AUTH = {
    loggedIn: function () { return !!currentUser; },
    hasAccess: function () { return !!currentUser || leadCaptured(); },   // ล็อกอินแล้ว หรือให้อีเมลแล้ว = เล่นต่อได้
    requireLogin: requireLogin,
    ensureLogin: function () {
      if (!requireLogin || currentUser || leadCaptured()) return true;
      showGate();
      return false;
    },
    showGate: showGate,
    hideGate: hideGate,
    // เฟส 2: sync บัญชีดาว/streak ขึ้น Supabase (เรียกจากหน้าเกมหลังเล่นจบ)
    syncAccount: function () { try { if (currentUser && window.GAME_ACCOUNT && GAME_ACCOUNT.sync) GAME_ACCOUNT.sync(sb, currentUser.id); } catch (e) {} }
  };

  // กด Esc → น้องมีนาเด้งถามก่อนปิด
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && gateOpen) requestCloseGate();
  });

  function boot() {
    render();

    // ── session/badge กลาง: ใช้ window.SITE_AUTH (auth-widget.js) ถ้ามี ──
    // กัน currentUser/listener แยกกันหลายจุด — ทุกหน้าที่โหลด auth-widget.js เห็น session เดียวกัน
    // มี fallback เผื่อ auth-widget.js โหลดไม่ทัน/พลาด (เกมยังเล่นได้ปกติ แค่ badge จะไม่โชว์) LIN 2026-07-03
    if (window.SITE_AUTH) {
      SITE_AUTH.renderBadge('tf-login-slot', { leaderboardHref: 'leaderboard.html', progressHref: 'my-progress.html' });
      SITE_AUTH.onChange(function (user) {
        currentUser = user;
        authResolved = true;
        render();
        if (currentUser && lastSession) saveSession(lastSession);   // คะแนนค้างจากก่อนล็อกอิน → บันทึกย้อนหลัง
        try { if (currentUser && window.GAME_ACCOUNT && GAME_ACCOUNT.sync) GAME_ACCOUNT.sync(sb, currentUser.id); } catch (e) {}   // เฟส 2: sync ดาว/streak ข้ามเครื่อง
      });
    } else {
      sb.auth.getSession().then(function (res) {
        currentUser = (res.data && res.data.session && res.data.session.user) || null;
        authResolved = true;
        render();
        if (currentUser && lastSession) saveSession(lastSession);
        try { if (currentUser && window.GAME_ACCOUNT && GAME_ACCOUNT.sync) GAME_ACCOUNT.sync(sb, currentUser.id); } catch (e) {}
      });
      sb.auth.onAuthStateChange(function (_event, session) {
        currentUser = (session && session.user) || null;
        authResolved = true;
        render();
        if (currentUser && lastSession) saveSession(lastSession);
        try { if (currentUser && window.GAME_ACCOUNT && GAME_ACCOUNT.sync) GAME_ACCOUNT.sync(sb, currentUser.id); } catch (e) {}
      });
    }
    // เฝ้าการเปิด/ปิด modal → ซ่อน/โชว์ปุ่ม 登入 ให้ถูก (กันทับปุ่มกากบาท) ครอบทุกวิธีปิด
    try {
      var _modalState = anyModalOpen();
      var _mo = new MutationObserver(function () {
        var s = anyModalOpen();
        if (s !== _modalState) { _modalState = s; render(); }
      });
      _mo.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'] });
    } catch (e) {}
    setupExitTriggers();   // เปิดตัวจับ exit-intent (desktop) + idle (มือถือ)
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
