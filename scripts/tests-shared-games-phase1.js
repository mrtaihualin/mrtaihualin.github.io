#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

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

test('Listening keeps its ordinary Desktop Account Bar compact without changing mobile surfaces', () => {
  const listening = games.find((g) => g.id === 'listening').htmlText;
  assert.match(listening, /tf-streak-chip lg-account-context-chip/, 'Listening needs an explicit hook for its duplicate round context');
  assert.match(listening, /@media \(min-width:769px\) and \(min-height:601px\)[\s\S]{0,180}\.lg-account-context-chip\{display:none;\}/, 'Listening must hide only the duplicate context on ordinary Desktop');
});

test('Listening is temporarily closed without deleting its paused game implementation', () => {
  const practice = fs.readFileSync(path.join(root, 'games-practice.html'), 'utf8');
  const listening = games.find((g) => g.id === 'listening').htmlText;
  assert.match(practice, /class="gh-card gh-soon"[^>]+data-game-availability="coming-soon"/);
  assert.doesNotMatch(practice, /<a[^>]+href="listening-game\.html"/);
  assert.match(listening, /data-listening-availability="coming-soon"/);
  assert.match(listening, /id="listening-coming-soon"[\s\S]{0,500}即將開幕/);
  assert.match(listening, /id="listening-live-game"[^>]+aria-hidden="true"/);
  assert.match(listening, /Preserved paused runtime: js\/games\/listening-game-app\.js\?v=19/);
  assert.doesNotMatch(listening, /GameContentLoader\.boot\(\['js\/games\/listening-game-app\.js/);
});

test('Tone ordinary Desktop main and secondary headers exactly match the Core game header contract', () => {
  const toneGame = games.find((g) => g.id === 'tone');
  const tone = toneGame.htmlText;
  const toneApp = toneGame.appText;
  const toneMin = fs.readFileSync(path.join(root, 'js/games/tone-finder-game.min.js'), 'utf8');
  assert.match(tone, /\.tf-page-header\s*\{[\s\S]{0,100}margin-bottom:\s*10px/);
  assert.match(tone, /\.tf-page-title\s*\{[\s\S]{0,260}font-family:\s*'Noto Serif TC',\s*serif;[\s\S]{0,80}font-size:\s*clamp\(20px,\s*4vw,\s*28px\);[\s\S]{0,80}font-weight:\s*900;[\s\S]{0,80}color:\s*#8B6310;[\s\S]{0,80}letter-spacing:\s*2px;/);
  assert.match(tone, /\.tf-page-hint\s*\{[\s\S]{0,220}font-family:\s*'Noto Sans TC',\s*sans-serif;[\s\S]{0,80}font-size:\s*12px;[\s\S]{0,80}color:\s*#b08040;[\s\S]{0,80}margin-top:\s*3px;/);
  const toneTitleBlock = tone.match(/\.tf-page-title\s*\{([^}]*)\}/)[1];
  assert.doesNotMatch(toneTitleBlock, /margin-(?:top|bottom):/);
  assert.strictEqual((toneApp.match(/getElementById\('tf-hint'\)\.style\.display\s*=\s*'block'/g) || []).length, 2, 'Tone: secondary header must remain visible in every game state');
  assert.doesNotMatch(toneApp, /getElementById\('tf-hint'\)\.style\.display\s*=\s*(?:'none'|\(S\.step)/, 'Tone: source runtime must not hide the secondary header');
  assert.match(toneMin, /getElementById\("tf-hint"\)\.style\.display="block"/, 'Tone: deployed runtime must keep the secondary header visible');
  assert.doesNotMatch(toneMin, /getElementById\("tf-hint"\)\.style\.display=(?:"none"|"level-select")/, 'Tone: deployed runtime must not hide the secondary header');
  assert.match(tone, /<!--ANN-BAND:START--><!-- Tone is a Core game surface: no announcement strip\. --><!--ANN-BAND:END-->/, 'Tone must not render the shared announcement strip');
  assert.match(tone, /body\[data-gsh-game="tone"\] > \.avail-band \{ display:none !important; \}/, 'Tone must also hide any announcement fallback inserted by shared runtime');
  assert.match(tone, /@media \(min-width:1025px\), \(min-width:769px\) and \(min-height:601px\)[\s\S]{0,420}#tf-syl-strip\[style\*="display: flex"\] \+ \.tf-body\s*\{\s*padding-top:0;/, 'Tone syllable spacing must cover tall and wide-short Desktop without changing mobile landscape');
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

test('active Desktop games keep the canonical level, progress and gameplay order', () => {
  for (const id of ['tone', 'reading', 'typing']) {
    const html = games.find((g) => g.id === id).htmlText;
    const toolsAt = html.indexOf(id === 'tone' ? '<div class="tf-tools-row">' : '<div class="rg-tools-row">');
    const sessionAt = html.indexOf('<div class="gsh-session-header">', toolsAt);
    const resumeAt = html.indexOf('class="gsh-resume-banner"', sessionAt);
    const gameplayAt = html.indexOf('gsh-gameplay', resumeAt);
    assert.ok(toolsAt > -1 && sessionAt > toolsAt && resumeAt > sessionAt && gameplayAt > resumeAt, `${id}: Desktop order must be account/tools → level/progress → resume → gameplay`);
  }
  assert.match(sharedCss, /@media \(min-width:769px\) and \(min-height:601px\)\{[\s\S]*?data-gsh-game="tone"\] \.gsh-session-header,[\s\S]*?data-gsh-game="reading"\] \.gsh-session-header,[\s\S]*?data-gsh-game="typing"\] \.gsh-session-header \{[\s\S]*?flex-direction:column; flex-wrap:nowrap;/, 'ordinary Desktop games with Level must keep Level and round status on two rows');
  const wordOrder = games.find((g) => g.id === 'wordorder').htmlText;
  assert.doesNotMatch(wordOrder, /gsh-level-selector/, 'Word Order must not invent a level selector');
  assert.match(wordOrder, /class="card gsh-gameplay"[\s\S]{0,500}class="gsh-session-header"[\s\S]{0,500}class="bars-wrap gsh-progress"/, 'Word Order keeps its single-level session status above progress inside gameplay');
});

test('Tone keeps one equal four-button Level and alphabet row on Desktop and Portrait', () => {
  const tone = games.find((g) => g.id === 'tone').htmlText;
  const header = tone.slice(tone.indexOf('<div class="gsh-session-header">'), tone.indexOf('<div class="gsh-resume-banner"'));
  assert.strictEqual((header.match(/class="tf-ltab"/g) || []).length, 4, 'Tone header must contain exactly four equal buttons');
  assert.match(header, /id="tf-ltab-1"[\s\S]*id="tf-ltab-2"[\s\S]*id="tf-ltab-3"[\s\S]*id="tf-alpha-btn"/, 'Tone order must be 初級 → 中級 → 高級 → 字母練習區');
  assert.strictEqual((tone.match(/id="tf-alpha-btn"/g) || []).length, 1, 'Tone alphabet entry must remain a single button');
  assert.match(tone, /@media \(min-width:769px\) and \(min-height:601px\)[\s\S]{0,700}gsh-session-header > \.gsh-level-selector[\s\S]{0,180}grid-template-columns:repeat\(4,minmax\(0,1fr\)\)[\s\S]{0,120}max-width:640px !important/, 'Desktop must show four equal buttons in one full row');
  assert.match(tone, /#tf-session-counter:empty \{\s*display:none; min-height:0; line-height:0;/, 'Tone must remove the empty counter row before Result and detail cards');
  assert.match(tone, /@media \(max-width:768px\) and \(orientation:portrait\)[\s\S]{0,1900}\.tf-level-tabs \{[\s\S]{0,180}grid-template-columns:repeat\(4,minmax\(0,1fr\)\)[\s\S]{0,100}max-width:none !important/, 'Portrait must show four equal buttons across the available width');
  assert.match(tone, /@media \(max-width:768px\) and \(orientation:portrait\)[\s\S]{0,1500}\.gsh-session-header \{ gap:7px; padding:0 0 7px; \}[\s\S]{0,100}\.gsh-gameplay \{ margin-top:0; \}/, 'Portrait top rows must keep one 7px vertical rhythm through the gameplay card');
  assert.match(tone, /#tf-alpha-btn \{[\s\S]{0,180}font-size:11\.5px !important; white-space:nowrap;[\s\S]{0,100}#tf-alpha-btn \.tf-alpha-icon \{ display:none; \}/, 'Portrait alphabet label must fit without changing the four equal button widths');
  assert.match(tone, /@media \(orientation:landscape\) and \(max-width:1024px\) and \(max-height:600px\)[\s\S]{0,180}#tf-alpha-btn \{ display:none !important; \}/, 'Mobile Landscape must preserve the accepted three-level Switch surface');
  assert.doesNotMatch(tone.slice(tone.indexOf('<div class="tf-tools-row">'), tone.indexOf('<div class="gsh-session-header">')), /id="tf-alpha-btn"/, 'Account bar must no longer share width with the alphabet button');
});

test('active ordinary Desktop cards and toolbars keep the locked Gold Standard', () => {
  assert.match(sharedCss, /data-gsh-game="tone"\] \.gsh-gameplay,[\s\S]{0,220}data-gsh-game="word-order"\] \.gsh-gameplay \{[\s\S]{0,100}border:1\.5px solid rgba\(139,99,16,0\.15\)/, 'active cards must use the approved Tone border');
  assert.match(sharedCss, /gsh-resume-banner:not\(\[style\*="display:none"\]\):not\(\[style\*="display: none"\]\)[\s\S]{0,420}> \.gsh-gameplay \{[\s\S]{0,80}display:none !important/, 'Resume must remain an exclusive pre-play state');
  assert.match(sharedCss, /#rg-sound-toggle \{ order:1; \}[\s\S]{0,900}#font-toggle-slot \{ order:5; \}[\s\S]{0,900}#rg-vault-btn-slot \{ order:9; \}/, 'ordinary Desktop tools must follow the canonical order');
  assert.match(sharedCss, /data-gsh-game="typing"\] \.gsh-learning-tools > #rg-webkbd-toggle \{ display:none !important; \}/, 'Typing must not expose a standalone ordinary-Desktop screen-keyboard tool');
});

test('shared shell stays bounded and resume actions stay compact on narrow screens', () => {
  assert.match(sharedCss, /\.gsh-shell\s*\{[^}]*max-width:688px[^}]*box-sizing:border-box/);
  assert.match(sharedCss, /\.gsh-gameplay\s*\{[^}]*max-width:640px[^}]*box-sizing:border-box/);
  assert.match(sharedCss, /@media\(max-width:480px\)[\s\S]*?\.gsh-resume-actions\s*\{\s*flex-direction:row/);
  assert.match(sharedCss, /\.gsh-resume-actions button\s*\{[^}]*min-height:36px/);
});

test('all six games bind the locked two-hand mobile landscape layout', () => {
  const legoHtml = fs.readFileSync(path.join(root, 'lego.html'), 'utf8');
  const expectedBodies = {
    tone: games.find((g) => g.id === 'tone').htmlText,
    reading: games.find((g) => g.id === 'reading').htmlText,
    listening: games.find((g) => g.id === 'listening').htmlText,
    typing: games.find((g) => g.id === 'typing').htmlText,
    'word-order': games.find((g) => g.id === 'wordorder').htmlText,
    lego: legoHtml,
  };
  for (const [id, html] of Object.entries(expectedBodies)) {
    assert.match(html, new RegExp(`<body[^>]*data-gsh-game="${id}"[^>]*>`), `${id}: missing landscape scope marker`);
    const sharedCssVersion = ['tone', 'reading', 'typing', 'word-order'].includes(id) ? 29 : 26;
    assert.match(html, new RegExp(`css/shared\\.css\\?v=${sharedCssVersion}`), `${id}: must load current landscape CSS`);
  }
  assert.match(sharedCss, /@media \(orientation:landscape\) and \(max-width:1024px\) and \(max-height:600px\)/);
  assert.match(sharedCss, /\.rg-ctl-wrap \{[\s\S]{0,260}top:var\(--gsh-safe-t\); left:50%/);
  assert.match(sharedCss, /\.rg-ctl-wrap \{[\s\S]{0,520}flex-direction:row !important/);
  assert.match(sharedCss, /#mina-toast,[\s\S]{0,100}#tf-mina-toast \{ display:none !important; \}/);
  assert.match(sharedCss, /#gc-cap-banner \{[\s\S]{0,260}top:50% !important;[\s\S]{0,260}left:31% !important/);
  assert.match(sharedCss, /\.gsh-resume-banner \{[\s\S]{0,300}top:50%; left:24%; right:24%/);
  assert.match(sharedCss, /> footer,/);
  assert.match(sharedCss, /\.rg-tools-row,[\s\S]{0,500}max-width:29% !important/);
  assert.match(sharedCss, /\[data-shared-result-ui="v1"\] \.gsh-result-primary-actions \{[\s\S]{0,180}right:var\(--gsh-safe-r\)/);
  assert.match(sharedCss, /\[data-shared-result-ui="v1"\] \.gsh-result-utility-actions,[\s\S]{0,240}left:var\(--gsh-safe-l\)/);
  assert.match(sharedCss, /data-gsh-game="tone"\] #tf-body \.sg-tone-grid \{[\s\S]{0,160}grid-template-rows:repeat\(3,auto\); grid-auto-flow:column/);
  assert.match(sharedCss, /data-gsh-game="tone"\] #tf-body \.tf-options:has\(> :nth-child\(3\):last-child\) > :first-child/);
  for (const id of ['reading', 'typing']) {
    assert.match(sharedCss, new RegExp(`data-gsh-game="${id}"\\] #pool`), `${id}: lower split-answer zone missing`);
  }
  assert.match(sharedCss, /data-gsh-game="listening"\] #lg-mc-wrap[\s\S]{0,260}grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(sharedCss, /data-gsh-game="listening"\] #lg-type-wrap[\s\S]{0,180}left:29%; right:29%/);
  assert.match(sharedCss, /data-gsh-game="word-order"\] #wo-bank[\s\S]{0,260}grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(sharedCss, /data-gsh-game="lego"\] #baseplate[\s\S]{0,260}left:var\(--gsh-safe-l\); width:28%/);
  assert.match(sharedCss, /data-gsh-game="lego"\] #baseplate \.slot-menu[\s\S]{0,220}right:var\(--gsh-safe-r\)/);
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
  const core5Block = switcherJs.slice(switcherJs.indexOf('var CORE5_TABS'), switcherJs.indexOf('var CORE6_TABS'));
  const ids = Array.from(core5Block.matchAll(/\{ id: '([^']+)'/g), (match) => match[1]);
  assert.deepStrictEqual(ids, ['tone_finder', 'reading_game', 'listening_game', 'typing_game', 'word_order']);
  assert.doesNotMatch(core5Block, /href: '(?:lego|vault|games-challenge)\.html'/);
  assert.match(switcherJs, /var CORE6_TABS = CORE5_TABS\.concat\([\s\S]{0,180}id: 'lego'/, 'Tone Desktop switcher variant must include Lego');
  assert.match(switcherJs, /includeLego \? CORE6_TABS : CORE5_TABS/, 'Core 5 pages without the opt-in must keep the original switcher');
  assert.match(games.find((g) => g.id === 'tone').htmlText, /data-include-lego="1"/, 'Tone must opt into the six-game switcher on every viewport');
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
  assert.match(games.find((g) => g.id === 'listening').htmlText, /shared\.min\.js\?v=40/, 'Listening must load the current shared mapping version');
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
  for (const g of games) assert.match(g.htmlText, /shared\.min\.js\?v=40/, `${g.id}: must load shared exit runtime`);
  assert.match(legoHtml, /shared\.min\.js\?v=40/, 'Lego must load shared exit runtime');
  assert.match(sharedCss, /\.gsh-game-exit-overlay/);
});

test('completed rounds no longer interrupt play with the removed VocabPopup lead flow', () => {
  const legoApp = fs.readFileSync(path.join(root, 'js/games/lego-game-app.js'), 'utf8');
  assert.doesNotMatch(sharedJs, /window\.VocabPopup|vocab_popup_rounds|vocab_popup_shown|id=['"]vp-pop/);
  for (const g of games) assert.doesNotMatch(g.appText, /VocabPopup/, `${g.id}: removed popup trigger remains`);
  assert.doesNotMatch(legoApp, /VocabPopup/, 'lego: removed popup trigger remains');
  assert.ok(fs.existsSync(path.join(root, 'vocab-thank-you.html')), 'public URL must remain untouched');
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
  assert.match(legoHtml, /shared\.min\.js\?v=40/, 'Lego must load the current shared game runtime');
  assert.match(legoHtml, /lego-game-app\.js\?v=12/, 'Lego must load its Guest-only quota runtime');
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
  assert.match(legoHtml, /js\/games\/game-flow\.js\?v=11/, 'Lego Result must use the countdown-free shared flow runtime');
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
    const sharedCssVersion = ['tone', 'reading', 'typing', 'wordorder'].includes(g.id) ? 29 : 26;
    assert.match(g.htmlText, new RegExp(`css/shared\\.css\\?v=${sharedCssVersion}`), `${g.id}: must load current shared game CSS`);
    assert.match(g.htmlText, /js\/core\/shared\.min\.js\?v=40/, `${g.id}: must load shared resume copy`);
    assert.match(g.appText, /GameUiCopy\.resumeLine/, `${g.id}: resume detail must use shared semantic copy`);
  }
});

test('all five games keep one in-memory current-round DTO identity without Login summary', () => {
  for (const g of games) {
    const reportVersion = g.id === 'tone' ? 4 : 3;
    assert.match(g.htmlText, new RegExp(`js/games/round-report\\.js\\?v=${reportVersion}`), `${g.id}: missing Round Report DTO loader`);
    assert.doesNotMatch(g.htmlText, /js\/score\/learning-summary\.js/, `${g.id}: Login summary must stay parked in Minimum Guest Launch`);
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
    const reportVersion = g.id === 'tone' ? 4 : 3;
    assert.match(g.htmlText, new RegExp(`js/games/round-report\\.js\\?v=${reportVersion}`), `${g.id}: must load shared print renderer`);
    assert.match(g.htmlText, /js\/games\/game-flow\.js\?v=11/, `${g.id}: must load countdown-free Result runtime`);
    assert.match(g.appText, /RoundReport\.openPrint/, `${g.id}: print action must use the shared renderer`);
  }
  assert.match(legoHtml, /js\/games\/round-report\.js\?v=3/);
  assert.match(legoHtml, /js\/games\/game-flow\.js\?v=11/);
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
  assert.match(toneSummary, /tfDesktopOrPortrait\(\)[\s\S]{0,180}user_answer[\s\S]{0,100}correct_answer/, 'Tone Result must name the wrong and correct answers on Desktop/Portrait');
  assert.match(toneSummary, /class="tf-score-summary-formula"/, 'Tone Result must separate the weighted-score formula from the total');
  assert.match(toneSummary, /class="tf-result-reward-row"[\s\S]{0,300}tf-score-summary-bonus[\s\S]{0,300}tf-streak-chip/, 'Tone Result must keep reward and streak in one visual row');
  assert.match(toneSummary, /reportResults\.length === total[\s\S]{0,180}!r\.is_skipped && r\.is_correct[\s\S]{0,180}!r\.skipped && r\.firstTry/, 'Tone Result count must use the same first-time-correct evidence as its detail rows');
  assert.doesNotMatch(toneSummary, /perfectCount\s*=\s*results\.filter\(function\(r\)\{ return !r\.skipped && r\.mistakes === 0;/, 'Tone Result must not treat a wrong initial guess as first-time correct');
  assert.match(toneSummary, /class="gsh-end-actions tf-result-actions"/, 'Tone Result must expose its scoped action layout');
  assert.match(games.find((g) => g.id === 'tone').htmlText, /\.tf-result-actions\[data-game-result-actions-normalized="v1"\] \{\s*display:none !important; height:0 !important; margin:0 !important;/, 'Tone Result must not leave the emptied normalized action wrapper as a visual gap');
  assert.match(toneSummary, /data-game-result-replay="v1"[\s\S]{0,300}data-game-result-switch="v1"/, 'Tone Result must keep replay and switch adjacent');
  assert.doesNotMatch(toneSummary, /今日聲調練習：|>完成\s*['"+]|>首次答對/, 'Tone Result must not restore duplicate top metrics');
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
  assert.match(tone, /currentWordGuideIntroPending\s*=\s*!!tfGuideMode\s*&&\s*!tfCurWordNoTools\(\)/, 'Tone: a new guided question must stop at the intro gate');
  assert.match(tone, /currentWordGuideIntroPending[\s\S]{0,500}開始練習/, 'Tone: the intro gate must hide choices behind the explicit start action');
  assert.match(tone, /id="tf-guide-start-btn"[\s\S]{0,180}開始練習/, 'Tone: guided Start must expose a stable Enter target');
  assert.match(tone, /tfOrdinaryDesktop\(\) \? document\.getElementById\('tf-guide-start-btn'\)/, 'Tone: Desktop Enter must prefer guided Start and never infer Skip');
  assert.match(tone, /active\.closest\('\.tf-known-btn'\)[\s\S]{0,120}e\.preventDefault\(\)[\s\S]{0,120}return;/, 'Tone: Enter on the focused Skip action must be blocked');
  assert.match(tone, /startGuidedQuestion:\s*function\(\)[\s\S]{0,520}currentWordGuideIntroPending\s*=\s*false[\s\S]{0,320}navigateToInflection\(\)/, 'Tone: Desktop guided Start must bypass tone choice and enter derivation directly');
  assert.match(tone, /guessRow\s*=\s*\(tfDesktopOrPortrait\(\)\s*&&\s*initialGuess\s*==\s*null\)\s*\?\s*''/, 'Tone: guided Result must not invent an uncertain choice on Desktop or Portrait');
  assert.match(tone, /TF\.skipCurrentWord\(\)[^>]*>跳過<\/button>/, 'Tone: Desktop gameplay must expose neutral 跳過');
  assert.match(tone, /เดาเสียงผิดต้องนับผิด 1 ครั้ง[\s\S]{0,700}recordMistake\([\s\S]{0,140}TF_WORDSCORE\.onWrong\(session\)[\s\S]{0,100}TF_WORDSCORE\.onNextStep\(session\)/, 'Tone: a wrong initial tone answer must count once and drop the score ladder before derivation');
  assert.match(tone, /function tfResetWordScoring\(\)[\s\S]{0,220}currentWordMistakesTotal\s*=\s*0/, 'Tone: each new word must reset its total mistake evidence');
  assert.match(tone, /function recordMistake\([\s\S]{0,900}currentWordMistakesTotal\s*=\s*\(session\.currentWordMistakesTotal \|\| 0\) \+ 1/, 'Tone: every real wrong answer must update the total mistake evidence');
  assert.match(tone, /function tfCommitWordAndAdvance\(opts\)[\s\S]{0,260}var mistakes = session\.currentWordMistakesTotal/, 'Tone: Result must retain mistake totals across syllables');
  assert.match(tone, /skipCurrentWord:\s*function\(\)[\s\S]{0,1500}is_skipped:\s*true[\s\S]{0,240}skip_reason:\s*'user_skip'/, 'Tone: Skip must create neutral result evidence');
  assert.match(tone, /if \(S\.step === 'session-guess' && !tfCurWordNoTools\(\)\)[\s\S]{0,120}currentWordGuideIntroPending\s*=\s*true/, 'Tone: enabling guidance during an active question must return to the explicit start gate');
  assert.match(tone, /function tfArmGuideIntroForPageReturn\(\)[\s\S]{0,400}currentWordGuideIntroPending\s*=\s*true/, 'Tone: returning to a preserved page must re-arm the guided-question gate');
  assert.match(toneMin, /currentWordGuideUsed/, 'Tone: deployed minified bundle must include the zero-lock state');
  assert.match(toneMin, /currentWordMistakesTotal/, 'Tone: deployed minified bundle must preserve the real wrong-answer total');
  assert.match(toneMin, /聲調選擇錯誤/, 'Tone: deployed minified bundle must charge a wrong initial tone answer');
  assert.match(toneMin, /開始練習/, 'Tone: deployed minified bundle must include the guided-question gate');
  assert.match(toneMin, /pageshow/, 'Tone: deployed minified bundle must include the page-return guard');
  assert.match(toneGame.htmlText, /tone-finder-game\.min\.js\?v=71/, 'Tone: page must request the rebuilt Result runtime version');
});

test('Tone Mobile Portrait keeps Desktop gameplay with compact touch-only controls', () => {
  const tone = games.find((g) => g.id === 'tone');
  assert.match(tone.appText, /function tfMobilePortrait\(\)[\s\S]{0,180}max-width: 768px[\s\S]{0,100}orientation: portrait/, 'Tone must identify only Portrait mobile');
  assert.match(tone.appText, /function tfWireToneKeyboard\(\)[\s\S]{0,140}if \(tfMobilePortrait\(\)\) return;/, 'Portrait must ignore number-key gameplay');
  assert.match(tone.appText, /function tfWireEnterNext\(\)[\s\S]{0,140}if \(tfMobilePortrait\(\)\) return;/, 'Portrait must ignore Enter gameplay');
  assert.match(tone.appText, /\(tfMobilePortrait\(\) \? '' : '<div[\s\S]{0,220}電腦也可以直接按鍵盤 1–5/, 'Portrait must omit the computer keyboard hint');
  assert.match(tone.appText, /body\.innerHTML \+= tfDesktopOrPortrait\(\)[\s\S]{0,240}>跳過<\/button>/, 'Portrait must use the neutral Skip action');
  assert.match(tone.appText, /startGuidedQuestion:[\s\S]{0,300}if \(tfDesktopOrPortrait\(\)\)[\s\S]{0,180}navigateToInflection\(\)/, 'Portrait Hint must enter derivation directly');
  assert.match(tone.htmlText, /@media \(max-width:768px\) and \(orientation:portrait\)[\s\S]{0,12000}\.gsh-next-countdown,[\s\S]{0,220}\{ display:none !important; \}/, 'Portrait must render no countdown surface');
  assert.match(tone.htmlText, /\.sg-tone-btn \{[\s\S]{0,180}width:clamp\(44px,12vw,52px\)/, 'Portrait tone choices must stay compact and tappable');
  assert.match(tone.htmlText, /\.gsh-resume-actions button \{[\s\S]{0,180}min-height:34px/, 'Portrait Resume must stay compact in the Desktop position');
  assert.match(tone.htmlText, /gsh-shell:has\(> \.gsh-resume-banner[^}]+> \.gsh-gameplay \{[\s\S]{0,80}display:none !important/, 'Portrait Resume must remain the same exclusive pre-play state as Desktop');
  assert.match(tone.htmlText, /\.tf-page \{[\s\S]{0,100}padding-top:10px;/, 'Portrait must not count the fixed navigation height twice above the Tone title');
  assert.match(tone.htmlText, /\.tf-result-login-card \{[\s\S]{0,180}padding-top:12px !important; padding-bottom:12px !important;[\s\S]{0,100}line-height:1\.5 !important;/, 'Portrait Result login card must keep equal top and bottom spacing');
  assert.match(tone.htmlText, /\.tf-result-login-card button \{[\s\S]{0,100}display:block; margin:9px auto 0 !important;/, 'Portrait Result login button must stay visibly separated from its copy');
  assert.match(tone.htmlText, /game-switcher\.js\?v=4/, 'Tone must request the Lego-capable switcher');
  assert.match(tone.htmlText, /點選 1–5 就可以。/, 'Portrait Tour must not advertise computer keyboard controls');
});

test('active Desktop D4-D5 keeps manual question/result flow and optional Hint carry-off', () => {
  const tone = games.find((g) => g.id === 'tone');
  const reading = games.find((g) => g.id === 'reading');
  const typing = games.find((g) => g.id === 'typing');
  const wordOrder = games.find((g) => g.id === 'wordorder');
  const flow = fs.readFileSync(path.join(root, 'js/games/game-flow.js'), 'utf8');

  for (const game of [tone, reading, typing, wordOrder]) {
    assert.match(game.htmlText, /css\/shared\.css\?v=29/, `${game.id}: must request the D4 Desktop CSS`);
    assert.match(game.appText, /GameFlow\.enhanceResult/, `${game.id}: Result must keep the shared manual replay flow`);
  }
  assert.doesNotMatch(flow, /下一輪將在|game_auto_next_pause/, 'shared question/Result flow must not restore countdown copy or pause controls');
  assert.match(flow, /event\.key !== 'Enter'[\s\S]{0,1200}button\.click\(\)/, 'Result Enter must replay only through the visible shared action');

  assert.match(tone.appText, /nextBtnLabel\s*=\s*session\s*\?\s*'下一題 →'/, 'Tone question transition must use 下一題');
  assert.match(tone.appText, /tfGuideMode\s*&&\s*\(!isMultiSyl\s*\|\|\s*isLastSyl\)[\s\S]{0,240}gsh-desktop-hint-off[\s\S]{0,120}TF\.toggleGuide\(\)/, 'Tone must offer optional Hint-off only at the end of a question');
  assert.match(tone.htmlText, /result-v2-actions \.gsh-desktop-hint-off \{ order:1; \}[\s\S]{0,140}result-v2-actions #tf-session-next-btn \{ order:2; \}/, 'Tone Desktop must order Hint-off before Next');
  assert.match(tone.htmlText, /#tf-session-counter \{[\s\S]{0,180}align-items:center; justify-content:center;[\s\S]{0,120}line-height:24px/, 'Tone Desktop counter must be vertically centered');
  assert.match(tone.htmlText, /\.tf-tools-row \{ gap:10px; margin-bottom:10px; \}[\s\S]{0,180}\.gsh-session-header \{ gap:10px; padding:0 0 10px; \}/, 'Tone Desktop utility, level and counter rows must use one vertical rhythm');
  assert.match(tone.appText, /function tfFinalizeAlignedResultPresentation\(root\)[\s\S]{0,420}tfDesktopOrPortrait\(\)[\s\S]{0,220}data-game-result-meta="v1"[\s\S]{0,220}gsh-result-shared-details/, 'Tone Desktop/Portrait must remove the duplicated shared Result summary after runtime normalization');
  assert.match(tone.appText, /GameFlow\.enhanceResult\([\s\S]{0,700}tfFinalizeAlignedResultPresentation\(body\)/, 'Tone must clean the shared Result only after the shared runtime has assembled it');
  assert.match(tone.htmlText, /\.gsh-result-primary-actions \{[\s\S]{0,180}grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/, 'Tone Result replay and game-switch actions must use the actual normalized two-button row');
  const finalizeStart = tone.appText.indexOf('function tfFinalizeAlignedResultPresentation(root)');
  const finalizeEnd = tone.appText.indexOf('\n}\n\nfunction stepSessionSummary', finalizeStart) + 2;
  const finalizeResult = vm.runInNewContext(`(${tone.appText.slice(finalizeStart, finalizeEnd)})`, { tfDesktopOrPortrait: () => true });
  const removedSharedResultNodes = [];
  finalizeResult({
    querySelector(selector) {
      return { remove() { removedSharedResultNodes.push(selector); } };
    },
  });
  assert.deepStrictEqual(Array.from(removedSharedResultNodes), ['[data-game-result-meta="v1"]', '.gsh-result-shared-details'], 'Tone must remove both duplicated runtime blocks after assembly');
  assert.match(tone.appText, /tf-level-select tf-alpha-surface/g, 'Tone alphabet pages must share one complete color surface');
  assert.match(reading.htmlText, /id="btn-next"[^>]*>下一題 →<\/button>[\s\S]{0,260}id="rg-hint-off-next"[^>]+data-visible="false"[^>]+setRgGuideMode\(false\)[^>]*>關閉提示<\/button>/, 'Reading feedback must keep manual Next plus optional Hint-off');
  assert.match(typing.htmlText, /id="btn-next"[^>]*>下一題 →<\/button>[\s\S]{0,260}id="tg-hint-off-next"[^>]+data-visible="false"[^>]+tgChooseGuideMode\(false\)[^>]*>關閉提示<\/button>/, 'Typing feedback must keep manual Next plus optional Hint-off');
  assert.match(reading.appText, /function rgSyncHintOffAction\(\)[\s\S]{0,360}rgGuideMode[\s\S]{0,160}nextButton\.style\.display!==['"]none['"]/, 'Reading Hint-off visibility must follow the carried Hint state and visible Next action');
  assert.match(typing.appText, /function tgSyncHintOffAction\(\)[\s\S]{0,360}guideMode[\s\S]{0,160}nextButton\.style\.display!==['"]none['"]/, 'Typing Hint-off visibility must follow the carried Hint state and visible Next action');
  assert.match(sharedCss, /\.gsh-desktop-hint-off \{ display:none !important; \}/, 'Hint-off action must default to hidden outside ordinary Desktop');
  assert.match(sharedCss, /@media \(min-width:769px\) and \(min-height:601px\)[\s\S]*?gsh-desktop-hint-off\[data-visible="true"\] \{ display:inline-flex !important; \}/, 'Hint-off action must become available only in ordinary Desktop');

  assert.match(wordOrder.htmlText, /id="wo-next-btn"[^>]*>下一題 →<\/button>/, 'Word Order button must use 下一題');
  assert.match(wordOrder.appText, /document\.addEventListener\('keydown'[\s\S]*?event\.key!==['"]Enter['"][\s\S]*?nextButton\.click\(\)[\s\S]{0,80}true\);/, 'Word Order Enter must trigger the enabled visible Next action once');
});

console.log(`\n${passed} shared Phase 1 game-system tests passed.`);
