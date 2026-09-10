#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

[
  'data/tone-engine.js',
  'data/tools/tests-tone-engine.js',
  'data/tools/regression-check-tone.js',
  'data/tools/check-data-health.js',
  'data/tools/check-duplicate-words.js',
  'data/tools/tests-check-data-health.js',
  'js/games/games-challenge-app.js',
  'scripts/audit-learning-content.js',
  'scripts/check-approved-vocabulary-catalog.js',
  'scripts/migrate-game-content.js',
  'scripts/tests-approved-vocabulary-catalog.js',
  'scripts/tests-vocab-sense-scope.js',
  '.github/workflows/migrate-game-content.yml',
].forEach((relative) => assert.strictEqual(fs.existsSync(path.join(root, relative)), false, relative + ' must be removed'));

const client = read('js/games/game-content-client.js');
const contentEdge = read('supabase/functions/game-content/index.ts');
const roundEdge = read('supabase/functions/tone-round/index.ts');
const toneGame = read('js/games/tone-finder-game.js');
const readingGame = read('js/games/reading-game-app.js');
const typingGame = read('js/games/typing-game-app.js');
const wordOrderGame = read('js/games/word-order-app.js');
const listeningGame = read('js/games/listening-game-app.js');
const toneServer = read('js/games/tone-server.js');
const learningReview = read('js/games/learning-review.js');
const scoreVerifier = read('supabase/functions/score-submit/learning-score-verifier.mjs');
const scoreEngine = read('supabase/functions/score-submit/score-engine.mjs');
const scoreEdge = read('supabase/functions/score-submit/index.ts');
const practiceEngine = read('supabase/functions/practice-events/practice-events-engine.mjs');
const practiceEdge = read('supabase/functions/practice-events/index.ts');
const display = read('js/games/reviewed-vocabulary-display.js');
const catalog = JSON.parse(read('data/approved-vocabulary-catalog.json'));
const removalMigration = read('supabase/migrations/20260910010000_remove_vocabulary_second_judge.sql');
const schemaSource = read('supabase/sql/2026-08-02_game_content_schema.sql');

[contentEdge, roundEdge, scoreEdge].forEach((source) => {
  assert.match(source, /@supabase\/supabase-js@2\.112\.3/);
  assert.doesNotMatch(source, /@supabase\/supabase-js@2(?:['"]|\/)/);
});

assert.match(contentEdge, /canonical_record/);
assert.match(contentEdge, /requestBody\?\.contract !== 'canonical-v1'/);
assert.match(contentEdge, /select\('catalog:canonical_record'\)/);
assert.doesNotMatch(contentEdge, /runtimeSpelling|computeTone|getInitClass|getVowelType|tone_override/i);
assert.match(client, /var exactWords = validateCatalogPayload\(data\.words\)/);
assert.match(client, /global\.WORDS_MASTER = exactWords/);
assert.match(client, /contract: 'canonical-v1'/);
assert.match(client, /var exactSentences = validateSentencePayload\(data\.sentences\)/);
assert.match(client, /global\.ADV_SENTENCES = exactSentences/);
assert.match(client, /toneNumber: record\.toneNumber/);
assert.doesNotMatch(client, /computeTone|getInitClass|getVowelType|toneOverride|toneDerivation/);

assert.match(roundEdge, /canonical_record/);
assert.match(roundEdge, /catalog\.syllables\.map\(\(syllable: any\) => syllable\?\.toneNumber\)/);
assert.doesNotMatch(roundEdge, /LOW_SET|HIGH_SET|MID_SET|SHORT_TAIL|LONG_TAIL|TONE_CHARS|TONE_OVERRIDE|computeTone|getInitClass|getVowelType|isLiveWord/);
assert.match(roundEdge, /\.eq\("content_key", contentKey\)/);
assert.match(roundEdge, /const stateWord = contentKey/);
assert.doesNotMatch(roundEdge, /baseContentKey|query\.eq\("word", word\)|contentKey\.includes\("#"\) \? contentKey : word/);

assert.match(toneGame, /function catalogToneNumber\(\)/);
assert.match(toneGame, /syllable && syllable\.toneNumber/);
assert.doesNotMatch(toneGame, /\bTH\.|TH_ENGINE|computeTone|TONE_OVERRIDE|getInitClass|getVowelType|isLiveWord/);
assert.doesNotMatch(toneGame, /TF_PARTICLE_ENTRIES/);
assert.doesNotMatch(readingGame, /RG_PARTICLE_SYLS/);
assert.doesNotMatch(typingGame, /TG_PARTICLE_SYLS/);
assert.doesNotMatch(wordOrderGame, /particleSyl|words:\s*s\.words\.concat/);
assert.doesNotMatch(display, /LOW_SET|HIGH_SET|MID_SET|SHORT_TAIL|LONG_TAIL|computeTone|getInitClass|getVowelType|isLiveWord/);
assert.match(removalMigration, /drop column if exists tone_special/);
assert.match(removalMigration, /drop column if exists tone_override/);
assert.match(removalMigration, /drop column if exists tone_derivation/);

// Regression for the production bug that exposed the removed second judge:
// the reviewed catalog says ใหญ่ has leading ห, consonant ญ and tone เอก.
// Games must receive these exact fields; no character-order calculation is permitted.
const yai = catalog.records.find((record) => record.contentKey === 'ใหญ่@初#adjective');
assert.ok(yai, 'reviewed ใหญ่ record must exist');
assert.deepStrictEqual(
  {
    lead: yai.syllables[0].lead,
    consonant: yai.syllables[0].consonant,
    toneNumber: yai.syllables[0].toneNumber,
    toneName: yai.syllables[0].toneName,
  },
  { lead: 'ห', consonant: 'ญ', toneNumber: 2, toneName: 'เอก' }
);
assert.match(client, /lead: record\.lead/);
assert.match(client, /cons: record\.consonant/);
assert.doesNotMatch(client, /noneToEmpty|displaySyllables|reviewedSpellingSyllables|readSyls/);
assert.doesNotMatch(readingGame, /VOWEL_SYMBOL|VOWEL_READ/);
assert.doesNotMatch(typingGame, /VOWEL_SYMBOL|VOWEL_READ/);
assert.doesNotMatch(listeningGame, /readingTH\s*\|\|\s*w\.th|contentKey\s*\|\|\s*\(/);
assert.doesNotMatch(listeningGame, /row\.word[^\n]*\+\s*['"]@|\(word\s*&&\s*word\.th\s*\|\|\s*['"]['"]\)\s*\+\s*['"]@/);
assert.match(listeningGame, /return word\.contentKey/);
assert.doesNotMatch(readingGame, /if\(WORDS\[i\]\.th===id/);
assert.doesNotMatch(typingGame, /if\(WORDS\[i\]\.th===id/);
assert.match(readingGame, /WORDS\[i\]\.words&&WORDS\[i\]\.words\.length&&WORDS\[i\]\.th===id/);
assert.match(typingGame, /WORDS\[i\]\.words&&WORDS\[i\]\.words\.length&&WORDS\[i\]\.th===id/);
assert.match(readingGame, /function rgResolveResumeWordIds/);
assert.match(typingGame, /function tgResolveResumeWordIds/);
assert.doesNotMatch(readingGame, /wordIds\|\|\[\]\)\.forEach[\s\S]{0,160}if\(idx!=null\).*push/);
assert.doesNotMatch(typingGame, /wordIds\.map\([\s\S]{0,160}\.filter\(function\(v\)\{return v!=null;\}\)/);
assert.match(toneGame, /function tfResolveResumeEntries/);
assert.match(toneGame, /function tfResumeSentenceIndex/);
assert.match(toneGame, /sentenceId:/);
assert.match(toneGame, /exactSentenceText!==s\.th/);
assert.match(toneGame, /advSentenceCtx = \{ th: s\.th/);
assert.doesNotMatch(toneGame, /advSentenceCtx = \{ th: coreWords\.map/);
assert.doesNotMatch(toneGame, /data\.advSentIdx/);
assert.doesNotMatch(toneGame, /map\(tfFindEntryByResumeId\)\.filter\(Boolean\)/);
assert.match(listeningGame, /wordIds: state\.round\.map\(function \(w\) \{ return srsKey\(w\); \}\)/);
assert.doesNotMatch(listeningGame, /wordIds: state\.round\.map\(function \(w\) \{ return w\.th; \}\)|byTh\[w\.th\]/);
assert.doesNotMatch(toneGame, /tryNavigate|navigateToInflection|function navigate\(|deriveText|TF_PARTICLE_WORDS/);
assert.doesNotMatch(toneGame, /WORD_SYLS/);
assert.doesNotMatch(toneGame, /tfCurWordIsToneSpecial/);
assert.doesNotMatch(toneGame, /S\.parentWord\s*\|\||entrySyls\.map\([^\n]*\.join\(''\)|syls\.join\(''\)/);
assert.doesNotMatch([readingGame, typingGame, wordOrderGame].join('\n'), /correctAnswer\s*\|\|/);
assert.doesNotMatch([toneGame, readingGame, typingGame].join('\n'), /contentKey\s*\|\||\.word\s*\+\s*['"]@|\.th\s*\+\s*['"]@/);
assert.doesNotMatch([readingGame, typingGame].join('\n'), /row\.word[^\n]*\+\s*['"]@|\(row\.word\s*\|\|\s*['"]['"]\)\s*\+\s*['"]@/);
assert.doesNotMatch([readingGame, typingGame].join('\n'), /WORDS\[_wi\]\.th===_wanted/);
assert.doesNotMatch(client, /record\.word === wanted/);
assert.match(toneServer, /key: exactContentKey/);
assert.doesNotMatch(toneServer, /args\.contentKey\s*\|\||args\.word\s*\|\||\(args\.word\s*\|\|\s*['"]['"]\)\s*\+\s*['"]@/);
assert.doesNotMatch(learningReview, /item\.contentKey \|\| item\.th \|\| item\.word/);
assert.match(learningReview, /IDENTITY_REQUIRED/);
assert.match(learningReview, /key: group\[0\]\.content_ref\.key/);
assert.doesNotMatch(learningReview, /key: group\[0\]\.question/);
assert.doesNotMatch(scoreVerifier, /game !== ['"]tone['"] && itemKey !== ref\.key|invalid_tone_sentence_component/);
assert.doesNotMatch(scoreVerifier, /canonicalKey\(row\) \+ ['"]@|key \+ ['"]@|row\.th \|\| row\.word/);
assert.match(scoreVerifier, /if \(!raw\) fail\('missing_content_ref'\)/);
assert.doesNotMatch(scoreEngine, /row\.content_key \|\| row\.th \|\| row\.word/);
assert.match(scoreEngine, /key\.trim\(\) !== key/);
assert.match(scoreEngine, /refKey !== key/);
assert.match(scoreVerifier, /itemKey !== ref\.key/);
assert.match(scoreEdge, /key\.trim\(\) !== key/);
assert.doesNotMatch(scoreEdge, /row\.content_key \|\| row\.th \|\| row\.word/);
assert.doesNotMatch(scoreEdge, /key:\s*item\.key\s*\|\|\s*item\.question/);
assert.match(scoreEdge, /key: exactItemKey/);
assert.match(scoreEngine, /sentenceWordEvidence = game === 'tone' && difficulty === '高'/);
assert.match(scoreEngine, /accepted\.evidence\.items\.length !== units/);
assert.match(scoreEdge, /from\('game_sentences'\)\.select\('th,wc'\)\.in\('th', keys\)/);
assert.doesNotMatch(practiceEngine, /canonicalContentKey|WORD_LEVEL_SUFFIX|wordCandidates/);
assert.doesNotMatch(practiceEngine, /wordBase/);
assert.doesNotMatch(practiceEdge, /canonicalContentKey|wordBase|learningItemRows\(admin, \['game_words'\]\)/);
assert.match(practiceEdge, /key: item\.content_ref\.key/);
assert.match(practiceEngine, /value\.key\.trim\(\) !== value\.key/);
assert.doesNotMatch(readingGame, /contentKey:WORD\.contentKey/);
assert.doesNotMatch(typingGame, /contentKey:WORD\.contentKey/);
assert.match(readingGame, /contentKey:rgContentKey\(WORD\)/);
assert.match(typingGame, /contentKey:tgContentKey\(WORD\)/);
assert.match(wordOrderGame, /correctAnswer:s\.th/);
assert.doesNotMatch(wordOrderGame, /correctAnswer:s&&s\.words|correctAnswer:wordsArr\.join/);
assert.doesNotMatch([toneGame, readingGame, typingGame, wordOrderGame].join('\n'), /return ['"]ครับ|\|\|['"]ครับ/);
assert.match(removalMigration, /drop column if exists syls/);
assert.match(removalMigration, /drop column if exists read_syls/);
assert.match(removalMigration, /cleanup_reviewed_vocab_payload/);
assert.match(removalMigration, /canonical_record = approved\.canonical_record/);
assert.match(removalMigration, /and not \(gw\.canonical_record \? 'spellingSyllables'\)/);
assert.match(removalMigration, /gw\.record_hash is distinct from/);
assert.doesNotMatch(removalMigration, /to_jsonb\(syls\)|jsonb_set\(canonical_record/);
assert.match(schemaSource, /canonical_record jsonb not null/);
assert.doesNotMatch(schemaSource, /\bsyls\s+jsonb|\bread_syls\s+jsonb|\btone_override\b|\btone_derivation\b/);
assert.match(contentEdge, /REQUIRED_CATALOG_STRING_FIELDS/);
assert.match(contentEdge, /REQUIRED_SYLLABLE_STRING_FIELDS/);
assert.match(client, /REQUIRED_CATALOG_STRING_FIELDS/);
assert.match(client, /REQUIRED_SYLLABLE_STRING_FIELDS/);
assert.match(contentEdge, /value\.trim\(\) === value/);
assert.match(contentEdge, /hasExactStringBoundaries\(record\)/);
assert.match(contentEdge, /hasExactStringBoundaries\(r\)/);
assert.match(contentEdge, /record\.approvalRefs\.every\(isExactNonblank\)/);
assert.match(client, /value\.trim\(\) === value/);
assert.match(client, /hasExactStringBoundaries\(record\)/);
assert.match(client, /hasExactStringBoundaries\(s\)/);
assert.match(client, /record\.approvalRefs\.every\(isExactNonblank\)/);

const sandbox = { window: {}, console };
vm.createContext(sandbox);
vm.runInContext(client, sandbox);
const projectedYai = sandbox.window.buildWordsForPhonicsGames([{
  catalog: yai
}])[0];
assert.deepStrictEqual(
  JSON.parse(JSON.stringify({
    lead: projectedYai.syls[0].lead,
    consonant: projectedYai.syls[0].cons,
    vowel: projectedYai.syls[0].vowel,
    toneNumber: projectedYai.syls[0].toneNumber,
  })),
  { lead: 'ห', consonant: 'ญ', vowel: 'ใอ', toneNumber: 2 }
);

function clonedYai(mutator) {
  const copy = JSON.parse(JSON.stringify(yai));
  mutator(copy);
  return [{ catalog: copy }];
}
[
  (record) => { record.contentKey += ' '; },
  (record) => { record.approvalRefs[0] = ' ' + record.approvalRefs[0]; },
  (record) => { record.spellingSyllables[0].th += ' '; },
  (record) => { record.syllables[0].lead = ' ' + record.syllables[0].lead; },
  (record) => { record.syllables[0].toneName += ' '; },
].forEach((mutator) => {
  assert.throws(() => sandbox.window.buildWordsForPhonicsGames(clonedYai(mutator)), /game-content:/);
});

const validSentence = {
  th: 'กา', zh: '中', readingTH: 'กา', wc: 1, politeF: null,
  words: [{ th: 'กา', zh: '中', syls: [{ th: 'กา', en: 'gaa', cons: 'ก', vowel: 'อา', tone_name: 'สามัญ' }] }],
};
assert.strictEqual(sandbox.window.buildSentencesForPhonicsGames([validSentence])[0].th, 'กา');
[
  (sentence) => { sentence.th += ' '; },
  (sentence) => { sentence.words[0].zh += ' '; },
  (sentence) => { sentence.words[0].syls[0].tone_name += ' '; },
  (sentence) => { sentence.words[0].syls[0].lead = ' '; },
  (sentence) => { sentence.politeF = ' ค่ะ'; },
  (sentence) => { sentence.readingTH += ' '; },
  (sentence) => { sentence.wc = 2; },
].forEach((mutator) => {
  const sentence = JSON.parse(JSON.stringify(validSentence));
  mutator(sentence);
  assert.throws(() => sandbox.window.buildSentencesForPhonicsGames([sentence]), /game-content:/);
});

[
  ['tone-finder.html', "{game:'tone'}"],
  ['reading-game.html', "{game:'reading'}"],
  ['typing-game.html', "{game:'typing'}"],
  ['word-order.html', "{game:'word_order'}"],
].forEach(([page, game]) => {
  const html = read(page);
  assert.match(html, /js\/games\/game-content-client\.js/);
  assert.ok(html.includes(game), page + ' must identify its game-content surface');
  assert.doesNotMatch(html, /data\/tone-engine\.js/);
});
assert.match(read('listening-game.html'), /js\/games\/game-content-client\.js/);
assert.doesNotMatch(read('listening-game.html'), /data\/tone-engine\.js/);
assert.doesNotMatch(read('listening-game.html'), /GameContentLoader\.boot/);

const forbiddenRuntimeJudgeMarkers = /tryNavigate|navigateToInflection|deriveText|readSyls|VOWEL_SYMBOL|VOWEL_READ|noneToEmpty|TF_PARTICLE_WORDS|SCORE_DEDUCE|DEDUCE_WRONG|deduceScore|onPeek/;
[
  'js/games/tone-finder-game.min.js',
  'js/games/reading-game-app.min.js',
  'js/games/typing-game-app.min.js',
  'js/games/word-order-app.min.js',
].forEach((relative) => {
  assert.doesNotMatch(read(relative), forbiddenRuntimeJudgeMarkers, relative + ' must not contain a vocabulary judge');
});
assert.doesNotMatch(read('js/games/tone-finder-game.min.js'), /WORD_SYLS/);
assert.doesNotMatch(read('js/games/tone-finder-game.min.js'), /tfCurWordIsToneSpecial|特殊詞|不按規則/);
assert.match(read('js/games/reading-game-app.min.js'), /reading report answer/);
assert.match(read('js/games/typing-game-app.min.js'), /typing report answer/);
assert.match(read('js/games/word-order-app.min.js'), /word-order report answer/);

[
  'scripts/browser-tests/mobile-landscape-reading-review.html',
  'scripts/browser-tests/mobile-landscape-tone-position-review.html',
  'scripts/browser-tests/mobile-landscape-typing-review.html',
  'scripts/browser-tests/mobile-landscape-responsive-regression.html',
  'scripts/browser-tests/mobile-landscape-25-state-review.html',
].forEach((relative) => {
  const fixture = read(relative);
  assert.match(fixture, /approved-vocabulary-catalog\.json/, relative + ' must use the current canonical fixture');
  assert.match(fixture, /return \{catalog:record\}/, relative + ' must pass the canonical bundle to the real game adapter');
  assert.doesNotMatch(fixture, /var\s+(?:words|fixture)\s*=\s*\[\{\s*(?:word|th):/, relative + ' must not inject a hand-written vocabulary authority');
});

// Listening remains visibly parked. Its preserved source may not be loaded or
// boot a vocabulary round until Product explicitly authorizes that game.
assert.match(read('listening-game.html'), /page remains parked|Preserved paused runtime/);
assert.doesNotMatch(read('listening-game.html'), /<script[^>]+listening-game-app\.js/);

console.log('NO_VOCABULARY_JUDGE_PASS');
