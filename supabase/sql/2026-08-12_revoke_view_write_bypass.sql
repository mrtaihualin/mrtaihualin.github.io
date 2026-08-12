-- ════════════════════════════════════════════════════════════
-- 2026-08-12_revoke_view_write_bypass.sql
-- ปิดช่องโหว่: 3 view เป็น SECURITY DEFINER-style (ไม่ได้ตั้ง security_invoker)
-- เจอจากการตรวจ production security advisors (get_advisors type=security) — ไม่เคยมีในเอกสารไหนมาก่อน
--
-- ปัญหาจริงที่เจอ (ยืนยันด้วย query สดบน production ก่อนแก้):
--   1. `approved_testimonials` (อ่านจาก classroom_feedback WHERE approved=true, ใช้จริงใน pricing.html
--      เพื่อโชว์รีวิวลูกค้า) เป็น auto-updatable view (is_updatable=YES, is_insertable_into=YES)
--      และมี grant ตกค้าง INSERT/UPDATE/DELETE/TRUNCATE ให้ anon+authenticated ตั้งแต่สร้าง view
--      ไม่มีใคร REVOKE ออก — เพราะ owner ของ view คือ postgres ที่ rolbypassrls=true จริง
--      (ยืนยันจาก pg_roles) การเขียนผ่าน view นี้จึง**บายพาส RLS ของ classroom_feedback ทั้งหมด**:
--        - UPDATE: ปกติมีแค่ครูแก้ได้ (teacher_update_feedback) แต่ผ่าน view นี้ anon ก็แก้ได้
--        - DELETE: classroom_feedback ไม่มีนโยบาย DELETE เลยแม้แต่ข้อเดียว (ตั้งใจ) แต่ผ่าน view
--          นี้ anon ลบรีวิวที่อนุมัติแล้วได้หมด — ขัดกับการตั้งใจเดิมโดยตรง
--      → **ใครก็ตามที่ไม่ล็อกอินสามารถแก้ไข/ลบรีวิวลูกค้าที่อนุมัติแล้วทั้งหมดได้** (ยืนยันด้วยการยิง
--        PATCH/DELETE จริงก่อนแก้ — ได้ 200/สำเร็จ)
--   2. `v_unexplained_stars` (เครื่องมือตรวจทุจริตดาวภายใน — เทียบ game_accounts กับ backup snapshot
--      + star_ledger หา user_id ที่มีดาวเกินจริง) มี SELECT grant ให้ anon+authenticated ทั้งที่ grep
--      ทั้ง repo ไม่พบว่ามีหน้าเว็บไหนเรียกใช้เลย — เป็น internal fraud-audit tool ที่หลุดสู่สาธารณะ
--   3. `v_stars_overview` (สถิติรวม ไม่มี PII) มี SELECT grant ให้ anon+authenticated เช่นกัน
--      ไม่มีหน้าเว็บไหนใช้เลย — เกิน least-privilege โดยไม่จำเป็น
--
-- ทำไมแก้ด้วย REVOKE อย่างเดียว ไม่แตะ view definition / security_invoker:
--   `approved_testimonials` ต้อง bypass RLS ของ classroom_feedback ต่อไปสำหรับ SELECT (ตั้งใจ —
--   classroom_feedback เองมี RLS จำกัด SELECT ไว้แค่ครูคนเดียว ถ้าเปลี่ยนเป็น security_invoker=true
--   จะทำให้ pricing.html อ่านรีวิวไม่ได้เลยทันที) — REVOKE เฉพาะสิทธิ์เขียนตรงจุดที่ไม่ควรมีเลย
--
-- Work Collision Safety: ตรวจ grants + view definitions สดก่อนรัน (2026-08-12) ตรงกับผล audit
-- เดิมทุกตัว ไม่มีใครมาเปลี่ยนระหว่างทาง
--
-- ✅ อนุมัติโดย Lin 2026-08-12 · รันจริงบน production (qzkxlhpcputsvbqmtqfi) แล้ว 2026-08-12
--    ยืนยันหลังรันด้วย: (1) query grants — approved_testimonials เหลือแค่ SELECT/REFERENCES/TRIGGER
--    (2) ยิง REST จริงด้วย anon key: SELECT approved_testimonials = 200 (ปกติ, pricing.html ไม่พัง),
--        PATCH/DELETE approved_testimonials = 401 permission denied (ปิดช่องโหว่แล้ว),
--        SELECT v_unexplained_stars = 401, SELECT v_stars_overview = 401
-- ════════════════════════════════════════════════════════════

-- [A] ตรวจก่อนแก้ (baseline — รันดูก่อนทุกครั้งที่จะรันไฟล์นี้ซ้ำ)
select table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_name in ('approved_testimonials','v_unexplained_stars','v_stars_overview')
  and grantee in ('anon','authenticated')
order by table_name, grantee, privilege_type;

-- [B] ปิดช่องโหว่ write-bypass ของ approved_testimonials (เหลือแค่อ่านได้ ตรงกับที่ pricing.html ใช้จริง)
revoke insert, update, delete, truncate
on public.approved_testimonials
from anon, authenticated;

-- [C] ปิดการอ่านของ 2 view internal-only ที่ไม่มีใครใช้จากเว็บเลย (grep ยืนยันแล้ว)
revoke select on public.v_unexplained_stars from anon, authenticated;
revoke select on public.v_stars_overview from anon, authenticated;

-- [D] ตรวจหลังแก้ — approved_testimonials เหลือแค่ SELECT/REFERENCES/TRIGGER
--     อีก 2 view ต้องไม่มี SELECT เหลือให้ anon/authenticated เลย
select table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_name in ('approved_testimonials','v_unexplained_stars','v_stars_overview')
  and grantee in ('anon','authenticated')
order by table_name, grantee, privilege_type;

-- [Z] rollback (ย้อนกลับถ้าจำเป็น — REVOKE เป็นการลดสิทธิ์ ไม่ทำลายข้อมูล ไม่คาดว่าต้องใช้)
-- grant insert, update, delete, truncate on public.approved_testimonials to anon, authenticated;
-- grant select on public.v_unexplained_stars to anon, authenticated;
-- grant select on public.v_stars_overview to anon, authenticated;
