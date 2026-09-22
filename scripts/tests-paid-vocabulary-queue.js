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

assert.strictEqual(manifest.schemaVersion, 4);
assert.strictEqual(manifest.state, 'queued-owner-only');
assert.strictEqual(manifest.accessTier, 'paid');
assert.strictEqual(manifest.runtimeConsumption, 'all-six-owner_all_access-free200-plus-paid382');
assert.strictEqual(manifest.runtimeFreeCatalogVersion, 'free-200-v1');
assert.deepStrictEqual(manifest.runtimePaidCatalogVersions, ['paid-queue-189-v1', 'paid-queue-193-v1']);
assert.strictEqual(manifest.runtimeRecordCount, 582);
assert.strictEqual(Object.prototype.hasOwnProperty.call(manifest, 'supersedesRuntimeCatalogVersion'), false);
assert.strictEqual(manifest.migrationState, 'source-ready-production-pending');
assert.strictEqual(manifest.recordCount, 382);
assert.deepStrictEqual(manifest.levelCounts, { '初': 369, '中': 13 });
assert.strictEqual(new Set(manifest.contentKeys).size, 382);
assert.strictEqual(manifest.batches[0].catalogVersion, 'paid-queue-189-v1');
assert.strictEqual(manifest.batches[0].recordCount, 189);
assert.deepStrictEqual(manifest.batches[0].levelCounts, { '初': 183, '中': 6 });
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
assert.deepStrictEqual(payload.map((row) => row.content_key), manifest.contentKeys.slice(0, 189));
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
assert.match(edge, /requestedGame && GAME_SURFACES\.has\(requestedGame\)[\s\S]+owner_all_access/);
assert.match(edge, /paid:\s*{\s*'初':\s*469,\s*'中':\s*113,\s*sentences:\s*40\s*}/);
assert.match(edge, /FREE_RUNTIME_CATALOG_VERSION = 'free-200-v1'/);
assert.match(edge, /PAID_RUNTIME_CATALOG_VERSIONS = \['paid-queue-189-v1', 'paid-queue-193-v1'\]/);
assert.match(edge, /selectWords\(level, \['active'\], \['guest', 'login'\], \[FREE_RUNTIME_CATALOG_VERSION\], CAPS\.login\[level\]\)/);
assert.match(edge, /selectWords\(level, \['queued'\], \['paid'\], PAID_RUNTIME_CATALOG_VERSIONS, PAID_ONLY_CAPS\[level\]\)/);

console.log('✅ Original Paid 189 remains byte-exact and joins Free 200 plus Paid 193 in the protected owner-only 582 runtime');
