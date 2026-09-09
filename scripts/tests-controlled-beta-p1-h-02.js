#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

let passed = 0;
function test(label, fn) {
  fn();
  passed++;
  console.log('✓ ' + label);
}

test('Game Search and Time Auto Plan share one desktop line and matching control geometry', () => {
  const html = read('games.html');
  const ui = read('js/games/games-search-ui.js');
  assert.match(html, /@media\(min-width:960px\)\{\s*\.gh-controls-grid\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(html, /class="gh-controls-grid"[\s\S]{0,300}id="gameSearchGate"[\s\S]{0,500}id="timePlanTitle"/);
  assert.match(html, /\.gh-search-row\{display:grid;grid-template-columns:minmax\(0,1fr\) 138px/);
  assert.match(html, /\.gh-time-input\{display:grid;grid-template-columns:minmax\(0,1fr\) auto/);
  assert.match(html, /class="gh-search-row gh-time-plan-row"[\s\S]{0,420}id="timePlanBtn"/);
  assert.match(ui, /function mountDisabledSearch[\s\S]{0,420}class="gh-search-row"[\s\S]{0,260}class="gh-search-btn" disabled/);
});

test('Learning Center and Vault use the Game Hub width and heading scale', () => {
  const progress = read('my-progress.html');
  const progressRuntime = read('js/score/progress.js');
  const vault = read('vault.html');
  for (const source of [progress, vault]) {
    assert.match(source, /max-width:1080px/);
    assert.match(source, /font-size:clamp\(26px,5vw,38px\)/);
    assert.match(source, /color:#2d2a22/);
  }
  assert.match(progressRuntime, /\.pg-message\{text-align:center;width:100%;max-width:none/);
});

test('Reading alone uses one continuous gold question surface', () => {
  const reading = read('reading-game.html');
  assert.match(reading, /body\[data-gsh-game="reading"\] \.gold-banner \{\s*background:var\(--gold-light,#F3E4C2\);/);
  assert.match(reading, /body\[data-gsh-game="reading"\] #word-ctl-row \{[\s\S]{0,260}background:var\(--gold-light,#F3E4C2\);/);
  assert.match(reading, /\.gold-banner\{[^\n]*background:linear-gradient\(180deg,#EFDDB4 0%,#F8F0DE 100%\)/);
});

test('shared Account Bar keeps the approved order and renders Search inline', () => {
  const auth = read('js/core/auth-widget.js');
  const mobile = read('css/mobile-landscape.css');
  assert.match(auth, /sa-edit[\s\S]{0,140}leaderboardAccountLinkHTML \+[\s\S]{0,260}sa-account-streak-label">連續[\s\S]{0,140}learningAccountLinksHTML \+[\s\S]{0,300}sa-logout[\s\S]{0,220}globalSearchHTML/);
  assert.match(auth, /sa-progress-link[\s\S]{0,260}sa-vault-link/);
  assert.match(auth, /event\.preventDefault\(\);[\s\S]{0,620}GlobalSearchUI\.render\(query, searchResults\)/);
  assert.doesNotMatch(auth, /class="sa-global-search-form" action="index\.html"/);
  assert.match(mobile, /a\[title="進度"\] \{\s*grid-row: 5;[\s\S]{0,360}a\[title="字庫"\] \{\s*grid-row: 6;/);
  assert.match(mobile, /\.sa-account-streak \{[\s\S]{0,120}grid-row: 4;[\s\S]{0,620}content: '🔥 連續';[\s\S]{0,500}\.sa-global-search-toggle \{\s*grid-row: 8;/);
});

test('Game Hub exposes the required visible Tone Leaderboard card', () => {
  const html = read('games.html');
  assert.match(html, /class="gh-main-card" href="leaderboard\.html"[\s\S]{0,360}<div class="gh-main-title">聲調排行榜<\/div>/);
});

console.log(`PASS ${passed} Controlled Beta P1-H-02 regression contracts`);
