-- Lin-only Paid SRS private beta, first tranche: Tone vocabulary only.
-- The existing Login Free SRS/Review tables and all Free users remain unchanged.

begin;

do $$
begin
  if (select count(*) from public.phase1_product_entitlements where entitlement = 'owner_all_access') <> 1 then
    raise exception 'owner_all_access entitlement invariant failed';
  end if;
  if (select count(*) from public.game_words where status = 'queued' and access_tier = 'paid') <> 189 then
    raise exception 'Paid vocabulary queue invariant failed';
  end if;
end
$$;

create table if not exists public.phase2_paid_srs_states (
  user_id uuid not null references auth.users(id) on delete cascade,
  game text not null,
  level smallint not null,
  content_key text not null references public.game_words(content_key) on delete restrict,
  origin_on date not null,
  phase text not null,
  next_checkpoint smallint,
  due_on date,
  mastered boolean not null default false,
  active_challenge boolean not null default false,
  ever_failed boolean not null default false,
  reschedule_pending boolean not null default false,
  state_token uuid not null default pg_catalog.gen_random_uuid(),
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  primary key (user_id, game, level, content_key),
  constraint phase2_paid_srs_states_game_check check (game = 'tone'),
  constraint phase2_paid_srs_states_level_check check (level in (1, 2)),
  constraint phase2_paid_srs_states_phase_check check (phase in ('main', 'challenge', 'complete')),
  constraint phase2_paid_srs_states_checkpoint_check
    check (next_checkpoint is null or next_checkpoint in (0, 1, 8, 16, 30, 60, 90)),
  constraint phase2_paid_srs_states_shape_check check (
    (phase = 'main' and not mastered and not active_challenge and not reschedule_pending
      and next_checkpoint in (0, 1, 8, 16) and due_on is not null)
    or
    (phase = 'challenge' and mastered and active_challenge
      and next_checkpoint in (30, 60, 90)
      and ((not reschedule_pending and due_on is not null) or (reschedule_pending and due_on is null)))
    or
    (phase = 'complete' and mastered and not active_challenge and not reschedule_pending
      and next_checkpoint is null and due_on is null)
  )
);

create index if not exists phase2_paid_srs_states_due_idx
  on public.phase2_paid_srs_states (user_id, game, level, phase, due_on, updated_at);

alter table public.phase2_paid_srs_states enable row level security;
alter table public.phase2_paid_srs_states force row level security;
revoke all on table public.phase2_paid_srs_states from public, anon, authenticated;
grant select, insert, update, delete on table public.phase2_paid_srs_states to service_role;

create table if not exists public.phase2_paid_srs_operations (
  operation_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  game text not null,
  level smallint not null,
  content_key text not null references public.game_words(content_key) on delete restrict,
  request_hash text not null,
  response jsonb not null,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint phase2_paid_srs_operations_game_check check (game = 'tone'),
  constraint phase2_paid_srs_operations_level_check check (level in (1, 2)),
  constraint phase2_paid_srs_operations_hash_check check (request_hash ~ '^[0-9a-f]{64}$')
);

create index if not exists phase2_paid_srs_operations_user_created_idx
  on public.phase2_paid_srs_operations (user_id, created_at desc);

alter table public.phase2_paid_srs_operations enable row level security;
alter table public.phase2_paid_srs_operations force row level security;
revoke all on table public.phase2_paid_srs_operations from public, anon, authenticated;
grant select, insert on table public.phase2_paid_srs_operations to service_role;

create or replace function public.phase2_paid_srs_commit(
  p_operation_id uuid,
  p_user_id uuid,
  p_request_hash text,
  p_game text,
  p_level smallint,
  p_content_key text,
  p_outcome text,
  p_occurred_on date
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_operation public.phase2_paid_srs_operations%rowtype;
  v_state public.phase2_paid_srs_states%rowtype;
  v_state_found boolean := false;
  v_response jsonb;
  v_stage smallint;
begin
  if p_operation_id is null or p_user_id is null or p_occurred_on is null
     or p_request_hash is null or p_outcome is null
     or p_game is distinct from 'tone' or p_level not in (1, 2)
     or nullif(pg_catalog.btrim(p_content_key), '') is null
     or pg_catalog.length(p_content_key) > 512
     or p_outcome not in ('clean', 'fail')
     or p_request_hash !~ '^[0-9a-f]{64}$' then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'invalid_arguments');
  end if;

  if not exists (
    select 1 from public.phase1_product_entitlements e
    where e.user_id = p_user_id and e.entitlement = 'owner_all_access'
  ) then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'feature_disabled');
  end if;

  if not exists (
    select 1 from public.game_words w
    where w.content_key = p_content_key
      and w.level = case p_level when 1 then '初' when 2 then '中' end
      and w.status = 'queued' and w.access_tier = 'paid'
  ) then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'content_not_entitled');
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('phase2-paid-srs-op:' || p_operation_id::text, 0)
  );

  select * into v_operation
  from public.phase2_paid_srs_operations
  where operation_id = p_operation_id;

  if found then
    if v_operation.user_id is distinct from p_user_id
       or v_operation.game is distinct from p_game
       or v_operation.level is distinct from p_level
       or v_operation.content_key is distinct from p_content_key
       or v_operation.request_hash is distinct from p_request_hash then
      return pg_catalog.jsonb_build_object('ok', false, 'reason', 'replay_conflict');
    end if;
    return v_operation.response || pg_catalog.jsonb_build_object('idempotent', true);
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'phase2-paid-srs-item:' || p_user_id::text || ':' || p_game || ':' ||
      p_level::text || ':' || p_content_key,
      0
    )
  );

  select * into v_state
  from public.phase2_paid_srs_states
  where user_id = p_user_id and game = p_game and level = p_level and content_key = p_content_key
  for update;
  v_state_found := found;

  if not v_state_found then
    if p_outcome = 'fail' then
      v_response := pg_catalog.jsonb_build_object(
        'ok', false, 'reason', 'below_entry_score', 'status', 'below_entry',
        'tier', 'paid', 'idempotent', false, 'newSrsRecord', null
      );
    else
      insert into public.phase2_paid_srs_states (
        user_id, game, level, content_key, origin_on, phase, next_checkpoint,
        due_on, mastered, active_challenge, ever_failed, reschedule_pending
      ) values (
        p_user_id, p_game, p_level, p_content_key, p_occurred_on, 'main', 1,
        p_occurred_on + 1, false, false, false, false
      ) returning * into v_state;
      v_response := pg_catalog.jsonb_build_object(
        'ok', true, 'reason', 'advanced', 'status', 'advanced', 'passed_checkpoint', 0,
        'tier', 'paid', 'idempotent', false
      );
    end if;
  elsif v_state.phase = 'complete' then
    v_response := pg_catalog.jsonb_build_object(
      'ok', false, 'reason', 'already_complete', 'status', 'complete',
      'tier', 'paid', 'idempotent', false
    );
  elsif v_state.reschedule_pending then
    v_response := pg_catalog.jsonb_build_object(
      'ok', false, 'reason', 'challenge_reschedule_pending', 'status', 'reschedule_pending',
      'tier', 'paid', 'idempotent', false
    );
  elsif p_occurred_on < v_state.due_on then
    v_response := pg_catalog.jsonb_build_object(
      'ok', false, 'reason', 'not_due', 'status', 'not_due',
      'tier', 'paid', 'idempotent', false
    );
  elsif p_outcome = 'fail' and v_state.phase = 'challenge' then
    update public.phase2_paid_srs_states
    set next_checkpoint = 30, due_on = null, mastered = true, active_challenge = true,
        ever_failed = true, reschedule_pending = true,
        state_token = pg_catalog.gen_random_uuid(), updated_at = pg_catalog.clock_timestamp()
    where user_id = p_user_id and game = p_game and level = p_level and content_key = p_content_key
    returning * into v_state;
    v_response := pg_catalog.jsonb_build_object(
      'ok', true, 'reason', 'challenge_reset', 'status', 'challenge_reset',
      'tier', 'paid', 'idempotent', false
    );
  elsif p_outcome = 'fail' then
    update public.phase2_paid_srs_states
    set origin_on = p_occurred_on, phase = 'main', next_checkpoint = 0,
        due_on = p_occurred_on, mastered = false, active_challenge = false,
        ever_failed = true, reschedule_pending = false,
        state_token = pg_catalog.gen_random_uuid(), updated_at = pg_catalog.clock_timestamp()
    where user_id = p_user_id and game = p_game and level = p_level and content_key = p_content_key
    returning * into v_state;
    v_response := pg_catalog.jsonb_build_object(
      'ok', true, 'reason', 'reset', 'status', 'main_reset',
      'tier', 'paid', 'idempotent', false
    );
  else
    case v_state.next_checkpoint
      when 0 then
        update public.phase2_paid_srs_states
        set origin_on = p_occurred_on, next_checkpoint = 1, due_on = p_occurred_on + 1,
            state_token = pg_catalog.gen_random_uuid(), updated_at = pg_catalog.clock_timestamp()
        where user_id = p_user_id and game = p_game and level = p_level and content_key = p_content_key
        returning * into v_state;
        v_response := pg_catalog.jsonb_build_object('ok', true, 'reason', 'advanced', 'status', 'advanced', 'passed_checkpoint', 0, 'tier', 'paid', 'idempotent', false);
      when 1 then
        update public.phase2_paid_srs_states
        set next_checkpoint = 8, due_on = origin_on + 8,
            state_token = pg_catalog.gen_random_uuid(), updated_at = pg_catalog.clock_timestamp()
        where user_id = p_user_id and game = p_game and level = p_level and content_key = p_content_key
        returning * into v_state;
        v_response := pg_catalog.jsonb_build_object('ok', true, 'reason', 'advanced', 'status', 'advanced', 'passed_checkpoint', 1, 'tier', 'paid', 'idempotent', false);
      when 8 then
        update public.phase2_paid_srs_states
        set next_checkpoint = 16, due_on = origin_on + 16,
            state_token = pg_catalog.gen_random_uuid(), updated_at = pg_catalog.clock_timestamp()
        where user_id = p_user_id and game = p_game and level = p_level and content_key = p_content_key
        returning * into v_state;
        v_response := pg_catalog.jsonb_build_object('ok', true, 'reason', 'advanced', 'status', 'advanced', 'passed_checkpoint', 8, 'tier', 'paid', 'idempotent', false);
      when 16 then
        update public.phase2_paid_srs_states
        set phase = 'challenge', next_checkpoint = 30, due_on = origin_on + 30,
            mastered = true, active_challenge = true, reschedule_pending = false,
            state_token = pg_catalog.gen_random_uuid(), updated_at = pg_catalog.clock_timestamp()
        where user_id = p_user_id and game = p_game and level = p_level and content_key = p_content_key
        returning * into v_state;
        v_response := pg_catalog.jsonb_build_object('ok', true, 'reason', 'entered_challenge', 'status', 'entered_challenge', 'passed_checkpoint', 16, 'tier', 'paid', 'idempotent', false);
      when 30 then
        update public.phase2_paid_srs_states
        set next_checkpoint = 60, due_on = origin_on + 60, reschedule_pending = false,
            state_token = pg_catalog.gen_random_uuid(), updated_at = pg_catalog.clock_timestamp()
        where user_id = p_user_id and game = p_game and level = p_level and content_key = p_content_key
        returning * into v_state;
        v_response := pg_catalog.jsonb_build_object('ok', true, 'reason', 'advanced', 'status', 'advanced', 'passed_checkpoint', 30, 'tier', 'paid', 'idempotent', false);
      when 60 then
        update public.phase2_paid_srs_states
        set next_checkpoint = 90, due_on = origin_on + 90, reschedule_pending = false,
            state_token = pg_catalog.gen_random_uuid(), updated_at = pg_catalog.clock_timestamp()
        where user_id = p_user_id and game = p_game and level = p_level and content_key = p_content_key
        returning * into v_state;
        v_response := pg_catalog.jsonb_build_object('ok', true, 'reason', 'advanced', 'status', 'advanced', 'passed_checkpoint', 60, 'tier', 'paid', 'idempotent', false);
      when 90 then
        update public.phase2_paid_srs_states
        set phase = 'complete', next_checkpoint = null, due_on = null,
            mastered = true, active_challenge = false, reschedule_pending = false,
            state_token = pg_catalog.gen_random_uuid(), updated_at = pg_catalog.clock_timestamp()
        where user_id = p_user_id and game = p_game and level = p_level and content_key = p_content_key
        returning * into v_state;
        v_response := pg_catalog.jsonb_build_object('ok', true, 'reason', 'completed_challenge', 'status', 'completed_challenge', 'passed_checkpoint', 90, 'tier', 'paid', 'idempotent', false);
      else
        return pg_catalog.jsonb_build_object('ok', false, 'reason', 'invalid_state');
    end case;
  end if;

  if v_state.user_id is not null then
    v_stage := case v_state.next_checkpoint
      when 0 then 0 when 1 then 1 when 8 then 2 when 16 then 3
      when 30 then 4 when 60 then 5 when 90 then 6 else 7 end;
    v_response := v_response || pg_catalog.jsonb_build_object(
      'newSrsRecord', pg_catalog.jsonb_build_object(
        'stage', v_stage, 'dueDate', coalesce(v_state.due_on::text, ''),
        'everFailed', v_state.ever_failed,
        'mastered', v_state.phase = 'complete',
        'phase', v_state.phase,
        'activeChallenge', v_state.active_challenge,
        'nextCheckpoint', v_state.next_checkpoint,
        'reschedulePending', v_state.reschedule_pending
      )
    );
  end if;

  insert into public.phase2_paid_srs_operations (
    operation_id, user_id, game, level, content_key, request_hash, response
  ) values (
    p_operation_id, p_user_id, p_game, p_level, p_content_key, p_request_hash, v_response
  );

  return v_response;
end;
$$;

revoke all on function public.phase2_paid_srs_commit(uuid,uuid,text,text,smallint,text,text,date)
  from public, anon, authenticated;
grant execute on function public.phase2_paid_srs_commit(uuid,uuid,text,text,smallint,text,text,date)
  to service_role;

comment on function public.phase2_paid_srs_commit(uuid,uuid,text,text,smallint,text,text,date)
  is 'Lin-only Paid Tone SRS private beta owner. Challenge failure stays pending because reschedule delay is not yet a Product Decision.';

notify pgrst, 'reload schema';
commit;
