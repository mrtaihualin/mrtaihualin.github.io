-- ════════════════════════════════════════════════════════════════════════════
-- 2026-07-31 — เปิดทางให้ตารางสำรองรับค่า action = 'create'
--
-- ทำไมต้องมีไฟล์นี้:
--   เพิ่งเพิ่มปุ่ม ↩️ 復原 ให้ "คาบที่เพิ่งเพิ่ม" (ข้อ #20 ในรายงานตรวจ 2026-07-31)
--   เว็บจะบันทึกแถวสำรองด้วย action = 'create' ซึ่งเป็นค่าใหม่ที่ไม่เคยใช้มาก่อน
--   ตาราง classroom_calendar_backups ถูกสร้างไว้ในหน้าเว็บ Supabase โดยตรง (ไม่มีไฟล์ใน repo)
--   → **ตรวจจากในคอมไม่ได้** ว่ามีด่าน CHECK จำกัดค่า action ไว้หรือเปล่า ต้องมากดดูเอง
--
-- ถ้ามีด่าน CHECK ที่ไม่รู้จัก 'create' จะเกิดอะไร:
--   แถวสำรองเขียนไม่ลง → **คาบยังถูกเพิ่มสำเร็จตามปกติ ไม่มีอะไรพัง**
--   แค่คาบนั้นจะไม่มีปุ่ม ↩️ 復原 ให้กด (เขียนคำเตือนไว้ใน console ของเบราว์เซอร์แล้ว)
--   = พังแบบปลอดภัย ไม่ใช่พังแบบเสียหาย — เพราะงั้นรันไฟล์นี้ทีหลังก็ได้ ไม่ต้องรีบ
-- ════════════════════════════════════════════════════════════════════════════


-- ────────────────────────────────────────────────────────────────────────────
-- ขั้นที่ 1 — เช็คก่อนว่ามีด่านจำกัดค่าอยู่ไหม  (วางแล้วกด Run)
-- ────────────────────────────────────────────────────────────────────────────
-- ได้ 0 แถว  = ไม่มีด่าน → ✅ ไม่ต้องทำอะไรต่อ ปุ่มคืนค่าใช้ได้เลย จบ
-- ได้ 1 แถว  = มีด่าน → อ่านช่อง "เงื่อนไขที่ตั้งไว้" ว่ามีคำว่า 'create' อยู่ในนั้นไหม
--                มี   → ✅ ไม่ต้องทำอะไรต่อ จบ
--                ไม่มี → ไปขั้นที่ 2

select con.conname                          as ชื่อด่าน,
       pg_get_constraintdef(con.oid)        as เงื่อนไขที่ตั้งไว้
from pg_constraint con
join pg_class rel on rel.oid = con.conrelid
join pg_namespace nsp on nsp.oid = rel.relnamespace
where nsp.nspname = 'public'
  and rel.relname = 'classroom_calendar_backups'
  and con.contype = 'c'
  and pg_get_constraintdef(con.oid) ilike '%action%';


-- ────────────────────────────────────────────────────────────────────────────
-- ขั้นที่ 2 — รันจริง (Lin กดขั้นที่ 1 แล้วเมื่อ 2026-07-31 ผลออกมาแล้ว ตามนี้)
-- ────────────────────────────────────────────────────────────────────────────
-- ผลที่ได้จริงจากขั้นที่ 1:
--   ชื่อด่าน       : classroom_calendar_backups_action_check
--   เงื่อนไขเดิม   : action = ANY (ARRAY['move', 'delete', 'permanent_change'])
--
-- 🔴 เจอบั๊กเก่าซ่อนอยู่ด้วย (ไม่ได้ตั้งใจหา):
--   โค้ดเว็บใช้ค่า action อยู่ 5 ค่า แต่ด่านอนุญาตแค่ 3 → ขาดไป 2 ค่า
--     1. 'archive_student' — ใช้มาตั้งแต่ 2026-07-26 ที่ classroom/index.html (ปุ่ม "เก็บนักเรียนเข้ากรุ")
--        ผลตอนนี้: ตอนเก็บกวาด "คาบเดี่ยวที่เคยเลื่อนไว้" ระบบสำรองไม่ผ่าน → assertBackupOk โยน error
--                  → ไม่กล้าลบคาบนั้น (ถูกต้องตามหลัก แต่แปลว่าเก็บกวาดไม่เคยสำเร็จเลย)
--                  → และเพราะมี error ค้าง การล้างแถว classroom_recurring_days ที่ต่อท้ายก็ไม่ทำงานตาม
--     2. 'create' — ของใหม่ 2026-07-31 (ปุ่ม ↩️ 復原 ของคาบที่เพิ่งเพิ่ม)
--
-- คำสั่งข้างล่างเติมทั้ง 2 ค่าเข้าไป โดยเก็บ 3 ค่าเดิมไว้ครบ (ไม่ลบของเก่าทิ้ง)
-- ⚠️ ต้องรัน 2 บรรทัดนี้ "พร้อมกันในครั้งเดียว" — ระหว่างที่ด่านถูกถอด ตารางจะไม่มีด่านคุมชั่วคราว

alter table public.classroom_calendar_backups
  drop constraint if exists classroom_calendar_backups_action_check;

alter table public.classroom_calendar_backups
  add constraint classroom_calendar_backups_action_check
  check (action = any (array['move'::text, 'delete'::text, 'permanent_change'::text, 'archive_student'::text, 'create'::text]));


-- ────────────────────────────────────────────────────────────────────────────
-- ขั้นที่ 3 — ทดสอบว่าเขียนค่า 'create' ลงได้จริงแล้ว (วางแล้วกด Run)
-- ────────────────────────────────────────────────────────────────────────────
-- ต้องได้ผลว่า "ผ่าน" · แถวทดสอบถูกลบทิ้งให้เองในคำสั่งเดียวกัน ไม่ทิ้งขยะไว้ในตาราง

-- ทดสอบทั้ง 5 ค่าที่โค้ดใช้จริง ต้องขึ้น ✅ ครบทั้ง 5 บรรทัด
-- แถวทดสอบถูกลบทิ้งให้เองทุกแถว ไม่ทิ้งขยะไว้ในตาราง

do $$
declare
  v_id uuid;
  v_act text;
begin
  foreach v_act in array array['move', 'delete', 'permanent_change', 'archive_student', 'create']
  loop
    begin
      insert into public.classroom_calendar_backups (token, action, old_event_id, old_event_json, old_start)
      values ('__ทดสอบ__', v_act, '__ทดสอบ__', '{}'::jsonb, now())
      returning id into v_id;

      delete from public.classroom_calendar_backups where id = v_id;
      raise notice '✅ % — ผ่าน', v_act;
    exception when others then
      raise notice '❌ % — ยังไม่ผ่าน: %', v_act, sqlerrm;
    end;
  end loop;
end $$;


-- ────────────────────────────────────────────────────────────────────────────
-- ขั้นที่ 4 — ดูด่านตัวใหม่ด้วยตาอีกรอบ (วางแล้วกด Run)
-- ────────────────────────────────────────────────────────────────────────────
-- ต้องเห็นครบทั้ง 5 ค่าในบรรทัดเดียว และต้องมีด่านแค่ "1 แถว" เท่านั้น

select con.conname                   as ชื่อด่าน,
       pg_get_constraintdef(con.oid) as เงื่อนไขตอนนี้
from pg_constraint con
join pg_class rel on rel.oid = con.conrelid
join pg_namespace nsp on nsp.oid = rel.relnamespace
where nsp.nspname = 'public'
  and rel.relname = 'classroom_calendar_backups'
  and con.contype = 'c'
  and pg_get_constraintdef(con.oid) ilike '%action%';
