#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const checkerSource = fs.readFileSync(path.join(root, 'scripts/check-approved-vocabulary-catalog.js'), 'utf8');
const catalogText = fs.readFileSync(path.join(root, 'data/approved-vocabulary-catalog.json'), 'utf8');
const lockText = fs.readFileSync(path.join(root, 'data/approved-vocabulary-catalog.lock.json'), 'utf8');
const catalog = JSON.parse(catalogText);
const { validateCatalog, validateLockedTexts } = require('./check-approved-vocabulary-catalog.js');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function rejects(label, mutate, pattern) {
  const candidate = clone(catalog);
  mutate(candidate);
  assert.throws(() => validateCatalog(candidate), pattern, label);
}

assert.strictEqual(validateCatalog(catalog), true, 'locked catalog must validate');
assert.strictEqual(validateLockedTexts(catalogText, lockText), true, 'locked bytes must validate');
assert.doesNotMatch(checkerSource, /writeFile|appendFile|renameSync|unlinkSync/,
  'integrity checker must remain read-only');

const changedMeaning = clone(catalog);
changedMeaning.records[0].zhTW = '猜測';
assert.throws(() => validateLockedTexts(`${JSON.stringify(changedMeaning, null, 2)}\n`, lockText),
  /STOP_AND_REPORT_TO_LIN/, 'meaning changes must fail the immutable byte receipt');
rejects('record deletion fails closed', (value) => { value.records.pop(); }, /273|count/i);
rejects('runtime activation fails closed', (value) => { value.runtimeConsumption = 'active'; }, /not authorized/i);
rejects('deferred sense injection fails closed', (value) => {
  const row = clone(value.records.find((item) => item.word === 'ตัวเอง'));
  row.contentKey = 'ตัวเอง@初#self';
  row.zhTW = '自己';
  value.records.push(row);
  value.approvedRecordCount++;
  value.reviewSetCounts['pronouns-i-you-he']++;
}, /273|count|deferred/i);

[
  'js/games/game-content-client.js',
  'scripts/migrate-game-content.js',
  'supabase/functions/game-content/index.ts'
].forEach((file) => {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  assert.doesNotMatch(source, /approved-vocabulary-catalog/, `${file}: new catalog must remain inactive before cutover`);
});

console.log('✅ Approved vocabulary catalog immutability/source-only tests PASS');
