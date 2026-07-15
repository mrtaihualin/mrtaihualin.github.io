/**
 * regression-check-tone.js — ตรวจครั้งเดียว: เครื่องคิดวรรณยุกต์ (ที่แก้บั๊กแล้ว) เทียบกับคำตอบที่ Lin พิมพ์ไว้
 * ใช้ครั้งเดียว ไม่ใช่ระบบถาวร (System 1 ตาม _แผนงาน/2026-07-13_ออกแบบ2ระบบ...)
 *
 * วิธีรัน: node data/regression-check-tone.js
 * ผลลัพธ์: เขียนไฟล์ data/tone-regression-report.json (schema เดียวกับที่ review-tool.html อ่าน —
 *          ดูรายละเอียด schema ที่คอมเมนต์บนสุดของ data/review-tool.html)
 *
 * เช็คทุกพยางค์ใน:
 *   - data/words-data.js (WORDS_MASTER, 288 คำ, รวม schema แล้ว — ทุกคำมี syls)
 *   - data/adv-sentences.js (ADV_SENTENCES, 10 ประโยค, มี syls อยู่แล้วเดิม)
 */
global.window = global;
require('./words-data.js');
require('./adv-sentences.js');
require('./tone-engine.js');

const W = global.WORDS_MASTER;
const S = global.ADV_SENTENCES;
const analyzeSyllable = global.analyzeSyllable;

const entries = [];

// ── words-data.js ──
W.forEach(function (w) {
  const syllables = (w.syls || []).map(function (syl) {
    const a = analyzeSyllable(syl);
    return {
      th: a.th, lead: a.lead, cons: a.cons, fullSpelling: a.fullSpelling,
      expectedToneName: a.expectedName, computedToneName: a.computedName, match: a.match,
      cls: a.cls, clsZh: a.clsZh, mark: a.mark, markName: a.markName, live: a.live, vowelType: a.vowelType,
      initChar: a.initChar, reason: a.reason
    };
  });
  const allMatch = syllables.every(function (s) { return s.match === true; });
  entries.push({
    id: 'catalog:' + w.word,
    word: w.word, readingTH: w.readingTH !== undefined ? w.readingTH : w.word,
    zh: w.zh, en: w.en, level: w.level, category: w.category,
    sourceFile: 'words-data.js',
    status: allMatch ? 'match' : 'mismatch',
    syllables: syllables,
    notes: ''
  });
});

// ── adv-sentences.js ──
S.forEach(function (s, si) {
  let flatSyls = [];
  s.words.forEach(function (w) { flatSyls = flatSyls.concat(w.syls); });
  const syllables = flatSyls.map(function (syl) {
    const a = analyzeSyllable(syl);
    return {
      th: a.th, lead: a.lead, cons: a.cons, fullSpelling: a.fullSpelling,
      expectedToneName: a.expectedName, computedToneName: a.computedName, match: a.match,
      cls: a.cls, clsZh: a.clsZh, mark: a.mark, markName: a.markName, live: a.live, vowelType: a.vowelType,
      initChar: a.initChar, reason: a.reason
    };
  });
  const allMatch = syllables.every(function (sy) { return sy.match === true; });
  entries.push({
    id: 'sentence:' + si,
    word: s.th, readingTH: flatSyls.map(function (sy) { return sy.th; }).join('-'),
    zh: s.zh, en: flatSyls.map(function (sy) { return sy.en; }).join('-'), level: '高', category: 'ประโยค高級',
    sourceFile: 'adv-sentences.js',
    status: allMatch ? 'match' : 'mismatch',
    syllables: syllables,
    notes: ''
  });
});

const mismatchCount = entries.filter(function (e) { return e.status === 'mismatch'; }).length;
const totalSyls = entries.reduce(function (n, e) { return n + e.syllables.length; }, 0);
const mismatchSyls = entries.reduce(function (n, e) { return n + e.syllables.filter(function (s) { return s.match === false; }).length; }, 0);

const report = {
  schemaVersion: 1,
  mode: 'catalog-audit',
  generatedAt: new Date().toISOString(),
  summary: {
    totalEntries: entries.length, mismatchEntries: mismatchCount,
    totalSyllables: totalSyls, mismatchSyllables: mismatchSyls
  },
  entries: entries
};

const fs = require('fs');
fs.writeFileSync(__dirname + '/tone-regression-report.json', JSON.stringify(report, null, 2), 'utf8');

console.log('เช็คแล้ว ' + entries.length + ' คำ/ประโยค (' + totalSyls + ' พยางค์)');
console.log('ไม่ตรง: ' + mismatchCount + ' คำ/ประโยค (' + mismatchSyls + ' พยางค์)');
console.log('เขียนรายงานที่ data/tone-regression-report.json — เปิดดูรายละเอียดได้ที่ data/review-tool.html');
if (mismatchCount > 0) {
  console.log('\nรายการที่ไม่ตรง:');
  entries.filter(function (e) { return e.status === 'mismatch'; }).forEach(function (e) {
    e.syllables.filter(function (s) { return s.match === false; }).forEach(function (s) {
      console.log('  - ' + e.word + ' [' + s.th + '] Lin พิมพ์=' + s.expectedToneName + ' เครื่องคิดได้=' + (s.computedToneName || '(คำนวณไม่ได้)'));
    });
  });
}
