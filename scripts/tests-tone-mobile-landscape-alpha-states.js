#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const game = read('js/games/tone-finder-game.js');
const stage = read('js/core/mobile-landscape.js');
const css = read('css/mobile-landscape.css');
const html = read('tone-finder.html');

const reviewedStates = [
  ['home', /function stepAlphaHome\(\)[\s\S]{0,1200}TF\.alphaConsonants\(\)[\s\S]{0,300}TF\.alphaVowels\(\)[\s\S]{0,300}TF\.alphaEndings\(\)/],
  ['consonant-select', /function stepAlphaConsonant\(\)[\s\S]{0,1800}TF\.startFlashcards\('mid'\)[\s\S]{0,300}TF\.startFlashcards\('forgot'\)/],
  ['vowel-select', /function stepAlphaVowel\(\)[\s\S]{0,1500}TF\.startFlashcards\('v_short'\)[\s\S]{0,300}TF\.startFlashcards\('v_all'\)/],
  ['mid-flashcard', /key === 'mid'[\s\S]{0,180}title = '中子音 字卡'/],
  ['high-flashcard', /key === 'high'[\s\S]{0,180}title = '高子音 字卡'/],
  ['low-flashcard', /key === 'low'[\s\S]{0,180}title = '低子音 字卡'/],
  ['forgot-flashcard', /key === 'forgot'[\s\S]{0,260}遺忘版 字卡/],
  ['short-vowel-flashcard', /key === 'v_short'[\s\S]{0,220}短母音 字卡/],
  ['long-vowel-flashcard', /key === 'v_long'[\s\S]{0,220}長母音 字卡/],
  ['all-vowel-flashcard', /key === 'v_all'[\s\S]{0,260}母音 字卡（全部）/],
  ['ending-front', /key === 'ending'[\s\S]{0,220}尾音 字卡[\s\S]{0,650}step:'alpha-flashcard'/],
  ['ending-explanation', /isEnding[\s\S]{0,500}TF\.flashToggleExp\(\)[\s\S]{0,900}class="afc-exp"/]
];

for (const [name, pattern] of reviewedStates) {
  assert.match(game, pattern, `${name}: missing original ALPHA state/handler`);
  console.log(`✓ ${name}`);
}

assert.match(stage, /function syncToneAlphabetSurface\(game\)[\s\S]{0,220}data-gsh-ml-tone-alpha/);
assert.match(css, /data-gsh-ml-tone-alpha="true"[\s\S]{0,2500}grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
assert.match(css, /data-gsh-ml-tone-alpha="true"[\s\S]{0,5200}\.afc-exp[\s\S]{0,180}max-width: 100%/);
assert.match(html, /gsh-ml-active'[\s\S]{0,80}TF\.openAlpha\(\)[\s\S]{0,80}TF\.openAlphabetOverlay\('home'\)/);

console.log('\n✅ Tone Landscape 字母練習區 passed (12 reviewed states)');
