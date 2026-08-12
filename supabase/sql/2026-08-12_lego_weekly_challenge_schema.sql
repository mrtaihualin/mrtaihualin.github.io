-- ════════════════════════════════════════════════════════════
-- 2026-08-12_lego_weekly_challenge_schema.sql
-- Lego Weekly Challenge — implement ให้ตรง Decision (Lin อนุมัติ 2026-08-12)
--
-- Decision: ผู้เรียนเลือก weekday เอง · 1 ครั้งต่อสัปดาห์ · เปลี่ยนวันกลาง cycle ต้องรอ 14 วัน ·
--   Guest เล่น Lego ปกติได้แต่ใช้ Weekly Challenge ไม่ได้ (ต้อง login) ·
--   Free Login / Paid ใช้ระบบเดียวกัน · ห้ามมี Guest localStorage parallel system ·
--   คนละระบบกับ Mini-Game Challenge (games-challenge.html) — ไฟล์นี้ไม่แตะระบบนั้นเลย
--
-- ของเดิมก่อนหน้า (js/games/lego-game-app.js:684-741 — เก็บไว้อ้างอิง ไม่ลบออกจาก git history):
--   legoWeekIndex()/legoActiveChallenge() คำนวณจาก Date.now() ล้วน (epoch week, global ไม่ personalize)
--   LEGO_CH_KEY='lego_challenge_v1' เก็บ progress ใน localStorage เท่านั้น ไม่ผูกบัญชี ไม่ sync ข้ามเครื่อง
--   ไม่มี weekday selection UI ไม่มีกฎ 14 วันเลยแม้แต่จุดเดียว (ยืนยันจาก grep ทั้งไฟล์ก่อนแก้)
--
-- ทำไมต้องใช้ SECURITY DEFINER function (RPC) แทนให้ client UPDATE ตาราง trực tiếp:
--   กฎ "รอ 14 วัน" ต้อง enforce ฝั่งเซิร์ฟเวอร์เสมอ (RELIABILITY FIRST) — ถ้าปล่อยให้ client
--   UPDATE ตาราง (แม้จะมี RLS แบบ "own row" อยู่) ผู้เล่นก็แค่ยิง PATCH ตรงๆ เปลี่ยน active_weekday
--   ทันทีได้เลย ไม่มีทางเช็ค "เวลาผ่านไป 14 วันหรือยัง" ด้วย RLS policy อย่างเดียว
--   ตาม pattern ที่ repo นี้ใช้อยู่แล้วสำหรับกรณีเดียวกัน (submit_class_request, respond_to_offer_as_student)
--   → table เปิด RLS ให้ SELECT own row ได้เท่านั้น ไม่มี policy ให้ client เขียนตรงเลย
--     การเขียนทั้งหมดผ่าน 3 ฟังก์ชันด้านล่างเท่านั้น (SECURITY DEFINER, ตรวจ auth.uid() เอง)
--
-- Timezone: ใช้ Asia/Taipei ให้ตรงกับ lego-daily-limit/index.ts (todayTaipei()) ที่มีอยู่แล้ว
-- ในระบบเลโก้ — ไม่ใช้ Asia/Bangkok เพื่อให้ "วันขึ้นวันใหม่" ของเลโก้ตรงกันทั้งระบบ (โควตารายวัน +
-- weekly challenge ใช้เขตเวลาเดียวกัน)
--
-- REUSE: คงรายชื่อ/สูตร 5 ชนิดชาเลนจ์เดิม (correct/sets/perfect/combo) เป๊ะ — ย้ายมาไว้ในตาราง
-- lego_challenge_defs เพื่อให้ฟังก์ชันฝั่งเซิร์ฟเวอร์ตรวจสอบ progress ได้เอง (กันโกงผ่านการยิง RPC ตรง)
-- ฝั่ง client (lego-game-app.js) ยังคง array LEGO_CHALLENGES เดิมไว้ใช้แสดงผล (title/sub/emoji เป็นแค่
-- ข้อความ ไม่ใช่ security-critical) — **ต้องแก้ 2 ที่พร้อมกันเสมอถ้าจะเปลี่ยนเนื้อหาชาเลนจ์ในอนาคต**
-- (จดเตือนไว้ตรงนี้ เหมือน practice_surfaces.legacy_codes ที่ต้อง sync มือ)
--
-- Migration ของเดิม: ไม่มีอะไรต้อง migrate — progress เดิมอยู่ localStorage รายเครื่อง เป็นแค่
-- "ความคืบหน้าของสัปดาห์นี้" ไม่ใช่ประวัติถาวรที่มีค่าให้ย้าย เริ่มนับใหม่จากศูนย์ได้ปลอดภัย
-- (ไม่กระทบ Lego Vault ('lego_vault_v1'/'learning_saved_items' vault_key='lego_vault') หรือ Lego
-- gameplay/scoring เดิมเลยแม้แต่จุดเดียว — ไฟล์นี้สร้างของใหม่ล้วนๆ ไม่แตะตาราง/ฟังก์ชันเดิมสักตัว)
--
-- Work Collision Safety: ตรวจ git status สะอาดก่อนเริ่ม (2026-08-12) ไม่มีไฟล์อื่นค้าง
-- ✅ อนุมัติโดย Lin 2026-08-12 · รันจริงบน production (qzkxlhpcputsvbqmtqfi) แล้ว 2026-08-12
-- ════════════════════════════════════════════════════════════

-- [A] ตาราง lookup ของ 5 ชนิดชาเลนจ์ (mirror ของ LEGO_CHALLENGES ในโค้ด client เป๊ะ — ห้ามให้เพี้ยนกัน)
create table if not exists public.lego_challenge_defs (
  id          text primary key,
  challenge_type text not null check (challenge_type in ('correct','sets','perfect','combo')),
  target      int not null check (target > 0),
  sort_order  int not null,
  created_at  timestamptz not null default now()
);

insert into public.lego_challenge_defs (id, challenge_type, target, sort_order) values
  ('lego_correct15', 'correct', 15, 1),
  ('lego_rounds3',   'sets',     3, 2),
  ('lego_perfect2',  'perfect',  2, 3),
  ('lego_combo5',    'combo',    5, 4),
  ('lego_correct30', 'correct', 30, 5)
on conflict (id) do update set
  challenge_type = excluded.challenge_type,
  target = excluded.target,
  sort_order = excluded.sort_order;

-- ไม่ grant select ให้ anon/authenticated เลย — client ไม่ต้องอ่านตารางนี้ตรงๆ (ใช้ LEGO_CHALLENGES
-- ฝั่ง JS แสดงผลอยู่แล้ว) ตารางนี้มีไว้ให้ฟังก์ชัน SECURITY DEFINER ด้านล่างใช้ตรวจสอบ progress เท่านั้น
alter table public.lego_challenge_defs enable row level security;
revoke all on public.lego_challenge_defs from anon, authenticated;

-- [B] ตารางสถานะ Weekly Challenge ต่อบัญชี — 1 แถวต่อ 1 user
create table if not exists public.lego_challenge_state (
  user_id          uuid primary key references auth.users(id) on delete cascade,
  active_weekday   smallint check (active_weekday between 0 and 6),   -- 0=Sun..6=Sat (ตรงกับ JS Date.getDay())
  pending_weekday  smallint check (pending_weekday between 0 and 6),  -- คำขอเปลี่ยนที่ยังไม่ครบ 14 วัน
  pending_since    timestamptz,                                       -- เวลาที่ขอเปลี่ยนล่าสุด (รีเซ็ตนับ 14 วันใหม่ทุกครั้งที่ขอ)
  cycle_start      date,                                               -- วันเริ่ม cycle ปัจจุบัน (Asia/Taipei)
  challenge_id     text references public.lego_challenge_defs(id),
  progress         int not null default 0,
  done             boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

alter table public.lego_challenge_state enable row level security;

-- เปิดให้อ่าน "แถวของตัวเอง" ได้เท่านั้น (ให้ client debug/แสดงผลตรงได้ถ้าจำเป็น) —
-- **ไม่มี policy insert/update/delete ให้ client เลยตั้งใจ** ทุกการเขียนต้องผ่าน 3 ฟังก์ชันด้านล่าง
drop policy if exists lego_challenge_state_select_own on public.lego_challenge_state;
create policy lego_challenge_state_select_own on public.lego_challenge_state
  for select using (auth.uid() = user_id);

revoke insert, update, delete, truncate on public.lego_challenge_state from anon, authenticated;
grant select on public.lego_challenge_state to authenticated;
revoke all on public.lego_challenge_state from anon;

-- [C] ฟังก์ชันภายใน — เช็ค pending promotion ที่ครบ 14 วันแล้ว + week rollover พร้อมกัน
--     คืนค่าแถวล่าสุดหลังอัปเดต (ไม่มีแถว = คืน null) — ใช้ร่วมกันทั้ง get_state / set_weekday / record_progress
create or replace function public.lego_challenge_ensure_fresh(p_user uuid)
returns public.lego_challenge_state
language plpgsql
security definer
set search_path = public
as $$
declare
  row_now public.lego_challenge_state;
  today_tw date;
  computed_start date;
  new_idx int;
  new_challenge text;
begin
  select * into row_now from public.lego_challenge_state where user_id = p_user for update;
  if row_now.user_id is null then
    return null; -- ยังไม่เคยเลือก weekday เลย — ให้ caller ตัดสินใจเอง (get_state คืน null, record_progress raise)
  end if;

  today_tw := (now() at time zone 'Asia/Taipei')::date;

  -- (1) promote pending → active ถ้าครบ 14 วันแล้ว
  if row_now.pending_weekday is not null and row_now.pending_since is not null
     and now() >= row_now.pending_since + interval '14 days' then
    update public.lego_challenge_state
      set active_weekday = row_now.pending_weekday,
          pending_weekday = null,
          pending_since = null,
          updated_at = now()
      where user_id = p_user
      returning * into row_now;
  end if;

  -- (2) week rollover — คำนวณ cycle_start ที่ควรเป็น "ตอนนี้" จาก active_weekday สดๆ ทุกครั้ง
  --     (ไม่ใช่ +7 สะสม กันเคสห่างหายนาน ๆ แล้วต้องวนลูป)
  if row_now.active_weekday is not null then
    computed_start := today_tw - (((extract(dow from today_tw)::int - row_now.active_weekday + 7) % 7));
    if row_now.cycle_start is distinct from computed_start then
      new_idx := (floor(extract(epoch from computed_start::timestamp) / (7*86400))::int) % 5;
      if new_idx < 0 then new_idx := new_idx + 5; end if;
      select id into new_challenge from public.lego_challenge_defs order by sort_order offset new_idx limit 1;
      update public.lego_challenge_state
        set cycle_start = computed_start,
            challenge_id = new_challenge,
            progress = 0,
            done = false,
            updated_at = now()
        where user_id = p_user
        returning * into row_now;
    end if;
  end if;

  return row_now;
end;
$$;
revoke all on function public.lego_challenge_ensure_fresh(uuid) from public, anon, authenticated;

-- [D] ฟังก์ชัน 1 — อ่านสถานะปัจจุบัน (เรียกตอนเปิดหน้า lego.html ครั้งแรก + หลังทำ action ใดๆ)
create or replace function public.lego_challenge_get_state()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  row_now public.lego_challenge_state;
  def public.lego_challenge_defs;
  days_left int;
begin
  if uid is null then
    raise exception 'login_required' using errcode = 'P0001';
  end if;
  row_now := public.lego_challenge_ensure_fresh(uid);
  if row_now.user_id is null then
    return jsonb_build_object('has_weekday', false);
  end if;
  select * into def from public.lego_challenge_defs where id = row_now.challenge_id;
  days_left := null;
  if row_now.pending_weekday is not null then
    days_left := greatest(0, 14 - floor(extract(epoch from (now() - row_now.pending_since)) / 86400)::int);
  end if;
  return jsonb_build_object(
    'has_weekday', true,
    'active_weekday', row_now.active_weekday,
    'pending_weekday', row_now.pending_weekday,
    'pending_days_left', days_left,
    'cycle_start', row_now.cycle_start,
    'cycle_end', row_now.cycle_start + 7,
    'challenge_id', row_now.challenge_id,
    'target', coalesce(def.target, 0),
    'progress', row_now.progress,
    'done', row_now.done
  );
end;
$$;
revoke all on function public.lego_challenge_get_state() from public, anon;
grant execute on function public.lego_challenge_get_state() to authenticated;

-- [E] ฟังก์ชัน 2 — เลือก/ขอเปลี่ยน weekday (ครั้งแรก = ใช้ทันที · เปลี่ยนภายหลัง = เข้าคิวรอ 14 วัน)
create or replace function public.lego_challenge_set_weekday(p_weekday smallint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  row_now public.lego_challenge_state;
  today_tw date;
  computed_start date;
  new_idx int;
  new_challenge text;
begin
  if uid is null then
    raise exception 'login_required' using errcode = 'P0001';
  end if;
  if p_weekday is null or p_weekday < 0 or p_weekday > 6 then
    raise exception 'invalid_weekday' using errcode = 'P0001';
  end if;

  today_tw := (now() at time zone 'Asia/Taipei')::date;
  select * into row_now from public.lego_challenge_state where user_id = uid for update;

  if row_now.user_id is null then
    -- ครั้งแรก — ไม่มีกฎ 14 วัน (ยังไม่เคยเลือกอะไรมาก่อน)
    computed_start := today_tw - (((extract(dow from today_tw)::int - p_weekday + 7) % 7));
    new_idx := (floor(extract(epoch from computed_start::timestamp) / (7*86400))::int) % 5;
    if new_idx < 0 then new_idx := new_idx + 5; end if;
    select id into new_challenge from public.lego_challenge_defs order by sort_order offset new_idx limit 1;
    insert into public.lego_challenge_state
      (user_id, active_weekday, cycle_start, challenge_id, progress, done)
    values (uid, p_weekday, computed_start, new_challenge, 0, false);
  else
    -- มีแถวอยู่แล้ว — เช็ค promotion/rollover ที่ค้างอยู่ก่อน แล้วค่อยประเมินคำขอใหม่
    row_now := public.lego_challenge_ensure_fresh(uid);
    if row_now.active_weekday = p_weekday then
      -- ขอวันเดิม — ไม่มีอะไรต้องทำ (ถ้ามี pending ค้างอยู่เป็นวันอื่น ปล่อยไว้ตามเดิม ไม่ยกเลิกให้)
      null;
    else
      -- ขอเปลี่ยนจริง — เข้าคิว 14 วัน (เขียนทับ pending เดิมถ้ามี = รีเซ็ตนับใหม่)
      update public.lego_challenge_state
        set pending_weekday = p_weekday,
            pending_since = now(),
            updated_at = now()
        where user_id = uid;
    end if;
  end if;

  return public.lego_challenge_get_state();
end;
$$;
revoke all on function public.lego_challenge_set_weekday(smallint) from public, anon;
grant execute on function public.lego_challenge_set_weekday(smallint) to authenticated;

-- [F] ฟังก์ชัน 3 — บันทึกความคืบหน้าหลังทดสอบผ่าน 1 รอบ (เรียกจาก finishLegoRound() แทน legoChallengeBump เดิม)
create or replace function public.lego_challenge_record_progress(
  p_clean_count int, p_total_count int, p_combo_snapshot int
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  row_now public.lego_challenge_state;
  def public.lego_challenge_defs;
  add_amount int := 0;
  just_completed boolean := false;
begin
  if uid is null then
    raise exception 'login_required' using errcode = 'P0001';
  end if;
  row_now := public.lego_challenge_ensure_fresh(uid);
  if row_now.user_id is null then
    raise exception 'no_weekday_chosen' using errcode = 'P0001';
  end if;
  if row_now.done then
    return public.lego_challenge_get_state(); -- เล่นซ้ำ cycle เดิมไม่ได้ — no-op
  end if;

  select * into def from public.lego_challenge_defs where id = row_now.challenge_id;

  if def.challenge_type = 'correct' then add_amount := coalesce(p_clean_count,0);
  elsif def.challenge_type = 'sets' then add_amount := 1;
  elsif def.challenge_type = 'perfect' then
    add_amount := case when p_clean_count = p_total_count and p_total_count > 0 then 1 else 0 end;
  elsif def.challenge_type = 'combo' then
    add_amount := case when coalesce(p_combo_snapshot,0) >= def.target then def.target else 0 end;
  end if;

  if def.challenge_type = 'combo' then
    update public.lego_challenge_state
      set progress = greatest(progress, add_amount), updated_at = now()
      where user_id = uid returning * into row_now;
  else
    update public.lego_challenge_state
      set progress = progress + add_amount, updated_at = now()
      where user_id = uid returning * into row_now;
  end if;

  if row_now.progress >= def.target and not row_now.done then
    update public.lego_challenge_state set done = true, updated_at = now()
      where user_id = uid returning * into row_now;
    just_completed := true;
  end if;

  return public.lego_challenge_get_state() || jsonb_build_object('just_completed', just_completed);
end;
$$;
revoke all on function public.lego_challenge_record_progress(int,int,int) from public, anon;
grant execute on function public.lego_challenge_record_progress(int,int,int) to authenticated;

-- [G] ตรวจหลังรัน
select count(*) as defs_count from public.lego_challenge_defs; -- ต้องได้ 5
select proname, prosecdef from pg_proc where proname like 'lego_challenge_%' order by proname; -- prosecdef ต้อง true ทุกแถว
select grantee, privilege_type from information_schema.role_routine_grants
  where routine_name like 'lego_challenge_%' order by routine_name, grantee; -- ต้องเห็นแค่ authenticated (get_state/set_weekday/record_progress)

-- [Z] rollback (ย้อนกลับได้ทันทีถ้าจำเป็น — ตารางใหม่ทั้งคู่ ยังไม่มีข้อมูลผู้ใช้จริงตอนสร้าง จึงลบปลอดภัย)
-- drop function if exists public.lego_challenge_record_progress(int,int,int);
-- drop function if exists public.lego_challenge_set_weekday(smallint);
-- drop function if exists public.lego_challenge_get_state();
-- drop function if exists public.lego_challenge_ensure_fresh(uuid);
-- drop table if exists public.lego_challenge_state;
-- drop table if exists public.lego_challenge_defs;
