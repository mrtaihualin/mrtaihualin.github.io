// ════════════════════════════════════════════════════════════════
// 泰語語序遊戲 (word-order.html) — Lin 2026-07-03
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
  var SRS_REVIEW_BONUS = [3, 2, 1];  // ผ่านทบทวนสะอาด: day1+3 · day7+2 · day16+1 (ข้อ6)
  var LEVEL_WEIGHT = 2;              // เกมนี้ทั้งเกม=高級ล้วน → ตัวคูณระดับคงที่ ×2 คูณ "ทั้งรอบ" ตอนจบ (ข้อ2)
  var LEVEL_NUM = 3;                 // ใช้กับ GAME_ACCOUNT.addHardStars(clean, level) — 高級=3
  var SENTENCE_LIFE_START = 10;      // "ชีวิต" ของประโยคนี้ เริ่ม 10 (ก่อนคูณระดับ/คอมโบ/คำทอง) — ตรงตาราง MASTER ข้อ1
  var WRONG_DEDUCT = [3, 3, 3, 1];   // เรียงผิดครั้งที่1/2/3/4 หักเท่านี้ตามลำดับ (รวม=10 พอดี → ผิดครบ4=ตาย ตรงตาราง 10,7,4,1,0)
  var HINT_DEDUCT = 2;               // 提示 หักครั้งละ 2 เสมอ ไม่จำกัดจำนวนครั้ง (ข้อยกเว้นจาก MASTER ข้อ9 — Lin ยืนยัน 2026-07-05 ข้อ3.6)
  function woComboMult(streak){ return streak >= 8 ? 3 : (streak >= 5 ? 2 : (streak >= 3 ? 1.5 : 1)); } // คอมโบ 3/5/8×1.5/2/3 (ข้อ3)

  // ══════ SRS engine (ลอกจาก reading-game.html RG_SRS ทุกจุด + เพิ่ม everHinted สำหรับข้อยกเว้น 3.6) ══════
  var WO_SRS_CFG = { INTERVALS: [1, 7, 16], CLEAN_ROUNDS_TO_MASTER: 3 };
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
  function woSyncSrsFromServer(force){
    try{ if(!force && !woLoggedIn()) return Promise.resolve(false); }catch(e){ return Promise.resolve(false); }
    if(__woSrsSyncPromise) return __woSrsSyncPromise;
    var sb=window.getSupabaseClient?window.getSupabaseClient():null;
    if(!sb||!sb.from) return Promise.resolve(false);
    __woSrsSyncPromise = sb.from('tone_srs_state')
      .select('level, word, stage, due_date, ever_failed, mastered')
      .eq('game','wordorder')
      .then(function(res){
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
      .catch(function(){ window.__woSrsSyncedOnce=true; return false; });
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
          if(!u) return;
          if(!window.__woSrsSyncedOnce){ woSyncSrsFromServer(true).then(function(){ woReinitSafe(); }); }
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
        if(woLoggedIn()) woSyncSrsFromServer(true).then(function(){ woReinitSafe(); });
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
  function woShowSound(sentenceTh){
    var btn = document.getElementById('wo-sound-btn');
    if (!btn) return;
    if (window.WordAudio && WordAudio.has(sentenceTh)) {
      btn.style.display = '';
      btn.onclick = function(e){ e.stopPropagation(); WordAudio.play(sentenceTh, btn); };
    } else {
      btn.style.display = 'none';
    }
  }
  function woHideSound(){
    var btn = document.getElementById('wo-sound-btn');
    if (btn) { btn.style.display = 'none'; btn.onclick = null; }
  }

  // ── 共用進度系統的這局統計：只在 finish() 時彙整一次，跟其他遊戲的「一輪結束才結算」邏輯一致 ──
  var cleanC = 0;      // 這局「乾淨」過關的句數（沒放錯過、也沒用提示）
  var curCombo = 0;     // 目前連續乾淨過關的句數
  var maxCombo = 0;     // 這局最高連續乾淨過關數
  var totalStars = 0;   // 帳號累積星星（跨遊戲共用）
  var totalBadges = 0;  // 帳號累積勳章數（跨遊戲共用）
  var roundLog = []; // {th,zh,wrong,failed,guide,pts,srsDue,mastered} ต่อประโยค — ทำรายงาน PDF ท้ายรอบ — Lin 2026-07-08
  function woLogSentence(o){
    try{
      var s = curSentence();
      var base = {th:s?s.th:'', zh:s?s.zh:'', wrong:(typeof wrongCount!=='undefined'?wrongCount:0), failed:false, guide:false, pts:0, srsDue:'', mastered:false};
      for (var k in o) { if (Object.prototype.hasOwnProperty.call(o,k)) base[k] = o[k]; }
      roundLog.push(base);
    } catch(e){}
  }
  // 2026-07-13 Lin：ดึงประโยคที่พลาดในรอบนี้จาก roundLog ไปเก็บลง reading_sessions.wrong_items (ฐานข้อมูลจุดอ่อน)
  function rgWrongItemsFromLog(){
    try{ return roundLog.filter(function(w){return (w.wrong||0)>0||w.failed;}).map(function(w){return {th:w.th,zh:w.zh,wrong:w.wrong||0};}); }
    catch(e){ return []; }
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
  window.openBadge = function(){
    var s=(window.GAME_ACCOUNT)?GAME_ACCOUNT.getStars():totalStars;
    var badges=(window.GAME_ACCOUNT)?GAME_ACCOUNT.starBadges:[];
    document.getElementById('tree-area').textContent='⭐ '+s;
    document.getElementById('tree-caption').textContent='累積星星（全部遊戲共用）';
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
    { id:'wo_sets5',     title:'玩完 5 組',       sub:'本週完成 5 組語序遊戲',            type:'sets',    target:5,  emoji:'📚' },
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
    correct:['哇～排對了呢，你做得很好 ✨','對了對了！語序就是這樣 🌾','很好喔～你越來越有語感了 😊'],
    combo:['哇～連續排對，米娜都替你開心 🔥','停不下來了呢，好厲害 ⚡'],
    golden:['這句…裡面有可以吃的字喔！米娜最喜歡了 😋 分數加倍！'],
    wrong:['沒關係的…這句米娜以前也排錯過，我們再看一次好嗎？','再試一次就好，米娜陪你 💛','慢慢來，先想想第一個詞是哪個 🌱']
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

  function init(){
    if (!window.ADV_SENTENCES || !ADV_SENTENCES.length) {
      document.getElementById('game').innerHTML = '<p style="font-family:\'Noto Sans TC\',sans-serif;color:#c62828;">句庫載入失敗，請重新整理頁面。</p>';
      return;
    }
    woLoadSrs();
    var now = Date.now();
    var allIdx = ADV_SENTENCES.map(function(_, i){ return i; });
    practiceMode = false;
    var pool;
    // งานที่7 (SRS): กรองด้วย stage-based SRS เฉพาะตอนล็อกอินเท่านั้น — ไม่ล็อกอิน = เล่นได้ทุกประโยค ไม่จำ (ข้อ0/ข้อ7)
    if (woLoggedIn()) {
      pool = allIdx.filter(function(i){
        var rec = srsRecords[woSrsKey(ADV_SENTENCES[i].th)];
        if (rec && rec.mastered) return false;          // เชี่ยวชาญแล้ว (ตัดออกถาวร)
        if (rec && !WO_SRS.isDue(rec, now)) return false; // ยังไม่ครบกำหนดทบทวน
        return true;
      });
      if (pool.length === 0) pool = allIdx.filter(function(i){ var rec = srsRecords[woSrsKey(ADV_SENTENCES[i].th)]; return !(rec && rec.mastered); });
      if (pool.length === 0) { practiceMode = true; pool = allIdx.slice(); } // จำครบทุกประโยคแล้ว → ทบทวนฟรี 0 แต้ม (กันฟาร์ม)
    } else {
      pool = allIdx.slice();
    }
    // Lin 2026-07-13: SRS กรอง pool ก่อนแล้ว (ข้างบน) — เลือก "ลำดับ" ในเซ็ตด้วย pickAdaptive
    // (เน้นประโยคที่เพิ่งพลาดบ่อยจาก reading_sessions ขึ้นมาก่อน ไม่ทับ/ไม่ยุ่ง SRS)
    if (window.READING_AUTH && typeof READING_AUTH.pickAdaptive === 'function' && READING_AUTH.adaptiveReady && READING_AUTH.adaptiveReady()) {
      var _items = pool.map(function(i){ return {idx:i, th:ADV_SENTENCES[i].th}; });
      var _picked = READING_AUTH.pickAdaptive(_items, _items.length);
      SET = _picked.map(function(p){ return p.idx; });
    } else {
      SET = shuffle(pool);
    }
    idx = 0; score = 0; correctFirstTry = 0;
    cleanC = 0; curCombo = 0; maxCombo = 0;
    roundLog = [];
    if (window.GAME_ACCOUNT) { totalStars = GAME_ACCOUNT.getStars(); totalBadges = GAME_ACCOUNT.earnedBadges().length; }
    refreshUI();
    try { rgRenderGameBar(); } catch(e){}
    document.getElementById('end').style.display = 'none';
    document.getElementById('game').style.display = 'flex';
    try{ if(window.gtag) gtag('event','game_start',{game:'word_order'}); }catch(e){}
    loadSentence();
    if(!window._minaWelcomed){ window._minaWelcomed=true; setTimeout(function(){minaToast('welcome',{dur:3400});},700); } // มีนาทักทายครั้งแรก — Lin 2026-07-10
  }

  function loadSentence(){
    var s = curSentence();
    answer = []; used = {};
    attemptedWrongThisSentence = false;
    hintUsedThisSentence = false;
    locked = false;
    wrongCount = 0; sentenceFailed = false;
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
    document.getElementById('wo-banner').className = 'result-banner';
    document.getElementById('wo-banner').textContent = '';
    document.getElementById('wo-next-btn').disabled = true;
    document.getElementById('wo-hint-btn').disabled = false;
    document.getElementById('wo-hint-btn').style.display = '';
    var rb = document.getElementById('wo-remember-btn'); if (rb) rb.style.display = '';
    var gb = document.getElementById('wo-golden-badge'); if (gb) gb.style.display = sentenceGolden ? '' : 'none';
    updateHintWarning();

    // 進度條：目前已完成幾句／全部幾句
    document.getElementById('pf').style.width = (idx / SET.length * 100) + '%';
    document.getElementById('prog-txt').textContent = idx + '/' + SET.length;
    updatePowerBar(s);

    renderSlots(s);
    renderBank();
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
        slot.textContent = s.words[filledOrig].th;
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
      el.textContent = tile.th;
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
    document.getElementById('wo-banner').className = 'result-banner';
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
    banner.className = 'result-banner no show';
    banner.textContent = wasProof
      ? '看來這句還沒完全記熟，先留在複習清單裡 🔁'
      : '這句先看答案～綠色就是正確順序，我們下一句再加油 💪（本句不計分）';
    document.getElementById('wo-zh').innerHTML = '中文：<b>' + s.zh + '</b>';
    woShowSound(s.th);
    document.getElementById('wo-next-btn').disabled = false;
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
    curSentenceIsKnownCheck = false;
    curCombo = 0;
  }

  function checkAnswer(){
    var s = curSentence();
    var isCorrect = answer.every(function(v, i){ return v === i; });
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
        banner.className = passedClean ? 'result-banner ok show' : 'result-banner no show';
        banner.textContent = passedClean ? '真的記得！這句標記為熟練 ✓（不計分、不加星）' : '中途排錯過，這句先留在複習清單裡 🔁';
        document.getElementById('wo-zh').innerHTML = '中文：<b>' + s.zh + '</b>';
        woShowSound(s.th);
        document.getElementById('wo-next-btn').disabled = false;
        document.getElementById('wo-hint-btn').disabled = true;
        var _wobK=document.getElementById('wo-bank'); if(_wobK)_wobK.style.display='none'; // Lin 2026-07-12: เหมือนจุดอื่น กันช่องว่างเปล่าๆ
        Array.prototype.forEach.call(document.querySelectorAll('#wo-slots .wo-slot'), function(el){ el.classList.add('correct'); });
        woLogSentence({mastered:!!passedClean, pts:0, srsDue:passedClean?'已精通':((srsRecords[srsKey] && srsRecords[srsKey].dueDate) || '')});
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
        var rec = srsRecords[srsKey] || WO_SRS.blank();
        var isFinalReview = (rec.stage === (WO_SRS.cfg.CLEAN_ROUNDS_TO_MASTER - 1)) && !rec.mastered;
        // MASTER ข้อ3.6: ด่านตัดสิน day16 ห้ามใช้提示เด็ดขาด — ใช้提示ตอน day16 ถือว่าไม่ผ่าน กลับ day1 (ต่างจาก day1/day7 ที่提示ยังผ่านได้ปกติแค่ลดคุณภาพดาว)
        if (!attemptedWrongThisSentence && !(hintUsedThisSentence && isFinalReview)) {
          if (hintUsedThisSentence) rec.everHinted = true;
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
        } else {
          rec = WO_SRS.resetOnFail(rec);
          woServerFinish(s.th, false); // Phase 4: ผิด/ใช้คำใบ้ตอน day16 = รีเซ็ต
        }
        srsRecords[srsKey] = rec;
        woSaveSrs();
      }

      banner.className = 'result-banner ok show';
      banner.textContent = '✅ 排對了！+' + pts + ' 分' + (golden ? ' ✨黃金句' : '') + (cmult > 1 ? ' 🔥連對×' + cmult : '') + (hintUsedThisSentence ? '（用了提示）' : '');
      document.getElementById('wo-zh').innerHTML = '中文：<b>' + s.zh + '</b>';
      woShowSound(s.th);
      // Lin 2026-07-12: โชว์คำอธิบายว่าแต่ละคำแปลว่าอะไร (ตอนจบ)
      var _woRev=document.getElementById('wo-reveal');
      if(_woRev){
        _woRev.innerHTML='<div style="font-size:12px;color:#8B6310;font-weight:800;margin-bottom:6px;font-family:\'Noto Sans TC\',sans-serif;">每個字的意思</div>'+
          s.words.map(function(w){ return '<div style="display:flex;gap:10px;align-items:baseline;padding:4px 0;border-bottom:1px solid rgba(139,99,16,0.10);"><span style="font-family:\'Sarabun\',sans-serif;font-weight:700;color:#5a3e10;font-size:17px;min-width:74px;">'+w.th+'</span><span style="color:#666;font-family:\'Noto Sans TC\',sans-serif;font-size:13px;">'+w.zh+'</span></div>'; }).join('');
        _woRev.style.display='block';
      }
      // Lin 2026-07-12: คำในคลังใช้หมดแล้ว (มองไม่เห็นแต่ยังกินพื้นที่อยู่ opacity:0) → ซ่อนกล่องทั้งกล่องไปเลย กันช่องว่างเปล่าๆ ระหว่างช่องเฉลยกับ popup ผลลัพธ์
      var _wob=document.getElementById('wo-bank'); if(_wob)_wob.style.display='none';
      document.getElementById('wo-next-btn').disabled = false;
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
      try{ if(window.gtag) gtag('event','word_order_correct',{sentence:s.th, first_try: !attemptedWrongThisSentence}); }catch(e){}
    } else {
      attemptedWrongThisSentence = true;
      var deduct = WRONG_DEDUCT[Math.min(wrongCount, 3)];
      wrongCount++;                       // กฎ MASTER: นับผิดรวมทั้งประโยค (ไม่แยกคำ)
      life -= deduct;
      curCombo = 0;

      if (life <= 0) {
        var wasProof = curSentenceIsKnownCheck;
        failSentence(s, wasProof);
        try{ if(window.gtag) gtag('event','word_order_fail',{sentence:s.th, wrongs:wrongCount}); }catch(e){}
      } else {
        banner.className = 'result-banner no show';
        banner.textContent = '👧🏻 還沒對喔，別擔心～點一下格子裡的詞塊，再排排看 💕';
        Array.prototype.forEach.call(document.querySelectorAll('#wo-slots .wo-slot.filled'), function(el){
          el.classList.add('wrong');
          setTimeout(function(){ el.classList.remove('wrong'); }, 400);
        });
        updateHintWarning();
        updateScoreBar();  // Lin 2026-07-06: หลอด 本題分數 ลดสด+ไล่สีตอนเรียงผิด
        try{ if(window.gtag) gtag('event','word_order_wrong',{sentence:s.th, wrongs:wrongCount}); }catch(e){}
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
      try{ if(window.gtag) gtag('event','word_order_hint_death',{sentence:s.th}); }catch(e){}
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
    banner.className = 'result-banner show';
    banner.textContent = '證明你真的記得：接下來不會有提示，排對才會標記熟練 ✓';
  };

  window.woResetSentence = function(){
    if (locked) return;
    answer = []; used = {};
    document.getElementById('wo-banner').className = 'result-banner';
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
    el.innerHTML = '<div style="background:#FAEEDA;border:0.5px solid #EF9F27;border-radius:12px;padding:12px 14px;margin-bottom:12px;font-family:\'Noto Sans TC\',sans-serif;box-sizing:border-box;">' +
      '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">' +
        '<span style="font-size:14px;color:#633806;font-weight:700;flex:1;min-width:180px;">😊 先玩玩看也可以喔～登入後米娜才幫你把進度記起來 🌾</span>' +
        '<button onclick="woCtaLogin()" style="background:#BA7517;color:#fff;border:none;font-weight:700;padding:6px 16px;border-radius:8px;font-size:13px;cursor:pointer;">登入解鎖 →</button>' +
        '<button onclick="var d=document.getElementById(\'wo-cta-detail\');var s=d.style.display===\'none\';d.style.display=s?\'block\':\'none\';this.textContent=s?\'收起 ▲\':\'更多福利 ▾\';" style="background:transparent;border:none;color:#854F0B;font-size:13px;cursor:pointer;font-weight:700;">更多福利 ▾</button>' +
      '</div>' +
      '<div id="wo-cta-detail" style="display:none;margin-top:10px;border-top:0.5px solid #EF9F27;padding-top:10px;font-size:13px;color:#633806;line-height:1.8;">' +
        '✅ 登入後可以：<br>⭐ 累積星星＋泰國米勳章或其他禮物<br>🧠 智慧複習：記住你哪些句子學會了、哪些還要練，到期自動幫你排進來<br>🏆 登上排行榜和大家一起比<br>📈 下次打開，直接讓你練你的弱點' +
      '</div></div>';
  }
  window.woCtaLogin = function(){ try{ var b=document.querySelector('#rg-login-slot button'); if(b){b.click();return;} }catch(e){} if(window.READING_AUTH&&READING_AUTH.openLogin)READING_AUTH.openLogin(); };

  function finish(){
    document.getElementById('game').style.display = 'none';
    document.getElementById('end').style.display = 'flex';
    document.getElementById('pf').style.width = '100%';
    document.getElementById('prog-txt').textContent = SET.length + '/' + SET.length;

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

    try{ if(window.gtag) gtag('event','game_complete',{game:'word_order', score: weightedScore}); }catch(e){}
    // 嘗試存分數到共用排行榜系統（若後端還沒開放 'word_order' 這個 game key，
    // 這行會安全地無效果，不會讓遊戲壞掉 — 之後要接排行榜要請 Lin 到 Supabase 確認）
    try{ if(window.READING_AUTH && READING_AUTH.saveScore) READING_AUTH.saveScore(weightedScore,1,'word_order',rgWrongItemsFromLog()); }catch(e){}   // เฟส 3: แนบประโยคที่พลาด — 2026-07-13

    // 每週挑戰 + 連續天數／護盾（跟其他遊戲共用同一套邏輯）
    try { rgChallengeBump(maxCombo, isPerfect); } catch(e){}
    try {
      var _sv = rgApplyStreak();
      if (_sv.events.freezeUsed) rgToast('護盾幫你保住連續紀錄！🛡️');
      if (_sv.events.freezeEarned) rgToast('獲得新護盾 🛡️ ×1！連續' + _sv.state.streak + '天');
    } catch(e){}
    try { rgRenderGameBar(); } catch(e){}
    refreshUI();
    // เกมฟรี: นับรอบ + เด้งคำเชิญ "ขอ單字速查表" ครั้งเดียวหลัง ~5 รอบ (ปิดได้เล่นต่อ · เหมือนเกมอื่น)
    setTimeout(function(){ if (window.VocabPopup) window.VocabPopup.maybe(); }, 1100);
  }

  window.woRestart = function(){ init(); };
  window.woRerenderBar = rgRenderGameBar; // Lin 2026-07-12: ให้ reading-auth.js เรียก re-render แถบชวนล็อกอินได้ตอน auth เสร็จ (กันการ์ด "登入解鎖" ค้างทั้งที่ล็อกอินแล้ว)

  // ════════════════════════════════════════════
  // PDF 報告（本輪排過的句子 + 錯誤分析 + SRS下次複習日期）— Lin 2026-07-08
  // วิธีเดียวกับ typing-game.html/reading-game.html: render เป็น HTML ก่อน → html2canvas ถ่ายเป็นรูป → jsPDF
  // (jsPDF ฟอนต์มาตรฐานไม่รองรับภาษาไทย/จีนเลย ต้องผ่านรูปภาพแทน)
  // ════════════════════════════════════════════
  function _woLoadScript(url){
    return new Promise(function(resolve, reject){
      if (document.querySelector('script[src="'+url+'"]')) { resolve(); return; }
      var s = document.createElement('script'); s.src = url;
      s.onload = resolve; s.onerror = reject;
      document.head.appendChild(s);
    });
  }
  window.woDownloadReport = function(){
    var btn = document.getElementById('wo-pdf-btn');
    if (btn) { btn.disabled = true; btn.textContent = '📄 產生中…'; }
    Promise.all([
      _woLoadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js'),
      _woLoadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js')
    ]).then(function(){
      var SERIF = "'Noto Serif TC','PingFang TC',serif";
      var SANS = "'Noto Sans TC','PingFang TC',sans-serif";
      var today = new Date().toLocaleDateString('zh-TW',{year:'numeric',month:'2-digit',day:'2-digit'});
      var weightedScore = Math.round(score * LEVEL_WEIGHT);
      var loggedIn = woLoggedIn();

      function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
      function statusLabel(w){
        if (w.mastered) return '<span style="color:#8B6310;">✓ 已精通</span>';
        if (w.guide) return '<span style="color:#b06020;">💡 用提示</span>';
        if (w.failed) return '<span style="color:#c62828;">✗ 待加強</span>';
        return '<span style="color:#2e7d32;">✓ 答對</span>';
      }
      var rows = roundLog.map(function(w, i){
        return '<tr>'
          +'<td style="padding:7px 6px;font-size:12px;color:#888;text-align:center;">'+(i+1)+'</td>'
          +'<td style="padding:7px 6px;font-size:14px;font-weight:700;">'+esc(w.th)+'</td>'
          +'<td style="padding:7px 6px;font-size:12px;color:#666;">'+esc(w.zh)+'</td>'
          +'<td style="padding:7px 6px;font-size:12px;text-align:center;">'+statusLabel(w)+'</td>'
          +'<td style="padding:7px 6px;font-size:12px;text-align:center;">'+(w.wrong||0)+'</td>'
          +'<td style="padding:7px 6px;font-size:12px;text-align:center;font-weight:700;color:#8B6310;">+'+(w.pts||0)+'</td>'
          +'<td style="padding:7px 6px;font-size:11px;text-align:center;color:#8B6310;">'+(w.mastered?'已精通':(w.srsDue?w.srsDue:(loggedIn?'—':'未登入')))+'</td>'
          +'</tr>';
      }).join('');

      var weak = roundLog.filter(function(w){ return (w.wrong||0) > 0; }).sort(function(a,b){ return (b.wrong||0)-(a.wrong||0); }).slice(0,8);
      var weakHtml = weak.length
        ? weak.map(function(w){ return '<span style="display:inline-block;background:#fff3d8;border:1px solid #e8c070;border-radius:8px;padding:4px 10px;margin:3px;font-size:12px;">'+esc(w.th)+'（錯 '+w.wrong+' 次）</span>'; }).join('')
        : '<span style="font-size:12px;color:#888;">這輪沒有排錯的句子，太棒了！🎉</span>';

      var wrap = document.createElement('div');
      wrap.style.cssText = 'position:fixed;left:-9999px;top:0;width:640px;padding:24px;background:#FBF5E7;box-sizing:border-box;font-family:'+SERIF+';color:#1C1C1C;';
      wrap.innerHTML =
        '<div style="background:#fff;border:1px solid #C8973A;">'
        +'<table style="width:100%;background:#1C1C1C;border-bottom:3px solid #C8973A;border-collapse:collapse;"><tr>'
        +'<td style="padding:22px 26px;vertical-align:top;">'
        +'<div style="color:#fff;font-size:20px;font-weight:700;font-family:'+SERIF+';">泰語語序遊戲・本輪報告</div>'
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
        +'<th style="font-size:11px;color:#8B6310;padding:5px;">下次複習</th>'
        +'</tr></thead><tbody>'+rows+'</tbody></table>'
        +'<hr style="border:none;border-top:1px solid rgba(139,99,16,0.2);margin:14px 0;">'
        +'<div style="font-size:13px;font-weight:700;color:#8B6310;margin-bottom:6px;">⚠️ 弱點分析（排錯最多的句子）</div>'
        +'<div>'+weakHtml+'</div>'
        +(loggedIn?'':'<div style="margin-top:12px;font-size:11px;color:#b06020;">💡 登入後系統會記住每句的複習進度，下次能從弱點練起</div>')
        +'</div></div>'
        +'<div style="text-align:center;font-family:'+SANS+';font-size:9.5px;letter-spacing:0.15em;color:#8B6310;padding:16px 26px 4px;">泰華眼裡的泰語教學　·　mrtaihualin.com</div>';
      document.body.appendChild(wrap);

      return document.fonts.ready.then(function(){
        return html2canvas(wrap,{scale:2,useCORS:true,backgroundColor:'#ffffff',logging:false}).then(function(canvas){
          document.body.removeChild(wrap);
          var jsPDF = window.jspdf.jsPDF;
          var imgW = canvas.width/2, imgH = canvas.height/2;
          var pdf = new jsPDF({orientation:'portrait',unit:'px',format:[imgW,imgH]});
          pdf.addImage(canvas.toDataURL('image/jpeg',0.92),'JPEG',0,0,imgW,imgH);
          pdf.save('語序遊戲報告_'+WO_SRS.twDate()+'.pdf');
        });
      });
    }).catch(function(e){
      console.warn('PDF 產生失敗', e);
      try { rgToast('產生 PDF 失敗，請稍後再試 🙏'); } catch(e2) { alert('產生 PDF 失敗，請稍後再試'); }
    }).then(function(){
      if (btn) { btn.disabled = false; btn.textContent = '📄 下載 PDF 報告'; }
    });
  };

  document.addEventListener('DOMContentLoaded', init);
})();

// ── 換現代字體（跟其他遊戲共用同一個 localStorage key，切一次全站都套用）──
function rgToggleFont() {
  var on = document.body.classList.toggle('rg-modern-font');
  var btn = document.getElementById('rg-font-btn');
  if (btn) { btn.classList.toggle('active', on); btn.textContent = on ? '✍️ 換回標準字體' : '✍️ 換現代字體'; }
  try { localStorage.setItem('rg_modern_font', on ? '1' : '0'); } catch(e){}
}
(function(){ try { if (localStorage.getItem('rg_modern_font') === '1') { document.body.classList.add('rg-modern-font'); var b=document.getElementById('rg-font-btn'); if(b){b.classList.add('active');b.textContent='✍️ 換回標準字體';} } } catch(e){} })();

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
      body: JSON.stringify({ access_key:'b0b4c37b-6fad-4e64-9a16-81c5ab2ff4c3', subject:'[語序遊戲] 學生問題', from_name:'語序遊戲', email: email||'anonymous@game', message: msg }) })
    .then(function(r){ return r.json(); })
    .then(function(){ btn.textContent = '✅ 已送出！'; setTimeout(function(){ div.remove(); }, 1200); })
    .catch(function(){ btn.disabled=false; btn.textContent='送出問題 →'; alert('送出失敗，請稍後再試'); });
  };
}

// ── 單字庫徽章（如果之前在別的遊戲存過單字，這裡也看得到）──
document.addEventListener('DOMContentLoaded', function() {
  if (!window.WordVault) return;
  WordVault.injectStyles();
  var slot = document.getElementById('rg-vault-badge-slot');
  if (slot && WordVault.count() > 0) {
    var badge = document.createElement('a');
    badge.href = 'vault.html';
    badge.className = 'vault-badge';
    badge.id = 'vault-badge-rg';
    badge.innerHTML = '<img src="assets/icons/kratip-plain.svg" alt="" style="width:14px;height:18px;vertical-align:-4px;margin-right:3px;">單字庫';
    slot.appendChild(badge);
  }
});
