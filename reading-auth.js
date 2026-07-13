// ============================================================
// reading-auth.js — ล็อกอิน + เซฟแต้มเกมอ่าน/เกมพิมพ์/เกมเรียงประโยค (ลีกรายสัปดาห์)
// ใช้ session ร่วมกับเกมเสียง (same-origin) → ล็อกอินที่เกมไหนก็รู้จักกัน
// guard เต็ม: ถ้า Supabase/ตารางยังไม่พร้อม → เกมเล่นได้ปกติ ไม่พัง
// ต้องโหลดหลัง: supabase-js CDN, supabase-config.js, game-account.js, auth-widget.js
// Lin 2026-06-27 (v2: badge เหมือนเกมเสียง + ปุ่ม 登入保存分數)
// Lin 2026-07-02 (v3: แยกเกม reading/typing + กัน email แอดมิน + retry ถ้าคอลัมน์ game ยังไม่มี)
// Lin 2026-07-03 (v4: badge (ชื่อ/✏️/🏆/📊/登出) เปลี่ยนไปใช้ window.SITE_AUTH ตัวกลาง
//   — เดิมมี client + session listener แยกของตัวเอง + editor เป็น prompt() ธรรมดา
//   ตอนนี้ใช้ client เดียว + editor แบบเดียวกับทุกหน้า (มีรูป/แบดจ์/sync ข้ามหน้า)
//   มี fallback: ถ้า SITE_AUTH โหลดไม่ทัน ยังมี client+listener สำรองของตัวเอง เกมไม่พัง)
// ============================================================
(function () {
  var cfg = window.SUPABASE_CONFIG || {};
  var ready = cfg.url && cfg.anonKey &&
              cfg.url.indexOf('YOUR_') === -1 && cfg.anonKey.indexOf('YOUR_') === -1 &&
              window.supabase && window.supabase.createClient;

  // ถ้า Supabase ไม่พร้อม → คืน API เปล่า (เกมยังเล่นได้)
  if (!ready) { window.READING_AUTH = { ready: false, user: null, saveScore: function () {}, render: function () {} }; return; }

  var sb = window.getSupabaseClient ? window.getSupabaseClient() : window.supabase.createClient(cfg.url, cfg.anonKey);
  var API = { ready: true, user: null, saveScore: saveScore, render: render };
  window.READING_AUTH = API;

  function slot() { return document.getElementById('rg-login-slot'); }
  function isInApp() { return /FBAN|FBAV|Instagram|Line|Messenger/i.test(navigator.userAgent || ''); }
  function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

  // เกมของหน้าปัจจุบัน — ใช้ตัดสินใจว่า 🏆 ต้องพาไปกระดานไหน + บันทึกคะแนนเป็นเกมอะไร
  // v4 (LIN 2026-07-03): เพิ่ม 'word_order' (เกมเรียงประโยค/語序遊戲) — เดิมมีแค่ typing/reading
  // v5 (LIN 2026-07-03): เพิ่ม 'lego' (造句遊戲/樂高式造句) — เกมนี้กับ word_order เป็นคนละเกม ห้ามใช้ key เดียวกัน
  function pageGame() {
    var p = location.pathname || '';
    if (/typing-game/i.test(p)) return 'typing';
    if (/word-order/i.test(p)) return 'word_order';
    if (/lego/i.test(p)) return 'lego';
    return 'reading';
  }
  function boardHref() {
    var g = pageGame();
    if (g === 'typing') return 'typing-board.html';
    if (g === 'word_order') return 'word-order-board.html';
    if (g === 'lego') return 'lego-board.html';
    return 'reading-board.html';
  }

  // ── badge (ล็อกอินแล้ว): ให้ window.SITE_AUTH (auth-widget.js) วาดให้ — เหมือนกับทุกหน้า ──
  // ── ยังไม่ล็อกอิน: ปุ่ม "🔑 登入保存分數" ของหน้านี้เอง (เปิด modal OTP/Google ด้านล่าง) ──
  function render() {
    var el = slot(); if (!el) return;
    if (API.user) {
      // ล้างปุ่ม "🔑 登入保存分數" เดิม (ถ้ายังค้างจากตอนยังไม่ล็อกอิน) ก่อน — เหลือแค่ badge ของ SITE_AUTH
      // (กันโชว์ซ้อนกันสองอัน: ปุ่มเดิม + badge ใหม่) LIN 2026-07-03
      Array.prototype.slice.call(el.children).forEach(function (child) {
        if (child.id !== 'sa-badge-rg-login-slot') child.remove();
      });
      if (window.SITE_AUTH && window.SITE_AUTH.ready) {
        window.SITE_AUTH.renderBadge('rg-login-slot', { leaderboardHref: boardHref(), progressHref: 'my-progress.html' });
      }
    } else {
      // v2 (Lin 2026-07-10): หน้าเกม (reading/typing/word-order/lego) มีแบนเนอร์เหลือง "先玩玩看...登入解鎖"
      // อยู่เหนือแถบนี้แล้ว ซึ่งกดแล้ว proxy-click ปุ่มนี้อยู่ดี (ดู rgCtaLogin/woCtaLogin/legoCtaLogin)
      // → โชว์ปุ่มนี้ซ้ำสองอันดูรก จึงซ่อนด้วย display:none แต่ยังคงอยู่ใน DOM ให้ปุ่มแบนเนอร์กดผ่านได้เหมือนเดิม
      // หน้าที่ไม่มีแบนเนอร์เหลือง (เช่น tone-finder) จะไม่โดนผลกระทบ เพราะปุ่มนี้จะเป็นทางเข้าล็อกอินเดียวอยู่แล้ว
      var hideDup = !!document.getElementById('rg-cta-login');
      el.innerHTML =
        '<button id="rg-login-btn" style="display:' + (hideDup ? 'none' : 'flex') + ';align-items:center;gap:6px;' +
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

  function setUser(u) {
    API.user = u || null;
    if (API.user) closeGate();   // เพิ่งล็อกอินสำเร็จ → ปิด modal
    render();
    // Lin 2026-07-12: auth เพิ่งเสร็จ/เปลี่ยน (getSession เป็น async) → สั่งเกม re-render แถบชวนล็อกอิน "登入解鎖"
    // แก้บั๊ก: ตอนโหลดหน้า auth ยังไม่เสร็จ การ์ดเลยโชว์ค้าง ทั้งที่จริงล็อกอินอยู่ (ผู้เล่นนึกว่าต้องล็อกอินใหม่ทุกครั้ง)
    ['rgRenderGameBar','legoRenderGameBar','woRerenderBar'].forEach(function(fn){ if(typeof window[fn]==='function'){ try{ window[fn](); }catch(e){} } });
    if (API.user && window.GAME_ACCOUNT && GAME_ACCOUNT.sync) {
      try { GAME_ACCOUNT.sync(sb, API.user.id); } catch (e) {}
    }
    loadAdaptiveHistory(); // 2026-07-13 Lin：ล็อกอิน/สลับบัญชี → โหลดประวัติคำพลาดของเกมนี้ใหม่
  }

  // ── ฝึกจุดอ่อนอัตโนมัติ (75/25) — ก็อปแนวคิดจาก adaptive.js ของเกมเสียง มาใช้กับอ่าน/พิมพ์/เรียงคำ/ต่อประโยค ──
  // ดึงจาก reading_sessions.wrong_items เฉพาะเกมปัจจุบัน (แยกกันเป็นเกม ๆ ไป ไม่ปนกัน)
  var ADAPTIVE_RATIO = 0.75;      // 75% คำ/ประโยคที่ยังไม่เคยพลาด (หรือพลาดน้อย) 25% คำที่พลาดบ่อย
  var ADAPTIVE_HISTORY_LIMIT = 50;
  var adaptiveWrongCounts = {};   // { th: จำนวนครั้งที่พลาด }
  var adaptiveLoaded = false;

  // 2026-07-13 Lin: เพิ่ม fallback กันคอลัมน์ game/wrong_items ยังไม่มีใน Supabase (รอรัน SQL migration)
  // เดิม: ถ้า SELECT error (เช่น column game does not exist, HTTP 400) โค้ดเก่ายังตั้ง adaptiveLoaded = true
  // ทั้งที่ไม่ได้ข้อมูลจริงเลย (บั๊ก) — ตอนนี้แยก apply()/disable() ให้ error จริงไม่ทำให้เข้าใจผิดว่าพร้อมใช้
  // จงใจไม่ fallback ไปคิวรีแบบไม่กรอง game (จะผสมคำผิดข้ามเกม ความหมายผิด) — ปิดฟีเจอร์ทบทวนไปก่อนจนกว่าจะมีคอลัมน์ครบ
  function loadAdaptiveHistory() {
    if (!API.user) { adaptiveLoaded = false; adaptiveWrongCounts = {}; return; }
    function apply(res) {
      adaptiveWrongCounts = {};
      if (res && res.data) {
        res.data.forEach(function (row) {
          (row.wrong_items || []).forEach(function (w) {
            var key = w && w.th; if (!key) return;
            adaptiveWrongCounts[key] = (adaptiveWrongCounts[key] || 0) + (w.wrong || 1);
          });
        });
      }
      adaptiveLoaded = true;
    }
    function disable(msg) {
      console.warn('[adaptive] history not available yet:', msg);
      adaptiveLoaded = false;
      adaptiveWrongCounts = {};
    }
    sb.from('reading_sessions')
      .select('wrong_items')
      .eq('user_id', API.user.id)
      .eq('game', pageGame())
      .order('created_at', { ascending: false })
      .limit(ADAPTIVE_HISTORY_LIMIT)
      .then(function (res) {
        if (res && !res.error) { apply(res); }
        else { disable(res && res.error && res.error.message || 'unknown error'); }
      }, function (e) { disable(e && e.message || 'เครือข่ายผิดพลาด'); });
  }
  function rgShuffle(a) {
    a = a.slice();
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }
  function rgSample(arr, n) { return rgShuffle(arr).slice(0, n); }
  // pool = array ของ item ที่มี .th (คำ/ประโยค) — คืน array ของ item ที่เลือกแล้ว (ไม่ใช่แค่ index)
  API.adaptiveReady = function () { return adaptiveLoaded && Object.keys(adaptiveWrongCounts).length > 0; };
  API.pickAdaptive = function (pool, n) {
    pool = (pool || []).slice();
    n = n || pool.length;
    if (pool.length <= n || !API.adaptiveReady()) return rgSample(pool, n);
    var weak = pool.filter(function (w) { return w && w.th && adaptiveWrongCounts[w.th]; })
                   .sort(function (a, b) { return (adaptiveWrongCounts[b.th] || 0) - (adaptiveWrongCounts[a.th] || 0); });
    var strong = pool.filter(function (w) { return !(w && w.th && adaptiveWrongCounts[w.th]); });
    var nWeak = Math.min(weak.length, Math.round(n * (1 - ADAPTIVE_RATIO)));
    var nStrong = n - nWeak;
    var res = rgSample(weak, nWeak).concat(rgSample(strong, nStrong));
    if (res.length < n) {
      var rest = pool.filter(function (w) { return res.indexOf(w) < 0; });
      res = res.concat(rgSample(rest, n - res.length));
    }
    return rgShuffle(res).slice(0, n);
  };

  // ── เซฟแต้มรอบนี้ขึ้นลีก (เฉพาะตอนล็อกอิน) + sync ดาว/streak ──
  // v3 (LIN 2026-07-02): ระบุเกม 'reading'/'typing' ต่อแถว · กัน email แอดมิน ·
  // ถ้าคอลัมน์ game ยังไม่ถูกสร้างใน Supabase → ลองเซฟใหม่แบบไม่มี game (พฤติกรรมเดิม)
  // RELIABILITY: โชว์ผลจริงเสมอ (toast) — สำเร็จจริงค่อยขึ้น ✅, พังต้องเตือน ห้ามเงียบ
  var ADMIN_EMAIL = 'mr.taihualin@gmail.com';

  function saveToast(msg, ok) {
    try {
      var old = document.getElementById('rg-score-toast');
      if (old) old.remove();
      var d = document.createElement('div');
      d.id = 'rg-score-toast';
      d.style.cssText = 'position:fixed;bottom:90px;left:50%;transform:translateX(-50%);z-index:99999;' +
        'background:' + (ok ? '#2d7a2d' : '#8b2020') + ';color:#fff;border-radius:20px;' +
        'padding:8px 18px;font-size:13px;font-family:"Noto Sans TC",sans-serif;' +
        'box-shadow:0 4px 16px rgba(0,0,0,0.25);white-space:nowrap;pointer-events:none;';
      d.textContent = msg;
      document.body.appendChild(d);
      setTimeout(function () { if (d.parentNode) d.remove(); }, 3500);
    } catch (e) {}
  }

  // error จาก PostgREST ที่แปลว่า "คอลัมน์ game ยังไม่มีใน schema" — จับกว้างไว้ก่อน
  function isMissingColumn(err, colName) {
    if (!err) return false;
    if (err.code === 'PGRST204') return true; // Could not find the column ... in the schema cache
    var m = String(err.message || '');
    return new RegExp(colName, 'i').test(m) && /(column|schema|cache|find)/i.test(m);
  }
  function isMissingGameColumn(err) { return isMissingColumn(err, 'game'); }

  // 2026-07-13 Lin：เพิ่ม wrongItems (4th param) — เก็บคำ/ประโยคที่พลาดในรอบนั้น (เหมือน tone_sessions.wrong_words)
  // ใช้เป็นฐานข้อมูลจุดอ่อนให้เกมอ่าน/พิมพ์/เรียงคำ/ต่อประโยค — เดิมมีแค่คะแนน ไม่มีรายละเอียดคำผิด
  // ต้องรัน SQL เพิ่มคอลัมน์ wrong_items ก่อน (ไฟล์ SQL แยก) — ถ้ายังไม่รัน จะ fallback เซฟแบบไม่มีคอลัมน์นี้ ให้คะแนนไม่หาย
  function saveScore(score, games, game, wrongItems) {
    if (!API.user) return; // ยังไม่ล็อกอิน → ไม่เซฟ (ไม่มีคิวค้าง — GA4 ยังนับภาพรวมให้)
    if ((API.user.email || '').toLowerCase() === ADMIN_EMAIL) {
      console.info('[board] admin account — score not saved (excluded from leaderboard)');
      return;
    }
    var gm = (game === 'typing' || game === 'reading' || game === 'word_order' || game === 'lego') ? game : pageGame();
    var base = { user_id: API.user.id, score: (score || 0) | 0, games: (games || 1) | 0 };
    var withGame = { user_id: base.user_id, score: base.score, games: base.games, game: gm };
    var full = { user_id: withGame.user_id, score: withGame.score, games: withGame.games, game: withGame.game, wrong_items: Array.isArray(wrongItems) ? wrongItems : [] };
    function onFail(msg) {
      console.warn('[board] save failed:', msg);
      saveToast('⚠️ 分數儲存失敗：' + msg, false);
      try { if (window.gtag) gtag('event', 'score_save_fail', { reason: String(msg).slice(0, 90), game: gm }); } catch (e) {}
    }
    try {
      sb.from('reading_sessions').insert(full).then(function (res) {
        if (!res.error) { saveToast('✅ 分數已儲存 +' + base.score + ' 分', true); return; }
        if (isMissingColumn(res.error, 'wrong_items')) {
          // Lin ยังไม่รัน SQL เพิ่มคอลัมน์ wrong_items → เซฟแบบเดิม (ไม่มี wrong_items) ให้คะแนนไม่หาย
          console.warn('[board] wrong_items column not ready — saved without it');
          sb.from('reading_sessions').insert(withGame).then(function (res2) {
            if (!res2.error) { saveToast('✅ 分數已儲存 +' + base.score + ' 分', true); return; }
            if (isMissingGameColumn(res2.error)) {
              console.warn('[board] game column not ready — saved without game');
              sb.from('reading_sessions').insert(base).then(function (res3) {
                if (res3.error) onFail(res3.error.message);
                else saveToast('✅ 分數已儲存 +' + base.score + ' 分', true);
              }, function (e3) { onFail(e3 && e3.message || '網路錯誤'); });
            } else onFail(res2.error.message);
          }, function (e2) { onFail(e2 && e2.message || '網路錯誤'); });
        } else if (isMissingGameColumn(res.error)) {
          console.warn('[board] game column not ready — saved without game');
          sb.from('reading_sessions').insert(base).then(function (res2) {
            if (res2.error) onFail(res2.error.message);
            else saveToast('✅ 分數已儲存 +' + base.score + ' 分', true);
          }, function (e2) { onFail(e2 && e2.message || '網路錯誤'); });
        } else onFail(res.error.message);
      }, function (e) { onFail(e && e.message || '網路錯誤'); });
    } catch (e) { onFail(e && e.message || String(e)); }
    if (window.GAME_ACCOUNT && GAME_ACCOUNT.sync) { try { GAME_ACCOUNT.sync(sb, API.user.id); } catch (e) {} }
  }

  // ── session กลาง: ใช้ window.SITE_AUTH (auth-widget.js) ถ้ามี — client เดียวกับทุกหน้า ──
  // มี fallback (client+listener ของตัวเอง) เผื่อ auth-widget.js โหลดไม่ทัน/พลาด กันเกมพัง LIN 2026-07-03
  try {
    if (window.SITE_AUTH) {
      window.SITE_AUTH.onChange(setUser);
    } else {
      sb.auth.getSession().then(function (r) { setUser(r && r.data && r.data.session && r.data.session.user); }, function () {});
      sb.auth.onAuthStateChange(function (_e, s) { setUser(s && s.user); });
    }
  } catch (e) {}
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render); else render();
})();
