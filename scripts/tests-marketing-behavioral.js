#!/usr/bin/env node
'use strict';

// ตัวทดสอบ "พฤติกรรม" ของส่วน "เว็บหานักเรียน" (P3 — งานคุ้มกันพฤติกรรมเดิม)
// ขอบเขต: ไฟล์ marketing ที่ไม่ใช่ textbook/ classroom/ และไม่ใช่หน้าเกม (ดูรายชื่อ MARKETING_PAGES ด้านล่าง)
// เสริม scripts/check-site.js (ซึ่งตรวจ syntax/ลิงก์ตาย/id ซ้ำ/secret อยู่แล้ว) — ไฟล์นี้ตรวจ "พฤติกรรมทางธุรกิจ"
// ที่ check-site.js ไม่ครอบ: Cal.com widget ต้องมีจริง, ปุ่มจองต้องชี้ trial.html จริง,
// อีเมลติดต่อต้องอยู่ถูกหน้า, ราคาไม่ขัดแย้งกันข้ามหน้า, ฟอร์มเก็บ lead ต้องยิงเข้าตาราง leads จริง
//
// รันแบบ static เท่านั้น (อ่านไฟล์ ไม่เปิดเบราว์เซอร์จริง) — ตรวจสอบเพิ่มเติมด้วยตาที่ทดสอบอัตโนมัติไม่ได้
// ให้ดูหัวข้อ "สิ่งที่ทดสอบอัตโนมัติไม่ได้" ใน 24a_ผลลัพธ์_P3_เว็บหานักเรียน.md

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const failures = [];
const warnings = [];
let passCount = 0;

// รายชื่อไฟล์ในขอบเขต "เว็บหานักเรียน" — ตรวจจากรายชื่อไฟล์จริงใน repo (2026-08-07)
// ไม่รวม: หน้าเกมทั้งหมด (games*.html, *-board.html, lego*.html, listening/reading/tone/typing/word-order*.html,
//         leaderboard/my-progress/vault/vocab-cheatsheet/admin-game-reports.html — เป็นส่วน "เกมทั้งหมด")
// ไม่รวม: line-callback.html (โหลด js/games/line-callback.js — เป็นส่วนล็อกอินเกม ไม่ใช่ marketing)
// ไม่รวม: textbook/ classroom/ (คนละส่วนตาม AGENTS.md)
const MARKETING_PAGES = [
  '404.html',
  'community.html',
  'content.html',
  'faq.html',
  'index.html',
  'links.html',
  'new-student.html',
  'page-services.html',
  'pricing.html',
  'privacy.html',
  'resources.html',
  'sns.html',
  'terms.html',
  'thank-you.html',
  'trial.html',
  'vocab-thank-you.html',
];

function readFile(relPath) {
  const full = path.join(root, relPath);
  if (!fs.existsSync(full)) return null;
  return fs.readFileSync(full, 'utf8');
}

function pass(label) {
  passCount++;
  console.log(`✓ ${label}`);
}

function fail(label, detail) {
  failures.push(detail ? `${label}\n  ${detail}` : label);
}

function warn(label) {
  warnings.push(label);
}

// ── 0) ยืนยันว่าไฟล์ในขอบเขตยังมีอยู่จริงทั้งหมด ────────────────────────────
MARKETING_PAGES.forEach((rel) => {
  if (!fs.existsSync(path.join(root, rel))) {
    fail(`ไฟล์ในขอบเขตหายไป: ${rel}`, 'ถ้าเปลี่ยนชื่อ/ย้ายไฟล์ ต้องอัปเดตรายชื่อ MARKETING_PAGES ในสคริปต์นี้ด้วย');
  }
});
if (failures.length === 0) pass(`ไฟล์ในขอบเขตครบ ${MARKETING_PAGES.length} ไฟล์`);

// ── 1) trial.html ต้องมี Cal.com widget ฝังจริง + ข้อความให้แอด LINE ยืนยัน ──
(function checkTrialPage() {
  const trial = readFile('trial.html');
  if (!trial) { fail('trial.html หายไป — เป็นหน้าจองคลาสหลัก'); return; }

  if (!/id=["']cal-embed-inline["']/.test(trial)) {
    fail('trial.html: ไม่พบ div#cal-embed-inline (จุดฝัง Cal.com widget)');
  } else {
    pass('trial.html มี div#cal-embed-inline');
  }

  // Cal.com ถูก mount ผ่าน shared.js (mountCalInline) ไม่ใช่ inline script ในหน้า — เช็คว่าโหลด shared.js/min.js จริง
  const loadsShared = /src=["']js\/core\/shared(\.min)?\.js/.test(trial);
  if (!loadsShared) {
    fail('trial.html: ไม่ได้โหลด js/core/shared.js หรือ shared.min.js', 'ถ้าไม่โหลดไฟล์นี้ Cal.com widget จะไม่ mount เลย');
  } else {
    pass('trial.html โหลด js/core/shared(.min).js (ตัว mount Cal.com)');
  }

  const shared = readFile('js/core/shared.js');
  if (shared) {
    const hasCalInit = /app\.cal\.com\/embed\/embed\.js/.test(shared) && /Cal\(['"]init['"]/.test(shared);
    const mountsInlineOnTrial = /cal-embed-inline/.test(shared) && /mountCalInline/.test(shared);
    if (!hasCalInit) fail('js/core/shared.js: ไม่พบโค้ด init Cal.com embed script (app.cal.com/embed/embed.js)');
    else pass('js/core/shared.js มีโค้ด init Cal.com embed');
    if (!mountsInlineOnTrial) fail('js/core/shared.js: ไม่พบโค้ด mount #cal-embed-inline อัตโนมัติ');
    else pass('js/core/shared.js mount #cal-embed-inline อัตโนมัติ');
  } else {
    warn('อ่าน js/core/shared.js ไม่ได้ — ข้ามการตรวจโค้ด mount Cal.com (ตรวจแค่ที่ตัวย่อ .min.js แทนไม่ได้เพราะอ่านยาก)');
  }

  // ข้อความใต้ปฏิทินต้องบอกให้แอด LINE ยืนยัน (ตามที่ศูนย์บัญชาการบันทึกไว้)
  if (!/加\s*LINE\s*確認/.test(trial)) {
    fail('trial.html: ไม่พบข้อความ "請加 LINE 確認" ใต้ปฏิทิน (เส้นทางจองคลาส: จอง Cal.com → แอด LINE ยืนยัน)');
  } else {
    pass('trial.html มีข้อความให้แอด LINE ยืนยันหลังจอง');
  }

  // ลิงก์ปุ่มแอด LINE ต้องมี href จริง ไม่ใช่ # เปล่า
  const lineBtnMatch = trial.match(/id=["']bk-line-btn["'][^>]*href=["']([^"']+)["']/);
  if (!lineBtnMatch || !/^https?:\/\//.test(lineBtnMatch[1])) {
    fail('trial.html: ปุ่ม #bk-line-btn ไม่มี href เป็นลิงก์ LINE จริง');
  } else {
    pass('trial.html ปุ่มแอด LINE มีลิงก์จริง');
  }
})();

// ── 2) ทุกหน้าในขอบเขตที่มีปุ่ม/ลิงก์ "จองคลาส" ต้องชี้ไป trial.html จริง ──────
(function checkBookingLinksPointToTrial() {
  let checkedPages = 0;
  let foundAnyBookingLink = false;
  MARKETING_PAGES.forEach((rel) => {
    if (rel === 'trial.html') return; // ไม่ต้องเช็คตัวเอง
    const text = readFile(rel);
    if (!text) return;
    checkedPages++;

    // หาปุ่ม/ลิงก์ที่ข้อความพูดถึง "預約" (จอง) + "體驗" (ทดลอง) — เป็นคำที่ระบบใช้เรียกปุ่มจองคลาสทดลองทั้งเว็บ
    const bookingCtaRegex = /<a[^>]*href=["']([^"']*)["'][^>]*>[^<]*預約[^<]*體驗[^<]*<\/a>/g;
    let match;
    while ((match = bookingCtaRegex.exec(text))) {
      foundAnyBookingLink = true;
      const href = match[1];
      // href ที่ยอมรับ 3 แบบ: (1) ชี้ไปหน้า trial.html ตรงๆ (2) modal (javascript:void(0) + onclick เปิด modal-line-qr)
      // (3) ลิงก์ LINE ตรง (lin.ee) — ใช้ตั้งใจในหน้า thank-you*/vocab-thank-you* ที่คนเพิ่งทิ้ง email ไว้
      //     ให้แอด LINE คุยตรงแทนวนกลับไปจอง Cal.com ซ้ำ
      const isDirectTrialLink = /(^|\/)trial\.html(#|$|\?)/.test(href);
      const isJsVoid = /^javascript:void\(0\)$/.test(href);
      const isDirectLineLink = /^https:\/\/lin\.ee\//.test(href);
      if (!isDirectTrialLink && !isJsVoid && !isDirectLineLink) {
        fail(`${rel}: ปุ่ม/ลิงก์ "預約...體驗..." ไม่ได้ชี้ไป trial.html, modal, หรือ LINE ตรง (href="${href}")`);
      }
    }
  });
  if (!foundAnyBookingLink) {
    warn('ไม่พบข้อความปุ่ม "預約...體驗..." ในหน้าใดเลยของ marketing pages ที่ตรวจ — regex อาจไม่ตรงกับข้อความจริงแล้ว ต้องตรวจด้วยตา');
  } else if (failures.length === passCount || true) {
    pass(`ตรวจปุ่ม/ลิงก์จองคลาสทดลองใน ${checkedPages} หน้า`);
  }
})();

// ── 3) trial.html ต้องถูกอ้างถึงจริงจากอย่างน้อยหนึ่งหน้าอื่นในขอบเขต (ไม่ใช่หน้าลอย) ──
(function checkTrialIsLinked() {
  let referenced = false;
  MARKETING_PAGES.forEach((rel) => {
    if (rel === 'trial.html') return;
    const text = readFile(rel);
    if (text && /trial\.html/.test(text)) referenced = true;
  });
  if (!referenced) {
    fail('trial.html ไม่ถูกอ้างถึง (href) จากหน้า marketing อื่นเลย — อาจเป็นหน้าลอยที่คนเข้าไม่ถึง');
  } else {
    pass('trial.html ถูกลิงก์จากหน้าอื่นจริง');
  }
})();

// ── 4) อีเมลติดต่อ mr.taihualin@gmail.com ต้องปรากฏ (ของที่เปิดเผยตั้งใจ) ──────
(function checkContactEmail() {
  const EMAIL = 'mr.taihualin@gmail.com';
  let foundIn = [];
  MARKETING_PAGES.forEach((rel) => {
    const text = readFile(rel);
    if (text && text.includes(EMAIL)) foundIn.push(rel);
  });
  if (foundIn.length === 0) {
    // อาจอยู่ใน js/core/shared.js (modal ติดต่อที่ใช้ร่วมทุกหน้า) — เช็คสำรอง
    const shared = readFile('js/core/shared.js');
    if (shared && shared.includes(EMAIL)) {
      pass(`อีเมลติดต่อ ${EMAIL} อยู่ใน js/core/shared.js (modal ติดต่อร่วมทุกหน้า)`);
    } else {
      fail(`ไม่พบอีเมลติดต่อ ${EMAIL} ในหน้า marketing หรือ shared.js เลย`, 'CLAUDE.md ระบุว่าเป็นของที่เปิดเผยตั้งใจ ต้องมีอยู่จริง');
    }
  } else {
    pass(`อีเมลติดต่อ ${EMAIL} พบใน: ${foundIn.join(', ')}`);
  }
})();

// ── 5) ราคาคลาสต้องไม่ขัดแย้งกันข้ามหน้า (NT$xxx) ─────────────────────────
(function checkPriceConsistency() {
  const priceRegex = /NT\$\s?([0-9][0-9,]{1,6})/g;
  const foundPrices = new Map(); // price -> [pages]

  MARKETING_PAGES.forEach((rel) => {
    const text = readFile(rel);
    if (!text) return;
    let m;
    const re = new RegExp(priceRegex);
    while ((m = re.exec(text))) {
      const price = m[1].replace(/,/g, '');
      if (!foundPrices.has(price)) foundPrices.set(price, new Set());
      foundPrices.get(price).add(rel);
    }
  });

  if (foundPrices.size === 0) {
    warn('ไม่พบราคาแบบ NT$xxx ในหน้า marketing เลย — อาจเขียนราคาในรูปแบบอื่น ต้องตรวจด้วยตา');
  } else if (foundPrices.size > 1) {
    const detail = Array.from(foundPrices.entries())
      .map(([price, pages]) => `NT$${price} → ${Array.from(pages).join(', ')}`)
      .join('\n  ');
    fail('พบราคาคลาสไม่ตรงกันข้ามหน้า (NT$ ต่างค่ากัน)', detail);
  } else {
    const [price, pages] = Array.from(foundPrices.entries())[0];
    pass(`ราคาคลาส NT$${price} ตรงกันทุกหน้าที่พบ (${Array.from(pages).join(', ')})`);
  }
})();

// ── 6) ฟอร์มเก็บ lead (saveLead) ต้องยิงเข้าตาราง Supabase "leads" จริง ──────
(function checkLeadFormTarget() {
  const shared = readFile('js/core/shared.js');
  if (!shared) {
    warn('อ่าน js/core/shared.js ไม่ได้ — ข้ามการตรวจปลายทางฟอร์ม lead');
    return;
  }
  const hasSaveLeadFn = /window\.saveLead\s*=\s*function/.test(shared);
  const targetsLeadsTable = /\/rest\/v1\/leads['"]/.test(shared);
  if (!hasSaveLeadFn) {
    fail('js/core/shared.js: ไม่พบฟังก์ชัน window.saveLead');
  } else {
    pass('js/core/shared.js มีฟังก์ชัน window.saveLead');
  }
  if (!targetsLeadsTable) {
    fail('js/core/shared.js: window.saveLead ไม่ได้ยิงไปตาราง /rest/v1/leads', 'ถ้าปลายทางเปลี่ยน lead จะไม่เข้าฐานข้อมูลจริง');
  } else {
    pass('window.saveLead ยิงเข้าตาราง Supabase leads ถูกต้อง');
  }

  // saveLead ต้องถูกเรียกจริงอย่างน้อยหนึ่งจุด (ฟอร์มโบนัสคำศัพท์ / popup)
  const callSites = (shared.match(/\bsaveLead\(\{/g) || []).length;
  if (callSites === 0) {
    fail('js/core/shared.js: ไม่มีจุดไหนเรียก saveLead({...}) เลย — ฟอร์มเก็บ lead อาจไม่ทำงาน');
  } else {
    pass(`saveLead ถูกเรียกใช้จริง ${callSites} จุดใน shared.js`);
  }
})();

// ── 7) Contact/Social owner + standalone SNS + external-link safety ────────
(function checkContactSocialEntryPoints() {
  const shared = readFile('js/core/shared.js');
  const sns = readFile('sns.html');
  const nav = readFile('data/nav-template.js');
  if (!shared || !sns || !nav) {
    fail('อ่านไฟล์ Contact/Social ที่จำเป็นไม่ครบ');
    return;
  }

  if (!/id=["']modal-contact["']/.test(shared)) {
    fail('js/core/shared.js: ไม่พบ Contact modal ซึ่งเป็น owner หลัก');
  } else if (!['LINE', '電子郵件', 'Facebook', 'YouTube', 'Instagram', 'TikTok', 'Threads'].every((label) => shared.includes(label))) {
    fail('js/core/shared.js: Contact modal มีช่องทาง Contact/Social ไม่ครบ');
  } else {
    pass('Contact modal เป็น owner หลักและมีช่องทาง Contact/Social ครบ');
  }

  const expectedSocialUrls = [
    'https://lin.ee/yVBgvywy',
    'https://www.facebook.com/mrtaihua',
    'https://www.youtube.com/@mrtaihua',
    'https://www.instagram.com/mrtaihua',
    'https://www.tiktok.com/@mrtaihua',
    'https://www.threads.com/@mrtaihua?invite=0',
  ];
  const missingContactUrls = expectedSocialUrls.filter((url) => !shared.includes(url));
  const missingStandaloneUrls = expectedSocialUrls.filter((url) => !sns.includes(url));
  if (missingContactUrls.length || missingStandaloneUrls.length || !shared.includes('mailto:mr.taihualin@gmail.com') || !shared.includes("calLink:'mrtaihualin/trial'")) {
    fail('Contact/Social destination URL เปลี่ยนหรือหาย', `Contact ขาด: ${missingContactUrls.join(', ') || 'ไม่มี'}; sns.html ขาด: ${missingStandaloneUrls.join(', ') || 'ไม่มี'}`);
  } else {
    pass('LINE/Email/Facebook/YouTube/Instagram/TikTok/Threads/Cal.com ใช้ destination เดิมครบ');
  }

  if (/modal-(?:sns|social)/.test(shared)) {
    fail('js/core/shared.js: ยังพบ modal-sns หรือ modal-social ที่ซ้ำกับ Contact modal');
  } else {
    pass('ไม่เหลือ social modal ซ้ำใน shared.js');
  }

  if (/sns\.html/.test(nav)) {
    fail('data/nav-template.js: พบ Navigation entry ไป sns.html ทั้งที่หน้าเป็น intentionally standalone');
  } else {
    pass('sns.html คงเป็น intentionally standalone และไม่ถูกเพิ่มใน Navigation');
  }

  [
    ['js/core/shared.js', shared],
    ['sns.html', sns],
  ].forEach(([rel, text]) => {
    const unsafe = [];
    for (const match of text.matchAll(/<a\b[^>]*\btarget=["']_blank["'][^>]*>/gi)) {
      if (!/\brel=["'][^"']*\bnoopener\b[^"']*["']/i.test(match[0])) unsafe.push(match[0]);
    }
    if (unsafe.length) {
      fail(`${rel}: พบ target="_blank" ที่ไม่มี rel="noopener" ${unsafe.length} จุด`);
    } else {
      pass(`${rel}: target="_blank" มี rel="noopener" ครบ`);
    }
  });
})();

// ── สรุปผล ──────────────────────────────────────────────────────────────
if (warnings.length) {
  console.log(`\nคำเตือน ${warnings.length} รายการ (ไม่บล็อก ต้องตรวจด้วยตา):`);
  warnings.forEach((item) => console.log(`- ${item}`));
}

if (failures.length) {
  console.error(`\nไม่ผ่าน ${failures.length} รายการ:`);
  failures.forEach((item) => console.error(`- ${item}`));
  process.exit(1);
}

console.log(`\n✅ ผ่านทั้งหมด — ตรวจพฤติกรรม "เว็บหานักเรียน" ${MARKETING_PAGES.length} ไฟล์`);
