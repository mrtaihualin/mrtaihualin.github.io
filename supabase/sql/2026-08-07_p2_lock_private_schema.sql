-- ════════════════════════════════════════════════════════════════════════════
-- 2026-08-07 — P2 ข้อ 2: ปิดสิทธิ์ anon/authenticated เรียกฟังก์ชันใน schema private (ล็อกชั้น 2)
-- ────────────────────────────────────────────────────────────────────────────
-- สถานการณ์ (ยืนยันแล้วจาก P2-02): PostgREST ปิด schema `private` อยู่แล้วตามค่าเริ่มต้น
-- (เปิดแค่ public/graphql_public) ดังนั้นคนนอกยิงผ่าน REST API เข้าฟังก์ชันนี้ไม่ได้อยู่แล้วจริง
-- นี่คือการล็อกชั้น 2 แบบเดียวกับที่ทำกับ game_words/game_sentences — ไม่มีใครต้องใช้สิทธิ์นี้
-- (cron เรียกด้วยสิทธิ์ postgres/superuser ซึ่งไม่โดนกระทบจากคำสั่ง REVOKE นี้เลย)
--
-- Lin อนุมัติแล้ว 2026-08-07 (ตอบคำถาม "ปิดสิทธิ์ anon เรียกฟังก์ชัน private.call_*_cron — ทำเลยไหม?" = ทำเลย)
--
-- ⚠️ ใช้ REVOKE แบบ "ทั้ง schema" ไม่ระบุชื่อฟังก์ชันทีละตัว เพราะไฟล์ในเครื่องเจอแค่ 5 ชื่อ
-- (call_welcome_retry_cron, call_request_sla_cron, call_low_quota_cron, call_class_reminder_cron,
-- call_calendar_sync_cron) แต่เอกสาร P2 บันทึกไว้ว่ามี 6 ตัว — ยังไม่ยืนยันชื่อตัวที่ 6 ในเครื่อง
-- (อาจมีของจริงที่ไม่มีไฟล์ต้นฉบับ เหมือนที่เจอมาแล้วใน P2-01) ทำทั้ง schema จึงชัวร์กว่าและไม่ต้องเดาชื่อ
--
-- รันซ้ำได้ปลอดภัย (idempotent) — REVOKE ที่ไม่เคย GRANT ไว้ไม่ error แค่ไม่มีผล
-- ════════════════════════════════════════════════════════════════════════════

-- [A] ปิดสิทธิ์เรียกฟังก์ชันทั้งหมดที่มีอยู่ตอนนี้ใน schema private จาก public/anon/authenticated
revoke execute on all functions in schema private from public, anon, authenticated;

-- [B] ปิดสิทธิ์เริ่มต้นของฟังก์ชันที่จะสร้างเพิ่มในอนาคตด้วย (กันลืมปิดตอนสร้างฟังก์ชันใหม่)
alter default privileges in schema private revoke execute on functions from public, anon, authenticated;

-- [C] ตรวจผล — ต้องเห็นทุกแถวเป็น false ทั้งคอลัมน์ anon และ authenticated
select
  p.proname as function_name,
  has_function_privilege('anon', p.oid, 'execute') as anon_เรียกได้,
  has_function_privilege('authenticated', p.oid, 'execute') as authenticated_เรียกได้
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'private'
order by p.proname;

-- [D] ถ้าต้องย้อนกลับ (ไม่ควรต้องใช้ แต่เผื่อไว้):
-- grant execute on all functions in schema private to anon, authenticated;
