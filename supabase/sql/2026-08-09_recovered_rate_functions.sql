-- ════════════════════════════════════════════════════════════════════════════
-- 2026-08-09_recovered_rate_functions.sql
-- 🛑 ไฟล์นี้คือ "สำเนาย้อนหลัง" ไม่ใช่การเปลี่ยนระบบ — ห้ามรันกับฐานข้อมูลจริงโดยไม่จำเป็น
--
-- งาน P7-01 — สร้าง STAGING แล้วเทียบจำนวนฟังก์ชันกับ production พบว่า production มี 37 ตัว
-- แต่ STAGING (สร้างจาก 17 ไฟล์ตามแผน) ได้แค่ 33 ตัว — ค้นแล้วพบว่ามี 4 ฟังก์ชันที่มีอยู่จริงใน
-- production แต่ **ไม่เคยมีไฟล์ต้นฉบับใน repo เลย** (เหมือนปัญหาเดียวกับ 11 ฟังก์ชันที่กู้ไว้ก่อนหน้านี้
-- ใน `schema/2026-08-07_04_functions_recovered.sql` แต่ตอนนั้นตรวจไม่ครบ ตกหล่น 4 ตัวนี้ไป)
--
-- ที่มา: `select pg_get_functiondef(oid) from pg_proc ...` (อ่านอย่างเดียว) รันบน production จริง
--        โดย Lin เอง 2026-08-09 ระหว่างตรวจสอบ STAGING
--
-- ⚠️ โค้ดในไฟล์นี้ = ของจริงใน production ณ วันนั้น ไม่ได้แก้ไขอะไรเลย
--
-- ทั้ง 4 ตัวเป็นยามเฝ้าประตู (rate limit) ที่เรียกใช้ `game_content_rl_check` (สร้างไว้ใน
-- `sql/2026-08-02_game_content_schema.sql`) เป็นตัวนับกลาง — คนละชุดกับ `slink_rl_check`/`rl_check`
--
-- ใช้ตอนไหน:
--   ✅ สร้างฐานข้อมูลใหม่จากศูนย์ (staging / กู้คืน) — รันหลัง sql/2026-08-02_game_content_schema.sql
--   ✅ อ่านเทียบว่าของจริงเปลี่ยนไปจาก 2026-08-09 หรือยัง
--   ❌ ห้ามรันกับ production ที่ใช้งานอยู่ (เขียนทับของจริงด้วยของ ณ วันนั้น — เขียนทับตัวเองไม่มีผลเสีย
--      แต่ไม่มีเหตุผลต้องรันซ้ำ)
--
-- รันซ้ำได้ปลอดภัย (create or replace ล้วน ไม่มี insert/delete/drop)
-- ════════════════════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════════════
-- anon_game_events_rate_ok — ยามเฝ้าประตูของ anon_game_events (คนไม่ล็อกอิน)
-- ════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.anon_game_events_rate_ok(p_anon_id text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if p_anon_id is null or length(trim(p_anon_id)) = 0 then
    return false;
  end if;
  return public.game_content_rl_check('anon_ev:' || p_anon_id, 30, 600);
end;
$function$;


-- ════════════════════════════════════════════════════════════════
-- leads_rate_ok — ยามเฝ้าประตูของฟอร์มฝากอีเมล (leads) — เช็ค 2 ชั้น: ต่ออีเมล + รวมทุกคน
-- ════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.leads_rate_ok(p_email text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_email_ok  boolean;
  v_global_ok boolean;
begin
  if p_email is null or length(trim(p_email)) = 0 then
    return false;
  end if;
  v_email_ok  := public.game_content_rl_check('leads_email:' || lower(p_email), 3, 86400);
  v_global_ok := public.game_content_rl_check('leads_global', 50, 600);
  return v_email_ok and v_global_ok;
end;
$function$;


-- ════════════════════════════════════════════════════════════════
-- reading_sessions_rate_ok — ยามเฝ้าประตูของการบันทึกผลเกมอ่าน
-- ════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.reading_sessions_rate_ok(p_user uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if p_user is null then return false; end if;
  return public.game_content_rl_check('reading_sess:' || p_user::text, 30, 600);
end;
$function$;


-- ════════════════════════════════════════════════════════════════
-- tone_sessions_rate_ok — ยามเฝ้าประตูของการบันทึกผลเกมเสียง
-- ════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.tone_sessions_rate_ok(p_user uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if p_user is null then return false; end if;
  return public.game_content_rl_check('tone_sess:' || p_user::text, 30, 600);
end;
$function$;


-- ════════════════════════════════════════════════════════════════════════════
-- [B] ตรวจว่าสำเร็จจริง — รันหลัง [A] เสมอ
-- ✅ ต้องได้ 4 แถว, มีกี่เวอร์ชัน = 1 ทุกตัว, security_definer = true ทุกตัว
-- ════════════════════════════════════════════════════════════════════════════
select p.proname                                 as ฟังก์ชัน,
       count(*) over (partition by p.proname)    as มีกี่เวอร์ชัน,
       pg_get_function_identity_arguments(p.oid) as ช่องรับค่า,
       p.prosecdef                               as security_definer
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('anon_game_events_rate_ok', 'leads_rate_ok', 'reading_sessions_rate_ok', 'tone_sessions_rate_ok')
order by p.proname;
