/**
 * mix-game-app.js — เกมรวม (โปรโตไทป์) — Lin 2026-07-25
 * ขอบเขต: เฉพาะ 初級ทั้งหมด (พยางค์เดียว + 2 พยางค์ 266/266 คำ) · 3 ด่าน: ทายเสียง → ต่อพยางค์ → พิมพ์
 * ไม่ต่อเซิร์ฟเวอร์เลย — ไม่มีล็อกอิน ไม่มีดาว ไม่มี SRS ไม่มีกระดานคะแนน (ตกลงกับ Lin 2026-07-25)
 * ไฟล์นี้เป็นไฟล์ใหม่ล้วน ไม่แก้ไฟล์เดิมสักบรรทัด (tone-finder-game.js / reading-game-app.js / typing-game-app.js ไม่ถูกแตะ)
 *
 * แก้ 2026-07-25 (รอบ 2 — Lin บอก "ไม่เห็นเหมือนเกมตอนนี้เลย"): เปลี่ยนมาใช้ class ชื่อเดียวกับเกมเดิมเป๊ะ
 * (ก็อปมาจาก reading-game.html + typing-game.html จริง) + ป้าย UI เป็นภาษาจีนตามเว็บจริงทั้งเว็บ
 *
 * แก้ 2026-07-25 (รอบ 3 — Lin สั่ง "ทุกเกมเลยนะ เล่นจริงล้วนๆ"): เอาไฮไลต์ปุ่มถัดไป (ด่านพิมพ์) ออก
 * ระหว่างเทสเจอบั๊กจริง 2 อัน (ไม่เกี่ยวกับตัวใบ้ แต่ตัวใบ้บังไว้): 1) ไม่มีแป้น Shift เลย คำที่ต้องกด Shift พิมพ์ไม่ได้จริง
 * 2) คีย์บอร์ดขาดคอลัมน์ท้ายแถว (บ/ล/ว/ง/ม/ใ/ฝ ไม่มีปุ่ม) — แก้ทั้งคู่แล้ว คัดลอกจาก typing-game-app.js ของจริง
 *
 * แก้ 2026-07-25 (รอบ 4 — Lin สั่ง "คำหลายพยางค์ ก็ทำเหมือนกันไปเลย" หลังถามว่าต่างกันยังไง):
 * เพิ่มคำ 2 พยางค์ (83/266 คำที่เคยตัดออก) เข้าพูลด้วย — อ้างอิงวิธีคิดจากเกมต้นฉบับจริง (grep tone-finder-game.js /
 * reading-game-app.js / typing-game-app.js) ไม่ได้เดาเอง:
 *   - ด่านทายเสียง+ด่านต่อพยางค์: คำหลายพยางค์ = ไล่ทีละพยางค์ (พยางค์ไหนเสียง/ตัวสะกดต่างกันก็ถามแยก)
 *     คะแนน = เฉลี่ยคะแนนต่อพยางค์ แล้วคูณทอง+คอมโบ "ครั้งเดียว" ตอนจบทั้งคำ (กันปั๊มด้วยคำยาว — สูตรเดียวกับ tone-finder-game.js
 *     บรรทัด ~1722-1733)
 *   - ด่านพิมพ์: พิมพ์ทั้งคำรวดเดียว (ไม่หยุดถามทีละพยางค์) นับผิดสะสมทั้งคำ — ตรงกับ typing-game-app.js rgContStart()/rgContChar()
 *   - พยางค์ไหนผิดครบ 4 ครั้ง = เฉลย 0 แต้มพยางค์นั้น แล้วไปพยางค์ถัดไปของคำเดิมทันที (ไม่ใช่ข้ามไปคำอื่น) ตรงกับ
 *     tfAfterForcedRevealSyl ของจริง — พยางค์สุดท้ายผิดครบถึงจะจบคำ
 *   - จำนวนการ์ดต่อรอบยังคง 5 คำ×3 ด่าน=15 การ์ดเท่าเดิม ไม่ได้เพิ่มตามความยาวคำ (ทำให้ความยาวรอบคาดเดาได้ง่าย
 *     เป็นทางลัดที่ตั้งใจต่างจากต้นฉบับเล็กน้อย — คำยาวจะใช้เวลาต่อการ์ดนานกว่า ไม่ใช่นับเป็นหลายการ์ด)
 *
 * กลไกคะแนนยืมมาจาก MASTER RULES เดิมที่ 4 เกมใช้ร่วมกัน (บันได / คอมโบ / ทองคำ) เพื่อความคุ้นเคย
 * ไม่ได้ import ไฟล์เดิม — เขียนค่าคงที่ซ้ำไว้ในไฟล์นี้ตรงๆ (เจตนา ไม่ใช่บั๊ก — กันไฟล์ใหม่พังไฟล์เก่า)
 *
 * โครงข้อมูลที่ใช้จาก data/words-data.js (ไม่แก้ไฟล์นั้นเลย แค่เรียกอ่าน):
 *   buildWordsForPhonicsGames(WORDS_MASTER) → {th, zh, en, level, cons, lead, cluster, vowel, tone, final, tone_name, syls, readingTH}
 *
 * โครงข้อมูลที่ใช้จาก data/tone-engine.js (ไม่แก้ไฟล์นั้นเลย แค่เรียกอ่าน):
 *   TH_ENGINE.{hasToneMark,getToneMark,getInitClass,isLiveWord,getVowelType,getInitChar}
 *   getFullSyllableSpelling(syl), buildToneReason(w), computeToneFromSpelling(word)
 *
 * ────────────────────────────────────────────────────────────────────────────
 * แก้ใหญ่ 2026-07-31 (Lin สั่ง "ทำทุกอย่างให้เหมือนเกมจริงๆเลย เก็บคะแนน เก็บข้อมูล ล็อกอิน หน้าตา ระบบ ปุ่มเมนู"):
 * ยกเลิกข้อความเดิมด้านบนที่บอกว่า "ไม่ต่อเซิร์ฟเวอร์เลย" — ตอนนี้ต่อระบบเดียวกับ 4 เกมจริงแล้วบางส่วน:
 *
 * 1) เปลี่ยนสถาปัตยกรรมการวาดจอ: เดิม render() เขียนทับ card.innerHTML ทั้งก้อนทุกครั้ง (รวมแถวปุ่มใต้คำ)
 *    ตอนนี้แยกเป็น 2 ส่วนถาวร (ประกาศไว้ตรงๆ ใน mix.html ไม่ได้สร้างด้วย JS แล้ว):
 *      #mx-dynamic    → ส่วนที่เปลี่ยนทุกการ์ด (goldbanner/stagetag/คำ/ผลลัพธ์/เนื้อหาด่าน) — render() เขียนทับตรงนี้แทน
 *      #word-ctl-row  → แถวปุ่ม 🔊ฟังเสียง/🍙คำแปล/🔖เซฟคำ อยู่นิ่งตลอดเกม ไม่ถูกลบสร้างใหม่ — เกมแค่เรียก
 *                       WordAudio.setCurrent()/เติมปุ่ม vault ใหม่ทุกครั้งที่คำเปลี่ยน (เหมือน reading-game-app.js บรรทัด 695-706)
 *    เหตุผล: WordMenu.init()/word-audio.js ผูกปุ่มด้วย id ครั้งเดียวตอนโหลดหน้า ถ้าปุ่มถูกลบสร้างใหม่ทุกคำ
 *    (แบบเดิม) ปุ่มจะเป็นปุ่มใหม่ที่ไม่มีใครผูก event ให้ — ต้องแยกส่วนถาวรออกมาก่อนถึงจะต่อระบบเดิมได้จริง
 *
 * 2) ล็อกอิน + บันทึกคะแนนรวม: ใช้ระบบเดิมของเว็บทั้งชุด (reading-auth.js) ไม่ได้สร้างระบบใหม่ — เพิ่มแค่กิ่ง
 *    'mix' ใน pageGame()/boardHref() ของ reading-auth.js (ดูคอมเมนต์ในไฟล์นั้น) แล้วเรียก
 *    READING_AUTH.saveScore(score, 1, 'mix', wrongItems) ตอนจบรอบ — ขึ้นกระดาน mix-board.html (คัดลอกแบบ typing-board.html)
 *    ดาว/streak โชว์จากบัญชีกลางเดียวกับทุกเกม (game-account.js) — ไม่ได้แจกดาวเองฝั่ง client (ดูข้อ 3)
 *
 * 3) ดาว/SRS (ทวนคำ) แยกชุด 'mix' ต่างหาก (Lin เลือกตอบ 2026-07-31: "แยกชุดใหม่ต่างหาก" ไม่ใช้ร่วมกับ 3
 *    เกมเดิม) — โค้ดนี้เรียก TONE_SERVER.finishRound({...,game:'mix'}) ให้แล้ว แต่ Edge Function tone-round
 *    (supabase/functions/tone-round/index.ts บรรทัด 656) ยัง "ไม่รู้จัก" เกม 'mix' (whitelist มีแค่
 *    tone/reading/typing/wordorder) → ตอนนี้ก็อป TONE_SERVER.finishRound() ยังไม่ทำงานจริง (เซิร์ฟเวอร์ตอบ
 *    "bad game" เงียบๆ ไม่มีดาว ไม่มีผลอะไรกับเกม) — รอ Lin แก้ไฟล์นั้น (เพิ่ม "mix" เข้า whitelist) + deploy เอง
 *    ทาง Supabase CLI ก่อน ถึงจะเริ่มแจกดาว/จำ SRS จริง ไม่ต้องแก้โค้ดฝั่งนี้เพิ่มอีก
 *    ⚠️ ออกแบบแบบง่ายลงจากของจริง (ต้องบอก Lin ตรงๆ ไม่ปิดบัง): มิกซ์มี 3 ด่านซ้อนต่อคำ (ทายเสียง/ต่อพยางค์/พิมพ์)
 *    แต่ Edge Function ออกแบบมาให้คิดทีละ "1 กลไกต่อคำ" — โค้ดนี้เลยเรียก finishRound() แค่ "1 ครั้งต่อคำต่อรอบ"
 *    (หลังทำครบทั้ง 3 ด่านของคำนั้น) แบบ trust-clean เดียวกับที่เกมอ่าน/พิมพ์ใช้ (game!=='tone' → เชื่อ flag
 *    clean จาก client) ไม่ได้แยก SRS ย่อยเป็นราย-ด่าน — ถ้า Lin อยากได้ SRS ละเอียดกว่านี้ (แยกทายเสียง/สะกด/พิมพ์
 *    เป็นคนละสถิติ) ต้องคุยออกแบบเพิ่มอีกรอบ ยังไม่ทำตอนนี้
 *
 * 4) ปุ่ม 🪧 แจ้งปัญหา/รีวิว (ระบบแต้มแยกต่างหาก) — ยังไม่เปิดให้หน้านี้ (game-reward Edge Function/DB
 *    ยัง whitelist ไม่รู้จัก 'mix' เหมือนกัน) ปุ่มจะไม่โผล่ที่หน้านี้เฉยๆ ไม่กระทบอะไร รอ Lin สั่งถ้าต้องการ
 */
(function () {
  'use strict';

  // ════════════════════════════════════════════
  // ค่าคงที่คะแนน — ชุดเดียวกับ MASTER RULES ของ 4 เกมเดิม (10/7/4/1/0, คอมโบ 3/5/8, ทองคำ 18%)
  // ════════════════════════════════════════════
  var LADDER = [10, 7, 4, 1, 0];
  var FAIL_AT = 4;
  var GOLDEN_CHANCE = 0.18;
  var GOLDEN_MULT = 2;
  var ROUND_WORDS = 5;
  var STAGE_NAMES = ['聲調', '拼字', '打字'];

  function comboMult(streak) {
    if (streak >= 8) return 3;
    if (streak >= 5) return 2;
    if (streak >= 3) return 1.5;
    return 1;
  }

  var TONE_NAME_TO_NUM = { 'สามัญ': 1, 'เอก': 2, 'โท': 3, 'ตรี': 4, 'จัตวา': 5 };
  var TONE_NUM_ZH = ['', '第一聲', '第二聲', '第三聲', '第四聲', '第五聲'];

  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function pick(arr, n) { return shuffle(arr).slice(0, n); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  // ════════════════════════════════════════════
  // ข้อมูล — 初級ทั้งหมด (266/266 คำ — พยางค์เดียว+2 พยางค์ รวมกัน 2026-07-25 รอบ 4)
  // ════════════════════════════════════════════
  var POOL = buildWordsForPhonicsGames(WORDS_MASTER).filter(function (w) { return w.level === '初'; });

  var S = {
    queue: [], total: 0, done: 0, score: 0, streak: 0, perfectCount: 0,
    okCount: 0, badCount: 0, // 2026-07-25 รอบ7: เพิ่มให้ตรงกับ score-bar จริง (✓/✗) — Lin บอก "หน้าตาในเกมตอนเล่น" ไม่เหมือน
    cur: null, derivStep: null, typePos: 0, shiftOn: false, resolving: false,
    wrongCounts: {}, // 2026-07-31: {th: จำนวนครั้งที่พลาด} ต่อรอบ — ส่งเข้า READING_AUTH.saveScore() ตอนจบรอบ
    lastWordTh: null // 2026-07-31: กันเรียก WordAudio.setCurrent()/เติมปุ่ม vault ซ้ำถ้าเป็นคำเดิม (ข้ามด่านในคำเดียวกัน)
  };

  // 2026-07-25: แก้บั๊กจริงอีกจุด — แถวเดิมตัด BracketLeft/Right, Semicolon, Quote, Backslash, Comma, Period, Slash ออก
  // ทำให้ตัวอักษรพื้นฐานอย่าง บ/ล/ว/ง/ม/ใ/ฝ (อยู่ปุ่มพวกนี้ในเลย์เอาต์ Kedmanee จริง) กดไม่ได้เลย — คัดลอกแถวเต็มจาก typing-game-app.js บรรทัด 1683-1686 มาแทน
  var TK_ROWS = [
    ['Backquote', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0', 'Minus', 'Equal'],
    ['KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT', 'KeyY', 'KeyU', 'KeyI', 'KeyO', 'KeyP', 'BracketLeft', 'BracketRight'],
    ['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyJ', 'KeyK', 'KeyL', 'Semicolon', 'Quote', 'Backslash'],
    ['KeyZ', 'KeyX', 'KeyC', 'KeyV', 'KeyB', 'KeyN', 'KeyM', 'Comma', 'Period', 'Slash']
  ];
  // 2026-07-25: เจอบั๊กจริงระหว่างทดสอบ — ตอนแรกมีแค่ base map ไม่มี shift map เลย ทำให้คำที่ตัวอักษรอยู่บนแป้น
  // Shift (เช่น "โจ๊ก" ตัว โ อยู่ Shift+F) พิมพ์ไม่ได้จริง ไม่ใช่แค่เรื่องตัวใบ้ — ต้องเพิ่มแป้น Shift เข้าไปด้วย
  var RG_BASE_MAP = {
    Backquote: '_', Digit1: 'ๅ', Digit2: '/', Digit3: '-', Digit4: 'ภ', Digit5: 'ถ', Digit6: 'ุ', Digit7: 'ึ', Digit8: 'ค', Digit9: 'ต', Digit0: 'จ', Minus: 'ข', Equal: 'ช',
    KeyQ: 'ๆ', KeyW: 'ไ', KeyE: 'ำ', KeyR: 'พ', KeyT: 'ะ', KeyY: 'ั', KeyU: 'ี', KeyI: 'ร', KeyO: 'น', KeyP: 'ย', BracketLeft: 'บ', BracketRight: 'ล',
    KeyA: 'ฟ', KeyS: 'ห', KeyD: 'ก', KeyF: 'ด', KeyG: 'เ', KeyH: '้', KeyJ: '่', KeyK: 'า', KeyL: 'ส', Semicolon: 'ว', Quote: 'ง', Backslash: 'ฃ',
    KeyZ: 'ผ', KeyX: 'ป', KeyC: 'แ', KeyV: 'อ', KeyB: 'ิ', KeyN: 'ื', KeyM: 'ท', Comma: 'ม', Period: 'ใ', Slash: 'ฝ'
  };
  var RG_SHIFT_MAP = {
    Backquote: '%', Digit1: '+', Digit2: '๑', Digit3: '๒', Digit4: '๓', Digit5: '๔', Digit6: 'ู', Digit7: '฿', Digit8: '๕', Digit9: '๖', Digit0: '๗', Minus: '๘', Equal: '๙',
    KeyQ: '๐', KeyW: '"', KeyE: 'ฎ', KeyR: 'ฑ', KeyT: 'ธ', KeyY: 'ํ', KeyU: '๊', KeyI: 'ณ', KeyO: 'ฯ', KeyP: 'ญ', BracketLeft: 'ฐ', BracketRight: ',',
    KeyA: 'ฤ', KeyS: 'ฆ', KeyD: 'ฏ', KeyF: 'โ', KeyG: 'ฌ', KeyH: '็', KeyJ: '๋', KeyK: 'ษ', KeyL: 'ศ', Semicolon: 'ซ', Quote: '.', Backslash: 'ฅ',
    KeyZ: '(', KeyX: ')', KeyC: 'ฉ', KeyV: 'ฮ', KeyB: 'ฺ', KeyN: '์', KeyM: '?', Comma: 'ฒ', Period: 'ฬ', Slash: 'ฦ'
  };

  var CONS_GROUPS = [
    ['ก', 'ภ', 'ถ'], ['ข', 'ช', 'ซ'], ['ค', 'ด', 'ศ', 'ต'], ['บ', 'ษ', 'ป'],
    ['พ', 'ฟ', 'ผ', 'ฝ'], ['ม', 'ห', 'น', 'ฆ'], ['อ', 'ย'], ['ท'],
    ['ร', 'ธ'], ['ล', 'ส', 'ฉ', 'จ'], ['ง', 'ว'], ['ฎ', 'ฏ'],
    ['ญ', 'ณ', 'ฌ'], ['ฒ'], ['ฬ'], ['ฐ'], ['ฑ'], ['ฮ']
  ];
  var TONE_POOL = ['่', '้', '๊', '๋', '์'];
  var CONS_SOUND = {
    'ก': 'ก', 'ข': 'ข', 'ค': 'ค', 'ง': 'ง', 'จ': 'จ', 'ช': 'ช',
    'ซ': 'ซ', 'ฉ': 'ฉ', 'ฌ': 'ช', 'ญ': 'ย', 'ฎ': 'ด', 'ฏ': 'ต',
    'ฐ': 'ถ', 'ฑ': 'ท', 'ฒ': 'ท', 'ณ': 'น', 'ด': 'ด', 'ต': 'ต',
    'ถ': 'ถ', 'ท': 'ท', 'ธ': 'ท', 'น': 'น', 'บ': 'บ', 'ป': 'ป',
    'ผ': 'ผ', 'ฝ': 'ฝ', 'พ': 'พ', 'ฟ': 'ฟ', 'ภ': 'พ', 'ม': 'ม',
    'ย': 'ย', 'ร': 'ร', 'ล': 'ล', 'ว': 'ว', 'ศ': 'ส', 'ษ': 'ส',
    'ส': 'ส', 'ห': 'ห', 'ฬ': 'ล', 'อ': 'อ', 'ฮ': 'ฮ', 'ฆ': 'ค'
  };
  function findGroup(list, ch) { for (var i = 0; i < list.length; i++) if (list[i].indexOf(ch) >= 0) return list[i]; return [ch]; }
  function distractors(list, correct, n) {
    var group = findGroup(list, correct).filter(function (c) { return c !== correct; });
    var pool = shuffle(group).slice(0, n - 1);
    return shuffle([correct].concat(pool));
  }

  // ════════════════════════════════════════════
  // เริ่มรอบใหม่
  // ════════════════════════════════════════════
  function makeCard(w, st, golden) {
    // sylWrong/sylIdx/sylBaseSum: ใช้เฉพาะด่าน 1(ทายเสียง)/2(ต่อพยางค์) — ไล่ทีละพยางค์ + เฉลี่ยคะแนนตอนจบคำ
    // wrongCount: ใช้เฉพาะด่าน 3(พิมพ์) — พิมพ์ทั้งคำรวดเดียว นับผิดสะสมทั้งคำ (ตรงกับ typing-game-app.js ของจริง)
    return {
      word: w, stage: st, golden: golden,
      wrongCount: 0,
      sylIdx: 0, sylWrong: w.syls.map(function () { return 0; }), sylBaseSum: 0, anyFail: false
    };
  }

  function startRound() {
    var words = pick(POOL, Math.min(ROUND_WORDS, POOL.length));
    var cards = [];
    words.forEach(function (w) {
      var golden = Math.random() < GOLDEN_CHANCE;
      for (var st = 1; st <= 3; st++) cards.push(makeCard(w, st, golden));
    });
    S.queue = shuffle(cards);
    S.total = S.queue.length;
    S.done = 0; S.score = 0; S.streak = 0; S.perfectCount = 0; S.okCount = 0; S.badCount = 0;
    S.wrongCounts = {}; S.lastWordTh = null;
    // 2026-07-31: บันทึกว่าคำไหน "ผ่านครบ 3 ด่านแล้วสะอาดแค่ไหน" ไว้ส่ง TONE_SERVER ทีเดียวตอนจบคำ (ดูข้อ 3 ด้านบนไฟล์)
    S.wordStageDone = {}; // { th: {stages: Set-like obj, anyWrong: bool} }
    nextCard();
  }

  function nextCard() {
    S.derivStep = null; S.typePos = 0; S.resolving = false;
    if (S.queue.length === 0) { renderEnd(); return; }
    S.cur = S.queue.shift();
    render();
  }

  function cardWasClean(card) {
    if (card.stage === 3) return card.wrongCount === 0;
    return card.sylWrong.every(function (x) { return x === 0; });
  }

  // 2026-07-31: บันทึกคำผิดต่อ "คำ" (ไม่ใช่ต่อการ์ด) ไว้ส่งเข้า reading_sessions.wrong_items ตอนจบรอบ
  // (เหมือน rgWrongItemsFromLog ของเกมอ่าน/พิมพ์) — ใช้ทำระบบฝึกจุดอ่อนภายหลังได้ ไม่ต้องเดา
  function logWrong(th) {
    S.wrongCounts[th] = (S.wrongCounts[th] || 0) + 1;
  }
  function wrongItemsForSave() {
    var out = [];
    for (var th in S.wrongCounts) { if (S.wrongCounts.hasOwnProperty(th)) out.push({ th: th, wrong: S.wrongCounts[th] }); }
    return out;
  }

  // 2026-07-31: ติดตาม "คำนี้ทำครบ 3 ด่านหรือยัง สะอาดไหม" — พอครบ 3 ด่าน ค่อยเรียก TONE_SERVER.finishRound()
  // ครั้งเดียวต่อคำต่อรอบ (ดูหมายเหตุข้อ 3 ท้ายหัวไฟล์ — เหตุผลที่ไม่แยกเรียกทีละด่าน)
  function markStageDone(th, clean) {
    var rec = S.wordStageDone[th] || (S.wordStageDone[th] = { n: 0, anyWrong: false });
    rec.n++;
    if (!clean) rec.anyWrong = true;
    if (rec.n >= 3 && window.TONE_SERVER && window.TONE_SERVER.available && window.TONE_SERVER.available()) {
      try {
        window.TONE_SERVER.finishRound({ word: th, level: 1, game: 'mix', clean: !rec.anyWrong });
      } catch (e) {} // เงียบได้ — ไม่ใช่ด่านหลักของเกม (ดาว/SRS) แค่ยังไม่เปิดใช้จนกว่า Lin จะ deploy (ดูหมายเหตุข้อ 3)
    }
  }

  // ป้องกันคะแนนเบิ้ล: ระหว่างรอทรานซิชัน (750-1200ms หลังตอบ) ต้องล็อกอินพุตทั้งหมด
  // เจอบั๊กจริงระหว่างทดสอบ 2026-07-25 — ปุ่ม 檢查/ปุ่มพิมพ์ ยังกดซ้ำได้ระหว่างรอ ทำให้ finishCard() ถูกเรียกซ้ำๆ
  // บนการ์ดเดิม คะแนนพุ่งเกินจริง (990 แต้มจาก 15 ข้อ, perfectCount ทะลุ total) — แก้โดยเช็ค S.resolving ทุกจุดรับอินพุต
  //
  // ด่าน 3 (พิมพ์): ผิด = นับสะสมทั้งคำ, ผิดครบ FAIL_AT = จบการ์ดทันที (0 แต้ม)
  // ด่าน 2 (ต่อพยางค์): ผิด = นับเฉพาะพยางค์ปัจจุบัน, ผิดครบ FAIL_AT ในพยางค์นั้น = เฉลย 0 แต้มพยางค์นั้น
  //   แล้วไปพยางค์ถัดไปของคำเดิมทันที (ไม่ใช่จบการ์ด) เว้นแต่เป็นพยางค์สุดท้ายแล้วถึงจะจบการ์ด — ตรงกับเกมต้นฉบับ
  //   (tfAfterForcedRevealSyl: "พยางค์เดียว→คำใหม่ · หลายพยางค์→พยางค์ถัดไปของคำเดิม")
  function requeueWrong(card) {
    if (S.resolving) return;
    S.resolving = true;
    logWrong(card.word.th);
    if (card.stage === 3) {
      card.wrongCount++;
      if (card.wrongCount >= FAIL_AT) { finishCard(card, 0, true); return; }
      S.queue.push(card); flashBanner(false); setTimeout(nextCard, 750);
      return;
    }
    card.sylWrong[card.sylIdx]++;
    if (card.sylWrong[card.sylIdx] >= FAIL_AT) { sylForceFail(card); return; }
    S.queue.push(card); flashBanner(false); setTimeout(nextCard, 750);
  }

  // พยางค์ปัจจุบันผิดครบ FAIL_AT ครั้ง → เฉลย 0 แต้มพยางค์นี้ แล้วไปพยางค์ถัดไปของ "คำเดิม" ทันที (ไม่สลับคำ)
  // พยางค์สุดท้ายถึงจะปิดการ์ด (finalizeMultiCard → finishCard failed=true)
  function sylForceFail(card) {
    S.resolving = true;
    card.anyFail = true;
    card.sylIdx++;
    if (card.sylIdx >= card.word.syls.length) { finalizeMultiCard(card); return; }
    flashBanner(false, 0, true);
    setTimeout(function () { S.resolving = false; render(); }, 900);
  }

  // ด่าน 1/2 พยางค์ปัจจุบันตอบถูก → บวกคะแนนพยางค์นี้เข้ากอง แล้วไปพยางค์ถัดไปของคำเดิมทันที (ไม่สลับคำ)
  // พยางค์สุดท้ายถึงจะปิดการ์ด (finalizeMultiCard → finishCard)
  function sylCorrect(card) {
    if (S.resolving) return;
    S.resolving = true;
    var wc = card.sylWrong[card.sylIdx];
    var base = LADDER[wc] != null ? LADDER[wc] : 0;
    card.sylBaseSum += base;
    card.sylIdx++;
    if (card.sylIdx >= card.word.syls.length) { finalizeMultiCard(card); return; }
    flashBanner(true, base);
    setTimeout(function () { S.resolving = false; render(); }, 750);
  }

  // ทุกพยางค์ของด่าน 1/2 ทำครบแล้ว → เฉลี่ยคะแนนต่อพยางค์ (สูตรเดียวกับ tone-finder-game.js บรรทัด ~1722-1733)
  function finalizeMultiCard(card) {
    var n = card.word.syls.length;
    var avg = card.sylBaseSum / n;
    finishCard(card, avg, !!card.anyFail);
  }

  function finishCard(card, basePts, failed) {
    S.resolving = true;
    S.done++;
    var clean = cardWasClean(card);
    var pts = basePts;
    if (!failed && card.golden && clean) pts = pts * GOLDEN_MULT;
    if (!failed) {
      S.streak++;
      pts = Math.max(1, Math.round(pts * comboMult(S.streak)));
      if (clean) S.perfectCount++;
      S.okCount++;
    } else {
      S.streak = 0;
      pts = Math.round(pts);
      S.badCount++;
    }
    S.score += pts;
    markStageDone(card.word.th, clean); // 2026-07-31: ครบ 3 ด่านของคำนี้ค่อยยิง TONE_SERVER (ดูข้อ 3 ท้ายหัวไฟล์)
    flashBanner(!failed, pts, failed);
    setTimeout(nextCard, failed ? 1200 : 750);
  }

  // ใช้เฉพาะด่าน 3 (พิมพ์) — พิมพ์ทั้งคำรวดถูกหมด = จบการ์ดทันที ไม่มีพยางค์ย่อยให้ไล่
  function answerCorrect(card) {
    if (S.resolving) return;
    S.resolving = true;
    var pts = LADDER[card.wrongCount] != null ? LADDER[card.wrongCount] : 0;
    finishCard(card, pts, false);
  }

  var bannerEl = null;
  function flashBanner(ok, pts, revealMsg) {
    if (!bannerEl) return;
    bannerEl.className = 'result-banner show ' + (ok ? 'ok' : 'no');
    bannerEl.textContent = ok ? ('✓ 答對了 +' + pts + ' 分') : (revealMsg ? '📖 直接公佈答案' : '✗ 這題晚點還會再出現');
    setTimeout(function () { bannerEl.className = 'result-banner'; }, 700);
  }

  // ════════════════════════════════════════════
  // บัญชี/ดาว/streak — ใช้บัญชีกลางเดียวกับทุกเกม (game-account.js) — เพิ่ม 2026-07-31
  // ════════════════════════════════════════════
  var BADGE_STAGES = [
    { min: 0, emoji: '🌱' }, { min: 1, emoji: '🌿' }, { min: 2, emoji: '🌲' }, { min: 4, emoji: '🌴' },
    { min: 6, emoji: '🌸' }, { min: 9, emoji: '🌻' }, { min: 12, emoji: '🌈' }, { min: 16, emoji: '🏆' },
    { min: 20, emoji: '💎' }, { min: 30, emoji: '👑' }
  ];
  function badgeEmoji(n) { var e = '🌱'; BADGE_STAGES.forEach(function (s) { if (n >= s.min) e = s.emoji; }); return e; }

  // เรียกได้จาก 2 ทาง: (1) reading-auth.js เรียกอัตโนมัติทุกครั้งที่สถานะล็อกอินเปลี่ยน (ผูกไว้ในลิสต์เดียวกับ
  // rgRenderGameBar/legoRenderGameBar/woRerenderBar ที่ reading-auth.js:350) (2) เกมนี้เรียกเองตอน mount()/จบรอบ
  function mxRenderGameBar() {
    var loggedIn = !!(window.READING_AUTH && window.READING_AUTH.user);
    var row = document.getElementById('rg-stat-row');
    if (row) row.style.display = loggedIn ? 'flex' : 'none';
    if (!loggedIn || !window.GAME_ACCOUNT) return;
    var sn = document.getElementById('rg-streak-num'); if (sn) sn.textContent = GAME_ACCOUNT.getStreak() || 0;
    var sc = document.getElementById('star-count'); if (sc) sc.textContent = GAME_ACCOUNT.getStars() || 0;
    var badges = GAME_ACCOUNT.earnedBadges();
    var bc = document.getElementById('badge-count'); if (bc) bc.textContent = badges.length;
    var be = document.getElementById('badge-emoji'); if (be) be.textContent = badgeEmoji(badges.length);
  }
  window.mxRenderGameBar = mxRenderGameBar;

  // ════════════════════════════════════════════
  // 讀音(🐣/🥚) / 英文讀音(🔡/🔠) / 字體(✍️) — เพิ่ม 2026-07-31 ตามที่ Lin สั่ง "ทำต่อให้หมด"
  // ใช้ localStorage key เดียวกับ reading-game.html/typing-game.html เป๊ะ (rg_pron_mode/rg_en_mode/rg_modern_font)
  // ตั้งใจให้ใช้ค่าเดียวกันข้ามเกม — เปิดโหมดนี้ที่เกมไหนก็ติดไปเกมอื่นด้วย ไม่ต้องตั้งซ้ำ
  // ════════════════════════════════════════════
  var pronMode = (function () { try { var v = localStorage.getItem('rg_pron_mode'); return v === null ? false : v === '1'; } catch (e) { return false; } })();
  var enMode = (function () { try { var v = localStorage.getItem('rg_en_mode'); return v === null ? false : v === '1'; } catch (e) { return false; } })();

  function renderPronBtn() {
    var btn = document.getElementById('rg-pron-toggle');
    if (!btn) return;
    btn.textContent = pronMode ? '🐣' : '🥚';
    btn.title = pronMode ? '目前：讀音已顯示（點擊隱藏）' : '目前：讀音已隱藏（點擊顯示）';
    btn.setAttribute('aria-label', btn.title);
  }
  function renderEnBtn() {
    var btn = document.getElementById('rg-en-toggle');
    if (!btn) return;
    btn.textContent = enMode ? '🔡' : '🔠';
    btn.title = enMode ? '目前：英文讀音已顯示（點擊隱藏）' : '目前：英文讀音已隱藏（點擊顯示）';
    btn.setAttribute('aria-label', btn.title);
  }
  function renderRevLines() {
    var w = S.cur && S.cur.word;
    var pEl = document.getElementById('rev-pron'); if (pEl) pEl.textContent = (pronMode && w) ? (w.readingTH || w.th || '') : '';
    var eEl = document.getElementById('rev-en'); if (eEl) eEl.textContent = (enMode && w && w.en) ? w.en : '';
  }
  function setPronMode(on) { pronMode = !!on; try { localStorage.setItem('rg_pron_mode', pronMode ? '1' : '0'); } catch (e) {} renderPronBtn(); renderRevLines(); }
  function setEnMode(on) { enMode = !!on; try { localStorage.setItem('rg_en_mode', enMode ? '1' : '0'); } catch (e) {} renderEnBtn(); renderRevLines(); }

  // ✍️ สลับฟอนต์ — ใช้ชื่อฟังก์ชันเดียวกับเกมอ่าน/พิมพ์ (window.rgToggleFont) เพราะ shared.js เช็คชื่อนี้ตรงๆ
  // เพื่อสร้างปุ่ม ✍️ ลงใน #font-toggle-slot ให้อัตโนมัติ (ดู js/core/shared.js "🍙 ปุ่มเปิด/ปิดคำแปล...") — ไม่ต้องสร้างปุ่มเอง
  window.rgToggleFont = function () {
    var on = document.body.classList.toggle('rg-modern-font');
    try { localStorage.setItem('rg_modern_font', on ? '1' : '0'); } catch (e) {}
  };
  (function () { try { if (localStorage.getItem('rg_modern_font') === '1') document.body.classList.add('rg-modern-font'); } catch (e) {} })();

  // ════════════════════════════════════════════
  // RENDER — เปลือกเกม (ใช้ class เดียวกับเกมเดิม)
  // ════════════════════════════════════════════
  var card, mxDynamic;
  var CUR_LEVEL = '初'; // 2026-07-25 รอบ6: เพิ่มปุ่มเลือกระดับตามที่ Lin สั่ง — ตอนนี้สร้างเฉพาะ 初級ใช้งานได้จริง 中/高 ยังเป็นแค่ปุ่มรอ

  // เมนู 🍚 (WordMenu) — 讀音/英文讀音/字體 เพิ่มเข้ามาแล้ว (2026-07-31) · 提示(หมวดฝึกไม่คิดคะแนน)/禮貌詞(เฉพาะประโยค高級)
  // ยังไม่มีกลไกตรงในเกมรวม (禮貌詞 ใช้ไม่ได้จริงเพราะเกมรวมมีแค่初級) — WordMenu ข้ามรายการที่หา id ไม่เจอในหน้าเอง ไม่พังอะไร
  function initWordMenu() {
    if (!window.WordMenu) return;
    window.WordMenu.init({
      rowId: 'word-ctl-row',
      items: [
        { id: 'rg-sound-toggle', label: '發音', state: 'none' },
        { id: 'rg-pron-toggle', label: '讀音', state: 'pron' },
        { id: 'rg-en-toggle', label: '英文讀音', state: 'en' },
        { id: 'zh-toggle-slot', label: '翻譯', state: 'zh' },
        { id: 'rg-vault-btn-slot', label: '單字庫', state: 'vault' },
        { id: 'font-toggle-slot', label: '字體', state: 'font' }
      ]
    });
  }

  // เรียกทุกครั้งที่ "คำ" เปลี่ยน (ไม่ใช่ทุกด่าน — ข้ามด่านในคำเดียวกันไม่ต้องเรียกซ้ำ) — ต่อ 🔊/🔖 เข้าคำปัจจุบัน
  // ก็อปแนวคิดจาก reading-game-app.js บรรทัด 695-706 ตรงๆ
  function syncWordControls(w) {
    renderRevLines(); // 讀音/英文讀音 อัปเดตทุกครั้งที่ render() เรียก (คนละพยางค์ในคำเดียวกันก็ต้องอัปเดตข้อความ)
    if (S.lastWordTh === w.th) return;
    S.lastWordTh = w.th;
    if (window.WordAudio) WordAudio.setCurrent(w.th);
    var vslot = document.getElementById('rg-vault-btn-slot');
    if (vslot && window.WordVault) {
      WordVault.injectStyles();
      vslot.innerHTML = '';
      vslot.appendChild(WordVault.createSaveBtn(w.th, { zh: w.zh, source: 'mix-game' }, {}));
    }
  }

  function mount() {
    card = document.getElementById('mx-card');
    mxDynamic = document.getElementById('mx-dynamic');
    initWordMenu();
    renderPronBtn(); renderEnBtn();
    mxRenderGameBar();
    startRound();
  }

  // เรียกจากปุ่ม .ltab ใน mix.html — 初級ใช้งานได้จริง ส่วน 中級/高級ยังไม่ได้สร้าง (ตามที่ Lin สั่งให้เริ่มจาก 初級ก่อน)
  // โชว์หน้า "ยังไม่เปิด" แทนการพยายามเล่น กันพังจากพูลว่าง (ตอนนี้ POOL กรองเฉพาะ level==='初' เท่านั้น)
  function setLevel(lv) {
    CUR_LEVEL = lv;
    ['初', '中', '高'].forEach(function (l) {
      var tab = document.getElementById('mx-ltab-' + l);
      if (tab) tab.classList.toggle('active', l === lv);
    });
    if (S._keyHandler) { document.removeEventListener('keydown', S._keyHandler); S._keyHandler = null; }
    var ctlRow = document.getElementById('word-ctl-row');
    if (lv === '初') { if (ctlRow) ctlRow.style.display = 'flex'; startRound(); return; }
    if (ctlRow) ctlRow.style.display = 'none'; // ยังไม่มีคำให้เล่น → ซ่อนแถวปุ่ม 🔊/🍙/🔖 ไปก่อน กันกดแล้วพัง
    S.lastWordTh = null;
    mxDynamic.innerHTML =
      '<div class="mx-soon">' +
        '<div class="emoji">🌾</div>' +
        '<div class="msg">' + (lv === '中' ? '中級' : '高級') + '還在準備中，敬請期待 🙏<br>先玩玩看初級吧！</div>' +
        '<div class="btn-row" style="margin-top:16px"><button class="btn btn-primary" onclick="MixGame.setLevel(\'初\')">回到初級</button></div>' +
      '</div>';
  }

  // 2026-07-25 รอบ7: Lin บอก "หน้าตาในเกมตอนเล่น" ไม่เหมือนเกมจริง — เทียบกับ reading-game.html บรรทัด 441-462 พบว่า
  // score-bar จริงโชว์ 第X/Y字 · ✓ok · ✗bad (ไม่มีเลขคะแนนรวม🏆โชว์สดระหว่างเล่นเลย คะแนนรวมโชว์แค่ตอนจบรอบ)
  // และ bars-wrap จริงมี 2 แถบ: 進度 + 本題分數 (แถบเขียวโชว์ว่าข้อนี้เหลือกี่แต้มสด ๆ ตามจำนวนที่ตอบผิดไปแล้ว) — ของเดิมมีแค่ 進度 แถบเดียว
  function curPowerPct(c) {
    if (!c) return 100;
    var wc = c.stage === 3 ? c.wrongCount : c.sylWrong[c.sylIdx];
    var pts = LADDER[wc] != null ? LADDER[wc] : 0;
    return Math.round((pts / LADDER[0]) * 100);
  }
  function goldBannerHtml() {
    var pct = S.total ? Math.round((S.done / S.total) * 100) : 0;
    var powerPct = curPowerPct(S.cur);
    return '<div class="gold-banner">' +
      '<div class="top-bar">' +
        '<div class="score-bar"><div>第 ' + (S.done + 1) + '/' + S.total + ' 題</div><div>✓ ' + S.okCount + '</div><div>✗ ' + S.badCount + '</div></div>' +
        '<div class="combo-badge' + (S.streak >= 3 ? ' show' : '') + '">🔥 連對 ' + S.streak + '</div>' +
      '</div>' +
      '<div class="bars-wrap">' +
        '<div class="bar-row"><span>進度</span><div class="bar-bg"><div class="bar-fill prog" style="width:' + pct + '%"></div></div><span class="bar-label">' + S.done + '/' + S.total + '</span></div>' +
        '<div class="bar-row"><span>本題分數</span><div class="bar-bg"><div class="bar-fill power" style="width:' + powerPct + '%"></div></div><span class="bar-label">' + Math.round(powerPct / 10) + '/10</span></div>' +
      '</div>' +
    '</div>';
  }

  function stageTagHtml(c) {
    var zh = ['聲調', '拼字', '打字'][c.stage - 1];
    var sylTag = (c.stage !== 3 && c.word.syls.length > 1) ? (' <span class="rule-tag">音節 ' + (c.sylIdx + 1) + '/' + c.word.syls.length + '</span>') : '';
    return '<div style="text-align:center;margin-bottom:2px">' +
      '<span class="rule-tag">第 ' + c.stage + ' 關 · ' + zh + '</span>' + sylTag +
      (c.golden ? ' <span class="rule-tag sp">🌾 黃金字</span>' : '') +
    '</div>';
  }

  // คำหลายพยางค์: โชว์ทั้งคำ ไฮไลต์พยางค์ที่กำลังถาม (ด่าน1/2 เท่านั้น) — พยางค์เดียวโชว์เฉยๆ ไม่ไฮไลต์ (เหมือนเดิม)
  function wordDisplayHtml(w, idx) {
    if (w.syls.length <= 1) return esc(w.th);
    return w.syls.map(function (s, i) {
      return '<span style="' + (i === idx ? 'color:#8B6310;border-bottom:3px solid #8B6310' : 'color:#c9b98a') + '">' + esc(s.th) + '</span>';
    }).join('');
  }

  function render() {
    var c = S.cur, w = c.word;
    var syl = w.syls[c.stage === 3 ? 0 : c.sylIdx];
    var html = goldBannerHtml() + stageTagHtml(c) +
      '<div class="word-area"><div class="word-th">' + (c.stage === 3 ? esc(w.th) : wordDisplayHtml(w, c.sylIdx)) + '</div>' +
      '<div class="rev-pron" id="rev-pron"></div><div class="rev-en" id="rev-en"></div>' +
      '<div class="word-zh">' + esc(w.zh) + '</div></div>' +
      '<div class="result-banner" id="mx-result"></div>';
    if (c.stage === 1) html += stage1Html();
    else if (c.stage === 2) html += stage2Html(syl);
    else html += stage3Html(w);
    mxDynamic.innerHTML = html;
    bannerEl = document.getElementById('mx-result');
    syncWordControls(w); // 2026-07-31: ต่อ 🔊/🔖 เข้าคำปัจจุบัน (แถวปุ่มเป็นของถาวร ไม่ได้ถูกลบสร้างใหม่ตรงนี้แล้ว)
    wireStage(c);
  }

  // ════════════════════════════════════════════
  // ด่าน 1 — 猜聲調（快問快答 → 答對直接過關 / 答錯開推導）
  // ════════════════════════════════════════════
  function stage1Html() {
    var opts = '';
    for (var i = 1; i <= 5; i++) opts += '<div class="opt" data-n="' + i + '" style="--delay:' + (i * 0.05) + 's">' + i + '</div>';
    return '<p style="text-align:center;font-size:13px;color:#a08050;margin:2px 0 8px">這個音節是第幾聲？</p>' +
      '<div class="opts-wrap"><div class="opts">' + opts + '</div></div>' +
      '<div id="mx-deriv"></div>';
  }

  function wireStage1(c) {
    var syl = c.word.syls[c.sylIdx];
    var correctNum = TONE_NAME_TO_NUM[syl.tone_name];
    mxDynamic.querySelectorAll('.opts .opt').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (btn.classList.contains('locked')) return;
        var n = +btn.dataset.n;
        mxDynamic.querySelectorAll('.opts .opt').forEach(function (b) { b.classList.add('locked'); });
        if (n === correctNum) { btn.classList.add('correct'); sylCorrect(c); }
        else { btn.classList.add('wrong'); logWrong(c.word.th); openDerivation(c); }
      });
    });
  }

  function fullSpell(syl) { return getFullSyllableSpelling(syl); }

  function openDerivation(c) {
    S.derivStep = { part: 'mark' };
    renderDeriv(c, fullSpell(c.word.syls[c.sylIdx]));
  }

  function renderDeriv(c, full) {
    var step = S.derivStep.part;
    var q = '', opts = [];
    if (step === 'mark') { q = '有聲調符號（่ ้ ๊ ๋）嗎？'; opts = [['yes', '有'], ['no', '沒有']]; }
    else if (step === 'class') { q = '子音「' + esc(TH_ENGINE.getInitChar(full)) + '」是哪一類？'; opts = [['mid', '中子音'], ['high', '高子音'], ['low', '低子音']]; }
    else if (step === 'live') { q = '這個音節是活音節還是死音節？'; opts = [['live', '活音節'], ['dead', '死音節']]; }
    else if (step === 'vlen') { q = '母音是短音還是長音？'; opts = [['short', '短音'], ['long', '長音']]; }

    // 2026-07-25 รอบ8: Lin บอก "ไม่เหมือน 100%" — เช็คพบว่าหน้า推導ของจริงไม่ได้ใช้ .bonus-section เลย
    // (อันนั้นเป็นคนละฟีเจอร์ใน reading-game.html) หน้า推導จริงอยู่ tone-finder-game.js ใช้ .tf-mina (มาสคอต
    // น้องมีนา 👧🏻ป๊อปพูด) + .tf-options/.tf-opt-wrap/.tf-opt แก้ให้ตรงของจริงทั้งหมด
    if (step === 'result') {
      var w2 = c.word.syls[c.sylIdx];
      var reason = buildToneReason({ th: full, tone_name: w2.tone_name, lead: w2.lead, cons: w2.cons });
      document.getElementById('mx-deriv').innerHTML =
        '<div class="tf-mina"><div class="tf-mina-face">👧🏻</div><div class="tf-mina-bubble">' +
          '結論：<b>' + TONE_NUM_ZH[TONE_NAME_TO_NUM[w2.tone_name]] + ' (' + w2.tone_name + ')</b>' +
          (reason ? '<br>' + esc(reason) : '') +
        '</div></div>' +
        '<div class="tf-options"><div class="tf-opt-wrap"><button class="tf-opt" id="mx-deriv-done">懂了 →</button></div></div>';
      document.getElementById('mx-deriv-done').addEventListener('click', function () { sylCorrect(c); });
      return;
    }
    var derivEl = document.getElementById('mx-deriv');
    // 2026-07-25 รอบ4: บั๊กจริงที่เจอตอนเทส — dataset.locked ถูกตั้งตอนตอบคำถามย่อยแรก แต่ innerHTML แทนที่แค่ลูก
    // ไม่ล้าง dataset ของ #mx-deriv เอง ทำให้คำถามย่อยถัดไปในสายเดียวกัน (mark→class→live→vlen) กดไม่ติดอีกเลย
    // ต้องล้าง lock ทุกครั้งที่ขึ้นคำถามย่อยใหม่
    derivEl.removeAttribute('data-locked');
    derivEl.innerHTML =
      '<div class="tf-mina"><div class="tf-mina-face">👧🏻</div><div class="tf-mina-bubble">' + q + '</div></div>' +
      '<div class="tf-options">' + opts.map(function (o) {
        return '<div class="tf-opt-wrap"><button class="tf-opt" data-v="' + o[0] + '">' + o[1] + '</button></div>';
      }).join('') + '</div>';
    derivEl.querySelectorAll('.tf-opt').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (document.getElementById('mx-deriv').dataset.locked) return;
        document.getElementById('mx-deriv').dataset.locked = '1';
        derivClick(c, full, btn.dataset.v, btn);
      });
    });
  }

  function derivClick(c, full, val, btnEl) {
    var step = S.derivStep.part;
    var right = false, next = 'result';
    if (step === 'mark') {
      right = (val === 'yes') === TH_ENGINE.hasToneMark(full);
      next = TH_ENGINE.hasToneMark(full) ? 'class' : 'live';
    } else if (step === 'class') {
      var cls = TH_ENGINE.getInitClass(full); var e = (cls === 'lead') ? 'high' : cls;
      right = (val === e); next = 'result';
    } else if (step === 'live') {
      var live = TH_ENGINE.isLiveWord(full);
      right = (val === 'live') === live;
      var cls2 = TH_ENGINE.getInitClass(full); var e2 = (cls2 === 'lead') ? 'high' : cls2;
      next = live ? 'result' : (e2 === 'low' ? 'vlen' : 'result');
    } else if (step === 'vlen') {
      var vt = TH_ENGINE.getVowelType(full);
      var isShort = (vt === 'short') || (vt == null);
      right = (val === (isShort ? 'short' : 'long')); next = 'result';
    }
    btnEl.classList.add(right ? 'correct' : 'wrong');
    if (!right) {
      c.sylWrong[c.sylIdx]++;
      if (c.sylWrong[c.sylIdx] >= FAIL_AT) { setTimeout(function () { sylForceFail(c); }, 350); return; }
    }
    S.derivStep = { part: next };
    setTimeout(function () { renderDeriv(c, full); }, 350);
  }

  // ════════════════════════════════════════════
  // ด่าน 2 — 拼字（子音／聲調符／母音／尾音）— ไล่ทีละพยางค์ถ้าคำมีหลายพยางค์
  // ════════════════════════════════════════════
  function comps(syl) {
    var out = [];
    var consDisp = syl.lead ? syl.lead + syl.cons : (syl.cluster ? syl.cons + syl.cluster : syl.cons);
    out.push({ type: 'cons', label: '子音', val: syl.cons, disp: consDisp });
    if (syl.tone) out.push({ type: 'tone', label: '聲調符', val: syl.tone, disp: syl.tone });
    out.push({ type: 'vowel', label: '母音', val: syl.vowel, disp: syl.vowel });
    if (syl.final) out.push({ type: 'final', label: '尾音', val: syl.final, disp: syl.final });
    return out;
  }

  function stage2Html(syl) {
    var parts = comps(syl);
    var slots = parts.map(function (p) {
      return '<div class="slot-col"><div class="slot-label">' + p.label + '</div><div class="slot-box" data-type="' + p.type + '">◌</div></div>';
    }).join('');
    var pool = [];
    parts.forEach(function (p) {
      var opts;
      if (p.type === 'cons') opts = distractors(CONS_GROUPS, p.val, 4).map(function (v) { return { type: 'cons', v: v, disp: CONS_SOUND[v] || v }; });
      else if (p.type === 'tone') opts = distractors([TONE_POOL], p.val, Math.min(4, TONE_POOL.length)).map(function (v) { return { type: 'tone', v: v, disp: v }; });
      else if (p.type === 'vowel') opts = [{ type: 'vowel', v: p.val, disp: p.val }];
      else opts = [{ type: 'final', v: p.val, disp: p.val }];
      pool = pool.concat(opts);
    });
    pool = shuffle(pool);
    var i = 0;
    var pills = pool.map(function (o) {
      i++;
      return '<div class="opt" data-type="' + o.type + '" data-v="' + esc(o.v) + '" style="--delay:' + (i * 0.04) + 's">' + esc(o.disp) + '</div>';
    }).join('');
    return '<div class="slot-row">' + slots + '</div>' +
      '<div class="opts-wrap"><div class="opts">' + pills + '</div></div>' +
      '<div class="btn-row"><button class="btn btn-primary" id="mx-s2-check" disabled>檢查</button></div>';
  }

  function wireStage2(c) {
    var syl = c.word.syls[c.sylIdx], parts = comps(syl);
    var need = parts.length, filled = {};
    var slotEls = {};
    mxDynamic.querySelectorAll('.slot-box').forEach(function (s) { slotEls[s.dataset.type] = s; });
    var checkBtn = document.getElementById('mx-s2-check');
    mxDynamic.querySelectorAll('.opts .opt[data-type]').forEach(function (tile) {
      tile.addEventListener('click', function () {
        if (tile.classList.contains('locked')) return;
        var type = tile.dataset.type;
        if (filled[type]) return;
        filled[type] = tile.dataset.v;
        slotEls[type].textContent = tile.dataset.v;
        slotEls[type].classList.add('filled');
        tile.classList.add('locked', 'sel');
        if (Object.keys(filled).length === need) checkBtn.disabled = false;
      });
    });
    checkBtn.addEventListener('click', function () {
      if (S.resolving) return;
      checkBtn.disabled = true;
      var ok = parts.every(function (p) { return filled[p.type] === p.val; });
      if (ok) {
        parts.forEach(function (p) { slotEls[p.type].classList.add('correct'); });
        sylCorrect(c);
      } else {
        parts.forEach(function (p) { slotEls[p.type].classList.add(filled[p.type] === p.val ? 'correct' : 'wrong'); });
        requeueWrong(c);
      }
    });
  }

  // ════════════════════════════════════════════
  // ด่าน 3 — 打字（Kedmanee 泰文鍵盤）— คำหลายพยางค์พิมพ์ต่อเนื่องรวด ไม่หยุดถามทีละพยางค์ (ตรงกับเกมพิมพ์จริง)
  // ════════════════════════════════════════════
  function stage3Html(w) {
    S.shiftOn = false;
    var rows = TK_ROWS.map(function (row) {
      return '<div class="tk-row">' + row.map(function (code) {
        return '<div class="tk-key" data-code="' + code + '">' +
          '<span class="tk-shift">' + esc(RG_SHIFT_MAP[code] || '') + '</span>' +
          '<span class="tk-base">' + esc(RG_BASE_MAP[code]) + '</span>' +
        '</div>';
      }).join('') + '</div>';
    }).join('');
    // 2026-07-25 รอบ5: บั๊กจริงที่ Lin เจอจากภาพจริง — เดิมเอา rows (ซึ่งเป็น 4 แถว .tk-row สมบูรณ์อยู่แล้ว) ไปห่อด้วย
    // .tk-row อีกชั้นนึงโดยไม่ตั้งใจ พอ .tk-row เป็น display:flex (แนวนอน) เลยลาก 4 แถวมาเรียงติดกันในบรรทัดเดียว
    // บีบจนดูเหมือนมีแถวเดียว — jsdom เทสก่อนหน้าจับไม่ได้เพราะ jsdom ไม่คำนวณ CSS layout จริง เห็นแค่ปุ่มกดได้/พิมพ์ถูกก็ผ่าน
    return '<div class="type-panel" style="display:flex">' +
      '<div class="type-target" id="mx-typetarget"></div>' +
      '<div class="tkbd">' +
        rows +
        '<div class="tk-row"><div class="tk-key tk-shift-key" id="mx-shift-key" style="flex:2;max-width:110px"><span class="tk-base" style="font-size:12px">⇧ Shift</span></div></div>' +
      '</div>' +
    '</div>';
  }

  // 2026-07-25 รอบ8: Lin ส่งภาพจริงมา — ตัวพิมพ์เพี้ยน ("ดื่ม" เพี้ยนเป็น "ดี"+ม) เพราะเดิมตัดทีละ "ตัวอักษร Unicode"
  // แล้วห่อ <span> แยกทุกตัว สระ/วรรณยุกต์ลอย (ื ่ ฯลฯ) เป็นเครื่องหมายที่ต้องเกาะกับตัวพยัญชนะ "ในก้อนข้อความเดียวกัน"
  // ถ้าห่อ span แยกกันคนละก้อน เบราว์เซอร์จัดวางเครื่องหมายเกาะผิดตำแหน่ง/ผิดตัวได้ — เทียบกับ typing-game-app.js
  // rgTypeRenderTarget() ของจริง (บรรทัด 1727) พบว่าเกมจริงห่อแค่ 2 ก้อน (พิมพ์ไปแล้ว/ยังไม่พิมพ์) ไม่ใช่ทีละตัวอักษร
  // แก้ตามนั้นเป๊ะ — ได้ผลพลอยได้คือไม่มีไฮไลต์ "ตัวถัดไป" อัตโนมัติแล้วด้วย (เกมจริงก็ไม่มีเช่นกัน ไม่ใช่แค่เอาตัวใบ้ออก)
  function paintType(c, target) {
    var done = target.slice(0, S.typePos), rest = target.slice(S.typePos);
    document.getElementById('mx-typetarget').innerHTML =
      '<span style="color:#2e7d32">' + esc(done) + '</span><span style="color:#c9b98a">' + esc(rest) + '</span>';
    updateShiftKeyVisual();
  }

  function updateShiftKeyVisual() {
    var sk = document.getElementById('mx-shift-key');
    if (sk) sk.classList.toggle('active', S.shiftOn);
  }

  function wireStage3(c) {
    // 2026-07-25 รอบ4: คำหลายพยางค์ = ต่อพยางค์ทุกตัวเป็น string เดียว พิมพ์รวด (เหมือน rgContStart ของเกมพิมพ์จริง)
    var target = c.word.syls.map(function (s) { return s.th; }).join('');
    paintType(c, target);
    var targetEl = document.getElementById('mx-typetarget');
    function tryChar(ch) {
      if (S.resolving) return;
      if (ch === target[S.typePos]) {
        S.typePos++;
        S.shiftOn = false;
        if (S.typePos >= target.length) { answerCorrect(c); return; }
        paintType(c, target);
      } else {
        S.shiftOn = false;
        updateShiftKeyVisual();
        targetEl.classList.add('shake');
        setTimeout(function () { targetEl.classList.remove('shake'); }, 350);
        requeueWrong(c);
      }
    }
    mxDynamic.querySelectorAll('.tk-key[data-code]').forEach(function (k) {
      k.addEventListener('click', function () {
        var code = k.dataset.code;
        var ch = S.shiftOn ? (RG_SHIFT_MAP[code] || RG_BASE_MAP[code]) : RG_BASE_MAP[code];
        tryChar(ch);
      });
    });
    var shiftKey = document.getElementById('mx-shift-key');
    if (shiftKey) shiftKey.addEventListener('click', function () { S.shiftOn = !S.shiftOn; updateShiftKeyVisual(); });
    // แป้นพิมพ์จริง (คอมพิวเตอร์) — ใช้ e.shiftKey ตรงๆ ได้เลย ไม่ต้องพึ่งปุ่ม Shift บนจอ
    S._keyHandler = function (e) {
      var ch = e.shiftKey ? (RG_SHIFT_MAP[e.code] || RG_BASE_MAP[e.code]) : RG_BASE_MAP[e.code];
      if (ch) { e.preventDefault(); tryChar(ch); }
    };
    document.addEventListener('keydown', S._keyHandler);
  }

  function wireStage(c) {
    if (S._keyHandler) { document.removeEventListener('keydown', S._keyHandler); S._keyHandler = null; }
    if (c.stage === 1) wireStage1(c);
    else if (c.stage === 2) wireStage2(c);
    else wireStage3(c);
  }

  // ════════════════════════════════════════════
  // จบรอบ — เซฟคะแนนขึ้น reading_sessions(game='mix') + บวก streak ของบัญชีกลาง — เพิ่ม 2026-07-31
  // ════════════════════════════════════════════
  function renderEnd() {
    if (S._keyHandler) { document.removeEventListener('keydown', S._keyHandler); S._keyHandler = null; }
    var ctlRow = document.getElementById('word-ctl-row');
    if (ctlRow) ctlRow.style.display = 'none'; // จบรอบแล้ว ไม่มีคำให้ฟังเสียง/เซฟ ซ่อนแถวปุ่มไปก่อน (render() รอบถัดไปจะโชว์กลับเอง)
    S.lastWordTh = null;
    if (window.GAME_ACCOUNT && window.GAME_ACCOUNT.bumpStreakToday) { try { GAME_ACCOUNT.bumpStreakToday(); } catch (e) {} }
    if (window.READING_AUTH && window.READING_AUTH.saveScore) { try { READING_AUTH.saveScore(S.score, 1, 'mix', wrongItemsForSave()); } catch (e) {} }
    mxRenderGameBar();
    var perfectAll = S.perfectCount === S.total;
    mxDynamic.innerHTML =
      '<div id="end" style="display:flex">' +
        '<h2>🎉 這輪結束了！</h2>' +
        '<div class="end-score-big">' + S.score + ' 分</div>' +
        '<div class="end-detail">' + S.perfectCount + '/' + S.total + ' 題全對零失誤' + (perfectAll ? ' · 完美！' : '') + '</div>' +
        '<button class="btn btn-primary" id="mx-again">🎲 再玩一次</button>' +
      '</div>';
    document.getElementById('mx-again').addEventListener('click', startRound);
  }

  window.MixGame = {
    mount: mount, setLevel: setLevel,
    setPronMode: setPronMode, pronMode: function () { return pronMode; },
    setEnMode: setEnMode, enMode: function () { return enMode; }
  };
})();
