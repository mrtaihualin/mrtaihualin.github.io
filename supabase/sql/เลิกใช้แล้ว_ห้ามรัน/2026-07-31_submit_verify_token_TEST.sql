-- ════════════════════════════════════════════════════════════════════════════
-- 2026-07-31 — ตัวทดสอบงาน C14 (ตรวจรหัสนักเรียน + เอาชื่อจากฐานข้อมูล)
-- ════════════════════════════════════════════════════════════════════════════
-- ⚠️ รันไฟล์ 2026-07-31_submit_verify_token.sql ให้เสร็จก่อน แล้วค่อยรันไฟล์นี้
--
-- ▶️ วิธีรัน: เปิดไฟล์นี้ → กด ⌘A (เลือกทั้งหมด) → ⌘C → วางใน Supabase SQL Editor → Run
--
-- ผลที่ต้องได้: 6 แถว ขึ้น ✅ ทุกแถว
--   แถว 1 (★) = รหัสมั่วต้องถูกปฏิเสธ  ← หัวใจของงานนี้
--   แถว 2 (★) = ชื่อที่บันทึกต้องเป็นชื่อจริงจากฐานข้อมูล ไม่ใช่ชื่อมั่วที่ส่งมา
--   แถว 3-5   = คำขอทั้ง 3 ชนิดต้องยังส่งได้เหมือนเดิม (กันแก้แล้วพังของเดิม)
--
-- ไฟล์นี้สร้างคำขอทดสอบขึ้นมาจริงแล้วลบทิ้งเองทุกใบตอนจบเสมอ
-- (ทั้งตอนสำเร็จและตอนพังกลางคัน) · ไม่ส่ง LINE หาใคร
-- ════════════════════════════════════════════════════════════════════════════

create or replace function public._test_c14_token()
returns table(เคส text, ผลลัพธ์ text) language plpgsql as $$
declare
  v_token     text;
  v_real_name text;
  v_id        uuid;
  v_saved     text;
  bkk_far  timestamp;
  bkk_near timestamp;
begin
  delete from public.classroom_requests where note = 'test-c14-token';

  select s.token, s.name into v_token, v_real_name
  from public.classroom_students s order by s.created_at limit 1;
  if v_token is null then
    เคส := 'ไม่มีนักเรียนในระบบเลย'; ผลลัพธ์ := 'ข้ามการทดสอบ'; return next; return;
  end if;

  bkk_far  := (now() + interval '5 days') at time zone 'Asia/Bangkok';
  bkk_near := (now() + interval '3 hours') at time zone 'Asia/Bangkok';

  -- ── เคส 1 ★: รหัสนักเรียนมั่ว → ต้องถูกปฏิเสธ ──
  begin
    perform public.submit_class_request('test-token-does-not-exist', 'คนแปลกหน้า', 'cancel',
      bkk_far::date, null, null, 'test-c14-token', 'student', to_char(bkk_far, 'HH24:MI'));
    เคส := '1) ★ ยิงคำขอด้วยรหัสนักเรียนมั่ว';
    ผลลัพธ์ := '🔴 ไม่ผ่าน — ยังยิงคำขอขยะเข้าคิวครูได้อยู่!'; return next;
  exception when others then
    เคส := '1) ★ ยิงคำขอด้วยรหัสนักเรียนมั่ว';
    ผลลัพธ์ := case when sqlerrm like '%invalid student token%'
                    then '✅ โดนปฏิเสธถูกต้อง — รูถูกอุดแล้ว'
                    else '⚠️ โดนปฏิเสธ แต่ด้วยเหตุผลอื่น: ' || sqlerrm end; return next;
  end;

  -- ── เคส 2 ★: รหัสจริง แต่ส่งชื่อมั่วมา → ต้องผ่าน และชื่อที่บันทึกต้องเป็นชื่อจริง ──
  v_id := public.submit_class_request(v_token, '💀ชื่อปลอมที่ส่งมา💀', 'cancel',
            bkk_far::date, null, null, 'test-c14-token', 'student', to_char(bkk_far, 'HH24:MI'));
  select student_name into v_saved from public.classroom_requests where id = v_id;
  เคส := '2) ★ รหัสจริง + ส่งชื่อปลอมมา';
  ผลลัพธ์ := case
    when v_saved = '💀ชื่อปลอมที่ส่งมา💀' then '🔴 ไม่ผ่าน — ยังเชื่อชื่อที่ส่งมา บันทึกเป็น "' || v_saved || '"'
    when v_saved = v_real_name then '✅ บันทึกชื่อจริงจากฐานข้อมูล ("' || v_saved || '") ไม่เชื่อชื่อปลอม'
    else '⚠️ บันทึกเป็น "' || coalesce(v_saved,'(ว่าง)') || '" ซึ่งไม่ตรงทั้งชื่อจริงและชื่อปลอม' end;
  return next;

  -- ── เคส 3: คำขอ "ยกเลิก" ปกติ ต้องยังส่งได้ ── (ใช้ผลจากเคส 2 ที่ส่งผ่านมาแล้ว)
  เคส := '3) คำขอ "ยกเลิก" คาบอีก 5 วัน';
  ผลลัพธ์ := case when v_id is not null then '✅ ส่งได้ตามปกติ' else '🔴 ส่งไม่ได้' end; return next;

  -- ── เคส 4: คำขอ "ขอเลื่อน" ต้องยังส่งได้ ──
  begin
    perform public.submit_class_request(v_token, v_real_name, 'reschedule',
      bkk_near::date, bkk_far::date, to_char(bkk_far, 'HH24:MI'), 'test-c14-token', 'student', null);
    เคส := '4) คำขอ "ขอเลื่อน" (改期)'; ผลลัพธ์ := '✅ ส่งได้ตามปกติ'; return next;
  exception when others then
    เคส := '4) คำขอ "ขอเลื่อน" (改期)'; ผลลัพธ์ := '🔴 พัง! ด่านใหม่ไปโดนระบบขอเลื่อน: ' || sqlerrm; return next;
  end;

  -- ── เคส 5: คำขอ "เพิ่มคาบ" ต้องยังส่งได้ ──
  begin
    perform public.submit_class_request(v_token, v_real_name, 'add_class',
      null, bkk_far::date, to_char(bkk_far, 'HH24:MI'), 'test-c14-token', 'student', null);
    เคส := '5) คำขอ "เพิ่มคาบ" (加課)'; ผลลัพธ์ := '✅ ส่งได้ตามปกติ'; return next;
  exception when others then
    เคส := '5) คำขอ "เพิ่มคาบ" (加課)'; ผลลัพธ์ := '🔴 พัง! ด่านใหม่ไปโดนระบบเพิ่มคาบ: ' || sqlerrm; return next;
  end;

  delete from public.classroom_requests where note = 'test-c14-token';
  เคส := '🧹 เก็บกวาด'; ผลลัพธ์ := 'ลบคำขอทดสอบทิ้งหมดแล้ว'; return next;

exception when others then
  delete from public.classroom_requests where note = 'test-c14-token';
  เคส := '🔴 การทดสอบพังกลางคัน'; ผลลัพธ์ := sqlerrm || ' (ลบคำขอทดสอบทิ้งแล้ว)'; return next;
end; $$;

select * from public._test_c14_token();
drop function public._test_c14_token();
