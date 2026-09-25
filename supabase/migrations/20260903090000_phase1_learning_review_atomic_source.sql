-- SOURCE ONLY — hidden Free pre-SRS Review owner.
-- Free SRS natural-time Day 8 and canonical Free200 source reconciliation are complete.
-- Do not apply without fresh Security/rollback evidence and exact Production approval.
-- Production, Paid and public activation remain prohibited.

begin;

-- The existing SRS row keeps its compatibility word key, but every new row created
-- by this owner also carries the canonical stable Learning Item identity.
alter table public.tone_srs_state
  add column if not exists item_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conname = 'tone_srs_state_item_id_fkey'
      and conrelid = 'public.tone_srs_state'::regclass
  ) then
    alter table public.tone_srs_state
      add constraint tone_srs_state_item_id_fkey
      foreign key (item_id) references public.learning_items(item_id)
      on delete restrict not valid;
  end if;
end
$$;

create unique index if not exists uq_tone_srs_state_stable_item
  on public.tone_srs_state (user_id, game, level, item_id)
  where item_id is not null;
create index if not exists tone_srs_state_item_id_idx
  on public.tone_srs_state (item_id)
  where item_id is not null;

-- Browser writes are not part of the SRS/Review architecture. Existing own-row
-- SELECT remains unchanged for the current SRS read path.
revoke insert, update, delete, truncate, references, trigger
  on table public.tone_srs_state from anon, authenticated;

create table if not exists public.phase1_learning_review_states (
  user_id uuid not null references auth.users(id) on delete cascade,
  game text not null,
  level smallint not null,
  item_id uuid not null references public.learning_items(item_id) on delete restrict,
  state text not null,
  state_token uuid not null default pg_catalog.gen_random_uuid(),
  due_on date,
  round_id uuid,
  retry_ordinal smallint,
  review_attempts_used smallint not null default 0,
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  primary key (user_id, game, level, item_id),
  constraint phase1_learning_review_states_game_check
    check (game in ('tone', 'reading', 'listening', 'typing', 'wordorder')),
  constraint phase1_learning_review_states_level_check
    check (level between 1 and 3),
  constraint phase1_learning_review_states_state_check
    check (state in ('retry_end_round', 'next_day_check', 'review_needed', 'weak_4d')),
  constraint phase1_learning_review_states_attempt_check
    check (review_attempts_used between 0 and 2),
  constraint phase1_learning_review_states_shape_check check (
    (state = 'retry_end_round'
      and due_on is null and round_id is not null and retry_ordinal = 1
      and review_attempts_used = 0)
    or
    (state in ('next_day_check', 'review_needed')
      and due_on is not null and round_id is null and retry_ordinal is null)
    or
    (state = 'weak_4d'
      and due_on is not null and round_id is null and retry_ordinal is null
      and review_attempts_used = 0)
  )
);

create index if not exists phase1_learning_review_states_due_idx
  on public.phase1_learning_review_states (user_id, game, level, state, due_on, updated_at);
create index if not exists phase1_learning_review_states_item_id_idx
  on public.phase1_learning_review_states (item_id);

alter table public.phase1_learning_review_states enable row level security;
alter table public.phase1_learning_review_states force row level security;
revoke all on table public.phase1_learning_review_states from public, anon, authenticated;
grant select, insert, update, delete on table public.phase1_learning_review_states to service_role;

create table if not exists public.phase1_learning_review_operations (
  operation_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  game text not null,
  level smallint not null,
  content_source text not null,
  content_key text not null,
  item_id uuid not null references public.learning_items(item_id) on delete restrict,
  request_hash text not null,
  response jsonb not null,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint phase1_learning_review_operations_game_check
    check (game in ('tone', 'reading', 'listening', 'typing', 'wordorder')),
  constraint phase1_learning_review_operations_level_check check (level between 1 and 3),
  constraint phase1_learning_review_operations_source_check
    check (content_source in ('game_words', 'game_sentences')),
  constraint phase1_learning_review_operations_hash_check
    check (request_hash ~ '^[0-9a-f]{64}$')
);

create index if not exists phase1_learning_review_operations_user_created_idx
  on public.phase1_learning_review_operations (user_id, created_at desc);
create index if not exists phase1_learning_review_operations_item_id_idx
  on public.phase1_learning_review_operations (item_id);

alter table public.phase1_learning_review_operations enable row level security;
alter table public.phase1_learning_review_operations force row level security;
revoke all on table public.phase1_learning_review_operations from public, anon, authenticated;
grant select, insert on table public.phase1_learning_review_operations to service_role;

-- The caller is an authenticated Edge owner using service_role after it has
-- recomputed the per-game 0..10 learning score from raw answer evidence.
-- This RPC never accepts item_id from a caller: it resolves exactly one current
-- learning_items.item_id from the existing content_ref source/key pair.
create or replace function public.phase1_learning_review_commit(
  p_operation_id uuid,
  p_user_id uuid,
  p_request_hash text,
  p_game text,
  p_level smallint,
  p_content_source text,
  p_content_key text,
  p_server_learning_score smallint,
  p_score_verified_by text,
  p_round_id uuid,
  p_expected_state text,
  p_expected_state_token uuid,
  p_occurred_on date,
  p_tier text
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_operation public.phase1_learning_review_operations%rowtype;
  v_item_ids uuid[];
  v_item_id uuid;
  v_state public.phase1_learning_review_states%rowtype;
  v_state_found boolean := false;
  v_current_state text;
  v_target_state text;
  v_score_band text;
  v_due_on date;
  v_attempts smallint := 0;
  v_state_token uuid;
  v_word text;
  v_srs_count integer := 0;
  v_legacy_count integer := 0;
  v_response jsonb;
begin
  if p_operation_id is null or p_user_id is null or p_round_id is null
     or p_occurred_on is null or p_tier is distinct from 'free'
     or p_game is null or p_level is null or p_content_source is null
     or p_server_learning_score is null or p_score_verified_by is null
     or p_request_hash is null or p_expected_state is null
     or p_game not in ('tone', 'reading', 'listening', 'typing', 'wordorder')
     or p_level not between 1 and 3
     or p_content_source not in ('game_words', 'game_sentences')
     or nullif(pg_catalog.btrim(p_content_key), '') is null
     or pg_catalog.length(p_content_key) > 512
     or p_server_learning_score not between 0 and 10
     or p_score_verified_by !~ '^edge:[a-z0-9][a-z0-9_-]{0,63}:v[0-9]+$'
     or p_request_hash !~ '^[0-9a-f]{64}$'
     or p_expected_state not in
       ('normal', 'retry_end_round', 'next_day_check', 'review_needed', 'weak_4d') then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'invalid_arguments');
  end if;

  -- Same operation id is serialized before any lookup or mutation.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('phase1-learning-review-op:' || p_operation_id::text, 0)
  );

  select * into v_operation
  from public.phase1_learning_review_operations
  where operation_id = p_operation_id;

  if found then
    if v_operation.user_id is distinct from p_user_id
       or v_operation.game is distinct from p_game
       or v_operation.level is distinct from p_level
       or v_operation.content_source is distinct from p_content_source
       or v_operation.content_key is distinct from p_content_key
       or v_operation.request_hash is distinct from p_request_hash then
      return pg_catalog.jsonb_build_object('ok', false, 'reason', 'replay_conflict');
    end if;
    return v_operation.response || pg_catalog.jsonb_build_object('idempotent', true);
  end if;

  select pg_catalog.array_agg(i.item_id order by i.item_id)
    into v_item_ids
  from public.learning_items i
  where i.owner_user_id is null
    and i.content_source = p_content_source
    and i.content_key = p_content_key;

  if coalesce(pg_catalog.cardinality(v_item_ids), 0) <> 1 then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'content_ref_not_unique');
  end if;
  v_item_id := v_item_ids[1];
  v_word := case
    when p_content_source = 'game_words'
      then pg_catalog.regexp_replace(p_content_key, '@(初|中|高)$', '')
    else p_content_key
  end;

  -- Share the existing SRS owner's account lock before the narrower stable-item
  -- lock so Review entry cannot race tone-round on the compatibility SRS row.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('phase1-tone-account:' || p_user_id::text, 0)
  );

  -- Stable identity, not display text, owns every Review mutation lock.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'phase1-learning-review-item:' || p_user_id::text || ':' || p_game || ':' ||
      p_level::text || ':' || v_item_id::text, 0
    )
  );

  select pg_catalog.count(*) into v_srs_count
  from public.tone_srs_state s
  where s.user_id = p_user_id and s.game = p_game and s.level = p_level
    and s.item_id = v_item_id;

  if v_srs_count > 0 then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'srs_owner_only');
  end if;

  -- Never create a pre-SRS state beside a legacy SRS row whose stable identity
  -- is absent or different. Mapping that old row requires a separate verified gate.
  select pg_catalog.count(*) into v_legacy_count
  from public.tone_srs_state s
  where s.user_id = p_user_id and s.game = p_game and s.level = p_level
    and s.word = v_word and s.item_id is distinct from v_item_id;
  if v_legacy_count > 0 then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'legacy_srs_identity_unresolved');
  end if;

  select * into v_state
  from public.phase1_learning_review_states r
  where r.user_id = p_user_id and r.game = p_game and r.level = p_level
    and r.item_id = v_item_id
  for update;
  v_state_found := found;
  v_current_state := case when v_state_found then v_state.state else 'normal' end;

  if v_current_state is distinct from p_expected_state
     or (v_state_found and v_state.state_token is distinct from p_expected_state_token)
     or (not v_state_found and p_expected_state_token is not null) then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'race_retry');
  end if;

  if v_current_state in ('next_day_check', 'review_needed', 'weak_4d')
     and p_occurred_on < v_state.due_on then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'not_due');
  end if;
  if v_current_state = 'retry_end_round' and p_round_id is distinct from v_state.round_id then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'retry_round_mismatch');
  end if;

  v_score_band := case
    when p_server_learning_score = 10 then '10'
    when p_server_learning_score between 4 and 9 then '4-9'
    else '0-3'
  end;

  if v_current_state = 'normal' then
    v_target_state := case v_score_band
      when '10' then 'srs'
      when '4-9' then 'weak_4d'
      else 'retry_end_round'
    end;
  elsif v_current_state = 'retry_end_round' then
    v_target_state := case when v_score_band = '10' then 'next_day_check' else 'review_needed' end;
  elsif v_current_state in ('next_day_check', 'review_needed') then
    -- Free consumes its single allowed Review evaluation here.
    v_attempts := v_state.review_attempts_used + 1;
    v_target_state := case
      when v_score_band = '10' then 'srs'
      when v_score_band = '4-9' then 'weak_4d'
      else 'weak_4d'
    end;
  elsif v_current_state = 'weak_4d' then
    v_target_state := case v_score_band
      when '10' then 'srs'
      when '4-9' then 'weak_4d'
      else 'retry_end_round'
    end;
  end if;

  if v_target_state = 'srs' then
    insert into public.tone_srs_state
      (user_id, game, level, word, item_id, stage, due_date, ever_failed, mastered, updated_at)
    values
      (p_user_id, p_game, p_level, v_word, v_item_id, 0, '', false, false,
       pg_catalog.clock_timestamp());

    delete from public.phase1_learning_review_states
    where user_id = p_user_id and game = p_game and level = p_level and item_id = v_item_id;
    v_due_on := null;
    v_state_token := null;
  else
    v_due_on := case
      when v_target_state in ('next_day_check', 'review_needed') then p_occurred_on + 1
      when v_target_state = 'weak_4d' then p_occurred_on + 4
      else null
    end;
    v_state_token := pg_catalog.gen_random_uuid();

    insert into public.phase1_learning_review_states (
      user_id, game, level, item_id, state, state_token, due_on, round_id,
      retry_ordinal, review_attempts_used, updated_at
    ) values (
      p_user_id, p_game, p_level, v_item_id, v_target_state, v_state_token, v_due_on,
      case when v_target_state = 'retry_end_round' then p_round_id else null end,
      case when v_target_state = 'retry_end_round' then 1 else null end,
      case when v_target_state in ('next_day_check', 'review_needed') then v_attempts else 0 end,
      pg_catalog.clock_timestamp()
    )
    on conflict (user_id, game, level, item_id) do update set
      state = excluded.state,
      state_token = excluded.state_token,
      due_on = excluded.due_on,
      round_id = excluded.round_id,
      retry_ordinal = excluded.retry_ordinal,
      review_attempts_used = excluded.review_attempts_used,
      updated_at = excluded.updated_at;
  end if;

  v_response := pg_catalog.jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'item_id', v_item_id,
    'game', p_game,
    'level', p_level,
    'learning_score', p_server_learning_score,
    'score_band', v_score_band,
    'from_state', v_current_state,
    'to_state', v_target_state,
    'state_token', v_state_token,
    'due_on', v_due_on,
    'review_attempts_used', case when v_target_state in ('next_day_check', 'review_needed') then v_attempts else null end
  );

  insert into public.phase1_learning_review_operations (
    operation_id, user_id, game, level, content_source, content_key,
    item_id, request_hash, response
  ) values (
    p_operation_id, p_user_id, p_game, p_level, p_content_source, p_content_key,
    v_item_id, p_request_hash, v_response
  );

  return v_response;
end;
$$;

revoke all on function public.phase1_learning_review_commit(
  uuid, uuid, text, text, smallint, text, text, smallint, text, uuid,
  text, uuid, date, text
) from public, anon, authenticated;
grant execute on function public.phase1_learning_review_commit(
  uuid, uuid, text, text, smallint, text, text, smallint, text, uuid,
  text, uuid, date, text
) to service_role;

comment on function public.phase1_learning_review_commit(
  uuid, uuid, text, text, smallint, text, text, smallint, text, uuid,
  text, uuid, date, text
) is 'SOURCE ONLY: service-role atomic pre-SRS owner; exact content_ref resolution, CAS and idempotency. Staging apply waits for Free SRS Day 8 plus fresh gates.';

commit;

-- Rollback planning note (do not execute blindly): disable the Edge route first,
-- export exact rows, drop the RPC, drop the two new tables/index/FK, then drop
-- tone_srs_state.item_id only after proving no stable-id SRS rows exist. The fresh
-- pre-apply rollback gate owns the executable rollback artifact and collision check.
