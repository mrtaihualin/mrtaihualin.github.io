#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'js/games/tone-finder-game.js'), 'utf8');
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'data/approved-vocabulary-catalog.json'), 'utf8'));

const defsStart = source.indexOf('var DEFS = {');
const defsEnd = source.indexOf('// ════════════════════════════════════════════════════════════\n// 字母練習區');
const teachingStart = source.indexOf('function catalogPedagogySyllable()');
const teachingEnd = source.indexOf('// Lin 2026-07-31:', teachingStart);
const wordScoreStart = source.indexOf('var TF_WORDSCORE = {');
const wordScoreEnd = source.indexOf('// Lin 2026-07-06:', wordScoreStart);
const forceRevealStart = source.indexOf('function tfForceRevealZero()');
const forceRevealEnd = source.indexOf('// overlay เฉลยเมื่อกดมั่วครบ 3 ครั้ง', forceRevealStart);
const startSessionStart = source.indexOf('function startSetSession(words, opts)');
const startSessionEnd = source.indexOf('// ── สเปก 2026-07-03 ข้อ 3:', startSessionStart);
assert.ok(defsStart >= 0 && defsEnd > defsStart && teachingStart >= 0 && teachingEnd > teachingStart);
assert.ok(wordScoreStart >= 0 && wordScoreEnd > wordScoreStart);
assert.ok(forceRevealStart >= 0 && forceRevealEnd > forceRevealStart);
assert.ok(startSessionStart >= 0 && startSessionEnd > startSessionStart);

const sandbox = {
  __syllable: null,
  currentAnswerSyl() { return { catalog: sandbox.__syllable }; },
};
vm.createContext(sandbox);
vm.runInContext(source.slice(defsStart, defsEnd), sandbox);
vm.runInContext(source.slice(teachingStart, teachingEnd), sandbox);
vm.runInContext(source.slice(wordScoreStart, wordScoreEnd), sandbox);

const scoreSession = {};
assert.deepStrictEqual(Array.from(sandbox.TF_WORDSCORE.LADDER), [10, 7, 4, 1, 0]);
assert.strictEqual(sandbox.TF_WORDSCORE.score(scoreSession), 10);
for (const expected of [7, 4, 1, 0]) {
  sandbox.TF_WORDSCORE.onWrong(scoreSession);
  assert.strictEqual(sandbox.TF_WORDSCORE.score(scoreSession), expected);
}
assert.strictEqual(sandbox.TF_WORDSCORE.isDead(scoreSession), true);

const firstMultiRecord = catalog.records.find((record) => record.level === '中' && record.syllables.length > 1);
assert.ok(firstMultiRecord, 'canonical intermediate multi-syllable fixture is required');
const firstWordSandbox = {
  advSentenceCtx: null,
  WORD_LIST: [],
  tfGuideMode: false,
  selectedLevel: 2,
  selectedCategory: 'ทั้งหมด',
  session: null,
  hist: [],
  histPos: -1,
  randomEntry: null,
  S: null,
  __reveal: null,
  tfRollGolden() { return false; },
  tfSetupSrsFlagsForCurrentWord() {},
  tfCurWordNoTools() { return false; },
  tfSaveResumeState() {},
  render() {},
  tfMinaToast() {},
  setTimeout() {},
  CustomEvent: function CustomEvent() {},
  tfCurWordIsMulti() { return true; },
  TF_SCORE_CFG: { SCORE_FAIL_ZERO: 0 },
  catalogToneNumber() { return firstMultiRecord.syllables[0].toneNumber; },
  tfShowRevealOverlay(entry, tone, options) {
    firstWordSandbox.__reveal = { entry, tone, options };
  }
};
firstWordSandbox.window = firstWordSandbox;
vm.createContext(firstWordSandbox);
vm.runInContext(source.slice(wordScoreStart, wordScoreEnd), firstWordSandbox);
vm.runInContext(source.slice(startSessionStart, startSessionEnd), firstWordSandbox);
vm.runInContext(source.slice(forceRevealStart, forceRevealEnd), firstWordSandbox);
const firstMultiEntry = {
  word: firstMultiRecord.word,
  contentKey: firstMultiRecord.contentKey,
  readingTH: firstMultiRecord.readingTH,
  zh: firstMultiRecord.zhTW,
  level: 2,
  syls: firstMultiRecord.syllables.map((syllable) => ({ toneNumber: syllable.toneNumber, catalog: syllable }))
};
firstWordSandbox.startSetSession([firstMultiEntry], { keepOrder: true });
assert.deepStrictEqual(Array.from(firstWordSandbox.session.learningComponentWrongCounts), []);
for (const expected of [7, 4, 1, 0]) {
  firstWordSandbox.TF_WORDSCORE.onWrong(firstWordSandbox.session);
  assert.strictEqual(firstWordSandbox.TF_WORDSCORE.score(firstWordSandbox.session), expected);
}
assert.doesNotThrow(() => firstWordSandbox.tfForceRevealZero());
assert.strictEqual(firstWordSandbox.session.learningComponentWrongCounts[0], 4);
assert.strictEqual(firstWordSandbox.__reveal.tone, firstMultiRecord.syllables[0].toneNumber);
assert.strictEqual(firstWordSandbox.__reveal.options.sylIdx, 0);

let syllableCount = 0;
for (const record of catalog.records) {
  for (const syllable of record.syllables) {
    syllableCount += 1;
    sandbox.__syllable = syllable;
    const markChoice = sandbox.catalogExpectedTeachingChoice('s1');
    if (markChoice === 'hasMark') {
      const family = sandbox.catalogExpectedTeachingChoice('s2a');
      if (family === 'low') {
        assert.ok(['่', '้'].includes(syllable.toneMark));
        assert.strictEqual(sandbox.catalogExpectedTeachingChoice('s2a_low'), syllable.toneMark);
      } else {
        const cls = sandbox.catalogExpectedTeachingChoice('s2a_other');
        assert.ok(['mid', 'high', 'lead'].includes(cls));
        assert.ok((cls === 'mid' ? ['่', '้', '๊', '๋'] : ['่', '้']).includes(syllable.toneMark));
        assert.strictEqual(sandbox.catalogExpectedTeachingChoice(cls === 'mid' ? 's2a_mid' : 's2a_hi'), syllable.toneMark);
      }
    } else {
      const liveDead = sandbox.catalogExpectedTeachingChoice('s2b');
      assert.ok(liveDead === 'live' || liveDead === 'dead');
      const classChoice = sandbox.catalogExpectedTeachingChoice(liveDead === 'live' ? 's2b_live' : 's2b_dead');
      if (classChoice === 'low_dead') {
        assert.ok(['long_vowel', 'short_vowel'].includes(sandbox.catalogExpectedTeachingChoice('s2b_dl')));
      }
    }
    const tailChoice = sandbox.catalogExpectedTeachingChoice('helper');
    if (tailChoice === 'has_tail') {
      assert.ok(['long_tail', 'short_tail'].includes(sandbox.catalogExpectedTeachingChoice('h_with')));
    } else {
      assert.ok(['long_vowel_h', 'short_vowel_h'].includes(sandbox.catalogExpectedTeachingChoice('h_no')));
    }
  }
}

assert.strictEqual(catalog.records.length, 200);
assert.ok(syllableCount > 200);
assert.match(source, /function navigateToInflection\(\)/);
assert.match(source, /if \(tfCurWordNoTools\(\)\) tfForceRevealZero\(\);\s*else navigateToInflection\(\);/);
assert.match(source, /TF_WORDSCORE\.onWrong\(session\);[\s\S]{0,180}TF_WORDSCORE\.onNextStep\(session\);[\s\S]{0,320}navigateToInflection\(\);/);
assert.match(source, /function tfScoreDeduce\(\)[\s\S]{0,1500}TF_WORDSCORE\.score\(session\)/);
assert.match(source, /if \(TF_WORDSCORE\.isDead\(session\)\) \{\s*tfForceRevealZero\(\);/);
assert.match(source, /session\.initialGuess = 0;[\s\S]{0,650}navigateToInflection\(\);/);
assert.match(source, /startGuidedQuestion:[\s\S]{0,420}navigateToInflection\(\)/);
assert.match(source, /var newTone = nextStep === 'result' \? catalogToneNumber\(\) : null/);
assert.doesNotMatch(source, /\bTH\.|TH_ENGINE|computeTone|TONE_OVERRIDE|getInitClass|getVowelType|isLiveWord/);

console.log(`TONE_TEACHING_DERIVATION_PASS (${catalog.records.length} records, ${syllableCount} syllables)`);
