-- ════════════════════════════════════════════════════════════════════════════
-- 2026-08-11 — Learning System Foundation (รอบวาง "โครงกลาง" ของระบบข้อมูลการเรียน)
-- ────────────────────────────────────────────────────────────────────────────
-- ไฟล์นี้ทำอะไร (อธิบายแบบภาษาคน):
--   วาง "ตู้เอกสารกลาง" ให้ระบบเรียนภาษาไทยทั้งเว็บ — เพื่อให้ของที่จะทำในอนาคต
--   (Lego / Challenge / AI Practice / Search / Planner / คลังคำข้ามเครื่อง / สมาชิกจ่ายเงิน)
--   ต่อเข้าโครงเดิมได้ โดยไม่ต้องรื้อฐานข้อมูลใหม่ทั้งชุด
--
-- 🔑 หลักที่ยึด (มาจากคำสั่งของ Lin 2026-08-11 — ไม่มีข้อไหน AI คิดขึ้นเอง):
--   1) เนื้อหา 1 ชิ้น = 1 ตัวตน (Learning Item) ใช้ร่วมกันได้ทุกเกม ห้ามสร้างซ้ำแยกตามเกม
--   2) ตัวตนต้องนิ่ง — แก้คำแปล/หมวด/คำอ่าน/typo แล้วประวัติการเรียนของนักเรียนต้องไม่ขาด
--   3) เกม (Surface) · แบบฝึก (Practice Type) · ทักษะ (Skill) เป็น 3 เรื่องคนละเรื่อง
--   4) Practice Event = หลักฐานดิบ (เก็บทุกครั้ง ห้ามทับ) · Learning Memory = สถานะที่คำนวณมา
--   5) ฟรี/จ่ายเงิน ต้องแยก Plan / Price / Entitlement ห้ามเป็นแค่ช่อง paid=true
--
-- 🛑 สิ่งที่ไฟล์นี้ "ตั้งใจไม่ทำ" (เพราะยังไม่มีคำตัดสินของ Lin — ห้ามเดา):
--   · ไม่ใส่รายชื่อ 詞類 / 情境 (taxonomy ยังไม่ล็อก) → ตาราง learning_tags ถูกสร้างแต่ "ว่าง"
--   · ไม่ใส่รายชื่อ Skill (ยังไม่ล็อก) → learning_skills ว่าง
--   · ไม่ใส่สูตร Mastery / ไม่คำนวณสถานะให้ใคร → learning_memory ว่าง
--   · ไม่ใส่ราคา / ชื่อแพ็กเกจจ่ายเงิน / โควตา AI → plan_prices, entitlement_keys ว่าง
--   · ไม่บอกว่า item ไหนใช้กับเกมไหนได้ (compatibility) → learning_item_surfaces ว่าง
--   · ไม่แตะตารางเดิมสักตาราง ไม่ลบ ไม่แก้ ไม่ย้ายข้อมูลเดิม
--
-- ✅ ความปลอดภัยของไฟล์นี้:
--   · **ไม่มีคำสั่งลบข้อมูลเลยแม้แต่คำสั่งเดียว** (ไม่มี drop / delete / truncate / alter drop column)
--     → ตามกฎ repo ข้อ 6 (2026-08-08) ไฟล์ที่ไม่มีคำสั่งทำลายข้อมูล ไม่ต้องบังคับสำรองก่อนรัน
--     แต่ยังแนบบล็อกย้อนกลับ [Z] ไว้ให้ (comment ปิดไว้) ตามกฎเดียวกัน
--   · ทุกคำสั่งรันซ้ำได้ (create ... if not exists / on conflict do nothing)
--   · ตารางใหม่ทุกตัวเปิด RLS และ **ไม่มี policy = ปิดสนิท (fail-closed)** ยกเว้น 3 ตาราง
--     ที่นักเรียนต้องอ่านของตัวเองได้จริง (ดูหัวข้อ [J] — คิดครบทั้ง 4 คำสั่งตามกฎ RLS ของ repo)
--
-- 📌 ลำดับการรัน: **รันบน staging (xufxvwcelbovzsxywawg) ก่อนเสมอ** แล้วค่อย production
--   (qzkxlhpcputsvbqmtqfi) · รวบรันทั้งไฟล์ได้ในครั้งเดียว ไม่ต้องแบ่งขั้น
--
-- 🔑 **เรื่องที่ต้องทำทุกครั้ง ห้ามลืม:** เพิ่มคำ/ประโยคใหม่แล้วรัน `scripts/migrate-game-content.js`
--   เสร็จ → **ต้องกลับมารันหัวข้อ [K] ของไฟล์นี้ซ้ำ** เพื่อออกเลขตัวตนให้ของใหม่
--   ไม่รัน = คำใหม่ไม่มีตัวตนในระบบเรียน (ระบบยังใช้งานได้ ไม่พัง แต่คำใหม่จะไม่มีประวัติ/ความจำ)
--   วิธีรู้ว่าลืม: ตัวทดสอบ `supabase/tests/2026-08-11_learning_foundation_TEST.sql` ข้อ 2 จะฟ้องให้
--   (รันหัวข้อ [K] ซ้ำได้ปลอดภัย เป็น on conflict do nothing ไม่สร้างซ้ำ ไม่ทับของเดิม)
--
-- 📖 อ่านคู่กับ: supabase/sql/00_ฟังก์ชันไหนอยู่ไฟล์ไหน.md (สารบัญ — อัปเดตแล้วในคอมมิตเดียวกัน)
-- ════════════════════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════════════════════════
-- [A] ตารางรายชื่อ (lookup) — ทำเป็น "ตาราง" ไม่ใช่ CHECK constraint โดยตั้งใจ
--     เหตุผล: Lin ยังไม่ล็อกรายชื่อ 詞類/情境/Skill · ถ้าใช้ CHECK constraint การเพิ่มค่าใหม่
--     ต้องเขียน migration ทุกครั้ง (= "รื้อใหญ่") · ทำเป็นตาราง = เพิ่มค่าใหม่คือ insert 1 แถว
-- ════════════════════════════════════════════════════════════════════════════

-- A1) ชนิดของ Learning Item — เพิ่มชนิดใหม่ในอนาคตได้โดยไม่ต้องแก้โครงตาราง
create table if not exists public.learning_item_types (
  code       text primary key,
  label_zh   text not null,
  note       text,
  created_at timestamptz not null default now()
);
-- 3 ชนิดนี้มาจากคำสั่งของ Lin ตรงๆ ("ต้องรองรับอย่างน้อย word / sentence / pattern")
insert into public.learning_item_types (code, label_zh, note) values
  ('word',     '單字',  'คำเดี่ยว/คำหลายพยางค์ — ปัจจุบันเนื้อหาจริงอยู่ในตาราง game_words'),
  ('sentence', '句子',  'ประโยค — ปัจจุบันเนื้อหาจริงอยู่ในตาราง game_sentences'),
  ('pattern',  '句型',  'แม่แบบประโยค เช่น "อยาก + V" — ยังไม่มีเนื้อหาจริงในระบบ รอ Lin กำหนด')
on conflict (code) do nothing;

-- A2) สถานะวงจรชีวิตของเนื้อหา (Content Operations) — 5 ค่านี้มาจากคำสั่งของ Lin ตรงๆ
--     (Candidate → Review → Approved → Active + Flagged)
create table if not exists public.learning_item_statuses (
  code            text primary key,
  label_zh        text not null,
  usable_in_game  boolean not null,   -- true = อนุญาตให้ส่งเข้าเกมได้
  ord             int not null,
  created_at      timestamptz not null default now()
);
insert into public.learning_item_statuses (code, label_zh, usable_in_game, ord) values
  ('candidate', '候選',   false, 1),
  ('review',    '待審核', false, 2),
  ('approved',  '已核准', false, 3),
  ('active',    '已上線', true,  4),
  ('flagged',   '有問題', false, 5)
on conflict (code) do nothing;

-- A3) แกนของการจัดหมวด — Lin กำหนด 2 แกนหลัก (詞類 / 情境) และต้องเพิ่มแกนใหม่ได้ในอนาคต
create table if not exists public.learning_tag_axes (
  code       text primary key,
  label_zh   text not null,
  note       text,
  created_at timestamptz not null default now()
);
insert into public.learning_tag_axes (code, label_zh, note) values
  ('pos',       '詞類', 'ชนิดของคำ เช่น 動詞/名詞/形容詞 — รายชื่อยังไม่ล็อก'),
  ('situation', '情境', 'สถานการณ์ที่ใช้ เช่น 飲食/交通/購物 — รายชื่อยังไม่ล็อก')
on conflict (code) do nothing;

-- A4) รายชื่อป้าย (tag) จริงในแต่ละแกน
-- 🛑 **ตั้งใจไม่ใส่ข้อมูลใดๆ** — Lin ยังไม่ล็อกรายชื่อ และ AI ห้ามเดา taxonomy
--    ตอนนี้ game_words มีช่อง `category` เดียวที่ปน 2 แกนอยู่ (เช่น 'กริยา' = 詞類
--    แต่ 'โรงแรม' = 情境 และ 'นามอาหาร' = ปนทั้งสองแกนในค่าเดียว)
--    → รายงานการปนอยู่ที่ `node scripts/audit-learning-content.js` รอ Lin ตัดสินการจับคู่
create table if not exists public.learning_tags (
  tag_id     uuid primary key default gen_random_uuid(),
  axis_code  text not null references public.learning_tag_axes(code),
  code       text not null,               -- ชื่อเรียกในระบบ (ภาษาอังกฤษ/พินอิน)
  label_zh   text not null,
  label_th   text,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index if not exists uq_learning_tags_axis_code
  on public.learning_tags(axis_code, code);

-- A5) ชนิดความสัมพันธ์ระหว่าง item
--     2 ค่านี้มาจากตัวอย่างที่ Lin เขียนมาตรงๆ (Word ↔ Sentence, Pattern ↔ Sentence)
create table if not exists public.learning_relation_types (
  code       text primary key,
  label_zh   text not null,
  note       text,
  created_at timestamptz not null default now()
);
insert into public.learning_relation_types (code, label_zh, note) values
  ('sentence_contains_word', '句子包含單字',
   'ประโยค → คำที่อยู่ในประโยคนั้น · ⚠️ ความสัมพันธ์นี้ห้ามใช้แปลว่า "ทำประโยคได้ = คำทุกคำ mastered"'),
  ('sentence_uses_pattern',  '句子使用句型',
   'ประโยค → 句型 ที่ประโยคนั้นใช้ · ⚠️ ห้ามใช้แปลว่า pattern ถูก mastered โดยอัตโนมัติ')
on conflict (code) do nothing;

-- A6) Practice Surface = "ผู้เรียนกำลังใช้ส่วนไหนของเว็บ"
--     ค่าที่ใส่ไว้ = ของที่ **มีอยู่จริงในโค้ดวันนี้** (ไม่ใช่ของที่วางแผนไว้)
--     ⚠️ legacy_codes สำคัญมาก: วันนี้ระบบเดิมเรียกเกมเดียวกันด้วยชื่อไม่เหมือนกันถึง 3 แบบ
--        เช่น เกมลำดับคำ = 'wordorder' (ตอนเขียน tone_srs_state) แต่ = 'word_order'
--        (ใน game_reward_events) และ = 'word_order' ใน GA4 — จดไว้เพื่อให้อนาคตจับคู่ข้อมูลเก่าได้
--        ห้ามแก้ชื่อในตารางเดิมรอบนี้ (จะทำให้ข้อมูลประวัติของนักเรียนขาด)
create table if not exists public.practice_surfaces (
  code         text primary key,
  label_zh     text not null,
  page_path    text,
  legacy_codes text[] not null default '{}',
  is_active    boolean not null default true,
  created_at   timestamptz not null default now()
);
insert into public.practice_surfaces (code, label_zh, page_path, legacy_codes) values
  ('tone_finder', '泰語聲調練習室', '/tone-finder.html',   array['tone','tone_finder']),
  ('reading',     '泰語拼讀練習室', '/reading-game.html',  array['reading','reading_game']),
  ('listening',   '泰語聽力練習室', '/listening-game.html',array['listening_game']),
  ('typing',      '泰語打字練習室', '/typing-game.html',   array['typing','typing_game']),
  ('word_order',  '泰語語序練習室', '/word-order.html',    array['wordorder','word_order']),
  ('lego',        '造句練習（樂高）','/lego.html',          array['lego']),
  ('challenge',   '綜合挑戰',       '/games-challenge.html',array['challenge'])
on conflict (code) do nothing;

-- A7) Practice Type = "ผู้เรียนถูกขอให้ทำอะไร" (คนละชั้นกับเกม)
--     ใส่แค่ 2 ค่าที่ Lin ยกตัวอย่างมาเอง และยืนยันได้จากโค้ดจริง
--     (js/games/listening-game-app.js — state.mode มีค่า 'mc' กับ 'type')
--     ⚠️ แบบฝึกของเกมอื่นตั้งใจยังไม่ใส่ ต้องไล่ดูโค้ดทีละเกมก่อน ห้ามเดา
create table if not exists public.practice_types (
  code         text primary key,
  label_zh     text not null,
  surface_code text references public.practice_surfaces(code),  -- null = ใช้ได้หลายเกม
  legacy_codes text[] not null default '{}',
  note         text,
  created_at   timestamptz not null default now()
);
insert into public.practice_types (code, label_zh, surface_code, legacy_codes, note) values
  ('listen_and_choose', '聽音選答', 'listening', array['mc'],
   'ยืนยันจากโค้ดจริง: listening-game-app.js state.mode = ''mc'''),
  ('listen_and_type',   '聽音打字', 'listening', array['type'],
   'ยืนยันจากโค้ดจริง: listening-game-app.js state.mode = ''type''')
on conflict (code) do nothing;

-- A8) Skill = "ระบบกำลังได้หลักฐานเรื่องความสามารถด้านใด"
-- 🛑 **ตั้งใจไม่ใส่ข้อมูลใดๆ** — Lin ระบุชัดว่า Skill taxonomy ยังไม่ล็อก
--    ห้าม AI คิด enum สุดท้ายเอง · ตารางว่างนี้แปลว่า learning_memory ยังเขียนไม่ได้ (ตั้งใจ)
create table if not exists public.learning_skills (
  code       text primary key,
  label_zh   text not null,
  note       text,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

-- A9) สถานะของ Learning Memory — 5 ค่านี้มาจากคำสั่งของ Lin ตรงๆ
--     (未練習 / 練習中 / 需要加強 / 穩定 / 掌握)
--     ⚠️ มีแค่ "ชื่อสถานะ" ไม่มี "สูตรว่าเมื่อไหร่เปลี่ยนสถานะ" — สูตรยังไม่ล็อก ห้ามเดา
create table if not exists public.learning_memory_states (
  code       text primary key,
  label_zh   text not null,
  ord        int not null,
  created_at timestamptz not null default now()
);
insert into public.learning_memory_states (code, label_zh, ord) values
  ('not_started', '未練習', 1),
  ('learning',    '練習中', 2),
  ('needs_work',  '需要加強', 3),
  ('stable',      '穩定',   4),
  ('mastered',    '掌握',   5)
on conflict (code) do nothing;


-- ════════════════════════════════════════════════════════════════════════════
-- [B] ตัวตนของเนื้อหา (Learning Item) — หัวใจของทั้งไฟล์
-- ────────────────────────────────────────────────────────────────────────────
-- 🔴 ปัญหาจริงที่ตารางนี้แก้ (เจอจาก audit 2026-08-11 — สำคัญที่สุดของรอบนี้):
--   วันนี้ "ตัวตน" ของคำ = ตัวหนังสือไทยเอง (game_words unique(word,level) ·
--   tone_srs_state คีย์ (user_id, game, level, word) · star_ledger เก็บ word เป็น text)
--   และ scripts/migrate-game-content.js มีขั้น pruneStale() ที่ **ลบแถวที่ไม่มีในไฟล์ต้นฉบับแล้ว**
--   → ถ้า Lin แก้ typo ของคำหนึ่ง: แถวเก่าถูกลบ + แถวใหม่ถูกสร้าง (id ใหม่)
--     ประวัติการเรียนของนักเรียนที่ผูกกับคำเดิม "ขาดทันที" และไม่มีใครรู้เลย
--   → ตารางนี้จึงถือ item_id (uuid) เป็นตัวตนที่ไม่เปลี่ยนตาม "ตัวหนังสือ"
--     และเก็บชื่อเก่าไว้ใน learning_item_key_history เวลาเปลี่ยนคำเขียน
--
-- ⚠️ ตั้งใจ **ไม่** ผูก foreign key ไปที่ game_words.id / game_sentences.id
--    เพราะ id พวกนั้นหายได้จริงจาก pruneStale() (ดูข้างบน) — ถ้าผูก FK ไว้ วันที่ Lin แก้ typo
--    คำสั่ง migrate จะพังทั้งชุด หรือ (แย่กว่า) พาแถวประวัติหายไปด้วย
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.learning_items (
  item_id        uuid primary key default gen_random_uuid(),

  item_type      text not null references public.learning_item_types(code),
  status          text not null default 'candidate' references public.learning_item_statuses(code),

  -- ระดับความยากกลางของทั้งระบบ (Lin: "โรงพยาบาล = 中級 เป็นระดับเดียวกันไม่ว่าไปอยู่เกมไหน")
  -- ห้ามสร้างช่องความยากแยกตามเกมเพิ่มในอนาคต
  difficulty     text,

  -- เจ้าของ: null = Master Content (เนื้อหากลางของระบบ) · ไม่ null = Personal Content ของคนนั้น
  -- Lin: Personal Content ต้องผูกเจ้าของ / แยกจาก Master / ห้ามคนอื่นเห็น / ห้าม promote อัตโนมัติ
  owner_user_id  uuid references auth.users(id) on delete cascade,

  -- เนื้อหาจริงอยู่ที่ไหน (ไม่ก๊อปเนื้อหาซ้ำมาไว้ที่นี่ — กันข้อมูล 2 ชุดไม่ตรงกัน)
  --   'game_words'     → content_key = ตัวสะกด + '@' + ระดับ  เช่น 'โรงพยาบาล@中'
  --   'game_sentences' → content_key = ประโยคเต็ม
  --   'personal'       → เนื้อหาอยู่ในช่อง payload ข้างล่างนี้เลย
  content_source text not null check (content_source in ('game_words','game_sentences','personal')),
  content_key    text not null,

  -- ใช้เฉพาะ Personal Content (content_source='personal') — Master ให้เป็น null
  payload        jsonb,

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  -- Personal Content ต้องมีเจ้าของเสมอ · Master Content ต้องไม่มีเจ้าของเสมอ
  constraint learning_items_owner_matches_source check (
    (content_source = 'personal' and owner_user_id is not null)
    or (content_source <> 'personal' and owner_user_id is null)
  )
);

-- Master Content: ห้ามซ้ำในระบบ
create unique index if not exists uq_learning_items_master_key
  on public.learning_items(content_source, content_key)
  where owner_user_id is null;
-- Personal Content: ห้ามซ้ำ "ภายในคนเดียวกัน" (คนละคนมีคำเดียวกันได้ ไม่ถือว่าซ้ำ)
create unique index if not exists uq_learning_items_personal_key
  on public.learning_items(owner_user_id, content_source, content_key)
  where owner_user_id is not null;

create index if not exists idx_learning_items_type_status on public.learning_items(item_type, status);
create index if not exists idx_learning_items_owner       on public.learning_items(owner_user_id) where owner_user_id is not null;
create index if not exists idx_learning_items_difficulty  on public.learning_items(difficulty);

-- B2) ประวัติการเปลี่ยน "ตัวหนังสือ" ของ item เดิม — ทำให้แก้ typo ได้โดยประวัติไม่ขาด
--     (เขียนแถวที่นี่ทุกครั้งที่ content_key เปลี่ยน แล้ว item_id ยังเป็นตัวเดิม)
create table if not exists public.learning_item_key_history (
  id             bigint generated always as identity primary key,
  item_id        uuid not null references public.learning_items(item_id) on delete cascade,
  old_content_key text not null,
  new_content_key text not null,
  changed_at     timestamptz not null default now(),
  note           text
);
create index if not exists idx_lik_history_item on public.learning_item_key_history(item_id);
create index if not exists idx_lik_history_old  on public.learning_item_key_history(old_content_key);

-- B3) สมุดบันทึกการแก้เนื้อหา (Lin: Content Operations ต้อง "ตรวจสอบได้ · audit ย้อนหลังได้")
create table if not exists public.learning_item_audit (
  id         bigint generated always as identity primary key,
  item_id    uuid references public.learning_items(item_id) on delete set null,
  action     text not null,        -- 'created' | 'status_changed' | 'key_changed' | 'flagged' | ...
  actor      text,                 -- 'lin' | 'script:migrate-game-content' | 'edge:game-content' | ...
  detail     jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_learning_item_audit_item on public.learning_item_audit(item_id, created_at desc);


-- ════════════════════════════════════════════════════════════════════════════
-- [C] การจัดหมวด 2 แกน แบบ many-to-many (item 1 ตัวอยู่ได้หลาย 情境)
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists public.learning_item_tags (
  item_id    uuid not null references public.learning_items(item_id) on delete cascade,
  tag_id     uuid not null references public.learning_tags(tag_id)   on delete cascade,
  created_at timestamptz not null default now(),
  primary key (item_id, tag_id)
);
create index if not exists idx_learning_item_tags_tag on public.learning_item_tags(tag_id);


-- ════════════════════════════════════════════════════════════════════════════
-- [D] ความสัมพันธ์ระหว่างเนื้อหา (Word ↔ Sentence · Pattern ↔ Sentence)
-- ────────────────────────────────────────────────────────────────────────────
-- ⚠️ กฎถาวรที่ Lin ย้ำ: **ทำประโยคสำเร็จ ไม่ได้แปลว่าคำทุกคำในประโยค mastered**
--    ตารางนี้เก็บแค่ "เกี่ยวข้องกัน" ห้ามมีโค้ดไหนใช้ตารางนี้ไล่แจกสถานะ mastered ต่อกันเป็นลูกโซ่
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists public.learning_item_relations (
  from_item_id  uuid not null references public.learning_items(item_id) on delete cascade,
  to_item_id    uuid not null references public.learning_items(item_id) on delete cascade,
  relation_type text not null references public.learning_relation_types(code),
  ord           int,        -- ลำดับ เช่น คำที่เท่าไหร่ในประโยค
  created_at    timestamptz not null default now(),
  primary key (from_item_id, to_item_id, relation_type),
  constraint learning_item_relations_no_self check (from_item_id <> to_item_id)
);
create index if not exists idx_lir_to on public.learning_item_relations(to_item_id, relation_type);


-- ════════════════════════════════════════════════════════════════════════════
-- [E] item นี้ใช้กับเกมไหนได้จริง (Compatibility)
-- ────────────────────────────────────────────────────────────────────────────
-- Lin: "item ไม่จำเป็นต้องใช้ได้ทุกเกม" + "อย่าสร้าง compatibility จากการเดา
--       ให้ตรวจ data / game requirements ของจริงก่อน"
-- 🛑 ตารางนี้จึงถูกสร้างไว้ "ว่าง" — ตัวช่วยตรวจว่าข้อมูลจริงขาดฟิลด์อะไรบ้างอยู่ที่
--    `node scripts/audit-learning-content.js` (อ่านอย่างเดียว ไม่เขียนฐานข้อมูล)
--    รอ Lin ยืนยันเกณฑ์ก่อนค่อยเติมแถว
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists public.learning_item_surfaces (
  item_id         uuid not null references public.learning_items(item_id) on delete cascade,
  surface_code    text not null references public.practice_surfaces(code),
  supported       boolean not null,
  verified_source text,       -- ยืนยันจากอะไร เช่น 'lin-approved' | 'script:audit-learning-content'
  note            text,
  updated_at      timestamptz not null default now(),
  primary key (item_id, surface_code)
);
create index if not exists idx_lis_surface on public.learning_item_surfaces(surface_code, supported);


-- ════════════════════════════════════════════════════════════════════════════
-- [F] Practice Event — หลักฐานดิบ (raw evidence)
-- ────────────────────────────────────────────────────────────────────────────
-- Lin: User + Learning Item + Practice Surface + Practice Type + Result + Session + Timestamp
--      "ห้ามออกแบบโดยเก็บแค่สถานะล่าสุดแล้วทิ้ง history เดิม"
--
-- 🔁 ของเดิมที่ยัง reuse ต่อ ไม่ทำซ้ำ (ตรวจแล้ว 2026-08-11):
--   · tone_sessions / reading_sessions = สรุป "ต่อรอบเล่น" ยังใช้ต่อเหมือนเดิม ไม่แตะ
--     (session_id ในตารางนี้ตั้งใจให้ชี้ไปหาแถวพวกนั้นได้ในอนาคต)
--   · star_ledger = ประวัติการได้ดาว (append-only) ยังใช้ต่อ ไม่ย้าย ไม่ก๊อป
--   · anon_game_events = เหตุการณ์ของคนไม่ล็อกอิน ยังใช้ต่อ
--   ตารางนี้ไม่ได้มาแทนของพวกนั้น — มาเพิ่มชั้นที่ของเดิมไม่มี คือ "หลักฐานระดับ item × ทักษะ"
--
-- 🛑 **ยังไม่มีโค้ดไหนเขียนตารางนี้** และเขียนได้เฉพาะ service_role (Edge Function) เท่านั้น
--    เจตนา: ไม่ซ้ำรอยบทเรียนของ tone_sessions/reading_sessions ที่ client ยิง insert ตรงได้
--    แล้วโกงคะแนนได้จริง (ดู 31_P6-02_ตรวจคะแนน-SRS-leaderboard.md หัวข้อ 🔴)
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists public.practice_events (
  event_id       bigint generated always as identity primary key,

  -- คนที่ฝึก: ล็อกอินแล้วใช้ user_id · ยังไม่ล็อกอินใช้ anon_id (แบบเดียวกับ anon_game_events เดิม)
  user_id        uuid references auth.users(id) on delete cascade,
  anon_id        text,

  -- ฝึกอะไร — null ได้ ถ้าเป็นการฝึกที่ยังผูกกับ item ไม่ได้ (เช่นแบบฝึกภาพรวม)
  item_id        uuid references public.learning_items(item_id) on delete set null,

  surface_code       text not null references public.practice_surfaces(code),
  practice_type_code text references public.practice_types(code),
  skill_code         text references public.learning_skills(code),

  -- ผลลัพธ์: is_correct สำหรับแบบฝึกที่ถูก/ผิดชัดเจน · result เก็บค่าอื่น เช่น 'skipped'
  is_correct     boolean,
  result         text,

  -- ⚠️ Lin ข้อ 8: ห้ามสมมุติว่า practice ทุกครั้งมาจาก weakness/review
  --    ช่องนี้บอก "การฝึกครั้งนี้เกิดเพราะอะไร" — ค่าที่รับ 4 แบบมาจากคำสั่งของ Lin ตรงๆ
  intent         text check (intent in ('new_content','review','weakness','skill_development')),

  -- ⚠️ Lin ข้อ 27: AI Practice ในอนาคตอาจให้หลักฐานที่มีน้ำหนัก/ความมั่นใจต่างจากเกมปกติ
  --    เตรียมช่องไว้ตั้งแต่ต้น เพื่อไม่ต้องรื้อตารางทีหลัง (ค่าเริ่มต้น 1 = เกมปกติ)
  evidence_source     text not null default 'game',   -- 'game' | 'ai_practice' | 'teacher' | ...
  evidence_weight     numeric(4,2) not null default 1.00,
  evidence_confidence numeric(4,3),                   -- null = ไม่มีข้อมูลความมั่นใจ

  session_id     uuid,        -- จับกลุ่มเหตุการณ์ในรอบเล่นเดียวกัน
  meta           jsonb,
  created_at     timestamptz not null default now(),

  -- ต้องรู้ว่าใครฝึกอย่างน้อยทางใดทางหนึ่ง
  constraint practice_events_has_actor check (user_id is not null or anon_id is not null)
);
create index if not exists idx_pe_user_time on public.practice_events(user_id, created_at desc) where user_id is not null;
create index if not exists idx_pe_item      on public.practice_events(item_id, created_at desc);
create index if not exists idx_pe_session   on public.practice_events(session_id);
create index if not exists idx_pe_surface   on public.practice_events(surface_code, created_at desc);


-- ════════════════════════════════════════════════════════════════════════════
-- [G] Learning Memory — สถานะที่ "คำนวณมาจาก" Practice Event (derived state)
-- ────────────────────────────────────────────────────────────────────────────
-- Lin: ระบบกลางชุดเดียว (ห้ามมี Game Memory / Lego Memory / Challenge Memory / AI Memory แยก)
--      แกนหลัก = User × Learning Item × Skill
--
-- 🔁 ของเดิม: tone_srs_state คือ Learning Memory เวอร์ชันแรกที่มีอยู่แล้วจริง
--    แต่คีย์เป็น (user_id, **game**, level, word) = ผูกกับ "ชื่อเกม" และ "ตัวหนังสือ" โดยตรง
--    ซึ่งขัดกับกฎใหม่ข้อ 10 (Memory ห้ามผูกชื่อเกม) และข้อ 2 (ตัวตนต้องนิ่ง)
-- 🛑 **รอบนี้ไม่ย้ายข้อมูลจาก tone_srs_state และไม่แตะมันเลย** — ระบบดาว/SRS เดิมทำงานต่อ
--    เหมือนเดิม 100% (ห้ามเปลี่ยน behavior เดิมจนกว่าจะมี Decision ใหม่)
--    แผนย้ายในอนาคตต้องรอ 2 อย่าง: (1) Skill taxonomy ที่ Lin ล็อก (2) สูตร Mastery
--
-- 🛑 ตารางนี้ยังเขียนไม่ได้จริงตอนนี้ **โดยตั้งใจ** เพราะ skill_code ต้องอ้าง learning_skills
--    ที่ยังว่างอยู่ (= ยังไม่มีใครเดาสูตรลงไปได้)
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists public.learning_memory (
  user_id          uuid not null references auth.users(id) on delete cascade,
  item_id          uuid not null references public.learning_items(item_id) on delete cascade,
  skill_code       text not null references public.learning_skills(code),

  state_code       text not null default 'not_started' references public.learning_memory_states(code),

  -- ตัวนับดิบ (นับได้ตรงๆ ไม่ต้องมีสูตร) — ตั้งใจไม่ใส่ช่อง "คะแนนรวม/mastery score"
  -- เพราะ Lin สั่งห้ามเอาคะแนนดิบจากหลายเกมมาบวกกันเป็นคะแนนกลางจากการเดา
  attempts         int not null default 0 check (attempts >= 0),
  correct_attempts int not null default 0 check (correct_attempts >= 0),

  first_seen_at    timestamptz,
  last_practiced_at timestamptz,
  due_at           timestamptz,   -- เผื่อระบบทบทวน/forgetting ในอนาคต (อัลกอริทึมยังไม่ล็อก)
  updated_at       timestamptz not null default now(),

  primary key (user_id, item_id, skill_code),
  constraint learning_memory_correct_le_attempts check (correct_attempts <= attempts)
);
create index if not exists idx_lm_user_state on public.learning_memory(user_id, state_code);
create index if not exists idx_lm_user_due   on public.learning_memory(user_id, due_at) where due_at is not null;


-- ════════════════════════════════════════════════════════════════════════════
-- [H] ของที่นักเรียนเก็บไว้เอง (Saved Items / คลังคำ 單字庫)
-- ────────────────────────────────────────────────────────────────────────────
-- ทำไมเป็นตารางแยกจาก practice_events / learning_memory:
--   "เก็บคำไว้ดูภายหลัง" ไม่ใช่หลักฐานการฝึก และไม่ใช่สถานะความจำ — Lin เองก็แยก
--   "saved items" ออกจาก "learning history" ในข้อ 22 (รายการที่ต้อง export ได้)
--   และข้อ 21 ระบุว่า "ล้างประวัติการเรียน" ต้องไม่บังคับให้ลบ Personal Content ไปด้วย
--   → ถ้ายัดคลังคำเข้าตารางประวัติ จะทำให้ 2 action นี้แยกกันไม่ได้ (ผิดข้อ 21)
--   ที่ reuse จริงคือ **ชั้นตัวตนของเนื้อหา** (item_id) และแบบแผนความเป็นเจ้าของ/ความเป็นส่วนตัว
--
-- 🔁 ของเดิม: js/games/word-vault.js (localStorage 'linvault_v1' เพดาน 30) +
--    js/games/lego-vault.js (localStorage 'lego_vault_v1' เพดาน 15) — **ยังไม่ถูกแก้ในรอบนี้**
--    ตารางนี้คือที่เก็บฝั่งเซิร์ฟเวอร์ที่รออยู่ ให้คลังคำ sync ข้ามเครื่องได้ตามที่ Lin อนุมัติ
-- 🛑 **ยังไม่มีโค้ดฝั่งเว็บเขียนตารางนี้** — ติดคำถามที่ต้องให้ Lin ตัดสินก่อน:
--    เครื่อง A มี 30 คำ · เครื่อง B มี 25 คำที่ไม่ซ้ำกัน → รวมกันได้ 55 คำ เกินเพดาน 30
--    จะทำอย่างไรโดยไม่ทำข้อมูลเดิมหาย (ห้ามตัดทิ้งเอง) — ดูรายงานรอบนี้
--    ตารางนี้จึง **ไม่บังคับเพดานในฐานข้อมูล** โดยตั้งใจ (เพดานเป็นเรื่องของ UI/สิทธิ์ ไม่ใช่ที่เก็บ)
--
-- word_th เก็บตัวหนังสือไว้ตรงๆ ด้วยเสมอ ไม่พึ่ง item_id อย่างเดียว
--   เหตุผล: คำที่นักเรียนเคยเซฟอาจถูกถอดออกจากคลังกลางภายหลัง (pruneStale) — ถ้าเก็บแต่ item_id
--   คำที่เขาเซฟจะหายจากคลังส่วนตัวเขาไปด้วย ซึ่งผิดกฎ "ห้ามข้อมูลเดิมหาย"
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists public.learning_saved_items (
  user_id        uuid not null references auth.users(id) on delete cascade,
  word_th        text not null,
  item_id        uuid references public.learning_items(item_id) on delete set null,
  zh             text,
  en             text,
  source_surface text references public.practice_surfaces(code),
  vault_key      text not null default 'linvault',   -- 'linvault' (คลังรวม) | 'lego_vault' (คลังเลโก้)
  tags           text[] not null default '{}',
  saved_at       timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  primary key (user_id, vault_key, word_th)
);
create index if not exists idx_lsi_user on public.learning_saved_items(user_id, saved_at desc);


-- ════════════════════════════════════════════════════════════════════════════
-- [I] ฟรี / จ่ายเงิน — แยก Plan · Price · Entitlement (3 เรื่องคนละเรื่อง)
-- ────────────────────────────────────────────────────────────────────────────
-- Lin: "หลังบ้านห้ามออกแบบแค่ boolean paid=true" · "Feature ต้องเช็กสิทธิ์จาก Entitlement"
--      "ห้ามผูก feature กับราคาจำนวนเงินจริงโดยตรง"
-- รองรับ: ขึ้นราคา · grandfathered/founding price · monthly/yearly · promotion · plan ใหม่ ·
--         add-on · โควตา AI · บริการเฉพาะทางในอนาคต
--
-- 🛑 สิ่งที่ตั้งใจไม่ทำรอบนี้ (Lin สั่งว่ายังไม่ต้องตัดสิน):
--    ไม่ใส่ราคา · ไม่ใส่ชื่อแพ็กเกจจ่ายเงิน · ไม่ใส่รายชื่อสิทธิ์ · ไม่ใส่โควตา AI
--    ใส่แค่ plan 'free' ซึ่งเป็นของที่ **มีอยู่จริงแล้ววันนี้** (guest + free login อยู่ฝั่งฟรีทั้งคู่)
--
-- ⚠️ เพดานเนื้อหาเกมวันนี้ (初/中 50→100 · ประโยค 20→40) ยังอยู่ในค่า CAPS ของ
--    supabase/functions/game-content/index.ts เหมือนเดิม **ตั้งใจยังไม่ย้ายมาที่นี่**
--    เพราะถ้าย้ายครึ่งทางจะมีค่าเพดาน 2 ที่แล้วไม่ตรงกัน (ปัญหาเดิมที่ repo นี้เคยเจอกับ SQL 2 ไฟล์ทับกัน)
--    การย้ายต้องทำทีเดียวจบพร้อม Lin อนุมัติ
-- ════════════════════════════════════════════════════════════════════════════

-- I1) Plan = แพ็กเกจ (ไม่มีราคาอยู่ในนี้)
create table if not exists public.billing_plans (
  plan_code  text primary key,
  label_zh   text not null,
  tier       text not null check (tier in ('free','paid')),
  is_active  boolean not null default true,
  note       text,
  created_at timestamptz not null default now()
);
insert into public.billing_plans (plan_code, label_zh, tier, note) values
  ('free', '免費', 'free',
   'ของที่มีอยู่จริงวันนี้ — ครอบทั้งคนไม่ล็อกอิน (guest) และล็อกอินฟรี ตามที่ Lin ระบุ')
on conflict (plan_code) do nothing;

-- I2) Price = ราคาของ plan ในช่วงเวลาหนึ่ง (แยกจาก plan เพื่อขึ้นราคาได้โดยคนเก่าไม่กระทบ)
-- 🛑 ตั้งใจว่างเปล่า — ยังไม่มี Decision เรื่องราคา
create table if not exists public.plan_prices (
  price_id     uuid primary key default gen_random_uuid(),
  plan_code    text not null references public.billing_plans(plan_code),
  currency     text not null,                 -- 'TWD' | 'HKD' | ...
  amount_minor int  not null check (amount_minor >= 0),  -- เก็บเป็นหน่วยย่อย (สตางค์/เซ็นต์) กันปัญหาทศนิยม
  period       text not null check (period in ('monthly','yearly','once')),
  label_zh     text,
  is_public    boolean not null default true, -- false = ราคาพิเศษ/promotion ไม่โชว์หน้าเว็บ
  valid_from   timestamptz not null default now(),
  valid_to     timestamptz,                   -- null = ยังขายอยู่
  created_at   timestamptz not null default now()
);
create index if not exists idx_plan_prices_plan on public.plan_prices(plan_code, valid_from desc);

-- I3) Entitlement = "สิทธิ์ที่ฟีเจอร์เอาไปเช็ก" (ฟีเจอร์ต้องเช็กที่นี่ ห้ามเช็กจากราคา/ชื่อ plan)
-- 🛑 ตั้งใจว่างเปล่า — รายชื่อสิทธิ์ยังไม่ล็อก
create table if not exists public.entitlement_keys (
  key        text primary key,               -- เช่น 'content.words.cap' | 'memory.long_term' | 'ai.quota.daily'
  label_zh   text not null,
  value_type text not null check (value_type in ('bool','int','text')),
  note       text,
  created_at timestamptz not null default now()
);

-- I4) plan ไหนได้สิทธิ์อะไรเท่าไหร่
create table if not exists public.plan_entitlements (
  plan_code       text not null references public.billing_plans(plan_code) on delete cascade,
  entitlement_key text not null references public.entitlement_keys(key)    on delete cascade,
  value_bool      boolean,
  value_int       int,
  value_text      text,
  updated_at      timestamptz not null default now(),
  primary key (plan_code, entitlement_key)
);

-- I5) ใครถือ plan อะไรอยู่ + ถูกล็อกไว้ที่ราคาไหน (grandfathered / founding price)
create table if not exists public.user_plan_grants (
  grant_id   uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  plan_code  text not null references public.billing_plans(plan_code),
  price_id   uuid references public.plan_prices(price_id),  -- null = ฟรี/ให้เปล่า ไม่ผูกราคา
  status     text not null check (status in ('active','trialing','past_due','canceled','expired')),
  source     text,          -- 'manual' | 'ecpay' | 'newebpay' | 'promo' | ...
  started_at timestamptz not null default now(),
  ends_at    timestamptz,   -- null = ไม่มีวันหมด
  note       text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_upg_user on public.user_plan_grants(user_id, status);
-- 1 คนถือ plan เดียวกันซ้อนกันแบบ active ได้แค่ 1 แถว (กันแถวซ้ำจากการกดจ่ายซ้ำ)
create unique index if not exists uq_upg_user_plan_active
  on public.user_plan_grants(user_id, plan_code)
  where status in ('active','trialing');


-- ════════════════════════════════════════════════════════════════════════════
-- [J] RLS — ปิดสนิทเป็นค่าเริ่มต้น (fail-closed) เปิดเฉพาะที่จำเป็นจริง
-- ────────────────────────────────────────────────────────────────────────────
-- ⚠️ ตามกฎ repo (2026-07-15): ตั้งด่านให้ตารางไหน ต้องคิดครบ 4 คำสั่งพร้อมกัน
--    (SELECT + INSERT + UPDATE + DELETE) — ข้างล่างนี้เขียนกำกับไว้ครบทุกตาราง
--    ว่าคำสั่งไหน "ตั้งใจไม่มีด่าน" เพราะอะไร ไม่ใช่ลืม
--
-- แบบที่ 1 — ปิดสนิท (เปิด RLS + ไม่มี policy สักตัว + revoke): ตารางเนื้อหา/lookup/หลักฐานดิบ
--   อ่าน/เขียนได้เฉพาะ service_role (Edge Function) ซึ่งข้าม RLS โดยธรรมชาติ
--   เหตุผล: เนื้อหาเกมเป็นของที่ต้องล็อกฝั่งเซิร์ฟเวอร์อยู่แล้ว (ดูหัวข้อ 🔒 ใน CLAUDE.md)
--   ถ้าเปิดให้ client อ่าน learning_items ตรงๆ = ย้อนกลับไปเป็นช่องโหว่เดิมที่แก้ไปแล้ว 2026-08-02
--
-- แบบที่ 2 — นักเรียนเห็น/แก้ของตัวเองได้: มีแค่ 3 ตาราง (ดูข้างล่าง)
-- ════════════════════════════════════════════════════════════════════════════

-- ── J1) ปิดสนิททั้งหมด ────────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array[
    'learning_item_types','learning_item_statuses','learning_tag_axes','learning_tags',
    'learning_relation_types','practice_surfaces','practice_types','learning_skills',
    'learning_memory_states','learning_items','learning_item_key_history','learning_item_audit',
    'learning_item_tags','learning_item_relations','learning_item_surfaces','practice_events',
    'billing_plans','plan_prices','entitlement_keys','plan_entitlements'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    -- กันไว้อีกชั้น (defense in depth) เผื่อวันหลังมีคน grant ให้ client โดยไม่ทันคิด
    execute format('revoke all on table public.%I from anon, authenticated', t);
  end loop;
end $$;
-- ✅ ทั้ง 20 ตารางข้างบน: **ไม่มี policy ทั้ง SELECT/INSERT/UPDATE/DELETE โดยตั้งใจ**
--    (client แตะไม่ได้เลยแม้แต่อ่าน · เขียน/อ่านผ่าน Edge Function service_role เท่านั้น)
--    แบบเดียวกับ game_words / game_sentences ที่ Lin ยืนยันแล้วว่าตั้งใจ

-- ── J2) learning_memory — นักเรียนต้องเห็นความคืบหน้าตัวเอง แต่ห้ามแก้เอง ──
alter table public.learning_memory enable row level security;

drop policy if exists "lm select own" on public.learning_memory;
create policy "lm select own" on public.learning_memory
  for select using (auth.uid() = user_id);

-- ⚠️ INSERT / UPDATE / DELETE: **ตั้งใจไม่มีด่านให้ client เลย** (ไม่ใช่ลืม)
--    เหตุผล: สถานะความจำเป็นของมีค่า ถ้า client เขียนได้ = ปั้มสถานะ 掌握 ให้ตัวเองได้
--    บทเรียนจริงของ repo นี้: tone_sessions/reading_sessions เปิดให้ client insert แล้วโกงได้จริง
--    เขียนได้ทางเดียวคือ Edge Function (service_role ข้าม RLS อยู่แล้ว จึงไม่ต้องมี policy)
--    หมายเหตุกฎ RLS ของ repo (ลืมด่าน SELECT แล้วคำสั่งเขียนพังทั้งอัน) ไม่กระทบกรณีนี้
--    เพราะฝั่งที่เขียนคือ service_role ซึ่งข้าม RLS ทั้งหมด ไม่ต้องพึ่ง policy ใดๆ

-- ── J3) learning_saved_items — คลังคำของนักเรียนเอง จัดการเองได้ครบ 4 คำสั่ง ──
alter table public.learning_saved_items enable row level security;

drop policy if exists "lsi select own" on public.learning_saved_items;
create policy "lsi select own" on public.learning_saved_items
  for select using (auth.uid() = user_id);

drop policy if exists "lsi insert own" on public.learning_saved_items;
create policy "lsi insert own" on public.learning_saved_items
  for insert with check (auth.uid() = user_id);

drop policy if exists "lsi update own" on public.learning_saved_items;
create policy "lsi update own" on public.learning_saved_items
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "lsi delete own" on public.learning_saved_items;
create policy "lsi delete own" on public.learning_saved_items
  for delete using (auth.uid() = user_id);
-- ✅ ครบทั้ง 4 คำสั่ง — จำเป็นเพราะนักเรียนต้องเซฟ/ลบคำเองได้ (ปุ่ม 🔖 ในเกม)
--    และตามข้อ 21 ต้องลบ Personal Content ของตัวเองได้โดยไม่ต้องลบบัญชี

-- ── J4) user_plan_grants — นักเรียนดูได้ว่าตัวเองอยู่แพ็กเกจอะไร แต่ห้ามแก้ ──
alter table public.user_plan_grants enable row level security;

drop policy if exists "upg select own" on public.user_plan_grants;
create policy "upg select own" on public.user_plan_grants
  for select using (auth.uid() = user_id);
-- ⚠️ INSERT / UPDATE / DELETE: **ตั้งใจไม่มีด่านให้ client** — ถ้าเปิดให้เขียน = ยัดสิทธิ์
--    แพ็กเกจจ่ายเงินให้ตัวเองฟรีได้ · ต้องเขียนผ่านฝั่งเซิร์ฟเวอร์หลังยืนยันการจ่ายเงินเท่านั้น
revoke all on table public.user_plan_grants from anon;
grant select on table public.user_plan_grants to authenticated;
revoke insert, update, delete on table public.user_plan_grants from authenticated;

-- learning_memory / learning_saved_items ใช้สิทธิ์ตารางตามค่าเริ่มต้นของ Supabase + RLS ข้างบน
revoke all on table public.learning_memory from anon;
grant select on table public.learning_memory to authenticated;
revoke insert, update, delete on table public.learning_memory from authenticated;

revoke all on table public.learning_saved_items from anon;
grant select, insert, update, delete on table public.learning_saved_items to authenticated;


-- ════════════════════════════════════════════════════════════════════════════
-- [K] เติม "ตัวตน" ให้เนื้อหาที่มีอยู่แล้ววันนี้ (ไม่ก๊อปเนื้อหา แค่ออกเลขตัวตน)
-- ────────────────────────────────────────────────────────────────────────────
-- ทำอะไร: อ่าน game_words / game_sentences ที่มีอยู่ แล้วออกแถวตัวตนใน learning_items ให้
--   คำ     → item_type='word'     · difficulty = ระดับเดิม (初/中) · content_key = 'คำ@ระดับ'
--   ประโยค → item_type='sentence' · difficulty = '高'              · content_key = ประโยคเต็ม
--
-- ⚠️ ทำไม difficulty ของประโยคเป็น '高' ได้โดยไม่ถือว่าเดา: ทั้งระบบเรียกประโยคชุดนี้ว่า
--    "ประโยค 高級" อยู่แล้ว (CLAUDE.md หัวข้อฐานข้อมูลเกมกลาง + เพดาน sentences ใน
--    game-content/index.ts) และตาราง game_sentences ไม่มีช่องระดับแยกเลยแม้แต่ช่องเดียว
--
-- ⚠️ ทำไม status = 'active' ได้โดยไม่ถือว่าเดา: เนื้อหาชุดนี้ถูกส่งเข้าเกมจริงอยู่แล้ววันนี้
--    ผ่าน Edge Function game-content (= ขึ้นเว็บแล้วจริง ไม่ใช่ของรออนุมัติ)
--
-- ปลอดภัย: on conflict do nothing → รันซ้ำไม่สร้างซ้ำ · ไม่แตะ game_words/game_sentences เลย
-- ════════════════════════════════════════════════════════════════════════════

insert into public.learning_items (item_type, status, difficulty, content_source, content_key)
select 'word', 'active', w.level, 'game_words', w.word || '@' || w.level
from public.game_words w
on conflict do nothing;

insert into public.learning_items (item_type, status, difficulty, content_source, content_key)
select 'sentence', 'active', '高', 'game_sentences', s.th
from public.game_sentences s
on conflict do nothing;

-- จดบันทึกว่าแถวตัวตนพวกนี้เกิดจากไฟล์นี้ (ไม่ใช่คนพิมพ์มือ) — ตามข้อ 23 (audit ย้อนหลังได้)
insert into public.learning_item_audit (item_id, action, actor, detail)
select i.item_id, 'created', 'sql:2026-08-11_learning_foundation.sql',
       jsonb_build_object('content_source', i.content_source, 'content_key', i.content_key)
from public.learning_items i
where not exists (
  select 1 from public.learning_item_audit a
  where a.item_id = i.item_id and a.action = 'created'
);


-- ════════════════════════════════════════════════════════════════════════════
-- [L] จดว่าไฟล์นี้ถูกรันแล้ว (ระบบติดตาม migration จาก P2-05)
-- ════════════════════════════════════════════════════════════════════════════
-- ⚠️ แถวนี้บอกแค่ว่า "ไฟล์นี้ถูกรันแล้ว" — **ยังไม่ใช่คำยืนยันว่าถูกต้อง**
--    ต้องรันหัวข้อ [M] ให้ผ่านครบ 4 ข้อก่อน แล้วค่อยกลับมาอัปเดต verified_method ด้วยมือเป็น
--    'ผ่านหัวข้อ [M] ครบ 4 ข้อ' — ห้ามถือว่าสำเร็จก่อนตรวจ (กฎ RELIABILITY FIRST)
insert into private.sql_run_log (file_name, file_date, verified_active_at, verified_method, note)
values ('sql/2026-08-11_learning_foundation.sql', '2026-08-11', current_date,
        'รันไฟล์แล้ว — ยังไม่ได้ตรวจหัวข้อ [M]',
        'ต้นฉบับตารางโครงระบบเรียนกลาง 23 ตาราง (Learning Item / Practice Event / Learning Memory / Saved Items / Plan-Price-Entitlement)')
on conflict (file_name) do update
  set verified_active_at = excluded.verified_active_at,
      verified_method    = excluded.verified_method,
      note               = excluded.note;


-- ════════════════════════════════════════════════════════════════════════════
-- [M] ตรวจด้วยตัวเองว่าได้จริง — วางรันต่อได้เลยหลังรันไฟล์นี้จบ
-- ────────────────────────────────────────────────────────────────────────────
-- ต้องได้ครบ 4 ข้อนี้ ถ้าข้อไหนไม่ตรง ห้ามถือว่าสำเร็จ:
--
--   1) ตารางใหม่ครบ 23 ตาราง
--      select count(*) as ตารางใหม่ from information_schema.tables
--      where table_schema='public' and table_name in (
--        'learning_item_types','learning_item_statuses','learning_tag_axes','learning_tags',
--        'learning_relation_types','practice_surfaces','practice_types','learning_skills',
--        'learning_memory_states','learning_items','learning_item_key_history','learning_item_audit',
--        'learning_item_tags','learning_item_relations','learning_item_surfaces','practice_events',
--        'learning_memory','learning_saved_items','billing_plans','plan_prices',
--        'entitlement_keys','plan_entitlements','user_plan_grants');
--      → ต้องได้ 23
--
--   2) ตัวตนถูกออกเลขให้เนื้อหาเดิมครบ (ตัวเลขต้องเท่ากับจำนวนคำ/ประโยคที่มีจริง)
--      select item_type, count(*) from public.learning_items group by item_type order by item_type;
--      → ควรได้ word = จำนวนแถวใน game_words · sentence = จำนวนแถวใน game_sentences
--      select (select count(*) from public.game_words)     as คำในคลัง,
--             (select count(*) from public.game_sentences) as ประโยคในคลัง;
--
--   3) ตารางที่ตั้งใจให้ "ว่าง" ต้องว่างจริง (พิสูจน์ว่าไม่มีใครเดา taxonomy/สูตรลงไป)
--      select 'learning_tags' as ตาราง, count(*) from public.learning_tags
--      union all select 'learning_skills',        count(*) from public.learning_skills
--      union all select 'learning_item_surfaces', count(*) from public.learning_item_surfaces
--      union all select 'learning_memory',        count(*) from public.learning_memory
--      union all select 'practice_events',        count(*) from public.practice_events
--      union all select 'plan_prices',            count(*) from public.plan_prices
--      union all select 'entitlement_keys',       count(*) from public.entitlement_keys;
--      → ต้องได้ 0 ทุกแถว
--
--   4) ด่าน RLS ปิดสนิทจริง — คนไม่ล็อกอินต้องอ่าน learning_items ไม่ได้เลย
--      set role anon;  select count(*) from public.learning_items;  reset role;
--      → ต้องขึ้น "permission denied" · ถ้าเห็นตัวเลขออกมา = ยังไม่ล็อก ห้ามใช้งานต่อ
--
--      และตารางที่นักเรียนต้องอ่านของตัวเองได้ ต้องมีด่านครบตามที่ตั้งใจ:
--      select tablename, cmd, policyname from pg_policies
--      where schemaname='public' and tablename in
--        ('learning_memory','learning_saved_items','user_plan_grants')
--      order by tablename, cmd;
--      → learning_saved_items ต้องได้ 4 แถว (SELECT/INSERT/UPDATE/DELETE)
--        learning_memory ได้ 1 แถว (SELECT) · user_plan_grants ได้ 1 แถว (SELECT) — ตั้งใจ
-- ════════════════════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════════════════════════
-- [Z] คำสั่งย้อนกลับ (rollback) — comment ปิดไว้ตามกฎ repo ข้อ 6 (2026-08-08)
-- ────────────────────────────────────────────────────────────────────────────
-- 🔴 ใช้เฉพาะกรณีต้องถอนโครงนี้ออกทั้งชุด **ก่อน** ที่จะมีข้อมูลจริงของนักเรียนอยู่ในนั้น
--    ถ้ามีข้อมูลนักเรียนแล้ว (learning_memory / learning_saved_items / practice_events ไม่ว่าง)
--    ⚠️ ต้องกด Run workflow `backup-database-to-drive` ก่อนเสมอ — คำสั่งข้างล่างลบข้อมูลถาวร
--    ตรวจก่อนด้วยหัวข้อ [M] ข้อ 3 ว่ายังว่างจริง
--
-- ลำดับการลบต้องเป็นแบบนี้ (ลูกก่อนพ่อ) ไม่งั้นติด foreign key:
--
-- drop table if exists public.plan_entitlements;
-- drop table if exists public.user_plan_grants;
-- drop table if exists public.plan_prices;
-- drop table if exists public.entitlement_keys;
-- drop table if exists public.billing_plans;
-- drop table if exists public.learning_saved_items;
-- drop table if exists public.learning_memory;
-- drop table if exists public.practice_events;
-- drop table if exists public.learning_item_surfaces;
-- drop table if exists public.learning_item_relations;
-- drop table if exists public.learning_item_tags;
-- drop table if exists public.learning_item_audit;
-- drop table if exists public.learning_item_key_history;
-- drop table if exists public.learning_items;
-- drop table if exists public.learning_memory_states;
-- drop table if exists public.learning_skills;
-- drop table if exists public.practice_types;
-- drop table if exists public.practice_surfaces;
-- drop table if exists public.learning_relation_types;
-- drop table if exists public.learning_tags;
-- drop table if exists public.learning_tag_axes;
-- drop table if exists public.learning_item_statuses;
-- drop table if exists public.learning_item_types;
-- delete from private.sql_run_log where file_name = 'sql/2026-08-11_learning_foundation.sql';
-- ════════════════════════════════════════════════════════════════════════════
