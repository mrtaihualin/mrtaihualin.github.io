#!/usr/bin/env node
'use strict';

// Static regression guard for the locked Phase 1 `學習中心` structure.
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const js = fs.readFileSync(path.join(root, 'js/score/progress.js'), 'utf8');
const summary = fs.readFileSync(path.join(root, 'js/score/learning-summary.js'), 'utf8');
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
['學習進度', 'SRS 複習', '我的單詞', '我的句子', '跨裝置同步'].forEach(function (benefit) {
  check('Guest benefit: ' + benefit, js.indexOf(benefit) !== -1);
});
check('Guest ไม่ render dashboard metric ปลอมเป็น 0', !/Progress\s*=\s*0|Mastered\s*=\s*0|SRS\s*=\s*0/.test(js));

['tone', 'reading', 'listening', 'typing', 'wordorder'].forEach(function (skill) {
  check('Login Free มี skill card: ' + skill, new RegExp("code: '" + skill + "'").test(js));
});
check('ทุก account query ระบุ user_id ผ่าน canonical summary', (summary.match(/\.eq\('user_id', userId\)/g) || []).length === 3);
check('Progress reuse canonical summary layer', /LearningSummary\.queryData/.test(js) && /LearningSummary\.organize/.test(js));
check('Summary เป็น read-only', !/\.insert\s*\(|\.update\s*\(|\.upsert\s*\(|\.delete\s*\(/.test(summary));
check('SRS เป็น read-only และแยก skill', /SRS 僅顯示帳號狀態，不會從此頁改動/.test(js) && /一項 Mastered 不代表其他技能也 Mastered/.test(js));
check('SRS lifecycle แสดง New Day1 Day7 Mastered', /New /.test(js) && /Day 1 /.test(js) && /Day 7 /.test(js) && /Mastered /.test(js));
check('ไม่มี 下一步 เป็น section/wording ผู้เรียนใน Phase 1', !/<h3[^>]*>下一步/.test(js) && !/系統暫不替你排序/.test(js));
check('ไม่มี overall readiness percentage', !/總進度|整體進度|readinessScore|overallPercent/.test(js));
check('五 skills มี direct practice CTA', (js.match(/href: '[^']+-?(?:game|finder)\.html'/g) || []).length >= 4 && /word-order\.html/.test(js));
check('我的單詞/句子ลิงก์ไปหน้าเดียว 2 tabs', /vault\.html#words/.test(js) && /vault\.html#sentences/.test(js));
check('Paid readiness เป็น benefit แต่ไม่มีสูตร/ปลายทางเปิด', /想知道自己的泰語實戰準備度？升級方案即可查看。/.test(js) && /查看升級方案/.test(js) && /disabled/.test(js));
check('account switch ใช้ user id ไม่ใช่แค่ boolean auth', /var before = currentUser && currentUser\.id;[\s\S]*var after = user && user\.id/.test(js));
check('หน้า HTML ใช้ชื่อ 學習中心 และ canonical summary loader', /學習<br>中心/.test(html) && /learning-summary\.js\?v=1/.test(html) && /progress\.js\?v=7/.test(html));

if (failures.length) {
  console.error('\n❌ 學習中心 Phase 1 ไม่ผ่าน ' + failures.length + ' ข้อ:');
  failures.forEach(function (failure) { console.error('- ' + failure); });
  process.exit(1);
}
console.log('\n✅ 學習中心 Phase 1 ผ่านครบ ' + passes + ' ข้อ');
