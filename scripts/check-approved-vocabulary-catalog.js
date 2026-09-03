#!/usr/bin/env node
'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const paths = {
  catalog: path.join(root, 'data/approved-vocabulary-catalog.json'),
  lock: path.join(root, 'data/approved-vocabulary-catalog.lock.json'),
  approvedHistory: path.join(root, 'data/history/vocabulary/2026-09-03-pre-free-200/approved-surplus-189.json'),
  unreviewedHistory: path.join(root, 'data/history/vocabulary/2026-09-03-pre-free-200/unreviewed-surplus-64.json'),
};
const EXPECTED_LOCK_SHA256 = '2943fab192c6b731783b49b945819ffd494cce80c21993fb49115eca4da54561';
const EXPECTED_COUNTS = Object.freeze({
  'pronouns-i-you-he': 5, 'verbs-225-final-notes': 90, 'nouns-74': 74,
  'adjectives-21': 8, 'numbers-18': 3, 'weekdays-7': 7,
  'checkpoint-verbs-2': 1, 'months-12': 12,
});
const RECORD_KEYS = ['contentKey','reviewSet','word','spellingTH','readingTH','roman','zhTW','level','type','category','audioStatus','approvalRefs','syllables'].sort();
const SYLLABLE_KEYS = ['roman','lead','consonant','cluster','vowel','writtenFinal','toneMark','toneNumber','toneName','liveDead','consonantReadDifference','finalReadDifference','silent'].sort();
const TONE_NAMES = { 1: 'สามัญ', 2: 'เอก', 3: 'โท', 4: 'ตรี', 5: 'จัตวา' };
const NON_ALIGNED_WRITTEN = new Set([
  'วันพฤหัสบดี@中#weekday', 'โทรศัพท์@中#noun-a-11', 'คุณภาพ@中#noun-a-19',
  'เอกสาร@中#noun-a-23', 'พฤษภาคม@中#month', 'สกปรก@中#adjective', 'พฤศจิกายน@中#month',
]);

function sha256(text) { return crypto.createHash('sha256').update(text).digest('hex'); }
function exactKeys(value, expected, label) { assert.deepStrictEqual(Object.keys(value).sort(), expected, `${label}: field set changed`); }
function nonEmpty(value, label) { assert.strictEqual(typeof value, 'string', `${label}: must be a string`); assert.ok(value.length, `${label}: must not be blank`); }
function find(records, word, zhTW) { return records.filter((row) => row.word === word && row.zhTW === zhTW); }

function validateRecord(row, index) {
  const label = `record[${index}]`;
  exactKeys(row, RECORD_KEYS, label);
  ['contentKey','reviewSet','word','spellingTH','readingTH','roman','zhTW','level','type','category','audioStatus']
    .forEach((field) => nonEmpty(row[field], `${label}.${field}`));
  assert.ok(Array.isArray(row.approvalRefs) && row.approvalRefs.length, `${label}: approvalRefs required`);
  assert.ok(Array.isArray(row.syllables) && row.syllables.length, `${label}: syllables required`);
  const written = row.spellingTH.split('-');
  const reading = row.readingTH.split('-');
  const roman = row.roman.split('-');
  assert.strictEqual(written.join(''), row.word, `${label}: spellingTH must join to word`);
  assert.strictEqual(reading.length, row.syllables.length, `${label}: readingTH count mismatch`);
  assert.strictEqual(roman.length, row.syllables.length, `${label}: roman count mismatch`);
  if (!NON_ALIGNED_WRITTEN.has(row.contentKey)) assert.strictEqual(written.length, row.syllables.length, `${label}: spellingTH count mismatch`);
  row.syllables.forEach((part, partIndex) => {
    const partLabel = `${label}.syllables[${partIndex}]`;
    exactKeys(part, SYLLABLE_KEYS, partLabel);
    SYLLABLE_KEYS.filter((field) => field !== 'toneNumber').forEach((field) => nonEmpty(part[field], `${partLabel}.${field}`));
    assert.ok(Number.isInteger(part.toneNumber) && part.toneNumber >= 1 && part.toneNumber <= 5, `${partLabel}: invalid tone`);
    assert.strictEqual(part.toneName, TONE_NAMES[part.toneNumber], `${partLabel}: tone mismatch`);
    assert.ok(part.liveDead === '活音' || part.liveDead === '死音', `${partLabel}: invalid liveDead`);
    assert.strictEqual(part.roman, roman[partIndex], `${partLabel}: roman mismatch`);
  });
}

function validateCatalog(catalog) {
  assert.strictEqual(catalog.schemaVersion, 3);
  assert.strictEqual(catalog.catalogId, 'lin-approved-vocabulary-master');
  assert.strictEqual(catalog.authority, 'Lin');
  assert.strictEqual(catalog.state, 'canonical-free-200');
  assert.strictEqual(catalog.runtimeConsumption, 'authorized');
  assert.strictEqual(catalog.productionMutation, 'authorized');
  assert.strictEqual(catalog.catalogVersion, 'free-200-v1');
  assert.strictEqual(catalog.approvedRecordCount, 200);
  assert.deepStrictEqual(catalog.levelCounts, { '初': 100, '中': 100 });
  assert.deepStrictEqual(catalog.reviewSetCounts, EXPECTED_COUNTS);
  assert.ok(Array.isArray(catalog.records) && catalog.records.length === 200, 'catalog must contain exactly 200 records');
  const keys = new Set(); const counts = {};
  catalog.records.forEach((row, index) => {
    validateRecord(row, index);
    assert.ok(!keys.has(row.contentKey), `duplicate contentKey ${row.contentKey}`); keys.add(row.contentKey);
    assert.ok(Object.hasOwn(EXPECTED_COUNTS, row.reviewSet), `unapproved review set ${row.reviewSet}`);
    counts[row.reviewSet] = (counts[row.reviewSet] || 0) + 1;
  });
  assert.deepStrictEqual(counts, EXPECTED_COUNTS);
  const tiers = catalog.tierAllocation;
  const guest = tiers.guestFree['初'].concat(tiers.guestFree['中']);
  const login = tiers.loginFreeAdditional['初'].concat(tiers.loginFreeAdditional['中']);
  assert.strictEqual(guest.length, 100); assert.strictEqual(login.length, 100);
  assert.strictEqual(new Set(guest.concat(login)).size, 200, 'Free allocation must be unique');
  assert.deepStrictEqual(new Set(guest.concat(login)), keys, 'Free allocation must cover catalog');
  ['guestFree','loginFreeAdditional'].forEach((tier) => ['初','中'].forEach((level) => {
    assert.strictEqual(tiers[tier][level].length, 50, `${tier}.${level} count changed`);
    tiers[tier][level].forEach((key) => assert.strictEqual(catalog.records.find((row) => row.contentKey === key).level, level));
  }));
  assert.deepStrictEqual(catalog.historyRefs, [
    'data/history/vocabulary/2026-09-03-pre-free-200/approved-surplus-189.json',
    'data/history/vocabulary/2026-09-03-pre-free-200/unreviewed-surplus-64.json',
  ]);
  assert.strictEqual(Object.keys(catalog.subcategoryByContentKey).length, 12);
  Object.entries(catalog.subcategoryByContentKey).forEach(([key, value]) => {
    assert.strictEqual(value, '月份'); assert.strictEqual(catalog.records.find((row) => row.contentKey === key).reviewSet, 'months-12');
  });
  assert.strictEqual(find(catalog.records, 'นาย', '先生').length, 0);
  assert.strictEqual(catalog.records.some((row) => row.word === 'ห้องอาหาร'), false);
  assert.strictEqual(catalog.records.filter((row) => row.word === 'สัมภาษณ์' && row.type === '動詞').length, 1);
  const thursday = find(catalog.records, 'วันพฤหัสบดี', '星期四')[0]; assert(thursday, 'Thursday missing');
  assert.strictEqual(thursday.spellingTH, 'วัน-พ-ฤ-หัส-บ-ดี');
  assert.strictEqual(thursday.readingTH, 'วัน-พะ-รึ-หัด-สะ-บอ-ดี');
  assert.strictEqual(thursday.roman, 'wan-phá-rʉ́-hàt-sà-bɔɔ-dii');
  ['พฤษภาคม','พฤศจิกายน'].forEach((word) => assert.strictEqual(catalog.records.find((row) => row.word === word).syllables[0].cluster, 'ร'));
  assert.strictEqual(catalog.records.find((row) => row.word === 'ออฟฟิศ').syllables[0].toneNumber, 4);
  const card = catalog.records.find((row) => row.word === 'นามบัตร');
  assert.strictEqual(card.syllables[1].writtenFinal, 'ตร'); assert.strictEqual(card.syllables[1].finalReadDifference, 'ตร > ด');
  return true;
}

function validateApprovedHistory(history, activeKeys) {
  assert.strictEqual(history.recordCount, 189); assert.strictEqual(history.records.length, 189);
  assert.strictEqual(history.state, 'inactive-history-recheck-entire-batch-before-reactivation');
  assert.strictEqual(history.runtimeConsumption, 'not-authorized'); assert.strictEqual(history.productionMutation, 'not-authorized');
  const keys = new Set(history.records.map((row) => row.contentKey)); assert.strictEqual(keys.size, 189);
  keys.forEach((key) => assert.ok(!activeKeys.has(key), `approved history overlaps active catalog: ${key}`));
  return keys;
}

function validateUnreviewedHistory(history, activeKeys, approvedKeys) {
  assert.strictEqual(history.canonicalApprovedCatalog, false); assert.strictEqual(history.candidateCount, 64);
  assert.strictEqual(history.candidates.length, 64);
  assert.strictEqual(history.state, 'inactive-history-recheck-entire-batch-before-reactivation');
  assert.strictEqual(history.runtimeConsumption, 'not-authorized'); assert.strictEqual(history.productionMutation, 'not-authorized');
  const keys = new Set(history.candidates.map((row) => row.candidateKey)); assert.strictEqual(keys.size, 64);
  history.candidates.forEach((row) => {
    assert.strictEqual(row.reviewStatus, 'ยังไม่ตรวจ');
    assert.ok(!activeKeys.has(row.candidateKey)); assert.ok(!approvedKeys.has(row.candidateKey));
  });
  return true;
}

function validateLockedTexts(catalogText, lockText, approvedHistoryText, unreviewedHistoryText) {
  assert.strictEqual(sha256(lockText), EXPECTED_LOCK_SHA256, 'STOP_AND_REPORT_TO_LIN: lock changed');
  const lock = JSON.parse(lockText);
  assert.strictEqual(lock.lockedBy, 'Lin'); assert.strictEqual(lock.catalogVersion, 'free-200-v1'); assert.strictEqual(lock.approvedRecordCount, 200);
  assert.strictEqual(sha256(catalogText), lock.catalogSha256, 'STOP_AND_REPORT_TO_LIN: active catalog changed');
  assert.strictEqual(sha256(approvedHistoryText), lock.approvedHistorySha256, 'STOP_AND_REPORT_TO_LIN: approved history changed');
  assert.strictEqual(sha256(unreviewedHistoryText), lock.unreviewedHistorySha256, 'STOP_AND_REPORT_TO_LIN: unreviewed history changed');
  const catalog = JSON.parse(catalogText); validateCatalog(catalog);
  const activeKeys = new Set(catalog.records.map((row) => row.contentKey));
  const approvedKeys = validateApprovedHistory(JSON.parse(approvedHistoryText), activeKeys);
  validateUnreviewedHistory(JSON.parse(unreviewedHistoryText), activeKeys, approvedKeys);
  return true;
}

function main() {
  validateLockedTexts(fs.readFileSync(paths.catalog, 'utf8'), fs.readFileSync(paths.lock, 'utf8'),
    fs.readFileSync(paths.approvedHistory, 'utf8'), fs.readFileSync(paths.unreviewedHistory, 'utf8'));
  console.log('✅ Lin-approved canonical Free 200 catalog PASS: Guest 100; Login Free additional 100; surplus archived');
}
if (require.main === module) main();
module.exports = { validateCatalog, validateApprovedHistory, validateUnreviewedHistory, validateLockedTexts, sha256, EXPECTED_COUNTS };
