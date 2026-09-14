#!/usr/bin/env node
'use strict';

// Current approved sources only. Never load the retired vocabulary corpus.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const plain = (value) => JSON.parse(JSON.stringify(value));
const browser = { window: {}, console };
vm.createContext(browser);
vm.runInContext(read('js/games/game-content-client.js'), browser);
vm.runInContext(read('js/games/reviewed-vocabulary-display.js'), browser);
const api = browser.window;
const fixture = { window: {} };
vm.runInNewContext(read('data/adv-sentences.js'), fixture);
const sentences = fixture.window.ADV_SENTENCES;
const catalog = JSON.parse(read('data/approved-vocabulary-catalog.json')).records;
const tones = ['สามัญ', 'เอก', 'โท', 'ตรี', 'จัตวา'];
const toneSource = read('js/games/tone-finder-game.js');
function section(source, start, end) {
  const i = source.indexOf(start), j = source.indexOf(end, i + start.length);
  assert.ok(i >= 0 && j > i, start);
  return source.slice(i, j);
}
let current;
const tone = {
  ...api, console, currentAnswerSyl: () => current,
  tfCurEntry: () => ({ syls: [current] })
};
vm.createContext(tone);
vm.runInContext(section(toneSource, 'function catalogToneNumber()', '// Lin 2026-07-31:'), tone);
vm.runInContext(section(toneSource, 'function tfAnswerRowsHtml(sy)', '// No Thai-language engine'), tone);
const rules = ['reading', 'typing'].map((game) => {
  const context = { ...api };
  vm.createContext(context);
  vm.runInContext(section(read('js/games/' + game + '-game-app.js'),
    'function buildRevealRules(w)', '// reviewed-vocabulary-display.js owns'), context);
  return context.buildRevealRules;
});
let checked = 0;
function checkSyllable(sy, expectedTone) {
  current = sy;
  assert.strictEqual(tone.catalogToneNumber(), expectedTone);
  const header = api.buildAnswerHeader(sy);
  assert.ok(header.startsWith(sy.th + '（'));
  const rows = plain(api.buildAnswerRows(sy));
  const html = tone.tfAnswerRowsHtml(sy);
  assert.ok(html.includes(header));
  for (const row of rows) assert.ok(html.includes(row.text));
  for (const buildRules of rules) {
    assert.deepStrictEqual(plain(buildRules(sy)).map(({ tag, text }) => ({ tag, text })), rows);
  }
  checked++;
}

// All approved words: the canonical text/fields and existing arrows remain exact.
const bundles = catalog.map((catalog) => ({ catalog }));
const words = api.buildWordsForPhonicsGames(bundles);
const toneWords = api.buildWordListForToneFinder(bundles);
words.forEach((word, i) => {
  assert.strictEqual(word.th, catalog[i].word);
  assert.strictEqual(word.zh, catalog[i].zhTW);
  assert.strictEqual(word.readingTH, catalog[i].readingTH);
  assert.strictEqual(word.syls.map((s) => s.th).join(''), word.th);
  assert.deepStrictEqual(plain(toneWords[i].syls), plain(word.syls));
  word.syls.forEach((sy, j) => {
    assert.strictEqual(sy.catalog, catalog[i].syllables[j]);
    checkSyllable(sy, catalog[i].syllables[j].toneNumber);
    for (const [field, tag] of [['finalReadDifference', '尾音'], ['consonantReadDifference', '子音']]) {
      if (/[>→]/.test(sy.catalog[field])) {
        assert.strictEqual(api.buildAnswerRows(sy).find((r) => r.tag === tag).text, sy.catalog[field]);
      }
    }
  });
});

const before = JSON.stringify(sentences);
let sentenceSyllables = 0, arrowChecks = 0;
sentences.forEach((sentence) => {
  const flat = api.buildSentencesForPhonicsGames([sentence])[0];
  const grouped = api.buildSentenceWordsForToneFinder(sentence);
  assert.strictEqual(grouped.map((w) => w.word).join(''), sentence.th);
  assert.strictEqual(grouped.map((w) => w.readingTH).join('-'), sentence.readingTH);
  assert.deepStrictEqual(plain(grouped.flatMap((w) => w.syls)), plain(flat.syls));
  assert.deepStrictEqual(plain(flat.words), plain(sentence.words.map(({ th, zh }) => ({ th, zh }))));
  assert.strictEqual(flat.politeF, sentence.politeF);
  sentence.words.forEach((word, wi) => {
    assert.strictEqual(grouped[wi].zh, word.zh);
    word.syls.forEach((raw, si) => {
      const sy = grouped[wi].syls[si];
      assert.strictEqual(sy.th, raw.th);
      checkSyllable(sy, tones.indexOf(raw.tone_name) + 1);
      for (const [written, reading, tag] of [['final', 'finalRead', '尾音'], ['cons', 'consRead', '子音']]) {
        if (raw[reading] && raw[reading] !== 'ไม่มี') {
          const expected = /[>→]/.test(raw[reading]) ? raw[reading] : raw[written] + ' > ' + raw[reading];
          assert.strictEqual(api.buildAnswerRows(sy).find((r) => r.tag === tag).text, expected);
          arrowChecks++;
        }
      }
      sentenceSyllables++;
    });
  });
});
assert.strictEqual(JSON.stringify(sentences), before, 'sentence source must not be mutated');
assert.ok(arrowChecks > 0, 'real sentence final-difference coverage');
assert.match(toneSource, /var entries = buildSentenceWordsForToneFinder\(s\)/);

// Unknown/conflicting tone authority must fail closed, never infer from Thai spelling.
for (const mutate of [
  (s) => { s.words[0].syls[0].tone_name = 'unknown'; },
  (s) => { s.words[0].syls[0].toneNumber = 99; }
]) {
  const s = plain(sentences[0]); mutate(s);
  assert.throws(() => api.buildSentenceWordsForToneFinder(s), /game-content:/);
}
console.log(`SHARED_ANSWER_STANDARD_PASS words=${words.length} sentences=${sentences.length} syllables=${checked} sentenceSyllables=${sentenceSyllables} arrows=${arrowChecks}`);
