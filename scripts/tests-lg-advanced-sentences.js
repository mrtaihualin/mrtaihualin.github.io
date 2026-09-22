#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const context = { window: {} };
vm.runInNewContext(read('data/adv-sentences.js'), context, { filename: 'adv-sentences.js' });

const rows = JSON.parse(JSON.stringify(context.window.ADV_SENTENCES_FULL));
const expected = [
  'ผมอยากกินผัดไทย',
  'พรุ่งนี้เช้าอยากไปเซเว่น',
  'หนูอยากไปกินข้าวกับเพื่อน',
  'พรุ่งนี้พี่อยากไปเที่ยวกับเพื่อน',
  'วันนี้เราอยากนอนอยู่โรงแรม',
  'ตอนเช้าอยากกินกาแฟ',
  'เย็นนี้ผมอยากดูหนังกับเพื่อน',
  'พี่อยากกลับบ้านแล้วเหรอ',
  'ตอนนี้เราอยากไปเที่ยวแล้ว',
  'อยากนอนแล้วเหรอ',
  'อยากกลับบ้านแล้วหรือยัง',
  'อยากไปซื้อของหรือเปล่า',
];

assert.strictEqual(rows.length, 42);
assert.deepStrictEqual(rows.slice(30).map((row) => row.th), expected);
assert.strictEqual(new Set(rows.map((row) => row.th)).size, 42);

rows.forEach((row) => {
  const syllables = row.words.flatMap((word) => word.syls);
  assert.strictEqual(row.words.map((word) => word.th).join(''), row.th, row.th);
  assert.strictEqual(syllables.length, row.wc, row.th);
  assert.strictEqual(row.readingTH.split('-').length, row.wc, row.th);
  syllables.forEach((syllable) => {
    ['cons', 'vowel', 'tone_name', 'th', 'en'].forEach((field) => {
      assert.strictEqual(typeof syllable[field], 'string', `${row.th}:${field}`);
      assert.ok(syllable[field].trim(), `${row.th}:${field}`);
    });
  });
});

const contentEdge = read('supabase/functions/game-content/index.ts');
assert.match(contentEdge, /login:\s*\{ '初': 100, '中': 100, sentences: 42 \}/);
assert.match(contentEdge, /paid:\s*\{ '初': 469, '中': 113, sentences: 42 \}/);
const audioEdge = read('supabase/functions/game-audio/index.ts');
assert.match(audioEdge, /login:\s*\{ '初': 100, '中': 100, sentences: 42 \}/);

const migration = read('supabase/migrations/20260922103701_add_lg001_lg012_advanced_sentences.sql');
const payloadMatch = migration.match(/\$lg\$(\[[\s\S]*?\])\$lg\$::jsonb/);
assert.ok(payloadMatch, 'migration payload missing');
const migrationRows = JSON.parse(payloadMatch[1]);
assert.strictEqual(migrationRows.length, 12);
migrationRows.forEach((row, index) => {
  const source = rows[30 + index];
  assert.strictEqual(row.rank, 31 + index);
  assert.strictEqual(row.content_key, `sentence-high-${String(31 + index).padStart(3, '0')}`);
  assert.strictEqual(row.th, source.th);
  assert.strictEqual(row.zh, source.zh);
  assert.strictEqual(row.reading_th, source.readingTH);
  assert.strictEqual(row.wc, source.wc);
  assert.strictEqual(row.polite_f, source.politeF);
  assert.deepStrictEqual(row.words, source.words);
});
assert.match(migration, /LG_ADVANCED_BASE_COUNT_MISMATCH/);
assert.match(migration, /LG_ADVANCED_CANONICAL_POSTCHECK_FAILED/);
assert.match(migration, /LG_ADVANCED_LEARNING_ITEMS_POSTCHECK_FAILED/);
assert.doesNotMatch(migration, /\bdelete\s+from\b/i);

console.log('PASS LG001-LG012 Advanced sentences: source=42, migration=12, Login/Paid cap=42');
