-- ════════════════════════════════════════════════════════════
-- เพิ่มระบบเตือนนักเรียนล่วงหน้า 24 ชั่วโมง (เพิ่มเป็นอันที่ 2 ไม่ทับของเดิม)
-- ของเดิม: line_reminder_sent (เตือน 30 นาทีก่อนเรียน) + line_followup_sent (ขอบคุณหลังเรียน)
-- รันไฟล์นี้ใน Supabase Dashboard → SQL Editor (รันครั้งเดียว) ก่อน deploy ฟังก์ชัน class-reminder-cron ใหม่
-- สร้าง 2026-07-18
-- ════════════════════════════════════════════════════════════

alter table classroom_schedule
  add column if not exists line_reminder24h_sent boolean not null default false;

-- หมายเหตุ: ไม่ต้องแก้ RLS policy ของตาราง classroom_schedule เพิ่ม
-- เพราะ Edge Function (class-reminder-cron) เขียน/อ่านด้วย service_role key อยู่แล้ว (bypass RLS)
-- คอลัมน์ใหม่นี้ใช้ default false ครอบคลุมแถวเก่าทั้งหมดอัตโนมัติ ไม่ต้อง backfill เอง
