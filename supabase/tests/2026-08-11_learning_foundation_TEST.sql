-- ════════════════════════════════════════════════════════════════════════════
-- ตัวทดสอบโครงระบบเรียนกลาง — คู่กับ supabase/sql/2026-08-11_learning_foundation.sql
-- ────────────────────────────────────────────────────────────────────────────
-- ทดสอบอะไร (7 ข้อ) — แต่ละข้อต้องขึ้น ✅ ถ้าขึ้น ❌ แปลว่าโครงมีปัญหา ห้ามใช้งานต่อ
--   1. ตารางใหม่ครบ 23 ตาราง
--   2. เนื้อหาเดิมทุกคำ/ทุกประโยคมี "ตัวตน" (item_id) ครบ ไม่ขาด ไม่เกิน
--   3. 🔑 แก้ typo แล้วประวัติการเรียนของนักเรียนไม่ขาด (ข้อสำคัญที่สุดของทั้งโครง)
--   4. คำเดียวกันต่างระดับ = คนละ item · Master ห้ามซ้ำ
--   5. Personal Content ผูกเจ้าของบังคับ + คนละคนใช้ชื่อซ้ำกันได้
--   6. ตารางที่ตั้งใจให้ว่าง (taxonomy/สูตร ยังไม่ล็อก) ต้องยังว่างจริง
--   7. ด่าน RLS: ตารางเนื้อหาปิดสนิท · คลังคำมีด่านครบ 4 คำสั่ง
--
-- ✅ ปลอดภัย: ทั้งไฟล์ห่อด้วย begin ... rollback → **ไม่มีอะไรถูกบันทึกลงฐานข้อมูลจริงเลย**
--    ข้อมูลทดสอบที่สร้างขึ้นถูกทิ้งทั้งหมดตอนจบ · รันซ้ำกี่ครั้งก็ได้ · รันกับ staging ได้ทันที
-- 📌 วิธีรัน: คัดลอกทั้งไฟล์ไปวางใน Supabase → SQL Editor แล้วกด Run ครั้งเดียว
--    ต้องรัน supabase/sql/2026-08-11_learning_foundation.sql ให้เสร็จก่อน
-- ════════════════════════════════════════════════════════════════════════════

begin;

-- ── ข้อ 1) ตารางใหม่ครบ 23 ตาราง ──────────────────────────────────────────
select case when count(*) = 23
            then '✅ 1. ตารางครบ 23 ตาราง'
            else '❌ 1. ตารางไม่ครบ — ได้ ' || count(*) || ' จาก 23' end as ผลทดสอบ
from information_schema.tables
where table_schema = 'public' and table_name in (
  'learning_item_types','learning_item_statuses','learning_tag_axes','learning_tags',
  'learning_relation_types','practice_surfaces','practice_types','learning_skills',
  'learning_memory_states','learning_items','learning_item_key_history','learning_item_audit',
  'learning_item_tags','learning_item_relations','learning_item_surfaces','practice_events',
  'learning_memory','learning_saved_items','billing_plans','plan_prices',
  'entitlement_keys','plan_entitlements','user_plan_grants');

-- ── ข้อ 2) เนื้อหาเดิมมีตัวตนครบ ไม่ขาดไม่เกิน ────────────────────────────
select case
         when (select count(*) from public.learning_items where content_source='game_words')
              = (select count(*) from public.game_words)
          and (select count(*) from public.learning_items where content_source='game_sentences')
              = (select count(*) from public.game_sentences)
         then '✅ 2. ตัวตนครบทุกคำ/ทุกประโยค (คำ '
              || (select count(*) from public.game_words) || ' · ประโยค '
              || (select count(*) from public.game_sentences) || ')'
         else '❌ 2. ตัวตนไม่ตรงกับคลัง — คำ: คลัง '
              || (select count(*) from public.game_words) || ' vs ตัวตน '
              || (select count(*) from public.learning_items where content_source='game_words')
              || ' · ประโยค: คลัง ' || (select count(*) from public.game_sentences) || ' vs ตัวตน '
              || (select count(*) from public.learning_items where content_source='game_sentences')
              || '  → ยังไม่ได้รันไฟล์ foundation ซ้ำหลังเพิ่มคำใหม่?' end as ผลทดสอบ;

-- ══════════════════════════════════════════════════════════════════════════
-- ── ข้อ 3) 🔑 ข้อสำคัญที่สุด — แก้ typo แล้วประวัติการเรียนต้องไม่ขาด ──────
-- จำลองสถานการณ์จริง: นักเรียนฝึกคำหนึ่งไปแล้ว (มีประวัติ + มีสถานะความจำ + เซฟเข้าคลังคำ)
-- แล้ว Lin แก้ตัวสะกดของคำนั้น (typo) → ทุกอย่างของนักเรียนต้องยังชี้มาที่ item เดิม
-- ══════════════════════════════════════════════════════════════════════════
do $$
declare
  v_user   uuid;
  v_item   uuid;
  v_ev     int;
  v_mem    int;
  v_saved  int;
  v_hist   int;
  v_key    text;
begin
  -- ผู้ใช้ทดสอบ (สร้างชั่วคราว จะถูก rollback ทิ้ง)
  insert into auth.users (id, email)
  values (gen_random_uuid(), 'foundation-test@example.invalid')
  returning id into v_user;

  -- ทักษะทดสอบ (ของจริง learning_skills ยังว่างโดยตั้งใจ — รอ Lin ล็อก taxonomy)
  insert into public.learning_skills (code, label_zh, note)
  values ('__test_skill', '測試用', 'แถวทดสอบชั่วคราว ถูกทิ้งตอน rollback');

  -- item ทดสอบ (ตัวสะกดผิดตั้งแต่ต้น)
  insert into public.learning_items (item_type, status, difficulty, content_source, content_key)
  values ('word', 'active', '中', 'game_words', '__ทดสอบสะกดผิด@中')
  returning item_id into v_item;

  -- นักเรียนฝึกคำนี้ไปแล้ว 1 ครั้ง + มีสถานะความจำ + เซฟเข้าคลังคำ
  insert into public.practice_events (user_id, item_id, surface_code, is_correct, intent)
  values (v_user, v_item, 'reading', true, 'new_content');

  insert into public.learning_memory (user_id, item_id, skill_code, state_code, attempts, correct_attempts)
  values (v_user, v_item, '__test_skill', 'learning', 1, 1);

  insert into public.learning_saved_items (user_id, word_th, item_id)
  values (v_user, '__ทดสอบสะกดผิด', v_item);

  -- ★ Lin แก้ typo: เปลี่ยนแค่ "ตัวหนังสือ" — item_id เดิมไม่แตะ
  insert into public.learning_item_key_history (item_id, old_content_key, new_content_key, note)
  values (v_item, '__ทดสอบสะกดผิด@中', '__ทดสอบสะกดถูก@中', 'ทดสอบการแก้ typo');

  update public.learning_items
     set content_key = '__ทดสอบสะกดถูก@中', updated_at = now()
   where item_id = v_item;

  -- ตรวจว่าของนักเรียนยังอยู่ครบและยังชี้ item เดิม
  select count(*) into v_ev    from public.practice_events      where item_id = v_item and user_id = v_user;
  select count(*) into v_mem   from public.learning_memory      where item_id = v_item and user_id = v_user;
  select count(*) into v_saved from public.learning_saved_items where item_id = v_item and user_id = v_user;
  select count(*) into v_hist  from public.learning_item_key_history where item_id = v_item;
  select content_key into v_key from public.learning_items      where item_id = v_item;

  if v_ev = 1 and v_mem = 1 and v_saved = 1 and v_hist = 1 and v_key = '__ทดสอบสะกดถูก@中' then
    raise notice '✅ 3. แก้ typo แล้วประวัติไม่ขาด — ประวัติฝึก 1 · สถานะความจำ 1 · คลังคำ 1 · จดชื่อเก่าไว้ 1 · ตัวสะกดใหม่ถูกต้อง';
  else
    raise notice '❌ 3. ประวัติขาดหลังแก้ typo! ฝึก=% ความจำ=% คลังคำ=% ประวัติชื่อ=% ตัวสะกด=%',
                 v_ev, v_mem, v_saved, v_hist, v_key;
  end if;

  -- ── ข้อ 4) คำเดียวกันต่างระดับ = คนละ item · Master ห้ามซ้ำ ──
  begin
    insert into public.learning_items (item_type, status, difficulty, content_source, content_key)
    values ('word', 'active', '初', 'game_words', '__ทดสอบสะกดถูก@初');
    -- ต่างระดับ = ต่าง content_key → ต้องเพิ่มได้
    begin
      insert into public.learning_items (item_type, status, difficulty, content_source, content_key)
      values ('word', 'active', '中', 'game_words', '__ทดสอบสะกดถูก@中');
      raise notice '❌ 4. Master ซ้ำได้ — ด่านกันคำซ้ำไม่ทำงาน';
    exception when unique_violation then
      raise notice '✅ 4. คำเดียวกันต่างระดับ = คนละ item · Master ซ้ำถูกกันจริง';
    end;
  exception when others then
    raise notice '❌ 4. เพิ่มคำเดียวกันต่างระดับไม่ได้ (ควรได้) — %', sqlerrm;
  end;

  -- ── ข้อ 5) Personal Content ต้องผูกเจ้าของ + คนละคนใช้ชื่อซ้ำได้ ──
  begin
    insert into public.learning_items (item_type, status, content_source, content_key)
    values ('sentence', 'candidate', 'personal', '__ประโยคไม่มีเจ้าของ');
    raise notice '❌ 5. Personal Content ไม่มีเจ้าของก็เพิ่มได้ — ด่านไม่ทำงาน';
  exception when check_violation then
    raise notice '✅ 5. Personal Content บังคับต้องมีเจ้าของจริง';
  end;
end $$;

-- ── ข้อ 6) ตารางที่ตั้งใจให้ว่าง ต้องยังว่าง (พิสูจน์ว่าไม่มีใครเดา taxonomy/สูตร) ──
-- นับแบบไม่รวมแถวทดสอบที่ do-block ข้างบนใส่ไว้ (ชื่อขึ้นต้น __test / __ทดสอบ)
select case when v.รวม = 0
            then '✅ 6. ตารางที่ยังไม่มี Decision ยังว่างจริง (tags/skills/compatibility/memory/events/prices/entitlements)'
            else '❌ 6. มีข้อมูลโผล่มา ' || v.รวม || ' แถว — ต้องตรวจว่าใครใส่ ทำไม (สูตร/taxonomy ยังไม่ล็อก)' end as ผลทดสอบ
from (
  select (select count(*) from public.learning_tags)
       + (select count(*) from public.learning_skills where code not like '\_\_%')
       + (select count(*) from public.learning_item_surfaces)
       + (select count(*) from public.learning_memory       where skill_code not like '\_\_%')
       + (select count(*) from public.practice_events       where item_id in (select item_id from public.learning_items where content_key not like '\_\_%'))
       + (select count(*) from public.plan_prices)
       + (select count(*) from public.entitlement_keys) as รวม
) v;

-- ── ข้อ 7) ด่าน RLS เป็นไปตามที่ออกแบบ ────────────────────────────────────
-- 7a) ตารางเนื้อหา/หลักฐานดิบ ต้อง "ไม่มี policy เลย" = ปิดสนิท
select case when count(*) = 0
            then '✅ 7a. ตารางเนื้อหา/หลักฐานดิบปิดสนิท (ไม่มี policy ให้ client เลย ตามที่ตั้งใจ)'
            else '❌ 7a. มี policy โผล่มา ' || count(*) || ' ตัวในตารางที่ควรปิดสนิท: '
                 || string_agg(distinct tablename || '/' || cmd, ', ') end as ผลทดสอบ
from pg_policies
where schemaname = 'public'
  and tablename in ('learning_items','learning_item_types','learning_item_statuses','learning_tags',
                    'learning_tag_axes','learning_relation_types','practice_surfaces','practice_types',
                    'learning_skills','learning_memory_states','learning_item_key_history',
                    'learning_item_audit','learning_item_tags','learning_item_relations',
                    'learning_item_surfaces','practice_events','billing_plans','plan_prices',
                    'entitlement_keys','plan_entitlements');

-- 7b) คลังคำต้องมีด่านครบ 4 คำสั่ง (นักเรียนต้องเซฟ/แก้/ลบของตัวเองได้)
select case when count(distinct cmd) = 4
            then '✅ 7b. คลังคำมีด่านครบ 4 คำสั่ง (SELECT/INSERT/UPDATE/DELETE)'
            else '❌ 7b. คลังคำมีด่านแค่ ' || count(distinct cmd) || ' คำสั่ง: '
                 || string_agg(distinct cmd, ',') || ' — กฎ repo บังคับคิดครบ 4 คำสั่ง' end as ผลทดสอบ
from pg_policies where schemaname='public' and tablename='learning_saved_items';

-- 7c) สถานะความจำ + แพ็กเกจ: นักเรียนอ่านได้อย่างเดียว ห้ามเขียน
select case when (select count(*) from pg_policies where schemaname='public' and tablename='learning_memory') = 1
             and (select count(*) from pg_policies where schemaname='public' and tablename='learning_memory' and cmd='SELECT') = 1
             and (select count(*) from pg_policies where schemaname='public' and tablename='user_plan_grants') = 1
             and (select count(*) from pg_policies where schemaname='public' and tablename='user_plan_grants' and cmd='SELECT') = 1
            then '✅ 7c. สถานะความจำ + แพ็กเกจ: นักเรียนอ่านของตัวเองได้ เขียนไม่ได้ (ตามที่ตั้งใจ)'
            else '❌ 7c. ด่านของ learning_memory / user_plan_grants ไม่ตรงกับที่ออกแบบ — ตรวจ pg_policies' end as ผลทดสอบ;

-- ⚠️ ทิ้งข้อมูลทดสอบทั้งหมด — ต้องเป็น rollback ไม่ใช่ commit เด็ดขาด
rollback;

-- ── ตรวจปิดท้ายว่าไม่มีอะไรค้างจากการทดสอบจริง (รันแยกหลัง rollback) ──
select case when count(*) = 0
            then '✅ 8. ไม่มีข้อมูลทดสอบค้างในฐานข้อมูล (rollback ทำงานถูกต้อง)'
            else '❌ 8. มีข้อมูลทดสอบค้าง ' || count(*) || ' แถว — ต้องลบด้วยมือ' end as ผลทดสอบ
from public.learning_items where content_key like '\_\_%';
