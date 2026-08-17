-- P1-B-04 public Leaderboard nickname RECOVERY ONLY (SOURCE ONLY).
--
-- HIGH-RISK PRODUCTION BOUNDARY:
--   Do not run this file without Lin's exact approval for the target project and
--   this exact artifact hash. It is a recovery route for a failed nickname
--   rollout, not part of the normal rollout and not a Product change.
--
-- Required order after a failed rollout:
--   1) stop the rollout and preserve evidence;
--   2) restore the pre-nickname board/admin client and admin-player-accounts
--      Edge behavior from the approved recovery source bundle;
--   3) run this transaction once;
--   4) verify the four board RPC signatures/results and browser-role grants;
--   5) leave the additive identity/report tables in place, RLS-enabled and
--      unreachable by anon/authenticated until a separately approved recovery
--      forward. This file never drops those tables or deletes their rows.

begin;

-- Fail closed if this is not the exact post-rollout schema this recovery owns.
do $$
begin
  if to_regclass('public.game_score_submissions') is null
     or to_regclass('public.profiles') is null then
    raise exception 'NICKNAME_RECOVERY_BASE_SCORE_SCHEMA_MISSING';
  end if;
  if to_regclass('public.leaderboard_public_identities') is null
     or to_regclass('public.leaderboard_nickname_reports') is null then
    raise exception 'NICKNAME_RECOVERY_ADDITIVE_TABLES_MISSING';
  end if;
  if to_regprocedure('public.set_leaderboard_nickname(text)') is null
     or to_regprocedure('public.get_my_leaderboard_identity()') is null
     or to_regprocedure('public.report_leaderboard_nickname(uuid)') is null then
    raise exception 'NICKNAME_RECOVERY_ROLLOUT_RPC_MISSING';
  end if;
end;
$$;

-- Deactivate the nickname rollout API before restoring the prior board RPCs.
-- PUBLIC is included because PostgreSQL grants new-function EXECUTE to PUBLIC
-- by default unless default privileges were changed.
revoke execute on function public.normalize_leaderboard_nickname(text)
  from public, anon, authenticated;
revoke execute on function public.leaderboard_nickname_violation(text)
  from public, anon, authenticated;
revoke execute on function public.set_leaderboard_nickname(text)
  from public, anon, authenticated;
revoke execute on function public.get_my_leaderboard_identity()
  from public, anon, authenticated;
revoke execute on function public.report_leaderboard_nickname(uuid)
  from public, anon, authenticated;

-- Preserve the additive rows for evidence/recovery-forward, but make both
-- tables unreachable to browser roles. RLS remains enabled as defense in depth.
alter table public.leaderboard_public_identities enable row level security;
alter table public.leaderboard_nickname_reports enable row level security;
revoke all on table public.leaderboard_public_identities
  from public, anon, authenticated;
revoke all on table public.leaderboard_nickname_reports
  from public, anon, authenticated;

-- Restore the pre-nickname S29 board contract. These definitions intentionally
-- use the existing authoritative game_score_submissions table and private
-- profile nickname behavior that was live immediately before P1-B-04.
drop function if exists public.leaderboard_weekly();
drop function if exists public.leaderboard_alltime();
drop function if exists public.reading_leaderboard_weekly(text);
drop function if exists public.reading_leaderboard_alltime(text);

create function public.leaderboard_weekly()
returns table(nickname text, avatar text, badge_id text, total_score bigint, games bigint, is_current_user boolean)
language sql security definer set search_path = ''
as $$
  select coalesce(p.nickname, '(無暱稱)')::text,
         coalesce(p.avatar, '')::text,
         coalesce(p.badge_id, '')::text,
         sum(s.score)::bigint,
         count(*)::bigint,
         (s.user_id = auth.uid())::boolean
  from public.game_score_submissions s
  left join public.profiles p on p.user_id = s.user_id
  where s.game = 'tone'
    and s.created_at >= (date_trunc('week', timezone('Asia/Taipei', now())) at time zone 'Asia/Taipei')
    and not exists (
      select 1 from auth.users u
      where u.id = s.user_id and lower(u.email) = 'mr.taihualin@gmail.com'
    )
  group by s.user_id, p.nickname, p.avatar, p.badge_id
  order by sum(s.score) desc, count(*) asc, s.user_id
  limit 100;
$$;

create function public.leaderboard_alltime()
returns table(nickname text, avatar text, badge_id text, total_score bigint, games bigint, is_current_user boolean)
language sql security definer set search_path = ''
as $$
  select coalesce(p.nickname, '(無暱稱)')::text,
         coalesce(p.avatar, '')::text,
         coalesce(p.badge_id, '')::text,
         sum(s.score)::bigint,
         count(*)::bigint,
         (s.user_id = auth.uid())::boolean
  from public.game_score_submissions s
  left join public.profiles p on p.user_id = s.user_id
  where s.game = 'tone'
    and not exists (
      select 1 from auth.users u
      where u.id = s.user_id and lower(u.email) = 'mr.taihualin@gmail.com'
    )
  group by s.user_id, p.nickname, p.avatar, p.badge_id
  order by sum(s.score) desc, count(*) asc, s.user_id
  limit 100;
$$;

create function public.reading_leaderboard_weekly(p_game text)
returns table(nickname text, avatar text, badge_id text, total_score bigint, games bigint, is_current_user boolean)
language sql security definer set search_path = ''
as $$
  select coalesce(p.nickname, '(無暱稱)')::text,
         coalesce(p.avatar, '')::text,
         coalesce(p.badge_id, '')::text,
         sum(s.score)::bigint,
         count(*)::bigint,
         (s.user_id = auth.uid())::boolean
  from public.game_score_submissions s
  left join public.profiles p on p.user_id = s.user_id
  where p_game in ('reading', 'listening', 'typing', 'word_order')
    and s.game = p_game
    and s.created_at >= (date_trunc('week', timezone('Asia/Taipei', now())) at time zone 'Asia/Taipei')
    and not exists (
      select 1 from auth.users u
      where u.id = s.user_id and lower(u.email) = 'mr.taihualin@gmail.com'
    )
  group by s.user_id, p.nickname, p.avatar, p.badge_id
  order by sum(s.score) desc, count(*) asc, s.user_id
  limit 100;
$$;

create function public.reading_leaderboard_alltime(p_game text)
returns table(nickname text, avatar text, badge_id text, total_score bigint, games bigint, is_current_user boolean)
language sql security definer set search_path = ''
as $$
  select coalesce(p.nickname, '(無暱稱)')::text,
         coalesce(p.avatar, '')::text,
         coalesce(p.badge_id, '')::text,
         sum(s.score)::bigint,
         count(*)::bigint,
         (s.user_id = auth.uid())::boolean
  from public.game_score_submissions s
  left join public.profiles p on p.user_id = s.user_id
  where p_game in ('reading', 'listening', 'typing', 'word_order')
    and s.game = p_game
    and not exists (
      select 1 from auth.users u
      where u.id = s.user_id and lower(u.email) = 'mr.taihualin@gmail.com'
    )
  group by s.user_id, p.nickname, p.avatar, p.badge_id
  order by sum(s.score) desc, count(*) asc, s.user_id
  limit 100;
$$;

revoke all on function public.leaderboard_weekly()
  from public, anon, authenticated;
revoke all on function public.leaderboard_alltime()
  from public, anon, authenticated;
revoke all on function public.reading_leaderboard_weekly(text)
  from public, anon, authenticated;
revoke all on function public.reading_leaderboard_alltime(text)
  from public, anon, authenticated;
grant execute on function public.leaderboard_weekly() to anon, authenticated;
grant execute on function public.leaderboard_alltime() to anon, authenticated;
grant execute on function public.reading_leaderboard_weekly(text) to anon, authenticated;
grant execute on function public.reading_leaderboard_alltime(text) to anon, authenticated;

commit;

-- Required read-only postcheck before declaring recovery PASS:
-- 1) the four board RPCs expose exactly the six pre-nickname columns and no
--    public_identity_id, user_id or email;
-- 2) anon/authenticated can execute only the four board RPCs above, not the
--    set/get/report/helper nickname RPCs;
-- 3) anon/authenticated have no direct privilege on either additive table;
-- 4) both additive tables still exist with RLS enabled and unchanged row counts;
-- 5) Tone/Reading/Listening/Typing/Word Order totals/order/current-user behavior
--    match the pre-rollout S29 baseline; then run the approved prior client/Edge
--    browser recovery verification.
