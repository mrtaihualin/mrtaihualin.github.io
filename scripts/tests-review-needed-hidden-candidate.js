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

function transition(state, score, stateOverrides, evidenceOverrides) {
  var input = evidence(score, evidenceOverrides);
  var targetNeedsSrs = score === 10 && state !== 'retry_end_round';
  if (targetNeedsSrs && input.srsStateStatus == null) input.srsStateStatus = 'absent';
  return contract.buildTransitionDirective(active(state, stateOverrides), input);
}

function srsDue(overrides) {
  return Object.assign({
    sourceType: 'srs_due_snapshot', ownerKey: 'fixture-owner', game: 'tone', level: '1',
    itemId: 'fixture-item', due: true, mastered: false
  }, overrides || {});
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
  check('feature defaults OFF and Paid remains dormant without an attempt-limit contract', function () {
    assert.strictEqual(contract.FEATURE_DEFAULT_ENABLED, false);
    throwsCode(function () { contract.createCandidate({ tier: 'free' }); }, 'FEATURE_DISABLED');
    throwsCode(function () { contract.createCandidate({ enabled: true, tier: 'paid' }); }, 'TIER_DISABLED');
    assert.deepStrictEqual(contract.getTierConfig('free'), { id: 'free', runtimeEnabled: true });
    assert.deepStrictEqual(contract.getTierConfig('paid'), { id: 'paid', runtimeEnabled: false });
    assert.strictEqual(JSON.stringify(contract.getTierConfig('paid')).indexOf('Attempts'), -1);
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

  check('one active state per identity is enforced before queue composition', function () {
    throwsCode(function () {
      contract.normalizeStateSet([active('normal'), active('weak_4d', { dueOn: '2026-09-01' })]);
    }, 'DUPLICATE_ACTIVE_STATE');
    assert.strictEqual(contract.normalizeStateSet([
      active('normal'), active('normal', { ownerKey: 'other-owner' })
    ]).length, 2);
  });

  check('Normal transitions use exact 0-3, 4-9, and 10 bands', function () {
    [[0, 'retry_end_round'], [3, 'retry_end_round'], [4, 'weak_4d'], [9, 'weak_4d'], [10, 'srs']]
      .forEach(function (entry, index) {
        var directive = transition('normal', entry[0], null, {
          actionToken: 'normal-' + index, roundToken: entry[1] === 'retry_end_round' ? 'round-normal' : undefined
        });
        assert.strictEqual(directive.toState, entry[1]);
        if (entry[1] === 'weak_4d') assert.strictEqual(directive.dueOn, '2026-09-01');
        if (entry[1] === 'retry_end_round') assert.strictEqual(directive.nextActiveState.retryOrdinal, 1);
      });
  });

  check('RETRY_END_ROUND transitions once to next-day queues at exact +1', function () {
    [[0, 'review_needed'], [3, 'review_needed'], [4, 'review_needed'], [9, 'review_needed'], [10, 'next_day_check']]
      .forEach(function (entry, index) {
        var directive = transition('retry_end_round', entry[0], null, { actionToken: 'retry-' + index });
        assert.strictEqual(directive.toState, entry[1]);
        assert.strictEqual(directive.dueOn, '2026-08-29');
        assert.strictEqual(directive.queueGroup, 'next-day-priority-group');
      });
  });

  check('NEXT_DAY_CHECK transitions to Review +1, Weak +4, or SRS stage-0 owner route', function () {
    var state = { dueOn: '2026-08-28' };
    assert.strictEqual(transition('next_day_check', 0, state).dueOn, '2026-08-29');
    assert.strictEqual(transition('next_day_check', 3, state).toState, 'review_needed');
    assert.strictEqual(transition('next_day_check', 4, state).dueOn, '2026-09-01');
    assert.strictEqual(transition('next_day_check', 9, state).toState, 'weak_4d');
    var correct = transition('next_day_check', 10, state);
    assert.strictEqual(correct.toState, 'srs');
    assert.strictEqual(correct.srsOwnerDirective.derivedStage, 0);
    assert.strictEqual(correct.srsOwnerDirective.day1Passed, false);
  });

  check('REVIEW_NEEDED transitions to Review +1, Weak +4, or SRS stage-0 owner route', function () {
    var state = { dueOn: '2026-08-28' };
    assert.strictEqual(transition('review_needed', 0, state).dueOn, '2026-08-29');
    assert.strictEqual(transition('review_needed', 3, state).toState, 'review_needed');
    assert.strictEqual(transition('review_needed', 4, state).dueOn, '2026-09-01');
    assert.strictEqual(transition('review_needed', 9, state).toState, 'weak_4d');
    var correct = transition('review_needed', 10, state);
    assert.strictEqual(correct.toState, 'srs');
    assert.strictEqual(correct.srsOwnerDirective.action, 'request-canonical-initial-route');
  });

  check('WEAK_4D transitions to retry, repeats exact +4, or enters SRS stage 0', function () {
    var state = { dueOn: '2026-08-28' };
    assert.strictEqual(transition('weak_4d', 0, state, { roundToken: 'weak-round' }).toState, 'retry_end_round');
    assert.strictEqual(transition('weak_4d', 3, state, { roundToken: 'weak-round' }).nextActiveState.retryOrdinal, 1);
    assert.strictEqual(transition('weak_4d', 4, state).dueOn, '2026-09-01');
    assert.strictEqual(transition('weak_4d', 9, state).toState, 'weak_4d');
    assert.strictEqual(transition('weak_4d', 10, state).srsOwnerDirective.derivedStage, 0);
  });

  check('calendar scheduling is exact across month, year, and leap boundaries', function () {
    assert.strictEqual(contract.addCalendarDays('2026-08-31', 1), '2026-09-01');
    assert.strictEqual(contract.addCalendarDays('2026-12-31', 1), '2027-01-01');
    assert.strictEqual(contract.addCalendarDays('2028-02-28', 1), '2028-02-29');
    assert.strictEqual(contract.addCalendarDays('2028-02-28', 4), '2028-03-03');
  });

  check('next-day items are a front priority group, never literal question-one assignments', function () {
    var plan = contract.composeQueuePlan({
      activeStates: [
        active('next_day_check', { itemId: 'next-a', dueOn: '2026-08-28' }),
        active('review_needed', { itemId: 'review-b', dueOn: '2026-08-28' }),
        active('normal', { itemId: 'normal-c' })
      ], srsDueSnapshot: []
    }, { today: '2026-08-28' });
    assert.strictEqual(plan.groups.nextDayPriority.length, 2);
    assert.strictEqual(plan.priorityContract.nextDayItemsAreFrontGroup, true);
    assert.strictEqual(plan.priorityContract.everyNextDayItemIsLiteralQuestionOne, false);
    plan.groups.nextDayPriority.forEach(function (row) { assert.strictEqual(row.absoluteQuestionPosition, null); });
    assert.strictEqual(plan.absoluteQuestionOrder, null);
  });

  check('SRS Due belongs only to an SRS active state and Mastered is excluded', function () {
    var srsState = active('srs');
    var duePlan = contract.composeQueuePlan({ activeStates: [srsState], srsDueSnapshot: [srsDue()] }, { today: '2026-08-28' });
    assert.strictEqual(duePlan.groups.srsDue.length, 1);
    var mastered = contract.composeQueuePlan({
      activeStates: [srsState], srsDueSnapshot: [srsDue({ mastered: true })]
    }, { today: '2026-08-28' });
    assert.strictEqual(mastered.groups.srsDue.length, 0);
    throwsCode(function () {
      contract.composeQueuePlan({ activeStates: [active('review_needed', { dueOn: '2026-08-28' })], srsDueSnapshot: [srsDue()] }, { today: '2026-08-28' });
    }, 'SRS_DUE_STATE_CONFLICT');
  });

  check('SRS boundary emits an owner directive only and cannot backflow', function () {
    var source = active('review_needed', { dueOn: '2026-08-28' });
    var resultEvidence = evidence(10, { srsStateStatus: 'absent' });
    var sourceBefore = JSON.parse(JSON.stringify(source));
    var evidenceBefore = JSON.parse(JSON.stringify(resultEvidence));
    var directive = contract.buildTransitionDirective(source, resultEvidence);
    assert.strictEqual(directive.candidateMutatesSrs, false);
    assert.strictEqual(directive.candidateMutatesStorage, false);
    assert.strictEqual(directive.srsOwnerDirective.firstCheckpoint, 'resolve-by-current-srs-authority');
    assert.strictEqual(Object.prototype.hasOwnProperty.call(directive.srsOwnerDirective, 'dueDate'), false);
    assert.deepStrictEqual(source, sourceBefore);
    assert.deepStrictEqual(resultEvidence, evidenceBefore);
    throwsCode(function () {
      contract.buildTransitionDirective(active('srs'), evidence(0, { roundToken: 'no-backflow' }));
    }, 'SRS_OWNER_ONLY');
  });

  check('existing canonical SRS state is reused deterministically without duplicate creation', function () {
    var directive = transition('review_needed', 10, { dueOn: '2026-08-28' }, {
      srsStateStatus: 'present', existingSrsState: fixtures.existingSrs
    });
    assert.strictEqual(directive.srsOwnerDirective.action, 'reuse-existing-canonical-state');
    assert.strictEqual(directive.nextActiveState.stateToken, 'canonical-srs-existing');
    assert.strictEqual(directive.srsOwnerDirective.state.stage, 2);
    assert.strictEqual(directive.srsOwnerDirective.state.dueDate, '2026-09-03');
    throwsCode(function () {
      transition('review_needed', 10, { dueOn: '2026-08-28' }, { srsStateStatus: 'unknown' });
    }, 'SRS_STATE_PRESENCE_REQUIRED');
  });

  check('atomic simulation is idempotent and rejects a concurrent stale-state loser', function () {
    var source = active('normal');
    var low = transition('normal', 0, null, { actionToken: 'race-low', roundToken: 'race-round' });
    var correct = transition('normal', 10, null, { actionToken: 'race-correct' });
    var repeated = contract.applyDirectives([source], [low, low]);
    assert.deepStrictEqual([repeated.applied, repeated.duplicateIgnored, repeated.raceRejected], [1, 1, 0]);
    assert.strictEqual(repeated.activeStates.length, 1);
    var race = contract.applyDirectives([source], [low, correct]);
    assert.deepStrictEqual([race.applied, race.raceRejected], [1, 1]);
    assert.strictEqual(race.activeStates.length, 1);
    assert.strictEqual(race.activeStates[0].state, 'retry_end_round');
  });

  check('same idempotency token cannot describe another transition', function () {
    var first = transition('normal', 0, null, { actionToken: 'same-token', roundToken: 'round-one' });
    var conflicting = transition('normal', 4, null, { actionToken: 'same-token' });
    throwsCode(function () { contract.applyDirectives([active('normal')], [first, conflicting]); }, 'IDEMPOTENCY_CONFLICT');
  });

  check('same item stays isolated across owners and all five games', function () {
    var states = contract.GAME_IDS.map(function (game) {
      return active('review_needed', { game: game, itemId: 'same-item', dueOn: '2026-08-28', stateToken: 'state-' + game });
    }).concat([active('review_needed', {
      ownerKey: 'other-owner', game: 'tone', itemId: 'same-item', dueOn: '2026-08-28', stateToken: 'other-state'
    })]);
    var plan = contract.composeQueuePlan({ activeStates: states, srsDueSnapshot: [] }, { today: '2026-08-28' });
    assert.strictEqual(plan.groups.nextDayPriority.length, 6);
    assert.strictEqual(new Set(plan.groups.nextDayPriority.map(function (row) { return row.identityKey; })).size, 6);
  });

  check('malformed, unknown, duplicate, and invalid date/score inputs fail closed', function () {
    throwsCode(function () { contract.normalizeActiveState(active('unknown')); }, 'UNKNOWN_ACTIVE_STATE');
    throwsCode(function () { contract.normalizeActiveState(active('review_needed')); }, 'MALFORMED_ACTIVE_STATE');
    throwsCode(function () { contract.normalizeActiveState(active('normal', { ownerKey: '' })); }, 'MALFORMED_ACTIVE_STATE');
    throwsCode(function () { contract.normalizeActiveState(active('weak_4d', { dueOn: '2026-02-30' })); }, 'MALFORMED_ACTIVE_STATE');
    [-1, 11, 4.5, '10', null].forEach(function (score) {
      throwsCode(function () { transition('normal', score, null, { roundToken: 'bad-score' }); }, 'INVALID_SCORE');
    });
    throwsCode(function () { transition('normal', 0); }, 'ROUND_TOKEN_REQUIRED');
    throwsCode(function () {
      contract.composeQueuePlan({ activeStates: [active('srs')], srsDueSnapshot: [srsDue(), srsDue()] }, { today: '2026-08-28' });
    }, 'DUPLICATE_SRS_DUE_SNAPSHOT');
  });

  check('Day 0/1/8 plus empty/loading/error/access-denied fixtures are usable', function () {
    var day0 = contract.composeQueuePlan(fixtures.day0, { today: fixtures.day0.today });
    var day1 = contract.composeQueuePlan(fixtures.day1, { today: fixtures.day1.today });
    var day8 = contract.composeQueuePlan(fixtures.day8, { today: fixtures.day8.today });
    assert.strictEqual(day0.totals.activeStates, 0);
    assert.deepStrictEqual(day1.groups.nextDayPriority.map(function (row) { return row.state; }).sort(), ['next_day_check', 'review_needed']);
    assert.strictEqual(day1.totals.notDue, 1);
    assert.deepStrictEqual([day8.groups.nextDayPriority.length, day8.groups.weakDue.length, day8.groups.srsDue.length], [1, 1, 1]);
    ['loading', 'empty', 'error', 'access-denied'].forEach(function (status) {
      assert.strictEqual(contract.viewState(status).status, status);
    });
  });

  check('adapter is schema-neutral, allowlisted, and drops unowned fields', function () {
    var mapping = adapter.getInputContract();
    assert.strictEqual(mapping.mode, 'normalized-read-only');
    assert.strictEqual(mapping.storageBinding, null);
    ['attemptsUsed', 'maxReviewAttempts', 'weakPercent', 'table', 'rpc'].forEach(function (field) {
      assert.strictEqual(mapping.activeStateFields.indexOf(field), -1);
    });
    var mapped = adapter.adapt({
      activeStates: [Object.assign({ privateNote: 'drop-me', email: 'drop-me' }, active('normal'))],
      srsDueSnapshot: [Object.assign({ privateNote: 'drop-me' }, srsDue())]
    });
    assert.strictEqual(mapped.activeStates[0].privateNote, undefined);
    assert.strictEqual(mapped.activeStates[0].email, undefined);
    assert.strictEqual(mapped.srsDueSnapshot[0].privateNote, undefined);
    var canonical = adapter.mapCanonicalSrsState(Object.assign({ privateNote: 'drop-me' }, fixtures.existingSrs));
    assert.strictEqual(canonical.privateNote, undefined);
    assert.strictEqual(canonical.stateToken, 'canonical-srs-existing');
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
    assert.ok(/<caption>/.test(script) && /scope=\\?"col\\?"/.test(script));
    assert.ok(/localhost\|127\\\.0\\\.0\\\.1/.test(script));
    assert.ok(/params\.get\('review-needed-preview'\) === '1'/.test(script));
    assert.ok(/if \(!local \|\| !enabled\) return;/.test(script));
    assert.ok(/output\.setAttribute\('tabindex', '0'\)/.test(script));
    assert.ok(/#preview-output:focus/.test(html));
    assert.ok(/does not define final question placement/.test(script));
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

  check('candidate exposes no storage/network/Supabase mutation or invented weakness percentage', function () {
    var sources = [
      fs.readFileSync(path.join(root, 'js/review-needed/review-needed-candidate.js'), 'utf8'),
      fs.readFileSync(path.join(root, 'js/review-needed/review-needed-read-adapter.js'), 'utf8'),
      fs.readFileSync(path.join(root, 'dev/review-needed-hidden-preview.js'), 'utf8')
    ].join('\n');
    ['.insert(', '.update(', '.upsert(', '.delete(', '.rpc(', 'localStorage', 'sessionStorage', 'fetch(',
      'XMLHttpRequest', 'sendBeacon', 'WebSocket', 'EventSource', 'tone_srs_state', 'supabase', 'maxReviewAttempts',
      'weakPercent'].forEach(function (needle) { assert.strictEqual(sources.indexOf(needle), -1, needle); });
    assert.strictEqual(/Day\s*[35]|auto-?save/i.test(sources), false);
    assert.strictEqual(contract.buildTransitionDirective(active('normal'), evidence(4)).savedWord, 'manual-only');
    var options = { today: '2026-08-28' };
    var candidate = contract.createCandidate({ enabled: true, tier: 'free' });
    candidate.composeQueuePlan({ activeStates: [], srsDueSnapshot: [] }, options);
    assert.deepStrictEqual(options, { today: '2026-08-28' });
  });

  process.stdout.write('REVIEW_NEEDED_HIDDEN_CANDIDATE_PASS ' + passes + '\n');
} catch (error) {
  console.error(error && error.stack || error);
  process.exit(1);
}
