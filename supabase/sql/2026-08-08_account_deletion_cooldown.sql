-- ════════════════════════════════════════════════════════════════════════════
-- 2026-08-08 — Account Deletion Cooldown (7 วัน) + ตาราง log ส่งอีเมล
-- ────────────────────────────────────────────────────────────────────────────
-- สถานะไฟล์นี้: 🔴 DRAFT — ยังไม่ได้รัน (เตรียมไว้ตามที่ Lin อนุมัติ flow แล้ว แต่ตัวไฟล์นี้ยังรอ Lin
--   ตรวจ + สั่งรันเองใน SQL Editor ตามกฎเว็บ "ห้ามแก้ไฟล์/ระบบก่อนได้รับอนุมัติ" — AI ไม่มีสิทธิ์รันเอง)
--
-- ที่มา: Lin อนุมัติ flow ลบบัญชีแบบมี cooldown 7 วันแล้ว (ผ่านแชท decision queue 2026-08-08):
--   1) ผู้ใช้ยื่นคำขอลบ → เข้าสถานะ "pending" (ยังไม่ลบจริง)
--   2) ระหว่าง 7 วัน: ยัง login/เล่นเกมได้ปกติ · login ไม่ถือเป็นการยกเลิกคำขอ (ต้องกดยกเลิกเองเท่านั้น)
--   3) ผู้ใช้กดยกเลิกได้เอง → กลับสถานะปกติทันที
--   4) ครบ 7 วันแล้วยังไม่ยกเลิก → cron (`account-delete-cron`) ลบถาวรจริง (ทำตามขั้นตอนเดิมที่
--      `account-delete/index.ts` เคยทำตอน action=confirm — ย้ายมาไว้ที่ cron แทน)
--   ดูงานฝั่งโค้ดคู่กัน: `supabase/functions/account-delete/index.ts` (rewrite เป็น preview/request/cancel),
--   `supabase/functions/account-delete-cron/index.ts` (ตัวลบจริงเมื่อครบกำหนด — ใหม่),
--   `supabase/functions/send-transactional-email/index.ts` (ส่งอีเมลยืนยัน 3 จุด — ใหม่)
--
-- ทำไมต้องมีตารางใหม่ (ของเดิมไม่พอ): `account-delete/index.ts` เดิมไม่มีที่เก็บ "สถานะรอลบ" เลย
--   preview→confirm แล้วลบทันที ไม่มีขั้นกลาง — ต้องมีที่เก็บว่า "ใครขอลบไว้ กำหนดลบวันไหน ยกเลิกไปหรือยัง"
--
-- สไตล์ตารางอ้างอิงจาก `account_audit_log`/`line_identities` (RLS เปิด ไม่มี policy ตั้งใจ — fail-closed)
--   เพราะข้อมูล "ใครกำลังจะถูกลบบัญชี" เป็นข้อมูลอ่อนไหว ไม่ควรให้ client อ่าน/เขียนตรงผ่าน PostgREST เลย
--   ทุกการอ่าน/เขียนต้องผ่าน Edge Function (service_role) ที่ยืนยันตัวตนจาก JWT ก่อนเสมอ (เหมือน
--   account-delete/account-export/account-unlink ที่มีอยู่แล้วทั้งหมด)
--
-- รันซ้ำได้ (idempotent): create table if not exists / create or replace function /
--   do $do$ ... exception when duplicate_object ... สำหรับ constraint (แพทเทิร์นเดียวกับไฟล์อื่นใน repo นี้)
--
-- 🔴 คำสั่งในไฟล์นี้ไม่มีคำสั่งทำลายข้อมูล (DROP TABLE/DELETE/TRUNCATE) เลย — เป็นแค่ CREATE TABLE ใหม่
--   + ขยาย CHECK constraint ของ account_audit_log (ADD ค่าเพิ่ม ไม่ตัดค่าเดิมออก) จึงไม่จำเป็นต้อง backup
--   ก่อนรัน (ตามกฎ CLAUDE.md ข้อ 6 ของหัวข้อ SQL — ระบุเหตุผลไว้ตรงนี้ตามที่กฎกำหนด) แต่ยังคงแนบ
--   [D] rollback block ไว้ให้ตามกฎเดิม เผื่อ Lin อยากถอยกลับ
--
-- 🔴 กฎการรัน: รันทีละหัวข้อ A → B → C ตามลำดับ ห้ามรวบทั้งไฟล์ (C ต้องรอ deploy
--   account-delete-cron เสร็จก่อน ไม่งั้น cron จะยิงไปเจอ 404)
--
-- 🆕 อัปเดต (รอบ 3 — 2026-08-08 ตามที่ Lin สั่ง): เพิ่ม 3 คอลัมน์ใน [A] สำหรับ retry อีเมล "ลบสำเร็จ"
--   อย่างปลอดภัยโดยไม่ต้องพึ่งความจำชั่วคราวของ cron (`contact_email_snapshot` /
--   `completed_email_attempts` / `completed_email_last_attempt_at`) — ดูเหตุผลเต็มที่คอมเมนต์ตรงคอลัมน์
--   ยังเป็นไฟล์เดียวกัน ยังไม่เคยรันมาก่อนเลยทั้งไฟล์ (รวมรอบนี้ด้วย) จึงแก้ตรงนี้ได้โดยไม่กระทบอะไร
-- ════════════════════════════════════════════════════════════════════════════


-- ============================================================================
-- [A] ตาราง account_deletion_requests — เก็บสถานะคำขอลบบัญชีแบบมี cooldown
-- ============================================================================

create table if not exists public.account_deletion_requests (
  id                       bigint generated always as identity primary key,
  user_id                  uuid        not null,          -- บัญชีที่ขอลบ (ไม่มี FK ไป auth.users ตั้งใจ
                                                             -- — เหตุผลเดียวกับ account_audit_log: กันปัญหา
                                                             -- "ลบบัญชีแล้วแถวนี้หายไปด้วย (cascade)" ทั้งที่
                                                             -- แถวนี้ต้องอยู่ต่อเป็นหลักฐานว่า "ลบไปแล้วจริงเมื่อไร")
  status                   text        not null default 'pending', -- pending / cancelled / completed
  requested_at             timestamptz not null default now(),
  scheduled_delete_at      timestamptz not null,          -- requested_at + 7 วัน (คำนวณฝั่ง Edge Function
                                                             -- ไม่ใช้ generated column กันเผื่ออนาคตอยากปรับ
                                                             -- จำนวนวันเป็นรายคน)
  cancelled_at             timestamptz,
  completed_at             timestamptz,                    -- ลบถาวรสำเร็จจริงเมื่อไร (cron เขียน)
  processing_started_at    timestamptz,                    -- กันกดซ้ำ/cron รันซ้อนกัน (claim-then-process
                                                             -- แบบเดียวกับ classroom_requests) ค้างเกิน 15 นาที
                                                             -- = ถือว่าตายกลางทาง แย่งคืนได้ (ดูเหตุผลด้านล่าง)
  request_email_sent_at    timestamptz,                    -- กันส่งอีเมล "รับคำขอแล้ว" ซ้ำ (idempotent)
  cancel_email_sent_at     timestamptz,                    -- กันส่งอีเมล "ยกเลิกแล้ว" ซ้ำ
  completed_email_sent_at  timestamptz,                    -- กันส่งอีเมล "ลบถาวรแล้ว" ซ้ำ

  -- 🆕 2026-08-08 (รอบ 3 — ตามที่ Lin สั่ง เพิ่ม failure-handling ของอีเมล "ลบสำเร็จ"):
  -- ต้อง "แคชอีเมลผู้ใช้ไว้ในตารางนี้เอง" ก่อนเริ่มลบ ไม่ใช่พึ่งความจำชั่วคราวในโปรเซส cron อย่างเดียว
  -- เหตุผล: หลังลบ auth user สำเร็จแล้ว auth.users ของ user นั้นหายไปแล้วจริง ไม่มีทาง query อีเมลย้อนหลัง
  -- ได้อีกเลย — ถ้าไม่แคชไว้ที่นี่ก่อน จะ "ส่งอีเมลยืนยันลบไม่สำเร็จ" แล้ว "retry ในรอบถัดไปไม่ได้เลย"
  -- (ไม่รู้จะส่งไปหาใคร) ตารางนี้จึงเป็นที่เก็บถาวรค่านี้แทน ไม่ใช่แค่ log ชั่วคราว
  contact_email_snapshot      text,        -- อีเมลที่แคชไว้ "ก่อน" เริ่มขั้นตอนลบ (เขียนตอน claim แถว)
  completed_email_attempts    int not null default 0,      -- พยายามส่งไปกี่ครั้งแล้ว (นับทั้งสำเร็จ/พลาด)
  completed_email_last_attempt_at timestamptz              -- ส่ง/พยายามส่งครั้งล่าสุดเมื่อไร
);

do $do$ begin
  execute 'alter table public.account_deletion_requests add constraint account_deletion_requests_status_check CHECK ((status = ANY (ARRAY[''pending''::text, ''cancelled''::text, ''completed''::text])))';
exception when duplicate_object then null;
end $do$;

-- กันขอลบซ้อนกันหลายคำขอพร้อมกันของ user คนเดียว (ต้องยกเลิก/ให้คำขอเดิมเสร็จก่อนถึงจะขอใหม่ได้)
-- ★ นี่คือด่านหลักกันบั๊ก race condition ถ้า Edge Function เผลอ insert ซ้ำ — เชื่อ DB มากกว่าเชื่อ
--   logic ฝั่ง Edge Function อย่างเดียว (แพทเทิร์นเดียวกับ payout_ledger.uq_payout_open_per_user)
create unique index if not exists uq_account_deletion_pending_per_user
  on public.account_deletion_requests (user_id)
  where (status = 'pending');

-- ให้ cron หาแถวที่ "ถึงกำหนดแล้ว" ได้เร็ว
create index if not exists idx_account_deletion_requests_due
  on public.account_deletion_requests (scheduled_delete_at)
  where (status = 'pending');

create index if not exists idx_account_deletion_requests_user
  on public.account_deletion_requests (user_id, requested_at desc);

-- 🆕 ให้ cron หาแถว "ลบสำเร็จแล้วแต่ยังไม่ได้ส่งอีเมลยืนยัน (หรือส่งพลาด)" มา retry ได้เร็ว — คนละ pass
-- กับ pass หลักที่ลบบัญชี (pass นี้ "ไม่แตะสถานะ pending เลย" จึงไม่มีทางไปสั่งลบซ้ำ)
create index if not exists idx_account_deletion_requests_email_retry
  on public.account_deletion_requests (completed_at)
  where (status = 'completed' and completed_email_sent_at is null);

alter table public.account_deletion_requests enable row level security;
-- ไม่มี policy ใดๆ ตั้งใจ (fail-closed) — เหมือน account_audit_log/line_identities
-- อ่าน/เขียนได้ทางเดียวคือผ่าน Edge Function (service_role) ที่ยืนยันตัวตนจาก JWT ก่อนเองแล้วเท่านั้น
-- (account-delete/index.ts แปะ .eq('user_id', callerUid) มือทุกครั้ง — ไม่เชื่อ user_id จาก client)


-- ============================================================================
-- [B] ขยาย account_audit_log ให้รองรับ event ใหม่ 2 ตัว (คำขอลบ / ยกเลิกคำขอลบ)
-- ============================================================================
-- ตารางเดิมมี event_type='account_deletion' อยู่แล้ว (ใช้ตอน "ลบถาวรสำเร็จจริง" — ไม่แตะความหมายเดิม)
-- เพิ่ม 2 ค่าใหม่ให้ครอบคลุมขั้นกลางที่ตอนนี้มีจริงแล้ว (cooldown flow):
--   'account_deletion_requested' — ผู้ใช้เพิ่งยื่นคำขอ (เข้า cooldown)
--   'account_deletion_cancelled' — ผู้ใช้กดยกเลิกคำขอเอง
-- Postgres ไม่ให้ ALTER ค่าใน CHECK constraint ตรงๆ ต้อง DROP แล้ว ADD ใหม่ (ปลอดภัย ไม่กระทบแถวเดิม
-- เพราะค่าเดิมทั้ง 8 ค่ายังอยู่ครบ แค่เพิ่มเข้าไปอีก 2 ค่า)

alter table public.account_audit_log
  drop constraint if exists account_audit_log_event_type_check;

do $do$ begin
  execute 'alter table public.account_audit_log add constraint account_audit_log_event_type_check CHECK ((event_type = ANY (ARRAY[''link''::text, ''unlink''::text, ''email_change''::text, ''password_reset''::text, ''account_merge''::text, ''premium_transfer''::text, ''admin_correction''::text, ''account_deletion''::text, ''account_deletion_requested''::text, ''account_deletion_cancelled''::text])))';
exception when duplicate_object then null;
end $do$;


-- ============================================================================
-- [C] pg_cron — เรียก account-delete-cron ทุกวัน (🔴 รันหลัง deploy Edge Function แล้วเท่านั้น)
-- ============================================================================
-- ตามแพทเทิร์น Vault ของ P1-06 (`2026-08-07_p1-06_cron_vault.sql`) — ไม่มีค่าลับฝังในคำสั่ง cron เลย
-- ค่า service_role key ดึงจากของที่มีอยู่แล้วใน Vault (ชื่อ 'cron_class_reminder_key') มา "คัดลอกไว้ในชื่อ
-- ใหม่" ของตัวเอง (`cron_account_delete_key`) — จะได้แยก rotate ได้อิสระในอนาคตถ้าต้องการ ไม่ต้องพิมพ์/
-- แปะค่าจริงด้วยมือเลยสักตัว

-- C1. คัดลอกค่า service_role ที่มีอยู่แล้วมาเก็บในชื่อใหม่
select vault.create_secret(
  (select decrypted_secret from vault.decrypted_secrets where name = 'cron_class_reminder_key'),
  'cron_account_delete_key'
);

-- ตรวจก่อนไปต่อ: ต้องได้ starts_with = 'eyJ' และความยาวหลักร้อย
select length(decrypted_secret) as secret_length, left(decrypted_secret, 3) as starts_with
from vault.decrypted_secrets where name = 'cron_account_delete_key';

-- C2. ฟังก์ชัน wrapper (1 ฟังก์ชันต่อ 1 cron — เหตุผลเดียวกับไฟล์ P1-06)
create or replace function private.call_account_delete_cron()
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
  where name = 'cron_account_delete_key';

  if v_key is null then
    raise exception 'ไม่พบค่าลับ cron_account_delete_key ใน Vault — หยุดทำงาน ไม่ยิง request';
  end if;

  select net.http_post(
    url     := 'https://qzkxlhpcputsvbqmtqfi.supabase.co/functions/v1/account-delete-cron',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'Authorization', 'Bearer ' || v_key
               ),
    body    := '{}'::jsonb
  ) into v_request_id;

  insert into private.cron_http_log(job_name, request_id)
  values ('account-delete-daily', v_request_id);
end;
$$;

-- C3. ตั้งตารางเวลา — รันวันละครั้ง เวลา 20:00 UTC (= ตี 3 เวลาไทย ตรงกับช่วง backup รายวันที่มีอยู่แล้ว
--     เป็นช่วงคนใช้เว็บน้อยสุด) ปรับเวลาได้ตามที่ Lin สะดวก
--     🔴 ก่อนรันบรรทัดนี้ ต้อง deploy `account-delete-cron` ให้เสร็จก่อนเสมอ (ไม่งั้น cron จะยิงไปเจอ 404
--     ทุกวันจนกว่าจะ deploy — ไม่อันตราย แค่ไม่มีอะไรเกิดขึ้น แต่ก็ไม่ควรปล่อยพังไว้)
select cron.schedule(
  'account-delete-daily',
  '0 20 * * *',
  $$select private.call_account_delete_cron();$$
);


-- ============================================================================
-- [D] Rollback
-- ============================================================================
-- D1. ปิด cron (ไม่ลบตาราง/ฟังก์ชัน — ปลอดภัยกว่า ถ้าจะกลับมาเปิดใหม่ทำได้ทันที)
-- select cron.unschedule('account-delete-daily');

-- D2. ถอยการขยาย CHECK constraint ของ account_audit_log กลับเป็น 8 ค่าเดิม
--     ⚠️ ห้ามรันถ้ามีแถวที่ event_type เป็น 2 ค่าใหม่อยู่แล้ว (จะ constraint violation ทันที) —
--     ต้องลบ/แก้แถวเหล่านั้นก่อน ถ้าจะถอยจริงๆ
-- alter table public.account_audit_log drop constraint if exists account_audit_log_event_type_check;
-- do $do$ begin
--   execute 'alter table public.account_audit_log add constraint account_audit_log_event_type_check CHECK ((event_type = ANY (ARRAY[''link''::text, ''unlink''::text, ''email_change''::text, ''password_reset''::text, ''account_merge''::text, ''premium_transfer''::text, ''admin_correction''::text, ''account_deletion''::text])))';
-- exception when duplicate_object then null;
-- end $do$;

-- D3. ตารางใหม่ไม่มีความจำเป็นต้องลบทิ้งแม้ถอยงาน (ไม่มี policy ให้ใครอ่าน/เขียนอยู่แล้ว ทิ้งไว้เฉยๆ
--     ปลอดภัยกว่าการ DROP TABLE) — ถ้า Lin อยากลบจริงๆ ค่อยเขียนคำสั่งแยกตอนนั้น (ต้อง backup ก่อนเสมอ
--     ตามกฎ SQL ทำลายข้อมูล)


-- ============================================================================
-- [E] คำสั่งตรวจ — ใช้ได้ตลอด ไม่แก้อะไร
-- ============================================================================

-- E1. โครงสร้างตารางถูกต้อง + RLS เปิด + ไม่มี policy
select relname, relrowsecurity as rls_เปิดอยู่
from pg_class where relname = 'account_deletion_requests';

select policyname from pg_policies where tablename = 'account_deletion_requests';
-- ✅ ต้องได้ 0 แถว

-- E2. unique index กันขอซ้อนทำงานจริง
select indexname, indexdef from pg_indexes where tablename = 'account_deletion_requests';

-- E3. account_audit_log รองรับ 10 ค่าแล้ว (ของเดิม 8 + ใหม่ 2)
select pg_get_constraintdef(oid) from pg_constraint where conname = 'account_audit_log_event_type_check';

-- E4. cron ตั้งสำเร็จ + คำสั่งสะอาดไม่มีค่าลับ
select jobid, jobname, schedule, active, command !~ 'Bearer|apikey|eyJ' as command_is_clean
from cron.job where jobname = 'account-delete-daily';

-- E5. หลักฐานการยิง HTTP ของ cron ตัวนี้ (หลังรันไปแล้วอย่างน้อย 1 รอบ)
select l.job_name, l.request_id, r.status_code, r.error_msg, l.called_at
from private.cron_http_log l
left join net._http_response r on r.id = l.request_id
where l.job_name = 'account-delete-daily'
order by l.id desc limit 10;

-- E6. 🆕 บัญชีที่ "ลบถาวรสำเร็จแล้วจริง" แต่อีเมลยืนยันยังส่งไม่สำเร็จ (Lin เช็คมือได้ตลอด — ไม่ใช่บั๊ก
--     ถ้ามีแถวโผล่ที่นี่ไม่กี่วันแรก เพราะ cron จะ retry เองอัตโนมัติทุกวัน — แต่ถ้าค้างนานเกิน
--     MAX_EMAIL_RETRY_ATTEMPTS ครั้ง (ดู account-delete-cron/index.ts) จะหยุด retry อัตโนมัติ ต้อง
--     ตรวจมือว่าทำไมส่งไม่ผ่านตลอด — เช่น EMAIL_PROVIDER_API_KEY ยังไม่ได้ตั้ง)
select id, user_id, contact_email_snapshot, completed_at,
       completed_email_attempts, completed_email_last_attempt_at
from public.account_deletion_requests
where status = 'completed' and completed_email_sent_at is null
order by completed_at desc;
-- ════════════════════════════════════════════════════════════════════════════
