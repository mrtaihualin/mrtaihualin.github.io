#!/usr/bin/env node
'use strict';

// Static regression guard for the locked Phase 1 `學習進度` structure.
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const js = fs.readFileSync(path.join(root, 'js/score/progress.js'), 'utf8');
const summary = fs.readFileSync(path.join(root, 'js/score/learning-summary.js'), 'utf8');
const loginSurface = fs.readFileSync(path.join(root, 'js/core/login-surface.js'), 'utf8');
const authWidget = fs.readFileSync(path.join(root, 'js/core/auth-widget.js'), 'utf8');
const gameSwitcher = fs.readFileSync(path.join(root, 'js/games/game-switcher.js'), 'utf8');
const navTemplate = fs.readFileSync(path.join(root, 'data/nav-template.js'), 'utf8');
const gamesHub = fs.readFileSync(path.join(root, 'games.html'), 'utf8');
const vaultHtml = fs.readFileSync(path.join(root, 'vault.html'), 'utf8');
const html = fs.readFileSync(path.join(root, 'my-progress.html'), 'utf8');
const failures = [];
let passes = 0;
function check(label, condition) {
  if (condition) { passes++; console.log('✓ ' + label); }
  else failures.push(label);
}

check('Guest แสดงสถานะ visitor ชัดเจน', /訪客 Guest/.test(js));
check('Guest อธิบายว่าข้อมูลเริ่มหลัง Login', /登入前的練習不會被當成帳號學習紀錄；成功登入後才開始記錄/.test(js));
check('Guest มี CTA ตาม Decision', /id="pg-login-primary"/.test(js) && /免費登入/.test(js) && /繼續免費練習/.test(js));
['學習進度', 'SRS 複習', '跨裝置同步'].forEach(function (benefit) {
  check('Guest benefit: ' + benefit, js.indexOf(benefit) !== -1);
});
check('Guest ไม่ render dashboard metric ปลอมเป็น 0', !/Progress\s*=\s*0|Mastered\s*=\s*0|SRS\s*=\s*0/.test(js));

['tone', 'reading', 'listening', 'typing', 'wordorder'].forEach(function (skill) {
  check('Login Free มี skill card: ' + skill, new RegExp("code: '" + skill + "'").test(js));
});
check('ทุก account query ระบุ user_id ผ่าน canonical summary', (summary.match(/\.eq\('user_id', userId\)/g) || []).length === 3);
check('Progress reuse canonical summary layer', /LearningSummary\.queryData/.test(js) && /LearningSummary\.organize/.test(js));
check('Summary เป็น read-only', !/\.insert\s*\(|\.update\s*\(|\.upsert\s*\(|\.delete\s*\(/.test(summary));
check('SRS เป็น read-only และแยก skill',
  !/\.insert\s*\(|\.update\s*\(|\.upsert\s*\(|\.delete\s*\(/.test(summary) &&
  /srsRows\.forEach[\s\S]*result\[code\]\.srs\.push\(row\)/.test(js));
check('SRS lifecycle แสดง New Day1 Day7 Mastered พร้อมจำนวนรายการที่อ่านไม่ติดกับวัน',
  /New：.* 項/.test(js) && /Day 1：.* 項/.test(js) && /Day 7：.* 項/.test(js) && /Mastered：.* 項/.test(js));
check('SRS และ Review แยกเป็นสองบรรทัด',
  !/SRS \/ Review：/.test(js) &&
  /class="pg-srs-line"><b>SRS：<\/b>/.test(js) &&
  /class="pg-srs-line"><b>Review：<\/b>/.test(js) &&
  /review: counts\.due \? '待複習：' \+ counts\.due \+ ' 項'/.test(js));
check('มีคำอธิบาย SRS และ Review แบบสั้นก่อนการ์ด',
  /<h3 class="pg-section-title">學習進度<\/h3>[\s\S]*?<div class="pg-section-help"><div class="pg-section-help-line"><b>SRS<\/b>：間隔重複學習系統，依照你的練習結果顯示目前階段<\/div>[\s\S]*?<div class="pg-section-help-line"><b>Review<\/b>：已到複習日期、現在需要複習的項目。<\/div><\/div>[\s\S]*?<div class="pg-grid">/.test(js));
check('ไม่มี 下一步 เป็น section/wording ผู้เรียนใน Phase 1', !/<h3[^>]*>下一步/.test(js) && !/系統暫不替你排序/.test(js));
check('ไม่มี overall readiness percentage', !/總進度|整體進度|readinessScore|overallPercent/.test(js));
check('五 skills มี direct practice CTA', (js.match(/href: '[^']+-?(?:game|finder)\.html'/g) || []).length >= 4 && /word-order\.html/.test(js));
check('學習進度ไม่มีส่วนหรือทางเข้า我的內容/我的單詞/我的句子',
  !/我的內容|我的單詞|我的句子|vault\.html/.test(js));
check('學習進度ไม่ทำช่องค้นหาซ้ำกับ泰語單字庫', !/pg-vault-search|pg-vault-search-input/.test(js));
check('ปุ่มรองคงสีทองทั้งก่อนและหลังเปิดลิงก์',
  /\.pg-btn-secondary,\.pg-btn-secondary:visited\{background:#fff;color:#8B6310\}/.test(js));
check('Paid readiness เป็น benefit แต่ไม่มีสูตร/ปลายทางเปิด', /想知道自己的泰語實戰準備度？升級方案即可查看。/.test(js) && /查看升級方案/.test(js) && /disabled/.test(js));
check('account switch ใช้ user id ไม่ใช่แค่ boolean auth', /var before = currentUser && currentUser\.id;[\s\S]*var after = user && user\.id/.test(js));
check('หน้า HTML ใช้ชื่อ 學習進度 บรรทัดเดียวชิดซ้ายด้วยสัดส่วนหัวข้อ Game Hub และ canonical summary loader',
  /<title>學習進度 — 泰華眼裡的泰語教學<\/title>/.test(html) &&
  /<div style="width:100%;text-align:left;">[\s\S]*<h1 style="[^"]*white-space:nowrap;[^"]*font-size:clamp\(26px,5vw,38px\)[^"]*color:#2d2a22;">學習進度<\/h1>/.test(html) &&
  /learning-summary\.js\?v=1/.test(html) && /progress\.js\?v=13/.test(html));
check('學習進度มี Account Bar เดียวใต้หัวข้อเหมือนหน้าเกม',
  /'my-progress\.html': '\.section-wrap > div:first-child'/.test(loginSurface) &&
  /legacy\.style\.setProperty\('display', 'none', 'important'\)/.test(loginSurface));
check('Account menu คง學習進度และ泰語單字庫เป็น sibling direct links',
  /aria-label="學習進度"[^>]*>📊<\/a>'/.test(authWidget) &&
  /aria-label="泰語單字庫"[^>]*>🔖<\/a>/.test(authWidget));
check('Game Hub คง學習進度และ泰語單字庫เป็นการ์ดระดับเดียวกัน',
  /class="gh-main-card" href="vault\.html"[\s\S]*?<div class="gh-main-title">泰語單字庫<\/div>/.test(gamesHub) &&
  /class="gh-main-card" href="my-progress\.html"[\s\S]*?<div class="gh-main-title">學習進度<\/div>/.test(gamesHub));
check('Game menu คง泰語單字庫เป็นหน้าแยกโดยไม่เพิ่มทางอ้อม',
  /var VAULT_TAB = \{ id: 'vault', href: 'vault\.html', label: '🔖 泰語單字庫', activeLabel: '🔖 泰語單字庫' \}/.test(gameSwitcher) &&
  !/my-progress\.html/.test(gameSwitcher));
check('Mobile bottom navigation คง deep link เดิมไป學習進度',
  /\{ icon: '📚', label: '學習', href: '\/my-progress\.html' \}/.test(navTemplate));
check('泰語單字庫คงชื่อหน้าและ personal-content runtime เดิม',
  /<title>泰語單字庫 · mrtaihualin\.com<\/title>/.test(vaultHtml) &&
  /js\/score\/personal-content\.js\?v=5/.test(vaultHtml));

if (failures.length) {
  console.error('\n❌ 學習進度 Phase 1 ไม่ผ่าน ' + failures.length + ' ข้อ:');
  failures.forEach(function (failure) { console.error('- ' + failure); });
  process.exit(1);
}
console.log('\n✅ 學習進度 Phase 1 ผ่านครบ ' + passes + ' ข้อ');
