// ===================================================================
// GAMES SEARCH UI — Game Search V2.3
// Direct 6-game selection is unlimited. Natural-language Problem Search is
// Login Free 1/day and uses server-verified quota. No raw query is logged.
// ===================================================================
(function () {
  'use strict';

  var PENDING_KEY = 'problem_search_pending_v1';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function show(out, html) {
    out.style.display = 'block';
    out.innerHTML = html;
  }

  function renderError(out, message) {
    show(out, '<div class="gh-search-empty">' + esc(message) + '</div>');
  }

  function directNavigate(entry) {
    if (!entry || !entry.href) return;
    window.location.href = entry.href;
  }

  function authState() {
    var auth = window.SITE_AUTH;
    if (!auth) return { resolved: false, unavailable: false, user: null };
    if (auth.ready === false || auth.authError === 'unavailable') {
      return { resolved: true, unavailable: true, user: null };
    }
    return { resolved: !!auth.authResolved, unavailable: false, user: auth.user || null };
  }

  function waitForAuth() {
    var state = authState();
    if (state.resolved) return Promise.resolve(state);

    return new Promise(function (resolve) {
      var settled = false;
      var timer = setTimeout(function () {
        if (settled) return;
        settled = true;
        resolve({ resolved: false, unavailable: true, user: null });
      }, 5000);

      if (!window.SITE_AUTH || typeof window.SITE_AUTH.onChange !== 'function') {
        clearTimeout(timer);
        resolve({ resolved: true, unavailable: true, user: null });
        return;
      }

      window.SITE_AUTH.onChange(function () {
        if (settled) return;
        var next = authState();
        if (!next.resolved) return;
        settled = true;
        clearTimeout(timer);
        resolve(next);
      });
    });
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

  function getAccessToken() {
    var client = window.getSupabaseClient ? window.getSupabaseClient() : null;
    if (!client || !client.auth || typeof client.auth.getSession !== 'function') return Promise.resolve(null);
    return client.auth.getSession().then(function (result) {
      return result && result.data && result.data.session ? result.data.session.access_token : null;
    }).catch(function () { return null; });
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

  function claimProblemSearch(user, query) {
    var uid = String(user && user.id || '');
    if (!uid) return Promise.resolve({ allowed: false, reason: 'guest' });

    var queryKey = window.GameProblemSearch.compact(query);
    var pending = readPending(uid, queryKey) || {
      uid: uid,
      queryKey: queryKey,
      requestId: requestId()
    };
    writePending(pending);

    return getAccessToken().then(function (token) {
      if (!token) return { allowed: false, reason: 'auth_unavailable' };

      function attempt(remaining) {
        return postQuota(token, pending.requestId).then(function (result) {
          if (result.ok && result.body && result.body.ok === true && result.body.allowed === true) {
            return {
              allowed: true,
              requestId: pending.requestId,
              idempotent: result.body.idempotent === true,
              used: Number(result.body.used || 1),
              cap: Number(result.body.cap || 1)
            };
          }
          if (result.status === 429 || (result.body && result.body.reason === 'limit')) {
            clearPending(pending.requestId);
            return { allowed: false, reason: 'limit', used: Number(result.body.used || 1), cap: 1 };
          }
          if (result.status === 401) return { allowed: false, reason: 'auth_unavailable' };
          if (remaining > 0) return attempt(remaining - 1);
          return { allowed: false, reason: 'service_error' };
        }).catch(function () {
          if (remaining > 0) return attempt(remaining - 1);
          return { allowed: false, reason: 'service_error' };
        });
      }

      return attempt(1);
    });
  }

  function recommendationCard(item, label) {
    if (!item || !item.entry) return '';
    return '<div class="' + (label === 'primary' ? 'gh-search-primary-block' : 'gh-search-secondary') + '">' +
      (label === 'primary' ? '<div class="gh-search-primary">👉 ' + esc(item.entry.title) + '</div>' : '<div>也可以試試：<a href="' + esc(item.entry.href) + '">' + esc(item.entry.title) + '</a></div>') +
      (label === 'primary' ? '<div class="gh-search-reason">' + esc(item.entry.desc || '') + '</div><a class="gh-go" href="' + esc(item.entry.href) + '">開始玩 →</a>' : '') +
      '</div>';
  }

  function renderProblemResult(out, analysis) {
    var cls = analysis.classification || {};
    var recs = analysis.recommendations || [];
    if (recs.length < 2) {
      renderError(out, '搜尋結果暫時不完整，請稍後再試。');
      return false;
    }

    var intro;
    if (cls.directRoute) {
      intro = '<div class="gh-search-match-note">依照你的問題，最適合先練這兩個：</div>';
    } else if (cls.status === 'UNSUPPORTED_NOW' || cls.status === 'AMBIGUOUS') {
      intro = '<div class="gh-search-match-note">這個問題目前沒有直接對應的遊戲，先給你兩個最接近的練習：</div>';
    } else {
      intro = '<div class="gh-search-match-note">我還不能百分之百確定，先給你兩個最接近的練習：</div>';
    }

    show(out, intro + recommendationCard(recs[0], 'primary') + recommendationCard(recs[1], 'secondary'));
    return true;
  }

  function init() {
    var input = document.getElementById('gameSearchInput');
    var select = document.getElementById('gameSearchSelect');
    var btn = document.getElementById('gameSearchBtn');
    var out = document.getElementById('gameSearchResult');
    if (!input || !select || !btn || !out) return;

    select.addEventListener('change', function () {
      var id = select.value;
      if (!id || !window.SEARCH_INDEX || !Array.isArray(window.SEARCH_INDEX.GAMES)) return;
      var entry = window.SEARCH_INDEX.GAMES.find(function (row) { return row.id === id; });
      if (entry) directNavigate(entry);
    });

    var running = false;

    function run() {
      if (running) return;
      var query = input.value.trim();
      if (!query) return;

      if (!window.GameProblemSearch || !window.SEARCH_INDEX) {
        renderError(out, '搜尋功能還沒載入完成，重新整理頁面再試一次。');
        return;
      }

      var analysis = window.GameProblemSearch.analyze(query);
      if (analysis.kind === 'direct-game' && analysis.directEntry) {
        directNavigate(analysis.directEntry);
        return;
      }

      running = true;
      btn.disabled = true;
      show(out, '<div class="gh-search-empty">搜尋中…</div>');

      waitForAuth().then(function (auth) {
        if (auth.unavailable || !auth.resolved) {
          renderError(out, '登入狀態暫時無法確認，問題搜尋目前不可用。直接選擇上面的 6 個遊戲仍可正常使用。');
          return null;
        }
        if (!auth.user) {
          renderError(out, '問題搜尋提供給登入會員每天 1 次。你仍可直接選擇上面的 6 個遊戲，不限次數。');
          return null;
        }
        return claimProblemSearch(auth.user, query);
      }).then(function (quota) {
        if (!quota) return;
        if (!quota.allowed) {
          if (quota.reason === 'limit') {
            renderError(out, '今天的問題搜尋已使用 1 次。你仍可直接選擇 6 個遊戲，不限次數。');
          } else if (quota.reason === 'auth_unavailable') {
            renderError(out, '登入狀態暫時無法確認，這次不顯示問題分析結果。');
          } else {
            renderError(out, '問題搜尋暫時無法使用，請稍後再試。');
          }
          return;
        }

        var displayed = renderProblemResult(out, analysis);
        if (displayed) clearPending(quota.requestId);

        if (typeof gtag === 'function') {
          try {
            gtag('event', 'game_search', {
              category: 'game',
              confident: !!(analysis.classification && analysis.classification.directRoute)
            });
          } catch (_) {}
        }
      }).catch(function () {
        renderError(out, '問題搜尋暫時無法使用，請稍後再試。');
      }).finally(function () {
        running = false;
        btn.disabled = false;
      });
    }

    btn.addEventListener('click', run);
    input.addEventListener('keydown', function (event) {
      if (event.key === 'Enter') {
        event.preventDefault();
        run();
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
