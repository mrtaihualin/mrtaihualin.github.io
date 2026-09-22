#!/usr/bin/env node
'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const catalogPath = path.join(root, 'data/approved-vocabulary-catalog.json');
const edgePath = path.join(root, 'supabase/functions/game-content/index.ts');
const EXPECTED_CATALOG_SHA256 = '98a81f936b522838593a6da3fa8861c270fa81211e8dbc4c10f94dfd122c2787';
const EXPECTED_REVIEW_SET_COUNTS = Object.freeze({
  'pronouns-i-you-he': 5,
  'verbs-225-final-notes': 90,
  'nouns-74': 74,
  'adjectives-21': 8,
  'numbers-18': 3,
  'weekdays-7': 7,
  'checkpoint-verbs-2': 1,
  'months-12': 12
});
const RECORD_KEYS = ['contentKey','reviewSet','word','spellingTH','readingTH','roman','zhTW','level','type','category','audioStatus','approvalRefs','syllables','spellingSyllables'].sort();
const SYLLABLE_KEYS = ['roman','lead','consonant','cluster','vowel','writtenFinal','toneMark','toneNumber','toneName','liveDead','consonantReadDifference','finalReadDifference','silent'].sort();
const TONE_NAMES = Object.freeze({ 1: 'สามัญ', 2: 'เอก', 3: 'โท', 4: 'ตรี', 5: 'จัตวา' });
const NON_ALIGNED_WRITTEN = new Set([
  'วันพฤหัสบดี@中#weekday', 'โทรศัพท์@中#noun-a-11', 'คุณภาพ@中#noun-a-19',
  'เอกสาร@中#noun-a-23', 'พฤษภาคม@中#month', 'สกปรก@中#adjective', 'พฤศจิกายน@中#month'
]);

function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function exactKeys(value, expected, label) {
  assert.deepStrictEqual(Object.keys(value).sort(), expected, label + ': field set changed');
}

function nonEmpty(value, label) {
  assert.strictEqual(typeof value, 'string', label + ': must be a string');
  assert.ok(value.length, label + ': must not be blank');
}

const catalogText = fs.readFileSync(catalogPath, 'utf8');
const edge = fs.readFileSync(edgePath, 'utf8');
assert.strictEqual(sha256(catalogText), EXPECTED_CATALOG_SHA256, 'STOP_AND_REPORT_TO_LIN: Current Free 200 catalog changed');

const catalog = JSON.parse(catalogText);
assert.strictEqual(catalog.schemaVersion, 3);
assert.strictEqual(catalog.catalogId, 'lin-approved-vocabulary-master');
assert.strictEqual(catalog.authority, 'Lin');
assert.strictEqual(catalog.state, 'canonical-free-200');
assert.strictEqual(catalog.runtimeConsumption, 'authorized');
assert.strictEqual(catalog.productionMutation, 'authorized');
assert.strictEqual(catalog.catalogVersion, 'free-200-v1');
assert.strictEqual(catalog.approvedRecordCount, 200);
assert.deepStrictEqual(catalog.levelCounts, { '初': 100, '中': 100 });
assert.deepStrictEqual(catalog.reviewSetCounts, EXPECTED_REVIEW_SET_COUNTS);
assert.ok(Array.isArray(catalog.records) && catalog.records.length === 200, 'catalog must contain exactly 200 records');

const contentKeys = new Set();
const reviewSetCounts = {};
catalog.records.forEach((row, index) => {
  const label = 'record[' + index + ']';
  exactKeys(row, RECORD_KEYS, label);
  ['contentKey','reviewSet','word','spellingTH','readingTH','roman','zhTW','level','type','category','audioStatus']
    .forEach((field) => nonEmpty(row[field], label + '.' + field));
  assert.ok(!contentKeys.has(row.contentKey), 'duplicate contentKey ' + row.contentKey);
  contentKeys.add(row.contentKey);
  assert.ok(Object.hasOwn(EXPECTED_REVIEW_SET_COUNTS, row.reviewSet), 'unapproved review set ' + row.reviewSet);
  reviewSetCounts[row.reviewSet] = (reviewSetCounts[row.reviewSet] || 0) + 1;
  assert.ok(row.level === '初' || row.level === '中', label + ': invalid level');
  assert.ok(Array.isArray(row.approvalRefs) && row.approvalRefs.length, label + ': approvalRefs required');
  assert.ok(Array.isArray(row.syllables) && row.syllables.length, label + ': syllables required');
  assert.ok(Array.isArray(row.spellingSyllables), label + ': spellingSyllables required');
  const written = row.spellingTH.split('-');
  const reading = row.readingTH.split('-');
  const roman = row.roman.split('-');
  assert.strictEqual(written.join(''), row.word, label + ': spellingTH must join to word');
  assert.strictEqual(reading.length, row.syllables.length, label + ': readingTH count mismatch');
  assert.strictEqual(roman.length, row.syllables.length, label + ': roman count mismatch');
  assert.strictEqual(row.spellingSyllables.length, row.syllables.length, label + ': reviewed display count mismatch');
  assert.strictEqual(row.spellingSyllables.map((part) => part.th).join(''), row.word, label + ': reviewed display must join to word');
  row.spellingSyllables.forEach((part, partIndex) => {
    assert.ok(part && typeof part === 'object' && !Array.isArray(part), label + '.spellingSyllables[' + partIndex + ']: object required');
    nonEmpty(part.th, label + '.spellingSyllables[' + partIndex + '].th');
  });
  if (!NON_ALIGNED_WRITTEN.has(row.contentKey)) {
    assert.strictEqual(written.length, row.syllables.length, label + ': spellingTH count mismatch');
  }
  row.syllables.forEach((part, partIndex) => {
    const partLabel = label + '.syllables[' + partIndex + ']';
    exactKeys(part, SYLLABLE_KEYS, partLabel);
    SYLLABLE_KEYS.filter((field) => field !== 'toneNumber').forEach((field) => nonEmpty(part[field], partLabel + '.' + field));
    assert.ok(Number.isInteger(part.toneNumber) && part.toneNumber >= 1 && part.toneNumber <= 5, partLabel + ': invalid tone');
    assert.strictEqual(part.toneName, TONE_NAMES[part.toneNumber], partLabel + ': tone mismatch');
    assert.ok(part.liveDead === '活音' || part.liveDead === '死音', partLabel + ': invalid liveDead');
    assert.strictEqual(part.roman, roman[partIndex], partLabel + ': roman mismatch');
  });
});
assert.deepStrictEqual(reviewSetCounts, EXPECTED_REVIEW_SET_COUNTS);

const guestKeys = catalog.tierAllocation.guestFree['初'].concat(catalog.tierAllocation.guestFree['中']);
const loginKeys = catalog.tierAllocation.loginFreeAdditional['初'].concat(catalog.tierAllocation.loginFreeAdditional['中']);
assert.strictEqual(guestKeys.length, 100);
assert.strictEqual(loginKeys.length, 100);
assert.strictEqual(new Set(guestKeys.concat(loginKeys)).size, 200, 'Free allocation must be unique');
assert.deepStrictEqual(new Set(guestKeys.concat(loginKeys)), contentKeys, 'Free allocation must cover the Current catalog');
['guestFree','loginFreeAdditional'].forEach((tier) => ['初','中'].forEach((level) => {
  const keys = catalog.tierAllocation[tier][level];
  assert.strictEqual(keys.length, 50, tier + '.' + level + ' count changed');
  keys.forEach((key) => assert.strictEqual(catalog.records.find((row) => row.contentKey === key).level, level));
}));

assert.match(edge, /wordStatuses = paidAccess \? \['queued'\] : \['active'\]/,
  'Guest and Login Free runtime must remain active-only');
assert.match(edge, /wordTiers = paidAccess \? \['paid'\] : \(tier === 'login' \? \['guest', 'login'\] : \['guest'\]\)/,
  'runtime must keep Guest 100 and Login Free additional 100 boundaries');
assert.match(edge, /requestedGame && GAME_SURFACES\.has\(requestedGame\)[\s\S]+owner_all_access/,
  'Paid vocabulary must remain behind the owner-only server gate');
assert.match(edge, /query = query\.in\('catalog_version', PAID_RUNTIME_CATALOG_VERSIONS\)/,
  'Paid runtime must select the exact two reviewed central catalog versions');
assert.match(edge, /select\('catalog:canonical_record'\)/,
  'runtime must forward only the reviewed canonical record');
assert.doesNotMatch(edge, /runtimeSpelling|spellingParts|\.map\(toWord\)/,
  'game-content must not rewrite or derive vocabulary fields');

console.log('CURRENT_FREE_200_DATA_HEALTH_DUPLICATE_RUNTIME_PASS');
