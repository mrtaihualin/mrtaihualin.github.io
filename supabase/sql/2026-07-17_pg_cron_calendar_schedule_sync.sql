-- ════════════════════════════════════════════════════════════
-- ตั้ง pg_cron ให้เรียก Edge Function "calendar-schedule-sync-cron" ทุก 20 นาที
-- วิธีรัน: Supabase Dashboard → SQL Editor → วางไฟล์นี้ทั้งหมด → Run
-- ต้อง deploy function "calendar-schedule-sync-cron" (supabase functions deploy ...) ก่อนรันไฟล์นี้
-- ════════════════════════════════════════════════════════════

-- เปิด extension ที่ต้องใช้ (ถ้าเปิดไว้แล้วจากตัว cron อื่น รันซ้ำได้ ไม่มีผลเสีย)
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

-- ลบ schedule เก่าชื่อเดียวกันทิ้งก่อน (กันรันซ้ำถ้าเคยตั้งมาก่อนแล้ว)
select cron.unschedule(jobid) from cron.job where jobname = 'calendar-schedule-sync-cron';

-- ตั้งใหม่：ทุก 20 นาที เรียก Edge Function ด้วย anon key (public key อยู่แล้วใน supabase-config.js ปลอดภัย)
select cron.schedule(
  'calendar-schedule-sync-cron',
  '*/20 * * * *',
  $$
  select net.http_post(
    url := 'https://qzkxlhpcputsvbqmtqfi.supabase.co/functions/v1/calendar-schedule-sync-cron',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF6a3hsaHBjcHV0c3ZicW10cWZpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2NjI1NDksImV4cCI6MjA5NzIzODU0OX0.1g80zxHfduq9RLdpus10hBDSEYWIXu2Jnqb6LsvqXpw',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF6a3hsaHBjcHV0c3ZicW10cWZpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2NjI1NDksImV4cCI6MjA5NzIzODU0OX0.1g80zxHfduq9RLdpus10hBDSEYWIXu2Jnqb6LsvqXpw'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- เช็คว่าตั้งสำเร็จ (ควรเห็น 1 แถว ชื่อ calendar-schedule-sync-cron ตาราง schedule = */20 * * * *)
select jobid, jobname, schedule, active from cron.job where jobname = 'calendar-schedule-sync-cron';
