// 泰語學習資源 Hub Search: reuse the shared SearchEngine with a resource-only pool.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('../../data/search-index.js'), require('../core/search-engine.js'));
  } else {
    root.ResourceHub = factory(root.SEARCH_INDEX, root.SearchEngine);
  }
})(typeof self !== 'undefined' ? self : this, function (SEARCH_INDEX, SearchEngine) {
  'use strict';

  var TYPE_LABELS = {
    article: '泰語學習文章',
    video: '影音學習',
    selfstudy: '自學資源'
  };

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char];
    });
  }

  function resourcePool() {
    return SEARCH_INDEX && Array.isArray(SEARCH_INDEX.RESOURCES) ? SEARCH_INDEX.RESOURCES.slice() : [];
  }

  function search(query, filter) {
    if (!SearchEngine || typeof SearchEngine.search !== 'function') return [];
    var pool = resourcePool().filter(function (entry) {
      return !filter || filter === 'all' || entry.resourceType === filter;
    });
    return SearchEngine.search(query, { pool: pool });
  }

  function resultCard(entry) {
    return '<a class="rh-result-card" href="' + esc(entry.href) + '">' +
      '<span class="rh-type">' + esc(TYPE_LABELS[entry.resourceType] || '') + '</span>' +
      '<h3>' + esc(entry.title) + '</h3>' +
      (entry.desc ? '<p>' + esc(entry.desc) + '</p>' : '') +
      '<span class="rh-card-cta">前往內容 →</span>' +
    '</a>';
  }

  function emptyHTML() {
    return '<div class="rh-empty">目前找不到完全符合的內容，可以換個說法，或直接從三個分類開始：' +
      '<div class="rh-empty-links">' +
        '<a href="/blog.html#articles">泰語學習文章</a>' +
        '<a href="/resources.html#video-learning">影音學習</a>' +
        '<a href="/blog.html#selfstudy">自學資源</a>' +
      '</div></div>';
  }

  function init() {
    if (typeof document === 'undefined') return;
    var input = document.getElementById('resourceSearchInput');
    var button = document.getElementById('resourceSearchBtn');
    var clear = document.getElementById('resourceSearchClear');
    var results = document.getElementById('resourceSearchResults');
    var grid = document.getElementById('resourceSearchGrid');
    var count = document.getElementById('resourceSearchCount');
    var normalHub = document.getElementById('resourceHubNormal');
    var filters = Array.prototype.slice.call(document.querySelectorAll('[data-resource-filter]'));
    var activeFilter = 'all';
    if (!input || !button || !clear || !results || !grid || !normalHub) return;

    function setFilter(next) {
      activeFilter = next;
      filters.forEach(function (item) {
        item.setAttribute('aria-pressed', item.getAttribute('data-resource-filter') === next ? 'true' : 'false');
      });
      if (input.value.trim()) render();
    }

    function render() {
      var query = input.value.trim();
      if (!query) {
        results.classList.remove('is-active');
        normalHub.hidden = false;
        clear.disabled = true;
        grid.innerHTML = '';
        if (count) count.textContent = '';
        return;
      }

      var found = search(query, activeFilter);
      var confident = found.length && found[0].score >= (SearchEngine.CONFIDENCE_THRESHOLD || 1);
      var visible = confident ? found.slice(0, 18) : [];
      normalHub.hidden = true;
      results.classList.add('is-active');
      clear.disabled = false;
      grid.innerHTML = visible.length ? visible.map(function (item) { return resultCard(item.entry); }).join('') : emptyHTML();
      if (count) count.textContent = visible.length ? '找到 ' + visible.length + ' 項內容' : '沒有完全符合的結果';
      if (typeof window !== 'undefined' && typeof window.gtag === 'function') {
        try { window.gtag('event', 'resource_search', { category: 'course', filter: activeFilter, found: visible.length }); } catch (error) {}
      }
    }

    function reset() {
      input.value = '';
      activeFilter = 'all';
      filters.forEach(function (item) {
        item.setAttribute('aria-pressed', item.getAttribute('data-resource-filter') === 'all' ? 'true' : 'false');
      });
      render();
      input.focus();
    }

    filters.forEach(function (item) {
      item.addEventListener('click', function () { setFilter(item.getAttribute('data-resource-filter')); });
    });
    button.addEventListener('click', render);
    clear.addEventListener('click', reset);
    input.addEventListener('keydown', function (event) { if (event.key === 'Enter') render(); });
    input.addEventListener('input', function () { if (!input.value.trim()) render(); });
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
  }

  return { resourcePool: resourcePool, search: search, init: init, TYPE_LABELS: TYPE_LABELS };
});
