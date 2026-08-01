/**
 * mix-game-app.js — เกมรวม (綜合遊戲練習室) — Lin
 * ขอบเขต: เฉพาะ 初級ทั้งหมด (พยางค์เดียว + 2 พยางค์) · 3 ด่านต่อคำ: ทายเสียง → ต่อพยางค์ → พิมพ์
 *
 * ════════════════════════════════════════════════════════════════════════════
 * แก้ใหญ่ 2026-07-31 (รอบ "ทำให้เหมือนเกมเดี่ยว 100%" — Lin สั่งหลังให้ AI 3 ตัวตรวจเทียบโค้ด)
 * ทุกอย่างในไฟล์นี้ที่เกี่ยวกับ "หน้าตา/การโต้ตอบ" ถูกยกมาจากเกมเดี่ยวของจริง ไม่ได้คิดขึ้นเอง:
 *   ด่าน 1 (猜聲調)  → tone-finder-game.js  (ปุ่มวงกลม 5 สี · ปุ่ม 🤷 · ชุดคำถามไล่ขั้น步驟1-4 ครบทั้งต้นไม้
 *                       รวมเครื่องมือ 🔎 活音/死音 · ปุ่ม ? เปิดตาราง說明 (DEFS))
 *   ด่าน 2 (拼字)    → reading-game-app.js (dispHTML ตัว ก โปร่งใส · ตัวลวงครบทุกช่อง · ลำดับช่องตามสระ
 *                       · ช่องกดเปลี่ยนใจได้ + ไฮไลต์ช่องที่เล็ง · แถบพยางค์ syl-strip · ไทล์สุ่มมุม/ลอยไม่พร้อมกัน)
 *   ด่าน 3 (打字)    → typing-game-app.js  (คีย์บอร์ดเต็มแถวล่าง Shift/空白鍵/⌫ · input ล่องหนทาบกล่องคำ
 *                       (มือถือแตะแล้วคีย์บอร์ดเครื่องเด้ง) · role/tabindex ครบ)
 *   เอฟเฟกต์         → คะแนนลอย +N / ⭐ ระเบิด / น้องมีนาโผล่พูด (เกมอ่าน) + 🔥 คอมโบเต็มจอ + คอนเฟตติ (เกมเสียง)
 *                       — Lin เลือกเอาทั้ง 4 อย่าง 2026-07-31
 *   แถบคะแนน         → ✓/✗ + 🔥 แบบเกมอ่าน "บวก" 🏆 คะแนนรวมสด แบบเกมเสียง (Lin เลือก "เอาทั้งคู่")
 *
 * ตัดสินใจของ Lin ที่ต่างจากเกมเดี่ยว (ตั้งใจ ไม่ใช่บั๊ก — 2026-07-31):
 *   1) ไม่มีโหมด 練習/提示 เลย เกมรวมเล่นจริงคิดคะแนนอย่างเดียว → ไม่มีปุ่ม 💡 ไม่มีป้ายบอกโหมด
 *   2) ปุ่ม 🔊發音 / 讀音 / 英文讀音 ไม่อยู่ในแถวปุ่มระหว่างเล่น — ย้ายไปอยู่ใน "กล่องเฉลย" ท้ายแต่ละการ์ด
 *      (เหตุผลเดียวกับที่ tone-finder.html:1899 ถอด 發音 ออก: ฟังเสียงก่อนตอบด่านทายวรรณยุกต์ = เฉลยฟรี)
 *   3) 中級/高級 ยังไม่เปิด · 15 การ์ดต่อรอบไม่ว่าคำยาวแค่ไหน · เรียก TONE_SERVER.finishRound() ครั้งเดียวต่อคำ
 *      (Edge Function tone-round ยัง whitelist ไม่รู้จัก 'mix' — รอ Lin deploy เอง ตอนนี้เซิร์ฟเวอร์ตอบ bad game เงียบๆ)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * ข้อมูลอ่านจาก data/words-data.js + data/tone-engine.js เท่านั้น ไม่แก้ไฟล์ไหนเลย (กฎ 15/16)
 */
(function () {
  'use strict';

  // ════════════════════════════════════════════
  // ค่าคงที่คะแนน — ชุดเดียวกับ MASTER RULES ของ 4 เกมเดิม
  // ════════════════════════════════════════════
  var LADDER = [10, 7, 4, 1, 0];
  var FAIL_AT = 4;
  var GOLDEN_CHANCE = 0.18;
  var GOLDEN_MULT = 2;
  var ROUND_WORDS = 5;

  function comboMult(streak) {
    if (streak >= 8) return 3;
    if (streak >= 5) return 2;
    if (streak >= 3) return 1.5;
    return 1;
  }

  var TONE_NAME_TO_NUM = { 'สามัญ': 1, 'เอก': 2, 'โท': 3, 'ตรี': 4, 'จัตวา': 5 };
  var TONE_NUM_ZH = ['', '第一聲', '第二聲', '第三聲', '第四聲', '第五聲'];
  var CLASS_ZH = { low: '低子音', high: '高子音', mid: '中子音', lead: '前引字' };

  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function pick(arr, n) { return shuffle(arr).slice(0, n); }
  function rnd(a) { return a[Math.floor(Math.random() * a.length)]; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function $(id) { return document.getElementById(id); }

  // ════════════════════════════════════════════
  // ตาราง說明 ที่ปุ่ม「?」เปิด — ก็อปจาก tone-finder-game.js:4-20 ตรงๆ
  // ════════════════════════════════════════════
  var DEFS = {
    toneMark: { zh: '聲調符號', desc: '標示在子音上方，決定音節聲調的符號。\n\n四種聲調符號：\n　• 二聲符　อ่\n　• 三聲符　อ้\n　• 四聲符　อ๊\n　• 五聲符　อ๋' },
    low:  { zh: '低子音',  chars: 'ค คร คล คว ฅ ฆ ง ช ซ ซร ฌ ญ ฑ ฒ ณ ท ทร ธ น พ พร พล ฟ ภ ม ย ร ล ว ฬ ฮ' },
    high: { zh: '高子音',  chars: 'ข ขร ขล ขว ฃ ฉ ฐ ถ ผ ฝ ศ ศร ษ ส สร ห' },
    mid:  { zh: '中子音',  chars: 'ก จ จร ด ต ตร บ ป ปร ปล อ ฎ ฏ กร กล กว' },
    lead: { zh: '前引字',  chars: 'หน หม หล หว หย หร หญ หง อย', desc: '由 ห 或 อ 帶頭，與後方低子音結合使聲調改變的組合。' },
    other: { zh: '其他子音', desc: '指「中子音」「高子音」或「前引字」三類的統稱。' },
    live:  { zh: '活音', desc: '① 有長尾音（น ณ ญ ร ล ฬ ม ย ว ง）收尾\n② 無尾音但使用長母音\n　　長母音：-า  -ี  -ื  -ู  เ-  แ-  โ-  -อ  เ-อ  เ-ิ-  เ-ีย  -ัว' },
    dead:  { zh: '死音', desc: '① 有短尾音（ก ข ค ฆ บ ป พ ฟ ภ จ ช ซ ฎ ฏ ฐ ฑ ฒ ด ต ถ ท ธ ศ ษ ส）收尾\n② 無尾音但使用短母音\n　　短母音：-ะ  -ั-  -ิ  -ึ  -ุ  เ-ะ  เ-็-  แ-ะ  แ-็-  โ-ะ  เ-าะ  เ-อะ  เ-ียะ  เ-ือะ  -ัวะ' },
    longVowel:  { zh: '長母音', chars: '-า  -ี  -ื  -ู  เ-  แ-  โ-  -อ  เ-อ  เ-ิ-  เ-ีย  -ัว' },
    shortVowel: { zh: '短母音', chars: '-ะ  -ั-  -ิ  -ึ  -ุ  เ-ะ  เ-็-  แ-ะ  แ-็-  โ-ะ  เ-าะ  เ-อะ  เ-ียะ  เ-ือะ  -ัวะ' },
    longEnd:  { zh: '長尾音', chars: 'น  ณ  ญ  ร  ล  ฬ  ม  ย  ว  ง' },
    shortEnd: { zh: '短尾音', chars: 'ก  ข  ค  ฆ  บ  ป  พ  ฟ  ภ  จ  ช  ซ  ฎ  ฏ  ฐ  ฑ  ฒ  ด  ต  ถ  ท  ธ  ศ  ษ  ส' }
  };

  // ก็อปจาก tone-finder-game.js:3444-3469
  function showTip(keys) {
    var old = $('tf-tip-ov'); if (old) old.remove();
    var rows = keys.map(function (k) {
      var d = DEFS[k]; if (!d) return '';
      return '<div class="tf-tip-entry">' +
        '<div class="tf-tip-zh">' + d.zh + '</div>' +
        (d.chars ? '<div class="tf-tip-chars">' + d.chars + '</div>' : '') +
        (d.desc ? '<div class="tf-tip-desc">' + d.desc + '</div>' : '') +
      '</div>';
    }).join('');
    var div = document.createElement('div');
    div.id = 'tf-tip-ov';
    div.className = 'tf-tip-overlay';
    div.onclick = function (e) { if (e.target === div) div.remove(); };
    div.innerHTML =
      '<div class="tf-tip-box">' +
        '<div class="tf-tip-header">' +
          '<span class="tf-tip-header-title">說明</span>' +
          '<button class="tf-tip-close-btn" onclick="document.getElementById(\'tf-tip-ov\').remove()">✕</button>' +
        '</div>' + rows +
      '</div>';
    document.body.appendChild(div);
  }

  // ════════════════════════════════════════════
  // ตัวช่วยแสดงผลตัวอักษรไทย — ก็อปจาก reading-game-app.js:5-45 ตรงๆ
  // (เครื่องหมายเกาะ ต้องมีตัว ก โปร่งใสอยู่ก้อนข้อความเดียวกัน ไม่งั้นเบราว์เซอร์วาดเพี้ยน)
  // ════════════════════════════════════════════
  function isCombining(s) {
    if (!s || s.length === 0) return false;
    var c = s.charCodeAt(0);
    return (c === 0x0E31) || (c >= 0x0E34 && c <= 0x0E3A) || (c >= 0x0E47 && c <= 0x0E4E);
  }
  var FRONT_V_SET = { 'เ': 1, 'แ': 1, 'โ': 1, 'ไ': 1, 'ใ': 1 };
  function dispHTML(v) {
    if (!v) return '◌';
    var fc = v[0];
    if (isCombining(fc)) return '<span class="comb-disp"><span class="comb-base">ก</span>' + v + '</span>';
    if (FRONT_V_SET[fc] && v.length > 1) return fc + '<span class="comb-disp"><span class="comb-base">ก</span>' + v.slice(1) + '</span>';
    return v;
  }
  function setSlotContent(box, v, stateClass, comp) {
    if (!v) { box.textContent = '◌'; box.className = 'slot-box empty-slot'; }
    else { box.innerHTML = (comp === 'vowel') ? v : dispHTML(v); box.className = 'slot-box ' + (stateClass || 'filled'); }
  }

  // ════════════════════════════════════════════
  // กลุ่มตัวลวง + ตารางสระ — ก็อปจาก reading-game-app.js:48-131 ตรงๆ
  // (ไม่มี CONS_SOUND/FINAL_SOUND แล้ว — Lin สั่งเอาออกทั้งเว็บ 2026-07-27)
  // ════════════════════════════════════════════
  var VOWEL_SYMBOL = {
    'อะ': 'ะ', 'อา': 'า', 'ออ': 'อ', 'เอาะ': 'เาะ', 'เออะ': 'เะ',
    'โอ': 'โ', 'ไอ': 'ไ', 'ใอ': 'ใ', 'โอะ': 'โะ', 'อุ': 'ุ', 'อู': 'ู',
    'อิ': 'ิ', 'อี': 'ี', 'อื': 'ื', 'อึ': 'ึ', 'เอะ': 'เะ', 'แอะ': 'แะ',
    'เอ': 'เ', 'แอ': 'แ', 'เออ': 'เอ', 'เอา': 'เา', 'เอีย': 'เีย', 'เอือ': 'เือ', 'เอิ': 'เิ',
    'อัว': 'ัว', 'อั': 'ั', 'อำ': 'ำ', 'แอ็': 'แ็', 'เอ็': 'เ็', 'อ็': '็', '็อ': '็'
  };
  var VOWEL_READ = {
    'อะ': 'อะ（短母音）', 'อา': 'อา（長母音）', 'ออ': 'ออ（長母音）',
    'เอาะ': 'เอาะ（短母音）', 'เออะ': 'เออะ（短母音）',
    'โอ': 'โอ（長母音）', 'ไอ': 'ไ', 'ใอ': 'ใ', 'โอะ': 'โอะ（短母音）',
    'อุ': 'อุ（短母音）', 'อู': 'อู（長母音）',
    'อิ': 'อิ（短母音）', 'อี': 'อี（長母音）',
    'อื': 'อือ（長母音）', 'อึ': 'อึ（短母音）',
    'เอะ': 'เอะ（短母音）', 'แอะ': 'แอะ（短母音）',
    'เอ': 'เอ（長母音）', 'แอ': 'แอ（長母音）',
    'เออ': 'เออ（長母音）', 'เอา': 'เอา',
    'เอีย': 'เอีย（長母音）', 'เอือ': 'เอือ（長母音）', 'เอิ': 'เออ',
    'อัว': 'อัว（長母音）', 'อั': 'อะ（有尾音）', 'อำ': 'อำ',
    'แอ็': 'แอะ（有尾音）', 'เอ็': 'เอะ（有尾音）', 'อ็': 'เอาะ（有尾音）', '็อ': 'เอาะ（有尾音）'
  };
  var CONS_GROUPS = [
    ['ก', 'ภ', 'ถ'], ['ข', 'ช', 'ซ'], ['ค', 'ด', 'ศ', 'ต'], ['บ', 'ษ', 'ป'],
    ['พ', 'ฟ', 'ผ', 'ฝ'], ['ม', 'ห', 'น', 'ฆ'], ['อ', 'ย'], ['ท'],
    ['ร', 'ธ'], ['ล', 'ส', 'ฉ', 'จ'], ['ง', 'ว'], ['ฎ', 'ฏ'],
    ['ญ', 'ณ', 'ฌ'], ['ฒ'], ['ฬ'], ['ฐ'], ['ฑ'], ['ฮ']
  ];
  var VOWEL_GROUPS = [
    ['อะ', 'อา', 'ออ'], ['เอาะ', 'เออะ'], ['โอ', 'ไอ', 'ใอ'], ['โอะ'],
    ['อุ', 'อู'], ['อิ', 'อี', 'อื', 'อึ'], ['เอะ', 'แอะ'], ['เอ', 'แอ'],
    ['เออ', 'เอา'], ['เอีย', 'เอือ', 'เอิ'], ['อัว', 'อั', 'อำ'],
    ['แอ็', 'เอ็'], ['อ็', '็อ']
  ];
  var FINAL_GROUPS = [
    ['ม', 'น'], ['ณ', 'ญ'], ['ร', 'ธ'], ['ฬ'], ['ย'], ['ง', 'ว', 'จ'],
    ['ข', 'ช', 'ซ'], ['ก', 'ถ'], ['ค', 'ต', 'ด'], ['ฆ'], ['พ', 'ภ', 'ฟ'],
    ['ฎ', 'ฏ'], ['ฑ'], ['ฒ'], ['ฐ'], ['ล', 'ส'], ['ศ'], ['ษ', 'บ'], ['ท']
  ];
  var TONE_POOL = ['่', '้', '๊', '๋', '์'];
  function poolOf(g) { var p = []; g.forEach(function (x) { x.forEach(function (y) { if (p.indexOf(y) < 0) p.push(y); }); }); return p; }
  var CP = poolOf(CONS_GROUPS), VP = poolOf(VOWEL_GROUPS), FP = poolOf(FINAL_GROUPS);

  // ลำดับช่องคำตอบตามการเขียนจริง — ก็อปจาก reading-game-app.js:91-105
  var WRAP_FRONT_V = { 'เอา': 1, 'เออ': 1, 'เอาะ': 1, 'เออะ': 1, 'เอีย': 1, 'เอือ': 1, 'เอิ': 1, 'โอะ': 1, 'เอะ': 1, 'แอะ': 1, 'เอ็': 1, 'แอ็': 1, 'เอียะ': 1, 'เอือะ': 1 };
  function getSlotOrder(vowel, final) {
    var sym = VOWEL_SYMBOL[vowel] || vowel;
    if (WRAP_FRONT_V[vowel]) return ['cons', 'tone', 'vowel', 'final'];
    if (FRONT_V_SET[sym[0]]) return ['vowel', 'cons', 'tone', 'final'];
    var attached = false;
    if (!(vowel === 'อัว' && final)) {
      for (var i = 0; i < sym.length; i++) { if (isCombining(sym[i])) { attached = true; break; } }
    }
    if (attached) return ['cons', 'vowel', 'tone', 'final'];
    return ['cons', 'tone', 'vowel', 'final'];
  }

  // ตัวแสดงผลตัวเลือก — ก็อปจาก reading-game-app.js:530-538 (cons/final โชว์ตัวเขียนตรงๆ)
  function stripAnnotation(s) { return String(s).replace(/（[^）]*）/g, '').replace(/\([^)]*\)/g, '').trim(); }
  function dispOpt(comp, x, cluster) {
    if (comp === 'cons') return cluster ? x + cluster : x;
    if (comp === 'tone') return x;
    if (comp === 'vowel') { var vr = stripAnnotation(VOWEL_READ[x] || VOWEL_SYMBOL[x] || x); return vr || x; }
    return x;
  }
  // ตัวสร้างตัวเลือก+ตัวลวง — ก็อปจาก reading-game-app.js:504-528
  function buildOpts(ans, comp, groups, pool2, count, exclude, avoid, cluster) {
    avoid = avoid || [];
    var ansDisp = dispOpt(comp, ans, cluster);
    var grp = null;
    for (var i = 0; i < groups.length; i++) { if (groups[i].indexOf(ans) >= 0) { grp = groups[i].slice(); break; } }
    if (!grp) grp = [ans];
    if (exclude) grp = grp.filter(function (x) { return x !== exclude; });
    grp = grp.filter(function (x) { return x === ans || (dispOpt(comp, x, cluster) !== ansDisp && avoid.indexOf(dispOpt(comp, x, cluster)) < 0); });
    var opts = grp.slice();
    if (opts.length > count) { opts = opts.filter(function (x) { return x !== ans; }); opts = shuffle(opts).slice(0, count - 1); opts.push(ans); }
    var guard = 0;
    while (opts.length < count && guard < 500) {
      guard++;
      var r = rnd(pool2);
      if (r !== exclude && opts.indexOf(r) < 0 && (r === ans || (dispOpt(comp, r, cluster) !== ansDisp && avoid.indexOf(dispOpt(comp, r, cluster)) < 0))) opts.push(r);
    }
    while (opts.length < count) {
      var strict = pool2.filter(function (r2) { return r2 !== exclude && opts.indexOf(r2) < 0 && dispOpt(comp, r2, cluster) !== ansDisp; });
      var loose = pool2.filter(function (r2) { return r2 !== exclude && opts.indexOf(r2) < 0; });
      var p = strict.length ? rnd(strict) : (loose.length ? rnd(loose) : null);
      if (!p) break;
      opts.push(p);
    }
    return shuffle(opts);
  }

  // ════════════════════════════════════════════
  // คีย์บอร์ด Kedmanee — ก็อปจาก typing-game-app.js
  // ════════════════════════════════════════════
  var TK_ROWS = [
    ['Backquote', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0', 'Minus', 'Equal'],
    ['KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT', 'KeyY', 'KeyU', 'KeyI', 'KeyO', 'KeyP', 'BracketLeft', 'BracketRight'],
    ['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyJ', 'KeyK', 'KeyL', 'Semicolon', 'Quote', 'Backslash'],
    ['KeyZ', 'KeyX', 'KeyC', 'KeyV', 'KeyB', 'KeyN', 'KeyM', 'Comma', 'Period', 'Slash']
  ];
  var RG_BASE_MAP = {
    Backquote: '_', Digit1: 'ๅ', Digit2: '/', Digit3: '-', Digit4: 'ภ', Digit5: 'ถ', Digit6: 'ุ', Digit7: 'ึ', Digit8: 'ค', Digit9: 'ต', Digit0: 'จ', Minus: 'ข', Equal: 'ช',
    KeyQ: 'ๆ', KeyW: 'ไ', KeyE: 'ำ', KeyR: 'พ', KeyT: 'ะ', KeyY: 'ั', KeyU: 'ี', KeyI: 'ร', KeyO: 'น', KeyP: 'ย', BracketLeft: 'บ', BracketRight: 'ล',
    KeyA: 'ฟ', KeyS: 'ห', KeyD: 'ก', KeyF: 'ด', KeyG: 'เ', KeyH: '้', KeyJ: '่', KeyK: 'า', KeyL: 'ส', Semicolon: 'ว', Quote: 'ง', Backslash: 'ฃ',
    KeyZ: 'ผ', KeyX: 'ป', KeyC: 'แ', KeyV: 'อ', KeyB: 'ิ', KeyN: 'ื', KeyM: 'ท', Comma: 'ม', Period: 'ใ', Slash: 'ฝ'
  };
  var RG_SHIFT_MAP = {
    Backquote: '%', Digit1: '+', Digit2: '๑', Digit3: '๒', Digit4: '๓', Digit5: '๔', Digit6: 'ู', Digit7: '฿', Digit8: '๕', Digit9: '๖', Digit0: '๗', Minus: '๘', Equal: '๙',
    KeyQ: '๐', KeyW: '"', KeyE: 'ฎ', KeyR: 'ฑ', KeyT: 'ธ', KeyY: 'ํ', KeyU: '๊', KeyI: 'ณ', KeyO: 'ฯ', KeyP: 'ญ', BracketLeft: 'ฐ', BracketRight: ',',
    KeyA: 'ฤ', KeyS: 'ฆ', KeyD: 'ฏ', KeyF: 'โ', KeyG: 'ฌ', KeyH: '็', KeyJ: '๋', KeyK: 'ษ', KeyL: 'ศ', Semicolon: 'ซ', Quote: '.', Backslash: 'ฅ',
    KeyZ: '(', KeyX: ')', KeyC: 'ฉ', KeyV: 'ฮ', KeyB: 'ฺ', KeyN: '์', KeyM: '?', Comma: 'ฒ', Period: 'ฬ', Slash: 'ฦ'
  };

  // ════════════════════════════════════════════
  // เอฟเฟกต์ — ก็อปค่าจริงจากเกมอ่าน (score-pop/star-burst/mina/toast) + เกมเสียง (combo flash/confetti)
  // ════════════════════════════════════════════
  var _scorePopCount = 0;
  function pop(t) {
    var idx = _scorePopCount++;
    var p = document.createElement('div'); p.className = 'score-pop'; p.textContent = t;
    if (idx > 0) p.style.top = (26 + idx * 9) + '%';
    document.body.appendChild(p);
    setTimeout(function () { if (p.parentNode) p.parentNode.removeChild(p); _scorePopCount = Math.max(0, _scorePopCount - 1); }, 1850);
  }
  function starBurst() {
    var sb = document.createElement('div'); sb.className = 'star-burst'; sb.textContent = '⭐';
    document.body.appendChild(sb);
    setTimeout(function () { if (sb.parentNode) sb.parentNode.removeChild(sb); }, 2200);
  }
  var _rgToastQueue = [], _rgToastBusy = false;
  function rgToast(msg) { _rgToastQueue.push(msg); _rgProcessToast(); }
  function _rgProcessToast() {
    if (_rgToastBusy || !_rgToastQueue.length) return;
    _rgToastBusy = true;
    var msg = _rgToastQueue.shift();
    try {
      var old = $('rg-toast-el'); if (old) old.remove();
      var d = document.createElement('div'); d.id = 'rg-toast-el'; d.className = 'rg-toast'; d.innerHTML = msg;
      document.body.appendChild(d);
      void d.offsetWidth; d.classList.add('show');
      setTimeout(function () {
        d.classList.remove('show');
        setTimeout(function () { if (d.parentNode) d.remove(); _rgToastBusy = false; setTimeout(_rgProcessToast, 200); }, 320);
      }, 2200);
    } catch (e) { _rgToastBusy = false; }
  }
  // น้องมีนา — บทพูด+ค่าสไตล์ ก็อปจาก reading-game-app.js:1613-1665
  var MINA_EMOJI = '👧🏻';
  var MINA_LINES = {
    correct: ['哇～拼對了，你做得很好 ✨', '對了對了！就是這樣拼 🌾', '很好喔～你越來越有手感了 😊'],
    combo: ['哇～連續拼對，米娜都替你開心 🔥', '停不下來了呢，好厲害 ⚡'],
    golden: ['這個字…閃閃發光的！米娜找到黃金稻穗了 🌾✨ 分數加倍！'],
    wrong: ['沒關係的…這個字米娜以前也搞混過，我們再看一次好嗎？', '再試一次就好，米娜陪你 💛', '慢慢來，看清楚綠色的就懂了 🌱'],
    perfect: ['全部一次就拼對！你比自己想的還厲害喔 🌾 米娜給你拍拍手 👏', '一題都沒錯～好棒，米娜好開心 ✨'],
    goodSet: ['完成囉！每天一點點，會越來越好 🌱', '辛苦了～有練就有進步喔 😊'],
    goalMet: ['今天也做到了呢，好棒 🌙 連續第 {n} 天！明天也要回來找米娜喔']
  };
  var _minaTimer = null, _minaQueue = [], _minaBusy = false;
  function minaToast(key, opts) {
    opts = opts || {};
    if (opts.throttle && Math.random() > (opts.chance || 0.34)) return;
    var t = MINA_LINES[key];
    if (Array.isArray(t)) t = t[Math.floor(Math.random() * t.length)] || '';
    if (!t) return;
    if (opts.vars) Object.keys(opts.vars).forEach(function (k) { t = t.replace('{' + k + '}', opts.vars[k]); });
    _minaQueue.push({ msg: t, dur: opts.dur || 2600 });
    _processMina();
  }
  function _processMina() {
    if (_minaBusy || !_minaQueue.length) return;
    _minaBusy = true;
    var item = _minaQueue.shift();
    try {
      var el = $('mina-toast');
      if (!el) {
        el = document.createElement('div'); el.id = 'mina-toast';
        el.style.cssText = 'position:fixed;left:14px;bottom:18px;z-index:10002;max-width:min(300px,78vw);display:flex;align-items:flex-end;gap:8px;pointer-events:none;opacity:0;transform:translateY(14px);transition:opacity .32s,transform .32s;';
        el.innerHTML = '<div style="font-size:34px;line-height:1;flex-shrink:0;filter:drop-shadow(0 2px 4px rgba(0,0,0,.12));">' + MINA_EMOJI + '</div>' +
          '<div class="mina-bubble" style="background:#FAF4E8;border:1.5px solid #F3E4C2;border-radius:14px;padding:9px 13px;font-family:\'Noto Sans TC\',sans-serif;font-size:13.5px;color:#5a4a2a;line-height:1.5;box-shadow:0 4px 14px rgba(139,99,16,.14);"></div>';
        document.body.appendChild(el);
      }
      el.querySelector('.mina-bubble').innerHTML = item.msg;
      void el.offsetWidth; el.style.opacity = '1'; el.style.transform = 'translateY(0)';
      if (_minaTimer) clearTimeout(_minaTimer);
      _minaTimer = setTimeout(function () {
        el.style.opacity = '0'; el.style.transform = 'translateY(14px)';
        setTimeout(function () { _minaBusy = false; setTimeout(_processMina, 220); }, 340);
      }, item.dur);
    } catch (e) { _minaBusy = false; }
  }
  // คอมโบเต็มจอ + คอนเฟตติ — ก็อปจาก tone-finder-game.js:1187-1279
  function comboFlash(combo, mult) {
    try {
      var old = $('tf-combo-flash'); if (old) old.remove();
      var msgs = { 3: '火力全開', 5: '停不下來', 8: '聲調高手 👑' };
      var d = document.createElement('div');
      d.id = 'tf-combo-flash'; d.className = 'tf-combo-flash';
      d.innerHTML = '<div class="tf-combo-flash-x">×' + mult + '</div>' +
        '<div class="tf-combo-flash-main">🔥 連對 ' + combo + ' 題</div>' +
        '<div class="tf-combo-flash-sub">' + (msgs[combo] || '太厲害了') + '</div>';
      document.body.appendChild(d);
      setTimeout(function () { if (d && d.parentNode) d.parentNode.removeChild(d); }, 1600);
    } catch (e) {}
  }
  function confetti() {
    try {
      var colors = ['#6cb8ff', '#7ec87e', '#ffb347', '#c39bff', '#ff7c7c', '#FFD24A'];
      var wrap = document.createElement('div'); wrap.className = 'tf-confetti-wrap';
      for (var i = 0; i < 28; i++) {
        var p = document.createElement('span');
        p.className = 'tf-confetti';
        p.style.left = Math.random() * 100 + '%';
        p.style.background = colors[i % colors.length];
        p.style.animationDelay = (Math.random() * 0.25) + 's';
        p.style.transform = 'rotate(' + (Math.random() * 360) + 'deg)';
        wrap.appendChild(p);
      }
      document.body.appendChild(wrap);
      setTimeout(function () { if (wrap && wrap.parentNode) wrap.parentNode.removeChild(wrap); }, 1800);
    } catch (e) {}
  }

  // ════════════════════════════════════════════
  // ข้อมูล + สถานะเกม
  // ════════════════════════════════════════════
  var POOL = buildWordsForPhonicsGames(WORDS_MASTER).filter(function (w) { return w.level === '初'; });

  var S = {
    queue: [], total: 0, done: 0, score: 0, streak: 0, perfectCount: 0,
    okCount: 0, badCount: 0,
    cur: null, typePos: 0, shiftOn: false, resolving: false,
    wrongCounts: {}, wordStageDone: {}, lastWordTh: null, _keyHandler: null,
    deriv: null
  };

  function makeCard(w, st, golden) {
    return {
      word: w, stage: st, golden: golden,
      wrongCount: 0,
      sylIdx: 0, sylWrong: w.syls.map(function () { return 0; }), sylBaseSum: 0, anyFail: false
    };
  }

  function startRound() {
    var words = pick(POOL, Math.min(ROUND_WORDS, POOL.length));
    var cards = [];
    words.forEach(function (w) {
      var golden = Math.random() < GOLDEN_CHANCE;
      for (var st = 1; st <= 3; st++) cards.push(makeCard(w, st, golden));
    });
    S.queue = shuffle(cards);
    S.total = S.queue.length;
    S.done = 0; S.score = 0; S.streak = 0; S.perfectCount = 0; S.okCount = 0; S.badCount = 0;
    S.wrongCounts = {}; S.wordStageDone = {}; S.lastWordTh = null;
    var endEl = $('end'); if (endEl) endEl.style.display = 'none';
    var cardEl = $('mx-card'); if (cardEl) cardEl.style.display = 'flex';
    nextCard();
  }

  function nextCard() {
    S.deriv = null; S.typePos = 0; S.resolving = false;
    detachKeys();
    if (S.queue.length === 0) { renderEnd(); return; }
    S.cur = S.queue.shift();
    render();
  }

  function cardWasClean(card) {
    if (card.stage === 3) return card.wrongCount === 0;
    return card.sylWrong.every(function (x) { return x === 0; });
  }
  function logWrong(th) { S.wrongCounts[th] = (S.wrongCounts[th] || 0) + 1; }
  function wrongItemsForSave() {
    var out = [];
    for (var th in S.wrongCounts) { if (S.wrongCounts.hasOwnProperty(th)) out.push({ th: th, wrong: S.wrongCounts[th] }); }
    return out;
  }
  function markStageDone(th, clean) {
    var rec = S.wordStageDone[th] || (S.wordStageDone[th] = { n: 0, anyWrong: false });
    rec.n++;
    if (!clean) rec.anyWrong = true;
    if (rec.n >= 3 && window.TONE_SERVER && window.TONE_SERVER.available && window.TONE_SERVER.available()) {
      try { window.TONE_SERVER.finishRound({ word: th, level: 1, game: 'mix', clean: !rec.anyWrong }); } catch (e) {}
    }
  }

  // ════════════════════════════════════════════
  // จบการ์ด / ตอบผิด
  // ════════════════════════════════════════════
  function requeueWrong(card) {
    if (S.resolving) return;
    S.resolving = true;
    logWrong(card.word.th);
    if (card.stage === 3) {
      card.wrongCount++;
      if (card.wrongCount >= FAIL_AT) { finishCard(card, 0, true); return; }
    } else {
      card.sylWrong[card.sylIdx]++;
      if (card.sylWrong[card.sylIdx] >= FAIL_AT) { sylForceFail(card); return; }
    }
    S.queue.push(card);
    showRetryHint();
    flashBanner(false);
    minaToast('wrong', { throttle: true, chance: 0.5 });
    setTimeout(nextCard, 1200);
  }

  function sylForceFail(card) {
    S.resolving = true;
    card.anyFail = true;
    card.sylIdx++;
    if (card.sylIdx >= card.word.syls.length) { finalizeMultiCard(card); return; }
    flashBanner(false, 0, true);
    setTimeout(function () { S.resolving = false; render(); }, 1100);
  }

  function sylCorrect(card) {
    if (S.resolving) return;
    S.resolving = true;
    var wc = card.sylWrong[card.sylIdx];
    var base = LADDER[wc] != null ? LADDER[wc] : 0;
    card.sylBaseSum += base;
    card.sylIdx++;
    if (card.sylIdx >= card.word.syls.length) { finalizeMultiCard(card); return; }
    flashBanner(true, base);
    setTimeout(function () { S.resolving = false; render(); }, 800);
  }

  function finalizeMultiCard(card) {
    var n = card.word.syls.length;
    finishCard(card, card.sylBaseSum / n, !!card.anyFail);
  }

  function finishCard(card, basePts, failed) {
    S.resolving = true;
    S.done++;
    var clean = cardWasClean(card);
    var pts = basePts;
    if (!failed && card.golden && clean) pts = pts * GOLDEN_MULT;
    if (!failed) {
      S.streak++;
      pts = Math.max(1, Math.round(pts * comboMult(S.streak)));
      if (clean) S.perfectCount++;
      S.okCount++;
    } else {
      S.streak = 0;
      pts = Math.round(pts);
      S.badCount++;
    }
    S.score += pts;
    markStageDone(card.word.th, clean);

    // เอฟเฟกต์ — จังหวะเดียวกับเกมอ่าน (reading-game-app.js:1006-1011)
    if (!failed) {
      pop('+' + pts + (card.golden && clean ? ' ✨' : ''));
      if (card.golden && clean) minaToast('golden');
      else if (S.streak === 3 || S.streak === 5 || S.streak === 8) minaToast('combo');
      else if (!clean) minaToast('wrong', { throttle: true, chance: 0.5 });
      else minaToast('correct', { throttle: true });
      if (S.streak === 3 || S.streak === 5 || S.streak === 8) { comboFlash(S.streak, comboMult(S.streak)); confetti(); }
    }
    flashBanner(!failed, pts, failed);
    updateHeader();
    showRevealBox(card);
    renderBtnRow([{ id: 'mx-next', cls: 'btn btn-primary', label: '下一題 →', fn: nextCard }]);
  }

  function answerCorrect(card) {
    if (S.resolving) return;
    S.resolving = true;
    var pts = LADDER[card.wrongCount] != null ? LADDER[card.wrongCount] : 0;
    finishCard(card, pts, false);
  }

  function flashBanner(ok, pts, revealMsg) {
    var el = $('mx-result');
    if (!el) return;
    el.className = 'result-banner show ' + (ok ? 'ok' : 'no');
    el.textContent = ok ? ('✓ 答對了 +' + pts + ' 分') : (revealMsg ? '📖 直接公佈答案' : '✗ 這題晚點還會再出現');
  }
  function clearBanners() {
    var b = $('mx-result'); if (b) b.className = 'result-banner';
    var r = $('mx-retry'); if (r) r.className = 'retry-hint';
    var s = $('bonus-section'); if (s) s.className = 'bonus-section';
    var n = $('bonus-reason'); if (n) { n.className = 'bonus-reason'; n.innerHTML = ''; }
  }
  function showRetryHint() { var r = $('mx-retry'); if (r) r.className = 'retry-hint show'; }

  // ════════════════════════════════════════════
  // กล่องเฉลย — โครงเดียวกับ reading-game-app.js renderBonusReason() (📍 หัวคำ + แถวเฉลยกลาง)
  // Lin สั่ง 2026-07-31: 🔊發音 / 讀音 / 英文讀音 มาอยู่ในกล่องนี้ (ไม่ให้เฉลยวรรณยุกต์ก่อนตอบ)
  // ════════════════════════════════════════════
  function showRevealBox(card) {
    var box = $('bonus-reason');
    if (!box) return;
    var w = card.word;
    box.innerHTML = '';

    // แถวบนสุด: ปุ่มฟังเสียง + คำอ่านไทย + คำอ่านอังกฤษ
    var head = document.createElement('div');
    head.style.cssText = 'text-align:center;margin-bottom:8px;';
    var audioHtml = (window.WordAudio && WordAudio.btnHtml) ? WordAudio.btnHtml(w.th) : '';
    head.innerHTML =
      (audioHtml ? '<div style="margin-bottom:4px;">' + audioHtml + '</div>' : '') +
      '<div class="rev-pron">' + esc(w.readingTH || w.th) + '</div>' +
      (w.en ? '<div class="rev-en">' + esc(w.en) + '</div>' : '');
    box.appendChild(head);

    var list = (typeof getAnswerSyls === 'function') ? getAnswerSyls(w) : w.syls;
    if (!list || !list.length) list = w.syls;
    list.forEach(function (sy, i) {
      var h = document.createElement('div');
      h.className = 'rule-row';
      h.style.cssText = 'margin-top:' + (i === 0 ? '0' : '6px') + ';font-weight:800;color:#8B6310;';
      h.textContent = '📍 ' + (typeof buildAnswerHeader === 'function' ? buildAnswerHeader(sy) : (sy.th || ''));
      box.appendChild(h);
      var rows = (typeof buildAnswerRows === 'function') ? buildAnswerRows(sy) : [];
      rows.forEach(function (r) {
        var row = document.createElement('div'); row.className = 'rule-row';
        var tag = document.createElement('span'); tag.className = 'rule-tag'; tag.textContent = r.tag;
        var txt = document.createElement('span'); txt.className = 'rule-txt'; txt.innerHTML = r.text;
        row.appendChild(tag); row.appendChild(txt); box.appendChild(row);
      });
    });
    box.className = 'bonus-reason show';
    var sec = $('bonus-section'); if (sec) sec.className = 'bonus-section show';
  }

  // ════════════════════════════════════════════
  // บัญชี/ดาว/streak — บัญชีกลางเดียวกับทุกเกม
  // ════════════════════════════════════════════
  var BADGE_STAGES = [
    { min: 0, emoji: '🌱' }, { min: 1, emoji: '🌿' }, { min: 2, emoji: '🌲' }, { min: 4, emoji: '🌴' },
    { min: 6, emoji: '🌸' }, { min: 9, emoji: '🌻' }, { min: 12, emoji: '🌈' }, { min: 16, emoji: '🏆' },
    { min: 20, emoji: '💎' }, { min: 30, emoji: '👑' }
  ];
  function badgeEmoji(n) { var e = '🌱'; BADGE_STAGES.forEach(function (s) { if (n >= s.min) e = s.emoji; }); return e; }

  function mxRenderGameBar() {
    var loggedIn = !!(window.READING_AUTH && window.READING_AUTH.user);
    var row = $('rg-stat-row');
    if (row) row.style.display = loggedIn ? 'flex' : 'none';
    if (!loggedIn || !window.GAME_ACCOUNT) return;
    var sn = $('rg-streak-num'); if (sn) sn.textContent = GAME_ACCOUNT.getStreak() || 0;
    // 🛡️護盾 อ่านจาก key กลางเดียวกับเกมเสียง/เกมอ่าน ('tf_streak_v1' — reading-game-app.js:1475)
    // อ่านอย่างเดียว ไม่แก้ค่า (เกมรวมยังไม่มีระบบแจก/ใช้護盾ของตัวเอง)
    var fz = $('rg-freeze-num');
    if (fz) { try { fz.textContent = (JSON.parse(localStorage.getItem('tf_streak_v1') || '{}').freezes) || 0; } catch (e) { fz.textContent = 0; } }
    var sc = $('star-count'); if (sc) sc.textContent = GAME_ACCOUNT.getStars() || 0;
    var badges = GAME_ACCOUNT.earnedBadges();
    var bc = $('badge-count'); if (bc) bc.textContent = badges.length;
    var be = $('badge-emoji'); if (be) be.textContent = badgeEmoji(badges.length);
  }
  window.mxRenderGameBar = mxRenderGameBar;

  // modal ⭐/勳章 — ก็อปจาก reading-game-app.js:1441-1466
  function openStar() {
    var s = (window.GAME_ACCOUNT) ? GAME_ACCOUNT.getStars() : 0;
    $('star-tree-area').textContent = '⭐ ' + s;
    $('star-tree-caption').textContent = '累積星星（全部遊戲共用）';
    $('star-modal').classList.add('show');
  }
  function openBadge() {
    var s = (window.GAME_ACCOUNT) ? GAME_ACCOUNT.getStars() : 0;
    var badges = (window.GAME_ACCOUNT) ? (GAME_ACCOUNT.starBadges || []) : [];
    var html = '<div style="display:flex;flex-wrap:wrap;gap:10px;justify-content:center;margin-top:6px;">';
    badges.forEach(function (b) {
      var got = s >= b.at;
      html += '<div style="text-align:center;width:74px;opacity:' + (got ? '1' : '0.35') + ';">' +
        '<img src="' + b.img + '" alt="' + b.zh + '" style="width:44px;height:44px;object-fit:contain;" onerror="this.replaceWith(document.createTextNode(\'' + b.emoji + '\'))">' +
        '<div style="font-size:11px;color:#5a3e10;margin-top:2px;">' + b.zh + '</div>' +
        '<div style="font-size:10px;color:#a08050;">' + (got ? '已解鎖' : b.at + ' 顆星') + '</div></div>';
    });
    html += '</div>';
    $('star-prog').innerHTML = html;
    var next = badges.filter(function (b) { return s < b.at; })[0];
    $('star-prog-label').textContent = next ? ('再 ' + (next.at - s) + ' 顆星解鎖「' + next.zh + '」') : '全部稻米品種已解鎖！🎉';
    $('badge-modal').classList.add('show');
  }

  // ฟองคำใบ้ 📖 ครั้งแรก — เหมือน reading-game (dismissHowtoHint)
  function dismissHowtoHint() {
    var b = $('howto-hint-mix'); if (b) b.classList.remove('show');
    try { localStorage.setItem('mx_howto_hint_seen', '1'); } catch (e) {}
  }
  function maybeShowHowtoHint() {
    try { if (localStorage.getItem('mx_howto_hint_seen') === '1') return; } catch (e) {}
    var b = $('howto-hint-mix'); if (b) setTimeout(function () { b.classList.add('show'); }, 800);
  }

  // ✍️ สลับฟอนต์ — ชื่อฟังก์ชันเดียวกับเกมอ่าน/พิมพ์ (shared.js สร้างปุ่ม ✍️ ให้เอง)
  window.rgToggleFont = function () {
    var on = document.body.classList.toggle('rg-modern-font');
    try { localStorage.setItem('rg_modern_font', on ? '1' : '0'); } catch (e) {}
  };
  (function () { try { if (localStorage.getItem('rg_modern_font') === '1') document.body.classList.add('rg-modern-font'); } catch (e) {} })();

  // ⌨️ เปิด/ปิดคีย์บอร์ดบนจอ — กฎเดียวกับ typing-game.html (.tg-kbd-open)
  function setKbdOpen(on) {
    document.body.classList.toggle('tg-kbd-open', !!on);
    try { localStorage.setItem('mx_kbd_open', on ? '1' : '0'); } catch (e) {}
    var btn = $('mx-webkbd-toggle');
    if (btn) { btn.setAttribute('data-playing', on ? '1' : '0'); btn.title = on ? '目前：螢幕鍵盤已開（點擊關閉）' : '目前：螢幕鍵盤已關（點擊開啟）'; }
  }
  function toggleKbd() { setKbdOpen(!document.body.classList.contains('tg-kbd-open')); }

  // ════════════════════════════════════════════
  // เมนู 🍚 (WordMenu) — ลำดับกลางเดียวกับทุกเกม (เกมรวมไม่มี 發音/讀音/英文讀音/提示/禮貌詞)
  // ════════════════════════════════════════════
  function initWordMenu() {
    if (!window.WordMenu) return;
    window.WordMenu.init({
      rowId: 'word-ctl-row',
      items: [
        { id: 'zh-toggle-slot', label: '翻譯', state: 'zh' },
        { id: 'rg-vault-btn-slot', label: '單字庫', state: 'vault' },
        { id: 'font-toggle-slot', label: '字體', state: 'font' },
        { id: 'mx-webkbd-toggle', label: '螢幕鍵盤', state: 'kbd' }
      ]
    });
  }

  function syncWordControls(w) {
    if (S.lastWordTh === w.th) return;
    S.lastWordTh = w.th;
    if (window.WordAudio) WordAudio.setCurrent(w.th);
    var vslot = $('rg-vault-btn-slot');
    if (vslot && window.WordVault) {
      WordVault.injectStyles();
      vslot.innerHTML = '';
      vslot.appendChild(WordVault.createSaveBtn(w.th, { zh: w.zh, source: 'mix-game' }, {}));
    }
  }

  // ════════════════════════════════════════════
  // RENDER — ส่วนหัวถาวร (ไม่สร้างใหม่ทุกการ์ด)
  // ════════════════════════════════════════════
  function curPowerPct(c) {
    if (!c) return 100;
    var wc = c.stage === 3 ? c.wrongCount : c.sylWrong[c.sylIdx];
    var pts = LADDER[wc] != null ? LADDER[wc] : 0;
    return Math.round((pts / LADDER[0]) * 100);
  }
  function updateHeader() {
    var c = S.cur;
    $('qn').textContent = Math.min(S.done + 1, S.total);
    $('qt').textContent = S.total;
    $('ok').textContent = S.okCount;
    $('bad').textContent = S.badCount;
    $('mx-score').textContent = S.score;
    var cb = $('cb');
    cb.className = 'combo-badge' + (S.streak >= 3 ? ' show' : '');
    $('cn').textContent = S.streak;
    var pct = S.total ? Math.round((S.done / S.total) * 100) : 0;
    $('pf').style.width = pct + '%';
    $('pn').textContent = S.done;
    $('pt').textContent = S.total;
    var power = curPowerPct(c);
    $('mx-ws-fill').style.width = power + '%';
    $('mx-ws-num').textContent = Math.round(power / 10);
  }

  function renderSylStrip(c) {
    var strip = $('syl-strip');
    if (!strip) return;
    var syls = c.word.syls;
    if (c.stage === 3 || syls.length <= 1) { strip.style.display = 'none'; strip.innerHTML = ''; return; }
    strip.style.display = 'flex';
    strip.innerHTML = '';
    syls.forEach(function (s, i) {
      var chip = document.createElement('div');
      chip.className = 'syl-chip' + (i === c.sylIdx ? ' cur' : (i < c.sylIdx ? ' done' : ''));
      chip.innerHTML = '<span class="syl-th">' + esc(s.th) + '</span><span class="syl-n">' + (i + 1) + '/' + syls.length + '</span>';
      strip.appendChild(chip);
    });
  }

  function renderBtnRow(btns) {
    var row = $('mx-btn-row');
    row.innerHTML = '';
    if (!btns || !btns.length) { row.style.display = 'none'; return; }
    row.style.display = 'flex';
    btns.forEach(function (b) {
      var el = document.createElement('button');
      el.className = b.cls; el.id = b.id; el.textContent = b.label;
      if (b.disabled) el.disabled = true;
      el.addEventListener('click', b.fn);
      row.appendChild(el);
    });
  }

  function stageTagHtml(c) {
    var zh = ['聲調', '拼字', '打字'][c.stage - 1];
    return '<span class="rule-tag">第 ' + c.stage + ' 關 · ' + zh + '</span>';
  }

  function render() {
    var c = S.cur, w = c.word;
    clearBanners();
    updateHeader();
    $('mx-stage-tag').innerHTML = stageTagHtml(c);
    // คำหลายพยางค์: โชว์ทั้งคำ ไฮไลต์พยางค์ที่กำลังถาม (ด่าน 1/2)
    if (c.stage === 3 || w.syls.length <= 1) $('wth').textContent = w.th;
    else {
      $('wth').innerHTML = w.syls.map(function (s, i) {
        return i === c.sylIdx ? '<span style="color:#3a2a0a">' + esc(s.th) + '</span>' : '<span style="color:#c9b98a">' + esc(s.th) + '</span>';
      }).join('');
    }
    $('wzh').textContent = w.zh || '';
    $('word-golden-badge').style.display = c.golden ? 'block' : 'none';
    renderSylStrip(c);
    syncWordControls(w);

    if (c.stage === 1) { renderStage1(c); }
    else if (c.stage === 2) { renderStage2(c); }
    else { renderStage3(c); }
  }

  // ════════════════════════════════════════════
  // ด่าน 1 — 猜聲調 + หน้าไล่ขั้น (ยกชุดคำถามของ tone-finder มาทั้งดุ้น — Lin เลือก 2026-07-31)
  // ════════════════════════════════════════════
  var TONE_COLORS = ['#6cb8ff', '#7ec87e', '#ff7c7c', '#ffb347', '#c39bff'];

  function fullSpell(syl) { return getFullSyllableSpelling(syl); }

  function renderStage1(c) {
    var btns = [1, 2, 3, 4, 5].map(function (n) {
      var col = TONE_COLORS[n - 1];
      return '<button class="sg-tone-btn" data-n="' + n + '" style="border-color:' + col + ';color:' + col + ';">' + n + '</button>';
    }).join('');
    $('mx-dynamic').innerHTML =
      '<div style="text-align:center;padding:4px 0 8px;">' +
        '<div class="sg-divider"></div>' +
        '<div class="sg-question">你覺得這個字是第幾聲？</div>' +
        '<div class="sg-tone-grid">' + btns + '</div>' +
        '<div style="font-family:\'Noto Sans TC\',sans-serif;font-size:11px;color:#a08a5a;margin-top:4px;">💡 電腦也可以直接按鍵盤 1–5</div>' +
        '<button class="sg-dontknow-btn" id="mx-dontknow">🤷 我不太確定 / 我想挑戰</button>' +
      '</div>' +
      '<div id="mx-deriv"></div>';
    renderBtnRow(null);

    var syl = c.word.syls[c.sylIdx];
    var correctNum = TONE_NAME_TO_NUM[syl.tone_name];
    function guess(n) {
      if (S.resolving || S.deriv) return;
      if (n === correctNum) { sylCorrect(c); }
      else { logWrong(c.word.th); openDerivation(c); }
    }
    $('mx-dynamic').querySelectorAll('.sg-tone-btn').forEach(function (b) {
      b.addEventListener('click', function () { guess(+b.dataset.n); });
    });
    $('mx-dontknow').addEventListener('click', function () { if (!S.resolving && !S.deriv) openDerivation(c); });
    // คีย์บอร์ด 1–5 (เหมือน tone-finder-game.js tfWireToneKeyboard)
    attachKeys(function (e) {
      if (e.key >= '1' && e.key <= '5') { e.preventDefault(); guess(+e.key); }
    });
  }

  // ── ต้นไม้คำถาม: ก็อปโครงจาก tone-finder-game.js step1/step2a/... ทั้งชุด ──
  function openDerivation(c) {
    S.deriv = { step: 's1', path: [] };
    renderDeriv(c);
  }
  function derivWord(c) { return fullSpell(c.word.syls[c.sylIdx]); }

  function qbox(stepNum, text) {
    return '<div class="tf-qbox">' + (stepNum ? '<div class="tf-step-badge">步驟 ' + stepNum + '</div>' : '') +
      '<div class="tf-qtext">' + text + '</div></div>';
  }
  function optRow(label, key, defKeys) {
    var tip = (defKeys && defKeys.length)
      ? '<button class="tf-tip-btn" data-tip="' + esc(JSON.stringify(defKeys)) + '">?</button>' : '';
    return '<div class="tf-opt-wrap"><button class="tf-opt" data-key="' + key + '">' + label + '</button>' + tip + '</div>';
  }
  function markRow(mark) {
    return '<button class="tf-mark-btn" data-key="' + mark + '">' +
      '<span style="font-family:\'Sarabun\',sans-serif;"><span style="visibility:hidden;font-size:44px;">ก</span>' +
      '<span class="tf-mark-symbol" style="margin-left:-0.6em;">' + mark + '</span></span></button>';
  }
  function footer() { return '<div class="tf-footer"></div>'; }
  function helperBanner() { return '<div class="tf-helper-banner">🔎 活音／死音 判斷工具</div>'; }

  var DERIV_STEPS = {
    s1: function () {
      return qbox('1', '這個字有<strong style="color:#C8973A;">聲調符號</strong>嗎？') +
        '<div class="tf-options">' + optRow('有聲調符號', 'hasMark', ['toneMark']) + optRow('無聲調符號', 'noMark') + '</div>' + footer();
    },
    s2a: function () {
      return qbox('2', '起首子音屬於哪一組？') +
        '<div class="tf-options">' + optRow('低子音', 'low', ['low']) + optRow('其他子音（中子音 ／ 高子音 ／ 前引字）', 'other', ['other']) + '</div>' + footer();
    },
    s2a_low: function () {
      return qbox('3', '聲調符號是哪一個？') + '<div class="tf-mark-opts">' + markRow('่') + markRow('้') + '</div>' + footer();
    },
    s2a_other: function () {
      return qbox('3', '請選擇確切的子音種類') +
        '<div class="tf-options">' + optRow('中子音', 'mid', ['mid']) + optRow('高子音', 'high', ['high']) + optRow('前引字', 'lead', ['lead']) + '</div>' + footer();
    },
    s2a_mid: function () {
      return qbox('4', '聲調符號是哪一個？') + '<div class="tf-mark-opts">' + markRow('่') + markRow('้') + markRow('๊') + markRow('๋') + '</div>' + footer();
    },
    s2a_hi: function () {
      return qbox('4', '聲調符號是哪一個？') + '<div class="tf-mark-opts">' + markRow('่') + markRow('้') + '</div>' + footer();
    },
    s2b: function () {
      return qbox('2', '這個字是<strong style="color:#7ec87e;">活音</strong>還是<strong style="color:#ff7c7c;">死音</strong>？') +
        '<button class="tf-helper-trigger" data-goto="h1">🔎 還不確定？ 檢查活音／死音</button>' +
        '<div class="tf-options">' + optRow('活音', 'live', ['live']) + optRow('死音', 'dead', ['dead']) + '</div>' + footer();
    },
    s2b_live: function () {
      return qbox('3', '起首子音屬於哪一組？') +
        '<div class="tf-options">' + optRow('中子音 ／ 低子音', 'mid_low', ['mid', 'low']) + optRow('高子音 ／ 前引字', 'high_lead', ['high', 'lead']) + '</div>' + footer();
    },
    s2b_dead: function () {
      return qbox('3', '起首子音屬於哪一組？') +
        '<div class="tf-options">' + optRow('高子音 ／ 前引字 ／ 中子音', 'high_lead_mid', ['high', 'lead', 'mid']) + optRow('低子音', 'low_dead', ['low']) + '</div>' + footer();
    },
    s2b_dl: function () {
      return qbox('4', '母音是哪種類型？') +
        '<div class="tf-options">' + optRow('長母音', 'long_vowel', ['longVowel']) + optRow('短母音', 'short_vowel', ['shortVowel']) + '</div>' + footer();
    },
    h1: function () {
      return helperBanner() + qbox('', '這個字有「尾音」嗎？') +
        '<div class="tf-options">' + optRow('有尾音', 'has_tail', ['longEnd', 'shortEnd']) + optRow('無尾音', 'no_tail') + '</div>';
    },
    h_with: function () {
      return helperBanner() + qbox('', '尾音是哪種類型？') +
        '<div class="tf-options">' + optRow('短尾音', 'short_tail', ['shortEnd']) + optRow('長尾音', 'long_tail', ['longEnd']) + '</div>';
    },
    h_no: function () {
      return helperBanner() + qbox('', '使用的母音是哪種類型？') +
        '<div class="tf-options">' + optRow('短母音', 'short_vowel_h', ['shortVowel']) + optRow('長母音', 'long_vowel_h', ['longVowel']) + '</div>';
    }
  };

  // ตรวจคำตอบแต่ละขั้น — เหมือน tone-finder-game.js validate() (ใช้ข้อมูลจริงของ Lin เป็นหลัก)
  function derivCheck(c, step, key) {
    var w = derivWord(c), syl = c.word.syls[c.sylIdx];
    var cls = TH_ENGINE.getInitClass(w);
    var initChar = TH_ENGINE.getInitChar(w);
    var live = TH_ENGINE.isLiveWord(w);
    var vType = TH_ENGINE.getVowelType(w);
    var hasMark = TH_ENGINE.hasToneMark(w);
    var mark = TH_ENGINE.getToneMark(w);
    if (step === 's1') {
      if (key === 'hasMark' && !hasMark) return { ok: false, msg: '「' + w + '」好像沒有聲調符號耶～請改選「無聲調符號」' };
      if (key === 'noMark' && hasMark) return { ok: false, msg: '「' + w + '」有聲調符號「' + mark + '」喔～請選「有聲調符號」' };
      return { ok: true, next: hasMark ? 's2a' : 's2b' };
    }
    if (step === 's2a') {
      if (key === 'low' && cls !== 'low') return { ok: false, msg: '「' + initChar + '」是' + (CLASS_ZH[cls] || '') + '呢，不是低子音～' };
      if (key === 'other' && cls === 'low') return { ok: false, msg: '「' + initChar + '」是低子音喔～選「低子音」就對了！' };
      return { ok: true, next: key === 'low' ? 's2a_low' : 's2a_other' };
    }
    if (step === 's2a_other') {
      if (key !== cls) return { ok: false, msg: '「' + initChar + '」應該是' + (CLASS_ZH[cls] || '') + '喔～' };
      return { ok: true, next: key === 'mid' ? 's2a_mid' : 's2a_hi' };
    }
    if (step === 's2a_low' || step === 's2a_mid' || step === 's2a_hi') {
      if (key !== mark) return { ok: false, msg: '這個字的聲調符號是「' + mark + '」喔～' };
      return { ok: true, next: 'result' };
    }
    if (step === 's2b') {
      if (key === 'live' && live === false) return { ok: false, msg: '「' + w + '」看起來是死音喔～可以用下面的判斷工具確認' };
      if (key === 'dead' && live === true) return { ok: false, msg: '「' + w + '」看起來是活音喔～可以用下面的判斷工具確認' };
      return { ok: true, next: key === 'live' ? 's2b_live' : 's2b_dead' };
    }
    if (step === 's2b_live') {
      var wantLive = (cls === 'high' || cls === 'lead') ? 'high_lead' : 'mid_low';
      if (key !== wantLive) return { ok: false, msg: '「' + initChar + '」是' + (CLASS_ZH[cls] || '') + '喔～' };
      return { ok: true, next: 'result' };
    }
    if (step === 's2b_dead') {
      var wantDead = (cls === 'low') ? 'low_dead' : 'high_lead_mid';
      if (key !== wantDead) return { ok: false, msg: '「' + initChar + '」是' + (CLASS_ZH[cls] || '') + '喔～' };
      return { ok: true, next: key === 'low_dead' ? 's2b_dl' : 'result' };
    }
    if (step === 's2b_dl') {
      var isLong = (vType === 'long');
      if ((key === 'long_vowel') !== isLong) return { ok: false, msg: '這個字的母音是' + (isLong ? '長母音' : '短母音') + '喔～' };
      return { ok: true, next: 'result' };
    }
    // เครื่องมือช่วย 活音/死音 — ไม่หักคะแนน แค่พาไปดูคำตอบ (เหมือนของจริง)
    if (step === 'h1') {
      var hasTail = !!syl.final;
      if ((key === 'has_tail') !== hasTail) return { ok: false, msg: hasTail ? '這個字有尾音「' + syl.final + '」喔～' : '這個字沒有尾音喔～', free: true };
      return { ok: true, next: hasTail ? 'h_with' : 'h_no', free: true };
    }
    if (step === 'h_with' || step === 'h_no') {
      return { ok: true, next: 'h_done', free: true, dead: (key === 'short_tail' || key === 'short_vowel_h') };
    }
    return { ok: true, next: 'result' };
  }

  function renderDeriv(c) {
    var el = $('mx-deriv');
    var step = S.deriv.step;
    // ซ่อนหน้าเดา 5 ปุ่ม ระหว่างไล่ขั้น (เหมือนของจริงที่เปลี่ยนหน้าไปเลย)
    var guess = $('mx-dynamic').firstElementChild;
    if (guess) guess.style.display = 'none';

    if (step === 'result') {
      var syl = c.word.syls[c.sylIdx];
      var reason = buildToneReason({ th: derivWord(c), tone_name: syl.tone_name, lead: syl.lead, cons: syl.cons });
      el.innerHTML = qbox('', '答案：<b style="color:#8B6310;">' + TONE_NUM_ZH[TONE_NAME_TO_NUM[syl.tone_name]] + '（' + syl.tone_name + '）</b>' +
          (reason ? '<div style="font-size:13px;font-weight:400;margin-top:6px;color:#7a5a20;">' + esc(reason) + '</div>' : '')) +
        '<div class="tf-options"><div class="tf-opt-wrap"><button class="tf-opt" id="mx-deriv-done">懂了 →</button></div></div>';
      $('mx-deriv-done').addEventListener('click', function () { if (!S.resolving) sylCorrect(c); });
      return;
    }
    if (step === 'h_done') {
      var isDead = S.deriv.helperDead;
      var col = isDead ? '#ff7c7c' : '#7ec87e';
      var label = isDead ? '死音' : '活音';
      el.innerHTML = helperBanner() +
        '<div class="tf-helper-result" style="border-color:' + col + ';">' +
          '<div style="font-family:\'Noto Sans TC\',sans-serif;font-size:12px;color:#a08050;letter-spacing:3px;margin-bottom:10px;">判斷結果</div>' +
          '<div class="tf-helper-result-label" style="color:' + col + ';">' + label + '</div>' +
          '<div class="tf-helper-result-desc">這個字是「' + label + '」</div>' +
        '</div>' +
        '<div class="tf-options"><div class="tf-opt-wrap"><button class="tf-opt" id="mx-helper-go">繼續分析 →</button></div></div>';
      $('mx-helper-go').addEventListener('click', function () {
        S.deriv.step = isDead ? 's2b_dead' : 's2b_live';
        renderDeriv(c);
      });
      return;
    }

    el.innerHTML = (DERIV_STEPS[step] || DERIV_STEPS.s1)();
    el.querySelectorAll('.tf-tip-btn').forEach(function (b) {
      b.addEventListener('click', function (e) { e.stopPropagation(); try { showTip(JSON.parse(b.dataset.tip)); } catch (err) {} });
    });
    var trig = el.querySelector('.tf-helper-trigger');
    if (trig) trig.addEventListener('click', function () { S.deriv.step = 'h1'; renderDeriv(c); });
    el.querySelectorAll('.tf-opt[data-key],.tf-mark-btn[data-key]').forEach(function (b) {
      b.addEventListener('click', function () {
        if (S.resolving || el.dataset.locked) return;
        el.dataset.locked = '1';
        var res = derivCheck(c, step, b.dataset.key);
        if (!res.ok) {
          el.removeAttribute('data-locked');
          rgToast(res.msg);
          if (!res.free) {
            c.sylWrong[c.sylIdx]++;
            logWrong(c.word.th);
            updateHeader();
            if (c.sylWrong[c.sylIdx] >= FAIL_AT) { sylForceFail(c); return; }
          }
          return;
        }
        if (res.dead !== undefined) S.deriv.helperDead = res.dead;
        S.deriv.step = res.next;
        el.removeAttribute('data-locked');
        renderDeriv(c);
      });
    });
  }

  // ════════════════════════════════════════════
  // ด่าน 2 — 拼字 (โครง+กลไกเดียวกับ reading-game-app.js)
  // ════════════════════════════════════════════
  function renderStage2(c) {
    var syl = c.word.syls[c.sylIdx];
    var comps = ['cons', 'vowel'];
    if (syl.final) comps.push('final');
    if (syl.tone) comps.push('tone');

    var n = comps.length, oc = {};
    if (n === 4) oc = { cons: 3, vowel: 3, final: 2, tone: 2 };
    else if (n === 3) comps.forEach(function (x) { oc[x] = 3; });
    else comps.forEach(function (x) { oc[x] = 4; });

    var LABEL = { cons: '子音', vowel: '母音', final: '尾音', tone: '聲調符' };
    var order = getSlotOrder(syl.vowel, syl.final).filter(function (x) { return comps.indexOf(x) >= 0; });
    var slotsHtml = order.map(function (x) {
      return '<div class="slot-col"><div class="slot-label">' + LABEL[x] + '</div>' +
        '<div class="slot-box empty-slot" data-comp="' + x + '" role="button" tabindex="0">◌</div></div>';
    }).join('');

    // คำตอบจริง (เป็นค่าที่แสดงผลแล้ว — เทียบกันด้วยค่าที่แสดง เหมือนเกมอ่าน)
    var compDef = {}, correctVal = {};
    comps.forEach(function (comp) {
      var ans, groups, pool2, ex = null;
      if (comp === 'cons') { ans = syl.cons; groups = CONS_GROUPS; pool2 = CP; ex = syl.lead || null; }
      else if (comp === 'vowel') { ans = syl.vowel; groups = VOWEL_GROUPS; pool2 = VP; }
      else if (comp === 'final') { ans = syl.final; groups = FINAL_GROUPS; pool2 = FP; }
      else { ans = syl.tone; groups = [TONE_POOL]; pool2 = TONE_POOL; }
      compDef[comp] = { ans: ans, groups: groups, pool2: pool2, ex: ex };
      correctVal[comp] = dispOpt(comp, ans, syl.cluster);
    });
    var tiles = [];
    comps.forEach(function (comp) {
      var d = compDef[comp];
      var avoid = comps.filter(function (x) { return x !== comp; }).map(function (x) { return correctVal[x]; });
      var raw = buildOpts(d.ans, comp, d.groups, d.pool2, oc[comp], d.ex, avoid, syl.cluster);
      raw.forEach(function (o) { tiles.push({ type: comp, val: dispOpt(comp, o, syl.cluster) }); });
    });
    tiles = shuffle(tiles);

    $('mx-dynamic').innerHTML =
      '<div class="slot-row">' + slotsHtml + '</div>' +
      '<div class="opts-wrap"><div class="opts" id="mx-pool"></div></div>';

    // ── ไทล์: สุ่มมุม/ตำแหน่ง/จังหวะลอย เหมือน reading-game-app.js renderOptions() ──
    var pool = $('mx-pool');
    tiles.forEach(function (t, i) {
      var el = document.createElement('div');
      el.className = 'opt';
      el.dataset.type = t.type;
      el.dataset.val = t.val;
      el.innerHTML = (t.type === 'vowel') ? t.val : dispHTML(t.val);
      el.style.setProperty('--jx', (Math.random() * 22 - 11).toFixed(1) + 'px');
      el.style.setProperty('--jy', (Math.random() * 18 - 9).toFixed(1) + 'px');
      el.style.setProperty('--jr', (Math.random() * 14 - 7).toFixed(1) + 'deg');
      el.style.setProperty('--tx', (Math.random() * 60 - 30).toFixed(0) + 'px');
      el.style.setProperty('--ty', (Math.random() * 50 + 20).toFixed(0) + 'px');
      el.style.setProperty('--rot', (Math.random() * 30 - 15).toFixed(0) + 'deg');
      el.style.setProperty('--delay', (i * 0.06).toFixed(2) + 's');
      el.style.setProperty('--dur', '0.4s');
      el.style.setProperty('--bdur', (1.8 + Math.random() * 1.2).toFixed(2) + 's');
      el.style.setProperty('--bstart', ((i * 0.06) + 0.55).toFixed(2) + 's');
      pool.appendChild(el);
    });

    var fills = {}, activeSlot = null, checked = false;
    var slotEls = {};
    $('mx-dynamic').querySelectorAll('.slot-box').forEach(function (b) { slotEls[b.dataset.comp] = b; });

    function nextEmpty() {
      for (var i = 0; i < order.length; i++) if (fills[order[i]] == null) return order[i];
      return null;
    }
    function updateActive() {
      order.forEach(function (x) { slotEls[x].classList.remove('active'); });
      if (activeSlot && slotEls[activeSlot] && fills[activeSlot] == null) slotEls[activeSlot].classList.add('active');
      var btn = $('mx-s2-check');
      if (btn) btn.disabled = order.some(function (x) { return fills[x] == null; });
    }
    function setActive(x) { if (checked) return; activeSlot = x; updateActive(); }
    function placeTile(tile) {
      if (checked) return;
      var slot = (activeSlot && fills[activeSlot] == null) ? activeSlot : nextEmpty();
      if (!slot) return;
      fills[slot] = tile.dataset.val;
      tile.classList.add('locked', 'sel');
      tile.dataset.slot = slot;
      setSlotContent(slotEls[slot], tile.dataset.val, 'filled', slot);
      slotEls[slot].dataset.comp = slot;
      activeSlot = nextEmpty();
      updateActive();
    }
    function unplace(slot) {
      if (checked || fills[slot] == null) return;
      var tile = pool.querySelector('.opt[data-slot="' + slot + '"]');
      if (tile) { tile.classList.remove('locked', 'sel'); tile.removeAttribute('data-slot'); }
      fills[slot] = null;
      setSlotContent(slotEls[slot], null, null, slot);
      slotEls[slot].dataset.comp = slot;
      activeSlot = slot;
      updateActive();
    }
    order.forEach(function (x) {
      fills[x] = null;
      var box = slotEls[x];
      box.onclick = function () { if (fills[x] != null) unplace(x); else setActive(x); };
      box.onkeydown = function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); box.onclick(); } };
    });
    pool.querySelectorAll('.opt').forEach(function (t) {
      t.addEventListener('click', function () {
        if (t.classList.contains('locked')) { if (t.dataset.slot) unplace(t.dataset.slot); return; }
        placeTile(t);
      });
    });
    activeSlot = order[0];
    updateActive();

    renderBtnRow([{ id: 'mx-s2-check', cls: 'btn btn-primary', label: '檢查', disabled: true, fn: function () {
      if (S.resolving || checked) return;
      checked = true;
      var btn = $('mx-s2-check'); if (btn) btn.disabled = true;
      var ok = order.every(function (x) { return fills[x] === correctVal[x]; });
      order.forEach(function (x) { slotEls[x].classList.add(fills[x] === correctVal[x] ? 'correct' : 'wrong'); });
      pool.querySelectorAll('.opt').forEach(function (t) { t.classList.add('locked'); });
      if (ok) sylCorrect(c); else requeueWrong(c);
    } }]);
    updateActive();
  }

  // ════════════════════════════════════════════
  // ด่าน 3 — 打字 (โครง+กลไกเดียวกับ typing-game-app.js)
  // ════════════════════════════════════════════
  function renderStage3(c) {
    S.shiftOn = false;
    var rows = TK_ROWS.map(function (row) {
      return '<div class="tk-row">' + row.map(function (code) {
        return '<div class="tk-key" data-code="' + code + '" role="button" tabindex="0">' +
          '<span class="tk-shift">' + esc(RG_SHIFT_MAP[code] || '') + '</span>' +
          '<span class="tk-base">' + esc(RG_BASE_MAP[code]) + '</span>' +
        '</div>';
      }).join('') + '</div>';
    }).join('');
    // แถวล่าง: Shift + 空白鍵 (กดไม่ได้โดยตั้งใจ) + ⌫ 退格 — ก็อปจาก typing-game-app.js:1675-1689
    rows += '<div class="tk-row">' +
      '<div class="tk-key tk-wide" id="mx-shift-key" role="button" tabindex="0"><span class="tk-base" style="font-size:10.5px;">⇧ Shift</span></div>' +
      '<div class="tk-key tk-space" style="opacity:.45;"><span class="tk-base" style="font-size:10.5px;">空白鍵</span></div>' +
      '<div class="tk-key tk-wide" id="mx-bs-key" role="button" tabindex="0"><span class="tk-base" style="font-size:10.5px;">⌫ 退格</span></div>' +
    '</div>';

    $('mx-dynamic').innerHTML =
      '<div class="type-panel" style="display:flex">' +
        '<div id="rg-type-wrap">' +
          '<div class="type-target" id="mx-typetarget" title="點一下用鍵盤打字"></div>' +
          '<input type="text" id="mx-mobile-input" class="mobile-kbd-input" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" inputmode="text" lang="th" aria-label="打字輸入框">' +
        '</div>' +
        '<div class="type-hint">照著打出上面這個字，鍵盤已經照泰文鍵盤排好位置了，打對會自動跳下一步 👇</div>' +
        '<div class="tkbd">' + rows + '</div>' +
      '</div>';
    renderBtnRow(null);

    var target = c.word.syls.map(function (s) { return s.th; }).join('');
    var targetEl = $('mx-typetarget');
    paintType(target);

    function tryChar(ch) {
      if (S.resolving) return;
      if (ch === target[S.typePos]) {
        S.typePos++;
        S.shiftOn = false;
        if (S.typePos >= target.length) { answerCorrect(c); return; }
        paintType(target);
      } else {
        S.shiftOn = false;
        updateShiftVisual();
        targetEl.classList.add('shake');
        setTimeout(function () { targetEl.classList.remove('shake'); }, 350);
        requeueWrong(c);
      }
    }
    function backspace() { if (S.resolving || S.typePos <= 0) return; S.typePos--; paintType(target); }

    $('mx-dynamic').querySelectorAll('.tk-key[data-code]').forEach(function (k) {
      noFocusSteal(k);
      var fire = function () {
        var code = k.dataset.code;
        tryChar(S.shiftOn ? (RG_SHIFT_MAP[code] || RG_BASE_MAP[code]) : RG_BASE_MAP[code]);
      };
      k.addEventListener('click', fire);
      k.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fire(); } });
    });
    var sk = $('mx-shift-key');
    noFocusSteal(sk);
    sk.addEventListener('click', function () { S.shiftOn = !S.shiftOn; updateShiftVisual(); });
    sk.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); sk.click(); } });
    var bs = $('mx-bs-key');
    noFocusSteal(bs);
    bs.addEventListener('click', backspace);
    bs.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); backspace(); } });

    // ช่อง input ล่องหน — มือถือแตะกล่องคำแล้วคีย์บอร์ดเครื่องเด้งเอง (typing-game.html:330-338)
    var mob = $('mx-mobile-input');
    if (mob) {
      mob.addEventListener('focus', function () { document.body.classList.add('tg-kbd-typing'); });
      mob.addEventListener('blur', function () { document.body.classList.remove('tg-kbd-typing'); });
      mob.addEventListener('input', function () {
        var v = mob.value;
        mob.value = '';
        for (var i = 0; i < v.length; i++) tryChar(v[i]);
      });
      mob.addEventListener('keydown', function (e) { if (e.key === 'Backspace') { e.preventDefault(); backspace(); } });
    }
    // คีย์บอร์ดจริงของคอม
    attachKeys(function (e) {
      if (e.target && e.target.id === 'mx-mobile-input') return;
      if (e.key === 'Backspace') { e.preventDefault(); backspace(); return; }
      var ch = e.shiftKey ? (RG_SHIFT_MAP[e.code] || RG_BASE_MAP[e.code]) : RG_BASE_MAP[e.code];
      if (ch) { e.preventDefault(); tryChar(ch); }
    });
  }

  // ก็อปจาก typing-game-app.js:1647 (rgNoFocusSteal) — กันแตะปุ่มบนจอแล้วคีย์บอร์ดมือถือหุบ
  function noFocusSteal(el) {
    if (!el) return;
    el.addEventListener('mousedown', function (e) { e.preventDefault(); });
  }
  function paintType(target) {
    var done = target.slice(0, S.typePos), rest = target.slice(S.typePos);
    $('mx-typetarget').innerHTML =
      '<span class="rg-typed-ok">' + esc(done) + '</span><span class="rg-typed-rest">' + esc(rest) + '</span>';
    updateShiftVisual();
  }
  function updateShiftVisual() {
    var sk = $('mx-shift-key');
    if (sk) sk.classList.toggle('active', S.shiftOn);
  }

  function attachKeys(fn) { detachKeys(); S._keyHandler = fn; document.addEventListener('keydown', fn); }
  function detachKeys() { if (S._keyHandler) { document.removeEventListener('keydown', S._keyHandler); S._keyHandler = null; } }

  // ════════════════════════════════════════════
  // จบรอบ
  // ════════════════════════════════════════════
  function renderEnd() {
    detachKeys();
    S.lastWordTh = null;
    if (window.GAME_ACCOUNT && window.GAME_ACCOUNT.bumpStreakToday) { try { GAME_ACCOUNT.bumpStreakToday(); } catch (e) {} }
    if (window.READING_AUTH && window.READING_AUTH.saveScore) { try { READING_AUTH.saveScore(S.score, 1, 'mix', wrongItemsForSave()); } catch (e) {} }
    mxRenderGameBar();

    var stars = (window.GAME_ACCOUNT) ? GAME_ACCOUNT.getStars() : 0;
    var perfectAll = (S.perfectCount === S.total && S.total > 0);
    $('mx-card').style.display = 'none';
    $('end-score').textContent = S.score + ' 分';
    $('end-detail').textContent = perfectAll
      ? ('完美一輪！✨ 全部 ' + S.total + ' 題答對 · 累積共 ' + stars + ' 顆星')
      : ('答對 ' + S.perfectCount + '/' + S.total + ' 題全對 · 累積共 ' + stars + ' 顆星 · 全對可拿完成獎勵！');
    $('end').style.display = 'flex';
    if (perfectAll) { starBurst(); minaToast('perfect'); }
    else minaToast('goodSet');
  }

  // ════════════════════════════════════════════
  // ระดับ / mount
  // ════════════════════════════════════════════
  function setLevel(lv) {
    ['初', '中', '高'].forEach(function (l) {
      var tab = $('mx-ltab-' + l);
      if (tab) tab.classList.toggle('active', l === lv);
    });
    detachKeys();
    $('end').style.display = 'none';
    $('mx-card').style.display = 'flex';
    if (lv === '初') { startRound(); return; }
    S.lastWordTh = null;
    clearBanners();
    $('syl-strip').style.display = 'none';
    renderBtnRow(null);
    $('mx-stage-tag').innerHTML = '';
    $('wth').textContent = '—';
    $('wzh').textContent = '';
    $('mx-dynamic').innerHTML =
      '<div class="mx-soon">' +
        '<div class="emoji">🌾</div>' +
        '<div class="msg">' + (lv === '中' ? '中級' : '高級') + '還在準備中，敬請期待 🙏<br>先玩玩看初級吧！</div>' +
        '<div class="btn-row" style="margin-top:16px"><button class="btn btn-primary" onclick="MixGame.setLevel(\'初\')">回到初級</button></div>' +
      '</div>';
  }

  function mount() {
    initWordMenu();
    mxRenderGameBar();
    var open = true;
    try { open = localStorage.getItem('mx_kbd_open') !== '0'; } catch (e) {}
    setKbdOpen(open);
    maybeShowHowtoHint();
    startRound();
  }

  window.MixGame = {
    mount: mount, setLevel: setLevel, restart: startRound,
    openStar: openStar, openBadge: openBadge,
    dismissHowtoHint: dismissHowtoHint, toggleKbd: toggleKbd
  };
})();
