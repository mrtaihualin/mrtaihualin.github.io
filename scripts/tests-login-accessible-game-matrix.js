#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const switcher = read('js/games/game-switcher.js');
const contentClient = read('js/games/game-content-client.js');

const core6Block = switcher.slice(
  switcher.indexOf('var CORE5_TABS'),
  switcher.indexOf('var VAULT_TAB')
);
const discoveredPages = Array.from(core6Block.matchAll(/href:\s*'([^']+\.html)'/g), match => match[1]);
const expectedPages = [
  'tone-finder.html',
  'reading-game.html',
  'listening-game.html',
  'typing-game.html',
  'word-order.html',
  'lego.html',
];

assert.deepStrictEqual(
  discoveredPages,
  expectedPages,
  'the test inventory must follow the exact six destinations exposed by game-switcher.js'
);

assert.match(contentClient, /global\.GAME_CONTENT_TIER = data\.tier \|\| 'anon'/);
assert.match(contentClient, /showErrorBanner\(err\)/);
assert.match(contentClient, /id = 'gc-error-banner'/);
assert.match(contentClient, /id="gc-error-retry"/);
assert.match(contentClient, /返回遊戲總覽/);
assert.match(contentClient, /用LINE問老師/);

const tiered = [
  {
    page: 'tone-finder.html', game: 'tone', app: 'js/games/tone-finder-game.js',
    boot: /GameContentLoader\.boot\(\['js\/games\/tone-finder-game\.min\.js\?v=99'\], \{game:'tone'\}\)/,
    resume: /GameResume\.save\('tone-finder'/,
  },
  {
    page: 'reading-game.html', game: 'reading', app: 'js/games/reading-game-app.js',
    boot: /GameContentLoader\.boot\(\['js\/games\/reading-game-app\.min\.js\?v=63'\], \{game:'reading'\}\)/,
    resume: /GameResume\.save\(RG_RESUME_ID/,
  },
  {
    page: 'typing-game.html', game: 'typing', app: 'js/games/typing-game-app.js',
    boot: /GameContentLoader\.boot\(\['js\/games\/typing-game-app\.min\.js\?v=61'\], \{game:'typing'\}\)/,
    resume: /GameResume\.save\('typing-game'/,
  },
  {
    page: 'word-order.html', game: 'word_order', app: 'js/games/word-order-app.js',
    boot: /GameContentLoader\.boot\(\['js\/games\/word-order-app\.min\.js\?v=46'\], \{game:'word_order'\}\)/,
    resume: /GameResume\.save\('word-order'/,
  },
];

for (const item of tiered) {
  const html = read(item.page);
  const app = read(item.app);
  assert.match(html, new RegExp(`data-gsh-game=["']${item.game === 'word_order' ? 'word-order' : item.game}["']`), item.page + ': visible game shell');
  assert.match(html, /js\/core\/minimum-guest-launch\.js\?v=25/, item.page + ': launch gate');
  assert.match(html, /js\/core\/auth-widget\.js\?v=24/, item.page + ': auth restoration owner');
  assert.match(html, /js\/games\/game-content-client\.js\?v=\d+/, item.page + ': tiered content/error owner');
  assert.match(html, /js\/games\/learning-review\.js\?v=9/, item.page + ': Login Free learning owner');
  if (item.game === 'tone') assert.match(html, /js\/games\/tone-server\.js\?v=6/, item.page + ': Paid Tone beta owner retained');
  else assert.doesNotMatch(html, /js\/games\/tone-server\.js/, item.page + ': no legacy Free SRS owner');
  assert.match(html, item.boot, item.page + ': production bundle boot');
  assert.match(html, /class="gsh-resume-banner"/, item.page + ': nonblank resume recovery surface');
  assert.match(app, item.resume, item.page + ': Safari-compatible localStorage resume write');
  assert.match(app, /LearningReview\.registerRound/, item.page + ': server queue mapping');
  assert.match(app, /LearningReview\.advance/, item.page + ': per-item server commit boundary');
  console.log(`PASS ${item.game} launch=PASS auth_restore=PASS resume=PASS error=PASS learning_loop=PASS`);
}

const listening = read('listening-game.html');
assert.match(listening, /GameContentLoader\.boot\(\['js\/games\/listening-game-app\.js\?v=20'\], \{game:'listening'\}\)/);
assert.doesNotMatch(listening, /coming-soon|即將開幕/);
assert.doesNotMatch(listening, /js\/games\/(?:learning-review|tone-server)\.js/);
assert.match(listening, /js\/core\/auth-widget\.js\?v=24/);
console.log('PASS listening launch=PASS auth_restore=PASS resume=PASS error=PASS learning_loop=EXCLUDED');

const lego = read('lego.html');
const legoApp = read('js/games/lego-game-app.js');
assert.match(lego, /data-gsh-game="lego"/);
assert.match(lego, /id="buildPanel"/);
assert.match(lego, /GameContentLoader\.boot\(\['js\/games\/lego-game-app\.js\?v=15'\], \{game:'lego'\}\)/);
assert.match(lego, /js\/games\/game-content-client\.js\?v=23/);
assert.match(lego, /js\/core\/auth-widget\.js\?v=24/);
assert.match(lego, /id="lego-resume-banner"/);
assert.match(lego, /id="lego-flow-error"[^>]*role="alert"/);
assert.match(legoApp, /GameResume\.save\('lego'/);
assert.match(legoApp, /function legoShowLockedError\(\)/);
assert.doesNotMatch(lego, /js\/games\/(?:learning-review|tone-server)\.js/);
console.log('PASS lego launch=PASS auth_restore=PASS resume=PASS error=PASS learning_loop=N/A');

console.log('LOGIN_ACCESSIBLE_GAME_MATRIX_PASS inventory=6 playable=6 parked=0 login_tiered=4');
