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
-- ไฟล์นี้เพิ่มอะไรใหม่ (แก้รอบ 2, 2026-07-30 — กฎสุดท้ายที่ Lin ยืนยัน แทนที่เวอร์ชันแรกที่ห้าม
-- นักเรียนยกเลิกเองแบบไม่มีเงื่อนไข):
--   นักเรียนยกเลิกคลาสเองได้ ถ้าคาบเรียนยังเหลืออีก 24 ชม.ขึ้นไป
--   ถ้าเหลือน้อยกว่า 24 ชม. → ห้าม ต้องให้ไปใช้ทาง "ขอเลื่อน/改期" แทน (ฝั่งหน้าเว็บ redirect ไปทางนั้น
--   ทำอยู่อีกแชทหนึ่ง — งานนี้ทำแค่ฝั่งฐานข้อมูล)
--   → ฝั่งฐานข้อมูลต้องเช็คด้วย ไม่ใช่พึ่งแค่ซ่อนปุ่ม/บล็อกบนเว็บอย่างเดียว (ต่อให้ซ่อนปุ่ม ใครก็ยิง API ตรงได้)
--   → เพิ่มพารามิเตอร์ใหม่ p_original_time (เวลาเริ่มคาบ เช่น '14:00') เพราะ p_original_date เดิม
--     เป็น date อย่างเดียว ไม่มีเวลา คำนวณ 24 ชม.ไม่ได้ถ้าไม่มีเวลา
--   → ด่านครู (is_teacher_caller() = true) ไม่ถูกแตะเลย ครูยกเลิกได้ไม่จำกัดเวลาเหมือนเดิม
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
-- 🔴 0.5) ลบเวอร์ชัน 8 พารามิเตอร์ (ตัวที่ใช้งานจริงอยู่ตอนนี้) ทิ้งก่อน — เพิ่ม 2026-07-30 หลังตรวจซ้ำ
--
-- ทำไมต้องมีบรรทัดนี้ (ถ้าไม่มี = เว็บพังทั้งระบบทันทีที่รันไฟล์นี้):
--   ข้างล่างเราเพิ่มพารามิเตอร์ตัวที่ 9 (p_original_time) เข้าไป
--   "CREATE OR REPLACE" ของ Postgres จะเขียนทับได้ก็ต่อเมื่อ "จำนวน+ชนิดพารามิเตอร์เหมือนเดิมเป๊ะ"
--   พอจำนวนไม่เท่าเดิม มันจะ "สร้างตัวใหม่เพิ่ม" ไม่ใช่เขียนทับ → เหลือ 2 ตัวซ้อนกัน (8 กับ 9 พารามิเตอร์)
--   เว็บทุกหน้าที่เรียกด้วย 8 ค่า (ขอเลื่อน / ขอเพิ่มคาบ / ครูสั่งยกเลิก) จะเข้าได้ทั้ง 2 ตัว
--   → Postgres ตอบ "Could not choose the best candidate function" = ส่งคำขออะไรไม่ได้เลยสักอย่าง
--   (เป็นอาการเดียวกับที่ไฟล์นี้เล่าไว้ข้างบนตอนปี 7 vs 8 พารามิเตอร์ เมื่อ 2026-07-14)
-- ลบตัวเก่าทิ้งก่อน แล้วเหลือตัวเดียว (9 พารามิเตอร์) → เรียกด้วย 8 ค่าก็ยังได้ ตัวที่ 9 เป็น DEFAULT NULL
--
-- ⚠️ ลำดับการ deploy สำคัญ: รัน SQL นี้ "แล้ว push เว็บทันที"
--    ช่วงคั่นกลางสั้นๆ นักเรียนกด "ขอยกเลิกคาบ" จะไม่ผ่าน (เว็บเก่ายังไม่ส่ง p_original_time)
-- ────────────────────────────────────────────────────────────────────────────
drop function if exists public.submit_class_request(
  text, text, text, date, date, text, text, text
);


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

  -- ★ ด่านใหม่ (2026-07-30 แก้รอบ 2 ตามกฎสุดท้ายที่ Lin ยืนยัน): นักเรียนยกเลิกเองได้
  --    ถ้าคาบเรียนยังเหลืออีก 24 ชม.ขึ้นไป — ถ้าน้อยกว่านั้นห้าม (ให้ไปใช้ทางขอ "เลื่อน/改期" แทน)
  --    เช็คด้วย is_teacher_caller() ตรงๆ ไม่ใช้ p_initiated_by (ป้องกันการปลอมค่า) — ด่านครูไม่ถูกแตะเลย
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
-- 4) ตรวจว่าแก้สำเร็จ — ต้องเห็น "แค่ 1 บรรทัด" เท่านั้น (9 พารามิเตอร์ หลังเพิ่ม p_original_time)
--    ตัว 7 และ 8 พารามิเตอร์ถูกลบไปแล้วทั้งคู่ (ข้อ 0.5 และข้อ 2)
--    🔴 ถ้าเห็น 2 บรรทัดขึ้นไป = ยังมีตัวซ้อนอยู่ ห้ามปล่อยไว้เด็ดขาด เว็บจะเรียกไม่ได้ทั้งระบบ
--       ให้ก๊อป args ของบรรทัดที่ไม่ใช่ 9 พารามิเตอร์ ไปใส่ใน drop function แล้วรันซ้ำ
--    has_teacher_guard และ has_cancel_guard ต้องเป็น true
-- ────────────────────────────────────────────────────────────────────────────
select p.proname,
       pg_get_function_identity_arguments(p.oid) as args,
       (pg_get_functiondef(p.oid) like '%is_teacher_caller%') as has_teacher_guard,
       (pg_get_functiondef(p.oid) like '%24 hours%') as has_cancel_guard
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'submit_class_request';


-- ────────────────────────────────────────────────────────────────────────────
-- 5) ทดสอบจริง 3 เคส
--    🔴 แก้ 2026-07-30 (รอบ 3 — หลัง Lin รันจริงแล้วเจอปัญหา 2 อย่าง):
--    (1) คอมเมนต์เดิมเขียนว่า "ทุกเคสโดน raise exception ก่อนถึง insert ไม่มีแถวขยะ" — ผิด
--        เคส (a) 25 ชม. ผ่านฉลุยจนถึง insert จริง → มีแถวขยะ token='test-token-does-not-exist'
--        ค้างอยู่ในตาราง classroom_requests → ตอนนี้เก็บ id ที่ได้แล้วลบทิ้งเองทุกครั้ง
--    (2) ตัวเช็คข้อความ error เขียน like '%24 hours%' แต่ข้อความจริงคือ "24+ hours" (มีเครื่องหมาย +)
--        → เทียบไม่เจอ เลยรายงานว่า "บล็อกด้วยเหตุผลอื่น" ทั้งที่ด่าน 24 ชม.ทำงานถูกต้องอยู่แล้ว
--        เปลี่ยนไปเทียบคำว่า 'hours in advance' แทน (ตรงกลางประโยค ไม่มีอักขระกวน)
--    เขียนแบบคืนค่าเป็นตาราง (ไม่ใช้ raise notice) เพราะ notice ไม่โชว์ในผลลัพธ์ SQL Editor
--    คาดหวัง: (a) ไม่ใช่ error 24 ชม. (b) ต้องเป็น error 24 ชม. โดยเฉพาะ
--    (c) หมายเหตุ: ทดสอบ "ครูข้ามด่านได้" แบบจริงไม่ได้จาก SQL Editor ตรงๆ เพราะ session ที่นี่
--        ไม่มี JWT จริง is_teacher_caller() จะอ่านเป็น false เสมอไม่ว่า p_initiated_by จะส่งอะไรมา
--        (ข้อจำกัดนี้มีมาตั้งแต่ก่อนแก้รอบนี้แล้ว ไม่ใช่ปัญหาใหม่ — ต้องให้ Lin ทดสอบจริงจากหน้าเว็บ
--        ตอนล็อกอินเป็นครูจริงแทน)
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public._test_cancel_guard()
returns table(test_case text, result text) language plpgsql as $$
declare
  bkk_a timestamp;  -- เวลา Bangkok ท้องถิ่นของเคส (a) 25 ชม.ข้างหน้า
  bkk_b timestamp;  -- เวลา Bangkok ท้องถิ่นของเคส (b) ~2 ชม.ข้างหน้า
  v_new_id uuid;    -- id ของแถวทดสอบที่เคส (a) สร้างขึ้นจริง (ต้องลบทิ้งท้ายฟังก์ชัน)
begin
  -- สำคัญ: ต้องแปลง "อนาคต 25/2 ชม." เป็นวันที่+เวลา ตามเขต Bangkok ก่อน ไม่ใช่เอา current_date
  -- บวกชั่วโมงตรงๆ — ไม่งั้นถ้าตอนทดสอบใกล้เที่ยงคืน วันที่กับเวลาจะไม่ตรงกัน (บั๊กที่แก้แล้วรอบนี้)
  bkk_a := (now() + interval '25 hours') at time zone 'Asia/Bangkok';
  bkk_b := (now() + interval '2 hours') at time zone 'Asia/Bangkok';

  -- (a) นักเรียน ยกเลิกคาบที่ยังเหลืออีก 25 ชม. → ต้อง "ไม่ใช่" error 24 ชม.
  --     (อาจจะพังด้วย error อื่นแทน เช่น token ไม่มีจริงในตาราง classroom_students
  --     ทำให้ไปเจอ path บันทึกล้มเหลว/rate-limit ก่อน — ถือว่าโอเค แค่ต้องไม่ใช่ error 24 ชม.)
  begin
    -- เก็บ id ที่ได้ไว้ เพราะเคสนี้ "ผ่านจริง" = มีแถวเข้าตารางจริง ต้องลบทิ้งเองทีหลัง
    v_new_id := public.submit_class_request('test-token-does-not-exist','ทดสอบ','cancel',
      bkk_a::date, null, null, 'test', 'student', to_char(bkk_a, 'HH24:MI'));
    test_case := 'a) ยกเลิกล่วงหน้า 25 ชม.'; result := '✅ ผ่าน — ไม่โดนด่าน 24 ชม.บล็อก (ถูกต้องตามที่ควรเป็น)';
    return next;
  exception when others then
    test_case := 'a) ยกเลิกล่วงหน้า 25 ชม.';
    result := case when sqlerrm like '%hours in advance%'
                   then '❌ ไม่ผ่าน — โดนบล็อกด้วยด่าน 24 ชม.ทั้งที่เหลือ 25 ชม.!'
                   else '✅ ผ่าน — ไม่ใช่ด่าน 24 ชม. (บล็อกด้วยเหตุผลอื่นที่คาดไว้: '||sqlerrm||')' end;
    return next;
  end;

  -- (b) นักเรียน ยกเลิกคาบที่เหลืออีกแค่ ~2 ชม. → ต้องโดน error 24 ชม.โดยเฉพาะ
  begin
    perform public.submit_class_request('test-token-does-not-exist','ทดสอบ','cancel',
      bkk_b::date, null, null, 'test', 'student', to_char(bkk_b, 'HH24:MI'));
    test_case := 'b) ยกเลิกล่วงหน้า ~2 ชม.'; result := '❌ ไม่ผ่าน — นักเรียนยกเลิกได้ทั้งที่เหลือแค่ 2 ชม.!';
    return next;
  exception when others then
    test_case := 'b) ยกเลิกล่วงหน้า ~2 ชม.';
    result := case when sqlerrm like '%hours in advance%'
                   then '✅ ผ่าน — โดนด่าน 24 ชม.บล็อกถูกต้อง' else '⚠️ บล็อกด้วยเหตุผลอื่น (คาดว่าจะเป็นด่าน 24 ชม.): '||sqlerrm end;
    return next;
  end;

  -- 🧹 เก็บกวาด: ลบแถวขยะที่เกิดจากเคส (a) ทิ้งเสมอ ไม่ให้ค้างในตารางจริง
  if v_new_id is not null then
    delete from public.classroom_requests where id = v_new_id;
  end if;
  -- เผื่อเคยรันเวอร์ชันเก่าที่ยังไม่ได้ลบ → กวาดแถวทดสอบเก่าที่ค้างอยู่ให้หมดด้วย
  delete from public.classroom_requests where token = 'test-token-does-not-exist';

  -- (c) หมายเหตุ: ทดสอบ "ครูยกเลิกได้ไม่จำกัดเวลา" จริงจังทำจาก SQL Editor ไม่ได้
  --     (ไม่มี JWT จริง is_teacher_caller() จะเป็น false เสมอ) — ต้องให้ Lin ลองจากหน้าเว็บจริงแทน
  test_case := 'c) ครูข้ามด่าน (ข้อจำกัด)';
  result := 'ทดสอบจาก SQL Editor ไม่ได้จริง (ไม่มี JWT ครู) — ต้องลองจากหน้าเว็บตอนล็อกอินเป็นครูแทน';
  return next;
end; $$;

select * from public._test_cancel_guard();
drop function public._test_cancel_guard();
