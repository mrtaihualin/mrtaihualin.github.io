#!/usr/bin/env node
/**
 * apply-cookie-consent.js
 *
 * เพิ่ม Google Consent Mode v2 (default deny) ให้ GA4 + Clarity
 * และ sync cookie consent banner ภาษาจีน/อังกฤษก่อน </body>
 * ในทุกไฟล์ .html ที่มี snippet GA4 (id=G-DKVQE30982)
 *
 * ใช้ซ้ำได้ในอนาคต — รันซ้ำได้ (idempotent) และอัปเดต banner เดิมให้ตรงต้นฉบับ
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
const BANNER_COMMENT = '<!-- Cookie consent banner (Google Consent Mode v2)';
const BANNER_BLOCK_RE = /<!-- Cookie consent banner \(Google Consent Mode v2\)[\s\S]*?<\/script>/;

// regex จับ gtag('js', new Date()); ทั้งแบบเว้นวรรค และแบบ minify (คนละ quote ก็จับได้)
const GTAG_JS_CALL_RE = /gtag\(\s*(['"])js\1\s*,\s*new Date\(\)\s*\)\s*;/;
const GTAG_JS_LINE_RE = /^([ \t]*)gtag\(\s*(['"])js\2\s*,\s*new Date\(\)\s*\)\s*;[ \t]*$/m;
const GA_CONFIG_CALL_RE = new RegExp(`gtag\\(\\s*(['"])config\\1\\s*,\\s*(['"])${GA_ID}\\2`);
const GA_LOADER_TAG_RE = new RegExp(
  `<script\\s+async\\s+src=(["'])https://www\\.googletagmanager\\.com/gtag/js\\?id=${GA_ID}\\1\\s*><\\/script>`
);
const CONSENT_DEFAULT_BLOCK_RE = /^[ \t]*\/\/ Consent Mode v2[^\n]*\n[ \t]*var savedConsent = localStorage\.getItem\('cookieConsent'\);\n[ \t]*gtag\('consent', 'default', \{ analytics_storage: savedConsent === 'granted' \? 'granted' : 'denied', ad_storage: 'denied' \}\);[ \t]*\n?/m;

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

function buildConsentDefaultSnippet(indent = '  ') {
  return (
    `${indent}// Consent Mode v2 — ปฏิเสธเป็นค่าเริ่มต้นจนกว่าผู้ใช้จะกดยอมรับ (แทรกอัตโนมัติ ` +
    `scripts/apply-cookie-consent.js)\n` +
    `${indent}var savedConsent = localStorage.getItem('cookieConsent');\n` +
    `${indent}gtag('consent', 'default', { analytics_storage: savedConsent === 'granted' ? 'granted' : 'denied', ad_storage: 'denied' });`
  );
}

function normalizeGaBootstrap(content) {
  const loaderMatch = content.match(GA_LOADER_TAG_RE);
  const jsMatch = content.match(GTAG_JS_CALL_RE);
  const configMatch = content.match(GA_CONFIG_CALL_RE);
  if (!loaderMatch || !jsMatch || !configMatch) return null;

  // Consent default must be queued before both gtag('js') and the async loader.
  // Otherwise a cached loader can execute first and create _ga* on a fresh visit.
  let out = content.replace(CONSENT_DEFAULT_BLOCK_RE, '');
  if (GTAG_JS_LINE_RE.test(out)) {
    out = out.replace(GTAG_JS_LINE_RE, (line, indent) =>
      `${buildConsentDefaultSnippet(indent)}\n${indent}gtag('js', new Date());`
    );
  } else {
    out = out.replace(GTAG_JS_CALL_RE, (call) =>
      `\n${buildConsentDefaultSnippet('  ')}\n  ${call}`
    );
  }

  const loaderTag = loaderMatch[0];
  const loaderWithWhitespace = new RegExp(`\\s*${GA_LOADER_TAG_RE.source}\\s*`);
  out = out.replace(loaderWithWhitespace, '\n');
  out = out.replace(/(<!-- Google tag \(gtag\.js\) -->)\s*(<script>)/, '$1\n$2');

  const normalizedConfig = out.match(GA_CONFIG_CALL_RE);
  if (!normalizedConfig) return null;
  const scriptEnd = out.indexOf('</script>', normalizedConfig.index + normalizedConfig[0].length);
  if (scriptEnd < 0) return null;
  const insertAt = scriptEnd + '</script>'.length;
  const beforeLoader = out.slice(0, insertAt).replace(/[ \t]+$/, '');
  const afterLoader = out.slice(insertAt).replace(/^\s*/, '');
  return beforeLoader + `\n${loaderTag}\n` + afterLoader;
}

function buildClaritySnippet() {
  return (
    `\n    // Clarity Consent API v2 — ส่ง stored/default state ทุก page view; ads ไม่เปิดใน Phase 1\n` +
    `    var claritySavedConsent = localStorage.getItem('cookieConsent');\n` +
    `    window.clarity('consentv2', { ad_Storage: 'denied', analytics_Storage: claritySavedConsent === 'granted' ? 'granted' : 'denied' });`
  );
}

function buildClarityLoaderBlock() {
  return `
<!-- Microsoft Clarity — sync โดย scripts/apply-cookie-consent.js -->
<script type="text/javascript">
    (function(c,l,a,r,i,t,y){
        c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
        t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
        y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
    })(window, document, "clarity", "script", "${CLARITY_ID}");${buildClaritySnippet()}
</script>
`;
}

function buildBannerBlock(isEnglish) {
  const fontFamily = isEnglish ? "Arial,sans-serif" : "'Noto Sans TC',sans-serif";
  const dialogLabel = isEnglish ? 'Cookie and analytics settings' : 'Cookie 與分析設定';
  const copy = isEnglish
    ? `🍪 We use <strong>Google Analytics</strong> and <strong>Microsoft Clarity</strong> to improve the website and games.
      Microsoft Clarity uses analytics cookies only after you consent. If you reject, limited cookieless tracking or measurement may still occur under Consent API V2. See our
      <a href="/en/privacy.html" style="color:#8B6310;font-weight:700;text-decoration:underline;">Privacy Policy</a>.`
    : `🍪 我們使用 <strong>Google Analytics</strong> 與 <strong>Microsoft Clarity</strong> 協助改善網站與遊戲體驗。
      Microsoft Clarity 僅在您同意後使用分析 Cookie；若您拒絕，仍可能依 Consent API V2 進行有限的無 Cookie（cookieless）追蹤或衡量。詳見
      <a href="/privacy.html" style="color:#8B6310;font-weight:700;text-decoration:underline;">隱私權政策</a>。`;
  const rejectLabel = isEnglish ? 'Reject' : '拒絕';
  const acceptLabel = isEnglish ? 'Accept' : '接受';
  return `
<!-- Cookie consent banner (Google Consent Mode v2) — แทรกอัตโนมัติโดย scripts/apply-cookie-consent.js ห้ามแก้มือ ให้แก้ที่ต้นฉบับแล้วรันสคริปต์ใหม่ -->
<div id="cookieConsentBanner" role="dialog" aria-label="${dialogLabel}" style="display:none;position:fixed;left:0;right:0;bottom:0;z-index:9999;
  background:#FAF4E8;border-top:2px solid #8B6310;box-shadow:0 -4px 16px rgba(0,0,0,0.12);
  padding:18px 20px;font-family:${fontFamily};">
  <div style="max-width:960px;margin:0 auto;display:flex;flex-wrap:wrap;align-items:center;gap:14px;justify-content:space-between;">
    <p style="margin:0;color:#1C1C1C;font-size:14px;line-height:1.6;flex:1;min-width:240px;">
      ${copy}
    </p>
    <div style="display:flex;gap:10px;flex-wrap:wrap;">
      <button onclick="window.__cookieConsentDecide(false)"
        style="background:#FAF4E8;color:#8B6310;border:1.5px solid #8B6310;border-radius:8px;
        padding:9px 18px;font-weight:700;font-size:14px;cursor:pointer;font-family:${fontFamily};">
        ${rejectLabel}
      </button>
      <button onclick="window.__cookieConsentDecide(true)"
        style="background:linear-gradient(135deg,#C8973A,#8B6310);color:#FAF4E8;border:none;border-radius:8px;
        padding:9px 22px;font-weight:700;font-size:14px;cursor:pointer;white-space:nowrap;font-family:${fontFamily};">
        ${acceptLabel}
      </button>
    </div>
  </div>
</div>
<script>
  window.__clearGaCookies = function() {
    var names = document.cookie.split(';').map(function(part) {
      return part.split('=')[0].trim();
    }).filter(function(name) {
      return name === '_ga' || name.indexOf('_ga_') === 0;
    });
    var hostname = window.location.hostname;
    var domains = [];
    if (hostname && hostname !== 'localhost' && !/^\\d+(?:\\.\\d+){3}$/.test(hostname) && hostname.indexOf(':') === -1) {
      domains.push(hostname);
      var parts = hostname.split('.');
      if (parts.length > 2) domains.push(parts.slice(-2).join('.'));
    }
    names.forEach(function(name) {
      var expired = name + '=;expires=Thu, 01 Jan 1970 00:00:00 GMT;Max-Age=0;path=/';
      document.cookie = expired;
      domains.forEach(function(domain) {
        document.cookie = expired + ';domain=' + domain;
        document.cookie = expired + ';domain=.' + domain;
      });
    });
  };
  window.__clearGaCookiesAfterRevoke = function() {
    window.__clearGaCookies();
    window.setTimeout(window.__clearGaCookies, 0);
    window.setTimeout(window.__clearGaCookies, 100);
    window.setTimeout(window.__clearGaCookies, 1000);
  };
  window.__cookieConsentDecide = function(granted) {
    localStorage.setItem('cookieConsent', granted ? 'granted' : 'denied');
    if (typeof gtag === 'function') {
      gtag('consent', 'update', { analytics_storage: granted ? 'granted' : 'denied' });
    }
    if (!granted) window.__clearGaCookiesAfterRevoke();
    if (typeof window.clarity === 'function') {
      window.clarity('consentv2', { ad_Storage: 'denied', analytics_Storage: granted ? 'granted' : 'denied' });
      if (!granted) window.clarity('consent', false); // erase any cookies from an earlier grant
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
  if (localStorage.getItem('cookieConsent') === 'denied') {
    window.__clearGaCookiesAfterRevoke();
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

  // Vault ใช้ delayed-load gate เฉพาะของตัวเอง ไม่ sync ด้วย standard banner
  if (rel === 'vault.html') {
    return { status: 'already-applied', rel };
  }

  const isEnglish = rel.startsWith(`en${path.sep}`);

  // มี standard banner อยู่แล้ว -> sync copy/runtime ให้ตรง canonical source
  if (content.includes(MARKER)) {
    if (!content.includes(BANNER_COMMENT) || !BANNER_BLOCK_RE.test(content)) {
      return { status: 'skipped', rel, reason: 'มี cookieConsentBanner แต่ไม่ใช่ standard banner ที่รู้จัก' };
    }
    let out = normalizeGaBootstrap(content);
    if (out === null) {
      return { status: 'skipped', rel, reason: 'normalize GA bootstrap ไม่สำเร็จ' };
    }
    if (isEnglish && !out.includes(CLARITY_CLOSE_LITERAL)) {
      const headEnd = out.indexOf('</head>');
      if (headEnd < 0) return { status: 'skipped', rel, reason: 'English page ไม่มี </head> สำหรับ Clarity loader' };
      out = out.slice(0, headEnd) + buildClarityLoaderBlock() + out.slice(headEnd);
    }
    out = out.replace(BANNER_BLOCK_RE, buildBannerBlock(isEnglish).trim());
    if (out === content) return { status: 'already-applied', rel };
    try {
      fs.writeFileSync(filePath, out, 'utf8');
    } catch (e) {
      return { status: 'error', rel, reason: `เขียนไฟล์ไม่ได้: ${e.message}` };
    }
    return { status: 'modified', rel, hasClarity: content.includes(CLARITY_CLOSE_LITERAL) };
  }

  if (!content.includes('</body>')) {
    return { status: 'skipped', rel, reason: 'ไม่มี </body> ในไฟล์' };
  }

  let out = normalizeGaBootstrap(content);
  if (out === null) {
    return { status: 'skipped', rel, reason: 'normalize GA bootstrap ไม่สำเร็จ' };
  }

  // 1) English analytics pages ใช้ Clarity architecture เดียวกับ Chinese
  if (isEnglish && !out.includes(CLARITY_CLOSE_LITERAL)) {
    const headEnd = out.indexOf('</head>');
    if (headEnd < 0) return { status: 'skipped', rel, reason: 'English page ไม่มี </head> สำหรับ Clarity loader' };
    out = out.slice(0, headEnd) + buildClarityLoaderBlock() + out.slice(headEnd);
  } else if (out.includes(CLARITY_CLOSE_LITERAL)) {
    out = out.replace(CLARITY_CLOSE_LITERAL, CLARITY_CLOSE_LITERAL + buildClaritySnippet());
  }

  // 2) แทรก banner ก่อน </body> ตัวสุดท้าย (กันไฟล์ที่มีหลายจุด ป้องกันพลาด)
  const lastBodyIdx = out.lastIndexOf('</body>');
  out = out.slice(0, lastBodyIdx) + buildBannerBlock(isEnglish) + '\n' + out.slice(lastBodyIdx);

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

if (require.main === module) main();

module.exports = { normalizeGaBootstrap };
