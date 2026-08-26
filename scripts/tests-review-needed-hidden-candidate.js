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
  return Promise.resolve().then(fn).then(function () {
    passes += 1;
    process.stdout.write('PASS ' + label + '\n');
  });
}

function throwsCode(fn, code) {
  assert.throws(fn, function (error) { return error && error.code === code; });
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

Promise.resolve()
  .then(function () { return check('feature flag defaults OFF', function () {
    assert.strictEqual(contract.FEATURE_DEFAULT_ENABLED, false);
    throwsCode(function () { contract.createCandidate({ tier: 'free' }); }, 'FEATURE_DISABLED');
  }); })
  .then(function () { return check('five-game contract and aliases stay isolated', function () {
    assert.deepStrictEqual(contract.GAME_IDS, ['tone', 'reading', 'listening', 'typing', 'wordorder']);
    assert.strictEqual(contract.normalizeGame('word_order'), 'wordorder');
    assert.strictEqual(contract.normalizeGame('challenge'), null);
  }); })
  .then(function () { return check('Day 0 is not due and pure derivation never advances state', function () {
    var input = JSON.parse(JSON.stringify(fixtures.day0.rows));
    var snapshot = contract.buildSnapshot(input, { tier: 'free', today: fixtures.day0.today, roundSize: 5 });
    assert.strictEqual(snapshot.totals.due, 0);
    assert.strictEqual(snapshot.totals.notDue, 5);
    assert.strictEqual(snapshot.ignoredRows, 1);
    assert.deepStrictEqual(input, fixtures.day0.rows);
    assert.strictEqual(contract.advance, undefined);
  }); })
  .then(function () { return check('derived stage 0 with no date is immediately due without mutation', function () {
    var row = { record_type: 'srs_state', game: 'tone', level: 1, word: 'stage-zero', stage: 0,
      due_date: '', ever_failed: true, mastered: false };
    var snapshot = contract.buildSnapshot([row], { tier: 'free', today: fixtures.day0.today, roundSize: 5 });
    assert.strictEqual(snapshot.games.tone.due.length, 1);
    assert.strictEqual(snapshot.games.reading.due.length, 0);
    assert.strictEqual(row.stage, 0);
  }); })
  .then(function () { return check('Day 1 exposes one due item independently in each game', function () {
    var snapshot = contract.buildSnapshot(fixtures.day1.rows, { tier: 'free', today: fixtures.day1.today, roundSize: 5 });
    contract.GAME_IDS.forEach(function (game) {
      assert.strictEqual(snapshot.games[game].due.length, 1);
      assert.strictEqual(snapshot.games[game].selectedDue.length, 1);
      assert.strictEqual(snapshot.games[game].dueQuota, 1);
      assert.strictEqual(snapshot.games[game].maxReviewAttempts, 1);
      assert.strictEqual(snapshot.games[game].due[0].game, game);
    });
  }); })
  .then(function () { return check('Day 8 keeps Mastered out of every Free due queue', function () {
    var snapshot = contract.buildSnapshot(fixtures.day8.rows, { tier: 'free', today: fixtures.day8.today, roundSize: 5 });
    contract.GAME_IDS.forEach(function (game) {
      assert.strictEqual(snapshot.games[game].due.length, 1);
      assert.strictEqual(snapshot.games[game].masteredCount, 1);
      assert.strictEqual(snapshot.games[game].due.some(function (row) { return row.mastered; }), false);
    });
    assert.strictEqual(snapshot.totals.mastered, 5);
  }); })
  .then(function () { return check('same item identity remains independent across all five games', function () {
    var rows = contract.GAME_IDS.map(function (game) {
      return { record_type: 'srs_state', game: game, level: 1, word: 'same-item', stage: 1,
        due_date: fixtures.day1.today, ever_failed: false, mastered: false };
    });
    var snapshot = contract.buildSnapshot(rows, { tier: 'free', today: fixtures.day1.today, roundSize: 5 });
    contract.GAME_IDS.forEach(function (game) {
      assert.strictEqual(snapshot.games[game].history.length, 1);
      assert.strictEqual(snapshot.games[game].due[0].itemKey, '1|same-item');
      assert.strictEqual(snapshot.games[game].due[0].game, game);
    });
  }); })
  .then(function () { return check('Free and dormant Paid policies are configuration, not Free hard-coding', function () {
    var free = contract.getTierConfig('free');
    var paid = contract.getTierConfig('paid');
    assert.deepStrictEqual([free.dueRatio, free.maxReviewAttempts], [0.20, 1]);
    assert.deepStrictEqual([paid.dueRatio, paid.maxReviewAttempts, paid.runtimeEnabled], [0.30, 4, false]);
    throwsCode(function () {
      contract.buildSnapshot(fixtures.day1.rows, { tier: 'paid', today: fixtures.day1.today, roundSize: 10 });
    }, 'TIER_DISABLED');
    var dormant = contract.buildSnapshot(fixtures.day1.rows, {
      tier: 'paid', today: fixtures.day1.today, roundSize: 10, allowDormantTier: true
    });
    assert.strictEqual(dormant.games.tone.dueQuota, 3);
    assert.strictEqual(dormant.games.tone.maxReviewAttempts, 4);
  }); })
  .then(function () { return check('Review Needed limits are attempt maxima and stop at Free 1 / Paid 4', function () {
    var freeOpen = contract.reviewAttemptWindow('free', 0);
    var freeClosed = contract.reviewAttemptWindow('free', 1);
    assert.deepStrictEqual([freeOpen.maxReviewAttempts, freeOpen.attemptsRemaining, freeOpen.canAttempt], [1, 1, true]);
    assert.deepStrictEqual([freeClosed.attemptsRemaining, freeClosed.canAttempt], [0, false]);
    var paidOpen = contract.reviewAttemptWindow('paid', 3, { allowDormantTier: true });
    var paidClosed = contract.reviewAttemptWindow('paid', 4, { allowDormantTier: true });
    assert.deepStrictEqual([paidOpen.maxReviewAttempts, paidOpen.attemptsRemaining, paidOpen.canAttempt], [4, 1, true]);
    assert.deepStrictEqual([paidClosed.attemptsRemaining, paidClosed.canAttempt], [0, false]);
    assert.strictEqual(Object.keys(paidClosed).some(function (key) { return /day|delay|reschedule/i.test(key); }), false);
    throwsCode(function () { contract.createCandidate({ enabled: true, tier: 'paid' }); }, 'TIER_DISABLED');
    throwsCode(function () { contract.reviewAttemptWindow('free', -1); }, 'INVALID_ATTEMPT_COUNT');
    throwsCode(function () { contract.reviewAttemptWindow('free', 0.5); }, 'INVALID_ATTEMPT_COUNT');
  }); })
  .then(function () { return check('malformed, duplicate, and unknown canonical rows fail closed', function () {
    var valid = { record_type: 'srs_state', game: 'tone', level: 1, word: 'valid', stage: 1,
      due_date: fixtures.day1.today, ever_failed: false, mastered: false };
    throwsCode(function () { contract.buildSnapshot({}, { tier: 'free', today: fixtures.day1.today }); }, 'INVALID_ROWS');
    throwsCode(function () { contract.buildSnapshot([Object.assign({}, valid, { game: 'unknown' })], { tier: 'free', today: fixtures.day1.today }); }, 'UNKNOWN_GAME');
    throwsCode(function () { contract.buildSnapshot([Object.assign({}, valid, { stage: 1.5 })], { tier: 'free', today: fixtures.day1.today }); }, 'MALFORMED_STATE_ROW');
    throwsCode(function () { contract.buildSnapshot([Object.assign({}, valid, { mastered: 'false' })], { tier: 'free', today: fixtures.day1.today }); }, 'MALFORMED_STATE_ROW');
    throwsCode(function () { contract.buildSnapshot([Object.assign({}, valid, { due_date: '2026-99-99' })], { tier: 'free', today: fixtures.day1.today }); }, 'MALFORMED_STATE_ROW');
    throwsCode(function () { contract.buildSnapshot([Object.assign({}, valid, { due_date: '' })], { tier: 'free', today: fixtures.day1.today }); }, 'MALFORMED_STATE_ROW');
    throwsCode(function () { contract.buildSnapshot([valid, Object.assign({}, valid)], { tier: 'free', today: fixtures.day1.today }); }, 'DUPLICATE_STATE_ROW');
    throwsCode(function () { contract.buildSnapshot([valid], { tier: 'free', today: '2026-02-30' }); }, 'INVALID_TODAY');
  }); })
  .then(function () { return check('empty/loading/error/access-denied fixture states exist', function () {
    assert.deepStrictEqual(
      [fixtures.empty.status, fixtures.loading.status, fixtures.error.status, fixtures.accessDenied.status],
      ['empty', 'loading', 'error', 'access-denied']
    );
    ['loading', 'empty', 'error', 'access-denied'].forEach(function (status) {
      assert.strictEqual(contract.viewState(status).status, status);
    });
  }); })
  .then(function () { return check('adapter performs only current table/select/user-filter reads', function () {
    var calls = [];
    var query = {
      select: function (fields) { calls.push(['select', fields]); return this; },
      eq: function (field, value) { calls.push(['eq', field, value]); return this; },
      then: function (resolve) { resolve({ data: fixtures.day1.rows.filter(function (row) { return row.record_type === 'srs_state'; }).map(function (row) {
        return Object.assign({ user_id: 'must-not-leak', private_note: 'must-not-leak' }, row);
      }), error: null }); }
    };
    var client = {
      from: function (table) { calls.push(['from', table]); return query; },
      insert: function () { throw new Error('write attempted'); },
      update: function () { throw new Error('write attempted'); },
      upsert: function () { throw new Error('write attempted'); },
      rpc: function () { throw new Error('write attempted'); }
    };
    return adapter.readRows(client, 'fixture-user').then(function (rows) {
      assert.strictEqual(rows.length, 5);
      assert.deepStrictEqual(calls, [
        ['from', 'tone_srs_state'],
        ['select', adapter.SELECT_FIELDS],
        ['eq', 'user_id', 'fixture-user']
      ]);
      assert.strictEqual(rows.every(function (row) { return row.record_type === 'srs_state'; }), true);
      assert.strictEqual(rows.every(function (row) { return !('user_id' in row) && !('private_note' in row); }), true);
    });
  }); })
  .then(function () { return check('integration mapping is explicit, reusable, and read-only', function () {
    var mapping = adapter.getReadMapping();
    assert.deepStrictEqual(mapping, {
      table: 'tone_srs_state',
      selectFields: ['game', 'level', 'word', 'stage', 'due_date', 'ever_failed', 'mastered'],
      userFilter: 'user_id',
      identityFields: ['game', 'level', 'word'],
      recordType: 'srs_state',
      mode: 'read-only'
    });
    mapping.selectFields.push('should-not-mutate-contract');
    assert.strictEqual(adapter.getReadMapping().selectFields.indexOf('should-not-mutate-contract'), -1);
  }); })
  .then(function () { return check('adapter maps denied and generic failures without fallback writes', function () {
    var deniedClient = { from: function () { return {
      select: function () { return this; }, eq: function () { return Promise.resolve({ data: null, error: { status: 403, message: 'denied' } }); }
    }; } };
    return Promise.all([
      adapter.load(deniedClient, 'fixture-user', { tier: 'free', today: fixtures.day1.today }),
      adapter.load(null, 'fixture-user', { tier: 'free', today: fixtures.day1.today }),
      adapter.load({ from: function () { throw new Error('sync read failure'); } }, 'fixture-user',
        { tier: 'free', today: fixtures.day1.today })
    ]).then(function (states) {
      assert.strictEqual(states[0].status, 'access-denied');
      assert.strictEqual(states[1].status, 'error');
      assert.strictEqual(states[2].status, 'error');
    });
  }); })
  .then(function () { return check('developer preview is noindex, hidden, localhost-only, and explicit-enable only', function () {
    var html = fs.readFileSync(path.join(root, 'dev/review-needed-hidden-preview.html'), 'utf8');
    var script = fs.readFileSync(path.join(root, 'dev/review-needed-hidden-preview.js'), 'utf8');
    assert.ok(/name="robots" content="noindex,nofollow,noarchive"/.test(html));
    assert.ok(/id="review-needed-preview" hidden aria-hidden="true"/.test(html));
    assert.ok(/role="status" aria-live="polite"/.test(html));
    assert.ok(/<caption>/.test(script) && /scope="col"/.test(script));
    assert.ok(/localhost\|127\\\.0\\\.0\\\.1/.test(script));
    assert.ok(/params\.get\('review-needed-preview'\) === '1'/.test(script));
    assert.ok(/if \(!local \|\| !enabled\) return;/.test(script));
  }); })
  .then(function () { return check('public HTML, sitemap, robots, and service-worker surfaces have no preview entry', function () {
    var publicNeedles = ['review-needed-hidden-preview', 'review-needed-candidate.js', 'review-needed-read-adapter.js'];
    publicHtmlFiles(root).forEach(function (file) {
      var source = fs.readFileSync(file, 'utf8');
      publicNeedles.forEach(function (needle) {
        assert.strictEqual(source.indexOf(needle), -1, path.relative(root, file) + ' ' + needle);
      });
    });
    ['sitemap.xml', 'robots.txt', 'data/nav-template.js', 'js/core/shared.js', 'js/core/shared.min.js'].forEach(function (file) {
      if (fs.existsSync(path.join(root, file))) {
        var source = fs.readFileSync(path.join(root, file), 'utf8');
        publicNeedles.forEach(function (needle) { assert.strictEqual(source.indexOf(needle), -1, file + ' ' + needle); });
      }
    });
    fs.readdirSync(root).filter(function (file) { return /service[-_]?worker|^sw\.js$/i.test(file); }).forEach(function (file) {
      var source = fs.readFileSync(path.join(root, file), 'utf8');
      publicNeedles.forEach(function (needle) { assert.strictEqual(source.indexOf(needle), -1, file + ' ' + needle); });
    });
  }); })
  .then(function () { return check('candidate and adapter contain no storage or remote mutation path', function () {
    var sources = [
      fs.readFileSync(path.join(root, 'js/review-needed/review-needed-candidate.js'), 'utf8'),
      fs.readFileSync(path.join(root, 'js/review-needed/review-needed-read-adapter.js'), 'utf8')
    ].join('\n');
    ['.insert(', '.update(', '.upsert(', '.delete(', '.rpc(', 'localStorage', 'sessionStorage', 'fetch(',
      'XMLHttpRequest', 'sendBeacon', 'WebSocket', 'EventSource'].forEach(function (needle) {
      assert.strictEqual(sources.indexOf(needle), -1, needle);
    });
    var preview = fs.readFileSync(path.join(root, 'dev/review-needed-hidden-preview.js'), 'utf8');
    ['fetch(', 'XMLHttpRequest', 'sendBeacon', 'WebSocket', 'EventSource'].forEach(function (needle) {
      assert.strictEqual(preview.indexOf(needle), -1, needle);
    });
    assert.strictEqual(fs.readFileSync(path.join(root, 'dev/review-needed-hidden-preview.html'), 'utf8').indexOf('<form'), -1);
  }); })
  .then(function () {
    process.stdout.write('REVIEW_NEEDED_HIDDEN_CANDIDATE_PASS ' + passes + '\n');
  })
  .catch(function (error) {
    console.error(error && error.stack || error);
    process.exit(1);
  });
