-- ════════════════════════════════════════════════════════════
-- 2026-08-12_fix_learning_memory_state_label.sql
-- แก้ label_zh ของ learning_memory_states.code='not_started' จาก 未練習 → 未開始
--
-- ทำไมต้องแก้: `supabase/sql/2026-08-11_learning_foundation.sql` (รันขึ้น production ไปแล้วก่อนหน้า)
-- seed ค่า `未練習` ไว้ตอนสร้างตาราง แต่ Decision ล่าสุด (Lin ยืนยัน 2026-08-12) ล็อกว่า
-- initial mastery label มาตรฐานคือ `未開始` และ `未練習` เป็น superseded label — production ยังไม่ตรง
-- (ยืนยันด้วย query สดก่อนแก้ไฟล์นี้: ยังเป็น 未練習 อยู่)
--
-- ทำไมปลอดภัย: เปลี่ยนแค่ label_zh ของ 1 แถวใน lookup table เดียว · ไม่แตะ code/ord ที่ระบบอื่นอ้างอิง ·
-- ไม่มีข้อมูลจริงผูกอยู่เลย (learning_memory = 0 แถว ตอนรันไฟล์นี้ — เช็คด้วย safety-gate [A] ก่อนเสมอ) ·
-- grep ทั้ง repo ไม่พบหน้าเว็บไหนอ่าน label_zh จากตารางนี้มาแสดงตอนนี้ (schema ใหม่ยังไม่มี UI ต่อ)
--
-- ✅ อนุมัติโดย Lin 2026-08-12 · รันจริงบน production (qzkxlhpcputsvbqmtqfi) แล้ว 2026-08-12
--    safety-gate [A] ผ่าน (learning_memory=0) → รัน [C] สำเร็จ → verify [D] ผ่าน (แถวอื่น 4 แถวไม่เปลี่ยน)
-- ════════════════════════════════════════════════════════════

-- [A] Safety gate — ต้องได้ 0 ก่อนไปต่อเสมอ ถ้าไม่ใช่ 0 ห้ามรัน [C] เด็ดขาด
--     (แปลว่ามีข้อมูลผู้เรียนผูกกับ label นี้แล้ว ต้องกลับมาคิดแผน migration ใหม่ ไม่ใช่ UPDATE เฉยๆ)
select count(*) as learning_memory_rows from public.learning_memory;

-- [B] ตรวจค่าเดิมก่อนแก้ (บันทึกไว้เป็นหลักฐาน)
select code, label_zh, ord from public.learning_memory_states where code = 'not_started';

-- [C] แก้ label เดียว — ไม่แตะ code/ord/ตารางอื่นใดเลย
update public.learning_memory_states
set label_zh = '未開始'
where code = 'not_started' and label_zh = '未練習';

-- [D] ตรวจหลังแก้ — ต้องเห็น 未開始 ที่ ord=1 และอีก 4 แถวไม่เปลี่ยน
select code, label_zh, ord from public.learning_memory_states order by ord;

-- [Z] rollback (ย้อนกลับได้ทันทีถ้าจำเป็น)
-- update public.learning_memory_states
-- set label_zh = '未練習'
-- where code = 'not_started' and label_zh = '未開始';
