#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const failures = [];
let passes = 0;

function read(relative) { return fs.readFileSync(path.join(root, relative), 'utf8'); }
function check(condition, label) {
  if (condition) { passes++; console.log(`✓ ${label}`); }
  else failures.push(label);
}

const hubHTML = read('content.html');
const blogHTML = read('blog.html');
const videoHTML = read('resources.html');
const navSource = read('data/nav-template.js');
const css = read('css/resource-hub.css');
const hubSource = read('js/acquisition/resource-hub.js');
const sitemap = read('sitemap.xml');
const SEARCH_INDEX = require(path.join(root, 'data/search-index.js'));
const ResourceHub = require(path.join(root, 'js/acquisition/resource-hub.js'));

// Hub / category structure
check(/<h1>泰語學習資源<\/h1>/.test(hubHTML), 'Hub ใช้ชื่อ泰語學習資源ตาม Locked Decision');
['泰語學習文章', '影音學習', '自學資源'].forEach((label) => {
  check(hubHTML.includes(`<h3>${label}</h3>`), `Hub แสดงหมวด ${label}`);
});
check(hubHTML.indexOf('三個學習分類') < hubHTML.indexOf('最新內容'), '3 หมวดหลักอยู่ก่อน最新內容');
check(/href="\/blog\.html#articles"/.test(hubHTML), 'บทความมี crawlable category link');
check(/href="\/resources\.html#video-learning"/.test(hubHTML), '影音มี crawlable category link');
check(/href="\/blog\.html#selfstudy"/.test(hubHTML), '自學มี crawlable category link');

// Search UI / filter contract
['all', 'article', 'video', 'selfstudy'].forEach((filter) => {
  check(new RegExp(`data-resource-filter="${filter}"`).test(hubHTML), `มี filter ${filter}`);
});
check(/id="resourceSearchInput"/.test(hubHTML) && /id="resourceSearchClear"/.test(hubHTML), 'มี Search และ Clear control');
check(/aria-live="polite"/.test(hubHTML), 'ผลค้นหาประกาศสถานะให้ screen reader');
check(/SearchEngine\.search\(query, \{ pool: pool \}\)/.test(hubSource), 'Resource Search reuse SearchEngine เดิม');
check(!/geminiFallback/.test(hubSource), 'Resource Search ไม่เรียก external/AI fallback');

const resources = ResourceHub.resourcePool();
check(resources.length > 10, `Resource pool มีข้อมูลจริง (${resources.length} รายการ)`);
check(resources.every((entry) => ['article', 'video', 'selfstudy'].includes(entry.resourceType)), 'Resource pool มีเฉพาะ 3 หมวดที่ล็อก');
check(resources.every((entry) => /^\/(blog(?:\.html|\/)|resources\.html)/.test(entry.href)), 'Resource pool ไม่หลุดไป Game/Student/Classroom/external URL');
check(!resources.some((entry) => entry.category === 'practice' || /game/.test(entry.id)), 'Resource pool ไม่ปน Game Search');

const videoResults = ResourceHub.search('影片', 'video');
check(videoResults.length > 0 && videoResults.every((item) => item.entry.resourceType === 'video'), 'filter 影音學習 คืนเฉพาะ video');
const articleResults = ResourceHub.search('聲調', 'article');
check(articleResults.length > 0 && articleResults.every((item) => item.entry.resourceType === 'article'), 'filter 泰語學習文章 คืนเฉพาะ article');
const selfStudyResults = ResourceHub.search('香菜', 'selfstudy');
check(selfStudyResults.length > 0 && selfStudyResults.every((item) => item.entry.resourceType === 'selfstudy'), 'filter 自學資源 คืนเฉพาะ selfstudy');

// Mapping / breadcrumbs / preserved URLs
check(/id="articles"/.test(blogHTML) && /id="selfstudy"/.test(blogHTML), 'blog.html มีปลายทางบทความและ自學ชัดเจน');
check(/id="video-learning"/.test(videoHTML), 'resources.html มีปลายทาง影音學習ชัดเจน');
check(/href="\/content\.html">泰語學習資源<\/a>/.test(blogHTML), 'breadcrumb บทความกลับ Hub ได้');
check(/href="\/content\.html">泰語學習資源<\/a>/.test(videoHTML), 'breadcrumb 影音กลับ Hub ได้');
check(!navSource.includes("blog.html#sharing"), 'stale blog.html#sharing ไม่เป็น primary route');
check(navSource.includes("href: '/content.html', label: '📚 泰語學習資源'"), 'Navigation source ชี้ Hub');

const articleFiles = fs.readdirSync(path.join(root, 'blog')).filter((file) => file.endsWith('.html'));
check(articleFiles.length > 0, `ไฟล์บทความเดิมยังอยู่ ${articleFiles.length} URL`);
check(articleFiles.every((file) => sitemap.includes(`/blog/${file}`)), 'URL บทความเดิมทุกไฟล์ยังอยู่ใน sitemap');

// Mobile guard
check(/@media \(max-width: 600px\)/.test(css), 'มี mobile layout 600px');
check(/grid-template-columns: 1fr;/.test(css), 'cards/results ยุบเป็นคอลัมน์เดียวบนจอแคบ');
check(/min-width: 0/.test(css) && /box-sizing: border-box/.test(css), 'Search input กัน horizontal overflow');

// Script order: data -> engine -> scoped UI
const indexPos = hubHTML.indexOf('data/search-index.js');
const enginePos = hubHTML.indexOf('js/core/search-engine.js');
const uiPos = hubHTML.indexOf('js/acquisition/resource-hub.js');
check(indexPos > -1 && indexPos < enginePos && enginePos < uiPos, 'โหลด Search index → engine → Resource UI ตามลำดับ');

if (failures.length) {
  console.error(`\n❌ Resource Hub ไม่ผ่าน ${failures.length} รายการ:`);
  failures.forEach((item) => console.error(`- ${item}`));
  process.exit(1);
}

console.log(`\n✅ Resource Hub ผ่านทั้งหมด ${passes} เช็ก`);
