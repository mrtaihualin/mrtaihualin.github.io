-- Source only. Preserve neutral Free Practice and Skip outcomes in Played evidence.
-- Production apply remains a separate HIGH-risk action requiring exact approval.

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

  -- Preserve the installed skip-reason contract while adding explicit neutral flags.
  if exists (
    select 1
    from jsonb_array_elements(p_items) as checked(value)
    where checked.value -> 'skip_reason' is not null
      and checked.value -> 'skip_reason' <> 'null'::jsonb
      and (
        jsonb_typeof(checked.value -> 'skip_reason') <> 'string'
        or checked.value ->> 'skip_reason' not in ('user_skip', 'audio_unavailable')
      )
  ) then
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
    case
      when entry.value ->> 'skip_reason' is not null then null
      when coalesce((entry.value ->> 'is_skipped')::boolean, false) then null
      when coalesce((entry.value ->> 'is_practice')::boolean, false) then null
      else (entry.value ->> 'is_correct')::boolean
    end,
    case
      when entry.value ->> 'skip_reason' is not null then 'skipped'
      when coalesce((entry.value ->> 'is_skipped')::boolean, false) then 'skipped'
      when coalesce((entry.value ->> 'is_practice')::boolean, false) then 'practice'
      when (entry.value ->> 'is_correct')::boolean then 'correct'
      else 'incorrect'
    end,
    'game',
    p_round_id,
    jsonb_build_object(
      'schema_version', 'played-evidence-v1',
      'batch_hash', p_batch_hash,
      'ordinal', (entry.value ->> 'ordinal')::integer,
      'wrong_count', (entry.value ->> 'wrong_count')::integer,
      'is_practice', coalesce((entry.value ->> 'is_practice')::boolean, false),
      'is_skipped', entry.value ->> 'skip_reason' is not null
        or coalesce((entry.value ->> 'is_skipped')::boolean, false),
      'hint_used', entry.value -> 'hint_used',
      'listen_count', entry.value -> 'listen_count',
      'skip_reason', entry.value -> 'skip_reason',
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

revoke all on function public.phase1_practice_events_record(uuid, uuid, text, timestamptz, text, jsonb) from public, anon, authenticated;
grant execute on function public.phase1_practice_events_record(uuid, uuid, text, timestamptz, text, jsonb) to service_role;
