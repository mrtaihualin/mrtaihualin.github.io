// ════════════════════════════════════════════════════════════════
// 泰語語序練習室 (word-order.html) — Lin 2026-07-03
// FILE MAP: config/state/SRS → sentence selection → tile ordering + hints → scoring/results → account/UI controls → init
// 資料來源：adv-sentences.js（跟打字/拼讀/聲調遊戲共用「高級」句庫，共 10 句）
// 玩法：點詞塊依序放入空格，湊出跟原句一樣的詞語順序
// ── กฎ MASTER 2026-07-05 (คำสั่ง_เกมเรียงคำ_高級_2026-07-05.md): เพิ่ม SRS/ดาวเงิน/คอมโบ/คำทอง/已記得/CTA ล็อกอินเต็มระบบ
//    ก็อปแพทเทิร์นจาก reading-game.html (高級 ที่ทำเสร็จแล้ว) ยกเว้นกลไก提示ที่ต่างออกไป (ดูข้อ 3.6 ในคำสั่ง — ยืนยันผ่าน widget แล้ว)
// ════════════════════════════════════════════════════════════════
(function(){
  'use strict';

  // ══════ CONFIG (ตัวเลขทั้งหมดอ้างจากกฎ MASTER + คำตอบที่ Lin ยืนยันแล้วในคำสั่ง 2026-07-05) ══════
  var ROUND_COMPLETE_BONUS = 20;     // จบรอบ +20 (ข้อ5)
  var ROUND_PERFECT_BONUS  = 50;     // perfect (ทุกประโยคสะอาด) +50 เพิ่ม (ข้อ5)
  var GOLDEN_SENTENCE_CHANCE = 0.18; // คำทอง 18%/ประโยค (ข้อ4)
  var GOLDEN_SENTENCE_MULT   = 2;    // คำทองสะอาด×2 (ข้อ4)
  var SRS_REVIEW_BONUS = [3, 2, 1];  // Phase 1: New+3 · Day 1+2 · รอบตัดสิน Day 7+1
  var LEVEL_WEIGHT = 2;              // เกมนี้ทั้งเกม=高級ล้วน → ตัวคูณระดับคงที่ ×2 คูณ "ทั้งรอบ" ตอนจบ (ข้อ2)
  var LEVEL_NUM = 3;                 // ใช้กับ GAME_ACCOUNT.addHardStars(clean, level) — 高級=3
  var SENTENCE_LIFE_START = 10;      // "ชีวิต" ของประโยคนี้ เริ่ม 10 (ก่อนคูณระดับ/คอมโบ/คำทอง) — ตรงตาราง MASTER ข้อ1
  var WO_ROUND_SIZE = 3;             // Lin 2026-07-31: จำนวนประโยคต่อชุด
  var WRONG_DEDUCT = [3, 3, 3, 1];   // เรียงผิดครั้งที่1/2/3/4 หักเท่านี้ตามลำดับ (รวม=10 พอดี → ผิดครบ4=ตาย ตรงตาราง 10,7,4,1,0)
  var HINT_DEDUCT = 2;               // 提示 หักครั้งละ 2 เสมอ ไม่จำกัดจำนวนครั้ง (ข้อยกเว้นจาก MASTER ข้อ9 — Lin ยืนยัน 2026-07-05 ข้อ3.6)
  function woComboMult(streak){ return streak >= 8 ? 3 : (streak >= 5 ? 2 : (streak >= 3 ? 1.5 : 1)); } // คอมโบ 3/5/8×1.5/2/3 (ข้อ3)

  // ══════ SRS engine (ลอกจาก reading-game.html RG_SRS ทุกจุด + เพิ่ม everHinted สำหรับข้อยกเว้น 3.6) ══════
  var WO_SRS_CFG = { INTERVALS: [1, 7], CLEAN_ROUNDS_TO_MASTER: 3 }; // New → Day 1 → Day 7 → Mastered
  var WO_SRS = {
    cfg: WO_SRS_CFG,
    twDate: function(ms){ var d=(ms==null)?new Date():new Date(ms); try{ return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei'}).format(d); }catch(e){ return d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2); } },
    twDatePlusDays: function(ms, days){ return this.twDate((ms==null?Date.now():ms) + (days||0)*86400000); },
    blank: function(){ return { stage:0, dueDate:'', dueAt:0, everFailed:false, everHinted:false, mastered:false }; },
    isDue: function(rec, nowMs){
      if (!rec || rec.mastered) return false;
      var today = this.twDate(nowMs || Date.now());
      if (rec.dueDate) return rec.dueDate <= today;
      if (rec.dueAt) return this.twDate(rec.dueAt) <= today;
      return true;
    },
    advanceOnClean: function(rec, nowMs){
      rec = rec || this.blank(); nowMs = nowMs || Date.now();
      var passedStage = rec.stage;
      rec.stage += 1;
      if (rec.stage >= this.cfg.CLEAN_ROUNDS_TO_MASTER) { rec.mastered = true; return { rec: rec, justMastered: true, passedStage: passedStage }; }
      var days = this.cfg.INTERVALS[passedStage] || this.cfg.INTERVALS[this.cfg.INTERVALS.length-1];
      rec.dueDate = this.twDatePlusDays(nowMs, days); rec.dueAt = nowMs + days*86400000;
      return { rec: rec, justMastered: false, passedStage: passedStage };
    },
    resetOnFail: function(rec){ rec = rec || this.blank(); rec.stage = 0; rec.dueDate = ''; rec.dueAt = 0; rec.everFailed = true; return rec; }
  };
  // Lin 2026-07-15: เปลี่ยน key จาก "ลำดับ index ใน ADV_SENTENCES" เป็น "ตัวประโยค+ระดับ" (woSrsKey) กันบั๊ก —
  // ก่อนหน้านี้ถ้า Lin แก้/เพิ่ม/ลบ/สลับลำดับประโยคใน data/adv-sentences.js ความจำ SRS ของนักเรียนจะไปติดผิดประโยคแบบเงียบๆ
  var srsRecords = {};           // key = woSrsKey(ประโยค) → SRS record
  var SRS_SAVE_KEY = 'wo_srs_v1';
  function woLoadSrs(){ try{ var raw=localStorage.getItem(SRS_SAVE_KEY); srsRecords = raw ? (JSON.parse(raw)||{}) : {}; }catch(e){ srsRecords = {}; } }
  function woSaveSrs(){ try{ localStorage.setItem(SRS_SAVE_KEY, JSON.stringify(srsRecords)); }catch(e){} }
  function woLoggedIn(){ try{ return !!(window.READING_AUTH && READING_AUTH.user); }catch(e){ return false; } }

  // ════════════════════════════════════════════
  // ── Lin 2026-07-13: ซิงก์ SRS "ข้ามเครื่อง" — อ่านกลับจาก Supabase (tone_srs_state, game='wordorder') → merge เข้า srsRecords ──
  //   • อ่านอย่างเดียว · เขียนขึ้นเซิร์ฟเวอร์ยังเป็นหน้าที่ tone-round เหมือนเดิม (ดาว/กันโกงไม่แตะ)
  //   • เก็บด้วย "ตัวประโยค+ระดับ" (woSrsKey) → ประโยคที่ไม่มีแล้ว = ข้าม (กันประโยคผี) — แก้ 2026-07-15 (เดิมเก็บด้วย index, บั๊กเดียวกับ reading-game/typing-game)
  //   • คู่ขนาน ไม่บล็อกเกม · เน็ตล่ม/ไม่ล็อกอิน = ใช้ srsRecords ในเครื่องเดิม · merge = เลือกอันก้าวหน้ากว่า
  // ════════════════════════════════════════════
  function woSrsRank(r){ if(!r) return -1; if(r.mastered) return 3; return (r.stage||0); }
  function woSrsPickAdvanced(a,b){ if(!a)return b; if(!b)return a; var ra=woSrsRank(a),rb=woSrsRank(b); if(ra!==rb)return ra>rb?a:b; var da=a.dueDate||'',db=b.dueDate||''; if(da!==db)return (da>db)?a:b; return a; }
  function woSrsKey(th){ return (th||'')+'@'+LEVEL_NUM; }
  function woSentenceExists(sentThai){
    for(var i=0;i<ADV_SENTENCES.length;i++){ if(ADV_SENTENCES[i].th===sentThai) return true; }
    return false; // ไม่มีใน ADV_SENTENCES แล้ว = ประโยคผี → ข้าม
  }
  var __woSrsSyncPromise=null;
  window.__woSrsSyncedOnce=false;
  var __woLearningOwnerEpoch=0;
  var __woSrsRequestSequence=0;
  var __woLatestSrsRequest=0;
  function woSrsOwnerCurrent(ownerId,ownerEpoch,requestId){
    var currentId=(window.READING_AUTH&&READING_AUTH.user&&String(READING_AUTH.user.id))||'';
    var currentEpoch=Number(window.SITE_AUTH&&SITE_AUTH.learningOwnerEpoch)||0;
    if(currentId!==ownerId||currentEpoch!==ownerEpoch)return false;
    if(requestId!=null&&requestId!==__woLatestSrsRequest)return false;
    try{return !!(window.PHASE1_ACCOUNT_BOUNDARY&&localStorage.getItem(PHASE1_ACCOUNT_BOUNDARY.ownerKey)===ownerId);}catch(e){return false;}
  }
  function woResetAccountStateAtBoundary(){
    var epoch=(window.SITE_AUTH&&SITE_AUTH.learningOwnerEpoch)||0;
    if(!epoch||epoch===__woLearningOwnerEpoch)return false;
    __woLearningOwnerEpoch=epoch;srsRecords={};
    __woLatestSrsRequest=++__woSrsRequestSequence;
    __woSrsSyncPromise=null;window.__woSrsSyncedOnce=false;
    return true;
  }
  function woSyncSrsFromServer(force){
    try{ if(!woLoggedIn()) return Promise.resolve(false); }catch(e){ return Promise.resolve(false); }
    if(__woSrsSyncPromise) return __woSrsSyncPromise;
    var sb=window.getSupabaseClient?window.getSupabaseClient():null;
    if(!sb||!sb.from) return Promise.resolve(false);
    // dedupe fetch 2026-07-20: woWireSrsSync รีเซ็ต __woSrsSyncPromise แล้วเรียกฟังก์ชันนี้ใหม่ทุกครั้งที่ SITE_AUTH.onChange ยิง
    //   (หลายรอบต่อโหลดหน้าเดียว) → ห่อ fetch ด้วย getCachedFetch กันยิง Supabase ซ้ำทั้งที่ user เดิม
    var _uid=String(READING_AUTH.user.id);
    var _ownerEpoch=Number(window.SITE_AUTH&&SITE_AUTH.learningOwnerEpoch)||0;
    var _requestId=++__woSrsRequestSequence;__woLatestSrsRequest=_requestId;
    var _fetchSrs = window.getCachedFetch
      ? window.getCachedFetch('tone_srs_state:wordorder:'+_uid, function(){
          return sb.from('tone_srs_state').select('level, word, stage, due_date, ever_failed, mastered').eq('user_id',_uid).eq('game','wordorder');
        })
      : sb.from('tone_srs_state').select('level, word, stage, due_date, ever_failed, mastered').eq('user_id',_uid).eq('game','wordorder');
    __woSrsSyncPromise = _fetchSrs
      .then(function(res){
        if(!woSrsOwnerCurrent(_uid,_ownerEpoch,_requestId))return false;
        if(res.error||!res.data){ window.__woSrsSyncedOnce=true; return false; }
        var changed=false;
        res.data.forEach(function(row){
          if(Number(row.level)!==LEVEL_NUM) return;         // เกมนี้มีระดับเดียว (高=3)
          if(!woSentenceExists(row.word)) return;            // ประโยคผี ข้าม
          var key=woSrsKey(row.word);
          var srv={stage:row.stage||0,dueDate:row.due_date||'',dueAt:0,everFailed:!!row.ever_failed,everHinted:false,mastered:!!row.mastered};
          var cur=srsRecords[key];
          var win=woSrsPickAdvanced(cur,srv);
          if(!cur || win.stage!==cur.stage || (win.dueDate||'')!==(cur.dueDate||'') || (!!win.mastered)!==(!!cur.mastered)){
            srsRecords[key]=win; changed=true;
          }
        });
        if(changed) woSaveSrs();
        window.__woSrsSyncedOnce=true;
        return changed;
      })
      .catch(function(){ if(!woSrsOwnerCurrent(_uid,_ownerEpoch,_requestId))return false; window.__woSrsSyncedOnce=true; return false; });
    return __woSrsSyncPromise;
  }
  // เรียก init() แบบปลอดภัย — ถ้า DOM ยังโหลดไม่เสร็จ (สคริปต์นี้รันก่อน DOMContentLoaded) ให้รอก่อน กัน getElementById เป็น null
  function woReinitSafe(){
    if(document.readyState==='loading'){ document.addEventListener('DOMContentLoaded', function(){ try{ init(); }catch(e){} }, {once:true}); }
    else { try{ init(); }catch(e){} }
  }
  // ⚠️ สำคัญ: สคริปต์เกม (inline) รัน "ก่อน" สคริปต์ defer (auth-widget/supabase-config) → ตอน parse ยังไม่มี SITE_AUTH
  //   ต้องลงทะเบียน onChange "หลัง DOM พร้อม" (ตอนนั้น defer โหลดครบแล้ว) + มี fallback ยิงซ้ำกันเหนียว
  function woWireSrsSync(){
    try{
      if(window.SITE_AUTH && SITE_AUTH.onChange){
        SITE_AUTH.onChange(function(u){
          woResetAccountStateAtBoundary();
          if(!u) return;
          var ownerId=String(u.id),ownerEpoch=Number(SITE_AUTH.learningOwnerEpoch)||0;
          if(!window.__woSrsSyncedOnce){ woSyncSrsFromServer(true).then(function(){ if(woSrsOwnerCurrent(ownerId,ownerEpoch))woReinitSafe(); }); }
          else { __woSrsSyncPromise=null; woSyncSrsFromServer(true); }
        });
      }
    }catch(e){}
    // fallback แบบ poll — กันกรณี onChange ไม่ยิงตอนโหลด หรือ READING_AUTH/ไคลเอนต์พร้อมช้า
    //   ลองทุก 0.5วิ จน "ซิงก์สำเร็จ" (syncedOnce) แล้วหยุด · สูงสุด ~12วิ (ไม่ล็อกอิน = วนเปล่าๆ แล้วเลิก ไม่มีผลเสีย)
    var _woT=0, _woIv=setInterval(function(){
      _woT++;
      try{
        if(window.__woSrsSyncedOnce){ clearInterval(_woIv); return; }
        if(woLoggedIn()){ var ownerId=String(READING_AUTH.user.id),ownerEpoch=Number(SITE_AUTH&&SITE_AUTH.learningOwnerEpoch)||0; woSyncSrsFromServer(true).then(function(){ if(woSrsOwnerCurrent(ownerId,ownerEpoch))woReinitSafe(); }); }
      }catch(e){}
      if(_woT>=24) clearInterval(_woIv);
    }, 500);
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', woWireSrsSync); else woWireSrsSync();

  // ── Phase 4 (กันโกงดาว): ให้เซิร์ฟเวอร์เป็นคนตัดสิน+แจกดาวจริง (เกมเรียงประโยค = trust-clean เหมือนเกมสะกด) ──
  //   ยิงทุกจุดที่ SRS ขยับ (advance/reset/fail/known-check) → เซิร์ฟเวอร์เลื่อน/รีเซ็ตเอง → mastered แล้วแจกดาว
  //   starClean = จำเอง(3⭐) vs ใช้คำใบ้/กู้(1⭐) → ส่งไปให้ดาวเซิร์ฟเวอร์ตรงกับที่เกมโชว์
  //   คู่ขนาน ไม่รื้อ local · เน็ตล่ม/ไม่ล็อกอิน = เกมทำงานเหมือนเดิม
  function woServerFinish(sentThai, clean, extra){
    try{
      if(woLoggedIn() && !practiceMode && window.TONE_SERVER && TONE_SERVER.available()){
        var body = { game:'wordorder', word:sentThai, level:LEVEL_NUM, clean:clean };
        if(extra) for(var k in extra) body[k]=extra[k];
        TONE_SERVER.finishRound(body).then(function(r){
          if(r&&r.ok&&r.justMastered&&r.stars>0&&window.console) console.log('[P4] ⭐ server',r.stars,'→ total',r.totalStars);
        });
      }
    }catch(e){}
  }

  var SET = [];          // ดัชนี (index) เข้า ADV_SENTENCES ของรอบนี้ (สุ่มลำดับ, กรองด้วย SRS ถ้าล็อกอิน)
  var idx = 0;            // ตำแหน่งปัจจุบันใน SET (0-based)
  var score = 0;
  var correctFirstTry = 0;
  var practiceMode = false; // ล็อกอิน+จำครบทุกประโยคแล้ว (mastered หมด) → ทบทวนฟรี ไม่คิดคะแนน/ดาว/ลีก (กันฟาร์ม, ข้อ7)
  var bank = [];          // 目前這句的詞塊（洗牌過），每個是 {th, orig}
  var answer = [];        // 玩家已放入格子的 orig index 順序
  var used = {};          // orig index -> true 表示已被放進格子
  var attemptedWrongThisSentence = false;
  var hintUsedThisSentence = false;
  var locked = false;     // 這句已經答對/公佈答案，鎖住不能再改
  var wrongCount = 0;     // จำนวนครั้งที่เรียงผิด (สะสมทั้งประโยคนี้ — ใช้กำหนดว่าผิดครั้งถัดไปหักเท่าไหร่)
  var life = SENTENCE_LIFE_START; // "ชีวิต" ของประโยคนี้ — หักจากทั้งเรียงผิดและ提示 พูลเดียวกัน (ข้อ3.6) ถึง 0 = ตาย
  var sentenceFailed = false;
  var sentenceGolden = false;     // ประโยคนี้เป็นคำทองไหม (สุ่มตอนโหลดประโยค)
  var curSentenceIsKnownCheck = false; // กำลังอยู่ในด่านพิสูจน์ "已記得" ของประโยคนี้ไหม (ข้อ10)

  function curSentence(){ return ADV_SENTENCES[SET[idx]]; }

  // เพิ่ม 2026-07-17: ปุ่มฟังเสียงประโยค — เรียกโชว์เฉพาะตอนเฉลยคำตอบแล้ว (กันสปอยล์)
  // Lin 2026-07-30: เดิมประโยคที่ยังไม่มีไฟล์เสียง (ปิดไว้ 8 จาก 30) "ซ่อนปุ่มทิ้งไปเลย" → Lin เห็นปุ่มหายๆ โผล่ๆ นึกว่าเสีย
  //   แก้เป็นมาตรฐานเดียวกับเกมอ่าน/เกมพิมพ์: โชว์ปุ่มเสมอ · กดแล้วยังไม่มีเสียง → ขึ้นข้อความ「即將推出」ไม่เงียบหาย
  function woShowSound(sentenceTh){
    var btn = document.getElementById('wo-sound-btn');
    if (!btn) return;
    btn.style.display = '';
    btn.onclick = function(e){
      e.stopPropagation();
      try{ if(window.gtag) gtag('event','word_order_audio_play',{category:'game', sentence: sentenceTh}); }catch(e2){}
      if (window.WordAudio && WordAudio.has(sentenceTh)) WordAudio.play(sentenceTh, btn);
      else if (window.WordAudio && WordAudio.soonToast) WordAudio.soonToast();
    };
  }
  function woHideSound(){
    var btn = document.getElementById('wo-sound-btn');
    if (btn) { btn.style.display = 'none'; btn.onclick = null; }
    var row = document.getElementById('wo-reveal-ctl'); if (row) row.style.display = 'none';
    var zh = document.getElementById('wo-zh'); if (zh) zh.innerHTML = '';
    var vs = document.getElementById('wo-vault-btn-slot'); if (vs) vs.innerHTML = ''; // ล้างปุ่ม 🔖 ของประโยคก่อนหน้า (Lin 2026-07-30)
  }

  // ════════════════════════════════════════════════════════════
  // ── ปุ่ม/ข้อมูลใต้คำที่เฉลย + คำอ่านติดไทล์คำ — Lin 2026-07-25
  // ════════════════════════════════════════════════════════════
  // คำอ่านรายคำ: readingTH ของประโยคเป็น "รายพยางค์" คั่นด้วย '-' → หั่นแบ่งให้แต่ละคำตามจำนวน syls ของคำนั้น
  // ถ้าจำนวนพยางค์ไม่ตรงกัน (ข้อมูลผิด) → fallback เป็นตัวเขียนของคำเอง ไม่เดา
  var _woReadCache = null, _woReadCacheTh = '';
  function woWordReads(s){
    if (!s) return [];
    if (_woReadCacheTh === s.th && _woReadCache) return _woReadCache;
    var parts = String(s.readingTH || '').split('-');
    var total = 0;
    s.words.forEach(function(w){ total += (w.syls && w.syls.length) || 1; });
    var ok = (parts.length === total);
    var out = [], p = 0;
    s.words.forEach(function(w){
      var n = (w.syls && w.syls.length) || 1;
      var thRead = ok ? parts.slice(p, p + n).join('-') : w.th;
      var enRead = (w.syls || []).map(function(sy){ return sy.en || ''; }).filter(Boolean).join('-');
      out.push({ th: thRead || w.th, en: enRead });
      p += n;
    });
    _woReadCacheTh = s.th; _woReadCache = out;
    return out;
  }

  // สวิตช์คำอ่าน — ใช้คีย์เดียวกับเกมอื่น (rg_pron_mode / rg_en_mode) ตั้งครั้งเดียวเหมือนกันทุกเกม
  var woPronMode = (function(){ try { return localStorage.getItem('rg_pron_mode') === '1'; } catch(e){ return false; } })();
  var woEnMode   = (function(){ try { return localStorage.getItem('rg_en_mode')   === '1'; } catch(e){ return false; } })();
  // Lin 2026-07-30: สวิตช์คำแปลจีนรายคำ (ใต้กล่องทุกคำ เหมือน 英文讀音) — ใช้คีย์เดียวกับปุ่ม 🍙 ของเกมอื่น (games_hide_zh)
  //   ตั้งครั้งเดียวเหมือนกันทุกเกม · ค่าเริ่มต้น = โชว์ (เหมือนเกมอื่น: ไม่มีคีย์ = ไม่ซ่อน)
  var woZhWordOn = (function(){ try { return localStorage.getItem('games_hide_zh') !== '1'; } catch(e){ return true; } })();
  function woSyncReadBtns(){
    var b1 = document.getElementById('rg-pron-toggle');
    if (b1) {
      b1.textContent = woPronMode ? '🐣' : '🥚';
      b1.title = woPronMode ? '目前：讀音已顯示（跟著詞塊一起移動）' : '目前：讀音已隱藏（點擊顯示）';
      b1.setAttribute('aria-label', b1.title);
    }
    var b2 = document.getElementById('rg-en-toggle');
    if (b2) {
      b2.textContent = woEnMode ? '🔡' : '🔠';
      b2.title = woEnMode ? '目前：英文讀音已顯示（跟著詞塊一起移動）' : '目前：英文讀音已隱藏（點擊顯示）';
      b2.setAttribute('aria-label', b2.title);
    }
    var b3 = document.getElementById('wo-zh-word-toggle');
    if (b3) {
      b3.textContent = woZhWordOn ? '🍙' : '🌾';
      // Lin 2026-08-10 (Shared Game UI Phase B3): เดิม title ใช้คำว่า "翻譯" เฉยๆ ซ้ำกับปุ่ม #wo-zh-toggle (แปลทั้งประโยค)
      // ผู้เล่นแยกไม่ออกว่า 2 ปุ่มนี้คุมคนละอย่าง — เปลี่ยนข้อความให้ชัดว่านี่คือ "รายคำ" (ไม่แตะ logic/state เดิมเลย)
      b3.title = woZhWordOn ? '目前：逐字翻譯已顯示（跟著詞塊一起移動）' : '目前：逐字翻譯已隱藏（點擊顯示）';
      b3.setAttribute('aria-label', b3.title);
    }
  }
  // HTML คำอ่าน+คำแปลที่แปะใต้คำแต่ละคำ (ใช้ทั้งไทล์ในกองและช่องที่วางแล้ว → เลื่อนตามคำเสมอ)
  function woReadHtml(wordIndex){
    if (!woPronMode && !woEnMode && !woZhWordOn) return '';
    var s = curSentence();
    var r = woWordReads(s)[wordIndex];
    if (!r) return '';
    var h = '';
    // Lin 2026-07-30: 讀音 โชว์ทุกคำเสมอ (เดิมซ่อนคำที่อ่านตรงกับตัวเขียน — ยกเลิกแล้วตามที่ Lin สั่ง)
    if (woPronMode && r.th) h += '<div class="wo-read-th">' + r.th + '</div>';
    if (woEnMode   && r.en) h += '<div class="wo-read-en">' + r.en + '</div>';
    // Lin 2026-07-30: คำแปลจีนรายคำ — โชว์ได้ตั้งแต่ยังไม่ตอบ (Lin ยืนยัน ไม่ถือเป็นสปอยล์)
    var wz = (s.words[wordIndex] && s.words[wordIndex].zh) || '';
    if (woZhWordOn && wz) h += '<div class="wo-read-zh">' + wz + '</div>';
    return h;
  }
  function woRepaintWords(){
    var s = curSentence();
    if (!s) return;
    renderSlots(s); renderBank();
  }
  window.woTogglePron = function(){
    woPronMode = !woPronMode;
    try { localStorage.setItem('rg_pron_mode', woPronMode ? '1' : '0'); } catch(e){}
    woSyncReadBtns(); woRepaintWords();
    if (window.WordMenu && window.WordMenu.refresh) window.WordMenu.refresh();
  };
  window.woToggleEn = function(){
    woEnMode = !woEnMode;
    try { localStorage.setItem('rg_en_mode', woEnMode ? '1' : '0'); } catch(e){}
    woSyncReadBtns(); woRepaintWords();
    if (window.WordMenu && window.WordMenu.refresh) window.WordMenu.refresh();
  };
  // Lin 2026-07-30: สลับคำแปลจีนรายคำ (แถว 翻譯 ในเมนู 🍚)
  window.woToggleZhWord = function(){
    woZhWordOn = !woZhWordOn;
    try { localStorage.setItem('games_hide_zh', woZhWordOn ? '0' : '1'); } catch(e){}
    woSyncReadBtns(); woRepaintWords();
    if (window.WordMenu && window.WordMenu.refresh) window.WordMenu.refresh();
  };

  // ── ปุ่มครับ/ค่ะ/คะ ท้ายประโยค (Lin 2026-08-01) ──
  //   เกมนี้ไม่ใช่คำที่ต้องลากเรียงเลย — ต่อท้ายอัตโนมัติ "หลังเรียงประโยคหลักถูกแล้วเท่านั้น" (หรือกดยอมแพ้/ตายแล้วเฉลย ก็นับว่า "เห็นคำตอบสมบูรณ์" เหมือนกัน)
  //   ใช้ localStorage key เดียวกับเกมเสียง/เกมอ่าน/เกมพิมพ์ (games_particle_mode) ให้ค่าติดกันข้ามเกม
  var woParticleMode = (function(){ try { return localStorage.getItem('games_particle_mode') || 'off'; } catch(e){ return 'off'; } })();
  var woSentenceRevealed = false; // true เมื่อเรียงถูก/ตายแล้วเฉลย — ใช้คุมว่าจะโชว์บรรทัดครับ/ค่ะ/คะ ไหม
  function woShowParticleFor(s){
    if (!s) return null;
    if (woParticleMode === 'm') return 'ครับ'; // ชายใช้ครับได้ทุกประโยคเหมือนกันหมด ไม่ต้องมีข้อมูลเพิ่ม
    if (woParticleMode === 'f') return s.politeF || 'ครับ'; // ไม่มี politeF (ประโยคขึ้นด้วยผม) → บังคับครับต่อ เหมือนเกมอื่น
    return null;
  }
  function woSyncParticleBtn(){
    var b = document.getElementById('rg-particle-toggle');
    if (!b) return;
    b.setAttribute('data-mode', woParticleMode);
    b.title = woParticleMode === 'm' ? '目前：句尾加「ครับ」（男生禮貌詞・排對後才會出現）' : (woParticleMode === 'f' ? '目前：句尾加「ค่ะ/คะ」（女生禮貌詞・排對後才會出現）' : '目前：不加句尾禮貌詞');
    b.setAttribute('aria-label', b.title);
  }
  function woRenderParticleLine(){
    var el = document.getElementById('wo-particle-line');
    if (!el) return;
    if (!woSentenceRevealed) { el.style.display = 'none'; el.textContent = ''; return; }
    var s = curSentence();
    var p = woShowParticleFor(s);
    if (p) { el.textContent = s.th + p; el.style.display = 'block'; }
    else { el.style.display = 'none'; el.textContent = ''; }
  }
  window.woToggleParticleMode = function(){
    woParticleMode = (woParticleMode === 'off') ? 'm' : (woParticleMode === 'm' ? 'f' : 'off');
    try { localStorage.setItem('games_particle_mode', woParticleMode); } catch(e){}
    woSyncParticleBtn();
    woRenderParticleLine();
    if (window.WordMenu && window.WordMenu.refresh) window.WordMenu.refresh();
  };

  // ── คำแปลจีนตอนเฉลย: เป็นสวิตช์ 🍙/🌾 อยู่ "ใต้คำที่เฉลย" (ไม่ได้อยู่ในเมนูมุมขวาล่าง) — Lin 2026-07-25 ──
  var woZhOn = (function(){ try { var v = localStorage.getItem('wo_zh_on'); return v === null ? true : v === '1'; } catch(e){ return true; } })();
  function woRenderZh(){
    var zh = document.getElementById('wo-zh');
    var s = curSentence();
    if (zh) zh.innerHTML = (woZhOn && s) ? ('中文：<b>' + s.zh + '</b>') : '';
    var b = document.getElementById('wo-zh-toggle');
    if (b) {
      b.textContent = woZhOn ? '🍙' : '🌾';
      // Lin 2026-08-10 (Shared Game UI Phase B3): เดิม title ใช้คำว่า "翻譯" เฉยๆ ซ้ำกับปุ่ม #wo-zh-word-toggle (แปลรายคำ)
      // ผู้เล่นแยกไม่ออกว่า 2 ปุ่มนี้คุมคนละอย่าง — เปลี่ยนข้อความให้ชัดว่านี่คือ "ทั้งประโยค" (ไม่แตะ logic/state เดิมเลย)
      b.title = woZhOn ? '目前：整句翻譯已開啟（點擊關閉）' : '目前：整句翻譯已關閉（點擊開啟）';
      b.setAttribute('aria-label', b.title);
    }
  }
  window.woToggleZh = function(){
    woZhOn = !woZhOn;
    try { localStorage.setItem('wo_zh_on', woZhOn ? '1' : '0'); } catch(e){}
    woRenderZh();
  };

  // D2 (Shared Game UI, 2026-08-10): ปุ่ม [ 查看詳細解說 ] opt-in ครอบตาราง "每個字的意思" ใน #wo-reveal
  //   ก็อปแพทเทิร์นจาก tone-finder-game.js toggleAnswerDetail — ไม่แตะข้อมูล/การคำนวณใดๆ แค่ show/hide DOM ที่ checkAnswer() สร้างไว้แล้ว
  window.woToggleDetail = function(btn){
    if (!btn) return;
    var box = btn.nextElementSibling;
    if (!box) return;
    var isOpen = box.style.display !== 'none';
    box.style.display = isOpen ? 'none' : '';
    btn.textContent = isOpen ? '查看詳細解說' : '收起詳細解說';
  };
  // Phase 1 2026-08-14: ประโยคแยกบ้านไป 我的句子 (10 รายการ) ไม่ปน 我的單字.
  function woShowVault(){
    var slot = document.getElementById('wo-vault-btn-slot');
    if (!slot || !window.SentenceVault) return;
    var s = curSentence();
    if (!s) { slot.innerHTML = ''; return; }
    WordVault.injectStyles();
    slot.innerHTML = ''; // ล้างปุ่มของประโยคก่อนหน้าเสมอ กันปุ่มค้าง
    var romanization = woWordReads(s).map(function (row) { return row.en; }).filter(Boolean).join(' ');
    slot.appendChild(SentenceVault.createSaveBtn(s.th, {
      zh: s.zh || '', readingTH: s.readingTH || '', en: romanization, source: 'word-order'
    }, {
      onSave: function(){ try{ gtag('event','word_order_vault_save',{category:'game', sentence: s.th}); }catch(e){} },
      onRemove: function(){ try{ gtag('event','word_order_vault_remove',{category:'game', sentence: s.th}); }catch(e){} }
    }));
  }
  // เรียกตอนเฉลยทุกทาง: โชว์แถวปุ่ม (🔊 + 🍙 + 🔖) ใต้คำที่เฉลย + คำแปลตามสวิตช์
  function woRevealExtras(sentenceTh){
    var row = document.getElementById('wo-reveal-ctl'); if (row) row.style.display = 'flex';
    woShowSound(sentenceTh);
    woRenderZh();
    woShowVault();
  }

  // ── 共用進度系統的這局統計：只在 finish() 時彙整一次，跟其他遊戲的「一輪結束才結算」邏輯一致 ──
  var cleanC = 0;      // 這局「乾淨」過關的句數（沒放錯過、也沒用提示）
  var curCombo = 0;     // 目前連續乾淨過關的句數
  var maxCombo = 0;     // 這局最高連續乾淨過關數
  var totalStars = 0;   // 帳號累積星星（跨遊戲共用）
  var totalBadges = 0;  // 帳號累積勳章數（跨遊戲共用）
  var roundLog = []; // {th,zh,userAnswer,correctAnswer,wrong,...} ต่อประโยค
  var lastSubmittedAnswer = '';
  var submittedAttempts = [];
  var roundReport = null;
  function woReportRows(){
    if(!roundReport||!roundReport.items)return [];
    return roundReport.items.map(function(i){return {th:i.question,wordsArr:i.words.map(function(w){return w.th;}),wordGlosses:i.words,zh:i.meaning,userAnswer:i.user_answer,correctAnswer:i.correct_answer,wrong:i.wrong_count,failed:!i.is_correct,guide:!!i.hint_used,pts:i.item_score,srsDue:i.srs_state||'',mastered:!!i.mastered_state,attempts:i.attempts};});
  }
  function woLogSentence(o){
    try{
      var s = curSentence();
      // wordsArr: รายคำ (s.words[].th) ใช้ตอนทำ PDF เท่านั้น — ใส่จุดตัดคำที่มองไม่เห็น (ZWSP) ระหว่างคำ
      // กันประโยคยาวไม่มีเว้นวรรค (เขียนไทยจริงไม่เว้นวรรคระหว่างคำ) ตกขอบหน้ากระดาษ/ถูกตัดกลางคำ — Lin 2026-07-31
      var wordsArr = (s && s.words && s.words.length) ? s.words.map(function(w){return w.th;}) : null;
      var wordGlosses = (s && s.words && s.words.length) ? s.words.map(function(w){return {th:w.th||'', zh:w.zh||''};}) : null;
      var base = {th:s?s.th:'', wordsArr:wordsArr, wordGlosses:wordGlosses, zh:s?s.zh:'', userAnswer:lastSubmittedAnswer||'', correctAnswer:s&&s.words?s.words.map(function(w){return w.th;}).join(' '):(s?s.th:''), wrong:(typeof wrongCount!=='undefined'?wrongCount:0), attempts:submittedAttempts.slice(), failed:false, guide:false, pts:0, srsDue:'', mastered:false};
      for (var k in o) { if (Object.prototype.hasOwnProperty.call(o,k)) base[k] = o[k]; }
      roundLog.push(base);
      if(roundReport&&window.RoundReport)RoundReport.addItem(roundReport,{content_ref:{source:'game_sentences',key:base.th},question:base.th,meaning:base.zh,attempts:base.attempts,user_answer:base.userAnswer,correct_answer:base.correctAnswer,is_correct:!base.failed&&!base.guide&&base.wrong===0,wrong_count:base.wrong,item_score:base.pts,hint_used:!!base.guide,words:wordGlosses||[],srs_state:base.srsDue||null,mastered_state:!!base.mastered});
    } catch(e){}
  }
  // 2026-07-13 Lin：ดึงประโยคที่พลาดในรอบนี้จาก roundLog ไปเก็บลง reading_sessions.wrong_items (ฐานข้อมูลจุดอ่อน)
  function rgWrongItemsFromLog(){
    try{ return roundLog.filter(function(w){return (w.wrong||0)>0||w.failed;}).map(function(w){return {th:w.th,zh:w.zh,wrong:w.wrong||0};}); }
    catch(e){ return []; }
  }

  // ════════════════════════════════════════════════════════════
  // F2 (Shared Game UI, 2026-08-10): 查看錯題 — read-only, ดึงจาก roundLog จริงเท่านั้น (ตัวกรองเดียวกับ rgWrongItemsFromLog)
  // ════════════════════════════════════════════════════════════
  window.woShowMistakes = function(){
    try{ if(window.gtag) gtag('event','word_order_mistakes_open',{category:'game'}); }catch(e){}
    var items = woReportRows();
    var list = document.getElementById('wo-mistake-list');
    if (list) {
      list.innerHTML = items.length
        ? items.map(function(w){
            return '<div class="gsh-mistake-item'+(((w.wrong||0)>0||w.failed)?' gsh-mistake-wrong':'')+'">'
              + '<div class="gsh-mistake-q">' + woEsc(w.th) + '</div>'
              + '<div class="gsh-mistake-row">' + woEsc(w.zh) + '</div>'
              + '<div class="gsh-mistake-row">你的作答：<b>' + woEsc(w.userAnswer) + '</b></div>'
              + '<div class="gsh-mistake-row">正確答案：<b>' + woEsc(w.correctAnswer) + '</b></div>'
              + '<div class="gsh-mistake-row">狀態：<b>' + (((w.wrong||0)>0||w.failed)?'✗ 需要複習':'✓ 答對') + '</b></div>'
              + '<div class="gsh-mistake-row">排錯 <b>' + (w.wrong||0) + '</b> 次' + (w.failed ? '・這句沒排出來，直接看了答案' : '') + '</div>'
              + '</div>';
          }).join('')
        : '<div class="gsh-mistake-item" style="text-align:center;color:#888;">這輪沒有排錯的句子，太棒了！🎉</div>';
    }
    var norm = document.getElementById('wo-end-normal'); if (norm) norm.style.display = 'none';
    var mv = document.getElementById('wo-mistake-view'); if (mv) mv.style.display = 'block';
  };
  window.woHideMistakes = function(){
    try{ if(window.gtag) gtag('event','word_order_mistakes_close',{category:'game'}); }catch(e){}
    var norm = document.getElementById('wo-end-normal'); if (norm) norm.style.display = 'flex';
    var mv = document.getElementById('wo-mistake-view'); if (mv) mv.style.display = 'none';
  };

  // เล็กๆ ใช้ escape HTML ก่อนแปะข้อความประโยค/คำแปลลง DOM (เนื้อหามาจาก adv-sentences.js ที่ Lin ตรวจแล้ว แต่ escape ไว้กันเหนียว)
  function woEsc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  // ════════════════════════════════════════════════════════════
  // E3 (Shared Game UI, 2026-08-10): guest-resume — บันทึกความคืบหน้าไว้ให้กลับมาเล่นต่อได้
  //   ใช้ window.GameResume (js/core/shared.js) เก็บใน localStorage ฝั่งเครื่องนี้เท่านั้น ไม่ sync ข้ามเครื่อง/เซิร์ฟเวอร์
  //   บันทึกทุกครั้งที่ "ประโยคหนึ่งจบลง" (ตอบถูก/ตาย/ผ่านด่านพิสูจน์已記得) — อ่านค่าที่มีอยู่แล้วไปเก็บ ไม่แตะ life/hint/scoring เลย
  //   ข้าม practiceMode (ทบทวนฟรีไม่คิดคะแนน ไม่มีอะไรน่าเสียดายถ้าปิดแท็บกลางคัน)
  // ════════════════════════════════════════════════════════════
  function woSaveResume(completedCurrent){
    try{
      if (practiceMode || !window.GameResume || !SET.length) return;
      if (idx >= SET.length) return; // จบรอบแล้ว ไม่ต้อง save (finish() จะ clear เอง)
      GameResume.save('word-order', {
        sentenceIds: SET.map(function(i){ return ADV_SENTENCES[i].th; }),
        idx: idx,
        completedCurrent: !!completedCurrent,
        score: score,
        correctFirstTry: correctFirstTry,
        cleanC: cleanC,
        curCombo: curCombo,
        maxCombo: maxCombo,
        roundLog: roundLog,
        report: roundReport && window.RoundReport ? RoundReport.snapshot(roundReport) : null
      });
    }catch(e){}
  }
  function woClearResume(){
    try{ if (window.GameResume) GameResume.clear('word-order'); }catch(e){}
  }
  function woResumeCompletedCurrent(state, currentTh){
    if(!state||!currentTh)return false;
    if(state.completedCurrent===true)return true;
    // Backward compatibility for snapshots written before completedCurrent existed.
    var items=state.report&&Array.isArray(state.report.items)?state.report.items:[];
    var lastItem=items.length?items[items.length-1]:null;
    if(lastItem&&lastItem.content_ref&&lastItem.content_ref.key===currentTh)return true;
    var log=Array.isArray(state.roundLog)?state.roundLog:[];
    var lastLog=log.length?log[log.length-1]:null;
    return !!(lastLog&&lastLog.th===currentTh);
  }

  function shuffle(arr){
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  // ════════════════════════════════════════════════════════════
  // 勳章（跟聲調／拼讀／打字遊戲同一套「種樹」造型，資料來自 GAME_ACCOUNT 累積星星）
  // ════════════════════════════════════════════════════════════
  var BADGE_STAGES=[
    {min:0,emoji:'🌱',label:'種下第一棵樹'},
    {min:1,emoji:'🌿',label:'開始成長了！'},
    {min:2,emoji:'🌲',label:'茁壯成長中'},
    {min:4,emoji:'🌴',label:'長成棕櫚樹！'},
    {min:6,emoji:'🌸',label:'盛開中！🌸'},
    {min:9,emoji:'🌻',label:'向陽生長！'},
    {min:12,emoji:'🌈',label:'彩虹般的成就！'},
    {min:16,emoji:'🏆',label:'泰語拼讀大師！'},
    {min:20,emoji:'💎',label:'鑽石等級！'},
    {min:30,emoji:'👑',label:'泰語之王！'}
  ];
  function badgeEmoji(n){var e='🌱';BADGE_STAGES.forEach(function(s){if(n>=s.min)e=s.emoji;});return e;}
  // Lin 2026-07-25: ⭐ ปุ่มดาว แยกออกจากปุ่ม勳章(openBadge) — โชว์แค่จำนวนดาวสะสม ไม่มีตารางแบดจ์
  window.openStar = function(){
    var s=(window.GAME_ACCOUNT)?GAME_ACCOUNT.getStars():totalStars;
    document.getElementById('star-tree-area').textContent='⭐ '+s;
    document.getElementById('star-tree-caption').textContent='累積星星（全部遊戲共用）';
    document.getElementById('star-modal').classList.add('show');
  };
  window.openBadge = function(){
    var s=(window.GAME_ACCOUNT)?GAME_ACCOUNT.getStars():totalStars;
    var badges=(window.GAME_ACCOUNT)?GAME_ACCOUNT.starBadges:[];
    var html='<div style="display:flex;flex-wrap:wrap;gap:10px;justify-content:center;margin-top:6px;">';
    badges.forEach(function(b){
      var got=s>=b.at;
      html+='<div style="text-align:center;width:74px;opacity:'+(got?'1':'0.35')+';">'+
        '<img src="'+b.img+'" alt="'+b.zh+'" style="width:44px;height:44px;object-fit:contain;" onerror="this.replaceWith(document.createTextNode(\''+b.emoji+'\'))">'+
        '<div style="font-size:11px;color:#5a3e10;margin-top:2px;">'+b.zh+'</div>'+
        '<div style="font-size:10px;color:#a08050;">'+(got?'已解鎖':b.at+' 顆星')+'</div></div>';
    });
    html+='</div>';
    document.getElementById('star-prog').innerHTML=html;
    var next=badges.filter(function(b){return s<b.at;})[0];
    document.getElementById('star-prog-label').textContent=next?('再 '+(next.at-s)+' 顆星解鎖「'+next.zh+'」'):'全部稻米品種已解鎖！🎉';
    document.getElementById('badge-modal').classList.add('show');
  };

  function refreshUI(){
    var sc=document.getElementById('star-count'); if(sc) sc.textContent=totalStars;
    var bc=document.getElementById('badge-count'); if(bc) bc.textContent=totalBadges;
    var be=document.getElementById('badge-emoji'); if(be) be.textContent=badgeEmoji(totalBadges);
  }

  // ════════════════════════════════════════════════════════════
  // 每週挑戰 + 連續天數／護盾（streak/freeze 用同一把 key，
  // 跟聲調・拼讀・打字遊戲共用 → 練哪個遊戲都算連續天數）
  // ════════════════════════════════════════════════════════════
  var TF_STREAK_KEY = 'tf_streak_v1';   // 跟其他遊戲共用同一個 key
  var RG_GAME_CFG = { DAILY_GOAL_SETS: 3, STREAK_FREEZE_EARN_EVERY: 7, STREAK_FREEZE_MAX: 2 };
  var RG_CHALLENGES = [
    { id:'wo_correct30', title:'排對 30 句',     sub:'本週累積排對 30 句（第一次就對）', type:'correct', target:30, emoji:'🎯' },
    { id:'wo_sets5',     title:'玩完 5 組',       sub:'本週完成 5 組語序練習室',            type:'sets',    target:5,  emoji:'📚' },
    { id:'wo_perfect3',  title:'3 次完美過關',   sub:'本週完美過關（10 句全對不用提示）3 次', type:'perfect', target:3, emoji:'🌟' },
    { id:'wo_combo5',    title:'連續排對 5 句',  sub:'本週連續一次就排對達 5 句',        type:'combo',   target:5,  emoji:'🔥' },
    { id:'wo_correct60', title:'排對 60 句',     sub:'本週累積排對 60 句（第一次就對）', type:'correct', target:60, emoji:'💪' }
  ];
  var RG_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
  function rgWeekIndex() { return Math.floor(Date.now() / RG_WEEK_MS); }
  function rgWeekEndMs() { return (rgWeekIndex() + 1) * RG_WEEK_MS; }
  function rgActiveChallenge() { return RG_CHALLENGES[rgWeekIndex() % RG_CHALLENGES.length]; }
  var RG_CH_KEY = 'wo_challenge_v1';   // 這個遊戲自己的每週挑戰進度（跟其他遊戲分開算）
  function rgLoadChallenge() { try { return JSON.parse(localStorage.getItem(RG_CH_KEY) || '{}') || {}; } catch(e) { return {}; } }
  function rgChallengeState() {
    var ch = rgActiveChallenge(), wk = rgWeekIndex(), saved = rgLoadChallenge();
    if (saved.week !== wk || saved.id !== ch.id) saved = { week: wk, id: ch.id, progress: 0, done: false };
    return { ch: ch, st: saved };
  }
  function rgSaveChallenge(st) { try { localStorage.setItem(RG_CH_KEY, JSON.stringify(st)); } catch(e) {} }

  function rgLoadStreak() { try { return JSON.parse(localStorage.getItem(TF_STREAK_KEY) || '{}') || {}; } catch(e) { return {}; } }
  function rgSaveStreak(s) { try { localStorage.setItem(TF_STREAK_KEY, JSON.stringify(s)); } catch(e) {} }
  function rgTodayStr() { var d = new Date(); return d.getFullYear() + '-' + ('0'+(d.getMonth()+1)).slice(-2) + '-' + ('0'+d.getDate()).slice(-2); }
  function rgApplyStreak() {
    if(!woLoggedIn())return {state:{streak:0,freezes:0,setsToday:0},events:{goalMetToday:false,freezeUsed:false,freezeEarned:0}};
    var s = rgLoadStreak(), cfg = RG_GAME_CFG, today = rgTodayStr();
    var yest = (function(){ var d=new Date(); d.setDate(d.getDate()-1); return d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2); })();
    s.setsToday = (s.lastPlay === today) ? ((s.setsToday || 0) + 1) : 1;
    var goalMet = s.setsToday >= cfg.DAILY_GOAL_SETS;
    var streakEv = { goalMetToday: goalMet, freezeUsed: false, freezeEarned: 0 };
    if (s.lastPlay !== today) {
      if (s.lastPlay === yest) { s.streak = (s.streak || 0) + 1; }
      else if (s.lastPlay && (s.freezes || 0) > 0) { s.freezes -= 1; s.streak = (s.streak || 0) + 1; streakEv.freezeUsed = true; }
      else { s.streak = 1; }
      if (cfg.STREAK_FREEZE_EARN_EVERY > 0 && s.streak % cfg.STREAK_FREEZE_EARN_EVERY === 0 && (s.freezes || 0) < cfg.STREAK_FREEZE_MAX) {
        s.freezes = (s.freezes || 0) + 1; streakEv.freezeEarned = 1;
      }
      s.lastPlay = today;
    }
    rgSaveStreak(s);
    return { state: s, events: streakEv };
  }
  function rgChallengeBump(maxComboArg, isPerfect) {
    var pack = rgChallengeState(), ch = pack.ch, st = pack.st;
    if (st.done) { rgSaveChallenge(st); return; }
    var add = 0;
    if (ch.type === 'correct') add = cleanC;
    else if (ch.type === 'sets') add = 1;
    else if (ch.type === 'perfect') add = isPerfect ? 1 : 0;
    else if (ch.type === 'combo') add = (maxComboArg || 0) >= ch.target ? ch.target : 0;
    if (ch.type === 'combo') st.progress = Math.max(st.progress, add);
    else st.progress += add;
    if (st.progress >= ch.target && !st.done) {
      st.done = true;
      rgToast('🎉 完成本週挑戰：' + ch.title + '！');
    }
    rgSaveChallenge(st);
  }
  function rgRenderGameBar() {
    try { woRenderLoginCTA(); } catch(e){}
    var cp = rgChallengeState(), st = rgLoadStreak();
    var pct = Math.min(100, Math.round(cp.st.progress / cp.ch.target * 100));
    var daysLeft = Math.max(0, Math.ceil((rgWeekEndMs() - Date.now()) / 86400000));
    var alive = st.streak > 0 && (st.lastPlay === rgTodayStr() || (function(){ var d=new Date(); d.setDate(d.getDate()-1); return d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2); })() === st.lastPlay);
    var ban = document.getElementById('rg-challenge-banner');
    if (ban) ban.innerHTML =
      '<div class="tf-challenge-banner' + (cp.st.done ? ' done' : '') + '">' +
        '<div class="tf-ch-top">' +
          '<span class="tf-ch-emoji">' + cp.ch.emoji + '</span>' +
          '<span class="tf-ch-title">本週挑戰：' + cp.ch.title + (cp.st.done ? ' ✅ 完成！' : '') + '</span>' +
          '<span class="tf-ch-left">⏳ ' + daysLeft + ' 天</span>' +
        '</div>' +
        '<div class="tf-ch-bar"><div class="tf-ch-fill" style="width:' + pct + '%;"></div></div>' +
        '<div class="tf-ch-sub">' + cp.ch.sub + '　' + cp.st.progress + ' / ' + cp.ch.target + '</div>' +
      '</div>';
    var sn = document.getElementById('rg-streak-num'); if (sn) sn.textContent = (alive ? (st.streak || 0) : 0);
    var fn = document.getElementById('rg-freeze-num'); if (fn) fn.textContent = (st.freezes || 0);
  }
  var _rgToastQueue = []; var _rgToastBusy = false; // กันข้อความ toast ทับ/แย่งกันแสดง — Lin 2026-07-12
  function rgToast(msg) {
    _rgToastQueue.push(msg);
    _rgProcessToastQueue();
  }
  function _rgProcessToastQueue() {
    if (_rgToastBusy || !_rgToastQueue.length) return;
    _rgToastBusy = true;
    var msg = _rgToastQueue.shift();
    try {
      var old = document.getElementById('rg-toast-el'); if (old) old.remove();
      var d = document.createElement('div');
      d.id = 'rg-toast-el'; d.className = 'rg-toast';
      d.textContent = msg;
      document.body.appendChild(d);
      requestAnimationFrame(function(){ d.classList.add('show'); });
      setTimeout(function(){ d.classList.remove('show'); setTimeout(function(){ if (d.parentNode) d.parentNode.removeChild(d); _rgToastBusy = false; setTimeout(_rgProcessToastQueue, 150); }, 350); }, 2800);
    } catch(e) { _rgToastBusy = false; }
  }

  // ── น้องมีนา 米娜: บทพูด + ป๊อปพูดสด (โทนจีนไต้หวันอุ่นๆ ไกด์อ่อนโยน) — Lin 2026-07-10 ──
  var MINA_EMOJI='👧🏻';
  var MINA_LINES={
    welcome:['哈囉～我是米娜 🌾 我們一起把泰文語序變厲害，好不好？','嗨嗨～我是米娜，今天也一起慢慢排句子吧 😊'],
    correct:['哇～排對了，你做得很好 ✨','對了對了！語序就是這樣 🌾','很好喔～你越來越有語感了 😊'],
    combo:['哇～連續排對，米娜都替你開心 🔥','停不下來了，好厲害 ⚡'],
    golden:['這句…閃閃發光的！米娜找到黃金稻穗了 🌾✨ 分數加倍！'],
    wrong:['沒關係的…這句米娜以前也排錯過，我們再看一次好嗎？','再試一次就好，米娜陪你 💛','慢慢來，先想想第一個詞是哪個 🌱'],
    perfect:['全部一次就排對！你比自己想的還厲害喔 🌾 米娜給你拍拍手 👏','一題都沒錯～好棒，米娜好開心 ✨'],
    greatSet:['這組排得很棒，我們慢慢繼續 💪','排得很好呢～要再一組看看嗎？🌱'],
    goodSet:['完成囉！每天一點點，語序會越來越順 🌱','辛苦了～有練就有進步喔 😊'],
    goalMet:['今天也做到了呢，好棒 🌙 連續第 {n} 天！明天也要回來找米娜喔'],
    freezeUsed:['米娜幫你保住連續紀錄了～用掉 1 個護盾 🛡️'],
    comeback:['又見面啦～今天也一起排句子吧 😊','你回來了！米娜好想你 🌾'],
    streakWarn:['有點想你了…要不要回來陪米娜排句子一下呢 🌾']
  };
  function minaSay(key,vars){
    var t=MINA_LINES[key];
    if(Array.isArray(t))t=t[Math.floor(Math.random()*t.length)]||'';
    t=t||'';
    if(vars)Object.keys(vars).forEach(function(k){t=t.replace('{'+k+'}',vars[k]);});
    return t;
  }
  var _minaToastTimer=null;
  var _minaToastQueue=[]; var _minaToastBusy=false; // กันบทพูดน้องมีนาทับ/ตัดกันก่อนอ่านทัน — Lin 2026-07-12
  function minaToast(key,opts){
    opts=opts||{};
    if(opts.throttle && Math.random()>(opts.chance||0.34))return;
    var msg=minaSay(key,opts.vars); if(!msg)return;
    _minaToastQueue.push({msg:msg,dur:opts.dur||2600});
    _processMinaToastQueue();
  }
  function _processMinaToastQueue(){
    if(_minaToastBusy || !_minaToastQueue.length) return;
    _minaToastBusy=true;
    var item=_minaToastQueue.shift();
    try{
      var el=document.getElementById('mina-toast');
      if(!el){
        el=document.createElement('div'); el.id='mina-toast';
        el.style.cssText='position:fixed;left:14px;bottom:18px;z-index:10002;max-width:min(300px,78vw);display:flex;align-items:flex-end;gap:8px;pointer-events:none;opacity:0;transform:translateY(14px);transition:opacity .32s,transform .32s;';
        el.innerHTML='<div style="font-size:34px;line-height:1;flex-shrink:0;filter:drop-shadow(0 2px 4px rgba(0,0,0,.12));">'+MINA_EMOJI+'</div>'+
                     '<div class="mina-bubble" style="background:#FAF4E8;border:1.5px solid #F3E4C2;border-radius:14px;padding:9px 13px;font-family:\'Noto Sans TC\',sans-serif;font-size:13.5px;color:#5a4a2a;line-height:1.5;box-shadow:0 4px 14px rgba(139,99,16,.14);"></div>';
        document.body.appendChild(el);
      }
      el.querySelector('.mina-bubble').innerHTML=item.msg;
      void el.offsetWidth; el.style.opacity='1'; el.style.transform='translateY(0)';
      if(_minaToastTimer)clearTimeout(_minaToastTimer);
      _minaToastTimer=setTimeout(function(){
        el.style.opacity='0';el.style.transform='translateY(14px)';
        setTimeout(function(){_minaToastBusy=false; setTimeout(_processMinaToastQueue,220);},340);
      },item.dur);
    }catch(e){_minaToastBusy=false;}
  }

  // E3 (Shared Game UI, 2026-08-10): ล็อกอินหรือไม่ก็ตาม — GameResume เป็นแค่กันเหนียวฝั่งเครื่องนี้ (localStorage)
  //   กันปิดแท็บ/รีเฟรชกลางรอบแล้วต้องเริ่มใหม่ทั้งชุด · ไม่ใช่ระบบ resume ฝั่งเซิร์ฟเวอร์ (ยังไม่มี backend รองรับ)
  var _woPendingResume = null; // {state, restoredSet} — รอผู้เล่นเลือกตอนโชว์ .gsh-resume-banner
  function hideResumeBanner(){
    var b = document.getElementById('wo-resume-banner'); if (b) b.style.display = 'none';
  }
  function showResumeBanner(state, restoredSet){
    _woPendingResume = { state: state, restoredSet: restoredSet };
    var b = document.getElementById('wo-resume-banner');
    if (!b) { startFreshRound(); return; } // DOM ไม่พร้อม (ไม่ควรเกิด) → กันเงียบ เริ่มรอบใหม่แทนดีกว่าค้าง
    var savedIdx = Math.min(Math.max(0, state.idx||0), restoredSet.length-1);
    var savedSentence = ADV_SENTENCES[restoredSet[savedIdx]];
    if (woResumeCompletedCurrent(state, savedSentence&&savedSentence.th)) savedIdx++;
    var t = document.getElementById('wo-resume-title'); if (t) t.textContent = '上次的安全進度還在';
    var d = document.getElementById('wo-resume-detail');
    if (d) d.textContent = savedIdx>=restoredSet.length
      ? '遊戲：語序練習・本輪已完成・繼續查看結果'
      : '遊戲：語序練習・第 ' + (savedIdx+1) + '/' + restoredSet.length + ' 句・目前分數 ' + (state.score||0) + ' 分';
    var g = document.getElementById('game'); if (g) g.style.display = 'none';
    var e = document.getElementById('end'); if (e) e.style.display = 'none';
    b.style.display = '';
  }
  window.woResumeContinueClick = function(){
    if (!_woPendingResume) { hideResumeBanner(); startFreshRound(); return; }
    try{ if(window.gtag) gtag('event','word_order_resume_continue',{category:'game'}); }catch(e){}
    var p = _woPendingResume; _woPendingResume = null;
    woResumeContinue(p.state, p.restoredSet);
  };
  window.woResumeRestartSameClick = function(){
    if(!_woPendingResume){hideResumeBanner();startFreshRound();return;}
    var p=_woPendingResume;_woPendingResume=null;hideResumeBanner();woClearResume();
    SET=p.restoredSet;idx=0;score=0;correctFirstTry=0;cleanC=0;curCombo=0;maxCombo=0;roundLog=[];submittedAttempts=[];roundReport=window.RoundReport?RoundReport.create({game_type:'wordorder',difficulty:'高',mode:'sentence'}):null;practiceMode=false;
    document.getElementById('end').style.display='none';document.getElementById('game').style.display='flex';refreshUI();loadSentence();woSaveResume();
  };
  window.woResumeNewRoundClick = function(){
    try{ if(window.gtag) gtag('event','word_order_resume_restart',{category:'game'}); }catch(e){}
    _woPendingResume = null;
    woClearResume();
    startFreshRound();
  };
  window.woResumeRestartClick = window.woResumeNewRoundClick;
  function woResumeContinue(state, restoredSet){
    hideResumeBanner();
    SET = restoredSet;
    idx = Math.min(Math.max(0, state.idx||0), SET.length-1);
    score = state.score||0;
    correctFirstTry = state.correctFirstTry||0;
    cleanC = state.cleanC||0;
    curCombo = state.curCombo||0; maxCombo = state.maxCombo||0;
    roundLog = Array.isArray(state.roundLog)?state.roundLog:[];
    roundReport = window.RoundReport?RoundReport.restore(state.report,{game_type:'wordorder',difficulty:'高',mode:'sentence'}):null;
    practiceMode = false;
    var savedSentence = ADV_SENTENCES[SET[idx]];
    if (woResumeCompletedCurrent(state, savedSentence&&savedSentence.th)) idx++;
    if (window.GAME_ACCOUNT) { totalStars = GAME_ACCOUNT.getStars(); totalBadges = GAME_ACCOUNT.earnedBadges().length; }
    if (idx >= SET.length) { finish(); return; }
    refreshUI();
    try { rgRenderGameBar(); } catch(e){}
    document.getElementById('end').style.display = 'none';
    document.getElementById('game').style.display = 'flex';
    try{ if(window.gtag) gtag('event','game_start',{category:'game',game:'word_order',resumed:true}); }catch(e){}
    loadSentence();
  }

  function init(){
    if (!window.ADV_SENTENCES || !ADV_SENTENCES.length) {
      document.getElementById('game').innerHTML = '<p style="font-family:\'Noto Sans TC\',sans-serif;color:#c62828;">句庫載入失敗，請重新整理頁面。</p>';
      return;
    }
    woLoadSrs();
    woSyncReadBtns();   // Lin 2026-07-25: ตั้งไอคอนปุ่ม 讀音/英文讀音 ตามค่าที่จำไว้
    woRenderZh();       // ตั้งไอคอนปุ่ม 翻譯 (🍙/🌾) ใต้คำที่เฉลย

    var _resumeState = null;
    try{ _resumeState = window.GameResume ? GameResume.load('word-order') : null; }catch(e){ _resumeState = null; }
    if (_resumeState && _resumeState.sentenceIds && _resumeState.sentenceIds.length && typeof _resumeState.idx === 'number' && _resumeState.idx < _resumeState.sentenceIds.length) {
      var _restoredSet = _resumeState.sentenceIds.map(function(th){
        for (var i=0;i<ADV_SENTENCES.length;i++){ if (ADV_SENTENCES[i].th===th) return i; }
        return -1;
      });
      if (_restoredSet.indexOf(-1) === -1) {
        showResumeBanner(_resumeState, _restoredSet);
        return; // รอผู้เล่นเลือก 繼續練習/重新開始 ก่อน — ยังไม่เริ่มรอบใหม่ทับ
      }
      woClearResume(); // ประโยคที่บันทึกไว้หายไปจาก adv-sentences.js แล้ว (ผี) → ทิ้งไปเลย ไม่เดา
    }

    startFreshRound();
  }

  function startFreshRound(){
    hideResumeBanner();
    var now = Date.now();
    var allIdx = ADV_SENTENCES.map(function(_, i){ return i; });
    practiceMode = false;
    // Direct practice from 我的句子. Reuse the existing practice mode so this
    // entry does not invent score/SRS state or mutate a saved item's history.
    var requestedSentence = '';
    try {
      var match = location.search.match(/[?&]sentence=([^&]+)/);
      if (match) requestedSentence = decodeURIComponent(match[1]);
    } catch (e) {}
    if (requestedSentence) {
      var requestedIndex = -1;
      for (var ri = 0; ri < ADV_SENTENCES.length; ri++) {
        if (ADV_SENTENCES[ri].th === requestedSentence) { requestedIndex = ri; break; }
      }
      if (requestedIndex !== -1) {
        practiceMode = true;
        SET = [requestedIndex];
        idx = 0; score = 0; correctFirstTry = 0;
        cleanC = 0; curCombo = 0; maxCombo = 0;
        roundLog = [];
        roundReport = window.RoundReport?RoundReport.create({game_type:'wordorder',difficulty:'高',mode:'sentence'}):null;
        if (window.GAME_ACCOUNT) { totalStars = GAME_ACCOUNT.getStars(); totalBadges = GAME_ACCOUNT.earnedBadges().length; }
        refreshUI();
        try { rgRenderGameBar(); } catch (e) {}
        document.getElementById('end').style.display = 'none';
        document.getElementById('game').style.display = 'flex';
        loadSentence();
        return;
      }
    }
    var pool;
    var _srsAllocated = false;
    // งานที่7 (SRS): กรองด้วย stage-based SRS เฉพาะตอนล็อกอินเท่านั้น — ไม่ล็อกอิน = เล่นได้ทุกประโยค ไม่จำ (ข้อ0/ข้อ7)
    if (woLoggedIn()) {
      var _dueIdx = allIdx.filter(function(i){
        var rec = srsRecords[woSrsKey(ADV_SENTENCES[i].th)];
        return !!(rec && !rec.mastered && WO_SRS.isDue(rec, now));
      });
      var _regularIdx = allIdx.filter(function(i){ var rec=srsRecords[woSrsKey(ADV_SENTENCES[i].th)]; return !(rec&&rec.mastered)&&_dueIdx.indexOf(i)===-1; });
      if (window.GameFlow && GameFlow.allocateSrs && (_dueIdx.length || _regularIdx.length)) {
        pool = GameFlow.allocateSrs({tier:'free',total:Math.min(WO_ROUND_SIZE,_dueIdx.length+_regularIdx.length),due:shuffle(_dueIdx),regular:shuffle(_regularIdx),idOf:function(i){return woSrsKey(ADV_SENTENCES[i].th);},scope:'word-order'}).items;
        _srsAllocated = true;
      } else pool = _dueIdx.concat(_regularIdx);
      if (pool.length === 0) { practiceMode = true; pool = allIdx.slice(); } // จำครบทุกประโยคแล้ว → ทบทวนฟรี 0 แต้ม (กันฟาร์ม)
    } else {
      pool = allIdx.slice();
    }
    // Lin 2026-07-13: SRS กรอง pool ก่อนแล้ว (ข้างบน) — เลือก "ลำดับ" ในเซ็ตด้วย pickAdaptive
    // (เน้นประโยคที่เพิ่งพลาดบ่อยจาก reading_sessions ขึ้นมาก่อน ไม่ทับ/ไม่ยุ่ง SRS)
    if (_srsAllocated) {
      SET = pool.slice();
    } else if (window.READING_AUTH && typeof READING_AUTH.pickAdaptive === 'function' && READING_AUTH.adaptiveReady && READING_AUTH.adaptiveReady()) {
      var _items = pool.map(function(i){ return {idx:i, th:ADV_SENTENCES[i].th}; });
      var _picked = READING_AUTH.pickAdaptive(_items, Math.min(WO_ROUND_SIZE,_items.length));
      SET = _picked.map(function(p){ return p.idx; });
    } else {
      SET = shuffle(pool).slice(0,WO_ROUND_SIZE);
    }
    idx = 0; score = 0; correctFirstTry = 0;
    cleanC = 0; curCombo = 0; maxCombo = 0;
    roundLog = [];
    roundReport = window.RoundReport?RoundReport.create({game_type:'wordorder',difficulty:'高',mode:'sentence'}):null;
    if (window.GAME_ACCOUNT) { totalStars = GAME_ACCOUNT.getStars(); totalBadges = GAME_ACCOUNT.earnedBadges().length; }
    refreshUI();
    try { rgRenderGameBar(); } catch(e){}
    document.getElementById('end').style.display = 'none';
    document.getElementById('game').style.display = 'flex';
    try{ if(window.gtag) gtag('event','game_start',{category:'game',game:'word_order'}); }catch(e){}
    loadSentence();
    if(!window._minaWelcomed){ window._minaWelcomed=true; setTimeout(function(){minaToast('welcome',{dur:3400});},700); } // มีนาทักทายครั้งแรก — Lin 2026-07-10
  }

  function loadSentence(){
    if(window.GameFlow)GameFlow.cancel('word-order');
    var s = curSentence();
    answer = []; used = {};
    attemptedWrongThisSentence = false;
    hintUsedThisSentence = false;
    locked = false;
    wrongCount = 0; sentenceFailed = false;
    submittedAttempts = [];
    life = SENTENCE_LIFE_START;
    curSentenceIsKnownCheck = false;
    sentenceGolden = Math.random() < GOLDEN_SENTENCE_CHANCE;

    // 洗牌詞塊，若剛好洗成正確順序就重洗一次（句子長度 > 1 時才需要）
    var order;
    do {
      order = shuffle(s.words.map(function(w, i){ return i; }));
    } while (s.words.length > 1 && order.every(function(v, i){ return v === i; }));
    bank = order.map(function(orig){
      return { th: s.words[orig].th, orig: orig };
    });

    document.getElementById('wo-score').textContent = score;
    document.getElementById('wo-zh').innerHTML = '';
    woHideSound(); // ประโยคใหม่ = ซ่อนปุ่มฟังเสียงจนกว่าจะเฉลย (กันสปอยล์)
    var _woRev0=document.getElementById('wo-reveal'); if(_woRev0){_woRev0.style.display='none';_woRev0.innerHTML='';} // ประโยคใหม่ = ล้างคำอธิบายเก่า
    document.getElementById('wo-banner').className = 'result-banner gsh-feedback-slot';
    document.getElementById('wo-banner').textContent = '';
    document.getElementById('wo-next-btn').disabled = true;
    document.getElementById('wo-hint-btn').disabled = false;
    document.getElementById('wo-hint-btn').style.display = '';
    woSentenceRevealed = false; woSyncParticleBtn(); woRenderParticleLine(); // Lin 2026-08-01: ประโยคใหม่ = ยังไม่เรียงเสร็จ ซ่อนบรรทัดครับ/ค่ะ/คะ ไว้ก่อน
    var rb = document.getElementById('wo-remember-btn'); if (rb) rb.style.display = '';
    var gb = document.getElementById('wo-golden-badge'); if (gb) gb.style.display = sentenceGolden ? '' : 'none';
    updateHintWarning();

    // 進度條：目前已完成幾句／全部幾句
    document.getElementById('pf').style.width = (idx / SET.length * 100) + '%';
    document.getElementById('prog-txt').textContent = idx + '/' + SET.length;
    // Phase C.1 (2026-08-10): #wo-qn/#wo-qt ใน Session Header (第X/Y句) — เลขเดียวกับ idx/SET.length ข้างบน
    // เปลี่ยนมุมมองจาก "ทำไปแล้วกี่ข้อ" (idx) เป็น "กำลังทำข้อที่เท่าไหร่" (idx+1) ให้ตรงกับรูปแบบ 第X/Y字 ของเกมอื่น
    // (ข้อมูลจริงชุดเดียวกัน ไม่ได้สร้างใหม่ — ไม่แตะ life/hint/scoring logic เลย)
    var _woQn = document.getElementById('wo-qn'); if (_woQn) _woQn.textContent = idx + 1;
    var _woQt = document.getElementById('wo-qt'); if (_woQt) _woQt.textContent = SET.length;
    updatePowerBar(s);

    renderSlots(s);
    renderBank();
  }

  function woStartAutoNext(){
    if(!window.GameFlow)return;
    var nextButton=document.getElementById('wo-next-btn');
    setTimeout(function(){GameFlow.start({key:'word-order',nextButton:nextButton,delaySeconds:3});},0);
  }

  // Lin 2026-07-06: สีหลอดคะแนนต่อข้อ — ทองเข้มตอนเต็ม ไล่ลงเป็นแดงตอนใกล้ตาย (ชุดเดียวทุกเกม)
  function woScoreBarColor(sc, max){
    if (sc <= 0) return '#b83227';
    var f = Math.max(0, Math.min(1, sc / (max || 10)));
    var hue = f >= 0.4 ? 40 : Math.round(40 * (f / 0.4));
    var light = f >= 0.4 ? 42 : 38;
    return 'hsl(' + hue + ',78%,' + light + '%)';
  }
  // 本題分數: โชว์ "ชีวิต" (life) ที่เหลือของประโยคนี้ 10→0 · ไล่สีทอง→แดง · อัปเดตสดตอนเรียงผิด/กด提示
  function updateScoreBar(){
    var max = SENTENCE_LIFE_START || 10;
    var sc = Math.max(0, life);
    var pw = document.getElementById('wo-ws-fill');
    if (pw) { pw.style.width = Math.max(0, Math.min(100, sc / max * 100)) + '%'; pw.style.background = woScoreBarColor(sc, max); }
    var pn = document.getElementById('wo-ws-num'); if (pn) pn.textContent = sc;
  }
  function updatePowerBar(s){ updateScoreBar(); }

  function renderSlots(s){
    var wrap = document.getElementById('wo-slots');
    wrap.innerHTML = '';
    for (var i = 0; i < s.words.length; i++) {
      var slot = document.createElement('div');
      var filledOrig = answer[i];
      if (filledOrig === undefined) {
        slot.className = 'wo-slot empty';
        slot.textContent = '';
      } else {
        slot.className = 'wo-slot filled';
        // Lin 2026-07-25: คำอ่านติดไปกับคำ → ย้ายไปวางช่องไหน คำอ่านก็ตามไปด้วย
        slot.innerHTML = '<div class="wo-word-th">' + s.words[filledOrig].th + '</div>' + woReadHtml(filledOrig);
        slot.title = '點一下移回下面';
        (function(slotIndex){
          slot.onclick = function(){ if (!locked) removeFromAnswer(slotIndex); };
        })(i);
        // Lin 2026-07-15 (audit): ให้กดด้วยคีย์บอร์ด/โปรแกรมอ่านหน้าจอได้
        slot.setAttribute('role','button');
        slot.setAttribute('tabindex','0');
        slot.onkeydown = function(e){ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); slot.onclick(); } };
      }
      wrap.appendChild(slot);
    }
  }

  function renderBank(){
    var wrap = document.getElementById('wo-bank');
    wrap.style.display=''; // Lin 2026-07-12: ประโยคใหม่ → เอากลับมาโชว์ (เผื่อถูกซ่อนไว้ตอนประโยคก่อนจบ)
    wrap.innerHTML = '';
    bank.forEach(function(tile){
      var el = document.createElement('div');
      el.className = 'wo-tile' + (used[tile.orig] ? ' used' : '');
      // Lin 2026-07-25: คำอ่านแปะใต้คำในกองด้วย (กองสลับที่แล้ว คำอ่านก็ยังตรงกับคำของตัวเอง ไม่เฉลยลำดับ)
      el.innerHTML = '<div class="wo-word-th">' + tile.th + '</div>' + woReadHtml(tile.orig);
      el.onclick = function(){ if (!locked && !used[tile.orig]) addToAnswer(tile.orig); };
      el.setAttribute('role','button');
      el.setAttribute('tabindex','0');
      el.onkeydown = function(e){ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); el.onclick(); } };
      wrap.appendChild(el);
    });
  }

  function addToAnswer(orig){
    var s = curSentence();
    if (answer.length >= s.words.length) return;
    answer.push(orig);
    used[orig] = true;
    renderSlots(s);
    renderBank();
    updatePowerBar(s);
    if (answer.length === s.words.length) checkAnswer();
  }

  function removeFromAnswer(slotIndex){
    var orig = answer[slotIndex];
    if (orig === undefined) return;
    answer.splice(slotIndex, 1);
    delete used[orig];
    var s = curSentence();
    document.getElementById('wo-banner').className = 'result-banner gsh-feedback-slot';
    renderSlots(s);
    renderBank();
    updatePowerBar(s);
  }

  // 提示按鈕：如果現在按下去會扣到 ≤0（直接死掉），要先讓玩家看到警告再決定 — Lin 2026-07-05 指定只有提示按鈕要做
  function updateHintWarning(){
    var w = document.getElementById('wo-hint-warn');
    if (!w) return;
    var wouldKill = !locked && !curSentenceIsKnownCheck && (life - HINT_DEDUCT) <= 0;
    w.style.display = wouldKill ? '' : 'none';
  }

  // 這句失敗了（不管是排錯扣到 0，還是提示扣到 0）— 公佈答案 + 這句 0 分 + SRS 回到第一天
  function failSentence(s, wasProof){
    sentenceFailed = true; locked = true;
    answer = s.words.map(function(w, i){ return i; }); used = {};
    answer.forEach(function(o){ used[o] = true; });
    renderSlots(s); updatePowerBar(s);
    Array.prototype.forEach.call(document.querySelectorAll('#wo-slots .wo-slot'), function(el){ el.classList.add('correct'); });
    var banner = document.getElementById('wo-banner');
    banner.className = 'result-banner no show gsh-feedback-slot';
    banner.textContent = wasProof
      ? '看來這句還沒完全記熟，先留在複習清單裡 🔁'
      : '這句先看答案～綠色就是正確順序，我們下一句再加油 💪（本句不計分）';
        woRevealExtras(s.th);
    document.getElementById('wo-next-btn').disabled = false;
    woStartAutoNext();
    document.getElementById('wo-hint-btn').disabled = true;
    // Lin 2026-07-12: ซ่อนกล่องคำในคลัง (ใช้ครบแล้ว แต่ opacity:0 ยังกินที่อยู่) กันช่องว่างเปล่าๆ ก่อนถึง popup ผลลัพธ์
    var _wob0=document.getElementById('wo-bank'); if(_wob0)_wob0.style.display='none';
    updateHintWarning();
    var srsKey = woSrsKey(s.th);
    if (woLoggedIn() && !practiceMode) {
      srsRecords[srsKey] = WO_SRS.resetOnFail(srsRecords[srsKey]); // ผิด/ตาย = กลับวันแรกเสมอ (MASTER ข้อ7)
      woSaveSrs();
      woServerFinish(s.th, false); // Phase 4: ตาย/ล้มเหลว = รีเซ็ตฝั่งเซิร์ฟเวอร์ด้วย
    }
    woLogSentence({failed:true, pts:0, srsDue:(woLoggedIn() && !practiceMode) ? ((srsRecords[srsKey] && srsRecords[srsKey].dueDate) || '') : ''});
    woSaveResume(true);
    curSentenceIsKnownCheck = false;
    curCombo = 0;
    woSentenceRevealed = true; woRenderParticleLine(); // Lin 2026-08-01: เฉลยคำตอบแล้ว (แม้เรียงแพ้) ก็ถือว่าเห็นประโยคสมบูรณ์ → โชว์บรรทัดครับ/ค่ะ/คะ ได้
  }

  function checkAnswer(){
    var s = curSentence();
    lastSubmittedAnswer = answer.map(function(i){return s.words&&s.words[i]?s.words[i].th:'';}).filter(Boolean).join(' ');
    var isCorrect = answer.every(function(v, i){ return v === i; });
    submittedAttempts.push({answer:lastSubmittedAnswer,is_correct:isCorrect});
    var banner = document.getElementById('wo-banner');
    var srsKey = woSrsKey(s.th);

    if (isCorrect) {
      locked = true;

      // ── ด่านพิสูจน์ "已記得" (MASTER ข้อ10): ต้องสะอาด 100% (ไม่เคยผิดเลยรอบนี้) ถึงจะตัด/ไม่ได้แต้ม-ดาวไม่ว่าผลจะเป็นยังไง ──
      if (curSentenceIsKnownCheck) {
        var passedClean = !attemptedWrongThisSentence;
        curSentenceIsKnownCheck = false;
        if (woLoggedIn() && !practiceMode) {
          if (passedClean) {
            var recK = srsRecords[srsKey] || WO_SRS.blank();
            recK.mastered = true;
            srsRecords[srsKey] = recK;
          } else {
            srsRecords[srsKey] = WO_SRS.resetOnFail(srsRecords[srsKey]);
          }
          woSaveSrs();
          woServerFinish(s.th, passedClean, {knownCheck:true}); // Phase 4: 已記得 → mastered ไม่ให้ดาว
        }
        banner.className = (passedClean ? 'result-banner ok show' : 'result-banner no show') + ' gsh-feedback-slot';
        banner.textContent = passedClean ? '真的記得！這句標記為熟練 ✓（不計分、不加星）' : '中途排錯過，這句先留在複習清單裡 🔁';
                woRevealExtras(s.th);
        document.getElementById('wo-next-btn').disabled = false;
        woStartAutoNext();
        document.getElementById('wo-hint-btn').disabled = true;
        var _wobK=document.getElementById('wo-bank'); if(_wobK)_wobK.style.display='none'; // Lin 2026-07-12: เหมือนจุดอื่น กันช่องว่างเปล่าๆ
        Array.prototype.forEach.call(document.querySelectorAll('#wo-slots .wo-slot'), function(el){ el.classList.add('correct'); });
        woLogSentence({mastered:!!passedClean, pts:0, srsDue:passedClean?'已精通':((srsRecords[srsKey] && srsRecords[srsKey].dueDate) || '')});
        woSaveResume(true);
        woSentenceRevealed = true; woRenderParticleLine(); // Lin 2026-08-01: เรียงถูก (ด่านพิสูจน์已記得) → โชว์บรรทัดครับ/ค่ะ/คะ ได้
        return;
      }

      // ── คะแนนปกติ: pts = "ชีวิต" ที่เหลือตอนตอบถูก (หักไปแล้วทั้งจากผิด+提示 พูลเดียวกัน ตามข้อ3.6) ──
      var pts = Math.max(0, life);
      if (!attemptedWrongThisSentence) correctFirstTry++;
      var clean = !attemptedWrongThisSentence && !hintUsedThisSentence; // สะอาด = ไม่ผิดเลย + ไม่ใช้提示เลย

      if (clean) cleanC++;
      var golden = clean && sentenceGolden;
      if (golden) pts = pts * GOLDEN_SENTENCE_MULT;
      curCombo = clean ? (curCombo + 1) : 0;
      if (curCombo > maxCombo) maxCombo = curCombo;
      var cmult = woComboMult(curCombo);
      if (cmult > 1) pts = Math.max(1, Math.round(pts * cmult));

      if (!practiceMode) score += pts;
      document.getElementById('wo-score').textContent = score;

      // ── SRS (เฉพาะล็อกอิน+ไม่ใช่ practiceMode) ──
      if (woLoggedIn() && !practiceMode) {
        var existingRec = srsRecords[srsKey] || null;
        var srsPassed = life === SENTENCE_LIFE_START && !attemptedWrongThisSentence && !hintUsedThisSentence;
        // Phase 1 entry/checkpoint: คะแนนฐานต้อง 10/10 เท่านั้น; bonus/combo/golden ห้ามช่วยผ่าน
        if (srsPassed) {
          var rec = existingRec || WO_SRS.blank();
          var res = WO_SRS.advanceOnClean(rec, Date.now());
          rec = res.rec;
          woServerFinish(s.th, true, {starClean: !rec.everFailed && !rec.everHinted}); // Phase 4: เลื่อนขั้น (จำเอง/คำใบ้ = 3/1⭐)
          var rb2 = SRS_REVIEW_BONUS[res.passedStage] || 0;
          if (rb2 > 0) { score += rb2; popScore('+' + rb2 + ' 🔁'); }
          if (res.justMastered) {
            try {
              if (window.GAME_ACCOUNT && GAME_ACCOUNT.addHardStars) {
                var starClean = !rec.everFailed && !rec.everHinted; // ทั้งสองแกนต้องไม่มีเลย ถึงจะเป็น "จำเอง" 3⭐ (ไม่งั้น = "กู้" 1⭐ ตามข้อ3.6)
                var hs = GAME_ACCOUNT.addHardStars(starClean, LEVEL_NUM);
                totalStars = GAME_ACCOUNT.getStars();
                if (hs && hs.stars > 0) rgToast('🎉 你真的記住這句了！+' + hs.stars + ' ⭐');
              }
            } catch(e){}
          }
          srsRecords[srsKey] = rec;
          woSaveSrs();
        } else {
          // item ใหม่ที่ต่ำกว่า 10 ยังอยู่ Normal Pool และต้องไม่สร้าง SRS row/local record
          if (existingRec) {
            srsRecords[srsKey] = WO_SRS.resetOnFail(existingRec);
            woSaveSrs();
          }
          woServerFinish(s.th, false); // Edge จะตอบ below_entry_score ถ้ายังไม่มี SRS row
        }
      }

      banner.className = 'result-banner ok show gsh-feedback-slot';
      banner.textContent = '✅ 排對了！+' + pts + ' 分' + (golden ? ' ✨黃金句' : '') + (cmult > 1 ? ' 🔥連對×' + cmult : '') + (hintUsedThisSentence ? '（用了提示）' : '');
            woRevealExtras(s.th);
      // Lin 2026-07-12: โชว์คำอธิบายว่าแต่ละคำแปลว่าอะไร (ตอนจบ)
      // D2 (Shared Game UI, 2026-08-10): เดิมโชว์ตารางนี้อัตโนมัติเสมอ → เปลี่ยนเป็นปุ่ม [ 查看詳細解說 ] แบบ opt-in
      //   (.gsh-detail-toggle/.gsh-detail-box ใน css/shared.css — ก็อปแพทเทิร์นจาก tone-finder-game.js toggleAnswerDetail)
      //   เนื้อหา/การคำนวณตารางเหมือนเดิมทุกประการ แค่ซ่อนไว้ก่อนจนกว่าจะกดดู · ปุ่มยูทิลิตี้ (🔊/🍙/🔖 ใน #wo-reveal-ctl) เป็นคนละกล่อง ไม่แตะ
      var _woRev=document.getElementById('wo-reveal');
      if(_woRev){
        if (s.words && s.words.length) {
          var _woRevRows=s.words.map(function(w){ return '<div style="display:flex;gap:10px;align-items:baseline;padding:4px 0;border-bottom:1px solid rgba(139,99,16,0.10);"><span style="font-family:\'Sarabun\',sans-serif;font-weight:700;color:#5a3e10;font-size:17px;min-width:74px;">'+w.th+'</span><span style="color:#666;font-family:\'Noto Sans TC\',sans-serif;font-size:13px;">'+w.zh+'</span></div>'; }).join('');
          // Lin 2026-08-01: ถ้าเปิดปุ่มครับ/ค่ะ/คะ ไว้ → เพิ่มแถวอธิบายคำนี้ท้ายสุดด้วย (ไม่ใช่คำที่ต้องเรียง แค่โชว์ความหมายเสริม)
          var _woPart=woShowParticleFor(s);
          if(_woPart){
            var _pZh=_woPart==='ครับ'?'（男性禮貌詞）':(_woPart==='คะ'?'（女性禮貌詞・疑問句）':'（女性禮貌詞・句尾非疑問）');
            _woRevRows+='<div style="display:flex;gap:10px;align-items:baseline;padding:4px 0;border-bottom:1px solid rgba(139,99,16,0.10);"><span style="font-family:\'Sarabun\',sans-serif;font-weight:700;color:#5a3e10;font-size:17px;min-width:74px;">'+_woPart+'</span><span style="color:#666;font-family:\'Noto Sans TC\',sans-serif;font-size:13px;">'+_pZh+'（不用排・不計分）</span></div>';
          }
          _woRev.innerHTML='<button type="button" class="gsh-detail-toggle" onclick="woToggleDetail(this)">查看詳細解說</button>'
            +'<div class="gsh-detail-box" style="display:none;">'
            +'<div style="font-size:12px;color:#8B6310;font-weight:800;margin-bottom:6px;font-family:\'Noto Sans TC\',sans-serif;">每個字的意思</div>'+_woRevRows
            +'</div>';
          _woRev.style.display='block';
        } else {
          _woRev.style.display='none';
          _woRev.innerHTML='';
        }
      }
      woSentenceRevealed = true; woRenderParticleLine(); // Lin 2026-08-01: เรียงถูกแล้ว → โชว์บรรทัดครับ/ค่ะ/คะ ได้
      // Lin 2026-07-12: คำในคลังใช้หมดแล้ว (มองไม่เห็นแต่ยังกินพื้นที่อยู่ opacity:0) → ซ่อนกล่องทั้งกล่องไปเลย กันช่องว่างเปล่าๆ ระหว่างช่องเฉลยกับ popup ผลลัพธ์
      var _wob=document.getElementById('wo-bank'); if(_wob)_wob.style.display='none';
      document.getElementById('wo-next-btn').disabled = false;
      woStartAutoNext();
      document.getElementById('wo-hint-btn').disabled = true;
      updateHintWarning();
      if (pts > 0) popScore('+' + pts);
      // น้องมีนาพูด: คำทอง > คอมโบ > มีผิด(ปลอบ) > ถูก(สุ่ม) — Lin 2026-07-10
      if(golden) minaToast('golden');
      else if(curCombo===3||curCombo===5||curCombo===8) minaToast('combo');
      else if(attemptedWrongThisSentence) minaToast('wrong',{throttle:true,chance:0.5});
      else minaToast('correct',{throttle:true});
      // 標記格子為已答對樣式
      Array.prototype.forEach.call(document.querySelectorAll('#wo-slots .wo-slot'), function(el){
        el.classList.add('correct');
      });
      woLogSentence({guide:!!hintUsedThisSentence, pts:pts, srsDue:(woLoggedIn() && !practiceMode) ? ((srsRecords[srsKey] && srsRecords[srsKey].dueDate) || '') : ''});
      woSaveResume(true);
      try{ if(window.gtag) gtag('event','word_order_correct',{category:'game',sentence:s.th, first_try: !attemptedWrongThisSentence}); }catch(e){}
      try{ if(window.gtag) gtag('event','game_correct',{category:'game',game:'word_order'}); }catch(e){}
    } else {
      attemptedWrongThisSentence = true;
      var deduct = WRONG_DEDUCT[Math.min(wrongCount, 3)];
      wrongCount++;                       // กฎ MASTER: นับผิดรวมทั้งประโยค (ไม่แยกคำ)
      life -= deduct;
      curCombo = 0;

      if (life <= 0) {
        var wasProof = curSentenceIsKnownCheck;
        failSentence(s, wasProof);
        try{ if(window.gtag) gtag('event','word_order_fail',{category:'game',sentence:s.th, wrongs:wrongCount}); }catch(e){}
      } else {
        banner.className = 'result-banner no show gsh-feedback-slot';
        banner.textContent = '👧🏻 還沒對喔，別擔心～點一下格子裡的詞塊，再排排看 💕';
        Array.prototype.forEach.call(document.querySelectorAll('#wo-slots .wo-slot.filled'), function(el){
          el.classList.add('wrong');
          setTimeout(function(){ el.classList.remove('wrong'); }, 400);
        });
        updateHintWarning();
        updateScoreBar();  // Lin 2026-07-06: หลอด 本題分數 ลดสด+ไล่สีตอนเรียงผิด
        try{ if(window.gtag) gtag('event','word_order_wrong',{category:'game',sentence:s.th, wrongs:wrongCount}); }catch(e){}
        try{ if(window.gtag) gtag('event','game_wrong',{category:'game',game:'word_order'}); }catch(e){}
      }
    }
  }

  var _scorePopCount=0; // กันป๊อปคะแนนซ้อนทับกัน — Lin 2026-07-12
  function popScore(text){
    var idx=_scorePopCount++;
    var pop = document.createElement('div');
    pop.className = 'score-pop';
    pop.textContent = text;
    if(idx>0) pop.style.top=(26+idx*9)+'%';
    document.body.appendChild(pop);
    setTimeout(function(){ pop.remove(); _scorePopCount=Math.max(0,_scorePopCount-1); }, 1850);
  }

  window.woHint = function(){
    if (locked || curSentenceIsKnownCheck) return; // ด่านพิสูจน์ 已記得 ห้ามมี提示เด็ดขาด (MASTER ข้อ10)
    try{ if(window.gtag) gtag('event','word_order_hint_click',{category:'game'}); }catch(e){}
    var s = curSentence();
    if (answer.length >= s.words.length) return;
    // 找出目前「從頭開始連續正確」的長度，超過這段的（放錯的）詞塊都退回下面
    var correctPrefixLen = 0;
    while (correctPrefixLen < answer.length && answer[correctPrefixLen] === correctPrefixLen) correctPrefixLen++;
    for (var i = answer.length - 1; i >= correctPrefixLen; i--) delete used[answer[i]];
    answer = answer.slice(0, correctPrefixLen);
    // 在正確位置放上下一個正確的詞塊
    answer.push(correctPrefixLen);
    used[correctPrefixLen] = true;
    hintUsedThisSentence = true;
    life -= HINT_DEDUCT; // ข้อ3.6: 提示หักครั้งละ2 พูลเดียวกับผิด ไม่จำกัดจำนวนครั้ง
    renderSlots(s);
    renderBank();
    updatePowerBar(s);
    if (life <= 0) {
      failSentence(s, false);
      try{ if(window.gtag) gtag('event','word_order_hint_death',{category:'game',sentence:s.th}); }catch(e){}
      return;
    }
    updateHintWarning();
    if (answer.length === s.words.length) checkAnswer();
  };

  // MASTER ข้อ10 (已記得): กดแล้วไม่ตัดคำทันที ต้องพิสูจน์อีก 1 ครั้งแบบไม่มี提示ให้ — ถูกสะอาด100%ถึงจะตัด (ไม่ได้แต้ม/ดาว)
  window.woRemember = function(){
    if (locked || curSentenceIsKnownCheck) return;
    curSentenceIsKnownCheck = true;
    var hb = document.getElementById('wo-hint-btn'); if (hb) hb.style.display = 'none';
    var rb = document.getElementById('wo-remember-btn'); if (rb) rb.style.display = 'none';
    updateHintWarning();
    var banner = document.getElementById('wo-banner');
    banner.className = 'result-banner show gsh-feedback-slot';
    banner.textContent = '證明你真的記得：接下來不會有提示，排對才會標記熟練 ✓';
  };

  window.woResetSentence = function(){
    if (locked) return;
    answer = []; used = {};
    document.getElementById('wo-banner').className = 'result-banner gsh-feedback-slot';
    renderSlots(curSentence());
    renderBank();
    updatePowerBar(curSentence());
  };

  window.woNext = function(){
    if (idx < SET.length - 1) {
      idx++;
      loadSentence();
    } else {
      finish();
    }
  };

  // CTA ล็อกอิน (MASTER ข้อ13) — โชว์เฉพาะตอนยังไม่ล็อกอิน · สั้น + ปุ่ม 更多福利 กางดูสิทธิพิเศษ
  function woRenderLoginCTA(){
    var el = document.getElementById('rg-cta-login'); if (!el) return;
    if (woLoggedIn()) { el.innerHTML = ''; return; }
    el.innerHTML = '<div style="font-family:\'Noto Sans TC\',sans-serif;box-sizing:border-box;">' +
      '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">' +
        '<span style="font-size:14px;color:#633806;font-weight:700;flex:1;min-width:180px;">登入後米娜才幫你把進度記起來 🌾</span>' +
        '<button onclick="woCtaLogin()" style="background:#BA7517;color:#fff;border:none;font-weight:700;padding:6px 16px;border-radius:8px;font-size:13px;cursor:pointer;">登入解鎖 →</button>' +
        '<button onclick="var d=document.getElementById(\'wo-cta-detail\');var s=d.style.display===\'none\';d.style.display=s?\'block\':\'none\';this.textContent=s?\'收起 ▲\':\'更多福利 ▾\';" style="background:transparent;border:none;color:#854F0B;font-size:13px;cursor:pointer;font-weight:700;">更多福利 ▾</button>' +
      '</div>' +
      '<div id="wo-cta-detail" style="display:none;margin-top:10px;border-top:0.5px solid #EF9F27;padding-top:10px;font-size:13px;color:#633806;line-height:1.8;">' +
        '✅ 登入後可以：<br>⭐ 累積星星＋泰國米勳章或其他禮物<br>🧠 智慧複習：記住你哪些句子學會了、哪些還要練，到期自動幫你排進來<br>🏆 登上排行榜和大家一起比<br>📈 下次打開，直接讓你練你的弱點' +
      '</div></div>';
  }
  window.woCtaLogin = function(){ try{ var b=document.querySelector('#rg-login-slot button'); if(b){b.click();return;} }catch(e){} };

  function finish(){
    woClearResume(); // E3: จบรอบแล้ว ไม่มีอะไรให้ resume ต่อ
    document.getElementById('game').style.display = 'none';
    document.getElementById('end').style.display = 'flex';
    if(window.GameFlow)GameFlow.markResult('#end');
    document.getElementById('pf').style.width = '100%';
    document.getElementById('prog-txt').textContent = SET.length + '/' + SET.length;
    var _woQnEnd = document.getElementById('wo-qn'); if (_woQnEnd) _woQnEnd.textContent = SET.length;
    var _woQtEnd = document.getElementById('wo-qt'); if (_woQtEnd) _woQtEnd.textContent = SET.length;

    // GA4: ยิงทุกครั้งที่จบรอบ ไม่ว่าจะ practiceMode หรือไม่ (แก้บั๊กเดิม: game_complete เคยยิงหลัง if(practiceMode) เท่านั้น ทำให้คนที่จำครบแล้วไม่ถูกนับ)
    try{ if(window.gtag) gtag('event','word_order_complete',{category:'game',practice: !!practiceMode}); }catch(e){}
    try{ if(window.gtag) gtag('event','game_complete',{category:'game',game:'word_order'}); }catch(e){}

    // จำครบทุกประโยคแล้ว (mastered หมด) → รอบนี้เป็นแค่ทบทวนฟรี ไม่คิดคะแนน/ดาว/ลีก (กันฟาร์ม MASTER ข้อ7)
    if (practiceMode) {
      document.getElementById('wo-end-score').textContent = '複習模式';
      document.getElementById('wo-end-detail').textContent = '💡 這些句子都已經記熟了！這輪只是免費複習，不計分（之後有新句子上架時再來拿分數／星星）';
      if (window.GAME_ACCOUNT) { GAME_ACCOUNT.bumpStreakToday(); totalStars = GAME_ACCOUNT.getStars(); totalBadges = GAME_ACCOUNT.earnedBadges().length; }
      try { rgChallengeBump(maxCombo, false); } catch(e){}
      try {
        var _sv0 = rgApplyStreak();
        if (_sv0.events.freezeUsed) rgToast('護盾幫你保住連續紀錄！🛡️');
        if (_sv0.events.freezeEarned) rgToast('獲得新護盾 🛡️ ×1！連續' + _sv0.state.streak + '天');
      } catch(e){}
      try { rgRenderGameBar(); } catch(e){}
      refreshUI();
      if(roundReport&&window.RoundReport)RoundReport.finish(roundReport,{score:0,submission_id:null});
      if(window.GameFlow)GameFlow.enhanceResult({key:'word-order-result',root:'#end',actions:'#end .gsh-end-actions',correct:roundReport?roundReport.correct_count:cleanC,total:roundReport?roundReport.total_items:SET.length,report:roundReport,onReplay:woRestart});
      woAttachLoginSummary();
      setTimeout(function(){ if (window.VocabPopup) window.VocabPopup.maybe(); }, 1100);
      return;
    }

    var isPerfect = (cleanC === SET.length && SET.length > 0);
    // โบนัสจบรอบ: +20 ทุกครั้งที่จบ · +50 เพิ่มถ้า perfect (MASTER ข้อ5)
    var roundBonus = 0;
    if (SET.length > 0) {
      roundBonus += ROUND_COMPLETE_BONUS;
      if (isPerfect) roundBonus += ROUND_PERFECT_BONUS;
    }
    score += roundBonus;
    // ตัวคูณระดับ (MASTER ข้อ2): เกมนี้ทั้งเกม=高級ล้วน → ×2 คงที่ คูณ "ทั้งรอบรวมโบนัส" ตอนจบ
    var weightedScore = Math.round(score * LEVEL_WEIGHT);
    if(roundReport&&window.RoundReport)RoundReport.finish(roundReport,{score:weightedScore,submission_id:null});
    document.getElementById('wo-end-score').textContent = weightedScore;

    var detail = SET.length + ' 句中，第一次就排對 ' + correctFirstTry + ' 句（乾淨過關 ' + cleanC + ' 句）';
    if (roundBonus) detail += '・含完成獎勵 +' + roundBonus;
    detail += '（已含 ×' + LEVEL_WEIGHT + ' 高級倍率）';

    // ⭐ 星星只在「真正記住（SRS mastered）」時發放 — 見 checkAnswer() 內的 addHardStars · 這裡只更新顯示，不再額外發星星（MASTER ข้อ8，舊的 starsForRound 已停用）
    if (window.GAME_ACCOUNT) { GAME_ACCOUNT.bumpStreakToday(); totalStars = GAME_ACCOUNT.getStars(); totalBadges = GAME_ACCOUNT.earnedBadges().length; }
    if (isPerfect) {
      detail += ' · 完美一輪！✨';
      var sb = document.createElement('div'); sb.className = 'star-burst'; sb.textContent = '⭐';
      document.body.appendChild(sb);
      setTimeout(function(){ if (sb.parentNode) sb.parentNode.removeChild(sb); }, 2200);
    }
    detail += ' · 累積共 ' + totalStars + ' 顆星';
    document.getElementById('wo-end-detail').textContent = detail;
    if(window.GameFlow){
      var _hl=[];
      if(woLoggedIn()&&window.GAME_ACCOUNT){var _gs=GAME_ACCOUNT.getStreak();if(_gs)_hl.push('🔥 連續 '+_gs+' 天');var _gb=GAME_ACCOUNT.earnedBadges();if(_gb.length)_hl.push('🎖️ '+_gb[_gb.length-1].zh);}
      GameFlow.enhanceResult({key:'word-order-result',root:'#end',actions:'#end .gsh-end-actions',correct:roundReport?roundReport.correct_count:cleanC,total:roundReport?roundReport.total_items:SET.length,highlights:_hl,report:roundReport,onReplay:woRestart});
    }

    try{ if(window.gtag) gtag('event','word_order_complete',{category:'game',practice: false, score: weightedScore}); }catch(e){}
    try{
      if(window.READING_AUTH && READING_AUTH.saveScore){
        var _woItemScore=roundLog.reduce(function(sum,w){return sum+(Number(w.pts)||0);},0);
        var _woSrsBonus=Math.max(0,score-roundBonus-_woItemScore);
        var _woSubmissionId=READING_AUTH.saveScore(weightedScore,1,'word_order',rgWrongItemsFromLog(),{
          difficulty:'高',
          items:roundLog.map(function(w){return {key:w.th,points:Number(w.pts)||0,wrong:Number(w.wrong)||0,guide:!!w.guide,failed:!!w.failed,mastered:!!w.mastered};}),
          roundBonus:roundBonus,srsBonus:_woSrsBonus
        });
        if(roundReport)roundReport.submission_id=_woSubmissionId||null;
      }
    }catch(e){} // S29: คะแนน Core 5 ผ่าน score-submit เท่านั้น

    // 每週挑戰 + 連續天數／護盾（跟其他遊戲共用同一套邏輯）
    try { rgChallengeBump(maxCombo, isPerfect); } catch(e){}
    try {
      var _sv = rgApplyStreak();
      if (_sv.events.freezeEarned) rgToast('獲得新護盾 🛡️ ×1！連續' + _sv.state.streak + '天');
      // น้องมีนาพูดตอนจบรอบ: goalMet > freezeUsed > perfect/greatSet/goodSet — Lin 2026-07-20 (เทียบเกมเสียง)
      var _cleanRatio = SET.length>0 ? (cleanC/SET.length) : 0;
      var _minaSetKey = isPerfect ? 'perfect' : (_cleanRatio>=0.6 ? 'greatSet' : 'goodSet');
      if (_sv.events.goalMetToday) minaToast('goalMet',{vars:{n:_sv.state.streak},dur:3400});
      else if (_sv.events.freezeUsed) minaToast('freezeUsed',{dur:3200});
      else minaToast(_minaSetKey,{dur:3000});
    } catch(e){}
    try { rgRenderGameBar(); } catch(e){}
    refreshUI();
    woAttachLoginSummary();
    // เกมฟรี: นับรอบ + เด้งคำเชิญ "ขอ單字速查表" ครั้งเดียวหลัง ~5 รอบ (ปิดได้เล่นต่อ · เหมือนเกมอื่น)
    setTimeout(function(){ if (window.VocabPopup) window.VocabPopup.maybe(); }, 1100);
  }

  function woAttachLoginSummary(){
    if(!roundReport||!window.LearningSummary||!woLoggedIn())return;
    LearningSummary.loadForGame('word_order','word-order').then(function(summary){
      if(!roundReport||!window.RoundReport)return;
      RoundReport.setLoginSummary(roundReport,summary);
      if(window.GameFlow)GameFlow.attachReport('#end',roundReport);
    });
  }

  window.woRestart = function(){ woClearResume(); init(); }; // E3: กดจากหน้าจบผลเท่านั้น (ไม่มีอะไรค้างให้ resume อยู่แล้ว) ล้างกันเหนียว
  window.woRerenderBar = rgRenderGameBar; // Lin 2026-07-12: ให้ reading-auth.js เรียก re-render แถบชวนล็อกอินได้ตอน auth เสร็จ (กันการ์ด "登入解鎖" ค้างทั้งที่ล็อกอินแล้ว)

  // ════════════════════════════════════════════
  // PDF 報告（本輪排過的句子 + 逐字意思 + 登入後 SRS 下次複習日期）— Lin 2026-07-08
  // Lin 2026-07-20: เปลี่ยนจาก html2canvas+jsPDF (โหลด CDN ทุกครั้ง เสี่ยงพัง/ช้า) → หน้าต่าง print เหมือนเกมเสียง
  //   (เกมเสียงเคยเจอ html2canvas ออกไฟล์ว่างเปล่าบนคอม + ค้างบนมือถือ มาแล้ว เปลี่ยนเป็น print window ตั้งแต่ 2026-06-19 เสถียรกว่า)
  // ════════════════════════════════════════════
  window.woDownloadReport = function(){
    var SERIF = "'Noto Serif TC','PingFang TC',serif";
    var SANS = "'Noto Sans TC','PingFang TC',sans-serif";
    var today = new Date().toLocaleDateString('zh-TW',{year:'numeric',month:'2-digit',day:'2-digit'});
    var weightedScore = Math.round(score * LEVEL_WEIGHT);
    var loggedIn = woLoggedIn();

    function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
    // Lin 2026-07-31: ประโยคไทยเขียนจริงไม่เว้นวรรคระหว่างคำ (เช่น "ผมกินข้าวอยู่ที่บ้าน")
    // ถ้าโยนดิบๆ ลง <td> ไม่มีจุดตัดคำเลย เบราว์เซอร์บางตัวจะไม่ตัดขึ้นบรรทัดใหม่ (ล้นขอบกระดาษ) หรือตัดกลางคำเวลาจนมุม
    // แก้ด้วยการต่อคำจาก wordsArr (แยกคำมาแล้วจากข้อมูลจริง) ด้วยช่องว่างมองไม่เห็น (Zero-Width Space ​) —
    // ให้เบราว์เซอร์ตัดบรรทัดได้ "ระหว่างคำ" เท่านั้น ไม่มีทางตัดกลางคำ + ไม่มีวรรคที่มองเห็นโผล่มา (ตัวเขียนหน้าตาเหมือนเดิมทุกอย่าง)
    function wrapThai(w){ return (w.wordsArr && w.wordsArr.length) ? w.wordsArr.map(esc).join('​') : esc(w.th); }
    function wordBreakdown(w){
      if (!w.wordGlosses || !w.wordGlosses.length) return '';
      return '<div style="font-size:10px;font-weight:400;color:#777;line-height:1.5;margin-top:4px;">逐字：'+w.wordGlosses.map(function(g){ return esc(g.th)+'＝'+esc(g.zh); }).join('・')+'</div>';
    }
    function statusLabel(w){
      if (w.mastered) return '<span style="color:#8B6310;">✓ 已精通</span>';
      if (w.guide) return '<span style="color:#b06020;">💡 用提示</span>';
      if (w.failed) return '<span style="color:#c62828;">✗ 待加強</span>';
      return '<span style="color:#2e7d32;">✓ 答對</span>';
    }
    var rows = woReportRows().map(function(w, i){
      return '<tr>'
        +'<td style="padding:7px 6px;font-size:12px;color:#888;text-align:center;">'+(i+1)+'</td>'
        +'<td style="padding:7px 6px;font-size:14px;font-weight:700;word-break:keep-all;overflow-wrap:break-word;">'+wrapThai(w)+'<div style="font-size:10px;font-weight:400;color:#777;">作答：'+esc(w.userAnswer||'（未保留）')+'<br>正解：'+esc(w.correctAnswer||w.th)+'</div>'+wordBreakdown(w)+'</td>'
        +'<td style="padding:7px 6px;font-size:12px;color:#666;">'+esc(w.zh)+'</td>'
        +'<td style="padding:7px 6px;font-size:12px;text-align:center;">'+statusLabel(w)+'</td>'
        +'<td style="padding:7px 6px;font-size:12px;text-align:center;">'+(w.wrong||0)+'</td>'
        +'<td style="padding:7px 6px;font-size:12px;text-align:center;font-weight:700;color:#8B6310;">+'+(w.pts||0)+'</td>'
        +(loggedIn?'<td style="padding:7px 6px;font-size:11px;text-align:center;color:#8B6310;">'+(w.mastered?'已精通':(w.srsDue||'—'))+'</td>':'')
        +'</tr>';
    }).join('');

    var innerHtml =
      '<div style="max-width:640px;margin:0 auto;padding:24px;background:#FBF5E7;box-sizing:border-box;font-family:'+SERIF+';color:#1C1C1C;">'
      +'<div style="background:#fff;border:1px solid #C8973A;">'
      +'<table style="width:100%;background:#1C1C1C;border-bottom:3px solid #C8973A;border-collapse:collapse;"><tr>'
      +'<td style="padding:22px 26px;vertical-align:top;">'
      +'<div style="color:#fff;font-size:20px;font-weight:700;font-family:'+SERIF+';">泰語語序練習室・本輪報告</div>'
      +'<div style="font-family:'+SANS+';font-size:9px;letter-spacing:0.2em;color:#C8973A;font-weight:700;margin-top:6px;">mrtaihualin.com</div>'
      +'</td>'
      +'<td style="padding:22px 26px;vertical-align:top;text-align:right;color:#C8973A;white-space:nowrap;">'
      +'<div style="font-family:'+SANS+';font-size:11px;">'+esc(today)+'</div>'
      +'<div style="font-family:'+SANS+';font-size:11px;">高級</div>'
      +'</td></tr></table>'
      +'<div style="padding:20px 26px;">'
      +'<table style="width:100%;font-family:'+SANS+';font-size:12px;color:#8B6310;"><tr>'
      +'<td>本輪得分</td><td style="text-align:right;font-size:20px;font-weight:700;color:#5a3e0a;">'+weightedScore+' 分</td>'
      +'</tr><tr><td>乾淨過關句數</td><td style="text-align:right;">'+cleanC+' / '+SET.length+'</td></tr></table>'
      +'<hr style="border:none;border-top:1px solid rgba(139,99,16,0.2);margin:14px 0;">'
      +'<table style="width:100%;border-collapse:collapse;"><thead><tr style="border-bottom:1.5px solid #C8973A;">'
      +'<th style="font-size:11px;color:#8B6310;padding:5px;">#</th>'
      +'<th style="font-size:11px;color:#8B6310;padding:5px;text-align:left;">泰文句子</th>'
      +'<th style="font-size:11px;color:#8B6310;padding:5px;text-align:left;">意思</th>'
      +'<th style="font-size:11px;color:#8B6310;padding:5px;">狀態</th>'
      +'<th style="font-size:11px;color:#8B6310;padding:5px;">排錯次數</th>'
      +'<th style="font-size:11px;color:#8B6310;padding:5px;">得分</th>'
      +(loggedIn?'<th style="font-size:11px;color:#8B6310;padding:5px;">下次複習</th>':'')
      +'</tr></thead><tbody>'+rows+'</tbody></table>'
      +(window.RoundReport?RoundReport.loginSectionsHtml(roundReport):'')
      +'</div></div>'
      +'<div style="text-align:center;font-family:'+SANS+';font-size:9.5px;letter-spacing:0.15em;color:#8B6310;padding:16px 26px 4px;">泰華眼裡的泰語教學　·　mrtaihualin.com</div>'
      +'</div>';

    var win = window.open('', '_blank');
    if (!win) { try { rgToast('請允許彈出視窗才能列印報告 🙏'); } catch(e2) { alert('請允許彈出視窗才能列印報告'); } return; }
    win.document.open();
    win.document.write(
      '<!DOCTYPE html><html lang="zh-TW"><head><meta charset="utf-8"><title>語序練習室報告</title>'
      +'<link href="https://fonts.googleapis.com/css2?family=Noto+Serif+TC:wght@400;700;900&family=Noto+Sans+TC:wght@400;700&display=swap" rel="stylesheet">'
      +'<style>@page{margin:10mm;}body{margin:0;background:#fff;}</style>'
      +'</head><body>'+innerHtml+'</body></html>'
    );
    win.document.close();
    win.focus();
    setTimeout(function(){ try{ win.print(); }catch(e){} }, 600);
  };

  // Lin 2026-08-02: เดิมใช้ document.addEventListener('DOMContentLoaded', init) ตรงๆ — ใช้ได้ตอนสคริปต์นี้
  // โหลดแบบ <script src=...> ธรรมดา (มาก่อน DOMContentLoaded เสมอ) แต่ตั้งแต่เปลี่ยนมาโหลดผ่าน
  // game-content-client.js (fetch ข้อมูลจากเน็ตก่อน แล้วค่อยฉีดสคริปต์นี้เข้ามาทีหลัง) จังหวะไม่แน่นอนอีกต่อไป —
  // ถ้า DOMContentLoaded ยิงไปแล้วก่อนที่บรรทัดนี้จะรัน (เช่น ไม่ล็อกอิน/เน็ตไว โหลดเสร็จเร็ว) listener นี้จะไม่มีวันถูกเรียก
  // เลย = init() ไม่รันเลย เกมค้างที่หน้าเปล่า (ตัวเลข 0/10 ที่เห็นเป็นค่า default ใน HTML ไม่ใช่ค่าจริงจาก JS)
  // แก้โดยใช้ woReinitSafe() (มีอยู่แล้วในไฟล์นี้ ใช้ปลอดภัยกับจังหวะแบบนี้อยู่แล้วในจุดอื่น) เช็ค document.readyState ก่อนเสมอ
  woReinitSafe();
})();

// ── 換現代字體（跟其他遊戲共用同一個 localStorage key，切一次全站都套用）──
function rgToggleFont() {
  // Lin 2026-07-25: ลบโค้ดอัปเดตปุ่มเก่า #rg-font-btn ออก — ปุ่มนั้นไม่มีในหน้าแล้วตั้งแต่ย้ายเข้าเมนู 🍚 (shared.js สร้างปุ่มจริงเอง อ่านสถานะจาก class บน <body>)
  var on = document.body.classList.toggle('rg-modern-font');
  try { localStorage.setItem('rg_modern_font', on ? '1' : '0'); } catch(e){}
}
(function(){ try { if (localStorage.getItem('rg_modern_font') === '1') { document.body.classList.add('rg-modern-font'); } } catch(e){} })(); // Lin 2026-07-25: ตัดโค้ดตั้งปุ่มเก่า #rg-font-btn ออก (ปุ่มไม่มีในหน้าแล้ว)

// ── 我有問題 ──
function rgOpenAsk() {
  var old = document.getElementById('rg-ask-ov'); if (old) old.remove();
  var div = document.createElement('div');
  div.id = 'rg-ask-ov';
  div.style.cssText = 'position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(0,0,0,.48);font-family:"Noto Sans TC",sans-serif;';
  div.innerHTML =
    '<div style="background:#fff;border-radius:20px;max-width:380px;width:100%;padding:28px 24px;position:relative;">' +
    '<button onclick="document.getElementById(\'rg-ask-ov\').remove()" style="position:absolute;top:14px;right:16px;background:none;border:none;font-size:20px;cursor:pointer;color:#aaa;">✕</button>' +
    '<div style="font-size:20px;font-weight:900;color:#8B6310;margin-bottom:10px;">？ 我有問題</div>' +
    '<div style="font-size:13px;color:#888;margin-bottom:14px;">在練習中卡住了嗎？把問題寫下來，老師會收到並回覆你 🙏</div>' +
    '<input id="rg-ask-email" type="email" placeholder="你的 Email（方便老師回覆，可留空）" style="width:100%;border:1.5px solid #e0d0b0;border-radius:10px;padding:9px 12px;font-size:16px;margin-bottom:10px;font-family:inherit;">' +
    '<textarea id="rg-ask-msg" placeholder="想問的問題…" rows="4" style="width:100%;border:1.5px solid #e0d0b0;border-radius:10px;padding:9px 12px;font-size:16px;resize:none;font-family:inherit;margin-bottom:14px;"></textarea>' +
    '<div style="display:flex;gap:8px;justify-content:flex-end;">' +
    '<button onclick="document.getElementById(\'rg-ask-ov\').remove()" style="padding:9px 18px;border-radius:20px;border:1.5px solid #ddd;background:#fff;color:#888;font-size:13px;cursor:pointer;">取消</button>' +
    '<button id="rg-ask-send" style="padding:9px 20px;border-radius:20px;border:none;background:linear-gradient(135deg,#8B6310,#C8973A);color:#fff;font-size:13px;font-weight:700;cursor:pointer;">送出問題 →</button>' +
    '</div></div>';
  document.body.appendChild(div);
  div.querySelector('#rg-ask-send').onclick = function() {
    var email = (document.getElementById('rg-ask-email')||{}).value || '';
    var msg   = (document.getElementById('rg-ask-msg')||{}).value || '';
    if (!msg.trim()) { alert('請寫下您的問題'); return; }
    var btn = div.querySelector('#rg-ask-send'); btn.disabled = true; btn.textContent = '送出中…';
    fetch('https://api.web3forms.com/submit', { method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ access_key:'b0b4c37b-6fad-4e64-9a16-81c5ab2ff4c3', subject:'[語序練習室] 學生問題', from_name:'語序練習室', email: email||'anonymous@game', message: msg }) })
    .then(function(r){ return r.json(); })
    .then(function(d){ if (!d || !d.success) throw new Error((d && d.message) || 'submit failed'); btn.textContent = '✅ 已送出！'; setTimeout(function(){ div.remove(); }, 1200); })
    .catch(function(){ btn.disabled=false; btn.textContent='送出問題 →'; alert('送出失敗，請稍後再試'); });
  };
}

// ── 單字庫徽章：移除了 — 單字庫已經在 #game-switcher（🎮 選單）裡有分頁，這裡放重複了 — Lin 2026-07-24 ──
