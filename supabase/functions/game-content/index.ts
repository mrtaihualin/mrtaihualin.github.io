// ════════════════════════════════════════════════════════════
// Supabase Edge Function: game-content
// หน้าที่: จุดเดียวที่เกม (games-challenge/reading/tone-finder/typing/word-order/listening)
//   ดึงคำ/ประโยคมาใช้ — แทนที่การโหลด data/words-data.js, data/adv-sentences.js ตรงๆ
//   (ของเดิมเป็นไฟล์ public เปิด URL ตรงๆ เห็นครบทุกคำ/ทุกประโยคเสมอ ไม่ว่าจะล็อกอินหรือไม่
//   — เพดานเดิมเป็นแค่ JS ตัดอาร์เรย์ฝั่ง browser ไม่ใช่ด่านความปลอดภัยจริง)
//
// ด่านความปลอดภัยจริงอยู่ 2 ชั้น:
//   1) ตาราง game_words/game_sentences ไม่มี grant ให้ anon/authenticated เลย (ดู
//      supabase/sql/2026-08-02_game_content_schema.sql) — client เรียก PostgREST ตรงๆ
//      อ่านไม่ได้เด็ดขาด ต้องผ่านฟังก์ชันนี้ (service_role) เท่านั้น
//   2) ฟังก์ชันนี้ตัดสิน "tier" (anon/login) จาก JWT ที่ auth.getUser() ยืนยันจริงฝั่งเซิร์ฟเวอร์
//      เท่านั้น — ไม่เชื่อ tier/isLoggedIn ที่ client ส่งมาใน body เด็ดขาด (เผื่อมีคนปลอม
//      body มาหลอกว่า "ฉันล็อกอินแล้ว" เพื่อขอโควตาที่มากกว่า — ฟังก์ชันนี้ไม่อ่านค่านั้นเลย)
//
// เพดานเนื้อหา (Lin ยืนยัน 2026-08-02 — แทนที่เพดานปลอมเดิมทั้งหมด):
//   ระดับ    ไม่ล็อกอิน   ล็อกอินแล้ว(ยังไม่จ่ายเงิน)
//   初        50 คำ        100 คำ
//   中        50 คำ        100 คำ
//   高(ประโยค) 20 ประโยค    40 ประโยค
//   (ยังไม่มีระบบสมาชิกจ่ายเงิน — เกินเพดานคนล็อกอินตอนนี้ "ไม่มีใครเข้าถึงได้เลย" กันไว้
//   สำหรับแพ็กเกจจ่ายเงินในอนาคต ตามที่ Lin ยืนยัน)
//
// วิธี deploy (Lin ต้องทำเอง เพราะ AI ไม่มีสิทธิ์ล็อกอิน Supabase ของ Lin):
//   1. รัน supabase/sql/2026-08-02_game_content_schema.sql ใน SQL Editor ก่อน (สร้างตาราง)
//   2. รัน scripts/migrate-game-content.js เติมข้อมูลเข้าตาราง (ดูวิธีที่หัวไฟล์นั้น)
//   3. supabase functions deploy game-content
//      ⚠️ ไม่ใส่ --no-verify-jwt (ต่างจาก line-webhook) — ฟังก์ชันนี้ถูกเรียกจาก Supabase
//      client ในเบราว์เซอร์เสมอ (แนบ apikey/anon JWT อัตโนมัติ แม้ยังไม่ได้ล็อกอิน) จึงใช้
//      ค่า default (verify_jwt เปิด) ได้เหมือน game-reward/tone-round — เกตเวย์เช็คแค่ว่า
//      "เป็น JWT ของโปรเจกต์นี้จริง" (anon JWT ก็ผ่าน) ส่วน "ใครคือคนที่ล็อกอินอยู่จริง" ฟังก์ชัน
//      นี้เช็คซ้ำเองอีกชั้นด้วย auth.getUser() ข้างล่าง (ไม่เชื่อแค่เกตเวย์อย่างเดียว)
// ════════════════════════════════════════════════════════════

// deno-lint-ignore-file
// @ts-nocheck  (Supabase Edge Function รันบน Deno ไม่ใช่ Node — เวลาแก้ไฟล์นี้ในเครื่องอาจมี type error ของ IDE ปกติ ไม่กระทบตอน deploy จริง)

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// เพดานเนื้อหา — ปรับตัวเลขได้ตรงนี้ที่เดียว ไม่ต้องแก้โค้ดฝั่งเว็บ (ดูตารางที่คอมเมนต์หัวไฟล์)
const CAPS = {
  anon:  { '初': 50,  '中': 50,  sentences: 20 },
  login: { '初': 100, '中': 100, sentences: 40 },
};

// โดเมนจริงของเว็บ (ตรงกับ allowedHosts ใน line-login/index.ts) — www เผื่อไว้แม้ CNAME ปัจจุบันไม่ใช้
const ALLOWED_ORIGINS = [
  'https://mrtaihualin.com',
  'https://www.mrtaihualin.com',
  'https://mrtaihualin.github.io',
];

function corsHeaders(origin) {
  const allowOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Vary': 'Origin',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}
function json(body, status, origin) {
  return new Response(JSON.stringify(body), { status: status || 200, headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) } });
}

serve(async (req) => {
  const origin = req.headers.get('Origin') || '';
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(origin) });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405, origin);

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    // ── หา tier จาก JWT จริงฝั่งเซิร์ฟเวอร์เท่านั้น (ไม่อ่าน/ไม่เชื่อ body ใดๆ ที่ client ส่งมาเรื่อง tier) ──
    const authHeader = req.headers.get('Authorization') || '';
    const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: userData } = await userClient.auth.getUser();
    const user = userData?.user || null;
    const tier = user ? 'login' : 'anon';
    const caps = CAPS[tier];

    const admin = createClient(SUPABASE_URL, SERVICE_KEY); // service_role — ข้าม RLS ได้ ใช้อ่านตารางล็อกเท่านั้น

    // ── rate limit เกราะเสริม (fail-open เหมือน rl_check/slink_rl_check เดิม) — กันสคริปต์ดูดข้อมูลรัวๆ ──
    // คนล็อกอิน → คีย์ตาม user id (ปลอมไม่ได้) · คนไม่ล็อกอิน → คีย์ตาม IP (x-forwarded-for)
    const xff = req.headers.get('x-forwarded-for') || '';
    const ip = (xff.split(',')[0] || '').trim() || 'unknown';
    const rlKey = user ? ('user:' + user.id) : ('ip:' + ip);
    const { data: rlOk, error: rlErr } = await admin.rpc('game_content_rl_check', { p_key: rlKey, p_limit: 60, p_window: 60 });
    if (!rlErr && rlOk === false) return json({ error: 'rate_limited — 請稍後再試' }, 429, origin);

    // ── ดึงคำ 初/中 + ประโยค高 ตามเพดานของ tier นี้ (order by rank = ลำดับความสำคัญที่ล็อกไว้แล้ว) ──
    const [w1, w2, sent] = await Promise.all([
      admin.from('game_words').select('word,en,zh,level,category,syls,reading_th,read_syls')
        .eq('level', '初').order('rank', { ascending: true }).limit(caps['初']),
      admin.from('game_words').select('word,en,zh,level,category,syls,reading_th,read_syls')
        .eq('level', '中').order('rank', { ascending: true }).limit(caps['中']),
      admin.from('game_sentences').select('th,zh,reading_th,wc,polite_f,words')
        .order('rank', { ascending: true }).limit(caps.sentences),
    ]);
    if (w1.error) throw w1.error;
    if (w2.error) throw w2.error;
    if (sent.error) throw sent.error;

    // ── แปลงชื่อคอลัมน์ snake_case (DB) → ชื่อฟิลด์ที่ฝั่งเว็บใช้อยู่เดิม (เท่ากับรูปแบบ WORDS_MASTER/ADV_SENTENCES เดิม) ──
    const toWord = (r) => ({
      word: r.word, en: r.en, zh: r.zh, level: r.level, category: r.category, syls: r.syls,
      readingTH: r.reading_th, readSyls: r.read_syls,
    });
    const toSentence = (r) => ({
      th: r.th, zh: r.zh, readingTH: r.reading_th, wc: r.wc, politeF: r.polite_f, words: r.words,
    });

    const words = w1.data.map(toWord).concat(w2.data.map(toWord));
    const sentences = sent.data.map(toSentence);

    return json({ tier, words, sentences }, 200, origin);
  } catch (e) {
    return json({ error: String((e && e.message) || e) }, 500, origin);
  }
});
