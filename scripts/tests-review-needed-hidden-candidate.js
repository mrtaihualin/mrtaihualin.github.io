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

function review(overrides) {
  return Object.assign({
    sourceType: 'review_queue_item', game: 'tone', level: '1', itemId: 'item-a',
    attemptsUsed: 0, resolved: false, actionToken: 'action-a'
  }, overrides || {});
}

function srs(overrides) {
  return Object.assign({
    sourceType: 'srs_due_snapshot', game: 'tone', level: '1', itemId: 'item-a',
    due: true, mastered: false
  }, overrides || {});
}

function compose(reviewQueueItems, srsDueSnapshot, options) {
  return contract.composeQueue({
    reviewQueueItems: reviewQueueItems || [], srsDueSnapshot: srsDueSnapshot || []
  }, Object.assign({ tier: 'free' }, options || {}));
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
  check('feature flag defaults OFF and dormant Paid cannot activate', function () {
    assert.strictEqual(contract.FEATURE_DEFAULT_ENABLED, false);
    throwsCode(function () { contract.createCandidate({ tier: 'free' }); }, 'FEATURE_DISABLED');
    throwsCode(function () { contract.createCandidate({ enabled: true, tier: 'paid' }); }, 'TIER_DISABLED');
  });

  check('five games and game + level + item identity stay explicit', function () {
    assert.deepStrictEqual(contract.GAME_IDS, ['tone', 'reading', 'listening', 'typing', 'wordorder']);
    assert.strictEqual(contract.normalizeGame('word_order'), 'wordorder');
    assert.strictEqual(contract.normalizeGame('challenge'), null);
    var one = compose([review()], []);
    assert.strictEqual(one.queue[0].identityKey, 'tone\u00001\u0000item-a');
  });

  check('Review trigger stays outside the candidate; only valid upstream queue items are accepted', function () {
    var day0 = contract.composeQueue({
      reviewQueueItems: fixtures.day0.reviewQueueItems, srsDueSnapshot: []
    }, { tier: 'free' });
    var day1 = contract.composeQueue({
      reviewQueueItems: fixtures.day1.reviewQueueItems, srsDueSnapshot: []
    }, { tier: 'free' });
    assert.strictEqual(day0.totals.reviewNeeded, 0);
    assert.strictEqual(day1.totals.reviewNeeded, 5);
    throwsCode(function () {
      compose([Object.assign({}, review(), { sourceType: 'review_incorrect_evidence' })], []);
    }, 'UNKNOWN_REVIEW_SOURCE');
    assert.strictEqual(contract.normalizeReviewEvidence, undefined);
  });

  check('resolved upstream queue items never re-enter Review Needed', function () {
    var result = compose([review({ resolved: true })], []);
    assert.strictEqual(result.queue.length, 0);
    assert.deepStrictEqual(result.ignored.review, { resolved: 1, attemptLimit: 0 });
  });

  check('Free attempt 0 opens and attempt 1 exits the flow', function () {
    var open = compose([review({ attemptsUsed: 0 })], []);
    var closed = compose([review({ attemptsUsed: 1 })], []);
    assert.strictEqual(open.queue[0].attemptsRemaining, 1);
    assert.strictEqual(closed.queue.length, 0);
    assert.strictEqual(closed.ignored.review.attemptLimit, 1);
    assert.deepStrictEqual(contract.getTierConfig('free'), {
      id: 'free', maxReviewAttempts: 1, runtimeEnabled: true
    });
  });

  check('dormant Paid permits at most 4 attempts without a day or delay rule', function () {
    assert.deepStrictEqual(contract.getTierConfig('paid'), {
      id: 'paid', maxReviewAttempts: 4, runtimeEnabled: false
    });
    var open = compose([review({ attemptsUsed: 3 })], [], { tier: 'paid', allowDormantTier: true });
    var closed = compose([review({ attemptsUsed: 4 })], [], { tier: 'paid', allowDormantTier: true });
    assert.strictEqual(open.queue[0].attemptsRemaining, 1);
    assert.strictEqual(closed.queue.length, 0);
    assert.deepStrictEqual(Object.keys(open.config).sort(), ['id', 'maxReviewAttempts', 'runtimeEnabled']);
    assert.strictEqual(Object.keys(open.queue[0]).some(function (key) {
      return /delay|reschedule|nextAttempt|attemptDate/i.test(key);
    }), false);
  });

  check('same Review + Due identity appears once as Review before remaining Due', function () {
    var result = compose([review()], [srs(), srs({ itemId: 'item-b' })]);
    assert.deepStrictEqual(result.queue.map(function (item) { return item.sourceType; }), [
      'review_needed', 'srs_due'
    ]);
    assert.deepStrictEqual(result.queue.map(function (item) { return item.itemId; }), ['item-a', 'item-b']);
    assert.strictEqual(result.queue[0].alsoSrsDue, true);
    assert.strictEqual(result.totals.deduplicatedReviewAndDue, 1);
    assert.strictEqual(result.queue.filter(function (item) { return item.identityKey === result.queue[0].identityKey; }).length, 1);
    assert.deepStrictEqual(result.queue.map(function (item) { return item.actionToken; }), ['action-a', null]);
  });

  check('one item routes one result to Review and SRS owner only when actually due', function () {
    var overlap = compose([review()], [srs()]).queue[0];
    var reviewOnly = compose([review()], []).queue[0];
    assert.deepStrictEqual(overlap.resultRouting, {
      reviewResolution: true,
      srsOwnerEvaluationIfDue: true,
      srsInitialEntryOnReviewCorrect: 'canonical-owner-route',
      candidateMutatesSrs: false,
      savedWord: 'manual-only'
    });
    assert.strictEqual(reviewOnly.resultRouting.srsOwnerEvaluationIfDue, false);
    assert.strictEqual(contract.advance, undefined);
  });

  check('correct Review closes the wrong queue and requests canonical derived stage 0 only', function () {
    var queueItem = contract.composeQueue({
      reviewQueueItems: fixtures.day1.reviewQueueItems,
      srsDueSnapshot: []
    }, { tier: 'free' }).games.tone.queue[0];
    var before = JSON.parse(JSON.stringify(queueItem));
    var directive = contract.buildReviewResolutionDirective(
      queueItem, fixtures.reviewCorrectToInitialSrs.result
    );
    assert.strictEqual(directive.reviewQueue, 'close');
    assert.strictEqual(directive.srsAction, 'request-canonical-initial-route');
    assert.strictEqual(directive.srsInitialRoute.derivedStage, 0);
    assert.strictEqual(directive.srsInitialRoute.day1Passed, false);
    assert.strictEqual(directive.srsInitialRoute.firstCheckpoint, 'resolve-by-current-srs-authority');
    assert.strictEqual(directive.srsInitialRoute.duplicateSrsCreationAllowed, false);
    assert.strictEqual(Object.prototype.hasOwnProperty.call(directive.srsInitialRoute, 'dueDate'), false);
    assert.strictEqual(directive.candidateMutatesSrs, false);
    assert.deepStrictEqual(queueItem, before);
    assert.deepStrictEqual(
      contract.buildReviewResolutionDirective(queueItem, fixtures.reviewCorrectToInitialSrs.result),
      directive,
      'same action token must produce the same deterministic directive'
    );
  });

  check('correct Review reuses an existing canonical SRS state without stage/due change or duplicate creation', function () {
    var queueItem = contract.composeQueue({
      reviewQueueItems: fixtures.day1.reviewQueueItems,
      srsDueSnapshot: fixtures.day1.srsDueSnapshot
    }, { tier: 'free' }).games.tone.queue[0];
    var existing = JSON.parse(JSON.stringify(fixtures.reviewCorrectExistingSrs.result.existingSrsState));
    var directive = contract.buildReviewResolutionDirective(
      queueItem, fixtures.reviewCorrectExistingSrs.result
    );
    assert.strictEqual(directive.reviewQueue, 'close');
    assert.strictEqual(directive.srsAction, 'reuse-existing-canonical-state');
    assert.strictEqual(directive.srsInitialRoute, null);
    assert.strictEqual(directive.existingSrsState.stage, 2);
    assert.strictEqual(directive.existingSrsState.dueDate, '2026-09-03');
    assert.deepStrictEqual(fixtures.reviewCorrectExistingSrs.result.existingSrsState, existing);
    throwsCode(function () {
      contract.buildReviewResolutionDirective(queueItem, { outcome: 'correct', srsStateStatus: 'absent' });
    }, 'CONFLICTING_SRS_STATE_STATUS');
  });

  check('unknown or mismatched SRS presence fails closed; incorrect Review does not start SRS', function () {
    var item = compose([review()], []).queue[0];
    throwsCode(function () {
      contract.buildReviewResolutionDirective(item, { outcome: 'correct', srsStateStatus: 'unknown' });
    }, 'SRS_STATE_PRESENCE_REQUIRED');
    throwsCode(function () {
      contract.buildReviewResolutionDirective(item, {
        outcome: 'correct', srsStateStatus: 'absent',
        existingSrsState: { sourceType: 'canonical_srs_state' }
      });
    }, 'CONFLICTING_SRS_STATE_STATUS');
    throwsCode(function () {
      contract.buildReviewResolutionDirective(item, {
        outcome: 'correct', srsStateStatus: 'present',
        existingSrsState: {
          sourceType: 'canonical_srs_state', game: 'reading', level: '1', itemId: 'item-a',
          stage: 0, dueDate: '', mastered: false
        }
      });
    }, 'SRS_IDENTITY_MISMATCH');
    throwsCode(function () {
      contract.buildReviewResolutionDirective(item, {
        outcome: 'correct', srsStateStatus: 'present',
        existingSrsState: {
          sourceType: 'canonical_srs_state', game: 'tone', level: '1', itemId: 'item-a',
          stage: 0, dueDate: '2026-99-99', mastered: false
        }
      });
    }, 'MALFORMED_CANONICAL_SRS_STATE');
    var incorrect = contract.buildReviewResolutionDirective(item, { outcome: 'incorrect' });
    assert.strictEqual(incorrect.reviewQueue, 'attempt-consumed');
    assert.strictEqual(incorrect.srsAction, 'none');
  });

  check('same level/item remains isolated across all five games', function () {
    var reviews = contract.GAME_IDS.map(function (game, index) {
      return review({ game: game, itemId: 'same', actionToken: 'action-' + index });
    });
    var dues = contract.GAME_IDS.map(function (game) { return srs({ game: game, itemId: 'same' }); });
    var result = compose(reviews, dues);
    assert.strictEqual(result.queue.length, 5);
    contract.GAME_IDS.forEach(function (game) {
      assert.strictEqual(result.games[game].queue.length, 1);
      assert.strictEqual(result.games[game].queue[0].game, game);
      assert.strictEqual(result.games[game].queue[0].alsoSrsDue, true);
    });
  });

  check('malformed, unknown, duplicate, and invalid-date inputs fail closed', function () {
    throwsCode(function () { compose({}, []); }, 'INVALID_REVIEW_INPUT');
    throwsCode(function () { compose([], {}); }, 'INVALID_SRS_INPUT');
    throwsCode(function () { compose([review({ game: 'unknown' })], []); }, 'UNKNOWN_GAME');
    throwsCode(function () { compose([review({ sourceType: 'raw_attempt' })], []); }, 'UNKNOWN_REVIEW_SOURCE');
    throwsCode(function () { compose([review(), review({ itemId: 'item-b' })], []); }, 'DUPLICATE_ACTION_TOKEN');
    throwsCode(function () { compose([review(), review({ actionToken: 'action-b' })], []); }, 'DUPLICATE_REVIEW_IDENTITY');
    throwsCode(function () { compose([], [srs(), srs()]); }, 'DUPLICATE_SRS_IDENTITY');
    throwsCode(function () { compose([], [srs({ due: 'yes' })]); }, 'MALFORMED_SRS_SNAPSHOT');
  });

  check('Mastered never enters the SRS Due queue', function () {
    var result = compose([], [srs({ itemId: 'mastered', mastered: true }), srs({ itemId: 'active' })]);
    assert.deepStrictEqual(result.queue.map(function (item) { return item.itemId; }), ['active']);
    assert.strictEqual(result.ignored.srs.mastered, 1);
  });

  check('Day 0, Day 1, Day 8 and empty/loading/error/access-denied fixtures remain available', function () {
    var day8 = contract.composeQueue({
      reviewQueueItems: fixtures.day8.reviewQueueItems,
      srsDueSnapshot: fixtures.day8.srsDueSnapshot
    }, { tier: 'free' });
    assert.strictEqual(day8.totals.reviewNeeded, 5);
    assert.strictEqual(day8.totals.srsDueOnly, 5);
    assert.strictEqual(day8.ignored.srs.mastered, 5);
    assert.deepStrictEqual(
      [fixtures.day0.status, fixtures.day1.status, fixtures.day8.status, fixtures.empty.status,
        fixtures.loading.status, fixtures.error.status, fixtures.accessDenied.status],
      ['ready', 'ready', 'ready', 'empty', 'loading', 'error', 'access-denied']
    );
    ['loading', 'empty', 'error', 'access-denied'].forEach(function (status) {
      assert.strictEqual(contract.viewState(status).status, status);
    });
  });

  check('adapter is schema-neutral, allowlisted, and contains no Review trigger fields', function () {
    var mapping = adapter.getInputContract();
    assert.strictEqual(mapping.mode, 'normalized-read-only');
    assert.strictEqual(mapping.storageBinding, null);
    assert.strictEqual(mapping.reviewQueueItemFields.indexOf('eligibleOn'), -1);
    assert.strictEqual(mapping.reviewQueueItemFields.indexOf('occurredDate'), -1);
    assert.strictEqual(mapping.reviewQueueItemFields.indexOf('outcome'), -1);
    assert.strictEqual(mapping.reviewQueueItemFields.indexOf('userId'), -1);
    mapping.reviewQueueItemFields.push('mutation');
    assert.strictEqual(adapter.getInputContract().reviewQueueItemFields.indexOf('mutation'), -1);
    var mapped = adapter.adapt({
      reviewQueueItems: [Object.assign({ userId: 'drop-me', privateNote: 'drop-me' }, review())],
      srsDueSnapshot: [Object.assign({ userId: 'drop-me' }, srs())]
    });
    assert.strictEqual(mapped.reviewQueueItems[0].userId, undefined);
    assert.strictEqual(mapped.reviewQueueItems[0].privateNote, undefined);
    assert.strictEqual(mapped.srsDueSnapshot[0].userId, undefined);
    var canonical = adapter.mapCanonicalSrsState(Object.assign({ privateNote: 'drop-me' },
      fixtures.reviewCorrectExistingSrs.result.existingSrsState));
    assert.strictEqual(canonical.privateNote, undefined);
    assert.strictEqual(canonical.stage, 2);
    assert.strictEqual(canonical.dueDate, '2026-09-03');
    throwsCode(function () { adapter.adapt({ reviewQueueItems: [] }); }, 'NORMALIZED_INPUT_INVALID');
  });

  check('adapter classifies access failures without binding a fallback', function () {
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
    assert.ok(/<caption>/.test(script) && /scope="col"/.test(script));
    assert.ok(/localhost\|127\\\.0\\\.0\\\.1/.test(script));
    assert.ok(/params\.get\('review-needed-preview'\) === '1'/.test(script));
    assert.ok(/if \(!local \|\| !enabled\) return;/.test(script));
    assert.ok(/review_needed/.test(script) || /sourceType/.test(script));
    assert.ok(/SRS Due/.test(script));
  });

  check('public HTML and release surfaces have no candidate entry', function () {
    var needles = ['review-needed-hidden-preview', 'review-needed-candidate.js', 'review-needed-read-adapter.js'];
    publicHtmlFiles(root).forEach(function (file) {
      var source = fs.readFileSync(file, 'utf8');
      needles.forEach(function (needle) {
        assert.strictEqual(source.indexOf(needle), -1, path.relative(root, file) + ' ' + needle);
      });
    });
    ['sitemap.xml', 'robots.txt', 'data/nav-template.js', 'js/core/shared.js', 'js/core/shared.min.js'].forEach(function (file) {
      if (!fs.existsSync(path.join(root, file))) return;
      var source = fs.readFileSync(path.join(root, file), 'utf8');
      needles.forEach(function (needle) { assert.strictEqual(source.indexOf(needle), -1, file + ' ' + needle); });
    });
    fs.readdirSync(root).filter(function (file) { return /service[-_]?worker|^sw\.js$/i.test(file); }).forEach(function (file) {
      var source = fs.readFileSync(path.join(root, file), 'utf8');
      needles.forEach(function (needle) { assert.strictEqual(source.indexOf(needle), -1, file + ' ' + needle); });
    });
  });

  check('candidate has no storage, network, form, Supabase, or mutation path', function () {
    var sources = [
      fs.readFileSync(path.join(root, 'js/review-needed/review-needed-candidate.js'), 'utf8'),
      fs.readFileSync(path.join(root, 'js/review-needed/review-needed-read-adapter.js'), 'utf8'),
      fs.readFileSync(path.join(root, 'dev/review-needed-hidden-preview.js'), 'utf8')
    ].join('\n');
    ['.insert(', '.update(', '.upsert(', '.delete(', '.rpc(', 'localStorage', 'sessionStorage', 'fetch(',
      'XMLHttpRequest', 'sendBeacon', 'WebSocket', 'EventSource', 'tone_srs_state', 'supabase'].forEach(function (needle) {
      assert.strictEqual(sources.indexOf(needle), -1, needle);
    });
    assert.strictEqual(fs.readFileSync(path.join(root, 'dev/review-needed-hidden-preview.html'), 'utf8').indexOf('<form'), -1);
    assert.strictEqual(/Day\s*[35]|auto-?save/i.test(sources), false);
  });

  process.stdout.write('REVIEW_NEEDED_HIDDEN_CANDIDATE_PASS ' + passes + '\n');
} catch (error) {
  console.error(error && error.stack || error);
  process.exit(1);
}
