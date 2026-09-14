#!/usr/bin/env node
'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const app = read('js/games/reading-game-app.js');
const edge = read('supabase/functions/game-content/index.ts');
const client = read('js/games/game-content-client.js');
const free = JSON.parse(read('data/approved-vocabulary-catalog.json')).records;
const paidQueueSource = read('supabase/migrations/20260905085037_queue_approved_paid_vocabulary_189.sql');
const correction = read('supabase/migrations/20260914034434_correct_paid_vocabulary_muen_vowel.sql');
const sundayCorrection = read('supabase/migrations/20260914041046_correct_free_vocabulary_sunday_final.sql');

const paidPayloadMatch = paidQueueSource.match(/jsonb_to_recordset\(\$paidqueue\$(\[[\s\S]*?\])\$paidqueue\$::jsonb\)/);
assert(paidPayloadMatch, 'Paid 189 canonical payload missing');
const paidRows = JSON.parse(paidPayloadMatch[1]);

// Historical migration bytes stay immutable. The additive migration is the current source
// candidate and remains unapplied until the separate Production HIGH-risk authorization.
const target = paidRows.find((row) => row.content_key === 'หมื่น@初#numeral');
assert(target, 'exact หมื่น Paid record missing');
assert.strictEqual(target.syls[0].vowel, 'อือ');
assert.strictEqual(target.canonical_record.syllables[0].vowel, 'อือ');
assert.strictEqual(target.record_hash, '4a4771833b1c3c8b7584e59b72e5b9f4a0548cce8f2de6b50d48787c2d19c441');
assert.match(correction, /content_key='หมื่น@初#numeral'/);
assert.match(correction, /syls=jsonb_set\(syls,'\{0,vowel\}',to_jsonb\('อื'::text\),false\)/);
assert.match(correction, /canonical_record=jsonb_set\(canonical_record,'\{syllables,0,vowel\}',to_jsonb\('อื'::text\),false\)/);
assert.match(correction, /record_hash='dba54c6b1fc876b5dd94a13d28484fcff6ffb102e06e828d4472227ce1e34164'/);
assert.match(correction, /status='active'\) <> 200/);
assert.match(correction, /status='queued' and access_tier='paid'\) <> 189/);

const effectivePaidRows = structuredClone(paidRows);
const effectiveTarget = effectivePaidRows.find((row) => row.content_key === 'หมื่น@初#numeral');
effectiveTarget.syls[0].vowel = 'อื';
effectiveTarget.canonical_record.syllables[0].vowel = 'อื';
effectiveTarget.record_hash = crypto.createHash('sha256')
  .update(JSON.stringify(effectiveTarget.canonical_record)).digest('hex');
assert.strictEqual(effectiveTarget.record_hash, 'dba54c6b1fc876b5dd94a13d28484fcff6ffb102e06e828d4472227ce1e34164');

const sunday = free.find((record) => record.contentKey === 'วันอาทิตย์@中#weekday');
assert(sunday, 'exact วันอาทิตย์ Free record missing');
assert.strictEqual(sunday.syllables[2].writtenFinal, 'ต');
assert.strictEqual(sunday.syllables[2].finalReadDifference, 'ต > ด');
assert.strictEqual(sunday.spellingSyllables[2].final, 'ต');
assert.strictEqual(sunday.spellingSyllables[2].finalRead, 'ด');
assert.match(sundayCorrection, /content_key='วันอาทิตย์@中#weekday'/);
assert.match(sundayCorrection, /syls=jsonb_set\(syls,'\{2,finalRead\}',to_jsonb\('ด'::text\),true\)/);
assert.match(sundayCorrection, /canonical_record=jsonb_set\(canonical_record,'\{syllables,2,finalReadDifference\}',to_jsonb\('ต > ด'::text\),false\)/);
assert.match(sundayCorrection, /record_hash='ae05e924dbf8fde1798f0cd52e2871b3eec81b20da838bb9f381ac5d97b37a08'/);
assert.match(sundayCorrection, /record_hash='ba2693e24ef82122865f5ea91644fd409a42079e087bc74054cebd08de103af5'/);
assert.match(sundayCorrection, /status='active'\) <> 200/);
assert.match(sundayCorrection, /status='active' and access_tier='guest'\) <> 100/);
assert.match(sundayCorrection, /status='active' and access_tier='login'\) <> 100/);
assert.match(sundayCorrection, /'4be1d6442da1c2980b1e084aafc45394'/);
assert.match(sundayCorrection, /'a4f1e08f18ca5ff86a358945452d1486'/);

const records = free.concat(effectivePaidRows.map((row) => row.canonical_record));
assert.strictEqual(free.length, 200);
assert.strictEqual(effectivePaidRows.length, 189);
assert.strictEqual(records.length, 389);
assert.strictEqual(new Set(records.map((record) => record.contentKey)).size, 389);

function block(start, end) {
  const from = app.indexOf(start);
  const to = app.indexOf(end, from);
  assert.ok(from >= 0 && to > from, `Reading source block missing: ${start}`);
  return app.slice(from, to);
}

let randomState = 0x51f15e;
const deterministicMath = Object.create(Math);
deterministicMath.random = () => {
  randomState = (randomState * 1664525 + 1013904223) >>> 0;
  return randomState / 0x100000000;
};
const context = { Math: deterministicMath };
vm.createContext(context);
vm.runInContext(block('var CONS_GROUPS=', '// ════════════════════════════════════════════\n// PHONETIC MAPS'), context);
vm.runInContext(block('function shuffle(a)', '// ════════════════════════════════════════════\n// LEVEL SWITCH'), context);

const allowedVowels = [
  'อะ','อา','ออ','เอาะ','เออะ','โอ','ไอ','ใอ','โอะ','อุ','อู','อิ','อี',
  'อื','อึ','เอะ','แอะ','เอ','แอ','เออ','เอา','เอีย','เอือ','อัว','อำ'
];
const forbiddenVowels = new Set(['เอิ','อั','แอ็','เอ็','อ็','็อ','อือ']);
const allowedFinals = new Set(['ก','ง','น','ม','ย','ว','ด','บ']);
const consonantOrder = ['ก','ภ','ถ','ข','ช','ซ','ค','ด','ศ','ต','บ','ษ','ป','พ','ฟ','ผ','ฝ','ม','ห','น','ฆ','อ','ย','ท','ร','ธ','ล','ส','ฉ','จ','ง','ว','ฎ','ฏ','ญ','ณ','ฌ','ฒ','ฬ','ฐ','ฑ','ฮ'];

assert.deepStrictEqual(Array.from(context.CP), consonantOrder, 'consonant distractor order/groups changed');
assert.deepStrictEqual(Array.from(context.VP), allowedVowels, 'vowel choice inventory must be exact');
assert.deepStrictEqual(new Set(Array.from(context.FP)), allowedFinals, 'final choice inventory must be exact');
assert.deepStrictEqual(JSON.parse(JSON.stringify(context.READING_FINAL_EXCEPTIONS)), {
  'อีเมล@中#noun-b-11': 'ล'
}, 'only Lin-approved อีเมล may use the special final answer');
assert.strictEqual(Array.from(context.VP).some((value) => forbiddenVowels.has(value)), false);
assert.strictEqual(Array.from(context.FP).includes('ไม่มี'), false);

const choiceSource = block('// build optTypes + options', 'renderOptions(optTiles);');
assert.doesNotMatch(choiceSource, /\bavoid\b/, 'cross-heading repeated-answer ban must stay removed');
assert.match(choiceSource, /comp==='cons'[\s\S]*reviewedReadingAnswer\(W\.cons,W\.consRead,'consonant'\)/);
assert.match(choiceSource, /comp==='vowel'\)\{ans=reviewedReadingVowel\(W\.vowel\);/);
assert.match(choiceSource, /comp==='final'[\s\S]*reviewedReadingFinal\(W\.final,W\.finalRead,WORD\.contentKey\)/);

let syllableCount = 0;
let sameConsonantAndFinalCount = 0;
let asciiDifferenceCount = 0;
let arrowDifferenceCount = 0;
const observedVowels = new Set();
const unresolvedFinals = [];
let specialFinalCount = 0;

records.forEach((record) => record.syllables.forEach((syllable, syllableIndex) => {
  const label = `${record.contentKey}:${syllableIndex}`;
  syllableCount += 1;
  observedVowels.add(syllable.vowel);
  assert.ok(allowedVowels.includes(syllable.vowel), `${label}: vowel outside exact inventory`);
  assert.strictEqual(forbiddenVowels.has(syllable.vowel), false, `${label}: forbidden vowel`);
  assert.strictEqual(context.reviewedReadingVowel(syllable.vowel), syllable.vowel, `${label}: vowel must remain exact`);

  ['consonantReadDifference', 'finalReadDifference'].forEach((field) => {
    const value = syllable[field];
    if (value !== 'ไม่มี') {
      assert.match(value, /^.+ (?:>|\u2192) .+$/, `${label}: malformed ${field}`);
      if (value.includes(' > ')) asciiDifferenceCount += 1;
      if (value.includes(' → ')) arrowDifferenceCount += 1;
    }
  });

  const consonant = context.reviewedReadingAnswer(
    syllable.consonant, syllable.consonantReadDifference, 'consonant'
  );
  const hasFinal = context.reviewedPresent(syllable.writtenFinal);
  const finalAnswer = hasFinal
    ? context.reviewedReadingAnswer(syllable.writtenFinal, syllable.finalReadDifference, 'final')
    : null;
  if (hasFinal) {
    const specialFinal = context.READING_FINAL_EXCEPTIONS[record.contentKey] === finalAnswer;
    if (!allowedFinals.has(finalAnswer) && !specialFinal) {
      unresolvedFinals.push({
        contentKey: record.contentKey,
        syllableIndex,
        writtenFinal: syllable.writtenFinal,
        finalReadDifference: syllable.finalReadDifference,
        effectiveAnswer: finalAnswer
      });
      assert.throws(
        () => context.reviewedReadingFinal(syllable.writtenFinal, syllable.finalReadDifference),
        /CATALOG_AUTHORITY_INCOMPLETE:reading final answer/,
        `${label}: unresolved final must fail closed`
      );
    } else {
      if (specialFinal) specialFinalCount += 1;
      assert.strictEqual(
        context.reviewedReadingFinal(syllable.writtenFinal, syllable.finalReadDifference, record.contentKey),
        finalAnswer,
        `${label}: reviewed final must remain exact`
      );
    }
  } else {
    assert.strictEqual(syllable.finalReadDifference, 'ไม่มี', `${label}: absent final cannot carry an answer`);
  }

  const w = {
    cons: syllable.consonant,
    consRead: syllable.consonantReadDifference,
    vowel: syllable.vowel,
    final: syllable.writtenFinal,
    finalRead: syllable.finalReadDifference,
    tone: syllable.toneMark,
    lead: syllable.lead
  };
  const components = Array.from(context.readingComponentsFor(w));
  const counts = context.readingOptionCounts(components);
  assert.strictEqual(components.includes('final'), hasFinal, `${label}: final heading presence mismatch`);
  assert.strictEqual(components.includes('tone'), context.reviewedPresent(syllable.toneMark), `${label}: tone heading presence mismatch`);

  const definitions = {
    cons: { answer: consonant, groups: context.CONS_GROUPS, pool: context.CP, exclude: context.reviewedPresent(syllable.lead) ? syllable.lead : null },
    vowel: { answer: context.reviewedReadingVowel(syllable.vowel), groups: context.VOWEL_GROUPS, pool: context.VP, exclude: null },
    final: { answer: finalAnswer, groups: context.FINAL_GROUPS, pool: context.FP, exclude: null },
    tone: { answer: syllable.toneMark, groups: [context.TONE_POOL], pool: context.TONE_POOL, exclude: null }
  };

  components.forEach((component) => {
    const def = definitions[component];
    if (component === 'final' && !allowedFinals.has(finalAnswer) && context.READING_FINAL_EXCEPTIONS[record.contentKey] !== finalAnswer) return;
    const options = Array.from(context.buildOpts(
      def.answer, component, def.groups, def.pool, counts[component], def.exclude
    ));
    assert.strictEqual(options.length, counts[component], `${label}:${component}: option count`);
    assert.strictEqual(new Set(options).size, options.length, `${label}:${component}: duplicate option`);
    assert.strictEqual(options.filter((value) => value === def.answer).length, 1, `${label}:${component}: correct answer count`);
    assert.strictEqual(options.includes('ไม่มี'), false, `${label}:${component}: no-answer option leaked`);
    if (component === 'vowel') options.forEach((value) => assert.ok(allowedVowels.includes(value), `${label}: invalid vowel option`));
    if (component === 'final') {
      options.forEach((value) => assert.ok(
        allowedFinals.has(value) || (value === finalAnswer && context.READING_FINAL_EXCEPTIONS[record.contentKey] === value),
        `${label}: invalid final option`
      ));
    }
    if (component === 'tone') assert.strictEqual(options.length, 2, `${label}: tone must have two choices`);
  });

  if (hasFinal && consonant === finalAnswer) {
    sameConsonantAndFinalCount += 1;
    assert.ok(components.includes('cons') && components.includes('final'), `${label}: same value must retain both headings`);
  }
}));

assert.strictEqual(syllableCount, 601);
assert.ok(sameConsonantAndFinalCount > 0, 'full set must exercise separate same-value consonant/final headings');
assert.ok(asciiDifferenceCount > 0 && arrowDifferenceCount > 0, 'both exact reviewed difference delimiters must be exercised');
assert.strictEqual(observedVowels.has('อื'), true);
assert.strictEqual(observedVowels.has('อือ'), false);
assert.deepStrictEqual(unresolvedFinals, [], 'every Current final answer must be resolved');
assert.strictEqual(specialFinalCount, 1, 'อีเมล must be the only special final answer');
assert.throws(
  () => context.reviewedReadingAnswer('ภ', 'ศ > ส', 'consonant'),
  /CATALOG_AUTHORITY_INCOMPLETE:reading consonant pronunciation answer/
);

// Full real path: the server forwards canonical_record, the browser copies exact fields,
// and Reading alone selects the stored reviewed pronunciation for consonant/final answers.
assert.match(edge, /select\('catalog:canonical_record'\)/);
assert.match(edge, /const words = \(w1\.data \|\| \[\]\)\.concat\(w2\.data \|\| \[\]\);[\s\S]*words\.forEach\(validateWord\)/);
assert.match(edge, /return json\(\{ tier, game: requestedGame \|\| null, words, sentences/);
assert.doesNotMatch(edge, /runtimeSpelling|spellingParts|\.map\(toWord\)/);
assert.match(client, /cons: record\.consonant/);
assert.match(client, /vowel: record\.vowel/);
assert.match(client, /final: record\.writtenFinal/);
assert.match(client, /consRead: record\.consonantReadDifference/);
assert.match(client, /finalRead: record\.finalReadDifference/);
assert.match(client, /function validateCatalogPayload\(master\) \{\s*projectWords\(master\);[^}]*return master;/);

console.log(`READING_CURRENT_389_PASS records=389 syllables=${syllableCount} special-finals=${specialFinalCount}`);
