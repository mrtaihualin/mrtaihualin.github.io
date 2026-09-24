-- SOURCE ONLY — pin every Typing prompt to its canonical catalog version/hash.
-- Apply only after 20260923143000 and fresh exact Production approval.
-- HTTP/browser adoption remains OFF.
begin;

alter table public.phase1_typing_round_prompts
  add column if not exists catalog_version text,
  add column if not exists record_hash text;
alter table public.phase1_typing_round_reserve_prompts
  add column if not exists catalog_version text,
  add column if not exists record_hash text;

do $$ begin
  if not exists (select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.phase1_typing_round_prompts'::pg_catalog.regclass
      and conname = 'phase1_typing_round_prompts_catalog_version_check') then
    alter table public.phase1_typing_round_prompts
      add constraint phase1_typing_round_prompts_catalog_version_check
      check (catalog_version is null or (
        pg_catalog.length(catalog_version) between 1 and 128
        and catalog_version = pg_catalog.btrim(catalog_version)
      ));
  end if;
  if not exists (select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.phase1_typing_round_prompts'::pg_catalog.regclass
      and conname = 'phase1_typing_round_prompts_record_hash_check') then
    alter table public.phase1_typing_round_prompts
      add constraint phase1_typing_round_prompts_record_hash_check
      check (record_hash is null or record_hash ~ '^[0-9a-f]{64}$');
  end if;
  if not exists (select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.phase1_typing_round_reserve_prompts'::pg_catalog.regclass
      and conname = 'phase1_typing_round_reserve_prompts_catalog_version_check') then
    alter table public.phase1_typing_round_reserve_prompts
      add constraint phase1_typing_round_reserve_prompts_catalog_version_check
      check (catalog_version is null or (
        pg_catalog.length(catalog_version) between 1 and 128
        and catalog_version = pg_catalog.btrim(catalog_version)
      ));
  end if;
  if not exists (select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.phase1_typing_round_reserve_prompts'::pg_catalog.regclass
      and conname = 'phase1_typing_round_reserve_prompts_record_hash_check') then
    alter table public.phase1_typing_round_reserve_prompts
      add constraint phase1_typing_round_reserve_prompts_record_hash_check
      check (record_hash is null or record_hash ~ '^[0-9a-f]{64}$');
  end if;
end $$;

alter function public.phase1_typing_round_issue(uuid,uuid,text,smallint,bigint,jsonb,jsonb)
  rename to phase1_typing_round_issue_unversioned;
alter function public.phase1_typing_round_append_reserve(uuid,uuid,text,uuid,bigint,jsonb)
  rename to phase1_typing_round_append_reserve_unversioned;
alter function public.phase1_typing_round_append_event(uuid,uuid,text,uuid,bigint,bigint,text,text)
  rename to phase1_typing_round_append_event_unversioned;
alter function public.phase1_typing_round_load(uuid,uuid,bigint,bigint,smallint)
  rename to phase1_typing_round_load_unversioned;

create or replace function public.phase1_typing_round_issue(
  p_operation_id uuid, p_user_id uuid, p_request_hash text, p_level smallint,
  p_starting_combo bigint, p_prompts jsonb, p_reserve_prompts jsonb
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_prompt jsonb;
  v_result jsonb;
  v_round_id uuid;
  v_updated bigint;
  v_level text := case p_level when 1 then '初' when 2 then '中' else null end;
begin
  -- A committed receipt is authoritative even if Canon later moves. The caller
  -- still performs Resume, which independently rejects stale persisted pins.
  if exists (
    select 1 from public.phase1_typing_round_operations where operation_id = p_operation_id
  ) then
    return public.phase1_typing_round_issue_unversioned(
      p_operation_id, p_user_id, p_request_hash, p_level, p_starting_combo, p_prompts, p_reserve_prompts
    );
  end if;
  if v_level is null or pg_catalog.jsonb_typeof(p_prompts) is distinct from 'array'
     or pg_catalog.jsonb_typeof(p_reserve_prompts) is distinct from 'array' then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'invalid_arguments');
  end if;
  for v_prompt in select value from pg_catalog.jsonb_array_elements(p_prompts || p_reserve_prompts) loop
    if pg_catalog.jsonb_typeof(v_prompt -> 'catalog_version') is distinct from 'string'
       or nullif(pg_catalog.btrim(v_prompt ->> 'catalog_version'), '') is null
       or v_prompt ->> 'catalog_version' is distinct from pg_catalog.btrim(v_prompt ->> 'catalog_version')
       or pg_catalog.length(v_prompt ->> 'catalog_version') > 128
       or pg_catalog.jsonb_typeof(v_prompt -> 'record_hash') is distinct from 'string'
       or (v_prompt ->> 'record_hash') !~ '^[0-9a-f]{64}$' then
      return pg_catalog.jsonb_build_object('ok', false, 'reason', 'invalid_prompt');
    end if;
    perform 1 from public.game_words word
      where word.content_key = v_prompt #>> '{content_ref,key}'
        and word.level = v_level and word.status = 'active'
        and word.access_tier in ('guest', 'login')
        and word.catalog_version = v_prompt ->> 'catalog_version'
        and word.record_hash = v_prompt ->> 'record_hash'
        and word.canonical_record ->> 'word' = v_prompt ->> 'answer'
      for share of word;
    if not found then
      return pg_catalog.jsonb_build_object('ok', false, 'reason', 'typing_canonical_changed');
    end if;
  end loop;

  v_result := public.phase1_typing_round_issue_unversioned(
    p_operation_id, p_user_id, p_request_hash, p_level, p_starting_combo, p_prompts, p_reserve_prompts
  );
  if v_result ->> 'ok' is distinct from 'true' then return v_result; end if;
  v_round_id := (v_result ->> 'round_id')::uuid;

  update public.phase1_typing_round_prompts target
  set catalog_version = prompt.value ->> 'catalog_version', record_hash = prompt.value ->> 'record_hash'
  from pg_catalog.jsonb_array_elements(p_prompts) with ordinality prompt(value, ordinality)
  where target.round_id = v_round_id and target.prompt_ordinal = prompt.ordinality;
  get diagnostics v_updated = row_count;
  if v_updated <> pg_catalog.jsonb_array_length(p_prompts) then
    raise exception 'typing canonical prompt pin persistence failed';
  end if;
  update public.phase1_typing_round_reserve_prompts target
  set catalog_version = prompt.value ->> 'catalog_version', record_hash = prompt.value ->> 'record_hash'
  from pg_catalog.jsonb_array_elements(p_reserve_prompts) with ordinality prompt(value, ordinality)
  where target.round_id = v_round_id and target.reserve_ordinal = prompt.ordinality;
  get diagnostics v_updated = row_count;
  if v_updated <> pg_catalog.jsonb_array_length(p_reserve_prompts) then
    raise exception 'typing canonical reserve pin persistence failed';
  end if;
  return v_result;
end;
$$;

create or replace function public.phase1_typing_round_append_reserve(
  p_batch_id uuid, p_user_id uuid, p_request_hash text, p_round_id uuid,
  p_expected_reserve_count bigint, p_prompts jsonb
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_prompt jsonb;
  v_result jsonb;
  v_level text;
  v_updated bigint;
begin
  if exists (
    select 1 from public.phase1_typing_round_reserve_batches where batch_id = p_batch_id
  ) then
    return public.phase1_typing_round_append_reserve_unversioned(
      p_batch_id, p_user_id, p_request_hash, p_round_id, p_expected_reserve_count, p_prompts
    );
  end if;
  select case level when 1 then '初' when 2 then '中' end into v_level
  from public.phase1_typing_rounds where round_id = p_round_id and user_id = p_user_id
  for update;
  if not found then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'round_not_found');
  end if;
  -- A same-batch concurrent winner may have committed while this call waited
  -- on the round lock. Preserve its exact durable replay semantics.
  if exists (
    select 1 from public.phase1_typing_round_reserve_batches where batch_id = p_batch_id
  ) then
    return public.phase1_typing_round_append_reserve_unversioned(
      p_batch_id, p_user_id, p_request_hash, p_round_id, p_expected_reserve_count, p_prompts
    );
  end if;
  if v_level is null or pg_catalog.jsonb_typeof(p_prompts) is distinct from 'array' then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'invalid_arguments');
  end if;
  for v_prompt in select value from pg_catalog.jsonb_array_elements(p_prompts) loop
    if pg_catalog.jsonb_typeof(v_prompt -> 'catalog_version') is distinct from 'string'
       or nullif(pg_catalog.btrim(v_prompt ->> 'catalog_version'), '') is null
       or v_prompt ->> 'catalog_version' is distinct from pg_catalog.btrim(v_prompt ->> 'catalog_version')
       or pg_catalog.length(v_prompt ->> 'catalog_version') > 128
       or pg_catalog.jsonb_typeof(v_prompt -> 'record_hash') is distinct from 'string'
       or (v_prompt ->> 'record_hash') !~ '^[0-9a-f]{64}$' then
      return pg_catalog.jsonb_build_object('ok', false, 'reason', 'invalid_prompt');
    end if;
    perform 1 from public.game_words word
      where word.content_key = v_prompt #>> '{content_ref,key}'
        and word.level = v_level and word.status = 'active'
        and word.access_tier in ('guest', 'login')
        and word.catalog_version = v_prompt ->> 'catalog_version'
        and word.record_hash = v_prompt ->> 'record_hash'
        and word.canonical_record ->> 'word' = v_prompt ->> 'answer'
      for share of word;
    if not found then
      return pg_catalog.jsonb_build_object('ok', false, 'reason', 'typing_canonical_changed');
    end if;
  end loop;

  v_result := public.phase1_typing_round_append_reserve_unversioned(
    p_batch_id, p_user_id, p_request_hash, p_round_id, p_expected_reserve_count, p_prompts
  );
  if v_result ->> 'ok' is distinct from 'true' then return v_result; end if;
  update public.phase1_typing_round_reserve_prompts target
  set catalog_version = prompt.value ->> 'catalog_version', record_hash = prompt.value ->> 'record_hash'
  from pg_catalog.jsonb_array_elements(p_prompts) with ordinality prompt(value, ordinality)
  where target.round_id = p_round_id
    and target.reserve_ordinal = p_expected_reserve_count + prompt.ordinality;
  get diagnostics v_updated = row_count;
  if v_updated <> pg_catalog.jsonb_array_length(p_prompts) then
    raise exception 'typing canonical refill pin persistence failed';
  end if;
  return v_result;
end;
$$;

create or replace function public.phase1_typing_round_append_event(
  p_operation_id uuid, p_user_id uuid, p_request_hash text, p_round_id uuid,
  p_expected_sequence bigint, p_prompt_ordinal bigint, p_event_type text, p_answer text default null
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_result jsonb;
  v_level text;
begin
  if exists (
    select 1 from public.phase1_typing_round_operations where operation_id = p_operation_id
  ) then
    return public.phase1_typing_round_append_event_unversioned(
      p_operation_id, p_user_id, p_request_hash, p_round_id, p_expected_sequence,
      p_prompt_ordinal, p_event_type, p_answer
    );
  end if;
  select case level when 1 then '初' when 2 then '中' end into v_level
  from public.phase1_typing_rounds where round_id = p_round_id and user_id = p_user_id
  for update;
  if v_level is null then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'round_not_found');
  end if;
  -- Recheck after the round-lock wait so a concurrent same-operation winner is
  -- replayed without making its receipt depend on later Canon state.
  if exists (
    select 1 from public.phase1_typing_round_operations where operation_id = p_operation_id
  ) then
    return public.phase1_typing_round_append_event_unversioned(
      p_operation_id, p_user_id, p_request_hash, p_round_id, p_expected_sequence,
      p_prompt_ordinal, p_event_type, p_answer
    );
  end if;
  -- Serialize the current and every still-issued reserve identity against
  -- catalog mutation until the event/continuation transaction commits.
  perform word.content_key
  from public.game_words word
  where word.content_key in (
    select prompt.content_key from public.phase1_typing_round_prompts prompt
    where prompt.round_id = p_round_id and prompt.prompt_ordinal = p_prompt_ordinal
    union
    select prompt.content_key from public.phase1_typing_round_reserve_prompts prompt
    join public.phase1_typing_round_reserve_state state on state.round_id = prompt.round_id
    where prompt.round_id = p_round_id and prompt.reserve_ordinal > state.reserve_cursor
  )
  for share of word;
  if not exists (
    select 1 from public.phase1_typing_round_prompts prompt
    join public.game_words word on word.content_key = prompt.content_key
    where prompt.round_id = p_round_id and prompt.prompt_ordinal = p_prompt_ordinal
      and prompt.catalog_version is not null and prompt.record_hash is not null
      and word.level = v_level and word.status = 'active' and word.access_tier in ('guest', 'login')
      and word.catalog_version = prompt.catalog_version and word.record_hash = prompt.record_hash
      and word.canonical_record ->> 'word' = prompt.canonical_answer
  ) then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'typing_canonical_changed');
  end if;
  if exists (
    select 1 from public.phase1_typing_round_reserve_prompts prompt
    join public.phase1_typing_round_reserve_state state on state.round_id = prompt.round_id
    left join public.game_words word on word.content_key = prompt.content_key
    where prompt.round_id = p_round_id and prompt.reserve_ordinal > state.reserve_cursor
      and (prompt.catalog_version is null or prompt.record_hash is null
        or word.content_key is null or word.level is distinct from v_level
        or word.status is distinct from 'active'
        or (word.access_tier is distinct from 'guest' and word.access_tier is distinct from 'login')
        or word.catalog_version is distinct from prompt.catalog_version
        or word.record_hash is distinct from prompt.record_hash
        or word.canonical_record ->> 'word' is distinct from prompt.canonical_answer)
  ) then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'typing_canonical_changed');
  end if;

  v_result := public.phase1_typing_round_append_event_unversioned(
    p_operation_id, p_user_id, p_request_hash, p_round_id, p_expected_sequence,
    p_prompt_ordinal, p_event_type, p_answer
  );
  if v_result ->> 'ok' is distinct from 'true' then return v_result; end if;
  update public.phase1_typing_round_prompts target
  set catalog_version = reserve.catalog_version, record_hash = reserve.record_hash
  from public.phase1_typing_round_reserve_prompts reserve
  join public.phase1_typing_round_reserve_state state
    on state.round_id = reserve.round_id and state.reserve_cursor = reserve.reserve_ordinal
  where target.round_id = p_round_id and target.prompt_ordinal = p_prompt_ordinal + 1
    and reserve.round_id = p_round_id and target.catalog_version is null;
  if exists (
    select 1 from public.phase1_typing_round_prompts
    where round_id = p_round_id and (catalog_version is null or record_hash is null)
  ) then
    raise exception 'typing canonical continuation pin persistence failed';
  end if;
  return v_result;
end;
$$;

create or replace function public.phase1_typing_round_load(
  p_user_id uuid, p_round_id uuid, p_prompt_after bigint default 0,
  p_event_after bigint default 0, p_page_size smallint default 64
) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_result jsonb;
  v_round_id uuid;
  v_level text;
begin
  v_result := public.phase1_typing_round_load_unversioned(
    p_user_id, p_round_id, p_prompt_after, p_event_after, p_page_size
  );
  if v_result ->> 'ok' is distinct from 'true' then return v_result; end if;
  v_round_id := (v_result #>> '{round,round_id}')::uuid;
  v_level := case (v_result #>> '{round,level}')::smallint when 1 then '初' when 2 then '中' end;
  -- Resume validates the complete issued queue, including every unconsumed
  -- reserve row, without returning that private queue across the HTTP boundary.
  if exists (
    select 1 from public.phase1_typing_round_prompts prompt
    left join public.game_words word on word.content_key = prompt.content_key
    where prompt.round_id = v_round_id
      and (prompt.catalog_version is null or prompt.record_hash is null
        or word.content_key is null or word.level is distinct from v_level
        or word.status is distinct from 'active'
        or (word.access_tier is distinct from 'guest' and word.access_tier is distinct from 'login')
        or word.catalog_version is distinct from prompt.catalog_version
        or word.record_hash is distinct from prompt.record_hash
        or word.canonical_record ->> 'word' is distinct from prompt.canonical_answer)
  ) or exists (
    select 1 from public.phase1_typing_round_reserve_prompts prompt
    join public.phase1_typing_round_reserve_state state on state.round_id = prompt.round_id
    left join public.game_words word on word.content_key = prompt.content_key
    where prompt.round_id = v_round_id and prompt.reserve_ordinal > state.reserve_cursor
      and (prompt.catalog_version is null or prompt.record_hash is null
        or word.content_key is null or word.level is distinct from v_level
        or word.status is distinct from 'active'
        or (word.access_tier is distinct from 'guest' and word.access_tier is distinct from 'login')
        or word.catalog_version is distinct from prompt.catalog_version
        or word.record_hash is distinct from prompt.record_hash
        or word.canonical_record ->> 'word' is distinct from prompt.canonical_answer)
  ) then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'typing_canonical_changed');
  end if;
  return pg_catalog.jsonb_set(v_result, '{prompt_page}', coalesce((
    select pg_catalog.jsonb_agg(
      page.value || pg_catalog.jsonb_build_object(
        'catalog_version', prompt.catalog_version, 'record_hash', prompt.record_hash
      ) order by page.ordinality
    )
    from pg_catalog.jsonb_array_elements(v_result -> 'prompt_page') with ordinality page(value, ordinality)
    join public.phase1_typing_round_prompts prompt
      on prompt.round_id = v_round_id
      and prompt.prompt_ordinal = (page.value ->> 'prompt_ordinal')::bigint
  ), '[]'::jsonb));
end;
$$;

revoke all on function public.phase1_typing_round_issue(uuid,uuid,text,smallint,bigint,jsonb,jsonb) from public,anon,authenticated;
revoke all on function public.phase1_typing_round_append_reserve(uuid,uuid,text,uuid,bigint,jsonb) from public,anon,authenticated;
revoke all on function public.phase1_typing_round_append_event(uuid,uuid,text,uuid,bigint,bigint,text,text) from public,anon,authenticated;
revoke all on function public.phase1_typing_round_load(uuid,uuid,bigint,bigint,smallint) from public,anon,authenticated;
-- Renaming preserves ACLs. Remove the predecessor entry points from every API
-- role; only the hardened same-owner SECURITY DEFINER wrappers may call them.
revoke all on function public.phase1_typing_round_issue_unversioned(uuid,uuid,text,smallint,bigint,jsonb,jsonb)
  from public,anon,authenticated,service_role;
revoke all on function public.phase1_typing_round_append_reserve_unversioned(uuid,uuid,text,uuid,bigint,jsonb)
  from public,anon,authenticated,service_role;
revoke all on function public.phase1_typing_round_append_event_unversioned(uuid,uuid,text,uuid,bigint,bigint,text,text)
  from public,anon,authenticated,service_role;
revoke all on function public.phase1_typing_round_load_unversioned(uuid,uuid,bigint,bigint,smallint)
  from public,anon,authenticated,service_role;
grant execute on function public.phase1_typing_round_issue(uuid,uuid,text,smallint,bigint,jsonb,jsonb) to service_role;
grant execute on function public.phase1_typing_round_append_reserve(uuid,uuid,text,uuid,bigint,jsonb) to service_role;
grant execute on function public.phase1_typing_round_append_event(uuid,uuid,text,uuid,bigint,bigint,text,text) to service_role;
grant execute on function public.phase1_typing_round_load(uuid,uuid,bigint,bigint,smallint) to service_role;

comment on function public.phase1_typing_round_issue(uuid,uuid,text,smallint,bigint,jsonb,jsonb)
  is 'SOURCE ONLY: issue Typing prompts only when every canonical version/hash still matches.';
comment on function public.phase1_typing_round_append_reserve(uuid,uuid,text,uuid,bigint,jsonb)
  is 'SOURCE ONLY: append a bounded reserve refill only when every canonical pin still matches.';
comment on function public.phase1_typing_round_append_event(uuid,uuid,text,uuid,bigint,bigint,text,text)
  is 'SOURCE ONLY: reject stale canonical prompts/reserve and preserve pins across atomic continuation.';
comment on function public.phase1_typing_round_load(uuid,uuid,bigint,bigint,smallint)
  is 'SOURCE ONLY: internal owner load includes persisted canonical pins; HTTP projection strips them.';

commit;
