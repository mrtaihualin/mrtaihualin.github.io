-- SOURCE ONLY — short-parameter catalog resolver for the authenticated game queue.
-- Additive and read-only. Production apply requires a separate exact approval.

begin;

do $precheck$
begin
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'service_role') then
    raise exception 'service_role is missing';
  end if;
  if pg_catalog.to_regclass('public.game_words') is null
     or pg_catalog.to_regclass('public.game_sentences') is null
     or pg_catalog.to_regclass('public.learning_items') is null then
    raise exception 'learning catalog dependency is missing';
  end if;
  if exists (
    select 1 from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'phase1_learning_catalog_resolve'
  ) then
    raise exception 'learning catalog resolver name is already in use';
  end if;
end
$precheck$;

create function public.phase1_learning_catalog_resolve(
  p_game text,
  p_level smallint
) returns table(
  content_source text,
  content_key text,
  item_id uuid,
  match_count bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  with requested as (
    select
      'game_sentences'::text as content_source,
      s.th::text as content_key,
      s.rank::bigint as catalog_rank,
      s.id::bigint as catalog_id
    from public.game_sentences s
    where p_game in ('tone', 'reading', 'typing', 'word_order')
      and p_level between 1 and 3
      and (p_game = 'word_order' or p_level = 3)

    union all

    select
      'game_words'::text as content_source,
      w.content_key::text as content_key,
      w.rank::bigint as catalog_rank,
      w.id::bigint as catalog_id
    from public.game_words w
    where p_game in ('tone', 'reading', 'typing')
      and p_level in (1, 2)
      and w.level = case p_level when 1 then '初' when 2 then '中' end
      and w.status = 'active'
      and w.access_tier in ('guest', 'login')
  )
  select
    r.content_source,
    r.content_key,
    (pg_catalog.array_agg(i.item_id order by i.item_id)
      filter (where i.item_id is not null))[1] as item_id,
    pg_catalog.count(i.item_id)::bigint as match_count
  from requested r
  left join public.learning_items i
    on i.owner_user_id is null
   and i.content_source = r.content_source
   and i.content_key = r.content_key
  group by r.content_source, r.content_key, r.catalog_rank, r.catalog_id
  order by r.catalog_rank, r.catalog_id;
$$;

revoke all on function public.phase1_learning_catalog_resolve(text, smallint)
  from public, anon, authenticated;
grant execute on function public.phase1_learning_catalog_resolve(text, smallint)
  to service_role;

do $postcheck$
begin
  if has_function_privilege('anon', 'public.phase1_learning_catalog_resolve(text,smallint)', 'execute')
     or has_function_privilege('authenticated', 'public.phase1_learning_catalog_resolve(text,smallint)', 'execute') then
    raise exception 'browser role can execute phase1_learning_catalog_resolve';
  end if;
  if not has_function_privilege('service_role', 'public.phase1_learning_catalog_resolve(text,smallint)', 'execute') then
    raise exception 'service_role cannot execute phase1_learning_catalog_resolve';
  end if;
end
$postcheck$;

comment on function public.phase1_learning_catalog_resolve(text, smallint) is
  'Server-only, read-only current game catalog resolver. Returns exact stable learning identity cardinality for Edge validation.';

commit;

-- Exact rollback after the Edge route is disabled:
-- drop function if exists public.phase1_learning_catalog_resolve(text, smallint);
