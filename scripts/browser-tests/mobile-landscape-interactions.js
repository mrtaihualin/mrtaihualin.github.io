(function () {
  'use strict';

  var frame = document.getElementById('game-frame');
  var status = document.getElementById('status');
  var results = document.getElementById('results');
  var checks = 0;
  var lines = [];

  localStorage.setItem('cookieConsent', 'denied');
  ['tone', 'reading', 'typing', 'wordorder'].forEach(function (game) {
    localStorage.setItem('howto_tour_seen_' + game, '1');
    localStorage.setItem('howto_hint_seen_' + game, '1');
  });

  function pass(message) {
    checks += 1;
    lines.push('PASS ' + message);
    results.textContent = lines.join('\n');
  }

  function assert(condition, message) {
    if (!condition) throw new Error(message);
    pass(message);
  }

  function wait(ms) { return new Promise(function (resolve) { setTimeout(resolve, ms); }); }

  async function waitFor(predicate, message, timeout) {
    var started = Date.now();
    while (Date.now() - started < (timeout || 20000)) {
      try { if (predicate()) return; } catch (ignore) {}
      await wait(50);
    }
    throw new Error('timeout: ' + message);
  }

  function shown(win, node) {
    if (!node || node.hidden) return false;
    var style = win.getComputedStyle(node);
    var rect = node.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
  }

  function rect(node) {
    var value = node.getBoundingClientRect();
    return { left: value.left, top: value.top, right: value.right, bottom: value.bottom, width: value.width, height: value.height };
  }

  function inside(inner, outer, tolerance) {
    tolerance = tolerance || 1;
    return inner.left >= outer.left - tolerance && inner.right <= outer.right + tolerance &&
      inner.top >= outer.top - tolerance && inner.bottom <= outer.bottom + tolerance;
  }

  function intersects(a, b, tolerance) {
    tolerance = tolerance || 0;
    return a.left < b.right - tolerance && a.right > b.left + tolerance &&
      a.top < b.bottom - tolerance && a.bottom > b.top + tolerance;
  }

  function sameRect(a, b, tolerance) {
    tolerance = tolerance || 1;
    return Math.abs(a.left - b.left) <= tolerance && Math.abs(a.top - b.top) <= tolerance &&
      Math.abs(a.width - b.width) <= tolerance && Math.abs(a.height - b.height) <= tolerance;
  }

  function visiblePositionTwo(win, doc) {
    return Array.prototype.slice.call(doc.querySelectorAll('[data-gsh-ml-position="2"]')).filter(function (node) {
      return shown(win, node);
    });
  }

  function reservedPositionTwoRect(win, doc) {
    var right = doc.querySelector('[data-gsh-ml-slot="right"]');
    var rightRect = rect(right);
    var rightStyle = win.getComputedStyle(right);
    var size = parseFloat(rightStyle.gridTemplateRows) || 76;
    var gap = parseFloat(rightStyle.rowGap) || 4;
    var stackHeight = size * 3 + gap * 2;
    var top = rightRect.top + Math.max(0, (rightRect.height - stackHeight) / 2) + 2 * (size + gap);
    return { left: rightRect.left, right: rightRect.right, top: top, bottom: top + size, width: rightRect.width, height: size };
  }

  function assertPositionTwo(win, doc, expectedText) {
    var actions = visiblePositionTwo(win, doc);
    assert(actions.length <= 1, 'Position 2 exposes at most one visible action');
    if (expectedText) {
      assert(actions.length === 1, 'Position 2 exposes the required action');
      assert(actions[0].textContent.replace(/\s+/g, '') === expectedText, 'Position 2 label is ' + expectedText);
    }
    return actions[0] || null;
  }

  function assertSideGeometry(win, doc, selector) {
    var left = rect(doc.querySelector('[data-gsh-ml-slot="left"]'));
    var center = rect(doc.querySelector('[data-gsh-ml-slot="center"]'));
    var right = rect(doc.querySelector('[data-gsh-ml-slot="right"]'));
    var reserved = reservedPositionTwoRect(win, doc);
    var options = Array.prototype.slice.call(doc.querySelectorAll(selector)).filter(function (node) {
      return shown(win, node) && !node.classList.contains('used');
    });
    assert(options.length > 0, selector + ' has rendered options');
    options.forEach(function (node) {
      var box = rect(node);
      var owner = node.dataset.gshSide === 'left' ? left : right;
      assert(inside(box, owner), selector + ' option stays inside its ' + node.dataset.gshSide + ' frame');
      assert(!intersects(box, center), selector + ' option does not enter the center frame');
      if (node.dataset.gshSide === 'right' && node.getAttribute('data-gsh-ml-position') !== '2') {
        assert(!intersects(box, reserved, 1), selector + ' option does not intersect reserved Position 2');
      }
    });
    return options;
  }

  function clickByText(doc, text) {
    var button = Array.prototype.slice.call(doc.querySelectorAll('button')).filter(function (node) {
      return node.textContent.replace(/\s+/g, '').indexOf(text) >= 0;
    })[0];
    if (button) button.click();
    return button;
  }

  async function closeGameplayBlockers(win, doc) {
    var resume = Array.prototype.slice.call(doc.querySelectorAll('button')).filter(function (node) {
      return shown(win, node) && node.textContent.indexOf('開始新一輪') >= 0;
    })[0];
    if (resume) { resume.click(); await wait(120); }
    var tour = Array.prototype.slice.call(doc.querySelectorAll('button')).filter(function (node) {
      return shown(win, node) && node.textContent.indexOf('跳過導覽') >= 0;
    })[0];
    if (tour) { tour.click(); await wait(120); }
    var cookie = doc.getElementById('cookie-consent-banner');
    assert(!cookie || !shown(win, cookie), 'Cookie consent does not block gameplay during QA');
    var visibleTour = doc.getElementById('gt-tour-card');
    assert(!visibleTour || !shown(win, visibleTour), 'Tutorial does not block gameplay during QA');
    var resumeBanner = doc.querySelector('.gsh-resume-banner');
    assert(!resumeBanner || !shown(win, resumeBanner), 'Resume prompt does not block gameplay after QA closes it');
  }

  function showResumeFixture(win, doc, file) {
    var banner = doc.querySelector('.gsh-resume-banner');
    if (file === 'tone-finder.html' && typeof win.tfShowResumeBannerIfAny === 'function') {
      win.tfShowResumeBannerIfAny({ level: 1, wordIds: ['กิน'], index: 0, total: 5 });
      banner = doc.querySelector('.gsh-resume-banner');
    } else if (banner) {
      var detail = banner.querySelector('.gsh-resume-detail');
      if (detail && !detail.textContent.trim()) detail.textContent = '上次進度：練習・初級・第 1/5 題';
      banner.style.display = 'block';
    }
    return banner;
  }

  async function testResumeScreen(file, width, height) {
    frame.style.width = width + 'px';
    frame.style.height = height + 'px';
    var nonce = Date.now() + '-' + Math.random().toString(16).slice(2);
    if (file === 'listening-game.html') {
      frame.srcdoc = '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">' +
        '<link rel="stylesheet" href="../../css/mobile-landscape.css?v=34"></head>' +
        '<body data-gsh-game="listening" class="gsh-ml-active"><div id="gsh-ml-stage" data-gsh-ml-view="resume">' +
        '<div class="gsh-ml-exclusive"><div data-gsh-ml-slot="exclusive-left"></div>' +
        '<div data-gsh-ml-slot="exclusive-center"><div class="gsh-resume-banner">' +
        '<div class="gsh-resume-title">上次的安全進度還在</div><div class="gsh-resume-detail">上次進度：聽力練習・初級・第 1/5 題</div>' +
        '<div class="gsh-resume-actions"><button>繼續上次練習</button><button>重新開始本次練習</button><button>開始新一輪</button></div>' +
        '</div></div><div data-gsh-ml-slot="exclusive-right"></div></div></div></body></html>';
    } else {
      frame.removeAttribute('srcdoc');
      frame.src = '../../' + file + '?ml52-resume-test=' + nonce;
    }
    await new Promise(function (resolve, reject) {
      var timer = setTimeout(function () { reject(new Error('resume load timeout: ' + file)); }, 20000);
      frame.onload = function () { clearTimeout(timer); resolve(); };
    });
    var win = frame.contentWindow;
    var doc = frame.contentDocument;
    var runtimeErrors = [];
    win.addEventListener('error', function (event) {
      runtimeErrors.push(String(event.message || event.error || 'unknown runtime error'));
    }, true);
    await waitFor(function () {
      return doc.body.classList.contains('gsh-ml-active') && doc.getElementById('gsh-ml-stage') &&
        (file === 'listening-game.html' || file === 'lego.html' || doc.documentElement.classList.contains('gc-ready'));
    }, file + ' Resume ready', 25000);

    var banner = showResumeFixture(win, doc, file);
    await waitFor(function () {
      return banner && shown(win, banner) && doc.getElementById('gsh-ml-stage').dataset.gshMlView === 'resume';
    }, file + ' Resume view', 5000);
    var bannerRect = rect(banner);
    assert(Math.abs(bannerRect.width - 640) <= 2, file + ' Resume card is 640px at ' + width + 'x' + height);
    assert(Math.abs((bannerRect.left + bannerRect.right) / 2 - width / 2) <= 2, file + ' Resume card is horizontally centred');
    assert(bannerRect.top >= 0 && bannerRect.bottom <= height, file + ' Resume card stays inside the landscape viewport');
    assert(banner.scrollWidth <= banner.clientWidth + 1 && banner.scrollHeight <= banner.clientHeight + 1, file + ' Resume content does not overflow');

    var actions = Array.prototype.slice.call(banner.querySelectorAll('.gsh-resume-actions button'));
    var labels = actions.map(function (button) { return button.textContent.trim(); });
    assert(actions.length === 3, file + ' Resume exposes exactly three actions');
    assert(labels.join('|') === '繼續上次練習|重新開始本次練習|開始新一輪', file + ' Resume uses the approved action copy');
    var actionRects = actions.map(rect);
    actionRects.forEach(function (box) { assert(inside(box, bannerRect), file + ' Resume action stays inside its card'); });
    assert(actionRects.every(function (box) { return Math.abs(box.width - actionRects[0].width) <= 1; }), file + ' Resume actions have equal widths');
    assert(actionRects.every(function (box) { return Math.abs(box.top - actionRects[0].top) <= 1; }), file + ' Resume actions stay on one row');
    assert(!intersects(actionRects[0], actionRects[1]) && !intersects(actionRects[1], actionRects[2]), file + ' Resume actions do not overlap');

  }

  function resumeKey(file) {
    return ({
      'tone-finder.html': 'tone-finder',
      'reading-game.html': 'reading-game',
      'typing-game.html': 'typing-game',
      'word-order.html': 'word-order',
      'lego.html': 'lego'
    })[file];
  }

  async function loadResumeActionPage(file, label) {
    frame.style.width = '844px';
    frame.style.height = '390px';
    var nonce = Date.now() + '-' + Math.random().toString(16).slice(2);
    frame.src = '../../' + file + '?ml52-resume-action=' + label + '-' + nonce;
    await new Promise(function (resolve, reject) {
      var timer = setTimeout(function () { reject(new Error('Resume action load timeout: ' + file)); }, 20000);
      frame.onload = function () { clearTimeout(timer); resolve(); };
    });
    var win = frame.contentWindow;
    var doc = frame.contentDocument;
    var runtimeErrors = [];
    win.addEventListener('error', function (event) {
      runtimeErrors.push(String(event.message || event.error || 'unknown runtime error'));
    }, true);
    await waitFor(function () {
      return (file === 'lego.html' || doc.documentElement.classList.contains('gc-ready')) &&
        doc.body.classList.contains('gsh-ml-active');
    }, file + ' real Resume action ready', 25000);
    return { win: win, doc: doc, runtimeErrors: runtimeErrors };
  }

  async function seedRealResume(page, file) {
    var existing = page.doc.querySelector('.gsh-resume-banner');
    if (existing && shown(page.win, existing)) {
      var dismiss = existing.querySelector('.gsh-resume-new');
      if (dismiss) dismiss.click();
      await waitFor(function () { return !shown(page.win, existing); }, file + ' existing Resume dismissal', 3000);
    }
    if (file === 'tone-finder.html') page.win.tfSaveResumeState();
    else if (file === 'reading-game.html') page.win.rgSaveResumeState();
    else if (file === 'typing-game.html') page.win.tgSaveResume();
    else if (file === 'word-order.html') {
      var sentence = page.win.ADV_SENTENCES && page.win.ADV_SENTENCES[0];
      if (!sentence || !sentence.th) throw new Error('Word Order real Resume sentence missing');
      page.win.GameResume.save('word-order', {
        sentenceIds: [sentence.th], idx: 0, completedCurrent: false, score: 0,
        correctFirstTry: 0, cleanC: 0, curCombo: 0, maxCombo: 0, roundLog: [], report: null
      });
    }
    else if (file === 'lego.html') {
      var option = page.doc.querySelector('.slot[data-id="subj"] .opt[role="button"]');
      if (!option) throw new Error('Lego real Resume seed option missing');
      option.click();
    }
    var saved = page.win.GameResume && page.win.GameResume.load(resumeKey(file));
    assert(saved && typeof saved === 'object', file + ' creates a real saved Resume state');
  }

  async function testRealResumeActions(file) {
    var page = await loadResumeActionPage(file, 'seed');
    for (var actionIndex = 0; actionIndex < 3; actionIndex += 1) {
      await seedRealResume(page, file);
      page = await loadResumeActionPage(file, 'action-' + actionIndex);
      var banner = page.doc.querySelector('.gsh-resume-banner');
      await waitFor(function () {
        return banner && shown(page.win, banner) && page.doc.getElementById('gsh-ml-stage').dataset.gshMlView === 'resume';
      }, file + ' real Resume prompt', 5000);
      var actions = Array.prototype.slice.call(banner.querySelectorAll('.gsh-resume-actions button'));
      assert(actions.length === 3, file + ' real Resume state exposes three actions');
      actions[actionIndex].click();
      await waitFor(function () {
        return !shown(page.win, banner) && page.doc.getElementById('gsh-ml-stage').dataset.gshMlView !== 'resume';
      }, file + ' real Resume action ' + (actionIndex + 1) + ' transition', 5000);
      assert(!shown(page.win, banner), file + ' real Resume action ' + (actionIndex + 1) + ' closes the prompt');
      assert(page.doc.getElementById('gsh-ml-stage').dataset.gshMlView !== 'resume', file + ' real Resume action ' + (actionIndex + 1) + ' enters game state');
      assert(page.runtimeErrors.length === 0, file + ' real Resume action ' + (actionIndex + 1) + ' runs without a runtime error');
    }
  }

  async function loadGame(file, ready) {
    var nonce = Date.now() + '-' + Math.random().toString(16).slice(2);
    frame.src = '../../' + file + '?ml52-browser-test=' + nonce;
    await new Promise(function (resolve, reject) {
      var timer = setTimeout(function () { reject(new Error('load timeout: ' + file)); }, 20000);
      frame.onload = function () { clearTimeout(timer); resolve(); };
    });
    var win = frame.contentWindow;
    var doc = frame.contentDocument;
    var runtimeErrors = [];
    win.addEventListener('error', function (event) {
      runtimeErrors.push(String(event.message || event.error || 'unknown runtime error') +
        (event.filename ? ' @ ' + event.filename + ':' + event.lineno + ':' + event.colno : ''));
    }, true);
    await waitFor(function () {
      return doc.documentElement.classList.contains('gc-ready') && doc.body.classList.contains('gsh-ml-active');
    }, file + ' ready', 25000);
    await closeGameplayBlockers(win, doc);
    await waitFor(function () { return ready(win, doc); }, file + ' gameplay ready', 10000);
    assert(doc.documentElement.scrollWidth <= 844 && doc.body.scrollWidth <= 844, file + ' has no horizontal overflow at 844x390');
    return { win: win, doc: doc, runtimeErrors: runtimeErrors };
  }

  async function testTone() {
    var page = await loadGame('tone-finder.html', function (win, doc) {
      return doc.querySelectorAll('.sg-tone-grid .sg-tone-btn').length === 5 && shown(win, doc.querySelector('.sg-dontknow-btn'));
    });
    var choices = assertSideGeometry(page.win, page.doc, '.sg-tone-grid > .sg-tone-btn, .sg-tone-grid > .sg-dontknow-btn');
    var numbered = choices.filter(function (node) { return node.classList.contains('sg-tone-btn'); });
    assert(numbered.slice(0, 3).every(function (node) { return node.dataset.gshSide === 'left'; }), 'Tone 1-3 stay in the left frame');
    assert(numbered.slice(3).every(function (node) { return node.dataset.gshSide === 'right'; }), 'Tone 4-5 stay in the right frame');
    var skipSlot = page.doc.querySelector('[data-gsh-ml-slot="skip"]');
    var stableSkip = skipSlot && skipSlot.querySelector('.tf-known-btn');
    assert(stableSkip && shown(page.win, stableSkip), 'Tone Skip is visible in the top action slot');
    var skipMutations = 0;
    var skipObserver = new page.win.MutationObserver(function (records) {
      records.forEach(function (record) { if (record.type === 'childList') skipMutations += 1; });
    });
    skipObserver.observe(skipSlot, { childList: true });
    await wait(350);
    skipObserver.disconnect();
    assert(skipSlot.querySelector('.tf-known-btn') === stableSkip && shown(page.win, stableSkip), 'Tone Skip keeps one stable DOM owner across animation frames');
    assert(skipMutations === 0, 'Tone Skip does not flicker between its source and top slot');
    var uncertain = assertPositionTwo(page.win, page.doc, '不確定');
    var before = page.doc.querySelector('#tf-body').textContent;
    uncertain.click();
    await waitFor(function () { return page.doc.querySelector('#tf-body').textContent !== before; }, 'Tone uncertain transition');
    assert(page.doc.querySelector('#tf-body').textContent !== before, 'Tone 不確定 click changes the gameplay state');
    assertPositionTwo(page.win, page.doc);
  }

  async function testReading() {
    var page = await loadGame('reading-game.html', function (win, doc) {
      return doc.querySelectorAll('#pool .opt').length > 0 && win.W && win.comps && win.correctVal;
    });
    assertSideGeometry(page.win, page.doc, '#pool .opt');
    assertPositionTwo(page.win, page.doc);
    var check = page.doc.getElementById('btn-check');
    for (var syllablePass = 0; syllablePass < 10; syllablePass += 1) {
      for (var componentIndex = 0; componentIndex < page.win.comps.length; componentIndex += 1) {
        var component = page.win.comps[componentIndex];
        var option = Array.prototype.slice.call(page.doc.querySelectorAll('#pool .opt')).filter(function (node) {
          return !node.classList.contains('sel') && node.dataset.val === String(page.win.correctVal[component]);
        })[0];
        if (!option) throw new Error('Reading correct option missing for ' + component);
        var beforeOption = rect(option);
        option.click();
        await wait(30);
        var afterOption = rect(option);
        assert(sameRect(beforeOption, afterOption), 'Reading option stays fixed after selecting ' + component);
        assertSideGeometry(page.win, page.doc, '#pool .opt');
      }
      if (!check.disabled) break;
      var nextSyllable = assertPositionTwo(page.win, page.doc, '下一個音節');
      var beforeSyllable = page.win.sylIdx;
      nextSyllable.click();
      await waitFor(function () { return page.win.sylIdx !== beforeSyllable; }, 'Reading next-syllable transition');
      assert(true, 'Reading 下一個音節 changes the active syllable');
    }
    assert(!check.disabled, 'Reading check becomes enabled after real option clicks');
    var before = (page.doc.getElementById('qn').textContent || '') + '|' + (page.doc.getElementById('wth').textContent || '');
    check.click();
    await waitFor(function () { return visiblePositionTwo(page.win, page.doc).length === 1; }, 'Reading Position 2 transition');
    var next = assertPositionTwo(page.win, page.doc);
    assert(/下一個音節|下一題/.test(next.textContent.replace(/\s+/g, '')), 'Reading Position 2 uses the state-owned next action');
    next.click();
    await waitFor(function () {
      return ((page.doc.getElementById('qn').textContent || '') + '|' + (page.doc.getElementById('wth').textContent || '')) !== before;
    }, 'Reading next transition');
    assert(true, 'Reading next action changes syllable or question state');
  }

  async function testTyping() {
    var page = await loadGame('typing-game.html', function (win, doc) {
      return doc.querySelectorAll('#rg-kbd .tk-key[data-code]').length === 47 && doc.querySelectorAll('#rg-kbd .rg-shift-key').length === 2;
    });
    var left = rect(page.doc.querySelector('[data-gsh-ml-slot="left"]'));
    var center = rect(page.doc.querySelector('[data-gsh-ml-slot="center"]'));
    var right = rect(page.doc.querySelector('[data-gsh-ml-slot="right"]'));
    Array.prototype.slice.call(page.doc.querySelectorAll('#rg-kbd .gsh-split-kbd-half')).forEach(function (half) {
      var box = rect(half);
      var owner = half.dataset.gshSide === 'left' ? left : right;
      assert(inside(box, owner), 'Typing keyboard ' + half.dataset.gshSide + ' half stays inside its own frame');
      assert(!intersects(box, center), 'Typing keyboard ' + half.dataset.gshSide + ' half does not cover the question frame');
    });
    var characterKeys = Array.prototype.slice.call(page.doc.querySelectorAll('#rg-kbd .tk-key[data-code]'));
    assert(characterKeys.length === 47, 'Typing exposes exactly 47 character/symbol buttons');
    assert(!page.doc.querySelector('#rg-kbd .tk-space'), 'Typing exposes no Space button');
    assert(!Array.prototype.slice.call(page.doc.querySelectorAll('#rg-kbd [aria-label]')).some(function (node) { return node.getAttribute('aria-label') === 'Backspace'; }), 'Typing exposes no Backspace button');
    assert(page.win.RG_SHIFT_MAP.KeyB === 'ฺ', 'Typing preserves the real ฺ character in the Shift map');

    page.win.RG_TYPE.target = '\uffff'.repeat(100);
    page.win.RG_TYPE.pos = 0;
    var badBefore = page.win.badC;
    characterKeys.forEach(function (key) { key.click(); });
    assert(page.win.badC === badBefore + 47, 'All 47 Typing character/symbol buttons execute their real click handler');

    var shifts = Array.prototype.slice.call(page.doc.querySelectorAll('#rg-kbd .rg-shift-key'));
    shifts[0].click();
    assert(shifts.every(function (key) { return key.classList.contains('active'); }) && page.doc.getElementById('rg-kbd').classList.contains('shift-on'), 'Left Shift turns both Shift controls on');
    var shiftedFace = page.win.getComputedStyle(characterKeys[0].querySelector('.tk-shift'));
    var baseFace = page.win.getComputedStyle(characterKeys[0].querySelector('.tk-base'));
    assert(parseFloat(shiftedFace.fontSize) > parseFloat(baseFace.fontSize), 'Shift face becomes the primary key face');
    characterKeys[0].click();
    assert(shifts.every(function (key) { return !key.classList.contains('active'); }) && !page.doc.getElementById('rg-kbd').classList.contains('shift-on'), 'Shift turns off after one character');
    shifts[1].click();
    assert(shifts.every(function (key) { return key.classList.contains('active'); }), 'Right Shift uses the same shared state');
    characterKeys[1].click();
    assert(shifts.every(function (key) { return !key.classList.contains('active'); }), 'Right Shift also releases after one character');
  }

  async function testWordOrder() {
    var page = await loadGame('word-order.html', function (win, doc) {
      return doc.querySelectorAll('#wo-bank .wo-tile[data-gsh-original-index]').length > 0;
    });
    assertSideGeometry(page.win, page.doc, '#wo-bank .wo-tile');
    var reset = assertPositionTwo(page.win, page.doc, '重新');
    for (var partial = 0; partial < 2; partial += 1) {
      page.doc.querySelector('#wo-bank .wo-tile:not(.used)').click();
      await wait(30);
    }
    await wait(100);
    assert(page.doc.querySelectorAll('#wo-slots .wo-slot.filled').length > 0, 'Word Order tile buttons move words into the answer slots');
    reset = assertPositionTwo(page.win, page.doc, '重新');
    reset.click();
    await waitFor(function () { return page.doc.querySelectorAll('#wo-slots .wo-slot.filled').length === 0; }, 'Word Order reset');
    assert(true, 'Word Order 重新 clears the answer slots');

    var wordCount = page.doc.querySelectorAll('#wo-slots .wo-slot').length;
    for (var original = 0; original < wordCount; original += 1) {
      var tile = page.doc.querySelector('#wo-bank .wo-tile[data-gsh-original-index="' + original + '"]');
      tile.click();
      await wait(30);
    }
    var check = page.doc.getElementById('wo-check-btn');
    assert(!check.disabled, 'Word Order check becomes enabled after real tile clicks');
    var before = page.doc.getElementById('gsh-ml-word-order-question').textContent;
    check.click();
    await wait(500);
    assert(!!page.doc.querySelector('#wo-slots .wo-slot.correct'), 'Word Order correct state' +
      (page.runtimeErrors.length ? ' (runtime: ' + page.runtimeErrors.join(' | ') + ')' : ''));
    var next = assertPositionTwo(page.win, page.doc, '下一題');
    assert(!shown(page.win, page.doc.getElementById('wo-reset-btn')), 'Word Order never shows 重新 together with 下一題');
    next.click();
    await waitFor(function () { return page.doc.getElementById('gsh-ml-word-order-question').textContent !== before; }, 'Word Order next state');
    assert(true, 'Word Order 下一題 changes the Chinese question');
    assertPositionTwo(page.win, page.doc, '重新');
    assertSideGeometry(page.win, page.doc, '#wo-bank .wo-tile');
  }

  (async function run() {
    try {
      var resumeFiles = ['tone-finder.html', 'reading-game.html', 'listening-game.html', 'typing-game.html', 'word-order.html', 'lego.html'];
      for (var resumeIndex = 0; resumeIndex < resumeFiles.length; resumeIndex += 1) {
        await testResumeScreen(resumeFiles[resumeIndex], 844, 390);
        await testResumeScreen(resumeFiles[resumeIndex], 932, 430);
      }
      var activeResumeFiles = ['tone-finder.html', 'reading-game.html', 'typing-game.html', 'word-order.html', 'lego.html'];
      for (var activeResumeIndex = 0; activeResumeIndex < activeResumeFiles.length; activeResumeIndex += 1) {
        await testRealResumeActions(activeResumeFiles[activeResumeIndex]);
      }
      frame.style.width = '844px';
      frame.style.height = '390px';
      await testTone();
      await testReading();
      await testTyping();
      await testWordOrder();
      status.textContent = 'PASS ' + checks + ' checks';
      status.dataset.result = 'pass';
      document.title = 'PASS — Mobile Landscape interaction gate';
    } catch (error) {
      lines.push('FAIL ' + (error && error.stack ? error.stack : error));
      results.textContent = lines.join('\n');
      status.textContent = 'FAIL after ' + checks + ' checks';
      status.dataset.result = 'fail';
      document.title = 'FAIL — Mobile Landscape interaction gate';
    }
  })();
})();
