-- ⚠️⚠️⚠️ ไฟล์นี้ถูกแทนที่แล้ว — ห้ามรันไฟล์นี้ซ้ำ ⚠️⚠️⚠️
-- ต้นฉบับล่าสุดของ submit_class_request อยู่ที่ 2026-07-31_store_original_time_on_insert.sql
-- (ต่อยอดจากไฟล์นี้ทุกบรรทัด + เพิ่มการเก็บ original_time ลงตารางตอนสร้างคำขอ)
-- รันไฟล์นี้ซ้ำ = ปลอดภัย ไม่ทำให้เว็บล่ม (ช่องรับค่าเท่าเดิม) แต่จะ "ย้อนกลับ" การเก็บ
-- original_time หายไปเงียบๆ (เว็บจะต้องกลับไปพึ่งการเติมทีหลังเหมือนเดิม)
-- ════════════════════════════════════════════════════════════════════════════
-- 2026-07-31 — งาน C14: ตรวจว่า "รหัสนักเรียน" มีอยู่จริง ก่อนรับคำขอ
--                        + เอาชื่อจากฐานข้อมูลจริง ไม่เชื่อชื่อที่ส่งมา
-- ════════════════════════════════════════════════════════════════════════════
--
-- 🕳️ รูที่อุด (พิสูจน์จากโค้ดจริงแล้ว ไม่ใช่ข้อสงสัย):
--    submit_class_request ไม่เคยตรวจว่า p_token มีอยู่จริงในตาราง classroom_students
--    ในตัวฟังก์ชันเอ่ยถึง token มั่วอยู่จุดเดียว (บรรทัด 117-120 ของไฟล์ consolidated)
--    แต่ตรงนั้นแค่ "จดบันทึกไว้ว่ามีคนใช้รหัสมั่ว" แล้วโค้ดก็เดินต่อไปบันทึกคำขอตามปกติ
--    ไม่มีการหยุดเลย · ส่วนชื่อนักเรียนก็ถูกยัดลงตารางตรงๆ ไม่เทียบกับฐานข้อมูล
--
--    หลักฐานชิ้นที่หนักที่สุดอยู่ในไฟล์ consolidated เอง:
--      ชุดทดสอบยิงคำขอด้วย token ปลอม 'test-token-does-not-exist' แล้ว "ผ่าน"
--      รู้ได้ยังไงว่าผ่าน? เพราะต้องเขียนคำสั่ง "ลบแถวขยะทิ้ง" ไว้ตอนท้าย
--      ซึ่งจะเขียนไว้ทำไมถ้าไม่มีแถวเกิดขึ้นจริง
--
-- 💥 ผลจริง: ยิงคำขอขยะเข้าคิวครูได้ ตั้งชื่อเป็นใครก็ได้
--    (มีตัวจำกัด 20 ครั้ง/60 วินาที ต่อ IP อยู่แล้ว จึงสแปมรัวๆ ไม่ได้)
--    ส่ง LINE สแปมไม่ได้ (มีด่านแยกที่ notify-line) → ผลกระทบคือ "คิวครูรก + ชื่อปลอม"
--    ไม่ใช่ข้อมูลรั่ว
--
-- ✅ ฟังก์ชันนี้ = ตัวเดิมทุกบรรทัด + แทรกด่านใหม่ 1 ก้อน (มีป้าย ★ กำกับ)
--    คัดลอกตัวเดิมมาจาก supabase/sql/2026-07-30_submit_class_request_consolidated.sql:95
--
-- 🔒 จำนวนช่องรับค่า: 9 ช่อง เท่าเดิมเป๊ะ ไม่เพิ่มไม่ลด
--    → "CREATE OR REPLACE" เขียนทับตัวเดิมได้จริง ไม่เกิดฟังก์ชันซ้อนกัน
--    → ไม่ต้อง drop อะไรทั้งสิ้น
--
-- ⚠️ กระทบคำขอทั้ง 3 ชนิด (ยกเลิก / ขอเลื่อน / เพิ่มคาบ) เพราะเป็นประตูทางเข้าเดียวกัน
--    ตัวทดสอบจึงต้องลองครบทั้ง 3 ชนิด ไม่ใช่แค่ยกเลิก
--
-- ▶️ วิธีรัน: เปิดไฟล์นี้ → กด ⌘A (เลือกทั้งหมด) → ⌘C → วางใน Supabase SQL Editor → Run
--    ตัวทดสอบอยู่คนละไฟล์: 2026-07-31_submit_verify_token_TEST.sql (รันทีหลัง)
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
  v_db_name text;   -- ★ ใหม่: ชื่อจริงของนักเรียนจากฐานข้อมูล
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

  -- ══════════════════════════════════════════════════════════════════════════
  -- ★ ด่านใหม่ 2026-07-31 (งาน C14) — รหัสนักเรียนต้องมีอยู่จริง + ชื่อต้องมาจากฐานข้อมูล
  --
  -- ทำไมต้องมี: เดิมโค้ดข้างบนแค่ "จดบันทึก" ว่ามีคนใช้รหัสมั่ว แล้วปล่อยผ่านไปบันทึกคำขอจริง
  --             → ใครก็ยิงคำขอขยะเข้าคิวครูได้ ตั้งชื่อเป็นใครก็ได้
  --
  -- ใช้กับทุกคน (ทั้งนักเรียนและครู) เพราะ:
  --   · ครูก็ใช้รหัสของนักเรียนจริงเสมอ (มาจาก studentsCache ในหน้าเว็บ) → ไม่กระทบครู
  --   · คำขอที่ชี้ไปนักเรียนที่ไม่มีตัวตน = ขยะ ไม่ว่าใครจะเป็นคนส่ง
  --
  -- เรื่องชื่อ: ถ้าชื่อในฐานข้อมูลว่างเปล่า ให้ถอยไปใช้ชื่อที่ส่งมาแทน
  --   (กันบั๊กเก่าที่เคยเกิดจริง 2026-07-14 — คิวครูโชว์ชื่อเป็น "-")
  -- ══════════════════════════════════════════════════════════════════════════
  select s.name into v_db_name
  from public.classroom_students s
  where s.token = p_token;

  if not found then
    raise exception 'invalid student token — this request does not belong to any student (找不到這位學生，請從老師給的專屬連結重新進入)'
      using errcode = 'P0001';
  end if;

  p_student_name := coalesce(nullif(btrim(coalesce(v_db_name, '')), ''), p_student_name);
  -- ══════════════════════ จบด่านใหม่ ตั้งแต่บรรทัดล่างเหมือนเดิมทุกตัวอักษร ══════════════════════

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

  -- ด่านเดิม (2026-07-30): นักเรียนยกเลิกเองได้ ถ้าคาบเรียนยังเหลืออีก 24 ชม.ขึ้นไป
  --   เช็คด้วย is_teacher_caller() ตรงๆ ไม่ใช้ p_initiated_by (ป้องกันการปลอมค่า)
  if p_request_type = 'cancel' and not public.is_teacher_caller() then
    if p_original_time is null then
      raise exception 'missing original_time to validate the 24-hour cancellation window' using errcode = 'P0001';
    end if;
    if (p_original_date::timestamp + p_original_time::time) at time zone 'Asia/Bangkok' - now() < interval '24 hours' then
      raise exception 'students may only cancel a class 24+ hours in advance — please use reschedule instead (取消需在課堂開始前24小時，時間不夠請改用「申請改期」)' using errcode = 'P0001';
    end if;
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
-- ส่วนที่ 2 — ตรวจว่าติดตั้งสำเร็จ
-- ต้องได้ 1 แถว · 9 ช่องรับค่า · ทุกช่องขวาต้องเป็น true
-- ────────────────────────────────────────────────────────────────────────────
select p.proname,
       pg_get_function_identity_arguments(p.oid)                          as ช่องรับค่า,
       (pg_get_functiondef(p.oid) like '%invalid student token%')         as ด่านใหม่_ตรวจรหัสนักเรียน,
       (pg_get_functiondef(p.oid) like '%hours in advance%')              as ของเดิม_ด่าน24ชม,
       (pg_get_functiondef(p.oid) like '%only the teacher can create%')   as ของเดิม_ด่านห้ามปลอมเป็นครู,
       (pg_get_functiondef(p.oid) like '%slink_rl_check%')                as ของเดิม_ยามเฝ้าประตู
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'submit_class_request';
