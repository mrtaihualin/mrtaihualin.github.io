#!/usr/bin/env node
'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const catalogPath = path.join(root, 'data/approved-vocabulary-catalog.json');
const lockPath = path.join(root, 'data/approved-vocabulary-catalog.lock.json');
const paidQueuePath = path.join(root, 'data/paid-vocabulary-review-queue.json');
const EXPECTED_LOCK_SHA256 = 'f9735bc037b44e8ca221cffc17ded436e4f406a0cebdf021b5e3d578c68883c3';
const EXPECTED_COUNTS = Object.freeze({
  'verbs-225-final-notes': 225,
  'pronouns-i-you-he': 15,
  'numbers-18': 18,
  'colors-15': 15,
  'weekdays-7': 7,
  'months-12': 12,
  'adjectives-21': 21,
  'nouns-74': 74,
  'checkpoint-verbs-2': 2
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
  assert.strictEqual(catalog.schemaVersion, 2, 'schemaVersion changed');
  assert.strictEqual(catalog.catalogId, 'lin-approved-vocabulary-master', 'catalogId changed');
  assert.strictEqual(catalog.authority, 'Lin', 'authority must remain Lin');
  assert.strictEqual(catalog.state, 'source-only-inactive', 'catalog must remain Source-only and inactive');
  assert.strictEqual(catalog.runtimeConsumption, 'not-authorized', 'runtime consumption is not authorized');
  assert.strictEqual(catalog.productionMutation, 'not-authorized', 'Production mutation is not authorized');
  assert.strictEqual(catalog.notificationContract, 'deferred-until-audio-review-and-cutover', 'notification contract is still deferred');
  assert.strictEqual(catalog.checkpointRef, '04_WORKING/VOCAB_6_3_CURRENT/CHECKPOINT_CURRENT.md', 'checkpoint pointer changed');
  assert.deepStrictEqual(catalog.reviewSetCounts, EXPECTED_COUNTS, 'locked review-set counts changed');
  assert.strictEqual(catalog.approvedRecordCount, 389, 'approved record count changed');
  assert.ok(Array.isArray(catalog.records), 'records must be an array');
  assert.strictEqual(catalog.records.length, 389, 'catalog must contain exactly 389 approved records');

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
  assert.strictEqual(find(records, 'เขา', '山').length, 1, 'approved เขา=山 noun sense missing');
  assert.strictEqual(find(records, 'มัน', '他（不禮貌）').length, 1, 'approved มัน pronoun sense missing');
  assert.strictEqual(find(records, 'เงิน', '銀色').length, 1, 'approved silver sense missing');
  assert.strictEqual(find(records, 'เงิน', '錢').length, 1, 'approved money sense missing');
  assert.strictEqual(records.filter((row) => row.reviewSet === 'colors-15' && row.word === 'เขียว').length, 0,
    'standalone green is excluded from the approved color set');

  assert.strictEqual(find(records, 'นาย', '先生').length, 0, 'นาย was explicitly removed');
  assert.strictEqual(records.filter((row) => row.word === 'ห้องอาหาร').length, 0, 'ห้องอาหาร was explicitly removed');
  assert.strictEqual(records.filter((row) => row.word === 'สัมภาษณ์' && row.type === '動詞').length, 1,
    'สัมภาษณ์ must be the approved verb record');
  assert.strictEqual(records.filter((row) => row.word === 'สัมภาษณ์' && row.type === '名詞').length, 0,
    'สัมภาษณ์ must not remain a noun');
  assert.strictEqual(find(records, 'อุ่น', '暖／溫').length, 1, 'approved warm adjective missing');
  assert.strictEqual(find(records, 'อุ่น', '加熱').length, 1, 'approved heat verb missing');

  const thursday = find(records, 'วันพฤหัสบดี', '星期四')[0];
  assert(thursday, 'approved Thursday missing');
  assert.strictEqual(thursday.spellingTH, 'วัน-พ-ฤ-หัส-บ-ดี');
  assert.strictEqual(thursday.readingTH, 'วัน-พะ-รึ-หัด-สะ-บอ-ดี');
  assert.strictEqual(thursday.roman, 'wan-phá-rʉ́-hàt-sà-bɔɔ-dii');
  ['พฤษภาคม', 'พฤศจิกายน'].forEach((word) => {
    const month = records.find((row) => row.word === word && row.reviewSet === 'months-12');
    assert(month, `${word}: approved month missing`);
    assert.strictEqual(month.syllables[0].cluster, 'ร', `${word}: approved initial cluster changed`);
  });
  const office = records.find((row) => row.word === 'ออฟฟิศ' && row.reviewSet === 'nouns-74');
  assert.strictEqual(office.syllables[0].toneNumber, 4, 'ออฟ must remain tone 4');
  const card = records.find((row) => row.word === 'นามบัตร' && row.reviewSet === 'nouns-74');
  assert.strictEqual(card.syllables[1].writtenFinal, 'ตร', 'บัตร written final changed');
  assert.strictEqual(card.syllables[1].finalReadDifference, 'ตร > ด', 'บัตร final reading changed');

  const tiers = catalog.tierAllocation;
  assert.strictEqual(tiers.state, 'source-only-inactive');
  const guest = tiers.guestFree['初'].concat(tiers.guestFree['中']);
  const login = tiers.loginFreeAdditional['初'].concat(tiers.loginFreeAdditional['中']);
  assert.strictEqual(guest.length, 100, 'Guest Free allocation changed');
  assert.strictEqual(login.length, 100, 'Login Free additional allocation changed');
  assert.strictEqual(tiers.paidApproved.length, 189, 'Paid approved allocation changed');
  const allocation = guest.concat(login, tiers.paidApproved);
  assert.strictEqual(new Set(allocation).size, 389, 'tier allocation must be a unique full partition');
  assert.deepStrictEqual(new Set(allocation), new Set(records.map((row) => row.contentKey)),
    'tier allocation must cover every approved record');
  ['guestFree', 'loginFreeAdditional'].forEach((tier) => ['初', '中'].forEach((level) => {
    assert.strictEqual(tiers[tier][level].length, 50, `${tier}.${level} count changed`);
    tiers[tier][level].forEach((key) => assert.strictEqual(records.find((row) => row.contentKey === key).level, level,
      `${tier}.${level}: mismatched record level`));
  }));
  assert.strictEqual(Object.keys(catalog.subcategoryByContentKey).length, 12, 'month subcategory count changed');
  Object.entries(catalog.subcategoryByContentKey).forEach(([key, value]) => {
    assert.strictEqual(value, '月份', `${key}: month subcategory changed`);
    assert.strictEqual(records.find((row) => row.contentKey === key).reviewSet, 'months-12', `${key}: not a month`);
  });

  return true;
}

function validatePaidQueue(queue) {
  assert.strictEqual(queue.schemaVersion, 1);
  assert.strictEqual(queue.queueId, 'paid-vocabulary-review-queue');
  assert.strictEqual(queue.canonicalApprovedCatalog, false);
  assert.strictEqual(queue.state, 'candidate-unreviewed-inactive');
  assert.strictEqual(queue.runtimeConsumption, 'not-authorized');
  assert.strictEqual(queue.productionMutation, 'not-authorized');
  assert.strictEqual(queue.candidateCount, 64);
  assert.strictEqual(queue.candidates.length, 64);
  assert.strictEqual(new Set(queue.candidates.map((row) => `${row.word}@${row.level}`)).size, 64);
  assert.strictEqual(new Set(queue.candidates.map((row) => row.candidateKey)).size, 64);
  assert.strictEqual(queue.candidates.filter((row) => row.level === '初').length, 37);
  assert.strictEqual(queue.candidates.filter((row) => row.level === '中').length, 27);
  queue.candidates.forEach((row) => {
    assert.strictEqual(row.candidateKey, `${row.word}@${row.level}#legacy-paid-review-candidate`);
    assert.ok(Number.isInteger(row.formerFreeRank) && row.formerFreeRank >= 1 && row.formerFreeRank <= 100);
    nonEmptyString(row.zhTW, `${row.candidateKey}.zhTW`);
    assert.strictEqual(row.reviewStatus, 'ยังไม่ตรวจ');
    assert.strictEqual(row.sourceAuthority,
      'data/words-data.js legacy record; content fields require Lin review before approval');
  });
  return true;
}

function validateLockedTexts(catalogText, lockText, queueText) {
  assert.strictEqual(sha256(lockText), EXPECTED_LOCK_SHA256,
    'STOP_AND_REPORT_TO_LIN: catalog lock changed without the locked checker receipt');
  const lock = JSON.parse(lockText);
  assert.strictEqual(sha256(catalogText), lock.catalogSha256,
    'STOP_AND_REPORT_TO_LIN: approved catalog bytes changed; no automatic repair is allowed');
  assert.strictEqual(lock.lockedBy, 'Lin', 'catalog lock owner changed');
  assert.strictEqual(sha256(queueText), lock.paidReviewQueueSha256,
    'STOP_AND_REPORT_TO_LIN: Paid review queue bytes changed; no automatic repair is allowed');
  assert.strictEqual(lock.approvedRecordCount, 389, 'lock record count changed');
  assert.deepStrictEqual(lock.reviewSetCounts, EXPECTED_COUNTS, 'lock review-set counts changed');
  validateCatalog(JSON.parse(catalogText));
  validatePaidQueue(JSON.parse(queueText));
  return true;
}

function main() {
  const catalogText = fs.readFileSync(catalogPath, 'utf8');
  const lockText = fs.readFileSync(lockPath, 'utf8');
  const queueText = fs.readFileSync(paidQueuePath, 'utf8');
  validateLockedTexts(catalogText, lockText, queueText);
  console.log('✅ Lin-approved vocabulary catalog PASS: 389 approved records; Free 200; Paid approved 189; Paid review queue 64; Source-only inactive');
}

if (require.main === module) main();

module.exports = { validateCatalog, validatePaidQueue, validateLockedTexts, sha256, EXPECTED_COUNTS };
