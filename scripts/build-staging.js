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
const { isProtectedRuntimePath } = require('./protected-runtime-paths.js');

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
      var child = path.join(src, entry);
      var relative = path.relative(ROOT, child).replace(/\\/g, '/');
      if (isProtectedRuntimePath(relative)) continue;
      copyRecursive(child, path.join(dest, entry));
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

// game-content-client now resolves SUPABASE_CONFIG at boot time and has no embedded
// production fallback, so staging needs only the HTML config substitution above.

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
  console.log('🔧 กำลังแก้หน้าเว็บใน _staging-build/ ให้โหลดค่า staging ...');
  const patched = patchHtmlFiles(OUT);

  console.log(`✅ เสร็จแล้ว — แก้ ${patched} หน้า ให้โหลด supabase-config.staging.js`);
  console.log(`📁 โฟลเดอร์พร้อม deploy: ${OUT}`);
  console.log('   ขั้นต่อไป: เปิด Netlify → เว็บ gentle-moxie-bf64ad → แท็บ Deploys → ลากโฟลเดอร์ _staging-build ไปวาง');
}

main();
