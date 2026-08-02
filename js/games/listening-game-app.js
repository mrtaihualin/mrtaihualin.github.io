// listening-game-app.js — 泰語聽力練習室 (listening-game.html)
// สร้าง 2026-08-02 · เกมที่ 6 ของเว็บ: ฟังเสียงคำศัพท์จริง (WordAudio) แล้วเลือก/พิมพ์คำตอบ
// กติกาสำคัญ: ใช้เฉพาะคำใน WORDS_MASTER ที่ "มีไฟล์เสียงจริงอยู่แล้ว" (WordAudio.has()) เท่านั้น
// ห้ามใช้เสียงสังเคราะห์ของเบราว์เซอร์เด็ดขาด (เว็บปิดฟีเจอร์นี้ถาวรตามคำสั่ง Lin 2026-06-18) — ใช้ไฟล์เสียงจริงผ่าน WordAudio เท่านั้น
// ห้ามแต่ง/เพิ่มคำศัพท์เอง — วัตถุดิบทุกคำมาจาก data/words-data.js (WORDS_MASTER) ที่ Lin เป็นคนกรอกเท่านั้น (กฎ 16)
(function () {
  'use strict';

  var ROUND_SIZE = 10;
  var MC_CHOICES = 4;

  // ── 讀音／英文讀音／字體 — ใช้ localStorage คีย์เดียวกับเกมอ่าน/เกมพิมพ์ (ตั้งครั้งเดียวใช้ได้ทุกเกม) ──
  var rgPronMode = (function () { try { return localStorage.getItem('rg_pron_mode') === '1'; } catch (e) { return false; } })();
  var rgEnMode = (function () { try { return localStorage.getItem('rg_en_mode') === '1'; } catch (e) { return false; } })();

  function setRgPronMode(on) {
    rgPronMode = !!on;
    try { localStorage.setItem('rg_pron_mode', rgPronMode ? '1' : '0'); } catch (e) {}
    var btn = document.getElementById('lg-pron-toggle');
    if (btn) {
      btn.textContent = rgPronMode ? '🐣' : '🥚';
      btn.title = rgPronMode ? '目前：讀音已顯示（點擊隱藏）' : '目前：讀音已隱藏（點擊顯示）';
    }
    renderReveal();
  }
  function setRgEnMode(on) {
    rgEnMode = !!on;
    try { localStorage.setItem('rg_en_mode', rgEnMode ? '1' : '0'); } catch (e) {}
    var btn = document.getElementById('lg-en-toggle');
    if (btn) {
      btn.textContent = rgEnMode ? '🔡' : '🔠';
      btn.title = rgEnMode ? '目前：英文讀音已顯示（點擊隱藏）' : '目前：英文讀音已隱藏（點擊顯示）';
    }
    renderReveal();
  }
  // ── ฟ้อนต์โมเดิร์น (เหมือนเกมอ่าน/เกมพิมพ์) — shared.js เรียกฟังก์ชันนี้เองผ่านปุ่มใน #font-toggle-slot ──
  window.rgToggleFont = function () {
    var on = document.body.classList.toggle('rg-modern-font');
    try { localStorage.setItem('rg_modern_font', on ? '1' : '0'); } catch (e) {}
    try { if (window.gtag) gtag('event', 'listening_game_font_toggle', { category: 'game', on: on }); } catch (e) {}
  };
  (function () { try { if (localStorage.getItem('rg_modern_font') === '1') document.body.classList.add('rg-modern-font'); } catch (e) {} })();

  var state = {
    mode: 'mc',     // 'mc' = 選擇答案 · 'type' = 輸入答案
    pool: [],       // คำทั้งหมดที่มีเสียงจริง (buildWordsForPhonicsGames shape: .th/.zh/.en/.level/.readingTH)
    round: [],      // 10 คำที่สุ่มมาใช้ในรอบนี้
    idx: 0,
    correct: 0,
    wrong: 0,
    answered: false
  };

  var el = {};

  function qs(id) { return document.getElementById(id); }

  function cacheEls() {
    el.startScreen = qs('lg-start');
    el.gameScreen = qs('lg-game');
    el.endScreen = qs('lg-end');
    el.modeTabs = document.querySelectorAll('.mtab');
    el.startBtn = qs('lg-start-btn');
    el.poolNote = qs('lg-pool-note');
    el.qn = qs('lg-qn');
    el.qt = qs('lg-qt');
    el.okCount = qs('lg-ok');
    el.badCount = qs('lg-bad');
    el.progFill = qs('lg-prog-fill');
    el.progTxt = qs('lg-prog-txt');
    el.soundBtn = qs('lg-sound-btn');
    el.mcWrap = qs('lg-mc-wrap');
    el.typeWrap = qs('lg-type-wrap');
    el.typeInput = qs('lg-type-input');
    el.typeSubmitBtn = qs('lg-type-submit');
    el.resultBanner = qs('lg-result-banner');
    el.reveal = qs('lg-reveal');
    el.nextBtn = qs('lg-next-btn');
    el.endScoreBig = qs('lg-end-score');
    el.endDetail = qs('lg-end-detail');
    el.restartBtns = document.querySelectorAll('.lg-restart-btn');
    el.pronToggle = qs('lg-pron-toggle');
    el.enToggle = qs('lg-en-toggle');
    el.vaultSlot = qs('rg-vault-btn-slot');
  }

  // ── util ──
  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // ── pool / round ──
  function buildPool() {
    if (!window.WORDS_MASTER || !window.buildWordsForPhonicsGames || !window.WordAudio) return [];
    var words = window.buildWordsForPhonicsGames(window.WORDS_MASTER);
    return words.filter(function (w) {
      return w && w.th && window.WordAudio.has(w.th);
    });
  }

  function sampleRound(pool, n) {
    return shuffle(pool).slice(0, Math.min(n, pool.length));
  }

  function pickDistractors(correctWord, pool, n) {
    var others = pool.filter(function (w) { return w.th !== correctWord.th; });
    return shuffle(others).slice(0, Math.min(n, others.length));
  }

  // ── mode tabs ──
  function setMode(mode) {
    state.mode = mode;
    Array.prototype.forEach.call(el.modeTabs, function (t) {
      t.classList.toggle('active', t.getAttribute('data-mode') === mode);
    });
  }

  function initModeTabs() {
    Array.prototype.forEach.call(el.modeTabs, function (t) {
      t.addEventListener('click', function () {
        setMode(t.getAttribute('data-mode'));
        try { if (window.gtag) gtag('event', 'listening_game_mode_switch', { category: 'game', mode: t.getAttribute('data-mode') }); } catch (e) {}
      });
    });
  }

  // ── round flow ──
  function startRound() {
    state.pool = buildPool();
    if (!state.pool.length) {
      el.poolNote.textContent = '目前還沒有可以用的題目（缺少語音檔），麻煩告訴老師 Lin。';
      el.poolNote.style.display = 'block';
      return;
    }
    var n = Math.min(ROUND_SIZE, state.pool.length);
    state.round = sampleRound(state.pool, n);
    state.idx = 0;
    state.correct = 0;
    state.wrong = 0;

    if (state.pool.length < ROUND_SIZE) {
      el.poolNote.textContent = '目前題庫只有 ' + state.pool.length + ' 題有發音，一樣可以開始！';
      el.poolNote.style.display = 'block';
    } else {
      el.poolNote.style.display = 'none';
    }

    el.startScreen.style.display = 'none';
    el.endScreen.style.display = 'none';
    el.gameScreen.style.display = 'flex';
    el.qt.textContent = String(n);
    el.okCount.textContent = '0';
    el.badCount.textContent = '0';

    try { if (window.gtag) gtag('event', 'listening_game_start', { category: 'game', mode: state.mode, pool_size: state.pool.length }); } catch (e) {}

    showQuestion();
  }

  function currentWord() {
    return state.round[state.idx];
  }

  function updateProgress() {
    var n = state.round.length;
    var doneCount = state.idx; // จำนวนข้อที่ทำเสร็จแล้วก่อนข้อนี้
    var pct = n ? Math.round((doneCount / n) * 100) : 0;
    el.progFill.style.width = pct + '%';
    el.progTxt.textContent = doneCount + '/' + n;
  }

  function showQuestion() {
    state.answered = false;
    var w = currentWord();

    el.qn.textContent = String(state.idx + 1);
    updateProgress();

    el.resultBanner.className = 'result-banner';
    el.resultBanner.textContent = '';
    el.reveal.className = 'lg-reveal';
    el.reveal.innerHTML = '';
    el.nextBtn.style.display = 'none';
    el.nextBtn.disabled = true;

    if (window.WordAudio) window.WordAudio.setCurrent(w.th);

    // vault save button (🔖) — เปลี่ยนทุกคำ เหมือนเกมอ่าน/เกมพิมพ์
    if (el.vaultSlot && window.WordVault) {
      WordVault.injectStyles();
      el.vaultSlot.innerHTML = '';
      el.vaultSlot.appendChild(WordVault.createSaveBtn(w.th, { zh: w.zh, en: w.en, source: 'listening-game' }, {
        onSave: function () { try { if (window.gtag) gtag('event', 'listening_game_vault_save', { category: 'game', word: w.th }); } catch (e) {} },
        onRemove: function () { try { if (window.gtag) gtag('event', 'listening_game_vault_remove', { category: 'game', word: w.th }); } catch (e) {} }
      }));
    }

    if (state.mode === 'mc') {
      el.mcWrap.style.display = 'flex';
      el.typeWrap.style.display = 'none';
      renderMC(w);
    } else {
      el.mcWrap.style.display = 'none';
      el.typeWrap.style.display = 'flex';
      el.typeInput.value = '';
      el.typeInput.disabled = false;
      el.typeInput.className = 'lg-type-input';
      el.typeSubmitBtn.disabled = false;
      setTimeout(function () {
        try { el.typeInput.focus({ preventScroll: true }); } catch (e) { try { el.typeInput.focus(); } catch (e2) {} }
      }, 60);
    }

    // เล่นเสียงทันที — เรียกอยู่ในสายเดียวกับ click ของปุ่ม 開始/下一題 (user gesture) กัน browser บล็อก autoplay
    playCurrent();
  }

  function playCurrent() {
    var w = currentWord();
    if (window.WordAudio && w) window.WordAudio.play(w.th, el.soundBtn);
  }

  function renderMC(w) {
    el.mcWrap.innerHTML = '';
    var distractors = pickDistractors(w, state.pool, MC_CHOICES - 1);
    var choices = shuffle([w].concat(distractors));
    choices.forEach(function (choice) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'lg-opt';
      btn.textContent = choice.th;
      btn.addEventListener('click', function () {
        if (state.answered) return;
        handleMCPick(choice, btn, w);
      });
      el.mcWrap.appendChild(btn);
    });
  }

  function handleMCPick(choice, btn, correctWord) {
    state.answered = true;
    var isCorrect = choice.th === correctWord.th;
    Array.prototype.forEach.call(el.mcWrap.querySelectorAll('.lg-opt'), function (b) {
      b.classList.add('locked');
      if (b.textContent === correctWord.th) b.classList.add('correct');
    });
    if (!isCorrect) btn.classList.add('wrong');
    finishAnswer(isCorrect, correctWord);
    try { if (window.gtag) gtag('event', 'listening_game_answer', { category: 'game', mode: 'mc', correct: isCorrect }); } catch (e) {}
  }

  function initTypeMode() {
    el.typeSubmitBtn.addEventListener('click', submitTypeAnswer);
    el.typeInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation(); // กันไม่ให้ Enter ตัวเดียวกันนี้ไหลต่อไปโดน listener ของ 下一題 (ดูฟังก์ชัน initNextKey)
        submitTypeAnswer();
      }
    });
  }

  // กด Enter = 下一題／看結果 — ใช้ได้ทั้ง 2 โหมด หลังตอบแล้วเท่านั้น (ปุ่มถูกซ่อน/disabled อยู่ก่อนตอบ)
  function initNextKey() {
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      if (el.nextBtn && el.nextBtn.style.display !== 'none' && !el.nextBtn.disabled) {
        e.preventDefault();
        goNext();
      }
    });
  }

  function submitTypeAnswer() {
    if (state.answered) return;
    var w = currentWord();
    var val = (el.typeInput.value || '').trim();
    if (!val) return;
    state.answered = true;
    var isCorrect = val === w.th;
    el.typeInput.disabled = true;
    el.typeSubmitBtn.disabled = true;
    el.typeInput.classList.add(isCorrect ? 'lg-correct' : 'lg-wrong');
    finishAnswer(isCorrect, w);
    try { if (window.gtag) gtag('event', 'listening_game_answer', { category: 'game', mode: 'type', correct: isCorrect }); } catch (e) {}
  }

  // สร้างกล่องเฉลย — เรียกได้ 2 ที่: ตอนตอบเสร็จ (finishAnswer) และตอนกดสลับ 讀音/英文讀音 ระหว่างที่เฉลยเปิดอยู่
  function renderReveal() {
    if (!state.answered || !el.reveal.classList.contains('show')) return;
    var w = state.lastAnswered;
    if (!w) return;
    var readingTxt = w.readingTH || w.th;
    var html = '<div class="lg-rev-th">' + escapeHtml(w.th) + '</div>';
    if (rgPronMode) html += '<div class="lg-rev-pron">讀音：' + escapeHtml(readingTxt) + '</div>';
    if (rgEnMode && w.en) html += '<div class="lg-rev-en">英文讀音：' + escapeHtml(w.en) + '</div>';
    html += '<div class="lg-rev-zh">意思：' + escapeHtml(w.zh || '') + '</div>';
    el.reveal.innerHTML = html;
  }

  function finishAnswer(isCorrect, w) {
    if (isCorrect) state.correct++; else state.wrong++;
    el.okCount.textContent = String(state.correct);
    el.badCount.textContent = String(state.wrong);

    el.resultBanner.classList.add('show', isCorrect ? 'ok' : 'no');
    el.resultBanner.textContent = isCorrect ? '✓ 答對了！' : ('✗ 答錯了，正確答案是「' + w.th + '」');

    state.lastAnswered = w;
    el.reveal.classList.add('show');
    renderReveal();

    el.nextBtn.style.display = 'inline-flex';
    el.nextBtn.disabled = false;
    el.nextBtn.textContent = (state.idx + 1 >= state.round.length) ? '看結果 →' : '下一題 →';
  }

  function goNext() {
    if (!state.answered) return; // กันกดข้ามก่อนตอบ (ปุ่มถูกซ่อนอยู่แล้ว แต่กันไว้อีกชั้น)
    state.idx++;
    if (state.idx >= state.round.length) {
      showEnd();
    } else {
      showQuestion();
    }
  }

  function showEnd() {
    el.progFill.style.width = '100%';
    el.progTxt.textContent = state.round.length + '/' + state.round.length;
    el.gameScreen.style.display = 'none';
    el.endScreen.style.display = 'flex';
    el.endScoreBig.textContent = state.correct + ' / ' + state.round.length;
    var pct = state.round.length ? Math.round((state.correct / state.round.length) * 100) : 0;
    el.endDetail.textContent = '答對 ' + state.correct + ' 題，答錯 ' + state.wrong + ' 題（正確率 ' + pct + '%）';
    try { if (window.gtag) gtag('event', 'listening_game_complete', { category: 'game', mode: state.mode, score: state.correct, total: state.round.length }); } catch (e) {}
  }

  function restart() {
    el.endScreen.style.display = 'none';
    el.gameScreen.style.display = 'none';
    el.startScreen.style.display = 'flex';
    try { if (window.gtag) gtag('event', 'listening_game_restart_click', { category: 'game' }); } catch (e) {}
  }

  function init() {
    cacheEls();
    if (!el.startScreen) return; // กันพังถ้า DOM ไม่ครบ
    initModeTabs();
    setMode('mc');
    initTypeMode();
    initNextKey();
    el.startBtn.addEventListener('click', startRound);
    el.nextBtn.addEventListener('click', goNext);
    Array.prototype.forEach.call(el.restartBtns, function (b) { b.addEventListener('click', restart); });
    if (el.soundBtn) {
      el.soundBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        playCurrent();
      });
    }
    if (el.pronToggle) {
      setRgPronMode(rgPronMode); // ตั้งไอคอนปุ่มตามค่าที่จำไว้ ตั้งแต่โหลดหน้า
      el.pronToggle.addEventListener('click', function (e) {
        e.stopPropagation();
        setRgPronMode(!rgPronMode);
        try { if (window.gtag) gtag('event', 'listening_game_pron_toggle', { category: 'game', on: rgPronMode }); } catch (err) {}
      });
    }
    if (el.enToggle) {
      setRgEnMode(rgEnMode);
      el.enToggle.addEventListener('click', function (e) {
        e.stopPropagation();
        setRgEnMode(!rgEnMode);
        try { if (window.gtag) gtag('event', 'listening_game_en_pron_toggle', { category: 'game', on: rgEnMode }); } catch (err) {}
      });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
