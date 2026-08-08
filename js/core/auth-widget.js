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
    // Supabase ยังไม่พร้อม/โหลดไม่ได้ → คืน API เปล่า กันหน้าเว็บพัง (เกมยังเล่นได้ปกติ)
    window.SITE_AUTH = {
      ready: false, user: null, authResolved: false,
      onChange: function () {}, doLogout: function () {},
      openProfileEditor: function () {}, renderBadge: function () {}
    };
    return;
  }

  var sb = window.getSupabaseClient ? window.getSupabaseClient() : window.supabase.createClient(cfg.url, cfg.anonKey);
  var ADMIN_EMAIL = 'mr.taihualin@gmail.com';
  // v1 (LIN 2026-07-25, audit): กันแอดมิน (Lin เอง) โดนนับเข้า leaderboard ตอนทดสอบล็อกอินด้วย
  //   Facebook/LINE — 2 ช่องทางนี้อาจไม่มีอีเมลเลย (LINE เปิด "Allow users without email")
  //   เช็คแค่ email อย่างเดียวจะพลาด (email ว่าง ≠ ADMIN_EMAIL เสมอ) ต้องมี user id สำรองด้วย
  //   วิธีใช้: หลัง Lin ทดสอบล็อกอินด้วย Facebook/LINE ครั้งแรก ไปเอา user id จาก Supabase Dashboard
  //   → Authentication → Users มาใส่ในลิสต์นี้ (ใช้ร่วมกันทุกไฟล์ที่ต้องกันแอดมิน: reading-auth.js, tone-companion.js)
  //   ⚠️ อย่าลืมอัปเดต SQL ฟังก์ชัน combined_leaderboard ให้กันด้วย (ตอนนี้กันแค่ email อย่างเดียวเหมือนกัน)
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
    onChange: onChange,
    doLogout: doLogout,
    openProfileEditor: openProfileEditor,
    renderBadge: renderBadge
  };
  window.SITE_AUTH = API;

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

  function doLogout() {
    // onAuthStateChange จะเคลียร์ user + สั่ง re-render ให้เองอัตโนมัติ
    sb.auth.signOut();
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
    // v1 (LIN 2026-07-26): ปุ่ม "連接 LINE 帳號" — ให้คนที่ล็อกอินอยู่แล้ว (Google/Email/Facebook)
    //   ผูก LINE เข้ากับบัญชีเดิมได้ กันได้บัญชีแยกตอนล็อกอินด้วย LINE ครั้งแรก (เจอจริงจาก Lin ทดสอบ)
    //   โชว์เฉพาะตอนมี window.READING_AUTH.startLineLink (หน้าเกมที่โหลด reading-auth.js) +
    //   ตั้งค่า lineChannelId แล้ว + ยังไม่เคยผูกมาก่อน (เช็คจาก app_metadata คร่าวๆ)
    var alreadyLinkedLine = !!(API.user.app_metadata && (API.user.app_metadata.line_linked || API.user.app_metadata.line_user_id));
    var canLinkLine = window.READING_AUTH && typeof window.READING_AUTH.startLineLink === 'function' &&
      window.SUPABASE_CONFIG && window.SUPABASE_CONFIG.lineChannelId && !alreadyLinkedLine;
    var linkLineHtml = canLinkLine
      ? '<button id="sap-link-line" style="width:100%;border:1.5px solid #06C755;background:#fff;color:#06C755;border-radius:10px;padding:11px;font-size:14px;font-weight:700;cursor:pointer;margin-bottom:10px;display:flex;align-items:center;justify-content:center;gap:8px;">' +
          '<svg width="18" height="18" viewBox="0 0 24 24"><path fill="#06C755" d="M12 2C6.48 2 2 5.69 2 10.24c0 4.08 3.54 7.5 8.32 8.15.32.07.76.21.87.49.1.25.06.65.03.9l-.14.85c-.04.25-.19.98.86.53 1.05-.44 5.67-3.34 7.74-5.72C21.15 13.62 22 12.02 22 10.24 22 5.69 17.52 2 12 2z"/></svg>連接 LINE 帳號</button>'
      : (alreadyLinkedLine ? '<div style="font-size:12px;color:#2d6a4f;margin-bottom:10px;">✅ 已連接 LINE 帳號</div>' : '');

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
        '<label style="font-size:13px;color:#8B7340;font-weight:700;">名稱（會顯示在這裡和排行榜）</label>' +
        '<input id="sap-name" maxlength="20" value="' + esc(curName) + '" placeholder="輸入暱稱（1–20 字）" ' +
          'style="width:100%;box-sizing:border-box;margin:6px 0 16px;padding:10px 12px;border:1.5px solid #E5D9B8;border-radius:10px;font-size:15px;color:#5C4410;">' +
        '<div style="font-size:13px;color:#8B7340;font-weight:700;margin-bottom:8px;">頭像</div>' +
        '<div id="sap-avatars" style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px;">' + avatarChoices + '</div>' +
        '<div style="font-size:13px;color:#8B7340;font-weight:700;margin-bottom:8px;">展示徽章（顯示在名稱旁）</div>' +
        '<div id="sap-badges" style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:18px;">' + badgeChoices + '</div>' +
        linkFacebookHtml +
        linkLineHtml +
        '<button id="sap-save" style="width:100%;border:none;background:#C8973A;color:#fff;border-radius:10px;padding:12px;font-size:15px;font-weight:800;cursor:pointer;">儲存</button>' +
      '</div>';
    document.body.appendChild(profileModal);
    var linkLineBtn = profileModal.querySelector('#sap-link-line');
    if (linkLineBtn) linkLineBtn.onclick = function () { window.READING_AUTH.startLineLink(); };
    // v2 (LIN 2026-07-26): กดแล้ว redirect ไป Facebook ทันที (สำเร็จจะไม่เห็นโค้ดหลังจากนี้ เพราะหน้าเปลี่ยนไปแล้ว)
    //   error ที่เจอได้บ่อยสุด = ยังไม่ได้เปิด "Manual Linking" ใน Supabase Dashboard (ดู comment ด้านบน)
    var linkFbBtn = profileModal.querySelector('#sap-link-fb');
    var linkFbMsg = profileModal.querySelector('#sap-link-fb-msg');
    if (linkFbBtn) linkFbBtn.onclick = function () {
      linkFbBtn.disabled = true; linkFbBtn.style.opacity = '0.6';
      if (linkFbMsg) linkFbMsg.style.display = 'none';
      try {
        sb.auth.linkIdentity({ provider: 'facebook', options: { redirectTo: location.href } }).then(function (res) {
          if (res && res.error) {
            linkFbBtn.disabled = false; linkFbBtn.style.opacity = '1';
            if (linkFbMsg) { linkFbMsg.style.display = 'block'; linkFbMsg.textContent = '⚠️ 連接失敗：' + (res.error.message || '請稍後再試'); }
          }
          // 成功的話 Supabase 會直接把頁面導去 Facebook，不會執行到這裡
        }, function (e) {
          linkFbBtn.disabled = false; linkFbBtn.style.opacity = '1';
          if (linkFbMsg) { linkFbMsg.style.display = 'block'; linkFbMsg.textContent = '⚠️ 連接失敗：' + (e && e.message || '請稍後再試'); }
        });
      } catch (e) {
        linkFbBtn.disabled = false; linkFbBtn.style.opacity = '1';
        if (linkFbMsg) { linkFbMsg.style.display = 'block'; linkFbMsg.textContent = '⚠️ 連接失敗：' + (e && e.message || String(e)); }
      }
    };

    function closeModal() { if (profileModal) { profileModal.remove(); profileModal = null; } }
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
      var nm = (profileModal.querySelector('#sap-name').value || '').trim().slice(0, 20);
      setAvatarCache(selAvatar); setPinBadgeCache(selBadge);
      myAvatar = selAvatar; myBadge = selBadge;
      var row = { user_id: API.user.id, avatar: selAvatar, badge_id: selBadge };
      if (nm) { row.nickname = nm; myNick = nm; }
      sb.from('profiles').upsert(row, { onConflict: 'user_id' }).then(function (res) {
        // ถ้าคอลัมน์ avatar/badge_id ยังไม่มี → เซฟเฉพาะชื่อ (รูป/แบดจ์ยังอยู่ในแคชเครื่อง)
        if (res.error && nm) sb.from('profiles').upsert({ user_id: API.user.id, nickname: nm }, { onConflict: 'user_id' });
        closeModal(); fireChange();
      });
    };
  }

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

  // ── init: session เดียว ฟังเดียว (client กลาง) ใช้ร่วมกันทุกหน้าที่โหลดไฟล์นี้ ──
  function boot() {
    sb.auth.getSession().then(function (res) {
      API.user = (res.data && res.data.session && res.data.session.user) || null;
      API.authResolved = true;
      fireChange();
      fetchProfile();
      if (API.user) logSession();
    });
    sb.auth.onAuthStateChange(function (_event, session) {
      API.user = (session && session.user) || null;
      API.authResolved = true;
      myNick = myAvatar = myBadge = null; // เคลียร์โปรไฟล์เดิม แล้วดึงของ user ปัจจุบันใหม่
      fireChange();
      fetchProfile();
      if (API.user) logSession();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
