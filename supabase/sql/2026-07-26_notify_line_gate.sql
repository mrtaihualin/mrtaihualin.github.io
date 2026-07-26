-- ════════════════════════════════════════════════════════════════════════════
-- 2026-07-26 — ด่านกันสแปม LINE หาครู (notify_line_gate)
--
-- ปัญหา: Edge Function notify-line สาขา to:'teacher' เปิดโล่ง — ใครก็ตามที่เห็น URL
--        (ซึ่งอยู่ในโค้ดหน้าเว็บ ดูได้ทุกคน) ยิงข้อความอะไรก็ได้เข้า LINE ส่วนตัวของ Lin
--        ได้ไม่จำกัดจำนวน
--
-- ทำไมปิดตายไม่ได้: นักเรียนที่ไม่ได้ล็อกอิน "ต้อง" เรียกช่องนี้ได้จริง ตอนส่งคำขอ
--        เลื่อน/ยกเลิก/ขอเพิ่มคาบ — ถ้าปิดไปเลย Lin จะไม่ได้รับแจ้งเตือนจากนักเรียนอีกเลย
--
-- วิธี: คนที่ไม่ใช่ครู ต้องแนบ token ของนักเรียนที่ "มีอยู่จริง" มาด้วย
--       ฟังก์ชันนี้ตรวจ 2 อย่างพร้อมกัน แล้วตอบ true/false กลับไปให้ Edge Function
--         1) token นี้มีอยู่จริงไหม
--         2) IP นี้ยิงถี่เกินไปไหม (ค่าเริ่มต้น 15 ครั้ง / 60 วินาที)
--
-- ปลอดภัยที่จะรันซ้ำ (create table if not exists / create or replace ทั้งหมด)
-- ════════════════════════════════════════════════════════════════════════════


-- ── 1) ตารางนับจำนวนครั้ง ──
-- ใช้ตารางเดียวกับระบบกันเดา token ที่มีอยู่แล้ว (slink_rl) — ถ้ายังไม่มีก็สร้างให้ตรงนี้เลย
-- จึงรันไฟล์นี้ได้ ไม่ว่าจะเคยรัน 2026-07-26_student-link-rate-limit.sql มาก่อนหรือยัง
create table if not exists public.slink_rl (
  ip           text        not null,
  fn           text        not null,
  window_start timestamptz not null,
  cnt          int         not null default 0,
  primary key (ip, fn, window_start)
);
alter table public.slink_rl enable row level security;   -- หน้าเว็บ (anon) แตะตารางนี้ไม่ได้เลย


-- ── 2) ด่านรวม: token มีจริง + ไม่ยิงถี่เกินไป ──
-- ⚠️ ต่างจาก slink_rl_check ตรงที่ "รับ IP เป็นพารามิเตอร์"
--    เพราะตัวนี้ถูกเรียกจาก Edge Function (ไม่ใช่จากหน้าเว็บผ่าน PostgREST)
--    → ในนี้ไม่มี request.headers ให้อ่าน IP เองได้ ต้องให้ Edge Function ส่งมาให้
create or replace function public.notify_line_gate(
  p_token text,
  p_ip    text,
  p_limit int default 15,
  p_window int default 60
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ip     text := coalesce(nullif(trim(p_ip), ''), 'unknown');
  v_bucket timestamptz;
  v_cnt    int;
begin
  -- นับก่อนเสมอ (นับแม้ token ผิด) — ไม่งั้นคนไล่เดา token จะยิงได้ไม่จำกัด
  v_bucket := to_timestamp(floor(extract(epoch from now()) / p_window) * p_window);
  insert into public.slink_rl (ip, fn, window_start, cnt)
  values (v_ip, 'notify_line_teacher', v_bucket, 1)
  on conflict (ip, fn, window_start)
  do update set cnt = public.slink_rl.cnt + 1
  returning cnt into v_cnt;

  if v_cnt > p_limit then
    return false;                                   -- ยิงถี่เกินไป
  end if;

  if not exists (select 1 from public.classroom_students where token = p_token) then
    -- จดไว้ดูว่ามีใครไล่เดา token หรือเปล่า (ถ้ามีตารางล็อกอยู่แล้ว)
    begin
      insert into public.slink_fail_log (ip, fn, token_head)
      values (v_ip, 'notify_line_teacher', left(coalesce(p_token, ''), 6));
    exception when undefined_table then null;       -- ยังไม่ได้สร้างตารางล็อก = ข้ามไป ไม่พัง
    end;
    return false;                                   -- token ไม่มีอยู่จริง
  end if;

  return true;
end; $$;


-- ── 3) ห้ามหน้าเว็บเรียกฟังก์ชันนี้เองตรงๆ (เรียกได้เฉพาะ service_role คือ Edge Function) ──
-- ⚠️ สำคัญมาก: ต้อง revoke จาก "public" ด้วย ไม่ใช่แค่ anon/authenticated
--    Postgres แจกสิทธิ์ EXECUTE ให้ role พิเศษชื่อ PUBLIC (= ทุกคน) อัตโนมัติทุกฟังก์ชันที่สร้างใหม่
--    ถ้า revoke แค่ anon/authenticated สิทธิ์ของ PUBLIC ยังอยู่ → หน้าเว็บยังเรียกได้อยู่ดี
--    ผลถ้าพลาด: ใครก็ยิงฟังก์ชันนี้เองพร้อม p_limit สูงๆ แล้วใช้เป็นเครื่องมือ "ไล่เดา token นักเรียน"
--    ได้ไม่จำกัด (ตรงข้ามกับที่ระบบกันเดา token ตั้งใจไว้) + เขียนขยะลงตาราง slink_rl ได้ไม่จำกัด
revoke execute on function public.notify_line_gate(text, text, int, int) from public, anon, authenticated;
grant  execute on function public.notify_line_gate(text, text, int, int) to service_role;

-- ปิดรูเดียวกันให้ฟังก์ชันของระบบกันเดา token ที่สร้างไว้ก่อนหน้า (ถ้ามีอยู่แล้ว)
do $$
begin
  if to_regprocedure('public.slink_rl_check(text,int,int)') is not null then
    execute 'revoke execute on function public.slink_rl_check(text,int,int) from public, anon, authenticated';
  end if;
  if to_regprocedure('public.slink_log_fail(text,text)') is not null then
    execute 'revoke execute on function public.slink_log_fail(text,text) from public, anon, authenticated';
  end if;
  if to_regprocedure('public.slink_client_ip()') is not null then
    execute 'revoke execute on function public.slink_client_ip() from public, anon, authenticated';
  end if;
end $$;


-- ── 4) ตรวจว่าสร้างสำเร็จ + สิทธิ์ถูกต้อง ────────────────────────────────────
-- ต้องเห็น 1 บรรทัด · ในคอลัมน์ acl ต้อง "ไม่มี" คำว่า anon / authenticated
-- และต้องไม่มีรายการที่ขึ้นต้นด้วย "=" เฉยๆ (นั่นคือสิทธิ์ของ PUBLIC ที่ต้องถูกถอดออกไปแล้ว)
select p.proname,
       pg_get_function_identity_arguments(p.oid) as args,
       coalesce(array_to_string(p.proacl, ' | '), '(ไม่มีสิทธิ์ให้ใครเลย = ปลอดภัย)') as acl
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in ('notify_line_gate', 'slink_rl_check', 'slink_log_fail', 'slink_client_ip');
