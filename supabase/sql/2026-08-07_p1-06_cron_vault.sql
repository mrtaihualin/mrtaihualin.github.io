-- ============================================================================
-- P1-06 — ย้ายค่าลับออกจากคำสั่ง cron ไปเก็บใน Supabase Vault
-- ============================================================================
-- สร้าง: 2026-08-07
-- แผนต้นทาง: Documents/Claude/Projects/Bussiness Idea/ระบบเว็บไซต์/16_แผน_P1-06_ย้ายค่าลับออกจาก_cron.md
-- สถานะ: ✅ ใช้งานจริง — ไฟล์นี้เป็นต้นฉบับล่าสุดของ private.call_*_cron() ทุกตัว
--
-- ปัญหาที่แก้:
--   pg_cron เก็บคำสั่งเป็น "ข้อความ" ในตาราง cron.job → ใครเปิด Dashboard → Database → Cron
--   จะเห็น token ที่ฝังใน header Authorization ทั้งก้อน (ยืนยันแล้ว 2026-08-07: job 5 และ 9
--   ฝัง service_role JWT เต็มๆ อ่านได้จากหน้าจอ)
--   วิธีแก้: เก็บ token ใน Vault (เข้ารหัสด้วย pgsodium) แล้วให้ cron เรียกฟังก์ชันแทน
--   → คำสั่งใน cron.job เหลือแค่ `select private.call_xxx();` ไม่มีค่าให้เห็นอีก
--
-- ⚠️ ไฟล์นี้ "ไม่มีค่าลับ" และห้ามมีเด็ดขาด (repo เป็น public)
--   ค่าจริงเข้า Vault ด้วยคำสั่งในหัวข้อ [B] ซึ่งดึงค่าจากคำสั่ง cron เดิมโดยตรง
--   ไม่ต้องพิมพ์/คัดลอกค่าด้วยมือเลย
--
-- 🔴 กฎการรัน: รันทีละหัวข้อ ตามลำดับ A → B → C → D → E
--   ห้ามรวบรันทั้งไฟล์ทีเดียว เพราะหัวข้อ D สลับ cron จริงและต้องพิสูจน์ทีละงานก่อนไปงานถัดไป
--   ทุกคำสั่งเขียนให้รันซ้ำได้ (idempotent) — รันซ้ำไม่พัง ไม่สร้างของซ้ำ
--
-- 📌 สถานะ ณ 2026-08-07 (ทำไปแล้วบางส่วนผ่าน SQL Editor ก่อนมีไฟล์นี้):
--   ✅ schema private, extension supabase_vault, secret ของ welcome-retry + request-sla
--   ✅ job 10 (welcome-retry-cron-hourly) สลับไปใช้ฟังก์ชันแล้ว พิสูจน์ว่ารันอัตโนมัติได้จริง
--   ⬜ job 8, 9, 5, 14 ยังไม่ย้าย
-- ============================================================================


-- ============================================================================
-- [A] โครงสร้างพื้นฐาน — รันได้เลย ปลอดภัย ไม่กระทบ cron ที่ทำงานอยู่
-- ============================================================================

-- A1. schema สำหรับเก็บฟังก์ชันภายใน
--     ใช้ private (ไม่ใช่ public) เพราะ PostgREST ไม่ expose schema นี้
--     → ยิง REST API เรียกฟังก์ชันเหล่านี้จากภายนอกไม่ได้เลย
create schema if not exists private;

-- A2. Vault extension (Supabase เปิดมาให้แล้วโดยปกติ)
create extension if not exists supabase_vault;

-- A3. ตารางบันทึกผลการยิง HTTP ของ cron
--     ทำไมต้องมี: net._http_response ไม่มีคอลัมน์บอกว่าแถวไหนมาจาก job ไหน
--     ถ้าไม่เก็บ request_id ไว้ จะ "เดา" เอาว่าแถวไหนเป็นของใคร ซึ่งผิดกฎห้ามเดา
--     net.http_post คืนเลข request_id ที่ตรงกับ net._http_response.id → เก็บไว้ join ได้ตรงๆ
create table if not exists private.cron_http_log (
  id          bigserial primary key,
  job_name    text        not null,
  request_id  bigint      not null,
  called_at   timestamptz not null default now()
);

-- A4. เปิด RLS (ไม่ต้องมี policy)
--     ตารางนี้ไม่มีใครต้องอ่านผ่าน API เลย → ไม่มี policy = ไม่มีใครแตะได้ = fail-closed
--     ฟังก์ชัน security definer ด้านล่างรันด้วยสิทธิ์เจ้าของ จึงเขียนได้ตามปกติ
alter table private.cron_http_log enable row level security;

-- A5. กันตารางบวมโดยไม่มีใครดูแล — ลบ log เก่ากว่า 30 วันทิ้งอัตโนมัติทุกครั้งที่เขียน
--     (ไม่ใช้ cron แยกเพื่อไม่ให้เพิ่มงานให้ต้องดูแลอีกตัว)
create or replace function private.trim_cron_http_log()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from private.cron_http_log
  where called_at < now() - interval '30 days';
  return null;
end;
$$;

drop trigger if exists trg_trim_cron_http_log on private.cron_http_log;
create trigger trg_trim_cron_http_log
  after insert on private.cron_http_log
  for each statement
  execute function private.trim_cron_http_log();


-- ============================================================================
-- [B] ใส่ค่าลับเข้า Vault — 🔴 รันใน SQL Editor เท่านั้น
-- ============================================================================
-- คำสั่งกลุ่มนี้ "ไม่มีค่าลับในตัวมันเอง" เพราะดึงค่าจากคำสั่ง cron เดิมโดยตรง
-- (regex ตัดเอาเฉพาะข้อความหลัง 'Bearer ' ออกมา) จึงเก็บไว้ในไฟล์นี้ได้อย่างปลอดภัย
--
-- ⚠️ ถ้า job ไหนถูกสลับไปใช้ฟังก์ชันแล้ว (คำสั่งไม่มี Bearer อีก) คำสั่งดึงค่าจะได้ null
--    → ต้องดึงจาก job ที่ยังไม่ย้ายแทน (เช่น job 5) หรือใส่ค่าด้วยมือจาก
--      Dashboard → Project Settings → API Keys
--
-- ตรวจก่อนใส่เสมอ: ต้องได้ starts_with = 'eyJ' และ token_length เป็นหลักร้อย
--   select length(substring(command from 'Bearer ([A-Za-z0-9._-]+)')) as token_length,
--          left(substring(command from 'Bearer ([A-Za-z0-9._-]+)'), 3) as starts_with
--   from cron.job where jobid = <เลข job>;

-- B1. welcome-retry-cron-hourly (job 10) — ใช้ anon key (ฟังก์ชันปลายทางปิด Verify JWT)
--     ✅ ทำแล้ว 2026-08-07 · secret id: fdc1be55-9bc7-433a-8147-2baf49855b08
-- select vault.create_secret(
--   (select substring(command from 'Bearer ([A-Za-z0-9._-]+)') from cron.job where jobid = 10),
--   'cron_welcome_retry_key'
-- );

-- B2. request-sla-reminder (job 8) — เดิมเป็น placeholder ใช้ไม่ได้จริง
--     จึงต้องยืมค่า service_role จาก job 5 ที่ยืนยันแล้วว่าใช้งานได้
--     ✅ ทำแล้ว 2026-08-07 · secret id: 97792e97-9201-481e-8693-2644804e23e5
-- select vault.create_secret(
--   (select substring(command from 'Bearer ([A-Za-z0-9._-]+)') from cron.job where jobid = 5),
--   'cron_request_sla_key'
-- );

-- B3. low-quota-daily (job 9) — service_role (ยืนยันจาก JWT payload 2026-08-07)
select vault.create_secret(
  (select substring(command from 'Bearer ([A-Za-z0-9._-]+)') from cron.job where jobid = 9),
  'cron_low_quota_key'
);

-- B4. class-reminder-every-5-min (job 5) — service_role (ยืนยันจาก JWT payload 2026-08-07)
select vault.create_secret(
  (select substring(command from 'Bearer ([A-Za-z0-9._-]+)') from cron.job where jobid = 5),
  'cron_class_reminder_key'
);

-- B5. calendar-schedule-sync-cron (job 14) — ใช้ header 'apikey' ไม่ใช่ 'Authorization'
--     ⚠️ ฟังก์ชันปลายทางปิด Verify JWT และไม่มีด่านตรวจผู้เรียกเอง
--        การย้ายเข้า Vault ทำให้ Dashboard ไม่เห็นค่า แต่ "ไม่ได้ปิดช่องที่ใครก็เรียก endpoint ได้"
--        เรื่องนั้นเป็นงานแยก ต้องขออนุมัติ Lin ต่างหาก (ดูแผน 16 หัวข้อ 6 หมายเหตุ)
select vault.create_secret(
  (select substring(command from 'apikey''\s*,\s*''([A-Za-z0-9._-]+)') from cron.job where jobid = 14),
  'cron_calendar_sync_key'
);

-- ตรวจว่าใส่ครบและค่าถูกต้อง (ไม่แสดงค่าจริง)
select name,
       length(decrypted_secret) as secret_length,
       left(decrypted_secret, 3) as starts_with,
       decrypted_secret ~ '\s' as contains_whitespace
from vault.decrypted_secrets
where name like 'cron_%'
order by name;
-- ✅ ต้องได้ทุกแถว: starts_with = 'eyJ' · secret_length หลักร้อย · contains_whitespace = false


-- ============================================================================
-- [C] ฟังก์ชัน wrapper — 1 ฟังก์ชันต่อ 1 cron
-- ============================================================================
-- ทำไมแยกฟังก์ชันต่องาน ไม่ใช้ตัวรวม: จะได้ปิด/เปลี่ยน/ย้อนกลับทีละงานได้
-- โดยไม่กระทบงานอื่น (ถ้ารวมเป็นตัวเดียว แก้พลาดครั้งเดียว = cron พังหมดทุกงาน)
--
-- ทุกตัวใช้:
--   security definer  → รันด้วยสิทธิ์เจ้าของ เข้าถึง Vault ได้แม้ผู้เรียกไม่มีสิทธิ์
--   set search_path = '' → กัน search_path hijack (ต้องเขียนชื่อ schema เต็มทุกที่)
--   บันทึก request_id → ตรวจย้อนหลังได้ว่า HTTP ตอบอะไร ไม่ต้องเดา

-- C1. welcome-retry-cron-hourly (job 10)
create or replace function private.call_welcome_retry_cron()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key        text;
  v_request_id bigint;
begin
  select decrypted_secret into v_key
  from vault.decrypted_secrets
  where name = 'cron_welcome_retry_key';

  if v_key is null then
    raise exception 'ไม่พบค่าลับ cron_welcome_retry_key ใน Vault — หยุดทำงาน ไม่ยิง request';
  end if;

  select net.http_post(
    url     := 'https://qzkxlhpcputsvbqmtqfi.supabase.co/functions/v1/welcome-retry-cron',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'Authorization', 'Bearer ' || v_key
               ),
    body    := '{}'::jsonb
  ) into v_request_id;

  insert into private.cron_http_log(job_name, request_id)
  values ('welcome-retry-cron-hourly', v_request_id);
end;
$$;

-- C2. request-sla-reminder (job 8)
--     ⚠️ ฟังก์ชันปลายทางส่ง LINE หาครูจริงถ้าเจอคำขอค้างเกิน 48 ชม.
--        ทดสอบตัวนี้ = อาจมีข้อความเข้า LINE ของ Lin จริง (ไม่ใช่ broadcast ส่งเฉพาะครู)
create or replace function private.call_request_sla_cron()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key        text;
  v_request_id bigint;
begin
  select decrypted_secret into v_key
  from vault.decrypted_secrets
  where name = 'cron_request_sla_key';

  if v_key is null then
    raise exception 'ไม่พบค่าลับ cron_request_sla_key ใน Vault — หยุดทำงาน ไม่ยิง request';
  end if;

  select net.http_post(
    url     := 'https://qzkxlhpcputsvbqmtqfi.supabase.co/functions/v1/request-sla-cron',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'Authorization', 'Bearer ' || v_key
               ),
    body    := '{}'::jsonb
  ) into v_request_id;

  insert into private.cron_http_log(job_name, request_id)
  values ('request-sla-reminder', v_request_id);
end;
$$;

-- C3. low-quota-daily (job 9)
create or replace function private.call_low_quota_cron()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key        text;
  v_request_id bigint;
begin
  select decrypted_secret into v_key
  from vault.decrypted_secrets
  where name = 'cron_low_quota_key';

  if v_key is null then
    raise exception 'ไม่พบค่าลับ cron_low_quota_key ใน Vault — หยุดทำงาน ไม่ยิง request';
  end if;

  select net.http_post(
    url     := 'https://qzkxlhpcputsvbqmtqfi.supabase.co/functions/v1/low-quota-cron',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'Authorization', 'Bearer ' || v_key
               ),
    body    := '{}'::jsonb
  ) into v_request_id;

  insert into private.cron_http_log(job_name, request_id)
  values ('low-quota-daily', v_request_id);
end;
$$;

-- C4. class-reminder-every-5-min (job 5)
--     ⚠️ ตัวนี้ส่งข้อความเตือนก่อนเรียนหานักเรียนจริง และรันทุก 5 นาที
--        เป็นงานที่ควรย้าย "ตัวสุดท้าย" หลังกระบวนการนิ่งแล้ว
create or replace function private.call_class_reminder_cron()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key        text;
  v_request_id bigint;
begin
  select decrypted_secret into v_key
  from vault.decrypted_secrets
  where name = 'cron_class_reminder_key';

  if v_key is null then
    raise exception 'ไม่พบค่าลับ cron_class_reminder_key ใน Vault — หยุดทำงาน ไม่ยิง request';
  end if;

  select net.http_post(
    url     := 'https://qzkxlhpcputsvbqmtqfi.supabase.co/functions/v1/class-reminder-cron',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'Authorization', 'Bearer ' || v_key
               ),
    body    := '{}'::jsonb
  ) into v_request_id;

  insert into private.cron_http_log(job_name, request_id)
  values ('class-reminder-every-5-min', v_request_id);
end;
$$;

-- C5. calendar-schedule-sync-cron (job 14) — ใช้ header 'apikey' ตามของเดิม
create or replace function private.call_calendar_sync_cron()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key        text;
  v_request_id bigint;
begin
  select decrypted_secret into v_key
  from vault.decrypted_secrets
  where name = 'cron_calendar_sync_key';

  if v_key is null then
    raise exception 'ไม่พบค่าลับ cron_calendar_sync_key ใน Vault — หยุดทำงาน ไม่ยิง request';
  end if;

  select net.http_post(
    url     := 'https://qzkxlhpcputsvbqmtqfi.supabase.co/functions/v1/calendar-schedule-sync-cron',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'apikey', v_key
               ),
    body    := '{}'::jsonb
  ) into v_request_id;

  insert into private.cron_http_log(job_name, request_id)
  values ('calendar-schedule-sync-cron', v_request_id);
end;
$$;


-- ============================================================================
-- [D] สลับ cron จริง — 🔴 ทีละงาน ห้ามรวบ
-- ============================================================================
-- ลำดับ (ผลกระทบต่ำ → สูง) ตามแผน 16 หัวข้อ 6:
--   job 10 welcome-retry  →  job 8 request-sla  →  job 9 low-quota
--   →  job 14 calendar-sync  →  job 5 class-reminder
--
-- ขั้นตอนบังคับต่อ 1 งาน (ห้ามข้าม):
--   1) เรียกฟังก์ชันด้วยมือ 1 ครั้ง  →  2) เช็คว่า HTTP ตอบ 2xx (หัวข้อ E1)
--   3) สลับ cron  →  4) รอรอบจริง 1 รอบ  →  5) เช็คซ้ำว่ารอบอัตโนมัติได้ 2xx
--   6) ผ่านแล้วจึงไปงานถัดไป · ไม่ผ่าน = rollback เฉพาะงานนั้น (หัวข้อ F) แล้วหยุด

-- D1. welcome-retry-cron-hourly — ✅ ทำแล้ว + พิสูจน์แล้ว 2026-08-07
select cron.alter_job(10, command := $$select private.call_welcome_retry_cron();$$);

-- D2. request-sla-reminder
--     📌 ตัวนี้พิเศษ: ของเดิมเป็น placeholder = ไม่เคยเรียกสำเร็จเลยตั้งแต่ตั้ง cron มา
--        แปลว่าตัวเตือนครู 48 ชม. ไม่เคยทำงานจริง — พอสลับแล้วมันจะเริ่มทำงานครั้งแรก
--        ถ้ามีคำขอค้างเก่าค้างอยู่ อาจมีข้อความเข้า LINE ของครูทันที (ปกติ ไม่ใช่บั๊ก)
--     📌 ปลายทางเปิด Verify JWT อยู่ → ถ้าได้ 2xx = พิสูจน์ว่า Vault ส่ง token ถูกต้องจริง
select cron.alter_job(8, command := $$select private.call_request_sla_cron();$$);

-- D3. low-quota-daily
select cron.alter_job(9, command := $$select private.call_low_quota_cron();$$);

-- D4. calendar-schedule-sync-cron
select cron.alter_job(14, command := $$select private.call_calendar_sync_cron();$$);

-- D5. class-reminder-every-5-min — ทำเป็นตัวสุดท้าย (ทุก 5 นาที · ส่งข้อความหานักเรียนจริง)
select cron.alter_job(5, command := $$select private.call_class_reminder_cron();$$);

-- D6. low-quota-cron-daily (job 12) — ลบทิ้ง ไม่ต้องย้าย
--     ยืนยันแล้ว 2026-08-07: header มีแค่ Content-Type ไม่มี Authorization/apikey เลย
--     ปลายทาง low-quota-cron เปิด Verify JWT → request นี้ต้องโดนปฏิเสธทุกครั้ง
--     = เป็นงานซ้ำที่ไม่เคยทำงานจริง (ตัวจริงคือ job 9)
--     🔴 ก่อนรัน: ยืนยันด้วย E3 ก่อนว่า job 12 ไม่เคยยิงสำเร็จจริง
-- select cron.unschedule(12);


-- ============================================================================
-- [E] คำสั่งตรวจ — ใช้ได้ตลอด ไม่แก้อะไร
-- ============================================================================

-- E1. 🔑 หลักฐานตรงว่า cron ตัวไหนได้ HTTP อะไร (ไม่ต้องเดา)
select l.job_name,
       l.request_id,
       r.status_code,
       r.error_msg,
       l.called_at
from private.cron_http_log l
left join net._http_response r on r.id = l.request_id
order by l.id desc
limit 20;
-- ⚠️ status_code = null แปลว่า "ยังไม่มีผลตอบกลับ" (net.http_post เป็น async รอสักครู่แล้วรันใหม่)
--    หรือแถวใน net._http_response ถูกล้างไปแล้ว (Supabase เก็บย้อนหลังจำกัด)

-- E2. คำสั่ง cron ตัวไหนยังมีค่าลับฝังอยู่บ้าง (ไม่แสดงคำสั่ง จึงปลอดภัยที่จะคัดลอกผลไปคุย)
select jobid,
       jobname,
       schedule,
       active,
       command !~ 'Bearer|apikey|eyJ' as command_is_clean
from cron.job
order by jobid;
-- ✅ เป้าหมายของ P1-06: command_is_clean = true ทุกแถว

-- E3. ประวัติการรันของ pg_cron (บอกว่า "สั่งรันแล้วไม่ error" — ไม่ได้บอกว่า HTTP สำเร็จ)
select jobid, status, return_message, start_time
from cron.job_run_details
order by start_time desc
limit 30;

-- E4. ตรวจว่าฟังก์ชันไม่ซ้อนกัน (กฎเดิมของ repo — 1 ฟังก์ชัน 1 ตัวเท่านั้น)
select p.proname,
       pg_get_function_identity_arguments(p.oid) as ช่องรับค่า
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'private'
  and p.proname like 'call\_%'
order by p.proname;
-- ✅ แต่ละชื่อต้องมีแถวเดียว


-- ============================================================================
-- [F] Rollback — ประกอบคำสั่งเดิมคืนจากค่าใน Vault
-- ============================================================================
-- ใช้เมื่อ: สลับแล้ว cron ใหม่ไม่ทำงาน (ปลายทางตอบ 401/403/5xx หรือไม่มี log เลย)
-- หลักการ: ค่าเดิมยัง active อยู่ (ยังไม่ revoke ตาม P1-05) จึงกลับไปใช้คำสั่งเดิมได้ทันที
--
-- 🔴 ข้อยกเว้นสำคัญ: ถ้าสงสัยว่าค่าเดิมเคยรั่ว ห้ามใช้คำสั่งกลุ่มนี้
--    ให้ปิด job ชั่วคราวแทน (select cron.alter_job(<id>, active := false);)
--    แล้วรอ P1-07 ออกค่าใหม่ ตามกฎ P1-05 หัวข้อ 7.1 ข้อ 4

-- F1. welcome-retry-cron-hourly
-- select cron.alter_job(10, command := format($$
--   select net.http_post(
--     url := 'https://qzkxlhpcputsvbqmtqfi.supabase.co/functions/v1/welcome-retry-cron',
--     headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer %s'),
--     body := '{}'::jsonb
--   ) as request_id;
-- $$, (select decrypted_secret from vault.decrypted_secrets where name = 'cron_welcome_retry_key')));

-- F2. request-sla-reminder — ⚠️ ของเดิมเป็น placeholder ที่ใช้ไม่ได้อยู่แล้ว
--     การ rollback ตัวนี้ = กลับไปสู่สภาพ "ไม่เคยทำงาน" ซึ่งแย่กว่าปล่อยไว้
--     ถ้าสลับแล้วพัง ให้แก้ให้ถูกแทนการ rollback

-- F3. low-quota-daily
-- select cron.alter_job(9, command := format($$
--   select net.http_post(
--     url     := 'https://qzkxlhpcputsvbqmtqfi.supabase.co/functions/v1/low-quota-cron',
--     headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer %s'),
--     body    := '{}'::jsonb
--   );
-- $$, (select decrypted_secret from vault.decrypted_secrets where name = 'cron_low_quota_key')));

-- F4. calendar-schedule-sync-cron
-- select cron.alter_job(14, command := format($$
--   select net.http_post(
--     url := 'https://qzkxlhpcputsvbqmtqfi.supabase.co/functions/v1/calendar-schedule-sync-cron',
--     headers := jsonb_build_object('Content-Type','application/json','apikey','%s'),
--     body := '{}'::jsonb
--   );
-- $$, (select decrypted_secret from vault.decrypted_secrets where name = 'cron_calendar_sync_key')));

-- F5. class-reminder-every-5-min
-- select cron.alter_job(5, command := format($$
--   select net.http_post(
--     url     := 'https://qzkxlhpcputsvbqmtqfi.supabase.co/functions/v1/class-reminder-cron',
--     headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer %s'),
--     body    := '{}'::jsonb
--   );
-- $$, (select decrypted_secret from vault.decrypted_secrets where name = 'cron_class_reminder_key')));


-- ============================================================================
-- [G] เปลี่ยนค่าลับในอนาคต (ตอนทำ P1-07 rotate)
-- ============================================================================
-- ข้อดีหลังทำ P1-06: rotate service_role แล้ว "ไม่ต้องแก้คำสั่ง cron" อีกต่อไป
-- แค่อัปเดตค่าใน Vault ที่เดียว ทุก cron ที่ใช้ค่านั้นจะได้ค่าใหม่ทันทีในรอบถัดไป
--
-- 🔴 คำสั่งนี้มีค่าจริง — รันใน SQL Editor เท่านั้น ห้ามเขียนค่าลงไฟล์ใดๆ
-- select vault.update_secret('<secret uuid>', '<ค่าใหม่>');
--
-- ดู uuid ของแต่ละ secret:
-- select id, name, updated_at from vault.secrets where name like 'cron_%' order by name;
