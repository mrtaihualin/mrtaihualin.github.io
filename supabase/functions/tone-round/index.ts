// ════════════════════════════════════════════════════════════
// Supabase Edge Function: tone-round — BUNDLED single file (Phase 4)
// วางไฟล์นี้ไฟล์เดียวใน Supabase ได้เลย (รวมเครื่องยนต์ทั้งหมดไว้ในนี้แล้ว)
// engines = ก๊อปจาก .mjs จริง (byte-for-byte) ผ่านสคริปต์ build — ไม่พิมพ์ใหม่
// ════════════════════════════════════════════════════════════
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/* ===== toneEngine ===== */
// ════════════════════════════════════════════════════════════
// toneEngine.mjs — Server-authoritative port of computeTone()
// ════════════════════════════════════════════════════════════
// SOURCE OF TRUTH: /Users/taihualin/Developer/mrtaihualin.github.io/tone-finder.html
//   - TH module:        lines 2786–2905
//   - TONE_OVERRIDE:    lines 4495–4502
//   - computeTone():    lines 4504–4534
//
// This file is a byte-for-byte-logic port (var kept as var, same variable
// names, same order of checks) — NOT a rewrite. Any future change to the
// client's tone rules must be mirrored here manually, then re-verified
// with the parity tester before shipping.
//
// Plain ESM, no Deno-specific APIs used here on purpose, so the exact
// same file can be:
//   (a) imported by the Supabase Edge Function (index.ts) at runtime, and
//   (b) imported by a local Node test server / batch-test script
// — guaranteeing the thing we test is the thing that ships.
// ════════════════════════════════════════════════════════════

var TH = (function() {
  var LOW_SET  = new Set('คฅฆงชซฌญฑฒณทธนพฟภมยรลวฬฮ'.split(''));
  var HIGH_SET = new Set('ขฃฉฐถผฝศษสห'.split(''));
  var MID_SET  = new Set('กจดตบปอฎฏ'.split(''));
  var SHORT_TAIL = new Set('กขคฆบปพฟภจชซฎฏฐฑฒดตถทธศษส'.split(''));
  var LONG_TAIL  = new Set('นณญรลฬมยวง'.split(''));
  var CONS_SET   = new Set('กขฃคฅฆงจฉชซฌญฎฏฐฑฒณดตถทธนบปผฝพฟภมยรลวศษสหฬอฮ'.split(''));
  var LEAD_PATS  = ['หน','หม','หล','หว','หย','หร','หญ','หง','อย'];
  // Short vowel characters
  var SHORT_V = new Set(['ะ','ั','ิ','ึ','ุ','็']); // ะ ั ิ ึ ุ + ็ (ไม้ไต่คู้ = ย่อเสียงสระให้สั้น)
  // Long vowel characters
  var LONG_V  = new Set(['า','ี','ื','ู','เ','แ','โ']); // า ี ื ู เ แ โ
  // Tone mark characters
  var TONE_CHARS = new Set(['่','้','๊','๋']); // ่ ้ ๊ ๋
  // สระพิเศษที่ลงท้ายด้วยเสียงก้อง (semivowel/นาสิก) = "คำเป็น" เสมอ: ไ(-ai) ใ(-ai) ำ(-am)
  var LIVE_V = new Set(['ไ','ใ','ำ']);
  // Lin 2026-07-04: รองรับอักษรควบกล้ำ (ปร กร คร ฯลฯ) + สระออ (อ ทำหน้าที่สระยาว)
  var CLUSTER2 = new Set('รลว'.split(''));            // ตัวที่สองของควบกล้ำ
  var CLUSTER_INIT = new Set('กขคฆปผพภตบดฟ'.split('')); // ตัวนำที่ควบได้
  function _initChar(word){
    for (var i=0;i<LEAD_PATS.length;i++){ if (word.indexOf(LEAD_PATS[i])===0) return LEAD_PATS[i]; }
    for (var j=0;j<word.length;j++){ if (CONS_SET.has(word[j])) return word[j]; }
    return null;
  }
  // สระออ: มี อ ที่ไม่ใช่พยัญชนะต้น และมีพยัญชนะนำหน้ามัน (เช่น ทอด คฺรอบ = เสียงยาว)
  function _hasSaraOr(word){
    var ic=_initChar(word), firstOr=word.indexOf('อ');
    for (var i=0;i<word.length;i++){
      if (word[i]==='อ' && i>0){
        var hasConsBefore=false;
        for (var k=0;k<i;k++){ if (CONS_SET.has(word[k])){ hasConsBefore=true; break; } }
        if (hasConsBefore && !(ic==='อ' && firstOr===i)) return true;
      }
    }
    return false;
  }
  // รายชื่อพยัญชนะสำหรับหา "ตัวสะกด" — ตัดตัวที่สองของควบกล้ำออก (ปร กร คร) ถ้าตามด้วยสระ/พยางค์
  function _codaCons(word){
    var cons=[]; for (var i=0;i<word.length;i++){ if (CONS_SET.has(word[i])) cons.push(word[i]); }
    if (cons.length>=2 && CLUSTER_INIT.has(cons[0]) && CLUSTER2.has(cons[1])){
      var idx0=word.indexOf(cons[0]);
      var idx2=word.indexOf(cons[1], idx0+1);
      var after=word.slice(idx2+1), clusterOK=false;
      for (var a=0;a<after.length;a++){
        var ch=after[a];
        if (SHORT_V.has(ch)||LONG_V.has(ch)||ch==='อ'||CONS_SET.has(ch)||LIVE_V.has(ch)){ clusterOK=true; break; }
      }
      if (clusterOK) cons=[cons[0]].concat(cons.slice(2));
    }
    return cons;
  }

  return {
    hasToneMark: function(word) {
      for (var i=0; i<word.length; i++) if (TONE_CHARS.has(word[i])) return true;
      return false;
    },
    getToneMark: function(word) {
      for (var i=0; i<word.length; i++) if (TONE_CHARS.has(word[i])) return word[i];
      return null;
    },
    getInitClass: function(word) {
      for (var i=0; i<LEAD_PATS.length; i++) {
        if (word.indexOf(LEAD_PATS[i]) === 0) return 'lead';
      }
      for (var j=0; j<word.length; j++) {
        var c = word[j];
        if (LOW_SET.has(c))  return 'low';
        if (HIGH_SET.has(c)) return 'high';
        if (MID_SET.has(c))  return 'mid';
      }
      return null;
    },
    getInitChar: function(word) {
      for (var i=0; i<LEAD_PATS.length; i++) {
        if (word.indexOf(LEAD_PATS[i]) === 0) return LEAD_PATS[i];
      }
      for (var j=0; j<word.length; j++) {
        if (CONS_SET.has(word[j])) return word[j];
      }
      return null;
    },
    isLiveWord: function(word) {
      var cons = _codaCons(word);
      if (cons.length >= 2) {
        var last = cons[cons.length-1];
        // อ ตัวสุดท้าย = สระออ (เสียงยาว เปิด) ไม่ใช่ตัวสะกด → คำเป็น
        if (last === 'อ' && word[word.length-1] === 'อ' && this.getInitChar(word) !== 'อ') return true;
        if (SHORT_TAIL.has(last)) return false;
        if (LONG_TAIL.has(last))  return true;
      }
      for (var n=0; n<word.length; n++) if (LIVE_V.has(word[n])) return true; // ไ ใ ำ = คำเป็น
      for (var j=0; j<word.length; j++) if (SHORT_V.has(word[j])) return false;
      for (var k=0; k<word.length; k++) if (LONG_V.has(word[k]))  return true;
      if (_hasSaraOr(word)) return true; // สระออ ไม่มีตัวสะกด = คำเป็น
      return null;
    },
    classLabel: function(cls) {
      return {low:'低子音',high:'高子音',mid:'中子音',lead:'前引字'}[cls] || cls;
    },
    getVowelType: function(word) {
      for (var i=0; i<word.length; i++) if (SHORT_V.has(word[i])) return 'short';
      for (var j=0; j<word.length; j++) if (LONG_V.has(word[j]))  return 'long';
      if (_hasSaraOr(word)) return 'long'; // สระออ = สระยาว
      return null;
    },
    hasTailCons: function(word) {
      return _codaCons(word).length >= 2;
    },
    getEndConsType: function(word) {
      var cons = _codaCons(word);
      if (cons.length >= 2) {
        var last = cons[cons.length-1];
        if (SHORT_TAIL.has(last)) return 'short';
        if (LONG_TAIL.has(last))  return 'long';
      }
      return null;
    }
  };
})();

// TONE OVERRIDES — คำทับศัพท์ที่ไม่ตามกฎมาตรฐาน ระบุเสียงตรงๆ
var TONE_OVERRIDE = {
  'เอาท์': 4,  // เช็คเอาท์ → พยางค์ 2 เสียงตรี
  'คีย์':  1,  // คีย์การ์ด → พยางค์ 1 เสียงสามัญ
  'การ์ด': 4,  // คีย์การ์ด → พยางค์ 2 เสียงตรี
  'ออฟ':  4,  // ออฟฟิศ   → พยางค์ 1 เสียงตรี
  'ออบ':  4,  // ออฟฟิศ (คำอ่าน ออบ) → พยางค์ 1 เสียงตรี (Lin 2026-07-04)
  'ญาติ': 3   // สะกดพิเศษ (ิ ไม่ออกเสียง) → ยา-ตา เสียงโท
};

function computeTone(word) {
  if (TONE_OVERRIDE[word] !== undefined) return TONE_OVERRIDE[word];
  var cls  = TH.getInitClass(word);
  var mark = TH.getToneMark(word);
  var live = TH.isLiveWord(word);
  var vowel = TH.getVowelType(word);
  if (!cls) return null;
  var e = (cls === 'lead') ? 'high' : cls;
  if (mark) {
    if (e === 'low') {
      if (mark === '่') return 3;
      if (mark === '้') return 4;
    } else if (e === 'mid') {
      if (mark === '่') return 2;
      if (mark === '้') return 3;
      if (mark === '๊') return 4;
      if (mark === '๋') return 5;
    } else {
      if (mark === '่') return 2;
      if (mark === '้') return 3;
    }
  } else {
    if (live) return (e === 'high') ? 5 : 1;
    if (e === 'high' || e === 'mid') return 2;
    // คำตาย+อักษรต่ำ: สระสั้น→ตรี(4) / สระยาว→โท(3)
    // ไม่มีรูปสระ = สระแฝงสั้น (โอะ/อะ เช่น รถ นก) → นับเป็นสระสั้น
    var isShort = (vowel === 'short') || (vowel == null);
    return isShort ? 4 : 3;
  }
  return null;
}
/* ===== srsEngine ===== */
// ════════════════════════════════════════════════════════════
// srsEngine.mjs — Server-authoritative port of the SRS state machine
// ════════════════════════════════════════════════════════════
// SOURCE OF TRUTH: /Users/taihualin/Developer/mrtaihualin.github.io/tone-finder.html
//   TF_SRS_CFG + TF_SRS: lines 3077-3156 — sliced verbatim, zero retyping.
// Already pure logic in the original (no DOM/localStorage inside TF_SRS itself —
// tfLoadSrs/tfSaveSrs wrap it with localStorage in the client; the Edge Function
// will wrap it with a Supabase row read/write instead — same pure core either way).
// ════════════════════════════════════════════════════════════

var TF_SRS_CFG = {
  INTERVALS: [1, 7, 16],   // วัน: รอบ1=+1วัน · รอบ2=+7วัน · รอบ3(day16)=make-sure check → mastered
  CLEAN_ROUNDS_TO_MASTER: 3
};

var TF_SRS = {
  cfg: TF_SRS_CFG,
  // สร้าง key เฉพาะคำ/ประโยค + ระดับ (คำเดียวกันคนละระดับ = คนละรายการ)
  keyFor: function (word, level) { return (level || 0) + '|' + word; },

  // ── Lin 2026-07-04: วันที่แบบไต้หวัน (Asia/Taipei) สำหรับตัด "ครบวันหรือยัง" ของ SRS ให้สม่ำเสมอ ──
  //   twDate(ms) → 'YYYY-MM-DD' เวลาไต้หวัน · twDatePlusDays(ms, n) → วันที่ไต้หวันของ ms บวก n วัน
  //   ใช้วันที่ (ไม่ใช่ ms ดิบ) ตัดกำหนดทบทวน → คนเล่นคนละ timezone เห็น "ขึ้นวันใหม่" ตรงกันเสมอ
  twDate: function (ms) {
    var d = (ms == null) ? new Date() : new Date(ms);
    try { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(d); }
    catch (e) { return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  },
  twDatePlusDays: function (ms, days) {
    return this.twDate((ms == null ? Date.now() : ms) + (days || 0) * 86400000);
  },

  // สร้าง record เริ่มต้นของคำใหม่ที่ยังไม่เคยเข้า SRS
  blank: function () {
    return {
      stage: 0,            // ผ่านรอบสะอาดติดกันกี่รอบแล้ว (0,1,2 → ครบ 3 = mastered)
      dueDate: '',         // Lin 2026-07-04: วันครบกำหนดทบทวน 'YYYY-MM-DD' เวลาไต้หวัน ('' = พร้อมเล่นได้ทันที)
      dueAt: 0,             // (เดิม/สำรอง) timestamp ms — เก็บไว้เผื่อ record เก่าที่ยังไม่มี dueDate
      everFailed: false,    // เคยผิด/แอบดูระหว่างเส้นทางนี้ไหม (คุมว่าจะได้ "จำเอง"=3 หรือ "กู้กลับมาได้"=1)
      mastered: false,      // ตัดออกจาก SRS แล้ว (ถาวร ไม่โผล่ซ้ำ)
      firstPassSoftAwarded: false  // เคยได้ "แต้มเกม" รอบแรกของ loop นี้แล้วหรือยัง (กันฟาร์มคะแนนซ้ำ)
    };
  },

  // วันนี้ (เวลาไต้หวัน) ถึงกำหนดทบทวนคำนี้หรือยัง (true = ยังไม่เคยเล่น หรือครบกำหนดแล้ว)
  // Lin 2026-07-04: ตัดด้วย "วันที่ไต้หวัน" — dueDate (string) ก่อน · ถ้าเป็น record เก่าที่มีแต่ dueAt (ms) ก็ยังรองรับ
  isDue: function (rec, nowMs) {
    if (!rec || rec.mastered) return false;
    var today = this.twDate(nowMs || Date.now());
    if (rec.dueDate) return rec.dueDate <= today;          // ครบกำหนดเมื่อวันไต้หวันวันนี้ >= วันครบกำหนด
    if (rec.dueAt) return this.twDate(rec.dueAt) <= today; // fallback record เก่า (มีแต่ ms)
    return true;                                           // ยังไม่เคยตั้งกำหนด = พร้อมเล่นทันที
  },

  // นี่คือรอบ "day 16" (การเช็คครั้งสุดท้ายก่อน mastered) ไหม — stage 2 คือรอบที่ 3 (0-based)
  isFinalCheck: function (rec) {
    return !!rec && rec.stage === (this.cfg.CLEAN_ROUNDS_TO_MASTER - 1);
  },

  // ตอบถูก "สะอาด" (ไม่แอบดู ไม่ผิดในรอบนี้) → เลื่อนขั้นถัดไป หรือ mastered ถ้าครบ 3 รอบ
  // คืน { rec, justMastered, clean } — clean = mastered แบบไม่เคย fail/peek เลยตลอดเส้นทาง (จำเอง)
  // หมายเหตุ index: รอบที่เพิ่งผ่าน (stage ก่อนบวก) กำหนดว่ารออีกกี่วันถึงรอบถัดไป
  //   stage 0 ผ่าน (รอบ1) → รออีก INTERVALS[0]=1 วัน ก่อนรอบ2 · stage 1 ผ่าน (รอบ2) → รออีก INTERVALS[1]=7 วัน ก่อนรอบ3(day16)
  //   stage 2 ผ่าน (รอบ3/day16 final check) → mastered ทันที ไม่ต้องรอ
  advanceOnClean: function (rec, nowMs) {
    rec = rec || this.blank();
    nowMs = nowMs || Date.now();
    var justPassedStage = rec.stage;   // stage ก่อนบวก = รอบที่เพิ่งผ่านสำเร็จ
    rec.stage += 1;
    if (rec.stage >= this.cfg.CLEAN_ROUNDS_TO_MASTER) {
      rec.mastered = true;
      return { rec: rec, justMastered: true, clean: !rec.everFailed };
    }
    var days = this.cfg.INTERVALS[justPassedStage] || this.cfg.INTERVALS[this.cfg.INTERVALS.length - 1];
    // Lin 2026-07-04: กำหนดวันครบเป็น "วันที่ไต้หวัน" (dueDate) + คง dueAt (ms) ไว้สำรอง
    rec.dueDate = this.twDatePlusDays(nowMs, days);
    rec.dueAt = nowMs + days * 86400000;
    return { rec: rec, justMastered: false, clean: !rec.everFailed };
  },

  // ตอบผิด (หรือแอบดู/day16 พลาด) → รีเซ็ตกลับ stage 0 (day 1) เข้าคิว SRS ใหม่ + จำว่าเคยพลาด (กู้กลับมาได้ ไม่ใช่จำเอง)
  resetOnFail: function (rec) {
    rec = rec || this.blank();
    rec.stage = 0;
    rec.dueDate = '';   // Lin 2026-07-04: พร้อมทบทวนใหม่ได้ทันที (เข้าคิว)
    rec.dueAt = 0;
    rec.everFailed = true;
    return rec;
  }
};
/* ===== scoreEngine ===== */
// ════════════════════════════════════════════════════════════
// scoreEngine.mjs — Server-authoritative port of the scoring engines
// ════════════════════════════════════════════════════════════
// SOURCE OF TRUTH: /Users/taihualin/Developer/mrtaihualin.github.io/tone-finder.html
//   TF_SCORE_CFG + TF_SCORE: lines 2927-3002 — sliced verbatim.
//   TF_WORDSCORE:            lines 3012-3031 — sliced verbatim.
// Both already pure in the original (operate on plain objects passed in,
// no DOM/localStorage) — that's why Lin's comments call them
// '本 pure logic ทดสอบได้จริง'. Ported unchanged.
// ════════════════════════════════════════════════════════════

var TF_SCORE_CFG = {
  SCORE_FIRST_TRY: 10,       // ถูกตั้งแต่ครั้งแรก = 10 (= WRONG_LADDER[0])
  // ── Lin 2026-07-04: คะแนนต่อคำ/พยางค์ "นับตามจำนวนครั้งที่กดผิด" เหมือนเกมอ่าน ──
  //   ทุกคนเริ่ม 10 เท่ากัน · ผิด 1=7 · 2=4 · 3=1 · 4=0(fail เฉลย+SRS รีเซ็ต day1)
  //   "กดผิด" = เดาวรรณยุกต์ผิดตอนแรก + กดผิดในทุกขั้น推導 + กดปุ่มแอบดู(?) · กด "🤷 ไม่มั่นใจ" ไม่นับผิด
  WRONG_LADDER: [10, 7, 4, 1, 0],
  SRS_REVIEW_BONUS: [3, 2, 1],  // Lin 2026-07-04: โบนัสตอนผ่านรอบทบทวน SRS สะอาด — รอบ1(day1)+3 · รอบ2(day7)+2 · รอบ3(day16)+1
  SCORE_DEDUCE_BASE: 5,      // (เลิกใช้แล้ว — เก็บไว้กันโค้ดเก่าอ้างถึง)
  SCORE_MIN_PER_WORD: 1,     // (เลิกใช้แล้ว)
  SCORE_FAIL_ZERO: 0,        // ผิดครบเพดาน (fail) = 0 pt เสมอ
  DEDUCE_WRONG_LIMIT: 4,     // Lin 2026-07-04: กดผิดครบ 4 ครั้งในคำเดียว → 0 แต้ม (fail) + เฉลย + คำใหม่ (เดิม 3)
  COMBO_TIERS: { 3: 1.5, 5: 2, 8: 3 },   // สตรีคตอบถูกครั้งแรกติดกัน → ตัวคูณ
  SET_COMPLETE_BONUS: 20,    // เล่นจบ 1 ชุด (เดิม 200)
  SET_PERFECT_BONUS: 50,     // จบชุดแบบ perfect (เดิม 500) → perfect = 20+50 = 70
  LEVEL_WEIGHT: { 1: 1, 2: 1.5, 3: 2 },   // กฎ MASTER 2026-07-05: ตัวคูณระดับชุดเดียวทั้งระบบ (初1/中1.5/高2) = ตรงเกมอ่าน + ตรงตัวคูณดาวเงิน → ลีกยุติธรรมข้ามเกม
  // จำนวนตัวเลือกในแต่ละขั้น推導 → ใช้คำนวณการหัก = round(BASE / optionsInStep)
  OPTIONS_IN_STEP: {
    s1: 2, s2a: 2, s2a_low: 2, s2a_other: 3, s2a_mid: 4, s2a_hi: 2,
    s2b: 2, s2b_live: 2, s2b_dead: 2, s2b_dl: 2
  },
  // ขั้นเครื่องมือช่วย (ไม่มีในตารางสเปค) → ใช้ค่า default
  DEFAULT_OPTIONS: 2
};

var TF_SCORE = {
  cfg: TF_SCORE_CFG,

  // หักต่อการกดผิด 1 ครั้งในขั้นนั้น = round(BASE / จำนวนตัวเลือก)
  deductPerWrong: function (step) {
    var opts = this.cfg.OPTIONS_IN_STEP[step] || this.cfg.DEFAULT_OPTIONS;
    return Math.round(this.cfg.SCORE_DEDUCE_BASE / opts);
  },

  // ตัวคูณคอมโบจากสตรีคตอบถูกครั้งแรกติดกัน (เลือก tier สูงสุดที่ถึง)
  comboMultiplier: function (streak) {
    var tiers = this.cfg.COMBO_TIERS, mult = 1;
    Object.keys(tiers).map(Number).sort(function (a, b) { return a - b; }).forEach(function (k) {
      if (streak >= k) mult = tiers[k];
    });
    return mult;
  },

  // คะแนนเมื่อตอบถูกครั้งแรก (รับ streak "หลังบวกแล้ว")
  firstTryScore: function (streak) {
    return Math.round(this.cfg.SCORE_FIRST_TRY * this.comboMultiplier(streak));
  },

  // Lin 2026-07-04: คะแนนต่อคำ/พยางค์ ตาม "จำนวนครั้งที่กดผิด" → บันได [10,7,4,1,0]
  ladderScore: function (wrongCount) {
    var L = this.cfg.WRONG_LADDER;
    return L[Math.min(wrongCount || 0, L.length - 1)];
  },
  // (เลิกใช้แล้ว — แทนที่ด้วย ladderScore · เก็บไว้กันโค้ดเก่าอ้างถึง)
  deduceScore: function (totalDeduction) {
    return Math.max(this.cfg.SCORE_MIN_PER_WORD, this.cfg.SCORE_DEDUCE_BASE - totalDeduction);
  },

  // กดผิดถึงเพดานหรือยัง (ครบ 3 → 0 แต้ม)
  reachedWrongLimit: function (mistakes) {
    return mistakes >= this.cfg.DEDUCE_WRONG_LIMIT;
  },

  // โบนัสจบชุด: จบ = +COMPLETE, ถ้า perfect (ถูกครั้งแรกทุกคำ) เพิ่ม +PERFECT
  sessionBonus: function (total, perfectCount) {
    var bonus = 0;
    if (total > 0) bonus += this.cfg.SET_COMPLETE_BONUS;
    if (total > 0 && perfectCount === total) bonus += this.cfg.SET_PERFECT_BONUS;
    return bonus;
  },

  // คะแนนถ่วงน้ำหนักตามระดับ (ส่งเข้ากระดานอันดับ) — ในเกมยังโชว์คะแนนดิบ
  weightedScore: function (rawScore, level) {
    var w = this.cfg.LEVEL_WEIGHT[level] || 1;
    return Math.round(rawScore * w);
  }
};

var TF_WORDSCORE = {
  LADDER: [10, 7, 4, 1, 0],
  FAIL_AT: 4,
  score: function (s) { return this.LADDER[Math.min((s && s.currentWordDeduct) || 0, this.FAIL_AT)]; },
  isDead: function (s) { return ((s && s.currentWordDeduct) || 0) >= this.FAIL_AT; },
  // กดผิดในขั้น推導 → หัก 1 ขั้น + เปิดสิทธิ์แอบดูฟรีของขั้นนี้ (การนับ "กดผิดจริง" อยู่ที่ recordMistake แยกกัน)
  onWrong: function (s) {
    s.currentWordDeduct = (s.currentWordDeduct || 0) + 1;
    s.stepWrong = true;
    return s;
  },
  // แอบดู(?) → ฟรีถ้าเพิ่งผิดในขั้นนี้ + ยังไม่เคยใช้สิทธิ์ฟรี · ไม่งั้นหัก 1 · คืน true = ถูกหัก
  onPeek: function (s) {
    if (s.stepWrong && !s.stepFreePeekUsed) { s.stepFreePeekUsed = true; return false; }
    s.currentWordDeduct = (s.currentWordDeduct || 0) + 1;
    return true;
  },
  // ไปขั้น推導ถัดไป → รีเซ็ตสิทธิ์รายขั้น
  onNextStep: function (s) { s.stepWrong = false; s.stepFreePeekUsed = false; return s; }
};
/* ===== starsEngine ===== */
// ════════════════════════════════════════════════════════════
// starsEngine.mjs — Server-authoritative port of the "hard star" + streak math
// ════════════════════════════════════════════════════════════
// SOURCE OF TRUTH: /Users/taihualin/Developer/mrtaihualin.github.io/game-account.js
//   dstr():                          lines 12-16   — verbatim
//   HARD_CAPS / LEVEL_TOTAL_WORDS /
//     effectiveCap() / LEVEL_MULT /
//     BASE_CLEAN / BASE_RECOVERED:   lines 28-54    — verbatim
//   wordsCounted() / bumpWordsCounted(): lines 56-65 — verbatim (already pure,
//     take the account object `a` as a parameter — no change needed)
//
// ⚠️ ADAPTED (not verbatim) — flagging this honestly rather than hiding it:
//   addHardStars() (game-account.js lines 71-83) and bumpStreakToday()
//   (lines 105-111) call load()/save() on localStorage INSIDE the function.
//   An Edge Function has no localStorage — it will read/write a Supabase row
//   instead. So here those two are refactored into pure functions that take
//   the current account object in and return { account, ...result } out,
//   with the load/save extracted to whatever calls them (Edge Function reads
//   the row, calls the pure fn, writes the row back). The CAP CHECK MATH,
//   THE BASE×MULT ROUNDING, AND THE DAY-DIFF STREAK LOGIC ARE UNCHANGED —
//   only the I/O boundary moved. Nothing here has been redesigned or "improved."
// ════════════════════════════════════════════════════════════

// ── dstr(): Taiwan-time 'YYYY-MM-DD' — verbatim from game-account.js lines 12-16 ──
function dstr(ts) {
  var d = (ts == null) ? new Date() : new Date(ts);
  try { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(d); }
  catch (e) { return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
}

// ── constants — verbatim from game-account.js lines 32, 41, 53-54 ──
var HARD_CAPS = { 1: 200, 2: 300, 3: 200 };
var LEVEL_TOTAL_WORDS = { 1: 330, 2: 246, 3: 10 };
var LEVEL_MULT = { 1: 1, 2: 1.5, 3: 2 };
var BASE_CLEAN = 3, BASE_RECOVERED = 1;

// ── effectiveCap() — verbatim from game-account.js lines 46-52 ──
function effectiveCap(level) {
  var hardCap = HARD_CAPS[level] || 0;
  var wc = LEVEL_TOTAL_WORDS[level] || 0;
  if (!(wc > 0)) return hardCap;
  var tenPct = Math.floor(0.10 * wc);
  return Math.min(tenPct, hardCap);
}

// ── wordsCounted() / bumpWordsCounted() — verbatim from game-account.js lines 57-65 ──
// (already pure: take the account object `a` as a parameter, no I/O inside)
function wordsCounted(a, level) {
  var wc = a.hardWordsByLevel || {};
  return wc[level] || 0;
}
function bumpWordsCounted(a, level) {
  a.hardWordsByLevel = a.hardWordsByLevel || {};
  a.hardWordsByLevel[level] = (a.hardWordsByLevel[level] || 0) + 1;
  return a.hardWordsByLevel[level];
}

// ── addHardStars() — ADAPTED from game-account.js lines 71-83 ──
// Original signature: addHardStars(clean, level, levelWordCount) — read/wrote localStorage
// internally via load()/save(). Here: pass in the CURRENT account row explicitly, get back
// the NEXT account row explicitly. Cap check + base×mult rounding math is byte-identical.
function addHardStars(account, clean, level) {
  var a = { hardWordsByLevel: Object.assign({}, account.hardWordsByLevel), stars: account.stars || 0 };
  var cap = effectiveCap(level);
  var used = wordsCounted(a, level);
  if (used >= cap) return { account: a, stars: 0, capped: true };
  bumpWordsCounted(a, level);
  var base = clean ? BASE_CLEAN : BASE_RECOVERED;
  var mult = LEVEL_MULT[level] || 1;
  var n = Math.round(base * mult);
  a.stars = (a.stars || 0) + n;
  return { account: a, stars: n, capped: false };
}

// ── hardCapReached() — ADAPTED from game-account.js lines 85-88 (same reasoning as above) ──
function hardCapReached(account, level) {
  return wordsCounted(account, level) >= effectiveCap(level);
}

// ── bumpStreakToday() — ADAPTED from game-account.js lines 105-111 ──
// Original read/wrote localStorage (a.lastPlay / a.streak) via load()/save().
// Here: pass in { lastPlay, streak } explicitly, get the next state back explicitly.
// The "played today already? / played yesterday (continue) : (reset to 1)" logic
// is byte-identical to the original.
function bumpStreakToday(account, nowMs) {
  var lastPlay = account.lastPlay || null;
  var streak = account.streak || 0;
  var t = dstr(nowMs);
  if (lastPlay === t) return { lastPlay: lastPlay, streak: streak }; // เล่นแล้ววันนี้ ไม่บวกซ้ำ
  var y = dstr((nowMs == null ? Date.now() : nowMs) - 86400000);
  var nextStreak = (lastPlay === y) ? (streak + 1) : 1;
  return { lastPlay: t, streak: nextStreak };
}
/* ===== serverAuthority ===== */
// ════════════════════════════════════════════════════════════
// serverAuthority.mjs — Phase 4 core "money decision" (server-authoritative)
// ════════════════════════════════════════════════════════════
// นี่คือ "สมอง" ฝั่งเซิร์ฟเวอร์ที่ตัดสินว่า "รอบนี้ให้ดาว/เลื่อน SRS/รีเซ็ต" ยังไง
// โดย **ไม่เชื่อ** ตัวเลขใดๆ จาก client เลย นอกจาก "คำเดาวรรณยุกต์ (1-5)" ที่ผู้เล่นกด
//
// ทำไมแค่ "คำเดา" ก็พอ (ผลจากไล่โค้ด tone-finder.html จริง):
//   ดาวเงิน (= เงินจริง) ถูกแจก "เฉพาะตอน SRS mastered" (tfProcessSrsOnWordCommit)
//   และ SRS จะ "เลื่อนขั้น" ได้เฉพาะเมื่อ cleanThisRound = ตอบถูก "ครั้งแรก" สะอาด
//   (firstTry && !forced && mistakes===0) — พอเข้า推導/แอบดู/เดาผิด = ไม่ clean = รีเซ็ต
//   → เส้นทางเดียวที่ทำให้ได้ดาว = "เดาวรรณยุกต์ถูกตั้งแต่ครั้งแรก" ตามนัด SRS
//   → เซิร์ฟเวอร์แค่: รู้ computeTone(คำ) เอง + เทียบกับที่ผู้เล่นเดา + คุมปฏิทิน SRS + คุมเพดาน
//   ⇒ ไม่ต้อง replay ทั้ง推導 (推導มีผลแค่คะแนนโชว์ 分 ไม่ใช่ดาว) · คำทอง ×2 ก็ไม่แตะดาว
//
// ⚠️ เพดานความปลอดภัยที่ทำได้จริง (พูดตรงๆ ตามกฎ Lin ข้อ 9):
//   computeTone อยู่ฝั่ง client เปิด DevTools อ่านได้ → คนที่ "รู้คำตอบ" ส่งเดาถูกได้เสมอ
//   เซิร์ฟเวอร์กันไม่ได้ที่ "รู้คำตอบ" แต่กันได้ว่า:
//     (1) เขียนดาวตรงไม่ได้ (RLS ล็อก — ดู SQL)
//     (2) เร่ง SRS เร็วกว่าปฏิทินไม่ได้ (isDue gate)
//     (3) เกินเพดานตลอดชีพต่อระดับไม่ได้ (cap)
//   ⇒ "ดาวสูงสุดที่โกงได้ = ดาวสูงสุดที่คนเล่นเพอร์เฟกต์จริงได้ ไม่มากกว่า ไม่เร็วกว่า ไม่เกินเพดาน"
//   ส่วนที่เหลือ (จับคนตอบไวผิดมนุษย์/หลายบัญชี) = rate-limit + anomaly detection ใน Phase 5
// ════════════════════════════════════════════════════════════


// บังคับ level ให้เป็น 1/2/3 เท่านั้น (กัน level เพี้ยน/นอกช่วงที่เจอตอนตรวจ Phase 3)
function normalizeLevel(level) {
  var n = Number(level);
  return (n === 1 || n === 2 || n === 3) ? n : null;
}

// บังคับ guess ให้เป็น int 1-5 (0 = "ไม่มั่นใจ") · อื่นๆ = -1 (ถือว่าผิด)
// ปิดรูที่เจอตอนตรวจ Phase 3: null/NaN/ติดลบ ห้ามเล็ดลอดเข้า logic คะแนน
function normalizeGuess(g) {
  return (Number.isInteger(g) && g >= 0 && g <= 5) ? g : -1;
}

// ── ตัดสินหนึ่ง "รอบทบทวน" ของหนึ่งคำ — pure function ทดสอบได้จริง ──
// input:
//   account   : { stars, hardWordsByLevel } (แถวปัจจุบันจาก DB — เซิร์ฟเวอร์อ่านมาให้)
//   srsRecord : record SRS ของ (user, word, level) จาก DB (null = ยังไม่เคยเล่น)
//   word, level, initialGuess : จาก request (initialGuess = สิ่งเดียวที่รับจาก client)
//   nowMs     : เวลาเซิร์ฟเวอร์ (ห้ามใช้เวลา client)
//   opts.knownCheck : true = ผู้เล่นกด "✓ 已記得" (พิสูจน์ครั้งเดียว → master แต่ไม่ให้ดาว)
// output: { ok, reason, correct, justMastered, starsAwarded, capped, newSrsRecord, newAccount }
function resolveRound(input) {
  var account = input.account || { stars: 0, hardWordsByLevel: {} };
  var level = normalizeLevel(input.level);
  var guess = normalizeGuess(input.initialGuess);
  var nowMs = (typeof input.nowMs === 'number') ? input.nowMs : Date.now();
  var opts = input.opts || {};
  var word = String(input.word == null ? '' : input.word);

  if (!level) return reject('bad_level', account);
  if (!word)  return reject('bad_word', account);

  var rec = input.srsRecord ? cloneRec(input.srsRecord) : TF_SRS.blank();

  // มาสเตอร์ไปแล้ว = ไม่ต้องเล่นซ้ำ (กันฟาร์มคำที่ตัดออกจาก SRS แล้ว)
  if (rec.mastered) return reject('already_mastered', account, { newSrsRecord: rec });

  // ── ปฏิทิน SRS (สำคัญสุดด้านกันโกงความเร็ว): ยังไม่ถึงกำหนด = ปฏิเสธ ──
  // กันเล่นคำเดิมซ้ำๆ วันเดียวเพื่อเร่งขั้น 3 รอบรวดแล้วรับดาว
  if (!TF_SRS.isDue(rec, nowMs)) return reject('not_due', account, { newSrsRecord: rec });

  // ── เซิร์ฟเวอร์คิดวรรณยุกต์ที่ถูกต้องเอง แล้วเทียบ ──
  // รองรับ 2 กรณี:
  //   (ก) คำพยางค์เดียว → เทียบ guess เดียวกับ computeTone(word)
  //   (ข) คำหลายพยางค์ (level 2/3) → ต้องส่ง syllables[] + guesses[] มา
  //        clean = "ทุกพยางค์ถูกครั้งแรก" (ตรงกับ curWordAllFirstTry ในเกม)
  var correctClean;
  if (opts.spellingGame) {
    // ── เกมสะกด (อ่าน/พิมพ์): ดาว = สะกดถูก ไม่ใช่วรรณยุกต์ ──
    //   เซิร์ฟเวอร์ตรวจ "สะกดถูกจริงไหม" เองไม่ได้ (โจทย์+คำตอบอยู่ฝั่ง client)
    //   → เชื่อ flag clean จาก client · โกงได้แค่ "อ้างว่า clean"
    //   แต่ยังกันด้วย: ปฏิทิน SRS (isDue ด้านบน) + เพดาน (addHardStars) + RLS
    //   ⇒ เพดานเท่าเกมเสียง: คำละครั้ง เร่งเวลาไม่ได้ เกินเพดานไม่ได้
    correctClean = (opts.spellingClean === true);
  } else if (Array.isArray(input.syllables) && input.syllables.length > 1) {
    var syls = input.syllables.map(function (s) { return String(s); });
    var guesses = Array.isArray(input.guesses) ? input.guesses : [];
    if (guesses.length !== syls.length) return reject('bad_guesses_len', account, { newSrsRecord: rec });
    correctClean = syls.every(function (syl, i) {
      var tt = computeTone(syl);
      return (tt !== null) && (normalizeGuess(guesses[i]) === tt);
    });
  } else {
    var trueTone = computeTone(word);               // 1-5 หรือ null (คำนวณไม่ได้)
    correctClean = (trueTone !== null) && (guess === trueTone);
  }

  // known-check (กด "已記得"): ถูกสะอาด 1 ครั้ง → master ถาวร แต่ "ไม่ให้ดาว ไม่ bump เพดาน"
  if (opts.knownCheck) {
    if (correctClean) { rec.mastered = true; return ok('known_master', true, false, 0, false, rec, account); }
    return ok('known_reset', false, false, 0, false, TF_SRS.resetOnFail(rec), account);
  }

  if (correctClean) {
    var res = TF_SRS.advanceOnClean(rec, nowMs);    // เลื่อนขั้น / mastered ถ้าครบ 3 รอบ
    if (res.justMastered) {
      // เกมสะกด/เรียงประโยค (trust-clean): ให้ client บอก "จำเอง(3⭐) vs กู้/ใช้คำใบ้(1⭐)" ผ่าน starClean
      //   ให้เลขดาวตรงกับที่เกมโชว์ local · ไม่ส่ง starClean → ใช้ res.clean เดิม (เกมเสียง/อ่าน/พิมพ์)
      var cleanForStars = (opts.spellingGame && typeof opts.starClean === 'boolean') ? opts.starClean : res.clean;
      // แจกดาว atomic-ready: addHardStars เช็กเพดานเอง (ถ้าชนเพดาน stars=0 แต่ยัง mastered)
      var aw = addHardStars(account, cleanForStars, level);
      return ok('mastered', true, true, aw.stars, aw.capped, res.rec, aw.account);
    }
    return ok('advanced', true, false, 0, false, res.rec, account);
  }

  // เดาผิด/ไม่มั่นใจ/คำนวณไม่ได้ → รีเซ็ต SRS กลับ day1 (everFailed=true → คราวหน้าได้แค่ "กู้กลับมา"=1 ดาว)
  return ok('reset', false, false, 0, false, TF_SRS.resetOnFail(rec), account);
}

// ── helpers ──
function cloneRec(r) { return JSON.parse(JSON.stringify(r)); }
function reject(reason, account, extra) {
  return Object.assign({ ok: false, reason: reason, correct: false, justMastered: false,
    starsAwarded: 0, capped: false, newSrsRecord: null, newAccount: account }, extra || {});
}
function ok(reason, correct, justMastered, stars, capped, rec, account) {
  return { ok: true, reason: reason, correct: correct, justMastered: justMastered,
    starsAwarded: stars, capped: capped, newSrsRecord: rec, newAccount: account };
}


/* ===== HTTP handler ===== */
const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SB_SVC = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ALLOW_ORIGIN = "https://mrtaihualin.com";

const CORS = {
  "Access-Control-Allow-Origin": ALLOW_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  // ── ตัวตนจาก JWT เท่านั้น (ห้ามเชื่อ user_id จาก client) ──
  const authHeader = req.headers.get("Authorization") || "";
  const userClient = createClient(SB_URL, SB_ANON, { global: { headers: { Authorization: authHeader } } });
  const { data: ud } = await userClient.auth.getUser();
  const user = ud?.user;
  if (!user) return json({ error: "unauthorized" }, 401);

  const admin = createClient(SB_URL, SB_SVC, { auth: { persistSession: false } });

  // ── rate limit: กันสคริปต์ยิงรัวถล่ม DB (เพดานดาว+ปฏิทินกันดาวเกินอยู่แล้ว อันนี้เกราะเสริม) ──
  //   60 รอบ/นาที/คน — คนเล่นเร็วสุด ~20-30/นาที, สคริปต์ยิงเป็นพัน → 60 ไม่บล็อกคนจริง
  //   fail-open โดยตั้งใจ: ถ้า rl_check พัง/หาย จะไม่บล็อกใคร (rate limit ไม่ใช่ด่านหลัก)
  const { data: rlOk, error: rlErr } = await admin.rpc("rl_check", {
    p_user: user.id, p_fn: "tone-round", p_limit: 60, p_window: 60,
  });
  if (!rlErr && rlOk === false) return json({ error: "rate_limited" }, 429);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }

  const word = String(body.word || "");
  const level = Number(body.level);
  if (!word || ![1, 2, 3].includes(level)) return json({ error: "bad word/level" }, 400);

  // ── game: แยก SRS ต่อเกม (default 'tone' = backward-compatible กับ client เกมเสียงเดิม) ──
  const game = String(body.game || "tone");
  if (!["tone", "reading", "typing", "wordorder"].includes(game)) return json({ error: "bad game" }, 400);
  const spellingGame = game !== "tone"; // อ่าน/พิมพ์/เรียงประโยค = trust-clean (เซิร์ฟเวอร์ตรวจเองไม่ได้ → เชื่อ flag clean)

  // ── อ่าน state จริงจาก DB (source of truth) ──
  const { data: acctRow } = await admin.from("game_accounts")
    .select("stars, hard_words_by_level").eq("user_id", user.id).maybeSingle();
  const { data: srsRow } = await admin.from("tone_srs_state")
    .select("stage, due_date, ever_failed, mastered")
    .eq("user_id", user.id).eq("game", game).eq("level", level).eq("word", word).maybeSingle();

  const account = { stars: acctRow?.stars || 0, hardWordsByLevel: acctRow?.hard_words_by_level || {} };
  const srsRecord = srsRow ? {
    stage: srsRow.stage, dueDate: srsRow.due_date, dueAt: 0,
    everFailed: srsRow.ever_failed, mastered: srsRow.mastered,
  } : null;

  // ── ตัดสินแบบ server-authoritative (computeTone คิดเอง ไม่เชื่อ client นอกจาก initialGuess) ──
  const R = resolveRound({
    account, srsRecord, word, level,
    initialGuess: body.initialGuess,
    syllables: body.syllables,
    guesses: body.guesses,
    nowMs: Date.now(),
    opts: { knownCheck: !!body.knownCheck, spellingGame, spellingClean: !!body.clean,
            starClean: (typeof body.starClean === "boolean") ? body.starClean : undefined },
  });
  if (!R.ok) return json({ ok: false, reason: R.reason, totalStars: account.stars });

  // ── เขียน SRS แบบ optimistic (กัน race: ยิงพร้อมกัน 2 ครั้งจะสำเร็จแค่ครั้งเดียว) ──
  const rec = R.newSrsRecord;
  const oldStage = srsRow?.stage ?? null;
  const oldDue = srsRow?.due_date ?? null;
  let wrote = true;
  if (srsRow) {
    const { data: upd } = await admin.from("tone_srs_state")
      .update({ stage: rec.stage, due_date: rec.dueDate, ever_failed: rec.everFailed,
                mastered: rec.mastered, updated_at: new Date().toISOString() })
      .eq("user_id", user.id).eq("game", game).eq("level", level).eq("word", word)
      .eq("stage", oldStage).eq("due_date", oldDue)   // ← เงื่อนไข optimistic
      .select();
    wrote = !!(upd && upd.length);                     // 0 แถว = มีคนอื่นเขียนไปแล้ว → ยกเลิกการให้ดาว
  } else {
    const { error } = await admin.from("tone_srs_state").insert({
      user_id: user.id, game, level, word, stage: rec.stage, due_date: rec.dueDate,
      ever_failed: rec.everFailed, mastered: rec.mastered,
    });
    wrote = !error;
  }
  if (!wrote) return json({ ok: false, reason: "race_retry", totalStars: account.stars });

  // ── ให้ดาว "เฉพาะเมื่อ SRS ถูกเขียนสำเร็จ" (กันดาวเกินตอน race) ──
  if (R.justMastered && R.starsAwarded > 0) {
    await admin.from("game_accounts").upsert({
      user_id: user.id, stars: R.newAccount.stars,
      hard_words_by_level: R.newAccount.hardWordsByLevel,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });
  }
  if (R.justMastered) {
    await admin.from("star_ledger").insert({
      user_id: user.id, game, word, level, stars: R.starsAwarded,
      reason: R.capped ? "capped" : "mastered", clean: R.correct,
    });
  }
  return json({
    ok: true, reason: R.reason, correct: R.correct,
    justMastered: R.justMastered, stars: R.starsAwarded, capped: R.capped,
    totalStars: R.newAccount.stars,
  });
});