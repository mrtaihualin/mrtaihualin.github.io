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
const manifest = JSON.parse(read('data/approved-paid-vocabulary-queue.json'));
const edge = read('supabase/functions/game-content/index.ts');
const client = read('js/games/game-content-client.js');
const legoPage = read('lego.html');
const lego = read('js/games/lego-game-app.js');
const listeningPage = read('listening-game.html');
const audio = read('js/games/protected-word-audio.js');

assert.strictEqual(source.recordCount, 193);
assert.deepStrictEqual(source.levelCounts, { '初': 186, '中': 7 });
assert.strictEqual(source.runtimeScope, 'all-six-owner_all_access-only');
assert.strictEqual(manifest.runtimeConsumption, 'all-six-owner_all_access-paid193-only');
assert.strictEqual(manifest.runtimeCatalogVersion, source.catalogVersion);
assert.strictEqual(manifest.runtimeRecordCount, source.recordCount);
assert.strictEqual(manifest.batches[1].sourceSha256,
  crypto.createHash('sha256').update(sourceText).digest('hex'));

const paths = (record) => Array.isArray(record.categoryPaths) ? record.categoryPaths : [];
const hasType = (record, type) => String(record.type || '').includes(type);
const hasCategory = (record, fragment) => paths(record).some((value) => String(value).includes(fragment));
const roles = {
  nouns: source.records.filter((record) => hasType(record, '名詞') || hasCategory(record, '名詞')),
  verbs: source.records.filter((record) => hasType(record, '動詞') || hasType(record, 'กริยา') || paths(record).includes('動詞')),
  locations: source.records.filter((record) => hasCategory(record, '地點') || hasCategory(record, '住宅')),
  people: source.records.filter((record) => hasCategory(record, '人物') || hasCategory(record, '家庭') || hasCategory(record, '職業') || hasType(record, 'สรรพนาม')),
  time: source.records.filter((record) => hasType(record, '時間詞') || hasCategory(record, '時間詞') || record.category === '時間'),
};
assert.deepStrictEqual(Object.fromEntries(Object.entries(roles).map(([role, records]) => [role, records.length])), {
  nouns: 141, verbs: 13, locations: 19, people: 14, time: 9,
});
for (const records of Object.values(roles)) {
  assert.ok(records.every((record) => source.records.includes(record) && record.contentKey), 'Lego roles must remain exact central records');
}

assert.match(edge, /PAID_RUNTIME_CATALOG_VERSION = 'paid-queue-193-v1'/);
assert.match(edge, /paid:\s*{\s*'初':\s*186,\s*'中':\s*7,\s*sentences:\s*40\s*}/);
assert.match(edge, /GAME_SURFACES = new Set\(\['tone', 'reading', 'typing', 'word_order', 'listening', 'lego'\]\)/);
assert.match(edge, /query = query\.eq\('catalog_version', PAID_RUNTIME_CATALOG_VERSION\)/);
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

console.log('PAID_193_SINGLE_CENTRAL_STORE_ALL_SIX_GAMES_PASS');
