-- 2026-07-20 加：ให้นักเรียนที่ "ไม่ได้ผูก LINE" ก็ปฏิเสธเวลาที่ครูเสนอ (➕ 老師想幫你加一堂課) ได้จากเว็บ
--
-- ปัญหาที่เจอ (Lin ถาม "ตอนนี้เพิ่มคาบยังมีปัญหาอะไรอีก" แล้วเช็คโค้ดจริงพบ):
--   ปุ่ม "婉拒" ตอนนี้มีแค่ฝั่ง LINE (action=decline_add_class ใน line-webhook)
--   นักเรียนที่ยังไม่ผูก LINE เปิดหน้าเว็บ (loadTeacherAddAckBanner) เห็นแค่ปุ่ม "我知道了" ปุ่มเดียว
--   ไม่มีทางบอกปฏิเสธเวลาที่ครูเสนอได้เลยจากเว็บ
--
-- ทางแก้: เพิ่มปุ่ม "婉拒" บนเว็บ เรียก studentPatchRequest ตั้ง
--   { status:'acknowledged', offer_status:'declined' } — เหมือนกับที่ decline_add_class ทำในไลน์ทุกอย่าง
--   แต่ฟังก์ชัน student_update_own_request (2026-07-19) เดิมล็อกไว้ว่า offer_status ตั้งได้แค่
--   '' หรือ 'proposed' เท่านั้น (ชั้น 3 ในไฟล์ 2026-07-19_student_request_rpcs.sql) —
--   นักเรียนตั้งเป็น 'declined' ผ่าน RPC นี้ไม่ได้ ต้องแก้ whitelist เพิ่ม 'declined' เข้าไป
--
-- ความปลอดภัยไม่เปลี่ยน: ยังคงบังคับ token ตรงกับเจ้าของแถวเหมือนเดิม (ชั้น 1)
--   นักเรียนแก้ได้แค่แถวของตัวเอง แค่ค่า offer_status ที่ตั้งได้เพิ่มมาอีก 1 ค่า
--   (เดิมนักเรียนก็ทำให้ requestนี้จบสถานะ "declined" ได้อยู่แล้วผ่าน respond_to_offer_as_student
--   RPC คนละตัว ใช้กับ reschedule offer — อันนี้แค่เปิดทางเดียวกันให้ใช้กับ add_class ที่ครูเสนอด้วย)
--
-- วิธีรัน: copy ทั้งไฟล์นี้ไปวางใน Supabase Dashboard → SQL Editor → Run
-- (create or replace ทับของเดิม ไม่กระทบ grant ที่ตั้งไว้แล้ว เพราะ signature ฟังก์ชันเหมือนเดิมทุกตัว)

create or replace function public.student_update_own_request(
  p_token                  text,
  p_id                     uuid,
  p_patch                  jsonb,
  p_require_status         text    default null,   -- เช่น 'pending'
  p_require_offer_status   text    default null,   -- เช่น 'proposed'
  p_require_not_processing boolean default false,  -- true = ครูต้องยังไม่จับล็อก
  p_require_null_column    text    default null    -- 'teacher_cancel_ack_at' | 'teacher_add_ack_at'
)
returns setof public.classroom_requests
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_allowed constant text[] := array[
    'calendar_event_id', 'original_time', 'original_date',
    'requested_date', 'requested_time', 'proposed_options',
    'offer_created_at', 'offer_accepted_at', 'sla_reminder_sent',
    'teacher_cancel_ack_at', 'teacher_add_ack_at',
    'status', 'offer_status'
  ];
  v_bad text[];
begin
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
  -- 2026-07-20 改：เดิม allow แค่ ('', 'proposed') เพิ่ม 'declined' เข้าไป
  -- ให้ปุ่ม "婉拒" บนเว็บ (ตอนนักเรียนยังไม่ได้ผูก LINE) ใช้ path เดียวกันนี้ได้
  if p_patch ? 'offer_status' and coalesce(p_patch ->> 'offer_status', '') not in ('', 'proposed', 'declined') then
    raise exception 'student may only set offer_status to proposed, declined, or null';
  end if;
  if p_require_null_column is not null
     and p_require_null_column not in ('teacher_cancel_ack_at', 'teacher_add_ack_at') then
    raise exception 'invalid require_null_column';
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
    and (not p_require_not_processing or c.processing_started_at is null)
    and (p_require_null_column is null
         or (p_require_null_column = 'teacher_cancel_ack_at' and c.teacher_cancel_ack_at is null)
         or (p_require_null_column = 'teacher_add_ack_at'    and c.teacher_add_ack_at    is null))
  returning c.*;
end;
$function$;

-- ตรวจว่าติดตั้งสำเร็จ
select p.proname, p.prosecdef as security_definer
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'student_update_own_request';
