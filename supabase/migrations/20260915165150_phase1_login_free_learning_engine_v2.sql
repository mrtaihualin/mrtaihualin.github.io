-- SOURCE ONLY — one atomic Login Free owner for Tone, Reading, Typing and Word Order.
-- Do not apply without an artifact-bound environment approval. This migration does
-- not backfill, remap or delete any real-player row whose stable item identity is absent.

begin;

alter table public.tone_srs_state
  add column if not exists state_token uuid;

create index if not exists tone_srs_state_owner_queue_idx
  on public.tone_srs_state (user_id, game, level, mastered, due_date, updated_at);

create or replace function public.phase1_login_free_learning_commit(
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
  p_expected_state_token text,
  p_occurred_on date,
  p_tier text,
  p_action text default 'answer'
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_operation public.phase1_learning_review_operations%rowtype;
  v_item_ids uuid[];
  v_item_id uuid;
  v_review public.phase1_learning_review_states%rowtype;
  v_srs public.tone_srs_state%rowtype;
  v_review_found boolean := false;
  v_srs_found boolean := false;
  v_legacy_count integer := 0;
  v_current_state text;
  v_current_token text;
  v_target_state text;
  v_score_band text;
  v_due_on date;
  v_attempts smallint := 0;
  v_next_token uuid;
  v_next_stage smallint;
  v_next_failed boolean;
  v_next_mastered boolean;
  v_response jsonb;
  v_snapshot jsonb;
begin
  if p_operation_id is null or p_user_id is null or p_round_id is null
     or p_occurred_on is null or p_tier is distinct from 'free'
     or p_game not in ('tone', 'reading', 'typing', 'wordorder')
     or p_level not between 1 and 3
     or p_content_source not in ('game_words', 'game_sentences')
     or nullif(pg_catalog.btrim(p_content_key), '') is null
     or p_content_key is distinct from pg_catalog.btrim(p_content_key)
     or pg_catalog.length(p_content_key) > 512
     or p_server_learning_score not between 0 and 10
     or p_score_verified_by !~ '^edge:(tone|reading|typing|word_order):v[0-9]+$'
     or p_request_hash !~ '^[0-9a-f]{64}$'
     or p_expected_state not in
       ('normal', 'retry_end_round', 'next_day_check', 'review_needed', 'weak_4d', 'srs', 'mastered')
     or nullif(p_expected_state_token, '') is null
     or p_action not in ('answer', 'known_check') then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'invalid_arguments');
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('phase1-login-free-learning-op:' || p_operation_id::text, 0)
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

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('phase1-tone-account:' || p_user_id::text, 0)
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'phase1-login-free-learning-item:' || p_user_id::text || ':' || p_game || ':' ||
      p_level::text || ':' || v_item_id::text, 0
    )
  );

  select pg_catalog.count(*) into v_legacy_count
  from public.tone_srs_state s
  where s.user_id = p_user_id and s.game = p_game and s.level = p_level
    and s.item_id is null
    and (
      s.word = p_content_key
      or (p_content_source = 'game_words' and p_content_key like s.word || '@%')
    );
  if v_legacy_count > 0 then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'legacy_srs_identity_unresolved');
  end if;

  select * into v_review
  from public.phase1_learning_review_states r
  where r.user_id = p_user_id and r.game = p_game and r.level = p_level
    and r.item_id = v_item_id
  for update;
  v_review_found := found;

  select * into v_srs
  from public.tone_srs_state s
  where s.user_id = p_user_id and s.game = p_game and s.level = p_level
    and s.item_id = v_item_id
  for update;
  v_srs_found := found;

  if v_review_found and v_srs_found then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'state_owner_conflict');
  end if;

  if v_srs_found then
    v_current_state := case when v_srs.mastered then 'mastered' else 'srs' end;
    v_current_token := coalesce(
      v_srs.state_token::text,
      'legacy-stable:' || v_item_id::text || ':' || v_srs.stage::text || ':' ||
      coalesce(v_srs.due_date, '') || ':' || v_srs.ever_failed::text || ':' || v_srs.mastered::text
    );
    v_snapshot := pg_catalog.jsonb_build_object(
      'engine_version', 'phase1-login-free-learning-v2',
      'item_id', v_item_id,
      'content_ref', pg_catalog.jsonb_build_object('source', p_content_source, 'key', p_content_key),
      'state', v_current_state,
      'state_token', v_current_token,
      'due_on', nullif(v_srs.due_date, ''),
      'stage', v_srs.stage,
      'ever_failed', v_srs.ever_failed,
      'mastered', v_srs.mastered
    );
  elsif v_review_found then
    v_current_state := v_review.state;
    v_current_token := v_review.state_token::text;
    v_snapshot := pg_catalog.jsonb_build_object(
      'engine_version', 'phase1-login-free-learning-v2',
      'item_id', v_item_id,
      'content_ref', pg_catalog.jsonb_build_object('source', p_content_source, 'key', p_content_key),
      'state', v_current_state,
      'state_token', v_current_token,
      'due_on', v_review.due_on,
      'stage', null,
      'ever_failed', null,
      'mastered', false,
      'review_attempts_used', v_review.review_attempts_used,
      'round_id', v_review.round_id
    );
  else
    v_current_state := 'normal';
    v_current_token := 'normal:' || v_item_id::text;
    v_snapshot := pg_catalog.jsonb_build_object(
      'engine_version', 'phase1-login-free-learning-v2',
      'item_id', v_item_id,
      'content_ref', pg_catalog.jsonb_build_object('source', p_content_source, 'key', p_content_key),
      'state', 'normal',
      'state_token', v_current_token,
      'due_on', null,
      'stage', null,
      'ever_failed', null,
      'mastered', false
    );
  end if;

  if v_current_state is distinct from p_expected_state
     or v_current_token is distinct from p_expected_state_token then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'reason', 'resync_required', 'snapshot', v_snapshot
    );
  end if;

  if v_current_state = 'mastered' then
    v_response := pg_catalog.jsonb_build_object(
      'ok', true, 'idempotent', false, 'mutated', false,
      'operation_id', p_operation_id, 'reason', 'already_mastered',
      'server_now', pg_catalog.clock_timestamp(), 'from_state', 'mastered',
      'to_state', 'mastered', 'learning_score', p_server_learning_score,
      'snapshot', v_snapshot
    );
  elsif (v_current_state in ('next_day_check', 'review_needed', 'weak_4d')
          and p_occurred_on < v_review.due_on)
     or (v_current_state = 'srs' and nullif(v_srs.due_date, '') is not null
          and p_occurred_on < v_srs.due_date::date) then
    v_response := pg_catalog.jsonb_build_object(
      'ok', true, 'idempotent', false, 'mutated', false,
      'operation_id', p_operation_id, 'reason', 'not_due',
      'server_now', pg_catalog.clock_timestamp(), 'from_state', v_current_state,
      'to_state', v_current_state, 'learning_score', p_server_learning_score,
      'snapshot', v_snapshot
    );
  elsif v_current_state = 'retry_end_round' and p_round_id is distinct from v_review.round_id then
    v_response := pg_catalog.jsonb_build_object(
      'ok', true, 'idempotent', false, 'mutated', false,
      'operation_id', p_operation_id, 'reason', 'retry_round_mismatch',
      'server_now', pg_catalog.clock_timestamp(), 'from_state', v_current_state,
      'to_state', v_current_state, 'learning_score', p_server_learning_score,
      'snapshot', v_snapshot
    );
  elsif p_action = 'known_check' and v_current_state <> 'srs' then
    v_response := pg_catalog.jsonb_build_object(
      'ok', true, 'idempotent', false, 'mutated', false,
      'operation_id', p_operation_id, 'reason', 'known_check_not_available',
      'server_now', pg_catalog.clock_timestamp(), 'from_state', v_current_state,
      'to_state', v_current_state, 'learning_score', p_server_learning_score,
      'snapshot', v_snapshot
    );
  else
    v_score_band := case
      when p_server_learning_score = 10 then '10'
      when p_server_learning_score between 4 and 9 then '4-9'
      else '0-3'
    end;
    v_next_token := pg_catalog.gen_random_uuid();

    if v_current_state = 'srs' then
      if p_action = 'known_check' and p_server_learning_score = 10 then
        v_next_stage := 3; v_due_on := null; v_next_failed := v_srs.ever_failed; v_next_mastered := true;
        v_target_state := 'mastered';
      elsif p_server_learning_score <> 10 then
        v_next_stage := 0; v_due_on := null; v_next_failed := true; v_next_mastered := false;
        v_target_state := 'srs';
      else
        v_next_stage := v_srs.stage + 1;
        v_next_mastered := v_next_stage >= 3;
        v_next_stage := least(v_next_stage, 3);
        v_next_failed := v_srs.ever_failed;
        v_due_on := case when v_next_mastered then null when v_srs.stage = 0 then p_occurred_on + 1 else p_occurred_on + 7 end;
        v_target_state := case when v_next_mastered then 'mastered' else 'srs' end;
      end if;

      update public.tone_srs_state
      set stage = v_next_stage,
          due_date = coalesce(v_due_on::text, ''),
          ever_failed = v_next_failed,
          mastered = v_next_mastered,
          state_token = v_next_token,
          updated_at = pg_catalog.clock_timestamp()
      where user_id = p_user_id and game = p_game and level = p_level and item_id = v_item_id;
    else
      if v_current_state = 'normal' then
        v_target_state := case v_score_band when '10' then 'srs' when '4-9' then 'weak_4d' else 'retry_end_round' end;
      elsif v_current_state = 'retry_end_round' then
        v_target_state := case when v_score_band = '10' then 'next_day_check' else 'review_needed' end;
      elsif v_current_state in ('next_day_check', 'review_needed') then
        v_attempts := least(1, v_review.review_attempts_used + 1);
        v_target_state := case when v_score_band = '10' then 'srs' else 'weak_4d' end;
      elsif v_current_state = 'weak_4d' then
        v_target_state := case v_score_band when '10' then 'srs' when '4-9' then 'weak_4d' else 'retry_end_round' end;
      end if;

      if v_target_state = 'srs' then
        insert into public.tone_srs_state
          (user_id, game, level, word, item_id, state_token, stage, due_date, ever_failed, mastered, updated_at)
        values
          (p_user_id, p_game, p_level, p_content_key, v_item_id, v_next_token, 0, '', false, false,
           pg_catalog.clock_timestamp());
        delete from public.phase1_learning_review_states
        where user_id = p_user_id and game = p_game and level = p_level and item_id = v_item_id;
        v_due_on := null;
      else
        v_due_on := case
          when v_target_state in ('next_day_check', 'review_needed') then p_occurred_on + 1
          when v_target_state = 'weak_4d' then p_occurred_on + 4
          else null
        end;
        insert into public.phase1_learning_review_states (
          user_id, game, level, item_id, state, state_token, due_on, round_id,
          retry_ordinal, review_attempts_used, updated_at
        ) values (
          p_user_id, p_game, p_level, v_item_id, v_target_state, v_next_token, v_due_on,
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
    end if;

    v_snapshot := pg_catalog.jsonb_build_object(
      'engine_version', 'phase1-login-free-learning-v2',
      'item_id', v_item_id,
      'content_ref', pg_catalog.jsonb_build_object('source', p_content_source, 'key', p_content_key),
      'state', v_target_state,
      'state_token', v_next_token,
      'due_on', v_due_on,
      'stage', case when v_current_state = 'srs' then v_next_stage when v_target_state = 'srs' then 0 else null end,
      'ever_failed', case when v_current_state = 'srs' then v_next_failed when v_target_state = 'srs' then false else null end,
      'mastered', case when v_current_state = 'srs' then v_next_mastered when v_target_state = 'srs' then false else false end,
      'review_attempts_used', case when v_target_state in ('next_day_check', 'review_needed') then v_attempts else null end,
      'round_id', case when v_target_state = 'retry_end_round' then p_round_id else null end
    );
    v_response := pg_catalog.jsonb_build_object(
      'ok', true, 'idempotent', false, 'mutated', true,
      'operation_id', p_operation_id,
      'reason', case
        when v_current_state = 'srs' and p_action = 'known_check' and p_server_learning_score = 10 then 'known_master'
        when v_current_state = 'srs' and p_action = 'known_check' then 'known_reset'
        when v_current_state = 'srs' and v_target_state = 'mastered' then 'srs_mastered'
        when v_current_state = 'srs' and p_server_learning_score = 10 then 'srs_advanced'
        when v_current_state = 'srs' then 'srs_reset'
        when v_target_state = 'srs' then 'entered_srs'
        else 'transitioned'
      end,
      'server_now', pg_catalog.clock_timestamp(),
      'from_state', v_current_state,
      'to_state', v_target_state,
      'learning_score', p_server_learning_score,
      'score_band', v_score_band,
      'snapshot', v_snapshot
    );
  end if;

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

revoke all on function public.phase1_login_free_learning_commit(
  uuid, uuid, text, text, smallint, text, text, smallint, text, uuid,
  text, text, date, text, text
) from public, anon, authenticated;
grant execute on function public.phase1_login_free_learning_commit(
  uuid, uuid, text, text, smallint, text, text, smallint, text, uuid,
  text, text, date, text, text
) to service_role;

comment on function public.phase1_login_free_learning_commit(
  uuid, uuid, text, text, smallint, text, text, smallint, text, uuid,
  text, text, date, text, text
) is 'SOURCE ONLY: atomic Login Free queue/transition commit owner for Tone, Reading, Typing and Word Order; legacy null-item rows remain read-only and fail closed.';

commit;

-- Recovery order after an authorized cutover: stop new Edge writes first, preserve
-- the shared operation ledger, and forward-fix. Do not drop state_token while any
-- row contains it and do not restore the retired Free writer as a concurrent owner.
