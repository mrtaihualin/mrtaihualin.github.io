-- ════════════════════════════════════════════════════════════════════════════
-- 2026-08-08 — P6-09~12 ก้อน 2: ตาราง account_audit_log (ประวัติ/audit ของบัญชีผู้เล่น)
-- ────────────────────────────────────────────────────────────────────────────
-- ปัญหาที่แก้: ระบบบัญชีผู้เล่นไม่มีตาราง audit/history เลยแม้แต่แถวเดียว — ยืนยันจากผลตรวจ
--   `Bussiness Idea/ระบบเว็บไซต์/49_P6-09to12_ตรวจของจริง_เทียบสเปกบัญชีผู้เล่น.md` (หัวข้อปัญหาที่ 🟠
--   "ไม่มี Account history/audit เลยแม้แต่แถวเดียว") — ถ้าผู้เล่นมีปัญหาบัญชี (เช่น เชื่อม LINE/
--   Facebook ผิดคน) Lin ตรวจย้อนหลังไม่ได้เลยว่าเกิดอะไรขึ้นเมื่อไร
--
--   สเปกต้นฉบับ (`48_ต้นฉบับ_คำสั่งระบบบัญชีผู้เล่น_2026-08-08.md` หัวข้อ 14) บังคับว่า audit ต้อง
--   ครอบคลุม Link / Unlink / Email change / Password reset / Account merge / Premium transfer /
--   Admin correction / Account deletion และต้องรู้อย่างน้อย: เกิดอะไรขึ้น, เมื่อไร, จากสถานะอะไร,
--   เปลี่ยนเป็นอะไร, ใครเป็นคนทำ (user/admin)
--
--   งานนี้คือ "ก้อน 2" ตามลำดับที่วางไว้ใน 49_...md (โครงสร้างพื้นฐานที่ก้อน 4 "Admin tool" ต้องพึ่ง
--   เพราะสเปกข้อ 17 บังคับว่าทุกการแก้ของ Admin ต้องมีประวัติ) — รอบนี้สร้างตาราง+ฟังก์ชันเขียน
--   audit log แล้วต่อสายเข้ากับ 2 จุดที่ "เชื่อมสำเร็จจริง" ที่มีอยู่แล้วในเว็บ (เชื่อม LINE / เชื่อม
--   Facebook) เท่านั้น — event อื่น (unlink ฯลฯ) ยังไม่มีฟีเจอร์ในเว็บให้ต่อ รอก้อนถัดไป
--   ⚠️ ไม่แตะเรื่อง Unlink — ฟีเจอร์นั้นยังไม่เริ่ม รอ Lin ตัดสินใจกฎก่อน (ดู `52_คำสั่งเปิดแชทสอง_...md` เรื่องที่ 4)
--
-- สไตล์ตารางอ้างอิงจาก public.login_events (schema/2026-08-07_01_tables_and_constraints.sql:363-373):
--   id bigint generated always as identity, ไม่มี FK ไป auth.users ตั้งใจ (login_events ก็ไม่มี) —
--   กันปัญหา "ลบบัญชีแล้ว audit log หายไปด้วย (cascade)" ซึ่งขัดเป้าหมายของ audit log เอง
--
-- ⚠️ RLS: เปิดแล้ว "ไม่มี policy ใดๆ ตั้งใจ" (fail-closed) แบบเดียวกับ private.sql_run_log
--   (2026-08-07_migration_tracking.sql) — anon/authenticated อ่าน/เขียนตารางนี้ตรงผ่าน PostgREST
--   ไม่ได้เลย ต้องเขียนผ่านฟังก์ชัน public.log_account_audit() (SECURITY DEFINER) เท่านั้น ซึ่งยืนยัน
--   ตัวจริงของผู้เรียกฝั่งเซิร์ฟเวอร์เสมอ (แบบเดียวกับ line-login/index.ts) ไม่เชื่อค่าที่ client ส่งมาลอยๆ
--
-- รันซ้ำได้ (idempotent): create table if not exists / create or replace function /
--   do $do$ ... exception when duplicate_object ... สำหรับ constraint (แพทเทิร์นเดียวกับไฟล์อื่นใน repo นี้)
-- ════════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────
-- 1) ตาราง
-- ────────────────────────────────────────────────────────────────
create table if not exists public.account_audit_log (
  id           bigint generated always as identity primary key,
  user_id      uuid        not null,          -- บัญชีที่ถูกกระทำ (เจ้าของ event)
  event_type   text        not null,          -- เกิดอะไรขึ้น (link/unlink/... — ดู constraint ด้านล่าง)
  provider     text,                          -- ช่องทาง login ที่เกี่ยวข้อง (line/facebook/google/email) — ว่างได้ถ้า event ไม่ผูกกับ provider เดียว
  before_state jsonb,                         -- จากสถานะอะไร
  after_state  jsonb,                         -- เปลี่ยนเป็นอะไร
  actor_type   text        not null,          -- ใครเป็นคนทำ: 'user' เจ้าของบัญชีเอง / 'admin' / 'system' (cron/edge function อัตโนมัติ)
  actor_id     uuid,                          -- user_id ของผู้ทำ (ว่างได้เมื่อ actor_type='system' เช่นงานอัตโนมัติที่ไม่มีคนกด)
  created_at   timestamptz not null default now()  -- เมื่อไร
);

do $do$ begin
  execute 'alter table public.account_audit_log add constraint account_audit_log_event_type_check CHECK ((event_type = ANY (ARRAY[''link''::text, ''unlink''::text, ''email_change''::text, ''password_reset''::text, ''account_merge''::text, ''premium_transfer''::text, ''admin_correction''::text, ''account_deletion''::text])))';
exception when duplicate_object then null;
end $do$;

do $do$ begin
  execute 'alter table public.account_audit_log add constraint account_audit_log_actor_type_check CHECK ((actor_type = ANY (ARRAY[''user''::text, ''admin''::text, ''system''::text])))';
exception when duplicate_object then null;
end $do$;

alter table public.account_audit_log enable row level security;
-- ไม่มี policy ใดๆ ตั้งใจ — anon/authenticated อ่าน/เขียนตรงผ่าน PostgREST ไม่ได้เลย (fail-closed)
-- เขียนได้ทางเดียวคือผ่านฟังก์ชัน public.log_account_audit() ด้านล่าง (SECURITY DEFINER ข้าม RLS ได้)
-- อ่านได้ตอนนี้เฉพาะผ่าน Supabase SQL Editor (สิทธิ์ postgres ข้าม RLS อยู่แล้ว) — หน้า Admin ในอนาคต (ก้อน 4)
-- ต้องเพิ่มฟังก์ชัน SECURITY DEFINER แยกสำหรับ "อ่าน" ที่ตรวจสิทธิ์ Admin จริง ไม่ใช่เปิด policy ให้ authenticated อ่านตรงๆ

create index if not exists idx_account_audit_log_user on public.account_audit_log using btree (user_id, created_at desc);
create index if not exists idx_account_audit_log_event on public.account_audit_log using btree (event_type);

-- ────────────────────────────────────────────────────────────────
-- 2) ฟังก์ชันเขียน audit log — จุดเดียวที่เขียนตารางนี้ได้ (เรียกจาก RPC/Edge Function เท่านั้น)
-- ────────────────────────────────────────────────────────────────
-- กติกาการยืนยันตัวตน (แบบเดียวกับ line-login/index.ts — ไม่เชื่อค่าที่ client ส่งมาตรงๆ):
--   · เรียกจาก service_role (Edge Function เช่น line-login) → ผ่านได้ทุก actor_type (Edge Function
--     ยืนยันตัวผู้เรียกจาก JWT เองแล้วก่อนหน้านี้ในโค้ดของมัน)
--   · เรียกจาก client ทั่วไป (anon/authenticated ผ่าน supabase-js .rpc()) → ต้องล็อกอินอยู่จริง
--     (auth.uid() ไม่ว่าง) และบันทึกได้เฉพาะ actor_type='user' + actor_id ต้องตรงกับ auth.uid() +
--     user_id ต้องเป็นบัญชีของตัวเอง (ห้ามเขียน audit log แทนบัญชีคนอื่น)
create or replace function public.log_account_audit(
  p_user_id      uuid,
  p_event_type   text,
  p_before_state jsonb,
  p_after_state  jsonb,
  p_actor_type   text,
  p_actor_id     uuid,
  p_provider     text default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if p_user_id is null then
    raise exception 'p_user_id required';
  end if;
  if p_actor_type is null or p_actor_type not in ('user', 'admin', 'system') then
    raise exception 'invalid actor_type: %', coalesce(p_actor_type, 'null');
  end if;

  if auth.role() <> 'service_role' then
    -- ไม่ใช่ Edge Function ที่ใช้ service_role key → ต้องเป็นผู้ใช้ที่ล็อกอินอยู่จริง เขียนได้แค่ของตัวเอง
    if auth.uid() is null then
      raise exception 'must be logged in to call log_account_audit';
    end if;
    if p_actor_type <> 'user' then
      raise exception 'only service_role (Edge Function) may log actor_type=%', p_actor_type;
    end if;
    if p_actor_id is distinct from auth.uid() then
      raise exception 'actor_id must match the authenticated caller';
    end if;
    if p_user_id is distinct from auth.uid() then
      raise exception 'a user can only log audit events on their own account';
    end if;
  end if;

  insert into public.account_audit_log (user_id, event_type, provider, before_state, after_state, actor_type, actor_id)
  values (p_user_id, p_event_type, p_provider, p_before_state, p_after_state, p_actor_type, p_actor_id);
end;
$function$;

-- ════════════════════════════════════════════════════════════════════════════
-- [B] ตรวจว่าสำเร็จจริง — รันหลัง [A] เสมอ
-- ════════════════════════════════════════════════════════════════════════════
-- ✅ ต้องได้ 1 แถว, มีกี่เวอร์ชัน = 1, security_definer = true
select p.proname                                 as ฟังก์ชัน,
       count(*) over (partition by p.proname)    as มีกี่เวอร์ชัน,
       pg_get_function_identity_arguments(p.oid) as ช่องรับค่า,
       p.prosecdef                               as security_definer
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'log_account_audit';

-- ✅ ต้องได้ 1 แถว, rowsecurity = true
select relname, relrowsecurity as rls_เปิดอยู่
from pg_class
where relname = 'account_audit_log';

-- ✅ ต้องได้ 0 แถว (ไม่มี policy ใดๆ ตั้งใจ — fail-closed)
select policyname from pg_policies where tablename = 'account_audit_log';
