// ════════════════════════════════════════════════════════════
// FILE MAP: definitions/data → score + word-score → SRS → game engine → Mina/badges → UI/session flow → analytics/init
// DEFINITIONS
// ════════════════════════════════════════════════════════════
var DEFS = {
  toneMark: {
    zh: '聲調符號',
    desc: '標示在子音上方，決定音節聲調的符號。\n\n四種聲調符號：\n　• 二聲符　อ่\n　• 三聲符　อ้\n　• 四聲符　อ๊\n　• 五聲符　อ๋'
  },
  low:  { zh: '低子音',  chars: 'ค คร คล คว ฅ ฆ ง ช ซ ซร ฌ ญ ฑ ฒ ณ ท ทร ธ น พ พร พล ฟ ภ ม ย ร ล ว ฬ ฮ' },
  high: { zh: '高子音',  chars: 'ข ขร ขล ขว ฃ ฉ ฐ ถ ผ ฝ ศ ศร ษ ส สร ห' },
  mid:  { zh: '中子音',  chars: 'ก จ จร ด ต ตร บ ป ปร ปล อ ฎ ฏ กร กล กว' },
  lead: { zh: '前引字',  chars: 'หน หม หล หว หย หร หญ หง อย', desc: '由 ห 或 อ 帶頭，與後方低子音結合使聲調改變的組合。' },
  other: { zh: '其他子音', desc: '指「中子音」「高子音」或「前引字」三類的統稱。' },
  live:  { zh: '活音', desc: '① 有長尾音（น ณ ญ ร ล ฬ ม ย ว ง）收尾\n② 無尾音但使用長母音\n　　長母音：-า  -ี  -ื  -ู  เ-  แ-  โ-  -อ  เ-อ  เ-ิ-  เ-ีย  -ัว' },
  dead:  { zh: '死音', desc: '① 有短尾音（ก ข ค ฆ บ ป พ ฟ ภ จ ช ซ ฎ ฏ ฐ ฑ ฒ ด ต ถ ท ธ ศ ษ ส）收尾\n② 無尾音但使用短母音\n　　短母音：-ะ  -ั-  -ิ  -ึ  -ุ  เ-ะ  เ-็-  แ-ะ  แ-็-  โ-ะ  เ-าะ  เ-อะ  เ-ียะ  เ-ือะ  -ัวะ' },
  longVowel:  { zh: '長母音', chars: '-า  -ี  -ื  -ู  เ-  แ-  โ-  -อ  เ-อ  เ-ิ-  เ-ีย  -ัว' },
  shortVowel: { zh: '短母音', chars: '-ะ  -ั-  -ิ  -ึ  -ุ  เ-ะ  เ-็-  แ-ะ  แ-็-  โ-ะ  เ-าะ  เ-อะ  เ-ียะ  เ-ือะ  -ัวะ' },
  longEnd:  { zh: '長尾音', chars: 'น  ณ  ญ  ร  ล  ฬ  ม  ย  ว  ง' },
  shortEnd: { zh: '短尾音', chars: 'ก  ข  ค  ฆ  บ  ป  พ  ฟ  ภ  จ  ช  ซ  ฎ  ฏ  ฐ  ฑ  ฒ  ด  ต  ถ  ท  ธ  ศ  ษ  ส' }
};

// ════════════════════════════════════════════════════════════
// 字母練習區 ALPHABET PRACTICE DATA
// 資料來源：使用者提供的字母對照表圖片（注音／拼音為該教材自訂系統）
// 每張卡片：ch=泰文字母, zh=注音, py=拼音, note=補充, tts=發音用文字(可選)
// ════════════════════════════════════════════════════════════
// เสียงครูอ่านจริงสำหรับ 字卡 (โหลด manifest แล้วเล่น mp3 ที่ trim เสียงเงียบ/ลมหายใจแล้ว) — LIN 2026-06-20
var TF_FLASH_AUDIO = null;
var TF_FLASH_AUDIO_READY = false; // true = โหลดเสร็จ (สำเร็จหรือล้มเหลว)
function tfMinimumGuestOnly(){return typeof window.isMinimumGuestOnly==='function'&&window.isMinimumGuestOnly();}
var TF_FLASH_AUDIO_PROMISE = (function(){ try { return fetch('assets/flashcard-audio/manifest.json')
  .then(function(r){ return r.json(); })
  .then(function(j){ TF_FLASH_AUDIO = j; TF_FLASH_AUDIO_READY = true; })
  .catch(function(e){ console.error('[flashcard-audio] manifest load failed:', e); TF_FLASH_AUDIO_READY = true; }); } catch(e){ console.error('[flashcard-audio] fetch error:', e); TF_FLASH_AUDIO_READY = true; return Promise.resolve(); } })();

var ALPHA = {
  consonant: {
    mid:  { zh:'中子音', sub:'7 個',
      common: [
        {ch:'ก', zh:'ㄍ⁻', py:'g'},
        {ch:'จ', zh:'ㄗ⁻', py:'z'},
        {ch:'ด', zh:'ㄉ⁻', py:'d'},
        {ch:'ต', zh:'ㄉ⁻', py:'d'},
        {ch:'อ', zh:'ㄛ⁻', py:'o'},
        {ch:'บ', zh:'ㄅ⁻', py:'b'},
        {ch:'ป', zh:'ㄅ⁻', py:'b'}
      ],
      forgot: [
        {ch:'ฎ', zh:'ㄉ⁻', py:'d'},
        {ch:'ฏ', zh:'ㄉ⁻', py:'d'}
      ]
    },
    high: { zh:'高子音', sub:'5 個',
      common: [
        {ch:'ข', zh:'ㄎˊ', py:'k'},
        {ch:'ถ', zh:'ㄊˊ', py:'t'},
        {ch:'ผ', zh:'ㄆˊ', py:'p'},
        {ch:'ส', zh:'ㄙˊ', py:'s'},
        {ch:'ห', zh:'ㄏˊ', py:'h'}
      ],
      forgot: [
        {ch:'ฉ', zh:'ㄔˊ', py:'c'},
        {ch:'ฐ', zh:'ㄊˊ', py:'t'},
        {ch:'ฝ', zh:'ㄈˊ', py:'f'},
        {ch:'ศ', zh:'ㄙˊ', py:'s'},
        {ch:'ษ', zh:'ㄙˊ', py:'s'}
      ]
    },
    low:  { zh:'低子音', sub:'常用 15 個',
      common: [
        {ch:'ค', zh:'ㄎ⁻', py:'k'},
        {ch:'ง', zh:'ㄋ⁻', py:'n'},
        {ch:'ช', zh:'ㄔ⁻', py:'c'},
        {ch:'ซ', zh:'ㄙ⁻', py:'s'},
        {ch:'ท', zh:'ㄊ⁻', py:'t'},
        {ch:'ธ', zh:'ㄊ⁻', py:'t'},
        {ch:'น', zh:'ㄋ⁻', py:'n'},
        {ch:'พ', zh:'ㄆ⁻', py:'p'},
        {ch:'ภ', zh:'ㄆ⁻', py:'p'},
        {ch:'ฟ', zh:'ㄈ⁻', py:'f'},
        {ch:'ม', zh:'ㄇ⁻', py:'m'},
        {ch:'ย', zh:'ㄖ⁻', py:'r'},
        {ch:'ร', zh:'ㄌ⁻', py:'l', note:'彈舌音'},
        {ch:'ล', zh:'ㄌ⁻', py:'l'},
        {ch:'ว', zh:'w', py:'w'}
      ],
      forgot: [
        {ch:'ฌ', zh:'ㄔ⁻', py:'c'},
        {ch:'ญ', zh:'ㄖ⁻', py:'r'},
        {ch:'ฑ', zh:'ㄔ⁻', py:'c'},
        {ch:'ฒ', zh:'ㄔ⁻', py:'c'},
        {ch:'ณ', zh:'ㄋ⁻', py:'n'},
        {ch:'ฬ', zh:'ㄌ⁻', py:'l'},
        {ch:'ฮ', zh:'ㄏ⁻', py:'h'}
      ]
    }
  },
  vowel: {
    short: [
      {ch:'อะ', zh:'ㄚˇ', py:'ǎ'},
      {ch:'อุ', zh:'ㄨˇ', py:'ǔ'},
      {ch:'อิ', zh:'ㄧˇ', py:'ǐ'},
      {ch:'อึ', zh:'—', py:'ueˇ'},
      {ch:'เอะ', zh:'ㄟˇ', py:'eǐ'},
      {ch:'แอะ', zh:'—', py:'Aeˇ'}
    ],
    long: [
      {ch:'อา', zh:'ㄚ⁻', py:'ā'},
      {ch:'อู', zh:'ㄨ⁻', py:'ū'},
      {ch:'อี', zh:'ㄧ⁻', py:'ī'},
      {ch:'อือ', zh:'—', py:'ue⁻'},
      {ch:'เอ', zh:'ㄟ⁻', py:'eī'},
      {ch:'แอ', zh:'—', py:'Ae⁻'},
      {ch:'โอ', zh:'ㄡ⁻', py:'ōu'},
      {ch:'ออ', zh:'ㄛ⁻', py:'ō'},
      {ch:'เออ', zh:'ㄜ⁻', py:'ē'},
      {ch:'เอีย', zh:'ㄧㄚ⁻', py:'iā'},
      {ch:'เอือ', zh:'—', py:'Uea⁻'},
      {ch:'อัว', zh:'ㄨㄚ⁻', py:'uā'},
      {ch:'อำ', zh:'—', py:'am⁻'},
      {ch:'เอา', zh:'ㄠ⁻', py:'āo'},
      {ch:'ไอ ใอ', zh:'ㄞ⁻', py:'āi', tts:'ไอ'}
    ]
  },
  ending: [
    {ch:'ง', zh:'', py:'-ng', note:'長尾音（活音）', mem:'ง',
      exp:{cat:'第一類・與中文相同', how:'鼻音化，聲音在喉嚨後方共鳴。', thai:'', zh:'東 (dōng) — 收尾鼻音完全相同。'}},
    {ch:'น', zh:'', py:'-n', note:'長尾音（活音）', mem:'น ณ ญ ร ล ฬ',
      exp:{cat:'第一類・與中文相同', how:'音節結尾時舌頭頂住上顎，與英文 N 或中文「-an」結尾相同，聲音可拉長。', thai:'', zh:'灣 (wān) — 舌頭頂住上顎的方式完全相同。'}},
    {ch:'ม', zh:'', py:'-m', note:'長尾音（活音）', mem:'ม',
      exp:{cat:'第二類・與英文相同', how:'發音方式與英文尾音 M 相同。雙唇完全閉合，聲音拉長。', thai:'', zh:''}},
    {ch:'ย', zh:'', py:'-i', note:'長尾音（活音）', mem:'ย',
      exp:{cat:'第一類・與中文相同', how:'音節以「-i（ee）」音收尾。', thai:'ไม่ (mai) — 以「-i」音收尾。', zh:'賣 (mài) — 收尾的「-i」音完全相同。'}},
    {ch:'ว', zh:'', py:'-u', note:'長尾音（活音）', mem:'ว',
      exp:{cat:'第一類・與中文相同', how:'嘴巴結尾要呈現圓嘟嘟的形狀（像「屋 wu」音）。', thai:'', zh:'要 (yào) — 嘴型自然收在相同的圓唇位置。'}},
    {ch:'ก', zh:'', py:'-k', note:'短尾音（死音）・注音參考使用', mem:'ก ข ค ฆ',
      exp:{cat:'第二類・與英文相同', how:'對應英文短促的 K／G 音。英文唸尾音時會在喉嚨後方短暫擋住氣流再釋放「kuh／guh」；泰文則在那一刻直接停住氣流，不釋放尾音。', thai:'', zh:''}},
    {ch:'ด', zh:'', py:'-t', note:'短尾音（死音）・注音參考使用', mem:'จ ช ซ ฎ ฏ ฐ ฑ ฒ ด ต ถ ท ธ ศ ษ ส',
      exp:{cat:'第二類・與英文相同', how:'對應英文短促的 T／D 音。英文唸尾音時舌尖會抵在門牙後方擋住氣流再釋放「tuh／duh」；泰文則在那一刻直接停住氣流，不釋放尾音。', thai:'', zh:''}},
    {ch:'บ', zh:'', py:'-p', note:'短尾音（死音）・注音參考使用', mem:'บ ป พ ฟ ภ',
      exp:{cat:'第二類・與英文相同', how:'對應英文短促的 P／B 音。英文唸尾音時雙唇會短暫閉合擋住氣流再釋放「puh／buh」；泰文則在那一刻直接停住氣流，不釋放尾音。', thai:'', zh:''}}
  ]
};

// ════════════════════════════════════════════════════════════
// TONES (Thai primary, Chinese secondary)
// ════════════════════════════════════════════════════════════
var TONES = {
  1: { zh:'第一聲', match:'對應中文的第一聲',       color:'#6cb8ff' },
  2: { zh:'第二聲', match:'對應中文的第三聲',       color:'#7ec87e' },
  3: { zh:'第三聲', match:'對應中文的第四聲',       color:'#ff7c7c' },
  4: { zh:'第四聲', match:'對應中文的第一聲高 tone', color:'#ffb347' },
  5: { zh:'第五聲', match:'對應中文的第二聲',       color:'#c39bff' }
};

// ════════════════════════════════════════════════════════════
// RANDOM WORD LIST
// 「隨機一個字」按鈕用的詞庫，之後可以直接擴充這個陣列。
// 每個項目格式：
//   word      → 拿來搜尋／聲調分析用的泰文寫法
//   readingTH → 泰文讀音（口語唸法的泰文拼寫，可能跟 word 不同）
//   readingEN → 羅馬拼音讀音
//   zh        → 中文（台灣）翻譯
// ════════════════════════════════════════════════════════════
var WORD_LIST = buildWordListForToneFinder(WORDS_MASTER); // 2026-07-11: ย้ายคำเดี่ยวไปเก็บที่ words-data.js (ใช้ร่วมกับเกมอ่าน/เกมพิมพ์)

// Lin 2026-07-25: ปิดโหมด 自行搜尋 ถาวรตามที่ Lin สั่ง (ไม่ใช้แล้ว) — ลบทั้งระบบออก  [SYLLABLE_LIST]
// ════════════════════════════════════════════════════════════
// THAI WORD PARSER  (smart error detection)
// ════════════════════════════════════════════════════════════
// Lin 2026-07-30: ลบตาราง WORD_PARTS (คำแยกพยางค์ที่พิมพ์มือไว้ในไฟล์นี้ 314 คำ) ทิ้งทั้งชุด
//   เหตุผล: เป็นคลังคำชุดที่ 2 ซ้ำกับคลังกลาง data/words-data.js แล้วค่าไม่ตรงกัน 79 จุด
//   (เช่น ญาติ ยังค้าง final 'ติ' · นามบัตร ยังค้าง 'ตร' ทั้งที่คลังกลางแก้เป็น 'ต' ไปแล้ว 2026-07-26)
//   ตอนนี้ทุกหน้าจอของเกมอ่าน "การแยกคำ" จากคลังกลางที่ Lin ตรวจ 100% ที่เดียว (กฎ 15/16)
//   แต่ละพยางค์ในคลังกลาง: { cons, lead, cluster, vowel, tone, final, tone_name, th }
//   หน้าจอโชว์ 起首子音 = lead + cons + cluster (เช่น หมา → หม · ปลา → ปล) ตามที่ใช้สอนอักษรนำ/อักษรควบ
// Find the exact reviewed syllable used by the shared display helper.
// ใช้ entry ปัจจุบันตาม contentKey เท่านั้น; ห้ามค้นสำรองด้วยตัวสะกดเพราะคำซ้ำอาจคนละความหมาย
function currentAnswerSyl() {
  var entry = tfCurEntry();
  var syls = entry && entry.syls;
  if (!syls || !syls.length) throw new Error('CATALOG_AUTHORITY_INCOMPLETE:current entry syllables');
  if (syls.length === 1) return syls[0];
  if (S.selectedSyl == null || !S.syllables || S.syllables.length !== syls.length) throw new Error('CATALOG_AUTHORITY_INCOMPLETE:current syllable identity');
  return syls[S.selectedSyl];
}

function currentCatalogWord() {
  var entry = tfCurEntry();
  if (!entry || typeof entry.word !== 'string' || !entry.word.trim()) {
    throw new Error('CATALOG_AUTHORITY_INCOMPLETE:current word');
  }
  if (S.syllables && S.syllables.length > 1 && S.parentWord !== entry.word) {
    throw new Error('CATALOG_AUTHORITY_INCOMPLETE:parent word identity');
  }
  return entry.word;
}

// Correct tone comes only from the current Lin-reviewed catalog syllable.
// Missing or ambiguous authority stops the game; this function never analyzes Thai text.
function catalogToneNumber() {
  var syllable = currentAnswerSyl();
  var tone = syllable && syllable.toneNumber;
  if (!Number.isInteger(tone) || tone < 1 || tone > 5) {
    var entry = tfCurEntry();
    throw new Error('CATALOG_AUTHORITY_INCOMPLETE:' + ((entry && entry.contentKey) || 'unknown') + ':toneNumber');
  }
  return tone;
}
// Lin 2026-07-31: คำหลายพยางค์ — รวมเฉลยของ "ทุกพยางค์" ไว้ที่เดียว (ใช้โชว์ตอนหน้าพยางค์สุดท้ายเท่านั้น)
//   เทียบไม่ได้ (จำนวนพยางค์ไม่ตรงคลัง) = คืน '' เหมือน currentAnswerSyl (ไม่เดา)
function tfAllAnswerRowsHtml() {
  var entry = tfCurEntry();
  var syls = entry && entry.syls;
  if (!syls || !syls.length || !S.syllables || S.syllables.length !== syls.length) throw new Error('CATALOG_AUTHORITY_INCOMPLETE:all answer syllables');
  var out = '';
  for (var i = 0; i < syls.length; i++) out += tfAnswerRowsHtml(syls[i]);
  return out;
}
// กล่องแถวเฉลยรูปแบบกลาง (หัว 📍 + แถว 前引字/子音/連音/母音/尾音/消音/聲調符)
function tfAnswerRowsHtml(sy) {
  if (!sy || typeof buildAnswerRows !== 'function') return '';
  var rows = buildAnswerRows(sy);
  if (!rows.length) return '';
  return '<div class="rule-row" style="font-weight:800;color:#8B6310;">📍 ' + buildAnswerHeader(sy) + '</div>' +
    rows.map(function (r) {
      return '<div class="rule-row"><span class="rule-tag">' + r.tag + '</span><span class="rule-txt">' + r.text + '</span></div>';
    }).join('');
}

// No Thai-language engine is loaded. All correctness comes from reviewed catalog fields.
// ด้านบน ได้ตัวแปร TH ชื่อเดิมเป๊ะ ใช้ต่อได้โดยไม่ต้องแก้โค้ดข้างล่างนี้เลย

// ════════════════════════════════════════════════════════════
// STATE & HISTORY
// ════════════════════════════════════════════════════════════
var S = { word:'', step:'level-select', path:[], tone:null };
var hist = [];
var histPos = -1;
var _acts = {}, _actId = 0;
var randomEntry = null;
var selectedLevel = null;
var selectedCategory = null;
var session = null;
var roundReport = null;
var _sessionsThisVisit = 0;  // นับ session ที่เล่นจบในรอบเข้าเว็บนี้ (สำหรับ popup โปรโมท)
var flash = null;  // 字母字卡狀態：{ title, cards:[], order:[], index, flipped, back }

// ════════════════════════════════════════════════════════════
// ===== TF_SCORE ENGINE START =====  (สเตจ 1: ระบบคะแนนหลัก)
// เครื่องคิดคะแนนแบบ "บริสุทธิ์" (ไม่แตะ DOM) — เทสต์ด้วย jsdom/node ได้
// ทุกค่าปรับได้ที่ TF_SCORE_CFG ห้าม hardcode ในเกม
// ════════════════════════════════════════════════════════════
var TF_SCORE_CFG = {
  SCORE_FIRST_TRY: 10,       // ถูกตั้งแต่ครั้งแรก = 10 (= WRONG_LADDER[0])
  // ── Lin 2026-07-04: คะแนนต่อคำ/พยางค์ "นับตามจำนวนครั้งที่กดผิด" เหมือนเกมอ่าน ──
  //   ทุกคนเริ่ม 10 เท่ากัน · ผิด 1=7 · 2=4 · 3=1 · 4=0(fail เฉลย+SRS รีเซ็ต day1)
  //   "กดผิด" = เลือกวรรณยุกต์ไม่ตรงกับค่าที่คลังกลางส่งมา
  WRONG_LADDER: [10, 7, 4, 1, 0],
  SRS_REVIEW_BONUS: [3, 2, 1],  // Phase 1: โบนัสรอบสะอาด — เริ่มเส้นทาง+3 · Day 1+2 · รอบตัดสิน Day 7+1
  SCORE_FAIL_ZERO: 0,        // ผิดครบเพดาน (fail) = 0 pt เสมอ
  COMBO_TIERS: { 3: 1.5, 5: 2, 8: 3 },   // สตรีคตอบถูกครั้งแรกติดกัน → ตัวคูณ
  SET_COMPLETE_BONUS: 20,    // เล่นจบ 1 ชุด (เดิม 200)
  SET_PERFECT_BONUS: 50,     // จบชุดแบบ perfect (เดิม 500) → perfect = 20+50 = 70
  LEVEL_WEIGHT: { 1: 1, 2: 1.5, 3: 2 }   // กฎ MASTER 2026-07-05: ตัวคูณระดับชุดเดียวทั้งระบบ (初1/中1.5/高2) = ตรงเกมอ่าน + ตรงตัวคูณดาวเงิน → ลีกยุติธรรมข้ามเกม
};

var TF_SCORE = {
  cfg: TF_SCORE_CFG,

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
// ===== TF_SCORE ENGINE END =====

// ===== TF_WORDSCORE (Lin 2026-07-04) — state คะแนนต่อคำ บันได [10,7,4,1,0] · pure logic ทดสอบได้จริง =====
//  ทำงานบน object ที่มีฟิลด์ currentWordDeduct เท่านั้น; ไม่คำนวณคำตอบภาษา
//  กติกา (ยืนยันกับ Lin ผ่านหลอดคะแนน 2026-07-04):
//   • เลือกผิด = หัก 1 ขั้น
//   • หักครบ 4 (แต้มเหลือ 0) = เฉลยค่าจากคลัง + SRS รีเซ็ต day1
var TF_WORDSCORE = {
  LADDER: [10, 7, 4, 1, 0],
  FAIL_AT: 4,
  score: function (s) { return this.LADDER[Math.min((s && s.currentWordDeduct) || 0, this.FAIL_AT)]; },
  isDead: function (s) { return ((s && s.currentWordDeduct) || 0) >= this.FAIL_AT; },
  // เลือกไม่ตรงกับค่าจากคลัง → หักคะแนนหนึ่งขั้น
  onWrong: function (s) {
    s.currentWordDeduct = (s.currentWordDeduct || 0) + 1;
    s.stepWrong = true;
    return s;
  },
  // หลังบันทึกการเลือกแล้ว ล้างสถานะหน้าจอ
  onNextStep: function (s) { s.stepWrong = false; s.stepFreePeekUsed = false; return s; }
};

// Lin 2026-07-06: สีหลอดคะแนนต่อข้อ — ทองเข้มตอนเต็ม ไล่ลงเป็น "แดง" ตอนใกล้ตาย · ใช้ชุดเดียวกันทุกเกม (กฎ Lin: หลอดต้องมีทุกเกมทุกระดับ ไล่สีสวยๆ)
function tfScoreBarColor(sc, max) {
  if (sc <= 0) return '#b83227';
  var f = Math.max(0, Math.min(1, sc / (max || 10)));
  var hue = f >= 0.4 ? 40 : Math.round(40 * (f / 0.4));  // 40=ทองเข้ม → 0=แดง (เริ่มแดงช่วงท้ายเท่านั้น)
  var light = f >= 0.4 ? 42 : 38;
  return 'hsl(' + hue + ',78%,' + light + '%)';
}

// หลอดคะแนนต่อคำ — 本題分數 10→0 · สีทอง→แดง
function tfWordScoreGaugeHtml() {
  if (!session) return '';
  var max = TF_WORDSCORE.LADDER[0] || 10;
  var sc = TF_WORDSCORE.score(session);
  var pct = Math.max(0, Math.min(100, (sc / max) * 100));
  var dead = (sc === 0);
  var fill = tfScoreBarColor(sc, max);
  return '<div style="display:flex;align-items:center;gap:8px;font-family:\'Noto Sans TC\',sans-serif;font-size:12px;color:#a08050;margin:0 0 12px;">'
    + '<span style="min-width:56px;">本題分數</span>'
    + '<div style="flex:1;height:9px;background:#ede0c8;border-radius:5px;overflow:hidden;">'
    +   '<div id="tf-ws-fill" style="height:100%;border-radius:5px;width:' + pct + '%;background:' + fill + ';transition:width .35s ease;"></div>'
    + '</div>'
    + '<span id="tf-ws-lab" style="min-width:44px;text-align:right;font-weight:800;font-size:14px;color:' + (dead ? '#c0392b' : '#5a3e0a') + ';"><span id="tf-ws-num">' + sc + '</span>/10</span>'
    + '</div>';
}

// อัปเดตหลอดคะแนนต่อคำสดหลังเลือก โดยไม่ต้องวาดหน้าจอใหม่
function tfUpdateWordScoreGauge() {
  if (!session) return;
  var max = TF_WORDSCORE.LADDER[0] || 10;
  var sc = TF_WORDSCORE.score(session);
  var dead = (sc === 0);
  var f = document.getElementById('tf-ws-fill');
  if (f) { f.style.width = Math.max(0, Math.min(100, (sc / max) * 100)) + '%'; f.style.background = tfScoreBarColor(sc, max); }
  var n = document.getElementById('tf-ws-num'); if (n) n.textContent = sc;
  var lab = document.getElementById('tf-ws-lab'); if (lab) lab.style.color = dead ? '#c0392b' : '#5a3e0a';
}

// ════════════════════════════════════════════════════════════
// ===== TF_SRS ENGINE START ===== (สเปก 2026-07-03 ข้อ 2.5 + 3 + 4 + 5)
// วนทบทวนแบบ SRS ต่อ "หน่วย" (ทั้งคำ/ทั้งประโยค) + แจกดาวเงินตอนจำได้จริง
// หน่วย = key คือ entry.word (level 1/2 = คำ, level 3 = ประโยคเต็ม) + level
// ทำงานเฉพาะตอนล็อกอิน (เช็กที่จุดเรียกใช้ ไม่ใช่ในเอนจิ้นนี้ — เอนจิ้นนี้ pure logic เทสต์ได้)
// ════════════════════════════════════════════════════════════
var TF_SRS_CFG = {
  INTERVALS: [1, 7],       // Phase 1: New → Day 1 → Day 7 → Mastered (รอบสุดท้าย mastered ทันที)
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

  // นี่คือรอบตัดสิน Day 7 ก่อน mastered ไหม — stage 2 คือรอบที่ 3 (0-based)
  isFinalCheck: function (rec) {
    return !!rec && rec.stage === (this.cfg.CLEAN_ROUNDS_TO_MASTER - 1);
  },

  // ตอบถูก "สะอาด" (ไม่แอบดู ไม่ผิดในรอบนี้) → เลื่อนขั้นถัดไป หรือ mastered ถ้าครบ 3 รอบ
  // คืน { rec, justMastered, clean } — clean = mastered แบบไม่เคย fail/peek เลยตลอดเส้นทาง (จำเอง)
  // หมายเหตุ index: รอบที่เพิ่งผ่าน (stage ก่อนบวก) กำหนดว่ารออีกกี่วันถึงรอบถัดไป
  //   stage 0 ผ่าน (New) → รอ 1 วัน · stage 1 ผ่าน (Day 1) → รอ 7 วัน
  //   stage 2 ผ่าน (รอบตัดสิน Day 7) → mastered ทันที ไม่ต้องรอ
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

  // ตอบผิด (หรือใช้ตัวช่วยในรอบตัดสิน Day 7) → รีเซ็ตกลับ stage 0 เข้าคิว SRS ใหม่
  resetOnFail: function (rec) {
    rec = rec || this.blank();
    rec.stage = 0;
    rec.dueDate = '';   // Lin 2026-07-04: พร้อมทบทวนใหม่ได้ทันที (เข้าคิว)
    rec.dueAt = 0;
    rec.everFailed = true;
    return rec;
  }
};

// ── localStorage: state SRS ต่อคำ (แยกจาก game-account.js เพราะผูกกับเกมเสียงเท่านั้น) ──
var TF_SRS_KEY = 'tf_srs_v1';
function tfLoadSrs() { if(!tfSrsLoggedIn())return {};try { return JSON.parse(localStorage.getItem(TF_SRS_KEY) || '{}') || {}; } catch (e) { return {}; } }
function tfSaveSrs(o) { if(!tfSrsLoggedIn())return;try { localStorage.setItem(TF_SRS_KEY, JSON.stringify(o)); } catch (e) {} }
function tfStateWord(entryOrWord) {
  if (entryOrWord && typeof entryOrWord === 'object') {
    return tfWordContentKey(entryOrWord);
  }
  return entryOrWord;
}
function tfWordContentKey(entry){if(!entry||typeof entry.contentKey!=='string'||!entry.contentKey.trim())throw new Error('CATALOG_AUTHORITY_INCOMPLETE:tone contentKey');return entry.contentKey;}
function tfContentRefForEntry(entry){if(selectedLevel===3){var sentence=advSentenceCtx&&advSentenceCtx.th;if(!sentence)throw new Error('CATALOG_AUTHORITY_INCOMPLETE:sentence identity');return {source:'game_sentences',key:sentence};}return {source:'game_words',key:tfWordContentKey(entry)};}
function tfReviewWordRef(entry){return {source:'game_words',key:tfWordContentKey(entry)};}
function tfReviewSentenceRef(index){var sentence=ADV_SENTENCES[index];if(!sentence||!sentence.th)throw new Error('CATALOG_AUTHORITY_INCOMPLETE:sentence identity');return {source:'game_sentences',key:sentence.th};}
function tfReviewOwns(entry){try{return !!(window.LearningReview&&LearningReview.owns(roundReport,tfContentRefForEntry(entry)));}catch(e){return false;}}
function tfRegisterRestoredReview(){try{if(!window.LearningReview||!roundReport||!session)return;if(selectedLevel===3&&advSentIdx>=0){var all=ADV_SENTENCES.map(function(_,i){return i;}),selected=LearningReview.matchQueue({game:'tone',level:3,items:[advSentIdx],contentRefOf:tfReviewSentenceRef}),refKey=LearningReview.keyOfRef(tfReviewSentenceRef(advSentIdx)),group={},groupSize=advSentenceCtx&&advSentenceCtx.words?advSentenceCtx.words.length:session.words.length;group[refKey]=groupSize;LearningReview.registerRound({report:roundReport,game:'tone',level:3,allItems:all,srsOwned:all.filter(function(i){return !!tfGetSrsRecord(ADV_SENTENCES[i].th,3);}),selectedReview:selected,alreadyRetried:session.words.length>groupSize?[advSentIdx]:[],idOf:function(i){return LearningReview.keyOfRef(tfReviewSentenceRef(i));},contentRefOf:tfReviewSentenceRef,groupSizeByRef:group,retry:function(){session.words=session.words.concat(session.words.slice(0,groupSize));}});}else{var pool=WORD_LIST.filter(function(w){return w.level===selectedLevel;}),selectedWords=LearningReview.matchQueue({game:'tone',level:selectedLevel,items:session.words,contentRefOf:tfReviewWordRef}),seen=Object.create(null),duplicates=[];session.words.forEach(function(w){var key=LearningReview.keyOfRef(tfReviewWordRef(w));if(seen[key])duplicates.push(w);seen[key]=true;});LearningReview.registerRound({report:roundReport,game:'tone',level:selectedLevel,allItems:pool,srsOwned:pool.filter(function(w){return !!tfGetSrsRecord(w,tfWordLevel(w));}),selectedReview:selectedWords,alreadyRetried:duplicates,idOf:function(w){return LearningReview.keyOfRef(tfReviewWordRef(w));},contentRefOf:tfReviewWordRef,retry:function(w){session.words.push(w);}});}}catch(e){}}
function tfGetSrsRecord(entryOrWord, level) {
  var all = tfLoadSrs();
  var k = TF_SRS.keyFor(tfStateWord(entryOrWord), level);
  return all[k] || null;
}
function tfSetSrsRecord(entryOrWord, level, rec) {
  var all = tfLoadSrs();
  all[TF_SRS.keyFor(tfStateWord(entryOrWord), level)] = rec;
  tfSaveSrs(all);
}
// เช็กว่าล็อกอินอยู่ไหม (ระบบคะแนน/ดาวเงิน/SRS ทำงานเฉพาะตอนล็อกอินจริงตามสเปกข้อ 0)
// Lin 2026-07-16: รวมระบบล็อกอินเข้ากับอีก 4 เกม (window.READING_AUTH) — เลิกใช้ window.TF_AUTH/supabase-auth.js
// เดิมยอมรับ "ให้อีเมล (lead) แต่ไม่ได้ล็อกอินจริง" ด้วย (hasAccess) ตอนนี้ต้องล็อกอินจริงเท่านั้น เหมือน 4 เกมที่เหลือ (Lin ยืนยันแล้ว)
function tfSrsLoggedIn() {
  if(tfMinimumGuestOnly() && window.LOGIN_FREE_SRS_PUBLIC_ENTRY !== true) return false;
  return !!(window.READING_AUTH && READING_AUTH.srsUser);
}
// proxy-click ปุ่มล็อกอินกลาง (#rg-login-slot) — แพทเทิร์นเดียวกับ rgCtaLogin()/woCtaLogin()/legoCtaLogin() ในอีก 4 เกม
function tfCtaLogin() {
  try { var b = document.querySelector('#rg-login-slot button'); if (b) { b.click(); return; } } catch (e) {}
}

// ════════════════════════════════════════════════════════════
// ── Lin 2026-07-13: ซิงก์ SRS "ข้ามเครื่อง" — อ่านกลับจาก Supabase (tone_srs_state) → merge เข้า tf_srs_v1 ──
//   • อ่านอย่างเดียว (SELECT) · เขียนขึ้นเซิร์ฟเวอร์ยังเป็นหน้าที่ Edge Function tone-round เหมือนเดิม (ดาว/กันโกงไม่แตะ)
//   • คู่ขนาน ไม่บล็อกเกม · เน็ตล่ม/ไม่ล็อกอินจริง = ใช้เล่มในเครื่อง (localStorage) เดิมทุกอย่าง
//   • กติกา merge: เลือก "อันก้าวหน้ากว่า" เสมอ (精通 > stage สูง > วันครบกำหนดใหม่กว่า) → ไม่มีทางถอยหลัง/ข้อมูลหาย
//     (ยืนยันด้วยตัวทดสอบกดจริง 8/8 เคส ก่อนนำมาใช้ — กฎ 14)
// ════════════════════════════════════════════════════════════
function tfSrsRank(r) { if (!r) return -1; if (r.mastered) return 3; return (r.stage || 0); }
function tfSrsPickAdvanced(a, b) {
  if (!a) return b; if (!b) return a;
  var ra = tfSrsRank(a), rb = tfSrsRank(b);
  if (ra !== rb) return ra > rb ? a : b;
  var da = a.dueDate || '', db = b.dueDate || '';
  if (da !== db) return (da > db) ? a : b;
  return a;
}
var __tfSrsSyncPromise = null;
window.__tfSrsSyncedOnce = false;
var __tfLearningOwnerEpoch = 0;
var __tfSrsRequestSequence = 0;
var __tfLatestSrsRequest = 0;
function tfSrsOwnerCurrent(ownerId, ownerEpoch, requestId) {
  var currentId = (window.READING_AUTH && READING_AUTH.srsUser && String(READING_AUTH.srsUser.id)) || '';
  var currentEpoch = Number(window.SITE_AUTH && SITE_AUTH.learningOwnerEpoch) || 0;
  if (currentId !== ownerId || currentEpoch !== ownerEpoch) return false;
  if (requestId != null && requestId !== __tfLatestSrsRequest) return false;
  try { return !!(window.PHASE1_ACCOUNT_BOUNDARY && localStorage.getItem(PHASE1_ACCOUNT_BOUNDARY.ownerKey) === ownerId); }
  catch (e) { return false; }
}
function tfResetAccountStateAtBoundary() {
  var epoch = Number(window.SITE_AUTH && SITE_AUTH.learningOwnerEpoch) || 0;
  if (epoch === __tfLearningOwnerEpoch) return false;
  __tfLearningOwnerEpoch = epoch;
  __tfLatestSrsRequest = ++__tfSrsRequestSequence;
  __tfSrsSyncPromise = null;
  window.__tfSrsSyncedOnce = false;
  return true;
}
function tfSyncSrsFromServer() {
  if (__tfSrsSyncPromise) return __tfSrsSyncPromise;
  __tfSrsSyncPromise = (function () {
    try {
      // ต้อง "ล็อกอินจริง" (มี JWT) เท่านั้น — แค่ให้อีเมล (lead) ไม่มีแถวบนเซิร์ฟเวอร์อยู่แล้ว
      if (!(window.READING_AUTH && READING_AUTH.srsUser)) return Promise.resolve(false);
      var sb = window.getSupabaseClient ? window.getSupabaseClient() : null;
      if (!sb || !sb.from) return Promise.resolve(false);
      // dedupe fetch 2026-07-20: tfWireSrsSync รีเซ็ต __tfSrsSyncPromise แล้วเรียกฟังก์ชันนี้ใหม่ทุกครั้งที่ SITE_AUTH.onChange ยิง
      //   (หลายรอบต่อโหลดหน้าเดียว) → ห่อ fetch ด้วย getCachedFetch กันยิง Supabase ซ้ำทั้งที่ user เดิม
      var _uid = String(READING_AUTH.srsUser.id);
      var _ownerEpoch = Number(window.SITE_AUTH && SITE_AUTH.learningOwnerEpoch) || 0;
      var _requestId = ++__tfSrsRequestSequence;
      __tfLatestSrsRequest = _requestId;
      var _fetchSrs = window.getCachedFetch
        ? window.getCachedFetch('tone_srs_state:tone:' + _uid, function () {
            return sb.from('tone_srs_state').select('level, word, stage, due_date, ever_failed, mastered').eq('user_id', _uid).eq('game', 'tone');
          })
        : sb.from('tone_srs_state').select('level, word, stage, due_date, ever_failed, mastered').eq('user_id', _uid).eq('game', 'tone');
      return _fetchSrs
        .then(function (res) {
          if (!tfSrsOwnerCurrent(_uid, _ownerEpoch, _requestId)) return false;
          if (res.error || !res.data) return false;
          var local = tfLoadSrs(), changed = false;
          res.data.forEach(function (row) {
            var stateId = String(row.word || '');
            var exact = WORD_LIST.some(function (entry) {
              return entry.contentKey === stateId && Number(entry.level) === Number(row.level);
            });
            if (!exact) return;
            var key = TF_SRS.keyFor(stateId, row.level);
            var srv = { stage: row.stage || 0, dueDate: row.due_date || '', dueAt: 0,
                        everFailed: !!row.ever_failed, mastered: !!row.mastered };
            var cur = local[key];
            var win = tfSrsPickAdvanced(cur, srv);
            // เขียนกลับเฉพาะเมื่อผลต่างจากเดิมจริง (กันเขียน localStorage ฟุ่มเฟือย)
            if (!cur || win.stage !== cur.stage || (win.dueDate || '') !== (cur.dueDate || '') || (!!win.mastered) !== (!!cur.mastered)) {
              local[key] = win; changed = true;
            }
          });
          if (changed) tfSaveSrs(local);
          window.__tfSrsSyncedOnce = true;
          return changed;
        })
        .catch(function () { if (!tfSrsOwnerCurrent(_uid, _ownerEpoch, _requestId)) return false; window.__tfSrsSyncedOnce = true; return false; });
    } catch (e) { window.__tfSrsSyncedOnce = true; return Promise.resolve(false); }
  })();
  return __tfSrsSyncPromise;
}
// ทริกเกอร์: ซิงก์ตอนเปิดหน้าถ้าล็อกอินอยู่แล้ว + ทุกครั้งที่ล็อกอินใหม่ระหว่างเล่น
// ⚠️ ต้องลงทะเบียน "หลัง DOM พร้อม" เพราะสคริปต์เกม (inline) รันก่อนสคริปต์ defer (auth-widget) → ตอน parse ยังไม่มี SITE_AUTH
function tfWireSrsSync() {
  try {
    if (window.SITE_AUTH && SITE_AUTH.onChange) {
      SITE_AUTH.onChange(function (u) {
        tfResetAccountStateAtBoundary();
        if (u) { __tfSrsSyncPromise = null; window.__tfSrsSyncedOnce = false; tfSyncSrsFromServer(); }
      });
    }
  } catch (e) {}
  // fallback แบบ poll — กันกรณี onChange ไม่ยิงตอนโหลด หรือ READING_AUTH พร้อมช้า · ลองทุก 0.5วิ จนซิงก์สำเร็จ สูงสุด ~12วิ
  var _tfT = 0, _tfIv = setInterval(function () {
    _tfT++;
    try {
      if (window.__tfSrsSyncedOnce) { clearInterval(_tfIv); return; }
      if (window.READING_AUTH && READING_AUTH.srsUser) tfSyncSrsFromServer();
    } catch (e) {}
    if (_tfT >= 24) clearInterval(_tfIv);
  }, 500);
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', tfWireSrsSync); else tfWireSrsSync();
// ===== TF_SRS ENGINE END =====

// ── กดเลข 1–5 บนคีย์บอร์ด (คอม) แทนการคลิกปุ่มวรรณยุกต์ — Lin สั่ง 2026-07-20 ──
// ใช้เฉพาะหน้าเดา (session-guess) เท่านั้น + ปิดเมื่อกำลังพิมพ์หรือมี popup เปิดอยู่
function tfWireToneKeyboard() {
  document.addEventListener('keydown', function (e) {
    if (tfTouchMobileSurface()) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    var tag = (document.activeElement && document.activeElement.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (typeof S === 'undefined' || S.step !== 'session-guess') return;
    if (document.querySelector('.sg-start-overlay, .tf-ask-overlay')) return; // popup เปิดอยู่ ห้ามกดลัด
    var n = parseInt(e.key, 10);
    if (n < 1 || n > 5) return;
    var btns = document.querySelectorAll('.sg-tone-btn');
    var btn = btns[n - 1];
    if (btn) { btn.click(); e.preventDefault(); }
  });
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', tfWireToneKeyboard); else tfWireToneKeyboard();

function tfOrdinaryDesktop() {
  return !!(window.matchMedia && window.matchMedia('(min-width: 769px) and (min-height: 601px)').matches);
}

function tfMobilePortrait() {
  return !!(window.matchMedia && window.matchMedia('(max-width: 768px) and (orientation: portrait)').matches);
}

function tfDesktopOrPortrait() {
  return tfOrdinaryDesktop() || tfMobilePortrait();
}

function tfMobileLandscape() {
  return !!(window.matchMedia && window.matchMedia('(orientation: landscape) and (max-width: 1024px) and (max-height: 600px)').matches);
}

function tfTouchMobileSurface() {
  return tfMobilePortrait() || tfMobileLandscape();
}

function tfNeutralSkipSurface() {
  return true;
}

// Desktop Enter starts an explicit guided question or uses the visible Next action.
// It must never activate the remembered/skip action or collide with editable controls.
function tfWireEnterNext() {
  document.addEventListener('keydown', function (e) {
    if (tfTouchMobileSurface()) return;
    if (e.key !== 'Enter' || e.defaultPrevented || e.repeat || e.isComposing) return;
    if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
    var active = e.target || document.activeElement;
    var tag = (active && active.tagName) || '';
    if (tfOrdinaryDesktop() && active && active.closest && active.closest('.tf-known-btn')) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (/^(INPUT|TEXTAREA|SELECT|BUTTON|A)$/.test(tag) || (active && active.isContentEditable)) return;
    if (document.querySelector('.sg-start-overlay, .tf-ask-overlay, #tf-reveal-ov, #tf-ask-ov')) return; // popup เปิดอยู่ ห้ามชน
    var btn = tfOrdinaryDesktop() ? document.getElementById('tf-guide-start-btn') : null;
    if (!btn) btn = document.getElementById('tf-session-next-btn');
    if (btn && btn.offsetParent !== null && !btn.disabled) {
      btn.click();
      e.preventDefault();
      e.stopPropagation();
    }
  });
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', tfWireEnterNext); else tfWireEnterNext();

// ════════════════════════════════════════════════════════════
// ===== TF_GAME ENGINE START =====  (สเตจ 2: streak/freeze/เป้า/คำทอง)
// ════════════════════════════════════════════════════════════
var TF_GAME_CFG = {
  GOLDEN_WORD_CHANCE: 0.18,   // โอกาสคำทอง (~18%)
  GOLDEN_WORD_MULT: 2         // คำทองตอบได้ ×2
};

// Daily Streak is now an authenticated server status, never client math.
var TF_STREAK = {
  applySetComplete: function () {
    var streak = (window.GAME_ACCOUNT && GAME_ACCOUNT.getStreak()) || 0;
    return { state: { streak: streak }, events: {} };
  },
  isAlive: function (state) { return !!(state && state.streak > 0); }
};
// ===== TF_GAME ENGINE END =====

// ════════════════════════════════════════════════════════════
// ===== TF_MINA + BADGES START =====  (สเตจ 3: น้องมีนา + แบดจ์)
// น้องมีนา 米娜 — ใช้ emoji ชั่วคราว (วาดตัวจริงทีหลัง)
// ════════════════════════════════════════════════════════════
var TF_MINA_EMOJI = '👧🏻';   // หน้าตาชั่วคราวของน้องมีนา
// Lin 2026-07-07: เสียงมีนา — จีนไต้หวันอุ่นๆ นุ่มๆ (ไกด์อ่อนโยน + วิญญาณเซริกะ) · หลายเวอร์ชันต่อสถานการณ์ สุ่มโชว์กันน่าเบื่อ (ดู 01_มีนา_สเปคคาแรกเตอร์.md)
var TF_MINA_LINES = {
  welcome:   ['哈囉～我是米娜 🌾 我們一起把泰文變厲害，好不好？'],
  perfect:   ['全部一次答對！你比自己想的還厲害喔 🌾 米娜給你拍拍手 👏', '一題都沒錯～好棒，米娜好開心 ✨'],
  greatSet:  ['這組表現很棒，我們慢慢繼續 💪', '做得很好呢～要再一組看看嗎？🌱'],
  goodSet:   ['完成囉！每天一點點，泰語會越來越好 🌱', '辛苦了～有練就有進步喔 😊'],
  goalMet:   ['今天也做到了呢，好棒 🌙 連續第 {n} 天！明天也要回來找米娜喔'],
  freezeUsed:['米娜幫你保住連續紀錄了～用掉 1 個護盾 🛡️'],
  comeback:  ['又見面啦～今天也一起練習吧 😊', '你回來了！米娜好想你 🌾'],
  streakWarn:['有點想你了…要不要回來陪米娜練習一下呢 🌾'],
  wrong:     ['沒關係的…這個字米娜以前也搞混過，我們再看一次好嗎？', '再試一次就好，米娜陪你 💛'],
  correct:   ['哇～答對了，你做得很好 ✨', '對了對了！就是這樣 🌾'],
  combo:     ['哇～連續答對，米娜都替你開心 🔥', '停不下來了，好厲害 ⚡'],
  golden:    ['這個字…閃閃發光的！米娜找到黃金稻穗了 🌾✨ 分數加倍！']
};
function tfMinaSay(key, vars) {
  var t = TF_MINA_LINES[key];
  if (Array.isArray(t)) t = t[Math.floor(Math.random() * t.length)] || '';
  t = t || '';
  if (vars) Object.keys(vars).forEach(function (k) { t = t.replace('{' + k + '}', vars[k]); });
  return t;
}
function tfMinaBubble(msg, size) {
  if (!msg) return '';
  return '<div class="tf-mina' + (size === 'big' ? ' tf-mina-big' : '') + '">' +
    '<div class="tf-mina-face">' + TF_MINA_EMOJI + '</div>' +
    '<div class="tf-mina-bubble">' + msg + '</div>' +
  '</div>';
}
// ── น้องมีนา: ป๊อปพูดสดระหว่างเล่น (โทสต์มุมล่างซ้าย) — Lin 2026-07-10 ──
// throttle=true → สุ่มโชว์บางครั้ง (กันน่าเบื่อ ตามหลัก variable-ratio) · false → โชว์เสมอ (ผิด/คำทอง/ทักทาย/คอมโบ)
var _tfMinaToastTimer = null;
var _tfMinaToastQueue = []; var _tfMinaToastBusy = false; // กันบทพูดน้องมีนาทับ/ตัดกันก่อนอ่านทัน — Lin 2026-07-12
function tfMinaToast(key, opts) {
  opts = opts || {};
  if (opts.throttle && Math.random() > (opts.chance || 0.34)) return;
  var msg = tfMinaSay(key, opts.vars);
  if (!msg) return;
  _tfMinaToastQueue.push({ msg: msg, dur: opts.dur || 2600 });
  _tfProcessMinaToastQueue();
}
function _tfProcessMinaToastQueue() {
  if (_tfMinaToastBusy || !_tfMinaToastQueue.length) return;
  _tfMinaToastBusy = true;
  var item = _tfMinaToastQueue.shift();
  var el = document.getElementById('tf-mina-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'tf-mina-toast'; el.className = 'tf-mina-toast';
    el.innerHTML = '<div class="tf-mina-toast-face">' + TF_MINA_EMOJI + '</div>' +
                   '<div class="tf-mina-toast-bubble"></div>';
    document.body.appendChild(el);
  }
  el.querySelector('.tf-mina-toast-bubble').innerHTML = item.msg;
  void el.offsetWidth;
  el.classList.add('show');
  if (_tfMinaToastTimer) clearTimeout(_tfMinaToastTimer);
  _tfMinaToastTimer = setTimeout(function () {
    el.classList.remove('show');
    setTimeout(function () { _tfMinaToastBusy = false; setTimeout(_tfProcessMinaToastQueue, 220); }, 340);
  }, item.dur);
}

// ── ระบบแบดจ์ (ธีมข้าว/อาหารไทย) ──
// เงื่อนไขปลดล็อกปรับได้ที่ cond · เนื้อหาการ์ดความรู้ (th/reading/desc) รอครูตรวจจากไฟล์ร่าง
var TF_BADGES_DEF = [
  // ชั้น 1 — ข้าวเติบโต (บันไดสตรีค) — ใช้ภาพ SVG จริง assets/badges/<id>.svg (LIN 2026-06-20)
  { id: 'rice_seed',   tier: 1, emoji: '🌾', img: 'assets/badges/rice_seed.svg',   zh: '稻種',   th: 'เมล็ดข้าว',   reading: 'mét kâao',     need: '連續 3 天',   cond: function (st) { return st.streak >= 3; } },
  { id: 'rice_sprout', tier: 1, emoji: '🌱', img: 'assets/badges/rice_sprout.svg', zh: '秧苗',   th: 'ต้นกล้า',     reading: 'tôn klâa',     need: '連續 7 天',   cond: function (st) { return st.streak >= 7; } },
  { id: 'rice_ear',    tier: 1, emoji: '🌿', img: 'assets/badges/rice_ear.svg',    zh: '幼穗',   th: 'รวงอ่อน',     reading: 'ruang ɔ̀ɔn',    need: '連續 14 天',  cond: function (st) { return st.streak >= 14; } },
  { id: 'rice_golden', tier: 1, emoji: '🌾', img: 'assets/badges/rice_golden.svg', zh: '金穗',   th: 'รวงข้าวทอง',  reading: 'ruang kâao thɔɔng', need: '連續 30 天', cond: function (st) { return st.streak >= 30; } },
  { id: 'rice_field',  tier: 1, emoji: '🏞️', img: 'assets/badges/rice_field.svg',  zh: '金色稻田', th: 'ทุ่งนาทอง',  reading: 'thûng naa thɔɔng',  need: '連續 100 天', cond: function (st) { return st.streak >= 100; } },
  // ชั้น 2 — สายพันธุ์ข้าว (ปลดด้วย "ดาวรวม" จาก 2 เกม) — Lin 2026-06-27
  { id: 'hommali',   tier: 2, emoji: '🍚', img: 'assets/badges/hommali.svg',   zh: '茉莉香米',     th: 'ข้าวหอมมะลิ',  reading: 'kâao hɔ̌ɔm malí', need: '累積 10 顆星',  cond: function (st) { return (st.starsTotal||0) >= 10; } },
  { id: 'khaoniaw',  tier: 2, emoji: '🍙', img: 'assets/badges/khaoniaw.svg',  zh: '糯米',         th: 'ข้าวเหนียว',   reading: 'kâao nǐaw',      need: '累積 20 顆星',  cond: function (st) { return (st.starsTotal||0) >= 20; } },
  { id: 'riceberry', tier: 2, emoji: '🟣', img: 'assets/badges/riceberry.svg', zh: '紫米 Riceberry', th: 'ไรซ์เบอร์รี่', reading: 'ráai-bəə-rîi',  need: '累積 40 顆星',  cond: function (st) { return (st.starsTotal||0) >= 40; } },
  { id: 'homnin',    tier: 2, emoji: '⚫', img: 'assets/badges/homnin.svg',    zh: '香黑米',       th: 'ข้าวหอมนิล',   reading: 'kâao hɔ̌ɔm nín', need: '累積 60 顆星',  cond: function (st) { return (st.starsTotal||0) >= 60; } },
  { id: 'sangyod',   tier: 2, emoji: '🔴', img: 'assets/badges/sangyod.svg',   zh: '紅米',         th: 'ข้าวสังข์หยด', reading: 'kâao sǎngyòt',   need: '累積 100 顆星', cond: function (st) { return (st.starsTotal||0) >= 100; } }
];
// helper: คืน HTML ไอคอนแบดจ์ (ใช้ภาพ SVG ถ้ามี ไม่งั้น emoji) — LIN 2026-06-20
function tfBadgeIcon(b, px) {
  px = px || 46;
  if (b && b.img) return '<img src="' + b.img + '" alt="' + (b.zh || '') + '" style="width:' + px + 'px;height:' + px + 'px;object-fit:contain;" onerror="this.replaceWith(document.createTextNode(\'' + (b.emoji || '🏅') + '\'))">';
  return '<span style="font-size:' + Math.round(px * 0.8) + 'px;">' + ((b && b.emoji) || '🏅') + '</span>';
}

// เครื่องเช็กแบดจ์ (บริสุทธิ์) — คืน id ที่ "เพิ่งปลด" จาก stats เทียบกับที่ปลดแล้ว
var TF_BADGES = {
  check: function (stats, unlocked, defs) {
    defs = defs || TF_BADGES_DEF;
    unlocked = unlocked || {};
    var fresh = [];
    defs.forEach(function (b) {
      if (!unlocked[b.id]) { try { if (b.cond(stats)) fresh.push(b.id); } catch (e) {} }
    });
    return fresh;
  },
  byId: function (id, defs) {
    defs = defs || TF_BADGES_DEF;
    for (var i = 0; i < defs.length; i++) if (defs[i].id === id) return defs[i];
    return null;
  }
};

// ── badges: localStorage (stats + unlocked) ──
var TF_BADGE_KEY = 'tf_badges_v1';
function tfLoadBadges() {
  try { var r = localStorage.getItem(TF_BADGE_KEY); return r ? JSON.parse(r) : { unlocked: {}, stats: {} }; }
  catch (e) { return { unlocked: {}, stats: {} }; }
}
function tfSaveBadges(b) {
  try { localStorage.setItem(TF_BADGE_KEY, JSON.stringify(b)); } catch (e) {}
}
// เรียกตอนจบชุด: อัปเดต stats สะสม + เช็กปลดแบดจ์ คืน array ของ badge def ที่เพิ่งปลด
function tfUpdateBadgesOnSetComplete(info) {
  var data = tfLoadBadges();
  var st = data.stats || {};
  st.wordsTotal = (st.wordsTotal || 0) + (info.words || 0);
  st.perfectSets = (st.perfectSets || 0) + (info.isPerfect ? 1 : 0);
  st.maxCombo = Math.max(st.maxCombo || 0, info.maxCombo || 0);
  st.streak = (window.GAME_ACCOUNT) ? Math.max(GAME_ACCOUNT.getStreak(), info.streak || 0, st.streak || 0) : (info.streak || st.streak || 0);   // streak รวม 2 เกม → ปลดแบดจ์ต้นข้าว
  st.starsTotal = (window.GAME_ACCOUNT) ? GAME_ACCOUNT.getStars() : (st.starsTotal || 0);   // ดาวรวม 2 เกม → ปลดแบดจ์พันธุ์ข้าว
  data.stats = st;
  var fresh = TF_BADGES.check(st, data.unlocked, TF_BADGES_DEF);
  var today = todayStr();
  fresh.forEach(function (id) { data.unlocked[id] = today; });
  tfSaveBadges(data);
  return fresh.map(function (id) { return TF_BADGES.byId(id); }).filter(Boolean);
}
// ===== TF_MINA + BADGES END =====

// สุ่มว่าคำถัดไปเป็น "คำทอง" ไหม
function tfRollGolden() {
  return Math.random() < (TF_GAME_CFG.GOLDEN_WORD_CHANCE || 0);
}

// ════════════════════════════════════════════════════════════
// Lin 2026-07-04: ตัดระบบ "ล็อกชุด + ห้องคำพิเศษ ⭐" ทิ้งทั้งระบบแล้ว — ไม่ใช้แล้ว
// (เดิม LIN 2026-06-20 สร้างไว้ แต่ตอนนี้กด 初級/中級 ข้ามหน้าเลือกหมวด/ชุดไปเลย
//  ระบบนี้ไม่มีทางเข้าถึงในเส้นทางหลักอีกแล้ว — เอา tfSetStatus/tfRecordSetResult/
//  tfLoadSpecialWords/tfAddSpecialWords/tfSpecialProcessResults ออกทั้งหมด)
// ── 高級: ประโยคเต็ม (Lin 2026-07-03) ──
var advSentenceCtx = null;      // {th, zh, particle} ของประโยคที่กำลังเล่น (null = ไม่ได้เล่นโหมด高級句子) — ใช้โชว์บนแบนเนอร์ · th/zh ไม่รวมคำลงท้ายสุภาพแล้ว (2026-07-31), particle = ข้อความคำลงท้ายที่จะโชว์ต่อท้าย (หรือ null ถ้าปิดปุ่ม/ไม่มีข้อมูล)
var advSentIdx = -1;            // index ของประโยคปัจจุบันใน ADV_SENTENCES

// ── ปุ่มครับ/ค่ะ/คะ ท้ายประโยค高級 (Lin 2026-07-31 · ข้อมูล politeF เพิ่มจริง 2026-08-01) ──
//   ไม่เกี่ยวกับคะแนน/การทายเสียงเลย — เป็นแค่ข้อความโชว์ต่อท้าย "ประโยคเต็ม" บนแบนเนอร์เท่านั้น
//   ครับ (ชาย) ใช้ได้เหมือนกันทุกประโยค (คำเดียวไม่เปลี่ยนตามชนิดประโยค) — ต่อได้เลยไม่ต้องมีข้อมูลเพิ่ม
//   ค่ะ/คะ (หญิง) อ่านจาก s.politeF ที่ Lin ตรวจ+ยืนยันแล้วทีละประโยค (adv-sentences.js) — บอกเล่า→ค่ะ / คำถาม→คะ
//   politeF: null = ประโยคที่ขึ้นด้วย "ผม" (สรรพนามผู้ชายเท่านั้น) → Lin สั่ง 2026-08-01 บังคับโชว์ครับเสมอ แม้เลือกโหมดหญิง (ไม่ใช่ "ยังไม่ได้กรอกข้อมูล" — ชุด 30 ประโยคนี้ Lin ตรวจครบ 100% แล้ว)
function tfParticleMode() { try { return localStorage.getItem('games_particle_mode') || 'off'; } catch (e) { return 'off'; } }
function tfSetParticleMode(m) { try { localStorage.setItem('games_particle_mode', m); } catch (e) {} }
// คืนคำลงท้ายสุภาพที่จะโชว์ (หรือ null) ตามโหมดปุ่มปัจจุบัน + ข้อมูล politeF ของประโยค s — ใช้ตอนเริ่มเล่นและตอนกดปุ่มระหว่างเล่น (ไม่รีเซ็ตรอบ)
function tfShowParticleFor(s) {
  var mode = tfParticleMode();
  if (mode === 'f' && s && s.politeF) return s.politeF;
  return null;
}
// ปุ่มจริงอยู่ในเมนู 🍚 (#tf-particle-toggle, tone-finder.html) — นอก banner.innerHTML → ต้องซิงค์ icon/data-mode/ซ่อน-โชว์ตรงนี้ทุกครั้งที่ render() (WordMenu.js อ่าน data-mode ผ่าน READERS.particle)
function tfSyncParticleBtn() {
  var b = document.getElementById('tf-particle-toggle');
  if (!b) return;
  if (!advSentenceCtx) { b.style.display = 'none'; return; } // ไม่ได้เล่น高級句子 → ซ่อนแถวนี้ในเมนู🍚 ไปเลย (WordMenu ซ่อนแถวอัตโนมัติเมื่อปุ่ม display:none)
  b.style.display = '';
  var mode = tfParticleMode();
  b.setAttribute('data-mode', mode);
  b.title = mode === 'm' ? '目前：句尾加「ครับ」（男生禮貌詞）' : (mode === 'f' ? '目前：句尾加「ค่ะ/คะ」（女生禮貌詞）' : '目前：不加句尾禮貌詞');
  b.setAttribute('aria-label', b.title);
}

// ════════════════════════════════════════════════════════════
// ── คำอ่านใต้คำศัพท์: 讀音 (ไทย 🐣/🥚) + 英文讀音 (โรมัน 🔡/🔠) — Lin 2026-07-25
// เดิมเกมเสียงไม่มี 2 ปุ่มนี้เลย เพราะ "คำอ่านเฉลยวรรณยุกต์ก่อนตอบ" (โน้ต 2026-07-16)
// รอบนี้ Lin สั่งให้เพิ่ม แต่ล็อกไว้ว่า **โชว์เฉพาะหลังตอบแล้วเท่านั้น** → ขั้น 'session-guess' (หน้าเดาวรรณยุกต์) จะไม่โชว์เด็ดขาด
// ค่าจำใช้คีย์เดียวกับเกมอ่าน/เกมพิมพ์ (rg_pron_mode / rg_en_mode) → ตั้งครั้งเดียวเหมือนกันทุกเกม
// ════════════════════════════════════════════════════════════
var tfPronMode = (function () { try { var v = localStorage.getItem('rg_pron_mode'); return v === null ? false : v === '1'; } catch (e) { return false; } })();
var tfEnMode   = (function () { try { var v = localStorage.getItem('rg_en_mode');   return v === null ? false : v === '1'; } catch (e) { return false; } })();

function tfSyncReadBtns() {
  var b1 = document.getElementById('rg-pron-toggle');
  if (b1) {
    // Lin 2026-07-30: 讀音 ปลดล็อกแล้ว — โชว์ใต้คำได้ตั้งแต่ก่อนตอบ เหมือนเกมอื่น (ดู tfReadingLineHtml)
    b1.textContent = tfPronMode ? '🐣' : '🥚';
    b1.title = tfPronMode ? '目前：讀音已顯示' : '目前：讀音已隱藏（點擊顯示）';
    b1.setAttribute('aria-label', b1.title);
  }
  // Lin 2026-07-30: ปุ่ม 英文讀音 ย้ายออกจากเมนู → ไปอยู่ข้างคำในหน้าเฉลยแทน (id 'tf-result-en-btn' สร้างใน resultHtml)
  var b2 = document.getElementById('tf-result-en-btn');
  if (b2) {
    b2.textContent = tfEnMode ? '🔡' : '🔠';
    b2.title = tfEnMode ? '目前：英文讀音已顯示（點擊隱藏）' : '目前：英文讀音已隱藏（點擊顯示）';
    b2.setAttribute('aria-label', b2.title);
  }
}

// entry ของคำที่กำลังเล่นอยู่ (มี readingTH / readingEN จาก buildWordListForToneFinder)
function tfCurEntry() {
  try { if (session && session.words && session.words.length) return session.words[session.index]; } catch (e) {}
  return (typeof randomEntry !== 'undefined') ? randomEntry : null;
}

// คำอ่านโรมันมีเครื่องหมายเสียง จึงแสดงหลังเฉลยเท่านั้น
function tfReadingUnlocked() { return S.step === 'result' || S.step === 'overview'; }

function tfReadingLineHtml() {
  var showEn = tfEnMode && tfReadingUnlocked();
  if (!tfPronMode && !showEn) return '';
  var e = tfCurEntry();
  if (!e) return '';

  // ── กันเฉลยข้ามพยางค์ (Lin 2026-07-25) — เหลือใช้กับ 英文讀音 เท่านั้น (2026-07-30) ──
  // คำหลายพยางค์ถามทีละพยางค์ → ถ้าโชว์คำอ่าน "ทั้งคำ" หลังตอบพยางค์แรก = เฉลยวรรณยุกต์พยางค์ที่ยังไม่ถามด้วย
  // เลยตัดให้เหลือแค่พยางค์ที่ตอบไปแล้ว (ที่เหลือแทนด้วย …) · ถ้าจำนวนพยางค์ไม่ตรงกัน ไม่ตัด (กันข้อมูลเพี้ยน)
  var _multi = S.syllables && S.syllables.length > 1 && S.selectedSyl != null;
  var _done  = _multi ? (S.selectedSyl + 1) : 0;   // จำนวนพยางค์ที่ตอบแล้ว (รวมพยางค์ปัจจุบัน เพราะตอบแล้วถึงจะถึงบรรทัดนี้)
  function _clip(str) {
    if (!_multi || !str) return str;
    var ps = String(str).split('-');
    if (ps.length !== S.syllables.length || _done >= ps.length) return str;
    return ps.slice(0, _done).join('-') + '-…';
  }

  var html = '';
  // 讀音 ไทย: โชว์ทุกขั้น เต็มทั้งคำ ไม่ clip + โชว์ทุกคำแม้อ่านตรงกับตัวเขียน (Lin 2026-07-30 — กติกาเดียวกับเกมเรียงคำที่แก้รอบนี้ กันเข้าใจผิดว่าปุ่มเสีย)
  // Lin 2026-08-01: โหมดประโยค高級 ไม่โชว์คำอ่านรายคำ (tf-read-th) ตรงนี้แล้ว — ซ้อนกับคำอ่านยาวทั้งประโยค (sentReadingHtml/tf-adv-sent-reading) ที่โชว์อยู่ด้านล่างอยู่แล้ว (ซึ่งมีคำอ่านของคำนี้รวมอยู่ในนั้นแล้ว)
  if (tfPronMode && !advSentenceCtx) {
    if (!e.readingTH) throw new Error('CATALOG_AUTHORITY_INCOMPLETE:readingTH');
    var _th = e.readingTH;
    if (_th) html += '<div class="tf-read-th">' + _th + '</div>';
  }
  if (showEn)     { var _en = e.readingEN || '';           if (_en) html += '<div class="tf-read-en">' + _clip(_en) + '</div>'; }
  return html;
}

// อัปเดตเฉพาะบรรทัดคำอ่าน (ไม่ render ใหม่ทั้งหน้า — กันสถานะเกมสะดุด)
function tfUpdateReadingLine() {
  var el = document.getElementById('tf-read-line');
  if (el) el.innerHTML = tfReadingLineHtml();
}

// Lin 2026-07-30 (บั๊กจริงที่เจอตอนเทส): กดปุ่ม 讀音/英文讀音 ตอนอยู่ "หน้าเฉลย" แล้วหน้าจอไม่เปลี่ยน
//   สาเหตุ: หน้าเฉลยซ่อนแบนเนอร์ไว้ (noBannerSteps) แต่ไม่ได้ล้างเนื้อในทิ้ง → กล่อง #tf-read-line เก่ายังค้างอยู่ใน DOM (แค่มองไม่เห็น)
//   โค้ดเลยไปอัปเดตกล่องที่ซ่อนอยู่แทน ผู้เล่นเลยไม่เห็นอะไรเปลี่ยน
//   แก้: อัปเดตเฉพาะบรรทัดได้ก็ต่อเมื่อแบนเนอร์ "โชว์อยู่จริง" เท่านั้น · นอกนั้นวาดใหม่ทั้งหน้า (วิธีเดียวกับปุ่ม 提示)
function tfRepaintReading() {
  var bn = document.getElementById('tf-banner');
  var line = document.getElementById('tf-read-line');
  // Lin 2026-07-31 (บั๊กที่เจอตอนเทสสด — ตัวที่ 2): โหมดประโยค高級 คำอ่านทั้งประโยค (tf-adv-sent-reading)
  //   ฝังอยู่ใน banner.innerHTML ตรงๆ ไม่ได้อยู่ใน #tf-read-line → กดปุ่ม 讀音 แล้วอัปเดตแค่ #tf-read-line (คำอ่านรายคำ)
  //   คำอ่านทั้งประโยคเลยไม่หายไปด้วย ต้องบังคับวาดใหม่ทั้งหน้า (render()) เฉพาะตอนอยู่ในโหมดประโยค高級
  if (!advSentenceCtx && line && bn && bn.style.display !== 'none') tfUpdateReadingLine();
  else render();
}

// ════════════════════════════════════════════════════════════
// ── โหมด 提示: เปิดดูค่าที่ตรวจแล้วโดยตรง
//   และ **เปิดโหมดนี้ = ไม่ได้อะไรเลย** ไม่มีคะแนน ไม่มีดาว ไม่มีความคืบหน้าทบทวน (SRS) ไม่มีสตรีค/แบดจ์/ชาเลนจ์
// ค่าจำใช้คีย์เดียวกับเกมอ่าน/เกมพิมพ์ (rg_guide_mode) → ตั้งครั้งเดียวเหมือนกันทุกเกม
// ════════════════════════════════════════════════════════════
var tfGuideMode = (function () { try { return localStorage.getItem('rg_guide_mode') === '1'; } catch (e) { return false; } })();

function tfSyncGuideBtn() {
  var b = document.getElementById('tf-guide-toggle');
  if (!b) return;
  b.textContent = tfGuideMode ? '💡' : '🔥';
  b.title = tfGuideMode ? '有提示（純練習・完全不計分）' : '無提示（挑戰・正常計分）';
  b.setAttribute('aria-label', b.title);
}

// ป้ายบอกโหมด (เหมือนเกมอ่าน) — ให้ผู้เล่นรู้ตัวว่ากำลังเล่นแบบไม่คิดคะแนนอยู่
function tfGuideNoteHtml() {
  if (!tfGuideMode) return '';
  return '<div class="tf-guide-note">💡 <b>練習模式</b>・純練習不計分（沒有分數、星星與複習進度）</div>';
}

// Browser back/restore can preserve an already-rendered active question.
// Re-arm the explicit guided-question start gate when the page is restored.
function tfArmGuideIntroForPageReturn() {
  if (!tfGuideMode || !session || !S || S.step !== 'session-guess' || tfCurWordNoTools()) return false;
  session.currentWordGuideIntroPending = true;
  return true;
}
window.addEventListener('pagehide', function () {
  tfArmGuideIntroForPageReturn();
});
window.addEventListener('pageshow', function (event) {
  if (event.persisted && tfArmGuideIntroForPageReturn()) render();
});

// ── สถิติคำที่ตอบผิดรายคำ (localStorage) + หน้า 全部 แบบ 50/50 เน้นคำที่ยังไม่แม่น — LIN 2026-06-20 ──
var TF_WORD_WRONG_KEY = 'tf_word_wrong_v1';
function tfLoadWordWrong() { if(!tfSrsLoggedIn())return {};try { return JSON.parse(localStorage.getItem(TF_WORD_WRONG_KEY) || '{}') || {}; } catch (e) { return {}; } }
function tfRecordWordWrong(results) {
  if (!results || !tfSrsLoggedIn()) return;
  var m = tfLoadWordWrong(), changed = false;
  results.forEach(function (r) {
    if ((r.mistakes || 0) > 0 || r.forced) { var w = r.entry.word; m[w] = (m[w] || 0) + 1; changed = true; }
  });
  if (changed) { try { localStorage.setItem(TF_WORD_WRONG_KEY, JSON.stringify(m)); } catch (e) {} }
}
// ════════════════════════════════════════════════════════════
// ชาเลนจ์มีเวลาจำกัด (รายสัปดาห์ หมุนอัตโนมัติจากคลังโจทย์ — LIN แค่อนุมัติคลัง) — LIN 2026-06-20
//   เพิ่ม/แก้โจทย์ได้ที่ TF_CHALLENGES · ระบบเลือกโจทย์ตามเลขสัปดาห์เอง ไม่ต้องตั้งมือ
// ════════════════════════════════════════════════════════════
var TF_CHALLENGE_KEY = 'tf_challenge_v1';
var TF_CHALLENGES = [
  { id: 'c_correct30', title: '答對 30 個字', sub: '本週累積答對 30 題', type: 'correct', target: 30, emoji: '🎯' },
  { id: 'c_sets5',     title: '玩完 5 組',     sub: '本週完成 5 組練習',   type: 'sets',    target: 5,  emoji: '📚' },
  { id: 'c_perfect3',  title: '3 次完美過關', sub: '本週完美過關 3 次',   type: 'perfect', target: 3,  emoji: '🌟' },
  { id: 'c_combo5',    title: '連對 5 題',     sub: '本週達成一次連對 5',  type: 'combo',   target: 5,  emoji: '🔥' },
  { id: 'c_correct60', title: '答對 60 個字', sub: '本週累積答對 60 題',  type: 'correct', target: 60, emoji: '💪' }
];
var TF_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
function tfWeekIndex() { return Math.floor(Date.now() / TF_WEEK_MS); }          // เลขสัปดาห์ (หมุนทุก 7 วัน)
function tfWeekEndMs() { return (tfWeekIndex() + 1) * TF_WEEK_MS; }             // เวลาเริ่มสัปดาห์ถัดไป (เดดไลน์)
function tfActiveChallenge() { return TF_CHALLENGES[tfWeekIndex() % TF_CHALLENGES.length]; }
function tfLoadChallenge() {
  if(tfMinimumGuestOnly()) return {};
  try { var r = JSON.parse(localStorage.getItem(TF_CHALLENGE_KEY) || '{}') || {}; return r; } catch (e) { return {}; }
}
function tfChallengeState() {
  var ch = tfActiveChallenge(), wk = tfWeekIndex(), saved = tfLoadChallenge();
  if (saved.week !== wk || saved.id !== ch.id) saved = { week: wk, id: ch.id, progress: 0, done: false };
  return { ch: ch, st: saved };
}
function tfSaveChallenge(st) { if(tfMinimumGuestOnly())return;try { localStorage.setItem(TF_CHALLENGE_KEY, JSON.stringify(st)); } catch (e) {} }
// เรียกตอนจบรอบ: บวกความคืบหน้าชาเลนจ์ + ฉลองถ้าครบ
function tfChallengeBump(session) {
  if (!session) return;
  var pack = tfChallengeState(), ch = pack.ch, st = pack.st;
  if (st.done) { tfSaveChallenge(st); return; }
  var add = 0;
  if (ch.type === 'correct') add = session.results.filter(function (r) { return !r.skipped && (r.mistakes || 0) === 0 && !r.forced; }).length;
  else if (ch.type === 'sets') add = 1;
  else if (ch.type === 'perfect') add = session.isPerfect ? 1 : 0;
  else if (ch.type === 'combo') add = (session.maxCombo || 0) >= ch.target ? ch.target : 0;
  if (ch.type === 'combo') st.progress = Math.max(st.progress, add);
  else st.progress += add;
  if (st.progress >= ch.target && !st.done) {
    st.done = true;
    setTimeout(function () { try { tfToast('🎉 完成本週挑戰：' + ch.title + '！'); tfScorePop(300, { big: true, confetti: true }); } catch (e) {} }, 400);
  }
  tfSaveChallenge(st);
}

// Lin 2026-07-04: ตัด tfBuildAllMix (ระบบ 全部 50/50 เก่า) ทิ้งแล้ว — ผูกกับหน้าเลือกหมวดที่ลบไปแล้ว ไม่มีทางเข้าถึงอีก
// toast แจ้งเตือนสั้นๆ
var _tfToastQueue = []; var _tfToastBusy = false; // กันข้อความ toast ทับ/แย่งกันแสดง — Lin 2026-07-12
function tfToast(msg) {
  _tfToastQueue.push(msg);
  _tfProcessToastQueue();
}
function _tfProcessToastQueue() {
  if (_tfToastBusy || !_tfToastQueue.length) return;
  _tfToastBusy = true;
  var msg = _tfToastQueue.shift();
  try {
    var old = document.getElementById('tf-toast'); if (old) old.remove();
    var d = document.createElement('div');
    d.id = 'tf-toast'; d.className = 'tf-toast';
    d.textContent = msg;
    document.body.appendChild(d);
    requestAnimationFrame(function(){ d.classList.add('tf-toast-show'); });
    setTimeout(function(){ d.classList.remove('tf-toast-show'); setTimeout(function(){ if (d.parentNode) d.parentNode.removeChild(d); _tfToastBusy = false; setTimeout(_tfProcessToastQueue, 150); }, 350); }, 2600);
  } catch (e) { _tfToastBusy = false; }
}

function tfLoadStreak() {
  try { return { streak: (window.GAME_ACCOUNT && GAME_ACCOUNT.getStreak()) || 0 }; }
  catch (e) { return { streak: 0 }; }
}
function tfApplyStreakOnSetComplete() {
  return TF_STREAK.applySetComplete();
}

// ── สเตจ 1: ตัวเชื่อมคะแนนกับเกม (แตะ DOM/state) ──
function tfResetWordScoring() {
  if (!session) return;
  session.currentWordMistakes = 0;
  session.currentWordMistakesTotal = 0; // รวมทุกพยางค์เพื่อให้ Result/SRS ตรงกับการตอบจริง
  session.currentWordDeduction = 0;
  session.currentWordDeduct = 0;      // Lin 2026-07-04: ขั้นบันไดคะแนน (กดผิด+แอบดูที่โดนหัก)
  session.stepWrong = false;
  session.stepFreePeekUsed = false;
  session.currentWordScored = false;
  session.currentWordFirstTry = false;
  session.currentWordScore = 0;
  // P12-A-03: the hint state carries into the next question, but once a
  // question has exposed Choice-style guidance it can never score again.
  session.currentWordGuideUsed = !!tfGuideMode;
  // ── คำหลายพยางค์: คิดคะแนนรายพยางค์ ──
  session.curWordAllFirstTry = true;   // จริงตราบที่ทุกพยางค์ยังถูกครั้งแรก
  session.scoredSyls = {};             // กันให้คะแนนซ้ำเมื่อกด "วิเคราะห์ใหม่"
  // ── Lin 2026-07-04: คำหลายพยางค์ = เฉลี่ยคะแนนต่อพยางค์ (กันปั๊มด้วยคำยาว) ──
  //   สะสม "คะแนนฐานต่อพยางค์ (ยังไม่คูณทอง/คอมโบ)" ไว้ก่อน แล้วไปเฉลี่ย + คูณทอง/คอมโบ "ครั้งเดียวตอนจบคำ" ที่ tfCommitWordAndAdvance
    session.curWordSylRawSum = 0;        // ผลรวมคะแนนฐานทุกพยางค์ (ก่อนเฉลี่ย, ก่อนคูณ)
  session.curWordSylScoredCount = 0;   // จำนวนพยางค์ที่คิดคะแนนแล้ว (ตัวหารเฉลี่ย)
  session.learningComponentWrongCounts = []; // หลักฐานดิบสำหรับตัวตรวจคะแนนฝั่ง server; ไม่ใช่คะแนนจาก client
  session.curWordWrongGuess = false;   // เคยเดาผิด/🤷 ในคำ/พยางค์นี้ไหม (กันโกง first-try)
  // ── Lin 2026-07-04: สถานะปุ่ม "?" (= ปุ่มแอบดู ตัวเดียวกัน) ต่อคำ/ประโยคนี้ ──
  session.hintUsed = false;
  session.curWordGuesses = {};   // Phase 4: เก็บ "คำเดาวรรณยุกต์" รายพยางค์ (index → 1-5/0) ส่งให้เซิร์ฟเวอร์ตรวจ
  session.currentWordToneAttempts = [];
}

function tfLockCurrentWordForGuide() {
  if (!session || session.currentWordGuideUsed) return;
  // A multi-syllable item can enter the next active syllable with guidance
  // enabled from the preceding reveal. Lock the whole current item before
  // that guidance is exposed, including any earlier provisional points.
  var awarded = Math.max(0, Number(session.currentWordScore) || 0);
  if (awarded) session.score = Math.max(0, (Number(session.score) || 0) - awarded);
  session.currentWordScore = 0;
  session.curWordSylRawSum = 0;
  session.currentWordFirstTry = false;
  session.curWordAllFirstTry = false;
  session.currentWordGuideUsed = true;
  session.combo = 0;
  try { tfUpdateScoreHud(); } catch (e) {}
}

// คำปัจจุบันเป็นหลายพยางค์ไหม (readingTH มี '-')
function tfCurWordIsMulti() {
  var e = session && session.words && session.words[session.index];
  return !!(e && e.readingTH && e.readingTH.indexOf('-') !== -1);
}
function tfCurWordIsParticle() {
  var entry = session && session.words && session.words[session.index];
  return !!(entry && entry.isParticle);
}

// ── Lin 2026-07-04: คำปัจจุบัน "ห้ามใช้เครื่องมือช่วย + ห้ามให้แต้ม" ไหม ──
// จริงเมื่อ: (ก) รอบตัดสิน Day 7 หรือ (ข) กดปุ่ม "✓ 已記得" แล้วเข้าโหมดพิสูจน์ 1 ครั้ง
// ทั้งสองกรณีใช้ UI/กติกาเดียวกัน (ไม่มีใบ้ ไม่มีแต้ม ผิดปุ๊บ fail) ต่างกันแค่ตอน commit SRS
function tfCurWordNoTools() {
  return !!(session && (session.curWordIsFinalSrsCheck || session.curWordIsKnownCheck));
}

// เด้งคะแนน +N ลอยขึ้น (+ คอนเฟตติเมื่อคอมโบ/perfect)
var _tfScorePopCount = 0; // กันป๊อปคะแนนซ้อนทับกัน (เช่น หลายพยางค์ยิงถี่) — Lin 2026-07-12
function tfScorePop(points, opts) {
  opts = opts || {};
  try {
    var host = document.body; // Lin 2026-07-25: เดิมเขียน getElementById('tf-card') แต่ในหน้าเป็น class ไม่ใช่ id → ตกมาใช้ body ทุกครั้งอยู่แล้ว ตัดโค้ดตายทิ้ง (พฤติกรรมเหมือนเดิมเป๊ะ)
    var idx = _tfScorePopCount++;
    var pop = document.createElement('div');
    pop.className = 'tf-score-pop' + (opts.big ? ' tf-score-pop-big' : '') + (opts.gold ? ' tf-score-pop-gold' : '');
    if (idx > 0) pop.style.top = (32 + idx * 9) + '%';
    var sign = points >= 0 ? '+' : '';
    var multTxt = (opts.mult && opts.mult > 1) ? '<span class="tf-score-pop-mult">×' + opts.mult + '</span>' : '';
    var goldTxt = opts.gold ? '<span class="tf-score-pop-mult"><img src="assets/icons/golden-grain-plain.svg" alt="" style="width:16px;height:16px;vertical-align:-3px;"></span>' : '';
    pop.innerHTML = '<span class="tf-score-pop-num">' + sign + points + '</span>' + multTxt + goldTxt;
    document.body.appendChild(pop);
    setTimeout(function () { if (pop && pop.parentNode) pop.parentNode.removeChild(pop); _tfScorePopCount = Math.max(0, _tfScorePopCount - 1); }, 1300);
  } catch (e) { /* ignore */ }
  // อัปเดต HUD คะแนนรวม
  tfUpdateScoreHud();
  if (opts.confetti) tfConfetti();
}

// คอนเฟตติเบาๆ (ไม่ใช้ไลบรารีนอก)
function tfConfetti() {
  try {
    var colors = ['#6cb8ff', '#7ec87e', '#ffb347', '#c39bff', '#ff7c7c', '#FFD24A'];
    var wrap = document.createElement('div');
    wrap.className = 'tf-confetti-wrap';
    for (var i = 0; i < 28; i++) {
      var p = document.createElement('span');
      p.className = 'tf-confetti';
      p.style.left = Math.random() * 100 + '%';
      p.style.background = colors[i % colors.length];
      p.style.animationDelay = (Math.random() * 0.25) + 's';
      p.style.transform = 'rotate(' + (Math.random() * 360) + 'deg)';
      wrap.appendChild(p);
    }
    document.body.appendChild(wrap);
    setTimeout(function () { if (wrap && wrap.parentNode) wrap.parentNode.removeChild(wrap); }, 1800);
  } catch (e) { /* ignore */ }
}

// อัปเดตตัวเลขคะแนนรวมบน HUD (ถ้ามี)
function tfUpdateScoreHud() {
  var el = document.getElementById('tf-score-hud');
  if (el && session) el.textContent = '🏆 ' + session.score + ' 分';
}

function tfSessionCounterState() {
  var hasActiveSyllables = !!(S && S.syllables && S.syllables.length > 1 && S.selectedSyl != null);
  return hasActiveSyllables
    ? { current: S.selectedSyl + 1, total: S.syllables.length, unit: '音節' }
    : { current: (session ? session.index : 0) + 1, total: session && session.words ? session.words.length : 1, unit: '字' };
}

// ════════════════════════════════════════════════════════════
// 本題分數 bar — แสดงเฉพาะคะแนนของคำปัจจุบัน ไม่แตะ scoring/streak/badge/star logic
// ════════════════════════════════════════════════════════════
function tfBarsHtml() {
  if (!session || !session.words || !session.words.length) return '';
  // แสดงหลอดเฉพาะขั้นคำถามที่ใช้งานอยู่
  var wsHtml = '';
  if (/^s[12]/.test(S.step)) wsHtml = tfWordScoreBarRowHtml();
  return wsHtml ? '<div class="bars-wrap gsh-progress" id="tf-bars-wrap">' + wsHtml + '</div>' : '';
}

// Lin 2026-07-11: หลอด本題分數 แบบ bar-row เดียวกับ進度 (ย้ายมาจาก tfWordScoreGaugeHtml เดิมที่โชว์แยกอยู่ใน body) — คงไอดี tf-ws-fill/tf-ws-num/tf-ws-lab เดิมไว้ ไม่กระทบ tfUpdateWordScoreGauge()
function tfWordScoreBarRowHtml() {
  if (!session) return '';
  var max = TF_WORDSCORE.LADDER[0] || 10;
  var sc = TF_WORDSCORE.score(session);
  var pct = Math.max(0, Math.min(100, (sc / max) * 100));
  var dead = (sc === 0);
  var fill = tfScoreBarColor(sc, max);
  return '<div class="bar-row"><span>本題分數</span><div class="bar-bg"><div class="bar-fill power" id="tf-ws-fill" style="width:' + pct + '%;background:' + fill + ';"></div></div><span class="bar-label" id="tf-ws-lab" style="color:' + (dead ? '#c0392b' : '#5a3e0a') + ';"><span id="tf-ws-num">' + sc + '</span>/10</span></div>';
}

// ตัวคูณคำทอง (สเตจ 2 จะเปิดใช้ — ตอนนี้คืน 1)
function tfGoldenMult() {
  return (session && session.currentWordGolden) ? (TF_GAME_CFG.GOLDEN_WORD_MULT || 2) : 1;
}

// ให้คะแนน "ถูกครั้งแรก" (เรียกตอน stepSessionGuess ตอบถูกเลย)
// พยางค์เดียว: ×คอมโบ + นับสตรีคทันที · หลายพยางค์: คิดรายพยางค์ (ไม่ใช้คอมโบในพยางค์)
// แบนเนอร์คอมโบเด้งใหญ่ + HUD เด้ง — LIN 2026-06-20
function tfComboFlash(combo, mult) {
  try {
    var old = document.getElementById('tf-combo-flash'); if (old) old.remove();
    var msgs = { 3: '火力全開', 5: '停不下來', 8: '聲調高手 👑' };
    var d = document.createElement('div');
    d.id = 'tf-combo-flash'; d.className = 'tf-combo-flash';
    d.innerHTML = '<div class="tf-combo-flash-x">×' + mult + '</div>' +
      '<div class="tf-combo-flash-main">🔥 連對 ' + combo + ' 題</div>' +
      '<div class="tf-combo-flash-sub">' + (msgs[combo] || '太厲害了') + '</div>';
    document.body.appendChild(d);
    setTimeout(function () { if (d && d.parentNode) d.parentNode.removeChild(d); }, 1600);
    var hud = document.getElementById('tf-score-hud');
    var chud = hud && hud.parentNode ? hud.parentNode.querySelector('.tf-combo-hud') : document.querySelector('.tf-combo-hud');
    if (chud) { chud.classList.remove('tf-combo-bump'); void chud.offsetWidth; chud.classList.add('tf-combo-bump'); }
  } catch (e) {}
}

// ── สเปก 2026-07-03 ข้อ 3: "แต้มเกม (soft) ให้เฉพาะรอบแรกที่ผ่าน loop นี้สำเร็จ" — กันฟาร์มคะแนนจากคำที่วนซ้ำ ──
// คำที่ mastered แล้ว (ตัดออกจาก SRS ถาวร) ไม่ควรโผล่ให้เล่นซ้ำอีก แต่เผื่อกรณีคำอยู่ในชุด/ห้องพิเศษอื่นที่ไม่ผ่าน SRS
// (เช่น 全部/ห้องพิเศษ) → กันไว้อีกชั้น: ถ้าคำนี้ mastered แล้วในบัญชีผู้เล่น ไม่ให้แต้มเกมซ้ำอีก
function tfSoftPointsAllowed(entry) {
  if (entry && entry.isParticle) return false;
  if (tfGuideMode || (session && session.currentWordGuideUsed)) return false;
  if (!tfSrsLoggedIn()) return true; // ไม่ล็อกอิน = ไม่มี SRS อยู่แล้ว ให้แต้มปกติตามเดิม
  var rec = tfGetSrsRecord(entry, selectedLevel);
  return !(rec && rec.mastered); // mastered แล้ว → ห้ามแจกแต้มเกมซ้ำอีก (กันฟาร์ม)
}

// ── Lin 2026-07-04: กันคำที่ mastered แล้ว (ตัดออกจาก SRS ถาวร) ไม่ให้โผล่ซ้ำในโหมด 全部/ห้องพิเศษ/สุ่ม 5 คำ ──
// เดิมคะแนน/ดาวเงินกันไว้แล้วที่ tfSoftPointsAllowed (ได้ 0 เพิ่มถูกต้อง) แต่ยังเสียเวลาผู้เล่นเจอคำที่จำได้แล้วซ้ำ
// จุดนี้กรองออกตั้งแต่ตอนสร้างพูลคำเลย (ไม่ใช่แค่กันคะแนนตอนเล่น) — ทำงานเฉพาะล็อกอิน (ไม่งั้นไม่มี SRS record ให้เช็ก)
// กันพูลว่าง: ถ้ากรองแล้วเหลือน้อยกว่า minKeep (เช่น mastered ไปเกือบหมดแล้ว) → คืนของเดิมไม่กรอง ดีกว่าเจอ "หาไม่พบ"
function tfWordLevel(entryOrWord) {
  if (entryOrWord && typeof entryOrWord === 'object' && entryOrWord.level) return entryOrWord.level;
  for (var i = 0; i < WORD_LIST.length; i++) if (WORD_LIST[i].word === entryOrWord) return WORD_LIST[i].level;
  return selectedLevel || 1;
}
function tfExcludeMasteredWords(words, minKeep) {
  if (!words || !words.length || !tfSrsLoggedIn()) return words;
  var filtered = words.filter(function (w) {
    var rec = tfGetSrsRecord(w, tfWordLevel(w));
    return !(rec && rec.mastered);
  });
  return (filtered.length >= (minKeep || 1)) ? filtered : words;
}

function tfScoreFirstTry() {
  if (!session) return;
  // รอบตัดสิน Day 7 ได้คะแนนฐานตามปกติ ส่วน known-check แยกกฎต่างหาก
  //    ส่วน known-check (curWordIsKnownCheck = กด "已記得") ยังคงไม่ได้แต้มเลย ตามกฎ MASTER ข้อ10 (ไม่ได้ดาว/แต้ม/bump เพดาน แม้ผ่านสะอาด) · คำ mastered ที่เอามาทบทวนซ้ำก็ยังไม่ได้แต้ม (กันฟาร์ม)
  var noSoftPoints = !!(session.curWordIsKnownCheck) || !tfSoftPointsAllowed(session.words[session.index]);
  if (noSoftPoints) {
    if (tfCurWordIsMulti()) { if (session.scoredSyls) session.scoredSyls[S.selectedSyl] = true; }
    else { session.currentWordScored = true; }
    session.currentWordFirstTry = true;
    return;
  }
  var gold = tfGoldenMult();
  if (tfCurWordIsMulti()) {
    var k = S.selectedSyl;
    if (session.scoredSyls && session.scoredSyls[k]) return;   // วิเคราะห์พยางค์เดิมซ้ำ → ไม่ให้ซ้ำ
    session.scoredSyls[k] = true;
    // ── Lin 2026-07-04: สะสมคะแนน "ฐาน" ต่อพยางค์ (ยังไม่คูณทอง/คอมโบ) — ไปเฉลี่ย+คูณครั้งเดียวตอนจบคำ ──
    var sylBase = TF_SCORE.cfg.SCORE_FIRST_TRY;
    session.learningComponentWrongCounts[k] = 0;
    session.curWordSylRawSum = (session.curWordSylRawSum || 0) + sylBase;
    session.curWordSylScoredCount = (session.curWordSylScoredCount || 0) + 1;
    // เด้งฟีดแบ็กรายพยางค์ (คะแนนฐาน) แต่ "ยังไม่บวกเข้า session.score" — คะแนนจริงบวกทีเดียวตอนจบคำ
    setTimeout(function () { tfScorePop(sylBase, { gold: gold > 1 }); }, 60);
    return;
  }
  if (session.currentWordScored) return;
  session.combo = (session.combo || 0) + 1;
  if (session.combo > (session.maxCombo || 0)) session.maxCombo = session.combo;
  var mult = TF_SCORE.comboMultiplier(session.combo);
  var pts = Math.round(TF_SCORE.firstTryScore(session.combo) * gold);
  session.score += pts;
  session.currentWordScore = pts;
  session.currentWordFirstTry = true;
  session.currentWordScored = true;
  var comboHit = (session.combo === 3 || session.combo === 5 || session.combo === 8);
  setTimeout(function () {
    tfScorePop(pts, { mult: mult, confetti: comboHit, big: comboHit, gold: gold > 1 });
    if (comboHit) tfComboFlash(session.combo, mult);
  }, 60);
  // น้องมีนาพูด: คำทอง > คอมโบ > ตอบถูก (คำทอง/คอมโบโชว์เสมอ, ตอบถูกสุ่มโชว์) — Lin 2026-07-10
  setTimeout(function () {
    if (gold > 1) tfMinaToast('golden');
    else if (comboHit) tfMinaToast('combo');
    else tfMinaToast('correct', { throttle: true });
  }, 520);
}

// เผยคำตอบจาก canonical catalog โดยตรงและให้คะแนนศูนย์ ไม่มีขั้นอนุมานภาษา
function tfForceRevealZero() {
  var entry = session.words[session.index];
  if (tfCurWordIsMulti()) {
    var k = S.selectedSyl;
    var syl = (S.syllables && S.syllables[k]) || entry.word;
    if (session.scoredSyls) session.scoredSyls[k] = true;   // พยางค์นี้ 0 แต้ม
    // ── Lin 2026-07-04: พยางค์ fail = 0 คะแนน แต่ยังนับเป็น 1 พยางค์ในตัวหารเฉลี่ย (บวก 0 เข้า rawSum) ──
    session.curWordSylRawSum = (session.curWordSylRawSum || 0) + 0;
    session.curWordSylScoredCount = (session.curWordSylScoredCount || 0) + 1;
    session.learningComponentWrongCounts[k] = 4;
    session.curWordAllFirstTry = false;
    session.combo = 0;
    var sct = catalogToneNumber();
    tfShowRevealOverlay({ word: syl, zh: entry.zh, readingTH: syl }, sct, { sylIdx: k, sylTone: sct });
    return;
  }
  session.currentWordScore = TF_SCORE_CFG.SCORE_FAIL_ZERO; // ผิดครบ 3 ครั้ง (fail) = 0 pt
  session.currentWordFirstTry = false;
  session.currentWordScored = true;
  if (!entry.isParticle) session.combo = 0;
  var ct = catalogToneNumber();
  tfShowRevealOverlay(entry, ct, {});
}

// overlay เฉลยเมื่อกดมั่วครบ 3 ครั้ง (ข้อความน้องมีนา)
function tfShowRevealOverlay(entry, correctTone, opts) {
  opts = opts || {};
  var old = document.getElementById('tf-reveal-ov');
  if (old) old.remove();
  var tl = (typeof TONES !== 'undefined' && TONES[correctTone]) ? TONES[correctTone] : {};
  var toneTxt = tl.zh || ('第 ' + correctTone + ' 聲');
  var toneColor = tl.color || '#8B6310';
  var isSyl = (opts.sylIdx != null);
  var div = document.createElement('div');
  div.id = 'tf-reveal-ov';
  div.className = 'tf-error-overlay';
  div.innerHTML =
    '<div class="tf-error-box tf-reveal-box">' +
      '<div class="tf-reveal-title">💪 這個' + (isSyl ? '音節' : '字') + '有點挑戰，我們再加油！</div>' +
      '<div class="tf-reveal-sub">米娜陪你看答案～先記起來，下次我們一起變厲害！</div>' +
      '<div class="tf-reveal-word">' + entry.word + '</div>' +
      '<div class="tf-reveal-zh">' + (entry.zh || '') + '　<span class="th">' + (entry.readingTH || '') + '</span></div>' +
      '<div class="tf-reveal-answer" style="color:' + toneColor + ';border-color:' + toneColor + '55;background:' + toneColor + '14;">正確聲調：' + toneTxt + '</div>' +
      // 2026-07-30: ป๊อปอัพเฉลย (ตอบผิดครบ) ต้องแตกตัวอักษรครบตามรูปแบบกลางด้วย — คำสั่ง Lin
      // 2026-07-30 (รอบ 3): ครอบด้วยกล่องเดียวกับหน้าเฉลยหลัก (.result-v2-bd/.tf-ans-inner) แทนที่จะลอยไม่มีกรอบ ให้เหมือนเกมอ่าน/เกมพิมพ์
      (function(){ var h = tfAnswerRowsHtml(currentAnswerSyl()); return h ? '<div class="result-v2-bd" style="margin:10px auto 0;max-width:280px;"><div class="tf-ans-inner"><div class="tf-ans-rows">' + h + '</div></div></div>' : ''; })() +
      '<button class="tf-error-close" id="tf-reveal-next">' + ((isSyl && S.syllables && opts.sylIdx + 1 < S.syllables.length) ? '學會了，下一個音節 →' : '學會了，我們去下一個 →') + '</button>' +
    '</div>';
  document.body.appendChild(div);
  var btn = document.getElementById('tf-reveal-next');
  if (btn) btn.addEventListener('click', function () {
    div.remove();
    if (isSyl) tfAfterForcedRevealSyl(opts.sylIdx, opts.sylTone);
    else tfCommitWordAndAdvance({ forced: true });
  });
}

// Lin 2026-07-14: เฉลยพยางค์ (ผิดครบ 3 ครั้ง) แล้วไปพยางค์ถัดไปของคำเดิมโดยตรง (ไม่มีหน้าเลือกพยางค์เองแล้ว)
// พยางค์สุดท้าย → commit คำนี้เป็น forced ไปคำใหม่เลย (พฤติกรรมเดิม เหมือนคำพยางค์เดียวตอนเฉลย)
function tfAfterForcedRevealSyl(idx, tone) {
  var results = S.sylResults || {};
  results[idx] = { tone: tone };
  var syls = S.syllables;
  var parentWord = currentCatalogWord();
  if (idx + 1 < syls.length) {
    if (session) { session.currentWordMistakes = 0; session.currentWordDeduction = 0; session.currentWordDeduct = 0; session.stepWrong = false; session.stepFreePeekUsed = false; session.curWordWrongGuess = false; session.hintUsed = false; }
    if (!session) throw new Error('CATALOG_AUTHORITY_UNAVAILABLE:no active session');
    var sylStep = 'session-guess';
    var ns = { word: syls[idx + 1], step: sylStep, path: [syls[idx + 1]], tone: null, syllables: syls, selectedSyl: idx + 1, sylResults: results, parentWord: parentWord };
    hist = hist.slice(0, histPos + 1);
    hist.push(ns); histPos++;
    S = ns;
    if (tfGuideMode) tfLockCurrentWordForGuide();
    render();
  } else {
    tfCommitWordAndAdvance({ forced: true });
  }
}

// บันทึกผลคำปัจจุบันลง results แล้วไปคำถัดไป/สรุป
function tfCommitWordAndAdvance(opts) {
  opts = opts || {};
  var entry = session.words[session.index];
  var tone = catalogToneNumber();
  var mistakes = session.currentWordMistakesTotal != null
    ? session.currentWordMistakesTotal
    : (session.currentWordMistakes || 0);
  var isMulti = tfCurWordIsMulti();
  // หลายพยางค์: นับ firstTry เฉพาะเมื่อทำครบทุกพยางค์ + ทุกพยางค์ถูกครั้งแรก (กันกด "ต่อ" ข้ามพยางค์แล้วได้ perfect ฟรี)
  var sylCount = (S && S.syllables && S.syllables.length) || (entry.readingTH ? entry.readingTH.split('-').length : 1);
  var scoredCount = session.scoredSyls ? Object.keys(session.scoredSyls).length : 0;
  var allScored = scoredCount >= sylCount;
  var firstTry = (isMulti ? (!!session.curWordAllFirstTry && allScored) : !!session.currentWordFirstTry) && !session.currentWordGuideUsed;
  // คอมโบสำหรับคำหลายพยางค์: คิดตอนจบคำ (พยางค์เดียวคิดไปแล้วใน tfScoreFirstTry)
  if (isMulti && !opts.forced) {
    if (firstTry) {
      session.combo = (session.combo || 0) + 1;
      if (session.combo > (session.maxCombo || 0)) session.maxCombo = session.combo;
      if (session.combo === 3 || session.combo === 5 || session.combo === 8) {
        tfComboFlash(session.combo, TF_SCORE.comboMultiplier(session.combo));
      }
    }
    else session.combo = 0;
  }
  // ── Lin 2026-07-04: คำหลายพยางค์ = เฉลี่ยคะแนนต่อพยางค์ แล้วคูณ "ทอง + คอมโบ" ครั้งเดียวที่ระดับคำ ──
  //   (คำสั้น/ยาวได้สเกลเดียวกัน · คำ 2 พยางค์ถูกหมด = 10 ไม่ใช่ 20 · กันปั๊มด้วยคำยาว)
  //   หมายเหตุ: พยางค์เดียวคิด+คูณครบไปแล้วใน tfScoreFirstTry/tfScoreDeduce ไม่ต้องแตะซ้ำ
  if (isMulti) {
    var divisor = session.curWordSylScoredCount || sylCount || 1;
    var avgBase = (session.curWordSylRawSum || 0) / divisor;      // เฉลี่ยต่อพยางค์
    var goldM = session.currentWordGolden ? (TF_GAME_CFG.GOLDEN_WORD_MULT || 2) : 1;
    var comboM = (!opts.forced && firstTry) ? TF_SCORE.comboMultiplier(session.combo) : 1; // คอมโบใช้เฉพาะตอนถูกครั้งแรกทั้งคำ
    var wordScore = session.currentWordGuideUsed ? 0 : Math.round(avgBase * goldM * comboM);
    session.currentWordScore = wordScore;
    session.score += wordScore;                                   // บวกเข้าคะแนนรวมครั้งเดียว (รายพยางค์ไม่บวกแล้ว)
    tfUpdateScoreHud();
  }
    session.results.push({
    entry: entry,
    tone: tone,
    mistakes: mistakes,
    initialGuess: session.initialGuess,
    finalAnswer: session.finalAnswer,
    attempts: (session.currentWordToneAttempts || []).slice(),
    hintUsed: !!session.hintUsed || !!session.currentWordGuideUsed,
    // ── ฟิลด์คะแนน ── (clamp ล่าง = SCORE_FAIL_ZERO = 0 เท่านั้น กันติดลบ · ไม่ยัด floor 1 ให้คำที่ fail 0)
    score: Math.max(TF_SCORE_CFG.SCORE_FAIL_ZERO, session.currentWordScore || 0),
    firstTry: firstTry,
    golden: !!session.currentWordGolden,
    forced: !!opts.forced,
    learningEvidence: { componentWrongCounts: (session.learningComponentWrongCounts && session.learningComponentWrongCounts.length) ? session.learningComponentWrongCounts.slice() : [Math.min(session.currentWordDeduct || mistakes || 0, 4)] },
    needReview: !!opts.forced || mistakes > 0 || !firstTry
  });
  if (roundReport && window.RoundReport) {
    var _tfResult = session.results[session.results.length - 1];
    var _tfSentence = selectedLevel === 3 && advSentenceCtx && advSentenceCtx.th;
    var _tfRec = tfSrsLoggedIn() ? tfGetSrsRecord(entry, selectedLevel) : null;
    RoundReport.addItem(roundReport, {
      content_ref: _tfSentence ? { source: 'game_sentences', key: _tfSentence } : { source: 'game_words', key: tfWordContentKey(entry) },
      question: entry.word, meaning: entry.zh || '', attempts: _tfResult.attempts,
      user_answer: _tfResult.attempts.length ? _tfResult.attempts[_tfResult.attempts.length - 1].answer : '',
      correct_answer: TONES[tone] ? TONES[tone].zh : String(tone || ''),
      is_correct: mistakes === 0 && firstTry && !opts.forced,
      wrong_count: mistakes, item_score: _tfResult.score, hint_used: _tfResult.hintUsed,
      learning_evidence: _tfResult.learningEvidence,
      linguistic: { reading_th: entry.readingTH || '', syls: entry.syls || null, correct_tone: tone },
      words: (_tfSentence && advSentenceCtx.words) ? advSentenceCtx.words.map(function(w){return {th:w.th||'',zh:w.zh||''};}) : [],
      srs_state: _tfRec && (_tfRec.dueDate || _tfRec.stage) || null,
      mastered_state: !!(_tfRec && _tfRec.mastered)
    });
  }
  // ── สเปก 2026-07-03 ข้อ 3+4: อัปเดต SRS ต่อคำ/ประโยค + แจกดาวเงินตอน mastered ──
  // ทำงานเฉพาะตอนล็อกอิน (ข้อ 0) · หน่วย SRS = ทั้งคำ/ประโยค ไม่ใช่รายพยางค์ → ใช้ entry.word ทั้งก้อน
  try { if (!entry.isParticle && tfSrsLoggedIn()) tfProcessSrsOnWordCommit(entry, mistakes, firstTry, !!opts.forced); } catch (e) {}
  session.index++;
  tfResetWordScoring();
  session.initialGuess = undefined;
  session.finalAnswer = undefined;
  session.currentWordGolden = false;
  tfSaveResumeState(); // E3: อัปเดต resume ทุกครั้งที่ทำคำ/พยางค์เสร็จ 1 คำ (จะถูกล้างอีกทีถ้า session จบตอน tfGoToSummary ด้านล่าง)
  if (session.index >= session.words.length) {
    tfGoToSummary();
  } else {
    tfSetupNextWord();
  }
}

// ── Lin 2026-07-04: จำนวน "คำ/หน่วยทั้งหมด" ในระดับ (ใช้คิดเพดานดาวเงิน = 10% ของจำนวนคำในระดับ) ──
//   level 1/2 = นับจาก WORD_LIST ตาม level · level 3 = จำนวนประโยคใน ADV_SENTENCES (หน่วย SRS ของ高級คือทั้งประโยค)
//   หาไม่ได้/ไม่รู้จริง → คืน 0 เพื่อให้ game-account.js fallback ไปใช้ HARD_CAPS เดิม (ห้ามให้เพดานกลายเป็น 0)
function tfLevelWordCount(level) {
  try {
    if (level === 3) {
      return (typeof ADV_SENTENCES !== 'undefined' && ADV_SENTENCES.length) ? ADV_SENTENCES.length : 0;
    }
    if (typeof WORD_LIST !== 'undefined' && WORD_LIST.length) {
      return WORD_LIST.filter(function (w) { return w.level === level; }).length;
    }
  } catch (e) {}
  return 0; // ไม่รู้จำนวนจริง → ให้ addHardStars fallback เป็น cap เดิม
}

// ── สเปก 2026-07-03 ข้อ 3+4+5: อัปเดต SRS ของคำ/ประโยคนี้ตอนจบ (เรียกจาก tfCommitWordAndAdvance) ──
// "สะอาด" ต้องถูกครั้งแรกทั้งหน่วย (ทุกพยางค์/ทุกคำในประโยค) + ไม่แอบดู + ไม่นับ forced (เฉลยเพราะผิดครบ 3)
// clean round → New → Day 1 → Day 7 → Mastered ตาม Phase 1
// ไม่ clean (ผิด/แอบดู/forced) → รีเซ็ตกลับ day 1 เข้าคิวใหม่ (กันโกงข้อ 5: ห้ามเร่งขั้นเร็วกว่ากำหนด)
function tfProcessSrsOnWordCommit(entry, mistakes, firstTry, forced) {
  if (!entry || !entry.word) return;
  if (!tfSrsLoggedIn()) return; // Guest Free ไม่มี SRS และห้ามนำรอบก่อน Login ไปนับย้อนหลัง
  if (tfReviewOwns(entry)) return; // Review owns every pre-SRS transition; tone-round keeps existing SRS only.
  if (tfGuideMode || (session && session.currentWordGuideUsed)) return;
  var wasFinalCheck = !!(session && session.curWordIsFinalSrsCheck);
  var wasKnownCheck = !!(session && session.curWordIsKnownCheck);
  // คำตอบที่ไม่สะอาดไม่เลื่อน SRS
  var cleanThisRound = !!firstTry && !forced && (mistakes || 0) === 0;

  // ── Phase 4 (กันโกงดาว): ให้ "เซิร์ฟเวอร์" เป็นคนตัดสิน+แจกดาวจริง (ล็อกอินเท่านั้น) ──
  //   เพิ่มเข้ามาคู่ขนาน ไม่รื้อ logic local ด้านล่าง (เน็ตล่ม/ไม่ล็อกอิน → เกมทำงานเหมือนเดิมทุกอย่าง)
  //   ดาวที่ "แลกเงินได้" = ที่เซิร์ฟเวอร์เขียนเท่านั้น · ดาว local = ตัวโชว์เฉยๆ (หลังล็อก RLS จะ sync ขึ้นไม่ได้)
  try {
    if (window.TONE_SERVER && TONE_SERVER.available()) {
      var _sv = { word: entry.word, contentKey: entry.contentKey, level: selectedLevel || 1, knownCheck: wasKnownCheck };
      var _syls = (entry.readingTH && entry.readingTH.indexOf('-') > -1) ? entry.readingTH.split('-') : null;
      if (_syls && _syls.length > 1) {
        _sv.syllables = _syls;
        _sv.guesses = _syls.map(function (_s, _i) { return (session.curWordGuesses && session.curWordGuesses[_i] != null) ? session.curWordGuesses[_i] : -1; });
      } else {
        _sv.initialGuess = (session.curWordGuesses && session.curWordGuesses[0] != null) ? session.curWordGuesses[0] : session.initialGuess;
      }
      TONE_SERVER.finishRound(_sv).then(function (r) {
        try {
          if (r && r.ok) {
            // เซิร์ฟเวอร์ยืนยัน → ตัวเลขดาว "จริง" = r.totalStars (ซิงก์ลงมาโชว์ตอน sync ถัดไป)
            if (r.justMastered && r.stars > 0 && window.console) console.log('[P4] ⭐ server award', r.stars, '→ total', r.totalStars);
          } else if (r && window.console) { console.log('[P4] server not-ok:', r.reason); }
        } catch (e) {}
      });
    }
  } catch (e) {}

  var rec = tfGetSrsRecord(entry, selectedLevel);
  if (!rec) rec = TF_SRS.blank();

  // known-check (กดปุ่ม "✓ 已記得") = พิสูจน์ 1 ครั้งแบบรอบตัดสิน (กฎเดิม ไม่ใช่ SRS checkpoint ปกติ)
  //   ตอบถูกสะอาดครั้งเดียว → ตัดคำออกถาวร (mastered) แต่ "ห้ามแจกดาวเงิน/แต้ม/bump เพดาน" (ต่างจาก mastered จริงที่ผ่านครบ 3 รอบ)
  //   ตอบผิด/แอบดู/forced → resetOnFail กลับ day1 เข้าคิว SRS ปกติ (ไม่ตัดคำ)
  if (wasKnownCheck) {
    if (cleanThisRound) {
      rec.mastered = true;   // ตัดออกจาก SRS ถาวร — ไม่เรียก advanceOnClean/addHardStars จึงไม่ได้ดาว ไม่ bump เพดาน
    } else {
      rec = TF_SRS.resetOnFail(rec);
    }
    tfSetSrsRecord(entry, selectedLevel, rec);
    if (session) { session.curWordIsKnownCheck = false; session.curWordIsFinalSrsCheck = false; }
    return;
  }

  if (cleanThisRound) {
    var passedStage = rec.stage;   // Lin 2026-07-04: stage ก่อนเลื่อน (0/1/2) = รอบทบทวนที่เพิ่งผ่าน
    var res = TF_SRS.advanceOnClean(rec, Date.now());
    rec = res.rec;
    // โบนัสรอบสะอาด 3 ขั้นของ Phase 1 (New / Day 1 / รอบตัดสิน Day 7)
    try {
      var rb = (TF_SCORE.cfg.SRS_REVIEW_BONUS || [])[passedStage] || 0;
      if (rb > 0 && session) {
        session.score += rb;
        session.srsReviewBonus = (session.srsReviewBonus || 0) + rb;
        if (typeof tfUpdateScoreHud === 'function') tfUpdateScoreHud();
        setTimeout(function () { tfScorePop(rb, {}); }, 140);
      }
    } catch (e) {}
    if (res.justMastered) {
      // ── ข้อ 4: แจกดาวเงินตอน mastered จริง (ฐาน×ตัวคูณระดับ, ชนเพดานแล้ว = 0 แต้ม แต่ยัง mastered ปกติ) ──
      try {
        if (window.GAME_ACCOUNT && window.GAME_ACCOUNT.addHardStars) {
          // Lin 2026-07-04: เพดานดาวเงินอิง LEVEL_TOTAL_WORDS (เลขรวมทุกเกม) ใน game-account.js แล้ว
          //   → ไม่ต้องส่ง per-game count มาอีก (arg ที่ 3 ถูกเมิน) ทั้งเกมเสียง+เกมอ่านใช้ฐานรวมชุดเดียวกัน
          var hr = window.GAME_ACCOUNT.addHardStars(res.clean, selectedLevel || 1);
          session.hardStarsEarned = (session.hardStarsEarned || 0) + (hr.stars || 0);
        }
      } catch (e) {}
    }
  } else {
    // ผิด/แอบดู/forced (รวมถึงรอบตัดสิน Day 7) → กลับจุดเริ่ม SRS เข้าคิวใหม่
    rec = TF_SRS.resetOnFail(rec);
  }
  tfSetSrsRecord(entry, selectedLevel, rec);
  // เคลียร์ flag เช็ก final ของ "รอบนี้" ไว้ตรงนี้ (รอบถัดไปจะเช็กใหม่ตอน setup คำถัดไป)
  if (session) { session.curWordIsFinalSrsCheck = false; }
}

// เช็กว่าคำที่กำลังจะเล่นเป็นรอบตัดสิน Day 7 ก่อน Mastered หรือไม่
// ผลตอนเช็ก: ปิดปุ่มแอบดู + ไม่ให้แต้มเกม (soft) ไม่ว่าถูกหรือผิด — ดูจุดใช้งานที่ tfScoreFirstTry/tfScoreDeduce/stepSessionGuess
function tfSetupSrsFlagsForCurrentWord() {
  session.curWordIsFinalSrsCheck = false;
  session.curWordIsKnownCheck = false;   // known-check เป็นของ "เฉพาะคำที่กดปุ่ม" เท่านั้น — คำถัดไปต้องเริ่มใหม่เสมอ
  if (!session || !tfSrsLoggedIn()) return;
  var entry = session.words[session.index];
  if (!entry) return;
  if (entry.isParticle) return;
  var rec = tfGetSrsRecord(entry, selectedLevel);
  session.curWordIsFinalSrsCheck = !!(rec && TF_SRS.isFinalCheck(rec));
}

// ตั้งค่าคำถัดไป (+ สุ่มคำทอง สเตจ 2)
function tfSetupNextWord() {
  var nx = session.words[session.index];
  randomEntry = nx;
  var w = nx.word;
  session.currentWordGolden = tfRollGolden();
  tfSetupSrsFlagsForCurrentWord();   // เช็กรอบตัดสิน Day 7 ก่อนตั้งคำถัดไป
  session.currentWordGuideIntroPending = !!tfGuideMode && !tfCurWordNoTools();
  // Lin 2026-07-14: คำหลายพยางค์ ไม่มีหน้าเลือกพยางค์เองแล้ว → เริ่มพยางค์ที่ 1 ตรงเลย ไล่ตามลำดับอัตโนมัติ
  if (nx.readingTH && nx.readingTH.indexOf('-') !== -1) {
    var _syls0 = nx.readingTH.split('-');
    S = { word: _syls0[0], step: 'session-guess', path: [_syls0[0]], tone: null, syllables: _syls0, selectedSyl: 0, sylResults: {}, parentWord: w };
  } else {
    S = { word: w, step: 'session-guess', path: [w], tone: null };
  }
  hist.push(S); histPos++;
  render();
  if (!session.currentWordGuideIntroPending) {
    try { window.dispatchEvent(new CustomEvent('gsh:question-start')); } catch (e) {}
  }
}

// เข้าหน้าสรุป + คิดโบนัสจบชุด/perfect (ครั้งเดียว)
function tfGoToSummary() {
  tfClearResumeState(); // E3: จบรอบปกติแล้ว ไม่ต้องเสนอ resume อีก (F5/F1 ก็เรียก session ใหม่ต่อซึ่งจะ save ทับเองอยู่แล้ว)
  tfApplySessionBonus();
  S = { word: '', step: 'session-summary', path: [], tone: null };
  hist.push({ step: 'session-summary' }); histPos++;
  if (typeof maybeShowCoursePromo === 'function') maybeShowCoursePromo();
  render();
}

// คิดโบนัสจบชุด + perfect + อัปเดต Daily Streak (กันคิดซ้ำด้วย sessionScored)
function tfApplySessionBonus() {
  if (!session || session.sessionScored) return;
  var scoredResults = session.results.filter(function (r) { return !(r.entry && r.entry.isParticle); });
  var total = scoredResults.length;
  // ── สถิติคำผิดรายคำ (ทุกโหมด) ──
  if (total > 0) tfRecordWordWrong(scoredResults);
  var perfectCount = scoredResults.filter(function (r) { return r.firstTry; }).length;
  var bonus = TF_SCORE.sessionBonus(total, perfectCount);
  var isPerfect = (total > 0 && perfectCount === total && !session.hadSkip);
  // Lin 2026-07-25: โหมด 提示 = ไม่ได้อะไรเลย → ข้ามโบนัสจบชุด/สตรีค/ดาว/แบดจ์/ชาเลนจ์ทั้งหมด (สถิติคำผิดยังเก็บปกติ ไม่ใช่รางวัล)
  if (tfGuideMode) {
    session.bonusAwarded = 0; session.isPerfect = isPerfect;
    session.starsEarned = 0;
    try { session.totalStars = (window.GAME_ACCOUNT) ? GAME_ACCOUNT.getStars() : 0; } catch (e) { session.totalStars = 0; }
    session.newBadges = []; session.streakResult = null;
    session.sessionScored = true;
    try { tfRenderExtBar(); } catch (e) {}
    return;
  }
  if (bonus > 0) {
    session.score += bonus;
    session.bonusAwarded = bonus;
    session.isPerfect = isPerfect;
    setTimeout(function () {
      tfScorePop(bonus, { big: true, confetti: true });
    }, 200);
  }
  // สเตจ 2: อัปเดต Daily Streak + เป้ารายวัน (เฉพาะรอบที่เล่นจบจริง มีคำ)
  if (total > 0) {
    try { session.streakResult = tfApplyStreakOnSetComplete(); } catch (e) { session.streakResult = null; }
    // ── สเปก 2026-07-03: ดาวเงินไม่ได้แจกตอนจบรอบตามความแม่นแล้ว (starsForRound ถูก deprecate → คืน 0 เสมอ) ──
    // ดาวเงินจริงถูกแจกไปแล้วระหว่างเล่น ตอนคำ/ประโยคแต่ละอันถูก mastered (ดู tfProcessSrsOnWordCommit)
    // ตรงนี้ยังคงเรียก bumpStreakToday() ไว้ (นับวันเล่นต่อเนื่อง ไม่เกี่ยวกับดาว)
    try {
      var _se = (window.GAME_ACCOUNT) ? GAME_ACCOUNT.starsForRound(perfectCount, total) : 0; // = 0 เสมอ (deprecated)
      if (window.GAME_ACCOUNT) { GAME_ACCOUNT.addStars(_se); GAME_ACCOUNT.bumpStreakToday(); } // addStars(0) = no-op
      session.starsEarned = session.hardStarsEarned || 0;   // ดาวเงินจริงที่ได้ "รอบนี้" มาจาก SRS mastery เท่านั้น
      session.totalStars = (window.GAME_ACCOUNT) ? GAME_ACCOUNT.getStars() : 0;
    } catch (e) { session.starsEarned = 0; session.totalStars = 0; }
    // สเตจ 3: อัปเดต stats + เช็กปลดแบดจ์ (รวมแบดจ์พันธุ์ข้าวจากดาวรวม)
    try {
      var streakNow = (session.streakResult && session.streakResult.state && session.streakResult.state.streak) || 0;
      session.newBadges = tfUpdateBadgesOnSetComplete({
        words: total, isPerfect: isPerfect, maxCombo: session.maxCombo || 0, streak: streakNow
      });
    } catch (e) { session.newBadges = []; }
  }
  session.isPerfect = isPerfect;
  // ชาเลนจ์รายสัปดาห์: บวกความคืบหน้า — LIN 2026-06-20
  try { tfChallengeBump(session); } catch (e) {}
  session.sessionScored = true;
  // อัปเดตแถบนอก tf-card (challenge + streak + ⭐/🌱)
  try { tfRenderExtBar(); } catch (e) {}
  // ซิงก์ความก้าวหน้าขึ้น Supabase (ถ้าล็อกอิน) — LIN 2026-06-20
  try { if (window.TF_SYNC) window.TF_SYNC.push(); } catch (e) {}
  // Lin 2026-07-16: เดิมเรียกผ่าน window.TF_AUTH.syncAccount() (supabase-auth.js) — รวมระบบล็อกอินแล้ว เรียก GAME_ACCOUNT.sync ตรงๆ แทน
  try {
    if (window.READING_AUTH && READING_AUTH.user && window.GAME_ACCOUNT && GAME_ACCOUNT.sync) {
      var _sbSync = window.getSupabaseClient ? window.getSupabaseClient() : null;
      if (_sbSync) GAME_ACCOUNT.sync(_sbSync, READING_AUTH.user.id);
    }
  } catch (e) {}
}

function act(fn) {
  var id = 'a'+(++_actId);
  _acts[id] = fn;
  return "TF._run('"+id+"')";
}

function restoreState(pos) {
  histPos = pos;
  var snap = hist[pos];
  if (snap.syllables && snap.syllables.length > 1 && (!snap.parentWord || snap.parentWord !== currentCatalogWord())) {
    throw new Error('CATALOG_AUTHORITY_INCOMPLETE:history parent word');
  }
  S = { word:S.word, step:snap.step, path:snap.path.slice(), tone:snap.tone, syllables:snap.syllables, selectedSyl:snap.selectedSyl, sylResults:snap.sylResults, parentWord: snap.parentWord };
  render();
}

// ════════════════════════════════════════════════════════════
// DAILY WRONG-ANSWER STATS (localStorage)
// ════════════════════════════════════════════════════════════
var STATS_KEY = 'tf_wrong_stats_v1';
var STATS_KEEP_DAYS = 30;

var STEP_LABELS = { 'session-guess': '聲調選擇' };

function pad2(n) { return (n < 10 ? '0' : '') + n; }

// Lin 2026-07-04: วันที่แบบไต้หวัน (Asia/Taipei, UTC+8) เสมอ — ใช้ตัด "วันนี้/ขึ้นวันใหม่" ของ streak + SRS ให้ตรงกันทั้งไฟล์
//   ไม่อิงนาฬิกาเครื่องผู้เล่น (คนเล่นอยู่คนละ timezone จะไม่ทำให้วันเพี้ยน)
function todayStr() {
  var d = new Date();
  try { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(d); } // 'YYYY-MM-DD' เวลาไต้หวัน
  catch (e) { return d.getFullYear() + '-' + pad2(d.getMonth()+1) + '-' + pad2(d.getDate()); } // fallback เครื่อง
}

function timeStr() {
  var d = new Date();
  return pad2(d.getHours()) + ':' + pad2(d.getMinutes());
}

function loadStats() {
  if(!tfSrsLoggedIn())return {};
  try {
    var raw = localStorage.getItem(STATS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) { return {}; }
}

function saveStats(data) {
  if(!tfSrsLoggedIn())return;
  try {
    // Keep only the most recent STATS_KEEP_DAYS days
    var days = Object.keys(data).sort();
    while (days.length > STATS_KEEP_DAYS) {
      delete data[days.shift()];
    }
    localStorage.setItem(STATS_KEY, JSON.stringify(data));
  } catch (e) { /* localStorage unavailable, ignore */ }
}

function recordMistake(choiceLabel, errMsg) {
  var data = loadStats();
  var day = todayStr();
  if (!data[day]) data[day] = [];
  data[day].push({
    time: timeStr(),
    word: S.word,
    step: S.step,
    choice: choiceLabel,
    message: errMsg
  });
  saveStats(data);
  // Session mistake tracking
  if (session) {
    session.currentWordMistakes = (session.currentWordMistakes || 0) + 1;
    session.currentWordMistakesTotal = (session.currentWordMistakesTotal || 0) + 1;
  }
}

// ════════════════════════════════════════════════════════════
// RENDER
// ════════════════════════════════════════════════════════════
function render() {
  _acts = {}; _actId = 0;

  tfRenderTopBanners();
  tfSyncLevelTabs();

  // Word banner
  var banner = document.getElementById('tf-banner');
  var isSelectScreen = (S.step === 'level-select' || S.step === 'adv-cat-select' || S.step === 'adv-sent-select' || S.step === 'adv-summary' || S.step === 'session-summary' || S.step === 'alpha-home' || S.step === 'alpha-consonant' || S.step === 'alpha-vowel' || S.step === 'alpha-flashcard');
  var noBannerSteps = ['result'];
  if (S.word && !isSelectScreen && noBannerSteps.indexOf(S.step) === -1) {
    banner.style.display = 'block';
    // Phase C.1 (2026-08-10): counterHtml (active syllable for multi-syllable items; otherwise session word)
    // ไปฉีดใส่ #tf-session-counter (อยู่แถวเดียวกับปุ่มระดับ初/中/高 — ดู tone-finder.html) แทน
    // barsHtml เก็บเฉพาะหลอด本題分數เดิมไว้ใน banner — ไม่แตะ scoring/session logic
    var counterState = tfSessionCounterState();
    var counterHtml = (session && session.words && session.words.length)
      ? '<div class="tf-banner-counter">第 ' + counterState.current + ' / ' + counterState.total + ' ' + counterState.unit
        + '<span id="tf-score-hud" class="tf-score-hud">🏆 ' + (session.score || 0) + ' 分</span>'
        + (session.combo >= 3 ? '<span class="tf-combo-hud">🔥 ×' + TF_SCORE.comboMultiplier(session.combo) + '</span>' : '')
        + (session.currentWordGolden ? '<span class="tf-golden-hud"><img src="assets/icons/golden-grain-plain.svg" alt="" style="width:14px;height:14px;vertical-align:-2px;margin-right:2px;">黃金米題 ×' + TF_GAME_CFG.GOLDEN_WORD_MULT + '</span>' : '')
        + '</div>'
      : '';
    var barsHtml = (session && session.words && session.words.length) ? tfBarsHtml() : '';
    var _tfCounterEl = document.getElementById('tf-session-counter');
    if (_tfCounterEl) _tfCounterEl.innerHTML = counterHtml;
    var goldWord = (session && session.currentWordGolden) ? ' tf-banner-word-gold' : '';
    // Lin 2026-07-14: คำแปลจีนใต้คำศัพท์ เหมือนเกมอ่าน/เกมพิมพ์ — ใช้ class "word-zh" เดียวกัน ต่อเข้าปุ่ม 🍙/🌾 เดิม (shared.js) อัตโนมัติ ไม่ต้องทำปุ่มใหม่
    var curZh = session ? (session.words[session.index] && session.words[session.index].zh) : (randomEntry ? randomEntry.zh : (S.zh || ''));
    var zhHtml = curZh ? '<div class="word-zh">' + curZh + '</div>' : '';
    var mainBoxHtml, sentCtxHtml = '';
    var sentCtxZhHtml = ''; // Lin 2026-07-31: คำแปลทั้งประโยค (高級) — โชว์รวมกับ 翻譯ท้ายแถว ไม่ให้แซง 讀音/英文讀音
    var sentReadingHtml = ''; // Lin 2026-08-01: คำอ่านยาวทั้งประโยค (高級) — โชว์แทนคำแปลจีนรายคำ (zhHtml) ตามที่ Lin สั่ง เพราะแปลรายคำโดดๆ ไม่มีบริบท
    var sylStripHtml = ''; // Lin 2026-07-30: แยกกล่องพยางค์/กล่องคำในประโยคออกจาก mainBoxHtml — ต้องโชว์นอกกรอบทอง (#tf-banner) เหมือนเกมอ่าน/เกมพิมพ์ ไม่ใช่ฝังในกรอบทอง
    if (advSentenceCtx && session && session.words && session.words.length) {
      // Lin 2026-07-14: 高級句子 — ช่องคำศัพท์หลักโชว์ "ประโยคเต็ม" ไฮไลต์คำที่กำลังถามอยู่ในประโยค + คำแปลจีน (บริบทที่เกมอ่าน/เกมพิมพ์ไม่มี เพราะเล่นทีละคำ ไม่ได้โชว์ทั้งประโยค — จุดนี้เก็บไว้เหมือนเดิม)
      var sentHtml = session.words.map(function (w, i) {
        return i === session.index ? '<span class="tf-sent-cur-word">' + w.word + '</span>' : w.word;
      }).join('');
      // Lin 2026-07-31: ต่อคำลงท้ายสุภาพ (ครับ/ค่ะ/คะ) ท้ายประโยคเต็มตรงนี้เท่านั้น — สีจางกว่าคำอื่นๆ เพราะไม่ใช่คำที่ต้องทายเสียง ไม่ถูกไฮไลต์เป็นคำปัจจุบันเหมือนคำอื่น
      if (advSentenceCtx.particle) sentHtml += '<span style="color:#a08a5a;">' + advSentenceCtx.particle + '</span>';
      // 2026-07-30 (รอบ 3): เปลี่ยนกล่องโฟกัสคำเดียว (tf-adv-sent-focus) → แถบช่องพยางค์ (syl-strip/syl-chip) แบบเกมอ่าน/เกมพิมพ์ ตามที่ Lin สั่งกลับไปใช้กรอบกล่อง (ประโยค = แต่ละคำในประโยคทำหน้าที่เหมือนพยางค์)
      var sentChips = session.words.map(function (w, i) {
        var cls = 'syl-chip' + (i === session.index ? ' cur' : (i < session.index ? ' done' : ''));
        return '<div class="' + cls + '"><span class="syl-th">' + w.word + '</span><span class="syl-n">' + (i + 1) + '/' + session.words.length + '</span></div>';
      }).join('');
      // Lin 2026-07-31: ย้ายคำแปลทั้งประโยค (tf-adv-sent-ctx-zh) ออกจาก mainBoxHtml
      //   เดิมโผล่ก่อน 讀音 ทำให้ลำดับเพี้ยน (翻譯 → 讀音 → 翻譯) ตอนนี้เก็บไว้โชว์รวมกับ 翻譯 หลัง 讀音/英文讀音 แทน (ดู sentCtxZhHtml ด้านล่าง)
      mainBoxHtml = '<div class="tf-adv-sent-main">' + sentHtml + '</div>';
      sentCtxZhHtml = advSentenceCtx.zh ? '<div class="tf-adv-sent-ctx-zh">' + advSentenceCtx.zh + '</div>' : '';
      sylStripHtml = sentChips;
      // Lin 2026-08-01: ประโยค高級 — เอาคำแปลจีนรายคำ (zhHtml, เช่น "天氣") ออก เพราะแปลแค่คำเดียวโดดๆ ไม่มีบริบท
      //   เปลี่ยนไปโชว์คำอ่านยาวทั้งประโยคแทน (ตำแหน่งเดิมของ zhHtml) — คำแปลจีนทั้งประโยค (sentCtxZhHtml) ยังอยู่เหมือนเดิม
      zhHtml = '';
      // Lin 2026-07-31 (บั๊กที่ Lin เจอ): ปุ่ม 讀音 กดปิดแล้วคำอ่านทั้งประโยคยังโชว์อยู่ทุกครั้ง (ดูเหมือนปุ่มค้าง)
      //   สาเหตุ: บรรทัดนี้ลืมเช็ค tfPronMode (จุดอื่นในเกมเช็คครบหมดแล้ว) — แก้ให้เช็คเหมือนจุดอื่น (ดู tfReadingLineHtml บรรทัด 967)
      sentReadingHtml = (tfPronMode && advSentenceCtx.readingTH) ? '<div class="tf-adv-sent-reading">' + advSentenceCtx.readingTH + '</div>' : '';
    } else if (S.syllables && S.syllables.length > 1 && S.selectedSyl != null) {
      // Lin 2026-07-16: คำหลายพยางค์ (初/中級 ปกติ) — โชว์ "คำเต็ม" ด้านบน + กล่องพยางค์ที่กำลังถามด้านล่าง (ไล่จากพยางค์แรกเสมอ)
      // 2026-07-16: เอาแถบพยางค์ (syl-chip แบบเกมอ่าน) ออกตามที่ Lin สั่ง — เหลือแค่คำเต็ม + กล่องโฟกัส
      // 2026-07-29: เอากล่องพยางค์แยก (tf-adv-sent-focus) ออกอีกที ตามที่ Lin สั่ง — เปลี่ยนไปเน้นพยางค์ที่กำลังถามตรงคำเต็มด้านบนแทน (ตัวหนา+ขีดเส้นใต้สีทอง แทนกล่องแยก)
      // 2026-07-29 (รอบ 2): แก้บั๊ก — S.syllables แตกมาจาก readingTH (เช่น "สะ-หนาม-บิน" = คำอ่าน) เอามาต่อเป็นคำเต็มตรงๆ ไม่ได้ เพราะจะโชว์เป็นคำอ่านผิด (สนามบิน → "สะหนามบิน") ต้องใช้ตัวสะกดจริงจาก entry.syls[].th (ตัวเขียนแยกพยางค์) แทน ถ้าไม่มี/จำนวนไม่ตรง fallback โชว์คำเต็มเฉยๆไม่เน้น กันพัง
      // 2026-07-30 (รอบ 3): Lin สั่งกลับไปใช้แถบช่องพยางค์แบบมีกรอบ (syl-chip) เหมือนเกมอ่าน/เกมพิมพ์อีกครั้ง (ย้อนการตัดสินใจ 07-16/07-29) — คำเต็มด้านบนโชว์เฉยๆไม่ไฮไลต์ ส่วนความคืบหน้าไปโชว์ที่แถบช่องด้านล่างแทน
      var entrySyls = (randomEntry && randomEntry.syls && randomEntry.syls.length === S.syllables.length) ? randomEntry.syls : null;
      if (entrySyls) {
        var wordChips = entrySyls.map(function (sy, i) {
          var cls = 'syl-chip' + (i === S.selectedSyl ? ' cur' : (i < S.selectedSyl ? ' done' : ''));
          return '<div class="' + cls + '"><span class="syl-th">' + sy.th + '</span><span class="syl-n">' + (i + 1) + '/' + entrySyls.length + '</span></div>';
        }).join('');
        var fullWordPlain = currentCatalogWord();
        mainBoxHtml = '<div class="tf-banner-word' + goldWord + '">' + fullWordPlain + '</div>';
        sylStripHtml = wordChips;
      } else {
        throw new Error('CATALOG_AUTHORITY_INCOMPLETE:display syllables');
      }
    } else {
      mainBoxHtml = '<div class="tf-banner-word' + goldWord + '">' + S.word + '</div>';
    }
    // บรรทัดคำอ่าน: 讀音 โชว์ได้ทุกขั้น (Lin 2026-07-30) · 英文讀音 โชว์หลังตอบแล้วเท่านั้น (ดู tfReadingLineHtml)
    // Lin 2026-07-30 (รอบ 2): เรียงใต้คำให้เหมือนกันทุกเกม → 讀音 → 英文讀音 → 翻譯 (เดิมคำแปลอยู่เหนือคำอ่าน)
    banner.innerHTML = sentCtxHtml + barsHtml + mainBoxHtml + '<div id="tf-read-line">' + tfReadingLineHtml() + '</div>' + zhHtml + sentReadingHtml + sentCtxZhHtml + tfGuideNoteHtml();
    // Lin 2026-07-30: กล่องพยางค์/กล่องคำในประโยค 高級 อยู่นอกกรอบทอง — เติมเนื้อหาแยกจาก banner.innerHTML ข้างบน (ดู #tf-syl-strip ใน tone-finder.html)
    var tfSylStripEl = document.getElementById('tf-syl-strip');
    if (tfSylStripEl) {
      if (sylStripHtml) { tfSylStripEl.style.display = 'flex'; tfSylStripEl.innerHTML = sylStripHtml; }
      else { tfSylStripEl.style.display = 'none'; tfSylStripEl.innerHTML = ''; }
    }
    tfSyncParticleBtn(); // Lin 2026-07-31: ปุ่มครับ/ค่ะ/คะ ในเมนู🍚 — โชว์เฉพาะตอนเล่น高級句子เท่านั้น (ปุ่มจริงอยู่นอก banner ต้องซิงค์ทุกครั้งที่ render)
    // Lin 2026-08-02: จุดเดียวกับบั๊กที่แก้ใน stepResult() แต่เป็นช่วง "ก่อนตอบ" — S.word ของพยางค์ที่ 2 ขึ้นไปคือคำอ่าน ไม่ใช่ตัวสะกดจริง
    //   กันหลุดเข้าไปในปุ่มบันทึกคำศัพท์ (🔖 單字庫) + ตัวบอกคำปัจจุบันของระบบเสียง
    //   (แก้รอบ 2 — รอบแรกใช้ entrySyls ที่คำนวณไว้ด้านบน แต่ entrySyls คำนวณเฉพาะกิ่งคำหลายพยางค์ปกติเท่านั้น
    //    ไม่ครอบกิ่งประโยค高級 (advSentenceCtx) ซึ่งคำในประโยคก็มีหลายพยางค์ได้เหมือนกัน เช่น "ภาษาไทย" ในประโยค
    //    เปลี่ยนมาใช้ tfCurEntry() แบบเดียวกับ stepResult() แทน เพราะ tfCurEntry() คืนค่าถูกทั้ง 2 โหมด)
    var _vaEntry = tfCurEntry();
    var _vaultAudioWord = S.word;
    if (S.syllables && S.syllables.length > 1 && S.selectedSyl != null && _vaEntry && _vaEntry.syls && _vaEntry.syls.length === S.syllables.length && _vaEntry.syls[S.selectedSyl] && _vaEntry.syls[S.selectedSyl].th) {
      _vaultAudioWord = _vaEntry.syls[S.selectedSyl].th;
    }
    // inject vault save button
    if (window.WordVault && _vaultAudioWord) {
      WordVault.injectStyles();
      var slot = document.getElementById('tf-vault-btn-slot');
      if (slot) {
        slot.innerHTML = '';
        var meta = { zh: S.zh || '', en: S.readingEN || '', contentKey:(_vaEntry&&_vaEntry.word===_vaultAudioWord&&_vaEntry.contentKey)?tfWordContentKey(_vaEntry):undefined, source: 'tone-finder' };
        slot.appendChild(WordVault.createSaveBtn(_vaultAudioWord, meta));
      }
    }
    // บอกระบบเสียงว่าคำปัจจุบันคือคำไหน — ปุ่ม 🔊 กด 1 ที = เล่นเสียงคำนี้ 1 ที (2026-07-16)
    if (window.WordAudio) WordAudio.setCurrent(_vaultAudioWord);
    // แถวปุ่มใต้คำศัพท์ (อยู่นอก banner เพื่อไม่โดน innerHTML ล้างปุ่ม 🍙 ของ shared.js ทิ้ง) — โชว์คู่กับ banner เสมอ
    var _ctlRow = document.getElementById('tf-word-ctl-row');
    if (_ctlRow) _ctlRow.style.display = S.word ? 'flex' : 'none';
    document.getElementById('tf-hint').style.display = 'block';
  } else {
    banner.style.display = 'none';
    var _ctlRow2 = document.getElementById('tf-word-ctl-row');
    if (_ctlRow2) _ctlRow2.style.display = 'none';
    var tfSylStripEl2 = document.getElementById('tf-syl-strip'); // Lin 2026-07-30: ซ่อนกล่องพยางค์นอกกรอบทองด้วยตอนไม่มีคำ (เช่นหน้าเลือกระดับ/หน้าเฉลย)
    if (tfSylStripEl2) { tfSylStripEl2.style.display = 'none'; tfSylStripEl2.innerHTML = ''; }
    // Phase C.1 (2026-08-10): ไม่มีคำที่กำลังเล่นอยู่ (เช่นหน้าเลือกระดับ/หน้าเฉลย) → ล้าง #tf-session-counter
    // กันเลขเก่าจากคำถามก่อนหน้าค้างโชว์ทั้งที่ .tf-level-tabs แถบนี้อยู่เหนือการ์ดตลอด ไม่เคยถูกซ่อน
    var _tfCounterEl2 = document.getElementById('tf-session-counter');
    if (_tfCounterEl2) _tfCounterEl2.innerHTML = '';
    document.getElementById('tf-hint').style.display = 'block';
  }

  // Breadcrumb — Lin 2026-07-31: ลบแถบนี้ออกจากเกมเสียงทุกระดับตามที่ Lin สั่ง (ซ่อนถาวร ไม่โชว์อีกต่อไป)
  var bc = document.getElementById('tf-bc');
  bc.style.display = 'none';

  // Nav bar (back/forward) — Lin 2026-07-31: ลบแถบนี้ออกจากเกมเสียงทุกระดับตามที่ Lin สั่ง (ซ่อนถาวร ไม่โชว์อีกต่อไป)
  var navBar = document.getElementById('tf-nav-bar');
  navBar.style.display = 'none';

  // Main body
  var body = document.getElementById('tf-body');
  body.innerHTML = buildStep();
  if (window.GameFlow) {
    GameFlow.cancel('tone-finder');
    if (S.step === 'result' && session) {
      setTimeout(function () { GameFlow.start({ key: 'tone-finder', nextButton: '#tf-session-next-btn', delaySeconds: 3 }); }, 0);
    }
    if (S.step === 'session-summary') {
      GameFlow.markResult(body);
      setTimeout(function(){
        var actions=body.querySelector('.gsh-end-actions');
        var correct=session&&session.results?session.results.filter(function(r){return !r.skipped&&(r.mistakes||0)===0;}).length:0;
        var total=session&&session.results?session.results.length:0;
        var hl=[];
        if(tfSrsLoggedIn()&&window.GAME_ACCOUNT){var gs=GAME_ACCOUNT.getStreak();if(gs)hl.push('🔥 連續 '+gs+' 天');if(session&&session.newBadges&&session.newBadges.length)hl.push('🎖️ '+session.newBadges[session.newBadges.length-1].zh);}
        GameFlow.enhanceResult({key:'tone-result',root:body,actions:actions,correct:roundReport?roundReport.correct_count:correct,total:roundReport?roundReport.total_items:total,highlights:hl,report:roundReport,onReplay:function(){TF._startRandom5();}});
        tfFinalizeAlignedResultPresentation(body);
      },0);
    }
  }
  // Lin 2026-07-11: หลอด本題分數 ย้ายไปโชว์ในการ์ดทอง (#tf-banner) แล้ว — เลิก prepend ซ้ำเข้า body ตรงนี้ (กันโชว์ซ้อน 2 หลอด)
  var practiceSteps = ['session-guess','overview'];
  if (session && practiceSteps.indexOf(S.step) !== -1) {
    // \u0e2b\u0e25\u0e32\u0e22\u0e1e\u0e22\u0e32\u0e07\u0e04\u0e4c: \u0e27\u0e34\u0e40\u0e04\u0e23\u0e32\u0e30\u0e2b\u0e4c\u0e04\u0e23\u0e1a\u0e17\u0e38\u0e01\u0e1e\u0e22\u0e32\u0e07\u0e04\u0e4c\u0e41\u0e25\u0e49\u0e27 \u2192 \u0e44\u0e21\u0e48\u0e42\u0e0a\u0e27\u0e4c "\u5df2\u8a18\u5f97" \u0e40\u0e2b\u0e25\u0e37\u0e2d\u0e41\u0e04\u0e48\u0e1b\u0e38\u0e48\u0e21\u0e44\u0e1b\u0e15\u0e48\u0e2d (LIN 2026-06-20)
    var _hideKnown = false;
    if (S.step === 'overview') {
      var _sy = S.syllables || [], _r = S.sylResults || {};
      _hideKnown = _sy.length > 0 && _sy.every(function(_, i){ return _r[i] != null; });
    }
    // Lin 2026-07-04: อยู่ในโหมดพิสูจน์ (known-check) แล้ว → ซ่อนปุ่ม "已記得" (กันกดวน + ต้องพิสูจน์ให้จบก่อน)
    if (session.curWordIsKnownCheck) _hideKnown = true;
    if (!_hideKnown) {
      body.innerHTML += '<div class="tf-known-bar"><button type="button" class="tf-known-btn" onclick="try{if(typeof gtag===\'function\')gtag(\'event\',\'tone_finder_skip_click\',{category:\'game\'});}catch(e){}TF.skipCurrentWord()">跳過</button></div>';
    }
  }

  // \u2500\u2500 \u0e40\u0e25\u0e37\u0e48\u0e2d\u0e19\u0e02\u0e36\u0e49\u0e19\u0e1a\u0e19\u0e2a\u0e38\u0e14\u0e17\u0e38\u0e01\u0e04\u0e23\u0e31\u0e49\u0e07\u0e17\u0e35\u0e48\u0e40\u0e1b\u0e25\u0e35\u0e48\u0e22\u0e19\u0e2b\u0e19\u0e49\u0e32\u0e08\u0e2d \u0e43\u0e2b\u0e49\u0e40\u0e2b\u0e47\u0e19\u0e04\u0e33\u0e43\u0e2b\u0e21\u0e48/\u0e2b\u0e31\u0e27\u0e02\u0e49\u0e2d\u0e43\u0e2b\u0e21\u0e48\u0e17\u0e31\u0e19\u0e17\u0e35 (LIN 2026-06-18) \u2500\u2500
  // \u0e40\u0e14\u0e49\u0e07\u0e44\u0e1b\u0e1a\u0e19\u0e40\u0e09\u0e1e\u0e32\u0e30\u0e2b\u0e19\u0e49\u0e32\u0e2b\u0e25\u0e31\u0e01\u0e02\u0e2d\u0e07\u0e40\u0e01\u0e21 \u0e44\u0e21\u0e48\u0e23\u0e1a\u0e01\u0e27\u0e19\u0e2b\u0e19\u0e49\u0e32 popup/overlay
  // LIN 2026-06-19: เลื่อนขึ้น "บนสุดของหน้าเว็บ" (เห็นหัวเว็บ) ทุกครั้งที่เปลี่ยนหน้าจอ
  // ไม่เลื่อนถ้ามี popup/overlay เปิดอยู่ (กันกระโดดตอนเปิดกล่องถามคำถาม ฯลฯ)
  // LIN 2026-06-20: เลิก smooth-scroll ไปบนสุดทุกครั้ง (กระตุก/เด้งขึ้นลงตอนกดรัวๆ)
  //   → เลื่อนแบบ "ทันที" ให้การ์ดเกมอยู่ใต้หัวเว็บ และเลื่อนเฉพาะตอนการ์ดหลุดเฟรมเท่านั้น (ถ้าเห็นอยู่แล้วไม่ขยับ = นิ่ง)
  try {
    if (!document.getElementById('tf-ask-ov')) {
      var _card = document.querySelector('.tf-card');
      if (_card && _card.getBoundingClientRect) {
        var _rect = _card.getBoundingClientRect();
        var _offset = 70; // เผื่อหัวเว็บแบบ sticky
        // LIN 2026-07-04: กันจอ "เด้งขึ้นบน" ทุกครั้งที่กดเปลี่ยนหน้า (กดยาก)
        //   → เลื่อนเฉพาะตอน "จำเป็นจริง" เท่านั้น: การ์ดถูกตัดหายเหนือหัวเว็บ (top < 0)
        //     หรือถูกดันลงเกินเกือบครึ่งจอจนมองไม่เห็นคำ (top > 45% ของความสูงจอ)
        //   ถ้าการ์ดยังอยู่ในกรอบสบายตา = ไม่ขยับเลย → กันกระชากตอนกดปุ่มรัวๆ
        var _vh = window.innerHeight || document.documentElement.clientHeight || 700;
        if (_rect.top < 0 || _rect.top > _vh * 0.45) {
          var _y = (window.pageYOffset || 0) + _rect.top - _offset;
          if (_y < 0) _y = 0;
          window.scrollTo({ top: _y, left: 0, behavior: 'auto' });
        }
      } else {
        window.scrollTo(0, 0);
      }
    }
  } catch (e) {
    try { window.scrollTo(0, 0); } catch (e2) {}
  }
}

function buildStep() {
  switch(S.step) {
    case 'level-select':    return stepLevelSelect();
    case 'alpha-home':      return stepAlphaHome();
    case 'alpha-consonant': return stepAlphaConsonant();
    case 'alpha-vowel':     return stepAlphaVowel();
    case 'alpha-flashcard': return stepAlphaFlashcard();
    case 'session-summary': return stepSessionSummary();
    case 'mistake-review': return stepMistakeReview(); // F2 (2026-08-10)
    case 'session-guess':   return stepSessionGuess();
    case 'result':          return stepResult();
    default: return '';
  }
}

// ════════════════════════════════════════════════════════════
// STEP BUILDERS
// ════════════════════════════════════════════════════════════
// Correct answers are read from catalogToneNumber(); no client-side tone engine or override exists.

// Lin 2026-07-25: ลบระบบเสียงสังเคราะห์ (Web Speech API) ออกถาวรตามที่ Lin สั่ง
//   เดิมมี TF_MUTED/speakThai/speakThaiForce + ปุ่ม 🔊 聽發音 / 🔊 點擊聽發音 — ทั้งหมดถูกปิดเสียง+ซ่อนด้วย CSS มาตั้งแต่ 2026-06-18 อยู่แล้ว (ไม่มีใครเห็น/ใช้ได้)
//   เสียงที่ใช้จริงตอนนี้ = ไฟล์ TTS จริง ผ่าน WordAudio (ปุ่ม 🔊 กลมข้างคำในหน้าเฉลย) + TF_FLASH_AUDIO ของ 字母練習區

function showComingSoon() {
  var old = document.getElementById('tf-soon-toast');
  if (old) old.remove();
  var d = document.createElement('div');
  d.id = 'tf-soon-toast';
  d.className = 'tf-soon-toast';
  d.textContent = '🔊 即將推出';
  document.body.appendChild(d);
  setTimeout(function(){ if (d) d.remove(); }, 1800);
}

// ════════════════════════════════════════════════════════════
// SESSION STEP BUILDERS
// ════════════════════════════════════════════════════════════
// Lin 2026-07-25: ปิดโหมด 自行搜尋 ถาวรตามที่ Lin สั่ง (ไม่ใช้แล้ว) — ลบทั้งระบบออก  [recordSearch + buildSearchReportInner]
// ── Popup โปรโมทคอร์ส (เด้งวันละครั้ง จังหวะเล่นจบรอบที่ 2+) ──
function maybeShowCoursePromo() {
  _sessionsThisVisit++;
  if (_sessionsThisVisit < 2) return;            // ไม่เด้งรอบแรก ให้เล่นเพลินก่อน
  try {
    var today = new Date().toISOString().slice(0,10);
    if (localStorage.getItem('coursePromoDay') === today) return;  // วันละครั้งพอ
    localStorage.setItem('coursePromoDay', today);
  } catch(e) {}
  showCoursePromoPopup();
}
function showCoursePromoPopup() {
  if (document.getElementById('tf-course-promo')) return;
  var d = document.createElement('div');
  d.id = 'tf-course-promo';
  d.style.cssText = 'position:fixed;left:50%;bottom:18px;transform:translateX(-50%) translateY(140%);z-index:99998;max-width:360px;width:calc(100% - 24px);background:#fff;border:1px solid rgba(200,151,58,0.45);border-radius:16px;box-shadow:0 12px 40px rgba(0,0,0,0.22);padding:16px 18px 16px;font-family:"Noto Sans TC",sans-serif;transition:transform .45s cubic-bezier(.2,.8,.2,1);';
  d.innerHTML =
    '<button onclick="this.parentNode.remove()" aria-label="關閉" style="position:absolute;top:7px;right:11px;border:none;background:none;font-size:16px;color:#c3b594;cursor:pointer;">✕</button>'+
    '<div style="font-size:15px;font-weight:800;color:#5C4410;margin-bottom:4px;">想更快搞懂泰語聲調嗎？🎯</div>'+
    '<div style="font-size:13px;color:#8B7340;line-height:1.6;margin-bottom:12px;">一對一中文授課・30 分鐘免費體驗課，老師直接幫你抓出發音盲點。</div>'+
    '<button onclick="var p=document.getElementById(\'tf-course-promo\');if(p)p.remove();if(typeof bookFromGame===\'function\'){bookFromGame(\'tone_finder\',\'course_promo\')}else if(typeof openModal===\'function\'){openModal(\'modal-line-qr\')}" style="width:100%;background:#C8973A;color:#fff;border:none;border-radius:10px;padding:11px;font-weight:700;font-size:14px;cursor:pointer;">預約免費體驗課 →</button>';
  document.body.appendChild(d);
  requestAnimationFrame(function(){ d.style.transform = 'translateX(-50%) translateY(0)'; });
  setTimeout(function(){ var el=document.getElementById('tf-course-promo'); if(el){ el.style.transform='translateX(-50%) translateY(140%)'; setTimeout(function(){ if(el&&el.parentNode) el.remove(); },500); } }, 14000);
}

// Lin 2026-07-31: 改版 — 報告樣式統一成跟 reading-game/typing-game/word-order 完全同一套版型
// （深色頂欄+金邊卡片、同一份表格欄位）ทำให้เหมือน เกมพิม/เกมอ่าน ตามที่ Lin สั่ง
// เดิมใช้ CSS var(--gold-bright) แต่หน้าต่างรายงานนี้เป็นเอกสารแยก ไม่ได้โหลด :root ของเว็บหลัก → ตัวแปรใช้ไม่ได้จริง (ไม่มี fallback)
// เปลี่ยนมาใช้เลขสี hex ตรงๆ เหมือน 3 เกมที่เหลือ; รายงานใช้ข้อเท็จจริงของรอบนี้ และเพิ่ม SRS เดิมเฉพาะผู้ใช้ที่ล็อกอิน
function buildReportInner() {
  var SERIF="'Noto Serif TC','PingFang TC',serif";
  var SANS="'Noto Sans TC','PingFang TC',sans-serif";
  var results = session.results;
  var reportItems = roundReport && roundReport.items ? roundReport.items : [];
  var today = new Date().toLocaleDateString('zh-TW',{year:'numeric',month:'2-digit',day:'2-digit'});
  var levelChar = ({1:'初',2:'中',3:'高'})[selectedLevel] || '—';
  var loggedIn = tfSrsLoggedIn();
  var total = reportItems.length;
  var perfectCount = reportItems.filter(function(r){ return r.is_correct; }).length;
  var weightedScore = roundReport ? roundReport.score : TF_SCORE.weightedScore(session.score || 0, selectedLevel);

  function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function statusLabel(r){
    if (r.is_skipped) return '<span style="color:#8B6310;">跳過</span>';
    if (loggedIn && r.mastered_state) return '<span style="color:#8B6310;">✓ 已精通</span>';
    if (!r.is_correct) return '<span style="color:#c62828;">✗ 答錯</span>';
    return '<span style="color:#2e7d32;">✓ 答對</span>';
  }
  function srsCell(r){
    return r.mastered_state ? '已精通' : (r.srs_state || '—');
  }

  var rows = reportItems.map(function(r,i){
    return '<tr>'
      +'<td style="padding:7px 6px;font-size:12px;color:#888;text-align:center;">'+(i+1)+'</td>'
      +'<td style="padding:7px 6px;font-size:15px;font-weight:700;word-break:keep-all;overflow-wrap:break-word;">'+esc(r.question)+'<div style="font-size:10px;font-weight:400;color:#777;">作答：'+esc(r.user_answer||'（未作答）')+'<br>正解：'+esc(r.correct_answer||'—')+(r.linguistic&&r.linguistic.reading_th?'<br>讀音：'+esc(r.linguistic.reading_th):'')+'</div></td>'
      +'<td style="padding:7px 6px;font-size:12px;color:#666;">'+esc(r.meaning)+'</td>'
      +'<td style="padding:7px 6px;font-size:12px;text-align:center;">'+statusLabel(r)+'</td>'
      +'<td style="padding:7px 6px;font-size:12px;text-align:center;">'+(r.wrong_count||0)+'</td>'
      +'<td style="padding:7px 6px;font-size:12px;text-align:center;font-weight:700;color:#8B6310;">+'+(r.item_score||0)+'</td>'
      +(loggedIn?'<td style="padding:7px 6px;font-size:11px;text-align:center;color:#8B6310;">'+srsCell(r)+'</td>':'')
      +'</tr>';
  }).join('');

  var innerHtml =
    '<div style="max-width:640px;margin:0 auto;padding:24px;background:#FBF5E7;box-sizing:border-box;font-family:'+SERIF+';color:#1C1C1C;">'
    +'<div style="background:#fff;border:1px solid #C8973A;">'
    +'<table style="width:100%;background:#1C1C1C;border-bottom:3px solid #C8973A;border-collapse:collapse;"><tr>'
    +'<td style="padding:22px 26px;vertical-align:top;">'
    +'<div style="color:#fff;font-size:20px;font-weight:700;font-family:'+SERIF+';">泰語聲調練習・本輪報告</div>'
    +'<div style="font-family:'+SANS+';font-size:9px;letter-spacing:0.2em;color:#C8973A;font-weight:700;margin-top:6px;">mrtaihualin.com</div>'
    +'</td>'
    +'<td style="padding:22px 26px;vertical-align:top;text-align:right;color:#C8973A;white-space:nowrap;">'
    +'<div style="font-family:'+SANS+';font-size:11px;">'+esc(today)+'</div>'
    +'<div style="font-family:'+SANS+';font-size:11px;">'+levelChar+'級</div>'
    +'</td></tr></table>'
    +'<div style="padding:20px 26px;">'
    +'<table style="width:100%;font-family:'+SANS+';font-size:12px;color:#8B6310;"><tr>'
    +'<td>本輪得分</td><td style="text-align:right;font-size:20px;font-weight:700;color:#5a3e0a;">'+weightedScore+' 分</td>'
    +'</tr><tr><td>一次答對題數</td><td style="text-align:right;">'+perfectCount+' / '+total+'</td></tr></table>'
    +'<hr style="border:none;border-top:1px solid rgba(139,99,16,0.2);margin:14px 0;">'
    +'<table style="width:100%;border-collapse:collapse;"><thead><tr style="border-bottom:1.5px solid #C8973A;">'
    +'<th style="font-size:11px;color:#8B6310;padding:5px;">#</th>'
    +'<th style="font-size:11px;color:#8B6310;padding:5px;text-align:left;">泰文</th>'
    +'<th style="font-size:11px;color:#8B6310;padding:5px;text-align:left;">意思</th>'
    +'<th style="font-size:11px;color:#8B6310;padding:5px;">狀態</th>'
    +'<th style="font-size:11px;color:#8B6310;padding:5px;">猜錯次數</th>'
    +'<th style="font-size:11px;color:#8B6310;padding:5px;">得分</th>'
    +(loggedIn?'<th style="font-size:11px;color:#8B6310;padding:5px;">下次複習</th>':'')
    +'</tr></thead><tbody>'+rows+'</tbody></table>'
    +(window.RoundReport?RoundReport.loginSectionsHtml(roundReport):'')
    +'</div></div>'
    +'<div style="text-align:center;font-family:'+SANS+';font-size:9.5px;letter-spacing:0.15em;color:#8B6310;padding:16px 26px 4px;">泰華眼裡的泰語教學　·　mrtaihualin.com</div>'
    +'</div>';
  return innerHtml;
}

function buildReportHTML() {
  return '<!DOCTYPE html><html lang="zh-TW"><head><meta charset="utf-8"><title>聲調練習報告</title>'
    +'<link href="https://fonts.googleapis.com/css2?family=Noto+Serif+TC:wght@400;700;900&family=Noto+Sans+TC:wght@400;700&display=swap" rel="stylesheet">'
    +'<style>@page{margin:10mm;}body{margin:0;background:#fff;}</style>'
    +'</head><body>'+buildReportInner()+'</body></html>';
}
function openReportPrint() {
  if (window.RoundReport && typeof RoundReport.openPrint === 'function') {
    var levelChar = ({1:'初',2:'中',3:'高'})[selectedLevel] || '';
    if (RoundReport.openPrint({gameType:'tone',report:roundReport,title:'泰語聲調練習・本輪報告',documentTitle:'聲調練習報告',difficulty:levelChar ? levelChar+'級' : ''})) return;
    showComingSoon();
    return;
  }
  var win = window.open('', '_blank');
  if (!win) { showComingSoon(); return; }
  win.document.open(); win.document.write(buildReportHTML()); win.document.close(); win.focus();
  setTimeout(function(){ try{ win.print(); }catch(e){} }, 600);
}

function tfAttachLoginSummary(){
  if(!roundReport||!window.LearningSummary||!tfSrsLoggedIn())return;
  LearningSummary.loadForGame('tone','tone-finder').then(function(summary){
    if(!roundReport||!window.RoundReport)return;
    RoundReport.setLoginSummary(roundReport,summary);
    if(window.GameFlow)GameFlow.attachReport(document.querySelector('[data-shared-result-ui="v1"]'),roundReport);
  });
}

function tfFinalizeAlignedResultPresentation(root) {
  if (!root || !tfDesktopOrPortrait()) return;
  var duplicatedMeta = root.querySelector('[data-game-result-meta="v1"]');
  if (duplicatedMeta) duplicatedMeta.remove();
  var duplicatedDetails = root.querySelector('.gsh-result-shared-details');
  if (duplicatedDetails) duplicatedDetails.remove();
}

function stepSessionSummary() {
  if (!session) return '';
  var results = session.results;
  var scoreResults = results.filter(function (r) { return !(r.entry && r.entry.isParticle); });
  var total = scoreResults.length;
  var reportResults = roundReport && roundReport.items ? roundReport.items : [];
  // The visible Result table treats a wrong first guess as not first-time correct,
  // even when the later derivation has no additional mistakes. Keep the headline
  // count on that same evidence instead of counting only derivation mistakes.
  var perfectCount = reportResults.length === total
    ? reportResults.filter(function(r){ return !r.is_skipped && r.is_correct; }).length
    : scoreResults.filter(function(r){ return !r.skipped && r.firstTry; }).length;
  // ส่งคะแนนจริง (ถ่วงน้ำหนักระดับ) เข้า Supabase/leaderboard — ไม่ใช่ perfectCount เดิม
  var weightedScore = TF_SCORE.weightedScore(session.score || 0, selectedLevel);
  gtag('event','tone_finder_complete',{category:'game',score: weightedScore, total: total, perfect: perfectCount, raw_score: session.score || 0, level: selectedLevel});
  try{ if(window.gtag) gtag('event','game_complete',{category:'game',game:'tone_finder', score: weightedScore, total: total}); }catch(e){}
  if(!session.submissionLinked){
    var _tfSubmissionId=null;
    try{
      if(window.READING_AUTH && READING_AUTH.saveScore) _tfSubmissionId=READING_AUTH.saveScore(weightedScore,1,'tone',scoreResults.filter(function(r){return r.mistakes>0;}).map(function(r){return {word:r.entry.word,wrong:r.mistakes||0};}),{
        difficulty:({1:'初',2:'中',3:'高'})[selectedLevel]||'初',
        items:scoreResults.map(function(r){var ref=tfContentRefForEntry(r.entry);return {key:ref.key,contentRef:ref,points:Number(r.score)||0,wrong:Number(r.mistakes)||0,guide:!!r.hintUsed,failed:!!r.forced,skipped:!!r.skipped,mastered:false,learningEvidence:r.learningEvidence||null};}),
        roundBonus:Number(session.bonusAwarded)||0,
        srsBonus:Number(session.srsReviewBonus)||0
      });
    }catch(e){} // S29: ยกเลิก GA interception/direct tone_sessions insert
    session.submissionLinked=true;
    if(roundReport&&window.RoundReport)RoundReport.finish(roundReport,{score:weightedScore,submission_id:_tfSubmissionId});
    tfAttachLoginSummary();
  }
  var rows = (roundReport&&roundReport.items?roundReport.items:[]).map(function(r, i){
    var tone = r.linguistic && r.linguistic.correct_tone;
    var tl = TONES[tone] || {};
    var ok = r.is_correct;
    var resultTxt = r.is_skipped ? '跳過' : (ok ? '✓' : '✗ ×'+r.wrong_count);
    if (tfDesktopOrPortrait() && !r.is_skipped && !ok) {
      resultTxt = '✗ ' + (r.user_answer || '—') + ' → ' + (r.correct_answer || '—');
    }
    var resultColor = r.is_skipped ? '#8B6310' : (ok ? '#7ec87e' : '#ff7c7c');
    return '<tr>' +
      '<td style="color:#bbb;font-size:12px;width:24px;">'+(i+1)+'</td>' +
      '<td class="tf-sum-th">'+r.question+'<div style="font-size:10px;font-weight:400;color:#999;">作答：'+(r.user_answer||'—')+'<br>正解：'+(r.correct_answer||'—')+'</div></td>' +
      '<td>'+r.meaning+'</td>' +
      '<td style="color:'+(tl.color||'#666')+'">'+(tl.zh||'—')+'</td>' +
      '<td style="color:'+resultColor+';font-weight:700">'+resultTxt+'</td>' +
      '<td style="color:#8B6310;font-weight:700;text-align:right;">'+(r.item_score||0)+'</td>' +
    '</tr>';
  }).join('');
  // ── สเตจ 1: สรุปคะแนน ──
  var totalScore = session.score || 0;
  var bonusAwarded = session.bonusAwarded || 0;
  var isPerfect = total > 0 && perfectCount === total && !!session.isPerfect;
  var useAlignedResultLayout = tfDesktopOrPortrait();
  // แสดงคะแนนถ่วงน้ำหนักตามระดับบนหน้าจอ (Lin 2026-07-03): 初×1.5 / 中×2.25 / 高×3
  var levelWeightShown = TF_SCORE_CFG.LEVEL_WEIGHT[selectedLevel] || 1;
  var scoreSummary =
    '<div class="tf-score-summary">' +
      '<div class="tf-score-summary-total">🏆 ' + weightedScore + ' <span>分</span></div>' +
      (levelWeightShown !== 1 ? '<div class="tf-score-summary-formula">（原始 ' + totalScore + ' 分 × 等級加成 ' + levelWeightShown + '）</div>' : '') +
      (!useAlignedResultLayout && bonusAwarded ? '<div class="tf-score-summary-bonus">' +
        (isPerfect ? '🎉 完美通關獎勵 ' : '✅ 完成獎勵 ') + '+' + bonusAwarded + '</div>' : '') +
    '</div>';
  // ── สเตจ 2/3: น้องมีนา + Daily Streak + เป้ารายวัน + แบดจ์ ──
  var sr = session.streakResult || null;
  var ev = sr && sr.events || {};
  var stState = sr && sr.state || tfLoadStreak();
  var minaKey = isPerfect ? 'perfect' : (perfectCount / Math.max(1,total) >= 0.6 ? 'greatSet' : 'goodSet');
  var minaMsg = tfMinaSay(minaKey);
  var minaBlock = tfMinaBubble(minaMsg, 'big');

  var rewardBlock = useAlignedResultLayout
    ? '<div class="tf-result-reward-row">' +
        (bonusAwarded ? '<span class="tf-score-summary-bonus">' +
          (isPerfect ? '🎉 完美通關獎勵 ' : '✅ 完成獎勵 ') + '+' + bonusAwarded + '</span>' : '') +
        '<span class="tf-streak-chip">🔥 連續 ' + (stState.streak || 0) + ' 天</span>' +
      '</div>'
    : '<div class="tf-streak-row"><span class="tf-streak-chip">🔥 連續 ' + (stState.streak || 0) + ' 天</span></div>';

  var badgeBlock = '';
  if (session.newBadges && session.newBadges.length) {
    badgeBlock = '<div class="tf-badge-unlock"><div class="tf-badge-unlock-title">🎖️ 解鎖新徽章！</div><div class="tf-badge-unlock-grid">' +
      session.newBadges.map(function (b) {
        return '<div class="tf-badge-card"><div class="tf-badge-emoji">' + tfBadgeIcon(b, 54) + '</div>' +
          '<div class="tf-badge-zh">' + b.zh + '</div>' +
          '<div class="tf-badge-th">' + b.th + '</div>' +
          '<div class="tf-badge-need">' + b.need + '</div></div>';
      }).join('') + '</div></div>';
  }

  // F2 (2026-08-10): ปุ่ม 查看錯題 — โชว์เฉพาะเมื่อมีผลอย่างน้อย 1 คำ (ปกติมีเสมอถ้าเล่นจบรอบจริง)
  var mistakeBtnHtml = total > 0
    ? '<button type="button" class="tf-restart-btn" data-game-result-detail-action="v1" onclick="try{if(typeof gtag===\'function\')gtag(\'event\',\'tone_finder_mistake_review_open\',{category:\'game\'});}catch(e){}TF.showMistakeReview()">查看本輪詳細紀錄</button>'
    : '';
  return '<div class="tf-session-summary">' +
    minaBlock +
    scoreSummary +
    rewardBlock +
    badgeBlock +
    // F1 (2026-08-10): เพิ่ม class gsh-end-score/gsh-end-title (css/shared.css) ให้ตรงกับเกมอื่น — ยังคง class เดิม (tf-sum-score/tf-sum-score-label) ไว้ด้วย ไม่ลบของเดิม ไม่เปลี่ยนเนื้อหา/ตำแหน่ง
    '<div class="tf-sum-score gsh-end-score">'+perfectCount+' / '+total+'</div>' +
    '<div class="tf-sum-score-label gsh-end-title">'+(perfectCount===total?'全部一次答對！太厲害了 🎉':'我們一起繼續加油！💪')+'</div>' +
    // ⭐ การ์ดชวนจอง — ดันขึ้นมาก่อนตารางคะแนน เพื่อให้ผู้เล่นเห็นก่อนปิดหน้า
    // Lin/spec ข้อ F1 บอกว่า "ห้ามใส่ promotion/sales CTA กลาง result" แต่การ์ดนี้เป็นการ์ดจองคอร์สที่ตั้งใจมีอยู่แล้วทั้งเว็บ (นโยบายธุรกิจ ไม่ใช่ของที่ UI spec รอบนี้จะสั่งถอดเองได้) — คงไว้ตามเดิมทุกประการ ไม่แตะ
    '<div class="tf-result-trial-card" style="margin-top:18px;padding:16px;background:linear-gradient(180deg,#FBF5E7,#fff);border:1px solid rgba(200,151,58,0.4);border-radius:14px;text-align:center;">' +
      '<div class="tf-result-trial-title" style="font-size:15px;font-weight:800;color:#5C4410;margin-bottom:4px;">想真正開口說泰語嗎？🎯</div>' +
      '<div class="tf-result-trial-copy" style="font-size:13px;color:#8B7340;line-height:1.6;margin-bottom:12px;">一對一中文授課・30 分鐘免費體驗課，老師直接幫你抓出聲調盲點。</div>' +
      '<button class="tf-session-next-btn" data-game-result-cta="v1" style="background:#C8973A;color:#fff;" onclick="if(typeof bookFromGame===\'function\'){bookFromGame(\'tone_finder\',\'session_end\')}else if(typeof openModal===\'function\'){openModal(\'modal-line-qr\')}">預約免費體驗課 →</button>' +
    '</div>' +
    '<table class="tf-sum-table"><thead><tr><th></th><th>單字</th><th>中文</th><th>聲調</th><th>結果</th><th style="text-align:right;">分數</th></tr></thead>' +
      '<tbody>'+rows+'</tbody></table>' +
    // F1 (2026-08-10): แถวปุ่มท้ายผลลัพธ์ เปลี่ยนจาก inline flex style เดิม → class gsh-end-actions (shared.css: column บนมือถือ, row บนจอใหญ่ ≥600px) เพิ่มปุ่ม 查看錯題 (F2) เข้าแถวเดียวกัน — ปุ่ม/ลิงก์เดิมทุกปุ่มยังอยู่ครบ ไม่มีปุ่มไหนถูกลบ ไม่เปลี่ยน onclick/href ใดๆ เลย
    '<div class="gsh-end-actions tf-result-actions">' +
      '<button class="tf-session-next-btn" id="tf-pdf-btn" data-game-result-print="v1" onclick="try{if(typeof gtag===\'function\')gtag(\'event\',\'tone_finder_download_report_click\',{category:\'game\'});}catch(e){}TF.downloadReport()">📄 列印／儲存學習紀錄</button>' +
      mistakeBtnHtml +
      '<button class="tf-restart-btn" data-game-result-replay="v1" onclick="try{if(typeof gtag===\'function\')gtag(\'event\',\'tone_finder_replay_click\',{category:\'game\'});}catch(e){}TF._startRandom5()">再玩一輪</button>' +
      '<a class="tf-restart-btn" data-game-result-switch="v1" href="games.html" style="text-decoration:none;display:inline-flex;align-items:center;justify-content:center;" onclick="try{gtag(\'event\',\'game_link_click\',{category:\'game\',target:\'games_hub\',from:\'tone_finder\'})}catch(e){}">換個遊戲</a>' +
      '<a class="tf-restart-btn" data-game-result-home="v1" href="index.html" style="text-decoration:none;display:inline-flex;align-items:center;justify-content:center;">回到首頁</a>' +
    '</div>' +
  '</div>';
}

// ── F2 (2026-08-10): 查看錯題 — หน้าอ่านอย่างเดียว (read-only) ใช้ session.results ที่มีอยู่แล้วเท่านั้น ไม่คำนวณ/แก้คะแนนใดๆ ──
function stepMistakeReview() {
  if (!roundReport || !roundReport.items) return '';
  var listSource = roundReport.items;
  var itemsHtml = listSource.map(function (r) {
    var isWrong = !r.is_correct;
    return '<div class="gsh-mistake-item' + (isWrong ? ' gsh-mistake-wrong' : '') + '">' +
      '<div class="gsh-mistake-q">' + (r.question || '—') + (r.meaning ? '　<span style="font-weight:400;color:#999;font-size:13px;">' + r.meaning + '</span>' : '') + '</div>' +
      '<div class="gsh-mistake-row">正確聲調：<b>' + (r.correct_answer || '—') + '</b></div>' +
      '<div class="gsh-mistake-row">你的答案：<b>' + (r.user_answer || '（未作答）') + '</b></div>' +
      '<div class="gsh-mistake-row">狀態：<b>' + (r.is_correct?'✓ 答對':'✗ 答錯') + '</b>・答錯 <b>' + (r.wrong_count || 0) + '</b> 次・得分 <b>' + (r.item_score || 0) + '</b>' + (r.hint_used ? '　💡 使用提示' : '') + '</div>' +
      (r.linguistic&&r.linguistic.reading_th?'<div class="gsh-mistake-row">讀音：<b>'+r.linguistic.reading_th+'</b></div>':'')+
      (r.attempts&&r.attempts.length>1?'<div class="gsh-mistake-row">送出紀錄：'+r.attempts.map(function(a){return a.answer;}).join(' → ')+'</div>':'')+
      (r.words&&r.words.length?'<div class="gsh-mistake-row">逐字：'+r.words.map(function(w){return w.th+'＝'+w.zh;}).join('・')+'</div>':'')+
    '</div>';
  }).join('');
  return '<div class="tf-session-summary">' +
    '<div class="gsh-end-title">📋 本輪詳細紀錄</div>' +
    '<div class="gsh-mistake-list">' + (itemsHtml || '<div style="text-align:center;color:#999;font-size:13px;">沒有紀錄</div>') + '</div>' +
    '<button type="button" class="gsh-mistake-back tf-restart-btn" onclick="TF.backToMistakeSummary()">← 返回結果</button>' +
  '</div>';
}

// ════════════════════════════════════════════════════════════
// 字母練習區 SCREENS
// ════════════════════════════════════════════════════════════
function stepAlphaHome() {
  var cats = [
    {emoji:'🅰️', label:'子音', sub:'中／高／低／遺忘版', fn:'TF.alphaConsonants()'},
    {emoji:'🔡', label:'母音', sub:'短母音／長母音', fn:'TF.alphaVowels()'},
    {emoji:'🔚', label:'尾音', sub:'8 個尾音類別', fn:'TF.alphaEndings()'}
  ];
  return '<div class="tf-level-select tf-alpha-surface">' +
    '<div class="tf-level-title">字母練習區</div>' +
    cats.map(function(c){
      return '<button class="tf-level-btn" onclick="try{if(typeof gtag===\'function\')gtag(\'event\',\'tone_finder_alpha_category_select\',{category:\'game\',category_name:\''+c.label+'\'});}catch(e){}'+c.fn+'">' +
        '<span class="tf-level-emoji">'+c.emoji+'</span>' +
        '<span class="tf-level-label">'+c.label+'</span>' +
        '<span class="tf-level-sub">'+c.sub+'</span>' +
      '</button>';
    }).join('') +
    '<button class="tf-back-level-btn" onclick="try{if(typeof gtag===\'function\')gtag(\'event\',\'tone_finder_alpha_back_to_level\',{category:\'game\'});}catch(e){}TF.reset()">← 返回選擇等級</button>' +
  '</div>';
}

function stepAlphaConsonant() {
  var btns = [
    {label:'中子音', sub:ALPHA.consonant.mid.sub,  fn:"TF.startFlashcards('mid')"},
    {label:'高子音', sub:ALPHA.consonant.high.sub, fn:"TF.startFlashcards('high')"},
    {label:'低子音', sub:ALPHA.consonant.low.sub,  fn:"TF.startFlashcards('low')"},
    {label:'遺忘版', sub:'三類少用字母混合複習', fn:"TF.startFlashcards('forgot')"}
  ];
  return '<div class="tf-level-select tf-alpha-surface">' +
    '<div class="tf-level-title">子音 — 選擇分類</div>' +
    btns.map(function(b){
      return '<button class="tf-level-btn" onclick="try{if(typeof gtag===\'function\')gtag(\'event\',\'tone_finder_alpha_subcat_select\',{category:\'game\',subcat:\''+b.label+'\'});}catch(e){}'+b.fn+'">' +
        '<span class="tf-level-label">'+b.label+'</span>' +
        '<span class="tf-level-sub">'+b.sub+'</span>' +
      '</button>';
    }).join('') +
    '<button class="tf-back-level-btn" onclick="try{if(typeof gtag===\'function\')gtag(\'event\',\'tone_finder_alpha_back_to_home\',{category:\'game\'});}catch(e){}TF.openAlpha()">← 返回字母練習區</button>' +
  '</div>';
}

function stepAlphaVowel() {
  var btns = [
    {label:'短母音', sub:'6 個', fn:"TF.startFlashcards('v_short')"},
    {label:'長母音', sub:'15 個', fn:"TF.startFlashcards('v_long')"},
    {label:'全部混合', sub:'短母音＋長母音', fn:"TF.startFlashcards('v_all')"}
  ];
  return '<div class="tf-level-select tf-alpha-surface">' +
    '<div class="tf-level-title">母音 — 選擇分類</div>' +
    btns.map(function(b){
      return '<button class="tf-level-btn" onclick="try{if(typeof gtag===\'function\')gtag(\'event\',\'tone_finder_alpha_subcat_select\',{category:\'game\',subcat:\''+b.label+'\'});}catch(e){}'+b.fn+'">' +
        '<span class="tf-level-label">'+b.label+'</span>' +
        '<span class="tf-level-sub">'+b.sub+'</span>' +
      '</button>';
    }).join('') +
    '<button class="tf-back-level-btn" onclick="try{if(typeof gtag===\'function\')gtag(\'event\',\'tone_finder_alpha_back_to_home\',{category:\'game\'});}catch(e){}TF.openAlpha()">← 返回字母練習區</button>' +
  '</div>';
}

function stepAlphaFlashcard() {
  if (!flash || !flash.cards.length) return '';
  var card = flash.cards[flash.order[flash.index]];
  var total = flash.cards.length;
  var backFn = flash.back === 'alpha-consonant' ? 'TF.alphaConsonants()'
             : flash.back === 'alpha-vowel' ? 'TF.alphaVowels()'
             : 'TF.openAlpha()';
  var noteHtml = card.note ? '<div class="afc-note">'+card.note+'</div>' : '';
  var memHtml  = card.mem  ? '<div class="afc-mem">包含字母：'+card.mem+'</div>' : '';
  var isEnding = !!card.exp;
  var actionBtn, expHtml = '';
  if (isEnding) {
    actionBtn = '<button class="afc-audio-btn" onclick="try{if(typeof gtag===\'function\')gtag(\'event\',\'tone_finder_flash_toggle_explanation\',{category:\'game\'});}catch(e){}TF.flashToggleExp()">📖 '+(flash.showExp?'收合發音解釋':'查看發音解釋')+'</button>';
    if (flash.showExp) {
      var e = card.exp;
      expHtml = '<div class="afc-exp">' +
        '<div class="afc-exp-cat">'+e.cat+'</div>' +
        '<div class="afc-exp-row"><span class="afc-exp-k">發音方式</span>'+e.how+'</div>' +
        (e.thai ? '<div class="afc-exp-row"><span class="afc-exp-k">泰文範例</span>'+e.thai+'</div>' : '') +
        (e.zh   ? '<div class="afc-exp-row"><span class="afc-exp-k">中文對應</span>'+e.zh+'</div>' : '') +
      '</div>';
    }
    var frontTap = '點擊翻面看尾音類別';
  } else {
    actionBtn = '<button class="afc-audio-btn" onclick="try{if(typeof gtag===\'function\')gtag(\'event\',\'tone_finder_flash_play_audio\',{category:\'game\'});}catch(e){}TF.flashSpeak()">🔊 播放發音</button>';
    var frontTap = '點擊翻面看注音／拼音';
  }
  return '<div class="tf-level-select tf-alpha-surface">' +
    '<div class="tf-level-title">'+flash.title+'</div>' +
    '<div class="afc-scene">' +
      '<div class="afc-card'+(flash.flipped?' flipped':'')+'" id="afc-card" onclick="try{if(typeof gtag===\'function\')gtag(\'event\',\'tone_finder_flash_flip_click\',{category:\'game\'});}catch(e){}TF.flashFlip()">' +
        '<div class="afc-inner">' +
          '<div class="afc-face afc-front">' +
            '<div class="afc-letter">'+card.ch+'</div>' +
            '<div class="afc-tap">'+frontTap+'</div>' +
          '</div>' +
          '<div class="afc-face afc-back">' +
            (card.zh ? '<div class="afc-zhuyin">'+card.zh+'</div>' : '') +
            '<div class="afc-pinyin">'+(card.py||'—')+'</div>' +
            noteHtml + memHtml +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>' +
    actionBtn +
    expHtml +
    '<div class="afc-controls">' +
      '<button class="afc-nav-btn" onclick="try{if(typeof gtag===\'function\')gtag(\'event\',\'tone_finder_flash_prev\',{category:\'game\'});}catch(e){}TF.flashPrev()">‹ 上一張</button>' +
      '<span class="afc-counter">'+(flash.index+1)+' / '+total+'</span>' +
      '<button class="afc-nav-btn" onclick="try{if(typeof gtag===\'function\')gtag(\'event\',\'tone_finder_flash_next\',{category:\'game\'});}catch(e){}TF.flashNext()">下一張 ›</button>' +
    '</div>' +
    '<button class="tf-cat-btn afc-shuffle" onclick="try{if(typeof gtag===\'function\')gtag(\'event\',\'tone_finder_flash_shuffle\',{category:\'game\'});}catch(e){}TF.flashShuffle()">🔀 隨機順序</button>' +
    '<button class="tf-back-level-btn" onclick="try{if(typeof gtag===\'function\')gtag(\'event\',\'tone_finder_flash_back\',{category:\'game\'});}catch(e){}'+backFn+'">← 返回</button>' +
  '</div>';
}

function stepLevelSelect() {
  // Lin 2026-07-10: เดิมหน้านี้มีปุ่ม 字母練習區/初級/中級/高級/自行搜尋 เรียงเป็น list
  // ย้ายปุ่มทั้งหมดขึ้นไปเป็นแถบถาวรเหนือการ์ดแล้ว (tf-tools-row / tf-level-tabs)
  // เหลือแค่ข้อความบอกให้เลือกด้านบน
  return '<div class="tf-level-select" style="text-align:center;padding:36px 10px;color:#a08a5a;font-family:\'Noto Sans TC\',sans-serif;font-size:14px;">⬆️ 選擇上方的等級開始練習</div>';
}

// Lin 2026-07-10: แบนเนอร์ "มีคำใหม่" กับ "เล่นฟรี/登入解鎖" ย้ายมาโชว์ถาวรเหนือ tf-tools-row
// (เดิมอยู่ใน stepLevelSelect ที่โผล่เฉพาะตอน step==='level-select' เท่านั้น) — เรียกจาก render() ทุกครั้ง
function tfRenderTopBanners() {
  var nb = document.getElementById('tf-newword-banner');
  var cb = document.getElementById('rg-cta-login');
  if (!nb || !cb) return;
  var _loggedIn = !!(window.READING_AUTH && READING_AUTH.user);
  function _newN(level){ try { return (window.GAME_ACCOUNT) ? GAME_ACCOUNT.newWordsCount('tone', level, tfLevelWordCount(level)) : 0; } catch(e){ return 0; } }
  var _newTotal = _newN(1)+_newN(2)+_newN(3);
  nb.innerHTML = _newTotal>0 ? '<div style="background:#fdecea;border:1px solid #e24b4a;border-radius:10px;padding:10px 14px;margin:0 0 12px;font-family:\'Noto Sans TC\',sans-serif;font-size:13.5px;color:#a32d2d;text-align:center;font-weight:700;">🆕 有新單字上架囉！快來練習吧 ✨</div>' : '';
  cb.innerHTML = _loggedIn ? '' : (
    '<div style="font-family:\'Noto Sans TC\',sans-serif;box-sizing:border-box;text-align:left;">' +
      '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">' +
        '<span style="font-size:14px;color:#633806;font-weight:700;flex:1;min-width:170px;">登入後米娜才幫你把進度記起來 🌾</span>' +
        '<button onclick="try{if(typeof gtag===\'function\')gtag(\'event\',\'tone_finder_top_banner_login_click\',{category:\'game\'});}catch(e){}tfCtaLogin()" style="background:#BA7517;color:#fff;border:none;font-weight:700;padding:6px 16px;border-radius:8px;font-size:13px;cursor:pointer;">登入解鎖 →</button>' +
        '<button onclick="try{if(typeof gtag===\'function\')gtag(\'event\',\'tone_finder_top_banner_detail_toggle\',{category:\'game\'});}catch(e){}var d=document.getElementById(\'tf-cta-detail\');var s=d.style.display===\'none\';d.style.display=s?\'block\':\'none\';this.textContent=s?\'收起 ▲\':\'更多福利 ▾\';" style="background:transparent;border:none;color:#854F0B;font-size:13px;cursor:pointer;font-weight:700;">更多福利 ▾</button>' +
      '</div>' +
      '<div id="tf-cta-detail" style="display:none;margin-top:10px;border-top:0.5px solid #EF9F27;padding-top:10px;font-size:13px;color:#633806;line-height:1.8;">' +
        '✅ 登入後可以：<br>🔥 保留每天完成練習的連續紀錄<br>🧠 智慧複習：記住你哪些字學會了、哪些還要練，到期自動幫你排進來<br>🏆 登上排行榜和大家一起比<br>📈 下次打開，直接讓你學習你的弱點' +
      '</div>' +
    '</div>');
}

// Lin 2026-07-10: ไฮไลต์แคปซูล 初級/中級/高級 ให้ตรงกับ selectedLevel ปัจจุบัน — เรียกจาก render() ทุกครั้ง
function tfSyncLevelTabs() {
  ['1','2','3'].forEach(function(n){
    var b = document.getElementById('tf-ltab-'+n);
    if (b) b.classList.toggle('active', String(selectedLevel) === n);
  });
}

// Lin 2026-07-04: ตัด WORD_SETS/getSets ทิ้งแล้ว — ใช้แค่กับหน้าเลือกชุด/หมวดที่ลบไปแล้ว ไม่มีทางเข้าถึงอีก
// Lin 2026-07-10: ลบระบบ "เล่นฟรี N รอบแล้วบังคับล็อกอิน" ทิ้งทั้งหมด (TF_FREE_ROUNDS_LIMIT/tfFreeRoundsUsed/tfBumpFreeRounds/tfFreeRoundsLeft)
// เพราะ requireLogin=false ใน supabase-config.js มาตลอด → โค้ดนี้ไม่เคยทำงานจริง เกมเสียงเล่นฟรีไม่จำกัดเหมือนเกมอื่นทุกเกม

// ── Analytics 2026-07-23: ยิง start ครั้งเดียวต่อ session ตอนผู้เล่นตอบข้อแรกจริง (นับ "คนเล่นจริง" ไม่ใช่ pageview) ──
function tfFireStartOnce() {
  if (session && !session.startFired) {
    session.startFired = true;
    try { gtag('event','tone_finder_start',{category:'game',mode: selectedCategory || 'ทั้งหมด'}); } catch(e){}
    try { if (window.gtag) gtag('event','game_start',{category:'game',game:'tone_finder'}); } catch(e){}
  }
}

// ── E3 (2026-08-10): Guest-only local resume (window.GameResume ใน shared.js) ──
// เก็บ "level + รายชื่อคำ/ประโยคที่กำลังเล่นอยู่ + ทำไปถึงข้อไหน" ไว้ให้ guest กลับมาเล่นต่อได้หลัง refresh/ปิดแท็บ
// ระดับความละเอียด: "เล่นชุดคำ/ประโยคเดิมซ้ำตั้งแต่ต้น" (ไม่ replay กลางพยางค์/คะแนนสะสมกลางรอบ — ดูรายละเอียดในรายงานที่ส่งให้ orchestrator)
// ไม่เกี่ยวกับ SRS/ดาว/แบดจ์/Free-account resume ฝั่งเซิร์ฟเวอร์ใดๆ ทั้งสิ้น
function tfResumeWordId(entry) { if(selectedLevel===3){if(!entry||!entry.word)throw new Error('CATALOG_AUTHORITY_INCOMPLETE:sentence word');return entry.word;}return tfWordContentKey(entry); }
function tfFindEntryByResumeId(id) {
  if (typeof id !== 'string' || !id || id.trim() !== id) return null;
  for (var i = 0; i < WORD_LIST.length; i++) {
    if (WORD_LIST[i].contentKey === id) return WORD_LIST[i];
  }
  return null;
}
function tfResolveResumeEntries(ids, level) {
  if (!Array.isArray(ids) || !ids.length) return null;
  var entries = ids.map(tfFindEntryByResumeId);
  if (entries.some(function(entry){ return !entry || tfWordLevel(entry) !== level; })) return null;
  return entries;
}
function tfResumeSentenceIndex(data) {
  if (!data || data.level !== 3 || typeof data.sentenceId !== 'string' || !data.sentenceId || data.sentenceId.trim() !== data.sentenceId) return null;
  if (!Array.isArray(data.wordIds) || !data.wordIds.length || !window.ADV_SENTENCES) return null;
  var matches=[];
  for(var i=0;i<ADV_SENTENCES.length;i++)if(ADV_SENTENCES[i]&&ADV_SENTENCES[i].th===data.sentenceId)matches.push(i);
  if(matches.length!==1)return null;
  var sentence=ADV_SENTENCES[matches[0]];
  if(!Array.isArray(sentence.words)||sentence.words.length!==data.wordIds.length)return null;
  for(var j=0;j<sentence.words.length;j++){
    if(!sentence.words[j]||sentence.words[j].th!==data.wordIds[j])return null;
  }
  return matches[0];
}
function tfSaveResumeState() {
  try {
    if (!window.GameResume || !session || !session.words || !session.words.length) return;
    GameResume.save('tone-finder', {
      level: selectedLevel,
      wordIds: session.words.map(tfResumeWordId),
      index: session.index,
      total: session.words.length,
      sentenceId: (selectedLevel === 3 && advSentIdx >= 0 && ADV_SENTENCES[advSentIdx]) ? ADV_SENTENCES[advSentIdx].th : null,
      results: session.results || [],
      score: session.score || 0,
      combo: session.combo || 0,
      maxCombo: session.maxCombo || 0,
      hardStarsEarned: session.hardStarsEarned || 0,
      report: roundReport && window.RoundReport ? RoundReport.snapshot(roundReport) : null
    });
  } catch (e) {}
}
function tfClearResumeState() {
  try { if (window.GameResume) GameResume.clear('tone-finder'); } catch (e) {}
}
// เก็บ snapshot ที่อ่านได้ตอนโหลดหน้า (ก่อนที่ auto-start ระดับ 1 จะเขียนทับ localStorage) ไว้ให้ปุ่ม 繼續練習 ใช้
var __tfResumeSnapshot = null;
function tfResumeLevelLabel(level) {
  return ({1:'初級',2:'中級',3:'高級'})[level] || '練習';
}
function tfHideResumeBanner() {
  var el = document.getElementById('tf-resume-banner');
  if (el) { el.style.display = 'none'; el.innerHTML = ''; }
  __tfResumeSnapshot = null;
}
// เรียกครั้งเดียวตอนท้ายไฟล์ (หลัง TF.selectLevel(1) auto-start) — โชว์แถบชวนกลับไปเล่นชุดเดิมถ้ามีของค้างจริง
function tfShowResumeBannerIfAny(data) {
  try {
    if (!data || !data.wordIds || !data.wordIds.length) return;
    var total = data.total || data.wordIds.length;
    if (!total) return;
    var done = Math.min(data.index || 0, total);
    if (done >= total) return; // เล่นครบชุดไปแล้วก่อนปิดหน้า ไม่ต้องเสนอ resume (ปกติ tfGoToSummary จะ clear ไปแล้วอยู่แล้ว กันเหนียวอีกชั้น)
    // ข้อมูลเก่าเกิน 3 วัน — ไม่ยัดเยียดของเก่าเกินไปให้ผู้เล่น
    if (data._savedAt && (Date.now() - data._savedAt) > (3 * 24 * 60 * 60 * 1000)) { tfClearResumeState(); return; }
    var el = document.getElementById('tf-resume-banner');
    if (!el) return;
    var lvl = tfResumeLevelLabel(data.level);
    var progress = '第 ' + (done + 1) + ' / ' + total + (data.level === 3 ? ' 句' : ' 字');
    var resumeCopy = window.GameUiCopy.resume;
    el.innerHTML =
      '<div class="gsh-resume-title">上次的安全進度還在</div>' +
      '<div class="gsh-resume-detail">' + GameUiCopy.resumeLine('聲調練習', lvl, progress) + '</div>' +
      '<div class="gsh-resume-actions">' +
        '<button type="button" class="gsh-resume-continue" onclick="TF.resumeSavedSession()">' + resumeCopy.continueAction + '</button>' +
        '<button type="button" class="gsh-resume-restart" onclick="TF.restartSavedSession()">' + resumeCopy.restartAction + '</button>' +
        '<button type="button" class="gsh-resume-new" onclick="TF.startNewFromResume()">' + resumeCopy.newAction + '</button>' +
      '</div>';
    el.style.display = 'block';
    __tfResumeSnapshot = data;
    try { if (typeof gtag === 'function') gtag('event','tone_finder_resume_shown',{category:'game'}); } catch (e) {}
  } catch (e) {}
}

function tfRestoreSavedProgress(data) {
  if (!session || !data) return;
  var idx = Math.min(Math.max(0, Number(data.index) || 0), Math.max(0, session.words.length - 1));
  session.index = idx;
  session.results = Array.isArray(data.results) ? data.results : [];
  session.score = Number(data.score) || 0;
  session.combo = Number(data.combo) || 0;
  session.maxCombo = Number(data.maxCombo) || 0;
  session.hardStarsEarned = Number(data.hardStarsEarned) || 0;
  roundReport = window.RoundReport ? RoundReport.restore(data.report,{game_type:'tone',difficulty:({1:'初',2:'中',3:'高'})[selectedLevel]||'初',mode:selectedCategory||'全部'}) : null;
  if(window.LearningReview)LearningReview.prime({game:'tone',level:selectedLevel||1,playSetSize:selectedLevel===3?1:5}).then(tfRegisterRestoredReview);
  hist = []; histPos = -1;
  tfSetupNextWord();
  tfSaveResumeState();
}

function startSetSession(words, opts) {
  // Lin 2026-07-30: เดิมล้าง advSentenceCtx แบบไม่มีเงื่อนไขทุกครั้ง → ตอน TF.startAdvSentence เรียกฟังก์ชันนี้ (ซึ่งเรียก render() ข้างในตั้งแต่บรรทัดท้ายฟังก์ชัน)
  // แล้วค่อยตั้ง advSentenceCtx ใหม่ "หลัง" ฟังก์ชันนี้ return กลับไป ทำให้ render() รอบแรก (คำแรกของประโยค高級) เห็น advSentenceCtx เป็น null ก่อนเสมอ
  // → ประโยคเต็มไม่โชว์ตั้งแต่คำแรก (โชว์แค่คำเดียว) ตามที่ Lin แจ้ง — แก้โดยให้ TF.startAdvSentence ตั้ง advSentenceCtx "ก่อน" เรียกฟังก์ชันนี้ พร้อมส่ง opts.isAdvSentence=true มากันไม่ให้บรรทัดนี้ล้างทับ
  if (!(opts && opts.isAdvSentence)) advSentenceCtx = null; // ล้าง context ประโยค 高級 ทุกครั้งที่เริ่ม session ใหม่ที่ "ไม่ใช่" ประโยค高級 (กันของเก่าจากรอบก่อนค้าง)
  var entries = words.map(function(wd){
    if (wd && typeof wd === 'object') return wd; // 高級句子: ส่ง entry object มาตรงๆ (ข้าม lookup WORD_LIST) — Lin 2026-07-03
    for (var i = 0; i < WORD_LIST.length; i++) if (WORD_LIST[i].word === wd) return WORD_LIST[i];
    return null;
  }).filter(Boolean);
  if (!entries.length) return;
  if (!(opts && opts.keepOrder)) {
    entries = entries.slice().sort(function(){ return Math.random() - 0.5; });  // สุ่มลำดับใหม่ทุกครั้ง (高級句子 ข้ามขั้นนี้ ต้องเรียงตามประโยคจริง)
  }
  // SRS quota ordering is decided before this function. Do not regroup Due here,
  // because the shared allocator deliberately spreads review items through a round.
  session = {
    words: entries, index: 0, results: [], currentWordMistakes: 0, currentWordDeduct: 0, stepWrong: false, stepFreePeekUsed: false,
    // ── สเตจ 1: ฟิลด์คะแนน ──
    score: 0, combo: 0,
    currentWordDeduction: 0, currentWordScored: false,
    currentWordFirstTry: false, currentWordScore: 0,
    currentWordGuideUsed: !!tfGuideMode,
    currentWordGuideIntroPending: false,
    sessionScored: false,
    submissionLinked: false,
    // ── สเตจ 2 + หลายพยางค์ ──
    curWordAllFirstTry: true, scoredSyls: {},
    currentWordGolden: tfRollGolden(),
    // ── สเปก 2026-07-03: ดาวเงินที่ได้จริงรอบนี้ (สะสมจากคำที่ mastered ระหว่างเล่น) ──
    hardStarsEarned: 0,
    // ── Analytics 2026-07-23: ยิง tone_finder_start ตอนผู้เล่น "ตอบข้อแรกจริง" เท่านั้น (ไม่ใช่ตอนโหลดหน้า) — กัน start นับ pageview ──
    startFired: false
  };
  roundReport = window.RoundReport ? RoundReport.create({game_type:'tone',difficulty:({1:'初',2:'中',3:'高'})[selectedLevel]||'初',mode:selectedCategory||'全部'}) : null;
  hist = []; histPos = -1;
  tfSetupSrsFlagsForCurrentWord();   // เช็กรอบตัดสิน Day 7 สำหรับคำแรกของ session
  session.currentWordGuideIntroPending = !!tfGuideMode && !tfCurWordNoTools();
  var entry = entries[0]; randomEntry = entry; var w = entry.word;
  // Lin 2026-07-14: คำหลายพยางค์ ไม่มีหน้าเลือกพยางค์เองแล้ว → เริ่มพยางค์ที่ 1 ตรงเลย
  if (entry.readingTH && entry.readingTH.indexOf('-') !== -1) {
    var _syls1 = entry.readingTH.split('-');
    S = { word:_syls1[0], step:'session-guess', path:[_syls1[0]], tone:null, syllables:_syls1, selectedSyl:0, sylResults:{}, parentWord:w };
  } else {
    S = { word:w, step:'session-guess', path:[w], tone:null };
  }
  hist.push(S); histPos = 0;
  tfSaveResumeState(); // E3: บันทึก resume ทุกครั้งที่เริ่ม session ใหม่ (ทับของเก่าเสมอ — 1 session ล่าสุดต่อเกม)
  render();
  if (!session.currentWordGuideIntroPending) {
    try { window.dispatchEvent(new CustomEvent('gsh:question-start')); } catch (e) {}
  }
  // น้องมีนาทักทายตอนเริ่มเล่น (เฉพาะรอบแรกของหน้า กันทักซ้ำทุกชุด) — Lin 2026-07-10
  if (!window._tfMinaWelcomed) { window._tfMinaWelcomed = true; setTimeout(function () { tfMinaToast('welcome', { dur: 3400 }); }, 700); }
}

// ── สเปก 2026-07-03 ข้อ 3: จัดลำดับ entries ให้คำที่ครบกำหนดทบทวน SRS ("due") มาก่อน ──
// ไม่ยุ่งกับการเลือกคำ 75/25 เดิม (tfBuildAllMix) แค่จัดลำดับ "ก่อน-หลัง" ในชุดที่เลือกมาแล้ว
function tfPrioritizeDueSrs(entries) {
  var now = Date.now();
  var due = [], notDue = [];
  entries.forEach(function (e) {
    var rec = tfGetSrsRecord(e, selectedLevel);
    if (rec && !rec.mastered && TF_SRS.isDue(rec, now)) due.push(e);
    else notDue.push(e);
  });
  return due.length ? due.concat(notDue) : entries;
}

// Lin 2026-07-04: ตัด stepNounSubcat/stepSetSelect/stepCatSelect ทิ้งแล้ว — หน้าเลือกหมวด/ชุดไม่มีทางเข้าถึงอีก
// Lin 2026-07-25: ปิดโหมด 自行搜尋 ถาวรตามที่ Lin สั่ง (ไม่ใช้แล้ว) — ลบทั้งระบบออก  [stepInput()]
// ════════════════════════════════════════════════════════════
// NEW PAGE 1: SESSION GUESS  (before tone-inflection)
// ════════════════════════════════════════════════════════════
function stepSessionGuess() {
  if (!session) throw new Error('CATALOG_AUTHORITY_UNAVAILABLE:no active session');
  var entry = session.words[session.index];
  if (tfGuideMode && session.currentWordGuideIntroPending && !tfCurWordNoTools()) {
    return '<div style="text-align:center;padding:18px 0 14px;">' +
      '<button type="button" id="tf-guide-start-btn" class="sg-dontknow-btn" onclick="TF.startGuidedQuestion()">查看已審核答案</button>' +
    '</div>';
  }
  // Lin 2026-07-25: ลบแถบปุ่ม 泰文讀音/英文讀音 ในหน้าเดาวรรณยุกต์ทิ้ง — ย้ายไปใช้สวิตช์ในเมนู 🍚 (ปุ่มขวา) ที่เดียว

  // Tone guess buttons
  var toneColors = ['#6cb8ff','#7ec87e','#ff7c7c','#ffb347','#c39bff'];
  var toneBtns = [1,2,3,4,5].map(function(n) {
    var c = toneColors[n-1];
    var captureN = n;
    var clickAct = act(function(){
      tfFireStartOnce();  // Analytics 2026-07-23: ตอบข้อแรก = เริ่มเล่นจริง
      session.initialGuess = captureN;
      session.currentWordToneAttempts = session.currentWordToneAttempts || [];
      session.currentWordToneAttempts.push({answer:TONES[captureN]?TONES[captureN].zh:String(captureN),is_correct:captureN===catalogToneNumber(),syllable:tfCurWordIsMulti()?(S.selectedSyl+1):1});
      try { session.curWordGuesses = session.curWordGuesses || {}; session.curWordGuesses[tfCurWordIsMulti() ? S.selectedSyl : 0] = captureN; } catch(e){}  // Phase 4: จำคำเดารายพยางค์
      // เทียบกับ toneNumber ที่คัดลอกจาก canonical record โดยตรง
      var correctTone = catalogToneNumber();
      if (correctTone && captureN === correctTone) {
        S.tone = correctTone;                            // สำเนาค่าตรงจากคลังสำหรับสถานะหน้าจอเท่านั้น
        if (session && session.curWordWrongGuess) { tfForceRevealZero(); return; }
        tfScoreFirstTry();
        goToResult(captureN);
      } else {
        // Lin 2026-08-26: เดาเสียงผิดต้องนับผิด 1 ครั้งและลดบันไดคะแนนทันที
        // ปุ่ม 不確定 ไม่สร้างคำตอบใหม่และเผยค่าจากคลังโดยตรง
        if (session) {
          session.curWordWrongGuess = true;
          if (!entry.isParticle) session.combo = 0;
          if (tfCurWordIsMulti()) session.curWordAllFirstTry = false;
          if (!entry.isParticle) {
            recordMistake(TONES[captureN] ? TONES[captureN].zh : String(captureN), '聲調選擇錯誤');
            TF_WORDSCORE.onWrong(session);
            TF_WORDSCORE.onNextStep(session);
          }
          tfUpdateWordScoreGauge();
        }
        // No second judge is allowed. Wrong answers reveal the reviewed catalog answer directly.
        tfForceRevealZero();
      }
    });
    return '<button class="sg-tone-btn" style="border-color:'+c+';color:'+c+';" onclick="try{if(typeof gtag===\'function\')gtag(\'event\',\'tone_finder_tone_choice_click\',{category:\'game\',tone:'+n+'});}catch(e){}'+clickAct+'">'+n+'</button>';
  }).join('');

  var dontKnowAct = act(function(){
    tfFireStartOnce();  // Analytics 2026-07-23: กด "ไม่มั่นใจ" ข้อแรกก็นับว่าเริ่มเล่นจริง
    session.initialGuess = 0;
    session.currentWordToneAttempts = session.currentWordToneAttempts || [];
    session.currentWordToneAttempts.push({answer:'不確定',is_correct:false,syllable:tfCurWordIsMulti()?(S.selectedSyl+1):1});
    try { session.curWordGuesses = session.curWordGuesses || {}; session.curWordGuesses[tfCurWordIsMulti() ? S.selectedSyl : 0] = 0; } catch(e){}  // Phase 4: จำ "ไม่มั่นใจ" รายพยางค์
    if (session) { session.curWordWrongGuess = true; if (!tfCurWordIsParticle()) session.combo = 0; }
    tfForceRevealZero();
  });

  // รอบตัดสิน Day 7 ไม่มีตัวเลือก "ไม่มั่นใจ/ท้าทาย" — มีเพียงคำตอบเสียงวรรณยุกต์ 5 ปุ่ม
  // ผิด/ไม่รู้ = แสดงคำตอบที่ตรวจแล้วทันที ไม่มีกรรมการหรือทางอนุมานอีกชุด
  var dontKnowHtml;
  if (session.curWordIsKnownCheck) {
    dontKnowHtml = '<div style="margin-top:8px;font-size:12px;color:#B07D00;">✓ 記憶確認 — 答對一次即可移除這個字（不給獎勵）· 禁止使用任何輔助工具，只能憑記憶作答一次</div>';
  } else if (session.curWordIsFinalSrsCheck) {
    dontKnowHtml = '<div style="margin-top:8px;font-size:12px;color:#B07D00;">🔒 最終確認 (Day 7) — 禁止使用任何輔助工具，完全憑記憶作答</div>';
  } else {
    dontKnowHtml = '<button class="sg-dontknow-btn" onclick="try{if(typeof gtag===\'function\')gtag(\'event\',\'tone_finder_dontknow_click\',{category:\'game\'});}catch(e){}'+dontKnowAct+'">'+(tfMobileLandscape() ? '不確定' : '🤷 我不太確定 / 我想挑戰')+'</button>';
  }

  return '<div style="text-align:center;padding:4px 0 8px;">'+
    '<div class="sg-divider"></div>'+
    (tfMobileLandscape() ? '' : '<div class="sg-question">你覺得這個字是第幾聲？</div>')+
    '<div class="sg-tone-grid">'+toneBtns+'</div>'+
    (tfTouchMobileSurface() ? '' : '<div style="font-family:\'Noto Sans TC\',sans-serif;font-size:11px;color:#a08a5a;margin-top:4px;">💡 電腦也可以直接按鍵盤 1–5</div>')+
    dontKnowHtml+
  '</div>';
}

// Lin 2026-07-25: ลบหน้า PRE-RESULT CONFIRM (「分析完之後，你還是覺得是同一個聲調嗎？」) ทิ้งทั้งหน้า — โค้ดตาย
//   เกมเปลี่ยนเป็น "ถามวรรณยุกต์ครั้งเดียวก่อนเล่น" ตั้งแต่ 2026-06-18 แล้ว ไม่มีทางไหนพามาหน้านี้อีกเลย

function goToResult(finalAnswer) {
  if (session) session.finalAnswer = finalAnswer;
  hist = hist.slice(0, histPos+1);
  var tone = catalogToneNumber();
  // รักษา parentWord เพื่อให้คำหลายพยางค์อ้างระเบียนเดิมครบ
  //   ผลคือพอตอบพยางค์ 1 ถูก → เข้าหน้าเฉลย → กด "ต่อ" ไปพยางค์ 2 (TF.nextSyllable()) → S.parentWord หายไปแล้ว
  //   nextSyllable() เลย fallback ไปต่อคำจาก S.syllables (คำอ่านจาก readingTH) แทน = แบนเนอร์คำเต็มด้านบนโชว์ "ขอบคุน" ผิด แทน "ขอบคุณ"
  S = { word: S.word, step: 'result', path: S.path.slice(), tone: tone, syllables: S.syllables, selectedSyl: S.selectedSyl, sylResults: S.sylResults, parentWord: S.parentWord };
  hist.push({ step: 'result', path: S.path.slice(), tone: tone, syllables: S.syllables, selectedSyl: S.selectedSyl, sylResults: S.sylResults, parentWord: S.parentWord });
  histPos = hist.length - 1;
  render();
}

// ── RESULT ──
function stepResult() {
  var reviewedTone = catalogToneNumber();
  var t = TONES[reviewedTone];
  if (!t) return '';

  // Analysis path
  var pathHtml = S.path.map(function(p,i){
    return (i>0?'<span class="tf-result-path-sep">›</span>':'')+
      '<span class="tf-result-path-item">'+p+'</span>';
  }).join('');

  // Lin 2026-07-14: คำหลายพยางค์ ไหลอัตโนมัติทีละพยางค์ตามลำดับ (ไม่มีหน้าเลือกพยางค์เอง/ไม่มี回到音節總覽 อีกแล้ว)
  //   ยังไม่ใช่พยางค์สุดท้าย → 下一個音節 (ไปพยางค์ถัดไปของคำเดิม) · พยางค์สุดท้าย → 太棒了 (โชว์สรุปทุกพยางค์ก่อนไปคำใหม่จริง)
  var isMultiSyl = S.syllables && S.syllables.length > 1 && S.selectedSyl != null;
  var isLastSyl = !isMultiSyl || (S.selectedSyl + 1 >= S.syllables.length);

  // S.syllables/S.word เป็นสถานะการนำทางของหน้าจอเท่านั้น ไม่ใช่แหล่งคำตอบภาษา
  // ตัวสะกดและคำตอบทุกช่องต้องอ่านตรงจาก entry.syls ที่ฉายมาจากคลังกลาง
  var _curEntryForDisp = tfCurEntry();
  var _entrySylsForDisp = (_curEntryForDisp && _curEntryForDisp.syls && S.syllables && _curEntryForDisp.syls.length === S.syllables.length) ? _curEntryForDisp.syls : null;
  function tfDispSyl(i) {
    if (!_entrySylsForDisp || !_entrySylsForDisp[i] || !_entrySylsForDisp[i].th) throw new Error('CATALOG_AUTHORITY_INCOMPLETE:display syllable');
    return _entrySylsForDisp[i].th;
  }
  var dispWord = isMultiSyl ? tfDispSyl(S.selectedSyl) : S.word;

  // ── Session block ──
  // สีกรอบ/ป้ายวรรณยุกต์ในการ์ดผลลัพธ์บอกถูก-ผิดอยู่แล้ว
  var sessionBlock = '';
  if (session) {
    var initialGuess = session.initialGuess;
    var igTone = initialGuess && initialGuess !== 0 ? TONES[initialGuess] : null;
    var igLabel = initialGuess === 0 ? '不確定' : (igTone ? igTone.zh : '—');
    var guessRow = (tfDesktopOrPortrait() && initialGuess == null) ? '' : '<div style="margin-bottom:8px;">'+
      '<span class="result-v2-guess-label" style="margin-right:5px;">你的選擇</span>'+
      '<span class="result-v2-guess-val" style="color:'+(igTone ? igTone.color : '#aaa')+';">'+igLabel+'</span>'+
    '</div>';

    // Lin 2026-07-25: ตัดแถบ 中文／泰文讀音／英文拼音 ออก — ย้ายไปใช้สวิตช์ในเมนู 🍚 (翻譯 / 讀音 / 英文讀音)
    //   ที่โชว์ใต้คำศัพท์แทน (ดูบล็อกใต้ .result-v2-word ท้ายฟังก์ชันนี้) — ไม่โชว์ซ้ำ 2 ที่

    // Breakdown
    // Lin 2026-07-30 (รอบ 2): เปลี่ยนตารางเก่า (起首子音/母音/尾音) → กล่องแถวเฉลยรูปแบบกลางเดียวกับเกมอ่าน/เกมพิมพ์
    //   (前引字→子音→連音→母音→尾音→消音→聲調符 + ลูกศรเสียงจากฟิลด์ที่ Lin ตรวจ 100% — ห้ามคำนวณเอง)
    //   เทียบข้อมูลคลังไม่ได้ = ไม่โชว์ส่วนแตกตัวอักษรเลย ดีกว่าโชว์ผิด (ยกเลิก fallback getBreakdown เดิม)
    // Lin 2026-07-31: คำหลายพยางค์ — ไม่โชว์ 音節拆解 ทีละพยางค์อีกต่อไป รอไปรวมโชว์ทุกพยางค์พร้อมกันตอนหน้าพยางค์สุดท้าย (ดู multiSummaryHtml ด้านล่าง)
    var ansHtml = isMultiSyl ? '' : tfAnswerRowsHtml(currentAnswerSyl());

    // D2 (2026-08-10): เดิมโชว์ 音節拆解 อัตโนมัติทุกครั้ง → เปลี่ยนเป็นปุ่ม [ 查看詳細解說 ] แบบ opt-in (.gsh-detail-toggle/.gsh-detail-box ใน shared.css)
    //   ansHtml แสดงค่าจากคลังกลางเท่านั้น แค่ซ่อนไว้ก่อนจนกว่าจะกดดู
    sessionBlock =
      guessRow+
      (ansHtml ? '<div class="result-v2-bd">'+
        '<button type="button" class="gsh-detail-toggle" onclick="TF.toggleAnswerDetail(this)">查看詳細解說</button>'+
        '<div class="gsh-detail-box" style="display:none;">'+
          '<div class="result-v2-bd-title">音節拆解</div>'+
          '<div class="tf-ans-inner"><div class="tf-ans-rows">'+ansHtml+'</div></div>'+
        '</div>'+
      '</div>' : '');
  }

  var nextBtnLabel, nextBtnOnclick;
  if (isMultiSyl && !isLastSyl) {
    nextBtnLabel = '下一個音節 →';
    nextBtnOnclick = 'TF.nextSyllable()';
  } else {
    nextBtnLabel = session ? '下一題 →' : '分析新單字';
    nextBtnOnclick = 'TF.nextWord()';
  }

  // Lin 2026-07-14: จบพยางค์สุดท้ายของคำหลายพยางค์ → โชว์การ์ดสรุปผลทุกพยางค์ก่อนไปคำใหม่
  // Lin 2026-07-31: ตัดบรรทัด 🎉/💪 ท้ายการ์ดออก (สีกรอบแต่ละพยางค์บอกผลอยู่แล้ว) + เพิ่มเฉลย 音節拆解 รวมทุกพยางค์ไว้ในหน้านี้ที่เดียว
  var multiSummaryHtml = '';
  if (isMultiSyl && isLastSyl) {
    var summaryResults = {};
    for (var _k in (S.sylResults || {})) summaryResults[_k] = S.sylResults[_k];
    summaryResults[S.selectedSyl] = { tone: reviewedTone };
    var sylCardsHtml = S.syllables.map(function(syl, i) {
      var rt = summaryResults[i] ? TONES[summaryResults[i].tone] : null;
      return '<div style="flex:1;background:#fff;border:1.5px solid '+(rt?rt.color:'#ccc')+';border-radius:10px;padding:10px;text-align:center;">'+
        '<div style="font-family:\'Sarabun\',sans-serif;font-size:18px;color:#1C1C1C;">'+tfDispSyl(i, syl)+'</div>'+
        '<div style="font-size:12px;color:'+(rt?rt.color:'#999')+';font-weight:600;margin-top:4px;">'+(rt?'✓ '+rt.zh:'—')+'</div>'+
      '</div>';
    }).join('');
    var allSylAnsHtml = tfAllAnswerRowsHtml();
    // D2 (2026-08-10): เหมือนกับ ansHtml ด้านบน — เปลี่ยนจากโชว์อัตโนมัติเป็นปุ่ม [ 查看詳細解說 ] opt-in
    multiSummaryHtml =
      '<div style="margin-bottom:10px;">'+
        '<div style="font-family:\'Noto Sans TC\',sans-serif;font-size:11px;color:#8B6310;font-weight:600;letter-spacing:2px;margin-bottom:8px;">音節結果</div>'+
        '<div style="display:flex;gap:10px;">'+sylCardsHtml+'</div>'+
        (allSylAnsHtml ? '<div class="result-v2-bd" style="margin-top:10px;">'+
          '<button type="button" class="gsh-detail-toggle" onclick="TF.toggleAnswerDetail(this)">查看詳細解說</button>'+
          '<div class="gsh-detail-box" style="display:none;">'+
            '<div class="result-v2-bd-title">音節拆解</div>'+
            '<div class="tf-ans-inner"><div class="tf-ans-rows">'+allSylAnsHtml+'</div></div>'+
          '</div>'+
        '</div>' : '')+
      '</div>';
  }

  // ปุ่มลำโพงฟังเสียง — ข้างคำศัพท์ โชว์เฉพาะคำที่มีไฟล์เสียง (2026-07-16)
  // Lin 2026-07-30: เอาปุ่ม 🔖 (單字庫) ตรงหน้าเฉลยออกตามที่ Lin สั่ง — ซ้ำกับแถว 單字庫 ในเมนู 🍚 มุมขวาล่าง เหลือที่เมนูที่เดียว
  var audioBtnHtml = (window.WordAudio && dispWord) ? WordAudio.btnHtml(dispWord) : '';
  if (tfMobileLandscape() && dispWord && !audioBtnHtml) {
    var audioWordEsc = String(dispWord).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    audioBtnHtml = '<button type="button" class="word-audio-btn" title="聽發音" aria-label="聽發音" ' +
      'onclick="event.stopPropagation();if(window.WordAudio){if(WordAudio.has(\'' + audioWordEsc + '\')){WordAudio.play(\'' + audioWordEsc + '\',this)}else if(WordAudio.soonToast){WordAudio.soonToast()}}">🔊</button>';
  }
  // Lin 2026-07-30: ปุ่ม 英文讀音 (🔡/🔠) ย้ายจากเมนูมาอยู่ข้างปุ่ม 🔊 ในหน้าเฉลย — ใช้ได้จริงตรงจุดที่คำอ่านโรมันโผล่เท่านั้น
  var enBtnHtml = '<button type="button" id="tf-result-en-btn" class="word-ctl-btn" onclick="event.stopPropagation();try{if(typeof gtag===\'function\')gtag(\'event\',\'tone_finder_toggle_en_reading\',{category:\'game\'});}catch(e){}TF.toggleEn()">' +
    (tfEnMode ? '🔡' : '🔠') + '</button>';

  // Lin 2026-07-12: ย้ายปุ่ม "太棒了/看看成果" ขึ้นมาอยู่เหนือส่วน 音節拆解 (ใน sessionBlock) + เอาปุ่ม "🎲 再來 5 字" ออกจากหน้านี้ (ระหว่างเล่น) เหลือแค่หน้าผลสรุปจบรอบ
  var hintOffBtnHtml = session && tfGuideMode && (!isMultiSyl || isLastSyl)
    ? '<button type="button" class="tf-result-secondary gsh-desktop-hint-off" data-visible="true" onclick="TF.toggleGuide()">關閉提示</button>'
    : '';
  var nextBtnHtml = '<div class="result-v2-actions" style="margin-bottom:10px;">'+
      '<button class="tf-session-next-btn" id="tf-session-next-btn" onclick="try{if(typeof gtag===\'function\')gtag(\'event\',\'tone_finder_result_next_click\',{category:\'game\'});}catch(e){}'+nextBtnOnclick+'">'+nextBtnLabel+'</button>'+
      hintOffBtnHtml+
    '</div>';

  // Lin 2026-07-25: คำแปล/คำอ่าน ใต้คำศัพท์ในหน้าเฉลย — คุมด้วยสวิตช์ในเมนู 🍚 (翻譯 🍙 / 讀音 🐣 / 英文讀音 🔡)
  //   ใช้ class "word-zh" เดียวกับที่อื่น → ปุ่ม 🍙 ของ shared.js คุมได้เองอัตโนมัติ ไม่ต้องต่อสายใหม่
  var _rEntry = tfCurEntry();
  var resultZhHtml = (_rEntry && _rEntry.zh) ? '<div class="word-zh">' + _rEntry.zh + '</div>' : '';
  var resultReadHtml = tfReadingLineHtml();

  return '<div class="result-v2">'+
    '<div class="result-v2-word" style="display:inline-flex;align-items:center;gap:8px;">'+dispWord+audioBtnHtml+enBtnHtml+'</div>'+
    resultReadHtml + resultZhHtml +   // Lin 2026-07-30 (รอบ 2): เรียง 讀音 → 英文讀音 → 翻譯 เหมือนกันทุกเกม (เดิมคำแปลอยู่ก่อนคำอ่าน)

    '<div class="result-v2-tone-card" style="background:'+t.color+'18;border:2px solid '+t.color+'44;">'+
      '<div style="font-family:\'Noto Sans TC\',sans-serif;font-size:10px;letter-spacing:3px;color:'+t.color+'99;margin-bottom:8px;text-transform:uppercase;">聲調分析結果</div>'+
      '<div class="result-v2-tone-num" style="color:'+t.color+';">'+t.zh+'</div>'+
      '<div class="result-v2-tone-match" style="color:'+t.color+'cc;">'+t.match+'</div>'+
    '</div>'+

    nextBtnHtml+

    multiSummaryHtml+

    sessionBlock+

    '<div class="result-v2-path">'+
      '<div class="result-v2-path-label">分析路徑</div>'+
      '<div style="display:flex;flex-wrap:wrap;gap:5px;align-items:center;">'+pathHtml+'</div>'+
    '</div>'+
  '</div>';
}

// ════════════════════════════════════════════════════════════
// POPUPS  (Error + Tip)
// ════════════════════════════════════════════════════════════
function showError(msg) {
  var old = document.getElementById('tf-err');
  if (old) old.remove();
  var div = document.createElement('div');
  div.id = 'tf-err';
  div.className = 'tf-error-overlay';
  div.innerHTML =
    '<div class="tf-error-box">' +
      '<div class="tf-error-title">🤔 好像還不對喔，我們再確認一下</div>' +
      '<div class="tf-error-msg">' + msg.replace(/\n/g,'<br>') + '</div>' +
      '<button class="tf-error-close" onclick="try{if(typeof gtag===\'function\')gtag(\'event\',\'tone_finder_error_close\',{category:\'game\'});}catch(e){}document.getElementById(\'tf-err\').remove()">好，我們再試一次 💪</button>' +
    '</div>';
  document.body.appendChild(div);
}

function showTip(keys) {
  var old = document.getElementById('tf-tip-ov');
  if (old) old.remove();
  var rows = keys.map(function(k){
    var d = DEFS[k];
    if (!d) return '';
    return '<div class="tf-tip-entry">' +
      '<div class="tf-tip-zh">'+d.zh+'</div>' +
      (d.chars ? '<div class="tf-tip-chars">'+d.chars+'</div>' : '') +
      (d.desc  ? '<div class="tf-tip-desc">'+d.desc+'</div>' : '') +
    '</div>';
  }).join('');
  var div = document.createElement('div');
  div.id = 'tf-tip-ov';
  div.className = 'tf-tip-overlay';
  div.onclick = function(e){ if (e.target===div) div.remove(); };
  div.innerHTML =
    '<div class="tf-tip-box">' +
      '<div class="tf-tip-header">' +
        '<span class="tf-tip-header-title" style="color:#000000">說明</span>' +
        '<button class="tf-tip-close-btn" onclick="try{if(typeof gtag===\'function\')gtag(\'event\',\'tone_finder_tip_close\',{category:\'game\'});}catch(e){}document.getElementById(\'tf-tip-ov\').remove()">✕</button>' +
      '</div>' +
      rows +
      '<button class="tf-tip-manual-action" onclick="TF.openManualFromTip(\'' +
        encodeURIComponent(JSON.stringify(keys)) +
      '\')">查看拼音規則手冊 →</button>' +
    '</div>';
  document.body.appendChild(div);
}

// ════════════════════════════════════════════════════════════
// 5.4 字母練習區／泰文拼音規則手冊 — state-preserving Overlay
// This surface reads ALPHA + TF_FLASH_AUDIO only. It never mutates S/session/score/history.
// ════════════════════════════════════════════════════════════
var tfAlphabetOverlay = { view:'home', arg:null, stack:[], details:{} };
var TF_LEAD_AUDIO = {'หน':'น','หม':'ม','หล':'ล','หว':'ว','หย':'ย','หร':'ร','หญ':'ญ','หง':'ง','อย':'ย'};

function tfAlphaButton(label, view, arg) {
  return '<button class="tf-alpha-tab" onclick="TF.alphaOverlayView(\''+view+'\',\''+(arg||'')+'\')">'+label+'</button>';
}

function tfAlphaAudioTile(card, category, spoken) {
  var ch = card.ch || card;
  var audioCh = spoken || ch;
  var read = card.zh ? card.zh + (card.py ? ' · ' + card.py : '') : '';
  return '<button class="tf-alpha-tile" onclick="TF.alphaOverlaySpeak(\''+category+'\',\''+audioCh+'\',this)">' +
    '<span class="tf-alpha-tile-th">'+ch+'</span>' +
    (read ? '<span class="tf-alpha-tile-read">'+read+'</span>' : '') +
    '<span class="tf-alpha-tile-sound">🔊 ฟังเสียง'+(spoken?' ('+spoken+')':'')+'</span>' +
  '</button>';
}

function tfAlphaGroup(title, cards, category) {
  return '<h3 class="tf-alpha-section-title">'+title+'</h3><div class="tf-alpha-tile-grid">' +
    cards.map(function(card){ return tfAlphaAudioTile(card, category); }).join('') + '</div>';
}

function tfAlphaLeadGroup() {
  return '<h3 class="tf-alpha-section-title">前引字</h3><div class="tf-alpha-tile-grid">' +
    Object.keys(TF_LEAD_AUDIO).map(function(ch){ return tfAlphaAudioTile({ch:ch}, 'consonants', TF_LEAD_AUDIO[ch]); }).join('') +
    '</div><div class="tf-alpha-note">前引字使用後方主要子音的老師錄音，例如 หน 使用 น 的聲音。</div>';
}

function tfAlphaConsonants(tab) {
  tab = tab || 'common';
  var C = ALPHA.consonant;
  var tabs = '<div class="tf-alpha-tabs">' +
    '<button class="tf-alpha-tab'+(tab==='common'?' is-active':'')+'" onclick="TF.alphaOverlayReplace(\'consonants\',\'common\')">常用子音</button>' +
    '<button class="tf-alpha-tab'+(tab==='uncommon'?' is-active':'')+'" onclick="TF.alphaOverlayReplace(\'consonants\',\'uncommon\')">少用子音</button>' +
    '<button class="tf-alpha-tab'+(tab==='lead'?' is-active':'')+'" onclick="TF.alphaOverlayReplace(\'consonants\',\'lead\')">前引字</button></div>';
  if (tab === 'lead') return tabs + tfAlphaLeadGroup();
  var key = tab === 'uncommon' ? 'forgot' : 'common';
  var prefix = tab === 'uncommon' ? '少用' : '';
  return tabs +
    tfAlphaGroup(prefix+'中子音', C.mid[key], 'consonants') +
    tfAlphaGroup(prefix+'高子音', C.high[key], 'consonants') +
    tfAlphaGroup(prefix+'低子音', C.low[key], 'consonants');
}

function tfAlphaVowels(tab) {
  tab = tab || 'long';
  var cards = tab === 'short' ? ALPHA.vowel.short : ALPHA.vowel.long;
  return '<div class="tf-alpha-tabs">' +
    '<button class="tf-alpha-tab'+(tab==='long'?' is-active':'')+'" onclick="TF.alphaOverlayReplace(\'vowels\',\'long\')">長母音</button>' +
    '<button class="tf-alpha-tab'+(tab==='short'?' is-active':'')+'" onclick="TF.alphaOverlayReplace(\'vowels\',\'short\')">短母音</button></div>' +
    '<div class="tf-alpha-note">กดสระเพื่อฟังเสียงครู</div>' +
    tfAlphaGroup(tab === 'short' ? '短母音' : '長母音', cards, 'vowels');
}

function tfAlphaEndingCard(ch) {
  for (var i=0; i<ALPHA.ending.length; i++) if (ALPHA.ending[i].ch === ch) return ALPHA.ending[i];
  return null;
}

function tfAlphaEndingRows(kind) {
  var groups = kind === 'dead'
    ? [['ก','ก ข ค ฆ'],['บ','บ ป พ ฟ ภ'],['ด','จ ช ซ ฎ ฏ ฐ ฑ ฒ ด ต ถ ท ธ ศ ษ ส']]
    : [['น','น ณ ญ ร ล ฬ'],['ย','ย'],['ม','ม'],['ง','ง'],['ว','ว']];
  return '<div class="tf-alpha-ending-list">' + groups.map(function(g){
    return '<button class="tf-alpha-ending-btn" onclick="TF.alphaOverlayEndingDetail(\''+g[0]+'\')"><strong>尾音 '+g[0]+'</strong><span>'+g[1]+'</span></button>';
  }).join('') + '</div>';
}

function tfAlphaEndings(kind) {
  kind = kind || 'live';
  var live = kind === 'live';
  return '<div class="tf-alpha-tabs">' +
    '<button class="tf-alpha-tab'+(live?' is-active':'')+'" onclick="TF.alphaOverlayReplace(\'endings\',\'live\')">長尾音・活音</button>' +
    '<button class="tf-alpha-tab'+(!live?' is-active':'')+'" onclick="TF.alphaOverlayReplace(\'endings\',\'dead\')">短尾音・死音</button></div>' +
    '<div class="tf-alpha-note"><b>'+(live?'活音':'死音')+'</b><br>' +
      (live ? '① 有長尾音（น ณ ญ ร ล ฬ ม ย ว ง）收尾<br>② 無尾音但使用長母音' : '① 有短尾音（ก ข ค ฆ บ ป พ ฟ ภ จ ช ซ ฎ ฏ ฐ ฑ ฒ ด ต ถ ท ธ ศ ษ ส）收尾<br>② 無尾音但使用短母音') +
    '</div><h3 class="tf-alpha-section-title">'+(live?'五個尾音群組':'三個尾音群組')+'</h3>' + tfAlphaEndingRows(kind);
}

function tfManualTerm(key, label) {
  return '<button class="tf-manual-term" onclick="TF.alphaOverlayTerm(\''+key+'\')">'+label+'</button>';
}

function tfAlphaManual(context) {
  var open1 = (context === 'rule1' || tfAlphabetOverlay.details.rule1) ? ' open' : '';
  var open2 = (context === 'rule2' || tfAlphabetOverlay.details.rule2) ? ' open' : '';
  var open3 = (context === 'rule3' || tfAlphabetOverlay.details.rule3) ? ' open' : '';
  return '<div class="tf-manual-intro">看到一個泰文字時，先做第一個判斷：</div>' +
    '<div class="tf-manual-question">這個字有沒有聲調符號？</div>' +
    '<section class="tf-manual-rule" id="tf-manual-rule1"><h3>規則 1｜有聲調符號</h3>' +
      '<div class="tf-manual-summary">低子音：聲調往後一個念<br>非低子音：寫什麼，就念什麼。</div>' +
      '<details'+open1+' ontoggle="TF.alphaOverlayDetail(\'rule1\',this.open)"><summary>查看詳細說明</summary><div class="tf-manual-detail-grid">' +
        '<div class="tf-manual-branch"><b>如果是'+tfManualTerm('low','低子音')+'</b><br>'+tfManualTerm('tone2','寫二聲符號')+' → 念三聲<br>'+tfManualTerm('tone3','寫三聲符號')+' → 念四聲</div>' +
        '<div class="tf-manual-branch"><b>如果不是低子音</b><br>包含：'+tfManualTerm('mid','中子音')+'、'+tfManualTerm('high','高子音')+'、'+tfManualTerm('lead','前引字')+'<br>'+tfManualTerm('tone2','寫二聲符號')+' → 念二聲<br>'+tfManualTerm('tone3','寫三聲符號')+' → 念三聲<br>'+tfManualTerm('tone4','寫四聲符號')+' → 念四聲<br>'+tfManualTerm('tone5','寫五聲符號')+' → 念五聲</div>' +
      '</div></details></section>' +
    '<section class="tf-manual-rule is-live" id="tf-manual-rule2"><h3>規則 2｜沒有聲調符號 ＋ '+tfManualTerm('live','活音')+'</h3>' +
      '<div class="tf-manual-summary">子音本身是什麼聲調，這個字就跟著念什麼聲調。</div>' +
      '<details'+open2+' ontoggle="TF.alphaOverlayDetail(\'rule2\',this.open)"><summary>查看詳細說明</summary><div class="tf-manual-detail-grid">' +
        '<div class="tf-manual-branch">'+tfManualTerm('mid','中子音')+' ＋ '+tfManualTerm('low','低子音')+' → <b>一聲</b></div>' +
        '<div class="tf-manual-branch">'+tfManualTerm('high','高子音')+' ＋ '+tfManualTerm('lead','前引字')+' → <b>五聲</b></div>' +
      '</div></details></section>' +
    '<section class="tf-manual-rule is-dead" id="tf-manual-rule3"><h3>規則 3｜沒有聲調符號 ＋ '+tfManualTerm('dead','死音')+'</h3>' +
      '<div class="tf-manual-summary">低子音：長母音→三聲；短母音→四聲<br>非低子音：全部→二聲</div>' +
      '<details'+open3+' ontoggle="TF.alphaOverlayDetail(\'rule3\',this.open)"><summary>查看詳細說明</summary><div class="tf-manual-detail-grid">' +
        '<div class="tf-manual-branch"><b>如果是'+tfManualTerm('low','低子音')+'</b><br>'+tfManualTerm('longVowel','長母音')+' → 三聲<br>'+tfManualTerm('shortVowel','短母音')+' → 四聲</div>' +
        '<div class="tf-manual-branch"><b>如果不是低子音</b><br>包含：'+tfManualTerm('mid','中子音')+'、'+tfManualTerm('high','高子音')+'、'+tfManualTerm('lead','前引字')+'<br><b>全部都是 → 二聲</b></div>' +
      '</div></details></section>';
}

function tfAlphaTermView(key) {
  var C = ALPHA.consonant;
  if (key === 'mid' || key === 'high' || key === 'low') return tfAlphaGroup(C[key].zh+'・常用', C[key].common, 'consonants');
  if (key === 'lead') return tfAlphaLeadGroup();
  if (key === 'longVowel' || key === 'shortVowel') return tfAlphaVowels(key === 'longVowel' ? 'long' : 'short');
  if (key === 'live' || key === 'dead') {
    var live = key === 'live';
    return '<div class="tf-alpha-note"><b>'+(live?'活音':'死音')+'</b><br>先選擇要查看母音或尾音。</div><div class="tf-manual-detail-grid">' +
      '<button class="tf-alpha-menu-card" onclick="TF.alphaOverlayView(\'vowels\',\''+(live?'long':'short')+'\')"><strong>'+(live?'長母音':'短母音')+'</strong><span>'+(live?'沒有尾音時，長母音是活音':'沒有尾音時，短母音是死音')+'</span></button>' +
      '<button class="tf-alpha-menu-card" onclick="TF.alphaOverlayView(\'endings\',\''+(live?'live':'dead')+'\')"><strong>'+(live?'長尾音':'短尾音')+'</strong><span>'+(live?'有尾音時，看五個長尾音群組':'有尾音時，看三個短尾音群組')+'</span></button></div>';
  }
  var active = key || 'tone2';
  var marks = [['tone2','อ่','二聲符號 ่'],['tone3','อ้','三聲符號 ้'],['tone4','อ๊','四聲符號 ๊'],['tone5','อ๋','五聲符號 ๋']];
  return '<div class="tf-alpha-note">聲調符號寫在子音上方。這一區只顯示符號，不製作假錄音。</div><div class="tf-manual-tone-grid">' + marks.map(function(m){
    return '<div class="tf-manual-tone'+(active===m[0]?' is-active':'')+'"><b>'+m[1]+'</b><span>'+m[2]+'</span></div>';
  }).join('') + '</div>';
}

function tfAlphaHome() {
  return '<div class="tf-alpha-menu">' +
    '<button class="tf-alpha-menu-card" onclick="TF.alphaOverlayView(\'manual\')"><strong>泰文拼音規則手冊</strong><span>先看三個判斷規則</span></button>' +
    '<button class="tf-alpha-menu-card" onclick="TF.alphaOverlayView(\'consonants\',\'common\')"><strong>子音練習</strong><span>常用子音、少用子音、前引字</span></button>' +
    '<button class="tf-alpha-menu-card" onclick="TF.alphaOverlayView(\'vowels\',\'long\')"><strong>母音練習</strong><span>長母音、短母音・有老師錄音</span></button>' +
    '<button class="tf-alpha-menu-card" onclick="TF.alphaOverlayView(\'endings\',\'live\')"><strong>尾音練習</strong><span>長尾音、短尾音・活音、死音</span></button>' +
  '</div><p class="tf-alpha-footer-note">全部內容都在同一個視窗內開啟，關閉後回到原題。</p>';
}

function tfAlphaRender() {
  var root = document.getElementById('tf-alpha-overlay');
  if (!root) return;
  var body = root.querySelector('.tf-alpha-overlay-body');
  var title = root.querySelector('.tf-alpha-overlay-title');
  var back = root.querySelector('.tf-alpha-back');
  var view = tfAlphabetOverlay.view, arg = tfAlphabetOverlay.arg;
  var names = {home:'字母練習區',manual:'泰文拼音規則手冊',consonants:'子音練習',vowels:'母音練習',endings:'尾音練習',term:'拼音規則'};
  title.textContent = names[view] || names.home;
  back.hidden = tfAlphabetOverlay.stack.length === 0;
  if (view === 'manual') body.innerHTML = tfAlphaManual(arg);
  else if (view === 'consonants') body.innerHTML = tfAlphaConsonants(arg);
  else if (view === 'vowels') body.innerHTML = tfAlphaVowels(arg);
  else if (view === 'endings') body.innerHTML = tfAlphaEndings(arg);
  else if (view === 'term') body.innerHTML = tfAlphaTermView(arg);
  else body.innerHTML = tfAlphaHome();
  body.scrollTop = 0;
  if (view === 'manual' && /^rule[123]$/.test(arg || '')) {
    var target = document.getElementById('tf-manual-'+arg);
    if (target) target.scrollIntoView({block:'start'});
  }
}

function tfOpenAlphabetOverlay(view, arg) {
  var old = document.getElementById('tf-alpha-overlay');
  if (old) old.remove();
  tfAlphabetOverlay = {view:view||'home', arg:arg||null, stack:[], details:{}};
  var root = document.createElement('div');
  root.id = 'tf-alpha-overlay'; root.className = 'tf-alpha-overlay';
  root.setAttribute('role','dialog'); root.setAttribute('aria-modal','true'); root.setAttribute('aria-label','字母練習區');
  root.onclick = function(e){ if (e.target === root) TF.closeAlphabetOverlay(); };
  root.onkeydown = function(e){ if (e.key === 'Escape') TF.closeAlphabetOverlay(); };
  root.innerHTML = '<section class="tf-alpha-dialog"><header class="tf-alpha-overlay-head">' +
    '<button class="tf-alpha-icon-btn tf-alpha-back" aria-label="返回" onclick="TF.alphaOverlayBack()">←</button>' +
    '<h2 class="tf-alpha-overlay-title"></h2>' +
    '<button class="tf-alpha-icon-btn" aria-label="關閉" onclick="TF.closeAlphabetOverlay()">×</button>' +
    '</header><div class="tf-alpha-overlay-body"></div></section>';
  document.body.appendChild(root);
  TF._alphaPrevOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
  tfAlphaRender();
  root.querySelector('.tf-alpha-icon-btn:last-child').focus();
}

function tfAlphaView(view, arg, replace) {
  if (!replace) tfAlphabetOverlay.stack.push({view:tfAlphabetOverlay.view,arg:tfAlphabetOverlay.arg});
  tfAlphabetOverlay.view = view; tfAlphabetOverlay.arg = arg || null; tfAlphaRender();
}

function tfAlphaContextFromKeys(keys) {
  if (keys.indexOf('toneMark') >= 0 || keys.some(function(k){return /^tone[2-5]$/.test(k);})) return 'rule1';
  if (keys.indexOf('live') >= 0 || keys.indexOf('longEnd') >= 0) return 'rule2';
  if (keys.indexOf('dead') >= 0 || keys.indexOf('longVowel') >= 0 || keys.indexOf('shortVowel') >= 0 || keys.indexOf('shortEnd') >= 0) return 'rule3';
  return null;
}

function showStats() {
  var old = document.getElementById('tf-stats-ov');
  if (old) old.remove();
  var data = loadStats();
  var day = todayStr();
  var entries = data[day] || [];
  var total = entries.length;

  var bodyHtml;
  if (!total) {
    bodyHtml = '<div class="tf-stats-empty">今天還沒有答錯紀錄 🎉</div>';
  } else {
    // ── 詳細紀錄（時間倒序）──
    var entryRows = entries.slice().reverse().map(function(e){
      var stepLabel = STEP_LABELS[e.step] || e.step;
      return '<div class="tf-stats-entry">' +
        '<div class="tf-stats-entry-head">' +
          '<span class="tf-stats-word">'+e.word+'</span>' +
          '<span class="tf-stats-time">'+e.time+'</span>' +
        '</div>' +
        '<div class="tf-stats-step">'+stepLabel+'</div>' +
        '<div class="tf-stats-choice">選了「'+e.choice+'」 → '+e.message.replace(/\n/g,'　') + '</div>' +
      '</div>';
    }).join('');

    bodyHtml =
      '<div class="tf-stats-section"><div class="tf-stats-section-title">詳細紀錄</div></div>' +
      entryRows;
  }

  var div = document.createElement('div');
  div.id = 'tf-stats-ov';
  div.className = 'tf-tip-overlay';
  div.onclick = function(e){ if (e.target===div) div.remove(); };
  div.innerHTML =
    '<div class="tf-tip-box">' +
      '<div class="tf-tip-header">' +
        '<span class="tf-tip-header-title">今日統計</span>' +
        '<button class="tf-tip-close-btn" onclick="try{if(typeof gtag===\'function\')gtag(\'event\',\'tone_finder_stats_close\',{category:\'game\'});}catch(e){}document.getElementById(\'tf-stats-ov\').remove()">✕</button>' +
      '</div>' +
      '<div class="tf-stats-summary">' +
        '<div class="tf-stats-date">'+day+'</div>' +
        '<div class="tf-stats-count">'+total+'<span>次答錯</span></div>' +
      '</div>' +
      bodyHtml +
      (total ? '<div class="tf-stats-action-row">' +
        '<button class="tf-stats-download-btn" onclick="try{if(typeof gtag===\'function\')gtag(\'event\',\'tone_finder_stats_download\',{category:\'game\'});}catch(e){}TF.downloadStats()">💾 下載今日統計</button>' +
        '<button class="tf-stats-clear-btn" onclick="try{if(typeof gtag===\'function\')gtag(\'event\',\'tone_finder_stats_clear\',{category:\'game\'});}catch(e){}TF.clearTodayStats()">清除今日紀錄</button>' +
      '</div>' : '') +
    '</div>';
  document.body.appendChild(div);
}

function clearTodayStats() {
  var data = loadStats();
  delete data[todayStr()];
  saveStats(data);
  // 2026-07-13 Lin: ดัน push ทันที กันสถิติที่เพิ่งลบถูก merge จากเครื่องอื่นกลับมาโผล่ใหม่
  try { if (window.TF_SYNC) window.TF_SYNC.push(); } catch (e) {}
  showStats();
}


function buildStatsReportText(day, entries) {
  var total = entries.length;
  var lines = [];

  lines.push('泰語聲調練習室 － 今日統計報告');
  lines.push('日期：' + day);
  lines.push('今日答錯總數：' + total + ' 次');
  lines.push('');

  lines.push('【詳細紀錄】');
  entries.forEach(function(e){
    var stepLabel = STEP_LABELS[e.step] || e.step;
    lines.push(e.time + ' | ' + e.word + ' | ' + stepLabel + ' | 選了「' + e.choice + '」 → ' + e.message.replace(/\n/g, ' '));
  });

  return lines.join('\n');
}

function downloadStats() {
  var data = loadStats();
  var day = todayStr();
  var entries = data[day] || [];
  var text = buildStatsReportText(day, entries);
  var blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = '泰語聲調練習室_今日統計_' + day + '.txt';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(function(){ URL.revokeObjectURL(url); }, 1000);
}

// ════════════════════════════════════════════════════════════
// PUBLIC API
// ════════════════════════════════════════════════════════════
// ── เตือนออกเกมกลางคัน: คะแนนนับเฉพาะตอนเล่นจบรอบ ออกกลางคัน = รีเซ็ต ไม่นับ — LIN 2026-06-20 ──
function tfSessionInProgress() {
  return !!(session && !session.sessionScored && session.words && session.words.length && S && S.step !== 'session-summary');
}
// ── Lin 2026-07-04: หน้าฉลอง "全部精通！" — เด้งตอนจำได้ครบทุกคำในระดับ (เกิดจริงจาก _startRandom5) ──
function tfShowAllMastered(pool) {
  var old = document.getElementById('tf-allmaster-ov'); if (old) old.remove();
  var div = document.createElement('div');
  div.id = 'tf-allmaster-ov'; div.className = 'tf-ask-overlay';
  div.innerHTML =
    '<div class="tf-ask-box" style="text-align:center;">' +
      '<div style="font-size:46px;line-height:1;margin-bottom:8px;">🏆🌾</div>' +
      '<div class="tf-ask-title">全部精通！</div>' +
      '<div class="tf-ask-sub">這個等級的單字，你<b>全部都記住了</b>，太厲害了！🎉</div>' +
      '<div class="tf-ask-actions" style="flex-direction:column;gap:8px;">' +
        '<button class="tf-ask-send" id="tf-am-review">繼續複習（不計分）</button>' +
        '<button class="tf-ask-cancel" id="tf-am-level">挑戰其他等級</button>' +
      '</div>' +
    '</div>';
  div.addEventListener('click', function (e) { if (e.target === div) div.remove(); });
  document.body.appendChild(div);
  document.getElementById('tf-am-review').onclick = function () {
    try{ if(typeof gtag==='function') gtag('event','tone_finder_allmastered_review_click',{category:'game'}); }catch(e){}
    div.remove();
    // ทบทวน: คำ mastered เล่นได้แต่ 0 แต้ม (via tfSoftPointsAllowed) — เอากองเดิมมาสุ่ม 5
    var words = (pool || []).slice().sort(function () { return Math.random() - 0.5; }).slice(0, 5);
    if (words.length) startSetSession(words); else if (TF && TF.backToLevelSelect) TF.backToLevelSelect();
  };
  document.getElementById('tf-am-level').onclick = function () {
    try{ if(typeof gtag==='function') gtag('event','tone_finder_allmastered_switch_level_click',{category:'game'}); }catch(e){}
    div.remove();
    if (TF && TF.backToLevelSelect) TF.backToLevelSelect();
  };
}

function tfConfirmQuit(onYes) {
  if (!tfSessionInProgress()) { onYes(); return; }
  var old = document.getElementById('tf-quit-ov'); if (old) old.remove();
  var div = document.createElement('div');
  div.id = 'tf-quit-ov'; div.className = 'tf-ask-overlay';
  div.innerHTML =
    '<div class="tf-ask-box" style="text-align:center;">' +
      '<div class="tf-ask-title">確定要離開嗎？ 🥺</div>' +
      '<div class="tf-ask-sub">這回合還沒結束，離開的話<b>分數不會被計算</b>，要重新開始喔～</div>' +
      '<div class="tf-ask-actions">' +
        '<button class="tf-ask-cancel" onclick="try{if(typeof gtag===\'function\')gtag(\'event\',\'tone_finder_quit_cancel\',{category:\'game\'});}catch(e){}(function(){var o=document.getElementById(\'tf-quit-ov\');if(o)o.remove();})()">繼續練習</button>' +
        '<button class="tf-ask-send" id="tf-quit-yes" style="background:#c0552f;">離開不存分</button>' +
      '</div>' +
    '</div>';
  div.addEventListener('click', function (e) { if (e.target === div) div.remove(); });
  document.body.appendChild(div);
  var yes = document.getElementById('tf-quit-yes');
  if (yes) yes.addEventListener('click', function () { try{ if(typeof gtag==='function') gtag('event','tone_finder_quit_confirm',{category:'game'}); }catch(e){} div.remove(); onYes(); });
}
// LIN 2026-06-27: เอากล่องเตือน "จะออกจากหน้านี้ไหม?" (beforeunload) ออก
//   เหตุผล: คนแค่แวะมาลองเล่นแล้วจะปิด เจอกล่องเตือนน่ากลัวของเบราว์เซอร์ = รู้สึกเว็บหนึบ ผลตอบแทนต่ำ

var TF = {
// Lin 2026-07-25: ปิดโหมด 自行搜尋 ถาวรตามที่ Lin สั่ง (ไม่ใช้แล้ว) — ลบทั้งระบบออก  [TF.filterThai/randomSyllable/randomWord/showWordInfo/search]
  back: function() {
    if (histPos > 0) { restoreState(histPos-1); return; }
    // ลบหน้า cat-select แล้ว → back กลับไป level-select เสมอ
    selectedCategory = null; session = null; randomEntry = null;
    S = { word:'', step:'level-select', path:[], tone:null }; hist=[S]; histPos=0; render();
  },
  forward: function() {
    if (histPos < hist.length-1) restoreState(histPos+1);
  },
  reset: function() {
    var self = this;
    tfConfirmQuit(function () {
      tfClearResumeState(); // E3: ผู้เล่นเลือก "ออกไม่เก็บคะแนน/เริ่มใหม่" เอง → ไม่ต้องเสนอ resume รอบเก่าอีก
      hist=[]; histPos=-1;
      S = { word:'', step:'level-select', path:[], tone:null };
      randomEntry = null;
      selectedLevel = null;
      selectedCategory = null;
      session = null;
      advSentenceCtx = null; advSentIdx = -1;
      render();
    });
  },
  // Re-select TOPIC: keep the chosen level, go back to the 選擇主題 (category) page.
  reselectTopic: function() {
    tfConfirmQuit(function () {
      tfClearResumeState(); // E3: กำลังจะเริ่มชุดคำ/ประโยคใหม่ (สุ่มใหม่) — ล้างของเก่าก่อน (ของใหม่จะถูก save ทับเองใน startSetSession อยู่แล้วถ้ามี session ใหม่)
      hist=[]; histPos=-1;
      randomEntry = null; session = null;
      if (selectedLevel) {
        TF._startRandom5();
      } else {
        selectedCategory = null;
        S = { word:'', step:'level-select', path:[], tone:null };
        render();
      }
    });
  },
  selectLevel: function(level) {
    selectedLevel = level;
    selectedCategory = 'ทั้งหมด';
    randomEntry = null; session = null;
    hist=[]; histPos=-1;
    // Lin 2026-07-13: ถ้าล็อกอินแต่ยังไม่เคยซิงก์ SRS จากเซิร์ฟเวอร์ → รอสั้นๆ (สูงสุด 1.5 วิ) ให้รอบแรก
    // "บนเครื่องใหม่" ถูกต้อง (ไม่เอาคำที่จำได้แล้วมาถามซ้ำ) · เน็ตช้า/ล่ม = ไปต่อด้วยเล่มในเครื่องทันที ไม่ค้าง
    if (tfSrsLoggedIn() && !window.__tfSrsSyncedOnce) {
      var started = false, go = function () { if (started) return; started = true; TF._startRandom5(); };
      try { Promise.race([ tfSyncSrsFromServer(), new Promise(function (r) { setTimeout(r, 1500); }) ]).then(go); } catch (e) { go(); }
      setTimeout(go, 1600); // กันเหนียว: ไม่ว่าอะไรเกิดขึ้นก็เริ่มเกมแน่นอน
    } else {
      TF._startRandom5();
    }
  },
  // สุ่ม 5 คำจาก level ที่เลือก แล้ว loop ต่อเนื่อง
  _startRandom5: function(reviewReady) {
    if(!reviewReady&&window.LearningReview&&LearningReview.runtimeEnabled&&LearningReview.runtimeEnabled()){
      LearningReview.prime({game:'tone',level:selectedLevel||1,playSetSize:selectedLevel===3?1:5}).then(function(){TF._startRandom5(true);});
      return;
    }
    if (selectedLevel === 3) { // 高級 ไม่มีคำใน WORD_LIST → สุ่มประโยคใหม่แทน (Lin 2026-07-03)
      var _allSentences=ADV_SENTENCES.map(function(_,i){return i;});
      var _reviewSentences=window.LearningReview&&LearningReview.matchQueue?LearningReview.matchQueue({game:'tone',level:3,items:_allSentences,contentRefOf:tfReviewSentenceRef}):[];
      var _sentenceAllocation=window.LearningReview&&LearningReview.runtimeEnabled&&LearningReview.runtimeEnabled()?LearningReview.allocateRuntime({total:1,reviewDue:_reviewSentences,srsDue:[],regular:_allSentences,idOf:function(i){return LearningReview.keyOfRef(tfReviewSentenceRef(i));},scope:'tone-3'}):{items:[Math.floor(Math.random()*ADV_SENTENCES.length)],selectedReview:[]};
      var _sentenceIndex=_sentenceAllocation.items.length?_sentenceAllocation.items[0]:Math.floor(Math.random()*ADV_SENTENCES.length);
      TF.startAdvSentence(_sentenceIndex);
      if(window.LearningReview&&LearningReview.registerRound){var _sentenceRefKey=LearningReview.keyOfRef(tfReviewSentenceRef(_sentenceIndex)),_group={};_group[_sentenceRefKey]=session&&session.words?session.words.length:1;LearningReview.registerRound({report:roundReport,game:'tone',level:3,allItems:_allSentences,srsOwned:_allSentences.filter(function(i){return !!tfGetSrsRecord(ADV_SENTENCES[i].th,3);}),selectedReview:_sentenceAllocation.selectedReview,idOf:function(i){return LearningReview.keyOfRef(tfReviewSentenceRef(i));},contentRefOf:tfReviewSentenceRef,groupSizeByRef:_group,retry:function(){if(session&&session.words&&session.words.length){session.words=session.words.concat(session.words.slice());}}});}
      return;
    }
    // F5 (2026-08-10): จำ "คำสุดท้ายของชุดก่อนหน้า" ไว้ก่อนที่ session ตัวแปรจะถูกทับด้วยชุดใหม่ (ใช้กันคำแรกของชุดใหม่ซ้ำกับคำสุดท้ายของชุดก่อน)
    var _prevLastWord = (session && session.words && session.words.length) ? tfStateWord(session.words[session.words.length - 1]) : null;
    var pool = WORD_LIST.filter(function(w){ return !selectedLevel || w.level === selectedLevel; });
    if (!pool.length) { tfToast('找不到單字，請試試其他等級'); return; }
    // Lin 2026-07-04: ถ้าจำได้ครบทุกคำในระดับนี้ (全部精通) → เด้งหน้าฉลองก่อน (ไม่เริ่มชุดอัตโนมัติให้เล่นวนเปล่าๆ)
    if (tfSrsLoggedIn()) {
      var fresh = pool.filter(function(w){ var r = tfGetSrsRecord(w, tfWordLevel(w)); return !(r && r.mastered); });
      if (fresh.length === 0) {
        // Lin 2026-07-04: จำได้ครบระดับนี้ → บันทึกว่า "เห็นครบ N คำแล้ว" (ไว้เทียบตอนเพิ่มคำใหม่ทีหลัง → เด้งแจ้งเตือน)
        try { if (window.GAME_ACCOUNT) GAME_ACCOUNT.markLevelSeen('tone', selectedLevel, pool.length); } catch (e) {}
        tfShowAllMastered(pool); return;
      }
    }
    pool = tfExcludeMasteredWords(pool, 5); // Lin 2026-07-04: กันคำที่จำได้แล้ว (mastered) โผล่ซ้ำในสุ่ม 5 คำ
    var words;
    var _reviewSelected=[],_srsOwned=pool.filter(function(w){return !!tfGetSrsRecord(w,tfWordLevel(w));});
    var _reviewDue=window.LearningReview&&LearningReview.matchQueue?LearningReview.matchQueue({game:'tone',level:selectedLevel,items:pool,contentRefOf:tfReviewWordRef}):[];
    if (tfSrsLoggedIn() && window.LearningReview&&LearningReview.runtimeEnabled&&LearningReview.runtimeEnabled()&&window.GameFlow&&GameFlow.allocateSrs) {
      var _now=Date.now();
      var _due=pool.filter(function(w){var r=tfGetSrsRecord(w,tfWordLevel(w));return !!(r&&!r.mastered&&TF_SRS.isDue(r,_now));});
      var _regular=pool.filter(function(w){return _due.indexOf(w)===-1;});
      var _allocation=LearningReview.allocateRuntime({total:Math.min(5,pool.length),reviewDue:_reviewDue,srsDue:_due.slice().sort(function(){return Math.random()-0.5;}),regular:_regular.slice().sort(function(){return Math.random()-0.5;}),idOf:function(w){return LearningReview.keyOfRef(tfReviewWordRef(w));},scope:'tone-'+selectedLevel,srsScope:'tone-'+selectedLevel,allocateSrs:GameFlow.allocateSrs});
      words=_allocation.items;_reviewSelected=_allocation.selectedReview;
    } else if (tfSrsLoggedIn() && window.GameFlow && GameFlow.allocateSrs) {
      var _now=Date.now();
      var _due=pool.filter(function(w){var r=tfGetSrsRecord(w,tfWordLevel(w));return !!(r&&!r.mastered&&TF_SRS.isDue(r,_now));});
      var _regular=pool.filter(function(w){return _due.indexOf(w)===-1;});
      words=GameFlow.allocateSrs({tier:'free',total:Math.min(5,pool.length),due:_due.slice().sort(function(){return Math.random()-0.5;}),regular:_regular.slice().sort(function(){return Math.random()-0.5;}),idOf:function(w){return tfStateWord(w);},scope:'tone-'+selectedLevel}).items;
    } else {
      words = pool.slice().sort(function(){ return Math.random()-0.5; }).slice(0, 5);
    }
    // F5 (2026-08-10): พยายามไม่ให้คำแรกของชุดใหม่ซ้ำกับคำสุดท้ายของชุดก่อนหน้า — สลับที่กับคำถัดไปในชุด (แค่ลองครั้งเดียว)
    //   pool เล็กจนเลี่ยงไม่ได้ (เหลือคำเดียว/ทุกคำในชุดใหม่คือคำเดิม) ก็ปล่อยให้ซ้ำได้ตามที่ Lin ยืนยัน ไม่ใช่ด่านบังคับ
    if (_prevLastWord && words.length > 1 && tfStateWord(words[0]) === _prevLastWord) {
      var _tmp = words[0]; words[0] = words[1]; words[1] = _tmp;
    }
    startSetSession(words,{keepOrder:true});
    if(window.LearningReview&&LearningReview.registerRound)LearningReview.registerRound({report:roundReport,game:'tone',level:selectedLevel,allItems:pool,srsOwned:_srsOwned,selectedReview:_reviewSelected,idOf:function(w){return LearningReview.keyOfRef(tfReviewWordRef(w));},contentRefOf:tfReviewWordRef,retry:function(w){if(session&&session.words)session.words.push(w);}});
  },
  // Lin 2026-07-04: ตัด selectCategory/selectSet/openSpecial ทิ้งแล้ว — หน้าเลือกหมวด/ชุด + 特訓區 ไม่ใช้แล้ว
  // ⭐ Lin 2026-07-25: ปุ่มดาว แยกออกจากปุ่ม勳章(showBadges) — โชว์แค่จำนวนดาวสะสม ไม่มีตารางแบดจ์
  showStars: function() {
    var old = document.getElementById('tf-star-ov');
    if (old) old.remove();
    var s = (window.GAME_ACCOUNT) ? GAME_ACCOUNT.getStars() : 0;
    var div = document.createElement('div');
    div.id = 'tf-star-ov';
    div.className = 'tf-tip-overlay';
    div.onclick = function(e){ if (e.target === div) div.remove(); };
    div.innerHTML = '<div class="tf-tip-box" style="max-width:340px;text-align:center;">' +
      '<div class="tf-tip-header"><span class="tf-tip-header-title" style="color:#000;">⭐ 累積星星</span>' +
      '<button class="tf-tip-close-btn" onclick="try{if(typeof gtag===\'function\')gtag(\'event\',\'tone_finder_stars_close\',{category:\'game\'});}catch(e){}document.getElementById(\'tf-star-ov\').remove()">✕</button></div>' +
      '<div style="padding:22px;">' +
        '<div style="font-size:56px;line-height:1;margin-bottom:8px;">⭐ ' + s + '</div>' +
        '<div style="font-family:\'Noto Sans TC\',sans-serif;font-size:13px;color:#a08050;">累積星星（全部遊戲共用）</div>' +
      '</div>' +
    '</div>';
    document.body.appendChild(div);
  },
  // 🎖️ เปิดสมุดสะสมแบดจ์
  showBadges: function() {
    var old = document.getElementById('tf-badges-ov');
    if (old) old.remove();
    var data = tfLoadBadges();
    var unlocked = data.unlocked || {};
    var tierName = {1:'🌾 稻米成長（連續遊玩）', 2:'🍚 稻米品種（星星解鎖・兩遊戲共用）'};
    var byTier = {};
    TF_BADGES_DEF.forEach(function(b){ (byTier[b.tier] = byTier[b.tier] || []).push(b); });
    var body = Object.keys(byTier).map(function(t){
      var cards = byTier[t].map(function(b){
        var got = !!unlocked[b.id];
        return '<div class="tf-badge-card' + (got ? '' : ' locked') + '">' +
          '<div class="tf-badge-emoji">' + (got ? tfBadgeIcon(b, 54) : '🔒') + '</div>' +
          '<div class="tf-badge-zh">' + b.zh + '</div>' +
          '<div class="tf-badge-th">' + (got ? b.th : '———') + '</div>' +
          '<div class="tf-badge-need">' + b.need + '</div></div>';
      }).join('');
      return '<div class="tf-badge-tier-title">' + (tierName[t]||'') + '</div><div class="tf-badge-unlock-grid">' + cards + '</div>';
    }).join('');
    var div = document.createElement('div');
    div.id = 'tf-badges-ov';
    div.className = 'tf-tip-overlay';
    div.onclick = function(e){ if (e.target === div) div.remove(); };
    div.innerHTML = '<div class="tf-tip-box" style="max-width:420px;">' +
      '<div class="tf-tip-header"><span class="tf-tip-header-title" style="color:#000;">🎖️ 我的徽章</span>' +
      '<button class="tf-tip-close-btn" onclick="try{if(typeof gtag===\'function\')gtag(\'event\',\'tone_finder_badges_close\',{category:\'game\'});}catch(e){}document.getElementById(\'tf-badges-ov\').remove()">✕</button></div>' +
      body +
      '<div style="font-size:11px;color:#a08a5a;margin-top:12px;line-height:1.6;">每枚徽章都有泰國米食文化小知識，集滿解鎖更多 🌾（圖示為暫定，之後會換成手繪版）</div>' +
    '</div>';
    document.body.appendChild(div);
  },
  // Compatibility guard: stale callers must never let the player mark a word
  // mastered. Memory status belongs to SRS; this legacy entry is neutral skip.
  markKnown: function() {
    return this.skipCurrentWord();
  },
  // Neutral skip on all supported layouts: no answer, score, Combo, SRS, or countdown.
  skipCurrentWord: function() {
    if (!session || !tfNeutralSkipSurface()) return;
    var entry = session.words[session.index];
    if (!entry) return;
    var awarded = Math.max(0, Number(session.currentWordScore) || 0);
    if (awarded) session.score = Math.max(0, (Number(session.score) || 0) - awarded);
    session.currentWordScore = 0;
    session.curWordSylRawSum = 0;
    session.hadSkip = true;
    session.results.push({
      entry: entry,
      tone: catalogToneNumber(),
      mistakes: 0,
      initialGuess: undefined,
      finalAnswer: undefined,
      attempts: [],
      hintUsed: false,
      score: 0,
      firstTry: false,
      golden: false,
      forced: false,
      skipped: true,
      skipReason: 'user_skip',
      needReview: false
    });
    if (roundReport && window.RoundReport) {
      var _skipSentence = selectedLevel === 3 && advSentenceCtx && advSentenceCtx.th;
      RoundReport.addItem(roundReport, {
        content_ref: _skipSentence ? { source: 'game_sentences', key: _skipSentence } : { source: 'game_words', key: tfWordContentKey(entry) },
        question: entry.word,
        meaning: entry.zh || '',
        attempts: [],
        user_answer: '',
        correct_answer: '',
        is_correct: false,
        is_skipped: true,
        skip_reason: 'user_skip',
        wrong_count: 0,
        item_score: 0,
        hint_used: false,
        linguistic: { reading_th: entry.readingTH || '', syls: entry.syls || null },
        words: (_skipSentence && advSentenceCtx.words) ? advSentenceCtx.words.map(function(w){return {th:w.th||'',zh:w.zh||''};}) : []
      });
    }
    session.index++;
    tfResetWordScoring();
    session.initialGuess = undefined;
    session.finalAnswer = undefined;
    session.currentWordGolden = false;
    tfSaveResumeState();
    if (session.index >= session.words.length) tfGoToSummary();
    else tfSetupNextWord();
  },
  // 高級：เริ่มเล่นประโยคเต็ม 1 ประโยค — words[] ของประโยคกลายเป็น session เดียว (Lin 2026-07-03)
  // ใช้ startSetSession เดิมทุกอย่าง (คำทอง/คอมโบ/โบนัสจบชุด) แค่ส่ง entry object ตรงๆ ไม่ query WORD_LIST + ห้ามสลับลำดับคำ
  startAdvSentence: function(idx) {
    var s = ADV_SENTENCES[idx];
    if (!s) return;
    if (!s.readingTH || !Array.isArray(s.words) || !s.words.length) throw new Error('CATALOG_AUTHORITY_INCOMPLETE:sentence');
    var coreWords = s.words;
    // Lin 2026-07-16: ช่อง syl รายคำถูกถอดออกจาก adv-sentences.js แล้ว — คำอ่านรวมอยู่ที่ s.readingTH (ทั้งประโยค คั่น '-')
    // ตัดกลับเป็นรายคำด้วยจำนวนพยางค์ของแต่ละคำ (w.syls.length) ซึ่งตรงกันเสมอ (มีด่านเช็คใน check-data-health.js)
    // — coreWords ไม่รวมพยางค์ของคำลงท้ายสุภาพแล้ว ตัดพยางค์ท้าย s.readingTH เกินมาไม่กระทบ เพราะ loop นี้หยุดแค่จำนวนคำใน coreWords
    var _parts = String(s.readingTH).split('-'), _p = 0;
    var _expectedParts = coreWords.reduce(function(total,w){
      if (!w || !Array.isArray(w.syls) || !w.syls.length) throw new Error('CATALOG_AUTHORITY_INCOMPLETE:sentence syllables');
      return total + w.syls.length;
    }, 0);
    if (_parts.length !== _expectedParts || _parts.some(function(part){ return !part; })) throw new Error('CATALOG_AUTHORITY_INCOMPLETE:sentence reading segmentation');
    var entries = coreWords.map(function(w){
      var _n = w.syls.length;
      var _read = _parts.slice(_p, _p + _n).join('-'); _p += _n;
      // Lin 2026-07-25: ใส่ readingEN ด้วย (ต่อ en ของทุกพยางค์) — เดิมลืมใส่ ทำให้ปุ่ม 英文讀音 ในโหมด高級 โชว์ว่างเปล่า
      //   (กฎ CLAUDE.md: ตัวประกอบต้อง copy ทุกฟิลด์ที่เกมใช้จริง)
      var _readEn = w.syls.map(function(sy){
        if (!sy || !sy.en) throw new Error('CATALOG_AUTHORITY_INCOMPLETE:sentence romanization');
        return sy.en;
      }).join('-');
      return { word: w.th, readingTH: _read, readingEN: _readEn, zh: w.zh, level: 3, category: '高級句子', syls: w.syls }; // 2026-07-30: แนบ syls จากคลัง — หน้าเฉลย高級ต้องแตกตัวอักษรจากข้อมูลที่ Lin ตรวจแล้ว ไม่ใช่สูตรคำนวณ
    });
    selectedLevel = 3;
    selectedCategory = '高級句子';
    advSentIdx = idx;
    var exactSentenceText=coreWords.map(function(w){return w.th;}).join('');
    if(typeof s.th!=='string'||!s.th||s.th.trim()!==s.th||exactSentenceText!==s.th)throw new Error('CATALOG_AUTHORITY_INCOMPLETE:sentence identity mismatch');
    // Lin 2026-07-30: ย้ายมาตั้ง advSentenceCtx "ก่อน" เรียก startSetSession (เดิมตั้งทีหลัง ทำให้ render() รอบแรกในนั้นเห็นค่าเป็น null → คำแรกของประโยค高級ไม่โชว์ประโยคเต็ม)
    // Lin 2026-07-31: th ตอนนี้คือประโยคไม่รวมคำลงท้ายสุภาพแล้ว (ตัด _hasParticle ออกแล้วด้านบน) — particle คำนวณแยกตามปุ่มเปิด/ปิด ใช้โชว์ต่อท้ายบนแบนเนอร์เท่านั้น ไม่ใช่ส่วนที่ต้องทายเสียง
    // Lin 2026-08-01: เพิ่ม readingTH (คำอ่านยาวทั้งประโยค) เก็บไว้โชว์แทนคำแปลจีนรายคำ ตามที่ Lin สั่ง — s.readingTH คือคำอ่านเต็มประโยคจากคลัง (ไม่ตัดคำลงท้ายสุภาพ แต่ไม่กระทบเพราะ core words เท่านั้นที่ถูกถาม)
    advSentenceCtx = { th: s.th, zh: s.zh, readingTH: s.readingTH, particle: tfShowParticleFor(s) };
    startSetSession(entries, { keepOrder: true, isAdvSentence: true });
  },
  // 禮貌詞เป็นข้อความประกอบที่อ่านจากประโยคที่ตรวจแล้ว ไม่ใช่โจทย์หรือคำตอบเสียง
  toggleParticleMode: function() {
    var cur = tfParticleMode();
    var next = cur === 'off' ? 'm' : (cur === 'm' ? 'f' : 'off');
    tfSetParticleMode(next);
    if (advSentenceCtx && advSentIdx >= 0) {
      var s = ADV_SENTENCES[advSentIdx];
      advSentenceCtx.particle = tfShowParticleFor(s);
    }
    render();
  },
// Lin 2026-07-25: ปิดโหมด 自行搜尋 ถาวรตามที่ Lin สั่ง (ไม่ใช้แล้ว) — ลบทั้งระบบออก  [TF.openSearch]
  openAlpha: function() {
    selectedLevel = null; selectedCategory = null; session = null; randomEntry = null;
    S = { word:'', step:'alpha-home', path:[], tone:null };
    hist = [S]; histPos = 0;
    render();
  },
  openAlphabetOverlay: function(view, arg) {
    tfOpenAlphabetOverlay(view || 'home', arg || null);
  },
  closeAlphabetOverlay: function() {
    var root = document.getElementById('tf-alpha-overlay');
    if (root) root.remove();
    document.body.style.overflow = this._alphaPrevOverflow || '';
    if (this._alphaAudio) {
      try { this._alphaAudio.pause(); this._alphaAudio.currentTime = 0; } catch(e){}
      this._alphaAudio = null;
    }
  },
  alphaOverlayView: function(view, arg) { tfAlphaView(view, arg, false); },
  alphaOverlayReplace: function(view, arg) { tfAlphaView(view, arg, true); },
  alphaOverlayBack: function() {
    var prev = tfAlphabetOverlay.stack.pop();
    if (!prev) { this.closeAlphabetOverlay(); return; }
    tfAlphabetOverlay.view = prev.view; tfAlphabetOverlay.arg = prev.arg; tfAlphaRender();
  },
  alphaOverlayTerm: function(key) { tfAlphaView('term', key, false); },
  alphaOverlayDetail: function(rule, open) {
    if (!tfAlphabetOverlay.details) tfAlphabetOverlay.details = {};
    tfAlphabetOverlay.details[rule] = !!open;
  },
  alphaOverlayEndingDetail: function(ch) {
    var card = tfAlphaEndingCard(ch);
    var body = document.querySelector('#tf-alpha-overlay .tf-alpha-overlay-body');
    if (!card || !card.exp || !body) return;
    var old = document.getElementById('tf-alpha-ending-detail');
    if (old) old.remove();
    var detail = document.createElement('div');
    detail.id = 'tf-alpha-ending-detail'; detail.className = 'tf-alpha-ending-detail';
    detail.innerHTML = '<strong>尾音 '+ch+'｜包含：'+card.mem+'</strong><br><b>'+card.exp.cat+'</b><br>'+card.exp.how+
      (card.exp.thai ? '<br>泰文範例：'+card.exp.thai : '') + (card.exp.zh ? '<br>中文對應：'+card.exp.zh : '');
    body.appendChild(detail); detail.scrollIntoView({block:'nearest'});
  },
  alphaOverlaySpeak: function(category, ch, btn) {
    var self = this;
    var src = TF_FLASH_AUDIO && TF_FLASH_AUDIO[category] ? TF_FLASH_AUDIO[category][ch] : null;
    if (!src && !TF_FLASH_AUDIO_READY && TF_FLASH_AUDIO_PROMISE) {
      TF_FLASH_AUDIO_PROMISE.then(function(){ self.alphaOverlaySpeak(category, ch, btn); });
      return;
    }
    if (!src) return;
    try {
      if (self._alphaAudio) { self._alphaAudio.pause(); self._alphaAudio.currentTime = 0; }
      var audio = new Audio(src); self._alphaAudio = audio;
      if (btn) btn.classList.add('is-playing');
      audio.addEventListener('ended', function(){ if (btn) btn.classList.remove('is-playing'); }, {once:true});
      audio.play().catch(function(err){ if (btn) btn.classList.remove('is-playing'); console.error('[phonics-manual] audio failed:', src, err); });
    } catch(e) { console.error('[phonics-manual] Audio() error:', src, e); }
  },
  openManualFromTip: function(encodedKeys) {
    var keys = [];
    try { keys = JSON.parse(decodeURIComponent(encodedKeys)); } catch(e){}
    var tip = document.getElementById('tf-tip-ov');
    if (tip) tip.remove();
    tfOpenAlphabetOverlay('manual', tfAlphaContextFromKeys(keys));
  },
  alphaConsonants: function() {
    S = { word:'', step:'alpha-consonant', path:[], tone:null };
    hist = [S]; histPos = 0; render();
  },
  alphaVowels: function() {
    S = { word:'', step:'alpha-vowel', path:[], tone:null };
    hist = [S]; histPos = 0; render();
  },
  alphaEndings: function() {
    this.startFlashcards('ending');
  },
  startFlashcards: function(key) {
    var cards = [], title = '', back = 'alpha-home';
    var C = ALPHA.consonant;
    if (key === 'mid')  { cards = C.mid.common;  title = '中子音 字卡'; back = 'alpha-consonant'; }
    else if (key === 'high') { cards = C.high.common; title = '高子音 字卡'; back = 'alpha-consonant'; }
    else if (key === 'low')  { cards = C.low.common;  title = '低子音 字卡'; back = 'alpha-consonant'; }
    else if (key === 'forgot') {
      cards = C.mid.forgot.concat(C.high.forgot, C.low.forgot);
      title = '遺忘版 字卡（混合複習）'; back = 'alpha-consonant';
    }
    else if (key === 'v_short') { cards = ALPHA.vowel.short; title = '短母音 字卡'; back = 'alpha-vowel'; }
    else if (key === 'v_long')  { cards = ALPHA.vowel.long;  title = '長母音 字卡'; back = 'alpha-vowel'; }
    else if (key === 'v_all')   { cards = ALPHA.vowel.short.concat(ALPHA.vowel.long); title = '母音 字卡（全部）'; back = 'alpha-vowel'; }
    else if (key === 'ending')  { cards = ALPHA.ending; title = '尾音 字卡'; back = 'alpha-home'; }
    if (!cards.length) return;
    var order = cards.map(function(_,i){ return i; });
    flash = { title:title, cards:cards, order:order, index:0, flipped:false, back:back };
    S = { word:'', step:'alpha-flashcard', path:[], tone:null };
    hist = [S]; histPos = 0;
    render();
  },
  flashFlip: function() {
    if (!flash) return;
    flash.flipped = !flash.flipped;
    var inner = document.getElementById('afc-card');
    if (inner) inner.classList.toggle('flipped', flash.flipped);
    var card = flash.cards[flash.order[flash.index]];
    if (card && !card.exp) this.flashSpeak();  // 尾音卡不自動發音（改看解釋）
  },
  flashSpeak: function() {
    if (!flash) return;
    var card = flash.cards[flash.order[flash.index]];
    if (!card) return;
    // เล่นเสียงครูอ่านจริง (子音/母音) ถ้ามีไฟล์ — LIN 2026-06-20
    var cat = flash.back === 'alpha-vowel' ? 'vowels' : (flash.back === 'alpha-consonant' ? 'consonants' : null);
    var src = (cat && TF_FLASH_AUDIO && TF_FLASH_AUDIO[cat]) ? TF_FLASH_AUDIO[cat][card.ch] : null;
    if (!src && cat && !TF_FLASH_AUDIO_READY) {
      // manifest ยังโหลดไม่เสร็จ — รอแล้ว retry ครั้งเดียว
      var _card = card;
      TF_FLASH_AUDIO_PROMISE && TF_FLASH_AUDIO_PROMISE.then(function(){ TF.flashSpeak(); });
      return;
    }
    if (src) {
      try {
        if (TF._flashAudio) { try { TF._flashAudio.pause(); TF._flashAudio.currentTime = 0; } catch(e){} }
        // ไม่ encodeURI — browser handle UTF-8 path ได้, encodeURI ทำให้ path ผิดบน GitHub Pages
        var a = new Audio(src);
        a.volume = 1;
        TF._flashAudio = a;
        a.play().catch(function(err) { console.error('[flashcard-audio] play failed:', src, err); });
        return;
      } catch(e) { console.error('[flashcard-audio] Audio() error:', src, e); }
    }
    // ไม่มีไฟล์ → ไม่เล่นเสียง (ลบ TTS fallback แล้ว — LIN 2026-06-21)
  },
  flashToggleExp: function() {
    if (!flash) return;
    flash.showExp = !flash.showExp;
    render();
  },
  flashNext: function() {
    if (!flash) return;
    flash.index = (flash.index + 1) % flash.cards.length;
    flash.flipped = false; flash.showExp = false; render();
    var card = flash.cards[flash.order[flash.index]];
    if (card && !card.exp) this.flashSpeak();
  },
  flashPrev: function() {
    if (!flash) return;
    flash.index = (flash.index - 1 + flash.cards.length) % flash.cards.length;
    flash.flipped = false; flash.showExp = false; render();
    var card = flash.cards[flash.order[flash.index]];
    if (card && !card.exp) this.flashSpeak();
  },
  flashShuffle: function() {
    if (!flash) return;
    for (var i = flash.order.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = flash.order[i]; flash.order[i] = flash.order[j]; flash.order[j] = t;
    }
    flash.index = 0; flash.flipped = false; flash.showExp = false; render();
    var card = flash.cards[flash.order[flash.index]];
    if (card && !card.exp) this.flashSpeak();
  },
  // Lin 2026-07-14: ไปพยางค์ถัดไปของ "คำเดิม" (ไม่ commit เป็นคำใหม่ ไม่บวกคะแนนจบคำ) — ใช้ตอนยังไม่ใช่พยางค์สุดท้าย
  nextSyllable: function() {
    if (!S.syllables || S.selectedSyl == null) { TF.nextWord(); return; }
    var results = {};
    for (var k in (S.sylResults || {})) results[k] = S.sylResults[k];
    results[S.selectedSyl] = { tone: catalogToneNumber() };
    var nextIdx = S.selectedSyl + 1;
    var syls = S.syllables;
    var parentWord = currentCatalogWord();
    if (session) { session.currentWordMistakes = 0; session.currentWordDeduction = 0; session.currentWordDeduct = 0; session.stepWrong = false; session.stepFreePeekUsed = false; session.curWordWrongGuess = false; session.hintUsed = false; }
    if (!session) throw new Error('CATALOG_AUTHORITY_UNAVAILABLE:no active session');
    var sylStep = 'session-guess';
    var ns = { word: syls[nextIdx], step: sylStep, path: [syls[nextIdx]], tone: null, syllables: syls, selectedSyl: nextIdx, sylResults: results, parentWord: parentWord };
    hist = hist.slice(0, histPos+1);
    hist.push(ns); histPos++;
    S = ns;
    if (tfGuideMode) tfLockCurrentWordForGuide();
    render();
  },
  nextWord: function() {
    if (session) {
      var _gaEntry = session.words[session.index];
      var _gaTone = catalogToneNumber();
      var _gaMistakes = session.currentWordMistakes || 0;
      var _gaToneName = (TONES[_gaTone] && TONES[_gaTone].zh) || String(_gaTone);
      if (_gaMistakes === 0) {
        gtag('event','tone_answer_correct',{category:'game',word: _gaEntry.word, tone: _gaToneName});
        try{ if(window.gtag) gtag('event','game_correct',{category:'game',game:'tone_finder'}); }catch(e){}
      } else {
        var _gaFinal = session.finalAnswer != null ? session.finalAnswer : session.initialGuess;
        var _gaSelectedName = (TONES[_gaFinal] && TONES[_gaFinal].zh) || String(_gaFinal);
        gtag('event','tone_answer_wrong',{category:'game',word: _gaEntry.word, selected: _gaSelectedName, correct: _gaToneName});
        try{ if(window.gtag) gtag('event','game_wrong',{category:'game',game:'tone_finder'}); }catch(e){}
      }
      // สเตจ 1: บันทึกผล (พร้อมคะแนน) + ไปคำถัดไป/สรุป + คิดโบนัสจบชุด
      tfCommitWordAndAdvance({ forced: false });
    } else {
      TF._startRandom5(); // Lin 2026-07-04: เดิมเรียก selectCategory (ลบไปแล้ว) — fallback กรณี session หลุด
    }
  },
  downloadSummary: function() {
    if (!session) return;
    var catZh = {ทั้งหมด:'全部',ตัวเลข:'數字',สี:'顏色',กริยา:'動詞',คำขยาย:'形容詞',ร้านอาหาร:'餐廳',การเดินทาง:'交通',โรงแรม:'住宿',งาน:'工作','ช้อปปิ้ง':'購物','อื่นๆ':'其他','นามร่างกาย':'名詞·身體','นามคน':'名詞·家庭與人','นามอาหาร':'名詞·食物','นามของใช้':'名詞·生活物品'};
    var items = roundReport && roundReport.items ? roundReport.items : [];
    var lines = [
      '泰語聲調練習報告',
      '==================',
      '日期：' + new Date().toLocaleDateString('zh-TW'),
      '等級：' + ({1:'初級',2:'中級',3:'高級'}[selectedLevel]||'—'),
      '主題：' + (catZh[selectedCategory]||selectedCategory||'全部'),
      '練習字數：' + items.length,
      '', '練習記錄：', '----------'
    ];
    items.forEach(function(r,i){
      lines.push((i+1)+'. '+(r.is_correct?'✓':'✗')+' '+r.question+' ('+r.meaning+') — 作答：'+(r.user_answer||'—')+' ／正解：'+(r.correct_answer||'—')+(r.wrong_count?' ／選錯'+r.wrong_count+'次':''));
    });
    var blob = new Blob([lines.join('\n')], {type:'text/plain;charset=utf-8'});
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a'); a.href=url; a.download='泰語聲調練習_'+new Date().toISOString().slice(0,10)+'.txt'; a.click();
    URL.revokeObjectURL(url);
  },
  // ── สลับฟอนต์ มีหัว(Sarabun) ↔ โมเดิร์นไม่มีหัว(Noto Sans Thai) + จำค่าไว้ ──
  // Lin 2026-07-25: ลบโค้ดอัปเดตปุ่มเก่า #tf-font-btn ออก — ปุ่มนั้นไม่มีในหน้าแล้วตั้งแต่ย้ายเข้าเมนู 🍚 (ปุ่มจริงสร้างโดย shared.js ใส่ช่อง #font-toggle-slot และอ่านสถานะจาก class บน <body> เอง)
  toggleFont: function() {
    var on = document.body.classList.toggle('tf-modern-font');
    try { localStorage.setItem('tf_modern_font', on ? '1' : '0'); } catch(e){}
  },
  // ── ปุ่ม 讀音 (คำอ่านไทย) / 英文讀音 (คำอ่านโรมัน) — Lin 2026-07-25 ──
  // กดได้ตลอด — 讀音 โผล่ทันทีทุกขั้น (Lin 2026-07-30) · 英文讀音 อยู่ข้างคำในหน้าเฉลย ใช้ได้ตรงนั้น
  // Lin 2026-07-30 (บั๊กที่ Lin เจอ): กดปุ่มตอนอยู่ "หน้าเฉลย" แล้วไม่มีอะไรเกิดขึ้น
  //   สาเหตุ: หน้าเฉลย (step 'result') ไม่มีแบนเนอร์ → ไม่มีกล่อง #tf-read-line ให้ tfUpdateReadingLine อัปเดต
  //           คำอ่านหน้าเฉลยถูกฝังอยู่ใน HTML ของ result เอง ต้องวาดใหม่ทั้งหน้าถึงจะเปลี่ยน
  //   แก้: ถ้าไม่มีกล่อง #tf-read-line (= อยู่หน้าเฉลย) ให้ render() ใหม่แทน — วิธีเดียวกับปุ่ม 提示 ที่ทำอยู่แล้ว
  togglePron: function() {
    tfPronMode = !tfPronMode;
    try { localStorage.setItem('rg_pron_mode', tfPronMode ? '1' : '0'); } catch(e){}
    tfSyncReadBtns();
    tfRepaintReading();
    if (window.WordMenu && window.WordMenu.refresh) window.WordMenu.refresh();
  },
  toggleEn: function() {
    tfEnMode = !tfEnMode;
    try { localStorage.setItem('rg_en_mode', tfEnMode ? '1' : '0'); } catch(e){}
    tfSyncReadBtns();
    tfRepaintReading();
    if (window.WordMenu && window.WordMenu.refresh) window.WordMenu.refresh();
  },
  // ── ปุ่ม 提示 (คำใบ้) — Lin 2026-07-25 ──
  // เปิด = ดูคำตอบที่ตรวจแล้วโดยตรง ทั้งรอบไม่ได้คะแนน/ดาว/ความคืบหน้า
  toggleGuide: function() {
    var wasGuideIntroPending = !!(session && session.currentWordGuideIntroPending);
    tfGuideMode = !tfGuideMode;
    try { localStorage.setItem('rg_guide_mode', tfGuideMode ? '1' : '0'); } catch(e){}
    if (tfGuideMode && session && session.words && session.index < session.words.length && S && S.word && S.step !== 'result') {
      tfLockCurrentWordForGuide();
      if (S.step === 'session-guess' && !tfCurWordNoTools()) {
        session.currentWordGuideIntroPending = true;
      }
    }
    if (!tfGuideMode && wasGuideIntroPending) {
      session.currentWordGuideIntroPending = false;
    }
    tfSyncGuideBtn();
    render();   // วาดใหม่ทั้งหน้า: ป้ายบอกโหมด + ไฮไลต์ตัวเลือก อัปเดตพร้อมกัน
    if (!tfGuideMode && wasGuideIntroPending) {
      try { window.dispatchEvent(new CustomEvent('gsh:question-start')); } catch (e) {}
    }
    if (window.WordMenu && window.WordMenu.refresh) window.WordMenu.refresh();
  },
  startGuidedQuestion: function() {
    if (!session || !session.currentWordGuideIntroPending || !S || S.step !== 'session-guess') return;
    session.currentWordGuideIntroPending = false;
    if (tfDesktopOrPortrait()) {
      tfFireStartOnce();
      session.initialGuess = undefined;
      session.currentWordToneAttempts = [];
      tfForceRevealZero();
    } else {
      render();
    }
    try { window.dispatchEvent(new CustomEvent('gsh:question-start')); } catch (e) {}
  },
  // ── D2 (2026-08-10): ปุ่ม [ 查看詳細解說 ] opt-in ในหน้าเฉลย — สลับเปิด/ปิดกล่อง .gsh-detail-box ที่อยู่ถัดจากปุ่มนี้ ──
  //   ไม่แตะข้อมูล/การคำนวณ ansHtml ใดๆ แค่ show/hide DOM ที่ render() สร้างไว้แล้ว
  toggleAnswerDetail: function(btn) {
    if (!btn) return;
    var box = btn.nextElementSibling;
    if (!box) return;
    var isOpen = box.style.display !== 'none';
    box.style.display = isOpen ? 'none' : '';
    btn.textContent = isOpen ? '查看詳細解說' : '收起詳細解說';
  },
  // Resume saved safe point: restore completed evidence and continue at the saved word.
  resumeSavedSession: function() {
    var data = __tfResumeSnapshot;
    tfHideResumeBanner();
    if (!data) return;
    try { if (typeof gtag === 'function') gtag('event','tone_finder_resume_continue',{category:'game'}); } catch (e) {}
    if (data.level === 3) {
      var sentenceIdx=tfResumeSentenceIndex(data);
      if (sentenceIdx != null) {
        TF.startAdvSentence(sentenceIdx);
        tfRestoreSavedProgress(data);
      } else {
        tfClearResumeState();
        TF._startRandom5();
      }
      return;
    }
    var entries = tfResolveResumeEntries(data.wordIds,data.level);
    if (!entries) { tfClearResumeState(); TF._startRandom5(); return; }
    selectedLevel = data.level || 1;
    selectedCategory = 'ทั้งหมด';
    startSetSession(entries, { keepOrder: true });
    tfRestoreSavedProgress(data);
  },
  restartSavedSession: function() {
    var data=__tfResumeSnapshot;tfHideResumeBanner();if(!data)return;
    selectedLevel=data.level||1;
    if(data.level===3){var sentenceIdx=tfResumeSentenceIndex(data);if(sentenceIdx!=null){TF.startAdvSentence(sentenceIdx);return;}tfClearResumeState();TF._startRandom5();return;}
    var entries=tfResolveResumeEntries(data.wordIds,data.level);
    if(entries)startSetSession(entries,{keepOrder:true});else{tfClearResumeState();TF._startRandom5();}
  },
  startNewFromResume: function() {
    var data=__tfResumeSnapshot;tfHideResumeBanner();tfClearResumeState();selectedLevel=(data&&data.level)||selectedLevel||1;TF._startRandom5();
  },
  // ปุ่ม 重新開始 บนแถบ resume — แค่ทิ้งข้อมูล resume เก่า (session ที่ auto-start ไปแล้วตอนโหลดหน้าเล่นต่อได้ปกติ ไม่ต้องทำอะไรเพิ่ม)
  dismissResumeBanner: function() {
    try { if (typeof gtag === 'function') gtag('event','tone_finder_resume_dismiss',{category:'game'}); } catch (e) {}
    tfClearResumeState();
    tfHideResumeBanner();
  },
  // ── F2 (2026-08-10): เปิด/ปิดหน้า 查看錯題 — แค่สลับ S.step ไปมา ไม่แตะ session/hist/score เลย (อ่านอย่างเดียว) ──
  showMistakeReview: function() {
    if (!session) return;
    S = { word: '', step: 'mistake-review', path: [], tone: null };
    render();
  },
  backToMistakeSummary: function() {
    S = { word: '', step: 'session-summary', path: [], tone: null };
    render();
  },
  // ── ปุ่มถามคำถามในเกม → ส่งเข้า Gmail ของ LIN ผ่าน Web3Forms (ผู้เล่นพิมพ์เอง + แนบคำที่กำลังเล่น) ──
  openAsk: function() {
    try{ if(typeof gtag==='function') gtag('event','tone_finder_ask_open',{category:'game'}); }catch(e){}
    var old = document.getElementById('tf-ask-ov'); if (old) old.remove();
    var lvl = ({1:'初級',2:'中級',3:'高級'})[selectedLevel] || '—';
    var ctxWord = (typeof S !== 'undefined' && S && S.word) ? S.word : '—';
    var ctxCat = selectedCategory || '—';
    var ctxStr = '目前題目：' + ctxWord + '　|　等級：' + lvl + '　|　主題：' + ctxCat;
    var div = document.createElement('div');
    div.id = 'tf-ask-ov'; div.className = 'tf-ask-overlay';
    div.innerHTML =
      '<div class="tf-ask-box">' +
        '<div class="tf-ask-title">❓ 我有問題 / มีคำถาม</div>' +
        '<div class="tf-ask-sub">在練習中卡住了嗎？把問題寫下來，老師會收到並回覆你 🙏</div>' +
        '<div class="tf-ask-ctx" id="tf-ask-ctx">' + ctxStr + '</div>' +
        '<input class="tf-ask-input" id="tf-ask-email" type="email" placeholder="你的 Email（方便老師回覆，可留空）">' +
        '<textarea class="tf-ask-textarea" id="tf-ask-msg" placeholder="想問的問題…（例：這個字為什麼是第幾聲？）"></textarea>' +
        '<div class="tf-ask-actions">' +
          '<button class="tf-ask-cancel" onclick="try{if(typeof gtag===\'function\')gtag(\'event\',\'tone_finder_ask_cancel\',{category:\'game\'});}catch(e){}TF.closeAsk()">取消</button>' +
          '<button class="tf-ask-send" id="tf-ask-send" onclick="try{if(typeof gtag===\'function\')gtag(\'event\',\'tone_finder_ask_submit\',{category:\'game\'});}catch(e){}TF.submitAsk()">送出問題 →</button>' +
        '</div>' +
      '</div>';
    div.addEventListener('click', function(e){ if (e.target === div) div.remove(); });
    document.body.appendChild(div);
    div.setAttribute('data-ctx', ctxStr);
  },
  closeAsk: function(){ var o=document.getElementById('tf-ask-ov'); if(o) o.remove(); },
  submitAsk: function() {
    var ov = document.getElementById('tf-ask-ov'); if (!ov) return;
    var msgEl = document.getElementById('tf-ask-msg');
    var emailEl = document.getElementById('tf-ask-email');
    var sendBtn = document.getElementById('tf-ask-send');
    var msg = (msgEl && msgEl.value || '').trim();
    if (!msg) { if (msgEl) { msgEl.focus(); msgEl.style.borderColor = '#cc4444'; } return; }
    var ctx = ov.getAttribute('data-ctx') || '';
    var email = (emailEl && emailEl.value || '').trim();
    if (sendBtn) { sendBtn.disabled = true; sendBtn.textContent = '送出中…'; }
    var payload = {
      access_key: 'b3bfdb97-19dd-4910-bd15-89720be846c2',  // LIN 2026-06-19: ใช้คีย์เดียวกับฟอร์ม 學生回饋 (ตัวที่เมลเข้าจริง)
      subject: '【聲調工具】學生提問 / คำถามจากผู้เล่น',
      from_name: '聲調工具 提問',
      email: email || 'no-reply@mrtaihualin.com',
      message: '問題：\n' + msg + '\n\n— 情境 —\n' + ctx + '\n回覆信箱：' + (email || '（未填）')
    };
    fetch('https://api.web3forms.com/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(payload)
    }).then(function(r){ return r.json(); }).then(function(d){
      if (!d || !d.success) throw new Error((d && d.message) || 'submit failed');
      var box = ov.querySelector('.tf-ask-box');
      if (box) box.innerHTML = '<div class="tf-ask-ok">✅ 已送出！老師收到後會回覆你 🙏</div>' +
        '<div class="tf-ask-actions"><button class="tf-ask-send" onclick="try{if(typeof gtag===\'function\')gtag(\'event\',\'tone_finder_ask_close_success\',{category:\'game\'});}catch(e){}TF.closeAsk()">關閉</button></div>';
      setTimeout(function(){ TF.closeAsk(); }, 2200);
    }).catch(function(){
      if (sendBtn) { sendBtn.disabled = false; sendBtn.textContent = '送出問題 →'; }
      alert('送出失敗，請稍後再試或用 LINE 聯絡老師。');
    });
  },
  downloadReport: function() {
    if (!session) return;
    // LIN 2026-06-19: html2pdf (html2canvas) ออกไฟล์ "ว่างเปล่า" บนคอม (ปัญหา render นอกจอ) + ค้างบนมือถือ
    //   → ใช้หน้าต่าง print ทั้งคอมและมือถือ (กด "บันทึกเป็น PDF" ในกล่อง print ของระบบ) เสถียร เห็นเนื้อหาจริงครบ
    //   ถ้าอยากกลับไปดาวน์โหลดไฟล์ตรงๆ ด้วย html2pdf ค่อยเปิดบล็อกเดิมคืน (อยู่ใน backup_20260619)
    openReportPrint();
  },
// Lin 2026-07-25: ปิดโหมด 自行搜尋 ถาวรตามที่ Lin สั่ง (ไม่ใช้แล้ว) — ลบทั้งระบบออก  [TF.downloadSearchReport]
  backToLevelSelect: function() {
    selectedLevel = null;
    selectedCategory = null;
    S = { word:'', step:'level-select', path:[], tone:null };
    hist=[]; histPos=-1;
    render();
  },
  // Lin 2026-07-25: ลบ TF.sgToggle ทิ้ง — แถบปุ่ม 泰文讀音/英文讀音 ในหน้าเดาถูกเอาออกแล้ว
  tip: function(keys) { showTip(keys); },
  _run: function(id) { if(_acts[id]) _acts[id](); }
};

// ════════════════════════════════════════════════════════════
// INIT
// ════════════════════════════════════════════════════════════
// คืนค่าฟอนต์โมเดิร์นที่ผู้ใช้เคยเลือก
try {
  if (localStorage.getItem('tf_modern_font') === '1') {
    document.body.classList.add('tf-modern-font'); // Lin 2026-07-25: ลบโค้ดตั้งปุ่มเก่า #tf-font-btn ออก (ปุ่มไม่มีในหน้าแล้ว)
  }
} catch(e){}
// Lin 2026-07-25: ตั้งไอคอนปุ่ม 讀音 (🐣/🥚) + 英文讀音 (🔡/🔠) ตามค่าที่จำไว้ ตั้งแต่โหลดหน้า
function tfSyncMenuBtns() { tfSyncReadBtns(); tfSyncGuideBtn(); }
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', tfSyncMenuBtns); else tfSyncMenuBtns();
// ── render challenge banner + streak chips + ⭐/🌱 ในแถบนอก tf-card ──
function tfRenderExtBar() {
  try {
    // challenge banner
    var cp = tfChallengeState();
    var pct = Math.min(100, Math.round(cp.st.progress / cp.ch.target * 100));
    var daysLeft = Math.max(0, Math.ceil((tfWeekEndMs() - Date.now()) / 86400000));
    var ban = document.getElementById('tf-challenge-banner');
    if (ban) ban.innerHTML =
      '<div class="tf-challenge-banner' + (cp.st.done ? ' done' : '') + '" style="margin-bottom:0;">' +
        '<div class="tf-ch-top"><span class="tf-ch-emoji">' + cp.ch.emoji + '</span>' +
          '<span class="tf-ch-title">本週挑戰：' + cp.ch.title + (cp.st.done ? ' ✅ 完成！' : '') + '</span>' +
          '<span class="tf-ch-left">⏳ ' + daysLeft + ' 天</span></div>' +
        '<div class="tf-ch-bar"><div class="tf-ch-fill" style="width:' + pct + '%;"></div></div>' +
        '<div class="tf-ch-sub">' + cp.ch.sub + '　' + cp.st.progress + ' / ' + cp.ch.target + '</div>' +
      '</div>';
    // streak chips
    var st = tfLoadStreak();
    var sn = document.getElementById('tf-streak-num'); if (sn) sn.textContent = (st.streak || 0);
    var fn = document.getElementById('tf-freeze-num'); if (fn) fn.textContent = 0;
    // ⭐ ดาว + 🌱 แบดจ์
    var stars = (window.GAME_ACCOUNT) ? GAME_ACCOUNT.getStars() : 0;
    var badges = (window.GAME_ACCOUNT) ? GAME_ACCOUNT.earnedBadges() : [];
    var sc = document.getElementById('tf-star-count'); if (sc) sc.textContent = stars;
    var bc = document.getElementById('tf-badge-count'); if (bc) bc.textContent = badges.length;
    var be = document.getElementById('tf-badge-emoji');
    if (be) {
      var lastBadge = badges.length ? badges[badges.length - 1] : null;
      be.textContent = lastBadge ? (lastBadge.emoji || '🌱') : '🌱';
    }
  } catch(e) {}
}

// Lin 2026-07-10: เข้าเกมมาให้เริ่มเล่น 初級 คำแรกทันทีเหมือนเกมอื่น (ไม่ต้องกดเลือกระดับก่อน)
// Time Auto Plan: ระดับที่ยืนยันจาก proposal ชนะเฉพาะ active matching plan และไม่เปิด resume เก่ามาทับ
var __tfAutoPlanLevel = (window.StudyPlan && StudyPlan.preferredLevel) ? StudyPlan.preferredLevel('tone') : null;
if (__tfAutoPlanLevel !== 1 && __tfAutoPlanLevel !== 2 && __tfAutoPlanLevel !== 3) __tfAutoPlanLevel = null;
// E3 (2026-08-10): อ่าน resume ที่ค้างไว้ "ก่อน" TF.selectLevel(1) เสมอ — เพราะ selectLevel(1) จะเรียก
// startSetSession() ซึ่ง save resume ของ session ใหม่ทับ localStorage ทันที ถ้าไปอ่านทีหลังจะเจอแต่ของใหม่ ไม่เจอของเก่า
if (!__tfAutoPlanLevel) {
  try { __tfResumeSnapshot = (window.GameResume && GameResume.load('tone-finder')) || null; } catch (e) { __tfResumeSnapshot = null; }
}
TF.selectLevel(__tfAutoPlanLevel || 1);
setTimeout(tfRenderExtBar, 0);
if (!__tfAutoPlanLevel && __tfResumeSnapshot) { var __tfResumeCaptured = __tfResumeSnapshot; setTimeout(function () { tfShowResumeBannerIfAny(__tfResumeCaptured); }, 0); }

// Lin 2026-07-10: ซ่อนแถบ page-strip ล่างจอเฉพาะตอนเบราว์เซอร์เข้าโหมดเต็มจอจริง (Fullscreen API)
(function () {
  function _syncFs() {
    var isFs = !!(document.fullscreenElement || document.webkitFullscreenElement);
    document.body.classList.toggle('tf-is-fullscreen', isFs);
  }
  ['fullscreenchange', 'webkitfullscreenchange'].forEach(function (ev) {
    document.addEventListener(ev, _syncFs);
  });
  _syncFs();
})();
// Lin 2026-07-25: ปิดโหมด 自行搜尋 ถาวรตามที่ Lin สั่ง (ไม่ใช้แล้ว) — ลบทั้งระบบออก  [ตัวรับลิงก์ ?word=]
