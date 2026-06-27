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
        '<a href="reading-board.html" title="排行榜" style="text-decoration:none;font-size:13px;">🏆</a>' +
        '<button id="rg-logout" style="border:none;background:rgba(139,99,16,0.12);color:#8B6310;' +
        'border-radius:20px;padding:3px 10px;cursor:pointer;font-size:11.5px;font-weight:700;font-family:\'Noto Sans TC\',sans-serif;">登出</button>' +
        '</div>';
      var lo = document.getElementById('rg-logout');
      if (lo) lo.onclick = function () { try { sb.auth.signOut().then(function () { setUser(null); }); } catch (e) {} };
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

  function doLogin() {
    if (isInApp()) {
      alert('在 App 內請至「聲調遊戲」用 Email 登入連結登入，登入後回來即可（同一帳號）');
      location.href = 'tone-finder.html';
      return;
    }
    try { sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.href } }); }
    catch (e) { location.href = 'tone-finder.html'; }
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
