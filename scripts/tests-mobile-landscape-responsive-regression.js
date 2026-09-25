#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const harness = fs.readFileSync(path.join(root, 'scripts/browser-tests/mobile-landscape-responsive-regression.html'), 'utf8');
const pages = ['tone-finder.html', 'typing-game.html', 'reading-game.html', 'word-order.html', 'lego.html'];

for (const page of pages) assert.match(harness, new RegExp(`'${page.replace('.', '\\.')}'`));
assert.match(harness, /name:'Landscape', width:844, height:390/);
assert.match(harness, /name:'Portrait', width:390, height:844/);
assert.match(harness, /name:'Desktop', width:1440, height:900/);
assert.match(harness, /bottom\.querySelectorAll\('\.bn-item'\)\.length !== 4/);
assert.match(harness, /profile\.contains\(login\)/);
assert.match(harness, /data-gsh-ml-slot'\) !== 'dropdowns'/);
assert.match(harness, /doc\.documentElement\.scrollWidth > mode\.width \+ 1/);

console.log('✅ responsive regression contract passed (5 active games × 3 modes)');
