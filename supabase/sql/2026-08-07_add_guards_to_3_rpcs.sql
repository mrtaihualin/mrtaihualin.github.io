-- ════════════════════════════════════════════════════════════════════════════
-- 2026-08-07 — ใส่ "ยามเฝ้าประตู" ให้ RPC 3 ตัวที่ตกสำรวจ (งาน P2 รอบเก็บตก)
-- ────────────────────────────────────────────────────────────────────────────
-- ปัญหาที่แก้ (พบตอนตรวจ P2 · หลักฐาน: Bussiness Idea/ระบบเว็บไซต์/20_ผลตรวจ_P2_database_rls.md)
--   RPC ฝั่งนักเรียน 7 ตัวมียามเฝ้าประตูครบมาตั้งแต่ 2026-07-26 (slink_rl_check 20 ครั้ง/60 วิ ต่อ IP)
--   แต่มี 3 ตัวที่ "ตกสำรวจ" ไม่เคยได้ยาม ทั้งที่เป็น SECURITY DEFINER (ข้าม RLS ทั้งหมด)
--   และคนไม่ล็อกอิน (anon) เรียกได้:
--
--     · submit_payment_slip       → ยิงสร้างรายการจ่ายเงินได้ไม่จำกัด
--     · delete_student_recording  → ไล่เดา token/url เพื่อลบลิงก์เอกสารได้ไม่จำกัดครั้ง
--     · get_game_link_status      → ไล่เดา token เพื่อดู "อีเมล" ของผู้เรียนได้ไม่จำกัดครั้ง
--
-- สิ่งที่ไฟล์นี้ทำ: เอา "ยามตัวเดิมที่มีอยู่แล้วในระบบ" ไปใส่ให้ 3 ตัวนี้ ไม่สร้างของใหม่
--   1. slink_rl_check(ชื่อฟังก์ชัน, 20, 60)  → ยิงเกิน 20 ครั้ง/60 วิ ต่อ IP = ตีกลับ
--   2. slink_log_fail(ชื่อฟังก์ชัน, token)   → ถ้า token ไม่มีอยู่จริง จดไว้ดูว่าใครไล่เดา
--
-- ⚠️ เพดาน 20/60 ตั้งให้ "เท่ากับของเดิมทุกตัว" โดยตั้งใจ — ไม่ได้เลือกตัวเลขใหม่
--    เพราะรูปแบบนี้ใช้จริงมาตั้งแต่ 2026-07-26 ไม่เคยมีปัญหา (พิสูจน์แล้ว)
--    ปรับให้เข้มกว่านี้ทีหลังได้ แต่ควรทำหลังยืนยันว่ารอบนี้ไม่พังก่อน
--
-- ════════════════════════════════════════════════════════════════════════════
-- 🔒 ความปลอดภัยของไฟล์นี้ — ทำไมถึงไม่ควรพัง
-- ════════════════════════════════════════════════════════════════════════════
--
--  (1) ช่องรับค่าเหมือนเดิมเป๊ะทั้ง 3 ตัว → `create or replace` เขียนทับตัวเดิมได้
--      **ไม่เกิดฟังก์ชันซ้อนกัน** แบบที่เคยทำเว็บล่มทั้งระบบเมื่อ 2026-07-30
--        submit_payment_slip      : 11 ช่อง (เหมือนเดิม)
--        delete_student_recording : 2 ช่อง (เหมือนเดิม)
--        get_game_link_status     : 1 ช่อง (เหมือนเดิม)
--      → ไฟล์นี้ **ไม่มีคำสั่ง `drop function` เลย** และไม่ต้องมี
--
--  (2) ค่าที่คืนกลับ (return type) เหมือนเดิมเป๊ะ → เว็บที่เรียกอยู่ไม่ต้องแก้อะไร
--        submit_payment_slip      : void
--        delete_student_recording : void
--        get_game_link_status     : table(linked boolean, email text)
--
--  (3) พฤติกรรมสำหรับ "คนใช้งานปกติ" ไม่เปลี่ยนเลย
--      · token ที่ไม่มีอยู่จริง → แค่ "จดบันทึก" ไม่ได้บล็อก (ท่าเดียวกับ RPC อีก 7 ตัว)
--      · 20 ครั้ง/60 วิ สูงกว่าการใช้จริงมาก:
--          - นักเรียนส่งสลิป = กดครั้งเดียว และปุ่มถูกปิดระหว่างส่ง (pay.html:588)
--          - ครูลบลิงก์เอกสาร = กดทีละอัน มีกล่องยืนยันคั่นทุกครั้ง (student-materials.js:87)
--          - get_game_link_status = **ไม่มีโค้ดไหนในเว็บเรียกเลย** (ค้นทั้ง repo แล้ว 0 จุด)
--
--  (4) ตรวจแล้วว่า **ไม่มี Edge Function ตัวไหนเรียก 3 ตัวนี้** (ค้น supabase/functions/ แล้ว 0 จุด)
--      จึงไม่มีปัญหา "ทุกคำขอมาจาก IP เดียวกันแล้วเผาโควตารวมกัน"
--
--  (5) ไม่มีจุดไหนในเว็บเรียกแบบวนลูป — ตรวจแล้วทุกจุดเป็นการกดปุ่มทีละครั้ง
--      submit_payment_slip      : js/classroom/teacher-request-admin.js:280 · classroom/pay.html:590
--      delete_student_recording : js/classroom/student-materials.js:91
--
--  (6) ถ้าพังจริง กู้กลับได้ทันที — โค้ดเดิมทุกตัวอักษรอยู่ที่
--      `supabase/schema/2026-08-07_04_functions_recovered.sql` (คัดลอกจากของจริง 2026-08-07)
--      ดูหัวข้อ [C] ท้ายไฟล์นี้
--
--  (7) รันซ้ำได้ปลอดภัย (idempotent) — `create or replace` ล้วน ไม่มี insert/delete/drop
--
-- ════════════════════════════════════════════════════════════════════════════
-- วิธีรัน: เปิด Supabase → SQL Editor → คัดลอก **หัวข้อ [A] ทั้งก้อน** ไปวาง แล้วกด Run
--         จากนั้นรัน [B] เพื่อตรวจว่าสำเร็จจริง
--         ⚠️ ห้ามรัน [C] เว้นแต่ต้องการย้อนกลับ
-- ════════════════════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════════════════════════
-- [A] ใส่ยามเฝ้าประตู  ← รันก้อนนี้
-- ════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────
-- A1. submit_payment_slip — รับสลิปโอนเงินจากนักเรียน
--     เปลี่ยนจาก language sql → plpgsql (จำเป็น เพราะต้องมีเงื่อนไข if)
--     คำสั่ง insert ข้างในเหมือนเดิมทุกตัวอักษร
-- ─────────────────────────────────────────────────────────────────
create or replace function public.submit_payment_slip(
  p_token         text,
  p_student_name  text,
  p_course_id     text,
  p_course_label  text,
  p_lessons       integer,
  p_bonus_lessons integer,
  p_price_per     numeric,
  p_currency      text,
  p_total_amount  numeric,
  p_note          text,
  p_slip_data     text
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  -- ── ยามเฝ้าประตู (เพิ่ม 2026-08-07) ── ยิงเกิน 20 ครั้ง/60 วิ ต่อ IP = บล็อก
  if not public.slink_rl_check('submit_payment_slip', 20, 60) then
    raise exception 'too many requests' using errcode = 'P0001';
  end if;
  -- token ไม่มีอยู่จริง = จดไว้ดูว่าใครไล่เดา (ยังไม่บล็อก — ท่าเดียวกับ RPC อีก 7 ตัว)
  if not exists (select 1 from public.classroom_students where token = p_token) then
    perform public.slink_log_fail('submit_payment_slip', p_token);
  end if;

  -- ↓↓↓ ของเดิม ไม่แก้อะไรเลย ↓↓↓
  insert into classroom_payments
    (token, student_name, course_id, course_label, lessons, bonus_lessons,
     price_per, currency, total_amount, note, slip_data, submitted_by, submitted_at, status)
  values
    (p_token, p_student_name, p_course_id, p_course_label, p_lessons, p_bonus_lessons,
     p_price_per, p_currency, p_total_amount, p_note, p_slip_data, 'student', now(), 'slip_submitted');
end;
$function$;


-- ─────────────────────────────────────────────────────────────────
-- A2. delete_student_recording — ลบลิงก์เอกสาร/วิดีโอของนักเรียน
-- ─────────────────────────────────────────────────────────────────
create or replace function public.delete_student_recording(
  p_token text,
  p_url   text
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  -- ── ยามเฝ้าประตู (เพิ่ม 2026-08-07) ──
  if not public.slink_rl_check('delete_student_recording', 20, 60) then
    raise exception 'too many requests' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.classroom_students where token = p_token) then
    perform public.slink_log_fail('delete_student_recording', p_token);
  end if;

  -- ↓↓↓ ของเดิม ไม่แก้อะไรเลย ↓↓↓
  delete from classroom_recordings
  where token = p_token and url = p_url;
end;
$function$;


-- ─────────────────────────────────────────────────────────────────
-- A3. get_game_link_status — เช็คว่า token ผูกบัญชีเกมไหน (คืนอีเมล)
--     ⚠️ ตัวนี้ **ไม่มีโค้ดไหนในเว็บเรียกเลย** (ค้นทั้ง repo 2026-08-07 = 0 จุด)
--     แต่ยังมีอยู่ในฐานข้อมูลและ anon เรียกได้ จึงต้องใส่ยามไว้ก่อน
--     (ถ้าภายหลังยืนยันว่าไม่ใช้จริงแน่นอน ค่อยพิจารณาลบทิ้งเป็นงานแยก)
-- ─────────────────────────────────────────────────────────────────
create or replace function public.get_game_link_status(p_token text)
returns table(linked boolean, email text)
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  -- ── ยามเฝ้าประตู (เพิ่ม 2026-08-07) ──
  if not public.slink_rl_check('get_game_link_status', 20, 60) then
    raise exception 'too many requests' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.classroom_students where token = p_token) then
    perform public.slink_log_fail('get_game_link_status', p_token);
  end if;

  -- ↓↓↓ ของเดิม ไม่แก้อะไรเลย ↓↓↓
  return query
  select true, u.email::text
  from classroom_game_links l
  join auth.users u on u.id = l.user_id
  where l.token = p_token;
end;
$function$;


-- ════════════════════════════════════════════════════════════════════════════
-- [B] ตรวจว่าสำเร็จจริง  ← รันหลัง [A] เสมอ ห้ามข้าม
-- ════════════════════════════════════════════════════════════════════════════
--
-- ✅ ต้องได้ **3 แถวเท่านั้น** และทุกช่องที่ขึ้นต้นด้วย "ต้อง" ต้องเป็น true
-- 🔴 ถ้าได้ 4 แถวขึ้นไป = มีฟังก์ชันซ้อนกัน ต้องหยุดและแจ้งทันที (เว็บจะพัง)

select p.proname                                        as ฟังก์ชัน,
       count(*) over (partition by p.proname)           as มีกี่เวอร์ชัน,
       pg_get_function_identity_arguments(p.oid)        as ช่องรับค่า,
       (pg_get_functiondef(p.oid) like '%slink_rl_check%')  as ต้องมียามเฝ้าประตู,
       (pg_get_functiondef(p.oid) like '%slink_log_fail%')  as ต้องมีการจดบันทึก,
       p.prosecdef                                      as ต้องเป็น_security_definer
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('submit_payment_slip','delete_student_recording','get_game_link_status')
order by p.proname;

-- และตรวจซ้ำว่าทั้งฐานข้อมูลไม่มีฟังก์ชันชื่อซ้ำกันเลย (ต้องได้ 0 แถว)
select p.proname, count(*)
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname in ('public','private')
group by p.proname
having count(*) > 1;


-- ════════════════════════════════════════════════════════════════════════════
-- [C] 🛑 ย้อนกลับ — รันเฉพาะตอนที่ [A] ทำให้อะไรพังเท่านั้น
-- ════════════════════════════════════════════════════════════════════════════
--
-- คัดลอกโค้ดเดิมทั้ง 3 ตัวจากไฟล์ `supabase/schema/2026-08-07_04_functions_recovered.sql`
-- (เก็บของจริง ณ 2026-08-07 ก่อนแก้ ไว้ครบทุกตัวอักษร) มาวางแล้วรัน
-- ช่องรับค่าเท่ากันทุกตัว จึงเขียนทับกลับได้ทันที ไม่ต้อง drop และไม่เกิดฟังก์ชันซ้อน
--
-- อาการที่แปลว่าต้องย้อนกลับ:
--   · นักเรียนกดส่งสลิปแล้วขึ้น "送出失敗" ทุกครั้ง
--   · ครูกดลบลิงก์เอกสารแล้วขึ้น "❌ 移除失敗" ทุกครั้ง
--   · ขึ้นข้อความ "too many requests" ทั้งที่กดครั้งแรก
--
-- ⚠️ ถ้าขึ้น "too many requests" เพราะทดสอบยิงรัวๆ เอง = **ไม่ต้องย้อนกลับ**
--    รอ 60 วินาทีแล้วลองใหม่ ยามจะปล่อยเอง (นับเป็นช่วงละ 60 วิ)
