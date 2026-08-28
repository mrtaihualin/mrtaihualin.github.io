/* Tone-only mobile-landscape stage. Moves live nodes and restores them on exit. */
(function (window, document) {
  'use strict';

  if (window.GSHToneMobileLandscape) return;

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
  var activeResultRoot = null;
  var activeResultActions = [];
  var activeResultDetailRoot = null;
  var activeResultDetailOwner = null;
  var syncCount = 0;
  var mountMoveCount = 0;
  var observerCallbackCount = 0;
  var toneSummaryActions = [];
  var toneSummaryScrollPad = null;
  var toneSummaryDrag = null;
  var toneSummaryDragMoved = false;

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
    center.append(makeSlot('question'), makeSlot('current-input'));
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

  function visualViewportBox() {
    var view = window.visualViewport;
    return {
      left: view ? (view.offsetLeft || 0) : 0,
      top: view ? (view.offsetTop || 0) : 0,
      width: view ? view.width : window.innerWidth,
      height: view ? view.height : window.innerHeight
    };
  }

  function stageSafeInset(side) {
    if (!stage) return 12;
    var style = window.getComputedStyle(stage);
    var value = parseFloat(style[side]);
    return Number.isFinite(value) ? value : 12;
  }

  // Level, Tools, Game and More share one coordinate path. This prevents an
  // iOS visual-viewport offset or a stale desktop rule from shifting only one
  // of the four menus away from the button that owns it.
  function positionPanelBelow(trigger, panel, fallbackWidth) {
    if (!trigger || !panel) return;
    var rect = trigger.getBoundingClientRect();
    var view = visualViewportBox();
    var safeLeft = stageSafeInset('paddingLeft');
    var safeRight = stageSafeInset('paddingRight');
    var safeTop = stageSafeInset('paddingTop');
    var minLeft = view.left + safeLeft;
    var maxRight = view.left + view.width - safeRight;
    var availableWidth = Math.max(1, maxRight - minLeft);
    var width = Math.min(panel.offsetWidth || fallbackWidth || 220, availableWidth);
    var left = Math.max(minLeft, Math.min(rect.left, maxRight - width));
    var top = Math.max(view.top + safeTop, rect.bottom + 4);
    panel.style.setProperty('top', Math.round(top) + 'px', 'important');
    panel.style.setProperty('left', Math.round(left) + 'px', 'important');
    panel.style.setProperty('right', 'auto', 'important');
    panel.style.setProperty('bottom', 'auto', 'important');
  }

  function syncUtilityPanels() {
    qa('.rg-ctl-wrap button[aria-controls]', stage).forEach(function (trigger) {
      var id = trigger.getAttribute('aria-controls');
      if (id !== 'game-switcher' && id !== 'core5-more-menu' && id !== 'grw-feedback-menu') return;
      var panel = document.getElementById(id);
      if (!panel) return;
      panel.setAttribute('data-gsh-ml-utility-panel', id === 'game-switcher' ? 'games' : 'more');
      if (!panel.classList.contains('gs-open')) return;
      positionPanelBelow(trigger, panel, 240);
    });
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
    var panelRegistryEntry = {
      isOpen: function () { return root.isConnected && !panel.hidden; },
      close: function () {
        panel.hidden = true;
        trigger.setAttribute('aria-expanded', 'false');
      }
    };
    if (window.GamePanels) window.GamePanels.add(panelRegistryEntry);
    trigger.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();
      var open = panel.hidden;
      closeDropdowns();
      if (open && window.GamePanels) window.GamePanels.closeOthers(panelRegistryEntry);
      panel.hidden = !open;
      trigger.setAttribute('aria-expanded', String(open));
      if (open) positionPanelBelow(trigger, panel, 220);
    });
    root.append(trigger, panel);
    slot('dropdowns').appendChild(root);
    nodes.forEach(function (node) { mountExistingNode(node, panel); });
    if (name === 'tools' && document.body.getAttribute('data-gsh-game') === 'tone') {
      panel.addEventListener('click', function (event) {
        var row = event.target.closest('[data-gsh-ml-tool-label]');
        if (!row || !panel.contains(row)) return;
        if (row.matches('button, a') || event.target.closest('button, a')) return;
        var control = q('button, a, [role="button"]', row);
        if (!control || control.disabled) return;
        event.preventDefault();
        event.stopPropagation();
        control.click();
        panelRegistryEntry.close();
      });
      panel.addEventListener('keydown', function (event) {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        var row = event.target.closest('[data-gsh-ml-proxy-tool="true"]');
        if (!row || !panel.contains(row)) return;
        var control = q('button, a, [role="button"]', row);
        if (!control || control.disabled) return;
        event.preventDefault();
        control.click();
        panelRegistryEntry.close();
      });
    }
    panel.addEventListener('click', function (event) {
      var action = event.target.closest('button, a, [role="button"]');
      if (!action || !panel.contains(action) || action.disabled) return;
      window.setTimeout(function () { panelRegistryEntry.close(); }, 0);
    });
    return root;
  }

  function nodesFor(selectors) {
    var result = [];
    selectors.forEach(function (selector) {
      qa(selector).forEach(function (node) { if (result.indexOf(node) < 0) result.push(node); });
    });
    return result;
  }

  function ensureToolLabelText(node) {
    if (!node) return;
    var text = q(':scope > .gsh-ml-tool-text', node);
    if (!text) {
      text = document.createElement('span');
      text.className = 'gsh-ml-tool-text';
      node.appendChild(text);
    }
    text.textContent = node.getAttribute('data-gsh-ml-tool-label') || '';
    if (!node.matches('button, a, [role="button"]') && q('button, a, [role="button"]', node)) {
      node.setAttribute('role', 'button');
      node.setAttribute('tabindex', '0');
      node.setAttribute('data-gsh-ml-proxy-tool', 'true');
    }
  }

  function labeledNode(selector, label, icon) {
    var node = q(selector);
    if (node) {
      node.setAttribute('data-gsh-ml-tool-label', label);
      if (icon) node.setAttribute('data-gsh-ml-tool-icon', icon);
      if (node.matches('button, a, [role="button"]')) node.setAttribute('data-gsh-ml-direct-tool', 'true');
      ensureToolLabelText(node);
    }
    return node;
  }
  function configureDropdowns() {
    slot('dropdowns').replaceChildren();
    var levels = nodesFor(['#tf-level-tabs']);
    var tools = [
      labeledNode('#tf-howto-btn', '玩法', '📖'),
      labeledNode('#tf-alpha-btn', '字母', '🔤'),
      labeledNode('#rg-pron-toggle', '讀音', '🗣️'),
      labeledNode('#zh-toggle-slot', '翻譯', '🌐'),
      labeledNode('#tf-vault-btn-slot', '單字庫', '📚'),
      labeledNode('#tf-guide-toggle', '提示', '💡'),
      labeledNode('#font-toggle-slot', '字體', '🅰️'),
      labeledNode('#tf-particle-toggle', '禮貌詞', '🙏')
    ];
    createDropdown('level', 'Level', levels);
    createDropdown('tools', 'Tools', tools);
  }

  function mountMany(selectors, target) {
    nodesFor(selectors).forEach(function (node) { mountExistingNode(node, target); });
  }

  function mountStaticGameNodes() {
    mountExistingNode(q('.tf-page-title'), slot('shared-controls'));
    mountExistingNode(q('.rg-ctl-wrap'), slot('main-action'));
    mountMany(['#tf-banner'], slot('question'));
    var toneBody = q('#tf-body');
    if (!toneBody || toneBody.getAttribute('data-shared-result-active') !== 'true') {
      mountExistingNode(toneBody, slot('question'));
    }
  }

  function assignSides(container) {
    if (!container) return;
    container.setAttribute('data-gsh-ml-split', 'tone');
    var children = Array.prototype.filter.call(container.children, isRenderableControl);
    Array.prototype.forEach.call(container.children, function (child) {
      child.removeAttribute('data-gsh-side');
      child.removeAttribute('data-gsh-side-index');
      child.removeAttribute('data-gsh-side-count');
    });
    var leftCount = children.length === 6 ? 3 : children.length === 3 ? 1 : children.length === 2 ? 1 : Math.ceil(children.length / 2);
    container.dataset.gshMaxSideCount = String(Math.max(leftCount, children.length - leftCount));
    var leftIndex = 0;
    var rightIndex = 0;
    children.forEach(function (child, index) {
      var side = index < leftCount ? 'left' : 'right';
      child.dataset.gshSide = side;
      child.dataset.gshSideIndex = String(side === 'left' ? leftIndex++ : rightIndex++);
      child.dataset.gshSideCount = String(side === 'left' ? leftCount : children.length - leftCount);
    });
  }

  function syncSplitContent() {
    var container = q('#tf-body .tf-options, #tf-body .tf-mark-opts, #tf-body .sg-tone-grid');
    if (!container) return;
    mountExistingNode(container, slot('split-content'));
    var uncertain = q('#tf-body .sg-dontknow-btn');
    if (uncertain) mountExistingNode(uncertain, container);
    assignSides(container);
  }

  function syncSharedSkip() {
    var skip = q('#tf-body .tf-known-btn');
    if (!skip) return;
    skip.setAttribute('data-gsh-ml-role', 'skip');
    mountExistingNode(skip, slot('current-input'));
  }

  function visibleResume() {
    return qa('#tf-resume-banner').filter(isSourceVisible)[0] || null;
  }

  function resolveExclusiveView() {
    var resume = visibleResume();
    var detail = qa('[data-shared-result-detail-ui="v1"][data-shared-result-detail-active="true"]').filter(isSourceVisible)[0] || null;
    var detailToken = detail && detail.getAttribute('data-shared-result-detail-owner');
    var detailOwner = detailToken ? qa('[data-shared-result-ui="v1"][data-shared-result-detail-owner]').filter(function (node) {
      return node.getAttribute('data-shared-result-detail-owner') === detailToken;
    })[0] || null : null;
    var result = qa('[data-shared-result-ui="v1"][data-shared-result-active="true"]').filter(isSourceVisible)[0] || null;
    return { custom: null, resume: resume, result: result, detail: detail, detailOwner: detailOwner };
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

  function syncExclusiveView(view) {
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
  }

  function syncDynamicMainAction() {
    mountMany(['.gsh-next-countdown', '.gsh-pause-btn'], slot('main-action'));
  }

  function syncToneRevealActions() {
    var audio = q('.result-v2-word .word-audio-btn');
    var english = q('#tf-result-en-btn');
    var next = q('#tf-session-next-btn');
    if (audio) {
      audio.setAttribute('data-gsh-ml-role', 'result-audio');
      mountExistingNode(audio, slot('right'));
    }
    if (english) {
      english.setAttribute('data-gsh-ml-role', 'result-english');
      mountExistingNode(english, slot('right'));
    }
    if (next) {
      next.setAttribute('data-gsh-ml-role', 'result-next');
      mountExistingNode(next, slot('right'));
    }
  }

  function restoreToneSummaryLayout() {
    toneSummaryActions.slice().forEach(restoreExistingNode);
    toneSummaryActions = [];
    if (toneSummaryScrollPad) toneSummaryScrollPad.remove();
    toneSummaryScrollPad = null;
    toneSummaryDrag = null;
    toneSummaryDragMoved = false;
  }

  function toneSummaryScroller() {
    var body = q('#tf-body');
    return body && q('.tf-session-summary', body) ? body : null;
  }

  function scrollToneSummaryBy(delta) {
    var scroller = toneSummaryScroller();
    if (!scroller) return;
    var max = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
    scroller.scrollTop = Math.max(0, Math.min(max, scroller.scrollTop + delta));
  }

  function createToneSummaryScrollPad() {
    var pad = document.createElement('button');
    pad.type = 'button';
    pad.className = 'gsh-ml-summary-scroll-pad';
    pad.setAttribute('data-gsh-ml-role', 'summary-scroll');
    pad.setAttribute('aria-label', '上下滑動查看結果內容');
    pad.innerHTML = '<span aria-hidden="true">↕</span><small>滑動內容</small>';
    pad.addEventListener('click', function (event) {
      if (toneSummaryDragMoved) {
        toneSummaryDragMoved = false;
        event.preventDefault();
        return;
      }
      var scroller = toneSummaryScroller();
      if (!scroller) return;
      var max = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
      var delta = Math.max(80, Math.round(scroller.clientHeight * 0.72));
      scrollToneSummaryBy(scroller.scrollTop >= max - 2 ? -max : delta);
    });
    pad.addEventListener('wheel', function (event) {
      scrollToneSummaryBy(event.deltaY);
      event.preventDefault();
    }, { passive: false });
    pad.addEventListener('pointerdown', function (event) {
      var scroller = toneSummaryScroller();
      if (!scroller) return;
      toneSummaryDrag = { id: event.pointerId, y: event.clientY, top: scroller.scrollTop };
      toneSummaryDragMoved = false;
      try { pad.setPointerCapture(event.pointerId); } catch (ignore) {}
    });
    pad.addEventListener('pointermove', function (event) {
      if (!toneSummaryDrag || toneSummaryDrag.id !== event.pointerId) return;
      var scroller = toneSummaryScroller();
      if (!scroller) return;
      var distance = toneSummaryDrag.y - event.clientY;
      if (Math.abs(distance) > 4) toneSummaryDragMoved = true;
      scroller.scrollTop = toneSummaryDrag.top + distance;
      event.preventDefault();
    });
    function endDrag(event) {
      if (!toneSummaryDrag || toneSummaryDrag.id !== event.pointerId) return;
      toneSummaryDrag = null;
    }
    pad.addEventListener('pointerup', endDrag);
    pad.addEventListener('pointercancel', endDrag);
    return pad;
  }

  function syncToneSummaryLayout(exclusiveView) {
    var summary = q('#tf-body .tf-session-summary');
    if (!summary || (exclusiveView && exclusiveView.detail)) {
      restoreToneSummaryLayout();
      return;
    }
    var replay = toneSummaryActions[0] && toneSummaryActions[0].isConnected
      ? toneSummaryActions[0]
      : q('[data-game-result-replay="v1"]', summary);
    if (!replay) {
      restoreToneSummaryLayout();
      return;
    }
    var useExclusive = !!(exclusiveView && exclusiveView.result);
    var rightTarget = useExclusive ? slot('exclusive-right') : slot('right');
    var leftTarget = useExclusive ? slot('exclusive-left') : slot('left');
    replay.setAttribute('data-gsh-ml-role', 'summary-replay');
    mountExistingNode(replay, rightTarget);
    toneSummaryActions = [replay];
    if (!toneSummaryScrollPad) toneSummaryScrollPad = createToneSummaryScrollPad();
    if (toneSummaryScrollPad.parentNode !== leftTarget) leftTarget.appendChild(toneSummaryScrollPad);
  }

  function sync() {
    if (!active || !stage || syncing) return;
    syncing = true;
    syncCount += 1;
    try {
      cleanupStaleMovedNodes();
      var exclusiveView = resolveExclusiveView();
      prepareExclusiveView(exclusiveView);
      mountStaticGameNodes();
      syncSplitContent();
      syncSharedSkip();
      syncDynamicMainAction();
      syncToneRevealActions();
      syncToneSummaryLayout(exclusiveView);
      syncExclusiveView(exclusiveView);
      qa('[data-gsh-ml-tool-label]').forEach(ensureToolLabelText);
      syncUtilityPanels();
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
    configureDropdowns();
    mountStaticGameNodes();
    observer = new MutationObserver(function () {
      observerCallbackCount += 1;
      scheduleSync();
    });
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'style', 'hidden', 'disabled'] });
    sync();
    document.dispatchEvent(new CustomEvent('gsh:mobile-landscape-change', { detail: { active: true } }));
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
    qa('[data-gsh-side], [data-gsh-side-index], [data-gsh-side-count], [data-gsh-max-side-count], [data-gsh-ml-split], [data-gsh-ml-role], [data-gsh-ml-custom-input]').forEach(function (node) {
      node.removeAttribute('data-gsh-side');
      node.removeAttribute('data-gsh-side-index');
      node.removeAttribute('data-gsh-side-count');
      node.removeAttribute('data-gsh-max-side-count');
      node.removeAttribute('data-gsh-ml-split');
      node.removeAttribute('data-gsh-ml-role');
      node.removeAttribute('data-gsh-ml-custom-input');
    });
    qa('[data-gsh-ml-tool-label]').forEach(function (node) {
      node.removeAttribute('data-gsh-ml-tool-label');
      node.removeAttribute('data-gsh-ml-tool-icon');
      node.removeAttribute('data-gsh-ml-direct-tool');
      if (node.getAttribute('data-gsh-ml-proxy-tool') === 'true') {
        node.removeAttribute('role');
        node.removeAttribute('tabindex');
        node.removeAttribute('data-gsh-ml-proxy-tool');
      }
      var text = q(':scope > .gsh-ml-tool-text', node);
      if (text) text.remove();
    });
    qa('[data-gsh-ml-utility-panel]').forEach(function (panel) {
      panel.removeAttribute('data-gsh-ml-utility-panel');
      panel.style.removeProperty('top');
      panel.style.removeProperty('left');
      panel.style.removeProperty('right');
      panel.style.removeProperty('bottom');
    });
    restoreToneSummaryLayout();
    restoreActiveResultDetail(null, false);
    restoreActiveResult(null, false);
    restoreDynamicMainActions();
    restoreAll();
    if (stage) stage.remove();
    stage = null;
    slots = Object.create(null);
    document.body.classList.remove('gsh-ml-active');
    document.dispatchEvent(new CustomEvent('gsh:mobile-landscape-change', { detail: { active: false } }));
  }

  function handleMedia() { if (media.matches) activate(); else deactivate(); }
  function destroy() {
    var lifecycle = resolveExclusiveView();
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
    if (window.visualViewport) {
      window.visualViewport.removeEventListener('resize', visualViewportChanged);
      window.visualViewport.removeEventListener('scroll', visualViewportChanged);
    }
    window.removeEventListener('resize', visualViewportChanged);
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
    if (event.key === 'Escape' && stage.getAttribute('data-gsh-ml-view') === 'custom-input') {
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
      scheduleSync();
      if (event.preventDefault) event.preventDefault();
      if (event.stopImmediatePropagation) event.stopImmediatePropagation();
      return;
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

  function visualViewportChanged() {
    if (!active) return;
    syncUtilityPanels();
    qa('.gsh-ml-dropdown', stage).forEach(function (root) {
      var trigger = q('.gsh-ml-dropdown-trigger', root);
      var panel = q('.gsh-ml-dropdown-panel', root);
      if (trigger && panel && !panel.hidden) positionPanelBelow(trigger, panel, 220);
    });
    scheduleSync();
  }

  if (media.addEventListener) media.addEventListener('change', handleMedia); else if (media.addListener) media.addListener(handleMedia);
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', visualViewportChanged);
    window.visualViewport.addEventListener('scroll', visualViewportChanged);
  }
  window.addEventListener('resize', visualViewportChanged);
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
          observerCallbackCount: observerCallbackCount
        };
      }
    };
  }
  window.GSHToneMobileLandscape = api;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', handleMedia, { once: true }); else handleMedia();
})(window, document);
