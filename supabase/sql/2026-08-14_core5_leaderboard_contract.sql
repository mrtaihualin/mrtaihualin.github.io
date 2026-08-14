-- Core 5 leaderboard contract (SOURCE ONLY — Lin must review before running).
-- Aligns Tone/Reading/Listening/Typing/Word Order to Monday 00:00 Asia/Taipei,
-- filters the site-admin account, and gives the four reading_sessions games one RPC shape.

drop function if exists public.reading_leaderboard_weekly();
drop function if exists public.reading_leaderboard_alltime();

create or replace function public.reading_leaderboard_weekly(p_game text)
returns table(user_id uuid, nickname text, avatar text, badge_id text, total_score bigint, games bigint)
language sql
security definer
set search_path = public
as $$
  select s.user_id,
         coalesce(p.nickname, '(無暱稱)')::text,
         coalesce(p.avatar, '')::text,
         coalesce(p.badge_id, '')::text,
         sum(s.score)::bigint,
         count(*)::bigint
  from public.reading_sessions s
  left join public.profiles p on p.user_id = s.user_id
  where p_game in ('reading', 'listening', 'typing', 'word_order')
    and coalesce(s.game, 'reading') = p_game
    and s.created_at >= (date_trunc('week', timezone('Asia/Taipei', now())) at time zone 'Asia/Taipei')
    and not exists (
      select 1 from auth.users u
      where u.id = s.user_id and lower(u.email) = 'mr.taihualin@gmail.com'
    )
  group by s.user_id, p.nickname, p.avatar, p.badge_id
  order by total_score desc, games asc, s.user_id
  limit 100;
$$;

create or replace function public.reading_leaderboard_alltime(p_game text)
returns table(user_id uuid, nickname text, avatar text, badge_id text, total_score bigint, games bigint)
language sql
security definer
set search_path = public
as $$
  select s.user_id,
         coalesce(p.nickname, '(無暱稱)')::text,
         coalesce(p.avatar, '')::text,
         coalesce(p.badge_id, '')::text,
         sum(s.score)::bigint,
         count(*)::bigint
  from public.reading_sessions s
  left join public.profiles p on p.user_id = s.user_id
  where p_game in ('reading', 'listening', 'typing', 'word_order')
    and coalesce(s.game, 'reading') = p_game
    and not exists (
      select 1 from auth.users u
      where u.id = s.user_id and lower(u.email) = 'mr.taihualin@gmail.com'
    )
  group by s.user_id, p.nickname, p.avatar, p.badge_id
  order by total_score desc, games asc, s.user_id
  limit 100;
$$;

create or replace function public.leaderboard_weekly()
returns table(user_id uuid, nickname text, avatar text, badge_id text, total_score bigint, games bigint)
language sql
security definer
set search_path = public
as $$
  select s.user_id,
         coalesce(p.nickname, '(無暱稱)')::text,
         coalesce(p.avatar, '')::text,
         coalesce(p.badge_id, '')::text,
         sum(s.score)::bigint,
         count(*)::bigint
  from public.tone_sessions s
  left join public.profiles p on p.user_id = s.user_id
  where s.created_at >= (date_trunc('week', timezone('Asia/Taipei', now())) at time zone 'Asia/Taipei')
    and not exists (
      select 1 from auth.users u
      where u.id = s.user_id and lower(u.email) = 'mr.taihualin@gmail.com'
    )
  group by s.user_id, p.nickname, p.avatar, p.badge_id
  order by total_score desc, games asc, s.user_id
  limit 100;
$$;

create or replace function public.leaderboard_alltime()
returns table(user_id uuid, nickname text, avatar text, badge_id text, total_score bigint, games bigint)
language sql
security definer
set search_path = public
as $$
  select s.user_id,
         coalesce(p.nickname, '(無暱稱)')::text,
         coalesce(p.avatar, '')::text,
         coalesce(p.badge_id, '')::text,
         sum(s.score)::bigint,
         count(*)::bigint
  from public.tone_sessions s
  left join public.profiles p on p.user_id = s.user_id
  where not exists (
    select 1 from auth.users u
    where u.id = s.user_id and lower(u.email) = 'mr.taihualin@gmail.com'
  )
  group by s.user_id, p.nickname, p.avatar, p.badge_id
  order by total_score desc, games asc, s.user_id
  limit 100;
$$;

revoke all on function public.reading_leaderboard_weekly(text) from public;
revoke all on function public.reading_leaderboard_alltime(text) from public;
revoke all on function public.leaderboard_weekly() from public;
revoke all on function public.leaderboard_alltime() from public;
grant execute on function public.reading_leaderboard_weekly(text) to anon, authenticated;
grant execute on function public.reading_leaderboard_alltime(text) to anon, authenticated;
grant execute on function public.leaderboard_weekly() to anon, authenticated;
grant execute on function public.leaderboard_alltime() to anon, authenticated;

-- Production verification after Lin runs this file:
-- select * from public.reading_leaderboard_weekly('listening') limit 5;
-- select * from public.reading_leaderboard_alltime('word_order') limit 5;
