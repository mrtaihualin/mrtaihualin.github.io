-- 🛑 ไฟล์นี้คือ "สำเนาย้อนหลัง" ไม่ใช่การเปลี่ยนระบบ — ห้ามรันกับฐานข้อมูลจริงโดยไม่จำเป็น
--
-- 2026-08-07 · งาน P2-01/P2-03 — ฟังก์ชัน 11 ตัวที่มีอยู่จริงใน production
-- แต่ค้นทั้ง repo แล้ว **ไม่พบไฟล์ต้นฉบับเลย** จึงดึงโค้ดจริงออกมาเก็บไว้
--
-- ที่มา: `select pg_get_functiondef(oid) from pg_proc ...` (อ่านอย่างเดียว)
--        Lin รันใน Supabase SQL Editor เอง 2026-08-07
--
-- ⚠️ โค้ดในไฟล์นี้ = ของจริง ณ วันนั้น **ไม่ได้แก้ไขอะไรเลย** แม้จะเห็นจุดที่ควรปรับ
--    (จุดที่ควรปรับเขียนเป็นคอมเมนต์ 🔴/⚠️ กำกับไว้เหนือแต่ละตัว — ยังไม่แก้ ต้องให้ Lin ตัดสินใจก่อน)
--
-- ใช้ตอนไหน:
--   ✅ สร้างฐานข้อมูลใหม่จากศูนย์ (staging / กู้คืน) — รันหลังไฟล์ 01/02/03
--   ✅ อ่านเทียบว่าของจริงเปลี่ยนไปจาก 2026-08-07 หรือยัง
--   ❌ ห้ามรันกับ production ที่ใช้งานอยู่ (จะเขียนทับของจริงด้วยของ ณ วันนั้น)
--
-- 📌 ฟังก์ชันอีก 21 ตัวที่เหลือมีไฟล์ต้นฉบับอยู่แล้ว และเทียบตัวอักษรแล้วว่าตรงกับ production 100%
--    ดูว่าตัวไหนอยู่ไฟล์ไหนที่ `supabase/sql/00_ฟังก์ชันไหนอยู่ไฟล์ไหน.md`
--
-- ════════════════════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════════════
-- submit_payment_slip
-- ทำอะไร: รับสลิปโอนเงินจากนักเรียน → เขียนแถวใหม่ลง classroom_payments
-- ข้อสังเกตตอนตรวจ 2026-08-07: 🔴 ไม่มียามเฝ้าประตูเลย (ไม่มี rate limit · ไม่เช็คว่า token มีอยู่จริง) ต่างจาก RPC นักเรียนตัวอื่นที่มีครบ
-- ════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.submit_payment_slip(p_token text, p_student_name text, p_course_id text, p_course_label text, p_lessons integer, p_bonus_lessons integer, p_price_per numeric, p_currency text, p_total_amount numeric, p_note text, p_slip_data text)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  insert into classroom_payments
    (token, student_name, course_id, course_label, lessons, bonus_lessons,
     price_per, currency, total_amount, note, slip_data, submitted_by, submitted_at, status)
  values
    (p_token, p_student_name, p_course_id, p_course_label, p_lessons, p_bonus_lessons,
     p_price_per, p_currency, p_total_amount, p_note, p_slip_data, 'student', now(), 'slip_submitted'); $function$;


-- ════════════════════════════════════════════════════════════════
-- delete_student_recording
-- ทำอะไร: นักเรียนลบวิดีโอบันทึกคาบเรียนของตัวเอง
-- ข้อสังเกตตอนตรวจ 2026-08-07: 🔴 ไม่มียามเฝ้าประตูเลย · ต้องรู้ทั้ง token และ url ถึงลบได้ แต่ยิงไล่เดาได้ไม่จำกัดจำนวนครั้ง
-- ════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.delete_student_recording(p_token text, p_url text)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  delete from classroom_recordings
  where token = p_token and url = p_url;
$function$;


-- ════════════════════════════════════════════════════════════════
-- get_game_link_status
-- ทำอะไร: เช็คว่า token นี้ผูกกับบัญชีเกมไหนอยู่ → คืน "อีเมล" ของบัญชีนั้น
-- ข้อสังเกตตอนตรวจ 2026-08-07: 🔴 ไม่มียามเฝ้าประตู และคืนค่าอีเมลซึ่งเป็นข้อมูลส่วนตัว
-- ════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_game_link_status(p_token text)
 RETURNS TABLE(linked boolean, email text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  return query
  select true, u.email::text
  from classroom_game_links l
  join auth.users u on u.id = l.user_id
  where l.token = p_token;
end;
$function$;


-- ════════════════════════════════════════════════════════════════
-- link_game_account
-- ทำอะไร: ผูกบัญชีเกมที่ล็อกอินอยู่เข้ากับ token นักเรียน
-- ข้อสังเกตตอนตรวจ 2026-08-07: ✅ มีด่าน: ต้องล็อกอินก่อน (auth.uid() ไม่ว่าง) + token ต้องมีอยู่จริง
-- ════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.link_game_account(p_token text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is null then
    raise exception 'ต้องล็อกอินก่อนถึงจะเชื่อมบัญชีได้';
  end if;
  if not exists (select 1 from classroom_students where token = p_token) then
    raise exception 'ไม่พบนักเรียนตาม token นี้';
  end if;
  insert into classroom_game_links (token, user_id)
  values (p_token, auth.uid())
  on conflict (token) do update set user_id = excluded.user_id, linked_at = now();
end;
$function$;


-- ════════════════════════════════════════════════════════════════
-- unlink_game_account
-- ทำอะไร: ถอดการผูกบัญชีเกม
-- ข้อสังเกตตอนตรวจ 2026-08-07: ✅ มีด่าน: ต้องล็อกอิน และลบได้เฉพาะแถวของตัวเอง
-- ════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.unlink_game_account(p_token text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is null then
    raise exception 'ต้องล็อกอินก่อน';
  end if;
  delete from classroom_game_links where token = p_token and user_id = auth.uid();
end;
$function$;


-- ════════════════════════════════════════════════════════════════
-- assign_receipt_no
-- ทำอะไร: ออกเลขใบเสร็จแบบเรียงลำดับต่อวัน (ล็อกกันชนด้วย advisory lock)
-- ข้อสังเกตตอนตรวจ 2026-08-07: ✅ SECURITY INVOKER → รันด้วยสิทธิ์ของคนเรียก จึงติดด่าน RLS "teacher only" ของ classroom_payments อยู่แล้ว
-- ════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.assign_receipt_no(p_payment_id uuid, p_date_part text)
 RETURNS text
 LANGUAGE plpgsql
AS $function$
declare
  v_seq int;
  v_no text;
  v_updated int;
begin
  perform pg_advisory_xact_lock(hashtext('receipt_no_' || p_date_part));
  select count(*) + 1 into v_seq from classroom_payments where receipt_no like p_date_part || '-%';
  v_no := p_date_part || '-' || lpad(v_seq::text, 2, '0');
  update classroom_payments set receipt_no = v_no where id = p_payment_id;
  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    raise exception 'ไม่พบรายการชำระเงิน id=%', p_payment_id;
  end if;
  return v_no;
end;
$function$;


-- ════════════════════════════════════════════════════════════════
-- record_attendance_increment
-- ทำอะไร: บันทึกการเข้าเรียน +1 คาบ (ซ้ำวันเดิม = บวกเพิ่มไม่สร้างแถวใหม่)
-- ข้อสังเกตตอนตรวจ 2026-08-07: ✅ SECURITY INVOKER → ติดด่าน RLS "teacher only" ของ classroom_attendance อยู่แล้ว
-- ════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.record_attendance_increment(p_token text, p_student_name text, p_lesson_date date)
 RETURNS SETOF classroom_attendance
 LANGUAGE plpgsql
AS $function$
begin
  return query
  insert into classroom_attendance (token, student_name, lesson_date, lessons)
  values (p_token, p_student_name, p_lesson_date, 1)
  on conflict (token, lesson_date)
  do update set lessons = classroom_attendance.lessons + 1
  returning classroom_attendance.*;
end;
$function$;


-- ════════════════════════════════════════════════════════════════
-- leaderboard_alltime
-- ทำอะไร: กระดานคะแนนตลอดกาล — เฉพาะเกมเสียง (tone_sessions)
-- ข้อสังเกตตอนตรวจ 2026-08-07: ⚠️ ไม่ได้กรองแอดมินออก ต่างจาก combined_leaderboard_* ที่กรอง
-- ════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.leaderboard_alltime()
 RETURNS TABLE(user_id uuid, nickname text, avatar text, badge_id text, total_score bigint, games bigint)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select s.user_id,
         coalesce(p.nickname,'(無暱稱)') as nickname,
         coalesce(p.avatar,'')   as avatar,
         coalesce(p.badge_id,'') as badge_id,
         sum(s.score)::bigint as total_score,
         count(*)::bigint     as games
  from tone_sessions s
  left join profiles p on p.user_id = s.user_id
  group by s.user_id, p.nickname, p.avatar, p.badge_id
  order by total_score desc limit 100;
$function$;


-- ════════════════════════════════════════════════════════════════
-- leaderboard_weekly
-- ทำอะไร: กระดานคะแนนรายสัปดาห์ — เฉพาะเกมเสียง
-- ข้อสังเกตตอนตรวจ 2026-08-07: ⚠️ ไม่ได้กรองแอดมินออก
-- ════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.leaderboard_weekly()
 RETURNS TABLE(user_id uuid, nickname text, avatar text, badge_id text, total_score bigint, games bigint)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select s.user_id,
         coalesce(p.nickname,'(無暱稱)') as nickname,
         coalesce(p.avatar,'')   as avatar,
         coalesce(p.badge_id,'') as badge_id,
         sum(s.score)::bigint as total_score,
         count(*)::bigint     as games
  from tone_sessions s
  left join profiles p on p.user_id = s.user_id
  where s.created_at >= date_trunc('week', now())
  group by s.user_id, p.nickname, p.avatar, p.badge_id
  order by total_score desc limit 100;
$function$;


-- ════════════════════════════════════════════════════════════════
-- reading_leaderboard_alltime
-- ทำอะไร: กระดานคะแนนตลอดกาล — เฉพาะเกมอ่าน (reading_sessions)
-- ข้อสังเกตตอนตรวจ 2026-08-07: ⚠️ ไม่ได้กรองแอดมินออก
-- ════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.reading_leaderboard_alltime()
 RETURNS TABLE(user_id uuid, nickname text, avatar text, badge_id text, total_score bigint, games bigint)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select s.user_id, p.nickname, p.avatar, p.badge_id,
         sum(s.score)::bigint, count(*)::bigint
  from reading_sessions s left join profiles p on p.user_id = s.user_id
  group by s.user_id, p.nickname, p.avatar, p.badge_id
  order by 5 desc limit 100;
$function$;


-- ════════════════════════════════════════════════════════════════
-- reading_leaderboard_weekly
-- ทำอะไร: กระดานคะแนนรายสัปดาห์ — เฉพาะเกมอ่าน · นับ 7 วันย้อนหลัง
-- ข้อสังเกตตอนตรวจ 2026-08-07: ⚠️ ไม่ได้กรองแอดมินออก · และใช้ "7 วันย้อนหลัง" ต่างจากตัวอื่นที่ใช้ "ตั้งแต่วันจันทร์" (date_trunc week)
-- ════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.reading_leaderboard_weekly()
 RETURNS TABLE(user_id uuid, nickname text, avatar text, badge_id text, total_score bigint, games bigint)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select s.user_id, p.nickname, p.avatar, p.badge_id,
         sum(s.score)::bigint, count(*)::bigint
  from reading_sessions s left join profiles p on p.user_id = s.user_id
  where s.created_at >= now() - interval '7 days'
  group by s.user_id, p.nickname, p.avatar, p.badge_id
  order by 5 desc limit 100;
$function$;

