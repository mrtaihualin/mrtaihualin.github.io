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
  learning_evidence: { hintCount: 1 },
  words: [{ th: 'ผม', zh: '我' }, { th: 'กิน', zh: '吃' }, { th: 'ข้าว', zh: '飯' }]
});
RR.finish(report, { score: 10, submission_id: null });
assert.strictEqual(report.items[0].user_answer, 'ผม กิน ข้าว');
assert.strictEqual(report.items[0].item_id, null);
assert.strictEqual(report.items[0].content_version, null);
assert.deepStrictEqual(JSON.parse(JSON.stringify(report.items[0].learning_evidence)), { hintCount: 1 });
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

const skippedRound = RR.create({ game_type: 'tone', difficulty: '初', mode: 'tone' });
RR.addItem(skippedRound, {
  content_ref: { source: 'game_words', key: 'มา@1' }, question: 'มา', meaning: '來',
  attempts: [], is_correct: false, is_skipped: true, skip_reason: 'user_skip',
  wrong_count: 0, item_score: 0
});
RR.finish(skippedRound, { score: 0 });
assert.strictEqual(skippedRound.correct_count, 0);
assert.strictEqual(skippedRound.wrong_count, 0, 'neutral Skip must not count as wrong');
assert.strictEqual(RR.toPracticeEventDraft(skippedRound)[0].result, 'skipped');
assert.match(RR.printDocument({ gameType: 'tone', report: skippedRound }), /跳過/);

const toneCleanTeaching = RR.create({ game_type: 'tone', difficulty: '初', mode: 'tone' });
RR.addItem(toneCleanTeaching, {
  content_ref: { source: 'game_words', key: 'ขา@1' }, question: 'ขา', meaning: '腿',
  attempts: [
    { answer: '第一聲', is_correct: false },
    { answer: '第五聲', is_correct: true }
  ],
  correct_answer: '第五聲', is_correct: true, wrong_count: 0, item_score: 10, hint_used: false
});
const toneCleanPrint = RR.printDocument({ gameType: 'tone', report: toneCleanTeaching });
assert.match(toneCleanPrint, /首次答對<\/span><strong>1 \/ 1<\/strong>/, 'Tone clean teaching must count as Clean in print summary');
assert.match(RR.printDocument({ gameType: 'reading', report: toneCleanTeaching }), /首次答對<\/span><strong>1 \/ 1<\/strong>/, 'report identity must prevent config from downgrading Tone Clean');

const tonePerfectTeaching = RR.create({ game_type: 'tone', difficulty: '初', mode: 'tone' });
for (let index = 1; index <= 5; index += 1) {
  RR.addItem(tonePerfectTeaching, {
    content_ref: { source: 'game_words', key: `tone-clean-${index}@初` }, question: `คำ${index}`, meaning: '合成測試',
    attempts: [
      { answer: '不確定', is_correct: false },
      { answer: '正確聲調', is_correct: true }
    ],
    correct_answer: '正確聲調', is_correct: true, wrong_count: 0, item_score: 10, hint_used: false
  });
}
assert.match(RR.printDocument({ gameType: 'tone', report: tonePerfectTeaching }), /首次答對<\/span><strong>5 \/ 5<\/strong>/, 'five clean Tone teaching paths must remain Perfect in print summary');

const toneNotClean = RR.create({ game_type: 'tone', difficulty: '初', mode: 'tone' });
RR.addItem(toneNotClean, {
  content_ref: { source: 'game_words', key: 'tone-wrong@初' }, question: 'ผิดจริง', meaning: '合成測試',
  attempts: [{ answer: '錯誤步驟', is_correct: false }, { answer: '正確聲調', is_correct: true }],
  correct_answer: '正確聲調', is_correct: true, wrong_count: 1, item_score: 7, hint_used: false
});
RR.addItem(toneNotClean, {
  content_ref: { source: 'game_words', key: 'tone-hint@初' }, question: '提示', meaning: '合成測試',
  attempts: [{ answer: '正確聲調', is_correct: true }], correct_answer: '正確聲調',
  is_correct: false, is_practice: true, wrong_count: 0, item_score: 0, hint_used: true
});
RR.addItem(toneNotClean, {
  content_ref: { source: 'game_words', key: 'tone-skip@初' }, question: '跳過', meaning: '合成測試',
  attempts: [], is_correct: false, is_skipped: true, skip_reason: 'user_skip', wrong_count: 0, item_score: 0
});
assert.match(RR.printDocument({ gameType: 'tone', report: toneNotClean }), /首次答對<\/span><strong>0 \/ 3<\/strong>/, 'real mistakes, Free Practice and Skip must not count as Tone Clean');
RR.finish(toneNotClean, { score: 7 });
assert.strictEqual(toneNotClean.items[1].is_practice, true, 'Free Practice must remain explicit report evidence');
assert.strictEqual(toneNotClean.wrong_count, 0, 'Free Practice must not be counted as a wrong answer');
assert.strictEqual(RR.toPracticeEventDraft(toneNotClean)[1].result, 'practice', 'Free Practice draft must not say incorrect');
const toneNotCleanPrint = RR.printDocument({ gameType: 'tone', report: toneNotClean });
assert.match(toneNotCleanPrint, /純練習/, 'Free Practice print row must use a neutral practice label');
assert.doesNotMatch(toneNotCleanPrint.match(/<tbody>[\s\S]*?<\/tbody>/)[0], />待加強<\/td><\/tr>[\s\S]*?<strong>提示<\//, 'Free Practice print row must not be labelled incorrect');

const contradictoryNeutral = RR.create({ game_type: 'tone', difficulty: '初', mode: 'tone' });
RR.addItem(contradictoryNeutral, {
  content_ref: { source: 'game_words', key: 'tone-practice-contradiction@初' },
  question: '練習優先', meaning: '合成測試', attempts: [], correct_answer: '第五聲',
  is_correct: true, is_practice: true, wrong_count: 0, item_score: 0, hint_used: false
});
RR.addItem(contradictoryNeutral, {
  content_ref: { source: 'game_words', key: 'tone-skip-contradiction@初' },
  question: '跳過優先', meaning: '合成測試', attempts: [], correct_answer: '第五聲',
  is_correct: true, is_practice: false, is_skipped: true, skip_reason: 'user_skip',
  wrong_count: 0, item_score: 0, hint_used: false
});
RR.addItem(contradictoryNeutral, {
  content_ref: { source: 'game_words', key: 'tone-hint-contradiction@初' },
  question: '提示優先', meaning: '合成測試', attempts: [], correct_answer: '第五聲',
  is_correct: true, is_practice: false, is_skipped: false,
  wrong_count: 0, item_score: 0, hint_used: true
});
RR.finish(contradictoryNeutral, { score: 0 });
assert.strictEqual(contradictoryNeutral.correct_count, 0, 'isolated Tone practice/Skip/Hint flags must never count as correct');
assert.strictEqual(contradictoryNeutral.wrong_count, 0, 'isolated Tone practice/Skip/Hint flags must remain neutral');
const contradictoryDrafts = RR.toPracticeEventDraft(contradictoryNeutral);
assert.deepStrictEqual(Array.from(contradictoryDrafts, row => row.is_correct), [false, false, false], 'neutral Tone drafts must normalize contradictory is_correct flags to false');
assert.deepStrictEqual(Array.from(contradictoryDrafts, row => row.result), ['practice', 'skipped', 'practice'], 'neutral draft priority must remain skipped > practice > correct');
const contradictoryPrint = RR.printDocument({ gameType: 'tone', report: contradictoryNeutral });
assert.match(contradictoryPrint, /首次答對<\/span><strong>0 \/ 3<\/strong>/, 'isolated contradictory practice/Skip/Hint must not count as Tone Clean in shared print');
assert.match(contradictoryPrint, /跳過優先[\s\S]{0,500}<td class="rr-status skip">跳過<\/td>/, 'Hint → Skip must keep Skip priority in shared print');

const readingHintedCorrect = RR.create({ game_type: 'reading', difficulty: '初', mode: 'phonics' });
RR.addItem(readingHintedCorrect, {
  content_ref: { source: 'game_words', key: 'reading-hint-semantics@初' }, question: '讀音提示', meaning: '合成測試',
  attempts: [{ answer: '正確', is_correct: true }], correct_answer: '正確', is_correct: true,
  is_practice: false, is_skipped: false, hint_used: true, wrong_count: 0, item_score: 5
});
RR.finish(readingHintedCorrect, { score: 5 });
assert.strictEqual(readingHintedCorrect.correct_count, 1, 'non-Tone hint correctness semantics must remain unchanged');
assert.strictEqual(RR.toPracticeEventDraft(readingHintedCorrect)[0].is_correct, true, 'non-Tone hinted draft must retain its game-owned correctness');

const readingCorrected = RR.create({ game_type: 'reading', difficulty: '初', mode: 'phonics' });
RR.addItem(readingCorrected, {
  content_ref: { source: 'game_words', key: 'ขา@1' }, question: 'ขา', meaning: '腿',
  attempts: [
    { answer: 'คา', is_correct: false },
    { answer: 'ขา', is_correct: true }
  ],
  correct_answer: 'ขา', is_correct: true, wrong_count: 0, item_score: 10, hint_used: false
});
const readingCorrectedPrint = RR.printDocument({ gameType: 'reading', report: readingCorrected });
assert.match(readingCorrectedPrint, /首次答對<\/span><strong>0 \/ 1<\/strong>/, 'other games must retain first-attempt semantics');
assert.match(RR.printDocument({ gameType: 'tone', report: readingCorrected }), /首次答對<\/span><strong>0 \/ 1<\/strong>/, 'config must not upgrade a non-Tone report');

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
