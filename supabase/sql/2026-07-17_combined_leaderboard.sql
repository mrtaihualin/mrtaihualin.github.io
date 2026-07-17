-- ════════════════════════════════════════════════════════════════════════
-- บอร์ดรวมทุกเกม (Combined leaderboard) — Lin 2026-07-17
-- รวมคะแนนจาก 5 เกมเป็นอันดับเดียว: tone_sessions (เกมเสียง) + reading_sessions
-- (เกมอ่าน/พิมพ์/เรียงคำ/เลโก้) โดย SUM(score) ต่อผู้เล่น
--
-- ✅ เพิ่มเข้าไปเฉยๆ — ไม่แตะฟังก์ชันบอร์ดแยกเดิม (leaderboard_* / reading_leaderboard_*)
--    บอร์ดแยกยังทำงานเหมือนเดิมทุกอย่าง
--
-- วิธีใช้: เปิด Supabase → SQL Editor → วางทั้งไฟล์นี้ → Run
-- ════════════════════════════════════════════════════════════════════════

-- ── รายสัปดาห์ (รีเซ็ตทุกวันจันทร์ 00:00) ──────────────────────────────
create or replace function combined_leaderboard_weekly()
returns table (
  user_id     uuid,
  nickname    text,
  avatar      text,
  badge_id    text,
  total_score bigint,
  games       bigint
)
language sql
security definer
set search_path = public
as $$
  with unioned as (
    select user_id, score, created_at from tone_sessions
    union all
    select user_id, score, created_at from reading_sessions
  ),
  agg as (
    select user_id,
           coalesce(sum(score), 0)::bigint as total_score,
           count(*)::bigint                as games
    from unioned
    where created_at >= date_trunc('week', now())   -- จันทร์ 00:00 = เริ่มสัปดาห์ (ตรงกับ 每週一重置)
    group by user_id
  )
  select a.user_id,
         p.nickname,
         null::text as avatar,     -- ⚠️ ถ้าตาราง profiles มีคอลัมน์ avatar/badge_id จริง เปลี่ยนเป็น p.avatar / p.badge_id ได้
         null::text as badge_id,
         a.total_score,
         a.games
  from agg a
  left join profiles p on p.user_id = a.user_id
  where a.total_score > 0
    and a.user_id not in (select id from auth.users where email = 'mr.taihualin@gmail.com')  -- ไม่นับแอดมิน
  order by a.total_score desc
  limit 100;
$$;

-- ── ตลอดกาล (👑 總排行) ─────────────────────────────────────────────────
create or replace function combined_leaderboard_alltime()
returns table (
  user_id     uuid,
  nickname    text,
  avatar      text,
  badge_id    text,
  total_score bigint,
  games       bigint
)
language sql
security definer
set search_path = public
as $$
  with unioned as (
    select user_id, score from tone_sessions
    union all
    select user_id, score from reading_sessions
  ),
  agg as (
    select user_id,
           coalesce(sum(score), 0)::bigint as total_score,
           count(*)::bigint                as games
    from unioned
    group by user_id
  )
  select a.user_id,
         p.nickname,
         null::text as avatar,
         null::text as badge_id,
         a.total_score,
         a.games
  from agg a
  left join profiles p on p.user_id = a.user_id
  where a.total_score > 0
    and a.user_id not in (select id from auth.users where email = 'mr.taihualin@gmail.com')
  order by a.total_score desc
  limit 100;
$$;

-- ให้หน้าเว็บ (anon/authenticated) เรียกได้
grant execute on function combined_leaderboard_weekly()  to anon, authenticated;
grant execute on function combined_leaderboard_alltime() to anon, authenticated;
