// ════════════════════════════════════════════════════════════
// Supabase Edge Function: search-gemini  (🔴 ยังไม่ deploy)
//
// หน้าที่ตามที่ตกลงไว้ (73_CLAUDE_UPDATE หัวข้อ C): เมื่อ rule-based search
// (js/core/search-engine.js) หาไม่เจอ/ไม่มั่นใจ → ค่อยถามฟังก์ชันนี้ให้ Gemini
// ช่วยตีความคำค้นของคนใช้ แล้ว "เลือก" destination จาก whitelist ที่ระบบกำหนด
// เท่านั้น — ห้าม Gemini สร้าง URL/คำตอบเอง (กันหลอกไปหน้าอื่น/กันแต่งคำตอบมั่ว)
//
// 🔴 ทำไมยัง deploy ไม่ได้ตอนนี้ (บล็อกจริง ไม่ใช่แค่ยังไม่ว่าง):
//   1) ต้อง supabase login + link project ของ Lin เอง — Claude ไม่มีสิทธิ์ทำแทนในเซสชันนี้
//      (เหมือนที่บล็อก P7-02/N5 — ต้องมีคนที่มี Supabase CLI login จริงเป็นคน deploy)
//   2) ต้องตั้ง secret GEMINI_API_KEY จริงด้วย `supabase secrets set GEMINI_API_KEY=...`
//      (ห้ามอยู่ฝั่ง client เด็ดขาด — ต้องเป็นความลับฝั่งเซิร์ฟเวอร์เท่านั้น)
//   3) รายการ keyword/synonym ใน data/search-index.js ตอนนี้ Claude ร่างจาก
//      <title>/<meta description> ของหน้าจริง — ยังไม่ผ่าน Lin ตรวจทีละรายการ
//      ก่อน publish ให้คนทั่วไปค้นหาใช้งานจริง (whitelist ด้านล่างนี้ก็มาจาก
//      title ชุดเดียวกัน จึงติดเงื่อนไขเดียวกัน)
//
// ✅ ส่วนที่ 2026-08-10 ทำเสร็จแล้ว (โค้ดพร้อม deploy ทันทีที่ Lin ทำ 3 ข้อด้านบน):
//   - เรียก Gemini API จริง (generateContent + responseSchema บังคับ JSON)
//   - validate id ที่ Gemini ตอบกลับต้องอยู่ใน whitelist เท่านั้น ไม่งั้นถือว่า "ไม่มั่นใจ"
//   - rate limit 2 ชั้น (ต่อ IP + รวมทั้งระบบ) กัน cost บาน — reuse ฟังก์ชัน
//     game_content_rl_check ที่มีอยู่แล้วใน DB (ไม่ต้องสร้างตาราง/ฟังก์ชันใหม่เลย
//     ดู supabase/sql/2026-08-02_game_content_schema.sql) — ปรับตัวเลขได้ที่ RATE_LIMIT ด้านล่าง
//
// 🆕 2026-08-10 (รอบ 2 — ตามที่ Lin สั่งหลัง deploy รอบแรกสำเร็จ): เดิม Gemini ตอบ "none"
//   เฉยๆ เวลาคำค้นกำกวม (เช่น "想練聲" ขาดคำว่า 調) ทำให้ผู้ใช้เห็นแค่ "ไม่เจอ" ทั้งที่มีตัว
//   ใกล้เคียงอยู่ — เปลี่ยนให้ Gemini ต้องเลือก id ที่ใกล้เคียงที่สุดเสมอ (ห้ามเลือก "none" อีกต่อไป)
//   พร้อมส่ง confident:true/false มาด้วย — ฝั่ง client โชว์เป็นการ์ด "🤔 เดาว่าอาจจะ..." เวลา
//   confident:false แทนที่จะเงียบ ⚠️ **ไฟล์นี้ต้อง deploy ใหม่อีกรอบ** (ดูขั้นตอนด้านล่าง)
//   ก่อนการเปลี่ยนแปลงนี้จะมีผลจริงบนเว็บ
//
// วิธี deploy ตอนพร้อม (Lin ทำเอง):
//   1. supabase secrets set GEMINI_API_KEY=<key จริงจาก Google AI Studio>
//   2. supabase functions deploy search-gemini
//      (ไม่ใส่ --no-verify-jwt — เรียกจาก client ในเบราว์เซอร์ผ่าน fetch ตรงๆ เสมอ
//      แนบ apikey/anon key อัตโนมัติ เหมือน game-content ข้อ 3 ในไฟล์นั้น)
//   3. ก่อนเปิดใช้จริงกับคนทั่วไป: ให้ Lin ตรวจ data/search-index.js (title ของทุก id)
//      ว่าไม่มีอันไหนเข้าใจผิด/พาไปหน้าไม่ตรงได้ — แล้วรัน
//      node scripts/sync-search-gemini-whitelist.js ให้ DESTINATIONS ด้านล่างตรงล่าสุด
// ════════════════════════════════════════════════════════════

// deno-lint-ignore-file
// @ts-nocheck  (Supabase Edge Function รันบน Deno ไม่ใช่ Node — type error ของ IDE ปกติ)

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// GENERATED_WHITELIST_START — เกิดจาก scripts/sync-search-gemini-whitelist.js (ห้ามแก้มือ)
// รันสคริปต์นี้ใหม่ทุกครั้งที่ data/search-index.js เปลี่ยน id/title:
//   node scripts/sync-search-gemini-whitelist.js
// สร้างล่าสุด: 2026-08-10 · 67 รายการ
const DESTINATIONS = [
  {
    "id": "game-tone",
    "title": "【遊戲】泰語聲調練習室 — 看字猜聲調小遊戲"
  },
  {
    "id": "game-reading",
    "title": "【遊戲】泰語拼讀練習室 — 把音節拼起來讀對每個字"
  },
  {
    "id": "game-listening",
    "title": "泰語聽力練習室"
  },
  {
    "id": "game-typing",
    "title": "【遊戲】泰語打字練習室 — 泰文鍵盤打字小遊戲"
  },
  {
    "id": "game-word-order",
    "title": "【遊戲】泰語語序練習室 — 排列詞語順序小遊戲"
  },
  {
    "id": "game-lego",
    "title": "【遊戲】泰語造句練習室（樂高）— 挑詞組句子小遊戲"
  },
  {
    "id": "course-trial",
    "title": "預約免費體驗課"
  },
  {
    "id": "course-pricing",
    "title": "費用方案與上課方式"
  },
  {
    "id": "faq-1",
    "title": "初學者適合報名嗎？"
  },
  {
    "id": "faq-2",
    "title": "已有中高級程度，還適合上課嗎？"
  },
  {
    "id": "faq-3",
    "title": "一定要學讀寫嗎？"
  },
  {
    "id": "faq-4",
    "title": "需要每週固定上課嗎？"
  },
  {
    "id": "faq-5",
    "title": "上課使用什麼語言授課？"
  },
  {
    "id": "faq-6",
    "title": "上課時間可以彈性調整嗎？"
  },
  {
    "id": "faq-7",
    "title": "大概學多久才能真正開口說話？"
  },
  {
    "id": "faq-8",
    "title": "線上還是實體上課？"
  },
  {
    "id": "site-about",
    "title": "關於老師"
  },
  {
    "id": "site-testimonials",
    "title": "學生回饋與評價"
  },
  {
    "id": "site-community",
    "title": "泰語學習心聲與提問"
  },
  {
    "id": "site-rules",
    "title": "上課須知"
  },
  {
    "id": "res-songs",
    "title": "用歌曲學泰語"
  },
  {
    "id": "res-playlists",
    "title": "YouTube 教學影片播放清單"
  },
  {
    "id": "a-1on1-guide",
    "title": "學泰語為什麼要找老師一對一？不只是看影片、用 APP 就好"
  },
  {
    "id": "a-adult-learning",
    "title": "學泰語別學小孩「自然習得」：大人沒有十幾年可以慢慢摸索"
  },
  {
    "id": "a-cant-hear",
    "title": "【文章】住泰國久了發音就會準嗎？發音細節容易被忽略"
  },
  {
    "id": "a-group-vs-1on1",
    "title": "學泰語團體班 vs 一對一：兩小時的課，你自己真的講到幾分鐘？"
  },
  {
    "id": "a-interpreter",
    "title": "想當泰語導遊、翻譯？泰語程度要練到什麼水準"
  },
  {
    "id": "a-how-long",
    "title": "學泰語要多久？從零開始到能開口對話要多久"
  },
  {
    "id": "a-lego-guide",
    "title": "【文章】泰語造句好難？造句方法介紹"
  },
  {
    "id": "a-output",
    "title": "【文章】背單字卻講不出來：只有輸入沒有輸出的問題"
  },
  {
    "id": "a-phonics",
    "title": "泰語一定要學拼音規則嗎？為什麼發音比認字更重要"
  },
  {
    "id": "a-pronunciation",
    "title": "為什麼泰國人聽不懂我的泰語？發音不準是最常見的原因"
  },
  {
    "id": "a-reading-guide",
    "title": "【文章】泰文怎麼拼讀？拼讀方法介紹"
  },
  {
    "id": "a-selfstudy-vs",
    "title": "自學泰語 vs 找老師一對一：怎麼選？優缺點老實比較"
  },
  {
    "id": "a-texting",
    "title": "只會講不會打字？這年代交泰國朋友，不會打字比不會講更麻煩"
  },
  {
    "id": "a-thai-chinese",
    "title": "泰語跟中文有關係嗎？台灣人學泰語其實比想像中容易上手"
  },
  {
    "id": "a-theory-01",
    "title": "【文章】背了很多單字還是講不出來：記憶類型的問題"
  },
  {
    "id": "a-theory-02",
    "title": "泰語聽不懂，其實是「聽不到」？母語聲音濾鏡如何改寫你耳朵聽到的東西"
  },
  {
    "id": "a-theory-03",
    "title": "學泰語就像學開車：為什麼一開始每件事都要同時想，久了卻能邊講邊笑"
  },
  {
    "id": "a-theory-04",
    "title": "【文章】泰國人聽不懂你講話：多個小錯誤疊加的問題"
  },
  {
    "id": "a-theory-05",
    "title": "學泰語最被低估的一步：先「讀得懂」，因為閱讀會利滾利"
  },
  {
    "id": "a-theory-06",
    "title": "練泰文打字不是在練手指，是在練語言：一個被誤會的高效練習"
  },
  {
    "id": "a-theory-07",
    "title": "泰語聲調規則背得滾瓜爛熟，為什麼一開口還是錯？規則跟直覺是兩回事"
  },
  {
    "id": "a-theory-08",
    "title": "拼得出來 vs 一眼就認得：讀泰文其實是兩種不同的能力"
  },
  {
    "id": "a-theory-09",
    "title": "從單字到句子，中間到底要練什麼？「詞塊」是被跳過的那一步"
  },
  {
    "id": "a-theory-10",
    "title": "聽力是最容易「自我感覺良好」的技能：為什麼你以為的進步常常是錯覺"
  },
  {
    "id": "a-theory-11",
    "title": "母語者為什麼不用想聲調、不用想文法？「自動化」如何把語言變成反射動作"
  },
  {
    "id": "a-theory-12",
    "title": "泰語自學地圖：從零開始到能開口的 10 個階段（整套系統總整理）"
  },
  {
    "id": "a-theory-13",
    "title": "【文章】單字量大卻常詞窮：認得出跟叫得出來是兩種字彙量"
  },
  {
    "id": "a-theory-14",
    "title": "為什麼學泰語第一天就覺得腦袋要爆炸？認知負荷理論告訴你怎麼拆才不會累死"
  },
  {
    "id": "a-theory-15",
    "title": "泰語聽起來是一長串黏在一起的聲音，根本分不出哪裡是一個詞？問題出在「切開」之前"
  },
  {
    "id": "a-theory-16",
    "title": "泰語子音、母音、尾音一次全部學？為什麼「先拆開」才是真正的捷徑"
  },
  {
    "id": "a-theory-17",
    "title": "練錯了自己不會發現——為什麼「立刻被糾正」是學泰語進步最快的方法"
  },
  {
    "id": "a-theory-18",
    "title": "單字都會，排出來的泰語句子卻怪怪的？排順序比你想像中難得多"
  },
  {
    "id": "a-theory-19",
    "title": "打字打得出正確泰語句子，一開口卻整個卡住——中間漏掉的那一段"
  },
  {
    "id": "a-theory-20",
    "title": "從「腦中先翻譯」到「直接用泰語想」——這條路徑其實有科學根據"
  },
  {
    "id": "a-theory-21",
    "title": "【文章】背了很多單字還是不會聊天：功能詞塊的問題"
  },
  {
    "id": "a-theory-22",
    "title": "越怕講錯泰語，講起來越不順？「情感濾網」如何真的把話卡在嘴邊"
  },
  {
    "id": "a-theory-23",
    "title": "開口前總要在腦中先翻譯一次？這個習慣正在讓你的泰語永遠慢半拍"
  },
  {
    "id": "a-theory-24",
    "title": "泰劇看了一整天，泰語還是講不出口？「只有輸入」為什麼永遠不夠"
  },
  {
    "id": "a-theory-25",
    "title": "大人學語言真的比小孩慢嗎？關鍵期假說沒告訴你的另一半事實"
  },
  {
    "id": "a-tone-guide",
    "title": "【文章】泰語聲調怎麼練？聲調練習方法介紹"
  },
  {
    "id": "a-travel",
    "title": "去泰國旅遊必學的 10 句泰語，比英文更容易讓當地人開心"
  },
  {
    "id": "a-typing-guide",
    "title": "【文章】泰文打字怎麼學？打字方法介紹"
  },
  {
    "id": "a-word-order-guide",
    "title": "【文章】泰語語序總是排錯？語序練習方法介紹"
  },
  {
    "id": "a-word-segmentation",
    "title": "泰文字全部黏在一起，根本看不出哪裡斷句？連電腦都會卡住"
  }
];
// GENERATED_WHITELIST_END

const ALLOWED_DESTINATION_IDS = DESTINATIONS.map(function (d) { return d.id; });

// รุ่นโมเดล — ปรับได้ผ่าน secret GEMINI_MODEL โดยไม่ต้อง deploy โค้ดใหม่ (default ใช้ตัวประหยัด/เร็ว)
// 🔴 2026-08-10: เดิม default เป็น 'gemini-2.0-flash' ซึ่ง Google เลิกใช้ไปแล้ว (deprecated ก.พ. 2026,
// ปิดจริง 3 มี.ค. 2026) ทำให้โดน 429 ทุกครั้งที่เรียก — เจอจริงตอนทดสอบ Search MVP วันนี้ แก้โดยตั้ง
// secret GEMINI_MODEL=gemini-3.5-flash-lite ก่อน (ไม่ต้อง deploy) แล้วอัปเดต default ตรงนี้ให้ตรงด้วย
// กันลืมถ้าวันหลังมีคนลบ secret ทิ้งจะได้ไม่ย้อนกลับไปพังแบบเดิม
const DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash-lite';

// กัน cost บาน — ปรับตัวเลขได้ตรงนี้ที่เดียว (reuse game_content_rl_check เดิม ไม่ต้องสร้าง SQL ใหม่)
const RATE_LIMIT = {
  perIp: { limit: 12, windowSec: 60 },       // ต่อ IP เดียว ≤ 12 ครั้ง/นาที (คนพิมพ์ค้นหาจริงไม่ถึงนี้)
  global: { limit: 300, windowSec: 60 },     // รวมทั้งระบบ ≤ 300 ครั้ง/นาที กันบอทกระจาย IP ยิงรัว
};

const SYSTEM_INSTRUCTION = [
  '你是一個嚴格的分類器,不是聊天機器人,也不能自由對話。',
  '使用者會輸入一段中文搜尋文字(可能有錯字、口語、字詞順序顛倒,或資訊不完整)。',
  '你的任務：從「候選清單」裡選出最符合使用者意圖的一個 id,並且誠實判斷你有多確定。',
  '規則(必須嚴格遵守)：',
  '1. id 只能是候選清單裡出現過的值,一個字元都不能改、不能自己編造 — 即使不確定,也要選一個最接近的,不能留空。',
  '2. confident 為 true 表示你相當確定使用者就是要找這個;confident 為 false 表示你只是最接近的猜測,並不確定。',
  '3. 不可以回答任何清單以外的內容、網址、或建議。',
  '4. 只回傳一個 JSON 物件 { "id": "...", "confident": true/false },不要有其他文字。',
].join('\n');

function corsHeaders(origin) {
  const allowOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Vary': 'Origin',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };
}

const ALLOWED_ORIGINS = [
  'https://mrtaihualin.com',
  'https://www.mrtaihualin.com',
  'https://mrtaihualin.github.io',
  // 2026-08-10 (P7-02 staging): หน้าทดสอบ staging บน Netlify
  'https://gentle-moxie-bf64ad.netlify.app',
];

function json(body, status, origin) {
  return new Response(JSON.stringify(body), { status: status || 200, headers: corsHeaders(origin) });
}

serve(async (req) => {
  const origin = req.headers.get('origin') || req.headers.get('Origin') || '';
  const headers = corsHeaders(origin);
  if (req.method === 'OPTIONS') return new Response('ok', { headers });
  if (req.method !== 'POST') return json({ ok: false, error: 'method not allowed' }, 405, origin);

  let body;
  try { body = await req.json(); } catch (e) {
    return json({ ok: false, error: 'bad json' }, 400, origin);
  }

  const query = String(body?.query || '').slice(0, 200); // กันคำค้นยาวเกินจำเป็น
  if (!query.trim()) return json({ ok: false, error: 'empty query' }, 400, origin);

  // ยังไม่มี whitelist (ยังไม่เคยรัน sync script) — ไม่มั่นใจ ไม่เดา ไม่ยิง Gemini เปล่าๆ
  if (!ALLOWED_DESTINATION_IDS.length) {
    return json({ ok: true, matched: false, reason: 'whitelist empty — run scripts/sync-search-gemini-whitelist.js' }, 200, origin);
  }

  const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
  if (!GEMINI_API_KEY) {
    // ยังไม่ตั้ง secret จริง — ตอบแบบไม่เดา ไม่ล่ม (ตรงตามกฎ "ไม่มั่นใจ = ไม่เดา")
    return json({ ok: true, matched: false, reason: 'gemini not configured yet' }, 200, origin);
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const admin = createClient(SUPABASE_URL, SERVICE_KEY); // service_role — เรียก rate-limit RPC เดิมได้

    // ── rate limit 2 ชั้น (ต่อ IP + รวมทั้งระบบ) — fail-open ถ้า RPC เอง error (เหมือน game-content เดิม) ──
    const xff = req.headers.get('x-forwarded-for') || '';
    const ip = (xff.split(',')[0] || '').trim() || 'unknown';
    const [rlIp, rlGlobal] = await Promise.all([
      admin.rpc('game_content_rl_check', { p_key: 'search_gemini_ip:' + ip, p_limit: RATE_LIMIT.perIp.limit, p_window: RATE_LIMIT.perIp.windowSec }),
      admin.rpc('game_content_rl_check', { p_key: 'search_gemini_global', p_limit: RATE_LIMIT.global.limit, p_window: RATE_LIMIT.global.windowSec }),
    ]);
    if ((!rlIp.error && rlIp.data === false) || (!rlGlobal.error && rlGlobal.data === false)) {
      return json({ ok: true, matched: false, reason: 'rate_limited' }, 200, origin);
    }

    // ── เรียก Gemini จริง — บังคับตอบ JSON { id } เท่านั้น ผ่าน responseSchema (enum = whitelist + "none") ──
    const model = Deno.env.get('GEMINI_MODEL') || DEFAULT_GEMINI_MODEL;
    const payload = {
      systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
      contents: [{
        role: 'user',
        parts: [{ text: '候選清單(JSON):\n' + JSON.stringify(DESTINATIONS) + '\n\n使用者搜尋文字：「' + query + '」' }],
      }],
      generationConfig: {
        temperature: 0,
        maxOutputTokens: 60,
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'OBJECT',
          properties: {
            id: { type: 'STRING', enum: ALLOWED_DESTINATION_IDS },
            confident: { type: 'BOOLEAN' },
          },
          required: ['id', 'confident'],
        },
      },
    };

    const ctrl = new AbortController();
    const timer = setTimeout(function () { ctrl.abort(); }, 8000); // กัน Gemini ค้างแล้วดึงทั้ง request ไปด้วย

    let resp;
    try {
      resp = await fetch(
        'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent?key=' + GEMINI_API_KEY,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: ctrl.signal }
      );
    } catch (e) {
      clearTimeout(timer);
      console.error('search-gemini: fetch to Gemini failed', String(e));
      return json({ ok: true, matched: false, reason: 'gemini request failed' }, 200, origin);
    }
    clearTimeout(timer);

    if (!resp.ok) {
      const errText = await resp.text().catch(function () { return ''; });
      console.error('search-gemini: gemini http ' + resp.status, errText.slice(0, 300));
      return json({ ok: true, matched: false, reason: 'gemini http ' + resp.status }, 200, origin);
    }

    let data;
    try { data = await resp.json(); } catch (e) {
      return json({ ok: true, matched: false, reason: 'gemini bad json' }, 200, origin);
    }

    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    let parsed;
    try { parsed = JSON.parse(text); } catch (e) {
      console.error('search-gemini: gemini response not valid json', String(text).slice(0, 200));
      return json({ ok: true, matched: false, reason: 'gemini response not valid json' }, 200, origin);
    }

    const pickedId = parsed && parsed.id;
    const pickedConfident = !!(parsed && parsed.confident);
    // ด่านสุดท้าย — ไม่เชื่อ Gemini เฉยๆ ต้องอยู่ใน whitelist จริงเท่านั้นถึงจะส่งกลับ
    if (!pickedId || ALLOWED_DESTINATION_IDS.indexOf(pickedId) === -1) {
      return json({ ok: true, matched: false, reason: 'no confident match' }, 200, origin);
    }

    // matched:true เสมอถ้า id อยู่ใน whitelist — confident:false = ให้ฝั่ง client โชว์เป็น "เดา" มีป้ายกำกับ
    // (2026-08-10 รอบ 2 ตามที่ Lin สั่ง: อยากให้บอกว่า "เดา" แทนตอบไม่เจอเงียบๆ เวลาคำค้นกำกวม)
    return json({ ok: true, matched: true, id: pickedId, confident: pickedConfident }, 200, origin);
  } catch (e) {
    console.error('search-gemini: unexpected error', String((e && e.message) || e));
    return json({ ok: false, error: 'internal error' }, 500, origin);
  }
});
