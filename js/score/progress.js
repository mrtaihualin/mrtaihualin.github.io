// progress.js — Phase 1 `學習中心` (Guest Free + Login Free)
// Guest: account introduction only; never shows fake zero learning history.
// Login Free: one 學習進度 section (Progress/SRS/Review/Mastered) + 我的內容.
// No 下一步, overall %, readiness formula, or paid runtime in Phase 1.
(function () {
  'use strict';

  var cfg = window.SUPABASE_CONFIG || {};
  var ready = cfg.url && cfg.anonKey &&
    cfg.url.indexOf('YOUR_') === -1 && cfg.anonKey.indexOf('YOUR_') === -1 &&
    window.supabase && window.supabase.createClient;
  var root = document.getElementById('progress-root');
  if (!root) return;

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"]/g, function (char) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char];
    });
  }
  function box(icon, title, text, extra) {
    return '<div class="pg-panel pg-message">' +
      '<div class="pg-message-icon">' + icon + '</div>' +
      '<h2>' + esc(title) + '</h2><p>' + text + '</p>' + (extra || '') + '</div>';
  }
  if (!ready) {
    root.innerHTML = box('⚙️', '系統尚未就緒', '學習資料服務尚未設定完成，免費遊戲仍可繼續使用。',
      '<a class="pg-btn pg-btn-primary" href="games.html">繼續免費練習</a>');
    return;
  }

  var sb = window.getSupabaseClient ? window.getSupabaseClient() : window.supabase.createClient(cfg.url, cfg.anonKey);
  var currentUser = null;
  var renderToken = 0;
  var chartObj = null;
  var SKILLS = [
    { code: 'tone', sessionGame: 'tone', label: 'Tone', icon: '🎵', href: 'tone-finder.html' },
    { code: 'reading', sessionGame: 'reading', label: 'Reading', icon: '✍️', href: 'reading-game.html' },
    { code: 'listening', sessionGame: 'listening', label: 'Listening', icon: '🎧', href: 'listening-game.html' },
    { code: 'typing', sessionGame: 'typing', label: 'Typing', icon: '⌨️', href: 'typing-game.html' },
    { code: 'wordorder', sessionGame: 'word_order', label: 'Word Order', icon: '🧩', href: 'word-order.html' }
  ];

  function injectStyles() {
    if (document.getElementById('pg-phase1-styles')) return;
    var style = document.createElement('style');
    style.id = 'pg-phase1-styles';
    style.textContent = [
      '.pg-panel{background:#fff;border-radius:18px;padding:22px;box-shadow:0 6px 22px rgba(80,55,12,.07);}',
      '.pg-message{text-align:center;max-width:560px;margin:0 auto;padding:34px 26px;}',
      '.pg-message-icon{font-size:44px;margin-bottom:10px}.pg-message h2{margin:0 0 9px;color:#5C4410;font-size:21px}.pg-message p{margin:0;color:#765f32;line-height:1.8;font-size:14px}',
      '.pg-btn{display:inline-flex;align-items:center;justify-content:center;border-radius:999px;padding:10px 20px;font-weight:800;font-size:14px;text-decoration:none;border:1px solid rgba(139,99,16,.35);cursor:pointer;font-family:inherit}',
      '.pg-btn-primary{background:#8B6310;color:#fff;border-color:#8B6310}.pg-btn-secondary{background:#fff;color:#8B6310}',
      '.pg-actions{display:flex;gap:10px;flex-wrap:wrap;justify-content:center;margin-top:20px}',
      '.pg-benefits{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;text-align:left;margin:20px 0 0;padding:0;list-style:none}',
      '.pg-benefits li{background:#FBF5E7;border-radius:10px;padding:10px 12px;font-size:13px;color:#5C4410}',
      '.pg-section{margin-top:26px}.pg-section-title{font-size:17px;font-weight:900;color:#5C4410;margin:0 0 12px}',
      '.pg-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px}',
      '.pg-skill{border:1px solid rgba(200,151,58,.28)}.pg-skill-head{display:flex;gap:9px;align-items:center;font-weight:900;color:#5C4410}.pg-skill-icon{font-size:22px}',
      '.pg-status{font-size:13px;color:#765f32;line-height:1.7;margin-top:12px}.pg-muted{color:#9a895e}.pg-srs{margin-top:8px;padding-top:8px;border-top:1px solid #F0E6CE;font-size:12px;color:#765f32}',
      '.pg-content-card{display:flex;flex-direction:column;min-height:138px}.pg-content-card h3{margin:0 0 8px;color:#5C4410;font-size:16px}.pg-content-card p{margin:0;color:#765f32;line-height:1.7;font-size:13px;flex:1}.pg-content-card .pg-btn{align-self:flex-start;margin-top:14px}',
      '.pg-warning{background:#FFF6E5;border:1px solid #EAC36B;color:#765113;border-radius:12px;padding:11px 14px;font-size:12.5px;line-height:1.6;margin:0 0 14px}',
      '.pg-chart{margin-top:12px}.pg-chart canvas{max-height:230px}',
      '@media(max-width:560px){.pg-benefits{grid-template-columns:1fr}.pg-panel{padding:18px}.pg-grid{grid-template-columns:1fr}.pg-actions .pg-btn{width:100%;box-sizing:border-box}}'
    ].join('');
    document.head.appendChild(style);
  }
  injectStyles();

  function doGoogleLogin() {
    sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.href } })
      .then(function (res) { if (res.error) alert('登入 Google 失敗：' + res.error.message); });
  }
  function doEmailLogin() {
    var email = window.prompt('請輸入 Email 以接收驗證碼：');
    if (!email) return;
    email = email.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { alert('Email 格式不正確'); return; }
    sb.auth.signInWithOtp({ email: email, options: { shouldCreateUser: true } }).then(function (res) {
      if (res.error) { alert('驗證碼寄送失敗：' + res.error.message); return; }
      var code = window.prompt('驗證碼已寄出，請輸入信中的驗證碼：');
      if (!code) return;
      sb.auth.verifyOtp({ email: email, token: code.trim(), type: 'email' }).then(function (verified) {
        if (verified.error) alert('驗證碼錯誤或已過期，請重新登入');
      });
    });
  }
  function renderGuest() {
    if (chartObj) { chartObj.destroy(); chartObj = null; }
    root.innerHTML = '<div class="pg-panel pg-message">' +
      '<div class="pg-message-icon">👋</div>' +
      '<div style="font-size:12px;font-weight:900;color:#8B6310;letter-spacing:1px;margin-bottom:6px">訪客 Guest</div>' +
      '<h2>登入後使用「學習中心」</h2>' +
      '<p>你現在仍可免費玩遊戲。登入前的練習不會被當成帳號學習紀錄；成功登入後才開始記錄。</p>' +
      '<ul class="pg-benefits">' +
        '<li><b>學習進度</b> — 清楚掌握每項技能進度</li>' +
        '<li><b>SRS 複習</b> — 自動提醒該複習的內容</li>' +
        '<li><b>我的單詞</b> — 收藏想記住的單詞</li>' +
        '<li><b>我的句子</b> — 保存實用泰語句子</li>' +
        '<li><b>跨裝置同步</b> — 手機、電腦接著學</li>' +
      '</ul>' +
      '<div class="pg-actions"><button id="pg-login-primary" class="pg-btn pg-btn-primary">免費登入</button>' +
        '<button id="pg-email" class="pg-btn pg-btn-secondary">使用 Email 登入</button>' +
        '<a class="pg-btn pg-btn-secondary" href="games.html">繼續免費練習</a>' +
        '<button class="pg-btn pg-btn-secondary" type="button" disabled hidden title="付費方案尚未開放">查看方案與價格</button>' +
      '</div></div>';
    document.getElementById('pg-login-primary').onclick = doGoogleLogin;
    document.getElementById('pg-email').onclick = doEmailLogin;
    renderHeaderUser();
  }
  function renderLoading() {
    root.innerHTML = box('⏳', '正在載入我的學習', '正在讀取此帳號的學習資料…');
  }
  function taipeiDate(value) {
    try {
      return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(value ? new Date(value) : new Date());
    } catch (e) { return new Date(value || Date.now()).toISOString().slice(0, 10); }
  }
  function fmtDate(value) {
    if (!value) return '';
    try {
      return new Intl.DateTimeFormat('zh-TW', {
        timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit'
      }).format(new Date(value));
    } catch (e) { return String(value).slice(0, 10); }
  }
  function correctCount(row) {
    var total = Number(row.total) || 0;
    var wrong = {};
    (row.wrong_words || []).forEach(function (item) { if (item && item.word) wrong[item.word] = true; });
    return Math.max(0, Math.min(total, total - Object.keys(wrong).length));
  }
  function rowAccuracy(row) {
    var total = Number(row.total) || 0;
    return total ? Math.round(correctCount(row) / total * 100) : null;
  }
  function normalizeGame(value) {
    if (window.LearningSummary) return LearningSummary.normalizeGame(value);
    if (value === 'word_order') return 'wordorder';
    return value || 'reading'; // legacy reading_sessions rows predate the game column
  }
  function queryData(userId) {
    if (!window.LearningSummary) return Promise.reject(new Error('learning summary unavailable'));
    return LearningSummary.queryData(sb, userId);
  }
  function emptySkillData() {
    if (window.LearningSummary) return LearningSummary.emptySkillData();
    var result = {};
    SKILLS.forEach(function (skill) {
      result[skill.code] = { sessions: [], srs: [], lastAt: null };
    });
    return result;
  }
  function organize(toneRows, sessionRows, srsRows) {
    if (window.LearningSummary) return LearningSummary.organize(toneRows, sessionRows, srsRows);
    var result = emptySkillData();
    toneRows.forEach(function (row) { result.tone.sessions.push(row); });
    sessionRows.forEach(function (row) {
      var code = normalizeGame(row.game);
      if (result[code]) result[code].sessions.push(row);
    });
    srsRows.forEach(function (row) {
      var code = normalizeGame(row.game === 'wordorder' ? 'word_order' : row.game);
      if (result[code]) result[code].srs.push(row);
    });
    Object.keys(result).forEach(function (code) {
      var rows = result[code].sessions;
      result[code].lastAt = rows.length ? rows[rows.length - 1].created_at : null;
    });
    return result;
  }
  function srsSummary(rows) {
    if (!rows.length) return '<span class="pg-muted">尚無 SRS 紀錄</span>';
    var today = taipeiDate();
    var counts = { newState: 0, day1: 0, day7: 0, mastered: 0, due: 0 };
    rows.forEach(function (row) {
      if (row.mastered) counts.mastered++;
      else if (Number(row.stage) >= 2) counts.day7++;
      else if (Number(row.stage) === 1) counts.day1++;
      else counts.newState++;
      if (!row.mastered && row.due_date && row.due_date <= today) counts.due++;
    });
    var parts = [];
    if (counts.newState) parts.push('New ' + counts.newState);
    if (counts.day1) parts.push('Day 1 ' + counts.day1);
    if (counts.day7) parts.push('Day 7 ' + counts.day7);
    if (counts.mastered) parts.push('Mastered ' + counts.mastered);
    if (counts.due) parts.push('待複習 ' + counts.due);
    return esc(parts.join(' · '));
  }
  function skillCard(skill, data) {
    var sessionText = data.sessions.length
      ? '帳號紀錄：' + data.sessions.length + ' 次' + (data.lastAt ? '<br>最近練習：' + esc(fmtDate(data.lastAt)) : '')
      : '<span class="pg-muted">尚無此帳號的練習紀錄</span>';
    return '<article class="pg-panel pg-skill" data-skill="' + skill.code + '">' +
      '<div class="pg-skill-head"><span class="pg-skill-icon">' + skill.icon + '</span><span>' + skill.label + '</span></div>' +
      '<div class="pg-status">' + sessionText + '</div>' +
      '<div class="pg-srs"><b>SRS / Review：</b>' + srsSummary(data.srs) + '</div>' +
      '<a class="pg-btn pg-btn-secondary" style="margin-top:12px" href="' + skill.href + '">繼續練習</a></article>';
  }
  function drawToneChart(rows) {
    if (!window.Chart || !rows.length) return;
    var canvas = document.getElementById('pg-tone-chart');
    if (!canvas) return;
    var chartRows = rows.slice(-30);
    if (chartObj) chartObj.destroy();
    chartObj = new window.Chart(canvas, {
      type: 'line',
      data: {
        labels: chartRows.map(function (row) { return fmtDate(row.created_at); }),
        datasets: [{
          data: chartRows.map(rowAccuracy), borderColor: '#C8973A',
          backgroundColor: 'rgba(200,151,58,.12)', fill: true, tension: .3, pointRadius: 3
        }]
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: { y: { min: 0, max: 100, ticks: { callback: function (value) { return value + '%'; } } } }
      }
    });
  }
  function renderLoginData(results, token) {
    if (token !== renderToken || !currentUser) return;
    var labels = ['聲調紀錄', '其他技能紀錄', 'SRS'];
    var errors = [];
    results.forEach(function (res, index) { if (res && res.error) errors.push(labels[index] + '：' + res.error.message); });
    var toneRows = results[0] && !results[0].error ? (results[0].data || []) : [];
    var sessionRows = results[1] && !results[1].error ? (results[1].data || []) : [];
    var srsRows = results[2] && !results[2].error ? (results[2].data || []) : [];
    var grouped = organize(toneRows, sessionRows, srsRows);
    var warning = errors.length
      ? '<div class="pg-warning">⚠️ 有部分資料暫時無法讀取；畫面只顯示成功讀取的帳號資料。<br>' + esc(errors.join('；')) + '</div>'
      : '';
    var skills = SKILLS.map(function (skill) { return skillCard(skill, grouped[skill.code]); }).join('');
    root.innerHTML = warning +
      '<section><h3 class="pg-section-title">學習進度</h3><div class="pg-grid">' + skills + '</div>' +
        '<p class="pg-muted" style="font-size:12px;line-height:1.7;margin:10px 2px 0">SRS 僅顯示帳號狀態，不會從此頁改動。每項技能分開計算；一項 Mastered 不代表其他技能也 Mastered。</p></section>' +
      '<section class="pg-section"><h3 class="pg-section-title">我的內容</h3><div class="pg-grid">' +
        '<article class="pg-panel pg-content-card"><h3>🔖 我的單詞</h3><p>查看此帳號儲存的單詞，並回到支援的遊戲練習。</p><a class="pg-btn pg-btn-secondary" href="vault.html#words">查看我的單詞</a></article>' +
        '<article class="pg-panel pg-content-card"><h3>📝 我的句子</h3><p>查看此帳號儲存的句子，並回到語序遊戲練習。</p><a class="pg-btn pg-btn-secondary" href="vault.html#sentences">查看我的句子</a></article>' +
      '</div></section>' +
      '<section class="pg-section pg-panel"><p style="margin:0;color:#765f32;line-height:1.7">想知道自己的泰語實戰準備度？升級方案即可查看。</p>' +
        '<button class="pg-btn pg-btn-secondary" style="margin-top:12px" type="button" disabled title="付費方案尚未在 Phase 1 開放">查看升級方案</button></section>' +
      '<div class="pg-actions" style="margin-top:28px"><a class="pg-btn pg-btn-primary" href="games.html">繼續免費練習</a><a class="pg-btn pg-btn-secondary" href="vault.html">我的內容</a></div>';
    renderHeaderUser();
  }
  function renderLogin() {
    var token = ++renderToken;
    var userId = currentUser && currentUser.id;
    if (!userId) { renderGuest(); return; }
    renderLoading();
    queryData(userId).then(function (results) {
      renderLoginData(results, token);
    }).catch(function (error) {
      if (token !== renderToken) return;
      root.innerHTML = box('⚠️', '學習資料載入失敗', esc(error && error.message || '網路錯誤'),
        '<a class="pg-btn pg-btn-primary" href="games.html">繼續免費練習</a>');
      renderHeaderUser();
    });
  }
  function renderHeaderUser() {
    var slot = document.getElementById('pg-userslot');
    if (!slot) return;
    if (currentUser && window.SITE_AUTH && window.SITE_AUTH.ready) {
      window.SITE_AUTH.renderBadge('pg-userslot', { leaderboardHref: 'leaderboard.html', progressHref: 'my-progress.html' });
    } else if (!currentUser) slot.innerHTML = '';
  }
  function applyUser(user) {
    var before = currentUser && currentUser.id;
    var after = user && user.id;
    currentUser = user || null;
    if (before === after && root.getAttribute('data-pg-rendered') === '1') return;
    root.setAttribute('data-pg-rendered', '1');
    if (currentUser) renderLogin();
    else { renderToken++; renderGuest(); }
  }

  if (window.SITE_AUTH && window.SITE_AUTH.onChange) {
    window.SITE_AUTH.onChange(applyUser);
  } else {
    sb.auth.getSession().then(function (res) {
      applyUser(res && res.data && res.data.session && res.data.session.user);
    });
    sb.auth.onAuthStateChange(function (_event, session) { applyUser(session && session.user); });
  }
})();
