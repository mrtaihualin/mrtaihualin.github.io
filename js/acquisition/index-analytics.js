// js/acquisition/index-analytics.js
// แยกออกมาจาก inline <script> ท้าย index.html (2026-08-08 — P5-A refactor, อนุมัติแล้ว)
// เนื้อหา: GA4 custom event tracking เฉพาะหน้า index (scroll depth / คลิกลิงก์เกม-ราคา / time on page)
// ต้องอยู่ตำแหน่งเดิม (หลัง shared.min.js, ท้ายสุดของ <body>) เพราะ querySelectorAll ทำงาน
// ทันทีตอน parse โดยไม่มี DOMContentLoaded wrapper — ต้องรอให้ DOM ทั้งหน้าถูก parse มาก่อนแล้ว

// ── GA4 Event Tracking: index.html ──────────────────────────────────

// [1] Scroll depth (25 / 50 / 75 / 90%)
(function() {
  var fired = {};
  window.addEventListener('scroll', function() {
    var h = document.body.scrollHeight - window.innerHeight;
    if (h <= 0) return;
    var pct = Math.round((window.scrollY / h) * 100);
    [25, 50, 75, 90].forEach(function(m) {
      if (pct >= m && !fired[m]) {
        fired[m] = true;
        gtag('event','scroll_depth',{category:'course', depth_percent: m, page: 'index' });
      }
    });
  }, { passive: true });
})();

// [2] ปุ่มจองทดลองเรียน — ย้ายไปรวมศูนย์ที่ shared.js (openModal) แล้ว เพื่อให้นับครบทุกหน้า

// [3] คลิกลิงก์ไปหน้าเกม tone-finder
document.querySelectorAll('a[href="games.html"]').forEach(function(el) {
  el.addEventListener('click', function() {
    gtag('event','game_link_click',{category:'course', source_page: 'index' });
  });
});

// [4] คลิกลิงก์ไปหน้าราคา page2
document.querySelectorAll('a[href="pricing.html"], a[href*="page2"]').forEach(function(el) {
  el.addEventListener('click', function() {
    gtag('event','pricing_page_click',{category:'course', source_page: 'index' });
  });
});

// [5] Time on page (60s / 180s / 300s)
(function() {
  var t = 0;
  var iv = setInterval(function() {
    t += 30;
    if (t === 60 || t === 180 || t === 300) {
      gtag('event','time_on_page',{category:'course', seconds: t, page: 'index' });
    }
    if (t >= 300) clearInterval(iv);
  }, 30000);
})();
// ────────────────────────────────────────────────────────────────────
