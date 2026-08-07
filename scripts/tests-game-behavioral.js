#!/usr/bin/env node
'use strict';
/**
 * scripts/tests-game-behavioral.js — Lin P3 (2026-08-07)
 * ────────────────────────────────────────────────────────────
 * ตรวจ "พฤติกรรมเกม" แบบ static (อ่านโค้ด ไม่ยิงเน็ตจริง) — คนละเรื่องกับ
 * data/tests-tone-engine.js / data/tests-check-data-health.js ที่ตรวจ "ข้อมูล" (คำ/ประโยค/วรรณยุกต์)
 *
 * ตรวจ 3 กลุ่ม:
 *   A) เกมทั้ง 6 หน้า (games-challenge/reading-game/tone-finder/typing-game/word-order/listening-game)
 *      โหลดข้อมูลผ่าน game-content-client.js เท่านั้น ไม่มี <script src="data/words-data.js"> หลงเหลือ
 *   B) ยามเฝ้าประตูถูกเรียกจริงในจุดที่ควรบล็อกก่อนให้เล่น/ให้แต้ม
 *      (lego-daily-limit ก่อน startTest, TONE_SERVER.finishRound ในเกมที่มี SRS/ดาว)
 *   C) เพดานเนื้อหาใน Edge Function game-content ตรงกับที่ CLAUDE.md บันทึกไว้ (50/100, 20/40)
 *      + tier ต้องมาจาก JWT ฝั่งเซิร์ฟเวอร์เท่านั้น ห้ามอ่านจาก body ที่ client ส่งมา
 *
 * ข้อจำกัด (บอกตรงๆ): เช็คนี้เป็น "อ่านโค้ดหาความเข้าใจผิด/regression" ไม่ใช่พิสูจน์ว่า
 * Edge Function ที่ deploy จริงบน Supabase ทำงานตรงกับไฟล์ในเครื่อง — ต้องเทียบกับ
 * data/game-content-tester.html (ยิงเน็ตจริง) ควบคู่กันเสมอ ดู checklist มือแยกต่างหาก
 * ────────────────────────────────────────────────────────────
 */

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const failures = [];
const notes = []; // known issues / สิ่งที่ควรรู้ แต่ไม่ใช่ regression ให้บล็อก push

function read(relPath) {
  const full = path.join(root, relPath);
  if (!fs.existsSync(full)) return null;
  return fs.readFileSync(full, 'utf8');
}

function ok(label) { console.log(`✓ ${label}`); }
function fail(label, detail) { failures.push(`${label}${detail ? ': ' + detail : ''}`); }

// ════════════════════════════════════════════════════════════
// A) เกมทั้ง 6 หน้าโหลดข้อมูลผ่าน game-content-client.js เท่านั้น
// ════════════════════════════════════════════════════════════
const GAME_PAGES = [
  'games-challenge.html',
  'reading-game.html',
  'tone-finder.html',
  'typing-game.html',
  'word-order.html',
  'listening-game.html',
];

GAME_PAGES.forEach((page) => {
  const text = read(page);
  if (text === null) { fail(`A: ${page}`, 'ไม่พบไฟล์'); return; }
  const hasLoaderScript = /src=["']js\/games\/game-content-client\.js/.test(text);
  const hasBootCall = /GameContentLoader\.boot\(/.test(text);
  const hasOldDataScript = /src=["']data\/(words-data|adv-sentences)\.js/.test(text);
  if (!hasLoaderScript) fail(`A: ${page}`, 'ไม่โหลด js/games/game-content-client.js');
  if (!hasBootCall) fail(`A: ${page}`, 'ไม่เรียก GameContentLoader.boot(...)');
  if (hasOldDataScript) fail(`A: ${page}`, 'ยังโหลด data/words-data.js หรือ data/adv-sentences.js ตรงๆ (ช่องโหว่เดิมที่แก้ไปแล้วอาจกลับมา)');
  if (hasLoaderScript && hasBootCall && !hasOldDataScript) ok(`A: ${page} โหลดผ่าน game-content-client.js อย่างเดียว`);
});

// lego.html ตั้งใจไม่ใช้ระบบนี้ (คนละคลังข้อมูล) — เช็คว่าไม่มีร่องรอยเก่าหลงเหลือที่จะ error เงียบ
{
  const legoHtml = read('lego.html');
  if (legoHtml === null) fail('A: lego.html', 'ไม่พบไฟล์');
  else {
    const usesLoader = /GameContentLoader\.boot\(/.test(legoHtml);
    const usesOldData = /src=["']data\/(words-data|adv-sentences)\.js/.test(legoHtml);
    if (usesLoader) notes.push('lego.html เรียก GameContentLoader.boot() ทั้งที่เดิมไม่ใช้ระบบนี้ — ตรวจว่าตั้งใจเปลี่ยนหรือไม่');
    if (usesOldData) fail('A: lego.html', 'ยังโหลด data/words-data.js หรือ data/adv-sentences.js ตรงๆ');
    if (!usesLoader && !usesOldData) ok('A: lego.html ไม่ผูกกับระบบ game-content (ตามที่ออกแบบไว้ — คนละคลังข้อมูล)');
  }
}

// ════════════════════════════════════════════════════════════
// B-1) เกมเลโก้: legoCheckDailyQuota() ต้องถูกเรียกก่อน startTest ทำงานจริง + ต้อง fail-closed
// ════════════════════════════════════════════════════════════
{
  const legoApp = read('js/games/lego-game-app.js');
  if (legoApp === null) fail('B-1: lego-game-app.js', 'ไม่พบไฟล์');
  else {
    const startTestMatch = legoApp.match(/async function startTest\(\)\s*{([\s\S]*?)\n}\n/);
    if (!startTestMatch) fail('B-1: lego-game-app.js', 'หา startTest() ไม่เจอ (โครงสร้างไฟล์เปลี่ยนไป — ต้องตรวจด้วยตา)');
    else {
      const body = startTestMatch[1];
      const callsQuota = /await\s+legoCheckDailyQuota\(\)/.test(body);
      const gatesOnNotOk = /if\s*\(\s*!quota\.ok\s*\)\s*{[\s\S]*?return;/.test(body);
      if (!callsQuota) fail('B-1: lego-game-app.js', 'startTest() ไม่เรียก legoCheckDailyQuota()');
      if (!gatesOnNotOk) fail('B-1: lego-game-app.js', 'startTest() ไม่มีด่าน "if(!quota.ok){...return;}" ก่อนเริ่มทำโจทย์ — อาจเล่นได้ทั้งที่โควตาหมด');
      if (callsQuota && gatesOnNotOk) ok('B-1: lego-game-app.js startTest() เช็คโควตาก่อนเริ่ม + บล็อกจริงถ้าไม่ผ่าน');
    }

    // fail-closed: ฟังก์ชัน legoCheckDailyQuota เจอ error/no client ต้องคืน ok:false ไม่ใช่ ok:true (เผลอปล่อยผ่าน)
    const quotaFnMatch = legoApp.match(/async function legoCheckDailyQuota\(\)\s*{([\s\S]*?)\n}\n/);
    if (quotaFnMatch) {
      const fnBody = quotaFnMatch[1];
      const hasOkTrueFallback = /ok\s*:\s*true/.test(fnBody);
      if (hasOkTrueFallback) fail('B-1: legoCheckDailyQuota()', 'พบ ok:true ในเส้นทาง error — เสี่ยงเป็น fail-open ทั้งที่ต้อง fail-closed');
      else ok('B-1: legoCheckDailyQuota() ไม่มีเส้นทาง ok:true ปลอมตอน error (fail-closed ตามที่ CLAUDE.md บันทึกไว้)');
    }
  }

  const legoFn = read('supabase/functions/lego-daily-limit/index.ts');
  if (legoFn === null) fail('B-1: supabase/functions/lego-daily-limit/index.ts', 'ไม่พบไฟล์ Edge Function ต้นฉบับ');
  else {
    const rpcErrReturnsError = /if\s*\(\s*rpcErr\s*\)\s*return\s+json\(\s*{\s*error:/.test(legoFn);
    if (!rpcErrReturnsError) fail('B-1: lego-daily-limit/index.ts', 'เส้นทาง rpcErr ไม่คืน error ชัดเจน (เสี่ยงเงียบ/fail-open)');
    else ok('B-1: lego-daily-limit/index.ts คืน error ชัดเจนเมื่อ RPC พัง (ไม่ปล่อยผ่านเงียบๆ)');
    const identifiesByUserOrIp = /identityKey\s*=\s*'user:'/.test(legoFn) && /identityKey\s*=\s*'ip:'/.test(legoFn);
    if (!identifiesByUserOrIp) fail('B-1: lego-daily-limit/index.ts', 'ไม่พบการระบุตัวตนทั้ง user: และ ip: ตามที่เอกสารบันทึกไว้');
    else ok('B-1: lego-daily-limit/index.ts ระบุตัวตนด้วย user id (ล็อกอิน) หรือ ip hash (ไม่ล็อกอิน) ตามเอกสาร');
  }
}

// ════════════════════════════════════════════════════════════
// B-2) TONE_SERVER.finishRound ต้องถูกเรียกในทุกเกมที่มีดาว/SRS
// ════════════════════════════════════════════════════════════
{
  const GAMES_WITH_SRS = {
    'js/games/reading-game-app.js': 'เกมอ่าน',
    'js/games/typing-game-app.js': 'เกมพิมพ์',
    'js/games/word-order-app.js': 'เกมลำดับคำ',
    'js/games/tone-finder-game.js': 'เกมเสียง',
    'js/games/games-challenge-app.js': 'เกมรวม/Challenge',
  };
  Object.keys(GAMES_WITH_SRS).forEach((file) => {
    const text = read(file);
    if (text === null) { fail(`B-2: ${file}`, 'ไม่พบไฟล์'); return; }
    const callsFinishRound = /TONE_SERVER\.finishRound\(/.test(text);
    if (!callsFinishRound) fail(`B-2: ${file}`, `${GAMES_WITH_SRS[file]} ไม่เรียก TONE_SERVER.finishRound() — เสี่ยงให้ดาว/เลื่อนขั้นฝั่ง client เองโดยไม่ผ่านเซิร์ฟเวอร์`);
    else ok(`B-2: ${file} (${GAMES_WITH_SRS[file]}) เรียก TONE_SERVER.finishRound() ให้เซิร์ฟเวอร์ตัดสินดาว/SRS`);
  });

  const listeningApp = read('js/games/listening-game-app.js');
  if (listeningApp !== null) {
    const callsFinishRound = /TONE_SERVER\.finishRound\(/.test(listeningApp);
    if (callsFinishRound) ok('B-2: listening-game-app.js เรียก TONE_SERVER.finishRound() ด้วย');
    else notes.push('เกมฟัง (listening-game-app.js) ไม่เรียก TONE_SERVER.finishRound() — ไม่มีระบบดาว/SRS ในเกมนี้ (ตรวจโค้ดแล้วไม่พบการให้ดาวฝั่ง client เองด้วย) ยืนยันกับ Lin ว่าเป็นการออกแบบตั้งใจหรือไม่ได้ทำ');
  }
}

// ════════════════════════════════════════════════════════════
// C) game-content Edge Function: เพดานตรงเอกสาร + tier มาจาก JWT เท่านั้น
// ════════════════════════════════════════════════════════════
{
  const fn = read('supabase/functions/game-content/index.ts');
  if (fn === null) fail('C: supabase/functions/game-content/index.ts', 'ไม่พบไฟล์');
  else {
    const capsMatch = fn.match(/const CAPS\s*=\s*{([\s\S]*?)};/);
    if (!capsMatch) fail('C: game-content/index.ts', 'หา const CAPS ไม่เจอ');
    else {
      const capsBlock = capsMatch[1];
      const expect = [
        [/anon:\s*{\s*'初':\s*50,\s*'中':\s*50,\s*sentences:\s*20\s*}/, 'anon 初=50 中=50 sentences=20'],
        [/login:\s*{\s*'初':\s*100,\s*'中':\s*100,\s*sentences:\s*40\s*}/, 'login 初=100 中=100 sentences=40'],
      ];
      expect.forEach(([re, label]) => {
        if (!re.test(capsBlock)) fail('C: game-content CAPS', `ไม่ตรงกับที่ CLAUDE.md บันทึกไว้ (${label}) — ตรวจว่าเอกสารหรือโค้ดที่ผิด`);
        else ok(`C: game-content CAPS ตรงเอกสาร (${label})`);
      });
    }

    // tier ต้องมาจาก auth.getUser() ของ JWT ใน Authorization header เท่านั้น ห้ามอ่าน body.tier/isLoggedIn
    const tierFromAuth = /const tier\s*=\s*user\s*\?\s*'login'\s*:\s*'anon'/.test(fn);
    const readsBodyForTier = /req\.json\(\)/.test(fn) && /body\.(tier|isLoggedIn)/.test(fn);
    if (!tierFromAuth) fail('C: game-content/index.ts', 'ไม่พบ "tier = user ? login : anon" จาก auth.getUser() ตรงๆ — ตรวจว่า logic เปลี่ยนไปหรือไม่');
    else ok('C: game-content/index.ts ตัดสิน tier จาก auth.getUser() ของ JWT เท่านั้น');
    if (readsBodyForTier) fail('C: game-content/index.ts', 'พบการอ่าน body.tier/isLoggedIn — เสี่ยงเปิดช่องให้ client ปลอม tier');
    else ok('C: game-content/index.ts ไม่อ่าน tier/isLoggedIn จาก body ที่ client ส่งมา (กันปลอม tier)');
  }
}

// ════════════════════════════════════════════════════════════
// D) Known issue ที่บันทึกไว้ใน P2 — ตรวจซ้ำว่ายังไม่ได้แก้จริง (กันรายงานเก่ากับของจริงไม่ตรงกัน)
// ════════════════════════════════════════════════════════════
{
  const boardPages = ['leaderboard.html', 'all-board.html', 'reading-board.html', 'typing-board.html', 'word-order-board.html', 'lego-board.html', 'mix-board.html'];
  boardPages.forEach((page) => {
    const text = read(page);
    if (text === null) return; // ไม่ fail — บางไฟล์อาจไม่มีจริงแล้วก็ได้ ให้ known-issue เช็คเท่าที่เจอ
    const mentionsAdminFilter = /is_admin|admin.{0,20}(filter|exclude|hide)/i.test(text);
    if (!mentionsAdminFilter) notes.push(`${page}: ไม่พบการกรอง/ซ่อนแอดมินออกจากอันดับ (known issue จาก P2 — ยังไม่ถูกแก้ ตรงกับที่บันทึกไว้)`);
    else notes.push(`${page}: พบคำว่า admin ในไฟล์ — ตรวจด้วยตาว่าเป็นการกรองแอดมินออกจากลีดเดอร์บอร์ดจริงหรือไม่ (known issue อาจถูกแก้แล้ว ต้องยืนยันกับ Lin)`);
  });
}

// ════════════════════════════════════════════════════════════
console.log('');
if (notes.length) {
  console.log(`📌 known issues / สิ่งที่ควรรู้ (ไม่บล็อก push แต่ต้องแจ้ง Lin) ${notes.length} รายการ:`);
  notes.forEach((n) => console.log(`- ${n}`));
  console.log('');
}

if (failures.length) {
  console.error(`\n❌ ไม่ผ่าน ${failures.length} รายการ:`);
  failures.forEach((f) => console.error(`- ${f}`));
  process.exit(1);
}

console.log(`✅ ตัวทดสอบพฤติกรรมเกม (static) ผ่านทั้งหมด`);
