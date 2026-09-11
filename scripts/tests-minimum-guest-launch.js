'use strict';

var fs = require('fs');
var path = require('path');
var vm = require('vm');
var root = path.resolve(__dirname, '..');
var activePages = [
  'games.html', 'games-practice.html', 'tone-finder.html', 'reading-game.html', 'listening-game.html',
  'typing-game.html', 'word-order.html', 'lego.html', 'my-progress.html', 'all-board.html',
  'leaderboard.html', 'reading-board.html', 'listening-board.html', 'typing-board.html',
  'word-order-board.html'
];
var parkedPages = ['games-challenge.html'];

function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function ok(value, message) {
  if (!value) throw new Error(message);
  process.stdout.write('PASS ' + message + '\n');
}

['lego-board.html', 'mix-board.html'].forEach(function (file) {
  ok(!fs.existsSync(path.join(root, file)), file + ' is removed instead of exposing a placeholder page');
});

activePages.concat(['vault.html', 'games-challenge.html']).forEach(function (file) {
  var html = read(file);
  var binding = 'js/core/minimum-guest-launch.js?v=24';
  ok(html.indexOf(binding) !== -1, file + ' loads the current Login-entry launch gate');
  ok(html.indexOf(binding) < html.indexOf('</head>'), file + ' loads the launch gate in head');
});
ok(read('line-callback.html').indexOf('minimum-guest-launch.js') === -1,
  'LINE callback remains owned by the provider return flow');

var gate = read('js/core/minimum-guest-launch.js');
ok(gate.indexOf('MRT_MINIMUM_GUEST_LAUNCH = true') !== -1, 'launch flag is explicit');
ok(gate.indexOf('LOGIN_FREE_SRS_PUBLIC_ENTRY = loginFreeLearningGame') !== -1,
  'Login Free SRS entry is scoped to the approved game allow-list');
ok(gate.indexOf('LOGIN_FREE_REVIEW_PUBLIC_ENTRY = loginFreeLearningGame') !== -1,
  'Login Free Review entry is scoped to the approved game allow-list');
ok(gate.indexOf('LOGIN_FREE_ACCOUNT_PUBLIC_ENTRY = true') !== -1, 'Login Free account entry flag is explicit');
ok(gate.indexOf("login-surface.js?v=15") !== -1, 'Login surface cache key activates the account-aware client');
ok(gate.indexOf("login-surface.css?v=15") !== -1, 'Login surface stylesheet cache key activates the account-menu visual system');
ok(gate.indexOf("repeat(5,minmax(0,1fr))") !== -1 && gate.indexOf('@media(max-width:959px)') !== -1,
  'Game Hub keeps five equal desktop destinations and a two-column compact layout');
ok(gate.indexOf('MRT_PARKED_ACCOUNT_SURFACE = parked.test(path)') !== -1, 'parked account surfaces remain fail-closed');
ok(gate.indexOf('my-progress') !== -1 && gate.indexOf('games-challenge') !== -1, 'reversible fallback keeps account and Challenge route inventory');
ok(gate.indexOf('vault-btn-slot') === -1 && gate.indexOf('a[href="vault.html"]') === -1,
  'authorized Personal Data controls and Vault routes are not hidden');
ok(!/\(\?:my-progress\|vault\|/.test(gate), 'Vault is removed from the parked route matcher');
ok(gate.indexOf("'#gameSearchGate'") === -1, 'authorized Game Search gate is not hidden');

function runGateAt(hash, pathname) {
  var replacedUrl = null;
  var windowStub = {
    location: {
      hash: hash,
      pathname: pathname || '/',
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
  return {
    replacedUrl: replacedUrl,
    parked: windowStub.MRT_PARKED_ACCOUNT_SURFACE,
    srs: windowStub.LOGIN_FREE_SRS_PUBLIC_ENTRY,
    review: windowStub.LOGIN_FREE_REVIEW_PUBLIC_ENTRY
  };
}

ok(runGateAt('#access_token=redacted&refresh_token=redacted').replacedUrl === null,
  'public Login Core preserves the callback fragment for the Reading provider flow');
ok(runGateAt('#articles').replacedUrl === null, 'normal page anchors remain untouched');
ok(runGateAt('', '/my-progress.html').parked === false, 'Learning Center is active for Login Free');
ok(runGateAt('', '/leaderboard.html').parked === false, 'per-game boards are active for Login Free');
ok(runGateAt('', '/games-challenge.html').parked === true, 'Paid Challenge remains parked');
['tone-finder', 'reading-game', 'typing-game', 'word-order'].forEach(function (route) {
  ok(runGateAt('', '/' + route).srs === true && runGateAt('', '/' + route + '.html').review === true,
    route + ' enables Retry/Review/SRS on both public URL forms');
});
ok(runGateAt('', '/listening-game').srs === false && runGateAt('', '/listening-game.html').review === false,
  'Listening is excluded from Retry/Review/SRS on both public URL forms');

var config = read('js/core/supabase-config.js');
ok(config.indexOf("runtimeMode: 'login-free'") !== -1, 'Login Free is the active reversible runtime mode');
ok(config.indexOf('getAnonymousSupabaseClient') !== -1 && config.indexOf('persistSession: false') !== -1 &&
  config.indexOf('autoRefreshToken: false') !== -1 && config.indexOf('detectSessionInUrl: false') !== -1,
  'isolated anonymous Supabase client cannot inherit browser auth');
var configWindow = {};
vm.runInNewContext(config, { window: configWindow });
ok(configWindow.isMinimumGuestOnly() === false, 'active runtime does not force authenticated sessions into Guest content');
configWindow.SUPABASE_CONFIG.runtimeMode = 'minimum-guest';
ok(configWindow.isMinimumGuestOnly() === true, 'Minimum Guest rollback remains one explicit mode change');

var coreFive = ['tone-finder.html','reading-game.html','listening-game.html','typing-game.html','word-order.html'];
var accountBundles = ['game-account.js','phase1-canonical-state.js','learning-summary.js','practice-events.js'];
coreFive.forEach(function (file) {
  var html = read(file);
  accountBundles.forEach(function (bundle) { ok(html.indexOf(bundle) !== -1, file + ' executes Login Free ' + bundle); });
  ok(html.indexOf('study-plan-core.js?v=2') !== -1 && html.indexOf('study-plan.js?v=5') !== -1,
    file + ' executes the separately authorized Free Time Auto Plan');
  ok(!/(?:reading|typing|listening|word-order|lego)-board\.html/.test(html), file + ' does not expose a leaderboard route');
});
var legoHtml = read('lego.html');
accountBundles.forEach(function (bundle) { ok(legoHtml.indexOf(bundle) === -1, 'Lego does not execute Core 5 ' + bundle); });
ok(legoHtml.indexOf('study-plan-core.js?v=2') !== -1 && legoHtml.indexOf('study-plan.js?v=5') !== -1,
  'Lego executes the separately authorized Free Time Auto Plan');
['tone-finder.html','reading-game.html','typing-game.html','word-order.html'].forEach(function (file) {
  ok(read(file).indexOf('tone-server.js?v=6') !== -1, file + ' executes only the approved Login Free SRS transport');
});
ok(read('lego.html').indexOf('tone-server.js') === -1, 'Lego keeps SRS transport parked');
ok(read('listening-game.html').indexOf('tone-server.js') === -1 && read('listening-game.html').indexOf('learning-review.js') === -1,
  'Listening loads neither the SRS transport nor Review runtime');
['tone-finder.html','reading-game.html','listening-game.html','typing-game.html'].forEach(function (file) {
  var html = read(file);
  ok(html.indexOf('word-vault.js?v=8') !== -1 && html.indexOf('sentence-vault.js?v=4') !== -1,
    file + ' executes the authorized word and sentence Personal Data clients');
});
['word-order.html','lego.html'].forEach(function (file) {
  var html = read(file);
  ok(html.indexOf('sentence-vault.js?v=4') !== -1 && html.indexOf('word-vault.js') === -1,
    file + ' executes only the authorized sentence Personal Data client');
});
ok(/<script defer src="js\/games\/word-vault\.js\?v=8"><\/script>[\s\S]*<script defer src="js\/games\/sentence-vault\.js\?v=4"><\/script>/.test(read('vault.html')),
  'Vault executes both personal clients');
ok(read('reading-game.html').indexOf('reading-auth.js') !== -1,
  'Reading remains the direct provider-flow owner while other pages reuse it through the shared Login controller');

var contentClient = read('js/games/game-content-client.js');
ok(contentClient.indexOf('minimumGuest ? cfg.anonKey') !== -1 && contentClient.indexOf('readAccessTokenGuess(cfg.url) || cfg.anonKey') !== -1,
  'protected game content keeps separate Guest and Login Free token paths');
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
ok(readingAuth.indexOf('LOGIN_FREE_ACCOUNT_PUBLIC_ENTRY === true') !== -1 &&
  readingAuth.indexOf('if (publicLoginOnly) return null;') !== -1,
  'score persistence is enabled only after the Login Free account flag leaves Login-only mode');

var gameAccount = read('js/games/game-account.js');
ok(gameAccount.indexOf('LOGIN_FREE_ACCOUNT_PUBLIC_ENTRY !== true') !== -1,
  'account sync remains fail-closed unless the Login Free account flag is active');

var gameFlow = read('js/games/game-flow.js');
ok(gameFlow.indexOf('game_auto_next_pause') === -1, 'question countdown and pause controls are removed');
ok(gameFlow.indexOf('下一輪將在') === -1, 'Result auto-replay countdown is removed');
ok(gameFlow.indexOf('LOGIN_FREE_ACCOUNT_PUBLIC_ENTRY === true') !== -1,
  'durable report submission is enabled only for the Login Free account entry');

var progressHtml = read('my-progress.html');
ok(progressHtml.indexOf('data-mrt-parked-runtime') === -1 && progressHtml.indexOf('js/score/progress.js?v=12') !== -1,
  'Learning Center runtime is active');
['leaderboard.html','reading-board.html','listening-board.html','typing-board.html','word-order-board.html'].forEach(function (file) {
  var html = read(file);
  ok(html.indexOf('data-mrt-parked-runtime') === -1 && html.indexOf('nickname-safety.js?v=1') !== -1,
    file + ' executes its Login Free leaderboard runtime');
});

process.stdout.write('MINIMUM_GUEST_LAUNCH_STATIC_PASS\n');
