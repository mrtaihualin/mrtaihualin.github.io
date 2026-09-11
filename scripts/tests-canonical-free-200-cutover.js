#!/usr/bin/env node
'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');
const catalog = JSON.parse(read('data/approved-vocabulary-catalog.json'));
const edge = read('supabase/functions/game-content/index.ts');
const client = read('js/games/game-content-client.js');
const cleanupMigration = read('supabase/migrations/20260910010000_remove_vocabulary_second_judge.sql');

assert.strictEqual(catalog.records.length, 200);
assert.strictEqual(new Set(catalog.records.map((row) => row.contentKey)).size, 200);
assert.strictEqual(catalog.records.filter((row) => row.level === '初').length, 100);
assert.strictEqual(catalog.records.filter((row) => row.level === '中').length, 100);

const cleanupMatch = cleanupMigration.match(/jsonb_to_recordset\(\$catalog\$(\[[\s\S]*?\])\$catalog\$::jsonb\)/);
assert(cleanupMatch, 'cleanup migration must embed the complete reviewed catalog');
const cleanupPayload = JSON.parse(cleanupMatch[1]);
assert.strictEqual(cleanupPayload.length, 200);
cleanupPayload.forEach((row, index) => {
  const record = catalog.records[index];
  assert.strictEqual(row.content_key, record.contentKey);
  assert.deepStrictEqual(row.canonical_record, record);
  assert.strictEqual(
    row.record_hash,
    crypto.createHash('sha256').update(JSON.stringify(record)).digest('hex')
  );
});

assert.match(cleanupMigration, /cleanup_reviewed_vocab_payload/);
assert.match(cleanupMigration, /canonical_record = approved\.canonical_record/);
assert.match(cleanupMigration, /and not \(gw\.canonical_record \? 'spellingSyllables'\)/);
assert.match(cleanupMigration, /gw\.record_hash is distinct from/);
assert.match(cleanupMigration, /gw\.canonical_record is distinct from/);
assert.match(cleanupMigration, /raise exception 'catalog_authority_mismatch/);
assert.match(cleanupMigration, /drop column if exists tone_special/);
assert.match(cleanupMigration, /drop column if exists tone_override/);
assert.match(cleanupMigration, /drop column if exists tone_derivation/);
assert.match(cleanupMigration, /drop column if exists syls/);
assert.match(cleanupMigration, /drop column if exists read_syls/);
assert.doesNotMatch(cleanupMigration, /to_jsonb\(syls\)|jsonb_set\(canonical_record|split_part|string_to_array/i);

// Exercise all 200 current records through the exact public projection used by games.
const sandbox = { window: {}, console };
vm.createContext(sandbox);
vm.runInContext(client, sandbox);
const projected = sandbox.window.buildWordsForPhonicsGames(
  catalog.records.map((record) => ({ catalog: record }))
);
assert.strictEqual(projected.length, 200);
catalog.records.forEach((record, rowIndex) => {
  const actual = projected[rowIndex];
  assert.strictEqual(actual.contentKey, record.contentKey);
  assert.strictEqual(actual.th, record.word);
  assert.strictEqual(actual.syls.length, record.syllables.length);
  actual.syls.forEach((syllable, syllableIndex) => {
    const reviewedDisplay = record.spellingSyllables[syllableIndex];
    const reviewedAnswer = record.syllables[syllableIndex];
    assert.strictEqual(syllable.th, reviewedDisplay.th);
    assert.strictEqual(syllable.toneNumber, reviewedAnswer.toneNumber);
    assert.strictEqual(syllable.tone_name, reviewedAnswer.toneName);
    assert.strictEqual(syllable.lead, reviewedAnswer.lead);
    assert.strictEqual(syllable.cons, reviewedAnswer.consonant);
    assert.strictEqual(syllable.vowel, reviewedAnswer.vowel);
  });
});

// These reviewed words prove why runtime must never split spellingTH to invent
// display syllables: their written grouping intentionally differs.
['วันพฤหัสบดี', 'โทรศัพท์', 'คุณภาพ', 'เอกสาร', 'พฤษภาคม', 'สกปรก', 'พฤศจิกายน'].forEach((word) => {
  const index = catalog.records.findIndex((row) => row.word === word);
  assert.notStrictEqual(index, -1, `missing irregular reviewed record ${word}`);
  assert.strictEqual(projected[index].syls.map((part) => part.th).join(''), word);
  assert.deepStrictEqual(
    projected[index].syls.map((part) => part.th),
    catalog.records[index].spellingSyllables.map((part) => part.th)
  );
});

assert.throws(
  () => sandbox.window.buildWordsForPhonicsGames([{
    catalog: Object.assign({}, catalog.records[0], { spellingSyllables: undefined })
  }]),
  /catalog authority incomplete/
);
const changedDisplay = catalog.records[0].spellingSyllables.map((part) => Object.assign({}, part));
changedDisplay[0].th += 'ผิด';
assert.throws(
  () => sandbox.window.buildWordsForPhonicsGames([{
    catalog: Object.assign({}, catalog.records[0], { spellingSyllables: changedDisplay })
  }]),
  /reviewed display segmentation missing/
);
['readingTH', 'lead', 'approvalRefs', 'display'].forEach((blankField) => {
  const record = JSON.parse(JSON.stringify(catalog.records[0]));
  if (blankField === 'lead') record.syllables[0].lead = '   ';
  else if (blankField === 'approvalRefs') record.approvalRefs = ['   '];
  else if (blankField === 'display') record.spellingSyllables[0].th = '   ';
  else record[blankField] = '   ';
  assert.throws(
    () => sandbox.window.buildWordsForPhonicsGames([{ catalog: record }]),
    /catalog authority incomplete|reviewed display segmentation missing|syllable authority incomplete/
  );
});

assert.match(edge, /wordStatuses = paidTone \? \['queued'\] : \['active'\]/);
assert.match(edge, /wordTiers = paidTone \? \['paid'\] : \(tier === 'login' \? \['guest', 'login'\] : \['guest'\]\)/);
assert.match(edge, /requestBody\?\.paid_beta === true[\s\S]+owner_all_access/);
assert.match(edge, /select\('catalog:canonical_record'\)/);
assert.doesNotMatch(edge, /runtimeSpelling|spellingParts|\.map\(toWord\)|computeTone|getInitClass|getVowelType/);

console.log('✅ Canonical Free 200 direct catalog/runtime cutover tests PASS');
