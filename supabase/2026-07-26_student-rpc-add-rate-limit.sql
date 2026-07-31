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
-- 🔎 ฟังก์ชันที่เหลืออยู่ในไฟล์นี้ (8 ตัว) = ต้นฉบับล่าสุดของทั้ง 8 ตัวอยู่ที่ไฟล์นี้:
--    get_student_by_token / get_student_folder / get_student_attendance /
--    get_student_payments / get_student_recordings / get_student_schedule /
--    student_get_own_requests / student_update_own_request
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


CREATE OR REPLACE FUNCTION public.student_update_own_request(p_token text, p_id uuid, p_patch jsonb, p_require_status text DEFAULT NULL::text, p_require_offer_status text DEFAULT NULL::text, p_require_not_processing boolean DEFAULT false, p_require_null_column text DEFAULT NULL::text)
 RETURNS SETOF classroom_requests
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_allowed constant text[] := array[
    'calendar_event_id', 'original_time', 'original_date',
    'requested_date', 'requested_time', 'proposed_options',
    'offer_created_at', 'offer_accepted_at', 'sla_reminder_sent',
    'teacher_cancel_ack_at', 'teacher_add_ack_at',
    'status', 'offer_status'
  ];
  v_bad text[];
begin
  -- ── ยามเฝ้าประตู (Lin 2026-07-26) ── ยิงเกิน 20 ครั้ง/60 วิ ต่อ IP = บล็อก (กันไล่เดา token)
  if not public.slink_rl_check('student_update_own_request', 20, 60) then
    raise exception 'too many requests' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.classroom_students where token = p_token) then
    perform public.slink_log_fail('student_update_own_request', p_token);
  end if;

  if p_token is null or p_token = '' or p_id is null then
    raise exception 'token and id are required';
  end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception 'patch must be a json object';
  end if;

  select array_agg(k) into v_bad
  from jsonb_object_keys(p_patch) as k
  where k <> all (v_allowed);
  if v_bad is not null then
    raise exception 'column(s) not allowed for student update: %', array_to_string(v_bad, ', ');
  end if;

  if p_patch ? 'status' and coalesce(p_patch ->> 'status', '') <> 'acknowledged' then
    raise exception 'student may only set status to acknowledged';
  end if;
  if p_patch ? 'offer_status' and coalesce(p_patch ->> 'offer_status', '') not in ('', 'proposed', 'declined') then
    raise exception 'student may only set offer_status to proposed, declined, or null';
  end if;
  if p_require_null_column is not null
     and p_require_null_column not in ('teacher_cancel_ack_at', 'teacher_add_ack_at') then
    raise exception 'invalid require_null_column';
  end if;

  return query
  update public.classroom_requests c set
    calendar_event_id     = case when p_patch ? 'calendar_event_id'     then nullif(p_patch ->> 'calendar_event_id', '')          else c.calendar_event_id     end,
    original_time         = case when p_patch ? 'original_time'         then nullif(p_patch ->> 'original_time', '')              else c.original_time         end,
    original_date         = case when p_patch ? 'original_date'         then (nullif(p_patch ->> 'original_date', ''))::date      else c.original_date         end,
    requested_date        = case when p_patch ? 'requested_date'        then (nullif(p_patch ->> 'requested_date', ''))::date     else c.requested_date        end,
    requested_time        = case when p_patch ? 'requested_time'        then nullif(p_patch ->> 'requested_time', '')             else c.requested_time        end,
    proposed_options      = case when p_patch ? 'proposed_options'      then p_patch -> 'proposed_options'                        else c.proposed_options      end,
    offer_created_at      = case when p_patch ? 'offer_created_at'      then (nullif(p_patch ->> 'offer_created_at', ''))::timestamptz      else c.offer_created_at      end,
    offer_accepted_at     = case when p_patch ? 'offer_accepted_at'     then (nullif(p_patch ->> 'offer_accepted_at', ''))::timestamptz     else c.offer_accepted_at     end,
    sla_reminder_sent     = case when p_patch ? 'sla_reminder_sent'     then (nullif(p_patch ->> 'sla_reminder_sent', ''))::boolean         else c.sla_reminder_sent     end,
    teacher_cancel_ack_at = case when p_patch ? 'teacher_cancel_ack_at' then (nullif(p_patch ->> 'teacher_cancel_ack_at', ''))::timestamptz else c.teacher_cancel_ack_at end,
    teacher_add_ack_at    = case when p_patch ? 'teacher_add_ack_at'    then (nullif(p_patch ->> 'teacher_add_ack_at', ''))::timestamptz    else c.teacher_add_ack_at    end,
    status                = case when p_patch ? 'status'                then p_patch ->> 'status'                                 else c.status                end,
    offer_status          = case when p_patch ? 'offer_status'          then nullif(p_patch ->> 'offer_status', '')               else c.offer_status          end
  where c.id = p_id
    and c.token = p_token
    and (p_require_status       is null or c.status       = p_require_status)
    and (p_require_offer_status is null or c.offer_status = p_require_offer_status)
    and (not p_require_not_processing or c.processing_started_at is null)
    and (p_require_null_column is null
         or (p_require_null_column = 'teacher_cancel_ack_at' and c.teacher_cancel_ack_at is null)
         or (p_require_null_column = 'teacher_add_ack_at'    and c.teacher_add_ack_at    is null))
  returning c.*;
end;
$function$;
