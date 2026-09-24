-- SOURCE ONLY — protected ordered Typing reserve and atomic terminal continuation.
-- Apply only after the 20260922175100 foundation and exact Production approval.
-- Trusted issuance owner must supply canonical, entitlement/quota-approved prompts.
-- No allocation, Golden draw, HTTP activation or final learning writes are added here.
begin;

create table if not exists public.phase1_typing_round_reserve_state (
  round_id uuid primary key references public.phase1_typing_rounds(round_id) on delete cascade,
  reserve_count bigint not null default 0 check (reserve_count >= 0),
  reserve_cursor bigint not null default 0 check (reserve_cursor >= 0 and reserve_cursor <= reserve_count)
);

create table if not exists public.phase1_typing_round_reserve_prompts (
  round_id uuid not null references public.phase1_typing_round_reserve_state(round_id) on delete cascade,
  reserve_ordinal bigint not null check (reserve_ordinal >= 1),
  content_source text not null check (content_source = 'game_words'),
  content_key text not null check (
    pg_catalog.length(content_key) between 1 and 512 and content_key = pg_catalog.btrim(content_key)
  ),
  canonical_answer text not null check (
    pg_catalog.length(canonical_answer) between 1 and 512 and canonical_answer = pg_catalog.btrim(canonical_answer)
  ),
  golden boolean not null,
  srs_bonus boolean not null,
  primary key (round_id, reserve_ordinal)
);

-- Batch IDs have their own namespace; all exact input is retained for durable replay.
create table if not exists public.phase1_typing_round_reserve_batches (
  batch_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  round_id uuid not null references public.phase1_typing_round_reserve_state(round_id) on delete cascade,
  request_hash text not null check (request_hash ~ '^[0-9a-f]{64}$'),
  request_payload jsonb not null,
  response jsonb not null
);
create index if not exists phase1_typing_round_reserve_batches_round_idx
  on public.phase1_typing_round_reserve_batches(round_id);
create index if not exists phase1_typing_round_reserve_batches_user_idx
  on public.phase1_typing_round_reserve_batches(user_id);

alter table public.phase1_typing_round_reserve_state enable row level security;
alter table public.phase1_typing_round_reserve_state force row level security;
alter table public.phase1_typing_round_reserve_prompts enable row level security;
alter table public.phase1_typing_round_reserve_prompts force row level security;
alter table public.phase1_typing_round_reserve_batches enable row level security;
alter table public.phase1_typing_round_reserve_batches force row level security;
revoke all on table public.phase1_typing_round_reserve_state from public, anon, authenticated;
revoke all on table public.phase1_typing_round_reserve_prompts from public, anon, authenticated;
revoke all on table public.phase1_typing_round_reserve_batches from public, anon, authenticated;
grant select, insert, update on table public.phase1_typing_round_reserve_state to service_role;
grant select, insert on table public.phase1_typing_round_reserve_prompts to service_role;
grant select, insert on table public.phase1_typing_round_reserve_batches to service_role;

create or replace function public.phase1_typing_round_append_reserve(
  p_batch_id uuid,
  p_user_id uuid,
  p_request_hash text,
  p_round_id uuid,
  p_expected_reserve_count bigint,
  p_prompts jsonb
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_existing public.phase1_typing_round_reserve_batches%rowtype;
  v_round public.phase1_typing_rounds%rowtype;
  v_prompt jsonb;
  v_count bigint;
  v_added bigint;
  v_request_payload jsonb;
  v_response jsonb;
begin
  if p_batch_id is null or p_user_id is null or p_round_id is null
     or p_request_hash is null or p_request_hash !~ '^[0-9a-f]{64}$'
     or p_expected_reserve_count is null or p_expected_reserve_count < 0
     or pg_catalog.jsonb_typeof(p_prompts) is distinct from 'array' then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'invalid_arguments');
  end if;
  v_added := pg_catalog.jsonb_array_length(p_prompts);
  if v_added < 1 or v_added > 64 then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'invalid_arguments');
  end if;
  v_request_payload := pg_catalog.jsonb_build_object(
    'round_id', p_round_id, 'expected_reserve_count', p_expected_reserve_count, 'prompts', p_prompts
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('phase1-typing-reserve-batch:' || p_batch_id::text, 0)
  );
  select * into v_existing from public.phase1_typing_round_reserve_batches
  where batch_id = p_batch_id;
  if found then
    if v_existing.user_id is distinct from p_user_id
       or v_existing.round_id is distinct from p_round_id
       or v_existing.request_hash is distinct from p_request_hash
       or v_existing.request_payload is distinct from v_request_payload then
      return pg_catalog.jsonb_build_object('ok', false, 'reason', 'replay_conflict');
    end if;
    return v_existing.response || pg_catalog.jsonb_build_object('idempotent', true);
  end if;

  -- Validate the complete batch before any writes. This is storage validation;
  -- canonical provenance/entitlement/quota selection belongs to the protected owner.
  for v_prompt in select value from pg_catalog.jsonb_array_elements(p_prompts) loop
    if pg_catalog.jsonb_typeof(v_prompt) is distinct from 'object'
       or pg_catalog.jsonb_typeof(v_prompt -> 'content_ref') is distinct from 'object'
       or v_prompt #>> '{content_ref,source}' is distinct from 'game_words'
       or pg_catalog.jsonb_typeof(v_prompt #> '{content_ref,key}') is distinct from 'string'
       or nullif(pg_catalog.btrim(v_prompt #>> '{content_ref,key}'), '') is null
       or v_prompt #>> '{content_ref,key}' is distinct from pg_catalog.btrim(v_prompt #>> '{content_ref,key}')
       or pg_catalog.length(v_prompt #>> '{content_ref,key}') > 512
       or pg_catalog.jsonb_typeof(v_prompt -> 'answer') is distinct from 'string'
       or nullif(pg_catalog.btrim(v_prompt ->> 'answer'), '') is null
       or v_prompt ->> 'answer' is distinct from pg_catalog.btrim(v_prompt ->> 'answer')
       or pg_catalog.length(v_prompt ->> 'answer') > 512
       or pg_catalog.jsonb_typeof(v_prompt -> 'golden') is distinct from 'boolean'
       or pg_catalog.jsonb_typeof(v_prompt -> 'srs_bonus') is distinct from 'boolean' then
      return pg_catalog.jsonb_build_object('ok', false, 'reason', 'invalid_prompt');
    end if;
  end loop;

  -- All prompt, event and reserve writers serialize on this same owned round.
  select * into v_round from public.phase1_typing_rounds
  where round_id = p_round_id and user_id = p_user_id for update;
  if not found then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'round_not_found');
  end if;
  if v_round.status <> 'active' then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'round_not_active');
  end if;
  select reserve_count into v_count from public.phase1_typing_round_reserve_state
  where round_id = p_round_id;
  v_count := coalesce(v_count, 0);
  if v_count is distinct from p_expected_reserve_count then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'reason', 'resync_required', 'reserve_count', v_count
    );
  end if;

  insert into public.phase1_typing_round_reserve_state(round_id, reserve_count)
  values (p_round_id, v_count + v_added)
  on conflict (round_id) do update set reserve_count = excluded.reserve_count;
  insert into public.phase1_typing_round_reserve_prompts(
    round_id, reserve_ordinal, content_source, content_key, canonical_answer, golden, srs_bonus
  )
  select p_round_id, v_count + prompt.ordinality, 'game_words',
    prompt.value #>> '{content_ref,key}', prompt.value ->> 'answer',
    (prompt.value ->> 'golden')::boolean, (prompt.value ->> 'srs_bonus')::boolean
  from pg_catalog.jsonb_array_elements(p_prompts) with ordinality as prompt(value, ordinality);

  v_response := pg_catalog.jsonb_build_object(
    'ok', true, 'idempotent', false, 'batch_id', p_batch_id, 'round_id', p_round_id,
    'added_reserve_count', v_added, 'reserve_count', v_count + v_added
  );
  insert into public.phase1_typing_round_reserve_batches(
    batch_id, user_id, round_id, request_hash, request_payload, response
  ) values (p_batch_id, p_user_id, p_round_id, p_request_hash, v_request_payload, v_response);
  return v_response;
end;
$$;
revoke all on function public.phase1_typing_round_append_reserve(uuid,uuid,text,uuid,bigint,jsonb)
  from public, anon, authenticated;
grant execute on function public.phase1_typing_round_append_reserve(uuid,uuid,text,uuid,bigint,jsonb)
  to service_role;

create or replace function public.phase1_typing_round_append_event(
  p_operation_id uuid,
  p_user_id uuid,
  p_request_hash text,
  p_round_id uuid,
  p_expected_sequence bigint,
  p_prompt_ordinal bigint,
  p_event_type text,
  p_answer text default null
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_existing public.phase1_typing_round_operations%rowtype;
  v_round public.phase1_typing_rounds%rowtype;
  v_prompt public.phase1_typing_round_prompts%rowtype;
  v_reserve_prompt public.phase1_typing_round_reserve_prompts%rowtype;
  v_added_prompt bigint := 0;
  v_completed_count smallint;
  v_skip_count bigint;
  v_status text;
  v_request_payload jsonb;
  v_response jsonb;
begin
  if p_operation_id is null or p_user_id is null or p_round_id is null
     or p_request_hash is null or p_request_hash !~ '^[0-9a-f]{64}$'
     or p_expected_sequence is null or p_expected_sequence < 1
     or p_prompt_ordinal is null or p_prompt_ordinal < 1
     or p_event_type is null
     or p_event_type not in ('wrong', 'hint_opened', 'completed', 'skipped')
     or (p_event_type = 'completed' and (
       nullif(pg_catalog.btrim(p_answer), '') is null
       or p_answer is distinct from pg_catalog.btrim(p_answer)
       or pg_catalog.length(p_answer) > 512
     ))
     or (p_event_type <> 'completed' and p_answer is not null) then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'invalid_arguments');
  end if;

  v_request_payload := pg_catalog.jsonb_build_object(
    'round_id', p_round_id,
    'expected_sequence', p_expected_sequence,
    'prompt_ordinal', p_prompt_ordinal,
    'event_type', p_event_type,
    'answer', p_answer
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('phase1-typing-operation:' || p_operation_id::text, 0)
  );

  select * into v_existing
  from public.phase1_typing_round_operations
  where operation_id = p_operation_id;
  if found then
    if v_existing.user_id is distinct from p_user_id
       or v_existing.round_id is distinct from p_round_id
       or v_existing.operation_type is distinct from 'append_event'
       or v_existing.request_hash is distinct from p_request_hash
       or v_existing.request_payload is distinct from v_request_payload then
      return pg_catalog.jsonb_build_object('ok', false, 'reason', 'replay_conflict');
    end if;
    return v_existing.response || pg_catalog.jsonb_build_object('idempotent', true);
  end if;

  select * into v_round
  from public.phase1_typing_rounds
  where round_id = p_round_id and user_id = p_user_id
  for update;
  if not found then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'round_not_found');
  end if;
  if v_round.status <> 'active' then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'round_not_active');
  end if;
  if v_round.next_event_sequence is distinct from p_expected_sequence
     or v_round.current_prompt_ordinal is distinct from p_prompt_ordinal then
    return pg_catalog.jsonb_build_object(
      'ok', false,
      'reason', 'resync_required',
      'next_event_sequence', v_round.next_event_sequence,
      'current_prompt_ordinal', v_round.current_prompt_ordinal
    );
  end if;

  select * into v_prompt
  from public.phase1_typing_round_prompts
  where round_id = p_round_id and prompt_ordinal = p_prompt_ordinal;
  if not found then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'prompt_not_found');
  end if;

  if p_event_type = 'completed' and p_answer is distinct from v_prompt.canonical_answer then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'answer_mismatch');
  end if;
  if p_event_type = 'completed' and exists (
    select 1
    from public.phase1_typing_round_events e
    join public.phase1_typing_round_prompts old_prompt
      on old_prompt.round_id = e.round_id and old_prompt.prompt_ordinal = e.prompt_ordinal
    where e.round_id = p_round_id
      and e.event_type = 'completed'
      and old_prompt.content_source = v_prompt.content_source
      and old_prompt.content_key = v_prompt.content_key
  ) then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'duplicate_completed_content');
  end if;

  if p_event_type in ('completed', 'skipped')
     and not (p_event_type = 'completed' and v_round.completed_count = 4)
     and not exists (
       select 1 from public.phase1_typing_round_prompts next_prompt
       where next_prompt.round_id = p_round_id
         and next_prompt.prompt_ordinal = p_prompt_ordinal + 1
     ) then
    -- Existing queued next prompts win. Only the tail needs a continuation.
    -- Exclude completed identities, including the currently completing prompt;
    -- a skipped identity is eligible if the protected owner queued it again.
    select candidate.* into v_reserve_prompt
    from public.phase1_typing_round_reserve_prompts candidate
    join public.phase1_typing_round_reserve_state reserve_state
      on reserve_state.round_id = candidate.round_id
    where candidate.round_id = p_round_id
      and candidate.reserve_ordinal > reserve_state.reserve_cursor
      and not (p_event_type = 'completed'
        and candidate.content_source = v_prompt.content_source
        and candidate.content_key = v_prompt.content_key)
      and not exists (
        select 1 from public.phase1_typing_round_events e
        join public.phase1_typing_round_prompts completed_prompt
          on completed_prompt.round_id = e.round_id
          and completed_prompt.prompt_ordinal = e.prompt_ordinal
        where e.round_id = p_round_id and e.event_type = 'completed'
          and completed_prompt.content_source = candidate.content_source
          and completed_prompt.content_key = candidate.content_key
      )
    order by candidate.reserve_ordinal
    limit 1;
    if not found then
      return pg_catalog.jsonb_build_object('ok', false, 'reason', 'typing_reserve_exhausted');
    end if;
    insert into public.phase1_typing_round_prompts(
      round_id, prompt_ordinal, content_source, content_key, canonical_answer, golden, srs_bonus
    ) values (
      p_round_id, p_prompt_ordinal + 1, v_reserve_prompt.content_source,
      v_reserve_prompt.content_key, v_reserve_prompt.canonical_answer,
      v_reserve_prompt.golden, v_reserve_prompt.srs_bonus
    );
    update public.phase1_typing_round_reserve_state
    set reserve_cursor = v_reserve_prompt.reserve_ordinal where round_id = p_round_id;
    v_added_prompt := 1;
  end if;

  insert into public.phase1_typing_round_events (
    operation_id, request_hash, round_id, sequence, prompt_ordinal, event_type, answer
  ) values (
    p_operation_id, p_request_hash, p_round_id, p_expected_sequence,
    p_prompt_ordinal, p_event_type, p_answer
  );

  v_completed_count := v_round.completed_count + case when p_event_type = 'completed' then 1 else 0 end;
  v_skip_count := v_round.skip_count + case when p_event_type = 'skipped' then 1 else 0 end;
  v_status := case when v_completed_count = 5 then 'completed' else 'active' end;

  update public.phase1_typing_rounds
  set prompt_count = prompt_count + v_added_prompt,
      next_event_sequence = next_event_sequence + 1,
      current_prompt_ordinal = current_prompt_ordinal +
        case when p_event_type in ('completed', 'skipped') then 1 else 0 end,
      completed_count = v_completed_count,
      skip_count = v_skip_count,
      status = v_status,
      completed_at = case when v_status = 'completed' then pg_catalog.clock_timestamp() else null end,
      updated_at = pg_catalog.clock_timestamp()
  where round_id = p_round_id;

  v_response := pg_catalog.jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'operation_id', p_operation_id,
    'round_id', p_round_id,
    'event', pg_catalog.jsonb_build_object(
      'sequence', p_expected_sequence,
      'prompt_ordinal', p_prompt_ordinal,
      'type', p_event_type
    ),
    'status', v_status,
    'next_event_sequence', p_expected_sequence + 1,
    'current_prompt_ordinal', p_prompt_ordinal +
      case when p_event_type in ('completed', 'skipped') then 1 else 0 end,
    'completed_count', v_completed_count,
    'skip_count', v_skip_count
  );

  insert into public.phase1_typing_round_operations (
    operation_id, user_id, round_id, operation_type, request_hash, request_payload, response
  ) values (
    p_operation_id, p_user_id, p_round_id, 'append_event', p_request_hash, v_request_payload, v_response
  );

  return v_response;
end;
$$;

-- Reassert the unchanged event API boundary after replacement.
revoke all on function public.phase1_typing_round_append_event(uuid,uuid,text,uuid,bigint,bigint,text,text)
  from public, anon, authenticated;
grant execute on function public.phase1_typing_round_append_event(uuid,uuid,text,uuid,bigint,bigint,text,text)
  to service_role;
commit;
