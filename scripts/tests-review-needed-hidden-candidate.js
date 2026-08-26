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
      then: function (resolve) { resolve({ data: fixtures.day1.rows.filter(function (row) { return row.record_type === 'srs_state'; }), error: null }); }
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
    });
  }); })
  .then(function () { return check('adapter maps denied and generic failures without fallback writes', function () {
    var deniedClient = { from: function () { return {
      select: function () { return this; }, eq: function () { return Promise.resolve({ data: null, error: { status: 403, message: 'denied' } }); }
    }; } };
    return Promise.all([
      adapter.load(deniedClient, 'fixture-user', { tier: 'free', today: fixtures.day1.today }),
      adapter.load(null, 'fixture-user', { tier: 'free', today: fixtures.day1.today })
    ]).then(function (states) {
      assert.strictEqual(states[0].status, 'access-denied');
      assert.strictEqual(states[1].status, 'error');
    });
  }); })
  .then(function () { return check('developer preview is noindex, hidden, localhost-only, and explicit-enable only', function () {
    var html = fs.readFileSync(path.join(root, 'dev/review-needed-hidden-preview.html'), 'utf8');
    var script = fs.readFileSync(path.join(root, 'dev/review-needed-hidden-preview.js'), 'utf8');
    assert.ok(/name="robots" content="noindex,nofollow,noarchive"/.test(html));
    assert.ok(/id="review-needed-preview" hidden aria-hidden="true"/.test(html));
    assert.ok(/localhost\|127\\\.0\\\.0\\\.1/.test(script));
    assert.ok(/params\.get\('review-needed-preview'\) === '1'/.test(script));
    assert.ok(/if \(!local \|\| !enabled\) return;/.test(script));
  }); })
  .then(function () { return check('public HTML, sitemap, robots, and service-worker surfaces have no preview entry', function () {
    publicHtmlFiles(root).forEach(function (file) {
      assert.strictEqual(fs.readFileSync(file, 'utf8').indexOf('review-needed-hidden-preview'), -1, path.relative(root, file));
    });
    ['sitemap.xml', 'robots.txt'].forEach(function (file) {
      if (fs.existsSync(path.join(root, file))) {
        assert.strictEqual(fs.readFileSync(path.join(root, file), 'utf8').indexOf('review-needed-hidden-preview'), -1, file);
      }
    });
    fs.readdirSync(root).filter(function (file) { return /service[-_]?worker|^sw\.js$/i.test(file); }).forEach(function (file) {
      assert.strictEqual(fs.readFileSync(path.join(root, file), 'utf8').indexOf('review-needed-hidden-preview'), -1, file);
    });
  }); })
  .then(function () { return check('candidate and adapter contain no storage or remote mutation path', function () {
    var sources = [
      fs.readFileSync(path.join(root, 'js/review-needed/review-needed-candidate.js'), 'utf8'),
      fs.readFileSync(path.join(root, 'js/review-needed/review-needed-read-adapter.js'), 'utf8')
    ].join('\n');
    ['.insert(', '.update(', '.upsert(', '.delete(', '.rpc(', 'localStorage', 'sessionStorage', 'fetch('].forEach(function (needle) {
      assert.strictEqual(sources.indexOf(needle), -1, needle);
    });
  }); })
  .then(function () {
    process.stdout.write('REVIEW_NEEDED_HIDDEN_CANDIDATE_PASS ' + passes + '\n');
  })
  .catch(function (error) {
    console.error(error && error.stack || error);
    process.exit(1);
  });
