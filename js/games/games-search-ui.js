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

  // 2026-08-10: ข้อความอ้างอิง "下面 5 款遊戲" ใช้ไม่ได้แล้วหลัง games.html เปลี่ยนเป็น 3 การ์ดหลัก
  // (5 เกมย้ายไปอยู่ใน games-practice.html) — แก้แค่ข้อความอ้างอิงจุดหมายปลายทาง ไม่แตะ logic/behavior ใดๆ
  function renderEmpty(out) {
    out.innerHTML = '<div class="gh-search-empty">還沒抓到你的意思 — 換個說法試試，或直接去下面的「泰語遊戲練習室」選一個開始玩。</div>';
  }

  // isGuess=true → Gemini ไม่มั่นใจ 100% (2026-08-10 รอบ 2) — เปลี่ยน emoji+ข้อความให้รู้ว่าเป็นการเดา
  function entryHTML(entry, isGuess) {
    return '<div class="gh-search-primary">' + (isGuess ? '🤔 不確定，猜你可能是想找：' : '👉 ') + esc(entry.title) + '</div>' +
      '<div class="gh-search-reason">' + esc(entry.desc) + '</div>' +
      '<a class="gh-go" href="' + esc(entry.href) + '">開始玩 →</a>';
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

    if (result.confident) {
      var html = entryHTML(result.primary);
      if (result.secondary) {
        html += '<div class="gh-search-secondary">也可以試試：<a href="' + esc(result.secondary.href) + '">' + esc(result.secondary.title) + '</a></div>';
      }
      out.innerHTML = html;
      return;
    }

    // rule-based ไม่มั่นใจ → ลองถาม Gemini fallback ก่อนค่อยยอมแพ้ (เฉพาะ pool เกม 7 ตัว)
    // ยังไม่ deploy Edge Function ก็ปลอดภัย — geminiFallback คืน null เฉยๆ ตกไปที่ renderEmpty ปกติ
    out.innerHTML = '<div class="gh-search-empty">搜尋中…</div>';
    window.SearchEngine.geminiFallback(query).then(function (result) {
      if (!result || !result.entry || result.entry.category !== 'practice') { renderEmpty(out); return; } // เกมค้นหาเฉพาะเกม ไม่พาไปหน้าอื่น
      if (typeof gtag === 'function') {
        try { gtag('event', 'game_search_gemini_match', { category: 'game', confident: result.confident }); } catch (e) {}
      }
      out.innerHTML = entryHTML(result.entry, !result.confident);
    }).catch(function () { renderEmpty(out); });
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
