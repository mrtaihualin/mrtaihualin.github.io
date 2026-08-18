#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const vm = require('vm');
const { formatFinding, listRepositoryFiles, scanProject } = require('./secret-scanner');

const root = path.resolve(__dirname, '..');
const failures = [];
const warnings = [];

function existsAsWebTarget(target) {
  if (fs.existsSync(target)) return true;
  if (!path.extname(target) && fs.existsSync(target + '.html')) return true;
  return fs.existsSync(path.join(target, 'index.html'));
}

function localTarget(owner, raw) {
  let value = String(raw || '').trim();
  if (!value || /^(?:#|https?:|mailto:|tel:|data:|blob:|javascript:|\/\/)/i.test(value)) return null;
  if (/[{}]/.test(value)) return null;
  value = value.split('#')[0].split('?')[0];
  if (!value) return null;
  try { value = decodeURIComponent(value); } catch (_) {}
  return value.startsWith('/')
    ? path.join(root, value.replace(/^\/+/, ''))
    : path.resolve(path.dirname(owner), value);
}

function checkReferences(file, text, regex, kind) {
  let match;
  while ((match = regex.exec(text))) {
    const target = localTarget(file, match[1]);
    if (!target || existsAsWebTarget(target)) continue;
    failures.push(`${path.relative(root, file)}: ${kind} ไม่พบไฟล์ "${match[1]}"`);
  }
}

function runNode(file) {
  const result = cp.spawnSync(process.execPath, ['--check', file], { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) failures.push(`${path.relative(root, file)}: syntax ไม่ผ่าน\n${result.stderr.trim()}`);
}

function runTest(args, label) {
  const result = cp.spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) failures.push(`${label}: ไม่ผ่าน\n${(result.stdout + result.stderr).trim()}`);
  else console.log(`✓ ${label}`);
}

const secretScan = scanProject(root);
secretScan.findings.forEach((finding) => failures.push(`secret scan: ${formatFinding(finding)}`));
// fail-closed (2026-08-07): ไฟล์ >2MB ที่ไม่เคยถูกสแกน = "ยังไม่ได้ตรวจ" ต้องนับเป็นไม่ผ่าน ห้ามปล่อยให้ exit 0 เงียบๆ
secretScan.skippedLargeFiles.forEach((file) => failures.push(`secret scan: ไฟล์ข้อความขนาดใหญ่เกิน 2MB ไม่เคยถูกสแกนหาค่าลับ (fail-closed) — ${file}`));
// fail-closed (2026-08-11): ไฟล์ข้อความที่มีไบต์ NUL ปนอยู่ ตัวสแกนจะข้ามเงียบๆ = "ยังไม่ได้ตรวจ"
secretScan.skippedBinaryTextFiles.forEach((file) => failures.push(`secret scan: ไฟล์ข้อความมีไบต์ NUL จึงไม่เคยถูกสแกนหาค่าลับ (fail-closed) — ${file}`));
if (secretScan.findings.length === 0 && secretScan.skippedLargeFiles.length === 0 && secretScan.skippedBinaryTextFiles.length === 0) console.log(`✓ ตรวจค่าลับ ${secretScan.scannedFiles} ไฟล์`);

const files = listRepositoryFiles(root).filter((file) => fs.existsSync(path.join(root, file)));
const jsFiles = files.filter((file) => file.endsWith('.js'));
const htmlFiles = files.filter((file) => file.endsWith('.html'));
const cssFiles = files.filter((file) => file.endsWith('.css'));

jsFiles.forEach((file) => runNode(path.join(root, file)));
console.log(`✓ JavaScript syntax ${jsFiles.length} ไฟล์`);

htmlFiles.forEach((relative) => {
  const file = path.join(root, relative);
  const text = fs.readFileSync(file, 'utf8');
  const markup = text
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(?:code|pre)\b[^>]*>[\s\S]*?<\/(?:code|pre)>/gi, '');
  checkReferences(file, markup, /\b(?:href|src)\s*=\s*["']([^"']+)["']/gi, 'ลิงก์ HTML');

  const idMarkup = markup
    .replace(/(<script\b[^>]*>)[\s\S]*?<\/script>/gi, '$1</script>')
    .replace(/(<style\b[^>]*>)[\s\S]*?<\/style>/gi, '$1</style>');
  const ids = new Map();
  for (const match of idMarkup.matchAll(/\bid\s*=\s*["']([^"']+)["']/gi)) {
    ids.set(match[1], (ids.get(match[1]) || 0) + 1);
  }
  for (const [id, count] of ids) {
    if (count > 1) warnings.push(`${relative}: id="${id}" ซ้ำ ${count} จุด`);
  }

  let inlineIndex = 0;
  for (const match of text.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const attrs = match[1];
    const body = match[2];
    if (/\bsrc\s*=/i.test(attrs) || /\btype\s*=\s*["'](?:application\/json|application\/ld\+json|importmap)["']/i.test(attrs)) continue;
    inlineIndex++;
    try { new vm.Script(body, { filename: `${relative}#inline-${inlineIndex}` }); }
    catch (error) { failures.push(`${relative}: inline script ${inlineIndex} syntax ไม่ผ่าน\n${error.message}`); }
  }
});
console.log(`✓ ตรวจ HTML ${htmlFiles.length} ไฟล์`);

cssFiles.forEach((relative) => {
  const file = path.join(root, relative);
  const text = fs.readFileSync(file, 'utf8');
  checkReferences(file, text, /url\(\s*["']?([^"')]+)["']?\s*\)/gi, 'ลิงก์ CSS');
});
console.log(`✓ ตรวจ CSS ${cssFiles.length} ไฟล์`);

runTest(['data/tools/tests-tone-engine.js'], 'tone engine tests');
runTest(['data/tools/tests-check-data-health.js'], 'data-health tests');
runTest(['data/tools/check-duplicate-words.js'], 'duplicate-word check');
runTest(['data/tools/check-data-health.js'], 'data-health check');
runTest(['scripts/tests-secret-scanner.js'], 'secret-scanner tests');
// เพิ่ม 2026-08-07 (รวมผล P3 — ตัวทดสอบคุ้มกันพฤติกรรมเดิม)
runTest(['scripts/tests-marketing-behavioral.js'], 'marketing behavioral tests');
runTest(['scripts/tests-game-behavioral.js'], 'game behavioral tests');
runTest(['scripts/tests-s13-protected-architecture.js'], 'S13 protected content/audio architecture tests');
runTest(['scripts/tests-phase1-private-audio-3-recovery.js'], 'PRIVATE_AUDIO_3 scoped recovery tests');
runTest(['scripts/tests-s29-score-security.mjs'], 'S29 score-security tests');
runTest(['scripts/tests-phase1-nickname-safety.js'], 'Phase 1 nickname safety/security tests');
runTest(['scripts/tests-phase1-nickname-recovery.js'], 'Phase 1 nickname recovery source/SQL tests');
// เพิ่ม 2026-08-13 — Guest activity ห้ามกลายเป็น account Progress/SRS/Mastered หลัง Login
runTest(['scripts/tests-phase1-account-boundary.js'], 'Phase 1 Guest/Login account-boundary tests');
runTest(['scripts/tests-my-learning-phase1.js'], 'Phase 1 我的學習 tests');
runTest(['scripts/tests-personal-content-phase1.js'], 'Phase 1 我的內容 tests');
runTest(['scripts/tests-practice-events-phase1.mjs'], 'Phase 1 Played-evidence tests');
runTest(['scripts/tests-phase1-free-gamification.mjs'], 'Phase 1 Free Daily Streak/gamification tests');
runTest(['scripts/tests-phase1-played-gamification-recovery.mjs'], 'Phase 1 Played/Gamification recovery artifact tests');
runTest(['scripts/tests-phase1-srs.js'], 'Phase 1 SRS tests');
runTest(['scripts/tests-listening-phase1.js'], 'Phase 1 Listening tests');
runTest(['scripts/tests-phase1-game-content-rl-grants.mjs'], 'Phase 1 game-content rate-limit grant tests');
runTest(['scripts/tests-typing-phase1.js'], 'Phase 1 Typing tests');
runTest(['scripts/tests-reading-phase1.js'], 'Phase 1 Reading tests');
runTest(['scripts/tests-word-order-phase1.js'], 'Phase 1 Word Order tests');
runTest(['scripts/tests-account-export-phase1.js'], 'Phase 1 account-export tests');
runTest(['scripts/tests-shared-games-phase1.js'], 'Phase 1 shared-game-system tests');
runTest(['scripts/tests-game-flow-delta.js'], 'Locked five-game flow tests');
runTest(['scripts/tests-phase1-challenge-gate.js'], 'Phase 1 Challenge access-gate tests');
runTest(['scripts/tests-resource-search-phase1.js'], 'Phase 1 Resource Search tests');
runTest(['scripts/tests-vault-consent-phase1.js'], 'Phase 1 Vault consent-gate tests');
runTest(['scripts/tests-personal-search-phase1.js'], 'Phase 1 Personal Search tests');
runTest(['scripts/tests-phase1-network-recovery.js'], 'Phase 1 offline/network/timeout recovery tests');
runTest(['scripts/tests-phase1-error-ux.js'], 'Phase 1 audio/loading/auth error UX tests');
runTest(['scripts/tests-auth-session-phase1.js'], 'Phase 1 auth session verification tests');
runTest(['scripts/tests-account-lifecycle-phase1.js'], 'Phase 1 account lifecycle recovery tests');
runTest(['scripts/tests-phase1-account-audit-integrity.js'], 'Phase 1 account audit trust-boundary tests');
runTest(['scripts/tests-email-otp-auth-security.js'], 'Email OTP auth-security regression tests');
runTest(['scripts/tests-email-otp-service-client-contract.mjs'], 'Email OTP service/client activation contract tests');
runTest(['scripts/tests-phase1-save-retry.js'], 'Phase 1 API/Edge/save/retry safety tests');
runTest(['scripts/tests-phase1-canonical-state.js'], 'Phase 1 canonical persistence tests');
runTest(['scripts/tests-phase1-owner-switch-races.js'], 'Phase 1 owner-switch late-response race tests');
runTest(['scripts/tests-phase1-backend-transactions.js'], 'Phase 1 backend transaction/idempotency contract tests');
runTest(['scripts/tests-phase1-rollout-compatibility.mjs'], 'Phase 1 mixed-version rollout compatibility tests');
runTest(['scripts/tests-phase1-consent-coverage.js'], 'Phase 1 all-page analytics consent coverage tests');
runTest(['scripts/tests-cron-internal-auth.js'], 'Phase 1 cron/browser authorization contract tests');
runTest(['scripts/tests-phase1-cron-reliability.js'], 'Phase 1 cron reliability/readiness tests');
runTest(['scripts/tests-phase1-calendar-reliability.mjs'], 'Phase 1 Calendar rate-limit/idempotency tests');
// เพิ่ม 2026-08-11 (P5-B) — ตัวทดสอบคุ้มกันกฎห้องเรียนที่เคยพังมาแล้วจริง
// (กฎล็อกเพิ่ม/เลื่อน/ยกเลิก · สำรองก่อนแตะ Calendar · ตรวจคาบชนตอนย้าย · p_original_time ·
//  ซิงค์ตารางหลังย้าย · ระบบเก่าที่ลบถาวรห้ามกลับมา · รีเซ็ตธงเตือน · ปุ่ม LINE พก d=/t=)
// ทดสอบแล้วว่าจับ regression ได้จริง (negative test 2 แบบ) ไม่ใช่ด่านหลอก
runTest(['scripts/tests-classroom-behavioral.js'], 'classroom behavioral tests');
// เพิ่ม 2026-08-14 — Textbook temporary client-side gate ต้องครอบสารบัญ+10 บท
// และห้ามลามไปล็อก Teaching Pages ใน classroom/
runTest(['scripts/tests-textbook-access-gate.js'], 'Textbook temporary gate tests');
// เพิ่ม 2026-08-10 — ตัวทดสอบคุ้มกันพฤติกรรมเดิมของ Search MVP
runTest(['scripts/tests-search-behavioral.js'], 'search behavioral tests');
// เพิ่ม 2026-08-10 — ตรวจว่า nav/แถบประกาศ/bottom-nav ทุกหน้าตรงกับ data/nav-template.js (read-only)
runTest(['scripts/check-nav-consistency.js'], 'nav consistency check');
// เพิ่ม 2026-08-14 — Footer มาตรฐานต้องครอบทุกหน้า Public Shell + vocab cheatsheet
// และต้องมี Terms, Privacy, copyright โดยไม่มี Contact/Social ใน Footer
runTest(['scripts/tests-footer-standard.js'], 'footer standard tests');
// เพิ่ม 2026-08-11 — ตรวจความพร้อมคลังเนื้อหาสำหรับระบบเรียนกลาง (อ่านอย่างเดียว)
// บล็อกเมื่อ metadata ที่ระบบต้องใช้ขาด (zh/category/level) · ช่องว่างอื่นเป็นรายงานให้ Lin ไม่บล็อก
// ดูรายการเต็ม: node scripts/audit-learning-content.js --full
runTest(['scripts/audit-learning-content.js'], 'learning content audit');
// เพิ่ม 2026-08-11 — คุ้มกันกติกาคลังคำ sync ข้ามเครื่องที่ Lin สั่งไว้ (ผิดแล้วคำของนักเรียนหายถาวร):
// รวมคำได้แม้เกินเพดาน · ห้ามลบคำอัตโนมัติ · ห้ามข้อมูลเดิมหาย · guest/local ต้องไม่พัง
// ทดสอบย้อนกลับแล้ว 3 แบบว่าจับของพังได้จริง (ไม่ใช่ด่านหลอก)
runTest(['scripts/tests-word-vault-sync.js'], 'word-vault sync tests');
runTest(['scripts/check-mobile-accessibility.js'], 'mobile/accessibility check (warning-only)');
// เพิ่ม 2026-08-11 — ตรวจ SEO metadata ของ "หน้าสาธารณะที่ให้ Google เก็บ" + sitemap เทียบไฟล์จริง
// บล็อกเฉพาะ ERROR (sitemap ชี้ไฟล์ที่ไม่มี · หน้า admin/noindex หลุดเข้า sitemap · URL ซ้ำ · lastmod อนาคต)
// หน้าสาธารณะขาด description/canonical/OG = WARNING เฉยๆ ไม่บล็อก (กันหนี้เก่าบล็อกทั้งเว็บ)
// ทดสอบย้อนกลับแล้วว่าจับได้จริงทั้ง 3 แบบ ไม่ใช่ด่านหลอก · ดูครบ: node scripts/check-seo-sitemap.js --full
runTest(['scripts/check-seo-sitemap.js'], 'seo/sitemap check');
// ⚠️ scripts/check-minified-sync.js ตั้งใจ "ไม่" ใส่ในนี้ — สคริปต์นั้นเทียบเนื้อหาแบบ exact-match
// ซึ่งจะ MISMATCH เสมอกับไฟล์ที่ผ่าน minifier จริง (ดูคอมเมนต์ในไฟล์นั้น) ถ้าใส่ที่นี่จะ fail ทุกครั้ง
// ทั้งที่โค้ดอาจไม่มีปัญหาจริง — ให้รันแยกด้วยมือ: node scripts/check-minified-sync.js
// (ใช้ดู mtime ว่า .js ต้นฉบับใหม่กว่า .min.js ไหม ไม่ใช่ด่านที่บล็อก push)

if (warnings.length) {
  console.log(`\nคำเตือน ${warnings.length} รายการ:`);
  warnings.forEach((item) => console.log(`- ${item}`));
}

if (failures.length) {
  console.error(`\nไม่ผ่าน ${failures.length} รายการ:`);
  failures.forEach((item) => console.error(`- ${item}`));
  process.exit(1);
}

console.log(`\n✅ ผ่านทั้งหมด — ${files.length} ไฟล์โปรเจกต์ที่มีอยู่ในเครื่อง`);
