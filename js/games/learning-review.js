/* Login Free pre-SRS Review owner and cumulative 20% played-set allocator. */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.LearningReview = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  var FEATURE_DEFAULT_ENABLED = false;
  var STORAGE_KEY = 'gsh_review_quota_v1';
  var queues = Object.create(null);
  var rounds = Object.create(null);
  var latestRound = Object.create(null);

  function fail(code) { var error = new Error(code); error.code = code; throw error; }
  function normalizeGame(value) {
    var game = String(value || '').toLowerCase().replace(/-/g, '_');
    if (game === 'wordorder') game = 'word_order';
    if (['tone', 'reading', 'listening', 'typing', 'word_order'].indexOf(game) < 0) fail('INVALID_GAME');
    return game;
  }
  function normalizeLevel(value) {
    var levels = { '1': 1, '2': 2, '3': 3, '初': 1, '中': 2, '高': 3 };
    var level = levels[String(value == null ? '' : value)];
    if (!level) fail('INVALID_LEVEL');
    return level;
  }
  function keyOfRef(ref) { return String(ref && ref.source || '') + ':' + String(ref && ref.key || ''); }
  function readState(storage) {
    try {
      var value = JSON.parse(storage && storage.getItem(STORAGE_KEY) || '{}');
      return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    } catch (e) { return {}; }
  }
  function writeState(storage, value) {
    try { if (storage) storage.setItem(STORAGE_KEY, JSON.stringify(value)); } catch (e) {}
  }
  function unique(items, idOf, seen) {
    var out = [];
    (items || []).forEach(function (item) {
      var id = String(idOf(item) || '');
      if (!id || seen[id]) return;
      seen[id] = true;
      out.push(item);
    });
    return out;
  }

  function allocate(options) {
    options = options || {};
    var total = Math.max(0, Math.floor(Number(options.total) || 0));
    var idOf = typeof options.idOf === 'function' ? options.idOf : function (item) { return item && (item.contentKey || item.th || item.word); };
    var state = readState(options.storage);
    var scope = String(options.scope || 'default');
    var carried = Math.max(0, Math.min(0.999999, Number(state[scope]) || 0));
    var exact = total * 0.20 + carried;
    var limit = Math.max(0, Math.floor(exact + 0.0000001));
    state[scope] = exact - limit;
    writeState(options.storage, state);

    var seen = Object.create(null);
    var due = unique(options.reviewDue, idOf, seen);
    var selectedReview = due.slice(0, Math.min(limit, total));
    var tailSeen = Object.create(null);
    due.forEach(function (item) { tailSeen[String(idOf(item))] = true; });
    var srsDue = unique(options.srsDue, idOf, tailSeen);
    var regular = unique(options.regular, idOf, tailSeen);
    var remaining = Math.max(0, total - selectedReview.length);
    var tail, srsAllocation = null;
    if (typeof options.allocateSrs === 'function') {
      srsAllocation = options.allocateSrs({
        tier: 'free', total: remaining, quotaTotal: total,
        due: srsDue, regular: regular, idOf: idOf, scope: String(options.srsScope || scope),
      });
      tail = srsAllocation.items;
    } else tail = srsDue.concat(regular).slice(0, remaining);
    return {
      items: selectedReview.concat(tail).slice(0, total),
      selectedReview: selectedReview,
      selectedSrs: srsAllocation && srsAllocation.selectedDue || [],
      reviewCarryOver: due.slice(selectedReview.length),
      fractionCarry: state[scope],
    };
  }

  function create(options) {
    options = options || {};
    if (options.enabled !== true) fail('FEATURE_DISABLED');
    if (typeof options.invoke !== 'function') fail('TRANSPORT_UNAVAILABLE');
    var invoke = options.invoke;
    return {
      loadQueue: function (input) {
        return Promise.resolve(invoke({ action: 'review_queue', game: input.game, level: input.level, play_set_size: input.playSetSize }))
          .then(function (result) {
            if (!result || result.ok !== true || !Array.isArray(result.items)) fail('REVIEW_QUEUE_UNAVAILABLE');
            return result.items;
          });
      },
      commit: function (input) {
        if (!input || !input.item || !input.roundId || !input.operationId) fail('INVALID_REVIEW_COMMIT');
        return Promise.resolve(invoke({
          action: 'review_commit', game: input.game, level: input.level,
          round_id: input.roundId, operation_id: input.operationId, item: input.item,
        })).then(function (result) {
          if (!result || result.ok !== true) fail('REVIEW_COMMIT_UNAVAILABLE');
          return result;
        });
      },
    };
  }

  function currentUser() {
    try {
      return (root.SITE_AUTH && root.SITE_AUTH.user) ||
        (root.READING_AUTH && root.READING_AUTH.srsUser) || null;
    } catch (e) { return null; }
  }
  function runtimeEnabled() {
    return !!(root && root.LOGIN_FREE_REVIEW_PUBLIC_ENTRY === true && currentUser());
  }
  function ownerScope() { return String(root && root.SITE_AUTH && root.SITE_AUTH.learningOwnerEpoch || 0); }
  function runtimeKey(game, level) { return ownerScope() + ':' + normalizeGame(game) + ':' + normalizeLevel(level); }
  function uuid() {
    try { if (root.crypto && root.crypto.randomUUID) return root.crypto.randomUUID(); } catch (e) {}
    var bytes = new Uint8Array(16);
    try { root.crypto.getRandomValues(bytes); } catch (e2) { for (var i = 0; i < 16; i++) bytes[i] = (Math.random() * 256) | 0; }
    bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
    var h = Array.prototype.map.call(bytes, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
  }
  function browserInvoke(body) {
    var sb = root && root.getSupabaseClient ? root.getSupabaseClient() : null;
    if (!sb || !sb.functions || !root.NetworkGuard || typeof root.NetworkGuard.request !== 'function') {
      return Promise.reject(new Error('TRANSPORT_UNAVAILABLE'));
    }
    function attempt(remaining) {
      return root.NetworkGuard.request(function () {
        return sb.functions.invoke('score-submit', { body: body });
      }, 'score-submit:learning-review', {}, 12000, null).then(function (response) {
        if (response && !response.error && response.data) return response.data;
        var error = new Error('REVIEW_REQUEST_FAILED');
        try { error.status = response.error.context.status; } catch (e) {}
        throw error;
      }).catch(function (error) {
        if (remaining > 0) return new Promise(function (resolve) { setTimeout(resolve, 500); }).then(function () { return attempt(remaining - 1); });
        throw error;
      });
    }
    return attempt(1);
  }
  function runtimeClient() { return create({ enabled: runtimeEnabled(), invoke: browserInvoke }); }

  function prime(options) {
    options = options || {};
    if (!runtimeEnabled()) return Promise.resolve([]);
    var key;
    try { key = runtimeKey(options.game, options.level); } catch (e) { return Promise.resolve([]); }
    return runtimeClient().loadQueue({ game: normalizeGame(options.game), level: normalizeLevel(options.level), playSetSize: options.playSetSize })
      .then(function (items) { queues[key] = items.slice(); return queues[key]; })
      .catch(function () { queues[key] = []; return []; });
  }
  function queue(options) {
    try { return (queues[runtimeKey(options.game, options.level)] || []).slice(); }
    catch (e) { return []; }
  }
  function matchQueue(options) {
    options = options || {};
    var due = queue(options);
    var byRef = Object.create(null);
    due.forEach(function (row) { byRef[keyOfRef(row.content_ref)] = row; });
    return (options.items || []).filter(function (item) {
      return !!byRef[keyOfRef(options.contentRefOf(item))];
    });
  }
  function queueStateMap(options) {
    var result = Object.create(null);
    queue(options || {}).forEach(function (row) { result[keyOfRef(row.content_ref)] = String(row.state || ''); });
    return result;
  }
  function allocateRuntime(options) {
    options = options || {};
    return allocate({
      total: options.total, reviewDue: options.reviewDue, srsDue: options.srsDue,
      regular: options.regular, idOf: options.idOf, scope: ownerScope() + ':' + String(options.scope || 'default'),
      srsScope: ownerScope() + ':' + String(options.srsScope || options.scope || 'default'), storage: options.storage || (root && root.localStorage),
      allocateSrs: options.allocateSrs || (root.GameFlow && root.GameFlow.allocateSrs),
    });
  }

  function registerRound(options) {
    if (!runtimeEnabled() || !options || !options.report || !options.report.round_id) return null;
    var game = normalizeGame(options.game || options.report.game_type);
    var level = normalizeLevel(options.level == null ? options.report.difficulty : options.level);
    var idOf = options.idOf;
    var contentRefOf = options.contentRefOf;
    if (typeof idOf !== 'function' || typeof contentRefOf !== 'function') fail('INVALID_ROUND_ADAPTER');
    var srs = Object.create(null), due = Object.create(null), original = Object.create(null);
    (options.allItems || []).forEach(function (item) { original[keyOfRef(contentRefOf(item))] = item; });
    (options.srsOwned || []).forEach(function (item) { srs[keyOfRef(contentRefOf(item))] = true; });
    var states = queueStateMap({ game: game, level: level });
    (options.selectedReview || []).forEach(function (item) {
      var key = keyOfRef(contentRefOf(item));
      due[key] = states[key] || 'review_needed';
    });
    var context = {
      roundId: String(options.report.round_id), game: game, level: level,
      srs: srs, due: due, original: original, retried: Object.create(null),
      groupSize: options.groupSizeByRef || Object.create(null), groupBuffers: Object.create(null),
      pending: Promise.resolve(),
      retry: typeof options.retry === 'function' ? options.retry : function () {},
    };
    (options.alreadyRetried || []).forEach(function (item) { context.retried[keyOfRef(contentRefOf(item))] = true; });
    rounds[context.roundId] = context;
    latestRound[runtimeKey(game, level)] = context.roundId;
    return context;
  }
  function contextFor(reportOrId) {
    var id = typeof reportOrId === 'string' ? reportOrId : reportOrId && reportOrId.round_id;
    return id ? rounds[String(id)] || null : null;
  }
  function owns(reportOrId, ref) {
    var context = contextFor(reportOrId);
    if (!context || !runtimeEnabled()) return false;
    return !context.srs[keyOfRef(ref)];
  }
  function ownsCurrent(game, level, ref) {
    var id;
    try { id = latestRound[runtimeKey(game, level)]; } catch (e) { return false; }
    return owns(id, ref);
  }
  function predictedScore(game, item) {
    var ladder = [10, 7, 4, 1, 0];
    function ls(n) { n = Math.max(0, Math.floor(Number(n) || 0)); return ladder[Math.min(n, 4)]; }
    if (game === 'tone') {
      var components = item.learning_evidence && item.learning_evidence.componentWrongCounts;
      return components && components.length ? Math.round(components.reduce(function (sum, n) { return sum + ls(n); }, 0) / components.length) : ls(item.wrong_count);
    }
    if (game === 'reading') {
      var counts = item.learning_evidence && item.learning_evidence.firstCheckSyllableWrongCounts;
      return counts && counts.length ? Math.round(counts.slice(0, 7).reduce(function (sum, n) { return sum + ls(n); }, 0) / Math.min(counts.length, 7)) : 0;
    }
    if (game === 'typing') {
      var units = item.linguistic && ((item.linguistic.read_syls && item.linguistic.read_syls.length) || (item.linguistic.syls && item.linguistic.syls.length)) || 1;
      var quota = Math.min(4 + Math.max(0, units - 4), 9), wrong = Math.max(0, Number(item.wrong_count) || 0);
      return wrong >= quota ? 0 : Math.round(10 - (10 / quota) * wrong);
    }
    if (game === 'listening') {
      if (!item.is_correct) return 0;
      var listens = Math.max(1, Number(item.listen_count) || 1);
      var mode = item.linguistic && item.linguistic.answer_mode;
      if (mode === 'mc') return listens <= 2 ? 5 : ({ 3: 3, 4: 2, 5: 1 }[listens] || 0);
      var words = String(item.question || '').trim().split(/\s+/).filter(Boolean).length || 1;
      return words >= 3 ? (listens <= 3 ? 10 : ({ 4: 7, 5: 4, 6: 1 }[listens] || 0)) : (listens <= 2 ? 10 : ({ 3: 7, 4: 4, 5: 1 }[listens] || 0));
    }
    if (game === 'word_order') {
      var hints = item.learning_evidence && Number(item.learning_evidence.hintCount) || 0;
      return Math.max(0, 10 - [0, 3, 6, 9, 10][Math.min(Math.max(0, Number(item.wrong_count) || 0), 4)] - hints * 2);
    }
    return 0;
  }
  function scheduleRetry(context, refKey) {
    if (context.retried[refKey]) return;
    var state = context.due[refKey];
    if (state === 'next_day_check' || state === 'review_needed') return;
    var original = context.original[refKey];
    if (original === undefined) return;
    context.retried[refKey] = true;
    context.retry(original);
  }
  function shouldRetry(reportOrId, item) {
    var context = contextFor(reportOrId);
    if (!context || !item || context.srs[keyOfRef(item.content_ref)]) return false;
    var state = context.due[keyOfRef(item.content_ref)];
    return state !== 'next_day_check' && state !== 'review_needed' && predictedScore(context.game, item) <= 3;
  }
  function processItem(report, item) {
    var context = contextFor(report);
    if (!context || !runtimeEnabled()) return Promise.resolve({ ok: false, reason: 'not_owned' });
    var refKey = keyOfRef(item && item.content_ref);
    if (!refKey || context.srs[refKey]) return Promise.resolve({ ok: false, reason: 'srs_owner' });
    var groupSize = Math.max(1, Math.floor(Number(context.groupSize[refKey]) || 1));
    if (groupSize > 1) {
      var buffer = context.groupBuffers[refKey] || [];
      buffer.push(item); context.groupBuffers[refKey] = buffer;
      if (buffer.length < groupSize) return Promise.resolve({ ok: true, pending_group: true });
      var group = buffer.splice(0, groupSize);
      item = Object.assign({}, group[0], {
        key: group[0].question,
        wrong_count: group.reduce(function (sum, row) { return sum + (Number(row.wrong_count) || 0); }, 0),
        learning_evidence: {
          componentWrongCounts: group.reduce(function (all, row) {
            var values = row.learning_evidence && row.learning_evidence.componentWrongCounts;
            return all.concat(values && values.length ? values : [Number(row.wrong_count) || 0]);
          }, []),
        },
      });
    }
    if (predictedScore(context.game, item) <= 3) scheduleRetry(context, refKey);
    context.pending = context.pending.then(function () {
      return runtimeClient().commit({
        game: context.game, level: context.level, roundId: context.roundId,
        operationId: uuid(), item: item,
      }).then(function (result) {
        if (result.to_state === 'retry_end_round') scheduleRetry(context, refKey);
        return result;
      }).catch(function () { return { ok: false, reason: 'commit_failed' }; });
    });
    return context.pending;
  }

  function installEvents() {
    if (!root || !root.addEventListener) return;
    root.addEventListener('gsh:item-complete', function (event) {
      var detail = event && event.detail || {};
      if (detail.report && detail.item) processItem(detail.report, detail.item);
      else if (detail.report && detail.report.item) processItem(detail.report, detail.report.item);
    });
    try {
      if (root.SITE_AUTH && root.SITE_AUTH.onChange) root.SITE_AUTH.onChange(function (user) {
        if (!user) { queues = Object.create(null); rounds = Object.create(null); latestRound = Object.create(null); }
      });
    } catch (e) {}
  }
  installEvents();

  return {
    FEATURE_DEFAULT_ENABLED: FEATURE_DEFAULT_ENABLED,
    STORAGE_KEY: STORAGE_KEY,
    keyOfRef: keyOfRef,
    allocate: allocate,
    create: create,
    prime: prime,
    queue: queue,
    matchQueue: matchQueue,
    allocateRuntime: allocateRuntime,
    registerRound: registerRound,
    owns: owns,
    ownsCurrent: ownsCurrent,
    predictedScore: predictedScore,
    shouldRetry: shouldRetry,
    processItem: processItem,
    runtimeEnabled: runtimeEnabled,
  };
});
