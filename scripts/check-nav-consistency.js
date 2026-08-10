#!/usr/bin/env node
/**
 * check-nav-consistency.js (READ-ONLY — ไม่เขียนไฟล์ใดๆ)
 *
 * ตรวจว่า Navigation ที่ควร generate จาก data/nav-template.js + scripts/generate-nav.js
 * ตรงกับของจริงในทุกหน้า HTML ที่อยู่ใน scope หรือไม่ และหาไฟล์ที่มี <nav class="site-nav">
 * แต่ "ไม่อยู่ใน scope" ของ generator (ตกหล่น) ด้วย
 *
 * ไม่แก้ไฟล์ใดๆ ทั้งสิ้น — สร้าง expected output ใน memory แล้วเทียบ string ตรงๆ เท่านั้น
 *
 * หมายเหตุ: en/*.html มี class="site-nav" เหมือนกัน แต่เป็นเมนูภาษาอังกฤษคนละโครงสร้าง
 * (ไม่ได้ generate จากไฟล์นี้) — ตั้งใจแยกจากกัน ตรวจแล้วยืนยันกับ Lin แล้ว (2026-08-10)
 * จึงไม่นับเป็น mismatch แต่จะแจ้งแยกไว้เฉยๆ กันสับสนในอนาคต
 */
'use strict';
const fs = require('fs');
const path = require('path');
const NAV = require('../data/nav-template.js');

const ROOT = path.join(__dirname, '..');

// ── คัดลอก scope logic มาจาก scripts/generate-nav.js เป๊ะ (ห้ามแก้ต้นฉบับ) ──
const ROOT_PAGES = [
  'all-board.html', 'blog.html', 'community.html', 'content.html', 'faq.html',
  'games-challenge.html', 'games.html', 'index.html', 'leaderboard.html',
  'lego-board.html', 'lego.html', 'listening-game.html', 'mix-board.html',
  'my-progress.html', 'new-student.html', 'page-services.html', 'pricing.html',
  'privacy.html',
  'reading-board.html', 'reading-game.html', 'resources.html', 'sns.html',
  'terms.html', 'thank-you.html', 'tone-finder.html', 'trial.html',
  'typing-board.html', 'typing-game.html', 'vault.html', 'vocab-thank-you.html',
  'word-order-board.html', 'word-order.html'
];
function findNavPagesIn(dir) {
  const full = path.join(ROOT, dir);
  if (!fs.existsSync(full)) return [];
  return fs.readdirSync(full)
    .filter((f) => f.endsWith('.html'))
    .filter((f) => fs.readFileSync(path.join(full, f), 'utf8').indexOf('<nav class="site-nav"') !== -1)
    .map((f) => dir + '/' + f)
    .sort();
}
const SCOPE_PAGES = ROOT_PAGES.concat(findNavPagesIn('blog'));

const NAV_RE = /<nav class="site-nav"[^>]*>[\s\S]*?<\/nav>/;
const BOTTOM_NAV_RE = /<nav id="bottom-nav"[^>]*>[\s\S]*?<\/nav>/;
const ANN_BLOCK_RE = new RegExp(
  NAV.ANN_MARK_START.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') +
  '[\\s\\S]*?' +
  NAV.ANN_MARK_END.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
);
// 🆕 2026-08-10 — nav responsive auto-fit inline script (ดู data/nav-template.js)
const NAVFIT_RE = new RegExp(
  NAV.NAVFIT_MARK_START.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') +
  '[\\s\\S]*?' +
  NAV.NAVFIT_MARK_END.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
);

// ── 1. หาไฟล์ HTML "ทั้ง repo" (ไม่รวม _staging-build ที่เป็น build output ชั่วคราว, node_modules, .git) ──
function walk(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === '_staging-build') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith('.html')) out.push(full);
  }
}
const allHtml = [];
walk(ROOT, allHtml);
const allHtmlRel = allHtml.map((f) => path.relative(ROOT, f));

// ไฟล์ที่มี <nav class="site-nav"> จริง (สแกนทั้ง repo)
const hasNavMarker = allHtmlRel.filter((rel) => {
  const text = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  return text.indexOf('<nav class="site-nav"') !== -1;
});

const scopeSet = new Set(SCOPE_PAGES);
const KNOWN_SEPARATE_NAV_PREFIX = ['en/']; // ยืนยันแล้วว่าเป็นเมนูคนละระบบตั้งใจ ไม่ใช่บั๊ก
const outOfScopeButHasNav = hasNavMarker.filter((rel) => !scopeSet.has(rel) && !rel.startsWith('_dev/'));
const trulyUnexpected = outOfScopeButHasNav.filter((rel) => !KNOWN_SEPARATE_NAV_PREFIX.some((p) => rel.startsWith(p)));
const knownSeparateNav = outOfScopeButHasNav.filter((rel) => KNOWN_SEPARATE_NAV_PREFIX.some((p) => rel.startsWith(p)));
const inScopeButMissingFile = SCOPE_PAGES.filter((f) => !fs.existsSync(path.join(ROOT, f)));

// ── 2. เทียบเนื้อหา nav / ann-band / bottom-nav ของทุกหน้าใน scope กับ expected ──
const mismatches = [];
const legacyNavDuplicates = [];
let checkedCount = 0;

SCOPE_PAGES.forEach((file) => {
  const full = path.join(ROOT, file);
  if (!fs.existsSync(full)) return;
  checkedCount++;
  const text = fs.readFileSync(full, 'utf8');

  const navMatches = text.match(new RegExp(NAV_RE.source, 'g'));
  if (!navMatches) {
    mismatches.push({ file, kind: 'nav ไม่พบ', detail: 'ไม่พบ <nav class="site-nav"> ทั้งที่อยู่ใน scope' });
    return;
  }
  if (navMatches.length > 1) {
    legacyNavDuplicates.push({ file, count: navMatches.length });
  }

  const expectedNav = '<nav class="site-nav">' + NAV.renderNavHTML(file) + '</nav>';
  const actualNav = navMatches[0];
  if (actualNav !== expectedNav) {
    mismatches.push({
      file, kind: 'nav เนื้อหาไม่ตรง',
      detail: 'ความยาว actual=' + actualNav.length + ' expected=' + expectedNav.length
    });
  }

  if (text.indexOf('data/nav-template.js') === -1) {
    mismatches.push({ file, kind: 'ไม่มี <script data/nav-template.js>', detail: '' });
  }

  const navFitMatch = text.match(NAVFIT_RE);
  const expectedNavFit = NAV.renderNavFitScriptHTML();
  if (!navFitMatch) {
    mismatches.push({ file, kind: 'nav-fit script ไม่พบ', detail: 'ไม่พบ NAV-FIT marker' });
  } else if (navFitMatch[0] !== expectedNavFit) {
    mismatches.push({ file, kind: 'nav-fit script เนื้อหาไม่ตรง', detail: '' });
  }

  const annMatch = text.match(ANN_BLOCK_RE);
  const expectedAnn = NAV.renderAnnBandBlockHTML();
  if (!annMatch) {
    mismatches.push({ file, kind: 'ann-band ไม่พบ', detail: 'ไม่พบ ANN-BAND marker' });
  } else if (annMatch[0] !== expectedAnn) {
    mismatches.push({ file, kind: 'ann-band เนื้อหาไม่ตรง', detail: '' });
  }

  const bnMatches = text.match(new RegExp(BOTTOM_NAV_RE.source, 'g'));
  const expectedBottom = '<nav id="bottom-nav">' + NAV.renderBottomNavHTML() + '</nav>';
  if (!bnMatches) {
    mismatches.push({ file, kind: 'bottom-nav ไม่พบ', detail: '' });
  } else if (bnMatches.length > 1) {
    mismatches.push({ file, kind: 'bottom-nav ซ้ำ', detail: bnMatches.length + ' จุด' });
  } else if (bnMatches[0] !== expectedBottom) {
    mismatches.push({ file, kind: 'bottom-nav เนื้อหาไม่ตรง', detail: '' });
  }
});

console.log('=== nav consistency checker (read-only) ===');
console.log('source-of-truth: data/nav-template.js + scripts/generate-nav.js');
console.log('หน้าที่อยู่ใน scope ของ generator: ' + SCOPE_PAGES.length);
console.log('หน้าที่ตรวจได้จริง (มีไฟล์อยู่): ' + checkedCount);
console.log('');

let failed = false;

if (inScopeButMissingFile.length) {
  failed = true;
  console.log('🔴 อยู่ใน scope แต่หาไฟล์ไม่เจอ (' + inScopeButMissingFile.length + '):');
  inScopeButMissingFile.forEach((f) => console.log('  - ' + f));
  console.log('');
}

if (trulyUnexpected.length) {
  failed = true;
  console.log('🔴 มี <nav class="site-nav"> จริง แต่ "ไม่อยู่ใน scope" ของ generate-nav.js (' + trulyUnexpected.length + '):');
  trulyUnexpected.forEach((f) => console.log('  - ' + f));
  console.log('');
}

if (legacyNavDuplicates.length) {
  failed = true;
  console.log('🔴 พบ <nav class="site-nav"> มากกว่า 1 จุดในไฟล์เดียว (legacy ซ้ำ) (' + legacyNavDuplicates.length + '):');
  legacyNavDuplicates.forEach((d) => console.log('  - ' + d.file + ' (' + d.count + ' จุด)'));
  console.log('');
}

if (mismatches.length) {
  failed = true;
  console.log('🔴 mismatch ระหว่าง generated (expected) กับของจริงในไฟล์ (' + mismatches.length + '):');
  mismatches.forEach((m) => console.log('  - ' + m.file + '  [' + m.kind + ']' + (m.detail ? ' ' + m.detail : '')));
  console.log('');
}

if (knownSeparateNav.length) {
  console.log('ℹ️ มี class="site-nav" แต่เป็นเมนูคนละระบบตั้งใจ (ไม่นับเป็น mismatch — ยืนยันกับ Lin แล้ว 2026-08-10): ' + knownSeparateNav.length + ' ไฟล์ (en/*.html)');
  console.log('');
}

if (!failed) {
  console.log('✅ PASS — ทุกหน้าใน scope ตรงกับ generated nav/ann-band/bottom-nav ทุกจุด ไม่มี legacy nav ซ้ำ ไม่มีหน้าตกหล่น');
} else {
  console.log('❌ FAIL — พบปัญหาด้านบน (ดูรายละเอียด)');
}

process.exitCode = failed ? 1 : 0;
