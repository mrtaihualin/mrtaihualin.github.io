#!/usr/bin/env node
'use strict';

// ตัวตรวจ "มือถือ + การเข้าถึง (accessibility) + สีธีม" แบบ static (อ่านไฟล์ ไม่เปิดเบราว์เซอร์จริง)
// แนวเดียวกับ scripts/check-site.js — ตอนนี้ให้ผลเป็น "คำเตือน" เท่านั้น ไม่บล็อก push
// (เว็บเก่ามีของค้างเยอะ รอ Lin ตัดสินใจว่าจะยกเป็น error เมื่อไหร่)
//
// รัน: node scripts/check-mobile-accessibility.js

const fs = require('fs');
const path = require('path');
const { listRepositoryFiles } = require('./secret-scanner');

const root = path.resolve(__dirname, '..');

// สีธีมที่อนุญาต — คัดลอกจาก CLAUDE.md หัวข้อ "🎨 กฎข้อ 4 — สีธีม/ดีไซน์เว็บ" (ตรวจตรงกับไฟล์ล่าสุด 2026-07-06)
const ALLOWED_HEX = new Set([
  '8b6310', 'c8973a', 'f3e4c2', '5a3e0a', // gold / gold-bright / gold-light / gold-deep
  '1c1c1c', '333333', '6b6b6b',           // ink / ink-soft / ink-muted
  'ede7d9', 'faf4e8',                     // bg / cream
  '2d6a4f', '1b4332',                     // green / green-dark
  'b45309', '78350f', '92400e',           // amber / amber-dark / amber-muted
  '06c755'                                // LINE (ยกเว้นไว้ใน CLAUDE.md)
]);
// สีกลาง/ระบบที่ไม่นับเป็นสีหลุดธีม (ขาว/ดำ/โปร่งใส ใช้ทั่วไปในทุกเว็บ ไม่ใช่สีตัดสินใจเชิงแบรนด์)
const NEUTRAL_HEX = new Set(['fff', 'ffffff', '000', '000000']);
const NEUTRAL_KEYWORDS = new Set(['transparent', 'currentcolor', 'inherit', 'none', 'unset', 'initial', 'white', 'black']);
// รายชื่อสี CSS ที่มักหลุดเข้ามาโดยไม่ตั้งใจ (ไม่ครบทุกชื่อ — เป็นการ "สุ่มตรวจ" ตามที่ขอบเขตงานระบุ)
const SUSPECT_NAMED_COLORS = [
  'red', 'blue', 'purple', 'orange', 'pink', 'yellow', 'cyan', 'magenta', 'lime',
  'navy', 'teal', 'maroon', 'olive', 'silver', 'gray', 'grey', 'indigo', 'violet',
  'salmon', 'crimson', 'turquoise', 'skyblue', 'royalblue', 'dodgerblue', 'slateblue'
];

const results = {
  viewport: [],
  imgAlt: [],
  formLabel: [],
  buttonText: [],
  headingOrder: [],
  themeColor: []
};

function stripNonMarkup(text) {
  return text
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(?:script)\b[^>]*>[\s\S]*?<\/script>/gi, (m) => m.replace(/[\s\S]*/, '')); // ตัด JS ทิ้งกัน false positive (เช่น string สี/ข้อความในโค้ด)
}

function checkViewport(relative, rawText) {
  const hasMeta = /<meta[^>]+name\s*=\s*["']viewport["'][^>]*>/i.test(rawText);
  if (!hasMeta) {
    results.viewport.push(`${relative}: ไม่มี <meta name="viewport"> เลย`);
    return;
  }
  const match = rawText.match(/<meta[^>]+name\s*=\s*["']viewport["'][^>]*>/i)[0];
  if (!/width\s*=\s*device-width/i.test(match)) {
    results.viewport.push(`${relative}: มี viewport meta แต่ไม่มี width=device-width — "${match.trim()}"`);
  }
}

function checkImgAlt(relative, markup) {
  for (const match of markup.matchAll(/<img\b([^>]*)>/gi)) {
    const attrs = match[1];
    if (!/\balt\s*=/i.test(attrs)) {
      const snippet = match[0].length > 120 ? match[0].slice(0, 120) + '…' : match[0];
      results.imgAlt.push(`${relative}: <img> ไม่มี alt attribute — ${snippet}`);
    }
  }
}

function collectLabelForIds(markup) {
  const ids = new Set();
  for (const match of markup.matchAll(/<label\b[^>]*\bfor\s*=\s*["']([^"']+)["'][^>]*>/gi)) {
    ids.add(match[1]);
  }
  return ids;
}

function checkFormLabels(relative, markup) {
  const labelForIds = collectLabelForIds(markup);
  const skipTypes = new Set(['hidden', 'submit', 'button', 'reset', 'image']);
  const fieldRegex = /<(input|textarea|select)\b([^>]*)>/gi;
  for (const match of markup.matchAll(fieldRegex)) {
    const tag = match[1].toLowerCase();
    const attrs = match[2];
    const typeMatch = attrs.match(/\btype\s*=\s*["']([^"']+)["']/i);
    const type = typeMatch ? typeMatch[1].toLowerCase() : (tag === 'input' ? 'text' : tag);
    if (tag === 'input' && skipTypes.has(type)) continue;

    const idMatch = attrs.match(/\bid\s*=\s*["']([^"']+)["']/i);
    const hasMatchingLabel = idMatch && labelForIds.has(idMatch[1]);
    const hasAriaLabel = /\baria-label(?:ledby)?\s*=/i.test(attrs);
    const hasPlaceholder = /\bplaceholder\s*=/i.test(attrs);
    const hasTitle = /\btitle\s*=/i.test(attrs);

    if (!hasMatchingLabel && !hasAriaLabel && !hasPlaceholder && !hasTitle) {
      const snippet = match[0].length > 120 ? match[0].slice(0, 120) + '…' : match[0];
      results.formLabel.push(`${relative}: <${tag}> ไม่มี label/aria-label/placeholder คู่กัน — ${snippet}`);
    }
  }
}

function checkButtonText(relative, markup) {
  for (const match of markup.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/gi)) {
    const attrs = match[1];
    const inner = match[2].replace(/<[^>]+>/g, '').trim();
    const hasAriaLabel = /\baria-label\s*=/i.test(attrs);
    if (!inner && !hasAriaLabel) {
      const snippet = match[0].length > 120 ? match[0].slice(0, 120) + '…' : match[0];
      results.buttonText.push(`${relative}: <button> ไม่มีข้อความและไม่มี aria-label — ${snippet}`);
    }
  }
}

function checkHeadingOrder(relative, markup) {
  let previousLevel = 0;
  for (const match of markup.matchAll(/<h([1-6])\b[^>]*>/gi)) {
    const level = parseInt(match[1], 10);
    if (previousLevel !== 0 && level > previousLevel + 1) {
      results.headingOrder.push(`${relative}: หัวข้อกระโดดจาก h${previousLevel} ไป h${level} (ข้าม h${previousLevel + 1})`);
    }
    previousLevel = level;
  }
}

function extractStyleRegions(rawText) {
  const regions = [];
  for (const match of rawText.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) regions.push(match[1]);
  for (const match of rawText.matchAll(/\bstyle\s*=\s*"([^"]*)"/gi)) regions.push(match[1]);
  for (const match of rawText.matchAll(/\bstyle\s*=\s*'([^']*)'/gi)) regions.push(match[1]);
  return regions.join('\n');
}

function checkThemeColors(relative, rawText) {
  const css = extractStyleRegions(rawText);
  if (!css) return;

  const seen = new Set();
  for (const match of css.matchAll(/#([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/g)) {
    const hex = match[1].toLowerCase();
    if (ALLOWED_HEX.has(hex) || NEUTRAL_HEX.has(hex)) continue;
    const key = `hex:${hex}`;
    if (seen.has(key)) continue;
    seen.add(key);
    results.themeColor.push(`${relative}: สี #${hex} ไม่อยู่ในชุดสีธีม CLAUDE.md`);
  }

  const namedPattern = new RegExp(`:\\s*(${SUSPECT_NAMED_COLORS.join('|')})\\b`, 'gi');
  for (const match of css.matchAll(namedPattern)) {
    const name = match[1].toLowerCase();
    if (NEUTRAL_KEYWORDS.has(name)) continue;
    const key = `name:${name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    results.themeColor.push(`${relative}: สีชื่อ "${name}" ไม่อยู่ในชุดสีธีม CLAUDE.md`);
  }
}

const files = listRepositoryFiles(root).filter((f) => f.endsWith('.html') && fs.existsSync(path.join(root, f)));

files.forEach((relative) => {
  const file = path.join(root, relative);
  const rawText = fs.readFileSync(file, 'utf8');
  const markup = stripNonMarkup(rawText);

  checkViewport(relative, rawText);
  checkImgAlt(relative, markup);
  checkFormLabels(relative, markup);
  checkButtonText(relative, markup);
  checkHeadingOrder(relative, markup);
  checkThemeColors(relative, rawText);
});

const categories = [
  ['viewport', 'มือถือ — ไม่มี/ผิด viewport meta'],
  ['imgAlt', 'accessibility — <img> ไม่มี alt'],
  ['formLabel', 'accessibility — ฟอร์มไม่มี label คู่กัน'],
  ['buttonText', 'accessibility — ปุ่มไม่มีข้อความ/aria-label'],
  ['headingOrder', 'accessibility — ลำดับหัวข้อกระโดด'],
  ['themeColor', 'สีธีม — สีหลุดจากชุด CLAUDE.md']
];

let total = 0;
console.log(`ตรวจ ${files.length} ไฟล์ HTML\n`);
categories.forEach(([key, label]) => {
  const items = results[key];
  total += items.length;
  console.log(`${label}: ${items.length} จุด`);
});

console.log(`\nคำเตือนรวมทั้งหมด: ${total} จุด (ไม่บล็อก push — รอ Lin ตัดสินใจว่าจะยกระดับเป็น error เมื่อไหร่)\n`);

categories.forEach(([key, label]) => {
  const items = results[key];
  if (!items.length) return;
  console.log(`\n=== ${label} (${items.length}) ===`);
  items.forEach((line) => console.log(`- ${line}`));
});

process.exit(0);
