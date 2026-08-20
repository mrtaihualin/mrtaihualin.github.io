// js/games/lego-game-app.js — ตรรกะเกมเลโก้ (泰語造句練習室)
// FILE MAP: slots/words/examples/levels → state/render/actions → scoring/account → sentence test → teaching/tour/init
// แยกออกมาจาก lego.html (เดิมฝัง inline <script> 1,182 บรรทัด) — Lin สั่ง 2026-08-02 ให้แยก logic ออกจาก UI ตามแพทเทิร์นเกมอื่น
// ย้ายมาแบบคัดลอกตรงๆ ไม่มีการแก้ logic ใดๆ — พฤติกรรมต้องเหมือนเดิม 100%

// Shared Phase 1.2 font adapter: keep the same two existing modes and storage key
// used by Reading, Listening, Typing and Word Order. shared.js owns the control UI.
window.rgToggleFont = function () {
  var on = document.body.classList.toggle('rg-modern-font');
  try { localStorage.setItem('rg_modern_font', on ? '1' : '0'); } catch (e) {}
};
(function () {
  try {
    if (localStorage.getItem('rg_modern_font') === '1') document.body.classList.add('rg-modern-font');
  } catch (e) {}
})();

// ════════ SLOTS ════════
// Locked minimum-release sentence slots. Visible branches are selected by activeSlots().
const SLOTS=[
  {id:'time',  label:'時間', opt:true,  c:'time'},
  {id:'subj',  label:'主語', opt:false, c:'subj'},
  {id:'modal', label:'文法', opt:true,  c:'modal'},
  {id:'verb',  label:'動詞', opt:false, c:'verb'},
  {id:'obj',   label:'受詞', opt:true,  c:'obj'},
  {id:'prog',  label:'文法', opt:true,  c:'prog'},
  {id:'advObj',label:'地點', opt:true, c:'place'},
  {id:'adv',   label:'誰', opt:true,  c:'comp'},
  {id:'end',   label:'句尾', opt:true,  c:'end'},
];

const LOCATION_WORDS=[
  {th:'ห้าง',zh:'商場'},
  {th:'บ้านเพื่อน',zh:'朋友的家'},
  {th:'เซเว่น',zh:'便利商店'},
  {th:'ร้านอาหาร',zh:'餐廳'},
];
const SLEEP_LOCATION={th:'อยู่บ้าน',zh:'家裡'};

// ════════ WORDS (with semantic tags) ════════
const WORDS={
  time:[
    {th:'ตอนนี้',  zh:'現在'},
    {th:'วันนี้',  zh:'今天'},
    {th:'พรุ่งนี้', zh:'明天'},
  ],
  subj:[
    {th:'เรา',  zh:'我／我們'},
    {th:'ผม',  zh:'我（男）'},
    {th:'พี่',  zh:'我（哥姐）'},
  ],
  modal:[
    {th:'อยาก',    zh:'想'},
    {th:'จะ',      zh:'要'},
    {th:'กำลัง',   zh:'正在'},
  ],
  verb:[
    {th:'กิน',      zh:'吃',      objTags:['food']},
    {th:'ไป',       zh:'去',      objTags:[]},
    {th:'ไปกิน',    zh:'去吃',    objTags:['food']},
    {th:'นอน',      zh:'睡',      objTags:[]},
    {th:'ไปนอน',    zh:'去睡',    objTags:[]},
    {th:'ซื้อ',     zh:'買',      objTags:['buy']},
    {th:'ไปซื้อ',   zh:'去買',    objTags:['buy']},
  ],
  obj:[
    {th:'ข้าว',       zh:'飯', tags:['food']},
    {th:'ขนม',        zh:'零食', tags:['food']},
    {th:'ผลไม้',      zh:'水果', tags:['food']},
    {th:'ไก่ย่าง',    zh:'烤雞', tags:['food']},
    {th:'ก๋วยเตี๋ยว', zh:'麵', tags:['food']},
    {th:'ของกิน',     zh:'食物', tags:['food']},
    {th:'เสื้อ',      zh:'衣服', tags:['buy']},
    {th:'รองเท้า',    zh:'鞋', tags:['buy']},
    {th:'กระเป๋า',    zh:'包包', tags:['buy']},
    {th:'กางเกง',     zh:'褲子', tags:['buy']},
    {th:'ตั๋ว',       zh:'票', tags:['buy']},
  ],
  prog:[
    {th:'อยู่', zh:'（進行中）'},
  ],
  adv:[
    {th:'พ่อ',zh:'爸爸'},
    {th:'แม่',zh:'媽媽'},
    {th:'เพื่อน',zh:'朋友'},
    {th:'แฟน',zh:'男／朋友'},
  ],
  end:[
    {th:'นะ',zh:'喔'},
    {th:'นะครับ',zh:'喔'},
    {th:'นะคะ',zh:'喔'},
    {th:'อะ',zh:'強調語氣'},
    {th:'ครับ',zh:'男生禮貌助詞'},
    {th:'ค่ะ',zh:'女生禮貌助詞'},
  ],
};

// ════════ SESSION POOL: locked visible candidate sets ════════
let sessionPool={};

function createSessionPool(){
  sessionPool={};
  Object.keys(WORDS).forEach(cat=>{
    sessionPool[cat]=WORDS[cat].slice();
  });
  sessionPool.advObj=LOCATION_WORDS.slice();
}

// ════════ COMPATIBILITY: obj ←→ verb ════════
function getAllowedObjTags(){
  const v=state.verb;
  if(!v) return null; // no verb selected → no restriction
  const def=WORDS.verb.find(x=>x.th===v.th);
  if(!def||def.objTags===undefined) return null;
  return def.objTags; // [] = no obj, [...] = restricted
}

function isObjCompatible(word){
  const allowed=getAllowedObjTags();
  if(allowed===null) return true;
  if(allowed.length===0) return false;
  return (word.tags||[]).some(t=>allowed.includes(t));
}

// ════════ EXAMPLES (updated for new slot structure) ════════
const SUBJ_EXTRA=[
  {th:'เขา',      zh:'他／她'},
  {th:'น้อง',     zh:'弟弟妹妹'},
  {th:'พ่อของเรา',zh:'我爸爸'},
];

function findWord(slotId,th){
  if(slotId==='advObj'){
    return LOCATION_WORDS.concat([SLEEP_LOCATION]).find(x=>x.th===th)||null;
  }
  let w=(WORDS[slotId]||[]).find(x=>x.th===th);
  if(!w&&slotId==='subj') w=SUBJ_EXTRA.find(x=>x.th===th);
  return w;
}

const EXAMPLES=[
  {zh:'現在我正在商場吃飯',
   parts:[['time','ตอนนี้'],['subj','ผม'],['modal','กำลัง'],['verb','กิน'],['obj','ข้าว'],['prog','อยู่'],['adv','ที่'],['advObj','ห้าง'],['end','ครับ']],tag:'p3'},
];

// ════════ LEVELS ════════
const LEVELS={
  pre:{name:'預備級',sub:'P2 · 句子結構',type:'teach',
       intro:'看一句話如何<b>從三個詞長成完整句子</b>——這就是泰語的語序基礎。'},
  lv1:{name:'第一級',sub:'P3 · 情態助動詞',type:'build',hideNeg:true,exTags:['p2','p3'],
       intro:''},
  lv2:{name:'第二級',sub:'單字持續增加中',type:'build',hideNeg:false,exTags:['p4'],locked:true,
       intro:'用 <b>ไม่／ไม่ได้／ไม่ค่อย</b> 把句子變成否定——注意它放的位置。'},
  lv3:{name:'第三級',sub:'單字持續增加中',type:'build',hideNeg:false,exTags:['p2','p3','p4'],locked:true,
       intro:'情態與否定一起用，自由挑戰各種完整句子。'},
};
// Lin 2026-07-16: ซ่อน 預備級 (pre) ไว้ก่อน — ไม่ลบ ยังเก็บ LEVELS.pre ไว้เผื่อเอากลับมาใช้ทีหลัง
const LV_ORDER=['lv1','lv2','lv3'];

// ════════ TEACH STEPS ════════
const STEPS=[
  {title:'基本句子結構',sub:'主語 ＋ 動詞 ＋ 受詞',
   pieces:[{th:'พ่อ',zh:'爸爸'},{th:'กิน',zh:'吃'},{th:'ข้าว',zh:'飯'}],newTh:['พ่อ','กิน','ข้าว'],
   note:'泰語最核心的骨架：<b>誰 ＋ 做什麼 ＋ 對象</b>，語序和中文一樣。'},
  {title:'加入助動詞「正在」',sub:'＋ กำลัง … อยู่',
   pieces:[{th:'พ่อ',zh:'爸爸'},{th:'กำลัง',zh:'正在'},{th:'กิน',zh:'吃'},{th:'ข้าว',zh:'飯'},{th:'อยู่',zh:'進行'}],newTh:['กำลัง','อยู่'],
   note:'助動詞 <b>กำลัง</b> 放在動作的前面，<b>อยู่</b> 放在「動作＋受詞」的後面，表示「正在進行」。'},
  {title:'主語加修飾「我的」',sub:'พ่อ ＋ ของเรา',
   pieces:[{th:'พ่อ',zh:'爸爸'},{th:'ของเรา',zh:'我的'},{th:'กำลัง',zh:'正在'},{th:'กิน',zh:'吃'},{th:'ข้าว',zh:'飯'},{th:'อยู่',zh:'進行'}],newTh:['ของเรา'],
   note:'泰語修飾語放在<b>被修飾詞的後面</b>：爸爸＋我的 → 我的爸爸。'},
  {title:'加入地點與對象',sub:'＋ ที่บ้าน ＋ กับแม่',
   pieces:[{th:'พ่อ',zh:'爸爸'},{th:'ของเรา',zh:'我的'},{th:'กำลัง',zh:'正在'},{th:'กิน',zh:'吃'},{th:'ข้าว',zh:'飯'},{th:'อยู่',zh:'進行'},{th:'ที่บ้าน',zh:'在家'},{th:'กับแม่',zh:'和媽媽'}],newTh:['ที่บ้าน','กับแม่'],
   note:'地點用介詞 <b>ที่ ＋ 地方</b>；對象用 <b>กับ ＋ 人</b>，放在句子後段。'},
  {title:'加入時間',sub:'ตอนนี้ ＋ …（也可放句尾）',
   pieces:[{th:'ตอนนี้',zh:'現在'},{th:'พ่อ',zh:'爸爸'},{th:'ของเรา',zh:'我的'},{th:'กำลัง',zh:'正在'},{th:'กิน',zh:'吃'},{th:'ข้าว',zh:'飯'},{th:'อยู่',zh:'進行'},{th:'ที่บ้าน',zh:'在家'},{th:'กับแม่',zh:'和媽媽'}],newTh:['ตอนนี้'],
   note:'時間可以放<b>句首或句尾</b>：放句首，強調「什麼時間」發生這件事（強調時間）；放句尾，強調這件事「發生在什麼時間」（強調動作）。'},
];

// ════════ STATE ════════
let curLevel='lv1', teachStep=0;
const state={}; SLOTS.forEach(s=>state[s.id]=null);
let openSlot=null, exIdx=0;

// ════════ LEVEL SWITCHING ════════
function renderLevels(){
  document.getElementById('levels').innerHTML=LV_ORDER.map(k=>{
    const L=LEVELS[k];
    const locked=!!L.locked;
    const click=locked?`(function(){try{if(window.gtag)gtag('event','lego_level_locked_click',{category:'game',level:'${k}'});}catch(e){}toast('👧🏻 米娜：新單字一直在加喔～先玩前面的關卡，很快回來看看吧！')})()`:`(function(){try{if(window.gtag)gtag('event','lego_level_select',{category:'game',level:'${k}'});}catch(e){}setLevel('${k}')})()`;
    return `<div class="lv-pill ${k==='pre'?'pre':''} ${k===curLevel?'active':''} ${locked?'locked':''}" onclick="${click}">
      ${L.name}<small>${L.sub}</small></div>`;
  }).join('');
}

function setLevel(k){
  if(LEVELS[k].locked) return;
  curLevel=k; openSlot=null;
  const intro=document.getElementById('lvIntro');
  intro.innerHTML=LEVELS[k].intro||'';
  intro.classList.toggle('hidden',!LEVELS[k].intro);
  renderLevels();
  if(LEVELS[k].type==='teach'){
    document.getElementById('teachPanel').classList.remove('hidden');
    document.getElementById('buildPanel').classList.add('hidden');
    teachStep=0; renderTeach();
  }else{
    document.getElementById('teachPanel').classList.add('hidden');
    document.getElementById('buildPanel').classList.remove('hidden');
    SLOTS.forEach(s=>state[s.id]=null);
    state.prog=WORDS.prog[0];
    exIdx=0;
    createSessionPool();
    render();
  }
}

function activeSlots(){
  const verb=state.verb&&state.verb.th;
  return SLOTS.filter(s=>{
    if(s.id==='obj') return ['กิน','ไปกิน','ซื้อ','ไปซื้อ'].includes(verb);
    if(s.id==='advObj') return verb==='ไป'||verb==='นอน';
    if(s.id==='adv') return verb==='ไป'&&!!state.advObj;
    if(s.id==='prog'||s.id==='end') return ['กิน','ไปกิน','ซื้อ','ไปซื้อ'].includes(verb);
    return true;
  });
}

// ════════ CSS VARS HELPER ════════
function cssVars(c){return `--sc:var(--c-${c});--st:var(--t-${c})`;}

// ════════ RENDER BASEPLATE ════════
function renderBaseplate(){
  const bp=document.getElementById('baseplate');
  bp.innerHTML=activeSlots().map(s=>{
    const w=state[s.id];
    const depUnmet=s.dep&&!state[s.dep];
    // 動詞不帶受詞 → 受詞格整格鎖住
    const allowedTags=(s.id==='obj')?getAllowedObjTags():null;
    const objLocked=(s.id==='obj')&&allowedTags!==null&&allowedTags.length===0;

    let label=s.label;

    // ── slot button ──
    let btn;
    if(objLocked){
      btn=`<div class="slot-btn dep-locked" role="button" tabindex="0" onclick="toast('「${state.verb.th}」不需要受詞')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();toast('「${state.verb.th}」不需要受詞')}">
        <span class="splus" style="font-size:13px">不需受詞</span></div>`;
    }else if(w){
      btn=`<div class="slot-btn filled" role="button" tabindex="0" onclick="toggleMenu('${s.id}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();toggleMenu('${s.id}')}">
        <span class="sth">${w.th}</span><span class="szh">${w.zh}</span></div>`;
    }else if(depUnmet){
      // clicking dep-locked slot → open parent slot's menu
      btn=`<div class="slot-btn dep-locked" role="button" tabindex="0" onclick="toggleMenu('${s.dep}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();toggleMenu('${s.dep}')}">
        <span class="splus" style="font-size:13px">先選↑</span></div>`;
    }else{
      btn=`<div class="slot-btn" role="button" tabindex="0" onclick="toggleMenu('${s.id}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();toggleMenu('${s.id}')}"><span class="splus">＋</span></div>`;
    }

    // ── dropdown content ──
    const pool=(s.id==='advObj')
      ?(state.verb&&state.verb.th==='นอน'?[SLEEP_LOCATION]:LOCATION_WORDS)
      :(s.id==='obj'?(sessionPool.obj||[]).filter(isObjCompatible):(sessionPool[s.id]||[]));
    let opts=`<div class="pool-badge">本輪 ${pool.length} 詞</div>`;

    if(depUnmet){
      const depLabel=SLOTS.find(x=>x.id===s.dep).label;
      opts+=`<div class="dep-hint">先選「${depLabel}」</div>`;
    }else{
      if(s.id==='subj'){
        opts+=`<div class="opt-custom"><span>ชื่อ</span><input type="text" id="subjNameInput"
          placeholder="輸入自己的名字…"
          onkeydown="if(event.key==='Enter'){event.preventDefault();addCustomSubj();}">
          <button onclick="try{if(window.gtag)gtag('event','lego_custom_subject_add',{category:'game'});}catch(e){}addCustomSubj()">加入</button></div>`;
      }
      const customAllowed=['time','subj','adv'].includes(s.id)||(s.id==='advObj'&&state.verb&&state.verb.th==='ไป');
      if(customAllowed){
        opts+=`<div class="opt-custom"><span>ใส่เอง</span><input type="text" id="legoCustomTh-${s.id}" placeholder="自訂泰文…"
          onkeydown="if(event.key==='Enter'){event.preventDefault();addCustomWord('${s.id}');}">
          <input class="lego-custom-zh" type="text" id="legoCustomZh-${s.id}" placeholder="中文翻譯（選填）…"
          onkeydown="if(event.key==='Enter'){event.preventDefault();addCustomWord('${s.id}');}">
          <button type="button" onclick="addCustomWord('${s.id}')">加入</button></div>`;
      }
      if(s.opt){
        opts+=`<div class="opt-clear" role="button" tabindex="0" onclick="try{if(window.gtag)gtag('event','lego_slot_clear',{category:'game',slot:'${s.id}'});}catch(e){}clearSlot('${s.id}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();try{if(window.gtag)gtag('event','lego_slot_clear',{category:'game',slot:'${s.id}'});}catch(e){}clearSlot('${s.id}')}">— 清除 —</div>`;
      }
      pool.forEach(o=>{
        const sel=(w&&w.th===o.th)?' sel':'';
        let disabled=false, label2=o.zh;
        opts+=`<div class="opt${sel}${disabled?' disabled':''}" ${disabled?'':`role="button" tabindex="0" onclick="pickWord('${s.id}','${o.th}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();pickWord('${s.id}','${o.th}')}"`}>
          <span class="oth">${o.th}</span><span class="ozh">${label2}</span></div>`;
      });
    }

    return `<div class="slot" data-id="${s.id}" style="${cssVars(s.c)}">
      <div class="slot-label">${label}</div>
      ${btn}<div class="slot-menu">${opts}</div></div>`;
  }).join('');
  applyOpen();
}

function applyOpen(){
  document.querySelectorAll('.slot').forEach(el=>{
    const on=el.dataset.id===openSlot;
    el.classList.toggle('menu-open',on);
    const b=el.querySelector('.slot-btn');if(b)b.classList.toggle('open',on);
  });
}

// ════════ FULL CHINESE SENTENCE (中文語序重排) ════════
function cleanZh(z){return (z||'').replace(/（[^）]*）/g,'').split('／')[0];}
const END_ZH={'แล้ว':'了','นะ':'喔','เลย':'','ครับ':'','ค่ะ':''};

function buildZhFull(){
  if(!state.subj&&!state.verb) return '';
  let s='';
  if(state.time) s+=cleanZh(state.time.zh);
  if(state.subj) s+=cleanZh(state.subj.zh);
  let modalZh=state.modal?cleanZh(state.modal.zh):'';
  if(!modalZh&&state.prog) modalZh='正在'; // มีแค่ อยู่ ก็แปลว่ากำลังทำ
  s+=modalZh;
  if(state.verb) s+=cleanZh(state.verb.zh);
  if(state.obj)  s+=cleanZh(state.obj.zh);
  if(state.advObj) s+=cleanZh(state.advObj.zh);
  if(state.adv) s+='和'+cleanZh(state.adv.zh);
  if(state.end)  s+=(END_ZH[state.end.th]!==undefined?END_ZH[state.end.th]:cleanZh(state.end.zh));
  return s.replace('正在在','正在');
}

// ════════ RENDER OUTPUT ════════
function renderOut(){
  const active=activeSlots();
  const elTh=document.getElementById('sentTh');
  const elZh=document.getElementById('sentZh');
  const elZhFull=document.getElementById('sentZhFull');
  const skip=new Set();
  const thParts=[], zhParts=[];

  active.forEach(s=>{
    if(skip.has(s.id)) return;
    const w=state[s.id];
    if(!w) return;
    if(s.id==='adv'){
      thParts.push('กับ'+w.th); zhParts.push('和・'+w.zh);
    }else{
      thParts.push(w.th); zhParts.push(w.zh);
    }
  });

  if(!thParts.length){
    elTh.innerHTML='<span class="ph">從下方底板開始挑詞 ⌄</span>';
    elZh.textContent='';
    elZhFull.textContent='';
    return;
  }
  elTh.textContent=thParts.join('');
  elZh.textContent=zhParts.join('・');
  elZhFull.textContent=buildZhFull();
}

function render(){renderBaseplate();renderOut();}

// ════════ ACTIONS ════════
function toggleMenu(id){openSlot=openSlot===id?null:id;applyOpen();}

function pickWord(id,th){
  let word;
  if(id==='advObj') word=(state.verb&&state.verb.th==='นอน'?[SLEEP_LOCATION]:LOCATION_WORDS).find(w=>w.th===th);
  else word=(sessionPool[id]||WORDS[id]||[]).find(w=>w.th===th);
  if(!word) return;
  state[id]=word;
  if(id==='modal'){
    state.prog=word.th==='กำลัง'?WORDS.prog[0]:null;
  }
  if(id==='verb'){
    // clear obj if incompatible with new verb
    if(state.obj&&!isObjCompatible(state.obj)){
      state.obj=null;
      toast('受詞與動詞不符，已自動清除');
    }
    state.adv=null;state.advObj=null;
    if(['ไป','นอน','ไปนอน'].includes(word.th)){state.obj=null;state.prog=null;state.end=null;}
    else if(!state.modal) state.prog=WORDS.prog[0];
  }
  openSlot=null;
  render();
  legoSaveResume('build');
}

function clearSlot(id){
  if(id==='prog'&&!state.modal){toast('沒有前置文法時，อยู่ 不能移除',true);return;}
  state[id]=null;
  if(id==='modal') state.prog=WORDS.prog[0];
  if(id==='advObj') state.adv=null;
  openSlot=null;
  render();
  legoSaveResume('build');
}

function addCustomSubj(){
  const inp=document.getElementById('subjNameInput');
  const name=(inp&&inp.value||'').trim();
  if(!name){toast('請先輸入名字',true);return;}
  const w={th:name,zh:name,custom:true,customType:'name'};
  state.subj=w;openSlot=null;render();legoSaveResume('build');toast('已加入：'+name);
}

function addCustomWord(id){
  if(!['time','subj','adv','advObj'].includes(id))return;
  if(id==='advObj'&&(!state.verb||state.verb.th!=='ไป'))return;
  const thInput=document.getElementById('legoCustomTh-'+id);
  const zhInput=document.getElementById('legoCustomZh-'+id);
  const th=(thInput&&thInput.value||'').trim();
  const zh=(zhInput&&zhInput.value||'').trim();
  if(!th){toast('請先輸入自訂泰文',true);return;}
  state[id]={th:th,zh:zh,custom:true,customType:'custom'};
  if(id==='advObj')state.adv=null;
  openSlot=null;render();legoSaveResume('build');toast('已加入自訂內容');
}

function clearAll(){
  SLOTS.forEach(s=>state[s.id]=null);
  state.prog=WORDS.prog[0];
  openSlot=null;render();toast('已清空');
}

// ════════ PHASE 1.2 LOCKED BUILD → REVEAL → RESULT FLOW ════════
const LEGO_CUSTOM_DISCLAIMER='自訂內容由玩家自行輸入，系統不會檢查或修正內容。';
const LEGO_DAILY_ACTIVITY_KEY='lego_daily_activity_v1';
const LEGO_UI_COPY={
  resultSave:{
    title:'選擇要儲存的句子',selectAll:'全部選取',save:'儲存到句子庫',
    empty:'請先選擇要儲存的句子',done:'已送出所選句子。',full:'句子庫已滿，請先刪除既有句子。'
  },
  resume:{game:'造句練習',mode:'自由造句',revealed:'等待繼續',draft:'句子未確認',ready:'準備下一句'}
};
let legoCompletedSentences=[];
let legoPendingResume=null;

function legoClearResume(){try{if(window.GameResume)window.GameResume.clear('lego');}catch(e){}}

function legoSerializedBuilder(){
  const builder={};
  SLOTS.forEach(slot=>{
    const word=state[slot.id];
    builder[slot.id]=word?{th:String(word.th||''),zh:String(word.zh||''),custom:word.custom===true,customType:word.customType||''}:null;
  });
  return builder;
}

function legoHasDraft(builder){
  return SLOTS.some(slot=>slot.id!=='prog'&&builder&&builder[slot.id]&&builder[slot.id].th);
}

function legoSaveResume(view){
  try{
    if(!window.GameResume)return;
    const builder=legoSerializedBuilder();
    if(!legoCompletedSentences.length&&!legoHasDraft(builder)){legoClearResume();return;}
    window.GameResume.save('lego',{
      version:1,view:view==='reveal'?'reveal':'build',builder:builder,
      completed:legoCompletedSentences.map(sentence=>({th:String(sentence.th||''),zh:String(sentence.zh||''),custom:sentence.custom===true}))
    });
  }catch(e){}
}

function legoNormalizeCompleted(rows){
  if(!Array.isArray(rows))return null;
  const completed=[];
  for(const row of rows){
    if(!row||typeof row.th!=='string'||!row.th.trim()||typeof row.zh!=='string')return null;
    completed.push({th:row.th,zh:row.zh,custom:row.custom===true});
  }
  return completed;
}

function legoNormalizeBuilder(saved){
  if(!saved||typeof saved!=='object')return null;
  const restored={};SLOTS.forEach(slot=>restored[slot.id]=null);
  for(const slot of SLOTS){
    const raw=saved[slot.id];if(!raw)continue;
    if(typeof raw.th!=='string'||!raw.th)return null;
    let word=null;
    if(raw.custom===true&&['time','subj','adv','advObj'].includes(slot.id)){
      if(typeof raw.zh!=='string')return null;
      const customType=slot.id==='subj'&&raw.customType==='name'?'name':'custom';
      word={th:raw.th,zh:customType==='name'?raw.th:raw.zh,custom:true,customType:customType};
    }
    else if(slot.id==='advObj')word=LOCATION_WORDS.concat([SLEEP_LOCATION]).find(item=>item.th===raw.th)||null;
    else word=(WORDS[slot.id]||[]).find(item=>item.th===raw.th&&item.custom!==true)||null;
    if(!word)return null;
    restored[slot.id]=word;
  }
  const verb=restored.verb&&restored.verb.th;
  const objectBranch=['กิน','ไปกิน','ซื้อ','ไปซื้อ'].includes(verb);
  if(restored.obj){
    const verbDef=WORDS.verb.find(word=>word.th===verb);
    const allowed=verbDef&&Array.isArray(verbDef.objTags)?verbDef.objTags:[];
    if(!objectBranch||!(restored.obj.tags||[]).some(tag=>allowed.includes(tag)))restored.obj=null;
  }
  if(objectBranch){
    restored.adv=null;restored.advObj=null;
    if(!restored.modal)restored.prog=WORDS.prog[0];
    else if(restored.modal.th!=='กำลัง')restored.prog=null;
  }else if(verb==='ไป'){
    restored.obj=null;restored.prog=null;restored.end=null;
    if(restored.advObj&&restored.advObj.th===SLEEP_LOCATION.th)restored.advObj=null;
    if(!restored.advObj)restored.adv=null;
  }else if(verb==='นอน'){
    restored.obj=null;restored.prog=null;restored.end=null;restored.adv=null;
    if(restored.advObj&&restored.advObj.th!==SLEEP_LOCATION.th)restored.advObj=null;
  }else if(verb==='ไปนอน'){
    restored.obj=null;restored.prog=null;restored.end=null;restored.adv=null;restored.advObj=null;
  }else{
    restored.obj=null;restored.end=null;restored.adv=null;restored.advObj=null;
    if(!restored.modal)restored.prog=WORDS.prog[0];
    else if(restored.modal.th!=='กำลัง')restored.prog=null;
  }
  return restored;
}

function legoNormalizeResume(saved){
  if(!saved||saved.version!==1||!['build','reveal'].includes(saved.view))return null;
  const completed=legoNormalizeCompleted(saved.completed);
  const builder=legoNormalizeBuilder(saved.builder);
  if(!completed||!builder)return null;
  if(saved.view==='reveal'&&!completed.length)return null;
  return {view:saved.view,completed:completed,builder:builder};
}

function legoApplyBuilder(builder){
  SLOTS.forEach(slot=>{state[slot.id]=builder[slot.id]||null;});
  openSlot=null;render();
}

function legoHideResumeBanner(){const banner=document.getElementById('lego-resume-banner');if(banner)banner.style.display='none';}

function legoTryResume(){
  if(!window.GameResume)return false;
  let normalized=null;
  try{normalized=legoNormalizeResume(window.GameResume.load('lego'));}catch(e){}
  if(!normalized){legoClearResume();return false;}
  legoPendingResume=normalized;
  const completed=normalized.completed.length;
  const progress=completed+' 句・'+(normalized.view==='reveal'?LEGO_UI_COPY.resume.revealed:(legoHasDraft(normalized.builder)?LEGO_UI_COPY.resume.draft:LEGO_UI_COPY.resume.ready));
  const detail=document.getElementById('lego-resume-detail');
  if(detail)detail.textContent=GameUiCopy.resumeLine(LEGO_UI_COPY.resume.game,LEGO_UI_COPY.resume.mode,progress);
  legoHideLockedPanels();
  const build=document.getElementById('buildPanel');if(build)build.classList.add('hidden');
  const banner=document.getElementById('lego-resume-banner');if(banner)banner.style.display='';
  return true;
}

function legoResumeContinue(){
  const pending=legoPendingResume;legoPendingResume=null;legoHideResumeBanner();
  if(!pending){legoClearResume();document.getElementById('buildPanel').classList.remove('hidden');return;}
  legoCompletedSentences=pending.completed;
  legoApplyBuilder(pending.builder);
  if(pending.view==='reveal'){
    const sentence=legoCompletedSentences[legoCompletedSentences.length-1];
    document.getElementById('buildPanel').classList.add('hidden');
    document.getElementById('lego-reveal-th').textContent=sentence.th;
    document.getElementById('lego-reveal-zh').textContent=sentence.zh;
    document.getElementById('lego-reveal-disclaimer').classList.toggle('hidden',!sentence.custom);
    document.getElementById('lego-reveal').classList.remove('hidden');
  }else document.getElementById('buildPanel').classList.remove('hidden');
  legoSaveResume(pending.view);
}

function legoResumeRestartCurrent(){
  const pending=legoPendingResume;legoPendingResume=null;legoHideResumeBanner();
  legoCompletedSentences=pending?pending.completed:[];
  SLOTS.forEach(slot=>state[slot.id]=null);state.prog=WORDS.prog[0];openSlot=null;render();
  legoHideLockedPanels();document.getElementById('buildPanel').classList.remove('hidden');legoSaveResume('build');
}

function legoResumeNewSession(){
  legoPendingResume=null;legoClearResume();legoHideResumeBanner();legoCompletedSentences=[];
  SLOTS.forEach(slot=>state[slot.id]=null);state.prog=WORDS.prog[0];openSlot=null;render();
  legoHideLockedPanels();document.getElementById('buildPanel').classList.remove('hidden');
}

function legoCurrentSentence(){
  if(!state.subj||!state.verb) return null;
  const verb=state.verb.th;
  if(['กิน','ไปกิน','ซื้อ','ไปซื้อ'].includes(verb)&&!state.obj) return null;
  if(verb==='ไป'&&!state.advObj) return null;
  if(['กิน','ไปกิน','ซื้อ','ไปซื้อ'].includes(verb)&&!state.modal&&!state.prog) return null;
  const th=(document.getElementById('sentTh').textContent||'').trim();
  if(!th) return null;
  const customWords=SLOTS.map(s=>state[s.id]).filter(word=>word&&word.custom===true);
  const custom=customWords.length>0;
  const missingCustomTranslation=customWords.some(word=>word.customType!=='name'&&!String(word.zh||'').trim());
  return {th:th,zh:missingCustomTranslation?'':buildZhFull(),custom:custom};
}

function legoDailyActivity(increment){
  const day=new Date().toISOString().slice(0,10);
  let value={day:day,count:0};
  try{
    const parsed=JSON.parse(localStorage.getItem(LEGO_DAILY_ACTIVITY_KEY)||'null');
    if(parsed&&parsed.day===day&&Number.isFinite(Number(parsed.count))) value={day:day,count:Math.max(0,Number(parsed.count))};
  }catch(e){}
  if(increment){
    value.count+=1;
    try{localStorage.setItem(LEGO_DAILY_ACTIVITY_KEY,JSON.stringify(value));}catch(e){}
  }
  return value.count;
}

function legoHideLockedPanels(){
  ['lego-reveal','lego-result','lego-result-detail','lego-flow-error'].forEach(id=>{
    const el=document.getElementById(id);if(el)el.classList.add('hidden');
  });
}

function legoShowLockedError(){
  legoHideLockedPanels();
  const build=document.getElementById('buildPanel');if(build)build.classList.add('hidden');
  const error=document.getElementById('lego-flow-error');if(error)error.classList.remove('hidden');
  legoSaveResume('build');
}

function legoCompleteSentence(){
  try{
    const sentence=legoCurrentSentence();
    if(!sentence){toast('請先完成目前句子的必填欄位',true);return;}
    legoCompletedSentences.push(sentence);
    legoDailyActivity(true);
    document.getElementById('buildPanel').classList.add('hidden');
    document.getElementById('lego-reveal-th').textContent=sentence.th;
    document.getElementById('lego-reveal-zh').textContent=sentence.zh;
    document.getElementById('lego-reveal-disclaimer').classList.toggle('hidden',!sentence.custom);
    document.getElementById('lego-flow-error').classList.add('hidden');
    document.getElementById('lego-reveal').classList.remove('hidden');
    legoSaveResume('reveal');
  }catch(e){legoShowLockedError();}
}

function legoContinueBuilding(){
  try{
    legoHideLockedPanels();
    clearAll();
    document.getElementById('buildPanel').classList.remove('hidden');
    legoSaveResume('build');
  }catch(e){legoShowLockedError();}
}

function legoRenderSentenceRows(host,detail){
  host.textContent='';
  legoCompletedSentences.forEach((sentence,index)=>{
    const row=document.createElement('div');row.className='lego-result-item';
    const th=document.createElement('div');th.className='th';th.textContent=(index+1)+'. '+sentence.th;row.appendChild(th);
    if(sentence.zh){const zh=document.createElement('div');zh.textContent=sentence.zh;row.appendChild(zh);}
    if(sentence.custom){const note=document.createElement('div');note.className='lego-flow-note';note.textContent=LEGO_CUSTOM_DISCLAIMER;row.appendChild(note);}
    if(detail){
      const status=document.createElement('div');status.textContent='狀態：已由玩家按「完成句子」確認';row.appendChild(status);
    }
    host.appendChild(row);
  });
}

function legoCanSaveResult(){
  return !!(window.READING_AUTH&&window.READING_AUTH.user&&window.SentenceVault&&window.SentenceVault.addSentence);
}

function legoRenderResultSaveControls(){
  const host=document.getElementById('lego-result-save');
  if(!host)return;
  const available=legoCanSaveResult()&&legoCompletedSentences.length>0;
  host.classList.toggle('hidden',!available);
  host.textContent='';
  if(!available)return;
  const copy=LEGO_UI_COPY.resultSave;
  const title=document.createElement('h3');title.textContent=copy.title;host.appendChild(title);
  const list=document.createElement('div');list.className='lego-result-save-list';
  legoCompletedSentences.forEach((sentence,index)=>{
    const row=document.createElement('label');row.className='lego-result-save-row';
    const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.setAttribute('data-lego-save-index',String(index));
    const text=document.createElement('span');text.className='lego-result-save-text';
    const th=document.createElement('span');th.className='th';th.textContent=sentence.th;text.appendChild(th);
    if(sentence.zh){const zh=document.createElement('small');zh.textContent=sentence.zh;text.appendChild(zh);}
    if(sentence.custom){const note=document.createElement('small');note.textContent=LEGO_CUSTOM_DISCLAIMER;text.appendChild(note);}
    row.appendChild(checkbox);row.appendChild(text);list.appendChild(row);
  });
  host.appendChild(list);
  const actions=document.createElement('div');actions.className='lego-result-save-actions';
  const selectAll=document.createElement('button');selectAll.type='button';selectAll.className='btn btn-line';selectAll.textContent=copy.selectAll;
  selectAll.onclick=()=>host.querySelectorAll('[data-lego-save-index]').forEach(box=>{box.checked=true;});
  const save=document.createElement('button');save.type='button';save.className='btn btn-gold';save.textContent=copy.save;save.onclick=legoSaveSelectedSentences;
  actions.appendChild(selectAll);actions.appendChild(save);host.appendChild(actions);
  const status=document.createElement('div');status.className='lego-result-save-status';status.id='lego-result-save-status';host.appendChild(status);
}

function legoSaveSelectedSentences(){
  if(!legoCanSaveResult())return;
  const host=document.getElementById('lego-result-save');
  const selected=Array.from(host.querySelectorAll('[data-lego-save-index]:checked'));
  if(!selected.length){toast(LEGO_UI_COPY.resultSave.empty,true);return;}
  let full=false;
  selected.some(box=>{
    const sentence=legoCompletedSentences[Number(box.getAttribute('data-lego-save-index'))];
    if(!sentence)return false;
    if(window.SentenceVault.isFull()&&!window.SentenceVault.has(sentence.th)){
      window.SentenceVault.addSentence(sentence.th,{zh:sentence.zh||'',source:sentence.custom?'lego-user-created':'lego'});
      full=true;return true;
    }
    window.SentenceVault.addSentence(sentence.th,{zh:sentence.zh||'',source:sentence.custom?'lego-user-created':'lego'});
    return false;
  });
  legoRenderResultSaveControls();
  const status=document.getElementById('lego-result-save-status');
  if(status)status.textContent=full?LEGO_UI_COPY.resultSave.full:LEGO_UI_COPY.resultSave.done;
}

function legoEndGame(){
  try{
    legoHideLockedPanels();
    const build=document.getElementById('buildPanel');if(build)build.classList.add('hidden');
    const count=legoCompletedSentences.length;
    document.getElementById('lego-result-count').textContent='完成 '+count+' 句';
    document.getElementById('lego-result-daily').textContent='今日完成造句：'+legoDailyActivity(false)+' 句';
    legoRenderSentenceRows(document.getElementById('lego-result-list'),false);
    legoRenderSentenceRows(document.getElementById('lego-result-detail-list'),true);
    legoRenderResultSaveControls();
    const result=document.getElementById('lego-result');result.classList.remove('hidden');
    if(window.GameFlow)GameFlow.enhanceResult({
      key:'lego-result',root:result,actions:'#lego-result .gsh-end-actions',correct:0,total:count,
      showFirstCorrect:false,dailyActivityText:'今日完成造句：'+legoDailyActivity(false)+' 句',onReplay:legoStartNewSession
    });
    legoClearResume();
  }catch(e){legoShowLockedError();}
}

function legoStartNewSession(){
  try{
    if(window.GameFlow)GameFlow.cancelResult('lego-result');
    legoCompletedSentences=[];
    legoClearResume();
    legoHideLockedPanels();
    clearAll();
    document.getElementById('buildPanel').classList.remove('hidden');
  }catch(e){legoShowLockedError();}
}

function legoShowDetail(){
  document.getElementById('lego-result').classList.add('hidden');
  document.getElementById('lego-result-detail').classList.remove('hidden');
}

function legoHideDetail(){
  document.getElementById('lego-result-detail').classList.add('hidden');
  document.getElementById('lego-result').classList.remove('hidden');
}

function legoPrintResult(){
  if(window.RoundReport&&typeof RoundReport.openPrint==='function'){
    const report=RoundReport.create({game_type:'lego',difficulty:null,mode:'sentence-builder'});
    legoCompletedSentences.forEach(sentence=>RoundReport.addItem(report,{
      content_ref:{source:'game_sentences',key:sentence.th},question:sentence.th,meaning:sentence.zh||'',
      attempts:[{answer:sentence.th,is_correct:true}],user_answer:sentence.th,correct_answer:sentence.th,is_correct:true,
      wrong_count:0,item_score:0,hint_used:null,linguistic:{custom:!!sentence.custom}
    }));
    if(RoundReport.openPrint({gameType:'lego',report:report,title:'泰語造句練習室・本輪報告',documentTitle:'泰語造句練習紀錄',showDifficulty:false,dailyCount:legoDailyActivity(false),summaryRows:[{label:'完成',value:legoCompletedSentences.length+' 句',primary:true}]}))return;
    toast('請允許彈出視窗才能列印／儲存學習紀錄',true);return;
  }
  const result=document.getElementById('lego-result');
  result.classList.add('lego-printing');
  const cleanup=()=>result.classList.remove('lego-printing');
  window.addEventListener('afterprint',cleanup,{once:true});
  window.print();
}


function loadExample(){
  const pool=EXAMPLES.filter(e=>(LEVELS[curLevel].exTags||[]).includes(e.tag));
  if(!pool.length) return;
  const ex=pool[exIdx%pool.length];exIdx++;
  SLOTS.forEach(s=>state[s.id]=null);
  ex.parts.forEach(([sl,th])=>{const w=findWord(sl,th);if(w)state[sl]=w;});
  openSlot=null;render();toast('範例：'+ex.zh);
}

// ════════ 拆句測驗คะแนน (高級 formula — ก็อปสูตรจาก word-order.html เป๊ะ ตาม Lin ยืนยัน 2026-07-05) ════════
// ⚠️ 2026-07-05: เกมนี้ "ไม่เข้าระบบดาวเงิน" (ตัด GAME_ACCOUNT.starsForRound/addStars ที่เดิมก็เป็น no-op อยู่แล้วออกไปเลย
//   กันสับสน) เหลือแค่คะแนนสกุลอ่อน (soft score) — ให้ตรงกับที่ Lin สั่ง "ไม่ต้องมีดาว แต่ได้คะแนนสกุลอ่อน"
const ROUND_COMPLETE_BONUS=20, ROUND_PERFECT_BONUS=50; // จบรอบ(5句) +20 · perfect(ทุกประโยคสะอาด) +50 เพิ่ม
const LEVEL_WEIGHT=2; // นับเป็น高級ทั้งเกม (Lin ยืนยัน 2026-07-05) → ×2 คงที่ คูณ "ทั้งรอบ" ตอนจบ
// ⚠️ 2026-07-05 (แก้ตาม Lin ยืนยันรอบ2): ไม่มีคอมโบคูณคะแนนเลย (ตัด legoComboMult ออก) — เหลือแค่คำทองอย่างเดียว
// legoCurCombo/legoMaxCombo ยังเก็บไว้ (ใช้แค่กับชาเลนจ์รายสัปดาห์ lego_combo5 เดิม ไม่เกี่ยวกับคะแนน)

// 2026-07-03 改版：以前是「複製句子」就給分，現在改成一定要按🧪測試、把打散的詞排對，才算數
const SENTENCES_PER_ROUND=5;
let sentencesThisRound=0;
// ⚡ คะแนนสะสมของรอบนี้ — เพิ่ม 2026-07-03 เพื่อโชว์หลอด 進度/⚡ เหมือนเกมอื่น
// ใช้ pts จริงที่ checkTestAnswer() คำนวณต่อการทดสอบผ่านแต่ละครั้ง ไม่ได้เดา/ให้คะแนนลอยๆ
let roundScoreLego=0;
// 2026-07-13 Lin：เก็บประโยคที่ต่อในรอบนี้ไว้ทำ wrong_items (ฐานข้อมูลจุดอ่อน) — ดัน entry ทุกครั้งที่ทดสอบผ่าน (checkTestAnswer)
// แล้วส่งไปกับ saveScore ตอนจบรอบ (finishLegoRound) จากนั้นล้างทิ้งเริ่มรอบใหม่
let legoRoundLog=[];
function legoWrongItemsFromLog(){
  try{ return legoRoundLog.filter(function(w){return (w.wrong||0)>0;}); }
  catch(e){ return []; }
}

// Lin 2026-07-06: สีหลอดคะแนนต่อข้อ ทองเข้ม→แดง (ชุดเดียวทุกเกม)
function legoScoreBarColor(sc,max){ if(sc<=0)return '#b83227'; var f=Math.max(0,Math.min(1,sc/(max||10))); var hue=f>=0.4?40:Math.round(40*(f/0.4)); var light=f>=0.4?42:38; return 'hsl('+hue+',78%,'+light+'%)'; }
// 本題分數: โชว์ "ชีวิต" ที่เหลือของข้อทดสอบนี้ 10→0 ไล่สีทอง→แดง (sc ว่าง = ข้อใหม่ เต็ม 10)
function updateLegoScoreBar(sc){ var max=SENTENCE_LIFE_START||10; if(sc==null)sc=max; sc=Math.max(0,sc); var col=legoScoreBarColor(sc,max), w=Math.max(0,Math.min(100,sc/max*100))+'%'; var pw=document.getElementById('lego-test-ws-fill'); if(pw){pw.style.width=w; pw.style.background=col;} var pn=document.getElementById('lego-test-ws-num'); if(pn)pn.textContent=sc; }
// อัปเดตหลอด 進度 + 本題分數 บนหน้าเกม (ไม่แตะ logic ดาว/streak เดิม)
function legoRefreshBars(){
  const pf=document.getElementById('lego-pf');
  if(pf) pf.style.width=Math.min(100,(sentencesThisRound/SENTENCES_PER_ROUND)*100)+'%';
  const pt=document.getElementById('lego-prog-txt');
  if(pt) pt.textContent=sentencesThisRound+'/'+SENTENCES_PER_ROUND;
  try{ updateLegoScoreBar(typeof testLife==='number'?testLife:null); }catch(e){ updateLegoScoreBar(null); }
}

// ════════════════════════════════════════════════════════════
// v2 (LIN 2026-07-26): เพดานเล่นต่อวัน — ไม่ล็อกอิน 2 ประโยค/วัน · ล็อกอิน (ยังไม่จ่ายเงิน) 5 ประโยค/วัน
// (ระบบสมาชิกจ่ายเงินยังไม่ทำตอนนี้ พักไว้ทำอนาคตตามที่ Lin สั่ง — เพดานสูงสุดตอนนี้คือ 5)
//
// ⚠️ เปลี่ยนจาก localStorage (เพดานนุ่ม ล้างเบราว์เซอร์/เปิด incognito ข้ามได้) เป็นนับที่เซิร์ฟเวอร์
// (เพดานแข็ง) ตามที่ Lin สั่ง 2026-07-26: "ข้ามไม่ได้ทั้งล็อกอินและไม่ล็อกอิน เกมนี้จะเป็นตัวหลักในการหาเงินต่อไป"
// ผ่าน Edge Function lego-daily-limit (ดู supabase/functions/lego-daily-limit/index.ts +
// supabase/sql/2026-07-26_lego_daily_limits.sql) — นับ 1 ครั้งทุกครั้งที่กด "🧪測試" (ก่อนเริ่มทำโจทย์
// ไม่ใช่ตอนทำผ่าน — กันกรณีเริ่มแล้วไม่ทำต่อ ยังนับเป็น 1 ครั้งที่ใช้โควต้าไปแล้ว)
//
// วิธีระบุตัวตน: ล็อกอิน → ผูกกับ user id จริง (ล้างเบราว์เซอร์ไม่ช่วย) · ไม่ล็อกอิน → ผูกกับ IP (hash ไว้)
// ⚠️ ข้อจำกัดที่ Lin ควรรู้ (บอกตรง ๆ ไม่ใช่ทำเนียนว่าแข็ง 100%): กันคนไม่ล็อกอินด้วย IP แก้ปัญหา
// "ล้าง localStorage/เปิด incognito" ได้จริง (IP ไม่เปลี่ยนตามการล้างข้อมูลเบราว์เซอร์) แต่ยังมีช่องโหว่
// เดียวที่เหลือ: สลับเครือข่าย (WiFi → 4G, เปิด VPN, มือถือคนละเครื่อง) จะได้ IP ใหม่ = โควต้าใหม่
// นี่คือขีดจำกัดมาตรฐานของการจำกัดคนไม่มีบัญชีจริง — ถ้าต้องการแข็ง 100% จริง ๆ ต้องบังคับล็อกอินก่อนเล่น
// เกมนี้เท่านั้น (ตัดสินใจแยกต่างหาก ยังไม่ได้ทำตอนนี้ เพราะเดิมตกลงว่า "ไม่บังคับล็อกอิน")
// v2: fail-closed โดยตั้งใจ (เช็คไม่ได้ = "ไม่ให้ผ่าน" ไม่ใช่ปล่อยผ่าน) — ตรงตามที่ Lin สั่ง "ข้ามไม่ได้"
// ข้อเสียที่ Lin ควรรู้: ถ้า Supabase/เน็ตมีปัญหาจริง ๆ (ไม่ใช่แค่คนพยายามข้าม) เกมนี้จะเล่นไม่ได้ชั่วคราว
// ทั้งเว็บจนกว่าจะกลับมาปกติ — เป็น trade-off ที่จำเป็นถ้าจะเอาเพดานแข็งจริง (เลือกฝั่ง "กันเงินรั่ว"
// มากกว่า "กันเกมล่ม" เพราะ Lin บอกว่าเกมนี้จะเป็นตัวหลักในการหาเงิน)
var legoQuotaPendingAttempt=null;
function legoQuotaRequestId(){
  try{ if(window.crypto&&crypto.randomUUID) return crypto.randomUUID(); }catch(e){}
  var bytes=new Uint8Array(16);
  try{ crypto.getRandomValues(bytes); }catch(e2){ for(var i=0;i<16;i++) bytes[i]=(Math.random()*256)|0; }
  bytes[6]=(bytes[6]&15)|64; bytes[8]=(bytes[8]&63)|128;
  var h=Array.prototype.map.call(bytes,function(b){return('0'+b.toString(16)).slice(-2);}).join('');
  return h.slice(0,8)+'-'+h.slice(8,12)+'-'+h.slice(12,16)+'-'+h.slice(16,20)+'-'+h.slice(20);
}
function legoQuotaOwnerSnapshot(){
  try{
    var auth=window.SITE_AUTH;
    if(!auth) return null;
    var uid=auth.user&&auth.user.id?String(auth.user.id):'';
    var bound=auth.learningOwnerId?String(auth.learningOwnerId):'';
    if(uid!==bound) return null;
    return {uid:uid,epoch:Number(auth.learningOwnerEpoch)||0};
  }catch(e){return null;}
}
function legoQuotaSameOwner(owner){
  var current=legoQuotaOwnerSnapshot();
  return !!current&&current.uid===owner.uid&&current.epoch===owner.epoch;
}
function legoQuotaAttempt(owner){
  if(!legoQuotaPendingAttempt||legoQuotaPendingAttempt.uid!==owner.uid||legoQuotaPendingAttempt.epoch!==owner.epoch){
    legoQuotaPendingAttempt={requestId:legoQuotaRequestId(),uid:owner.uid,epoch:owner.epoch};
  }
  return legoQuotaPendingAttempt;
}
function legoQuotaWait(ms){return new Promise(function(resolve){setTimeout(resolve,ms);});}
async function legoCheckDailyQuota(){
  try{
    var sb = window.getSupabaseClient ? window.getSupabaseClient() : null;
    if(!sb) return {ok:false, reason:'no_client'};
    if(!window.NetworkGuard||typeof NetworkGuard.request!=='function') return {ok:false,reason:'no_client'};
    var owner=legoQuotaOwnerSnapshot();
    if(!owner) return {ok:false,reason:'owner_unresolved'};
    var attempt=legoQuotaAttempt(owner);
    var headers = {};
    try{
      var sres = await NetworkGuard.request(function(){return sb.auth.getSession();},'lego-quota-session',{},5000,null);
      var session=sres&&sres.data&&sres.data.session;
      var sessionUid=session&&session.user&&session.user.id?String(session.user.id):'';
      if(sessionUid!==owner.uid||!legoQuotaSameOwner(owner)) return {ok:false,reason:'owner_changed'};
      var token = session && session.access_token;
      if(token) headers.Authorization = 'Bearer ' + token;
    }catch(e){return {ok:false,reason:'network'};}
    for(var requestAttempt=0;requestAttempt<2;requestAttempt++){
      var res;
      try{
        res=await NetworkGuard.request(function(){
          return sb.functions.invoke('lego-daily-limit',{headers:headers,body:{request_id:attempt.requestId}});
        },'lego-daily-limit',{},12000,null);
      }catch(requestError){
        if(requestAttempt===0){await legoQuotaWait(800);continue;}
        return {ok:false,reason:'network'};
      }
      if(!legoQuotaSameOwner(owner)) return {ok:false,reason:'owner_changed'};
      if(res.error||!res.data){
        if(requestAttempt===0){await legoQuotaWait(800);continue;}
        console.warn('[lego-daily-limit] เช็คโควต้าไม่ได้:',res.error);
        return {ok:false,reason:'network'};
      }
      if(res.data.requestId!==attempt.requestId) return {ok:false,reason:'invalid_response'};
      if(legoQuotaPendingAttempt===attempt) legoQuotaPendingAttempt=null;
      return Object.assign({},res.data,{_owner:owner});
    }
    return {ok:false,reason:'network'};
  }catch(e){
    console.warn('[lego-daily-limit] error:', e);
    return {ok:false, reason:'network'};
  }
}

// จบรอบ (ทุก SENTENCES_PER_ROUND ประโยคที่ "ผ่าน") → +20/+50 perfect + ×2 高級倍率 แล้วเซฟลงลีก
// ไม่มีดาวเงินอีกต่อไป (ตามที่ Lin สั่ง 2026-07-05) — GAME_ACCOUNT.getStars()/badges ที่โชว์อยู่คือดาวจากเกมอื่นที่มี SRS เท่านั้น
function finishLegoRound(){
  // v2 (LIN 2026-07-26): เดิมนับโควต้าตรงนี้ (ตอน "ทำผ่าน") ย้ายไปนับที่ startTest() แทนแล้ว
  // (ตอน "เริ่มทดสอบ" ผ่าน Edge Function lego-daily-limit — ดูคอมเมนต์เต็มด้านบน legoCheckDailyQuota())
  sentencesThisRound++;
  if(sentencesThisRound<SENTENCES_PER_ROUND){legoRefreshBars();return null;}
  const count=sentencesThisRound;
  const cleanCount=legoCleanThisRound;
  const comboSnapshot=legoMaxCombo;
  const isPerfect=(cleanCount===count && count>0);
  const roundBonus=ROUND_COMPLETE_BONUS+(isPerfect?ROUND_PERFECT_BONUS:0);
  roundScoreLego+=roundBonus;
  const weightedScore=Math.round(roundScoreLego*LEVEL_WEIGHT);
  try{ if(window.gtag) gtag('event', 'lego_complete', {category:'game', score: weightedScore, total: count, perfect: isPerfect}); }catch(e){}
  try{ if(window.gtag) gtag('event', 'game_complete', {category:'game', game:'lego', score: weightedScore, total: count}); }catch(e){}
  sentencesThisRound=0;
  roundScoreLego=0;
  legoCleanThisRound=0;
  legoMaxCombo=0;
  legoNextTestGolden=true; // กฎ2026-07-05: ทดสอบผ่านครบรอบแล้ว → ประโยคถัดไป (ที่6) การันตีคำทอง ×2
  legoRefreshBars();
  if(window.GAME_ACCOUNT){GAME_ACCOUNT.bumpStreakToday();}
  try{ legoChallengeRecordProgress(cleanCount,count,comboSnapshot); }catch(e){}
  // 存分數到共用排行榜（'lego' key 已在 reading-auth.js 註冊，跟 word_order 分開算，不會混榜）
  try{ if(window.READING_AUTH && READING_AUTH.saveScore) READING_AUTH.saveScore(weightedScore,1,'lego',legoWrongItemsFromLog()); }catch(e){}   // เฟส 3: แนบประโยคที่พลาด — 2026-07-13
  legoRoundLog=[]; // ล้างรอบ กันข้อมูลรอบเก่าค้างไปติดรอบถัดไป
  try{
    const _sv=legoApplyStreak();
    if(_sv.events.freezeUsed) setTimeout(()=>toast('護盾幫你保住連續紀錄！🛡️'),900);
    if(_sv.events.freezeEarned) setTimeout(()=>toast('獲得新護盾 🛡️ ×1！連續'+_sv.state.streak+'天'),900);
  }catch(e){}
  try{ legoRenderGameBar(); }catch(e){}
  refreshLegoAcctUI();
  // เกมฟรี: นับรอบ + เด้งคำเชิญ "ขอ單字速查表" ครั้งเดียวหลัง ~5 รอบ (ปิดได้เล่นต่อ · เหมือนเกมอื่น)
  setTimeout(function(){ if (window.VocabPopup) window.VocabPopup.maybe(); }, 1100);
  return '🎉 完成一輪（'+count+' 句）！本輪 +'+weightedScore+' 分'+(isPerfect?'・全部乾淨過關 ✨':'')+'（已含 ×'+LEVEL_WEIGHT+' 高級倍率）· 下一句是 ✨黃金句 ×2，記得測試！';
}

function copySentence(){
  if(!state.subj||!state.verb){toast('至少要有「主語」和「動詞」',true);return;}
  const active=activeSlots();
  const skip=new Set();
  let sentence='';
  active.forEach(s=>{
    if(skip.has(s.id)) return;
    const w=state[s.id];if(!w) return;
    if(s.id==='adv'&&state.advObj){sentence+=w.th+state.advObj.th;skip.add('advObj');}
    else sentence+=w.th;
  });
  if(navigator.clipboard) navigator.clipboard.writeText(sentence);
  toast('已複製：'+sentence);
}

// ════════ 帳號 UI：星星／勳章／連續天數／每週挑戰（跟其他遊戲共用同一套 GAME_ACCOUNT＋streak）════════
let legoCleanThisRound=0, legoCurCombo=0, legoMaxCombo=0;

const BADGE_STAGES=[
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
function badgeEmoji(n){let e='🌱';BADGE_STAGES.forEach(s=>{if(n>=s.min)e=s.emoji;});return e;}

function refreshLegoAcctUI(){
  const stars=window.GAME_ACCOUNT?GAME_ACCOUNT.getStars():0;
  const badges=window.GAME_ACCOUNT?GAME_ACCOUNT.earnedBadges().length:0;
  const sc=document.getElementById('star-count'); if(sc) sc.textContent=stars;
  const bc=document.getElementById('badge-count'); if(bc) bc.textContent=badges;
  const be=document.getElementById('badge-emoji'); if(be) be.textContent=badgeEmoji(badges);
  const vc=document.getElementById('lego-vault-count'); if(vc) vc.textContent=window.LegoVault?LegoVault.count():0;
  legoRenderLoginCTA();
}

// Lin 2026-07-06: CTA ชวนล็อกอิน (MASTER ข้อ13) — เดิมเลโก้ไม่มี · ก็อปแพทเทิร์นจากเกมเรียงคำ + เสียงมีนา
function legoLoggedIn(){ try{ return !!(window.READING_AUTH && READING_AUTH.user); }catch(e){ return false; } }
function legoRenderLoginCTA(){
  var el=document.getElementById('rg-cta-login'); if(!el) return;
  if(legoLoggedIn()){ el.innerHTML=''; return; }
  el.innerHTML='<div style="background:#FAEEDA;border:0.5px solid #EF9F27;border-radius:12px;padding:12px 14px;font-family:\'Noto Sans TC\',sans-serif;box-sizing:border-box;">'+
    '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">'+
      '<span style="font-size:14px;color:#633806;font-weight:700;flex:1;min-width:180px;">👧🏻 米娜：登入後才能幫你把進度存起來喔！</span>'+
      '<button onclick="try{if(window.gtag)gtag(\'event\',\'lego_cta_login_click\',{category:\'game\'});}catch(e){}legoCtaLogin()" style="background:#BA7517;color:#fff;border:none;font-weight:700;padding:6px 16px;border-radius:8px;font-size:13px;cursor:pointer;">登入解鎖 →</button>'+
      '<button onclick="var d=document.getElementById(\'lego-cta-detail\');var s=d.style.display===\'none\';d.style.display=s?\'block\':\'none\';this.textContent=s?\'收起 ▲\':\'更多福利 ▾\';" style="background:transparent;border:none;color:#854F0B;font-size:13px;cursor:pointer;font-weight:700;">更多福利 ▾</button>'+
    '</div>'+
    '<div id="lego-cta-detail" style="display:none;margin-top:10px;border-top:0.5px solid #EF9F27;padding-top:10px;font-size:13px;color:#633806;line-height:1.8;">'+
      '✅ 登入後可以：<br>💾 把你的進度和連續紀錄存起來<br>🔖 造句單字庫：把喜歡的單字存起來（最多15個）<br>🧠 智慧複習，記住你學會了哪些句子<br>🏆 登上排行榜和大家一起比<br>📈 下次打開，直接練你的弱點' +
    '</div></div>';
}
function legoCtaLogin(){ try{ var b=document.querySelector('#rg-login-slot button'); if(b){b.click();return;} }catch(e){} }

// Lin 2026-07-07 (4.4): 造句單字庫 — คลังคำเฉพาะเลโก้ 15 คำ (แยกจาก word-vault ปกติ) · ต้องล็อกอินก่อน
function legoVaultSave(th, zh){
  if(!window.LegoVault) return;
  if(!legoLoggedIn()){ toast('登入後才能存進「造句單字庫」喔 👧🏻'); legoCtaLogin(); return; }
  if(LegoVault.has(th)){
    LegoVault.removeWord(th);
    toast('已從造句單字庫移除「'+th+'」');
  } else {
    if(LegoVault.isFull()){ toast('造句單字庫已滿（'+LegoVault.MAX_WORDS+'/'+LegoVault.MAX_WORDS+'），先移除舊的再存新的喔',true); return; }
    LegoVault.addWord(th, {zh: zh});
    toast('已加入造句單字庫「'+th+'」（'+LegoVault.count()+'/'+LegoVault.MAX_WORDS+'）');
  }
  try{ renderBaseplate(); }catch(e){}
  var vc=document.getElementById('lego-vault-count'); if(vc) vc.textContent=LegoVault.count();
}

function legoVaultOpen(){
  if(!window.LegoVault) return;
  var old=document.getElementById('lego-vault-modal'); if(old) old.remove();
  var list=LegoVault.getAll();
  var ov=document.createElement('div');
  ov.id='lego-vault-modal';
  ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;';
  var rows = list.length ? list.map(function(w){
    return '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 4px;border-bottom:1px solid rgba(139,99,16,.15);">'+
      '<div><span style="font-family:Sarabun,sans-serif;font-weight:700;color:var(--gold-deep);font-size:16px;">'+w.th+'</span> <span style="color:var(--ink-muted);font-size:12.5px;">'+w.zh+'</span></div>'+
      '<button onclick="try{if(window.gtag)gtag(\'event\',\'lego_vault_word_remove\',{category:\'game\'});}catch(e){}LegoVault.removeWord(\''+w.th+'\');legoVaultOpen();try{renderBaseplate();}catch(e){}" style="border:none;background:none;color:#c4574f;cursor:pointer;font-size:13px;">移除</button></div>';
  }).join('') : '<div style="color:var(--ink-muted);font-size:13px;text-align:center;padding:20px 0;">還沒有存任何單字，去下拉選單點📑試試看！</div>';
  ov.innerHTML='<div style="background:#fff;border-radius:16px;max-width:340px;width:100%;max-height:70vh;overflow:auto;padding:20px;box-shadow:0 18px 50px rgba(0,0,0,.3);box-sizing:border-box;">'+
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">'+
      '<h3 style="margin:0;font-family:\'Noto Serif TC\',serif;font-size:17px;color:var(--gold-deep);">📑 造句單字庫（'+list.length+'/'+LegoVault.MAX_WORDS+'）</h3>'+
      '<button onclick="try{if(window.gtag)gtag(\'event\',\'lego_vault_modal_close\',{category:\'game\'});}catch(e){}document.getElementById(\'lego-vault-modal\').remove()" style="border:none;background:none;font-size:20px;color:#B0A080;cursor:pointer;">✕</button>'+
    '</div>'+rows+'</div>';
  ov.addEventListener('click',function(e){ if(e.target===ov) ov.remove(); });
  document.body.appendChild(ov);
}

// Lin 2026-07-25: ⭐ ปุ่มดาว แยกออกจากปุ่ม勳章(openBadge) — โชว์แค่จำนวนดาวสะสม ไม่มีตารางแบดจ์
function openStar(){
  const s=window.GAME_ACCOUNT?GAME_ACCOUNT.getStars():0;
  document.getElementById('star-tree-area').textContent='⭐ '+s;
  document.getElementById('star-tree-caption').textContent='累積星星（全部遊戲共用）';
  document.getElementById('star-modal').classList.add('show');
}
function openBadge(){
  const s=window.GAME_ACCOUNT?GAME_ACCOUNT.getStars():0;
  const badges=window.GAME_ACCOUNT?GAME_ACCOUNT.starBadges:[];
  let html='<div style="display:flex;flex-wrap:wrap;gap:10px;justify-content:center;margin-top:6px;">';
  badges.forEach(b=>{
    const got=s>=b.at;
    html+='<div style="text-align:center;width:74px;opacity:'+(got?'1':'0.35')+';">'+
      '<img src="'+b.img+'" alt="'+b.zh+'" style="width:44px;height:44px;object-fit:contain;" onerror="this.replaceWith(document.createTextNode(\''+b.emoji+'\'))">'+
      '<div style="font-size:11px;color:var(--gold-deep);margin-top:2px;">'+b.zh+'</div>'+
      '<div style="font-size:10px;color:var(--ink-muted);">'+(got?'已解鎖':b.at+' 顆星')+'</div></div>';
  });
  html+='</div>';
  document.getElementById('star-prog').innerHTML=html;
  const next=badges.filter(b=>s<b.at)[0];
  document.getElementById('star-prog-label').textContent=next?('再 '+(next.at-s)+' 顆星解鎖「'+next.zh+'」'):'全部稻米品種已解鎖！🎉';
  document.getElementById('badge-modal').classList.add('show');
}

// 連續天數／護盾：跟聲調・拼讀・打字・語序練習室共用同一個 key，練哪個遊戲都算連續天數
const TF_STREAK_KEY='tf_streak_v1';
const LEGO_GAME_CFG={STREAK_FREEZE_EARN_EVERY:7,STREAK_FREEZE_MAX:2};

function legoLoadStreak(){try{return JSON.parse(localStorage.getItem(TF_STREAK_KEY)||'{}')||{};}catch(e){return {};}}
function legoSaveStreak(s){try{localStorage.setItem(TF_STREAK_KEY,JSON.stringify(s));}catch(e){}}
function legoTodayStr(){const d=new Date();return d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2);}
function legoYestStr(){const d=new Date();d.setDate(d.getDate()-1);return d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2);}

function legoApplyStreak(){
  const s=legoLoadStreak(), cfg=LEGO_GAME_CFG, today=legoTodayStr(), yest=legoYestStr();
  const streakEv={freezeUsed:false,freezeEarned:0};
  if(s.lastPlay!==today){
    if(s.lastPlay===yest){ s.streak=(s.streak||0)+1; }
    else if(s.lastPlay&&(s.freezes||0)>0){ s.freezes-=1; s.streak=(s.streak||0)+1; streakEv.freezeUsed=true; }
    else{ s.streak=1; }
    if(cfg.STREAK_FREEZE_EARN_EVERY>0&&s.streak%cfg.STREAK_FREEZE_EARN_EVERY===0&&(s.freezes||0)<cfg.STREAK_FREEZE_MAX){
      s.freezes=(s.freezes||0)+1; streakEv.freezeEarned=1;
    }
    s.lastPlay=today;
  }
  legoSaveStreak(s);
  return {state:s, events:streakEv};
}

// ════════ Lego Weekly Challenge — 2026-08-12 REBUILD (Lin อนุมัติ) ════════
// เดิม (ก่อน 2026-08-12): global auto-rotate ตาม Date.now() ล้วน, เก็บ progress ใน localStorage
// (LEGO_CH_KEY='lego_challenge_v1') ไม่ผูกบัญชี ไม่ sync ข้ามเครื่อง ไม่มีให้เลือกวัน — ไม่ตรง Decision
// (ผู้เรียนเลือก weekday เอง · 1 ครั้ง/สัปดาห์ · เปลี่ยนวันรอ 14 วัน)
// ตอนนี้: state ทั้งหมดอยู่ฝั่งเซิร์ฟเวอร์ (ตาราง lego_challenge_state + RPC 3 ตัว — ดู
// supabase/sql/2026-08-12_lego_weekly_challenge_schema.sql) กฎ 14 วัน enforce ในฟังก์ชัน SQL
// (SECURITY DEFINER) เท่านั้น ไม่เชื่อ client — Guest ไม่มีระบบคู่ขนานอีกต่อไปตามที่ Lin สั่งชัดเจน
// (เล่น Lego ปกติได้เต็มที่ แต่ Weekly Challenge ต้อง login เท่านั้น ไม่มี fallback localStorage)
// LEGO_CHALLENGES ยังเก็บไว้เป็นแหล่งข้อความแสดงผล (title/sub/emoji) — target/type จริงตัดสินที่
// lego_challenge_defs ฝั่งฐานข้อมูล (กันโกงผ่านยิง RPC ตรง) 🔑 แก้เนื้อหาชาเลนจ์ในอนาคตต้องแก้ 2 ที่พร้อมกัน
const LEGO_CHALLENGES=[
  {id:'lego_correct15',title:'測驗過關 15 句',sub:'本週拆句測驗累積過關 15 句',type:'correct',target:15,emoji:'🎯'},
  {id:'lego_rounds3',  title:'完成 3 輪測驗', sub:'本週完成 3 輪（每輪 '+SENTENCES_PER_ROUND+' 句）拆句測驗',type:'sets',target:3,emoji:'📚'},
  {id:'lego_perfect2', title:'2 輪全對過關',  sub:'本週有 2 輪測驗，'+SENTENCES_PER_ROUND+' 句都第一次就排對',type:'perfect',target:2,emoji:'🌟'},
  {id:'lego_combo5',   title:'連續排對 5 句', sub:'本週連續一次就測驗排對達 5 句',type:'combo',target:5,emoji:'🔥'},
  {id:'lego_correct30',title:'測驗過關 30 句',sub:'本週拆句測驗累積過關 30 句',type:'correct',target:30,emoji:'💪'}
];
const LEGO_WEEKDAY_NAMES=['週日','週一','週二','週三','週四','週五','週六'];

let legoChallengeState=null;          // cache ล่าสุดจากเซิร์ฟเวอร์ (jsonb จาก lego_challenge_get_state)
let legoChallengeLoading=false;
let legoChallengeLastLoginState=null; // กันยิง RPC ซ้ำถ้า login state ไม่เปลี่ยนและมี cache อยู่แล้ว

function legoChallengeDefById(id){ return LEGO_CHALLENGES.find(function(c){return c.id===id;}); }

// เรียกได้บ่อย (ทุกครั้งที่ legoRenderGameBar ทำงาน) — มี guard กันยิงซ้ำในตัวแล้ว
async function legoChallengeRefresh(force){
  var loggedIn=legoLoggedIn();
  if(!loggedIn){
    legoChallengeState=null;
    legoChallengeLastLoginState=false;
    legoRenderChallengeBanner();
    return;
  }
  if(!force && legoChallengeLastLoginState===true && legoChallengeState){ legoRenderChallengeBanner(); return; }
  if(legoChallengeLoading) return;
  legoChallengeLoading=true;
  try{
    var res=await window.__SB_CLIENT.rpc('lego_challenge_get_state');
    if(res.error) throw res.error;
    legoChallengeState=res.data;
    legoChallengeLastLoginState=true;
  }catch(e){
    legoChallengeState=null;
    try{ console.warn('[lego-challenge] get_state failed', e); }catch(_e){}
  }
  legoChallengeLoading=false;
  legoRenderChallengeBanner();
}

async function legoChallengeChooseWeekday(weekday){
  if(!legoLoggedIn()){ legoCtaLogin(); return; }
  try{
    var res=await window.__SB_CLIENT.rpc('lego_challenge_set_weekday',{p_weekday:weekday});
    if(res.error) throw res.error;
    legoChallengeState=res.data;
    legoChallengeLastLoginState=true;
    legoRenderChallengeBanner();
  }catch(e){
    toast('設定失敗，請稍後再試 🙏',true);
    try{ console.warn('[lego-challenge] set_weekday failed', e); }catch(_e){}
  }
}

// เรียกจาก finishLegoRound() แทน legoChallengeBump เดิม — Guest ไม่ทำอะไรเลย (ตั้งใจ ไม่มี fallback)
async function legoChallengeRecordProgress(cleanCount,totalCount,comboSnapshot){
  if(!legoLoggedIn()) return;
  try{
    var res=await window.__SB_CLIENT.rpc('lego_challenge_record_progress',{
      p_clean_count:cleanCount, p_total_count:totalCount, p_combo_snapshot:comboSnapshot
    });
    if(res.error) throw res.error;
    var wasNotDone=!(legoChallengeState&&legoChallengeState.done);
    legoChallengeState=res.data;
    if(res.data&&res.data.just_completed&&wasNotDone){
      var def=legoChallengeDefById(res.data.challenge_id);
      toast('🎉 完成本週挑戰：'+(def?def.title:'')+'！');
    }
    legoRenderChallengeBanner();
  }catch(e){
    // ล้มเหลวเงียบๆ ไม่ block gameplay หลัก (คะแนน/SRS ยังบันทึกปกติทางอื่นแยกจากกัน) แต่ log ไว้ debug
    try{ console.warn('[lego-challenge] record_progress failed', e); }catch(_e){}
  }
}

function legoWeekdayPickerHtml(currentActive){
  var btns='';
  for(var i=0;i<7;i++){
    var active=(currentActive===i)?' active':'';
    btns+='<button type="button" class="lego-wd-btn'+active+'" onclick="legoChallengeChooseWeekday('+i+')">'+LEGO_WEEKDAY_NAMES[i]+'</button>';
  }
  return '<div class="lego-wd-picker">'+btns+'</div>';
}

function legoChallengeToggleWeekdayPicker(){
  var el=document.getElementById('lego-wd-picker-slot');
  if(el) el.style.display=(el.style.display==='none')?'block':'none';
}

function legoRenderChallengeBanner(){
  var ban=document.getElementById('rg-challenge-banner');
  if(!ban) return;

  if(!legoLoggedIn()){
    ban.innerHTML='<div class="tf-challenge-banner locked">'+
      '<div class="tf-ch-top"><span class="tf-ch-emoji">🔒</span>'+
      '<span class="tf-ch-title">登入後可設定每週挑戰日</span></div>'+
      '<div class="tf-ch-sub">造句遊戲隨時都能玩，但「每週挑戰」要先登入才能開始 💪'+
      '<button type="button" onclick="legoCtaLogin()" class="lego-wd-change-btn" style="margin-left:8px;background:#BA7517;color:#fff;">登入解鎖 →</button></div>'+
    '</div>';
    return;
  }

  var st=legoChallengeState;
  if(!st){
    ban.innerHTML='<div class="tf-challenge-banner"><div class="tf-ch-sub">每週挑戰載入中…</div></div>';
    return;
  }

  if(!st.has_weekday){
    ban.innerHTML='<div class="tf-challenge-banner">'+
      '<div class="tf-ch-top"><span class="tf-ch-emoji">📅</span><span class="tf-ch-title">選一天當作你的「每週挑戰日」</span></div>'+
      '<div class="tf-ch-sub">選好之後每到這天挑戰會重新開始一次（之後要換日期，需要等 14 天才會生效）</div>'+
      legoWeekdayPickerHtml(null)+
    '</div>';
    return;
  }

  var def=legoChallengeDefById(st.challenge_id);
  var target=(def&&def.target)||st.target||0;
  var pct=target?Math.min(100,Math.round(st.progress/target*100)):0;
  var cycleEndMs=st.cycle_end?new Date(st.cycle_end+'T00:00:00+08:00').getTime():0; // Asia/Taipei = UTC+8
  var daysLeft=cycleEndMs?Math.max(0,Math.ceil((cycleEndMs-Date.now())/86400000)):0;
  var pendingHtml='';
  if(st.pending_weekday!==null&&st.pending_weekday!==undefined){
    pendingHtml='<div class="tf-ch-pending">⏳ 已申請改成'+LEGO_WEEKDAY_NAMES[st.pending_weekday]+'，還要等 '+st.pending_days_left+' 天才會生效</div>';
  }
  ban.innerHTML='<div class="tf-challenge-banner'+(st.done?' done':'')+'">'+
      '<div class="tf-ch-top">'+
        '<span class="tf-ch-emoji">'+(def?def.emoji:'🎯')+'</span>'+
        '<span class="tf-ch-title">本週挑戰：'+(def?def.title:'')+(st.done?' ✅ 完成！':'')+'</span>'+
        '<span class="tf-ch-left">⏳ '+daysLeft+' 天</span>'+
      '</div>'+
      '<div class="tf-ch-bar"><div class="tf-ch-fill" style="width:'+pct+'%;"></div></div>'+
      '<div class="tf-ch-sub">'+(def?def.sub:'')+'　'+st.progress+' / '+target+
        ' <button type="button" class="lego-wd-change-btn" onclick="legoChallengeToggleWeekdayPicker()">更改挑戰日</button></div>'+
      pendingHtml+
      '<div id="lego-wd-picker-slot" style="display:none;margin-top:8px;">'+legoWeekdayPickerHtml(st.active_weekday)+'</div>'+
    '</div>';
}

function legoRenderGameBar(){
  const st=legoLoadStreak();
  const alive=st.streak>0&&(st.lastPlay===legoTodayStr()||legoYestStr()===st.lastPlay);
  const sn=document.getElementById('rg-streak-num'); if(sn) sn.textContent=(alive?(st.streak||0):0);
  const fn=document.getElementById('rg-freeze-num'); if(fn) fn.textContent=(st.freezes||0);
  try{ legoChallengeRefresh(); }catch(e){} // ผูกกับ hook เดิมที่ reading-auth.js เรียกอยู่แล้วทุกครั้งที่ auth state เปลี่ยน
}

// ════════ TEST: 拆句測驗（點打散的詞塊排回原順序，通過才計入 SENTENCES_PER_ROUND） ════════
// กฎ 2026-07-05 (ก็อปสูตร word-order.html เป๊ะ ตาม Lin ยืนยัน): "ชีวิต" เริ่ม 10 · เรียงผิดครั้งที่1/2/3/4 หัก 3/3/3/1
// (รวม=10 พอดี → ผิดครบ4=ตายพอดี ตรงตาราง 10,7,4,1,0) · 提示 หักครั้งละ 2 จากพูลเดียวกัน ไม่จำกัดจำนวนครั้ง
// ชีวิตถึง 0 เมื่อไหร่ (ไม่ว่าจากผิดหรือจาก提示) = ตายทันที เฉลย 0 แต้ม
const SENTENCE_LIFE_START=10;
const WRONG_DEDUCT=[3,3,3,1];
const HINT_DEDUCT=2;
// ⚠️ 2026-07-05 (แก้ตาม Lin ยืนยันรอบ2): คำทองไม่ใช่สุ่มแล้ว — เป็นแบบกำหนดแน่: ทดสอบผ่านครบ 5 ประโยค (1 รอบ)
// แล้ว "ประโยคถัดไป" (ที่ 6) จะเป็นคำทองการันตี ×2 เสมอ (เงื่อนไข = ต้องกดทดสอบผ่านครบทุกประโยคของรอบก่อนหน้าจริง
// ซึ่งบังคับอยู่แล้วเพราะ sentencesThisRound นับเฉพาะตอนทดสอบผ่านเท่านั้น — ดู finishLegoRound())
const GOLDEN_SENTENCE_MULT=2;
let legoNextTestGolden=false; // ตั้งเป็น true ตอนจบรอบ (finishLegoRound) แล้วถูก "ใช้" ครั้งเดียวตอน startTest() ครั้งถัดไป
let testWords=[], testOrder=[], testAnswer=[], testUsed={}, testLocked=false;
let testWrongCount=0, testLife=SENTENCE_LIFE_START, testHintUsed=false, testGolden=false, testFailed=false;

function shuffleArr(arr){
  const a=arr.slice();
  for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}
  return a;
}

function updateTestHintWarning(){
  const w=document.getElementById('testHintWarn');
  if(!w) return;
  const wouldKill=!testLocked && (testLife-HINT_DEDUCT)<=0;
  w.style.display=wouldKill?'':'none';
}

function getSentenceWords(){
  const active=activeSlots();
  const skip=new Set();
  const words=[];
  active.forEach(s=>{
    if(skip.has(s.id)) return;
    const w=state[s.id]; if(!w) return;
    if(s.id==='adv'&&state.advObj){
      words.push({th:w.th+state.advObj.th, zh:w.zh+'・'+state.advObj.zh});
      skip.add('advObj');
    }else{
      words.push({th:w.th, zh:w.zh});
    }
  });
  return words;
}

let legoQuotaCheckInFlight=false; // v2 (LIN 2026-07-26): กันกดรัว ๆ ยิง Edge Function ซ้อนกัน (แต่ละครั้งกินโควต้า 1 หน่วยจริง)
async function startTest(){
  if(!state.subj||!state.verb){toast('至少要有「主語」和「動詞」',true);return;}
  if(legoQuotaCheckInFlight) return; // กำลังเช็คโควต้าค้างอยู่ — กันดับเบิลคลิก
  legoQuotaCheckInFlight=true;
  toast('檢查中…⏳',false);
  var quota;
  try{quota=await legoCheckDailyQuota();}
  finally{legoQuotaCheckInFlight=false;}
  if(quota._owner&&!legoQuotaSameOwner(quota._owner)) quota={ok:false,reason:'owner_changed'};
  if(!quota.ok){
    if(quota.reason==='network'||quota.reason==='no_client'||quota.reason==='owner_unresolved'||quota.reason==='owner_changed'||quota.reason==='invalid_response'){
      toast('⚠️ 連線不穩，暫時無法測試，請稍等一下再試一次',true);
    }else{
      var cap=quota.cap||(quota.loggedIn?5:2);
      toast(quota.loggedIn
        ? ('👧🏻 米娜：今天已經測試 '+cap+' 句囉！明天再回來繼續造句吧 🌙')
        : ('👧🏻 米娜：今天已經測試 '+cap+' 句囉！登入帳號可以多測到每天 5 句，明天也可以再回來 🌙'),
        true);
    }
    return;
  }
  testWords=getSentenceWords();
  if(testWords.length<2){toast('句子太短，多加一點詞再測試吧',true);return;}
  testWrongCount=0; testLife=SENTENCE_LIFE_START; testHintUsed=false; testFailed=false; testLocked=false;
  testGolden=legoNextTestGolden; legoNextTestGolden=false; // ใช้ครั้งเดียว — คำทองการันตีหลังจบรอบก่อนหน้าเท่านั้น (ไม่สุ่มแล้ว)
  const gb=document.getElementById('testGoldenBadge'); if(gb) gb.style.display=testGolden?'':'none';
  document.getElementById('testActions').innerHTML='<button class="btn btn-line" id="testHintBtn" onclick="hintTest()">💡 提示 (-2)</button><button class="btn btn-line" onclick="try{if(window.gtag)gtag(\'event\',\'lego_test_reset\',{category:\'game\'});}catch(e){}resetTestAttempt()">↺ 重排</button>';
  scrambleTest();
  document.getElementById('testBanner').className='test-banner';
  document.getElementById('testBanner').textContent='';
  updateTestHintWarning();
  document.getElementById('testOverlay').classList.add('show');
  try{ if(window.gtag) gtag('event', 'lego_start', {category:'game', words: testWords.length}); }catch(e){}
  try{ if(window.gtag) gtag('event', 'game_start', {category:'game', game:'lego'}); }catch(e){}
  if(!window._minaWelcomed){ window._minaWelcomed=true; setTimeout(function(){minaToast('welcome',{dur:3400});},700); } // มีนาทักทายครั้งแรก — Lin 2026-07-10
}

function scrambleTest(){
  testAnswer=[]; testUsed={};
  do{
    testOrder=shuffleArr(testWords.map((_,i)=>i));
  }while(testWords.length>1 && testOrder.every((v,i)=>v===i));
  renderTestUI();
}

function renderTestUI(){
  const slotsEl=document.getElementById('testSlots');
  slotsEl.innerHTML=testWords.map((_,i)=>{
    const orig=testAnswer[i];
    if(orig===undefined) return '<div class="test-slot empty"></div>';
    return `<div class="test-slot" onclick="${testLocked?'':`removeTestTile(${i})`}">${testWords[orig].th}</div>`;
  }).join('');
  const bankEl=document.getElementById('testBank');
  bankEl.innerHTML=testOrder.map(orig=>{
    const used=!!testUsed[orig];
    return `<div class="test-tile${used?' used':''}" onclick="${(testLocked||used)?'':`addTestTile(${orig})`}">${testWords[orig].th}</div>`;
  }).join('');
  // Lin 2026-07-12: ล็อกแล้ว (ตอบถูก/ตาย) = คำในคลังใช้หมดแล้ว (opacity:0 แต่ยังกินที่) → ซ่อนกล่องทั้งกล่อง กันช่องว่างเปล่าๆ ก่อนถึง popup ผลลัพธ์
  bankEl.style.display=testLocked?'none':'';
  updateLegoScoreBar(testFailed?0:testLife); // Lin 2026-07-06: หลอด 本題分數 ในกล่องทดสอบ ไล่สีทอง→แดง
}

function addTestTile(orig){
  if(testLocked||testAnswer.length>=testWords.length) return;
  testAnswer.push(orig);
  testUsed[orig]=true;
  renderTestUI();
  if(testAnswer.length===testWords.length) checkTestAnswer();
}

function removeTestTile(slotIndex){
  if(testLocked) return;
  const orig=testAnswer[slotIndex];
  if(orig===undefined) return;
  testAnswer.splice(slotIndex,1);
  delete testUsed[orig];
  document.getElementById('testBanner').className='test-banner';
  document.getElementById('testBanner').textContent='';
  renderTestUI();
}

function resetTestAttempt(){
  if(testLocked) return;
  testAnswer=[]; testUsed={};
  document.getElementById('testBanner').className='test-banner';
  document.getElementById('testBanner').textContent='';
  renderTestUI();
}

function checkTestAnswer(){
  const isCorrect=testAnswer.every((v,i)=>v===i);
  const banner=document.getElementById('testBanner');
  if(isCorrect){
    testLocked=true;
    const clean=(testWrongCount===0 && !testHintUsed);
    let pts=Math.max(0,testLife); // "ชีวิต" ที่เหลือตอนตอบถูก (หักไปแล้วทั้งจากผิด+提示 พูลเดียวกัน)
    const golden=clean&&testGolden;
    if(golden) pts*=GOLDEN_SENTENCE_MULT;
    if(clean){ legoCleanThisRound++; }
    legoRoundLog.push({th:testWords.map(function(w){return w.th;}).join(''), zh:testWords.map(function(w){return w.zh;}).join('・'), wrong:testWrongCount||0}); // 2026-07-13：เก็บไว้ทำ wrong_items
    // legoCurCombo/legoMaxCombo: เก็บไว้แค่ให้ชาเลนจ์รายสัปดาห์ lego_combo5 ใช้ — ไม่มีผลกับคะแนนแล้ว (ตัดคอมโบคูณคะแนนออกตาม Lin ยืนยัน 2026-07-05)
    legoCurCombo=clean?legoCurCombo+1:0;
    if(legoCurCombo>legoMaxCombo) legoMaxCombo=legoCurCombo;
    roundScoreLego+=pts;
    try{ if(window.gtag) gtag('event', 'lego_correct', {category:'game', sentence: testWords.map(function(w){return w.th;}).join(''), clean: clean, pts: pts}); }catch(e){}
    try{ if(window.gtag) gtag('event', 'game_correct', {category:'game', game:'lego'}); }catch(e){}
    banner.className='test-banner ok';
    banner.textContent='✅ 排對了！+'+pts+' 分'+(golden?' ✨黃金句':'')+(testHintUsed?'（用了提示）':'');
    // น้องมีนาพูด: คำทอง > คอมโบ > มีผิด(ปลอบ) > ถูก(สุ่ม) — Lin 2026-07-10
    if(golden) minaToast('golden');
    else if(legoCurCombo===3||legoCurCombo===5||legoCurCombo===8) minaToast('combo');
    else if(testWrongCount>0||testHintUsed) minaToast('wrong',{throttle:true,chance:0.5});
    else minaToast('correct',{throttle:true});
    renderTestUI();
    document.querySelectorAll('#testSlots .test-slot').forEach(el=>el.classList.add('correct'));
    document.getElementById('testActions').innerHTML='<button class="btn btn-gold" onclick="try{if(window.gtag)gtag(\'event\',\'lego_test_continue\',{category:\'game\'});}catch(e){}closeTest()">繼續 →</button>';
    updateTestHintWarning();
    const roundMsg=finishLegoRound();
    if(roundMsg) setTimeout(()=>toast(roundMsg),400);
    // soft-CTA: โชว์เฉพาะตอนจบรอบ (ทุก SENTENCES_PER_ROUND ประโยค) ไม่ใช่ทุกครั้งที่ผ่านทดสอบ
    if(roundMsg && window.renderSoftCTA) renderSoftCTA('soft-cta-lego','lego_session','會自己造句了！想知道這句話聽起來自然嗎？讓老師幫你聽聽看。');
  }else{
    const deduct=WRONG_DEDUCT[Math.min(testWrongCount,3)];
    testWrongCount++;
    testLife-=deduct;
    try{ if(window.gtag) gtag('event', 'lego_wrong', {category:'game', sentence: testWords.map(function(w){return w.th;}).join(''), wrongs: testWrongCount}); }catch(e){}
    try{ if(window.gtag) gtag('event', 'game_wrong', {category:'game', game:'lego'}); }catch(e){}
    legoCurCombo=0;
    if(testLife<=0){
      failTest();
    }else{
      banner.className='test-banner no';
      banner.textContent='👧🏻 還沒對喔，別擔心～點格子裡的詞塊移回去，再排排看 💕';
      minaToast('wrong',{throttle:true,chance:0.5});
      document.querySelectorAll('#testSlots .test-slot').forEach(el=>{
        if(!el.classList.contains('empty')) el.classList.add('wrong');
      });
      setTimeout(()=>{document.querySelectorAll('#testSlots .test-slot.wrong').forEach(el=>el.classList.remove('wrong'));},400);
      updateTestHintWarning();
      updateLegoScoreBar(testLife); // Lin 2026-07-06: หลอด 本題分數 ลดสด+ไล่สีตอนเรียงผิด
    }
  }
}

// ตายแล้ว (ไม่ว่าจากผิดหรือจาก提示) — เฉลยคำตอบ + 0 แต้ม + ไม่นับเป็นรอบ (ต้องลองใหม่ถึงจะได้แต้ม)
function failTest(){
  testFailed=true; testLocked=true;
  testAnswer=testWords.map((_,i)=>i); testUsed={};
  testAnswer.forEach(o=>testUsed[o]=true);
  renderTestUI();
  document.querySelectorAll('#testSlots .test-slot').forEach(el=>el.classList.add('correct'));
  const banner=document.getElementById('testBanner');
  banner.className='test-banner no';
  banner.textContent='這句先看答案～綠色就是正確順序，重排一次再挑戰看看吧 💪（本句不計分）';
  document.getElementById('testActions').innerHTML='<button class="btn btn-gold" onclick="try{if(window.gtag)gtag(\'event\',\'lego_test_continue\',{category:\'game\'});}catch(e){}closeTest()">繼續 →</button>';
  updateTestHintWarning();
  legoCurCombo=0;
}

// 提示：自動把「目前從頭開始連續正確」之後的下一個詞塊放到正確位置，跟 word-order.html 同一套邏輯
function hintTest(){
  if(testLocked) return;
  if(testAnswer.length>=testWords.length) return;
  try{ if(window.gtag) gtag('event','lego_test_hint_use',{category:'game'}); }catch(e){}
  let correctPrefixLen=0;
  while(correctPrefixLen<testAnswer.length && testAnswer[correctPrefixLen]===correctPrefixLen) correctPrefixLen++;
  for(let i=testAnswer.length-1;i>=correctPrefixLen;i--) delete testUsed[testAnswer[i]];
  testAnswer=testAnswer.slice(0,correctPrefixLen);
  testAnswer.push(correctPrefixLen);
  testUsed[correctPrefixLen]=true;
  testHintUsed=true;
  testLife-=HINT_DEDUCT;
  renderTestUI();
  if(testLife<=0){ failTest(); return; }
  updateTestHintWarning();
  if(testAnswer.length===testWords.length) checkTestAnswer();
}

function closeTest(){
  document.getElementById('testOverlay').classList.remove('show');
}

// ════════ TEACHING ════════
function renderTeach(){
  const st=STEPS[teachStep];
  document.getElementById('tStepNo').textContent=`STEP 0${teachStep+1} / 0${STEPS.length}`;
  document.getElementById('tTitle').textContent=st.title;
  document.getElementById('tSub').textContent=st.sub;
  document.getElementById('tSent').innerHTML=st.pieces.map(p=>{
    const isNew=st.newTh.includes(p.th);
    return `<div class="tpiece ${isNew?'isnew':''}"><span class="pth th">${p.th}</span><span class="pzh">${p.zh}</span></div>`;
  }).join('');
  document.getElementById('tNote').innerHTML=st.note;
  document.getElementById('tFull').innerHTML='完整句子：<span class="th">'+st.pieces.map(p=>p.th).join('')+'</span>';
  document.getElementById('tProg').innerHTML=STEPS.map((_,i)=>`<i class="${i<=teachStep?'on':''}"></i>`).join('');
  document.getElementById('tNextBtn').textContent=teachStep===STEPS.length-1?'完成 ✓':'下一步 ›';
}
function teachNext(){
  if(teachStep<STEPS.length-1){teachStep++;renderTeach();}
  else{toast('完成！試試第一級造句吧');setLevel('lv1');}
}
function teachPrev(){if(teachStep>0){teachStep--;renderTeach();}}

// ════════ CLOSE ON OUTSIDE CLICK ════════
document.addEventListener('click',e=>{
  if(!e.target.closest('.slot')&&openSlot){openSlot=null;applyOpen();}
});

// ════════ กด Enter ไปข้อถัดไป (ตอนตอบถูก/เฉลยแล้ว มีปุ่ม「繼續 →」โผล่มา) — Lin 2026-07-20
document.addEventListener('keydown',e=>{
  if(e.key!=='Enter') return;
  const overlay=document.getElementById('testOverlay');
  if(!overlay||!overlay.classList.contains('show')) return;
  if(!testLocked) return;
  e.preventDefault();
  closeTest();
});

// ════════ TOAST ════════
// เพิ่มคิว กันข้อความทับกันจนอ่านไม่ทัน (เช่น ข้อความจบรอบ + ข้อความปลอกเกราะ เด้งใกล้กันเกินไป) — Lin 2026-07-12
let tT=null;
let _toastQueue=[];
let _toastBusy=false;
function toast(msg,err){
  _toastQueue.push({msg,err});
  _processToastQueue();
}
function _processToastQueue(){
  if(_toastBusy || !_toastQueue.length) return;
  _toastBusy=true;
  const next=_toastQueue.shift();
  const t=document.getElementById('toast');
  t.textContent=next.msg;t.className='toast'+(next.err?' err':'')+' show';
  clearTimeout(tT);
  tT=setTimeout(()=>{
    t.className='toast'+(next.err?' err':'');
    _toastBusy=false;
    setTimeout(_processToastQueue,150);
  },1700);
}

// ── น้องมีนา 米娜: บทพูด + ป๊อปพูดสด (โทนจีนไต้หวันอุ่นๆ ไกด์อ่อนโยน) — Lin 2026-07-10 ──
var MINA_EMOJI='👧🏻';
var MINA_LINES={
  welcome:['哈囉～我是米娜 🌾 我們一起用詞塊造出漂亮的泰文句子吧，好不好？','嗨嗨～我是米娜，今天也一起慢慢造句吧 😊'],
  correct:['哇～排對了，你做得很好 ✨','對了對了！這句就是這樣排 🌾','很好喔～你越來越會造句了 😊'],
  combo:['哇～連續排對，米娜都替你開心 🔥','停不下來了呢，好厲害 ⚡'],
  golden:['這句…閃閃發光的！米娜找到黃金稻穗了 🌾✨ 分數加倍！'],
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
var MINA_ENABLED=false; // Lin 2026-07-20: เกมเลโก้ยังไม่ต้องมีบทพูดมีนา ปิดไว้ก่อน (โค้ด/บทพูดยังอยู่ครบ เผื่อเปิดใหม่ทีหลัง)
function minaToast(key,opts){
  if(!MINA_ENABLED)return;
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

// ── INIT ──
renderLevels();
setLevel('lv1');
legoTryResume();
refreshLegoAcctUI();
try{ legoRenderGameBar(); }catch(e){}
document.addEventListener('DOMContentLoaded',function(){
  try{
    if(window.SITE_AUTH&&window.SITE_AUTH.onChange)window.SITE_AUTH.onChange(function(){
      const result=document.getElementById('lego-result');
      if(result&&!result.classList.contains('hidden'))legoRenderResultSaveControls();
    });
  }catch(e){}
});

// ── 提示泡泡（給其他頁面共用的函式，這頁不再自動觸發小泡泡，改用下面完整導覽）— Lin 2026-07-31 ──
function dismissHowtoHint(id){
  try{ var b=document.getElementById('howto-hint-'+id); if(b) b.classList.remove('show'); }catch(e){}
  try{ localStorage.setItem('howto_hint_seen_'+id,'1'); }catch(e){}
}

// ── 逐步導覽（滑鼠一格一格指出功能）— 第一次進遊戲自動播放，用過一次就不再自動跳出 — Lin 2026-07-31 ──
var GT_TOUR_STEPS=[
  {sel:'.out-banner',                         title:'這裡會顯示組好的句子', text:'選好的詞會自動排成完整的泰語句子，下面還會顯示中文翻譯。'},
  {sel:'#baseplate',                          title:'點格子選詞，組出句子', text:'每一格代表句子的一部分。先選主語和動詞，再依照動詞補上需要的內容。'},
  {sel:'button[onclick="legoCompleteSentence()"]', title:'完成後確認句子', text:'按「完成句子」後，會顯示完整泰語句子和中文翻譯。'},
  {sel:'button[onclick="legoEndGame()"]',     title:'隨時結束遊戲', text:'想查看這次完成的句子時，按「結束遊戲」前往結果頁。'},
  {sel:'.rg-stat-row',                        title:'帳號與玩法', text:'這裡可查看登入狀態；忘記玩法時，按「📖 怎麼玩」即可重新閱讀。'}
];
var gtTourIdx=0;
function gtTourPosition(){
  var step=GT_TOUR_STEPS[gtTourIdx];
  var el=step?document.querySelector(step.sel):null;
  var spot=document.getElementById('gt-tour-spot');
  if(!el){ spot.style.width='0px'; spot.style.height='0px'; return; }
  try{ el.scrollIntoView({block:'center',behavior:'smooth'}); }catch(e){}
  setTimeout(function(){
    var r=el.getBoundingClientRect();
    var pad=8;
    spot.style.top=Math.max(0,r.top-pad)+'px';
    spot.style.left=Math.max(0,r.left-pad)+'px';
    spot.style.width=(r.width+pad*2)+'px';
    spot.style.height=(r.height+pad*2)+'px';
  },260);
}
function gtTourRender(){
  var step=GT_TOUR_STEPS[gtTourIdx];
  if(!step){ gtTourEnd(); return; }
  // ข้ามจุดที่ยังไม่มีของจริงบนจอ — กันชี้จุดว่าง
  if(!document.querySelector(step.sel)){
    if(gtTourIdx<GT_TOUR_STEPS.length-1){ gtTourIdx++; gtTourRender(); } else { gtTourEnd(); }
    return;
  }
  document.getElementById('gt-tour-step').textContent=(gtTourIdx+1)+' / '+GT_TOUR_STEPS.length;
  document.getElementById('gt-tour-title').textContent=step.title;
  document.getElementById('gt-tour-text').innerHTML=step.text;
  document.getElementById('gt-tour-prev').style.visibility=(gtTourIdx===0)?'hidden':'visible';
  document.getElementById('gt-tour-next').textContent=(gtTourIdx===GT_TOUR_STEPS.length-1)?'開始玩 →':'下一步 ›';
  gtTourPosition();
}
function gtTourNext(){
  if(gtTourIdx>=GT_TOUR_STEPS.length-1){ gtTourEnd(); return; }
  gtTourIdx++; gtTourRender();
}
function gtTourPrev(){
  if(gtTourIdx<=0) return;
  gtTourIdx--; gtTourRender();
}
function gtTourEnd(){
  var ov=document.getElementById('gt-tour-overlay'); if(ov) ov.classList.remove('show');
  var card=document.getElementById('gt-tour-card'); if(card) card.style.display='none';
  try{ localStorage.setItem('howto_tour_seen_lego','1'); }catch(e){}
  try{ localStorage.setItem('howto_hint_seen_lego','1'); }catch(e){} // ทัวร์สอนครบแล้ว ไม่ต้องเด้งกล่องเล็กซ้ำอีก
}
function gtTourStart(){
  gtTourIdx=0;
  var ov=document.getElementById('gt-tour-overlay'); if(ov) ov.classList.add('show');
  var card=document.getElementById('gt-tour-card'); if(card) card.style.display='block';
  gtTourRender();
}
// รอให้ baseplate พร้อมก่อน ค่อยเริ่มทัวร์ — กันชี้ผิดที่/ชี้ที่ว่าง
(function(){
  try{
    if(localStorage.getItem('howto_tour_seen_lego')) return;
    var tries=0;
    var waitReady=setInterval(function(){
      tries++;
      var bp=document.getElementById('baseplate');
      var resume=document.getElementById('lego-resume-banner');
      var ready=resume && resume.style.display==='none' && bp && bp.children.length>0 && document.querySelector('.out-banner') && document.querySelector('button[onclick="legoCompleteSentence()"]') && document.querySelector('button[onclick="legoEndGame()"]');
      if(ready || tries>25){
        clearInterval(waitReady);
        if(ready) setTimeout(gtTourStart, 500);
      }
    }, 300);
  }catch(e){}
})();
