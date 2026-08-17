// js/games/game-switcher.js — เมนูสลับเกม (#game-switcher) ที่ก๊อปวางซ้ำ 8 ไฟล์ (7 เกม + vault.html)
// รวมเป็นไฟล์กลาง ฉีดรายการแท็บตอนรันจริง (แพทเทิร์นเดียวกับ js/games/word-menu.js)
// กติกา: <div id="game-switcher"> ยังอยู่ตำแหน่ง/CSS เดิมทุกหน้า (ไม่แตะ CSS เลย) — ไฟล์นี้แค่เติมรายการแท็บข้างในแทนการก๊อปวาง
// ลำดับ+label+href ตรวจ diff กับของเดิมทุกหน้าแล้ว (byte ต่อ byte หลังตัด whitespace) ก่อนสร้างไฟล์นี้ — ตรงกันครบ 8 หน้า (2026-08-02)
// FILE MAP: [01] tab config → [02] render → [03] DOM-ready init
(function () {
  var CORE5_TABS = [
    // Phase 1 Core 5 only. Challenge/Paid, Lego and Vault are separate surfaces.
    { id: 'tone_finder',    href: 'tone-finder.html',     label: '🎵 聲調練習室', selfFrom: 'tone_finder' },
    { id: 'reading_game',   href: 'reading-game.html',    label: '✍️ 拼讀練習室', selfFrom: 'reading_game' },
    { id: 'listening_game', href: 'listening-game.html',  label: '🎧 聽力練習室', selfFrom: 'listening_game' },
    { id: 'typing_game',    href: 'typing-game.html',     label: '⌨️ 打字練習室', selfFrom: 'typing_game' },
    { id: 'word_order',     href: 'word-order.html',      label: '🧩 語序練習室', selfFrom: 'word_order' }
  ];

  // Preserve the pre-Phase-1 switcher on non-Core-5 pages; this worker does not
  // redefine navigation or gameplay for Lego/Vault.
  var LEGACY_TABS = [
    { id: 'tone_finder',    href: 'tone-finder.html',     label: '🎵 聲調練習室', selfFrom: 'tone_finder' },
    { id: 'reading_game',   href: 'reading-game.html',    label: '✍️ 拼讀練習室', selfFrom: 'reading_game' },
    { id: 'typing_game',    href: 'typing-game.html',     label: '⌨️ 打字練習室', selfFrom: 'typing_game' },
    { id: 'word_order',     href: 'word-order.html',      label: '🧩 語序練習室', selfFrom: 'word_order' },
    { id: 'lego',           href: 'lego.html',            label: '🧱 造句練習室', selfFrom: 'lego' },
    { id: 'listening_game', href: 'listening-game.html',  label: '🎧 聽力練習室', selfFrom: 'listening_game' },
    { id: 'vault',          href: 'vault.html',           label: '<img src="assets/icons/kratip-plain.svg" alt="" style="width:14px;height:18px;vertical-align:-4px;margin-right:3px;">單字庫', activeLabel: '🔖 單字庫' }
  ];

  function render(container) {
    container.setAttribute('role', 'menu');
    container.setAttribute('aria-label', '切換遊戲');
    var current = container.getAttribute('data-current');
    var core5 = CORE5_TABS.some(function (tab) { return tab.id === current; });
    var tabs = core5 ? CORE5_TABS : LEGACY_TABS;
    var track = container.getAttribute('data-track') !== '0'; // vault.html ตั้ง data-track="0"
    var currentTab = null;
    tabs.forEach(function (t) { if (t.id === current) currentTab = t; });
    var fromVal = currentTab ? (currentTab.selfFrom || currentTab.id) : current;

    var html = '';
    tabs.forEach(function (tab, i) {
      if (i > 0) html += '<div class="gs-divider"></div>';
      if (tab.id === current) {
        html += '<span class="gs-tab gs-active" role="menuitem" aria-current="page">' + (tab.activeLabel || tab.label) + '</span>';
      } else if (track) {
        html += '<a class="gs-tab" role="menuitem" href="' + tab.href + '" onclick="try{gtag(\'event\',\'game_link_click\',{category:\'game\',target:\'' + tab.id + '\',from:\'' + fromVal + '\'})}catch(e){}">' + tab.label + '</a>';
      } else {
        html += '<a class="gs-tab" role="menuitem" href="' + tab.href + '">' + tab.label + '</a>';
      }
    });
    container.innerHTML = html;
  }

  function init() {
    var els = document.querySelectorAll('#game-switcher[data-current]');
    Array.prototype.forEach.call(els, render);
  }
  init();
})();
