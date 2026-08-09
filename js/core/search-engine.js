// ===================================================================
// 🔍 SEARCH-ENGINE — rule-based matcher ของ Search MVP (2026-08-09)
//
//   ทำงานตาม logic ที่ Lin กำหนดไว้ (73_CLAUDE_UPDATE หัวข้อ C/D):
//     1. Rule-based ก่อนเสมอ (ไฟล์นี้)
//     2. ถ้าไม่ชัด (คะแนนต่ำกว่า threshold) → ค่อย fallback ไป Gemini
//     3. Gemini เลือกได้เฉพาะ destination ที่ระบบกำหนด ห้ามสร้าง URL เอง
//     4. ไม่มั่นใจ = ไม่เดา (คืนค่า null ให้ UI โชว์ข้อความสุภาพแทนการเดา)
//
//   ⚠️ geminiFallback() ตอนนี้เป็นแค่ stub — ยังต่อไม่ได้จริง เพราะต้อง
//   deploy Edge Function ใหม่ขึ้น Supabase (ต้องมีสิทธิ์ deploy จริงที่
//   Claude ไม่มีในเซสชันนี้) + ต้องมี GEMINI_API_KEY จริง ดูรายละเอียด
//   ที่คอมเมนต์ก่อนฟังก์ชัน geminiFallback ด้านล่าง
// ===================================================================
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('../../data/search-index.js'));
  } else {
    root.SearchEngine = factory(root.SEARCH_INDEX);
  }
})(typeof self !== 'undefined' ? self : this, function (SEARCH_INDEX) {
  'use strict';

  // คะแนนขั้นต่ำถึงจะถือว่า "มั่นใจพอ" — ต่ำกว่านี้ = ไม่เดา
  var CONFIDENCE_THRESHOLD = 1;

  function normalize(s) {
    return String(s || '').toLowerCase().replace(/\s+/g, '').trim();
  }

  // ภาษาจีนไม่มีช่องว่างแบ่งคำ + Lin ต้องการให้ "พิมพ์ผิด/สลับคำ/ประโยคธรรมชาติ" ยังเจอได้
  // (73_CLAUDE_UPDATE หัวข้อ D) → substring ตรงเป๊ะอย่างเดียวไม่พอ (คนละลำดับคำ = ไม่ตรงเลย)
  // เสริมด้วย bigram overlap (นับ 2 ตัวอักษรติดกันที่ซ้ำกัน) เป็นสัญญาณเสริม ยังนับเป็น
  // rule-based ล้วนๆ (ไม่มี AI) แค่ทนต่อการสลับคำได้มากกว่า substring เฉยๆ
  function bigrams(s) {
    var out = [];
    for (var i = 0; i < s.length - 1; i++) out.push(s.substr(i, 2));
    return out;
  }
  function bigramOverlapRatio(a, b) {
    var ba = bigrams(a), bb = bigrams(b);
    if (!ba.length || !bb.length) return 0;
    var pool = {};
    bb.forEach(function (g) { pool[g] = (pool[g] || 0) + 1; });
    var hit = 0;
    ba.forEach(function (g) { if (pool[g] > 0) { hit++; pool[g]--; } });
    return hit / Math.max(ba.length, bb.length);
  }

  // สำคัญ: ใช้ "keyword ที่แม่นที่สุดตัวเดียว" (max) ไม่ใช่บวกสะสมทุก keyword
  // เพราะถ้าบวกสะสม รายการที่มี keyword คลุมเครือหลายคำจะชนะรายการที่มี
  // keyword ตรงเป๊ะแค่คำเดียว (พลาดจริงตอนทดสอบ 2026-08-09: ประโยคสลับคำ
  // "泰國人聽不懂我說話" vs "我聽不懂泰國人說話" ได้คะแนนใกล้กันเกินไปจนแยกไม่ออก)
  function bestKeywordScore(entry, qNorm) {
    var best = 0;
    (entry.keywords || []).forEach(function (kw) {
      var kwNorm = normalize(kw);
      if (!kwNorm) return;
      var s = 0;
      if (kwNorm === qNorm) s = 5;
      else if (kwNorm.indexOf(qNorm) !== -1 || qNorm.indexOf(kwNorm) !== -1) s = 2.5;
      else {
        // เผื่อพิมพ์ผิด/สลับคำเล็กน้อย — threshold สูง (0.8) ตั้งใจให้จับแค่
        // ผิดนิดเดียว ไม่ใช่ทั้งประโยคสลับคำ (แบบนั้นความหมายอาจเปลี่ยนไปเลย
        // ต้องให้ Gemini ตีความจริงๆ ไม่ใช่ rule-based เดา)
        var overlap = bigramOverlapRatio(qNorm, kwNorm);
        if (overlap >= 0.8) s = overlap * 1.5;
      }
      if (s > best) best = s;
    });
    return best;
  }

  function scoreEntry(entry, qNorm) {
    if (!qNorm) return 0;
    var titleNorm = normalize(entry.title);
    var descNorm = normalize(entry.desc);
    var score = 0;

    if (titleNorm && (titleNorm.indexOf(qNorm) !== -1 || qNorm.indexOf(titleNorm) !== -1)) score += 1.5;
    if (descNorm && descNorm.indexOf(qNorm) !== -1) score += 0.5;
    score += bestKeywordScore(entry, qNorm);

    return score;
  }

  // pool = array ของ entry ที่จะค้นหา (default = SEARCH_INDEX.ALL)
  function search(query, opts) {
    opts = opts || {};
    var pool = opts.pool || (SEARCH_INDEX ? SEARCH_INDEX.ALL : []);
    var qNorm = normalize(query);
    if (!qNorm) return [];

    var scored = pool.map(function (entry) {
      return { entry: entry, score: scoreEntry(entry, qNorm) };
    }).filter(function (r) { return r.score > 0; });

    scored.sort(function (a, b) { return b.score - a.score; });
    return scored;
  }

  // ── สำหรับหน้าแรก (index.html): 推薦給你 1-3 + 相關內容 แบ่งตาม category ──
  function searchSite(query) {
    var results = search(query);
    if (!results.length || results[0].score < CONFIDENCE_THRESHOLD) {
      return { confident: false, recommended: [], related: {} };
    }
    var recommended = results.slice(0, 3).map(function (r) { return r.entry; });
    var recommendedIds = {};
    recommended.forEach(function (e) { recommendedIds[e.id] = true; });

    var related = { practice: [], content: [], course: [], site: [] };
    results.forEach(function (r) {
      if (recommendedIds[r.entry.id]) return;
      var cat = r.entry.category;
      if (related[cat] && related[cat].length < 4) related[cat].push(r.entry);
    });

    return { confident: true, recommended: recommended, related: related };
  }

  // ── สำหรับ games.html: เกมหลัก 1 + เกมรอง สูงสุด 1 (เฉพาะ category:'practice') ──
  function searchGamesOnly(query) {
    var pool = (SEARCH_INDEX ? SEARCH_INDEX.GAMES : []);
    var results = search(query, { pool: pool });
    if (!results.length || results[0].score < CONFIDENCE_THRESHOLD) {
      return { confident: false, primary: null, secondary: null };
    }
    return {
      confident: true,
      primary: results[0].entry,
      secondary: results[1] ? results[1].entry : null
    };
  }

  // ────────────────────────────────────────────────────────────────
  // 🔴 ยังเป็นแค่ stub — บล็อกเพราะ:
  //   1) ต้อง deploy Edge Function ใหม่ขึ้น Supabase (ต้องมีสิทธิ์ deploy จริง
  //      ที่ Claude ไม่มีในเซสชันนี้ เหมือนที่บล็อก P7-02/N5 อยู่)
  //   2) ต้องมี GEMINI_API_KEY จริงตั้งเป็น secret ฝั่งเซิร์ฟเวอร์ (ห้ามอยู่ฝั่ง client เด็ดขาด)
  //   3) รายการ keyword/synonym ที่ใช้ตอนนี้ Claude ร่างจาก title/desc ของหน้าจริง
  //      ยังไม่ผ่าน Lin ตรวจทีละรายการ — ควรให้ Lin ตรวจก่อน publish จริง
  //      (แนวทางเดียวกับกฎ "ข้อมูลเกมต้องผ่าน Lin ตรวจ" แม้เนื้อหานี้จะเป็น
  //      metadata การค้นหา ไม่ใช่คำศัพท์เกมโดยตรงก็ตาม)
  //   ตอนนี้ถ้า rule-based หาไม่เจอ (ไม่มั่นใจ) → คืน null ให้ UI โชว์ข้อความ
  //   สุภาพแทน ไม่เดา ไม่ยิง API ไหนทั้งสิ้น
  // ────────────────────────────────────────────────────────────────
  function geminiFallback(query) {
    return Promise.resolve(null);
  }

  return {
    search: search,
    searchSite: searchSite,
    searchGamesOnly: searchGamesOnly,
    geminiFallback: geminiFallback,
    CONFIDENCE_THRESHOLD: CONFIDENCE_THRESHOLD
  };
});
