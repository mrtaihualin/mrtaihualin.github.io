-- 🛑🛑🛑 ห้ามรันไฟล์นี้กับฐานข้อมูลจริงโดยไม่จำเป็น 🛑🛑🛑
--
-- ไฟล์นี้คือ "แบบแปลนย้อนหลัง" ของฐานข้อมูล ณ วันที่ 2026-08-07
-- สร้างโดยให้ฐานข้อมูลจริงพ่นโครงสร้างตัวเองออกมา (อ่านอย่างเดียว) แล้วจัดเป็นไฟล์
-- ที่มา: งาน P2-05 · รายงาน `Bussiness Idea/ระบบเว็บไซต์/20_ผลตรวจ_P2_database_rls.md`
--
-- ทำไมต้องมี: ตรวจแล้วพบว่า 21 จาก 37 ตาราง และ 34 จาก 41 ด่าน RLS
-- ไม่มีไฟล์ต้นฉบับใน repo เลย รวมถึง classroom_students และ classroom_payments
-- = ฐานข้อมูลหายแล้วสร้างโครงคืนไม่ได้
--
-- ใช้ตอนไหน:
--   ✅ สร้างฐานข้อมูลใหม่จากศูนย์ (staging / sandbox / กู้คืนหลังภัยพิบัติ)
--   ✅ อ่านเทียบว่าโครงสร้างปัจจุบันเปลี่ยนไปจากวันนี้หรือยัง
--   ❌ ห้ามรันกับฐานข้อมูล production ที่ใช้งานอยู่ (ไม่ได้ตั้งใจให้ใช้แบบนั้น)
--
-- ทุกคำสั่งเขียนให้รันซ้ำได้ (if not exists / ดักข้อผิดพลาดของซ้ำ) แต่ก็ยังไม่ควรรันกับของจริง
--

-- ไฟล์นี้เก็บ 'ด่าน RLS' ทั้ง 41 ด่าน ที่มีอยู่จริงในฐานข้อมูล ณ 2026-08-07
-- ต้องรันหลังไฟล์ 01 เสมอ (ตารางต้องมีก่อน)



-- ── anon_game_events ──
do $do$ begin
  execute 'create policy anon_game_events_insert_anyone on public.anon_game_events as PERMISSIVE for INSERT to anon, authenticated with check (true)';
exception when duplicate_object then null;
end $do$;

-- ── audio_assets ──
do $do$ begin
  execute 'create policy "no public delete" on public.audio_assets as PERMISSIVE for DELETE to public using (false)';
exception when duplicate_object then null;
end $do$;
do $do$ begin
  execute 'create policy "no public insert" on public.audio_assets as PERMISSIVE for INSERT to public with check (false)';
exception when duplicate_object then null;
end $do$;
do $do$ begin
  execute 'create policy "no public select" on public.audio_assets as PERMISSIVE for SELECT to public using (false)';
exception when duplicate_object then null;
end $do$;
do $do$ begin
  execute 'create policy "no public update" on public.audio_assets as PERMISSIVE for UPDATE to public using (false)';
exception when duplicate_object then null;
end $do$;

-- ── classroom_attendance ──
do $do$ begin
  execute 'create policy "teacher only" on public.classroom_attendance as PERMISSIVE for ALL to public using (((auth.jwt() ->> ''email''::text) = ''mr.taihualin@gmail.com''::text)) with check (((auth.jwt() ->> ''email''::text) = ''mr.taihualin@gmail.com''::text))';
exception when duplicate_object then null;
end $do$;

-- ── classroom_calendar_backups ──
do $do$ begin
  execute 'create policy teacher_insert_backups on public.classroom_calendar_backups as PERMISSIVE for INSERT to authenticated with check (((auth.jwt() ->> ''email''::text) = ''mr.taihualin@gmail.com''::text))';
exception when duplicate_object then null;
end $do$;
do $do$ begin
  execute 'create policy teacher_select_backups on public.classroom_calendar_backups as PERMISSIVE for SELECT to authenticated using (((auth.jwt() ->> ''email''::text) = ''mr.taihualin@gmail.com''::text))';
exception when duplicate_object then null;
end $do$;
do $do$ begin
  execute 'create policy teacher_update_backups on public.classroom_calendar_backups as PERMISSIVE for UPDATE to authenticated using (((auth.jwt() ->> ''email''::text) = ''mr.taihualin@gmail.com''::text)) with check (((auth.jwt() ->> ''email''::text) = ''mr.taihualin@gmail.com''::text))';
exception when duplicate_object then null;
end $do$;

-- ── classroom_feedback ──
do $do$ begin
  execute 'create policy anyone_insert on public.classroom_feedback as PERMISSIVE for INSERT to public with check ((COALESCE(approved, false) = false))';
exception when duplicate_object then null;
end $do$;
do $do$ begin
  execute 'create policy teacher_select_feedback on public.classroom_feedback as PERMISSIVE for SELECT to public using (((auth.jwt() ->> ''email''::text) = ''mr.taihualin@gmail.com''::text))';
exception when duplicate_object then null;
end $do$;
do $do$ begin
  execute 'create policy teacher_update_feedback on public.classroom_feedback as PERMISSIVE for UPDATE to public using (((auth.jwt() ->> ''email''::text) = ''mr.taihualin@gmail.com''::text)) with check (((auth.jwt() ->> ''email''::text) = ''mr.taihualin@gmail.com''::text))';
exception when duplicate_object then null;
end $do$;

-- ── classroom_payments ──
do $do$ begin
  execute 'create policy "teacher only" on public.classroom_payments as PERMISSIVE for ALL to public using (((auth.jwt() ->> ''email''::text) = ''mr.taihualin@gmail.com''::text)) with check (((auth.jwt() ->> ''email''::text) = ''mr.taihualin@gmail.com''::text))';
exception when duplicate_object then null;
end $do$;

-- ── classroom_recording_issues ──
do $do$ begin
  execute 'create policy teacher_insert_recording_issues on public.classroom_recording_issues as PERMISSIVE for INSERT to public with check (((auth.jwt() ->> ''email''::text) = ''mr.taihualin@gmail.com''::text))';
exception when duplicate_object then null;
end $do$;
do $do$ begin
  execute 'create policy teacher_select_recording_issues on public.classroom_recording_issues as PERMISSIVE for SELECT to public using (((auth.jwt() ->> ''email''::text) = ''mr.taihualin@gmail.com''::text))';
exception when duplicate_object then null;
end $do$;

-- ── classroom_recordings ──
do $do$ begin
  execute 'create policy "teacher only" on public.classroom_recordings as PERMISSIVE for ALL to public using (((auth.jwt() ->> ''email''::text) = ''mr.taihualin@gmail.com''::text)) with check (((auth.jwt() ->> ''email''::text) = ''mr.taihualin@gmail.com''::text))';
exception when duplicate_object then null;
end $do$;

-- ── classroom_recurring_days ──
do $do$ begin
  execute 'create policy teacher_all_recurring_days on public.classroom_recurring_days as PERMISSIVE for ALL to public using (((auth.jwt() ->> ''email''::text) = ''mr.taihualin@gmail.com''::text)) with check (((auth.jwt() ->> ''email''::text) = ''mr.taihualin@gmail.com''::text))';
exception when duplicate_object then null;
end $do$;

-- ── classroom_requests ──
do $do$ begin
  execute 'create policy teacher_insert_requests on public.classroom_requests as PERMISSIVE for INSERT to authenticated with check (((auth.jwt() ->> ''email''::text) = ''mr.taihualin@gmail.com''::text))';
exception when duplicate_object then null;
end $do$;
do $do$ begin
  execute 'create policy teacher_select_requests on public.classroom_requests as PERMISSIVE for SELECT to public using (((auth.jwt() ->> ''email''::text) = ''mr.taihualin@gmail.com''::text))';
exception when duplicate_object then null;
end $do$;
do $do$ begin
  execute 'create policy teacher_update_requests on public.classroom_requests as PERMISSIVE for UPDATE to authenticated using (((auth.jwt() ->> ''email''::text) = ''mr.taihualin@gmail.com''::text)) with check (((auth.jwt() ->> ''email''::text) = ''mr.taihualin@gmail.com''::text))';
exception when duplicate_object then null;
end $do$;

-- ── classroom_schedule ──
do $do$ begin
  execute 'create policy teacher_delete_schedule on public.classroom_schedule as PERMISSIVE for DELETE to public using (((auth.jwt() ->> ''email''::text) = ''mr.taihualin@gmail.com''::text))';
exception when duplicate_object then null;
end $do$;
do $do$ begin
  execute 'create policy teacher_insert_schedule on public.classroom_schedule as PERMISSIVE for INSERT to public with check (((auth.jwt() ->> ''email''::text) = ''mr.taihualin@gmail.com''::text))';
exception when duplicate_object then null;
end $do$;
do $do$ begin
  execute 'create policy teacher_select_schedule on public.classroom_schedule as PERMISSIVE for SELECT to public using (((auth.jwt() ->> ''email''::text) = ''mr.taihualin@gmail.com''::text))';
exception when duplicate_object then null;
end $do$;
do $do$ begin
  execute 'create policy teacher_update_schedule on public.classroom_schedule as PERMISSIVE for UPDATE to public using (((auth.jwt() ->> ''email''::text) = ''mr.taihualin@gmail.com''::text)) with check (((auth.jwt() ->> ''email''::text) = ''mr.taihualin@gmail.com''::text))';
exception when duplicate_object then null;
end $do$;

-- ── classroom_students ──
do $do$ begin
  execute 'create policy "teacher only" on public.classroom_students as PERMISSIVE for ALL to public using (((auth.jwt() ->> ''email''::text) = ''mr.taihualin@gmail.com''::text)) with check (((auth.jwt() ->> ''email''::text) = ''mr.taihualin@gmail.com''::text))';
exception when duplicate_object then null;
end $do$;

-- ── game_accounts ──
do $do$ begin
  execute 'create policy "own row select" on public.game_accounts as PERMISSIVE for SELECT to public using ((auth.uid() = user_id))';
exception when duplicate_object then null;
end $do$;

-- ── game_reward_events ──
do $do$ begin
  execute 'create policy "insert own reward events" on public.game_reward_events as PERMISSIVE for INSERT to public with check (((auth.uid() = user_id) AND (status = ''pending''::text) AND (points_awarded = 0)))';
exception when duplicate_object then null;
end $do$;
do $do$ begin
  execute 'create policy "select own reward events" on public.game_reward_events as PERMISSIVE for SELECT to public using ((auth.uid() = user_id))';
exception when duplicate_object then null;
end $do$;

-- ── game_reward_points ──
do $do$ begin
  execute 'create policy "select own points" on public.game_reward_points as PERMISSIVE for SELECT to public using ((auth.uid() = user_id))';
exception when duplicate_object then null;
end $do$;

-- ── leads ──
do $do$ begin
  execute 'create policy "anon insert leads" on public.leads as PERMISSIVE for INSERT to anon with check (true)';
exception when duplicate_object then null;
end $do$;

-- ── profiles ──
do $do$ begin
  execute 'create policy "manage own profile" on public.profiles as PERMISSIVE for ALL to authenticated using ((auth.uid() = user_id)) with check ((auth.uid() = user_id))';
exception when duplicate_object then null;
end $do$;

-- ── reading_sessions ──
do $do$ begin
  execute 'create policy "rs own insert" on public.reading_sessions as PERMISSIVE for INSERT to public with check ((auth.uid() = user_id))';
exception when duplicate_object then null;
end $do$;
do $do$ begin
  execute 'create policy "rs own select" on public.reading_sessions as PERMISSIVE for SELECT to public using ((auth.uid() = user_id))';
exception when duplicate_object then null;
end $do$;

-- ── star_ledger ──
do $do$ begin
  execute 'create policy star_ledger_select_own on public.star_ledger as PERMISSIVE for SELECT to public using ((auth.uid() = user_id))';
exception when duplicate_object then null;
end $do$;

-- ── tone_progress ──
do $do$ begin
  execute 'create policy tone_progress_insert_own on public.tone_progress as PERMISSIVE for INSERT to public with check ((auth.uid() = user_id))';
exception when duplicate_object then null;
end $do$;
do $do$ begin
  execute 'create policy tone_progress_select_own on public.tone_progress as PERMISSIVE for SELECT to public using ((auth.uid() = user_id))';
exception when duplicate_object then null;
end $do$;
do $do$ begin
  execute 'create policy tone_progress_update_own on public.tone_progress as PERMISSIVE for UPDATE to public using ((auth.uid() = user_id)) with check ((auth.uid() = user_id))';
exception when duplicate_object then null;
end $do$;

-- ── tone_sessions ──
do $do$ begin
  execute 'create policy "insert own sessions" on public.tone_sessions as PERMISSIVE for INSERT to authenticated with check ((auth.uid() = user_id))';
exception when duplicate_object then null;
end $do$;
do $do$ begin
  execute 'create policy "read own sessions" on public.tone_sessions as PERMISSIVE for SELECT to public using ((auth.uid() = user_id))';
exception when duplicate_object then null;
end $do$;
do $do$ begin
  execute 'create policy "select own sessions" on public.tone_sessions as PERMISSIVE for SELECT to authenticated using ((auth.uid() = user_id))';
exception when duplicate_object then null;
end $do$;

-- ── tone_srs_state ──
do $do$ begin
  execute 'create policy tone_srs_select_own on public.tone_srs_state as PERMISSIVE for SELECT to public using ((auth.uid() = user_id))';
exception when duplicate_object then null;
end $do$;
