/**
 * mix-game-app.js — เกมรวม (โปรโตไทป์) — Lin 2026-07-25
 * ขอบเขต: เฉพาะ 初級 เท่านั้น (คำพยางค์เดียว) · 3 ด่าน: ทายเสียง → ต่อพยางค์ → พิมพ์
 * ไม่ต่อเซิร์ฟเวอร์เลย — ไม่มีล็อกอิน ไม่มีดาว ไม่มี SRS ไม่มีกระดานคะแนน (ตกลงกับ Lin 2026-07-25)
 * ไฟล์นี้เป็นไฟล์ใหม่ล้วน ไม่แก้ไฟล์เดิมสักบรรทัด (tone-finder-game.js / reading-game-app.js / typing-game-app.js ไม่ถูกแตะ)
 *
 * แก้ 2026-07-25 (รอบ 2 — Lin บอก "ไม่เห็นเหมือนเกมตอนนี้เลย"): รอบแรกคิด class/สี/ป้ายภาษาขึ้นเอง (mx-*, ป้ายไทย, สีแบน)
 * ไม่ตรงของจริงเลย — รอบนี้เปลี่ยนมาใช้ class ชื่อเดียวกับเกมเดิมเป๊ะ (.card/.gold-banner/.opt/.slot-box/.btn/.tk-key ฯลฯ
 * ก็อปมาจาก reading-game.html + typing-game.html จริง) + ป้าย UI เปลี่ยนเป็นภาษาจีนตามเว็บจริงทั้งเว็บ (ตัวคำ/คำแปลยังเป็นไทยเหมือนเดิม
 * แค่ป้ายปุ่ม/label เปลี่ยนเป็นจีน) — เว็บนี้สอนคนไต้หวันเรียนไทย UI จึงเป็นจีนเสมอ ไม่ใช่ไทย
 *
 * กลไกคะแนนยืมมาจาก MASTER RULES เดิมที่ 4 เกมใช้ร่วมกัน (บันได / คอมโบ / ทองคำ) เพื่อความคุ้นเคย
 * ไม่ได้ import ไฟล์เดิม — เขียนค่าคงที่ซ้ำไว้ในไฟล์นี้ตรงๆ (เจตนา ไม่ใช่บั๊ก — กันไฟล์ใหม่พังไฟล์เก่า)
 *
 * โครงข้อมูลที่ใช้จาก data/words-data.js (ไม่แก้ไฟล์นั้นเลย แค่เรียกอ่าน):
 *   buildWordsForPhonicsGames(WORDS_MASTER) → {th, zh, en, level, cons, lead, cluster, vowel, tone, final, tone_name, syls, readingTH}
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
  var LADDER = [10, 7, 4, 1, 0];
  var FAIL_AT = 4;
  var GOLDEN_CHANCE = 0.18;
  var GOLDEN_MULT = 2;
  var ROUND_WORDS = 5;
  var STAGE_NAMES = ['聲調', '拼字', '打字'];

  function comboMult(streak) {
    if (streak >= 8) return 3;
    if (streak >= 5) return 2;
    if (streak >= 3) return 1.5;
    return 1;
  }

  var TONE_NAME_TO_NUM = { 'สามัญ': 1, 'เอก': 2, 'โท': 3, 'ตรี': 4, 'จัตวา': 5 };
  var TONE_NUM_ZH = ['', '第一聲', '第二聲', '第三聲', '第四聲', '第五聲'];

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
  // ข้อมูล — เฉพาะ 初級ที่พยางค์เดียว (183/266 คำ — 初級ที่ 2 พยางค์ เช่น "เมนู" ยังไม่รองรับในโปรโตไทป์นี้)
  // ════════════════════════════════════════════
  var POOL = buildWordsForPhonicsGames(WORDS_MASTER).filter(function (w) { return w.level === '初' && w.syls.length === 1; });

  var S = {
    queue: [], total: 0, done: 0, score: 0, streak: 0, perfectCount: 0,
    cur: null, derivStep: null, typePos: 0
  };

  var TK_ROWS = [
    ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0'],
    ['KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT', 'KeyY', 'KeyU', 'KeyI', 'KeyO', 'KeyP'],
    ['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyJ', 'KeyK', 'KeyL'],
    ['KeyZ', 'KeyX', 'KeyC', 'KeyV', 'KeyB', 'KeyN', 'KeyM']
  ];
  var RG_BASE_MAP = {
    Backquote: '_', Digit1: 'ๅ', Digit2: '/', Digit3: '-', Digit4: 'ภ', Digit5: 'ถ', Digit6: 'ุ', Digit7: 'ึ', Digit8: 'ค', Digit9: 'ต', Digit0: 'จ', Minus: 'ข', Equal: 'ช',
    KeyQ: 'ๆ', KeyW: 'ไ', KeyE: 'ำ', KeyR: 'พ', KeyT: 'ะ', KeyY: 'ั', KeyU: 'ี', KeyI: 'ร', KeyO: 'น', KeyP: 'ย', BracketLeft: 'บ', BracketRight: 'ล',
    KeyA: 'ฟ', KeyS: 'ห', KeyD: 'ก', KeyF: 'ด', KeyG: 'เ', KeyH: '้', KeyJ: '่', KeyK: 'า', KeyL: 'ส', Semicolon: 'ว', Quote: 'ง', Backslash: 'ฃ',
    KeyZ: 'ผ', KeyX: 'ป', KeyC: 'แ', KeyV: 'อ', KeyB: 'ิ', KeyN: 'ื', KeyM: 'ท', Comma: 'ม', Period: 'ใ', Slash: 'ฝ'
  };

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
    return shuffle([correct].concat(pool));
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
    S.done = 0; S.score = 0; S.streak = 0; S.perfectCount = 0;
    nextCard();
  }

  function nextCard() {
    S.derivStep = null; S.typePos = 0; S.resolving = false;
    if (S.queue.length === 0) { renderEnd(); return; }
    S.cur = S.queue.shift();
    render();
  }

  // ป้องกันคะแนนเบิ้ล: ระหว่างรอทรานซิชัน (750-1200ms หลังตอบ) ต้องล็อกอินพุตทั้งหมด
  // เจอบั๊กจริงระหว่างทดสอบ 2026-07-25 — ปุ่ม 檢查/ปุ่มพิมพ์ ยังกดซ้ำได้ระหว่างรอ ทำให้ finishCard() ถูกเรียกซ้ำๆ
  // บนการ์ดเดิม คะแนนพุ่งเกินจริง (990 แต้มจาก 15 ข้อ, perfectCount ทะลุ total) — แก้โดยเช็ค S.resolving ทุกจุดรับอินพุต
  function requeueWrong(card) {
    if (S.resolving) return;
    S.resolving = true;
    card.wrongCount++;
    if (card.wrongCount >= FAIL_AT) { finishCard(card, 0, true); }
    else { S.queue.push(card); flashBanner(false); setTimeout(nextCard, 750); }
  }

  function finishCard(card, basePts, failed) {
    S.resolving = true;
    S.done++;
    var pts = basePts;
    if (!failed && card.golden && card.wrongCount === 0) pts = pts * GOLDEN_MULT;
    if (!failed) {
      S.streak++;
      pts = Math.max(1, Math.round(pts * comboMult(S.streak)));
      if (card.wrongCount === 0) S.perfectCount++;
    } else { S.streak = 0; }
    S.score += pts;
    flashBanner(!failed, pts);
    setTimeout(nextCard, failed ? 1200 : 750);
  }

  function answerCorrect(card) {
    if (S.resolving) return;
    S.resolving = true;
    var pts = LADDER[card.wrongCount] != null ? LADDER[card.wrongCount] : 0;
    finishCard(card, pts, false);
  }

  var bannerEl = null;
  function flashBanner(ok, pts) {
    if (!bannerEl) return;
    bannerEl.className = 'result-banner show ' + (ok ? 'ok' : 'no');
    bannerEl.textContent = ok ? ('✓ 答對了 +' + pts + ' 分') : '✗ 這題晚點還會再出現';
    setTimeout(function () { bannerEl.className = 'result-banner'; }, 700);
  }

  // ════════════════════════════════════════════
  // RENDER — เปลือกเกม (ใช้ class เดียวกับเกมเดิม)
  // ════════════════════════════════════════════
  var root, card;
  function mount(container) {
    root = container;
    root.innerHTML = '<div class="card" id="mx-card"></div>';
    card = document.getElementById('mx-card');
    startRound();
  }

  function goldBannerHtml() {
    var pct = S.total ? Math.round((S.done / S.total) * 100) : 0;
    return '<div class="gold-banner">' +
      '<div class="top-bar">' +
        '<div class="score-bar"><span>第 ' + (S.done + 1) + '/' + S.total + ' 題</span><span>🏆<span>' + S.score + '</span></span></div>' +
        '<div class="combo-badge' + (S.streak >= 3 ? ' show' : '') + '">🔥 連對 ' + S.streak + '</div>' +
      '</div>' +
      '<div class="bars-wrap"><div class="bar-row"><span class="bar-label">進度</span><div class="bar-bg"><div class="bar-fill prog" style="width:' + pct + '%"></div></div></div></div>' +
    '</div>';
  }

  function stageTagHtml(c) {
    var zh = ['聲調', '拼字', '打字'][c.stage - 1];
    return '<div style="text-align:center;margin-bottom:2px">' +
      '<span class="rule-tag">第 ' + c.stage + ' 關 · ' + zh + '</span>' +
      (c.golden ? ' <span class="rule-tag sp">🌾 黃金字</span>' : '') +
    '</div>';
  }

  function render() {
    var c = S.cur, w = c.word, syl = w.syls[0];
    var html = goldBannerHtml() + stageTagHtml(c) +
      '<div class="word-area"><div class="word-th">' + esc(w.th) + '</div><div class="word-zh">' + esc(w.zh) + '</div></div>' +
      '<div class="result-banner" id="mx-result"></div>';
    if (c.stage === 1) html += stage1Html(w, syl);
    else if (c.stage === 2) html += stage2Html(w, syl);
    else html += stage3Html(w, syl);
    card.innerHTML = html;
    bannerEl = document.getElementById('mx-result');
    wireStage(c);
  }

  // ════════════════════════════════════════════
  // ด่าน 1 — 猜聲調（快問快答 → 答對直接過關 / 答錯開推導）
  // ════════════════════════════════════════════
  function stage1Html() {
    var opts = '';
    for (var i = 1; i <= 5; i++) opts += '<div class="opt" data-n="' + i + '" style="--delay:' + (i * 0.05) + 's">' + i + '</div>';
    return '<p style="text-align:center;font-size:13px;color:#a08050;margin:2px 0 8px">這個字是第幾聲？</p>' +
      '<div class="opts-wrap"><div class="opts">' + opts + '</div></div>' +
      '<div id="mx-deriv"></div>';
  }

  function wireStage1(c) {
    var w = c.word, syl = w.syls[0];
    var correctNum = TONE_NAME_TO_NUM[syl.tone_name];
    card.querySelectorAll('.opts .opt').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (btn.classList.contains('locked')) return;
        var n = +btn.dataset.n;
        card.querySelectorAll('.opts .opt').forEach(function (b) { b.classList.add('locked'); });
        if (n === correctNum) { btn.classList.add('correct'); answerCorrect(c); }
        else { btn.classList.add('wrong'); openDerivation(c); }
      });
    });
  }

  function fullSpell(syl) { return getFullSyllableSpelling(syl); }

  function openDerivation(c) {
    S.derivStep = { part: 'mark' };
    renderDeriv(c, fullSpell(c.word.syls[0]));
  }

  function renderDeriv(c, full) {
    var step = S.derivStep.part;
    var q = '', opts = [];
    if (step === 'mark') { q = '有聲調符號（่ ้ ๊ ๋）嗎？'; opts = [['yes', '有'], ['no', '沒有']]; }
    else if (step === 'class') { q = '子音「' + esc(TH_ENGINE.getInitChar(full)) + '」是哪一類？'; opts = [['mid', '中子音'], ['high', '高子音'], ['low', '低子音']]; }
    else if (step === 'live') { q = '這個音節是活音節還是死音節？'; opts = [['live', '活音節'], ['dead', '死音節']]; }
    else if (step === 'vlen') { q = '母音是短音還是長音？'; opts = [['short', '短音'], ['long', '長音']]; }

    if (step === 'result') {
      var w2 = c.word.syls[0];
      var reason = buildToneReason({ th: full, tone_name: w2.tone_name, lead: w2.lead, cons: w2.cons });
      document.getElementById('mx-deriv').innerHTML =
        '<div class="bonus-section show">' +
          '<div class="bonus-header">結論：' + TONE_NUM_ZH[TONE_NAME_TO_NUM[w2.tone_name]] + ' (' + w2.tone_name + ')</div>' +
          (reason ? '<div class="bonus-reason show"><div class="bonus-reason-why">' + esc(reason) + '</div></div>' : '') +
          '<div class="opts-wrap" style="margin-top:8px"><div class="opts"><div class="opt" id="mx-deriv-done" style="font-size:16px;padding:8px 16px">懂了 →</div></div></div>' +
        '</div>';
      document.getElementById('mx-deriv-done').addEventListener('click', function () { answerCorrect(c); });
      return;
    }
    document.getElementById('mx-deriv').innerHTML =
      '<div class="bonus-section show">' +
        '<div class="bonus-header">' + q + '</div>' +
        '<div class="bonus-opts">' + opts.map(function (o) { return '<div class="bonus-btn" data-v="' + o[0] + '">' + o[1] + '</div>'; }).join('') + '</div>' +
      '</div>';
    document.getElementById('mx-deriv').querySelectorAll('.bonus-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (document.getElementById('mx-deriv').dataset.locked) return;
        document.getElementById('mx-deriv').dataset.locked = '1';
        derivClick(c, full, btn.dataset.v, btn);
      });
    });
  }

  function derivClick(c, full, val, btnEl) {
    var step = S.derivStep.part;
    var right = false, next = 'result';
    if (step === 'mark') {
      right = (val === 'yes') === TH_ENGINE.hasToneMark(full);
      next = TH_ENGINE.hasToneMark(full) ? 'class' : 'live';
    } else if (step === 'class') {
      var cls = TH_ENGINE.getInitClass(full); var e = (cls === 'lead') ? 'high' : cls;
      right = (val === e); next = 'result';
    } else if (step === 'live') {
      var live = TH_ENGINE.isLiveWord(full);
      right = (val === 'live') === live;
      var cls2 = TH_ENGINE.getInitClass(full); var e2 = (cls2 === 'lead') ? 'high' : cls2;
      next = live ? 'result' : (e2 === 'low' ? 'vlen' : 'result');
    } else if (step === 'vlen') {
      var vt = TH_ENGINE.getVowelType(full);
      var isShort = (vt === 'short') || (vt == null);
      right = (val === (isShort ? 'short' : 'long')); next = 'result';
    }
    btnEl.classList.add(right ? 'correct' : 'wrong');
    if (!right) { c.wrongCount++; if (c.wrongCount >= FAIL_AT) { finishCard(c, 0, true); return; } }
    S.derivStep = { part: next };
    setTimeout(function () { renderDeriv(c, full); }, 350);
  }

  // ════════════════════════════════════════════
  // ด่าน 2 — 拼字（子音／聲調符／母音／尾音）
  // ════════════════════════════════════════════
  function comps(syl) {
    var out = [];
    var consDisp = syl.lead ? syl.lead + syl.cons : (syl.cluster ? syl.cons + syl.cluster : syl.cons);
    out.push({ type: 'cons', label: '子音', val: syl.cons, disp: consDisp });
    if (syl.tone) out.push({ type: 'tone', label: '聲調符', val: syl.tone, disp: syl.tone });
    out.push({ type: 'vowel', label: '母音', val: syl.vowel, disp: syl.vowel });
    if (syl.final) out.push({ type: 'final', label: '尾音', val: syl.final, disp: syl.final });
    return out;
  }

  function stage2Html(w, syl) {
    var parts = comps(syl);
    var slots = parts.map(function (p) {
      return '<div class="slot-col"><div class="slot-label">' + p.label + '</div><div class="slot-box" data-type="' + p.type + '">◌</div></div>';
    }).join('');
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
    var i = 0;
    var pills = pool.map(function (o) {
      i++;
      return '<div class="opt" data-type="' + o.type + '" data-v="' + esc(o.v) + '" style="--delay:' + (i * 0.04) + 's">' + esc(o.disp) + '</div>';
    }).join('');
    return '<div class="slot-row">' + slots + '</div>' +
      '<div class="opts-wrap"><div class="opts">' + pills + '</div></div>' +
      '<div class="btn-row"><button class="btn btn-primary" id="mx-s2-check" disabled>檢查</button></div>';
  }

  function wireStage2(c) {
    var w = c.word, syl = w.syls[0], parts = comps(syl);
    var need = parts.length, filled = {};
    var slotEls = {};
    card.querySelectorAll('.slot-box').forEach(function (s) { slotEls[s.dataset.type] = s; });
    var checkBtn = document.getElementById('mx-s2-check');
    card.querySelectorAll('.opts .opt[data-type]').forEach(function (tile) {
      tile.addEventListener('click', function () {
        if (tile.classList.contains('locked')) return;
        var type = tile.dataset.type;
        if (filled[type]) return;
        filled[type] = tile.dataset.v;
        slotEls[type].textContent = tile.dataset.v;
        slotEls[type].classList.add('filled');
        tile.classList.add('locked', 'sel');
        if (Object.keys(filled).length === need) checkBtn.disabled = false;
      });
    });
    checkBtn.addEventListener('click', function () {
      if (S.resolving) return;
      checkBtn.disabled = true;
      var ok = parts.every(function (p) { return filled[p.type] === p.val; });
      if (ok) {
        parts.forEach(function (p) { slotEls[p.type].classList.add('correct'); });
        answerCorrect(c);
      } else {
        parts.forEach(function (p) { slotEls[p.type].classList.add(filled[p.type] === p.val ? 'correct' : 'wrong'); });
        requeueWrong(c);
      }
    });
  }

  // ════════════════════════════════════════════
  // ด่าน 3 — 打字（Kedmanee 泰文鍵盤）
  // ════════════════════════════════════════════
  function stage3Html(w, syl) {
    var rows = TK_ROWS.map(function (row) {
      return '<div class="tk-row">' + row.map(function (code) {
        return '<div class="tk-key" data-code="' + code + '"><span class="tk-base">' + esc(RG_BASE_MAP[code]) + '</span></div>';
      }).join('') + '</div>';
    }).join('');
    return '<div class="type-panel" style="display:flex">' +
      '<div class="type-target" id="mx-typetarget"></div>' +
      '<div class="tkbd" style="display:flex">' + rows + '</div>' +
    '</div>';
  }

  function paintType(c) {
    var target = c.word.syls[0].th;
    var html = '';
    for (var i = 0; i < target.length; i++) {
      var col = i < S.typePos ? '#2e7d32' : (i === S.typePos ? '#d85a30' : '#c9b98a');
      var deco = i === S.typePos ? 'border-bottom:3px solid #d85a30' : '';
      html += '<span style="color:' + col + ';' + deco + '">' + esc(target[i]) + '</span>';
    }
    document.getElementById('mx-typetarget').innerHTML = html;
    // Lin 2026-07-25: "เกมรวมไม่ต้องมีตัวใบ้เลย เล่นจริงอย่างเดียว" — เอาไฮไลต์ปุ่มถัดไปออก
    // (เดิมไฮไลต์ปุ่มที่ต้องกดต่อไปอัตโนมัติทุกครั้ง เท่ากับเปิด "โหมดมีตัวใบ้" ตลอดเวลาโดยไม่ได้ตั้งใจ
    // ต่างจากเกมพิมพ์เดิมที่ตัวใบ้เป็นโหมดแยก ปิดเป็นค่าเริ่มต้น) ผู้เล่นต้องจำตำแหน่งปุ่มเองจริงๆ
  }

  function wireStage3(c) {
    paintType(c);
    var target = c.word.syls[0].th;
    var targetEl = document.getElementById('mx-typetarget');
    function tryChar(ch) {
      if (S.resolving) return;
      if (ch === target[S.typePos]) {
        S.typePos++;
        if (S.typePos >= target.length) { answerCorrect(c); return; }
        paintType(c);
      } else {
        targetEl.classList.add('shake');
        setTimeout(function () { targetEl.classList.remove('shake'); }, 350);
        requeueWrong(c);
      }
    }
    card.querySelectorAll('.tk-key').forEach(function (k) {
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
    var perfectAll = S.perfectCount === S.total;
    card.innerHTML =
      '<div id="end" style="display:flex">' +
        '<h2>🎉 這輪結束了！</h2>' +
        '<div class="end-score-big">' + S.score + ' 分</div>' +
        '<div class="end-detail">' + S.perfectCount + '/' + S.total + ' 題全對零失誤' + (perfectAll ? ' · 完美！' : '') + '</div>' +
        '<button class="btn btn-primary" id="mx-again">🎲 再玩一次</button>' +
      '</div>';
    document.getElementById('mx-again').addEventListener('click', startRound);
  }

  window.MixGame = { mount: mount };
})();
