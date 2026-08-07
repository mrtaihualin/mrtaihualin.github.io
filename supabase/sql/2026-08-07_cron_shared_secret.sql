-- ════════════════════════════════════════════════════════════════════════════
-- 2026-08-07 — เพิ่มกุญแจลับ (shared secret) ให้ cron 2 ตัวที่ Codex ตรวจพบว่าคนนอกยิง URL
-- เปล่าๆ สั่งงานได้เลย (calendar-schedule-sync-cron, welcome-retry-cron)
-- Lin อนุมัติแล้ว 2026-08-07: "ทำทั้งสองอย่าง" (Verify JWT + กุญแจลับในโค้ด กันสองชั้น)
-- ────────────────────────────────────────────────────────────────────────────
-- ทำไมต้องมีชั้นนี้เพิ่ม (Verify JWT อย่างเดียวไม่พอ):
--   ทั้ง 2 cron ส่ง anon key เป็น Bearer token อยู่แล้ว (ดู 2026-08-07_p1-06_cron_vault.sql)
--   anon key เป็น JWT ที่เซ็นถูกต้องจริง → เปิด Verify JWT แล้วก็ยังผ่านด่านได้
--   เพราะ anon key ถูกฝังโชว์อยู่ใน supabase-config.js หน้าเว็บ ใครก็ copy ไปใช้ได้เหมือนกัน
--   ต้องมีรหัสลับอีกตัวที่ "ไม่เปิดเผยต่อสาธารณะเลย" (อยู่แค่ใน Vault + ตัว Edge Function เอง)
--
-- 🔴 รันทีละหัวข้อ [A] → [B] → [C] → [D] ห้ามรวบทั้งไฟล์
--
-- 🔴 [B] ต้องให้ Lin สร้างรหัสสุ่มเองก่อน (ห้าม AI เป็นคนคิดค่าจริงให้ เพื่อไม่ให้มีคนอื่นเห็นค่านี้เลย
--   นอกจาก Lin) วิธีสร้าง: เปิด Terminal (Mac) พิมพ์ `openssl rand -hex 32` แล้วคัดลอกผลลัพธ์มาแทน
--   <ใส่รหัสสุ่มที่ Lin สร้างเองตรงนี้> ด้านล่าง ก่อนรัน — ห้ามใช้ค่าตัวอย่างในคอมเมนต์จริง
--
-- ⚠️ ไฟล์นี้ "ไม่มีค่าลับจริง" อยู่ในตัวมันเอง (มีแต่ placeholder ให้ Lin แทนที่ตอนรันใน SQL Editor)
-- ════════════════════════════════════════════════════════════════════════════

-- ============================================================================
-- [A] ตรวจก่อนว่ายังไม่เคยสร้าง secret ชื่อนี้มาก่อน (กันสร้างซ้ำโดยไม่ตั้งใจ)
-- ============================================================================
select name from vault.secrets where name = 'cron_shared_secret';
-- ถ้าเจอแถวอยู่แล้ว = เคยตั้งไว้แล้ว ข้ามหัวข้อ [B] ไปเลย (อย่าสร้างซ้ำ ใช้ vault.update_secret แทนถ้าจะเปลี่ยนค่า)

-- ============================================================================
-- [B] 🔴 สร้างรหัสลับ — Lin ต้องแทนที่ค่าใน <> ด้วยรหัสสุ่มที่สร้างเอง (openssl rand -hex 32)
-- ============================================================================
select vault.create_secret('<ใส่รหัสสุ่ม 64 ตัวอักษรที่ Lin สร้างเองตรงนี้>', 'cron_shared_secret');

-- ตรวจว่าเข้าไปแล้วจริง (ไม่โชว์ค่าจริง แค่ความยาว)
select name, length(decrypted_secret) as ความยาว
from vault.decrypted_secrets where name = 'cron_shared_secret';
-- ✅ ต้องได้ 1 แถว ความยาว 64

-- ============================================================================
-- [C] แก้ 2 ฟังก์ชันที่เรียก cron ให้แนบ header x-cron-secret ไปด้วย
--     (ช่องรับค่า/ชื่อฟังก์ชันเท่าเดิม CREATE OR REPLACE เขียนทับตัวเดิมได้ปลอดภัย)
-- ============================================================================

create or replace function private.call_calendar_sync_cron()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key        text;  -- anon key (เดิม)
  v_secret     text;  -- 🆕 รหัสลับภายในตัวใหม่
  v_request_id bigint;
begin
  select decrypted_secret into v_key
  from vault.decrypted_secrets where name = 'cron_calendar_sync_key';
  select decrypted_secret into v_secret
  from vault.decrypted_secrets where name = 'cron_shared_secret';

  if v_key is null then
    raise exception 'ไม่พบค่าลับ cron_calendar_sync_key ใน Vault — หยุดทำงาน ไม่ยิง request';
  end if;
  if v_secret is null then
    raise exception 'ไม่พบค่าลับ cron_shared_secret ใน Vault (ยังไม่ได้รันหัวข้อ B) — หยุดทำงาน ไม่ยิง request';
  end if;

  select net.http_post(
    url     := 'https://qzkxlhpcputsvbqmtqfi.supabase.co/functions/v1/calendar-schedule-sync-cron',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'apikey', v_key,
                 'Authorization', 'Bearer ' || v_key,
                 'x-cron-secret', v_secret
               ),
    body    := '{}'::jsonb
  ) into v_request_id;

  insert into private.cron_http_log(job_name, request_id)
  values ('calendar-schedule-sync-cron', v_request_id);
end;
$$;

create or replace function private.call_welcome_retry_cron()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key        text;
  v_secret     text;  -- 🆕 รหัสลับภายในตัวใหม่
  v_request_id bigint;
begin
  select decrypted_secret into v_key
  from vault.decrypted_secrets where name = 'cron_welcome_retry_key';
  select decrypted_secret into v_secret
  from vault.decrypted_secrets where name = 'cron_shared_secret';

  if v_key is null then
    raise exception 'ไม่พบค่าลับ cron_welcome_retry_key ใน Vault — หยุดทำงาน ไม่ยิง request';
  end if;
  if v_secret is null then
    raise exception 'ไม่พบค่าลับ cron_shared_secret ใน Vault (ยังไม่ได้รันหัวข้อ B) — หยุดทำงาน ไม่ยิง request';
  end if;

  select net.http_post(
    url     := 'https://qzkxlhpcputsvbqmtqfi.supabase.co/functions/v1/welcome-retry-cron',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'Authorization', 'Bearer ' || v_key,
                 'x-cron-secret', v_secret
               ),
    body    := '{}'::jsonb
  ) into v_request_id;

  insert into private.cron_http_log(job_name, request_id)
  values ('welcome-retry-cron-hourly', v_request_id);
end;
$$;

-- ============================================================================
-- [D] ตรวจว่าไม่มีฟังก์ชันซ้อนกัน (กฎเดิมของ repo — 1 ฟังก์ชัน 1 ตัวเท่านั้น)
-- ============================================================================
select p.proname, pg_get_function_identity_arguments(p.oid) as ช่องรับค่า
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'private' and p.proname in ('call_calendar_sync_cron', 'call_welcome_retry_cron')
order by p.proname;
-- ✅ แต่ละชื่อต้องมีแถวเดียว

-- ════════════════════════════════════════════════════════════════════════════
-- ขั้นตอนที่เหลือ (Lin ทำเองในเครื่อง/Dashboard — AI แก้ไม่ได้ตามกฎ):
--
-- 1) ตั้งค่า secret ในตัว Edge Function เอง (คนละที่กับ Vault — Edge Function อ่านจาก
--    Deno.env ไม่ใช่จาก Vault โดยตรง) ใช้รหัสเดียวกับที่ใส่ในหัวข้อ [B] ด้านบน:
--      supabase secrets set CRON_INTERNAL_SECRET=<รหัสเดียวกับที่ใส่ในหัวข้อ B>
--
-- 2) Deploy โค้ดที่แก้ไว้แล้ว 2 ตัว (เพิ่มด่านเช็ค header x-cron-secret):
--      supabase functions deploy calendar-schedule-sync-cron
--      supabase functions deploy welcome-retry-cron
--
-- 3) เปิด Verify JWT ให้ 2 ฟังก์ชันนี้ (ชั้นที่ 2 ตามที่ Lin เลือก "ทำทั้งสองอย่าง"):
--      Supabase Dashboard → Edge Functions → เลือกฟังก์ชัน → Settings → ติ๊ก
--      "Enforce JWT Verification" → Save (ทำทั้ง 2 ฟังก์ชัน)
--      ✅ ปลอดภัยที่จะเปิด เพราะ cron ส่ง anon key เป็น Bearer token อยู่แล้ว (ยืนยันจากไฟล์
--      2026-07-17_pg_cron_calendar_schedule_sync.sql และ comment ใน 2026-08-07_p1-06_cron_vault.sql)
--
-- 4) ทดสอบ: เปิด Supabase → Edge Functions → เลือกฟังก์ชัน → Logs → รอรอบ cron ถัดไป
--    (calendar-schedule-sync-cron ทุก 5 นาที, welcome-retry-cron ทุกชั่วโมง) ต้องเห็น 200 ต่อเนื่อง
--    ถ้าเห็น 403/401 ทันทีหลัง deploy = มีขั้นตอนไหนตกหล่น (เช่นลืมข้อ 1 หรือ secret ไม่ตรงกัน)
--
-- ⚠️ ถ้าเปิด Verify JWT ก่อน deploy โค้ดใหม่ (สลับลำดับ) cron จะยังผ่านได้ปกติเหมือนเดิม
--    เพราะ header x-cron-secret เป็นด่าน "เพิ่มเข้ามา" ไม่ได้แทนที่ apikey/Authorization เดิม
--    แต่แนะนำทำตามลำดับ 1→2→3 เพื่อทดสอบทีละชั้นได้ชัดเจนกว่า
-- ════════════════════════════════════════════════════════════════════════════
