/* Shared six-game mobile-landscape stage. Moves live nodes and restores them on exit. */
(function (window, document) {
  'use strict';

  if (window.GSHMobileLandscape) return;

  var QUERY = '(orientation: landscape) and (max-width: 1024px) and (max-height: 600px)';
  var media = window.matchMedia(QUERY);
  var stage = null;
  var slots = Object.create(null);
  var moved = new Map();
  var moveOrder = [];
  var observer = null;
  var syncPending = false;
  var syncing = false;
  var active = false;
  var listeningKeyboard = null;
  var listeningShifted = false;
  var listeningKeyboardSource = null;
  var listeningKeyboardRenderer = null;
  var listeningKeyboardLayout = null;
  var listeningKeyboardInput = null;
  var listeningKeyboardRenderedShifted = null;
  var inputPolicies = new Map();
  var controlPolicies = new Map();
  var activeResultRoot = null;
  var activeResultActions = [];
  var activeResultDetailRoot = null;
  var activeResultDetailOwner = null;
  var syncCount = 0;
  var mountMoveCount = 0;
  var observerCallbackCount = 0;

  function q(selector, root) { return (root || document).querySelector(selector); }
  function qa(selector, root) { return Array.prototype.slice.call((root || document).querySelectorAll(selector)); }
  function isVisible(node) {
    if (!node || !node.isConnected || node.hidden) return false;
    var style = window.getComputedStyle(node);
    return style.display !== 'none' && style.visibility !== 'hidden';
  }
  function isRenderableControl(node) {
    return isVisible(node) && !node.classList.contains('used');
  }
  function isSourceVisible(node) {
    return !!node && !node.hidden && node.style.display !== 'none' && isVisible(node);
  }

  function slot(name) { return slots[name] || null; }

  function makeSlot(name, tag) {
    var node = document.createElement(tag || 'div');
    node.setAttribute('data-gsh-ml-slot', name);
    slots[name] = node;
    return node;
  }

  function createStage() {
    var existing = document.getElementById('gsh-ml-stage');
    if (existing) existing.remove();
    slots = Object.create(null);
    stage = document.createElement('div');
    stage.id = 'gsh-ml-stage';
    stage.setAttribute('data-gsh-ml-view', 'gameplay');

    var top = document.createElement('header');
    top.className = 'gsh-ml-top';
    top.append(makeSlot('dropdowns'), makeSlot('shared-controls'), makeSlot('main-action'));

    var play = document.createElement('section');
    play.className = 'gsh-ml-play';
    var left = makeSlot('left', 'aside');
    var center = makeSlot('center', 'main');
    center.append(makeSlot('account'), makeSlot('question'), makeSlot('current-input'));
    var right = makeSlot('right', 'aside');
    play.append(left, center, right, makeSlot('split-content'), makeSlot('split-keyboard'));

    var exclusive = document.createElement('section');
    exclusive.className = 'gsh-ml-exclusive';
    var exclusiveCenter = makeSlot('exclusive-center', 'main');
    var customCancel = document.createElement('button');
    customCancel.type = 'button';
    customCancel.id = 'gsh-ml-custom-cancel';
    customCancel.textContent = '取消';
    customCancel.addEventListener('click', function () {
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
      scheduleSync();
    });
    exclusiveCenter.appendChild(customCancel);
    exclusive.append(makeSlot('exclusive-left', 'aside'), exclusiveCenter, makeSlot('exclusive-right', 'aside'));
    stage.append(top, play, exclusive);
    document.body.appendChild(stage);
  }

  function mountExistingNode(node, target) {
    if (!node || !target || node === target) return false;
    var focused = document.activeElement && node.contains(document.activeElement) ? document.activeElement : null;
    var record = moved.get(node);
    if (record) {
      if (node.parentNode !== target) {
        target.appendChild(node);
        mountMoveCount += 1;
      }
      if (focused && document.activeElement !== focused && focused.focus) focused.focus({ preventScroll: true });
      return true;
    }
    if (!node.parentNode) return false;
    var marker = document.createComment('gsh-ml:' + (node.id || node.className || node.tagName));
    var originalParent = node.parentNode;
    var originalNextSibling = node.nextSibling;
    originalParent.insertBefore(marker, node);
    moved.set(node, { marker: marker, originalParent: originalParent, originalNextSibling: originalNextSibling });
    moveOrder.push(node);
    target.appendChild(node);
    mountMoveCount += 1;
    if (focused && document.activeElement !== focused && focused.focus) focused.focus({ preventScroll: true });
    return true;
  }

  function restoreExistingNode(node) {
    var record = moved.get(node);
    if (!record) return;
    if (record.marker.isConnected) {
      record.marker.replaceWith(node);
    } else if (node.isConnected) {
      node.remove();
    }
    moved.delete(node);
    moveOrder = moveOrder.filter(function (item) { return item !== node; });
  }

  function restoreAll() {
    var restoring = moveOrder.slice();
    for (var i = restoring.length - 1; i >= 0; i -= 1) restoreExistingNode(restoring[i]);
    moveOrder = moveOrder.filter(function (node) { return moved.has(node); });
  }

  function cleanupStaleMovedNodes() {
    moved.forEach(function (record, node) {
      if (!record.marker.isConnected) {
        if (node.isConnected) node.remove();
        moved.delete(node);
      }
    });
    moveOrder = moveOrder.filter(function (node) { return moved.has(node); });
  }

  function closeDropdowns() {
    qa('.gsh-ml-dropdown', stage).forEach(function (root) {
      var trigger = q('.gsh-ml-dropdown-trigger', root);
      var panel = q('.gsh-ml-dropdown-panel', root);
      if (panel) panel.hidden = true;
      if (trigger) trigger.setAttribute('aria-expanded', 'false');
    });
  }

  function positionDropdown(trigger, panel) {
    panel.style.left = '';
    panel.style.top = '';
    var rect = trigger.getBoundingClientRect();
    var style = window.getComputedStyle(document.body);
    var safeLeft = parseFloat(style.getPropertyValue('--gsh-ml-safe-l')) || 12;
    var safeRight = parseFloat(style.getPropertyValue('--gsh-ml-safe-r')) || 12;
    panel.style.top = Math.round(rect.bottom + 4) + 'px';
    var width = Math.min(panel.offsetWidth || 220, window.innerWidth - safeLeft - safeRight);
    var left = Math.max(safeLeft, Math.min(rect.left, window.innerWidth - safeRight - width));
    panel.style.left = Math.round(left) + 'px';
  }

  function createDropdown(name, label, nodes) {
    nodes = nodes.filter(function (node, index, all) { return node && all.indexOf(node) === index; });
    if (!nodes.length) return null;
    var root = document.createElement('div');
    root.className = 'gsh-ml-dropdown';
    root.dataset.gshDropdown = name;
    var trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'gsh-ml-dropdown-trigger';
    trigger.setAttribute('aria-haspopup', 'menu');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.textContent = label + ' ▼';
    var panel = document.createElement('div');
    panel.className = 'gsh-ml-dropdown-panel';
    panel.setAttribute('role', 'menu');
    panel.hidden = true;
    trigger.addEventListener('click', function () {
      var open = panel.hidden;
      closeDropdowns();
      panel.hidden = !open;
      trigger.setAttribute('aria-expanded', String(open));
      if (open) positionDropdown(trigger, panel);
    });
    root.append(trigger, panel);
    slot('dropdowns').appendChild(root);
    nodes.forEach(function (node) { mountExistingNode(node, panel); });
    return root;
  }

  function nodesFor(selectors) {
    var result = [];
    selectors.forEach(function (selector) {
      qa(selector).forEach(function (node) { if (result.indexOf(node) < 0) result.push(node); });
    });
    return result;
  }

  function labeledNode(selector, label) {
    var node = q(selector);
    if (node) node.setAttribute('data-gsh-ml-tool-label', label);
    return node;
  }

  function configureDropdowns(game) {
    slot('dropdowns').replaceChildren();
    var modes = game === 'listening' ? nodesFor(['.mode-tabs']) : [];
    var levels = [];
    var tools = [];
    if (game === 'tone') {
      levels = nodesFor(['#tf-level-tabs']);
      tools = [
        labeledNode('#tf-howto-btn', '玩法'),
        labeledNode('#tf-alpha-btn', '字母練習區'),
        labeledNode('#rg-pron-toggle', '讀音'),
        labeledNode('#zh-toggle-slot', '翻譯'),
        labeledNode('#tf-vault-btn-slot', '單字庫'),
        labeledNode('#tf-guide-toggle', '提示'),
        labeledNode('#font-toggle-slot', '字體'),
        labeledNode('#tf-particle-toggle', '禮貌詞')
      ];
    } else if (game === 'reading') {
      levels = nodesFor(['.gsh-level-selector']);
      tools = [
        labeledNode('#rg-howto-btn', '玩法'),
        labeledNode('#btn-remember', '已記得'),
        labeledNode('#rg-sound-toggle', '發音'),
        labeledNode('#rg-pron-toggle', '讀音'),
        labeledNode('#rg-en-toggle', '英文讀音'),
        labeledNode('#zh-toggle-slot', '翻譯'),
        labeledNode('#rg-vault-btn-slot', '單字庫'),
        labeledNode('#rg-guide-toggle', '提示'),
        labeledNode('#font-toggle-slot', '字體'),
        labeledNode('#rg-particle-toggle', '禮貌詞')
      ];
    } else if (game === 'listening') {
      levels = nodesFor(['#lg-level-tabs']);
      tools = nodesFor(['#lg-howto-btn', '#lg-skip-btn']);
    } else if (game === 'typing') {
      levels = nodesFor(['.gsh-level-selector']);
      tools = nodesFor(['#rg-howto-btn', '#btn-remember', '#word-ctl-row']);
      var keyboardToggle = q('#rg-webkbd-toggle');
      if (keyboardToggle) {
        keyboardToggle.setAttribute('data-gsh-ml-keyboard-toggle', 'disabled');
        setControlDisabled(keyboardToggle, true);
      }
    } else if (game === 'word-order') {
      var reset = q('.btn-row .btn-secondary:not(#wo-remember-btn):not(#wo-next-btn)');
      tools = nodesFor(['#wo-howto-btn', '#wo-hint-btn', '#wo-remember-btn']);
      if (reset) tools.push(reset);
    } else if (game === 'lego') {
      tools = nodesFor(['#lego-howto-btn']);
    }
    createDropdown('mode', 'Mode', modes);
    createDropdown('level', 'Level', levels);
    createDropdown('tools', 'Tools', tools);
  }

  function mountMany(selectors, target) {
    nodesFor(selectors).forEach(function (node) { mountExistingNode(node, target); });
  }

  function mountStaticGameNodes(game) {
    mountExistingNode(q('.rg-ctl-wrap'), slot('shared-controls'));
    mountExistingNode(q('#rg-login-slot'), slot('account'));
    if (game === 'tone') {
      mountMany(['#tf-banner'], slot('question'));
      var toneBody = q('#tf-body');
      if (!toneBody || toneBody.getAttribute('data-shared-result-active') !== 'true') {
        mountExistingNode(toneBody, slot('question'));
      }
      mountMany(['#tf-nav-bar'], slot('main-action'));
    } else if (game === 'reading') {
      mountMany(['.word-area', '#syl-strip', '#slot-row'], slot('question'));
      mountMany(['#btn-check', '#btn-next', '#btn-next-syl'], slot('main-action'));
    } else if (game === 'listening') {
      mountMany(['.lg-word-area'], slot('question'));
      mountMany(['#lg-type-wrap'], slot('current-input'));
      mountMany(['#lg-type-submit', '#lg-next-btn'], slot('main-action'));
    } else if (game === 'typing') {
      mountMany(['.word-area', '#slot-row'], slot('question'));
      mountMany(['#rg-type-wrap'], slot('current-input'));
      mountMany(['#btn-check', '#btn-next'], slot('main-action'));
    } else if (game === 'word-order') {
      mountMany(['#wo-slots'], slot('question'));
      mountMany(['#wo-next-btn'], slot('main-action'));
    } else if (game === 'lego') {
      mountMany(['#baseplate'], slot('left'));
      mountMany(['.out-banner'], slot('question'));
      mountMany(['.out-actions'], slot('main-action'));
    }
  }

  function assignSides(container, game) {
    if (!container) return;
    container.setAttribute('data-gsh-ml-split', game);
    var children = Array.prototype.filter.call(container.children, isRenderableControl);
    Array.prototype.forEach.call(container.children, function (child) { child.removeAttribute('data-gsh-side'); });
    var leftCount;
    if (game === 'tone') {
      leftCount = children.length === 6 ? 3 : children.length === 3 ? 1 : children.length === 2 ? 1 : Math.ceil(children.length / 2);
    } else if (game === 'listening') {
      leftCount = Math.min(2, Math.ceil(children.length / 2));
    } else {
      leftCount = Math.ceil(children.length / 2);
    }
    var leftIndex = 0;
    var rightIndex = 0;
    children.forEach(function (child, index) {
      var side = index < leftCount ? 'left' : 'right';
      child.dataset.gshSide = side;
      child.dataset.gshSideIndex = String(side === 'left' ? leftIndex++ : rightIndex++);
      child.dataset.gshSideCount = String(side === 'left' ? leftCount : children.length - leftCount);
    });
  }

  function syncSplitContent(game) {
    var container = null;
    if (game === 'tone') container = q('#tf-body .tf-options, #tf-body .tf-mark-opts, #tf-body .sg-tone-grid');
    else if (game === 'reading') container = q('#pool');
    else if (game === 'listening') container = q('#lg-mc-wrap');
    else if (game === 'word-order') container = q('#wo-bank');
    if (container) {
      mountExistingNode(container, slot('split-content'));
      assignSides(container, game);
    }
  }

  function setInputPolicy(input, suppress) {
    if (!input) return;
    if (suppress) {
      if (!inputPolicies.has(input)) inputPolicies.set(input, { readOnly: input.readOnly, inputmode: input.getAttribute('inputmode') });
      if (document.activeElement === input) input.blur();
      input.readOnly = true;
      input.setAttribute('inputmode', 'none');
    } else {
      var original = inputPolicies.get(input);
      if (!original) return;
      input.readOnly = original.readOnly;
      if (original.inputmode == null) input.removeAttribute('inputmode'); else input.setAttribute('inputmode', original.inputmode);
      inputPolicies.delete(input);
    }
  }

  function setControlDisabled(control, disabled) {
    if (!control) return;
    if (disabled) {
      if (!controlPolicies.has(control)) controlPolicies.set(control, control.disabled);
      control.disabled = true;
    } else if (controlPolicies.has(control)) {
      control.disabled = controlPolicies.get(control);
      controlPolicies.delete(control);
    }
  }

  function renderListeningKeyboard() {
    var input = q('#lg-type-input');
    var source = window.GSHThaiKeyboard;
    if (!input || !source) return false;
    var layout = source.layoutVersion || JSON.stringify([source.codeRows, source.baseMap, source.shiftMap]);
    if (!listeningKeyboard) {
      listeningKeyboard = document.createElement('div');
      listeningKeyboard.id = 'lg-ml-keyboard';
      listeningKeyboard.className = 'tkbd';
      slot('split-keyboard').appendChild(listeningKeyboard);
    }
    if (listeningKeyboardSource === source && listeningKeyboardRenderer === source.render && listeningKeyboardLayout === layout &&
        listeningKeyboardInput === input && listeningKeyboardRenderedShifted === listeningShifted &&
        listeningKeyboard.children.length) return false;
    source.render({
      root: listeningKeyboard,
      split: true,
      shifted: listeningShifted,
      onCode: function (code) {
        var map = listeningShifted ? source.shiftMap : source.baseMap;
        var character = map[code] || '';
        if (!character) return;
        input.value += character;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        if (listeningShifted) { listeningShifted = false; renderListeningKeyboard(); }
      },
      onShift: function () { listeningShifted = !listeningShifted; renderListeningKeyboard(); },
      onBackspace: function () {
        input.value = input.value.slice(0, -1);
        input.dispatchEvent(new Event('input', { bubbles: true, inputType: 'deleteContentBackward' }));
      }
    });
    listeningKeyboardSource = source;
    listeningKeyboardRenderer = source.render;
    listeningKeyboardLayout = layout;
    listeningKeyboardInput = input;
    listeningKeyboardRenderedShifted = listeningShifted;
    return true;
  }

  function clearListeningKeyboard() {
    if (listeningKeyboard) listeningKeyboard.remove();
    listeningKeyboard = null;
    listeningShifted = false;
    listeningKeyboardSource = null;
    listeningKeyboardRenderer = null;
    listeningKeyboardLayout = null;
    listeningKeyboardInput = null;
    listeningKeyboardRenderedShifted = null;
  }

  function syncKeyboard(game) {
    if (game === 'typing') {
      var keyboard = q('#rg-kbd');
      if (keyboard) mountExistingNode(keyboard, slot('split-keyboard'));
      setInputPolicy(q('#rg-mobile-input'), true);
    } else if (game === 'listening') {
      var typed = isVisible(q('#lg-type-wrap'));
      setInputPolicy(q('#lg-type-input'), typed);
      if (typed) renderListeningKeyboard();
      else clearListeningKeyboard();
    }
  }

  function syncLegoMenu() {
    var mounted = q('[data-gsh-ml-role="lego-menu"]', stage);
    var mountedRecord = mounted && moved.get(mounted);
    var mountedStillOpen = mountedRecord && mountedRecord.originalParent &&
      mountedRecord.originalParent.classList.contains('menu-open');
    var current = mountedStillOpen ? mounted : qa('.slot.menu-open .slot-menu').filter(isVisible)[0] || null;
    qa('[data-gsh-ml-role="lego-menu"]', stage).forEach(function (menu) {
      if (menu !== current) {
        menu.removeAttribute('data-gsh-ml-role');
        restoreExistingNode(menu);
      }
    });
    if (current) {
      current.setAttribute('data-gsh-ml-role', 'lego-menu');
      mountExistingNode(current, slot('right'));
    }
  }

  function visibleResume() {
    return qa('#tf-resume-banner, #rg-resume-banner, #lg-resume-banner, #tg-resume-banner, #wo-resume-banner, #lego-resume-banner').filter(isSourceVisible)[0] || null;
  }

  function resolveExclusiveView(game) {
    var focused = document.activeElement;
    var custom = game === 'lego' && focused && focused.closest ? focused.closest('.opt-custom') : null;
    var resume = visibleResume();
    var detail = qa('[data-shared-result-detail-ui="v1"][data-shared-result-detail-active="true"]').filter(isSourceVisible)[0] || null;
    var detailToken = detail && detail.getAttribute('data-shared-result-detail-owner');
    var detailOwner = detailToken ? qa('[data-shared-result-ui="v1"][data-shared-result-detail-owner]').filter(function (node) {
      return node.getAttribute('data-shared-result-detail-owner') === detailToken;
    })[0] || null : null;
    var result = qa('[data-shared-result-ui="v1"][data-shared-result-active="true"]').filter(isSourceVisible)[0] || null;
    return { custom: custom, resume: resume, result: result, detail: detail, detailOwner: detailOwner };
  }

  function restoreActiveResultLayout() {
    if (!activeResultRoot) return;
    activeResultActions.slice().forEach(restoreExistingNode);
    restoreExistingNode(activeResultRoot);
  }

  function restoreActiveResult(nextRoot, deactivateState) {
    if (!activeResultRoot || activeResultRoot === nextRoot) return;
    restoreActiveResultLayout();
    if (deactivateState && window.GameFlow && typeof window.GameFlow.unmarkResult === 'function') {
      window.GameFlow.unmarkResult(activeResultRoot);
    }
    activeResultRoot = null;
    activeResultActions = [];
  }

  function restoreActiveResultDetail(nextDetail, deactivateState) {
    if (!activeResultDetailRoot || activeResultDetailRoot === nextDetail) return;
    restoreExistingNode(activeResultDetailRoot);
    if (deactivateState && window.GameFlow && typeof window.GameFlow.unmarkResultDetail === 'function') {
      window.GameFlow.unmarkResultDetail(activeResultDetailOwner, activeResultDetailRoot);
    }
    activeResultDetailRoot = null;
    activeResultDetailOwner = null;
  }

  function prepareExclusiveView(view) {
    qa('[data-gsh-ml-custom-input]', stage).forEach(function (node) {
      if (node !== view.custom) {
        node.removeAttribute('data-gsh-ml-custom-input');
        restoreExistingNode(node);
      }
    });
    restoreActiveResultDetail(view.detail, true);
    if (view.detail && view.detailOwner) {
      restoreActiveResult(view.detailOwner, true);
      restoreActiveResultLayout();
    } else {
      restoreActiveResult(view.result, true);
    }
  }

  function setExclusiveInertness(viewName) {
    var exclusiveActive = viewName !== 'gameplay';
    var top = q('.gsh-ml-top', stage);
    var play = q('.gsh-ml-play', stage);
    var exclusive = q('.gsh-ml-exclusive', stage);
    [top, play].forEach(function (node) {
      if (!node) return;
      node.inert = exclusiveActive;
      if (exclusiveActive) node.setAttribute('aria-hidden', 'true'); else node.removeAttribute('aria-hidden');
    });
    if (exclusive) {
      exclusive.inert = !exclusiveActive;
      if (exclusiveActive) exclusive.removeAttribute('aria-hidden'); else exclusive.setAttribute('aria-hidden', 'true');
    }
    var keyboard = slot('split-keyboard');
    if (keyboard) keyboard.inert = exclusiveActive;
    var focused = document.activeElement;
    if (exclusiveActive && focused && ((top && top.contains(focused)) || (play && play.contains(focused))) && focused.blur) {
      focused.blur();
    }
  }

  function syncExclusiveView(game, view) {
    var viewName = 'gameplay';
    if (view.custom) {
      view.custom.setAttribute('data-gsh-ml-custom-input', 'active');
      mountExistingNode(view.custom, slot('exclusive-center'));
      viewName = 'custom-input';
    } else if (view.resume) {
      mountExistingNode(view.resume, slot('exclusive-center'));
      viewName = 'resume';
    } else if (view.detail && view.detailOwner) {
      if (!activeResultRoot) {
        activeResultRoot = view.detailOwner;
        activeResultActions = qa('.gsh-result-primary-actions, .gsh-result-utility-actions, .gsh-result-home-actions', view.detailOwner);
      }
      mountExistingNode(view.detail, slot('exclusive-center'));
      activeResultDetailRoot = view.detail;
      activeResultDetailOwner = view.detailOwner;
      viewName = 'result-detail';
    } else if (view.result) {
      var groups = activeResultRoot === view.result ? activeResultActions.filter(function (node) { return moved.has(node); }) : [];
      qa('.gsh-result-primary-actions, .gsh-result-utility-actions, .gsh-result-home-actions', view.result).forEach(function (node) {
        if (groups.indexOf(node) < 0) groups.push(node);
      });
      mountExistingNode(view.result, slot('exclusive-center'));
      groups.forEach(function (node) {
        var target = node.classList.contains('gsh-result-primary-actions') ? slot('exclusive-right') : slot('exclusive-left');
        mountExistingNode(node, target);
      });
      activeResultRoot = view.result;
      activeResultActions = groups;
      viewName = 'result';
    } else {
      activeResultRoot = null;
      activeResultActions = [];
    }
    stage.setAttribute('data-gsh-ml-view', viewName);
    setExclusiveInertness(viewName);
    if (window.visualViewport && view.custom) {
      stage.style.height = Math.max(1, Math.round(window.visualViewport.height)) + 'px';
      stage.style.top = Math.max(0, Math.round(window.visualViewport.offsetTop || 0)) + 'px';
      stage.style.bottom = 'auto';
    } else {
      stage.style.height = '';
      stage.style.top = '';
      stage.style.bottom = '';
    }
    var gate = q('#rg-gate');
    var loginOpen = isVisible(gate);
    stage.inert = loginOpen;
    if (loginOpen) stage.setAttribute('aria-hidden', 'true'); else stage.removeAttribute('aria-hidden');
    document.body.classList.toggle('gsh-ml-login-open', loginOpen);
  }

  function syncDynamicMainAction() {
    mountMany(['.gsh-next-countdown', '.gsh-pause-btn'], slot('main-action'));
  }

  function sync() {
    if (!active || !stage || syncing) return;
    syncing = true;
    syncCount += 1;
    try {
      cleanupStaleMovedNodes();
      var game = document.body.getAttribute('data-gsh-game') || '';
      var exclusiveView = resolveExclusiveView(game);
      prepareExclusiveView(exclusiveView);
      mountStaticGameNodes(game);
      syncSplitContent(game);
      if (game === 'lego') syncLegoMenu();
      syncDynamicMainAction();
      syncKeyboard(game);
      syncExclusiveView(game, exclusiveView);
    } finally {
      syncing = false;
    }
  }

  function scheduleSync() {
    if (!active || syncPending) return;
    syncPending = true;
    window.requestAnimationFrame(function () { syncPending = false; sync(); });
  }

  function activate() {
    if (active || !document.body || !document.body.hasAttribute('data-gsh-game')) return;
    active = true;
    createStage();
    document.body.classList.add('gsh-ml-active');
    configureDropdowns(document.body.getAttribute('data-gsh-game') || '');
    mountStaticGameNodes(document.body.getAttribute('data-gsh-game') || '');
    observer = new MutationObserver(function () {
      observerCallbackCount += 1;
      scheduleSync();
    });
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'style', 'hidden', 'disabled'] });
    sync();
    document.dispatchEvent(new CustomEvent('gsh:mobile-landscape-change', { detail: { active: true } }));
  }

  function restoreInputs() {
    inputPolicies.forEach(function (original, input) {
      input.readOnly = original.readOnly;
      if (original.inputmode == null) input.removeAttribute('inputmode'); else input.setAttribute('inputmode', original.inputmode);
    });
    inputPolicies.clear();
  }

  function restoreControls() {
    controlPolicies.forEach(function (disabled, control) { control.disabled = disabled; });
    controlPolicies.clear();
  }

  function restoreDynamicMainActions() {
    qa('[data-game-flow-status]', stage).forEach(function (status) {
      var key = status.getAttribute('data-game-flow-status');
      var next = qa('[data-game-flow-key]').filter(function (node) {
        return node.getAttribute('data-game-flow-key') === key;
      })[0] || null;
      if (!next) return;
      var pause = qa('[data-game-flow-pause]', stage).filter(function (node) {
        return node.getAttribute('data-game-flow-pause') === key;
      })[0] || null;
      restoreExistingNode(next);
      restoreExistingNode(status);
      if (next.parentNode) next.parentNode.insertBefore(status, next);
      if (pause) {
        restoreExistingNode(pause);
        if (next.parentNode) {
          if (next.nextSibling) next.parentNode.insertBefore(pause, next.nextSibling);
          else next.parentNode.appendChild(pause);
        }
      }
    });
  }

  function deactivate() {
    if (!active) return;
    active = false;
    if (observer) observer.disconnect();
    observer = null;
    closeDropdowns();
    restoreInputs();
    restoreControls();
    qa('[data-gsh-side], [data-gsh-side-index], [data-gsh-side-count], [data-gsh-ml-split], [data-gsh-ml-role], [data-gsh-ml-custom-input]').forEach(function (node) {
      node.removeAttribute('data-gsh-side');
      node.removeAttribute('data-gsh-side-index');
      node.removeAttribute('data-gsh-side-count');
      node.removeAttribute('data-gsh-ml-split');
      node.removeAttribute('data-gsh-ml-role');
      node.removeAttribute('data-gsh-ml-custom-input');
    });
    qa('[data-gsh-ml-tool-label]').forEach(function (node) { node.removeAttribute('data-gsh-ml-tool-label'); });
    var keyboardToggle = q('[data-gsh-ml-keyboard-toggle]');
    if (keyboardToggle) keyboardToggle.removeAttribute('data-gsh-ml-keyboard-toggle');
    clearListeningKeyboard();
    restoreActiveResultDetail(null, false);
    restoreActiveResult(null, false);
    restoreDynamicMainActions();
    restoreAll();
    if (stage) stage.remove();
    stage = null;
    slots = Object.create(null);
    document.body.classList.remove('gsh-ml-active', 'gsh-ml-login-open');
    document.dispatchEvent(new CustomEvent('gsh:mobile-landscape-change', { detail: { active: false } }));
  }

  function handleMedia() { if (media.matches) activate(); else deactivate(); }
  function destroy() {
    var lifecycle = resolveExclusiveView(document.body.getAttribute('data-gsh-game') || '');
    var detailRoot = activeResultDetailRoot || lifecycle.detail;
    var detailOwner = activeResultDetailOwner || lifecycle.detailOwner;
    var resultRoot = activeResultRoot || lifecycle.result || detailOwner;
    deactivate();
    if (window.GameFlow && typeof window.GameFlow.unmarkResultDetail === 'function' && (detailRoot || detailOwner)) {
      window.GameFlow.unmarkResultDetail(detailOwner, detailRoot);
    }
    if (window.GameFlow && typeof window.GameFlow.unmarkResult === 'function' && resultRoot) {
      window.GameFlow.unmarkResult(resultRoot);
    }
    if (media.removeEventListener) media.removeEventListener('change', handleMedia); else if (media.removeListener) media.removeListener(handleMedia);
    document.removeEventListener('click', documentClick, true);
    document.removeEventListener('keydown', documentKeydown, true);
    document.removeEventListener('focusin', scheduleSync, true);
    document.removeEventListener('focusout', scheduleSync, true);
    window.removeEventListener('keydown', windowKeydown, true);
    window.removeEventListener('pointerdown', windowPointerGuard, true);
    window.removeEventListener('click', windowPointerGuard, true);
    if (window.visualViewport) window.visualViewport.removeEventListener('resize', scheduleSync);
  }
  function documentClick(event) {
    if (!active) return;
    if (!event.target.closest('.gsh-ml-dropdown')) closeDropdowns();
    scheduleSync();
  }
  function exclusiveRegion() { return stage && q('.gsh-ml-exclusive', stage); }
  function isExclusiveView() {
    return stage && stage.getAttribute('data-gsh-ml-view') !== 'gameplay';
  }
  function windowPointerGuard(event) {
    if (!active || !isExclusiveView()) return;
    var exclusive = exclusiveRegion();
    if (exclusive && event.target && exclusive.contains(event.target)) return;
    if (event.preventDefault) event.preventDefault();
    if (event.stopImmediatePropagation) event.stopImmediatePropagation();
  }
  function windowKeydown(event) {
    if (!active || !isExclusiveView()) return;
    var exclusive = exclusiveRegion();
    var insideExclusive = !!(exclusive && event.target && exclusive.contains(event.target));
    var viewName = stage.getAttribute('data-gsh-ml-view');
    if (event.key === 'Escape' && stage.getAttribute('data-gsh-ml-view') === 'custom-input') {
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
      scheduleSync();
      if (event.preventDefault) event.preventDefault();
      if (event.stopImmediatePropagation) event.stopImmediatePropagation();
      return;
    }
    if (!insideExclusive && viewName === 'result' && event.key === 'Enter' && !event.repeat && !event.isComposing &&
        !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
      var replay = activeResultRoot && q('[data-game-result-replay="v1"]', exclusive);
      if (replay && !replay.hidden && !replay.disabled) {
        if (event.preventDefault) event.preventDefault();
        if (event.stopImmediatePropagation) event.stopImmediatePropagation();
        replay.click();
        return;
      }
    }
    if (insideExclusive) return;
    if (event.preventDefault) event.preventDefault();
    if (event.stopImmediatePropagation) event.stopImmediatePropagation();
  }
  function documentKeydown(event) {
    if (!active || event.key !== 'Escape') return;
    closeDropdowns();
    if (stage && stage.getAttribute('data-gsh-ml-view') === 'custom-input') {
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
      scheduleSync();
    }
  }

  if (media.addEventListener) media.addEventListener('change', handleMedia); else if (media.addListener) media.addListener(handleMedia);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', scheduleSync);
  document.addEventListener('click', documentClick, true);
  document.addEventListener('keydown', documentKeydown, true);
  document.addEventListener('focusin', scheduleSync, true);
  document.addEventListener('focusout', scheduleSync, true);
  window.addEventListener('keydown', windowKeydown, true);
  window.addEventListener('pointerdown', windowPointerGuard, true);
  window.addEventListener('click', windowPointerGuard, true);
  window.addEventListener('pagehide', destroy, { once: true });

  var api = { query: QUERY, activate: activate, sync: sync, deactivate: deactivate, destroy: destroy };
  if (window.__GSH_ML_TEST__) {
    api.__test = {
      mountExistingNode: mountExistingNode,
      restoreAll: restoreAll,
      cleanupStaleMovedNodes: cleanupStaleMovedNodes,
      syncKeyboard: syncKeyboard,
      restoreDynamicMainActions: restoreDynamicMainActions,
      assignSides: assignSides,
      windowKeydown: windowKeydown,
      windowPointerGuard: windowPointerGuard,
      setSlot: function (name, node) { slots[name] = node; },
      state: function () {
        return {
          active: active,
          stage: stage,
          movedCount: moved.size,
          moveOrderLength: moveOrder.length,
          activeResultRoot: activeResultRoot,
          activeResultActionCount: activeResultActions.length,
          activeResultDetailRoot: activeResultDetailRoot,
          activeResultDetailOwner: activeResultDetailOwner,
          syncCount: syncCount,
          mountMoveCount: mountMoveCount,
          observerCallbackCount: observerCallbackCount,
          listeningKeyboard: listeningKeyboard,
          listeningShifted: listeningShifted
        };
      }
    };
  }
  window.GSHMobileLandscape = api;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', handleMedia, { once: true }); else handleMedia();
})(window, document);
