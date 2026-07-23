-- ════════════════════════════════════════════════════════════
-- Phase 5 คิวรีเฝ้าระวัง "ดาวอธิบายไม่ได้" — ทำเป็น VIEW ให้เช็กง่าย
-- รันใน Supabase Dashboard → SQL Editor (รันครั้งเดียวเพื่อสร้าง view)
-- baseline = _backup_game_accounts_20260711 (ถ่ายไว้วันล็อก RLS 2026-07-11)
-- ════════════════════════════════════════════════════════════

-- 1) VIEW: แต่ละบัญชีที่มีดาว "อธิบายไม่ได้" (ดาวตอนนี้ - เส้นฐาน - ที่ ledger ยืนยัน > 0)
--    ต้องได้ 0 แถวเสมอ · ถ้ามีแถว = มีดาวเพิ่มที่ไม่ได้มาจากเซิร์ฟเวอร์ → ต้องสืบ
create or replace view public.v_unexplained_stars as
select g.user_id,
       g.stars                                                    as stars_now,
       coalesce(b.stars, 0)                                       as baseline,
       coalesce(l.ledgered, 0)                                    as ledger_confirmed,
       g.stars - coalesce(b.stars, 0) - coalesce(l.ledgered, 0)   as unexplained
from public.game_accounts g
left join public._backup_game_accounts_20260711 b on b.user_id = g.user_id
left join (select user_id, sum(stars) as ledgered
           from public.star_ledger group by user_id) l on l.user_id = g.user_id
where g.stars - coalesce(b.stars, 0) - coalesce(l.ledgered, 0) > 0;

-- ── ด่านบังคับก่อนเปิดแลกเงิน: บรรทัดนี้ต้องได้ 0 ──
--    select count(*) as must_be_zero from public.v_unexplained_stars;


-- 2) VIEW: ภาพรวมดาว (ดูค่าผิดปกติเร็วๆ)
create or replace view public.v_stars_overview as
select count(*)                              as accounts,
       max(stars)                            as max_stars,
       sum(stars)                            as total_stars,
       count(*) filter (where stars > 100)   as over_100
from public.game_accounts;
--    (ค่า ณ 2026-07-11: 11 บัญชี · สูงสุด 8 · รวม 22 · เกิน100 = 0 → สะอาด)


-- ════════════════════════════════════════════════════════════
-- วิธีใช้ (เช็กเร็วๆ ทุกครั้ง):
--   select count(*) from public.v_unexplained_stars;   -- ต้องได้ 0
--   select * from public.v_unexplained_stars;          -- ดูว่าใครผิด ถ้ามี
--   select * from public.v_stars_overview;             -- ภาพรวม
-- ════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════════
-- (ทางเลือก — เปิดตอนใกล้เปิดเงิน ต.ค.) เช็กอัตโนมัติฝั่งเซิร์ฟเวอร์ด้วย pg_cron
-- ข้อดี: รันเองทุกวันแม้ไม่มีใครเปิดคอม · ถ้าเจอดาวอธิบายไม่ได้ = บันทึกลงตารางแจ้งเตือน
-- ต้องเปิด extension pg_cron ก่อน (Supabase Dashboard → Database → Extensions → เปิด pg_cron)
-- ════════════════════════════════════════════════════════════

-- ตารางเก็บ alert (client แตะไม่ได้) — ว่าง = สะอาด, มีแถว = ต้องสืบ
create table if not exists public.star_fraud_alerts (
  id               bigint generated always as identity primary key,
  checked_at       timestamptz not null default now(),
  user_id          uuid,
  stars_now        int,
  baseline         int,
  ledger_confirmed int,
  unexplained      int
);
alter table public.star_fraud_alerts enable row level security;

-- งานรายวัน 09:00 UTC — ถ้ามีดาวอธิบายไม่ได้ให้บันทึกไว้ (ปกติไม่บันทึกอะไรเลย)
-- เปิดใช้: เอา comment ออกแล้วรัน · ปิด: select cron.unschedule('star-fraud-daily');
-- select cron.schedule('star-fraud-daily', '0 9 * * *', $$
--   insert into public.star_fraud_alerts (user_id, stars_now, baseline, ledger_confirmed, unexplained)
--   select user_id, stars_now, baseline, ledger_confirmed, unexplained
--   from public.v_unexplained_stars;
-- $$);

-- เช็ก alert ที่สะสมไว้:  select * from public.star_fraud_alerts order by checked_at desc;
