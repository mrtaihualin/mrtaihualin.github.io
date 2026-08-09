// ===================================================================
// 🧭 NAV-TEMPLATE — Navigation รวม 1 จุดของทั้งเว็บ (2026-08-09)
//
//   นี่คือ "single source of truth" อันเดียวของเมนู (desktop + dropdown +
//   hamburger + mobile bottom-nav) ทั้งเว็บ 泰華眼裡的泰語教學
//
//   แก้เมนู → แก้ที่ไฟล์นี้ที่เดียว แล้ว:
//     node scripts/generate-nav.js
//   สคริปต์จะ "พิมพ์ทับ" nav block ใน HTML ทุกหน้าที่เกี่ยวข้องให้ตรงกันหมด
//   (หน้าเว็บยังคงเป็น static HTML เหมือนเดิม — เพื่อไม่ให้กระทบ SEO/GEO
//    ตาม decision 2026-07-24 ที่เคยเปลี่ยนจากฉีดด้วย JS ล้วนๆ มาเป็น hardcode)
//
//   ไฟล์นี้ต้องรันได้ทั้ง 2 ที่:
//     1) Node (scripts/generate-nav.js) — ใช้ require()
//     2) เบราว์เซอร์ (window.NAV_TEMPLATE) — เป็น fallback ของ
//        js/core/shared.js เผื่อหน้าไหนลืมใส่ <nav class="site-nav"></nav>
//        ตอนสร้างใหม่ในอนาคต (พฤติกรรมเดิม ไม่เปลี่ยน)
// ===================================================================
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.NAV_TEMPLATE = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ── ข้อมูลเมนู (แก้ตรงนี้ที่เดียว) ────────────────────────────────
  // decision 2026-08-09: เมนูบนสุดเหลือ 3 หัวข้อ + CTA (遊戲/學習資源/關於我/免費試聽)
  // ของเดิม 6 หมวด ถูกยุบเป็น dropdown ย่อยใต้ 學習資源 กับ 關於我ตามที่ Lin เลือก (option 3)
  // ไม่มี URL ไหนถูกย้าย — แค่จัดกลุ่มใหม่ว่าอยู่ dropdown ไหน
  var CTA_LABEL = '免費試聽';
  var CTA_MODAL = 'modal-line-qr';

  var TOP_ITEMS = [
    // 1) 遊戲 — เดิมอยู่ใต้ 資源分享 → 遊戲練習室 ยกขึ้นมาเป็นเมนูหลักตรงตามที่ตกลง
    { type: 'link', label: '遊戲', href: '/games.html' },

    // 2) 學習資源 — รวม 程度測驗 + 了解課程 + (資源分享 ตัด 遊戲練習室 ออกเพราะย้ายขึ้นข้อ 1 แล้ว)
    {
      type: 'dropdown',
      label: '學習資源',
      groups: [
        {
          label: '課程資訊',
          items: [
            { modal: 'modal-quiz', label: '程度測驗' },
            { href: '/index.html#problems', label: '學習困境' },
            { href: '/pricing.html#how', label: '上課方式' },
            { href: '/pricing.html#pricing', label: '費用方案' },
            { href: '/faq.html#faq', label: '常見問題' }
          ],
          dividerAfter: true,
          moreItems: [
            { href: '/faq.html#rules', label: '上課須知' }
          ]
        },
        {
          label: '學習素材',
          items: [
            { href: '/content.html', label: '📚 影片與文章' },
            { href: '/community.html', label: '🇹🇭 泰語學習心聲與提問' }
          ]
        }
      ]
    },

    // 3) 關於我 — รวม 關於老師與學生 + 專業服務 + 聯絡我們 (เดิมเป็นปุ่มเดี่ยวบนสุด ย้ายเข้ามาเป็นรายการท้ายสุด)
    {
      type: 'dropdown',
      label: '關於我',
      groups: [
        {
          label: '老師與學生',
          items: [
            { href: '/index.html#teacher', label: '關於老師' },
            { href: '/pricing.html#testimonials', label: '學生回饋' },
            { href: '/faq.html#feedback-section', label: '分享你的經驗' }
          ]
        },
        {
          label: '專業服務',
          items: [
            { href: '/page-services.html#tour-guide', label: '🗺️ 導遊服務' },
            { href: '/page-services.html#drama', label: '🎬 字幕翻譯' },
            { href: '/page-services.html#interpret', label: '🎙️ 口譯服務' }
          ],
          dividerAfter: true,
          moreItems: [
            { href: '/page-services.html#quote-form', label: '📋 索取報價' }
          ]
        },
        {
          // ไม่มี label กลุ่ม เพราะเป็นรายการเดี่ยว (เดิมเป็นปุ่ม 聯絡我們 แยกอยู่บนสุด)
          items: [],
          dividerAfter: false,
          standaloneModal: { modal: 'modal-contact', label: '聯絡我們' }
        }
      ]
    }
  ];

  // ── mobile bottom-nav (4 ปุ่ม: 首頁/試聽/遊戲/我的) ──────────────
  var BOTTOM_NAV_ITEMS = [
    { icon: '🏠', label: '首頁', href: '/index.html' },
    { icon: '📞', label: '試聽', modal: CTA_MODAL, cta: true },
    { icon: '🎮', label: '遊戲', href: '/games.html' },
    { icon: '👤', label: '我的', href: '/my-progress.html' }
  ];

  // ── ของพิเศษเฉพาะบางหน้า (ไม่เปลี่ยนพฤติกรรมเดิม แค่ทำให้ generate ได้จากจุดเดียว) ──
  //   tone-finder.html มี GA event tracking พิเศษติดอยู่กับ logo/hamburger (ทำไว้ก่อนหน้านี้)
  //   ต้องคง behavior เดิมไว้ ไม่ใช่ตัดทิ้งตอนรวม nav เป็น single source
  var PAGE_OVERRIDES = {
    'tone-finder.html': {
      logoExtra: "try{if(typeof gtag==='function')gtag('event','tone_finder_nav_logo_click',{category:'game'});}catch(e){}",
      hamburgerExtra: "try{if(typeof gtag==='function')gtag('event','tone_finder_nav_menu_toggle',{category:'game'});}catch(e){}"
    }
  };

  // ── ตัว render ให้ HTML string เหมือนกันเป๊ะ ไม่ว่าจะเรียกจาก Node หรือ browser ──
  function esc(s) { return String(s); } // label/href ทั้งหมดเป็น literal ที่ Lin ควบคุมอยู่แล้ว ไม่ใช่ user input

  function renderDropdownGroup(g) {
    var out = '';
    if (g.label) out += '<span class="nav-drop-label">' + esc(g.label) + '</span>';
    (g.items || []).forEach(function (it) {
      out += renderDropLink(it);
    });
    if (g.dividerAfter) out += '<div class="nav-drop-divider"></div>';
    (g.moreItems || []).forEach(function (it) {
      out += renderDropLink(it);
    });
    if (g.standaloneModal) {
      out += '<a href="javascript:void(0)" onclick="openModal(\'' + g.standaloneModal.modal + '\')">' + esc(g.standaloneModal.label) + '</a>';
    }
    return out;
  }

  function renderDropLink(it) {
    if (it.modal) {
      return '<a href="javascript:void(0)" onclick="openModal(\'' + it.modal + '\')">' + esc(it.label) + '</a>';
    }
    return '<a href="' + it.href + '">' + esc(it.label) + '</a>';
  }

  function renderTopItem(item) {
    if (item.type === 'link') {
      return '<li><a href="' + item.href + '">' + esc(item.label) + '</a></li>';
    }
    if (item.type === 'modal') {
      return '<li><a href="javascript:void(0)" onclick="openModal(\'' + item.modal + '\')">' + esc(item.label) + '</a></li>';
    }
    // dropdown
    var inner = (item.groups || []).map(renderDropdownGroup).join('');
    return '<li><a href="javascript:void(0)" class="has-drop">' + esc(item.label) + '</a><div class="nav-drop">' + inner + '</div></li>';
  }

  // pageFile = ชื่อไฟล์ HTML เช่น 'tone-finder.html' หรือ path เต็ม — ใช้แค่หา override
  function pageKeyFrom(pageFile) {
    if (!pageFile) return '';
    var parts = String(pageFile).split('/');
    return parts[parts.length - 1];
  }

  function renderNavHTML(pageFile) {
    var key = pageKeyFrom(pageFile);
    var ov = PAGE_OVERRIDES[key] || {};
    var logoOnclick = (ov.logoExtra || '') + 'goHome()';
    var hamburgerOnclick = (ov.hamburgerExtra || '') + 'toggleMenu()';

    var html = '';
    html += '<div class="nav-logo" onclick="' + logoOnclick + '">' +
              '<span class="logo-accent">泰華</span>' +
              '<span class="logo-dim">眼裡的</span>' +
              '<span class="logo-main">泰語教學</span>' +
            '</div>';
    html += '<ul class="nav-links">';
    TOP_ITEMS.forEach(function (item) { html += renderTopItem(item); });
    html += '<li><a href="javascript:void(0)" onclick="openModal(\'' + CTA_MODAL + '\')" class="nav-cta">' + esc(CTA_LABEL) + '</a></li>';
    html += '</ul>';
    html += '<button class="nav-mobile-cta" onclick="openModal(\'' + CTA_MODAL + '\')">' + esc(CTA_LABEL) + '</button>';
    html += '<div class="hamburger" onclick="' + hamburgerOnclick + '"><span></span><span></span><span></span></div>';
    return html;
  }

  function renderBottomNavHTML() {
    return BOTTOM_NAV_ITEMS.map(function (it) {
      var cls = 'bn-item' + (it.cta ? ' bn-cta' : '');
      var open = it.modal
        ? '<a href="javascript:void(0)" onclick="openModal(\'' + it.modal + '\')" class="' + cls + '">'
        : '<a href="' + it.href + '" class="' + cls + '">';
      return open +
        '<span class="bn-icon">' + it.icon + '</span>' +
        '<span class="bn-label">' + esc(it.label) + '</span>' +
      '</a>';
    }).join('');
  }

  return {
    CTA_LABEL: CTA_LABEL,
    CTA_MODAL: CTA_MODAL,
    TOP_ITEMS: TOP_ITEMS,
    BOTTOM_NAV_ITEMS: BOTTOM_NAV_ITEMS,
    PAGE_OVERRIDES: PAGE_OVERRIDES,
    renderNavHTML: renderNavHTML,
    renderBottomNavHTML: renderBottomNavHTML
  };
});
