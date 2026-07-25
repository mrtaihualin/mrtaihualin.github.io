/**
 * mix-game-app.js — เกมรวม (โปรโตไทป์) — Lin 2026-07-25
 * ขอบเขต: เฉพาะ 初級 เท่านั้น (คำพยางค์เดียว) · 3 ด่าน: ทายเสียง → ต่อพยางค์ → พิมพ์
 * ไม่ต่อเซิร์ฟเวอร์เลย — ไม่มีล็อกอิน ไม่มีดาว ไม่มี SRS ไม่มีกระดานคะแนน (ตกลงกับ Lin 2026-07-25)
 * ไฟล์นี้เป็นไฟล์ใหม่ล้วน ไม่แก้ไฟล์เดิมสักบรรทัด (tone-finder-game.js / reading-game-app.js / typing-game-app.js ไม่ถูกแตะ)
 *
 * กลไกคะแนนยืมมาจาก MASTER RULES เดิมที่ 4 เกมใช้ร่วมกัน (บันได / คอมโบ / ทองคำ) เพื่อความคุ้นเคย
 * ไม่ได้ import ไฟล์เดิม — เขียนค่าคงที่ซ้ำไว้ในไฟล์นี้ตรงๆ (เจตนา ไม่ใช่บั๊ก — กันไฟล์ใหม่พังไฟล์เก่า)
 *
 * โครงข้อมูลที่ใช้จาก data/words-data.js (ไม่แก้ไฟล์นั้นเลย แค่เรียกอ่าน):
 *   buildWordsForPhonicsGames(WORDS_MASTER) → {th, zh, en, level, cons, lead, cluster, vowel, tone, final, tone_name, syls, readingTH}
 *   เฉพาะ level==='初' ทุกคำมี syls.length===1 (ยืนยันจากคอมเมนต์ใน words-data.js บรรทัด 24-25)
 *
 * โครงข้อมูลที่ใช้จาก data/tone-engine.js (ไม่แก้ไฟล์นั้นเลย แค่เรียกอ่าน):
 *   TH_ENGINE.{hasToneMark,getToneMark,getInitClass,isLiveWord,getVowelType,getInitChar}
 *   getFullSyllableSpelling(syl), buildToneReason(w), computeToneFromSpelling(word)
 */
(function () {
  'use strict';

  // ════════════════════════════════════════════
  // ค่าคงที่คะแนน — ชุดเดียวกับ MASTER RULES ของ 4 เกมเดิม (10/7/4/1/0, คอมโบ 3/5/8, ทองคำ 18%)
  // ════════════════════════════════════════════
  var LADDER = [10, 7, 4, 1, 0];       // ดัชนี = จำนวนครั้งที่ตอบผิดก่อนตอบถูก (0..3) · 4 ครั้ง = ตก
  var FAIL_AT = 4;
  var GOLDEN_CHANCE = 0.18;
  var GOLDEN_MULT = 2;
  var ROUND_WORDS = 5;                 // 5 คำ × 3 ด่าน = 15 การ์ดต่อรอบ
  var STAGE_NAMES = ['ทายเสียง', 'ต่อพยางค์', 'พิมพ์'];
  var STAGE_EMOJI = ['🎵', '🧩', '⌨️'];

  function comboMult(streak) {
    if (streak >= 8) return 3;
    if (streak >= 5) return 2;
    if (streak >= 3) return 1.5;
    return 1;
  }

  var TONE_NAME_TO_NUM = { 'สามัญ': 1, 'เอก': 2, 'โท': 3, 'ตรี': 4, 'จัตวา': 5 };
  var TONE_NUM_NAME = ['', 'สามัญ', 'เอก', 'โท', 'ตรี', 'จัตวา'];

  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function pick(arr, n) { return shuffle(arr).slice(0, n); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  // ════════════════════════════════════════════
  // ข้อมูล — เฉพาะ 初級
  // ════════════════════════════════════════════
  var POOL = buildWordsForPhonicsGames(WORDS_MASTER).filter(function (w) { return w.level === '初'; });

  // ════════════════════════════════════════════
  // STATE
  // ════════════════════════════════════════════
  var S = {
    queue: [],       // การ์ดที่เหลือในรอบนี้ [{word, stage, wrongCount, golden}]
    total: 0,        // จำนวนการ์ดทั้งหมดตอนเริ่มรอบ (คงที่ = 15)
    done: 0,         // จำนวนการ์ดที่ตอบจบแล้ว (ถูกหรือตก)
    score: 0,
    streak: 0,
    perfectCount: 0, // การ์ดที่ผ่านแบบไม่พลาดเลย (นับรวม golden)
    cur: null,       // การ์ดปัจจุบัน
    derivStep: null, // สถานะขั้นต้นไม้ถาม-ตอบของด่านทายเสียง (null = ยังไม่เปิด)
    typePos: 0
  };

  var RG_BASE_MAP = {
    Backquote: '_', Digit1: 'ๅ', Digit2: '/', Digit3: '-', Digit4: 'ภ', Digit5: 'ถ', Digit6: 'ุ', Digit7: 'ึ', Digit8: 'ค', Digit9: 'ต', Digit0: 'จ', Minus: 'ข', Equal: 'ช',
    KeyQ: 'ๆ', KeyW: 'ไ', KeyE: 'ำ', KeyR: 'พ', KeyT: 'ะ', KeyY: 'ั', KeyU: 'ี', KeyI: 'ร', KeyO: 'น', KeyP: 'ย', BracketLeft: 'บ', BracketRight: 'ล',
    KeyA: 'ฟ', KeyS: 'ห', KeyD: 'ก', KeyF: 'ด', KeyG: 'เ', KeyH: '้', KeyJ: '่', KeyK: 'า', KeyL: 'ส', Semicolon: 'ว', Quote: 'ง', Backslash: 'ฃ',
    KeyZ: 'ผ', KeyX: 'ป', KeyC: 'แ', KeyV: 'อ', KeyB: 'ิ', KeyN: 'ื', KeyM: 'ท', Comma: 'ม', Period: 'ใ', Slash: 'ฝ'
  };
  var KBD_ROWS = [
    ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0'],
    ['KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT', 'KeyY', 'KeyU', 'KeyI', 'KeyO', 'KeyP'],
    ['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyJ', 'KeyK', 'KeyL'],
    ['KeyZ', 'KeyX', 'KeyC', 'KeyV', 'KeyB', 'KeyN', 'KeyM']
  ];

  // ════════════════════════════════════════════
  // เสียง — สำหรับด่านต่อพยางค์ (ตัวไหนออกเสียงเดียวกันให้แสดงเป็นตัวเดียวกัน) ยืมชุดเดียวกับเกมอ่านเดิม
  // ════════════════════════════════════════════
  var CONS_GROUPS = [
    ['ก', 'ภ', 'ถ'], ['ข', 'ช', 'ซ'], ['ค', 'ด', 'ศ', 'ต'], ['บ', 'ษ', 'ป'],
    ['พ', 'ฟ', 'ผ', 'ฝ'], ['ม', 'ห', 'น', 'ฆ'], ['อ', 'ย'], ['ท'],
    ['ร', 'ธ'], ['ล', 'ส', 'ฉ', 'จ'], ['ง', 'ว'], ['ฎ', 'ฏ'],
    ['ญ', 'ณ', 'ฌ'], ['ฒ'], ['ฬ'], ['ฐ'], ['ฑ'], ['ฮ']
  ];
  var TONE_POOL = ['่', '้', '๊', '๋', '์'];
  var CONS_SOUND = {
    'ก': 'ก', 'ข': 'ข', 'ค': 'ค', 'ง': 'ง', 'จ': 'จ', 'ช': 'ช',
    'ซ': 'ซ', 'ฉ': 'ฉ', 'ฌ': 'ช', 'ญ': 'ย', 'ฎ': 'ด', 'ฏ': 'ต',
    'ฐ': 'ถ', 'ฑ': 'ท', 'ฒ': 'ท', 'ณ': 'น', 'ด': 'ด', 'ต': 'ต',
    'ถ': 'ถ', 'ท': 'ท', 'ธ': 'ท', 'น': 'น', 'บ': 'บ', 'ป': 'ป',
    'ผ': 'ผ', 'ฝ': 'ฝ', 'พ': 'พ', 'ฟ': 'ฟ', 'ภ': 'พ', 'ม': 'ม',
    'ย': 'ย', 'ร': 'ร', 'ล': 'ล', 'ว': 'ว', 'ศ': 'ส', 'ษ': 'ส',
    'ส': 'ส', 'ห': 'ห', 'ฬ': 'ล', 'อ': 'อ', 'ฮ': 'ฮ', 'ฆ': 'ค'
  };
  function findGroup(list, ch) { for (var i = 0; i < list.length; i++) if (list[i].indexOf(ch) >= 0) return list[i]; return [ch]; }
  function distractors(list, correct, n) {
    var group = findGroup(list, correct).filter(function (c) { return c !== correct; });
    var pool = shuffle(group).slice(0, n - 1);
    var out = shuffle([correct].concat(pool));
    return out;
  }

  // ════════════════════════════════════════════
  // เริ่มรอบใหม่
  // ════════════════════════════════════════════
  function startRound() {
    var words = pick(POOL, Math.min(ROUND_WORDS, POOL.length));
    var cards = [];
    words.forEach(function (w) {
      var golden = Math.random() < GOLDEN_CHANCE;
      for (var st = 1; st <= 3; st++) cards.push({ word: w, stage: st, wrongCount: 0, golden: golden });
    });
    S.queue = shuffle(cards);
    S.total = S.queue.length;
    S.done = 0;
    S.score = 0;
    S.streak = 0;
    S.perfectCount = 0;
    nextCard();
  }

  function nextCard() {
    S.derivStep = null;
    S.typePos = 0;
    if (S.queue.length === 0) { renderEnd(); return; }
    S.cur = S.queue.shift();
    render();
  }

  function requeueWrong(card) {
    card.wrongCount++;
    if (card.wrongCount >= FAIL_AT) {
      finishCard(card, 0, true);
    } else {
      S.queue.push(card);
      flash(false);
      setTimeout(nextCard, 700);
    }
  }

  function finishCard(card, basePts, failed) {
    S.done++;
    var pts = basePts;
    if (!failed && card.golden && card.wrongCount === 0) pts = pts * GOLDEN_MULT;
    if (!failed) {
      S.streak++;
      pts = Math.max(1, Math.round(pts * comboMult(S.streak)));
      if (card.wrongCount === 0) S.perfectCount++;
    } else {
      S.streak = 0;
    }
    S.score += pts;
    flash(!failed, pts);
    setTimeout(nextCard, failed ? 1100 : 700);
  }

  function answerCorrect(card) {
    var pts = LADDER[card.wrongCount] != null ? LADDER[card.wrongCount] : 0;
    finishCard(card, pts, false);
  }

  var flashEl = null;
  function flash(ok, pts) {
    if (!flashEl) return;
    flashEl.textContent = ok ? ('✓ +' + pts) : '✗ ลองใหม่ทีหลัง';
    flashEl.className = 'mx-flash ' + (ok ? 'ok' : 'bad');
    flashEl.style.opacity = '1';
    setTimeout(function () { flashEl.style.opacity = '0'; }, 650);
  }

  // ════════════════════════════════════════════
  // RENDER — เปลือกเกม
  // ════════════════════════════════════════════
  var root, body, hud;
  function mount(container) {
    root = container;
    root.innerHTML =
      '<div class="mx-hud" id="mx-hud"></div>' +
      '<div class="mx-flash" id="mx-flash"></div>' +
      '<div class="mx-body" id="mx-body"></div>' +
      '<div class="mx-end" id="mx-end" style="display:none"></div>';
    hud = document.getElementById('mx-hud');
    body = document.getElementById('mx-body');
    flashEl = document.getElementById('mx-flash');
    startRound();
  }

  function renderHud() {
    var pct = S.total ? Math.round((S.done / S.total) * 100) : 0;
    hud.innerHTML =
      '<div class="mx-hud-top">' +
        '<span>第 ' + (S.done + 1) + '/' + S.total + ' 題</span>' +
        '<span>🏆 ' + S.score + (S.streak >= 3 ? ' · 🔥' + S.streak : '') + '</span>' +
      '</div>' +
      '<div class="mx-bar"><i style="width:' + pct + '%"></i></div>';
  }

  function render() {
    renderHud();
    var c = S.cur, w = c.word, syl = w.syls[0];
    var head = '<div class="mx-stagechip">' + STAGE_EMOJI[c.stage - 1] + ' ด่าน ' + c.stage + ' · ' + STAGE_NAMES[c.stage - 1] +
      (c.golden ? ' <span class="mx-golden">🌾 คำทองคำ</span>' : '') + '</div>';
    if (c.stage === 1) body.innerHTML = head + stage1Html(w, syl);
    else if (c.stage === 2) body.innerHTML = head + stage2Html(w, syl);
    else body.innerHTML = head + stage3Html(w, syl);
    wireStage(c);
  }

  // ════════════════════════════════════════════
  // ด่าน 1 — ทายเสียง (ตอบเร็ว 1-5 → ถูกไปต่อ / ผิดเปิด 推導)
  // ════════════════════════════════════════════
  function stage1Html(w, syl) {
    var pills = '';
    for (var i = 1; i <= 5; i++) pills += '<button class="mx-pill mx-tone-btn" data-n="' + i + '">' + i + '<small>' + TONE_NUM_NAME[i] + '</small></button>';
    return '<div class="mx-word">' + esc(w.th) + '</div><div class="mx-zh">' + esc(w.zh) + '</div>' +
      '<div class="mx-hint">คำนี้เป็นเสียงที่เท่าไหร่?</div>' +
      '<div class="mx-pills">' + pills + '</div>' +
      '<div id="mx-deriv"></div>';
  }

  function wireStage1(c) {
    var w = c.word, syl = w.syls[0];
    var correctNum = TONE_NAME_TO_NUM[syl.tone_name];
    body.querySelectorAll('.mx-tone-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var n = +btn.dataset.n;
        if (S.derivStep) { derivToneAnswer(c, n); return; } // อยู่ในต้นไม้แล้ว ปุ่ม 1-5 ไม่ทำงานซ้ำ
        if (n === correctNum) {
          body.querySelectorAll('.mx-tone-btn').forEach(function (b) { b.disabled = true; });
          btn.classList.add('right');
          answerCorrect(c);
        } else {
          btn.classList.add('wrong');
          openDerivation(c);
        }
      });
    });
  }

  function fullSpell(syl) { return getFullSyllableSpelling(syl); }

  function openDerivation(c) {
    var w = c.word, syl = w.syls[0];
    var full = fullSpell(syl);
    S.derivStep = { part: 'mark' };
    renderDeriv(c, full);
  }

  function derivBox(html) { document.getElementById('mx-deriv').innerHTML = html; }

  function renderDeriv(c, full) {
    var step = S.derivStep.part;
    var html = '<div class="mx-deriv">';
    if (step === 'mark') {
      html += '<div class="mx-q">มีรูปวรรณยุกต์ (่ ้ ๊ ๋) ติดอยู่ไหม?</div>' +
        '<div class="mx-opts"><button class="mx-opt" data-v="yes">มี</button><button class="mx-opt" data-v="no">ไม่มี</button></div>';
    } else if (step === 'class') {
      html += '<div class="mx-q">พยัญชนะต้น "' + esc(TH_ENGINE.getInitChar(full)) + '" เป็นอักษรกลุ่มไหน?</div>' +
        '<div class="mx-opts"><button class="mx-opt" data-v="mid">กลาง</button><button class="mx-opt" data-v="high">สูง</button><button class="mx-opt" data-v="low">ต่ำ</button></div>';
    } else if (step === 'live') {
      html += '<div class="mx-q">พยางค์นี้เป็นคำเป็นหรือคำตาย?</div>' +
        '<div class="mx-opts"><button class="mx-opt" data-v="live">คำเป็น</button><button class="mx-opt" data-v="dead">คำตาย</button></div>';
    } else if (step === 'vlen') {
      html += '<div class="mx-q">สระเสียงสั้นหรือยาว?</div>' +
        '<div class="mx-opts"><button class="mx-opt" data-v="short">สั้น</button><button class="mx-opt" data-v="long">ยาว</button></div>';
    } else if (step === 'result') {
      var reason = buildToneReason({ th: fullSpell(c.word.syls[0]), tone_name: c.word.syls[0].tone_name, lead: c.word.syls[0].lead, cons: c.word.syls[0].cons });
      html += '<div class="mx-res">สรุป: เสียงที่ ' + TONE_NAME_TO_NUM[c.word.syls[0].tone_name] + ' (' + c.word.syls[0].tone_name + ')' +
        (reason ? '<div class="mx-reason">' + esc(reason) + '</div>' : '') + '</div>' +
        '<button class="mx-opt mx-next" id="mx-deriv-done">เข้าใจแล้ว →</button>';
    }
    html += '</div>';
    derivBox(html);
    if (step === 'result') {
      document.getElementById('mx-deriv-done').addEventListener('click', function () { answerCorrect(c); });
      return;
    }
    body.querySelectorAll('.mx-opt').forEach(function (btn) {
      btn.addEventListener('click', function () { derivClick(c, full, btn.dataset.v); });
    });
  }

  function derivClick(c, full, val) {
    var step = S.derivStep.part;
    var right = false, next = 'result';
    if (step === 'mark') {
      right = (val === 'yes') === TH_ENGINE.hasToneMark(full);
      if (TH_ENGINE.hasToneMark(full)) next = 'class'; else next = 'live';
    } else if (step === 'class') {
      var cls = TH_ENGINE.getInitClass(full); var e = (cls === 'lead') ? 'high' : cls;
      right = (val === e);
      next = 'result'; // มีรูปวรรณยุกต์แล้ว รู้กลุ่มพอสรุปได้เลย
    } else if (step === 'live') {
      var live = TH_ENGINE.isLiveWord(full);
      right = (val === 'live') === live;
      var cls2 = TH_ENGINE.getInitClass(full); var e2 = (cls2 === 'lead') ? 'high' : cls2;
      if (live) next = 'result';
      else next = (e2 === 'low') ? 'vlen' : 'result';
    } else if (step === 'vlen') {
      var vt = TH_ENGINE.getVowelType(full);
      var isShort = (vt === 'short') || (vt == null);
      right = (val === (isShort ? 'short' : 'long'));
      next = 'result';
    }
    if (!right) { c.wrongCount++; if (c.wrongCount >= FAIL_AT) { finishCard(c, 0, true); return; } }
    S.derivStep = { part: next };
    renderDeriv(c, full);
  }

  // ════════════════════════════════════════════
  // ด่าน 2 — ต่อพยางค์ (แยก พยัญชนะ/สระ/วรรณยุกต์/ตัวสะกด)
  // ════════════════════════════════════════════
  function comps(syl) {
    var out = [];
    var consDisp = syl.lead ? syl.lead + syl.cons : (syl.cluster ? syl.cons + syl.cluster : syl.cons);
    out.push({ type: 'cons', label: 'พยัญชนะ', val: syl.cons, disp: consDisp });
    if (syl.tone) out.push({ type: 'tone', label: 'วรรณยุกต์', val: syl.tone, disp: syl.tone });
    out.push({ type: 'vowel', label: 'สระ', val: syl.vowel, disp: syl.vowel });
    if (syl.final) out.push({ type: 'final', label: 'ตัวสะกด', val: syl.final, disp: syl.final });
    return out;
  }

  function stage2Html(w, syl) {
    var parts = comps(syl);
    var slots = parts.map(function (p) { return '<span class="mx-slot" data-type="' + p.type + '"></span>'; }).join('');
    var pool = [];
    parts.forEach(function (p) {
      var opts;
      if (p.type === 'cons') opts = distractors(CONS_GROUPS, p.val, 4).map(function (v) { return { type: 'cons', v: v, disp: CONS_SOUND[v] || v }; });
      else if (p.type === 'tone') opts = distractors([TONE_POOL], p.val, Math.min(4, TONE_POOL.length)).map(function (v) { return { type: 'tone', v: v, disp: v }; });
      else if (p.type === 'vowel') opts = [{ type: 'vowel', v: p.val, disp: p.val }];
      else opts = [{ type: 'final', v: p.val, disp: p.val }];
      pool = pool.concat(opts);
    });
    pool = shuffle(pool);
    var pills = pool.map(function (o, i) { return '<button class="mx-pill mx-tile" data-type="' + o.type + '" data-v="' + esc(o.v) + '" data-i="' + i + '">' + esc(o.disp) + '</button>'; }).join('');
    return '<div class="mx-word">' + esc(w.th) + '</div><div class="mx-zh">' + esc(w.zh) + '</div>' +
      '<div class="mx-slots">' + slots + '</div>' +
      '<div class="mx-pills mx-pool">' + pills + '</div>' +
      '<button class="mx-opt mx-check" id="mx-s2-check" disabled>ตรวจคำตอบ</button>';
  }

  function wireStage2(c) {
    var w = c.word, syl = w.syls[0], parts = comps(syl);
    var need = parts.length, filled = {};
    var slotEls = {};
    body.querySelectorAll('.mx-slot').forEach(function (s) { slotEls[s.dataset.type] = s; });
    var checkBtn = document.getElementById('mx-s2-check');
    body.querySelectorAll('.mx-tile').forEach(function (tile) {
      tile.addEventListener('click', function () {
        var type = tile.dataset.type;
        if (filled[type]) return; // ช่องนี้เต็มแล้ว
        filled[type] = tile.dataset.v;
        slotEls[type].textContent = tile.dataset.v;
        slotEls[type].classList.add('f');
        tile.disabled = true;
        tile.classList.add('used');
        if (Object.keys(filled).length === need) checkBtn.disabled = false;
      });
    });
    checkBtn.addEventListener('click', function () {
      var ok = parts.every(function (p) { return filled[p.type] === p.val; });
      if (ok) { answerCorrect(c); }
      else {
        parts.forEach(function (p) { if (filled[p.type] !== p.val) slotEls[p.type].classList.add('wrong'); });
        requeueWrong(c);
      }
    });
  }

  // ════════════════════════════════════════════
  // ด่าน 3 — พิมพ์ (แป้นพิมพ์ไทย Kedmanee)
  // ════════════════════════════════════════════
  function stage3Html(w, syl) {
    var target = syl.th;
    var rows = KBD_ROWS.map(function (row) {
      return '<div class="mx-kbd-row">' + row.map(function (code) { return '<span class="mx-key" data-code="' + code + '">' + esc(RG_BASE_MAP[code]) + '</span>'; }).join('') + '</div>';
    }).join('');
    return '<div class="mx-word">' + esc(w.th) + '</div><div class="mx-zh">พิมพ์ตามด้วยแป้นไทย · ' + esc(w.zh) + '</div>' +
      '<div class="mx-typetarget" id="mx-typetarget"></div>' +
      '<div class="mx-kbd">' + rows + '</div>';
  }

  function paintType(c) {
    var target = c.word.syls[0].th;
    var html = '';
    for (var i = 0; i < target.length; i++) {
      var cls = i < S.typePos ? 'done' : (i === S.typePos ? 'cur' : '');
      html += '<span class="mx-tc ' + cls + '">' + esc(target[i]) + '</span>';
    }
    document.getElementById('mx-typetarget').innerHTML = html;
    var nextCh = target[S.typePos];
    body.querySelectorAll('.mx-key').forEach(function (k) { k.classList.toggle('hl', RG_BASE_MAP[k.dataset.code] === nextCh); });
  }

  function wireStage3(c) {
    paintType(c);
    var target = c.word.syls[0].th;
    function tryChar(ch) {
      if (ch === target[S.typePos]) {
        S.typePos++;
        if (S.typePos >= target.length) { answerCorrect(c); return; }
        paintType(c);
      } else {
        body.classList.add('mx-shake');
        setTimeout(function () { body.classList.remove('mx-shake'); }, 250);
        requeueWrong(c);
      }
    }
    body.querySelectorAll('.mx-key').forEach(function (k) {
      k.addEventListener('click', function () { tryChar(RG_BASE_MAP[k.dataset.code]); });
    });
    S._keyHandler = function (e) {
      var ch = RG_BASE_MAP[e.code];
      if (ch) { e.preventDefault(); tryChar(ch); }
    };
    document.addEventListener('keydown', S._keyHandler);
  }

  function wireStage(c) {
    if (S._keyHandler) { document.removeEventListener('keydown', S._keyHandler); S._keyHandler = null; }
    if (c.stage === 1) wireStage1(c);
    else if (c.stage === 2) wireStage2(c);
    else wireStage3(c);
  }

  // ════════════════════════════════════════════
  // จบรอบ
  // ════════════════════════════════════════════
  function renderEnd() {
    if (S._keyHandler) { document.removeEventListener('keydown', S._keyHandler); S._keyHandler = null; }
    body.style.display = 'none';
    hud.style.display = 'none';
    var endEl = document.getElementById('mx-end');
    endEl.style.display = 'block';
    var perfectAll = S.perfectCount === S.total;
    endEl.innerHTML =
      '<div class="mx-end-emoji">🎉</div>' +
      '<div class="mx-end-score">' + S.score + ' คะแนน</div>' +
      '<div class="mx-end-detail">ผ่าน ' + S.perfectCount + '/' + S.total + ' ข้อแบบไม่พลาดเลย' + (perfectAll ? ' · เพอร์เฟกต์!' : '') + '</div>' +
      '<button class="mx-opt mx-again" id="mx-again">🎲 เล่นอีกรอบ</button>';
    document.getElementById('mx-again').addEventListener('click', function () {
      body.style.display = ''; hud.style.display = ''; endEl.style.display = 'none';
      startRound();
    });
  }

  window.MixGame = { mount: mount };
})();
