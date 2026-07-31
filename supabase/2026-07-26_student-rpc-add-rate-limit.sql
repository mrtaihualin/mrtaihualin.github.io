-- ✅ ไฟล์นี้รันซ้ำได้ทั้งไฟล์ตามปกติ (ยืนยันใหม่ 2026-07-31)
-- ────────────────────────────────────────────────────────────
-- 📦 มีอะไรเปลี่ยนไปเมื่อ 2026-07-31 (Lin สั่ง):
--    เดิมไฟล์นี้มีฟังก์ชัน 10 ตัว — 8 ตัวใช้งานจริงอยู่ แต่มีอีก 2 ก้อนท้ายไฟล์
--    (submit_class_request แบบ 7 ช่องรับค่า และ 8 ช่องรับค่า) ที่ถูกลบทิ้งจากฐานข้อมูล
--    ไปแล้วเมื่อ 2026-07-30 — ถ้าเผลอรันซ้ำจะทำให้ฟังก์ชันซ้อนกันจนเว็บส่งคำขอไม่ได้เลย
--    ทั้งระบบ (เหตุการณ์จริง 2026-07-30) และทำให้ด่าน 24 ชม.หายไปเงียบๆ
--
--    → ยก 2 ก้อนนั้นออกไปเก็บไว้ที่:
--      supabase/sql/เลิกใช้แล้ว_ห้ามรัน/2026-07-26_submit_class_request_เวอร์ชันเก่า_7และ8ช่อง.sql
--    → ไฟล์นี้จึงเหลือแต่ของที่ยังใช้จริง กด Run ทั้งไฟล์ได้ตามปกติเหมือนเดิม
--
--    → ยก student_update_own_request ออกไปอีกตัวเมื่อ 2026-07-31 (หลังทำงาน C1) เพราะถูกแก้ต่อแล้ว
--      ตัวล่าสุดอยู่ที่ supabase/sql/2026-07-31_cancel_24h_guard_on_update.sql
--      ตัวเก่าเก็บไว้ที่ sql/เลิกใช้แล้ว_ห้ามรัน/2026-07-26_student_update_own_request_เวอร์ชันก่อน-C1.sql
--
-- 🔎 ฟังก์ชันที่เหลืออยู่ในไฟล์นี้ (7 ตัว) = ต้นฉบับล่าสุดของทั้ง 7 ตัวอยู่ที่ไฟล์นี้:
--    get_student_by_token / get_student_folder / get_student_attendance /
--    get_student_payments / get_student_recordings / get_student_schedule /
--    student_get_own_requests
--    ⚠️ ถ้าวันหลังมีการแก้ตัวไหนในไฟล์อื่น ต้องมาอัปเดตสารบัญด้วยเสมอ:
--       supabase/sql/00_ฟังก์ชันไหนอยู่ไฟล์ไหน.md
-- ════════════════════════════════════════════════════════════
-- ไฟล์ที่ 2 — ติดยามเฝ้าประตูเข้ากับฟังก์ชันที่รับ token ทั้งหมด — Lin 2026-07-26
-- ⚠️ ต้องรัน "ไฟล์ที่ 1" (2026-07-26_student-link-rate-limit.sql) ก่อน ไม่งั้นจะ error หาฟังก์ชันไม่เจอ
--
-- โค้ดเดิมของทุกฟังก์ชันคัดลอกมาจากฐานข้อมูลจริง (2026-07-26) ไม่ได้แก้ตรรกะเดิมแม้แต่บรรทัดเดียว
-- เพิ่มแค่ 2 อย่างไว้บนสุดของแต่ละตัว:
--   1) เช็กว่า IP นี้ยิงเกิน 20 ครั้ง/นาที ไหม → เกินก็โยนทิ้ง
--   2) ถ้า token ไม่มีอยู่จริง → จดล็อกไว้ (ไว้ดูว่ามีคนไล่เดาไหม)
--
-- หมายเหตุ: ฟังก์ชันกลุ่ม get_student_* เดิมเป็นแบบ sql ล้วน (ใส่เงื่อนไขไม่ได้)
--           จึงเปลี่ยนเป็น plpgsql — คำสั่ง select ข้างในเหมือนเดิมเป๊ะ ผลลัพธ์ที่คืนเหมือนเดิมทุกอย่าง
--
-- ปลอดภัยที่จะรันซ้ำ (create or replace ทั้งหมด)
-- ℹ️ หมายเหตุ 2026-07-31: ข้อความบรรทัดบนนี้เคย "ไม่จริง" อยู่ช่วงหนึ่ง (2026-07-30 ถึง 2026-07-31)
--    เพราะมี submit_class_request 2 เวอร์ชันเก่าปนอยู่ท้ายไฟล์ · ตอนนี้ยกออกไปแล้ว กลับมาจริงตามเดิม
-- ════════════════════════════════════════════════════════════


create or replace function public.get_student_by_token(p_token text)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare v jsonb;
begin
  -- ── ยามเฝ้าประตู (Lin 2026-07-26) ── ยิงเกิน 20 ครั้ง/60 วิ ต่อ IP = บล็อก (กันไล่เดา token)
  if not public.slink_rl_check('get_student_by_token', 20, 60) then
    raise exception 'too many requests' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.classroom_students where token = p_token) then
    perform public.slink_log_fail('get_student_by_token', p_token);
  end if;

  select to_jsonb(t) - 'lesson_progress' into v
  from public.classroom_students t
  where t.token = p_token
  limit 1;
  return v;
end; $function$;


create or replace function public.get_student_folder(p_token text)
returns text language plpgsql security definer set search_path to 'public' as $function$
declare v text;
begin
  -- ── ยามเฝ้าประตู (Lin 2026-07-26) ── ยิงเกิน 20 ครั้ง/60 วิ ต่อ IP = บล็อก (กันไล่เดา token)
  if not public.slink_rl_check('get_student_folder', 20, 60) then
    raise exception 'too many requests' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.classroom_students where token = p_token) then
    perform public.slink_log_fail('get_student_folder', p_token);
  end if;

  select folder_url into v from classroom_students where token = p_token;
  return v;
end; $function$;


create or replace function public.get_student_attendance(p_token text)
returns setof classroom_attendance language plpgsql security definer set search_path to 'public' as $function$
begin
  -- ── ยามเฝ้าประตู (Lin 2026-07-26) ── ยิงเกิน 20 ครั้ง/60 วิ ต่อ IP = บล็อก (กันไล่เดา token)
  if not public.slink_rl_check('get_student_attendance', 20, 60) then
    raise exception 'too many requests' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.classroom_students where token = p_token) then
    perform public.slink_log_fail('get_student_attendance', p_token);
  end if;

  return query select * from classroom_attendance where token = p_token order by lesson_date asc;
end; $function$;


create or replace function public.get_student_payments(p_token text)
returns setof classroom_payments language plpgsql security definer set search_path to 'public' as $function$
begin
  -- ── ยามเฝ้าประตู (Lin 2026-07-26) ── ยิงเกิน 20 ครั้ง/60 วิ ต่อ IP = บล็อก (กันไล่เดา token)
  if not public.slink_rl_check('get_student_payments', 20, 60) then
    raise exception 'too many requests' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.classroom_students where token = p_token) then
    perform public.slink_log_fail('get_student_payments', p_token);
  end if;

  return query select * from classroom_payments where token = p_token order by created_at desc;
end; $function$;


create or replace function public.get_student_recordings(p_token text)
returns setof classroom_recordings language plpgsql security definer set search_path to 'public' as $function$
begin
  -- ── ยามเฝ้าประตู (Lin 2026-07-26) ── ยิงเกิน 20 ครั้ง/60 วิ ต่อ IP = บล็อก (กันไล่เดา token)
  if not public.slink_rl_check('get_student_recordings', 20, 60) then
    raise exception 'too many requests' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.classroom_students where token = p_token) then
    perform public.slink_log_fail('get_student_recordings', p_token);
  end if;

  return query select * from public.classroom_recordings where token = p_token order by created_at desc;
end; $function$;


create or replace function public.get_student_schedule(p_token text)
returns table(lesson_date date, start_time text, end_time text, calendar_event_id text)
language plpgsql security definer set search_path to 'public' as $function$
begin
  -- ── ยามเฝ้าประตู (Lin 2026-07-26) ── ยิงเกิน 20 ครั้ง/60 วิ ต่อ IP = บล็อก (กันไล่เดา token)
  if not public.slink_rl_check('get_student_schedule', 20, 60) then
    raise exception 'too many requests' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.classroom_students where token = p_token) then
    perform public.slink_log_fail('get_student_schedule', p_token);
  end if;

  return query
    select s.lesson_date, s.start_time, s.end_time, s.calendar_event_id
    from public.classroom_schedule s
    where s.token = p_token
      and s.lesson_date >= (now() AT TIME ZONE 'Asia/Bangkok')::date
    order by s.lesson_date asc, s.start_time asc;
end; $function$;


-- เดิมเป็น sql + STABLE — ยามต้องเขียนตารางนับ จึงเป็น STABLE ไม่ได้ (ตัด STABLE ออก)
create or replace function public.student_get_own_requests(
  p_token text, p_request_type text default null, p_status text default null,
  p_initiated_by text default null, p_limit integer default 10)
returns setof classroom_requests language plpgsql security definer set search_path to 'public' as $function$
begin
  -- ── ยามเฝ้าประตู (Lin 2026-07-26) ── ยิงเกิน 20 ครั้ง/60 วิ ต่อ IP = บล็อก (กันไล่เดา token)
  if not public.slink_rl_check('student_get_own_requests', 20, 60) then
    raise exception 'too many requests' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.classroom_students where token = p_token) then
    perform public.slink_log_fail('student_get_own_requests', p_token);
  end if;

  return query
    select * from public.classroom_requests
    where token = p_token
      and (p_request_type is null or request_type = p_request_type)
      and (p_status       is null or status       = p_status)
      and (p_initiated_by is null or initiated_by = p_initiated_by)
    order by created_at desc
    limit greatest(1, least(coalesce(p_limit, 10), 50));
end; $function$;
