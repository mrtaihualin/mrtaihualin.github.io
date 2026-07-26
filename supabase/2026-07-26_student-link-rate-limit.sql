-- ════════════════════════════════════════════════════════════
-- ยามเฝ้าประตูลิงก์นักเรียน (rate limit) — Lin 2026-07-26
-- ────────────────────────────────────────────────────────────
-- ทำไมต้องมี:
--   ลิงก์นักเรียน (?s=token) ที่ออกก่อน 2026-07-26 ใช้ "เวลาที่สร้าง" เป็นตัวสุ่ม
--   เดาได้แค่ ~1.7 ล้านแบบ · ใครเดาถูก = เปิดดูตาราง/ประวัติจ่ายเงิน/วิดีโอของนักเรียนคนนั้นได้
--   ตัวสร้างลิงก์แก้เป็นสุ่มจริง 16 ตัวแล้ว แต่ "ลิงก์เก่าที่ออกไปแล้ว" ยังอ่อนแออยู่
--   ไฟล์นี้คือด่านที่คุ้มครองย้อนหลัง "ทุกคน" โดยไม่ต้องส่งลิงก์ใหม่ให้ใครเลย
--
-- หลักการ: การเดา token ต้องยิงเข้ามาเป็นแสนครั้ง → จำกัดจำนวนครั้งต่อ IP = เดาไม่ได้จริง
--
-- ไฟล์นี้ทำ 3 อย่าง (รันแล้วยังไม่กระทบใคร — เป็นแค่การ "ติดตั้งอุปกรณ์" ไว้ก่อน):
--   1. ตารางนับจำนวนครั้ง  public.slink_rl
--   2. ฟังก์ชันเช็ก        public.slink_rl_check()
--   3. ตารางจดล็อกตอนเดาผิด public.slink_fail_log + ฟังก์ชัน public.slink_log_fail()
-- ขั้นต่อไป (ไฟล์ที่ 2) ค่อยเอา 2 บรรทัดนี้ไปแปะหัวฟังก์ชันที่รับ token ทั้ง 9 ตัว
--
-- ปลอดภัยที่จะรันซ้ำ (ใช้ if not exists / create or replace ทั้งหมด)
-- ════════════════════════════════════════════════════════════


-- ── 1) ตารางนับจำนวนครั้ง (แยกตาม IP + ชื่อฟังก์ชัน + ช่วงเวลา) ──
create table if not exists public.slink_rl (
  ip           text        not null,
  fn           text        not null,
  window_start timestamptz not null,
  cnt          int         not null default 0,
  primary key (ip, fn, window_start)
);
-- ปิด RLS = ฝั่งหน้าเว็บ (anon) แตะตารางนี้ไม่ได้เลย · ฟังก์ชันข้างล่างเข้าถึงได้เพราะเป็น security definer
alter table public.slink_rl enable row level security;


-- ── 2) หา IP ของคนที่ยิงเข้ามา ──
-- Supabase ส่ง header มาให้ผ่าน request.headers · ถ้าหาไม่เจอให้คืน 'unknown'
-- (x-forwarded-for อาจมีหลาย IP คั่นด้วย , → เอาตัวแรกซึ่งคือผู้ใช้จริง)
create or replace function public.slink_client_ip()
returns text
language plpgsql stable security definer set search_path = public as $$
declare
  v_hdr text;
  v_ip  text;
begin
  begin
    v_hdr := current_setting('request.headers', true)::json ->> 'x-forwarded-for';
  exception when others then
    v_hdr := null;
  end;
  v_ip := coalesce(nullif(btrim(split_part(coalesce(v_hdr, ''), ',', 1)), ''), 'unknown');
  return v_ip;
end; $$;


-- ── 3) ตัวเช็กหลัก: เกินเพดานหรือยัง ──
-- คืน true  = ยังไม่เกิน ให้ทำงานต่อได้
-- คืน false = เกินเพดาน → ฝั่งฟังก์ชันที่เรียกต้อง raise exception ทิ้งไป
-- p_limit  = ยิงได้กี่ครั้ง · p_window = ต่อกี่วินาที
create or replace function public.slink_rl_check(
  p_fn text, p_limit int default 20, p_window int default 60
) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_ip     text;
  v_bucket timestamptz;
  v_cnt    int;
begin
  v_ip := public.slink_client_ip();
  -- ปัดเวลาปัจจุบันลงเป็น "ช่อง" ขนาด p_window วินาที
  v_bucket := to_timestamp(floor(extract(epoch from now()) / p_window) * p_window);
  insert into public.slink_rl (ip, fn, window_start, cnt)
  values (v_ip, p_fn, v_bucket, 1)
  on conflict (ip, fn, window_start)
  do update set cnt = public.slink_rl.cnt + 1
  returning cnt into v_cnt;
  return v_cnt <= p_limit;
end; $$;


-- ── 4) จดล็อกตอนมีคนใส่ token ผิด (ไว้ดูว่ามีใครไล่เดาไหม) ──
create table if not exists public.slink_fail_log (
  id         bigserial primary key,
  ip         text        not null,
  fn         text        not null,
  token_head text,                      -- เก็บแค่ 6 ตัวแรก พอให้ดูรูปแบบ ไม่เก็บ token เต็ม
  at         timestamptz not null default now()
);
alter table public.slink_fail_log enable row level security;
create index if not exists slink_fail_log_at_idx on public.slink_fail_log (at desc);

create or replace function public.slink_log_fail(p_fn text, p_token text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into public.slink_fail_log (ip, fn, token_head)
  values (public.slink_client_ip(), p_fn, left(coalesce(p_token, ''), 6));
end; $$;


-- ── 5) ล็อกไม่ให้หน้าเว็บเรียกฟังก์ชันพวกนี้เองตรงๆ ──
-- (เรียกได้เฉพาะจาก "ข้างใน" ฟังก์ชัน get_student_* ที่เป็น security definer เท่านั้น)
revoke execute on function public.slink_rl_check(text, int, int) from anon, authenticated;
revoke execute on function public.slink_log_fail(text, text)      from anon, authenticated;
revoke execute on function public.slink_client_ip()               from anon, authenticated;


-- ════════════════════════════════════════════════════════════
-- วิธีเอาไปใช้ (ไฟล์ที่ 2 จะทำให้ครบทั้ง 9 ฟังก์ชัน)
-- แปะ 3 บรรทัดนี้ไว้บนสุดของ begin ... ในแต่ละฟังก์ชันที่รับ token:
--
--   if not public.slink_rl_check('get_student_payments', 20, 60) then
--     raise exception 'too many requests' using errcode = 'P0001';
--   end if;
--
-- แล้วตรงจุดที่หา token ไม่เจอ ให้เพิ่มก่อน return/raise:
--
--   perform public.slink_log_fail('get_student_payments', p_token);
--
-- เพดานที่แนะนำ: 20 ครั้ง / 60 วินาที ต่อ IP
--   นักเรียนคนเดียวเปิดหน้าเรียนรัวๆ ยังไม่ถึง 20 · แต่คนไล่เดาจะโดนบล็อกทันที
-- ════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════════
-- คำสั่งไว้ดูภายหลัง (ก๊อปไปวางใน SQL Editor ได้เลย)
--
-- มีใครไล่เดาไหม (7 วันล่าสุด):
--   select ip, fn, count(*) as ครั้ง, max(at) as ล่าสุด
--   from public.slink_fail_log
--   where at > now() - interval '7 days'
--   group by ip, fn having count(*) > 20 order by ครั้ง desc;
--
-- ล้างข้อมูลเก่ากันตารางบวม (รันเดือนละครั้ง หรือตั้ง cron):
--   delete from public.slink_rl        where window_start < now() - interval '1 day';
--   delete from public.slink_fail_log  where at           < now() - interval '90 days';
-- ════════════════════════════════════════════════════════════
