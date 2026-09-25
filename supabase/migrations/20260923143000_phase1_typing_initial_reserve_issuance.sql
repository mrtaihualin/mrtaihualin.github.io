-- SOURCE ONLY — atomic initial Typing round plus bounded protected reserve.
-- Apply only after the round-event and atomic-continuation migrations and a
-- fresh exact Production approval. HTTP/browser adoption remains OFF.
begin;

create or replace function public.phase1_typing_round_issue(
  p_operation_id uuid,
  p_user_id uuid,
  p_request_hash text,
  p_level smallint,
  p_starting_combo bigint,
  p_prompts jsonb,
  p_reserve_prompts jsonb
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_existing public.phase1_typing_round_operations%rowtype;
  v_active_round_id uuid;
  v_round_id uuid;
  v_prompt jsonb;
  v_reserve_count bigint;
  v_request_payload jsonb;
  v_response jsonb;
begin
  if p_operation_id is null or p_user_id is null
     or p_request_hash is null or p_request_hash !~ '^[0-9a-f]{64}$'
     or p_level is null or p_level not in (1, 2)
     or p_starting_combo is null or p_starting_combo < 0
     or pg_catalog.jsonb_typeof(p_prompts) is distinct from 'array'
     or pg_catalog.jsonb_typeof(p_reserve_prompts) is distinct from 'array'
     or pg_catalog.jsonb_array_length(p_prompts) <> 5
     or pg_catalog.jsonb_array_length(p_reserve_prompts) > 64 then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'invalid_arguments');
  end if;
  v_reserve_count := pg_catalog.jsonb_array_length(p_reserve_prompts);
  v_request_payload := pg_catalog.jsonb_build_object(
    'level', p_level,
    'starting_combo', p_starting_combo,
    'prompts', p_prompts,
    'reserve_prompts', p_reserve_prompts
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('phase1-typing-operation:' || p_operation_id::text, 0)
  );
  select * into v_existing
  from public.phase1_typing_round_operations
  where operation_id = p_operation_id;
  if found then
    if v_existing.user_id is distinct from p_user_id
       or v_existing.operation_type is distinct from 'create_round'
       or v_existing.request_hash is distinct from p_request_hash
       or v_existing.request_payload is distinct from v_request_payload then
      return pg_catalog.jsonb_build_object('ok', false, 'reason', 'replay_conflict');
    end if;
    return v_existing.response || pg_catalog.jsonb_build_object('idempotent', true);
  end if;

  for v_prompt in
    select value from pg_catalog.jsonb_array_elements(p_prompts || p_reserve_prompts)
  loop
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
  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_prompts || p_reserve_prompts) prompt(value)
    group by prompt.value #>> '{content_ref,source}', prompt.value #>> '{content_ref,key}'
    having pg_catalog.count(*) > 1
  ) then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'duplicate_prompt');
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('phase1-typing-user:' || p_user_id::text, 0)
  );
  select round_id into v_active_round_id
  from public.phase1_typing_rounds
  where user_id = p_user_id and status = 'active';
  if found then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'reason', 'active_round_exists', 'round_id', v_active_round_id
    );
  end if;

  insert into public.phase1_typing_rounds (
    user_id, level, starting_combo, prompt_count
  ) values (
    p_user_id, p_level, p_starting_combo, 5
  ) returning round_id into v_round_id;

  insert into public.phase1_typing_round_prompts (
    round_id, prompt_ordinal, content_source, content_key, canonical_answer, golden, srs_bonus
  )
  select v_round_id, prompt.ordinality, 'game_words',
    prompt.value #>> '{content_ref,key}', prompt.value ->> 'answer',
    (prompt.value ->> 'golden')::boolean, (prompt.value ->> 'srs_bonus')::boolean
  from pg_catalog.jsonb_array_elements(p_prompts) with ordinality as prompt(value, ordinality);

  insert into public.phase1_typing_round_reserve_state(round_id, reserve_count, reserve_cursor)
  values (v_round_id, v_reserve_count, 0);
  insert into public.phase1_typing_round_reserve_prompts(
    round_id, reserve_ordinal, content_source, content_key, canonical_answer, golden, srs_bonus
  )
  select v_round_id, prompt.ordinality, 'game_words',
    prompt.value #>> '{content_ref,key}', prompt.value ->> 'answer',
    (prompt.value ->> 'golden')::boolean, (prompt.value ->> 'srs_bonus')::boolean
  from pg_catalog.jsonb_array_elements(p_reserve_prompts) with ordinality as prompt(value, ordinality);

  v_response := pg_catalog.jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'operation_id', p_operation_id,
    'round_id', v_round_id,
    'game', 'typing',
    'level', p_level,
    'starting_combo', p_starting_combo,
    'status', 'active',
    'prompt_count', 5,
    'reserve_count', v_reserve_count,
    'next_event_sequence', 1,
    'current_prompt_ordinal', 1,
    'completed_count', 0,
    'skip_count', 0
  );
  insert into public.phase1_typing_round_operations (
    operation_id, user_id, round_id, operation_type, request_hash, request_payload, response
  ) values (
    p_operation_id, p_user_id, v_round_id, 'create_round', p_request_hash, v_request_payload, v_response
  );
  return v_response;
end;
$$;

revoke all on function public.phase1_typing_round_issue(uuid,uuid,text,smallint,bigint,jsonb,jsonb)
  from public, anon, authenticated;
grant execute on function public.phase1_typing_round_issue(uuid,uuid,text,smallint,bigint,jsonb,jsonb)
  to service_role;
comment on function public.phase1_typing_round_issue(uuid,uuid,text,smallint,bigint,jsonb,jsonb)
  is 'SOURCE ONLY: atomically issue five protected Typing prompts and one bounded ordered reserve batch.';

commit;
