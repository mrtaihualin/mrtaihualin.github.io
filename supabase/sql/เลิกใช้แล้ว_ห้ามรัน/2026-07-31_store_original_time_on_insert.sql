-- 🛑🛑 อัปเดต 2026-08-01 — ไฟล์นี้ไม่ใช่ของล่าสุดแล้ว ห้ามรันซ้ำ 🛑🛑
--    submit_class_request ถูกแก้ต่อ (เพิ่มด่าน "ขอเลื่อนคาบต้องเหลือ 6 ชั่วโมง")
--    ต้นฉบับล่าสุดอยู่ที่: supabase/sql/2026-08-01_reschedule_guards.sql
--    รันไฟล์นี้ซ้ำ = ด่าน 6 ชม.หายไปเงียบๆ (ช่องรับค่าเท่ากัน จึงเขียนทับได้ ไม่มี error เตือน)
--    ✅ ทุกอย่างที่ไฟล์นี้ทำ (เก็บ original_time ตอน INSERT + ด่าน 24 ชม. + ด่านเช็ค token)
--       ถูกคัดลอกไปครบทุกบรรทัดในไฟล์ใหม่แล้ว
--    👉 สารบัญ: supabase/sql/00_ฟังก์ชันไหนอยู่ไฟล์ไหน.md
-- ════════════════════════════════════════════════════════════════════════════
-- 2026-07-31 (ต่อจากงาน C14) — เก็บ original_time ตอนสร้างคำขอเลย ไม่ต้องรอเว็บมาเติมทีหลัง
-- ════════════════════════════════════════════════════════════════════════════
--
-- 🕳️ ปัญหาเดิม: submit_class_request รับค่า p_original_time มาใช้แค่คิดด่าน 24 ชม.
--    (ดู supabase/sql/2026-07-31_submit_verify_token.sql บรรทัด 116-125) แต่ไม่เคยเก็บลงตาราง
--    → เว็บต้องยิงคำสั่ง UPDATE ตามหลังอีกรอบทันทีหลังสร้างคำขอสำเร็จ (classroom/index.html
--      บรรทัด ~5645-5661 ก้อน extraFields1.original_time) = จุดพังเพิ่มมาฟรีๆ 1 จุด
--      (ถ้า UPDATE รอบสองล้มเหลว จะเหลือคำขอที่ original_time เป็นค่าว่างค้างอยู่)
--
-- ✅ ฟังก์ชันนี้ = ตัวเดิมจาก 2026-07-31_submit_verify_token.sql ทุกบรรทัด + เพิ่มคอลัมน์
--    original_time เข้า insert เดียว (ไม่เพิ่ม/ลดช่องรับค่า พารามิเตอร์ 9 ช่องเท่าเดิมเป๊ะ)
--
-- 🔒 จำนวนช่องรับค่า: 9 ช่อง เท่าเดิม → CREATE OR REPLACE เขียนทับตัวเดิมได้จริง ไม่ต้อง drop
--
-- ▶️ วิธีรัน: เปิดไฟล์นี้ → ⌘A → ⌘C → วางใน Supabase SQL Editor → Run
--    ตัวทดสอบอยู่คนละไฟล์: 2026-07-31_store_original_time_on_insert_TEST.sql (รันทีหลัง)
-- ปลอดภัยที่จะรันซ้ำ
-- ════════════════════════════════════════════════════════════════════════════


-- ────────────────────────────────────────────────────────────────────────────
-- ส่วนที่ 1 — ตัวฟังก์ชัน
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.submit_class_request(
  p_token text,
  p_student_name text,
  p_request_type text,
  p_original_date date,
  p_requested_date date,
  p_requested_time text,
  p_note text,
  p_initiated_by text DEFAULT 'student'::text,
  p_original_time text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  new_id uuid;
  rl_ok  boolean := true;
  v_db_name text;
begin
  if not public.is_teacher_caller()
     and to_regprocedure('public.slink_rl_check(text,int,int)') is not null then
    execute 'select public.slink_rl_check($1,$2,$3)' into rl_ok using 'submit_class_request', 20, 60;
    if not rl_ok then
      raise exception 'too many requests' using errcode = 'P0001';
    end if;
    if to_regprocedure('public.slink_log_fail(text,text)') is not null
       and not exists (select 1 from public.classroom_students where token = p_token) then
      execute 'select public.slink_log_fail($1,$2)' using 'submit_class_request', p_token;
    end if;
  end if;

  select s.name into v_db_name
  from public.classroom_students s
  where s.token = p_token;

  if not found then
    raise exception 'invalid student token — this request does not belong to any student (找不到這位學生，請從老師給的專屬連結重新進入)'
      using errcode = 'P0001';
  end if;

  p_student_name := coalesce(nullif(btrim(coalesce(v_db_name, '')), ''), p_student_name);

  if p_request_type not in ('cancel', 'reschedule', 'add_class') then
    raise exception 'invalid request_type';
  end if;
  if p_initiated_by not in ('student', 'teacher') then
    raise exception 'invalid initiated_by';
  end if;

  if p_initiated_by = 'teacher' and not public.is_teacher_caller() then
    raise exception 'only the teacher can create a teacher-initiated request (老師登入已過期或不是老師帳號，請重新登入再試)'
      using errcode = 'P0001';
  end if;

  if p_request_type = 'cancel' and not public.is_teacher_caller() then
    if p_original_time is null then
      raise exception 'missing original_time to validate the 24-hour cancellation window' using errcode = 'P0001';
    end if;
    if (p_original_date::timestamp + p_original_time::time) at time zone 'Asia/Bangkok' - now() < interval '24 hours' then
      raise exception 'students may only cancel a class 24+ hours in advance — please use reschedule instead (取消需在課堂開始前24小時，時間不夠請改用「申請改期」)' using errcode = 'P0001';
    end if;
  end if;

  -- ══════════════════════════════════════════════════════════════════════════
  -- ★ ใหม่ 2026-07-31 — เก็บ original_time ลงตารางตอนสร้างคำขอเลย
  --    (เดิมรับมาแค่ใช้เช็คด่าน 24 ชม.ด้านบน แล้วทิ้งไป ไม่เคยเก็บ)
  -- ══════════════════════════════════════════════════════════════════════════
  insert into public.classroom_requests
    (token, student_name, request_type, original_date, original_time, requested_date, requested_time, note, initiated_by)
  values
    (p_token, p_student_name, p_request_type, p_original_date, p_original_time, p_requested_date, p_requested_time, p_note, p_initiated_by)
  returning id into new_id;
  return new_id;
end;
$function$;


-- ────────────────────────────────────────────────────────────────────────────
-- ส่วนที่ 2 — ตรวจว่าติดตั้งสำเร็จ
-- ต้องได้ 1 แถว · 9 ช่องรับค่า · ทุกช่องขวาต้องเป็น true
-- ────────────────────────────────────────────────────────────────────────────
select p.proname,
       pg_get_function_identity_arguments(p.oid)                          as ช่องรับค่า,
       (pg_get_functiondef(p.oid) like '%invalid student token%')         as ด่านเดิม_ตรวจรหัสนักเรียน,
       (pg_get_functiondef(p.oid) like '%hours in advance%')              as ด่านเดิม_24ชม,
       (pg_get_functiondef(p.oid) like '%only the teacher can create%')   as ด่านเดิม_ห้ามปลอมเป็นครู,
       (pg_get_functiondef(p.oid) like '%original_date, original_time, requested_date%') as ด่านใหม่_เก็บoriginal_time
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'submit_class_request';
