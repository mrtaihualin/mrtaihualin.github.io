-- SOURCE ONLY — protected bounded Typing reserve-refill read/commit boundary.
-- Apply only after 20260923170000 and fresh exact Production approval.
-- HTTP/browser activation remains OFF.
begin;

create or replace function public.phase1_typing_round_reserve_load(
  p_user_id uuid,
  p_round_id uuid,
  p_reserve_after bigint default 0,
  p_page_size smallint default 64
) returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_round public.phase1_typing_rounds%rowtype;
  v_state public.phase1_typing_round_reserve_state%rowtype;
  v_level text;
  v_next bigint;
begin
  if p_user_id is null or p_round_id is null or p_reserve_after is null or p_reserve_after < 0
     or p_page_size is null or p_page_size < 1 or p_page_size > 64 then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'invalid_arguments');
  end if;
  select * into v_round from public.phase1_typing_rounds
  where round_id = p_round_id and user_id = p_user_id;
  if not found then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'round_not_found');
  end if;
  if v_round.status <> 'active' then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'round_not_active');
  end if;
  select * into v_state from public.phase1_typing_round_reserve_state where round_id = p_round_id;
  if not found or p_reserve_after > v_state.reserve_count then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'resync_required');
  end if;
  v_level := case v_round.level when 1 then '初' when 2 then '中' end;
  if v_level is null or exists (
    select 1 from public.phase1_typing_round_prompts prompt
    left join public.game_words word on word.content_key = prompt.content_key
    where prompt.round_id = p_round_id
      and (prompt.catalog_version is null or prompt.record_hash is null
        or word.content_key is null or word.level is distinct from v_level
        or word.status is distinct from 'active'
        or (word.access_tier is distinct from 'guest' and word.access_tier is distinct from 'login')
        or word.catalog_version is distinct from prompt.catalog_version
        or word.record_hash is distinct from prompt.record_hash
        or word.canonical_record ->> 'word' is distinct from prompt.canonical_answer)
  ) or exists (
    select 1 from public.phase1_typing_round_reserve_prompts prompt
    left join public.game_words word on word.content_key = prompt.content_key
    where prompt.round_id = p_round_id and prompt.reserve_ordinal > v_state.reserve_cursor
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
  v_next := least(v_state.reserve_count, p_reserve_after + p_page_size);
  return pg_catalog.jsonb_build_object(
    'ok', true,
    'round', pg_catalog.jsonb_build_object(
      'round_id', v_round.round_id, 'level', v_round.level, 'status', v_round.status,
      'next_event_sequence', v_round.next_event_sequence,
      'current_prompt_ordinal', v_round.current_prompt_ordinal,
      'prompt_count', v_round.prompt_count, 'completed_count', v_round.completed_count,
      'skip_count', v_round.skip_count
    ),
    'reserve', pg_catalog.jsonb_build_object(
      'reserve_count', v_state.reserve_count, 'reserve_cursor', v_state.reserve_cursor
    ),
    'reserve_page', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'reserve_ordinal', prompt.reserve_ordinal,
        'content_ref', pg_catalog.jsonb_build_object(
          'source', prompt.content_source, 'key', prompt.content_key
        ),
        'catalog_version', prompt.catalog_version, 'record_hash', prompt.record_hash
      ) order by prompt.reserve_ordinal)
      from public.phase1_typing_round_reserve_prompts prompt
      where prompt.round_id = p_round_id
        and prompt.reserve_ordinal > p_reserve_after
        and prompt.reserve_ordinal <= v_next
    ), '[]'::jsonb),
    'next_reserve_after', v_next,
    'has_more_reserves', v_next < v_state.reserve_count
  );
end;
$$;

create or replace function public.phase1_typing_round_refill(
  p_batch_id uuid,
  p_user_id uuid,
  p_request_hash text,
  p_round_id uuid,
  p_expected_event_sequence bigint,
  p_expected_prompt_ordinal bigint,
  p_expected_prompt_count bigint,
  p_expected_completed_count smallint,
  p_expected_skip_count bigint,
  p_expected_reserve_count bigint,
  p_expected_reserve_cursor bigint,
  p_prompts jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_round public.phase1_typing_rounds%rowtype;
  v_state public.phase1_typing_round_reserve_state%rowtype;
  v_level text;
begin
  if p_batch_id is null or p_user_id is null or p_round_id is null
     or p_request_hash is null or p_request_hash !~ '^[0-9a-f]{64}$'
     or p_expected_event_sequence is null or p_expected_event_sequence < 1
     or p_expected_prompt_ordinal is null or p_expected_prompt_ordinal < 1
     or p_expected_prompt_count is null or p_expected_prompt_count < 5
     or p_expected_completed_count is null or p_expected_completed_count < 0 or p_expected_completed_count > 5
     or p_expected_skip_count is null or p_expected_skip_count < 0
     or p_expected_reserve_count is null or p_expected_reserve_count < 0
     or p_expected_reserve_cursor is null or p_expected_reserve_cursor < 0
     or p_expected_reserve_cursor > p_expected_reserve_count
     or pg_catalog.jsonb_typeof(p_prompts) is distinct from 'array' then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'invalid_arguments');
  end if;

  -- Match the canonical append entrypoint's round-before-batch lock order. The
  -- saved receipt wins every retry, even after round/reserve state has moved on.
  if exists (select 1 from public.phase1_typing_round_reserve_batches where batch_id = p_batch_id) then
    return public.phase1_typing_round_append_reserve(
      p_batch_id, p_user_id, p_request_hash, p_round_id, p_expected_reserve_count, p_prompts
    );
  end if;

  select * into v_round from public.phase1_typing_rounds
  where round_id = p_round_id and user_id = p_user_id for update;
  if not found then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'round_not_found');
  end if;
  if exists (select 1 from public.phase1_typing_round_reserve_batches where batch_id = p_batch_id) then
    return public.phase1_typing_round_append_reserve(
      p_batch_id, p_user_id, p_request_hash, p_round_id, p_expected_reserve_count, p_prompts
    );
  end if;
  if v_round.status <> 'active' then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'round_not_active');
  end if;
  if v_round.next_event_sequence is distinct from p_expected_event_sequence
     or v_round.current_prompt_ordinal is distinct from p_expected_prompt_ordinal
     or v_round.prompt_count is distinct from p_expected_prompt_count
     or v_round.completed_count is distinct from p_expected_completed_count
     or v_round.skip_count is distinct from p_expected_skip_count then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'resync_required');
  end if;

  select * into v_state from public.phase1_typing_round_reserve_state
  where round_id = p_round_id for update;
  if not found or v_state.reserve_count is distinct from p_expected_reserve_count
     or v_state.reserve_cursor is distinct from p_expected_reserve_cursor then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'resync_required');
  end if;
  v_level := case v_round.level when 1 then '初' when 2 then '中' end;
  -- Hold every already-issued identity that can affect this active round through
  -- commit. The canonical append wrapper separately locks the new batch.
  perform word.content_key
  from public.game_words word
  where word.content_key in (
    select prompt.content_key from public.phase1_typing_round_prompts prompt
    where prompt.round_id = p_round_id
    union
    select prompt.content_key from public.phase1_typing_round_reserve_prompts prompt
    where prompt.round_id = p_round_id and prompt.reserve_ordinal > v_state.reserve_cursor
  )
  for share of word;
  if v_level is null or exists (
    select 1 from public.phase1_typing_round_prompts prompt
    left join public.game_words word on word.content_key = prompt.content_key
    where prompt.round_id = p_round_id
      and (prompt.catalog_version is null or prompt.record_hash is null
        or word.content_key is null or word.level is distinct from v_level
        or word.status is distinct from 'active'
        or (word.access_tier is distinct from 'guest' and word.access_tier is distinct from 'login')
        or word.catalog_version is distinct from prompt.catalog_version
        or word.record_hash is distinct from prompt.record_hash
        or word.canonical_record ->> 'word' is distinct from prompt.canonical_answer)
  ) or exists (
    select 1 from public.phase1_typing_round_reserve_prompts prompt
    left join public.game_words word on word.content_key = prompt.content_key
    where prompt.round_id = p_round_id and prompt.reserve_ordinal > v_state.reserve_cursor
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
  return public.phase1_typing_round_append_reserve(
    p_batch_id, p_user_id, p_request_hash, p_round_id, p_expected_reserve_count, p_prompts
  );
end;
$$;

revoke all on function public.phase1_typing_round_reserve_load(uuid,uuid,bigint,smallint)
  from public,anon,authenticated;
revoke all on function public.phase1_typing_round_refill(uuid,uuid,text,uuid,bigint,bigint,bigint,smallint,bigint,bigint,bigint,jsonb)
  from public,anon,authenticated;
grant execute on function public.phase1_typing_round_reserve_load(uuid,uuid,bigint,smallint) to service_role;
grant execute on function public.phase1_typing_round_refill(uuid,uuid,text,uuid,bigint,bigint,bigint,smallint,bigint,bigint,bigint,jsonb)
  to service_role;

comment on function public.phase1_typing_round_reserve_load(uuid,uuid,bigint,smallint)
  is 'SOURCE ONLY: owner-bound paged reserve evidence for protected Typing refill.';
comment on function public.phase1_typing_round_refill(uuid,uuid,text,uuid,bigint,bigint,bigint,smallint,bigint,bigint,bigint,jsonb)
  is 'SOURCE ONLY: bounded receipt/CAS/canonical-pinned Typing reserve refill commit.';

commit;
