-- ════════════════════════════════════════════════════════════
-- (ตัวเลือกเสริม ไม่บังคับ) ย่นรอบ calendar-schedule-sync-cron จาก 20 นาที เหลือ 5 นาที
-- เพื่อเป็นเกราะกันชั้นที่ 2 คู่กับ fix หลัก (โค้ดลบ classroom_schedule ทันทีตอนกดยกเลิกแล้ว)
-- วิธีรัน: Supabase Dashboard → SQL Editor → วางไฟล์นี้ทั้งหมด → Run
-- Lin ต้องรันเองไฟล์นี้ ไม่ใช่การ push เว็บ — ไม่รันก็ไม่เป็นไร เพราะ fix หลักแก้ต้นตอไปแล้ว
-- ════════════════════════════════════════════════════════════

-- ลบ schedule เดิม (*/20 * * * *) ทิ้งก่อน
select cron.unschedule(jobid) from cron.job where jobname = 'calendar-schedule-sync-cron';

-- ตั้งใหม่：ทุก 5 นาทีแทน 20 นาที (เนื้อ url/apikey เหมือนไฟล์เดิม 2026-07-17 ทุกอย่าง เปลี่ยนแค่ schedule)
select cron.schedule(
  'calendar-schedule-sync-cron',
  '*/5 * * * *',
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

-- เช็คว่าตั้งสำเร็จ (ควรเห็น 1 แถว ชื่อ calendar-schedule-sync-cron ตาราง schedule = */5 * * * *)
select jobid, jobname, schedule, active from cron.job where jobname = 'calendar-schedule-sync-cron';
