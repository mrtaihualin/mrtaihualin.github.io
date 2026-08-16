// listening-game-app.js — 泰語聽力練習室 (listening-game.html)
// FILE MAP: [01] display preferences → [02] DOM/utilities/pool → [03] mode + round flow → [04] answers/reveal → [05] results/init
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
    primaryTotal: 0,
    typingBonusTotal: 0,
    listenCount: 0,
    typingWrong: 0,
    roundActive: false,
    roundSeq: 0,
    savedRoundSeq: 0,
    listenToken: 0,
    answered: false,
    log: [],        // Phase F2/F4: ประวัติทุกข้อของรอบนี้ {th, zh, userAnswer, correct} — เติมทีละข้อ ไม่แตะ logic ตรวจคำตอบ
    _pendingResume: null // Phase E3: รอบที่กู้มาจาก GameResume แต่ผู้เล่นยังไม่กด 繼續練習/重新開始
  };

  var el = {};
  var listeningSrs = {};
  var listeningSrsSynced = false;

  // ===== LISTENING_SRS_RACE_GUARD_START =====
  function createListeningSrsRaceGuard(options) {
    var activeRequest = null;
    var requestSeq = 0;
    var startPending = false;
    var startSeq = 0;

    function sameOwner(expected) {
      var current = options.owner();
      return !!(expected && current &&
        current.uid === expected.uid && current.epoch === expected.epoch);
    }

    function sync(force) {
      if (!force && options.isSynced()) return Promise.resolve(true);
      var owner = options.owner();
      if (!owner || !owner.uid) return Promise.resolve(false);
      if (activeRequest && activeRequest.owner.uid === owner.uid && activeRequest.owner.epoch === owner.epoch) {
        return activeRequest.promise;
      }

      var request = { id: ++requestSeq, owner: owner, promise: null };
      request.promise = Promise.resolve().then(function () {
        return options.load(owner);
      }).then(function (res) {
        if (activeRequest !== request || !sameOwner(owner)) return false;
        if (!res || res.error || !Array.isArray(res.data)) return false;
        options.apply(res.data);
        options.setSynced(true);
        return true;
      }).catch(function () {
        return false;
      }).then(function (ok) {
        // A late request from an old owner must not clear the newer owner's request.
        if (activeRequest === request) activeRequest = null;
        return ok;
      });
      activeRequest = request;
      return request.promise;
    }

    function start(begin) {
      if (startPending || options.isRoundActive()) return Promise.resolve(false);
      startPending = true;
      var token = ++startSeq;
      var owner = options.owner();
      var wait = owner && owner.uid && !options.isSynced() ? sync(true) : Promise.resolve(true);

      function finish() {
        if (token !== startSeq) return false;
        startPending = false;
        if (!sameOwner(owner) || options.isRoundActive()) return false;
        begin();
        return true;
      }

      // Do not dead-end Start on a slow SRS read. The same-owner request may still
      // populate SRS for later rounds, but this race settles only once and cannot
      // start the current round again when that request eventually resolves.
      return Promise.race([wait, options.delay(1500)]).then(finish, finish);
    }

    function reset() {
      requestSeq++;
      activeRequest = null;
      options.setSynced(false);
      startSeq++;
      startPending = false;
    }

    return { sync: sync, start: start, reset: reset };
  }
  // ===== LISTENING_SRS_RACE_GUARD_END =====

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
    el.scoreCount = qs('lg-score');
    el.listenCount = qs('lg-listens');
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
    // Phase E3: guest resume banner
    el.resumeBanner = qs('lg-resume-banner');
    el.resumeDetail = qs('lg-resume-detail');
    el.resumeContinueBtn = qs('lg-resume-continue');
    el.resumeRestartBtn = qs('lg-resume-restart');
    el.resumeNewBtn = qs('lg-resume-new');
    // Phase F2: 查看錯題
    el.mistakeScreen = qs('lg-mistakes');
    el.mistakeList = qs('lg-mistake-list');
    el.mistakeBtn = qs('lg-mistake-btn');
    el.mistakeBackBtn = qs('lg-mistake-back');
    // Phase F3/F4: 列印／儲存學習紀錄
    el.printBtn = qs('lg-print-btn');
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

  function srsKey(word) { return (word && word.th || '') + '@' + levelNumber(word); }
  function taipeiDate(value) {
    var d = value == null ? new Date() : new Date(value);
    try { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(d); }
    catch (e) { return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  }
  function isSrsDue(word) {
    var rec = listeningSrs[srsKey(word)];
    return !!(rec && !rec.mastered && rec.dueDate && rec.dueDate <= taipeiDate());
  }

  function listeningOwnerSnapshot() {
    var user = window.READING_AUTH && READING_AUTH.user;
    return {
      uid: user && user.id || '',
      epoch: Number(window.SITE_AUTH && SITE_AUTH.learningOwnerEpoch) || 0
    };
  }

  function loadListeningSrs(owner) {
    var sb = window.getSupabaseClient ? window.getSupabaseClient() : null;
    if (!sb || !sb.from) return Promise.reject(new Error('SRS_CLIENT_UNAVAILABLE'));
    if (!window.NetworkGuard || typeof NetworkGuard.request !== 'function') {
      return Promise.reject(new Error('SRS_NETWORK_GUARD_UNAVAILABLE'));
    }
    return NetworkGuard.request(function () {
      return sb.from('tone_srs_state')
        .select('level, word, stage, due_date, ever_failed, mastered')
        .eq('game', 'listening')
        .eq('user_id', owner.uid);
    }, 'listening-srs', {}, 10000, null);
  }

  var listeningSrsGuard = createListeningSrsRaceGuard({
    owner: listeningOwnerSnapshot,
    isSynced: function () { return listeningSrsSynced; },
    setSynced: function (value) { listeningSrsSynced = !!value; },
    isRoundActive: function () { return state.roundActive; },
    load: loadListeningSrs,
    apply: function (rows) {
      var next = {};
      rows.forEach(function (row) {
        next[(row.word || '') + '@' + (row.level || 0)] = {
          stage: row.stage || 0, dueDate: row.due_date || '',
          everFailed: !!row.ever_failed, mastered: !!row.mastered
        };
      });
      listeningSrs = next;
    },
    delay: function (ms) {
      return new Promise(function (resolve) { setTimeout(resolve, ms); });
    }
  });
  var listeningSrsOwner = listeningOwnerSnapshot();

  function ensureListeningSrsOwner() {
    var nextOwner = listeningOwnerSnapshot();
    if (nextOwner.uid !== listeningSrsOwner.uid || nextOwner.epoch !== listeningSrsOwner.epoch) {
      listeningSrsOwner = nextOwner;
      listeningSrs = {};
      listeningSrsGuard.reset();
    }
    return nextOwner;
  }

  function syncListeningSrs(force) {
    ensureListeningSrsOwner();
    return listeningSrsGuard.sync(force);
  }

  function allocateListeningRound(pool, n) {
    if (!window.READING_AUTH || !READING_AUTH.user || !window.GameFlow || !GameFlow.allocateSrs) return sampleRound(pool, n);
    var due = shuffle(pool.filter(isSrsDue));
    var regular = shuffle(pool.filter(function (word) {
      var rec = listeningSrs[srsKey(word)];
      return !isSrsDue(word) && !(rec && rec.mastered);
    }));
    return GameFlow.allocateSrs({
      tier: 'free', total: Math.min(n, due.length + regular.length),
      due: due, regular: regular, idOf: srsKey, scope: 'listening'
    }).items;
  }

  function pickDistractors(correctWord, pool, n) {
    var others = pool.filter(function (w) { return w.th !== correctWord.th; });
    return shuffle(others).slice(0, Math.min(n, others.length));
  }

  // ── mode tabs ──
  function setMode(mode) {
    if (state.roundActive && mode !== state.mode) {
      try { alert('本回合模式已鎖定，完成後再切換模式'); } catch (e) {}
      return false;
    }
    state.mode = mode;
    Array.prototype.forEach.call(el.modeTabs, function (t) {
      t.classList.toggle('active', t.getAttribute('data-mode') === mode);
    });
    return true;
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
    ensureListeningSrsOwner();
    listeningSrsGuard.start(startRoundNow);
  }

  function startRoundNow() {
    state.pool = buildPool();
    if (!state.pool.length) {
      el.poolNote.textContent = '目前還沒有可以用的題目（缺少語音檔），麻煩告訴老師 Lin。';
      el.poolNote.style.display = 'block';
      return;
    }
    var n = Math.min(ROUND_SIZE, state.pool.length);
    state.round = allocateListeningRound(state.pool, n);
    state.idx = 0;
    state.correct = 0;
    state.wrong = 0;
    state.primaryTotal = 0;
    state.typingBonusTotal = 0;
    state.roundActive = true;
    state.roundSeq++;
    state.log = [];
    state._pendingResume = null;
    if (el.resumeBanner) el.resumeBanner.style.display = 'none';
    try { if (window.GameResume) window.GameResume.clear('listening-game'); } catch (e) {} // เริ่มรอบใหม่แบบสด = ล้างรอบค้างเก่าทิ้ง (ไม่ให้มีของค้าง 2 รอบชนกัน)

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
    if (el.scoreCount) el.scoreCount.textContent = '0';
    if (el.listenCount) el.listenCount.textContent = '0';

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

  function showQuestion(options) {
    if (window.GameFlow) window.GameFlow.cancel('listening-game');
    options = options || {};
    state.answered = false;
    if (!options.preserveAttempt) {
      state.listenCount = 0;
      state.typingWrong = 0;
    }
    state.listenToken++;
    var w = currentWord();

    el.qn.textContent = String(state.idx + 1);
    updateProgress();

    el.resultBanner.className = 'result-banner';
    el.resultBanner.textContent = '';
    el.reveal.className = 'lg-reveal';
    el.reveal.innerHTML = '';
    el.nextBtn.style.display = 'none';
    el.nextBtn.disabled = true;
    updateAttemptHud(w);

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
    if (!options.skipAutoPlay) playCurrent();
  }

  function thaiWordCount(text) {
    return window.LISTENING_SCORE ? LISTENING_SCORE.wordCount(text) : 1;
  }

  function listeningScore(mode, word, listens) {
    return window.LISTENING_SCORE ? LISTENING_SCORE.primary(mode, word && word.th, listens) : 0;
  }

  function typingUnitCount(word) {
    return window.LISTENING_SCORE ? LISTENING_SCORE.typingUnitCount(word) : thaiWordCount(word && word.th);
  }

  function typingBonus(word) {
    if (state.mode !== 'type') return 0;
    return window.LISTENING_SCORE ? LISTENING_SCORE.typingBonus(word, state.typingWrong) : 0;
  }

  function updateAttemptHud(word) {
    if (el.listenCount) el.listenCount.textContent = String(state.listenCount);
    if (el.scoreCount) el.scoreCount.textContent = String(state.primaryTotal + state.typingBonusTotal);
    var score = listeningScore(state.mode, word || currentWord(), state.listenCount || 1);
    if (el.soundBtn) el.soundBtn.title = '聽發音（本題聽力分數 ' + score + '）';
  }

  function playCurrent() {
    var w = currentWord();
    if (!window.WordAudio || !w || state.answered) return;
    var token = state.listenToken;
    state.listenCount++;
    updateAttemptHud(w);
    var played = window.WordAudio.play(w.th, el.soundBtn);
    Promise.resolve(played).then(function (ok) {
      if (token !== state.listenToken || state.answered) return;
      if (!ok) {
        state.listenCount = Math.max(0, state.listenCount - 1);
        updateAttemptHud(w);
        el.resultBanner.className = 'result-banner no show';
        el.resultBanner.textContent = '⚠️ 音檔播放失敗，這次不計入聆聽次數，請再試一次';
        return;
      }
      saveResumeState();
      if (listeningScore(state.mode, w, state.listenCount) === 0) finishListeningAtZero(w);
    });
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
    finishAnswer(isCorrect, correctWord, {
      userAnswer: choice.th,
      primaryScore: isCorrect ? listeningScore('mc', correctWord, state.listenCount) : 0,
      typingBonus: 0,
      requeue: !isCorrect
    });
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
    var isCorrect = val === w.th;
    if (!isCorrect) {
      state.typingWrong++;
      el.typeInput.classList.add('lg-wrong');
      el.resultBanner.className = 'result-banner no show';
      el.resultBanner.textContent = '差一點，再試一次就會更熟悉 🌱；繼續輸入到正確為止（Typing Bonus：' + typingBonus(w) + '）';
      setTimeout(function () {
        if (!el.typeInput || state.answered) return;
        el.typeInput.classList.remove('lg-wrong');
        el.typeInput.value = '';
        try { el.typeInput.focus({ preventScroll: true }); } catch (e) { try { el.typeInput.focus(); } catch (_) {} }
      }, 220);
      saveResumeState();
    } else {
      state.answered = true;
      el.typeInput.disabled = true;
      el.typeSubmitBtn.disabled = true;
      el.typeInput.classList.add('lg-correct');
      finishAnswer(true, w, {
        userAnswer: val,
        primaryScore: listeningScore('type', w, state.listenCount),
        typingBonus: typingBonus(w),
        requeue: false
      });
    }
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

  function levelNumber(word) {
    return ({ '初': 1, '中': 2, '高': 3 })[(word && word.level) || '初'] || 1;
  }

  function sendListeningSrs(word, primaryScore) {
    try {
      if (window.TONE_SERVER && TONE_SERVER.available()) {
        TONE_SERVER.finishRound({
          game: 'listening', word: word.th, level: levelNumber(word),
          clean: primaryScore === 10
        }).then(function (res) {
          if (res && res.ok) listeningSrsSynced = false;
          if (res && !res.ok && res.reason !== 'below_entry_score' && res.reason !== 'not_due' && window.console) {
            console.log('[listening-srs] server not-ok:', res.reason);
          }
        });
      }
    } catch (e) {}
  }

  function finishListeningAtZero(w) {
    if (state.answered) return;
    state.answered = true;
    if (state.mode === 'mc') {
      Array.prototype.forEach.call(el.mcWrap.querySelectorAll('.lg-opt'), function (b) {
        b.classList.add('locked');
        if (b.textContent === w.th) b.classList.add('correct');
      });
    } else {
      el.typeInput.disabled = true;
      el.typeSubmitBtn.disabled = true;
      el.typeInput.classList.add('lg-wrong');
    }
    finishAnswer(false, w, {
      userAnswer: '（聆聽次數已用完）', primaryScore: 0,
      typingBonus: state.mode === 'type' ? typingBonus(w) : 0,
      requeue: true,
      zeroByListening: true
    });
  }

  function finishAnswer(isCorrect, w, detail) {
    detail = detail || {};
    var existingSrs = listeningSrs[srsKey(w)] || {};
    if (isCorrect) state.correct++; else state.wrong++;
    var primary = Number(detail.primaryScore) || 0;
    var bonus = Number(detail.typingBonus) || 0;
    state.primaryTotal += primary;
    state.typingBonusTotal += bonus;
    state.log.push({
      th: w.th, zh: w.zh, userAnswer: detail.userAnswer || '', correct: isCorrect,
      mode: state.mode, listens: state.listenCount,
      listeningScore: primary, typingBonus: bonus, totalScore: primary + bonus,
      typingWrong: state.typingWrong,
      wordCount: LISTENING_SCORE.wordCount(w.th),
      unitCount: LISTENING_SCORE.typingUnitCount(w),
      srsDue: existingSrs.dueDate || '',
      reviewNeeded: isSrsDue(w),
      mastered: !!existingSrs.mastered
    });
    if (detail.requeue) {
      state.round.push(w);
      el.qt.textContent = String(state.round.length);
    }
    el.okCount.textContent = String(state.correct);
    el.badCount.textContent = String(state.wrong);
    updateAttemptHud(w);

    el.resultBanner.className = 'result-banner gsh-feedback-slot show ' + (isCorrect ? 'ok' : 'no');
    el.resultBanner.textContent = isCorrect
      ? ('✓ 做得很好！聽力 ' + primary + (state.mode === 'type' ? ' + Typing Bonus ' + bonus : ''))
      : ((detail.zeroByListening ? '這題先看答案' : '差一點，再記一次就會更熟') + '：正確答案是「' + w.th + '」；稍後會再出現 🌱');

    state.lastAnswered = w;
    el.reveal.classList.add('show');
    renderReveal();

    el.nextBtn.style.display = 'inline-flex';
    el.nextBtn.disabled = false;
    el.nextBtn.textContent = (state.idx + 1 >= state.round.length) ? '看結果 →' : '下一題 →';

    sendListeningSrs(w, primary);
    saveResumeState(); // Phase E3: กันหายถ้าปิดแท็บ/รีเฟรชก่อนกด 下一題
    if (window.GameFlow) window.GameFlow.start({ key: 'listening-game', nextButton: el.nextBtn, delaySeconds: 3 });
  }

  function goNext() {
    if (!state.answered) return; // กันกดข้ามก่อนตอบ (ปุ่มถูกซ่อนอยู่แล้ว แต่กันไว้อีกชั้น)
    state.idx++;
    if (state.idx >= state.round.length) {
      showEnd();
    } else {
      saveResumeState(); // Phase E3: บันทึกตำแหน่งข้อถัดไปที่ยังไม่ตอบ
      showQuestion();
    }
  }

  // ── Phase E3: guest resume (localStorage ผ่าน window.GameResume) ──
  // เก็บเฉพาะข้อมูลจริงที่ต้องใช้กู้รอบกลับมา ไม่แตะ logic การเล่น/ตรวจคำตอบเลย
  function saveResumeState() {
    try {
      if (!window.GameResume || !state.round.length) return;
      window.GameResume.save('listening-game', {
        mode: state.mode,
        wordIds: state.round.map(function (w) { return w.th; }),
        idx: state.idx,
        correct: state.correct,
        wrong: state.wrong,
        primaryTotal: state.primaryTotal,
        typingBonusTotal: state.typingBonusTotal,
        listenCount: state.listenCount,
        typingWrong: state.typingWrong,
        answered: state.answered,
        log: state.log
      });
    } catch (e) {}
  }

  // เอา wordIds ที่บันทึกไว้ กลับไปจับคู่กับ pool ปัจจุบันเป็นลำดับเดิม — ถ้าคำไหนหายไปจาก pool (เช่นเสียงถูกปิด) ให้ถือว่ากู้ไม่ได้ทั้งรอบ
  function rebuildRoundFromIds(wordIds, pool) {
    var byTh = {};
    pool.forEach(function (w) { byTh[w.th] = w; });
    var round = [];
    for (var i = 0; i < wordIds.length; i++) {
      if (byTh[wordIds[i]]) round.push(byTh[wordIds[i]]);
    }
    return round;
  }

  function tryShowResumeBanner() {
    if (!window.GameResume || !el.resumeBanner) return;
    var saved;
    try { saved = window.GameResume.load('listening-game'); } catch (e) { saved = null; }
    if (!saved || !saved.wordIds || !saved.wordIds.length) return;
    if (typeof saved.idx !== 'number' || saved.idx < 0 || saved.idx >= saved.wordIds.length) {
      try { window.GameResume.clear('listening-game'); } catch (e) {}
      return;
    }
    var pool = buildPool();
    var round = rebuildRoundFromIds(saved.wordIds, pool);
    if (round.length !== saved.wordIds.length) {
      // คำในรอบเดิมบางคำหายไปจาก pool แล้ว (เช่นเสียงถูกปิด) — กู้แบบเพี้ยนดีกว่าไม่กู้เลย ไม่คุ้ม ล้างทิ้ง
      try { window.GameResume.clear('listening-game'); } catch (e) {}
      return;
    }
    var resumeIdx = saved.answered ? saved.idx + 1 : saved.idx;
    state._pendingResume = {
      mode: saved.mode === 'type' ? 'type' : 'mc',
      round: round,
      idx: resumeIdx,
      completed: resumeIdx >= round.length,
      correct: typeof saved.correct === 'number' ? saved.correct : 0,
      wrong: typeof saved.wrong === 'number' ? saved.wrong : 0,
      primaryTotal: typeof saved.primaryTotal === 'number' ? saved.primaryTotal : 0,
      typingBonusTotal: typeof saved.typingBonusTotal === 'number' ? saved.typingBonusTotal : 0,
      listenCount: saved.answered ? 0 : (typeof saved.listenCount === 'number' ? saved.listenCount : 0),
      typingWrong: saved.answered ? 0 : (typeof saved.typingWrong === 'number' ? saved.typingWrong : 0),
      preserveAttempt: !saved.answered,
      log: Array.isArray(saved.log) ? saved.log : []
    };
    if (el.resumeDetail) {
      el.resumeDetail.textContent = '遊戲：聽力練習・模式：' + (state._pendingResume.mode === 'type' ? '輸入答案' : '選擇答案') +
        '・進度：' + (state._pendingResume.completed ? '本輪已答完，查看結果' : ('第 ' + (resumeIdx + 1) + '/' + saved.wordIds.length + ' 題'));
    }
    el.resumeBanner.style.display = 'block';
  }

  function resumeContinue() {
    var pend = state._pendingResume;
    el.resumeBanner.style.display = 'none';
    if (!pend) return;
    state.pool = buildPool();
    state.round = pend.round;
    state.idx = pend.idx;
    state.correct = pend.correct;
    state.wrong = pend.wrong;
    state.primaryTotal = pend.primaryTotal;
    state.typingBonusTotal = pend.typingBonusTotal;
    state.listenCount = pend.listenCount;
    state.typingWrong = pend.typingWrong;
    state.log = pend.log;
    state._pendingResume = null;
    setMode(pend.mode);
    state.roundActive = true;
    state.roundSeq++;

    el.poolNote.style.display = 'none';
    el.startScreen.style.display = 'none';
    el.endScreen.style.display = 'none';
    el.gameScreen.style.display = 'flex';
    el.qt.textContent = String(state.round.length);
    el.okCount.textContent = String(state.correct);
    el.badCount.textContent = String(state.wrong);
    updateAttemptHud(state.round[Math.min(state.idx, state.round.length - 1)]);

    try { if (window.gtag) gtag('event', 'listening_game_resume', { category: 'game', mode: pend.mode }); } catch (e) {}
    if (pend.completed) showEnd();
    else showQuestion({ preserveAttempt: pend.preserveAttempt, skipAutoPlay: pend.preserveAttempt });
  }

  function resumeRestart() {
    var pend = state._pendingResume;
    el.resumeBanner.style.display = 'none';
    state._pendingResume = null;
    try { if (window.GameResume) window.GameResume.clear('listening-game'); } catch (e) {}
    if (!pend) return;
    state.pool = buildPool(); state.round = pend.round; state.idx = 0; state.correct = 0; state.wrong = 0;
    state.primaryTotal = 0; state.typingBonusTotal = 0; state.listenCount = 0; state.typingWrong = 0; state.log = [];
    state.roundActive = true; state.roundSeq++; setMode(pend.mode);
    el.startScreen.style.display='none';el.endScreen.style.display='none';el.gameScreen.style.display='flex';el.qt.textContent=String(state.round.length);el.okCount.textContent='0';el.badCount.textContent='0';
    showQuestion();
    try { if (window.gtag) gtag('event', 'listening_game_resume_restart_same', { category: 'game' }); } catch (e) {}
  }

  function resumeNewRound() {
    el.resumeBanner.style.display='none';state._pendingResume=null;
    try { if (window.GameResume) window.GameResume.clear('listening-game'); } catch(e){}
    startRound();
  }

  function showEnd() {
    el.progFill.style.width = '100%';
    el.progTxt.textContent = state.round.length + '/' + state.round.length;
    el.gameScreen.style.display = 'none';
    el.endScreen.style.display = 'flex';
    if (window.GameFlow) window.GameFlow.markResult(el.endScreen);
    state.roundActive = false;
    var attempts = state.log.length;
    el.endScoreBig.textContent = (state.primaryTotal + state.typingBonusTotal) + ' 分';
    var pct = attempts ? Math.round((state.correct / attempts) * 100) : 0;
    el.endDetail.textContent = '聽力分數 ' + state.primaryTotal +
      (state.typingBonusTotal ? ' ＋ Typing Bonus ' + state.typingBonusTotal : '') +
      '・答對 ' + state.correct + ' 次，答錯 ' + state.wrong + ' 次（正確率 ' + pct + '%）';
    try { if (window.GameResume) window.GameResume.clear('listening-game'); } catch (e) {} // รอบจบแล้ว ไม่มีอะไรต้องกู้ต่อ
    try { if (window.gtag) gtag('event', 'listening_game_complete', { category: 'game', mode: state.mode, score: state.correct, total: state.round.length }); } catch (e) {}
    saveAccountRound();
    if(window.GameFlow){
      var _hl=[];
      try{if(window.READING_AUTH&&READING_AUTH.user&&window.GAME_ACCOUNT){var _gs=GAME_ACCOUNT.getStreak();if(_gs)_hl.push('🔥 連續 '+_gs+' 天');var _gb=GAME_ACCOUNT.earnedBadges();if(_gb.length)_hl.push('🎖️ '+_gb[_gb.length-1].zh);}}catch(e){}
      GameFlow.enhanceResult({key:'listening-result',root:el.endScreen,actions:el.endScreen.querySelector('.gsh-end-actions'),correct:state.correct,total:state.round.length,highlights:_hl,onReplay:startRound});
    }
  }

  function saveAccountRound() {
    if (state.savedRoundSeq === state.roundSeq) return;
    if (!window.READING_AUTH || !READING_AUTH.user || !READING_AUTH.saveScore) return;
    state.savedRoundSeq = state.roundSeq;
    var evidence = state.log.map(function (entry) {
      return {
        th: entry.th, zh: entry.zh, wrong: entry.correct ? 0 : 1,
        mode: entry.mode, listens: entry.listens,
        listening_score: entry.listeningScore,
        typing_bonus: entry.typingBonus,
        typing_wrong: entry.typingWrong
      };
    });
    READING_AUTH.saveScore(state.primaryTotal + state.typingBonusTotal, 1, 'listening', evidence, {
      difficulty: 'mixed',
      items: state.log.map(function (entry) {
        return {
          key: entry.th, points: entry.totalScore, wrong: entry.correct ? 0 : 1,
          guide: false, failed: false, mastered: false,
          mode: entry.mode, listens: entry.listens, correct: entry.correct,
          wordCount: entry.wordCount, unitCount: entry.unitCount, typingWrong: entry.typingWrong
        };
      }),
      roundBonus: 0, srsBonus: 0
    });
  }

  // ── Phase F2: 查看錯題 (read-only, ใช้ state.log ที่เก็บจริงระหว่างเล่นเท่านั้น) ──
  function renderMistakes() {
    if (!el.mistakeList) return;
    var wrongEntries = state.log.slice();
    if (!wrongEntries.length) {
      el.mistakeList.innerHTML = '<div style="text-align:center;font-family:\'Noto Sans TC\',sans-serif;font-size:13.5px;color:var(--ink-muted);padding:20px 10px;">這輪沒有作答紀錄</div>';
      return;
    }
    el.mistakeList.innerHTML = wrongEntries.map(function (e) {
      return '<div class="gsh-mistake-item gsh-mistake-wrong">'
        + '<div class="gsh-mistake-q">' + escapeHtml(e.th) + '</div>'
        + '<div class="gsh-mistake-row">你的答案：<b>' + escapeHtml(e.userAnswer || '（空白）') + '</b></div>'
        + '<div class="gsh-mistake-row">正確答案：<b>' + escapeHtml(e.th) + '</b></div>'
        + '<div class="gsh-mistake-row">意思：' + escapeHtml(e.zh || '') + '</div>'
        + '<div class="gsh-mistake-row">狀態：<b>' + (e.correct ? '✓ 答對' : '✗ 答錯') + '</b></div>'
        + '</div>';
    }).join('');
  }

  function showMistakes() {
    renderMistakes();
    el.endScreen.style.display = 'none';
    el.mistakeScreen.style.display = 'flex';
    try { if (window.gtag) gtag('event', 'listening_game_view_mistakes', { category: 'game', count: state.log.filter(function (e) { return !e.correct; }).length }); } catch (e) {}
  }

  function backToEndFromMistakes() {
    el.mistakeScreen.style.display = 'none';
    el.endScreen.style.display = 'flex';
  }

  // ── Phase F3/F4: 列印／儲存學習紀錄 — ก๊อปแพทเทิร์นเดียวกับเกมอื่น (window.open + document.write + print) ไม่ใช้ library ใดๆ ──
  function printListeningReport() {
    var SERIF = "'Noto Serif TC',serif";
    var SANS = "'Noto Sans TC',sans-serif";
    var today = new Date().toLocaleDateString('zh-TW');
    var pct = state.round.length ? Math.round((state.correct / state.round.length) * 100) : 0;
    var loggedIn = !!(window.READING_AUTH && READING_AUTH.user);

    var rows = state.log.map(function (e, i) {
      return '<tr>'
        + '<td style="padding:7px 6px;font-size:12px;color:#888;text-align:center;">' + (i + 1) + '</td>'
        + '<td style="padding:7px 6px;font-size:15px;font-weight:700;">' + escapeHtml(e.th) + '</td>'
        + '<td style="padding:7px 6px;font-size:12px;color:#666;">' + escapeHtml(e.zh || '') + '</td>'
        + '<td style="padding:7px 6px;font-size:13px;">作答：' + escapeHtml(e.userAnswer || '（空白）') + '<br>正解：' + escapeHtml(e.th) + '</td>'
        + '<td style="padding:7px 6px;font-size:12px;text-align:center;">' + (e.correct ? '<span style="color:#2e7d32;">✓ 答對</span>' : '<span style="color:#c62828;">✗ 答錯</span>') + '</td>'
        + (loggedIn ? '<td style="padding:7px 6px;font-size:11px;text-align:center;color:#8B6310;">' + (e.mastered ? '已精通' : (e.reviewNeeded ? '待複習' + (e.srsDue ? '<br>' + escapeHtml(e.srsDue) : '') : (escapeHtml(e.srsDue) || '—'))) + '</td>' : '')
        + '</tr>';
    }).join('');

    var innerHtml =
      '<div style="max-width:640px;margin:0 auto;padding:24px;background:#FBF5E7;box-sizing:border-box;font-family:' + SERIF + ';color:#1C1C1C;">'
      + '<div style="background:#fff;border:1px solid #C8973A;">'
      + '<table style="width:100%;background:#1C1C1C;border-bottom:3px solid #C8973A;border-collapse:collapse;"><tr>'
      + '<td style="padding:22px 26px;vertical-align:top;">'
      + '<div style="color:#fff;font-size:20px;font-weight:700;font-family:' + SERIF + ';">泰語聽力練習・本輪報告</div>'
      + '<div style="font-family:' + SANS + ';font-size:9px;letter-spacing:0.2em;color:#C8973A;font-weight:700;margin-top:6px;">mrtaihualin.com</div>'
      + '</td>'
      + '<td style="padding:22px 26px;vertical-align:top;text-align:right;color:#C8973A;white-space:nowrap;">'
      + '<div style="font-family:' + SANS + ';font-size:11px;">' + escapeHtml(today) + '</div>'
      + '<div style="font-family:' + SANS + ';font-size:11px;">' + (state.mode === 'type' ? '輸入答案' : '選擇答案') + '</div>'
      + '</td></tr></table>'
      + '<div style="padding:20px 26px;">'
      + '<table style="width:100%;font-family:' + SANS + ';font-size:12px;color:#8B6310;"><tr>'
      + '<td>答對題數</td><td style="text-align:right;font-size:20px;font-weight:700;color:#5a3e0a;">' + state.correct + ' / ' + state.round.length + '</td>'
      + '</tr><tr><td>正確率</td><td style="text-align:right;">' + pct + '%</td></tr></table>'
      + '<hr style="border:none;border-top:1px solid rgba(139,99,16,0.2);margin:14px 0;">'
      + '<table style="width:100%;border-collapse:collapse;"><thead><tr style="border-bottom:1.5px solid #C8973A;">'
      + '<th style="font-size:11px;color:#8B6310;padding:5px;">#</th>'
      + '<th style="font-size:11px;color:#8B6310;padding:5px;text-align:left;">正確答案</th>'
      + '<th style="font-size:11px;color:#8B6310;padding:5px;text-align:left;">意思</th>'
      + '<th style="font-size:11px;color:#8B6310;padding:5px;text-align:left;">你的答案</th>'
      + '<th style="font-size:11px;color:#8B6310;padding:5px;">結果</th>'
      + (loggedIn ? '<th style="font-size:11px;color:#8B6310;padding:5px;">複習狀態</th>' : '')
      + '</tr></thead><tbody>' + rows + '</tbody></table>'
      + '</div></div>'
      + '<div style="text-align:center;font-family:' + SANS + ';font-size:9.5px;letter-spacing:0.15em;color:#8B6310;padding:16px 26px 4px;">泰華眼裡的泰語教學　·　mrtaihualin.com</div>'
      + '</div>';

    var win = window.open('', '_blank');
    if (!win) {
      try { alert('請允許彈出視窗才能列印／儲存學習紀錄 🙏'); } catch (e2) {}
      return;
    }
    win.document.open();
    win.document.write(
      '<!DOCTYPE html><html lang="zh-TW"><head><meta charset="utf-8"><title>聽力練習紀錄</title>'
      + '<link href="https://fonts.googleapis.com/css2?family=Noto+Serif+TC:wght@400;700;900&family=Noto+Sans+TC:wght@400;700&display=swap" rel="stylesheet">'
      + '<style>@page{margin:10mm;}body{margin:0;background:#fff;}</style>'
      + '</head><body>' + innerHtml + '</body></html>'
    );
    win.document.close();
    win.focus();
    setTimeout(function () { try { win.print(); } catch (e) {} }, 600);
    try { if (window.gtag) gtag('event', 'listening_game_print_report', { category: 'game' }); } catch (e) {}
  }

  function restart() {
    state.roundActive = false;
    el.endScreen.style.display = 'none';
    el.gameScreen.style.display = 'none';
    el.startScreen.style.display = 'flex';
    try { if (window.GameResume) window.GameResume.clear('listening-game'); } catch (e) {} // เผื่อกดจากทางอื่นในอนาคต ล้างซ้ำไว้ก็ไม่มีผลเสีย
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
    if (el.resumeContinueBtn) el.resumeContinueBtn.addEventListener('click', resumeContinue);
    if (el.resumeRestartBtn) el.resumeRestartBtn.addEventListener('click', resumeRestart);
    if (el.resumeNewBtn) el.resumeNewBtn.addEventListener('click', resumeNewRound);
    if (el.mistakeBtn) el.mistakeBtn.addEventListener('click', showMistakes);
    if (el.mistakeBackBtn) el.mistakeBackBtn.addEventListener('click', backToEndFromMistakes);
    if (el.printBtn) el.printBtn.addEventListener('click', printListeningReport);

    if (window.SITE_AUTH && SITE_AUTH.onChange) {
      SITE_AUTH.onChange(function () {
        var nextOwner = ensureListeningSrsOwner();
        if (nextOwner.uid && !listeningSrsSynced) syncListeningSrs(true);
      });
    }

    tryShowResumeBanner(); // Phase E3: เช็คตอนเปิดหน้าครั้งเดียว ก่อนผู้เล่นกดอะไรทั้งนั้น
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
