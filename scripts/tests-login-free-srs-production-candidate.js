'use strict';

var fs = require('fs');
var path = require('path');
var root = path.resolve(__dirname, '..');

function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function check(value, message) {
  if (!value) throw new Error(message);
  process.stdout.write('PASS ' + message + '\n');
}

var gate = read('js/core/minimum-guest-launch.js');
var config = read('js/core/supabase-config.js');
check(/LOGIN_CORE_PUBLIC_ENTRY = true/.test(gate), 'Public Login remains enabled');
check(/LOGIN_FREE_SRS_PUBLIC_ENTRY = true/.test(gate), 'Login Free SRS has one explicit reversible flag');
check(/LOGIN_FREE_ACCOUNT_PUBLIC_ENTRY = true/.test(gate), 'Login Free account runtime has one explicit reversible flag');
check(/MRT_MINIMUM_GUEST_LAUNCH = true/.test(gate), 'Minimum Guest boundary remains active');
check(/games-challenge/.test(gate), 'Challenge remains parked');
check(/runtimeMode: 'login-free'/.test(config), 'Login Free content entitlement is active');

var pages = ['tone-finder.html', 'reading-game.html', 'listening-game.html', 'typing-game.html', 'word-order.html'];
pages.forEach(function (file) {
  var html = read(file);
  check(html.indexOf('js/core/minimum-guest-launch.js?v=24') !== -1, file + ' fetches the current Login Free launch gate');
  check(html.indexOf('js/games/tone-server.js?v=6') !== -1, file + ' loads the authenticated SRS transport');
  check(html.indexOf('game-account.js?v=6') !== -1, file + ' activates the server-authoritative Free account facade');
  check(html.indexOf('practice-events.js?v=3') !== -1, file + ' activates durable Login Free reporting');
  check(html.indexOf('games-challenge-app.js') === -1, file + ' does not activate Challenge runtime');
});
check(read('lego.html').indexOf('tone-server.js') === -1, 'Lego receives no SRS runtime');
check(read('js/core/minimum-guest-launch.js').indexOf('login-surface.js?v=15') !== -1, 'SRS pages fetch the account-aware Login surface');
check(read('js/core/login-surface.js').indexOf('reading-auth.js?v=34') !== -1, 'Login surface fetches the account-aware auth client');
check(read('reading-game.html').indexOf('reading-auth.js?v=34') !== -1, 'Reading direct provider flow fetches the account-aware auth client');
check(read('tone-finder.html').indexOf('tone-finder-game.min.js?v=83') !== -1, 'Tone fetches the current game runtime');
check(read('reading-game.html').indexOf('reading-game-app.min.js?v=53') !== -1, 'Reading fetches the current game runtime');
check(read('typing-game.html').indexOf('typing-game-app.min.js?v=47') !== -1, 'Typing fetches the current game runtime');
check(read('word-order.html').indexOf('word-order-app.min.js?v=38') !== -1, 'Word Order fetches the current game runtime');

[
  ['js/games/tone-finder-game.js', /tfMinimumGuestOnly\(\) && window\.LOGIN_FREE_SRS_PUBLIC_ENTRY !== true/],
  ['js/games/reading-game-app.js', /rgMinimumGuestOnly\(\)&&window\.LOGIN_FREE_SRS_PUBLIC_ENTRY!==true/],
  ['js/games/typing-game-app.js', /rgMinimumGuestOnly\(\)&&window\.LOGIN_FREE_SRS_PUBLIC_ENTRY!==true/],
  ['js/games/word-order-app.js', /woMinimumGuestOnly\(\)&&window\.LOGIN_FREE_SRS_PUBLIC_ENTRY!==true/]
].forEach(function (entry) {
  var source = read(entry[0]);
  check(entry[1].test(source), entry[0] + ' opens SRS only behind the dedicated flag');
  check(/READING_AUTH && READING_AUTH\.srsUser/.test(source), entry[0] + ' uses only the dedicated authenticated SRS owner');
});

var listening = read('js/games/listening-game-app.js');
check(/LOGIN_FREE_SRS_PUBLIC_ENTRY !== true/.test(listening), 'Listening SRS owner is flag-gated');
check(/READING_AUTH\.srsUser/.test(listening), 'Listening uses only the dedicated authenticated SRS owner');

var auth = read('js/games/reading-auth.js');
check(/LOGIN_FREE_ACCOUNT_PUBLIC_ENTRY === true/.test(auth), 'General game/account user is controlled by the account entry flag');
check(/API\.user = publicLoginOnly \? null : loginUser/.test(auth), 'Login-only fallback still withholds the general game/account user');
check(/API\.srsUser = publicLoginSrs \? loginUser : API\.user/.test(auth), 'SRS keeps its dedicated authenticated owner channel');
check(/if \(publicLoginOnly\) return null/.test(auth), 'Score persistence stays off in Login-only fallback mode');

var edge = read('supabase/functions/tone-round/index.ts');
check(/\["tone", "reading", "listening", "typing", "wordorder"\]\.includes\(game\)/.test(edge), 'Edge accepts exactly the five SRS games');
check(!/\[([^\]]*["']challenge["'][^\]]*)\]\.includes\(game\)/.test(edge), 'Challenge is rejected by the SRS Edge');
check(!/VALID_GAMES\s*=\s*\[[^\]]*["']challenge["']/.test(edge), 'No hidden Challenge allow-list exists');
check(/stars:\s*0/.test(edge) && /totalStars:\s*0/.test(edge), 'Paid/reward output remains zero');

var migration = read('supabase/migrations/20260903075852_phase1_login_free_srs_least_privilege.sql');
check(/revoke all on table public\.tone_srs_state from public, anon, authenticated/.test(migration), 'SRS table broad grants are revoked');
check(/grant select on table public\.tone_srs_state to authenticated/.test(migration), 'Authenticated users receive read-only owner access');
check(/revoke all on table public\.tone_round_operations from public, anon, authenticated/.test(migration), 'Replay table remains server-only');
check(/to authenticated[\s\S]*using \(\(select auth\.uid\(\)\) = user_id\)/.test(migration), 'Owner RLS policy is authenticated-only');

process.stdout.write('LOGIN_FREE_SRS_PRODUCTION_CANDIDATE_PASS\n');
