-- ════════════════════════════════════════════════════════════════════════════
-- 2026-07-26 — ให้นักเรียน 1 คน มีคาบประจำ "วันเดียวกันของสัปดาห์ หลายรอบเวลา" ได้
--               (เช่น พุธ 10:00 และ พุธ 19:00 พร้อมกัน) — ขึ้นครบทั้ง Calendar และระบบ
--
-- ปัญหาเดิม: ตาราง classroom_recurring_days ล็อกไว้ว่า 1 คน = 1 วันในสัปดาห์ = 1 แถวเท่านั้น
--            (กฎ unique อยู่ที่ token + weekday)
--            → เพิ่มคาบพุธ 19:00 ให้คนที่มีพุธ 10:00 อยู่แล้ว = แถวพุธ 10:00 ถูก "ทับ" หายไป
--            → คาบ 10:00 ยังอยู่ใน Google Calendar (นักเรียนยังเห็น ยังต้องมาเรียน)
--              แต่ระบบจำไม่ได้แล้วว่าเป็นของใคร (calendar_event_id หายไปพร้อมแถวที่ถูกทับ)
--              = คาบกำพร้า สั่งเลื่อน/ยกเลิกทีหลังไม่ได้
--
-- แก้: ย้ายกฎจาก (token, weekday) → (token, weekday, start_time)
--      = วันเดียวกันมีได้หลายรอบเวลา ขอแค่ "เวลาเริ่มไม่ซ้ำกัน"
--
-- 🔵 วิธีรัน — แบ่ง 3 รอบ (อย่า Run รวดเดียวทั้งไฟล์ จะเห็นผลไม่ครบ)
--    รอบที่ 1: ลากคลุมเฉพาะ "ขั้นที่ 1" → กด Run → แคปหน้าจอเก็บไว้ (ของเดิมเป็นยังไง)
--    รอบที่ 2: ลากคลุมเฉพาะ "ขั้นที่ 2" → กด Run
--    รอบที่ 3: ลากคลุมเฉพาะ "ขั้นที่ 3" → กด Run → แคปหน้าจอส่งให้ AI ตรวจ
--    (หมายเหตุ: ข้อความ raise notice จะไม่โผล่ในหน้า SQL Editor — ดูได้ที่เมนู Logs เท่านั้น
--     เพราะงั้นตัวตัดสินว่าสำเร็จจริงคือผลของ "ขั้นที่ 3")
--
-- ⚠️ ทุกอย่างในขั้นที่ 2 อยู่ในคำสั่งเดียว (transaction เดียว) — ถ้าขั้นไหนพัง ย้อนกลับหมด
--    ไม่มีทางค้างครึ่งๆ กลางๆ · ถ้าเจอเรื่องที่ต้องให้คนตัดสินใจ จะ "หยุดและบอกเหตุผล"
--    โดยไม่แตะข้อมูลเลย (ไม่แอบลบ ไม่แอบแก้)
--
-- ปลอดภัยที่จะรันซ้ำ (เช็คก่อนทำทุกขั้น)
-- ════════════════════════════════════════════════════════════════════════════


-- ══════════════ ขั้นที่ 1) ดูของเดิมก่อน (แค่โชว์ ไม่แก้อะไร) ══════════════════
select 'ก่อนแก้ · กฎ' as ประเภท, con.conname as ชื่อ, pg_get_constraintdef(con.oid) as รายละเอียด
from pg_constraint con
where con.conrelid = 'public.classroom_recurring_days'::regclass and con.contype in ('u', 'p')
union all
select 'ก่อนแก้ · index', i.indexname, i.indexdef
from pg_indexes i
where i.schemaname = 'public' and i.tablename = 'classroom_recurring_days';


-- ══════════════ ขั้นที่ 2) ลงมือแก้ ═══════════════════════════════════════════
do $$
declare
  v_type    char := null;   -- 'p' = ของเดิมเป็น primary key · 'u' = unique · null = ไม่มีของเดิม
  v_dropped int  := 0;
  v_dupes   int;
  v_nulls   int;
  v_fks     text;
  r         record;
begin
  ------------------------------------------------------------------
  -- 2.1 ห้ามมีแถวที่ไม่มีเวลาเริ่ม — กฎใหม่ใช้เวลาเริ่มเป็นตัวแยกคาบ ว่างแล้วแยกไม่ออก
  --     ใช้ ::text ครอบไว้ เผื่อคอลัมน์นี้เป็นชนิด "เวลา" ไม่ใช่ข้อความ (เทียบกับ '' ตรงๆ จะพัง)
  ------------------------------------------------------------------
  select count(*) into v_nulls
  from public.classroom_recurring_days
  where start_time is null or btrim(start_time::text) = '';
  if v_nulls > 0 then
    raise exception E'🛑 หยุดก่อน: มี % แถวที่ไม่มีเวลาเริ่ม (start_time ว่าง)\nยังไม่มีอะไรถูกเปลี่ยน — ส่งภาพนี้ให้ Lin/AI ดูก่อน', v_nulls;
  end if;

  ------------------------------------------------------------------
  -- 2.2 ห้ามมีแถวซ้ำสนิท (token+weekday+start_time เหมือนกันเป๊ะ)
  --     ⚠️ ไม่ลบให้อัตโนมัติ — เพราะแต่ละแถวอาจถือ calendar_event_id คนละอัน
  --        ลบมั่วไปหนึ่งแถว = ทำคาบกำพร้าเพิ่มเอง ซึ่งคือบั๊กที่กำลังแก้อยู่พอดี
  ------------------------------------------------------------------
  select count(*) into v_dupes from (
    select token, weekday, start_time
    from public.classroom_recurring_days
    group by token, weekday, start_time having count(*) > 1
  ) t;
  if v_dupes > 0 then
    raise exception E'🛑 หยุดก่อน: พบแถวซ้ำสนิท % กลุ่ม\nยังไม่มีอะไรถูกเปลี่ยน — แต่ละแถวอาจผูกกับคาบใน Calendar คนละอัน\nส่งภาพนี้ให้ Lin/AI ดูก่อน อย่าเพิ่งลบเอง', v_dupes;
  end if;

  ------------------------------------------------------------------
  -- 2.3 ห้ามมีตารางอื่นอ้างอิงกฎเก่าอยู่ (foreign key) — ถ้ามี ลบกฎเก่าไม่ได้
  --     ดักไว้เองเพื่อให้ได้ข้อความที่อ่านรู้เรื่อง แทน error ดิบของ Postgres
  ------------------------------------------------------------------
  select string_agg(con.conname || ' (จากตาราง ' || cl.relname || ')', ', ')
    into v_fks
  from pg_constraint con
  join pg_class cl on cl.oid = con.conrelid
  where con.contype = 'f' and con.confrelid = 'public.classroom_recurring_days'::regclass;
  if v_fks is not null then
    raise exception E'🛑 หยุดก่อน: มีตารางอื่นผูกอยู่กับกฎเก่า → %\nยังไม่มีอะไรถูกเปลี่ยน — ส่งภาพนี้ให้ Lin/AI ดูก่อน', v_fks;
  end if;

  ------------------------------------------------------------------
  -- 2.4 ลบกฎเก่าที่คุมแค่ (token, weekday) — วนลบทุกอันที่เจอ
  --     ⚠️ ห้ามใช้ limit 1: ตารางมีทั้ง primary key และ unique ซ้ำซ้อนกันบนคอลัมน์เดียวกันได้
  --        ถ้าลบแค่อันเดียว อีกอันจะยังบล็อกอยู่ แต่โค้ดจะขึ้นว่า "สำเร็จ" = หลอกตัวเอง
  ------------------------------------------------------------------
  for r in
    select con.conname, con.contype
    from pg_constraint con
    where con.conrelid = 'public.classroom_recurring_days'::regclass
      and con.contype in ('u', 'p')
      and (
        select array_agg(att.attname::text order by att.attname)
        from unnest(con.conkey) k
        join pg_attribute att on att.attrelid = con.conrelid and att.attnum = k
      ) = array['token', 'weekday']
  loop
    if r.contype = 'p' then v_type := 'p'; elsif v_type is null then v_type := 'u'; end if;
    execute format('alter table public.classroom_recurring_days drop constraint %I', r.conname);
    v_dropped := v_dropped + 1;
    raise notice '🗑️ ลบกฎเก่า % (ชนิด %) ทิ้งแล้ว', r.conname, case r.contype when 'p' then 'primary key' else 'unique' end;
  end loop;
  if v_dropped = 0 then
    raise notice 'ℹ️ ไม่มีกฎเก่าที่คุมแค่ (token, weekday) — ข้ามขั้นตอนลบ';
  end if;

  ------------------------------------------------------------------
  -- 2.5 ⚠️ จุดที่พลาดง่ายมาก: unique อาจไม่ได้อยู่ในรูป "กฎ (constraint)" แต่เป็น "index" เปล่าๆ
  --     ถ้าเหลือ index แบบนั้นไว้ การเพิ่มคาบที่ 2 ของวันเดียวกันจะยังพัง (unique violation)
  --     ทั้งที่กฎใหม่ถูกต้องแล้ว → ต้องกวาด index ที่คุมแค่ (token, weekday) ออกด้วย
  --     เงื่อนไขกันลบผิดตัว: ข้าม index ที่เป็นสูตรคำนวณ (indkey มีเลข 0) และ index แบบมีเงื่อนไข
  ------------------------------------------------------------------
  for r in
    select c.relname as idxname
    from pg_index x
    join pg_class c on c.oid = x.indexrelid
    where x.indrelid = 'public.classroom_recurring_days'::regclass
      and x.indisunique
      and x.indpred is null                                              -- ไม่ใช่ index แบบมีเงื่อนไข
      and not exists (select 1 from pg_constraint con where con.conindid = x.indexrelid)
      and 0 <> all(string_to_array(x.indkey::text, ' ')::int[])          -- ไม่ใช่ index จากสูตรคำนวณ
      -- indkey เป็นชนิด int2vector แปลงเป็น array ตรงๆ ไม่ได้ทุกเวอร์ชัน
      -- → แปลงผ่าน text (int2vector พิมพ์ออกมาเป็นตัวเลขคั่นช่องว่าง) ใช้ได้ทุกเวอร์ชัน
      and (
        select array_agg(att.attname::text order by att.attname)
        from unnest(string_to_array(x.indkey::text, ' ')::int[]) k
        join pg_attribute att on att.attrelid = x.indrelid and att.attnum = k
      ) = array['token', 'weekday']
  loop
    execute format('drop index public.%I', r.idxname);
    raise notice '🗑️ ลบ unique index เก่า % ทิ้งแล้ว', r.idxname;
  end loop;

  ------------------------------------------------------------------
  -- 2.6 สร้างกฎใหม่ (token, weekday, start_time)
  ------------------------------------------------------------------
  if not exists (
    select 1 from pg_constraint con
    where con.conrelid = 'public.classroom_recurring_days'::regclass
      and con.contype in ('u', 'p')
      and (
        select array_agg(att.attname::text order by att.attname)
        from unnest(con.conkey) k
        join pg_attribute att on att.attrelid = con.conrelid and att.attnum = k
      ) = array['start_time', 'token', 'weekday']
  ) then
    if v_type = 'p' then
      -- ของเดิมเป็น primary key → ของใหม่ก็ทำเป็น primary key ให้เหมือนเดิม
      -- (primary key ห้ามมีค่าว่าง — เช็คไปแล้วในข้อ 2.1)
      alter table public.classroom_recurring_days alter column start_time set not null;
      alter table public.classroom_recurring_days
        add constraint classroom_recurring_days_pkey primary key (token, weekday, start_time);
      raise notice '✅ สร้าง primary key ใหม่แล้ว: (token, weekday, start_time)';
    else
      alter table public.classroom_recurring_days
        add constraint classroom_recurring_days_token_weekday_start_key
        unique (token, weekday, start_time);
      raise notice '✅ สร้างกฎใหม่แล้ว: unique (token, weekday, start_time)';
    end if;
  else
    raise notice '✅ มีกฎใหม่อยู่แล้ว — ข้าม';
  end if;
end $$;


-- ══════════════ ขั้นที่ 3) ตรวจผล (ตัวตัดสินว่าสำเร็จจริงหรือไม่) ══════════════
-- ✅ ต้องเห็นบรรทัดที่มีชื่อครบ 3 ชื่อ: (token, weekday, start_time)
-- 🛑 ต้อง "ไม่เห็น" บรรทัดไหนที่มีแค่ 2 ชื่อ: (token, weekday) อีกแล้ว
select 'หลังแก้ · กฎ' as ประเภท, con.conname as ชื่อ, pg_get_constraintdef(con.oid) as รายละเอียด
from pg_constraint con
where con.conrelid = 'public.classroom_recurring_days'::regclass and con.contype in ('u', 'p')
union all
select 'หลังแก้ · index', i.indexname, i.indexdef
from pg_indexes i
where i.schemaname = 'public' and i.tablename = 'classroom_recurring_days';
