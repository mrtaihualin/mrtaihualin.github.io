-- Phase 1 Played evidence: one durable item event per completed round position.

create unique index if not exists uq_practice_events_user_round_surface_ordinal
  on public.practice_events (
    user_id,
    session_id,
    surface_code,
    ((meta ->> 'ordinal')::integer)
  )
  where user_id is not null
    and session_id is not null
    and meta ? 'ordinal'
    and (meta ->> 'ordinal') ~ '^[1-9][0-9]{0,2}$';

comment on index public.uq_practice_events_user_round_surface_ordinal is
  'Phase 1 retry guard: one authenticated Played-evidence row per round position.';

create or replace function public.phase1_practice_events_record(
  p_user_id uuid,
  p_round_id uuid,
  p_surface_code text,
  p_client_completed_at timestamptz,
  p_batch_hash text,
  p_items jsonb
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_existing integer := 0;
  v_matching integer := 0;
  v_expected integer := 0;
begin
  if p_user_id is null or p_round_id is null or p_surface_code is null
     or p_batch_hash !~ '^[0-9a-f]{64}$'
     or jsonb_typeof(p_items) <> 'array' then
    return jsonb_build_object('ok', false, 'reason', 'invalid_arguments');
  end if;

  v_expected := jsonb_array_length(p_items);
  if v_expected < 1 or v_expected > 100 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_items');
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_user_id::text || ':' || p_round_id::text || ':' || p_surface_code, 0)
  );

  select count(*), count(*) filter (where e.meta ->> 'batch_hash' = p_batch_hash)
    into v_existing, v_matching
  from public.practice_events e
  where e.user_id = p_user_id
    and e.session_id = p_round_id
    and e.surface_code = p_surface_code;

  if v_existing > 0 then
    if v_existing = v_expected and v_matching = v_expected then
      return jsonb_build_object('ok', true, 'idempotent', true, 'recorded', v_existing);
    end if;
    return jsonb_build_object('ok', false, 'reason', 'replay_conflict');
  end if;

  insert into public.practice_events (
    user_id, item_id, surface_code, is_correct, result, evidence_source,
    session_id, meta, created_at
  )
  select
    p_user_id,
    (entry.value ->> 'item_id')::uuid,
    p_surface_code,
    (entry.value ->> 'is_correct')::boolean,
    case when (entry.value ->> 'is_correct')::boolean then 'correct' else 'incorrect' end,
    'game',
    p_round_id,
    jsonb_build_object(
      'schema_version', 'played-evidence-v1',
      'batch_hash', p_batch_hash,
      'ordinal', (entry.value ->> 'ordinal')::integer,
      'wrong_count', (entry.value ->> 'wrong_count')::integer,
      'hint_used', entry.value -> 'hint_used',
      'listen_count', entry.value -> 'listen_count',
      'client_completed_at', p_client_completed_at
    ),
    pg_catalog.now()
  from jsonb_array_elements(p_items) as entry(value);

  return jsonb_build_object('ok', true, 'idempotent', false, 'recorded', v_expected);
exception
  when foreign_key_violation or check_violation or invalid_text_representation then
    return jsonb_build_object('ok', false, 'reason', 'invalid_items');
end;
$$;

create or replace function public.phase1_practice_event_status(
  p_user_id uuid,
  p_item_ids uuid[]
) returns table(item_id uuid, last_played_at timestamptz, surface_code text)
language sql
stable
security invoker
set search_path = ''
as $$
  select distinct on (e.item_id)
    e.item_id,
    e.created_at as last_played_at,
    e.surface_code
  from public.practice_events e
  where e.user_id = p_user_id
    and e.item_id = any(p_item_ids)
  order by e.item_id, e.created_at desc, e.event_id desc;
$$;

revoke all on function public.phase1_practice_events_record(uuid, uuid, text, timestamptz, text, jsonb) from public, anon, authenticated;
grant execute on function public.phase1_practice_events_record(uuid, uuid, text, timestamptz, text, jsonb) to service_role;
revoke all on function public.phase1_practice_event_status(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.phase1_practice_event_status(uuid, uuid[]) to service_role;
