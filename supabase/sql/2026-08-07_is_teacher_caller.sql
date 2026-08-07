-- ════════════════════════════════════════════════════════════════════════════
-- 2026-08-07 — แยก is_teacher_caller() ออกมาเป็นไฟล์เดี่ยว (งาน P2-04/P2-06)
-- ────────────────────────────────────────────────────────────────────────────
-- ที่มา: เดิมฟังก์ชันนี้อยู่ปนใน sql/2026-07-30_submit_class_request_consolidated.sql
--   ไฟล์เดียวกับ submit_class_request เวอร์ชันเก่า (ห้ามรัน) + ชุดทดสอบเก่าที่ใช้ไม่ได้แล้ว
--   ผิดเงื่อนไขจบ P2 ตรงๆ ("SQL ทดสอบและ SQL เปลี่ยนระบบไม่ปะปนกัน") — Lin อนุมัติแยกแล้ว 2026-08-07
--   ไฟล์เดิมทั้งไฟล์ถูกย้ายเข้ากรุที่ sql/เลิกใช้แล้ว_ห้ามรัน/ (ดูรายละเอียด/ประวัติที่นั่น)
--
-- โค้ดด้านล่าง "ไม่มีการแก้เนื้อหา" คัดลอกมาจากไฟล์เดิมตรงๆ (ยืนยันตรงกับ production 100%
-- แล้วจาก P2-03 — เทียบตัวอักษรผ่าน pg_get_functiondef ได้ 236 ตัวอักษรตรงกันเป๊ะ)
--
-- ใช้โดย: submit_class_request (sql/2026-08-02_rpc_guards_merged.sql) และ student_update_own_request
--   เรียกใช้ภายในเท่านั้น — หน้าเว็บเรียกตรงๆ ไม่ได้ (revoke ไว้ท้ายไฟล์)
-- รันซ้ำได้ปลอดภัย (CREATE OR REPLACE + REVOKE ไม่มีผลข้างเคียงถ้ารันซ้ำ)
-- ════════════════════════════════════════════════════════════════════════════

-- อ่านอีเมลจาก JWT ของ request ปัจจุบัน · นักเรียนไม่ได้ล็อกอิน = ไม่มี claims = คืน false
create or replace function public.is_teacher_caller()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_email text;
begin
  begin
    v_email := lower(coalesce(
      nullif(current_setting('request.jwt.claims', true), '')::json ->> 'email', ''));
  exception when others then
    v_email := '';
  end;
  return v_email = 'mr.taihualin@gmail.com';
end; $$;

-- ปิดสิทธิ์ ไม่ให้หน้าเว็บเรียกเองตรงๆ (ใช้ภายในฟังก์ชันอื่นเท่านั้น)
-- ต้อง revoke จาก "public" ด้วย ไม่ใช่แค่ anon/authenticated เพราะ Postgres แจกสิทธิ์ EXECUTE
-- ให้ role พิเศษชื่อ PUBLIC (= ทุกคน) อัตโนมัติทุกฟังก์ชันใหม่
revoke execute on function public.is_teacher_caller() from public, anon, authenticated;

-- ตรวจว่าไม่มีตัวซ้อนกัน (ต้องได้ 1 แถวเท่านั้น)
select p.proname, pg_get_function_identity_arguments(p.oid) as ช่องรับค่า
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'is_teacher_caller';
