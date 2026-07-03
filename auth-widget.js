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
// ════════════════════════════════════════════════════════════
(function () {
  'use strict';

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

  // ── โปรไฟล์ผู้เล่น: ชื่อ+รูป+แบดจ์ เก็บใน profiles (คีย์ user_id) + localStorage แคชสำรอง ──
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
    sb.from('profiles').select('nickname, avatar, badge_id').eq('user_id', uid).maybeSingle()
      .then(function (res) {
        if (res.error) {
          // คอลัมน์ avatar/badge_id ยังไม่มีใน Supabase → ใช้แค่ชื่อ + แคชเครื่อง
          sb.from('profiles').select('nickname').eq('user_id', uid).maybeSingle().then(function (r2) {
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

  // ── ป๊อปอัปแก้โปรไฟล์: ชื่อ + รูปอิโมจิสำเร็จรูป + เลือกแบดจ์ที่ปลดล็อกแล้ว (sync ผ่าน profiles) ──
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
        '<button id="sap-save" style="width:100%;border:none;background:#C8973A;color:#fff;border-radius:10px;padding:12px;font-size:15px;font-weight:800;cursor:pointer;">儲存</button>' +
      '</div>';
    document.body.appendChild(profileModal);

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

  // ── มี modal อื่นเปิดอยู่ไหม (จองเรียน/QR ฯลฯ) → ถ้าเปิด ซ่อน badge กันทับปุ่มกากบาท ──
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

  // ── init: session เดียว ฟังเดียว (client กลาง) ใช้ร่วมกันทุกหน้าที่โหลดไฟล์นี้ ──
  function boot() {
    sb.auth.getSession().then(function (res) {
      API.user = (res.data && res.data.session && res.data.session.user) || null;
      API.authResolved = true;
      fireChange();
      fetchProfile();
    });
    sb.auth.onAuthStateChange(function (_event, session) {
      API.user = (session && session.user) || null;
      API.authResolved = true;
      myNick = myAvatar = myBadge = null; // เคลียร์โปรไฟล์เดิม แล้วดึงของ user ปัจจุบันใหม่
      fireChange();
      fetchProfile();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
