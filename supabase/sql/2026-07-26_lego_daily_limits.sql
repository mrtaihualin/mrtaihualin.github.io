-- ════════════════════════════════════════════════════════════
-- 2026-07-26_lego_daily_limits.sql
-- ตารางนับโควตาเล่นเกมเลโก้ (造句遊戲) ต่อวัน — ใช้กับ Edge Function lego-daily-limit
--
-- ทำไมต้องมีตารางนี้ (LIN 2026-07-26):
--   เดิมจำกัดวันละ 2 ประโยค (ไม่ล็อกอิน) / 5 ประโยค (ล็อกอิน) ด้วย localStorage ฝั่งเบราว์เซอร์เท่านั้น
--   (เพดานนุ่ม — ล้าง localStorage/เปิด incognito ก็ข้ามได้) Lin สั่งเปลี่ยนเป็น "แข็ง" ครอบคลุมทุกคน
--   รวมคนไม่ล็อกอินด้วย → ต้องนับที่เซิร์ฟเวอร์ ไม่พึ่งเครื่องผู้เล่นอย่างเดียวอีกต่อไป
--
-- identity_key = ตัวระบุตัวตนที่ใช้นับโควตา:
--   คนล็อกอิน  → 'user:<uuid บัญชี>'   (แข็งจริง ผูกกับบัญชี ล้างเบราว์เซอร์ไม่ช่วย)
--   คนไม่ล็อกอิน → 'ip:<hash ของ IP>'  (แข็งกว่า localStorage มาก แต่ไม่ใช่แข็ง 100% —
--     คนละอุปกรณ์/สลับ WiFi-4G/เปิด VPN จะได้โควตาใหม่ เพราะ IP เปลี่ยน — เป็นข้อจำกัดที่ยอมรับได้
--     ของการจำกัดคนไม่ล็อกอินด้วย IP ซึ่งเป็นวิธีมาตรฐานที่ระบบทั่วไปใช้ ไม่มีทาง "แข็ง 100%" สำหรับคน
--     ไม่มีบัญชีจริง ๆ นอกจากบังคับล็อกอิน — Lin ควรรู้ข้อจำกัดนี้ไว้)
--   IP ไม่เก็บดิบ ๆ (เก็บ hash แทน กันข้อมูลส่วนตัวหลุด/ตรงกฎ CLAUDE.md ข้อ 1 เรื่องข้อมูลผู้เรียน)
--
-- วิธีรัน: Supabase Dashboard → SQL Editor → วางทั้งไฟล์ → Run
-- ════════════════════════════════════════════════════════════

create table if not exists public.lego_daily_limits (
  identity_key text not null,
  day date not null,
  count int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (identity_key, day)
);

-- เปิด RLS แต่ "ตั้งใจไม่ใส่ policy ให้ใครเลย" — เข้าถึงได้เฉพาะ service_role (ที่ Edge Function
-- lego-daily-limit ใช้ ซึ่ง bypass RLS อยู่แล้วเป็นปกติของ service_role)
-- ผลคือ client ฝั่งเว็บ (ใช้ anon key) อ่าน/เขียนตารางนี้ตรง ๆ ไม่ได้เลยแม้แต่ SELECT เดียว —
-- ต้องผ่าน Edge Function เท่านั้น กันคนแก้ค่า count เองผ่าน console เบราว์เซอร์
alter table public.lego_daily_limits enable row level security;

-- ลบแถวเก่าเกิน 7 วันได้เรื่อย ๆ (ไม่บังคับรันอัตโนมัติ — รันมือเป็นครั้งคราวพอ ตารางเล็กมาก
-- แถวใหม่ 1 แถว/คน/วันเท่านั้น ไม่มีทางบวมเร็ว)
-- delete from public.lego_daily_limits where day < (current_date - interval '7 days');

-- ════════════════════════════════════════════════════════════
-- ฟังก์ชัน "เพิ่มโควตา 1 ครั้งแบบอะตอมมิก" — ห้ามใช้ pattern "อ่านก่อน→ค่อยเขียนทีหลัง" (check-then-act)
-- เพราะกดรัว ๆ /เปิด 2 แท็บพร้อมกันจะแย่งกันอ่านค่าเดิมได้ ทำให้เกินเพดานจริง (เจอบั๊กคลาสเดียวกันนี้
-- มาแล้วในระบบเช็คชื่อของครู — ดู classroom/index.html ประวัติ 2026-07-15) ฟังก์ชันนี้ INSERT/UPDATE
-- ในคำสั่งเดียว (ON CONFLICT ... WHERE) ให้ Postgres ล็อกแถวให้เอง กันชนกันจริง 100%
--
-- คืนค่า: จำนวนที่ใช้ไปแล้ว "รวมครั้งนี้" ถ้าอนุญาต (≤ p_cap) · คืน -1 ถ้าเต็มโควต้าแล้ว (ไม่อนุญาต)
create or replace function public.lego_consume_daily(p_key text, p_day date, p_cap int)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  insert into public.lego_daily_limits (identity_key, day, count, updated_at)
  values (p_key, p_day, 1, now())
  on conflict (identity_key, day)
  do update set count = public.lego_daily_limits.count + 1, updated_at = now()
  where public.lego_daily_limits.count < p_cap
  returning count into v_count;

  if v_count is null then
    return -1; -- ชนแถวเดิมที่ count >= cap อยู่แล้ว (WHERE ไม่ผ่าน เลยไม่มีแถวถูกอัปเดต/คืนค่า) → เต็มโควต้า
  end if;

  return v_count;
end;
$$;

-- service_role (ที่ Edge Function ใช้) bypass ทุกอย่างอยู่แล้วโดยปกติ ไม่ต้อง grant เพิ่ม
-- ตั้งใจไม่ grant execute ให้ anon/authenticated — ต้องเรียกผ่าน Edge Function เท่านั้น (กันเรียกตรงจากเบราว์เซอร์)
