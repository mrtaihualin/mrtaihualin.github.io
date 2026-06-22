// ════════════════════════════════════════════════════════════
// leaderboard.js — กระดานจัดอันดับ (leaderboard.html)
// จัดอันดับด้วย "คะแนนสะสมรวม" 2 แท็บ: รายสัปดาห์ / ตลอดกาล
// ดึงผ่าน RPC (security definer) — เห็นเฉพาะชื่อเล่น+คะแนน ไม่เห็นอีเมล
// ต้องโหลดหลัง: supabase-js CDN, supabase-config.js
// ════════════════════════════════════════════════════════════
(function () {
  'use strict';

  // ── ตารางแบดจ์ (ก๊อปจาก tone-finder.html อ่านอย่างเดียว เพื่อวาดบนกระดาน) — LIN 2026-06-22 ──
  var LB_BADGES = {
    rice_seed:   { emoji: '🌾', img: 'assets/badges/rice_seed.svg',   zh: '稻種' },
    rice_sprout: { emoji: '🌱', img: 'assets/badges/rice_sprout.svg', zh: '秧苗' },
    rice_ear:    { emoji: '🌿', img: 'assets/badges/rice_ear.svg',    zh: '幼穗' },
    rice_golden: { emoji: '🌾', img: 'assets/badges/rice_golden.svg', zh: '金穗' },
    rice_field:  { emoji: '🏞️', img: 'assets/badges/rice_field.svg',  zh: '金色稻田' },
    hommali:     { emoji: '🍚', img: 'assets/badges/hommali.svg',     zh: '茉莉香米' },
    khaoniaw:    { emoji: '🍙', img: 'assets/badges/khaoniaw.svg',    zh: '糯米' },
    khaoklong:   { emoji: '🌾', img: 'assets/badges/khaoklong.svg',   zh: '糙米' },
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

  var sb = window.supabase.createClient(cfg.url, cfg.anonKey);
  var currentUser = null;
  var myNick = null;
  var period = 'week'; // 'week' | 'all'

  // ── ตั้งค่า "คู่ซ้อม" (pacer / หน้าม้า) — ปรับได้ตรงนี้ ──────────
  // ทำงานแบบยืดหยุ่น: คะแนนอิงกับ "ผู้นำจริง" เสมอ จึงมีเป้าให้ไล่ตลอด
  // ปิดทั้งหมดได้โดยตั้ง enabled:false
  var PACER = {
    enabled: true,
    count: 4,
    // ชื่อปลอม: ภาษาจีนล้วน (กลุ่มผู้เรียนชาวไต้หวัน) — เปลี่ยน/เพิ่มได้ตามใจ
    names: ['小美', '阿明', '學泰文的小宇', '美玲', '阿華', '泰文初學者', '宥廷', '思妤'],
    // ตัวคูณคะแนน "เทียบกับผู้นำจริง" — ทุกตัว < 1 จึงอยู่ "ใต้" ผู้เล่นจริงเสมอ (ไล่ตามอยู่ข้างหลัง)
    factors: [0.85, 0.62, 0.42, 0.25],
    // ค่าฐานเมื่อยังไม่มีผู้เล่นจริง (กันกระดานว่าง) — ตั้งต่ำให้เหมือนชุมชนเพิ่งเริ่ม
    floorWeek: 18, floorAll: 70
  };

  function buildPacers(realRows) {
    if (!PACER.enabled) return [];
    var topReal = (realRows && realRows.length) ? (realRows[0].total_score || 0) : 0;
    var floor = (period === 'week') ? PACER.floorWeek : PACER.floorAll;
    // ถ้ามีผู้เล่นจริง → ยึดคะแนนผู้นำจริงเป็นฐาน แล้ว pacer วิ่งตามอยู่ใต้เขา (ผู้เล่นจริงได้เป็นที่ 1)
    // ถ้ายังไม่มีใคร → ใช้ค่าฐานเตี้ยๆ กันกระดานว่าง
    var anchor = (topReal > 0) ? topReal : floor;
    var per = (period === 'week') ? 6 : 9; // คะแนนเฉลี่ยต่อรอบ (ใช้ประมาณจำนวนรอบ)
    return PACER.names.slice(0, PACER.count).map(function (nm, i) {
      var f = PACER.factors[i % PACER.factors.length];
      var sc = Math.max(1, Math.round(anchor * f));
      return { user_id: 'pacer-' + period + '-' + i, nickname: nm, avatar: LB_PACER_AVATARS[i % LB_PACER_AVATARS.length], badge_id: '', total_score: sc, games: Math.max(2, Math.round(sc / per)), _bot: true };
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
    if (!currentUser) return;
    var nm = window.prompt('設定排行榜暱稱（1–20 字）：', myNick || '');
    if (nm == null) return;
    nm = nm.trim().slice(0, 20);
    if (!nm) { alert('暱稱不能空白'); return; }
    sb.from('profiles').upsert({ user_id: currentUser.id, nickname: nm }, { onConflict: 'user_id' })
      .then(function (res) {
        if (res.error) { alert('暱稱儲存失敗：' + res.error.message); return; }
        myNick = nm;
        load();
      });
  }

  async function fetchMyNick() {
    if (!currentUser) { myNick = null; return; }
    var res = await sb.from('profiles').select('nickname').eq('user_id', currentUser.id).maybeSingle();
    myNick = (res.data && res.data.nickname) || null;
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
  }

  function nickBar() {
    if (!currentUser) {
      return '<div style="text-align:center;font-size:13px;color:#8B7340;margin-bottom:16px;">' +
        '在遊戲頁登入即可參加排行 · <a href="tone-finder.html" style="color:#A07A1E;">前往遊戲</a></div>';
    }
    if (!myNick) {
      return '<div style="text-align:center;margin-bottom:16px;">' +
        '<button id="lb-setnick" style="background:#C8973A;color:#fff;border:none;border-radius:999px;padding:9px 20px;cursor:pointer;font-weight:700;font-size:14px;">✏️ 設定暱稱來上榜</button></div>';
    }
    return '<div style="text-align:center;font-size:13px;color:#8B7340;margin-bottom:16px;">你的暱稱：<b style="color:#5C4410;">' + esc(myNick) +
      '</b> · <a id="lb-setnick" href="javascript:void(0)" style="color:#A07A1E;">更改</a></div>';
  }

  async function load() {
    root.innerHTML = tabs() + nickBar() + box('⏳', '載入中...', '請稍候');
    wireTabs();
    var fn = (period === 'week') ? 'leaderboard_weekly' : 'leaderboard_alltime';
    var res = await sb.rpc(fn);
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
        '<a href="tone-finder.html" style="display:inline-block;margin-top:16px;background:#C8973A;color:#fff;text-decoration:none;border-radius:999px;padding:10px 22px;font-weight:700;font-size:14px;">前往 tone-finder →</a>');
      root.innerHTML = html; wireTabs(); return;
    }
    html += '<div style="background:#fff;border-radius:16px;padding:8px 6px;box-shadow:0 4px 16px rgba(0,0,0,0.05);">';
    rows.forEach(function (r, i) {
      var rank = i + 1;
      var mine = currentUser && r.user_id === currentUser.id;
      // "อีก X แต้มแซง [คนข้างบน]" — โชว์ใต้แถวของผู้เล่นเอง (ถ้ายังไม่ใช่ที่ 1)
      var pacerHint = '';
      if (mine && i > 0) {
        var above = rows[i - 1];
        var gap = (above.total_score || 0) - (r.total_score || 0);
        if (gap > 0) {
          pacerHint = '<div style="font-size:11.5px;color:#C8973A;padding:2px 12px 8px 50px;">再 <b>' + gap +
            '</b> 分就超越 <b>' + esc(above.nickname || '(無暱稱)') + '</b> 囉！💪</div>';
        }
      }
      html +=
        '<div style="display:flex;align-items:center;gap:12px;padding:11px 12px;border-radius:10px;' +
        (i ? 'border-top:1px solid #F4ECD8;' : '') + (mine ? 'background:#FBF3E2;' : '') + '">' +
          '<div style="font-size:17px;min-width:26px;text-align:center;">' + medal(rank) + '</div>' +
          lbAvatar(r.avatar) +
          '<div style="flex:1;min-width:0;font-weight:700;color:#5C4410;display:flex;align-items:center;gap:5px;overflow:hidden;">' +
            '<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + esc(r.nickname || '(無暱稱)') + '</span>' +
            (r.badge_id ? lbBadgeIcon(r.badge_id, 18) : '') +
            (mine ? '<span style="font-size:11px;color:#C8973A;flex-shrink:0;">(你)</span>' : '') + '</div>' +
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
    var s = await sb.auth.getSession();
    currentUser = (s.data && s.data.session && s.data.session.user) || null;
    await fetchMyNick();
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
