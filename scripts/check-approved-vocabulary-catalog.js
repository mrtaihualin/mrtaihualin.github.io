#!/usr/bin/env node
'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const catalogPath = path.join(root, 'data/approved-vocabulary-catalog.json');
const lockPath = path.join(root, 'data/approved-vocabulary-catalog.lock.json');
const EXPECTED_LOCK_SHA256 = '0960da09a44bbb050e781dd89cd4b0dbab4c0d47a9caf82b4e9b15dfc35981e6';
const EXPECTED_COUNTS = Object.freeze({
  'verbs-225-final-notes': 225,
  'pronouns-i-you-he': 15,
  'numbers-18': 18,
  'colors-15': 15
});
const RECORD_KEYS = [
  'contentKey', 'reviewSet', 'word', 'spellingTH', 'readingTH', 'roman', 'zhTW',
  'level', 'type', 'category', 'audioStatus', 'approvalRefs', 'syllables'
].sort();
const SYLLABLE_KEYS = [
  'roman', 'lead', 'consonant', 'cluster', 'vowel', 'writtenFinal', 'toneMark',
  'toneNumber', 'toneName', 'liveDead', 'consonantReadDifference',
  'finalReadDifference', 'silent'
].sort();
const TONE_NAMES = Object.freeze({ 1: 'สามัญ', 2: 'เอก', 3: 'โท', 4: 'ตรี', 5: 'จัตวา' });

function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function exactKeys(value, expected, label) {
  assert.deepStrictEqual(Object.keys(value).sort(), expected, `${label}: field set changed`);
}

function nonEmptyString(value, label) {
  assert.strictEqual(typeof value, 'string', `${label}: must be a string`);
  assert.ok(value.length > 0, `${label}: must not be blank`);
}

function find(records, word, zhTW) {
  return records.filter((row) => row.word === word && row.zhTW === zhTW);
}

function validateCatalog(catalog) {
  assert.strictEqual(catalog.schemaVersion, 1, 'schemaVersion changed');
  assert.strictEqual(catalog.catalogId, 'lin-approved-vocabulary-master', 'catalogId changed');
  assert.strictEqual(catalog.authority, 'Lin', 'authority must remain Lin');
  assert.strictEqual(catalog.state, 'source-only-inactive', 'catalog must remain Source-only and inactive');
  assert.strictEqual(catalog.runtimeConsumption, 'not-authorized', 'runtime consumption is not authorized');
  assert.strictEqual(catalog.productionMutation, 'not-authorized', 'Production mutation is not authorized');
  assert.strictEqual(catalog.notificationContract, 'deferred-until-catalog-complete', 'notification contract is still deferred');
  assert.deepStrictEqual(catalog.reviewSetCounts, EXPECTED_COUNTS, 'locked review-set counts changed');
  assert.strictEqual(catalog.approvedRecordCount, 273, 'approved record count changed');
  assert.ok(Array.isArray(catalog.records), 'records must be an array');
  assert.strictEqual(catalog.records.length, 273, 'catalog must contain exactly 273 approved records');

  const keys = new Set();
  const actualCounts = {};
  catalog.records.forEach((row, recordIndex) => {
    const label = `record[${recordIndex}]`;
    exactKeys(row, RECORD_KEYS, label);
    ['contentKey','reviewSet','word','spellingTH','readingTH','roman','zhTW','level','type','category','audioStatus']
      .forEach((field) => nonEmptyString(row[field], `${label}.${field}`));
    assert.ok(!keys.has(row.contentKey), `${label}: duplicate contentKey ${row.contentKey}`);
    keys.add(row.contentKey);
    assert.ok(Object.prototype.hasOwnProperty.call(EXPECTED_COUNTS, row.reviewSet), `${label}: unapproved review set`);
    actualCounts[row.reviewSet] = (actualCounts[row.reviewSet] || 0) + 1;
    assert.ok(Array.isArray(row.approvalRefs) && row.approvalRefs.length > 0, `${label}: approvalRefs required`);
    row.approvalRefs.forEach((ref, index) => nonEmptyString(ref, `${label}.approvalRefs[${index}]`));
    assert.ok(Array.isArray(row.syllables) && row.syllables.length > 0, `${label}: syllables required`);

    const written = row.spellingTH.split('-');
    const reading = row.readingTH.split('-');
    const roman = row.roman.split('-');
    assert.strictEqual(written.length, row.syllables.length, `${label}: written syllable count mismatch`);
    assert.strictEqual(reading.length, row.syllables.length, `${label}: Thai reading syllable count mismatch`);
    assert.strictEqual(roman.length, row.syllables.length, `${label}: roman syllable count mismatch`);
    assert.strictEqual(written.join(''), row.word, `${label}: written syllables do not join to word`);

    row.syllables.forEach((part, syllableIndex) => {
      const partLabel = `${label}.syllables[${syllableIndex}]`;
      exactKeys(part, SYLLABLE_KEYS, partLabel);
      SYLLABLE_KEYS.filter((field) => field !== 'toneNumber')
        .forEach((field) => nonEmptyString(part[field], `${partLabel}.${field}`));
      assert.ok(Number.isInteger(part.toneNumber) && part.toneNumber >= 1 && part.toneNumber <= 5,
        `${partLabel}: toneNumber must be 1-5`);
      assert.strictEqual(part.toneName, TONE_NAMES[part.toneNumber], `${partLabel}: tone name/number mismatch`);
      assert.ok(part.liveDead === '活音' || part.liveDead === '死音', `${partLabel}: liveDead changed`);
      assert.strictEqual(part.roman, roman[syllableIndex], `${partLabel}: roman syllable differs from record roman`);
    });
  });
  assert.deepStrictEqual(actualCounts, EXPECTED_COUNTS, 'record counts do not match locked review sets');

  const records = catalog.records;
  assert.strictEqual(find(records, 'ตัวเอง', '你（可愛/情侶）').length, 1, 'approved ตัวเอง pronoun sense missing');
  assert.strictEqual(find(records, 'ตัวเอง', '自己').length, 0, 'deferred ตัวเอง=自己 must not enter this catalog');
  assert.strictEqual(find(records, 'เขา', '他').length, 1, 'approved เขา=他 sense missing');
  assert.strictEqual(find(records, 'เขา', '山').length, 0, 'unreviewed เขา=山 must not enter this catalog');
  assert.strictEqual(find(records, 'มัน', '他（不禮貌）').length, 1, 'approved มัน pronoun sense missing');
  assert.strictEqual(find(records, 'เงิน', '銀色').length, 1, 'approved silver sense missing');
  assert.strictEqual(find(records, 'เงิน', '錢').length, 0, 'money sense must remain separate and outside this review set');
  assert.strictEqual(records.filter((row) => row.reviewSet === 'colors-15' && row.word === 'เขียว').length, 0,
    'standalone green is excluded from the approved color set');

  return true;
}

function validateLockedTexts(catalogText, lockText) {
  assert.strictEqual(sha256(lockText), EXPECTED_LOCK_SHA256,
    'STOP_AND_REPORT_TO_LIN: catalog lock changed without the locked checker receipt');
  const lock = JSON.parse(lockText);
  assert.strictEqual(sha256(catalogText), lock.catalogSha256,
    'STOP_AND_REPORT_TO_LIN: approved catalog bytes changed; no automatic repair is allowed');
  assert.strictEqual(lock.lockedBy, 'Lin', 'catalog lock owner changed');
  assert.strictEqual(lock.approvedRecordCount, 273, 'lock record count changed');
  assert.deepStrictEqual(lock.reviewSetCounts, EXPECTED_COUNTS, 'lock review-set counts changed');
  validateCatalog(JSON.parse(catalogText));
  return true;
}

function main() {
  const catalogText = fs.readFileSync(catalogPath, 'utf8');
  const lockText = fs.readFileSync(lockPath, 'utf8');
  validateLockedTexts(catalogText, lockText);
  console.log('✅ Lin-approved vocabulary catalog PASS: 273 records; read-only integrity check; Source-only inactive');
}

if (require.main === module) main();

module.exports = { validateCatalog, validateLockedTexts, sha256, EXPECTED_COUNTS };
