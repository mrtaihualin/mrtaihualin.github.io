-- ════════════════════════════════════════════════════════════════════════════
-- 2026-07-26 — ห้ามนักเรียนติดป้ายคำขอว่า "ครูเป็นคนขอ" (initiated_by)
--
-- ปัญหา: ฟังก์ชัน submit_class_request รับค่า p_initiated_by มาจากหน้าเว็บตรงๆ
--        โดยไม่ตรวจว่าคนเรียกเป็นครูจริงไหม
--        → ฝั่งนักเรียนส่ง p_initiated_by = 'teacher' มาเองได้ (แก้ค่าในเบราว์เซอร์)
--        → คำขอของนักเรียนจะโผล่ในระบบเสมือน "ครูเป็นคนเสนอ"
--        ซึ่งเดินไปคนละเส้นทาง (เช่น คำขอที่ครูเสนอ ต้องรอนักเรียนกด "我知道了" ก่อน
--        และถูกกรองออกจากบางรายการ) = หลอกระบบให้ทำงานผิดขั้นตอนได้
--
-- แก้: ตัดสินฝั่งฐานข้อมูล ไม่เชื่อค่าที่ส่งมา
--      ครูล็อกอินผ่าน Supabase Auth อยู่แล้ว → ในฟังก์ชันอ่านอีเมลจาก JWT ได้เลย
--      ถ้าอ้างว่าเป็น 'teacher' แต่อีเมลไม่ใช่ของครู → ปฏิเสธไปเลย (ไม่แอบเปลี่ยนค่าเงียบๆ
--      เพราะถ้าเงียบ ครูจะไม่รู้เลยว่า session ตัวเองหมดอายุ แล้วคำขอเดินผิดทาง)
--
-- ⚠️ ผลข้างเคียงที่ตั้งใจ: ถ้า session ครูหมดอายุ แล้วครูกดปุ่มที่สร้างคำขอแบบ 'teacher'
--    จะขึ้น error ชัดเจน แทนที่จะสร้างคำขอผิดประเภทเงียบๆ
--    (ฝั่งเว็บเพิ่มการเช็ก session ก่อนกดแล้ว ครูจะเจอข้อความ "ล็อกอินหมดอายุ" ก่อนถึงตรงนี้)
--
-- ปลอดภัยที่จะรันซ้ำ (create or replace ทั้งหมด)
-- ════════════════════════════════════════════════════════════════════════════


-- ── 0) ตัวช่วย: คนที่กำลังเรียกอยู่ตอนนี้ เป็นครูจริงไหม ──
-- อ่านอีเมลจาก JWT ของ request ปัจจุบัน · นักเรียนไม่ได้ล็อกอิน = ไม่มี claims = คืน false
create or replace function public.is_teacher_caller()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_email text;
begin
  begin
    v_email := lower(coalesce(
      nullif(current_setting('request.jwt.claims', true), '')::json ->> 'email', ''));
  exception when others then
    v_email := '';
  end;
  return v_email = 'mr.taihualin@gmail.com';
end; $$;


-- ────────────────────────────────────────────────────────────────────────────
-- 1) เวอร์ชันหลักที่เว็บเรียกใช้จริง (มี p_initiated_by)
--    ⚠️ ลอกของเดิมมาทั้งดุ้น เพิ่มแค่ "ด่านตรวจครู" อย่างเดียว ไม่แตะตรรกะอื่น
--    ยามเฝ้าประตู (slink_rl_check) เรียกแบบมีเงื่อนไข — จะได้รันไฟล์นี้ได้
--    ไม่ว่าจะเคยรัน 2026-07-26_student-rpc-add-rate-limit.sql มาก่อนหรือยัง
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.submit_class_request(
  p_token text,
  p_student_name text,
  p_request_type text,
  p_original_date date,
  p_requested_date date,
  p_requested_time text,
  p_note text,
  p_initiated_by text DEFAULT 'student'::text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  new_id uuid;
  rl_ok  boolean := true;
begin
  -- ยามเฝ้าประตู: ยิงเกิน 20 ครั้ง/60 วิ ต่อ IP = บล็อก (กันไล่เดา token)
  -- ⚠️ ยกเว้นครู: ตอนเสนอหลายรอบเวลาพร้อมกัน ครูยิงฟังก์ชันนี้รัวๆ ทีละแถวโดยธรรมชาติ
  --    ถ้าไม่ยกเว้น ครูเสนอเกิน 20 แถวในนาทีเดียวจะโดนบล็อกตัวเอง
  if not public.is_teacher_caller()
     and to_regprocedure('public.slink_rl_check(text,int,int)') is not null then
    execute 'select public.slink_rl_check($1,$2,$3)' into rl_ok using 'submit_class_request', 20, 60;
    if not rl_ok then
      raise exception 'too many requests' using errcode = 'P0001';
    end if;
    -- เช็คแยกอีกตัว: ถ้ามี slink_rl_check แต่ไม่มี slink_log_fail จะพังทั้งฟังก์ชัน (undefined_function)
    if to_regprocedure('public.slink_log_fail(text,text)') is not null
       and not exists (select 1 from public.classroom_students where token = p_token) then
      execute 'select public.slink_log_fail($1,$2)' using 'submit_class_request', p_token;
    end if;
  end if;

  if p_request_type not in ('cancel', 'reschedule', 'add_class') then
    raise exception 'invalid request_type';
  end if;
  if p_initiated_by not in ('student', 'teacher') then
    raise exception 'invalid initiated_by';
  end if;

  -- ★ 2026-07-26 ด่านใหม่: อ้างว่าเป็นครู ต้องเป็นครูจริงเท่านั้น
  if p_initiated_by = 'teacher' and not public.is_teacher_caller() then
    raise exception 'only the teacher can create a teacher-initiated request (老師登入已過期或不是老師帳號，請重新登入再試)'
      using errcode = 'P0001';
  end if;

  insert into public.classroom_requests
    (token, student_name, request_type, original_date, requested_date, requested_time, note, initiated_by)
  values
    (p_token, p_student_name, p_request_type, p_original_date, p_requested_date, p_requested_time, p_note, p_initiated_by)
  returning id into new_id;
  return new_id;
end;
$function$;


-- ────────────────────────────────────────────────────────────────────────────
-- 2) เวอร์ชันเก่า (ไม่มี p_initiated_by) — เว็บไม่เรียกแล้ว แต่คงไว้ให้ตรงกัน
--    ตัวนี้ไม่รับ initiated_by อยู่แล้ว จึงบังคับเป็น 'student' โดยธรรมชาติ
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.submit_class_request(
  p_token text,
  p_student_name text,
  p_request_type text,
  p_original_date date,
  p_requested_date date,
  p_requested_time text,
  p_note text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  new_id uuid;
  rl_ok  boolean := true;
begin
  -- ⚠️ ยกเว้นครู: ตอนเสนอหลายรอบเวลาพร้อมกัน ครูยิงฟังก์ชันนี้รัวๆ ทีละแถวโดยธรรมชาติ
  --    ถ้าไม่ยกเว้น ครูเสนอเกิน 20 แถวในนาทีเดียวจะโดนบล็อกตัวเอง
  if not public.is_teacher_caller()
     and to_regprocedure('public.slink_rl_check(text,int,int)') is not null then
    execute 'select public.slink_rl_check($1,$2,$3)' into rl_ok using 'submit_class_request', 20, 60;
    if not rl_ok then
      raise exception 'too many requests' using errcode = 'P0001';
    end if;
    -- เช็คแยกอีกตัว: ถ้ามี slink_rl_check แต่ไม่มี slink_log_fail จะพังทั้งฟังก์ชัน (undefined_function)
    if to_regprocedure('public.slink_log_fail(text,text)') is not null
       and not exists (select 1 from public.classroom_students where token = p_token) then
      execute 'select public.slink_log_fail($1,$2)' using 'submit_class_request', p_token;
    end if;
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


-- ────────────────────────────────────────────────────────────────────────────
-- 3) ตรวจว่าแก้สำเร็จ — ต้องเห็น 2 บรรทัด และตัวที่มี p_initiated_by ต้องเป็น true
-- ────────────────────────────────────────────────────────────────────────────
select p.proname,
       pg_get_function_identity_arguments(p.oid) as args,
       (pg_get_functiondef(p.oid) like '%is_teacher_caller%') as has_teacher_guard
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'submit_class_request';


-- ────────────────────────────────────────────────────────────────────────────
-- 4) ปิดสิทธิ์ is_teacher_caller() ไม่ให้หน้าเว็บเรียกเองตรงๆ (ใช้ภายในฟังก์ชันอื่นเท่านั้น)
--    ⚠️ ต้อง revoke จาก "public" ด้วย ไม่ใช่แค่ anon/authenticated
--    เพราะ Postgres แจกสิทธิ์ EXECUTE ให้ role พิเศษชื่อ PUBLIC (= ทุกคน) อัตโนมัติทุกฟังก์ชันใหม่
-- ────────────────────────────────────────────────────────────────────────────
revoke execute on function public.is_teacher_caller() from public, anon, authenticated;
