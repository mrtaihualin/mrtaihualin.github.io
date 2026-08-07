-- ════════════════════════════════════════════════════════════════════════════
-- 2026-08-07 — P2-05: ตารางจดว่า "ไฟล์ SQL ไหนรันจริงแล้วบ้าง" (Lin อนุมัติแล้ว 2026-08-07)
-- ────────────────────────────────────────────────────────────────────────────
-- ปัญหาที่แก้: ตรวจแล้วพบว่าโปรเจกต์นี้ไม่เคยมีระบบติดตาม migration เลย
--   (`supabase_migrations.schema_migrations` ไม่มีอยู่จริง — ยืนยันจาก P2-05)
--   ทุกอย่างพิมพ์ใน Dashboard ตรงๆ มาตลอด → ไม่มีใครรู้ได้ว่าไฟล์ 45 ไฟล์ใน supabase/sql/
--   ไฟล์ไหนถูกรันไปแล้วบ้าง ต้องเดาจากป้ายที่เขียนกำกับด้วยมือ ซึ่งเคยผิดมาแล้ว (บทเรียน P1-06)
--
-- วิธีแก้ (เล็กที่สุดเท่าที่พอ ตามที่ Lin ขอ "ตารางเล็กๆ"):
--   สร้างตาราง private.sql_run_log จดว่าไฟล์ไหน "ยืนยันแล้วว่าใช้งานจริงอยู่ในระบบตอนนี้"
--   ยืนยันด้วยวิธีอะไร (เทียบตัวอักษร / เห็น HTTP 200 จริง / อื่นๆ) — ไม่ใช่ "วันที่รันจริง" เพราะ
--   ไม่มีใครรู้วันที่รันจริงแม่นๆ (ไม่มีการบันทึกไว้ตั้งแต่ต้น) การเขียนวันที่รันแบบเดาจะขัดกฎ "ห้ามเดา"
--   จึงใช้ "วันที่ยืนยันล่าสุดว่ายังใช้งานจริง" แทน ซึ่งเป็นสิ่งที่พิสูจน์ได้จริงจาก P2-03/P2-04/P1-06
--
-- ⚠️ ตารางนี้อยู่ schema `private` (แบบเดียวกับ private.cron_http_log จาก P1-06) เพราะ
--   PostgREST ตามค่าเริ่มต้นไม่ expose schema นี้ = ยิงผ่าน REST API จากภายนอกไม่ได้
--   🔴 ข้อควรระวัง: ความปลอดภัยข้อนี้ขึ้นกับค่า `pgrst.db_schemas` จริงของโปรเจกต์ ซึ่ง**กำลังรอ
--   Lin รันคำสั่ง (E) ในชุด SELECT รอบนี้ยืนยันอยู่** — ถ้าผลออกมาว่า schema private ถูกเปิดให้ยิงผ่าน
--   PostgREST จริง (ผิดจากค่าเริ่มต้น) ต้องกลับมาเพิ่ม RLS policy แบบปิดสนิทให้ตารางนี้ด้วย
--
-- รันซ้ำได้ปลอดภัย (idempotent): create table/insert ใช้ if not exists / on conflict do nothing ทั้งหมด
-- ════════════════════════════════════════════════════════════════════════════

-- 1) ตาราง
create table if not exists private.sql_run_log (
  id                 bigserial primary key,
  file_name          text        not null unique,
  file_date          date,        -- วันที่แปะอยู่ในชื่อไฟล์ (ข้อมูลอ้างอิงเฉยๆ ไม่ใช่หลักฐานว่ารันวันนั้นจริง)
  verified_active_at date        not null,  -- วันที่ยืนยันล่าสุดว่าของในไฟล์นี้ตรงกับระบบจริง
  verified_method    text        not null,  -- ยืนยันด้วยวิธีไหน (เทียบตัวอักษร / HTTP 200 จริง / อื่นๆ)
  note               text,
  logged_at          timestamptz not null default now()  -- เวลาที่แถวนี้ถูกจดเข้าตาราง (ไม่ใช่เวลารันไฟล์)
);

alter table private.sql_run_log enable row level security;
-- ไม่มี policy ใดๆ ตั้งใจ — ไม่มีใครอ่าน/เขียนผ่าน API ได้เลย (fail-closed)
-- แก้ไขตารางนี้ทำผ่าน Supabase SQL Editor เท่านั้น (สิทธิ์ postgres ข้าม RLS ได้อยู่แล้ว)

-- 2) เติมประวัติย้อนหลัง — เฉพาะ 10 ไฟล์ที่ P2-04 ยืนยันแล้วว่าเป็น "ACTIVE" จริง
--    (ไม่รวม 2 ไฟล์ที่ P2-04 พบว่า SQL ทดสอบปนกับ SQL จริง — รอข้อเสนอแยกไฟล์ก่อน ดูงานแยกต่างหาก)
insert into private.sql_run_log (file_name, file_date, verified_active_at, verified_method, note)
values
  ('sql/2026-08-02_rpc_guards_merged.sql', '2026-08-02', '2026-08-07',
   'เทียบตัวอักษรจาก pg_get_functiondef ตรงกันเป๊ะ (P2-03)',
   'ต้นฉบับ submit_class_request, student_update_own_request, respond_to_offer_as_student + ตาราง cron_state'),

  ('sql/2026-08-07_p1-06_cron_vault.sql', '2026-08-07', '2026-08-07',
   'ยิงจริงผ่าน HTTP ได้ 200 ทุกงาน (P1-06)',
   'ต้นฉบับ private.call_*_cron 6 ตัว + private.cron_http_log + คำสั่งสลับ cron ทั้งหมด'),

  ('sql/2026-08-02_game_content_schema.sql', '2026-08-02', '2026-08-07',
   'เทียบตัวอักษรจาก pg_get_functiondef ตรงกันเป๊ะ (P2-03)',
   'ต้นฉบับ game_words, game_sentences, game_content_rl, game_content_rl_check'),

  ('2026-07-26_student-rpc-add-rate-limit.sql', '2026-07-26', '2026-08-07',
   'อยู่ในสารบัญ ACTIVE (P2-04) — ยังไม่ได้เทียบตัวอักษรกับ production',
   'ต้นฉบับ get_student_* RPC 6 ตัว + student_get_own_requests'),

  ('2026-07-26_student-link-rate-limit.sql', '2026-07-26', '2026-08-07',
   'อยู่ในสารบัญ ACTIVE (P2-04) — ยังไม่ได้เทียบตัวอักษรกับ production',
   'ต้นฉบับ slink_client_ip, slink_rl_check, slink_log_fail + ตาราง slink_rl, slink_fail_log'),

  ('sql/2026-07-26_notify_line_gate.sql', '2026-07-26', '2026-08-07',
   'อยู่ในสารบัญ ACTIVE (P2-04) — ยังไม่ได้เทียบตัวอักษรกับ production',
   'ต้นฉบับ notify_line_gate'),

  ('sql/2026-07-26_lego_daily_limits.sql', '2026-07-26', '2026-08-07',
   'อยู่ในสารบัญ ACTIVE (P2-04) — ยังไม่ได้เทียบตัวอักษรกับ production',
   'ต้นฉบับ lego_consume_daily + ตาราง lego_daily_limits'),

  ('sql/2026-07-17_combined_leaderboard.sql', '2026-07-17', '2026-08-07',
   'อยู่ในสารบัญ ACTIVE (P2-04) — ยังไม่ได้เทียบตัวอักษรกับ production',
   'ต้นฉบับ combined_leaderboard_weekly, combined_leaderboard_alltime'),

  ('phase5-payout-gate.sql', null, '2026-08-07',
   'อยู่ในสารบัญ ACTIVE (P2-04) — ยังไม่ได้เทียบตัวอักษรกับ production',
   'ต้นฉบับ payout_precheck'),

  ('phase5-rate-limit.sql', null, '2026-08-07',
   'อยู่ในสารบัญ ACTIVE (P2-04) — ยังไม่ได้เทียบตัวอักษรกับ production',
   'ต้นฉบับ rl_check + ตาราง rl_counters')
on conflict (file_name) do nothing;

-- 3) ตรวจว่าเข้าไปครบ 10 แถว
select file_name, verified_active_at, verified_method
from private.sql_run_log
order by file_date nulls last;
