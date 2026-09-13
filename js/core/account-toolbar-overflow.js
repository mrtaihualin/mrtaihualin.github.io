// Shared account-toolbar progressive overflow.
// Presentation only: moves the existing action nodes without cloning or changing handlers.
(function (window, document) {
  'use strict';

  var OVERFLOW_ORDER = ['logout', 'help', 'search', 'vault', 'leaderboard', 'edit', 'progress', 'streak'];

  function injectStyles() {
    if (document.getElementById('mrt-account-toolbar-overflow-style')) return;
    var style = document.createElement('style');
    style.id = 'mrt-account-toolbar-overflow-style';
    style.textContent = [
      'html body [data-reading-login-component="host"]{width:min(100%,1120px);}',
      '[data-reading-login-component="row"]{max-width:1080px;}',
      'html body [data-reading-login-component="row"]>#rg-profile-wrap{flex-wrap:nowrap!important;overflow:visible!important;max-width:1080px!important;}',
      '[data-reading-login-component="row"] #rg-login-slot{flex:1 1 auto!important;width:100%!important;max-width:100%!important;min-width:0!important;}',
      '[data-reading-login-component="row"] #rg-login-slot>[id^="sa-badge-"]{width:100%;max-width:100%;min-width:0;}',
      '[data-reading-login-component="row"] .sa-account-bar{position:relative;display:flex!important;align-items:center!important;justify-content:center!important;flex-wrap:nowrap!important;width:100%!important;max-width:100%!important;min-width:0!important;overflow:visible;}',
      '[data-reading-login-component="row"] .sa-account-bar>.sa-avatar,[data-reading-login-component="row"] .sa-account-bar>.sa-badge-pin,[data-reading-login-component="row"] .sa-account-bar>.sa-account-action,[data-reading-login-component="row"] .sa-account-bar>.sa-account-streak,[data-reading-login-component="row"] .sa-account-bar>.sa-global-search-toggle,[data-reading-login-component="row"] .sa-account-bar>.mrt-login-howto,[data-reading-login-component="row"] .sa-account-bar>.sa-more-toggle{flex:0 0 auto;white-space:nowrap;}',
      '[data-reading-login-component="row"] .sa-account-bar>.sa-nick{flex:0 1 auto;min-width:0;white-space:nowrap;}',
      '[data-reading-login-component="row"] .sa-account-bar>.mrt-login-howto{margin-left:3px;}',
      '[data-reading-login-component="row"] .sa-more-toggle{display:inline-flex;align-items:center;justify-content:center;min-height:31px;margin:0;padding:5px 11px;border:1px solid rgba(200,151,58,.58);border-radius:999px;background:#fff;color:#6A531E;font:800 12.5px/1.15 "Noto Sans TC",sans-serif;white-space:nowrap;cursor:pointer;}',
      '[data-reading-login-component="row"] .sa-more-toggle[hidden],[data-reading-login-component="row"] .sa-more-menu[hidden]{display:none!important;}',
      '[data-reading-login-component="row"] .sa-more-toggle:hover,[data-reading-login-component="row"] .sa-more-toggle:focus-visible{background:#F7E8C6;}',
      '[data-reading-login-component="row"] .sa-more-toggle:focus-visible,[data-reading-login-component="row"] .sa-more-menu .sa-overflow-item:focus-visible{outline:2px solid #C8973A;outline-offset:2px;}',
      '[data-reading-login-component="row"] .sa-more-menu{position:absolute;z-index:10020;top:calc(100% + 8px);right:0;width:max-content;min-width:190px;max-width:min(280px,calc(100vw - 32px));padding:7px;border:1.5px solid rgba(200,151,58,.62);border-radius:14px;background:#fffdf8;box-shadow:0 10px 28px rgba(92,68,16,.2);}',
      '[data-reading-login-component="row"] .sa-more-menu .sa-overflow-item{display:flex!important;align-items:center!important;justify-content:flex-start!important;width:100%!important;min-height:40px!important;margin:0!important;padding:8px 11px!important;border:0!important;border-radius:9px!important;background:transparent!important;color:#5C4410!important;box-shadow:none!important;font:700 13.5px/1.35 "Noto Sans TC",sans-serif!important;text-align:left;text-decoration:none!important;white-space:nowrap!important;cursor:pointer;}',
      '[data-reading-login-component="row"] .sa-more-menu .sa-overflow-item:hover,[data-reading-login-component="row"] .sa-more-menu .sa-overflow-item:focus-visible{background:#F7E8C6!important;}',
      '[data-reading-login-component="row"] .sa-more-menu .sa-account-streak{cursor:default!important;}',
      '[data-reading-login-component="row"] .sa-more-menu .sa-edit::after{content:"編輯";}',
      '[data-reading-login-component="row"] .sa-more-menu a[title="排行榜"]::after{content:"排行";}',
      '[data-reading-login-component="row"] .sa-more-menu a[title="進度"]::after{content:"進度";}',
      '[data-reading-login-component="row"] .sa-more-menu a[title="字庫"]::after{content:"字庫";}',
      '[data-reading-login-component="row"] .sa-more-menu .sa-global-search-toggle::after{content:"搜尋";}',
      '[data-reading-login-component="row"] .sa-global-search-form{position:absolute;z-index:10010;top:calc(100% + 8px);left:0;right:0;width:min(420px,100%)!important;margin:0 auto!important;padding:8px;border:1.5px solid rgba(200,151,58,.62);border-radius:12px;background:#fffdf8;box-shadow:0 10px 28px rgba(92,68,16,.18);}',
      '[data-reading-login-component="row"] .sa-global-search-results{position:absolute;z-index:10011;top:calc(100% + 64px);left:0;right:0;width:min(520px,100%)!important;margin:0 auto!important;max-height:min(52vh,420px);overflow:auto;}',
      '[data-reading-login-component="row"] .sa-overflow-pin-hidden{display:none!important;}'
    ].join('');
    document.head.appendChild(style);
  }

  function chooseOverflow(order, fits) {
    var moved = [];
    if (fits(moved)) return moved;
    for (var i = 0; i < order.length; i += 1) {
      moved.push(order[i]);
      if (fits(moved)) return moved.slice();
    }
    return moved;
  }

  function syntheticPlan(available, fixed, widths, moreWidth, gap) {
    widths = widths || {};
    return chooseOverflow(OVERFLOW_ORDER, function (moved) {
      var visible = OVERFLOW_ORDER.filter(function (id) { return moved.indexOf(id) === -1; });
      var used = Number(fixed || 0) + (moved.length ? Number(moreWidth || 0) : 0);
      visible.forEach(function (id) { used += Number(widths[id] || 0); });
      var itemCount = visible.length + 1 + (moved.length ? 1 : 0);
      used += Math.max(0, itemCount - 1) * Number(gap || 0);
      return used <= available;
    });
  }

  function setup(badge, options) {
    options = options || {};
    if (!badge || !badge.querySelector) return null;
    if (badge.__mrtAccountOverflow) badge.__mrtAccountOverflow.destroy();
    injectStyles();

    var bar = badge.querySelector('.sa-account-bar');
    if (!bar) return null;
    var surface = bar.closest ? bar.closest('#rg-profile-wrap,.mrt-login-surface') : null;
    var help = surface && surface.querySelector ? surface.querySelector('.mrt-login-howto') : null;
    if (help && bar.contains(help)) help = null;
    var helpHomeMarker = null;
    if (help && help.parentNode) {
      helpHomeMarker = document.createComment('mrt-account-help-home');
      help.parentNode.insertBefore(helpHomeMarker, help);
      bar.appendChild(help);
    }
    var pin = bar.querySelector('.sa-badge-pin');
    var nodes = {
      edit: bar.querySelector('.sa-edit'),
      leaderboard: bar.querySelector('.sa-leaderboard-link'),
      streak: bar.querySelector('.sa-account-streak'),
      progress: bar.querySelector('.sa-progress-link'),
      vault: bar.querySelector('.sa-vault-link'),
      logout: bar.querySelector('.sa-logout'),
      search: bar.querySelector('.sa-global-search-toggle'),
      help: help
    };
    var records = [];
    var original = [];
    Object.keys(nodes).forEach(function (id) {
      var node = nodes[id];
      if (!node || !node.parentNode) return;
      var marker = document.createComment('mrt-account-' + id);
      node.parentNode.insertBefore(marker, node);
      records.push({
        id: id,
        node: node,
        marker: marker,
        role: node.getAttribute('role'),
        tabindex: node.getAttribute('tabindex'),
        ariaDisabled: node.getAttribute('aria-disabled')
      });
      original.push(id);
    });

    var menuId = (badge.id || 'sa-account') + '-more-menu';
    var more = document.createElement('button');
    more.type = 'button';
    more.className = 'sa-more-toggle';
    more.textContent = '＋ 更多';
    more.setAttribute('aria-haspopup', 'menu');
    more.setAttribute('aria-expanded', 'false');
    more.setAttribute('aria-controls', menuId);
    more.setAttribute('aria-label', '更多帳號操作');
    more.hidden = true;
    var menu = document.createElement('div');
    menu.id = menuId;
    menu.className = 'sa-more-menu';
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', '更多帳號操作');
    menu.hidden = true;
    bar.appendChild(more);
    bar.appendChild(menu);

    var destroyed = false;
    var fitting = false;
    var frame = 0;
    var observer = null;

    function recordFor(id) {
      for (var i = 0; i < records.length; i += 1) if (records[i].id === id) return records[i];
      return null;
    }

    function restoreRecord(record) {
      if (!record || !record.marker.parentNode) return;
      record.marker.parentNode.insertBefore(record.node, record.marker.nextSibling);
      record.node.classList.remove('sa-overflow-item');
      if (record.role === null) record.node.removeAttribute('role'); else record.node.setAttribute('role', record.role);
      if (record.tabindex === null) record.node.removeAttribute('tabindex'); else record.node.setAttribute('tabindex', record.tabindex);
      if (record.ariaDisabled === null) record.node.removeAttribute('aria-disabled'); else record.node.setAttribute('aria-disabled', record.ariaDisabled);
    }

    function moveRecord(record) {
      if (!record) return;
      menu.appendChild(record.node);
      record.node.classList.add('sa-overflow-item');
      record.node.setAttribute('role', 'menuitem');
      record.node.setAttribute('tabindex', '-1');
      if (record.id === 'streak') record.node.setAttribute('aria-disabled', 'true');
    }

    function applyMoved(ids) {
      records.forEach(restoreRecord);
      more.hidden = ids.length === 0;
      ids.forEach(function (id) { moveRecord(recordFor(id)); });
      original.forEach(function (id) {
        var record = recordFor(id);
        if (record && record.node.parentNode === menu) menu.appendChild(record.node);
      });
    }

    function fits() {
      return bar.scrollWidth <= bar.clientWidth + 1;
    }

    function close(returnFocus) {
      if (menu.hidden) return;
      menu.hidden = true;
      more.setAttribute('aria-expanded', 'false');
      if (returnFocus !== false && menu.contains(document.activeElement)) more.focus();
    }

    function open(focusLast) {
      if (more.hidden) return;
      if (typeof options.closeSearch === 'function') options.closeSearch();
      menu.hidden = false;
      more.setAttribute('aria-expanded', 'true');
      var items = menu.querySelectorAll('[role="menuitem"]');
      if (items.length) items[focusLast ? items.length - 1 : 0].focus();
    }

    function fit() {
      if (destroyed || fitting || !bar.isConnected) return;
      fitting = true;
      close(false);
      if (pin) pin.classList.remove('sa-overflow-pin-hidden');
      var active = document.activeElement;
      var moved = chooseOverflow(OVERFLOW_ORDER.filter(function (id) { return !!recordFor(id); }), function (ids) {
        applyMoved(ids);
        return fits();
      });
      applyMoved(moved);
      if (!fits() && pin) pin.classList.add('sa-overflow-pin-hidden');
      if (surface) surface.setAttribute('data-account-overflow-count', String(moved.length));
      if (active === more && more.hidden) {
        var fallback = bar.querySelector('.sa-nick');
        if (fallback) fallback.focus();
      } else if (active && menu.contains(active)) {
        more.focus();
      } else if (active && active.isConnected && typeof active.focus === 'function') {
        active.focus();
      }
      fitting = false;
    }

    function schedule() {
      if (destroyed || frame) return;
      var raf = window.requestAnimationFrame || function (callback) { return window.setTimeout(callback, 0); };
      frame = raf(function () { frame = 0; fit(); });
    }

    function menuItems() {
      return Array.prototype.slice.call(menu.querySelectorAll('[role="menuitem"]'));
    }

    function onMoreKey(event) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        open(event.key === 'ArrowUp');
      }
    }

    function onMenuKey(event) {
      var items = menuItems();
      var index = items.indexOf(document.activeElement);
      if (event.key === 'Escape') {
        event.preventDefault();
        close(true);
      } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        if (!items.length) return;
        index = index < 0 ? 0 : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
        items[index].focus();
      } else if (event.key === 'Home' || event.key === 'End') {
        event.preventDefault();
        if (items.length) items[event.key === 'Home' ? 0 : items.length - 1].focus();
      } else if (event.key === 'Tab') {
        close(false);
      }
    }

    function onDocumentPointer(event) {
      if (!menu.hidden && !bar.contains(event.target)) close(false);
    }

    function onMenuClick(event) {
      var action = event.target.closest ? event.target.closest('.sa-overflow-item') : null;
      if (action && !action.classList.contains('sa-account-streak')) close(false);
    }

    more.addEventListener('click', function () { if (menu.hidden) open(false); else close(true); });
    more.addEventListener('keydown', onMoreKey);
    menu.addEventListener('keydown', onMenuKey);
    menu.addEventListener('click', onMenuClick);
    document.addEventListener('pointerdown', onDocumentPointer, true);
    window.addEventListener('resize', schedule);
    if (window.ResizeObserver) {
      observer = new window.ResizeObserver(schedule);
      observer.observe(surface || bar);
    }
    if (document.fonts && document.fonts.ready && typeof document.fonts.ready.then === 'function') {
      document.fonts.ready.then(schedule).catch(function () {});
    }

    var controller = {
      fit: fit,
      schedule: schedule,
      close: close,
      destroy: function () {
        if (destroyed) return;
        destroyed = true;
        close(false);
        if (observer) observer.disconnect();
        window.removeEventListener('resize', schedule);
        document.removeEventListener('pointerdown', onDocumentPointer, true);
        records.forEach(function (record) {
          restoreRecord(record);
          if (record.marker.parentNode) record.marker.parentNode.removeChild(record.marker);
        });
        if (help && helpHomeMarker && helpHomeMarker.parentNode) {
          helpHomeMarker.parentNode.insertBefore(help, helpHomeMarker.nextSibling);
          helpHomeMarker.parentNode.removeChild(helpHomeMarker);
        }
        if (pin) pin.classList.remove('sa-overflow-pin-hidden');
        if (more.parentNode) more.parentNode.removeChild(more);
        if (menu.parentNode) menu.parentNode.removeChild(menu);
        if (surface) surface.removeAttribute('data-account-overflow-count');
        if (badge.__mrtAccountOverflow === controller) badge.__mrtAccountOverflow = null;
      }
    };
    badge.__mrtAccountOverflow = controller;
    schedule();
    return controller;
  }

  injectStyles();
  window.AccountToolbarOverflow = {
    setup: setup,
    __test: {
      order: OVERFLOW_ORDER.slice(),
      chooseOverflow: chooseOverflow,
      syntheticPlan: syntheticPlan
    }
  };
})(window, document);
