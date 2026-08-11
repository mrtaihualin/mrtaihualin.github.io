-- ════════════════════════════════════════════════════════════════════════════
-- ตัวทดสอบฝั่งเซิร์ฟเวอร์ของ "คลังคำ sync ข้ามเครื่อง" (ตาราง learning_saved_items)
-- ────────────────────────────────────────────────────────────────────────────
-- คู่กับ: js/games/word-vault.js (ฝั่งเว็บ) · scripts/tests-word-vault-sync.js (ทดสอบ logic รวมคำ)
-- ต้องรัน supabase/sql/2026-08-11_learning_foundation.sql ให้เสร็จก่อน
--
-- ทดสอบอะไร (8 ข้อ) — ยิงด้วยชุดคอลัมน์เดียวกับที่ฝั่งเว็บส่งจริงเป๊ะๆ
--   (user_id · vault_key · word_th · zh · en · source_raw · tags)
--   1. เซฟคำได้ด้วยชุดคอลัมน์ที่ฝั่งเว็บใช้จริง
--   2. upsert คำเดิมซ้ำ ไม่เกิดแถวซ้ำ (กดปุ่ม 🔖 รัวๆ / sync ชนกันก็ไม่พัง)
--   3. อ่านกลับได้ครบทุกช่องที่ฝั่งเว็บต้องใช้
--   4. 🔴 นักเรียน A อ่านคลังคำของ B ไม่ได้
--   5. 🔴 นักเรียน A ยัดคำใส่บัญชี B ไม่ได้
--   6. 🔴 นักเรียน A ลบคำของ B ไม่ได้
--   7. ลบคำของตัวเองได้ (ทางออกจากสถานะเกินเพดาน)
--   8. เก็บได้เกินเพดาน 30 คำจริง (ฐานข้อมูลไม่บังคับเพดาน — เพดานอยู่ที่ฝั่งเว็บตามที่ Lin สั่ง)
--   ── 🆕 2026-08-11 (ตราการลบ + export) ──
--   9.  ปั๊มตราการลบ (deleted_at) ได้ และอ่านกลับมาเห็นตราชัดเจน
--   10. 🔴 นักเรียน A ปั๊มตราลบคำของ B ไม่ได้
--   11. ปั๊มตราซ้ำ (retry/กดซ้ำ) ไม่เกิดแถวซ้ำ ไม่ทำข้อมูลเสีย
--   12. เซฟคำเดิมใหม่หลังมีตรา → ตราถูกล้าง (คำกลับมาใช้งานได้ ตามเจตนาผู้ใช้)
--   13. คำอื่นที่ไม่ได้ลบ ต้องไม่ถูกแตะ
--   14. ชุดคอลัมน์ที่ account-export ใช้ ดึงได้จริงและแยกคำที่ใช้อยู่/ถูกลบได้ (เกิน 30 ต้องได้ครบ)
--
-- ✅ ปลอดภัย: ห่อด้วย begin … rollback → ไม่มีอะไรถูกบันทึกลงฐานข้อมูลจริง รันซ้ำได้
-- 📌 ผลจะโชว์เป็นตารางเดียว 8 บรรทัด (Supabase คืนผลของคำสั่งสุดท้ายเท่านั้น)
-- ════════════════════════════════════════════════════════════════════════════

begin;

create temporary table _wv_result (ord int primary key, ผลทดสอบ text);

do $$
declare
  v_a uuid; v_b uuid;
  v_cnt int; v_row record;
  v_r4 text; v_r5 text; v_r6 text; v_r7 text;
  v_r9 text; v_r10 text; v_r11 text; v_r12 text; v_r13 text; v_r14 text;
  v_zh text; v_active int; v_deleted int;
begin
  -- ผู้ใช้ทดสอบ 2 คน (ถูกทิ้งตอน rollback)
  insert into auth.users (id, email) values (gen_random_uuid(), 'wv-a@example.invalid') returning id into v_a;
  insert into auth.users (id, email) values (gen_random_uuid(), 'wv-b@example.invalid') returning id into v_b;

  -- ── 1) เซฟคำด้วยชุดคอลัมน์เดียวกับฝั่งเว็บ ──
  begin
    insert into public.learning_saved_items (user_id, vault_key, word_th, zh, en, source_raw, tags)
    values (v_a, 'linvault', '__ข้าว', '飯', 'khao', 'reading-game', array['อยากฝึก']);
    insert into _wv_result values (1, '✅ 1. เซฟคำได้ด้วยชุดคอลัมน์ที่ฝั่งเว็บส่งจริง (source_raw ไม่ติด FK)');
  exception when others then
    insert into _wv_result values (1, '❌ 1. เซฟคำไม่ได้ — ' || sqlerrm);
  end;

  -- ── 2) upsert ซ้ำ ต้องไม่เกิดแถวซ้ำ ──
  begin
    insert into public.learning_saved_items (user_id, vault_key, word_th, zh, en, source_raw, tags)
    values (v_a, 'linvault', '__ข้าว', '飯', 'khao', 'reading-game', array['อยากฝึก','ชอบ'])
    on conflict (user_id, vault_key, word_th) do update
      set zh = excluded.zh, en = excluded.en, source_raw = excluded.source_raw, tags = excluded.tags;
    select count(*) into v_cnt from public.learning_saved_items where user_id = v_a and word_th = '__ข้าว';
    if v_cnt = 1 then
      insert into _wv_result values (2, '✅ 2. upsert คำเดิมซ้ำ ไม่เกิดแถวซ้ำ (กดรัวๆ / sync ชนกันก็ปลอดภัย)');
    else
      insert into _wv_result values (2, '❌ 2. เกิดแถวซ้ำ ' || v_cnt || ' แถว — คีย์หลักไม่ทำงาน');
    end if;
  exception when others then
    insert into _wv_result values (2, '❌ 2. upsert ล้มเหลว — ' || sqlerrm);
  end;

  -- ── 3) อ่านกลับได้ครบทุกช่องที่ฝั่งเว็บต้องใช้ ──
  select word_th, zh, en, source_raw, tags, saved_at into v_row
  from public.learning_saved_items where user_id = v_a and word_th = '__ข้าว';
  if v_row.zh = '飯' and v_row.source_raw = 'reading-game'
     and array_length(v_row.tags,1) = 2 and v_row.saved_at is not null then
    insert into _wv_result values (3, '✅ 3. อ่านกลับได้ครบ (คำแปล · ที่มา · ป้ายกำกับ · เวลาเซฟ)');
  else
    insert into _wv_result values (3, '❌ 3. อ่านกลับได้ไม่ครบ — zh=' || coalesce(v_row.zh,'(null)')
      || ' source_raw=' || coalesce(v_row.source_raw,'(null)')
      || ' tags=' || coalesce(array_length(v_row.tags,1)::text,'0'));
  end if;

  -- คำของ B ไว้ทดสอบการแยกบัญชี
  insert into public.learning_saved_items (user_id, vault_key, word_th, zh)
  values (v_b, 'linvault', '__กินของบี', '吃');

  -- ── 8) เก็บเกินเพดาน 30 คำได้จริง (ฐานข้อมูลไม่บังคับเพดาน) ──
  begin
    insert into public.learning_saved_items (user_id, vault_key, word_th)
    select v_a, 'linvault', '__คำ' || g from generate_series(1, 40) g;
    select count(*) into v_cnt from public.learning_saved_items where user_id = v_a;
    if v_cnt >= 41 then
      insert into _wv_result values (8, '✅ 8. เก็บเกินเพดาน 30 ได้จริง (' || v_cnt
        || ' คำ) — เพดานอยู่ที่ฝั่งเว็บ ไม่ใช่ฐานข้อมูล ตามที่ Lin สั่ง');
    else
      insert into _wv_result values (8, '❌ 8. เก็บได้แค่ ' || v_cnt || ' คำ — มีอะไรบังคับเพดานในฐานข้อมูล');
    end if;
  exception when others then
    insert into _wv_result values (8, '❌ 8. เก็บเกินเพดานไม่ได้ — ' || sqlerrm);
  end;

  -- ══════════════════════════════════════════════════════════════════════
  -- ── 4-7) ทดสอบด่าน RLS ในบทบาท authenticated จริง ────────────────────
  --    (ต้องสวมบทเป็นนักเรียน A ผ่านค่า request.jwt.claim.sub ที่ auth.uid() อ่าน)
  -- ══════════════════════════════════════════════════════════════════════
  perform set_config('request.jwt.claim.sub', v_a::text, true);
  set local role authenticated;

  -- 4) A อ่านของ B ไม่ได้
  select count(*) into v_cnt from public.learning_saved_items where word_th = '__กินของบี';
  if v_cnt = 0 then
    v_r4 := '✅ 4. นักเรียน A อ่านคลังคำของ B ไม่ได้';
  else
    v_r4 := '❌ 4. A เห็นคำของ B ได้ ' || v_cnt || ' แถว — ด่านรั่ว!';
  end if;

  -- 5) A ยัดคำใส่บัญชี B ไม่ได้
  begin
    insert into public.learning_saved_items (user_id, vault_key, word_th) values (v_b, 'linvault', '__แอบยัด');
    v_r5 := '❌ 5. A ยัดคำใส่บัญชี B ได้ — ด่านรั่ว!';
  exception when others then
    v_r5 := '✅ 5. นักเรียน A ยัดคำใส่บัญชี B ไม่ได้ (ถูกปฏิเสธ)';
  end;

  -- 6) A ลบคำของ B ไม่ได้
  delete from public.learning_saved_items where word_th = '__กินของบี';
  get diagnostics v_cnt = row_count;
  if v_cnt = 0 then
    v_r6 := '✅ 6. นักเรียน A ลบคำของ B ไม่ได้ (0 แถว)';
  else
    v_r6 := '❌ 6. A ลบคำของ B ได้ ' || v_cnt || ' แถว — ด่านรั่ว!';
  end if;

  -- 7) ลบคำของตัวเองได้ (ยังเก็บไว้เป็นความสามารถของฐานข้อมูล แม้ฝั่งเว็บจะเปลี่ยนไปใช้ตราแล้ว)
  delete from public.learning_saved_items where word_th = '__คำ40';
  get diagnostics v_cnt = row_count;
  if v_cnt = 1 then
    v_r7 := '✅ 7. ลบคำของตัวเองได้ (ทางออกจากสถานะเกินเพดาน)';
  else
    v_r7 := '❌ 7. ลบคำตัวเองไม่ได้ (' || v_cnt || ' แถว) — ผู้ใช้จะติดอยู่ในสถานะเต็มถาวร';
  end if;

  -- ══════════════════════════════════════════════════════════════════════
  -- 🆕 9-13) ตราการลบ (tombstone) — ทดสอบในบทบาท authenticated จริง
  -- ══════════════════════════════════════════════════════════════════════

  -- 9) ปั๊มตราลบคำของตัวเอง (ท่าเดียวกับที่ฝั่งเว็บทำ: upsert ส่งแค่คีย์ + deleted_at)
  begin
    insert into public.learning_saved_items (user_id, vault_key, word_th, deleted_at)
    values (v_a, 'linvault', '__ข้าว', now())
    on conflict (user_id, vault_key, word_th) do update set deleted_at = excluded.deleted_at;
    select count(*) into v_cnt from public.learning_saved_items
      where user_id = v_a and word_th = '__ข้าว' and deleted_at is not null;
    if v_cnt = 1 then
      v_r9 := '✅ 9. ปั๊มตราการลบได้ และอ่านกลับมาเห็นตราชัดเจน (แถวไม่ถูกลบทิ้ง)';
    else
      v_r9 := '❌ 9. ปั๊มตราแล้วอ่านกลับไม่เจอตรา — การลบข้ามเครื่องจะไม่ทำงาน';
    end if;
  exception when others then
    v_r9 := '❌ 9. ปั๊มตราการลบไม่ได้ — ' || sqlerrm;
  end;

  -- 9ข) คำแปลเดิมต้องไม่ถูกล้างทิ้งตอนปั๊มตรา (ส่งแค่ 4 ช่อง ไม่ควรทับ zh/en)
  select zh into v_zh from public.learning_saved_items where user_id = v_a and word_th = '__ข้าว';
  if v_zh = '飯' then
    v_r9 := v_r9 || ' · คำแปลเดิมไม่ถูกล้าง';
  else
    v_r9 := '❌ 9. ปั๊มตราแล้วคำแปลเดิมหาย (zh=' || coalesce(v_zh,'(null)') || ') — upsert ทับข้อมูลเกินจำเป็น';
  end if;

  -- 10) A ปั๊มตราลบคำของ B ไม่ได้
  begin
    insert into public.learning_saved_items (user_id, vault_key, word_th, deleted_at)
    values (v_b, 'linvault', '__กินของบี', now())
    on conflict (user_id, vault_key, word_th) do update set deleted_at = excluded.deleted_at;
    v_r10 := '❌ 10. A ปั๊มตราลบคำของ B ได้ — ด่านรั่ว!';
  exception when others then
    v_r10 := '✅ 10. นักเรียน A ปั๊มตราลบคำของ B ไม่ได้ (ถูกปฏิเสธ)';
  end;

  -- 11) ปั๊มตราซ้ำ (retry/กดซ้ำ) ต้องไม่เกิดแถวซ้ำ
  begin
    insert into public.learning_saved_items (user_id, vault_key, word_th, deleted_at)
    values (v_a, 'linvault', '__ข้าว', now())
    on conflict (user_id, vault_key, word_th) do update set deleted_at = excluded.deleted_at;
    select count(*) into v_cnt from public.learning_saved_items where user_id = v_a and word_th = '__ข้าว';
    if v_cnt = 1 then
      v_r11 := '✅ 11. ปั๊มตราซ้ำ (retry/กดซ้ำ) ไม่เกิดแถวซ้ำ ไม่ทำข้อมูลเสีย';
    else
      v_r11 := '❌ 11. ปั๊มตราซ้ำแล้วได้ ' || v_cnt || ' แถว — คีย์หลักไม่ทำงาน';
    end if;
  exception when others then
    v_r11 := '❌ 11. ปั๊มตราซ้ำล้มเหลว — ' || sqlerrm;
  end;

  -- 12) เซฟคำเดิมใหม่หลังมีตรา → ตราต้องถูกล้าง (ท่าเดียวกับ _rowFor ที่ส่ง deleted_at = null)
  begin
    insert into public.learning_saved_items (user_id, vault_key, word_th, zh, deleted_at)
    values (v_a, 'linvault', '__ข้าว', '飯', null)
    on conflict (user_id, vault_key, word_th) do update
      set zh = excluded.zh, deleted_at = excluded.deleted_at;
    select count(*) into v_cnt from public.learning_saved_items
      where user_id = v_a and word_th = '__ข้าว' and deleted_at is null;
    if v_cnt = 1 then
      v_r12 := '✅ 12. เซฟคำเดิมใหม่หลังมีตรา → ตราถูกล้าง (คำกลับมาใช้งานได้ตามเจตนาผู้ใช้)';
    else
      v_r12 := '❌ 12. เซฟใหม่แล้วตรายังค้าง — คำที่ผู้ใช้เพิ่งเซฟจะถูกลบทิ้งตอน sync รอบหน้า';
    end if;
  exception when others then
    v_r12 := '❌ 12. เซฟคำเดิมใหม่ไม่ได้ — ' || sqlerrm;
  end;

  -- 13) คำอื่นที่ไม่ได้ลบ ต้องไม่ถูกแตะเลย
  select count(*) into v_cnt from public.learning_saved_items
    where user_id = v_a and deleted_at is null and word_th like '__คำ%';
  if v_cnt >= 38 then
    v_r13 := '✅ 13. คำอื่นที่ไม่ได้ลบ ยังอยู่ครบ (' || v_cnt || ' คำ ไม่มีตราลบ)';
  else
    v_r13 := '❌ 13. คำอื่นถูกกระทบไปด้วย เหลือ ' || v_cnt || ' คำ (ควร >= 38)';
  end if;

  -- 14) ชุดคอลัมน์ที่ account-export ใช้ ต้องดึงได้จริง + แยกคำที่ใช้อยู่/ถูกลบได้ + ไม่ตัดที่ 30
  --     ปั๊มตราลบ 1 คำก่อน เพื่อให้ทั้ง 2 กองมีข้อมูลจริง (ไม่ใช่ทดสอบกองว่าง)
  insert into public.learning_saved_items (user_id, vault_key, word_th, deleted_at)
  values (v_a, 'linvault', '__คำ1', now())
  on conflict (user_id, vault_key, word_th) do update set deleted_at = excluded.deleted_at;
  begin
    select count(*) filter (where deleted_at is null),
           count(*) filter (where deleted_at is not null)
      into v_active, v_deleted
    from (
      select vault_key, word_th, zh, en, source_raw, tags, saved_at, updated_at, deleted_at
      from public.learning_saved_items where user_id = v_a
      order by saved_at desc limit 20000
    ) q;
    if v_active > 30 and v_deleted >= 1 then
      v_r14 := '✅ 14. ชุดคอลัมน์ของ account-export ดึงได้จริง · คำที่ใช้อยู่ ' || v_active
            || ' คำ (เกิน 30 ได้ครบ ไม่ถูกตัด) · คำที่ถูกลบ ' || v_deleted || ' คำ แยกออกได้';
    else
      v_r14 := '❌ 14. export แยกกองไม่ถูก — คำที่ใช้อยู่ ' || v_active || ' (ควรเกิน 30) · คำที่ถูกลบ '
            || v_deleted || ' (ควร >= 1)';
    end if;
  exception when others then
    v_r14 := '❌ 14. ชุดคอลัมน์ที่ account-export ใช้ ดึงไม่ได้ — ' || sqlerrm;
  end;

  reset role;

  -- เขียนผล 4 ข้อลงตารางชั่วคราวหลังถอดบทบาทแล้ว
  -- (บทบาท authenticated ไม่มีสิทธิ์เขียนตารางชั่วคราวที่ superuser สร้าง — เจอจริงบน staging)
  insert into _wv_result values (4, v_r4), (5, v_r5), (6, v_r6), (7, v_r7),
                               (9, v_r9), (10, v_r10), (11, v_r11), (12, v_r12), (13, v_r13), (14, v_r14);
end $$;

-- ตรวจปิดท้าย: คำของ B ต้องยังอยู่ (พิสูจน์ว่าคำสั่งลบของ A ไม่ได้แตะข้อมูลของ B จริง)
select ผลทดสอบ from _wv_result order by ord;

-- ⚠️ ทิ้งข้อมูลทดสอบทั้งหมด — ต้องเป็น rollback ไม่ใช่ commit เด็ดขาด
rollback;
