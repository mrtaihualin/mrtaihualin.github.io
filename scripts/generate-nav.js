#!/usr/bin/env node
/**
 * generate-nav.js
 * "พิมพ์ทับ" nav block (<nav class="site-nav">...</nav>) ในทุกหน้า HTML
 * ให้ตรงกับ data/nav-template.js (single source of truth) ทุกครั้งที่รัน
 *
 * ทำไมต้องมีสคริปต์นี้ (แทนที่จะฉีดเมนูด้วย JS ล้วนๆ):
 *   2026-07-24 เคยตัดสินใจ hard-code เมนูในทุกหน้า HTML เพื่อให้ crawler
 *   (Google/AI) เห็นลิงก์แบบ static ได้เลยไม่ต้องรอ JS รัน (SEO/GEO)
 *   สคริปต์นี้ทำให้ "แก้เมนูจุดเดียว" ได้จริงโดยไม่ย้อนกลับไปเสี่ยง SEO —
 *   เพราะหน้าเว็บที่ push ขึ้นจริงยังเป็น static HTML ปกติทุกประการ
 *
 * ใช้เมื่อไหร่: ทุกครั้งที่แก้ data/nav-template.js ต้องรันไฟล์นี้ก่อน push เสมอ
 * วิธีใช้: node scripts/generate-nav.js
 *
 * Idempotent: รันซ้ำกี่ครั้งก็ได้ ถ้า nav-template.js ไม่เปลี่ยน ไฟล์ HTML จะไม่ถูกเขียนทับซ้ำ
 * (เทียบเนื้อหาก่อน-หลังก่อน write เสมอ)
 */
const fs = require('fs');
const path = require('path');
const NAV = require('../data/nav-template.js');

const ROOT = path.join(__dirname, '..');

// รายชื่อหน้า root ที่มี <nav class="site-nav"> จริง (ตรวจจาก grep ของจริงในโค้ด 2026-08-09)
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

// 🆕 2026-08-10 — หน้าในโฟลเดอร์ย่อยก็ต้องรวมด้วย (เจอบั๊กจริง):
//   รอบ 2026-08-09 รายชื่อด้านบนมีแต่หน้า root เลย "ตกหล่นหน้า blog/ ทั้ง 44 ไฟล์"
//   ทั้งที่ทุกไฟล์มี <nav class="site-nav"> จริง → เว็บมีเมนู 2 ชุดไม่ตรงกันอยู่พักหนึ่ง
//   รอบนี้เปลี่ยนเป็น "ให้สคริปต์หาเอง" แทนการพิมพ์รายชื่อมือ เพื่อไม่ให้บทความใหม่ในอนาคตตกหล่นซ้ำอีก
function findNavPagesIn(dir) {
  const full = path.join(ROOT, dir);
  if (!fs.existsSync(full)) return [];
  return fs.readdirSync(full)
    .filter(function (f) { return f.endsWith('.html'); })
    .filter(function (f) {
      return fs.readFileSync(path.join(full, f), 'utf8').indexOf('<nav class="site-nav"') !== -1;
    })
    .map(function (f) { return dir + '/' + f; })
    .sort();
}

const PAGES = ROOT_PAGES.concat(findNavPagesIn('blog'));

// ตัด <nav class="site-nav" ...> ... </nav> ตัวแรกที่เจอ (nav ไม่ nest กันในหน้าพวกนี้
// ตรวจแล้วว่ามีแค่ตัวเดียวต่อหน้าจริงตอนสำรวจ 2026-08-09)
const NAV_RE = /<nav class="site-nav"[^>]*>[\s\S]*?<\/nav>/;
// path ของ <script> ต้องขึ้นกับความลึกของไฟล์ (root = data/... · blog/ = ../data/...)
// ทุก href ใน nav-template.js เป็น absolute (/games.html) อยู่แล้ว จึงใช้จากโฟลเดอร์ย่อยได้ตรงๆ
function navTemplateTagFor(file) {
  const depth = file.split('/').length - 1;
  return '<script src="' + '../'.repeat(depth) + 'data/nav-template.js?v=2"></script>';
}
const SHARED_MIN_RE = /<script src="(?:\.\.\/)*js\/core\/shared\.min\.js[^"]*"><\/script>/;

// 🆕 2026-08-10 (Lin อนุมัติ) — แถบล่างมือถือ 4 ไอคอน ต้องเขียนลง HTML เป็น static ด้วย
//   เดิมสร้างด้วย JS ใน shared.js → มาทีหลัง shared.min.js (~115KB) เสมอ
//   ทำให้ทุกครั้งที่เปลี่ยนหน้าบนมือถือ layout ขยับ 1 ครั้ง = เห็นเป็น "กระพริบ/โหลด 2 รอบ" (Lin เจอจริง)
//   ตอนนี้เขียนลง HTML ตรงๆ เหมือนเมนูบนสุด + ย้าย CSS ไป css/shared.css → ไม่ต้องรอ JS เลย
//   (shared.js มีด่าน `if (document.getElementById('bottom-nav')) return;` กันสร้างซ้ำแล้ว)
const BOTTOM_NAV_RE = /<nav id="bottom-nav"[^>]*>[\s\S]*?<\/nav>/;
const BODY_CLOSE_RE = /<\/body>/i;

// 🆕 2026-08-10 (Lin อนุมัติ) — แถบประกาศด้านบน (.avail-band) ก็ต้องเป็น static เหมือนกัน
//   เดิม JS แทรกเข้าเป็นลูกตัวแรกของ <body> ตอน shared.min.js โหลดเสร็จ → เนื้อหาทั้งหน้าถูกดันลง
//   = "หน้ากระพริบ" ทุกครั้งที่เปลี่ยนหน้าบนมือถือ (สาเหตุที่เหลืออยู่หลังแก้แถบล่างไปแล้ว)
//   ก้อนที่เขียนลงไป = <script> เช็ค sessionStorage + <div class="avail-band" id="ann-band">สไลด์แรก</div>
//   ห่อด้วยคอมเมนต์ START/END เพื่อพิมพ์ทับได้แม่นยำ (ห้ามใช้ regex จับ <div>…</div> เพราะข้างในมี <div> ซ้อนหลายชั้น)
const ANN_BLOCK_RE = new RegExp(
  NAV.ANN_MARK_START.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') +
  '[\\s\\S]*?' +
  NAV.ANN_MARK_END.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
);
const BODY_OPEN_RE = /<body[^>]*>/i;

let filesChanged = 0;
let scriptTagAdded = 0;
let bottomNavAdded = 0;
let bottomNavUpdated = 0;
let annBandAdded = 0;
let annBandUpdated = 0;
const skipped = [];
const problems = [];

PAGES.forEach(function (file) {
  const full = path.join(ROOT, file);
  if (!fs.existsSync(full)) { skipped.push(file + '  ← ไม่พบไฟล์ (เช็คว่าลบ/ย้ายไปหรือยัง)'); return; }

  const original = fs.readFileSync(full, 'utf8');

  const navMatches = original.match(new RegExp(NAV_RE.source, 'g'));
  if (!navMatches) { skipped.push(file + '  ← ไม่พบ <nav class="site-nav"> ในไฟล์'); return; }
  if (navMatches.length > 1) { problems.push(file + '  ← เจอ <nav class="site-nav"> มากกว่า 1 ที่ ('+navMatches.length+') — ข้ามไฟล์นี้ ต้องตรวจมือก่อน'); return; }

  let next = original.replace(NAV_RE, '<nav class="site-nav">' + NAV.renderNavHTML(file) + '</nav>');

  // เติม <script src="data/nav-template.js"> ก่อน shared.min.js ถ้ายังไม่มี (idempotent)
  if (next.indexOf('data/nav-template.js') === -1) {
    if (SHARED_MIN_RE.test(next)) {
      const tag = navTemplateTagFor(file);
      next = next.replace(SHARED_MIN_RE, function (m) { return tag + '\n' + m; });
      scriptTagAdded++;
    } else {
      problems.push(file + '  ← ไม่พบ <script src="js/core/shared.min.js">  — ไม่ได้เพิ่ม nav-template.js อัตโนมัติ ต้องตรวจมือ');
    }
  }

  // ── แถบประกาศด้านบน (static) — มีอยู่แล้วให้พิมพ์ทับ · ยังไม่มีให้แทรกต่อจาก <body> ──
  const annBlockHTML = NAV.renderAnnBandBlockHTML();
  if (ANN_BLOCK_RE.test(next)) {
    const beforeAnn = next;
    next = next.replace(ANN_BLOCK_RE, annBlockHTML);
    if (next !== beforeAnn) annBandUpdated++;
  } else if (BODY_OPEN_RE.test(next)) {
    next = next.replace(BODY_OPEN_RE, function (m) { return m + '\n' + annBlockHTML; });
    annBandAdded++;
  } else {
    problems.push(file + '  ← ไม่พบ <body> — แทรกแถบประกาศอัตโนมัติไม่ได้ ต้องตรวจมือ');
  }

  // ── แถบล่างมือถือ (static) — มีอยู่แล้วให้พิมพ์ทับ · ยังไม่มีให้แทรกก่อน </body> ──
  const bottomNavHTML = '<nav id="bottom-nav">' + NAV.renderBottomNavHTML() + '</nav>';
  const bnMatches = next.match(new RegExp(BOTTOM_NAV_RE.source, 'g'));
  if (bnMatches && bnMatches.length > 1) {
    problems.push(file + '  ← เจอ <nav id="bottom-nav"> มากกว่า 1 ที่ (' + bnMatches.length + ') — ไม่แตะแถบล่างของไฟล์นี้ ต้องตรวจมือก่อน');
  } else if (bnMatches) {
    const before = next;
    next = next.replace(BOTTOM_NAV_RE, bottomNavHTML);
    if (next !== before) bottomNavUpdated++;
  } else if (BODY_CLOSE_RE.test(next)) {
    next = next.replace(BODY_CLOSE_RE, bottomNavHTML + '\n</body>');
    bottomNavAdded++;
  } else {
    problems.push(file + '  ← ไม่พบ </body> — แทรกแถบล่างมือถืออัตโนมัติไม่ได้ ต้องตรวจมือ');
  }

  if (next !== original) {
    fs.writeFileSync(full, next, 'utf8');
    filesChanged++;
  }
});

console.log('=== generate-nav.js เสร็จแล้ว ===');
console.log('ตรวจทั้งหมด: ' + PAGES.length + ' หน้า');
console.log('แก้ไฟล์จริง: ' + filesChanged + ' หน้า');
console.log('เพิ่ม <script data/nav-template.js>: ' + scriptTagAdded + ' หน้า');
console.log('เพิ่ม <nav id="bottom-nav"> ใหม่: ' + bottomNavAdded + ' หน้า');
console.log('พิมพ์ทับ <nav id="bottom-nav"> เดิม: ' + bottomNavUpdated + ' หน้า');
console.log('เพิ่มแถบประกาศ (ann-band) ใหม่: ' + annBandAdded + ' หน้า');
console.log('พิมพ์ทับแถบประกาศเดิม: ' + annBandUpdated + ' หน้า');

if (skipped.length) {
  console.log('\n⚠️ ข้าม (ไม่พบไฟล์/ไม่พบ nav):');
  skipped.forEach(function (s) { console.log('  - ' + s); });
}
if (problems.length) {
  console.log('\n🔴 ต้องตรวจมือ (โครงสร้างไม่ตรงที่คาด):');
  problems.forEach(function (s) { console.log('  - ' + s); });
  process.exitCode = 1;
}
