/**
 * check-duplicate-words.js — เช็คคำซ้ำในคลังคำ (ระบบถาวร ไม่ใช่ one-time เหมือน regression-check-tone.js)
 * Lin สั่ง 2026-07-15: "ต้องมีระบบเช็กไม่ให้คำศัพท์ในเกมซ้ำ เก่าใหม่ต้องเช็กหมด"
 *
 * ใช้ 2 แบบ:
 *
 * แบบที่ 1 — เช็คคลังเดิมเอง (audit): เช็คว่า data/words-data.js เองมีคำซ้ำกันไหม (เผื่อมีคนพิมพ์คำเดิมซ้ำ 2 ที่)
 *   วิธีรัน: node data/check-duplicate-words.js
 *
 * แบบที่ 2 — เช็คคำร่างใหม่ (System 2 ก่อน Step D "เสนอ Lin"): เช็คว่าคำที่ AI ร่างมาใหม่
 *   ไปซ้ำกับคำที่มีอยู่แล้วในคลังไหม ก่อนเอาไปโชว์ Lin
 *   วิธีรัน: node data/check-duplicate-words.js path/to/ai-draft.json
 *   (ไฟล์ต้องเป็น schema เดียวกับ review-tool.html mode:"ai-draft" — อ่านฟิลด์ entries[].word)
 *
 * เช็คคำซ้ำ 2 ระดับ:
 *   (a) ตัวสะกดเป๊ะ (exact match) — คำเดียวกันเป๊ะ
 *   (b) ตัวสะกดเหมือนกันแต่เขียน "level" หรือ "category" ต่างกัน (ซ้ำแบบมีความคลาดเคลื่อนที่ต้องดูด้วยตา)
 * ไม่เช็ค "ความหมายซ้ำ" (คำต่างกันแต่แปลเหมือนกัน) — อันนั้นต้อง Lin ดูเองหรือให้ AI ช่วยอ่านตอน Step B/C
 */
global.window = global;
require('./words-data.js');
const fs = require('fs');
const path = require('path');

const W = global.WORDS_MASTER;

function buildCatalogIndex(list) {
  const byWord = new Map();
  list.forEach(function (w) {
    if (!byWord.has(w.word)) byWord.set(w.word, []);
    byWord.get(w.word).push(w);
  });
  return byWord;
}

function auditCatalogSelf() {
  const idx = buildCatalogIndex(W);
  const dupes = [];
  idx.forEach(function (entries, word) {
    if (entries.length > 1) dupes.push({ word: word, count: entries.length, entries: entries });
  });
  console.log('เช็คคำซ้ำในคลังเดิม (' + W.length + ' คำ) ...');
  if (dupes.length === 0) {
    console.log('✓ ไม่มีคำซ้ำในคลังเลย (' + W.length + ' คำ ทุกคำไม่ซ้ำกัน)');
  } else {
    console.log('⚠ พบคำซ้ำ ' + dupes.length + ' คำ:');
    dupes.forEach(function (d) {
      console.log('  - "' + d.word + '" ปรากฏ ' + d.count + ' ครั้ง (level: ' +
        d.entries.map(function (e) { return e.level + '/' + e.category; }).join(', ') + ')');
    });
  }
  return dupes;
}

function checkCandidatesAgainstCatalog(candidateFile) {
  const idx = buildCatalogIndex(W);
  const raw = JSON.parse(fs.readFileSync(candidateFile, 'utf8'));
  const candidates = raw.entries || [];
  console.log('เช็คคำร่างใหม่ ' + candidates.length + ' คำ กับคลังเดิม ' + W.length + ' คำ ...');
  const flagged = [];
  candidates.forEach(function (c) {
    if (idx.has(c.word)) {
      const existing = idx.get(c.word)[0];
      flagged.push({ word: c.word, existingLevel: existing.level, existingCategory: existing.category });
    }
  });
  if (flagged.length === 0) {
    console.log('✓ ไม่มีคำไหนซ้ำกับคลังเดิมเลย — ร่างทั้งหมดปลอดภัยเอาไปเสนอ Lin ได้');
  } else {
    console.log('⚠ พบคำที่ซ้ำกับคลังเดิม ' + flagged.length + ' คำ (ต้องตัดออกหรือถาม Lin ก่อนเสนอ):');
    flagged.forEach(function (f) {
      console.log('  - "' + f.word + '" มีอยู่แล้วใน คลังเดิม (level: ' + f.existingLevel + ', หมวด: ' + f.existingCategory + ')');
    });
  }
  return flagged;
}

// ── main ──
const arg = process.argv[2];
if (arg) {
  const filePath = path.resolve(process.cwd(), arg);
  checkCandidatesAgainstCatalog(filePath);
} else {
  auditCatalogSelf();
}
