// ===================================================================
// 🔍 SEARCH-UI (หน้าแรก) — ต่อกล่องค้นหาบน index.html เข้ากับ SearchEngine
//   ต้องโหลดหลัง data/search-index.js + js/core/search-engine.js เสมอ
// ===================================================================
(function () {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function cardHTML(entry) {
    return '<a class="hs-card" href="' + esc(entry.href) + '">' +
      '<span class="hs-card-title">' + esc(entry.title) + '</span>' +
      (entry.desc ? '<span class="hs-card-desc">' + esc(entry.desc) + '</span>' : '') +
    '</a>';
  }

  function relatedGroupHTML(catKey, label, items) {
    if (!items || !items.length) return '';
    return '<div class="hs-group">' +
      '<div class="hs-group-label">' + esc(label) + '</div>' +
      '<div class="hs-group-links">' +
        items.map(function (e) { return '<a href="' + esc(e.href) + '">' + esc(e.title) + '</a>'; }).join('') +
      '</div>' +
    '</div>';
  }

  function render(query) {
    var out = document.getElementById('homeSearchResults');
    if (!out) return;

    if (!window.SearchEngine || !window.SEARCH_INDEX) {
      out.style.display = 'block';
      out.innerHTML = '<div class="hs-empty">搜尋功能還沒載入完成，重新整理頁面再試一次。</div>';
      return;
    }

    var result = window.SearchEngine.searchSite(query);
    out.style.display = 'block';

    if (typeof gtag === 'function') {
      try { gtag('event', 'site_search', { category: window.GA_CATEGORY || 'unknown', confident: result.confident }); } catch (e) {}
    }

    if (!result.confident) {
      out.innerHTML = '<div class="hs-empty">還沒找到符合的內容 — 換個說法試試，或直接逛逛：' +
        '<div class="hs-empty-links">' +
          '<a href="games.html">🎮 遊戲練習室</a>' +
          '<a href="blog.html">📚 學習文章</a>' +
          '<a href="trial.html">🎯 預約免費體驗課</a>' +
        '</div></div>';
      return;
    }

    var html = '<div class="hs-recommended">' +
      '<div class="hs-section-label">推薦給你</div>' +
      result.recommended.map(cardHTML).join('') +
    '</div>';

    var relatedHTML =
      relatedGroupHTML('practice', '練習', result.related.practice) +
      relatedGroupHTML('content', '學習內容', result.related.content) +
      relatedGroupHTML('course', '課程', result.related.course) +
      relatedGroupHTML('site', '網站使用', result.related.site);

    if (relatedHTML) {
      html += '<div class="hs-related"><div class="hs-section-label">相關內容</div>' + relatedHTML + '</div>';
    }

    out.innerHTML = html;
  }

  function init() {
    var input = document.getElementById('homeSearchInput');
    var btn = document.getElementById('homeSearchBtn');
    if (!input || !btn) return;

    function run() {
      var q = input.value.trim();
      if (!q) return;
      render(q);
    }

    btn.addEventListener('click', run);
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') run(); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
