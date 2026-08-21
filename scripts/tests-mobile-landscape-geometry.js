#!/usr/bin/env node
'use strict';

const assert = require('assert');

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

const targets = [
  { name: 'synthetic-short', width: 740, height: 360 },
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
  console.log(`✓ ${target.name} ${target.width}x${target.height} safe grid`);
}

console.log(`Mobile Landscape geometry contracts: ${targets.length}/${targets.length} passed`);
