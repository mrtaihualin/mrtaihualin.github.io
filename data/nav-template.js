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
  // Latest Lin decision 2026-08-14: ทางเข้า Learning Center ใช้ชื่อ 學習.
  // Account/Profile remains separate from this destination.
  // ของเดิม 6 หมวด ถูกยุบเป็น dropdown ย่อยใต้ 學習資源 กับ 關於我ตามที่ Lin เลือก (option 3)
  // ไม่มี URL ไหนถูกย้าย — แค่จัดกลุ่มใหม่ว่าอยู่ dropdown ไหน
  var CTA_LABEL = '免費試聽';
  var CTA_MODAL = 'modal-line-qr';

  var TOP_ITEMS = [
    // 1) 🎮 遊戲 — decision 2026-08-10: ต้องเด่นกว่าลิงก์ธรรมดา เป็น secondary CTA
    //    (ปุ่มกรอบทอง คนละแบบกับ 免費試聽 ที่เป็นปุ่มทึบทอง primary CTA)
    { type: 'link', label: '🎮 遊戲', href: '/games.html', className: 'nav-cta-secondary' },

    // 2) 學習 → ปลายทางชื่อ 學習中心
    { type: 'link', label: '學習', href: '/my-progress.html' },

    // 3) 學習資源 — decision อัปเดต 2026-08-09 (รอบ 2): เหลือแค่ 4 รายการ
    //    ของฝั่งคอร์ส (上課方式/費用方案/常見問題/上課須知) ถอดออกจาก dropdown นี้แล้ว
    //    ตามที่ Lin สั่ง — ยังเข้าถึงได้ปกติผ่านหน้า pricing.html/faq.html เอง
    //    (URL เดิมไม่ได้ย้าย แค่ไม่มีลิงก์ตรงจาก dropdown อีกต่อไป)
    {
      type: 'dropdown',
      label: '學習資源',
      groups: [
        {
          // ไม่มี sub-label เพราะเหลือแค่ 4 รายการ ไม่จำเป็นต้องแบ่งกลุ่มย่อยอีก
          items: [
            { modal: 'modal-quiz', label: '程度測驗' },
            { href: '/index.html#problems', label: '學習困境' },
            { href: '/content.html', label: '📚 影片與文章' },
            { href: '/community.html', label: '🇹🇭 泰語學習心聲與提問' }
          ]
        }
      ]
    },

    // 4) 更多 ▾ — decision 2026-08-10: เดิมชื่อ 關於我 เปลี่ยนชื่อ+จัดกลุ่มใหม่ 3 กลุ่ม
    //    (課程與老師 / 常見資訊 / 其他服務) + 聯絡我們 หลัง divider — ใช้ href เดิมที่มีอยู่จริงทั้งหมด
    //    ไม่มี URL ไหนถูกย้าย แค่จัดกลุ่ม/ชื่อป้ายใหม่
    {
      type: 'dropdown',
      label: '更多',
      groups: [
        {
          label: '課程與老師',
          items: [
            { href: '/index.html#teacher', label: '關於老師' },
            { href: '/pricing.html#testimonials', label: '學生回饋' },
            { href: '/pricing.html#pricing', label: '費用方案' },
            { href: '/pricing.html#how', label: '上課方式' }
          ]
        },
        {
          label: '常見資訊',
          items: [
            { href: '/faq.html#faq', label: 'FAQ' },
            { href: '/faq.html#rules', label: '上課須知' },
            { href: '/faq.html#feedback-section', label: '分享經驗' }
          ]
        },
        {
          label: '其他服務',
          items: [
            { href: '/page-services.html#tour-guide', label: '🗺️ 導遊' },
            { href: '/page-services.html#drama', label: '🎬 字幕翻譯' },
            { href: '/page-services.html#interpret', label: '🎙️ 口譯' },
            { href: '/page-services.html#quote-form', label: '📋 報價' }
          ],
          dividerAfter: true
        },
        {
          // ไม่มี label กลุ่ม เพราะเป็นรายการเดี่ยวหลัง divider (聯絡我們)
          items: [],
          standaloneModal: { modal: 'modal-contact', label: '聯絡我們' }
        }
      ]
    }
  ];

  // ── 📢 แถบประกาศหมุนเวียนด้านบน (.avail-band) ────────────────────
  //   ย้ายมาจาก js/core/shared.js เมื่อ 2026-08-10 (Lin อนุมัติ)
  //   เหตุผล: แถบนี้ต้องถูกเขียนลง HTML แบบ static เหมือนเมนู เพื่อไม่ให้เนื้อหาหน้าเลื่อนตอน JS โหลดเสร็จ
  //   (เดิม JS แทรกแถบเข้าบนสุดของ body ทีหลัง → ทั้งหน้าถูกดันลง = ตาเห็นเป็น "หน้ากระพริบ" ทุกครั้งที่เปลี่ยนหน้า)
  //   ✏️ เพิ่ม/แก้/ลบประกาศได้ที่นี่ที่เดียว แล้วรัน `node scripts/generate-nav.js` มีผลทุกหน้า
  //   emoji+text = ข้อความ | cta = ป้ายปุ่ม | href = ลิงก์ หรือ modal = id โมดัล
  var ANN = [
    { emoji: '🎁', text: '首堂 30 分鐘體驗課免費・中文授課', cta: '立即預約', modal: 'modal-line-qr' },
    { emoji: '🎮', text: '5 款免費泰語遊戲上線！聲調・拼讀・打字・造句・語序，每款都有排行榜可以比賽', cta: '前往遊戲', href: 'games.html' },
    { emoji: '🎵', text: '用歌曲學泰語！精選泰文歌曲逐句拆解歌詞，邊聽邊學發音', cta: '去聽歌學泰語', href: 'resources.html#songs' },
    { emoji: '📖', text: '免費泰語學習文章上線！生活情境單字、聲調技巧，隨看隨學', cta: '去讀文章', href: 'blog.html#sharing' },
    { emoji: '📺', text: 'YouTube 播放清單整理好了！依主題分類，找教學影片更方便', cta: '去看播放清單', href: 'resources.html#playlists' }
    // ปิดชั่วคราว ยังไม่เปิดใช้ — { emoji:'✍️', text:'全新「泰語拼讀練習室」上線！分組練習拼讀規則，讀對每個音節', cta:'前往練習', href:'reading-game.html' },
    // LIN 2026-07-03: ลบสไลด์ "造句練習室即將推出" ออกแล้ว (เกมเลโก้ออกจริงแล้ว ไม่ใช่ coming-soon อีกต่อไป)
    // LIN 2026-07-03 (รอบ 4): เพิ่ม 3 สไลด์ประกาศ — เพลง/บทความ/เพลลิสต์ยูทูป ตามที่ Lin สั่ง
  ];

  // ── mobile bottom-nav (4 ปุ่ม: 首頁/試聽/遊戲/學習) ──────────────
  var BOTTOM_NAV_ITEMS = [
    { icon: '🏠', label: '首頁', href: '/index.html' },
    { icon: '📞', label: '試聽', modal: CTA_MODAL, cta: true },
    { icon: '🎮', label: '遊戲', href: '/games.html' },
    { icon: '📚', label: '學習', href: '/my-progress.html' }
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
      var cls = item.className ? ' class="' + item.className + '"' : '';
      return '<li><a href="' + item.href + '"' + cls + '>' + esc(item.label) + '</a></li>';
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

  // ── ตัว render แถบประกาศ ────────────────────────────────────────
  var ANN_MARK_START = '<!--ANN-BAND:START-->';
  var ANN_MARK_END = '<!--ANN-BAND:END-->';

  //   ⚠️ ผลลัพธ์ต้องเหมือนกับที่ annRender(i) ใน js/core/shared.js สร้างทุกอักขระ
  //      เพราะ JS จะเขียนทับ innerHTML ก้อนเดียวกันนี้ตอนหมุนสไลด์ — ถ้าไม่ตรงจะเห็นกระตุกตอนสไลด์แรกเปลี่ยน
  function renderAnnRowHTML(i) {
    var a = ANN[i];
    var cta = '';
    if (a.modal) {
      cta = '<button class="avail-cta" onclick="openModal(\'' + a.modal + '\')">' + esc(a.cta) + '</button>';
    } else if (a.href) {
      var tgt = a.href.indexOf('http') === 0 ? ' target="_blank" rel="noopener"' : '';
      cta = '<a class="avail-cta" href="' + a.href + '"' + tgt + '>' + esc(a.cta) + '</a>';
    }
    var dots = ANN.map(function (_, j) {
      return '<span onclick="annGoTo(' + j + ')" style="width:7px;height:7px;border-radius:50%;cursor:pointer;background:' + (j === i ? 'var(--gold)' : 'rgba(139,99,16,0.30)') + ';transition:background 0.2s;"></span>';
    }).join('');
    return '<div class="avail-row">' +
             '<span class="avail-dot"></span>' +
             '<span class="avail-text">' + a.emoji + ' ' + esc(a.text) + '</span>' +
             cta +
           '</div>' +
           (ANN.length > 1 ? '<div style="display:flex;justify-content:center;align-items:center;gap:10px;margin-top:4px;">' +
               '<button onclick="annPrev()" aria-label="上一則公告" style="background:none;border:none;color:var(--gold-deep);font-size:15px;line-height:1;cursor:pointer;padding:2px 4px;min-width:32px;min-height:32px;display:inline-flex;align-items:center;justify-content:center;">‹</button>' +
               '<div style="display:flex;align-items:center;gap:6px;">' + dots + '</div>' +
               '<button onclick="annNext()" aria-label="下一則公告" style="background:none;border:none;color:var(--gold-deep);font-size:15px;line-height:1;cursor:pointer;padding:2px 4px;min-width:32px;min-height:32px;display:inline-flex;align-items:center;justify-content:center;">›</button>' +
             '</div>' : '') +
           '<button onclick="annDismiss()" aria-label="關閉公告" style="position:absolute;right:10px;top:50%;transform:translateY(-50%);background:none;border:none;color:var(--gold-deep);font-size:17px;line-height:1;cursor:pointer;padding:4px;min-width:32px;min-height:32px;display:flex;align-items:center;justify-content:center;">✕</button>';
  }

  // ก้อน static ที่ scripts/generate-nav.js เขียนลงเป็นลูกตัวแรกของ <body> ทุกหน้า
  //   <script> เล็กๆ ข้างหน้าเช็ค sessionStorage ให้ทันทีตอน parse (ก่อนแถบถูกวาด)
  //   เพื่อไม่ให้คนที่กดปิดประกาศไปแล้วเห็นแถบแวบขึ้นมาอีกทุกครั้งที่เปลี่ยนหน้า
  //   คู่กับกฎ `html.ann-off #ann-band{display:none}` ใน css/shared.css
  //   ห่อด้วยคอมเมนต์ START/END เพื่อให้ generate-nav.js "พิมพ์ทับ" ได้แม่นยำทุกครั้ง
  //   (ห้ามใช้ regex จับ <div>...</div> ตรงๆ เพราะข้างในมี <div> ซ้อนอีกหลายชั้น จะตัดผิดที่)
  function renderAnnBandBlockHTML() {
    if (!ANN.length) return ANN_MARK_START + ANN_MARK_END;
    return ANN_MARK_START +
           '<script>try{if(sessionStorage.getItem(\'annDismissed\')===\'1\')document.documentElement.classList.add(\'ann-off\');}catch(e){}<\/script>' +
           '<div class="avail-band" id="ann-band" style="position:relative">' + renderAnnRowHTML(0) + '</div>' +
           ANN_MARK_END;
  }

  // ── 📐 NAV RESPONSIVE AUTO-FIT (inline script ทันทีหลัง </nav>) ──────
  //   เพิ่ม 2026-08-10 — แก้บั๊ก "เมนู desktop หายเร็วเกินไปตอนย่อหน้าต่าง"
  //   เดิมใช้ breakpoint ตายตัว 900px ซึ่งกว้างเกินความจำเป็นจริงมาก
  //   ตอนนี้วัดความกว้างจริงของ logo+เมนูเทียบกับพื้นที่จริงของ <nav> แทนการเดา —
  //   พอดี = อยู่โหมด desktop ต่อ ไม่พอดี = เติม class "nav-compact" (css/shared.css มีด่านสำรอง
  //   @media(max-width:640px) เผื่อ JS ไม่ทำงานอยู่แล้ว)
  //   ต้องเป็น script แบบ sync วางทันทีหลัง <nav> (ไม่ใช่รอ shared.min.js ท้ายหน้า) กันกระพริบ
  //   ตอนโหลดหน้าแรก — แพทเทิร์นเดียวกับ ANN_MARK_START/END ด้านบน (ห่อ marker ให้พิมพ์ทับได้แม่นยำ)
  //   js/core/shared.js ผูก resize/font-load เรียก window.__navFit ซ้ำหลังจากนี้
  var NAVFIT_MARK_START = '<!--NAV-FIT:START-->';
  var NAVFIT_MARK_END = '<!--NAV-FIT:END-->';
  function renderNavFitScriptHTML() {
    return NAVFIT_MARK_START +
      '<script>(function(){try{function f(){var n=document.querySelector("nav.site-nav");if(!n)return;' +
      'var l=n.querySelector(".nav-logo"),k=n.querySelector(".nav-links");if(!l||!k)return;' +
      'n.classList.remove("nav-compact");k.style.cssText="";' +
      'var cs=window.getComputedStyle(n);var pl=parseFloat(cs.paddingLeft)||0,pr=parseFloat(cs.paddingRight)||0;' +
      'var avail=n.clientWidth-pl-pr;var need=l.scrollWidth+k.scrollWidth+12;' +
      'if(need>avail){n.classList.add("nav-compact");}}' +
      'window.__navFit=f;f();}catch(e){}})();<\/script>' +
      NAVFIT_MARK_END;
  }

  return {
    CTA_LABEL: CTA_LABEL,
    CTA_MODAL: CTA_MODAL,
    TOP_ITEMS: TOP_ITEMS,
    BOTTOM_NAV_ITEMS: BOTTOM_NAV_ITEMS,
    PAGE_OVERRIDES: PAGE_OVERRIDES,
    ANN: ANN,
    ANN_MARK_START: ANN_MARK_START,
    ANN_MARK_END: ANN_MARK_END,
    NAVFIT_MARK_START: NAVFIT_MARK_START,
    NAVFIT_MARK_END: NAVFIT_MARK_END,
    renderNavHTML: renderNavHTML,
    renderBottomNavHTML: renderBottomNavHTML,
    renderAnnRowHTML: renderAnnRowHTML,
    renderAnnBandBlockHTML: renderAnnBandBlockHTML,
    renderNavFitScriptHTML: renderNavFitScriptHTML
  };
});
