-- P1-DN-03 public Leaderboard identity and nickname safety (SOURCE ONLY).
-- Production action requires separate Lin approval: backup/precheck -> SQL -> client/admin Edge deploy -> controlled verification.
-- Public nickname moderation is intentionally separate from auth.users and private public.profiles identity fields.

begin;

create table if not exists public.leaderboard_public_identities (
  user_id uuid primary key references auth.users(id) on delete cascade,
  public_identity_id uuid not null default gen_random_uuid() unique,
  nickname text,
  nickname_key text,
  nickname_hidden boolean not null default false,
  nickname_updated_at timestamptz,
  moderated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint leaderboard_public_nickname_length check (nickname is null or char_length(nickname) between 1 and 20),
  constraint leaderboard_public_nickname_pair check ((nickname is null) = (nickname_key is null))
);

create table if not exists public.leaderboard_nickname_reports (
  report_id uuid primary key default gen_random_uuid(),
  reporter_user_id uuid not null references auth.users(id) on delete cascade,
  target_public_identity_id uuid not null references public.leaderboard_public_identities(public_identity_id) on delete cascade,
  reported_nickname text not null,
  status text not null default 'pending' check (status in ('pending', 'reviewed', 'dismissed')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create unique index if not exists leaderboard_nickname_reports_one_pending_idx
  on public.leaderboard_nickname_reports (reporter_user_id, target_public_identity_id)
  where status = 'pending';
create index if not exists leaderboard_nickname_reports_review_idx
  on public.leaderboard_nickname_reports (status, created_at);

alter table public.leaderboard_public_identities enable row level security;
alter table public.leaderboard_nickname_reports enable row level security;
revoke all on table public.leaderboard_public_identities from public, anon, authenticated;
revoke all on table public.leaderboard_nickname_reports from public, anon, authenticated;

drop policy if exists leaderboard_public_identity_select_own on public.leaderboard_public_identities;
create policy leaderboard_public_identity_select_own
  on public.leaderboard_public_identities for select to authenticated
  using (auth.uid() = user_id);
grant select on table public.leaderboard_public_identities to authenticated;

create or replace function public.normalize_leaderboard_nickname(p_input text)
returns text
language plpgsql immutable
set search_path = public
as $$
declare
  v text := normalize(coalesce(p_input, ''), NFKC);
begin
  v := regexp_replace(v, '[[:cntrl:]]', '', 'g');
  v := translate(v, U&'\200B\200C\200D\200E\200F\202A\202B\202C\202D\202E\2060\2066\2067\2068\2069\FEFF', '');
  v := regexp_replace(v, '[[:space:]]+', ' ', 'g');
  return btrim(v);
end;
$$;

create or replace function public.leaderboard_nickname_violation(p_input text)
returns text
language plpgsql immutable
set search_path = public
as $$
declare
  v text := public.normalize_leaderboard_nickname(p_input);
  v_key text;
  v_digits text;
begin
  if v = '' then return 'empty'; end if;
  if char_length(v) > 20 then return 'too_long'; end if;
  if v !~ U&'^[[:alnum:][:space:]_.\0E00-\0E7F\3400-\4DBF\4E00-\9FFF-]+$'
     or v !~ U&'[[:alnum:]\0E00-\0E7F\3400-\4DBF\4E00-\9FFF]' then
    return 'invalid_characters';
  end if;

  if v ~* '([[:alnum:]_.%+\-]+@[[:alnum:].\-]+\.[[:alpha:]]{2,}|https?://|www\.|(^|[[:space:]])[[:alnum:]\-]+\.(com|net|org|co|io|me|th|tw)($|[[:space:]]|/))'
     or v ~* U&'(line|\0E44\0E25\0E19\0E4C|wechat|\5FAE\4FE1|telegram|whatsapp|instagram|facebook|discord)[[:space:]_.:-]*(id|\5E33\865F|\5E10\53F7|\0E44\0E2D\0E14\0E35|@|:|\FF1A)'
     or v ~* U&'(id|add|\52A0|\0E41\0E2D\0E14)[[:space:]_.:-]*(line|\0E44\0E25\0E19\0E4C|wechat|\5FAE\4FE1|telegram|whatsapp|instagram|facebook|discord)' then
    return 'contact_data';
  end if;
  v_digits := regexp_replace(translate(v, '０１２３４５６７８９', '0123456789'), '[^0-9]', '', 'g');
  if char_length(v_digits) >= 7 then return 'contact_data'; end if;

  v_key := lower(normalize(v, NFKD));
  v_key := translate(v_key, '013457@$!', 'oieastasi');
  v_key := regexp_replace(v_key, '[[:space:]_.\-]+', '', 'g');
  if v_key ~ U&'(fuck|shit|bitch|cunt|dick|pussy|porn|\0E04\0E27\0E22|\0E40\0E2B\0E35\0E49\0E22|\0E40\0E22\0E47\0E14|\0E2B\0E35|\0E41\0E15\0E14|\5E79\4F60|\5E72\4F60|\64CD\4F60|\96DE\5DF4|\9E21\5DF4|\5C4C|\5A4A\5B50|\8272\60C5)' then
    return 'inappropriate';
  end if;
  return null;
end;
$$;

create or replace function public.set_leaderboard_nickname(p_nickname text)
returns table(nickname text, public_identity_id uuid)
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_nickname text := public.normalize_leaderboard_nickname(p_nickname);
  v_violation text;
begin
  if v_uid is null then raise exception using errcode = '42501', message = 'NICKNAME_AUTH_REQUIRED'; end if;
  v_violation := public.leaderboard_nickname_violation(v_nickname);
  if v_violation is not null then
    raise exception using errcode = '22023', message = 'NICKNAME_' || upper(v_violation);
  end if;
  if exists (select 1 from public.leaderboard_public_identities i where i.user_id = v_uid and i.nickname_hidden) then
    raise exception using errcode = '42501', message = 'NICKNAME_MODERATED';
  end if;

  insert into public.leaderboard_public_identities (user_id, nickname, nickname_key, nickname_updated_at, updated_at)
  values (v_uid, v_nickname, lower(normalize(v_nickname, NFKC)), now(), now())
  on conflict (user_id) do update
    set nickname = excluded.nickname,
        nickname_key = excluded.nickname_key,
        nickname_updated_at = excluded.nickname_updated_at,
        updated_at = excluded.updated_at;

  return query
    select i.nickname, i.public_identity_id
    from public.leaderboard_public_identities i
    where i.user_id = v_uid;
end;
$$;

create or replace function public.get_my_leaderboard_identity()
returns table(nickname text, public_identity_id uuid, nickname_hidden boolean)
language sql security definer
set search_path = ''
as $$
  select i.nickname, i.public_identity_id, i.nickname_hidden
  from public.leaderboard_public_identities i
  where i.user_id = auth.uid();
$$;

create or replace function public.report_leaderboard_nickname(p_public_identity_id uuid)
returns text
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_nickname text;
  v_inserted integer;
begin
  if v_uid is null then raise exception using errcode = '42501', message = 'REPORT_AUTH_REQUIRED'; end if;
  select i.nickname into v_nickname
  from public.leaderboard_public_identities i
  where i.public_identity_id = p_public_identity_id
    and i.user_id <> v_uid
    and i.nickname is not null
    and not i.nickname_hidden;
  if v_nickname is null then raise exception using errcode = '22023', message = 'REPORT_TARGET_UNAVAILABLE'; end if;

  insert into public.leaderboard_nickname_reports
    (reporter_user_id, target_public_identity_id, reported_nickname)
  values (v_uid, p_public_identity_id, v_nickname)
  on conflict (reporter_user_id, target_public_identity_id) where status = 'pending' do nothing;
  get diagnostics v_inserted = row_count;
  return case when v_inserted = 1 then 'received' else 'already_reported' end;
end;
$$;

drop function if exists public.leaderboard_weekly();
drop function if exists public.leaderboard_alltime();
drop function if exists public.reading_leaderboard_weekly(text);
drop function if exists public.reading_leaderboard_alltime(text);

create function public.leaderboard_weekly()
returns table(nickname text, public_identity_id uuid, avatar text, badge_id text, total_score bigint, games bigint, is_current_user boolean)
language sql security definer set search_path = ''
as $$
  select case when i.nickname is not null and not i.nickname_hidden then i.nickname else '玩家' end::text,
         case when i.nickname is not null and not i.nickname_hidden then i.public_identity_id else null end::uuid,
         coalesce(p.avatar, '')::text, coalesce(p.badge_id, '')::text,
         sum(s.score)::bigint, count(*)::bigint, (s.user_id = auth.uid())::boolean
  from public.game_score_submissions s
  left join public.profiles p on p.user_id = s.user_id
  left join public.leaderboard_public_identities i on i.user_id = s.user_id
  where s.game = 'tone'
    and s.created_at >= (date_trunc('week', timezone('Asia/Taipei', now())) at time zone 'Asia/Taipei')
    and not exists (select 1 from auth.users u where u.id = s.user_id and lower(u.email) = 'mr.taihualin@gmail.com')
  group by s.user_id, i.nickname, i.nickname_hidden, i.public_identity_id, p.avatar, p.badge_id
  order by sum(s.score) desc, count(*) asc, s.user_id limit 100;
$$;

create function public.leaderboard_alltime()
returns table(nickname text, public_identity_id uuid, avatar text, badge_id text, total_score bigint, games bigint, is_current_user boolean)
language sql security definer set search_path = ''
as $$
  select case when i.nickname is not null and not i.nickname_hidden then i.nickname else '玩家' end::text,
         case when i.nickname is not null and not i.nickname_hidden then i.public_identity_id else null end::uuid,
         coalesce(p.avatar, '')::text, coalesce(p.badge_id, '')::text,
         sum(s.score)::bigint, count(*)::bigint, (s.user_id = auth.uid())::boolean
  from public.game_score_submissions s
  left join public.profiles p on p.user_id = s.user_id
  left join public.leaderboard_public_identities i on i.user_id = s.user_id
  where s.game = 'tone'
    and not exists (select 1 from auth.users u where u.id = s.user_id and lower(u.email) = 'mr.taihualin@gmail.com')
  group by s.user_id, i.nickname, i.nickname_hidden, i.public_identity_id, p.avatar, p.badge_id
  order by sum(s.score) desc, count(*) asc, s.user_id limit 100;
$$;

create function public.reading_leaderboard_weekly(p_game text)
returns table(nickname text, public_identity_id uuid, avatar text, badge_id text, total_score bigint, games bigint, is_current_user boolean)
language sql security definer set search_path = ''
as $$
  select case when i.nickname is not null and not i.nickname_hidden then i.nickname else '玩家' end::text,
         case when i.nickname is not null and not i.nickname_hidden then i.public_identity_id else null end::uuid,
         coalesce(p.avatar, '')::text, coalesce(p.badge_id, '')::text,
         sum(s.score)::bigint, count(*)::bigint, (s.user_id = auth.uid())::boolean
  from public.game_score_submissions s
  left join public.profiles p on p.user_id = s.user_id
  left join public.leaderboard_public_identities i on i.user_id = s.user_id
  where p_game in ('reading', 'listening', 'typing', 'word_order') and s.game = p_game
    and s.created_at >= (date_trunc('week', timezone('Asia/Taipei', now())) at time zone 'Asia/Taipei')
    and not exists (select 1 from auth.users u where u.id = s.user_id and lower(u.email) = 'mr.taihualin@gmail.com')
  group by s.user_id, i.nickname, i.nickname_hidden, i.public_identity_id, p.avatar, p.badge_id
  order by sum(s.score) desc, count(*) asc, s.user_id limit 100;
$$;

create function public.reading_leaderboard_alltime(p_game text)
returns table(nickname text, public_identity_id uuid, avatar text, badge_id text, total_score bigint, games bigint, is_current_user boolean)
language sql security definer set search_path = ''
as $$
  select case when i.nickname is not null and not i.nickname_hidden then i.nickname else '玩家' end::text,
         case when i.nickname is not null and not i.nickname_hidden then i.public_identity_id else null end::uuid,
         coalesce(p.avatar, '')::text, coalesce(p.badge_id, '')::text,
         sum(s.score)::bigint, count(*)::bigint, (s.user_id = auth.uid())::boolean
  from public.game_score_submissions s
  left join public.profiles p on p.user_id = s.user_id
  left join public.leaderboard_public_identities i on i.user_id = s.user_id
  where p_game in ('reading', 'listening', 'typing', 'word_order') and s.game = p_game
    and not exists (select 1 from auth.users u where u.id = s.user_id and lower(u.email) = 'mr.taihualin@gmail.com')
  group by s.user_id, i.nickname, i.nickname_hidden, i.public_identity_id, p.avatar, p.badge_id
  order by sum(s.score) desc, count(*) asc, s.user_id limit 100;
$$;

revoke all on function public.normalize_leaderboard_nickname(text) from public, anon, authenticated;
revoke all on function public.leaderboard_nickname_violation(text) from public, anon, authenticated;
revoke all on function public.set_leaderboard_nickname(text) from public, anon, authenticated;
revoke all on function public.get_my_leaderboard_identity() from public, anon, authenticated;
revoke all on function public.report_leaderboard_nickname(uuid) from public, anon, authenticated;
revoke all on function public.leaderboard_weekly() from public, anon, authenticated;
revoke all on function public.leaderboard_alltime() from public, anon, authenticated;
revoke all on function public.reading_leaderboard_weekly(text) from public, anon, authenticated;
revoke all on function public.reading_leaderboard_alltime(text) from public, anon, authenticated;
grant execute on function public.set_leaderboard_nickname(text) to authenticated;
grant execute on function public.get_my_leaderboard_identity() to authenticated;
grant execute on function public.report_leaderboard_nickname(uuid) to authenticated;
grant execute on function public.leaderboard_weekly() to anon, authenticated;
grant execute on function public.leaderboard_alltime() to anon, authenticated;
grant execute on function public.reading_leaderboard_weekly(text) to anon, authenticated;
grant execute on function public.reading_leaderboard_alltime(text) to anon, authenticated;

commit;

-- Required post-run verification (read-only):
-- 1) anon/authenticated cannot read/write identity/report tables directly; authenticated can only call set/get/report RPCs.
-- 2) all four public board RPCs expose public_identity_id but no user_id/email/private profile nickname.
-- 3) malicious/contact/inappropriate/evasion input is rejected after NFKC/invisible normalization.
-- 4) hide/reset changes only leaderboard_public_identities + moderation audit/report state, never auth.users/profiles/account data.
-- 5) Tone/Reading/Listening/Typing/Word Order weekly/all-time ordering, score totals and current-user marker remain unchanged.
