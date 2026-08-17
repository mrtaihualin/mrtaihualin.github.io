// ════════════════════════════════════════════════════════════
// reading-leaderboard.js — กระดานเกมอ่าน+เกมพิมพ์ (reading-board.html / typing-board.html)
// FILE MAP: board/game config → badge rendering → RPC/fallback loading → weekly/all-time UI → auth/tabs/init
// mirror ของ leaderboard.js · จัดอันดับด้วย "คะแนนสะสมรวม" 2 แท็บ: รายสัปดาห์ / ตลอดกาล
// ดึงผ่าน RPC (security definer) — เห็นเฉพาะชื่อเล่น+คะแนน ไม่เห็นอีเมล
// v2 (LIN 2026-07-02): แยกกระดานตามเกม — หน้า typing-board ตั้ง
//   window.READING_BOARD_GAME='typing' ก่อนโหลดไฟล์นี้ (ไม่ตั้ง = 'reading')
//   เรียก RPC พร้อม p_game · ถ้า RPC เก่ายังไม่รับ p_game (Lin ยังไม่รัน SQL):
//   reading → fallback แบบเดิม (ไม่กรอง) · typing → โชว์ "排行榜準備中"
// ต้องโหลดหลัง: supabase-js CDN, supabase-config.js
// ════════════════════════════════════════════════════════════
(function () {
  'use strict';

  // ── เกมของกระดานนี้ ──
  // v3 (LIN 2026-07-03): เพิ่ม 'word_order' (語序練習室) — เดิมรองรับแค่ typing/reading
  // v4 (LIN 2026-07-03): เพิ่ม 'lego' (造句練習室) — คนละเกมกับ word_order ห้ามใช้ key ปนกัน
  // v5 (LIN 2026-07-31): เพิ่ม 'mix' (綜合遊戲/mix-board.html) — กระดานคะแนนของเกมรวม แยกจาก 4 เกมเดิม
  // v6 (LIN 2026-08-01): เปลี่ยน id 'mix' → 'challenge' ตามการเปลี่ยนชื่อไฟล์ mix.html → games-challenge.html
  var BOARD_GAME = (window.READING_BOARD_GAME === 'listening') ? 'listening'
    : (window.READING_BOARD_GAME === 'typing') ? 'typing'
    : (window.READING_BOARD_GAME === 'word_order') ? 'word_order'
    : (window.READING_BOARD_GAME === 'lego') ? 'lego'
    : (window.READING_BOARD_GAME === 'challenge') ? 'challenge' : 'reading';
  var BOARD_GAME_ZH = (BOARD_GAME === 'listening') ? '聽力' : (BOARD_GAME === 'typing') ? '打字' : (BOARD_GAME === 'word_order') ? '語序' : (BOARD_GAME === 'lego') ? '造句' : (BOARD_GAME === 'challenge') ? '綜合' : '拼讀';
  var BOARD_GAME_PAGE = (BOARD_GAME === 'listening') ? 'listening-game.html' : (BOARD_GAME === 'typing') ? 'typing-game.html' : (BOARD_GAME === 'word_order') ? 'word-order.html' : (BOARD_GAME === 'lego') ? 'lego.html' : (BOARD_GAME === 'challenge') ? 'games-challenge.html' : 'reading-game.html';

  // ── ตารางแบดจ์ (ก๊อปจาก reading-game.html อ่านอย่างเดียว เพื่อวาดบนกระดาน) — LIN 2026-06-22 ──
  var LB_BADGES = {
    rice_seed:   { emoji: '🌾', img: 'assets/badges/rice_seed.svg',   zh: '稻種' },
    rice_sprout: { emoji: '🌱', img: 'assets/badges/rice_sprout.svg', zh: '秧苗' },
    rice_ear:    { emoji: '🌿', img: 'assets/badges/rice_ear.svg',    zh: '幼穗' },
    rice_golden: { emoji: '🌾', img: 'assets/badges/rice_golden.svg', zh: '金穗' },
    rice_field:  { emoji: '🏞️', img: 'assets/badges/rice_field.svg',  zh: '金色稻田' },
    hommali:     { emoji: '🍚', img: 'assets/badges/hommali.svg',     zh: '茉莉香米' },
    khaoniaw:    { emoji: '🍙', img: 'assets/badges/khaoniaw.svg',    zh: '糯米' },
    khaoklong:   { emoji: '🌾', img: 'assets/badges/khaoklong.svg',   zh: '糙米' },
    homnin:      { emoji: '⚫', img: 'assets/badges/homnin.svg',      zh: '香黑米' },
    sangyod:     { emoji: '🔴', img: 'assets/badges/sangyod.svg',     zh: '紅米' },
    riceberry:   { emoji: '🟣', img: 'assets/badges/riceberry.svg',   zh: '紫米 Riceberry' }
  };
  var LB_PACER_AVATARS = ['🐱', '🦊', '🐼', '🐯', '🐸', '🐥', '🦉', '🐰'];

  var cfg = window.SUPABASE_CONFIG || {};
  var ready = cfg.url && cfg.anonKey &&
              cfg.url.indexOf('YOUR_') === -1 &&
              cfg.anonKey.indexOf('YOUR_') === -1 &&
              window.supabase && window.supabase.createClient;

  var root = document.getElementById('lb-root');
  if (!root) return;
  if (!ready) { root.innerHTML = box('⚙️', '系統尚未就緒', 'Supabase 尚未設定完成'); return; }
  if (!window.NICKNAME_SAFETY) { root.innerHTML = box('⚙️', '系統尚未就緒', '暱稱安全模組載入失敗'); return; }

  var sb = window.getSupabaseClient ? window.getSupabaseClient() : window.supabase.createClient(cfg.url, cfg.anonKey);
  var currentUser = null;
  var myNick = null;
  var nicknameModerated = false;
  var nicknameSavePending = false;
  var NICKNAME_SAVE_TIMEOUT_MS = 12000;
  var period = 'week'; // 'week' | 'all'

  function saveNicknameWithTimeout(nickname) {
    return new Promise(function (resolve, reject) {
      var settled = false;
      var timer = setTimeout(function () {
        if (settled) return;
        settled = true;
        var error = new Error('暱稱儲存逾時');
        error.uncertain = true;
        reject(error);
      }, NICKNAME_SAVE_TIMEOUT_MS);
      Promise.resolve(sb.rpc('set_leaderboard_nickname', { p_nickname: nickname }))
        .then(function (res) {
          if (settled) return;
          settled = true; clearTimeout(timer); resolve(res);
        }, function (error) {
          if (settled) return;
          settled = true; clearTimeout(timer);
          if (error && typeof error === 'object') error.uncertain = true;
          reject(error);
        });
    });
  }

  function nicknameSaveError(error) {
    var raw = String((error && error.message) || '');
    var codeMatch = raw.match(/NICKNAME_(EMPTY|TOO_LONG|INVALID_CHARACTERS|CONTACT_DATA|INAPPROPRIATE|MODERATED)/);
    var message = codeMatch
      ? (codeMatch[1] === 'MODERATED' ? '這個排行榜暱稱已被隱藏，請聯絡管理員' : window.NICKNAME_SAFETY.messageFor(codeMatch[1].toLowerCase()))
      : (raw || '暱稱儲存失敗');
    var failure = new Error(message);
    failure.uncertain = !!(error && !error.code && /(?:failed to fetch|network|load failed|timeout|timed out)/i.test(String(error.message || '') + ' ' + String(error.details || '')));
    return failure;
  }

  // ── ตั้งค่า "คู่ซ้อม" (pacer / หน้าม้า) v2 — ปรับได้ตรงนี้ ──────────
  // v2 (LIN 2026-07-31): เพิ่ม "เพดานบน" (ceilWeek/ceilAll) กันคะแนนโป่งเวอร์ตามคะแนนจริงที่ผิดปกติ
  // (บทเรียนจากรอบก่อน: มีคะแนนจริงพุ่ง 177,000 แต้ม/4 เกม ทำให้หน้าม้าโป่งตามเป็นแสน เล่น 16,717 เกม ดูปลอมชัด)
  // ทำงาน: คะแนนอิงกับ "ผู้นำจริง" เสมอ (แต่ไม่เกินเพดาน) จึงมีเป้าให้ไล่ตลอด + ตัวเลขยังสมเหตุสมผล
  // ปิดทั้งหมดได้โดยตั้ง enabled:false
  var PACER = {
    enabled: true,
    count: 4,
    // ชื่อปลอม: ชื่อสไตล์ไต้หวันแท้ๆ (ชื่อเต็ม 2-3 พยางค์ ไม่ใช่ชื่อเล่นกลางๆ แบบเดิม) — เปลี่ยน/เพิ่มได้ตามใจ
    names: ['家豪', '怡君', '冠宇', '佳穎', '承翰', '雅婷', '俊傑', '淑芬'],
    // ตัวคูณคะแนน "เทียบกับผู้นำจริง" — ทุกตัว < 1 จึงอยู่ "ใต้" ผู้เล่นจริงเสมอ (ไล่ตามอยู่ข้างหลัง)
    factors: [0.85, 0.62, 0.42, 0.25],
    // ค่าฐานเมื่อยังไม่มีผู้เล่นจริง (กันกระดานว่าง) — ตั้งต่ำให้เหมือนชุมชนเพิ่งเริ่ม
    floorWeek: 18, floorAll: 70,
    // เพดานบนสุดที่ยอมให้ "ผู้นำจริง" ดันคะแนนหน้าม้าขึ้นไปได้ — กันคะแนนจริงผิดปกติทำให้หน้าม้าโป่งเวอร์ (Lin ยืนยัน 2026-07-31)
    ceilWeek: 500, ceilAll: 5000
  };

  function buildPacers(realRows) {
    if (!PACER.enabled) return [];
    var topReal = (realRows && realRows.length) ? (realRows[0].total_score || 0) : 0;
    var floor = (period === 'week') ? PACER.floorWeek : PACER.floorAll;
    var ceil = (period === 'week') ? PACER.ceilWeek : PACER.ceilAll;
    // ถ้ามีผู้เล่นจริง → ยึดคะแนนผู้นำจริงเป็นฐาน (แต่ไม่เกินเพดาน) แล้ว pacer วิ่งตามอยู่ใต้เขา (ผู้เล่นจริงได้เป็นที่ 1)
    // ถ้ายังไม่มีใคร → ใช้ค่าฐานเตี้ยๆ กันกระดานว่าง
    var anchor = (topReal > 0) ? Math.min(topReal, ceil) : floor;
    // แต้มเฉลี่ยต่อเกมของหน้าม้า — อิงจากค่าเฉลี่ยจริงที่เจอบนกระดาน (ไม่ใช่เลขเดาลอยๆ)
    var per = (period === 'week') ? 100 : 150;
    // เพดานจำนวนเกม กันเผื่อกรณีขอบ (แม้ตอนนี้เพดานคะแนนด้านบนกันไว้แล้วก็ตาม)
    var maxGames = (period === 'week') ? 20 : 150;
    return PACER.names.slice(0, PACER.count).map(function (nm, i) {
      var f = PACER.factors[i % PACER.factors.length];
      var sc = Math.max(1, Math.round(anchor * f));
      var games = Math.min(maxGames, Math.max(2, Math.round(sc / per)));
      return { nickname: nm, avatar: LB_PACER_AVATARS[i % LB_PACER_AVATARS.length], badge_id: '', total_score: sc, games: games, is_current_user: false, _bot: true };
    });
  }

  function mergePacers(realRows) {
    var merged = (realRows || []).concat(buildPacers(realRows));
    merged.sort(function (a, b) { return (b.total_score || 0) - (a.total_score || 0); });
    return merged.slice(0, 100);
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  // ไอคอนแบดจ์ (ใช้ SVG ถ้ามี ไม่งั้น emoji) — คืน '' ถ้าไม่รู้จัก id
  function lbBadgeIcon(id, px) {
    px = px || 18;
    var b = LB_BADGES[id];
    if (!b) return '';
    return '<img src="' + b.img + '" alt="' + esc(b.zh) + '" title="' + esc(b.zh) +
      '" style="width:' + px + 'px;height:' + px + 'px;object-fit:contain;flex-shrink:0;vertical-align:middle;"' +
      ' onerror="this.replaceWith(document.createTextNode(\'' + b.emoji + '\'))">';
  }
  // วงกลม avatar (อิโมจิ) — คืน '' ถ้าไม่มี/none
  function lbAvatar(av) {
    if (!av || av === 'none') return '';
    return '<span style="width:26px;height:26px;border-radius:50%;background:#FBF6EA;display:inline-flex;' +
      'align-items:center;justify-content:center;font-size:16px;flex-shrink:0;">' + esc(av) + '</span>';
  }

  function box(icon, title, sub, extra) {
    return '<div style="background:#fff;border-radius:18px;padding:38px 26px;text-align:center;' +
      'box-shadow:0 8px 30px rgba(0,0,0,0.06);max-width:440px;margin:0 auto;">' +
      '<div style="font-size:44px;margin-bottom:10px;">' + icon + '</div>' +
      '<h2 style="margin:0 0 8px;font-size:20px;color:#5C4410;font-weight:800;">' + esc(title) + '</h2>' +
      '<p style="margin:0;font-size:14px;color:#8B7340;line-height:1.7;">' + sub + '</p>' + (extra || '') + '</div>';
  }

  // ── การตั้งชื่อเล่น ─────────────────────────────────────────
  function promptNickname() {
    if (!currentUser || nicknameSavePending) return;
    var nm = window.prompt('設定排行榜暱稱（1–20 字）：', myNick || '');
    if (nm == null) return;
    var checked = window.NICKNAME_SAFETY.validate(nm);
    if (!checked.ok) { alert(checked.message); return; }
    nm = checked.value;
    nicknameSavePending = true;
    saveNicknameWithTimeout(nm)
      .then(function (res) {
        if (!res || typeof res !== 'object') {
          var invalid = new Error('伺服器回應格式不完整');
          invalid.uncertain = true;
          throw invalid;
        }
        if (res.error) throw nicknameSaveError(res.error);
        // Never update the visible nickname before the remote upsert confirms success.
        var saved = res.data && res.data[0];
        myNick = (saved && saved.nickname) || nm;
        nicknameModerated = false;
        load();
      }).catch(function (error) {
        alert(error && error.uncertain
          ? '無法確認暱稱是否已儲存。請重新載入確認目前名稱後，再決定是否重試。'
          : '暱稱儲存失敗：' + (error && error.message || String(error)));
      }).then(function () {
        nicknameSavePending = false;
      });
  }

  async function fetchMyNick() {
    if (!currentUser) { myNick = null; nicknameModerated = false; return; }
    try {
      var res = await sb.rpc('get_my_leaderboard_identity');
      var row = res.data && res.data[0];
      nicknameModerated = !!(row && row.nickname_hidden);
      myNick = (!nicknameModerated && row && row.nickname) || null;
    } catch (e) { myNick = null; nicknameModerated = false; }
  }

  function reportNickname(publicIdentityId) {
    if (!currentUser) { alert('請先登入，才能報告不當暱稱'); return; }
    if (!publicIdentityId || !window.confirm('要報告這個排行榜暱稱嗎？')) return;
    sb.rpc('report_leaderboard_nickname', { p_public_identity_id: publicIdentityId }).then(function (res) {
      if (res.error) throw res.error;
      alert(res.data === 'already_reported' ? '你已報告過這個暱稱' : '已收到報告，謝謝你');
    }).catch(function () { alert('報告失敗，請稍後再試'); });
  }

  // ── โหลด + แสดงกระดาน ───────────────────────────────────────
  function tabs() {
    function t(id, label, on) {
      return '<button data-p="' + id + '" style="flex:1;border:none;cursor:pointer;padding:10px;border-radius:10px;font-size:14px;font-weight:700;' +
        (on ? 'background:#C8973A;color:#fff;' : 'background:transparent;color:#8B7340;') + '">' + label + '</button>';
    }
    return '<div style="display:flex;gap:6px;background:#fff;border-radius:14px;padding:6px;margin-bottom:18px;box-shadow:0 4px 16px rgba(0,0,0,0.05);">' +
      t('week', '🔥 本週', period === 'week') +
      t('all', '👑 總排行', period === 'all') + '</div>';
  }

  function wireTabs() {
    [].forEach.call(root.querySelectorAll('[data-p]'), function (b) {
      b.onclick = function () { period = b.getAttribute('data-p'); load(); };
    });
    var setn = root.querySelector('#lb-setnick');
    if (setn) setn.onclick = promptNickname;
    [].forEach.call(root.querySelectorAll('[data-report-nickname]'), function (button) {
      button.onclick = function () { reportNickname(button.getAttribute('data-report-nickname')); };
    });
  }

  function nickBar() {
    if (!currentUser) {
      return '<div style="text-align:center;font-size:13px;color:#8B7340;margin-bottom:16px;">' +
        '在遊戲頁登入即可參加排行 · <a href="' + BOARD_GAME_PAGE + '" style="color:#A07A1E;">前往' + BOARD_GAME_ZH + '遊戲</a></div>';
    }
    if (nicknameModerated) {
      return '<div style="text-align:center;font-size:13px;color:#8B7340;margin-bottom:16px;">你的排行榜暱稱已被隱藏，排行將顯示「玩家」。</div>';
    }
    if (!myNick) {
      return '<div style="text-align:center;margin-bottom:16px;">' +
        '<button id="lb-setnick" style="background:#C8973A;color:#fff;border:none;border-radius:999px;padding:9px 20px;cursor:pointer;font-weight:700;font-size:14px;">✏️ 設定暱稱來上榜</button></div>';
    }
    return '<div style="text-align:center;font-size:13px;color:#8B7340;margin-bottom:16px;">你的排行榜暱稱：<b style="color:#5C4410;">' + esc(window.NICKNAME_SAFETY.publicDisplayName(myNick)) +
      '</b> · <a id="lb-setnick" href="javascript:void(0)" style="color:#A07A1E;">更改</a></div>';
  }

  // error ที่แปลว่า RPC ตัวเก่า (ยังไม่มี p_game) — จับกว้าง: PGRST202 = ไม่พบฟังก์ชันตาม signature
  function isOldRpc(err) {
    if (!err) return false;
    if (err.code === 'PGRST202') return true;
    var m = String(err.message || '');
    return /p_game/i.test(m) || (/function/i.test(m) && /(schema cache|does not exist|find)/i.test(m));
  }

  async function load() {
    root.innerHTML = tabs() + nickBar() + box('⏳', '載入中...', '請稍候');
    wireTabs();
    var fn = (period === 'week') ? 'reading_leaderboard_weekly' : 'reading_leaderboard_alltime';
    var res;
    try {
      // v2: ส่ง p_game ให้ RPC กรองตามเกม
      res = await sb.rpc(fn, { p_game: BOARD_GAME });
      if (res.error && isOldRpc(res.error)) {
        // RPC เวอร์ชันเก่ายังไม่รับ p_game (Lin ยังไม่รัน SQL อัปเดต)
        console.warn('[board] RPC ยังไม่รองรับ p_game — fallback (' + BOARD_GAME + ')');
        if (BOARD_GAME === 'reading') {
          res = await sb.rpc(fn); // พฤติกรรมเดิม: ไม่กรอง (แถวเก่าทั้งหมดคือเกมอ่านอยู่แล้ว)
        } else {
          root.innerHTML = tabs() + nickBar() +
            box('🛠️', '排行榜準備中', BOARD_GAME_ZH + '排行榜即將開放，敬請期待！<br>你的分數都有記錄，開放後就會看到囉',
              '<a href="' + BOARD_GAME_PAGE + '" style="display:inline-block;margin-top:16px;background:#C8973A;color:#fff;text-decoration:none;border-radius:999px;padding:10px 22px;font-weight:700;font-size:14px;">先去' + BOARD_GAME_ZH + '練習累積分數 →</a>');
          wireTabs();
          return;
        }
      }
    } catch (e) {
      root.innerHTML = tabs() + nickBar() +
        box('📡', '連線失敗', '無法連上伺服器，請檢查網路後重新整理');
      wireTabs();
      return;
    }
    if (res.error) {
      root.innerHTML = tabs() + nickBar() +
        box('⚠️', '排行榜載入失敗', esc(res.error.message) +
          '<br><span style="font-size:12px;color:#B0A080;">(可能尚未在 Supabase 建立 leaderboard 函式)</span>');
      wireTabs();
      return;
    }
    renderBoard(mergePacers(res.data || []));
  }

  function medal(rank) {
    if (rank === 1) return '🥇'; if (rank === 2) return '🥈'; if (rank === 3) return '🥉';
    return '<span style="display:inline-block;min-width:22px;text-align:center;color:#B0A080;font-weight:700;">' + rank + '</span>';
  }

  function renderBoard(rows) {
    var html = tabs() + nickBar();
    if (!rows.length) {
      html += box('🌱', '排行榜還沒有人', period === 'week' ? '本週還沒有分數，當第一個吧！' : '還沒有資料，去玩一場上榜吧',
        '<a href="' + BOARD_GAME_PAGE + '" style="display:inline-block;margin-top:16px;background:#C8973A;color:#fff;text-decoration:none;border-radius:999px;padding:10px 22px;font-weight:700;font-size:14px;">前往' + BOARD_GAME_ZH + '練習 →</a>');
      root.innerHTML = html; wireTabs(); return;
    }
    html += '<div style="background:#fff;border-radius:16px;padding:8px 6px;box-shadow:0 4px 16px rgba(0,0,0,0.05);">';
    rows.forEach(function (r, i) {
      var rank = i + 1;
      var mine = !!(currentUser && r.is_current_user === true);
      var displayName = window.NICKNAME_SAFETY.publicDisplayName(r.nickname);
      // "อีก X แต้มแซง [คนข้างบน]" — โชว์ใต้แถวของผู้เล่นเอง (ถ้ายังไม่ใช่ที่ 1)
      var pacerHint = '';
      if (mine && i > 0) {
        var above = rows[i - 1];
        var gap = (above.total_score || 0) - (r.total_score || 0);
        if (gap > 0) {
          pacerHint = '<div style="font-size:11.5px;color:#C8973A;padding:2px 12px 8px 50px;">再 <b>' + gap +
            '</b> 分就超越 <b>' + esc(window.NICKNAME_SAFETY.publicDisplayName(above.nickname)) + '</b> 囉！💪</div>';
        }
      }
      html +=
        '<div style="display:flex;align-items:center;gap:12px;padding:11px 12px;border-radius:10px;' +
        (i ? 'border-top:1px solid #F4ECD8;' : '') + (mine ? 'background:#FBF3E2;' : '') + '">' +
          '<div style="font-size:17px;min-width:26px;text-align:center;">' + medal(rank) + '</div>' +
          lbAvatar(r.avatar) +
          '<div style="flex:1;min-width:0;font-weight:700;color:#5C4410;display:flex;align-items:center;gap:5px;overflow:hidden;">' +
            '<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + esc(displayName) + '</span>' +
            (r.badge_id ? lbBadgeIcon(r.badge_id, 18) : '') +
            (mine ? '<span style="font-size:11px;color:#C8973A;flex-shrink:0;">(你)</span>' : '') +
            (!mine && !r._bot && r.public_identity_id ? '<button type="button" data-report-nickname="' + esc(r.public_identity_id) + '" aria-label="報告不當暱稱" title="報告不當暱稱" style="border:0;background:transparent;color:#A07A1E;cursor:pointer;padding:4px;font-size:12px;flex-shrink:0;">⚑</button>' : '') + '</div>' +
          '<div style="text-align:right;white-space:nowrap;">' +
            '<span style="font-family:\'Playfair Display\',serif;font-weight:900;color:#C8973A;font-size:18px;">' + (r.total_score != null ? r.total_score : 0) + '</span>' +
            '<span style="font-size:11px;color:#B0A080;margin-left:5px;">' + (r.games || 0) + ' 場</span>' +
          '</div>' +
        '</div>' + pacerHint;
    });
    html += '</div>';
    root.innerHTML = html;
    wireTabs();
  }

  // ── init ───────────────────────────────────────────────────
  async function boot() {
    try {
      var s = await sb.auth.getSession();
      currentUser = (s.data && s.data.session && s.data.session.user) || null;
      await fetchMyNick();
    } catch (e) { currentUser = null; }
    load();
  }
  sb.auth.onAuthStateChange(function (_e, session) {
    var was = currentUser ? currentUser.id : null;
    currentUser = (session && session.user) || null;
    var now = currentUser ? currentUser.id : null;
    if (was !== now) { fetchMyNick().then(load); }
  });
  boot();
})();
