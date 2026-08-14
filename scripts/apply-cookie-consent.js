#!/usr/bin/env node
/**
 * apply-cookie-consent.js
 *
 * เพิ่ม Google Consent Mode v2 (default deny) ให้ GA4 + Clarity
 * และแทรก cookie consent banner (接受/拒絕) ก่อน </body>
 * ในทุกไฟล์ .html ที่มี snippet GA4 (id=G-DKVQE30982)
 *
 * ใช้ซ้ำได้ในอนาคต — รันซ้ำได้ (idempotent) ถ้าไฟล์มี banner อยู่แล้วจะข้าม
 *
 * วิธีรัน: node scripts/apply-cookie-consent.js
 * อ้างอิงโค้ดต้นแบบ: /Users/taihualin/Documents/Claude/Backup/PROJECTS_ARCHIVE/HISTORY/2026-08-12_inbox-review-cleared/website/
 *   66_ผลลัพธ์_P6-24_privacy-terms+cookie.md หัวข้อ 4 ตัวเลือกที่ 2
 */

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');

// โฟลเดอร์ที่ห้ามแตะ
const EXCLUDE_DIR_NAMES = new Set([
  'node_modules',
  '_archive',
  '_to_delete',
  'เลิกใช้แล้ว_ห้ามรัน',
  '.git',
  '_dev', // gitignore ล็อกไว้แล้ว + มีไฟล์ backup เก่าที่ไม่ได้ deploy จริง ไม่ต้องแตะ
]);

const GA_ID = 'G-DKVQE30982';
const CLARITY_ID = 'xkbihw56tf';

const MARKER = 'cookieConsentBanner'; // ใช้เช็ค idempotent

// regex จับ gtag('js', new Date()); ทั้งแบบเว้นวรรค และแบบ minify (คนละ quote ก็จับได้)
const GTAG_JS_CALL_RE = /gtag\(\s*(['"])js\1\s*,\s*new Date\(\)\s*\)\s*;/;

// literal บรรทัดปิด IIFE ของ Clarity (คงที่ทุกไฟล์ที่ตรวจแล้ว)
const CLARITY_CLOSE_LITERAL = `})(window, document, "clarity", "script", "${CLARITY_ID}");`;

function walk(dir, out) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (e) {
    return;
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (EXCLUDE_DIR_NAMES.has(entry.name)) continue;
      walk(path.join(dir, entry.name), out);
    } else if (entry.isFile() && entry.name.endsWith('.html')) {
      out.push(path.join(dir, entry.name));
    }
  }
  return out;
}

function buildConsentDefaultSnippet() {
  return (
    `\n  // Consent Mode v2 — ปฏิเสธเป็นค่าเริ่มต้นจนกว่าผู้ใช้จะกดยอมรับ (แทรกอัตโนมัติ ` +
    `scripts/apply-cookie-consent.js)\n` +
    `  var savedConsent = localStorage.getItem('cookieConsent');\n` +
    `  gtag('consent', 'default', { analytics_storage: savedConsent === 'granted' ? 'granted' : 'denied', ad_storage: 'denied' });`
  );
}

function buildClaritySnippet() {
  return (
    `\n    // บอก Clarity ว่ายังไม่ได้รับความยินยอม จนกว่าจะกดยอมรับ (แทรกอัตโนมัติ apply-cookie-consent.js)\n` +
    `    if (localStorage.getItem('cookieConsent') !== 'granted') { window.clarity('consent', false); }`
  );
}

function buildBannerBlock() {
  return `
<!-- Cookie consent banner (Google Consent Mode v2) — แทรกอัตโนมัติโดย scripts/apply-cookie-consent.js ห้ามแก้มือ ให้แก้ที่ต้นฉบับแล้วรันสคริปต์ใหม่ -->
<div id="cookieConsentBanner" style="display:none;position:fixed;left:0;right:0;bottom:0;z-index:9999;
  background:#FAF4E8;border-top:2px solid #8B6310;box-shadow:0 -4px 16px rgba(0,0,0,0.12);
  padding:18px 20px;font-family:'Noto Sans TC',sans-serif;">
  <div style="max-width:960px;margin:0 auto;display:flex;flex-wrap:wrap;align-items:center;gap:14px;justify-content:space-between;">
    <p style="margin:0;color:#1C1C1C;font-size:14px;line-height:1.6;flex:1;min-width:240px;">
      🍪 我們使用 <strong>Google Analytics</strong> 與 <strong>Microsoft Clarity</strong> 蒐集匿名使用行為資料，
      協助改善網站與遊戲體驗。您可以選擇是否同意。詳見
      <a href="/privacy.html" style="color:#8B6310;font-weight:700;text-decoration:underline;">隱私權政策</a>。
    </p>
    <div style="display:flex;gap:10px;flex-wrap:wrap;">
      <button onclick="window.__cookieConsentDecide(false)"
        style="background:#FAF4E8;color:#8B6310;border:1.5px solid #8B6310;border-radius:8px;
        padding:9px 18px;font-weight:700;font-size:14px;cursor:pointer;font-family:'Noto Sans TC',sans-serif;">
        拒絕
      </button>
      <button onclick="window.__cookieConsentDecide(true)"
        style="background:linear-gradient(135deg,#C8973A,#8B6310);color:#FAF4E8;border:none;border-radius:8px;
        padding:9px 22px;font-weight:700;font-size:14px;cursor:pointer;white-space:nowrap;font-family:'Noto Sans TC',sans-serif;">
        接受
      </button>
    </div>
  </div>
</div>
<script>
  window.__cookieConsentDecide = function(granted) {
    localStorage.setItem('cookieConsent', granted ? 'granted' : 'denied');
    if (typeof gtag === 'function') {
      gtag('consent', 'update', { analytics_storage: granted ? 'granted' : 'denied' });
    }
    if (typeof window.clarity === 'function') {
      window.clarity('consent', granted);
    }
    var __b = document.getElementById('cookieConsentBanner');
    if (__b) __b.style.display = 'none';
  };
  // เปิด banner ขึ้นมาใหม่ได้ทุกเมื่อ (ใช้จากลิงก์ "Cookie 設定" ใน privacy.html)
  window.__reopenCookieConsent = function() {
    var __b = document.getElementById('cookieConsentBanner');
    if (__b) __b.style.display = 'block';
  };
  if (!localStorage.getItem('cookieConsent')) {
    var __b0 = document.getElementById('cookieConsentBanner');
    if (__b0) __b0.style.display = 'block';
  }
</script>
`;
}

function processFile(filePath) {
  const rel = path.relative(REPO_ROOT, filePath);
  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch (e) {
    return { status: 'error', rel, reason: `อ่านไฟล์ไม่ได้: ${e.message}` };
  }

  // ไม่ใช่ไฟล์ที่มี GA4 snippet ของเรา -> ข้ามเงียบๆ (ไม่นับเป็น skip ที่ต้องรายงาน)
  if (!content.includes(GA_ID)) {
    return { status: 'not-applicable', rel };
  }

  // idempotent: มี banner อยู่แล้ว -> ข้าม
  if (content.includes(MARKER)) {
    return { status: 'already-applied', rel };
  }

  if (!content.includes('</body>')) {
    return { status: 'skipped', rel, reason: 'ไม่มี </body> ในไฟล์' };
  }

  const gaMatch = content.match(GTAG_JS_CALL_RE);
  if (!gaMatch) {
    return { status: 'skipped', rel, reason: 'หา gtag(\'js\', new Date()); ไม่เจอ (โครงสร้างต่างจากที่คาด)' };
  }

  let out = content;

  // 1) แทรก consent default หลัง gtag('js', new Date());
  out = out.replace(GTAG_JS_CALL_RE, (m) => m + buildConsentDefaultSnippet());

  // 2) แทรกด่าน consent ให้ Clarity ถ้าไฟล์นี้มี Clarity snippet
  if (out.includes(CLARITY_CLOSE_LITERAL)) {
    out = out.replace(CLARITY_CLOSE_LITERAL, CLARITY_CLOSE_LITERAL + buildClaritySnippet());
  }

  // 3) แทรก banner ก่อน </body> ตัวสุดท้าย (กันไฟล์ที่มีหลายจุด ป้องกันพลาด)
  const lastBodyIdx = out.lastIndexOf('</body>');
  out = out.slice(0, lastBodyIdx) + buildBannerBlock() + '\n' + out.slice(lastBodyIdx);

  try {
    fs.writeFileSync(filePath, out, 'utf8');
  } catch (e) {
    return { status: 'error', rel, reason: `เขียนไฟล์ไม่ได้: ${e.message}` };
  }

  return { status: 'modified', rel, hasClarity: content.includes(CLARITY_CLOSE_LITERAL) };
}

function main() {
  const allFiles = walk(REPO_ROOT, []);
  const results = { modified: [], alreadyApplied: [], skipped: [], errors: [] };

  for (const f of allFiles) {
    const r = processFile(f);
    if (r.status === 'modified') results.modified.push(r);
    else if (r.status === 'already-applied') results.alreadyApplied.push(r);
    else if (r.status === 'skipped') results.skipped.push(r);
    else if (r.status === 'error') results.errors.push(r);
    // 'not-applicable' ไม่ต้อง log (ไฟล์ที่ไม่มี GA4 เลย)
  }

  console.log(`=== ผลลัพธ์ apply-cookie-consent.js ===`);
  console.log(`แก้แล้ว: ${results.modified.length} ไฟล์`);
  results.modified.forEach((r) => console.log(`  [MODIFIED] ${r.rel}${r.hasClarity ? '' : ' (ไม่มี Clarity)'}`));
  console.log(`มีอยู่แล้ว (ข้าม idempotent): ${results.alreadyApplied.length} ไฟล์`);
  results.alreadyApplied.forEach((r) => console.log(`  [SKIP-ALREADY] ${r.rel}`));
  console.log(`ข้าม (โครงสร้างไม่ตรงที่คาด): ${results.skipped.length} ไฟล์`);
  results.skipped.forEach((r) => console.log(`  [SKIP] ${r.rel} — ${r.reason}`));
  console.log(`error: ${results.errors.length} ไฟล์`);
  results.errors.forEach((r) => console.log(`  [ERROR] ${r.rel} — ${r.reason}`));
}

main();
