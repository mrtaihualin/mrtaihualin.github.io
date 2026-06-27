// ============================================================
// reading-auth.js — ล็อกอิน + เซฟแต้มเกมอ่าน (ลีกรายสัปดาห์)
// ใช้ session ร่วมกับเกมเสียง (same-origin) → ล็อกอินที่เกมไหนก็รู้จักกัน
// guard เต็ม: ถ้า Supabase/ตารางยังไม่พร้อม → เกมเล่นได้ปกติ ไม่พัง
// ต้องโหลดหลัง: supabase-js CDN, supabase-config.js, game-account.js
// Lin 2026-06-27 (v2: badge เหมือนเกมเสียง + ปุ่ม 登入保存分數)
// ============================================================
(function () {
  var cfg = window.SUPABASE_CONFIG || {};
  var ready = cfg.url && cfg.anonKey &&
              cfg.url.indexOf('YOUR_') === -1 && cfg.anonKey.indexOf('YOUR_') === -1 &&
              window.supabase && window.supabase.createClient;

  // ถ้า Supabase ไม่พร้อม → คืน API เปล่า (เกมยังเล่นได้)
  if (!ready) { window.READING_AUTH = { ready: false, user: null, saveScore: function () {}, render: function () {} }; return; }

  var sb = window.supabase.createClient(cfg.url, cfg.anonKey);
  var API = { ready: true, user: null, saveScore: saveScore, render: render };
  window.READING_AUTH = API;

  var _nick = null;

  function slot() { return document.getElementById('rg-login-slot'); }
  function isInApp() { return /FBAN|FBAV|Instagram|Line|Messenger/i.test(navigator.userAgent || ''); }
  function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

  function render() {
    var el = slot(); if (!el) return;
    if (API.user) {
      var displayName = _nick || (API.user.email || '').split('@')[0] || '玩家';
      el.innerHTML =
        '<div style="display:flex;align-items:center;gap:7px;background:#fff;' +
        'border:1.5px solid rgba(200,151,58,0.45);border-radius:20px;padding:5px 12px 5px 10px;' +
        'box-shadow:0 2px 8px rgba(139,99,16,0.12);font-family:\'Noto Sans TC\',sans-serif;">' +
        '<span style="font-size:15px;flex-shrink:0;">👤</span>' +
        '<span style="color:#5C4410;font-weight:700;font-size:12.5px;max-width:90px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + esc(displayName) + '</span>' +
        '<button id="rg-edit-nick" title="編輯名稱" style="border:none;background:none;color:#A07A1E;cursor:pointer;font-size:12px;padding:0;line-height:1;">✏️</button>' +
        '<a href="reading-board.html" title="排行榜" style="text-decoration:none;font-size:13px;">🏆</a>' +
        '<a href="my-progress.html" title="進度" style="text-decoration:none;font-size:13px;">📊</a>' +
        '<button id="rg-logout" style="border:none;background:rgba(139,99,16,0.12);color:#8B6310;' +
        'border-radius:20px;padding:3px 10px;cursor:pointer;font-size:11.5px;font-weight:700;font-family:\'Noto Sans TC\',sans-serif;">登出</button>' +
        '</div>';
      var lo = document.getElementById('rg-logout');
      if (lo) lo.onclick = function () { try { sb.auth.signOut().then(function () { setUser(null); }); } catch (e) {} };
      var en = document.getElementById('rg-edit-nick');
      if (en) en.onclick = function () {
        var n = prompt('輸入顯示名稱（會出現在排行榜）', _nick || '');
        if (n === null) return;
        n = n.trim().slice(0, 20);
        if (!n) return;
        _nick = n; render();
        try { sb.from('profiles').upsert({ id: API.user.id, nickname: n }, { onConflict: 'id' }).then(function(){},function(){}); } catch(e){}
      };
    } else {
      el.innerHTML =
        '<button id="rg-login-btn" style="display:flex;align-items:center;gap:6px;' +
        'background:linear-gradient(135deg,#8B6310,#C8973A);color:#fff;border:none;border-radius:20px;' +
        'padding:6px 16px;cursor:pointer;font-size:12.5px;font-weight:700;font-family:\'Noto Sans TC\',sans-serif;' +
        'box-shadow:0 2px 8px rgba(139,99,16,0.28);letter-spacing:0.3px;transition:filter .15s;"' +
        ' onmouseover="this.style.filter=\'brightness(1.1)\'" onmouseout="this.style.filter=\'none\'">🔑 登入保存分數</button>';
      var b = document.getElementById('rg-login-btn');
      if (b) b.onclick = doLogin;
    }
  }

  // ── modal ล็อกอิน: Email OTP รหัส 6–10 หลัก + Google (เหมือนเกมเสียง) LIN 2026-06-27 ──
  var rgGate = null, otpEmail = '', otpCooldown = 0, otpTimer = null;

  function doLogin() { openGate(); }

  function openGate() {
    if (API.user) return;
    if (!rgGate) buildGate(); else renderGate();
    rgGate.style.display = 'flex';
  }
  function closeGate() {
    if (rgGate) rgGate.style.display = 'none';
    if (otpTimer) { clearInterval(otpTimer); otpTimer = null; }
  }
  function buildGate() {
    rgGate = document.createElement('div');
    rgGate.id = 'rg-gate';
    rgGate.style.cssText =
      'position:fixed;inset:0;z-index:100000;display:none;align-items:center;justify-content:center;padding:20px;' +
      'background:rgba(28,18,4,0.82);backdrop-filter:blur(5px);-webkit-backdrop-filter:blur(5px);' +
      'font-family:"Noto Sans TC","Noto Sans Thai",sans-serif;';
    document.body.appendChild(rgGate);
    rgGate.addEventListener('click', function (e) { if (e.target === rgGate) closeGate(); });
    renderGate();
  }
  function renderGate() {
    if (!rgGate) return;
    var inApp = isInApp();
    var googleBtn = '<button id="rg-g" style="width:100%;display:flex;align-items:center;justify-content:center;gap:10px;border:1px solid #dadce0;background:#fff;color:#3c4043;border-radius:10px;padding:12px;cursor:pointer;font-size:15px;font-weight:600;box-shadow:0 1px 3px rgba(0,0,0,0.08);">' +
      '<svg width="18" height="18" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>使用 Google 登入</button>';
    rgGate.innerHTML =
      '<div style="position:relative;background:#fff;max-width:380px;width:100%;border-radius:18px;padding:30px 26px;box-shadow:0 18px 50px rgba(0,0,0,0.35);text-align:center;">' +
      '<button id="rg-x" aria-label="關閉" style="position:absolute;top:10px;right:12px;border:none;background:none;font-size:20px;line-height:1;color:#C3B594;cursor:pointer;">✕</button>' +
      '<div style="font-size:40px;line-height:1;margin-bottom:10px;">🏆</div>' +
      '<h2 style="margin:0 0 6px;font-size:20px;color:#5C4410;font-weight:800;">登入排行榜</h2>' +
      '<p style="margin:0 0 16px;font-size:14px;color:#8B7340;line-height:1.6;">登入後分數<b>同步保存</b>、上<b>排行榜</b>，換手機也記得你！</p>' +
      '<input id="rg-email" type="email" inputmode="email" autocomplete="email" placeholder="輸入 Email" style="width:100%;box-sizing:border-box;padding:12px 14px;border:1.5px solid #E5D9B8;border-radius:10px;font-size:15px;color:#5C4410;outline:none;">' +
      '<button id="rg-send" style="margin-top:10px;width:100%;border:none;background:#C8973A;color:#fff;border-radius:10px;padding:13px;cursor:pointer;font-size:16px;font-weight:800;">寄送驗證碼 →</button>' +
      '<div id="rg-step2" style="display:none;margin-top:12px;">' +
        '<input id="rg-code" inputmode="numeric" autocomplete="one-time-code" maxlength="10" placeholder="輸入信中的驗證碼" style="width:100%;box-sizing:border-box;padding:12px 14px;border:1.5px solid #E5D9B8;border-radius:10px;font-size:18px;letter-spacing:4px;text-align:center;color:#5C4410;outline:none;">' +
        '<button id="rg-verify" style="margin-top:10px;width:100%;border:none;background:#2E7D4F;color:#fff;border-radius:10px;padding:13px;cursor:pointer;font-size:16px;font-weight:800;">確認登入</button>' +
        '<button id="rg-resend" style="margin-top:8px;width:100%;border:1px solid #E5D9B8;background:#fff;color:#8B7340;border-radius:10px;padding:9px;cursor:pointer;font-size:13px;">重新寄送驗證碼</button>' +
      '</div>' +
      '<div id="rg-msg" style="display:none;font-size:12.5px;margin:10px 0 0;text-align:left;line-height:1.5;"></div>' +
      (inApp
        ? '<div style="margin-top:14px;background:#FBF0DA;border:1px solid #EAC36B;border-radius:12px;padding:10px 12px;font-size:12.5px;color:#8B6310;line-height:1.6;">📩 在 App 內就用上面的 <b>Email 驗證碼</b>登入即可（Google 在 App 內無法使用）</div>'
        : ('<div style="display:flex;align-items:center;gap:10px;margin:16px 0;color:#C3B594;font-size:12px;"><span style="flex:1;height:1px;background:#EADFBF;"></span>或<span style="flex:1;height:1px;background:#EADFBF;"></span></div>' + googleBtn)) +
      '<p style="margin:16px 0 0;font-size:12px;color:#A07A1E;">點擊空白處可先返回</p>' +
      '</div>';
    rgGate.querySelector('#rg-x').onclick = closeGate;
    var se = rgGate.querySelector('#rg-email');
    var sBtn = rgGate.querySelector('#rg-send');
    if (sBtn) sBtn.onclick = function () { startOtp(se.value, false); };
    if (se) se.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') startOtp(se.value, false); });
    var ci = rgGate.querySelector('#rg-code');
    var vBtn = rgGate.querySelector('#rg-verify');
    if (vBtn) vBtn.onclick = function () { verifyCode(ci.value); };
    if (ci) ci.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') verifyCode(ci.value); });
    var rBtn = rgGate.querySelector('#rg-resend');
    if (rBtn) rBtn.onclick = function () { if (otpCooldown <= 0) startOtp(otpEmail || se.value, true); };
    if (!inApp) { var g = rgGate.querySelector('#rg-g'); if (g) g.onclick = function () { try { sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.href } }); } catch (e) {} }; }
  }
  function setMsg(msg, isErr) {
    var el = rgGate && rgGate.querySelector('#rg-msg');
    if (!el) return;
    el.style.display = 'block';
    el.style.color = isErr ? '#C0392B' : '#8B7340';
    el.innerHTML = msg;
  }
  function startOtp(email, isResend) {
    email = (email || '').trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { setMsg('Email 格式不正確', true); return; }
    otpEmail = email;
    setMsg('寄送中…⏳', false);
    sb.auth.signInWithOtp({ email: email, options: { shouldCreateUser: true } })
      .then(function (res) {
        if (res.error) { setMsg('寄送失敗：' + res.error.message, true); return; }
        var step2 = rgGate.querySelector('#rg-step2'); if (step2) step2.style.display = 'block';
        var sBtn = rgGate.querySelector('#rg-send'); if (sBtn) sBtn.style.display = 'none';
        setMsg('驗證碼已寄到 ' + esc(email) + '，請查看信箱（含垃圾信匣）', false);
        var ci = rgGate.querySelector('#rg-code'); if (ci) ci.focus();
        startCooldown();
      });
  }
  function verifyCode(code) {
    code = (code || '').trim();
    if (!/^\d{6,10}$/.test(code)) { setMsg('請輸入信中的驗證碼（純數字）', true); return; }
    setMsg('驗證中…⏳', false);
    sb.auth.verifyOtp({ email: otpEmail, token: code, type: 'email' })
      .then(function (res) {
        if (res.error) { setMsg('驗證碼錯誤或已過期，請重新輸入', true); return; }
        // สำเร็จ → onAuthStateChange → setUser → closeGate ปิดให้เอง
      });
  }
  function startCooldown() {
    otpCooldown = 60;
    if (otpTimer) clearInterval(otpTimer);
    function tick() {
      var b = rgGate && rgGate.querySelector('#rg-resend');
      if (!b) { clearInterval(otpTimer); return; }
      if (otpCooldown > 0) { b.disabled = true; b.style.opacity = '0.5'; b.style.cursor = 'default'; b.textContent = '重新寄送 (' + otpCooldown + ')'; otpCooldown--; }
      else { clearInterval(otpTimer); otpTimer = null; b.disabled = false; b.style.opacity = '1'; b.style.cursor = 'pointer'; b.textContent = '重新寄送驗證碼'; }
    }
    tick();
    otpTimer = setInterval(tick, 1000);
  }

  function fetchNick(uid) {
    try {
      sb.from('profiles').select('nickname').eq('id', uid).single()
        .then(function (r) {
          if (r && r.data && r.data.nickname) { _nick = r.data.nickname; render(); }
        }, function () {});
    } catch (e) {}
  }

  function setUser(u) {
    API.user = u || null;
    _nick = null;
    render();
    if (API.user) {
      fetchNick(API.user.id);
      if (window.GAME_ACCOUNT && GAME_ACCOUNT.sync) {
        try { GAME_ACCOUNT.sync(sb, API.user.id); } catch (e) {}
      }
    }
  }

  // เซฟแต้มรอบนี้ขึ้นลีกเกมอ่าน (เฉพาะตอนล็อกอิน) + sync ดาว/streak
  function saveScore(score, games) {
    if (!API.user) return;
    try {
      sb.from('reading_sessions').insert({ user_id: API.user.id, score: (score || 0) | 0, games: (games || 1) | 0 })
        .then(function () {}, function () {});
    } catch (e) {}
    if (window.GAME_ACCOUNT && GAME_ACCOUNT.sync) { try { GAME_ACCOUNT.sync(sb, API.user.id); } catch (e) {} }
  }

  try {
    sb.auth.getSession().then(function (r) { setUser(r && r.data && r.data.session && r.data.session.user); }, function () {});
    sb.auth.onAuthStateChange(function (_e, s) { setUser(s && s.user); });
  } catch (e) {}
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render); else render();
})();
