#!/usr/bin/env node
'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');

const manifest = JSON.parse(read('data/approved-paid-vocabulary-queue.json'));
const freeCatalog = JSON.parse(read('data/approved-vocabulary-catalog.json'));
const migration = read('supabase/migrations/20260905085037_queue_approved_paid_vocabulary_189.sql');
const edge = read('supabase/functions/game-content/index.ts');
const payloadSha256 = '02715eed20083f19124820c9306fc525db0d8c775f3fd68615902022bb96c327';

assert.strictEqual(manifest.state, 'queued-inactive');
assert.strictEqual(manifest.accessTier, 'paid');
assert.strictEqual(manifest.runtimeConsumption, 'not-authorized');
assert.strictEqual(manifest.recordCount, 189);
assert.deepStrictEqual(manifest.levelCounts, { '初': 183, '中': 6 });
assert.strictEqual(new Set(manifest.contentKeys).size, 189);
assert.strictEqual(freeCatalog.catalogVersion, 'free-200-v1');
assert.strictEqual(freeCatalog.approvedRecordCount, 200);
assert.deepStrictEqual(freeCatalog.levelCounts, { '初': 100, '中': 100 });
assert.strictEqual(freeCatalog.tierAllocation.guestFree['初'].length, 50);
assert.strictEqual(freeCatalog.tierAllocation.guestFree['中'].length, 50);
assert.strictEqual(freeCatalog.tierAllocation.loginFreeAdditional['初'].length, 50);
assert.strictEqual(freeCatalog.tierAllocation.loginFreeAdditional['中'].length, 50);

const match = migration.match(/jsonb_to_recordset\(\$paidqueue\$(\[[\s\S]*?\])\$paidqueue\$::jsonb\)/);
assert(match, 'migration must embed the exact approved Paid queue payload');
assert.strictEqual(crypto.createHash('sha256').update(match[1]).digest('hex'), payloadSha256);
const payload = JSON.parse(match[1]);
assert.strictEqual(payload.length, 189);
assert.deepStrictEqual(payload.map((row) => row.content_key), manifest.contentKeys);
assert.strictEqual(new Set(freeCatalog.records.map((row) => row.contentKey).filter((key) => manifest.contentKeys.includes(key))).size, 0);
assert.strictEqual(freeCatalog.records.length + payload.length, 389);
assert.strictEqual(payload.filter((row) => row.level === '初').length, 183);
assert.strictEqual(payload.filter((row) => row.level === '中').length, 6);
assert.strictEqual(payload.every((row) => row.access_tier === 'paid'), true);
assert.strictEqual(payload.every((row) => row.catalog_version === 'paid-queue-189-v1'), true);
assert.strictEqual(payload.every((row) => row.rank >= 101), true);
payload.forEach((row) => {
  assert.strictEqual(row.content_key, row.canonical_record.contentKey);
  assert.strictEqual(row.record_hash, crypto.createHash('sha256').update(JSON.stringify(row.canonical_record)).digest('hex'));
  assert.strictEqual(row.word, row.canonical_record.word);
  assert.strictEqual(row.spelling_th, row.canonical_record.spellingTH);
  assert.strictEqual(row.reading_th, row.canonical_record.readingTH);
  assert.strictEqual(row.audio_status, row.canonical_record.audioStatus);
  assert.strictEqual(new Set(['ยังไม่เช็ก', 'รอตรวจรวม']).has(row.audio_status), true);
  assert.strictEqual(row.syls.length, row.canonical_record.syllables.length);
  assert.strictEqual(row.syls.map((part) => part.th).join(''), row.word);
});
assert.strictEqual(payload.filter((row) => row.audio_status === 'ยังไม่เช็ก').length, 160);
assert.strictEqual(payload.filter((row) => row.audio_status === 'รอตรวจรวม').length, 29);

assert.match(migration, /status='queued'/);
assert.match(migration, /access_tier='paid'/);
assert.match(migration, /count\(\*\) from public\.game_words where status='active'\) <> 200/);
assert.match(migration, /Paid queue collides with active Free content_key/);
assert.doesNotMatch(migration, /insert into public\.learning_items/i);
assert.doesNotMatch(migration, /delete\s+from\s+public\.game_words/i);
assert.doesNotMatch(migration, /^\+/m);
assert.match(migration, /revoke all on table public\.game_words from public,anon,authenticated/);
assert.match(edge, /wordStatuses = paidTone \? \['queued'\] : \['active'\]/);
assert.match(edge, /wordTiers = paidTone \? \['paid'\]/);
assert.match(edge, /requestBody\?\.paid_beta === true[\s\S]+owner_all_access/);

console.log('✅ Paid vocabulary queue 189 is central, protected and runtime-inactive');
