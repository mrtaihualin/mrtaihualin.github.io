// ===================================================================
// 🔍 GAMES-SEARCH-UI (games.html) — กล่องค้นหาเฉพาะเกม ต่อกับ SearchEngine.searchGamesOnly
//   ต้องโหลดหลัง data/search-index.js + js/core/search-engine.js เสมอ
// ===================================================================
(function () {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function render(query) {
    var out = document.getElementById('gameSearchResult');
    if (!out) return;

    if (!window.SearchEngine || !window.SEARCH_INDEX) {
      out.style.display = 'block';
      out.innerHTML = '<div class="gh-search-empty">搜尋功能還沒載入完成，重新整理頁面再試一次。</div>';
      return;
    }

    var result = window.SearchEngine.searchGamesOnly(query);
    out.style.display = 'block';

    if (typeof gtag === 'function') {
      try { gtag('event', 'game_search', { category: 'game', confident: result.confident }); } catch (e) {}
    }

    if (!result.confident) {
      out.innerHTML = '<div class="gh-search-empty">還沒抓到你的意思 — 換個說法試試，或直接從下面 5 款遊戲挑一個開始玩。</div>';
      return;
    }

    var html = '<div class="gh-search-primary">👉 ' + esc(result.primary.title) + '</div>' +
      '<div class="gh-search-reason">' + esc(result.primary.desc) + '</div>' +
      '<a class="gh-go" href="' + esc(result.primary.href) + '">開始玩 →</a>';

    if (result.secondary) {
      html += '<div class="gh-search-secondary">也可以試試：<a href="' + esc(result.secondary.href) + '">' + esc(result.secondary.title) + '</a></div>';
    }

    out.innerHTML = html;
  }

  function init() {
    var input = document.getElementById('gameSearchInput');
    var btn = document.getElementById('gameSearchBtn');
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
