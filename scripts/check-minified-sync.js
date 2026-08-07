#!/usr/bin/env node
/**
 * check-minified-sync.js
 * ตรวจว่าไฟล์ .js ต้นฉบับ กับ .min.js คู่กัน "เนื้อหาเรียงลำดับตรงกัน" หรือไม่
 *
 * วิธีตรวจ: ไม่ได้ parse JS จริงจัง (เสี่ยง false negative จากตัว minifier
 * ที่เปลี่ยนชื่อตัวแปร/ย่อโค้ด) — ใช้วิธี "normalize แล้วเทียบ token stream"
 * คือตัด comment (แบบบรรทัดเดียวและแบบหลายบรรทัด) + ตัด whitespace ทั้งหมดออก
 * แล้วไล่เทียบทีละตัวอักษรที่เหลือ (คำสั่ง keyword/string/operator ต้องเรียงตรงกัน)
 *
 * ข้อจำกัดที่ต้องรู้ (บอกตรงๆ — สำคัญมาก):
 * - ตรวจแล้วพบว่าไฟล์ .min.js ทั้ง 5 ไฟล์ของโปรเจกต์นี้ "ผ่าน minifier จริง"
 *   (ย่อชื่อตัวแปรเป็น e/t/s ฯลฯ, แปลง === เป็น 3 ตัวอักษร, ใช้ !0/!1 แทน
 *   true/false) ไม่ใช่แค่ตัด whitespace/comment ธรรมดาตามที่คาดไว้ตอนแรก
 * - เพราะงั้นวิธี normalize-then-exact-match นี้ "ตรวจไม่ผ่าน (MISMATCH)
 *   เสมอ" กับทุกคู่ไฟล์ แม้ logic จะตรงกัน 100% ก็ตาม — สคริปต์นี้จึง
 *   **บอกไม่ได้ว่าไฟล์ไหน "เหมือนกันจริง"** ทำได้แค่ช่วยดู mtime (ไฟล์ไหน
 *   แก้หลังสุด) และดูขนาดเทียบเคียงคร่าวๆ เพื่อจับเคสที่ "ต่างกันชัดเจนผิดปกติ"
 *   (เช่น .min.js สั้นกว่าที่ควรมาก แปลว่าน่าจะเป็นคนละเวอร์ชันเก่ามาก)
 * - สรุป: เชื่อถือได้แค่ "เป็นสัญญาณเตือนคร่าวๆ" ห้ามใช้ผล MATCH/MISMATCH
 *   ของสคริปต์นี้ฟันธงว่าไฟล์ตรงหรือไม่ตรงกัน ต้องมีคนอ่านโค้ดจริงหรือใช้
 *   เครื่องมือเทียบ AST (เช่นรัน minifier ตัวเดียวกันกับ .js ต้นฉบับแล้ว
 *   เทียบผลลัพธ์) ถึงจะฟันธงได้จริง
 */

const fs = require('fs');
const path = require('path');

const PAIRS = [
  'js/core/shared',
  'js/games/reading-game-app',
  'js/games/typing-game-app',
  'js/games/word-order-app',
  'js/games/tone-finder-game',
];

const ROOT = path.join(__dirname, '..');

// ตัด comment แบบหยาบๆ (พอสำหรับไฟล์เกมนี้ ไม่ได้ parse string literal อย่างเข้มงวด
// เสี่ยงตัด comment ผิดถ้ามี // หรือ /* อยู่ใน string — ยอมรับความเสี่ยงนี้เพื่อความง่าย)
function normalize(code) {
  // หมายเหตุ: ตัดเฉพาะ block comment (/* */) เท่านั้น ไม่ตัด line comment (//)
  // เพราะไฟล์เกมนี้มี regex literal ที่มี "//" อยู่ข้างใน (เช่น /\bLine\//i)
  // ถ้าตัด line comment แบบหยาบๆ จะกิน code ทั้งบรรทัดหลัง regex ไปด้วย
  // ทำให้ normalize สั้นผิดปกติ (ทดสอบแล้วเจอปัญหานี้จริงกับ shared.js)
  return code
    .replace(/\/\*[\s\S]*?\*\//g, '')      // block comment
    .replace(/\s+/g, '');                  // whitespace ทั้งหมด
}

function firstDiffIndex(a, b) {
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    if (a[i] !== b[i]) return i;
  }
  return a.length === b.length ? -1 : len;
}

function check(pairBase) {
  const jsPath = path.join(ROOT, `${pairBase}.js`);
  const minPath = path.join(ROOT, `${pairBase}.min.js`);

  const result = { pairBase, jsPath, minPath };

  if (!fs.existsSync(jsPath) || !fs.existsSync(minPath)) {
    result.status = 'MISSING_FILE';
    return result;
  }

  const jsRaw = fs.readFileSync(jsPath, 'utf8');
  const minRaw = fs.readFileSync(minPath, 'utf8');
  const jsNorm = normalize(jsRaw);
  const minNorm = normalize(minRaw);

  const jsStat = fs.statSync(jsPath);
  const minStat = fs.statSync(minPath);
  result.jsMtime = jsStat.mtime.toISOString();
  result.minMtime = minStat.mtime.toISOString();
  result.jsNewer = jsStat.mtimeMs > minStat.mtimeMs;

  if (jsNorm === minNorm) {
    result.status = 'MATCH';
  } else {
    result.status = 'MISMATCH';
    result.jsNormLen = jsNorm.length;
    result.minNormLen = minNorm.length;
    const diffIdx = firstDiffIndex(jsNorm, minNorm);
    result.firstDiffIndex = diffIdx;
    result.jsSnippet = jsNorm.slice(Math.max(0, diffIdx - 30), diffIdx + 60);
    result.minSnippet = minNorm.slice(Math.max(0, diffIdx - 30), diffIdx + 60);
  }
  return result;
}

function main() {
  const results = PAIRS.map(check);
  let hasMismatch = false;

  console.log('=== ตรวจ .js กับ .min.js ทั้ง 5 คู่ ===\n');
  for (const r of results) {
    console.log(`--- ${r.pairBase} ---`);
    if (r.status === 'MISSING_FILE') {
      console.log('  ❌ ไม่พบไฟล์อย่างน้อยหนึ่งไฟล์');
      hasMismatch = true;
      continue;
    }
    console.log(`  .js   mtime: ${r.jsMtime}`);
    console.log(`  .min  mtime: ${r.minMtime}`);
    console.log(`  ไฟล์ที่ใหม่กว่า: ${r.jsNewer ? '.js (ต้นฉบับ) ใหม่กว่า' : '.min.js ใหม่กว่าหรือเท่ากัน'}`);
    if (r.status === 'MATCH') {
      console.log('  ✅ MATCH — เนื้อหา (ตัด whitespace/comment) ตรงกัน');
    } else {
      hasMismatch = true;
      console.log('  ⚠️ MISMATCH — เนื้อหาไม่ตรงกัน (หรือ .min.js ผ่าน minifier จริงที่ย่อชื่อตัวแปร)');
      console.log(`     ความยาว normalize: .js=${r.jsNormLen} ตัวอักษร, .min=${r.minNormLen} ตัวอักษร`);
      console.log(`     จุดที่ต่างกันตัวแรก: index ${r.firstDiffIndex}`);
      console.log(`     .js   ช่วงนั้น: ...${r.jsSnippet}...`);
      console.log(`     .min  ช่วงนั้น: ...${r.minSnippet}...`);
    }
    console.log('');
  }

  console.log(hasMismatch
    ? 'สรุป: พบไฟล์ไม่ตรงกันอย่างน้อย 1 คู่ — ดูรายละเอียดด้านบน'
    : 'สรุป: ทุกคู่ตรงกัน (ตามวิธีตรวจแบบ normalize token compare)');

  process.exitCode = hasMismatch ? 1 : 0;
}

main();
