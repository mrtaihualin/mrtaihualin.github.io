-- ════════════════════════════════════════════════════════════════════════════
-- 2026-07-31 — ตัวทดสอบ "เก็บ original_time ตอนสร้างคำขอ"
-- ════════════════════════════════════════════════════════════════════════════
-- ⚠️ รันไฟล์ 2026-07-31_store_original_time_on_insert.sql ให้เสร็จก่อน แล้วค่อยรันไฟล์นี้
--
-- ▶️ วิธีรัน: เปิดไฟล์นี้ → ⌘A → ⌘C → วางใน Supabase SQL Editor → Run
--
-- ผลที่ต้องได้: 4 แถว ขึ้น ✅ ทุกแถว (เคส 1-3 = ทั้ง 3 ชนิดคำขอ เพราะเป็นประตูทางเข้าเดียวกัน)
--
-- ไฟล์นี้สร้างคำขอทดสอบขึ้นมาจริงแล้วลบทิ้งเองทุกใบตอนจบเสมอ ไม่ส่ง LINE หาใคร
-- ════════════════════════════════════════════════════════════════════════════


create or replace function public._test_original_time_store()
returns table(เคส text, ผลลัพธ์ text) language plpgsql as $$
declare
  v_token text;
  v_id    uuid;
  v_stored_time text;
  bkk_far  timestamp;
begin
  delete from public.classroom_requests where note = 'test-original-time-store';

  select token into v_token from public.classroom_students order by created_at limit 1;
  if v_token is null then
    เคส := 'ไม่มีนักเรียนในระบบเลย'; ผลลัพธ์ := 'ข้ามการทดสอบ'; return next; return;
  end if;

  bkk_far := (now() + interval '5 days') at time zone 'Asia/Bangkok';

  -- ── เคส 1: cancel ── original_time ต้องถูกเก็บลงตารางทันที ไม่ต้องรอเว็บเติมทีหลัง
  v_id := public.submit_class_request(v_token, 'ทดสอบ original_time', 'cancel',
            bkk_far::date, null, null, 'test-original-time-store', 'student', '14:30');
  select original_time into v_stored_time from public.classroom_requests where id = v_id;
  เคส := '1) cancel — original_time เก็บลงตารางไหม';
  ผลลัพธ์ := case when v_stored_time = '14:30' then '✅ เก็บถูกต้อง (14:30)' else '🔴 ไม่ถูกเก็บ! ได้: ' || coalesce(v_stored_time, 'null') end;
  return next;

  -- ── เคส 2: reschedule ──
  v_id := public.submit_class_request(v_token, 'ทดสอบ original_time', 'reschedule',
            bkk_far::date, bkk_far::date, '10:00', 'test-original-time-store', 'student', '09:15');
  select original_time into v_stored_time from public.classroom_requests where id = v_id;
  เคส := '2) reschedule — original_time เก็บลงตารางไหม';
  ผลลัพธ์ := case when v_stored_time = '09:15' then '✅ เก็บถูกต้อง (09:15)' else '🔴 ไม่ถูกเก็บ! ได้: ' || coalesce(v_stored_time, 'null') end;
  return next;

  -- ── เคส 3: add_class ──
  v_id := public.submit_class_request(v_token, 'ทดสอบ original_time', 'add_class',
            bkk_far::date, bkk_far::date, '16:00', 'test-original-time-store', 'student', null);
  select original_time into v_stored_time from public.classroom_requests where id = v_id;
  เคส := '3) add_class — ไม่มี original_time ส่งมา ต้องไม่พัง (เป็น null ได้ปกติ)';
  ผลลัพธ์ := case when v_stored_time is null then '✅ ผ่าน — เป็น null ตามที่ควร ไม่ error' else '⚠️ ผิดคาด ได้: ' || v_stored_time end;
  return next;

  -- ── เคส 4: ด่าน 24 ชม.เดิม (C1) ต้องยังทำงานเหมือนเดิม ไม่ถูกงานนี้กระทบ ──
  begin
    perform public.submit_class_request(v_token, 'ทดสอบ original_time', 'cancel',
      (now() + interval '3 hours')::date, null, null, 'test-original-time-store', 'student',
      to_char((now() + interval '3 hours') at time zone 'Asia/Bangkok', 'HH24:MI'));
    เคส := '4) ด่าน 24 ชม.เดิม (คาบอีก 3 ชม.)'; ผลลัพธ์ := '🔴 ไม่ผ่าน — ควรโดนบล็อกแต่ไม่โดน!'; return next;
  exception when others then
    เคส := '4) ด่าน 24 ชม.เดิม (คาบอีก 3 ชม.)';
    ผลลัพธ์ := case when sqlerrm like '%hours in advance%'
                    then '✅ ยังบล็อกเหมือนเดิม — ไม่ถูกงานนี้กระทบ'
                    else '⚠️ โดนบล็อก แต่ด้วยเหตุผลอื่น: ' || sqlerrm end; return next;
  end;

  delete from public.classroom_requests where note = 'test-original-time-store';
  เคส := '🧹 เก็บกวาด'; ผลลัพธ์ := 'ลบคำขอทดสอบทิ้งหมดแล้ว'; return next;

exception when others then
  delete from public.classroom_requests where note = 'test-original-time-store';
  เคส := '🔴 การทดสอบพังกลางคัน'; ผลลัพธ์ := sqlerrm || ' (ลบคำขอทดสอบทิ้งแล้ว)'; return next;
end; $$;

select * from public._test_original_time_store();
drop function public._test_original_time_store();
