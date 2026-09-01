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
    var check = page.doc.getElementById('btn-check');
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
