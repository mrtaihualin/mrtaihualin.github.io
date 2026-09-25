/* Headless, read-only pre-SRS state-machine candidate. Not loaded by public runtime. */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ReviewNeededCandidate = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var FEATURE_DEFAULT_ENABLED = false;
  var GAME_IDS = ['tone', 'reading', 'listening', 'typing', 'wordorder'];
  var ACTIVE_STATES = ['normal', 'retry_end_round', 'next_day_check', 'review_needed', 'weak_4d', 'srs'];
  var PRE_SRS_STATES = ['normal', 'retry_end_round', 'next_day_check', 'review_needed', 'weak_4d'];
  var VIEW_STATES = ['loading', 'ready', 'empty', 'error', 'access-denied'];
  var TIER_CONFIGS = {
    free: {
      id: 'free', runtimeEnabled: true, reviewAttemptMax: 1, reviewAllocationRate: 0.20,
      srsOwnerRoute: { initialStage: 0, checkpoints: [1, 7], masteredAfter: 7, challengeCheckpoints: [] }
    },
    paid: {
      id: 'paid', runtimeEnabled: false, reviewAttemptMax: 3, reviewAllocationRate: 0.30,
      srsOwnerRoute: { initialStage: 0, checkpoints: [1, 7, 16], masteredAfter: 16, challengeCheckpoints: [30, 60, 90] }
    }
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

  function addCalendarDays(value, days) {
    assertState(isCalendarDate(value), 'INVALID_CALENDAR_DATE', 'date must be valid YYYY-MM-DD');
    var parts = value.split('-').map(Number);
    var date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2] + days));
    return date.getUTCFullYear() + '-' + String(date.getUTCMonth() + 1).padStart(2, '0') + '-' +
      String(date.getUTCDate()).padStart(2, '0');
  }

  function normalizeGame(value) {
    var game = String(value || '').toLowerCase();
    if (game === 'word_order') game = 'wordorder';
    return GAME_IDS.indexOf(game) >= 0 ? game : null;
  }

  function identityPart(value, code, label) {
    assertState(value !== null && value !== undefined && String(value) !== '', code, label + ' is required');
    value = String(value);
    assertState(value.indexOf('\u0000') < 0, code, label + ' contains a forbidden separator');
    return value;
  }

  function normalizeIdentity(row, code) {
    var ownerKey = identityPart(row && row.ownerKey, code, 'ownerKey');
    var game = normalizeGame(row && row.game);
    assertState(!!game, 'UNKNOWN_GAME', 'unknown game');
    var level = identityPart(row && row.level, code, 'level');
    var itemId = identityPart(row && row.itemId, code, 'itemId');
    return {
      ownerKey: ownerKey,
      game: game,
      level: level,
      itemId: itemId,
      key: ownerKey + '\u0000' + game + '\u0000' + level + '\u0000' + itemId
    };
  }

  function normalizeToken(value, code, label) {
    return identityPart(value, code, label);
  }

  function normalizeActiveState(row) {
    assertState(row && typeof row === 'object' && !Array.isArray(row),
      'MALFORMED_ACTIVE_STATE', 'active state must be an object');
    assertState(row.sourceType === 'active_learning_state',
      'UNKNOWN_ACTIVE_STATE_SOURCE', 'sourceType must be active_learning_state');
    var identity = normalizeIdentity(row, 'MALFORMED_ACTIVE_STATE');
    var state = String(row.state || '').toLowerCase();
    assertState(ACTIVE_STATES.indexOf(state) >= 0, 'UNKNOWN_ACTIVE_STATE', 'unknown active state');
    var stateToken = normalizeToken(row.stateToken, 'MALFORMED_ACTIVE_STATE', 'stateToken');
    var dueOn = row.dueOn == null ? '' : String(row.dueOn);
    var dueRequired = state === 'next_day_check' || state === 'review_needed' || state === 'weak_4d';
    assertState(dueRequired ? isCalendarDate(dueOn) : dueOn === '',
      'MALFORMED_ACTIVE_STATE', dueRequired ? 'state requires dueOn' : 'state must not define dueOn');
    var roundToken = row.roundToken == null ? '' : String(row.roundToken);
    var retryOrdinal = row.retryOrdinal == null ? null : Number(row.retryOrdinal);
    var reviewAttemptsUsed = row.reviewAttemptsUsed == null ? null : row.reviewAttemptsUsed;
    if (state === 'retry_end_round') {
      roundToken = normalizeToken(roundToken, 'MALFORMED_ACTIVE_STATE', 'roundToken');
      assertState(retryOrdinal === 1, 'MALFORMED_ACTIVE_STATE', 'retry_end_round must be the one retry');
    } else {
      assertState(roundToken === '' && retryOrdinal === null,
        'MALFORMED_ACTIVE_STATE', 'only retry_end_round may carry retry metadata');
    }
    if (state === 'next_day_check' || state === 'review_needed') {
      assertState(typeof reviewAttemptsUsed === 'number' && isFinite(reviewAttemptsUsed) && reviewAttemptsUsed >= 0 &&
        Math.floor(reviewAttemptsUsed) === reviewAttemptsUsed,
      'MALFORMED_ACTIVE_STATE', 'next-day Review states require a non-negative reviewAttemptsUsed');
    } else {
      assertState(reviewAttemptsUsed === null,
        'MALFORMED_ACTIVE_STATE', 'only next-day Review states may carry reviewAttemptsUsed');
    }
    return {
      sourceType: 'active_learning_state',
      ownerKey: identity.ownerKey,
      game: identity.game,
      level: identity.level,
      itemId: identity.itemId,
      identityKey: identity.key,
      state: state,
      stateToken: stateToken,
      dueOn: dueOn,
      roundToken: roundToken,
      retryOrdinal: retryOrdinal,
      reviewAttemptsUsed: reviewAttemptsUsed
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
      'MALFORMED_CANONICAL_SRS_STATE', 'dueDate must be empty or valid YYYY-MM-DD');
    assertState(typeof row.mastered === 'boolean',
      'MALFORMED_CANONICAL_SRS_STATE', 'mastered must be boolean');
    assertState(row.mastered || stage === 0 || !!row.dueDate,
      'MALFORMED_CANONICAL_SRS_STATE', 'non-mastered stage above zero requires dueDate');
    return {
      sourceType: 'canonical_srs_state',
      ownerKey: identity.ownerKey,
      game: identity.game,
      level: identity.level,
      itemId: identity.itemId,
      identityKey: identity.key,
      stateToken: normalizeToken(row.stateToken, 'MALFORMED_CANONICAL_SRS_STATE', 'stateToken'),
      stage: stage,
      dueDate: row.dueDate,
      mastered: row.mastered
    };
  }

  function normalizeSrsDueSnapshot(row) {
    assertState(row && typeof row === 'object' && !Array.isArray(row),
      'MALFORMED_SRS_SNAPSHOT', 'SRS due snapshot must be an object');
    assertState(row.sourceType === 'srs_due_snapshot',
      'UNKNOWN_SRS_SOURCE', 'sourceType must be srs_due_snapshot');
    var identity = normalizeIdentity(row, 'MALFORMED_SRS_SNAPSHOT');
    assertState(typeof row.due === 'boolean', 'MALFORMED_SRS_SNAPSHOT', 'due must be boolean');
    assertState(typeof row.mastered === 'boolean', 'MALFORMED_SRS_SNAPSHOT', 'mastered must be boolean');
    return {
      sourceType: 'srs_due_snapshot',
      ownerKey: identity.ownerKey,
      game: identity.game,
      level: identity.level,
      itemId: identity.itemId,
      identityKey: identity.key,
      due: row.due,
      mastered: row.mastered
    };
  }

  function normalizeStateSet(rows) {
    assertState(Array.isArray(rows), 'INVALID_ACTIVE_STATES', 'activeStates must be an array');
    var identities = Object.create(null);
    return rows.map(function (raw) {
      var row = normalizeActiveState(raw);
      assertState(!identities[row.identityKey], 'DUPLICATE_ACTIVE_STATE',
        'one owner + game + level + item may have only one active state');
      identities[row.identityKey] = true;
      return row;
    });
  }

  function tierConfig(tier) {
    var id = String(tier || 'free').toLowerCase();
    if (!TIER_CONFIGS[id]) throw errorWithCode('UNKNOWN_TIER');
    return copy(TIER_CONFIGS[id]);
  }

  function enabledTierConfig(options) {
    options = options || {};
    var config = tierConfig(options.tier || 'free');
    if (!config.runtimeEnabled && options.allowDormantTier !== true) throw errorWithCode('TIER_DISABLED');
    return config;
  }

  function validateTierState(state, config) {
    if (state.state === 'next_day_check' || state.state === 'review_needed') {
      assertState(state.reviewAttemptsUsed < config.reviewAttemptMax,
        'REVIEW_ATTEMPT_EXHAUSTED', 'Review state has no remaining attempt for this tier');
    }
  }

  function scoreBand(score) {
    assertState(typeof score === 'number' && isFinite(score) && Math.floor(score) === score && score >= 0 && score <= 10,
      'INVALID_SCORE', 'score must be an integer from 0 to 10');
    if (score === 10) return '10';
    if (score >= 4) return '4-9';
    return '0-3';
  }

  function transitionDecision(source, band, config) {
    var state = source.state;
    var target;
    var reviewAttempt = null;
    if (state === 'normal') {
      target = band === '10' ? 'srs' : band === '4-9' ? 'weak_4d' : 'retry_end_round';
    }
    else if (state === 'retry_end_round') {
      target = band === '10' ? 'next_day_check' : 'review_needed';
      reviewAttempt = {
        counted: false, before: 0, after: 0, max: config.reviewAttemptMax,
        remaining: config.reviewAttemptMax, exhausted: false
      };
    }
    else if (state === 'next_day_check' || state === 'review_needed') {
      var after = source.reviewAttemptsUsed + 1;
      var exhausted = after >= config.reviewAttemptMax;
      reviewAttempt = {
        counted: true, before: source.reviewAttemptsUsed, after: after,
        max: config.reviewAttemptMax, remaining: Math.max(0, config.reviewAttemptMax - after),
        exhausted: exhausted
      };
      if (band === '10') target = 'srs';
      else if (band === '4-9') target = 'weak_4d';
      else target = exhausted ? 'weak_4d' : 'review_needed';
    }
    else if (state === 'weak_4d') {
      target = band === '10' ? 'srs' : band === '4-9' ? 'weak_4d' : 'retry_end_round';
    }
    else throw errorWithCode('SRS_OWNER_ONLY', 'SRS transitions belong only to the SRS owner');
    return { target: target, reviewAttempt: reviewAttempt };
  }

  function activeStateFromTransition(source, target, evidence, reviewAttemptsUsed) {
    var dueOn = '';
    if (target === 'next_day_check' || target === 'review_needed') dueOn = addCalendarDays(evidence.occurredOn, 1);
    if (target === 'weak_4d') dueOn = addCalendarDays(evidence.occurredOn, 4);
    var roundToken = '';
    var retryOrdinal = null;
    if (target === 'retry_end_round') {
      roundToken = normalizeToken(evidence.roundToken, 'ROUND_TOKEN_REQUIRED', 'roundToken');
      retryOrdinal = 1;
    }
    return {
      sourceType: 'active_learning_state',
      ownerKey: source.ownerKey,
      game: source.game,
      level: source.level,
      itemId: source.itemId,
      identityKey: source.identityKey,
      state: target,
      stateToken: 'next:' + evidence.actionToken,
      dueOn: dueOn,
      roundToken: roundToken,
      retryOrdinal: retryOrdinal,
      reviewAttemptsUsed: target === 'next_day_check' || target === 'review_needed' ? reviewAttemptsUsed : null
    };
  }

  function buildTransitionDirective(rawState, rawEvidence, options) {
    var source = normalizeActiveState(rawState);
    assertState(PRE_SRS_STATES.indexOf(source.state) >= 0,
      'SRS_OWNER_ONLY', 'SRS transitions cannot return to pre-SRS states');
    var evidence = copy(rawEvidence || {});
    var config = enabledTierConfig(options);
    validateTierState(source, config);
    var band = scoreBand(evidence.score);
    assertState(isCalendarDate(evidence.occurredOn), 'INVALID_CALENDAR_DATE', 'occurredOn is required');
    evidence.actionToken = normalizeToken(evidence.actionToken, 'MALFORMED_RESULT_EVIDENCE', 'actionToken');
    var decision = transitionDecision(source, band, config);
    var target = decision.target;
    var nextState;
    var srsOwnerDirective = null;

    if (target === 'srs') {
      assertState(evidence.srsStateStatus === 'absent' || evidence.srsStateStatus === 'present',
        'SRS_STATE_PRESENCE_REQUIRED', 'SRS entry requires explicit absent or present status');
      if (evidence.srsStateStatus === 'absent') {
        assertState(!evidence.existingSrsState, 'CONFLICTING_SRS_STATE_STATUS',
          'absent status cannot include canonical SRS state');
        nextState = activeStateFromTransition(source, 'srs', evidence, null);
        srsOwnerDirective = {
          action: 'request-canonical-initial-route',
          tier: config.id,
          ownerRoute: copy(config.srsOwnerRoute),
          derivedStage: 0,
          day1Passed: false,
          firstCheckpoint: 'resolve-by-current-srs-authority',
          duplicateSrsCreationAllowed: false
        };
      } else {
        var existing = normalizeCanonicalSrsState(evidence.existingSrsState);
        assertState(existing.identityKey === source.identityKey,
          'SRS_IDENTITY_MISMATCH', 'canonical SRS state must match active identity');
        nextState = {
          sourceType: 'active_learning_state',
          ownerKey: existing.ownerKey,
          game: existing.game,
          level: existing.level,
          itemId: existing.itemId,
          identityKey: existing.identityKey,
          state: 'srs',
          stateToken: existing.stateToken,
          dueOn: '',
          roundToken: '',
          retryOrdinal: null,
          reviewAttemptsUsed: null
        };
        srsOwnerDirective = {
          action: 'reuse-existing-canonical-state', tier: config.id,
          ownerRoute: copy(config.srsOwnerRoute), state: existing
        };
      }
    } else {
      assertState(evidence.srsStateStatus == null && !evidence.existingSrsState,
        'CONFLICTING_SRS_STATE_STATUS', 'pre-SRS transition cannot carry SRS state');
      nextState = activeStateFromTransition(source, target, evidence,
        decision.reviewAttempt ? decision.reviewAttempt.after : null);
    }

    return {
      readOnlyDirective: true,
      tier: config.id,
      identityKey: source.identityKey,
      actionToken: evidence.actionToken,
      score: Number(evidence.score),
      scoreBand: band,
      fromState: source.state,
      toState: target,
      expectedStateToken: source.stateToken,
      closeStateToken: source.stateToken,
      nextActiveState: nextState,
      dueOn: nextState.dueOn || null,
      queueGroup: target === 'next_day_check' || target === 'review_needed' ? 'next-day-priority-group' :
        target === 'retry_end_round' ? 'end-of-round-once' : target === 'weak_4d' ? 'weak-4d' : 'srs-owner',
      absoluteQuestionPosition: null,
      atomicOwnerContract: {
        compareAndSwap: true,
        replaceOneActiveState: true,
        idempotencyKey: evidence.actionToken,
        duplicateActiveStateAllowed: false
      },
      reviewAttempt: decision.reviewAttempt,
      srsOwnerDirective: srsOwnerDirective,
      candidateMutatesSrs: false,
      candidateMutatesStorage: false,
      savedWord: 'manual-only'
    };
  }

  function applyDirectives(activeStates, directives) {
    var normalized = normalizeStateSet(activeStates);
    assertState(Array.isArray(directives), 'INVALID_DIRECTIVES', 'directives must be an array');
    var byIdentity = Object.create(null);
    var seenActions = Object.create(null);
    normalized.forEach(function (row) { byIdentity[row.identityKey] = row; });
    var applied = 0;
    var duplicateIgnored = 0;
    var raceRejected = 0;
    directives.forEach(function (directive) {
      assertState(directive && directive.readOnlyDirective === true && directive.atomicOwnerContract,
        'MALFORMED_DIRECTIVE', 'owner directive is malformed');
      var action = normalizeToken(directive.actionToken, 'MALFORMED_DIRECTIVE', 'actionToken');
      assertState(directive.atomicOwnerContract.compareAndSwap === true &&
        directive.atomicOwnerContract.replaceOneActiveState === true &&
        directive.atomicOwnerContract.duplicateActiveStateAllowed === false &&
        directive.atomicOwnerContract.idempotencyKey === action &&
        directive.closeStateToken === directive.expectedStateToken &&
        directive.candidateMutatesSrs === false && directive.candidateMutatesStorage === false,
      'MALFORMED_DIRECTIVE', 'directive must preserve the atomic read-only owner contract');
      var serialized = JSON.stringify(directive);
      if (seenActions[action]) {
        assertState(seenActions[action] === serialized, 'IDEMPOTENCY_CONFLICT',
          'same actionToken cannot describe another transition');
        duplicateIgnored += 1;
        return;
      }
      var current = byIdentity[directive.identityKey];
      if (!current || current.stateToken !== directive.expectedStateToken) {
        raceRejected += 1;
        return;
      }
      var next = normalizeActiveState(directive.nextActiveState);
      assertState(next.identityKey === directive.identityKey,
        'DIRECTIVE_IDENTITY_MISMATCH', 'next active state must keep identity');
      byIdentity[directive.identityKey] = next;
      seenActions[action] = serialized;
      applied += 1;
    });
    return {
      readOnlySimulation: true,
      activeStates: Object.keys(byIdentity).map(function (key) { return byIdentity[key]; }).sort(sortIdentity),
      applied: applied,
      duplicateIgnored: duplicateIgnored,
      raceRejected: raceRejected
    };
  }

  function sortIdentity(a, b) {
    return a.identityKey.localeCompare(b.identityKey);
  }

  function queueRow(row, group, sourceType, allocationStatus) {
    return {
      sourceType: sourceType || row.state,
      ownerKey: row.ownerKey,
      game: row.game,
      level: row.level,
      itemId: row.itemId,
      identityKey: row.identityKey,
      state: row.state,
      dueOn: row.dueOn || null,
      priorityGroup: group,
      absoluteQuestionPosition: null,
      stateToken: row.stateToken,
      reviewAttemptsUsed: row.reviewAttemptsUsed,
      allocationStatus: allocationStatus || null,
      savedWord: 'manual-only'
    };
  }

  function composeQueuePlan(inputs, options) {
    inputs = inputs || {};
    options = options || {};
    var today = String(options.today || '');
    assertState(isCalendarDate(today), 'INVALID_TODAY', 'today must be valid YYYY-MM-DD');
    var config = enabledTierConfig(options);
    var playSetSize = options.playSetSize;
    assertState(typeof playSetSize === 'number' && isFinite(playSetSize) &&
      playSetSize > 0 && Math.floor(playSetSize) === playSetSize,
      'INVALID_PLAY_SET_SIZE', 'playSetSize must be a positive integer');
    var states = normalizeStateSet(inputs.activeStates);
    states.forEach(function (row) { validateTierState(row, config); });
    assertState(Array.isArray(inputs.srsDueSnapshot), 'INVALID_SRS_INPUT', 'srsDueSnapshot must be an array');
    var stateByIdentity = Object.create(null);
    states.forEach(function (row) { stateByIdentity[row.identityKey] = row; });
    var dueIdentities = Object.create(null);
    var dueRows = inputs.srsDueSnapshot.map(normalizeSrsDueSnapshot);
    dueRows.forEach(function (row) {
      assertState(!dueIdentities[row.identityKey], 'DUPLICATE_SRS_DUE_SNAPSHOT', 'duplicate SRS Due identity');
      dueIdentities[row.identityKey] = true;
      var state = stateByIdentity[row.identityKey];
      assertState(!!state && state.state === 'srs', 'SRS_DUE_STATE_CONFLICT',
        'SRS Due snapshot requires the one active state to be SRS');
    });

    var groups = {
      nextDayPriority: [],
      reviewCarryForward: [],
      weakDue: [],
      srsDue: [],
      normal: [],
      retryEndRound: []
    };
    var eligibleReviewRows = [];
    var notDue = 0;
    states.forEach(function (row) {
      if (row.state === 'next_day_check' || row.state === 'review_needed') {
        if (row.dueOn <= today) eligibleReviewRows.push(queueRow(row, 'next-day-priority-group'));
        else notDue += 1;
      } else if (row.state === 'weak_4d') {
        if (row.dueOn <= today) groups.weakDue.push(queueRow(row, 'weak-4d-due'));
        else notDue += 1;
      } else if (row.state === 'retry_end_round') {
        groups.retryEndRound.push(queueRow(row, 'end-of-round-once'));
      } else if (row.state === 'normal') {
        groups.normal.push(queueRow(row, 'normal-round'));
      }
    });
    dueRows.forEach(function (row) {
      if (row.due && !row.mastered) groups.srsDue.push(queueRow(stateByIdentity[row.identityKey], 'srs-due', 'srs_due'));
    });
    var reviewSlotLimit = Math.floor((playSetSize * config.reviewAllocationRate) + 0.000000001);
    groups.nextDayPriority = eligibleReviewRows.slice(0, reviewSlotLimit).map(function (row) {
      row.allocationStatus = 'selected-current-set';
      return row;
    });
    groups.reviewCarryForward = eligibleReviewRows.slice(reviewSlotLimit).map(function (row) {
      row.allocationStatus = 'carry-forward';
      return row;
    });
    ['weakDue', 'srsDue', 'normal', 'retryEndRound'].forEach(function (key) {
      groups[key].sort(sortIdentity);
    });
    var technicalRows = groups.nextDayPriority.concat(groups.reviewCarryForward,
      groups.weakDue, groups.srsDue, groups.normal, groups.retryEndRound);
    return {
      readOnly: true,
      tier: config.id,
      today: today,
      groups: groups,
      technicalRows: technicalRows,
      reviewAllocation: {
        rate: config.reviewAllocationRate,
        playSetSize: playSetSize,
        slotLimit: reviewSlotLimit,
        eligibleCount: eligibleReviewRows.length,
        selected: copy(groups.nextDayPriority),
        carryForward: copy(groups.reviewCarryForward),
        preservesNormalizedInputOrder: true,
        independentFromSrsDueQuota: true,
        unplayedStateRemainsEligibleUntilOwnerTransition: true,
        candidateMutatesState: false
      },
      absoluteQuestionOrder: null,
      priorityContract: {
        nextDayItemsAreFrontGroup: true,
        everyNextDayItemIsLiteralQuestionOne: false,
        retryAppearsOnceAtEndOfRound: true,
        overflowMovesToNextPlaySet: true,
        unplayedCarriesAcrossCalendarDays: true,
        finalWithinGroupOrder: null
      },
      totals: {
        activeStates: states.length,
        technicalRows: technicalRows.length,
        reviewEligible: eligibleReviewRows.length,
        reviewSelected: groups.nextDayPriority.length,
        reviewCarryForward: groups.reviewCarryForward.length,
        notDue: notDue
      }
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
      composeQueuePlan: function (inputs, composeOptions) {
        composeOptions = copy(composeOptions || {});
        composeOptions.tier = tier;
        composeOptions.allowDormantTier = options.allowDormantTier === true;
        return composeQueuePlan(inputs, composeOptions);
      },
      buildTransitionDirective: function (state, evidence) {
        return buildTransitionDirective(state, evidence, {
          tier: tier,
          allowDormantTier: options.allowDormantTier === true
        });
      }
    };
  }

  return {
    FEATURE_DEFAULT_ENABLED: FEATURE_DEFAULT_ENABLED,
    GAME_IDS: GAME_IDS.slice(),
    ACTIVE_STATES: ACTIVE_STATES.slice(),
    PRE_SRS_STATES: PRE_SRS_STATES.slice(),
    VIEW_STATES: VIEW_STATES.slice(),
    getTierConfig: tierConfig,
    normalizeGame: normalizeGame,
    normalizeActiveState: normalizeActiveState,
    normalizeCanonicalSrsState: normalizeCanonicalSrsState,
    normalizeSrsDueSnapshot: normalizeSrsDueSnapshot,
    normalizeStateSet: normalizeStateSet,
    scoreBand: scoreBand,
    addCalendarDays: addCalendarDays,
    buildTransitionDirective: buildTransitionDirective,
    applyDirectives: applyDirectives,
    composeQueuePlan: composeQueuePlan,
    viewState: viewState,
    createCandidate: createCandidate
  };
});
