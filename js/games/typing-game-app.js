// ════════════════════════════════════════════
// FILE MAP: display helpers → config/state/scoring/SRS → sync + round selection → typing/answer UI → results/account → controls/analytics/init
// TONE MARK DISPLAY HELPER
// renders tone mark without ◌ — uses hidden ก as base via CSS ::before
// ════════════════════════════════════════════
function isCombining(s){
  if(!s||s.length===0)return false;
  var c=s.charCodeAt(0);
  // 0x0E31(ั), 0x0E34-0x0E3A(ิีึืฺุู) — above/below vowels
  // 0x0E47-0x0E4E — tone marks & diacritics
  // Exclude 0x0E32(า) and 0x0E33(ำ) — trailing vowels, visible standalone
  return(c===0x0E31)||(c>=0x0E34&&c<=0x0E3A)||(c>=0x0E47&&c<=0x0E4E);
}
// Returns HTML for a value.
// Thai combining chars need a base char in the SAME text run to render correctly.
// We insert a transparent ก as base in two cases:
//   1. v starts with combining char (ิ ี ่ ้ ุ ู ั ็ ...)
//   2. v starts with front vowel (เ แ) followed by combining char (เิ เ็ แ็ เีย เือ ...)
//      → front-vowel goes before the base; insert ก between front vowel and the rest
var FRONT_V_SET={'เ':1,'แ':1,'โ':1,'ไ':1,'ใ':1};
function dispHTML(v){
  if(!v)return'◌';
  var fc=v[0];
  if(isCombining(fc)){
    // case 1: combining char needs base before it
    return'<span class="comb-disp"><span class="comb-base">ก</span>'+v+'</span>';
  }
  if(FRONT_V_SET[fc]&&v.length>1){
    // Always insert transparent ก after front-vowel so suffix/combining chars
    // render at the correct position (เ[ก]ิ / โ[ก]ะ / เ[ก]า etc.)
    return fc+'<span class="comb-disp"><span class="comb-base">ก</span>'+v.slice(1)+'</span>';
  }
  return v;
}
// Set slot box content correctly
function setSlotContent(box, v, stateClass){
  if(!v){
    box.textContent='◌';
    box.className='slot-box empty-slot';
  } else {
    box.innerHTML=dispHTML(v);
    box.className='slot-box '+(stateClass||'filled');
  }
}

// ════════════════════════════════════════════
// DATA
// ════════════════════════════════════════════
var VOWEL_SYMBOL={
  'อะ':'ะ','อา':'า','ออ':'อ',
  'เอาะ':'เาะ','เออะ':'เะ',
  'โอ':'โ','ไอ':'ไ','ใอ':'ใ','โอะ':'โะ',
  'อุ':'ุ','อู':'ู',
  'อิ':'ิ','อี':'ี','อื':'ื','อึ':'ึ',
  'เอะ':'เะ','แอะ':'แะ',
  'เอ':'เ','แอ':'แ',
  'เออ':'เอ','เอา':'เา',
  'เอีย':'เีย','เอือ':'เือ','เอิ':'เิ',
  'อัว':'ัว','อั':'ั','อำ':'ำ',
  'แอ็':'แ็','เอ็':'เ็','อ็':'็','็อ':'็'
};

var CONS_GROUPS=[
  ['ก','ภ','ถ'],['ข','ช','ซ'],['ค','ด','ศ','ต'],['บ','ษ','ป'],
  ['พ','ฟ','ผ','ฝ'],['ม','ห','น','ฆ'],['อ','ย'],['ท'],
  ['ร','ธ'],['ล','ส','ฉ','จ'],['ง','ว'],['ฎ','ฏ'],
  ['ญ','ณ','ฌ'],['ฒ'],['ฬ'],['ฐ'],['ฑ'],['ฮ']
];
var VOWEL_GROUPS=[
  ['อะ','อา','ออ'],['เอาะ','เออะ'],['โอ','ไอ','ใอ'],['โอะ'],
  ['อุ','อู'],['อิ','อี','อื','อึ'],['เอะ','แอะ'],['เอ','แอ'],
  ['เออ','เอา'],['เอีย','เอือ','เอิ'],['อัว','อั','อำ'],
  ['แอ็','เอ็'],['อ็','็อ']
];
var FINAL_GROUPS=[
  ['ม','น'],['ณ','ญ'],['ร','ธ'],['ฬ'],['ย'],['ง','ว','จ'],
  ['ข','ช','ซ'],['ก','ถ'],['ค','ต','ด'],['ฆ'],['พ','ภ','ฟ'],
  ['ฎ','ฏ'],['ฑ'],['ฒ'],['ฐ'],['ล','ส'],['ศ'],['ษ','บ'],['ท']
];
var TONE_POOL=['่','้','๊','๋','์'];

function poolOf(g){var p=[];g.forEach(function(x){x.forEach(function(y){if(p.indexOf(y)<0)p.push(y);});});return p;}
var CP=poolOf(CONS_GROUPS),VP=poolOf(VOWEL_GROUPS),FP=poolOf(FINAL_GROUPS);

// ลำดับ slot ตามการเขียนจริง: ซ้ายไปขวา + ล่างขึ้นบน
// → 2 กรณีเท่านั้น: สระหน้า (เขียนซ้ายสุดก่อน) vs ทุกสระอื่น (พยัญชนะก่อน แล้วสระ แล้ววรรณยุกต์)
function getSlotOrder(vowel,final){
  var sym=VOWEL_SYMBOL[vowel]||vowel;
  // สระหน้า (เ แ โ ไ ใ): สระ → พยัญชนะ → วรรณยุกต์ → ตัวสะกด
  if(FRONT_V_SET[sym[0]])return['vowel','cons','tone','final'];
  // สระบน/ล่าง เกาะพยัญชนะ (ิ ี ึ ื ั ุ ู ็): วรรณยุกต์ซ้อนบนสระ → พยัญชนะ → สระ → วรรณยุกต์ → ตัวสะกด
  // ยกเว้น "อัว" ที่มีตัวสะกด (เช่น ด้วย/ช่วย) → ั หาย เขียนเป็น ว ลอย วรรณยุกต์กลับไปอยู่บนพยัญชนะ
  var attached=false;
  if(!(vowel==='อัว'&&final)){
    for(var i=0;i<sym.length;i++){ if(isCombining(sym[i])){ attached=true; break; } }
  }
  if(attached)return['cons','vowel','tone','final'];
  // สระขวา/ลอย (า อ ะ ำ): วรรณยุกต์เขียนบนพยัญชนะ จึงมาก่อนสระ → พยัญชนะ → วรรณยุกต์ → สระ → ตัวสะกด
  return['cons','tone','vowel','final'];
}

// ════════════════════════════════════════════
// PHONETIC MAPS
// ════════════════════════════════════════════
// Lin 2026-07-27: เอาระบบ CONS_SOUND + FINAL_SOUND ออกทั้งหมด (ทั้งสองตาราง ไม่เหลือแม้แต่ส่วนมาตรฐาน)
// เหตุผล: Lin จะตรวจ+แก้ฟิลด์ cons/vowel/final ในข้อมูลเองให้ถูกต้องโดยตรงทีละคำ (ผ่าน Current Content source
// data/words-data.js + data/adv-sentences.js) แทนที่จะให้เกมคอย "แปลงเสียง" ผ่านตารางอีกชั้น —
// ตอนนี้ 尾音 ในหน้าเฉลยโชว์ค่าที่เก็บในข้อมูลตรงๆ ไม่มีการแปลง/ลูกศรแสดงเสียงอีกต่อไป
var VOWEL_READ={
  'อะ':'อะ（短母音）','อา':'อา（長母音）','ออ':'ออ',
  'เอาะ':'เอาะ','เออะ':'เออะ（短母音）',
  'โอ':'โอ','ไอ':'ไ','ใอ':'ใ',
  'โอะ':'โอะ（短母音）',
  'อุ':'อุ（短母音）','อู':'อู（長母音）',
  'อิ':'อิ（短母音）','อี':'อี（長母音）',
  'อื':'อือ（長母音）','อึ':'อึ（短母音）',
  'เอะ':'เอะ（短母音）','แอะ':'แอะ（短母音）',
  'เอ':'เอ（長母音）','แอ':'แอ（長母音）',
  'เออ':'เออ','เอา':'เอา',
  'เอีย':'เอีย','เอือ':'เอือ','เอิ':'เออ',
  'อัว':'อัว','อั':'อะ（有尾音）','อำ':'อำ',
  // ตัวลวงสระลดรูป (มีตัวสะกด) — Lin สั่ง 2026-07-10: ต้องโชว์เป็นสระตัวจริง ไม่ใช่รูปลดรูป
  'แอ็':'แอะ（有尾音）','เอ็':'เอะ（有尾音）','อ็':'เอาะ（有尾音）','็อ':'เอาะ（有尾音）'
};

// ════════════════════════════════════════════
// WORDS  — tone_name: ให้ Lin ตรวจสอบก่อนใช้งานจริง
// ════════════════════════════════════════════
// 5 tones: สามัญ เอก โท ตรี จัตวา
var WORDS = buildWordsForPhonicsGames(WORDS_MASTER); // 2026-07-11: ย้ายคำเดี่ยวไปเก็บที่ words-data.js (ใช้ร่วมกับเกมเสียง/เกมพิมพ์)

// ════════════════════════════════════════════
// ✅ 2026-07-11: กลับมาใช้ adv-sentences.js ร่วมกันแล้ว (ก่อนหน้านี้แยก copy ไว้เอง ไม่ sync กับ reading-game.html) ตอนนี้ 4 เกมใช้ข้อมูลชุดเดียวกัน
var WORDS_HIGH = buildSentencesForPhonicsGames(ADV_SENTENCES); // 2026-07-11: ย้ายประโยค高級กลับไปเก็บที่ adv-sentences.js (ใช้ร่วมกับ 4 เกม)
WORDS = WORDS.concat(WORDS_HIGH);

// Lin 2026-07-30: เอาระบบ猜聲調 (ทายเสียงวรรณยุกต์ +1 แต้ม) ออกทั้งเกม — ตาราง BONUS_TONES/ปุ่มทาย/แต้มโบนัสถูกลบหมด
// กล่อง #bonus-section เหลือหน้าที่เดียว: โชว์คำอธิบายเฉลย (renderBonusReason) อัตโนมัติตอนเฉลย

function buildRevealRules(w){
  // Lin 2026-07-30: เปลี่ยนมาใช้ตัวสร้างแถวเฉลยกลาง buildAnswerRows (data/tone-engine.js) — รูปแบบเดียวกัน 3 เกม
  // (ใช้กับ 初/中 เท่านั้น — 高級 ประโยคโชว์คำแปลรายคำแบบเดิม ไม่ผ่านฟังก์ชันนี้)
  // ลูกศรเสียง (ญ→ย, ติ→ด) มาจากฟิลด์ consRead/finalRead/finalDisp/silent ที่ Lin ตรวจ 100% ในคลังเท่านั้น
  return buildAnswerRows(w).map(function(r){return {tag:r.tag,sp:false,text:r.text};});
}

// Lin 2026-07-15: TH_ENGINE + computeToneFromSpelling + buildToneReason ย้ายไปรวมเป็นไฟล์เดียว
// data/tone-engine.js แล้ว (ก่อนหน้านี้ก็อปปี้เหมือนกันเป๊ะอยู่ 3 ที่: tone-finder.html/reading-game.html/
// typing-game.html — แก้บั๊กอักษรนำ+ตัวการันต์ที่ไฟล์เดียวพอ) โหลดผ่าน <script src="data/tone-engine.js">
// ด้านบน ได้ตัวแปร/ฟังก์ชันชื่อเดิมเป๊ะ (TH_ENGINE, computeToneFromSpelling, buildToneReason,
// TONE_CLASS_ZH, TONE_MARK_NAME, TONE_NUM_NAME) ใช้ต่อได้โดยไม่ต้องแก้โค้ดข้างล่างนี้เลย

// Lin 2026-07-30 (แก้อีกรอบ): ทำหน้าตากล่องเฉลย 初級 ให้เหมือน 中級 เป๊ะๆ
// (📍 หัวคำ（第X聲）+ แถวเฉลยเปล่าๆ ต่อกัน — ตัดบรรทัด 💡 เหตุผลวรรณยุกต์ทิ้ง เพราะ 中 ไม่มีบรรทัดนี้)
function renderBonusReason(w){
  var el=document.getElementById('bonus-reason');
  if(!el)return;
  if(!w||!w.th){ el.className='bonus-reason'; return; }
  el.innerHTML='';
  var head=document.createElement('div');
  head.className='rule-row';
  head.style.cssText='margin-top:0;font-weight:800;color:#8B6310;';
  head.textContent='📍 '+buildAnswerHeader(w);
  el.appendChild(head);
  var rules=buildRevealRules(w);
  rules.forEach(function(r){
    var row=document.createElement('div');row.className='rule-row';
    var tag=document.createElement('span');tag.className='rule-tag'+(r.sp?' sp':'');tag.textContent=r.tag;
    var txt=document.createElement('span');txt.className='rule-txt';txt.innerHTML=r.text;
    row.appendChild(tag);row.appendChild(txt);el.appendChild(row);
  });
  el.className='bonus-reason show';
}

// ════════════════════════════════════════════
// STATE
// ════════════════════════════════════════════
// Lin 2026-07-31: จำนวนคำ/ประโยคต่อชุด แยกตามระดับ — 初/中=5 คำ, 高=3 ประโยค
var ROUND_SIZE_BY_LEVEL={'初':5,'中':5,'高':3};
function tgRoundSize(){return ROUND_SIZE_BY_LEVEL[curLevel]||5;}
// ── กฎ MASTER 2026-07-05: ตัวคูณระดับ soft = ชุดเดียวกับดาวเงิน (初1/中1.5/高2) + คูณ "ทั้งรอบตอนจบ" (เลิกคูณต่อคำ) ──
var LEVEL_WEIGHT={'初':1,'中':1.5,'高':2};
var COMBO_TIERS={3:1.5,5:2,8:3};               // คอมโบตอบสะอาดติดกัน → ตัวคูณแต้ม (ลอกเกมอ่าน/เกมเสียง)
function rgComboMult(streak){return streak>=8?3:(streak>=5?2:(streak>=3?1.5:1));}
var SRS_REVIEW_BONUS=[3,2,1];                  // Phase 1: New+3 · Day 1+2 · รอบตัดสิน Day 7+1
var ROUND_COMPLETE_BONUS=20;                   // จบรอบ +20
var ROUND_PERFECT_BONUS=50;                    // จบรอบแบบ perfect เพิ่มอีก +50 (รวม 70)
var GOLDEN_WORD_CHANCE=0.18;                   // โอกาสคำทอง ~18%/คำ (สเปกเดียวกับเกมเสียง)
var GOLDEN_WORD_MULT=2;                        // คำทองตอบถูกครั้งแรก ×2
// ── กฎ Lin 2026-07-05: คะแนนต่อคำ/ประโยค (เฉพาะเกมพิม ต่างจากเกมอ่าน) ──
// นับ "จำนวนผิดสะสมทั้งคำ/ประโยค" (ไม่แยกทีละพยางค์) เทียบกับโควต้าที่ขยายตามจำนวนพยางค์ 1-4=4 / 5=5 / ... / 9+=9 (เพดาน)
// คะแนนแบ่งขั้นเท่ากันจาก 10 ลงไป 0 ตามจำนวนขั้น=โควต้า · ผิดครบโควต้า = fail (0 คะแนน + เฉลย + เข้า SRS วันถัดไป)
// Lin 2026-07-06: สีหลอดคะแนนต่อข้อ ทองเข้ม→แดง (ชุดเดียวทุกเกม)
function tgScoreBarColor(sc,max){ if(sc<=0)return '#b83227'; var f=Math.max(0,Math.min(1,sc/(max||10))); var hue=f>=0.4?40:Math.round(40*(f/0.4)); var light=f>=0.4?42:38; return 'hsl('+hue+',78%,'+light+'%)'; }
// 本題分數: คะแนนที่จะได้ของคำนี้ตอนนี้ ตามจำนวนครั้งที่ผิดสะสม · ตาย/ใช้คำใบ้=0
function tgCurWordScore(){ try{ if((typeof wordFailed!=='undefined'&&wordFailed)||(typeof wordUsedGuide!=='undefined'&&wordUsedGuide))return 0; var sc=tgScoreSylCount(); return rgWrongScore(sc,(typeof wordWrongTotal!=='undefined'?wordWrongTotal:0)); }catch(e){return 10;} }
function tgUpdateScoreBar(){ var max=10, sc=Math.max(0,Math.min(10,tgCurWordScore())); var pw=document.getElementById('tg-ws-fill'); if(pw){pw.style.width=Math.max(0,Math.min(100,sc/max*100))+'%'; pw.style.background=tgScoreBarColor(sc,max);} var pn=document.getElementById('tg-ws-num'); if(pn)pn.textContent=sc; }
function rgQuotaFor(sylCount){return window.TYPING_SCORE?TYPING_SCORE.quotaFor(sylCount):Math.min(4+Math.max(0,(sylCount||1)-4),9);}
function rgWrongScore(sylCount,wrongN){
  return window.TYPING_SCORE?TYPING_SCORE.score(sylCount,wrongN):(wrongN>=rgQuotaFor(sylCount)?0:Math.round(10-(10/rgQuotaFor(sylCount))*wrongN));
}
var RG_LEVEL_TO_NUM={'初':1,'中':2,'高':3}; // map ให้ตรงกับ GAME_ACCOUNT.addHardStars(clean, level:1|2|3) — ลอกเกมอ่านเป๊ะ (Lin 2026-07-05, แก้บั๊กเดิมที่ 高 เคยตกไปนับเป็นระดับ 1)
var curLevel='初';
var roundQueue=[],cur=0,okC=0,badC=0,streak=0,maxStreak=0,roundScore=0,cleanC=0,roundTotal=0,roundHadGuide=false;
var tgRoundActive=false;
var roundLog=[]; // {th,zh,wrong,failed,guide,pts,srsDue,mastered} ต่อคำ — เอาไว้ทำรายงาน PDF ท้ายรอบ — Lin 2026-07-07
var roundReport=null;
function tgReportRows(){
  if(!roundReport||!roundReport.items)return [];
  return roundReport.items.map(function(i){return {th:i.question,zh:i.meaning,wordGlosses:i.words,reading:i.linguistic&&i.linguistic.reading_th||'',userAnswer:i.user_answer,correctAnswer:i.correct_answer,wrong:i.wrong_count,failed:!i.is_correct,guide:!!i.hint_used,pts:i.item_score,srsDue:i.srs_state||'',mastered:!!i.mastered_state,attempts:i.attempts};});
}
function rgLogWord(o){
  try{
    var idx=roundQueue[cur];
    var w=WORDS[idx];
    var wordGlosses=(w&&w.words&&w.words.length)?w.words.map(function(part){return {th:part.th||'',zh:part.zh||''};}):null;
    var submitted=w&&w.th?w.th:'';
    var base={th:w?w.th:'',zh:w?w.zh:'',wordGlosses:wordGlosses,reading:w&&w.readingTH?w.readingTH:'',userAnswer:submitted,correctAnswer:submitted,wrong:wordWrongTotal||0,attempts:submitted?[{answer:submitted,is_correct:true}]:[],failed:false,guide:false,pts:0,srsDue:'',mastered:false};
    for(var k in o){ if(Object.prototype.hasOwnProperty.call(o,k)) base[k]=o[k]; }
    roundLog.push(base);
    if(roundReport&&window.RoundReport)RoundReport.addItem(roundReport,{content_ref:{source:(w&&w.words&&w.words.length)?'game_sentences':'game_words',key:(w&&w.words&&w.words.length)?w.th:(w.th+'@'+(RG_LEVEL_TO_NUM[curLevel]||1))},question:base.th,meaning:base.zh,attempts:base.attempts,user_answer:base.userAnswer,correct_answer:base.correctAnswer,is_correct:!base.failed&&!base.guide&&base.wrong===0,wrong_count:base.wrong,item_score:base.pts,hint_used:!!base.guide,linguistic:{reading_th:base.reading,syls:w&&w.syls||null,read_syls:w&&w.readSyls||null},words:wordGlosses||[],srs_state:base.srsDue||null,mastered_state:!!base.mastered});
  }catch(e){}
}
// 2026-07-13 Lin：ดึงคำที่พลาดในรอบนี้จาก roundLog ไปเก็บลง reading_sessions.wrong_items (ฐานข้อมูลจุดอ่อน)
function rgWrongItemsFromLog(){
  try{ return roundLog.filter(function(w){return (w.wrong||0)>0||w.failed;}).map(function(w){return {th:w.th,zh:w.zh,wrong:w.wrong||0};}); }
  catch(e){ return []; }
}
var picks=[],comps=[],correctSet=[],needN=0;
var checked=false,wrongCount=0;
// wordToneBonus ถูกลบแล้ว (เอา猜聲調ออก 2026-07-30) — ไม่มีแต้มโบนัสวรรณยุกต์อีกต่อไป
// ── SRS ใหม่ (กฎ MASTER ข้อ 7, ลอกเกมอ่าน 2026-07-05): stage-based 1→7→16 วัน แทน masteredSet/correctCountMap/reviewDates/dirtyMap เดิม ──
var RG_SRS_CFG={INTERVALS:[1,7],CLEAN_ROUNDS_TO_MASTER:3}; // New → Day 1 → Day 7 → Mastered
var RG_SRS={
  cfg:RG_SRS_CFG,
  twDate:function(ms){var d=(ms==null)?new Date():new Date(ms);try{return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei'}).format(d);}catch(e){return d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2);}},
  twDatePlusDays:function(ms,days){return this.twDate((ms==null?Date.now():ms)+(days||0)*86400000);},
  blank:function(){return {stage:0,dueDate:'',dueAt:0,everFailed:false,mastered:false};},
  isDue:function(rec,nowMs){
    if(!rec||rec.mastered)return false;
    var today=this.twDate(nowMs||Date.now());
    if(rec.dueDate)return rec.dueDate<=today;
    if(rec.dueAt)return this.twDate(rec.dueAt)<=today;
    return true;
  },
  isFinalCheck:function(rec){return !!rec && rec.stage===(this.cfg.CLEAN_ROUNDS_TO_MASTER-1);},
  advanceOnClean:function(rec,nowMs){
    rec=rec||this.blank();nowMs=nowMs||Date.now();
    var justPassedStage=rec.stage;
    rec.stage+=1;
    if(rec.stage>=this.cfg.CLEAN_ROUNDS_TO_MASTER){rec.mastered=true;return {rec:rec,justMastered:true,clean:!rec.everFailed};}
    var days=this.cfg.INTERVALS[justPassedStage]||this.cfg.INTERVALS[this.cfg.INTERVALS.length-1];
    rec.dueDate=this.twDatePlusDays(nowMs,days);rec.dueAt=nowMs+days*86400000;
    return {rec:rec,justMastered:false,clean:!rec.everFailed};
  },
  resetOnFail:function(rec){rec=rec||this.blank();rec.stage=0;rec.dueDate='';rec.dueAt=0;rec.everFailed=true;return rec;}
};
// Lin 2026-07-15: เปลี่ยน key จาก "ลำดับ index ใน WORDS" เป็น "คำ+ระดับ" (rgSrsKey) กันบั๊ก —
// เดิม key เป็นตำแหน่งเลขในลิสต์ พอ Lin เพิ่ม/ลบคำ ตำแหน่งขยับ ความจำของนักเรียนที่เคยเล่นแล้วจะไปติดผิดคำ
// ฝั่งเซิร์ฟเวอร์ (tone_srs_state, tone-round) เก็บด้วย "คำ+ระดับ" อยู่แล้วเป็นความจริงหลัก — อันนี้แค่ทำให้ local ตรงกัน
function rgSrsKey(w){ return (w&&w.th||'')+'@'+(RG_LEVEL_TO_NUM[w&&w.level]||0); }
var srsRecords={}; // key = rgSrsKey(word) → SRS record
function rgSrsGet(key){return srsRecords[key]||null;}
function rgSrsSet(key,rec){srsRecords[key]=rec;}
function rgLoggedIn(){ try{ return !!(window.READING_AUTH && READING_AUTH.user); }catch(e){ return false; } }
var SAVE_KEY='rgv3_save';
var rememberStep=0,rememberTimer=null,curWordIsKnownCheck=false; // curWordIsKnownCheck: ด่านพิสูจน์ 已記得 (ไม่มีคำใบ้ ไม่ได้แต้ม/ดาว)
var wordUsedGuide=false; // งาน 9: เปิดคำใบ้ระหว่างคำนี้ไหม (ถ้าใช่ = 0 คะแนน + ไม่นับ SRS/ดาว)
var wordWrongTotal=0; // นับผิดสะสม "ทั้งคำ/ประโยค" (ไม่แยกพยางค์) ใช้กับ rgWrongScore()
// ── ปุ่มครับ/ค่ะ/คะ ท้ายประโยค高級 (Lin 2026-08-01) — เกมพิมพ์ "ให้พิมพ์ได้จริง" (ต่างจากเกมอ่านที่ไม่โชว์เลย) แต่ "ไม่นับคะแนนถ้าผิด"
//   วิธีทำ: ต่อพยางค์ synthetic เข้า sylList จริง (พิมพ์ได้ มีกล่องเฉลย子音/母音/尾音เหมือนพยางค์อื่น) แต่ isParticle:true กันไว้ไม่ให้กระทบ wordWrongTotal/sylCount ที่ใช้คิดคะแนน
var TG_PARTICLE_SYLS={
  'ครับ':{th:'ครับ',read:'ครับ',cons:'ค',cluster:'ร',vowel:'อะ',final:'บ',tone_name:'ตรี',en:'kráp',isParticle:true},
  'ค่ะ':{th:'ค่ะ',read:'ค่ะ',cons:'ค',vowel:'อะ',tone:'่',tone_name:'เอก',en:'khà',isParticle:true},
  'คะ':{th:'คะ',read:'คะ',cons:'ค',vowel:'อะ',tone_name:'ตรี',en:'khá',isParticle:true}
};
var tgParticleMode=(function(){try{return localStorage.getItem('games_particle_mode')||'off';}catch(e){return 'off';}})();
function tgShowParticleFor(w){
  if(!w) return null;
  if(tgParticleMode==='m') return 'ครับ';
  if(tgParticleMode==='f') return w.politeF||'ครับ'; // ไม่มี politeF (ประโยคขึ้นด้วยผม) → บังคับครับต่อ เหมือนเกมเสียง/เกมอ่าน
  return null;
}
// จำนวนพยางค์ที่ใช้คิดโควต้า/คะแนนจริง — ไม่นับพยางค์ครับ/ค่ะ/คะ synthetic ที่ต่อท้าย (ถ้ามี) เพราะไม่เกี่ยวกับคะแนนเลย
function tgScoreSylCount(){
  if(sylList&&sylList.length&&sylList[sylList.length-1]&&sylList[sylList.length-1].isParticle) return sylList.length-1;
  return (sylList&&sylList.length)?sylList.length:1;
}
function tgSyncParticleBtn(){
  var b=document.getElementById('rg-particle-toggle');
  if(!b) return;
  var isHigh=(typeof WORD!=='undefined'&&WORD&&WORD.level==='高');
  if(!isHigh){ b.style.display='none'; return; }
  b.style.display='';
  b.setAttribute('data-mode',tgParticleMode);
  b.title=tgParticleMode==='m'?'目前：句尾加「ครับ」（男生禮貌詞・可以打字，但不計分）':(tgParticleMode==='f'?'目前：句尾加「ค่ะ/คะ」（女生禮貌詞・可以打字，但不計分）':'目前：不加句尾禮貌詞');
  b.setAttribute('aria-label',b.title);
}
function tgToggleParticleMode(){
  tgParticleMode=(tgParticleMode==='off')?'m':(tgParticleMode==='m'?'f':'off');
  try{localStorage.setItem('games_particle_mode',tgParticleMode);}catch(e){}
  loadWord(); // เปลี่ยนโหมดกลางคำ = โหลดคำนี้ใหม่ (ต่อ/ตัด syllable ครับ ออกจาก sylList จริง ต้องเริ่มพิมพ์คำนี้ใหม่)
}
var totalStars=0,totalBadges=0;
var W=null;
var WORD=null,sylList=[],sylIdx=0,wordHadWrong=false,wordFailed=false; // 中級 หลายพยางค์
var wordGolden=false; // คำทอง (18%/คำ) — ตอบถูกครั้งแรกล้วน (ไม่มีผิดเลยทั้งคำ) = ×2
var optTypes={};
var optTiles=[],correctVal={}; // ระบบไทล์ผูกช่อง (กันบั๊ก "ค่าซ้ำข้ามช่อง" เช่น อ+ออ)
function tileById(id){for(var i=0;i<optTiles.length;i++)if(optTiles[i].id===id)return optTiles[i];return null;}
function allSlotsFilled(){return comps.every(function(c){return slotFills[c]!=null;});}
var slotFills={};
// ── ช่องที่กำลังเล็ง (วางตัวอักษรลงช่องนี้) — แก้ปัญหาตัวอักษรหน้าตาซ้ำกัน ──
var activeSlot=null, slotSeq=[];
function slotOfTile(id){for(var i=0;i<slotSeq.length;i++){if(slotFills[slotSeq[i]]===id)return slotSeq[i];}return null;}
function nextEmptySlot(){for(var i=0;i<slotSeq.length;i++){if(slotFills[slotSeq[i]]==null)return slotSeq[i];}return null;}
function setActiveSlot(c){activeSlot=c;updateActiveSlot();}
function updateActiveSlot(){
  slotSeq.forEach(function(c){
    var box=document.getElementById('sb-'+c);if(!box)return;
    box.classList.toggle('active', c===activeSlot && !checked);
  });
}

// ════════════════════════════════════════════
// STORAGE
// ════════════════════════════════════════════
function loadSave(){
  try{
    var raw=localStorage.getItem(SAVE_KEY);
    if(raw){var d=JSON.parse(raw);srsRecords=d.srsRecords||{};totalStars=d.totalStars||0;totalBadges=d.totalBadges||0;}
  }catch(e){}
}
function doSave(){
  try{localStorage.setItem(SAVE_KEY,JSON.stringify({srsRecords:srsRecords,totalStars:totalStars,totalBadges:totalBadges}));}catch(e){}
}

// ════════════════════════════════════════════
// ── Lin 2026-07-13: ซิงก์ SRS "ข้ามเครื่อง" — อ่านกลับจาก Supabase (tone_srs_state, game='typing') → merge เข้า srsRecords ──
//   • อ่านอย่างเดียว · เขียนขึ้นเซิร์ฟเวอร์ยังเป็นหน้าที่ tone-round เหมือนเดิม (ดาว/กันโกงไม่แตะ)
//   • 2026-07-15: เปลี่ยนมาใช้ key "คำ+ระดับ" ตรงกับฝั่งเซิร์ฟเวอร์เป๊ะ ไม่ต้องแปลง index อีกแล้ว
//     (เดิมต้องสแกนหา index ใน WORDS ก่อน merge — พอ Lin แก้ไฟล์คำ ตำแหน่งขยับ ก็เคย merge ผิดคำได้)
//   • หมายเหตุ: เกมพิมพ์+เกมอ่านใช้ SAVE_KEY 'rgv3_save' เดียวกัน (แชร์ SRS ในเครื่องเป็นดีไซน์เดิม) —
//     ใช้ key "คำ+ระดับ" เหมือนกันทั้ง 2 เกมแล้ว การแชร์นี้เลยไม่พึ่งพาลำดับ WORDS ต้องตรงกันอีกต่อไป
//     merge เลือก "อันก้าวหน้ากว่า" อย่างเดียว → ไม่มีทาง downgrade คำที่จำได้จากอีกเกม (ทดสอบกดจริง 8/8)
// ════════════════════════════════════════════
function tgSrsRank(r){ if(!r) return -1; if(r.mastered) return 3; return (r.stage||0); }
function tgSrsPickAdvanced(a,b){ if(!a)return b; if(!b)return a; var ra=tgSrsRank(a),rb=tgSrsRank(b); if(ra!==rb)return ra>rb?a:b; var da=a.dueDate||'',db=b.dueDate||''; if(da!==db)return (da>db)?a:b; return a; }
var __tgSrsSyncPromise=null;
window.__tgSrsSyncedOnce=false;
var __tgLearningOwnerEpoch=0;
var __tgSrsRequestSequence=0;
var __tgLatestSrsRequest=0;
function tgSrsOwnerCurrent(ownerId,ownerEpoch,requestId){
  var currentId=(window.READING_AUTH&&READING_AUTH.user&&String(READING_AUTH.user.id))||'';
  var currentEpoch=Number(window.SITE_AUTH&&SITE_AUTH.learningOwnerEpoch)||0;
  if(currentId!==ownerId||currentEpoch!==ownerEpoch)return false;
  if(requestId!=null&&requestId!==__tgLatestSrsRequest)return false;
  try{return !!(window.PHASE1_ACCOUNT_BOUNDARY&&localStorage.getItem(PHASE1_ACCOUNT_BOUNDARY.ownerKey)===ownerId);}catch(e){return false;}
}
function tgResetAccountStateAtBoundary(){
  var epoch=(window.SITE_AUTH&&SITE_AUTH.learningOwnerEpoch)||0;
  if(!epoch||epoch===__tgLearningOwnerEpoch)return false;
  __tgLearningOwnerEpoch=epoch;srsRecords={};totalStars=0;totalBadges=0;
  __tgLatestSrsRequest=++__tgSrsRequestSequence;
  __tgSrsSyncPromise=null;window.__tgSrsSyncedOnce=false;
  return true;
}
function tgSyncSrsFromServer(force){
  try{ if(!rgLoggedIn()) return Promise.resolve(false); }catch(e){ return Promise.resolve(false); }
  if(__tgSrsSyncPromise) return __tgSrsSyncPromise;
  var sb=window.getSupabaseClient?window.getSupabaseClient():null;
  if(!sb||!sb.from) return Promise.resolve(false);
  // dedupe fetch 2026-07-20: tgWireSrsSync รีเซ็ต __tgSrsSyncPromise แล้วเรียกฟังก์ชันนี้ใหม่ทุกครั้งที่ SITE_AUTH.onChange ยิง
  //   (หลายรอบต่อโหลดหน้าเดียว) → ห่อ fetch ด้วย getCachedFetch กันยิง Supabase ซ้ำทั้งที่ user เดิม
  var _uid=String(READING_AUTH.user.id);
  var _ownerEpoch=Number(window.SITE_AUTH&&SITE_AUTH.learningOwnerEpoch)||0;
  var _requestId=++__tgSrsRequestSequence;__tgLatestSrsRequest=_requestId;
  var _fetchSrs = window.getCachedFetch
    ? window.getCachedFetch('tone_srs_state:typing:'+_uid, function(){
        return sb.from('tone_srs_state').select('level, word, stage, due_date, ever_failed, mastered').eq('user_id',_uid).eq('game','typing');
      })
    : sb.from('tone_srs_state').select('level, word, stage, due_date, ever_failed, mastered').eq('user_id',_uid).eq('game','typing');
  __tgSrsSyncPromise = _fetchSrs
    .then(function(res){
      if(!tgSrsOwnerCurrent(_uid,_ownerEpoch,_requestId))return false;
      if(res.error||!res.data){ window.__tgSrsSyncedOnce=true; return false; }
      var changed=false;
      res.data.forEach(function(row){
        var key=(row.word||'')+'@'+(row.level||0);
        var srv={stage:row.stage||0,dueDate:row.due_date||'',dueAt:0,everFailed:!!row.ever_failed,mastered:!!row.mastered};
        var cur=srsRecords[key];
        var win=tgSrsPickAdvanced(cur,srv);
        if(!cur || win.stage!==cur.stage || (win.dueDate||'')!==(cur.dueDate||'') || (!!win.mastered)!==(!!cur.mastered)){
          srsRecords[key]=win; changed=true;
        }
      });
      if(changed) doSave();
      window.__tgSrsSyncedOnce=true;
      return changed;
    })
    .catch(function(){ if(!tgSrsOwnerCurrent(_uid,_ownerEpoch,_requestId))return false; window.__tgSrsSyncedOnce=true; return false; });
  return __tgSrsSyncPromise;
}
// ⚠️ ต้องลงทะเบียน "หลัง DOM พร้อม" เพราะสคริปต์เกม (inline) รันก่อนสคริปต์ defer (auth-widget) → ตอน parse ยังไม่มี SITE_AUTH
function tgWireSrsSync(){
  try{
    if(window.SITE_AUTH && SITE_AUTH.onChange){
      SITE_AUTH.onChange(function(u){
        tgResetAccountStateAtBoundary();
        if(!u) return;
        var ownerId=String(u.id),ownerEpoch=Number(SITE_AUTH.learningOwnerEpoch)||0;
        if(!window.__tgSrsSyncedOnce){ tgSyncSrsFromServer(true).then(function(){ if(!tgSrsOwnerCurrent(ownerId,ownerEpoch))return; try{ initGame(); }catch(e){} }); }
        else { __tgSrsSyncPromise=null; tgSyncSrsFromServer(true); }
      });
    }
  }catch(e){}
  // fallback แบบ poll — กันกรณี onChange ไม่ยิงตอนโหลด หรือ READING_AUTH พร้อมช้า · ลองทุก 0.5วิ จนซิงก์สำเร็จ สูงสุด ~12วิ
  var _tgT=0, _tgIv=setInterval(function(){
    _tgT++;
    try{
      if(window.__tgSrsSyncedOnce){ clearInterval(_tgIv); return; }
      if(rgLoggedIn()){ var ownerId=String(READING_AUTH.user.id),ownerEpoch=Number(SITE_AUTH&&SITE_AUTH.learningOwnerEpoch)||0; tgSyncSrsFromServer(true).then(function(){ if(!tgSrsOwnerCurrent(ownerId,ownerEpoch))return; try{ initGame(); }catch(e){} }); }
    }catch(e){}
    if(_tgT>=24) clearInterval(_tgIv);
  }, 500);
}
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', tgWireSrsSync); else tgWireSrsSync();

// ════════════════════════════════════════════
// UTILS
// ════════════════════════════════════════════
function shuffle(a){a=a.slice();for(var i=a.length-1;i>0;i--){var j=Math.floor(Math.random()*(i+1));var t=a[i];a[i]=a[j];a[j]=t;}return a;}
function rnd(a){return a[Math.floor(Math.random()*a.length)];}

function buildOpts(ans,groups,pool2,count,exclude){
  var grp=null;
  for(var i=0;i<groups.length;i++){if(groups[i].indexOf(ans)>=0){grp=groups[i].slice();break;}}
  if(!grp)grp=[ans];
  if(exclude)grp=grp.filter(function(x){return x!==exclude;});
  var opts=grp.slice();
  if(opts.length>count){opts=opts.filter(function(x){return x!==ans;});opts=shuffle(opts).slice(0,count-1);opts.push(ans);}
  while(opts.length<count){var r=rnd(pool2);if(r!==exclude&&opts.indexOf(r)<0)opts.push(r);}
  return shuffle(opts);
}

function dispOpt(comp,x){
  if(comp==='cons'){if(W.lead)return W.lead+x;if(W.cluster)return x+W.cluster;return x;}
  if(comp==='tone')return x;
  if(comp==='vowel')return VOWEL_SYMBOL[x]||x;
  return x;
}

// ════════════════════════════════════════════
// LEVEL SWITCH
// ════════════════════════════════════════════
function setLevel(lv){
  tgCloseMobileKeyboard();
  try{ if(typeof gtag==='function') gtag('event','typing_game_level_change',{category:'game', level: lv}); }catch(e){}
  curLevel=lv;
  try{localStorage.setItem('tg_level',lv);}catch(e){} // Lin 2026-07-12: จำระดับที่เลือกไว้ → รีเฟรชแล้วไม่ต้องเลือกใหม่
  document.querySelectorAll('.ltab').forEach(function(b){b.classList.remove('active');});
  document.getElementById('ltab-'+lv).classList.add('active');
  document.getElementById('end').style.display='none';
  // Phase E3 (2026-08-10): เปลี่ยนระดับเอง = ตั้งใจเริ่มรอบใหม่ ไม่ใช่กลับไปต่อ session เดิม → ซ่อนแบนเนอร์ resume ถ้าค้างโชว์อยู่
  var _rbLv=document.getElementById('tg-resume-banner'); if(_rbLv)_rbLv.style.display='none';
  // 高級 ย้ายเข้าเล่นด้วย pipeline เดียวกับ 初/中 แล้ว (เลิกใช้ระบบ adv-game เก่า) — Lin 2026-07-05
  document.getElementById('bars-wrap').style.display='flex';
  document.getElementById('rg-stat-row').style.display='flex';
  document.getElementById('game').style.display='flex';
  // Lin 2026-07-13: เครื่องใหม่ที่เพิ่งล็อกอิน → รอ sync สั้นๆ (≤1.5วิ) ให้รอบแรกถูกต้อง เน็ตล่ม/ช้าไปต่อทันที ไม่ค้าง
  if(rgLoggedIn() && !window.__tgSrsSyncedOnce){
    var started=false, go=function(){ if(started)return; started=true; initGame(); };
    try{ Promise.race([ tgSyncSrsFromServer(), new Promise(function(r){setTimeout(r,1500);}) ]).then(go); }catch(e){ go(); }
    setTimeout(go,1600);
  } else {
    initGame();
  }
}

// ════════════════════════════════════════════
// GAME FLOW
// ════════════════════════════════════════════
function initGame(){
  tgRoundActive=true;
  roundLog=[]; // เก็บ log ทุกคำในรอบนี้ไว้ทำรายงาน PDF ตอนจบรอบ — Lin 2026-07-07
  roundReport=window.RoundReport?RoundReport.create({game_type:'typing',difficulty:curLevel,mode:'thai-keyboard'}):null;
  loadSave();
  // ⭐ ดาวรวม: ใช้บัญชีกลาง (รวมกับเกมเสียง) · ย้ายดาวเดิมในเครื่องเข้าบัญชีครั้งเดียว — Lin 2026-06-27
  if(window.GAME_ACCOUNT){ GAME_ACCOUNT.seedIfEmpty(totalStars); totalStars=GAME_ACCOUNT.getStars(); totalBadges=GAME_ACCOUNT.earnedBadges().length; }
  var now=Date.now();
  // มาจากคลัง (?word=) → ฝึกคำนี้คำเดียว ข้ามการสุ่ม/กรองระดับทั้งหมด
  var _wq=null;
  try{
    var _m=location.search.match(/[?&]word=([^&]+)/);
    if(_m){
      var _wanted=decodeURIComponent(_m[1]);
      for(var _wi=0;_wi<WORDS.length;_wi++){ if(WORDS[_wi].th===_wanted){ _wq=[_wi]; break; } }
    }
  }catch(e){}
  if(_wq){
    roundQueue=_wq;
  } else {
    // กรองตามระดับ: 高 = ประโยค (level:'高') · 中 = คำหลายพยางค์ (มี syls แต่ไม่ใช่ level:'高') · 初 = พยางค์เดียว (ลอกเกมอ่านเป๊ะ — Lin 2026-07-05)
    var inLevel=function(i){
      var w=WORDS[i];
      // Lin 2026-07-15: เดิมเช็คจาก "มี/ไม่มี w.syls" ซึ่งใช้ได้ตอน syls มีเฉพาะคำหลายพยางค์
      // ตอนนี้รวม schema แล้ว ทุกคำมี syls หมด (คำเดียวก็ยาว 1) → ต้องเช็ค w.level ตรงๆ แทน
      // ไม่งั้นระดับ初จะกรองได้ 0 คำ (บั๊กที่พบตอนตรวจระบบเสียง 2026-07-12)
      if(curLevel==='高')return w.level==='高';
      if(curLevel==='中')return w.level==='中';
      return w.level==='初';
    };
    var allIdx=WORDS.map(function(_,i){return i;}).filter(inLevel);
    // กฎ MASTER ข้อ 7 (ลอกเกมอ่าน 2026-07-05): SRS ทำงานเฉพาะตอนล็อกอิน · ไม่ล็อกอิน = เล่นได้ทุกคำเสมอ ไม่มีความจำในเครื่อง
    var pool;
    var _srsAllocated=false;
    if(rgLoggedIn()){
      var _dueIdx=allIdx.filter(function(i){
        var rec=srsRecords[rgSrsKey(WORDS[i])];
        return !!(rec&&!rec.mastered&&RG_SRS.isDue(rec,now));
      });
      var _regularIdx=allIdx.filter(function(i){var rec=srsRecords[rgSrsKey(WORDS[i])];return !(rec&&rec.mastered)&&_dueIdx.indexOf(i)===-1;});
      if(window.GameFlow&&GameFlow.allocateSrs&&(_dueIdx.length||_regularIdx.length)){
        pool=GameFlow.allocateSrs({tier:'free',total:Math.min(tgRoundSize(),_dueIdx.length+_regularIdx.length),due:shuffle(_dueIdx),regular:shuffle(_regularIdx),idOf:function(i){return rgSrsKey(WORDS[i]);},scope:'typing-'+curLevel}).items;
        _srsAllocated=true;
      }else pool=_dueIdx.concat(_regularIdx);
      // ถ้า mastered ทั้งหมดในระดับนี้ → เด้ง 全部精通 (ครั้งเดียว) แล้วเล่นซ้ำได้ (ฝึกอย่างเดียว 0 แต้ม กันฟาร์ม) — Lin 2026-07-06
      if(pool.length===0){ try{ if(!window.tgAllMasteredShown){ window.tgAllMasteredShown=true; setTimeout(tgShowAllMastered,350); } }catch(e){} pool=allIdx.slice(); }
    } else {
      pool=allIdx.slice();
    }
    // Lin 2026-07-13: SRS กรอง pool ก่อนแล้ว (ข้างบน) — เลือก "ลำดับ" ในรอบด้วย pickAdaptive
    // (เน้นคำที่เพิ่งพลาดบ่อยจาก reading_sessions ขึ้นมาก่อน ไม่ทับ/ไม่ยุ่ง SRS)
    if(_srsAllocated){
      roundQueue=pool.slice();
    } else if(window.READING_AUTH && typeof READING_AUTH.pickAdaptive==='function' && READING_AUTH.adaptiveReady && READING_AUTH.adaptiveReady()){
      var _items=pool.map(function(i){return {idx:i, th:WORDS[i].th};});
      var _picked=READING_AUTH.pickAdaptive(_items, Math.min(tgRoundSize(),_items.length));
      roundQueue=_picked.map(function(p){return p.idx;});
    } else {
      roundQueue=shuffle(pool).slice(0,tgRoundSize());
    }
  }
  roundTotal=roundQueue.length;
  cur=0;okC=0;badC=0;streak=0;maxStreak=0;roundScore=0;cleanC=0;roundHadGuide=false;
  document.getElementById('end').style.display='none';
  document.getElementById('game').style.display='flex';
  var _mp0=document.getElementById('tg-mistakes-panel'); if(_mp0)_mp0.style.display='none'; // Phase F2: กันค้างจากรอบก่อน
  try{ if(typeof gtag==='function') gtag('event','typing_game_start',{category:'game',level: curLevel}); }catch(e){}
  try{ if(typeof gtag==='function') gtag('event','game_start',{category:'game',game:'typing_game'}); }catch(e){}
  refreshUI();
  tgSaveResume(); // Phase E3: บันทึกจุดเริ่มรอบนี้ (guest-only) เผื่อปิดแท็บก่อนพิมพ์คำแรกจบ
  loadWord();
  if(!window._minaWelcomed){ window._minaWelcomed=true; setTimeout(function(){minaToast('welcome',{dur:3400});},700); } // มีนาทักทายครั้งแรก — Lin 2026-07-10
}

// แตกคำเป็นอาเรย์พยางค์ (พยางค์เดียว = อาเรย์ 1 ตัว)
function buildSyls(w){
  // เพิ่ม en (คำอ่าน/拼音) ต่อพยางค์ด้วย — เอาไว้โชว์ตรงจุดเลือกวรรณยุกต์ (bonus-reading) — Lin 2026-07-07
  // พยางค์เดียวไม่มี en ของตัวเอง → ใช้ en ของทั้งคำ (w.en) แทน
  // Lin 2026-07-12: เพิ่ม read = คำอ่านของพยางค์ (จาก readingTH ตัดด้วย -) ให้ช่อง讀音โชว์ "คำอ่าน" ไม่ใช่ "ตัวเขียน" (แก้บั๊ก สนามบิน โชว์ นาม แทน สะ-หนาม-บิน)
  var _reads=(w.readingTH?String(w.readingTH).split('-'):[]);
  if(w.syls&&w.syls.length)return w.syls.map(function(s,i){return {th:s.th,read:((_reads.length===w.syls.length&&_reads[i])?_reads[i]:s.th),cons:s.cons,vowel:s.vowel,tone:s.tone,final:s.final,lead:s.lead,cluster:s.cluster,tone_name:s.tone_name,en:s.en||w.en,consRead:s.consRead,finalRead:s.finalRead,finalDisp:s.finalDisp,silent:s.silent};}); // 2026-07-30: พ่วงฟิลด์เฉลยเสียง (ตัวประกอบต้อง copy ทุกฟิลด์ที่เกมใช้)
  return [{th:w.th,read:(w.readingTH||w.th),cons:w.cons,vowel:w.vowel,tone:w.tone,final:w.final,lead:w.lead,cluster:w.cluster,tone_name:w.tone_name,en:w.en,consRead:w.consRead,finalRead:w.finalRead,finalDisp:w.finalDisp,silent:w.silent}];
}
// แถบบอกพยางค์ (โชว์เฉพาะคำหลายพยางค์)
function renderSylStrip(){
  var strip=document.getElementById('syl-strip');
  if(!strip)return;
  if(sylList.length<=1){strip.style.display='none';strip.innerHTML='';return;}
  strip.style.display='flex';strip.innerHTML='';
  sylList.forEach(function(s,i){
    var filled;
    if(i===sylIdx) filled=comps.every(function(c){return slotFills[c]!=null;});
    else { var st=sylCache[i]; filled=!!(st && st.comps.every(function(c){return st.slotFills[c]!=null;})); }
    var done=checked||filled;
    var c=document.createElement('div');
    c.className='syl-chip'+(i===sylIdx?' cur':(done?' done':''));
    c.innerHTML='<span class="syl-th">'+s.th+'</span><span class="syl-n">'+(i+1)+'/'+sylList.length+'</span>';
    c.style.cursor=(typeof RG_TYPE!=='undefined' && RG_TYPE.on)?'default':'pointer';
    c.onclick=function(){ if(typeof RG_TYPE!=='undefined' && RG_TYPE.on)return; rgGotoSyl(i); }; // โหมดพิมพ์ให้พิมพ์ต่อเนื่องไปเลย ไม่ต้องคลิกสลับ
    c.setAttribute('role','button');c.setAttribute('tabindex','0');
    c.onkeydown=function(e){ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); c.onclick(); } };
    c.addEventListener('mousedown',function(e){e.preventDefault();}); // Lin 2026-07-16: กันชิปพยางค์แย่งโฟกัส → คีย์บอร์ดมือถือหุบกลางคัน (โหมดพิมพ์แตะแล้วไม่ทำอะไรอยู่แล้วด้วย)
    strip.appendChild(c);
  });
}
// ── ปุ่มเปิด/ปิดคำอ่าน 🐣/🥚 — port มาจากเกมอ่าน (Lin 2026-07-16) · ใช้ localStorage key เดียวกัน = ตั้งค่าครั้งเดียว sync กันทั้งเกมอ่าน/เกมพิมพ์
// 🐣 มีนาเจี๊ยบออกเสียง = คำอ่านโชว์อยู่ · 🥚 ไข่เงียบ = คำอ่านซ่อนอยู่
// Lin 2026-07-26: เดิมตอนเฉลย (checked=true) จะบังคับโชว์讀音เสมอ กดปุ่ม🐣/🥚ไม่มีผลตอนเฉลย → แก้ให้ปุ่มกดเปิด/ปิดได้จริงแม้ตอนเฉลยแล้ว (ไม่บังคับโชว์อีกต่อไป)
var rgPronMode=(function(){try{var v=localStorage.getItem('rg_pron_mode');return v===null?false:v==='1';}catch(e){return false;}})();
function setRgPronMode(on){
  rgPronMode=!!on;
  try{localStorage.setItem('rg_pron_mode',rgPronMode?'1':'0');}catch(e){}
  var btn=document.getElementById('rg-pron-toggle');
  if(btn){
    btn.textContent=rgPronMode?'🐣':'🥚';
    btn.title=rgPronMode?'目前：讀音已顯示（點擊隱藏）':'目前：讀音已隱藏（點擊顯示）';
    btn.setAttribute('aria-label',btn.title);
  }
  if(typeof WORD!=='undefined' && WORD){
    var _rpTxt=checked?(typeof buildThaiPron==='function'?buildThaiPron():(WORD.readingTH||WORD.th||'')):((WORD.th)?(WORD.readingTH||WORD.th):'');
    document.getElementById('rev-pron').textContent=(rgPronMode&&_rpTxt)?_rpTxt:''; // ใช้ readingTH เสมอ ห้ามใช้ syls[].th
  }
}
setRgPronMode(rgPronMode); // ตั้งไอคอนปุ่มตามค่าที่จำไว้ ตั้งแต่โหลดหน้า

// ── ปุ่มเปิด/ปิด "คำอ่านโรมัน" (英文讀音) — Lin 2026-07-25 ──
// 🔡 = โชว์อยู่ · 🔠 = ซ่อนอยู่ (ไอคอนตามที่ Lin เลือก) · ค่าจำแยกจากคำอ่านไทย (rg_en_mode)
var rgEnMode=(function(){try{var v=localStorage.getItem('rg_en_mode');return v===null?false:v==='1';}catch(e){return false;}})();
function buildEnPron(){ return (typeof WORD!=='undefined'&&WORD&&WORD.en)?WORD.en:''; }
function rgRenderEnLine(){
  var el=document.getElementById('rev-en');
  if(!el)return;
  el.textContent=rgEnMode?buildEnPron():'';
}
function setRgEnMode(on){
  rgEnMode=!!on;
  try{localStorage.setItem('rg_en_mode',rgEnMode?'1':'0');}catch(e){}
  var btn=document.getElementById('rg-en-toggle');
  if(btn){
    btn.textContent=rgEnMode?'🔡':'🔠';
    btn.title=rgEnMode?'目前：英文讀音已顯示（點擊隱藏）':'目前：英文讀音已隱藏（點擊顯示）';
    btn.setAttribute('aria-label',btn.title);
  }
  rgRenderEnLine();
}
setRgEnMode(rgEnMode); // ตั้งไอคอนปุ่มตามค่าที่จำไว้ ตั้งแต่โหลดหน้า
function loadWord(){
  rememberStep=0;clearTimeout(rememberTimer);curWordIsKnownCheck=false;
  var rb=document.getElementById('btn-remember');
  if(rb){rb.textContent='已記得';rb.style.cssText='';rb.style.display='';}
  WORD=WORDS[roundQueue[cur]];
  sylList=buildSyls(WORD);
  // Lin 2026-08-01: ต่อพยางค์ครับ/ค่ะ/คะ synthetic เข้า sylList จริง ถ้าเป็นประโยค高級 + เปิดปุ่มไว้ — พิมพ์ได้จริงแต่ไม่นับคะแนน (ดู isParticle ใน tgScoreSylCount/wordWrongTotal guard)
  var _tgParticle=(WORD.level==='高')?tgShowParticleFor(WORD):null;
  if(_tgParticle && TG_PARTICLE_SYLS[_tgParticle]) sylList=sylList.concat([TG_PARTICLE_SYLS[_tgParticle]]);
  sylIdx=0;wordHadWrong=false;wordFailed=false;wrongCount=0;wordWrongTotal=0;wordUsedGuide=false;sylCache=[]; // sylCache: เก็บ state แต่ละพยางค์ ให้เลือกพยางค์ไหนก่อนก็ได้ (คำใหม่ = ล้าง)
  wordGolden=Math.random()<GOLDEN_WORD_CHANCE; // สุ่มคำทองใหม่ทุกคำ (Lin 2026-07-03)
  document.getElementById('qn').textContent=cur+1;
  document.getElementById('wth').textContent=WORD.th+(_tgParticle||''); // ต้องตรงกับ sylList จริง (รวมครับ/ค่ะ/คะ ถ้ามี) — ไม่งั้นข้อความเห็นกับสิ่งที่ต้องพิมพ์ไม่ตรงกัน
  document.getElementById('wzh').textContent=WORD.zh;
  tgSyncParticleBtn();
  rgRenderEnLine(); // Lin 2026-07-25: คำอ่านโรมันของคำใหม่ (ถ้าเปิด 英文讀音 อยู่)
  document.getElementById('rev-pron').textContent=(rgPronMode&&WORD.th)?((WORD.readingTH||WORD.th)):''; // Lin 2026-07-16: โชว์คำอ่านตั้งแต่คำใหม่โหลดถ้าปุ่ม🐣เปิดอยู่ (แทนการล้างทิ้งเฉยๆ เดิม — ยังกันบั๊กคำอ่านค้างจากคำก่อน เพราะเซ็ตค่าใหม่ทุกคำ) · ใช้ readingTH เสมอ ห้ามใช้ syls[].th
  var _gb=document.getElementById('word-golden-badge');
  if(_gb)_gb.style.display=wordGolden?'':'none';
  // บอกระบบเสียงว่าคำปัจจุบันคือคำไหน — ปุ่ม 🔊 กด 1 ที = เล่นเสียงคำนี้ 1 ที (2026-07-16)
  if(window.WordAudio)WordAudio.setCurrent(WORD.th);
  // vault save button
  var vslot=document.getElementById('rg-vault-btn-slot');
  if(vslot && window.WordVault){
    WordVault.injectStyles();
    vslot.innerHTML='';
    vslot.appendChild(WordVault.createSaveBtn(WORD.th,{zh:WORD.zh,en:WORD.en,source:'typing-game'},{
      onSave: function(){ try{ gtag('event','typing_game_vault_save',{category:'game', word: WORD.th}); }catch(e){} },
      onRemove: function(){ try{ gtag('event','typing_game_vault_remove',{category:'game', word: WORD.th}); }catch(e){} }
    }));
    // refresh badge
    var badges=document.querySelectorAll('.vault-badge');
    badges.forEach(function(b){b.innerHTML='<img src="assets/icons/kratip-plain.svg" alt="" style="width:14px;height:18px;vertical-align:-4px;margin-right:3px;">單字庫';});
  }
  loadSyl();
}
// โหลด "1 พยางค์" — ใช้ logic ช่อง/ตัวเลือก/โบนัส เดิมทั้งหมด
function loadSyl(){
  var SY=sylList[sylIdx];
  W={th:SY.th,read:SY.read,zh:WORD.zh,en:SY.en||WORD.en,cons:SY.cons,vowel:SY.vowel,tone:SY.tone,final:SY.final,lead:SY.lead,cluster:SY.cluster,tone_name:SY.tone_name,consRead:SY.consRead,finalRead:SY.finalRead,finalDisp:SY.finalDisp,silent:SY.silent}; // 2026-07-30: พ่วงฟิลด์เฉลยเสียง
  checked=false;picks=[]; // wrongCount ย้ายไปนับระดับ "ทั้งคำ" แล้ว (reset ที่ loadWord)
  comps=['cons','vowel'];
  if(W.final)comps.push('final');
  if(W.tone) comps.push('tone');
  slotFills={cons:null,vowel:null,final:null,tone:null};

  var n=comps.length,oc={};
  if(n===4)      oc={cons:3,vowel:3,final:2,tone:2};
  else if(n===3) comps.forEach(function(c){oc[c]=3;});
  else           comps.forEach(function(c){oc[c]=4;});
  needN=n;

  // reset UI
  document.getElementById('retry-hint').className='retry-hint';
  document.getElementById('banner').className='gsh-feedback-slot result-banner';
  document.getElementById('reveal').className='reveal';
  document.getElementById('ok').textContent=okC;
  document.getElementById('bad').textContent=badC;
  renderSylStrip();
  setGameBtns('normal');
  updateCombo();

  // slot boxes — visibility + dynamic order ตามสระ
  ['cons','vowel','final','tone'].forEach(function(c){
    var col=document.getElementById('slotcol-'+c);
    var box=document.getElementById('sb-'+c);
    col.style.display=comps.indexOf(c)>=0?'flex':'none';
    setSlotContent(box,null,null);
    box.onclick=function(){ if(checked)return; setActiveSlot(c); };
    box.setAttribute('role','button');box.setAttribute('tabindex','0');
    box.onkeydown=function(e){ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); box.onclick(); } };
  });
  var slotRow=document.getElementById('slot-row');
  slotSeq=getSlotOrder(W.vowel,W.final).filter(function(c){return comps.indexOf(c)>=0;});
  slotSeq.forEach(function(c){
    var col=document.getElementById('slotcol-'+c);
    if(col)slotRow.appendChild(col); // re-append = เลื่อนไปท้าย → reorder DOM
  });
  activeSlot=nextEmptySlot();updateActiveSlot();

  // build optTypes + options
  // ไทล์ไม่ผูกช่องแล้ว — type ใช้แค่สร้างตัวลวง · การวางตัดสินจาก "ช่องที่เล็ง" (activeSlot) → ตัวหน้าตาซ้ำไม่งง
  optTiles=[];correctVal={};
  comps.forEach(function(comp){
    var ans,groups,pool2,ex=null;
    if     (comp==='cons' ){ans=W.cons;  groups=CONS_GROUPS;  pool2=CP; ex=W.lead||null;}
    else if(comp==='vowel'){ans=W.vowel; groups=VOWEL_GROUPS; pool2=VP;}
    else if(comp==='final'){ans=W.final; groups=FINAL_GROUPS; pool2=FP;}
    else                   {ans=W.tone;  groups=[TONE_POOL];  pool2=TONE_POOL;}
    correctVal[comp]=dispOpt(comp,ans);
    var raw=buildOpts(ans,groups,pool2,oc[comp],ex);
    raw.forEach(function(o){optTiles.push({type:comp,val:dispOpt(comp,o)});});
  });
  optTiles=shuffle(optTiles);
  optTiles.forEach(function(t,i){t.id=i;});

  renderOptions(optTiles);
  // Lin 2026-07-30: เอา猜聲調ออกแล้ว — กล่อง #bonus-section ซ่อนไว้ก่อน จะโชว์เองตอนเฉลย (evaluateBonus/showRevealMulti)
  var _bsec=document.getElementById('bonus-section');
  if(_bsec)_bsec.className='bonus-section';
  var _brea=document.getElementById('bonus-reason');
  if(_brea){_brea.className='bonus-reason';_brea.innerHTML='';} // Phase D2: ล้างเนื้อหาเก่าจริง กัน tgHasDetailContent() เจอของค้างจากคำก่อนหน้า
  tgResetDetailBox(); // Phase D2: คำ/พยางค์ใหม่ = ปิดกล่องเฉลย+ซ่อนปุ่มเสมอ
  refreshUI();
}

// ─── Render options ───
function renderOptions(tiles){
  var pool=document.getElementById('pool');
  pool.innerHTML='';
  tiles.forEach(function(t,i){
    var el=document.createElement('div');
    el.className='opt';
    el.dataset.id=t.id;
    el.dataset.type=t.type;
    el.dataset.val=t.val;
    // Use innerHTML for combining chars
    el.innerHTML=dispHTML(t.val);

    var jx=(Math.random()*22-11).toFixed(1)+'px';
    var jy=(Math.random()*18-9).toFixed(1)+'px';
    var jr=(Math.random()*14-7).toFixed(1)+'deg';
    el.style.setProperty('--jx',jx);el.style.setProperty('--jy',jy);el.style.setProperty('--jr',jr);
    var tx=(Math.random()*60-30).toFixed(0)+'px';
    var ty=(Math.random()*50+20).toFixed(0)+'px';
    var rot=(Math.random()*30-15).toFixed(0)+'deg';
    el.style.setProperty('--tx',tx);el.style.setProperty('--ty',ty);el.style.setProperty('--rot',rot);
    el.style.setProperty('--delay',(i*0.06).toFixed(2)+'s');
    el.style.setProperty('--dur','0.4s');
    el.style.setProperty('--bdur',(1.8+Math.random()*1.2).toFixed(2)+'s');
    el.style.setProperty('--bstart',((i*0.06)+0.55).toFixed(2)+'s');

    el.onclick=function(){
      if(checked)return;
      // แต่ละไทล์รู้ประเภทของตัวเองแน่นอน (t.type) → กดแล้วลงช่องของตัวเองเลย ไม่ใช่ช่องที่กำลังเล็ง
      // (เดิมยึด "ช่องที่เล็งอยู่" ทำให้กดสลับลำดับแล้ววางผิดช่อง — Lin แจ้ง 2026-07-02)
      var placed=slotOfTile(t.id);
      if(placed){
        // กดซ้ำตัวที่วางอยู่ → เอาออก แล้วเล็งช่องนั้นต่อ
        slotFills[placed]=null;
        var k=picks.indexOf(t.id);if(k>=0)picks.splice(k,1);
        el.classList.remove('sel');
        setActiveSlot(placed);
        updateSlots();
      } else {
        var c=t.type;
        if(comps.indexOf(c)<0)return; // กันเหนียว: พยางค์นี้ไม่มีช่องประเภทนี้
        if(slotFills[c]!=null){
          // ช่องที่เล็งมีตัวอยู่แล้ว → เอาตัวเก่าออกก่อน
          var oldId=slotFills[c];
          var ki=picks.indexOf(oldId);if(ki>=0)picks.splice(ki,1);
          var oldEl=pool.querySelector('.opt[data-id="'+oldId+'"]');
          if(oldEl)oldEl.classList.remove('sel');
          slotFills[c]=null;
        }
        slotFills[c]=t.id;picks.push(t.id);el.classList.add('sel');
        setActiveSlot(nextEmptySlot());
        updateSlots();
      }
      document.getElementById('btn-check').disabled=!rgAllSylsFilled();
    };
    pool.appendChild(el);
  });
}

// ─── Slot boxes ───
function updateSlots(){
  ['cons','vowel','final','tone'].forEach(function(c){
    if(comps.indexOf(c)<0)return;
    var box=document.getElementById('sb-'+c);
    if(!box)return;
    var id=slotFills[c];
    var t=(id!=null)?tileById(id):null;
    setSlotContent(box, t?t.val:null, t?'filled':null);
  });
  updateActiveSlot(); // setSlotContent ล้าง class → ทาไฮไลต์ช่องที่เล็งใหม่
}

function markSlots(){
  comps.forEach(function(c){
    var box=document.getElementById('sb-'+c);
    if(!box)return;
    var id=slotFills[c];
    var t=(id!=null)?tileById(id):null;
    var uv=t?t.val:null;
    setSlotContent(box, correctVal[c], uv===correctVal[c]?'correct':'wrong');
  });
  updateActiveSlot(); // ปลดไฮไลต์ช่องที่เล็งเมื่อเฉลยแล้ว
}

// ─── Check answer ───
// คะแนน/มาสเตอร์ ทำตอน "จบทั้งคำ" (รองรับหลายพยางค์)
function finalizeWord(){
  var srsKey=rgSrsKey(WORD);var b=document.getElementById('banner');
  var loggedIn=rgLoggedIn();
  var sylCount=tgScoreSylCount(); // Lin 2026-08-01: ไม่นับพยางค์ครับ/ค่ะ/คะ synthetic ที่ต่อท้าย (ถ้ามี) เข้าโควต้าคะแนน

  // ── ผิดครบโควต้า (fail) — กฎ Lin 2026-07-05: เฉลย + เข้าคิว SRS วันถัดไป ไม่ recycle ในรอบเดียวกันอีกต่อไป ──
  if(wordFailed){
    streak=0;
    if(loggedIn){
      var recF=RG_SRS.resetOnFail(rgSrsGet(srsKey));
      rgSrsSet(srsKey,recF);
    }
    if(curWordIsKnownCheck){
      curWordIsKnownCheck=false;
      b.textContent='沒關係，這個字先留在複習清單裡 🔁';b.className='gsh-feedback-slot result-banner show no';
      rgToast('沒關係，這個字先留在複習清單裡 🔁'); // 改成 pop up，自動消失，不用手動關 — Lin 2026-07-07
    } else {
      b.textContent='沒關係，多打幾次就會了 — 這個字之後會再複習到 🙂';b.className='gsh-feedback-slot result-banner show no';
      rgToast('沒關係，多打幾次就會了 — 這個字之後會再複習到 🙂'); // 改成 pop up，自動消失，不用手動關 — Lin 2026-07-07
    }
    rgLogWord({failed:true,pts:0});
    doSave();
    return;
  }

  // ── ด่านพิสูจน์ "已記得" — ต้องสะอาดจริง (ไม่พลาดแม้ครั้งเดียว + ไม่ใช้คำใบ้) ──
  if(curWordIsKnownCheck){
    var passedClean=!wordHadWrong && !wordUsedGuide;
    if(loggedIn){
      if(passedClean){
        var recM=rgSrsGet(srsKey)||RG_SRS.blank();
        recM.mastered=true;
        rgSrsSet(srsKey,recM);
      } else {
        rgSrsSet(srsKey,RG_SRS.resetOnFail(rgSrsGet(srsKey)));
      }
      // Phase 4: บอกเซิร์ฟเวอร์ด้วย (已記得 = พิสูจน์ครั้งเดียว → mastered แต่ไม่ให้ดาว)
      try{
        if(window.TONE_SERVER && TONE_SERVER.available())
          TONE_SERVER.finishRound({ game:'typing', word:WORD.th, level:RG_LEVEL_TO_NUM[curLevel]||1, clean:passedClean, knownCheck:true });
      }catch(e){}
    }
    curWordIsKnownCheck=false;
    if(passedClean){ b.textContent='真的記得！這個字標記為熟練 ✓（不計分、不加星）';b.className='gsh-feedback-slot result-banner show ok'; }
    else{ b.textContent='中途有出錯/用了提示，這個字先留在複習清單裡 🔁';b.className='gsh-feedback-slot result-banner show no'; }
    rgLogWord({failed:!passedClean,pts:0,mastered:passedClean});
    doSave();
    return;
  }

  // ── เปิดคำใบ้ระหว่างพิมพ์คำนี้ → 0 คะแนน + ไม่แตะ SRS เลย เหมือนยังไม่ได้ทำ (กฎ MASTER ข้อ9) ──
  // เมื่อคำนี้เคยแสดง提示แล้ว คะแนนต้องคงเป็น 0 แม้ผู้เล่นปิด提示ก่อนตอบจบ
  if(wordUsedGuide){
    okC++;
    roundHadGuide=true;
    b.textContent='這次用了提示，先不計分（下次試試看不看提示！）';b.className='gsh-feedback-slot result-banner show half';
    rgLogWord({guide:true,pts:0});
    doSave();
    return;
  }

  // ── Lin 2026-07-06: กันฟาร์ม — คำที่ "精通"(mastered) แล้ว เอามาเล่นซ้ำ (ตอนคำใหม่หมดทั้งระดับ) = 0 แต้ม ไม่แตะ SRS/ดาว/ลีก (กฎ MASTER ข้อ7/15) ──
  if(loggedIn){ var _recM=rgSrsGet(srsKey); if(_recM&&_recM.mastered){ okC++; streak=0; b.textContent='這個字你已經精通了，複習不計分 ✨';b.className='gsh-feedback-slot result-banner show ok'; rgLogWord({pts:0,mastered:true}); doSave(); return; } }

  // ── คะแนน: แบ่งขั้นตามโควต้าที่ขยายตามความยาวคำ/ประโยค (กฎ Lin 2026-07-05, นับผิดรวมทั้งคำ ไม่แยกพยางค์) ──
  var pts=rgWrongScore(sylCount,wordWrongTotal);
  var clean=(wordWrongTotal===0); // "สะอาด" ของ SRS/ดาวเงิน = ไม่พลาดแม้ครั้งเดียวทั้งคำ
  if(clean)cleanC++;
  var golden=(clean && wordGolden); // คำทอง: ตอบถูกครั้งแรกล้วนเท่านั้น
  if(golden)pts=pts*GOLDEN_WORD_MULT;
  streak++;if(streak>maxStreak)maxStreak=streak;
  var cmult=rgComboMult(streak); // คอมโบ×แต้ม (สะอาดติดกัน)
  if(cmult>1)pts=Math.max(1,Math.round(pts*cmult));
  try{ if(typeof gtag==='function') gtag('event','typing_game_correct',{category:'game',word: WORD.th, pts: pts}); }catch(e){}
  try{ if(typeof gtag==='function') gtag('event','game_correct',{category:'game',game:'typing_game'}); }catch(e){}

  // รอบตัดสิน Day 7 ได้คะแนนฐานตามปกติ ต่างจาก 已記得 (known-check) ที่ยังคง 0 แต้ม
  var basePtsAwarded=pts;
  roundScore+=basePtsAwarded;okC++;
  var srsBonusAwarded=0; // เก็บโบนัสรอบทบทวน SRS ไว้รวมกับแบนเนอร์ตอนจบคำ (ดูด้านล่าง) — Lin 2026-07-07

  // ── Phase 4 (กันโกงดาว): ให้เซิร์ฟเวอร์เป็นคนตัดสิน+แจกดาวจริง (เกมสะกด: ดาว=สะกดถูก ไม่ใช่วรรณยุกต์) ──
  //   ยิงทุกรอบเหมือนเกมเสียง (clean/ไม่ clean) → เซิร์ฟเวอร์เลื่อน/รีเซ็ต SRS เอง → mastered แล้วแจกดาว
  //   คู่ขนาน ไม่รื้อ local · เน็ตล่ม/ไม่ล็อกอิน = เกมทำงานเหมือนเดิมทุกอย่าง
  try{
    if(loggedIn && window.TONE_SERVER && TONE_SERVER.available()){
      TONE_SERVER.finishRound({ game:'typing', word:WORD.th, level:RG_LEVEL_TO_NUM[curLevel]||1, clean:clean }).then(function(r){
        if(r&&r.ok&&r.justMastered&&r.stars>0&&window.console) console.log('[P4] ⭐ server',r.stars,'→ total',r.totalStars);
        else if(r&&!r.ok&&window.console) console.log('[P4] server not-ok:',r.reason);
      });
    }
  }catch(e){}

  // ── SRS เลื่อนขั้น/รีเซ็ต + โบนัสรอบทบทวน + แจกดาวเงินตอน mastered จริง (เฉพาะล็อกอิน) ──
  if(loggedIn){
    var rec=rgSrsGet(srsKey)||RG_SRS.blank();
    if(clean){
      var passedStage=rec.stage; // stage ก่อนเลื่อน = รอบทบทวนที่เพิ่งผ่าน (0/1/2)
      var res=RG_SRS.advanceOnClean(rec,Date.now());
      rec=res.rec;
      var _rb=SRS_REVIEW_BONUS[passedStage]||0; // โบนัสรอบทบทวนสะอาด — เฉพาะ "ลูปแรกที่ผ่าน"
      if(_rb>0){ roundScore+=_rb; srsBonusAwarded=_rb; } // Lin 2026-07-10: เลิกยิง pop() แยก — รวมไปโชว์ก้อนเดียวกับคะแนนหลักด้านล่าง (เลือกแบบ C: ไม่มีไอคอน 🔁)
      if(res.justMastered){
        try{
          if(window.GAME_ACCOUNT && window.GAME_ACCOUNT.addHardStars){
            var lvNum=RG_LEVEL_TO_NUM[curLevel]||1; // แก้บั๊กเดิม: (curLevel==='中')?2:1 ทำให้ 高 เคยตกไปนับเป็นระดับ 1 (Lin 2026-07-05)
            var _hs=GAME_ACCOUNT.addHardStars(res.clean,lvNum);
            if(_hs&&_hs.stars>0){totalStars=GAME_ACCOUNT.getStars();}
          }
        }catch(e){}
      }
    } else {
      rec=RG_SRS.resetOnFail(rec); // ผิดแม้ครั้งเดียว (ไม่ใช่แค่ fail เต็ม) = กลับวันแรกเสมอ
    }
    rgSrsSet(srsKey,rec);
  }

  // ── รวมโบนัสทั้งหมดของ "คำนี้" (คะแนนหลัก + SRS) เป็นก้อนเดียวตอนแสดงแบนเนอร์ตอนจบคำ (โบนัสวรรณยุกต์ถูกลบแล้ว 2026-07-30) ──
  var dispPtsAwarded=basePtsAwarded+srsBonusAwarded;

  if(wordHadWrong){b.textContent='完成這個字！+'+dispPtsAwarded+' 分';b.className='gsh-feedback-slot result-banner show half';}
  else{b.textContent=rnd(['全部正確！🎉','太棒了！✨','非常好！🌟'])+(streak>=3?' 🔥連對'+streak:'')+(golden?' ✨黃金字':'')+' +'+dispPtsAwarded+' 分';b.className='gsh-feedback-slot result-banner show ok';}
  pop('+'+dispPtsAwarded+(golden?' ✨':''));
  // น้องมีนาพูด: คำทอง > คอมโบ > มีผิด(ปลอบ) > ถูก(สุ่ม) — Lin 2026-07-10
  if(golden) minaToast('golden');
  else if(streak===3||streak===5||streak===8) minaToast('combo');
  else if(wordHadWrong) minaToast('wrong',{throttle:true,chance:0.5});
  else minaToast('correct',{throttle:true});
  rgLogWord({failed:false,pts:dispPtsAwarded,srsDue:(typeof rec!=='undefined'&&rec)?(rec.dueDate||''):'',mastered:(typeof rec!=='undefined'&&rec)?!!rec.mastered:false});
  doSave();
}
function check(){
  try{ if(typeof gtag==='function') gtag('event','typing_game_check_click',{category:'game', word: (typeof WORD!=='undefined'&&WORD)?WORD.th:''}); }catch(e){}
  if(sylList.length>1) return rgCheckWholeWord(); // หลายพยางค์ → ตรวจทั้งคำทีเดียว (เลือกพยางค์เองได้อิสระ)
  var lastSyl=(sylIdx>=sylList.length-1);
  var allOk=comps.every(function(c){var id=slotFills[c];if(id==null)return false;var t=tileById(id);return t&&t.val===correctVal[c];});

  if(allOk){
    checked=true;
    markOpts();markSlots();
    evaluateBonus();showReveal();renderSylStrip();
    document.getElementById('retry-hint').className='retry-hint';
    setGameBtns('done');
    if(lastSyl){
      finalizeWord();
      document.getElementById('btn-next').textContent='下一題 →';
    } else {
      var b=document.getElementById('banner');
      b.textContent='音節 '+(sylIdx+1)+' 完成 ✓ 接著拼下一個音節';b.className='gsh-feedback-slot result-banner show ok';
      document.getElementById('btn-next').textContent='下一個音節 →';
    }
    document.getElementById('ok').textContent=okC;document.getElementById('bad').textContent=badC;
    refreshUI();
  } else {
    wrongCount++;wordHadWrong=true;streak=0;badC++;
    try{ if(typeof gtag==='function') gtag('event','typing_game_wrong',{category:'game',word: WORD.th, wrongs: wrongCount}); }catch(e){}
    try{ if(typeof gtag==='function') gtag('event','game_wrong',{category:'game',game:'typing_game'}); }catch(e){}
    if(wrongCount < 3){
      // ผิดครั้งที่ 1/2 → กระพริบตัวที่ผิด, เคลียร์, ลองใหม่
      document.getElementById('pool').querySelectorAll('.opt').forEach(function(x){
        var c=slotOfTile(Number(x.dataset.id));
        if(c && correctVal[c]!==x.dataset.val)x.classList.add('wrong');
      });
      setTimeout(function(){
        document.getElementById('pool').querySelectorAll('.opt.wrong').forEach(function(x){x.classList.remove('wrong');});
      },750);
      picks=[];slotFills={cons:null,vowel:null,final:null,tone:null};
      activeSlot=nextEmptySlot();updateActiveSlot();
      updateSlots();
      document.getElementById('pool').querySelectorAll('.opt.sel').forEach(function(x){x.classList.remove('sel');});
      document.getElementById('btn-check').disabled=true;
      var hint=document.getElementById('retry-hint');
      var _msg1985=wrongCount===1?'沒關係～再看看，換一個試試 🌱':'再一次就好，米娜相信你 💛';
      hint.textContent=_msg1985;
      hint.className='retry-hint show';
      rgToast(_msg1985); // 改成 pop up，自動消失，不用手動關 — Lin 2026-07-07
      document.getElementById('ok').textContent=okC;
      document.getElementById('bad').textContent=badC;
      updateCombo();
    } else {
      // ผิดครั้งที่ 3 → เฉลยพยางค์นี้ · คำนี้ถือว่าพลาด
      wordFailed=true;checked=true;
      markOpts();markSlots();
      evaluateBonus();showReveal();renderSylStrip();
      document.getElementById('retry-hint').className='retry-hint';
      setGameBtns('done');
      if(lastSyl){
        finalizeWord();
        document.getElementById('btn-next').textContent='下一題 →';
      } else {
        var b=document.getElementById('banner');
        b.textContent='這個音節再看一下 — 綠色才對，接著拼下一個音節';b.className='gsh-feedback-slot result-banner show no';
        document.getElementById('btn-next').textContent='下一個音節 →';
      }
      document.getElementById('ok').textContent=okC;
      document.getElementById('bad').textContent=badC;
      updateCombo();refreshUI();
    }
  }
}

// ─── กล่องคำอธิบายเฉลย ───
// Lin 2026-07-30: เอา猜聲調ออกทั้งเกมแล้ว — evaluateBonus() เหลือหน้าที่เดียวคือโชว์คำอธิบายเฉลย
// (子音/母音/尾音 + เหตุผลเสียงวรรณยุกต์) อัตโนมัติตอนเฉลย ไม่มีปุ่มทาย/ไม่มีแต้ม +1 แล้ว
// คงชื่อฟังก์ชันเดิมไว้ เพราะถูกเรียกจากจุดเฉลยหลายที่ (check/rgTypeSuccessBranch/rgTypeFailBranch)
var TONE_ZH={'สามัญ':'第一聲','เอก':'第二聲','โท':'第三聲','ตรี':'第四聲','จัตวา':'第五聲'};

function evaluateBonus(){
  if(!W.tone_name)return; // ไม่มีข้อมูลเสียง → ใช้แผงเฉลยแยก (#reveal) ตามเดิมใน showReveal()
  var sec=document.getElementById('bonus-section');
  if(sec)sec.className='bonus-section show';
  renderBonusReason(W);
}

// ════════════════════════════════════════════
// Shared Game UI Phase D2 (2026-08-10): กล่องคำอธิบายเฉลย (子音/母音/尾音 + เหตุผลเสียงวรรณยุกต์)
// เปลี่ยนจาก "โชว์อัตโนมัติตอนเฉลย" → opt-in (ผู้เล่นกด [ 查看詳細解說 ] เอง)
// ⚠️ ไม่แตะเนื้อหาที่ evaluateBonus()/renderBonusReason()/showReveal()/showRevealMulti() คำนวณเลยแม้แต่นิดเดียว
// แค่ห่อ #bonus-section + #reveal ด้วย #tg-detail-box ที่ปิดอยู่ก่อนเสมอ ปุ่มโผล่เองเฉพาะรอบที่มีเนื้อหาจริง
// ════════════════════════════════════════════
function tgHasDetailContent(){
  var br=document.getElementById('bonus-reason');
  var rr=document.getElementById('reveal-rules');
  return !!((br && br.innerHTML && br.innerHTML.trim()!=='') || (rr && rr.innerHTML && rr.innerHTML.trim()!==''));
}
// เรียกตอน "เนื้อหาเฉลยเพิ่งถูกคำนวณเสร็จ" (ท้าย showReveal()/showRevealMulti() เท่านั้น) — โผล่ปุ่มถ้ามีของจริงให้ดู
function tgSyncDetailToggle(){
  var btn=document.getElementById('tg-detail-toggle');
  if(!btn)return;
  btn.style.display=tgHasDetailContent()?'':'none';
}
// เรียกตอน "ขึ้นคำ/พยางค์ใหม่" (ยังไม่เฉลย) — ปิดกล่อง+ซ่อนปุ่มไว้ก่อนเสมอ กันปุ่มค้างจากคำก่อนหน้า
function tgResetDetailBox(){
  var box=document.getElementById('tg-detail-box');
  var btn=document.getElementById('tg-detail-toggle');
  if(box)box.style.display='none';
  if(btn){btn.style.display='none';btn.textContent='🔍 查看詳細解說';}
}
function tgToggleDetail(){
  var box=document.getElementById('tg-detail-box');
  var btn=document.getElementById('tg-detail-toggle');
  if(!box||!btn)return;
  var opening=(box.style.display==='none');
  box.style.display=opening?'block':'none';
  btn.textContent=opening?'🔍 收起詳細解說 ▲':'🔍 查看詳細解說';
  try{ if(typeof gtag==='function') gtag('event','typing_game_detail_toggle',{category:'game', open: opening}); }catch(e){}
}

// Lin 2026-07-06: เด้ง 全部精通！ ให้เหมือนเกมอ่าน (ตอนจำครบทั้งระดับ) — เสียงมีนา
function tgShowAllMastered(){
  var old=document.getElementById('tg-allmaster-ov'); if(old)old.remove();
  var div=document.createElement('div');
  div.id='tg-allmaster-ov';
  div.style.cssText='position:fixed;inset:0;background:rgba(45,42,34,0.5);display:flex;align-items:center;justify-content:center;z-index:10050;padding:20px;';
  div.innerHTML='<div style="background:#fff;border-radius:18px;max-width:340px;width:100%;padding:28px 24px;text-align:center;font-family:\'Noto Sans TC\',sans-serif;">'+
    '<div style="font-size:46px;line-height:1;margin-bottom:8px;">🏆🌾</div>'+
    '<div style="font-size:22px;font-weight:900;color:#8B6310;margin-bottom:6px;">全部精通！</div>'+
    '<div style="font-size:14px;color:#555;line-height:1.7;margin-bottom:16px;">👧🏻 米娜：這個等級的字，你<b>全部都記住了</b>，好厲害呀！🎉</div>'+
    '<div style="display:flex;flex-direction:column;gap:8px;">'+
      '<button class="btn btn-primary" id="tg-am-review">繼續複習（不計分）</button>'+
      '<button class="btn btn-secondary" id="tg-am-level">挑戰其他等級</button>'+
    '</div></div>';
  div.addEventListener('click',function(e){if(e.target===div)div.remove();});
  document.body.appendChild(div);
  document.getElementById('tg-am-review').onclick=function(){try{ if(typeof gtag==='function') gtag('event','typing_game_allmastered_continue',{category:'game'}); }catch(e){}div.remove();};
  document.getElementById('tg-am-level').onclick=function(){try{ if(typeof gtag==='function') gtag('event','typing_game_allmastered_switch_level',{category:'game'}); }catch(e){}div.remove();var el=document.getElementById('end');if(el)el.style.display='none';var g=document.getElementById('game');if(g)g.style.display='none';window.scrollTo(0,0);};
}

// กฎ MASTER ข้อ10 (ลอกเกมอ่านเป๊ะ 2026-07-05): กดแล้ว "ไม่ตัดคำทันที" — ต้องพิมพ์คำนี้ต่อให้ผ่านแบบสะอาด (ไม่มีคำใบ้) 1 ครั้งก่อน ถึงจะตัดคำออก (ดู finalizeWord curWordIsKnownCheck)
function remember(){
  try{ if(typeof gtag==='function') gtag('event','typing_game_remember_click',{category:'game', word: (typeof WORD!=='undefined'&&WORD)?WORD.th:''}); }catch(e){}
  curWordIsKnownCheck=true;
  try{rgTypeHighlightNextKey();}catch(e){} // ซ่อนคำใบ้ที่อาจค้างอยู่ทันที
  var b=document.getElementById('banner');
  if(b){b.textContent='證明你真的記得：接下來不會有提示，答對才會標記熟練 ✓';b.className='gsh-feedback-slot result-banner show';}
  var rb=document.getElementById('btn-remember');
  if(rb)rb.style.display='none';
}
function next(){
  try{ if(typeof gtag==='function') gtag('event','typing_game_next_click',{category:'game', word: (typeof WORD!=='undefined'&&WORD)?WORD.th:''}); }catch(e){}
  if(sylIdx<sylList.length-1){sylIdx++;loadSyl();}  // ไปพยางค์ถัดไปของคำเดิม
  else nextWord();                                   // จบคำ → คำถัดไป
}

function nextWord(){
  cur++;
  if(cur>=roundQueue.length){endRound();return;}
  tgSaveResume(); // Phase E3: บันทึกจุดที่กำลังจะไปต่อ (คำถัดไปยังไม่เริ่มพิมพ์เลย = จุดปลอดภัยที่สุดที่จะ resume กลับมา)
  loadWord();
}

function endRound(){
  tgCloseMobileKeyboard();
  tgRoundActive=false;
  try{ if(window.GameResume) GameResume.clear('typing-game'); }catch(e){} // Phase E3: จบรอบแล้ว ไม่มีอะไรให้ resume อีก
  document.getElementById('game').style.display='none';
  document.getElementById('end').style.display='flex';
  if(window.GameFlow)GameFlow.markResult('#end');
  document.getElementById('pf').style.width='100%';
  document.getElementById('prog-txt').textContent=roundQueue.length+'/'+roundQueue.length;
  // กฎ MASTER: ดาวเงินแจกตอน mastered ใน finalizeWord() แล้ว (มี toast ของตัวเอง) — endRound() ไม่แจกดาวซ้ำอีก
  // โบนัสจบรอบ: +20 ทุกครั้งที่จบ · +50 เพิ่มถ้า perfect — แต่ถ้ารอบนี้มีคำที่ใช้ 提示 แม้ครั้งเดียว = โหมดฝึกฝน ไม่แจกโบนัส (กฎ MASTER ข้อ 9)
  var roundBonus=0;
  if(roundTotal>0 && !roundHadGuide){
    roundBonus+=ROUND_COMPLETE_BONUS;
    if(cleanC===roundTotal)roundBonus+=ROUND_PERFECT_BONUS;
  }
  roundScore+=roundBonus;
  var levelWeight=LEVEL_WEIGHT[curLevel]||1;
  var weightedScore=Math.round(roundScore*levelWeight);
  try{ if(typeof gtag==='function') gtag('event','typing_game_complete',{category:'game',score: weightedScore, total: roundTotal, perfect: cleanC, level: curLevel}); }catch(e){}
  document.getElementById('end-score').textContent=weightedScore+' 分'+(levelWeight!==1?'（'+curLevel+'級 ×'+levelWeight+'）':'');
  var detail='';
  doSave();
  var _isPerfect=(cleanC===roundTotal && roundTotal>0);
  if(roundHadGuide){
    detail='這輪用了提示練習 🙂 下次試試看不看提示，就能拿分數！';
  } else if(_isPerfect){
    detail='完美一輪！✨ 全部 '+roundTotal+' 題答對';
  } else {
    detail='乾淨答對 '+cleanC+'/'+roundTotal+' 題';
  }
  if(roundBonus)detail+='・含完成獎勵 +'+roundBonus;
  document.getElementById('end-detail').textContent=detail;
  // 本輪詳細紀錄使用完整 roundLog，答對與答錯都可查看。
  try{ var _mb=document.getElementById('tg-mistakes-btn'); if(_mb)_mb.style.display=roundLog.length?'':'none'; }catch(e){}
  var submissionId=null;
  try{
    if(window.READING_AUTH && READING_AUTH.saveScore) submissionId=READING_AUTH.saveScore(weightedScore,1,'typing',rgWrongItemsFromLog(),{
      difficulty:curLevel,
      items:roundLog.map(function(w){return {key:w.th,points:Number(w.pts)||0,wrong:Number(w.wrong)||0,guide:!!w.guide,failed:!!w.failed,mastered:!!w.mastered};}),
      roundBonus:roundBonus,srsBonus:0
    });
  }catch(e){} // S29: คะแนน Core 5 ผ่าน score-submit เท่านั้น
  if(roundReport&&window.RoundReport)RoundReport.finish(roundReport,{score:weightedScore,submission_id:submissionId});
  // ── weekly challenge + streak freeze ──
  var _isPerfect = (cleanC === roundTotal && roundTotal > 0);
  var _maxCombo = maxStreak; // max combo ที่ทำได้ในรอบนี้
  try { rgChallengeBump(_maxCombo, _isPerfect); } catch(e){}
  try {
    var _sv = rgApplyStreak();
    if(_sv.events.freezeEarned) rgToast('獲得新護盾 🛡️ ×1！連續'+_sv.state.streak+'天');
    // น้องมีนาพูดตอนจบรอบ: goalMet > freezeUsed > perfect/greatSet/goodSet — Lin 2026-07-20 (เทียบเกมเสียง)
    var _cleanRatio = roundTotal>0 ? (cleanC/roundTotal) : 0;
    var _minaSetKey = _isPerfect ? 'perfect' : (_cleanRatio>=0.6 ? 'greatSet' : 'goodSet');
    if(_sv.events.goalMetToday) minaToast('goalMet',{vars:{n:_sv.state.streak},dur:3400});
    else if(_sv.events.freezeUsed) minaToast('freezeUsed',{dur:3200});
    else minaToast(_minaSetKey,{dur:3000});
  } catch(e){}
  try { rgRenderGameBar(); } catch(e){}
  refreshUI();
  if(window.GameFlow){
    var _hl=[];
    if(rgLoggedIn()&&window.GAME_ACCOUNT){var _gs=GAME_ACCOUNT.getStreak();if(_gs)_hl.push('🔥 連續 '+_gs+' 天');var _gb=GAME_ACCOUNT.earnedBadges();if(_gb.length)_hl.push('🎖️ '+_gb[_gb.length-1].zh);}
    GameFlow.enhanceResult({key:'typing-result',root:'#end',actions:'#end .gsh-end-actions',correct:roundReport?roundReport.correct_count:cleanC,total:roundReport?roundReport.total_items:roundTotal,highlights:_hl,report:roundReport,onReplay:restart});
  }
  tgAttachLoginSummary();
}

function tgAttachLoginSummary(){
  if(!roundReport||!window.LearningSummary||!rgLoggedIn())return;
  LearningSummary.loadForGame('typing','typing-game').then(function(summary){
    if(!roundReport||!window.RoundReport)return;
    RoundReport.setLoginSummary(roundReport,summary);
    if(window.GameFlow)GameFlow.attachReport('#end',roundReport);
  });
}

// ════════════════════════════════════════════
// Shared Game UI Phase F2 (2026-08-10): 查看錯題 — read-only, อ่านจาก roundLog เท่านั้น (ตัวกรองเดียวกับ
// rgWrongItemsFromLog ที่มีอยู่แล้ว) ไม่มีการแก้คะแนน/คำตอบใดๆ ทั้งสิ้น
// ════════════════════════════════════════════
function tgRenderMistakes(){
  var wrongs=tgReportRows();
  var list=document.getElementById('tg-mistakes-list');
  if(!list)return wrongs.length;
  list.innerHTML='';
  if(!wrongs.length){
    var empty=document.createElement('div');
    empty.style.cssText='text-align:center;color:#888;font-size:13px;padding:10px;font-family:\'Noto Sans TC\',sans-serif;';
    empty.textContent='這輪沒有打錯的字，太棒了 🎉';
    list.appendChild(empty);
    return 0;
  }
  wrongs.forEach(function(w){
    var item=document.createElement('div');
    item.className='gsh-mistake-item'+(((w.wrong||0)>0||w.failed)?' gsh-mistake-wrong':'');
    var q=document.createElement('div'); q.className='gsh-mistake-q'; q.textContent=w.th||'';
    item.appendChild(q);
    var r1=document.createElement('div'); r1.className='gsh-mistake-row';
    r1.appendChild(document.createTextNode('中文：'));
    var b1=document.createElement('b'); b1.textContent=w.zh||''; r1.appendChild(b1);
    item.appendChild(r1);
    var rAnswer=document.createElement('div');rAnswer.className='gsh-mistake-row';rAnswer.appendChild(document.createTextNode('你的作答：'));var bAnswer=document.createElement('b');bAnswer.textContent=w.userAnswer||'（未保留逐次答案）';rAnswer.appendChild(bAnswer);item.appendChild(rAnswer);
    var rCorrect=document.createElement('div');rCorrect.className='gsh-mistake-row';rCorrect.appendChild(document.createTextNode('正確答案：'));var bCorrect=document.createElement('b');bCorrect.textContent=w.correctAnswer||w.reading||w.th||'';rCorrect.appendChild(bCorrect);item.appendChild(rCorrect);
    var r2=document.createElement('div'); r2.className='gsh-mistake-row';
    r2.appendChild(document.createTextNode('打錯次數：'));
    var b2=document.createElement('b'); b2.textContent=String(w.wrong||0); r2.appendChild(b2);
    if(w.failed){ r2.appendChild(document.createTextNode('・')); var b3=document.createElement('b'); b3.style.color='#c62828'; b3.textContent='未答對（已公佈答案）'; r2.appendChild(b3); }
    item.appendChild(r2);
    list.appendChild(item);
  });
  return wrongs.length;
}
function tgShowMistakes(){
  try{ if(typeof gtag==='function') gtag('event','typing_game_mistakes_open',{category:'game'}); }catch(e){}
  tgRenderMistakes();
  var endEl=document.getElementById('end');
  var p=document.getElementById('tg-mistakes-panel');
  if(window.GameFlow&&endEl&&p)GameFlow.markResultDetail(endEl,p);
  if(endEl)endEl.style.display='none';
  if(p)p.style.display='flex';
}
function tgHideMistakes(){
  try{ if(typeof gtag==='function') gtag('event','typing_game_mistakes_close',{category:'game'}); }catch(e){}
  var p=document.getElementById('tg-mistakes-panel');
  var endEl=document.getElementById('end');
  if(window.GameFlow&&endEl&&p)GameFlow.unmarkResultDetail(endEl,p);
  if(p)p.style.display='none';
  if(endEl)endEl.style.display='flex';
}

function restart(){
  tgCloseMobileKeyboard();
  try{ if(typeof gtag==='function') gtag('event','typing_game_restart_click',{category:'game'}); }catch(e){}
  try{ if(window.GameResume) GameResume.clear('typing-game'); }catch(e){} // Phase F5/E3: กด "再玩一次" (มาถึงได้จากหน้าจบรอบเท่านั้น) = ล้าง session ค้างเก่าทิ้งเสมอ
  initGame();
}

// ════════════════════════════════════════════
// Shared Game UI Phase E3 (2026-08-10): Guest resume (window.GameResume, js/core/shared.js)
// Local-device resume สำหรับทั้ง guest และผู้ล็อกอิน โดยไม่อ้างว่า sync ข้ามเครื่อง
// Cross-device ยัง BLOCKED จนกว่าจะมี canonical server adapter/schema ที่ได้รับอนุมัติ
// ระดับความละเอียดที่ทำได้: "ชุดคำเดิม + ตำแหน่งเดิม พร้อมพิมพ์พยางค์ใหม่" เท่านั้น — ไม่กู้คืนตัวที่พิมพ์ค้างกลางคำ/สถานะ IME
// เพราะระบบคีย์บอร์ด/IME ของเกมนี้ละเอียดอ่อนมาก (ดูคอมเมนต์ยาวเรื่อง iOS compose ในไฟล์นี้) เสี่ยงเกินไปถ้าจะพยายามกู้ระดับนั้น
// ════════════════════════════════════════════
function tgSaveResume(){
  try{
    if(!window.GameResume)return;
    if(!roundQueue||!roundQueue.length)return;
    GameResume.save('typing-game',{
      level:curLevel,
      wordIds:roundQueue.map(function(i){return (WORDS[i]&&WORDS[i].th)||null;}), // เก็บ "คำ+ระดับ" ไม่เก็บ index ตรงๆ กันข้อมูลคำขยับตำแหน่งแล้ว resume ผิดคำ (เหตุผลเดียวกับ rgSrsKey)
      cur:cur,okC:okC,badC:badC,streak:streak,maxStreak:maxStreak,
      roundScore:roundScore,cleanC:cleanC,roundHadGuide:roundHadGuide,roundLog:roundLog,report:roundReport&&window.RoundReport?RoundReport.snapshot(roundReport):null
    });
  }catch(e){}
}
function tgTryResume(){
  try{
    if(!window.GameResume)return;
    var saved=GameResume.load('typing-game');
    if(!saved||!saved.wordIds||!saved.wordIds.length)return;
    if(typeof saved.cur!=='number'||saved.cur>=saved.wordIds.length)return; // รอบนั้นทำจบแล้ว ไม่มีอะไรให้ต่อ
    var banner=document.getElementById('tg-resume-banner');
    var detailEl=document.getElementById('tg-resume-detail');
    if(!banner||!detailEl)return;
    detailEl.textContent=GameUiCopy.resumeLine('打字練習',(saved.level||'初')+'級','第 '+(saved.cur+1)+'/'+saved.wordIds.length+' 字');
    banner.style.display='block';
    window.__tgResumeData=saved;
  }catch(e){}
}
function tgResumeContinue(){
  try{
    var saved=window.__tgResumeData;
    var banner=document.getElementById('tg-resume-banner');
    if(banner)banner.style.display='none';
    if(!saved||!saved.wordIds||!saved.wordIds.length)return;
    // หา index ปัจจุบันของแต่ละคำจาก th (ข้อมูลอาจเปลี่ยนไปตั้งแต่ครั้งก่อน — ข้ามคำที่หาไม่เจอ)
    var idxByTh={};
    for(var i=0;i<WORDS.length;i++){ if(!(WORDS[i].th in idxByTh)) idxByTh[WORDS[i].th]=i; }
    var q=saved.wordIds.map(function(th){return (th!=null && idxByTh.hasOwnProperty(th))?idxByTh[th]:null;}).filter(function(v){return v!=null;});
    if(!q.length){ tgResumeRestart(); return; } // หาไม่เจอสักคำเลย (ข้อมูลเปลี่ยนไปมาก) → เริ่มรอบใหม่แทน ปลอดภัยกว่าเดา
    try{ if(typeof gtag==='function') gtag('event','typing_game_resume_continue',{category:'game', level: saved.level}); }catch(e){}
    curLevel=saved.level||curLevel;
    try{localStorage.setItem('tg_level',curLevel);}catch(e){}
    document.querySelectorAll('.ltab').forEach(function(b){b.classList.remove('active');});
    var lt=document.getElementById('ltab-'+curLevel); if(lt)lt.classList.add('active');
    roundQueue=q;roundTotal=q.length;
    cur=Math.min(saved.cur||0,q.length-1); // กันกรณีบางคำหาไม่เจอ ตำแหน่งเลื่อนขึ้นเล็กน้อย
    okC=saved.okC||0;badC=saved.badC||0;streak=saved.streak||0;maxStreak=saved.maxStreak||0;
    roundScore=saved.roundScore||0;cleanC=saved.cleanC||0;roundHadGuide=!!saved.roundHadGuide;
    roundLog=Array.isArray(saved.roundLog)?saved.roundLog:[];
    roundReport=window.RoundReport?RoundReport.restore(saved.report,{game_type:'typing',difficulty:curLevel,mode:'thai-keyboard'}):null;
    var _mp=document.getElementById('tg-mistakes-panel'); if(_mp)_mp.style.display='none';
    document.getElementById('end').style.display='none';
    document.getElementById('game').style.display='flex';
    document.getElementById('bars-wrap').style.display='flex';
    document.getElementById('rg-stat-row').style.display='flex';
    refreshUI();
    loadWord();
  }catch(e){}
}
function tgResumeRestartSame(){
  var saved=window.__tgResumeData;
  if(!saved){tgResumeNewRound();return;}
  var idxByTh={};for(var i=0;i<WORDS.length;i++){if(!(WORDS[i].th in idxByTh))idxByTh[WORDS[i].th]=i;}
  var q=(saved.wordIds||[]).map(function(th){return idxByTh.hasOwnProperty(th)?idxByTh[th]:null;}).filter(function(v){return v!=null;});
  if(!q.length){tgResumeNewRound();return;}
  var banner=document.getElementById('tg-resume-banner');if(banner)banner.style.display='none';
  curLevel=saved.level||curLevel;roundQueue=q;roundTotal=q.length;cur=0;okC=0;badC=0;streak=0;maxStreak=0;roundScore=0;cleanC=0;roundHadGuide=false;roundLog=[];roundReport=window.RoundReport?RoundReport.create({game_type:'typing',difficulty:curLevel,mode:'thai-keyboard'}):null;window.__tgResumeData=null;
  document.getElementById('end').style.display='none';document.getElementById('game').style.display='flex';document.getElementById('bars-wrap').style.display='flex';document.getElementById('rg-stat-row').style.display='flex';refreshUI();tgSaveResume();loadWord();
}
function tgResumeNewRound(){
  try{ if(typeof gtag==='function') gtag('event','typing_game_resume_restart',{category:'game'}); }catch(e){}
  var banner=document.getElementById('tg-resume-banner');
  if(banner)banner.style.display='none';
  try{ if(window.GameResume) GameResume.clear('typing-game'); }catch(e){}
  window.__tgResumeData=null;
  initGame();
}
function tgResumeRestart(){tgResumeNewRound();}

// ════════════════════════════════════════════
// PDF 報告（本輪作答事實 + 登入後 SRS 下次複習日期）— Lin 2026-07-07
// Lin 2026-07-20: เปลี่ยนจาก html2canvas+jsPDF (โหลด CDN ทุกครั้ง เสี่ยงพัง/ช้า) → หน้าต่าง print เหมือนเกมเสียง
//   (เกมเสียงเคยเจอ html2canvas ออกไฟล์ว่างเปล่าบนคอม + ค้างบนมือถือ มาแล้ว เปลี่ยนเป็น print window ตั้งแต่ 2026-06-19 เสถียรกว่า)
// ════════════════════════════════════════════
function rgDownloadReport(){
  try{ if(typeof gtag==='function') gtag('event','typing_game_pdf_download',{category:'game'}); }catch(e){}
  if(window.RoundReport&&typeof RoundReport.openPrint==='function'){
    if(RoundReport.openPrint({gameType:'typing',report:roundReport,title:'泰語打字練習室・本輪報告',documentTitle:'打字練習報告',difficulty:curLevel+'級'}))return;
    try{rgToast('請允許彈出視窗才能列印報告 🙏');}catch(e0){alert('請允許彈出視窗才能列印報告');}
    return;
  }
  var SERIF="'Noto Serif TC','PingFang TC',serif";
  var SANS="'Noto Sans TC','PingFang TC',sans-serif";
  var today=new Date().toLocaleDateString('zh-TW',{year:'numeric',month:'2-digit',day:'2-digit'});
  var levelWeight=LEVEL_WEIGHT[curLevel]||1;
  var weightedScore=Math.round(roundScore*levelWeight);
  var loggedIn=rgLoggedIn();

  function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function wordBreakdown(w){
    if(!w.wordGlosses||!w.wordGlosses.length)return '';
    return '<div style="font-size:10px;font-weight:400;color:#777;line-height:1.5;margin-top:4px;">逐字：'+w.wordGlosses.map(function(g){return esc(g.th)+'＝'+esc(g.zh);}).join('・')+'</div>';
  }
  function statusLabel(w){
    if(w.mastered) return '<span style="color:#8B6310;">✓ 已精通</span>';
    if(w.guide) return '<span style="color:#b06020;">💡 用提示</span>';
    if(w.failed) return '<span style="color:#c62828;">✗ 待加強</span>';
    return '<span style="color:#2e7d32;">✓ 答對</span>';
  }
  var rows=tgReportRows().map(function(w,i){
    return '<tr>'
      +'<td style="padding:7px 6px;font-size:12px;color:#888;text-align:center;">'+(i+1)+'</td>'
      +'<td style="padding:7px 6px;font-size:15px;font-weight:700;word-break:keep-all;overflow-wrap:break-word;">'+esc(w.th)+'<div style="font-size:10px;font-weight:400;color:#777;">作答：'+esc(w.userAnswer||'（未保留）')+'<br>正解：'+esc(w.correctAnswer||w.th)+'</div>'+wordBreakdown(w)+'</td>'
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
    +'<div style="color:#fff;font-size:20px;font-weight:700;font-family:'+SERIF+';">泰語打字練習室・本輪報告</div>'
    +'<div style="font-family:'+SANS+';font-size:9px;letter-spacing:0.2em;color:#C8973A;font-weight:700;margin-top:6px;">mrtaihualin.com</div>'
    +'</td>'
    +'<td style="padding:22px 26px;vertical-align:top;text-align:right;color:#C8973A;white-space:nowrap;">'
    +'<div style="font-family:'+SANS+';font-size:11px;">'+esc(today)+'</div>'
    +'<div style="font-family:'+SANS+';font-size:11px;">'+esc(curLevel)+'級</div>'
    +'</td></tr></table>'
    +'<div style="padding:20px 26px;">'
    +'<table style="width:100%;font-family:'+SANS+';font-size:12px;color:#8B6310;"><tr>'
    +'<td>本輪得分</td><td style="text-align:right;font-size:20px;font-weight:700;color:#5a3e0a;">'+weightedScore+' 分</td>'
    +'</tr><tr><td>答對題數</td><td style="text-align:right;">'+cleanC+' / '+roundTotal+'</td></tr></table>'
    +'<hr style="border:none;border-top:1px solid rgba(139,99,16,0.2);margin:14px 0;">'
    +'<table style="width:100%;border-collapse:collapse;"><thead><tr style="border-bottom:1.5px solid #C8973A;">'
    +'<th style="font-size:11px;color:#8B6310;padding:5px;">#</th>'
    +'<th style="font-size:11px;color:#8B6310;padding:5px;text-align:left;">泰文</th>'
    +'<th style="font-size:11px;color:#8B6310;padding:5px;text-align:left;">意思</th>'
    +'<th style="font-size:11px;color:#8B6310;padding:5px;">狀態</th>'
    +'<th style="font-size:11px;color:#8B6310;padding:5px;">打錯次數</th>'
    +'<th style="font-size:11px;color:#8B6310;padding:5px;">得分</th>'
    +(loggedIn?'<th style="font-size:11px;color:#8B6310;padding:5px;">下次複習</th>':'')
    +'</tr></thead><tbody>'+rows+'</tbody></table>'
    +(window.RoundReport?RoundReport.loginSectionsHtml(roundReport):'')
    +'</div></div>'
    +'<div style="text-align:center;font-family:'+SANS+';font-size:9.5px;letter-spacing:0.15em;color:#8B6310;padding:16px 26px 4px;">泰華眼裡的泰語教學　·　mrtaihualin.com</div>'
    +'</div>';

  var win = window.open('', '_blank');
  if (!win) { try{ rgToast('請允許彈出視窗才能列印報告 🙏'); }catch(e2){ alert('請允許彈出視窗才能列印報告'); } return; }
  win.document.open();
  win.document.write(
    '<!DOCTYPE html><html lang="zh-TW"><head><meta charset="utf-8"><title>打字練習報告</title>'
    +'<link href="https://fonts.googleapis.com/css2?family=Noto+Serif+TC:wght@400;700;900&family=Noto+Sans+TC:wght@400;700&display=swap" rel="stylesheet">'
    +'<style>@page{margin:10mm;}body{margin:0;background:#fff;}</style>'
    +'</head><body>'+innerHtml+'</body></html>'
  );
  win.document.close();
  win.focus();
  setTimeout(function(){ try{ win.print(); }catch(e){} }, 600);
}
// ── GA: 遊戲結束 → 預約 / 聲調遊戲 追蹤（標準模式才會記錄）──
function trackBookCTA(){try{if(typeof gtag==='function')gtag('event','book_trial_click',{category:'game',method:'typing_game_end'});}catch(e){}}
function trackToneLink(){try{if(typeof gtag==='function')gtag('event','game_link_click',{category:'game',target:'games_hub',from:'typing_game'});}catch(e){}} // ปุ่มนี้ลิงก์ไป games.html จริง → target ต้องเป็น games_hub — แก้ 2026-07-02

// ════════════════════════════════════════════
// UI HELPERS
// ════════════════════════════════════════════
function refreshUI(){
  tgUpdateScoreBar(); // Lin 2026-07-06: หลอด 本題分數 (แทนหลอด ⚡ เดิม) ไล่สีทอง→แดง
  document.getElementById('pf').style.width=(cur/Math.max(1,roundQueue.length)*100)+'%';
  document.getElementById('prog-txt').textContent=cur+'/'+roundQueue.length;
  document.getElementById('qt').textContent=roundQueue.length;
}

function updateCombo(){
  var cb=document.getElementById('cb');
  if(streak>=3){cb.classList.add('show');document.getElementById('cn').textContent=streak;}
  else cb.classList.remove('show');
}

function setGameBtns(mode){
  var re=document.getElementById('btn-remember');
  var ch=document.getElementById('btn-check');
  var nx=document.getElementById('btn-next');
  if(mode==='normal'){
    if(re)re.style.display='';ch.style.display='';ch.disabled=true;nx.style.display='none';
    if(window.GameFlow)GameFlow.cancel('typing-game');
  } else {
    if(re)re.style.display='none';ch.style.display='none';nx.style.display='';
    if(window.GameFlow)setTimeout(function(){GameFlow.start({key:'typing-game',nextButton:nx,delaySeconds:5});},0);
  }
}

function markOpts(){
  document.getElementById('pool').querySelectorAll('.opt').forEach(function(x){
    x.classList.add('locked');
    var id=Number(x.dataset.id),val=x.dataset.val;
    var c=slotOfTile(id); // ตัดสินถูก/ผิดตาม "ช่องที่วาง" ไม่ใช่ชนิดไทล์
    if(c)x.classList.add(correctVal[c]===val?'correct':'wrong');
  });
}

// Lin 2026-07-10: เปลี่ยนคำอ่านจากอังกฤษ (náam) เป็นสะกดไทยจริง — คำหลายพยางค์ (มี WORD.syls) ต่อเป็น "ผม-กิน-ข้าว" ให้เห็นจุดแบ่งพยางค์
function buildThaiPron(){
  if(WORD&&WORD.readingTH)return WORD.readingTH; // Lin 2026-07-12: คำอ่านจริง (สะ-หนาม-บิน) ไม่ใช่ตัวเขียน
  if(WORD&&WORD.th)return WORD.th; // Lin 2026-07-16: ปุ่ม/กล่องคำอ่านต้องใช้ readingTH เสมอ (fallback=ตัวคำเอง) ห้ามใช้ syls[].th ต่อกัน
  return W?(W.read||W.th):'';
}
function showReveal(){
  var _pron=buildThaiPron();
  document.getElementById('rev-pron').textContent=(rgPronMode&&_pron)?_pron:''; // Lin 2026-07-26: เคารพปุ่ม🐣/🥚 ไม่บังคับโชว์讀音ตอนเฉลยอีกต่อไป
  rgRenderEnLine();
  var box=document.getElementById('reveal-rules');
  box.innerHTML='';
  // ข้ามการพิมพ์ซ้ำ "เฉพาะเมื่อ" แผงวรรณยุกต์ (#bonus-reason) โชว์คำอธิบายจริงๆ อยู่แล้วเท่านั้น
  // Lin 2026-07-12: แก้บั๊กคำอธิบายหาย (圖3) — เดิมเช็คแค่ #bonus-section โชว์ไหม แต่บางคำ #bonus-reason ว่างเปล่า → เลย skip ทิ้งจนไม่มีคำอธิบายเลย
  var _bSec=document.getElementById('bonus-section');
  var _bRea=document.getElementById('bonus-reason');
  var bonusShowing=_bSec.classList.contains('show') && _bRea && _bRea.classList.contains('show') && _bRea.innerHTML.trim()!=='';
  if(!bonusShowing){
    // 2026-07-30: หัว 📍 คำ（第X聲）ตามรูปแบบที่ Lin อนุมัติ (เหมือนคำหลายพยางค์)
    var head=document.createElement('div');
    head.className='rule-row';
    head.style.cssText='font-weight:800;color:#8B6310;';
    head.textContent='📍 '+buildAnswerHeader(W);
    box.appendChild(head);
    var rules=buildRevealRules(W);
    rules.forEach(function(r){
      var row=document.createElement('div');row.className='rule-row';
      var tag=document.createElement('span');tag.className='rule-tag'+(r.sp?' sp':'');tag.textContent=r.tag;
      var txt=document.createElement('span');txt.className='rule-txt';txt.innerHTML=r.text;
      row.appendChild(tag);row.appendChild(txt);box.appendChild(row);
    });
  }
  document.getElementById('reveal').className='reveal show';
  tgSyncDetailToggle(); // Phase D2: เนื้อหาเฉลยคำนวณเสร็จแล้ว — โผล่ปุ่ม [ 查看詳細解說 ] ถ้ามีของจริงให้ดู
}
// 打完整句（多音節連續打字模式）— 顯示「整句」的子音/母音/尾音分析＋泰文讀法，不是只顯示最後一個音節而已
// 每個字/音節各自一段分析，答對答錯都會顯示（rgContFinish 不管成功/失敗都會呼叫這個）— Lin 2026-07-07
function showRevealMulti(){
  var _pronM=buildThaiPron();
  document.getElementById('rev-pron').textContent=(rgPronMode&&_pronM)?_pronM:''; // Lin 2026-07-26: เคารพปุ่ม🐣/🥚 ไม่บังคับโชว์讀音ตอนเฉลยอีกต่อไป
  rgRenderEnLine();
  // Lin 2026-07-12 (圖3 unify): คำอธิบายต้องอยู่ "ในกล่องพยางค์" เสมอ → หลายพยางค์ = ใส่ใน #bonus-reason ของกล่องสุดท้าย (เลิกใช้แผงแยก #reveal)
  var box=document.getElementById('bonus-reason');
  box.innerHTML='';
  function _finishInBox(){
    box.className='bonus-reason show';
    var _sec=document.getElementById('bonus-section'); if(_sec)_sec.className='bonus-section show';
    var _rv=document.getElementById('reveal'); if(_rv)_rv.className='reveal'; // ซ่อนแผงเฉลยแยกด้านล่าง ไม่ใช้แล้ว
    // (ป้าย猜聲調/讀音 ในกล่องนี้ถูกลบไปแล้ว 2026-07-30 — ไม่มีอะไรต้องซ่อนเพิ่ม)
    tgSyncDetailToggle(); // Phase D2: เนื้อหาเฉลยคำนวณเสร็จแล้ว — โผล่ปุ่ม [ 查看詳細解說 ] ถ้ามีของจริงให้ดู
  }
  // 高級(ประโยค) → อธิบายว่า "แต่ละคำแปลว่าอะไร" (ไม่แยกพยัญชนะ/สระ) — มาตรฐานเดียวกับเกมเรียงคำ
  if(WORD && WORD.words && WORD.words.length){
    WORD.words.forEach(function(wd){
      var row=document.createElement('div');row.className='rule-row';
      var tag=document.createElement('span');tag.className='rule-tag';tag.textContent=wd.th;
      var txt=document.createElement('span');txt.className='rule-txt';txt.textContent=wd.zh;
      row.appendChild(tag);row.appendChild(txt);box.appendChild(row);
    });
    // Lin 2026-08-01: ถ้าเปิดปุ่มครับ/ค่ะ/คะ ไว้ (พิมพ์ครบรวมพยางค์นี้ด้วย) → เพิ่มแถวอธิบายคำนี้ท้ายสุดด้วย ให้เหมือนคำอื่นในกล่องเฉลย (ไม่นับคะแนน แต่ก็ยังควรมีคำอธิบายให้เข้าใจว่าคือคำอะไร)
    var _lastSy=sylList[sylList.length-1];
    if(_lastSy && _lastSy.isParticle){
      var pZh=_lastSy.th==='ครับ'?'（男性禮貌詞）':(_lastSy.th==='คะ'?'（女性禮貌詞・疑問句）':'（女性禮貌詞・句尾非疑問）');
      var prow=document.createElement('div');prow.className='rule-row';
      var ptag=document.createElement('span');ptag.className='rule-tag';ptag.textContent=_lastSy.th;
      var ptxt=document.createElement('span');ptxt.className='rule-txt';ptxt.textContent=pZh+'（不計分）';
      prow.appendChild(ptag);prow.appendChild(ptxt);box.appendChild(prow);
    }
    _finishInBox();return;
  }
  // 2026-07-30: เฉลยแบ่งตาม "พยางค์อ่าน" — คำที่มี readSyls (เช่น เอกสาร = เอก/กะ/สาร) ใช้ readSyls แทน sylList
  var ansList=(WORD&&WORD.readSyls&&WORD.readSyls.length)?WORD.readSyls:sylList;
  ansList.forEach(function(SY,i){
    var head=document.createElement('div');
    head.className='rule-row';
    head.style.cssText='margin-top:'+(i===0?'0':'6px')+';font-weight:800;color:#8B6310;';
    head.textContent='📍 '+buildAnswerHeader(SY);
    box.appendChild(head);
    var rules=buildRevealRules(SY);
    rules.forEach(function(r){
      var row=document.createElement('div');row.className='rule-row';
      var tag=document.createElement('span');tag.className='rule-tag'+(r.sp?' sp':'');tag.textContent=r.tag;
      var txt=document.createElement('span');txt.className='rule-txt';txt.innerHTML=r.text;
      row.appendChild(tag);row.appendChild(txt);box.appendChild(row);
    });
  });
  _finishInBox();
}

var _scorePopCount=0; // กันป๊อปคะแนนซ้อนทับกัน — Lin 2026-07-12
function pop(t){
  var idx=_scorePopCount++;
  var p=document.createElement('div');p.className='score-pop';p.textContent=t;
  if(idx>0) p.style.top=(26+idx*9)+'%';
  document.body.appendChild(p);
  setTimeout(function(){if(p.parentNode)p.parentNode.removeChild(p);_scorePopCount=Math.max(0,_scorePopCount-1);},1850);
}

// ════════════════════════════════════════════
// BADGE
// ════════════════════════════════════════════
var BADGE_STAGES=[
  {min:0,emoji:'🌱',label:'種下第一棵樹'},
  {min:1,emoji:'🌿',label:'開始成長了！'},
  {min:2,emoji:'🌲',label:'茁壯成長中'},
  {min:4,emoji:'🌴',label:'長成棕櫚樹！'},
  {min:6,emoji:'🌸',label:'盛開中！🌸'},
  {min:9,emoji:'🌻',label:'向陽生長！'},
  {min:12,emoji:'🌈',label:'彩虹般的成就！'},
  {min:16,emoji:'🏆',label:'泰語打字大師！'},
  {min:20,emoji:'💎',label:'鑽石等級！'},
  {min:30,emoji:'👑',label:'泰語之王！'}
];
function badgeEmoji(n){var e='🌱';BADGE_STAGES.forEach(function(s){if(n>=s.min)e=s.emoji;});return e;}
// Lin 2026-07-25: ⭐ ปุ่มดาว แยกออกจากปุ่ม勳章(openBadge) — โชว์แค่จำนวนดาวสะสม ไม่มีตารางแบดจ์
function openStar(){
  try{ if(typeof gtag==='function') gtag('event','typing_game_star_modal_open',{category:'game'}); }catch(e){}
  var s=(window.GAME_ACCOUNT)?GAME_ACCOUNT.getStars():totalStars;
  document.getElementById('star-tree-area').textContent='⭐ '+s;
  document.getElementById('star-tree-caption').textContent='累積星星（全部遊戲共用）';
  document.getElementById('star-modal').classList.add('show');
}
function openBadge(){
  try{ if(typeof gtag==='function') gtag('event','typing_game_badge_modal_open',{category:'game'}); }catch(e){}
  // ⭐ แบดจ์พันธุ์ข้าว ตามดาวรวม (รวมกับเกมเสียง) — Lin 2026-06-27
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
}

// ════════════════════════════════════════════
// START
// ════════════════════════════════════════════
// ════════════════════════════════════════════════
// WEEKLY CHALLENGE + STREAK FREEZE (เหมือนเกมเสียง)
// share TF_STREAK_KEY → streak/freeze ข้ามเกมได้
// ════════════════════════════════════════════════
var RG_GAME_CFG = {};
var RG_CHALLENGES = [
  { id: 'c_correct30', title: '答對 30 個字', sub: '本週累積全對 30 字', type: 'correct', target: 30, emoji: '🎯' },
  { id: 'c_sets5',     title: '玩完 5 組',     sub: '本週完成 5 組練習',  type: 'sets',    target: 5,  emoji: '📚' },
  { id: 'c_perfect3',  title: '3 次完美過關', sub: '本週完美過關 3 次',  type: 'perfect', target: 3,  emoji: '🌟' },
  { id: 'c_combo5',    title: '連對 5 題',     sub: '本週達成連對 5',    type: 'combo',   target: 5,  emoji: '🔥' },
  { id: 'c_correct60', title: '答對 60 個字', sub: '本週累積全對 60 字', type: 'correct', target: 60, emoji: '💪' }
];
var RG_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
function rgWeekIndex() { return Math.floor(Date.now() / RG_WEEK_MS); }
function rgWeekEndMs() { return (rgWeekIndex() + 1) * RG_WEEK_MS; }
function rgActiveChallenge() { return RG_CHALLENGES[rgWeekIndex() % RG_CHALLENGES.length]; }
var RG_CH_KEY = 'rg_challenge_v1';
function rgLoadChallenge() { try { return JSON.parse(localStorage.getItem(RG_CH_KEY) || '{}') || {}; } catch(e) { return {}; } }
function rgChallengeState() {
  var ch = rgActiveChallenge(), wk = rgWeekIndex(), saved = rgLoadChallenge();
  if (saved.week !== wk || saved.id !== ch.id) saved = { week: wk, id: ch.id, progress: 0, done: false };
  return { ch: ch, st: saved };
}
function rgSaveChallenge(st) { try { localStorage.setItem(RG_CH_KEY, JSON.stringify(st)); } catch(e) {} }

// streak+freeze — share key กับเกมเสียง
function rgLoadStreak() { try { return {streak:(window.GAME_ACCOUNT&&GAME_ACCOUNT.getStreak())||0}; } catch(e) { return {streak:0}; } }
function rgTodayStr() { var d = new Date(); return d.getFullYear() + '-' + ('0'+(d.getMonth()+1)).slice(-2) + '-' + ('0'+d.getDate()).slice(-2); }
function rgApplyStreak() {
  return {state:rgLoadStreak(),events:{}};
}

// bump challenge ตอนจบรอบ
function rgChallengeBump(maxCombo, isPerfect) {
  var pack = rgChallengeState(), ch = pack.ch, st = pack.st;
  if (st.done) { rgSaveChallenge(st); return; }
  var add = 0;
  if (ch.type === 'correct') add = cleanC;
  else if (ch.type === 'sets') add = 1;
  else if (ch.type === 'perfect') add = isPerfect ? 1 : 0;
  else if (ch.type === 'combo') add = (maxCombo || 0) >= ch.target ? ch.target : 0;
  if (ch.type === 'combo') st.progress = Math.max(st.progress, add);
  else st.progress += add;
  if (st.progress >= ch.target && !st.done) {
    st.done = true;
    rgToast('🎉 完成本週挑戰：' + ch.title + '！');
  }
  rgSaveChallenge(st);
}

// กฎ MASTER ข้อ 13: แถบชวนล็อกอิน (ยังไม่ล็อกอิน = โชว์, ล็อกอินแล้ว = ซ่อน) — ก็อบจากเกมอ่านทั้งหมด (Lin ยืนยัน 2026-07-05: เช็กเกมอื่นแล้วให้ทำเหมือนกัน)
function rgRenderLoginCTA(){
  var el=document.getElementById('rg-cta-login'); if(!el)return;
  if(rgLoggedIn()){ el.innerHTML=''; return; }
  el.innerHTML='<div style="font-family:\'Noto Sans TC\',sans-serif;box-sizing:border-box;">'+
    '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">'+
      '<span style="font-size:14px;color:#633806;font-weight:700;flex:1;min-width:180px;">登入後米娜才幫你把進度記起來 🌾</span>'+
      '<button onclick="rgCtaLogin()" style="background:#BA7517;color:#fff;border:none;font-weight:700;padding:6px 16px;border-radius:8px;font-size:13px;cursor:pointer;">登入解鎖 →</button>'+
      '<button onclick="var d=document.getElementById(\'rg-cta-detail\');var s=d.style.display===\'none\';d.style.display=s?\'block\':\'none\';this.textContent=s?\'收起 ▲\':\'更多福利 ▾\';" style="background:transparent;border:none;color:#854F0B;font-size:13px;cursor:pointer;font-weight:700;">更多福利 ▾</button>'+
    '</div>'+
    '<div id="rg-cta-detail" style="display:none;margin-top:10px;border-top:0.5px solid #EF9F27;padding-top:10px;font-size:13px;color:#633806;line-height:1.8;">'+
      '✅ 登入後可以：<br>🔥 保留每天完成練習的連續紀錄<br>🧠 智慧複習：記住你哪些字學會了、哪些還要練，到期自動幫你排進來<br>🏆 登上排行榜和大家一起比<br>📈 下次打開，直接讓你學習你的弱點'+
    '</div></div>';
}
// เปิด modal ล็อกอิน (ใช้ปุ่มล็อกอินเดิมของ auth-widget)
function rgCtaLogin(){ try{ var b=document.querySelector('#rg-login-slot button'); if(b){b.click();return;} }catch(e){} }

// render challenge banner + streak chips
function rgRenderGameBar() {
  try{ rgRenderLoginCTA(); }catch(e){}
  var cp = rgChallengeState(), st = rgLoadStreak();
  var pct = Math.min(100, Math.round(cp.st.progress / cp.ch.target * 100));
  var daysLeft = Math.max(0, Math.ceil((rgWeekEndMs() - Date.now()) / 86400000));
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
  var sn = document.getElementById('rg-streak-num'); if (sn) sn.textContent = (st.streak || 0);
  var fn = document.getElementById('rg-freeze-num'); if (fn) fn.textContent = 0;
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

// ════════════════════════════════════════════
// น้องมีนา 米娜 — บทพูด + ป๊อปพูดสด (โทนจีนไต้หวันอุ่นๆ ไกด์อ่อนโยน วิญญาณเซริกะ) — Lin 2026-07-10
// ⚠️ ใช้ emoji 👧🏻 ชั่วคราว · ห้ามโคลนเสียงคนจริง (นี่คือบทข้อความ ไม่ใช่ TTS)
// ════════════════════════════════════════════
var MINA_EMOJI='👧🏻';
var MINA_LINES={
  welcome:['哈囉～我是米娜 🌾 我們一起把泰文打字變厲害，好不好？','嗨嗨～我是米娜，今天也一起慢慢打吧 😊'],
  correct:['哇～打對了，你做得很好 ✨','對了對了！就是這樣打 🌾','很好喔～鍵位越來越熟了 😊'],
  combo:['哇～連續打對，米娜替你開心 🔥','停不下來了，好厲害 ⚡'],
  golden:['這個字…閃閃發光的！米娜找到黃金稻穗了 🌾✨ 分數加倍！'],
  wrong:['沒關係的…這個字米娜以前也打錯過，我們再看一次好嗎？','再試一次就好，米娜陪你 💛','慢慢來，看清楚鍵位就好 🌱'],
  perfect:['全部一次就打對！你比自己想的還厲害喔 🌾 米娜給你拍拍手 👏','一題都沒錯～好棒，米娜好開心 ✨'],
  greatSet:['這組打得很棒，我們慢慢繼續 💪','打得很好～要再一組看看嗎？🌱'],
  goodSet:['完成囉！每天一點點，打字會越來越快 🌱','辛苦了～有練就有進步喔 😊'],
  goalMet:['今天也做到了，好棒 🌙 連續第 {n} 天！明天也要回來找米娜喔'],
  freezeUsed:['米娜幫你保住連續紀錄了～用掉 1 個護盾 🛡️'],
  comeback:['又見面啦～今天也一起打字吧 😊','你回來了！米娜好想你 🌾'],
  streakWarn:['有點想你了…要不要回來陪米娜打字一下呢 🌾']
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

// ════════════════════════════════════════════
// 打字模式（Kedmanee 泰文鍵盤）— Lin 2026-07-02
// 用真實鍵盤鍵位打出音節，答對自動跳下一步；答錯 3 次視同原本「3 次沒選對」規則
// 只是「多一種輸入方式」，不影響/取代原本點選版
// ════════════════════════════════════════════
var RG_BASE_MAP=window.GSHThaiKeyboard.baseMap;
var RG_SHIFT_MAP=window.GSHThaiKeyboard.shiftMap;
var RG_REVERSE={}; // ตัวอักษร → {code, shift} ใช้ชี้ปุ่มถัดไปที่ต้องกด
(function(){
  Object.keys(RG_BASE_MAP).forEach(function(c){ RG_REVERSE[RG_BASE_MAP[c]]={code:c,shift:false}; });
  Object.keys(RG_SHIFT_MAP).forEach(function(c){ if(!(RG_SHIFT_MAP[c] in RG_REVERSE)) RG_REVERSE[RG_SHIFT_MAP[c]]={code:c,shift:true}; });
})();

var RG_TYPE={on:true,target:'',pos:0,wrong:0,shiftOn:false}; // หน้านี้เป็นโหมดพิมพ์ล้วน แยกออกมาเป็นเกมใหม่แล้ว ไม่ต้องมีปุ่มสลับ — Lin 2026-07-02

// ── โหมดพิมพ์ต่อเนื่องทั้งคำ สำหรับคำหลายพยางค์ (2 พยางค์ขึ้นไป, 初/中) — พิมพ์รวดเดียวจริงๆ ไม่คั่นเลยจนกว่าจะพิมพ์ครบทั้งคำ — Lin 2026-07-03 v2 ──
// (v1 ถามวรรณยุกต์ทันทีตอนจบแต่ละพยางค์ — Lin แจ้งว่ายังรู้สึกไม่ต่อเนื่อง จึงเปลี่ยนเป็น v2: พิมพ์ยาวจนจบคำก่อน แล้วค่อยถามวรรณยุกต์ทีเดียวรวดหลังพิมพ์เสร็จ)
// แยกเป็น path คู่ขนานทั้งหมด ไม่แตะ logic เดิมของคำพยางค์เดียว (初級) เลย (RG_CONT_ON เป็น false เสมอสำหรับคำเหล่านั้น) · 高級 ไม่ผ่าน loadSyl() อยู่แล้วจึงไม่เกี่ยว
var RG_CONT_ON=false;        // true = คำปัจจุบันกำลังพิมพ์ต่อเนื่องทั้งคำ (sylList.length>1)
var RG_CONT_BOUNDS=[];       // ตำแหน่งจบของแต่ละพยางค์ใน RG_TYPE.target (สะสม) เช่น [1,4,7]
var RG_CONT_SEG=0;           // พยางค์ที่กำลังพิมพ์อยู่ตอนนี้ (0-based)
var RG_CONT_WRONG=0;         // จำนวนพิมพ์ผิดสะสม "เฉพาะพยางค์ปัจจุบัน" (รีเซ็ตทุกครั้งที่ข้ามพยางค์)
var RG_CONT_TOKEN=0;         // กันเคส setTimeout ค้างข้ามคำ (ผู้เล่นกด skip/next ระหว่างรอ) — เทียบ token ก่อนทำงานทุกครั้ง
// RG_CONT_PAUSED / RG_CONT_TONE_Q / RG_CONT_TONE_IDX / RG_CONT_TONE_ANSWERED ถูกลบแล้ว (เอา猜聲調ออก 2026-07-30 — ไม่มีขั้นถามวรรณยุกต์ท้ายคำอีกแล้ว)

// เช็คว่าเป็นอุปกรณ์จอสัมผัส (มือถือ/แท็บเล็ต) ใช้ร่วมหลายจุด — Lin 2026-07-13
function rgIsTouchDevice(){ return !window.matchMedia('(hover:hover) and (pointer:fine)').matches; }
// เคยโฟกัสช่องพิมพ์มือถือมาก่อนไหม (เอาไว้ตัดสินใจว่าต้องดึงคีย์บอร์ดเครื่องกลับมาอัตโนมัติตอนขึ้นคำใหม่หรือเปล่า) — Lin 2026-07-13
var RG_MOBILE_KBD_USED=false;

// Mobile Landscape has an equivalent in-game Thai keyboard, so the native keyboard must stay closed.
// Portrait keeps the existing native-keyboard path; free-text inputs in other games are not touched.
var TG_LANDSCAPE_KBD_QUERY='(orientation: landscape) and (max-width: 1024px) and (max-height: 600px)';
function tgLandscapeUsesGameKeyboardOnly(){
  try{
    var touch=(navigator.maxTouchPoints||0)>0||rgIsTouchDevice();
    return touch&&window.matchMedia(TG_LANDSCAPE_KBD_QUERY).matches;
  }catch(e){return false;}
}
function tgSyncLandscapeKeyboardPolicy(){
  var gameOnly=tgLandscapeUsesGameKeyboardOnly();
  try{
    var mi=document.getElementById('rg-mobile-input');
    document.body.classList.toggle('tg-landscape-game-keyboard-only',gameOnly);
    if(!mi)return gameOnly;
    if(gameOnly){
      if(document.activeElement===mi)mi.blur();
      mi.readOnly=true;
      mi.setAttribute('inputmode','none');
      RG_MOBILE_KBD_USED=false;
    }else{
      mi.readOnly=false;
      mi.removeAttribute('readonly');
      mi.setAttribute('inputmode','text');
    }
  }catch(e){}
  return gameOnly;
}

// ── โหมดไกด์ไลน์ ใช้ร่วมทุกระดับ 初/中/高 (Lin 2026-07-02) ──
// true = highlight ปุ่มถัดไปบนคีย์บอร์ด + โชว์ need บน shift · false = ปิดหมด · จำค่าไว้ใน localStorage
var guideMode=(function(){try{return localStorage.getItem('tg_guide_mode')==='1';}catch(e){return false;}})(); // กฎ MASTER ข้อ9: default = 無提示 (โหมดเก็บแต้ม)
function setGuideMode(on){
  guideMode=!!on;
  try{localStorage.setItem('tg_guide_mode',guideMode?'1':'0');}catch(e){}
  try{ document.body.classList.toggle('tg-guide-hint', guideMode); }catch(e){}
  tgSyncLandscapeKeyboardPolicy();
  // Lin 2026-07-19: ปุ่มวงเดียว กดสลับ — 有提示 โชว์ 💡 · 無提示 โชว์ 🔥
  var gt=document.getElementById('guide-toggle');
  if(gt){ gt.textContent=guideMode?'💡':'🔥'; gt.title=guideMode?'有提示（練習）':'無提示（挑戰）'; }
  try{
    document.body.classList.remove('tg-kbd-open'); // สลับโหมดทีไร รีเซ็ตกลับ default เสมอ
    // Lin 2026-07-19: ปุ่มคีย์บอร์ดบนจอเป็นปุ่มอิสระ ไม่ผูกกับโหมด 有/無提示 อีกต่อไป — โชว์ตลอด กดเปิด/ปิดเองได้ทุกโหมด · แค่รีเซ็ตสถานะปุ่มตอนสลับโหมด
    var wkb=document.getElementById('rg-webkbd-toggle');
    if(wkb){ wkb.textContent='⌨️'; wkb.className='word-ctl-btn'; wkb.removeAttribute('data-playing'); wkb.title='開啟螢幕鍵盤'; }
  }catch(e){}
  ['tg-guide-note'].forEach(function(id){
    var note=document.getElementById(id);
    if(!note)return;
    if(guideMode){ note.innerHTML='💡 <b>練習模式</b>・純練習不計分，也不更新複習進度'; note.style.background='#fff3d8'; note.style.color='#9a6a10'; }
    else { note.innerHTML='🔥 <b>計分模式</b>・答對得分並更新複習進度'; note.style.background='#e8f5e9'; note.style.color='#2e7d32'; }
  });
  try{rgTypeHighlightNextKey();}catch(e){}
}
setGuideMode(guideMode); // ตั้งสถานะปุ่มตามค่าที่จำไว้ ตั้งแต่โหลดหน้า

// Phase 1.2: เปิด/ปิด提示ได้ระหว่างคำเดิมโดยไม่เริ่มคำหรือรอบใหม่
// rgTypeHighlightNextKey() จะล็อก wordUsedGuide ทันทีเมื่อแสดง提示จริง และ loadWord() คงสถานะล่าสุดเป็นค่าเริ่มต้นของคำถัดไป
function tgChooseGuideMode(on){
  setGuideMode(!!on);
  try{tgUpdateScoreBar();}catch(e){}
  return true;
}

// 無提示(挑戰)模式用: ผู้เล่นกดเองเพื่อเปิด/ปิดคีย์บอร์ดในเกม (ปกติซ่อนไว้ ให้พิมพ์ด้วยคีย์บอร์ดจริงล้วนๆ) — Lin 2026-07-12
function rgToggleWebKbd(){
  var open=document.body.classList.toggle('tg-kbd-open');
  try{ if(typeof gtag==='function') gtag('event', open?'typing_game_keyboard_open':'typing_game_keyboard_close', {category:'game'}); }catch(e){}
  var b=document.getElementById('rg-webkbd-toggle');
  // Lin 2026-07-19: เหลือแค่ไอคอน ⌨️ ไม่มีตัวหนังสือ — โชว์สถานะเปิด/ปิดด้วยสีปุ่มแบบเดียวกับปุ่มไข่/ข้าวปั้น (data-playing)
  if(b){ if(open){b.setAttribute('data-playing','1');}else{b.removeAttribute('data-playing');} b.title=open?'關閉螢幕鍵盤':'開啟螢幕鍵盤'; }
}
// Lin 2026-07-12: คีย์บอร์ดเครื่องขึ้น (โฟกัสช่อง input จริง) → ซ่อนหัวเว็บไม่ให้กินพื้นที่ · ปิดคีย์บอร์ด (blur) → คืนกลับ
(function(){
  try{
    var mi=document.getElementById('rg-mobile-input');
    if(!mi)return;
    mi.addEventListener('focus',function(){
      if(tgLandscapeUsesGameKeyboardOnly()){ mi.blur(); return; }
      RG_MOBILE_KBD_USED=true;
      document.body.classList.add('tg-kbd-typing');
    });
    mi.addEventListener('blur', function(){ document.body.classList.remove('tg-kbd-typing'); });
    document.addEventListener('gsh:mobile-landscape-change',function(){
      tgSyncLandscapeKeyboardPolicy();
      rgBuildKeyboard();
      try{rgTypeHighlightNextKey();}catch(e){}
    });
    tgSyncLandscapeKeyboardPolicy();
  }catch(e){}
})();
// Lin 2026-07-16: กันปุ่มบนจอ "แย่งโฟกัส" จากช่องพิมพ์มือถือ — เดิมแตะปุ่มคีย์บอร์ดในเกม/ปุ่มวรรณยุกต์/ปุ่มข้าม แล้วโฟกัสย้ายไปที่ปุ่ม (div tabindex=0 / button โฟกัสได้)
// → ช่อง input เสียโฟกัส → คีย์บอร์ดเครื่องหุบทันที และบน iOS การ focus() คืนอัตโนมัติ (นอกจังหวะแตะของผู้ใช้) มักถูกบล็อก คีย์บอร์ดเลยไม่กลับมาเอง
// วิธีแก้มาตรฐาน: preventDefault ที่ mousedown (คลิก/แตะยังทำงานปกติ แต่โฟกัสไม่ย้าย คีย์บอร์ดไม่หุบ) — อ้างอิง: MDN mousedown default action = focus
function rgNoFocusSteal(el){ if(el)el.addEventListener('mousedown',function(e){e.preventDefault();}); }
function rgBuildKeyboard(){
  var box=document.getElementById('rg-kbd');
  if(!box||!window.GSHThaiKeyboard)return;
  window.GSHThaiKeyboard.render({
    root:box,
    split:tgLandscapeUsesGameKeyboardOnly(),
    shifted:RG_TYPE.shiftOn,
    shiftId:'rg-shift-key',
    onCode:rgVirtualPress,
    onShift:function(){RG_TYPE.shiftOn=!RG_TYPE.shiftOn;rgBuildKeyboard();try{rgTypeHighlightNextKey();}catch(e){}},
    onBackspace:rgTypeBackspace
  });
}
function rgVirtualPress(code){
  var ch=RG_TYPE.shiftOn?(RG_SHIFT_MAP[code]||''):(RG_BASE_MAP[code]||'');
  // Shift จอปล่อยเองหลังพิมพ์ 1 ตัว (เหมือนคีย์บอร์ดมือถือ) — กัน Shift ค้างแล้วตัวถัดไปพิมพ์ผิด — Lin 2026-07-02
  if(RG_TYPE.shiftOn){
    RG_TYPE.shiftOn=false;
    var sk=document.getElementById('rg-shift-key');
    if(sk)sk.classList.remove('active');
  }
  if(ch)rgTypeChar(ch);
}

// Lin 2026-07-25: ลบตัวแปร btn (#rg-type-toggle) ออก — ปุ่มสลับโหมดพิมพ์ตัวนั้นไม่มีในหน้าแล้ว
function rgApplyTypeModeUI(){
  var panel=document.getElementById('type-panel');
  var slotRow=document.getElementById('slot-row');
  var optsWrap=document.querySelector('.opts-wrap');
  var chBtn=document.getElementById('btn-check');
  if(RG_TYPE.on){
    if(panel)panel.style.display='flex';
    if(slotRow)slotRow.style.display='none';
    if(optsWrap)optsWrap.style.display='none';
    if(chBtn && !checked)chBtn.style.display='none';
  } else {
    if(panel)panel.style.display='none';
    if(slotRow)slotRow.style.display='';
    if(optsWrap)optsWrap.style.display='';
    if(chBtn && !checked)chBtn.style.display='';
  }
}
// Lin 2026-07-12: คำ/พยางค์จบแล้ว (checked=true) → ซ่อนทั้ง #type-panel (กล่องเป้าหมาย+คำใบ้+ปุ่มไกด์+คีย์บอร์ด) ไปเลย
// บั๊กเดิม: ปล่อยให้ค้างโชว์ทั้งที่ไม่เกี่ยวแล้ว ทำให้ดูเหมือนหน้าว่างยาว/บังกล่องอธิบายด้านล่างจนนึกว่าไม่มีคำอธิบาย
// จะโชว์กลับมาอัตโนมัติตอนขึ้นคำ/พยางค์ถัดไป (ดู loadSyl wrapper ด้านล่าง)
function rgHideTypePanelForReveal(){
  tgCloseMobileKeyboard();
  var panel=document.getElementById('type-panel');
  if(panel)panel.style.display='none';
}
function rgTypeRenderTarget(){
  var el=document.getElementById('rg-type-target');
  if(!el)return;
  var t=RG_TYPE.target;
  var done=t.slice(0,RG_TYPE.pos),rest=t.slice(RG_TYPE.pos);
  el.innerHTML='<span class="rg-typed-ok">'+done+'</span><span class="rg-typed-rest">'+rest+'</span>';
}
function rgTypeHighlightNextKey(){
  var box=document.getElementById('rg-kbd');
  if(!box)return;
  box.querySelectorAll('.tk-key.hint').forEach(function(k){k.classList.remove('hint');});
  var expected=RG_TYPE.target.charAt(RG_TYPE.pos);
  var shiftKey=document.getElementById('rg-shift-key');
  if(!guideMode || curWordIsKnownCheck){ if(shiftKey)shiftKey.classList.remove('need'); return; } // โหมดไม่มีไกด์ไลน์ · ด่านพิสูจน์已記得ห้ามมีคำใบ้เด็ดขาด
  if(!expected){ if(shiftKey)shiftKey.classList.remove('need'); return; }
  var info=RG_REVERSE[expected];
  if(!info){ if(shiftKey)shiftKey.classList.remove('need'); return; }
  var keyEl=box.querySelector('.tk-key[data-code="'+info.code+'"]');
  if(keyEl)keyEl.classList.add('hint');
  if(shiftKey)shiftKey.classList.toggle('need',!!info.shift);
  // กฎ MASTER (อุดรูรั่ว): "เห็นคำใบ้ = คำนี้ไม่ได้แต้ม" — ล็อกทันทีที่ไฮไลต์คีย์ถัดไป (ไม่ใช่รอพิมพ์ครบ)
  wordUsedGuide=true;
}
function rgTypeFlashWrong(){
  var el=document.getElementById('rg-type-target');
  if(!el)return;
  el.classList.add('shake');
  setTimeout(function(){el.classList.remove('shake');},400);
}
function rgTypeLoadSyl(){
  var SY=(typeof sylList!=='undefined' && sylList[sylIdx])?sylList[sylIdx]:null;
  RG_TYPE.target=SY?SY.th:'';
  RG_TYPE.pos=0;RG_TYPE.wrong=0;
  try{rgMobileInputReset();}catch(e){} // ขึ้นพยางค์ใหม่ = จุดจบธรรมชาติ เคลียร์ช่องพิมพ์มือถือให้ตรงกับ pos=0 — Lin 2026-07-13
  rgTypeRenderTarget();
  rgTypeHighlightNextKey();
  var chBtn=document.getElementById('btn-check');
  if(chBtn)chBtn.style.display='none'; // โหมดพิมพ์ตรวจให้อัตโนมัติทีละตัว ไม่ต้องกด 檢查
  var hintEl=document.getElementById('rg-type-hint');
  if(hintEl){hintEl.textContent='照著打出上面這個音節，鍵盤已經照泰文鍵盤排好位置了，打對會自動跳下一步 👇';hintEl.className='type-hint';}
}
// สาขา "ถูกทั้งพยางค์" — ทำตามรูปแบบเดียวกับ check() ฝั่งกดเลือก (ใช้ finalizeWord/คะแนน/badge ชุดเดียวกัน)
function rgTypeSuccessBranch(){
  checked=true;
  evaluateBonus();showReveal();renderSylStrip();
  document.getElementById('retry-hint').className='retry-hint';
  setGameBtns('done');
  var lastSyl=(sylIdx>=sylList.length-1);
  if(lastSyl){
    rgHideTypePanelForReveal(); // Lin 2026-07-12: คำจบแล้ว ซ่อนแป้นพิมพ์+คำใบ้ที่ค้างอยู่ ไม่งั้นบังกล่องอธิบายด้านล่าง/เหลือช่องว่างยาว
    finalizeWord();
    document.getElementById('btn-next').textContent='下一題 →';
  } else {
    tgCloseMobileKeyboard();
    var b=document.getElementById('banner');
    b.textContent='✓';b.className='gsh-feedback-slot result-banner show ok'; // LIN 2026-07-03: ย่อข้อความ+ลดเวลาหน่วง ให้พิมพ์ยาวๆ ต่อเนื่องมากขึ้น ไม่รู้สึกเหมือนถูกตัดแบ่งพยางค์
    document.getElementById('btn-next').textContent='下一個音節 →';
    if(RG_TYPE.on){ setTimeout(function(){ next(); }, 220); } // โหมดพิมพ์: พิมพ์ต่อเนื่องทุกพยางค์ ไม่ต้องกดปุ่ม
  }
  document.getElementById('ok').textContent=okC;document.getElementById('bad').textContent=badC;
  updateCombo();refreshUI();
}
// Legacy branch kept for compatibility with old resume states. Phase 1 typing input no longer calls it:
// คะแนน 0 ต้องพิมพ์ต่อจนถูก ห้ามเฉลย/จบคำอัตโนมัติ
function rgTypeFailBranch(){
  wordFailed=true;checked=true;
  evaluateBonus();showReveal();renderSylStrip();
  document.getElementById('retry-hint').className='retry-hint';
  setGameBtns('done');
  var lastSyl=(sylIdx>=sylList.length-1);
  if(lastSyl){
    rgHideTypePanelForReveal(); // Lin 2026-07-12: เหมือนกัน — คำจบแล้ว ซ่อนแป้นพิมพ์+คำใบ้ที่ค้างอยู่
    finalizeWord();
    document.getElementById('btn-next').textContent='下一題 →';
  } else {
    tgCloseMobileKeyboard();
    var b=document.getElementById('banner');
    b.textContent='這個音節再看一下 — 接著打下一個音節';b.className='gsh-feedback-slot result-banner show no';
    document.getElementById('btn-next').textContent='下一個音節 →';
    if(RG_TYPE.on){ setTimeout(function(){ next(); }, 900); }
  }
  document.getElementById('ok').textContent=okC;document.getElementById('bad').textContent=badC;
  updateCombo();refreshUI();
}
// พิมพ์ครบพยางค์แล้ว → ปิดจบพยางค์นี้เลย (Lin 2026-07-30: เอา猜聲調ออก ไม่มีการหยุดถามวรรณยุกต์อีกแล้ว)
function rgTypeOnFullyTyped(){
  rgTypeSuccessBranch();
}
function rgTypeChar(ch){
  if(RG_CONT_ON)return rgContChar(ch); // คำหลายพยางค์ (初/中) → พิมพ์ต่อเนื่องทั้งคำ แยก path (ดูบล็อกก่อน document.addEventListener('keydown'...))
  if(!RG_TYPE.on || checked)return;
  if(RG_TYPE.pos>=RG_TYPE.target.length)return; // พิมพ์ครบแล้ว รอเลือกวรรณยุกต์อยู่ ไม่รับตัวอักษรเพิ่ม
  var expected=RG_TYPE.target.charAt(RG_TYPE.pos);
  if(!expected)return;
  if(ch===expected){
    RG_TYPE.pos++;
    rgTypeRenderTarget();
    if(RG_TYPE.pos>=RG_TYPE.target.length){
      // Lin 2026-07-13: พิมพ์ครบพยางค์แล้ว ต้องเคลียร์ตัวใบ้ที่ค้างอยู่บนคีย์บอร์ดด้วย ไม่งั้นปุ่มล่าสุดยังสว่างค้าง ทำให้ไม่รู้ว่ากดไปแล้ว
      var kbdBox=document.getElementById('rg-kbd');
      if(kbdBox)kbdBox.querySelectorAll('.tk-key.hint').forEach(function(k){k.classList.remove('hint');});
      var shiftKeyDone=document.getElementById('rg-shift-key');
      if(shiftKeyDone)shiftKeyDone.classList.remove('need');
      rgTypeOnFullyTyped();
    } else {
      rgTypeHighlightNextKey();
    }
  } else {
    RG_TYPE.wrong++;if(!(sylList[sylIdx]&&sylList[sylIdx].isParticle))wordWrongTotal++;wordHadWrong=true;streak=0;badC++; // Lin 2026-08-01: พิมพ์ผิดพยางค์ครับ/ค่ะ/คะ ไม่นับเข้าคะแนน
    tgUpdateScoreBar(); // Lin 2026-07-06: หลอด 本題分數 ลดสด+ไล่สีตอนพิมพ์ผิด
    document.getElementById('ok').textContent=okC;document.getElementById('bad').textContent=badC;
    updateCombo();
    rgTypeFlashWrong();
    if(RG_TYPE.wrong>=rgQuotaFor(sylList.length)){
      var hint=document.getElementById('retry-hint');
      var _msg2627='本題分數已是 0，還是要繼續打到正確為止 💪';
      hint.textContent=_msg2627;
      hint.className='retry-hint show wrong3';
      rgToast(_msg2627);
      rgTypeHighlightNextKey();
    } else {
      var hint2=document.getElementById('retry-hint');
      var _msg2636=RG_TYPE.wrong===1?'打錯了，沒關係，再試一次 🙂':'再試一次，分數會降低，但要繼續打到正確為止 😊';
      hint2.textContent=_msg2636;
      hint2.className='retry-hint show';
      rgToast(_msg2636); // 改成 pop up，自動消失，不用手動關 — Lin 2026-07-07
    }
  }
}
// (rgHookBonusOpts / rgSkipTone ถูกลบแล้ว — เอา猜聲調ออก 2026-07-30 ไม่มีปุ่มทาย/ปุ่มข้ามวรรณยุกต์อีกแล้ว)
// กด Enter: ถ้าข้อนี้เช็คจบแล้ว (ปุ่ม下一字/下一個音節โผล่อยู่) → ไปข้อต่อไปเลย
function rgHandleEnterKey(e){
  var nextBtn=document.getElementById('btn-next');
  if(nextBtn && nextBtn.style.display!=='none' && nextBtn.offsetParent!==null){
    nextBtn.click();
    if(e&&e.preventDefault)e.preventDefault();
    return true;
  }
  return false;
}
function rgTypeBackspace(){
  if(RG_CONT_ON)return rgContBackspace();
  if(!RG_TYPE.on || checked || RG_TYPE.pos<=0)return;
  RG_TYPE.pos--;rgTypeRenderTarget();rgTypeHighlightNextKey();
}

// ════════════════════════════════════════════
// โหมดพิมพ์ต่อเนื่องทั้งคำ (sylList.length>1, 初/中 เท่านั้น) — Lin 2026-07-03 v2
// target = คำเต็มทุกพยางค์ต่อกัน พิมพ์รวดเดียวจน "จบทั้งคำ" จริงๆ ไม่คั่นระหว่างพยางค์เลยแม้แต่ครั้งเดียว (ไม่มี banner/ไม่มีถามวรรณยุกต์กลางคัน)
// วรรณยุกต์: เก็บคิวไว้ระหว่างพิมพ์ (พยางค์ไหนมี tone_name และไม่ได้ถูกเฉลยเพราะพิมพ์ผิดครบ) แล้วมาถาม "ทีเดียวรวด" ทีละพยางค์ หลังพิมพ์ครบทั้งคำแล้วเท่านั้น
// ผิดครบ 3 ครั้งในพยางค์ไหน = เฉลยเฉพาะพยางค์นั้น (หน่วง 900ms) แล้วพิมพ์ต่อพยางค์ถัดไปทันที — พยางค์นั้นจะไม่ถูกถามวรรณยุกต์ตอนท้าย
// finalizeWord() ถูกเรียกครั้งเดียวตอนจบคำ (ใน rgContFinish) เหมือนเดิมทุกประการ ไม่กระทบ masteredSet/correctCountMap/หลอดคะแนน
// ════════════════════════════════════════════
function rgContStart(){
  RG_CONT_ON=true;RG_CONT_TOKEN++;
  RG_CONT_SEG=0;RG_CONT_WRONG=0; // RG_CONT_WRONG นับสะสม "ทั้งคำ" ตั้งแต่ตรงนี้ ไม่รีเซ็ตข้ามพยางค์แล้ว (Lin 2026-07-03 v3)
  RG_CONT_BOUNDS=[];
  var acc=0;
  sylList.forEach(function(s){acc+=s.th.length;RG_CONT_BOUNDS.push(acc);});
  RG_TYPE.target=sylList.map(function(s){return s.th;}).join('');
  RG_TYPE.pos=0;RG_TYPE.wrong=0;
  try{rgMobileInputReset();}catch(e){} // ขึ้นคำใหม่ = จุดจบธรรมชาติ เคลียร์ช่องพิมพ์มือถือให้ตรงกับ pos=0 — Lin 2026-07-13
  rgTypeRenderTarget();
  rgTypeHighlightNextKey();
  var chBtn=document.getElementById('btn-check');
  if(chBtn)chBtn.style.display='none';
  var hintEl=document.getElementById('rg-type-hint');
  if(hintEl){hintEl.textContent='照著打出整個字（連續打完 '+sylList.length+' 個音節），鍵盤已經照泰文鍵盤排好位置了，打對會自動跳下一步 👇';hintEl.className='type-hint';}
  // ซ่อนกล่องคำอธิบายเฉลยไว้ก่อน รอพิมพ์ครบทั้งคำค่อยโชว์ (showRevealMulti)
  var sec=document.getElementById('bonus-section');
  if(sec)sec.className='bonus-section';
  var reasonEl=document.getElementById('bonus-reason');
  if(reasonEl){reasonEl.className='bonus-reason';reasonEl.innerHTML='';} // Phase D2: ล้างเนื้อหาเก่าจริง
  tgResetDetailBox(); // Phase D2: คำใหม่ (ต่อเนื่องหลายพยางค์) = ปิดกล่องเฉลย+ซ่อนปุ่มเสมอ
}
function rgContChar(ch){
  if(!RG_TYPE.on || !RG_CONT_ON || checked)return;
  if(RG_TYPE.pos>=RG_TYPE.target.length)return;
  var expected=RG_TYPE.target.charAt(RG_TYPE.pos);
  if(!expected)return;
  if(ch===expected){
    RG_TYPE.pos++;
    rgTypeRenderTarget();
    if(RG_CONT_SEG<RG_CONT_BOUNDS.length && RG_TYPE.pos>=RG_CONT_BOUNDS[RG_CONT_SEG]){
      document.getElementById('retry-hint').className='retry-hint';
      rgContAdvanceSegment(RG_CONT_SEG>=sylList.length-1); // ข้ามไปพยางค์ถัดไปทันที (พยางค์สุดท้าย = จบคำเลย)
    } else {
      rgTypeHighlightNextKey();
    }
  } else {
    // นับผิดรวมทั้งคำ (ไม่แยกนับทีละพยางค์แล้ว) — Phase 1: คะแนนถึง 0 แล้วยังต้องพิมพ์ต่อจนถูก
    RG_CONT_WRONG++;if(!(sylList[RG_CONT_SEG]&&sylList[RG_CONT_SEG].isParticle))wordWrongTotal++;wordHadWrong=true;streak=0;badC++; // Lin 2026-08-01: พิมพ์ผิดพยางค์ครับ/ค่ะ/คะ ไม่นับเข้าคะแนน
    tgUpdateScoreBar(); // Lin 2026-07-06: หลอด 本題分數 ลดสด+ไล่สีตอนพิมพ์ผิด
    document.getElementById('ok').textContent=okC;document.getElementById('bad').textContent=badC;
    updateCombo();
    rgTypeFlashWrong();
    if(RG_CONT_WRONG>=rgQuotaFor(sylList.length)){
      var hint=document.getElementById('retry-hint');
      hint.textContent='本題分數已是 0，還是要繼續打到正確為止 💪';
      hint.className='retry-hint show wrong3';
      rgToast('本題分數已是 0，還是要繼續打到正確為止 💪');
      rgTypeHighlightNextKey();
    } else {
      var hint2=document.getElementById('retry-hint');
      var _msg2761=RG_CONT_WRONG===1?'打錯了，沒關係，再試一次 🙂':'再試一次，分數會降低，但要繼續打到正確為止 😊';
      hint2.textContent=_msg2761;
      hint2.className='retry-hint show';
      rgToast(_msg2761); // 改成 pop up，自動消失，不用手動關 — Lin 2026-07-07
    }
  }
}
function rgContAdvanceSegment(isLast){
  if(isLast){
    // Lin 2026-07-13: พิมพ์ครบทั้งคำแล้ว ต้องเคลียร์ตัวใบ้ที่ค้างอยู่บนคีย์บอร์ดด้วย ไม่งั้นปุ่มล่าสุดยังสว่างค้าง ทำให้ไม่รู้ว่ากดไปแล้ว
    var kbdBox=document.getElementById('rg-kbd');
    if(kbdBox)kbdBox.querySelectorAll('.tk-key.hint').forEach(function(k){k.classList.remove('hint');});
    var shiftKeyDone=document.getElementById('rg-shift-key');
    if(shiftKeyDone)shiftKeyDone.classList.remove('need');
    rgContFinish(); // Lin 2026-07-30: เอา猜聲調ออกแล้ว — พิมพ์ครบทั้งคำ = จบคำเลย ไม่ถามวรรณยุกต์ต่อท้าย
    return;
  }
  RG_CONT_SEG++; // RG_CONT_WRONG ไม่รีเซ็ตแล้ว — นับสะสมทั้งคำตั้งแต่ rgContStart()
  sylIdx=RG_CONT_SEG; // แค่ให้แถบ syl-strip ไล่ตามพยางค์ที่พิมพ์อยู่ (cosmetic เท่านั้น ไม่กระทบ finalize/คะแนน)
  renderSylStrip();
  rgTypeHighlightNextKey(); // ไม่มี banner/หน่วง — พิมพ์พยางค์ถัดไปต่อได้ทันที
}
// (rgContStartToneQuizzes / rgContAskNextTone / rgContSkipTone ถูกลบแล้ว — เอา猜聲調ออก 2026-07-30)
// คำพิมพ์ครบทุกพยางค์แล้ว → ปิดจบเหมือน rgTypeSuccessBranch/rgTypeFailBranch ตอน lastSyl ทุกประการ
// (ตั้ง W ให้ตรงพยางค์สุดท้ายก่อน เพราะ loadSyl() ถูกเรียกแค่ครั้งเดียวตอน sylIdx=0 — showReveal()/buildRevealRules ต้องใช้ W ของพยางค์ที่เพิ่งพิมพ์จบจริง)
function rgContFinish(){
  checked=true;
  RG_CONT_ON=false;
  sylIdx=sylList.length-1;
  var SY=sylList[sylIdx];
  W={th:SY.th,read:SY.read,zh:WORD.zh,en:SY.en||WORD.en,cons:SY.cons,vowel:SY.vowel,tone:SY.tone,final:SY.final,lead:SY.lead,cluster:SY.cluster,tone_name:SY.tone_name,consRead:SY.consRead,finalRead:SY.finalRead,finalDisp:SY.finalDisp,silent:SY.silent}; // 2026-07-30: พ่วงฟิลด์เฉลยเสียง
  var sec=document.getElementById('bonus-section');
  if(sec)sec.className='bonus-section'; // ซ่อนแผงถามวรรณยุกต์ ก่อนโชว์การ์ดเฉลยท้ายคำ
  rgHideTypePanelForReveal(); // Lin 2026-07-12: คำจบแล้ว ซ่อนแป้นพิมพ์+คำใบ้ที่ค้างอยู่ (บั๊กเดิม: หัวข้อ "選一下...的聲調" ค้างโชว์ทับกล่องอธิบายจนดูเหมือนไม่มีคำอธิบาย/หน้าว่างยาว)
  renderSylStrip();
  // ทั้งประโยค (หลายพยางค์/หลายคำ) → โชว์วิเคราะห์ทุกคำ + คำอ่านเต็มประโยค ไม่ใช่แค่คำสุดท้าย ไม่ว่าตอบถูกหรือผิด — Lin 2026-07-07
  showRevealMulti();
  document.getElementById('retry-hint').className='retry-hint';
  setGameBtns('done');
  finalizeWord();
  document.getElementById('btn-next').textContent='下一題 →';
  document.getElementById('ok').textContent=okC;document.getElementById('bad').textContent=badC;
  updateCombo();refreshUI();
}
function rgContBackspace(){
  if(checked)return;
  var segStart=RG_CONT_SEG===0?0:RG_CONT_BOUNDS[RG_CONT_SEG-1];
  if(RG_TYPE.pos<=segStart)return;
  RG_TYPE.pos--;rgTypeRenderTarget();rgTypeHighlightNextKey();
}

// (rgToneKeyNum + คีย์ลัดกดเลข 1-5 เลือกวรรณยุกต์ ถูกลบแล้ว — เอา猜聲調ออก 2026-07-30)
document.addEventListener('keydown',function(e){
  if(!RG_TYPE.on)return;
  var gameEl=document.getElementById('game');
  if(!gameEl || gameEl.style.display==='none')return;
  var ae=document.activeElement;
  if(ae && /^(INPUT|TEXTAREA)$/.test(ae.tagName))return;
  // โมดัลเปิดอยู่ (怎麼玩 / 我有問題 / 成就) → อย่าให้พิมพ์ทะลุไปโดนเกม — Lin 2026-07-02
  var _hm=document.getElementById('rg-howto-modal');
  if(_hm && _hm.style.display==='flex')return;
  if(document.getElementById('rg-ask-ov'))return;
  var _bm=document.getElementById('badge-modal');
  if(_bm && _bm.classList.contains('show'))return;
  var _sm=document.getElementById('star-modal');
  if(_sm && _sm.classList.contains('show'))return;
  if(e.key==='Backspace'){ rgTypeBackspace(); e.preventDefault(); return; }
  if(e.key==='Enter'){ rgHandleEnterKey(e); return; }
  // Space: ไม่มีคำไหนมีช่องว่าง → กันหน้าเลื่อนเฉยๆ ไม่นับผิด — Lin 2026-07-02
  if(e.code==='Space'){ e.preventDefault(); return; }
  var map=e.shiftKey?RG_SHIFT_MAP:RG_BASE_MAP;
  var ch=map[e.code];
  if(ch){ rgTypeChar(ch); e.preventDefault(); }
});
// ผูก loadSyl() เดิม — ทุกครั้งที่ขึ้นพยางค์ใหม่ ถ้าเปิดโหมดพิมพ์อยู่ ให้ตั้งเป้าหมาย/keyboard ใหม่ด้วย
(function(){
  var _origLoadSyl=loadSyl;
  loadSyl=function(){
    _origLoadSyl();
    if(!RG_TYPE.on)return;
    // Lin 2026-07-12: ขึ้นคำ/พยางค์ใหม่ → เอา #type-panel กลับมาโชว์เสมอ (เผื่อถูกซ่อนไว้ตอนคำก่อนหน้าจบ — ดู rgHideTypePanelForReveal)
    var _tp=document.getElementById('type-panel');
    if(_tp)_tp.style.display='flex';
    // คำ/ประโยคหลายพยางค์ (2 พยางค์ขึ้นไป ทุกระดับ รวม 高) → เข้าโหมดพิมพ์ต่อเนื่องทั้งคำ ที่ sylIdx===0 ครั้งเดียว
    // ขยายจาก "≥3 พยางค์" เป็น "≥2 พยางค์" ตามที่ Lin ขอ 2026-07-03 (หลังทดสอบคำ 2 พยางค์แล้วอยากให้พิมพ์ต่อเนื่องด้วย)
    // เดิม 高級 ถูกกันไว้ไม่ให้พิมพ์ต่อเนื่อง (ต้องกดสลับพยางค์เอง) — Lin แจ้ง 2026-07-07 ว่า 高級 ก็ต้องพิมพ์ต่อเนื่องได้เหมือน 中級ทุกประการ จึงเอาเงื่อนไขกัน 高級 ออก
    // คำพยางค์เดียว (初級ทั้งหมด): ลง else เหมือนเดิมทุกครั้ง (RG_CONT_ON=false ไม่เคยถูกอ่านที่ไหนสำหรับคำเหล่านี้) = พฤติกรรมเดิม 100%
    if(sylIdx===0 && sylList.length>1){
      rgContStart();
    } else {
      RG_CONT_ON=false;
      rgTypeLoadSyl();
    }
    // Lin 2026-07-13: เคยเจอว่าพอตอบ/ข้ามคำถามวรรณยุกต์เสร็จ (rgContAskNextTone เคย blur ช่องพิมพ์มือถือทิ้งไว้)
    // ขึ้นคำ/พยางค์ใหม่แล้วคีย์บอร์ดเครื่องไม่เด้งกลับมาเอง ต้องแตะกล่องคำเองใหม่ทุกครั้ง ดูเหมือน "พิมพ์ไม่ได้"
    // แก้: ถ้าเคยใช้คีย์บอร์ดมือถือมาก่อน (RG_MOBILE_KBD_USED) + เป็นจอสัมผัส → ดึงโฟกัสกลับให้อัตโนมัติ (Lin 2026-07-16: โหมดมีคำใบ้ก็ใช้คีย์บอร์ดเครื่องได้แล้ว เลยเอาเงื่อนไขกัน guideMode ออก)
    try{
      if(RG_MOBILE_KBD_USED && rgIsTouchDevice() && !tgLandscapeUsesGameKeyboardOnly()){
        var _mi=document.getElementById('rg-mobile-input');
        if(_mi)_mi.focus();
      }
    }catch(e){}
  };
})();
// ช่องพิมพ์จริงสำหรับคีย์บอร์ดมือถือของผู้ใช้เอง (Gboard/คีย์บอร์ด iOS ไทย ฯลฯ)
// เดิมเกมนี้ดักเฉพาะ document keydown (e.code) → ใช้ได้แค่คีย์บอร์ดจริง/เสมือนบนจอเท่านั้น
// คีย์บอร์ดมือถือจริงไม่ส่ง e.code แบบนั้น ต้องอ่านจาก input event แทน — Lin 2026-07-06
//
// แก้ 2026-07-13 — บั๊ก "พิมพ์ไม้เอก/ไม้โท/ไม้ตรี/ไม้จัตวา ไม่ติด" บน iOS จริง (ยืนยันจากวีดีโอ Lin ส่งมา):
// สาเหตุ: โค้ดเดิมสั่ง mi.value='' "ทันที" (synchronous) ทุกครั้งที่มี input event เพื่อเตรียมรับตัวถัดไป
// แต่เครื่องหมายวรรณยุกต์เป็น combining mark ที่ iOS ต้องใช้เวลาประมวลผล/ต่อเข้ากับตัวหน้าเล็กน้อย
// พอโดนล้างช่องแทรกกลางคัน (ระหว่าง WebKit ยังไม่เคลียร์ state ภายในของ input event ให้เสร็จ) เครื่องหมายเลยหลุดหาย
// อ้างอิง: MDN InputEvent.isComposing/inputType · Apple Developer Forums thread 698078 (set .value ใน input handler ทำ Safari state เพี้ยน)
// วิธีแก้ (ไม่ต้องปิดคีย์บอร์ดเครื่องจริงเหมือนโหมดมีคำใบ้ — ยังพิมพ์ด้วยคีย์บอร์ดเครื่องได้ปกติ):
//  1) ห้ามประมวลผล/ห้ามแตะช่องเลยระหว่างกำลัง compose (compositionstart→compositionend) — รอให้ compose เสร็จก่อน
//  2) ไม่ล้างช่องทันทีทุกคีย์ — ใช้วิธี "จำค่าล่าสุดที่เคยอ่านไปแล้ว (lastVal) แล้ว diff เอาเฉพาะตัวใหม่ที่เพิ่มมา" แทน ปล่อยให้ช่องพิมพ์สะสมค่าไปได้ตามธรรมชาติระหว่างพิมพ์ทั้งพยางค์
//  3) ค่อยล้างช่องจริง (mi.value='') ที่ "จุดจบธรรมชาติ" เท่านั้น (ขึ้นพยางค์/คำใหม่, กด Backspace, กด Enter) ไม่ใช่ระหว่างพิมพ์
//  4) เพิ่ม fallback ฝั่ง Android: บาง IME ไม่ยิง keydown Backspace จริงตอนกดปุ่มลบบนคีย์บอร์ดจอ (ส่งมาเป็น input event inputType:'deleteContentBackward' แทน) เดิมโค้ดไม่ดักไว้เลย ปุ่มลบเลยไม่ทำงานบน Android บางรุ่น
var RG_MI_LASTVAL=''; // ค่าล่าสุดที่ประมวลผลไปแล้วในช่องพิมพ์มือถือ (ใช้ diff)
function tgCloseMobileKeyboard(){
  try{
    var mi=document.getElementById('rg-mobile-input');
    if(mi&&document.activeElement===mi)mi.blur();
    document.body.classList.remove('tg-kbd-typing');
  }catch(e){}
}
function tgInitKeyboardDismissControls(){
  document.addEventListener('click',function(event){
    var target=event.target&&event.target.closest?event.target.closest('#wm-trigger, #rg-howto-btn'):null;
    if(target)tgCloseMobileKeyboard();
  },true);
}
tgInitKeyboardDismissControls();
function rgMobileInputReset(){ // เรียกตอน "จุดจบธรรมชาติ" เท่านั้น (ขึ้นคำ/พยางค์ใหม่ ฯลฯ) — ห้ามเรียกกลางคันตอนกำลังพิมพ์
  RG_MI_LASTVAL='';
  try{ var mi0=document.getElementById('rg-mobile-input'); if(mi0)mi0.value=''; }catch(e){}
}
(function(){
  var mi=document.getElementById('rg-mobile-input');
  if(!mi)return;
  var composing=false; // กำลังอยู่ระหว่าง IME compose (เช่น กำลังต่อวรรณยุกต์เข้ากับตัวหน้า) — ห้ามแตะ/อ่านช่องตอนนี้เด็ดขาด
  mi.addEventListener('compositionstart',function(){ composing=true; });
  mi.addEventListener('compositionend',function(){ composing=false; rgMobileProcessInput(); });
  mi.addEventListener('keydown',function(e){
    if(e.key==='Backspace'){ rgTypeBackspace(); e.preventDefault(); rgMobileInputReset(); return; }
    if(e.key==='Enter'){ rgHandleEnterKey(e); rgMobileInputReset(); }
  });
  function rgMobileProcessInput(){
    if(composing)return; // รอ compositionend ก่อน ห้ามอ่านค่ากลางคันที่ยัง compose ไม่เสร็จ
    var val=mi.value;
    if(!val){ RG_MI_LASTVAL=''; return; } // ช่องว่าง (เช่นโดน backspace/keydown เคลียร์ไปแล้ว) ไม่มีอะไรต้องทำต่อ
    // ค่าใหม่ต่อจากค่าเดิมปกติ → เอาเฉพาะส่วนที่เพิ่มมาไปประมวลผล ไม่วนอ่านซ้ำตัวที่ทำไปแล้ว
    if(val.length>=RG_MI_LASTVAL.length && val.indexOf(RG_MI_LASTVAL)===0){
      var added=val.slice(RG_MI_LASTVAL.length);
      for(var i=0;i<added.length;i++){ rgTypeChar(added.charAt(i)); }
    }
    // Lin 2026-07-16 (audit รอบ 2): ถ้าค่าใหม่ "ไม่ใช่การพิมพ์ต่อท้ายปกติ" (เช่น แตะแถบคำแนะนำของ Gboard/iOS แล้ว IME เขียนทับทั้งช่อง หรือช่องสั้นลงเอง)
    // เดิมโค้ด replay ทั้งช่องเข้า rgTypeChar ใหม่หมด → โดนนับผิดรัวๆ จนถูกบังคับเฉลยทั้งที่ไม่ได้พิมพ์ผิดจริง
    // ตอนนี้: sync ค่าจำไว้เฉยๆ ไม่ replay (ตัวที่พิมพ์ถูกไปแล้วอยู่ในเกมครบแล้ว ส่วนที่ IME เขียนทับไม่ใช่เจตนาพิมพ์ทีละตัว)
    RG_MI_LASTVAL=val; // จำไว้ว่าอ่านถึงตรงนี้แล้ว — ยังไม่ล้างช่องจริง ปล่อยให้สะสมต่อได้จนกว่าจะถึงจุดจบธรรมชาติ (ดู rgMobileInputReset)
  }
  mi.addEventListener('input',function(e){
    // ฝั่ง Android บาง IME: กดปุ่มลบบนคีย์บอร์ดจอ ไม่ยิง keydown Backspace จริง ส่งมาเป็น input event inputType นี้แทน
    if(e && e.inputType && /delete/i.test(e.inputType)){
      rgTypeBackspace();
      RG_MI_LASTVAL=mi.value; // sync ตามค่าที่ field เหลืออยู่จริงหลังลบ กันหลุด diff รอบถัดไป
      return;
    }
    if(e && e.isComposing)return; // บางเบราว์เซอร์ยังไม่ยิง compositionend ทัน ใช้ isComposing กันซ้ำอีกชั้น
    rgMobileProcessInput();
  });
})();
rgBuildKeyboard();
rgApplyTypeModeUI();
// (rgHookBonusOpts()/ตัวดักโฟกัสปุ่มวรรณยุกต์ ถูกลบแล้ว — เอา猜聲調ออก 2026-07-30)
try{
  rgNoFocusSteal(document.getElementById('rg-webkbd-toggle')); // Lin 2026-07-18: กดปุ่มเปิด/ปิดคีย์บอร์ดในเกม แล้วคีย์บอร์ดเครื่องต้องไม่หุบ
  // Lin 2026-07-25: ลบตัวดัก mousedown ของ #word-ctl-row ออก — ปุ่มทั้งแถวถูกย้ายเข้าเมนู 🍚 หมดแล้ว แถวนี้ว่างเปล่า
  // (word-menu.js ดัก mousedown ให้ทั้งปุ่ม 🍚 และแผงเมนูอยู่แล้ว คีย์บอร์ดยังไม่หุบเหมือนเดิม)
}catch(e){}

// ════════════════════════════════════════════
// เลือกพยางค์เองได้อิสระ (คำหลายพยางค์) — Lin 2026-07-02
// คลิกพยางค์ไหนในแถบ syl-strip ก็ได้ ทำสลับไปมาได้ กด 檢查 ทีเดียวตรวจทั้งคำ
// ════════════════════════════════════════════
var sylCache=[]; // เก็บ state ของแต่ละพยางค์ (index ตรงกับ sylList) — ให้กลับมาแก้ทีหลังได้ ไม่หายของเดิม

function rgCaptureSylState(){
  return {
    W:W, comps:comps.slice(),
    correctVal:{cons:correctVal.cons,vowel:correctVal.vowel,final:correctVal.final,tone:correctVal.tone},
    optTiles:optTiles.map(function(t){return {type:t.type,val:t.val,id:t.id};}),
    slotFills:{cons:slotFills.cons,vowel:slotFills.vowel,final:slotFills.final,tone:slotFills.tone},
    picks:picks.slice(), needN:needN, slotSeq:slotSeq.slice()
  };
}
function rgSylFilled(st){ return st.comps.every(function(c){return st.slotFills[c]!=null;}); }
function rgAllSylsFilled(){
  if(sylList.length<=1) return allSlotsFilled();
  for(var i=0;i<sylList.length;i++){
    if(i===sylIdx){ if(!allSlotsFilled())return false; }
    else{ var st=sylCache[i]; if(!st || !rgSylFilled(st))return false; }
  }
  return true;
}
// Lin 2026-07-30: เอา猜聲調ออกแล้ว — ตอนสลับพยางค์ (ยังไม่เฉลย) แค่ซ่อนกล่องคำอธิบายเฉลยไว้ก่อน
function rgRenderBonusForSyl(){
  var sec=document.getElementById('bonus-section');
  if(sec)sec.className='bonus-section';
  var reasonEl=document.getElementById('bonus-reason');
  if(reasonEl){reasonEl.className='bonus-reason';reasonEl.innerHTML='';} // Phase D2: ล้างเนื้อหาเก่าจริง
  tgResetDetailBox(); // Phase D2: สลับไปพยางค์ที่ยังไม่เฉลย = ปิดกล่องเฉลย+ซ่อนปุ่มเสมอ
}
function rgRestoreSylState(st){
  W=st.W; comps=st.comps.slice();
  correctVal={cons:st.correctVal.cons,vowel:st.correctVal.vowel,final:st.correctVal.final,tone:st.correctVal.tone};
  optTiles=st.optTiles.map(function(t){return {type:t.type,val:t.val,id:t.id};});
  slotFills={cons:st.slotFills.cons,vowel:st.slotFills.vowel,final:st.slotFills.final,tone:st.slotFills.tone};
  picks=st.picks.slice(); needN=st.needN; slotSeq=st.slotSeq.slice();
  ['cons','vowel','final','tone'].forEach(function(c){
    var col=document.getElementById('slotcol-'+c);
    col.style.display=comps.indexOf(c)>=0?'flex':'none';
  });
  var slotRow=document.getElementById('slot-row');
  slotSeq.forEach(function(c){ var col=document.getElementById('slotcol-'+c); if(col)slotRow.appendChild(col); });
  renderOptions(optTiles);
  Object.keys(slotFills).forEach(function(c){
    var id=slotFills[c];
    if(id!=null){ var el=document.getElementById('pool').querySelector('.opt[data-id="'+id+'"]'); if(el)el.classList.add('sel'); }
  });
  activeSlot=nextEmptySlot();updateActiveSlot();updateSlots();
  rgRenderBonusForSyl();
  document.getElementById('btn-check').disabled=!rgAllSylsFilled();
}
function rgGotoSyl(idx){
  if(sylList.length<=1)return; // พยางค์เดียวไม่ต้องสลับ
  if(idx===sylIdx || checked)return; // เช็คคำตอบไปแล้ว ไม่ให้สลับอีก (กันงง)
  sylCache[sylIdx]=rgCaptureSylState();
  sylIdx=idx;
  var target=sylCache[idx];
  document.getElementById('banner').className='gsh-feedback-slot result-banner';
  document.getElementById('retry-hint').className='retry-hint';
  document.getElementById('reveal').className='reveal';
  setGameBtns('normal');
  if(target){ rgRestoreSylState(target); }
  else { loadSyl(); } // ยังไม่เคยแวะพยางค์นี้ → สร้างใหม่แบบเดิม (ตัวลวงสุ่มครั้งแรกครั้งเดียว)
  renderSylStrip();
}
// Lin 2026-07-30: rgFinalizeAllBonuses เดิม (บวกแต้มทายวรรณยุกต์ที่แคชไว้) ถูกลบแล้ว — เหลือแค่บันทึก state พยางค์ปัจจุบัน
function rgFinalizeAllBonuses(){
  sylCache[sylIdx]=rgCaptureSylState();
}
// สลับไปพยางค์ idx อย่างปลอดภัย ใช้ตอนกด 檢查 (เจอ syllable ที่ยังไม่เคยแวะ/ไม่มี cache ก็ไม่พัง)
function rgJumpForCheck(idx){
  sylIdx=idx;
  var st=sylCache[idx];
  if(st){ rgRestoreSylState(st); } else { loadSyl(); }
  renderSylStrip();
}
function rgCheckWholeWord(){
  sylCache[sylIdx]=rgCaptureSylState();
  var wrongIdx=-1;
  for(var i=0;i<sylList.length;i++){
    var st=sylCache[i];
    var ok = st && rgSylFilled(st) && st.comps.every(function(c){
      var id=st.slotFills[c]; if(id==null)return false;
      var t=null; for(var k=0;k<st.optTiles.length;k++){ if(st.optTiles[k].id===id){t=st.optTiles[k];break;} }
      return t && t.val===st.correctVal[c];
    });
    if(!ok){ wrongIdx=i; break; }
  }
  if(wrongIdx===-1){
    rgJumpForCheck(sylList.length-1); // ให้ sylIdx จบที่พยางค์สุดท้ายเสมอ กัน next() งงว่าไปพยางค์ถัดไปหรือคำถัดไป
    checked=true; // ต้องตั้งหลังสลับพยางค์ เพราะ loadSyl() (ถ้าพยางค์นี้ยังไม่เคยแวะ) จะ reset checked=false ทับ
    rgFinalizeAllBonuses();
    document.getElementById('bonus-section').className='bonus-section'; // ซ่อนกล่องทายวรรณยุกต์ ก่อนโชว์สรุปรวมทุกพยางค์ (กันโชว์ซ้ำ) — Lin 2026-07-12
    markOpts();markSlots();showRevealMulti();renderSylStrip();
    document.getElementById('retry-hint').className='retry-hint';
    setGameBtns('done');
    finalizeWord();
    document.getElementById('btn-next').textContent='下一題 →';
    document.getElementById('ok').textContent=okC;document.getElementById('bad').textContent=badC;
    refreshUI();
  } else {
    wrongCount++;wordHadWrong=true;streak=0;badC++;
    try{ if(typeof gtag==='function') gtag('event','typing_game_wrong',{category:'game',word: WORD.th, wrongs: wrongCount, syllable: wrongIdx+1}); }catch(e){}
    try{ if(typeof gtag==='function') gtag('event','game_wrong',{category:'game',game:'typing_game'}); }catch(e){}
    rgJumpForCheck(wrongIdx);
    if(wrongCount<3){
      document.getElementById('pool').querySelectorAll('.opt').forEach(function(x){
        var c=slotOfTile(Number(x.dataset.id));
        if(c && correctVal[c]!==x.dataset.val)x.classList.add('wrong');
      });
      setTimeout(function(){ document.getElementById('pool').querySelectorAll('.opt.wrong').forEach(function(x){x.classList.remove('wrong');}); },750);
      picks=[];slotFills={cons:null,vowel:null,final:null,tone:null};
      activeSlot=nextEmptySlot();updateActiveSlot();updateSlots();
      document.getElementById('pool').querySelectorAll('.opt.sel').forEach(function(x){x.classList.remove('sel');});
      document.getElementById('btn-check').disabled=true;
      var hint=document.getElementById('retry-hint');
      var _msg3097=(wrongCount===1?'沒關係～再看看這個音節 🌱':'再一次就好，米娜相信你 💛')+'（音節 '+(wrongIdx+1)+'）';
      hint.textContent=_msg3097;
      hint.className='retry-hint show';
      rgToast(_msg3097); // 改成 pop up，自動消失，不用手動關 — Lin 2026-07-07
      document.getElementById('ok').textContent=okC;document.getElementById('bad').textContent=badC;
      updateCombo();
      renderSylStrip();
    } else {
      wordFailed=true;
      rgJumpForCheck(sylList.length-1);
      checked=true; // ต้องตั้งหลังสลับพยางค์ เหตุผลเดียวกับด้านบน
      rgFinalizeAllBonuses();
      markOpts();markSlots();showReveal();renderSylStrip();
      document.getElementById('retry-hint').className='retry-hint';
      setGameBtns('done');
      finalizeWord();
      document.getElementById('btn-next').textContent='下一題 →';
      document.getElementById('ok').textContent=okC;document.getElementById('bad').textContent=badC;
      updateCombo();refreshUI();
    }
  }
}

// Lin 2026-07-12: รีเฟรชหน้าแล้วต้องอยู่ระดับ(初/中/高)เดิม ไม่กระเด้งกลับ 初級 default เสมอ
try{
  var _savedLv=localStorage.getItem('tg_level');
  if(_savedLv==='初'||_savedLv==='中'||_savedLv==='高'){
    curLevel=_savedLv;
    document.querySelectorAll('.ltab').forEach(function(b){b.classList.remove('active');});
    var _lt=document.getElementById('ltab-'+curLevel);
    if(_lt)_lt.classList.add('active');
  }
}catch(e){}
loadSave();
try{ tgTryResume(); }catch(e){} // Phase E3: อ่าน+เก็บ session ค้างไว้ในตัวแปรก่อน initGame() จะเขียนทับ localStorage ด้วยรอบใหม่
initGame();
try { rgRenderGameBar(); } catch(e){}

// ── ฟ้อนต์โมเดิร์น (เหมือนเกมเสียง) ──
function rgToggleFont() {
  // Lin 2026-07-25: ลบโค้ดอัปเดตปุ่มเก่า #rg-font-btn ออก — ปุ่มนั้นไม่มีในหน้าแล้วตั้งแต่ย้ายเข้าเมนู 🍚 (shared.js สร้างปุ่มจริงเอง อ่านสถานะจาก class บน <body>)
  var on = document.body.classList.toggle('rg-modern-font');
  try { localStorage.setItem('rg_modern_font', on ? '1' : '0'); } catch(e){}
  try{ if(typeof gtag==='function') gtag('event','typing_game_font_toggle',{category:'game', on: on}); }catch(e){}
}
(function(){ try { if (localStorage.getItem('rg_modern_font') === '1') { document.body.classList.add('rg-modern-font'); } } catch(e){} })(); // Lin 2026-07-25: ตัดโค้ดตั้งปุ่มเก่า #rg-font-btn ออก (ปุ่มไม่มีในหน้าแล้ว)

// ── 我有問題 ──
function rgOpenAsk() {
  try{ if(typeof gtag==='function') gtag('event','typing_game_ask_open',{category:'game'}); }catch(e){}
  var old = document.getElementById('rg-ask-ov'); if (old) old.remove();
  var div = document.createElement('div');
  div.id = 'rg-ask-ov';
  div.style.cssText = 'position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(0,0,0,.48);font-family:"Noto Sans TC",sans-serif;';
  div.innerHTML =
    '<div style="background:#fff;border-radius:20px;max-width:380px;width:100%;padding:28px 24px;position:relative;">' +
    '<button onclick="document.getElementById(\'rg-ask-ov\').remove();try{gtag(\'event\',\'typing_game_ask_close\',{category:\'game\'})}catch(e){}" style="position:absolute;top:14px;right:16px;background:none;border:none;font-size:20px;cursor:pointer;color:#aaa;">✕</button>' +
    '<div style="font-size:20px;font-weight:900;color:#8B6310;margin-bottom:10px;">？ 我有問題</div>' +
    '<div style="font-size:13px;color:#888;margin-bottom:14px;">在練習中卡住了嗎？把問題寫下來，老師會收到並回覆你 🙏</div>' +
    '<input id="rg-ask-email" type="email" placeholder="你的 Email（方便老師回覆，可留空）" style="width:100%;border:1.5px solid #e0d0b0;border-radius:10px;padding:9px 12px;font-size:16px;margin-bottom:10px;font-family:inherit;">' +
    '<textarea id="rg-ask-msg" placeholder="想問的問題…" rows="4" style="width:100%;border:1.5px solid #e0d0b0;border-radius:10px;padding:9px 12px;font-size:16px;resize:none;font-family:inherit;margin-bottom:14px;"></textarea>' +
    '<div style="display:flex;gap:8px;justify-content:flex-end;">' +
    '<button onclick="document.getElementById(\'rg-ask-ov\').remove();try{gtag(\'event\',\'typing_game_ask_close\',{category:\'game\'})}catch(e){}" style="padding:9px 18px;border-radius:20px;border:1.5px solid #ddd;background:#fff;color:#888;font-size:13px;cursor:pointer;">取消</button>' +
    '<button id="rg-ask-send" style="padding:9px 20px;border-radius:20px;border:none;background:linear-gradient(135deg,#8B6310,#C8973A);color:#fff;font-size:13px;font-weight:700;cursor:pointer;">送出問題 →</button>' +
    '</div></div>';
  document.body.appendChild(div);
  div.querySelector('#rg-ask-send').onclick = function() {
    try{ if(typeof gtag==='function') gtag('event','typing_game_ask_submit',{category:'game'}); }catch(e){}
    var email = (document.getElementById('rg-ask-email')||{}).value || '';
    var msg   = (document.getElementById('rg-ask-msg')||{}).value || '';
    if (!msg.trim()) { alert('請寫下您的問題'); return; }
    var btn = div.querySelector('#rg-ask-send'); btn.disabled = true; btn.textContent = '送出中…';
    fetch('https://api.web3forms.com/submit', { method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ access_key:'b0b4c37b-6fad-4e64-9a16-81c5ab2ff4c3', subject:'[打字遊戲] 學生問題', from_name:'打字遊戲', email: email||'anonymous@game', message: msg }) })
    .then(function(r){ return r.json(); })
    .then(function(d){ if (!d || !d.success) throw new Error((d && d.message) || 'submit failed'); btn.textContent = '✅ 已送出！'; setTimeout(function(){ div.remove(); }, 1200); })
    .catch(function(){ btn.disabled=false; btn.textContent='送出問題 →'; alert('送出失敗，請稍後再試'); });
  };
}

// 2026-07-13: ระบบ 🔧แจ้งปัญหา/💭รีวิว ย้ายไปทำใน shared.js แล้ว (ใช้ร่วมทุกเกม ดูรายละเอียดที่นั่น)

// ── GA4 click tracking เพิ่มเติม (audit 2026-08) ──
// 🔊 ปุ่มเสียง: word-audio.js ผูก listener ของตัวเองไว้ที่ปุ่มนี้แล้ว — เพิ่ม listener แยกอีกตัวบน element เดียวกัน
// (หลาย listener บน node เดียวกันทำงานอิสระต่อกันเสมอ ไม่ถูกบล็อกโดย stopPropagation ของอีกตัว)
try {
  if (!window.__tgSoundTrackBound) {
    window.__tgSoundTrackBound = true;
    var _tgSoundBtn = document.getElementById('rg-sound-toggle');
    if (_tgSoundBtn) {
      _tgSoundBtn.addEventListener('click', function(){
        try { gtag('event','typing_game_audio_play',{category:'game', word: (typeof WORD!=='undefined' && WORD) ? WORD.th : ''}); } catch(e){}
      });
    }
  }
} catch(e){}

// 🍙/🌾 ปุ่มสลับคำแปล: shared.js สร้างปุ่มนี้แบบไดนามิก — ดักจับด้วย delegated listener แบบ capture-phase บน document
try {
  if (!window.__tgTranslateTrackBound) {
    window.__tgTranslateTrackBound = true;
    document.addEventListener('click', function(e){
      var t = e.target.closest ? e.target.closest('.zh-fab-inline, #zh-fab-standalone') : null;
      if (t) { try { gtag('event','typing_game_translate_toggle',{category:'game'}); } catch(e){} }
    }, true);
  }
} catch(e){}

// ── Shared Game UI: ลงทะเบียน modal ของเกมนี้กับ registerGameModal (shared.js) ──
// กันเปิดซ้อนกับเมนู 🎮/🍚/🪧 ของ shared.js — ไม่เปลี่ยนกลไกเดิมของ modal เลย แค่ให้ shared.js
// รู้จักปิด modal เหล่านี้ได้เมื่อมีอย่างอื่นเปิดพร้อมกัน · registerGameModal อาจยังไม่ถูกโหลด (เป็นของเสริม) จึงห่อ try/catch
try {
  if (window.registerGameModal) {
    window.__tgHowtoModalReg = window.registerGameModal({
      isOpen: function () { var m = document.getElementById('rg-howto-modal'); return !!m && m.style.display === 'flex'; },
      close: function () { var m = document.getElementById('rg-howto-modal'); if (m) { m.style.display = 'none'; try { gtag('event','typing_game_howto_close',{category:'game'}); } catch(e){} } }
    });
    window.__tgStarModalReg = window.registerGameModal({
      isOpen: function () { var m = document.getElementById('star-modal'); return !!m && m.classList.contains('show'); },
      close: function () { var m = document.getElementById('star-modal'); if (m) { m.classList.remove('show'); try { gtag('event','typing_game_star_modal_close',{category:'game'}); } catch(e){} } }
    });
    window.__tgBadgeModalReg = window.registerGameModal({
      isOpen: function () { var m = document.getElementById('badge-modal'); return !!m && m.classList.contains('show'); },
      close: function () { var m = document.getElementById('badge-modal'); if (m) { m.classList.remove('show'); try { gtag('event','typing_game_badge_modal_close',{category:'game'}); } catch(e){} } }
    });
    // rg-ask-ov (我有問題) ถูกสร้าง/ลบทั้ง element ด้วย rgOpenAsk() — ไม่มี show/hide class ให้เช็ค แค่เช็คว่ามี element อยู่ไหม
    window.__tgAskModalReg = window.registerGameModal({
      isOpen: function () { return !!document.getElementById('rg-ask-ov'); },
      close: function () { var m = document.getElementById('rg-ask-ov'); if (m) m.remove(); }
    });
  }
} catch(e){}
