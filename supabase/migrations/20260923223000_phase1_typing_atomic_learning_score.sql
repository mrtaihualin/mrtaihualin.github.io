-- SOURCE ONLY — final atomic Typing event + learning/Retry + score owner.
-- Apply only after 20260923200000 and a fresh exact Production approval.
-- HTTP/browser adoption remains OFF; this migration does not activate a route.
begin;

alter table public.phase1_typing_rounds
  add column if not exists primary_completed_count smallint not null default 0,
  add column if not exists pending_retry_count smallint not null default 0;
update public.phase1_typing_rounds
set primary_completed_count = least(completed_count, 5)
where primary_completed_count = 0 and completed_count > 0;
alter table public.phase1_typing_rounds
  drop constraint if exists phase1_typing_rounds_completed_count_check,
  drop constraint if exists phase1_typing_rounds_completion_check,
  drop constraint if exists phase1_typing_rounds_primary_completed_check,
  drop constraint if exists phase1_typing_rounds_pending_retry_check;
alter table public.phase1_typing_rounds
  add constraint phase1_typing_rounds_completed_count_check
    check (completed_count between 0 and 10 and completed_count >= primary_completed_count),
  add constraint phase1_typing_rounds_primary_completed_check
    check (primary_completed_count between 0 and 5),
  add constraint phase1_typing_rounds_pending_retry_check
    check (pending_retry_count between 0 and 5),
  add constraint phase1_typing_rounds_completion_check check (
    (status = 'active' and completed_at is null
      and (primary_completed_count < 5 or pending_retry_count > 0))
    or (status = 'completed' and completed_at is not null
      and primary_completed_count = 5 and pending_retry_count = 0)
  );

alter table public.phase1_typing_round_prompts
  add column if not exists attempt_kind text not null default 'primary',
  add column if not exists learning_state text,
  add column if not exists learning_state_token text,
  add column if not exists source_prompt_ordinal bigint;
alter table public.phase1_typing_round_reserve_prompts
  add column if not exists attempt_kind text not null default 'primary',
  add column if not exists learning_state text,
  add column if not exists learning_state_token text;

alter table public.phase1_typing_round_prompts
  drop constraint if exists phase1_typing_round_prompts_attempt_kind_check,
  drop constraint if exists phase1_typing_round_prompts_learning_state_check,
  drop constraint if exists phase1_typing_round_prompts_learning_token_check,
  drop constraint if exists phase1_typing_round_prompts_retry_source_check;
alter table public.phase1_typing_round_reserve_prompts
  drop constraint if exists phase1_typing_round_reserve_attempt_kind_check,
  drop constraint if exists phase1_typing_round_reserve_learning_state_check,
  drop constraint if exists phase1_typing_round_reserve_learning_token_check;

alter table public.phase1_typing_round_prompts
  add constraint phase1_typing_round_prompts_attempt_kind_check
    check (attempt_kind in ('primary', 'retry')),
  add constraint phase1_typing_round_prompts_learning_state_check
    check (learning_state is null or learning_state in
      ('normal','retry_end_round','next_day_check','review_needed','weak_4d','srs')),
  add constraint phase1_typing_round_prompts_learning_token_check
    check (learning_state_token is null or (
      pg_catalog.length(learning_state_token) between 1 and 512
      and learning_state_token = pg_catalog.btrim(learning_state_token)
    )),
  add constraint phase1_typing_round_prompts_retry_source_check check (
    (attempt_kind = 'primary' and source_prompt_ordinal is null)
    or (attempt_kind = 'retry' and source_prompt_ordinal is not null and source_prompt_ordinal >= 1)
  );
alter table public.phase1_typing_round_reserve_prompts
  add constraint phase1_typing_round_reserve_attempt_kind_check check (attempt_kind = 'primary'),
  add constraint phase1_typing_round_reserve_learning_state_check
    check (learning_state is null or learning_state in
      ('normal','next_day_check','review_needed','weak_4d','srs')),
  add constraint phase1_typing_round_reserve_learning_token_check
    check (learning_state_token is null or (
      pg_catalog.length(learning_state_token) between 1 and 512
      and learning_state_token = pg_catalog.btrim(learning_state_token)
    ));

create table if not exists public.phase1_typing_round_retry_queue (
  round_id uuid not null references public.phase1_typing_rounds(round_id) on delete cascade,
  retry_ordinal smallint not null check (retry_ordinal between 1 and 5),
  source_prompt_ordinal bigint not null check (source_prompt_ordinal >= 1),
  content_source text not null check (content_source = 'game_words'),
  content_key text not null check (
    pg_catalog.length(content_key) between 1 and 512 and content_key = pg_catalog.btrim(content_key)
  ),
  canonical_answer text not null check (
    pg_catalog.length(canonical_answer) between 1 and 512 and canonical_answer = pg_catalog.btrim(canonical_answer)
  ),
  catalog_version text not null check (
    pg_catalog.length(catalog_version) between 1 and 128 and catalog_version = pg_catalog.btrim(catalog_version)
  ),
  record_hash text not null check (record_hash ~ '^[0-9a-f]{64}$'),
  learning_state text not null check (learning_state = 'retry_end_round'),
  learning_state_token text not null check (
    pg_catalog.length(learning_state_token) between 1 and 512
    and learning_state_token = pg_catalog.btrim(learning_state_token)
  ),
  status text not null default 'pending' check (status in ('pending','resolved')),
  current_prompt_ordinal bigint check (current_prompt_ordinal is null or current_prompt_ordinal >= 1),
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  resolved_at timestamptz,
  primary key (round_id, retry_ordinal),
  unique (round_id, source_prompt_ordinal),
  check ((status = 'pending' and resolved_at is null)
    or (status = 'resolved' and resolved_at is not null))
);
alter table public.phase1_typing_round_retry_queue enable row level security;
alter table public.phase1_typing_round_retry_queue force row level security;
revoke all on table public.phase1_typing_round_retry_queue from public, anon, authenticated;
grant select, insert, update on table public.phase1_typing_round_retry_queue to service_role;

-- Preserve the reviewed canonical wrappers as rollback owners. Reapplication
-- replaces only the learning-aware wrappers, never renames them again.
do $$ begin
  if to_regprocedure('public.phase1_typing_round_issue_prelearning(uuid,uuid,text,smallint,bigint,jsonb,jsonb)') is null then
    alter function public.phase1_typing_round_issue(uuid,uuid,text,smallint,bigint,jsonb,jsonb)
      rename to phase1_typing_round_issue_prelearning;
  end if;
  if to_regprocedure('public.phase1_typing_round_append_reserve_prelearning(uuid,uuid,text,uuid,bigint,jsonb)') is null then
    alter function public.phase1_typing_round_append_reserve(uuid,uuid,text,uuid,bigint,jsonb)
      rename to phase1_typing_round_append_reserve_prelearning;
  end if;
  if to_regprocedure('public.phase1_typing_round_refill_prelearning(uuid,uuid,text,uuid,bigint,bigint,bigint,smallint,bigint,bigint,bigint,jsonb)') is null then
    alter function public.phase1_typing_round_refill(uuid,uuid,text,uuid,bigint,bigint,bigint,smallint,bigint,bigint,bigint,jsonb)
      rename to phase1_typing_round_refill_prelearning;
  end if;
  if to_regprocedure('public.phase1_typing_round_load_prelearning(uuid,uuid,bigint,bigint,smallint)') is null then
    alter function public.phase1_typing_round_load(uuid,uuid,bigint,bigint,smallint)
      rename to phase1_typing_round_load_prelearning;
  end if;
end $$;

create or replace function public.phase1_typing_round_issue(
  p_operation_id uuid, p_user_id uuid, p_request_hash text, p_level smallint,
  p_starting_combo bigint, p_prompts jsonb, p_reserve_prompts jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_prompt jsonb; v_result jsonb; v_round_id uuid; v_updated bigint;
begin
  if pg_catalog.jsonb_typeof(p_prompts) is distinct from 'array'
     or pg_catalog.jsonb_typeof(p_reserve_prompts) is distinct from 'array' then
    return pg_catalog.jsonb_build_object('ok',false,'reason','invalid_arguments');
  end if;
  for v_prompt in select value from pg_catalog.jsonb_array_elements(p_prompts || p_reserve_prompts) loop
    if v_prompt ->> 'attempt_kind' is distinct from 'primary'
       or v_prompt ->> 'learning_state' not in ('normal','next_day_check','review_needed','weak_4d','srs')
       or pg_catalog.jsonb_typeof(v_prompt -> 'learning_state_token') is distinct from 'string'
       or nullif(pg_catalog.btrim(v_prompt ->> 'learning_state_token'),'') is null
       or pg_catalog.length(v_prompt ->> 'learning_state_token') > 512 then
      return pg_catalog.jsonb_build_object('ok',false,'reason','invalid_prompt');
    end if;
  end loop;
  v_result := public.phase1_typing_round_issue_prelearning(
    p_operation_id,p_user_id,p_request_hash,p_level,p_starting_combo,p_prompts,p_reserve_prompts);
  if v_result ->> 'ok' is distinct from 'true' then return v_result; end if;
  v_round_id := (v_result ->> 'round_id')::uuid;
  update public.phase1_typing_round_prompts target set
    attempt_kind = 'primary', learning_state = prompt.value ->> 'learning_state',
    learning_state_token = prompt.value ->> 'learning_state_token'
  from pg_catalog.jsonb_array_elements(p_prompts) with ordinality prompt(value,ordinality)
  where target.round_id=v_round_id and target.prompt_ordinal=prompt.ordinality;
  get diagnostics v_updated = row_count;
  if v_updated <> pg_catalog.jsonb_array_length(p_prompts) then raise exception 'typing learning prompt persistence failed'; end if;
  update public.phase1_typing_round_reserve_prompts target set
    attempt_kind = 'primary', learning_state = prompt.value ->> 'learning_state',
    learning_state_token = prompt.value ->> 'learning_state_token'
  from pg_catalog.jsonb_array_elements(p_reserve_prompts) with ordinality prompt(value,ordinality)
  where target.round_id=v_round_id and target.reserve_ordinal=prompt.ordinality;
  get diagnostics v_updated = row_count;
  if v_updated <> pg_catalog.jsonb_array_length(p_reserve_prompts) then raise exception 'typing learning reserve persistence failed'; end if;
  return v_result;
end $$;

create or replace function public.phase1_typing_round_append_reserve(
  p_batch_id uuid,p_user_id uuid,p_request_hash text,p_round_id uuid,
  p_expected_reserve_count bigint,p_prompts jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_prompt jsonb; v_result jsonb; v_updated bigint;
begin
  if pg_catalog.jsonb_typeof(p_prompts) is distinct from 'array' then
    return pg_catalog.jsonb_build_object('ok',false,'reason','invalid_arguments');
  end if;
  for v_prompt in select value from pg_catalog.jsonb_array_elements(p_prompts) loop
    if v_prompt ->> 'attempt_kind' is distinct from 'primary'
       or v_prompt ->> 'learning_state' not in ('normal','next_day_check','review_needed','weak_4d','srs')
       or pg_catalog.jsonb_typeof(v_prompt -> 'learning_state_token') is distinct from 'string'
       or nullif(pg_catalog.btrim(v_prompt ->> 'learning_state_token'),'') is null
       or pg_catalog.length(v_prompt ->> 'learning_state_token') > 512 then
      return pg_catalog.jsonb_build_object('ok',false,'reason','invalid_prompt');
    end if;
  end loop;
  v_result := public.phase1_typing_round_append_reserve_prelearning(
    p_batch_id,p_user_id,p_request_hash,p_round_id,p_expected_reserve_count,p_prompts);
  if v_result ->> 'ok' is distinct from 'true' then return v_result; end if;
  update public.phase1_typing_round_reserve_prompts target set
    attempt_kind='primary', learning_state=prompt.value ->> 'learning_state',
    learning_state_token=prompt.value ->> 'learning_state_token'
  from pg_catalog.jsonb_array_elements(p_prompts) with ordinality prompt(value,ordinality)
  where target.round_id=p_round_id
    and target.reserve_ordinal=p_expected_reserve_count+prompt.ordinality;
  get diagnostics v_updated = row_count;
  if v_updated <> pg_catalog.jsonb_array_length(p_prompts) then raise exception 'typing learning refill persistence failed'; end if;
  return v_result;
end $$;

create or replace function public.phase1_typing_round_refill(
  p_batch_id uuid,p_user_id uuid,p_request_hash text,p_round_id uuid,
  p_expected_event_sequence bigint,p_expected_prompt_ordinal bigint,p_expected_prompt_count bigint,
  p_expected_completed_count smallint,p_expected_skip_count bigint,p_expected_reserve_count bigint,
  p_expected_reserve_cursor bigint,p_prompts jsonb
) returns jsonb language sql security definer set search_path = '' as $$
  select public.phase1_typing_round_refill_prelearning($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
$$;

create or replace function public.phase1_typing_round_load(
  p_user_id uuid,p_round_id uuid,p_prompt_after bigint default 0,
  p_event_after bigint default 0,p_page_size smallint default 64
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_result jsonb; v_round uuid;
begin
  v_result := public.phase1_typing_round_load_prelearning(
    p_user_id,p_round_id,p_prompt_after,p_event_after,p_page_size);
  if v_result ->> 'ok' is distinct from 'true' then return v_result; end if;
  v_round := (v_result #>> '{round,round_id}')::uuid;
  v_result := pg_catalog.jsonb_set(v_result,'{round}',(v_result->'round') || pg_catalog.jsonb_build_object(
    'primary_completed_count',(select primary_completed_count from public.phase1_typing_rounds where round_id=v_round),
    'pending_retry_count',(select pending_retry_count from public.phase1_typing_rounds where round_id=v_round)));
  return pg_catalog.jsonb_set(v_result,'{prompt_page}',coalesce((
    select pg_catalog.jsonb_agg(page.value || pg_catalog.jsonb_build_object(
      'attempt_kind',prompt.attempt_kind,'learning_state',prompt.learning_state,
      'learning_state_token',prompt.learning_state_token,'source_prompt_ordinal',prompt.source_prompt_ordinal
    ) order by page.ordinality)
    from pg_catalog.jsonb_array_elements(v_result->'prompt_page') with ordinality page(value,ordinality)
    join public.phase1_typing_round_prompts prompt on prompt.round_id=v_round
      and prompt.prompt_ordinal=(page.value->>'prompt_ordinal')::bigint
  ),'[]'::jsonb));
end $$;

create or replace function public.phase1_typing_round_commit_event(
  p_operation_id uuid,p_user_id uuid,p_request_hash text,p_round_id uuid,
  p_expected_sequence bigint,p_prompt_ordinal bigint,p_event_type text,p_answer text default null,
  p_server_learning_score smallint default null,p_score_verified_by text default null,
  p_server_final_score integer default null,p_evidence_hash text default null,
  p_mirror_items jsonb default null
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_existing public.phase1_typing_round_operations%rowtype;
  v_round public.phase1_typing_rounds%rowtype;
  v_prompt public.phase1_typing_round_prompts%rowtype;
  v_reserve public.phase1_typing_round_reserve_prompts%rowtype;
  v_learning jsonb; v_score jsonb; v_payload jsonb; v_response jsonb;
  v_word public.game_words%rowtype;
  v_wrong bigint; v_guide boolean; v_units integer; v_quota integer; v_expected_score smallint;
  v_added bigint := 0; v_primary smallint; v_completed smallint; v_pending smallint;
  v_status text; v_retry_ordinal smallint; v_retry record;
begin
  if p_operation_id is null or p_user_id is null or p_round_id is null
     or p_request_hash is null or p_request_hash !~ '^[0-9a-f]{64}$'
     or p_expected_sequence is null or p_expected_sequence < 1
     or p_prompt_ordinal is null or p_prompt_ordinal < 1
     or p_event_type is null or p_event_type not in ('wrong','hint_opened','completed','skipped')
     or (p_event_type='completed' and (nullif(pg_catalog.btrim(p_answer),'') is null
       or p_answer is distinct from pg_catalog.btrim(p_answer) or pg_catalog.length(p_answer)>512
       or p_server_learning_score not between 0 and 10 or p_score_verified_by is distinct from 'edge:typing:v2'))
     or (p_event_type<>'completed' and (p_answer is not null or p_server_learning_score is not null
       or p_score_verified_by is not null or p_server_final_score is not null
       or p_evidence_hash is not null or p_mirror_items is not null))
     or ((p_server_final_score is null) <> (p_evidence_hash is null))
     or ((p_server_final_score is null) <> (p_mirror_items is null))
     or (p_server_final_score is not null and (p_server_final_score not between 0 and 5000
       or p_evidence_hash !~ '^[0-9a-f]{64}$' or pg_catalog.jsonb_typeof(p_mirror_items)<>'array')) then
    return pg_catalog.jsonb_build_object('ok',false,'reason','invalid_arguments');
  end if;
  v_payload := pg_catalog.jsonb_build_object('round_id',p_round_id,'expected_sequence',p_expected_sequence,
    'prompt_ordinal',p_prompt_ordinal,'event_type',p_event_type,'answer',p_answer,
    'server_learning_score',p_server_learning_score,'score_verified_by',p_score_verified_by,
    'server_final_score',p_server_final_score,'evidence_hash',p_evidence_hash,'mirror_items',p_mirror_items);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'phase1-typing-operation:'||p_operation_id::text,0));
  select * into v_existing from public.phase1_typing_round_operations where operation_id=p_operation_id;
  if found then
    if v_existing.user_id is distinct from p_user_id or v_existing.round_id is distinct from p_round_id
       or v_existing.operation_type is distinct from 'append_event'
       or v_existing.request_hash is distinct from p_request_hash
       or v_existing.request_payload is distinct from v_payload then
      return pg_catalog.jsonb_build_object('ok',false,'reason','replay_conflict');
    end if;
    return v_existing.response || pg_catalog.jsonb_build_object('idempotent',true);
  end if;
  select * into v_round from public.phase1_typing_rounds
    where round_id=p_round_id and user_id=p_user_id for update;
  if not found then return pg_catalog.jsonb_build_object('ok',false,'reason','round_not_found'); end if;
  if v_round.status<>'active' then return pg_catalog.jsonb_build_object('ok',false,'reason','round_not_active'); end if;
  if v_round.next_event_sequence is distinct from p_expected_sequence
     or v_round.current_prompt_ordinal is distinct from p_prompt_ordinal then
    return pg_catalog.jsonb_build_object('ok',false,'reason','resync_required',
      'next_event_sequence',v_round.next_event_sequence,'current_prompt_ordinal',v_round.current_prompt_ordinal);
  end if;
  select * into v_prompt from public.phase1_typing_round_prompts
    where round_id=p_round_id and prompt_ordinal=p_prompt_ordinal;
  if not found or v_prompt.learning_state is null or v_prompt.learning_state_token is null then
    return pg_catalog.jsonb_build_object('ok',false,'reason','prompt_not_found');
  end if;
  select * into v_word from public.game_words where content_key=v_prompt.content_key for share;
  if not found or v_word.level is distinct from (case v_round.level when 1 then '初' when 2 then '中' end)
     or v_word.status is distinct from 'active' or v_word.access_tier not in ('guest','login')
     or v_word.catalog_version is distinct from v_prompt.catalog_version
     or v_word.record_hash is distinct from v_prompt.record_hash
     or v_word.canonical_record->>'word' is distinct from v_prompt.canonical_answer then
    return pg_catalog.jsonb_build_object('ok',false,'reason','typing_canonical_changed');
  end if;
  if p_event_type='completed' and p_answer is distinct from v_prompt.canonical_answer then
    return pg_catalog.jsonb_build_object('ok',false,'reason','answer_mismatch');
  end if;
  if p_event_type='completed' and v_prompt.attempt_kind='primary' and exists (
    select 1 from public.phase1_typing_round_events e join public.phase1_typing_round_prompts p
      on p.round_id=e.round_id and p.prompt_ordinal=e.prompt_ordinal
    where e.round_id=p_round_id and e.event_type='completed' and p.attempt_kind='primary'
      and p.content_source=v_prompt.content_source and p.content_key=v_prompt.content_key
  ) then return pg_catalog.jsonb_build_object('ok',false,'reason','duplicate_completed_content'); end if;
  if v_prompt.attempt_kind='retry' and not exists (
    select 1 from public.phase1_typing_round_retry_queue q where q.round_id=p_round_id
      and q.source_prompt_ordinal=v_prompt.source_prompt_ordinal and q.status='pending'
      and q.current_prompt_ordinal=p_prompt_ordinal
  ) then return pg_catalog.jsonb_build_object('ok',false,'reason','invalid_retry_prompt'); end if;

  -- Primary terminal actions consume a protected reserve only when the current
  -- issued queue has no next prompt and five primary completions are not reached.
  if p_event_type in ('completed','skipped') and v_prompt.attempt_kind='primary'
     and not (p_event_type='completed' and v_round.primary_completed_count=4)
     and not exists (select 1 from public.phase1_typing_round_prompts
       where round_id=p_round_id and prompt_ordinal=p_prompt_ordinal+1) then
    select candidate.* into v_reserve from public.phase1_typing_round_reserve_prompts candidate
    join public.phase1_typing_round_reserve_state state on state.round_id=candidate.round_id
    where candidate.round_id=p_round_id and candidate.reserve_ordinal>state.reserve_cursor
      and not exists (
        select 1 from public.phase1_typing_round_events e join public.phase1_typing_round_prompts done
          on done.round_id=e.round_id and done.prompt_ordinal=e.prompt_ordinal
        where e.round_id=p_round_id and e.event_type='completed' and done.attempt_kind='primary'
          and done.content_source=candidate.content_source and done.content_key=candidate.content_key)
    order by candidate.reserve_ordinal limit 1;
    if not found then return pg_catalog.jsonb_build_object('ok',false,'reason','typing_reserve_exhausted'); end if;
    insert into public.phase1_typing_round_prompts(round_id,prompt_ordinal,content_source,content_key,
      canonical_answer,golden,srs_bonus,catalog_version,record_hash,attempt_kind,learning_state,learning_state_token)
    values(p_round_id,v_round.prompt_count+1,v_reserve.content_source,v_reserve.content_key,
      v_reserve.canonical_answer,v_reserve.golden,v_reserve.srs_bonus,v_reserve.catalog_version,
      v_reserve.record_hash,'primary',v_reserve.learning_state,v_reserve.learning_state_token);
    update public.phase1_typing_round_reserve_state set reserve_cursor=v_reserve.reserve_ordinal
      where round_id=p_round_id;
    v_added := v_added+1;
  end if;

  v_primary := v_round.primary_completed_count;
  v_completed := v_round.completed_count;
  v_pending := v_round.pending_retry_count;
  if p_event_type='completed' then
    select pg_catalog.count(*)::bigint,
      coalesce(pg_catalog.bool_or(event_type='hint_opened'),false)
      into v_wrong,v_guide from public.phase1_typing_round_events
      where round_id=p_round_id and prompt_ordinal=p_prompt_ordinal
        and event_type in ('wrong','hint_opened');
    v_wrong := (select pg_catalog.count(*) from public.phase1_typing_round_events
      where round_id=p_round_id and prompt_ordinal=p_prompt_ordinal and event_type='wrong');
    v_units := pg_catalog.jsonb_array_length(v_word.canonical_record->'syllables');
    if v_units<1 then raise exception 'typing_atomic_invalid_canonical_units'; end if;
    v_quota := least(4+greatest(0,v_units-4),9);
    v_expected_score := case when v_guide or v_wrong>=v_quota then 0
      else pg_catalog.round(10-(10::numeric/v_quota)*v_wrong)::smallint end;
    if p_server_learning_score is distinct from v_expected_score then
      raise exception 'typing_atomic_learning_score_mismatch';
    end if;
    v_learning := public.phase1_login_free_learning_commit(p_operation_id,p_user_id,p_request_hash,
      'typing',v_round.level,v_prompt.content_source,v_prompt.content_key,p_server_learning_score,
      p_score_verified_by,p_round_id,v_prompt.learning_state,v_prompt.learning_state_token,
      (pg_catalog.clock_timestamp() at time zone 'Asia/Taipei')::date,'free','answer');
    if v_learning->>'ok' is distinct from 'true' then
      raise exception 'typing_atomic_learning_rejected:%', coalesce(v_learning->>'reason','unknown');
    end if;
    v_completed := v_completed+1;
    if v_prompt.attempt_kind='primary' then
      v_primary := v_primary+1;
      if v_learning->>'to_state'='retry_end_round' and v_learning->>'mutated'='true' then
        v_retry_ordinal := v_pending+1;
        insert into public.phase1_typing_round_retry_queue(round_id,retry_ordinal,source_prompt_ordinal,
          content_source,content_key,canonical_answer,catalog_version,record_hash,
          learning_state,learning_state_token)
        values(p_round_id,v_retry_ordinal,p_prompt_ordinal,v_prompt.content_source,v_prompt.content_key,
          v_prompt.canonical_answer,v_prompt.catalog_version,v_prompt.record_hash,'retry_end_round',
          v_learning#>>'{snapshot,state_token}');
        v_pending := v_pending+1;
      end if;
    else
      update public.phase1_typing_round_retry_queue set status='resolved',resolved_at=pg_catalog.clock_timestamp()
      where round_id=p_round_id and source_prompt_ordinal=v_prompt.source_prompt_ordinal
        and status='pending' and current_prompt_ordinal=p_prompt_ordinal;
      if not found or v_learning->>'from_state'<>'retry_end_round'
         or v_learning->>'to_state'='retry_end_round' then
        raise exception 'typing retry learning transition failed';
      end if;
      v_pending := v_pending-1;
    end if;
  elsif p_event_type='skipped' and v_prompt.attempt_kind='retry' then
    insert into public.phase1_typing_round_prompts(round_id,prompt_ordinal,content_source,content_key,
      canonical_answer,golden,srs_bonus,catalog_version,record_hash,attempt_kind,learning_state,
      learning_state_token,source_prompt_ordinal)
    values(p_round_id,v_round.prompt_count+v_added+1,v_prompt.content_source,v_prompt.content_key,
      v_prompt.canonical_answer,false,false,v_prompt.catalog_version,v_prompt.record_hash,'retry',
      v_prompt.learning_state,v_prompt.learning_state_token,v_prompt.source_prompt_ordinal);
    update public.phase1_typing_round_retry_queue set current_prompt_ordinal=v_round.prompt_count+v_added+1
      where round_id=p_round_id and source_prompt_ordinal=v_prompt.source_prompt_ordinal and status='pending';
    v_added := v_added+1;
  end if;

  insert into public.phase1_typing_round_events(operation_id,request_hash,round_id,sequence,
    prompt_ordinal,event_type,answer) values(p_operation_id,p_request_hash,p_round_id,p_expected_sequence,
    p_prompt_ordinal,p_event_type,p_answer);

  -- Retry obligations become visible only after all five primary completions.
  if p_event_type='completed' and v_prompt.attempt_kind='primary' and v_primary=5 and v_pending>0 then
    for v_retry in select * from public.phase1_typing_round_retry_queue
      where round_id=p_round_id and status='pending' and current_prompt_ordinal is null
      order by retry_ordinal for update loop
      v_added := v_added+1;
      insert into public.phase1_typing_round_prompts(round_id,prompt_ordinal,content_source,content_key,
        canonical_answer,golden,srs_bonus,catalog_version,record_hash,attempt_kind,learning_state,
        learning_state_token,source_prompt_ordinal)
      values(p_round_id,v_round.prompt_count+v_added,v_retry.content_source,v_retry.content_key,
        v_retry.canonical_answer,false,false,v_retry.catalog_version,v_retry.record_hash,'retry',
        v_retry.learning_state,v_retry.learning_state_token,v_retry.source_prompt_ordinal);
      update public.phase1_typing_round_retry_queue set current_prompt_ordinal=v_round.prompt_count+v_added
        where round_id=p_round_id and retry_ordinal=v_retry.retry_ordinal;
    end loop;
  end if;
  v_status := case when v_primary=5 and v_pending=0 then 'completed' else 'active' end;
  if v_status='completed' then
    if p_server_final_score is null then raise exception 'typing_atomic_final_score_required'; end if;
    v_score := public.phase1_score_submit_commit(p_round_id,p_user_id,'typing',
      case v_round.level when 1 then '初' else '中' end,p_server_final_score,1,
      p_evidence_hash,p_mirror_items);
    if v_score->>'ok' is distinct from 'true' then
      raise exception 'typing_atomic_score_rejected:%', coalesce(v_score->>'reason','unknown');
    end if;
  elsif p_server_final_score is not null then
    raise exception 'typing_atomic_premature_final_score';
  end if;
  update public.phase1_typing_rounds set prompt_count=prompt_count+v_added,
    next_event_sequence=next_event_sequence+1,
    current_prompt_ordinal=current_prompt_ordinal+case when p_event_type in ('completed','skipped') then 1 else 0 end,
    completed_count=v_completed,primary_completed_count=v_primary,pending_retry_count=v_pending,
    skip_count=skip_count+case when p_event_type='skipped' then 1 else 0 end,status=v_status,
    completed_at=case when v_status='completed' then pg_catalog.clock_timestamp() else null end,
    updated_at=pg_catalog.clock_timestamp() where round_id=p_round_id;
  v_response := pg_catalog.jsonb_build_object('ok',true,'idempotent',false,'operation_id',p_operation_id,
    'round_id',p_round_id,'status',v_status,'next_event_sequence',p_expected_sequence+1,
    'current_prompt_ordinal',p_prompt_ordinal+case when p_event_type in ('completed','skipped') then 1 else 0 end,
    'completed_count',v_completed,'primary_completed_count',v_primary,'pending_retry_count',v_pending,
    'skip_count',v_round.skip_count+case when p_event_type='skipped' then 1 else 0 end,
    'learning',v_learning,'score',v_score);
  insert into public.phase1_typing_round_operations(operation_id,user_id,round_id,operation_type,
    request_hash,request_payload,response) values(p_operation_id,p_user_id,p_round_id,'append_event',
    p_request_hash,v_payload,v_response);
  return v_response;
end $$;

create or replace function public.phase1_typing_account_export(
  p_user_id uuid,p_limit integer default 1000
) returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare v_total bigint;
begin
  if p_user_id is null or p_limit is null or p_limit<1 or p_limit>1000 then
    return pg_catalog.jsonb_build_object('ok',false,'reason','invalid_arguments');
  end if;
  select pg_catalog.count(*) into v_total from public.phase1_typing_rounds where user_id=p_user_id;
  return pg_catalog.jsonb_build_object('ok',true,'capped',v_total>p_limit,'rounds',coalesce((
    select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'round_id',r.round_id,'level',r.level,'status',r.status,'starting_combo',r.starting_combo,
      'completed_count',r.completed_count,'primary_completed_count',r.primary_completed_count,
      'skip_count',r.skip_count,'created_at',r.created_at,'updated_at',r.updated_at,'completed_at',r.completed_at,
      'activity',coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'sequence',e.sequence,'prompt_ordinal',e.prompt_ordinal,
        'content_ref',pg_catalog.jsonb_build_object('source',p.content_source,'key',p.content_key),
        'type',e.event_type,'attempt_kind',p.attempt_kind,'created_at',e.created_at
      ) order by e.sequence) from public.phase1_typing_round_events e
        join public.phase1_typing_round_prompts p on p.round_id=e.round_id and p.prompt_ordinal=e.prompt_ordinal
        where e.round_id=r.round_id),'[]'::jsonb)
    ) order by r.updated_at desc,r.round_id)
    from (select * from public.phase1_typing_rounds where user_id=p_user_id
      order by updated_at desc,round_id limit p_limit) r
  ),'[]'::jsonb));
end $$;

revoke all on function public.phase1_typing_round_issue(uuid,uuid,text,smallint,bigint,jsonb,jsonb) from public,anon,authenticated;
revoke all on function public.phase1_typing_round_append_reserve(uuid,uuid,text,uuid,bigint,jsonb) from public,anon,authenticated;
revoke all on function public.phase1_typing_round_refill(uuid,uuid,text,uuid,bigint,bigint,bigint,smallint,bigint,bigint,bigint,jsonb) from public,anon,authenticated;
revoke all on function public.phase1_typing_round_load(uuid,uuid,bigint,bigint,smallint) from public,anon,authenticated;
revoke all on function public.phase1_typing_round_commit_event(uuid,uuid,text,uuid,bigint,bigint,text,text,smallint,text,integer,text,jsonb) from public,anon,authenticated;
revoke all on function public.phase1_typing_account_export(uuid,integer) from public,anon,authenticated;
-- Atomic cutover has one completion writer. The prior event RPC and renamed
-- implementation helpers remain only as recovery evidence, never API owners.
revoke all on function public.phase1_typing_round_append_event(uuid,uuid,text,uuid,bigint,bigint,text,text)
  from public,anon,authenticated,service_role;
revoke all on function public.phase1_typing_round_issue_prelearning(uuid,uuid,text,smallint,bigint,jsonb,jsonb)
  from public,anon,authenticated,service_role;
revoke all on function public.phase1_typing_round_append_reserve_prelearning(uuid,uuid,text,uuid,bigint,jsonb)
  from public,anon,authenticated,service_role;
revoke all on function public.phase1_typing_round_refill_prelearning(uuid,uuid,text,uuid,bigint,bigint,bigint,smallint,bigint,bigint,bigint,jsonb)
  from public,anon,authenticated,service_role;
revoke all on function public.phase1_typing_round_load_prelearning(uuid,uuid,bigint,bigint,smallint)
  from public,anon,authenticated,service_role;
grant execute on function public.phase1_typing_round_issue(uuid,uuid,text,smallint,bigint,jsonb,jsonb) to service_role;
grant execute on function public.phase1_typing_round_append_reserve(uuid,uuid,text,uuid,bigint,jsonb) to service_role;
grant execute on function public.phase1_typing_round_refill(uuid,uuid,text,uuid,bigint,bigint,bigint,smallint,bigint,bigint,bigint,jsonb) to service_role;
grant execute on function public.phase1_typing_round_load(uuid,uuid,bigint,bigint,smallint) to service_role;
grant execute on function public.phase1_typing_round_commit_event(uuid,uuid,text,uuid,bigint,bigint,text,text,smallint,text,integer,text,jsonb) to service_role;
grant execute on function public.phase1_typing_account_export(uuid,integer) to service_role;

commit;
