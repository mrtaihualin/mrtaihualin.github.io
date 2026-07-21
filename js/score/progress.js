// ════════════════════════════════════════════════════════════
// progress.js — หน้า "คะแนนสะสมของฉัน" (my-progress.html)
// ต้องล็อกอินก่อน แล้วดึงข้อมูลจากตาราง tone_sessions มาสรุป
// ต้องโหลดหลัง: supabase-js CDN, supabase-config.js, Chart.js, auth-widget.js
// Lin 2026-07-03 (v4): header badge (👤 ชื่อ/✏️/🏆/📊/登出) เปลี่ยนไปใช้ window.SITE_AUTH
//   ตัวกลาง — เดิมโชว์แค่อีเมล+登出 เฉยๆ (ไม่มี✏️🏆📊) ตอนนี้ครบเหมือนหน้าอื่นแล้ว
//   มี fallback: ถ้า SITE_AUTH โหลดไม่ทัน ยังมี client+listener สำรองของตัวเอง หน้าไม่พัง
// ════════════════════════════════════════════════════════════
(function () {
  'use strict';

  var cfg = window.SUPABASE_CONFIG || {};
  var ready = cfg.url && cfg.anonKey &&
              cfg.url.indexOf('YOUR_') === -1 &&
              cfg.anonKey.indexOf('YOUR_') === -1 &&
              window.supabase && window.supabase.createClient;

  var root = document.getElementById('progress-root');
  if (!root) return;

  if (!ready) {
    root.innerHTML = msgBox('⚙️', '系統尚未就緒', 'Supabase 尚未設定完成，請稍後再試');
    return;
  }

  var sb = window.getSupabaseClient ? window.getSupabaseClient() : window.supabase.createClient(cfg.url, cfg.anonKey);
  var currentUser = null;
  var chartObj = null;

  // ── helpers ────────────────────────────────────────────────
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function msgBox(icon, title, sub, extra) {
    return '<div style="background:#fff;border-radius:18px;padding:40px 26px;text-align:center;' +
      'box-shadow:0 8px 30px rgba(0,0,0,0.06);max-width:420px;margin:0 auto;">' +
      '<div style="font-size:44px;margin-bottom:10px;">' + icon + '</div>' +
      '<h2 style="margin:0 0 8px;font-size:20px;color:#5C4410;font-weight:800;">' + esc(title) + '</h2>' +
      '<p style="margin:0;font-size:14px;color:#8B7340;line-height:1.7;">' + sub + '</p>' +
      (extra || '') + '</div>';
  }
  function fmtDate(s) {
    try {
      var d = new Date(s);
      var p = function (n) { return (n < 10 ? '0' : '') + n; };
      return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
    } catch (e) { return String(s || ''); }
  }
  // จำนวนข้อ "ตอบถูก" ของรอบนั้น = total - จำนวนคำที่เคยตอบผิด (นับไม่ซ้ำคำ)
  function correctCount(r) {
    var total = r.total || 0;
    if (!total) return 0;
    var seen = {};
    (r.wrong_words || []).forEach(function (w) { if (w && w.word) seen[w.word] = 1; });
    var c = total - Object.keys(seen).length;
    if (c < 0) c = 0;
    if (c > total) c = total;
    return c;
  }
  // ความถูกต้องของรอบนั้น (0–100%)
  function rowAcc(r) {
    var t = r.total || 0;
    return t ? Math.round(correctCount(r) / t * 100) : 0;
  }
  function googleBtn(id) {
    return '<button id="' + id + '" style="width:100%;display:flex;align-items:center;justify-content:center;gap:10px;' +
      'border:1px solid #dadce0;background:#fff;color:#3c4043;border-radius:10px;padding:12px;cursor:pointer;' +
      'font-size:15px;font-weight:600;box-shadow:0 1px 3px rgba(0,0,0,0.08);">' +
      '<svg width="18" height="18" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>' +
      '使用 Google 登入</button>';
  }

  // ── auth actions ───────────────────────────────────────────
  function doGoogleLogin() {
    sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.href } })
      .then(function (res) { if (res.error) alert('登入 Google 失敗：' + res.error.message); });
  }
  function doEmailLogin() {
    var email = window.prompt('請輸入 Email 以接收 6 位數驗證碼：');
    if (!email) return;
    email = email.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { alert('Email 格式不正確'); return; }
    sb.auth.signInWithOtp({ email: email, options: { shouldCreateUser: true } })
      .then(function (res) {
        if (res.error) { alert('驗證碼寄送失敗：' + res.error.message); return; }
        var code = window.prompt('驗證碼已寄到 ' + email + ' ✉️（含垃圾信匣）\n請輸入信中的驗證碼：');
        if (!code) return;
        code = code.trim();
        if (!/^\d{6,10}$/.test(code)) { alert('請輸入信中的驗證碼（純數字）'); return; }
        sb.auth.verifyOtp({ email: email, token: code, type: 'email' })
          .then(function (r2) {
            if (r2.error) alert('驗證碼錯誤或已過期，請重新登入');
            // สำเร็จ → onAuthStateChange จะ render หน้าให้เอง
          });
      });
  }
  function doLogout() {
    if (window.SITE_AUTH && window.SITE_AUTH.ready) { window.SITE_AUTH.doLogout(); }
    else { sb.auth.signOut().then(function () { currentUser = null; renderRoot(); }); }
  }

  // ── views ──────────────────────────────────────────────────
  function renderGate() {
    root.innerHTML =
      '<div style="background:#fff;max-width:400px;margin:0 auto;border-radius:18px;padding:34px 28px;' +
      'box-shadow:0 8px 30px rgba(0,0,0,0.08);text-align:center;">' +
      '<div style="font-size:44px;margin-bottom:10px;">📊</div>' +
      '<h2 style="margin:0 0 6px;font-size:21px;color:#5C4410;font-weight:800;">我的練習成績</h2>' +
      '<p style="margin:0 0 20px;font-size:14px;color:#8B7340;line-height:1.6;">登入後即可查看你的練習成績與進步紀錄</p>' +
      googleBtn('pg-google') +
      '<button id="pg-email" style="margin-top:12px;border:none;background:none;color:#A07A1E;cursor:pointer;font-size:13px;text-decoration:underline;">用 Email 登入</button>' +
      '</div>';
    document.getElementById('pg-google').onclick = doGoogleLogin;
    document.getElementById('pg-email').onclick = doEmailLogin;
  }

  function renderLoading() {
    root.innerHTML = msgBox('⏳', '載入中...', '請稍候');
  }

  async function renderData() {
    renderLoading();
    var res = await sb.from('tone_sessions').select('*').order('created_at', { ascending: true });
    if (res.error) {
      root.innerHTML = msgBox('⚠️', '資料載入失敗', esc(res.error.message) +
        '<br><span style="font-size:12px;color:#B0A080;">(可能尚未設定可讀取自己資料的 RLS policy)</span>');
      return;
    }
    var rows = res.data || [];

    if (!rows.length) {
      root.innerHTML = msgBox('🌱', '還沒有資料', '你還沒有完成任何記錄成績的練習，先去玩一場吧',
        '<a href="games.html" style="display:inline-block;margin-top:18px;background:#C8973A;color:#fff;text-decoration:none;border-radius:999px;padding:10px 22px;font-weight:700;font-size:14px;">前往遊戲頁 →</a>');
      renderHeaderUser();
      return;
    }

    // ── คำนวณสถิติ ──
    // ⚠️ r.score = "คะแนนรวม" (แต้ม เช่น 1400) ไม่ใช่ "จำนวนข้อถูก"
    // ความถูกต้อง (正確率) ต้องคิดจาก "จำนวนข้อตอบถูก" = total - จำนวนคำที่ตอบผิด (ไม่ซ้ำ)
    var games = rows.length, totalQ = 0, totalCorrect = 0, totalScore = 0;
    var missMap = {};
    rows.forEach(function (r) {
      totalQ += (r.total || 0);
      totalScore += (r.score || 0);
      totalCorrect += correctCount(r);
      (r.wrong_words || []).forEach(function (w) {
        var key = (w && w.word) ? w.word : null;
        if (key) missMap[key] = (missMap[key] || 0) + 1;
      });
    });
    var accuracy = totalQ ? Math.round(totalCorrect / totalQ * 100) : 0;

    var missList = Object.keys(missMap).map(function (k) { return { word: k, n: missMap[k] }; })
      .sort(function (a, b) { return b.n - a.n; }).slice(0, 12);

    // ── การ์ดสรุป ──
    function stat(num, label) {
      return '<div style="background:#fff;border-radius:14px;padding:18px 10px;text-align:center;box-shadow:0 4px 16px rgba(0,0,0,0.05);">' +
        '<div style="font-family:\'Playfair Display\',serif;font-size:30px;font-weight:900;color:#C8973A;line-height:1;">' + num + '</div>' +
        '<div style="font-size:12px;color:#8B7340;margin-top:6px;">' + label + '</div></div>';
    }
    var statsHTML =
      '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:30px;">' +
      stat(games, '遊玩次數') +
      stat(accuracy + '%', '正確率') +
      stat(totalQ, '累積題數') +
      '</div>';

    // ── กราฟความแม่นยำตามเวลา ──
    var chartHTML =
      '<div style="background:#fff;border-radius:16px;padding:20px 18px;margin-bottom:30px;box-shadow:0 4px 16px rgba(0,0,0,0.05);">' +
      '<div style="font-family:\'Noto Serif TC\',serif;font-size:16px;font-weight:900;color:#5C4410;margin-bottom:14px;">📈 正確率走勢</div>' +
      '<canvas id="pg-chart" height="220"></canvas></div>';

    // ── คำที่ตอบผิดบ่อย ──
    var missHTML =
      '<div style="background:#fff;border-radius:16px;padding:20px 18px;margin-bottom:30px;box-shadow:0 4px 16px rgba(0,0,0,0.05);">' +
      '<div style="font-family:\'Noto Serif TC\',serif;font-size:16px;font-weight:900;color:#5C4410;margin-bottom:14px;">🎯 最常錯的字</div>';
    if (!missList.length) {
      missHTML += '<p style="font-size:14px;color:#8B7340;">沒有答錯的字，太強了！👍</p>';
    } else {
      missHTML += '<div style="display:flex;flex-wrap:wrap;gap:10px;">';
      missList.forEach(function (m) {
        missHTML += '<span style="display:inline-flex;align-items:center;gap:6px;background:#FBF3E2;border:1px solid rgba(200,151,58,0.3);' +
          'border-radius:999px;padding:6px 13px;font-size:15px;color:#5C4410;">' +
          '<b style="font-family:\'Sarabun\',sans-serif;">' + esc(m.word) + '</b>' +
          '<span style="background:#C8973A;color:#fff;border-radius:999px;font-size:11px;padding:1px 7px;">' + m.n + '</span></span>';
      });
      missHTML += '</div>';
    }
    missHTML += '</div>';

    // ── ประวัติการเล่น ──
    var recent = rows.slice().reverse().slice(0, 15);
    var histHTML =
      '<div style="background:#fff;border-radius:16px;padding:20px 18px;box-shadow:0 4px 16px rgba(0,0,0,0.05);">' +
      '<div style="font-family:\'Noto Serif TC\',serif;font-size:16px;font-weight:900;color:#5C4410;margin-bottom:14px;">🕑 最近紀錄</div>' +
      '<div style="display:flex;flex-direction:column;gap:0;">';
    recent.forEach(function (r, i) {
      var acc = rowAcc(r);
      histHTML +=
        '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:11px 4px;' +
        (i ? 'border-top:1px solid #F0E6CE;' : '') + '">' +
        '<div style="min-width:0;"><div style="font-size:13px;color:#5C4410;font-weight:600;">' + esc(r.mode || '全部') + '</div>' +
        '<div style="font-size:11px;color:#B0A080;">' + fmtDate(r.created_at) + '</div></div>' +
        '<div style="text-align:right;white-space:nowrap;"><span style="font-weight:800;color:#C8973A;font-size:15px;">' +
        (r.score != null ? r.score : '–') + '/' + (r.total != null ? r.total : '–') + '</span>' +
        '<span style="font-size:11px;color:#8B7340;margin-left:6px;">' + acc + '%</span></div>' +
        '</div>';
    });
    histHTML += '</div></div>';

    root.innerHTML = statsHTML + chartHTML + missHTML + histHTML;
    renderHeaderUser();

    // วาดกราฟ
    drawChart(rows);
  }

  function drawChart(rows) {
    if (!window.Chart) return;
    var ctx = document.getElementById('pg-chart');
    if (!ctx) return;
    var labels = rows.map(function (r, i) { return fmtDate(r.created_at).slice(5, 10); });
    var data = rows.map(function (r) { return rowAcc(r); });
    if (chartObj) { chartObj.destroy(); }
    chartObj = new window.Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: '正確率 %',
          data: data,
          borderColor: '#C8973A',
          backgroundColor: 'rgba(200,151,58,0.12)',
          fill: true,
          tension: 0.3,
          pointRadius: 3,
          pointBackgroundColor: '#C8973A'
        }]
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: {
          y: { min: 0, max: 100, ticks: { callback: function (v) { return v + '%'; } } },
          x: { ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 8 } }
        }
      }
    });
  }

  // ── header badge มุมขวา: 👤ชื่อ/✏️/🏆/📊/登出 — ให้ window.SITE_AUTH วาดให้เหมือนหน้าอื่น ──
  // (เดิมโชว์แค่อีเมล+登出 เฉยๆ ไม่มี✏️🏆📊 — ตอนนี้ครบเหมือนกันทุกหน้าแล้ว LIN 2026-07-03)
  function renderHeaderUser() {
    var slot = document.getElementById('pg-userslot');
    if (!slot) return;
    if (currentUser && window.SITE_AUTH && window.SITE_AUTH.ready) {
      window.SITE_AUTH.renderBadge('pg-userslot', { leaderboardHref: 'leaderboard.html', progressHref: 'my-progress.html' });
    } else if (!currentUser) {
      slot.innerHTML = '';
    }
  }

  function renderRoot() {
    if (currentUser) renderData();
    else { renderGate(); renderHeaderUser(); }
  }

  // ── init: session กลาง (window.SITE_AUTH) ถ้ามี — client เดียวกับทุกหน้า ──
  // มี fallback (client+listener ของตัวเอง) เผื่อ auth-widget.js โหลดไม่ทัน/พลาด กันหน้าพัง LIN 2026-07-03
  if (window.SITE_AUTH) {
    window.SITE_AUTH.onChange(function (user) {
      var was = currentUser;
      currentUser = user;
      if (!!was !== !!currentUser) renderRoot();
    });
  } else {
    sb.auth.getSession().then(function (res) {
      currentUser = (res.data && res.data.session && res.data.session.user) || null;
      renderRoot();
    });
    sb.auth.onAuthStateChange(function (_event, session) {
      var was = currentUser;
      currentUser = (session && session.user) || null;
      if (!!was !== !!currentUser) renderRoot();
    });
  }
})();
