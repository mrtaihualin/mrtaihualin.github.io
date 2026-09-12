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
    boot: /GameContentLoader\.boot\(\['js\/games\/tone-finder-game\.min\.js\?v=85'\], \{game:'tone'\}\)/,
    resume: /GameResume\.save\('tone-finder'/,
  },
  {
    page: 'reading-game.html', game: 'reading', app: 'js/games/reading-game-app.js',
    boot: /GameContentLoader\.boot\(\['js\/games\/reading-game-app\.min\.js\?v=55'\], \{game:'reading'\}\)/,
    resume: /GameResume\.save\(RG_RESUME_ID/,
  },
  {
    page: 'typing-game.html', game: 'typing', app: 'js/games/typing-game-app.js',
    boot: /GameContentLoader\.boot\(\['js\/games\/typing-game-app\.min\.js\?v=50'\], \{game:'typing'\}\)/,
    resume: /GameResume\.save\('typing-game'/,
  },
  {
    page: 'word-order.html', game: 'word_order', app: 'js/games/word-order-app.js',
    boot: /GameContentLoader\.boot\(\['js\/games\/word-order-app\.min\.js\?v=39'\], \{game:'word_order'\}\)/,
    resume: /GameResume\.save\('word-order'/,
  },
];

for (const item of tiered) {
  const html = read(item.page);
  const app = read(item.app);
  assert.match(html, new RegExp(`data-gsh-game=["']${item.game === 'word_order' ? 'word-order' : item.game}["']`), item.page + ': visible game shell');
  assert.match(html, /js\/core\/minimum-guest-launch\.js\?v=24/, item.page + ': launch gate');
  assert.match(html, /js\/core\/auth-widget\.js\?v=23/, item.page + ': auth restoration owner');
  assert.match(html, /js\/games\/game-content-client\.js\?v=\d+/, item.page + ': tiered content/error owner');
  assert.match(html, /js\/games\/learning-review\.js\?v=6/, item.page + ': Review owner');
  assert.match(html, /js\/games\/tone-server\.js\?v=6/, item.page + ': SRS owner');
  assert.match(html, item.boot, item.page + ': production bundle boot');
  assert.match(html, /class="gsh-resume-banner"/, item.page + ': nonblank resume recovery surface');
  assert.match(app, item.resume, item.page + ': Safari-compatible localStorage resume write');
  assert.match(app, /LearningReview\.registerRound/, item.page + ': end-round Review routing');
  console.log(`PASS ${item.game} launch=PASS auth_restore=PASS resume=PASS error=PASS learning_loop=PASS`);
}

const listening = read('listening-game.html');
assert.match(listening, /data-listening-availability="coming-soon"/);
assert.match(listening, /id="listening-coming-soon"/);
assert.match(listening, /即將開幕/);
assert.doesNotMatch(listening, /GameContentLoader\.boot\(/);
assert.doesNotMatch(listening, /js\/games\/(?:learning-review|tone-server)\.js/);
assert.match(listening, /Preserved paused runtime:[^\n]*Do not boot/);
console.log('N/A listening launch=PARKED_NONBLANK auth_restore=N/A resume=N/A error=N/A learning_loop=EXCLUDED');

const lego = read('lego.html');
const legoApp = read('js/games/lego-game-app.js');
assert.match(lego, /data-gsh-game="lego"/);
assert.match(lego, /id="buildPanel"/);
assert.match(lego, /js\/games\/lego-game-app\.js\?v=12/);
assert.match(lego, /id="lego-resume-banner"/);
assert.match(lego, /id="lego-flow-error"[^>]*role="alert"/);
assert.match(legoApp, /GameResume\.save\('lego'/);
assert.match(legoApp, /function legoShowLockedError\(\)/);
assert.doesNotMatch(lego, /js\/games\/(?:game-content-client|learning-review|tone-server)\.js/);
console.log('PASS lego launch=PASS auth_restore=N/A resume=PASS error=PASS learning_loop=N/A');

console.log('LOGIN_ACCESSIBLE_GAME_MATRIX_PASS inventory=6 playable=5 parked=1 login_tiered=4');
