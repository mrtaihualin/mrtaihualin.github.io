-- 🛑🛑🛑 ห้ามรันไฟล์นี้กับฐานข้อมูลจริงโดยไม่จำเป็น 🛑🛑🛑
--
-- ไฟล์นี้คือ "แบบแปลนย้อนหลัง" ของฐานข้อมูล ณ วันที่ 2026-08-07
-- สร้างโดยให้ฐานข้อมูลจริงพ่นโครงสร้างตัวเองออกมา (อ่านอย่างเดียว) แล้วจัดเป็นไฟล์
-- ที่มา: งาน P2-05 · รายงาน `Bussiness Idea/ระบบเว็บไซต์/20_ผลตรวจ_P2_database_rls.md`
--
-- ทำไมต้องมี: ตรวจแล้วพบว่า 21 จาก 37 ตาราง และ 34 จาก 41 ด่าน RLS
-- ไม่มีไฟล์ต้นฉบับใน repo เลย รวมถึง classroom_students และ classroom_payments
-- = ฐานข้อมูลหายแล้วสร้างโครงคืนไม่ได้
--
-- ใช้ตอนไหน:
--   ✅ สร้างฐานข้อมูลใหม่จากศูนย์ (staging / sandbox / กู้คืนหลังภัยพิบัติ)
--   ✅ อ่านเทียบว่าโครงสร้างปัจจุบันเปลี่ยนไปจากวันนี้หรือยัง
--   ❌ ห้ามรันกับฐานข้อมูล production ที่ใช้งานอยู่ (ไม่ได้ตั้งใจให้ใช้แบบนั้น)
--
-- ทุกคำสั่งเขียนให้รันซ้ำได้ (if not exists / ดักข้อผิดพลาดของซ้ำ) แต่ก็ยังไม่ควรรันกับของจริง
--

-- View 3 ตัว — ต้องรันหลังไฟล์ 01


-- ── approved_testimonials ──
create or replace view public.approved_testimonials as  SELECT content,
    display_name,
    created_at,
    category
   FROM classroom_feedback
  WHERE (approved = true);

-- ── v_stars_overview ──
create or replace view public.v_stars_overview as  SELECT count(*) AS accounts,
    max(stars) AS max_stars,
    sum(stars) AS total_stars,
    count(*) FILTER (WHERE (stars > 100)) AS over_100
   FROM game_accounts;

-- ── v_unexplained_stars ──
create or replace view public.v_unexplained_stars as  SELECT g.user_id,
    g.stars AS stars_now,
    COALESCE(b.stars, 0) AS baseline,
    COALESCE(l.ledgered, (0)::bigint) AS ledger_confirmed,
    ((g.stars - COALESCE(b.stars, 0)) - COALESCE(l.ledgered, (0)::bigint)) AS unexplained
   FROM ((game_accounts g
     LEFT JOIN _backup_game_accounts_20260711 b ON ((b.user_id = g.user_id)))
     LEFT JOIN ( SELECT star_ledger.user_id,
            sum(star_ledger.stars) AS ledgered
           FROM star_ledger
          GROUP BY star_ledger.user_id) l ON ((l.user_id = g.user_id)))
  WHERE (((g.stars - COALESCE(b.stars, 0)) - COALESCE(l.ledgered, (0)::bigint)) > 0);

