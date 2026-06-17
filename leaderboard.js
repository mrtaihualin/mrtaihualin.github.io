// ════════════════════════════════════════════════════════════
// leaderboard.js — กระดานจัดอันดับ (leaderboard.html)
// จัดอันดับด้วย "คะแนนสะสมรวม" 2 แท็บ: รายสัปดาห์ / ตลอดกาล
// ดึงผ่าน RPC (security definer) — เห็นเฉพาะชื่อเล่น+คะแนน ไม่เห็นอีเมล
// ต้องโหลดหลัง: supabase-js CDN, supabase-config.js
// ════════════════════════════════════════════════════════════
(function () {
  'use strict';

  var cfg = window.SUPABASE_CONFIG || {};
  var ready = cfg.url && cfg.anonKey &&
              cfg.url.indexOf('YOUR_') === -1 &&
              cfg.anonKey.indexOf('YOUR_') === -1 &&
              window.supabase && window.supabase.createClient;

  var root = document.getElementById('lb-root');
  if (!root) return;
  if (!ready) { root.innerHTML = box('⚙️', 'ระบบยังไม่พร้อม', 'ยังตั้งค่า Supabase ไม่เสร็จ'); return; }

  var sb = window.supabase.createClient(cfg.url, cfg.anonKey);
  var currentUser = null;
  var myNick = null;
  var period = 'week'; // 'week' | 'all'

  // ── ตั้งค่า "คู่ซ้อม" (pacer / หน้าม้า) — ปรับได้ตรงนี้ ──────────
  // ทำงานแบบยืดหยุ่น: คะแนนอิงกับ "ผู้นำจริง" เสมอ จึงมีเป้าให้ไล่ตลอด
  // ปิดทั้งหมดได้โดยตั้ง enabled:false
  var PACER = {
    enabled: true,
    count: 5,
    names: ['น้องมะนาว', '小美', 'Pimchanok', '阿明', 'โบ๊ทบางกอก', 'Nan_TH', '學泰文的阿宏', 'Ploy'],
    // ตัวคูณคะแนนเทียบกับ "ผู้นำจริง" (ตัวแรกลอยเหนือสุด ไล่ลงมา)
    factors: [1.06, 0.88, 0.7, 0.54, 0.4],
    // ค่าฐานเมื่อยังไม่มีผู้เล่นจริง (กันกระดานว่าง)
    floorWeek: 48, floorAll: 220
  };

  function buildPacers(realRows) {
    if (!PACER.enabled) return [];
    var topReal = (realRows && realRows.length) ? (realRows[0].total_score || 0) : 0;
    var floor = (period === 'week') ? PACER.floorWeek : PACER.floorAll;
    var anchor = Math.max(topReal + (period === 'week' ? 6 : 20), floor);
    var per = (period === 'week') ? 6 : 9; // คะแนนเฉลี่ยต่อรอบ (ใช้ประมาณจำนวนรอบ)
    return PACER.names.slice(0, PACER.count).map(function (nm, i) {
      var f = PACER.factors[i % PACER.factors.length];
      var sc = Math.max(1, Math.round(anchor * f));
      return { user_id: 'pacer-' + period + '-' + i, nickname: nm, total_score: sc, games: Math.max(2, Math.round(sc / per)), _bot: true };
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
    var nm = window.prompt('ตั้งชื่อเล่นที่จะโชว์บนกระดานจัดอันดับ (1–20 ตัวอักษร)\n設定排行榜暱稱:', myNick || '');
    if (nm == null) return;
    nm = nm.trim().slice(0, 20);
    if (!nm) { alert('ชื่อเล่นต้องไม่ว่าง'); return; }
    sb.from('profiles').upsert({ user_id: currentUser.id, nickname: nm }, { onConflict: 'user_id' })
      .then(function (res) {
        if (res.error) { alert('บันทึกชื่อไม่สำเร็จ: ' + res.error.message); return; }
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
      t('week', '🔥 รายสัปดาห์ / 本週', period === 'week') +
      t('all', '👑 ตลอดกาล / 總排行', period === 'all') + '</div>';
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
        'เข้าสู่ระบบที่หน้าเกมเพื่อเข้าร่วมการจัดอันดับ · <a href="tone-finder.html" style="color:#A07A1E;">ไปเล่น</a></div>';
    }
    if (!myNick) {
      return '<div style="text-align:center;margin-bottom:16px;">' +
        '<button id="lb-setnick" style="background:#C8973A;color:#fff;border:none;border-radius:999px;padding:9px 20px;cursor:pointer;font-weight:700;font-size:14px;">✏️ ตั้งชื่อเล่นเพื่อขึ้นกระดาน</button></div>';
    }
    return '<div style="text-align:center;font-size:13px;color:#8B7340;margin-bottom:16px;">ชื่อเล่นของคุณ: <b style="color:#5C4410;">' + esc(myNick) +
      '</b> · <a id="lb-setnick" href="javascript:void(0)" style="color:#A07A1E;">เปลี่ยน</a></div>';
  }

  async function load() {
    root.innerHTML = tabs() + nickBar() + box('⏳', 'กำลังโหลด...', '請稍候');
    wireTabs();
    var fn = (period === 'week') ? 'leaderboard_weekly' : 'leaderboard_alltime';
    var res = await sb.rpc(fn);
    if (res.error) {
      root.innerHTML = tabs() + nickBar() +
        box('⚠️', 'โหลดกระดานไม่สำเร็จ', esc(res.error.message) +
          '<br><span style="font-size:12px;color:#B0A080;">(อาจยังไม่ได้สร้างฟังก์ชัน leaderboard ใน Supabase)</span>');
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
      html += box('🌱', 'ยังไม่มีใครบนกระดาน', period === 'week' ? 'สัปดาห์นี้ยังไม่มีคะแนน เป็นคนแรกเลย!' : 'ยังไม่มีข้อมูล ไปเล่นเพื่อขึ้นกระดานสิ',
        '<a href="tone-finder.html" style="display:inline-block;margin-top:16px;background:#C8973A;color:#fff;text-decoration:none;border-radius:999px;padding:10px 22px;font-weight:700;font-size:14px;">ไปเล่น tone-finder →</a>');
      root.innerHTML = html; wireTabs(); return;
    }
    html += '<div style="background:#fff;border-radius:16px;padding:8px 6px;box-shadow:0 4px 16px rgba(0,0,0,0.05);">';
    rows.forEach(function (r, i) {
      var rank = i + 1;
      var mine = currentUser && r.user_id === currentUser.id;
      html +=
        '<div style="display:flex;align-items:center;gap:12px;padding:11px 12px;border-radius:10px;' +
        (i ? 'border-top:1px solid #F4ECD8;' : '') + (mine ? 'background:#FBF3E2;' : '') + '">' +
          '<div style="font-size:17px;min-width:26px;text-align:center;">' + medal(rank) + '</div>' +
          '<div style="flex:1;min-width:0;font-weight:700;color:#5C4410;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' +
            esc(r.nickname || '(ไม่มีชื่อ)') + (mine ? ' <span style="font-size:11px;color:#C8973A;">(คุณ)</span>' : '') + '</div>' +
          '<div style="text-align:right;white-space:nowrap;">' +
            '<span style="font-family:\'Playfair Display\',serif;font-weight:900;color:#C8973A;font-size:18px;">' + (r.total_score != null ? r.total_score : 0) + '</span>' +
            '<span style="font-size:11px;color:#B0A080;margin-left:5px;">' + (r.games || 0) + ' รอบ</span>' +
          '</div>' +
        '</div>';
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
