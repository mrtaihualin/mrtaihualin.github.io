-- ════════════════════════════════════════════════════════════════════════════
-- 2026-07-31 — งาน C1: อุดรูที่ทำให้ด่าน "ยกเลิกล่วงหน้า 24 ชม." เดินอ้อมได้
-- ════════════════════════════════════════════════════════════════════════════
--
-- 🕳️ รูที่อุด (พังยังไงในชีวิตจริง):
--    นักเรียนส่งคำขอยกเลิกคาบที่อยู่อีก 5 วัน → ผ่านด่าน 24 ชม.ตามปกติ
--    แล้วยิงคำสั่ง "แก้คำขอเดิม" เปลี่ยน original_date / original_time ให้ชี้ไปคาบพรุ่งนี้เช้าแทน
--    คำขอยังขึ้นว่า pending ปกติทุกอย่าง ไม่มีอะไรผิดสังเกต
--    ครูกด ✅ 處理 = คาบถูกลบ ทั้งที่เหลือไม่ถึง 24 ชม.
--
--    ต้นเหตุ: ด่าน 24 ชม.มีแค่ตอน "ส่งคำขอครั้งแรก" (submit_class_request)
--            ตอน "แก้คำขอ" (student_update_own_request) ไม่มีด่านเลย
--            ทั้งที่ original_date / original_time อยู่ในรายชื่อคอลัมน์ที่นักเรียนแก้ได้
--
-- ✅ ฟังก์ชันนี้ = ตัวเดิมทุกบรรทัด + แทรกด่านใหม่ 1 ก้อน (มีป้าย ★ กำกับ)
--    คัดลอกตัวเดิมมาจาก supabase/2026-07-26_student-rpc-add-rate-limit.sql:165
--    ซึ่งเป็นต้นฉบับล่าสุดจริง (ตรวจแล้ว 2026-07-31 — ดู supabase/sql/00_ฟังก์ชันไหนอยู่ไฟล์ไหน.md)
--    ⚠️ ห้ามลอกจาก sql/2026-07-19_student_request_rpcs.sql — ตัวนั้นเก่ากว่า 2 รอบ
--       ถ้าลอกตัวนั้นมา จะลบ 2 อย่างนี้ทิ้งโดยไม่มีใครรู้:
--         · ค่า offer_status = 'declined'  → ปุ่ม 婉拒 ของนักเรียนพังทันที
--         · ยามเฝ้าประตูกันไล่เดา token   → รูโหว่ที่อุดไปเมื่อ 2026-07-26 กลับมา
--
-- 🔒 จำนวนช่องรับค่า: 7 ช่อง เท่าเดิมเป๊ะ ไม่เพิ่มไม่ลด
--    → "CREATE OR REPLACE" เขียนทับตัวเดิมได้จริง ไม่เกิดฟังก์ชันซ้อนกัน
--    → ไม่ต้อง drop อะไรทั้งสิ้น (ต่างจากเหตุการณ์ 2026-07-30 ที่จำนวนช่องเปลี่ยน)
--
-- ปลอดภัยที่จะรันซ้ำ
-- ════════════════════════════════════════════════════════════════════════════


-- ────────────────────────────────────────────────────────────────────────────
-- ก้อนที่ 1 — ตัวฟังก์ชัน (วางทั้งก้อนนี้แล้วกด Run)
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
  -- ★ ตัวแปรใหม่ 3 ตัว สำหรับด่านใหม่ข้างล่าง
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
  -- ★ ด่านใหม่ 2026-07-31 (งาน C1) — ด่าน 24 ชม. ตอน "แก้คำขอ" ไม่ใช่แค่ตอน "ส่งคำขอ"
  --
  -- ทำงานเฉพาะเมื่อครบ 3 อย่างพร้อมกันเท่านั้น:
  --   (1) คนเรียกไม่ใช่ครู          → ครูไม่ถูกแตะเลย ยกเลิกได้ตลอดเหมือนเดิม
  --   (2) กำลังแก้ original_date หรือ original_time → คือกำลังเปลี่ยน "คาบเป้าหมาย"
  --   (3) คำขอนี้เป็นชนิด 'cancel'  → 'reschedule' กับ 'add_class' ไม่ถูกแตะเลยแม้แต่นิดเดียว
  --
  -- ข้อความ error ใช้ชุดเดียวกับด่านตอนส่งคำขอเป๊ะ (2026-07-30_..._consolidated.sql:141,144)
  -- เพื่อให้ฝั่งหน้าเว็บดักแปลเป็นภาษาจีนได้ที่เดียว (งาน C12 จะทำต่อ)
  -- ══════════════════════════════════════════════════════════════════════════
  if not public.is_teacher_caller()
     and (p_patch ? 'original_date' or p_patch ? 'original_time') then

    -- อ่านของเดิมในแถวมาก่อน แล้วทับด้วยค่าใหม่ที่กำลังจะแก้ (ถ้ามี)
    -- = "คาบเป้าหมายหลังแก้เสร็จ จะเป็นวัน-เวลาไหน"
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

    -- หาแถวไม่เจอ (token/id ไม่ตรง) → v_req_type เป็น null → ปล่อยผ่านด่านนี้ไป
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
    end if;
  end if;
  -- ══════════════════════ จบด่านใหม่ ตั้งแต่บรรทัดล่างเหมือนเดิมทุกตัวอักษร ══════════════════════

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
-- ก้อนที่ 2 — ตรวจว่าติดตั้งสำเร็จ (วางต่อได้เลย)
-- ต้องได้ 1 แถว · มีด่านใหม่ = true · ของเดิม 2 อย่างต้องยังอยู่ = true ทั้งคู่
-- ────────────────────────────────────────────────────────────────────────────
select p.proname,
       pg_get_function_identity_arguments(p.oid)                        as ช่องรับค่า,
       (pg_get_functiondef(p.oid) like '%hours in advance%')            as มีด่านใหม่24ชม,
       (pg_get_functiondef(p.oid) like '%declined%')                    as ของเดิม_ปุ่ม婉拒ยังอยู่,
       (pg_get_functiondef(p.oid) like '%slink_rl_check%')              as ของเดิม_ยามเฝ้าประตูยังอยู่
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'student_update_own_request';


-- ────────────────────────────────────────────────────────────────────────────
-- ก้อนที่ 3 — ทดสอบจริงกับฐานข้อมูลจริง 4 เคส
--
-- ⚠️ ลากเลือก "เฉพาะก้อนนี้" แล้วกด Run แยกทีหลัง (อย่ารันพร้อมก้อนที่ 1)
-- ⚠️ ก้อนนี้สร้างคำขอทดสอบขึ้นมาจริง 2 ใบ แล้ว "ลบทิ้งเองทุกใบ" ตอนจบเสมอ
--    (ทั้งตอนสำเร็จและตอนพังกลางคัน) — ไม่ส่ง LINE หาใคร เพราะการส่ง LINE อยู่ฝั่งเว็บ ไม่ใช่ตรงนี้
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public._test_c1_guard()
returns table(เคส text, ผลลัพธ์ text) language plpgsql as $$
declare
  v_token text;
  v_id    uuid;
  v_id2   uuid;
  bkk_far  timestamp;   -- คาบอีก 5 วัน
  bkk_near timestamp;   -- คาบอีก 3 ชม.
begin
  -- เก็บกวาดของค้างจากการรันครั้งก่อน (เผื่อเคยพังกลางคัน)
  delete from public.classroom_requests where note = 'test-c1-guard';

  select token into v_token from public.classroom_students order by created_at limit 1;
  if v_token is null then
    เคส := 'ไม่มีนักเรียนในระบบเลย'; ผลลัพธ์ := 'ข้ามการทดสอบ'; return next; return;
  end if;

  bkk_far  := (now() + interval '5 days')  at time zone 'Asia/Bangkok';
  bkk_near := (now() + interval '3 hours')  at time zone 'Asia/Bangkok';

  -- ── เคส 1: ส่งคำขอยกเลิกคาบอีก 5 วัน → ต้องผ่าน (ของเดิม ไม่ควรพัง) ──
  v_id := public.submit_class_request(v_token, 'ทดสอบ C1', 'cancel',
            bkk_far::date, null, null, 'test-c1-guard', 'student', to_char(bkk_far, 'HH24:MI'));
  เคส := '1) ส่งคำขอยกเลิกคาบอีก 5 วัน'; ผลลัพธ์ := '✅ ส่งได้ตามปกติ'; return next;

  -- ── เคส 2: เว็บเติมเวลาคาบตามหลัง (ของเดิมทำอยู่ทุกครั้ง) → ต้องไม่โดนด่านใหม่บล็อก ──
  begin
    perform public.student_update_own_request(v_token, v_id,
      jsonb_build_object('original_time', to_char(bkk_far, 'HH24:MI')), 'pending', null, false, null);
    เคส := '2) เว็บเติมเวลาคาบตามหลัง (ของเดิม)'; ผลลัพธ์ := '✅ ผ่าน — ด่านใหม่ไม่บล็อกของเดิม'; return next;
  exception when others then
    เคส := '2) เว็บเติมเวลาคาบตามหลัง (ของเดิม)';
    ผลลัพธ์ := '🔴 พัง! ด่านใหม่ไปบล็อกของเดิม: ' || sqlerrm; return next;
  end;

  -- ── เคส 3 (ของจริง): แก้คำขอให้ชี้ไปคาบอีก 3 ชม. → ต้องโดนบล็อก ──
  begin
    perform public.student_update_own_request(v_token, v_id,
      jsonb_build_object('original_date', bkk_near::date::text,
                         'original_time', to_char(bkk_near, 'HH24:MI')), 'pending', null, false, null);
    เคส := '3) ★ แก้คำขอให้ชี้คาบอีก 3 ชม.'; ผลลัพธ์ := '🔴 ไม่ผ่าน — ยังเดินอ้อมด่าน 24 ชม.ได้อยู่!'; return next;
  exception when others then
    เคส := '3) ★ แก้คำขอให้ชี้คาบอีก 3 ชม.';
    ผลลัพธ์ := case when sqlerrm like '%hours in advance%'
                    then '✅ โดนบล็อกถูกต้อง — รูถูกอุดแล้ว'
                    else '⚠️ โดนบล็อก แต่ด้วยเหตุผลอื่น: ' || sqlerrm end; return next;
  end;

  -- ── เคส 4: คำขอ "ขอเลื่อน" (改期) ต้องไม่ถูกด่านใหม่แตะเลย ──
  v_id2 := public.submit_class_request(v_token, 'ทดสอบ C1', 'reschedule',
             bkk_near::date, bkk_far::date, to_char(bkk_far, 'HH24:MI'), 'test-c1-guard', 'student', null);
  begin
    perform public.student_update_own_request(v_token, v_id2,
      jsonb_build_object('original_date', bkk_near::date::text,
                         'original_time', to_char(bkk_near, 'HH24:MI')), 'pending', null, false, null);
    เคส := '4) คำขอ "ขอเลื่อน" คาบอีก 3 ชม.'; ผลลัพธ์ := '✅ ผ่าน — ระบบขอเลื่อนไม่ถูกกระทบ (ถูกต้อง)'; return next;
  exception when others then
    เคส := '4) คำขอ "ขอเลื่อน" คาบอีก 3 ชม.';
    ผลลัพธ์ := '🔴 พัง! ด่านใหม่ไปโดนระบบขอเลื่อนด้วย: ' || sqlerrm; return next;
  end;

  -- 🧹 เก็บกวาดเสมอ
  delete from public.classroom_requests where note = 'test-c1-guard';
  เคส := '🧹 เก็บกวาด'; ผลลัพธ์ := 'ลบคำขอทดสอบทิ้งหมดแล้ว'; return next;

exception when others then
  -- พังกลางคันตรงไหนก็ตาม ต้องไม่ทิ้งขยะไว้ในคิวครู
  delete from public.classroom_requests where note = 'test-c1-guard';
  เคส := '🔴 การทดสอบพังกลางคัน'; ผลลัพธ์ := sqlerrm || ' (ลบคำขอทดสอบทิ้งแล้ว)'; return next;
end; $$;

select * from public._test_c1_guard();
drop function public._test_c1_guard();
