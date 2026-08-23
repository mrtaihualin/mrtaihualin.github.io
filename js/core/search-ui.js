// ===================================================================
// GLOBAL SEARCH UI — Game Search integration
// Game results always come from GameProblemSearch. Generic SearchEngine
// ranking is used only for non-game public entries.
// Guest game intent is hub-only and never consumes quota. Login Free direct
// names and learning problems share the same one-success/day server quota.
// ===================================================================
(function () {
  'use strict';

  var PENDING_KEY = 'problem_search_pending_v1';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function cardHTML(row) {
    var entry = row && row.entry ? row.entry : row;
    if (!entry) return '';
    return '<a class="hs-card" href="' + esc(entry.href) + '">' +
      '<span class="hs-card-title">' + esc(entry.title) + '</span>' +
      (entry.desc ? '<span class="hs-card-desc">' + esc(entry.desc) + '</span>' : '') +
    '</a>';
  }

  function show(out, html) {
    out.style.display = 'block';
    out.innerHTML = html;
  }

  function renderRelated(out, rows, note) {
    var html = '';
    if (note) html += '<div class="hs-search-note">' + esc(note) + '</div>';
    if (rows && rows.length) {
      html += '<div class="hs-related"><div class="hs-section-label">相關結果</div>' + rows.map(cardHTML).join('') + '</div>';
    } else {
      html += '<div class="hs-empty">沒有相關結果。</div>';
    }
    show(out, html);
  }

  function renderEmpty(out, note) {
    var prefix = note ? '<div class="hs-search-note">' + esc(note) + '</div>' : '';
    show(out, prefix + '<div class="hs-empty">還沒找到符合的內容 — 換個說法試試，或直接逛逛：' +
      '<div class="hs-empty-links">' +
        '<a href="games.html">🎮 遊戲練習室</a>' +
        '<a href="blog.html">📚 學習文章</a>' +
        '<a href="trial.html">🎯 預約免費體驗課</a>' +
      '</div></div>');
  }

  function requestId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
    var bytes = new Uint8Array(16);
    if (window.crypto && typeof window.crypto.getRandomValues === 'function') window.crypto.getRandomValues(bytes);
    else for (var i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    var h = Array.from(bytes, function (b) { return b.toString(16).padStart(2, '0'); }).join('');
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
  }

  function readPending(uid, queryKey) {
    try {
      var raw = sessionStorage.getItem(PENDING_KEY);
      if (!raw) return null;
      var row = JSON.parse(raw);
      if (row && row.uid === uid && row.queryKey === queryKey && row.requestId) return row;
    } catch (_) {}
    return null;
  }

  function writePending(row) {
    try { sessionStorage.setItem(PENDING_KEY, JSON.stringify(row)); } catch (_) {}
  }

  function clearPending(requestIdValue) {
    try {
      var raw = sessionStorage.getItem(PENDING_KEY);
      if (!raw) return;
      var row = JSON.parse(raw);
      if (!requestIdValue || (row && row.requestId === requestIdValue)) sessionStorage.removeItem(PENDING_KEY);
    } catch (_) {}
  }

  function getSession() {
    var client = window.getSupabaseClient ? window.getSupabaseClient() : null;
    if (!client || !client.auth || typeof client.auth.getSession !== 'function') {
      return Promise.resolve({ token: null, user: null, unavailable: true });
    }
    return client.auth.getSession().then(function (result) {
      var session = result && result.data ? result.data.session : null;
      return {
        token: session ? session.access_token : null,
        user: session ? session.user : null,
        unavailable: false
      };
    }).catch(function () {
      return { token: null, user: null, unavailable: true };
    });
  }

  function postQuota(accessToken, reqId) {
    var cfg = window.SUPABASE_CONFIG || {};
    if (!cfg.url || !cfg.anonKey || !accessToken) return Promise.reject(new Error('quota_client_unavailable'));

    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = controller ? setTimeout(function () { controller.abort(); }, 8000) : null;

    return fetch(cfg.url + '/functions/v1/problem-search-daily-limit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: cfg.anonKey,
        Authorization: 'Bearer ' + accessToken
      },
      // Privacy: quota service receives only an idempotency UUID, never the raw query or user id.
      body: JSON.stringify({ request_id: reqId }),
      signal: controller ? controller.signal : undefined
    }).then(function (res) {
      if (timer) clearTimeout(timer);
      return res.json().catch(function () { return {}; }).then(function (body) {
        return { ok: res.ok, status: res.status, body: body };
      });
    }).catch(function (error) {
      if (timer) clearTimeout(timer);
      throw error;
    });
  }

  function claimGameSearch(query, session) {
    if (!session || !session.user || !session.token) return Promise.resolve({ allowed: false, reason: 'guest' });

    var uid = String(session.user.id || '');
    if (!uid) return Promise.resolve({ allowed: false, reason: 'auth_unavailable' });
    var queryKey = window.GameProblemSearch.compact(query);
    var pending = readPending(uid, queryKey) || { uid: uid, queryKey: queryKey, requestId: requestId() };
    writePending(pending);

    function attempt(remaining) {
      return postQuota(session.token, pending.requestId).then(function (result) {
        if (result.ok && result.body && result.body.ok === true && result.body.allowed === true) {
          return { allowed: true, requestId: pending.requestId, idempotent: result.body.idempotent === true };
        }
        if (result.status === 429 || (result.body && result.body.reason === 'limit')) {
          clearPending(pending.requestId);
          return { allowed: false, reason: 'limit' };
        }
        if (result.status === 401 || result.status === 403) return { allowed: false, reason: 'auth_unavailable' };
        if (remaining > 0) return attempt(remaining - 1);
        return { allowed: false, reason: 'service_error' };
      }).catch(function () {
        if (remaining > 0) return attempt(remaining - 1);
        return { allowed: false, reason: 'service_error' };
      });
    }

    return attempt(1);
  }

  function publicGeminiFallback(query) {
    if (!window.SearchEngine || typeof window.SearchEngine.geminiFallback !== 'function') return Promise.resolve(null);
    return window.SearchEngine.geminiFallback(query).then(function (result) {
      // Practice destinations must never bypass GameProblemSearch/entitlement.
      if (!result || !result.entry || result.entry.category === 'practice') return null;
      return { entry: result.entry, source: 'public-gemini' };
    }).catch(function () { return null; });
  }

  var renderSerial = 0;

  function render(query) {
    var serial = ++renderSerial;
    var out = document.getElementById('homeSearchResults');
    if (!out) return;

    if (!window.GlobalSearchGameAdapter || !window.GameProblemSearch || !window.SearchEngine || !window.SEARCH_INDEX) {
      renderEmpty(out, '搜尋功能還沒載入完成，請重新整理頁面再試一次。');
      return;
    }

    var plan = window.GlobalSearchGameAdapter.analyze(query);
    var intent = window.GlobalSearchGameAdapter.gameIntent(plan);
    show(out, '<div class="hs-empty">搜尋中…</div>');

    function finish(note) {
      if (serial !== renderSerial) return Promise.resolve();
      var rows = window.GlobalSearchGameAdapter.related(plan);
      if (rows.length) {
        renderRelated(out, rows, note);
        return Promise.resolve();
      }
      return publicGeminiFallback(query).then(function (fallback) {
        if (serial !== renderSerial) return;
        if (fallback) renderRelated(out, [fallback], note);
        else renderEmpty(out, note);
      });
    }

    var work;
    if (intent === 'none') {
      work = finish('');
    } else {
      work = getSession().then(function (session) {
        if (session.unavailable) {
          return finish('登入狀態暫時無法確認；網站內容仍可搜尋，遊戲搜尋目前不可用。');
        }
        if (!session.user || !session.token) {
          return finish('登入後可搜尋遊戲名稱或輸入你的學習問題。');
        }
        return claimGameSearch(query, session).then(function (quota) {
          if (quota.allowed) {
            clearPending(quota.requestId);
            return finish('今天的遊戲搜尋已使用 1 次。前往遊戲中心繼續。');
          }
          if (quota.reason === 'limit') {
            return finish('今天的遊戲搜尋已使用 1 次。付費方案可不限次數搜尋。');
          }
          return finish('遊戲搜尋暫時無法使用；網站內容仍可正常搜尋。');
        });
      });
    }

    return Promise.resolve(work).finally(function () {
      if (typeof gtag === 'function') {
        try { gtag('event', 'site_search', { category: window.GA_CATEGORY || 'unknown', game_intent: intent }); } catch (_) {}
      }
    });
  }

  function init() {
    var input = document.getElementById('homeSearchInput');
    var btn = document.getElementById('homeSearchBtn');
    if (!input || !btn) return;

    var running = false;
    function run() {
      if (running) return;
      var q = input.value.trim();
      if (!q) return;
      running = true;
      btn.disabled = true;
      Promise.resolve(render(q)).finally(function () {
        running = false;
        btn.disabled = false;
      });
    }

    btn.addEventListener('click', run);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); run(); }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
