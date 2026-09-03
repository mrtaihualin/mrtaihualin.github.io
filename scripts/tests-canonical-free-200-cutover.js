#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');
const catalog = JSON.parse(read('data/approved-vocabulary-catalog.json'));
const migration = read('supabase/migrations/20260903072554_canonical_free_200_catalog.sql');
const rollback = read('supabase/recovery/canonical-free-200/rollback.sql');
const edge = read('supabase/functions/game-content/index.ts');

const match = migration.match(/jsonb_to_recordset\(\$catalog\$(\[[\s\S]*?\])\$catalog\$::jsonb\)/);
assert(match, 'migration must embed the canonical catalog payload');
const payload = JSON.parse(match[1]);
assert.strictEqual(payload.length, 200);
assert.strictEqual(new Set(payload.map((row) => row.content_key)).size, 200);
assert.strictEqual(payload.filter((row) => row.level === '初').length, 100);
assert.strictEqual(payload.filter((row) => row.level === '中').length, 100);
assert.strictEqual(payload.filter((row) => row.access_tier === 'guest').length, 100);
assert.strictEqual(payload.filter((row) => row.access_tier === 'login').length, 100);
assert.strictEqual(payload.some((row) => /paid/i.test(row.access_tier)), false);

const expected = [];
['初','中'].forEach((level) => {
  catalog.tierAllocation.guestFree[level].forEach((contentKey, index) => expected.push({ contentKey, level, accessTier: 'guest', rank: index + 1 }));
  catalog.tierAllocation.loginFreeAdditional[level].forEach((contentKey, index) => expected.push({ contentKey, level, accessTier: 'login', rank: index + 51 }));
});
const byKey = new Map(payload.map((row) => [row.content_key, row]));
expected.forEach((item) => {
  const row = byKey.get(item.contentKey); assert(row, `missing migration row ${item.contentKey}`);
  assert.strictEqual(row.level, item.level); assert.strictEqual(row.access_tier, item.accessTier); assert.strictEqual(row.rank, item.rank);
  assert.deepStrictEqual(row.canonical_record, catalog.records.find((record) => record.contentKey === item.contentKey));
  assert.strictEqual(row.syls.length, row.canonical_record.syllables.length);
  assert.strictEqual(row.syls.map((part) => part.th).join(''), row.word);
});

assert.match(migration, /history_record\s*=\s*coalesce/);
assert.match(migration, /order by content_key collate "C"/);
assert.match(migration, /status\s*=\s*'history'/);
assert.match(migration, /count\(\*\) from public\.game_words where status='active'\)<>200/);
assert.match(migration, /count\(\*\) from public\.game_words where status='history'\)<>538/);
assert.match(migration, /three reviewed calendar words never existed/i);
assert.match(migration, /insert into public\.learning_items/);
assert.doesNotMatch(migration, /delete\s+from\s+public\.game_words/i);
assert.match(migration, /learning identity collision requires manual reconciliation/);
assert.match(migration, /revoke all on table public\.game_words from public,anon,authenticated/);
assert.match(migration, /grant select on table public\.game_words to service_role/);

assert.match(edge, /\.eq\('status', 'active'\)/);
assert.match(edge, /\.in\('access_tier', tier === 'login' \? \['guest', 'login'\] : \['guest'\]\)/);
assert.doesNotMatch(edge, /\.contains\('surfaces'/);
assert.match(edge, /catalogVersion: r\.catalog_version/);
assert.match(edge, /runtimeSpelling = null/);
assert.match(rollback, /history_record/);
assert.doesNotMatch(rollback, /delete\s+from\s+public\.game_words/i);

console.log('✅ Canonical Free 200 migration/runtime cutover tests PASS');
