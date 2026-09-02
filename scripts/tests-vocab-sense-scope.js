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
const verbs = words.filter((row) => row.category === 'กริยา');
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
  assert.strictEqual(Object.prototype.hasOwnProperty.call(row, 'imageStatus'), false);
  assert.strictEqual(row.audioStatus, 'ยังไม่เช็ก');
});
assert.strictEqual(verbs.length, 225, 'Final Notes must contain 225 semantic verb records');
assert.strictEqual(new Set(verbs.map((row) => row.word)).size, 224, 'Final Notes must contain 224 written verbs');
assert.strictEqual(new Set(verbs.filter((row) => row.syls.length === 1).map((row) => row.word)).size, 167);
assert.strictEqual(new Set(verbs.filter((row) => row.syls.length > 1).map((row) => row.word)).size, 57);
assert.ok(verbs.every((row) => Object.keys(row).every((key) => !/sub.?cat|subcategory/i.test(key))),
  'reviewed verbs use category กริยา without subcategories');
verbs.forEach((row) => {
  const spellingParts = row.spellingTH.split('-');
  const readingParts = row.readingTH.split('-');
  assert.strictEqual(spellingParts.length, row.syls.length, row.word + ' spelling syllable count');
  assert.strictEqual(readingParts.length, row.syls.length, row.word + ' reading syllable count');
  assert.strictEqual(spellingParts.join(''), row.word, row.word + ' written syllables join');
  assert.strictEqual(row.audioStatus, 'ยังไม่เช็ก');
  assert.strictEqual(Object.prototype.hasOwnProperty.call(row, 'imageStatus'), false);
  row.syls.forEach((syllable, index) => {
    assert.strictEqual(syllable.th, spellingParts[index]);
    assert.strictEqual(Object.prototype.propertyIsEnumerable.call(syllable, 'th'), false,
      row.word + ' must derive syllable text instead of storing it redundantly');
  });
});
assert.ok(words.every((row) => !Object.prototype.hasOwnProperty.call(row, 'objectUse')),
  'object-use metadata is removed from the vocabulary catalog');
assert.ok(verbs.every((row) => !Object.prototype.hasOwnProperty.call(row, 'imageStatus')),
  'image metadata is removed from the reviewed verb catalog');
assert.ok(words.every((row) => !Object.prototype.hasOwnProperty.call(row, 'imageStatus')),
  'image metadata is absent from the central vocabulary source');
const one = (word) => verbs.find((row) => row.word === word);
Object.entries({
  'พบ': '見（正式）', 'เจอ': '遇到 / 見面', 'เปลี่ยน': '改變 / 換', 'หยิบ': '拿起',
  'วาง': '放', 'โยน': '扔', 'หุง': '煮（米）', 'ต้ม': '水煮/燉', 'นัด': '約人',
  'แชท': '打字聊天', 'แซง': '超車/插隊', 'เชิญ': '請',
}).forEach(([word, zh]) => assert.strictEqual(one(word).zh, zh, word + ' Chinese meaning'));
assert.strictEqual(one('ทบทวน').level, '中');
assert.strictEqual(one('ถ่ายรูป').level, '初');
assert.strictEqual(one('สระผม').level, '初');
assert.strictEqual(one('เต้น').syls[0].vowel, 'เอ');
assert.strictEqual(one('ตื่นเต้น').syls[1].vowel, 'เอ');
assert.strictEqual(one('ค้นคว้า').en, 'khón-khwáa');
assert.strictEqual(Object.prototype.hasOwnProperty.call(one('เสียใจ').syls[0], 'final'), false);
assert.strictEqual(one('อธิบาย').syls[1].cons, 'ธ');
assert.strictEqual(one('อธิบาย').syls[1].consRead, 'ท');
assert.deepStrictEqual([one('สระผม').syls[0].cluster, one('สระผม').syls[0].silent], ['ร', 'ร']);
assert.deepStrictEqual([one('สร้าง').syls[0].cluster, one('สร้าง').syls[0].silent], ['ร', 'ร']);
assert.deepStrictEqual([one('ภูมิใจ').syls[0].final, one('ภูมิใจ').syls[0].finalDisp, one('ภูมิใจ').syls[0].finalRead], ['ม', 'มิ', 'ม']);
assert.deepStrictEqual([one('แชท').toneSpecial, one('แชท').toneOverride, one('แชท').toneDerivation], [1, 4, 0]);
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
assert.match(loader, /validateAndHydrateSyllableText/);
assert.match(loader, /spellingTH: w\.spellingTH/);
assert.doesNotMatch(loader, /objectUse|object_use/);
assert.match(loader, /JSON\.stringify\(game \? \{ game: game \} : \{\}\)/);
assert.match(loader, /boot: function \(appScriptSrcs, options\)/);

const edge = read('supabase/functions/game-content/index.ts');
assert.match(edge, /const surface = requestedGame \|\| 'legacy'/);
assert.match(edge, /\.eq\('status', 'active'\)\.contains\('surfaces', \[surface\]\)/);
assert.match(edge, /\.order\('review_priority', \{ ascending: false \}\)/);
assert.match(edge, /contentKey: r\.content_key/);
assert.match(edge, /spellingTH: r\.spelling_th/);
assert.match(edge, /game_word_syllable_authority_mismatch/);
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
const toneGame = read('js/games/tone-finder-game.js');
assert.match(toneGame, /'แชท':\s+4/);
assert.match(toneGame, /entry\.toneSpecial === 1 && entry\.toneDerivation === 0/);
assert.match(toneGame, /Number\(entry\.toneOverride\)/);
assert.match(toneGame, /คำพิเศษ \(TONE_OVERRIDE\).*เฉลยทันที/);
assert.match(toneGame, /คำพิเศษ \(TONE_OVERRIDE\) ไม่มีปุ่ม/);
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
assert.match(migration, /add column if not exists spelling_th text/);
assert.doesNotMatch(migration, /image_status/);
assert.doesNotMatch(migration, /objectUse|object_use|มีกรรม|ไม่มีกรรม/);
assert.match(migration, /revoke all on table public\.game_words from anon, authenticated/);

const migrate = read('scripts/migrate-game-content.js');
assert.match(migrate, /upsertRows\(SUPABASE_URL, SERVICE_KEY, 'game_words', wordRows, 'content_key'\)/);
assert.match(migrate, /syncLearningWordIdentities/);
assert.match(migrate, /DEFAULT_WORD_SURFACES/);
assert.match(migrate, /spelling_th: w\.spellingTH/);
assert.doesNotMatch(migrate, /image_status/);
assert.doesNotMatch(migrate, /objectUse|object_use/);
const { toWordRow } = require(path.join(root, 'scripts/migrate-game-content.js'));
const migratedVerb = toWordRow(one('อธิบาย'), '中', 1);
assert.strictEqual(migratedVerb.spelling_th, 'อ-ธิ-บาย');
assert.strictEqual(migratedVerb.reading_th, 'อะ-ธิ-บาย');
assert.strictEqual(migratedVerb.audio_status, 'ยังไม่เช็ก');
assert.strictEqual(Object.prototype.hasOwnProperty.call(migratedVerb, 'image_status'), false);
assert.strictEqual(JSON.stringify(migratedVerb.syls).includes('"th"'), false,
  'synced reviewed verb JSON must omit derived syllable text');

const runbook = read('supabase/functions/game-content/README.md');
assert.match(runbook, /release in this order/);
assert.match(runbook, /Deploy the five protected-content pages last/);
assert.match(runbook, /Rollback in reverse/);

console.log('✅ Vocabulary sense/surface/identity source contracts PASS');
