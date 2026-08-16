-- Phase 1 SOURCE ONLY — atomic/idempotent tone-round commit.
-- Production execution is locked until Lin separately authorizes SQL + Edge deployment.

begin;

create table if not exists public.tone_round_operations (
  operation_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  game text not null,
  level smallint not null,
  word text not null,
  request_hash text not null,
  response jsonb not null,
  created_at timestamptz not null default now(),
  constraint tone_round_operations_game_check
    check (game in ('tone', 'reading', 'listening', 'typing', 'wordorder')),
  constraint tone_round_operations_level_check check (level between 1 and 3),
  constraint tone_round_operations_hash_check check (request_hash ~ '^[0-9a-f]{64}$')
);

create index if not exists tone_round_operations_user_created_idx
  on public.tone_round_operations (user_id, created_at desc);

alter table public.tone_round_operations enable row level security;
revoke all on table public.tone_round_operations from public, anon, authenticated;

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
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_operation public.tone_round_operations%rowtype;
  v_state public.tone_srs_state%rowtype;
  v_state_found boolean;
  v_account public.game_accounts%rowtype;
  v_hard_words jsonb;
  v_used integer;
  v_cap integer;
  v_award integer := 0;
  v_capped boolean := false;
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
     or nullif(btrim(p_word), '') is null or length(p_word) > 500
     or p_next_stage not between 0 and 3
     or p_reason not in ('known_master', 'known_reset', 'mastered', 'advanced', 'reset')
     or (p_just_mastered and not p_next_mastered) then
    raise exception 'invalid_tone_round_commit';
  end if;

  -- One lock per account serializes different-word rewards as well as same-word retries.
  perform pg_advisory_xact_lock(hashtextextended('phase1-tone-account:' || p_user_id::text, 0));

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
    select * into strict v_account
    from public.game_accounts
    where user_id = p_user_id
    for update;
    return v_operation.response || jsonb_build_object(
      'idempotent', true,
      'totalStars', v_account.stars
    );
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
        updated_at = now()
    where user_id = p_user_id and game = p_game and level = p_level and word = p_word;
    get diagnostics v_rows = row_count;
    if v_rows <> 1 then raise exception 'tone_srs_update_failed'; end if;
  else
    insert into public.tone_srs_state
      (user_id, game, level, word, stage, due_date, ever_failed, mastered, updated_at)
    values
      (p_user_id, p_game, p_level, p_word, p_next_stage, p_next_due_date,
       p_next_ever_failed, p_next_mastered, now());
  end if;

  insert into public.game_accounts (user_id, stars, hard_words_by_level, updated_at)
  values (p_user_id, 0, '{}'::jsonb, now())
  on conflict (user_id) do nothing;

  select * into strict v_account
  from public.game_accounts
  where user_id = p_user_id
  for update;

  if p_just_mastered then
    v_hard_words := coalesce(v_account.hard_words_by_level, '{}'::jsonb);
    if jsonb_typeof(v_hard_words) <> 'object' then
      raise exception 'invalid_hard_words_state';
    end if;
    if v_hard_words ? p_level::text
       and coalesce(v_hard_words ->> p_level::text, '') !~ '^[0-9]+$' then
      raise exception 'invalid_hard_words_count';
    end if;
    v_used := coalesce((v_hard_words ->> p_level::text)::integer, 0);
    v_cap := case p_level when 1 then 33 when 2 then 24 when 3 then 1 end;

    if v_used >= v_cap then
      v_capped := true;
      v_award := 0;
    else
      v_award := case
        when p_level = 1 and p_reward_clean then 3
        when p_level = 1 then 1
        when p_level = 2 and p_reward_clean then 5
        when p_level = 2 then 2
        when p_level = 3 and p_reward_clean then 6
        else 2
      end;
      v_hard_words := jsonb_set(v_hard_words, array[p_level::text], to_jsonb(v_used + 1), true);
      update public.game_accounts
      set stars = stars + v_award,
          hard_words_by_level = v_hard_words,
          updated_at = now()
      where user_id = p_user_id;
      v_account.stars := v_account.stars + v_award;
    end if;

    insert into public.star_ledger (user_id, game, word, level, stars, reason, clean)
    values (p_user_id, p_game, p_word, p_level, v_award,
            case when v_capped then 'capped' else 'mastered' end, p_correct);
  end if;

  v_response := jsonb_build_object(
    'ok', true,
    'reason', p_reason,
    'correct', p_correct,
    'justMastered', p_just_mastered,
    'stars', v_award,
    'capped', v_capped,
    'totalStars', v_account.stars,
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

commit;
