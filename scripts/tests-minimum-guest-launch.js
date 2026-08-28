'use strict';

var fs = require('fs');
var path = require('path');
var vm = require('vm');
var root = path.resolve(__dirname, '..');
var activePages = [
  'games.html', 'games-practice.html', 'tone-finder.html', 'reading-game.html', 'listening-game.html',
  'typing-game.html', 'word-order.html', 'lego.html'
];
var parkedPages = [
  'my-progress.html', 'vault.html', 'all-board.html', 'leaderboard.html',
  'reading-board.html', 'listening-board.html', 'typing-board.html',
  'word-order-board.html', 'lego-board.html', 'mix-board.html', 'games-challenge.html'
];
var staticParkedPages = [
  'my-progress.html', 'vault.html', 'all-board.html', 'leaderboard.html',
  'reading-board.html', 'listening-board.html', 'typing-board.html',
  'word-order-board.html', 'lego-board.html', 'mix-board.html', 'line-callback.html'
];

function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function ok(value, message) {
  if (!value) throw new Error(message);
  process.stdout.write('PASS ' + message + '\n');
}

activePages.concat(['games-challenge.html']).forEach(function (file) {
  var html = read(file);
  ok(html.indexOf('js/core/minimum-guest-launch.js?v=5') !== -1, file + ' loads the current Login-entry launch gate');
  ok(html.indexOf('js/core/minimum-guest-launch.js?v=5') < html.indexOf('</head>'), file + ' loads the launch gate in head');
});

staticParkedPages.filter(function (file) { return file !== 'line-callback.html'; }).forEach(function (file) {
  var html = read(file);
  ok(html.indexOf('js/core/minimum-guest-launch.js?v=5') !== -1, file + ' keeps the parked runtime gate with public Login visible');
});
ok(read('line-callback.html').indexOf('minimum-guest-launch.js') === -1,
  'LINE callback remains owned by the provider return flow');

var gate = read('js/core/minimum-guest-launch.js');
ok(gate.indexOf('MRT_MINIMUM_GUEST_LAUNCH = true') !== -1, 'launch flag is explicit');
ok(gate.indexOf('MRT_PARKED_ACCOUNT_SURFACE = parked.test(path)') !== -1, 'parked account surfaces remain fail-closed');
ok(gate.indexOf('my-progress') !== -1 && gate.indexOf('games-challenge') !== -1, 'account and Challenge routes are parked');
ok(gate.indexOf('vault-btn-slot') !== -1, 'personal save controls are hidden');

function runGateAt(hash) {
  var replacedUrl = null;
  var windowStub = {
    location: {
      hash: hash,
      pathname: '/',
      search: '?guest_launch=1',
      replace: function (url) { replacedUrl = url; }
    },
    history: {
      state: null,
      replaceState: function (_state, _title, url) { replacedUrl = url; }
    }
  };
  var documentStub = {
    title: 'Guest',
    readyState: 'complete',
    documentElement: { classList: { add: function () {} } },
    head: { appendChild: function () {} },
    createElement: function () { return { setAttribute: function () {}, textContent: '' }; },
    querySelector: function () { return null; },
    querySelectorAll: function () { return []; }
  };
  vm.runInNewContext(gate, { window: windowStub, document: documentStub });
  return replacedUrl;
}

ok(runGateAt('#access_token=redacted&refresh_token=redacted') === null,
  'public Login Core preserves the callback fragment for the Reading provider flow');
ok(runGateAt('#articles') === null, 'normal page anchors remain untouched');

var config = read('js/core/supabase-config.js');
ok(config.indexOf("runtimeMode: 'minimum-guest'") !== -1, 'one reversible runtime mode is canonical');
ok(config.indexOf('getAnonymousSupabaseClient') !== -1 && config.indexOf('persistSession: false') !== -1 &&
  config.indexOf('autoRefreshToken: false') !== -1 && config.indexOf('detectSessionInUrl: false') !== -1,
  'isolated anonymous Supabase client cannot inherit browser auth');

var sixGames = ['tone-finder.html','reading-game.html','listening-game.html','typing-game.html','word-order.html','lego.html'];
var parkedBundles = ['game-account.js','phase1-canonical-state.js','learning-summary.js','study-plan.js','tone-server.js','word-vault.js','sentence-vault.js','practice-events.js'];
sixGames.forEach(function (file) {
  var html = read(file);
  parkedBundles.forEach(function (bundle) { ok(html.indexOf(bundle) === -1, file + ' does not execute parked ' + bundle); });
  ok(!/(?:reading|typing|listening|word-order|lego)-board\.html/.test(html), file + ' does not expose a leaderboard route');
});
ok(read('reading-game.html').indexOf('reading-auth.js') !== -1,
  'Reading remains the direct provider-flow owner while other pages reuse it through the shared Login controller');

var contentClient = read('js/games/game-content-client.js');
ok(contentClient.indexOf('minimumGuest ? cfg.anonKey') !== -1, 'protected game content ignores stored Login token');
ok(!/登入解鎖|rg-login-btn|openLogin/.test(contentClient), 'content cap exposes no Login CTA');

var audioClient = read('js/games/protected-word-audio.js');
ok(audioClient.indexOf('getAnonymousSupabaseClient') !== -1, 'protected audio uses isolated Guest client');

var legoApp = read('js/games/lego-game-app.js');
ok(legoApp.indexOf("return {uid:'minimum-guest',epoch:0}") !== -1, 'Lego quota has a Guest owner boundary');
ok(legoApp.indexOf('res.data.loggedIn!==false') !== -1, 'Lego quota rejects authenticated response leakage');

['js/games/tone-finder-game.js','js/games/reading-game-app.js','js/games/typing-game-app.js','js/games/word-order-app.js'].forEach(function (file) {
  var source = read(file);
  ok(source.indexOf('MinimumGuestOnly') !== -1, file + ' parks local SRS/Challenge state');
});

var report = read('js/games/round-report.js');
ok(report.indexOf('isMinimumGuestOnly') !== -1, 'Result stays in-memory without daily progress persistence');

['js/core/auth-widget.js', 'js/games/reading-auth.js', 'js/games/game-account.js'].forEach(function (file) {
  var source = read(file);
  var guard = source.indexOf('MRT_MINIMUM_GUEST_LAUNCH === true');
  var firstSessionRead = source.indexOf('getSession');
  ok(guard !== -1, file + ' has Guest-only guard');
  ok(firstSessionRead === -1 || guard < firstSessionRead, file + ' guards before session access');
});

var readingAuth = read('js/games/reading-auth.js');
ok(readingAuth.indexOf('saveScore: function () { return null; }') !== -1, 'score persistence is disabled in launch mode');

var gameAccount = read('js/games/game-account.js');
ok(gameAccount.indexOf('sync: function () {}') !== -1, 'account sync is disabled in launch mode');

var gameFlow = read('js/games/game-flow.js');
ok(gameFlow.indexOf('game_auto_next_pause') === -1, 'question countdown and pause controls are removed');
ok(gameFlow.indexOf('下一輪將在') === -1, 'Result auto-replay countdown is removed');
ok(gameFlow.indexOf('MRT_MINIMUM_GUEST_LAUNCH !== true') !== -1, 'durable report submission is disabled in launch mode');

process.stdout.write('MINIMUM_GUEST_LAUNCH_STATIC_PASS\n');
