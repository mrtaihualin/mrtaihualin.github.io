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

  // ── ตรวจเบราว์เซอร์ในแอป (Google ล็อกอินถูกบล็อกในเว็บวิวฝัง) LIN 2026-06-23 ──
  // FB/IG/Threads/TikTok/LINE/小紅書 = เว็บวิว → ซ่อนปุ่ม Google โชว์อีเมลแทน
  // YouTube/เบราว์เซอร์ปกติ = ไม่เข้าเงื่อนไข → โชว์ Google ได้
  function isInAppBrowser() {
    var ua = (navigator.userAgent || '') + ' ' + (navigator.vendor || '');
    return /FBAN|FBAV|FB_IAB|Instagram|Threads|musical_ly|Bytedance|TikTok|\bLine\/|MicroMessenger|XiaoHongShu|\bRedApp/i.test(ua);
  }

  // ── เก็บอีเมลแบบไม่ยืนยัน (frictionless) → ตาราง leads → เล่นต่อได้เลย LIN 2026-06-23 ──
  var LEAD_KEY = 'tf_lead_captured';
  function leadCaptured() { try { return localStorage.getItem(LEAD_KEY) === '1'; } catch (e) { return false; } }
  function markLeadCaptured() { try { localStorage.setItem(LEAD_KEY, '1'); } catch (e) {} }
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
      saveSession(params.score, params.total);
    }
  }

  var ADMIN_EMAIL = 'mr.taihualin@gmail.com';

  function saveSession(score, total) {
    if (!currentUser) return; // ยังไม่ล็อกอิน → ไม่บันทึก (GA4 ยังนับภาพรวมให้)
    if (currentUser.email === ADMIN_EMAIL) return; // admin: ไม่นับคะแนนใน ranking
    var row = {
      user_id: currentUser.id,
      mode: sessionMode,
      score: typeof score === 'number' ? score : null,
      total: typeof total === 'number' ? total : null,
      wrong_words: wrongBuffer.slice()
    };
    sb.from('tone_sessions').insert(row).then(function (res) {
      if (res.error) {
        console.warn('[tone-finder] บันทึกไม่สำเร็จ:', res.error.message);
        showScoreToast('⚠️ บันทึกคะแนนไม่สำเร็จ: ' + res.error.message, false);
      } else {
        console.info('[tone-finder] บันทึกผลแล้ว score=' + score);
        showScoreToast('✅ บันทึกคะแนน ' + (score || 0) + ' 分 สำเร็จ', true);
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

  function doLogout() {
    sb.auth.signOut().then(function () { currentUser = null; render(); });
  }

  // ── องค์ประกอบหน้าจอ ───────────────────────────────────────
  var gate, badge, miniBtn;

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

  function buildGate() {
    gate = document.createElement('div');
    gate.id = 'tf-gate';
    gate.style.cssText =
      'position:fixed;inset:0;z-index:100000;display:none;align-items:center;justify-content:center;padding:20px;' +
      'background:rgba(28,18,4,0.82);backdrop-filter:blur(5px);-webkit-backdrop-filter:blur(5px);' +
      'font-family:"Noto Sans TC","Noto Sans Thai",sans-serif;';
    var showGoogle = !isInAppBrowser();   // ในแอป FB/IG/TikTok → ซ่อน Google (กดไม่ได้)
    gate.innerHTML =
      '<div id="tf-gate-card" style="position:relative;background:#fff;max-width:380px;width:100%;border-radius:18px;padding:30px 26px;' +
      'box-shadow:0 18px 50px rgba(0,0,0,0.35);text-align:center;">' +
        '<button id="tf-gate-close" aria-label="ปิด / 關閉" style="position:absolute;top:10px;right:12px;border:none;background:none;' +
        'font-size:20px;line-height:1;color:#C3B594;cursor:pointer;">✕</button>' +
        '<div style="font-size:40px;line-height:1;margin-bottom:10px;">🎵</div>' +
        '<h2 style="margin:0 0 6px;font-size:20px;color:#5C4410;font-weight:800;">繼續玩，解鎖更多！🎉</h2>' +
        '<p style="margin:0 0 18px;font-size:14px;color:#8B7340;line-height:1.6;">免費試玩結束囉～輸入 Email 就能<b>繼續玩</b>、<b>把分數存起來</b>、上<b>排行榜</b>，還能解鎖徽章收藏！</p>' +
        '<input id="tf-email-input" type="email" inputmode="email" autocomplete="email" placeholder="輸入 Email" ' +
        'style="width:100%;box-sizing:border-box;padding:12px 14px;border:1.5px solid #E5D9B8;border-radius:10px;font-size:15px;color:#5C4410;outline:none;">' +
        '<div id="tf-email-err" style="display:none;color:#C0392B;font-size:12px;margin:6px 0 0;text-align:left;"></div>' +
        '<button id="tf-email-go" style="margin-top:12px;width:100%;border:none;background:#C8973A;color:#fff;' +
        'border-radius:10px;padding:13px;cursor:pointer;font-size:16px;font-weight:800;">繼續玩 →</button>' +
        (showGoogle
          ? ('<div style="display:flex;align-items:center;gap:10px;margin:16px 0;color:#C3B594;font-size:12px;">' +
             '<span style="flex:1;height:1px;background:#EADFBF;"></span>或<span style="flex:1;height:1px;background:#EADFBF;"></span></div>' +
             googleBtnHTML('tf-google'))
          : '') +
        '<p style="margin:16px 0 0;font-size:11px;color:#B0A080;line-height:1.5;">輸入 Email 代表同意<a href="terms.html" style="color:#A07A1E;">服務條款與資料收集</a>，我們只用來寄學習資訊與通知，不會外流</p>' +
        '<p style="margin:10px 0 0;font-size:12px;color:#A07A1E;">點擊空白處可先返回瀏覽</p>' +
      '</div>';
    document.body.appendChild(gate);
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
    if (showGoogle) { var _g = gate.querySelector('#tf-google'); if (_g) _g.onclick = doGoogleLogin; }
    gate.querySelector('#tf-gate-close').onclick = requestCloseGate;
    // กดพื้นที่ว่างรอบการ์ด (backdrop) → น้องมีนาเด้งถามก่อนปิด
    gate.addEventListener('click', function (e) { if (e.target === gate) requestCloseGate(); });
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

  // ── โปรไฟล์ผู้เล่น: ชื่อ+รูป+แบดจ์ เก็บใน profiles (sync ข้ามเครื่อง) + localStorage เป็นแคชสำรอง LIN 2026-06-22 ──
  var myNick = null, myAvatar = null, myBadge = null;
  var nickPromptedFor = null;
  var PRESET_AVATARS = ['🐘','🐱','🐶','🐰','🦊','🐼','🐯','🐸','🐥','🦉','🐲','🥭'];
  var AVATAR_KEY = 'tf_avatar', PIN_BADGE_KEY = 'tf_pinned_badge';
  function tfGetAvatar() { try { return localStorage.getItem(AVATAR_KEY) || ''; } catch (e) { return ''; } }
  function tfSetAvatar(v) { try { if (v) localStorage.setItem(AVATAR_KEY, v); else localStorage.removeItem(AVATAR_KEY); } catch (e) {} }
  function tfGetPinBadge() { try { return localStorage.getItem(PIN_BADGE_KEY) || ''; } catch (e) { return ''; } }
  function tfSetPinBadge(v) { try { if (v) localStorage.setItem(PIN_BADGE_KEY, v); else localStorage.removeItem(PIN_BADGE_KEY); } catch (e) {} }

  // ดึงโปรไฟล์จาก Supabase (ชื่อ/รูป/แบดจ์) — ถ้าคอลัมน์ avatar/badge_id ยังไม่ถูกเพิ่ม จะ fallback ใช้แคชในเครื่อง (เว็บไม่พัง)
  function fetchProfile() {
    if (!currentUser) { myNick = myAvatar = myBadge = null; return; }
    function afterProfile() {
      render();
      if (!myNick && currentUser.email !== ADMIN_EMAIL && nickPromptedFor !== currentUser.id) {
        nickPromptedFor = currentUser.id;
        setTimeout(openProfileEditor, 600);
      }
    }
    sb.from('profiles').select('nickname, avatar, badge_id').eq('user_id', currentUser.id).maybeSingle()
      .then(function (res) {
        if (res.error) {
          // คอลัมน์ avatar/badge_id ยังไม่มีใน Supabase → ใช้แค่ชื่อ + รูป/แบดจ์จากแคชเครื่อง
          sb.from('profiles').select('nickname').eq('user_id', currentUser.id).maybeSingle().then(function (r2) {
            myNick = (r2.data && r2.data.nickname) || null;
            myAvatar = tfGetAvatar() || null;
            myBadge = tfGetPinBadge() || null;
            afterProfile();
          });
          return;
        }
        var d = res.data || {};
        myNick = d.nickname || null;
        myAvatar = d.avatar || tfGetAvatar() || null;
        myBadge = d.badge_id || tfGetPinBadge() || null;
        if (d.avatar) tfSetAvatar(d.avatar);       // ซิงค์ลงแคชเครื่องนี้
        if (d.badge_id) tfSetPinBadge(d.badge_id);
        afterProfile();
      });
  }

  // ป๊อปอัปแก้โปรไฟล์: ชื่อ + รูปอิโมจิสำเร็จรูป + เลือกแบดจ์ที่ปลดล็อกแล้ว (sync ผ่าน profiles)
  var profileModal = null;
  function openProfileEditor() {
    if (!currentUser) return;
    var meta = currentUser.user_metadata || {};
    var curName = myNick || meta.full_name || meta.name || '';
    var selAvatar = myAvatar || tfGetAvatar() || 'none';   // ไม่ใช้รูป Google แล้ว (LIN 2026-06-22)
    var selBadge = myBadge || tfGetPinBadge();
    var data = (window.tfLoadBadges ? window.tfLoadBadges() : { unlocked: {} });
    var unlocked = data.unlocked || {};
    var defs = window.TF_BADGES_DEF || [];
    var unlockedDefs = defs.filter(function (b) { return unlocked[b.id]; });

    function avCell(val, inner, on) {
      return '<button class="tfp-av" data-v="' + esc(val) + '" style="width:46px;height:46px;border-radius:50%;display:flex;' +
        'align-items:center;justify-content:center;cursor:pointer;background:#FBF6EA;border:2px solid ' + (on ? '#C8973A' : 'transparent') + ';">' + inner + '</button>';
    }
    function bgCell(val, inner, label, on) {
      return '<button class="tfp-bg" data-v="' + esc(val) + '" title="' + esc(label || '') + '" style="min-width:46px;height:46px;padding:0 6px;' +
        'border-radius:12px;display:flex;align-items:center;justify-content:center;cursor:pointer;background:#FBF6EA;border:2px solid ' + (on ? '#C8973A' : 'transparent') + ';">' + inner + '</button>';
    }

    var avatarChoices = '';
    PRESET_AVATARS.forEach(function (em) { avatarChoices += avCell(em, '<span style="font-size:26px;">' + em + '</span>', selAvatar === em); });
    avatarChoices += avCell('none', '<span style="font-size:13px;color:#A07A1E;">無</span>', selAvatar === 'none');

    var badgeChoices;
    if (!unlockedDefs.length) {
      badgeChoices = '<div style="font-size:12.5px;color:#A07A1E;padding:6px 2px;line-height:1.6;">還沒有解鎖徽章～玩遊戲解鎖後就能選來展示 🎖️</div>';
    } else {
      badgeChoices = unlockedDefs.map(function (b) { return bgCell(b.id, window.tfBadgeIcon(b, 30), b.zh, selBadge === b.id); }).join('') +
        bgCell('', '<span style="font-size:13px;color:#A07A1E;">不顯示</span>', '', !selBadge);
    }

    if (profileModal) profileModal.remove();
    profileModal = document.createElement('div');
    profileModal.id = 'tf-profile-modal';
    profileModal.style.cssText = 'position:fixed;inset:0;z-index:100001;display:flex;align-items:center;justify-content:center;padding:18px;' +
      'background:rgba(28,18,4,0.82);backdrop-filter:blur(5px);-webkit-backdrop-filter:blur(5px);font-family:"Noto Sans TC",sans-serif;';
    profileModal.innerHTML =
      '<div style="background:#fff;max-width:360px;width:100%;border-radius:18px;padding:22px 20px 18px;box-shadow:0 18px 50px rgba(0,0,0,0.35);max-height:88vh;overflow:auto;">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">' +
          '<h2 style="margin:0;font-size:18px;color:#5C4410;font-weight:800;">編輯個人檔案</h2>' +
          '<button id="tfp-close" style="border:none;background:none;font-size:20px;color:#C3B594;cursor:pointer;line-height:1;">✕</button>' +
        '</div>' +
        '<label style="font-size:13px;color:#8B7340;font-weight:700;">名稱（會顯示在這裡和排行榜）</label>' +
        '<input id="tfp-name" maxlength="20" value="' + esc(curName) + '" placeholder="輸入暱稱（1–20 字）" ' +
          'style="width:100%;box-sizing:border-box;margin:6px 0 16px;padding:10px 12px;border:1.5px solid #E5D9B8;border-radius:10px;font-size:15px;color:#5C4410;">' +
        '<div style="font-size:13px;color:#8B7340;font-weight:700;margin-bottom:8px;">頭像</div>' +
        '<div id="tfp-avatars" style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px;">' + avatarChoices + '</div>' +
        '<div style="font-size:13px;color:#8B7340;font-weight:700;margin-bottom:8px;">展示徽章（顯示在名稱旁）</div>' +
        '<div id="tfp-badges" style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:18px;">' + badgeChoices + '</div>' +
        '<button id="tfp-save" style="width:100%;border:none;background:#C8973A;color:#fff;border-radius:10px;padding:12px;font-size:15px;font-weight:800;cursor:pointer;">儲存</button>' +
      '</div>';
    document.body.appendChild(profileModal);

    function closeModal() { if (profileModal) { profileModal.remove(); profileModal = null; } }
    profileModal.querySelector('#tfp-close').onclick = closeModal;
    profileModal.addEventListener('click', function (e) { if (e.target === profileModal) closeModal(); });
    [].forEach.call(profileModal.querySelectorAll('.tfp-av'), function (btn) {
      btn.onclick = function () {
        selAvatar = btn.getAttribute('data-v');
        [].forEach.call(profileModal.querySelectorAll('.tfp-av'), function (b) { b.style.borderColor = 'transparent'; });
        btn.style.borderColor = '#C8973A';
      };
    });
    [].forEach.call(profileModal.querySelectorAll('.tfp-bg'), function (btn) {
      btn.onclick = function () {
        selBadge = btn.getAttribute('data-v');
        [].forEach.call(profileModal.querySelectorAll('.tfp-bg'), function (b) { b.style.borderColor = 'transparent'; });
        btn.style.borderColor = '#C8973A';
      };
    });
    profileModal.querySelector('#tfp-save').onclick = function () {
      var nm = (profileModal.querySelector('#tfp-name').value || '').trim().slice(0, 20);
      // เซฟแคชเครื่องนี้เสมอ (ใช้ได้ทันทีแม้ Supabase ยังไม่เพิ่มคอลัมน์)
      tfSetAvatar(selAvatar); tfSetPinBadge(selBadge);
      myAvatar = selAvatar; myBadge = selBadge;
      var row = { user_id: currentUser.id, avatar: selAvatar, badge_id: selBadge };
      if (nm) { row.nickname = nm; myNick = nm; }
      sb.from('profiles').upsert(row, { onConflict: 'user_id' }).then(function (res) {
        // ถ้าคอลัมน์ avatar/badge_id ยังไม่มี → เซฟเฉพาะชื่อ (รูป/แบดจ์ยังอยู่ในแคชเครื่อง)
        if (res.error && nm) sb.from('profiles').upsert({ user_id: currentUser.id, nickname: nm }, { onConflict: 'user_id' });
        closeModal(); render();
      });
    };
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
      adminUnlockAll(email);
      // ชื่อ = ที่ตั้งเอง (profiles.nickname) → fallback ชื่อ Google/อีเมล · รูป+แบดจ์ จาก localStorage (LIN 2026-06-22)
      var meta = currentUser.user_metadata || {};
      var displayName = myNick || meta.full_name || meta.name || meta.user_name || email;
      // รูปโปรไฟล์: อิโมจิสำเร็จรูป (sync จาก profiles, fallback แคช) · 'none'/ยังไม่เลือก = ไม่มีรูป
      var selAvatar = myAvatar || tfGetAvatar();
      var avatarHTML = '';
      if (selAvatar && selAvatar !== 'none' && selAvatar !== 'google') {
        avatarHTML = '<span style="width:24px;height:24px;border-radius:50%;background:#FBF6EA;display:inline-flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0;">' + esc(selAvatar) + '</span>';
      }
      // แบดจ์ที่ปักหมุด — โชว์ข้างชื่อ (เลือกได้เฉพาะที่ปลดล็อกแล้วตอนเลือก จึงไว้ใจค่า sync ได้)
      var pinHTML = '';
      var pin = myBadge || tfGetPinBadge();
      if (pin && window.TF_BADGES_DEF) {
        var bdef = null;
        window.TF_BADGES_DEF.forEach(function (b) { if (b.id === pin) bdef = b; });
        if (bdef) pinHTML = '<span title="' + esc(bdef.zh) + '" style="display:inline-flex;align-items:center;flex-shrink:0;">' + window.tfBadgeIcon(bdef, 20) + '</span>';
      }
      badge.style.display = anyModalOpen() ? 'none' : 'block';
      badge.innerHTML =
        '<div style="display:flex;align-items:center;gap:7px;background:#fff;' +
        'border:1px solid rgba(200,151,58,0.4);border-radius:999px;padding:5px 10px;' +
        'box-shadow:0 2px 8px rgba(0,0,0,0.08);">' +
        '<a href="leaderboard.html" title="อันดับผู้เล่น" style="text-decoration:none;font-size:15px;">🏆</a>' +
        '<a href="my-progress.html" title="คะแนนของฉัน" style="text-decoration:none;color:#8B6310;font-size:15px;">📊</a>' +
        avatarHTML +
        '<span id="tf-nick" title="點此編輯個人檔案 / แก้โปรไฟล์" style="color:#8B6310;max-width:105px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer;">' + esc(displayName) + '</span>' +
        pinHTML +
        '<button id="tf-edit-nick" title="編輯個人檔案" style="border:none;background:none;color:#A07A1E;cursor:pointer;font-size:13px;padding:0;line-height:1;">✏️</button>' +
        '<button id="tf-logout" style="border:none;background:#C8973A;color:#fff;' +
        'border-radius:999px;padding:4px 10px;cursor:pointer;font-size:12px;">登出</button>' +
        '</div>';
      badge.querySelector('#tf-logout').onclick = doLogout;
      badge.querySelector('#tf-edit-nick').onclick = openProfileEditor;
      badge.querySelector('#tf-nick').onclick = openProfileEditor;
    } else {
      badge.style.display = 'none';
      // หน้าเว็บมองเห็นได้เสมอ — ไม่บล็อกตอนโหลด
      // gate เด้งเฉพาะเมื่อผู้ใช้กด "เริ่มเล่น" จริง (gateOpen) หรือกดปุ่มล็อกอินมุมขวา
      gate.style.display = (gateOpen && authResolved) ? 'flex' : 'none';
      // ปุ่มล็อกอินมุมขวาบน — ซ่อนเมื่อมี modal เปิด (กันทับปุ่มกากบาท)
      miniBtn.style.display = (authResolved && !anyModalOpen()) ? 'block' : 'none';
      // ให้อีเมลแล้ว (ปลดล็อกแล้ว) → เปลี่ยนปุ่มเป็น "登入排行榜" ไม่ให้ดูเหมือนยังไม่ได้ทำอะไร
      var _mb = miniBtn.querySelector('#tf-mini-login');
      if (_mb) _mb.textContent = leadCaptured() ? '登入排行榜' : '登入';
    }
  }

  // ── เปิด/ปิด gate ตามคำขอ ───────────────────────────────────
  var gateShownFired = false;
  function showGate() {
    if (currentUser) { if (pendingAfterLogin) { var f = pendingAfterLogin; pendingAfterLogin = null; f(); } return; }
    if (leadCaptured()) return;   // ให้อีเมลแล้ว = ปลดล็อก ไม่ต้องเด้งอีก
    gateOpen = true;
    if (!gateShownFired) { gateShownFired = true; try { window.gtag('event', 'gate_shown', {}); } catch (e) {} }
    render();
  }
  function hideGate() {
    gateOpen = false;
    pendingAfterLogin = null;
    render();
  }

  // ── น้องมีนา exit survey — เด้งถามตอนคนจะปิด gate โดยยังไม่ล็อกอิน/ไม่ให้อีเมล LIN 2026-06-23 ──
  var exitSurveyShown = false;   // โชว์ครั้งเดียวต่อ session (ไม่กวน)
  function requestCloseGate() {
    if (currentUser || leadCaptured() || exitSurveyShown) { hideGate(); return; }
    showExitSurvey();
  }
  function finishExitSurvey(choice) {
    if (choice) { try { window.gtag('event', 'exit_survey_choice', { choice: choice }); } catch (e) {} }
    var m = document.getElementById('tf-exit-survey');
    if (m) m.remove();
    hideGate();
  }
  function showExitSurvey() {
    exitSurveyShown = true;
    try { window.gtag('event', 'exit_survey_shown', {}); } catch (e) {}
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
    hideGate: hideGate
  };

  // กด Esc → น้องมีนาเด้งถามก่อนปิด
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && gateOpen) requestCloseGate();
  });

  function boot() {
    render();
    sb.auth.getSession().then(function (res) {
      currentUser = (res.data && res.data.session && res.data.session.user) || null;
      authResolved = true;
      render();
      fetchProfile();
    });
    sb.auth.onAuthStateChange(function (_event, session) {
      currentUser = (session && session.user) || null;
      authResolved = true;
      myNick = myAvatar = myBadge = null;   // เคลียร์โปรไฟล์เดิม แล้วดึงของ user ปัจจุบันใหม่
      render();
      fetchProfile();
    });
    // เฝ้าการเปิด/ปิด modal → ซ่อน/โชว์ปุ่ม 登入 ให้ถูก (กันทับปุ่มกากบาท) ครอบทุกวิธีปิด
    try {
      var _modalState = anyModalOpen();
      var _mo = new MutationObserver(function () {
        var s = anyModalOpen();
        if (s !== _modalState) { _modalState = s; render(); }
      });
      _mo.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'] });
    } catch (e) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
