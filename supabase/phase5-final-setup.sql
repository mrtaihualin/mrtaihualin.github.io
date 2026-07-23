-- ════════════════════════════════════════════════════════════
-- Phase 5 ชุดปิดท้าย — payout_ledger + เปิด pg_cron รายวัน
-- ⚠️ ก่อนรัน: เปิด extension ก่อน — Dashboard → Database → Extensions → ค้น pg_cron → เปิด
-- แล้วค่อยวางไฟล์นี้ทั้งไฟล์ใน SQL Editor → Run
-- ════════════════════════════════════════════════════════════

-- 1) ตาราง payout_ledger — บันทึกทุกการจ่ายเงิน กันจ่ายซ้ำ (สร้างไว้ก่อน ระบบเงินมาต่อ ต.ค.)
create table if not exists public.payout_ledger (
  id             bigint generated always as identity primary key,
  user_id        uuid not null,
  stars_redeemed int  not null check (stars_redeemed > 0),
  amount         numeric(10,2) not null check (amount > 0),
  currency       text not null default 'THB',
  status         text not null default 'pending'
                 check (status in ('pending','approved','paid','rejected')),
  precheck_ok    boolean not null,          -- ผล payout_precheck ตอนขอถอน (ต้อง true)
  approved_by    text,                       -- อีเมล Lin ตอนกดอนุมัติ (ห้ามจ่ายอัตโนมัติ)
  note           text,
  created_at     timestamptz not null default now(),
  approved_at    timestamptz,
  paid_at        timestamptz
);
alter table public.payout_ledger enable row level security;
-- ไม่มี policy = client อ่าน/เขียนไม่ได้เลย (เขียนผ่าน Edge Function service_role เท่านั้น)
create index if not exists idx_payout_ledger_user on public.payout_ledger(user_id);

-- กันจ่ายซ้ำชั้นฐานข้อมูล: 1 คน มีรายการค้าง (pending/approved) ได้ทีละ 1 รายการ
create unique index if not exists uq_payout_open_per_user
  on public.payout_ledger(user_id) where status in ('pending','approved');

-- 2) เปิดงานเช็กโกงรายวันอัตโนมัติ (ฝั่งเซิร์ฟเวอร์ ไม่ต้องเปิดคอม)
--    ทุกวัน 09:00 UTC (≈ 16:00 ไต้หวัน) — เจอดาวอธิบายไม่ได้ = บันทึกลง star_fraud_alerts
select cron.schedule('star-fraud-daily', '0 9 * * *', $$
  insert into public.star_fraud_alerts (user_id, stars_now, baseline, ledger_confirmed, unexplained)
  select user_id, stars_now, baseline, ledger_confirmed, unexplained
  from public.v_unexplained_stars;
$$);

-- 3) เช็กว่างานถูกตั้งจริง (ต้องเห็น 1 แถวชื่อ star-fraud-daily)
select jobname, schedule, active from cron.job where jobname = 'star-fraud-daily';
