-- ════════════════════════════════════════════════════════════════════════════
-- 2026-08-11 — เติมชื่อเก่า (alias) ของคลังคำ เข้า practice_surfaces.legacy_codes
-- ────────────────────────────────────────────────────────────────────────────
-- ไฟล์นี้ทำอะไร (ภาษาคน):
--   ระบบเดิมเรียก "เกมเดียวกัน" ด้วยชื่อไม่เหมือนกันหลายแบบ · ตาราง practice_surfaces
--   มีช่อง legacy_codes ไว้จับคู่ชื่อเก่าอยู่แล้วตั้งแต่ 2026-08-11_learning_foundation.sql
--   แต่ตอนนั้นใส่ไว้เฉพาะชื่อที่ใช้ตอน "เขียน SRS" กับ "เซฟคะแนน" เท่านั้น
--   → **ชื่อแบบขีดกลางที่ "คลังคำ" ใช้จริง ยังไม่ถูกใส่ไว้เลยสักเกม**
--   ไฟล์นี้เติม 6 ชื่อนั้นเข้าไป เพื่อให้ระบบตัวตนกลางรู้จักชื่อเดิมครบทุกทาง
--
-- 🔑 ทำไมต้องมี: คอลัมน์ learning_saved_items.source_raw เก็บชื่อเกมแบบขีดกลาง
--   (เช่น 'word-order') ส่วน practice_surfaces.code เป็นแบบขีดล่าง (เช่น 'word_order')
--   ถ้าไม่มีตารางจับคู่ ก็ตอบไม่ได้ว่า "คำที่นักเรียนเซฟไว้ มาจากเกมไหน" ในระบบใหม่
--
-- ✅ ความปลอดภัยของไฟล์นี้ (ตรวจแล้วทุกข้อ ก่อนเขียน):
--   · **additive 100%** — ใช้ array_append ต่อท้ายเท่านั้น ไม่มีการลบ/แทนที่ค่าเดิมสักค่า
--   · **ไม่ rename อะไรเลย** — practice_surfaces.code ทุกแถวคงเดิมเป๊ะ
--   · **ไม่แตะข้อมูลประวัติการเรียน** — ไม่แตะ tone_srs_state / star_ledger /
--     reading_sessions / tone_sessions / learning_saved_items เลยแม้แต่ตารางเดียว
--   · **ไม่มีคำสั่งลบข้อมูล** (ไม่มี drop / delete / truncate / alter drop column)
--     → ตามกฎ repo ข้อ 6 (2026-08-08) ไม่ต้องบังคับสำรองก่อนรัน แต่ยังแนบบล็อก [Z] ไว้ให้
--   · **รันซ้ำได้** — มีเงื่อนไข `not (... = any(legacy_codes))` กันเติมซ้ำ
--   · **ไม่เปลี่ยน schema** — ไม่เพิ่ม/ลด/แก้คอลัมน์ใดๆ
--   · **ไม่เปลี่ยนพฤติกรรมเว็บ** — วันนี้ยังไม่มีโค้ดไหนอ่าน legacy_codes เลย
--     (ตรวจแล้ว: ค้นทั้ง js/ และ supabase/functions/ ไม่มีใครอ่านช่องนี้)
--     ไฟล์นี้จึงเป็นการ "เตรียมตารางจับคู่ให้ครบ" ล้วนๆ ไม่มีผลต่อผู้ใช้ทันที
--
-- 🔍 หลักฐานของแต่ละ alias (ยืนยันจาก source จริง ไม่มีข้อไหนเดา):
--   'tone-finder'     ← js/games/tone-finder-game.js:2182   source: 'tone-finder'
--   'reading-game'    ← js/games/reading-game-app.js:807    source:'reading-game'
--   'typing-game'     ← js/games/typing-game-app.js:619     source:'typing-game'
--   'word-order'      ← js/games/word-order-app.js:363      source: 'word-order'
--   'listening-game'  ← js/games/listening-game-app.js:222  source: 'listening-game'
--   'games-challenge' ← js/games/games-challenge-app.js:664 source: 'games-challenge'
--   ทั้ง 6 ค่าไหลลงช่อง source_raw ผ่าน js/games/word-vault.js:114 (`source_raw: w.source`)
--
-- 🛑 เกมเลโก้ **ตั้งใจไม่มีในไฟล์นี้**: js/games/lego-vault.js:35 มี source:'lego' จริง
--    แต่ lego-vault เก็บใน localStorage อย่างเดียว ไม่เคยเขียนลง learning_saved_items
--    → ค่า 'lego' ไม่เคยไปถึง source_raw · และ 'lego' อยู่ใน legacy_codes ของแถว lego แล้ว
--
-- ✅ ตรวจ collision แล้วก่อนเขียนไฟล์นี้: ทั้ง 6 ค่าใหม่ **ไม่ซ้ำกับ code ของ surface ไหน
--    และไม่ซ้ำกับ legacy_codes ของ surface อื่นเลย** → ทุก alias ชี้ไป surface เดียวเท่านั้น
--    (หัวข้อ [M] ข้อ 2 บังคับพิสูจน์ซ้ำหลังรันจริงอีกครั้ง — ห้ามเชื่อคอมเมนต์นี้อย่างเดียว)
--
-- 🛑 สิ่งที่ไฟล์นี้ "ตั้งใจไม่ทำ" (ยังไม่มีคำตัดสินของ Lin — ห้ามเดา):
--    · ไม่เติม learning_skills (ติดที่ label_zh เป็น NOT NULL แต่คำจีนยังไม่ล็อก)
--    · ไม่เขียน learning_item_surfaces · ไม่แตะ learning_memory · ไม่แตะ practice_events
--    · ไม่แก้ค่า '未練習' ให้เป็น '未開始' (เอกสาร 14 หมวดกับฐานข้อมูลเขียนไม่ตรงกัน — รอ Lin)
--
-- 📌 ลำดับการรัน: รันบน staging (xufxvwcelbovzsxywawg) ก่อนเสมอ แล้วค่อย production
--    (qzkxlhpcputsvbqmtqfi) · รวบรันทั้งไฟล์ได้ในครั้งเดียว
--
-- 📖 อ่านคู่กับ: supabase/sql/00_ฟังก์ชันไหนอยู่ไฟล์ไหน.md (สารบัญ — อัปเดตแล้วในคอมมิตเดียวกัน)
-- ════════════════════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════════════════════════
-- [A] ด่านกันพลาด — ถ้ามี alias ตัวไหนชี้ได้เกิน 1 surface ให้หยุดทั้งไฟล์ ห้ามเขียนอะไรเลย
-- ────────────────────────────────────────────────────────────────────────────
-- ทำไมต้องมี: ถ้าวันหลังมีคนเพิ่มค่าใน legacy_codes จนชนกับรายการข้างล่างนี้
-- การเติมต่อไปจะทำให้ "ชื่อเดียวชี้ได้ 2 เกม" = จับคู่ข้อมูลผิดแบบเงียบๆ ตลอดกาล
-- ด่านนี้ทำให้ล้มทั้งไฟล์ก่อนเขียน แทนที่จะเขียนไปครึ่งทางแล้วค่อยรู้ทีหลัง
-- ════════════════════════════════════════════════════════════════════════════
do $$
declare
  bad text;
begin
  -- 1) alias ใหม่ต้องไม่ตรงกับ code ของ surface ใดๆ
  select string_agg(a.alias_code, ', ')
    into bad
  from (values
    ('tone_finder','tone-finder'),
    ('reading',    'reading-game'),
    ('typing',     'typing-game'),
    ('word_order', 'word-order'),
    ('listening',  'listening-game'),
    ('challenge',  'games-challenge')
  ) as a(surface_code, alias_code)
  where exists (select 1 from public.practice_surfaces s where s.code = a.alias_code);
  if bad is not null then
    raise exception 'หยุด: alias ชนกับ code ของ surface → %', bad;
  end if;

  -- 2) alias ใหม่ต้องไม่โผล่อยู่ใน legacy_codes ของ surface "อื่น" (ที่ไม่ใช่เจ้าของ)
  select string_agg(a.alias_code || ' (ไปโผล่ที่ ' || s.code || ')', ', ')
    into bad
  from (values
    ('tone_finder','tone-finder'),
    ('reading',    'reading-game'),
    ('typing',     'typing-game'),
    ('word_order', 'word-order'),
    ('listening',  'listening-game'),
    ('challenge',  'games-challenge')
  ) as a(surface_code, alias_code)
  join public.practice_surfaces s
    on a.alias_code = any(s.legacy_codes)
   and s.code <> a.surface_code;
  if bad is not null then
    raise exception 'หยุด: alias ชี้ได้เกิน 1 surface → %', bad;
  end if;

  -- 3) แถวปลายทางต้องมีอยู่จริงครบทั้ง 6 (ถ้าขาด แปลว่ายังไม่ได้รัน learning_foundation.sql)
  if (select count(*) from public.practice_surfaces
      where code in ('tone_finder','reading','typing','word_order','listening','challenge')) <> 6 then
    raise exception 'หยุด: practice_surfaces ยังไม่ครบ 6 แถวที่ต้องใช้ — ให้รัน sql/2026-08-11_learning_foundation.sql ก่อน';
  end if;
end $$;


-- ════════════════════════════════════════════════════════════════════════════
-- [B] เติม alias — ต่อท้ายอย่างเดียว ไม่แตะค่าเดิม
-- ────────────────────────────────────────────────────────────────────────────
-- เงื่อนไข `not (a.alias_code = any(s.legacy_codes))` ทำให้รันซ้ำกี่รอบก็ได้ค่าเท่าเดิม
-- (รอบที่ 2 เป็นต้นไปจะไม่มีแถวไหนเข้าเงื่อนไข = update 0 แถว ไม่เกิดอะไรขึ้น)
-- ════════════════════════════════════════════════════════════════════════════
update public.practice_surfaces s
   set legacy_codes = array_append(s.legacy_codes, a.alias_code)
  from (values
    ('tone_finder','tone-finder'),
    ('reading',    'reading-game'),
    ('typing',     'typing-game'),
    ('word_order', 'word-order'),
    ('listening',  'listening-game'),
    ('challenge',  'games-challenge')
  ) as a(surface_code, alias_code)
 where s.code = a.surface_code
   and not (a.alias_code = any(s.legacy_codes));


-- ════════════════════════════════════════════════════════════════════════════
-- [C] จดว่าไฟล์นี้ถูกรันแล้ว (ระบบติดตาม migration จาก P2-05)
-- ────────────────────────────────────────────────────────────────────────────
-- ห่อด้วย "ถ้ามีตารางนั้นอยู่" แบบเดียวกับ learning_foundation.sql — ตาราง
-- private.sql_run_log มีบน production แต่อาจยังไม่มีบน staging/sandbox
-- ไม่มีตาราง = ข้ามการจดบันทึก แล้วขึ้นข้อความบอกตรงๆ (ไม่เงียบ) ส่วน [B] ทำงานครบเหมือนเดิม
-- ════════════════════════════════════════════════════════════════════════════
do $$
begin
  if to_regclass('private.sql_run_log') is null then
    raise notice '⚠️ ข้ามการจดบันทึกลง private.sql_run_log เพราะยังไม่มีตารางนั้นในฐานข้อมูลนี้ (ปกติสำหรับ staging/sandbox) — การเติม alias ในหัวข้อ [B] ทำงานครบแล้ว';
    return;
  end if;
  insert into private.sql_run_log (file_name, file_date, verified_active_at, verified_method, note)
  values ('sql/2026-08-11_practice_surface_vault_aliases.sql', '2026-08-11', current_date,
          'รันไฟล์แล้ว — ยังไม่ได้ตรวจหัวข้อ [M]',
          'เติมชื่อเก่าแบบขีดกลางของคลังคำ 6 ค่า เข้า practice_surfaces.legacy_codes (additive ล้วน ไม่ rename ไม่ลบ)')
  on conflict (file_name) do update
    set verified_active_at = excluded.verified_active_at,
        verified_method    = excluded.verified_method,
        note               = excluded.note;
end $$;


-- ════════════════════════════════════════════════════════════════════════════
-- [M] ตรวจด้วยตัวเองว่าได้จริง — วางรันต่อได้เลยหลังรันไฟล์นี้จบ
-- ────────────────────────────────────────────────────────────────────────────
-- ต้องได้ครบ 3 ข้อ ถ้าข้อไหนไม่ตรง ห้ามถือว่าสำเร็จ (กฎ RELIABILITY FIRST):
--
--   1) ทั้ง 6 แถวมี alias ใหม่ครบแล้ว และ "ค่าเดิมยังอยู่ครบ"
--      select code, legacy_codes, array_length(legacy_codes, 1) as จำนวน
--      from public.practice_surfaces order by code;
--      → ต้องได้:
--        challenge   {challenge, games-challenge}                  = 2
--        lego        {lego}                                        = 1   ← ไม่เปลี่ยน (ตั้งใจ)
--        listening   {listening_game, listening-game}              = 2
--        reading     {reading, reading_game, reading-game}         = 3
--        tone_finder {tone, tone_finder, tone-finder}              = 3
--        typing      {typing, typing_game, typing-game}            = 3
--        word_order  {wordorder, word_order, word-order}           = 3
--      🔑 ข้อสำคัญ: ค่าเดิมทุกค่าต้องยังอยู่ (เช่น word_order ต้องมี wordorder + word_order
--         อยู่ครบ ไม่ใช่ถูกแทนที่) — ถ้าหายแม้แต่ค่าเดียว ให้ใช้บล็อก [Z] ย้อนกลับทันที
--
--   2) ไม่มีชื่อไหนชี้ได้เกิน 1 เกม (ด่านสำคัญที่สุด — ต้องได้ 0 แถว)
--      select lc as ชื่อที่ซ้ำ, count(*) as ชี้ไปกี่เกม, string_agg(code, ', ') as เกม
--      from public.practice_surfaces, unnest(legacy_codes) as lc
--      group by lc having count(*) > 1;
--      → ต้องได้ 0 แถว · ถ้ามีแถวออกมา = จับคู่ข้อมูลผิดได้ ห้ามใช้งานต่อ
--
--   3) ชื่อที่คลังคำใช้จริง ตอนนี้จับคู่ได้ครบทุกค่าแล้ว (ต้องได้ 0 แถว)
--      select distinct s.source_raw
--      from public.learning_saved_items s
--      where s.source_raw is not null
--        and not exists (select 1 from public.practice_surfaces p
--                        where s.source_raw = any(p.legacy_codes));
--      → ต้องได้ 0 แถว · ถ้ามีค่าโผล่มา = มีเกมส่งชื่อแบบอื่นที่ยังไม่ได้จดไว้
--        ⚠️ **ห้ามเดาว่าเป็นของเกมไหน** ให้ไปหาในโค้ดว่าใครส่งค่านั้น แล้วรายงาน Lin ก่อน
--
--   หมายเหตุ: ไฟล์นี้ **ไม่แตะ learning_saved_items** เลย ข้อ 3 เป็นแค่การอ่านเทียบ
-- ════════════════════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════════════════════════
-- [Z] คำสั่งย้อนกลับ (rollback) — comment ปิดไว้ตามกฎ repo ข้อ 6 (2026-08-08)
-- ────────────────────────────────────────────────────────────────────────────
-- ถอนเฉพาะ 6 ค่าที่ไฟล์นี้เติม · ค่าเดิมที่มาจาก learning_foundation.sql ไม่ถูกแตะ
-- ปลอดภัยกว่าการเขียนทับทั้งอาร์เรย์ เพราะถ้ามีใครเติมค่าอื่นเพิ่มทีหลัง ค่านั้นจะไม่หายไปด้วย
--
-- update public.practice_surfaces s
--    set legacy_codes = array_remove(s.legacy_codes, a.alias_code)
--   from (values
--     ('tone_finder','tone-finder'),
--     ('reading',    'reading-game'),
--     ('typing',     'typing-game'),
--     ('word_order', 'word-order'),
--     ('listening',  'listening-game'),
--     ('challenge',  'games-challenge')
--   ) as a(surface_code, alias_code)
--  where s.code = a.surface_code
--    and a.alias_code = any(s.legacy_codes);
--
-- delete from private.sql_run_log
--  where file_name = 'sql/2026-08-11_practice_surface_vault_aliases.sql';
-- ════════════════════════════════════════════════════════════════════════════
