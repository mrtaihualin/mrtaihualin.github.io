-- ════════════════════════════════════════════════════════════════════════════
-- 2026-07-30 — รวม submit_class_request ให้เหลือไฟล์เดียว + เพิ่มด่านห้ามนักเรียน "ยกเลิก"
-- ────────────────────────────────────────────────────────────────────────────
-- ⚠️ ไฟล์นี้แทนที่ทั้งหมด — ห้ามรัน 2 ไฟล์เก่านี้ซ้ำอีกต่อไป (จะย้อนกลับสิ่งที่แก้ในไฟล์นี้):
--   - supabase/2026-07-26_student-rpc-add-rate-limit.sql
--       (เฉพาะส่วน submit_class_request 2 ตัว — ฟังก์ชัน get_student_*/student_get_own_requests/
--        student_update_own_request ในไฟล์นั้นไม่เกี่ยวกับไฟล์นี้ ยังใช้ของเดิมได้ปกติ)
--   - supabase/sql/2026-07-26_force_initiated_by.sql
--       (ทั้งไฟล์ ถูกรวมเข้ามาที่นี่หมดแล้ว รวม is_teacher_caller() ด้วย)
--
-- ที่มา: สองไฟล์เก่าแก้ submit_class_request วันเดียวกัน (2026-07-26) ไม่ตรงกัน —
--   ไฟล์ rate-limit ใส่ยามเฝ้าประตูแบบไม่มีเงื่อนไข (ครูก็โดนด้วย)
--   ไฟล์ force_initiated_by เขียนทับอีกที คัดลอกจากฐานข้อมูลจริงมา + เพิ่มด่านครู +
--   แก้ยามเฝ้าประตูให้ยกเว้นครู (กันครูเสนอเวลาหลายแถวรัวๆ แล้วโดนบล็อกตัวเอง)
--   → ไฟล์ force_initiated_by น่าจะเป็นเวอร์ชันที่ใช้งานจริงอยู่ตอนนี้ (แต่ Lin ควรกดตรวจสอบ
--     ตามขั้นที่ 1 ก่อนรันไฟล์นี้ อธิบายไว้ในข้อความที่ Claude ส่งให้)
--
-- ไฟล์นี้เพิ่มอะไรใหม่ (ตามที่ Lin สั่ง 2026-07-30):
--   หน้าเว็บกำลังเอาปุ่ม "นักเรียนขอยกเลิกคลาสเอง" ออกทั้งหมด (ทำอยู่อีกแชทหนึ่ง)
--   → ฝั่งฐานข้อมูลต้องปิดประตูด้วย ไม่ใช่พึ่งแค่ซ่อนปุ่มบนเว็บ (ต่อให้ซ่อนปุ่ม ใครก็ยิง API ตรงได้)
--   → เพิ่มด่าน: ถ้า request_type = 'cancel' และคนเรียกไม่ใช่ครูจริง (is_teacher_caller() = false)
--     ปฏิเสธทันที ไม่ว่าจะส่ง p_initiated_by มาเป็นอะไรก็ตาม (เชื่อ is_teacher_caller() อย่างเดียว
--     ไม่เชื่อค่าที่ผู้ใช้ส่งมา — หลักการเดียวกับด่านครูเดิม)
--   'reschedule' และ 'add_class' ไม่แตะ ยังทำงานเหมือนเดิมทุกอย่างสำหรับนักเรียน
--
-- 🗑️ ลบเวอร์ชันเก่า 7 พารามิเตอร์ทิ้งแล้ว (ตามที่ Lin สั่ง 2026-07-30 — ยืนยันไม่มีอะไรเรียกใช้อยู่):
--   เดิมมี submit_class_request 2 ตัวซ้อนกัน (7 พารามิเตอร์ = เวอร์ชันดั้งเดิมก่อนมี initiated_by,
--   8 พารามิเตอร์ = ตัวที่เว็บเรียกจริงตั้งแต่มีระบบ initiated_by) ตัว 7 พารามิเตอร์เว็บเลิกเรียกไปนานแล้ว
--   และพิสูจน์แล้วจากการทดสอบจริงว่าเรียกด้วย 7 ค่าตรงๆ ไม่ได้อยู่ดี (Postgres ฟ้อง "not unique"
--   เพราะพารามิเตอร์ตัวที่ 8 ของอีกฟังก์ชันมีค่า default ทำให้ชนกับเวอร์ชันนี้เสมอ — ปัญหานี้มีมาตั้งแต่
--   2026-07-19 ก่อนไฟล์นี้แล้ว ไม่เกี่ยวกับการแก้วันนี้) เก็บไว้ก็ใช้ไม่ได้จริง จึงลบทิ้งให้สะอาด
--   เหลือ submit_class_request แค่ตัวเดียว (8 พารามิเตอร์) เท่านั้นต่อจากนี้
--
-- ปลอดภัยที่จะรันซ้ำ (create or replace + drop if exists ทั้งหมด)
-- ════════════════════════════════════════════════════════════════════════════


-- ── 0) ตัวช่วย: คนที่กำลังเรียกอยู่ตอนนี้ เป็นครูจริงไหม (มาจาก force_initiated_by.sql เดิม) ──
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
-- 1) เวอร์ชันหลักที่เว็บเรียกใช้จริง (8 พารามิเตอร์ มี p_initiated_by)
--    รวม 3 ด่าน: ยามเฝ้าประตู (ยกเว้นครู) + ด่านห้ามปลอมเป็นครู + ด่านใหม่ห้ามนักเรียนยกเลิก
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

  -- ด่านเดิม (2026-07-26): อ้างว่าเป็นครู ต้องเป็นครูจริงเท่านั้น (เชื่อ JWT ไม่เชื่อค่าที่ส่งมา)
  if p_initiated_by = 'teacher' and not public.is_teacher_caller() then
    raise exception 'only the teacher can create a teacher-initiated request (老師登入已過期或不是老師帳號，請重新登入再試)'
      using errcode = 'P0001';
  end if;

  -- ★ ด่านใหม่ (2026-07-30): นักเรียนห้ามยื่นคำขอ "ยกเลิก" เอง — มีแค่ครูเท่านั้นที่ยกเลิกได้
  --    เช็คด้วย is_teacher_caller() ตรงๆ ไม่ใช้ p_initiated_by (ป้องกันการปลอมค่า)
  if p_request_type = 'cancel' and not public.is_teacher_caller() then
    raise exception 'students may not submit cancel requests — only the teacher can cancel a class (取消課程僅限老師操作)'
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
-- 2) ลบเวอร์ชันเก่า (7 พารามิเตอร์ ไม่มี p_initiated_by) ทิ้ง — ตามที่ Lin สั่ง 2026-07-30
--    ยืนยันแล้วว่าไม่มีอะไรเรียกใช้จริง (เว็บเลิกเรียกไปตั้งแต่มีเวอร์ชัน 8 พารามิเตอร์)
--    และเรียกด้วย 7 ค่าตรงๆ ก็ไม่ได้จริงอยู่ดี เพราะชนกับ default ของตัว 8 พารามิเตอร์
--    (ดูคำอธิบายเต็มในหมายเหตุหัวไฟล์)
-- ────────────────────────────────────────────────────────────────────────────
drop function if exists public.submit_class_request(
  text, text, text, date, date, text, text
);


-- ────────────────────────────────────────────────────────────────────────────
-- 3) ปิดสิทธิ์ is_teacher_caller() ไม่ให้หน้าเว็บเรียกเองตรงๆ (ใช้ภายในฟังก์ชันอื่นเท่านั้น)
--    ⚠️ ต้อง revoke จาก "public" ด้วย ไม่ใช่แค่ anon/authenticated
--    เพราะ Postgres แจกสิทธิ์ EXECUTE ให้ role พิเศษชื่อ PUBLIC (= ทุกคน) อัตโนมัติทุกฟังก์ชันใหม่
-- ────────────────────────────────────────────────────────────────────────────
revoke execute on function public.is_teacher_caller() from public, anon, authenticated;


-- ────────────────────────────────────────────────────────────────────────────
-- 4) ตรวจว่าแก้สำเร็จ — ต้องเห็น "แค่ 1 บรรทัด" เท่านั้น (8 พารามิเตอร์)
--    ตัว 7 พารามิเตอร์ถูกลบไปแล้ว ถ้ายังเห็น 2 บรรทัด แปลว่า drop function ไม่สำเร็จ
--    ทั้ง has_teacher_guard และ has_cancel_guard ต้องเป็น true
-- ────────────────────────────────────────────────────────────────────────────
select p.proname,
       pg_get_function_identity_arguments(p.oid) as args,
       (pg_get_functiondef(p.oid) like '%is_teacher_caller%') as has_teacher_guard,
       (pg_get_functiondef(p.oid) like '%students may not submit cancel requests%') as has_cancel_guard
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'submit_class_request';


-- ────────────────────────────────────────────────────────────────────────────
-- 5) ทดสอบจริงว่านักเรียนยื่น "ยกเลิก" ไม่ได้แล้ว (ปลอดภัย — โดน raise exception
--    ก่อนถึงบรรทัด insert เสมอ จึงไม่มีแถวขยะเข้าตาราง classroom_requests จริง)
--    เขียนแบบคืนค่าเป็นตาราง (ไม่ใช้ raise notice) เพราะ notice ไม่โชว์ในผลลัพธ์ SQL Editor
--    คาดหวัง: เห็น 1 แถว result = "✅ ผ่าน"
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public._test_cancel_guard()
returns table(test_case text, result text) language plpgsql as $$
begin
  begin
    perform public.submit_class_request('test-token-does-not-exist','ทดสอบ','cancel',
      current_date, current_date+1, '10:00', 'test', 'student');
    test_case := '8 พารามิเตอร์'; result := '❌ ไม่ผ่าน — นักเรียนยกเลิกได้!';
    return next;
  exception when others then
    test_case := '8 พารามิเตอร์';
    result := case when sqlerrm like '%students may not submit cancel requests%'
                   then '✅ ผ่าน' else '⚠️ บล็อกด้วยเหตุผลอื่น: '||sqlerrm end;
    return next;
  end;
end; $$;

select * from public._test_cancel_guard();
drop function public._test_cancel_guard();
