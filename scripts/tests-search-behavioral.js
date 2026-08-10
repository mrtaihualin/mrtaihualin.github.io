#!/usr/bin/env node
'use strict';

// ตัวทดสอบ "พฤติกรรม" ของระบบ Search MVP (เพิ่ม 2026-08-10 — กัน Search พังในอนาคตแบบเงียบๆ)
// ขอบเขต: data/search-index.js + js/core/search-engine.js (rule-based matcher หลัก)
//         + ตรวจ contract ของ js/core/search-ui.js / js/games/games-search-ui.js แบบผิวๆ (ไม่เปิดเบราว์เซอร์จริง)
// เสริม scripts/check-site.js (syntax/ลิงก์ตาย/id ซ้ำ/secret) — ไฟล์นี้ตรวจ "พฤติกรรมค้นหา":
//   index โหลดได้ครบฟิลด์ + ไม่มี id ซ้ำ, ฟังก์ชันหลักทำงานถูก, คำค้นสำคัญพาไปเกมที่ถูกต้อง,
//   searchGamesOnly ไม่หลุดไปหมวดอื่น, searchSite คืนได้หลาย category
//
// สำคัญ: ทดสอบผ่าน SearchEngine ตัวจริง (require ไฟล์จริง) ไม่ copy logic การให้คะแนนมาเขียนซ้ำที่นี่
// รันแบบ static/Node เท่านั้น — geminiFallback() จะคืน null เสมอในบริบทนี้ (ไม่มี window/fetch จริง) ไม่ได้ทดสอบเครือข่ายจริง

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const failures = [];
const warnings = [];
let passCount = 0;

function pass(label) {
  passCount++;
  console.log(`✓ ${label}`);
}

function fail(label, detail) {
  failures.push(detail ? `${label}\n  ${detail}` : label);
}

function warn(label) {
  warnings.push(label);
}

// ── 0) โหลด source จริง (ไม่ copy logic) ────────────────────────────────
let SEARCH_INDEX, SearchEngine;
try {
  SEARCH_INDEX = require(path.join(root, 'data/search-index.js'));
} catch (error) {
  fail('โหลด data/search-index.js ไม่ได้', error.message);
}
try {
  SearchEngine = require(path.join(root, 'js/core/search-engine.js'));
} catch (error) {
  fail('โหลด js/core/search-engine.js ไม่ได้', error.message);
}

if (failures.length) {
  console.error(`\nไม่ผ่าน ${failures.length} รายการ (โหลด source ไม่สำเร็จ หยุดตรวจต่อ):`);
  failures.forEach((item) => console.error(`- ${item}`));
  process.exit(1);
}

// ── 1) Search Index โหลดได้ + โครงสร้างพื้นฐานครบ ───────────────────────
(function checkIndexShape() {
  if (!SEARCH_INDEX || !Array.isArray(SEARCH_INDEX.ALL)) {
    fail('SEARCH_INDEX.ALL ไม่ใช่ array หรือไม่มีอยู่');
    return;
  }
  if (!Array.isArray(SEARCH_INDEX.GAMES)) {
    fail('SEARCH_INDEX.GAMES ไม่ใช่ array หรือไม่มีอยู่');
  }
  if (SEARCH_INDEX.ALL.length === 0) {
    fail('SEARCH_INDEX.ALL ว่างเปล่า — ไม่มีอะไรให้ค้นหาได้เลย');
    return;
  }
  pass(`SEARCH_INDEX.ALL โหลดได้ ${SEARCH_INDEX.ALL.length} รายการ (GAMES ${SEARCH_INDEX.GAMES.length} รายการ)`);
})();

// ── 2) ไม่มี id ซ้ำใน SEARCH_INDEX.ALL ──────────────────────────────────
(function checkDuplicateIds() {
  if (!SEARCH_INDEX || !Array.isArray(SEARCH_INDEX.ALL)) return;
  const seen = new Map();
  SEARCH_INDEX.ALL.forEach((entry, idx) => {
    const id = entry && entry.id;
    if (!id) return; // ข้อ 3 ด้านล่างจะจับ id หายเอง
    if (seen.has(id)) {
      fail(`SEARCH_INDEX.ALL: id "${id}" ซ้ำ`, `พบที่ตำแหน่ง ${seen.get(id)} และ ${idx}`);
    } else {
      seen.set(id, idx);
    }
  });
  if (failures.length === 0) pass('ไม่มี id ซ้ำใน SEARCH_INDEX.ALL');
})();

// ── 3) ทุก destination มี id/title/href/category/access ครบ + href ไม่ว่าง ──
(function checkRequiredFields() {
  if (!SEARCH_INDEX || !Array.isArray(SEARCH_INDEX.ALL)) return;
  const requiredFields = ['id', 'title', 'href', 'category', 'access'];
  let missingCount = 0;
  SEARCH_INDEX.ALL.forEach((entry) => {
    const label = (entry && entry.id) || JSON.stringify(entry).slice(0, 60);
    requiredFields.forEach((field) => {
      const value = entry ? entry[field] : undefined;
      if (typeof value !== 'string' || value.trim() === '') {
        missingCount++;
        fail(`entry "${label}": ฟิลด์ "${field}" หายไปหรือว่างเปล่า`);
      }
    });
  });
  if (missingCount === 0) pass(`ทุกรายการมีฟิลด์ id/title/href/category/access ครบ (${SEARCH_INDEX.ALL.length} รายการ)`);
})();

// ── 4) routingTitle (ถ้ามี) ต้องไม่ทำให้ title/href เดิมเปลี่ยน ──────────
(function checkRoutingTitleDoesNotOverwrite() {
  if (!SEARCH_INDEX || !Array.isArray(SEARCH_INDEX.ALL)) return;
  let withRoutingTitle = 0;
  let bad = 0;
  SEARCH_INDEX.ALL.forEach((entry) => {
    if (!entry || typeof entry.routingTitle !== 'string' || !entry.routingTitle) return;
    withRoutingTitle++;
    if (typeof entry.title !== 'string' || !entry.title) {
      bad++;
      fail(`entry "${entry.id}": มี routingTitle แต่ title หายไป (routingTitle ไม่ควรแทนที่ title เดิม)`);
    }
    if (typeof entry.href !== 'string' || !entry.href) {
      bad++;
      fail(`entry "${entry.id}": มี routingTitle แต่ href หายไป`);
    }
  });
  if (bad === 0) pass(`routingTitle ไม่ทำให้ title/href หายไป (ตรวจ ${withRoutingTitle} รายการที่มี routingTitle)`);
})();

// ── 5) SearchEngine.search() พื้นฐานทำงาน (คืน array, query ว่าง = ไม่พัง) ──
(function checkSearchBasic() {
  if (!SearchEngine || typeof SearchEngine.search !== 'function') {
    fail('SearchEngine.search ไม่ใช่ฟังก์ชัน');
    return;
  }
  const emptyResult = SearchEngine.search('');
  if (!Array.isArray(emptyResult) || emptyResult.length !== 0) {
    fail('SearchEngine.search(\'\') ควรคืน array ว่าง', `ได้ ${JSON.stringify(emptyResult)}`);
  } else {
    pass('SearchEngine.search(\'\') คืน array ว่างตามที่ควร (ไม่เดาเวลาไม่มีคำค้น)');
  }

  const toneResult = SearchEngine.search('聲調');
  if (!Array.isArray(toneResult) || !toneResult.length) {
    fail('SearchEngine.search(\'聲調\') ควรมีผลลัพธ์อย่างน้อย 1 รายการ');
  } else {
    const hasEntryShape = toneResult.every((r) => r && r.entry && typeof r.score === 'number');
    if (!hasEntryShape) fail('SearchEngine.search() ผลลัพธ์ต้องมีรูปแบบ {entry, score} ทุกรายการ');
    else pass('SearchEngine.search(\'聲調\') คืนผลลัพธ์รูปแบบ {entry, score} ถูกต้อง');
  }
})();

// ── 6) searchSite() ──────────────────────────────────────────────────────
(function checkSearchSite() {
  if (!SearchEngine || typeof SearchEngine.searchSite !== 'function') {
    fail('SearchEngine.searchSite ไม่ใช่ฟังก์ชัน');
    return;
  }

  // 6a) query ที่ไม่มีทางแมตช์ → confident:false, recommended ว่าง (ไม่เดา)
  const noMatch = SearchEngine.searchSite('zzzqqqxxx_ไม่มีทางเจอแน่นอน_123456');
  if (noMatch.confident !== false || !Array.isArray(noMatch.recommended) || noMatch.recommended.length !== 0) {
    fail('searchSite() กับคำค้นที่ไม่มีทางเจอ ควรได้ confident:false และ recommended ว่าง', JSON.stringify(noMatch));
  } else {
    pass('searchSite() กับคำค้นที่ไม่มีทางเจอ คืน confident:false ตามที่ควร (ไม่เดา)');
  }

  // 6b) query ที่แมตช์ควร confident:true และมี recommended
  const toneMatch = SearchEngine.searchSite('聲調');
  if (!toneMatch.confident || !toneMatch.recommended.length) {
    fail('searchSite(\'聲調\') ควร confident:true และมี recommended', JSON.stringify(toneMatch));
  } else {
    pass('searchSite(\'聲調\') คืน confident:true พร้อม recommended');
  }

  // 6c) searchSite() ต้องคืนผลจากหลาย category ได้จริง — "打字" แมตช์ทั้ง
  //     game-typing (practice) และบทความ a-texting (content) ในข้อมูลจริง
  const multiCategory = SearchEngine.searchSite('打字');
  if (!multiCategory.confident) {
    fail('searchSite(\'打字\') ควร confident:true', JSON.stringify(multiCategory));
  } else {
    const categoriesWithResults = Object.keys(multiCategory.related || {}).filter(
      (cat) => multiCategory.related[cat] && multiCategory.related[cat].length > 0
    );
    const recommendedCategories = new Set(multiCategory.recommended.map((e) => e.category));
    const totalCategoriesSeen = new Set([...categoriesWithResults, ...recommendedCategories]);
    if (totalCategoriesSeen.size < 2) {
      fail(
        'searchSite(\'打字\') ควรคืนผลจากมากกว่า 1 category (practice + content) — ถ้าข้อมูล/คะแนนเปลี่ยนจนเหลือ category เดียว ต้องตรวจว่าตั้งใจหรือบั๊ก',
        JSON.stringify({ recommended: multiCategory.recommended.map((e) => e.id), related: multiCategory.related })
      );
    } else {
      pass(`searchSite(\'打字\') คืนผลจากหลาย category ได้จริง (${[...totalCategoriesSeen].join(', ')})`);
    }
  }
})();

// ── 7) searchGamesOnly() ──────────────────────────────────────────────────
(function checkSearchGamesOnly() {
  if (!SearchEngine || typeof SearchEngine.searchGamesOnly !== 'function') {
    fail('SearchEngine.searchGamesOnly ไม่ใช่ฟังก์ชัน');
    return;
  }

  // 7a) คำค้นสำคัญต้องพาไปเกมที่ถูกต้อง (mapping ตามที่ Lin กำหนดใน search-index.js)
  const expectedMap = {
    '聲調': 'game-tone',
    '拼讀': 'game-reading',
    '聽力': 'game-listening',
    '打字': 'game-typing',
    '語序': 'game-word-order',
    '造句': 'game-lego',
  };
  let mappingOk = true;
  Object.keys(expectedMap).forEach((query) => {
    const expectedId = expectedMap[query];
    const result = SearchEngine.searchGamesOnly(query);
    if (!result.confident || !result.primary || result.primary.id !== expectedId) {
      mappingOk = false;
      fail(
        `searchGamesOnly('${query}') ควรพาไป "${expectedId}" แต่ได้ "${result.primary ? result.primary.id : '(ไม่มีผลลัพธ์)'}"`,
        JSON.stringify(result)
      );
    }
  });
  if (mappingOk) pass(`searchGamesOnly() พาไปเกมที่ถูกต้องครบทั้ง ${Object.keys(expectedMap).length} คำค้นสำคัญ`);

  // 7b) searchGamesOnly() ต้องไม่คืนบทความ/คอร์ส/FAQ — ลองด้วยคำค้นที่จะแมตช์ FAQ/บทความถ้าค้นทั้งเว็บ
  //     "試聽" แมตช์ course-trial ใน SEARCH_INDEX.ALL แต่ไม่อยู่ใน GAMES เลย
  const nonGameQuery = SearchEngine.searchGamesOnly('試聽');
  if (nonGameQuery.confident) {
    fail('searchGamesOnly(\'試聽\') ไม่ควรพาไปหน้าที่ไม่ใช่เกม (course-trial อยู่นอก pool GAMES)', JSON.stringify(nonGameQuery));
  } else {
    pass('searchGamesOnly(\'試聽\') ไม่หลุดไปหมวดที่ไม่ใช่เกม (confident:false ตามที่ควร)');
  }

  // 7c) ทุกผลลัพธ์ของ searchGamesOnly ต้องมาจาก category 'practice' เท่านั้น (กันในอนาคตมีคนเผลอใส่ pool ผิด)
  let allPracticeOk = true;
  Object.keys(expectedMap).forEach((query) => {
    const result = SearchEngine.searchGamesOnly(query);
    if (result.primary && result.primary.category !== 'practice') allPracticeOk = false;
    if (result.secondary && result.secondary.category !== 'practice') allPracticeOk = false;
  });
  if (!allPracticeOk) fail('searchGamesOnly() คืนรายการที่ category ไม่ใช่ \'practice\'');
  else pass('searchGamesOnly() คืนเฉพาะรายการ category \'practice\' เท่านั้น');
})();

// ── 8) search-ui.js / games-search-ui.js: ตรวจ contract แบบผิวๆ (ไม่เปิดเบราว์เซอร์จริง) ──
(function checkUiContract() {
  const searchUi = fs.existsSync(path.join(root, 'js/core/search-ui.js'))
    ? fs.readFileSync(path.join(root, 'js/core/search-ui.js'), 'utf8')
    : null;
  const gamesSearchUi = fs.existsSync(path.join(root, 'js/games/games-search-ui.js'))
    ? fs.readFileSync(path.join(root, 'js/games/games-search-ui.js'), 'utf8')
    : null;

  if (!searchUi) {
    fail('js/core/search-ui.js หายไป');
  } else if (!/SearchEngine\.searchSite\s*\(/.test(searchUi)) {
    fail('js/core/search-ui.js ไม่ได้เรียก SearchEngine.searchSite(...) — หน้าแรกอาจไม่ต่อกับ search engine แล้ว');
  } else {
    pass('js/core/search-ui.js ยังเรียก SearchEngine.searchSite(...) อยู่จริง');
  }

  if (!gamesSearchUi) {
    fail('js/games/games-search-ui.js หายไป');
  } else if (!/SearchEngine\.searchGamesOnly\s*\(/.test(gamesSearchUi)) {
    fail('js/games/games-search-ui.js ไม่ได้เรียก SearchEngine.searchGamesOnly(...) — games.html อาจไม่ต่อกับ search engine แล้ว');
  } else {
    pass('js/games/games-search-ui.js ยังเรียก SearchEngine.searchGamesOnly(...) อยู่จริง');
  }
})();

// ── สรุปผล ──────────────────────────────────────────────────────────────
if (warnings.length) {
  console.log(`\nคำเตือน ${warnings.length} รายการ (ไม่บล็อก ต้องตรวจด้วยตา):`);
  warnings.forEach((item) => console.log(`- ${item}`));
}

if (failures.length) {
  console.error(`\nไม่ผ่าน ${failures.length} รายการ:`);
  failures.forEach((item) => console.error(`- ${item}`));
  process.exit(1);
}

console.log(`\n✅ ผ่านทั้งหมด — ตรวจพฤติกรรม Search MVP (${passCount} เช็ก)`);
