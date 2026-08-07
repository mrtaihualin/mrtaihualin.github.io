-- ════════════════════════════════════════════════════════════════════════════
-- 2026-08-07 — เพิ่มด่าน UPDATE + DELETE ให้ classroom_recording_issues
-- (Lin ยืนยันแล้ว 2026-08-07 — เดิมมีแค่ด่าน INSERT/SELECT ครูแก้ไข/ลบรายการแจ้งปัญหาไม่ได้เลย)
-- ────────────────────────────────────────────────────────────────────────────
-- ที่มา: P2-02 ตรวจ RLS พบว่าตารางนี้ขาดด่าน UPDATE และ DELETE (ต่างจากอีก 3 ตารางที่ Lin
--   เลือกให้คงไว้แบบเดิม) — ใช้เงื่อนไขเดียวกับด่าน INSERT/SELECT ที่มีอยู่แล้ว (ตรวจจาก
--   supabase/schema/2026-08-07_02_policies.sql:88-96 — ทั้งคู่เช็คอีเมลครูจริงผ่าน auth.jwt())
-- รันซ้ำได้ปลอดภัย (ดัก duplicate_object)
-- ════════════════════════════════════════════════════════════════════════════

do $do$ begin
  execute 'create policy teacher_update_recording_issues on public.classroom_recording_issues '
    || 'as PERMISSIVE for UPDATE to public '
    || 'using (((auth.jwt() ->> ''email''::text) = ''mr.taihualin@gmail.com''::text)) '
    || 'with check (((auth.jwt() ->> ''email''::text) = ''mr.taihualin@gmail.com''::text))';
exception when duplicate_object then null;
end $do$;

do $do$ begin
  execute 'create policy teacher_delete_recording_issues on public.classroom_recording_issues '
    || 'as PERMISSIVE for DELETE to public '
    || 'using (((auth.jwt() ->> ''email''::text) = ''mr.taihualin@gmail.com''::text))';
exception when duplicate_object then null;
end $do$;

-- ตรวจว่าครบ 4 ด่านแล้ว (INSERT, SELECT, UPDATE, DELETE)
select policyname, cmd
from pg_policies
where schemaname = 'public' and tablename = 'classroom_recording_issues'
order by cmd;
-- ✅ ต้องเห็นครบ 4 แถว: INSERT, SELECT, UPDATE, DELETE
