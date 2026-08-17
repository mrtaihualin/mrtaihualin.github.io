-- Disposable PostgreSQL-only schema for the P1-B-04 recovery fixture.
-- Never run against staging or Production.

create role anon nologin;
create role authenticated nologin;

create schema auth;
create table auth.users (
  id uuid primary key,
  email text
);

create function auth.uid()
returns uuid
language sql stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  nickname text,
  avatar text,
  badge_id text
);

create table public.game_score_submissions (
  submission_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  game text not null,
  difficulty text not null,
  score integer not null,
  total integer not null,
  evidence_hash text not null,
  score_version text not null,
  created_at timestamptz not null default now()
);
