#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'js/games/round-report.js'), 'utf8');

const storage = new Map();
const context = {
  console,
  Uint8Array,
  Date,
  Math,
  JSON,
  Intl,
  localStorage: {
    getItem: key => storage.has(key) ? storage.get(key) : null,
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: key => storage.delete(key)
  }
};
context.window = context;
context.globalThis = context;
vm.runInNewContext(source, context, { filename: 'round-report.js' });
const RR = context.RoundReport;

const report = RR.create({ game_type: 'wordorder', difficulty: '高', mode: 'sentence' });
assert.match(report.round_id, /^[0-9a-f-]{36}$/i);
const firstRoundId = report.round_id;
const restored = RR.restore(RR.snapshot(report));
assert.strictEqual(restored.round_id, firstRoundId, 'resume must preserve round UUID');

RR.addItem(report, {
  content_ref: { source: 'game_sentences', key: 'ผมกินข้าว' },
  question: 'ผมกินข้าว', meaning: '我吃飯',
  attempts: [
    { answer: 'กิน ผม ข้าว', is_correct: false },
    { answer: 'ผม กิน ข้าว', is_correct: true }
  ],
  correct_answer: 'ผม กิน ข้าว', is_correct: true, wrong_count: 1, item_score: 10,
  words: [{ th: 'ผม', zh: '我' }, { th: 'กิน', zh: '吃' }, { th: 'ข้าว', zh: '飯' }]
});
RR.finish(report, { score: 10, submission_id: null });
assert.strictEqual(report.items[0].user_answer, 'ผม กิน ข้าว');
assert.strictEqual(report.items[0].item_id, null);
assert.strictEqual(report.items[0].content_version, null);
assert.deepStrictEqual(JSON.parse(JSON.stringify(report.items[0].words)), [{ th: 'ผม', zh: '我' }, { th: 'กิน', zh: '吃' }, { th: 'ข้าว', zh: '飯' }]);
assert.strictEqual(RR.validate(report).ok, true);

const unsafe = RR.snapshot(report);
unsafe.items[0].raw_keystrokes = ['x'];
assert.strictEqual(RR.validate(unsafe).ok, false, 'raw keystrokes must be rejected');

const drafts = RR.toPracticeEventDraft(report);
assert.strictEqual(drafts[0].session_id, firstRoundId);
assert.strictEqual(drafts[0].item_id, null);
assert.deepStrictEqual(JSON.parse(JSON.stringify(drafts[0].content_ref)), { source: 'game_sentences', key: 'ผมกินข้าว' });
assert.doesNotMatch(source, /\bfetch\s*\(|\.invoke\s*\(|\.from\s*\(|service[_-]?role/i, 'DTO/Phase 1.5 adapter must have no network or database writer');

RR.setLoginSummary(report, {
  progress: { sessions: 2, last_at: '2026-08-16' },
  srs: { new_count: 1, day1_count: 2, day7_count: 3 },
  review_needed: 4, mastered: 5, resume: { available: false }
});
const loginHtml = RR.loginSectionsHtml(report);
for (const label of ['Progress', 'SRS', 'Review Needed', 'Mastered', 'Resume']) assert.match(loginHtml, new RegExp(label));

const dailyRound = RR.create({ game_type: 'reading', difficulty: '初', mode: 'phonics' });
RR.addItem(dailyRound, {
  content_ref: { source: 'game_words', key: 'กา@1' }, question: 'กา', meaning: '烏鴉',
  attempts: [{ answer: 'กา', is_correct: true }], correct_answer: 'กา', is_correct: true, item_score: 10
});
RR.finish(dailyRound, { score: 10 });
RR.finish(dailyRound, { score: 10 });
assert.strictEqual(RR.dailyActivity('reading'), 1, 'daily activity must count one finished round only once');
assert.strictEqual(RR.dailyActivityText('reading'), '今日拼讀：1 字');

const listening = RR.create({ game_type: 'listening', difficulty: '初', mode: 'mc' });
RR.addItem(listening, {
  content_ref: { source: 'game_words', key: 'กิน@1' }, question: '<กิน>', meaning: '吃',
  attempts: [{ answer: 'กิน', is_correct: true, mode: 'mc' }], correct_answer: 'กิน', is_correct: true,
  item_score: 8, listen_count: 1, linguistic: { answer_mode: 'mc', listening_score: 8, typing_score: 0 }
});
RR.addItem(listening, {
  content_ref: { source: 'game_words', key: 'นอน@1' }, question: 'นอน', meaning: '睡覺',
  attempts: [{ answer: 'นอน', is_correct: true, mode: 'type' }], correct_answer: 'นอน', is_correct: true,
  item_score: 12, listen_count: 2, linguistic: { answer_mode: 'type', listening_score: 7, typing_score: 5 }
});
RR.finish(listening, { score: 20 });
const printHtml = RR.printDocument({ gameType: 'listening', report: listening, title: '泰語聽力練習・本輪報告', groupListeningModes: true });
assert.match(printHtml, /<html lang="zh-TW">/);
assert.match(printHtml, /@page\{size:A4 portrait/);
assert.ok(printHtml.indexOf('data-print-section="summary"') < printHtml.indexOf('data-print-section="activity"'));
assert.ok(printHtml.indexOf('data-print-section="activity"') < printHtml.indexOf('data-print-section="detail"'));
assert.match(printHtml, /選擇答案/);
assert.match(printHtml, /輸入答案/);
assert.match(printHtml, /聽力分數：7・Typing 分數：5/);
assert.doesNotMatch(printHtml, /<กิน>/, 'print content must be escaped');
assert.match(printHtml, /&lt;กิน&gt;/);
assert.doesNotMatch(source, /html2canvas|jsPDF|download\s*=|createObjectURL/, 'shared Phase 1.2 print path must remain browser Print only');

// Guest current-round lifecycle: only the active snapshot is kept, then explicitly expired.
context.localStorage.setItem('gsh_resume_test', JSON.stringify(RR.snapshot(report)));
assert.strictEqual(JSON.parse(context.localStorage.getItem('gsh_resume_test')).round_id, firstRoundId);
context.localStorage.removeItem('gsh_resume_test');
assert.strictEqual(context.localStorage.getItem('gsh_resume_test'), null);

console.log('Round Report Phase 1: DTO + shared print PASS');
