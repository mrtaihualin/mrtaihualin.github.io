-- ════════════════════════════════════════════════════════════════════════════
-- 2026-08-08 — เพดานคะแนนกันปลอมกระดานผู้นำ: reading_sessions + tone_sessions
-- (DRAFT — ยังไม่ได้รัน · ห้ามรันจนกว่า Lin ตรวจตัวเลขแล้วอนุมัติ)
-- ────────────────────────────────────────────────────────────────────────────
-- ปัญหาที่แก้: policy INSERT ของ 2 ตารางนี้เช็คแค่ auth.uid() = user_id
--   (ดู supabase/schema/2026-08-07_02_policies.sql บรรทัด 183-186 "rs own insert"
--   และบรรทัด 212-216 "insert own sessions") — ไม่มีการเช็คค่า score/games/total เลย
--   ผู้เล่นที่ล็อกอินแล้วยิง Supabase REST API ตรงๆ (ข้ามหน้าเกมไปเลย) ใส่คะแนนเท่าไหร่
--   ก็ได้ แล้วขึ้นกระดานผู้นำทันที (combined_leaderboard_weekly/alltime ใน
--   supabase/sql/2026-07-17_combined_leaderboard.sql และ leaderboard_alltime/
--   reading_leaderboard_alltime ใน supabase/schema/2026-08-07_04_functions_recovered.sql
--   บรรทัด ~176-256 ทำ SUM(score) ตรงจาก 2 ตารางนี้) — ยืนยันแล้วว่าไม่กระทบ
--   star_ledger/game_reward_points (ตารางนั้น service_role เขียนได้ทางเดียว) จึงเป็นแค่
--   "โกงหน้าตากระดานผู้นำ" ไม่ใช่ช่องโหว่แต้ม/เงินจริง แต่ก็ยังเป็นเรื่องจริงที่ต้องปิด
--
-- 🔎 พบระหว่างตรวจ (สำคัญ — เปลี่ยนขอบเขตงานจากที่คิดไว้แต่แรก):
--   ตาราง 2 ตารางนี้ "มี" CHECK constraint ระดับตารางอยู่แล้วบางส่วน (ดู
--   supabase/schema/2026-08-07_01_tables_and_constraints.sql):
--     · reading_sessions_score_sane: score >= 0 AND score <= 5000   (บรรทัด 821)
--     · tone_sessions_score_sane:    score >= 0 AND score <= 500000 (บรรทัด 861)
--   CHECK constraint ระดับตาราง "บังคับเสมอไม่ว่า RLS policy จะเขียนว่าอะไร" (ข้าม RLS
--   ไม่ได้เลยแม้แต่ superuser) ดังนั้น "score=999999" ตามตัวอย่างในโจทย์เดิม จะถูกตีกลับ
--   อยู่แล้วโดย CHECK ทั้ง 2 ตัวนี้ (999999 > 5000 และ > 500000) — แต่:
--     (1) tone_sessions ยังเปิดช่องให้ใส่ค่าได้ถึง 500,000 ซึ่งหลวมกว่าคะแนนจริงสูงสุด
--         ที่เกมจะให้ได้ ~800 เท่า (ดูตัวเลขจริงด้านล่าง) — ยังปลอมคะแนนสูงลิ่วได้สบายๆ
--     (2) reading_sessions.games และ tone_sessions.total "ไม่มี" CHECK เลยแม้แต่ตัวเดียว
--     (3) แม้ตั้งเพดานต่อแถวถูกต้องแล้ว ผู้เล่นยังสแปม insert หลายแถวรัวๆ (แต่ละแถวคะแนน
--         เท่าเพดานพอดี) เพื่อดัน SUM(score) ขึ้นกระดานได้อยู่ดี — ต้องมีเพดาน "จำนวนแถวต่อ
--         เวลา" กันไว้ด้วย ไม่ใช่กันแค่ค่าต่อแถว
--   ไฟล์นี้จึงทำ 3 อย่าง: (A) จำกัด tone_sessions.score ให้แคบลง (B) เพิ่ม CHECK ที่ขาด
--   ให้ reading_sessions.games + tone_sessions.total (C) เพิ่ม rate-limit ต่อผู้ใช้ต่อเวลา
--   ผ่าน WITH CHECK ของ policy (ชั้นป้องกันซ้อน — CHECK ระดับตารางคือด่านหลักที่ห้ามผ่านได้
--   อยู่แล้ว ส่วน WITH CHECK ในนี้คือด่านรอง/บันทึกกฎธุรกิจไว้ในที่เดียวกับ policy ตามธรรมเนียม
--   เดิมของ repo เช่น "insert own reward events" ใน policies.sql บรรทัด 156)
--
-- 🧮 ที่มาตัวเลข (คำนวณจากโค้ดเกมจริง ไม่ได้เดา — อ้างอิง js/games/*.js):
--   reading_sessions.score (games='reading'/'typing'/'lego'/'word_order'/'challenge'):
--     · SYL_SCORE (คะแนนดิบ/พยางค์) = [10,7,4,1] → สูงสุด 10  (reading-game-app.js:207)
--     · GOLDEN_WORD_MULT = 2  (reading-game-app.js:204, typing-game-app.js:189)
--     · rgComboMult(streak) สูงสุด ×3 เมื่อ streak≥8  (reading-game-app.js:199)
--     · HIGH_RAW_BONUS_PER_SYL = 2 ต่อพยางค์เกิน 7 (ประโยค高ยาว)  (reading-game-app.js:213-214)
--     · ROUND_SIZE_BY_LEVEL: 初/中=5, 高=1 (reading) หรือ 高=3 (typing/word_order)
--       (reading-game-app.js:193, typing-game-app.js:179, word-order-app.js:21)
--     · ROUND_COMPLETE_BONUS+ROUND_PERFECT_BONUS = 20+50 = 70 ต่อรอบ (reading-game-app.js:201-202)
--     · LEVEL_WEIGHT คูณทั้งรอบตอนจบ: 初=1, 中=1.5, 高=2 (reading-game-app.js:197)
--     · เกมรวม (games-challenge-app.js): ROUND_WORDS=5 คำ ×3 stage = 15 การ์ด/รอบ, LADDER สูงสุด
--       10, GOLDEN_MULT=2, combo สูงสุด×3 → ต่อการ์ดสูงสุด ~60 (games-challenge-app.js:35-39,471-483)
--     · คำนวณเคสสูงสุดจริง (高 ประโยคยาว ~30 พยางค์ ทองคำ ไม่มีคอมโบเพราะรอบมีแค่ 1 คำ):
--       pts=10+2×23=56 → golden×2=112 → +roundBonus70=182 → ×LEVEL_WEIGHT2 = 364
--     · เกมพิมพ์ 高 (3 ประโยคยาว/รอบ ได้คอมโบเพราะรอบมี 3 คำ): ~168/ประโยค ×3 + 70 = 574 → ×2 = 1148
--     · เกมรวม (15 การ์ด, ทองสุดขั้ว+คอมโบสุดขั้วทุกใบ ซึ่งเล่นจริงแทบเป็นไปไม่ได้): 15×60=900
--     · เพดานที่คำนวณได้จริงสูงสุด (ทุกเกม) อยู่ที่ ~1,150 → CHECK เดิม 0-5000 มี headroom
--       ~4.3 เท่าอยู่แล้ว **จึงไม่แตะ CHECK ตัวนี้** แค่เพิ่มการเช็คใน RLS policy ให้ตรงกัน
--     · reading_sessions.games: ทุกจุดเรียก saveScore(...) ในโค้ดจริงส่ง literal 1 เสมอ
--       (reading-game-app.js:1167, typing-game-app.js:1069, lego-game-app.js:546,
--       word-order-app.js:1095, games-challenge-app.js:1239) ไม่มี path ไหนส่งค่าอื่นเลย
--       → ตั้งเพดาน 1-10 ให้ headroom 10 เท่า เผื่ออนาคตมีฟีเจอร์ batch-save (ยังไม่มีจริง)
--
--   tone_sessions (tone-finder-game.js):
--     · TF_WORDSCORE.LADDER สูงสุด 10 (tone-finder-game.js:383)
--     · GOLDEN_WORD_MULT=2, comboMultiplier สูงสุด ×3 (tone-finder-game.js:331-337)
--     · รอบคำเดี่ยว (初/中): _startRandom5() สุ่ม 5 คำเสมอ (tone-finder-game.js:3683-3685)
--       → คอมโบสูงสุดที่ทำได้จริงในรอบ 5 คำ = comboMultiplier(5) = ×2 (ไม่ถึง×3 ที่ต้อง streak 8)
--     · รอบประโยค高: startAdvSentence() ใช้ coreWords.length ของประโยคเดียว (คำในประโยค ไม่ใช่
--       พยางค์) เป็น session.words — ประโยค高級ทั่วไปมีคำน้อยกว่า 5 คำเดี่ยวเสมอในทางปฏิบัติ
--       (tone-finder-game.js:3768-3795)
--     · sessionBonus = SET_COMPLETE_BONUS(20)+SET_PERFECT_BONUS(50) = 70 (tone-finder-game.js:309-311,360-364)
--     · LEVEL_WEIGHT: 1→1, 2→1.5, 3→2 (tone-finder-game.js:311)
--     · เคสสูงสุดจริง (5 คำ ทองทุกคำ + คอมโบเต็มที่ทำได้จริง ×2, level 中 weight 1.5):
--       ต่อคำ ~10×2×2=40 → 5×40=200 → +70=270 → ×1.5 = 405
--     · tone_sessions.total = จำนวนคำ/ประโยคที่ตอบในรอบนั้น = session.words.length เสมอ
--       ปกติ =5 (คำเดี่ยว) หรือน้อยกว่านั้นมาก (ประโยค高) — ไม่เคยเกินหลักสิบในโค้ดปัจจุบัน
--
-- ⚠️ เพดานด้านล่างมี headroom ให้มากกว่าที่คำนวณได้จริงหลายเท่าโดยตั้งใจ (กันเคสขอบที่ไล่โค้ด
--   ไม่ครบ 100% เช่น SRS_REVIEW_BONUS เล็กๆ ที่ไม่ได้รวมในเลขข้างบน) — **Lin ต้องตรวจตัวเลข
--   ก่อนรันเสมอ** ถ้าตั้งแคบไป จะบล็อกคะแนนของผู้เล่นจริงที่เล่นเก่งมากๆ (false positive =
--   insert ถูกปฏิเสธ ผู้เล่นเห็นข้อความ "分數儲存失敗" ทั้งที่เล่นด้วยความสุจริต)
--
-- 🔒 rl_counters/rl_check (phase5-rate-limit.sql) "ไม่ได้เอามาใช้" ในไฟล์นี้ เพราะถูกออกแบบ
--   ให้เรียกได้เฉพาะฝั่งเซิร์ฟเวอร์เท่านั้น (revoke execute from anon, authenticated ตั้งแต่ต้น
--   — เรียกผ่าน admin.rpc() จาก Edge Function เท่านั้น) ไม่เหมาะเอามาเรียกตรงจาก RLS WITH CHECK
--   ที่ client (supabase-js บนเบราว์เซอร์) ยิง insert ใส่ 2 ตารางนี้ตรงๆ — ใช้
--   game_content_rl_check (sql/2026-08-02_game_content_schema.sql) แทน ซึ่งเป็นกลไกเดียวกับที่
--   sql/2026-08-08_anon_spam_protection.sql เพิ่งใช้ไปกับ anon_game_events/leads (ห่อด้วยฟังก์ชัน
--   ใหม่ SECURITY DEFINER ที่ grant execute ให้ anon/authenticated แล้วเรียก game_content_rl_check
--   ข้างในอีกที — ฟังก์ชันห่อรันในสิทธิ์เจ้าของ (owner) จึงเรียกฟังก์ชันที่ revoke จาก client ได้)
--
-- ⚠️ ไม่มีค่าลับในไฟล์นี้ · รันซ้ำได้บางส่วน (create or replace function, drop policy if exists)
--   แต่ส่วน [B] ที่แก้ CHECK constraint ("drop constraint if exists" + "add constraint") ก็รันซ้ำได้
-- ════════════════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════════════════════
-- [PRECHECK] รันก่อนเสมอ (read-only) — เช็คว่ามีแถวเก่าที่จะ "พัง" ถ้าใส่เพดานใหม่ไหม
--   ถ้าได้ตัวเลข > 0 แถวไหน ห้ามรัน [B] ต่อจนกว่าจะรู้ว่าแถวนั้นเป็นของจริงหรือของปลอมที่เจอไปแล้ว
--   (ถ้าเป็นของปลอมที่เคยหลุดมา ต้องลบทิ้งก่อน — อย่าลืมเช็คว่ากระทบอันดับ/ดาวที่แจกไปแล้วหรือไม่)
-- ════════════════════════════════════════════════════════════════════════════
select count(*) as แถวจะพังถ้าลดเพดาน_tone_score
from public.tone_sessions
where score is not null and (score < 0 or score > 3000);

select count(*) as แถวจะพังถ้าเพิ่มเพดาน_tone_total
from public.tone_sessions
where total is not null and (total < 0 or total > 100);

select count(*) as แถวจะพังถ้าเพิ่มเพดาน_reading_games
from public.reading_sessions
where games < 1 or games > 10;

-- ════════════════════════════════════════════════════════════════════════════
-- [A] ฟังก์ชันช่วย rate-limit — ต้องรันก่อน [C] (policy)
-- ════════════════════════════════════════════════════════════════════════════

-- ≤ 30 แถว ต่อ user_id ต่อ 10 นาที (600 วินาที) — เลขเดียวกับ anon_game_events_rate_ok
-- (sql/2026-08-08_anon_spam_protection.sql) รอบเล่นจริง 1 รอบใช้เวลาอย่างน้อยหลักสิบวินาที
-- 30 แถว/10นาที = insert ทุก 20 วินาทีติดต่อกันตลอด 10 นาที ซึ่งเกินกว่าคนเล่นจริงจะทำได้
-- อยู่แล้ว แต่ยังกันสคริปต์ยิงรัวเป็นร้อยเป็นพันแถวได้จริง
create or replace function public.reading_sessions_rate_ok(p_user uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user is null then return false; end if;
  return public.game_content_rl_check('reading_sess:' || p_user::text, 30, 600);
end;
$$;
grant execute on function public.reading_sessions_rate_ok(uuid) to anon, authenticated;

create or replace function public.tone_sessions_rate_ok(p_user uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user is null then return false; end if;
  return public.game_content_rl_check('tone_sess:' || p_user::text, 30, 600);
end;
$$;
grant execute on function public.tone_sessions_rate_ok(uuid) to anon, authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- [B] CHECK constraint ระดับตาราง — ด่านหลัก บังคับเสมอไม่ว่า policy จะเขียนว่าอะไร
--   (ต้องรัน [PRECHECK] ก่อนแล้วยืนยันว่า 0 แถวทั้ง 3 query ก่อนรันส่วนนี้)
-- ════════════════════════════════════════════════════════════════════════════

-- tone_sessions.score: ของเดิม 0-500000 หลวมเกินจริง ~800 เท่า (เคสสูงสุดจริงคำนวณได้ ~405)
-- แคบลงเหลือ 0-3000 (headroom ~7.4 เท่าจากเคสสูงสุดที่คำนวณได้)
alter table public.tone_sessions drop constraint if exists tone_sessions_score_sane;
alter table public.tone_sessions add constraint tone_sessions_score_sane check (score >= 0 and score <= 3000);

-- tone_sessions.total: ไม่เคยมี CHECK มาก่อนเลย — จำนวนคำ/ประโยคต่อรอบจริงๆ ไม่เกิน 5 ในโค้ดปัจจุบัน
-- ตั้ง 0-100 ให้ headroom หลายสิบเท่า เผื่ออนาคตเปลี่ยนจำนวนคำ/รอบ
alter table public.tone_sessions drop constraint if exists tone_sessions_total_sane;
alter table public.tone_sessions add constraint tone_sessions_total_sane check (total >= 0 and total <= 100);

-- reading_sessions.score: ของเดิม 0-5000 คำนวณแล้วมี headroom ~4.3 เท่าจากเคสสูงสุดจริง (~1150)
-- อยู่แล้ว — ไม่แตะ ไม่ต้อง drop/add ใหม่

-- reading_sessions.games: ไม่เคยมี CHECK มาก่อนเลย — โค้ดจริงส่ง literal 1 เสมอทุก path
-- ตั้ง 1-10 ให้ headroom 10 เท่า
alter table public.reading_sessions drop constraint if exists reading_sessions_games_sane;
alter table public.reading_sessions add constraint reading_sessions_games_sane check (games >= 1 and games <= 10);

-- ════════════════════════════════════════════════════════════════════════════
-- [C] แก้ policy — เพิ่มด่านรอง (bound + rate-limit) เข้า WITH CHECK เดิม
--   (ด่านหลักคือ [B] ด้านบนซึ่งบังคับได้แม้ policy นี้เขียนผิด — ชั้นนี้กันซ้อน + สแปมแถว)
-- ════════════════════════════════════════════════════════════════════════════

-- ── reading_sessions ── ("rs own insert" เดิม to public — คงบทบาทเดิมไว้ ไม่เปลี่ยน)
drop policy if exists "rs own insert" on public.reading_sessions;
create policy "rs own insert"
  on public.reading_sessions
  as permissive
  for insert
  to public
  with check (
    auth.uid() = user_id
    and score between 0 and 5000
    and games between 1 and 10
    and public.reading_sessions_rate_ok(user_id)
  );

-- ── tone_sessions ── ("insert own sessions" เดิม to authenticated — คงบทบาทเดิมไว้)
drop policy if exists "insert own sessions" on public.tone_sessions;
create policy "insert own sessions"
  on public.tone_sessions
  as permissive
  for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and (score is null or score between 0 and 3000)
    and (total is null or total between 0 and 100)
    and public.tone_sessions_rate_ok(user_id)
  );

-- ════════════════════════════════════════════════════════════════════════════
-- [D] ตรวจว่าสำเร็จจริง — รันหลัง [A]+[B]+[C] เสมอ
-- ════════════════════════════════════════════════════════════════════════════

-- ✅ ต้องได้ 2 แถว, มีกี่เวอร์ชัน = 1 ทุกแถว, security_definer = true ทุกแถว
select p.proname                                 as ฟังก์ชัน,
       count(*) over (partition by p.proname)    as มีกี่เวอร์ชัน,
       pg_get_function_identity_arguments(p.oid) as ช่องรับค่า,
       p.prosecdef                               as security_definer
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('reading_sessions_rate_ok', 'tone_sessions_rate_ok');

-- ✅ ต้องเห็น anon และ authenticated มีสิทธิ์ execute ทั้งคู่ ทั้ง 2 ฟังก์ชัน
select 'reading_sessions_rate_ok' as ฟังก์ชัน, 'anon' as role,
       has_function_privilege('anon', 'public.reading_sessions_rate_ok(uuid)', 'execute') as execute_ได้
union all
select 'reading_sessions_rate_ok', 'authenticated',
       has_function_privilege('authenticated', 'public.reading_sessions_rate_ok(uuid)', 'execute')
union all
select 'tone_sessions_rate_ok', 'anon',
       has_function_privilege('anon', 'public.tone_sessions_rate_ok(uuid)', 'execute')
union all
select 'tone_sessions_rate_ok', 'authenticated',
       has_function_privilege('authenticated', 'public.tone_sessions_rate_ok(uuid)', 'execute');

-- ✅ ต้องได้ 1 แถวต่อตาราง และ with_check ต้องมีคำว่า 'rate_ok' อยู่ในนั้น (ยืนยันว่าผูกจริง)
select tablename, policyname, cmd, with_check
from pg_policies
where tablename in ('reading_sessions', 'tone_sessions')
  and cmd = 'INSERT';

-- ✅ ต้องเห็น CHECK constraint ครบ 4 ชื่อนี้ พร้อมนิยามที่ตรงกับตัวเลขด้านบน
select conname as ชื่อconstraint, pg_get_constraintdef(oid) as นิยาม
from pg_constraint
where conrelid in ('public.reading_sessions'::regclass, 'public.tone_sessions'::regclass)
  and contype = 'c'
  and conname in ('reading_sessions_score_sane', 'reading_sessions_games_sane',
                   'tone_sessions_score_sane', 'tone_sessions_total_sane');

-- ════════════════════════════════════════════════════════════════════════════
-- [E] ทางย้อนกลับ ถ้าต้องปลดฉุกเฉิน (ห้ามรันพร้อม [B]/[C] — เก็บไว้เผื่อใช้ทีหลังเท่านั้น)
-- ════════════════════════════════════════════════════════════════════════════
-- -- คืน policy เดิม (ไม่มีเพดาน/rate-limit เลย เหมือนก่อนแก้ไฟล์นี้)
-- drop policy if exists "rs own insert" on public.reading_sessions;
-- create policy "rs own insert" on public.reading_sessions
--   as permissive for insert to public with check ((auth.uid() = user_id));
--
-- drop policy if exists "insert own sessions" on public.tone_sessions;
-- create policy "insert own sessions" on public.tone_sessions
--   as permissive for insert to authenticated with check ((auth.uid() = user_id));
--
-- -- คืนเพดาน tone_sessions.score เป็นของเดิม (หลวม 0-500000) — ไม่แนะนำให้คืน แต่เก็บไว้เผื่อจำเป็นจริงๆ
-- alter table public.tone_sessions drop constraint if exists tone_sessions_score_sane;
-- alter table public.tone_sessions add constraint tone_sessions_score_sane check (score >= 0 and score <= 500000);
--
-- -- ลบ CHECK ที่เพิ่งเพิ่มใหม่ทิ้ง (กลับไปไม่มีเพดานเลยเหมือนเดิม)
-- alter table public.tone_sessions drop constraint if exists tone_sessions_total_sane;
-- alter table public.reading_sessions drop constraint if exists reading_sessions_games_sane;
-- ════════════════════════════════════════════════════════════════════════════
