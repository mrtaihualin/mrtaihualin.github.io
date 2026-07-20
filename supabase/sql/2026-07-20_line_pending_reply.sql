-- 2026-07-20 加：ตาราง line_pending_reply
-- ใช้ให้ฟีเจอร์ "ครูกด 💬 聯繫學生 ในไลน์ แล้วพิมพ์ตอบในแชทเดิมได้เลย" (แทนของเดิมที่ต้องเปิดเว็บ)
--
-- ระบบนี้มีครูคนเดียว จึงมีแค่ 1 แถวตายตัว (id=1) เก็บว่า "ประโยคถัดไปที่ครูพิมพ์ในไลน์ ให้ส่งหานักเรียนคนไหน"
-- line-webhook (Edge Function, ใช้ service_role key) เป็นตัวเดียวที่อ่าน/เขียนตารางนี้ —
-- ไม่มีหน้าเว็บไหนเรียกตารางนี้ตรงๆ ด้วย anon key เลย จึงเปิด RLS แล้วไม่ต้องตั้ง policy อะไรเพิ่ม
-- (service_role bypass RLS อยู่แล้ว ส่วน anon/authenticated จะเข้าไม่ได้เลยเพราะไม่มี policy ให้ — ตรงตามที่ต้องการ)
--
-- วิธีรัน: copy ทั้งไฟล์นี้ไปวางใน Supabase Dashboard → SQL Editor → Run

create table if not exists line_pending_reply (
  id smallint primary key,
  student_token text,
  student_name text,
  set_at timestamptz,
  constraint line_pending_reply_single_row check (id = 1)
);

insert into line_pending_reply (id, student_token, student_name, set_at)
values (1, null, null, null)
on conflict (id) do nothing;

alter table line_pending_reply enable row level security;
-- ตั้งใจไม่เพิ่ม policy ใดๆ — ตารางนี้ต้องเข้าถึงได้เฉพาะจาก Edge Function (service_role) เท่านั้น
