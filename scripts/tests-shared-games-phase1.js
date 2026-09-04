#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const sharedCss = fs.readFileSync(path.join(root, 'css/shared.css'), 'utf8');
const mobileLandscapeCss = fs.readFileSync(path.join(root, 'css/mobile-landscape.css'), 'utf8');
const sharedJs = fs.readFileSync(path.join(root, 'js/core/shared.js'), 'utf8');
const sharedMin = fs.readFileSync(path.join(root, 'js/core/shared.min.js'), 'utf8');
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
  assert.doesNotMatch(tone, /ANN-BAND|ann-band|avail-band/, 'Tone must contain no announcement DOM, marker, or CSS-hide hook');
  assert.match(tone, /@media \(min-width:1025px\), \(min-width:769px\) and \(min-height:601px\)[\s\S]{0,420}#tf-syl-strip\[style\*="display: flex"\] \+ \.tf-body\s*\{\s*padding-top:0;/, 'Tone syllable spacing must cover tall and wide-short Desktop without changing mobile landscape');
});

test('all five games expose the locked shared header, score and resume semantics', () => {
  for (const g of games) {
    assert.match(g.htmlText, /gsh-page-header/, `${g.id}: header ยังไม่ใช้ shared contract`);
    if (g.id === 'tone') assert.match(g.htmlText, /id="tf-session-counter"/, 'tone: compact session host หาย');
    else if (g.id !== 'listening') assert.match(g.htmlText, /gsh-progress/, `${g.id}: score surface ยังไม่ใช้ shared contract`);
    assert.match(g.htmlText, new RegExp(`id="${g.resume}"[^>]+role="region"[^>]+aria-label="繼續上次練習"`), `${g.id}: resume ไม่มี region label`);
  }
  for (const id of ['tone', 'reading', 'typing']) {
    assert.match(games.find((g) => g.id === id).htmlText, /gsh-level-selector[^>]+aria-label="選擇等級"/, `${id}: level selector ยังไม่ใช้ shared contract`);
  }
  assert.match(games.find((g) => g.id === 'typing').htmlText, /<div class="card gsh-gameplay" id="game">/, 'Typing: gameplay class ต้องอยู่บน outer game card');
});

test('active Desktop games keep the canonical level, status and gameplay order', () => {
  for (const id of ['tone', 'reading', 'typing']) {
    const html = games.find((g) => g.id === id).htmlText;
    const toolsAt = html.indexOf(id === 'tone' ? '<div class="tf-tools-row">' : '<div class="rg-tools-row">');
    const sessionAt = html.indexOf('<div class="gsh-session-header">', toolsAt);
    const resumeAt = html.indexOf('class="gsh-resume-banner"', sessionAt);
    const gameplayAt = html.indexOf('gsh-gameplay', resumeAt);
    assert.ok(toolsAt > -1 && sessionAt > toolsAt && resumeAt > sessionAt && gameplayAt > resumeAt, `${id}: Desktop order must be account/tools → level/status → resume → gameplay`);
  }
  assert.match(sharedCss, /@media \(min-width:769px\) and \(min-height:601px\)\{[\s\S]*?data-gsh-game="tone"\] \.gsh-session-header,[\s\S]*?data-gsh-game="reading"\] \.gsh-session-header,[\s\S]*?data-gsh-game="typing"\] \.gsh-session-header \{[\s\S]*?flex-direction:column; flex-wrap:nowrap;/, 'ordinary Desktop games with Level must keep Level and round status on two rows');
  const wordOrder = games.find((g) => g.id === 'wordorder').htmlText;
  assert.doesNotMatch(wordOrder, /gsh-level-selector/, 'Word Order must not invent a level selector');
  const woSessionAt = wordOrder.indexOf('<div class="gsh-session-header">');
  const woGameplayAt = wordOrder.indexOf('<div id="game" class="card gsh-gameplay">');
  const woScoreAt = wordOrder.indexOf('class="bars-wrap gsh-progress"', woGameplayAt);
  assert.ok(woSessionAt > -1 && woGameplayAt > woSessionAt && woScoreAt > woGameplayAt, 'Word Order keeps its game-owned single-level status in the shared fixed Session slot before the item-score row');
});

test('Tone keeps one original four-button Level and alphabet row on every supported surface', () => {
  const tone = games.find((g) => g.id === 'tone').htmlText;
  const header = tone.slice(tone.indexOf('<div class="gsh-session-header">'), tone.indexOf('<div class="gsh-resume-banner"'));
  assert.strictEqual((header.match(/class="tf-ltab"/g) || []).length, 4, 'Tone header must contain exactly four equal buttons');
  assert.match(header, /id="tf-ltab-1"[\s\S]*id="tf-ltab-2"[\s\S]*id="tf-ltab-3"[\s\S]*id="tf-alpha-btn"/, 'Tone order must be 初級 → 中級 → 高級 → 字母練習區');
  assert.strictEqual((tone.match(/id="tf-alpha-btn"/g) || []).length, 1, 'Tone alphabet entry must remain a single button');
  assert.match(tone, /@media \(min-width:769px\) and \(min-height:601px\)[\s\S]{0,700}gsh-session-header > \.gsh-level-selector[\s\S]{0,180}grid-template-columns:repeat\(4,minmax\(0,1fr\)\)[\s\S]{0,120}max-width:640px !important/, 'Desktop must show four equal buttons in one full row');
  assert.match(tone, /#tf-session-counter:empty \{\s*display:none; min-height:0; line-height:0;/, 'Tone must remove the empty counter row before Result and detail cards');
  assert.match(tone, /@media \(max-width:768px\) and \(orientation:portrait\)[\s\S]{0,1900}\.tf-level-tabs \{[\s\S]{0,180}grid-template-columns:repeat\(4,minmax\(0,1fr\)\)[\s\S]{0,100}max-width:none !important/, 'Portrait must show four equal buttons across the available width');
  assert.match(tone, /@media \(max-width:768px\) and \(orientation:portrait\)[\s\S]{0,1500}\.gsh-session-header \{[\s\S]{0,140}flex-direction:column; flex-wrap:nowrap; gap:10px; padding:0 0 10px;[\s\S]{0,180}\.gsh-session-header > \.gsh-level-selector \{ flex:none; \}[\s\S]{0,120}\.gsh-gameplay \{ margin-top:0; \}/, 'Tone Portrait round status must keep equal 10px gaps between Level and gameplay');
  assert.match(tone, /#tf-alpha-btn \{[\s\S]{0,180}font-size:11\.5px !important; white-space:nowrap;[\s\S]{0,100}#tf-alpha-btn \.tf-alpha-icon \{ display:none; \}/, 'Portrait alphabet label must fit without changing the four equal button widths');
  assert.doesNotMatch(tone, /@media \(orientation:landscape\) and \(max-width:1024px\) and \(max-height:600px\)[\s\S]{0,180}#tf-alpha-btn \{ display:none !important; \}/, 'Mobile Landscape must expose the original Desktop alphabet action');
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
    const sharedVersion = ['tone', 'reading', 'typing', 'word-order'].includes(id) ? 38 : id === 'lego' ? 36 : 37;
    assert.match(html, new RegExp(`css/shared\\.css\\?v=${sharedVersion}`), `${id}: must load its locked shared CSS version`);
  }
  assert.match(sharedCss, /@media \(orientation:landscape\) and \(max-width:1024px\) and \(max-height:600px\)/);
  assert.match(sharedCss, /\.rg-ctl-wrap \{[\s\S]{0,260}top:var\(--gsh-safe-t\); left:50%/);
  assert.match(sharedCss, /\.rg-ctl-wrap \{[\s\S]{0,520}flex-direction:row !important/);
  assert.match(sharedCss, /#mina-toast,[\s\S]{0,100}#tf-mina-toast \{ display:none !important; \}/);
  assert.doesNotMatch(sharedCss, /#gc-cap-banner/, 'removed Login cap popup must not retain a Landscape presentation');
  assert.match(sharedCss, /\.gsh-resume-banner \{[\s\S]{0,300}top:50%; left:24%; right:24%/);
  assert.match(sharedCss, /> footer,/);
  assert.match(sharedCss, /\.rg-tools-row,[\s\S]{0,500}max-width:29% !important/);
  assert.match(sharedCss, /\[data-shared-result-ui="v1"\] \.gsh-result-primary-actions \{[\s\S]{0,180}right:var\(--gsh-safe-r\)/);
  assert.match(sharedCss, /\[data-shared-result-ui="v1"\] \.gsh-result-utility-actions,[\s\S]{0,240}left:var\(--gsh-safe-l\)/);
  assert.doesNotMatch(sharedCss, /data-gsh-game="tone"\] #tf-body \.sg-tone-grid/);
  assert.doesNotMatch(sharedCss, /data-gsh-game="reading"\] #pool/);
  assert.doesNotMatch(sharedCss, /data-gsh-game="typing"\] #pool/);
  assert.doesNotMatch(sharedCss, /data-gsh-game="word-order"\] #wo-bank/);
  assert.match(mobileLandscapeCss, /data-gsh-ml-split="tone"/);
  assert.match(mobileLandscapeCss, /data-gsh-ml-split="reading"/);
  assert.match(mobileLandscapeCss, /data-gsh-game="typing"/);
  assert.match(mobileLandscapeCss, /data-gsh-ml-split="word-order"/);
  assert.match(mobileLandscapeCss, /--wo-ml-choice-row:\s*34px[\s\S]{0,120}grid-auto-rows:\s*var\(--wo-ml-choice-row\)\s*!important/, 'Word Order choices must size rows from enabled reading and translation content');
  assert.match(mobileLandscapeCss, /overflow-y:\s*auto/, 'Word Order choices must scroll vertically only when their content overflows');
  assert.match(mobileLandscapeCss, /\[data-gsh-ml-split="word-order"\] > \.wo-tile \{[\s\S]{0,700}flex-direction:\s*column/, 'Word Order choice details must stack below the Thai word');
  assert.match(sharedCss, /data-gsh-game="listening"\] #lg-mc-wrap[\s\S]{0,260}grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(sharedCss, /data-gsh-game="listening"\] #lg-type-wrap[\s\S]{0,180}left:29%; right:29%/);
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

test('shared switcher renders the fixed six games plus 我的單字庫 in canonical order', () => {
  const core5Block = switcherJs.slice(switcherJs.indexOf('var CORE5_TABS'), switcherJs.indexOf('var CORE6_TABS'));
  const ids = Array.from(core5Block.matchAll(/\{ id: '([^']+)'/g), (match) => match[1]);
  assert.deepStrictEqual(ids, ['tone_finder', 'reading_game', 'listening_game', 'typing_game', 'word_order']);
  assert.doesNotMatch(core5Block, /href: '(?:lego|vault|games-challenge)\.html'/);
  assert.match(switcherJs, /var CORE6_TABS = CORE5_TABS\.concat\([\s\S]{0,180}id: 'lego'/, 'fixed game switcher must include Lego sixth');
  assert.match(switcherJs, /var tabs = CORE6_TABS\.concat\(\[VAULT_TAB\]\)/, 'every game must use the same six-game menu plus library route');
  assert.match(switcherJs, /var VAULT_TAB = \{ id: 'vault', href: 'vault\.html', label: '🔖 我的單字庫'/, 'all game switchers must append the approved library route');
  assert.match(switcherJs, /data-vault-portrait-entry/, 'Portrait bottom navigation must expose the additional Vault route');
  assert.match(switcherJs, /DOMContentLoaded[\s\S]{0,180}addPortraitVaultEntry/, 'Portrait Vault route must wait for late bottom-navigation markup');
  assert.match(switcherJs, /if \(current === 'vault'\) tabs = tabs\.filter/, 'Vault must not render a self entry');
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
  assert.match(games.find((g) => g.id === 'listening').htmlText, /shared\.min\.js\?v=47/, 'Listening keeps its unchanged announcement-free shared runtime');
});

test('all game pages permanently omit the automatic Login cap popup', () => {
  const gameContentClient = fs.readFileSync(path.join(root, 'js/games/game-content-client.js'), 'utf8');
  const legoHtml = fs.readFileSync(path.join(root, 'lego.html'), 'utf8');
  assert.doesNotMatch(gameContentClient, /gc-cap-banner|showCapBanner|gc_cap_banner_shown|gc-cap-login-btn/);
  assert.doesNotMatch(gameContentClient, /免費內容你都練過一輪|登入帳號（完全免費）可以解鎖更多/);
  for (const g of games) {
    assert.doesNotMatch(g.htmlText, /gc-cap-banner/, `${g.id}: removed Login popup marker remains`);
    const contentClientVersion = ['tone', 'reading', 'typing'].includes(g.id) ? 13 : 12;
    assert.match(g.htmlText, new RegExp('game-content-client\\.js\\?v=' + contentClientVersion), `${g.id}: must load the popup-free game content client`);
  }
  assert.doesNotMatch(legoHtml, /gc-cap-banner|免費內容你都練過一輪|登入帳號（完全免費）可以解鎖更多/);
});

test('all scoped pages use one fail-closed Login surface and game pages permanently remove announcements', () => {
  const loginCss = fs.readFileSync(path.join(root, 'css/login-surface.css'), 'utf8');
  const loginJs = fs.readFileSync(path.join(root, 'js/core/login-surface.js'), 'utf8');
  const minimumGuest = fs.readFileSync(path.join(root, 'js/core/minimum-guest-launch.js'), 'utf8');
  const readingAuth = fs.readFileSync(path.join(root, 'js/games/reading-auth.js'), 'utf8');
  const toneApp = fs.readFileSync(path.join(root, 'js/games/tone-finder-game.js'), 'utf8');
  const gamePages = [
    'tone-finder.html', 'reading-game.html', 'listening-game.html', 'typing-game.html', 'word-order.html', 'lego.html'
  ];
  const nonGameScopedPages = [
    'games.html', 'games-practice.html', 'games-challenge.html',
    'my-progress.html', 'vault.html', 'all-board.html', 'leaderboard.html', 'reading-board.html',
    'listening-board.html', 'typing-board.html', 'word-order-board.html'
  ];
  assert.equal(fs.existsSync(path.join(root, 'lego-board.html')), false, 'Lego leaderboard placeholder page must not exist');
  assert.equal(fs.existsSync(path.join(root, 'mix-board.html')), false, 'Challenge leaderboard placeholder page must not exist');
  for (const file of gamePages) {
    const html = fs.readFileSync(path.join(root, file), 'utf8');
    assert.doesNotMatch(html, /ANN-BAND|ann-band|avail-band|annDismissed|annGoTo|annPrev|annNext/, `${file}: announcement DOM/marker/script/style hook must be removed`);
    assert.match(html, file === 'lego.html' ? /minimum-guest-launch\.js\?v=9/ : /minimum-guest-launch\.js\?v=11/, `${file}: must load the Reading-authority Login gate`);
    assert.match(html, /shared\.min\.js\?v=(?:47|50)/, `${file}: must load the announcement-free game runtime`);
  }
  for (const file of nonGameScopedPages) {
    const html = fs.readFileSync(path.join(root, file), 'utf8');
    assert.match(html, /<!--ANN-BAND:START--><!-- Login UI scope: no announcement strip\. --><!--ANN-BAND:END-->/, `${file}: existing non-game announcement capability boundary must remain`);
    assert.match(html, /minimum-guest-launch\.js\?v=9/, `${file}: must load the Reading-authority Login gate`);
    assert.match(html, file === 'vault.html' ? /shared\.min\.js\?v=47/ : /shared\.min\.js\?v=45/, `${file}: non-game cache binding must stay on its current runtime`);
  }
  assert.doesNotMatch(sharedJs, /suppressScopedAnnouncement|staleScopedAnnouncement|avail-band-placeholder/);
  assert.doesNotMatch(sharedMin, /suppressScopedAnnouncement|staleScopedAnnouncement|avail-band-placeholder/);
  assert.doesNotMatch(sharedJs, /band\s*=\s*document\.createElement\('div'\)[\s\S]{0,180}band\.id\s*=\s*'ann-band'/, 'shared runtime must not dynamically create an announcement band');
  assert.match(sharedJs, /var band = document\.body && !document\.body\.hasAttribute\('data-gsh-game'\)[\s\S]{0,100}document\.getElementById\('ann-band'\)[\s\S]{0,100}if \(band &&/, 'non-game pages may hydrate only an existing static announcement');
  assert.match(sharedMin, /document\.body&&!document\.body\.hasAttribute\("data-gsh-game"\)\?document\.getElementById\("ann-band"\):null/, 'deployed shared runtime must keep the non-game announcement guard');
  assert.doesNotMatch(sharedCss, /(^|[},]\s*)\.avail-band\s*\{/m, 'announcement CSS must never target an unscoped game surface');
  assert.match(minimumGuest, /window\.MRT_PARKED_ACCOUNT_SURFACE = parked\.test\(path\)/);
  assert.match(minimumGuest, /loginController\.src = 'js\/core\/login-surface\.js\?v=8'/, 'public pages must request the one-minute OTP Login controller');
  assert.doesNotMatch(minimumGuest, /location\.replace\('\/games\.html\?guest_launch=1'\)/);
  assert.match(loginJs, /'tone-finder\.html'[\s\S]*'reading-game\.html'[\s\S]*'listening-game\.html'[\s\S]*'typing-game\.html'[\s\S]*'word-order\.html'[\s\S]*'lego\.html'/);
  assert.match(loginJs, /function sourceFilename\(pathname\)[\s\S]{0,520}if \(filename\.indexOf\('\.'\) === -1\) filename \+= '\.html'[\s\S]{0,120}var filename = sourceFilename\(window\.location\.pathname\)/, 'Cloudflare extensionless routes must resolve to canonical Login page keys');
  const filenameStart = loginJs.indexOf('function sourceFilename(pathname)');
  const filenameEnd = loginJs.indexOf('\n\n  var filename = sourceFilename', filenameStart);
  const filenameContext = {};
  vm.runInNewContext(loginJs.slice(filenameStart, filenameEnd) + '\nthis.sourceFilename = sourceFilename;', filenameContext);
  assert.equal(filenameContext.sourceFilename('/tone-finder'), 'tone-finder.html', 'Production extensionless game route must activate the Tone Login surface');
  assert.equal(filenameContext.sourceFilename('/vault'), 'vault.html', 'Production extensionless account route must activate the Vault Login surface');
  assert.equal(filenameContext.sourceFilename('/reading-game.html'), 'reading-game.html', 'local .html preview route must remain unchanged');
  assert.match(loginJs, /function readingHeader\(title, subtitle\)/, 'all six game headers must use the one Reading template');
  assert.match(loginJs, /function readingSlot\(sourceSlot\) \{[\s\S]{0,120}document\.createElement\('div'\)/, 'every scoped page must use Reading exact DIV Login slot markup');
  assert.match(loginJs, /function readingSurface\(slot, withHelp, originalHelp\)/, 'all scoped pages must use the one Reading Account Bar template');
  assert.match(loginJs, /readingHost\(true,[\s\S]{0,120}true, gameState\.help\)/, 'game pages must use the Reading Login + Help variant');
  assert.match(loginJs, /readingHost\(false, '', '', slot, false, null\)/, 'non-game pages must use only the no-Help structural variant');
  const readingHtml = fs.readFileSync(path.join(root, 'reading-game.html'), 'utf8');
  const readingProfileStyle = readingHtml.match(/<div id="rg-profile-wrap" class="gsh-player-status" style="([^"]+)"/)[1];
  const readingSlotStyle = readingHtml.match(/<div id="rg-login-slot" style="([^"]+)"/)[1];
  assert.ok(loginJs.includes(`surface.setAttribute('style', '${readingProfileStyle}')`), 'shared template must copy the exact Reading profile markup style');
  assert.ok(loginJs.includes(`slot.setAttribute('style', '${readingSlotStyle}')`), 'shared template must copy the exact Reading Login-slot style');
  assert.match(loginJs, /help\.className = 'tf-streak-chip mrt-login-howto'[\s\S]{0,320}help\.textContent = '📖 玩法'/, 'game Help must use the Reading class/order/copy');
  assert.match(loginJs, /stats\.className = 'rg-stat-row'[\s\S]{0,180}stats\.setAttribute\('style', 'display:none;justify-content:flex-start;margin:0;width:auto;max-width:none;gap:8px;'\)/, 'shared template must retain Reading hidden stat slot');
  assert.match(loginJs, /cta\.id = 'rg-cta-login'[\s\S]{0,120}cta\.setAttribute\('style', 'flex:1;min-width:220px;'\)/, 'shared template must retain Reading hidden CTA slot');
  assert.match(loginCss, /\[data-reading-login-component="header"\][\s\S]{0,520}font-size: clamp\(20px, 4vw, 28px\) !important;/, 'header geometry must come from Reading');
  assert.match(loginCss, /\[data-reading-login-component="row"\][\s\S]{0,320}max-width: 640px;[\s\S]{0,80}padding-bottom: 2px;/, 'Account Bar outer geometry must come from Reading');
  assert.match(loginCss, /#rg-profile-wrap:not\(:has\(\.mrt-login-howto\)\)[\s\S]{0,100}justify-content: center !important;/, 'single Login must be centered by Help omission only');
  assert.doesNotMatch(loginCss, /data-gsh-game=|tone|listening|typing|word-order|lego/i, 'Login CSS must not contain a page-specific substitute geometry');
  assert.match(loginJs, /activateLegacyLandscapeSurface\(\)[\s\S]{0,1800}gameState\.header\.insertAdjacentElement\('afterend', gameState\.row\)/, 'Mobile Landscape must restore the existing per-game surface');
  assert.match(loginCss, /@media \(orientation: landscape\) and \(max-width: 1024px\) and \(max-height: 600px\)[\s\S]{0,180}\.mrt-login-surface,[\s\S]{0,100}display: none !important;/, 'Mobile Landscape must show no Login');
  assert.match(readingAuth, /id="rg-login-btn" class="mrt-login-button"/, 'Reading provider flow must own the standardized Login button');
  assert.doesNotMatch(toneApp, /tf-result-login-card|tone_finder_summary_login_click/, 'Tone Result must not create a second Login CTA');

  for (const file of ['my-progress.html', 'vault.html', 'leaderboard.html', 'reading-board.html', 'listening-board.html', 'typing-board.html', 'word-order-board.html']) {
    const html = fs.readFileSync(path.join(root, file), 'utf8');
    assert.doesNotMatch(html, /document\.open\(\)|location\.replace\(target\)/, `${file}: direct Login surface must not redirect`);
  }
  for (const file of ['my-progress.html', 'leaderboard.html', 'reading-board.html', 'listening-board.html', 'typing-board.html', 'word-order-board.html']) {
    const html = fs.readFileSync(path.join(root, file), 'utf8');
    assert.match(html, /type="text\/plain" data-mrt-parked-runtime/, `${file}: data runtime must remain parked`);
  }
  const vaultHtml = fs.readFileSync(path.join(root, 'vault.html'), 'utf8');
  assert.match(vaultHtml, /<script src="js\/score\/personal-search\.js\?v=2"><\/script>[\s\S]*<script src="js\/score\/personal-content\.js\?v=5"><\/script>/, 'Vault Personal Search runtime must be active');
  assert.doesNotMatch(vaultHtml, /data-mrt-parked-runtime src="js\/score\/(?:personal-search|personal-content)/, 'Vault Personal Search runtime must not stay parked');
  assert.doesNotMatch(vaultHtml, /id="game-switcher"[^>]+data-current="vault"[^>]+data-wm-done=/, 'Vault must not need a page-local fallback-menu suppression marker');
});

test('all six games keep the right-side vertical control stack on Desktop and Portrait', () => {
  const lego = fs.readFileSync(path.join(root, 'lego.html'), 'utf8');
  const tone = games.find((g) => g.id === 'tone').htmlText;
  for (const game of games) {
    const sharedVersion = game.id === 'listening' ? 37 : 38;
    assert.match(game.htmlText, new RegExp(`css/shared\\.css\\?v=${sharedVersion}`), `${game.id}: must bind the current shared positioning layer`);
  }
  assert.match(lego, /css\/shared\.css\?v=36/, 'Lego must bind the current shared positioning layer');
  assert.match(sharedCss, /SHARED PAGE POSITIONING — Tone-authoritative Desktop \+ Portrait/);
  assert.match(sharedCss, /body\[data-gsh-game\] \.rg-ctl-wrap \{[\s\S]{0,220}right:12px !important;[\s\S]{0,180}bottom:calc\(60px \+ env\(safe-area-inset-bottom,0px\)\) !important;[\s\S]{0,320}flex-direction:column !important;[\s\S]{0,120}align-items:flex-end !important;/);
  assert.doesNotMatch(sharedCss, /SHARED PAGE POSITIONING[\s\S]*?(?:width:148px|height:44px|grid-template-columns:repeat\(3,44px\))[\s\S]*?Locked Phase 1\.2 playability/, 'shared positioning must not resize Tone floating controls');
  assert.match(sharedCss, /body\[data-gsh-game\] \.rg-ctl-wrap > #game-switcher,[\s\S]{0,260}bottom:calc\(100% \+ 8px\) !important;/);
  assert.match(sharedCss, /@media \(max-width:768px\) and \(orientation:portrait\)[\s\S]{0,1000}html body\[data-gsh-game\] \.rg-ctl-wrap \{[\s\S]{0,240}right:12px !important;[\s\S]{0,160}width:max-content !important;[\s\S]{0,220}flex-direction:column !important;[\s\S]{0,180}align-items:flex-end !important;[\s\S]{0,160}gap:10px !important;/, 'Portrait must keep all controls in one right-side vertical stack');
  assert.doesNotMatch(sharedCss, /html body\[data-gsh-game\] \.rg-ctl-wrap > \.rg-ctl-fab\[aria-label="遊戲選單"\][\s\S]{0,120}display:none !important;/, 'Portrait must keep the floating game action visible');
  assert.doesNotMatch(tone, /data-gsh-game="tone"\] \.rg-ctl-wrap \{/, 'Tone must not fork the shared control axis');
  assert.doesNotMatch(tone, /data-gsh-game="tone"\] \.rg-ctl-wrap > #game-switcher/, 'Tone must not fork the shared menu anchor');
  assert.match(sharedCss, /@media \(orientation:landscape\) and \(max-width:1024px\) and \(max-height:600px\)/, 'separate Mobile Landscape boundary must remain');
  assert.match(sharedJs, /fab\.className = 'rg-ctl-fab rg-focus-fab'/, 'focus control needs one stable shared hook');
  assert.match(sharedJs, /@media\(orientation:landscape\) and \(max-width:1024px\) and \(max-height:600px\)\{body\[data-gsh-game\] \.rg-focus-fab\{display:none !important;\}\}/, 'Mobile Landscape must hide only the floating focus control');
});

test('Core 5 retain original skip placement and game-owned dimensions', () => {
  const tone = games.find((g) => g.id === 'tone');
  const reading = games.find((g) => g.id === 'reading').htmlText;
  const listening = games.find((g) => g.id === 'listening').htmlText;
  const typing = games.find((g) => g.id === 'typing').htmlText;
  const wordOrder = games.find((g) => g.id === 'wordorder').htmlText;
  const lego = fs.readFileSync(path.join(root, 'lego.html'), 'utf8');
  assert.doesNotMatch(sharedCss, /gsh-skip-slot|gsh-skip-action|--gsh-skip-/, 'the positioning layer must not introduce skip dimensions');
  assert.doesNotMatch(tone.htmlText, /gsh-skip-slot|data-gsh-action-slot/);
  assert.match(tone.appText, /body\.innerHTML \+= '<div class="tf-known-bar">[\s\S]{0,220}TF\.skipCurrentWord\(\)/, 'Tone must expose neutral Skip on every layout');
  assert.match(listening, /<div class="btn-row">\s*<button class="btn btn-secondary" id="lg-skip-btn"/, 'Listening must keep its original Skip button row');
  for (const [id, html] of [['reading', reading], ['typing', typing], ['wordorder', wordOrder], ['lego', lego]]) {
    assert.doesNotMatch(html, /gsh-skip-slot|data-gsh-action-slot/, `${id}: no synthetic empty skip row may resize gameplay`);
  }
});

test('Lego keeps PR98 lower gameplay and participates only through Login', () => {
  const lego = fs.readFileSync(path.join(root, 'lego.html'), 'utf8');
  assert.match(lego, /id="rg-login-slot"/, 'Lego must retain the PR98 Login host');
  assert.match(lego, /css\/shared\.css\?v=36/);
  assert.match(lego, /js\/core\/shared\.min\.js\?v=47/);
  assert.doesNotMatch(lego, /gsh-session-placeholder|gsh-question-surface|gsh-wordorder-content-slot/);
  assert.match(lego, /<div class="card out">[\s\S]{0,220}<div class="out-banner">[\s\S]{0,220}id="sentTh"[\s\S]{0,160}id="sentZh"[\s\S]{0,160}id="sentZhFull"/);
  assert.match(lego, /id="lego-reveal" class="card lego-flow-card hidden"[\s\S]{0,160}id="lego-reveal-th"[\s\S]{0,160}id="lego-reveal-zh"/);
});

test('Reading Desktop reuses the shared vertical controls without a page-specific fork', () => {
  const reading = games.find((g) => g.id === 'reading').htmlText;
  assert.doesNotMatch(reading, /ANN-BAND|ann-band|avail-band/, 'Reading must contain no announcement DOM, marker, or CSS-hide hook');
  assert.match(reading, /data-gsh-game="reading"\]\.rg-fake-fullscreen \.page-header \{ display:block !important; \}/, 'Reading Desktop focus mode must keep the game title and subtitle visible');
  assert.match(reading, /data-gsh-game="reading"\] #cookieConsentBanner \{ z-index:100100 !important; \}/, 'Reading cookie consent must stay above the floating controls and menus');
  assert.doesNotMatch(reading, /data-gsh-game="reading"\] \.rg-ctl-wrap \{/, 'Reading must not fork the shared control axis');
  assert.doesNotMatch(reading, /data-gsh-game="reading"\] \.rg-ctl-wrap > #game-switcher/, 'Reading must not fork the shared menu anchor');
  assert.match(sharedCss, /body\[data-gsh-game\] \.rg-ctl-wrap > #game-switcher,[\s\S]{0,140}body\[data-gsh-game\] \.rg-ctl-wrap > \.grw-menu/, 'Reading must inherit the shared menu anchors');
});

test('active-game vocabulary stacks use collision-safe spacing without forced heights', () => {
  const tone = games.find((g) => g.id === 'tone');
  const reading = games.find((g) => g.id === 'reading').htmlText;
  const typing = games.find((g) => g.id === 'typing').htmlText;
  const wordOrder = games.find((g) => g.id === 'wordorder').htmlText;
  assert.doesNotMatch(sharedCss, /--gsh-copy-|--gsh-progress-height|--gsh-tools-height|height:136px/, 'shared positioning must not impose new content heights');
  assert.doesNotMatch(tone.appText, /gsh-question-stack|gsh-copy-slot/, 'Tone runtime must retain its existing content DOM');
  assert.match(tone.appText, /mainBoxHtml \+ '<div id="tf-read-line">'[\s\S]{0,180}zhHtml \+ sentReadingHtml \+ sentCtxZhHtml/, 'Tone must retain its original content order');
  assert.match(tone.htmlText, /#tf-banner > #tf-read-line \{[\s\S]{0,180}gap:8px;[\s\S]{0,100}margin-top:10px/);
  assert.match(tone.htmlText, /#tf-banner > \.tf-banner-word,[\s\S]{0,180}line-height:1\.6 !important;[\s\S]{0,80}padding-block:\.08em/);
  assert.match(tone.htmlText, /#tf-banner > #tf-read-line > \.tf-read-th,[\s\S]{0,650}line-height:1\.65;[\s\S]{0,100}margin-top:8px/);
  assert.doesNotMatch(wordOrder, /gsh-wordorder-content-slot/);
  assert.match(reading, /gsh-four-row-stack[\s\S]{0,900}gsh-copy-row/);
  assert.match(reading, /gsh-four-row-stack > \.gsh-copy-row \{ margin-top:9px !important; \}/);
  assert.match(typing, /gsh-four-row-stack > \.gsh-copy-row\{margin-top:9px !important;line-height:1\.6;\}/);
  assert.match(reading, /@media \(max-width:768px\) and \(orientation:portrait\) \{[\s\S]{0,900}gsh-four-row-stack > \.gsh-copy-row \{ margin-top:9px !important; \}[\s\S]{0,700}\.word-th \{ padding-top:\.08em; \}/, 'Reading Portrait must preserve collision-safe copy gaps and Thai-mark clearance');
  assert.match(wordOrder, /\.wo-slot\.filled\{flex-direction:column;gap:5px;\}/);
  assert.match(wordOrder, /\.wo-word-th\{[^}]*line-height:1\.55;[^}]*padding-block:\.06em/);
});

test('five-game Progress DOM and runtime are removed while item-score HUDs remain', () => {
  for (const g of games) {
    assert.doesNotMatch(g.htmlText, /<span>進度<\/span>|id="(?:tf-pf|pf|lg-prog-fill|lg-prog-txt|prog-txt)"/, `${g.id}: obsolete Progress DOM remains`);
    assert.doesNotMatch(g.appText, /tfUpdateBarsHud|lg-prog-fill|lg-prog-txt|getElementById\(['"]pf['"]\)|getElementById\(['"]prog-txt['"]\)/, `${g.id}: obsolete Progress runtime remains`);
  }
  assert.match(games.find((g) => g.id === 'tone').appText, /id="tf-ws-fill"[\s\S]{0,180}id="tf-ws-num"/, 'Tone item-score HUD must remain');
  assert.match(games.find((g) => g.id === 'reading').htmlText, /id="rg-ws-fill"[\s\S]{0,160}id="rg-ws-num"/, 'Reading item-score HUD must remain');
  assert.match(games.find((g) => g.id === 'typing').htmlText, /id="tg-ws-fill"[\s\S]{0,160}id="tg-ws-num"/, 'Typing item-score HUD must remain');
  assert.match(games.find((g) => g.id === 'wordorder').htmlText, /id="wo-ws-fill"[\s\S]{0,160}id="wo-ws-num"/, 'Word Order item-score HUD must remain');
  assert.match(games.find((g) => g.id === 'listening').htmlText, /id="lg-qn"[\s\S]{0,180}id="lg-score"/, 'Listening prompt and score HUD must remain');
});

test('counter semantics follow active task units across every level and mode', () => {
  const tone = games.find((g) => g.id === 'tone').appText;
  const reading = games.find((g) => g.id === 'reading');
  const listening = games.find((g) => g.id === 'listening');
  const typing = games.find((g) => g.id === 'typing');
  const wordOrder = games.find((g) => g.id === 'wordorder');
  assert.match(tone, /function tfSessionCounterState\(\)[\s\S]{0,500}S\.selectedSyl \+ 1[\s\S]{0,160}unit: '音節'[\s\S]{0,220}session\.index[\s\S]{0,160}unit: '字'/);
  for (const g of [reading, typing]) {
    assert.match(g.htmlText, /id="qu">字<\/span>/, `${g.id}: dynamic unit host missing`);
    assert.match(g.appText, /function updateSyllableCounter\(\)[\s\S]{0,420}sylIdx\+1[\s\S]{0,160}sylList\.length[\s\S]{0,160}'音節':'字'/, `${g.id}: syllable counter mapping missing`);
    assert.match(g.appText, /ROUND_SIZE_BY_LEVEL=\{'初':[0-9]+,'中':[0-9]+,'高':[0-9]+\}/, `${g.id}: all three levels must remain available`);
  }
  assert.match(listening.appText, /el\.qn\.textContent = String\(state\.idx \+ 1\)/);
  assert.match(listening.appText, /el\.qt\.textContent = String\(n\)/);
  assert.match(listening.htmlText, /第 <span id="lg-qn">1<\/span> \/ <span id="lg-qt">10<\/span> 字/);
  assert.match(listening.appText, /level !== '高'/);
  assert.match(wordOrder.appText, /_woQn\.textContent = idx \+ 1[\s\S]{0,160}_woQt\.textContent = SET\.length/);
  assert.match(wordOrder.htmlText, /id="wo-qt">10<\/span> 句/);
});

test('Reading and Tone Mobile Portrait centre round status between Level and gameplay', () => {
  const reading = games.find((g) => g.id === 'reading').htmlText;
  const tone = games.find((g) => g.id === 'tone').htmlText;
  assert.match(reading, /@media \(max-width:768px\) and \(orientation:portrait\) \{[\s\S]{0,500}data-gsh-game="reading"\] \.gsh-session-header \{[\s\S]{0,180}flex-direction:column;[\s\S]{0,100}flex-wrap:nowrap;[\s\S]{0,100}gap:10px;[\s\S]{0,100}padding:4px 0 10px;[\s\S]{0,220}data-gsh-game="reading"\] \.gsh-gameplay \{ margin-top:0; \}/, 'Reading Portrait must use equal 10px edge gaps around the round status');
  assert.match(tone, /@media \(max-width:768px\) and \(orientation:portrait\) \{[\s\S]{0,1500}data-gsh-game="tone"\] \.gsh-session-header \{[\s\S]{0,180}flex-direction:column; flex-wrap:nowrap; gap:10px; padding:0 0 10px;[\s\S]{0,220}data-gsh-game="tone"\] \.gsh-gameplay \{ margin-top:0; \}/, 'Tone Portrait must use equal 10px edge gaps around the round status');
});

test('Reading and Typing preserve total height while centring the original score row vertically', () => {
  assert.match(sharedCss, /@media \(min-width:769px\) and \(min-height:601px\)\{[\s\S]{0,500}data-gsh-game="reading"\] \.gsh-session-header,[\s\S]{0,100}data-gsh-game="typing"\] \.gsh-session-header \{\s*gap:8px;\s*padding-bottom:8px;/, 'Desktop Reading/Typing must convert 6+10 to exact 8+8 without height growth');
  assert.match(sharedCss, /@media \(max-width:768px\) and \(orientation:portrait\) \{\s*body\[data-gsh-game="typing"\] \.gsh-session-header \{\s*gap:6\.5px;\s*padding-bottom:6\.5px;/, 'Typing Portrait must convert 3+10 to exact 6.5+6.5 without height growth');
  const reading = games.find((g) => g.id === 'reading').htmlText;
  assert.match(reading, /data-gsh-game="reading"\] \.gsh-session-header \{[\s\S]{0,160}gap:10px;[\s\S]{0,100}padding:4px 0 10px;/, 'Reading Portrait must remain exact 10+10');
  for (const id of ['reading', 'typing']) {
    const html = games.find((g) => g.id === id).htmlText;
    assert.match(html, /<div class="score-bar">\s*<div>第 [\s\S]{0,100}<div>✓ [\s\S]{0,100}<div>✗ /, `${id}: original horizontal counter order must remain 第 → ✓ → ✗`);
  }
});

test('Reading Desktop copies the complete Tone gold-band rhythm while retaining Reading tools', () => {
  const reading = games.find((g) => g.id === 'reading').htmlText;
  assert.match(reading, /data-gsh-game="reading"\] \.gold-banner \{\s*padding:16px 22px 0;\s*border-bottom:0;/, 'Reading Desktop gold band must use Tone horizontal and top spacing');
  assert.match(reading, /\.gold-banner \.bars-wrap \{\s*margin:6px 0 4px;/, 'Reading Desktop item-score row must use Tone placement');
  assert.match(reading, /data-gsh-game="reading"\] \.word-area \{ margin:0; \}/, 'Reading Desktop word area must remove the old extra offset');
  assert.match(reading, /data-gsh-game="reading"\] \.word-th \{\s*padding-top:\.08em;\s*font-family:'Sarabun',sans-serif;/, 'Reading Desktop Thai prompt must preserve Tone placement, font, and Thai-mark clearance');
  assert.match(reading, /gsh-four-row-stack > \.gsh-copy-row \{ margin-top:9px !important; \}/, 'Reading four-row boundaries must provide collision-safe clearance');
  assert.match(reading, /gsh-four-row-stack > \.gsh-copy-row > \.rev-pron,[\s\S]{0,160}gsh-four-row-stack > \.gsh-copy-row > \.rev-en \{ margin-top:0 !important; \}/, 'Reading nested row children must not add hidden margins');
  assert.match(reading, /data-gsh-game="reading"\] #word-ctl-row \{[\s\S]{0,280}width:calc\(100% \+ 44px\);[\s\S]{0,120}margin:10px -22px 0 !important;[\s\S]{0,120}padding:0 22px 14px;[\s\S]{0,180}border-bottom:2px solid rgba\(184,134,40,\.50\);/, 'Reading-specific tools must occupy Tone\'s full-width gold tool row');
  assert.match(reading, /id="rg-en-toggle"/, 'Reading must retain its additional English-reading tool');
  assert.match(reading, /id="rg-particle-toggle"/, 'Reading must retain its additional politeness tool');
});

test('Reading exposes learning tools inline without the retired rice-bowl menu contract', () => {
  const reading = games.find((g) => g.id === 'reading').htmlText;
  assert.doesNotMatch(reading, /#wm-trigger|document\.getElementById\('wm-trigger'\)|點 🍚|ปุ่ม 🍚/, 'Reading help and tour must not depend on the retired rice-bowl menu');
  assert.match(reading, /\{sel:'#word-ctl-row',[\s\S]{0,180}學習工具都在這裡/, 'Reading tour must point to the inline learning toolbar');
  assert.match(reading, /toolsRow\.getAttribute\('data-wm-done'\)===\'1\'/, 'Reading tour must wait for the inline toolbar to finish binding');
});

test('all games omit the removed leave-game control and dialog', () => {
  const legoHtml = fs.readFileSync(path.join(root, 'lego.html'), 'utf8');
  assert.doesNotMatch(sharedJs, /要離開遊戲嗎？|繼續遊戲|離開遊戲/);
  assert.doesNotMatch(sharedJs, /data-act="exit"|openGameExit|gsh-game-exit-dialog/);
  for (const g of games) assert.match(g.htmlText, g.id === 'listening' ? /shared\.min\.js\?v=47/ : /shared\.min\.js\?v=50/, `${g.id}: must load the exit-free shared runtime`);
  assert.match(legoHtml, /shared\.min\.js\?v=47/, 'Lego must load the exit-free shared runtime');
});

test('the sitewide exit-intent survey and its submission path stay removed', () => {
  const forbiddenSurvey = /exit-survey-bar|exit_survey_(?:shown|show|dismiss|submit)|ES_WEB3FORMS_KEY|花 3 秒告訴老師為什麼/;
  assert.doesNotMatch(sharedJs, forbiddenSurvey, 'shared source must not create or submit the retired exit-intent survey');
  assert.doesNotMatch(sharedMin, forbiddenSurvey, 'deployed shared runtime must not create or submit the retired exit-intent survey');
  for (const file of fs.readdirSync(root).filter((name) => name.endsWith('.html'))) {
    const html = fs.readFileSync(path.join(root, file), 'utf8');
    assert.doesNotMatch(html, forbiddenSurvey, `${file}: retired exit-intent survey must not be defined inline`);
  }
  assert.match(sharedJs, /GA4 ARTICLE TRACKING/, 'unrelated article analytics must remain intact');
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
  assert.match(sharedJs, /var fontOn = isFontOn\(\);[\s\S]{0,500}aria-pressed/, 'font control must derive its visible and accessible state from the live body class');
  assert.match(sharedJs, /data-font-mode/, 'font control must expose its exact standard or modern state');
  assert.match(sharedJs, /MutationObserver\(renderFontBtn\)/, 'font control must resync when the game-owned font class changes');
  assert.match(sharedJs, /e\.key !== 'rg_modern_font'/, 'font control must resync the shared preference across tabs');
  for (const g of games) {
    assert.match(g.htmlText, /id="font-toggle-slot"/, `${g.id}: missing shared font slot`);
  }
});

test('Tone question words and advanced sentences both follow the shared font mode', () => {
  const tone = games.find((g) => g.id === 'tone');
  assert.match(tone.htmlText, /body\.tf-modern-font \.tf-banner-word[\s\S]{0,700}Noto Sans Thai/, 'Tone: initial and intermediate question words must switch to Modern');
  assert.match(tone.htmlText, /body\.tf-modern-font \.tf-adv-sent-main[\s\S]{0,500}Noto Sans Thai/, 'Tone: advanced question sentences must switch to Modern');
  assert.match(tone.appText, /mainBoxHtml = '<div class="tf-adv-sent-main">'/, 'Tone: advanced questions must retain the covered sentence class');
});

test('Lego consumes the shared two-mode font path without a particle control', () => {
  const legoHtml = fs.readFileSync(path.join(root, 'lego.html'), 'utf8');
  const legoApp = fs.readFileSync(path.join(root, 'js/games/lego-game-app.js'), 'utf8');
  assert.match(legoHtml, /shared\.min\.js\?v=47/, 'Lego keeps the unchanged shared game runtime');
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
  assert.match(legoHtml, /id="lego-reveal-th"[\s\S]{0,180}id="lego-reveal-zh"/, 'reveal must retain the original full sentence and zh-TW translation order');
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

test('all six games keep learning helpers without any rice-button contract', () => {
  const legoHtml = fs.readFileSync(path.join(root, 'lego.html'), 'utf8');
  const vaultHtml = fs.readFileSync(path.join(root, 'vault.html'), 'utf8');
  const listeningApp = games.find((g) => g.id === 'listening').appText;
  const readingApp = games.find((g) => g.id === 'reading').appText;
  const typingApp = games.find((g) => g.id === 'typing').appText;
  assert.match(wordMenuJs, /row\.classList\.add\('gsh-learning-tools'\)/);
  assert.match(wordMenuJs, /row\.setAttribute\('role', 'toolbar'\)/);
  assert.match(wordMenuJs, /row\.setAttribute\('data-wm-done', '1'\)/);
  assert.doesNotMatch(wordMenuJs, /wm-trigger|textContent\s*=\s*['"]🍚['"]/);
  assert.doesNotMatch(sharedJs, /wm-trigger|textContent\s*=\s*['"]🍚['"]/);
  assert.doesNotMatch(sharedMin, /wm-trigger|textContent\s*=\s*['"]🍚['"]/);
  for (const g of games) {
    assert.match(g.htmlText, /js\/games\/word-menu\.js\?v=10/, `${g.id}: must load the inline learning-tool binder`);
    assert.match(g.htmlText, g.id === 'listening' ? /js\/core\/shared\.min\.js\?v=47/ : /js\/core\/shared\.min\.js\?v=50/, `${g.id}: must load the rice-button-free shared runtime`);
    assert.doesNotMatch(g.htmlText, /wm-trigger|點 🍚|<button[^>]*>[^<]*🍚/, `${g.id}: retired rice-button source contract remains`);
  }
  assert.match(legoHtml, /js\/core\/shared\.min\.js\?v=47/);
  assert.doesNotMatch(legoHtml, /wm-trigger|點 🍚|<button[^>]*>[^<]*🍚/);
  for (const app of [readingApp, typingApp, listeningApp]) assert.doesNotMatch(app, /#wm-trigger/);
  assert.match(games.find((g) => g.id === 'listening').htmlText, /id="zh-toggle-slot"/, 'Listening: translation control ต้องอยู่ใน inline learning tools');
  assert.match(sharedJs, /fab\.id = 'zh-fab-standalone'/, 'Lego must retain its existing non-rice translation control');
  assert.match(sharedJs, /GAME_ID === 'lego'[\s\S]{0,260}document\.getElementById\('zh-fab-standalone'\)[\s\S]{0,800}menu\.insertBefore\(legoTranslationRow, menu\.firstChild\)/, 'Lego translation must move inside its existing More menu instead of adding a fourth floating button');
  assert.match(sharedJs, /var controlPage = String\(location\.pathname \|\| ''\)\.split\('\/'\)\.pop\(\)\.toLowerCase\(\);[\s\S]{0,120}if \(controlPage === 'vault\.html'\) return;/, 'Vault must stop before shared game translation controls are created');
  assert.doesNotMatch(vaultHtml, /wm-trigger|zh-fab-standalone|<button[^>]*>[^<]*(?:🍚|🍙)/, 'Vault source must not define a floating rice control');
  assert.match(vaultHtml, /@media\(max-width:768px\) and \(orientation:portrait\)\{[\s\S]{0,500}html body \.rg-ctl-wrap\{[\s\S]{0,320}right:12px!important;[\s\S]{0,320}flex-direction:row!important;/, 'Vault Portrait controls must stay in one row at the right corner');
  assert.match(vaultHtml, /html body \.rg-ctl-wrap > #game-switcher\{[\s\S]{0,260}position:absolute!important;[\s\S]{0,180}right:0!important;[\s\S]{0,180}bottom:calc\(100% \+ 8px\)!important;/, 'Vault Portrait game menu must open above the right-corner controls');
});

test('all five games provide recoverable round resume UI', () => {
  for (const g of games) {
    assert.match(g.htmlText, new RegExp(`id="${g.resume}"`), `${g.id}: ไม่มี resume banner`);
    assert.match(g.htmlText + g.appText, /GameResume/, `${g.id}: ไม่มี resume storage wiring`);
  }
});

test('mobile resume uses one compact shared-copy line and three horizontal actions', () => {
  assert.match(sharedJs, /window\.GameUiCopy[\s\S]{0,700}prefix: '上次進度：'/, 'resume copy must live outside game logic');
  assert.match(sharedJs, /continueAction: '繼續上次練習'/);
  assert.match(sharedJs, /restartAction: '重新開始本次練習'/);
  assert.match(sharedJs, /newAction: '開始新一輪'/);
  assert.match(sharedCss, /@media\(max-width:480px\)[\s\S]{0,500}\.gsh-resume-actions \{ flex-direction:row; flex-wrap:nowrap;/, 'mobile resume actions must stay horizontal');
  assert.match(sharedCss, /\.gsh-resume-actions button \{ flex:1 1 0;[^}]*min-height:36px;/, 'mobile resume actions must stay compact');
  for (const g of games) {
    const sharedCssVersion = g.id === 'listening' ? 37 : 38;
    assert.match(g.htmlText, new RegExp(`css/shared\\.css\\?v=${sharedCssVersion}`), `${g.id}: must load current shared game CSS`);
    assert.match(g.htmlText, g.id === 'listening' ? /js\/core\/shared\.min\.js\?v=47/ : /js\/core\/shared\.min\.js\?v=50/, `${g.id}: must load shared resume copy`);
    assert.match(g.appText, /GameUiCopy\.resumeLine/, `${g.id}: resume detail must use shared semantic copy`);
  }
});

test('all five games keep one in-memory current-round DTO identity without Login summary', () => {
  for (const g of games) {
    const reportVersion = 5;
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
    const reportVersion = 5;
    assert.match(g.htmlText, new RegExp(`js/games/round-report\\.js\\?v=${reportVersion}`), `${g.id}: must load shared print renderer`);
    assert.match(g.htmlText, /js\/games\/game-flow\.js\?v=12/, `${g.id}: must load countdown-free Result runtime`);
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
  assert.match(toneGame.htmlText, /tone-finder-game\.min\.js\?v=83/, 'Tone: page must request the rebuilt shared-framework runtime version');
});

test('Tone mobile touch surfaces keep Desktop gameplay free of keyboard-only copy', () => {
  const tone = games.find((g) => g.id === 'tone');
  assert.match(tone.appText, /function tfMobilePortrait\(\)[\s\S]{0,180}max-width: 768px[\s\S]{0,100}orientation: portrait/, 'Tone must identify only Portrait mobile');
  assert.match(tone.appText, /function tfTouchMobileSurface\(\)[\s\S]{0,120}tfMobilePortrait\(\) \|\| tfMobileLandscape\(\)/, 'Portrait and Landscape must share the touch-only boundary');
  assert.match(tone.appText, /function tfWireToneKeyboard\(\)[\s\S]{0,140}if \(tfTouchMobileSurface\(\)\) return;/, 'mobile surfaces must ignore number-key gameplay');
  assert.match(tone.appText, /function tfWireEnterNext\(\)[\s\S]{0,140}if \(tfTouchMobileSurface\(\)\) return;/, 'mobile surfaces must ignore Enter gameplay');
  assert.match(tone.appText, /\(tfTouchMobileSurface\(\) \? '' : '<div[\s\S]{0,220}電腦也可以直接按鍵盤 1–5/, 'mobile surfaces must omit the computer keyboard hint');
  assert.match(tone.appText, /body\.innerHTML \+= '<div class="tf-known-bar">[\s\S]{0,260}TF\.skipCurrentWord\(\)">跳過<\/button>/, 'all layouts must retain Tone original neutral Skip placement and dimensions');
  assert.match(tone.appText, /startGuidedQuestion:[\s\S]{0,300}if \(tfDesktopOrPortrait\(\)\)[\s\S]{0,180}navigateToInflection\(\)/, 'Portrait Hint must enter derivation directly');
  assert.match(tone.htmlText, /@media \(max-width:768px\) and \(orientation:portrait\)[\s\S]{0,12000}\.gsh-next-countdown,[\s\S]{0,220}\{ display:none !important; \}/, 'Portrait must render no countdown surface');
  assert.match(tone.htmlText, /\.sg-tone-btn \{[\s\S]{0,180}width:clamp\(44px,12vw,52px\)/, 'Portrait tone choices must stay compact and tappable');
  assert.match(tone.htmlText, /\.gsh-resume-actions button \{[\s\S]{0,180}min-height:34px/, 'Portrait Resume must stay compact in the Desktop position');
  assert.match(tone.htmlText, /gsh-shell:has\(> \.gsh-resume-banner[^}]+> \.gsh-gameplay \{[\s\S]{0,80}display:none !important/, 'Portrait Resume must remain the same exclusive pre-play state as Desktop');
  assert.match(tone.htmlText, /\.tf-page \{[\s\S]{0,100}padding-top:10px;/, 'Portrait must not count the fixed navigation height twice above the Tone title');
  assert.match(tone.htmlText, /\.tf-result-login-card \{[\s\S]{0,180}padding-top:12px !important; padding-bottom:12px !important;[\s\S]{0,100}line-height:1\.5 !important;/, 'Portrait Result login card must keep equal top and bottom spacing');
  assert.match(tone.htmlText, /\.tf-result-login-card button \{[\s\S]{0,100}display:block; margin:9px auto 0 !important;/, 'Portrait Result login button must stay visibly separated from its copy');
  assert.match(tone.htmlText, /game-switcher\.js\?v=7/, 'Tone must request the fixed six-game switcher');
  assert.match(tone.htmlText, /點選 1–5 就可以。/, 'Portrait Tour must not advertise computer keyboard controls');
});

test('active Desktop D4-D5 keeps manual question/result flow and optional Hint carry-off', () => {
  const tone = games.find((g) => g.id === 'tone');
  const reading = games.find((g) => g.id === 'reading');
  const typing = games.find((g) => g.id === 'typing');
  const wordOrder = games.find((g) => g.id === 'wordorder');
  const flow = fs.readFileSync(path.join(root, 'js/games/game-flow.js'), 'utf8');

  for (const game of [tone, reading, typing, wordOrder]) {
    assert.match(game.htmlText, /css\/shared\.css\?v=38/, `${game.id}: must request the current Desktop CSS`);
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
