/* Canonical Login Free Learning Engine client. Server owns queue/state/transition. */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.LearningReview = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  var FEATURE_DEFAULT_ENABLED = false;
  var ENGINE_VERSION = 'phase1-login-free-learning-v2';
  var STORAGE_KEY = 'gsh_learning_projection_v2';
  var queues = Object.create(null);
  var packets = Object.create(null);
  var rounds = Object.create(null);
  var latestRound = Object.create(null);
  var ownerGeneration = 0;

  function fail(code) { var error = new Error(code); error.code = code; throw error; }
  function normalizeGame(value) {
    var game = String(value || '').toLowerCase().replace(/-/g, '_');
    if (game === 'wordorder') game = 'word_order';
    if (['tone', 'reading', 'typing', 'word_order'].indexOf(game) < 0) fail('INVALID_GAME');
    return game;
  }
  function normalizeLevel(value) {
    var levels = { '1': 1, '2': 2, '3': 3, '初': 1, '中': 2, '高': 3 };
    var level = levels[String(value == null ? '' : value)];
    if (!level) fail('INVALID_LEVEL');
    return level;
  }
  function keyOfRef(ref) {
    if (!ref || (ref.source !== 'game_words' && ref.source !== 'game_sentences') || typeof ref.key !== 'string' || !ref.key || ref.key.trim() !== ref.key) fail('INVALID_CONTENT_REF');
    return ref.source + ':' + ref.key;
  }
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
    if (typeof options.idOf !== 'function') fail('IDENTITY_REQUIRED');
    var idOf = options.idOf;
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
        return Promise.resolve(invoke({ action: 'learning_queue', game: input.game, level: input.level, play_set_size: input.playSetSize,
          round_id: input.roundId || null }))
          .then(function (result) {
            if (!result || result.ok !== true || result.engine_version !== ENGINE_VERSION ||
                !Array.isArray(result.review_due) || !Array.isArray(result.srs_due) ||
                !Array.isArray(result.regular_or_new) || !Array.isArray(result.non_due_srs) ||
                !Array.isArray(result.mastered) || !Array.isArray(result.snapshots) || !Array.isArray(result.round_items)) {
              fail('LEARNING_QUEUE_UNAVAILABLE');
            }
            return result;
          });
      },
      commit: function (input) {
        if (!input || !input.item || !input.roundId || !input.operationId || !input.expectedState || !input.expectedStateToken) {
          fail('INVALID_LEARNING_COMMIT');
        }
        return Promise.resolve(invoke({
          action: 'learning_commit', game: input.game, level: input.level,
          round_id: input.roundId, operation_id: input.operationId, item: input.item,
          expected_state: input.expectedState, expected_state_token: input.expectedStateToken,
          attempt_kind: input.attemptKind === 'known_check' ? 'known_check' : 'answer',
        })).then(function (result) {
          if (!result || result.ok !== true || !result.snapshot) fail('LEARNING_COMMIT_UNAVAILABLE');
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
    // Paid Review is a later private-beta tranche. Prevent the active Free owner
    // from claiming Paid items or writing them into the Free SRS namespace.
    return !!(root && root.GAME_CONTENT_TIER === 'login' &&
      root.LOGIN_FREE_REVIEW_PUBLIC_ENTRY === true && currentUser());
  }
  function ownerScope() { return String(root && root.SITE_AUTH && root.SITE_AUTH.learningOwnerEpoch || 0); }
  function runtimeKey(game, level) { return String(currentUser() && currentUser().id || '') + ':' + ownerScope() + ':' + normalizeGame(game) + ':' + normalizeLevel(level); }
  function assertOwner(context) {
    var user = currentUser();
    if (!runtimeEnabled() || !user || context.ownerId !== String(user.id || '') || context.ownerEpoch !== ownerScope() || context.ownerGeneration !== ownerGeneration) fail('LEARNING_OWNER_CHANGED');
  }
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
    var owner = { ownerId: String(currentUser() && currentUser().id || ''), ownerEpoch: ownerScope(), ownerGeneration: ownerGeneration };
    function attempt(remaining) {
      return root.NetworkGuard.request(function (_, options) {
        assertOwner(owner);
        return Promise.resolve(sb.functions.invoke('score-submit', { body: body, signal: options && options.signal })).then(function (response) {
        if (response && !response.error && response.data) return response.data;
        var status = null, context = null;
        try { context = response && response.error && response.error.context; status = context && context.status; } catch (e) {}
        var bodyPromise = Promise.resolve(null);
        try {
          if (context && typeof context.clone === 'function') context = context.clone();
          if (context && typeof context.json === 'function') bodyPromise = Promise.resolve(context.json()).catch(function () { return null; });
        } catch (e2) {}
        return bodyPromise.then(function (payload) {
          var code = payload && typeof payload.error === 'string' && payload.error || 'REVIEW_REQUEST_FAILED';
          var error = new Error(code); error.code = code; error.status = status;
          if (payload && payload.snapshot) error.snapshot = payload.snapshot;
          throw error;
        });
        });
      }, 'score-submit:learning-review', {}, 12000).catch(function (error) {
        var terminal = error && (error.code === 'LEARNING_OWNER_CHANGED' || (error.status >= 400 && error.status < 500 && error.status !== 408 && error.status !== 429));
        if (remaining > 0 && !terminal) return new Promise(function (resolve) { setTimeout(resolve, 500); }).then(function () { return attempt(remaining - 1); });
        throw error;
      });
    }
    return attempt(1);
  }
  function runtimeClient() { return create({ enabled: runtimeEnabled(), invoke: browserInvoke }); }
  function resumeId(game) { return { tone: 'tone-finder', reading: 'reading-game', typing: 'typing-game', word_order: 'word-order' }[game]; }
  function readResume(game) {
    try { return root.GameResume && root.GameResume.load(resumeId(game)); } catch (_) { return null; }
  }
  function saveResumeJournal(game, roundId, journal) {
    var saved = readResume(game);
    if (saved && saved.report && saved.report.round_id === roundId && root.GameResume) {
      saved.report.learning_save = JSON.parse(JSON.stringify(journal));
      root.GameResume.save(resumeId(game), saved);
    }
  }
  function journalOf(context) {
    return { version: ENGINE_VERSION, game: context.game, level: context.level,
      jobs: context.jobs.map(function (job) {
        return { operationId: job.operationId, item: job.item, refKey: job.refKey, itemId: job.itemId,
          expectedState: job.expectedState, expectedStateToken: job.expectedStateToken,
          attemptKind: job.attemptKind, status: job.status, result: job.result };
      }), groupBuffers: context.groupBuffers, seen: Object.keys(context.seenItems).map(function (key) {
        return { ordinal: key, signature: context.seenItems[key].signature };
      }), failures: context.failures.map(function (error) { return String(error.code || error.message); }) };
  }
  function persistContext(context, checkpoint) {
    var journal = journalOf(context);
    context.report.learning_save = JSON.parse(JSON.stringify(journal));
    if (checkpoint) context.checkpoint(true);
    saveResumeJournal(context.game, context.roundId, journal);
    if (context.requiresCheckpoint) {
      var saved = readResume(context.game);
      if (!saved || !saved.report || saved.report.round_id !== context.roundId ||
          JSON.stringify(saved.report.learning_save) !== JSON.stringify(journal)) fail('LEARNING_RECOVERY_STORAGE_UNAVAILABLE');
    }
  }
  function recoverResume(game, level, owner) {
    var saved = readResume(game), journal = saved && saved.report && saved.report.learning_save;
    if (!journal || journal.version !== ENGINE_VERSION || journal.game !== game || journal.level !== level) return Promise.resolve();
    if (journal.failures && journal.failures.length) return Promise.reject(new Error(journal.failures[0]));
    var chain = Promise.resolve();
    (journal.jobs || []).forEach(function (job) {
      if (job.status === 'committed') return;
      chain = chain.then(function () {
        assertOwner(owner);
        if (assertItemIdentity(job.item) !== job.refKey) fail('CONTENT_REF_IDENTITY_MISMATCH');
        return runtimeClient().commit({ game: game, level: level, roundId: saved.report.round_id,
          operationId: job.operationId, item: job.item, expectedState: job.expectedState,
          expectedStateToken: job.expectedStateToken, attemptKind: job.attemptKind });
      }).then(function (result) {
        assertOwner(owner);
        if (result.operation_id !== job.operationId || keyOfRef(result.snapshot.content_ref) !== job.refKey ||
            !result.snapshot.state_token || !job.itemId || result.snapshot.item_id !== job.itemId) fail('LEARNING_COMMIT_IDENTITY_MISMATCH');
        job.status = 'committed'; job.result = result;
        saveResumeJournal(game, saved.report.round_id, journal);
      });
    });
    return chain.then(function () {
      assertOwner(owner);
      if (saved.report.score_save) {
        if (!root.READING_AUTH || !root.READING_AUTH.settleScore) fail('SCORE_TRANSPORT_UNAVAILABLE');
        return root.READING_AUTH.settleScore(saved.report);
      }
    }).then(function () {
      assertOwner(owner);
      if (saved.report.ended_at) {
        if (!root.PracticeEvents || !root.PracticeEvents.submitReport) fail('PRACTICE_TRANSPORT_UNAVAILABLE');
        return root.PracticeEvents.submitReport(saved.report).then(function (ok) { if (ok !== true) fail('PRACTICE_SAVE_UNAVAILABLE'); });
      }
    });
  }

  function prime(options) {
    options = options || {};
    if (!runtimeEnabled()) return Promise.resolve([]);
    var key;
    try { key = runtimeKey(options.game, options.level); } catch (e) { return Promise.resolve([]); }
    var owner = { ownerId: String(currentUser().id || ''), ownerEpoch: ownerScope(), ownerGeneration: ownerGeneration };
    return recoverResume(normalizeGame(options.game), normalizeLevel(options.level), owner).then(function () {
      assertOwner(owner);
      return runtimeClient().loadQueue({ game: normalizeGame(options.game), level: normalizeLevel(options.level),
      playSetSize: options.playSetSize, roundId: options.roundId })
    })
      .then(function (packet) {
        assertOwner(owner);
        packets[key] = packet;
        queues[key] = packet.review_due.slice();
        return packet;
      })
      .catch(function (error) {
        if (owner.ownerGeneration !== ownerGeneration) throw error;
        delete packets[key]; queues[key] = [];
        assertOwner(owner);
        return new Promise(function (resolve, reject) {
          function retry() { prime(options).then(resolve, reject); }
          if (!showRecovery({ roundId: options.roundId || '', game: options.game }, retry, error)) reject(error);
        });
      });
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
    var packet;
    try { packet = packets[runtimeKey(options.game, options.level)]; } catch (e) { packet = null; }
    (packet && packet.snapshots || []).forEach(function (row) { result[keyOfRef(row.content_ref)] = row; });
    return result;
  }
  function snapshot(options) {
    try {
      var states = queueStateMap(options || {});
      return states[keyOfRef(options.contentRef)] || null;
    } catch (e) { return null; }
  }
  function srsRecord(options) {
    var row = snapshot(options || {});
    if (!row || (row.state !== 'srs' && row.state !== 'mastered')) return null;
    return { stage: Number(row.stage || 0), dueDate: row.due_on || '', dueAt: 0,
      everFailed: row.ever_failed === true, mastered: row.mastered === true };
  }
  function allocateRuntime(options) {
    options = options || {};
    if (typeof options.idOf !== 'function') fail('IDENTITY_REQUIRED');
    var packet;
    try { packet = packets[runtimeKey(options.game || String(options.scope || '').split('-')[0], options.level)]; } catch (e) { packet = null; }
    if (!packet) {
      var scope = String(options.scope || '');
      var game = scope.indexOf('word-order') === 0 ? 'word_order' : scope.split('-')[0];
      var level = options.level;
      if (!level && game === 'word_order') level = 3;
      if (!level && scope.split('-')[1]) level = scope.split('-')[1];
      try { packet = packets[runtimeKey(game, level)]; } catch (e2) { packet = null; }
    }
    if (!packet) fail('LEARNING_QUEUE_UNAVAILABLE');
    var candidates = [].concat(options.reviewDue || [], options.srsDue || [], options.regular || []);
    var byRef = Object.create(null);
    candidates.forEach(function (item) { byRef[String(options.idOf(item))] = item; });
    var items = packet.round_items.map(function (row) {
      var item = byRef[keyOfRef(row.content_ref)];
      if (item === undefined) fail('CANONICAL_QUEUE_ITEM_MISSING');
      return item;
    });
    var reviewStates = { next_day_check: true, review_needed: true, weak_4d: true };
    return {
      items: items,
      selectedReview: packet.round_items.filter(function (row) { return reviewStates[row.state]; }).map(function (row) { return byRef[keyOfRef(row.content_ref)]; }),
      selectedSrs: packet.round_items.filter(function (row) { return row.state === 'srs'; }).map(function (row) { return byRef[keyOfRef(row.content_ref)]; }),
      reviewCarryOver: packet.review_due.slice(),
      fractionCarry: 0,
    };
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
    Object.keys(states).forEach(function (key) {
      if (states[key] && (states[key].state === 'srs' || states[key].state === 'mastered')) srs[key] = true;
    });
    (options.selectedReview || []).forEach(function (item) {
      var key = keyOfRef(contentRefOf(item));
      due[key] = states[key] && states[key].state || 'review_needed';
    });
    var context = {
      roundId: String(options.report.round_id), game: game, level: level,
      ownerId: String(currentUser() && currentUser().id || ''), ownerEpoch: ownerScope(),
      ownerGeneration: ownerGeneration,
      report: options.report, requiresCheckpoint: typeof options.checkpoint === 'function', checkpoint: typeof options.checkpoint === 'function' ? options.checkpoint : function () {},
      srs: srs, due: due, original: original, snapshots: states, retried: Object.create(null),
      groupSize: options.groupSizeByRef || Object.create(null), groupBuffers: Object.create(null),
      pending: Promise.resolve(), jobs: [], failures: [], seenItems: Object.create(null), advancePending: false, settlePending: null,
      retry: typeof options.retry === 'function' ? options.retry : function () {},
    };
    (options.alreadyRetried || []).forEach(function (item) { context.retried[keyOfRef(contentRefOf(item))] = true; });
    rounds[context.roundId] = context;
    latestRound[runtimeKey(game, level)] = context.roundId;
    var saved = readResume(game);
    var journal = saved && saved.report && saved.report.round_id === context.roundId ? saved.report.learning_save : options.report.learning_save;
    if (journal && journal.version === ENGINE_VERSION && journal.game === game && journal.level === level) {
      context.groupBuffers = journal.groupBuffers || Object.create(null);
      context.failures = (journal.failures || []).map(function (code) { return new Error(code); });
      context.jobs = (journal.jobs || []).map(function (job) {
        if (assertItemIdentity(job.item) !== job.refKey || !Object.prototype.hasOwnProperty.call(original,job.refKey)) fail('CONTENT_REF_NOT_IN_ROUND');
        return Object.assign({}, job, { status: job.status === 'committed' ? 'committed' : 'failed', error: null });
      });
      (journal.seen || []).forEach(function (row) { context.seenItems[row.ordinal] = { signature: row.signature, pending: Promise.resolve({ ok: true, restored: true }) }; });
      context.jobs.forEach(function (job) { if (job.result && job.result.to_state === 'retry_end_round') scheduleRetry(context, job.refKey); });
      persistContext(context, false);
    }
    return context;
  }
  function contextFor(reportOrId) {
    var id = typeof reportOrId === 'string' ? reportOrId : reportOrId && reportOrId.round_id;
    var context = id ? rounds[String(id)] || null : null;
    var user = currentUser();
    if (!context || !user || context.ownerId !== String(user.id || '') || context.ownerEpoch !== ownerScope() || context.ownerGeneration !== ownerGeneration) return null;
    return context;
  }
  function managedContext(reportOrId) {
    var id = typeof reportOrId === 'string' ? reportOrId : reportOrId && reportOrId.round_id;
    return id ? rounds[String(id)] || null : null;
  }
  function owns(reportOrId, ref) {
    var context = contextFor(reportOrId);
    if (!context || !runtimeEnabled()) return false;
    return Object.prototype.hasOwnProperty.call(context.original, keyOfRef(ref));
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
      var units = item.linguistic && item.linguistic.syls && item.linguistic.syls.length || 1;
      var quota = Math.min(4 + Math.max(0, units - 4), 9), wrong = Math.max(0, Number(item.wrong_count) || 0);
      return wrong >= quota ? 0 : Math.round(10 - (10 / quota) * wrong);
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
  function assertItemIdentity(item) {
    var refKey = keyOfRef(item && item.content_ref);
    if (!item || !item.content_ref || typeof item.key !== 'string' || item.key !== item.content_ref.key) fail('CONTENT_REF_IDENTITY_MISMATCH');
    return refKey;
  }
  function runJob(context, job) {
    var firstSend = job.status === 'queued';
    job.status = 'pending'; job.error = null;
    return Promise.resolve().then(function () {
      assertOwner(context);
      if (context.failures.length) throw context.failures[0];
      if (context.jobs.some(function (other) { return other !== job && other.refKey === job.refKey && context.jobs.indexOf(other) < context.jobs.indexOf(job) && other.status !== 'committed'; })) fail('LEARNING_PREVIOUS_COMMIT_REQUIRED');
      if (firstSend) {
        var expected = context.snapshots[job.refKey];
        job.expectedState = String(expected.state); job.expectedStateToken = String(expected.state_token);
      }
      persistContext(context, false);
      return runtimeClient().commit({
      game: context.game, level: context.level, roundId: context.roundId,
      operationId: job.operationId, item: job.item,
      expectedState: job.expectedState, expectedStateToken: job.expectedStateToken,
      attemptKind: job.attemptKind,
      });
    }).then(function (result) {
      assertOwner(context);
      if (!result.snapshot || keyOfRef(result.snapshot.content_ref) !== job.refKey || !result.snapshot.state_token ||
          result.snapshot.item_id !== job.itemId || result.operation_id !== job.operationId) fail('LEARNING_COMMIT_IDENTITY_MISMATCH');
      job.status = 'committed'; job.result = result;
      if (result.snapshot && result.snapshot.content_ref) {
        context.snapshots[job.refKey] = result.snapshot;
        var packet = packets[runtimeKey(context.game, context.level)];
        if (packet) packet.snapshots = packet.snapshots.map(function (row) { return keyOfRef(row.content_ref) === job.refKey ? result.snapshot : row; });
      }
      if (result.to_state === 'retry_end_round') scheduleRetry(context, job.refKey);
      persistContext(context, false);
      return result;
    }).catch(function (error) {
      if (error && error.snapshot && error.snapshot.content_ref) context.snapshots[job.refKey] = error.snapshot;
      job.status = 'failed'; job.error = error;
      // Never persist an old owner's journal into the newly selected account.
      if (contextFor(context.roundId)) { try { persistContext(context, false); } catch (_) {} }
      throw error;
    });
  }
  function emitSaveError(context, error) {
    try {
      if (root && root.dispatchEvent && root.CustomEvent) {
        root.dispatchEvent(new root.CustomEvent('gsh:learning-save-error', {
          detail: { round_id: context.roundId, game: context.game, code: String(error && (error.code || error.message) || 'REVIEW_COMMIT_UNAVAILABLE') },
        }));
      }
    } catch (_) {}
  }
  function processItem(report, item) {
    var context = managedContext(report);
    if (!context) return Promise.resolve({ ok: false, reason: 'not_owned' });
    try {
      assertOwner(context);
      var pending = enqueueItem(context, item);
      return pending;
    } catch (error) {
      context.failures.push(error);
      context.pending.catch(function () {});
      if (contextFor(context.roundId)) { try { persistContext(context, false); } catch (_) {} }
      return Promise.reject(error);
    }
  }
  function enqueueItem(context, item) {
    var refKey = assertItemIdentity(item);
    if (context.report.learning_exempt !== true && !Object.prototype.hasOwnProperty.call(context.original, refKey)) fail('CONTENT_REF_NOT_IN_ROUND');
    var ordinal = Number(item.ordinal), seenKey = Number.isInteger(ordinal) && ordinal > 0 ? String(ordinal) : null;
    var signature = JSON.stringify(item);
    if (seenKey && context.seenItems[seenKey]) {
      var previous = context.seenItems[seenKey];
      if (previous.signature !== signature) fail('LEARNING_ATTEMPT_CONFLICT');
      return previous.pending;
    }
    var pending = enqueueAttempt(context, item, refKey);
    if (seenKey) context.seenItems[seenKey] = { signature: signature, pending: pending };
    persistContext(context, true);
    return pending;
  }
  function blockRound(reportOrId, error) {
    var context = managedContext(reportOrId);
    if (!context || !contextFor(reportOrId)) return;
    context.failures.push(error || new Error('LEARNING_EVIDENCE_REQUIRED'));
    try { persistContext(context, false); } catch (storageError) { context.failures.push(storageError); }
    emitSaveError(context, error);
  }
  function enqueueAttempt(context, item, refKey) {
    if (context.report.learning_exempt === true) return Promise.resolve({ ok: true, exempt: true });
    var groupSize = Math.max(1, Math.floor(Number(context.groupSize[refKey]) || 1));
    if (groupSize > 1) {
      var buffer = context.groupBuffers[refKey] || [];
      buffer.push(item); context.groupBuffers[refKey] = buffer;
      if (buffer.length < groupSize) return Promise.resolve({ ok: true, pending_group: true });
      var group = buffer.splice(0, groupSize);
      // A sentence with a skipped component has no complete learning evidence.
      // Keep all raw rows in RoundReport; never turn the skip into a scored answer.
      if (group.some(function (row) { return row.is_skipped === true; })) return Promise.resolve({ ok: true, skipped: true });
      item = Object.assign({}, group[0], {
        key: group[0].content_ref.key,
        wrong_count: group.reduce(function (sum, row) { return sum + (Number(row.wrong_count) || 0); }, 0),
        learning_evidence: {
          componentWrongCounts: group.reduce(function (all, row) {
            var values = row.learning_evidence && row.learning_evidence.componentWrongCounts;
            return all.concat(values && values.length ? values : [Number(row.wrong_count) || 0]);
          }, []),
        },
      });
    }
    if (item.is_skipped === true) return Promise.resolve({ ok: true, skipped: true });
    var expected = context.snapshots[refKey];
    if (!expected || !expected.item_id || !expected.state || !expected.state_token || expected.state === 'legacy_identity_unresolved') {
      fail('LEARNING_SNAPSHOT_REQUIRED');
    }
    var job = { operationId: uuid(), item: item, refKey: refKey, itemId: expected.item_id,
      expectedState: String(expected.state), expectedStateToken: String(expected.state_token),
      attemptKind: item.learning_action === 'known_check' ? 'known_check' : 'answer',
      status: 'queued', error: null, result: null };
    context.jobs.push(job);
    context.pending = context.pending.catch(function () {}).then(function () { return runJob(context, job); });
    return context.pending;
  }
  function settle(reportOrId) {
    var context = managedContext(reportOrId);
    if (!context) return runtimeEnabled() ? Promise.reject(new Error('LEARNING_ROUND_REQUIRED')) : Promise.resolve([]);
    if (context.settlePending) return context.settlePending;
    var pending = context.pending.catch(function () {}).then(function () {
      assertOwner(context);
      if (context.failures.length) throw context.failures[0];
      var failed = context.jobs.filter(function (job) { return job.status === 'failed'; });
      var retryChain = Promise.resolve();
      failed.forEach(function (job) {
        retryChain = retryChain.then(function () { return runJob(context, job); });
      });
      return retryChain.then(function () {
        assertOwner(context);
        var unresolved = context.jobs.filter(function (job) { return job.status !== 'committed'; });
        if (unresolved.length) throw unresolved[0].error || new Error('REVIEW_COMMIT_UNAVAILABLE');
        return context.jobs.map(function (job) { return job.result; });
      });
    });
    context.settlePending = pending;
    function clear() { if (context.settlePending === pending) context.settlePending = null; }
    pending.then(clear, clear);
    return pending;
  }
  function removeRecovery() {
    try { var old = root.document && root.document.getElementById('gsh-learning-save-recovery'); if (old) old.remove(); } catch (_) {}
  }
  function showRecovery(context, retry, error) {
    if (!root.document || !root.document.body) return false;
    removeRecovery();
    var box = root.document.createElement('div'); box.id = 'gsh-learning-save-recovery';
    box.setAttribute('data-error-code', String(error && (error.code || error.message) || 'REVIEW_COMMIT_UNAVAILABLE'));
    box.style.cssText = 'position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:10020;max-width:420px;width:calc(100% - 32px);padding:14px 16px;border:2px solid #b83227;border-radius:14px;background:#fff;color:#5a1b17;box-shadow:0 8px 28px rgba(0,0,0,.22);font:700 14px/1.5 "Noto Sans TC",sans-serif;';
    var message = root.document.createElement('div'); message.textContent = '學習進度尚未儲存，本輪已安全暫停。'; box.appendChild(message);
    var button = root.document.createElement('button'); button.type = 'button'; button.textContent = '重試儲存';
    button.style.cssText = 'margin-top:10px;border:0;border-radius:999px;background:#b83227;color:#fff;padding:8px 16px;font:700 14px inherit;cursor:pointer;';
    button.onclick = function () { button.disabled = true; button.textContent = '儲存中…'; retry(); };
    box.appendChild(button); root.document.body.appendChild(box); return true;
  }
  function settleResult(report) {
    return settle(report).then(function () {
      var context = managedContext(report); assertOwner(context);
      if (root.READING_AUTH && root.READING_AUTH.settleScore) return root.READING_AUTH.settleScore(report);
      if (report.score_save) fail('SCORE_TRANSPORT_UNAVAILABLE');
    }).then(function () {
      assertOwner(managedContext(report));
      if (!root.PracticeEvents || !root.PracticeEvents.submitReport) fail('PRACTICE_TRANSPORT_UNAVAILABLE');
      return root.PracticeEvents.submitReport(report);
    }).then(function (ok) {
      assertOwner(managedContext(report));
      if (ok !== true) fail('PRACTICE_SAVE_UNAVAILABLE');
    });
  }
  function advanceResult(report, callback) { return advanceWithGate(report, callback, true); }
  function advance(reportOrId, callback) { return advanceWithGate(reportOrId, callback, false); }
  function advanceWithGate(reportOrId, callback, resultGate) {
    var context = managedContext(reportOrId);
    if (!context) {
      if (runtimeEnabled()) return Promise.reject(new Error('LEARNING_ROUND_REQUIRED'));
      callback(); return Promise.resolve(true);
    }
    if (context.advancePending) return context.advancePending;
    function attempt() {
      context.advancePending = (resultGate ? settleResult(reportOrId) : settle(reportOrId)).then(function () {
        assertOwner(context);
        context.advancePending = false; removeRecovery(); callback(); return true;
      }, function (error) {
        context.advancePending = false; emitSaveError(context, error);
        if (!showRecovery(context, attempt, error)) throw error;
        return false;
      });
      return context.advancePending;
    }
    return attempt();
  }

  function handleItemComplete(event) {
    var detail = event && event.detail || {};
    var reportOrId = detail.report || detail.round_id || null;
    var item = detail.item || (detail.report && detail.report.item) || null;
    var pending = reportOrId && item ? processItem(reportOrId, item) : null;
    if (pending && typeof pending.catch === 'function') pending.catch(function (error) {
      var context = contextFor(reportOrId);
      if (context) emitSaveError(context, error);
    });
    return pending;
  }
  function installEvents() {
    if (!root || !root.addEventListener) return;
    root.addEventListener('gsh:item-complete', handleItemComplete);
    try {
      if (root.SITE_AUTH && root.SITE_AUTH.onChange) root.SITE_AUTH.onChange(function (user) {
        ownerGeneration++;
        queues = Object.create(null); packets = Object.create(null); latestRound = Object.create(null);
      });
    } catch (e) {}
  }
  installEvents();

  return {
    FEATURE_DEFAULT_ENABLED: FEATURE_DEFAULT_ENABLED,
    ENGINE_VERSION: ENGINE_VERSION,
    STORAGE_KEY: STORAGE_KEY,
    keyOfRef: keyOfRef,
    allocate: allocate,
    create: create,
    prime: prime,
    queue: queue,
    matchQueue: matchQueue,
    snapshot: snapshot,
    srsRecord: srsRecord,
    allocateRuntime: allocateRuntime,
    registerRound: registerRound,
    owns: owns,
    ownsCurrent: ownsCurrent,
    roundCurrent: function (report) { return !!(runtimeEnabled() && contextFor(report)); },
    predictedScore: predictedScore,
    shouldRetry: shouldRetry,
    processItem: processItem,
    blockRound: blockRound,
    handleItemComplete: handleItemComplete,
    settle: settle,
    advance: advance,
    advanceResult: advanceResult,
    runtimeEnabled: runtimeEnabled,
  };
});
