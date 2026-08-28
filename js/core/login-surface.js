// Standard Login surface. Presentation only; Reading owns the auth/provider flow.
(function (window, document) {
  'use strict';

  var filename = String(window.location.pathname || '').split('/').pop().toLowerCase() || 'index.html';
  var gamePages = {
    'tone-finder.html': '#rg-profile-wrap',
    'reading-game.html': '#rg-profile-wrap',
    'listening-game.html': '.gsh-player-status',
    'typing-game.html': '#rg-profile-wrap',
    'word-order.html': '#rg-profile-wrap',
    'lego.html': '.rg-stat-row'
  };
  var singlePages = {
    'games.html': '.gh-sub',
    'games-practice.html': '.gh-sub',
    'games-challenge.html': '.phase1-paid-gate p',
    'my-progress.html': '.section-wrap > p',
    'vault.html': '.page-header',
    'all-board.html': '.section-wrap > div:first-child',
    'leaderboard.html': '.section-wrap > div:first-child',
    'reading-board.html': '.section-wrap > div:first-child',
    'listening-board.html': '.section-wrap > div:first-child',
    'typing-board.html': '.section-wrap > div:first-child',
    'word-order-board.html': '.section-wrap > div:first-child',
    'lego-board.html': '[data-phase1-access] h1',
    'mix-board.html': '[data-phase1-access] h1'
  };
  var parkedPages = /^(?:games-challenge|my-progress|vault|all-board|leaderboard|reading-board|listening-board|typing-board|word-order-board|lego-board|mix-board)\.html$/;

  if (!gamePages[filename] && !singlePages[filename]) return;

  function loadScript(src, ready) {
    if (ready && ready()) return Promise.resolve();
    var existing = Array.prototype.find.call(document.scripts, function (node) {
      return String(node.src || '').indexOf(src.split('?')[0]) !== -1;
    });
    if (existing) {
      return new Promise(function (resolve) {
        if (ready && ready()) return resolve();
        existing.addEventListener('load', resolve, { once: true });
        window.setTimeout(resolve, 1500);
      });
    }
    return new Promise(function (resolve, reject) {
      var script = document.createElement('script');
      script.src = src;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  function authDependencies() {
    return loadScript('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2', function () {
      return !!window.supabase;
    }).then(function () {
      return loadScript('js/core/supabase-config.js?v=9', function () {
        return !!window.SUPABASE_CONFIG;
      });
    }).then(function () {
      return loadScript('js/core/auth-widget.js?v=17', function () {
        return !!window.SITE_AUTH;
      });
    }).then(function () {
      return loadScript('js/games/reading-auth.js?v=29', function () {
        return !!window.READING_AUTH;
      });
    });
  }

  function visibleSlot() {
    return Array.prototype.find.call(document.querySelectorAll('#rg-login-slot'), function (slot) {
      return !slot.closest('[hidden],[inert],[aria-hidden="true"]');
    }) || null;
  }

  function gameSurface() {
    var surface = document.querySelector(gamePages[filename]);
    if (!surface) return null;
    var slot = visibleSlot() || document.querySelector('#rg-login-slot');
    var help = surface.querySelector('#rg-howto-btn,#tf-howto-btn,#lg-howto-btn,#typing-howto-btn,#wo-howto-btn,#lego-howto-btn,[title="怎麼玩"]');

    // Listening gameplay is parked, but its Login + help presentation remains
    // safely visible in the coming-soon shell. The game runtime stays hidden.
    if (filename === 'listening-game.html' && surface.closest('[aria-hidden="true"]')) {
      var parkedSurface = document.createElement('div');
      if (slot) parkedSurface.appendChild(slot);
      if (help) parkedSurface.appendChild(help);
      surface = parkedSurface;
      var helpModal = document.getElementById('lg-howto-modal');
      if (helpModal) document.body.appendChild(helpModal);
    }

    surface.classList.add('mrt-login-surface');
    surface.setAttribute('data-login-surface', 'game');

    help = surface.querySelector('#rg-howto-btn,#tf-howto-btn,#lg-howto-btn,#typing-howto-btn,#wo-howto-btn,#lego-howto-btn,[title="怎麼玩"]');
    if (help) {
      help.classList.add('mrt-login-howto');
      help.textContent = '📖 玩法';
    }
    slot = visibleSlot() || surface.querySelector('#rg-login-slot');
    if (slot && surface.firstElementChild !== slot) surface.insertBefore(slot, surface.firstChild);

    var anchors = {
      'tone-finder.html': '.tf-page-header.gsh-page-header',
      'reading-game.html': '.page-header.gsh-page-header',
      'listening-game.html': '#listening-coming-soon .gsh-page-header',
      'typing-game.html': '.page-header.gsh-page-header',
      'word-order.html': '.page-header.gsh-page-header',
      'lego.html': '.page .head'
    };
    var anchor = document.querySelector(anchors[filename]);
    var movable = surface.closest('.tf-tools-row,.rg-tools-row') || surface;
    if (anchor) anchor.insertAdjacentElement('afterend', movable);
    return surface;
  }

  function singleSurface() {
    var anchor = document.querySelector(singlePages[filename]);
    if (!anchor) return null;
    var surface = document.createElement('div');
    surface.className = 'mrt-login-surface';
    surface.setAttribute('data-login-surface', 'single');
    surface.setAttribute('aria-label', '登入帳號');
    var slot = visibleSlot();
    if (!slot) {
      slot = document.createElement('div');
      slot.id = 'rg-login-slot';
    }
    slot.classList.add('mrt-login-slot');
    surface.appendChild(slot);
    anchor.insertAdjacentElement('afterend', surface);

    ['lb-userslot', 'pg-userslot'].forEach(function (id) {
      var legacy = document.getElementById(id);
      if (legacy) legacy.hidden = true;
    });
    return surface;
  }

  function setState(state) {
    var allowed = ['login-required', 'loading', 'empty', 'error', 'unavailable'];
    if (allowed.indexOf(state) === -1) state = 'unavailable';
    var surface = document.querySelector('.mrt-login-surface');
    if (!surface) return;
    surface.setAttribute('data-login-state', state);
    var status = document.querySelector('.mrt-login-safe-state');
    if (!parkedPages.test(filename)) {
      if (status) status.remove();
      return;
    }
    if (!status) {
      status = document.createElement('p');
      status.className = 'mrt-login-safe-state';
      status.setAttribute('role', state === 'error' ? 'alert' : 'status');
      surface.insertAdjacentElement('afterend', status);
    }
    var copy = {
      'login-required': '登入入口已開放；此頁的個人資料與成績功能目前仍暫停。',
      'loading': '正在準備登入狀態…',
      'empty': '目前沒有可顯示的資料。',
      'error': '目前無法載入，請稍後再試。',
      'unavailable': '登入入口已開放；此功能目前仍暫停。'
    };
    status.textContent = copy[state];
  }

  function init() {
    var surface = gamePages[filename] ? gameSurface() : singleSurface();
    if (!surface) return;
    setState(parkedPages.test(filename) ? 'unavailable' : 'login-required');
    authDependencies().catch(function () { setState('error'); });
  }

  window.MRT_LOGIN_SURFACE = { setState: setState };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})(window, document);
