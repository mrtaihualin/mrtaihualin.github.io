#!/usr/bin/env node
// ════════════════════════════════════════════════════════════
// build-staging.js — สร้างสำเนาเว็บสำหรับทดสอบ staging (P7-02)
//
// ทำอะไร:
//   1. คัดลอกทั้งเว็บ (ยกเว้นไฟล์ dev/secret ที่ไม่ต้องเอาไปเว็บ) ไปที่โฟลเดอร์ _staging-build/
//   2. ในสำเนานั้นเท่านั้น — เปลี่ยนทุกหน้าให้โหลด supabase-config.staging.js แทน supabase-config.js
//
// ไม่แตะไฟล์ต้นทางในเว็บจริงแม้แต่ไฟล์เดียว — ปลอดภัย 100% ต่อเว็บจริง
//
// วิธีใช้ (Lin รันเอง):
//   cd /Users/taihualin/Developer/mrtaihualin.github.io
//   node scripts/build-staging.js
//   → ได้โฟลเดอร์ _staging-build/ พร้อมลาก (drag & drop) ขึ้น Netlify (Deploys → ลากโฟลเดอร์นี้ไปวาง)
// ════════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, '_staging-build');

// โฟลเดอร์/ไฟล์ที่ไม่ต้องคัดลอกไป staging build (dev-only, secret, หรือไม่ใช่ของเว็บ)
const EXCLUDE_NAMES = new Set([
  '.git', '.github', '.DS_Store', '_staging-build', '_archive', '_to_delete',
  'CLAUDE.md', 'scripts', 'supabase', 'node_modules', '_แผนงาน',
  '_dev', '_บทความ-เตรียมเขียน',
]);

function shouldExclude(name) {
  if (EXCLUDE_NAMES.has(name)) return true;
  if (name.startsWith('.fuse_hidden')) return true;
  if (name.startsWith('_staging-build')) return true; // กันโฟลเดอร์ทดสอบเก่า (เช่น _staging-build-verify) หลุดเข้าไปซ้อนในสำเนาใหม่
  return false;
}

function copyRecursive(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      if (shouldExclude(entry)) continue;
      copyRecursive(path.join(src, entry), path.join(dest, entry));
    }
  } else {
    fs.copyFileSync(src, dest);
  }
}

function patchHtmlFiles(dir) {
  let patched = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      patched += patchHtmlFiles(full);
      continue;
    }
    if (!entry.name.endsWith('.html')) continue;
    const original = fs.readFileSync(full, 'utf8');
    // แทนที่เฉพาะชื่อไฟล์ supabase-config.js → supabase-config.staging.js
    // (คง query string ?v=5 เดิมไว้ ไม่กระทบ cache-busting)
    const updated = original.replace(
      /js\/core\/supabase-config\.js/g,
      'js/core/supabase-config.staging.js'
    );
    if (updated !== original) {
      fs.writeFileSync(full, updated, 'utf8');
      patched++;
    }
  }
  return patched;
}

// 2026-08-10 (P7-02 staging บั๊กที่เจอจริง): game-content-client.js มีค่า URL/anonKey ของ
// "โปรดักชัน" ฝังเป็นค่าสำรอง (fallback) ไว้ในตัว — ตั้งใจให้ใช้ค่าจาก window.SUPABASE_CONFIG
// ก่อนเสมอ แต่เพราะ <script defer src="supabase-config.js"> รันช้ากว่า <script src="game-content-client.js">
// (ไม่มี defer) ที่โหลดทีหลังในหน้า HTML — ทุกหน้าเกมเลยอ่านค่า SUPABASE_CONFIG ไม่ทัน
// ตกไปใช้ค่าสำรองที่เป็นโปรดักชันเสมอ ไม่ว่าจะสลับ config เป็น staging ให้แค่ไหน
// (บนเว็บจริงไม่มีใครสังเกตเพราะค่าสำรอง = ค่าโปรดักชันจริงพอดี)
// แก้โดย "แก้เฉพาะในสำเนา _staging-build" ให้ค่าสำรอง 2 ตัวนี้ชี้เป็น staging แทน
// ไม่แตะไฟล์ต้นทางจริงเลย (เหมือนเดิมทั้งไฟล์ อ่านค่า staging จาก supabase-config.staging.js เอง
// ไม่ hardcode ซ้ำสองที่ กันค่าเพี้ยนกันเองถ้า Lin เปลี่ยน staging project ทีหลัง)
function patchGameContentClientFallback(outDir, stagingConfigContent) {
  const targetPath = path.join(outDir, 'js', 'games', 'game-content-client.js');
  if (!fs.existsSync(targetPath)) {
    console.warn('⚠️  ไม่พบ js/games/game-content-client.js ใน _staging-build — ข้ามขั้นนี้ (ถ้าหน้าเกมพัง ให้เช็คไฟล์นี้)');
    return false;
  }
  const urlMatch = stagingConfigContent.match(/url:\s*'([^']+)'/);
  const anonMatch = stagingConfigContent.match(/anonKey:\s*'([^']+)'/);
  if (!urlMatch || !anonMatch) {
    console.error('❌ อ่านค่า url/anonKey จาก supabase-config.staging.js ไม่ได้ — ตรวจรูปแบบไฟล์นั้นก่อน');
    process.exit(1);
  }
  const stagingUrl = urlMatch[1];
  const stagingAnonKey = anonMatch[1];

  const original = fs.readFileSync(targetPath, 'utf8');
  const OLD_URL = 'https://qzkxlhpcputsvbqmtqfi.supabase.co';
  const OLD_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF6a3hsaHBjcHV0c3ZicW10cWZpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2NjI1NDksImV4cCI6MjA5NzIzODU0OX0.1g80zxHfduq9RLdpus10hBDSEYWIXu2Jnqb6LsvqXpw';

  if (!original.includes(OLD_URL) || !original.includes(OLD_ANON)) {
    console.error('❌ ไม่เจอค่าสำรอง production เดิมใน game-content-client.js — โค้ดอาจถูกแก้ไปแล้ว ต้องตรวจซ้ำก่อนเชื่อผล build นี้');
    process.exit(1);
  }

  const patched = original.split(OLD_URL).join(stagingUrl).split(OLD_ANON).join(stagingAnonKey);
  fs.writeFileSync(targetPath, patched, 'utf8');
  return true;
}

function main() {
  console.log('🧹 ลบ _staging-build เดิม (ถ้ามี) ...');
  try {
    fs.rmSync(OUT, { recursive: true, force: true });
  } catch (err) {
    console.warn('⚠️  ลบโฟลเดอร์เดิมไม่หมด (' + err.message + ') — จะคัดลอกทับแทน ถ้ามีปัญหาให้ลบ _staging-build/ เองใน Finder ก่อนรันใหม่');
  }

  console.log('📦 กำลังคัดลอกเว็บทั้งหมดไป _staging-build/ ...');
  copyRecursive(ROOT, OUT);

  const stagingConfigPath = path.join(OUT, 'js', 'core', 'supabase-config.staging.js');
  if (!fs.existsSync(stagingConfigPath)) {
    console.error('❌ ไม่พบ js/core/supabase-config.staging.js — สร้างไฟล์นี้ก่อนแล้วรันใหม่');
    process.exit(1);
  }
  const stagingConfigContent = fs.readFileSync(stagingConfigPath, 'utf8');

  console.log('🔧 กำลังแก้หน้าเว็บใน _staging-build/ ให้โหลดค่า staging ...');
  const patched = patchHtmlFiles(OUT);

  console.log('🔧 กำลังแก้ค่าสำรอง production ที่ฝังใน game-content-client.js ให้เป็น staging ...');
  patchGameContentClientFallback(OUT, stagingConfigContent);

  console.log(`✅ เสร็จแล้ว — แก้ ${patched} หน้า ให้โหลด supabase-config.staging.js`);
  console.log(`📁 โฟลเดอร์พร้อม deploy: ${OUT}`);
  console.log('   ขั้นต่อไป: เปิด Netlify → เว็บ gentle-moxie-bf64ad → แท็บ Deploys → ลากโฟลเดอร์ _staging-build ไปวาง');
}

main();
