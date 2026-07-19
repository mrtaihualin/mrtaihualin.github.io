-- ════════════════════════════════════════════════════════════════════════════
-- 2026-07-19 — แก้บั๊ก "คำขอยกเลิกของนักเรียนไม่มี calendar_event_id"
--   + บั๊กเงียบอีก 14 จุดที่มาจากสาเหตุเดียวกัน
--
-- ปัญหา:
--   ตาราง classroom_requests เปิด RLS ไว้ และมีแค่ 3 ด่าน (INSERT/SELECT/UPDATE)
--   ซึ่ง "ทุกด่านบังคับว่าต้องเป็นอีเมลครู" → role `anon` (นักเรียน ที่มีแค่ token
--   บน URL ไม่ได้ล็อกอิน Supabase จริง) แตะตารางนี้ตรงๆ ไม่ได้เลย
--
--   จุดพังที่โหดที่สุด: UPDATE ที่โดน RLS บล็อก **ไม่คืน error** — มันแค่แก้ 0 แถว
--   เงียบๆ (PostgREST คืน error = null) → โค้ดฝั่งเว็บที่เช็คแค่ `if (res.error)`
--   เลยคิดว่าสำเร็จตลอด ทั้งที่ไม่มีอะไรถูกบันทึกเลย
--   ตรงกับกฎใน CLAUDE.md: "ตั้งด่าน RLS ต้องคิดครบ 4 อย่างพร้อมกัน"
--
-- ทางแก้ที่เลือก (และทางที่ "ไม่" เลือก):
--   ✅ เลือก: สร้าง RPC แบบ SECURITY DEFINER ให้นักเรียนเรียก — ฟังก์ชันข้าม RLS
--      ได้อย่างปลอดภัย เพราะ *ในฟังก์ชันบังคับเช็ค token ทุกครั้ง* และจำกัดว่า
--      แก้ได้เฉพาะคอลัมน์ใน whitelist เท่านั้น
--   ❌ ไม่เลือก: เปิดด่าน RLS ให้ anon เขียนตารางตรงๆ — นักเรียนจะแก้ของคนอื่นได้
--      (token เดาได้ไม่ยาก ดู audit 2026-07-19 finding #1) และตั้ง status เองได้
--   ❌ ไม่เลือก: เพิ่มพารามิเตอร์เข้า submit_class_request — ฟังก์ชันนั้นมี 2 เวอร์ชัน
--      ซ้อนกันอยู่ (เคยทำให้ส่งไม่ได้ตอน 2026-07-14 "Could not choose the best
--      candidate function") เพิ่มอีกเสี่ยงชนซ้ำ และแก้ได้แค่ 1 ใน 15 จุด
--
-- ⚠️ ไฟล์นี้ไม่แตะฟังก์ชัน/ด่าน RLS เดิมเลย — เพิ่มของใหม่ล้วนๆ
--    ฝั่งครูไม่ได้รับผลกระทบใดๆ (ครูล็อกอินจริง ใช้ด่านเดิมต่อไปเหมือนเดิม)
-- ════════════════════════════════════════════════════════════════════════════


-- ────────────────────────────────────────────────────────────────────────────
-- 1) อ่านคำขอของตัวเอง — แทน SELECT ตรงๆ 5 จุด
--    (loadStudentPendingRequestStatus / loadStudentRecentAcknowledgedCancelCard /
--     loadTeacherCancelNoticeBanner / loadTeacherCancelAckBanner / loadTeacherAddAckBanner)
--
--    กรองด้วย token เสมอ → นักเรียนเห็นได้เฉพาะของตัวเอง เหมือนเดิมทุกอย่าง
--    เงื่อนไขย่อยที่เหลือ (วันที่ / ack เป็น null / เคยกดปิดไปแล้ว) ให้ฝั่งเว็บกรองต่อเอง
--    เพื่อให้ฟังก์ชันนี้เหลือตัวเดียว ไม่ต้องมี RPC เยอะๆ ให้ดูแล
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.student_get_own_requests(
  p_token         text,
  p_request_type  text default null,
  p_status        text default null,
  p_initiated_by  text default null,
  p_limit         int  default 10
)
returns setof public.classroom_requests
language sql
stable
security definer
set search_path to 'public'
as $function$
  select *
  from public.classroom_requests
  where token = p_token
    and (p_request_type is null or request_type = p_request_type)
    and (p_status       is null or status       = p_status)
    and (p_initiated_by is null or initiated_by = p_initiated_by)
  order by created_at desc
  limit greatest(1, least(coalesce(p_limit, 10), 50));
$function$;


-- ────────────────────────────────────────────────────────────────────────────
-- 2) แก้คำขอของตัวเอง — แทน UPDATE ตรงๆ 10 จุด
--
--    ความปลอดภัย 4 ชั้น:
--      ชั้น 1  บังคับ token ตรงกับเจ้าของแถว (where token = p_token)
--      ชั้น 2  แก้ได้เฉพาะคอลัมน์ใน whitelist — คีย์แปลกปลอม = โยน error ทันที
--      ชั้น 3  status ตั้งได้ค่าเดียวคือ 'acknowledged' (ถอนคำขอ)
--              → นักเรียนตั้งเป็น 'approved' เองไม่ได้
--      ชั้น 4  ตัวล็อกกันชนกับครู (p_require_*) — ถ้าครูกำลังจัดการอยู่ จะแก้ไม่ได้
--
--    คืนค่า: แถวที่แก้สำเร็จ (0 แถว = ติดตัวล็อก ฝั่งเว็บต้องเช็ค length ทุกครั้ง)
-- ────────────────────────────────────────────────────────────────────────────
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

  -- ชั้น 2: คีย์ที่ไม่อยู่ใน whitelist = ปฏิเสธ (ไม่แก้เงียบๆ ให้รู้ตัวว่าพลาด)
  select array_agg(k) into v_bad
  from jsonb_object_keys(p_patch) as k
  where k <> all (v_allowed);
  if v_bad is not null then
    raise exception 'column(s) not allowed for student update: %', array_to_string(v_bad, ', ');
  end if;

  -- ชั้น 3: จำกัดค่าที่ตั้งได้
  if p_patch ? 'status' and coalesce(p_patch ->> 'status', '') <> 'acknowledged' then
    raise exception 'student may only set status to acknowledged';
  end if;
  if p_patch ? 'offer_status' and coalesce(p_patch ->> 'offer_status', '') not in ('', 'proposed') then
    raise exception 'student may only set offer_status to proposed or null';
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


-- ────────────────────────────────────────────────────────────────────────────
-- 3) เปิดสิทธิ์เรียกใช้ (ตัวฟังก์ชันเช็ค token เองอยู่แล้ว)
-- ────────────────────────────────────────────────────────────────────────────
revoke all on function public.student_get_own_requests(text, text, text, text, int)                      from public;
revoke all on function public.student_update_own_request(text, uuid, jsonb, text, text, boolean, text)   from public;

grant execute on function public.student_get_own_requests(text, text, text, text, int)                    to anon, authenticated;
grant execute on function public.student_update_own_request(text, uuid, jsonb, text, text, boolean, text) to anon, authenticated;


-- ────────────────────────────────────────────────────────────────────────────
-- 4) ตรวจว่าติดตั้งสำเร็จ — ต้องได้ 2 บรรทัด และ security_definer = true ทั้งคู่
-- ────────────────────────────────────────────────────────────────────────────
select p.proname, p.prosecdef as security_definer
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('student_get_own_requests', 'student_update_own_request');
