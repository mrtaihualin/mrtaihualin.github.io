// word-menu.js — shared inline learning-tool binder
// Keeps each game-owned control, id and handler in its existing content toolbar.
(function () {
  'use strict';

  function init(cfg) {
    if (!cfg || !cfg.rowId || !cfg.items) return;
    var row = document.getElementById(cfg.rowId);
    if (!row || row.getAttribute('data-wm-done') === '1') return;

    row.classList.add('gsh-learning-tools');
    row.setAttribute('role', 'toolbar');
    row.setAttribute('aria-label', '學習工具');

    var inlineItems = [];
    cfg.items.forEach(function (item) {
      var control = document.getElementById(item.id);
      if (!control) return;
      control.classList.add('gsh-learning-tool');
      control.setAttribute('data-tool-label', item.label);
      inlineItems.push({ element: control, label: item.label });
    });

    function refreshInline() {
      inlineItems.forEach(function (item) {
        var control = item.element;
        var button = control.tagName === 'BUTTON' ? control : control.querySelector('button');
        if (!button) return;
        if (!button.getAttribute('aria-label')) button.setAttribute('aria-label', item.label);
        if (!button.getAttribute('title')) button.setAttribute('title', item.label);
      });
    }

    try {
      var observer = new MutationObserver(refreshInline);
      inlineItems.forEach(function (item) {
        observer.observe(item.element, { childList: true, subtree: true });
      });
    } catch (e) {}

    refreshInline();
    setTimeout(refreshInline, 300);
    setTimeout(refreshInline, 1200);
    row.setAttribute('data-wm-done', '1');
    window.WordMenu.refresh = refreshInline;
  }

  window.WordMenu = { init: init, refresh: function () {} };
})();
