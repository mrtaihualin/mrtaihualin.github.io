-- ════════════════════════════════════════════════════════════════════════════
-- 2026-08-02 — ตัวทดสอบด่านใหม่รอบ 2 "ห้ามแก้เวลาที่ขอ ตอนครูกำลังจัดการอยู่"
-- ════════════════════════════════════════════════════════════════════════════
-- ⚠️ รันไฟล์ sql/2026-08-01_reschedule_guards.sql (ฉบับอัปเดตรอบ 2) ให้เสร็จก่อน แล้วค่อยรันไฟล์นี้
--
-- ▶️ วิธีรัน: เปิดไฟล์นี้ → ⌘A → ⌘C → วางใน Supabase SQL Editor → Run
--
-- ผลที่ต้องได้: 6 แถว ขึ้น ✅ ทุกแถว
--   แถวที่ 4 (★) สำคัญที่สุด — ต้องขึ้นว่า "โดนบล็อกถูกต้อง — รูถูกอุดแล้ว"
--   แถวที่ 5 คือด่านเดิมของระบบยกเลิก ต้องยังทำงานเหมือนเดิม (กันเผลอไปทำของคนอื่นพัง)
--
-- ไฟล์นี้สร้างคำขอทดสอบขึ้นมาจริง แล้วลบทิ้งเองทุกใบตอนจบเสมอ
-- (ทั้งตอนสำเร็จและตอนพังกลางคัน) · ไม่ส่ง LINE หาใคร · ไม่แตะ Google Calendar
-- ปลอดภัยที่จะรันซ้ำ
-- ════════════════════════════════════════════════════════════════════════════

create or replace function public._test_reschedule_lock_guard()
returns table(เคส text, ผลลัพธ์ text) language plpgsql as $$
declare
  v_token text;
  v_id    uuid;
  v_id_c  uuid;
  bkk_far timestamp;   -- คาบอีก 5 วัน (ผ่านด่าน 6 ชม.สบายๆ)
  v_rows  int;
begin
  -- เก็บกวาดของค้างจากการรันครั้งก่อน (เผื่อเคยพังกลางคัน)
  delete from public.classroom_requests where note in ('test-lock-guard', 'test-lock-guard-cancel');

  select token into v_token from public.classroom_students order by created_at limit 1;
  if v_token is null then
    เคส := 'ไม่มีนักเรียนในระบบเลย'; ผลลัพธ์ := 'ข้ามการทดสอบ'; return next; return;
  end if;

  bkk_far := (now() + interval '5 days') at time zone 'Asia/Bangkok';

  -- ── เคส 1: ส่งคำขอเลื่อนคาบอีก 5 วัน → ต้องผ่าน (ด่าน 6 ชม.ไม่ควรบล็อก) ──
  v_id := public.submit_class_request(v_token, 'ทดสอบล็อก', 'reschedule',
            bkk_far::date, (bkk_far + interval '1 day')::date, '14:00',
            'test-lock-guard', 'student', to_char(bkk_far, 'HH24:MI'));
  เคส := '1) ส่งคำขอเลื่อนคาบอีก 5 วัน'; ผลลัพธ์ := '✅ ส่งได้ตามปกติ'; return next;

  -- ── เคส 2: เว็บเติมตัวเลือกตามหลัง ตอนล็อกยังว่าง → ต้องผ่าน (ของเดิมทำทุกครั้ง) ──
  --    จำลอง classroom/index.html:6394 ที่ส่ง guards ว่างเปล่ามา (ไม่มีธง notProcessing)
  begin
    perform public.student_update_own_request(v_token, v_id,
      jsonb_build_object('proposed_options', '[{"date":"2030-01-01","time":"14:00"}]'::jsonb),
      null, null, false, null);
    เคส := '2) เว็บเติมตัวเลือกตามหลัง (ล็อกว่าง)'; ผลลัพธ์ := '✅ ผ่าน — ด่านใหม่ไม่บล็อกของเดิม'; return next;
  exception when others then
    เคส := '2) เว็บเติมตัวเลือกตามหลัง (ล็อกว่าง)'; ผลลัพธ์ := '❌ พัง! ด่านใหม่บล็อกของเดิม: ' || sqlerrm; return next;
  end;

  -- ── เคส 3: ทำให้ "ครูกำลังจับล็อกอยู่" ──
  update public.classroom_requests set processing_started_at = now() where id = v_id;
  เคส := '3) จำลองว่าครูกดปุ่มแล้ว (จับล็อก)'; ผลลัพธ์ := '✅ ตั้งค่าเรียบร้อย'; return next;

  -- ── ★ เคส 4: นักเรียนยิงตรงมาแก้เวลา "โดยไม่ส่งธง notProcessing" → ต้องโดนบล็อก ──
  --    นี่คือรูที่อุด: เดิมทำสำเร็จเงียบๆ เพราะด่านเช็คก็ต่อเมื่อผู้เรียกสั่งให้เช็ค
  begin
    perform public.student_update_own_request(v_token, v_id,
      jsonb_build_object('requested_date', '2030-12-31', 'requested_time', '23:00'),
      null, null, false, null);
    เคส := '★ 4) ยิงตรงมาแก้เวลา ตอนครูจับล็อกอยู่';
    ผลลัพธ์ := '❌ รูยังเปิดอยู่! แก้สำเร็จทั้งที่ครูกำลังทำอยู่ — อย่าเพิ่งใช้งาน';
    return next;
  exception when others then
    if sqlerrm like '%locked or already closed%' then
      เคส := '★ 4) ยิงตรงมาแก้เวลา ตอนครูจับล็อกอยู่';
      ผลลัพธ์ := '✅ โดนบล็อกถูกต้อง — รูถูกอุดแล้ว';
    else
      เคส := '★ 4) ยิงตรงมาแก้เวลา ตอนครูจับล็อกอยู่';
      ผลลัพธ์ := '⚠️ โดนบล็อกด้วยเหตุผลอื่น (ต้องดู): ' || sqlerrm;
    end if;
    return next;
  end;

  -- ── เคส 5: ถอนคำขอ (แก้แค่ status) ต้องไม่ถูกด่านใหม่แตะ — ยังใช้ธงเดิมของผู้เรียก ──
  --    ส่งธง notProcessing = true มา ล็อกไม่ว่าง → ต้องได้ 0 แถว (ไม่ใช่ error) เหมือนเดิมเป๊ะ
  select count(*) into v_rows from public.student_update_own_request(v_token, v_id,
    jsonb_build_object('status', 'acknowledged'), 'pending', null, true, null);
  if v_rows = 0 then
    เคส := '5) ถอนคำขอตอนล็อกไม่ว่าง'; ผลลัพธ์ := '✅ ได้ 0 แถว (พฤติกรรมเดิม ไม่ใช่ error)';
  else
    เคส := '5) ถอนคำขอตอนล็อกไม่ว่าง'; ผลลัพธ์ := '❌ ถอนสำเร็จทั้งที่ครูกำลังทำอยู่ — ผิด';
  end if;
  return next;

  -- ── เคส 6: ระบบ "ยกเลิกคาบ" ต้องไม่ถูกด่านใหม่แตะเลย (คนละระบบ คนละคนดูแล) ──
  v_id_c := public.submit_class_request(v_token, 'ทดสอบล็อก', 'cancel',
              bkk_far::date, null, null, 'test-lock-guard-cancel', 'student', to_char(bkk_far, 'HH24:MI'));
  update public.classroom_requests set processing_started_at = now() where id = v_id_c;
  begin
    -- คำขอ 'cancel' + ล็อกไม่ว่าง + แก้ requested_time → ด่านใหม่ต้อง "ไม่" ทำงาน
    perform public.student_update_own_request(v_token, v_id_c,
      jsonb_build_object('requested_time', '09:00'), null, null, false, null);
    เคส := '6) คำขอยกเลิก ไม่ถูกด่านใหม่แตะ'; ผลลัพธ์ := '✅ ผ่าน — ระบบยกเลิกไม่ได้รับผลกระทบ';
  exception when others then
    if sqlerrm like '%locked or already closed%' then
      เคส := '6) คำขอยกเลิก ไม่ถูกด่านใหม่แตะ'; ผลลัพธ์ := '❌ ด่านใหม่ล้ำไปโดนระบบยกเลิกด้วย — ต้องแก้';
    else
      เคส := '6) คำขอยกเลิก ไม่ถูกด่านใหม่แตะ'; ผลลัพธ์ := '⚠️ error อื่น (ต้องดู): ' || sqlerrm;
    end if;
  end;
  return next;

  -- เก็บกวาดเสมอ
  delete from public.classroom_requests where note in ('test-lock-guard', 'test-lock-guard-cancel');
exception when others then
  delete from public.classroom_requests where note in ('test-lock-guard', 'test-lock-guard-cancel');
  เคส := '⚠️ พังกลางคัน'; ผลลัพธ์ := sqlerrm; return next;
end;
$$;

select * from public._test_reschedule_lock_guard();

-- เก็บกวาดตัวทดสอบทิ้ง ไม่ให้ค้างในฐานข้อมูล
drop function if exists public._test_reschedule_lock_guard();

-- ตรวจปิดท้าย: ต้องไม่มีคำขอทดสอบค้างอยู่เลย (ต้องได้ 0)
select count(*) as คำขอทดสอบที่ค้างอยู่_ต้องเป็น0
from public.classroom_requests where note in ('test-lock-guard', 'test-lock-guard-cancel');
