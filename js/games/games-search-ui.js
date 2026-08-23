// ===================================================================
// GAMES SEARCH UI — locked Login Free entitlement
// Guest sees no usable search controls. Login Free receives one successful
// game-name OR learning-problem search per account/Taipei day through the
// existing server quota. No raw query or client-supplied user id is sent.
// ===================================================================
(function () {
  'use strict';

  var PENDING_KEY = 'problem_search_pending_v1';
  var GUEST_MESSAGE = '登入後可搜尋遊戲名稱或輸入你的學習問題。';
  var LIMIT_MESSAGE = '今天的遊戲搜尋已使用 1 次。付費方案可不限次數搜尋。';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function authState() {
    var auth = window.SITE_AUTH;
    if (!auth) return { resolved: false, unavailable: false, user: null };
    if (auth.ready === false || auth.authError === 'unavailable' || auth.authError === 'session_unavailable') {
      return { resolved: true, unavailable: true, user: null };
    }
    return { resolved: !!auth.authResolved, unavailable: false, user: auth.user || null };
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

  function claimGameSearch(user, query) {
    var uid = String(user && user.id || '');
    if (!uid) return Promise.resolve({ allowed: false, reason: 'auth_unavailable' });

    var queryKey = window.GameProblemSearch.compact(query);
    var pending = readPending(uid, queryKey) || { uid: uid, queryKey: queryKey, requestId: requestId() };
    writePending(pending);

    return getAccessToken().then(function (token) {
      if (!token) return { allowed: false, reason: 'auth_unavailable' };

      function attempt(remaining) {
        return postQuota(token, pending.requestId).then(function (result) {
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
    if (recs.length < 2) return false;

    var intro;
    if (cls.directRoute) intro = '依照你的問題，最適合先練這兩個：';
    else if (cls.status === 'UNSUPPORTED_NOW' || cls.status === 'AMBIGUOUS') intro = '這個問題目前沒有直接對應的遊戲，先給你兩個最接近的練習：';
    else intro = '我還不能百分之百確定，先給你兩個最接近的練習：';

    out.style.display = 'block';
    out.innerHTML = '<div class="gh-search-match-note">' + esc(intro) + '</div>' +
      recommendationCard(recs[0], 'primary') + recommendationCard(recs[1], 'secondary') +
      '<div class="gh-search-limit">' + esc(LIMIT_MESSAGE) + '</div>';
    return true;
  }

  function renderMessage(out, message) {
    out.style.display = 'block';
    out.innerHTML = '<div class="gh-search-empty">' + esc(message) + '</div>';
  }

  function directNavigate(entry) {
    if (entry && entry.href) window.location.href = entry.href;
  }

  function mountLoginSearch(gate, user) {
    var uid = String(user && user.id || '');
    gate.setAttribute('data-search-owner', uid);
    gate.innerHTML = '<div class="gh-search-prompt">搜尋遊戲</div>' +
      '<div class="gh-search-row">' +
        '<input type="search" id="gameSearchInput" class="gh-search-input" aria-label="搜尋遊戲名稱或學習問題" placeholder="輸入遊戲名稱或你的學習問題..." autocomplete="off" maxlength="200">' +
        '<button type="button" id="gameSearchBtn" class="gh-search-btn">搜尋</button>' +
      '</div>' +
      '<div id="gameSearchResult" class="gh-search-result" aria-live="polite"></div>';

    var input = document.getElementById('gameSearchInput');
    var btn = document.getElementById('gameSearchBtn');
    var out = document.getElementById('gameSearchResult');
    if (!input || !btn || !out) return;

    var running = false;
    function disableSearch() {
      input.disabled = true;
      btn.disabled = true;
    }

    function run() {
      if (running || input.disabled) return;
      var query = input.value.trim();
      if (!query) return;

      var state = authState();
      if (!state.resolved || state.unavailable || !state.user || String(state.user.id || '') !== uid) {
        disableSearch();
        renderMessage(out, '登入狀態暫時無法確認，遊戲搜尋目前不可用。');
        return;
      }
      if (!window.GameProblemSearch || !window.SEARCH_INDEX) {
        disableSearch();
        renderMessage(out, '搜尋功能還沒載入完成，重新整理頁面再試一次。');
        return;
      }

      running = true;
      btn.disabled = true;
      renderMessage(out, '搜尋中…');

      // Locked order: authenticated account -> shared server quota -> analyze/action.
      claimGameSearch(state.user, query).then(function (quota) {
        var live = authState();
        if (!live.resolved || live.unavailable || !live.user || String(live.user.id || '') !== uid) {
          disableSearch();
          renderMessage(out, '登入狀態已變更，這次不顯示搜尋結果。');
          return;
        }
        if (!quota.allowed) {
          disableSearch();
          if (quota.reason === 'limit') renderMessage(out, LIMIT_MESSAGE);
          else renderMessage(out, '遊戲搜尋暫時無法使用，請稍後再試。');
          return;
        }

        var analysis = window.GameProblemSearch.analyze(query);
        clearPending(quota.requestId);
        if (analysis.kind === 'direct-game' && analysis.directEntry) {
          directNavigate(analysis.directEntry);
          return;
        }

        disableSearch();
        if (!renderProblemResult(out, analysis)) renderMessage(out, LIMIT_MESSAGE);

        if (typeof gtag === 'function') {
          try { gtag('event', 'game_search', { category: 'game', confident: !!(analysis.classification && analysis.classification.directRoute) }); } catch (_) {}
        }
      }).catch(function () {
        disableSearch();
        renderMessage(out, '遊戲搜尋暫時無法使用，請稍後再試。');
      }).finally(function () {
        running = false;
        if (!input.disabled) btn.disabled = false;
      });
    }

    btn.addEventListener('click', run);
    input.addEventListener('keydown', function (event) {
      if (event.key === 'Enter') { event.preventDefault(); run(); }
    });
  }

  function init() {
    var gate = document.getElementById('gameSearchGate');
    if (!gate) return;
    var timeout = null;

    function renderAuth() {
      var state = authState();
      if (!state.resolved) {
        gate.removeAttribute('data-search-owner');
        gate.innerHTML = '<div class="gh-search-auth-message">正在確認登入狀態…</div>';
        return;
      }
      if (timeout) { clearTimeout(timeout); timeout = null; }
      if (state.unavailable) {
        gate.removeAttribute('data-search-owner');
        gate.innerHTML = '<div class="gh-search-auth-message">登入狀態暫時無法確認，遊戲搜尋目前不可用。</div>';
        return;
      }
      if (!state.user) {
        gate.removeAttribute('data-search-owner');
        gate.innerHTML = '<div class="gh-search-auth-message">' + esc(GUEST_MESSAGE) + '</div>';
        return;
      }
      var uid = String(state.user.id || '');
      if (gate.getAttribute('data-search-owner') === uid && document.getElementById('gameSearchInput')) return;
      mountLoginSearch(gate, state.user);
    }

    renderAuth();
    timeout = setTimeout(function () {
      if (!authState().resolved) gate.innerHTML = '<div class="gh-search-auth-message">登入狀態暫時無法確認，遊戲搜尋目前不可用。</div>';
    }, 5000);
    if (window.SITE_AUTH && typeof window.SITE_AUTH.onChange === 'function') window.SITE_AUTH.onChange(renderAuth);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
