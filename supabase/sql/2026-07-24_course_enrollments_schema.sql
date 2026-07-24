-- ════════════════════════════════════════════════════════════
-- ระบบติดตามนักเรียนคอร์ส (course_enrollments) — แยกจากเกม 100%
-- ใช้ login เดียวกับเกม (auth.users / game_accounts) แค่ยืมระบบล็อกอิน
-- ไม่แชร์ตาราง ไม่แชร์ entitlement กับเกมเด็ดขาด (ตามที่ Lin สั่ง 2026-07-24)
-- รันไฟล์นี้ใน Supabase Dashboard → SQL Editor (รันครั้งเดียว)
-- สร้าง 2026-07-24
--
-- ⚠️ ยังไม่ตัดสินใจเรื่องราคา/สกุลเงิน/รอบบิล (บาทไทย หรือ NT$? ราคา 30 คนแรก
-- ล็อกถาวรหรือชั่วคราว?) ตารางนี้แค่มีที่เก็บค่าไว้ ใส่ค่าจริงตอนเปิดขาย
--
-- ⚠️ progress เก็บเป็น jsonb ว่างๆ ไปก่อน เพราะเนื้อหาคอร์ส (หนังสือเรียน+
-- เกมเลโก้) ยังไม่ได้ออกแบบจริง (รอผลเพดาน 200 คำจากแชทเกมก่อนตามแผนเดิม)
-- ยังไม่กำหนดฟิลด์ความคืบหน้าละเอียดตอนนี้ กันต้องรื้อทำใหม่ทีหลัง
-- ════════════════════════════════════════════════════════════

create table if not exists course_enrollments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id), -- คนเดียวกับที่ล็อกอินเล่นเกม (game_accounts) แต่แถวนี้คนละเรื่องกับเกม
  cohort_label text not null default 'รุ่น 1', -- เผื่อมีรุ่น 2, 3 ในอนาคต

  -- สถานะจ่ายเงิน (รูปแบบเดียวกับ classroom_payments เดิม)
  status text not null default 'pending'
    check (status in ('pending','slip_submitted','done','rejected','cancelled')),
  price_per numeric not null check (price_per >= 0),
  currency text not null default 'NTD' check (currency in ('NTD','THB')), -- ⚠️ ยังไม่ยืนยันกับ Lin ว่าราคาเป็นสกุลไหน
  billing_cycle text not null default 'monthly' check (billing_cycle in ('monthly','one_time')),
  is_founding_price boolean not null default true, -- true = ราคารุ่นบุกเบิก 30 คนแรก (ล็อกถาวรหรือชั่วคราว รอ Lin ยืนยัน)

  slip_url text,
  submitted_at timestamptz,
  approved_at timestamptz,
  next_due_date date, -- รอบบิลถัดไป (ถ้า billing_cycle = 'monthly')
  active_until date,  -- เข้าถึงเนื้อหาได้ถึงวันไหน

  admin_note text,
  progress jsonb not null default '{}'::jsonb, -- placeholder รอออกแบบเนื้อหาคอร์สจริงก่อน
  last_active_at timestamptz,

  created_at timestamptz not null default now()
);

create index if not exists idx_ce_user on course_enrollments(user_id);
create index if not exists idx_ce_status on course_enrollments(status);

alter table course_enrollments enable row level security;

-- นักเรียนดูของตัวเองได้เท่านั้น
drop policy if exists "select own enrollment" on course_enrollments;
create policy "select own enrollment" on course_enrollments
  for select using (auth.uid() = user_id);

-- นักเรียน insert ได้เฉพาะแถวของตัวเอง และห้ามตั้งสถานะเป็น done/rejected/cancelled เอง
-- (ต้องเป็น pending หรือ slip_submitted เท่านั้น + ห้ามตั้ง approved_at มาเอง)
drop policy if exists "insert own enrollment" on course_enrollments;
create policy "insert own enrollment" on course_enrollments
  for insert with check (
    auth.uid() = user_id
    and status in ('pending','slip_submitted')
    and approved_at is null
  );

-- ครู (Lin) เห็น/แก้/ลบได้ทุกแถว — เช็คจากอีเมลที่ล็อกอินตรงๆ (explicit, ไม่พึ่งของเดิมที่ไม่มีไฟล์ระบุไว้)
drop policy if exists "teacher select all enrollments" on course_enrollments;
create policy "teacher select all enrollments" on course_enrollments
  for select using (auth.jwt() ->> 'email' = 'mr.taihualin@gmail.com');

drop policy if exists "teacher update all enrollments" on course_enrollments;
create policy "teacher update all enrollments" on course_enrollments
  for update using (auth.jwt() ->> 'email' = 'mr.taihualin@gmail.com');

drop policy if exists "teacher delete all enrollments" on course_enrollments;
create policy "teacher delete all enrollments" on course_enrollments
  for delete using (auth.jwt() ->> 'email' = 'mr.taihualin@gmail.com');

-- หมายเหตุ: นักเรียนไม่มีสิทธิ์ update/delete เลย (เหมือน game_reward_events 2026-07-13)
-- เปลี่ยนสถานะเป็น done/rejected/cancelled ได้ทาง "ครูอนุมัติ" เท่านั้น (ผ่านหน้าเว็บที่ครูล็อกอินอยู่)
-- ⚠️ ทุกจุดที่ครูฝั่งเว็บเขียน .update() ต้องต่อด้วย .select() แล้วเช็ก data.length ทุกครั้ง
-- (กันบั๊กเดิมที่เจอกับ classroom_payments — RLS บล็อกเงียบๆ แล้วขึ้น "สำเร็จ" หลอก)
