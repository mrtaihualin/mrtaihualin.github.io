const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const migrationPath = 'supabase/migrations/20260921115145_central_sentence_library_v1.sql';
const migration = fs.readFileSync(migrationPath, 'utf8');
const sentenceSource = fs.readFileSync('data/adv-sentences.js', 'utf8');

function check(name, fn) {
  fn();
  console.log('PASS ' + name);
}

check('migration is additive and does not mutate Learning Item or user history rows', () => {
  assert.doesNotMatch(migration, /\bdelete\s+from\s+public\.(?:game_sentences|learning_items|learning_saved_items|practice_events|learning_memory)\b/i);
  assert.doesNotMatch(migration, /\bupdate\s+public\.(?:learning_items|learning_saved_items|practice_events|learning_memory)\b/i);
  assert.doesNotMatch(migration, /\bdrop\s+table\b/i);
  assert.match(migration, /add column if not exists content_key text/);
  assert.match(migration, /add column if not exists canonical_record jsonb/);
  assert.match(migration, /add column if not exists readiness jsonb/);
});

check('stable identity never depends on mutable sentence text', () => {
  assert.match(migration, /'sentence-high-' \|\| pg_catalog\.lpad\(rank::text, 3, '0'\)/);
  assert.match(migration, /CENTRAL_SENTENCE_CONTENT_KEY_IMMUTABLE/);
  assert.match(migration, /game_sentence_key_aliases/);
  assert.match(migration, /resolve_game_sentence_content_key/);
  assert.match(migration, /CENTRAL_SENTENCE_PRIOR_TEXT_ALIAS_REQUIRED/);
});

check('only the approved Word Order readiness is activated at library creation', () => {
  assert.match(migration, /surfaces = coalesce\(surfaces, array\['word_order'\]::text\[\]\)/);
  assert.match(migration, /'word_order', 'ready'/);
  assert.match(migration, /'typing', 'incomplete'/);
  assert.match(migration, /'tone', 'pending_contract'/);
  assert.match(migration, /CENTRAL_SENTENCE_SURFACE_CONTRACT_NOT_INSTALLED/);
});

check('sentence and every word occurrence carry the vocabulary-parity field structure', () => {
  [
    "'reviewSet'", "'spellingTH'", "'readingTH'", "'roman'", "'zhTW'",
    "'level'", "'type'", "'category'", "'audioStatus'", "'approvalRefs'",
    "'syllables'", "'spellingSyllables'",
  ].forEach((field) => assert.match(migration, new RegExp(field)));
  [
    "'sentenceTH'", "'wordOccurrences'", "'wordOrderAnswers'", "'wordCount'",
    "'spacingPolicy'", "'punctuationPolicy'", "'politeEndingPolicy'",
  ].forEach((field) => assert.match(migration, new RegExp(field)));
  assert.match(migration, /'toneNumber', syllable\.value->'toneNumber'/);
  assert.match(migration, /'liveDead', syllable\.value->>'liveDead'/);
  assert.match(migration, /Typing-specific policy values stay null until Lin-reviewed content supplies them/);
});

check('catalog and alias tables remain server-gated', () => {
  assert.match(migration, /alter table public\.game_sentences enable row level security/);
  assert.match(migration, /revoke all on table public\.game_sentences from public, anon, authenticated/);
  assert.match(migration, /alter table public\.game_sentence_key_aliases enable row level security/);
  assert.match(migration, /revoke all on table public\.game_sentence_key_aliases from public, anon, authenticated/);
  assert.match(migration, /grant select on table public\.game_sentences to service_role/);
  assert.match(migration, /grant select on table public\.game_sentence_key_aliases to service_role/);
});

const context = {};
context.window = context;
context.globalThis = context;
vm.createContext(context);
vm.runInContext(sentenceSource, context, { filename: 'data/adv-sentences.js' });
const sentences = context.ADV_SENTENCES;

check('current 42 sentence records remain exact Word Order-ready content', () => {
  assert.ok(Array.isArray(sentences));
  assert.equal(sentences.length, 42);
  const seen = new Set();
  sentences.forEach((sentence) => {
    assert.equal(typeof sentence.th, 'string');
    assert.ok(sentence.th.length > 0);
    assert.equal(typeof sentence.zh, 'string');
    assert.ok(sentence.zh.length > 0);
    assert.ok(Array.isArray(sentence.words));
    assert.ok(sentence.words.length > 0 && sentence.words.length <= 16);
    assert.equal(sentence.words.map((word) => word.th).join(''), sentence.th);
    sentence.words.forEach((word) => {
      assert.equal(typeof word.th, 'string');
      assert.ok(word.th.length > 0);
      assert.equal(typeof word.zh, 'string');
      assert.ok(word.zh.length > 0);
    });
    assert.equal(seen.has(sentence.th), false);
    seen.add(sentence.th);
  });
});

check('new full-parity Typing readiness is not fabricated from incomplete legacy fields', () => {
  const syllables = sentences.flatMap((sentence) => sentence.words.flatMap((word) => word.syls || []));
  assert.ok(syllables.length > 0);
  assert.ok(syllables.some((syllable) => syllable.toneNumber == null));
  assert.ok(syllables.some((syllable) => syllable.liveDead == null));
  assert.doesNotMatch(migration, /'typing', 'ready'/);
});

console.log('7/7 central sentence library v1 checks PASS');
