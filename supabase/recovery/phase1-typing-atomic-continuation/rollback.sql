-- SOURCE ONLY — undo only the atomic-continuation migration.
-- Exact previous event function from 20260922175100 is restored below.
-- Issued prompts, events, round counters and earlier operation evidence survive.
-- All new reserve rows, cursors and batch receipts are removed, including consumed rows.
-- Before any real rollback, preserve/export all three new tables and obtain exact
-- HIGH-risk approval. Only an owned disposable fixture rollback is authorized here.
begin;
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
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'replacement_prompt_required');
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
  set next_event_sequence = next_event_sequence + 1,
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

revoke all on function public.phase1_typing_round_append_event(uuid,uuid,text,uuid,bigint,bigint,text,text)
  from public, anon, authenticated;
grant execute on function public.phase1_typing_round_append_event(uuid,uuid,text,uuid,bigint,bigint,text,text)
  to service_role;
drop function if exists public.phase1_typing_round_append_reserve(uuid,uuid,text,uuid,bigint,jsonb);
drop table if exists public.phase1_typing_round_reserve_batches;
drop table if exists public.phase1_typing_round_reserve_prompts;
drop table if exists public.phase1_typing_round_reserve_state;
commit;
