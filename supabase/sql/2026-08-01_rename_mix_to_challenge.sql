-- ════════════════════════════════════════════════════════════
-- เปลี่ยนชื่อเกม "mix" → "challenge" ในระบบแต้มแจ้งปัญหา/รีวิว (game_reward_events)
-- สร้าง 2026-08-01 — รันครั้งเดียวใน Supabase Dashboard → SQL Editor
-- เหตุผล: mix.html เปลี่ยนชื่อไฟล์เป็น games-challenge.html (Lin สั่ง 2026-08-01)
--   ชื่อ id ภายในระบบเปลี่ยนจาก 'mix' เป็น 'challenge' ไปด้วย (ยังไม่มีใครเล่นจริง เปลี่ยนได้ปลอดภัย)
-- ต้องรันคู่กับการ deploy ฟังก์ชัน game-reward ใหม่ (มี "challenge" ใน VALID_GAMES แล้วในไฟล์
-- supabase/functions/game-reward/index.ts) ไม่งั้นแม้ SQL นี้รันผ่าน ฟังก์ชันเก่าก็ยังปฏิเสธ 'challenge' อยู่ดี
--
-- ทำงานได้ปลอดภัยไม่ว่าจะเคยรัน 2026-07-31_add_mix_to_game_reward.sql มาก่อนหรือไม่
-- (หาชื่อ constraint จริงเองอัตโนมัติ แล้วลบของเดิมทิ้ง สร้างใหม่โดยใช้ 'challenge' แทน 'mix')
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
  check (game in ('typing','reading','lego','word_order','tone_finder','challenge'));

-- ถ้ามีแถวเก่าที่เคยบันทึกด้วย game='mix' อยู่แล้ว (ไม่น่ามี เพราะยังไม่เคยโปรโมท) ให้เปลี่ยนตามไปด้วย
-- กันแถวเก่าเหลือค้างเป็นค่าที่ constraint ใหม่ไม่ยอมรับ (รันได้แม้ไม่มีแถวแบบนี้เลย ไม่ error)
update public.game_reward_events set game = 'challenge' where game = 'mix';

-- ── เช็กหลังรัน: ต้องเห็นแถวนี้ มี 'challenge' อยู่ในเงื่อนไข ไม่มี 'mix' หลงเหลือ ──
-- select conname, pg_get_constraintdef(oid) from pg_constraint
--   where conrelid = 'public.game_reward_events'::regclass and contype = 'c';
-- select count(*) from public.game_reward_events where game = 'mix'; -- ต้องเป็น 0
