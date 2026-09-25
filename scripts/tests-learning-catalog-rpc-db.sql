-- Run only against an isolated disposable PostgreSQL database.
\set ON_ERROR_STOP on

do $roles$
begin
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'service_role') then create role service_role; end if;
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'anon') then create role anon; end if;
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'authenticated') then create role authenticated; end if;
end
$roles$;

create table public.game_words (
  id bigint primary key,
  content_key text not null,
  rank integer not null,
  level text not null,
  status text not null,
  access_tier text not null
);
create table public.game_sentences (
  id bigint primary key,
  th text not null,
  rank integer not null
);
create table public.learning_items (
  item_id uuid primary key,
  owner_user_id uuid,
  content_source text not null,
  content_key text not null
);

revoke all on public.game_words, public.game_sentences, public.learning_items from public, anon, authenticated;
grant select on public.game_words, public.game_sentences, public.learning_items to service_role;

insert into public.game_words (id, content_key, rank, level, status, access_tier) values
  (1, 'synthetic-one@初', 1, '初', 'active', 'guest'),
  (2, 'synthetic-two@中', 2, '中', 'active', 'login'),
  (3, 'synthetic-paid@中', 3, '中', 'active', 'paid'),
  (4, 'synthetic-history@中', 4, '中', 'history', 'login');
insert into public.game_sentences (id, th, rank) values
  (1, 'synthetic sentence one', 1),
  (2, 'synthetic sentence two', 2);
insert into public.learning_items (item_id, owner_user_id, content_source, content_key) values
  ('00000000-0000-4000-8000-000000000001', null, 'game_words', 'synthetic-one@初'),
  ('00000000-0000-4000-8000-000000000002', null, 'game_words', 'synthetic-two@中'),
  ('00000000-0000-4000-8000-000000000003', null, 'game_words', 'synthetic-paid@中'),
  ('00000000-0000-4000-8000-000000000004', null, 'game_sentences', 'synthetic sentence one');

\ir ../supabase/migrations/20260919013259_phase1_learning_catalog_resolve_rpc.sql

do $test$
declare
  v_count integer;
  v_key text;
  v_matches bigint;
begin
  select pg_catalog.count(*) into v_count
  from public.phase1_learning_catalog_resolve('typing', 1::smallint);
  if v_count <> 1 then raise exception 'initial level catalog mismatch: %', v_count; end if;

  select content_key into v_key
  from public.phase1_learning_catalog_resolve('typing', 2::smallint);
  if v_key is distinct from 'synthetic-two@中' then raise exception 'middle level filter mismatch'; end if;

  select pg_catalog.count(*), pg_catalog.max(match_count) into v_count, v_matches
  from public.phase1_learning_catalog_resolve('word_order', 3::smallint);
  if v_count <> 2 or v_matches <> 1 then raise exception 'sentence catalog mismatch'; end if;

  select pg_catalog.min(match_count) into v_matches
  from public.phase1_learning_catalog_resolve('tone', 3::smallint);
  if v_matches <> 0 then raise exception 'missing identity was not reported'; end if;

  select pg_catalog.count(*) into v_count
  from public.phase1_learning_catalog_resolve('unknown', 2::smallint);
  if v_count <> 0 then raise exception 'unknown game leaked content'; end if;
end
$test$;

do $permissions$
begin
  if has_function_privilege('anon', 'public.phase1_learning_catalog_resolve(text,smallint)', 'execute')
     or has_function_privilege('authenticated', 'public.phase1_learning_catalog_resolve(text,smallint)', 'execute')
     or not has_function_privilege('service_role', 'public.phase1_learning_catalog_resolve(text,smallint)', 'execute') then
    raise exception 'catalog resolver permissions mismatch';
  end if;
end
$permissions$;

set role service_role;
select item_id, match_count
from public.phase1_learning_catalog_resolve('typing', 2::smallint);
reset role;

\echo LEARNING_CATALOG_RPC_DB_PASS
