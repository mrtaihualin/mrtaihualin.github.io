#!/usr/bin/env node
'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var root = path.resolve(__dirname, '..');
var contract = require(path.join(root, 'js/review-needed/review-needed-candidate.js'));
var adapter = require(path.join(root, 'js/review-needed/review-needed-read-adapter.js'));
var fixtures = require(path.join(root, 'scripts/fixtures/review-needed-hidden-fixtures.js'));
var passes = 0;

function check(label, fn) {
  fn();
  passes += 1;
  process.stdout.write('PASS ' + label + '\n');
}

function throwsCode(fn, code) {
  assert.throws(fn, function (error) { return error && error.code === code; });
}

function active(state, overrides) {
  return fixtures.active(state, overrides);
}

function evidence(score, overrides) {
  return Object.assign({ score: score, occurredOn: '2026-08-28', actionToken: 'action-' + score }, overrides || {});
}

function transition(state, score, stateOverrides, evidenceOverrides, tier) {
  var input = evidence(score, evidenceOverrides);
  var targetNeedsSrs = score === 10 && state !== 'retry_end_round';
  if (targetNeedsSrs && input.srsStateStatus == null) input.srsStateStatus = 'absent';
  tier = tier || 'free';
  return contract.buildTransitionDirective(active(state, stateOverrides), input, {
    tier: tier, allowDormantTier: tier === 'paid'
  });
}

function srsDue(overrides) {
  return Object.assign({
    sourceType: 'srs_due_snapshot', ownerKey: 'fixture-owner', game: 'tone', level: '1',
    itemId: 'fixture-item', due: true, mastered: false
  }, overrides || {});
}

function compose(states, due, tier, overrides) {
  tier = tier || 'free';
  return contract.composeQueuePlan({ activeStates: states || [], srsDueSnapshot: due || [] }, Object.assign({
    today: '2026-08-28', playSetSize: 10, tier: tier, allowDormantTier: tier === 'paid'
  }, overrides || {}));
}

function reviewStates(count, state) {
  return Array.from({ length: count }, function (_, index) {
    return active(state || 'review_needed', {
      itemId: 'review-' + index, stateToken: 'review-state-' + index,
      dueOn: '2026-08-28', reviewAttemptsUsed: 0
    });
  });
}

function publicHtmlFiles(dir) {
  var output = [];
  fs.readdirSync(dir, { withFileTypes: true }).forEach(function (entry) {
    if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === 'dev') return;
    var file = path.join(dir, entry.name);
    if (entry.isDirectory()) output = output.concat(publicHtmlFiles(file));
    else if (/\.html$/i.test(entry.name)) output.push(file);
  });
  return output;
}

try {
  check('feature defaults OFF; Free and dormant Paid expose only locked tier contracts', function () {
    assert.strictEqual(contract.FEATURE_DEFAULT_ENABLED, false);
    throwsCode(function () { contract.createCandidate({ tier: 'free' }); }, 'FEATURE_DISABLED');
    throwsCode(function () { contract.createCandidate({ enabled: true, tier: 'paid' }); }, 'TIER_DISABLED');
    assert.deepStrictEqual(contract.getTierConfig('free'), {
      id: 'free', runtimeEnabled: true, reviewAttemptMax: 1, reviewAllocationRate: 0.20,
      srsOwnerRoute: { initialStage: 0, checkpoints: [1, 7], masteredAfter: 7, challengeCheckpoints: [] }
    });
    assert.deepStrictEqual(contract.getTierConfig('paid'), {
      id: 'paid', runtimeEnabled: false, reviewAttemptMax: 3, reviewAllocationRate: 0.30,
      srsOwnerRoute: { initialStage: 0, checkpoints: [1, 7, 16], masteredAfter: 16, challengeCheckpoints: [30, 60, 90] }
    });
    var paidCandidate = contract.createCandidate({ enabled: true, tier: 'paid', allowDormantTier: true });
    var paidDirective = paidCandidate.buildTransitionDirective(active('review_needed', {
      dueOn: '2026-08-28', reviewAttemptsUsed: 1
    }), evidence(0, { actionToken: 'paid-wrapper' }));
    assert.deepStrictEqual([paidDirective.tier, paidDirective.reviewAttempt.after, paidDirective.reviewAttempt.max], ['paid', 2, 3]);
  });

  check('identity is owner + game + level + item across exactly five games', function () {
    assert.deepStrictEqual(contract.GAME_IDS, ['tone', 'reading', 'listening', 'typing', 'wordorder']);
    assert.strictEqual(contract.normalizeGame('word_order'), 'wordorder');
    var row = contract.normalizeActiveState(active('normal'));
    assert.strictEqual(row.identityKey, 'fixture-owner\u0000tone\u00001\u0000fixture-item');
    assert.deepStrictEqual(contract.ACTIVE_STATES, [
      'normal', 'retry_end_round', 'next_day_check', 'review_needed', 'weak_4d', 'srs'
    ]);
  });

  check('one active state per identity is enforced before any allocation', function () {
    throwsCode(function () {
      contract.normalizeStateSet([active('normal'), active('weak_4d', { dueOn: '2026-09-01' })]);
    }, 'DUPLICATE_ACTIVE_STATE');
    assert.strictEqual(contract.normalizeStateSet([
      active('normal'), active('normal', { ownerKey: 'other-owner' })
    ]).length, 2);
  });

  check('Normal transitions are identical for Free and Paid at every band edge', function () {
    ['free', 'paid'].forEach(function (tier) {
      [[0, 'retry_end_round'], [3, 'retry_end_round'], [4, 'weak_4d'], [9, 'weak_4d'], [10, 'srs']]
        .forEach(function (entry, index) {
          var directive = transition('normal', entry[0], null, {
            actionToken: tier + '-normal-' + index,
            roundToken: entry[1] === 'retry_end_round' ? tier + '-normal-round' : undefined
          }, tier);
          assert.strictEqual(directive.toState, entry[1]);
          if (entry[1] === 'weak_4d') assert.strictEqual(directive.dueOn, '2026-09-01');
          if (entry[1] === 'retry_end_round') assert.strictEqual(directive.nextActiveState.retryOrdinal, 1);
        });
    });
  });

  check('Retry transitions are identical for Free and Paid and initialize zero Review attempts', function () {
    ['free', 'paid'].forEach(function (tier) {
      [[0, 'review_needed'], [3, 'review_needed'], [4, 'review_needed'], [9, 'review_needed'], [10, 'next_day_check']]
        .forEach(function (entry, index) {
          var directive = transition('retry_end_round', entry[0], null, {
            actionToken: tier + '-retry-' + index
          }, tier);
          assert.strictEqual(directive.toState, entry[1]);
          assert.strictEqual(directive.dueOn, '2026-08-29');
          assert.strictEqual(directive.nextActiveState.reviewAttemptsUsed, 0);
          assert.deepStrictEqual(directive.reviewAttempt, {
            counted: false, before: 0, after: 0,
            max: tier === 'free' ? 1 : 3, remaining: tier === 'free' ? 1 : 3, exhausted: false
          });
        });
    });
  });

  check('Free consumes its one Review attempt then low score exits to WEAK_4D +4', function () {
    ['next_day_check', 'review_needed'].forEach(function (state) {
      var directive = transition(state, 0, { dueOn: '2026-08-28', reviewAttemptsUsed: 0 }, {
        actionToken: 'free-exhaust-' + state
      }, 'free');
      assert.strictEqual(directive.toState, 'weak_4d');
      assert.strictEqual(directive.dueOn, '2026-09-01');
      assert.deepStrictEqual(directive.reviewAttempt, {
        counted: true, before: 0, after: 1, max: 1, remaining: 0, exhausted: true
      });
      assert.strictEqual(directive.nextActiveState.reviewAttemptsUsed, null);
    });
  });

  check('Paid allows exactly three Review attempts then low score exits to WEAK_4D +4', function () {
    var first = transition('review_needed', 0, { dueOn: '2026-08-28', reviewAttemptsUsed: 0 }, {
      actionToken: 'paid-attempt-1'
    }, 'paid');
    assert.strictEqual(first.toState, 'review_needed');
    assert.strictEqual(first.nextActiveState.reviewAttemptsUsed, 1);
    assert.strictEqual(first.reviewAttempt.remaining, 2);
    var second = contract.buildTransitionDirective(first.nextActiveState, evidence(3, {
      occurredOn: '2026-08-29', actionToken: 'paid-attempt-2'
    }), { tier: 'paid', allowDormantTier: true });
    assert.strictEqual(second.toState, 'review_needed');
    assert.strictEqual(second.nextActiveState.reviewAttemptsUsed, 2);
    assert.strictEqual(second.reviewAttempt.remaining, 1);
    var third = contract.buildTransitionDirective(second.nextActiveState, evidence(0, {
      occurredOn: '2026-08-30', actionToken: 'paid-attempt-3'
    }), { tier: 'paid', allowDormantTier: true });
    assert.strictEqual(third.toState, 'weak_4d');
    assert.strictEqual(third.dueOn, '2026-09-03');
    assert.deepStrictEqual(third.reviewAttempt, {
      counted: true, before: 2, after: 3, max: 3, remaining: 0, exhausted: true
    });
  });

  check('Review score 4-9 and 10 consume the current attempt and leave Review flow', function () {
    ['free', 'paid'].forEach(function (tier) {
      var used = tier === 'free' ? 0 : 2;
      var mid = transition('review_needed', 4, { dueOn: '2026-08-28', reviewAttemptsUsed: used }, {
        actionToken: tier + '-mid'
      }, tier);
      assert.strictEqual(mid.toState, 'weak_4d');
      assert.strictEqual(mid.dueOn, '2026-09-01');
      assert.strictEqual(mid.reviewAttempt.after, used + 1);
      var correct = transition('next_day_check', 10, { dueOn: '2026-08-28', reviewAttemptsUsed: used }, {
        actionToken: tier + '-correct'
      }, tier);
      assert.strictEqual(correct.toState, 'srs');
      assert.strictEqual(correct.reviewAttempt.after, used + 1);
      assert.strictEqual(correct.srsOwnerDirective.derivedStage, 0);
    });
  });

  check('WEAK_4D transitions are identical for Free and Paid', function () {
    ['free', 'paid'].forEach(function (tier) {
      var state = { dueOn: '2026-08-28' };
      assert.strictEqual(transition('weak_4d', 0, state, {
        actionToken: tier + '-weak-low', roundToken: tier + '-weak-round'
      }, tier).toState, 'retry_end_round');
      assert.strictEqual(transition('weak_4d', 4, state, { actionToken: tier + '-weak-mid' }, tier).dueOn, '2026-09-01');
      assert.strictEqual(transition('weak_4d', 10, state, { actionToken: tier + '-weak-correct' }, tier)
        .srsOwnerDirective.derivedStage, 0);
    });
  });

  check('calendar scheduling is exact across month, year, and leap boundaries', function () {
    assert.strictEqual(contract.addCalendarDays('2026-08-31', 1), '2026-09-01');
    assert.strictEqual(contract.addCalendarDays('2026-12-31', 1), '2027-01-01');
    assert.strictEqual(contract.addCalendarDays('2028-02-28', 1), '2028-02-29');
    assert.strictEqual(contract.addCalendarDays('2028-02-28', 4), '2028-03-03');
  });

  check('Free allocation selects at most 20 percent and carries overflow in input order', function () {
    var plan = compose(reviewStates(5), [], 'free');
    assert.deepStrictEqual([
      plan.reviewAllocation.rate, plan.reviewAllocation.playSetSize,
      plan.reviewAllocation.slotLimit, plan.reviewAllocation.eligibleCount
    ], [0.20, 10, 2, 5]);
    assert.deepStrictEqual(plan.groups.nextDayPriority.map(function (row) { return row.itemId; }), ['review-0', 'review-1']);
    assert.deepStrictEqual(plan.groups.reviewCarryForward.map(function (row) { return row.itemId; }), ['review-2', 'review-3', 'review-4']);
    assert.deepStrictEqual([plan.totals.reviewSelected, plan.totals.reviewCarryForward], [2, 3]);
  });

  check('dormant Paid allocation selects at most 30 percent and carries overflow', function () {
    var plan = compose(reviewStates(5), [], 'paid');
    assert.strictEqual(plan.reviewAllocation.rate, 0.30);
    assert.strictEqual(plan.reviewAllocation.slotLimit, 3);
    assert.deepStrictEqual(plan.groups.nextDayPriority.map(function (row) { return row.itemId; }), ['review-0', 'review-1', 'review-2']);
    assert.deepStrictEqual(plan.groups.reviewCarryForward.map(function (row) { return row.itemId; }), ['review-3', 'review-4']);
  });

  check('overflow moves into the next play set after prior selected items transition', function () {
    var states = reviewStates(5);
    var first = compose(states, [], 'free');
    var directives = states.slice(0, 2).map(function (state, index) {
      return contract.buildTransitionDirective(state, evidence(10, {
        actionToken: 'clear-first-set-' + index, srsStateStatus: 'absent'
      }), { tier: 'free' });
    });
    var applied = contract.applyDirectives(states, directives);
    var second = compose(applied.activeStates, [], 'free');
    assert.deepStrictEqual(first.groups.reviewCarryForward.map(function (row) { return row.itemId; }), ['review-2', 'review-3', 'review-4']);
    assert.deepStrictEqual(second.groups.nextDayPriority.map(function (row) { return row.itemId; }), ['review-2', 'review-3']);
    assert.deepStrictEqual(second.groups.reviewCarryForward.map(function (row) { return row.itemId; }), ['review-4']);
  });

  check('unplayed Review items remain unique and eligible on the next calendar day', function () {
    var states = reviewStates(5);
    var today = compose(states, [], 'free', { today: '2026-08-28' });
    var tomorrow = compose(states, [], 'free', { today: '2026-08-29' });
    function all(plan) {
      return plan.groups.nextDayPriority.concat(plan.groups.reviewCarryForward).map(function (row) { return row.identityKey; });
    }
    assert.deepStrictEqual(all(today), all(tomorrow));
    assert.strictEqual(new Set(all(tomorrow)).size, 5);
    assert.strictEqual(tomorrow.reviewAllocation.unplayedStateRemainsEligibleUntilOwnerTransition, true);
  });

  check('Review allocation is separate from the SRS Due owner snapshot', function () {
    var reviews = reviewStates(5);
    var srsStates = Array.from({ length: 4 }, function (_, index) {
      return active('srs', { itemId: 'srs-' + index, stateToken: 'srs-state-' + index });
    });
    var due = srsStates.map(function (row) {
      return srsDue({ itemId: row.itemId });
    });
    var plan = compose(reviews.concat(srsStates), due, 'free');
    assert.strictEqual(plan.groups.nextDayPriority.length, 2);
    assert.strictEqual(plan.groups.reviewCarryForward.length, 3);
    assert.strictEqual(plan.groups.srsDue.length, 4);
    assert.strictEqual(plan.reviewAllocation.independentFromSrsDueQuota, true);
  });

  check('selected next-day items are a front group, never literal question-one assignments', function () {
    var plan = compose(reviewStates(4), [], 'free');
    assert.strictEqual(plan.groups.nextDayPriority.length, 2);
    assert.strictEqual(plan.priorityContract.nextDayItemsAreFrontGroup, true);
    assert.strictEqual(plan.priorityContract.everyNextDayItemIsLiteralQuestionOne, false);
    assert.strictEqual(plan.priorityContract.finalWithinGroupOrder, null);
    plan.groups.nextDayPriority.forEach(function (row) { assert.strictEqual(row.absoluteQuestionPosition, null); });
    assert.strictEqual(plan.absoluteQuestionOrder, null);
  });

  check('Free and Paid SRS owner directives preserve their locked routes without mutation/backflow', function () {
    var free = transition('review_needed', 10, { dueOn: '2026-08-28', reviewAttemptsUsed: 0 }, {
      actionToken: 'free-route'
    }, 'free');
    var paid = transition('review_needed', 10, { dueOn: '2026-08-28', reviewAttemptsUsed: 0 }, {
      actionToken: 'paid-route'
    }, 'paid');
    assert.deepStrictEqual(free.srsOwnerDirective.ownerRoute, {
      initialStage: 0, checkpoints: [1, 7], masteredAfter: 7, challengeCheckpoints: []
    });
    assert.deepStrictEqual(paid.srsOwnerDirective.ownerRoute, {
      initialStage: 0, checkpoints: [1, 7, 16], masteredAfter: 16, challengeCheckpoints: [30, 60, 90]
    });
    [free, paid].forEach(function (directive) {
      assert.strictEqual(directive.candidateMutatesSrs, false);
      assert.strictEqual(directive.candidateMutatesStorage, false);
      assert.strictEqual(directive.srsOwnerDirective.day1Passed, false);
      assert.strictEqual(Object.prototype.hasOwnProperty.call(directive.srsOwnerDirective, 'dueDate'), false);
    });
    throwsCode(function () {
      contract.buildTransitionDirective(active('srs'), evidence(0, { roundToken: 'no-backflow' }), { tier: 'free' });
    }, 'SRS_OWNER_ONLY');
  });

  check('existing canonical SRS state is reused deterministically without duplicate creation', function () {
    var directive = transition('review_needed', 10, { dueOn: '2026-08-28', reviewAttemptsUsed: 0 }, {
      srsStateStatus: 'present', existingSrsState: fixtures.existingSrs, actionToken: 'reuse-existing'
    }, 'free');
    assert.strictEqual(directive.srsOwnerDirective.action, 'reuse-existing-canonical-state');
    assert.strictEqual(directive.nextActiveState.stateToken, 'canonical-srs-existing');
    assert.strictEqual(directive.srsOwnerDirective.state.stage, 2);
    assert.strictEqual(directive.srsOwnerDirective.state.dueDate, '2026-09-03');
    throwsCode(function () {
      transition('review_needed', 10, { dueOn: '2026-08-28', reviewAttemptsUsed: 0 }, {
        srsStateStatus: 'unknown'
      }, 'free');
    }, 'SRS_STATE_PRESENCE_REQUIRED');
  });

  check('atomic simulation is idempotent and rejects a concurrent stale-state loser', function () {
    var source = active('normal');
    var low = transition('normal', 0, null, { actionToken: 'race-low', roundToken: 'race-round' });
    var correct = transition('normal', 10, null, { actionToken: 'race-correct' });
    var repeated = contract.applyDirectives([source], [low, low]);
    assert.deepStrictEqual([repeated.applied, repeated.duplicateIgnored, repeated.raceRejected], [1, 1, 0]);
    var race = contract.applyDirectives([source], [low, correct]);
    assert.deepStrictEqual([race.applied, race.raceRejected, race.activeStates.length], [1, 1, 1]);
    assert.strictEqual(race.activeStates[0].state, 'retry_end_round');
  });

  check('same idempotency token cannot describe another transition', function () {
    var first = transition('normal', 0, null, { actionToken: 'same-token', roundToken: 'round-one' });
    var conflicting = transition('normal', 4, null, { actionToken: 'same-token' });
    throwsCode(function () { contract.applyDirectives([active('normal')], [first, conflicting]); }, 'IDEMPOTENCY_CONFLICT');
  });

  check('same item stays isolated across owners and all five games', function () {
    var states = contract.GAME_IDS.map(function (game) {
      return active('review_needed', {
        game: game, itemId: 'same-item', dueOn: '2026-08-28', stateToken: 'state-' + game,
        reviewAttemptsUsed: 0
      });
    }).concat([active('review_needed', {
      ownerKey: 'other-owner', game: 'tone', itemId: 'same-item', dueOn: '2026-08-28',
      stateToken: 'other-state', reviewAttemptsUsed: 0
    })]);
    var plan = compose(states, [], 'paid', { playSetSize: 20 });
    var all = plan.groups.nextDayPriority.concat(plan.groups.reviewCarryForward);
    assert.strictEqual(all.length, 6);
    assert.strictEqual(new Set(all.map(function (row) { return row.identityKey; })).size, 6);
  });

  check('malformed state, attempt exhaustion, invalid score/date/set size fail closed', function () {
    throwsCode(function () { contract.normalizeActiveState(active('unknown')); }, 'UNKNOWN_ACTIVE_STATE');
    throwsCode(function () {
      contract.normalizeActiveState(active('review_needed', { reviewAttemptsUsed: null, dueOn: '2026-08-28' }));
    }, 'MALFORMED_ACTIVE_STATE');
    throwsCode(function () { contract.normalizeActiveState(active('normal', { reviewAttemptsUsed: 0 })); }, 'MALFORMED_ACTIVE_STATE');
    throwsCode(function () { contract.normalizeActiveState(active('weak_4d', { dueOn: '2026-02-30' })); }, 'MALFORMED_ACTIVE_STATE');
    [-1, 11, 4.5, '10', null].forEach(function (score) {
      throwsCode(function () { transition('normal', score, null, { roundToken: 'bad-score' }); }, 'INVALID_SCORE');
    });
    throwsCode(function () { transition('normal', 0); }, 'ROUND_TOKEN_REQUIRED');
    throwsCode(function () { compose([], [], 'free', { playSetSize: 0 }); }, 'INVALID_PLAY_SET_SIZE');
    throwsCode(function () { compose([], [], 'free', { playSetSize: 2.5 }); }, 'INVALID_PLAY_SET_SIZE');
    throwsCode(function () { compose([], [], 'free', { playSetSize: '10' }); }, 'INVALID_PLAY_SET_SIZE');
    throwsCode(function () {
      contract.normalizeActiveState(active('review_needed', { dueOn: '2026-08-28', reviewAttemptsUsed: '0' }));
    }, 'MALFORMED_ACTIVE_STATE');
    throwsCode(function () {
      compose([active('review_needed', { dueOn: '2026-08-28', reviewAttemptsUsed: 1 })], [], 'free');
    }, 'REVIEW_ATTEMPT_EXHAUSTED');
    throwsCode(function () {
      compose([active('review_needed', { dueOn: '2026-08-28', reviewAttemptsUsed: 3 })], [], 'paid');
    }, 'REVIEW_ATTEMPT_EXHAUSTED');
    throwsCode(function () {
      compose([active('srs')], [srsDue(), srsDue()], 'free');
    }, 'DUPLICATE_SRS_DUE_SNAPSHOT');
  });

  check('SRS Due requires SRS active state and Mastered stays out', function () {
    var duePlan = compose([active('srs')], [srsDue()], 'free');
    assert.strictEqual(duePlan.groups.srsDue.length, 1);
    var mastered = compose([active('srs')], [srsDue({ mastered: true })], 'free');
    assert.strictEqual(mastered.groups.srsDue.length, 0);
    throwsCode(function () {
      compose([active('review_needed', { dueOn: '2026-08-28', reviewAttemptsUsed: 0 })], [srsDue()], 'free');
    }, 'SRS_DUE_STATE_CONFLICT');
  });

  check('Day 0/1/8 plus empty/loading/error/access-denied fixtures remain usable', function () {
    var day0 = compose(fixtures.day0.activeStates, fixtures.day0.srsDueSnapshot, 'free', {
      today: fixtures.day0.today, playSetSize: fixtures.day0.playSetSize
    });
    var day1 = compose(fixtures.day1.activeStates, fixtures.day1.srsDueSnapshot, 'free', {
      today: fixtures.day1.today, playSetSize: fixtures.day1.playSetSize
    });
    var day8 = compose(fixtures.day8.activeStates, fixtures.day8.srsDueSnapshot, 'free', {
      today: fixtures.day8.today, playSetSize: fixtures.day8.playSetSize
    });
    assert.strictEqual(day0.totals.activeStates, 0);
    assert.deepStrictEqual([day1.totals.reviewSelected, day1.totals.reviewCarryForward, day1.totals.notDue], [2, 2, 1]);
    assert.deepStrictEqual([day8.groups.nextDayPriority.length, day8.groups.weakDue.length, day8.groups.srsDue.length], [1, 1, 1]);
    ['loading', 'empty', 'error', 'access-denied'].forEach(function (status) {
      assert.strictEqual(contract.viewState(status).status, status);
    });
  });

  check('adapter is schema-neutral, allowlisted, and preserves only attempt status', function () {
    var mapping = adapter.getInputContract();
    assert.strictEqual(mapping.mode, 'normalized-read-only');
    assert.strictEqual(mapping.storageBinding, null);
    assert.ok(mapping.activeStateFields.indexOf('reviewAttemptsUsed') >= 0);
    ['reviewAttemptMax', 'reviewAllocationRate', 'weakPercent', 'table', 'rpc'].forEach(function (field) {
      assert.strictEqual(mapping.activeStateFields.indexOf(field), -1);
    });
    var mapped = adapter.adapt({
      activeStates: [Object.assign({ privateNote: 'drop-me', email: 'drop-me' }, active('review_needed', {
        dueOn: '2026-08-28', reviewAttemptsUsed: 0
      }))],
      srsDueSnapshot: [Object.assign({ privateNote: 'drop-me' }, srsDue())]
    });
    assert.strictEqual(mapped.activeStates[0].reviewAttemptsUsed, 0);
    assert.strictEqual(mapped.activeStates[0].privateNote, undefined);
    assert.strictEqual(mapped.activeStates[0].email, undefined);
    assert.strictEqual(mapped.srsDueSnapshot[0].privateNote, undefined);
    var canonical = adapter.mapCanonicalSrsState(Object.assign({ privateNote: 'drop-me' }, fixtures.existingSrs));
    assert.strictEqual(canonical.privateNote, undefined);
    throwsCode(function () { adapter.adapt({ activeStates: [] }); }, 'NORMALIZED_INPUT_INVALID');
  });

  check('adapter classifies access failures without a storage fallback', function () {
    assert.strictEqual(adapter.classifyError({ status: 403 }), 'access-denied');
    assert.strictEqual(adapter.classifyError({ code: 'ACCESS_DENIED' }), 'access-denied');
    assert.strictEqual(adapter.classifyError(new Error('read failed')), 'error');
  });

  check('developer preview is noindex, hidden, localhost-only, and explicit-enable only', function () {
    var html = fs.readFileSync(path.join(root, 'dev/review-needed-hidden-preview.html'), 'utf8');
    var script = fs.readFileSync(path.join(root, 'dev/review-needed-hidden-preview.js'), 'utf8');
    assert.ok(/name="robots" content="noindex,nofollow,noarchive"/.test(html));
    assert.ok(/id="review-needed-preview" hidden aria-hidden="true"/.test(html));
    assert.ok(/role="status" aria-live="polite"/.test(html));
    assert.ok(/localhost\|127\\\.0\\\.0\\\.1/.test(script));
    assert.ok(/params\.get\('review-needed-preview'\) === '1'/.test(script));
    assert.ok(/if \(!local \|\| !enabled\) return;/.test(script));
    assert.ok(/params\.get\('tier'\) === 'paid'/.test(script));
    assert.ok(/Review allocation/.test(script) && /carry-forward/.test(script));
    assert.ok(/output\.setAttribute\('tabindex', '0'\)/.test(script));
    assert.strictEqual(html.indexOf('<form'), -1);
  });

  check('public HTML, navigation, sitemap, robots, and service worker have no entry', function () {
    var needles = ['review-needed-hidden-preview', 'review-needed-candidate.js', 'review-needed-read-adapter.js'];
    publicHtmlFiles(root).forEach(function (file) {
      var source = fs.readFileSync(file, 'utf8');
      needles.forEach(function (needle) { assert.strictEqual(source.indexOf(needle), -1, path.relative(root, file)); });
    });
    ['sitemap.xml', 'robots.txt', 'data/nav-template.js', 'js/core/shared.js', 'js/core/shared.min.js'].forEach(function (file) {
      if (!fs.existsSync(path.join(root, file))) return;
      var source = fs.readFileSync(path.join(root, file), 'utf8');
      needles.forEach(function (needle) { assert.strictEqual(source.indexOf(needle), -1, file); });
    });
    fs.readdirSync(root).filter(function (file) { return /service[-_]?worker|^sw\.js$/i.test(file); }).forEach(function (file) {
      var source = fs.readFileSync(path.join(root, file), 'utf8');
      needles.forEach(function (needle) { assert.strictEqual(source.indexOf(needle), -1, file); });
    });
  });

  check('candidate is pure/read-only with no network/Supabase mutation or weakness percentage', function () {
    var sources = [
      fs.readFileSync(path.join(root, 'js/review-needed/review-needed-candidate.js'), 'utf8'),
      fs.readFileSync(path.join(root, 'js/review-needed/review-needed-read-adapter.js'), 'utf8'),
      fs.readFileSync(path.join(root, 'dev/review-needed-hidden-preview.js'), 'utf8')
    ].join('\n');
    ['.insert(', '.update(', '.upsert(', '.delete(', '.rpc(', 'localStorage', 'sessionStorage', 'fetch(',
      'XMLHttpRequest', 'sendBeacon', 'WebSocket', 'EventSource', 'tone_srs_state', 'supabase', 'weakPercent']
      .forEach(function (needle) { assert.strictEqual(sources.indexOf(needle), -1, needle); });
    assert.strictEqual(/Day\s*[35]|auto-?save/i.test(sources), false);
    var source = active('review_needed', { dueOn: '2026-08-28', reviewAttemptsUsed: 0 });
    var resultEvidence = evidence(10, { srsStateStatus: 'absent' });
    var sourceBefore = JSON.parse(JSON.stringify(source));
    var evidenceBefore = JSON.parse(JSON.stringify(resultEvidence));
    assert.strictEqual(contract.buildTransitionDirective(source, resultEvidence, { tier: 'free' }).savedWord, 'manual-only');
    assert.deepStrictEqual(source, sourceBefore);
    assert.deepStrictEqual(resultEvidence, evidenceBefore);
    var options = { today: '2026-08-28', playSetSize: 10 };
    contract.createCandidate({ enabled: true, tier: 'free' })
      .composeQueuePlan({ activeStates: [], srsDueSnapshot: [] }, options);
    assert.deepStrictEqual(options, { today: '2026-08-28', playSetSize: 10 });
  });

  process.stdout.write('REVIEW_NEEDED_HIDDEN_CANDIDATE_PASS ' + passes + '\n');
} catch (error) {
  console.error(error && error.stack || error);
  process.exit(1);
}
