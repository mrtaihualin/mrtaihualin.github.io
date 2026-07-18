// ════════════════════════════════════════════
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
// comp='vowel' → v คือ "เสียงอ่านเต็มคำ" (VOWEL_READ ผ่าน dispOpt แล้ว) เป็นข้อความสมบูรณ์อยู่แล้ว
//   ไม่ต้องแทรก base ก แบบสระสัญลักษณ์เดิม (ไม่งั้นจะเพี้ยน เช่น "โอ" จะกลายเป็น "โกอ")
function setSlotContent(box, v, stateClass, comp){
  if(!v){
    box.textContent='◌';
    box.className='slot-box empty-slot';
  } else {
    box.innerHTML=(comp==='vowel')?v:dispHTML(v);
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
var CONS_SOUND={
  'ก':'ก','ข':'ข','ค':'ค','ง':'ง','จ':'จ','ช':'ช',
  'ซ':'ซ','ฉ':'ฉ','ฌ':'ช','ญ':'ย','ฎ':'ด','ฏ':'ต',
  'ฐ':'ถ','ฑ':'ท','ฒ':'ท','ณ':'น','ด':'ด','ต':'ต',
  'ถ':'ถ','ท':'ท','ธ':'ท','น':'น','บ':'บ','ป':'ป',
  'ผ':'ผ','ฝ':'ฝ','พ':'พ','ฟ':'ฟ','ภ':'พ','ม':'ม',
  'ย':'ย','ร':'ร','ล':'ล','ว':'ว','ศ':'ส','ษ':'ส',
  'ส':'ส','ห':'ห','ฬ':'ล','อ':'อ','ฮ':'ฮ','ฆ':'ค'
};
var FINAL_SOUND={
  'ก':'ก','ข':'ก','ค':'ก','ฆ':'ก','ง':'ง',
  'จ':'ด','ช':'ด','ซ':'ด','ฉ':'ด','ฌ':'ด',
  'ต':'ด','ถ':'ด','ท':'ด','ธ':'ด','ด':'ด','ฎ':'ด','ฏ':'ด',
  'ฐ':'ด','ฑ':'ด','ฒ':'ด','ศ':'ด','ษ':'ด','ส':'ด',
  'น':'น','ณ':'น','ญ':'น','ร':'น','ล':'น','ฬ':'น',
  'บ':'บ','พ':'บ','ภ':'บ','ฟ':'บ','ป':'บ','ผ':'บ','ฝ':'บ',
  'ม':'ม','ย':'ย','ว':'ว',
  'ห':'（不發音）','อ':'（不發音）'
};
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
// 高級 — ใช้ 10 ประโยคเดิมจาก adv-sentences.js (ADV_SENTENCES) แต่เล่นด้วยกลไกเดียวกับ 中級 ทุกอย่าง
// (แตกทั้งประโยคเป็นพยางค์ต่อเนื่อง ใช้ syls[] เหมือนคำหลายพยางค์ปกติ) — Lin 2026-07-04
// ⚠️ cons/vowel/tone/final ของแต่ละพยางค์ตรวจตามกฎวรรณยุกต์ไทยมาตรฐาน (thai-language.com/ref/tone-rules)
//    พยางค์ที่ตรงกับคำที่มีอยู่แล้วใน WORDS ด้านบน ใช้ค่าเดิมตรงๆ (ผม/กิน/ข้าว/ไป/มา/เขา/ไม่/ที่/ผัก/บ้าน/วัน/นี้/อา/ร้อน/พูด/ทำ/ไร/พรุ่ง/ด้วย/นะ/ไง...)
//    ส่วนที่เหลือ (หยู่/ค่อย/เลย/คุน/ไหน/หยาก/เรียน/พา/สา/ไท/กาด/มาก/ด้าย/รู้/จะ/ยัง/เรา/กัน/แก/กำ/ลัง/อะ/เทอ/กลับ/หรอ) คำนวณใหม่ — Lin ช่วยสุ่มตรวจอีกทีก่อน push
// ✅ 2026-07-11: รวมกลับเข้า adv-sentences.js แล้ว (ก่อนหน้านี้แยก copy ไว้ในไฟล์นี้เอง ไม่ sync กับ typing-game.html) ตอนนี้ 4 เกมใช้ข้อมูลชุดเดียวกัน
var WORDS_HIGH = buildSentencesForPhonicsGames(ADV_SENTENCES); // 2026-07-11: ย้ายประโยค高級กลับไปเก็บที่ adv-sentences.js (ใช้ร่วมกับ 4 เกม)
WORDS = WORDS.concat(WORDS_HIGH);

var BONUS_TONES=[
  {name:'สามัญ', zh:'第一聲', num:1},
  {name:'เอก',   zh:'第二聲', num:2},
  {name:'โท',    zh:'第三聲', num:3},
  {name:'ตรี',   zh:'第四聲', num:4},
  {name:'จัตวา', zh:'第五聲', num:5}
];

function buildRevealRules(w){
  var rows=[];
  var consDisp=w.lead?w.lead+w.cons:(w.cluster?w.cons+w.cluster:w.cons);
  var csnd=CONS_SOUND[w.cons]||w.cons;
  rows.push({tag:'子音',sp:false,
    text:consDisp+(csnd!==w.cons?' <span class="rule-arrow">→</span> 發音「'+csnd+'」':' 發音「'+csnd+'」')});
  var vread=VOWEL_READ[w.vowel]||w.vowel;
  var vsym=VOWEL_SYMBOL[w.vowel]||w.vowel;
  rows.push({tag:'母音',sp:false,
    text:dispHTML(vsym)+' <span class="rule-arrow">→</span> '+vread});
  if(w.final){
    var fsnd=FINAL_SOUND[w.final]||w.final;
    rows.push({tag:'尾音',sp:false,
      text:w.final+(fsnd!==w.final?' <span class="rule-arrow">→</span> 發音「'+fsnd+'」':' 發音「'+fsnd+'」')});
  }
  if(w.tone){
    if(w.tone==='์'){
      rows.push({tag:'聲調符',sp:false,text:dispHTML(w.tone)+' = 消音符（不發音）'});
    } else {
      var _cls=w.th?TH_ENGINE.getInitClass(getFullSyllableSpelling(w)):null;
      var _clsZh=TONE_CLASS_ZH[_cls==='lead'?'high':_cls]||'';
      var _toneZh=(TONE_ZH[w.tone_name]||w.tone_name);
      var _markLabel=_clsZh
        ? (dispHTML(w.tone)+' + '+_clsZh+' <span class="rule-arrow">→</span> '+_toneZh)
        : (dispHTML(w.tone)+' <span class="rule-arrow">→</span> '+_toneZh);
      rows.push({tag:'聲調符',sp:false,text:_markLabel});
    }
  }
  if(w.lead==='ห')rows.push({tag:'前導 ห',sp:true,text:'ห 置於 '+w.cons+' 前 → 提高聲調'});
  if(w.lead==='อ')rows.push({tag:'前導 อ',sp:true,text:'อ 置於 '+w.cons+' 前 → 提高聲調'});
  if(w.cluster)rows.push({tag:'複合音',sp:true,text:w.cons+w.cluster+'（兩個子音一起發音）'});
  return rows;
}

// Lin 2026-07-15: TH_ENGINE + computeToneFromSpelling + buildToneReason ย้ายไปรวมเป็นไฟล์เดียว
// data/tone-engine.js แล้ว (ก่อนหน้านี้ก็อปปี้เหมือนกันเป๊ะอยู่ 3 ที่: tone-finder.html/reading-game.html/
// typing-game.html — แก้บั๊กอักษรนำ+ตัวการันต์ที่ไฟล์เดียวพอ) โหลดผ่าน <script src="data/tone-engine.js">
// ด้านบน ได้ตัวแปร/ฟังก์ชันชื่อเดิมเป๊ะ (TH_ENGINE, computeToneFromSpelling, buildToneReason,
// TONE_CLASS_ZH, TONE_MARK_NAME, TONE_NUM_NAME) ใช้ต่อได้โดยไม่ต้องแก้โค้ดข้างล่างนี้เลย

// Lin 2026-07-10: 猜聲調答完後，把「為什麼」推導句 + 子音/母音/尾音（含前引字/複合音）拆解一起顯示在 #bonus-reason
// buildRevealRules() 本身一律安全可顯示（純拆字），只有 buildToneReason() 對不上時才跳過那句推導句
function renderBonusReason(w){
  var el=document.getElementById('bonus-reason');
  if(!el)return;
  if(!w||!w.th){ el.className='bonus-reason'; return; }
  var reason=buildToneReason(w);
  var rules=buildRevealRules(w);
  var html='';
  if(reason)html+='<div class="bonus-reason-why">💡 '+reason+'</div>';
  if(rules&&rules.length){
    html+='<div class="bonus-reason-rules">'+rules.map(function(r){
      return '<div class="rule-row"><span class="rule-tag'+(r.sp?' sp':'')+'">'+r.tag+'</span><span class="rule-txt">'+r.text+'</span></div>';
    }).join('')+'</div>';
  }
  if(html){ el.innerHTML=html; el.className='bonus-reason show'; }
  else { el.className='bonus-reason'; }
}

// ════════════════════════════════════════════
// STATE
// ════════════════════════════════════════════
var ROUND_SIZE=10;
// ── ระบบคะแนนกลาง (Lin 2026-07-04 แก้ตามสเปกใหม่ — คำสั่ง_แก้เกมอ่าน_รอบแกน_2026-07-04.md งานที่2) ──
// ── กฎ MASTER 2026-07-05: ตัวคูณระดับ soft = ชุดเดียวกับดาวเงิน (初1/中1.5/高2) + คูณ "ทั้งรอบตอนจบ" (เลิกคูณต่อคำ) ──
var LEVEL_WEIGHT={'初':1,'中':1.5,'高':2};
var COMBO_TIERS={3:1.5,5:2,8:3};               // คอมโบตอบสะอาดติดกัน → ตัวคูณแต้ม (ลอกเกมเสียง)
function rgComboMult(streak){return streak>=8?3:(streak>=5?2:(streak>=3?1.5:1));}
var SRS_REVIEW_BONUS=[3,2,1];                   // โบนัสผ่านรอบทบทวน SRS สะอาด: รอบ1(day1)+3 · รอบ2(day7)+2 · รอบ3(day16)+1
var ROUND_COMPLETE_BONUS=20;                   // จบรอบ +20
var ROUND_PERFECT_BONUS=50;                    // จบรอบแบบ perfect เพิ่มอีก +50 (รวม 70)
var GOLDEN_WORD_CHANCE=0.18;                   // โอกาสคำทอง ~18%/คำ (สเปกเดียวกับเกมเสียง)
var GOLDEN_WORD_MULT=2;                        // คำทองตอบถูกครั้งแรก ×2
var ADV_PTS_PER_SYL=2;                         // 高級: +2 แต้ม/พยางค์ที่อ่านถูก (คำทอง ×2 → +4)
// ── งานที่1+2 (2026-07-04): คะแนนต่อพยางค์ 0/1/2/3ผิด → 10/7/4/1 (floor1) · ครบ4=fail(0) ──
var SYL_SCORE=[10,7,4,1];
function rgSyllableScore(wc){return SYL_SCORE[Math.min(wc||0,3)];}
// Lin 2026-07-06: สีหลอดคะแนนต่อข้อ ทองเข้ม→แดง (ชุดเดียวทุกเกม)
function rgScoreBarColor(sc,max){ if(sc<=0)return '#b83227'; var f=Math.max(0,Math.min(1,sc/(max||10))); var hue=f>=0.4?40:Math.round(40*(f/0.4)); var light=f>=0.4?42:38; return 'hsl('+hue+',78%,'+light+'%)'; }
// 本題分數: คะแนนของ "พยางค์ที่กำลังทำ" ตามจำนวนครั้งที่ผิด (บันได 10/7/4/1) · ตาย(fail)=0
function rgCurSyllableScore(){ try{ if(typeof wordFailed!=='undefined'&&wordFailed)return 0; var wc=(sylWrongCount&&sylWrongCount.length)?(sylWrongCount[(typeof sylIdx!=='undefined'?sylIdx:0)]||0):(typeof wrongCount!=='undefined'?wrongCount:0); return rgSyllableScore(wc);}catch(e){return 10;} }
var HIGH_RAW_START_IDX=7;      // 0-based → พยางค์ที่ 8 เป็นต้นไป (เฉพาะ高／ประโยคยาว) ไม่เอาเข้าเฉลี่ย ไม่คูณ weight
var HIGH_RAW_BONUS_PER_SYL=2;  // +2 ดิบ/พยางค์ (ถ้าพยางค์นั้นถูกในที่สุด — ไม่สเกลตามจำนวนผิด)
var RG_LEVEL_TO_NUM={'初':1,'中':2,'高':3}; // map ให้ตรงกับ GAME_ACCOUNT.addHardStars(clean, level:1|2|3)
var curLevel='初';
var roundQueue=[],cur=0,okC=0,badC=0,streak=0,maxStreak=0,roundScore=0,cleanC=0,roundTotal=0;
var roundLog=[]; // {th,zh,wrong,failed,guide,pts,srsDue,mastered} ต่อคำ — ทำรายงาน PDF ท้ายรอบ — Lin 2026-07-07
function rgLogWord(o){
  try{
    var idx=roundQueue[cur];
    var w=WORDS[idx];
    var base={th:w?w.th:'',zh:w?w.zh:'',wrong:(typeof wrongCount!=='undefined'?wrongCount:0),failed:false,guide:false,pts:0,srsDue:'',mastered:false};
    for(var k in o){ if(Object.prototype.hasOwnProperty.call(o,k)) base[k]=o[k]; }
    roundLog.push(base);
  }catch(e){}
}
// 2026-07-13 Lin：ดึงคำที่พลาดในรอบนี้จาก roundLog ไปเก็บลง reading_sessions.wrong_items (ฐานข้อมูลจุดอ่อน)
function rgWrongItemsFromLog(){
  try{ return roundLog.filter(function(w){return (w.wrong||0)>0||w.failed;}).map(function(w){return {th:w.th,zh:w.zh,wrong:w.wrong||0};}); }
  catch(e){ return []; }
}
var roundHadGuide=false; // (เลิกใช้แล้ว — คำใบ้เป็นรายคำ) เก็บตัวแปรไว้กันโค้ดเดิมอ้างถึง
var isWordPractice=false; // ?word= ฝึกคำเดียว / ทบทวนหลังจำครบ = ไม่คิดคะแนน/ลีก (G + กฎ15)
var rgAllMasteredPending=false; // กฎ15: รอเด้งหน้าฉลอง 全部精通
var picks=[],comps=[],correctSet=[],needN=0;
var checked=false,wrongCount=0;
var wordToneBonus=0; // รวมแต้มโบนัสวรรณยุกต์ (+1) ของ "คำนี้" ทั้งคำ — บวกรวมกับคะแนนหลักตอนแสดงแบนเนอร์ตอนจบคำ ไม่ให้แยกโชว์คนละที่ (ตามที่ Lin สั่งให้ทำเหมือนเกมพิมพ์) — Lin 2026-07-07
var sylWrongCount=[];          // งานที่1: จำนวนครั้งที่ผิดก่อนถูก แยกรายพยางค์ (index ตรงกับ sylList)
var wordUsedGuide=false;       // งานที่3: เปิดคำใบ้ระหว่างเช็คคำตอบหน่วยนี้ไหม (ถ้าใช่ = 0 คะแนน + ไม่นับ SRS)
var curWordIsKnownCheck=false; // งานที่7: กำลังอยู่ในด่านพิสูจน์ "已記得" ของคำนี้ไหม (ไม่มีคำใบ้ ไม่ได้แต้ม/ดาว)
function rgLoggedIn(){ try{ return !!(window.READING_AUTH && READING_AUTH.user); }catch(e){ return false; } }
// ── SRS ใหม่ (งานที่4 — ลอกจาก TF_SRS ในเกมเสียง tone-finder.html ~2939-3018 ทุกจุด) ──
// แทนที่ masteredSet/correctCountMap/reviewDates เดิม (นับถูกติดกันธรรมดา ไม่รีเซ็ตเมื่อผิด) ด้วย stage-based 1→7→16 วัน
var RG_SRS_CFG={INTERVALS:[1,7,16],CLEAN_ROUNDS_TO_MASTER:3};
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
var SAVE_KEY='rgv3_save';
var rememberStep=0,rememberTimer=null;
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
// ── โหมดคำใบ้ (ว่าต้องเลือกช่องไหนต่อ) — เปิด/ปิดได้ จำค่าไว้ใน localStorage เหมือน typing-game.html ──
var rgGuideMode=(function(){try{return localStorage.getItem('rg_guide_mode')==='1';}catch(e){return false;}})(); // กฎ MASTER: default = 無提示 (โหมดเก็บแต้ม) · เปิด 有提示 เฉพาะที่ผู้เล่นตั้งเอง
function setRgGuideMode(on){
  rgGuideMode=!!on;
  try{localStorage.setItem('rg_guide_mode',rgGuideMode?'1':'0');}catch(e){}
  // Lin 2026-07-19: ปุ่มวงเดียว กดสลับ — 有提示 โชว์ 💡 · 無提示 โชว์ 🔥
  var t=document.getElementById('rg-guide-toggle');
  if(t){ t.textContent=rgGuideMode?'💡':'🔥'; t.title=rgGuideMode?'有提示（練習）':'無提示（挑戰）'; }
  // ป้ายบอกโหมด (Lin 2026-07-04): 有提示 = ฝึกฝนล้วน ไม่ได้อะไรเลย · 無提示 = เก็บแต้ม/ดาว/ความคืบหน้า
  var note=document.getElementById('rg-mode-note');
  if(note){
    if(rgGuideMode){ note.innerHTML='💡 <b>練習模式</b>・純練習不計分（沒有分數、星星與複習進度）'; note.style.background='#fff3d8'; note.style.color='#9a6a10'; }
    else { note.innerHTML='🔥 <b>計分模式</b>・答對得分、累積星星與複習進度'; note.style.background='#e8f5e9'; note.style.color='#2e7d32'; }
  }
  updateActiveSlot();
}
function updateActiveSlot(){
  slotSeq.forEach(function(c){
    var box=document.getElementById('sb-'+c);if(!box)return;
    box.classList.toggle('active', rgGuideMode && c===activeSlot && !checked && !curWordIsKnownCheck);
  });
  updateOptHint();
}
// ── 提示 = บอกว่า "ตัวเลือกไหน" ในกองไทล์ที่ถูกต้อง (ไม่ใช่แค่บอกลำดับช่อง) ──
function updateOptHint(){
  var pool=document.getElementById('pool');
  if(!pool)return;
  pool.querySelectorAll('.opt.hint').forEach(function(x){x.classList.remove('hint');});
  if(!rgGuideMode||checked||!activeSlot||curWordIsKnownCheck)return; // งานที่7: ด่านพิสูจน์ 已記得 ห้ามมีคำใบ้เด็ดขาด
  var want=correctVal[activeSlot];
  for(var i=0;i<optTiles.length;i++){
    var t=optTiles[i];
    if(t.type===activeSlot && t.val===want){
      var el=pool.querySelector('.opt[data-id="'+t.id+'"]');
      if(el){
        el.classList.add('hint');
        // กฎ MASTER (อุดรูรั่ว A): "เห็นคำใบ้ = คำนี้ไม่ได้แต้ม" — ล็อกทันทีที่ไฮไลต์คำตอบ (ไม่ใช่รอกดตรวจ)
        // ยกเว้นด่านพิสูจน์ 已記得 (curWordIsKnownCheck) ซึ่งซ่อนคำใบ้อยู่แล้ว จะไม่ถึงบรรทัดนี้
        if(!checked)wordUsedGuide=true;
      }
      break;
    }
  }
}
setRgGuideMode(rgGuideMode); // ตั้งสถานะปุ่มตามค่าที่จำไว้ ตั้งแต่โหลดหน้า

// ── ปุ่มเปิด/ปิดคำอ่านที่โชว์ตั้งแต่คำเพิ่งโหลด (ไม่กระทบตอนเฉลย showReveal/showRevealMulti ซึ่งโชว์เสมอ) — Lin 2026-07-16
// 🐣 มีนาเจี๊ยบออกเสียง = คำอ่านโชว์อยู่ · 🥚 ไข่เงียบ = คำอ่านซ่อนอยู่ (จนกว่าจะเฉลย) — icon เลือกโดย Lin
var rgPronMode=(function(){try{var v=localStorage.getItem('rg_pron_mode');return v===null?false:v==='1';}catch(e){return false;}})(); // default = ซ่อน (ผู้เล่นกดเปิดเอง) — Lin 2026-07-16
function setRgPronMode(on){
  rgPronMode=!!on;
  try{localStorage.setItem('rg_pron_mode',rgPronMode?'1':'0');}catch(e){}
  var btn=document.getElementById('rg-pron-toggle');
  if(btn){
    btn.textContent=rgPronMode?'🐣':'🥚';
    btn.title=rgPronMode?'目前：讀音已顯示（點擊隱藏，答對後仍會顯示）':'目前：讀音已隱藏（點擊顯示）';
    btn.setAttribute('aria-label',btn.title);
  }
  if(typeof WORD!=='undefined' && WORD && !checked){
    document.getElementById('rev-pron').textContent=(rgPronMode&&WORD.th)?((WORD.readingTH||WORD.th)):''; // Lin 2026-07-16: ปุ่มคำอ่านต้องใช้ readingTH เสมอ (fallback=ตัวคำเอง) ห้ามใช้ syls[].th
  }
}
setRgPronMode(rgPronMode); // ตั้งไอคอนปุ่มตามค่าที่จำไว้ ตั้งแต่โหลดหน้า
var bonusAnswered=false;
var selectedBonus=null;  // tone name user picked before 檢查

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
  try{localStorage.setItem(SAVE_KEY,JSON.stringify({srsRecords,totalStars,totalBadges}));}catch(e){}
}

// ════════════════════════════════════════════
// ── Lin 2026-07-13: ซิงก์ SRS "ข้ามเครื่อง" — อ่านกลับจาก Supabase (tone_srs_state, game='reading') → merge เข้า srsRecords ──
//   • อ่านอย่างเดียว · เขียนขึ้นเซิร์ฟเวอร์ยังเป็นหน้าที่ tone-round เหมือนเดิม (ดาว/กันโกงไม่แตะ)
//   • 2026-07-15: เปลี่ยนมาใช้ key "คำ+ระดับ" ตรงกับฝั่งเซิร์ฟเวอร์เป๊ะ ไม่ต้องแปลง index อีกแล้ว
//     (เดิมต้องสแกนหา index ใน WORDS ก่อน merge — พอ Lin แก้ไฟล์คำ ตำแหน่งขยับ ก็เคย merge ผิดคำได้)
//   • คู่ขนาน ไม่บล็อกเกม · เน็ตล่ม/ไม่ล็อกอิน = ใช้ srsRecords ในเครื่องเดิม · กติกา merge = เลือกอันก้าวหน้ากว่า (ทดสอบกดจริง 8/8)
// ════════════════════════════════════════════
function rgSrsRank(r){ if(!r) return -1; if(r.mastered) return 3; return (r.stage||0); }
function rgSrsPickAdvanced(a,b){ if(!a)return b; if(!b)return a; var ra=rgSrsRank(a),rb=rgSrsRank(b); if(ra!==rb)return ra>rb?a:b; var da=a.dueDate||'',db=b.dueDate||''; if(da!==db)return (da>db)?a:b; return a; }
var __rgSrsSyncPromise=null;
window.__rgSrsSyncedOnce=false;
function rgSyncSrsFromServer(force){
  try{ if(!force && !rgLoggedIn()) return Promise.resolve(false); }catch(e){ return Promise.resolve(false); }
  if(__rgSrsSyncPromise) return __rgSrsSyncPromise;
  var sb=window.getSupabaseClient?window.getSupabaseClient():null;
  if(!sb||!sb.from) return Promise.resolve(false);
  __rgSrsSyncPromise = sb.from('tone_srs_state')
    .select('level, word, stage, due_date, ever_failed, mastered')
    .eq('game','reading')
    .then(function(res){
      if(res.error||!res.data){ window.__rgSrsSyncedOnce=true; return false; }
      var changed=false;
      res.data.forEach(function(row){
        var key=(row.word||'')+'@'+(row.level||0);
        var srv={stage:row.stage||0,dueDate:row.due_date||'',dueAt:0,everFailed:!!row.ever_failed,mastered:!!row.mastered};
        var cur=srsRecords[key];
        var win=rgSrsPickAdvanced(cur,srv);
        if(!cur || win.stage!==cur.stage || (win.dueDate||'')!==(cur.dueDate||'') || (!!win.mastered)!==(!!cur.mastered)){
          srsRecords[key]=win; changed=true;
        }
      });
      if(changed) doSave();
      window.__rgSrsSyncedOnce=true;
      return changed;
    })
    .catch(function(){ window.__rgSrsSyncedOnce=true; return false; });
  return __rgSrsSyncPromise;
}
// ทริกเกอร์: ล็อกอินครั้งแรกของหน้า → ซิงก์แล้ว rebuild รอบให้ใช้ SRS ที่ตามมาข้ามเครื่อง (ครอบเคสรีเฟรช/เครื่องใหม่) · ล็อกอินซ้ำ → ซิงก์เฉยๆ
// ⚠️ ต้องลงทะเบียน "หลัง DOM พร้อม" เพราะสคริปต์เกม (inline) รันก่อนสคริปต์ defer (auth-widget) → ตอน parse ยังไม่มี SITE_AUTH
function rgWireSrsSync(){
  try{
    if(window.SITE_AUTH && SITE_AUTH.onChange){
      SITE_AUTH.onChange(function(u){
        if(!u) return;
        if(!window.__rgSrsSyncedOnce){ rgSyncSrsFromServer(true).then(function(){ try{ initGame(); }catch(e){} }); }
        else { __rgSrsSyncPromise=null; rgSyncSrsFromServer(true); }
      });
    }
  }catch(e){}
  // fallback แบบ poll — กันกรณี onChange ไม่ยิงตอนโหลด หรือ READING_AUTH พร้อมช้า · ลองทุก 0.5วิ จนซิงก์สำเร็จ สูงสุด ~12วิ
  var _rgT=0, _rgIv=setInterval(function(){
    _rgT++;
    try{
      if(window.__rgSrsSyncedOnce){ clearInterval(_rgIv); return; }
      if(rgLoggedIn()) rgSyncSrsFromServer(true).then(function(){ try{ initGame(); }catch(e){} });
    }catch(e){}
    if(_rgT>=24) clearInterval(_rgIv);
  }, 500);
}
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', rgWireSrsSync); else rgWireSrsSync();

// ════════════════════════════════════════════
// UTILS
// ════════════════════════════════════════════
function shuffle(a){a=a.slice();for(var i=a.length-1;i>0;i--){var j=Math.floor(Math.random()*(i+1));var t=a[i];a[i]=a[j];a[j]=t;}return a;}
function rnd(a){return a[Math.floor(Math.random()*a.length)];}

// avoid = ค่าที่ "แสดงผลจริง" (dispOpt แล้ว) ของคำตอบจริงช่องอื่นๆ — กันตัวลวงปลอมไปหน้าตาซ้ำกับคำตอบจริงช่องอื่น
// (ถ้าค่านั้นดันเป็นคำตอบจริงของช่องนี้เองพอดี ไม่ถือว่าปลอม ไม่กัน)
// กฎ Lin 2026-07-07 (MASTER ข้อ12): "คำตอบที่ถูกห้ามซ้ำในตัวเลือก แต่ตัวลวงเสียงซ้ำกันเองได้"
//   → ตัวเลือกอื่นๆ ห้าม "เสียงอ่าน" ตรงกับคำตอบที่ถูกพอดี (จะดูเหมือนมี 2 คำตอบถูก) แต่ตัวลวงจะเสียงซ้ำกันเอง (ไม่ตรงกับคำตอบ) ได้ปกติ เพราะเป็นจุดสอนจริง (เช่น ซ/ศ/ษ/ส อ่าน "ส" เหมือนกันหมด)
function buildOpts(ans,comp,groups,pool2,count,exclude,avoid){
  avoid=avoid||[];
  var ansDisp=dispOpt(comp,ans);
  var grp=null;
  for(var i=0;i<groups.length;i++){if(groups[i].indexOf(ans)>=0){grp=groups[i].slice();break;}}
  if(!grp)grp=[ans];
  if(exclude)grp=grp.filter(function(x){return x!==exclude;});
  grp=grp.filter(function(x){return x===ans || (dispOpt(comp,x)!==ansDisp && avoid.indexOf(dispOpt(comp,x))<0);});
  var opts=grp.slice();
  if(opts.length>count){opts=opts.filter(function(x){return x!==ans;});opts=shuffle(opts).slice(0,count-1);opts.push(ans);}
  var guard=0;
  while(opts.length<count && guard<500){
    guard++;
    var r=rnd(pool2);
    if(r!==exclude && opts.indexOf(r)<0 && (r===ans || (dispOpt(comp,r)!==ansDisp && avoid.indexOf(dispOpt(comp,r))<0))) opts.push(r);
  }
  // กันหลุด (pool2 เล็กเกินจนหาตัวลวงไม่ครบเพราะกันซ้ำ) — พยายามกันไม่ให้ซ้ำคำตอบที่ถูกก่อน ถ้าหาไม่ได้จริงๆ ค่อยยอมเติมแบบไม่กันเพื่อไม่ให้ค้าง
  while(opts.length<count){
    var strict=pool2.filter(function(r2){return r2!==exclude && opts.indexOf(r2)<0 && dispOpt(comp,r2)!==ansDisp;});
    var loose=pool2.filter(function(r2){return r2!==exclude && opts.indexOf(r2)<0;});
    var pick=strict.length?rnd(strict):(loose.length?rnd(loose):null);
    if(!pick)break; // pool2 หมดจริงๆ กันลูปค้าง
    opts.push(pick);
  }
  return shuffle(opts);
}

// เดิม dispOpt โชว์ "ตัวเขียน" — เปลี่ยนเป็น "เสียงอ่านจริง" ตามกฎ MASTER ข้อ12 (Lin 2026-07-07)
//   - cons: ตัดตัวนำ (ห/อ) ออกเพราะไม่ออกเสียงแยก แค่ยกวรรณยุกต์ · เก็บ cluster (複合音) ไว้เพราะออกเสียงจริงทั้งคู่
//   - vowel/final: ใช้ตารางเสียงจริง (VOWEL_READ/FINAL_SOUND) เดียวกับที่ใช้เฉลยด้านล่าง แล้วตัดวงเล็บอธิบาย(ภาษาจีน)ออก เหลือแต่รูปอ่านไทยล้วนๆ บนไทล์
function stripAnnotation(s){return String(s).replace(/（[^）]*）/g,'').replace(/\([^)]*\)/g,'').trim();}
function dispOpt(comp,x){
  if(comp==='cons'){var snd=CONS_SOUND[x]||x;return W.cluster?snd+W.cluster:snd;}
  if(comp==='tone')return x;
  if(comp==='vowel'){var vr=stripAnnotation(VOWEL_READ[x]||VOWEL_SYMBOL[x]||x);return vr||x;}
  var fs=stripAnnotation(FINAL_SOUND[x]||x);return fs||x;
}

// ════════════════════════════════════════════
// LEVEL SWITCH
// ════════════════════════════════════════════
function setLevel(lv){
  curLevel=lv;
  try{localStorage.setItem('rg_reading_level',lv);}catch(e){} // Lin 2026-07-12: จำระดับที่เลือกไว้ → รีเฟรชแล้วไม่ต้องเลือกใหม่
  document.querySelectorAll('.ltab').forEach(function(b){b.classList.remove('active');});
  document.getElementById('ltab-'+lv).classList.add('active');
  document.getElementById('end').style.display='none';
  // 高級 เล่นด้วยกลไก中級ตอนนี้ (เลิกใช้ระบบ adv-game เก่าแล้ว — Lin 2026-07-04)
  document.getElementById('bars-wrap').style.display='flex';
  document.getElementById('rg-stat-row').style.display='flex';
  document.getElementById('game').style.display='flex';
  // Lin 2026-07-13: เครื่องใหม่ที่เพิ่งล็อกอิน → รอ sync สั้นๆ (≤1.5วิ) ให้รอบแรกถูกต้อง เน็ตล่ม/ช้าไปต่อทันที ไม่ค้าง
  if(rgLoggedIn() && !window.__rgSrsSyncedOnce){
    var started=false, go=function(){ if(started)return; started=true; initGame(); };
    try{ Promise.race([ rgSyncSrsFromServer(), new Promise(function(r){setTimeout(r,1500);}) ]).then(go); }catch(e){ go(); }
    setTimeout(go,1600);
  } else {
    initGame();
  }
}

// ════════════════════════════════════════════
// GAME FLOW
// ════════════════════════════════════════════
function initGame(){
  roundLog=[];
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
  isWordPractice=!!_wq; // ?word= = ฝึกคำเดียว ไม่คิดคะแนน/ลีก (G)
  if(_wq){
    roundQueue=_wq;
  } else {
    // กรองตามระดับ: 高 = ประโยค (level:'高') · 中 = คำหลายพยางค์ (มี syls แต่ไม่ใช่ level:'高') · 初 = พยางค์เดียว
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
    // งานที่4: กรองด้วย SRS ใหม่ (stage-based) — เฉพาะตอนล็อกอินเท่านั้น (ลอกกฎเกมเสียง: SRS ทำงานเฉพาะล็อกอิน)
    // ไม่ล็อกอิน = เล่นได้ทุกคำเสมอ ไม่มีการจำ mastered/cooldown ในเครื่อง (ตรงสเปกข้อ0 ทั้งสองเกม)
    var pool;
    if(rgLoggedIn()){
      pool=allIdx.filter(function(i){
        var rec=srsRecords[rgSrsKey(WORDS[i])];
        if(rec&&rec.mastered)return false;      // เชี่ยวชาญแล้ว (ตัดออกถาวร)
        if(rec&&!RG_SRS.isDue(rec,now))return false; // ยังไม่ครบกำหนดทบทวน
        return true;
      });
      // ถ้าไม่มีคำพร้อม → เปิด cooldown words ก่อน (ยกเว้น mastered)
      if(pool.length===0)pool=allIdx.filter(function(i){var rec=srsRecords[rgSrsKey(WORDS[i])];return !(rec&&rec.mastered);});
      // ถ้า mastered ทั้งหมดในระดับนี้ (全部精通) → มาร์คคำครบ + ทบทวนแบบ 0 แต้ม + เด้งหน้าฉลอง (กฎ15)
      if(pool.length===0){
        try{ if(window.GAME_ACCOUNT) GAME_ACCOUNT.markLevelSeen('reading',RG_LEVEL_TO_NUM[curLevel]||1, allIdx.length); }catch(e){}
        isWordPractice=true;              // ทบทวนคำที่จำได้แล้ว = ไม่คิดคะแนน/ลีก (กันฟาร์ม)
        rgAllMasteredPending=true;        // เด้งหน้าฉลองหลัง render
        pool=allIdx.slice();
      }
    } else {
      pool=allIdx.slice();
    }
    // Lin 2026-07-13: SRS กรอง pool ก่อนแล้ว (ข้างบน) — เลือก "ลำดับ" ในรอบด้วย pickAdaptive
    // (เน้นคำที่เพิ่งพลาดบ่อยจาก reading_sessions ขึ้นมาก่อน ไม่ทับ/ไม่ยุ่ง SRS)
    if(window.READING_AUTH && typeof READING_AUTH.pickAdaptive==='function' && READING_AUTH.adaptiveReady && READING_AUTH.adaptiveReady()){
      var _items=pool.map(function(i){return {idx:i, th:WORDS[i].th};});
      var _picked=READING_AUTH.pickAdaptive(_items, Math.min(ROUND_SIZE,_items.length));
      roundQueue=_picked.map(function(p){return p.idx;});
    } else {
      roundQueue=shuffle(pool).slice(0,ROUND_SIZE);
    }
  }
  roundTotal=roundQueue.length;
  cur=0;okC=0;badC=0;streak=0;maxStreak=0;roundScore=0;cleanC=0;roundHadGuide=false;
  document.getElementById('end').style.display='none';
  document.getElementById('game').style.display='flex';
  refreshUI();
  loadWord();
  if(!window._minaWelcomed){ window._minaWelcomed=true; setTimeout(function(){minaToast('welcome',{dur:3400});},700); } // มีนาทักทายครั้งแรก — Lin 2026-07-10
  if(rgAllMasteredPending){ rgAllMasteredPending=false; setTimeout(rgShowAllMastered,300); } // กฎ15: เด้งฉลองหลังโหลดคำแรก
}

// แตกคำเป็นอาเรย์พยางค์ (พยางค์เดียว = อาเรย์ 1 ตัว)
function buildSyls(w){
  // Lin 2026-07-12: เพิ่ม read = คำอ่านของพยางค์ (จาก readingTH) ให้讀音โชว์คำอ่าน ไม่ใช่ตัวเขียน (แก้บั๊กเดียวกับเกมพิมพ์)
  var _reads=(w.readingTH?String(w.readingTH).split('-'):[]);
  if(w.syls&&w.syls.length)return w.syls.map(function(s,i){return {th:s.th,read:((_reads.length===w.syls.length&&_reads[i])?_reads[i]:s.th),cons:s.cons,vowel:s.vowel,tone:s.tone,final:s.final,lead:s.lead,cluster:s.cluster,tone_name:s.tone_name};});
  return [{th:w.th,read:(w.readingTH||w.th),cons:w.cons,vowel:w.vowel,tone:w.tone,final:w.final,lead:w.lead,cluster:w.cluster,tone_name:w.tone_name}];
}
// แถบบอกพยางค์ (โชว์เฉพาะคำหลายพยางค์)
function renderSylStrip(){
  var strip=document.getElementById('syl-strip');
  if(!strip)return;
  if(sylList.length<=1){strip.style.display='none';strip.innerHTML='';updateNextSylBtn();return;}
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
    strip.appendChild(c);
  });
  updateNextSylBtn();
}
// ปุ่ม「下一個音節」ตรงกลาง — ทางลัดเท่ากับกดแถบ syl-strip ของพยางค์ถัดไป กดง่ายกว่า ไม่ต้องหา
function updateNextSylBtn(){
  var b=document.getElementById('btn-next-syl');
  if(!b)return;
  var typingMode=(typeof RG_TYPE!=='undefined' && RG_TYPE.on); // โหมดพิมพ์ต่อเนื่อง ไม่ให้กระโดดเอง
  var show=sylList.length>1 && !typingMode && !checked && sylIdx<sylList.length-1;
  b.style.display=show?'':'none';
}
function loadWord(){
  wordToneBonus=0; // คำใหม่ = ล้างโบนัสวรรณยุกต์สะสมของคำก่อนหน้า — Lin 2026-07-07
  rememberStep=0;clearTimeout(rememberTimer);
  var rb=document.getElementById('btn-remember');
  if(rb){rb.textContent='已記得';rb.style.cssText='';rb.style.display='';}
  WORD=WORDS[roundQueue[cur]];
  sylList=buildSyls(WORD);
  sylIdx=0;wordHadWrong=false;wordFailed=false;wrongCount=0;sylCache=[]; // sylCache: เก็บ state แต่ละพยางค์ ให้เลือกพยางค์ไหนก่อนก็ได้ (คำใหม่ = ล้าง)
  sylWrongCount=new Array(sylList.length).fill(0); // งานที่1: ตัวนับผิดแยกรายพยางค์ (คำใหม่ = ล้าง)
  wordUsedGuide=false;curWordIsKnownCheck=false;    // งานที่3+7: ล้างสถานะต่อคำใหม่
  wordGolden=Math.random()<GOLDEN_WORD_CHANCE; // สุ่มคำทองใหม่ทุกคำ (Lin 2026-07-03)
  document.getElementById('qn').textContent=cur+1;
  document.getElementById('wth').textContent=WORD.th;
  document.getElementById('wzh').textContent=WORD.zh;
  document.getElementById('rev-pron').textContent=(rgPronMode&&WORD.th)?((WORD.readingTH||WORD.th)):''; // Lin 2026-07-16: โชว์คำอ่านตั้งแต่คำใหม่โหลดเลย ถ้าปุ่ม🐣/🥚เปิดอยู่ (ที่เฉลย showReveal/showRevealMulti ยังโชว์เสมอ ไม่เปลี่ยน) — ใช้ readingTH เสมอ (fallback=ตัวคำเอง) ห้ามใช้ syls[].th
  var _gb=document.getElementById('word-golden-badge');
  if(_gb)_gb.style.display=wordGolden?'':'none';
  // บอกระบบเสียงว่าคำปัจจุบันคือคำไหน — ปุ่ม 🔊 กด 1 ที = เล่นเสียงคำนี้ 1 ที (2026-07-16)
  if(window.WordAudio)WordAudio.setCurrent(WORD.th);
  // vault save button
  var vslot=document.getElementById('rg-vault-btn-slot');
  if(vslot && window.WordVault){
    WordVault.injectStyles();
    vslot.innerHTML='';
    vslot.appendChild(WordVault.createSaveBtn(WORD.th,{zh:WORD.zh,en:WORD.en,source:'reading-game'},{}));
    // refresh badge
    var badges=document.querySelectorAll('.vault-badge');
    badges.forEach(function(b){b.innerHTML='<img src="assets/icons/kratip-plain.svg" alt="" style="width:14px;height:18px;vertical-align:-4px;margin-right:3px;">單字庫';});
  }
  loadSyl();
}
// โหลด "1 พยางค์" — ใช้ logic ช่อง/ตัวเลือก/โบนัส เดิมทั้งหมด
function loadSyl(){
  var SY=sylList[sylIdx];
  W={th:SY.th,zh:WORD.zh,en:WORD.en,cons:SY.cons,vowel:SY.vowel,tone:SY.tone,final:SY.final,lead:SY.lead,cluster:SY.cluster,tone_name:SY.tone_name};
  checked=false;picks=[];bonusAnswered=false;selectedBonus=null; // wrongCount ย้ายไปนับระดับ "ทั้งคำ" แล้ว (reset ที่ loadWord)
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
  document.getElementById('banner').className='result-banner';
  document.getElementById('reveal').className='reveal';
  document.getElementById('bonus-result').textContent='';
  document.getElementById('bonus-reason').className='bonus-reason';
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
  var compDef={};
  // รอบ 1: หาคำตอบจริงของทุกช่องก่อน (correctVal) — ต้องรู้ครบก่อนถึงจะกันตัวลวงปลอมไม่ให้ไปซ้ำหน้าตากับคำตอบจริงช่องอื่นได้
  comps.forEach(function(comp){
    var ans,groups,pool2,ex=null;
    if     (comp==='cons' ){ans=W.cons;  groups=CONS_GROUPS;  pool2=CP; ex=W.lead||null;}
    else if(comp==='vowel'){ans=W.vowel; groups=VOWEL_GROUPS; pool2=VP;}
    else if(comp==='final'){ans=W.final; groups=FINAL_GROUPS; pool2=FP;}
    else                   {ans=W.tone;  groups=[TONE_POOL];  pool2=TONE_POOL;}
    compDef[comp]={ans:ans,groups:groups,pool2:pool2,ex:ex};
    correctVal[comp]=dispOpt(comp,ans);
  });
  // รอบ 2: สร้างตัวเลือกจริงจริง (ให้ avoid = คำตอบจริงของช่องอื่นทั้งหมด กันตัวลวงปลอมไปหน้าตาซ้ำ)
  comps.forEach(function(comp){
    var d=compDef[comp];
    var avoid=comps.filter(function(c){return c!==comp;}).map(function(c){return correctVal[c];});
    var raw=buildOpts(d.ans,comp,d.groups,d.pool2,oc[comp],d.ex,avoid);
    raw.forEach(function(o){optTiles.push({type:comp,val:dispOpt(comp,o)});});
  });
  optTiles=shuffle(optTiles);
  optTiles.forEach(function(t,i){t.id=i;});

  renderOptions(optTiles);
  // ป็อปอัพทายวรรณยุกต์: เฉพาะคำพยางค์เดียว (初級) — คำ 2 พยางค์ขึ้นไป (中/高級) ไม่ต้องกดทาย ได้ +1/พยางค์อัตโนมัติแทน (Lin 2026-07-04)
  if(sylList.length===1) showBonus();
  else document.getElementById('bonus-section').className='bonus-section';
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
    // t.val สระ = เสียงอ่านเต็มคำอยู่แล้ว (VOWEL_READ) ไม่ต้องแทรก base ก แบบสระสัญลักษณ์เดิม
    el.innerHTML=(t.type==='vowel')?t.val:dispHTML(t.val);

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
    // Lin 2026-07-15 (audit): ให้กดเลือกด้วยคีย์บอร์ด/โปรแกรมอ่านหน้าจอได้ ไม่ใช่แค่เมาส์/แตะ
    el.setAttribute('role','button');
    el.setAttribute('tabindex','0');
    el.onkeydown=function(e){ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); el.onclick(); } };
    pool.appendChild(el);
  });
  updateOptHint(); // ทาไฮไลต์ตัวเลือกที่ถูกทันทีที่ pool เพิ่งสร้างใหม่ (ถ้าเปิดคำใบ้)
}

// ─── Slot boxes ───
function updateSlots(){
  ['cons','vowel','final','tone'].forEach(function(c){
    if(comps.indexOf(c)<0)return;
    var box=document.getElementById('sb-'+c);
    if(!box)return;
    var id=slotFills[c];
    var t=(id!=null)?tileById(id):null;
    setSlotContent(box, t?t.val:null, t?'filled':null, c);
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
    setSlotContent(box, correctVal[c], uv===correctVal[c]?'correct':'wrong', c);
  });
  updateActiveSlot(); // ปลดไฮไลต์ช่องที่เล็งเมื่อเฉลยแล้ว
}

// ─── Check answer ───
// คะแนน/มาสเตอร์ ทำตอน "จบทั้งคำ" (รองรับหลายพยางค์)
function finalizeWord(){
  var srsKey=rgSrsKey(WORD);var b=document.getElementById('banner');
  var loggedIn=rgLoggedIn();

  // ── ผิดครบ 4 ครั้ง (fail) — งานที่1: เฉลย + เข้าคิว SRS ใหม่ ไม่ recycle ในรอบเดียวกันอีกต่อไป ──
  if(wordFailed){
    streak=0;
    if(loggedIn){
      var recF=RG_SRS.resetOnFail(rgSrsGet(srsKey));
      rgSrsSet(srsKey,recF);
    }
    if(curWordIsKnownCheck){
      curWordIsKnownCheck=false;
      b.textContent='看來還沒完全記熟，這個字先留在複習清單裡 🔁';b.className='result-banner show no';
    } else {
      b.textContent='綠色才是正確答案 — 這個字之後會再複習到';b.className='result-banner show no';
    }
    rgLogWord({failed:true,pts:0,srsDue:(loggedIn?(rgSrsGet(srsKey)&&rgSrsGet(srsKey).dueDate||''):'')});
    doSave();
    return;
  }

  // ── งานที่7: ด่านพิสูจน์ "已記得" — ต้องสะอาดจริง (ไม่มีพลาดแม้ครั้งเดียว + ไม่ใช้คำใบ้) ──
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
          TONE_SERVER.finishRound({ game:'reading', word:WORD.th, level:RG_LEVEL_TO_NUM[curLevel]||1, clean:passedClean, knownCheck:true });
      }catch(e){}
    }
    curWordIsKnownCheck=false;
    if(passedClean){ b.textContent='真的記得！這個字標記為熟練 ✓（不計分、不加幣）';b.className='result-banner show ok'; }
    else{ b.textContent='中途有出錯/用了提示，這個字先留在複習清單裡 🔁';b.className='result-banner show no'; }
    rgLogWord({mastered:!!passedClean,pts:0,srsDue:passedClean?'已精通':(loggedIn?(rgSrsGet(srsKey)&&rgSrsGet(srsKey).dueDate||''):'')});
    doSave();
    return;
  }

  // ── งานที่3: เปิดคำใบ้ระหว่างเช็คคำตอบ (พยางค์ใดก็ตาม) → 0 คะแนน + ไม่แตะ SRS เลย เหมือนยังไม่ได้ทำ ──
  if(wordUsedGuide){
    okC++;
    b.textContent='這次用了提示，先不計分（下次試試看不看提示！）';b.className='result-banner show half';
    rgLogWord({guide:true,pts:0,srsDue:(loggedIn?(rgSrsGet(srsKey)&&rgSrsGet(srsKey).dueDate||''):'')});
    doSave();
    return;
  }

  // ── กฎ MASTER: คะแนนต่อพยางค์เฉลี่ย (ดิบ ไม่คูณระดับที่นี่ — ไปคูณทั้งรอบตอนจบ) + 高 พยางค์ 8+ บวกดิบ ──
  var n=sylWrongCount.length;
  var avgCount=Math.min(n,HIGH_RAW_START_IDX);
  var sum=0,i;
  for(i=0;i<avgCount;i++) sum+=rgSyllableScore(sylWrongCount[i]);
  var avg=sum/avgCount;
  var rawBonus=0;
  for(i=HIGH_RAW_START_IDX;i<n;i++) rawBonus+=HIGH_RAW_BONUS_PER_SYL;
  var pts=Math.max(1,Math.round(avg+rawBonus));

  var clean=!wordHadWrong; // "สะอาด" ของ SRS = ไม่พลาดแม้ครั้งเดียวทั้งหน่วย (ตรงเกมเสียง) — ต่างจากคะแนนที่ยังให้บางส่วนได้แม้พลาด
  if(clean)cleanC++;
  var golden=(clean && wordGolden); // คำทอง: ตอบถูกครั้งแรกล้วนเท่านั้น
  if(golden)pts=pts*GOLDEN_WORD_MULT;
  streak++;if(streak>maxStreak)maxStreak=streak;
  // คอมโบ×แต้ม (สะอาดติดกัน) — streak รีเซ็ตเป็น 0 ทุกครั้งที่ผิด (check) → คำที่มีผิดจะ streak=1 ตัวคูณ=1
  var cmult=rgComboMult(streak);
  if(cmult>1)pts=Math.max(1,Math.round(pts*cmult));

  // ── กฎ MASTER ข้อ7 (แก้ 2026-07-05 ตาม Lin ยืนยัน): วันที่16 (ด่านตัดสินสุดท้ายของ SRS นำไปสู่ดาวเงินจริง) ได้คะแนนฐานตามปกติ ไม่ zero — ต่างจาก 已記得 (known-check) ที่ยังคง 0 แต้มเสมอ (ดูจุด curWordIsKnownCheck ด้านบน) ──
  var basePtsAwarded=pts;
  roundScore+=basePtsAwarded;okC++;
  var srsBonusAwarded=0; // เก็บโบนัสรอบทบทวน SRS ไว้รวมกับแบนเนอร์ตอนจบคำ — Lin 2026-07-07

  // ── Phase 4 (กันโกงดาว): ให้เซิร์ฟเวอร์เป็นคนตัดสิน+แจกดาวจริง (เกมสะกด: ดาว=สะกดถูก ไม่ใช่วรรณยุกต์) ──
  //   ยิงทุกรอบเหมือนเกมเสียง (clean/ไม่ clean) → เซิร์ฟเวอร์เลื่อน/รีเซ็ต SRS เอง → mastered แล้วแจกดาว
  //   คู่ขนาน ไม่รื้อ local · เน็ตล่ม/ไม่ล็อกอิน = เกมทำงานเหมือนเดิมทุกอย่าง
  try{
    if(loggedIn && window.TONE_SERVER && TONE_SERVER.available()){
      TONE_SERVER.finishRound({ game:'reading', word:WORD.th, level:RG_LEVEL_TO_NUM[curLevel]||1, clean:clean }).then(function(r){
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
      // โบนัสผ่านรอบทบทวน SRS สะอาด (+3/+2/+1) — เฉพาะ "ลูปแรกที่ผ่าน" (advanceOnClean เกิดครั้งเดียว/วัน) — day16 ยังได้ตามกฎข้อ6 แม้ฐานเป็น 0 (กฎข้อ7)
      var _rb=SRS_REVIEW_BONUS[passedStage]||0;
      if(_rb>0){ roundScore+=_rb; srsBonusAwarded=_rb; } // Lin 2026-07-10: เลิกยิง pop() แยก — รวมไปโชว์ก้อนเดียวกับคะแนนหลักด้านล่าง (เลือกแบบ C: ไม่มีไอคอน 🔁)
      if(res.justMastered){
        try{
          if(window.GAME_ACCOUNT && window.GAME_ACCOUNT.addHardStars){
            var lvNum=RG_LEVEL_TO_NUM[curLevel]||1;
            var _hs=GAME_ACCOUNT.addHardStars(res.clean,lvNum);
            totalStars=GAME_ACCOUNT.getStars();
            // toast แจ้งได้ดาวจริง (rule 12: รางวัลต้องเห็น) — ไม่โชว์ถ้าชนเพดาน (ได้ 0)
            try{ if(_hs && _hs.stars>0) rgToast('🎉 你真的記住「'+WORD.th+'」了！+'+_hs.stars+' ⭐'); }catch(e){}
            rgCheckLevelMastered(); // กฎ15: จำครบทั้งระดับไหม → เด้ง 全部精通
          }
        }catch(e){}
      }
    } else {
      rec=RG_SRS.resetOnFail(rec); // ผิดแม้ครั้งเดียว (ไม่ใช่แค่ fail เต็ม) = กลับวันแรกเสมอ ตรงเกมเสียง
    }
    rgSrsSet(srsKey,rec);
  }

  // ── รวมโบนัสทั้งหมดของ "คำนี้" (คะแนนหลัก + วรรณยุกต์ + SRS) เป็นก้อนเดียวตอนแสดงแบนเนอร์ตอนจบคำ (ทำเหมือนเกมพิมพ์ ตามที่ Lin สั่ง) — Lin 2026-07-07
  var dispPtsAwarded=basePtsAwarded+wordToneBonus+srsBonusAwarded;

  if(wordHadWrong){b.textContent='完成這個字！+'+dispPtsAwarded+' 分';b.className='result-banner show half';}
  else{b.textContent=rnd(['全部正確！🎉','太棒了！✨','非常好！🌟'])+(streak>=3?' 🔥連對'+streak:'')+(golden?' ✨黃金字':'')+' +'+dispPtsAwarded+' 分';b.className='result-banner show ok';}
  pop('+'+dispPtsAwarded+(golden?' ✨':''));
  // น้องมีนาพูด: คำทอง > คอมโบ > มีผิด(ปลอบ) > ถูก(สุ่ม) — Lin 2026-07-10
  if(golden) minaToast('golden');
  else if(streak===3||streak===5||streak===8) minaToast('combo');
  else if(wordHadWrong) minaToast('wrong',{throttle:true,chance:0.5});
  else minaToast('correct',{throttle:true});
  rgLogWord({pts:dispPtsAwarded,srsDue:(loggedIn&&typeof rec!=='undefined'&&rec)?(rec.dueDate||''):''});
  doSave();
}
function check(){
  if(rgGuideMode && !curWordIsKnownCheck)wordUsedGuide=true; // งานที่3: จับตั้งแต่ก่อนแยกพาธ ครอบคลุมทั้งพยางค์เดียวและหลายพยางค์ · แก้ 2026-07-04: ตอนกด 已記得 (โหมดพิสูจน์) คำใบ้ถูกซ่อนแล้ว ห้ามนับว่า "ใช้คำใบ้" ไม่งั้นมาร์ค熟練ไม่ได้เลยในโหมด有提示ค่าเริ่มต้น
  if(wordUsedGuide)roundHadGuide=true; // Lin 2026-07-04: ใช้คำใบ้แม้ครั้งเดียว = ทั้งรอบเป็นโหมดฝึกฝน ไม่แจกโบนัสจบรอบ/ดาว
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
      b.textContent='音節 '+(sylIdx+1)+' 完成 ✓ 接著拼下一個音節';b.className='result-banner show ok';
      document.getElementById('btn-next').textContent='下一個音節 →';
    }
    document.getElementById('ok').textContent=okC;document.getElementById('bad').textContent=badC;
    refreshUI();
  } else {
    wrongCount++;wordHadWrong=true;streak=0;badC++;
    sylWrongCount[0]=wrongCount; // งานที่1: sylList.length===1 เสมอในพาธนี้ → พยางค์เดียว = sylIdx 0
    refreshUI(); // Lin 2026-07-06: หลอด 本題分數 ลดสด+ไล่สีตอนกดผิด
    if(wrongCount < 4){
      // ผิดครั้งที่ 1/2/3 → กระพริบตัวที่ผิด, เคลียร์, ลองใหม่ (งานที่1: เพิ่มจาก 3→4 ครั้งก่อน fail)
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
      hint.textContent=wrongCount>=3?'再一次就好，米娜相信你 💛':'沒關係～再看看，換一個試試 🌱';
      hint.className='retry-hint show';
      document.getElementById('ok').textContent=okC;
      document.getElementById('bad').textContent=badC;
      updateCombo();
    } else {
      // ผิดครั้งที่ 4 → เฉลยพยางค์นี้ · คำนี้ถือว่าพลาด (งานที่1: เดิม 3 ครั้ง)
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
        b.textContent='這個音節再看一下 — 綠色才對，接著拼下一個音節';b.className='result-banner show no';
        document.getElementById('btn-next').textContent='下一個音節 →';
      }
      document.getElementById('ok').textContent=okC;
      document.getElementById('bad').textContent=badC;
      updateCombo();refreshUI();
    }
  }
}

// ─── Bonus tone question ───
var TONE_ZH={'สามัญ':'第一聲','เอก':'第二聲','โท':'第三聲','ตรี':'第四聲','จัตวา':'第五聲'};

function showBonus(){
  if(!W.tone_name)return;
  selectedBonus=null;
  var sec=document.getElementById('bonus-section');
  sec.className='bonus-section show';
  var box=document.getElementById('bonus-opts');
  box.innerHTML='';
  document.getElementById('bonus-result').textContent='';
  document.getElementById('bonus-reason').className='bonus-reason';
  BONUS_TONES.forEach(function(t){
    var btn=document.createElement('button');
    btn.className='bonus-btn';
    btn.dataset.tone=t.name;
    btn.innerHTML=t.num;
    btn.onclick=function(){
      if(bonusAnswered)return;  // locked after 檢查
      // toggle selection
      if(selectedBonus===t.name){
        selectedBonus=null;
        btn.classList.remove('sel');
      } else {
        box.querySelectorAll('.bonus-btn').forEach(function(b){b.classList.remove('sel');});
        selectedBonus=t.name;
        btn.classList.add('sel');
      }
    };
    box.appendChild(btn);
  });
}

// Called by check() — locks buttons and shows result
function evaluateBonus(){
  if(bonusAnswered||!W.tone_name)return;
  bonusAnswered=true;
  var box=document.getElementById('bonus-opts');
  var res=document.getElementById('bonus-result');
  box.querySelectorAll('.bonus-btn').forEach(function(b){
    b.classList.add('locked');
    if(b.dataset.tone===W.tone_name) b.classList.add('correct');
  });
  var tZH=TONE_ZH[W.tone_name]||W.tone_name;
  if(selectedBonus===W.tone_name){
    var toneScored=!wordUsedGuide && !curWordIsKnownCheck; // Lin 2026-07-04: โหมดฝึกฝน(有提示)/พิสูจน์(已記得) = ไม่ได้แต้มโบนัสเสียง
    if(toneScored){ roundScore+=1; wordToneBonus+=1; pop('+1 ✨'); refreshUI(); } // wordToneBonus: รวมกับคะแนนหลักตอนแบนเนอร์ตอนจบคำ — Lin 2026-07-07
    res.textContent='正確！是'+tZH+(toneScored?' 🎉 +1 分':' 🎉（練習模式不計分）');
    res.style.color='#2e7d32';
    box.querySelector('[data-tone="'+W.tone_name+'"]').classList.add('correct');
  } else if(selectedBonus){
    box.querySelector('[data-tone="'+selectedBonus+'"]').classList.add('wrong');
    res.textContent='不對，是'+tZH+'，沒扣分，繼續加油！';
    res.style.color='#b06020';
  } else {
    res.textContent='（未作答）正確答案是'+tZH;
    res.style.color='#888';
  }
  renderBonusReason(W);
}

function skip(){nextWord();} // (เลิกใช้ — ปุ่ม 跳過 ถูกลบแล้ว) เก็บฟังก์ชันไว้กันโค้ดเดิมอ้างถึง
// งานที่7 (2026-07-04 แบบเข้ม ลอกเกมเสียง markKnown()): กดแล้ว "ไม่ตัดคำทันที" —
// ต้องตอบคำนี้ต่อให้ผ่านแบบสะอาด (ไม่ผิดเลย ไม่ใช้คำใบ้) 1 ครั้งก่อน ถึงจะตัดคำออก (ดู finalizeWord curWordIsKnownCheck)
function remember(){
  curWordIsKnownCheck=true;
  updateActiveSlot();updateOptHint(); // ซ่อนคำใบ้ที่อาจค้างอยู่ทันที
  var b=document.getElementById('banner');
  if(b){b.textContent='證明你真的記得：接下來不會有提示，答對才會標記熟練 ✓';b.className='result-banner show';}
  var rb=document.getElementById('btn-remember');
  if(rb)rb.style.display='none';
}
function next(){
  if(sylIdx<sylList.length-1){sylIdx++;loadSyl();}  // ไปพยางค์ถัดไปของคำเดิม
  else nextWord();                                   // จบคำ → คำถัดไป
}

function nextWord(){
  cur++;
  if(cur>=roundQueue.length){endRound();return;}
  loadWord();
}

function endRound(){
  document.getElementById('game').style.display='none';
  document.getElementById('end').style.display='flex';
  document.getElementById('pf').style.width='100%';
  document.getElementById('prog-txt').textContent=roundQueue.length+'/'+roundQueue.length;
  // กฎ MASTER: คำใบ้เป็น "รายคำ" แล้ว (คำที่ใช้ใบ้ได้ 0 แต้ม เอง) — ไม่มี void ทั้งรอบอีกต่อไป
  // ?word= (ฝึกคำเดียวจากคลัง) = ไม่ให้โบนัสจบรอบ/ไม่ส่งลีก/ไม่นับชาเลนจ์ (กันปั๊ม) — G
  var practiceMode=isWordPractice;
  // โบนัสจบรอบ: +20 ทุกครั้งที่จบ · +50 เพิ่มถ้า perfect (cleanC===roundTotal)
  var roundBonus=0;
  if(roundTotal>0 && !practiceMode){
    roundBonus+=ROUND_COMPLETE_BONUS;
    if(cleanC===roundTotal)roundBonus+=ROUND_PERFECT_BONUS;
  }
  roundScore+=roundBonus;
  // กฎ MASTER: คูณตัวคูณระดับ "ทั้งรอบรวมโบนัส" ตอนจบ (เลิกคูณต่อคำ)
  var levelWeight=LEVEL_WEIGHT[curLevel]||1;
  var weightedScore=Math.round(roundScore*levelWeight);
  // ── ?word= ฝึกคำเดียว: โชว์คะแนนดิบ ไม่ส่งลีก/ไม่แตะดาวรอบ/ชาเลนจ์/สตรีค ──
  if(practiceMode){
    document.getElementById('end-score').textContent='練習模式';
    document.getElementById('end-detail').textContent='💡 單字練習・本輪不計分（想拿分數，請從遊戲首頁開始一輪）';
    try { rgRenderGameBar(); } catch(e){}
    refreshUI();
    setTimeout(function(){ if (window.VocabPopup) window.VocabPopup.maybe(); }, 1100);
    return;
  }
  document.getElementById('end-score').textContent=weightedScore+' 分'+(levelWeight!==1?'（'+curLevel+'級 ×'+levelWeight+'）':'');
  var _isPerfect = (cleanC === roundTotal && roundTotal > 0);
  var detail='';
  // ⭐ ดาวเงินแจกตอน mastered ใน finalizeWord แล้ว (มี toast) — จอจบรอบเหลือแค่ฉลอง perfect + สรุป
  if(window.GAME_ACCOUNT){ GAME_ACCOUNT.bumpStreakToday(); totalStars=GAME_ACCOUNT.getStars(); totalBadges=GAME_ACCOUNT.earnedBadges().length; }
  doSave();
  if(_isPerfect){
    detail='完美一輪！✨ 全部 '+roundTotal+' 題答對 · 累積共 '+totalStars+' 顆星';
    var sb=document.createElement('div');sb.className='star-burst';sb.textContent='⭐';
    document.body.appendChild(sb);
    setTimeout(function(){if(sb.parentNode)sb.parentNode.removeChild(sb);},2200);
  } else {
    detail='答對 '+cleanC+'/'+roundTotal+' 題全對 · 累積共 '+totalStars+' 顆星 · 全對可拿完成獎勵！';
  }
  if(roundBonus)detail+='・含完成獎勵 +'+roundBonus;
  document.getElementById('end-detail').textContent=detail;
  try{ if(window.READING_AUTH && READING_AUTH.saveScore) READING_AUTH.saveScore(weightedScore,1,'reading',rgWrongItemsFromLog()); }catch(e){}   // เฟส 2: เซฟแต้มขึ้นลีกเกมอ่าน (ถ้าล็อกอิน) · ระบุเกมชัดเจน — 2026-07-02 · เฟส 3: แนบคำที่พลาด — 2026-07-13
  // ── weekly challenge + streak freeze ──
  var _maxCombo = maxStreak; // max combo ที่ทำได้ในรอบนี้
  try { rgChallengeBump(_maxCombo, _isPerfect); } catch(e){}
  try { var _sv = rgApplyStreak(); if(_sv.events.freezeUsed) rgToast('護盾幫你保住連續紀錄！🛡️'); if(_sv.events.freezeEarned) rgToast('獲得新護盾 🛡️ ×1！連續'+_sv.state.streak+'天'); } catch(e){}
  try { rgRenderGameBar(); } catch(e){}
  refreshUI();
  // เกมฟรี: นับรอบ + เด้งคำเชิญ "ขอ單字速查表" ครั้งเดียวหลัง ~5 รอบ (ปิดได้เล่นต่อ · เหมือนเกมเสียง)
  setTimeout(function(){ if (window.VocabPopup) window.VocabPopup.maybe(); }, 1100);
}

function restart(){initGame();}

// ════════════════════════════════════════════
// PDF 報告（本輪打過的字 + 錯誤分析 + SRS下次複習日期）— Lin 2026-07-07
// วิธีเดียวกับ typing-game.html: render เป็น HTML ก่อน → html2canvas ถ่ายเป็นรูป → jsPDF (ฟอนต์มาตรฐาน jsPDF ไม่รองรับไทย/จีน)
// ════════════════════════════════════════════
function _rgLoadScript(url){
  return new Promise(function(resolve,reject){
    if(document.querySelector('script[src="'+url+'"]')){ resolve(); return; }
    var s=document.createElement('script'); s.src=url;
    s.onload=resolve; s.onerror=reject;
    document.head.appendChild(s);
  });
}
function rgDownloadReport(){
  var btn=document.getElementById('rg-pdf-btn');
  if(btn){btn.disabled=true;btn.textContent='📄 產生中…';}
  Promise.all([
    _rgLoadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js'),
    _rgLoadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js')
  ]).then(function(){
    var SERIF="'Noto Serif TC','PingFang TC',serif";
    var SANS="'Noto Sans TC','PingFang TC',sans-serif";
    var today=new Date().toLocaleDateString('zh-TW',{year:'numeric',month:'2-digit',day:'2-digit'});
    var levelWeight=LEVEL_WEIGHT[curLevel]||1;
    var weightedScore=Math.round(roundScore*levelWeight);
    var loggedIn=rgLoggedIn();

    function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
    function statusLabel(w){
      if(w.mastered) return '<span style="color:#8B6310;">✓ 已精通</span>';
      if(w.guide) return '<span style="color:#b06020;">💡 用提示</span>';
      if(w.failed) return '<span style="color:#c62828;">✗ 待加強</span>';
      return '<span style="color:#2e7d32;">✓ 答對</span>';
    }
    var rows=roundLog.map(function(w,i){
      return '<tr>'
        +'<td style="padding:7px 6px;font-size:12px;color:#888;text-align:center;">'+(i+1)+'</td>'
        +'<td style="padding:7px 6px;font-size:15px;font-weight:700;">'+esc(w.th)+'</td>'
        +'<td style="padding:7px 6px;font-size:12px;color:#666;">'+esc(w.zh)+'</td>'
        +'<td style="padding:7px 6px;font-size:12px;text-align:center;">'+statusLabel(w)+'</td>'
        +'<td style="padding:7px 6px;font-size:12px;text-align:center;">'+(w.wrong||0)+'</td>'
        +'<td style="padding:7px 6px;font-size:12px;text-align:center;font-weight:700;color:#8B6310;">+'+(w.pts||0)+'</td>'
        +'<td style="padding:7px 6px;font-size:11px;text-align:center;color:#8B6310;">'+(w.mastered?'已精通':(w.srsDue?w.srsDue:(loggedIn?'—':'未登入')))+'</td>'
        +'</tr>';
    }).join('');

    var weak=roundLog.filter(function(w){return (w.wrong||0)>0;}).sort(function(a,b){return (b.wrong||0)-(a.wrong||0);}).slice(0,8);
    var weakHtml = weak.length
      ? weak.map(function(w){return '<span style="display:inline-block;background:#fff3d8;border:1px solid #e8c070;border-radius:8px;padding:4px 10px;margin:3px;font-size:12px;">'+esc(w.th)+'（錯 '+w.wrong+' 次）</span>';}).join('')
      : '<span style="font-size:12px;color:#888;">這輪沒有打錯的字，太棒了！🎉</span>';

    var wrap=document.createElement('div');
    wrap.style.cssText='position:fixed;left:-9999px;top:0;width:640px;padding:24px;background:#FBF5E7;box-sizing:border-box;font-family:'+SERIF+';color:#1C1C1C;';
    wrap.innerHTML =
      '<div style="background:#fff;border:1px solid #C8973A;">'
      +'<table style="width:100%;background:#1C1C1C;border-bottom:3px solid #C8973A;border-collapse:collapse;"><tr>'
      +'<td style="padding:22px 26px;vertical-align:top;">'
      +'<div style="color:#fff;font-size:20px;font-weight:700;font-family:'+SERIF+';">泰語閱讀練習・本輪報告</div>'
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
      +'<th style="font-size:11px;color:#8B6310;padding:5px;">下次複習</th>'
      +'</tr></thead><tbody>'+rows+'</tbody></table>'
      +'<hr style="border:none;border-top:1px solid rgba(139,99,16,0.2);margin:14px 0;">'
      +'<div style="font-size:13px;font-weight:700;color:#8B6310;margin-bottom:6px;">⚠️ 弱點分析（打錯最多的字）</div>'
      +'<div>'+weakHtml+'</div>'
      +(loggedIn?'':'<div style="margin-top:12px;font-size:11px;color:#b06020;">💡 登入後系統會記住每個字的複習進度，下次能從弱點練起</div>')
      +'</div></div>'
      +'<div style="text-align:center;font-family:'+SANS+';font-size:9.5px;letter-spacing:0.15em;color:#8B6310;padding:16px 26px 4px;">泰華眼裡的泰語教學　·　mrtaihualin.com</div>';
    document.body.appendChild(wrap);

    return document.fonts.ready.then(function(){
      return html2canvas(wrap,{scale:2,useCORS:true,backgroundColor:'#ffffff',logging:false}).then(function(canvas){
        document.body.removeChild(wrap);
        var jsPDF=window.jspdf.jsPDF;
        var imgW=canvas.width/2, imgH=canvas.height/2;
        var pdf=new jsPDF({orientation:'portrait',unit:'px',format:[imgW,imgH]});
        pdf.addImage(canvas.toDataURL('image/jpeg',0.92),'JPEG',0,0,imgW,imgH);
        pdf.save('閱讀練習報告_'+RG_SRS.twDate()+'.pdf');
      });
    });
  }).catch(function(e){
    console.warn('PDF 產生失敗',e);
    try{ rgToast('產生 PDF 失敗，請稍後再試 🙏'); }catch(e2){ alert('產生 PDF 失敗，請稍後再試'); }
  }).then(function(){
    if(btn){btn.disabled=false;btn.textContent='📄 下載 PDF 報告';}
  });
}

// ── กฎ15: จำครบทั้งระดับ (全部精通) — ลอกแพทเทิร์นเกมเสียง tfShowAllMastered ──
// นับคำเกมอ่านต่อระดับ (ไว้เทียบ newWordsCount + mark ตอนจำครบ)
function rgLevelWordCount(lv){
  var c=0;
  for(var i=0;i<WORDS.length;i++){
    var w=WORDS[i];
    var inLv = (lv==='高')?(w.level==='高'):(lv==='中')?(w.level==='中'):(w.level==='初'); // Lin 2026-07-15: เช็ค w.level ตรงๆ แทน w.syls (ดูเหตุผลที่ inLevel() ข้างบน)
    if(inLv)c++;
  }
  return c;
}
// เรียกจาก finalizeWord ตอน justMastered — ตรวจเฉย ๆ (เด้งจริงตอนเริ่มรอบใหม่ใน initGame เหมือนเกมเสียง)
function rgCheckLevelMastered(){ /* detection อยู่ที่ initGame (เริ่มรอบถัดไป) — stub กัน ReferenceError */ }
function rgShowAllMastered(){
  var old=document.getElementById('rg-allmaster-ov'); if(old)old.remove();
  var div=document.createElement('div');
  div.id='rg-allmaster-ov';
  div.style.cssText='position:fixed;inset:0;background:rgba(45,42,34,0.5);display:flex;align-items:center;justify-content:center;z-index:10050;padding:20px;';
  div.innerHTML='<div style="background:#fff;border-radius:18px;max-width:340px;width:100%;padding:28px 24px;text-align:center;font-family:\'Noto Sans TC\',sans-serif;">'+
    '<div style="font-size:46px;line-height:1;margin-bottom:8px;">🏆🌾</div>'+
    '<div style="font-size:22px;font-weight:900;color:#8B6310;margin-bottom:6px;">全部精通！</div>'+
    '<div style="font-size:14px;color:#555;line-height:1.7;margin-bottom:16px;">這個等級的字，你<b>全部都記住了</b>，太厲害了！🎉<br>星星已經收進你的收藏囉～</div>'+
    '<div style="display:flex;flex-direction:column;gap:8px;">'+
      '<button class="btn btn-primary" id="rg-am-review">繼續複習（不計分）</button>'+
      '<button class="btn btn-secondary" id="rg-am-level">挑戰其他等級</button>'+
    '</div></div>';
  div.addEventListener('click',function(e){if(e.target===div)div.remove();});
  document.body.appendChild(div);
  document.getElementById('rg-am-review').onclick=function(){div.remove();};
  document.getElementById('rg-am-level').onclick=function(){div.remove();var el=document.getElementById('end');if(el)el.style.display='none';var g=document.getElementById('game');if(g)g.style.display='none';window.scrollTo(0,0);};
}

// ── GA: 遊戲結束 → 預約 / 聲調遊戲 追蹤（標準模式才會記錄）──
function trackBookCTA(){try{if(typeof gtag==='function')gtag('event','book_trial_click',{method:'reading_game_end'});}catch(e){}}
function trackToneLink(){try{if(typeof gtag==='function')gtag('event','game_link_click',{target:'games_hub',from:'reading_game'});}catch(e){}} // ปุ่มนี้ลิงก์ไป games.html จริง → target ต้องเป็น games_hub — แก้ 2026-07-02

// ════════════════════════════════════════════
// UI HELPERS
// ════════════════════════════════════════════
function refreshUI(){
  var wsMax=SYL_SCORE[0]||10, wsSc=wordUsedGuide?0:rgCurSyllableScore();
  var wsFill=document.getElementById('rg-ws-fill');
  if(wsFill){ wsFill.style.width=Math.max(0,Math.min(100,wsSc/wsMax*100))+'%'; wsFill.style.background=rgScoreBarColor(wsSc,wsMax); }
  var wsNum=document.getElementById('rg-ws-num'); if(wsNum)wsNum.textContent=wsSc;
  document.getElementById('pf').style.width=(cur/Math.max(1,roundQueue.length)*100)+'%';
  document.getElementById('prog-txt').textContent=cur+'/'+roundQueue.length;
  document.getElementById('qt').textContent=roundQueue.length;
  document.getElementById('star-count').textContent=totalStars;
  document.getElementById('badge-count').textContent=totalBadges;
  document.getElementById('badge-emoji').textContent=badgeEmoji(totalBadges);
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
  if(mode==='normal'){if(re)re.style.display='';ch.style.display='';ch.disabled=true;nx.style.display='none';}
  else               {if(re)re.style.display='none';ch.style.display='none';nx.style.display='';}
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
  document.getElementById('rev-pron').textContent=_pron?(_pron):'';
  var box=document.getElementById('reveal-rules');
  box.innerHTML='';
  // ข้ามการพิมพ์ซ้ำ "เฉพาะเมื่อ" แผงวรรณยุกต์ (#bonus-reason) โชว์คำอธิบายจริงๆ อยู่แล้วเท่านั้น
  // Lin 2026-07-12: แก้บั๊กคำอธิบายหาย (圖3) — เดิมเช็คแค่ #bonus-section โชว์ไหม แต่บางคำ #bonus-reason ว่างเปล่า → เลย skip ทิ้งจนไม่มีคำอธิบายเลย (แก้ทั้งเกมพิมพ์+เกมอ่าน)
  var _bSec=document.getElementById('bonus-section');
  var _bRea=document.getElementById('bonus-reason');
  var bonusShowing=_bSec.classList.contains('show') && _bRea && _bRea.classList.contains('show') && _bRea.innerHTML.trim()!=='';
  if(!bonusShowing){
    var rules=buildRevealRules(W);
    rules.forEach(function(r){
      var row=document.createElement('div');row.className='rule-row';
      var tag=document.createElement('span');tag.className='rule-tag'+(r.sp?' sp':'');tag.textContent=r.tag;
      var txt=document.createElement('span');txt.className='rule-txt';txt.innerHTML=r.text;
      row.appendChild(tag);row.appendChild(txt);box.appendChild(row);
    });
  }
  document.getElementById('reveal').className='reveal show';
}
// 打完整句（多音節）— 顯示「整句」的子音/母音/尾音分析＋泰文讀法，不是只顯示最後一個音節而已 — เหมือนเกมพิมพ์ (showRevealMulti) — Lin 2026-07-12
function showRevealMulti(){
  var _pronM=buildThaiPron();
  document.getElementById('rev-pron').textContent=_pronM?(_pronM):'';
  // Lin 2026-07-12 (圖3 unify): คำอธิบายอยู่ "ในกล่องพยางค์" (#bonus-reason ของกล่องสุดท้าย) เสมอ — เลิกใช้แผงแยก #reveal
  var box=document.getElementById('bonus-reason');
  box.innerHTML='';
  sylList.forEach(function(SY,i){
    var head=document.createElement('div');
    head.className='rule-row';
    head.style.cssText='margin-top:'+(i===0?'0':'6px')+';font-weight:800;color:#8B6310;';
    head.textContent='📍 '+SY.th+(SY.tone_name?'（'+(TONE_ZH[SY.tone_name]||SY.tone_name)+'）':'');
    box.appendChild(head);
    var rules=buildRevealRules(SY);
    rules.forEach(function(r){
      var row=document.createElement('div');row.className='rule-row';
      var tag=document.createElement('span');tag.className='rule-tag'+(r.sp?' sp':'');tag.textContent=r.tag;
      var txt=document.createElement('span');txt.className='rule-txt';txt.innerHTML=r.text;
      row.appendChild(tag);row.appendChild(txt);box.appendChild(row);
    });
  });
  box.className='bonus-reason show';
  var _sec=document.getElementById('bonus-section'); if(_sec)_sec.className='bonus-section show';
  var _rv=document.getElementById('reveal'); if(_rv)_rv.className='reveal';
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
  {min:16,emoji:'🏆',label:'泰語拼讀大師！'},
  {min:20,emoji:'💎',label:'鑽石等級！'},
  {min:30,emoji:'👑',label:'泰語之王！'}
];
function badgeEmoji(n){var e='🌱';BADGE_STAGES.forEach(function(s){if(n>=s.min)e=s.emoji;});return e;}
function openBadge(){
  // ⭐ แบดจ์พันธุ์ข้าว ตามดาวรวม (รวมกับเกมเสียง) — Lin 2026-06-27
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
}

// ════════════════════════════════════════════
// START
// ════════════════════════════════════════════
// ════════════════════════════════════════════════
// WEEKLY CHALLENGE + STREAK FREEZE (เหมือนเกมเสียง)
// share TF_STREAK_KEY → streak/freeze ข้ามเกมได้
// ════════════════════════════════════════════════
var TF_STREAK_KEY = 'tf_streak_v1';   // key เดียวกับ tone-finder
var RG_GAME_CFG = {
  DAILY_GOAL_SETS: 3,
  STREAK_FREEZE_EARN_EVERY: 7,
  STREAK_FREEZE_MAX: 2
};
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
function rgLoadStreak() { try { return JSON.parse(localStorage.getItem(TF_STREAK_KEY) || '{}') || {}; } catch(e) { return {}; } }
function rgSaveStreak(s) { try { localStorage.setItem(TF_STREAK_KEY, JSON.stringify(s)); } catch(e) {} }
// งานที่8 (2026-07-04): ล็อก timezone ไต้หวัน (Asia/Taipei) ทุกจุดที่ตัดสินวัน — เดิมใช้เวลาเครื่องผู้เล่นตรงๆ (ผิดสเปกข้อ0)
function rgTodayStr() { try{ return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei'}).format(new Date()); }catch(e){ var d=new Date(); return d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2); } }
function rgApplyStreak() {
  var s = rgLoadStreak(), cfg = RG_GAME_CFG, today = rgTodayStr();
  var yest = RG_SRS.twDatePlusDays(Date.now(),-1);
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

// กฎ15: แบนเนอร์ "มีคำศัพท์ใหม่" — เด้งเฉพาะคนที่เคยจำครบระดับนั้น (newWordsCount>0)
function rgNewN(lv){ try{ return (window.GAME_ACCOUNT)?GAME_ACCOUNT.newWordsCount('reading',RG_LEVEL_TO_NUM[lv]||1, rgLevelWordCount(lv)):0; }catch(e){ return 0; } }
function rgRenderNewWordBanner(){
  var el=document.getElementById('rg-newword-banner'); if(!el)return;
  var total=rgNewN('初')+rgNewN('中')+rgNewN('高');
  el.innerHTML= total>0 ? '<div style="background:#fdecea;border:1px solid #e24b4a;border-radius:10px;padding:10px 14px;margin-bottom:12px;font-family:\'Noto Sans TC\',sans-serif;font-size:13.5px;color:#a32d2d;text-align:center;font-weight:700;box-sizing:border-box;">🆕 有新單字上架囉！快來練習吧 ✨</div>' : '';
}
// CTA ล็อกอิน (กฎ13) — โชว์เฉพาะตอนยังไม่ล็อกอิน · สั้น + ปุ่ม 更多福利 กางดูสิทธิพิเศษ
function rgRenderLoginCTA(){
  var el=document.getElementById('rg-cta-login'); if(!el)return;
  if(rgLoggedIn()){ el.innerHTML=''; return; }
  el.innerHTML='<div style="background:#FAEEDA;border:0.5px solid #EF9F27;border-radius:12px;padding:12px 14px;margin-bottom:12px;font-family:\'Noto Sans TC\',sans-serif;box-sizing:border-box;">'+
    '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">'+
      '<span style="font-size:14px;color:#633806;font-weight:700;flex:1;min-width:180px;">😊 先玩玩看也可以喔～登入後米娜才幫你把進度記起來 🌾</span>'+
      '<button onclick="rgCtaLogin()" style="background:#BA7517;color:#fff;border:none;font-weight:700;padding:6px 16px;border-radius:8px;font-size:13px;cursor:pointer;">登入解鎖 →</button>'+
      '<button onclick="var d=document.getElementById(\'rg-cta-detail\');var s=d.style.display===\'none\';d.style.display=s?\'block\':\'none\';this.textContent=s?\'收起 ▲\':\'更多福利 ▾\';" style="background:transparent;border:none;color:#854F0B;font-size:13px;cursor:pointer;font-weight:700;">更多福利 ▾</button>'+
    '</div>'+
    '<div id="rg-cta-detail" style="display:none;margin-top:10px;border-top:0.5px solid #EF9F27;padding-top:10px;font-size:13px;color:#633806;line-height:1.8;">'+
      '✅ 登入後可以：<br>⭐ 累積星星＋泰國米勳章或其他禮物<br>🧠 智慧複習：記住你哪些字學會了、哪些還要練，到期自動幫你排進來<br>🏆 登上排行榜和大家一起比<br>📈 下次打開，直接讓你學習你的弱點'+
    '</div></div>';
}
// เปิด modal ล็อกอิน (ใช้ปุ่มล็อกอินเดิมของ auth-widget)
function rgCtaLogin(){ try{ var b=document.querySelector('#rg-login-slot button'); if(b){b.click();return;} }catch(e){} if(window.READING_AUTH&&READING_AUTH.openLogin)READING_AUTH.openLogin(); }

// render challenge banner + streak chips
function rgRenderGameBar() {
  try{ rgRenderNewWordBanner(); rgRenderLoginCTA(); }catch(e){}
  var cp = rgChallengeState(), st = rgLoadStreak();
  var pct = Math.min(100, Math.round(cp.st.progress / cp.ch.target * 100));
  var daysLeft = Math.max(0, Math.ceil((rgWeekEndMs() - Date.now()) / 86400000));
  var alive = st.streak > 0 && (st.lastPlay === rgTodayStr() || RG_SRS.twDatePlusDays(Date.now(),-1) === st.lastPlay);
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

// ════════════════════════════════════════════
// น้องมีนา 米娜 — บทพูด + ป๊อปพูดสด (โทนจีนไต้หวันอุ่นๆ ไกด์อ่อนโยน วิญญาณเซริกะ) — Lin 2026-07-10
// ⚠️ ใช้ emoji 👧🏻 ชั่วคราว · ห้ามโคลนเสียงคนจริง (นี่คือบทข้อความ ไม่ใช่ TTS)
// ════════════════════════════════════════════
var MINA_EMOJI='👧🏻';
var MINA_LINES={
  welcome:['哈囉～我是米娜 🌾 我們一起把泰文拼讀變厲害，好不好？','嗨嗨～我是米娜，今天也一起慢慢練吧 😊'],
  correct:['哇～拼對了呢，你做得很好 ✨','對了對了！就是這樣拼 🌾','很好喔～你越來越有手感了 😊'],
  combo:['哇～連續拼對，米娜都替你開心 🔥','停不下來了呢，好厲害 ⚡'],
  golden:['這個字…是可以吃的喔！米娜最喜歡了 😋 分數加倍！'],
  wrong:['沒關係的…這個字米娜以前也搞混過，我們再看一次好嗎？','再試一次就好，米娜陪你 💛','慢慢來，看清楚綠色的就懂了 🌱'],
  perfect:['全部一次就拼對！你比自己想的還厲害喔 🌾 米娜給你拍拍手 👏','一題都沒錯～好棒，米娜好開心 ✨']
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
    picks:picks.slice(), needN:needN, slotSeq:slotSeq.slice(),
    bonusAnswered:bonusAnswered, selectedBonus:selectedBonus
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
// คำ 2 พยางค์ขึ้นไป (中/高級) ไม่มีป็อปอัพทายวรรณยุกต์แล้ว — ซ่อน section นี้ไว้เสมอ (Lin 2026-07-04)
function rgRenderBonusForSyl(cachedAnswered,cachedSelected){
  document.getElementById('bonus-section').className='bonus-section';
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
  rgRenderBonusForSyl(st.bonusAnswered,st.selectedBonus);
  document.getElementById('btn-check').disabled=!rgAllSylsFilled();
}
function rgGotoSyl(idx){
  if(sylList.length<=1)return; // พยางค์เดียวไม่ต้องสลับ
  if(idx===sylIdx || checked)return; // เช็คคำตอบไปแล้ว ไม่ให้สลับอีก (กันงง)
  sylCache[sylIdx]=rgCaptureSylState();
  sylIdx=idx;
  var target=sylCache[idx];
  document.getElementById('banner').className='result-banner';
  document.getElementById('retry-hint').className='retry-hint';
  document.getElementById('reveal').className='reveal';
  setGameBtns('normal');
  if(target){ rgRestoreSylState(target); }
  else { loadSyl(); } // ยังไม่เคยแวะพยางค์นี้ → สร้างใหม่แบบเดิม (ตัวลวงสุ่มครั้งแรกครั้งเดียว)
  renderSylStrip();
}
// คำ 2 พยางค์ขึ้นไป: ไม่ต้องกดทายวรรณยุกต์แล้ว — ตอบพยางค์ไหนถูก ได้ +1 คะแนน/พยางค์อัตโนมัติ (แทน popup +3 เดิม) — Lin 2026-07-04
function rgFinalizeAllBonuses(){
  sylCache[sylIdx]=rgCaptureSylState();
  var n=0;
  for(var i=0;i<sylList.length;i++){
    var st=sylCache[i];
    if(!st)continue;
    var syOk=st.comps.every(function(c){
      var id=st.slotFills[c]; if(id==null)return false;
      var t=null; for(var k=0;k<st.optTiles.length;k++){ if(st.optTiles[k].id===id){t=st.optTiles[k];break;} }
      return t && t.val===st.correctVal[c];
    });
    if(syOk)n++;
  }
  if(n>0 && !wordUsedGuide && !curWordIsKnownCheck){ roundScore+=n; pop('+'+n+' ✨'); } // Lin 2026-07-04: โหมดฝึกฝน(有提示)/พิสูจน์(已記得) = ไม่ได้แต้มโบนัสพยางค์
  refreshUI();
}
// สลับไปพยางค์ idx อย่างปลอดภัย ใช้ตอนกด 檢查 (เจอ syllable ที่ยังไม่เคยแวะ/ไม่มี cache ก็ไม่พัง)
function rgJumpForCheck(idx){
  sylIdx=idx;
  var st=sylCache[idx];
  if(st){ rgRestoreSylState(st); } else { loadSyl(); }
  renderSylStrip();
}

// ════════════════════════════════════════════
// 中級 (หลายพยางค์) 猜聲調 ทีละพยางค์หลังตอบทั้งคำถูกแล้ว — Lin 2026-07-07 (เดิมระดับนี้ได้แต้มอัตโนมัติไม่มี popup ให้ทาย ตอนนี้เพิ่ม popup ให้ทายจริงเหมือน 初級)
// 高級ยังคงพฤติกรรมเดิม (อัตโนมัติ ไม่ทาย) ตามที่ Lin ยืนยัน — เปลี่ยนเฉพาะ 中級
// ════════════════════════════════════════════
var RG_MID_TONE_Q=[],RG_MID_TONE_IDX=0,RG_MID_TONE_TOKEN=0;
function rgStartMidToneQuizzes(){
  RG_MID_TONE_Q=[];
  sylList.forEach(function(s,i){ if(s.tone_name) RG_MID_TONE_Q.push(i); });
  RG_MID_TONE_IDX=0;
  RG_MID_TONE_TOKEN++;
  rgAskMidTone();
}
function rgAskMidTone(){
  if(RG_MID_TONE_IDX>=RG_MID_TONE_Q.length){ rgFinishWholeWordAfterTone(); return; }
  var seg=RG_MID_TONE_Q[RG_MID_TONE_IDX];
  var SY=sylList[seg];
  var sec=document.getElementById('bonus-section');
  sec.className='bonus-section show';
  var box=document.getElementById('bonus-opts');
  box.innerHTML='';
  var res=document.getElementById('bonus-result');
  if(res){res.textContent='';res.style.color='';}
  var reasonEl0=document.getElementById('bonus-reason');
  if(reasonEl0)reasonEl0.className='bonus-reason';
  var hdr=document.getElementById('bonus-header');
  if(hdr)hdr.innerHTML='猜聲調！選一下「'+SY.th+'」的聲調（'+(RG_MID_TONE_IDX+1)+'/'+RG_MID_TONE_Q.length+'）答對 <span class="bonus-pts">+1</span> 分 ✨ 答錯不扣分（不選也可以，按下面按鈕跳過）';
  var skipBtn=document.getElementById('rg-mid-tone-skip');
  if(skipBtn)skipBtn.style.display='inline-block';
  var _tok=RG_MID_TONE_TOKEN;
  BONUS_TONES.forEach(function(t){
    var btn=document.createElement('button');
    btn.className='bonus-btn';
    btn.dataset.tone=t.name;
    btn.innerHTML=t.num;
    btn.onclick=function(){
      if(box.querySelector('.bonus-btn.locked'))return; // ล็อกหลังตอบแล้ว กันกดซ้ำ
      box.querySelectorAll('.bonus-btn').forEach(function(b){b.classList.add('locked');});
      var skipBtn2=document.getElementById('rg-mid-tone-skip');
      if(skipBtn2)skipBtn2.style.display='none';
      var tZH=TONE_ZH[SY.tone_name]||SY.tone_name;
      if(t.name===SY.tone_name){
        var toneScored=!wordUsedGuide && !curWordIsKnownCheck; // โหมดฝึกฝน/พิสูจน์ = ไม่ได้แต้มโบนัสเสียง เหมือน初級
        if(toneScored){ roundScore+=1; wordToneBonus+=1; pop('+1 ✨'); refreshUI(); }
        btn.classList.add('correct');
        res.textContent='正確！是'+tZH+(toneScored?' 🎉 +1 分':' 🎉（練習模式不計分）');
        res.style.color='#2e7d32';
      } else {
        btn.classList.add('wrong');
        var cb=box.querySelector('[data-tone="'+SY.tone_name+'"]'); if(cb)cb.classList.add('correct');
        res.textContent='不對，是'+tZH+'，沒扣分，繼續加油！';
        res.style.color='#b06020';
      }
      // Lin 2026-07-12: เอากล่องอธิบาย 子音/母音/尾音 ระหว่างทายทีละพยางค์ออก (เหมือนเกมพิมพ์) — ไปสรุปรวมทุกพยางค์ตอนจบคำแทน (showRevealMulti) กันโชว์ซ้ำ 2 รอบ
      setTimeout(function(){
        if(RG_MID_TONE_TOKEN!==_tok)return; // ผู้เล่นกดข้ามไปคำอื่นระหว่างรอ — ไม่ทำอะไรกับคำเก่า
        RG_MID_TONE_IDX++;
        rgAskMidTone();
      },900); // เดิม 2600ms → ไม่มีคำอธิบายยาวแล้ว ลดกลับมาสั้นพอให้อ่าน ✓/✗ ทัน
    };
    box.appendChild(btn);
  });
}
function rgSkipMidTone(){
  var box=document.getElementById('bonus-opts');
  if(box)box.querySelectorAll('.bonus-btn').forEach(function(b){b.classList.add('locked');});
  var skipBtn=document.getElementById('rg-mid-tone-skip');
  if(skipBtn)skipBtn.style.display='none';
  var seg=RG_MID_TONE_Q[RG_MID_TONE_IDX];
  var SY=sylList[seg];
  var res=document.getElementById('bonus-result');
  var tZH=TONE_ZH[SY.tone_name]||SY.tone_name;
  if(res){res.textContent='（未作答）正確答案是'+tZH;res.style.color='#888';}
  // Lin 2026-07-12: เอากล่องอธิบายระหว่างทายทีละพยางค์ออกเหมือนกัน — ไปสรุปรวมตอนจบคำแทน
  var _tok=RG_MID_TONE_TOKEN;
  setTimeout(function(){
    if(RG_MID_TONE_TOKEN!==_tok)return;
    RG_MID_TONE_IDX++;
    rgAskMidTone();
  },700); // เดิม 2200ms → ไม่มีคำอธิบายยาวแล้ว
}
// ถามวรรณยุกต์ครบทุกพยางค์ที่มีแล้ว (หรือไม่มีพยางค์ไหนต้องถามเลย) → ไปจบคำเหมือนเดิมทุกประการ (showReveal/finalizeWord ฯลฯ)
function rgFinishWholeWordAfterTone(){
  var sec=document.getElementById('bonus-section');
  if(sec)sec.className='bonus-section';
  var hdr=document.getElementById('bonus-header');
  if(hdr)hdr.innerHTML='猜聲調！答對 <span class="bonus-pts">+1</span> 分 ✨ 答錯不扣分'; // คืนข้อความเดิมไว้ให้คำถัดไป (ถ้าเป็นคำพยางค์เดียว)
  // Lin 2026-07-12: คำหลายพยางค์ → โชว์สรุปรวมทุกพยางค์ (เหมือนเกมพิมพ์) ไม่ใช่แค่พยางค์สุดท้าย
  markOpts();markSlots();(sylList.length>1?showRevealMulti():showReveal());renderSylStrip();
  document.getElementById('retry-hint').className='retry-hint';
  setGameBtns('done');
  finalizeWord();
  document.getElementById('btn-next').textContent='下一題 →';
  document.getElementById('ok').textContent=okC;document.getElementById('bad').textContent=badC;
  refreshUI();
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
    // 中級ให้ทายวรรณยุกต์ทีละพยางค์ต่อ (เหมือน初級) ก่อนค่อยจบคำ — 高級ยังคงพฤติกรรมเดิม (อัตโนมัติ) — Lin 2026-07-07
    if(curLevel==='中'){
      rgStartMidToneQuizzes();
    } else {
      // Lin 2026-07-12: 高級ประโยคหลายพยางค์ → โชว์สรุปรวมทุกพยางค์เหมือนกัน ไม่ใช่แค่พยางค์สุดท้าย
      markOpts();markSlots();(sylList.length>1?showRevealMulti():showReveal());renderSylStrip();
      document.getElementById('retry-hint').className='retry-hint';
      setGameBtns('done');
      finalizeWord();
      document.getElementById('btn-next').textContent='下一題 →';
      document.getElementById('ok').textContent=okC;document.getElementById('bad').textContent=badC;
      refreshUI();
    }
  } else {
    wordHadWrong=true;streak=0;badC++;
    // งานที่1: นับผิดแยกรายพยางค์ (พยางค์ไหนโผล่มาว่าผิด ก็ +1 เฉพาะพยางค์นั้น) แทนนับรวมทั้งคำแบบเดิม
    sylWrongCount[wrongIdx]=(sylWrongCount[wrongIdx]||0)+1;
    wrongCount=sylWrongCount[wrongIdx]; // ให้ retry-hint อ้างอิงจำนวนผิดของพยางค์นี้เอง
    rgJumpForCheck(wrongIdx);
    refreshUI(); // Lin 2026-07-06: หลอด 本題分數 ลดสด+ไล่สีตอนกดผิด (พยางค์ปัจจุบัน)
    if(wrongCount<4){
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
      hint.textContent=(wrongCount>=3?'再一次就好，米娜相信你 💛':'沒關係～再看看這個音節 🌱')+'（音節 '+(wrongIdx+1)+'）';
      hint.className='retry-hint show';
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
  var _savedLv=localStorage.getItem('rg_reading_level');
  if(_savedLv==='初'||_savedLv==='中'||_savedLv==='高'){
    curLevel=_savedLv;
    document.querySelectorAll('.ltab').forEach(function(b){b.classList.remove('active');});
    var _lt=document.getElementById('ltab-'+curLevel);
    if(_lt)_lt.classList.add('active');
  }
}catch(e){}
loadSave();
initGame();
try { rgRenderGameBar(); } catch(e){}

// ── ฟ้อนต์โมเดิร์น (เหมือนเกมเสียง) ──
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
      body: JSON.stringify({ access_key:'b0b4c37b-6fad-4e64-9a16-81c5ab2ff4c3', subject:'[拼讀遊戲] 學生問題', from_name:'拼讀遊戲', email: email||'anonymous@game', message: msg }) })
    .then(function(r){ return r.json(); })
    .then(function(){ btn.textContent = '✅ 已送出！'; setTimeout(function(){ div.remove(); }, 1200); })
    .catch(function(){ btn.disabled=false; btn.textContent='送出問題 →'; alert('送出失敗，請稍後再試'); });
  };
}

// กด Enter: ต่อคำ/พยางค์ถัดไปถ้าเช็คจบแล้ว (ปุ่ม 下一字/下一個音節 โผล่อยู่) หรือกดเช็คคำตอบเลยถ้าใส่ครบแล้ว
// วรรณยุกต์เป็นแค่ตัวเลือกเพิ่ม ไม่ต้องเลือกก็เช็ค/ไปต่อได้ปกติ — Lin 2026-07-06
document.addEventListener('keydown',function(e){
  if(e.key!=='Enter')return;
  var ae=document.activeElement;
  if(ae && /^(INPUT|TEXTAREA)$/.test(ae.tagName))return; // เผื่อกำลังพิมพ์ในช่อง 我有問題 อยู่ ไม่ให้ไปชนกัน
  var gameEl=document.getElementById('game');
  if(!gameEl || gameEl.style.display==='none')return;
  var _hm=document.getElementById('rg-howto-modal');
  if(_hm && _hm.style.display==='flex')return;
  if(document.getElementById('rg-ask-ov'))return;
  var _bm=document.getElementById('badge-modal');
  if(_bm && _bm.classList.contains('show'))return;
  var nextBtn=document.getElementById('btn-next');
  if(nextBtn && nextBtn.style.display!=='none' && nextBtn.offsetParent!==null){ nextBtn.click(); e.preventDefault(); return; }
  var checkBtn=document.getElementById('btn-check');
  if(checkBtn && checkBtn.style.display!=='none' && !checkBtn.disabled){ checkBtn.click(); e.preventDefault(); }
});
// กดเลข 1-5 บนคีย์บอร์ดแทนการคลิกเลือกวรรณยุกต์ได้ — Lin 2026-07-12
document.addEventListener('keydown',function(e){
  if(e.key<'1'||e.key>'5')return;
  var ae=document.activeElement;
  if(ae && /^(INPUT|TEXTAREA)$/.test(ae.tagName))return;
  var gameEl=document.getElementById('game');
  if(!gameEl || gameEl.style.display==='none')return;
  var _hm=document.getElementById('rg-howto-modal');
  if(_hm && _hm.style.display==='flex')return;
  if(document.getElementById('rg-ask-ov'))return;
  var _bm=document.getElementById('badge-modal');
  if(_bm && _bm.classList.contains('show'))return;
  var sec=document.getElementById('bonus-section');
  if(!sec || !sec.classList.contains('show'))return;
  var box=document.getElementById('bonus-opts');
  if(!box)return;
  var tone=BONUS_TONES[Number(e.key)-1];
  if(!tone)return;
  var btn=box.querySelector('[data-tone="'+tone.name+'"]');
  if(!btn || btn.classList.contains('locked'))return;
  btn.click();
  e.preventDefault();
});
