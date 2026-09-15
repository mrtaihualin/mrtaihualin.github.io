#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const html = read('tone-finder.html');
const app = read('js/games/tone-finder-game.js');
const min = read('js/games/tone-finder-game.min.js');

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log('✓ ' + name);
}

test('字母練習區 uses the overlay outside the dedicated Landscape surface', () => {
  assert.match(html, /id="tf-alpha-btn"[^>]+TF\.openAlphabetOverlay\('home'\)/);
  assert.match(html.match(/id="tf-alpha-btn"[^>]+>/)[0], /gsh-ml-active[^>]+TF\.openAlpha\(\)[^>]+TF\.openAlphabetOverlay\('home'\)/);
  const opener = app.match(/function tfOpenAlphabetOverlay[\s\S]+?\n}\n\nfunction tfAlphaView/)[0];
  assert.doesNotMatch(opener, /\bS\s*=|\bsession\s*=|\bhist\s*=|score\s*[+\-=]/);
});

test('overlay home has the approved four-card structure', () => {
  assert.match(app, /泰文拼音規則手冊[\s\S]{0,400}子音練習[\s\S]{0,400}母音練習[\s\S]{0,400}尾音練習/);
  assert.match(html, /\.tf-alpha-menu > \.tf-alpha-menu-card:first-child[\s\S]{0,180}grid-column:1 \/ -1/);
  assert.match(html, /\.tf-alpha-menu \{[\s\S]{0,140}grid-template-columns:repeat\(3/);
  assert.match(html, /\.tf-alpha-dialog \{[\s\S]{0,140}width:min\(748px,100%\); height:min\(612px,calc\(100vh - 40px\)\)/);
  assert.match(html, /@media \(max-width:720px\) and \(orientation:portrait\)[\s\S]{0,220}width:80vw; height:80vh; height:80dvh/);
  assert.match(html, /\.tf-alpha-dialog \{[\s\S]{0,80}--tf-alpha-font-scale:\.85;[\s\S]{0,180}font-size:85%/);
  assert.match(html, /@media \(max-width:720px\)[\s\S]{0,180}--tf-alpha-font-scale:\.8;[\s\S]{0,160}font-size:80%/);
  assert.match(html, /\.tf-alpha-menu-card strong \{[^}]*font-size:calc\(25px \* var\(--tf-alpha-font-scale\)\)/);
});

test('Desktop Computer scales the complete overlay by 15% within viewport bounds only', () => {
  assert.match(html, /@media \(min-width:1025px\) and \(min-height:601px\) \{[\s\S]{0,360}\.tf-alpha-dialog \{[\s\S]{0,260}transform:scale\(1\.15\)/);
  assert.match(html, /width:min\(748px,calc\(86\.9565vw - 34\.7826px\)\)/);
  assert.match(html, /height:min\(612px,calc\(86\.9565vh - 34\.7826px\)\)/);
  const desktopScale = html.match(/@media \(min-width:1025px\) and \(min-height:601px\) \{[\s\S]+?\n  \}/)[0];
  assert.doesNotMatch(desktopScale, /\.tf-alpha-overlay\s*\{/);
  assert.match(html, /@media \(max-width:720px\)[\s\S]{0,180}\.tf-alpha-dialog \{ --tf-alpha-font-scale:\.8/);
  assert.match(html, /@media \(max-width:720px\) and \(orientation:portrait\)[\s\S]{0,220}width:80vw; height:80vh; height:80dvh/);
});

test('every alphabet overlay element follows Tone standard and modern font state', () => {
  assert.match(html, /body:not\(\.tf-modern-font\) \.tf-alpha-dialog,[\s\S]{0,180}\.tf-alpha-dialog \* \{[\s\S]{0,100}font-family:'Sarabun','Noto Sans TC',sans-serif !important/);
  assert.match(html, /body\.tf-modern-font \.tf-alpha-dialog,[\s\S]{0,180}\.tf-alpha-dialog \* \{[\s\S]{0,110}font-family:'Noto Sans Thai','Noto Sans TC',sans-serif !important/);
  assert.match(app, /toggleFont: function\(\) \{[\s\S]{0,120}document\.body\.classList\.toggle\('tf-modern-font'\)/);
});

test('two-choice live/dead cards remain equal instead of inheriting the featured-card span', () => {
  assert.match(html, /\.tf-manual-detail-grid \{ display:grid; grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(html, /\.tf-manual-detail-grid > \.tf-alpha-menu-card \{[\s\S]{0,160}width:100%; min-height:150px; height:100%; padding:22px/);
  assert.doesNotMatch(html, /(?<!>) \.tf-alpha-menu-card:first-child/);
  assert.match(html, /@media \(max-width:720px\)[\s\S]+\.tf-manual-detail-grid \{ grid-template-columns:1fr; \}/);
});

test('manual keeps all three approved summaries and collapsed detail controls', () => {
  assert.match(app, /規則 1｜有聲調符號/);
  assert.match(app, /低子音：聲調往後一個念<br>非低子音：寫什麼，就念什麼/);
  assert.match(app, /規則 2｜沒有聲調符號/);
  assert.match(app, /子音本身是什麼聲調，這個字就跟著念什麼聲調/);
  assert.match(app, /中子音[\s\S]{0,180}低子音[\s\S]{0,80}一聲/);
  assert.match(app, /高子音[\s\S]{0,180}前引字[\s\S]{0,80}五聲/);
  assert.match(app, /規則 3｜沒有聲調符號/);
  assert.match(app, /全部都是 → 二聲/);
  assert.match(app, /<details'\+open[123]/);
  assert.match(html, /\.tf-manual-rule summary::before \{ content:'＋ '/);
});

test('manual detail state survives internal navigation and resets with a new overlay', () => {
  assert.match(app, /tfAlphabetOverlay = \{ view:'home', arg:null, stack:\[\], details:\{\} \}/);
  assert.match(app, /context === 'rule1' \|\| tfAlphabetOverlay\.details\.rule1/);
  assert.match(app, /ontoggle="TF\.alphaOverlayDetail\(\\'rule1\\',this\.open\)"/);
  assert.match(app, /alphaOverlayDetail: function\(rule, open\)[\s\S]{0,220}tfAlphabetOverlay\.details\[rule\] = !!open/);
  assert.match(app, /tfAlphabetOverlay = \{view:view\|\|'home', arg:arg\|\|null, stack:\[\], details:\{\}\}/);
  assert.doesNotMatch(app.match(/function tfAlphaView[\s\S]+?\n}/)[0], /details\s*=/);
});

test('consonant, vowel and lead cards reuse teacher audio only', () => {
  assert.match(app, /var TF_LEAD_AUDIO = \{'หน':'น','หม':'ม','หล':'ล','หว':'ว','หย':'ย','หร':'ร','หญ':'ญ','หง':'ง','อย':'ย'\}/);
  assert.match(app, /TF_FLASH_AUDIO && TF_FLASH_AUDIO\[category\]/);
  assert.doesNotMatch(app.match(/function tfAlphaAudioTile[\s\S]+?\n}/)[0], /speechSynthesis|SpeechSynthesis|tts/i);
  assert.match(app, /常用子音[\s\S]{0,220}少用子音[\s\S]{0,220}前引字/);
});

test('live/dead choices and exact ending groups are present without ending audio', () => {
  assert.match(app, /先選擇要查看母音或尾音/);
  assert.match(app, /\[\['น','น ณ ญ ร ล ฬ'\],\['ย','ย'\],\['ม','ม'\],\['ง','ง'\],\['ว','ว'\]\]/);
  assert.match(app, /\[\['ก','ก ข ค ฆ'\],\['บ','บ ป พ ฟ ภ'\],\['ด','จ ช ซ ฎ ฏ ฐ ฑ ฒ ด ต ถ ท ธ ศ ษ ส'\]\]/);
  assert.match(app, /card\.exp\.cat[\s\S]{0,300}card\.exp\.how/);
  assert.doesNotMatch(app.match(/function tfAlphaEndingRows[\s\S]+?\n}/)[0], /Speak|Audio|🔊/);
});

test('tone marks are visible and have no fabricated audio', () => {
  assert.match(app, /\['tone2','อ่','二聲符號 ่'\],\['tone3','อ้','三聲符號 ้'\],\['tone4','อ๊','四聲符號 ๊'\],\['tone5','อ๋','五聲符號 ๋'\]/);
  assert.match(app, /這一區只顯示符號，不製作假錄音/);
});

test('alphabet manual and tutorial stay isolated from the vocabulary answer authority', () => {
  assert.match(app, /function navigateToInflection\(\)/);
  assert.match(app, /function catalogExpectedTeachingChoice\(step\)/);
  assert.match(app, /var newTone = nextStep === 'result' \? catalogToneNumber\(\) : null/);
  assert.doesNotMatch(app, /\bTH\.|TH_ENGINE|computeTone|TONE_OVERRIDE|getInitClass|getVowelType|isLiveWord/);
  assert.match(app, /startGuidedQuestion:[\s\S]{0,420}navigateToInflection\(\)/);
  assert.match(app, /openManualFromTip[\s\S]{0,420}tfOpenAlphabetOverlay\('manual'/);
});

test('served minified bundle contains the overlay contract', () => {
  assert.ok(min.includes('openAlphabetOverlay'));
  assert.ok(min.includes('泰文拼音規則手冊'));
  assert.ok(min.includes('查看拼音規則手冊'));
  assert.ok(min.includes('全部都是 → 二聲'));
});

console.log('\n✅ Tone phonics manual tests passed (' + passed + ' checks)');
