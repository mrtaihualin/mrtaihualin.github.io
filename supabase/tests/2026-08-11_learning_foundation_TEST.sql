-- ════════════════════════════════════════════════════════════════════════════
-- ตัวทดสอบโครงระบบเรียนกลาง — คู่กับ supabase/sql/2026-08-11_learning_foundation.sql
-- ────────────────────────────────────────────────────────────────────────────
-- ทดสอบอะไร (8 ข้อ) — แต่ละข้อต้องขึ้น ✅ ถ้าขึ้น ❌ แปลว่าโครงมีปัญหา ห้ามใช้งานต่อ
--   1. ตารางใหม่ครบ 23 ตาราง
--   2. เนื้อหาเดิมทุกคำ/ทุกประโยคมี "ตัวตน" (item_id) ครบ ไม่ขาด ไม่เกิน
--   3. 🔑 แก้ typo แล้วประวัติการเรียนของนักเรียนไม่ขาด (ข้อสำคัญที่สุดของทั้งโครง)
--   4. คำเดียวกันต่างระดับ = คนละ item · Master ห้ามซ้ำ
--   5. Personal Content ผูกเจ้าของบังคับ
--   6. ตารางที่ตั้งใจให้ว่าง (taxonomy/สูตร ยังไม่ล็อก) ต้องยังว่างจริง
--   7. ด่าน RLS: ตารางเนื้อหาปิดสนิท · คลังคำมีด่านครบ 4 คำสั่ง · ความจำ/แพ็กเกจอ่านได้อย่างเดียว
--   8. ไม่มีข้อมูลทดสอบค้างจากรอบก่อน (พิสูจน์ว่าการเก็บกวาดของรอบก่อนทำงานจริง)
--
-- ✅ ปลอดภัย: ทั้งไฟล์ห่อด้วย begin … rollback → **ไม่มีอะไรถูกบันทึกลงฐานข้อมูลจริงเลย**
--    ข้อมูลทดสอบที่สร้างขึ้นถูกทิ้งทั้งหมดตอนจบ · รันซ้ำกี่ครั้งก็ได้ · รันกับ staging/production ได้
--
-- 📌 วิธีรัน: คัดลอกทั้งไฟล์ไปวางใน Supabase → SQL Editor แล้วกด Run ครั้งเดียว
--    ต้องรัน supabase/sql/2026-08-11_learning_foundation.sql ให้เสร็จก่อน
--
-- 🔑 ทำไมเก็บผลไว้ในตารางชั่วคราวแล้วค่อย select ทีเดียวตอนท้าย (แก้ 2026-08-11):
--    Supabase SQL Editor และ `supabase db query` **คืนผลของคำสั่งสุดท้ายเท่านั้น**
--    ถ้าเขียนเป็น select แยก 8 ก้อน จะเห็นผลแค่ก้อนสุดท้ายก้อนเดียว อีก 7 ข้อหายไปเงียบๆ
--    (เจอจริงตอนรันบน staging รอบแรก) — ตอนนี้ทุกข้อมารวมเป็นตารางผลเดียว เห็นครบ 8 บรรทัด
-- ════════════════════════════════════════════════════════════════════════════

begin;

create temporary table _lf_result (ord int primary key, ผลทดสอบ text);

-- ── ข้อ 8) ไม่มีข้อมูลทดสอบค้างจากรอบก่อน (เช็คก่อนสร้างของทดสอบใหม่) ──────
-- ทำเป็นข้อแรกโดยตั้งใจ: ถ้ารอบก่อน rollback ไม่ทำงาน จะเจอขยะค้างตรงนี้ทันที
insert into _lf_result
select 10, case when count(*) = 0
                then '✅ 8. ไม่มีข้อมูลทดสอบค้างจากรอบก่อน (การเก็บกวาดทำงานถูกต้อง)'
                else '❌ 8. มีข้อมูลทดสอบค้าง ' || count(*) || ' แถว — rollback รอบก่อนไม่ทำงาน ต้องลบด้วยมือ' end
from public.learning_items where content_key like '\_\_%';

-- ── ข้อ 1) ตารางใหม่ครบ 23 ตาราง ──────────────────────────────────────────
insert into _lf_result
select 1, case when count(*) = 23
                then '✅ 1. ตารางครบ 23 ตาราง'
                else '❌ 1. ตารางไม่ครบ — ได้ ' || count(*) || ' จาก 23' end
from information_schema.tables
where table_schema = 'public' and table_name in (
  'learning_item_types','learning_item_statuses','learning_tag_axes','learning_tags',
  'learning_relation_types','practice_surfaces','practice_types','learning_skills',
  'learning_memory_states','learning_items','learning_item_key_history','learning_item_audit',
  'learning_item_tags','learning_item_relations','learning_item_surfaces','practice_events',
  'learning_memory','learning_saved_items','billing_plans','plan_prices',
  'entitlement_keys','plan_entitlements','user_plan_grants');

-- ── ข้อ 2) เนื้อหาเดิมมีตัวตนครบ ไม่ขาดไม่เกิน ────────────────────────────
insert into _lf_result
select 2, case
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
       || '  → เพิ่มคำใหม่แล้วยังไม่ได้รันหัวข้อ [K] ของไฟล์ foundation ซ้ำ?' end;

-- ══════════════════════════════════════════════════════════════════════════
-- ── ข้อ 3-5) ต้องสร้างข้อมูลทดสอบจริง จึงทำใน do-block ────────────────────
-- ══════════════════════════════════════════════════════════════════════════
do $$
declare
  v_user  uuid;
  v_item  uuid;
  v_ev    int;  v_mem int;  v_saved int;  v_hist int;  v_key text;
begin
  -- ผู้ใช้ทดสอบ (สร้างชั่วคราว ถูกทิ้งตอน rollback)
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

  insert into public.learning_saved_items (user_id, word_th, item_id, source_raw)
  values (v_user, '__ทดสอบสะกดผิด', v_item, 'reading-game');

  -- ★ Lin แก้ typo: เปลี่ยนแค่ "ตัวหนังสือ" — item_id เดิมไม่แตะ
  insert into public.learning_item_key_history (item_id, old_content_key, new_content_key, note)
  values (v_item, '__ทดสอบสะกดผิด@中', '__ทดสอบสะกดถูก@中', 'ทดสอบการแก้ typo');

  update public.learning_items
     set content_key = '__ทดสอบสะกดถูก@中', updated_at = now()
   where item_id = v_item;

  select count(*) into v_ev    from public.practice_events      where item_id = v_item and user_id = v_user;
  select count(*) into v_mem   from public.learning_memory      where item_id = v_item and user_id = v_user;
  select count(*) into v_saved from public.learning_saved_items where item_id = v_item and user_id = v_user;
  select count(*) into v_hist  from public.learning_item_key_history where item_id = v_item;
  select content_key into v_key from public.learning_items      where item_id = v_item;

  if v_ev = 1 and v_mem = 1 and v_saved = 1 and v_hist = 1 and v_key = '__ทดสอบสะกดถูก@中' then
    insert into _lf_result values (3, '✅ 3. แก้ typo แล้วประวัติไม่ขาด — ประวัติฝึก 1 · สถานะความจำ 1 · คลังคำ 1 · จดชื่อเก่าไว้ 1 · ตัวสะกดใหม่ถูกต้อง');
  else
    insert into _lf_result values (3, '❌ 3. ประวัติขาดหลังแก้ typo! ฝึก=' || v_ev || ' ความจำ=' || v_mem
      || ' คลังคำ=' || v_saved || ' ประวัติชื่อ=' || v_hist || ' ตัวสะกด=' || coalesce(v_key,'(null)'));
  end if;

  -- ── ข้อ 4) คำเดียวกันต่างระดับ = คนละ item · Master ห้ามซ้ำ ──
  begin
    insert into public.learning_items (item_type, status, difficulty, content_source, content_key)
    values ('word', 'active', '初', 'game_words', '__ทดสอบสะกดถูก@初');   -- ต่างระดับ → ต้องเพิ่มได้
    begin
      insert into public.learning_items (item_type, status, difficulty, content_source, content_key)
      values ('word', 'active', '中', 'game_words', '__ทดสอบสะกดถูก@中'); -- ซ้ำของกลาง → ต้องถูกกัน
      insert into _lf_result values (4, '❌ 4. Master ซ้ำได้ — ด่านกันคำซ้ำไม่ทำงาน');
    exception when unique_violation then
      insert into _lf_result values (4, '✅ 4. คำเดียวกันต่างระดับ = คนละ item · Master ซ้ำถูกกันจริง');
    end;
  exception when others then
    insert into _lf_result values (4, '❌ 4. เพิ่มคำเดียวกันต่างระดับไม่ได้ (ควรได้) — ' || sqlerrm);
  end;

  -- ── ข้อ 5) Personal Content ต้องผูกเจ้าของ ──
  begin
    insert into public.learning_items (item_type, status, content_source, content_key)
    values ('sentence', 'candidate', 'personal', '__ประโยคไม่มีเจ้าของ');
    insert into _lf_result values (5, '❌ 5. Personal Content ไม่มีเจ้าของก็เพิ่มได้ — ด่านไม่ทำงาน');
  exception when check_violation then
    insert into _lf_result values (5, '✅ 5. Personal Content บังคับต้องมีเจ้าของจริง');
  end;
end $$;

-- ── ข้อ 6) ตารางที่ตั้งใจให้ว่าง ต้องยังว่าง (ไม่นับแถวทดสอบที่ขึ้นต้น __) ──
insert into _lf_result
select 6, case when v.รวม = 0
            then '✅ 6. ตารางที่ยังไม่มี Decision ยังว่างจริง (tags/skills/compatibility/memory/events/prices/entitlements)'
            else '❌ 6. มีข้อมูลโผล่มา ' || v.รวม || ' แถว — ต้องตรวจว่าใครใส่ ทำไม (สูตร/taxonomy ยังไม่ล็อก)' end
from (
  select (select count(*) from public.learning_tags)
       + (select count(*) from public.learning_skills where code not like '\_\_%')
       + (select count(*) from public.learning_item_surfaces)
       + (select count(*) from public.learning_memory where skill_code not like '\_\_%')
       + (select count(*) from public.practice_events
            where item_id in (select item_id from public.learning_items where content_key not like '\_\_%'))
       + (select count(*) from public.plan_prices)
       + (select count(*) from public.entitlement_keys) as รวม
) v;

-- ── ข้อ 7a) ตารางเนื้อหา/หลักฐานดิบ ต้อง "ไม่มี policy เลย" = ปิดสนิท ──────
insert into _lf_result
select 7, case when count(*) = 0
            then '✅ 7a. ตารางเนื้อหา/หลักฐานดิบปิดสนิท (ไม่มี policy ให้ client เลย ตามที่ตั้งใจ)'
            else '❌ 7a. มี policy โผล่มา ' || count(*) || ' ตัวในตารางที่ควรปิดสนิท: '
                 || string_agg(distinct tablename || '/' || cmd, ', ') end
from pg_policies
where schemaname = 'public'
  and tablename in ('learning_items','learning_item_types','learning_item_statuses','learning_tags',
                    'learning_tag_axes','learning_relation_types','practice_surfaces','practice_types',
                    'learning_skills','learning_memory_states','learning_item_key_history',
                    'learning_item_audit','learning_item_tags','learning_item_relations',
                    'learning_item_surfaces','practice_events','billing_plans','plan_prices',
                    'entitlement_keys','plan_entitlements');

-- ── ข้อ 7b) คลังคำต้องมีด่านครบ 4 คำสั่ง ──────────────────────────────────
insert into _lf_result
select 8, case when count(distinct cmd) = 4
            then '✅ 7b. คลังคำมีด่านครบ 4 คำสั่ง (SELECT/INSERT/UPDATE/DELETE)'
            else '❌ 7b. คลังคำมีด่านแค่ ' || count(distinct cmd) || ' คำสั่ง: '
                 || coalesce(string_agg(distinct cmd, ','),'ไม่มีเลย') || ' — กฎ repo บังคับคิดครบ 4 คำสั่ง' end
from pg_policies where schemaname='public' and tablename='learning_saved_items';

-- ── ข้อ 7c) สถานะความจำ + แพ็กเกจ: นักเรียนอ่านได้อย่างเดียว ห้ามเขียน ─────
insert into _lf_result
select 9, case when (select count(*) from pg_policies where schemaname='public' and tablename='learning_memory') = 1
             and (select count(*) from pg_policies where schemaname='public' and tablename='learning_memory' and cmd='SELECT') = 1
             and (select count(*) from pg_policies where schemaname='public' and tablename='user_plan_grants') = 1
             and (select count(*) from pg_policies where schemaname='public' and tablename='user_plan_grants' and cmd='SELECT') = 1
            then '✅ 7c. สถานะความจำ + แพ็กเกจ: นักเรียนอ่านของตัวเองได้ เขียนไม่ได้ (ตามที่ตั้งใจ)'
            else '❌ 7c. ด่านของ learning_memory / user_plan_grants ไม่ตรงกับที่ออกแบบ — ตรวจ pg_policies' end;

-- ── ผลรวมทั้งหมด (คำสั่งสุดท้ายที่คืนแถว = ที่ Supabase จะโชว์ให้เห็น) ────
select ผลทดสอบ from _lf_result order by ord;

-- ⚠️ ทิ้งข้อมูลทดสอบทั้งหมด — ต้องเป็น rollback ไม่ใช่ commit เด็ดขาด
rollback;
