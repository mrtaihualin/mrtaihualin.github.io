// word-menu.js — เมนู dropdown ตัวเลือกใต้คำศัพท์ (แบบ A: รายการแนวตั้ง ไอคอน+ชื่อ+สถานะ)
// สร้าง 2026-07-19 ตามที่ Lin เลือก (แบบ A) — ใช้ร่วม 3 เกม: เกมเสียง / เกมอ่าน / เกมพิมพ์
//
// แนวคิดสำคัญ (กันพัง): ไม่สร้างปุ่มใหม่ ไม่แตะ wiring เดิมเลย
//   → ย้าย "ปุ่ม/ช่องเสียบเดิม" (element เดิม id เดิม) เข้าไปอยู่ในแต่ละแถวของเมนู
//   → สคริปต์เดิม (word-audio.js / word-vault.js / shared.js / *-app.js) ยังหาเจอด้วย id เดิม ทำงานเหมือนเดิมทุกอย่าง
//   → ช่องเสียบ (span slot) ที่ถูกเติมทีหลัง/เติมซ้ำทุกคำ ก็ยังเติมลงในเมนูได้เอง เพราะเราย้ายตัว slot ไป ไม่ใช่ตัวปุ่ม
//
// สถานะ 開/關 อ่านจากตัวปุ่มจริง (ไอคอน/attribute ที่สคริปต์เดิมเป็นคนตั้ง) แล้วเฝ้าด้วย MutationObserver
//   → ไม่ต้องแก้ตรรกะเกม ไม่ต้องซิงค์ตัวแปรซ้ำ = ไม่มีทางหลุดจากของจริง
(function () {
  var _styled = false;

  function injectStyles() {
    if (_styled || document.getElementById('word-menu-css')) { _styled = true; return; }
    var s = document.createElement('style');
    s.id = 'word-menu-css';
    s.textContent =
      '.wm-wrap{position:relative;display:inline-block;}' +
      '.wm-panel{position:absolute;top:calc(100% + 6px);left:50%;transform:translateX(-50%);' +
        'min-width:200px;background:#fff;border:1.5px solid rgba(139,99,16,0.30);border-radius:12px;' +
        'box-shadow:0 6px 20px rgba(90,62,10,0.18);overflow:hidden;z-index:99990;display:none;text-align:left;}' +
      '.wm-panel.wm-open{display:block;}' +
      '.wm-row{display:flex;align-items:center;gap:8px;padding:7px 10px;cursor:pointer;' +
        'border-bottom:0.5px solid rgba(139,99,16,0.18);background:#fff;transition:background .12s;}' +
      '.wm-row:last-child{border-bottom:none;}' +
      '.wm-row:hover{background:rgba(139,99,16,0.08);}' +
      '.wm-row-label{flex:1;font-family:\'Noto Sans TC\',sans-serif;font-size:13px;font-weight:700;color:#1C1C1C;white-space:nowrap;}' +
      '.wm-pill{font-family:\'Noto Sans TC\',sans-serif;font-size:11px;font-weight:700;padding:2px 8px;border-radius:20px;white-space:nowrap;}' +
      '.wm-pill.on{color:#2d6a4f;background:#e8f5e9;}' +
      '.wm-pill.off{color:#6b6b6b;background:rgba(139,99,16,0.10);}' +
      // ปุ่มเดิมที่ถูกย้ายเข้ามาในแถว — คงหน้าตาวงกลมเดิมไว้ แต่ห้ามขยายตอน hover (อยู่ในลิสต์แล้ว ขยายจะกระตุก)
      '.wm-row .word-ctl-btn,.wm-row .word-audio-btn,.wm-row .vault-save-btn,.wm-row .rg-ctl-fab{' +
        'flex:0 0 auto;position:static!important;margin:0!important;}' +
      '.wm-row:hover .word-ctl-btn,.wm-row:hover .word-audio-btn,.wm-row:hover .vault-save-btn,.wm-row:hover .rg-ctl-fab{transform:none;}' +
      // Lin 2026-07-24: ย้ายปุ่ม 🍚 ไปรวมกับเมนูลอยมุมขวาล่าง (🎮/⛶/🍙/🪧)
      // Lin 2026-07-25 (v2): รอบแรกลองผูกตำแหน่ง fixed ตายตัวเอง (bottom:280px) แต่ Lin เจอว่าเมนูอื่น (🎮/🪧) ยังโผล่คนละที่ (เหนือปุ่มตัวเองเฉยๆ) ไม่ตรงกัน
      // แก้ใหม่ให้ตรงกับที่ Lin ต้องการจริง: "โผล่เหนือปุ่มทั้ง 4 เสมอ ไม่ว่าจะเปิดอันไหน" → ใช้วิธีเดียวกับเมนู 🎮(#game-switcher) กับ 🪧(.grw-menu) เป๊ะๆ
      // คือทำแผงเป็น flex item ปกติของ .rg-ctl-wrap เอง (ไม่ใช้ position:fixed/absolute) แล้ว insert ไว้บนสุดของชุดปุ่มเสมอ
      // เพราะกล่องอื่นที่ไม่ได้เปิด = display:none (สูง 0) เวลาเปิดกล่องไหน จะเห็นเป็น item บนสุดที่ "แสดงอยู่จริง" เสมอ = โผล่เหนือปุ่มทั้ง 4 พอดี ทุกกล่อง ทุกหน้า เหมือนกันหมด
      '.wm-panel.wm-panel-side{position:static;top:auto;left:auto;right:auto;bottom:auto;transform:none;width:auto;min-width:150px;box-sizing:border-box;}';
    document.head.appendChild(s);
    _styled = true;
  }

  // ── ตัวอ่านสถานะของแต่ละตัวเลือก — อ่านจาก "ของจริง" ที่สคริปต์เดิมตั้งไว้ ──
  // คืน true=เปิด, false=ปิด, null=ไม่ต้องโชว์ป้ายสถานะ (เป็นปุ่มสั่งงาน ไม่ใช่สวิตช์)
  var READERS = {
    none:  function () { return null; },
    pron:  function (el) { var b = el.querySelector('button') || el; return b.textContent.indexOf('🐣') !== -1; },
    zh:    function (el) { var b = el.querySelector('button') || el; return b.textContent.indexOf('🍙') !== -1; },
    vault: function (el) { var b = el.querySelector('button') || el; return b.getAttribute && b.getAttribute('data-saved') === '1'; },
    guide: function (el) { var b = el.querySelector('button') || el; return b.textContent.indexOf('💡') !== -1; },
    kbd:   function (el) { var b = el.querySelector('button') || el; return b.getAttribute && b.getAttribute('data-playing') === '1'; }
  };
  // ข้อความป้ายสถานะของแต่ละแบบ (ไม่ใช่ 開/關 หมดทุกอัน — ให้อ่านแล้วเข้าใจทันที)
  var PILL_TEXT = {
    vault: { on: '已收藏', off: '未收藏' },
    _default: { on: '開', off: '關' }
  };

  /**
   * สร้างเมนูจากแถวปุ่มเดิม
   * @param {object} cfg
   *   cfg.rowId  — id ของแถวปุ่มเดิม (เช่น 'word-ctl-row' / 'tf-word-ctl-row')
   *   cfg.items  — [{ id:'rg-sound-toggle', label:'發音', state:'none' }, ...] เรียงตามลำดับที่อยากให้โชว์
   */
  function init(cfg) {
    if (!cfg || !cfg.rowId || !cfg.items) return;
    var row = document.getElementById(cfg.rowId);
    if (!row || row.getAttribute('data-wm-done') === '1') return;
    injectStyles();

    var panel = document.createElement('div');
    panel.className = 'wm-panel';
    panel.setAttribute('role', 'menu');

    var watched = []; // [{el, reader, pill}]

    cfg.items.forEach(function (item) {
      var ctl = document.getElementById(item.id);
      if (!ctl) return; // เกมนี้ไม่มีตัวเลือกนี้ → ข้ามไปเลย (ตามจำนวนปุ่มที่เกมนั้นมีจริง)

      var r = document.createElement('div');
      r.className = 'wm-row';
      r.setAttribute('role', 'menuitem');
      r.setAttribute('data-wm-item', item.id);

      r.appendChild(ctl); // ★ ย้ายของเดิมเข้ามา (ไม่ clone — clone แล้ว event เดิมหาย)

      var lab = document.createElement('span');
      lab.className = 'wm-row-label';
      lab.textContent = item.label;
      r.appendChild(lab);

      var reader = READERS[item.state] || READERS.none;
      var pill = null;
      if (item.state && item.state !== 'none') {
        pill = document.createElement('span');
        pill.className = 'wm-pill off';
        r.appendChild(pill);
      }

      // กดตรงไหนของแถวก็ได้ = กดปุ่มจริงข้างใน (แต่ถ้ากดโดนปุ่มอยู่แล้ว อย่าสั่งซ้ำ)
      r.addEventListener('click', function (e) {
        var realBtn = ctl.tagName === 'BUTTON' ? ctl : ctl.querySelector('button');
        if (!realBtn) return;
        if (e.target === realBtn || realBtn.contains(e.target)) return; // ปุ่มจัดการเองแล้ว
        realBtn.click();
      });

      panel.appendChild(r);
      watched.push({ el: ctl, reader: reader, pill: pill, state: item.state });
    });

    if (!panel.children.length) return; // ไม่มีตัวเลือกเลย → ไม่ต้องมีเมนู

    // ปุ่มเปิดเมนู 🍚 (ธีมมีนา=ข้าว ตามที่ Lin เลือก — กฎ 17)
    var trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.id = 'wm-trigger';
    trigger.className = 'word-ctl-btn';
    trigger.textContent = '🍚';
    trigger.title = '更多功能（發音／拼音／翻譯／收藏）';
    trigger.setAttribute('aria-label', '更多功能');
    trigger.setAttribute('aria-haspopup', 'true');
    trigger.setAttribute('aria-expanded', 'false');

    var wrap = document.createElement('span');
    wrap.className = 'wm-wrap';
    wrap.appendChild(trigger);
    wrap.appendChild(panel);

    // Lin 2026-07-24: ย้ายปุ่ม 🍚 ไปอยู่กับเมนูลอยมุมขวาล่าง (ชุดเดียวกับ 🎮/⛶/🍙/🪧) แทนที่จะฝังอยู่ใต้คำศัพท์
    // .rg-ctl-wrap สร้างโดย shared.js ซึ่งโหลด/รันทีหลังไฟล์นี้ในทุกหน้าเกม → ต้องรอ/ลองใหม่จนกว่าจะเจอ
    // Lin 2026-07-25 (v3): บั๊กที่ Lin เจอ — ปุ่ม 🍚 เด้งขึ้นข้างบนตอนเปิดเมนู 🎮 สาเหตุคือตอนแทรกปุ่ม 🍚 ไว้ "บนสุดของทั้งชุด"
      // (sideWrap.firstChild) ดันไปแทรกไว้เหนือ #game-switcher (แผงดรอปดาวน์ของปุ่ม 🎮 เอง ไม่ใช่ปุ่ม) — พอแผงนั้นเปิด/โตขึ้น
      // สิ่งที่อยู่ "เหนือมัน" ในลำดับ DOM จะถูกดันขึ้นตาม (กลไกธรรมชาติของ flex column ที่ยึดขอบล่างตายตัว) ปุ่ม 🍚 เลยเด้ง
      // แก้จริง: ปุ่มทุกปุ่มต้อง "อยู่ติดกันเป็นกลุ่มเดียว" ห้ามมีแผงเมนูอื่นแทรกกลาง → แทรกปุ่ม 🍚 ไว้ "ก่อนหน้าปุ่ม 🎮 ทันที" แทน (ใต้ #game-switcher แต่เหนือปุ่ม 🎮)
      // ส่วนแผงตัวเลือกของ 🍚 เอง ยังแทรกเหนือปุ่ม 🍚 เหมือนเดิม (ไม่กระทบปุ่มไหนเพราะปิดอยู่ตลอดเวลาที่ไม่ได้ใช้ = สูง 0)
    function moveToSideMenu() {
      var sideWrap = document.querySelector('.rg-ctl-wrap');
      if (!sideWrap) return false;
      trigger.classList.remove('word-ctl-btn');
      trigger.classList.add('rg-ctl-fab');
      panel.classList.add('wm-panel-side');
      var menuBtn = sideWrap.querySelector('.rg-ctl-fab[aria-label="遊戲選單"]'); // ปุ่ม 🎮 — จุดอ้างอิงที่ปุ่ม 🍚 ต้องอยู่ "ติดกัน" ด้วย
      sideWrap.insertBefore(trigger, menuBtn || sideWrap.firstChild); // ปุ่ม 🍚 → ติดกับปุ่ม 🎮 เป็นกลุ่มเดียวกัน (ไม่แทรกเหนือแผง #game-switcher)
      sideWrap.insertBefore(panel, trigger);                          // แผงตัวเลือกของ 🍚 → เหนือปุ่ม 🍚 ของตัวเองเท่านั้น
      return true;
    }
    if (!moveToSideMenu()) {
      row.appendChild(wrap); // ที่อยู่ชั่วคราว ระหว่างรอเมนูขวาสร้างเสร็จ (กันปุ่มหายไปเฉยๆ)
      var moveTries = 0;
      var moveIv = setInterval(function () {
        moveTries++;
        if (moveToSideMenu() || moveTries > 40) clearInterval(moveIv); // ลองนาน ~4 วิ แล้วเลิก (เผื่อหน้าไหนไม่มีเมนูขวาจริงๆ)
      }, 100);
    }

    function refresh() {
      watched.forEach(function (w) {
        if (!w.pill) return;
        var on = w.reader(w.el);
        if (on === null || typeof on === 'undefined') { w.pill.style.display = 'none'; return; }
        w.pill.style.display = '';
        var txt = PILL_TEXT[w.state] || PILL_TEXT._default;
        w.pill.textContent = on ? txt.on : txt.off;
        w.pill.className = 'wm-pill ' + (on ? 'on' : 'off');
      });
      // ตัวเลือกไหนที่ช่องเสียบยังว่าง (สคริปต์เจ้าของยังไม่เติมปุ่ม/เกมนั้นปิดฟีเจอร์) → ซ่อนแถวนั้นไว้ก่อน
      watched.forEach(function (w) {
        var r = w.el.closest('.wm-row');
        if (!r) return;
        var empty = w.el.tagName !== 'BUTTON' && !w.el.querySelector('button');
        var hiddenCtl = w.el.tagName === 'BUTTON' && w.el.style.display === 'none';
        r.style.display = (empty || hiddenCtl) ? 'none' : '';
      });
    }

    // เฝ้าของจริง: ไอคอน/attribute เปลี่ยนเมื่อไหร่ ป้ายสถานะอัปเดตตามทันที
    try {
      var mo = new MutationObserver(refresh);
      watched.forEach(function (w) {
        mo.observe(w.el, { childList: true, subtree: true, characterData: true,
                           attributes: true, attributeFilter: ['data-saved', 'data-playing', 'style', 'class'] });
      });
    } catch (e) {}
    refresh();
    setTimeout(refresh, 300);   // เผื่อปุ่มที่ถูกเติมทีหลัง (vault/zh) ยังมาไม่ทันตอนโหลด
    setTimeout(refresh, 1200);

    // Lin 2026-07-25 (v2): ปุ่ม/แผงแยกเป็นคนละ element ของ .rg-ctl-wrap แล้ว (ไม่ได้อยู่ใน wrap เดียวกันเสมอไป — เฉพาะโหมด fallback ที่ยังอยู่ด้วยกัน)
    // เลยเช็คสถานะเปิด/ปิดจาก class บนตัว panel เองแทน ไม่พึ่ง wrap
    function close() { panel.classList.remove('wm-open'); trigger.setAttribute('aria-expanded', 'false'); }
    // แผงนี้เป็น item ปกติในชุดปุ่มลอยแล้ว (ไม่ใช้ position:fixed) → ยังเสี่ยงซ้อนกับกล่องลอยอื่น (🎮/🪧) ถ้าเปิดพร้อมกัน
    // ลงทะเบียนกับ GamePanels กลาง กันซ้อนแบบเดียวกับกล่องอื่นๆ ในหน้าเกม
    var wmPanel = { isOpen: function () { return panel.classList.contains('wm-open'); }, close: close };
    if (window.GamePanels) window.GamePanels.add(wmPanel);
    function open() { refresh(); if (window.GamePanels) window.GamePanels.closeOthers(wmPanel); panel.classList.add('wm-open'); trigger.setAttribute('aria-expanded', 'true'); }

    trigger.addEventListener('click', function (e) {
      e.stopPropagation();
      if (panel.classList.contains('wm-open')) close(); else open();
    });
    // กดที่อื่นในหน้า / กด Esc = ปิดเมนู
    document.addEventListener('click', function (e) { if (!trigger.contains(e.target) && !panel.contains(e.target)) close(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
    // กันคีย์บอร์ดมือถือหุบตอนแตะเมนู (เกมพิมพ์) — วิธีเดียวกับ rgNoFocusSteal ในเกม
    trigger.addEventListener('mousedown', function (e) { e.preventDefault(); });
    panel.addEventListener('mousedown', function (e) { e.preventDefault(); });

    row.setAttribute('data-wm-done', '1');
    window.WordMenu.refresh = refresh;
  }

  window.WordMenu = { init: init, refresh: function () {} };
})();
