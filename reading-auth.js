// ============================================================
// reading-auth.js — ล็อกอิน + เซฟแต้มเกมอ่าน (ลีกรายสัปดาห์)
// ใช้ session ร่วมกับเกมเสียง (same-origin) → ล็อกอินที่เกมไหนก็รู้จักกัน
// guard เต็ม: ถ้า Supabase/ตารางยังไม่พร้อม → เกมเล่นได้ปกติ ไม่พัง
// ต้องโหลดหลัง: supabase-js CDN, supabase-config.js, game-account.js
// Lin 2026-06-27
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

  function slot() { return document.getElementById('rg-login-slot'); }
  function isInApp() { return /FBAN|FBAV|Instagram|Line|Messenger/i.test(navigator.userAgent || ''); }

  function render() {
    var el = slot(); if (!el) return;
    if (API.user) {
      el.innerHTML = '<span style="font-size:12.5px;color:#5a3e10;">🏆 已登入 · ' +
        '<a href="reading-board.html" style="color:#8b6310;font-weight:700;">排行榜</a> · ' +
        '<a href="javascript:void(0)" id="rg-logout" style="color:#a08050;">登出</a></span>';
      var lo = document.getElementById('rg-logout');
      if (lo) lo.onclick = function () { try { sb.auth.signOut().then(function () { setUser(null); }); } catch (e) {} };
    } else {
      el.innerHTML = '<button id="rg-login-btn" style="background:linear-gradient(135deg,#8B6310,#C8973A);color:#fff;border:none;border-radius:20px;padding:6px 16px;cursor:pointer;font-size:12.5px;font-weight:700;font-family:\'Noto Sans TC\',sans-serif;">🔑 登入排行榜</button>';
      var b = document.getElementById('rg-login-btn');
      if (b) b.onclick = doLogin;
    }
  }

  function doLogin() {
    if (isInApp()) {
      alert('在 App 內請至「聲調遊戲」用 Email 驗證碼登入，登入後回來即可（同一帳號）');
      location.href = 'tone-finder.html';
      return;
    }
    try { sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.href } }); }
    catch (e) { location.href = 'tone-finder.html'; }
  }

  function setUser(u) {
    API.user = u || null;
    render();
    if (API.user && window.GAME_ACCOUNT && GAME_ACCOUNT.sync) {
      try { GAME_ACCOUNT.sync(sb, API.user.id); } catch (e) {}
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
