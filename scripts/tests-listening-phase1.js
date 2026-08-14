#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.resolve(__dirname, '..');
const typingScore = fs.readFileSync(path.join(root, 'js/games/typing-score.js'), 'utf8');
const listeningScore = fs.readFileSync(path.join(root, 'js/games/listening-score.js'), 'utf8');
const app = fs.readFileSync(path.join(root, 'js/games/listening-game-app.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'listening-game.html'), 'utf8');
const edge = fs.readFileSync(path.join(root, 'supabase/functions/tone-round/index.ts'), 'utf8');
const auth = fs.readFileSync(path.join(root, 'js/games/reading-auth.js'), 'utf8');

const sandbox = { window: {} };
vm.runInNewContext(typingScore, sandbox, { filename: 'typing-score.js' });
vm.runInNewContext(listeningScore, sandbox, { filename: 'listening-score.js' });
const score = sandbox.window.LISTENING_SCORE;

let passes = 0;
const failures = [];
function check(label, condition) {
  if (condition) { passes++; console.log('✓ ' + label); }
  else failures.push(label);
}
function values(mode, text, max) {
  const result = [];
  for (let i = 1; i <= max; i++) result.push(score.primary(mode, text, i));
  return result.join(',');
}

check('選擇答案 scoring = 5,5,3,2,1,0', values('mc', 'กิน', 6) === '5,5,3,2,1,0');
check('輸入 1–2 คำ scoring = 10,10,7,4,1,0', values('type', 'กิน ข้าว', 6) === '10,10,7,4,1,0');
check('輸入 3+ คำ scoring = 10,10,10,7,4,1,0', values('type', 'ฉัน กิน ข้าว', 7) === '10,10,10,7,4,1,0');
check('Typing Bonus เรียกสูตร 無提示 ชุดเดียว', score.typingBonus({ th: 'กิน', readingTH: 'กิน' }, 4) === sandbox.window.TYPING_SCORE.score(1, 4));
check('Typing Bonus 0 แล้วยังอยู่ branch ให้พิมพ์ต่อ', /if \(!isCorrect\) \{[\s\S]*state\.typingWrong\+\+[\s\S]*繼續輸入到正確為止/.test(app));
check('Listening score 0 จบ attempt และ requeue', /finishListeningAtZero\(w\)/.test(app) && /state\.round\.push\(w\)/.test(app));
check('mode ถูกล็อกตลอดรอบ', /if \(state\.roundActive && mode !== state\.mode\)/.test(app));
check('audio fail ไม่หักจำนวนครั้งฟัง', /if \(!ok\) \{[\s\S]*state\.listenCount = Math\.max\(0, state\.listenCount - 1\)/.test(app));
check('Listening Score และ Typing Bonus เก็บแยกใน evidence', /listening_score: entry\.listeningScore/.test(app) && /typing_bonus: entry\.typingBonus/.test(app));
check('จบรอบบันทึก account session เป็น game=listening', /READING_AUTH\.saveScore\(state\.primaryTotal \+ state\.typingBonusTotal, 1, 'listening'/.test(app));
check('reading-auth รองรับ route/game listening', /listening-game/.test(auth) && /game === 'listening'/.test(auth));
check('Listening โหลด auth/server/shared score ก่อน app boot', /reading-auth\.js\?v=/.test(html) && /tone-server\.js\?v=/.test(html) && /typing-score\.js\?v=1/.test(html) && /listening-score\.js\?v=1/.test(html));
check('Listening มี 玩法 ที่เปิดดูซ้ำได้และอธิบายกติกา 0 แยกสอง score', /id="lg-howto-modal"/.test(html) && /📖 玩法/.test(html) && /打字加分降到 0/.test(html) && /聽力分數降到 0/.test(html));
check('Edge แยก SRS game=listening', /"reading", "listening", "typing"/.test(edge));
check('item ใหม่ต่ำกว่า 10 ไม่สร้าง SRS', /below_entry_score/.test(edge));

if (failures.length) {
  console.error('\n❌ Listening Phase 1 ไม่ผ่าน ' + failures.length + ' ข้อ:');
  failures.forEach(function (failure) { console.error('- ' + failure); });
  process.exit(1);
}
console.log('\n✅ Listening Phase 1 ผ่านครบ ' + passes + ' ข้อ');
