-- ════════════════════════════════════════════════════════════════════════════
-- 2026-08-02_rpc_guards_merged.sql
-- 🆕 ไฟล์นี้คือ "ต้นฉบับล่าสุดไฟล์เดียว" ของ RPC ฝั่งนักเรียนทั้ง 3 ตัว
--    รวมของจาก 2 ไฟล์ที่เคยแยกกันแล้วทับกันเอง + อุดรูใหม่จากรอบตรวจ 2026-08-02
--
-- ⚠️ ทำไมต้องมีไฟล์นี้ (ปัญหาที่แก้):
--    ก่อนหน้านี้ `student_update_own_request` ถูกนิยามอยู่ **2 ไฟล์ ช่องรับค่าเท่ากันเป๊ะ 7 ช่อง**
--      · 2026-08-01_cancel_add_guards.sql  → มีด่าน "ล็อกบังคับ" + "cancel ห้ามพกข้อเสนอ"
--      · 2026-08-01_reschedule_guards.sql  → มีด่าน "ห้ามแก้เวลาตอนครูกำลังทำอยู่" (★★★)
--    **ไม่มีไฟล์ไหนมีครบทั้ง 3 ด่าน** → ใครรันทีหลังชนะ ของอีกไฟล์หายเงียบ ไม่มี error ให้เห็น
--    ไฟล์นี้ = ทั้ง 3 ด่านอยู่ครบในตัวเดียว รันทับได้เลยไม่ว่าตอนนี้ในฐานข้อมูลจะเป็นเวอร์ชันไหน
--
-- ✅ ปลอดภัยต่อการรัน: รันซ้ำได้ · ไม่ลบข้อมูล · ไม่ drop function
--    ช่องรับค่าของทั้ง 3 ฟังก์ชัน **เท่าเดิมทุกตัว** (9 / 7 / 3) → CREATE OR REPLACE เขียนทับได้
--    (บทเรียน 2026-07-30: เปลี่ยนจำนวนช่องรับค่าโดยไม่ drop ตัวเก่า = ฟังก์ชันซ้อน เว็บล่มทั้งระบบ)
--
-- ข้างในมี 5 อย่าง:
--   0) ตาราง cron_state + คอลัมน์ sla_reminder_last_sent_at  (ยกมาจาก cancel_add_guards ทั้งดุ้น
--      เผื่อไฟล์นั้นยังไม่เคยถูกรัน — รันซ้ำไม่มีผลข้างเคียง)
--   1) submit_class_request        — ★ ปิดรู "ไม่ส่งวันที่มา = ข้ามด่าน 24 ชม."
--   2) student_update_own_request  — ★ รวมครบ 3 ด่าน
--   3) respond_to_offer_as_student — ★ เพิ่มยามเฝ้าประตู (เดิมไม่มีเลยตัวเดียวในบรรดา RPC นักเรียน)
--   4) คำสั่งตรวจปิดท้าย            — ต้องได้ true ทุกช่อง
--
-- 🛑 หลังรันไฟล์นี้แล้ว **ห้ามรัน 2 ไฟล์นี้อีก** (จะย้อนของที่เพิ่งแก้):
--      supabase/sql/2026-08-01_reschedule_guards.sql
--      supabase/sql/2026-08-01_cancel_add_guards.sql   ← เฉพาะส่วนฟังก์ชัน (ส่วนตาราง/คอลัมน์รันซ้ำได้)
-- ════════════════════════════════════════════════════════════════════════════


-- ────────────────────────────────────────────────────────────────────────────
-- 0) ของพื้นฐานที่ Edge Function ต้องใช้ (ยกมาจาก 2026-08-01_cancel_add_guards.sql)
--    รันซ้ำได้ ไม่มีผลข้างเคียง — ใส่ไว้เผื่อไฟล์นั้นยังไม่เคยถูกรันจริง
-- ────────────────────────────────────────────────────────────────────────────
create table if not exists public.cron_state (
  key         text primary key,
  value       jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);
alter table public.cron_state enable row level security;
revoke all on public.cron_state from anon, authenticated;

alter table public.classroom_requests
  add column if not exists sla_reminder_last_sent_at timestamptz;

update public.classroom_requests
   set sla_reminder_last_sent_at = now()
 where sla_reminder_sent = true
   and sla_reminder_last_sent_at is null;


-- ════════════════════════════════════════════════════════════════════════════
-- 1) submit_class_request — ประตูทางเข้าเดียวของทุกคำขอ (9 ช่องรับค่าเท่าเดิม)
-- ════════════════════════════════════════════════════════════════════════════
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

  -- ══════════════════════════════════════════════════════════════════════════
  -- ★ แก้ 2026-08-02 (รอบตรวจ 3 ระบบ ข้อ 4.4) — ด่าน 24 ชม. เคยข้ามได้ด้วยการ "ไม่ส่งวันที่มา"
  --
  -- 🕳️ รูเดิม: บรรทัดเช็คเขียนว่า `if p_original_time is null then raise ...`
  --    = เช็คแค่ "เวลา" ไม่ได้เช็ค "วันที่"
  --    ส่ง p_original_date = null มา (แต่ส่งเวลามาครบ) → นิพจน์ (NULL + time) เป็น NULL
  --    → NULL < interval '24 hours' ได้ผลเป็น NULL → `if` ไม่ทำงาน → **ผ่านฉลุยไป insert**
  --    = ยกเลิกคาบที่เหลืออีก 1 ชั่วโมงก็ยังทำได้ ถ้ายิง API ตรงเข้ามา
  --
  -- ✅ ด่าน 6 ชม. ข้างล่างเช็คครบทั้งคู่มาตั้งแต่ต้น (`p_original_date is null or p_original_time is null`)
  --    ตรงนี้แค่ทำให้เหมือนกัน — ฝั่งเว็บส่งวันที่มาครบทุกจุดอยู่แล้ว จึงไม่มีอะไรพัง
  --    (requestCancelClass ส่ง targetDate เสมอ · teacherCancelClassNowInner เป็นครู ไม่โดนด่านนี้)
  -- ══════════════════════════════════════════════════════════════════════════
  if p_request_type = 'cancel' and not public.is_teacher_caller() then
    if p_original_date is null or p_original_time is null then
      raise exception 'missing original_time to validate the 24-hour cancellation window' using errcode = 'P0001';
    end if;
    if (p_original_date::timestamp + p_original_time::time) at time zone 'Asia/Bangkok' - now() < interval '24 hours' then
      raise exception 'students may only cancel a class 24+ hours in advance — please use reschedule instead (取消需在課堂開始前24小時，時間不夠請改用「申請改期」)' using errcode = 'P0001';
    end if;
  end if;

  -- ด่าน 2026-08-01 — "ขอเลื่อนคาบ" ต้องเหลืออย่างน้อย 6 ชั่วโมง (ของเดิม ไม่แตะ)
  -- ครู (is_teacher_caller() = true) ไม่ถูกแตะเลย · 'add_class' ไม่ถูกแตะเลย
  if p_request_type = 'reschedule' and not public.is_teacher_caller() then
    if p_original_date is null or p_original_time is null then
      raise exception 'missing original_time to validate the 6-hour reschedule window' using errcode = 'P0001';
    end if;
    if (p_original_date::timestamp + p_original_time::time) at time zone 'Asia/Bangkok' - now() < interval '6 hours' then
      raise exception 'students may only reschedule a class 6+ hours in advance (改期需在課堂開始前6小時，時間不夠請直接用 LINE 聯絡老師)' using errcode = 'P0001';
    end if;
  end if;

  insert into public.classroom_requests
    (token, student_name, request_type, original_date, original_time, requested_date, requested_time, note, initiated_by)
  values
    (p_token, p_student_name, p_request_type, p_original_date, p_original_time, p_requested_date, p_requested_time, p_note, p_initiated_by)
  returning id into new_id;
  return new_id;
end;
$function$;


-- ════════════════════════════════════════════════════════════════════════════
-- 2) student_update_own_request — นักเรียนแก้/ถอนคำขอของตัวเอง (7 ช่องรับค่าเท่าเดิม)
--    ★ รวมครบ 3 ด่าน ที่เคยกระจายอยู่คนละไฟล์:
--      ด่าน A (จาก cancel_add_guards)  = คำขอ 'cancel' ห้ามพกข้อเสนอเวลาใหม่
--      ด่าน B (จาก reschedule_guards)  = ห้ามแก้ "เวลาที่ขอ" ของคำขอ 'reschedule' ตอนครูกำลังทำอยู่
--      ด่าน C (จาก cancel_add_guards)  = ล็อกบังคับเสมอสำหรับคนที่ไม่ใช่ครู (ครอบ 'cancel'/'add_class' ด้วย)
--    ⚠️ ด่าน B กับ C ทำงานคนละชั้นโดยตั้งใจ ไม่ซ้ำซ้อนกัน:
--      C = "แก้อะไรก็ไม่ได้ ถ้าล็อกไม่ว่าง" (เงียบ — คืน 0 แถว)
--      B = "แก้เวลาของคำขอเลื่อนไม่ได้ ถ้าล็อกไม่ว่าง **หรือคำขอปิดไปแล้ว**" (ตอบเป็น error ให้แปลเป็นภาษาคนได้)
-- ════════════════════════════════════════════════════════════════════════════
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


-- ════════════════════════════════════════════════════════════════════════════
-- 3) respond_to_offer_as_student — นักเรียนกด "ตกลง / ไม่สะดวก" (3 ช่องรับค่าเท่าเดิม)
--    ★ เพิ่ม 2026-08-02 (รอบตรวจ 3 ระบบ ข้อ 4.9): ยามเฝ้าประตู
--      เดิมเป็น RPC ฝั่งนักเรียน "ตัวเดียว" ที่ไม่มี rate limit เลย ทั้งที่รับ uuid + token
--      → ไล่ยิงเดาได้ไม่จำกัดจำนวนครั้ง และไม่มีบันทึกว่ามีใครเดา
--      ใส่ชุดเดียวกับ student_update_own_request เป๊ะ (20 ครั้ง/60 วินาที ต่อ IP)
--    ⚠️ ห่อด้วย to_regprocedure เหมือน submit_class_request — ถ้าวันไหนฟังก์ชันยามหายไป
--       จะไม่ทำให้ระบบล่มทั้งระบบ แต่ **เขียน log ไว้** (ไม่ปิดตัวเองเงียบๆ)
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.respond_to_offer_as_student(p_request_id uuid, p_token text, p_response text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  affected int;
  rl_ok boolean := true;
begin
  if p_response not in ('accepted', 'declined') then
    raise exception 'invalid response';
  end if;

  -- ★ ยามเฝ้าประตู (เพิ่ม 2026-08-02)
  if not public.is_teacher_caller() then
    if to_regprocedure('public.slink_rl_check(text,int,int)') is not null then
      execute 'select public.slink_rl_check($1,$2,$3)' into rl_ok using 'respond_to_offer_as_student', 20, 60;
      if not rl_ok then
        raise exception 'too many requests' using errcode = 'P0001';
      end if;
    else
      raise warning '[respond_to_offer_as_student] ไม่พบฟังก์ชัน slink_rl_check — รอบนี้ไม่มียามเฝ้าประตู';
    end if;
    if to_regprocedure('public.slink_log_fail(text,text)') is not null
       and not exists (select 1 from public.classroom_students where token = p_token) then
      execute 'select public.slink_log_fail($1,$2)' using 'respond_to_offer_as_student', p_token;
    end if;
  end if;

  -- ด่าน 2026-08-01 (ของเดิม ไม่แตะ): ต้องเป็นเจ้าของ · ยังเป็น proposed · ยัง pending · ล็อกว่าง
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
-- 4) ตรวจปิดท้าย — ต้องได้ 3 แถว และช่องที่ขึ้นต้นด้วย "ต้องมี" ต้องเป็น true ทุกช่อง
-- ════════════════════════════════════════════════════════════════════════════
select
  p.proname                                                                              as ชื่อฟังก์ชัน,
  pg_get_function_identity_arguments(p.oid)                                              as ช่องรับค่า,
  -- student_update_own_request ต้องมีครบ 3 ด่าน
  position('is_teacher_caller() or c.processing_started_at is null' in p.prosrc) > 0      as ต้องมี_ด่านC_ล็อกบังคับ,
  position('cannot carry a reschedule offer' in p.prosrc) > 0                             as ต้องมี_ด่านA_cancelห้ามพกข้อเสนอ,
  position('reschedule request is locked or already closed' in p.prosrc) > 0              as ต้องมี_ด่านB_ห้ามแก้เวลาตอนครูทำอยู่,
  -- submit_class_request ต้องเช็ควันที่ด้วย ไม่ใช่แค่เวลา
  position('p_original_date is null or p_original_time is null' in p.prosrc) > 0          as ต้องมี_ด่าน24ชม_เช็ควันที่ด้วย,
  -- respond_to_offer_as_student ต้องมียามเฝ้าประตู
  position('respond_to_offer_as_student'', 20, 60' in p.prosrc) > 0                       as ต้องมี_ยามเฝ้าประตู
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('student_update_own_request', 'submit_class_request', 'respond_to_offer_as_student')
order by p.proname;

-- ✅ ต้องได้ผลแบบนี้เป๊ะ (3 แถว):
--   respond_to_offer_as_student  →  ต้องมี_ยามเฝ้าประตู = true
--   student_update_own_request   →  ต้องมี_ด่านC / ด่านA / ด่านB = true ทั้ง 3 ช่อง
--   submit_class_request         →  ต้องมี_ด่าน24ชม_เช็ควันที่ด้วย = true
-- ❌ ได้มากกว่า 3 แถว = มีฟังก์ชันซ้อนกัน ต้องลบตัวเกินก่อน ไม่งั้นเว็บพังทั้งระบบ
-- ❌ ช่องไหนที่ควรเป็น true แล้วได้ false = ไฟล์นี้ทำงานไม่ครบ อย่าเพิ่งใช้ ให้บอก Claude
