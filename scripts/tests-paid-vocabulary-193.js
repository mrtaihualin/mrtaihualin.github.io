#!/usr/bin/env node
'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const md5 = (value) => crypto.createHash('md5').update(value).digest('hex');
const extractPayload = (sql, tag) => {
  const match = sql.match(new RegExp(`jsonb_to_recordset\\(\\$${tag}\\$(\\[[\\s\\S]*?\\])\\$${tag}\\$::jsonb\\)`));
  assert(match, `migration must embed the exact ${tag} JSON payload`);
  return { text: match[1], rows: JSON.parse(match[1]) };
};

const source = JSON.parse(read('data/approved-paid-vocabulary-193.json'));
const manifest = JSON.parse(read('data/approved-paid-vocabulary-queue.json'));
const freeText = read('data/approved-vocabulary-catalog.json');
const free = JSON.parse(freeText);
const oldMigration = read('supabase/migrations/20260905085037_queue_approved_paid_vocabulary_189.sql');
const migration = read('supabase/migrations/20260921155538_queue_approved_paid_vocabulary_193.sql');
const rollback = read('supabase/recovery/paid-queue-193/rollback.sql');
const edge = read('supabase/functions/game-content/index.ts');
const old = extractPayload(oldMigration, 'paidqueue').rows;
const next = extractPayload(migration, 'paid193');

// The two pre-existing authorities are immutable baselines.
assert.strictEqual(sha256(freeText), '98a81f936b522838593a6da3fa8861c270fa81211e8dbc4c10f94dfd122c2787');
assert.strictEqual(sha256(oldMigration), 'f6d75d88993da7862eebc15f5527503bae544ee75bc511524dffcdaf269b6609');
assert.strictEqual(free.records.length, 200);
assert.strictEqual(old.length, 189);

assert.strictEqual(source.schemaVersion, 1);
assert.strictEqual(source.batchId, 'approved-paid-vocabulary-193');
assert.strictEqual(source.catalogVersion, 'paid-queue-193-v1');
assert.strictEqual(source.runtimeScope, 'all-six-owner_all_access-only');
assert.strictEqual(source.recordCount, 193);
assert.strictEqual(source.uniqueWrittenCount, 192);
assert.deepStrictEqual(source.levelCounts, { '初': 186, '中': 7 });
assert.strictEqual(source.audioStatus, 'รอตรวจรวม');
assert.strictEqual(next.rows.length, 193);
assert.strictEqual(sha256(next.text), source.payloadSha256);
assert.deepStrictEqual(next.rows.map((row) => row.canonical_record), source.records);
assert.deepStrictEqual(next.rows.map((row) => row.content_key), manifest.contentKeys.slice(189));
assert.strictEqual(manifest.recordCount, 382);
assert.deepStrictEqual(manifest.levelCounts, { '初': 369, '中': 13 });
assert.strictEqual(manifest.runtimeCatalogVersion, 'paid-queue-193-v1');
assert.strictEqual(manifest.runtimeRecordCount, 193);

const lockedWordFields = ['word', 'spellingTH', 'readingTH', 'roman', 'zhTW', 'level'];
const lockedStructureFields = [
  'roman', 'lead', 'consonant', 'cluster', 'vowel', 'writtenFinal', 'toneMark',
  'toneNumber', 'liveDead', 'consonantReadDifference', 'finalReadDifference', 'silent',
];
const toneNames = { 1: 'สามัญ', 2: 'เอก', 3: 'โท', 4: 'ตรี', 5: 'จัตวา' };
const exactString = (value) => typeof value === 'string' && value.length > 0 && value.trim() === value;
const semanticKeys = new Set();
const written = new Set();

source.records.forEach((record, index) => {
  assert.strictEqual(record.contentKey, `${record.word}@${record.level}#paid193-${String(index + 1).padStart(3, '0')}`);
  lockedWordFields.forEach((field) => assert(exactString(record[field]), `${record.contentKey}: missing ${field}`));
  assert(exactString(record.type));
  assert(exactString(record.category));
  assert(Array.isArray(record.categoryPaths) && record.categoryPaths.length >= 1 && record.categoryPaths.every(exactString));
  assert.strictEqual(record.category, record.categoryPaths.join(' + '));
  assert.strictEqual(record.audioStatus, 'รอตรวจรวม');
  assert.deepStrictEqual(record.approvalRefs, [
    'PD-VOCAB-OLD-COMPLETION-SETS-01-08-2026-09-09',
    'PD-VOCAB-REVIEW-TEMPLATE-STRICT-2026-09-10-G',
    'VOCAB_SINGLE_CATEGORY_LABEL_REVIEW_HANDOFF_2026-09-11',
  ]);
  assert(Array.isArray(record.syllables) && record.syllables.length >= 1);
  assert.strictEqual(record.spellingTH.split('-').length, record.syllables.length);
  assert.strictEqual(record.roman.split('-').length, record.syllables.length);
  record.syllables.forEach((syllable) => {
    lockedStructureFields.forEach((field) => {
      if (field === 'toneNumber') assert(Number.isInteger(syllable[field]) && syllable[field] >= 1 && syllable[field] <= 5);
      else assert(exactString(syllable[field]), `${record.contentKey}: missing syllable ${field}`);
    });
    assert.strictEqual(syllable.toneName, toneNames[syllable.toneNumber]);
    assert.doesNotMatch(JSON.stringify(syllable), /รอตรวจภายหลัง/);
  });
  const semanticKey = `${record.word}\u0000${record.zhTW}\u0000${record.level}`;
  assert(!semanticKeys.has(semanticKey), `duplicate semantic record: ${semanticKey}`);
  semanticKeys.add(semanticKey);
  written.add(record.word);
});

assert.strictEqual(semanticKeys.size, 193);
assert.strictEqual(written.size, 192);
assert.deepStrictEqual(source.records.flatMap((record) => record.syllables
  .filter((syllable) => /AI candidate/.test(JSON.stringify(syllable)))
  .map((syllable) => [record.word, syllable.finalReadDifference])), [
  ['เช็คเอาท์', 'ค → ก (AI candidate)'],
]);
assert.deepStrictEqual(source.records.filter((record) => record.word === 'คัน').map((record) => record.zhTW), ['輛', '癢']);
assert.strictEqual(source.records.filter((record) => record.level === '初').length, 186);
assert.strictEqual(source.records.filter((record) => record.level === '中').length, 7);

const existing = [...free.records, ...old.map((row) => row.canonical_record)];
const existingKeys = new Set(existing.map((record) => record.contentKey));
const existingWords = new Set(existing.map((record) => record.word));
assert.strictEqual(existing.length, 389);
assert.strictEqual(source.records.some((record) => existingKeys.has(record.contentKey)), false);
assert.strictEqual(source.records.some((record) => existingWords.has(record.word)), false);

next.rows.forEach((row) => {
  assert.strictEqual(row.content_key, row.canonical_record.contentKey);
  assert.strictEqual(row.record_hash, sha256(JSON.stringify(row.canonical_record)));
  assert.strictEqual(row.word, row.canonical_record.word);
  assert.strictEqual(row.en, row.canonical_record.roman);
  assert.strictEqual(row.zh, row.canonical_record.zhTW);
  assert.strictEqual(row.level, row.canonical_record.level);
  assert.strictEqual(row.category, row.canonical_record.category);
  assert.strictEqual(row.type, row.canonical_record.type);
  assert.strictEqual(row.spelling_th, row.canonical_record.spellingTH);
  assert.strictEqual(row.reading_th, row.canonical_record.readingTH);
  assert.strictEqual(row.audio_status, 'รอตรวจรวม');
  assert.strictEqual(row.access_tier, 'paid');
  assert.strictEqual(row.catalog_version, 'paid-queue-193-v1');
  assert.strictEqual(row.syls.length, row.canonical_record.syllables.length);
  assert.strictEqual(row.syls.map((syllable) => syllable.th).join(''), row.word);
});
assert.deepStrictEqual(next.rows.filter((row) => row.level === '初').map((row) => row.rank), Array.from({ length: 186 }, (_, index) => 284 + index));
assert.deepStrictEqual(next.rows.filter((row) => row.level === '中').map((row) => row.rank), Array.from({ length: 7 }, (_, index) => 107 + index));

const sortedNewHashes = next.rows.slice().sort((a, b) => Buffer.from(a.content_key).compare(Buffer.from(b.content_key))).map((row) => row.record_hash).join('\n');
const combinedHashes = [...old, ...next.rows].sort((a, b) => Buffer.from(a.content_key).compare(Buffer.from(b.content_key))).map((row) => row.record_hash).join('\n');
assert.strictEqual(md5(sortedNewHashes), source.recordHashMd5);
assert.strictEqual(md5(combinedHashes), source.combinedPaidRecordHashMd5);

assert.match(migration, /Existing Paid 189 precheck failed/);
assert.match(migration, /c4f7b191b4e7c812ab4e348dccdf7ced/);
assert.match(migration, /8995b40864da1d4f6a04d483c13f3114/);
assert.match(migration, /68fa6e62e25e55f48c38bad7db812391/);
assert.match(migration, /count\(distinct \(word,zh,level\)\).*<> 193/);
assert.match(migration, /count\(distinct word\).*<> 192/);
assert.match(migration, /join _paid_queue_193 p using\(word\)/);
assert.match(migration, /count\(\*\) from public\.game_words where status='queued' and access_tier='paid'\) <> 382/);
assert.match(migration, /count\(\*\) from public\.game_words where status='queued' and access_tier='paid' and level='初'\) <> 369/);
assert.match(migration, /count\(\*\) from public\.game_words where status='queued' and access_tier='paid' and level='中'\) <> 13/);
assert.match(migration, /owner_all_access/);
assert.match(migration, /revoke all on table public\.game_words from public,anon,authenticated/);
assert.doesNotMatch(migration, /on conflict/i);
assert.doesNotMatch(migration, /update\s+public\.game_words/i);
assert.doesNotMatch(migration, /delete\s+from\s+public\.game_words/i);

assert.match(rollback, /phase2_paid_srs_states/);
assert.match(rollback, /phase2_paid_srs_operations/);
assert.match(rollback, /user-linked SRS data exists/);
assert.match(rollback, /c4f7b191b4e7c812ab4e348dccdf7ced/);
assert.match(rollback, /8995b40864da1d4f6a04d483c13f3114/);
assert.match(rollback, /delete from public\.game_words where catalog_version='paid-queue-193-v1'/);
assert.match(rollback, /count\(\*\) from public\.game_words where status='queued' and access_tier='paid'\) <> 189/);
assert.doesNotMatch(rollback, /delete from public\.phase2_paid_srs/i);

assert.match(edge, /paid:\s*{\s*'初':\s*186,\s*'中':\s*7,\s*sentences:\s*40\s*}/);
assert.match(edge, /GAME_SURFACES = new Set\(\['tone', 'reading', 'typing', 'word_order', 'listening', 'lego'\]\)/);
assert.match(edge, /PAID_RUNTIME_CATALOG_VERSION = 'paid-queue-193-v1'/);
assert.match(edge, /requestedGame && GAME_SURFACES\.has\(requestedGame\)[\s\S]+owner_all_access/);
assert.match(edge, /const wordStatuses = paidAccess \? \['queued'\] : \['active'\]/);
assert.match(edge, /const wordTiers = paidAccess \? \['paid'\]/);
assert.match(edge, /query = query\.eq\('catalog_version', PAID_RUNTIME_CATALOG_VERSION\)/);

console.log('✅ Exact Paid 193 is the single owner runtime catalog across all six games; Free 200 and Paid 189 rows remain unchanged');
