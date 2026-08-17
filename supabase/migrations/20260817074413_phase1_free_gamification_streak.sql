-- Phase 1 Free gamification: no Star/XP; server-owned Daily Streak only.
-- Production execution remains separately gated.

create table if not exists public.phase1_free_streak_status (
  user_id uuid primary key references auth.users(id) on delete cascade,
  streak_count integer not null,
  first_eligible_day date not null,
  last_eligible_day date not null,
  updated_at timestamptz not null default pg_catalog.now(),
  constraint phase1_free_streak_status_count_check check (streak_count >= 1),
  constraint phase1_free_streak_status_days_check check (first_eligible_day <= last_eligible_day)
);

create table if not exists public.phase1_free_streak_days (
  user_id uuid not null references auth.users(id) on delete cascade,
  eligible_day date not null,
  first_round_id uuid not null,
  surface_code text not null references public.practice_surfaces(code),
  recorded_at timestamptz not null default pg_catalog.now(),
  primary key (user_id, eligible_day)
);

create table if not exists public.phase1_streak_outage_days (
  outage_day date not null,
  dependency_kind text not null,
  incident_ref text not null,
  confirmed boolean not null default false,
  confirmed_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  primary key (outage_day, dependency_kind, incident_ref),
  constraint phase1_streak_outage_dependency_check
    check (dependency_kind in ('platform', 'responsible_dependency')),
  constraint phase1_streak_outage_incident_check
    check (nullif(pg_catalog.btrim(incident_ref), '') is not null and pg_catalog.length(incident_ref) <= 500),
  constraint phase1_streak_outage_confirmation_check
    check ((confirmed and confirmed_at is not null) or (not confirmed and confirmed_at is null))
);

create index if not exists phase1_streak_outage_confirmed_day_idx
  on public.phase1_streak_outage_days (outage_day)
  where confirmed = true;

alter table public.phase1_free_streak_status enable row level security;
alter table public.phase1_free_streak_days enable row level security;
alter table public.phase1_streak_outage_days enable row level security;

revoke all on table public.phase1_free_streak_status from public, anon, authenticated;
revoke all on table public.phase1_free_streak_days from public, anon, authenticated;
revoke all on table public.phase1_streak_outage_days from public, anon, authenticated;
grant select, insert, update on table public.phase1_free_streak_status to service_role;
grant select, insert on table public.phase1_free_streak_days to service_role;
grant select, insert, update, delete on table public.phase1_streak_outage_days to service_role;

comment on table public.phase1_free_streak_status is
  'Phase 1 Login Free authoritative Daily Streak state. No Star, XP, freeze, or general grace.';
comment on table public.phase1_free_streak_days is
  'One completed authenticated eligible practice round per Asia/Taipei day counts at most once.';
comment on table public.phase1_streak_outage_days is
  'Operator-confirmed platform/responsible-dependency evidence; unconfirmed rows never preserve a streak.';

create or replace function public.phase1_free_gamification_status(p_user_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_state public.phase1_free_streak_status%rowtype;
  v_today date := (pg_catalog.clock_timestamp() at time zone 'Asia/Taipei')::date;
  v_gap_start date;
  v_gap_end date;
  v_missing integer := 0;
  v_covered integer := 0;
  v_current integer := 0;
  v_preserved boolean := false;
begin
  if p_user_id is null then
    return jsonb_build_object('ok', false, 'reason', 'invalid_user');
  end if;

  select * into v_state
  from public.phase1_free_streak_status
  where user_id = p_user_id;

  if not found then
    return jsonb_build_object(
      'ok', true,
      'current_streak', 0,
      'last_eligible_day', null,
      'status_as_of', v_today,
      'preserved_by_outage', false
    );
  end if;

  v_current := v_state.streak_count;
  if v_state.last_eligible_day < v_today - 1 then
    v_gap_start := v_state.last_eligible_day + 1;
    v_gap_end := v_today - 1;
    v_missing := v_gap_end - v_gap_start + 1;
    select pg_catalog.count(distinct outage_day)::integer into v_covered
    from public.phase1_streak_outage_days
    where confirmed = true
      and outage_day between v_gap_start and v_gap_end;
    v_preserved := v_missing > 0 and v_covered = v_missing;
    if not v_preserved then v_current := 0; end if;
  end if;

  return jsonb_build_object(
    'ok', true,
    'current_streak', v_current,
    'last_eligible_day', v_state.last_eligible_day,
    'status_as_of', v_today,
    'preserved_by_outage', v_preserved
  );
end;
$$;

create or replace function public.phase1_free_gamification_apply(
  p_user_id uuid,
  p_round_id uuid,
  p_surface_code text
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_state public.phase1_free_streak_status%rowtype;
  v_day date;
  v_inserted boolean := false;
  v_gap_start date;
  v_gap_end date;
  v_missing integer := 0;
  v_covered integer := 0;
  v_next integer;
begin
  if p_user_id is null or p_round_id is null or nullif(pg_catalog.btrim(p_surface_code), '') is null then
    return jsonb_build_object('ok', false, 'reason', 'invalid_arguments');
  end if;

  -- Every mutation for one account takes this transaction-scoped lock first.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('phase1-free-streak:' || p_user_id::text, 0)
  );

  select (pg_catalog.min(e.created_at) at time zone 'Asia/Taipei')::date into v_day
  from public.practice_events e
  where e.user_id = p_user_id
    and e.session_id = p_round_id
    and e.surface_code = p_surface_code
    and e.evidence_source = 'game'
    and e.meta ->> 'schema_version' = 'played-evidence-v1';

  if v_day is null then
    return jsonb_build_object('ok', false, 'reason', 'completed_report_required');
  end if;

  insert into public.phase1_free_streak_days
    (user_id, eligible_day, first_round_id, surface_code, recorded_at)
  values
    (p_user_id, v_day, p_round_id, p_surface_code, pg_catalog.clock_timestamp())
  on conflict (user_id, eligible_day) do nothing;
  get diagnostics v_next = row_count;
  v_inserted := v_next = 1;

  select * into v_state
  from public.phase1_free_streak_status
  where user_id = p_user_id
  for update;

  if not found then
    insert into public.phase1_free_streak_status
      (user_id, streak_count, first_eligible_day, last_eligible_day, updated_at)
    values
      (p_user_id, 1, v_day, v_day, pg_catalog.clock_timestamp());
  elsif v_inserted and v_day > v_state.last_eligible_day then
    if v_day = v_state.last_eligible_day + 1 then
      v_next := v_state.streak_count + 1;
    else
      v_gap_start := v_state.last_eligible_day + 1;
      v_gap_end := v_day - 1;
      v_missing := v_gap_end - v_gap_start + 1;
      select pg_catalog.count(distinct outage_day)::integer into v_covered
      from public.phase1_streak_outage_days
      where confirmed = true
        and outage_day between v_gap_start and v_gap_end;
      v_next := case when v_missing > 0 and v_covered = v_missing
        then v_state.streak_count + 1 else 1 end;
    end if;

    update public.phase1_free_streak_status
    set streak_count = v_next,
        first_eligible_day = case when v_next = 1 then v_day else first_eligible_day end,
        last_eligible_day = v_day,
        updated_at = pg_catalog.clock_timestamp()
    where user_id = p_user_id;
  end if;

  return public.phase1_free_gamification_status(p_user_id)
    || jsonb_build_object('counted_today', v_inserted, 'eligible_day', v_day);
end;
$$;

create or replace function public.phase1_practice_events_record_and_gamification(
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
  v_record jsonb;
  v_gamification jsonb;
begin
  if p_user_id is null then
    return jsonb_build_object('ok', false, 'reason', 'invalid_arguments');
  end if;

  -- Consistent order: account lock, then the existing per-round lock.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('phase1-free-streak:' || p_user_id::text, 0)
  );

  v_record := public.phase1_practice_events_record(
    p_user_id, p_round_id, p_surface_code, p_client_completed_at, p_batch_hash, p_items
  );
  if coalesce((v_record ->> 'ok')::boolean, false) is not true then return v_record; end if;

  v_gamification := public.phase1_free_gamification_apply(p_user_id, p_round_id, p_surface_code);
  if coalesce((v_gamification ->> 'ok')::boolean, false) is not true then
    raise exception 'phase1_free_gamification_unavailable';
  end if;
  return v_record || jsonb_build_object('gamification', v_gamification);
end;
$$;

revoke all on function public.phase1_free_gamification_status(uuid) from public, anon, authenticated;
grant execute on function public.phase1_free_gamification_status(uuid) to service_role;
revoke all on function public.phase1_free_gamification_apply(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.phase1_free_gamification_apply(uuid, uuid, text) to service_role;
revoke all on function public.phase1_practice_events_record_and_gamification(
  uuid, uuid, text, timestamptz, text, jsonb
) from public, anon, authenticated;
grant execute on function public.phase1_practice_events_record_and_gamification(
  uuid, uuid, text, timestamptz, text, jsonb
) to service_role;

-- D08 removes the retired Free Star award from the existing atomic SRS commit.
-- The parameters remain backward-compatible until the obsolete reward inputs are
-- removed in a later explicitly authorized phase.
create or replace function public.phase1_tone_round_commit(
  p_operation_id uuid,
  p_user_id uuid,
  p_request_hash text,
  p_game text,
  p_level smallint,
  p_word text,
  p_expected_exists boolean,
  p_expected_stage smallint,
  p_expected_due_date text,
  p_expected_ever_failed boolean,
  p_expected_mastered boolean,
  p_next_stage smallint,
  p_next_due_date text,
  p_next_ever_failed boolean,
  p_next_mastered boolean,
  p_reason text,
  p_correct boolean,
  p_just_mastered boolean,
  p_reward_clean boolean
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_operation public.tone_round_operations%rowtype;
  v_state public.tone_srs_state%rowtype;
  v_state_found boolean;
  v_response jsonb;
  v_rows integer;
begin
  if p_operation_id is null or p_user_id is null or p_game is null or p_level is null
     or p_expected_exists is null or p_next_stage is null or p_next_due_date is null
     or p_next_ever_failed is null or p_next_mastered is null or p_reason is null
     or p_correct is null or p_just_mastered is null or p_reward_clean is null
     or p_request_hash !~ '^[0-9a-f]{64}$'
     or p_game not in ('tone', 'reading', 'listening', 'typing', 'wordorder')
     or p_level not between 1 and 3
     or nullif(pg_catalog.btrim(p_word), '') is null or pg_catalog.length(p_word) > 500
     or p_next_stage not between 0 and 3
     or p_reason not in ('known_master', 'known_reset', 'mastered', 'advanced', 'reset')
     or (p_just_mastered and not p_next_mastered) then
    raise exception 'invalid_tone_round_commit';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('phase1-tone-account:' || p_user_id::text, 0)
  );

  select * into v_operation
  from public.tone_round_operations
  where operation_id = p_operation_id
  for update;
  if found then
    if v_operation.user_id is distinct from p_user_id
       or v_operation.game is distinct from p_game
       or v_operation.level is distinct from p_level
       or v_operation.word is distinct from p_word
       or v_operation.request_hash is distinct from p_request_hash then
      return jsonb_build_object('ok', false, 'reason', 'replay_conflict');
    end if;
    return v_operation.response || jsonb_build_object('idempotent', true);
  end if;

  select * into v_state
  from public.tone_srs_state
  where user_id = p_user_id and game = p_game and level = p_level and word = p_word
  for update;
  v_state_found := found;
  if v_state_found is distinct from p_expected_exists
     or (v_state_found and (
       v_state.stage is distinct from p_expected_stage
       or v_state.due_date is distinct from p_expected_due_date
       or v_state.ever_failed is distinct from p_expected_ever_failed
       or v_state.mastered is distinct from p_expected_mastered
     )) then
    return jsonb_build_object('ok', false, 'reason', 'race_retry');
  end if;

  if v_state_found then
    update public.tone_srs_state
    set stage = p_next_stage,
        due_date = p_next_due_date,
        ever_failed = p_next_ever_failed,
        mastered = p_next_mastered,
        updated_at = pg_catalog.now()
    where user_id = p_user_id and game = p_game and level = p_level and word = p_word;
    get diagnostics v_rows = row_count;
    if v_rows <> 1 then raise exception 'tone_srs_update_failed'; end if;
  else
    insert into public.tone_srs_state
      (user_id, game, level, word, stage, due_date, ever_failed, mastered, updated_at)
    values
      (p_user_id, p_game, p_level, p_word, p_next_stage, p_next_due_date,
       p_next_ever_failed, p_next_mastered, pg_catalog.now());
  end if;

  v_response := jsonb_build_object(
    'ok', true,
    'reason', p_reason,
    'correct', p_correct,
    'justMastered', p_just_mastered,
    'stars', 0,
    'capped', false,
    'totalStars', 0,
    'idempotent', false
  );
  insert into public.tone_round_operations
    (operation_id, user_id, game, level, word, request_hash, response)
  values
    (p_operation_id, p_user_id, p_game, p_level, p_word, p_request_hash, v_response);
  return v_response;
end;
$$;

revoke all on function public.phase1_tone_round_commit(
  uuid, uuid, text, text, smallint, text, boolean, smallint, text, boolean, boolean,
  smallint, text, boolean, boolean, text, boolean, boolean, boolean
) from public, anon, authenticated;
grant execute on function public.phase1_tone_round_commit(
  uuid, uuid, text, text, smallint, text, boolean, smallint, text, boolean, boolean,
  smallint, text, boolean, boolean, text, boolean, boolean, boolean
) to service_role;
