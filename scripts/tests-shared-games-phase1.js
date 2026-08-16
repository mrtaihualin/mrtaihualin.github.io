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

test('all five games load and persist one current-round DTO identity', () => {
  for (const g of games) {
    assert.match(g.htmlText, /js\/games\/round-report\.js\?v=1/, `${g.id}: missing Round Report DTO loader`);
    assert.match(g.htmlText, /js\/score\/learning-summary\.js\?v=1/, `${g.id}: missing Login summary loader`);
    assert.match(g.appText, /RoundReport\.(?:create|restore)/, `${g.id}: round identity is not wired`);
    assert.match(g.appText, /report:/, `${g.id}: active GameResume must carry the report snapshot`);
  }
});

test('all five games provide read-only mistake review after a round', () => {
  for (const g of games) {
    assert.match(g.htmlText + g.appText, /查看錯題|錯題複習|答錯的題目|打錯的字/, `${g.id}: ไม่มี mistake review`);
  }
});

test('Guest/Login Free reports contain facts only and no personalized analysis or recommendation', () => {
  function block(text, start, end) {
    const from = text.indexOf(start);
    const to = text.indexOf(end, from + start.length);
    assert.ok(from >= 0 && to > from, `หา report block ${start} ไม่พบ`);
    return text.slice(from, to);
  }
  const reportBlocks = [
    ['tone', games.find((g) => g.id === 'tone').appText, 'function buildReportInner()', 'function buildReportHTML()'],
    ['reading', games.find((g) => g.id === 'reading').appText, 'function rgDownloadReport()', '// ── กฎ15:'],
    ['listening', games.find((g) => g.id === 'listening').appText, 'function printListeningReport()', 'function restart()'],
    ['typing', games.find((g) => g.id === 'typing').appText, 'function rgDownloadReport()', 'function trackBookCTA()'],
    ['wordorder', games.find((g) => g.id === 'wordorder').appText, 'window.woDownloadReport = function()', '// Lin 2026-08-02:'],
  ];
  for (const [id, text, start, end] of reportBlocks) {
    const report = block(text, start, end);
    assert.doesNotMatch(report, /弱點分析|個人化|建議|需要加強|最不穩|analysisLines|weakHtml/, `${id}: report มี analysis/recommendation`);
    assert.match(report, /作答|你的答案/, `${id}: report ต้องคงคำตอบผู้เรียน`);
    assert.match(report, /正解|正確答案/, `${id}: report ต้องคงคำตอบที่ถูก`);
    assert.doesNotMatch(report, /未登入/, `${id}: Guest report ต้องไม่แสดงช่อง entitlement ของ Login`);
  }
  for (const id of ['tone', 'reading', 'listening', 'typing', 'wordorder']) {
    const row = reportBlocks.find((entry) => entry[0] === id);
    const report = block(row[1], row[2], row[3]);
    assert.match(report, /loggedIn[\s\S]*(?:下次複習|複習狀態)/, `${id}: Login report ต้องเพิ่ม SRS เดิมแบบอัตโนมัติ`);
  }
  for (const id of ['reading', 'typing', 'wordorder']) {
    const row = reportBlocks.find((entry) => entry[0] === id);
    const report = block(row[1], row[2], row[3]);
    assert.match(report, /wordGlosses[\s\S]*逐字/, `${id}: sentence report ต้องใช้คำแยกและคำแปลรายคำจาก structured data เดิม`);
  }
  const toneSummary = block(
    games.find((g) => g.id === 'tone').appText,
    'function stepSessionSummary()',
    'function stepMistakeReview()'
  );
  assert.doesNotMatch(toneSummary, /tf-sum-analysis|analysisLines|需要加強|需要再複習|建議/, 'Tone Result มี personalized analysis/recommendation');
  const toneStats = block(
    games.find((g) => g.id === 'tone').appText,
    'function showStats()',
    'function clearTodayStats()'
  );
  const toneStatsDownload = block(
    games.find((g) => g.id === 'tone').appText,
    'function buildStatsReportText(',
    'function downloadStats()'
  );
  assert.doesNotMatch(toneStats + toneStatsDownload, /最常選錯|今日課程重點|LESSON_TIPS/, 'Tone Login history must not infer weaknesses or recommendations');
  for (const g of games) {
    assert.doesNotMatch(g.htmlText, /「弱點分析」/, `${g.id}: help ยังอ้าง personalized report section`);
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

test('Tone help layers own Escape and exit without leaking the key to page shortcuts', () => {
  const tone = games.find((g) => g.id === 'tone').htmlText;
  assert.match(tone, /e\.key!==['"]Escape['"]/);
  assert.match(tone, /howto&&howto\.style\.display!==['"]none['"][\s\S]{0,300}e\.stopImmediatePropagation\(\)[\s\S]{0,300}howto\.style\.display=['"]none['"]/);
  assert.match(tone, /e\.stopImmediatePropagation\(\)[\s\S]{0,80}gtTourEnd\(\)/);
});

test('all five replayable help modals close on Escape and restore focus to their opener', () => {
  const handles = {
    tone: '__tfHowtoModalReg',
    reading: '__rgHowtoModalReg',
    listening: '__lgHowtoModalReg',
    typing: '__tgHowtoModalReg',
    wordorder: '__woHowtoModalReg',
  };
  for (const g of games) {
    assert.match(g.htmlText + g.appText, new RegExp(`window\\.${handles[g.id]}\\s*=\\s*window\\.registerGameModal`), `${g.id}: help modal is not registered`);
    assert.match(g.htmlText, new RegExp(`${handles[g.id]}\\)window\\.${handles[g.id]}\\.notifyOpen\\(this\\)`), `${g.id}: opener does not register focus return`);
  }
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
