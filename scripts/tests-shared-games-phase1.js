#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const sharedCss = fs.readFileSync(path.join(root, 'css/shared.css'), 'utf8');
const sharedJs = fs.readFileSync(path.join(root, 'js/core/shared.js'), 'utf8');
const switcherJs = fs.readFileSync(path.join(root, 'js/games/game-switcher.js'), 'utf8');
const wordMenuJs = fs.readFileSync(path.join(root, 'js/games/word-menu.js'), 'utf8');
const games = [
  { id: 'tone', html: 'tone-finder.html', app: 'js/games/tone-finder-game.js', howto: 'tf-howto-modal', resume: 'tf-resume-banner' },
  { id: 'reading', html: 'reading-game.html', app: 'js/games/reading-game-app.js', howto: 'rg-howto-modal', resume: 'rg-resume-banner' },
  { id: 'listening', html: 'listening-game.html', app: 'js/games/listening-game-app.js', howto: 'lg-howto-modal', resume: 'lg-resume-banner' },
  { id: 'typing', html: 'typing-game.html', app: 'js/games/typing-game-app.js', howto: 'rg-howto-modal', resume: 'tg-resume-banner' },
  { id: 'wordorder', html: 'word-order.html', app: 'js/games/word-order-app.js', howto: 'wo-howto-modal', resume: 'wo-resume-banner' },
].map((g) => ({
  ...g,
  htmlText: fs.readFileSync(path.join(root, g.html), 'utf8'),
  appText: fs.readFileSync(path.join(root, g.app), 'utf8'),
}));

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log(`✓ ${name}`);
}

test('all five games use one shared-width shell and one auth slot', () => {
  for (const g of games) {
    assert.match(g.htmlText, /gsh-shell/, `${g.id}: ไม่มี shared shell`);
    assert.strictEqual((g.htmlText.match(/id="rg-login-slot"/g) || []).length, 1, `${g.id}: auth slot ต้องมีจุดเดียว`);
  }
});

test('all five games expose the locked shared header, progress and resume semantics', () => {
  for (const g of games) {
    assert.match(g.htmlText, /gsh-page-header/, `${g.id}: header ยังไม่ใช้ shared contract`);
    if (g.id === 'tone') assert.match(g.htmlText, /id="tf-session-counter"/, 'tone: compact progress host หาย');
    else assert.match(g.htmlText, /gsh-progress/, `${g.id}: progress ยังไม่ใช้ shared contract`);
    assert.match(g.htmlText, new RegExp(`id="${g.resume}"[^>]+role="region"[^>]+aria-label="繼續上次練習"`), `${g.id}: resume ไม่มี region label`);
  }
  for (const id of ['tone', 'reading', 'typing']) {
    assert.match(games.find((g) => g.id === id).htmlText, /gsh-level-selector[^>]+aria-label="選擇等級"/, `${id}: level selector ยังไม่ใช้ shared contract`);
  }
  assert.match(games.find((g) => g.id === 'typing').htmlText, /<div class="card gsh-gameplay" id="game">/, 'Typing: gameplay class ต้องอยู่บน outer game card');
});

test('shared shell stays bounded and resume actions stay compact on narrow screens', () => {
  assert.match(sharedCss, /\.gsh-shell\s*\{[^}]*max-width:688px[^}]*box-sizing:border-box/);
  assert.match(sharedCss, /\.gsh-gameplay\s*\{[^}]*max-width:640px[^}]*box-sizing:border-box/);
  assert.match(sharedCss, /@media\(max-width:480px\)[\s\S]*?\.gsh-resume-actions\s*\{\s*flex-direction:row/);
  assert.match(sharedCss, /\.gsh-resume-actions button\s*\{[^}]*min-height:36px/);
});

test('all five games expose a persistent 玩法 replay path', () => {
  for (const g of games) {
    assert.match(g.htmlText, new RegExp(`id="${g.howto}"`), `${g.id}: ไม่มี howto modal`);
    assert.match(g.htmlText, /📖 玩法/, `${g.id}: ไม่มีปุ่ม 玩法`);
  }
});

test('all five games expose the shared cross-game switcher', () => {
  for (const g of games) {
    assert.match(g.htmlText, /id="game-switcher"[^>]+data-current=/, `${g.id}: ไม่มี game switcher`);
    assert.match(g.htmlText, /js\/games\/game-switcher\.js\?v=/, `${g.id}: ไม่ได้โหลด shared switcher`);
  }
});

test('shared switcher contains exactly the Phase 1 Core 5 in canonical order', () => {
  const core5Block = switcherJs.slice(switcherJs.indexOf('var CORE5_TABS'), switcherJs.indexOf('var LEGACY_TABS'));
  const ids = Array.from(core5Block.matchAll(/\{ id: '([^']+)'/g), (match) => match[1]);
  assert.deepStrictEqual(ids, ['tone_finder', 'reading_game', 'listening_game', 'typing_game', 'word_order']);
  assert.doesNotMatch(core5Block, /href: '(?:lego|vault|games-challenge)\.html'/);
  assert.match(switcherJs, /core5 \? CORE5_TABS : LEGACY_TABS/, 'non-Core-5 pages ต้องคง switcher เดิม');
  assert.match(switcherJs, /role="menuitem" aria-current="page"/);
});

test('floating controls use the locked switcher, focus and More Menu copy', () => {
  assert.match(sharedJs, /menuBtn\.setAttribute\('aria-label', '遊戲選單'\)/);
  assert.match(sharedJs, /isCore5Surface[\s\S]{0,120}\? \(on \? '離開專注模式' : '專注模式'\)/);
  assert.match(sharedJs, /isCore5Game \? '更多功能' : '回報問題 \/ 心得分享'/);
  assert.match(sharedJs, /fab\.innerHTML = \(isCore5Game \? '⋯' : '🪧'\)/);
  assert.match(sharedJs, /fitMenuToViewport\(\)/);
  assert.match(sharedJs, /fitMoreMenuToViewport\(\)/);
  assert.match(sharedJs, /path\.indexOf\('listening-game'\) > -1\) GAME_ID = 'listening'/, 'Listening must use the shared More mapping');
  assert.match(games.find((g) => g.id === 'listening').htmlText, /shared\.min\.js\?v=39/, 'Listening must load the current shared mapping version');
});

test('all six games use the shared locked exit dialog without another shell gate', () => {
  const legoHtml = fs.readFileSync(path.join(root, 'lego.html'), 'utf8');
  assert.match(sharedJs, /title: '要離開遊戲嗎？'/);
  assert.match(sharedJs, /continueAction: '繼續遊戲'/);
  assert.match(sharedJs, /leaveAction: '離開遊戲'/);
  assert.match(sharedJs, /data-act="exit"/);
  assert.match(sharedJs, /window\.location\.assign\('\/games\.html'\)/, 'Leave must always route to the Games hub');
  assert.match(sharedJs, /GAME_ID !== 'challenge'[^\n]+data-act="exit"/, 'early implementation must not activate Challenge');
  assert.match(sharedJs, /event\.key !== 'Escape'/, 'Escape must continue the current game');
  for (const g of games) assert.match(g.htmlText, /shared\.min\.js\?v=39/, `${g.id}: must load shared exit runtime`);
  assert.match(legoHtml, /shared\.min\.js\?v=39/, 'Lego must load shared exit runtime');
  assert.match(sharedCss, /\.gsh-game-exit-overlay/);
});

test('shared font control binds after asynchronous Core 5 game startup', () => {
  assert.match(sharedJs, /function bindFontSlot\(\)/, 'shared font adapter must have one idempotent binder');
  assert.match(sharedJs, /if \(!bindFontSlot\(\)\)[\s\S]{0,300}setInterval/, 'shared font adapter must retry after DOM ready');
  assert.match(sharedJs, /bindFontSlot\(\) \|\| fontBindAttempts >= 160/, 'font retry must stop after the existing loader window');
  assert.match(sharedJs, /fontSlot\.querySelector\('button'\)/, 'font adapter must not duplicate the shared control');
  for (const g of games) {
    assert.match(g.htmlText, /id="font-toggle-slot"/, `${g.id}: missing shared font slot`);
  }
});

test('Lego consumes the shared two-mode font path without a particle control', () => {
  const legoHtml = fs.readFileSync(path.join(root, 'lego.html'), 'utf8');
  const legoApp = fs.readFileSync(path.join(root, 'js/games/lego-game-app.js'), 'utf8');
  assert.match(legoHtml, /shared\.min\.js\?v=39/, 'Lego must load the current shared game runtime');
  assert.match(legoHtml, /lego-game-app\.js\?v=10/, 'Lego must load its locked-flow runtime');
  assert.match(legoApp, /window\.rgToggleFont\s*=\s*function/, 'Lego must expose the shared font adapter API');
  assert.match(legoApp, /classList\.toggle\('rg-modern-font'\)/, 'Lego must preserve the existing standard/modern modes');
  assert.match(legoApp, /localStorage\.setItem\('rg_modern_font'/, 'Lego must reuse the shared font preference');
  assert.match(legoHtml, /body\.rg-modern-font \.out-th[\s\S]{0,500}Noto Sans Thai/, 'Lego Thai gameplay text must respond to the shared mode');
  assert.doesNotMatch(legoHtml + legoApp, /games_particle_mode|rg-particle-toggle|ToggleParticle/, 'Lego must not receive the particle control');
});

test('Lego exposes only the locked minimum-release presentation', () => {
  const legoHtml = fs.readFileSync(path.join(root, 'lego.html'), 'utf8');
  const legoApp = fs.readFileSync(path.join(root, 'js/games/lego-game-app.js'), 'utf8');
  assert.match(legoHtml, /<h1>泰語造句練習室<\/h1>/);
  assert.match(legoHtml, /<p>用學過的單字，組出你真正想說的泰語。<\/p>/);
  assert.match(legoHtml, /id="levels" hidden aria-hidden="true"/, 'unauthorized Level 2/3 entry UI must not be exposed');
  assert.doesNotMatch(legoHtml, /id="rg-challenge-banner"/, 'Weekly Challenge must stay out of the minimum release');
  assert.doesNotMatch(legoHtml, /lego_freebie_banner_click|免費領取「泰語聲調速查表」/, 'removed lead magnet must not interrupt Lego gameplay');
  assert.match(legoHtml, /onclick="legoCompleteSentence\(\)">完成句子<\/button>/);
  assert.match(legoHtml, /onclick="legoEndGame\(\)">結束遊戲<\/button>/);
  assert.match(legoHtml, /onclick="legoContinueBuilding\(\)">繼續造句<\/button>/);
  assert.match(legoHtml, /id="lego-reveal-th"[\s\S]{0,180}id="lego-reveal-zh"/, 'reveal must contain only the full sentence and zh-TW translation before actions');
  assert.match(legoHtml, /js\/games\/game-flow\.js\?v=10/, 'Lego Result must use the shared flow runtime');
  for (const role of ['replay','print','detail-action','switch','cta','home']) {
    assert.match(legoHtml, new RegExp(`data-game-result-${role}="v1"`), `Lego Result missing ${role}`);
  }
  assert.match(legoApp, /let legoCompletedSentences=\[\]/, 'confirmed sentences need one session collection');
  assert.match(legoApp, /legoCompletedSentences\.push\(sentence\)/, '完成句子 must retain the confirmed sentence');
  assert.match(legoApp, /missingCustomTranslation\?'':buildZhFull\(\)/, 'custom input without player translation must not receive inferred translation');
  assert.match(legoApp, /自訂內容由玩家自行輸入，系統不會檢查或修正內容。/);
  assert.match(legoApp, /showFirstCorrect:false/, 'non-applicable first-attempt proof must be omitted from Lego Result');
});

test('Lego exposes only the locked word sets and branch grammar', () => {
  const legoHtml = fs.readFileSync(path.join(root, 'lego.html'), 'utf8');
  const legoApp = fs.readFileSync(path.join(root, 'js/games/lego-game-app.js'), 'utf8');
  const block = (start, end) => {
    const from = legoApp.indexOf(start);
    const to = legoApp.indexOf(end, from + start.length);
    assert.ok(from >= 0 && to > from, `missing Lego block ${start}`);
    return legoApp.slice(from, to);
  };
  const words = block('const WORDS={', '// ════════ SESSION POOL');
  const locations = block('const LOCATION_WORDS=[', 'const SLEEP_LOCATION');
  for (const th of ['ตอนนี้','วันนี้','พรุ่งนี้','เรา','ผม','พี่','อยาก','จะ','กำลัง','กิน','ไป','ไปกิน','นอน','ไปนอน','ซื้อ','ไปซื้อ','ข้าว','ขนม','ผลไม้','ไก่ย่าง','ก๋วยเตี๋ยว','ของกิน','เสื้อ','รองเท้า','กระเป๋า','กางเกง','ตั๋ว','อยู่','พ่อ','แม่','เพื่อน','แฟน','นะ','นะครับ','นะคะ','อะ','ครับ','ค่ะ']) {
    assert.match(words, new RegExp(`th:'${th}'`), `locked word ${th} is missing`);
  }
  for (const th of ['ห้าง','บ้านเพื่อน','เซเว่น','ร้านอาหาร']) {
    assert.match(locations, new RegExp(`th:'${th}'`), `locked location ${th} is missing`);
  }
  const active = block('function activeSlots(){', '// ════════ CSS VARS');
  assert.match(active, /verb==='ไป'\|\|verb==='นอน'/, 'only ไป/นอน may expose a location branch');
  assert.match(active, /verb==='ไป'&&!!state\.advObj/, 'Who must follow a selected ไป location');
  const renderBaseplate = block('function renderBaseplate(){', 'function applyOpen(){');
  assert.match(renderBaseplate, /sessionPool\.obj\|\|\[\]\)\.filter\(isObjCompatible\)/, 'Eat and buy branches must show only compatible objects');
  const actions = block('function pickWord(id,th){', 'function addCustomSubj(){');
  assert.match(actions, /word\.th==='กำลัง'\?WORDS\.prog\[0\]:null/, 'กำลัง must default to rear อยู่');
  assert.match(actions, /id==='prog'&&!state\.modal/, 'rear อยู่ must not be removable without front grammar');
  const output = block('function renderOut(){', 'function render(){');
  assert.match(output, /thParts\.push\('กับ'\+w\.th\)/, 'Who must use กับ after ไป and a location');
  assert.doesNotMatch(output, /thParts\.push\('ที่'/, 'ไป location must not insert ที่');
  assert.doesNotMatch(legoApp, /title="加入我的造句單字庫/, 'word saving must not interrupt the build surface');
  assert.match(legoHtml, /沒有前置文法時，句尾的 อยู่ 會保留/);
  assert.match(legoHtml, /只有按過「完成句子」的內容會進入本輪結果；未完成的草稿不會儲存/);
  assert.doesNotMatch(legoApp.slice(legoApp.indexOf('var GT_TOUR_STEPS=[')), /loadExample\(\)|startTest\(\)|#levels/, 'active tour must describe only the locked flow');
});

test('Lego custom fields stay inside the locked slots and translation boundary', () => {
  const legoHtml = fs.readFileSync(path.join(root, 'lego.html'), 'utf8');
  const legoApp = fs.readFileSync(path.join(root, 'js/games/lego-game-app.js'), 'utf8');
  const renderStart = legoApp.indexOf('function renderBaseplate(){');
  const renderEnd = legoApp.indexOf('function applyOpen(){', renderStart);
  const render = legoApp.slice(renderStart, renderEnd);
  const customStart = legoApp.indexOf('function addCustomSubj(){');
  const customEnd = legoApp.indexOf('function clearAll(){', customStart);
  const custom = legoApp.slice(customStart, customEnd);
  assert.match(render, /\['time','subj','adv'\]\.includes\(s\.id\)/, 'custom input must be limited to Time, Subject and Who by default');
  assert.match(render, /s\.id==='advObj'&&state\.verb&&state\.verb\.th==='ไป'/, 'custom Location must exist only in the ไป branch');
  assert.match(render, /<span>ชื่อ<\/span>/, 'Subject must preserve the player-name field');
  assert.match(render, /<span>ใส่เอง<\/span>/, 'locked custom-input label must be visible');
  assert.match(custom, /\['time','subj','adv','advObj'\]\.includes\(id\)/);
  assert.match(custom, /id==='advObj'&&\(!state\.verb\|\|state\.verb\.th!=='ไป'\)/, 'custom Location must fail closed outside ไป');
  assert.match(custom, /const w=\{th:name,zh:name,custom:true,customType:'name'\}/, 'a proper name may stay Thai in the translated sentence');
  assert.match(custom, /state\[id\]=\{th:th,zh:zh,custom:true,customType:'custom'\}/, 'player translation must remain player-owned data');
  assert.doesNotMatch(custom, /WORDS\.(?:time|subj|adv)\.push|sessionPool\.(?:time|subj|adv)\.push/, 'custom input must not expand the locked candidate pools');
  assert.match(legoApp, /missingCustomTranslation=customWords\.some\(word=>word\.customType!=='name'&&!String\(word\.zh\|\|''\)\.trim\(\)\)/);
  assert.match(legoApp, /customType:word\.customType\|\|''/, 'Resume must preserve custom-input typing');
  assert.match(legoHtml, /中文翻譯可選填，未填時系統不會推測/);
  assert.match(legoHtml, /input\.lego-custom-zh\{font-family:'Noto Sans TC'/, 'translation input must use the current zh-TW font path');
});

test('Lego Resume preserves confirmed sentences and validates its game-owned builder payload', () => {
  const legoHtml = fs.readFileSync(path.join(root, 'lego.html'), 'utf8');
  const legoApp = fs.readFileSync(path.join(root, 'js/games/lego-game-app.js'), 'utf8');
  assert.match(legoHtml, /id="lego-resume-banner"[^>]+role="region"[^>]+aria-label="繼續上次練習"/);
  assert.match(legoHtml, /onclick="legoResumeContinue\(\)"[^>]*>▶ 繼續上次/);
  assert.match(legoHtml, /onclick="legoResumeRestartCurrent\(\)"[^>]*>↺ 重新開始/);
  assert.match(legoHtml, /onclick="legoResumeNewSession\(\)"[^>]*>＋ 開始新一輪/);
  assert.match(legoApp, /GameResume\.save\('lego',[\s\S]{0,260}completed:legoCompletedSentences\.map/);
  assert.match(legoApp, /version:1,view:view==='reveal'\?'reveal':'build',builder:builder/);
  assert.match(legoApp, /function legoNormalizeBuilder\(saved\)/);
  assert.match(legoApp, /if\(saved\.view==='reveal'&&!completed\.length\)return null/);
  assert.match(legoApp, /legoCompletedSentences=pending\.completed/);
  assert.match(legoApp, /legoCompletedSentences=pending\?pending\.completed:\[\]/, 'restart current sentence must retain prior confirmed sentences');
  assert.match(legoApp, /function legoResumeNewSession\(\)[\s\S]{0,180}legoCompletedSentences=\[\]/, 'new round must clear the saved session');
  assert.match(legoApp, /GameUiCopy\.resumeLine\(LEGO_UI_COPY\.resume\.game,LEGO_UI_COPY\.resume\.mode,progress\)/);
  assert.match(legoApp, /function legoShowLockedError\(\)[\s\S]{0,260}legoSaveResume\('build'\)/, 'error recovery must retain confirmed data');
  assert.match(legoApp, /GameFlow\.enhanceResult\([\s\S]{0,260}legoClearResume\(\)/, 'only a successfully rendered Result may clear Resume');
});

test('learning helpers remain inline and do not create the fallback rice menu', () => {
  assert.match(wordMenuJs, /row\.classList\.add\('gsh-learning-tools'\)/);
  assert.match(wordMenuJs, /row\.setAttribute\('data-wm-done', '1'\);[\s\S]{0,120}return;/);
  assert.match(sharedJs, /querySelector\('\[data-wm-done="1"\]'\)\) return/);
  assert.match(games.find((g) => g.id === 'listening').htmlText, /id="zh-toggle-slot"/, 'Listening: translation control ต้องอยู่ใน inline learning tools');
});

test('all five games provide recoverable round resume UI', () => {
  for (const g of games) {
    assert.match(g.htmlText, new RegExp(`id="${g.resume}"`), `${g.id}: ไม่มี resume banner`);
    assert.match(g.htmlText + g.appText, /GameResume/, `${g.id}: ไม่มี resume storage wiring`);
  }
});

test('mobile resume uses one compact shared-copy line and three horizontal actions', () => {
  assert.match(sharedJs, /window\.GameUiCopy[\s\S]{0,700}prefix: '上次進度：'/, 'resume copy must live outside game logic');
  assert.match(sharedJs, /continueAction: '▶ 繼續上次'/);
  assert.match(sharedJs, /restartAction: '↺ 重新開始'/);
  assert.match(sharedJs, /newAction: '＋ 開始新一輪'/);
  assert.match(sharedCss, /@media\(max-width:480px\)[\s\S]{0,500}\.gsh-resume-actions \{ flex-direction:row; flex-wrap:nowrap;/, 'mobile resume actions must stay horizontal');
  assert.match(sharedCss, /\.gsh-resume-actions button \{ flex:1 1 0;[^}]*min-height:36px;/, 'mobile resume actions must stay compact');
  for (const g of games) {
    assert.match(g.htmlText, /css\/shared\.css\?v=24/, `${g.id}: must load current shared game CSS`);
    assert.match(g.htmlText, /js\/core\/shared\.min\.js\?v=39/, `${g.id}: must load shared resume copy`);
    assert.match(g.appText, /GameUiCopy\.resumeLine/, `${g.id}: resume detail must use shared semantic copy`);
  }
});

test('all five games load and persist one current-round DTO identity', () => {
  for (const g of games) {
    assert.match(g.htmlText, /js\/games\/round-report\.js\?v=2/, `${g.id}: missing Round Report DTO loader`);
    assert.match(g.htmlText, /js\/score\/learning-summary\.js\?v=1/, `${g.id}: missing Login summary loader`);
    assert.match(g.appText, /RoundReport\.(?:create|restore)/, `${g.id}: round identity is not wired`);
    assert.match(g.appText, /report:/, `${g.id}: active GameResume must carry the report snapshot`);
  }
});

test('all six games use the shared A4 browser Print structure and daily Result activity', () => {
  const legoHtml = fs.readFileSync(path.join(root, 'lego.html'), 'utf8');
  const legoApp = fs.readFileSync(path.join(root, 'js/games/lego-game-app.js'), 'utf8');
  const roundReport = fs.readFileSync(path.join(root, 'js/games/round-report.js'), 'utf8');
  const gameFlow = fs.readFileSync(path.join(root, 'js/games/game-flow.js'), 'utf8');
  for (const g of games) {
    assert.match(g.htmlText, /js\/games\/round-report\.js\?v=2/, `${g.id}: must load shared print renderer`);
    assert.match(g.htmlText, /js\/games\/game-flow\.js\?v=10/, `${g.id}: must load daily Result runtime`);
    assert.match(g.appText, /RoundReport\.openPrint/, `${g.id}: print action must use the shared renderer`);
  }
  assert.match(legoHtml, /js\/games\/round-report\.js\?v=2/);
  assert.match(legoHtml, /js\/games\/game-flow\.js\?v=10/);
  assert.match(legoApp, /RoundReport\.openPrint/);
  assert.match(roundReport, /@page\{size:A4 portrait/);
  assert.match(roundReport, /data-print-section=\\?"summary\\?"[\s\S]+data-print-section=\\?"activity\\?"[\s\S]+data-print-section=\\?"detail\\?"/);
  assert.match(roundReport, /groupListeningModes/);
  assert.match(roundReport, /customDisclaimer/);
  assert.match(gameFlow, /RoundReport\.dailyActivityText/);
});

test('all five games provide read-only mistake review after a round', () => {
  for (const g of games) {
    assert.match(g.htmlText + g.appText, /查看錯題|錯題複習|答錯的題目|打錯的字/, `${g.id}: ไม่มี mistake review`);
  }
});

test('Guest/Login Free reports contain facts only and no personalized analysis or recommendation', () => {
  function block(text, start, end) {
    const from = text.indexOf(start);
    const to = text.indexOf(end, from + start.length);
    assert.ok(from >= 0 && to > from, `หา report block ${start} ไม่พบ`);
    return text.slice(from, to);
  }
  const reportBlocks = [
    ['tone', games.find((g) => g.id === 'tone').appText, 'function buildReportInner()', 'function buildReportHTML()'],
    ['reading', games.find((g) => g.id === 'reading').appText, 'function rgDownloadReport()', '// ── กฎ15:'],
    ['listening', games.find((g) => g.id === 'listening').appText, 'function printListeningReport()', 'function restart()'],
    ['typing', games.find((g) => g.id === 'typing').appText, 'function rgDownloadReport()', 'function trackBookCTA()'],
    ['wordorder', games.find((g) => g.id === 'wordorder').appText, 'window.woDownloadReport = function()', '// Lin 2026-08-02:'],
  ];
  for (const [id, text, start, end] of reportBlocks) {
    const report = block(text, start, end);
    assert.doesNotMatch(report, /弱點分析|個人化|建議|需要加強|最不穩|analysisLines|weakHtml/, `${id}: report มี analysis/recommendation`);
    assert.match(report, /作答|你的答案/, `${id}: report ต้องคงคำตอบผู้เรียน`);
    assert.match(report, /正解|正確答案/, `${id}: report ต้องคงคำตอบที่ถูก`);
    assert.doesNotMatch(report, /未登入/, `${id}: Guest report ต้องไม่แสดงช่อง entitlement ของ Login`);
  }
  for (const id of ['tone', 'reading', 'listening', 'typing', 'wordorder']) {
    const row = reportBlocks.find((entry) => entry[0] === id);
    const report = block(row[1], row[2], row[3]);
    assert.match(report, /loggedIn[\s\S]*(?:下次複習|複習狀態)/, `${id}: Login report ต้องเพิ่ม SRS เดิมแบบอัตโนมัติ`);
  }
  for (const id of ['reading', 'typing', 'wordorder']) {
    const row = reportBlocks.find((entry) => entry[0] === id);
    const report = block(row[1], row[2], row[3]);
    assert.match(report, /wordGlosses[\s\S]*逐字/, `${id}: sentence report ต้องใช้คำแยกและคำแปลรายคำจาก structured data เดิม`);
  }
  const toneSummary = block(
    games.find((g) => g.id === 'tone').appText,
    'function stepSessionSummary()',
    'function stepMistakeReview()'
  );
  assert.doesNotMatch(toneSummary, /tf-sum-analysis|analysisLines|需要加強|需要再複習|建議/, 'Tone Result มี personalized analysis/recommendation');
  const toneStats = block(
    games.find((g) => g.id === 'tone').appText,
    'function showStats()',
    'function clearTodayStats()'
  );
  const toneStatsDownload = block(
    games.find((g) => g.id === 'tone').appText,
    'function buildStatsReportText(',
    'function downloadStats()'
  );
  assert.doesNotMatch(toneStats + toneStatsDownload, /最常選錯|今日課程重點|LESSON_TIPS/, 'Tone Login history must not infer weaknesses or recommendations');
  for (const g of games) {
    assert.doesNotMatch(g.htmlText, /「弱點分析」/, `${g.id}: help ยังอ้าง personalized report section`);
  }
});

test('first-time help is persistent for four mature games and explicit on Listening start', () => {
  for (const g of games.filter((x) => x.id !== 'listening')) {
    assert.match(g.htmlText, new RegExp(`howto_tour_seen_${g.id}`), `${g.id}: ไม่มี first-time persistence`);
    assert.match(g.htmlText, /GT_TOUR_STEPS/, `${g.id}: ไม่มี guided steps`);
  }
  const listening = games.find((g) => g.id === 'listening').htmlText;
  assert.match(listening, /id="lg-start"/);
  assert.match(listening, /聽力練習：這樣玩/);
});

test('Tone help layers own Escape and exit without leaking the key to page shortcuts', () => {
  const tone = games.find((g) => g.id === 'tone').htmlText;
  assert.match(tone, /e\.key!==['"]Escape['"]/);
  assert.match(tone, /howto&&howto\.style\.display!==['"]none['"][\s\S]{0,300}e\.stopImmediatePropagation\(\)[\s\S]{0,300}howto\.style\.display=['"]none['"]/);
  assert.match(tone, /e\.stopImmediatePropagation\(\)[\s\S]{0,80}gtTourEnd\(\)/);
});

test('all five replayable help modals close on Escape and restore focus to their opener', () => {
  const handles = {
    tone: '__tfHowtoModalReg',
    reading: '__rgHowtoModalReg',
    listening: '__lgHowtoModalReg',
    typing: '__tgHowtoModalReg',
    wordorder: '__woHowtoModalReg',
  };
  for (const g of games) {
    assert.match(g.htmlText + g.appText, new RegExp(`window\\.${handles[g.id]}\\s*=\\s*window\\.registerGameModal`), `${g.id}: help modal is not registered`);
    assert.match(g.htmlText, new RegExp(`${handles[g.id]}\\)window\\.${handles[g.id]}\\.notifyOpen\\(this\\)`), `${g.id}: opener does not register focus return`);
  }
});

test('all five game pages declare mobile viewport and responsive CSS', () => {
  for (const g of games) {
    assert.match(g.htmlText, /<meta name="viewport"[^>]+width=device-width/);
    assert.match(g.htmlText, /@media\s*\(max-width:/);
  }
});

test('Typing has native mobile input while Listening typed mode is keyboard-focusable', () => {
  const typing = games.find((g) => g.id === 'typing').htmlText;
  const listening = games.find((g) => g.id === 'listening').htmlText;
  assert.match(typing, /id="rg-mobile-input"[^>]+inputmode="text"/);
  assert.match(listening, /id="lg-type-input"[^>]+autocomplete="off"/);
  assert.match(games.find((g) => g.id === 'listening').appText, /typeInput\.focus/);
});

test('Tone active-question guidance permanently locks that question to zero', () => {
  const toneGame = games.find((g) => g.id === 'tone');
  const tone = toneGame.appText;
  const toneMin = fs.readFileSync(path.join(root, 'js/games/tone-finder-game.min.js'), 'utf8');
  assert.match(tone, /currentWordGuideUsed\s*=\s*!!tfGuideMode/, 'Tone: next question must inherit the latest guide state');
  assert.match(tone, /tfGuideMode\s*\|\|\s*\(session\s*&&\s*session\.currentWordGuideUsed\)/, 'Tone: toggling guidance off must not restore scoring');
  assert.match(tone, /function tfLockCurrentWordForGuide\(\)[\s\S]{0,600}session\.score\s*=\s*Math\.max\(0,[\s\S]{0,120}- awarded\)/, 'Tone: points already awarded in the active question must be revoked');
  assert.match(tone, /S\.step\s*!==\s*'result'/, 'Tone: changing the default on a completed answer must not rewrite that result');
  assert.match(tone, /S\s*=\s*ns;\s*if \(tfGuideMode\) tfLockCurrentWordForGuide\(\);\s*render\(\);/, 'Tone: a carried guide state must lock the next active syllable before render');
  assert.match(tone, /wordScore\s*=\s*session\.currentWordGuideUsed\s*\?\s*0\s*:/, 'Tone: multi-syllable questions must remain zero after guidance');
  assert.match(tone, /hintUsed:\s*!!session\.hintUsed\s*\|\|\s*!!session\.currentWordGuideUsed/, 'Tone: Result evidence must record active guidance');
  assert.match(toneMin, /currentWordGuideUsed/, 'Tone: deployed minified bundle must include the zero-lock state');
  assert.match(toneGame.htmlText, /tone-finder-game\.min\.js\?v=57/, 'Tone: page must request the rebuilt runtime version');
});

console.log(`\n${passed} shared Phase 1 game-system tests passed.`);
