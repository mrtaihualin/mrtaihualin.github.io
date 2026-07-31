-- 🛑🛑🛑 ไฟล์นี้เลิกใช้แล้ว — ห้ามรันเด็ดขาด 🛑🛑🛑
-- ════════════════════════════════════════════════════════════════════════════
-- แยกออกมาจากไฟล์ supabase/2026-07-26_student-rpc-add-rate-limit.sql เมื่อ 2026-07-31
-- เหตุผลที่แยก: ไฟล์ต้นทางมีฟังก์ชัน 10 ตัว โดย 8 ตัวยังใช้งานจริงอยู่ แต่ 2 ก้อนนี้เป็นระเบิด
--              ปนอยู่ในไฟล์เดียวกัน ทำให้ไฟล์นั้นทั้งไฟล์กลายเป็น "ห้ามรัน" ไปด้วยทั้งที่ไม่ควรเป็น
--              → ยกระเบิดออกมาไว้ที่นี่ ไฟล์ต้นทางจะได้กลับไปรันซ้ำได้ทั้งไฟล์ตามปกติ
--
-- ในนี้มีอะไร: submit_class_request 2 เวอร์ชันเก่า (แบบ 7 ช่องรับค่า และแบบ 8 ช่องรับค่า)
--              ทั้งคู่ถูกลบทิ้งจากฐานข้อมูลจริงไปแล้วเมื่อ 2026-07-30
--
-- ของจริงที่ใช้อยู่ตอนนี้: supabase/sql/2026-07-30_submit_class_request_consolidated.sql
--                        (เวอร์ชัน 9 ช่องรับค่า — มีด่าน 24 ชม. และด่านห้ามปลอมเป็นครู)
--
-- ถ้าเผลอรันไฟล์นี้ จะเกิด 2 อย่างพร้อมกัน:
--   (1) ฟังก์ชันซ้อนกัน 3 ตัว → Postgres เลือกไม่ถูก ตอบ "Could not choose the best candidate
--       function" → เว็บส่งคำขออะไรไม่ได้เลยสักอย่าง (ยกเลิก/ขอเลื่อน/ขอเพิ่มคาบ พังหมด)
--       = เหตุการณ์เดียวกับที่เกิดขึ้นจริงเมื่อ 2026-07-30
--   (2) 2 ก้อนนี้ไม่มีด่าน "นักเรียนยกเลิกได้เฉพาะเหลือเวลา 24 ชม.ขึ้นไป"
--       → ด่านนั้นหายไปเงียบๆ ไม่มี error ไม่มีใครรู้ตัว
--
-- 👉 เก็บไว้เป็นประวัติเท่านั้น (ไว้ดูว่าฐานข้อมูลเคยเป็นยังไง) ห้ามกด Run
-- ════════════════════════════════════════════════════════════════════════════


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
