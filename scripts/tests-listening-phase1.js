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

const reviewPolicyMatch = app.match(/\/\/ ===== LISTENING_SRS_DUE_POLICY_START =====\n([\s\S]*?)\/\/ ===== LISTENING_SRS_DUE_POLICY_END =====/);
if (!reviewPolicyMatch) throw new Error('Listening SRS Due policy source not found');
const reviewSandbox = {};
vm.runInNewContext(reviewPolicyMatch[1] + '\nthis.createPolicy = createListeningSrsDuePolicy;', reviewSandbox, {
  filename: 'listening-review-policy.js'
});
const createReviewPolicy = reviewSandbox.createPolicy;

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
function appFunction(name, nextName) {
  const start = app.indexOf(`function ${name}(`);
  const end = app.indexOf(`function ${nextName}(`, start + 1);
  if (start < 0 || end <= start) return '';
  return app.slice(start, end);
}

check('選擇答案 scoring = 5,5,3,2,1,0', values('mc', 'กิน', 6) === '5,5,3,2,1,0');
check('輸入 1–2 คำ scoring = 10,10,7,4,1,0', values('type', 'กิน ข้าว', 6) === '10,10,7,4,1,0');
check('輸入 3+ คำ scoring = 10,10,10,7,4,1,0', values('type', 'ฉัน กิน ข้าว', 7) === '10,10,10,7,4,1,0');
check('Typing Bonus เรียกสูตร 無提示 ชุดเดียว', score.typingBonus({ th: 'กิน', readingTH: 'กิน' }, 4) === sandbox.window.TYPING_SCORE.score(1, 4));
check('Typing Bonus 0 แล้วยังอยู่ branch ให้พิมพ์ต่อ', /if \(!isCorrect\) \{[\s\S]*state\.typingWrong\+\+[\s\S]*繼續輸入到正確為止/.test(app));
check('Listening score 0 จบ attempt และ requeue เฉพาะ item ที่ไม่ใช่ Due',
  /finishListeningAtZero\(w\)/.test(app) && /listeningSrsDuePolicy\.shouldRequeue\(w,\s*detail\.requeue\)/.test(app) && /LearningReview\.shouldRetry/.test(app));
check('active Typed→Choice keeps the question and clears only typed interaction state',
  /if \(state\.mode === 'type' && mode === 'mc'\) \{[\s\S]*switchTypedQuestionToChoice\(\)/.test(app) &&
  /state\.typingWrong = 0;[\s\S]*state\.itemAttempts = \[\];[\s\S]*el\.typeInput\.value = '';[\s\S]*renderMC\(currentWord\(\)\)/.test(appFunction('switchTypedQuestionToChoice', 'setMode')) &&
  /state\.typingResetToken\+\+/.test(appFunction('switchTypedQuestionToChoice', 'setMode')) &&
  /resetToken !== state\.typingResetToken/.test(appFunction('submitTypeAnswer', 'renderReveal')) &&
  !/state\.listenCount\s*=/.test(appFunction('switchTypedQuestionToChoice', 'setMode')));
check('active Choice→Typed is rejected without changing the current mode',
  /if \(state\.mode === 'mc' && mode === 'type'\) \{[\s\S]*return false;/.test(app));
check('answered question requires a fresh next mode and applies it only in goNext',
  /state\.nextMode = null;[\s\S]*el\.nextBtn\.disabled = hasNextQuestion/.test(app) &&
  /if \(state\.answered\) \{[\s\S]*state\.nextMode = mode;[\s\S]*el\.nextBtn\.disabled = false/.test(app) &&
  /if \(!state\.nextMode\) return;[\s\S]*state\.mode = state\.nextMode/.test(app));
check('submitted item records the actual immutable mode before next-mode selection',
  /state\.log\.push\(\{[\s\S]*mode: state\.mode/.test(app) &&
  /state\.nextMode = mode;[\s\S]*saveResumeState\(\)/.test(app));
check('resume keeps or requests the fresh next-question mode',
  /nextMode: state\.nextMode/.test(app) && /awaitModeSelection: !!saved\.answered/.test(app) &&
  /else if \(pend\.awaitModeSelection\) showModeSelectionForCurrent\(\)/.test(app));
check('mobile software keyboard closes whenever Listening no longer needs typed input',
  /function closeTypeKeyboard\(\) \{[\s\S]*el\.typeInput\.blur\(\)/.test(app) &&
  /function switchTypedQuestionToChoice\(\) \{[\s\S]*closeTypeKeyboard\(\)/.test(app) &&
  /function finishAnswer\([\s\S]*closeTypeKeyboard\(\)/.test(app) &&
  /function showModeSelectionForCurrent\(\) \{[\s\S]*closeTypeKeyboard\(\)/.test(app) &&
  /function showQuestion\([\s\S]*state\.mode === 'mc'\) \{[\s\S]*closeTypeKeyboard\(\)/.test(app) &&
  /closest\('#lg-word-ctl-row, #lg-howto-btn'\)/.test(app) &&
  !/#wm-trigger/.test(app));
check('level selector uses only playable audio and keeps Advanced visibly locked',
  /function buildPlayablePool\(\) \{[\s\S]*window\.WordAudio\.has\(w\.th\)/.test(app) &&
  /function buildPool\(level\) \{[\s\S]*w\.level === level/.test(app) &&
  /data-level="高"[^>]+disabled[^>]+aria-disabled="true"/.test(html));
check('Listening keeps Level Row 1 separate from status Row 2 on Portrait/Desktop DOM',
  html.indexOf('id="lg-level-tabs"') < html.indexOf('id="lg-game"') &&
  /id="lg-level-tabs"[\s\S]*data-level="初"[\s\S]*data-level="中"[\s\S]*data-level="高"/.test(html) &&
  /第 <span id="lg-qn">1<\/span> \/ <span id="lg-qt">10<\/span> 字/.test(html) &&
  /🏆 <span id="lg-score">0<\/span> คะแนน/.test(html) &&
  !/<div class="top-bar[^>]*">[\s\S]*data-level=/.test(html.slice(html.indexOf('id="lg-game"'), html.indexOf('<!-- END SCREEN -->'))));
check('level identity survives round, report and Resume without mixed-pool fallback',
  /level: state\.level/.test(app) &&
  /difficulty: state\.level/.test(app) &&
  /state\.level = pend\.level;[\s\S]*state\.pool = buildPool\(state\.level\)/.test(app) &&
  /legacyLevels\.length === 1/.test(app));
check('audio failure alone shows the locked skip recovery and successful retry clears it',
  /if \(!ok\) \{[\s\S]*state\.listenCount = Math\.max\(0, state\.listenCount - 1\)[\s\S]*音檔暫時無法播放，請點「跳過此題」[\s\S]*el\.skipBtn\.style\.display = 'inline-flex'/.test(app) &&
  /if \(state\.audioFailed\) \{[\s\S]*state\.audioFailed = false;[\s\S]*el\.resultBanner\.textContent = '';[\s\S]*el\.skipBtn\.style\.display = 'none'/.test(app));
check('skip advances with no score, penalty, wrong or attempt mutation',
  /state\.itemAttempts = \[\];[\s\S]*skipped: true[\s\S]*listeningScore: 0, typingBonus: 0, totalScore: 0/.test(appFunction('skipCurrentQuestion', 'renderMC')) &&
  !/state\.(correct|wrong|primaryTotal|typingBonusTotal)\+\+/.test(appFunction('skipCurrentQuestion', 'renderMC')) &&
  !/finishAnswer\(|claimAttempt\(|sendListeningSrs\(/.test(appFunction('skipCurrentQuestion', 'renderMC')) &&
  /entry\.correct \|\| entry\.skipped \? 0 : 1/.test(app) &&
  /id="lg-skip-btn"[^>]+display:none/.test(html));
check('Listening Score และ Typing Bonus เก็บแยกใน evidence', /listening_score: entry\.listeningScore/.test(app) && /typing_bonus: entry\.typingBonus/.test(app));
check('Listening DTO เก็บเฉพาะค่าที่ Submit และ listen count', /itemAttempts\.push\(\{ answer: val, is_correct: isCorrect, mode: 'type' \}\)/.test(app) && /listen_count: state\.listenCount/.test(app) && !/rawKeystrokes|raw_keystrokes/.test(app));
check('จบรอบบันทึก account session เป็น game=listening', /READING_AUTH\.saveScore\(state\.primaryTotal \+ state\.typingBonusTotal, 1, 'listening'/.test(app));
check('reading-auth รองรับ route/game listening', /listening-game/.test(auth) && /'listening'/.test(auth) && /score-submit/.test(auth));
check('Listening keeps account reporting but loads neither SRS nor Review',
  /reading-auth\.js\?v=35/.test(html) && /game-account\.js\?v=6/.test(html) && /practice-events\.js\?v=4/.test(html) &&
  !/(?:tone-server|learning-review)\.js/.test(html) && /typing-score\.js\?v=1/.test(html) && /listening-score\.js\?v=1/.test(html));
check('Listening เปิด runtime จริงและยังมีคำอธิบาย玩法ครบ',
  /id="lg-howto-modal"/.test(html) && /打字加分降到 0/.test(html) && /聽力分數降到 0/.test(html) &&
  !/data-listening-availability="coming-soon"/.test(html));
check('Edge ปฏิเสธ SRS game=listening',
  /\["tone", "reading", "typing", "wordorder"\]\.includes\(game\)/.test(edge) && !/"listening"/.test(edge));
check('tone-round ปิดเส้นทาง Login Free เดิมและส่งไป Learning Engine ใหม่', /learning_engine_required/.test(edge));
check('tone-round rate-limit fail-closed ก่อนเขียน SRS', /if \(rlErr\) return json\(\{ error: "rate_limit_unavailable" \}, 503\)/.test(edge));
check('Listening อ่าน SRS ของ game=listening กลับจาก server', /from\('tone_srs_state'\)[\s\S]*\.eq\('game', 'listening'\)/.test(app));
check('Listening SRS query ผูก captured owner เป็น defense-in-depth', /\.eq\('game', 'listening'\)\s*\.eq\('user_id', owner\.uid\)/.test(app) && /options\.load\(owner\)/.test(app));
check('Listening แยก Due/mastered และจัดรอบ Free 20%', /isSrsDue/.test(app) && /!\(rec && rec\.mastered\)/.test(app) && /tier:\s*'free'/.test(app) && /GameFlow\.allocateSrs/.test(app) && /LearningReview\.allocateRuntime/.test(app));
check('Listening SRS read ใช้ NetworkGuard แบบ bounded และไม่ retry blind', /NetworkGuard\.request\([\s\S]*'listening-srs', \{\}, 10000, null\)/.test(app));
check('Listening boot runtime v20 ผ่านคลังกลาง', /options\.delay\(1500\)/.test(app) && /GameContentLoader\.boot\(\['js\/games\/listening-game-app\.js\?v=20'\], \{game:'listening'\}\)/.test(html));
check('Listening มี leaderboard ของตัวเองและ auth ชี้ถูกหน้า', /READING_BOARD_GAME = 'listening'/.test(board) && /listening-board\.html/.test(auth));
check('Leaderboard client รองรับ game=listening', /READING_BOARD_GAME === 'listening'/.test(boardClient) && /listening-game\.html/.test(boardClient));
check('Core 5 SQL contract รองรับ Listening และ weekly เริ่มวันจันทร์ Taipei', /'reading', 'listening', 'typing', 'word_order'/.test(boardSql) && /date_trunc\('week', timezone\('Asia\/Taipei'/.test(boardSql));

function dueWord(th) { return { th, level: '初' }; }
function dueKey(word) { return word.th + '@1'; }

{
  const dueA = dueWord('due-a');
  const dueB = dueWord('due-b');
  const regular = dueWord('regular');
  const policy = createReviewPolicy({ keyOf: dueKey });
  policy.begin([dueA, dueB]);

  check('SRS Due item ทำได้หนึ่ง attempt ต่อรอบ', policy.claimAttempt(dueA) === true);
  check('Due item เดิมถูกปฏิเสธเมื่อพยายามทำ attempt ที่สองในรอบเดียว', policy.claimAttempt(dueA) === false);
  check('failed Due ไม่ถูก requeue แต่ failed regular ยังใช้ flow เดิม',
    policy.shouldRequeue(dueA, true) === false && policy.shouldRequeue(regular, true) === true);
  check('Due SRS submission เป็น idempotent หนึ่ง request ต่อ item ต่อรอบ',
    policy.claimSubmission(dueA) === true && policy.claimSubmission(dueA) === false);

  const restored = createReviewPolicy({ keyOf: dueKey });
  check('SRS Due attempt/submission claims อยู่ครบหลัง resume restore',
    restored.restore(policy.snapshot()) === true && restored.hasAttempted(dueA) === true &&
    restored.claimAttempt(dueA) === false && restored.claimSubmission(dueA) === false);

  const capped = createReviewPolicy({ keyOf: dueKey });
  capped.begin([dueB], 4);
  check('Listening SRS Due fail-closed ที่หนึ่ง attempt แม้มี legacy argument เกิน 1',
    capped.claimAttempt(dueB) === true && capped.claimAttempt(dueB) === false);
}

{
  const due = [dueWord('due-1'), dueWord('due-2')];
  const regular = Array.from({ length: 8 }, (_, i) => dueWord('regular-' + i));
  const policy = createReviewPolicy({ keyOf: dueKey });
  policy.begin(due);
  const attempts = due.concat(regular);
  attempts.slice().forEach((word) => {
    if (policy.claimAttempt(word) && policy.shouldRequeue(word, due.includes(word))) attempts.push(word);
  });
  check('10-item Free round keeps failed Due actual attempts at 2/10 (Due20)',
    attempts.length === 10 && attempts.filter((word) => due.includes(word)).length === 2);
}

check('actual Listening flow keeps SRS Due attempt/submission separate from pre-SRS Review',
  /listeningSrsDuePolicy\.begin\(allocation\.selectedSrs\|\|allocation\.selectedDue\|\|\[\]\)/.test(app) &&
  /if \(!listeningSrsDuePolicy\.claimAttempt\(w\)\) return/.test(app) &&
  /if \(!listeningSrsDuePolicy\.claimSubmission\(word\)\) return/.test(app) &&
  /!listeningSrsDuePolicy\.isReview\(word\) \|\| !listeningSrsDuePolicy\.hasAttempted\(word\)/.test(app) &&
  /if \(!pend\.listeningSrsDuePolicy\) \{[\s\S]*GameResume\.clear\('listening-game'\)[\s\S]*startRound\(\)/.test(app));

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
