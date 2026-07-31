-- ════════════════════════════════════════════════════════════════════════════
-- 2026-07-31 — ตัวทดสอบงาน C1 (ด่าน 24 ชม.ตอนแก้คำขอ)
-- ════════════════════════════════════════════════════════════════════════════
-- ⚠️ รันไฟล์ 2026-07-31_cancel_24h_guard_on_update.sql ให้เสร็จก่อน แล้วค่อยรันไฟล์นี้
--
-- ▶️ วิธีรัน: เปิดไฟล์นี้ → กด ⌘A (เลือกทั้งหมด) → ⌘C → วางใน Supabase SQL Editor → Run
--
-- ผลที่ต้องได้: 5 แถว ขึ้น ✅ ทุกแถว · แถวที่ 3 (★) สำคัญที่สุด
--   ต้องขึ้นว่า "โดนบล็อกถูกต้อง — รูถูกอุดแล้ว"
--
-- ไฟล์นี้สร้างคำขอทดสอบขึ้นมาจริง 2 ใบ แล้วลบทิ้งเองทุกใบตอนจบเสมอ
-- (ทั้งตอนสำเร็จและตอนพังกลางคัน) · ไม่ส่ง LINE หาใคร เพราะการส่ง LINE อยู่ฝั่งเว็บ ไม่ใช่ตรงนี้
-- ════════════════════════════════════════════════════════════════════════════


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
