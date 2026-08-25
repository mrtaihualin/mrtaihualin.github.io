'use strict';

var fs = require('fs');
var path = require('path');
var root = path.resolve(__dirname, '..');
var activePages = [
  'games.html', 'tone-finder.html', 'reading-game.html', 'listening-game.html',
  'typing-game.html', 'word-order.html', 'lego.html'
];
var parkedPages = [
  'my-progress.html', 'vault.html', 'all-board.html', 'leaderboard.html',
  'reading-board.html', 'listening-board.html', 'typing-board.html',
  'word-order-board.html', 'lego-board.html', 'mix-board.html', 'games-challenge.html'
];

function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function ok(value, message) {
  if (!value) throw new Error(message);
  process.stdout.write('PASS ' + message + '\n');
}

activePages.concat(parkedPages).forEach(function (file) {
  var html = read(file);
  ok(html.indexOf('js/core/minimum-guest-launch.js?v=1') !== -1, file + ' loads the launch gate');
  ok(html.indexOf('js/core/minimum-guest-launch.js?v=1') < html.indexOf('</head>'), file + ' loads the launch gate in head');
});

var gate = read('js/core/minimum-guest-launch.js');
ok(gate.indexOf('MRT_MINIMUM_GUEST_LAUNCH = true') !== -1, 'launch flag is explicit');
ok(gate.indexOf('window.location.replace') !== -1, 'parked direct routes fail closed');
ok(gate.indexOf('my-progress') !== -1 && gate.indexOf('games-challenge') !== -1, 'account and Challenge routes are parked');
ok(gate.indexOf('vault-btn-slot') !== -1, 'personal save controls are hidden');

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

process.stdout.write('MINIMUM_GUEST_LAUNCH_STATIC_PASS\n');
