#!/usr/bin/env node
/**
 * scripts/migrate-game-content.js
 * FILE MAP: sandboxed data-file loader → row adapters/ranking → REST upsert/prune → environment validation + main
 * ────────────────────────────────────────────────────────────
 * ซิงก์คำ/ประโยคจาก data/words-data.js + data/adv-sentences.js (ต้นฉบับที่ Lin แก้เอง
 * ผ่านสกิลร่าง thai-vocab-draft-batch / thai-sentence-draft-batch เหมือนเดิมทุกอย่าง —
 * ไฟล์นี้แค่เป็นขั้น "ซิงก์เข้า Supabase" หลัง Lin อนุมัติคำ/ประโยคใหม่แล้ว)
 * เข้าตาราง game_words / game_sentences บน Supabase (ดู supabase/sql/2026-08-02_game_content_schema.sql)
 *
 * ทำไมต้องมีไฟล์นี้: เกมบนเว็บเลิกโหลด data/words-data.js / data/adv-sentences.js ตรงๆ แล้ว
 * (เดิมเป็นช่องโหว่ — ไฟล์ public เปิด URL ตรงๆ เห็นครบทุกคำ) เกมเปลี่ยนไปดึงข้อมูลจาก
 * Edge Function `game-content` แทน ซึ่งอ่านจากตาราง 2 ตัวนี้ — ต้องรันสคริปต์นี้ทุกครั้งที่
 * Lin เพิ่ม/แก้/ลบคำหรือประโยคในไฟล์ต้นฉบับ ไม่งั้นเว็บจะไม่เห็นของใหม่
 *
 * rank (ลำดับความสำคัญ):
 *   คำ      → ใช้ลำดับจาก CAP_ORDER_TH_初/中 ผ่าน buildCapOrderObjs() ที่มีอยู่แล้วใน
 *             words-data.js (คำที่ไม่อยู่ในลิสต์ล็อก เช่นคำใหม่ → ต่อท้ายตามลำดับเดิมในไฟล์)
 *   ประโยค  → ใช้ลำดับตามไฟล์เดิม adv-sentences.js ตรงๆ (Lin ยืนยัน 2026-08-02 — ยังไม่มี
 *             ระบบให้คะแนนความถี่ประโยคจริงจัง ใช้แบบเร็วก่อน)
 *
 * วิธีรัน (ในเครื่อง Lin เอง — ห้ามรันจาก CI/ที่ไหนที่ไม่ปลอดภัย เพราะต้องใช้ service_role key):
 *   export SUPABASE_URL="https://qzkxlhpcputsvbqmtqfi.supabase.co"
 *   export SUPABASE_SERVICE_ROLE_KEY="xxxxxxxx"   ← หาได้จาก Supabase Dashboard → Project Settings → API
 *   node scripts/migrate-game-content.js
 *
 * ⚠️ ห้ามใส่ SUPABASE_SERVICE_ROLE_KEY ลงไฟล์ไหนที่ commit เข้า git เด็ดขาด (ตั้งเป็น env ชั่วคราวเท่านั้น)
 * ⚠️ ต้องรัน supabase/sql/2026-08-02_game_content_schema.sql ให้ตารางมีอยู่ก่อน ไม่งั้นสคริปต์นี้ error
 * ปลอดภัยที่จะรันซ้ำ — เป็น upsert (ทับของเดิมด้วยค่าล่าสุด) + ลบแถวที่ไม่มีในไฟล์ต้นฉบับแล้วออกด้วย
 * ────────────────────────────────────────────────────────────
 */
'use strict';

const path = require('path');

// ── โหลดไฟล์ข้อมูล .js เดิม (ที่เขียนไว้สำหรับ browser: (function(global){...})(window)) ──
// ใช้ trick เดียวกับ data/check-data-health.js: ทำให้ Node มองว่า global === window
// (ไม่มี localStorage ใน Node → _looksLoggedInSync() คืน null เสมอ → ไฟล์จะ "ไม่ตัดเพดาน" ปล่อยชุดเต็มออกมา)
function loadBrowserDataFile(absPath) {
  global.window = global;
  delete require.cache[require.resolve(absPath)];
  require(absPath);
}

// ตัวจัดเรียงคำตามลำดับที่ล็อกไว้ (ก๊อปมาจาก buildCapOrderObjs() เดิมใน data/words-data.js
// ทุกตัวอักษร — ย้ายมาไว้ที่นี่ 2026-08-02 เพราะไฟล์ข้อมูลเลิกใช้ผลลัพธ์นี้เองแล้ว
// (เกมเลิกโหลดไฟล์นั้นตรงๆ) เหลือแค่สคริปต์นี้ที่ยังต้องคำนวณ rank จาก CAP_ORDER_TH_初/中)
function buildCapOrderObjs(fullList, thOrder) {
  var byTh = {};
  fullList.forEach(function (w) { if (byTh[w.word] === undefined) byTh[w.word] = w; });
  var used = {}, order = [];
  thOrder.forEach(function (th) {
    if (byTh[th] && !used[th]) { order.push(byTh[th]); used[th] = true; }
  });
  fullList.forEach(function (w) { if (!used[w.word]) { order.push(w); used[w.word] = true; } });
  return order;
}

function toWordRow(w, level, rank) {
  if (!w || !w.word) throw new Error('เจอคำที่ไม่มีฟิลด์ word ระดับ ' + level + ' อันดับ ' + rank);
  if (!w.syls) throw new Error('คำ "' + w.word + '" ไม่มี syls — ข้อมูลต้นฉบับผิดปกติ ห้าม migrate ต่อ');
  return {
    word: w.word,
    en: w.en !== undefined ? w.en : null,
    zh: w.zh !== undefined ? w.zh : null,
    level: level,
    category: w.category !== undefined ? w.category : null,
    syls: w.syls,
    reading_th: w.readingTH !== undefined ? w.readingTH : null,
    read_syls: w.readSyls !== undefined ? w.readSyls : null,
    rank: rank,
  };
}

function toSentRow(s, rank) {
  if (!s || !s.th) throw new Error('เจอประโยคที่ไม่มีฟิลด์ th อันดับ ' + rank);
  if (!s.words) throw new Error('ประโยค "' + s.th + '" ไม่มี words — ข้อมูลต้นฉบับผิดปกติ ห้าม migrate ต่อ');
  return {
    th: s.th,
    zh: s.zh !== undefined ? s.zh : null,
    reading_th: s.readingTH !== undefined ? s.readingTH : null,
    wc: s.wc !== undefined ? s.wc : null,
    polite_f: s.politeF !== undefined ? s.politeF : null,
    words: s.words,
    rank: rank,
  };
}

async function upsertRows(baseUrl, key, table, rows, conflictCols) {
  const CHUNK = 200;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const res = await fetch(baseUrl + '/rest/v1/' + table + '?on_conflict=' + encodeURIComponent(conflictCols), {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: 'Bearer ' + key,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(chunk),
    });
    if (!res.ok) {
      throw new Error('upsert ' + table + ' ล้มเหลว (HTTP ' + res.status + '): ' + (await res.text()));
    }
  }
}

// ลบแถวในตารางที่ "ไม่มีอยู่แล้ว" ในไฟล์ต้นฉบับปัจจุบัน (เช่น Lin ลบคำ/ประโยคทิ้งจากไฟล์)
async function pruneStale(baseUrl, key, table, currentRows, keyCols) {
  const selectCols = ['id'].concat(keyCols).join(',');
  const res = await fetch(baseUrl + '/rest/v1/' + table + '?select=' + selectCols, {
    headers: { apikey: key, Authorization: 'Bearer ' + key },
  });
  if (!res.ok) throw new Error('อ่าน ' + table + ' เพื่อหาแถวเก่าล้มเหลว (HTTP ' + res.status + '): ' + (await res.text()));
  const existing = await res.json();

  const keyOf = (obj) => keyCols.map((c) => String(obj[c])).join(' ');
  const currentKeySet = new Set(currentRows.map(keyOf));
  const staleIds = existing.filter((row) => !currentKeySet.has(keyOf(row))).map((row) => row.id);

  if (!staleIds.length) {
    console.log('  ' + table + ': ไม่มีแถวเก่าที่ต้องลบ');
    return;
  }
  const CHUNK = 200;
  for (let i = 0; i < staleIds.length; i += CHUNK) {
    const chunk = staleIds.slice(i, i + CHUNK);
    const res2 = await fetch(baseUrl + '/rest/v1/' + table + '?id=in.(' + chunk.join(',') + ')', {
      method: 'DELETE',
      headers: { apikey: key, Authorization: 'Bearer ' + key, Prefer: 'return=minimal' },
    });
    if (!res2.ok) throw new Error('ลบแถวเก่าใน ' + table + ' ล้มเหลว (HTTP ' + res2.status + '): ' + (await res2.text()));
  }
  console.log('  ' + table + ': ลบแถวเก่าออก ' + staleIds.length + ' แถว (ไม่มีอยู่แล้วในไฟล์ต้นฉบับปัจจุบัน)');
}

async function main() {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error('❌ ขาด env SUPABASE_URL หรือ SUPABASE_SERVICE_ROLE_KEY — ดูวิธีตั้งค่าที่หัวไฟล์นี้');
    process.exit(1);
  }

  loadBrowserDataFile(path.join(__dirname, '..', 'data', 'words-data.js'));
  const wordsFull = global.WORDS_MASTER_FULL || global.WORDS_MASTER;
  const capOrder初 = global.CAP_ORDER_TH_初;
  const capOrder中 = global.CAP_ORDER_TH_中;
  if (!Array.isArray(wordsFull) || !Array.isArray(capOrder初) || !Array.isArray(capOrder中)) {
    throw new Error('อ่าน WORDS_MASTER_FULL หรือ CAP_ORDER_TH_初/中 จาก words-data.js ไม่ได้ — โครงสร้างไฟล์อาจเปลี่ยนไป');
  }
  const words初Full = wordsFull.filter((w) => w.level === '初');
  const words中Full = wordsFull.filter((w) => w.level === '中');
  const order初 = buildCapOrderObjs(words初Full, capOrder初);
  const order中 = buildCapOrderObjs(words中Full, capOrder中);

  loadBrowserDataFile(path.join(__dirname, '..', 'data', 'adv-sentences.js'));
  const sentencesFull = global.ADV_SENTENCES_FULL || global.ADV_SENTENCES;
  if (!Array.isArray(sentencesFull)) {
    throw new Error('อ่าน ADV_SENTENCES จาก adv-sentences.js ไม่ได้ — โครงสร้างไฟล์อาจเปลี่ยนไป');
  }

  const wordRows = order初.map((w, i) => toWordRow(w, '初', i + 1))
    .concat(order中.map((w, i) => toWordRow(w, '中', i + 1)));
  const sentRows = sentencesFull.map((s, i) => toSentRow(s, i + 1));

  console.log('เตรียม migrate: คำ ' + wordRows.length + ' คำ (初 ' + order初.length + ' · 中 ' + order中.length + ') · ประโยค ' + sentRows.length + ' ประโยค');

  console.log('→ upsert game_words ...');
  await upsertRows(SUPABASE_URL, SERVICE_KEY, 'game_words', wordRows, 'word,level');
  console.log('→ เช็คแถวเก่าใน game_words ...');
  await pruneStale(SUPABASE_URL, SERVICE_KEY, 'game_words', wordRows, ['word', 'level']);

  console.log('→ upsert game_sentences ...');
  await upsertRows(SUPABASE_URL, SERVICE_KEY, 'game_sentences', sentRows, 'th');
  console.log('→ เช็คแถวเก่าใน game_sentences ...');
  await pruneStale(SUPABASE_URL, SERVICE_KEY, 'game_sentences', sentRows, ['th']);

  console.log('✅ เสร็จแล้ว — game_words ' + wordRows.length + ' แถว · game_sentences ' + sentRows.length + ' แถว');
}

main().catch((err) => {
  console.error('❌ migrate ล้มเหลว:', err.message || err);
  process.exit(1);
});
