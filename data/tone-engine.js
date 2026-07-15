/**
 * tone-engine.js — เครื่องคิดวรรณยุกต์กลาง ใช้ร่วมกันทุกเกม (Lin 2026-07-15)
 * ใช้ใน: tone-finder.html (เกมเสียง) · reading-game.html (เกมอ่าน) · typing-game.html (เกมพิมพ์)
 *
 * มาจากการรวม 3 ก็อปปี้ที่ก่อนหน้านี้แยกกันคนละไฟล์ (TH ใน tone-finder.html + TH_ENGINE ใน
 * reading-game.html + TH_ENGINE ใน typing-game.html — เหมือนกันเป๊ะทั้ง 3 ที่) ให้เหลือที่เดียว
 * ตาม _แผนงาน/ตรวจระบบเสียงวรรณยุกต์_และ_ออกแบบชั้น-AI-ตรวจสอบ_2026-07-12.md ข้อ 1.4 (Must-fix #4)
 *
 * แก้บั๊ก 2 จุดที่ตรวจพบ (เอกสารเดียวกัน ข้อ 1.3):
 *   (a) อักษรนำ: เดิมเช็คจาก LEAD_PATS 9 รายการตายตัว + รับ th ที่ตัด lead ออกแล้ว (เช่น ตลาด
 *       พยางค์ 2 เก็บเป็น th:'ลาด' ไม่ใช่ 'หลาด') → แก้โดย (1) getFullSyllableSpelling() ต่อ lead
 *       กลับเข้าไปก่อนส่งเข้าเครื่องคิด ถ้ายังไม่มีอยู่แล้ว และ (2) เปลี่ยนจาก list ตายตัวเป็นกฎทั่วไป
 *       (ห + พยัญชนะต่ำที่เป็นเสียงก้อง sonorant ใดๆ = อักษรนำ, อย = กรณีตายตัวทางประวัติศาสตร์)
 *   (b) ตัวการันต์ (์): เดิมพยัญชนะที่ถูกทับเสียงยังถูกนับเป็นตัวสะกดอยู่ → แก้โดยตัดพยัญชนะ
 *       ที่อยู่หน้า ์ ทันที + เครื่องหมาย ์ เองออกจากคำ ก่อนวิเคราะห์ทุกอย่าง (ตัวสะกด/สระ/วรรณยุกต์)
 *
 * แก้บั๊ก item (c): buildToneReason เดิม "เงียบ" ทิ้งเคสที่คำนวณได้ไม่ตรงกับคำตอบที่ Lin พิมพ์ไว้
 * (return null เฉยๆ) — ตอนนี้ยังคง return null เหมือนเดิม (กันโชว์เหตุผลผิดให้เด็กเห็น, ของเดิมดีอยู่แล้ว)
 * แต่เพิ่มการ "เก็บ log" ทุกเคสที่ไม่ตรงไว้ใน mismatch log อ่านได้ผ่าน getToneMismatches() แทนที่จะ
 * หายไปเฉยๆ — ใช้กับ regression-check + review-tool.html
 *
 * แก้บั๊ก (d) — เพิ่ม 2026-07-15: ควบกล้ำไม่แท้ สร/ศร/ษร (ร มีรูปแต่ไม่ออกเสียง เช่น สระ, เสร็จ, สร้าง, เศร้า)
 *   เดิมนับ ร เป็นตัวสะกดจริง ทำให้พยางค์ที่ควรเป็นเสียงตาย (dead) กลายเป็นเสียงยาว (live) ผิด →
 *   แก้โดยตัด ร ที่ตามหลัง ส/ศ/ษ ทันทีออกก่อนวิเคราะห์ทุกอย่าง (Lin ยืนยันกฎนี้ 2026-07-15)
 *
 * ใช้แบบไหนก็ได้:
 *   Browser: <script src="data/tone-engine.js?v=1"></script> (ต้องมาหลัง words-data.js ก็ได้ ไม่บังคับลำดับ)
 *   Node:    global.window = global; require('./tone-engine.js');
 *
 * Export (ทั้งหมดอยู่ใต้ window/global):
 *   TH, TH_ENGINE          → object เดิม (alias เดียวกัน) มีฟังก์ชัน: hasToneMark, getToneMark,
 *                             getInitClass, getInitChar, isLiveWord, getVowelType, classLabel,
 *                             hasTailCons, getEndConsType — พฤติกรรมเหมือนเดิมทุกอย่าง แค่แก้ 2 บั๊กข้างบน
 *   computeToneFromSpelling(word) → คืนเลขวรรณยุกต์ 1-5 หรือ null
 *   getFullSyllableSpelling(syl)  → syl:{th,lead} คืนตัวสะกดเต็มที่พร้อมส่งเข้าเครื่องคิด (ต่อ lead กลับ)
 *   buildToneReason(w)     → w:{th,tone_name,lead,cons} คืนประโยคอธิบายเหตุผล (ไทย/จีน) หรือ null
 *   analyzeSyllable(syl)   → syl:{th,lead,cons,tone_name} คืน object วิเคราะห์เต็ม (ใช้ใน review-tool)
 *   getToneMismatches() / clearToneMismatches() → อ่าน/ล้าง log เคสคำนวณไม่ตรงกับคำตอบ Lin
 */
(function (global) {
  'use strict';

  var LOW_SET    = new Set('คฅฆงชซฌญฑฒณทธนพฟภมยรลวฬฮ'.split(''));
  var HIGH_SET   = new Set('ขฃฉฐถผฝศษสห'.split(''));
  var MID_SET    = new Set('กจดตบปอฎฏ'.split(''));
  var SHORT_TAIL = new Set('กขคฆบปพฟภจชซฎฏฐฑฒดตถทธศษส'.split(''));
  var LONG_TAIL  = new Set('นณญรลฬมยวง'.split(''));
  var CONS_SET   = new Set('กขฃคฅฆงจฉชซฌญฎฏฐฑฒณดตถทธนบปผฝพฟภมยรลวศษสหฬอฮ'.split(''));
  // เดิม: LEAD_PATS = ['หน','หม','หล','หว','หย','หร','หญ','หง','อย'] (list ตายตัว 9 รายการ)
  // ตอนนี้: กฎทั่วไป — ห + พยัญชนะต่ำที่เป็นเสียงก้อง(sonorant)ใดๆ ก็ตาม = อักษรนำ (ไม่ผูกกับ list)
  // อย ยังคงเป็นกรณีตายตัว (ทางประวัติศาสตร์ อ นำได้เฉพาะ ย เท่านั้น ไม่ใช่กฎทั่วไปแบบ ห)
  var SONORANT_AFTER_H = new Set(['น', 'ม', 'ล', 'ว', 'ย', 'ร', 'ญ', 'ง']);
  var SHORT_V = new Set(['ะ', 'ั', 'ิ', 'ึ', 'ุ', '็']);
  var LONG_V  = new Set(['า', 'ี', 'ื', 'ู', 'เ', 'แ', 'โ']);
  var TONE_CHARS = new Set(['่', '้', '๊', '๋']);
  var LIVE_V = new Set(['ไ', 'ใ', 'ำ']);
  var CLUSTER2 = new Set('รลว'.split(''));
  var CLUSTER_INIT = new Set('กขคฆปผพภตบดฟ'.split(''));
  var KARUN = '์';
  // ควบกล้ำไม่แท้ สร/ศร/ษร — ร มีรูปแต่ไม่ออกเสียง (Lin ยืนยัน 2026-07-15, ตัวอย่าง: สระ, เสร็จ, สร้าง, เศร้า)
  var SILENT_R_LEADS = new Set(['ส', 'ศ', 'ษ']);

  // ── แก้บั๊ก (b) ตัวการันต์: ตัดพยัญชนะหน้า ์ + ์ เอง ออกก่อนวิเคราะห์อะไรทั้งหมด ──
  function _stripKarun(word) {
    if (!word) return word;
    var idx = word.indexOf(KARUN);
    if (idx < 1) return word; // ไม่มี ์ หรือ ์ อยู่ตำแหน่งแรก (ผิดปกติ ไม่ตัด กันพัง)
    // การันต์บางคำอาจทับ 2 ตัวอักษร (เช่น รร์ ที่ไม่ค่อยเจอ) — ในชุดคำจริงของเราทับทีละ 1 ตัวพอ
    return word.slice(0, idx - 1) + word.slice(idx + 1);
  }

  // ── แก้บั๊ก (d) ควบกล้ำไม่แท้ สร/ศร/ษร: ตัด ร ที่ตามหลัง ส/ศ/ษ ทันทีออกก่อนวิเคราะห์ ──
  // (2026-07-15 — เจอจาก "สระ" ในสระว่ายน้ำ คำนวณผิดเป็นจัตวา ที่ถูกคือเอก เพราะเครื่องคิดเดิม
  //  นับ ร เป็นตัวสะกดจริง ทำให้ดูเหมือนพยางค์เป็นเสียงยาว(live) ทั้งที่จริงตายเสียง(dead))
  function _stripSilentR(word) {
    if (!word) return word;
    var out = '';
    for (var i = 0; i < word.length; i++) {
      if (word[i] === 'ร' && i > 0 && SILENT_R_LEADS.has(word[i - 1])) continue;
      out += word[i];
    }
    return out;
  }

  function _normalize(word) {
    return _stripSilentR(_stripKarun(word));
  }

  // ── แก้บั๊ก (a) อักษรนำ: กฎทั่วไปแทน list ตายตัว ──
  // คืนความยาว prefix ที่เป็น "อักษรนำ" (2 = มี, 0 = ไม่มี)
  function _leadLen(word) {
    if (word.indexOf('อย') === 0) return 2; // กรณีตายตัว: อยาก อยู่ อย่า อย่าง
    if (word.charAt(0) === 'ห' && word.length > 1 && SONORANT_AFTER_H.has(word.charAt(1))) return 2;
    return 0;
  }

  function _initChar(word) {
    var ll = _leadLen(word);
    if (ll) return word.slice(0, ll);
    for (var j = 0; j < word.length; j++) { if (CONS_SET.has(word[j])) return word[j]; }
    return null;
  }

  function _hasSaraOr(word) {
    var ic = _initChar(word), firstOr = word.indexOf('อ');
    for (var i = 0; i < word.length; i++) {
      if (word[i] === 'อ' && i > 0) {
        var hasConsBefore = false;
        for (var k = 0; k < i; k++) { if (CONS_SET.has(word[k])) { hasConsBefore = true; break; } }
        if (hasConsBefore && !(ic === 'อ' && firstOr === i)) return true;
      }
    }
    return false;
  }

  function _codaCons(word) {
    var cons = [];
    for (var i = 0; i < word.length; i++) { if (CONS_SET.has(word[i])) cons.push(word[i]); }
    if (cons.length >= 2 && CLUSTER_INIT.has(cons[0]) && CLUSTER2.has(cons[1])) {
      var idx0 = word.indexOf(cons[0]);
      var idx2 = word.indexOf(cons[1], idx0 + 1);
      var after = word.slice(idx2 + 1), clusterOK = false;
      for (var a = 0; a < after.length; a++) {
        var ch = after[a];
        if (SHORT_V.has(ch) || LONG_V.has(ch) || ch === 'อ' || CONS_SET.has(ch) || LIVE_V.has(ch)) { clusterOK = true; break; }
      }
      if (clusterOK) cons = [cons[0]].concat(cons.slice(2));
    }
    return cons;
  }

  var ENGINE = {
    hasToneMark: function (word) {
      word = _normalize(word);
      for (var i = 0; i < word.length; i++) if (TONE_CHARS.has(word[i])) return true;
      return false;
    },
    getToneMark: function (word) {
      word = _normalize(word);
      for (var i = 0; i < word.length; i++) if (TONE_CHARS.has(word[i])) return word[i];
      return null;
    },
    getInitClass: function (word) {
      word = _normalize(word);
      if (_leadLen(word)) return 'lead';
      for (var j = 0; j < word.length; j++) {
        var c = word[j];
        if (LOW_SET.has(c))  return 'low';
        if (HIGH_SET.has(c)) return 'high';
        if (MID_SET.has(c))  return 'mid';
      }
      return null;
    },
    getInitChar: function (word) {
      word = _normalize(word);
      var ll = _leadLen(word);
      if (ll) return word.slice(0, ll);
      for (var j = 0; j < word.length; j++) { if (CONS_SET.has(word[j])) return word[j]; }
      return null;
    },
    isLiveWord: function (word) {
      word = _normalize(word);
      var cons = _codaCons(word);
      if (cons.length >= 2) {
        var last = cons[cons.length - 1];
        if (last === 'อ' && word[word.length - 1] === 'อ' && this.getInitChar(word) !== 'อ') return true;
        if (SHORT_TAIL.has(last)) return false;
        if (LONG_TAIL.has(last))  return true;
      }
      for (var n = 0; n < word.length; n++) if (LIVE_V.has(word[n])) return true;
      for (var j = 0; j < word.length; j++) if (SHORT_V.has(word[j])) return false;
      for (var k = 0; k < word.length; k++) if (LONG_V.has(word[k]))  return true;
      if (_hasSaraOr(word)) return true;
      return null;
    },
    getVowelType: function (word) {
      word = _normalize(word);
      for (var i = 0; i < word.length; i++) if (SHORT_V.has(word[i])) return 'short';
      for (var j = 0; j < word.length; j++) if (LONG_V.has(word[j]))  return 'long';
      if (_hasSaraOr(word)) return 'long';
      return null;
    },
    classLabel: function (cls) {
      return { low: '低子音', high: '高子音', mid: '中子音', lead: '前引字' }[cls] || cls;
    },
    hasTailCons: function (word) {
      return _codaCons(_normalize(word)).length >= 2;
    },
    getEndConsType: function (word) {
      word = _normalize(word);
      var cons = _codaCons(word);
      if (cons.length >= 2) {
        var last = cons[cons.length - 1];
        if (SHORT_TAIL.has(last)) return 'short';
        if (LONG_TAIL.has(last))  return 'long';
      }
      return null;
    }
  };

  // ── แก้บั๊ก (a) ส่วนที่ 1: ต่อ lead กลับเข้าไปก่อนส่งเข้าเครื่องคิด ──
  // syl = {th, lead} — ถ้า th มีตัวยกเสียงอยู่แล้ว (ขึ้นต้นด้วย ห/อ จริงๆ เช่น หน้า, หยู่) ไม่ต้องต่อซ้ำ
  // ถ้า th ไม่มี (เช่น ตลาด พยางค์ 2 เก็บเป็น 'ลาด' แต่ lead:'ห') ต่อ lead เข้าไปก่อน
  function getFullSyllableSpelling(syl) {
    if (!syl || !syl.th) return (syl && syl.th) || '';
    var th = syl.th;
    if (syl.lead && th.charAt(0) !== 'ห' && th.charAt(0) !== 'อ') return syl.lead + th;
    return th;
  }

  var TONE_NAME_TO_NUM = { 'สามัญ': 1, 'เอก': 2, 'โท': 3, 'ตรี': 4, 'จัตวา': 5 };
  var TONE_NUM_NAME = ['', 'สามัญ', 'เอก', 'โท', 'ตรี', 'จัตวา'];
  var TONE_CLASS_ZH = { low: '低子音', high: '高子音', mid: '中子音', lead: '前引字' };
  var TONE_MARK_NAME = { '่': 'ไม้เอก', '้': 'ไม้โท', '๊': 'ไม้ตรี', '๋': 'ไม้จัตวา' };
  var TONE_ZH = { 'สามัญ': '第一聲', 'เอก': '第二聲', 'โท': '第三聲', 'ตรี': '第四聲', 'จัตวา': '第五聲' };

  function computeToneFromSpelling(word) {
    if (!word) return null;
    var cls = ENGINE.getInitClass(word), mark = ENGINE.getToneMark(word),
        live = ENGINE.isLiveWord(word), vowel = ENGINE.getVowelType(word);
    if (!cls) return null;
    var e = (cls === 'lead') ? 'high' : cls;
    if (mark) {
      if (e === 'low') { if (mark === '่') return 3; if (mark === '้') return 4; }
      else if (e === 'mid') { if (mark === '่') return 2; if (mark === '้') return 3; if (mark === '๊') return 4; if (mark === '๋') return 5; }
      else { if (mark === '่') return 2; if (mark === '้') return 3; }
    } else {
      if (live) return (e === 'high') ? 5 : 1;
      if (e === 'high' || e === 'mid') return 2;
      var isShort = (vowel === 'short') || (vowel == null);
      return isShort ? 4 : 3;
    }
    return null;
  }

  // ── แก้บั๊ก (c): เดิม return null เงียบๆ ตอนคำนวณไม่ตรงคำตอบ Lin ──
  // ยังคง return null เหมือนเดิม (ไม่โชว์เหตุผลผิดให้เด็ก) แต่เก็บ log ไว้ให้ตรวจย้อนหลังได้
  var MISMATCH_LOG = [];
  function buildToneReason(w) {
    if (!w || !w.th || !w.tone_name) return null;
    var expectedNum = TONE_NAME_TO_NUM[w.tone_name];
    var fullSpelling = getFullSyllableSpelling(w);
    var computed = computeToneFromSpelling(fullSpelling);
    if (computed !== expectedNum) {
      MISMATCH_LOG.push({
        th: w.th, fullSpelling: fullSpelling, cons: w.cons || null, lead: w.lead || null,
        expected: w.tone_name, expectedNum: expectedNum,
        computed: computed, computedName: computed ? TONE_NUM_NAME[computed] : null,
        at: new Date().toISOString()
      });
      return null;
    }
    var cls = ENGINE.getInitClass(fullSpelling), mark = ENGINE.getToneMark(fullSpelling),
        live = ENGINE.isLiveWord(fullSpelling), vowel = ENGINE.getVowelType(fullSpelling);
    var e = (cls === 'lead') ? 'high' : cls;
    var initCh = ENGINE.getInitChar(fullSpelling) || w.cons;
    var classLabel = TONE_CLASS_ZH[cls] || cls;
    var toneZh = TONE_ZH[w.tone_name] || w.tone_name;
    if (mark) {
      return '「' + initCh + '」是' + classLabel + '，加上聲調符「' + mark + '」（' + TONE_MARK_NAME[mark] + '）→ 組合成' + toneZh;
    }
    if (live) {
      return '「' + initCh + '」是' + classLabel + '，這個音節是活音節（長母音或長尾音），沒有聲調符 → 固定念' + toneZh;
    }
    if (e === 'high' || e === 'mid') {
      return '「' + initCh + '」是' + classLabel + '，這個音節是死音節（短母音或短尾音），沒有聲調符 → 固定念' + toneZh;
    }
    var isShort = (vowel === 'short') || (vowel == null);
    return '「' + initCh + '」是低子音，死音節+' + (isShort ? '短母音' : '長母音') + ' → 念' + toneZh;
  }

  function getToneMismatches() { return MISMATCH_LOG.slice(); }
  function clearToneMismatches() { MISMATCH_LOG.length = 0; }

  // ── ใช้ใน review-tool.html: วิเคราะห์ 1 พยางค์แบบเต็ม ไม่ผูกกับ DOM ──
  // syl: {th, lead, cons, tone_name} (tone_name ใส่หรือไม่ใส่ก็ได้ — ถ้าไม่ใส่จะไม่มี match/expected)
  function analyzeSyllable(syl) {
    var fullSpelling = getFullSyllableSpelling(syl);
    var cls = ENGINE.getInitClass(fullSpelling);
    var mark = ENGINE.getToneMark(fullSpelling);
    var live = ENGINE.isLiveWord(fullSpelling);
    var vowel = ENGINE.getVowelType(fullSpelling);
    var initChar = ENGINE.getInitChar(fullSpelling);
    var computedNum = computeToneFromSpelling(fullSpelling);
    var computedName = computedNum ? TONE_NUM_NAME[computedNum] : null;
    var expectedName = syl && syl.tone_name ? syl.tone_name : null;
    var expectedNum = expectedName ? TONE_NAME_TO_NUM[expectedName] : null;
    var match = expectedNum != null ? (computedNum === expectedNum) : null;
    var reason = null;
    if (match) reason = buildToneReason(syl);
    return {
      th: syl && syl.th, fullSpelling: fullSpelling, lead: syl && syl.lead || null, cons: syl && syl.cons || null,
      initChar: initChar, cls: cls, clsZh: TONE_CLASS_ZH[cls === 'lead' ? 'high' : cls] || cls,
      mark: mark, markName: mark ? TONE_MARK_NAME[mark] : null,
      live: live, vowelType: vowel,
      computedNum: computedNum, computedName: computedName,
      expectedNum: expectedNum, expectedName: expectedName,
      match: match, reason: reason
    };
  }

  global.TH = ENGINE;
  global.TH_ENGINE = ENGINE; // alias เดิม กันโค้ดหน้าเว็บที่เรียก TH_ENGINE.xxx พัง
  global.TONE_CLASS_ZH = TONE_CLASS_ZH;
  global.TONE_MARK_NAME = TONE_MARK_NAME;
  global.TONE_NUM_NAME = TONE_NUM_NAME;
  global.TONE_ZH = global.TONE_ZH || TONE_ZH; // ไม่ทับถ้าเพจเดิมประกาศไว้แล้วก่อนโหลดไฟล์นี้
  global.getFullSyllableSpelling = getFullSyllableSpelling;
  global.computeToneFromSpelling = computeToneFromSpelling;
  global.buildToneReason = buildToneReason;
  global.getToneMismatches = getToneMismatches;
  global.clearToneMismatches = clearToneMismatches;
  global.analyzeSyllable = analyzeSyllable;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      TH_ENGINE: ENGINE, getFullSyllableSpelling: getFullSyllableSpelling,
      computeToneFromSpelling: computeToneFromSpelling, buildToneReason: buildToneReason,
      getToneMismatches: getToneMismatches, clearToneMismatches: clearToneMismatches,
      analyzeSyllable: analyzeSyllable
    };
  }
})(typeof window !== 'undefined' ? window : global);
