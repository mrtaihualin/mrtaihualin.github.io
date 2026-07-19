-- ════════════════════════════════════════════════════════════════════════════
-- 2026-07-19 — แก้บั๊ก "建立紀錄失敗：invalid request_type"
--
-- อาการ: กด「➕ 加課堂時間」→「送出通知給學生」แล้วขึ้น invalid request_type
--        (ทั้งฝั่งครู proposeAddClassDay และฝั่งนักเรียน「申請加課」)
--
-- สาเหตุ: submit_class_request อนุญาตแค่ ('cancel', 'reschedule')
--        แต่โค้ดเว็บส่ง 'add_class' เข้ามา (classroom/index.html บรรทัด 2120 และ 5578)
--        → ฟีเจอร์ "เพิ่มคาบ" ไม่เคยใช้งานได้เลยตั้งแต่สร้าง (2026-07-15 / 2026-07-18)
--
-- แก้: เพิ่ม 'add_class' เข้าไปในรายการที่อนุญาต — ไม่แตะตรรกะอื่นเลย
--      (แก้ทั้ง 2 เวอร์ชันของฟังก์ชัน เพื่อไม่ให้เหลือตัวเก่าที่ยังปฏิเสธอยู่)
-- ════════════════════════════════════════════════════════════════════════════


-- ────────────────────────────────────────────────────────────────────────────
-- 1) เวอร์ชันหลักที่เว็บเรียกใช้จริง (มี p_initiated_by)
--    ⚠️ ลอกของเดิมมาทั้งดุ้น เปลี่ยนแค่บรรทัด request_type บรรทัดเดียว
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
begin
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


-- ────────────────────────────────────────────────────────────────────────────
-- 2) เวอร์ชันเก่า (ไม่มี p_initiated_by) — เว็บไม่เรียกแล้ว แต่แก้ให้ตรงกันกันสับสน
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
begin
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
-- 3) ⚠️ เช็กด่านที่สอง — เผื่อคอลัมน์ request_type มี CHECK constraint ล็อกไว้อีกชั้น
--    ถ้าผลลัพธ์ออกมามีบรรทัด และในนั้น "ไม่มี" คำว่า add_class
--    → แปลว่ายังติดอีกด่าน ต้องบอก Lin/AI ให้แก้ต่อ (อย่าเพิ่งลบ constraint เอง)
--    ถ้าไม่มีบรรทัดเลย = ไม่มี constraint ผ่านได้เลย
-- ────────────────────────────────────────────────────────────────────────────
select con.conname, pg_get_constraintdef(con.oid) as definition
from pg_constraint con
join pg_class rel on rel.oid = con.conrelid
where rel.relname = 'classroom_requests'
  and con.contype = 'c';


-- ────────────────────────────────────────────────────────────────────────────
-- 4) ตรวจว่าแก้สำเร็จ — ต้องเห็น add_class ในทั้ง 2 บรรทัด
-- ────────────────────────────────────────────────────────────────────────────
select p.proname,
       pg_get_function_identity_arguments(p.oid) as args,
       (pg_get_functiondef(p.oid) like '%add_class%') as allows_add_class
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'submit_class_request';
