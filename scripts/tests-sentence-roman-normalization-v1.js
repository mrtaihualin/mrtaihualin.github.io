const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const source = fs.readFileSync('data/adv-sentences.js', 'utf8');
const migration = fs.readFileSync(
  'supabase/migrations/20260921155846_normalize_central_sentence_roman_v1.sql',
  'utf8',
);
const rollback = fs.readFileSync(
  'supabase/recovery/sentence-roman-normalization-v1/rollback.sql',
  'utf8',
);

const context = {};
context.window = context;
context.globalThis = context;
vm.createContext(context);
vm.runInContext(source, context, { filename: 'data/adv-sentences.js' });

const sentences = context.ADV_SENTENCES;
assert.ok(Array.isArray(sentences));
assert.equal(sentences.length, 42);

const occurrences = sentences.flatMap((sentence) =>
  sentence.words.flatMap((word) => (word.syls || []).map((syllable) => ({ sentence, word, syllable }))),
);

const expected = new Map([
  ['ผม', ['phǒm', 10]],
  ['ทำ', ['tham', 3]],
  ['ชอบ', ['chôp', 2]],
  ['ทุก', ['thúk', 2]],
]);

for (const [thai, [roman, count]] of expected) {
  const matches = occurrences.filter(({ syllable }) => syllable.th === thai);
  assert.equal(matches.length, count, `${thai} occurrence count changed`);
  assert.ok(matches.every(({ syllable }) => syllable.en === roman), `${thai} is not normalized`);
}

for (const sentence of sentences) {
  assert.equal(sentence.words.map((word) => word.th).join(''), sentence.th);
  assert.equal(
    sentence.words.flatMap((word) => word.syls || []).length,
    sentence.wc,
    `${sentence.th} syllable count changed`,
  );
}

assert.doesNotMatch(migration, /\b(?:delete|truncate)\b/i);
assert.doesNotMatch(migration, /\b(?:learning_items|learning_saved_items|practice_events|learning_memory)\b/i);
assert.match(migration, /CENTRAL_SENTENCE_ROMAN_BOUNDARY_CHANGED/);
assert.match(migration, /CENTRAL_SENTENCE_ROMAN_AFFECTED_COUNT_MISMATCH/);
assert.match(migration, /CENTRAL_SENTENCE_ROMAN_CANONICAL_SYNC_FAILED/);
assert.match(migration, /select count\(\*\) from _central_sentence_roman_updated\) <> 8/);
assert.match(migration, /set words=t\.new_words,[\s\S]*canonical_record=t\.new_canonical_record,[\s\S]*record_hash=/);

assert.match(rollback, /Emergency rollback/);
assert.match(rollback, /select count\(\*\) from _central_sentence_roman_rollback_updated\) <> 8/);
assert.match(rollback, /CENTRAL_SENTENCE_ROMAN_ROLLBACK_POSTCHECK_FAILED/);

console.log('sentence Roman normalization v1 checks PASS');
