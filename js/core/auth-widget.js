// ════════════════════════════════════════════════════════════
// auth-widget.js — ระบบ session ล็อกอิน + widget โปรไฟล์ "กลาง" ใช้ร่วมทุกหน้า
// รวมมาจาก supabase-auth.js (ตัวที่สมบูรณ์ที่สุด: ชื่อเล่น+✏️แก้โปรไฟล์+🏆+📊+登出)
// เดิมแต่ละหน้ามี currentUser/Supabase client/listener แยกกันเอง (ไม่ sync กัน) →
// ไฟล์นี้คุมจุดเดียว ทุกหน้าที่โหลดไฟล์นี้จะเห็น session เดียวกัน ใช้ client เดียวกัน
//
// ต้องโหลดหลัง: supabase-js CDN, supabase-config.js
// ต้องโหลดก่อน:  supabase-auth.js / reading-auth.js / progress.js
//               (ไฟล์พวกนี้อ่านค่าจาก window.SITE_AUTH แทนการสร้าง client เอง)
//
// วิธีใช้จากหน้าเกม/หน้าอื่น:
//   window.SITE_AUTH.onChange(function(user){ ... })   // รู้ทุกครั้งที่ login/logout
//   window.SITE_AUTH.renderBadge('containerId', { leaderboardHref:'xxx.html' })
//        → วาด badge (ชื่อ+✏️+🏆+📊+登出) ลงใน div ที่มี id นั้น เรียกครั้งเดียวพอ
//          ระบบจะ re-render ให้เองทุกครั้งที่ auth/โปรไฟล์เปลี่ยน
//   window.SITE_AUTH.doLogout()
//
// เฟส 1 (LIN 2026-07-03): รวม widget ให้ tone-finder / reading-game / typing-game /
//   word-order / my-progress ก่อน (เฟสถัดไปค่อยเติมหน้าที่ยังไม่มี widget เลย)
//
// FILE MAP (keep runtime order):
//   [01] Bootstrap + public API
//   [02] Profile state + auth listeners
//   [03] Profile editor
//   [04] Badge rendering + modal visibility
//   [05] Session logging + auth boot
// ════════════════════════════════════════════════════════════
(function () {
  'use strict';

  // ----- [01] BOOTSTRAP + PUBLIC API -----
  var cfg = window.SUPABASE_CONFIG || {};
  var ready = cfg.url && cfg.anonKey &&
              cfg.url.indexOf('YOUR_') === -1 &&
              cfg.anonKey.indexOf('YOUR_') === -1 &&
              window.supabase && window.supabase.createClient;

  if (!ready) {
    // Supabase ยังไม่พร้อม/โหลดไม่ได้ → แจ้งชัดและใช้ Guest ต่อได้ โดยไม่แตะ account cache.
    function renderUnavailable(containerId) {
      var host = document.getElementById(containerId);
      if (!host) return;
      var id = 'sa-auth-unavailable-' + containerId;
      if (document.getElementById(id)) return;
      var status = document.createElement('span'); status.id = id;
      status.setAttribute('role', 'status');
      status.style.cssText = 'display:inline-flex;align-items:center;gap:7px;flex-wrap:wrap;color:#78350f;background:#fff3d8;border:1px solid #C8973A;border-radius:12px;padding:7px 10px;font:700 12px "Noto Sans TC",sans-serif;';
      status.appendChild(document.createTextNode('登入服務暫時無法連線，可先使用訪客模式。'));
      var retry = document.createElement('button'); retry.type = 'button'; retry.textContent = '重新載入';
      retry.style.cssText = 'border:1px solid #8B6310;border-radius:999px;background:#fff;color:#8B6310;padding:4px 9px;cursor:pointer;font:inherit;';
      retry.onclick = function () { location.reload(); };
      status.appendChild(retry); host.appendChild(status);
    }
    window.SITE_AUTH = {
      ready: false, user: null, authResolved: true, authError: 'unavailable',
      learningOwnerChanged: false, learningOwnerEpoch: 0, learningOwnerId: null,
      onChange: function (cb) { if (typeof cb === 'function') cb(null); }, doLogout: function () {},
      openProfileEditor: function () {}, renderBadge: renderUnavailable
    };
    return;
  }

  var sb = window.getSupabaseClient ? window.getSupabaseClient() : window.supabase.createClient(cfg.url, cfg.anonKey);
  var CLIENT_FAILURE_TIMEOUT_MS = 12000;

  function clientFailureError(message, code, uncertain) {
    var err = new Error(message);
    err.code = code || 'client_failure';
    err.uncertain = !!uncertain;
    return err;
  }

  function withClientTimeout(promise, label, uncertain) {
    return new Promise(function (resolve, reject) {
      var settled = false;
      var timer = setTimeout(function () {
        if (settled) return;
        settled = true;
        reject(clientFailureError(label + '逾時', 'client_timeout', uncertain));
      }, CLIENT_FAILURE_TIMEOUT_MS);
      Promise.resolve(promise).then(function (value) {
        if (settled) return;
        settled = true; clearTimeout(timer); resolve(value);
      }, function (error) {
        if (settled) return;
        settled = true; clearTimeout(timer);
        if (uncertain && error && typeof error === 'object' && error.uncertain == null) error.uncertain = true;
        reject(error);
      });
    });
  }

  function isLegacyProfileShapeError(error) {
    if (!error) return false;
    var code = String(error.code || '');
    var message = String(error.message || '');
    return code === '42703' || code === 'PGRST204' || /(?:avatar|badge_id).*(?:column|schema cache|not found|does not exist)/i.test(message);
  }

  function isUncertainRemoteError(error) {
    if (!error || error.code) return false;
    return /(?:failed to fetch|network|load failed|timeout|timed out)/i.test(String(error.message || '') + ' ' + String(error.details || ''));
  }
  var ADMIN_EMAIL = 'mr.taihualin@gmail.com';
  // v1 (LIN 2026-07-25, audit): กันแอดมิน (Lin เอง) โดนนับเข้า leaderboard ตอนทดสอบล็อกอินด้วย
  //   Facebook/LINE — 2 ช่องทางนี้อาจไม่มีอีเมลเลย (LINE เปิด "Allow users without email")
  //   เช็คแค่ email อย่างเดียวจะพลาด (email ว่าง ≠ ADMIN_EMAIL เสมอ) ต้องมี user id สำรองด้วย
  //   วิธีใช้: หลัง Lin ทดสอบล็อกอินด้วย Facebook/LINE ครั้งแรก ไปเอา user id จาก Supabase Dashboard
  //   → Authentication → Users มาใส่ในลิสต์นี้ (ใช้ร่วมกันทุกไฟล์ที่ต้องกันแอดมิน: reading-auth.js, tone-companion.js)
  //   S29: กระดานแยกเกมกรองแอดมินใน RPC; ไม่มี cross-game total ตาม PD-SCORE-01
  var SITE_ADMIN_USER_IDS = []; // เช่น ['xxxxxxxx-xxxx-...'] — ใส่ user id ที่ Lin เอามาเติมเอง
  window.SITE_ADMIN_USER_IDS = SITE_ADMIN_USER_IDS;
  function isSiteAdmin(u) {
    if (!u) return false;
    if ((u.email || '').toLowerCase() === ADMIN_EMAIL) return true;
    return SITE_ADMIN_USER_IDS.indexOf(u.id) !== -1;
  }
  window.isSiteAdmin = isSiteAdmin;

  var API = {
    ready: true,
    user: null,
    authResolved: false,
    authError: null,
    learningOwnerChanged: false,
    learningOwnerEpoch: 0,
    learningOwnerId: null,
    onChange: onChange,
    doLogout: doLogout,
    openProfileEditor: openProfileEditor,
    renderBadge: renderBadge
  };
  window.SITE_AUTH = API;

  // Phase 1 Guest/Login boundary (Lin 2026-08-13): learning state before Login
  // must never become account Progress/SRS/Mastered data. These keys contain
  // account-scoped learning state; GameResume and display preferences are
  // intentionally excluded so Guest can still continue the active practice.
  var LEARNING_OWNER_KEY = 'phase1_learning_owner_v1';
  var ACCOUNT_LEARNING_KEYS = [
    'tf_srs_v1', 'rgv3_save', 'wo_srs_v1',
    'tf_badges_v1', 'tf_streak_v1', 'tf_word_wrong_v1', 'tf_wrong_stats_v1',
    'thai_game_acct_v1', 'linvault_v1', 'sentence_vault_v1', 'lego_vault_v1',
    'phase1_account_resume_v1', 'phase1_canonical_meta_v1',
    'phase1_practice_event_pending_v1'
  ];
  function bindLearningOwner(user) {
    var uid = (user && user.id) ? String(user.id) : '';
    var owner = '';
    try { owner = localStorage.getItem(LEARNING_OWNER_KEY) || ''; } catch (e) {}
    var changed = owner !== uid;
    if (changed) {
      try {
        ACCOUNT_LEARNING_KEYS.forEach(function (key) { localStorage.removeItem(key); });
        if (uid) localStorage.setItem(LEARNING_OWNER_KEY, uid);
        else localStorage.removeItem(LEARNING_OWNER_KEY);
      } catch (e) {}
      API.learningOwnerEpoch += 1;
    }
    API.learningOwnerChanged = changed;
    API.learningOwnerId = uid || null;
    return changed;
  }
  window.PHASE1_ACCOUNT_BOUNDARY = {
    bind: bindLearningOwner,
    ownerKey: LEARNING_OWNER_KEY,
    learningKeys: ACCOUNT_LEARNING_KEYS.slice()
  };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  // ----- [02] PROFILE STATE + AUTH LISTENERS -----
  // โปรไฟล์ผู้เล่น: ชื่อ+รูป+แบดจ์ เก็บใน profiles (คีย์ user_id) + localStorage แคชสำรอง
  // ⚠️ ใช้คีย์ localStorage เดิมจาก supabase-auth.js ('tf_avatar'/'tf_pinned_badge') ตั้งใจ
  //    ไม่เปลี่ยน กันผู้ใช้เดิมที่เคยตั้งรูป/แบดจ์ไว้แล้วดูเหมือน "หาย"
  var myNick = null, myAvatar = null, myBadge = null;
  var nickPromptedFor = null;
  var PRESET_AVATARS = ['🐘', '🐱', '🐶', '🐰', '🦊', '🐼', '🐯', '🐸', '🐥', '🦉', '🐲', '🥭'];
  var AVATAR_KEY = 'tf_avatar', PIN_BADGE_KEY = 'tf_pinned_badge';
  // 2026-08-08 (P6-09~12 ก้อน 2): คีย์ sessionStorage เก็บสถานะ "ก่อนเชื่อม Facebook" ชั่วคราว
  //   ระหว่าง redirect ไป Facebook แล้วกลับมา (ดู checkPendingFacebookLinkAudit ด้านล่าง)
  var FB_LINK_PENDING_KEY = 'sa_fb_link_pending';
  function getAvatarCache() { try { return localStorage.getItem(AVATAR_KEY) || ''; } catch (e) { return ''; } }
  function setAvatarCache(v) { try { if (v) localStorage.setItem(AVATAR_KEY, v); else localStorage.removeItem(AVATAR_KEY); } catch (e) {} }
  function getPinBadgeCache() { try { return localStorage.getItem(PIN_BADGE_KEY) || ''; } catch (e) { return ''; } }
  function setPinBadgeCache(v) { try { if (v) localStorage.setItem(PIN_BADGE_KEY, v); else localStorage.removeItem(PIN_BADGE_KEY); } catch (e) {} }

  // ── ผู้ฟัง auth เปลี่ยน (หน้าเกมใช้ตัดสินใจ save score ได้ / gate ได้) ──
  var changeListeners = [];
  function onChange(cb) {
    if (typeof cb !== 'function') return;
    changeListeners.push(cb);
    if (API.authResolved) { try { cb(API.user); } catch (e) {} }
  }
  function fireChange() {
    changeListeners.forEach(function (cb) { try { cb(API.user); } catch (e) {} });
    badgeBindings.forEach(function (b) { paintBadge(b.containerId, b.opts); });
  }

  function clearAuthUiCaches() {
    // 2026-08-08 (P6-09~12 ก้อน 1): เคลียร์ localStorage cache ที่ไม่ใช่ session token ด้วย
    //   sb.auth.signOut() ลบแค่ token ของ Supabase เอง ไม่ลบ cache ที่แอปเขียนเองพวกนี้
    //   ผลถ้าไม่เคลียร์: บนเครื่องสาธารณะ/ใช้ร่วมกัน คนถัดไปที่เปิดเว็บ (ก่อนล็อกอิน) จะยังเห็น
    //   avatar/badge/hint "上次登入方式" ของคนก่อนหน้าค้างอยู่ (ไม่ใช่ข้อมูลลับ แต่ไม่ควรค้าง)
    //   AVATAR_KEY/PIN_BADGE_KEY/NICK_PROMPT_KEY/LOGSESS_KEY ประกาศอยู่ในไฟล์นี้แล้ว
    //   'rg_last_login_provider' เป็นคีย์ของ reading-auth.js (คนละไฟล์ คนละ closure) — เขียนตรงๆ
    //   ที่นี่แทนเพราะ localStorage เป็นที่เก็บกลางของเบราว์เซอร์ ไม่ต้องพึ่งฟังก์ชันไฟล์นั้น
    try {
      localStorage.removeItem(AVATAR_KEY);
      localStorage.removeItem(PIN_BADGE_KEY);
      localStorage.removeItem(NICK_PROMPT_KEY);
      localStorage.removeItem(LOGSESS_KEY);
      localStorage.removeItem('rg_last_login_provider');
    } catch (e) {}
  }

  function showAuthActionFailure(message) {
    try {
      var old = document.getElementById('sa-auth-action-fail-toast');
      if (old) old.remove();
      var d = document.createElement('div');
      d.id = 'sa-auth-action-fail-toast';
      d.setAttribute('role', 'alert');
      d.style.cssText = 'position:fixed;bottom:90px;left:50%;transform:translateX(-50%);z-index:100003;' +
        'max-width:88vw;background:#78350f;color:#fff;border-radius:12px;padding:10px 16px;' +
        'font-size:13px;font-family:"Noto Sans TC",sans-serif;line-height:1.6;text-align:center;' +
        'box-shadow:0 4px 16px rgba(0,0,0,0.28);';
      d.textContent = message || '⚠️ 登出失敗，請檢查網路後再試一次';
      document.body.appendChild(d);
      setTimeout(function () { if (d.parentNode) d.remove(); }, 6000);
    } catch (e) {}
  }

  function doLogout() {
    // ออกจาก session ของอุปกรณ์นี้เท่านั้น; ปุ่ม "ออกทุกอุปกรณ์" ใช้ global scope แยกด้านล่าง
    // เคลียร์ cache หลัง server/client ยืนยัน sign-out สำเร็จเท่านั้น เพื่อไม่ทำข้อมูล UI หายเมื่อ network ล้มเหลว
    return sb.auth.signOut({ scope: 'local' }).then(function (res) {
      if (res && res.error) {
        console.warn('[auth] signOut failed:', res.error.message || res.error);
        showAuthActionFailure('⚠️ 登出失敗，登入狀態與本機資料仍保留，請檢查網路後再試一次');
        return res;
      }
      clearAuthUiCaches();
      return res;
    }, function (error) {
      console.warn('[auth] signOut failed:', (error && error.message) || error);
      showAuthActionFailure('⚠️ 登出失敗，登入狀態與本機資料仍保留，請檢查網路後再試一次');
      return { error: error };
    });
  }

  // เคยเด้งชวนตั้งชื่อเล่นให้ user นี้ไปแล้วหรือยัง — จำถาวร (ไม่ใช่แค่ในหน่วยความจำ)
  // กันเด้งซ้ำทุกครั้งที่เปลี่ยนหน้า (แต่ละหน้าโหลดไฟล์นี้ใหม่ ตัวแปรในหน่วยความจำอย่างเดียวจะลืม) LIN 2026-07-03
  var NICK_PROMPT_KEY = 'sa_nick_prompted';
  function nickPromptSeen(uid) { try { return (localStorage.getItem(NICK_PROMPT_KEY) || '').split(',').indexOf(uid) !== -1; } catch (e) { return false; } }
  function markNickPromptSeen(uid) {
    try {
      var list = (localStorage.getItem(NICK_PROMPT_KEY) || '').split(',').filter(Boolean);
      if (list.indexOf(uid) === -1) { list.push(uid); localStorage.setItem(NICK_PROMPT_KEY, list.join(',')); }
    } catch (e) {}
  }

  function fetchProfile() {
    if (!API.user) { myNick = myAvatar = myBadge = null; fireChange(); return; }
    var uid = API.user.id, email = API.user.email;
    function afterProfile() {
      fireChange();
      if (!myNick && email !== ADMIN_EMAIL && nickPromptedFor !== uid && !nickPromptSeen(uid)) {
        nickPromptedFor = uid;
        markNickPromptSeen(uid);
        setTimeout(openProfileEditor, 600);
      }
    }
    // dedupe fetch 2026-07-20: ห่อด้วย getCachedFetch กัน SITE_AUTH.fireChange() ที่ยิงหลายครั้งต่อโหลดหน้าเดียว
    //   (getSession resolve + onAuthStateChange initial fire + revalidate) ทำให้ profiles ถูกยิงซ้ำทั้งที่ user เดิม
    var _fetchProfileFull = window.getCachedFetch
      ? window.getCachedFetch('profiles:full:' + uid, function () { return sb.from('profiles').select('nickname, avatar, badge_id').eq('user_id', uid).maybeSingle(); })
      : sb.from('profiles').select('nickname, avatar, badge_id').eq('user_id', uid).maybeSingle();
    _fetchProfileFull
      .then(function (res) {
        if (res.error) {
          // คอลัมน์ avatar/badge_id ยังไม่มีใน Supabase → ใช้แค่ชื่อ + แคชเครื่อง
          var _fetchProfileBasic = window.getCachedFetch
            ? window.getCachedFetch('profiles:basic:' + uid, function () { return sb.from('profiles').select('nickname').eq('user_id', uid).maybeSingle(); })
            : sb.from('profiles').select('nickname').eq('user_id', uid).maybeSingle();
          _fetchProfileBasic.then(function (r2) {
            myNick = (r2.data && r2.data.nickname) || null;
            myAvatar = getAvatarCache() || null;
            myBadge = getPinBadgeCache() || null;
            afterProfile();
          });
          return;
        }
        var d = res.data || {};
        myNick = d.nickname || null;
        myAvatar = d.avatar || getAvatarCache() || null;
        myBadge = d.badge_id || getPinBadgeCache() || null;
        if (d.avatar) setAvatarCache(d.avatar);
        if (d.badge_id) setPinBadgeCache(d.badge_id);
        afterProfile();
      });
  }

  // ----- [03] PROFILE EDITOR -----
  // ป๊อปอัปแก้โปรไฟล์: ชื่อ + รูปอิโมจิสำเร็จรูป + เลือกแบดจ์ที่ปลดล็อกแล้ว (sync ผ่าน profiles)
  // (ก๊อปมาจาก supabase-auth.js เดิมทั้งดุ้น — ตัวนี้สมบูรณ์ที่สุด ใช้เป็นต้นแบบกลาง)
  var profileModal = null;
  function canStartLineLink() {
    return !!(window.READING_AUTH && typeof window.READING_AUTH.startLineLink === 'function' &&
      window.SUPABASE_CONFIG && window.SUPABASE_CONFIG.lineChannelId);
  }

  function lineConnectButtonHtml() {
    if (!canStartLineLink()) return '<div style="font-size:12px;color:#A07A1E;margin-bottom:10px;">此頁無法連接 LINE，請到遊戲頁再試</div>';
    return '<button id="sap-link-line" style="width:100%;border:1.5px solid #06C755;background:#fff;color:#06C755;border-radius:10px;padding:11px;font-size:14px;font-weight:700;cursor:pointer;margin-bottom:10px;display:flex;align-items:center;justify-content:center;gap:8px;">' +
      '<svg width="18" height="18" viewBox="0 0 24 24"><path fill="#06C755" d="M12 2C6.48 2 2 5.69 2 10.24c0 4.08 3.54 7.5 8.32 8.15.32.07.76.21.87.49.1.25.06.65.03.9l-.14.85c-.04.25-.19.98.86.53 1.05-.44 5.67-3.34 7.74-5.72C21.15 13.62 22 12.02 22 10.24 22 5.69 17.52 2 12 2z"/></svg>連接 LINE 帳號</button>';
  }

  function loadProfileLineStatus(host) {
    if (!host) return;
    callAccountFn('account-unlink', { action: 'status' }).then(function (status) {
      if (!host.parentNode) return;
      if (status && status.line_linked === true) {
        host.innerHTML = '<div style="font-size:12px;color:#2d6a4f;margin-bottom:10px;">✅ 已連接 LINE 帳號</div>';
        return;
      }
      host.innerHTML = lineConnectButtonHtml();
      var btn = host.querySelector('#sap-link-line');
      if (btn) btn.onclick = function () { window.READING_AUTH.startLineLink(); };
    }).catch(function () {
      if (!host.parentNode) return;
      host.innerHTML = '<div style="font-size:12px;color:#b45309;margin-bottom:10px;">⚠️ 無法確認 LINE 連接狀態，請稍後再試</div>';
    });
  }

  function openProfileEditor() {
    if (!API.user) return;
    var meta = API.user.user_metadata || {};
    var curName = myNick || meta.full_name || meta.name || '';
    var selAvatar = myAvatar || getAvatarCache() || 'none';
    var selBadge = myBadge || getPinBadgeCache();
    var data = (window.tfLoadBadges ? window.tfLoadBadges() : { unlocked: {} });
    var unlocked = data.unlocked || {};
    var defs = window.TF_BADGES_DEF || [];
    var unlockedDefs = defs.filter(function (b) { return unlocked[b.id]; });

    function avCell(val, inner, on) {
      return '<button class="sap-av" data-v="' + esc(val) + '" style="width:46px;height:46px;border-radius:50%;display:flex;' +
        'align-items:center;justify-content:center;cursor:pointer;background:#FBF6EA;border:2px solid ' + (on ? '#C8973A' : 'transparent') + ';">' + inner + '</button>';
    }
    function bgCell(val, inner, label, on) {
      return '<button class="sap-bg" data-v="' + esc(val) + '" title="' + esc(label || '') + '" style="min-width:46px;height:46px;padding:0 6px;' +
        'border-radius:12px;display:flex;align-items:center;justify-content:center;cursor:pointer;background:#FBF6EA;border:2px solid ' + (on ? '#C8973A' : 'transparent') + ';">' + inner + '</button>';
    }

    var avatarChoices = '';
    PRESET_AVATARS.forEach(function (em) { avatarChoices += avCell(em, '<span style="font-size:26px;">' + em + '</span>', selAvatar === em); });
    avatarChoices += avCell('none', '<span style="font-size:13px;color:#A07A1E;">無</span>', selAvatar === 'none');

    var badgeChoices;
    if (!unlockedDefs.length) {
      badgeChoices = '<div style="font-size:12.5px;color:#A07A1E;padding:6px 2px;line-height:1.6;">還沒有解鎖徽章～玩聲調遊戲解鎖後就能選來展示 🎖️</div>';
    } else {
      badgeChoices = unlockedDefs.map(function (b) { return bgCell(b.id, window.tfBadgeIcon(b, 30), b.zh, selBadge === b.id); }).join('') +
        bgCell('', '<span style="font-size:13px;color:#A07A1E;">不顯示</span>', '', !selBadge);
    }

    if (profileModal) profileModal.remove();
    profileModal = document.createElement('div');
    profileModal.id = 'sa-profile-modal';
    profileModal.style.cssText = 'position:fixed;inset:0;z-index:100001;display:flex;align-items:center;justify-content:center;padding:18px;' +
      'background:rgba(28,18,4,0.82);backdrop-filter:blur(5px);-webkit-backdrop-filter:blur(5px);font-family:"Noto Sans TC",sans-serif;';
    // LINE ใช้ตาราง line_identities เป็น source of truth; app_metadata ใน JWT ค้างหรือชี้ผิดบัญชีได้
    // จึงแสดง placeholder ก่อน แล้วถามสถานะ read-only จาก server หลัง modal เปิด
    var linkLineHtml = '<div id="sap-line-status"><div style="font-size:12px;color:#A07A1E;margin-bottom:10px;">正在確認 LINE 連接狀態…</div></div>';

    // v2 (LIN 2026-07-26，ตามที่ Lin สั่ง "ทำเลย"): ปุ่ม "連接 Facebook 帳號" — กันเหตุการณ์ซ้ำแบบ LINE
    //   (LINE ตอนแรกล็อกอินแล้วได้บัญชีแยก ไม่ merge กับบัญชีเดิม เพราะ LINE ใช้ Edge Function ของเราเอง
    //   ไม่ผ่านระบบ auto-link ปกติของ Supabase) — Facebook เป็น native provider ของ Supabase อยู่แล้ว
    //   ปกติควร auto-link เองถ้าอีเมลตรงกับบัญชีเดิม (ดู https://supabase.com/docs/guides/auth/auth-identity-linking)
    //   แต่ auto-link ใช้ไม่ได้ถ้า Facebook ไม่ส่งอีเมลมา (ผู้ใช้กดปฏิเสธสิทธิ์อีเมลตอนล็อกอิน) — ปุ่มนี้เป็นทางสำรอง
    //   ผูกเข้าบัญชีที่ล็อกอินอยู่ตรงๆ ผ่าน sb.auth.linkIdentity() ไม่ต้องพึ่งอีเมลตรงกัน
    //   ⚠️ ต้องเปิด "Manual Linking (beta)" ใน Supabase Dashboard → Authentication → Sign In/Providers ก่อน ถึงจะกดสำเร็จจริง
    //   (ยังไม่ได้เช็คว่า Lin เปิดค่านี้ไว้หรือยัง — session Supabase Dashboard หลุดตอนตรวจ 2026-07-26)
    var alreadyLinkedFacebook = !!(API.user.identities && API.user.identities.some(function (i) { return i.provider === 'facebook'; }));
    var canLinkFacebook = !alreadyLinkedFacebook;
    var linkFacebookHtml = canLinkFacebook
      ? '<button id="sap-link-fb" style="width:100%;border:none;background:#1877F2;color:#fff;border-radius:10px;padding:11px;font-size:14px;font-weight:700;cursor:pointer;margin-bottom:8px;display:flex;align-items:center;justify-content:center;gap:8px;">' +
          '<svg width="18" height="18" viewBox="0 0 24 24"><path fill="#fff" d="M22 12.06C22 6.51 17.52 2 12 2S2 6.51 2 12.06c0 5.02 3.66 9.18 8.44 9.94v-7.03H7.9v-2.91h2.54V9.85c0-2.51 1.49-3.89 3.77-3.89 1.09 0 2.24.2 2.24.2v2.47h-1.26c-1.24 0-1.63.78-1.63 1.58v1.85h2.78l-.44 2.91h-2.34v7.03C18.34 21.24 22 17.08 22 12.06z"/></svg>連接 Facebook 帳號</button>' +
        '<div id="sap-link-fb-msg" style="display:none;font-size:12px;color:#b45309;margin:-2px 0 10px;line-height:1.5;"></div>'
      : (alreadyLinkedFacebook ? '<div style="font-size:12px;color:#2d6a4f;margin-bottom:10px;">✅ 已連接 Facebook 帳號</div>' : '');

    profileModal.innerHTML =
      '<div style="background:#fff;max-width:360px;width:100%;border-radius:18px;padding:22px 20px 18px;box-shadow:0 18px 50px rgba(0,0,0,0.35);max-height:88vh;overflow:auto;">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">' +
          '<h2 style="margin:0;font-size:18px;color:#5C4410;font-weight:800;">編輯個人檔案</h2>' +
          '<button id="sap-close" style="border:none;background:none;font-size:20px;color:#C3B594;cursor:pointer;line-height:1;">✕</button>' +
        '</div>' +
        '<label style="font-size:13px;color:#8B7340;font-weight:700;">個人檔案名稱（不會顯示在排行榜）</label>' +
        '<input id="sap-name" maxlength="20" value="' + esc(curName) + '" placeholder="輸入暱稱（1–20 字）" ' +
          'style="width:100%;box-sizing:border-box;margin:6px 0 16px;padding:10px 12px;border:1.5px solid #E5D9B8;border-radius:10px;font-size:15px;color:#5C4410;">' +
        '<div style="font-size:13px;color:#8B7340;font-weight:700;margin-bottom:8px;">頭像</div>' +
        '<div id="sap-avatars" style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px;">' + avatarChoices + '</div>' +
        '<div style="font-size:13px;color:#8B7340;font-weight:700;margin-bottom:8px;">展示徽章（顯示在名稱旁）</div>' +
        '<div id="sap-badges" style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:18px;">' + badgeChoices + '</div>' +
        linkFacebookHtml +
        linkLineHtml +
        '<div id="sap-save-msg" role="status" style="display:none;font-size:12px;color:#b45309;margin-bottom:10px;line-height:1.5;"></div>' +
        '<button id="sap-save" style="width:100%;border:none;background:#C8973A;color:#fff;border-radius:10px;padding:12px;font-size:15px;font-weight:800;cursor:pointer;">儲存</button>' +
        '<button id="sap-open-manage" style="width:100%;border:none;background:none;color:#A07A1E;font-size:12px;padding:10px 0 0;cursor:pointer;text-decoration:underline;">⚙️ 帳號管理（匯出資料 / 解除連結 / 刪除帳號）</button>' +
      '</div>';
    document.body.appendChild(profileModal);
    loadProfileLineStatus(profileModal.querySelector('#sap-line-status'));
    // v2 (LIN 2026-07-26): กดแล้ว redirect ไป Facebook ทันที (สำเร็จจะไม่เห็นโค้ดหลังจากนี้ เพราะหน้าเปลี่ยนไปแล้ว)
    //   error ที่เจอได้บ่อยสุด = ยังไม่ได้เปิด "Manual Linking" ใน Supabase Dashboard (ดู comment ด้านบน)
    var linkFbBtn = profileModal.querySelector('#sap-link-fb');
    var linkFbMsg = profileModal.querySelector('#sap-link-fb-msg');
    if (linkFbBtn) linkFbBtn.onclick = function () {
      linkFbBtn.disabled = true; linkFbBtn.style.opacity = '0.6';
      if (linkFbMsg) linkFbMsg.style.display = 'none';
      // 2026-08-08 (P6-09~12 ก้อน 2): เก็บสถานะ "ก่อนเชื่อม" ไว้ใน sessionStorage ก่อน redirect ไป
      //   Facebook เพราะกดสำเร็จ Supabase จะเปลี่ยนหน้าไปเลย (ไม่กลับมาทำงานต่อใน .then() ด้านล่าง)
      //   ต้องตรวจตอน redirect กลับมาที่หน้านี้แทน (ดู checkPendingFacebookLinkAudit ใน boot())
      try {
        var providersBeforeFb = (API.user.identities || []).map(function (i) { return i.provider; });
        sessionStorage.setItem(FB_LINK_PENDING_KEY, JSON.stringify({ user_id: API.user.id, providers_before: providersBeforeFb }));
      } catch (e) {}
      try {
        sb.auth.linkIdentity({ provider: 'facebook', options: { redirectTo: location.href } }).then(function (res) {
          if (res && res.error) {
            try { sessionStorage.removeItem(FB_LINK_PENDING_KEY); } catch (e2) {}
            linkFbBtn.disabled = false; linkFbBtn.style.opacity = '1';
            if (linkFbMsg) { linkFbMsg.style.display = 'block'; linkFbMsg.textContent = '⚠️ 連接失敗：' + (res.error.message || '請稍後再試'); }
          }
          // 成功的話 Supabase 會直接把頁面導去 Facebook，不會執行到這裡
        }, function (e) {
          try { sessionStorage.removeItem(FB_LINK_PENDING_KEY); } catch (e2) {}
          linkFbBtn.disabled = false; linkFbBtn.style.opacity = '1';
          if (linkFbMsg) { linkFbMsg.style.display = 'block'; linkFbMsg.textContent = '⚠️ 連接失敗：' + (e && e.message || '請稍後再試'); }
        });
      } catch (e) {
        try { sessionStorage.removeItem(FB_LINK_PENDING_KEY); } catch (e2) {}
        linkFbBtn.disabled = false; linkFbBtn.style.opacity = '1';
        if (linkFbMsg) { linkFbMsg.style.display = 'block'; linkFbMsg.textContent = '⚠️ 連接失敗：' + (e && e.message || String(e)); }
      }
    };

    function closeModal() { if (profileModal) { profileModal.remove(); profileModal = null; } }
    profileModal.querySelector('#sap-open-manage').onclick = function () { closeModal(); openAccountManageModal(); };
    profileModal.querySelector('#sap-close').onclick = closeModal;
    profileModal.addEventListener('click', function (e) { if (e.target === profileModal) closeModal(); });
    [].forEach.call(profileModal.querySelectorAll('.sap-av'), function (btn) {
      btn.onclick = function () {
        selAvatar = btn.getAttribute('data-v');
        [].forEach.call(profileModal.querySelectorAll('.sap-av'), function (b) { b.style.borderColor = 'transparent'; });
        btn.style.borderColor = '#C8973A';
      };
    });
    [].forEach.call(profileModal.querySelectorAll('.sap-bg'), function (btn) {
      btn.onclick = function () {
        selBadge = btn.getAttribute('data-v');
        [].forEach.call(profileModal.querySelectorAll('.sap-bg'), function (b) { b.style.borderColor = 'transparent'; });
        btn.style.borderColor = '#C8973A';
      };
    });
    profileModal.querySelector('#sap-save').onclick = function () {
      var saveBtn = profileModal.querySelector('#sap-save');
      var saveMsg = profileModal.querySelector('#sap-save-msg');
      var nm = (profileModal.querySelector('#sap-name').value || '').trim().slice(0, 20);
      var row = { user_id: API.user.id, avatar: selAvatar, badge_id: selBadge };
      if (nm) row.nickname = nm;
      saveBtn.disabled = true; saveBtn.textContent = '儲存中…';
      saveMsg.style.display = 'none';
      withClientTimeout(sb.from('profiles').upsert(row, { onConflict: 'user_id' }), '儲存個人檔案', true).then(function (res) {
        if (!res || typeof res !== 'object') {
          throw clientFailureError('伺服器回應格式不完整', 'invalid_response', true);
        }
        // ถ้าคอลัมน์ avatar/badge_id ยังไม่มี → เซฟเฉพาะชื่อ (รูป/แบดจ์ยังอยู่ในแคชเครื่อง)
        if (res.error && nm && isLegacyProfileShapeError(res.error)) {
          return withClientTimeout(
            sb.from('profiles').upsert({ user_id: API.user.id, nickname: nm }, { onConflict: 'user_id' }),
            '儲存暱稱', true
          );
        }
        if (res.error && isUncertainRemoteError(res.error)) {
          throw clientFailureError('網路中斷，伺服器結果尚未確認', 'network_unavailable', true);
        }
        return res;
      }).then(function (res) {
        if (!res || typeof res !== 'object') {
          throw clientFailureError('伺服器回應格式不完整', 'invalid_response', true);
        }
        if (res && res.error) throw clientFailureError(res.error.message || '儲存失敗', 'profile_save_failed', false);
        // Local display/cache follows the server confirmation; a timeout never looks like success.
        setAvatarCache(selAvatar); setPinBadgeCache(selBadge);
        myAvatar = selAvatar; myBadge = selBadge;
        if (nm) myNick = nm;
        closeModal(); fireChange();
      }).catch(function (error) {
        saveBtn.disabled = false; saveBtn.textContent = '儲存';
        saveMsg.style.display = 'block';
        saveMsg.textContent = error && error.uncertain
          ? '⚠️ 無法確認是否已儲存。請重新載入確認目前資料後，再決定是否重試。'
          : '⚠️ 儲存失敗：' + (error && error.message || String(error));
      });
    };
  }

  // ----- [03b] ACCOUNT MANAGEMENT MODAL (匯出資料 / 解除連結 / 登出所有裝置 / 刪除帳號) -----
  // เพิ่ม 2026-08-08 ตามที่ Lin อนุมัติให้เริ่มสร้าง (docs/ACCOUNT_DATA_SAFETY_GAPS.md ข้อ 1/3/6)
  // เรียก Edge Function 3 ตัวที่เตรียมไว้แล้ว: account-export / account-unlink / account-delete
  // ⚠️ ทั้ง 3 ฟังก์ชันยังเป็น "ร่าง" ยังไม่ได้ deploy — โค้ดฝั่งนี้พร้อมเรียกได้ทันทีที่ Lin ตรวจ +
  //   deploy เสร็จ ไม่ต้องแก้อะไรเพิ่ม ถ้ายังไม่ deploy ปุ่มพวกนี้จะขึ้น error "ไม่พบฟังก์ชัน" ตามปกติ
  //
  // 🆕 2026-08-08 (รอบ 2): ลบบัญชีเปลี่ยนเป็น cooldown 7 วัน ตามที่ Lin ตัดสินใจ — account-delete
  //   ฝั่งเซิร์ฟเวอร์เปลี่ยน action จาก 'confirm' (ลบทันที) เป็น 'request' (เข้าคิวรอ 7 วัน) + เพิ่ม
  //   action 'cancel' ใหม่ (ยกเลิกคำขอ) โค้ดฝั่งนี้แก้ตามให้ตรงแล้ว: เปิด modal ปุ๊บเช็คทันทีว่ามีคำขอ
  //   ค้างอยู่ไหม (renderDangerZone) ถ้ามี → โชว์ banner + ปุ่มยกเลิก แทนปุ่ม "🗑️ 刪除帳號" ปกติ
  var manageModal = null;
  function closeManageModal() { if (manageModal) { manageModal.remove(); manageModal = null; } }

  function accountFnUrl(name) { return cfg.url + '/functions/v1/' + name; }

  // 🆕 2026-08-08: สร้าง Error จาก response ที่ !res.ok ให้ตรงกับรูปแบบใหม่ของ 3 ฟังก์ชันฝั่งเซิร์ฟเวอร์
  // ({ error: '<code คงที่>', message: '<ข้อความคนอ่านได้>' }) — err.message ใช้ json.message (โชว์ผู้ใช้ได้
  // ตรงๆ) ส่วน err.code เก็บ json.error (raw code) ไว้ log/debug เท่านั้น ไม่โชว์ผู้ใช้ตรงๆ อีกต่อไป
  // (เดิมไฟล์นี้ใช้ json.error เป็น err.message ตรงๆ ทำให้ผู้ใช้เห็น code ดิบ เช่น "open_payout_exists")
  function accountFnError(name, res, json) {
    var code = (json && json.error) || ('http_' + res.status);
    var friendly = (json && json.message) || (json && json.error) || ('เกิดข้อผิดพลาด (HTTP ' + res.status + ')');
    var err = new Error(friendly);
    err.code = code;
    err.status = res.status;
    err.body = json;
    console.error('[account-fn] ' + name + ' failed — code:', code, 'detail:', json);
    return err;
  }

  function accountFetch(name, token, body) {
    var controller = typeof AbortController === 'function' ? new AbortController() : null;
    return new Promise(function (resolve, reject) {
      var settled = false;
      var timer = setTimeout(function () {
        if (settled) return;
        settled = true;
        if (controller) controller.abort();
        reject(clientFailureError('連線逾時，伺服器結果尚未確認', 'client_timeout', true));
      }, CLIENT_FAILURE_TIMEOUT_MS);
      var options = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: cfg.anonKey, Authorization: 'Bearer ' + token },
        body: JSON.stringify(body || {})
      };
      if (controller) options.signal = controller.signal;
      fetch(accountFnUrl(name), options).then(function (res) {
        return res.json().catch(function () { return null; }).then(function (json) {
          if (!res.ok) throw accountFnError(name, res, json);
          if (!json || typeof json !== 'object') {
            throw clientFailureError('伺服器回應格式不完整，操作結果尚未確認', 'invalid_response', true);
          }
          return json;
        });
      }).then(function (json) {
        if (settled) return;
        settled = true; clearTimeout(timer); resolve(json);
      }, function (error) {
        if (settled) return;
        settled = true; clearTimeout(timer);
        if (!error || (!error.status && !error.uncertain)) {
          error = clientFailureError('網路中斷，伺服器結果尚未確認', 'network_unavailable', true);
        }
        reject(error);
      });
    });
  }

  function uncertainMutationMessage(action) {
    return '⚠️ 無法確認「' + action + '」是否已完成。請重新載入並檢查目前狀態；確認前請勿連續重複送出。';
  }

  // เรียก Edge Function ธรรมดา (ไม่ต้องการ JWT สดใหม่) — ใช้ access_token ปัจจุบันของ session ตรงๆ
  function callAccountFn(name, body) {
    return withClientTimeout(sb.auth.getSession(), '確認登入狀態', false).then(function (sres) {
      if (sres && sres.error) {
        throw clientFailureError('無法確認登入狀態，請稍後再試', 'session_unavailable', false);
      }
      var token = sres && sres.data && sres.data.session && sres.data.session.access_token;
      if (!token) return Promise.reject(new Error('ยังไม่ได้ล็อกอิน หรือ session หมดอายุ — กรุณาล็อกอินใหม่'));
      return accountFetch(name, token, body);
    });
  }

  // account-delete ต้องการ JWT ที่ "เพิ่งออกใหม่จริง" (iat ไม่เกิน 5 นาที ตามที่ฟังก์ชันฝั่งเซิร์ฟเวอร์เช็ค)
  // สั่ง refreshSession() ก่อนเสมอเพื่อให้ได้ access_token ใหม่จริง (Supabase ออก token ใหม่จริงตอน
  // refresh ไม่ใช่แค่ยืดอายุของเดิม) — ฟังก์ชันฝั่งเซิร์ฟเวอร์เขียนคอมเมนต์ไว้ชัดว่ายอมรับวิธีนี้แทนการบังคับ
  // ให้ผู้ใช้ล็อกอินซ้ำเต็มรูปแบบผ่าน OAuth redirect ได้ (ง่ายกว่ามากฝั่ง UI ไม่ต้องพา redirect ออกนอกหน้า)
  function callAccountFnFresh(name, body) {
    return withClientTimeout(sb.auth.refreshSession(), '更新登入狀態', false).then(function (r) {
      if (r && r.error) {
        throw clientFailureError('無法更新登入狀態，請重新登入後再試', 'session_refresh_failed', false);
      }
      var token = r && r.data && r.data.session && r.data.session.access_token;
      if (!token) throw new Error('ไม่สามารถต่อ session ได้ — กรุณาออกจากระบบแล้วล็อกอินใหม่ก่อนลองอีกครั้ง');
      return accountFetch(name, token, body);
    });
  }

  // ── ข้อ 6: ออกจากระบบทุกอุปกรณ์ (ต่างจาก doLogout() ปกติที่ signOut scope 'local' แค่เครื่องนี้) ──
  function doLogoutAllDevices() {
    return sb.auth.signOut({ scope: 'global' }).then(function (res) {
      if (res && res.error) {
        console.warn('[auth] global signOut failed:', res.error.message || res.error);
        showAuthActionFailure('⚠️ 無法登出所有裝置，登入狀態仍保留，請檢查網路後再試一次');
        return res;
      }
      clearAuthUiCaches();
      return res;
    }, function (error) {
      console.warn('[auth] global signOut failed:', (error && error.message) || error);
      showAuthActionFailure('⚠️ 無法登出所有裝置，登入狀態仍保留，請檢查網路後再試一次');
      return { error: error };
    });
  }
  API.doLogoutAllDevices = doLogoutAllDevices;

  // ── ข้อ 2: ส่งออกข้อมูลของตัวเอง (JSON) ──
  function doExportMyData(btn, msgEl) {
    btn.disabled = true; btn.textContent = '匯出中…';
    if (msgEl) { msgEl.style.display = 'none'; }
    callAccountFn('account-export', {}).then(function (data) {
      var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'mrtaihualin-export-' + new Date().toISOString().slice(0, 10) + '.json';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
      btn.disabled = false; btn.textContent = '📦 匯出我的資料';
    }).catch(function (e) {
      btn.disabled = false; btn.textContent = '📦 匯出我的資料';
      // 2026-08-08: e.message ตอนนี้คือข้อความที่เซิร์ฟเวอร์ตั้งใจให้ผู้ใช้อ่าน (json.message) แล้ว
      // ไม่ใช่ raw error code อีกต่อไป — code ดิบ (e.code) ถูก console.error ไว้แล้วใน accountFnError()
      if (msgEl) { msgEl.style.display = 'block'; msgEl.textContent = '⚠️ 匯出失敗：' + (e && e.message || String(e)); }
    });
  }

  // ── ข้อ 3: ถอดช่องทางล็อกอิน (server จะปฏิเสธเองถ้าถอดแล้วไม่เหลือช่องทางล็อกอิน) ──
  // 2026-08-08: เปลี่ยนมาใช้ callAccountFnFresh (เหมือน account-delete) ตามที่ Lin สั่งให้บังคับ
  // JWT สดใหม่ก่อนถอดช่องทางล็อกอินด้วย — ฝั่งเซิร์ฟเวอร์เข้มขึ้นแล้ว ฝั่งนี้ต้องตามให้ทัน ไม่งั้นจะเจอ
  // 401 stale_session ทุกครั้งที่ session ค้างเกิน 5 นาที
  function doUnlinkProvider(provider, btn, msgEl) {
    btn.disabled = true;
    if (msgEl) { msgEl.style.display = 'none'; }
    callAccountFnFresh('account-unlink', { provider: provider }).then(function () {
      // สำเร็จ — ปิด modal แล้วเปิดใหม่ให้ดึงข้อมูล identities ปัจจุบันกลับมาแสดงใหม่ (ง่ายกว่า patch DOM เอง)
      closeManageModal();
      openAccountManageModal();
    }).catch(function (e) {
      btn.disabled = !!(e && e.uncertain);
      // 2026-08-08: เดิมมี special-case เช็ค e.body.error === 'would_leave_zero_login_methods' แยกข้อความ
      // เอง — ตอนนี้เซิร์ฟเวอร์ส่ง message ที่เป็นมิตรมาให้ทุก error code แล้ว (รวมเคสนี้ด้วย) เลยไม่ต้อง
      // hardcode ซ้ำในนี้อีก ใช้ e.message ตรงๆ ได้เลยทุกกรณี (raw code ยัง log ไว้แล้วใน accountFnError())
      //
      // 🆕 2026-08-10 (P7-02 staging บั๊กที่เจอจริง — "ปุ่มผี"): เว็บตัดสินว่าบัญชีนี้ผูก LINE ไว้หรือยัง
      // จาก app_metadata ใน JWT ของผู้ใช้ (ดู openAccountManageModal) แต่ฝั่งเซิร์ฟเวอร์ตัดสินจากตาราง
      // line_identities จริง — 2 ที่นี้ไม่ตรงกันได้ (เจอจริง: JWT ค้างค่าเก่า ทั้งที่แถวใน line_identities
      // เป็นของ user คนอื่น) ผลคือแถวนั้นโชว์ปุ่ม "解除連結" ให้กด แต่กดกี่ครั้งก็ล้มเหลวตลอดกาล
      // ผู้ใช้ไม่มีทางรู้ว่าต้องทำยังไงต่อ — เจอ not_linked เมื่อไหร่ = เซิร์ฟเวอร์ยืนยันแล้วว่าช่องทางนี้
      // ไม่มีอยู่จริง จึงเอาแถวนั้นออกจากหน้าจอทันที (ฝั่งเซิร์ฟเวอร์เป็นความจริงหลักเสมอ ไม่ใช่ JWT)
      var code = e && e.body && e.body.error;
      if (code === 'not_linked') {
        try {
          var row = btn.parentNode;
          if (row && row.parentNode) row.parentNode.removeChild(row);
        } catch (e2) {}
        if (msgEl) {
          msgEl.style.display = 'block';
          msgEl.textContent = '這個登入方式其實沒有連接在這個帳號上（畫面上是舊資料），已經幫你從清單移除了';
        }
        return;
      }
      if (msgEl) {
        msgEl.style.display = 'block';
        msgEl.textContent = e && e.uncertain
          ? uncertainMutationMessage('解除登入方式')
          : '⚠️ 解除失敗：' + (e && e.message || String(e));
      }
    });
  }

  // ── 2026-08-08 (รอบ 2): จุดเดียวที่ตัดสินว่า danger zone จะโชว์อะไร — เรียกทันทีตอนเปิด modal
  //   (ไม่ใช่รอผู้ใช้กดปุ่มก่อนเหมือนเดิม) เพราะ Lin สั่งว่า "ต้องแสดงให้ผู้ใช้เห็นชัดว่าบัญชีกำลังรอลบ"
  //   — ถ้ารอให้กดปุ่มก่อนถึงจะรู้ ผู้ใช้ที่มีคำขอค้างอยู่แล้วจะไม่เห็น banner เลยจนกว่าจะกดปุ่มลบซ้ำ
  //   ใช้ preview เดิมตัวเดียวกัน (มี field pending_deletion ติดมาด้วยอยู่แล้วจากฝั่งเซิร์ฟเวอร์) ไม่ต้อง
  //   เพิ่ม action ใหม่แค่เพื่อเช็คสถานะ — แลกกับ fresh-JWT refresh 1 ครั้งทุกครั้งที่เปิด modal (ยอมรับได้
  //   เพราะ refreshSession() เร็ว ไม่ใช่ full OAuth redirect)
  function renderDangerZone(container) {
    container.innerHTML = '<div style="font-size:12px;color:#8B7340;padding:4px 0;">檢查帳號狀態中…</div>';
    callAccountFnFresh('account-delete', { action: 'preview' }).then(function (preview) {
      if (preview.pending_deletion) {
        renderPendingDeletionBanner(container, preview.pending_deletion);
      } else {
        renderDeleteStartButton(container);
      }
    }).catch(function (e) {
      container.innerHTML = '<div style="font-size:13px;color:#b91c1c;font-weight:700;margin-bottom:8px;">危險區域</div>' +
        '<div style="font-size:12px;color:#b45309;">⚠️ 讀取帳號狀態失敗：' + esc(e && e.message || String(e)) + '</div>';
    });
  }

  // 帳號正在等待刪除 — 顯示明確的 banner + 倒數日期 + 取消按鈕（Lin 要求：cooldown 期間必須讓使用者
  // 清楚看到帳號正在等待刪除，以及排定刪除的日期）
  function renderPendingDeletionBanner(container, pending) {
    var when = new Date(pending.scheduled_delete_at);
    var whenText = isNaN(when.getTime()) ? pending.scheduled_delete_at : when.toLocaleString('zh-TW', { dateStyle: 'long', timeStyle: 'short' });
    container.innerHTML =
      '<div style="font-size:13px;color:#b91c1c;font-weight:700;margin-bottom:8px;">危險區域</div>' +
      '<div style="border:1.5px solid #b91c1c;background:#FEF2F2;border-radius:10px;padding:12px 14px;margin-bottom:10px;">' +
        '<div style="font-size:13px;color:#991b1b;font-weight:800;margin-bottom:4px;">⏳ 帳號已排定刪除</div>' +
        '<div style="font-size:12.5px;color:#7f1d1d;line-height:1.6;">將於 <b>' + esc(whenText) + '</b> 之後的系統例行處理中永久刪除（系統每日執行一次，不會提前，但可能略晚於此時間點），屆時資料將無法復原。</div>' +
        '<div style="font-size:12px;color:#7f1d1d;line-height:1.6;margin-top:4px;">期限前隨時可以取消，帳號會立即恢復正常，資料完全不受影響。</div>' +
      '</div>' +
      '<div id="sap-cancel-msg" style="display:none;font-size:12px;color:#b45309;margin-bottom:10px;line-height:1.5;"></div>' +
      '<button id="sap-cancel-go" style="width:100%;border:none;background:#2d6a4f;color:#fff;border-radius:10px;padding:12px;font-size:14px;font-weight:800;cursor:pointer;">取消刪除帳號</button>';
    var goBtn = container.querySelector('#sap-cancel-go');
    var msgEl = container.querySelector('#sap-cancel-msg');
    goBtn.onclick = function () {
      goBtn.disabled = true; goBtn.textContent = '取消中…';
      // cancel ไม่บังคับ fresh JWT ฝั่งเซิร์ฟเวอร์ (ดูเหตุผลใน account-delete/index.ts) แต่ใช้
      // callAccountFnFresh เหมือนกันเพื่อความง่าย (fresh JWT ผ่านได้อยู่แล้วเสมอ ไม่มีผลเสีย)
      callAccountFnFresh('account-delete', { action: 'cancel' }).then(function () {
        container.innerHTML = '<div style="font-size:13px;color:#2d6a4f;font-weight:700;">✅ 已取消刪除帳號請求，帳號已恢復正常。</div>';
        setTimeout(function () { renderDeleteStartButton(container); }, 1600);
      }).catch(function (e) {
        goBtn.disabled = !!(e && e.uncertain);
        goBtn.textContent = e && e.uncertain ? '請重新載入確認' : '取消刪除帳號';
        msgEl.style.display = 'block';
        msgEl.textContent = e && e.uncertain
          ? uncertainMutationMessage('取消刪除帳號')
          : '⚠️ 取消失敗：' + (e && e.message || String(e));
      });
    };
  }

  // สถานะปกติ (ไม่มีคำขอลบค้างอยู่) — โชว์ปุ่ม "🗑️ 刪除帳號" แบบเดิม
  function renderDeleteStartButton(container) {
    container.innerHTML =
      '<div style="font-size:13px;color:#b91c1c;font-weight:700;margin-bottom:8px;">危險區域</div>' +
      '<button id="sam-delete-start" style="width:100%;border:1.5px solid #b91c1c;background:#fff;color:#b91c1c;border-radius:10px;padding:10px;font-size:13.5px;font-weight:700;cursor:pointer;">🗑️ 刪除帳號</button>';
    container.querySelector('#sam-delete-start').onclick = function () { openDeleteAccountFlow(container); };
  }

  // ── ข้อ 1: ยื่นคำขอลบบัญชี — 2 ขั้น (preview → พิมพ์ยืนยัน → request เข้า cooldown 7 วัน) ──
  // 🆕 2026-08-08 (รอบ 2): เดิม action='confirm' ลบทันที เปลี่ยนเป็น action='request' เข้าคิวรอ 7 วัน
  //   ไม่ลบอะไรจริงในขั้นนี้ — ตั้งใจไม่เปลี่ยนชื่อ field 'confirm' ใน body (ยังต้องส่ง confirm:true เหมือน
  //   เดิม) ฝั่งเซิร์ฟเวอร์ยังใช้ field นี้เป็นด่านกันกดพลาดเหมือนเดิม แค่ action เปลี่ยนความหมาย
  function openDeleteAccountFlow(container) {
    container.innerHTML = '<div style="font-size:12.5px;color:#8B7340;padding:8px 0;">正在讀取將被刪除的資料…</div>';
    callAccountFnFresh('account-delete', { action: 'preview' }).then(function (preview) {
      if (preview.pending_deletion) {
        // race: อีกแท็บ/อุปกรณ์เพิ่งยื่นคำขอไปพอดีระหว่างที่ modal นี้เปิดค้างไว้ — โชว์ banner แทน
        renderPendingDeletionBanner(container, preview.pending_deletion);
        return;
      }
      var rows = '';
      function line(label, obj) {
        Object.keys(obj || {}).forEach(function (k) {
          var v = obj[k];
          rows += '<div style="display:flex;justify-content:space-between;font-size:12px;color:#8B7340;padding:2px 0;"><span>' + esc(label) + '：' + esc(k) + '</span><span>' + esc(typeof v === 'object' ? (v && v.error ? '無法確認' : JSON.stringify(v)) : v) + '</span></div>';
        });
      }
      line('將永久刪除', preview.will_delete);
      line('將移除個資後保留', preview.will_anonymize);
      line('將一併清除', preview.will_cascade_delete);
      container.innerHTML =
        '<div style="font-size:13px;color:#8B7340;font-weight:700;margin-bottom:6px;">刪除帳號後，以下資料會受影響：</div>' +
        '<div style="max-height:160px;overflow:auto;border:1px solid #E5D9B8;border-radius:8px;padding:8px 10px;margin-bottom:10px;">' + rows + '</div>' +
        '<div style="font-size:12px;color:#b45309;margin-bottom:10px;line-height:1.6;">⚠️ 送出後帳號會進入 7 天等待期，期限前可隨時取消；逾期未取消，系統將於之後的例行處理中（每日一次）永久刪除且無法復原。請在下方輸入「刪除帳號」以確認：</div>' +
        '<input id="sap-del-confirm-text" placeholder="輸入：刪除帳號" style="width:100%;box-sizing:border-box;margin-bottom:10px;padding:10px 12px;border:1.5px solid #E5D9B8;border-radius:10px;font-size:14px;">' +
        '<div id="sap-del-msg" style="display:none;font-size:12px;color:#b45309;margin-bottom:10px;line-height:1.5;"></div>' +
        '<button id="sap-del-go" disabled style="width:100%;border:none;background:#9CA3AF;color:#fff;border-radius:10px;padding:12px;font-size:14px;font-weight:800;cursor:not-allowed;">送出刪除請求</button>';
      var input = container.querySelector('#sap-del-confirm-text');
      var goBtn = container.querySelector('#sap-del-go');
      var msgEl = container.querySelector('#sap-del-msg');
      input.oninput = function () {
        var ok = input.value.trim() === '刪除帳號';
        goBtn.disabled = !ok;
        goBtn.style.background = ok ? '#b91c1c' : '#9CA3AF';
        goBtn.style.cursor = ok ? 'pointer' : 'not-allowed';
      };
      goBtn.onclick = function () {
        goBtn.disabled = true; goBtn.textContent = '送出中…';
        callAccountFnFresh('account-delete', { action: 'request', confirm: true }).then(function (result) {
          renderPendingDeletionBanner(container, { scheduled_delete_at: result.scheduled_delete_at });
        }).catch(function (e) {
          goBtn.disabled = !!(e && e.uncertain);
          goBtn.textContent = e && e.uncertain ? '請重新載入確認' : '送出刪除請求';
          msgEl.style.display = 'block';
          msgEl.textContent = e && e.uncertain
            ? uncertainMutationMessage('送出刪除請求')
            : '⚠️ 送出失敗：' + (e && e.message || String(e));
        });
      };
    }).catch(function (e) {
      container.innerHTML = '<div style="font-size:12.5px;color:#b45309;">⚠️ 讀取失敗：' + esc(e && e.message || String(e)) + '</div>';
    });
  }

  function manageProviderRow(provider, label) {
    return '<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;font-size:13px;color:#5C4410;">' +
      '<span>' + esc(label) + '</span>' +
      '<button class="sap-unlink-btn" data-provider="' + esc(provider) + '" style="border:1px solid #E5D9B8;background:#fff;color:#8B7340;border-radius:8px;padding:4px 10px;font-size:11.5px;cursor:pointer;">解除連結</button>' +
      '</div>';
  }

  function openAccountManageModal() {
    if (!API.user) return;
    closeManageModal();
    manageModal = document.createElement('div');
    manageModal.id = 'sa-manage-modal';
    manageModal.style.cssText = 'position:fixed;inset:0;z-index:100002;display:flex;align-items:center;justify-content:center;padding:18px;' +
      'background:rgba(28,18,4,0.82);backdrop-filter:blur(5px);-webkit-backdrop-filter:blur(5px);font-family:"Noto Sans TC",sans-serif;';

    var identities = API.user.identities || [];
    var linkedProviders = identities.map(function (i) { return i.provider; });
    var isSyntheticLineEmail = /^line-.+@users\.line\.invalid$/i.test(API.user.email || '');
    var providerLabel = { google: 'Google', facebook: 'Facebook', email: 'Email' };
    var providerRows = '';
    linkedProviders.forEach(function (p) {
      if (p === 'email' && isSyntheticLineEmail) return; // อีเมลปลอมของ LINE — ไม่โชว์ให้ถอด (server ก็ปฏิเสธอยู่แล้ว)
      if (!providerLabel[p]) return;
      providerRows += manageProviderRow(p, providerLabel[p]);
    });

    manageModal.innerHTML =
      '<div style="background:#fff;max-width:380px;width:100%;border-radius:18px;padding:22px 20px 18px;box-shadow:0 18px 50px rgba(0,0,0,0.35);max-height:88vh;overflow:auto;">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">' +
          '<h2 style="margin:0;font-size:17px;color:#5C4410;font-weight:800;">帳號管理</h2>' +
          '<button id="sam-close" style="border:none;background:none;font-size:20px;color:#C3B594;cursor:pointer;line-height:1;">✕</button>' +
        '</div>' +

        '<div style="font-size:13px;color:#8B7340;font-weight:700;margin-bottom:6px;">登入方式</div>' +
        '<div id="sam-providers" style="margin-bottom:8px;">' + providerRows + '</div>' +
        '<div id="sam-line-provider-status" style="font-size:12px;color:#A07A1E;margin-bottom:8px;">正在確認 LINE 連接狀態…</div>' +
        '<div id="sam-unlink-msg" style="display:none;font-size:12px;color:#b45309;margin-bottom:14px;line-height:1.5;"></div>' +

        '<div style="height:1px;background:#F0E6CC;margin:14px 0;"></div>' +

        '<div style="font-size:13px;color:#8B7340;font-weight:700;margin-bottom:8px;">我的資料</div>' +
        '<button id="sam-export" style="width:100%;border:1.5px solid #C8973A;background:#fff;color:#8B6310;border-radius:10px;padding:10px;font-size:13.5px;font-weight:700;cursor:pointer;margin-bottom:8px;">📦 匯出我的資料</button>' +
        '<div id="sam-export-msg" style="display:none;font-size:12px;color:#b45309;margin-bottom:6px;line-height:1.5;"></div>' +
        '<button id="sam-logout-all" style="width:100%;border:1.5px solid #E5D9B8;background:#fff;color:#8B7340;border-radius:10px;padding:10px;font-size:13.5px;font-weight:700;cursor:pointer;">📴 登出所有裝置</button>' +
        '<div id="sam-logout-all-msg" role="status" style="display:none;font-size:12px;color:#b45309;margin-top:6px;line-height:1.5;"></div>' +

        '<div style="height:1px;background:#F0E6CC;margin:14px 0;"></div>' +

        '<div id="sam-danger-zone"><div style="font-size:12px;color:#8B7340;padding:4px 0;">檢查帳號狀態中…</div></div>' +
      '</div>';
    document.body.appendChild(manageModal);

    function closeM() { closeManageModal(); }
    manageModal.querySelector('#sam-close').onclick = closeM;
    manageModal.addEventListener('click', function (e) { if (e.target === manageModal) closeM(); });

    var unlinkMsg = manageModal.querySelector('#sam-unlink-msg');
    function bindUnlinkButtons(root) {
      [].forEach.call(root.querySelectorAll('.sap-unlink-btn'), function (btn) {
        btn.onclick = function () { doUnlinkProvider(btn.getAttribute('data-provider'), btn, unlinkMsg); };
      });
    }
    bindUnlinkButtons(manageModal);

    var lineProviderStatus = manageModal.querySelector('#sam-line-provider-status');
    callAccountFn('account-unlink', { action: 'status' }).then(function (status) {
      if (!lineProviderStatus.parentNode) return;
      if (status && status.line_linked === true) {
        lineProviderStatus.innerHTML = manageProviderRow('line', 'LINE');
        lineProviderStatus.style.color = '';
        bindUnlinkButtons(lineProviderStatus);
      } else {
        lineProviderStatus.textContent = 'LINE 尚未連接到這個帳號';
      }
    }).catch(function () {
      if (!lineProviderStatus.parentNode) return;
      lineProviderStatus.textContent = '⚠️ 無法確認 LINE 連接狀態，請稍後再試';
      lineProviderStatus.style.color = '#b45309';
    });

    var exportBtn = manageModal.querySelector('#sam-export');
    var exportMsg = manageModal.querySelector('#sam-export-msg');
    exportBtn.onclick = function () { doExportMyData(exportBtn, exportMsg); };

    var logoutAllBtn = manageModal.querySelector('#sam-logout-all');
    var logoutAllMsg = manageModal.querySelector('#sam-logout-all-msg');
    logoutAllBtn.onclick = function () {
      logoutAllBtn.disabled = true;
      logoutAllBtn.textContent = '登出中…';
      logoutAllMsg.style.display = 'none';
      doLogoutAllDevices().then(function (res) {
        if (res && res.error) {
          logoutAllBtn.disabled = false;
          logoutAllBtn.textContent = '📴 登出所有裝置';
          logoutAllMsg.style.display = 'block';
          logoutAllMsg.textContent = '⚠️ 登出失敗，帳號仍保持登入，請檢查網路後再試一次。';
          return;
        }
        closeM();
      });
    };

    // 🆕 2026-08-08 (รอบ 2): เช็คสถานะคำขอลบทันทีตอนเปิด modal (ดูเหตุผลที่ renderDangerZone ด้านบน)
    // แทนที่จะรอผู้ใช้กดปุ่มก่อนเหมือนเดิม — เพื่อให้เห็น banner "กำลังรอลบ" ได้ทันทีถ้ามีคำขอค้างอยู่
    renderDangerZone(manageModal.querySelector('#sam-danger-zone'));
  }
  API.openAccountManageModal = openAccountManageModal;

  // ----- [04] BADGE RENDERING + MODAL VISIBILITY -----
  // มี modal อื่นเปิดอยู่ไหม (จองเรียน/QR ฯลฯ) → ถ้าเปิด ซ่อน badge กันทับปุ่มกากบาท
  function anyModalOpen() { try { return !!document.querySelector('.modal-overlay.open'); } catch (e) { return false; } }

  // ── badge ต่อหน้า: แต่ละหน้าเรียก renderBadge(containerId, opts) ครั้งเดียวตอน init ──
  //    ระบบสร้าง <span id="sa-badge-<containerId>"> เป็นลูกของ container นั้น แล้วคุมแค่ตัวเอง
  //    ไม่แตะ children อื่นของ container (กันไปลบปุ่ม/element อื่นที่หน้านั้นวางไว้ในสล็อตเดียวกัน)
  var badgeBindings = [];
  function renderBadge(containerId, opts) {
    opts = opts || {};
    if (!badgeBindings.some(function (b) { return b.containerId === containerId; })) {
      badgeBindings.push({ containerId: containerId, opts: opts });
    }
    if (API.authResolved) paintBadge(containerId, opts);
  }

  function paintBadge(containerId, opts) {
    var host = document.getElementById(containerId);
    if (!host) return; // หน้านั้นไม่มี slot นี้ → ไม่ทำอะไร กันพัง
    var badgeId = 'sa-badge-' + containerId;
    var el = document.getElementById(badgeId);

    if (API.authError) {
      if (!el) { el = document.createElement('span'); el.id = badgeId; host.appendChild(el); }
      el.style.display = 'inline-flex'; el.setAttribute('role', 'status');
      el.innerHTML = '<span style="color:#78350f;background:#fff3d8;border:1px solid #C8973A;border-radius:12px;padding:7px 10px;font:700 12px Noto Sans TC,sans-serif;">登入狀態暫時無法確認，可先使用訪客模式。 <button type="button" class="sa-auth-retry" style="border:1px solid #8B6310;border-radius:999px;background:#fff;color:#8B6310;padding:4px 9px;cursor:pointer;font:inherit;">重新載入</button></span>';
      el.querySelector('.sa-auth-retry').onclick = function () { location.reload(); };
      return;
    }

    if (!API.user) {
      if (el) { el.style.display = 'none'; el.innerHTML = ''; }
      return;
    }
    if (!el) {
      el = document.createElement('span');
      el.id = badgeId;
      host.appendChild(el);
    }

    var email = API.user.email || '使用者';
    var meta = API.user.user_metadata || {};
    var displayName = myNick || meta.full_name || meta.name || meta.user_name || email;
    var selAvatar = myAvatar || getAvatarCache();
    var avatarHTML = '';
    if (selAvatar && selAvatar !== 'none' && selAvatar !== 'google') {
      avatarHTML = '<span style="width:24px;height:24px;border-radius:50%;background:#FBF6EA;display:inline-flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0;">' + esc(selAvatar) + '</span>';
    }
    var pinHTML = '';
    var pin = myBadge || getPinBadgeCache();
    if (pin && window.TF_BADGES_DEF) {
      var bdef = null;
      window.TF_BADGES_DEF.forEach(function (b) { if (b.id === pin) bdef = b; });
      if (bdef) pinHTML = '<span title="' + esc(bdef.zh) + '" style="display:inline-flex;align-items:center;flex-shrink:0;">' + window.tfBadgeIcon(bdef, 20) + '</span>';
    }
    var leaderboardHref = opts.leaderboardHref || 'leaderboard.html';
    var progressHref = opts.progressHref || 'my-progress.html';

    el.style.display = anyModalOpen() ? 'none' : 'inline-flex';
    el.innerHTML =
      '<div style="display:flex;align-items:center;gap:7px;background:#fff;' +
      'border:1.5px solid rgba(200,151,58,0.45);border-radius:20px;padding:5px 12px 5px 8px;' +
      'box-shadow:0 2px 8px rgba(139,99,16,0.12);font-family:\'Noto Sans TC\',sans-serif;">' +
      (avatarHTML || '<span style="font-size:15px;flex-shrink:0;">👤</span>') +
      '<span class="sa-nick" title="點此編輯個人檔案" style="color:#5C4410;font-weight:700;font-size:12.5px;max-width:90px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer;">' + esc(displayName) + '</span>' +
      pinHTML +
      '<button class="sa-edit" title="編輯" style="border:none;background:none;color:#A07A1E;cursor:pointer;font-size:12px;padding:0;line-height:1;">✏️</button>' +
      '<a href="' + esc(leaderboardHref) + '" title="排行榜" style="text-decoration:none;font-size:13px;">🏆</a>' +
      '<a href="' + esc(progressHref) + '" title="進度" style="text-decoration:none;font-size:13px;">📊</a>' +
      '<button class="sa-logout" style="border:none;background:rgba(139,99,16,0.12);color:#8B6310;' +
      'border-radius:20px;padding:3px 10px;cursor:pointer;font-size:11.5px;font-weight:700;">登出</button>' +
      '</div>';
    el.querySelector('.sa-logout').onclick = doLogout;
    el.querySelector('.sa-edit').onclick = openProfileEditor;
    el.querySelector('.sa-nick').onclick = openProfileEditor;
  }

  // ── เฝ้าการเปิด/ปิด modal → ซ่อน/โชว์ badge ทุกอันให้ถูก (ครอบทุกวิธีปิด modal) ──
  try {
    var _modalState = false;
    var _mo = new MutationObserver(function () {
      var s = anyModalOpen();
      if (s !== _modalState) {
        _modalState = s;
        badgeBindings.forEach(function (b) { paintBadge(b.containerId, b.opts); });
      }
    });
    var _startObserve = function () { try { _mo.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'] }); } catch (e) {} };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _startObserve); else _startObserve();
  } catch (e) {}

  // ----- [05] SESSION LOGGING + AUTH BOOT -----
  // กันหลายบัญชี Phase 5: ส่ง fingerprint+IP ไปเก็บที่เซิร์ฟเวอร์ (throttle 1 ครั้ง/6 ชม./เครื่อง)
  //   ข้าม admin (Lin เอง) · fingerprint โหลด lazy จาก FingerprintJS OSS ฟรี · พังก็ยังส่ง IP อย่างเดียว
  var LOGSESS_KEY = 'tf_logsess_at';
  function shouldLogSession() {
    try {
      var last = parseInt(localStorage.getItem(LOGSESS_KEY) || '0', 10);
      return (Date.now() - last) > 6 * 3600 * 1000;
    } catch (e) { return true; }
  }
  function logSession() {
    if (!API.user || API.user.email === ADMIN_EMAIL || !shouldLogSession()) return;
    try { localStorage.setItem(LOGSESS_KEY, String(Date.now())); } catch (e) {} // จองก่อน กันยิงซ้ำ
    var send = function (fp) {
      try { sb.functions.invoke('log-session', { body: { fingerprint: fp || '', event: 'login' } }).catch(function () {}); } catch (e) {}
    };
    try {
      import('https://openfpcdn.io/fingerprintjs/v4')
        .then(function (m) { return m.default.load(); })
        .then(function (fp) { return fp.get(); })
        .then(function (r) { send((r && r.visitorId) || ''); })
        .catch(function () { send(''); });
    } catch (e) { send(''); }
  }

  // 2026-08-08 (P6-09~12 ก้อน 2): ตรวจว่าเพิ่ง redirect กลับมาจากการเชื่อม Facebook สำเร็จไหม แล้ว
  //   บันทึก audit log ผ่าน RPC log_account_audit — ไม่มีจุด server-side ให้เกาะแบบ LINE (Facebook
  //   ใช้ sb.auth.linkIdentity() มาตรฐานของ Supabase ตรงๆ ไม่ผ่าน Edge Function ของเราเอง) จึงต้อง
  //   ตรวจฝั่ง client แทน — ใช้ครั้งเดียวแล้วลบทิ้งทันที (กันบันทึกซ้ำถ้า boot()/onAuthStateChange
  //   ยิงมากกว่า 1 ครั้งหลัง redirect กลับมา) ไม่ critical ถ้าพลาด (การเชื่อมจริงสำเร็จอยู่แล้วไม่เกี่ยวกัน)
  // 2026-08-10 (P7-02 staging บั๊กที่เจอจริง): เดิมถ้าเชื่อม Facebook ไม่สำเร็จ (เช่น Facebook คนนี้
  // ผูกกับบัญชีอื่นไปแล้ว — Supabase ปฏิเสธฝั่ง server หลัง redirect กลับมา) ฟังก์ชันนี้แค่ return เงียบๆ
  // ไม่มีข้อความอะไรบอกผู้เล่นเลยว่าทำไมปุ่มยังโชว์ "連接 Facebook 帳號" เหมือนเดิม ผิดกฎ "ห้ามพังเงียบ"
  // (เจอจริง 2026-08-10: Lin ทดสอบด้วย Facebook ที่เคยผูกกับอีกบัญชีไปแล้ว กดเชื่อมแล้วไม่มีอะไรขึ้นเลย)
  // แก้โดยโชว์ toast สีธีมเว็บ (ไม่ใช้สีแดง/เขียวทั่วไป) บอกเหตุผลที่เป็นไปได้มากที่สุดตรงๆ
  function showFbLinkFailToast() {
    try {
      var old = document.getElementById('sa-fb-link-fail-toast');
      if (old) old.remove();
      var d = document.createElement('div');
      d.id = 'sa-fb-link-fail-toast';
      d.style.cssText = 'position:fixed;bottom:90px;left:50%;transform:translateX(-50%);z-index:100001;' +
        'max-width:88vw;background:#78350f;color:#fff;border-radius:12px;padding:10px 16px;' +
        'font-size:13px;font-family:"Noto Sans TC",sans-serif;line-height:1.6;text-align:center;' +
        'box-shadow:0 4px 16px rgba(0,0,0,0.28);';
      d.textContent = '⚠️ 連接 Facebook 帳號失敗——這個 Facebook 帳號可能已經連接過其他帳號了';
      document.body.appendChild(d);
      setTimeout(function () { if (d.parentNode) d.remove(); }, 6000);
    } catch (e) {}
  }
  // 2026-08-10 (P7-02 staging บั๊กร้ายแรงกว่าที่คิดตอนแรก): ถ้า Facebook ที่กด "連接" ผูกกับบัญชีอื่น
  // ไปแล้ว Supabase ไม่ได้ตอบ error กลับมาเฉยๆ (กรณีที่ showFbLinkFailToast ด้านบนดัก) — แต่ "สลับ session
  // ไปเป็นบัญชีที่ Facebook นั้นผูกอยู่แล้วให้เงียบๆ" แทน ผู้เล่นจะเห็น badge/ชื่อ/คะแนนของอีกบัญชีนึงทันที
  // โดยไม่รู้ตัวว่าโดนสลับบัญชี (พิสูจน์จริง 2026-08-10: user_id หลัง redirect กลับมาไม่ตรงกับก่อนกด "連接")
  // อันตรายกว่าแค่ "เชื่อมไม่สำเร็จ" เพราะดูเหมือนสำเร็จ (ปุ่มเปลี่ยนเป็น "✅ 已連接") ทั้งที่จริงคือคนละบัญชี
  // เดิม (ก่อน 2026-08-10 รอบ 2) โค้ดจุดนี้ return เงียบๆ เพราะ user_id ไม่ตรง — ตอนนี้ต้องแยกเช็คแล้วเตือนดังๆ
  function showAccountSwitchedToast() {
    try {
      var old = document.getElementById('sa-fb-switch-toast');
      if (old) old.remove();
      var d = document.createElement('div');
      d.id = 'sa-fb-switch-toast';
      d.style.cssText = 'position:fixed;bottom:90px;left:50%;transform:translateX(-50%);z-index:100002;' +
        'max-width:92vw;width:340px;background:#78350f;color:#fff;border-radius:12px;padding:14px 16px;' +
        'font-size:13px;font-family:"Noto Sans TC",sans-serif;line-height:1.6;text-align:center;' +
        'box-shadow:0 4px 16px rgba(0,0,0,0.3);';
      d.innerHTML = '⚠️ 這個 Facebook 帳號已經連接過別的帳號——系統剛剛把你切換到那個帳號了，<b>不是你原本在用的帳號</b><br>' +
        '<button id="sa-fb-switch-logout" style="margin-top:10px;border:none;background:#fff;color:#78350f;border-radius:8px;padding:8px 14px;font-weight:700;cursor:pointer;">登出，換回原本帳號</button>';
      document.body.appendChild(d);
      var btn = document.getElementById('sa-fb-switch-logout');
      if (btn) btn.onclick = function () { doLogout(); };
      // ข้อความนี้สำคัญกว่า toast ทั่วไป — ไม่หายเองอัตโนมัติ ให้ผู้เล่นกดปิด/กดปุ่มเองเท่านั้น
    } catch (e) {}
  }
  function checkPendingFacebookLinkAudit() {
    var raw;
    try { raw = sessionStorage.getItem(FB_LINK_PENDING_KEY); } catch (e) { return; }
    if (!raw) return;
    try { sessionStorage.removeItem(FB_LINK_PENDING_KEY); } catch (e) {} // ใช้ครั้งเดียว อ่านแล้วลบทันที
    if (!API.user) return;
    var pending;
    try { pending = JSON.parse(raw); } catch (e) { return; }
    if (!pending) return;
    if (pending.user_id !== API.user.id) { showAccountSwitchedToast(); return; } // โดนสลับบัญชีเงียบๆ — ต้องเตือนดังๆ
    var providersAfter = (API.user.identities || []).map(function (i) { return i.provider; });
    if (providersAfter.indexOf('facebook') === -1) { showFbLinkFailToast(); return; } // เชื่อมไม่สำเร็จ — ต้องบอกผู้เล่นตรงๆ ห้ามเงียบ
    try {
      sb.rpc('log_account_audit', {
        p_user_id: API.user.id,
        p_event_type: 'link',
        p_provider: 'facebook',
        p_before_state: { providers: pending.providers_before || [] },
        p_after_state: { providers: providersAfter },
        p_actor_type: 'user',
        p_actor_id: API.user.id
      }).then(function (res) {
        if (res && res.error) console.error('log_account_audit failed (facebook link)', res.error);
      }).catch(function (e) { console.error('log_account_audit threw (facebook link)', e); });
    } catch (e) {}
  }

  // ── init: session เดียว ฟังเดียว (client กลาง) ใช้ร่วมกันทุกหน้าที่โหลดไฟล์นี้ ──
  function handleInitialSessionError(error) {
    // Session is unknown, not logged out. Never bind null/clear account-owned local cache here.
    console.warn('[auth] getSession failed:', (error && error.message) || error);
    API.user = null; API.authResolved = true; API.authError = 'session_unavailable';
    fireChange();
  }

  function boot() {
    sb.auth.getSession().then(function (res) {
      // Supabase can resolve the promise with { error }. Only an error-free null session
      // is a confirmed logged-out state and may cross the learning-owner boundary.
      if (res && res.error) { handleInitialSessionError(res.error); return; }
      API.authError = null;
      API.user = (res.data && res.data.session && res.data.session.user) || null;
      API.authResolved = true;
      bindLearningOwner(API.user);
      fireChange();
      fetchProfile();
      if (API.user) { logSession(); checkPendingFacebookLinkAudit(); }
    }, handleInitialSessionError);
    sb.auth.onAuthStateChange(function (_event, session) {
      API.authError = null;
      API.user = (session && session.user) || null;
      API.authResolved = true;
      bindLearningOwner(API.user);
      myNick = myAvatar = myBadge = null; // เคลียร์โปรไฟล์เดิม แล้วดึงของ user ปัจจุบันใหม่
      fireChange();
      fetchProfile();
      if (API.user) { logSession(); checkPendingFacebookLinkAudit(); }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
