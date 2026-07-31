-- ⚠️⚠️ ไฟล์นี้ไม่ใช่ของล่าสุดแล้ว — ห้ามรันซ้ำ (เพิ่มคำเตือน 2026-07-31) ⚠️⚠️
-- ────────────────────────────────────────────────────────────
-- get_student_schedule ถูกแก้ต่ออีกรอบเมื่อ 2026-07-26 · ต้นฉบับล่าสุดอยู่ที่:
--     supabase/2026-07-26_student-rpc-add-rate-limit.sql
-- (ไฟล์นั้นเก็บของที่ไฟล์นี้แก้ — การเอา limit 5 ออก — ไว้แล้ว)
--
-- รันไฟล์นี้ซ้ำจะไม่พังทันที แต่จะลบยามเฝ้าประตูกันคนไล่เดา token (20 ครั้ง/60 วิ ต่อ IP)
-- ที่เพิ่มเมื่อ 2026-07-26 ทิ้งไปเงียบๆ ไม่มี error
--
-- 👉 เก็บไว้เป็นประวัติ ห้ามกด Run · สารบัญ: supabase/sql/00_ฟังก์ชันไหนอยู่ไฟล์ไหน.md
-- ════════════════════════════════════════════════════════════
-- เจอสาเหตุจริงของ "📖 本期課程 โชว์ไม่ครบคอร์ส" (ทุกคนโดนหมด ไม่ใช่แค่ 測試/MARK)
-- ตรวจ classroom_schedule ตรงๆ แล้วพบว่าข้อมูลจริงมีครบ (測試 มี 22 แถวล่วงหน้าถึง 2027-01-08
-- เพราะ SCHEDULE_SYNC_DAYS=180 ที่เพิ่งแก้ทำงานถูกต้องแล้ว) แต่ RPC ที่หน้าเว็บเรียกอ่านข้อมูล
-- (get_student_schedule) มี "limit 5" ฝังอยู่ในตัวฟังก์ชันเอง — ไม่เกี่ยวกับ sync เลย
-- ทุกคนเลยเห็นคาบล่วงหน้าได้สูงสุดแค่ 5 คาบเสมอ ไม่ว่าจะซื้อกี่คาบหรือ sync ไปไกลแค่ไหนก็ตาม
-- (คาดว่าเดิมตั้ง limit 5 ไว้ตอนฟังก์ชันนี้ใช้แค่โชว์วิดเจ็ต "คาบถัดไปไม่กี่คาบ" ก่อนจะถูกเอามาใช้
-- กับตาราง "本期課程" แบบเต็มคอร์สทีหลัง แล้วลืมเอา limit ออก)
--
-- แก้โดยเอา limit 5 ออก — classroom_schedule เองก็ถูกจำกัดขอบเขตอยู่แล้วด้วย SCHEDULE_SYNC_DAYS
-- (180 วันล่วงหน้า) ไม่มีความเสี่ยงข้อมูลบวมเกินจริง
-- รันไฟล์นี้ใน Supabase Dashboard → SQL Editor (รันครั้งเดียว)
-- สร้าง 2026-07-19
-- ════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_student_schedule(p_token text)
 RETURNS TABLE(lesson_date date, start_time text, end_time text, calendar_event_id text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select lesson_date, start_time, end_time, calendar_event_id
  from public.classroom_schedule
  where token = p_token
    and lesson_date >= (now() AT TIME ZONE 'Asia/Bangkok')::date
  order by lesson_date asc, start_time asc;
$function$;
