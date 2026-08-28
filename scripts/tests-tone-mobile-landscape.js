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
const stage = read('js/games/tone-mobile-landscape.js');
const css = read('css/tone-mobile-landscape.css');

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log('✓ ' + name);
  } catch (error) {
    console.error('✗ ' + name);
    throw error;
  }
}

test('Tone page binds only the Tone landscape assets and safe viewport', () => {
  assert.match(html, /viewport-fit=cover/);
  assert.match(html, /css\/tone-mobile-landscape\.css\?v=3/);
  assert.match(html, /js\/games\/tone-mobile-landscape\.js\?v=1/);
  const scopedGames = [...(stage + css).matchAll(/data-gsh-game="([^"]+)"/g)].map((match) => match[1]);
  assert.ok(scopedGames.length > 0 && scopedGames.every((game) => game === 'tone'));
});

test('top bar and all four dropdowns share stable below-trigger positioning', () => {
  assert.match(stage, /mountExistingNode\(q\('\.tf-page-title'\), slot\('shared-controls'\)\)/);
  assert.match(stage, /mountExistingNode\(q\('\.rg-ctl-wrap'\), slot\('main-action'\)\)/);
  assert.match(stage, /function positionPanelBelow\(trigger, panel, fallbackWidth\)[\s\S]{0,1800}rect\.bottom \+ 4/);
  assert.match(stage, /function syncUtilityPanels\(\)[\s\S]{0,1200}positionPanelBelow\(trigger, panel, 240\)/);
  assert.match(stage, /if \(open\) positionPanelBelow\(trigger, panel, 220\)/);
  assert.match(stage, /GamePanels\.closeOthers\(panelRegistryEntry\)/);
});

test('Level and Tools are centered, touchable and scroll at six rows', () => {
  assert.match(css, /data-gsh-dropdown="level"[\s\S]{0,300}grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(css, /data-gsh-game="tone"[\s\S]{0,120}data-gsh-dropdown="tools"[\s\S]{0,320}grid-template-columns: 28px minmax\(0, 1fr\)[\s\S]{0,300}border: 0 !important/);
  assert.match(css, /data-gsh-dropdown="tools"[\s\S]{0,1800}max-height: calc\([\s\S]{0,900}overflow-y: auto !important/);
  assert.match(css, /gsh-ml-dropdown-trigger[\s\S]{0,520}touch-action: manipulation/);
  assert.match(stage, /labeledNode\('#rg-pron-toggle', '讀音', '🗣️'\)/);
});

test('gameplay keeps three equal controls per side and Skip at center bottom', () => {
  assert.match(stage, /children\.length === 6 \? 3/);
  assert.match(stage, /mountExistingNode\(uncertain, container\)/);
  assert.match(css, /sg-dontknow-btn[\s\S]{0,620}width: var\(--gsh-ml-tone-choice\)[\s\S]{0,520}border-radius: 50% !important/);
  assert.match(css, /data-gsh-ml-slot="current-input"[\s\S]{0,160}:has\(> \[data-gsh-ml-role="skip"\]\)[\s\S]{0,240}margin-top: auto[\s\S]{0,120}justify-content: flex-end/);
  assert.match(css, /data-gsh-ml-split="tone"\][\s\S]{0,160}align-content: end[\s\S]{0,120}padding-block: 0 !important/);
  assert.match(css, /max-height: 300px[\s\S]{0,520}--gsh-ml-tone-choice: clamp\(46px, 22\.5dvh, 58px\)/);
});

test('center owns the word, guidance and symmetric scrollable reveal content', () => {
  assert.match(css, /:has\(\[data-gsh-ml-split="tone"\] > \.sg-tone-btn\)[\s\S]{0,200}#tf-banner[\s\S]{0,240}flex: 1 1 auto/);
  assert.match(css, /question"\] #tf-body[\s\S]{0,340}overflow-y: auto !important[\s\S]{0,220}touch-action: pan-y/);
  assert.match(css, /\.tf-body \.result-v2 \{[\s\S]{0,260}display: flex[\s\S]{0,180}gap: var\(--gsh-ml-gap\)/);
  assert.match(css, /\.tf-options\[data-gsh-ml-split="tone"\][\s\S]{0,120}align-content: end !important/);
  assert.match(css, /\.tf-options:has\(> \.tf-opt-wrap:nth-child\(3\):last-child\)[\s\S]{0,760}data-gsh-side="right"\]\[data-gsh-side-index="1"\][\s\S]{0,100}grid-row: 2/);
});

test('physical iPhone Safari keeps long guided sentences inside the center column', () => {
  assert.match(css, /#gsh-ml-stage \{[\s\S]{0,180}-webkit-text-size-adjust: 100%[\s\S]{0,80}text-size-adjust: 100%/);
  assert.match(css, /question"\] #tf-banner \{[\s\S]{0,260}min-height: 0[\s\S]{0,220}overflow-y: auto !important/);
  assert.match(css, /\.tf-adv-sent-main \{[\s\S]{0,220}font-size: clamp\(22px, 7\.2dvh, 30px\) !important[\s\S]{0,100}line-height: 1\.25 !important/);
  assert.match(css, /:has\(\[data-gsh-ml-split="tone"\] > \.sg-tone-btn\)[\s\S]{0,220}#tf-banner[\s\S]{0,220}max-height: none/);
});

test('guided deduction cards form a readable bottom row and grow upward', () => {
  assert.match(css, /:has\(#tf-body > \.tf-qbox, #tf-body > \.tf-helper-result\)[\s\S]{0,180}#tf-body \{[\s\S]{0,180}display: flex !important[\s\S]{0,120}justify-content: flex-end/);
  assert.match(css, /:has\(#tf-body > \.tf-qbox, #tf-body > \.tf-helper-result\)[\s\S]{0,180}#tf-body > \* \{[\s\S]{0,180}position: static !important[\s\S]{0,260}max-height: none !important/);
  assert.match(css, /#tf-body > \.tf-helper-trigger \{[\s\S]{0,80}order: -1/);
  assert.match(css, /\.tf-options\[data-gsh-ml-split="tone"\][\s\S]{0,120}align-content: end !important/);
});

test('reveal and summary replace the right-side controls without Switch Game', () => {
  assert.match(stage, /function syncToneRevealActions\(\)[\s\S]{0,900}result-audio[\s\S]{0,260}result-english[\s\S]{0,260}result-next/);
  assert.match(css, /data-gsh-ml-role="result-audio"\][\s\S]{0,140}grid-row: 1[\s\S]{0,260}data-gsh-ml-role="result-english"\][\s\S]{0,140}grid-row: 2[\s\S]{0,520}data-gsh-ml-role="result-next"\][\s\S]{0,140}grid-row: 3/);
  assert.match(css, /data-gsh-ml-role="summary-replay"\][\s\S]{0,140}grid-row: 3/);
  assert.match(css, /\[data-game-result-switch="v1"\][\s\S]{0,100}display: none !important/);
  assert.match(stage, /function createToneSummaryScrollPad\(\)[\s\S]{0,1700}pointermove[\s\S]{0,560}scroller\.scrollTop = toneSummaryDrag\.top \+ distance/);
});

test('mobile runtime removes computer-only actions and keeps neutral scoring', () => {
  assert.match(app, /function tfTouchMobileSurface\(\)[\s\S]{0,140}tfMobilePortrait\(\) \|\| tfMobileLandscape\(\)/);
  assert.match(app, /function tfWireToneKeyboard\(\)[\s\S]{0,160}if \(tfTouchMobileSurface\(\)\) return/);
  assert.match(app, /function tfWireEnterNext\(\)[\s\S]{0,160}if \(tfTouchMobileSurface\(\)\) return/);
  assert.match(app, /body\.innerHTML \+= tfNeutralSkipSurface\(\)[\s\S]{0,260}>跳過<\/button>/);
  assert.match(app, /skipCurrentWord:\s*function\(\)[\s\S]{0,1500}is_skipped:\s*true[\s\S]{0,260}skip_reason:\s*'user_skip'/);
  assert.match(app, /var _th = e\.readingTH \|\| \(tfMobileLandscape\(\) \? e\.word : ''\) \|\| ''/);
  assert.match(app, /if \(tfMobileLandscape\(\) && dispWord && !audioBtnHtml\)[\s\S]{0,420}class="word-audio-btn"[\s\S]{0,460}WordAudio\.has\([\s\S]{0,320}WordAudio\.soonToast/);
  assert.match(app, /tfMobileLandscape\(\) \? '' : '<div class="sg-question">你覺得這個字是第幾聲？<\/div>'/);
  assert.match(min, />跳過<\/button>/);
  assert.ok(min.includes('不確定'));
});

console.log('\n✅ Tone Mobile Landscape tests passed (' + passed + ' checks)');
