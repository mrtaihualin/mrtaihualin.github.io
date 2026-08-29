// Shared Login header. Reading is the sole markup and geometry authority.
// Presentation only; Reading continues to own the auth/provider flow.
(function (window, document) {
  'use strict';

  var filename = String(window.location.pathname || '').split('/').pop().toLowerCase() || 'index.html';
  var gamePages = {
    'tone-finder.html': { root: '.tf-page.gsh-shell', header: '.tf-page-header.gsh-page-header', surface: '#rg-profile-wrap' },
    'reading-game.html': { root: '.v3-page.gsh-shell', header: '.page-header.gsh-page-header', surface: '#rg-profile-wrap' },
    'listening-game.html': { root: '#listening-coming-soon', header: '#listening-coming-soon .gsh-page-header', subtitle: '#listening-live-game .page-sub', surface: '#listening-live-game .gsh-player-status' },
    'typing-game.html': { root: '.v3-page.gsh-shell', header: '.page-header.gsh-page-header', surface: '#rg-profile-wrap' },
    'word-order.html': { root: '.v3-page.gsh-shell', header: '.page-header.gsh-page-header', surface: '#rg-profile-wrap' },
    'lego.html': { root: '.page', header: '.page .head', surface: 'body > .rg-stat-row' }
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
    'word-order-board.html': '.section-wrap > div:first-child'
  };
  var parkedPages = /^(?:games-challenge|my-progress|all-board|leaderboard|reading-board|listening-board|typing-board|word-order-board)\.html$/;
  var landscapeQuery = window.matchMedia && window.matchMedia('(orientation: landscape) and (max-width: 1024px) and (max-height: 600px)');
  var activeSurface = null;
  var gameState = null;

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
    return loadScript('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2', function () { return !!window.supabase; })
      .then(function () { return loadScript('js/core/supabase-config.js?v=9', function () { return !!window.SUPABASE_CONFIG; }); })
      .then(function () { return loadScript('js/core/auth-widget.js?v=17', function () { return !!window.SITE_AUTH; }); })
      .then(function () { return loadScript('js/games/reading-auth.js?v=29', function () { return !!window.READING_AUTH; }); });
  }

  function visibleSlot() {
    return Array.prototype.find.call(document.querySelectorAll('#rg-login-slot'), function (slot) {
      return !slot.closest('[hidden],[inert],[aria-hidden="true"]');
    }) || null;
  }

  function readingHeader(title, subtitle) {
    var header = document.createElement('div');
    header.className = 'page-header gsh-page-header';
    header.setAttribute('data-reading-login-component', 'header');
    var heading = document.createElement('h1');
    heading.className = 'page-title';
    heading.setAttribute('style', 'margin:0;');
    heading.textContent = title;
    header.appendChild(heading);
    var detail = document.createElement('div');
    detail.className = 'page-sub';
    detail.textContent = subtitle;
    header.appendChild(detail);
    return header;
  }

  function readingSlot(sourceSlot) {
    var slot = document.createElement('div');
    if (sourceSlot) {
      while (sourceSlot.firstChild) slot.appendChild(sourceSlot.firstChild);
      sourceSlot.removeAttribute('id');
    }
    return slot;
  }

  // Exact Reading Account Bar template. Every scoped page calls this one
  // function; the only structural variant is omitting Help on non-game pages.
  function showsVaultCompanion() {
    return !gamePages[filename] && filename !== 'vault.html' && filename !== 'my-progress.html';
  }

  function readingSurface(slot, withHelp, originalHelp) {
    var row = document.createElement('div');
    row.className = 'rg-tools-row';
    row.setAttribute('data-reading-login-component', 'row');
    var surface = document.createElement('div');
    surface.id = 'rg-profile-wrap';
    surface.className = 'gsh-player-status mrt-login-surface';
    surface.setAttribute('data-login-surface', withHelp ? 'game' : 'single');
    surface.setAttribute('style', 'display:flex;flex-direction:row;flex-wrap:wrap;align-items:center;gap:8px;width:100%;box-sizing:border-box;background:#FAF4E8;border:1.5px solid #C8973A;border-radius:16px;padding:10px 12px;');
    slot.id = 'rg-login-slot';
    slot.className = '';
    slot.setAttribute('style', 'display:flex;align-items:center;');
    surface.appendChild(slot);
    if (withHelp) {
      var help = document.createElement('span');
      help.className = 'tf-streak-chip mrt-login-howto';
      help.id = 'rg-howto-btn';
      help.setAttribute('style', 'cursor:pointer;');
      help.setAttribute('role', 'button');
      help.setAttribute('tabindex', '0');
      help.setAttribute('title', '怎麼玩');
      help.textContent = '📖 玩法';
      help.addEventListener('click', function (event) {
        if (originalHelp && typeof originalHelp.onclick === 'function') originalHelp.onclick.call(help, event);
        else if (originalHelp) originalHelp.click();
      });
      help.addEventListener('keydown', function (event) {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          help.click();
        }
      });
      surface.appendChild(help);
    } else if (showsVaultCompanion()) {
      var vault = document.createElement('a');
      vault.className = 'tf-streak-chip mrt-login-vault';
      vault.href = 'vault.html';
      vault.title = '開啟泰語單字庫';
      vault.textContent = '🔖 字庫';
      surface.appendChild(vault);
    }
    var stats = document.createElement('div');
    stats.className = 'rg-stat-row';
    stats.id = 'rg-stat-row';
    stats.setAttribute('style', 'display:none;justify-content:flex-start;margin:0;width:auto;max-width:none;gap:8px;');
    var streak = document.createElement('span');
    streak.className = 'tf-streak-chip';
    streak.setAttribute('title', '連續天數');
    streak.appendChild(document.createTextNode('🔥 '));
    var streakValue = document.createElement('b');
    streakValue.id = 'rg-streak-num';
    streakValue.textContent = '0';
    streak.appendChild(streakValue);
    stats.appendChild(streak);
    surface.appendChild(stats);
    var cta = document.createElement('div');
    cta.id = 'rg-cta-login';
    cta.setAttribute('style', 'flex:1;min-width:220px;');
    surface.appendChild(cta);
    row.appendChild(surface);
    return { row: row, surface: surface };
  }

  function readingHost(withHeader, title, subtitle, slot, withHelp, originalHelp) {
    var host = document.createElement('div');
    host.className = 'v3-page gsh-shell';
    host.setAttribute('data-reading-login-component', 'host');
    if (withHeader) host.appendChild(readingHeader(title, subtitle));
    var component = readingSurface(slot, withHelp, originalHelp);
    host.appendChild(component.row);
    return { host: host, surface: component.surface };
  }

  function captureGameState() {
    var config = gamePages[filename];
    var root = document.querySelector(config.root);
    var header = document.querySelector(config.header);
    var surface = document.querySelector(config.surface);
    if (!root || !header || !surface) return null;
    var row = surface.closest('.tf-tools-row,.rg-tools-row') || surface;
    var slot = surface.querySelector('#rg-login-slot') || document.querySelector('#rg-login-slot');
    var help = surface.querySelector('#rg-howto-btn,#tf-howto-btn,#lg-howto-btn,#typing-howto-btn,#wo-howto-btn,#lego-howto-btn,[title="怎麼玩"]');
    if (!slot || !help) return null;
    var heading = header.querySelector('h1');
    var detail = header.querySelector('.page-sub,.tf-page-hint,p');
    if (!detail && config.subtitle) detail = document.querySelector(config.subtitle);
    return {
      root: root,
      header: header,
      headerHidden: header.hidden,
      headerDisplay: header.style.display,
      row: row,
      rowHidden: row.hidden,
      rowDisplay: row.style.display,
      surface: surface,
      surfaceId: surface.id,
      help: help,
      helpId: help.id,
      slot: slot,
      slotId: slot.id,
      slotClass: slot.className,
      slotStyle: slot.getAttribute('style'),
      duplicateIds: Array.prototype.map.call(surface.querySelectorAll('#rg-stat-row,#rg-streak-num,#rg-cta-login'), function (node) {
        return { node: node, id: node.id };
      }),
      title: heading ? heading.textContent.trim() : '',
      subtitle: detail ? detail.textContent.trim() : '',
      host: null,
      canonicalSlot: null
    };
  }

  function activateReadingGameSurface() {
    if (!gameState) gameState = captureGameState();
    if (!gameState) return null;
    if (gameState.host && gameState.host.isConnected) return activeSurface;
    gameState.header.hidden = true;
    gameState.header.style.display = 'none';
    gameState.row.hidden = true;
    gameState.row.style.display = 'none';
    gameState.surface.removeAttribute('id');
    gameState.help.removeAttribute('id');
    gameState.duplicateIds.forEach(function (entry) { entry.node.removeAttribute('id'); });
    gameState.canonicalSlot = readingSlot(gameState.slot);
    var component = readingHost(true, gameState.title, gameState.subtitle, gameState.canonicalSlot, true, gameState.help);
    gameState.host = component.host;
    gameState.root.insertAdjacentElement('beforebegin', component.host);
    gameState.root.setAttribute('data-reading-login-lower-root', '');
    activeSurface = component.surface;
    if (filename === 'listening-game.html') {
      var helpModal = document.getElementById('lg-howto-modal');
      if (helpModal) document.body.appendChild(helpModal);
    }
    return activeSurface;
  }

  function activateLegacyLandscapeSurface() {
    if (!gameState) gameState = captureGameState();
    if (!gameState) return null;
    if (gameState.host) {
      if (gameState.canonicalSlot) {
        while (gameState.canonicalSlot.firstChild) gameState.slot.appendChild(gameState.canonicalSlot.firstChild);
        gameState.canonicalSlot = null;
      }
      gameState.host.remove();
      gameState.host = null;
    }
    gameState.header.hidden = gameState.headerHidden;
    gameState.header.style.display = gameState.headerDisplay;
    gameState.row.hidden = gameState.rowHidden;
    gameState.row.style.display = gameState.rowDisplay;
    if (gameState.surfaceId) gameState.surface.id = gameState.surfaceId;
    if (gameState.helpId) gameState.help.id = gameState.helpId;
    gameState.duplicateIds.forEach(function (entry) { entry.node.id = entry.id; });
    gameState.slot.id = gameState.slotId || 'rg-login-slot';
    gameState.slot.className = gameState.slotClass;
    if (gameState.slotStyle === null) gameState.slot.removeAttribute('style');
    else gameState.slot.setAttribute('style', gameState.slotStyle);
    if (gameState.surface.firstElementChild !== gameState.slot) gameState.surface.insertBefore(gameState.slot, gameState.surface.firstChild);
    gameState.surface.classList.add('mrt-login-surface');
    gameState.surface.setAttribute('data-login-surface', 'game');
    gameState.help.textContent = '📖 玩法';
    gameState.help.classList.add('mrt-login-howto');
    gameState.header.insertAdjacentElement('afterend', gameState.row);
    gameState.root.removeAttribute('data-reading-login-lower-root');
    activeSurface = gameState.surface;
    return activeSurface;
  }

  function syncGameSurface() {
    var surface = landscapeQuery && landscapeQuery.matches ? activateLegacyLandscapeSurface() : activateReadingGameSurface();
    if (surface) setState(parkedPages.test(filename) ? 'unavailable' : 'login-required');
    return surface;
  }

  function singleSurface() {
    var anchor = document.querySelector(singlePages[filename]);
    if (!anchor) return null;
    var sourceSlot = visibleSlot();
    var slot = readingSlot(sourceSlot);
    var component = readingHost(false, '', '', slot, false, null);
    component.host.setAttribute('aria-label', '登入帳號');
    anchor.insertAdjacentElement('afterend', component.host);
    ['lb-userslot', 'pg-userslot'].forEach(function (id) {
      var legacy = document.getElementById(id);
      if (legacy) legacy.hidden = true;
    });
    activeSurface = component.surface;
    return activeSurface;
  }

  function setState(state) {
    var allowed = ['login-required', 'loading', 'empty', 'error', 'unavailable'];
    if (allowed.indexOf(state) === -1) state = 'unavailable';
    var surface = activeSurface || document.querySelector('.mrt-login-surface');
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
      var host = surface.closest('[data-reading-login-component="host"]');
      (host || surface).insertAdjacentElement('afterend', status);
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

  function syncPersonalLibraries(user) {
    var client = window.getSupabaseClient ? window.getSupabaseClient() : null;
    var uid = user && user.id ? String(user.id) : null;
    if (window.WordVault && typeof WordVault.sync === 'function') {
      try { WordVault.sync(client, uid); } catch (error) {}
    }
    if (window.SentenceVault && typeof SentenceVault.sync === 'function') {
      try { SentenceVault.sync(client, uid); } catch (error) {}
    }
  }

  function bindPersonalLibraries() {
    if (!window.SITE_AUTH || typeof SITE_AUTH.onChange !== 'function') return;
    SITE_AUTH.onChange(syncPersonalLibraries);
  }

  function init() {
    var surface = gamePages[filename] ? syncGameSurface() : singleSurface();
    if (!surface) return;
    setState(parkedPages.test(filename) ? 'unavailable' : 'login-required');
    if (gamePages[filename] && landscapeQuery) {
      var onChange = function () { syncGameSurface(); };
      if (landscapeQuery.addEventListener) landscapeQuery.addEventListener('change', onChange);
      else if (landscapeQuery.addListener) landscapeQuery.addListener(onChange);
    }
    authDependencies().then(bindPersonalLibraries).catch(function () { setState('error'); });
  }

  window.MRT_LOGIN_SURFACE = { setState: setState };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})(window, document);
