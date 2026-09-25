#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const pages = {
  tone: read('tone-finder.html'),
  reading: read('reading-game.html'),
  typing: read('typing-game.html'),
  wordOrder: read('word-order.html')
};

assert.match(pages.tone, /#tf-banner > #tf-read-line \{[\s\S]{0,180}gap:8px;[\s\S]{0,100}margin-top:10px/);
assert.match(pages.tone, /#tf-banner > \.tf-banner-word,[\s\S]{0,180}line-height:1\.6 !important;[\s\S]{0,80}padding-block:\.08em/);

for (const key of ['reading', 'typing']) {
  assert.match(pages[key], /\.gsh-four-row-stack > \.gsh-copy-row[^\{]*\{[^}]*margin-top:9px !important;[^}]*line-height:1\.6|gsh-four-row-stack > \.gsh-copy-row \{ margin-top:9px !important; \}/);
  assert.match(pages[key], /\.gsh-four-row-stack > \.gsh-copy-row:empty[^\{]*\{[^}]*display:none !important/);
  assert.match(pages[key], /\.gsh-four-row-stack[^\{]*\.word-th[^\{]*\{[^}]*line-height:1\.6 !important;[^}]*padding-block:\.08em/);
}

assert.match(pages.wordOrder, /\.wo-slot\.filled\{flex-direction:column;gap:5px/);
assert.match(pages.wordOrder, /\.wo-word-th\{[^}]*line-height:1\.55;[^}]*padding-block:\.06em/);
assert.match(pages.wordOrder, /\.wo-read-th\{[^}]*line-height:1\.5;[^}]*margin-top:0/);
assert.match(pages.wordOrder, /\.wo-read-en\{[^}]*line-height:1\.5/);
assert.match(pages.wordOrder, /\.wo-read-zh\{[^}]*line-height:1\.5/);

console.log('✅ Vocabulary stack spacing coverage passed (4 active game surfaces)');
