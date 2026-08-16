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

// Guest current-round lifecycle: only the active snapshot is kept, then explicitly expired.
context.localStorage.setItem('gsh_resume_test', JSON.stringify(RR.snapshot(report)));
assert.strictEqual(JSON.parse(context.localStorage.getItem('gsh_resume_test')).round_id, firstRoundId);
context.localStorage.removeItem('gsh_resume_test');
assert.strictEqual(context.localStorage.getItem('gsh_resume_test'), null);

console.log('Round Report Phase 1: 12/12 PASS');
