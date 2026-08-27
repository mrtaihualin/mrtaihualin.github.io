/* Headless, read-only Review Needed + SRS Due queue candidate. Not loaded by public runtime. */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ReviewNeededCandidate = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var FEATURE_DEFAULT_ENABLED = false;
  var GAME_IDS = ['tone', 'reading', 'listening', 'typing', 'wordorder'];
  var VIEW_STATES = ['loading', 'ready', 'empty', 'error', 'access-denied'];
  var TIER_CONFIGS = {
    free: { id: 'free', maxReviewAttempts: 1, runtimeEnabled: true },
    paid: { id: 'paid', maxReviewAttempts: 4, runtimeEnabled: false }
  };

  function copy(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function errorWithCode(code, message) {
    var error = new Error(message || code);
    error.code = code;
    return error;
  }

  function assertState(condition, code, message) {
    if (!condition) throw errorWithCode(code, message);
  }

  function isCalendarDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    var parts = value.split('-').map(Number);
    var date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
    return date.getUTCFullYear() === parts[0] &&
      date.getUTCMonth() === parts[1] - 1 && date.getUTCDate() === parts[2];
  }

  function normalizeGame(value) {
    var game = String(value || '').toLowerCase();
    if (game === 'word_order') game = 'wordorder';
    return GAME_IDS.indexOf(game) >= 0 ? game : null;
  }

  function normalizeIdentity(row, code) {
    var game = normalizeGame(row && row.game);
    assertState(!!game, 'UNKNOWN_GAME', 'unknown game');
    var level = row && row.level;
    var itemId = row && row.itemId;
    assertState(level !== null && level !== undefined && String(level) !== '', code, 'level is required');
    assertState(itemId !== null && itemId !== undefined && String(itemId) !== '', code, 'itemId is required');
    level = String(level);
    itemId = String(itemId);
    return {
      game: game,
      level: level,
      itemId: itemId,
      key: game + '\u0000' + level + '\u0000' + itemId
    };
  }

  function normalizeReviewQueueItem(row) {
    assertState(row && typeof row === 'object' && !Array.isArray(row),
      'MALFORMED_REVIEW_QUEUE_ITEM', 'Review Needed queue item must be an object');
    assertState(row.sourceType === 'review_queue_item',
      'UNKNOWN_REVIEW_SOURCE', 'sourceType must be review_queue_item');
    var identity = normalizeIdentity(row, 'MALFORMED_REVIEW_QUEUE_ITEM');
    assertState(typeof row.resolved === 'boolean',
      'MALFORMED_REVIEW_QUEUE_ITEM', 'resolved must be boolean');
    var attemptsUsed = Number(row.attemptsUsed);
    assertState(isFinite(attemptsUsed) && attemptsUsed >= 0 && Math.floor(attemptsUsed) === attemptsUsed,
      'INVALID_ATTEMPT_COUNT', 'attemptsUsed must be a non-negative integer');
    assertState(row.actionToken !== null && row.actionToken !== undefined && String(row.actionToken) !== '',
      'MALFORMED_REVIEW_QUEUE_ITEM', 'actionToken is required');
    return {
      sourceType: 'review_queue_item',
      game: identity.game,
      level: identity.level,
      itemId: identity.itemId,
      identityKey: identity.key,
      attemptsUsed: attemptsUsed,
      resolved: row.resolved,
      actionToken: String(row.actionToken)
    };
  }

  function normalizeSrsDueSnapshot(row) {
    assertState(row && typeof row === 'object' && !Array.isArray(row),
      'MALFORMED_SRS_SNAPSHOT', 'SRS due snapshot must be an object');
    assertState(row.sourceType === 'srs_due_snapshot',
      'UNKNOWN_SRS_SOURCE', 'SRS sourceType must be srs_due_snapshot');
    var identity = normalizeIdentity(row, 'MALFORMED_SRS_SNAPSHOT');
    assertState(typeof row.due === 'boolean',
      'MALFORMED_SRS_SNAPSHOT', 'due must be boolean');
    assertState(typeof row.mastered === 'boolean',
      'MALFORMED_SRS_SNAPSHOT', 'mastered must be boolean');
    return {
      sourceType: 'srs_due_snapshot',
      game: identity.game,
      level: identity.level,
      itemId: identity.itemId,
      identityKey: identity.key,
      due: row.due,
      mastered: row.mastered
    };
  }

  function normalizeCanonicalSrsState(row) {
    assertState(row && typeof row === 'object' && !Array.isArray(row),
      'MALFORMED_CANONICAL_SRS_STATE', 'canonical SRS state must be an object');
    assertState(row.sourceType === 'canonical_srs_state',
      'UNKNOWN_CANONICAL_SRS_SOURCE', 'sourceType must be canonical_srs_state');
    var identity = normalizeIdentity(row, 'MALFORMED_CANONICAL_SRS_STATE');
    var stage = Number(row.stage);
    assertState(isFinite(stage) && stage >= 0 && Math.floor(stage) === stage,
      'MALFORMED_CANONICAL_SRS_STATE', 'stage must be a non-negative integer');
    assertState(typeof row.dueDate === 'string' && (!row.dueDate || isCalendarDate(row.dueDate)),
      'MALFORMED_CANONICAL_SRS_STATE', 'dueDate must be empty or a valid YYYY-MM-DD');
    assertState(typeof row.mastered === 'boolean',
      'MALFORMED_CANONICAL_SRS_STATE', 'mastered must be boolean');
    assertState(row.mastered || stage === 0 || !!row.dueDate,
      'MALFORMED_CANONICAL_SRS_STATE', 'non-mastered stage above zero requires dueDate');
    return {
      sourceType: 'canonical_srs_state',
      game: identity.game,
      level: identity.level,
      itemId: identity.itemId,
      identityKey: identity.key,
      stage: stage,
      dueDate: row.dueDate,
      mastered: row.mastered
    };
  }

  function tierConfig(tier) {
    var id = String(tier || 'free').toLowerCase();
    if (!TIER_CONFIGS[id]) throw errorWithCode('UNKNOWN_TIER');
    return copy(TIER_CONFIGS[id]);
  }

  function reviewAttemptWindow(tier, attemptsUsed, options) {
    options = options || {};
    var config = tierConfig(tier || 'free');
    if (!config.runtimeEnabled && options.allowDormantTier !== true) throw errorWithCode('TIER_DISABLED');
    var used = Number(attemptsUsed);
    assertState(isFinite(used) && used >= 0 && Math.floor(used) === used,
      'INVALID_ATTEMPT_COUNT', 'attempt count must be a non-negative integer');
    var remaining = Math.max(0, config.maxReviewAttempts - used);
    return {
      tier: config.id,
      maxReviewAttempts: config.maxReviewAttempts,
      attemptsUsed: used,
      attemptsRemaining: remaining,
      canAttempt: remaining > 0
    };
  }

  function emptyGames() {
    var games = {};
    GAME_IDS.forEach(function (game) {
      games[game] = { game: game, reviewNeeded: [], srsDueOnly: [], queue: [] };
    });
    return games;
  }

  function sortIdentity(a, b) {
    return a.identityKey.localeCompare(b.identityKey);
  }

  function queueItem(sourceType, row, alsoSrsDue, attemptWindow) {
    var isReview = sourceType === 'review_needed';
    return {
      sourceType: sourceType,
      game: row.game,
      level: row.level,
      itemId: row.itemId,
      identityKey: row.identityKey,
      actionToken: isReview ? row.actionToken : null,
      alsoSrsDue: alsoSrsDue === true,
      attemptsUsed: isReview ? attemptWindow.attemptsUsed : null,
      attemptsRemaining: isReview ? attemptWindow.attemptsRemaining : null,
      resultRouting: {
        reviewResolution: isReview,
        srsOwnerEvaluationIfDue: sourceType === 'srs_due' || alsoSrsDue === true,
        srsInitialEntryOnReviewCorrect: isReview ? 'canonical-owner-route' : 'not-applicable',
        candidateMutatesSrs: false,
        savedWord: 'manual-only'
      }
    };
  }

  function buildReviewResolutionDirective(item, result) {
    assertState(item && item.sourceType === 'review_needed',
      'INVALID_REVIEW_QUEUE_ITEM', 'resolution requires a Review Needed queue item');
    var itemIdentity = normalizeIdentity(item, 'INVALID_REVIEW_QUEUE_ITEM');
    assertState(item.identityKey === itemIdentity.key && item.actionToken != null && String(item.actionToken) !== '',
      'INVALID_REVIEW_QUEUE_ITEM', 'Review queue identity and actionToken are required');
    assertState(result && (result.outcome === 'correct' || result.outcome === 'incorrect'),
      'INVALID_REVIEW_RESULT', 'result outcome must be correct or incorrect');
    var base = {
      readOnlyDirective: true,
      identityKey: item.identityKey,
      actionToken: item.actionToken,
      reviewResult: result.outcome,
      candidateMutatesReview: false,
      candidateMutatesSrs: false,
      savedWord: 'manual-only'
    };
    if (result.outcome === 'incorrect') {
      base.reviewQueue = 'attempt-consumed';
      base.srsAction = 'none';
      base.srsInitialRoute = null;
      return base;
    }

    base.reviewQueue = 'close';
    assertState(result.srsStateStatus === 'absent' || result.srsStateStatus === 'present',
      'SRS_STATE_PRESENCE_REQUIRED', 'correct Review resolution requires explicit SRS state presence');
    if (result.srsStateStatus === 'absent') {
      assertState(!result.existingSrsState && item.alsoSrsDue !== true,
        'CONFLICTING_SRS_STATE_STATUS', 'absent status cannot include an existing SRS state');
      base.srsAction = 'request-canonical-initial-route';
      base.srsInitialRoute = {
        derivedStage: 0,
        day1Passed: false,
        firstCheckpoint: 'resolve-by-current-srs-authority',
        duplicateSrsCreationAllowed: false
      };
      base.existingSrsState = null;
      return base;
    }

    var existing = normalizeCanonicalSrsState(result.existingSrsState);
    assertState(existing.identityKey === item.identityKey,
      'SRS_IDENTITY_MISMATCH', 'existing SRS state must match the Review item identity');
    base.srsAction = 'reuse-existing-canonical-state';
    base.srsInitialRoute = null;
    base.existingSrsState = existing;
    return base;
  }

  function composeQueue(inputs, options) {
    inputs = inputs || {};
    options = options || {};
    var config = tierConfig(options.tier || 'free');
    if (!config.runtimeEnabled && options.allowDormantTier !== true) throw errorWithCode('TIER_DISABLED');
    assertState(Array.isArray(inputs.reviewQueueItems), 'INVALID_REVIEW_INPUT', 'reviewQueueItems must be an array');
    assertState(Array.isArray(inputs.srsDueSnapshot), 'INVALID_SRS_INPUT', 'srsDueSnapshot must be an array');

    var reviewIdentities = Object.create(null);
    var actionTokens = Object.create(null);
    var reviewRows = [];
    var ignoredReview = { resolved: 0, attemptLimit: 0 };
    inputs.reviewQueueItems.forEach(function (raw) {
      var row = normalizeReviewQueueItem(raw);
      assertState(!actionTokens[row.actionToken], 'DUPLICATE_ACTION_TOKEN', 'duplicate review actionToken');
      actionTokens[row.actionToken] = true;
      assertState(!reviewIdentities[row.identityKey],
        'DUPLICATE_REVIEW_IDENTITY', 'duplicate normalized review identity');
      reviewIdentities[row.identityKey] = true;
      if (row.resolved) { ignoredReview.resolved += 1; return; }
      var window = reviewAttemptWindow(config.id, row.attemptsUsed, {
        allowDormantTier: options.allowDormantTier === true
      });
      if (!window.canAttempt) { ignoredReview.attemptLimit += 1; return; }
      row.attemptWindow = window;
      reviewRows.push(row);
    });

    var srsIdentities = Object.create(null);
    var dueRows = [];
    var ignoredSrs = { notDue: 0, mastered: 0 };
    inputs.srsDueSnapshot.forEach(function (raw) {
      var row = normalizeSrsDueSnapshot(raw);
      assertState(!srsIdentities[row.identityKey],
        'DUPLICATE_SRS_IDENTITY', 'duplicate normalized SRS identity');
      srsIdentities[row.identityKey] = true;
      if (row.mastered) { ignoredSrs.mastered += 1; return; }
      if (!row.due) { ignoredSrs.notDue += 1; return; }
      dueRows.push(row);
    });

    reviewRows.sort(sortIdentity);
    dueRows.sort(sortIdentity);
    var dueByIdentity = Object.create(null);
    dueRows.forEach(function (row) { dueByIdentity[row.identityKey] = row; });
    var consumedDue = Object.create(null);
    var reviewQueue = reviewRows.map(function (row) {
      var alsoDue = !!dueByIdentity[row.identityKey];
      if (alsoDue) consumedDue[row.identityKey] = true;
      return queueItem('review_needed', row, alsoDue, row.attemptWindow);
    });
    var dueOnlyQueue = dueRows.filter(function (row) {
      return !consumedDue[row.identityKey];
    }).map(function (row) {
      return queueItem('srs_due', row, false, null);
    });
    var queue = reviewQueue.concat(dueOnlyQueue);
    var games = emptyGames();
    reviewQueue.forEach(function (item) { games[item.game].reviewNeeded.push(item); });
    dueOnlyQueue.forEach(function (item) { games[item.game].srsDueOnly.push(item); });
    GAME_IDS.forEach(function (game) {
      games[game].queue = games[game].reviewNeeded.concat(games[game].srsDueOnly);
    });

    return {
      readOnly: true,
      tier: config.id,
      config: config,
      queue: queue,
      games: games,
      totals: {
        reviewNeeded: reviewQueue.length,
        srsDueOnly: dueOnlyQueue.length,
        deduplicatedReviewAndDue: Object.keys(consumedDue).length,
        queue: queue.length
      },
      ignored: { review: ignoredReview, srs: ignoredSrs }
    };
  }

  function viewState(status, payload) {
    if (VIEW_STATES.indexOf(status) < 0) throw errorWithCode('UNKNOWN_VIEW_STATE');
    payload = payload || {};
    return { status: status, snapshot: payload.snapshot || null, error: payload.error || null };
  }

  function createCandidate(options) {
    options = options || {};
    if (options.enabled !== true) throw errorWithCode('FEATURE_DISABLED');
    var tier = options.tier || 'free';
    var config = tierConfig(tier);
    if (!config.runtimeEnabled && options.allowDormantTier !== true) throw errorWithCode('TIER_DISABLED');
    return {
      composeQueue: function (inputs, composeOptions) {
        composeOptions = composeOptions || {};
        composeOptions.tier = tier;
        composeOptions.allowDormantTier = options.allowDormantTier === true;
        return composeQueue(inputs, composeOptions);
      }
    };
  }

  return {
    FEATURE_DEFAULT_ENABLED: FEATURE_DEFAULT_ENABLED,
    GAME_IDS: GAME_IDS.slice(),
    VIEW_STATES: VIEW_STATES.slice(),
    getTierConfig: tierConfig,
    normalizeGame: normalizeGame,
    normalizeReviewQueueItem: normalizeReviewQueueItem,
    normalizeSrsDueSnapshot: normalizeSrsDueSnapshot,
    normalizeCanonicalSrsState: normalizeCanonicalSrsState,
    reviewAttemptWindow: reviewAttemptWindow,
    composeQueue: composeQueue,
    buildReviewResolutionDirective: buildReviewResolutionDirective,
    viewState: viewState,
    createCandidate: createCandidate
  };
});
