(function (window, document) {
  'use strict';

  var api = window.GameTutorialLifecycle = window.GameTutorialLifecycle || {};

  function storageHas(key) {
    try { return !!window.localStorage.getItem(key); } catch (ignore) { return false; }
  }

  function storageMark(key) {
    try { window.localStorage.setItem(key, '1'); } catch (ignore) {}
  }

  function isVisible(node) {
    if (!node || node.hidden) return false;
    var style = window.getComputedStyle ? window.getComputedStyle(node) : null;
    if (style && (style.display === 'none' || style.visibility === 'hidden')) return false;
    return !node.getClientRects || node.getClientRects().length > 0;
  }

  api.schedule = function (options) {
    options = options || {};
    var delay = typeof options.delay === 'number' ? options.delay : 500;
    var selectors = options.blockers || [];
    var timer = null;
    var stopped = false;
    var observer = null;

    function clearPendingStart() {
      if (timer !== null) {
        window.clearTimeout(timer);
        timer = null;
      }
    }

    function blocked() {
      return selectors.some(function (selector) {
        return isVisible(document.querySelector(selector));
      });
    }

    function cancel() {
      if (stopped) return;
      stopped = true;
      clearPendingStart();
      if (observer) observer.disconnect();
      window.removeEventListener('pagehide', cancel);
      document.removeEventListener('DOMContentLoaded', check);
      window.removeEventListener('load', check);
    }

    function startIfStillSafe() {
      timer = null;
      if (stopped || storageHas(options.seenKey) || blocked() || !options.ready()) {
        check();
        return;
      }
      cancel();
      storageMark(options.seenKey);
      options.start();
    }

    function check() {
      if (stopped) return;
      if (storageHas(options.seenKey)) {
        cancel();
        return;
      }
      if (blocked() || !options.ready()) {
        clearPendingStart();
        return;
      }
      if (timer === null) timer = window.setTimeout(startIfStillSafe, delay);
    }

    if (typeof options.ready !== 'function' || typeof options.start !== 'function') {
      throw new TypeError('GameTutorialLifecycle.schedule requires ready and start callbacks');
    }
    if (window.MutationObserver) {
      observer = new window.MutationObserver(check);
      observer.observe(document.documentElement, {
        subtree: true,
        childList: true,
        attributes: true,
        characterData: true
      });
    }
    document.addEventListener('DOMContentLoaded', check);
    window.addEventListener('load', check);
    window.addEventListener('pagehide', cancel);
    check();

    return { check: check, cancel: cancel };
  };
})(window, document);
