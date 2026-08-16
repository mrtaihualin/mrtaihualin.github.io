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
const board = fs.readFileSync(path.join(root, 'listening-board.html'), 'utf8');
const boardClient = fs.readFileSync(path.join(root, 'js/score/reading-leaderboard.js'), 'utf8');
const boardSql = fs.readFileSync(path.join(root, 'supabase/sql/2026-08-14_core5_leaderboard_contract.sql'), 'utf8');

const sandbox = { window: {} };
vm.runInNewContext(typingScore, sandbox, { filename: 'typing-score.js' });
vm.runInNewContext(listeningScore, sandbox, { filename: 'listening-score.js' });
const score = sandbox.window.LISTENING_SCORE;

const raceGuardMatch = app.match(/\/\/ ===== LISTENING_SRS_RACE_GUARD_START =====\n([\s\S]*?)\/\/ ===== LISTENING_SRS_RACE_GUARD_END =====/);
if (!raceGuardMatch) throw new Error('Listening SRS race guard source not found');
const raceSandbox = {};
vm.runInNewContext(raceGuardMatch[1] + '\nthis.createGuard = createListeningSrsRaceGuard;', raceSandbox, {
  filename: 'listening-srs-race-guard.js'
});
const createGuard = raceSandbox.createGuard;

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
check('reading-auth รองรับ route/game listening', /listening-game/.test(auth) && /'listening'/.test(auth) && /score-submit/.test(auth));
check('Listening โหลด auth/server/shared score ก่อน app boot', /reading-auth\.js\?v=/.test(html) && /tone-server\.js\?v=/.test(html) && /typing-score\.js\?v=1/.test(html) && /listening-score\.js\?v=1/.test(html));
check('Listening มี 玩法 ที่เปิดดูซ้ำได้และอธิบายกติกา 0 แยกสอง score', /id="lg-howto-modal"/.test(html) && /📖 玩法/.test(html) && /打字加分降到 0/.test(html) && /聽力分數降到 0/.test(html));
check('Edge แยก SRS game=listening', /"reading", "listening", "typing"/.test(edge));
check('item ใหม่ต่ำกว่า 10 ไม่สร้าง SRS', /below_entry_score/.test(edge));
check('tone-round rate-limit fail-closed ก่อนเขียน SRS', /if \(rlErr\) return json\(\{ error: "rate_limit_unavailable" \}, 503\)/.test(edge));
check('Listening อ่าน SRS ของ game=listening กลับจาก server', /from\('tone_srs_state'\)[\s\S]*\.eq\('game', 'listening'\)/.test(app));
check('Listening SRS query ผูก captured owner เป็น defense-in-depth', /\.eq\('game', 'listening'\)\s*\.eq\('user_id', owner\.uid\)/.test(app) && /options\.load\(owner\)/.test(app));
check('Listening แยก Due/mastered และจัดรอบ Free 20%', /isSrsDue/.test(app) && /!\(rec && rec\.mastered\)/.test(app) && /tier: 'free'/.test(app) && /GameFlow\.allocateSrs/.test(app));
check('Listening SRS read ใช้ NetworkGuard แบบ bounded และไม่ retry blind', /NetworkGuard\.request\([\s\S]*'listening-srs', \{\}, 10000, null\)/.test(app));
check('Listening start fallback สูงสุด 1500ms และ cache version ตรง v10', /options\.delay\(1500\)/.test(app) && /listening-game-app\.js\?v=10/.test(html));
check('Listening มี leaderboard ของตัวเองและ auth ชี้ถูกหน้า', /READING_BOARD_GAME = 'listening'/.test(board) && /listening-board\.html/.test(auth));
check('Leaderboard client รองรับ game=listening', /READING_BOARD_GAME === 'listening'/.test(boardClient) && /listening-game\.html/.test(boardClient));
check('Core 5 SQL contract รองรับ Listening และ weekly เริ่มวันจันทร์ Taipei', /'reading', 'listening', 'typing', 'word_order'/.test(boardSql) && /date_trunc\('week', timezone\('Asia\/Taipei'/.test(boardSql));

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise(function (res, rej) { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function raceHarness() {
  let owner = { uid: 'user-a', epoch: 1 };
  let synced = false;
  let roundActive = false;
  const loads = [];
  const delays = [];
  const applied = [];
  const guard = createGuard({
    owner: function () { return { uid: owner.uid, epoch: owner.epoch }; },
    isSynced: function () { return synced; },
    setSynced: function (value) { synced = !!value; },
    isRoundActive: function () { return roundActive; },
    load: function (requestOwner) { const d = deferred(); d.owner = requestOwner; loads.push(d); return d.promise; },
    apply: function (rows) { applied.push(rows); },
    delay: function (ms) { const d = deferred(); d.ms = ms; delays.push(d); return d.promise; }
  });
  return {
    guard,
    loads,
    delays,
    applied,
    owner: function (uid, epoch) { owner = { uid, epoch }; },
    synced: function () { return synced; },
    setRoundActive: function (value) { roundActive = !!value; }
  };
}

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

async function runRaceTests() {
  {
    const h = raceHarness();
    let starts = 0;
    const pending = h.guard.start(function () { starts++; });
    await flush();
    h.delays[0].resolve();
    await pending;
    check('SRS request ค้างไม่ทำให้ Start dead-end หลัง 1500ms', starts === 1 && h.delays[0].ms === 1500);
  }

  {
    const h = raceHarness();
    let starts = 0;
    const pending = h.guard.start(function () { starts++; });
    await flush();
    h.owner('user-b', 2);
    h.guard.reset();
    h.loads[0].resolve({ data: [{ word: 'ของ A' }] });
    h.delays[0].resolve();
    await pending;
    await flush();
    check('response/callback ของ owner เดิมถูกทิ้งหลัง A→B', starts === 0 && h.applied.length === 0 && !h.synced());
  }

  {
    const h = raceHarness();
    const pending = h.guard.sync(true);
    h.owner('user-b', 2); // เปลี่ยนก่อน deferred load factory ได้รัน
    await flush();
    h.loads[0].resolve({ data: [{ word: 'ของ A' }] });
    await pending;
    check('deferred load รับ captured owner เดิมและไม่ apply หลัง session เปลี่ยน', h.loads[0].owner.uid === 'user-a' && h.loads[0].owner.epoch === 1 && h.applied.length === 0);
  }

  {
    const h = raceHarness();
    let starts = 0;
    const pending = h.guard.start(function () { starts++; });
    await flush();
    h.owner('user-b', 2); // จำลอง auth event delivery ช้าจึงยังไม่ได้ reset guard
    h.delays[0].resolve();
    await pending;
    check('finish ตรวจ owner ซ้ำและไม่เริ่ม stale round แม้ auth reset มาช้า', starts === 0);
  }

  {
    const h = raceHarness();
    const oldSession = h.guard.sync(true);
    await flush();
    h.owner('user-a', 2);
    h.guard.reset();
    h.loads[0].resolve({ data: [{ word: 'session เก่า' }] });
    await oldSession;
    check('owner epoch ใหม่ของ user id เดิมทิ้ง response session เก่า', h.applied.length === 0 && !h.synced());
  }

  {
    const h = raceHarness();
    let starts = 0;
    const pending = h.guard.start(function () { starts++; });
    await flush();
    h.owner('', 2);
    h.guard.reset();
    h.loads[0].resolve({ data: [{ word: 'ก่อน logout' }] });
    h.delays[0].resolve();
    await pending;
    check('logout ระหว่างรอทิ้ง response และ stale start callback', starts === 0 && h.applied.length === 0 && !h.synced());
  }

  {
    const h = raceHarness();
    const a = h.guard.sync(true);
    await flush();
    h.owner('user-b', 2);
    h.guard.reset();
    const b = h.guard.sync(true);
    await flush();
    h.loads[0].resolve({ data: [{ word: 'ของ A' }] });
    await a;
    const sameB = h.guard.sync(true);
    check('late A ไม่ล้าง request B ที่กำลังทำงาน', sameB === b && h.loads.length === 2);
    h.loads[1].resolve({ data: [{ word: 'ของ B' }] });
    await b;
    check('request B ยัง apply หลัง late A', h.applied.length === 1 && h.applied[0][0].word === 'ของ B' && h.synced());
  }

  {
    const h = raceHarness();
    let starts = 0;
    const one = h.guard.start(function () { starts++; h.setRoundActive(true); });
    const two = h.guard.start(function () { starts++; });
    await flush();
    h.loads[0].resolve({ data: [] });
    await Promise.all([one, two]);
    check('double click เริ่มรอบเพียงครั้งเดียว', starts === 1 && h.loads.length === 1);
  }

  {
    const h = raceHarness();
    let appliedAtStart = -1;
    const pending = h.guard.start(function () { appliedAtStart = h.applied.length; });
    await flush();
    h.loads[0].resolve({ data: [{ word: 'due' }] });
    await pending;
    check('response ก่อน 1500ms ใช้จัดรอบแรกได้', appliedAtStart === 1 && h.synced());
  }

  {
    const h = raceHarness();
    let starts = 0;
    const pending = h.guard.start(function () { starts++; });
    await flush();
    h.delays[0].resolve();
    await pending;
    const appliedAtStart = h.applied.length;
    h.loads[0].resolve({ data: [{ word: 'future due' }] });
    await flush();
    check('late same-owner เติมเฉพาะรอบถัดไปและไม่ start ซ้ำ', starts === 1 && appliedAtStart === 0 && h.applied.length === 1);
  }

  {
    const h = raceHarness();
    let starts = 0;
    const pending = h.guard.start(function () { starts++; });
    await flush();
    h.loads[0].reject(new Error('NETWORK_TIMEOUT'));
    await pending;
    check('timeout/rejection fallback โดยไม่ตั้ง false synced', starts === 1 && !h.synced());
    const retry = h.guard.sync(true);
    await flush();
    h.loads[1].resolve({ data: [{ word: 'retry due' }] });
    await retry;
    check('explicit retry หลัง failure ทำงานและ apply ได้', h.loads.length === 2 && h.synced() && h.applied.length === 1);
  }
}

runRaceTests().then(function () {
  if (failures.length) {
    console.error('\n❌ Listening Phase 1 ไม่ผ่าน ' + failures.length + ' ข้อ:');
    failures.forEach(function (failure) { console.error('- ' + failure); });
    process.exit(1);
  }
  console.log('\n✅ Listening Phase 1 ผ่านครบ ' + passes + ' ข้อ');
}).catch(function (error) {
  console.error(error && error.stack || error);
  process.exit(1);
});
