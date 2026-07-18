-- ════════════════════════════════════════════════════════════
-- ตั้ง pg_cron ให้เรียก Edge Function "low-quota-cron" ทุกเช้า 8 โมง (เวลาไทย = 01:00 UTC)
-- วิธีรัน: Supabase Dashboard → SQL Editor → วางไฟล์นี้ทั้งหมด → Run
-- ต้อง deploy function "low-quota-cron" (supabase functions deploy low-quota-cron) ก่อนรันไฟล์นี้
--
-- 2026-07-18 แก้ (Lin เจอ job id 12 ที่ตั้งไว้รอบแรกไม่มี apikey/Authorization header
--   → Edge Function จะตอบ 401 ทุกครั้งที่ cron เรียก) — ไฟล์นี้ตั้งใหม่ให้ถูกต้อง
--   ใช้ anon key เดียวกับที่ calendar-schedule-sync-cron ใช้อยู่แล้ว (public key ปลอดภัย
--   เพราะเปิด RLS ทุกตารางแล้ว — ดู CLAUDE.md หัวข้อความปลอดภัย)
-- ════════════════════════════════════════════════════════════

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

-- ลบ schedule เก่าชื่อเดียวกันทิ้งก่อน (กันซ้ำ ไม่ว่าจะเคยตั้งถูกหรือผิดมาก่อน)
select cron.unschedule(jobid) from cron.job where jobname = 'low-quota-cron-daily';

select cron.schedule(
  'low-quota-cron-daily',
  '0 1 * * *',  -- 01:00 UTC = 08:00 เวลาไทย
  $$
  select net.http_post(
    url := 'https://qzkxlhpcputsvbqmtqfi.supabase.co/functions/v1/low-quota-cron',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF6a3hsaHBjcHV0c3ZicW10cWZpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2NjI1NDksImV4cCI6MjA5NzIzODU0OX0.1g80zxHfduq9RLdpus10hBDSEYWIXu2Jnqb6LsvqXpw',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF6a3hsaHBjcHV0c3ZicW10cWZpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2NjI1NDksImV4cCI6MjA5NzIzODU0OX0.1g80zxHfduq9RLdpus10hBDSEYWIXu2Jnqb6LsvqXpw'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- เช็คว่าตั้งสำเร็จ (ควรเห็น 1 แถว ชื่อ low-quota-cron-daily ตาราง schedule = 0 1 * * *)
select jobid, jobname, schedule, active from cron.job where jobname = 'low-quota-cron-daily';
