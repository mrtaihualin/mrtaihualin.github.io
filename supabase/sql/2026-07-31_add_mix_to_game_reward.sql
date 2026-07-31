-- ════════════════════════════════════════════════════════════
-- เพิ่มเกม "mix" (綜合遊戲/mix.html) เข้าไปในระบบแต้มแจ้งปัญหา/รีวิว (game_reward_events)
-- สร้าง 2026-07-31 — รันครั้งเดียวใน Supabase Dashboard → SQL Editor
-- ต้องรันคู่กับการ deploy ฟังก์ชัน game-reward ใหม่ (มี "mix" ใน VALID_GAMES แล้วในไฟล์
-- supabase/functions/game-reward/index.ts) ไม่งั้นแม้ SQL นี้รันผ่าน ฟังก์ชันเก่าก็ยังปฏิเสธ 'mix' อยู่ดี
--
-- หาชื่อ constraint จริงเองอัตโนมัติ (กันกรณีชื่อไม่ตรงกับที่คาดไว้ "game_reward_events_game_check")
-- แล้วลบของเดิมทิ้ง สร้างใหม่โดยเพิ่ม 'mix' เข้าไปในลิสต์ที่อนุญาต
-- ════════════════════════════════════════════════════════════
do $$
declare
  cname text;
begin
  select conname into cname
  from pg_constraint
  where conrelid = 'public.game_reward_events'::regclass
    and pg_get_constraintdef(oid) ilike '%game%'
    and pg_get_constraintdef(oid) ilike '%typing%';

  if cname is not null then
    execute format('alter table public.game_reward_events drop constraint %I', cname);
  end if;
end $$;

alter table public.game_reward_events
  add constraint game_reward_events_game_check
  check (game in ('typing','reading','lego','word_order','tone_finder','mix'));

-- ── เช็กหลังรัน: ต้องเห็นแถวนี้ มี 'mix' อยู่ในเงื่อนไขด้วย ──
-- select conname, pg_get_constraintdef(oid) from pg_constraint
--   where conrelid = 'public.game_reward_events'::regclass and contype = 'c';
