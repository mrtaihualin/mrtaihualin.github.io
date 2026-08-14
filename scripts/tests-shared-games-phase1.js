#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const games = [
  { id: 'tone', html: 'tone-finder.html', app: 'js/games/tone-finder-game.js', howto: 'tf-howto-modal', resume: 'tf-resume-banner' },
  { id: 'reading', html: 'reading-game.html', app: 'js/games/reading-game-app.js', howto: 'rg-howto-modal', resume: 'rg-resume-banner' },
  { id: 'listening', html: 'listening-game.html', app: 'js/games/listening-game-app.js', howto: 'lg-howto-modal', resume: 'lg-resume-banner' },
  { id: 'typing', html: 'typing-game.html', app: 'js/games/typing-game-app.js', howto: 'rg-howto-modal', resume: 'tg-resume-banner' },
  { id: 'wordorder', html: 'word-order.html', app: 'js/games/word-order-app.js', howto: 'wo-howto-modal', resume: 'wo-resume-banner' },
].map((g) => ({
  ...g,
  htmlText: fs.readFileSync(path.join(root, g.html), 'utf8'),
  appText: fs.readFileSync(path.join(root, g.app), 'utf8'),
}));

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log(`✓ ${name}`);
}

test('all five games use one shared-width shell and one auth slot', () => {
  for (const g of games) {
    assert.match(g.htmlText, /gsh-shell/, `${g.id}: ไม่มี shared shell`);
    assert.strictEqual((g.htmlText.match(/id="rg-login-slot"/g) || []).length, 1, `${g.id}: auth slot ต้องมีจุดเดียว`);
  }
});

test('all five games expose a persistent 玩法 replay path', () => {
  for (const g of games) {
    assert.match(g.htmlText, new RegExp(`id="${g.howto}"`), `${g.id}: ไม่มี howto modal`);
    assert.match(g.htmlText, /📖 玩法/, `${g.id}: ไม่มีปุ่ม 玩法`);
  }
});

test('all five games expose the shared cross-game switcher', () => {
  for (const g of games) {
    assert.match(g.htmlText, /id="game-switcher"[^>]+data-current=/, `${g.id}: ไม่มี game switcher`);
    assert.match(g.htmlText, /js\/games\/game-switcher\.js\?v=/, `${g.id}: ไม่ได้โหลด shared switcher`);
  }
});

test('all five games provide recoverable round resume UI', () => {
  for (const g of games) {
    assert.match(g.htmlText, new RegExp(`id="${g.resume}"`), `${g.id}: ไม่มี resume banner`);
    assert.match(g.htmlText + g.appText, /GameResume/, `${g.id}: ไม่มี resume storage wiring`);
  }
});

test('all five games provide read-only mistake review after a round', () => {
  for (const g of games) {
    assert.match(g.htmlText + g.appText, /查看錯題|錯題複習|答錯的題目|打錯的字/, `${g.id}: ไม่มี mistake review`);
  }
});

test('first-time help is persistent for four mature games and explicit on Listening start', () => {
  for (const g of games.filter((x) => x.id !== 'listening')) {
    assert.match(g.htmlText, new RegExp(`howto_tour_seen_${g.id}`), `${g.id}: ไม่มี first-time persistence`);
    assert.match(g.htmlText, /GT_TOUR_STEPS/, `${g.id}: ไม่มี guided steps`);
  }
  const listening = games.find((g) => g.id === 'listening').htmlText;
  assert.match(listening, /id="lg-start"/);
  assert.match(listening, /聽力練習：這樣玩/);
});

test('all five game pages declare mobile viewport and responsive CSS', () => {
  for (const g of games) {
    assert.match(g.htmlText, /<meta name="viewport"[^>]+width=device-width/);
    assert.match(g.htmlText, /@media\s*\(max-width:/);
  }
});

test('Typing has native mobile input while Listening typed mode is keyboard-focusable', () => {
  const typing = games.find((g) => g.id === 'typing').htmlText;
  const listening = games.find((g) => g.id === 'listening').htmlText;
  assert.match(typing, /id="rg-mobile-input"[^>]+inputmode="text"/);
  assert.match(listening, /id="lg-type-input"[^>]+autocomplete="off"/);
  assert.match(games.find((g) => g.id === 'listening').appText, /typeInput\.focus/);
});

console.log(`\n${passed} shared Phase 1 game-system tests passed.`);
