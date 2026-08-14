#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const textbookPages = [
  'textbook/index.html',
  'textbook/拼音規則總整理.html',
  'textbook/句子結構五步驟.html',
  'textbook/情態助詞.html',
  'textbook/否定表達.html',
  'textbook/過去式.html',
  'textbook/是非問句.html',
  'textbook/疑問詞.html',
  'textbook/過去式進階.html',
  'textbook/能力.html',
  'textbook/完成.html'
];
const teachingPages = [
  'classroom/拼音規則上課用.html',
  'classroom/句子結構五步驟上課用.html',
  'classroom/情態助詞上課用.html'
];
const failures = [];

function read(relative) {
  return fs.readFileSync(path.join(root, relative), 'utf8');
}

for (const relative of textbookPages) {
  const html = read(relative);
  if (!/href=["']access-gate\.css\?v=20260814["']/.test(html)) failures.push(`${relative}: missing gate CSS`);
  if (!/src=["']access-gate\.js\?v=20260814["']/.test(html)) failures.push(`${relative}: missing gate JavaScript`);
}

for (const relative of teachingPages) {
  const html = read(relative);
  if (/access-gate\.(?:css|js)/.test(html)) failures.push(`${relative}: Teaching Page must remain ungated`);
}

const gateSource = read('textbook/access-gate.js');
for (const required of [
  "textbook-temp-access-v1",
  "reset-textbook-access",
  "textbook-gate-pending",
  "通行碼不正確",
  "window.TextbookAccessGate",
  "window.localStorage.setItem",
  "window.crypto.subtle.digest"
]) {
  if (!gateSource.includes(required)) failures.push(`access-gate.js: missing ${required}`);
}

if (failures.length) {
  console.error(`Textbook access gate tests failed (${failures.length})`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(`✓ Textbook gate coverage ${textbookPages.length}/${textbookPages.length}`);
console.log(`✓ Teaching Pages remain ungated ${teachingPages.length}/${teachingPages.length}`);
