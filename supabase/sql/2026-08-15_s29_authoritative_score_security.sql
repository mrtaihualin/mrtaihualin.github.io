-- S14-S18 / S29 authoritative score foundation (SOURCE ONLY).
-- Production action requires Lin approval: backup/precheck -> deploy score-submit -> run SQL -> deploy client.
-- Leaderboards switch to game_score_submissions only; legacy session tables remain private history mirrors.
-- Existing session rows are retained but intentionally not migrated: browser-authored history is unverified.

begin;

create table if not exists public.game_score_submissions (
  submission_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  game text not null,
  difficulty text not null,
  score integer not null,
  total integer not null,
  evidence_hash text not null,
  score_version text not null,
  created_at timestamptz not null default now(),
  legacy_mirrored_at timestamptz,
  constraint game_score_submissions_game_check
    check (game in ('tone', 'reading', 'listening', 'typing', 'word_order')),
  constraint game_score_submissions_difficulty_check
    check (difficulty in ('初', '中', '高', 'mixed')),
  constraint game_score_submissions_score_check
    check (score between 0 and 5000),
  constraint game_score_submissions_total_check
    check (total between 1 and 100),
  constraint game_score_submissions_hash_check
    check (evidence_hash ~ '^[0-9a-f]{64}$')
);

create index if not exists game_score_submissions_game_created_idx
  on public.game_score_submissions (game, created_at desc);
create index if not exists game_score_submissions_user_created_idx
  on public.game_score_submissions (user_id, created_at desc);

alter table public.game_score_submissions enable row level security;
revoke all on table public.game_score_submissions from public, anon, authenticated;
grant select on table public.game_score_submissions to authenticated;

drop policy if exists game_score_submissions_select_own on public.game_score_submissions;
create policy game_score_submissions_select_own
  on public.game_score_submissions
  for select to authenticated
  using (auth.uid() = user_id);

-- Client browsers must never write either the authoritative board source or legacy mirrors.
drop policy if exists "rs own insert" on public.reading_sessions;
drop policy if exists "insert own sessions" on public.tone_sessions;
revoke insert, update, delete on table public.reading_sessions from public, anon, authenticated;
revoke insert, update, delete on table public.tone_sessions from public, anon, authenticated;

alter table public.reading_sessions drop constraint if exists reading_sessions_games_sane;
alter table public.reading_sessions add constraint reading_sessions_games_sane check (games between 1 and 10) not valid;
alter table public.tone_sessions drop constraint if exists tone_sessions_score_sane;
alter table public.tone_sessions add constraint tone_sessions_score_sane check (score between 0 and 3000) not valid;
alter table public.tone_sessions drop constraint if exists tone_sessions_total_sane;
alter table public.tone_sessions add constraint tone_sessions_total_sane check (total between 0 and 100) not valid;

drop function if exists public.leaderboard_weekly();
drop function if exists public.leaderboard_alltime();
drop function if exists public.reading_leaderboard_weekly();
drop function if exists public.reading_leaderboard_alltime();
drop function if exists public.reading_leaderboard_weekly(text);
drop function if exists public.reading_leaderboard_alltime(text);
drop function if exists public.combined_leaderboard_weekly();
drop function if exists public.combined_leaderboard_alltime();

create function public.leaderboard_weekly()
returns table(nickname text, avatar text, badge_id text, total_score bigint, games bigint, is_current_user boolean)
language sql security definer set search_path = public
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
    and not exists (select 1 from auth.users u where u.id = s.user_id and lower(u.email) = 'mr.taihualin@gmail.com')
  group by s.user_id, p.nickname, p.avatar, p.badge_id
  order by sum(s.score) desc, count(*) asc, s.user_id
  limit 100;
$$;

create function public.leaderboard_alltime()
returns table(nickname text, avatar text, badge_id text, total_score bigint, games bigint, is_current_user boolean)
language sql security definer set search_path = public
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
    and not exists (select 1 from auth.users u where u.id = s.user_id and lower(u.email) = 'mr.taihualin@gmail.com')
  group by s.user_id, p.nickname, p.avatar, p.badge_id
  order by sum(s.score) desc, count(*) asc, s.user_id
  limit 100;
$$;

create function public.reading_leaderboard_weekly(p_game text)
returns table(nickname text, avatar text, badge_id text, total_score bigint, games bigint, is_current_user boolean)
language sql security definer set search_path = public
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
    and not exists (select 1 from auth.users u where u.id = s.user_id and lower(u.email) = 'mr.taihualin@gmail.com')
  group by s.user_id, p.nickname, p.avatar, p.badge_id
  order by sum(s.score) desc, count(*) asc, s.user_id
  limit 100;
$$;

create function public.reading_leaderboard_alltime(p_game text)
returns table(nickname text, avatar text, badge_id text, total_score bigint, games bigint, is_current_user boolean)
language sql security definer set search_path = public
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
    and not exists (select 1 from auth.users u where u.id = s.user_id and lower(u.email) = 'mr.taihualin@gmail.com')
  group by s.user_id, p.nickname, p.avatar, p.badge_id
  order by sum(s.score) desc, count(*) asc, s.user_id
  limit 100;
$$;

revoke all on function public.leaderboard_weekly() from public;
revoke all on function public.leaderboard_alltime() from public;
revoke all on function public.reading_leaderboard_weekly(text) from public;
revoke all on function public.reading_leaderboard_alltime(text) from public;
grant execute on function public.leaderboard_weekly() to anon, authenticated;
grant execute on function public.leaderboard_alltime() to anon, authenticated;
grant execute on function public.reading_leaderboard_weekly(text) to anon, authenticated;
grant execute on function public.reading_leaderboard_alltime(text) to anon, authenticated;

commit;

-- Required post-run verification (read-only):
-- 1) policies/grants show no INSERT/UPDATE/DELETE for anon/authenticated on all three score tables.
-- 2) anonymous RPC result columns contain no user_id/email/private identity.
-- 3) direct authenticated inserts into legacy tables fail; score-submit valid request succeeds.
-- 4) replay of the same submission_id is idempotent; changed replay returns HTTP 409.
-- 5) Edge rate limit rejects request 31 in the same 10-minute window.
