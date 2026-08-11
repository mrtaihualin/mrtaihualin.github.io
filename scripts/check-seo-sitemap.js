#!/usr/bin/env node
'use strict';
/**
 * scripts/check-seo-sitemap.js — ตรวจ SEO metadata + sitemap ให้ตรงกับไฟล์จริง (2026-08-11)
 * ────────────────────────────────────────────────────────────────────────────
 * ทำไมต้องมี: ก่อนหน้านี้ไม่มีใครตรวจ sitemap.xml เทียบกับไฟล์จริงเลย ต้องไล่ดูเองด้วยตา
 * ทุกครั้งที่เพิ่มหน้าใหม่ → หน้าใหม่หลุดจาก sitemap เงียบๆ (Google ไม่เห็น) หรือ sitemap
 * ชี้ไปไฟล์ที่ถูกลบไปแล้ว (Google เจอ 404) โดยไม่มีอะไรฟ้อง
 *
 * 🔑 หลักสำคัญ: **ตรวจ SEO เฉพาะหน้า "สาธารณะ + ให้ Google เก็บ" เท่านั้น**
 *    หน้า noindex / ห้องเรียนครู / เครื่องมือ dev ไม่ต้องมี description/canonical
 *    และ "ห้าม" ถูกนับรวมในตัวเลข SEO (ไม่งั้นตัวเลขจะหลอกตัวเอง)
 *
 * การจัดกลุ่มหน้า (ดูฟังก์ชัน classify) อ้างจากของจริงในไฟล์ ไม่ได้เดา:
 *   A. public+indexable — ไม่มี meta robots noindex และไม่ได้อยู่ในโฟลเดอร์ภายใน  → ตรวจ SEO เต็ม
 *   B. public แต่ noindex  — มี <meta name="robots" content="noindex...">          → ตรวจแค่ว่าต้องไม่อยู่ใน sitemap
 *   C. auth/callback       — line-callback.html                                     → เหมือน B
 *   D. admin/teacher       — classroom/**, admin-*.html                             → เหมือน B
 *   E. test/dev            — data/**, _dev/**, _staging-build/**                    → ข้ามทั้งหมด
 *
 * ระดับความรุนแรง (ตั้งใจแบ่ง — ห้ามทำให้ทุกอย่างเป็น ERROR รวดเดียว):
 *   ERROR   = พังจริง/อันตรายจริง เช่น sitemap ชี้ไปไฟล์ที่ไม่มี, หน้า admin หลุดเข้า sitemap
 *   WARNING = ควรแก้แต่ไม่ได้พัง เช่น หน้าสาธารณะขาด meta description
 *   INFO    = แค่บอกให้รู้
 *
 * รันเดี่ยว:  node scripts/check-seo-sitemap.js
 *            node scripts/check-seo-sitemap.js --full   (โชว์ทุกรายการ ไม่ตัดที่ 15 บรรทัด)
 * ออกโค้ด 1 เฉพาะเมื่อมี ERROR (WARNING ไม่บล็อก — กันไม่ให้หนี้เก่าบล็อกทั้งเว็บ)
 */

const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const root = path.resolve(__dirname, '..');
const SITE = 'https://mrtaihualin.com';
const showFull = process.argv.includes('--full');

const errors = [];
const warns = [];
const infos = [];

// ── รายชื่อไฟล์ HTML ที่ git ติดตามจริง (ใช้ -z กัน path ภาษาจีน/ไทยถูก quote จนพัง) ──
function trackedHtml() {
  const out = cp.execFileSync('git', ['ls-files', '-z', '*.html'], { cwd: root, encoding: 'buffer' });
  return out.toString('utf8').split('\0').filter(Boolean);
}

const SKIP_DIRS = ['_staging-build/', '_staging-build-verify/', '_archive/', '_dev/', '_to_delete/', 'data/'];

function classify(rel, html) {
  if (SKIP_DIRS.some((d) => rel.startsWith(d))) return 'E-dev';
  if (rel.startsWith('classroom/') || /^admin-/.test(rel)) return 'D-admin';
  if (rel === 'line-callback.html') return 'C-auth';
  const robots = html.match(/<meta[^>]+name=["']robots["'][^>]*content=["']([^"']+)["']/i);
  if (robots && /noindex/i.test(robots[1])) return 'B-noindex';
  return 'A-public';
}

const pages = new Map(); // rel -> { cat, html }
for (const rel of trackedHtml()) {
  const abs = path.join(root, rel);
  if (!fs.existsSync(abs)) continue;
  const html = fs.readFileSync(abs, 'utf8');
  pages.set(rel, { cat: classify(rel, html), html });
}

const publicPages = [...pages.entries()].filter(([, v]) => v.cat === 'A-public').map(([k]) => k);

// ════════════════════════════════════════════════════════════════════════════
// 1) SEO metadata — เฉพาะหน้า public+indexable
// ════════════════════════════════════════════════════════════════════════════
function head(html) {
  const m = html.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i);
  return m ? m[1] : html.slice(0, 8000);
}

const canonicalOf = new Map();

for (const rel of publicPages) {
  const html = pages.get(rel).html;
  const h = head(html);

  const title = h.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!title || !title[1].trim()) warns.push(`${rel}: ไม่มี <title> (หรือว่างเปล่า)`);

  const desc = h.match(/<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)["']/i);
  if (!desc || !desc[1].trim()) warns.push(`${rel}: ไม่มี meta description`);

  const canon = h.match(/<link[^>]+rel=["']canonical["'][^>]*href=["']([^"']+)["']/i);
  if (!canon) {
    warns.push(`${rel}: ไม่มี <link rel="canonical">`);
  } else {
    canonicalOf.set(rel, canon[1].trim());
    // canonical ต้องชี้กลับมาที่หน้าตัวเอง (ถ้าไม่ใช่ = ตั้งใจรวมหน้า ต้องรู้ตัว)
    const expect = SITE + '/' + rel;
    if (canon[1].trim() !== expect && canon[1].trim() !== expect.replace(/\/index\.html$/, '/')) {
      infos.push(`${rel}: canonical ชี้ไป ${canon[1].trim()} (ไม่ใช่ตัวเอง — ตั้งใจหรือเปล่า?)`);
    }
  }

  const langM = html.match(/<html[^>]*\blang=["']([^"']+)["']/i);
  if (!langM) warns.push(`${rel}: <html> ไม่มี lang`);

  if (!/<meta[^>]+name=["']viewport["']/i.test(h)) warns.push(`${rel}: ไม่มี meta viewport`);

  if (!/<meta[^>]+property=["']og:title["']/i.test(h)) warns.push(`${rel}: ไม่มี og:title`);
  if (!/<meta[^>]+property=["']og:description["']/i.test(h)) warns.push(`${rel}: ไม่มี og:description`);
}

// ════════════════════════════════════════════════════════════════════════════
// 2) sitemap.xml เทียบกับไฟล์จริง
// ════════════════════════════════════════════════════════════════════════════
const sitemapPath = path.join(root, 'sitemap.xml');
if (!fs.existsSync(sitemapPath)) {
  errors.push('ไม่มีไฟล์ sitemap.xml');
} else {
  const xml = fs.readFileSync(sitemapPath, 'utf8');
  const locs = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1]);

  const seen = new Set();
  const inSitemap = new Set();

  for (const loc of locs) {
    if (seen.has(loc)) errors.push(`sitemap: URL ซ้ำ — ${loc}`);
    seen.add(loc);

    if (!loc.startsWith(SITE + '/')) {
      errors.push(`sitemap: URL ไม่ได้อยู่บนโดเมนหลัก — ${loc}`);
      continue;
    }
    let rel = loc.slice(SITE.length + 1);
    if (rel === '' || rel.endsWith('/')) rel += 'index.html';
    inSitemap.add(rel);

    // 7) sitemap ชี้ไปไฟล์ที่ไม่มีจริง = Google เจอ 404
    if (!fs.existsSync(path.join(root, rel))) {
      errors.push(`sitemap: ชี้ไปไฟล์ที่ไม่มีจริง — ${loc}`);
      continue;
    }
    // 15) หน้า noindex / admin / dev ห้ามหลุดเข้า sitemap (ขัดกันเอง + เสี่ยงเปิดเผยหน้าภายใน)
    const info = pages.get(rel);
    if (info && info.cat !== 'A-public') {
      errors.push(`sitemap: มีหน้าที่ไม่ควรอยู่ (${info.cat}) — ${loc}`);
    }
    // 9) canonical ของหน้านั้นต้องตรงกับ URL ใน sitemap
    const canon = canonicalOf.get(rel);
    if (canon && canon !== loc) {
      warns.push(`sitemap: canonical ของ ${rel} = ${canon} แต่ sitemap เขียน ${loc}`);
    }
  }

  // 8) หน้า public+indexable ที่ไม่มีใน sitemap = Google อาจไม่เจอเลย
  for (const rel of publicPages) {
    if (!inSitemap.has(rel)) warns.push(`sitemap: หน้าสาธารณะยังไม่อยู่ใน sitemap — ${rel}`);
  }

  // lastmod: ตรวจว่าไม่ใช่วันในอนาคต และมีรูปแบบถูก (ไม่ตรวจว่า "ตรงกับ git" เพราะ
  // lastmod ที่ดีคือ "เนื้อหาเปลี่ยนจริง" ซึ่ง git commit date ไม่ได้แปลว่าเนื้อหาเปลี่ยนเสมอไป)
  const today = new Date().toISOString().slice(0, 10);
  for (const m of xml.matchAll(/<lastmod>\s*([^<\s]+)\s*<\/lastmod>/gi)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(m[1])) errors.push(`sitemap: lastmod รูปแบบผิด — ${m[1]}`);
    else if (m[1] > today) errors.push(`sitemap: lastmod เป็นวันในอนาคต — ${m[1]}`);
  }

  infos.push(`sitemap มี ${locs.length} URL · หน้าสาธารณะที่ควรอยู่ ${publicPages.length} หน้า`);
}

// ════════════════════════════════════════════════════════════════════════════
function dump(list, label, mark) {
  if (!list.length) return;
  console.log(`\n${mark} ${label} ${list.length} รายการ:`);
  const show = showFull ? list : list.slice(0, 15);
  show.forEach((x) => console.log('  - ' + x));
  if (!showFull && list.length > show.length) {
    console.log(`  … อีก ${list.length - show.length} รายการ (ดูครบด้วย --full)`);
  }
}

const counts = { 'A-public': 0, 'B-noindex': 0, 'C-auth': 0, 'D-admin': 0, 'E-dev': 0 };
for (const [, v] of pages) counts[v.cat]++;
console.log('SEO/sitemap check — จำนวนหน้าแยกตามกลุ่ม:');
console.log(`  A สาธารณะ+ให้ Google เก็บ = ${counts['A-public']}  (เฉพาะกลุ่มนี้ที่ตรวจ SEO)`);
console.log(`  B noindex = ${counts['B-noindex']} · C auth = ${counts['C-auth']} · D admin = ${counts['D-admin']} · E dev = ${counts['E-dev']}`);

dump(errors, 'ERROR', '❌');
dump(warns, 'WARNING', '⚠️');
if (showFull) dump(infos, 'INFO', 'ℹ️');

console.log('');
if (errors.length) {
  console.log(`❌ seo/sitemap: มี ERROR ${errors.length} รายการ`);
  process.exit(1);
}
console.log(`✅ seo/sitemap: ไม่มี ERROR (WARNING ${warns.length} รายการ — ไม่บล็อก)`);
