#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const failures = [];
let passed = 0;

function read(relative) {
  return fs.readFileSync(path.join(root, relative), 'utf8');
}

function check(condition, label) {
  if (condition) {
    passed++;
    console.log(`✓ ${label}`);
  } else {
    failures.push(label);
  }
}

const page = read('games-challenge.html');
const board = read('mix-board.html');
const hub = read('games.html');
const switcher = read('js/games/game-switcher.js');
const search = read('data/search-index.js');
const searchEdge = read('supabase/functions/search-gemini/index.ts');
const toneRound = read('supabase/functions/tone-round/index.ts');
const reward = read('supabase/functions/game-reward/index.ts');
const readingAuth = read('js/games/reading-auth.js');

check(/data-phase1-access="paid-only"/.test(page), 'direct Challenge URL renders the Paid-only gate');
check(/id="phase1-challenge-legacy" hidden inert aria-hidden="true"/.test(page), 'legacy Challenge UI is inaccessible');
check(!/<script[^>]+games-challenge-app\.js/i.test(page), 'Challenge gameplay bundle is not loaded');
check(!/GameContentLoader\.boot\s*\(/.test(page), 'Challenge content boot cannot run');
check(!/<div id="game-switcher"/.test(page), 'locked Challenge page exposes no game switcher');

check(/data-phase1-access="no-challenge-leaderboard"/.test(board), 'direct legacy board URL renders recovery state');
check(!/reading-leaderboard\.js/.test(board), 'legacy Challenge leaderboard runtime is not loaded');
check(!/window\.READING_BOARD_GAME\s*=\s*['"]challenge/.test(board), 'legacy board does not request Challenge scores');

check(!/href=["']games-challenge\.html["']/.test(switcher), 'Free game switcher exposes no Challenge link');
check(!/id:\s*['"]game-challenge['"]/.test(search), 'local Search index excludes Challenge');
check(!/["']id["']:\s*["']game-challenge["']/.test(searchEdge), 'Search Edge whitelist excludes Challenge');
check(!/\[[^\]]*["']challenge["'][^\]]*\]\.includes\(game\)/.test(toneRound), 'tone-round rejects Challenge state writes');
check(!/VALID_GAMES\s*=\s*\[[^\]]*["']challenge["']/.test(reward), 'game-reward rejects Challenge activity');
check(/if \(game === 'challenge' \|\| pageGame\(\) === 'challenge'\) return null;/.test(readingAuth), 'client score save fails closed for Challenge');
check(/aria-disabled="true"[^>]*aria-label="綜合挑戰 — 付費功能，尚未開放"/.test(hub), 'Games hub shows Challenge as disabled Paid-only');
check(!/<a[^>]+href=["']games-challenge\.html["'][^>]*class="gh-main-card"/.test(hub), 'Games hub has no playable Challenge card');

if (failures.length) {
  console.error(`\nChallenge gate tests failed (${failures.length})`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(`\n✅ Phase 1 Challenge gate passed (${passed} checks)`);
