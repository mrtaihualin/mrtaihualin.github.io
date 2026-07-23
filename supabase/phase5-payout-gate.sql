-- ════════════════════════════════════════════════════════════
-- Phase 5 ด่านตรวจก่อนจ่ายเงิน (payout gate) — สร้างไว้ก่อน ระบบเงินมาต่อทีหลัง
-- รันใน Supabase Dashboard → SQL Editor (หลังรัน phase5-monitoring.sql แล้ว)
--
-- หลักการ: ทุกครั้งก่อนจ่ายเงินให้ใคร ต้องเรียก payout_precheck(user_id) ก่อน
--   ผ่านครบทุกด่าน → ok = true · ด่านไหนไม่ผ่าน → ok = false + บอกเหตุผล
--   และต่อให้ ok = true ก็ยังต้องให้ Lin กดอนุมัติเองทุกครั้งช่วงแรก (ห้ามจ่ายอัตโนมัติ)
-- ════════════════════════════════════════════════════════════

create or replace function public.payout_precheck(p_user uuid)
returns table (
  ok               boolean,
  reason           text,
  stars_now        int,
  ledger_confirmed int,
  unexplained      int,
  accounts_on_same_device int
)
language plpgsql security definer set search_path = public as $$
declare
  v_stars int;
  v_ledger int;
  v_baseline int;
  v_unexplained int;
  v_dup int;
begin
  -- ด่าน 1: บัญชีต้องมีอยู่จริง
  select g.stars into v_stars from public.game_accounts g where g.user_id = p_user;
  if v_stars is null then
    return query select false, 'no_account', 0, 0, 0, 0; return;
  end if;

  -- ด่าน 2: ดาวทุกดวงต้องอธิบายได้ (เส้นฐาน + ledger)
  select coalesce(b.stars, 0) into v_baseline
    from public._backup_game_accounts_20260711 b where b.user_id = p_user;
  v_baseline := coalesce(v_baseline, 0);
  select coalesce(sum(l.stars), 0) into v_ledger
    from public.star_ledger l where l.user_id = p_user;
  v_unexplained := v_stars - v_baseline - v_ledger;
  if v_unexplained > 0 then
    return query select false, 'unexplained_stars', v_stars, v_ledger, v_unexplained, 0; return;
  end if;

  -- ด่าน 3: เครื่องเดียวกันต้องไม่มีหลายบัญชี (เช็กจาก login_events / fingerprint)
  select count(distinct le2.user_id) into v_dup
    from public.login_events le1
    join public.login_events le2 on le2.fingerprint = le1.fingerprint
     and le2.fingerprint is not null and le2.fingerprint <> ''
    where le1.user_id = p_user;
  v_dup := coalesce(v_dup, 1);
  if v_dup > 1 then
    return query select false, 'multi_account_device', v_stars, v_ledger, 0, v_dup; return;
  end if;

  -- ผ่านทุกด่าน (Lin ยังต้องอนุมัติเองอีกชั้น)
  return query select true, 'pass', v_stars, v_ledger, 0, v_dup;
end; $$;

-- ล็อกไม่ให้ client เรียกเอง (เรียกได้เฉพาะ service_role/ฝั่งเซิร์ฟเวอร์)
revoke execute on function public.payout_precheck(uuid) from anon, authenticated;

-- ════════════════════════════════════════════════════════════
-- วิธีใช้ (ตอนระบบเงินมาถึง — ใน Edge Function ฝั่งจ่ายเงิน):
--   select * from public.payout_precheck('<user_id>');
--   ok = true  → ไปขั้นยืนยันตัวตน + Lin กดอนุมัติ → ค่อยจ่าย
--   ok = false → ห้ามจ่าย แจ้งเหตุผลตาม reason
--
-- ขั้นตอนเต็มก่อนจ่ายทุกครั้ง (สเปก — เขียนตอนต่อระบบเงินจริง ต.ค. 2026):
--   1. รวมระบบ: select count(*) from v_unexplained_stars;  ต้องได้ 0
--   2. รายคน:   payout_precheck(user_id) ต้อง ok
--   3. ยืนยันตัวตน: ผู้ถอนต้องยืนยัน OTP อีเมลอีกรอบตอนกดถอน (ล็อกอินค้างไว้ไม่พอ)
--   4. Lin กดอนุมัติเองทุกรายการ — ห้ามจ่ายอัตโนมัติช่วงแรกเด็ดขาด
--   5. บันทึกการจ่ายลงตาราง payout_ledger (สร้างตอนทำระบบเงิน) กันจ่ายซ้ำ
-- ════════════════════════════════════════════════════════════
