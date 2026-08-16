#!/usr/bin/env node
'use strict';

// Runs the real SRS engine bundled in the local Edge Function. No network/SQL.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const edge = fs.readFileSync(path.join(root, 'supabase/functions/tone-round/index.ts'), 'utf8');
const atomicSql = fs.readFileSync(path.join(root, 'supabase/sql/2026-08-16_phase1_tone_round_atomic.sql'), 'utf8');
const start = edge.indexOf('var TF_SRS_CFG =');
const end = edge.indexOf('/* ===== scoreEngine ===== */');
if (start < 0 || end < 0) throw new Error('หา SRS engine ใน tone-round ไม่พบ');
const sandbox = { Date, Intl, console };
vm.runInNewContext(edge.slice(start, end) + '\nthis.__SRS = TF_SRS;', sandbox, { filename: 'tone-round-srs.js' });
const SRS = sandbox.__SRS;

let passes = 0;
const failures = [];
function check(label, condition) {
  if (condition) { passes++; console.log('✓ ' + label); }
  else failures.push(label);
}

const day0 = Date.UTC(2026, 7, 13, 4, 0, 0);
let tone = SRS.blank();
check('New เริ่ม stage 0 และ due ทันที', tone.stage === 0 && SRS.isDue(tone, day0));
let first = SRS.advanceOnClean(tone, day0);
tone = first.rec;
check('New ผ่านแล้วนัด Day 1', tone.stage === 1 && tone.dueDate === SRS.twDatePlusDays(day0, 1) && !tone.mastered);
check('retry วันเดิมไม่ผ่าน due gate จึงไม่เลื่อนซ้ำ', SRS.isDue(tone, day0) === false && tone.stage === 1);

const day1 = day0 + 86400000;
check('Day 1 ถึงกำหนด', SRS.isDue(tone, day1));
let second = SRS.advanceOnClean(tone, day1);
tone = second.rec;
check('Day 1 ผ่านแล้วนัด Day 7', tone.stage === 2 && tone.dueDate === SRS.twDatePlusDays(day1, 7) && !tone.mastered);
check('ก่อน Day 7 ไม่เลื่อน', SRS.isDue(tone, day1 + 6 * 86400000) === false);

const day7 = day1 + 7 * 86400000;
let third = SRS.advanceOnClean(tone, day7);
tone = third.rec;
check('รอบ Day 7 ผ่านแล้ว Mastered ทันที', third.justMastered === true && tone.mastered === true && tone.stage === 3);
check('Mastered ไม่กลับเข้า due queue', SRS.isDue(tone, day7 + 100 * 86400000) === false);

let reading = SRS.advanceOnClean(SRS.blank(), day0).rec;
let listening = SRS.blank();
check('แต่ละ skill/game มี state อิสระ', reading.stage === 1 && listening.stage === 0);
listening = SRS.resetOnFail(listening);
check('Fail รีเซ็ตที่ skill ต้นทางเท่านั้น', listening.stage === 0 && listening.everFailed === true && reading.stage === 1);

check('Edge มี isDue gate ก่อนเขียน state', /if \(!TF_SRS\.isDue\(rec, nowMs\)\) return reject\('not_due'/.test(edge));
check('Edge กัน concurrent duplicate ด้วย transactional owner lock + expected snapshot',
  /phase1_tone_round_commit/.test(edge) && /pg_advisory_xact_lock/.test(atomicSql) &&
  /v_state\.stage is distinct from p_expected_stage/.test(atomicSql) && /'race_retry'/.test(atomicSql));
check('Edge กัน retry หลัง Mastered', /if \(rec\.mastered\) return reject\('already_mastered'/.test(edge));
check('คะแนนต่ำกว่า 10 ของ item ใหม่ไม่สร้าง SRS row', /if \(!hadSrsRecord\) return reject\('below_entry_score'/.test(edge));
check('Edge รองรับ Listening เป็น skill แยก', /"reading", "listening", "typing"/.test(edge));

const sources = [
  'js/games/tone-finder-game.js', 'js/games/reading-game-app.js',
  'js/games/typing-game-app.js', 'js/games/word-order-app.js'
].map(function (file) { return fs.readFileSync(path.join(root, file), 'utf8'); });
check('client และ Edge ใช้ interval Phase 1 [1,7]', /INTERVALS:\s*\[1,\s*7\]/.test(edge) && sources.every(function (src) { return /INTERVALS:\s*\[1,\s*7\]/.test(src); }));
check('ไม่มี Day 16 ค้างใน SRS source ปัจจุบัน', !/day\s*16|Day\s*16|วันที่16/i.test(edge + sources.join('\n')));

if (failures.length) {
  console.error('\n❌ Phase 1 SRS ไม่ผ่าน ' + failures.length + ' ข้อ:');
  failures.forEach(function (failure) { console.error('- ' + failure); });
  process.exit(1);
}
console.log('\n✅ Phase 1 SRS ผ่านครบ ' + passes + ' ข้อ');
