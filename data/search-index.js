// ===================================================================
// 🔍 SEARCH-INDEX — index รวมทั้งเว็บ สำหรับ Search MVP (2026-08-09)
//
//   single source ของรายการที่ search หาเจอได้ทั้งเว็บ (เกม/คอร์ส/บทความ/
//   FAQ/รีวิว/วิธีใช้เว็บ ฯลฯ) — เนื้อหา title/desc ของบทความดึงมาจาก
//   <title>/<meta description> ของหน้าจริงตรงๆ ไม่ได้แต่งขึ้นใหม่
//   ส่วน keyword ของเกม อ้างอิงจาก mapping ที่ Lin กำหนดไว้ใน
//   73_CLAUDE_UPDATE (หัวข้อ D. Search ใน games.html)
//
//   category: 'practice' (練習=เกม) | 'content' (學習內容=บทความ/วิดีโอ/เพลง)
//             | 'course' (課程=ทดลองเรียน/ราคา) | 'site' (網站使用=FAQ/เกี่ยวกับครู/วิธีใช้)
//   access: 'free' | 'premium' — MVP นี้ทุกอันเป็น free แต่เผื่อ schema ไว้อนาคต
// ===================================================================
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.SEARCH_INDEX = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ── 練習 (เกม 7 ตัว) — keyword ตาม mapping ที่ Lin กำหนดไว้ใน 73_CLAUDE_UPDATE หัวข้อ D ──
  var GAMES = [
    {
      id: 'game-tone', category: 'practice', access: 'free',
      title: '泰語聲調練習室', href: '/tone-finder.html',
      desc: '看字猜聲調，練耳朵也練發音，五個聲調不再混。',
      keywords: ['聲調','尾音','長短音','看字不會唸','唸不出聲調','分不出聲調','發音不準','tone','泰國人聽不懂我說話','泰國人聽不懂我']
    },
    {
      id: 'game-reading', category: 'practice', access: 'free',
      title: '泰語拼讀練習室', href: '/reading-game.html',
      desc: '把音節拼起來讀對每個字，分組練習拼讀規則。',
      keywords: ['拼讀','斷詞','看不懂泰文字','讀不出來','子音母音','拼字','reading']
    },
    {
      id: 'game-listening', category: 'practice', access: 'free',
      title: '泰語聽力練習室', href: '/listening-game.html',
      desc: '聽發音選出來或打出來，練耳朵也練拼寫。',
      keywords: ['聽力','聽不懂','聽不清楚','泰國人說話聽不懂','沒有字幕聽不懂','抓不到單字','listening','聽不懂泰國人說話','我聽不懂泰國人說話','聽打','聽寫','聽音打字']
    },
    {
      id: 'game-typing', category: 'practice', access: 'free',
      title: '泰語打字練習室', href: '/typing-game.html',
      desc: '照泰文鍵盤打出正確拼寫，練打字也練拼字。',
      keywords: ['打字','鍵盤','打字慢','想用泰文聊天','LINE打泰文','typing']
    },
    {
      id: 'game-word-order', category: 'practice', access: 'free',
      title: '泰語語序練習室', href: '/word-order.html',
      desc: '把打散的詞語點回正確順序，專攻高級句型語序邏輯。',
      keywords: ['語序','詞序','單字都會排不出句子','中文直翻','造不出句子','想講完整句子','word order','排不好','排錯順序','順序排錯']
    },
    {
      id: 'game-lego', category: 'practice', access: 'free',
      title: '泰語造句練習室', href: '/lego.html',
      desc: '像積木一樣挑詞組成句子，能拆句測驗檢查自己的句子。',
      keywords: ['造句','組句子','積木','自己造句','句子結構']
    },
    {
      id: 'game-challenge', category: 'practice', access: 'free',
      title: '泰語遊戲挑戰室', href: '/games-challenge.html',
      desc: '同一個字連闖三關，一次練到底，目前開放初級關卡。',
      keywords: ['挑戰','連闖三關','綜合練習','混合題型','闖關']
    }
  ];

  // ── 課程 (免費試聽/課程資訊) ──
  var COURSE = [
    {
      id: 'course-trial', category: 'course', access: 'free',
      title: '預約免費體驗課', href: '/trial.html',
      desc: '30 分鐘免費體驗課，中文授課，線上預約時段。',
      keywords: ['試聽','體驗課','免費試聽','預約上課','想學泰語','報名','怎麼開始學']
    },
    {
      id: 'course-pricing', category: 'course', access: 'free',
      title: '費用方案與上課方式', href: '/pricing.html#pricing',
      desc: '課程價格、上課方式、堂數方案說明。',
      keywords: ['費用','價格','多少錢','上課方式','堂數','方案']
    }
  ];

  // ── 網站使用 (FAQ 8 題 · 從 faq.html 原文問句抽出，一字未改) ──
  var FAQ = [
    { id: 'faq-1', category: 'site', access: 'free', title: '初學者適合報名嗎？', href: '/faq.html#faq', desc: '', keywords: ['初學者','零基礎','完全不會','適合嗎'] },
    { id: 'faq-2', category: 'site', access: 'free', title: '已有中高級程度，還適合上課嗎？', href: '/faq.html#faq', desc: '', keywords: ['中高級','已經會一點','程度好還要上課嗎'] },
    { id: 'faq-3', category: 'site', access: 'free', title: '一定要學讀寫嗎？', href: '/faq.html#faq', desc: '', keywords: ['讀寫','要不要學文字','只學會話'] },
    { id: 'faq-4', category: 'site', access: 'free', title: '需要每週固定上課嗎？', href: '/faq.html#faq', desc: '', keywords: ['固定時間','彈性','每週上課'] },
    { id: 'faq-5', category: 'site', access: 'free', title: '上課使用什麼語言授課？', href: '/faq.html#faq', desc: '', keywords: ['用中文教嗎','授課語言'] },
    { id: 'faq-6', category: 'site', access: 'free', title: '上課時間可以彈性調整嗎？', href: '/faq.html#faq', desc: '', keywords: ['調課','改時間','彈性調整'] },
    { id: 'faq-7', category: 'site', access: 'free', title: '大概學多久才能真正開口說話？', href: '/faq.html#faq', desc: '', keywords: ['多久','要學多久','多快能開口'] },
    { id: 'faq-8', category: 'site', access: 'free', title: '線上還是實體上課？', href: '/faq.html#faq', desc: '', keywords: ['線上','實體','上課地點'] },
    { id: 'site-about', category: 'site', access: 'free', title: '關於老師', href: '/index.html#teacher', desc: '老師背景、教學理念介紹。', keywords: ['老師是誰','關於老師','教學理念','背景'] },
    { id: 'site-testimonials', category: 'site', access: 'free', title: '學生回饋與評價', href: '/pricing.html#testimonials', desc: '學生真實上課心得。', keywords: ['評價','心得','評論','別人的經驗','學生怎麼說'] },
    { id: 'site-community', category: 'site', access: 'free', title: '泰語學習心聲與提問', href: '/community.html', desc: '學習者提問與分享交流區。', keywords: ['提問','發問','交流','分享心得'] },
    { id: 'site-rules', category: 'site', access: 'free', title: '上課須知', href: '/faq.html#rules', desc: '上課規範、請假規則等說明。', keywords: ['上課規則','請假','須知'] }
  ];

  // ── 學習內容 (資源 — 歌曲/影片) ──
  var CONTENT_RESOURCES = [
    { id: 'res-songs', category: 'content', access: 'free', title: '用歌曲學泰語', href: '/resources.html#songs', desc: '精選泰文歌曲逐句拆解歌詞，邊聽邊學發音。', keywords: ['歌曲','唱歌學泰語','歌詞','泰文歌'] },
    { id: 'res-playlists', category: 'content', access: 'free', title: 'YouTube 教學影片播放清單', href: '/resources.html#playlists', desc: '依主題分類的教學影片清單。', keywords: ['影片','YouTube','教學影片','播放清單'] }
  ];

  // ── 學習內容 (บทความ 44 篇 — title/desc คัดจาก <title>/<meta description> ของแต่ละหน้าจริง) ──
  var ARTICLES = [
    { id:'a-1on1-guide', category:'content', access:'free', title:'學泰語為什麼要找老師一對一？不只是看影片、用 APP 就好', href:'/blog/1on1-guide.html', desc:'看YouTube、用APP自學泰語為什麼還是卡關，一對一能解決哪些自學解決不了的問題。', keywords:['自學','一對一','找老師','APP學泰語'] },
    { id:'a-adult-learning', category:'content', access:'free', title:'學泰語別學小孩「自然習得」：大人沒有十幾年可以慢慢摸索', href:'/blog/adult-learning-guide.html', desc:'大人學語言跟小孩自然習得不一樣，時間跟環境都不同。', keywords:['大人學語言','自然習得','學習方法'] },
    { id:'a-cant-hear', category:'content', access:'free', title:'在泰國住 30 年，發音就會準嗎？聽得懂不代表你聽得出來', href:'/blog/cant-hear-guide.html', desc:'住在泰國久了發音不一定準，泰語發音的細微差異很容易被忽略。', keywords:['發音不準','住泰國','聽得懂發音不準'] },
    { id:'a-group-vs-1on1', category:'content', access:'free', title:'學泰語團體班 vs 一對一：兩小時的課，你自己真的講到幾分鐘？', href:'/blog/group-vs-1on1-guide.html', desc:'誠實比較團體班跟一對一，實際開口講話時間差多少。', keywords:['團體班','一對一比較','上課方式選擇'] },
    { id:'a-interpreter', category:'content', access:'free', title:'想當泰語導遊、翻譯？泰語程度要練到什麼水準', href:'/blog/guide-interpreter.html', desc:'台灣導遊考試泰語考科制度，以及實際工作場合需要的泰語能力。', keywords:['導遊','翻譯','口譯','考試','工作用泰語'] },
    { id:'a-how-long', category:'content', access:'free', title:'學泰語要多久？從零開始到能開口對話要多久', href:'/blog/how-long-guide.html', desc:'用語言學習難度分級資料，給一個誠實的學習時間概念。', keywords:['要多久','學習時間','多快學會'] },
    { id:'a-lego-guide', category:'content', access:'free', title:'泰語造句好難？「樂高造句練習室」開放免費體驗，一步步組出完整句子', href:'/blog/lego-guide.html', desc:'樂高式造句練習室介紹，像積木一樣挑主語動詞受詞組成句子。', keywords:['造句','樂高','組句子'] },
    { id:'a-output', category:'content', access:'free', title:'背了很多泰語單字卻講不出來？只有 input 沒有 output 的問題', href:'/blog/output-guide.html', desc:'背單字跟會說話是兩件事，怎麼從只有輸入變成真正開口。', keywords:['背單字沒用','講不出來','輸入輸出'] },
    { id:'a-phonics', category:'content', access:'free', title:'泰語一定要學拼音規則嗎？為什麼發音比認字更重要', href:'/blog/phonics-guide.html', desc:'拼音規則牽涉子音分類、母音長短、聲調規則，說明為什麼值得學。', keywords:['拼音規則','子音母音','拼讀規則'] },
    { id:'a-pronunciation', category:'content', access:'free', title:'為什麼泰國人聽不懂我的泰語？發音不準是最常見的原因', href:'/blog/pronunciation-guide.html', desc:'台灣人最常忽略的尾音、聲調錯誤，發音為什麼比想像中細膩。', keywords:['泰國人聽不懂我','發音不準','尾音','聲調錯誤'] },
    { id:'a-reading-guide', category:'content', access:'free', title:'泰文怎麼拼讀？「拼讀練習室」開放免費體驗，親手拼出子音母音聲調', href:'/blog/reading-guide.html', desc:'拼讀練習室介紹，親手把單字的零件一個個拼出來。', keywords:['拼讀','子音母音太多','怎麼拼讀'] },
    { id:'a-selfstudy-vs', category:'content', access:'free', title:'自學泰語 vs 找老師一對一：怎麼選？優缺點老實比較', href:'/blog/selfstudy-vs-teacher.html', desc:'分階段建議什麼程度適合自學、什麼時候該找老師。', keywords:['自學還是找老師','要不要找老師'] },
    { id:'a-texting', category:'content', access:'free', title:'只會講不會打字？這年代交泰國朋友，不會打字比不會講更麻煩', href:'/blog/texting-era-guide.html', desc:'只練口說不練打字，跟泰國朋友用LINE聯絡會遇到的問題。', keywords:['打字','LINE聊天','不會打字'] },
    { id:'a-thai-chinese', category:'content', access:'free', title:'泰語跟中文有關係嗎？台灣人學泰語其實比想像中容易上手', href:'/blog/thai-chinese-guide.html', desc:'泰語裡藏著潮州話、閩南語的痕跡，數字食物名稱都有熟悉的影子。', keywords:['泰語跟中文','潮州話','容易學嗎'] },
    { id:'a-theory-01', category:'content', access:'free', title:'泰語單字背了幾百個，為什麼還是講不出來？「記得住」跟「用得出來」是兩種記憶', href:'/blog/theory-01-memorize-vs-use.html', desc:'陳述性記憶還沒轉成程序性記憶的問題。', keywords:['背單字講不出來','記憶類型'] },
    { id:'a-theory-02', category:'content', access:'free', title:'泰語聽不懂，其實是「聽不到」？母語聲音濾鏡如何改寫你耳朵聽到的東西', href:'/blog/theory-02-l1-sound-filter.html', desc:'知覺同化模型解釋為什麼台灣人分不出泰語某些發音差異。', keywords:['聽不懂','聽不到差異','母語濾鏡'] },
    { id:'a-theory-03', category:'content', access:'free', title:'學泰語就像學開車：為什麼一開始每件事都要同時想，久了卻能邊講邊笑', href:'/blog/theory-03-like-driving.html', desc:'認知負荷與自動化理論，說明從手忙腳亂到脫口而出的過程。', keywords:['學習過程','越練越順','自動化'] },
    { id:'a-theory-04', category:'content', access:'free', title:'泰國人聽不懂你講什麼，通常不是錯一個地方——而是好幾個小破口剛好對齊', href:'/blog/theory-04-swiss-cheese.html', desc:'起司理論解釋聲調、母音長短、語序、語速多個小錯誤疊加的問題。', keywords:['泰國人聽不懂','多個錯誤疊加'] },
    { id:'a-theory-05', category:'content', access:'free', title:'學泰語最被低估的一步：先「讀得懂」，因為閱讀會利滾利', href:'/blog/theory-05-reading-compounds.html', desc:'閱讀是詞彙量成長的複利引擎。', keywords:['閱讀重要性','看得懂泰文字'] },
    { id:'a-theory-06', category:'content', access:'free', title:'練泰文打字不是在練手指，是在練語言：一個被誤會的高效練習', href:'/blog/theory-06-typing-is-learning.html', desc:'打字是強迫產出練習，逼你逐字母重建拼寫。', keywords:['打字練習','為什麼要練打字'] },
    { id:'a-theory-07', category:'content', access:'free', title:'泰語聲調規則背得滾瓜爛熟，為什麼一開口還是錯？規則跟直覺是兩回事', href:'/blog/theory-07-tone-game-vs-rules.html', desc:'大量判斷練習比背規則有效，即時回饋建立聲調直覺。', keywords:['聲調規則沒用','背規則還是錯'] },
    { id:'a-theory-08', category:'content', access:'free', title:'拼得出來 vs 一眼就認得：讀泰文其實是兩種不同的能力', href:'/blog/theory-08-decoding-vs-sight-words.html', desc:'逐字母拼讀跟整字直接辨認，兩種能力用途不同。', keywords:['拼讀跟認字','兩種讀法'] },
    { id:'a-theory-09', category:'content', access:'free', title:'從單字到句子，中間到底要練什麼？「詞塊」是被跳過的那一步', href:'/blog/theory-09-word-to-sentence.html', desc:'公式化語塊理論，說明從單字到自由造句中間的步驟。', keywords:['單字到句子','詞塊','造不出句子'] },
    { id:'a-theory-10', category:'content', access:'free', title:'聽力是最容易「自我感覺良好」的技能：為什麼你以為的進步常常是錯覺', href:'/blog/theory-10-listening-illusion.html', desc:'大腦用情境跟猜測補滿聽不清楚的地方，造成聽力錯覺。', keywords:['聽力錯覺','以為聽懂了'] },
    { id:'a-theory-11', category:'content', access:'free', title:'母語者為什麼不用想聲調、不用想文法？「自動化」如何把語言變成反射動作', href:'/blog/theory-11-automaticity-endpoint.html', desc:'技能習得三階段理論，說明自動化的終點長什麼樣。', keywords:['自動化','不用想直接講'] },
    { id:'a-theory-12', category:'content', access:'free', title:'泰語自學地圖：從零開始到能開口的 10 個階段（整套系統總整理）', href:'/blog/theory-12-roadmap-10-steps.html', desc:'把泰語自學拆成 10 個階段，每一步該練什麼。', keywords:['自學地圖','學習路徑','不知道下一步練什麼'] },
    { id:'a-theory-13', category:'content', access:'free', title:'單字量明明很大，講話卻常常詞窮？「認得出」跟「叫得出來」是兩種不同的字彙量', href:'/blog/theory-13-receptive-vs-productive.html', desc:'接受性字彙跟產出性字彙本來就不一樣大。', keywords:['詞窮','認得但講不出來'] },
    { id:'a-theory-14', category:'content', access:'free', title:'為什麼學泰語第一天就覺得腦袋要爆炸？認知負荷理論告訴你怎麼拆才不會累死', href:'/blog/theory-14-cognitive-overload-day-one.html', desc:'新字母、聲調、沒有空格的拼寫同時面對造成的負荷。', keywords:['一開始很難','腦袋爆炸','初學者困難'] },
    { id:'a-theory-15', category:'content', access:'free', title:'泰語聽起來是一長串黏在一起的聲音，根本分不出哪裡是一個詞？問題出在「切開」之前', href:'/blog/theory-15-speech-segmentation.html', desc:'語音切分要靠後天訓練，不是反應慢。', keywords:['聽起來黏在一起','分不出單字邊界'] },
    { id:'a-theory-16', category:'content', access:'free', title:'泰語子音、母音、尾音一次全部學？為什麼「先拆開」才是真正的捷徑', href:'/blog/theory-16-phonics-parts-before-whole.html', desc:'先拆開子音母音尾音再合起來學，符合認知負荷理論。', keywords:['子音母音尾音','拆開學','拼音順序'] },
    { id:'a-theory-17', category:'content', access:'free', title:'練錯了自己不會發現——為什麼「立刻被糾正」是學泰語進步最快的方法', href:'/blog/theory-17-immediate-feedback.html', desc:'沒有即時回饋，練習只會讓錯誤變得更熟練。', keywords:['即時回饋','自己練習沒進步','糾正發音'] },
    { id:'a-theory-18', category:'content', access:'free', title:'單字都會，排出來的泰語句子卻怪怪的？排順序比你想像中難得多', href:'/blog/theory-18-word-order-harder.html', desc:'泰語詞序不是照中文順序翻，需要當成一個技能練。', keywords:['語序','排順序','句子怪怪的'] },
    { id:'a-theory-19', category:'content', access:'free', title:'打字打得出正確泰語句子，一開口卻整個卡住——中間漏掉的那一段', href:'/blog/theory-19-write-vs-speak-gap.html', desc:'書寫跟口說是兩條不同的處理路徑。', keywords:['會打字不會講','書寫口說差異'] },
    { id:'a-theory-20', category:'content', access:'free', title:'從「腦中先翻譯」到「直接用泰語想」——這條路徑其實有科學根據', href:'/blog/theory-20-thinking-in-thai.html', desc:'雙語心理學的階層修正模型，說明用泰語思考的路徑。', keywords:['用泰語思考','不要先翻譯','腦中翻譯'] },
    { id:'a-theory-21', category:'content', access:'free', title:'背了快 1,000 個泰語單字，聊個簡單話題還是卡住？問題出在「功能詞塊」不是單字量', href:'/blog/theory-21-vocab-vs-chat.html', desc:'決定能不能開口聊天的是打招呼、點餐、閒聊的功能詞塊。', keywords:['單字量很大但不會聊天','功能詞塊'] },
    { id:'a-theory-22', category:'content', access:'free', title:'越怕講錯泰語，講起來越不順？「情感濾網」如何真的把話卡在嘴邊', href:'/blog/theory-22-fear-of-mistakes.html', desc:'情感濾網假說解釋焦慮如何擋住語言輸出。', keywords:['怕講錯','緊張講不出來','情感濾網'] },
    { id:'a-theory-23', category:'content', access:'free', title:'開口前總要在腦中先翻譯一次？這個習慣正在讓你的泰語永遠慢半拍', href:'/blog/theory-23-mental-translation.html', desc:'腦中翻譯的路徑為什麼比較慢，怎麼改掉這個習慣。', keywords:['先翻譯再講','講話慢半拍'] },
    { id:'a-theory-24', category:'content', access:'free', title:'泰劇看了一整天，泰語還是講不出口？「只有輸入」為什麼永遠不夠', href:'/blog/theory-24-input-not-enough.html', desc:'輸入假說跟輸出假說，說明只吸收不產出的問題。', keywords:['看泰劇沒用','只輸入不輸出'] },
    { id:'a-theory-25', category:'content', access:'free', title:'大人學語言真的比小孩慢嗎？關鍵期假說沒告訴你的另一半事實', href:'/blog/theory-25-adults-vs-kids.html', desc:'關鍵期假說研究真正發現了什麼，成人學習者的優勢。', keywords:['大人學語言慢嗎','關鍵期假說'] },
    { id:'a-tone-guide', category:'content', access:'free', title:'泰語聲調怎麼練？「聲調練習室」開放免費體驗，邊玩邊記 5 個聲調', href:'/blog/tone-guide.html', desc:'聲調練習室介紹，看字猜聲調連對加分。', keywords:['聲調怎麼練','聲調總是搞混'] },
    { id:'a-travel', category:'content', access:'free', title:'去泰國旅遊必學的 10 句泰語，比英文更容易讓當地人開心', href:'/blog/travel-thai.html', desc:'旅遊最實用的 10 句泰語，問路點餐殺價都用得到。', keywords:['旅遊泰語','去泰國玩','旅遊常用句'] },
    { id:'a-typing-guide', category:'content', access:'free', title:'泰文打字怎麼學？「打字練習室」開放免費體驗，教你用泰文鍵盤盲打', href:'/blog/typing-guide.html', desc:'打字練習室介紹，鍵盤已照泰文排好位置。', keywords:['泰文打字怎麼學','泰文鍵盤'] },
    { id:'a-word-order-guide', category:'content', access:'free', title:'泰語語序總是排錯？「語序練習室」開放免費體驗，拖詞塊練出泰式語感', href:'/blog/word-order-guide.html', desc:'語序練習室介紹，把打散的詞塊點回正確順序。', keywords:['語序總是排錯','語序練習'] },
    { id:'a-word-segmentation', category:'content', access:'free', title:'泰文字全部黏在一起，根本看不出哪裡斷句？連電腦都會卡住', href:'/blog/word-segmentation-guide.html', desc:'泰文本來就沒有空格分詞，連電腦的翻譯軟體都會卡住。', keywords:['字黏在一起','看不出斷句','分不出詞'] }
  ];

  var ALL = [].concat(GAMES, COURSE, FAQ, CONTENT_RESOURCES, ARTICLES);

  var CATEGORY_LABEL = { practice: '練習', content: '學習內容', course: '課程', site: '網站使用' };

  return {
    ALL: ALL,
    GAMES: GAMES,
    CATEGORY_LABEL: CATEGORY_LABEL
  };
});
