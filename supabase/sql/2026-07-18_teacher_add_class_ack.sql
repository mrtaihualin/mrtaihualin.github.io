-- ════════════════════════════════════════════════════════════
-- 老師發起「➕ 加課堂時間」也要先讓學生確認，才能真的建立 Calendar
-- （跟老師發起「取消」同一套邏輯：老師送出 → 學生按「我知道了」→ 老師回來按「確認新增」）
-- 用 classroom_requests 表（跟取消/改期同一張），加 4 個欄位存「還沒建立的加課提案」內容
-- + 1 個欄位存學生確認時間（跟 teacher_cancel_ack_at 同樣的角色，但分開存，不共用同一欄位，
--   避免以後不小心互相干擾）
-- รันไฟล์นี้ใน Supabase Dashboard → SQL Editor (รันครั้งเดียว) ก่อน push โค้ดใหม่
-- สร้าง 2026-07-18
-- ════════════════════════════════════════════════════════════

alter table classroom_requests
  add column if not exists teacher_add_ack_at timestamptz,
  add column if not exists proposed_end_time text,
  add column if not exists proposed_recurring boolean,
  add column if not exists proposed_until date,
  add column if not exists proposed_weekday smallint;

-- หมายเหตุ: ไม่ต้องแก้ RLS policy เพิ่ม — เว็บอ่าน/เขียนตาราง classroom_requests
-- ผ่าน RPC (submit_class_request) + policy เดิมที่มีอยู่แล้วสำหรับ token ของตัวเอง
-- คอลัมน์ใหม่เป็น nullable ทั้งหมด ไม่กระทบแถวเก่า

-- ════════════════════════════════════════════════════════════
-- 2026-07-19 เพิ่ม (เจอสาเหตุจริงที่ Lin ➕申請加課 ของนักเรียนกดไม่ได้ผล):
-- constraint classroom_requests_request_type_check เดิมอนุญาตแค่ 'cancel'/'reschedule'
-- ไม่มี 'add_class' เลย ตั้งแต่แรก — เพราะงั้นทุกครั้งที่ส่ง request_type='add_class'
-- (ทั้งนักเรียนกด➕申請加課 และครูกด➕加課堂時間ที่ไม่ได้มาจากคำขอเดิม) ฝั่ง Supabase
-- ปฏิเสธเงียบๆ ตลอด ไม่ใช่บั๊กโค้ดฝั่งเว็บ — แก้ constraint ให้รับ 'add_class' ด้วย
-- ════════════════════════════════════════════════════════════
alter table classroom_requests drop constraint classroom_requests_request_type_check;
alter table classroom_requests add constraint classroom_requests_request_type_check
  check (request_type = ANY (ARRAY['cancel'::text, 'reschedule'::text, 'add_class'::text]));
