-- ════════════════════════════════════════════════════════════
-- 2026-07-26_line_identities.sql
-- ตารางผูก LINE user id ↔ Supabase user id (ใช้กับ Edge Function line-login)
--
-- ทำไมต้องมีตารางนี้ (LIN 2026-07-26):
--   Custom OIDC Provider ของ Supabase ใช้กับ LINE ไม่ได้จริง — LINE เซ็น id_token
--   แบบ HS256 ตอน "web login" แต่ Supabase custom provider คาดว่าต้องเป็น ES256
--   ยืนยันจาก Supabase Auth log จริง (26/07/2026):
--     "failed to verify ID token: oidc: id token signed with unsupported algorithm,
--      expected [\"ES256\"] got \"HS256\""
--   → เลยต้องเชื่อมเอง (ดู supabase/functions/line-login/index.ts) ตารางนี้ใช้จำว่า
--     LINE user คนนี้ (line_user_id) ผูกกับบัญชี Supabase (user_id) ไหนไว้แล้ว
--     กันไม่ให้ล็อกอินซ้ำแล้วสร้างบัญชีใหม่ซ้อนทุกครั้ง
--
-- วิธีรัน: Supabase Dashboard → SQL Editor → วางไฟล์นี้ทั้งไฟล์ → Run
-- ════════════════════════════════════════════════════════════

create table if not exists public.line_identities (
  line_user_id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- เปิด RLS แต่ "ตั้งใจไม่ใส่ policy ให้ใครเลย" — ตารางนี้เข้าถึงได้เฉพาะ service_role
-- (ที่ Edge Function line-login ใช้ ซึ่ง bypass RLS อยู่แล้วเป็นปกติของ service_role)
-- ผลคือ: client ฝั่งเว็บ (ใช้ anon key) อ่าน/เขียนตารางนี้ตรงๆ ไม่ได้เลยแม้แต่ SELECT เดียว
-- ปลอดภัยสุด เพราะตารางนี้ไม่มีเหตุผลอะไรที่ browser ต้องแตะเลย
alter table public.line_identities enable row level security;
