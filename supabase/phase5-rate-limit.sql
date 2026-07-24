-- ════════════════════════════════════════════════════════════
-- Phase 5 — rate limit (rl_check / rl_counters)
-- เกราะเสริมกันสคริปต์ยิงรัวถล่ม DB · เพดานดาว+ปฏิทินกันดาวเกินเป็นด่านหลักอยู่แล้ว
-- ⚠️ ฟังก์ชันนี้ทำงานอยู่บน DB จริงแล้ว — ไฟล์นี้เก็บไว้เป็นต้นฉบับกันหาย/กู้คืน
--    ไม่จำเป็นต้องรันซ้ำ (จะรันก็ได้ ปลอดภัย เพราะ if not exists / create or replace)
-- เรียกจาก: functions/tone-round/index.ts และ functions/game-reward/index.ts
--   admin.rpc("rl_check", { p_user, p_fn, p_limit, p_window })
--   คืนค่า true = ยังไม่เกินเพดาน · false = เกินเพดาน (ฝั่งเรียกจะตอบ 429)
-- ════════════════════════════════════════════════════════════

-- ตารางนับจำนวนครั้งต่อ "ช่องเวลา" (bucket)
create table if not exists public.rl_counters (
  user_id      uuid        not null,
  fn           text        not null,
  window_start timestamptz not null,
  cnt          int         not null default 0,
  primary key (user_id, fn, window_start)
);
-- ปิด RLS: client (anon/authenticated) แตะไม่ได้ · service_role (ฝั่งเซิร์ฟเวอร์) ข้ามได้
alter table public.rl_counters enable row level security;

create or replace function public.rl_check(
  p_user uuid, p_fn text, p_limit int, p_window int
) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_bucket timestamptz;
  v_cnt int;
begin
  -- ปัดเวลาปัจจุบันลงเป็น "ช่อง" ขนาด p_window วินาที
  v_bucket := to_timestamp(floor(extract(epoch from now()) / p_window) * p_window);
  -- นับครั้งในช่องนี้ +1 (ถ้ายังไม่มีให้เริ่มที่ 1)
  insert into public.rl_counters (user_id, fn, window_start, cnt)
  values (p_user, p_fn, v_bucket, 1)
  on conflict (user_id, fn, window_start)
  do update set cnt = public.rl_counters.cnt + 1
  returning cnt into v_cnt;
  return v_cnt <= p_limit;   -- true = ยังไม่เกิน · false = เกินเพดาน (โดนบล็อก)
end; $$;

-- ล็อกไม่ให้ client เรียกเอง (เรียกได้เฉพาะฝั่งเซิร์ฟเวอร์)
revoke execute on function public.rl_check(uuid, text, int, int) from anon, authenticated;

-- (ทางเลือก) ลบแถวช่องเวลาเก่ากันตารางบวม — รันเป็นครั้งคราว หรือตั้ง cron ทีหลัง:
--   delete from public.rl_counters where window_start < now() - interval '1 day';
