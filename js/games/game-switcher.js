// js/games/game-switcher.js — เมนูสลับเกม (#game-switcher) ที่ก๊อปวางซ้ำ 8 ไฟล์ (7 เกม + vault.html)
// รวมเป็นไฟล์กลาง ฉีดรายการแท็บตอนรันจริง (แพทเทิร์นเดียวกับ js/games/word-menu.js)
// กติกา: <div id="game-switcher"> ยังอยู่ตำแหน่ง/CSS เดิมทุกหน้า (ไม่แตะ CSS เลย) — ไฟล์นี้แค่เติมรายการแท็บข้างในแทนการก๊อปวาง
// ลำดับ+label+href ตรวจ diff กับของเดิมทุกหน้าแล้ว (byte ต่อ byte หลังตัด whitespace) ก่อนสร้างไฟล์นี้ — ตรงกันครบ 8 หน้า (2026-08-02)
(function () {
  var TABS = [
    { id: 'challenge',      href: 'games-challenge.html', label: '🎮 綜合遊戲',   selfFrom: 'challenge_game' }, // ของเดิม games-challenge.html ใช้ from:'challenge_game' (ไม่ใช่ 'challenge' เหมือนหน้าอื่นอ้างถึง) — คงพฤติกรรมเดิมไว้ ไม่แก้
    { id: 'tone_finder',    href: 'tone-finder.html',     label: '🎵 聲調練習室', selfFrom: 'tone_finder' },
    { id: 'reading_game',   href: 'reading-game.html',    label: '✍️ 拼讀練習室', selfFrom: 'reading_game' },
    { id: 'typing_game',    href: 'typing-game.html',     label: '⌨️ 打字練習室', selfFrom: 'typing_game' },
    { id: 'word_order',     href: 'word-order.html',      label: '🧩 語序練習室', selfFrom: 'word_order' },
    { id: 'lego',           href: 'lego.html',            label: '🧱 造句練習室', selfFrom: 'lego' },
    { id: 'listening_game', href: 'listening-game.html',  label: '🎧 聽力練習室', selfFrom: 'listening_game' },
    // vault.html ของเดิม: (1) ไม่มี onclick tracking เลยสักแท็บ (2) โชว์ตัวเองด้วยป้าย "🔖 單字庫" (คนละแบบกับตอนหน้าอื่นลิงก์มาซึ่งใช้ไอคอน kratip-plain.svg) — คงพฤติกรรมทั้งสองไว้เป๊ะ
    { id: 'vault',          href: 'vault.html',           label: '<img src="assets/icons/kratip-plain.svg" alt="" style="width:14px;height:18px;vertical-align:-4px;margin-right:3px;">單字庫', activeLabel: '🔖 單字庫' }
  ];

  function render(container) {
    var current = container.getAttribute('data-current');
    var track = container.getAttribute('data-track') !== '0'; // vault.html ตั้ง data-track="0"
    var currentTab = null;
    TABS.forEach(function (t) { if (t.id === current) currentTab = t; });
    var fromVal = currentTab ? (currentTab.selfFrom || currentTab.id) : current;

    var html = '';
    TABS.forEach(function (tab, i) {
      if (i > 0) html += '<div class="gs-divider"></div>';
      if (tab.id === current) {
        html += '<span class="gs-tab gs-active">' + (tab.activeLabel || tab.label) + '</span>';
      } else if (track) {
        html += '<a class="gs-tab" href="' + tab.href + '" onclick="try{gtag(\'event\',\'game_link_click\',{category:\'game\',target:\'' + tab.id + '\',from:\'' + fromVal + '\'})}catch(e){}">' + tab.label + '</a>';
      } else {
        html += '<a class="gs-tab" href="' + tab.href + '">' + tab.label + '</a>';
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
