-- ════════════════════════════════════════════════════════════
-- game_words / game_sentences — คลังคำ/ประโยคจริง (ล็อกจริง ไม่ใช่เพดานปลอมฝั่ง browser)
-- Lin 2026-08-02 — แก้บั๊กความปลอดภัย: เดิม data/words-data.js กับ data/adv-sentences.js
--   เป็นไฟล์ public เปิด URL ตรงๆ เห็นครบทุกคำ/ทุกประโยคเสมอ ไม่ว่าจะล็อกอินหรือไม่
--   (เพดานเดิมเป็นแค่ JS ตัดอาร์เรย์ฝั่ง browser — ไม่ใช่ด่านความปลอดภัยจริง)
--
-- ตอนนี้: ข้อมูลเต็มย้ายมาอยู่ในตาราง 2 ตัวนี้ — client (anon/authenticated) แตะไม่ได้เลย
--   (ไม่มี grant ให้เลย + เปิด RLS ไม่มี policy = กันสองชั้น) มีแค่ Edge Function
--   `game-content` (ใช้ service_role key ซึ่งข้าม RLS ได้เสมอ) เท่านั้นที่อ่านได้ แล้วค่อยตัดโควตา
--   ตามระดับผู้ใช้ (ไม่ล็อกอิน / ล็อกอินแล้ว) ก่อนส่งกลับ — ดู supabase/functions/game-content/index.ts
--
-- rank = ลำดับความสำคัญ (ยิ่งน้อยยิ่งมาก่อน) — Edge Function ใช้ "order by rank limit เพดาน"
--   คำ (game_words): rank มาจาก CAP_ORDER_TH_初/中 ใน data/words-data.js (Lin อนุมัติ 2026-07-31,
--     อ้างอิงความถี่จริงจาก OpenSubtitles2018 ไทย + fallback Thai National Corpus)
--   ประโยค (game_sentences): rank = ลำดับตามไฟล์เดิม data/adv-sentences.js (Lin ยืนยัน 2026-08-02
--     ให้ใช้แบบนี้ก่อน เร็วกว่า — ยังไม่มีระบบให้คะแนนความถี่ของประโยคจริงจัง)
--
-- วิธีเติมข้อมูลเข้าตาราง: รัน scripts/migrate-game-content.js (ต้องตั้ง env SUPABASE_URL +
--   SUPABASE_SERVICE_ROLE_KEY ในเครื่อง Lin เอง — ห้ามใส่ใน repo เด็ดขาด) ทุกครั้งหลัง Lin
--   อนุมัติคำ/ประโยคใหม่ผ่านสกิลร่างเดิม (ไฟล์ .js ยังเป็นต้นฉบับที่ Lin แก้เหมือนเดิมทุกอย่าง —
--   สคริปต์นี้แค่ซิงก์เข้า Supabase หลังอนุมัติ)
--
-- ปลอดภัยที่จะรันซ้ำ (create table if not exists / create or replace ทั้งหมด)
-- ════════════════════════════════════════════════════════════


-- ── 1) game_words ──────────────────────────────────────────────
create table if not exists public.game_words (
  id         bigint generated always as identity primary key,
  word       text not null,                    -- ตัวสะกดจริง (key หลัก เหมือน words-data.js)
  en         text,                              -- คำอ่านโรมัน
  zh         text,                              -- คำแปลจีน
  level      text not null check (level in ('初','中')),
  category   text,                              -- หมวดคำ (ใช้ในเกมเสียง)
  syls       jsonb not null,                    -- อาร์เรย์แยกพยางค์ {cons,lead,cluster,vowel,tone,final,tone_name,th,en,...}
  reading_th text,                              -- คำอ่านจริงระดับคำ (ใส่เฉพาะตอนอ่านต่างจาก word)
  read_syls  jsonb,                             -- การแตกเสียงตามพยางค์อ่าน (คำที่พยางค์เขียน≠อ่าน)
  rank       int not null,                      -- ลำดับความถี่ใช้จริง — ยิ่งน้อยยิ่งมาก่อน (ดูหัวไฟล์)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- ห้าม 2 คำซ้ำกันในระดับเดียวกัน (unique key ที่ migrate-game-content.js ใช้ upsert ทับ)
create unique index if not exists uq_game_words_word_level on public.game_words(word, level);
create index if not exists idx_game_words_level_rank on public.game_words(level, rank);

alter table public.game_words enable row level security;
-- ไม่มี policy เลยสักตัว (ทุกคำสั่ง select/insert/update/delete) = client (anon/authenticated)
-- แตะไม่ได้เลยแม้แต่อ่าน — อ่านได้เฉพาะ service_role (Edge Function) ซึ่งข้าม RLS โดยธรรมชาติอยู่แล้ว
-- แต่เผื่อไว้อีกชั้น (defense in depth) กันเคสมีคน grant สิทธิ์ตารางนี้ทีหลังโดยไม่ทันคิด:
revoke all on table public.game_words from anon, authenticated;


-- ── 2) game_sentences ──────────────────────────────────────────
create table if not exists public.game_sentences (
  id         bigint generated always as identity primary key,
  th         text not null,                    -- ประโยคเต็ม (ตัวเขียนจริง) — key หลัก
  zh         text,                              -- คำแปลจีน
  reading_th text,                              -- คำอ่านจริงทั้งประโยค คั่นพยางค์ด้วย '-'
  wc         int,                               -- จำนวนพยางค์ทั้งประโยค
  polite_f   text,                              -- ค่าท้ายประโยค ครับ/ค่ะ/คะ (null = ไม่บังคับ)
  words      jsonb not null,                    -- รายละเอียดรายคำ [{th,zh,syls}]
  rank       int not null,                      -- ลำดับตามไฟล์เดิม (ดูหัวไฟล์)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists uq_game_sentences_th on public.game_sentences(th);
create index if not exists idx_game_sentences_rank on public.game_sentences(rank);

alter table public.game_sentences enable row level security;
-- เหตุผลเดียวกับ game_words ข้างบน — ไม่มี policy เลย + revoke ซ้ำอีกชั้น
revoke all on table public.game_sentences from anon, authenticated;


-- ── 3) เช็กด้วยตัวเองว่าล็อกจริง (รันหลังสร้างตารางเสร็จ ก่อน migrate ข้อมูลเข้า) ──
-- ต้องได้ error "permission denied" หรือ 0 แถว — ถ้าเห็นข้อมูลจริงแปลว่ายังไม่ล็อก ห้ามปล่อยขึ้นเว็บ
--   set role anon; select count(*) from public.game_words; reset role;


-- ════════════════════════════════════════════════════════════
-- 4) rate limit เกราะเสริมของ game-content (คนละตัวกับ rl_check/slink_rl_check เดิม
--    เพราะ game-content ต้องรองรับทั้งคนไม่ล็อกอิน (คีย์ตาม IP) และคนล็อกอิน (คีย์ตาม user id)
--    ในฟังก์ชันเดียว — ใช้ text เป็นคีย์กลาง ไม่ผูกกับ uuid แบบ rl_check เดิม)
-- ⚠️ นี่คือ "เกราะกันสแปม/สคริปต์ยิงรัว" เท่านั้น ไม่ใช่ด่านความปลอดภัยจริง — ด่านจริงคือ
--    ตาราง game_words/game_sentences ไม่มี grant ให้ anon/authenticated เลยข้างบนนี้
-- ════════════════════════════════════════════════════════════
create table if not exists public.game_content_rl (
  rl_key       text        not null,   -- 'user:<uuid>' หรือ 'ip:<ip>'
  window_start timestamptz not null,
  cnt          int         not null default 0,
  primary key (rl_key, window_start)
);
alter table public.game_content_rl enable row level security;
-- ไม่มี policy = client แตะไม่ได้เลย (เหมือน rl_counters/slink_rl เดิม)

create or replace function public.game_content_rl_check(
  p_key text, p_limit int default 60, p_window int default 60
) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_bucket timestamptz;
  v_cnt int;
begin
  v_bucket := to_timestamp(floor(extract(epoch from now()) / p_window) * p_window);
  insert into public.game_content_rl (rl_key, window_start, cnt)
  values (p_key, v_bucket, 1)
  on conflict (rl_key, window_start)
  do update set cnt = public.game_content_rl.cnt + 1
  returning cnt into v_cnt;
  return v_cnt <= p_limit;   -- true = ยังไม่เกิน · false = เกินเพดาน
end; $$;

-- ล็อกไม่ให้ client เรียกเอง (เรียกได้เฉพาะฝั่งเซิร์ฟเวอร์ผ่าน service_role)
revoke execute on function public.game_content_rl_check(text, int, int) from anon, authenticated;

-- (ทางเลือก) ลบแถวช่องเวลาเก่ากันตารางบวม — รันเป็นครั้งคราว หรือตั้ง cron ทีหลัง:
--   delete from public.game_content_rl where window_start < now() - interval '1 day';
