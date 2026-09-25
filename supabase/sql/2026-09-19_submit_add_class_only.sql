-- SOURCE ONLY. Apply to Production only after a fresh exact approval and precheck.
-- Current owner for submit_class_request(text,text,text,date,date,text,text,text,text).
-- Historical rows remain; add_class retains the existing token, rate-limit, and teacher checks.
begin;

do $precheck$
begin
  if exists (select 1 from public.classroom_requests
             where status = 'pending' and request_type in ('cancel', 'reschedule')) then
    raise exception 'retired classroom requests are still pending';
  end if;
end
$precheck$;

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

  -- Classroom cancel/reschedule requests are retired; add-class stays available.
  if p_request_type is distinct from 'add_class' then
    raise exception 'classroom request type retired' using errcode = 'P0001';
  end if;
  if p_initiated_by not in ('student', 'teacher') then
    raise exception 'invalid initiated_by';
  end if;

  if p_initiated_by = 'teacher' and not public.is_teacher_caller() then
    raise exception 'only the teacher can create a teacher-initiated request (老師登入已過期或不是老師帳號，請重新登入再試)'
      using errcode = 'P0001';
  end if;

  insert into public.classroom_requests
    (token, student_name, request_type, original_date, original_time, requested_date, requested_time, note, initiated_by)
  values
    (p_token, p_student_name, p_request_type, p_original_date, p_original_time, p_requested_date, p_requested_time, p_note, p_initiated_by)
  returning id into new_id;
  return new_id;
end;
$function$;


-- Preserve the existing add-class update path; historical cancel/reschedule rows cannot be changed.
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
  v_req_type_chk text;
  v_new_date date;
  v_new_time text;
begin
  -- ยามเฝ้าประตู (Lin 2026-07-26) — ยิงเกิน 20 ครั้ง/60 วิ ต่อ IP = บล็อก (กันไล่เดา token)
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

  -- ══════════════════════════════════════════════════════════════════════════
  -- ด่าน A (ยกมาจาก 2026-08-01_cancel_add_guards.sql — เคยหายไปตอนรันไฟล์ reschedule ทับ)
  -- คำขอ "ยกเลิก" ห้ามพกข้อเสนอเวลาใหม่
  --   ถ้าคำขอ cancel มี offer_status='proposed' การ์ดในคิวครูจะไหลไปกิ่งของระบบเลื่อนคาบ
  --   แล้วปุ่ม ✅ จะกลายเป็น "ย้ายคาบไปเวลาที่นักเรียนเขียนใส่มาเอง" โดยไม่ผ่านด่าน 6 ชม.
  --   ⚠️ ตั้งเป็นค่าว่าง/null ยัง "อนุญาต" อยู่ เพราะเป็นการล้างของเก่าที่ค้าง ไม่ใช่การสร้างใหม่
  -- ══════════════════════════════════════════════════════════════════════════
  if (p_patch ? 'proposed_options' and jsonb_typeof(p_patch -> 'proposed_options') <> 'null')
     or (p_patch ? 'offer_status' and coalesce(p_patch ->> 'offer_status', '') <> '') then
    select c.request_type into v_req_type_chk
    from public.classroom_requests c
    where c.id = p_id and c.token = p_token;
    if v_req_type_chk = 'cancel' then
      raise exception 'cancel requests cannot carry a reschedule offer (取消申請不能夾帶改期提議)'
        using errcode = 'P0001';
    end if;
  end if;

  if p_require_null_column is not null
     and p_require_null_column not in ('teacher_cancel_ack_at', 'teacher_add_ack_at') then
    raise exception 'invalid require_null_column';
  end if;

  -- ══════════════════════════════════════════════════════════════════════════
  -- ด่าน 2026-07-31 (งาน C1) — ด่านเวลา ตอน "แก้คำขอ" ไม่ใช่แค่ตอน "ส่งคำขอ"
  --   ทำงานเมื่อครบ 3 อย่าง: ไม่ใช่ครู + กำลังแก้ original_date/original_time + ชนิดเป็น cancel/reschedule
  --   'add_class' ไม่ถูกแตะเลย
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

  -- ══════════════════════════════════════════════════════════════════════════
  -- ด่าน B (ยกมาจาก 2026-08-01_reschedule_guards.sql ★★★ รอบ 2)
  -- ห้ามแก้ "เวลาที่ขอ" ของคำขอชนิด reschedule ตอนครูกำลังจัดการอยู่ หรือคำขอปิดไปแล้ว
  --   ต่างจากด่าน C ตรงที่ตัวนี้ตอบเป็น error (ฝั่งเว็บแปลเป็นภาษาคนได้ผ่าน friendlyRequestError)
  --   ส่วนด่าน C จะเงียบ (คืน 0 แถว) ซึ่งอ่านไม่ออกว่าเพราะอะไร
  -- ══════════════════════════════════════════════════════════════════════════
  if not public.is_teacher_caller()
     and (p_patch ? 'requested_date' or p_patch ? 'requested_time' or p_patch ? 'proposed_options')
     and exists (
       select 1 from public.classroom_requests c
       where c.id = p_id and c.token = p_token and c.request_type = 'reschedule'
     )
     and not exists (
       select 1 from public.classroom_requests c
       where c.id = p_id and c.token = p_token
         and c.status = 'pending'
         and c.processing_started_at is null
     ) then
    raise exception 'reschedule request is locked or already closed — the requested time cannot be changed now (老師正在處理這筆申請，或這筆已經處理完了，沒辦法再改時間)'
      using errcode = 'P0001';
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
    and c.request_type = 'add_class'
    and (p_require_status       is null or c.status       = p_require_status)
    and (p_require_offer_status is null or c.offer_status = p_require_offer_status)
    -- ══════════════════════════════════════════════════════════════════════
    -- ด่าน C (ยกมาจาก 2026-08-01_cancel_add_guards.sql — เคยหายไปตอนรันไฟล์ reschedule ทับ)
    -- ล็อกต้อง "บังคับเสมอ" ไม่ใช่ให้ผู้เรียกเลือกเปิด/ปิด
    --   ของเดิม: and (not p_require_not_processing or c.processing_started_at is null)
    --   = ด่านทำงานก็ต่อเมื่อ "คนเรียก" ส่ง p_require_not_processing = true มาเท่านั้น
    --   ฟังก์ชันนี้เปิดให้ anon เรียกได้ (กุญแจ anon อยู่ในหน้าเว็บ ใครก็เห็น) → ยิงตรงโดยไม่ส่งธง = ด่านหาย
    --   ผลจริง: ครูกำลังลบคาบอยู่ นักเรียนถอนคำขอสำเร็จ เห็นว่า "คาบไม่ถูกยกเลิก" แต่คาบถูกลบไปแล้ว
    --   ⚠️ ยังเก็บช่องรับค่า p_require_not_processing ไว้ (7 ช่องเท่าเดิม = ไม่ต้อง drop function)
    -- ══════════════════════════════════════════════════════════════════════
    and (public.is_teacher_caller() or c.processing_started_at is null)
    and (p_require_null_column is null
         or (p_require_null_column = 'teacher_cancel_ack_at' and c.teacher_cancel_ack_at is null)
         or (p_require_null_column = 'teacher_add_ack_at'    and c.teacher_add_ack_at    is null))
  returning c.*;
end;
$function$;

-- The historical offer-response RPC remains callable for old clients but cannot mutate a request.
CREATE OR REPLACE FUNCTION public.respond_to_offer_as_student(p_request_id uuid, p_token text, p_response text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  return false;
end;
$function$;

commit;

-- Recovery requires Lin's separate Production approval: restore the prior
-- submit_class_request definition from sql/2026-08-02_rpc_guards_merged.sql
-- after checking current schema, historical rows and newer source changes.
