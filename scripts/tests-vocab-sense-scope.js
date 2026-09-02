#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

global.window = global;
require(path.join(root, 'data/words-data.js'));
const words = global.WORDS_MASTER;
const reviewed = words.filter((row) => row.reviewPriority === true);
const expected = new Map([
  ['นอน@初', ['นอน', '睡／躺', '初']],
  ['ร้อง@初#sing', ['ร้อง', '唱', '初']],
  ['ร้อง@初#scream', ['ร้อง', '尖叫', '初']],
  ['คุย@初', ['คุย', '聊天', '初']],
  ['หลับ@初', ['หลับ', '睡', '初']],
  ['ตื่นนอน@中', ['ตื่นนอน', '睡醒', '中']],
  ['ร้องไห้@中', ['ร้องไห้', '哭', '中']],
]);
assert.strictEqual(reviewed.length, expected.size, 'review-priority batch must contain exactly seven records');
reviewed.forEach((row) => {
  assert.deepStrictEqual([row.word, row.zh, row.level], expected.get(row.contentKey));
  assert.deepStrictEqual(row.surfaces, ['tone', 'reading', 'typing']);
  assert.strictEqual(row.imageStatus, 'ยังไม่มีข้อมูล');
  assert.strictEqual(row.audioStatus, 'รอตรวจรวม');
});
assert.ok(words.every((row) => !Object.prototype.hasOwnProperty.call(row, 'objectUse')),
  'object-use metadata is removed from the vocabulary catalog');
assert.strictEqual(words.find((row) => row.word === 'นัด').zh, '約人');
assert.strictEqual(words.find((row) => row.word === 'แชท').zh, '打字聊天');
assert.deepStrictEqual(words.filter((row) => row.word === 'ร้อง').map((row) => row.contentKey).sort(),
  ['ร้อง@初#scream', 'ร้อง@初#sing']);

const duplicateCheck = read('data/tools/check-duplicate-words.js');
assert.match(duplicateCheck, /APPROVED_SAME_SPELLING_KEYS/);
assert.match(duplicateCheck, /ร้อง@初#sing/);
assert.match(duplicateCheck, /ร้อง@初#scream/);

const regressionGenerator = read('data/tools/regression-check-tone.js');
assert.match(regressionGenerator, /id: 'catalog:' \+ \(w\.contentKey \|\| w\.word\)/);
const regressionReport = JSON.parse(read('data/reports/tone-regression-report.json'));
assert.strictEqual(new Set(regressionReport.entries.map((row) => row.id)).size, regressionReport.entries.length,
  'review report identities must be unique');
assert.ok(regressionReport.entries.some((row) => row.id === 'catalog:ร้อง@初#sing'));
assert.ok(regressionReport.entries.some((row) => row.id === 'catalog:ร้อง@初#scream'));

const loader = read('js/games/game-content-client.js');
assert.match(loader, /contentKey: w\.contentKey/);
assert.doesNotMatch(loader, /objectUse|object_use/);
assert.match(loader, /JSON\.stringify\(game \? \{ game: game \} : \{\}\)/);
assert.match(loader, /boot: function \(appScriptSrcs, options\)/);

const edge = read('supabase/functions/game-content/index.ts');
assert.match(edge, /const surface = requestedGame \|\| 'legacy'/);
assert.match(edge, /\.eq\('status', 'active'\)\.contains\('surfaces', \[surface\]\)/);
assert.match(edge, /\.order\('review_priority', \{ ascending: false \}\)/);
assert.match(edge, /contentKey: r\.content_key/);
assert.doesNotMatch(edge, /objectUse|object_use/);

[
  ['tone-finder.html', 'tone'],
  ['reading-game.html', 'reading'],
  ['typing-game.html', 'typing'],
].forEach(([file, game]) => {
  assert.match(read(file), new RegExp("GameContentLoader\\.boot\\([^\\n]+\\{game:'" + game + "'\\}\\)"));
});
assert.doesNotMatch(read('word-order.html'), /\{game:'(?:tone|reading|typing)'\}/);

const toneServer = read('js/games/tone-server.js');
const toneRound = read('supabase/functions/tone-round/index.ts');
assert.match(toneServer, /content_key: args\.contentKey/);
assert.match(toneRound, /const stateWord = contentKey\.includes\("#"\) \? contentKey : word/);
assert.match(toneRound, /\.eq\("word", stateWord\)/);
assert.match(toneRound, /p_word: stateWord/);

[
  'js/games/tone-finder-game.js',
  'js/games/reading-game-app.js',
  'js/games/typing-game-app.js',
].forEach((file) => {
  const source = read(file);
  assert.match(source, /contentKey/);
  assert.doesNotMatch(source, /objectUse|object_use/);
  assert.match(source, /ResumeWord/);
});

const migration = read('supabase/migrations/20260902003107_vocab_sense_safe_game_scope.sql');
assert.match(migration, /set status = 'legacy', surfaces = array\[\]::text\[\]/);
assert.match(migration, /content_key = 'ร้อง@初'/);
assert.match(migration, /content_key = 'ร้องไห้@中'/);
assert.match(migration, /learning_item_key_history/);
assert.doesNotMatch(migration, /objectUse|object_use|มีกรรม|ไม่มีกรรม/);
assert.match(migration, /revoke all on table public\.game_words from anon, authenticated/);

const migrate = read('scripts/migrate-game-content.js');
assert.match(migrate, /upsertRows\(SUPABASE_URL, SERVICE_KEY, 'game_words', wordRows, 'content_key'\)/);
assert.match(migrate, /syncLearningWordIdentities/);
assert.match(migrate, /DEFAULT_WORD_SURFACES/);
assert.doesNotMatch(migrate, /objectUse|object_use/);

const runbook = read('supabase/functions/game-content/README.md');
assert.match(runbook, /release in this order/);
assert.match(runbook, /Deploy the three static pages last/);
assert.match(runbook, /Rollback in reverse/);

console.log('✅ Vocabulary sense/surface/identity source contracts PASS');
