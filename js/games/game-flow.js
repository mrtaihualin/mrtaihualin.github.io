/*
 * Shared locked game flow for the five practice games.
 * UI only: scoring, SRS, mastered state, and game-specific answer rules stay in each game.
 */
(function (window, document) {
  'use strict';

  var flows = Object.create(null);
  var resultFlows = Object.create(null);
  var activeResultReplay = null;
  var SRS_QUOTA_KEY = 'gsh_srs_quota_v1';

  function resolveElement(value) {
    if (!value) return null;
    return typeof value === 'string' ? document.querySelector(value) : value;
  }

  function clearFlow(key, keepMessage) {
    var flow = flows[key];
    if (!flow) return;
    flow.token += 1;
    if (flow.timer) window.clearTimeout(flow.timer);
    if (!keepMessage && flow.status) flow.status.textContent = '';
    if (flow.pauseButton) flow.pauseButton.hidden = true;
    delete flows[key];
  }

  function ensureControls(key, nextButton) {
    var parent = nextButton.parentNode;
    if (!parent) return null;

    var status = parent.querySelector('[data-game-flow-status="' + key + '"]');
    if (!status) {
      status = document.createElement('span');
      status.className = 'gsh-next-countdown';
      status.id = 'gsh-next-countdown-' + String(key).replace(/[^a-z0-9_-]+/gi, '-');
      status.setAttribute('data-game-flow-status', key);
      status.setAttribute('aria-live', 'polite');
      status.setAttribute('aria-atomic', 'true');
      parent.insertBefore(status, nextButton);
    }

    var pauseButton = parent.querySelector('[data-game-flow-pause="' + key + '"]');
    if (!pauseButton) {
      pauseButton = document.createElement('button');
      pauseButton.type = 'button';
      pauseButton.className = 'btn btn-secondary gsh-pause-btn';
      pauseButton.setAttribute('data-game-flow-pause', key);
      pauseButton.textContent = '暫停';
      if (nextButton.nextSibling) parent.insertBefore(pauseButton, nextButton.nextSibling);
      else parent.appendChild(pauseButton);
    }
    pauseButton.hidden = false;
    return { status: status, pauseButton: pauseButton };
  }

  function start(options) {
    options = options || {};
    var key = String(options.key || 'default');
    var nextButton = resolveElement(options.nextButton);
    if (!nextButton || nextButton.disabled || nextButton.offsetParent === null) return false;

    clearFlow(key);
    var controls = ensureControls(key, nextButton);
    if (!controls) return false;

    var delaySeconds = Number(options.delaySeconds) || 3;
    var flow = {
      token: 1,
      timer: null,
      status: controls.status,
      pauseButton: controls.pauseButton,
      nextButton: nextButton,
      remaining: delaySeconds,
      paused: false
    };
    flows[key] = flow;
    var token = flow.token;

    function immediate() {
      clearFlow(key);
    }
    if (!nextButton.__gshImmediateHandler) {
      nextButton.__gshImmediateHandler = function () {
        var activeKey = nextButton.getAttribute('data-game-flow-key');
        if (activeKey) clearFlow(activeKey);
      };
      nextButton.addEventListener('click', nextButton.__gshImmediateHandler, true);
    }
    nextButton.setAttribute('data-game-flow-key', key);
    nextButton.setAttribute('aria-describedby', controls.status.id || '');

    controls.pauseButton.onclick = function () {
      var active = flows[key];
      if (!active || active.token !== token) return;
      active.paused = true;
      if (active.timer) window.clearTimeout(active.timer);
      active.status.textContent = '已暫停，準備好時按「下一題」繼續';
      active.pauseButton.hidden = true;
      nextButton.focus();
      try {
        if (typeof window.gtag === 'function') window.gtag('event', 'game_auto_next_pause', { category: 'game', game: key });
      } catch (e) {}
    };

    function tick() {
      var active = flows[key];
      if (!active || active.token !== token || active.paused) return;
      if (active.remaining <= 0) {
        immediate();
        if (typeof options.beforeNext === 'function') options.beforeNext();
        nextButton.click();
        return;
      }
      active.status.textContent = String(active.remaining);
      active.remaining -= 1;
      active.timer = window.setTimeout(tick, 1000);
    }

    tick();
    return true;
  }

  function markResult(root) {
    root = resolveElement(root);
    if (!root) return false;
    root.classList.add('gsh-shared-result');
    root.setAttribute('data-shared-result-ui', 'v1');
    return true;
  }

  function safeRead(key, fallback) {
    try {
      var raw = window.localStorage && window.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  }

  function safeWrite(key, value) {
    try {
      if (window.localStorage) window.localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {}
  }

  // Product Decision: Guest/Login Free have no cross-round personalized feedback.
  // Keep the public hooks inert for compatibility with older callers.
  function feedbackCopy() { return null; }
  function recordResultFeedback() { return null; }

  function attachReport(root, report) {
    root = resolveElement(root);
    if (!root || !window.RoundReport) return false;
    var html = RoundReport.loginSectionsHtml(report);
    var slot = root.querySelector('.gsh-login-report-sections');
    if (!html) {
      if (slot && slot.parentNode) slot.parentNode.removeChild(slot);
      return false;
    }
    if (!slot) {
      slot = document.createElement('div');
      slot.className = 'gsh-login-report-sections';
      root.appendChild(slot);
    }
    slot.innerHTML = html;
    return true;
  }

  function cancelResult(key, keepMessage) {
    key = String(key || 'default');
    var flow = resultFlows[key];
    if (!flow) return;
    flow.token += 1;
    if (flow.timer) window.clearTimeout(flow.timer);
    if (!keepMessage && flow.status) flow.status.textContent = '';
    delete resultFlows[key];
  }

  function startResultCountdown(options) {
    options = options || {};
    var key = String(options.key || 'default');
    var status = resolveElement(options.status);
    if (!status) return false;
    cancelResult(key);
    var flow = {
      token: 1,
      timer: null,
      status: status,
      remaining: Number(options.seconds) || 7
    };
    resultFlows[key] = flow;
    var token = flow.token;
    function tick() {
      var active = resultFlows[key];
      if (!active || active.token !== token) return;
      if (active.remaining <= 0) {
        cancelResult(key, true);
        active.status.textContent = '';
        if (typeof options.onComplete === 'function') options.onComplete();
        return;
      }
      active.status.textContent = '下一輪將在 ' + active.remaining + ' 秒後開始';
      active.remaining -= 1;
      active.timer = window.setTimeout(tick, 1000);
    }
    tick();
    return true;
  }

  function ensureResultMeta(root, actions) {
    var meta = root.querySelector('[data-game-result-meta="v1"]');
    if (meta) return meta;
    meta = document.createElement('div');
    meta.className = 'gsh-result-meta';
    meta.setAttribute('data-game-result-meta', 'v1');
    if (actions && actions.parentNode === root) root.insertBefore(meta, actions);
    else root.appendChild(meta);
    return meta;
  }

  function enhanceResult(options) {
    options = options || {};
    var root = resolveElement(options.root);
    if (!root) return false;
    markResult(root);
    var actions = resolveElement(options.actions) || root.querySelector('.gsh-end-actions');
    var replay = root.querySelector('[data-game-result-replay="v1"]');
    var meta = ensureResultMeta(root, actions);
    while (meta.firstChild) meta.removeChild(meta.firstChild);

    function line(className, text) {
      var el = document.createElement('div');
      el.className = className;
      el.textContent = text;
      meta.appendChild(el);
      return el;
    }

    var correct = Math.max(0, Number(options.correct) || 0);
    var total = Math.max(0, Number(options.total) || 0);
    var reportItems = options.report && Array.isArray(options.report.items) ? options.report.items : null;
    var completed = reportItems ? reportItems.length : total;
    var firstCorrect = reportItems ? reportItems.filter(function (item) {
      var firstAttempt = item && item.attempts && item.attempts[0];
      return !!(item && item.is_correct && !item.hint_used && Number(item.wrong_count || 0) === 0 && (!firstAttempt || firstAttempt.is_correct));
    }).length : correct;
    var resultCopy = window.GameUiCopy && window.GameUiCopy.result || { completed: '完成', firstCorrect: '首次答對' };
    line('gsh-result-completed', resultCopy.completed + ' ' + completed + ' / ' + total);
    line('gsh-result-first-correct', resultCopy.firstCorrect + ' ' + firstCorrect + ' / ' + total);
    if (options.loginSrs === true) line('gsh-result-srs', '帳號的 SRS 狀態已列在下方。');
    var feedback = options.feedback || null;
    if (feedback && feedback.text) line('gsh-result-feedback', feedback.text);
    (options.highlights || []).filter(Boolean).slice(0, 2).forEach(function (text) {
      line('gsh-result-highlight', String(text));
    });
    var countdown = line('gsh-result-countdown', '');

    var key = String(options.key || 'default');
    if (actions && !actions.__gshResultCancelBound) {
      actions.__gshResultCancelBound = true;
      actions.addEventListener('click', function () { cancelResult(key); }, true);
    }
    startResultCountdown({
      key: key,
      status: countdown,
      seconds: 7,
      onComplete: options.onReplay
    });
    activeResultReplay = replay ? { key: key, root: root, button: replay } : null;
    if (options.report) {
      attachReport(root, options.report);
      // P1-D-05: a completed RoundReport is the only client-side source for
      // durable Played evidence. PracticeEvents performs its own Login,
      // schema, retry and owner-generation checks before writing anything.
      if (window.PracticeEvents && typeof window.PracticeEvents.submitReport === 'function') {
        window.PracticeEvents.submitReport(options.report).catch(function () {});
      }
    }
    return feedback;
  }

  document.addEventListener('keydown', function (event) {
    if (!activeResultReplay || event.key !== 'Enter' || event.defaultPrevented || event.repeat || event.isComposing) return;
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    var target = event.target || document.activeElement;
    if (target && target.closest && target.closest('input,textarea,select,button,a,[contenteditable="true"]')) return;
    var root = activeResultReplay.root;
    var button = activeResultReplay.button;
    if (!root || !button || root.hidden || button.hidden || button.disabled) return;
    var rootStyle = window.getComputedStyle ? window.getComputedStyle(root) : root.style;
    var buttonStyle = window.getComputedStyle ? window.getComputedStyle(button) : button.style;
    if ((rootStyle && (rootStyle.display === 'none' || rootStyle.visibility === 'hidden')) ||
        (buttonStyle && (buttonStyle.display === 'none' || buttonStyle.visibility === 'hidden'))) return;
    event.preventDefault();
    cancelResult(activeResultReplay.key);
    button.click();
  });

  function uniqueItems(items, idOf, seen) {
    var output = [];
    (items || []).forEach(function (item) {
      var id = String(idOf(item));
      if (!id || seen[id]) return;
      seen[id] = true;
      output.push(item);
    });
    return output;
  }

  function distributeDue(due, regular) {
    var output = regular.slice();
    due.forEach(function (item, index) {
      var position = Math.floor(((index + 1) * (output.length + 1)) / (due.length + 1));
      output.splice(Math.min(position, output.length), 0, item);
    });
    return output;
  }

  function allocateSrs(options) {
    options = options || {};
    var tier = options.tier === 'paid' ? 'paid' : (options.tier === 'free' ? 'free' : 'guest');
    var ratio = tier === 'paid' ? 0.30 : (tier === 'free' ? 0.20 : 0);
    var reviewLimit = tier === 'paid' ? 4 : (tier === 'free' ? 1 : 0);
    var total = Math.max(0, Math.floor(Number(options.total) || 0));
    var idOf = typeof options.idOf === 'function' ? options.idOf : function (item) { return item && (item.id || item.th || item.word); };
    var seen = Object.create(null);
    var due = uniqueItems(options.due, idOf, seen);
    var regular = uniqueItems(options.regular, idOf, seen);
    var quotaState = safeRead(SRS_QUOTA_KEY, {});
    if (!quotaState || typeof quotaState !== 'object' || Array.isArray(quotaState)) {
      quotaState = {};
    }
    var scope = String(options.scope || 'default') + ':' + tier;
    // Negative carry is quota debt from a round that had no regular items left.
    // It prevents an all-Due queue from producing an empty round while preserving
    // the configured ratio over later rounds as regular items become available.
    var carriedFraction = Math.max(-100, Math.min(0.999999, Number(quotaState[scope]) || 0));
    var exactQuota = total * ratio + carriedFraction;
    var dueLimit = Math.max(0, Math.floor(exactQuota + 0.0000001));
    quotaState[scope] = exactQuota - dueLimit;
    safeWrite(SRS_QUOTA_KEY, quotaState);

    var selectedDue = due.slice(0, Math.min(dueLimit, total));
    var selectedRegular = regular.slice(0, Math.max(0, total - selectedDue.length));
    var missing = Math.max(0, total - selectedDue.length - selectedRegular.length);
    if (missing > 0) {
      var emergencyDue = due.slice(selectedDue.length, selectedDue.length + missing);
      selectedDue = selectedDue.concat(emergencyDue);
      quotaState[scope] -= emergencyDue.length;
      safeWrite(SRS_QUOTA_KEY, quotaState);
    }
    var items = distributeDue(selectedDue, selectedRegular).slice(0, total);
    return {
      tier: tier,
      ratio: ratio,
      reviewLimit: reviewLimit,
      quota: dueLimit,
      items: items,
      selectedDue: selectedDue,
      carryOverDue: due.slice(selectedDue.length),
      fractionCarry: quotaState[scope]
    };
  }

  // Cross-device rule: keep one canonical state only. Never merge two rounds.
  // The remote adapter/schema is intentionally outside this source-safe module.
  function selectLatestSuccessful(states) {
    return (states || []).filter(function (state) {
      return state && state.saved !== false && Number(state._savedAt) > 0;
    }).sort(function (a, b) {
      return Number(b._savedAt) - Number(a._savedAt);
    })[0] || null;
  }

  function normalizeResumeUI() {
    var banners = document.querySelectorAll ? document.querySelectorAll('.gsh-resume-banner') : [];
    Array.prototype.forEach.call(banners, function (banner) {
      var title = banner.querySelector('.gsh-resume-title');
      var continueButton = banner.querySelector('.gsh-resume-continue');
      var restartButton = banner.querySelector('.gsh-resume-restart');
      var newButton = banner.querySelector('.gsh-resume-new');
      if (title) title.textContent = '上次的安全進度還在';
      if (continueButton) continueButton.textContent = '繼續上次練習';
      if (restartButton) restartButton.textContent = '重新開始本次練習';
      if (newButton) newButton.textContent = '開始新一輪';
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', normalizeResumeUI);
  else normalizeResumeUI();

  window.GameFlow = {
    start: start,
    cancel: function (key) { clearFlow(String(key || 'default')); },
    cancelResult: cancelResult,
    startResultCountdown: startResultCountdown,
    enhanceResult: enhanceResult,
    attachReport: attachReport,
    feedbackCopy: feedbackCopy,
    recordResultFeedback: recordResultFeedback,
    allocateSrs: allocateSrs,
    markResult: markResult,
    selectLatestSuccessful: selectLatestSuccessful,
    copy: {
      correct: '做得很好，繼續保持 🌱',
      retry: '沒關係，再試一次就會更熟悉 🌱',
      revealed: '這題先記住，下一次會更順 🌱'
    }
  };
})(window, document);
