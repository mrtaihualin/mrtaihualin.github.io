#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const file = (name) => fs.readFileSync(path.join(root, name), 'utf8');
const catalogText = file('data/approved-vocabulary-catalog.json');
const lockText = file('data/approved-vocabulary-catalog.lock.json');
const approvedHistoryText = file('data/history/vocabulary/2026-09-03-pre-free-200/approved-surplus-189.json');
const unreviewedHistoryText = file('data/history/vocabulary/2026-09-03-pre-free-200/unreviewed-surplus-64.json');
const catalog = JSON.parse(catalogText);
const checkerSource = file('scripts/check-approved-vocabulary-catalog.js');
const { validateCatalog, validateLockedTexts } = require('./check-approved-vocabulary-catalog.js');

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function rejects(label, mutate, pattern) {
  const candidate = clone(catalog); mutate(candidate);
  assert.throws(() => validateCatalog(candidate), pattern, label);
}

assert.strictEqual(validateCatalog(catalog), true);
assert.strictEqual(validateLockedTexts(catalogText, lockText, approvedHistoryText, unreviewedHistoryText), true);
assert.doesNotMatch(checkerSource, /writeFile|appendFile|renameSync|unlinkSync/, 'checker must remain read-only');

const changedMeaning = clone(catalog); changedMeaning.records[0].zhTW = '猜測';
assert.throws(() => validateLockedTexts(`${JSON.stringify(changedMeaning, null, 2)}\n`, lockText, approvedHistoryText, unreviewedHistoryText), /STOP_AND_REPORT_TO_LIN/);
rejects('record deletion fails closed', (value) => { value.records.pop(); }, /200|contain/i);
rejects('runtime deactivation fails closed', (value) => { value.runtimeConsumption = 'not-authorized'; }, /authorized/i);
rejects('Paid injection fails closed', (value) => {
  const row = clone(value.records[0]); row.contentKey += '#paid'; value.records.push(row); value.approvedRecordCount++;
}, /200|contain/i);
rejects('tier duplication fails closed', (value) => {
  value.tierAllocation.guestFree['初'][0] = value.tierAllocation.guestFree['初'][1];
}, /unique/i);
rejects('month subcategory removal fails closed', (value) => { delete value.subcategoryByContentKey['พฤษภาคม@中#month']; }, /12/);

const changedHistory = JSON.parse(approvedHistoryText); changedHistory.records[0].zhTW = 'เปลี่ยน';
assert.throws(() => validateLockedTexts(catalogText, lockText, `${JSON.stringify(changedHistory, null, 2)}\n`, unreviewedHistoryText), /STOP_AND_REPORT_TO_LIN/);

console.log('✅ Canonical Free 200 immutability and history tests PASS');
