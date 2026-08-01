-- ════════════════════════════════════════════════════════════════════════════
-- 2026-08-01_cancel_add_guards.sql
-- อุดช่องโหว่จากรายงานตรวจระบบ "ยกเลิกคาบ (取消) + เพิ่มคาบ (加課)" วันที่ 2026-08-01
--
-- ✅ ไฟล์นี้ปลอดภัยต่อการรัน — รันซ้ำได้ ไม่มีการลบข้อมูล ไม่มีการ drop function
--    ฟังก์ชันเดียวที่แตะคือ student_update_own_request และ **ช่องรับค่าเท่าเดิมเป๊ะ 7 ช่อง**
--    (บทเรียน 2026-07-30: เปลี่ยนจำนวนช่องรับค่าโดยไม่ drop ตัวเก่า = ฟังก์ชันซ้อนกัน เว็บล่มทั้งระบบ)
--
-- ข้างในมี 4 อย่าง:
--   1) ตาราง cron_state           — ที่จดสถานะของงานอัตโนมัติ (แก้ข้อ 4: กับดัก cron ซิงค์ปฏิทิน)
--   2) คอลัมน์ sla_reminder_last_sent_at — ให้ตัวเตือน 48 ชม.เตือนซ้ำได้จริง (แก้ข้อ 6)
--   3) student_update_own_request  — บังคับด่านล็อกเสมอ (ข้อ 9) + คำขอยกเลิกห้ามพกข้อเสนอเวลา (ข้อ 13)
--   4) คำสั่งตรวจปิดท้าย           — รันแล้วต้องได้ผลตามที่เขียนไว้ทุกข้อ
--
-- ⚠️ โค้ดฝั่ง Edge Function ถูกเขียนให้ "ถอยกลับไปทำงานแบบเดิมอัตโนมัติ" ถ้ายังไม่ได้รันไฟล์นี้
--    (ไม่พัง แค่ยังไม่ได้ของใหม่) → รันไฟล์นี้ก่อน deploy หรือหลัง deploy ก็ได้ ไม่มีช่วงที่ระบบล่ม
-- ════════════════════════════════════════════════════════════════════════════


-- ────────────────────────────────────────────────────────────────────────────
-- 1) ตาราง cron_state — ที่จดสถานะข้ามรอบของงานอัตโนมัติ
--    ใช้แก้ข้อ 4: cron ซิงค์ปฏิทิน เจอ "คาบหายเยอะผิดปกติ" แล้วข้ามทั้งรอบ + เตือน LINE ทุกรอบ
--    → ไม่เก็บกวาดเลย ทำให้รอบหน้าเจอเหมือนเดิม = ติดกับดักตัวเองถาวร + LINE เตือนซ้ำ ~72 ครั้ง/วัน
--    ตอนนี้ cron จดว่า "เจอติดกันกี่รอบแล้ว" ครบ 3 รอบ (~40 นาที) = ยอมรับว่าคาบหายจริง ทำงานต่อ
-- ────────────────────────────────────────────────────────────────────────────
create table if not exists public.cron_state (
  key         text primary key,
  value       jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

-- ปิดตายจากฝั่งเว็บ: เปิด RLS แล้วไม่สร้าง policy สักอัน = anon/authenticated แตะไม่ได้เลย
-- (Edge Function ใช้ service_role ซึ่งข้าม RLS อยู่แล้ว จึงทำงานได้ตามปกติ)
-- ไม่มีข้อมูลนักเรียนอยู่ในตารางนี้ แต่ยึดหลัก "ปิดก่อนเสมอ" ตามกฎความปลอดภัยข้อ 1
alter table public.cron_state enable row level security;
revoke all on public.cron_state from anon, authenticated;


-- ────────────────────────────────────────────────────────────────────────────
-- 2) คอลัมน์ sla_reminder_last_sent_at — แก้ข้อ 6
--    เดิมใช้ธง true/false อย่างเดียว → ปั๊ม true ครั้งเดียวแล้วไม่มีใครรีเซ็ตกลับ
--    = คำขอ 取消/加課 ถูกเตือน "ครั้งเดียวตลอดกาล" ทั้งที่คอมเมนต์เขียนว่าเตือนทุก 48 ชม.
--    ตอนนี้จดเวลาไว้ด้วย ครบ 48 ชม.เมื่อไหร่ ตัวเตือนจะหยิบขึ้นมาเตือนใหม่ได้
-- ────────────────────────────────────────────────────────────────────────────
alter table public.classroom_requests
  add column if not exists sla_reminder_last_sent_at timestamptz;

-- แถวที่เคยถูกเตือนไปแล้วก่อนมีคอลัมน์นี้: ตั้งนาฬิกาให้เริ่มนับ "จากตอนนี้"
-- (ไม่ตั้ง = ค่าว่าง = ไม่เข้าเงื่อนไข ไม่มีวันถูกเตือนอีก · ตั้งเป็นเวลาเก่า = โดนเตือนรัวทันทีที่ deploy)
update public.classroom_requests
   set sla_reminder_last_sent_at = now()
 where sla_reminder_sent = true
   and sla_reminder_last_sent_at is null;


-- ────────────────────────────────────────────────────────────────────────────
-- 3) student_update_own_request — คัดลอกจากต้นฉบับล่าสุด
--    (sql/2026-08-01_reschedule_guards.sql บรรทัด 153) แล้วเพิ่ม 2 ด่าน (ป้าย ★ = ของใหม่วันนี้)
--    ของเดิมทุกบรรทัดอยู่ครบ: ยามเฝ้าประตู 20 ครั้ง/60 วิ · ด่าน 24 ชม. (ยกเลิก) · ด่าน 6 ชม. (เลื่อน)
--    · ค่า offer_status ที่อนุญาต ('proposed'/'declined'/ว่าง) · รายชื่อคอลัมน์ที่แก้ได้
--    ⚠️ ช่องรับค่า 7 ช่องเท่าเดิม → CREATE OR REPLACE เขียนทับตัวเดิมได้เลย ไม่เกิดฟังก์ชันซ้อน
--    ⚠️ CREATE OR REPLACE ไม่ล้างสิทธิ์ (grant) ที่ให้ไว้เดิม — ไม่ต้อง grant ใหม่
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
  v_req_type_chk text;   -- ★ 2026-08-01 (ข้อ 13) แยกตัวแปรจาก v_req_type เดิม กันไปทับค่าของด่าน 24/6 ชม.
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
  -- ★ 2026-08-01 (ตรวจระบบยกเลิก/เพิ่มคาบ ข้อ 13) — คำขอ "ยกเลิก" ห้ามพกข้อเสนอเวลาใหม่
  --   พังยังไงถ้าไม่มีด่านนี้:
  --     ฟังก์ชันนี้ยอมให้ตั้ง offer_status='proposed' + proposed_options กับคำขอ "ชนิดไหนก็ได้" ของตัวเอง
  --     พอคำขอ "ยกเลิก" มี offer_status='proposed' การ์ดในคิวครูจะตกไปกิ่งของระบบเลื่อนคาบ ซึ่ง:
  --       (1) เดิมซ่อนปุ่มปิดสำหรับคำขอยกเลิก = คำขอนั้นค้าง pending ถาวร ไม่มีปุ่มไหนปิดได้เลย
  --       (2) ปุ่ม ✅ ที่เหลือคือ "ย้ายคาบไปเวลาที่นักเรียนเขียนใส่มาเอง" โดยไม่ผ่านด่าน 6 ชม.
  --           เพราะชนิดคำขอยังเป็น 'cancel' อยู่ = ช่องโหว่ให้ย้ายคาบได้ตามใจ
  --   (ฝั่งเว็บแก้ให้ปุ่มปิดโผล่เสมอแล้วเป็นด่านที่ 2 — ตรงนี้คือด่านที่ 1 ปิดต้นทาง)
  --   ⚠️ ตั้ง offer_status เป็นค่าว่าง/null ยัง "อนุญาต" อยู่ เพราะเป็นการล้างของเก่าที่ค้างอยู่ ไม่ใช่การสร้างใหม่
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
    -- ★ 2026-08-01 (ตรวจระบบยกเลิก/เพิ่มคาบ ข้อ 9) — ด่านล็อกต้อง "บังคับเสมอ" ไม่ใช่ให้ผู้เรียกเลือกเปิด/ปิด
    --   ของเดิม: and (not p_require_not_processing or c.processing_started_at is null)
    --   = ด่านทำงานก็ต่อเมื่อ "คนเรียก" ส่ง p_require_not_processing = true มาเท่านั้น
    --   ซึ่งค่านั้นมาจากหน้าเว็บ และฟังก์ชันนี้เปิดให้ anon เรียกได้ (กุญแจ anon อยู่ในหน้าเว็บ ใครก็เห็น)
    --   → ยิงเข้า API ตรงๆ ส่ง false มา = ด่านหายไปทั้งด่าน แม้ครูจะจับล็อกแล้วก็ตาม
    --   ผลจริง: ครูกำลังลบคาบอยู่ นักเรียนถอนคำขอสำเร็จ เห็นว่า "คาบไม่ถูกยกเลิก" แต่คาบถูกลบไปแล้ว
    --           = นักเรียนไม่มาเรียนโดยเชื่อว่ายังมีคาบ
    --   ตอนนี้: ไม่ใช่ครู = ล็อกต้องว่างเสมอ ไม่มีทางปิดด่านนี้จากฝั่งผู้เรียกอีกแล้ว
    --   ⚠️ ยังเก็บช่องรับค่า p_require_not_processing ไว้ (7 ช่องเท่าเดิม = ไม่ต้อง drop function)
    --      ตรวจผู้เรียกทุกจุดในเว็บแล้ว: ไม่มีจุดไหนแก้คำขอตอนที่ล็อกถูกจับไว้อย่างถูกต้อง จึงไม่มีอะไรพัง
    and (public.is_teacher_caller() or c.processing_started_at is null)
    and (p_require_null_column is null
         or (p_require_null_column = 'teacher_cancel_ack_at' and c.teacher_cancel_ack_at is null)
         or (p_require_null_column = 'teacher_add_ack_at'    and c.teacher_add_ack_at    is null))
  returning c.*;
end;
$function$;

-- ════════════════════════════════════════════════════════════════════════════
-- 4) ตรวจปิดท้าย — รันทีละก้อน แล้วเทียบกับ "ต้องได้อะไร" ที่เขียนไว้
-- ════════════════════════════════════════════════════════════════════════════

-- ตรวจ 1: ฟังก์ชันต้องมี "ตัวเดียว" เท่านั้น (ได้ 2 แถวขึ้นไป = ซ้อนกัน เว็บจะพัง ต้องลบตัวเกินก่อน)
select p.proname as ชื่อฟังก์ชัน,
       pg_get_function_identity_arguments(p.oid) as ช่องรับค่า
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('student_update_own_request', 'submit_class_request', 'respond_to_offer_as_student');
-- ✅ ต้องได้ 3 แถวพอดี (ชื่อละ 1 แถว)

-- ตรวจ 2: ด่านใหม่ 2 อันอยู่ในตัวฟังก์ชันจริง
select
  position('is_teacher_caller() or c.processing_started_at is null' in prosrc) > 0  as ด่านล็อกบังคับแล้ว,
  position('cancel requests cannot carry a reschedule offer'        in prosrc) > 0  as ด่านคำขอยกเลิกแล้ว,
  position('slink_rl_check'                                          in prosrc) > 0 as ยามเฝ้าประตูยังอยู่,
  position('24-hour cancellation window'                             in prosrc) > 0 as ด่าน24ชม_ยังอยู่,
  position('6-hour reschedule window'                                in prosrc) > 0 as ด่าน6ชม_ยังอยู่,
  position('''declined'''                                            in prosrc) > 0 as ค่าdeclined_ยังอยู่
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'student_update_own_request';
-- ✅ ต้องเป็น true ทั้ง 6 ช่อง (3 ช่องท้าย = พิสูจน์ว่าไม่ได้ทำของเดิมหายไป)

-- ตรวจ 3: ตารางกับคอลัมน์ใหม่มีจริง
select to_regclass('public.cron_state') is not null as มีตาราง_cron_state;
-- ✅ ต้องได้ true

select count(*) as มีคอลัมน์เวลาเตือน
from information_schema.columns
where table_schema = 'public' and table_name = 'classroom_requests'
  and column_name = 'sla_reminder_last_sent_at';
-- ✅ ต้องได้ 1

-- ตรวจ 4: สิทธิ์เรียกฟังก์ชันยังอยู่ครบ (CREATE OR REPLACE ไม่ควรทำให้หาย — ยืนยันอีกที)
select grantee as ใครเรียกได้
from information_schema.role_routine_grants
where specific_schema = 'public' and routine_name = 'student_update_own_request';
-- ✅ ต้องเห็น anon (และ/หรือ authenticated) อยู่ในผลลัพธ์ · ไม่เห็นเลย = หน้านักเรียนจะพัง ต้อง grant คืน
