-- 🛑🛑🛑 ห้ามรัน "ทั้งไฟล์" นี้อีกแล้ว — เพิ่มคำเตือน 2026-07-31 🛑🛑🛑
-- ────────────────────────────────────────────────────────────
-- อ่านตรงนี้ก่อนทุกครั้ง (สำคัญมาก):
--
--   ✅ บรรทัด 17-227  = ยังใช้ได้ปกติ เป็นของจริงที่ระบบใช้อยู่ตอนนี้
--                       (get_student_* 6 ตัว + student_get_own_requests + student_update_own_request)
--                       รันซ้ำได้ ไม่มีปัญหา
--
--   🛑 บรรทัด 228 เป็นต้นไป = ห้ามรันเด็ดขาด (submit_class_request 2 ตัว)
--       เพราะ: ของจริงที่ใช้อยู่ตอนนี้เป็นตัว 9 ช่องรับค่า อยู่ในไฟล์
--              supabase/sql/2026-07-30_submit_class_request_consolidated.sql
--       ถ้ารัน 2 ก้อนนี้ซ้ำจะเกิด 2 อย่างพร้อมกัน:
--         (1) ได้ฟังก์ชันซ้อนกัน 3 ตัว → เว็บส่งคำขออะไรไม่ได้เลยสักอย่าง
--             (ยกเลิก/ขอเลื่อน/ขอเพิ่มคาบ พังหมด) = เหตุการณ์เดียวกับที่เกิดจริง 2026-07-30
--         (2) 2 ก้อนนี้ไม่มีด่าน "นักเรียนยกเลิกได้เฉพาะเหลือ 24 ชม.ขึ้นไป"
--             → ด่านนั้นหายไปเงียบๆ โดยไม่มีใครรู้
--
--   👉 วิธีที่ปลอดภัย: ถ้าจะรันไฟล์นี้ ให้ลากเลือกเฉพาะบรรทัด 17-227 แล้วกด Run
--      ห้ามกด Run ทั้งไฟล์รวดเดียว
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
-- ⚠️ แก้ข้อความนี้ 2026-07-31: เดิมเขียนว่า "ปลอดภัยที่จะรันซ้ำ (create or replace ทั้งหมด)"
--    ตอนนี้ไม่จริงแล้ว → ปลอดภัยเฉพาะบรรทัด 17-227 เท่านั้น · บรรทัด 228 เป็นต้นไป ห้ามรัน
--    (เหตุผลเต็มอยู่ในกรอบ 🛑 บนสุดของไฟล์)
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


-- 🛑 หยุดตรงนี้ — ตั้งแต่บรรทัดนี้ลงไป "ห้ามรัน" (เพิ่มคำเตือน 2026-07-31)
--    ก้อนนี้ = submit_class_request ตัว 7 ช่องรับค่า · ถูกลบทิ้งจากฐานข้อมูลจริงไปแล้ว
--    ของจริงอยู่ที่ supabase/sql/2026-07-30_submit_class_request_consolidated.sql (ตัว 9 ช่อง)
--    รันก้อนนี้ = ฟังก์ชันซ้อนกัน + ด่าน 24 ชม.หายไปเงียบๆ (อ่านกรอบ 🛑 บนสุดของไฟล์)
CREATE OR REPLACE FUNCTION public.submit_class_request(p_token text, p_student_name text, p_request_type text, p_original_date date, p_requested_date date, p_requested_time text, p_note text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  new_id uuid;
begin
  -- ── ยามเฝ้าประตู (Lin 2026-07-26) ── ยิงเกิน 20 ครั้ง/60 วิ ต่อ IP = บล็อก (กันไล่เดา token)
  if not public.slink_rl_check('submit_class_request', 20, 60) then
    raise exception 'too many requests' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.classroom_students where token = p_token) then
    perform public.slink_log_fail('submit_class_request', p_token);
  end if;

  if p_request_type not in ('cancel', 'reschedule', 'add_class') then
    raise exception 'invalid request_type';
  end if;
  insert into public.classroom_requests
    (token, student_name, request_type, original_date, requested_date, requested_time, note)
  values
    (p_token, p_student_name, p_request_type, p_original_date, p_requested_date, p_requested_time, p_note)
  returning id into new_id;
  return new_id;
end;
$function$;


-- 🛑 ก้อนนี้ก็ "ห้ามรัน" เหมือนกัน (เพิ่มคำเตือน 2026-07-31)
--    = submit_class_request ตัว 8 ช่องรับค่า · ถูกลบทิ้งจากฐานข้อมูลจริงไปแล้วเช่นกัน
--    และก้อนนี้ยังขาดด่าน "ห้ามนักเรียนอ้างว่าเป็นครู" กับด่าน 24 ชม. ทั้งคู่
CREATE OR REPLACE FUNCTION public.submit_class_request(p_token text, p_student_name text, p_request_type text, p_original_date date, p_requested_date date, p_requested_time text, p_note text, p_initiated_by text DEFAULT 'student'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  new_id uuid;
begin
  -- ── ยามเฝ้าประตู (Lin 2026-07-26) ── ยิงเกิน 20 ครั้ง/60 วิ ต่อ IP = บล็อก (กันไล่เดา token)
  if not public.slink_rl_check('submit_class_request', 20, 60) then
    raise exception 'too many requests' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.classroom_students where token = p_token) then
    perform public.slink_log_fail('submit_class_request', p_token);
  end if;

  -- 2026-07-19 เพิ่ม 'add_class' (เดิมมีแค่ cancel/reschedule → ปุ่ม 加課堂時間 พังมาตลอด)
  if p_request_type not in ('cancel', 'reschedule', 'add_class') then
    raise exception 'invalid request_type';
  end if;
  if p_initiated_by not in ('student', 'teacher') then
    raise exception 'invalid initiated_by';
  end if;
  insert into public.classroom_requests
    (token, student_name, request_type, original_date, requested_date, requested_time, note, initiated_by)
  values
    (p_token, p_student_name, p_request_type, p_original_date, p_requested_date, p_requested_time, p_note, p_initiated_by)
  returning id into new_id;
  return new_id;
end;
$function$;
