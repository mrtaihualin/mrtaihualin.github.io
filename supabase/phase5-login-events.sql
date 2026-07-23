-- ════════════════════════════════════════════════════════════
-- Phase 5 กันหลายบัญชี — ตาราง login_events (เก็บ IP/fingerprint/UA)
-- รันใน Supabase Dashboard → SQL Editor
-- ════════════════════════════════════════════════════════════

-- 1) ตารางเก็บเหตุการณ์ล็อกอิน (เขียนผ่าน Edge Function service_role เท่านั้น)
create table if not exists public.login_events (
  id          bigint generated always as identity primary key,
  user_id     uuid not null,
  email       text,
  ip          text,
  fingerprint text,
  user_agent  text,
  event       text,
  created_at  timestamptz not null default now()
);

-- 2) เปิด RLS ไม่ใส่ policy = client อ่าน/เขียนไม่ได้เลย (service_role ข้ามได้)
alter table public.login_events enable row level security;

-- 3) index ช่วยคิวรีจับซ้ำให้เร็ว
create index if not exists idx_login_events_fp   on public.login_events(fingerprint);
create index if not exists idx_login_events_ip   on public.login_events(ip);
create index if not exists idx_login_events_user on public.login_events(user_id);


-- ════════════════════════════════════════════════════════════
-- คิวรีจับซ้ำ (รันก่อนเปิดแลกเงิน + เป็นระยะ) — ตัด Lin เองออกแล้ว
-- ════════════════════════════════════════════════════════════

-- A) fingerprint เดียว หลายบัญชี = สัญญาณแรงสุด (เครื่องเดียวเปิดหลาย account)
select fingerprint,
       count(distinct user_id)      as accounts,
       array_agg(distinct email)    as emails,
       max(created_at)              as last_seen
from public.login_events
where fingerprint is not null and fingerprint <> ''
  and email is distinct from 'mr.taihualin@gmail.com'
group by fingerprint
having count(distinct user_id) > 1
order by accounts desc;

-- B) IP เดียว หลายบัญชี = สัญญาณอ่อน (ครอบครัว/ไวไฟเดียวกันได้จริง) ตั้ง >2 กัน false positive
select ip,
       count(distinct user_id)   as accounts,
       array_agg(distinct email) as emails,
       max(created_at)           as last_seen
from public.login_events
where ip is not null
  and email is distinct from 'mr.taihualin@gmail.com'
group by ip
having count(distinct user_id) > 2
order by accounts desc;
