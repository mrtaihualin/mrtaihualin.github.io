#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

function clamp(min, value, max) { return Math.max(min, Math.min(value, max)); }
function intersects(a, b, tolerance = 1) {
  const overlapWidth = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const overlapHeight = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return overlapWidth > tolerance && overlapHeight > tolerance;
}
function contained(inner, outer, tolerance = 1) {
  return inner.x >= outer.x - tolerance && inner.y >= outer.y - tolerance &&
    inner.x + inner.width <= outer.x + outer.width + tolerance &&
    inner.y + inner.height <= outer.y + outer.height + tolerance;
}

function layout(width, height, safe = { left: 12, right: 12, top: 8, bottom: 8 }) {
  const usable = { x: safe.left, y: safe.top, width: width - safe.left - safe.right, height: height - safe.top - safe.bottom };
  const topHeight = clamp(40, height * 0.11, 52);
  const gap = clamp(4, height * 0.013, 10);
  const contentWidth = usable.width - gap * 2;
  const leftWidth = contentWidth * 0.31;
  const centerWidth = contentWidth * 0.38;
  const rightWidth = contentWidth - leftWidth - centerWidth;
  const top = {
    left: { x: usable.x, y: usable.y, width: leftWidth, height: topHeight },
    center: { x: usable.x + leftWidth + gap, y: usable.y, width: centerWidth, height: topHeight },
    right: { x: usable.x + leftWidth + centerWidth + gap * 2, y: usable.y, width: rightWidth, height: topHeight }
  };
  const playY = usable.y + topHeight + gap;
  const playHeight = usable.height - topHeight - gap;
  const play = {
    left: { x: top.left.x, y: playY, width: leftWidth, height: playHeight },
    center: { x: top.center.x, y: playY, width: centerWidth, height: playHeight },
    right: { x: top.right.x, y: playY, width: rightWidth, height: playHeight }
  };
  return { viewport: { x: 0, y: 0, width, height }, usable, top, play };
}

function toneChoiceLayout(width, height, safe) {
  const stage = layout(width, height, safe);
  const size = clamp(64, height * 0.24, 96);
  const gap = clamp(4, height * 0.013, 10);
  const leftX = stage.play.left.x + (stage.play.left.width - size) / 2;
  const rightX = stage.play.right.x + (stage.play.right.width - size) / 2;
  const leftGroupHeight = size * 3 + gap * 2;
  const rightGroupHeight = size * 2 + gap;
  const leftY = stage.play.left.y + (stage.play.left.height - leftGroupHeight) / 2;
  const rightY = stage.play.right.y + (stage.play.right.height - rightGroupHeight) / 2;
  return {
    stage,
    size,
    left: [0, 1, 2].map((index) => ({ x: leftX, y: leftY + index * (size + gap), width: size, height: size })),
    right: [0, 1].map((index) => ({ x: rightX, y: rightY + index * (size + gap), width: size, height: size }))
  };
}

function typingKeyboardLayout(width, height, safe) {
  const stage = layout(width, height, safe);
  const gap = clamp(1, height * 0.002, 1.5);
  const keyHeight = clamp(40, height * 0.115, 56);
  const sideWidth = stage.usable.width * 0.4;
  const widestHalfCount = 7;
  const keyWidth = (sideWidth - gap * (widestHalfCount - 1)) / widestHalfCount;
  return { gap, keyHeight, keyWidth, functionWidth: sideWidth };
}

function readingChoiceLayout(width, height, totalChoices, safe) {
  const stage = layout(width, height, safe);
  const gap = clamp(4, height * 0.013, 10);
  const pad = clamp(6, height * 0.017, 12);
  const leftCount = Math.ceil(totalChoices / 2);
  const rightCount = totalChoices - leftCount;
  const rows = Math.max(leftCount, rightCount);
  const choiceHeight = clamp(56, (stage.play.left.height - pad * 2 - gap * (rows - 1)) / rows, 96);
  const makeSide = (region, count) => {
    const groupHeight = count * choiceHeight + Math.max(0, count - 1) * gap;
    const y = region.y + (region.height - groupHeight) / 2;
    return Array.from({ length: count }, (_, index) => ({
      x: region.x + pad, y: y + index * (choiceHeight + gap),
      width: region.width - pad * 2, height: choiceHeight
    }));
  };
  return { stage, choiceHeight, left: makeSide(stage.play.left, leftCount), right: makeSide(stage.play.right, rightCount) };
}

function wordOrderLayout(width, height, safe) {
  const stage = layout(width, height, safe);
  const rowGap = clamp(5, height * 0.016, 8);
  const paddingBlock = clamp(4, height * 0.012, 8);
  const tileWidth = clamp(92, width * 0.15, 150);
  const tileHeight = clamp(46, height * 0.12, 58);
  const slotWidth = clamp(54, width * 0.08, 76);
  const slotHeight = clamp(42, height * 0.11, 50);
  return { stage, rowGap, paddingBlock, tileWidth, tileHeight, slotWidth, slotHeight };
}

const targets = [
  { name: 'synthetic-short', width: 740, height: 360 },
  { name: 'physical-iphone', width: 932, height: 430 },
  { name: 'max-contract', width: 1024, height: 600 }
];
const exact = process.env.REAL_IPHONE_CSS_VIEWPORT;
if (exact) {
  const match = exact.match(/^(\d+)x(\d+)$/i);
  assert(match, 'REAL_IPHONE_CSS_VIEWPORT must use WIDTHxHEIGHT');
  targets.push({ name: 'exact-iphone', width: Number(match[1]), height: Number(match[2]) });
} else {
  console.log('EXACT_IPHONE_TARGET=UNKNOWN');
}

for (const target of targets) {
  const result = layout(target.width, target.height);
  for (const rect of Object.values(result.top).concat(Object.values(result.play))) {
    assert(contained(rect, result.usable), `${target.name}: zone escaped usable safe area`);
    assert(rect.width > 0 && rect.height > 0, `${target.name}: zero-size zone`);
  }
  assert(!intersects(result.top.left, result.top.center), `${target.name}: top-left collided with top-center`);
  assert(!intersects(result.top.center, result.top.right), `${target.name}: top-center collided with top-right`);
  assert(!intersects(result.play.left, result.play.center), `${target.name}: left collided with center`);
  assert(!intersects(result.play.center, result.play.right), `${target.name}: center collided with right`);
  assert(result.play.left.width >= 200 || target.width < 740, `${target.name}: left thumb zone too narrow`);
  assert(result.play.right.width >= 200 || target.width < 740, `${target.name}: right thumb zone too narrow`);
  const tone = toneChoiceLayout(target.width, target.height, { left: 12, right: 12, top: 8, bottom: 8 });
  const choices = tone.left.concat(tone.right);
  choices.forEach((choice) => {
    assert.strictEqual(choice.width, choice.height, `${target.name}: Tone choice must be square before circular radius`);
    assert(contained(choice, tone.stage.usable), `${target.name}: Tone choice escaped the safe area`);
    assert(!intersects(choice, tone.stage.play.center), `${target.name}: Tone choice entered the center column`);
  });
  assert(tone.size >= 64 && tone.size <= 96, `${target.name}: Tone choice size escaped locked responsive bounds`);
  assert(Math.abs((tone.left[0].y + tone.left[2].y + tone.size) / 2 - (tone.stage.play.left.y + tone.stage.play.left.height / 2)) <= 1,
    `${target.name}: left Tone choices are not centered in their own side column`);
  assert(Math.abs((tone.right[0].y + tone.right[1].y + tone.size) / 2 - (tone.stage.play.right.y + tone.stage.play.right.height / 2)) <= 1,
    `${target.name}: right Tone choices are not centered in their own side column`);
  [4, 10].forEach((totalChoices) => {
    const reading = readingChoiceLayout(target.width, target.height, totalChoices, { left: 12, right: 12, top: 8, bottom: 8 });
    reading.left.forEach((choice) => {
      assert(contained(choice, reading.stage.play.left), `${target.name}: Reading left choice escaped its side column`);
      assert(!intersects(choice, reading.stage.play.center), `${target.name}: Reading left choice entered the center column`);
    });
    reading.right.forEach((choice) => {
      assert(contained(choice, reading.stage.play.right), `${target.name}: Reading right choice escaped its side column`);
      assert(!intersects(choice, reading.stage.play.center), `${target.name}: Reading right choice entered the center column`);
    });
    assert(reading.choiceHeight >= 56, `${target.name}: Reading choice touch height fell below 56 CSS px`);
  });
  const typing = typingKeyboardLayout(target.width, target.height, { left: 12, right: 12, top: 8, bottom: 8 });
  if (target.width === 740) assert(typing.keyWidth >= 40, `${target.name}: Typing keys must remain at least 40 CSS px wide`);
  if (target.width === 932) assert(typing.keyWidth >= 48 && typing.keyWidth <= 52, `${target.name}: Typing keys must approximate the physical mobile keyboard`);
  if (target.width === 1024) assert(typing.keyWidth >= 48, `${target.name}: Typing keys must retain a large touch width`);
  assert(typing.keyHeight >= 40, `${target.name}: Typing keys must remain at least 40 CSS px high`);
  assert(typing.functionWidth >= typing.keyWidth * 2, `${target.name}: Shift and Backspace must remain thumb-friendly function keys`);
  const wordOrder = wordOrderLayout(target.width, target.height, { left: 12, right: 12, top: 8, bottom: 8 });
  assert(wordOrder.tileWidth <= wordOrder.stage.play.left.width, `${target.name}: Word Order tile must fit its own side column`);
  assert(wordOrder.tileWidth <= wordOrder.stage.play.right.width, `${target.name}: Word Order tile must fit the right side column`);
  const threeTileHeight = wordOrder.tileHeight * 3 + wordOrder.rowGap * 2 + wordOrder.paddingBlock * 2;
  assert(threeTileHeight <= wordOrder.stage.play.left.height, `${target.name}: three left-side Word Order tiles must fit without vertical scrolling`);
  assert(wordOrder.slotWidth <= wordOrder.stage.play.center.width, `${target.name}: Word Order slot must fit the center column`);
  assert(wordOrder.slotHeight * 4 <= wordOrder.stage.play.center.height, `${target.name}: wrapped Word Order slots must fit the center without page scrolling`);
  console.log(`  Typing keyboard key=${typing.keyWidth.toFixed(1)}x${typing.keyHeight.toFixed(1)} function=${typing.functionWidth.toFixed(1)}x${typing.keyHeight.toFixed(1)}`);
  console.log(`  Word Order tile=${wordOrder.tileWidth.toFixed(1)}x${wordOrder.tileHeight.toFixed(1)} slot=${wordOrder.slotWidth.toFixed(1)}x${wordOrder.slotHeight.toFixed(1)}`);
  console.log(`✓ ${target.name} ${target.width}x${target.height} safe grid`);
}

const css = fs.readFileSync(path.join(__dirname, '..', 'css', 'mobile-landscape.css'), 'utf8');
assert.match(css, /--gsh-ml-tone-choice:\s*clamp\(64px,\s*24dvh,\s*96px\)/, 'Tone choices must use the locked responsive square size');
assert.match(css, /\.sg-tone-grid > \.sg-tone-btn[\s\S]*?aspect-ratio:\s*1;[\s\S]*?border-radius:\s*50%/, 'Tone choices must be true circles');
assert.match(css, /data-gsh-game="tone"[\s\S]*?data-gsh-ml-split="tone"[\s\S]*?overflow-y:\s*hidden/, 'Tone split answers must forbid vertical scrolling');
assert.match(css, /data-gsh-ml-slot="shared-controls"[\s\S]*?button\.rg-ctl-fab\[aria-pressed\][\s\S]*?display:\s*none/, 'Mobile Landscape must hide the existing Full Screen control only inside the stage');
assert.doesNotMatch(css, /rg-ctl-fab:nth-child/, 'Full Screen must never use nth-child guessing');
assert.match(css, /data-gsh-game="reading"[\s\S]*?data-gsh-ml-split="reading"[\s\S]*?overflow-y:\s*hidden/, 'Reading split choices must forbid vertical scrolling');
assert.match(css, /data-gsh-max-side-count="5"[\s\S]*?--gsh-ml-reading-rows:\s*5/, 'Reading must fit its live maximum of five choices per side');
assert.match(css, /data-gsh-side-index="4"[\s\S]*?grid-row:\s*5/, 'Reading fifth side choice must receive an in-viewport row');
assert.match(css, /data-gsh-game="reading"[\s\S]*?data-gsh-ml-slot="question"[\s\S]*?justify-content:\s*flex-start/, 'Reading center must remain question-first and top-biased');
assert.match(css, /\.sg-tone-grid \+ div[\s\S]*?display:\s*none/, 'Tone desktop keyboard hint must be hidden only by the Mobile Landscape stylesheet');
assert.match(css, /--gsh-ml-key-h:\s*clamp\(40px,\s*11\.5dvh,\s*56px\)/, 'Typing keys must use the responsive thumb-target height');
assert.match(css, /gsh-split-kbd-row[\s\S]*?grid-template-columns:\s*minmax\(0,\s*40fr\)\s+minmax\(0,\s*20fr\)\s+minmax\(0,\s*40fr\)/, 'Typing keyboard overlay must use its allowed 40/20/40 thumb zones');
assert.match(css, /data-gsh-game="typing"[\s\S]*?data-gsh-ml-slot="center"[\s\S]*?justify-content:\s*flex-start/, 'Typing center must remain question-first and top-biased');
assert.match(css, /data-gsh-game="typing"[\s\S]*?data-gsh-ml-slot="left"[\s\S]*?overflow:\s*hidden/, 'Typing gameplay must forbid vertical side scrolling');
assert.match(css, /data-gsh-game="word-order"[\s\S]*?data-gsh-ml-split="word-order"[\s\S]*?overflow-y:\s*hidden[\s\S]*?overflow-x:\s*hidden/, 'Word Order split bank must forbid gameplay scrolling');
assert.match(css, /data-gsh-ml-split="word-order"[\s\S]*?> \.wo-tile[\s\S]*?min-width:\s*clamp\(92px,\s*15vw,\s*150px\)[\s\S]*?min-height:\s*clamp\(46px,\s*12dvh,\s*58px\)/, 'Word Order tiles must use responsive thumb-friendly bounds');
assert.match(css, /data-gsh-game="word-order"[\s\S]*?#wo-slots \.wo-slot[\s\S]*?min-width:\s*clamp\(54px,\s*8vw,\s*76px\)[\s\S]*?min-height:\s*clamp\(42px,\s*11dvh,\s*50px\)/, 'Word Order slots must use responsive center-fit bounds');

console.log(`Mobile Landscape geometry contracts: ${targets.length}/${targets.length} passed`);
