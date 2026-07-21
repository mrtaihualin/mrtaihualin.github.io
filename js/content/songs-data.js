// ===== 🎵 เพลงไทย · Thai Songs Data =====
// เพิ่มเพลงใหม่ได้โดย copy รูปแบบ entry ด้านล่าง
// workflow: Lin วาง YouTube URL → Claude ช่วยสร้าง entry ใหม่
//
// ฟิลด์:
//   id          : unique string
//   date        : วันที่วางจำหน่าย (ภาษาจีน)
//   title       : ชื่อเพลง + ศิลปิน
//   artist      : ชื่อศิลปิน
//   youtubeId   : YouTube video ID
//   playlistId  : YouTube playlist ID (ถ้าเป็น playlist)
//   level       : 'beginner' / 'intermediate' / 'advanced'
//   theme       : หมวดหมู่ (ภาษาจีน)
//   description : คำอธิบายสั้น (ภาษาจีน)
//   lyrics[]    : { thai, phonetic, zh }
//   vocabulary[]: { thai, phonetic, meaning }
//   article     : { title, eyebrow, body[{type:'p'|'h3', text}] }
//                 body text สามารถใส่ HTML ได้ (เช่น <span class="p4-th">)

var THAI_SONGS = [
  {
    id: 'lum-akat',
    date: '2026年6月19日',
    title: 'หลุมอากาศ — PALMY',
    artist: 'PALMY',
    youtubeId: 'QaPxz1I2nto',
    playlistId: '',
    level: 'intermediate',
    theme: '失戀・思念',
    description: '泰國國民歌姬 PALMY 以「亂流」比喻失去摯愛後的窒息感，出自她住院時的真實心情，飄浮式唱腔讓整首歌像懸在半空。',
    lyrics: [
      // Verse 1
      { thai: 'เมื่อฉันนั้นล้มทั้งยืนไม่ยอมตื่น',        phonetic: 'muea chan nan lom tang-yeun mai yom teun',         zh: '當我整個人猝然崩潰，不願醒來' },
      { thai: 'เกิดเป็นรอยแผลข้างในยังไม่ฟื้น',          phonetic: 'gert pen roi-plae kang-nai yang mai feun',         zh: '心裡留下傷口，遲遲無法復原' },
      { thai: 'ยิ่งพยายามสักเท่าไร ฉันก็ยังไม่ลืมเธอสักที', phonetic: 'ying pa-ya-yarm sak tao-rai, chan gô yang mai luem tur sak tee', zh: '再怎麼努力，還是忘不了你' },
      // Verse 2
      { thai: 'เธอกลายเป็นความทรงจำของคนอื่น',           phonetic: 'tur glai pen kwarm-song-jam kong kon eun',         zh: '你成了別人的回憶' },
      { thai: 'เก็บความจริงขังฉันไว้ทุกค่ำคืน',           phonetic: 'gep kwarm-jing kang chan wai took kam-keun',       zh: '這個事實把我囚禁在每個夜晚' },
      { thai: 'อยากกลืนตัวเองให้หายไป พาหัวใจฉันไปไกลจากเดิม', phonetic: 'yak gleun tua-eng hai hai pai, pa hua-jai chan pai glai jak derm', zh: '想把自己吞沒消失，帶著心遠走' },
      // Chorus
      { thai: 'ช่วยมาเติมให้ชีวิตฉันมีอากาศ',             phonetic: 'chuay ma term hai chee-wit chan mee aa-gat',       zh: '請來為我的生命填滿空氣' },
      { thai: 'ขาดเธอแล้วเหมือนว่าฉันไม่ได้หายใจ',        phonetic: 'kat tur laeo muean waa chan mai dai hai-jai',      zh: '少了你，就像無法呼吸' },
      { thai: 'หล่นไปในหลุมอากาศ เหวี่ยงหัวใจ หลุดล่องไปอยู่ในนั้น', phonetic: 'lon pai nai lum-aa-gat, wiang hua-jai, loot long pai yoo nai nan', zh: '墜入亂流的空洞，心被甩了出去，漂浮在裡面' },
      { thai: 'อยากขอให้เราได้พบกันใหม่ เพราะตอนนี้ฉันคิดถึงเธอทนไม่ไหว', phonetic: 'yak kor hai rao dai pop gan mai, pror ton-nee chan kit-teung tur ton mai wai', zh: '求讓我們再相見，因為現在我想你想得受不了' },
      { thai: 'บอกรักได้แค่ในใจ กอดเธอในฝันคงไม่เป็นไร',   phonetic: 'bok rak dai kae nai jai, got tur nai fan kong mai pen rai', zh: '愛只能在心裡說，在夢裡抱你，應該沒關係吧' }
    ],
    vocabulary: [
      { thai: 'หายใจ',        phonetic: 'hai-jai',       meaning: '呼吸' },
      { thai: 'อากาศ',        phonetic: 'aa-gat',        meaning: '空氣、天氣（อากาศดี = 天氣好）' },
      { thai: 'คิดถึง',       phonetic: 'kit-teung',     meaning: '想念' },
      { thai: 'ลืม',          phonetic: 'luem',          meaning: '忘記' },
      { thai: 'พยายาม',       phonetic: 'pa-ya-yarm',    meaning: '努力、盡力' },
      { thai: 'ทนไม่ไหว',     phonetic: 'ton mai wai',   meaning: '受不了、撐不住' },
      { thai: 'ความจริง',     phonetic: 'kwarm-jing',    meaning: '事實、真相' },
      { thai: 'ฝัน',          phonetic: 'fan',           meaning: '夢、做夢' },
      { thai: 'ไม่เป็นไร',    phonetic: 'mai pen rai',   meaning: '沒關係' },
      { thai: 'พบกัน',        phonetic: 'pop gan',       meaning: '見面、相遇' }
    ],
    article: {
      title: '從「หลุมอากาศ」學泰語——呼吸、想念、沒關係',
      eyebrow: '中階學習・生活詞彙',
      body: [
        { type: 'p', text: 'PALMY 是縱橫泰國樂壇二十多年的國民歌姬。「หลุมอากาศ（亂流）」寫於她住院期間，把「害怕失去摯愛、喘不過氣」的感覺，比喻成飛機突然掉進亂流——整首歌用飄浮式的唱腔，讓人真的像懸在半空。' },
        { type: 'h3', text: '📌 句型 1：動詞＋ไม่ไหว = 「…不下去、受不了」' },
        { type: 'p', text: '<span class="p4-th">ไหว</span> 表示「承受得住」，加上 <span class="p4-th">ไม่</span> 就是「撐不住」，泰國人天天掛在嘴邊：<br><br>歌詞：<span class="p4-th">คิดถึงเธอทนไม่ไหว</span> = 想你想得受不了<br>日常用法：<span class="p4-th">กินไม่ไหวแล้ว</span> = 吃不下了、<span class="p4-th">เดินไม่ไหว</span> = 走不動了、<span class="p4-th">ร้อนจนทนไม่ไหว</span> = 熱到受不了' },
        { type: 'h3', text: '📌 句型 2：ไม่เป็นไร = 「沒關係」（泰國國民口頭禪）' },
        { type: 'p', text: '歌詞最後一句 <span class="p4-th">กอดเธอในฝันคงไม่เป็นไร</span>（在夢裡抱你，應該沒關係吧）用的正是泰語第一名口頭禪：<br><br><span class="p4-th">ไม่เป็นไร</span> = 沒關係、不要緊<br>別人道謝說 <span class="p4-th">ขอบคุณ</span>、道歉說 <span class="p4-th">ขอโทษ</span>，你都可以回 <span class="p4-th">ไม่เป็นไร</span>——一個詞走遍泰國。' },
        { type: 'h3', text: '✈️ 詞彙補充：หลุมอากาศ 搭飛機用得到！' },
        { type: 'p', text: '<span class="p4-th">หลุม</span>（洞）＋<span class="p4-th">อากาศ</span>（空氣）＝飛機遇到的「亂流」。下次飛曼谷遇到晃動，空服員廣播裡說的就是這個詞：<span class="p4-th">เครื่องบินตกหลุมอากาศ</span> = 飛機遇到亂流。學歌詞順便學到旅遊實用字！' }
      ]
    }
  },
  {
    id: 'dang-jai-fan',
    date: '2026年5月30日',
    title: 'ดั่งใจฝัน (daydream) — BOWKYLION',
    artist: 'BOWKYLION',
    youtubeId: 'H7GS_VQnPY0',
    playlistId: '',
    level: 'intermediate',
    theme: '愛情・OST',
    description: '泰劇《ภพเธอ Love Upon a Time》原聲帶，BOWKYLION 以詩意歌詞唱出愛而不得的溫柔悲傷，適合中階學習者。',
    lyrics: [
      // Verse 1
      { thai: 'รู้ตัวดีตลอด ทุก ๆ คราที่กอดเธอไว้',   phonetic: 'roo-tua-dee ta-lot, tuk-tuk kra tee got tur wai',  zh: '我始終清楚，每次抱著你的時候' },
      { thai: 'ว่าตัวฉันเองก็เป็นแค่ใครที่ผ่านมา',    phonetic: 'waa tua chan eng gô pen kae krai tee pan maa',      zh: '我只不過是個過路人' },
      // Pre-Chorus
      { thai: 'แต่ความผูกพันยังชัดเจนในใจ',           phonetic: 'tae kwarm pook-pan yang chat-jen nai jai',         zh: '但心中的牽絆仍清晰' },
      { thai: 'อีกนานเท่าไร คอยภาวนา',                phonetic: 'eek nan tao-rai, koi pa-wa-na',                    zh: '還要多久，不斷祈禱' },
      { thai: 'ให้เราหลับไปและกอดเธอเอาไว้',           phonetic: 'hai rao lap pai lae got tur ao-wai',               zh: '讓我們沉睡，讓我緊抱著你' },
      { thai: 'ในห้วงเวลา',                            phonetic: 'nai huang way-la',                                zh: '在這片刻之間' },
      // Chorus
      { thai: 'อยากให้เป็นแค่ฝันตอนเราบอกลา',         phonetic: 'yak hai pen kae fan ton rao bok la',              zh: '希望我們的道別只是一場夢' },
      { thai: 'ได้แต่หวังว่าคงกลับมา',                 phonetic: 'dai tae wang waa kong glap maa',                  zh: '只能希望你會回來' },
      { thai: 'ในตอนที่ตื่น ฉันเช็ดน้ำตา',            phonetic: 'nai ton tee teun, chan chet nam-taa',              zh: '醒來的時候，我擦去淚水' },
      { thai: 'แต่ข้าง ๆ ยังเป็นเธอ',                 phonetic: 'tae kang kang yang pen tur',                      zh: '但身旁依然有你（才好）' },
      { thai: 'กลับเป็นเพียงภาพฉันและเธอจูบลา',       phonetic: 'glap pen piang pap chan lae tur joop la',         zh: '卻只剩一幀我們吻別的畫面' },
      { thai: 'หลังจากนี้คงไม่ได้เจอ',                phonetic: 'lang-jak-nee kong mai dai jur',                   zh: '從此之後再難相遇' },
      { thai: 'จะกี่ภพหมื่นแสนล้านเวลา',              phonetic: 'ja gee pop muen saen lan way-la',                 zh: '無論多少個世、千萬億年' },
      { thai: 'แต่ฉันรักเธอเสมอ',                     phonetic: 'tae chan rak tur sa-mur',                         zh: '我將永遠愛你' },
      // Bridge
      { thai: 'เธอกอดฉันดั่งใจฝัน',                  phonetic: 'tur got chan dang jai fan',                       zh: '你抱著我，就如夢中一樣' },
      { thai: 'ไม่มีวันจะจากกันไปไหน',                phonetic: 'mai mee wan ja jak-gan pai nai',                  zh: '說永遠不會離去' },
      { thai: 'แต่ความจริงนั้นจำต้องลา',              phonetic: 'tae kwarm-jing nan jam-tong la',                  zh: '但現實中不得不道別' },
      { thai: 'ต้องห่างกันไกล อยากจะหลับใหล',         phonetic: 'tong hang-gan glai, yak ja lap lai',              zh: '不得不遠離，好想沉沉睡去' }
    ],
    vocabulary: [
      { thai: 'ฝัน',          phonetic: 'fan',           meaning: '夢、做夢' },
      { thai: 'กอด',          phonetic: 'got',           meaning: '擁抱、摟抱' },
      { thai: 'รู้ตัว',       phonetic: 'roo-tua',       meaning: '意識到、知道（自己的狀態）' },
      { thai: 'ผ่านมา',       phonetic: 'pan maa',       meaning: '路過、過客' },
      { thai: 'หลับ',         phonetic: 'lap',           meaning: '睡著、入睡' },
      { thai: 'ตื่น',         phonetic: 'teun',          meaning: '醒來' },
      { thai: 'น้ำตา',        phonetic: 'nam-taa',       meaning: '眼淚' },
      { thai: 'เช็ด',         phonetic: 'chet',          meaning: '擦、擦拭（เช็ดน้ำตา = 擦眼淚）' },
      { thai: 'บอกลา',        phonetic: 'bok laa',       meaning: '道別、說再見' },
      { thai: 'กลับมา',       phonetic: 'glap maa',      meaning: '回來' },
      { thai: 'หวังว่า',      phonetic: 'wang waa',      meaning: '希望…' },
      { thai: 'รัก',          phonetic: 'rak',           meaning: '愛' }
    ],
    article: {
      title: '從「ดั่งใจฝัน」學泰語——夢、愛、眼淚',
      eyebrow: '泰劇OST・中階學習',
      body: [
        { type: 'p', text: 'BOWKYLION 是泰國當紅創作歌手，以細膩情感和詩意歌詞著稱。「ดั่งใจฝัน（Daydream）」是 2026 年泰劇《ภพเธอ Love Upon a Time》原聲帶，唱出明知是告別仍緊緊相擁的心碎愛情。以下挑出歌裡「日常生活真的會用到」的說法來學。' },
        { type: 'h3', text: '📌 句型 1：อยากให้ = 「希望（讓）…」' },
        { type: 'p', text: '<span class="p4-th">อยากให้</span> 是超實用的希望句型：<span class="p4-th">อยากให้</span> ＋ 主語 ＋ 動詞<br><br>歌詞：<span class="p4-th">อยากให้เป็นแค่ฝัน</span> = 希望只是一場夢<br>日常用法：<span class="p4-th">อยากให้เธอมาด้วย</span> = 希望你也來' },
        { type: 'h3', text: '📌 句型 2：หวังว่า… = 「希望…」（口語必備）' },
        { type: 'p', text: '歌詞 <span class="p4-th">ได้แต่หวังว่าคงกลับมา</span>（只能希望你會回來）裡的 <span class="p4-th">หวังว่า</span>，日常聊天、傳訊息天天用：<br><br><span class="p4-th">หวังว่าจะได้เจอกันอีก</span> = 希望還能再見面<br><span class="p4-th">หวังว่าพรุ่งนี้อากาศดี</span> = 希望明天天氣好' },
        { type: 'h3', text: '💬 詞彙補充：บอก＋一個字＝一句話' },
        { type: 'p', text: '<span class="p4-th">บอก</span>（告訴、說）是泰語的萬用動詞：歌詞裡的 <span class="p4-th">บอกลา</span> = 道別、<span class="p4-th">บอกรัก</span> = 告白說愛。日常還有 <span class="p4-th">บอกตรงๆ</span> = 老實說、<span class="p4-th">บอกแล้วไง</span> = 我就說吧！記住 บอก，一個字變出好多句。' }
      ]
    }
  },
  {
    id: 'jam-wai',
    date: '2026年5月20日',
    title: 'จำไว้ — INK WARUNTORN',
    artist: 'INK WARUNTORN',
    youtubeId: 'toCf8z8Gau0',
    playlistId: '',
    level: 'beginner',
    theme: '單戀・自我提醒',
    description: '合成器流行小天后 INK 新專輯首支單曲，一遍遍提醒自己「記住，他不愛你」。MV 由 Nadech 主演——他睽違 15 年再拍 MV。歌詞口語、句子短，最適合初學者。',
    lyrics: [
      // Verse 1
      { thai: 'ท่องไว้ ว่าวันนี้เราไม่ได้เป็นอะไรกัน',    phonetic: 'tong wai, waa wan-nee rao mai dai pen a-rai gan',  zh: '默念著：今天我們什麼關係都不是' },
      { thai: 'เราต้องย้ำและเตือนตัวเองว่าที่เขาเป็นห่วง', phonetic: 'rao tong yam lae teuan tua-eng waa tee kao pen huang', zh: '要一再提醒自己，他的關心' },
      { thai: 'และเขาใจดี มันไม่ใช่ความรัก',              phonetic: 'lae kao jai-dee, man mai chai kwarm-rak',          zh: '和他的溫柔，並不是愛' },
      { thai: 'จดไว้ อย่าไปคิดตีความสายตาเขาเกินจริง',    phonetic: 'jot wai, yaa pai kit tee-kwarm sai-taa kao gern jing', zh: '記下來：別過度解讀他的眼神' },
      { thai: 'ที่เขายิ้มให้กันมันก็แค่เขาเป็นกันเอง',     phonetic: 'tee kao yim hai gan man gô kae kao pen gan-eng',   zh: '他的微笑只是他天生親切' },
      { thai: 'กับทุกๆ คน ไม่ใช่กับฉันเท่านั้น',          phonetic: 'gap took-took kon, mai chai gap chan tao-nan',     zh: '對每個人都一樣，不是只對我' },
      // Pre-Chorus
      { thai: 'ฉันมันแค่ดาวดวงหนึ่งในล้าน',              phonetic: 'chan man kae dao duang neung nai lan',             zh: '我只是百萬顆星中的一顆' },
      { thai: 'ที่ล่องลอยอยู่บนท้องฟ้าของเขา',            phonetic: 'tee long-loi yoo bon tong-faa kong kao',           zh: '漂浮在他的天空' },
      { thai: 'ที่ทำได้แค่เพียงกระพริบ แต่ไม่เคยโดดเด่นสักนิด', phonetic: 'tee tam dai kae piang gra-prip, tae mai koei dot-den sak nit', zh: '只能一閃一閃，卻從不夠亮眼' },
      { thai: 'ให้เขานั้นหันมามอง',                      phonetic: 'hai kao nan han maa mong',                         zh: '讓他回頭看一眼' },
      // Chorus
      { thai: 'บอกใจอย่าไปรักเขา จำไว้เขาไม่รัก',          phonetic: 'bok jai yaa pai rak kao, jam wai kao mai rak',     zh: '告訴心別去愛他，記住，他不愛' },
      { thai: 'ถึงแม้ทำดีให้ตายเท่าไร',                  phonetic: 'teung-mae tam dee hai taai tao-rai',               zh: '就算再怎麼拼命對他好' },
      { thai: 'บอกใจอย่าไปรักเขา ถ้าเขาไม่รับรัก',        phonetic: 'bok jai yaa pai rak kao, taa kao mai rap rak',     zh: '告訴心別去愛他，若他不接受這份愛' },
      { thai: 'พอแล้วอย่าดื้ออย่าดึงหัวใจ',               phonetic: 'por laeo yaa deu yaa deung hua-jai',               zh: '夠了，別固執，別再拉扯自己的心' }
    ],
    vocabulary: [
      { thai: 'จำไว้',        phonetic: 'jam wai',       meaning: '記住（記起來放著）' },
      { thai: 'ท่องไว้',      phonetic: 'tong wai',      meaning: '默背、反覆唸給自己聽' },
      { thai: 'เตือนตัวเอง',   phonetic: 'teuan tua-eng', meaning: '提醒自己' },
      { thai: 'เป็นห่วง',      phonetic: 'pen huang',     meaning: '擔心、關心' },
      { thai: 'ใจดี',         phonetic: 'jai-dee',       meaning: '心地好、溫柔' },
      { thai: 'เป็นกันเอง',    phonetic: 'pen gan-eng',   meaning: '親切、隨和不見外' },
      { thai: 'เหงา',         phonetic: 'ngao',          meaning: '寂寞' },
      { thai: 'เป็นไปไม่ได้',  phonetic: 'pen pai mai dai', meaning: '不可能' },
      { thai: 'โดดเด่น',      phonetic: 'dot-den',       meaning: '突出、亮眼' },
      { thai: 'ดื้อ',         phonetic: 'deu',           meaning: '固執、不聽話' }
    ],
    article: {
      title: '從「จำไว้」學泰語——把話「記」進心裡的 ไว้',
      eyebrow: '初階學習・超實用句型',
      body: [
        { type: 'p', text: 'INK WARUNTORN 是泰國合成器流行（synth-pop）代表歌手。「จำไว้（記住）」是她 2026 年新專輯的首支單曲，唱給每個「明知他不愛，卻停不下來」的人。MV 更請來男神 Nadech Kugimiya——睽違 15 年再次演出 MV，話題十足。' },
        { type: 'h3', text: '📌 句型 1：動詞＋ไว้ = 「先…起來（留著）」' },
        { type: 'p', text: '<span class="p4-th">ไว้</span> 表示「做了之後保留著」，是泰語最高頻的助詞之一：<br><br>歌詞：<span class="p4-th">จำไว้</span> = 記住、<span class="p4-th">ท่องไว้</span> = 默唸著、<span class="p4-th">จดไว้</span> = 記下來<br>日常用法：<span class="p4-th">เก็บไว้</span> = 收好、<span class="p4-th">จอดรถไว้ที่นี่</span> = 把車停放在這裡' },
        { type: 'h3', text: '📌 句型 2：อย่าไป＋動詞 = 「別去…」' },
        { type: 'p', text: '<span class="p4-th">อย่า</span>（別）＋<span class="p4-th">ไป</span>＋動詞，勸阻語氣比單用 <span class="p4-th">อย่า</span> 更強調「別淌這趟渾水」：<br><br>歌詞：<span class="p4-th">บอกใจอย่าไปรักเขา</span> = 告訴心，別去愛他<br>日常用法：<span class="p4-th">อย่าไปสนใจ</span> = 別去理會' },
        { type: 'h3', text: '⭐ 詞彙補充：ฉันมันแค่… 的自嘲用法' },
        { type: 'p', text: '歌詞 <span class="p4-th">ฉันมันแค่ดาวดวงหนึ่งในล้าน</span>（我不過是百萬顆星中的一顆）裡的 <span class="p4-th">มัน</span>，不是「它」的意思，而是自嘲、貶低自己時的加強語氣詞，類似中文的「我這種人啊…」。泰語流行歌超常用，聽懂它，歌詞的酸澀感立刻加倍！' }
      ]
    }
  },
  {
    id: 'jai-jao-oei',
    date: '2026年4月30日',
    title: 'ใจเจ้าเอ๋ย — MABELZ PiXXiE',
    artist: 'MABELZ (PiXXiE)',
    youtubeId: 'MUKhdfvEUl4',
    playlistId: '',
    level: 'intermediate',
    theme: '愛情・OST',
    description: 'T-pop 女團 PiXXiE 成員 MABELZ 首次獨唱電視劇 OST，泰劇《สอดสร้อยมาลา》插曲。對著自己的心說話：「心啊心哪，為什麼偏偏愛上他？」',
    lyrics: [
      // Verse 1
      { thai: 'อาจเป็นเพียงลมพัดผ่าน ที่เธอไม่เคยต้องการ', phonetic: 'aat pen piang lom pat paan, tee tur mai koei tong-gaan', zh: '也許我只是一陣吹過的風，你從不曾需要' },
      { thai: 'ใกล้กันเท่าไร ก็เหมือนยิ่งไกลออกไป',        phonetic: 'glai gan tao-rai, gô muean ying glai ok pai',      zh: '靠得再近，卻像越來越遠' },
      { thai: 'เธอจะได้ยินหรือเปล่า พอจะเข้าใจหรือเปล่า',  phonetic: 'tur ja dai-yin reu plao, por ja kao-jai reu plao', zh: '你聽得見嗎？能明白嗎？' },
      { thai: 'หนึ่งคำว่ารักที่ฉันนั้นซ่อนไม่ไหว',          phonetic: 'neung kam waa rak tee chan nan son mai wai',       zh: '這句我再也藏不住的「愛」' },
      // Pre-Chorus
      { thai: 'ไม่ใช่ไม่รู้ว่าคงต้องเจ็บ แต่เก็บมันได้อย่างไร', phonetic: 'mai chai mai roo waa kong tong jep, tae gep man dai yang-rai', zh: '不是不知道會痛，但怎麼收得住' },
      { thai: 'เมื่อทั้งหัวใจเป็นของเธอเท่านั้น',           phonetic: 'muea tang hua-jai pen kong tur tao-nan',           zh: '當整顆心都只屬於你' },
      // Chorus
      { thai: 'ขอโทษที่ไปรักเธอ ผิดเองที่ฉันไม่อาจห้ามใจ',  phonetic: 'kor-tot tee pai rak tur, pit eng tee chan mai aat haam jai', zh: '對不起愛上了你，是我不對，管不住自己的心' },
      { thai: 'จะเก็บคำว่ารักนี้ได้อย่างไร ใจนะใจเจ้าเอ๋ย',  phonetic: 'ja gep kam waa rak nee dai yang-rai, jai na jai jao-oei', zh: '這句愛要怎麼藏，心啊心哪' },
      { thai: 'ผิดเองที่รัก รักเธอทั้งใจ แค่อยากให้เธอเข้าใจได้ไหม', phonetic: 'pit eng tee rak, rak tur tang jai, kae yak hai tur kao-jai dai mai', zh: '是我不對，全心愛著你，只求你能明白' },
      { thai: 'ขอโทษจากหัวใจคนที่รักเธอ',                  phonetic: 'kor-tot jak hua-jai kon tee rak tur',              zh: '來自愛你之人心底的抱歉' },
      // Verse 2
      { thai: 'ก็แค่ทำตามหัวใจ ไม่ว่าต้องเจ็บเท่าไร',       phonetic: 'gô kae tam taam hua-jai, mai waa tong jep tao-rai', zh: '只是跟著心走，無論多痛' },
      { thai: 'ใครกำหนดไว้ให้ฉันไม่มีสิทธิ์รัก',            phonetic: 'krai gam-not wai hai chan mai mee sit rak',        zh: '是誰規定我沒有資格愛' }
    ],
    vocabulary: [
      { thai: 'ขอโทษ',        phonetic: 'kor-tot',       meaning: '對不起、道歉' },
      { thai: 'ผิดเอง',       phonetic: 'pit eng',       meaning: '是自己的錯' },
      { thai: 'ห้ามใจ',       phonetic: 'haam jai',      meaning: '管住自己的心（ห้ามใจไม่ได้ = 忍不住）' },
      { thai: 'ซ่อน',         phonetic: 'son',           meaning: '隱藏、藏' },
      { thai: 'ได้ยิน',       phonetic: 'dai-yin',       meaning: '聽見' },
      { thai: 'เข้าใจ',       phonetic: 'kao-jai',       meaning: '明白、懂' },
      { thai: 'เจ็บ',         phonetic: 'jep',           meaning: '痛' },
      { thai: 'ต้องการ',      phonetic: 'tong-gaan',     meaning: '需要、想要' },
      { thai: 'ทำตาม',        phonetic: 'tam taam',      meaning: '照著做、跟隨' },
      { thai: 'ใกล้',         phonetic: 'glai',          meaning: '近（跟 ไกล「遠」只差聲調！）' }
    ],
    article: {
      title: '從「ใจเจ้าเอ๋ย」學泰語——道歉與問句的日常用法',
      eyebrow: '泰劇OST・中階學習',
      body: [
        { type: 'p', text: 'MABELZ 是 T-pop 女團 PiXXiE 的成員，這首「ใจเจ้าเอ๋ย（心啊心哪）」是她首次獨唱的電視劇 OST，泰劇《สอดสร้อยมาลา》（One 31 台）插曲。整首歌不是唱給情人，而是唱給「自己的心」——責備它為什麼偏偏愛上不該愛的人。' },
        { type: 'h3', text: '📌 句型 1：…หรือเปล่า = 「…嗎？（是不是…？）」' },
        { type: 'p', text: '放在句尾的萬用問句，比 <span class="p4-th">ไหม</span> 更帶「到底是不是」的追問感：<br><br>歌詞：<span class="p4-th">เธอจะได้ยินหรือเปล่า</span> = 你聽得見嗎？<br>日常用法：<span class="p4-th">กินข้าวแล้วหรือเปล่า</span> = 吃飯了沒？' },
        { type: 'h3', text: '📌 句型 2：ผิดเองที่… = 「是（我）自己不對…」' },
        { type: 'p', text: '<span class="p4-th">ผิด</span>（錯）＋<span class="p4-th">เอง</span>（自己）＋<span class="p4-th">ที่</span>＋原因，把錯攬在自己身上：<br><br>歌詞：<span class="p4-th">ผิดเองที่ฉันไม่อาจห้ามใจ</span> = 是我不對，管不住自己的心<br>日常用法：<span class="p4-th">ผิดเองที่ไม่ฟัง</span> = 怪我自己沒聽' },
        { type: 'h3', text: '🚫 詞彙補充：ห้าม——路上到處看得到的字' },
        { type: 'p', text: '歌詞的 <span class="p4-th">ห้ามใจ</span>（管住心）裡的 <span class="p4-th">ห้าม</span> = 禁止，是去泰國「一定會看到」的字：<br><br><span class="p4-th">ห้ามจอด</span> = 禁止停車、<span class="p4-th">ห้ามสูบบุหรี่</span> = 禁菸、<span class="p4-th">ห้ามถ่ายรูป</span> = 禁止拍照<br>口語也超常用：<span class="p4-th">ห้ามใจไม่ได้</span> = 忍不住（心管不住）。' }
      ]
    }
  },
  {
    id: 'het-pon',
    date: '2026年3月9日',
    title: 'เหตุผล — Three Man Down feat. whateve',
    artist: 'Three Man Down',
    youtubeId: 'LCuxGozZh7c',
    playlistId: '',
    level: 'intermediate',
    theme: '甜蜜・命定愛情',
    description: '以失戀歌聞名的 Three Man Down 難得的幸福情歌：千萬人之中能相遇，一定有原因。與女聲 whateve 再度合作，甜而不膩。',
    lyrics: [
      // Verse 1
      { thai: 'ดวงดาวนับล้านพัน กระต่ายบนพระจันทร์',      phonetic: 'duang-dao nap lan pan, gra-tai bon pra-jan',       zh: '數以百萬計的星星，月亮上的玉兔' },
      { thai: 'กี่หมื่นเม็ดทรายที่ลอยมากระทบฝั่ง',          phonetic: 'gee meun met-saai tee loi maa gra-top fang',       zh: '幾萬粒沙隨浪拍上岸' },
      { thai: 'ฤดูกาลหมุนไป จบลงเพื่อเริ่มใหม่',            phonetic: 'reu-doo-gaan mun pai, jop long puea rerm mai',     zh: '季節輪轉，結束是為了重新開始' },
      { thai: 'เหมือนมีใครบางคน กำหนดเอาไว้',              phonetic: 'muean mee krai baang kon gam-not ao wai',          zh: '彷彿有誰早已註定好' },
      // Pre-Chorus
      { thai: 'ก่อนนี้ฉันเคยเป็นคนหลงทาง',                phonetic: 'gon-nee chan koei pen kon long taang',             zh: '從前我是個迷路的人' },
      { thai: 'จนวันที่พบเธอ มันก็ง่ายดาย',                phonetic: 'jon wan tee pop tur, man gô ngaai-daai',           zh: '直到遇見你，一切變得簡單' },
      { thai: 'แตกต่างไป เมื่อมีเธอมากุมมือไว้',            phonetic: 'taek-taang pai, muea mee tur maa gum meu wai',     zh: '都不一樣了，因為有你牽著我的手' },
      { thai: 'กอดฉันในค่ำคืนนี้',                         phonetic: 'got chan nai kam-keun nee',                        zh: '在今晚擁抱我' },
      // Chorus
      { thai: 'การที่เราได้พบกัน จากคนล้านพัน',            phonetic: 'gaan tee rao dai pop gan, jak kon lan pan',        zh: '千萬人之中我們能相遇' },
      { thai: 'ฉันเชื่อว่ามัน มีเหตุผล',                   phonetic: 'chan cheua waa man mee het-pon',                   zh: '我相信，一定有原因' },
      { thai: 'ในคืนที่ไร้ดาว กลับดูพร่างพราว',             phonetic: 'nai keun tee rai dao, glap doo praang-prao',       zh: '無星的夜晚，卻閃閃發亮' },
      { thai: 'ไปด้วยรักของเรา รักของเรา',                 phonetic: 'pai duay rak kong rao, rak kong rao',              zh: '因為我們的愛，我們的愛' }
    ],
    vocabulary: [
      { thai: 'เหตุผล',       phonetic: 'het-pon',       meaning: '原因、理由' },
      { thai: 'เชื่อ',         phonetic: 'cheua',         meaning: '相信' },
      { thai: 'พบกัน',        phonetic: 'pop gan',       meaning: '見面、相遇' },
      { thai: 'หลงทาง',       phonetic: 'long taang',    meaning: '迷路（旅遊必備！）' },
      { thai: 'จับมือ',        phonetic: 'jap meu',       meaning: '牽手（歌詞用 กุมมือ，意思相同）' },
      { thai: 'กอด',          phonetic: 'got',           meaning: '擁抱' },
      { thai: 'ง่าย',         phonetic: 'ngaai',         meaning: '容易、簡單' },
      { thai: 'แตกต่าง',      phonetic: 'taek-taang',    meaning: '不同、不一樣' },
      { thai: 'เริ่มใหม่',     phonetic: 'rerm mai',      meaning: '重新開始' },
      { thai: 'คืนนี้',        phonetic: 'keun nee',      meaning: '今晚' }
    ],
    article: {
      title: '從「เหตุผล」學泰語——「有道理」和「相信」怎麼說',
      eyebrow: '中階學習・甜蜜情歌',
      body: [
        { type: 'p', text: 'Three Man Down 以「ฝนตกไหม」等失戀神曲聞名，這首「เหตุผล（原因）」卻是他們難得的幸福情歌——千萬顆星、千萬粒沙、千萬個人之中，我們能相遇，一定有原因。女聲 whateve 曾與他們合唱過大熱曲「เพลงรัก」，這次再度合體。' },
        { type: 'h3', text: '📌 句型 1：มีเหตุผล / ไม่มีเหตุผล = 「有道理／不講理」' },
        { type: 'p', text: '<span class="p4-th">เหตุผล</span>（原因、道理）搭配 <span class="p4-th">มี</span>（有）超實用：<br><br>歌詞：<span class="p4-th">ฉันเชื่อว่ามันมีเหตุผล</span> = 我相信一定有原因<br>日常用法：<span class="p4-th">เขาเป็นคนมีเหตุผล</span> = 他是講道理的人、<span class="p4-th">ไม่มีเหตุผลเลย</span> = 太不講理了！（吵架用得到）' },
        { type: 'h3', text: '📌 句型 2：เชื่อว่า… = 「相信…」' },
        { type: 'p', text: '<span class="p4-th">เชื่อ</span>（相信）＋<span class="p4-th">ว่า</span>（說、認為）＋句子：<br><br>歌詞：<span class="p4-th">ฉันเชื่อว่ามันมีเหตุผล</span> = 我相信它有原因<br>日常用法：<span class="p4-th">เชื่อฉันสิ</span> = 相信我啦！、<span class="p4-th">ไม่เชื่อ</span> = 不信' },
        { type: 'h3', text: '🐇 文化補充：月亮上有兔子？泰國也這麼說！' },
        { type: 'p', text: '歌詞開頭的 <span class="p4-th">กระต่ายบนพระจันทร์</span>（月亮上的兔子）是不是很熟悉？沒錯，「玉兔搗藥」的傳說不只中華文化有，泰國、印度、日本都有「月中有兔」的故事。下次中秋節，你可以跟泰國朋友聊聊彼此的月兔傳說——保證聊得起來！' }
      ]
    }
  },
  {
    id: 'glua-luem',
    date: '2025年11月6日',
    title: 'กลัวลืม (The Collection) — NONT TANONT ft. URBOYTJ',
    artist: 'NONT TANONT',
    youtubeId: '6PClEtdn_U8',
    playlistId: '',
    level: 'intermediate',
    theme: '回憶・失戀',
    description: '「黃金嗓音」NONT TANONT 與饒舌歌手 URBOYTJ 合作版本：分手後捨不得刪掉任何照片和訊息，因為「怕忘了我們相愛過的時光」。',
    lyrics: [
      // Verse 1
      { thai: 'วันคืนที่เคยมี กับเวลาของเรา',              phonetic: 'wan-keun tee koei mee, gap way-la kong rao',       zh: '曾有的日日夜夜，屬於我們的時光' },
      { thai: 'ไม่เคยเลยจะรางเลือน แม้เป็นเรื่องเก่า',      phonetic: 'mai koei loei ja raang-leuan, mae pen reuang gao', zh: '從未模糊淡去，即使已是舊事' },
      { thai: 'ครั้งแรกที่เจอ ที่ที่พบเธอ',                phonetic: 'krang raek tee jur, tee tee pop tur',              zh: '第一次見面，遇見你的那個地方' },
      { thai: 'ครั้งแรกที่ได้คุยกัน ยังคงจำได้ทุกคำ',       phonetic: 'krang raek tee dai kui gan, yang kong jam dai took kam', zh: '第一次聊天，每句話都還記得' },
      // Verse 2
      { thai: 'ของขวัญที่เธอทำ รูปเธอที่ฉันถ่าย',          phonetic: 'kong-kwan tee tur tam, roop tur tee chan taai',    zh: '你做的禮物，我拍的你的照片' },
      { thai: 'เก็บมันไว้อย่างดียังไม่เคยจะทิ้งไป',         phonetic: 'gep man wai yang dee yang mai koei ja ting pai',   zh: '都好好收著，從沒丟過' },
      { thai: 'ทุกข้อความที่เคยส่ง ยังคงเก็บไว้ ไม่คิดจะลบเลยสักครั้ง', phonetic: 'took kor-kwarm tee koei song, yang kong gep wai, mai kit ja lop loei sak krang', zh: '每則傳過的訊息都留著，一次也沒想過刪' },
      // Pre-Chorus
      { thai: 'ทุกเรื่องเก่าๆ ยังไม่เคยลบมันไป',           phonetic: 'took reuang gao-gao yang mai koei lop man pai',    zh: '所有舊事都沒刪過' },
      { thai: 'ฉันไม่ต้องการให้มันเลือนหาย',               phonetic: 'chan mai tong-gaan hai man leuan haai',            zh: '我不想讓它們消失' },
      // Chorus
      { thai: 'เพราะฉันกลัวจะลืมช่วงเวลาที่เคยรักกัน',      phonetic: 'pror chan glua ja luem chuang way-la tee koei rak gan', zh: '因為我怕忘了我們相愛過的時光' },
      { thai: 'แม้จะเจ็บเท่าไรเมื่อเวลาที่นึกถึงมัน',        phonetic: 'mae ja jep tao-rai muea way-la tee neuk teung man', zh: '儘管想起來多麼痛' },
      { thai: 'ฉันเลือกจะจำเพราะทุกความทรงจำ',             phonetic: 'chan leuak ja jam pror took kwarm-song-jam',       zh: '我選擇記住，因為每段回憶' },
      { thai: 'สวยงามเกินกว่าที่จะลบมันไป',                phonetic: 'suay-ngaam gern gwaa tee ja lop man pai',          zh: '都美得捨不得刪去' }
    ],
    vocabulary: [
      { thai: 'กลัว',         phonetic: 'glua',          meaning: '害怕' },
      { thai: 'ลืม',          phonetic: 'luem',          meaning: '忘記' },
      { thai: 'จำ',           phonetic: 'jam',           meaning: '記住' },
      { thai: 'หาย',          phonetic: 'haai',          meaning: '消失、不見' },
      { thai: 'ของขวัญ',      phonetic: 'kong-kwan',     meaning: '禮物' },
      { thai: 'ข้อความ',      phonetic: 'kor-kwarm',     meaning: '訊息' },
      { thai: 'ลบ',           phonetic: 'lop',           meaning: '刪除、擦掉' },
      { thai: 'ทิ้ง',          phonetic: 'ting',          meaning: '丟掉、丟棄' },
      { thai: 'นึกถึง',       phonetic: 'neuk teung',    meaning: '想起、想到' },
      { thai: 'เลือก',        phonetic: 'leuak',         meaning: '選擇' }
    ],
    article: {
      title: '從「กลัวลืม」學泰語——數位時代的失戀詞彙',
      eyebrow: '中階學習・R&B',
      body: [
        { type: 'p', text: 'NONT TANONT 被泰國樂迷稱為「黃金嗓音」，這首「กลัวลืม（怕忘記）」The Collection 版本找來饒舌歌手 URBOYTJ 助陣——NONT 唱脆弱的旋律線，URBOYTJ 用饒舌講出心裡話。歌名只有兩個字：กลัว（怕）＋ลืม（忘），泰語歌名就是這麼直接。' },
        { type: 'h3', text: '📌 句型 1：กลัวจะ＋動詞 = 「怕會…」' },
        { type: 'p', text: '<span class="p4-th">กลัว</span>（怕）＋<span class="p4-th">จะ</span>（將要）＋動詞：<br><br>歌詞：<span class="p4-th">ฉันกลัวจะลืม</span> = 我怕會忘記<br>日常用法：<span class="p4-th">กลัวจะไปไม่ทัน</span> = 怕會來不及、<span class="p4-th">กลัวจะฝนตก</span> = 怕會下雨' },
        { type: 'h3', text: '📌 句型 2：ไม่เคย＋動詞 = 「從來沒有…」' },
        { type: 'p', text: '歌詞連用好幾次 <span class="p4-th">ไม่เคย</span>（從未）：<span class="p4-th">ไม่เคยจะทิ้งไป</span> = 從沒丟過、<span class="p4-th">ยังไม่เคยลบ</span> = 還沒刪過。<br><br>日常用法：<span class="p4-th">ไม่เคยไปเมืองไทย</span> = 沒去過泰國、<span class="p4-th">ไม่เคยกินผัดไทย</span> = 沒吃過泰式炒河粉。問別人用 <span class="p4-th">เคย…ไหม</span> = 你…過嗎？' },
        { type: 'h3', text: '📱 詞彙補充：泰語的「刪照片、刪訊息」怎麼說？' },
        { type: 'p', text: '這首歌是標準的「數位時代失戀歌」：<span class="p4-th">ลบ</span>（刪除）、<span class="p4-th">ข้อความ</span>（訊息）、<span class="p4-th">รูปที่ถ่าย</span>（拍的照片）都是每天滑手機會用到的詞。<span class="p4-th">ลบรูป</span> = 刪照片、<span class="p4-th">ลบแชท</span> = 刪聊天記錄、<span class="p4-th">บล็อก</span> = 封鎖——學泰語追星、跟泰國朋友聊天都用得上！' }
      ]
    }
  },
  {
    id: 'im-ok-not-ok',
    date: '2025年6月4日',
    title: 'I\'m ok // not ok — BOYdPOD feat. Billkin',
    artist: 'BOYdPOD × Billkin',
    youtubeId: 'AXA8jTk1tFc',
    playlistId: '',
    level: 'beginner',
    theme: '思念・異地戀',
    description: '泰國情歌教父 Boyd Kosiyabong 與人氣男星 Billkin 對唱：異地的兩個人在電話裡都說「我很好」，掛掉電話卻都不好。口語歌詞，初學者友善。',
    lyrics: [
      // Verse 1
      { thai: 'ทั้งๆ ที่ฉันก็รู้ดี',                       phonetic: 'tang-tang tee chan gô roo dee',                    zh: '明明我很清楚' },
      { thai: 'เธออยู่ที่ตรงโน้นไม่ได้มีอะไรที่ต้องห่วง',   phonetic: 'tur yoo tee trong-noon mai dai mee a-rai tee tong huang', zh: '你在那邊沒有什麼好擔心的' },
      { thai: 'อยู่ที่นั่นเธอคงได้พบคนมากมาย',             phonetic: 'yoo tee nan tur kong dai pop kon maak-maai',       zh: '在那裡你會遇到很多人' },
      { thai: 'และคงได้เจอะได้เจอกับเรื่องใหม่ๆ เพื่อนใหม่ๆ', phonetic: 'lae kong dai jer dai jur gap reuang mai-mai, puean mai-mai', zh: '遇到新的事、新的朋友' },
      // Pre-Chorus
      { thai: 'ได้แต่ยิ้มหัวเราะทุกทีที่เธอโทรเข้ามา',      phonetic: 'dai tae yim hua-ror took tee tee tur toh kao maa', zh: '每次你打電話來，我只能笑著' },
      { thai: 'แต่บ้าจริงๆ ข้างในน้ำตากลับไหล',            phonetic: 'tae baa jing-jing, kang-nai nam-taa glap lai',     zh: '但可惡，心裡的眼淚卻在流' },
      // Chorus 1
      { thai: 'ฉันคิดถึงเธอมาก อยากให้เธอรู้คิดถึงมากๆ',    phonetic: 'chan kit-teung tur maak, yak hai tur roo kit-teung maak-maak', zh: '我好想你，想讓你知道我很想很想' },
      { thai: 'อยากระบาย อยากให้รับฟัง เรื่องทุกๆ อย่างที่อยู่ข้างใน', phonetic: 'yak ra-baai, yak hai rap fang, reuang took-took yaang tee yoo kang-nai', zh: '想傾訴，想有人聽，心裡的一切' },
      { thai: 'ฉันคิดถึงเธอมาก แต่ไม่อยากทำให้เธอหวั่นไหว', phonetic: 'chan kit-teung tur maak, tae mai yak tam hai tur wan-wai', zh: '我好想你，但不想讓你動搖' },
      { thai: 'ได้แต่กลั้นหายใจ และตอบเธอไป ทางนี้ฉันโอเคเลย', phonetic: 'dai tae glan hai-jai, lae top tur pai, taang nee chan OK loei', zh: '只能屏住呼吸，回答你：我這邊一切都好' },
      // Chorus 2（另一方的視角）
      { thai: 'เหงามากหรือเปล่าที่อยู่ตรงนั้น เศร้ามากหรือเปล่าที่อยู่ลำพัง', phonetic: 'ngao maak reu plao tee yoo trong-nan, sao maak reu plao tee yoo lam-pang', zh: '在那邊很寂寞嗎？一個人很難過嗎？' },
      { thai: 'ได้แต่กลั้นหายใจ เก็บคำถามไว้ทั้งที่ ไม่โอเคเลย', phonetic: 'dai tae glan hai-jai, gep kam-taam wai tang-tee, mai OK loei', zh: '只能屏住呼吸，收起想問的話——其實一點都不 OK' }
    ],
    vocabulary: [
      { thai: 'ทั้งๆ ที่',     phonetic: 'tang-tang tee', meaning: '明明、儘管' },
      { thai: 'เป็นห่วง',      phonetic: 'pen huang',     meaning: '擔心、掛念' },
      { thai: 'คิดถึง',       phonetic: 'kit-teung',     meaning: '想念' },
      { thai: 'ระบาย',        phonetic: 'ra-baai',       meaning: '傾訴、發洩' },
      { thai: 'รับฟัง',       phonetic: 'rap fang',      meaning: '傾聽' },
      { thai: 'โทรเข้ามา',    phonetic: 'toh kao maa',   meaning: '打電話進來（โทร = 打電話）' },
      { thai: 'กลั้น',         phonetic: 'glan',          meaning: '忍住、屏住（กลั้นน้ำตา = 忍住眼淚）' },
      { thai: 'เหงา',         phonetic: 'ngao',          meaning: '寂寞' },
      { thai: 'เศร้า',        phonetic: 'sao',           meaning: '難過、悲傷' },
      { thai: 'ลำพัง',        phonetic: 'lam-pang',      meaning: '獨自一人（口語也說 อยู่คนเดียว）' }
    ],
    article: {
      title: '從「I\'m ok // not ok」學泰語——電話裡的口是心非',
      eyebrow: '初階學習・對唱情歌',
      body: [
        { type: 'p', text: 'Boyd Kosiyabong（บอย โกสิยพงษ์）是泰國樂壇的「情歌教父」，寫過無數經典。這首歌找來人氣男星 Billkin 對唱，兩個聲部＝電話兩端的兩個人：都說「我這邊很好」，掛掉電話才承認「一點都不好」。歌詞全是日常口語，初學者也能跟著唱。' },
        { type: 'h3', text: '📌 句型 1：ทั้งๆ ที่ = 「明明、儘管」' },
        { type: 'p', text: '放在句首，表示「明明是這樣（卻…）」：<br><br>歌詞：<span class="p4-th">ทั้งๆ ที่ฉันก็รู้ดี</span> = 明明我很清楚<br>日常用法：<span class="p4-th">ทั้งๆ ที่ง่วง ก็ยังไม่นอน</span> = 明明很睏，卻還不睡' },
        { type: 'h3', text: '📌 句型 2：ได้แต่＋動詞 = 「只能…」' },
        { type: 'p', text: '<span class="p4-th">ได้แต่</span> 表示「別無選擇，只能做這件事」，滿滿的無奈感：<br><br>歌詞：<span class="p4-th">ได้แต่กลั้นหายใจ</span> = 只能屏住呼吸<br>日常用法：<span class="p4-th">ได้แต่รอ</span> = 只能等' },
        { type: 'h3', text: '📞 學習亮點：兩個聲部＝一通電話的兩端' },
        { type: 'p', text: '這首歌最巧妙的設計：Boyd 唱的是「說自己 OK 的人」，Billkin 唱的是「問對方 OK 嗎的人」，最後兩個聲部疊在一起——一邊問 <span class="p4-th">เหงามากหรือเปล่า</span>（很寂寞嗎），一邊說 <span class="p4-th">ทางนี้ฉันโอเคเลย</span>（我這邊很好）。聽的時候留意兩個聲音，就像聽懂一通完整的越洋電話。' }
      ]
    }
  },
  {
    id: 'tee-kan-nang-sue',
    date: '2025年4月25日',
    title: 'ที่คั่นหนังสือ (Sometimes) — BOWKYLION ft. NONT TANONT',
    artist: 'BOWKYLION',
    youtubeId: 'L051YSpEEYU',
    playlistId: '',
    level: 'advanced',
    theme: '暗戀・文學隱喻',
    description: 'BOWKYLION 的隱喻神作：你是一本書，他是讀者，而我只是書籤——只在他不讀你的時候，才能夾在你身邊。高階學習者必聽的文學級歌詞。',
    lyrics: [
      // Verse 1
      { thai: 'เจ้าตัวอักษรหนังสือที่เขาถือไว้เพื่ออ่าน',   phonetic: 'jao tua-ak-son nang-sue tee kao teu wai puea aan', zh: '他手裡那本書上的字啊' },
      { thai: 'ยากที่จะคาดเดาว่าเขาตั้งใจหรือมองผ่าน',      phonetic: 'yaak tee ja kaat-dao waa kao tang-jai reu mong paan', zh: '難以猜測他是認真讀，還是隨眼掠過' },
      { thai: 'ใจฉันอยากเรียนรู้ เล่มที่ดูว่าน่าอ่าน',       phonetic: 'jai chan yak rian-roo, lem tee doo waa naa aan',   zh: '我的心想讀懂這本值得讀的書' },
      { thai: 'ทิ้งเธอไว้บางตอน เจ้าหนังสือดูช่างทรมาน',     phonetic: 'ting tur wai baang ton, jao nang-sue doo chang tor-ra-maan', zh: '他把你丟在某些章節，書啊，你多麼煎熬' },
      // Pre-Chorus
      { thai: 'อ่านเธอเพียงครา เข้าใจเธอแค่บางหน้า',        phonetic: 'aan tur piang kraa, kao-jai tur kae baang naa',    zh: '只偶爾讀你，只懂你幾頁' },
      { thai: 'ปิดตายเก็บไว้ ไม่เคยรักษา',                 phonetic: 'pit taai gep wai, mai koei rak-saa',               zh: '闔上封存，從不珍惜' },
      { thai: 'เมื่อเขาจากลา ฉันยังคอยคั่นไว้ทุกคืนวัน คั่นเวลา', phonetic: 'muea kao jaak laa, chan yang koi kan wai took keun-wan, kan way-la', zh: '當他離開，我仍日夜替你標記，標記著時光' },
      // Chorus
      { thai: 'แค่เพียงชั่วคราว ลืมสายตาของเขาก่อน',        phonetic: 'kae piang chua-krao, luem sai-taa kong kao gon',   zh: '只是暫時的，先忘了他的目光' },
      { thai: 'พบกันบางตอน อยู่บางช่วงเวลา',               phonetic: 'pop gan baang ton, yoo baang chuang way-la',       zh: '我們只在某些章節相見，只在某些時刻' },
      { thai: 'ถ้าเขาอ่านเธอไม่จบ คงจะพบฉันคั่นระหว่างหน้า', phonetic: 'taa kao aan tur mai jop, kong ja pop chan kan ra-waang naa', zh: '若他沒把你讀完，就會看見我夾在書頁之間' },
      { thai: 'วันที่เขาอ่านเธอไม่ละสายตา วันนั้นคงต้องลาก่อน', phonetic: 'wan tee kao aan tur mai la sai-taa, wan nan kong tong laa gon', zh: '當他目不轉睛地讀你的那天，就是我道別的那天' },
      // Outro
      { thai: 'นานเกินใจจะรู้ ฉันยังคงคั่นเธออยู่ ตราบใดที่เขาไม่พลิกดู', phonetic: 'naan gern jai ja roo, chan yang kong kan tur yoo, traap-dai tee kao mai plik doo', zh: '久到心也數不清，我仍夾在你之中——只要他不翻開看' }
    ],
    vocabulary: [
      { thai: 'ที่คั่นหนังสือ', phonetic: 'tee-kan-nang-sue', meaning: '書籤' },
      { thai: 'อ่าน',         phonetic: 'aan',           meaning: '讀、唸' },
      { thai: 'หนังสือ',      phonetic: 'nang-sue',      meaning: '書' },
      { thai: 'หน้า',         phonetic: 'naa',           meaning: '頁；臉（一字兩用）' },
      { thai: 'เดา',          phonetic: 'dao',           meaning: '猜' },
      { thai: 'ตั้งใจ',        phonetic: 'tang-jai',      meaning: '認真、用心' },
      { thai: 'ชั่วคราว',      phonetic: 'chua-krao',     meaning: '暫時' },
      { thai: 'ทิ้ง',          phonetic: 'ting',          meaning: '丟下、拋下' },
      { thai: 'คอย',          phonetic: 'koi',           meaning: '等候、一直（做著）' },
      { thai: 'ลาก่อน',       phonetic: 'laa gon',       meaning: '再見、告辭' }
    ],
    article: {
      title: '從「ที่คั่นหนังสือ」學泰語——書、猜、認真',
      eyebrow: '高階學習・隱喻歌詞',
      body: [
        { type: 'p', text: 'BOWKYLION 親自作詞作曲，與「黃金嗓音」NONT TANONT 對唱。整首歌是一個完整的比喻：心愛的人是「一本書」，他是「讀者」，而唱歌的人只是「書籤」——只在讀者不讀的日子裡，才能靜靜夾在書頁之間。歌詞雖有文學感，但拆出來的單字其實都很生活化。' },
        { type: 'h3', text: '📌 句型 1：ถ้า…คง… = 「如果…應該就…」' },
        { type: 'p', text: '<span class="p4-th">ถ้า</span>（如果）＋<span class="p4-th">คง</span>（應該、大概）是日常推測的黃金組合：<br><br>歌詞：<span class="p4-th">ถ้าเขาอ่านเธอไม่จบ คงจะพบฉัน</span> = 如果他沒把你讀完，應該就會看見我<br>日常用法：<span class="p4-th">ถ้าฝนตก คงไปไม่ได้</span> = 如果下雨，應該就去不了' },
        { type: 'h3', text: '📌 句型 2：動詞＋ยาก = 「很難…」' },
        { type: 'p', text: '把 <span class="p4-th">ยาก</span>（難）放在動詞後面，怎麼組都行：<br><br>歌詞概念：<span class="p4-th">เดายาก</span> = 很難猜<br>日常用法：<span class="p4-th">พูดยาก</span> = 很難說、<span class="p4-th">อ่านยาก</span> = 很難讀、<span class="p4-th">หายาก</span> = 很難找' },
        { type: 'h3', text: '📖 詞彙補充：คั่น——連看電視都用得到' },
        { type: 'p', text: '<span class="p4-th">คั่น</span> 是「夾在中間、隔開」：書籤 <span class="p4-th">ที่คั่นหนังสือ</span> 是「夾書的東西」，電視裡的 <span class="p4-th">โฆษณาคั่น</span> 是「插播廣告」。歌裡的雙關：我夾在書頁裡（書籤），也卡在你們兩人之間（多餘的人）——一個字唱出整首歌的心酸。' }
      ]
    }
  },
  {
    id: 'jak-gan-doy-somboon',
    date: '2024年12月17日',
    title: 'จากกันโดยสมบูรณ์ — guncharlie',
    artist: 'guncharlie',
    youtubeId: 'Jdzs-qcURQE',
    playlistId: '',
    level: 'intermediate',
    theme: '失戀・告別',
    description: '新生代創作歌手 guncharlie 的「徹底分手」宣言：分分合合太多次，這次要完完全全地分開——不再傳訊息，跨年夜不再相伴，把千百個故事說給月亮聽。',
    lyrics: [
      // Verse 1
      { thai: 'เคยคิดเราคงไม่เลิกกันจริงๆ',                phonetic: 'koei kit rao kong mai lerk gan jing-jing',         zh: '曾以為我們不會真的分手' },
      { thai: 'เคยหวังเวลาคงเยียวยาทุกสิ่ง',               phonetic: 'koei wang way-la kong yiao-yaa took sing',         zh: '曾盼時間會治癒一切' },
      { thai: 'เคยคิดเราคงเหมือนเพลงที่ได้ยิน',            phonetic: 'koei kit rao kong muean pleng tee dai-yin',        zh: '曾以為我們會像聽過的那些歌' },
      { thai: 'หากยังรัก เราคงวน มาอีกครั้ง',               phonetic: 'haak yang rak, rao kong won, maa eek krang',       zh: '若還相愛，就會再繞回彼此身邊' },
      // Pre-Chorus
      { thai: 'เปลี่ยนไปไม่เหมือนเก่า ครั้งนี้ถ้อยคำลา',     phonetic: 'plian pai mai muean gao, krang nee toi-kam laa',   zh: '都變了，這次的道別話語' },
      { thai: 'เจ็บปวดกว่าครั้งก่อน สายตาเธอฟ้อง',          phonetic: 'jep-puat gwaa krang gon, sai-taa tur fong',        zh: '比以往更痛，你的眼神說明了一切' },
      { thai: 'และฉันสัมผัสได้จากอ้อมกอด บอกฉันว่าต้องพอเท่านี้', phonetic: 'lae chan sam-pat dai jak om-got, bok chan waa tong por tao-nee', zh: '我從擁抱裡感覺得到：到此為止了' },
      // Chorus
      { thai: 'ลาจากกันครั้งนี้ คงเป็นครั้งสุดท้าย',         phonetic: 'laa jaak gan krang nee, kong pen krang soot-taai', zh: '這次道別，應是最後一次' },
      { thai: 'เดินมาไกลเท่านี้ มันก็ดีแค่ไหน',             phonetic: 'dern maa glai tao-nee, man gô dee kae nai',        zh: '能一起走到這麼遠，已經多麼好' },
      { thai: 'ในทุกวันใหม่จากนี้ จะไม่มีข้อความใดไปหาอีก',  phonetic: 'nai took wan mai jaak nee, ja mai mee kor-kwarm dai pai haa eek', zh: '往後每個新的日子，不會再有訊息傳給你' },
      { thai: 'จากนี้เราต้องจากกันโดยสมบูรณ์',              phonetic: 'jaak nee rao tong jaak gan doy som-boon',          zh: '從此我們要完完全全地分開' },
      // Hook 2
      { thai: 'และในทุกคืนข้ามปี เราจะไม่อยู่ข้างกัน',       phonetic: 'lae nai took keun kaam pee, rao ja mai yoo kang gan', zh: '每個跨年夜，我們不再相伴' },
      { thai: 'และในทุกวันสำคัญ คงทำได้แค่คิดถึง',          phonetic: 'lae nai took wan sam-kan, kong tam dai kae kit-teung', zh: '每個重要的日子，只能想念' },
      { thai: 'เรื่องราวมากมายร้อยพัน ขอให้จันทร์เจ้ารับฟัง', phonetic: 'reuang-rao maak-maai roi pan, kor hai jan-jao rap fang', zh: '千百個故事，就請月亮聽吧' },
      { thai: 'หากวันนี้ต้องจากกัน ขอให้จากกันโดยสมบูรณ์',   phonetic: 'haak wan-nee tong jaak gan, kor hai jaak gan doy som-boon', zh: '若今天必須分開，願我們徹底地分開' }
    ],
    vocabulary: [
      { thai: 'เลิกกัน',      phonetic: 'lerk gan',      meaning: '分手' },
      { thai: 'จากกัน',       phonetic: 'jaak gan',      meaning: '分開、離別' },
      { thai: 'ครั้งสุดท้าย',  phonetic: 'krang soot-taai', meaning: '最後一次' },
      { thai: 'วันสำคัญ',     phonetic: 'wan sam-kan',   meaning: '重要的日子' },
      { thai: 'ข้อความ',      phonetic: 'kor-kwarm',     meaning: '訊息' },
      { thai: 'เจ็บปวด',      phonetic: 'jep-puat',      meaning: '疼痛、心痛' },
      { thai: 'สายตา',        phonetic: 'sai-taa',       meaning: '眼神、目光' },
      { thai: 'อ้อมกอด',      phonetic: 'om-got',        meaning: '懷抱、擁抱' },
      { thai: 'เปลี่ยนไป',     phonetic: 'plian pai',     meaning: '變了、改變了' },
      { thai: 'พอ',           phonetic: 'por',           meaning: '夠了、足夠' }
    ],
    article: {
      title: '從「จากกันโดยสมบูรณ์」學泰語——分手、夠了、曾經',
      eyebrow: '中階學習・告別情歌',
      body: [
        { type: 'p', text: 'guncharlie 是泰國新生代創作歌手，這首「จากกันโดยสมบูรณ์（徹底分開）」是他 2024 年三部曲失戀單曲的完結篇，與 Lipta 的 Tan 共同創作。寫給分分合合太多次的戀人：這次不再繞回來了，要「完完全全地」分開。' },
        { type: 'h3', text: '📌 句型 1：เคย＋動詞 = 「曾經…」' },
        { type: 'p', text: '這首歌的第一段用了三個 <span class="p4-th">เคย</span> 排比，唱出「曾以為」的痛：<br><br><span class="p4-th">เคยคิด</span> = 曾以為、<span class="p4-th">เคยหวัง</span> = 曾盼望<br>日常用法：<span class="p4-th">เคยไปเมืองไทยไหม</span> = 你去過泰國嗎？<span class="p4-th">เคยกินแล้ว</span> = 吃過了' },
        { type: 'h3', text: '📌 句型 2：พอ = 「夠了」（一個字就是一句話）' },
        { type: 'p', text: '歌詞 <span class="p4-th">บอกฉันว่าต้องพอเท่านี้</span>（告訴我到此為止）的 <span class="p4-th">พอ</span>，日常使用率極高：<br><br><span class="p4-th">พอแล้ว</span> = 夠了！、<span class="p4-th">พอก่อน</span> = 先到這裡、<span class="p4-th">กินพอแล้ว</span> = 吃飽了<br>吃飯時店員問還要嗎，回一句 <span class="p4-th">พอแล้วครับ/ค่ะ</span> 就搞定。' },
        { type: 'h3', text: '💬 詞彙補充：เลิก——「分手」和「下班」是同一個字' },
        { type: 'p', text: '<span class="p4-th">เลิก</span> 的意思是「結束、停止」：<span class="p4-th">เลิกกัน</span> = 分手（我們結束了）、<span class="p4-th">เลิกงาน</span> = 下班、<span class="p4-th">เลิกเรียน</span> = 放學、<span class="p4-th">เลิกบุหรี่</span> = 戒菸。一個字管遍人生大小「結束」，超好記！' }
      ]
    }
  },
  {
    id: 'yim-la',
    date: '2024年9月27日',
    title: 'ยิ้มลา (jasmine) — BOWKYLION',
    artist: 'BOWKYLION',
    youtubeId: 'ukGjGHr1Ft8',
    playlistId: '',
    level: 'beginner',
    theme: '親情・告別',
    description: 'BOWKYLION 寫給外婆的真實故事：握著即將遠行之人的手，求一個微笑再道別。英文歌名 jasmine（茉莉花）是泰國的母親節之花。句短詞簡，初學者也能聽懂。',
    lyrics: [
      // Verse 1
      { thai: 'จับมือของเธอ เหม่อที่ต้องรอ',               phonetic: 'jap meu kong tur, mur tee tong ror',               zh: '握著你的手，茫然地等待' },
      { thai: 'ที่เคยขอให้มีเธอเคียงข้างกัน',              phonetic: 'tee koei kor hai mee tur kiang kang gan',          zh: '曾祈求你一直在身旁' },
      { thai: 'วันนี้เป็นแค่ฝัน ถ้าขอให้เธออยู่คงไม่ไหว',    phonetic: 'wan-nee pen kae fan, taa kor hai tur yoo kong mai wai', zh: '如今只是夢，若求你留下，已無能為力' },
      // Verse 2
      { thai: 'ผ่านมาด้วยกันยังจำได้ดี',                   phonetic: 'paan maa duay gan yang jam dai dee',               zh: '一起走過的日子仍記得清楚' },
      { thai: 'ความห่วงใยที่เธอมีที่เธอให้ฉัน',             phonetic: 'kwarm huang-yai tee tur mee tee tur hai chan',     zh: '你給我的那些牽掛疼愛' },
      { thai: 'วันนี้เข้าใจจดจำไว้ก่อนไร้เธอ',              phonetic: 'wan-nee kao-jai jot-jam wai gon rai tur',          zh: '今天我懂了，在失去你之前好好記住' },
      // Chorus
      { thai: 'ยิ้มให้ดูหน่อยแล้วค่อยไป',                  phonetic: 'yim hai doo noi laeo koi pai',                     zh: '笑一個給我看，再走好嗎' },
      { thai: 'ยิ้มให้ดูก่อนเราจะจากไกล',                  phonetic: 'yim hai doo gon rao ja jaak glai',                 zh: '在我們遠別之前，先笑一個' },
      { thai: 'เพราะทั้งชีวิตมีเธอข้างๆ ตรงนี้',            phonetic: 'pror tang chee-wit mee tur kang-kang trong-nee',   zh: '因為一輩子都有你在身邊' },
      { thai: 'แค่เธอยิ้มก่อนแล้วเธอค่อยนอนหลับฝันดี',      phonetic: 'kae tur yim gon laeo tur koi non-lap fan dee',     zh: '只要你先微笑，再安心睡去，做個好夢' },
      // Bridge
      { thai: 'หากเธอต้องลา อย่าไปพร้อมน้ำตา',             phonetic: 'haak tur tong laa, yaa pai prom nam-taa',          zh: '如果你必須離開，別帶著眼淚走' },
      { thai: 'จะคอยร้องเพลงกล่อมเธอเหมือนที่ผ่านมา',      phonetic: 'ja koi rong pleng glom tur muean tee paan maa',    zh: '我會唱歌哄你入睡，像從前一樣' },
      { thai: 'ที่เธอทำทุกคราเมื่อยามฉันหลับใหล',           phonetic: 'tee tur tam took kraa muea yaam chan lap-lai',     zh: '一如你在我入睡時為我做的那樣' },
      { thai: 'กอดสุดท้ายให้เธอยิ้มอำลา',                  phonetic: 'got soot-taai hai tur yim am-laa',                 zh: '最後的擁抱，願你帶著微笑道別' }
    ],
    vocabulary: [
      { thai: 'ยิ้ม',          phonetic: 'yim',           meaning: '微笑' },
      { thai: 'ลา',           phonetic: 'laa',           meaning: '道別、告辭' },
      { thai: 'จับมือ',        phonetic: 'jap meu',       meaning: '握手、牽手' },
      { thai: 'ร้องเพลง',     phonetic: 'rong pleng',    meaning: '唱歌' },
      { thai: 'นอนหลับ',      phonetic: 'non lap',       meaning: '睡覺、入睡' },
      { thai: 'ฝันดี',        phonetic: 'fan dee',       meaning: '好夢（睡前必說）' },
      { thai: 'กอด',          phonetic: 'got',           meaning: '擁抱' },
      { thai: 'น้ำตา',        phonetic: 'nam-taa',       meaning: '眼淚' },
      { thai: 'จำได้',        phonetic: 'jam dai',       meaning: '記得' },
      { thai: 'ด้วยกัน',      phonetic: 'duay gan',      meaning: '一起' }
    ],
    article: {
      title: '從「ยิ้มลา」學泰語——微笑、晚安、一起',
      eyebrow: '初階學習・親情之歌',
      body: [
        { type: 'p', text: 'BOWKYLION 親自作詞作曲的「ยิ้มลา（微笑道別）」，靈感來自她與外婆的最後一段回憶。這不是失戀歌，而是寫給摯愛長輩的告別曲：握著手，求一個微笑，再唱搖籃曲哄對方入睡——就像小時候對方哄自己那樣。句子短、詞彙生活化，初學者也能聽懂大半。' },
        { type: 'h3', text: '📌 句型 1：…ก่อน แล้วค่อย… = 「先…，再…」' },
        { type: 'p', text: '<span class="p4-th">ก่อน</span>（先）＋<span class="p4-th">แล้วค่อย</span>（然後才）是安排順序的黃金句型：<br><br>歌詞：<span class="p4-th">ยิ้มให้ดูหน่อยแล้วค่อยไป</span> = 先笑一個給我看，再走<br>日常用法：<span class="p4-th">กินข้าวก่อนแล้วค่อยทำงาน</span> = 先吃飯，再工作' },
        { type: 'h3', text: '📌 句型 2：นอนหลับฝันดี = 「晚安，好夢」' },
        { type: 'p', text: '歌詞 <span class="p4-th">แค่เธอยิ้มก่อนแล้วเธอค่อยนอนหลับฝันดี</span> 裡藏著泰語睡前必備句：<br><br><span class="p4-th">ฝันดีนะ</span> = 好夢喔（＝晚安）<br><span class="p4-th">นอนหลับฝันดี</span> = 睡個好覺、做個好夢<br>跟泰國朋友聊天到深夜，最後丟一句 <span class="p4-th">ฝันดีนะ</span>，溫柔又道地。' },
        { type: 'h3', text: '🌼 文化補充：為什麼英文歌名叫 jasmine（茉莉花）？' },
        { type: 'p', text: '在泰國，茉莉花 <span class="p4-th">ดอกมะลิ</span> 是「母親節之花」——每年 8 月 12 日泰國母親節，孩子會獻上茉莉花，感謝母親與長輩的養育之恩，因為茉莉潔白、香氣持久，象徵無私的愛。BOWKYLION 用 jasmine 當英文歌名，等於直接告訴聽眾：這是一首獻給摯愛長輩的歌。' }
      ]
    }
  }
  // ← เพิ่มเพลงใหม่ได้ที่นี่ (copy รูปแบบด้านบน)
];
