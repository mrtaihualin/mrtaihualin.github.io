#!/usr/bin/env node
'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');
const sourceText = read('data/approved-paid-vocabulary-193.json');
const source = JSON.parse(sourceText);
const freeCatalog = JSON.parse(read('data/approved-vocabulary-catalog.json'));
const manifest = JSON.parse(read('data/approved-paid-vocabulary-queue.json'));
const oldMigration = read('supabase/migrations/20260905085037_queue_approved_paid_vocabulary_189.sql');
const oldMatch = oldMigration.match(/jsonb_to_recordset\(\$paidqueue\$(\[[\s\S]*?\])\$paidqueue\$::jsonb\)/);
assert(oldMatch, 'Paid 189 migration must retain its exact embedded payload');
const old = JSON.parse(oldMatch[1]).map((row) => row.canonical_record);
const paid = old.concat(source.records);
const ownerCatalog = freeCatalog.records.concat(paid);
const edge = read('supabase/functions/game-content/index.ts');
const client = read('js/games/game-content-client.js');
const legoPage = read('lego.html');
const lego = read('js/games/lego-game-app.js');
const listeningPage = read('listening-game.html');
const audio = read('js/games/protected-word-audio.js');

assert.strictEqual(source.recordCount, 193);
assert.deepStrictEqual(source.levelCounts, { '初': 186, '中': 7 });
assert.strictEqual(source.runtimeScope, 'all-six-owner_all_access-only');
assert.strictEqual(manifest.runtimeConsumption, 'all-six-owner_all_access-free200-plus-paid382');
assert.strictEqual(manifest.runtimeFreeCatalogVersion, 'free-200-v1');
assert.deepStrictEqual(manifest.runtimePaidCatalogVersions, ['paid-queue-189-v1', source.catalogVersion]);
assert.strictEqual(manifest.runtimeRecordCount, 582);
assert.strictEqual(old.length, 189);
assert.strictEqual(paid.length, 382);
assert.deepStrictEqual(paid.reduce((counts, record) => {
  counts[record.level] = (counts[record.level] || 0) + 1;
  return counts;
}, {}), { '初': 369, '中': 13 });
assert.strictEqual(new Set(paid.map((record) => record.contentKey)).size, 382);
assert.strictEqual(new Set(paid.map((record) => `${record.word}\u0000${record.zhTW}\u0000${record.level}`)).size, 382);
assert.strictEqual(new Set(paid.map((record) => record.word)).size, 379);
assert.strictEqual(ownerCatalog.length, 582);
assert.deepStrictEqual(ownerCatalog.reduce((counts, record) => {
  counts[record.level] = (counts[record.level] || 0) + 1;
  return counts;
}, {}), { '初': 469, '中': 113 });
assert.strictEqual(new Set(ownerCatalog.map((record) => record.contentKey)).size, 582);
assert.strictEqual(new Set(ownerCatalog.map((record) => `${record.word}\u0000${record.zhTW}\u0000${record.level}`)).size, 582);
assert.strictEqual(new Set(ownerCatalog.map((record) => record.word)).size, 575);
const sameWritten = new Map();
ownerCatalog.forEach((record) => {
  const records = sameWritten.get(record.word) || [];
  records.push(record);
  sameWritten.set(record.word, records);
});
const sameWrittenDifferentSense = [...sameWritten.entries()].filter(([, records]) => records.length > 1);
assert.deepStrictEqual(new Set(sameWrittenDifferentSense.map(([word]) => word)),
  new Set(['ผม', 'เขา', 'หนู', 'เงิน', 'ร้อง', 'อุ่น', 'คัน']));
sameWrittenDifferentSense.forEach(([, records]) => {
  assert.strictEqual(new Set(records.map((record) => `${record.zhTW}\u0000${record.contentKey}`)).size, records.length);
});
assert.strictEqual(manifest.batches[1].sourceSha256,
  crypto.createHash('sha256').update(sourceText).digest('hex'));

const paths = (record) => Array.isArray(record.categoryPaths) ? record.categoryPaths : [];
const hasType = (record, type) => String(record.type || '').includes(type);
const hasCategory = (record, fragment) => paths(record).some((value) => String(value).includes(fragment));
const roles = {
  nouns: ownerCatalog.filter((record) => hasType(record, '名詞') || hasCategory(record, '名詞')),
  verbs: ownerCatalog.filter((record) => hasType(record, '動詞') || hasType(record, 'กริยา') || paths(record).includes('動詞')),
  locations: ownerCatalog.filter((record) => hasCategory(record, '地點') || hasCategory(record, '住宅')),
  people: ownerCatalog.filter((record) => hasCategory(record, '人物') || hasCategory(record, '家庭') || hasCategory(record, '職業') || hasType(record, 'สรรพนาม')),
  time: ownerCatalog.filter((record) => hasType(record, '時間詞') || hasCategory(record, '時間詞') || record.category === '時間'),
};
assert.deepStrictEqual(Object.fromEntries(Object.entries(roles).map(([role, records]) => [role, records.length])), {
  nouns: 234, verbs: 240, locations: 19, people: 29, time: 28,
});
for (const records of Object.values(roles)) {
  assert.ok(records.every((record) => ownerCatalog.includes(record) && record.contentKey), 'Lego roles must remain exact central records');
}

assert.match(edge, /FREE_RUNTIME_CATALOG_VERSION = 'free-200-v1'/);
assert.match(edge, /PAID_RUNTIME_CATALOG_VERSIONS = \['paid-queue-189-v1', 'paid-queue-193-v1'\]/);
assert.match(edge, /paid:\s*{\s*'初':\s*469,\s*'中':\s*113,\s*sentences:\s*40\s*}/);
assert.match(edge, /PAID_ONLY_CAPS = \{ '初': 369, '中': 13 \}/);
assert.match(edge, /GAME_SURFACES = new Set\(\['tone', 'reading', 'typing', 'word_order', 'listening', 'lego'\]\)/);
assert.match(edge, /selectWords\(level, \['active'\], \['guest', 'login'\], \[FREE_RUNTIME_CATALOG_VERSION\], CAPS\.login\[level\]\)/);
assert.match(edge, /selectWords\(level, \['queued'\], \['paid'\], PAID_RUNTIME_CATALOG_VERSIONS, PAID_ONLY_CAPS\[level\]\)/);
assert.match(edge, /freeWords\.data\?\.length !== CAPS\.login\[level\] \|\| paidWords\.data\?\.length !== PAID_ONLY_CAPS\[level\]/);
assert.match(edge, /owner_catalog_incomplete/);
assert.match(edge, /data: \[\.\.\.freeWords\.data, \.\.\.paidWords\.data\]/);
assert.doesNotMatch(edge, /paidTone|paid_beta/);

assert.match(client, /GAME_SURFACES = \{ tone: true, reading: true, typing: true, word_order: true, listening: true, lego: true \}/);
assert.match(client, /PAID_CONTENT_ACCESS = data\.tier === 'paid'/);
assert.match(client, /PAID_SRS_PRIVATE_BETA = data\.tier === 'paid' && game === 'tone'/);
assert.doesNotMatch(client, /paidBetaRequested|paid_beta|paid-beta=1/);

for (const [page, game] of [
  ['tone-finder.html', 'tone'], ['reading-game.html', 'reading'], ['typing-game.html', 'typing'],
  ['word-order.html', 'word_order'], ['listening-game.html', 'listening'], ['lego.html', 'lego'],
]) {
  const html = read(page);
  assert.match(html, new RegExp(`GameContentLoader\\.boot\\([\\s\\S]*\\{game:'${game}'\\}`), `${page} must boot the central catalog`);
  assert.doesNotMatch(html, /src=["']data\/(?:words-data|adv-sentences)\.js/);
}

assert.match(legoPage, /game-content-client\.js\?v=23/);
assert.match(lego, /const CENTRAL_CATALOG=Array\.isArray\(window\.WORDS_MASTER\)[\s\S]{0,120}\.map\(row=>row&&row\.catalog\)/);
assert.match(lego, /const CENTRAL_NOUNS=legoUniqueRole/);
assert.match(lego, /const CENTRAL_VERBS=legoUniqueRole/);
assert.match(lego, /const LOCATION_WORDS=legoUniqueRole/);
assert.match(lego, /contentKey:String\(word\.contentKey\|\|''\)/);
assert.doesNotMatch(lego, /const SLEEP_LOCATION|const SUBJ_EXTRA|objTags|tags:\['/);

assert.match(audio, /var GAME_AUDIO_ENABLED = true/);
assert.doesNotMatch(listeningPage, /coming-soon|即將開幕|Preserved paused runtime/);
assert.match(listeningPage, /GameContentLoader\.boot\(\['js\/games\/listening-game-app\.js\?v=20'\], \{game:'listening'\}\)/);

console.log('FREE_200_PLUS_PAID_382_SINGLE_CENTRAL_STORE_ALL_SIX_GAMES_PASS');
