-- ════════════════════════════════════════════════════════════
-- ระบบ "แต้มแจ้งปัญหา + รีวิวเกม" — แยกจากคะแนนอันดับ/ดาว 100%
-- รันไฟล์นี้ใน Supabase Dashboard → SQL Editor (รันครั้งเดียว)
-- สร้าง 2026-07-13
-- ════════════════════════════════════════════════════════════

-- 1) ตารางเก็บทุกครั้งที่แจ้งบั๊ก/ส่งรีวิว (1 แถว = 1 ครั้ง)
create table if not exists game_reward_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  game text not null check (game in ('typing','reading','lego','word_order','tone_finder')),
  type text not null check (type in ('bug_report','review')),
  content text not null check (char_length(content) >= 1 and char_length(content) <= 2000),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  points_awarded int not null default 0 check (points_awarded >= 0),
  admin_note text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  -- ใช้กันสแปมรีวิว (1 ครั้ง/เกม/วัน) — คำนวณ "วัน" ตามเวลาไต้หวัน ไม่ใช่ UTC
  event_date date generated always as ((created_at at time zone 'Asia/Taipei')::date) stored
);

create index if not exists idx_gre_user on game_reward_events(user_id);
create index if not exists idx_gre_status on game_reward_events(status, type);

-- กันสแปม: รีวิวได้แค่ 1 ครั้ง/เกม/วัน ที่ระดับฐานข้อมูลเลย (กันกรณี Edge Function เช็คพลาด/แข่งกันยิงพร้อมกัน)
create unique index if not exists uniq_daily_review
  on game_reward_events(user_id, game, event_date)
  where type = 'review';

alter table game_reward_events enable row level security;

-- นักเรียนดูของตัวเองได้ (เช็คว่าที่แจ้งไปอนุมัติหรือยัง)
drop policy if exists "select own reward events" on game_reward_events;
create policy "select own reward events" on game_reward_events
  for select using (auth.uid() = user_id);

-- นักเรียน insert ได้เฉพาะแถวของตัวเอง และต้องเป็นค่าเริ่มต้น (pending, 0 แต้ม) เท่านั้น
-- ห้าม insert โดยตั้ง status='approved' หรือ points_awarded>0 มาเองเด็ดขาด
drop policy if exists "insert own reward events" on game_reward_events;
create policy "insert own reward events" on game_reward_events
  for insert with check (
    auth.uid() = user_id
    and status = 'pending'
    and points_awarded = 0
  );

-- ไม่เปิด policy update/delete ให้ client เลย → แก้ status/points ได้เฉพาะผ่าน Edge Function (service_role) เท่านั้น


-- 2) ตารางยอดแต้มสะสมปัจจุบัน (1 คน = 1 แถว)
create table if not exists game_reward_points (
  user_id uuid primary key references auth.users(id),
  points int not null default 0 check (points >= 0 and points <= 300), -- เพดาน 300 แต้ม
  lifetime_points int not null default 0 check (lifetime_points >= 0), -- ยอดสะสมตลอดกาล (ไม่ลดแม้แลกดาวไปแล้ว) ไว้โชว์/ทำ badge ในอนาคต
  updated_at timestamptz not null default now()
);

alter table game_reward_points enable row level security;

-- นักเรียนดูยอดแต้มตัวเองได้ ห้ามแก้เองเด็ดขาด (ไม่มี insert/update policy ให้ client)
drop policy if exists "select own points" on game_reward_points;
create policy "select own points" on game_reward_points
  for select using (auth.uid() = user_id);

-- หมายเหตุ: การ "แลกดาว" (10 แต้ม = 1 ดาว) ยังไม่ได้ทำอัตโนมัติในเวอร์ชันนี้
-- เพราะการเขียน "stars" ใน game_accounts ต้องผ่าน Edge Function เดิมที่ Lin มีอยู่แล้ว (ไม่อยู่ใน repo นี้)
-- แนะนำ: ทำทีหลังเป็นขั้นที่ 2 โดยให้ Edge Function ใหม่นี้เรียก Edge Function เดิม หรือรวม logic เข้าด้วยกัน
