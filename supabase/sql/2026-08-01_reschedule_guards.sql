-- ════════════════════════════════════════════════════════════════════════════
-- 2026-08-01 — ด่านฝั่งฐานข้อมูลของ "ระบบขอเลื่อนคาบ" (จากการตรวจระบบทั้งระบบ 2026-07-31)
-- ════════════════════════════════════════════════════════════════════════════
--
-- ไฟล์นี้แก้ 3 ฟังก์ชัน — ทั้ง 3 ตัว "จำนวนช่องรับค่าเท่าเดิมเป๊ะ ไม่เพิ่มไม่ลด"
--   → CREATE OR REPLACE เขียนทับตัวเดิมได้จริง ไม่เกิดฟังก์ชันซ้อนกัน ไม่ต้อง drop อะไรเลย
--   (บทเรียน 2026-07-30: เพิ่ม/ลดช่องรับค่าแม้แต่ช่องเดียว = Postgres สร้างตัวใหม่เพิ่ม → เว็บพังทั้งระบบ)
--
-- ┌─ 1) submit_class_request (9 ช่อง) ───────────────────────────────────────┐
-- │ เพิ่มด่าน "ขอเลื่อนคาบต้องเหลือเวลาอย่างน้อย 6 ชั่วโมง"                    │
-- │ (กฎที่ Lin ตัดสินใจ 2026-08-01 · เทียบกับ "ยกเลิก" ที่เข้มกว่า = 24 ชม.)   │
-- │ ต้นฉบับที่คัดลอกมา: sql/2026-07-31_store_original_time_on_insert.sql       │
-- └──────────────────────────────────────────────────────────────────────────┘
-- ┌─ 2) student_update_own_request (7 ช่อง) ─────────────────────────────────┐
-- │ ด่าน 6 ชม.เดียวกัน แต่ตอน "แก้คำขอ" (กันเดินอ้อมด้วยการแก้วันทีหลัง)        │
-- │ ต้นฉบับที่คัดลอกมา: sql/2026-07-31_cancel_24h_guard_on_update.sql         │
-- │ ⚠️ ด่าน 24 ชม.ของ "ยกเลิก" ที่อยู่ในไฟล์นั้น ยังอยู่ครบทุกบรรทัด ไม่ถูกแตะ  │
-- └──────────────────────────────────────────────────────────────────────────┘
-- ┌─ 3) respond_to_offer_as_student (3 ช่อง) ────────────────────────────────┐
-- │ เดิมเช็คแค่ 3 อย่าง (id + token + offer_status='proposed') ขาดไป 2 อย่าง:  │
-- │   · ไม่เช็คว่าคำขอยังเปิดอยู่ (status='pending') → ตอบรับคำขอที่ปิดแล้วได้   │
-- │   · ไม่เช็คว่ามีคนกำลังจัดการอยู่ (processing_started_at)                  │
-- │     → นักเรียนกด "ตกลง/ไม่สะดวก" ตอนครูกำลังย้ายคาบอยู่ได้ (ช่องเดียวกับ    │
-- │       บั๊ก 收回 ที่แก้ไปฝั่งเว็บวันนี้ แต่คนละประตู)                        │
-- │ และไม่เคยเขียน offer_accepted_at เอง → เว็บต้องยิงเพิ่มอีกรอบ (เขียน 2 ครั้ง │
-- │   = มีจังหวะพังตรงกลาง) ตอนนี้ฟังก์ชันเขียนให้เองจบในคำสั่งเดียว            │
-- │ ต้นฉบับที่คัดลอกมา: ตัวจริงในฐานข้อมูล (Lin ดึงมาให้ 2026-07-31)           │
-- │   ⚠️ ฟังก์ชันนี้ไม่เคยมีไฟล์ต้นฉบับใน repo เลย — ไฟล์นี้คือต้นฉบับตัวแรก     │
-- └──────────────────────────────────────────────────────────────────────────┘
--
-- 🔗 ต้องแก้คู่กับฝั่งเว็บ (แก้ไปแล้วในรอบเดียวกัน — ถ้ารัน SQL นี้แต่ยังไม่ push เว็บ จะพัง):
--    classroom/index.html → submitClassRequest ต้องส่ง p_original_time มาด้วย
--    ไม่งั้นด่านใหม่จะตอบ 'missing original_time...' = นักเรียนขอเลื่อนไม่ได้เลยสักคน
--    ⚠️ ลำดับที่ปลอดภัย: push เว็บก่อน → แล้วค่อยรันไฟล์นี้
--       (เว็บใหม่ทำงานกับฐานข้อมูลเก่าได้ปกติ แต่เว็บเก่าทำงานกับฐานข้อมูลใหม่ไม่ได้)
--
-- ▶️ วิธีรัน: เปิดไฟล์นี้ → ⌘A → ⌘C → วางใน Supabase SQL Editor → Run (ทั้งไฟล์รวดเดียว)
--    ปลอดภัยที่จะรันซ้ำ · ส่วนตรวจสอบอยู่ท้ายไฟล์ (ต้องได้ true ทุกช่อง)
-- ════════════════════════════════════════════════════════════════════════════


-- ────────────────────────────────────────────────────────────────────────────
-- 1) submit_class_request — ด่าน 6 ชม.ตอน "ส่งคำขอเลื่อน"
--    เหมือนเดิมทุกบรรทัด + แทรกก้อนใหม่ 1 ก้อน (มีป้าย ★)
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
  -- ★ ด่านใหม่ 2026-08-01 — "ขอเลื่อนคาบ" ต้องเหลืออย่างน้อย 6 ชั่วโมง
  --
  -- รูเดิม: การขอเลื่อนไม่มีด่านเวลาเลยแม้แต่ชั้นเดียว ทั้งฝั่งเว็บและฝั่งฐานข้อมูล
  --   (ฟังก์ชันนี้เดิมเช็คแค่ 'cancel' เท่านั้น) → ตอน 3 ทุ่ม นักเรียนยังส่งคำขอเลื่อน
  --   "คาบ 9 โมงเช้าวันนี้ที่เรียนจบไปแล้ว" ได้ หรือคาบที่จะเริ่มอีก 10 นาที
  --
  -- ทำไมต้องอยู่ที่นี่ด้วย ทั้งที่หน้าเว็บก็กันแล้ว: ซ่อนปุ่มไม่ใช่การป้องกัน
  --   ใครก็ยิง API ตรงได้ (กฎเดียวกับที่ Lin สั่งไว้ตอนทำด่าน 24 ชม. เมื่อ 2026-07-30)
  --
  -- ครู (is_teacher_caller() = true) ไม่ถูกแตะเลย · 'add_class' ไม่ถูกแตะเลย
  -- ข้อความ error ตั้งใจให้มีคำว่า 'only reschedule' เพื่อให้ฝั่งเว็บ (friendlyRequestError)
  --   แยกออกจากด่าน 24 ชม.ได้ ไม่งั้นจะไปโดนกฎ 'hours in advance' ของยกเลิกแล้วแปลผิด
  -- ══════════════════════════════════════════════════════════════════════════
  if p_request_type = 'reschedule' and not public.is_teacher_caller() then
    if p_original_date is null or p_original_time is null then
      raise exception 'missing original_time to validate the 6-hour reschedule window' using errcode = 'P0001';
    end if;
    if (p_original_date::timestamp + p_original_time::time) at time zone 'Asia/Bangkok' - now() < interval '6 hours' then
      raise exception 'students may only reschedule a class 6+ hours in advance (改期需在課堂開始前6小時，時間不夠請直接用 LINE 聯絡老師)' using errcode = 'P0001';
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
-- 2) student_update_own_request — ด่าน 6 ชม.ตอน "แก้คำขอเลื่อน"
--    เหมือนไฟล์ 2026-07-31_cancel_24h_guard_on_update.sql ทุกบรรทัด
--    + ขยายก้อนด่านเดิมให้รู้จัก 'reschedule' ด้วย (ป้าย ★★ = ส่วนที่เพิ่มวันนี้)
-- ────────────────────────────────────────────────────────────────────────────
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
  v_req_type text;
  v_new_date date;
  v_new_time text;
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

  -- ══════════════════════════════════════════════════════════════════════════
  -- ด่าน 2026-07-31 (งาน C1) — ด่านเวลา ตอน "แก้คำขอ" ไม่ใช่แค่ตอน "ส่งคำขอ"
  --
  -- ทำงานเฉพาะเมื่อครบ 3 อย่างพร้อมกัน:
  --   (1) คนเรียกไม่ใช่ครู          → ครูไม่ถูกแตะเลย
  --   (2) กำลังแก้ original_date หรือ original_time → คือกำลังเปลี่ยน "คาบเป้าหมาย"
  --   (3) ชนิดคำขอเป็น 'cancel' (24 ชม.) หรือ ★★ 'reschedule' (6 ชม. — เพิ่ม 2026-08-01)
  --       'add_class' ไม่ถูกแตะเลยแม้แต่นิดเดียว
  -- ══════════════════════════════════════════════════════════════════════════
  if not public.is_teacher_caller()
     and (p_patch ? 'original_date' or p_patch ? 'original_time') then

    select c.request_type,
           case when p_patch ? 'original_date'
                then (nullif(p_patch ->> 'original_date', ''))::date
                else c.original_date end,
           case when p_patch ? 'original_time'
                then nullif(p_patch ->> 'original_time', '')
                else c.original_time end
      into v_req_type, v_new_date, v_new_time
    from public.classroom_requests c
    where c.id = p_id and c.token = p_token;

    -- หาแถวไม่เจอ (token/id ไม่ตรง) → v_req_type เป็น null → ปล่อยผ่านด่านนี้
    -- แล้วคำสั่ง update ข้างล่างจะแก้ได้ 0 แถวเอง เหมือนพฤติกรรมเดิมทุกอย่าง
    if v_req_type = 'cancel' then
      if v_new_date is null or v_new_time is null then
        raise exception 'missing original_time to validate the 24-hour cancellation window'
          using errcode = 'P0001';
      end if;
      if (v_new_date::timestamp + v_new_time::time) at time zone 'Asia/Bangkok' - now()
         < interval '24 hours' then
        raise exception 'students may only cancel a class 24+ hours in advance — please use reschedule instead (取消需在課堂開始前24小時，時間不夠請改用「申請改期」)'
          using errcode = 'P0001';
      end if;

    -- ★★ เพิ่ม 2026-08-01 — คำขอเลื่อนคาบ ใช้เกณฑ์ 6 ชั่วโมง (ตรงกับด่านตอนส่งคำขอ)
    elsif v_req_type = 'reschedule' then
      if v_new_date is null or v_new_time is null then
        raise exception 'missing original_time to validate the 6-hour reschedule window'
          using errcode = 'P0001';
      end if;
      if (v_new_date::timestamp + v_new_time::time) at time zone 'Asia/Bangkok' - now()
         < interval '6 hours' then
        raise exception 'students may only reschedule a class 6+ hours in advance (改期需在課堂開始前6小時，時間不夠請直接用 LINE 聯絡老師)'
          using errcode = 'P0001';
      end if;
    end if;
  end if;
  -- ══════════════════════ จบด่าน ตั้งแต่บรรทัดล่างเหมือนเดิมทุกตัวอักษร ══════════════════════

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


-- ────────────────────────────────────────────────────────────────────────────
-- 3) respond_to_offer_as_student — เพิ่มด่านที่ขาดไป 2 อย่าง + เขียน offer_accepted_at เอง
--    ช่องรับค่าเท่าเดิม 3 ช่อง (p_request_id uuid, p_token text, p_response text)
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.respond_to_offer_as_student(p_request_id uuid, p_token text, p_response text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  affected int;
begin
  if p_response not in ('accepted', 'declined') then
    raise exception 'invalid response';
  end if;

  -- ══════════════════════════════════════════════════════════════════════════
  -- ★ 2026-08-01 — เพิ่มเงื่อนไข 2 ข้อ และเขียนเวลาที่ตอบรับให้เองในคำสั่งเดียว
  --
  --   and status = 'pending'
  --     → เดิมไม่มี = ตอบรับคำขอที่ "ปิดไปแล้ว" ได้ (ครูปิดไปแล้ว/ถอนไปแล้ว ก็ยังพลิกได้)
  --
  --   and processing_started_at is null
  --     → เดิมไม่มี = นักเรียนกด "ตกลง/ไม่สะดวก" ได้ตอนที่ครูกำลังคุยกับ Google Calendar อยู่
  --       (ป้าย processing_started_at คือป้าย "มีคนกำลังทำอยู่" ที่ทั้งเว็บและ LINE ใช้ร่วมกัน)
  --       เป็นรูแบบเดียวกับที่แก้ฝั่ง 收回申請 ในเว็บวันนี้ แต่คนละประตู
  --
  --   offer_accepted_at / sla_reminder_sent
  --     → เดิมฟังก์ชันไม่เขียนให้ ฝั่งเว็บต้องยิงคำสั่งที่ 2 ตามมาเก็บกวาด
  --       (เขียน 2 ครั้ง = มีจังหวะพังตรงกลาง แล้วตัวเตือน 48 ชม.จะไม่ทำงาน)
  --       ตอนนี้เขียนจบในคำสั่งเดียว · ฝั่งเว็บยังยิงซ้ำได้ ไม่พัง (ค่าเดิมทับด้วยค่าเดิม)
  -- ══════════════════════════════════════════════════════════════════════════
  update public.classroom_requests
    set offer_status      = p_response,
        offer_accepted_at = case when p_response = 'accepted' then now() else offer_accepted_at end,
        sla_reminder_sent = false
    where id = p_request_id
      and token = p_token
      and offer_status = 'proposed'
      and status = 'pending'
      and processing_started_at is null;
  get diagnostics affected = row_count;
  return affected > 0;
end;
$function$;


-- ════════════════════════════════════════════════════════════════════════════
-- ส่วนตรวจสอบ — ต้องได้ 3 แถว และช่องที่ขึ้นต้นด้วย "ต้องมี" ต้องเป็น true ทุกช่อง
-- ถ้ามีช่องไหนเป็น false = ไฟล์ไม่ได้ทำงานครบ อย่าเพิ่งใช้งาน ให้บอก Claude
-- ════════════════════════════════════════════════════════════════════════════
select p.proname                                                        as ฟังก์ชัน,
       pg_get_function_identity_arguments(p.oid)                        as ช่องรับค่า,
       (pg_get_functiondef(p.oid) like '%only reschedule%')             as ต้องมี_ด่าน6ชม,
       (pg_get_functiondef(p.oid) like '%24+ hours%')                   as ต้องมี_ด่าน24ชมของเดิม,
       (pg_get_functiondef(p.oid) like '%slink_rl_check%')              as ต้องมี_ยามเฝ้าประตูของเดิม
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in ('submit_class_request', 'student_update_own_request')
order by p.proname;

select p.proname                                                        as ฟังก์ชัน,
       pg_get_function_identity_arguments(p.oid)                        as ช่องรับค่า,
       (pg_get_functiondef(p.oid) like '%processing_started_at is null%') as ต้องมี_ด่านกันชนกับครู,
       (pg_get_functiondef(p.oid) like '%status = ''pending''%')          as ต้องมี_ด่านคำขอต้องยังเปิดอยู่,
       (pg_get_functiondef(p.oid) like '%offer_accepted_at%')             as ต้องมี_เขียนเวลาตอบรับเอง
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'respond_to_offer_as_student';

-- ⚠️ เช็คสำคัญที่สุด: ทั้ง 3 ตัวต้องมี "ตัวเดียว" เท่านั้น (ถ้าเห็นชื่อซ้ำ 2 แถว = ฟังก์ชันซ้อนกัน เว็บจะพัง)
select p.proname as ฟังก์ชัน, count(*) as จำนวนตัวที่มีอยู่
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('submit_class_request', 'student_update_own_request', 'respond_to_offer_as_student')
group by p.proname
order by p.proname;
