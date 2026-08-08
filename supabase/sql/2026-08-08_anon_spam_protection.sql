-- ════════════════════════════════════════════════════════════════════════════
-- 2026-08-08 — กันสแปม/ยิงรัวให้ anon_game_events + leads (DRAFT — ยังไม่ได้รัน)
-- ────────────────────────────────────────────────────────────────────────────
-- ปัญหาที่แก้: ทั้ง 2 ตารางเปิดให้ anon insert ได้แบบ WITH CHECK (true) ล้วนๆ
--   (ดู supabase/schema/2026-08-07_02_policies.sql บรรทัด ~26 กับ ~172)
--   ไม่มีเพดานอะไรกั้นเลย — สคริปต์/บอทยิง insert รัวได้ไม่จำกัดทั้งสองตาราง
--
-- แนวทาง: ไม่แก้โค้ดฝั่งเว็บเลยแม้แต่บรรทัดเดียว — ผูกเพดานเข้ากับ RLS policy
--   โดยตรงผ่านฟังก์ชันช่วยใน WITH CHECK (client ยังยิง insert ตรงๆ แบบเดิมทุกอย่าง
--   ถ้าเกินเพดาน Postgres จะตีกลับ error request ที่ฝั่งเว็บ ไม่ได้ทำอะไรผิดปกติ)
--
-- ใช้ตารางนับที่มีอยู่แล้ว `public.game_content_rl` + ฟังก์ชัน `game_content_rl_check`
--   (ต้นฉบับ: sql/2026-08-02_game_content_schema.sql) — เป็นระบบนับ "ช่องเวลา" แบบ
--   คีย์ text ทั่วไปอยู่แล้ว (รองรับ 'user:<uuid>' / 'ip:<ip>' มาก่อน) ไม่ต้องสร้างตารางใหม่
--   คีย์ของงานนี้ตั้ง prefix ใหม่ (`anon_ev:` / `leads_email:` / `leads_global`) กันชนกับคีย์เดิม
--
-- เพดานที่เลือก (ปรับได้ทีหลังแค่แก้ตัวเลขในไฟล์นี้แล้วรันซ้ำ — CREATE OR REPLACE):
--   · anon_game_events: ≤ 30 แถว ต่อ anon_id ต่อ 10 นาที (เกมปกติกดหลายรอบได้สบายๆ
--     แต่กันสคริปต์ยิงเป็นพันแถวต่อวินาที)
--   · leads: ≤ 3 แถว ต่ออีเมลเดียวกัน ต่อ 24 ชม. (ฟอร์มสมัคร/สนใจคอร์ส ไม่มีเหตุผลต้องส่งซ้ำถี่)
--     + เพดานรวมทั้งระบบ ≤ 50 แถว ต่อ 10 นาที (กันบอทสุ่มอีเมลคนละอันยิงรัว หลบเพดานต่ออีเมล)
--
-- ⚠️ ไม่มีค่าลับในไฟล์นี้ · รันซ้ำได้ (create or replace function, drop policy if exists + create)
-- ════════════════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════════════════════
-- [A] ฟังก์ชันช่วย — ต้องรันก่อน policy
-- ════════════════════════════════════════════════════════════════════════════

-- ── anon_game_events ──
-- ห่อ game_content_rl_check ไว้อีกชั้น เพื่อ (1) กันไม่ให้ anon_id ว่าง/null หลุดผ่าน
-- และ (2) เป็นจุดเดียวที่ policy เรียก ถ้าจะเปลี่ยนเพดานทีหลังแก้ที่นี่ที่เดียว
create or replace function public.anon_game_events_rate_ok(p_anon_id text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_anon_id is null or length(trim(p_anon_id)) = 0 then
    return false; -- ไม่มี anon_id มายืนยันตัวตนขั้นต่ำ ไม่ให้เขียน
  end if;
  -- ≤ 30 แถว ต่อ anon_id ต่อ 10 นาที (600 วินาที)
  return public.game_content_rl_check('anon_ev:' || p_anon_id, 30, 600);
end;
$$;

-- ⚠️ ไม่ revoke execute — ต่างจากฟังก์ชันช่วยตัวอื่นในระบบนี้โดยตั้งใจ เพราะฟังก์ชันนี้ถูกเรียก
-- "จาก RLS WITH CHECK" ตอน anon/authenticated ยิง insert ตรงๆ ผ่าน supabase-js บนเบราว์เซอร์
-- (ไม่ได้ผ่าน Edge Function/service_role เหมือน game_content_rl_check เดิม) จึงต้องให้ anon/authenticated
-- เรียกได้ตรงๆ — ตัวฟังก์ชันเองเป็น SECURITY DEFINER อยู่แล้ว จึงเขียนตาราง game_content_rl ได้ปลอดภัย
-- แม้ anon จะไม่มีสิทธิ์แตะตารางนั้นตรงๆ เลยก็ตาม
grant execute on function public.anon_game_events_rate_ok(text) to anon, authenticated;

-- ── leads ──
create or replace function public.leads_rate_ok(p_email text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email_ok  boolean;
  v_global_ok boolean;
begin
  if p_email is null or length(trim(p_email)) = 0 then
    return false;
  end if;
  -- ≤ 3 แถว ต่ออีเมลเดียวกัน (ตัวพิมพ์เล็ก-ใหญ่ไม่ต่างกัน) ต่อ 24 ชม. (86400 วินาที)
  v_email_ok  := public.game_content_rl_check('leads_email:' || lower(p_email), 3, 86400);
  -- กันบอทสุ่มอีเมลคนละอันยิงรัวหลบเพดานต่ออีเมล — เพดานรวมทั้งระบบ ≤ 50 แถว ต่อ 10 นาที
  v_global_ok := public.game_content_rl_check('leads_global', 50, 600);
  return v_email_ok and v_global_ok;
end;
$$;

-- ⚠️ ไม่ revoke execute — เหตุผลเดียวกับ anon_game_events_rate_ok ด้านบน (เรียกจาก RLS WITH CHECK ตรงๆ)
grant execute on function public.leads_rate_ok(text) to anon, authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- [B] แก้ policy — ผูกเพดานเข้ากับ WITH CHECK (แทนที่ WITH CHECK (true) เดิม)
-- ════════════════════════════════════════════════════════════════════════════

-- ── anon_game_events ──
drop policy if exists anon_game_events_insert_anyone on public.anon_game_events;
create policy anon_game_events_insert_anyone
  on public.anon_game_events
  as permissive
  for insert
  to anon, authenticated
  with check (public.anon_game_events_rate_ok(anon_id));

-- ── leads ──
drop policy if exists "anon insert leads" on public.leads;
create policy "anon insert leads"
  on public.leads
  as permissive
  for insert
  to anon
  with check (public.leads_rate_ok(email));

-- ════════════════════════════════════════════════════════════════════════════
-- [C] ตรวจว่าสำเร็จจริง — รันหลัง [A]+[B] เสมอ
-- ════════════════════════════════════════════════════════════════════════════

-- ✅ ต้องได้ 2 แถว, มีกี่เวอร์ชัน = 1 ทุกแถว, security_definer = true ทุกแถว
select p.proname                                 as ฟังก์ชัน,
       count(*) over (partition by p.proname)    as มีกี่เวอร์ชัน,
       pg_get_function_identity_arguments(p.oid) as ช่องรับค่า,
       p.prosecdef                               as security_definer
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('anon_game_events_rate_ok', 'leads_rate_ok');

-- ✅ ต้องเห็นทั้ง anon และ authenticated มีสิทธิ์ execute (has_function_privilege = true)
select 'anon_game_events_rate_ok' as ฟังก์ชัน, 'anon' as role,
       has_function_privilege('anon', 'public.anon_game_events_rate_ok(text)', 'execute') as execute_ได้
union all
select 'anon_game_events_rate_ok', 'authenticated',
       has_function_privilege('authenticated', 'public.anon_game_events_rate_ok(text)', 'execute')
union all
select 'leads_rate_ok', 'anon',
       has_function_privilege('anon', 'public.leads_rate_ok(text)', 'execute')
union all
select 'leads_rate_ok', 'authenticated',
       has_function_privilege('authenticated', 'public.leads_rate_ok(text)', 'execute');

-- ✅ ต้องได้ 1 แถว ต่อตาราง และ with check ต้องไม่ใช่ 'true' เปล่าๆ อีกต่อไป
select tablename, policyname, cmd, with_check
from pg_policies
where tablename in ('anon_game_events', 'leads')
  and cmd = 'INSERT';

-- ════════════════════════════════════════════════════════════════════════════
-- [D] ทางย้อนกลับ ถ้าต้องปลดเพดานฉุกเฉิน (ห้ามรันพร้อม [B] — เก็บไว้เผื่อใช้ทีหลังเท่านั้น)
-- ════════════════════════════════════════════════════════════════════════════
-- drop policy if exists anon_game_events_insert_anyone on public.anon_game_events;
-- create policy anon_game_events_insert_anyone on public.anon_game_events
--   as permissive for insert to anon, authenticated with check (true);
--
-- drop policy if exists "anon insert leads" on public.leads;
-- create policy "anon insert leads" on public.leads
--   as permissive for insert to anon with check (true);
