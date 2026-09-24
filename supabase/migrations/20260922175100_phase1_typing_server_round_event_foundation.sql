-- SOURCE ONLY — server-owned Typing Initial/Middle round and event persistence.
-- Do not apply to Production without a fresh migration/security/rollback review
-- and Lin's exact HIGH-risk Production database authorization.

begin;

create table if not exists public.phase1_typing_rounds (
  round_id uuid primary key default pg_catalog.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  level smallint not null,
  starting_combo bigint not null default 0,
  status text not null default 'active',
  prompt_count bigint not null default 0,
  next_event_sequence bigint not null default 1,
  current_prompt_ordinal bigint not null default 1,
  completed_count smallint not null default 0,
  skip_count bigint not null default 0,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  completed_at timestamptz,
  constraint phase1_typing_rounds_level_check check (level in (1, 2)),
  constraint phase1_typing_rounds_starting_combo_check check (starting_combo >= 0),
  constraint phase1_typing_rounds_status_check check (status in ('active', 'completed')),
  constraint phase1_typing_rounds_prompt_count_check check (prompt_count >= 5),
  constraint phase1_typing_rounds_next_sequence_check check (next_event_sequence >= 1),
  constraint phase1_typing_rounds_current_prompt_check check (current_prompt_ordinal >= 1),
  constraint phase1_typing_rounds_completed_count_check check (completed_count between 0 and 5),
  constraint phase1_typing_rounds_skip_count_check check (skip_count >= 0),
  constraint phase1_typing_rounds_completion_check check (
    (status = 'active' and completed_count < 5 and completed_at is null)
    or (status = 'completed' and completed_count = 5 and completed_at is not null)
  )
);

create unique index if not exists phase1_typing_rounds_one_active_user_idx
  on public.phase1_typing_rounds (user_id)
  where status = 'active';

create index if not exists phase1_typing_rounds_user_updated_idx
  on public.phase1_typing_rounds (user_id, updated_at desc);

create table if not exists public.phase1_typing_round_prompts (
  round_id uuid not null references public.phase1_typing_rounds(round_id) on delete cascade,
  prompt_ordinal bigint not null,
  content_source text not null default 'game_words',
  content_key text not null,
  canonical_answer text not null,
  golden boolean not null,
  srs_bonus boolean not null,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  primary key (round_id, prompt_ordinal),
  constraint phase1_typing_round_prompts_ordinal_check check (prompt_ordinal >= 1),
  constraint phase1_typing_round_prompts_source_check check (content_source = 'game_words'),
  constraint phase1_typing_round_prompts_key_check check (
    pg_catalog.length(content_key) between 1 and 512
    and content_key = pg_catalog.btrim(content_key)
  ),
  constraint phase1_typing_round_prompts_answer_check check (
    pg_catalog.length(canonical_answer) between 1 and 512
    and canonical_answer = pg_catalog.btrim(canonical_answer)
  )
);

create table if not exists public.phase1_typing_round_events (
  event_id bigint generated always as identity primary key,
  operation_id uuid not null unique,
  request_hash text not null,
  round_id uuid not null,
  sequence bigint not null,
  prompt_ordinal bigint not null,
  event_type text not null,
  answer text,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint phase1_typing_round_events_prompt_fkey
    foreign key (round_id, prompt_ordinal)
    references public.phase1_typing_round_prompts(round_id, prompt_ordinal)
    on delete cascade,
  constraint phase1_typing_round_events_sequence_unique unique (round_id, sequence),
  constraint phase1_typing_round_events_hash_check check (request_hash ~ '^[0-9a-f]{64}$'),
  constraint phase1_typing_round_events_sequence_check check (sequence >= 1),
  constraint phase1_typing_round_events_type_check check (
    event_type in ('wrong', 'hint_opened', 'completed', 'skipped')
  ),
  constraint phase1_typing_round_events_answer_check check (
    (event_type = 'completed' and answer is not null
      and pg_catalog.length(answer) between 1 and 512
      and answer = pg_catalog.btrim(answer))
    or (event_type <> 'completed' and answer is null)
  )
);

create index if not exists phase1_typing_round_events_prompt_idx
  on public.phase1_typing_round_events (round_id, prompt_ordinal, sequence);

create table if not exists public.phase1_typing_round_operations (
  operation_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  round_id uuid not null references public.phase1_typing_rounds(round_id) on delete cascade,
  operation_type text not null,
  request_hash text not null,
  request_payload jsonb not null,
  response jsonb not null,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint phase1_typing_round_operations_type_check check (
    operation_type in ('create_round', 'append_prompts', 'append_event')
  ),
  constraint phase1_typing_round_operations_hash_check check (request_hash ~ '^[0-9a-f]{64}$')
);

create index if not exists phase1_typing_round_operations_user_created_idx
  on public.phase1_typing_round_operations (user_id, created_at desc);

create index if not exists phase1_typing_round_operations_round_created_idx
  on public.phase1_typing_round_operations (round_id, created_at desc);

alter table public.phase1_typing_rounds enable row level security;
alter table public.phase1_typing_rounds force row level security;
alter table public.phase1_typing_round_prompts enable row level security;
alter table public.phase1_typing_round_prompts force row level security;
alter table public.phase1_typing_round_events enable row level security;
alter table public.phase1_typing_round_events force row level security;
alter table public.phase1_typing_round_operations enable row level security;
alter table public.phase1_typing_round_operations force row level security;

revoke all on table public.phase1_typing_rounds from public, anon, authenticated;
revoke all on table public.phase1_typing_round_prompts from public, anon, authenticated;
revoke all on table public.phase1_typing_round_events from public, anon, authenticated;
revoke all on table public.phase1_typing_round_operations from public, anon, authenticated;
revoke all on sequence public.phase1_typing_round_events_event_id_seq from public, anon, authenticated;

grant select, insert, update on table public.phase1_typing_rounds to service_role;
grant select, insert on table public.phase1_typing_round_prompts to service_role;
grant select, insert on table public.phase1_typing_round_events to service_role;
grant select, insert on table public.phase1_typing_round_operations to service_role;
grant usage, select on sequence public.phase1_typing_round_events_event_id_seq to service_role;

create or replace function public.phase1_typing_round_create(
  p_operation_id uuid,
  p_user_id uuid,
  p_request_hash text,
  p_level smallint,
  p_starting_combo bigint,
  p_prompts jsonb
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
  v_request_payload jsonb;
  v_response jsonb;
begin
  if p_operation_id is null or p_user_id is null
     or p_request_hash is null or p_request_hash !~ '^[0-9a-f]{64}$'
     or p_level is null or p_level not in (1, 2)
     or p_starting_combo is null or p_starting_combo < 0
     or pg_catalog.jsonb_typeof(p_prompts) is distinct from 'array' then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'invalid_arguments');
  end if;
  if pg_catalog.jsonb_array_length(p_prompts) < 5
     or pg_catalog.jsonb_array_length(p_prompts) > 64 then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'invalid_arguments');
  end if;

  v_request_payload := pg_catalog.jsonb_build_object(
    'level', p_level,
    'starting_combo', p_starting_combo,
    'prompts', p_prompts
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

  for v_prompt in select value from pg_catalog.jsonb_array_elements(p_prompts) loop
    if pg_catalog.jsonb_typeof(v_prompt) is distinct from 'object'
       or pg_catalog.jsonb_typeof(v_prompt -> 'content_ref') is distinct from 'object'
       or v_prompt #>> '{content_ref,source}' is distinct from 'game_words'
       or nullif(pg_catalog.btrim(v_prompt #>> '{content_ref,key}'), '') is null
       or v_prompt #>> '{content_ref,key}' is distinct from pg_catalog.btrim(v_prompt #>> '{content_ref,key}')
       or pg_catalog.length(v_prompt #>> '{content_ref,key}') > 512
       or nullif(pg_catalog.btrim(v_prompt ->> 'answer'), '') is null
       or v_prompt ->> 'answer' is distinct from pg_catalog.btrim(v_prompt ->> 'answer')
       or pg_catalog.length(v_prompt ->> 'answer') > 512
       or pg_catalog.jsonb_typeof(v_prompt -> 'golden') is distinct from 'boolean'
       or pg_catalog.jsonb_typeof(v_prompt -> 'srs_bonus') is distinct from 'boolean' then
      return pg_catalog.jsonb_build_object('ok', false, 'reason', 'invalid_prompt');
    end if;
  end loop;

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
    p_user_id, p_level, p_starting_combo, pg_catalog.jsonb_array_length(p_prompts)
  ) returning round_id into v_round_id;

  insert into public.phase1_typing_round_prompts (
    round_id, prompt_ordinal, content_source, content_key, canonical_answer, golden, srs_bonus
  )
  select
    v_round_id,
    prompt.ordinality,
    'game_words',
    prompt.value #>> '{content_ref,key}',
    prompt.value ->> 'answer',
    (prompt.value ->> 'golden')::boolean,
    (prompt.value ->> 'srs_bonus')::boolean
  from pg_catalog.jsonb_array_elements(p_prompts) with ordinality as prompt(value, ordinality);

  v_response := pg_catalog.jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'operation_id', p_operation_id,
    'round_id', v_round_id,
    'game', 'typing',
    'level', p_level,
    'starting_combo', p_starting_combo,
    'status', 'active',
    'prompt_count', pg_catalog.jsonb_array_length(p_prompts),
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

create or replace function public.phase1_typing_round_append_prompts(
  p_operation_id uuid,
  p_user_id uuid,
  p_request_hash text,
  p_round_id uuid,
  p_expected_prompt_count bigint,
  p_prompts jsonb
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_existing public.phase1_typing_round_operations%rowtype;
  v_round public.phase1_typing_rounds%rowtype;
  v_prompt jsonb;
  v_added bigint;
  v_request_payload jsonb;
  v_response jsonb;
begin
  if p_operation_id is null or p_user_id is null or p_round_id is null
     or p_request_hash is null or p_request_hash !~ '^[0-9a-f]{64}$'
     or p_expected_prompt_count is null or p_expected_prompt_count < 5
     or pg_catalog.jsonb_typeof(p_prompts) is distinct from 'array' then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'invalid_arguments');
  end if;
  if pg_catalog.jsonb_array_length(p_prompts) < 1
     or pg_catalog.jsonb_array_length(p_prompts) > 64 then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'invalid_arguments');
  end if;

  v_request_payload := pg_catalog.jsonb_build_object(
    'round_id', p_round_id,
    'expected_prompt_count', p_expected_prompt_count,
    'prompts', p_prompts
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
       or v_existing.operation_type is distinct from 'append_prompts'
       or v_existing.request_hash is distinct from p_request_hash
       or v_existing.request_payload is distinct from v_request_payload then
      return pg_catalog.jsonb_build_object('ok', false, 'reason', 'replay_conflict');
    end if;
    return v_existing.response || pg_catalog.jsonb_build_object('idempotent', true);
  end if;

  for v_prompt in select value from pg_catalog.jsonb_array_elements(p_prompts) loop
    if pg_catalog.jsonb_typeof(v_prompt) is distinct from 'object'
       or pg_catalog.jsonb_typeof(v_prompt -> 'content_ref') is distinct from 'object'
       or v_prompt #>> '{content_ref,source}' is distinct from 'game_words'
       or nullif(pg_catalog.btrim(v_prompt #>> '{content_ref,key}'), '') is null
       or v_prompt #>> '{content_ref,key}' is distinct from pg_catalog.btrim(v_prompt #>> '{content_ref,key}')
       or pg_catalog.length(v_prompt #>> '{content_ref,key}') > 512
       or nullif(pg_catalog.btrim(v_prompt ->> 'answer'), '') is null
       or v_prompt ->> 'answer' is distinct from pg_catalog.btrim(v_prompt ->> 'answer')
       or pg_catalog.length(v_prompt ->> 'answer') > 512
       or pg_catalog.jsonb_typeof(v_prompt -> 'golden') is distinct from 'boolean'
       or pg_catalog.jsonb_typeof(v_prompt -> 'srs_bonus') is distinct from 'boolean' then
      return pg_catalog.jsonb_build_object('ok', false, 'reason', 'invalid_prompt');
    end if;
  end loop;

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
  if v_round.prompt_count is distinct from p_expected_prompt_count then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'reason', 'resync_required', 'prompt_count', v_round.prompt_count
    );
  end if;

  v_added := pg_catalog.jsonb_array_length(p_prompts);
  insert into public.phase1_typing_round_prompts (
    round_id, prompt_ordinal, content_source, content_key, canonical_answer, golden, srs_bonus
  )
  select
    p_round_id,
    p_expected_prompt_count + prompt.ordinality,
    'game_words',
    prompt.value #>> '{content_ref,key}',
    prompt.value ->> 'answer',
    (prompt.value ->> 'golden')::boolean,
    (prompt.value ->> 'srs_bonus')::boolean
  from pg_catalog.jsonb_array_elements(p_prompts) with ordinality as prompt(value, ordinality);

  update public.phase1_typing_rounds
  set prompt_count = prompt_count + v_added,
      updated_at = pg_catalog.clock_timestamp()
  where round_id = p_round_id;

  v_response := pg_catalog.jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'operation_id', p_operation_id,
    'round_id', p_round_id,
    'added_prompt_count', v_added,
    'prompt_count', p_expected_prompt_count + v_added
  );

  insert into public.phase1_typing_round_operations (
    operation_id, user_id, round_id, operation_type, request_hash, request_payload, response
  ) values (
    p_operation_id, p_user_id, p_round_id, 'append_prompts', p_request_hash, v_request_payload, v_response
  );

  return v_response;
end;
$$;

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

create or replace function public.phase1_typing_round_load(
  p_user_id uuid,
  p_round_id uuid,
  p_prompt_after bigint default 0,
  p_event_after bigint default 0,
  p_page_size smallint default 64
) returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_round public.phase1_typing_rounds%rowtype;
begin
  if p_user_id is null
     or p_prompt_after is null or p_prompt_after < 0
     or p_event_after is null or p_event_after < 0
     or p_page_size is null or p_page_size < 1 or p_page_size > 64 then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'invalid_arguments');
  end if;

  if p_round_id is null then
    select * into v_round
    from public.phase1_typing_rounds
    where user_id = p_user_id and status = 'active'
    order by created_at desc
    limit 1;
  else
    select * into v_round
    from public.phase1_typing_rounds
    where round_id = p_round_id and user_id = p_user_id;
  end if;

  if not found then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'round_not_found');
  end if;

  if p_prompt_after > v_round.prompt_count
     or p_event_after > v_round.next_event_sequence - 1 then
    return pg_catalog.jsonb_build_object(
      'ok', false,
      'reason', 'resync_required',
      'prompt_count', v_round.prompt_count,
      'last_event_sequence', v_round.next_event_sequence - 1
    );
  end if;

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'round', pg_catalog.jsonb_build_object(
      'round_id', v_round.round_id,
      'game', 'typing',
      'level', v_round.level,
      'starting_combo', v_round.starting_combo,
      'status', v_round.status,
      'prompt_count', v_round.prompt_count,
      'next_event_sequence', v_round.next_event_sequence,
      'current_prompt_ordinal', v_round.current_prompt_ordinal,
      'completed_count', v_round.completed_count,
      'skip_count', v_round.skip_count
    ),
    'prompt_page', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'prompt_ordinal', p.prompt_ordinal,
          'content_ref', pg_catalog.jsonb_build_object(
            'source', p.content_source,
            'key', p.content_key
          ),
          'answer', p.canonical_answer,
          'golden', p.golden,
          'srs_bonus', p.srs_bonus
        ) order by p.prompt_ordinal
      )
      from (
        select *
        from public.phase1_typing_round_prompts
        where round_id = v_round.round_id and prompt_ordinal > p_prompt_after
        order by prompt_ordinal
        limit p_page_size
      ) p
    ), '[]'::jsonb),
    'event_page', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
          'operation_id', e.operation_id,
          'sequence', e.sequence,
          'prompt_ordinal', e.prompt_ordinal,
          'content_ref', pg_catalog.jsonb_build_object(
            'source', p.content_source,
            'key', p.content_key
          ),
          'type', e.event_type,
          'answer', e.answer
        )) order by e.sequence
      )
      from public.phase1_typing_round_events e
      join public.phase1_typing_round_prompts p
        on p.round_id = e.round_id and p.prompt_ordinal = e.prompt_ordinal
      where e.round_id = v_round.round_id and e.sequence > p_event_after
        and e.sequence <= p_event_after + p_page_size
    ), '[]'::jsonb),
    'next_prompt_after', least(v_round.prompt_count, p_prompt_after + p_page_size),
    'next_event_after', least(v_round.next_event_sequence - 1, p_event_after + p_page_size),
    'has_more_prompts', v_round.prompt_count > p_prompt_after + p_page_size,
    'has_more_events', v_round.next_event_sequence - 1 > p_event_after + p_page_size
  );
end;
$$;

revoke all on function public.phase1_typing_round_create(uuid, uuid, text, smallint, bigint, jsonb)
  from public, anon, authenticated;
revoke all on function public.phase1_typing_round_append_prompts(uuid, uuid, text, uuid, bigint, jsonb)
  from public, anon, authenticated;
revoke all on function public.phase1_typing_round_append_event(uuid, uuid, text, uuid, bigint, bigint, text, text)
  from public, anon, authenticated;
revoke all on function public.phase1_typing_round_load(uuid, uuid, bigint, bigint, smallint)
  from public, anon, authenticated;

grant execute on function public.phase1_typing_round_create(uuid, uuid, text, smallint, bigint, jsonb)
  to service_role;
grant execute on function public.phase1_typing_round_append_prompts(uuid, uuid, text, uuid, bigint, jsonb)
  to service_role;
grant execute on function public.phase1_typing_round_append_event(uuid, uuid, text, uuid, bigint, bigint, text, text)
  to service_role;
grant execute on function public.phase1_typing_round_load(uuid, uuid, bigint, bigint, smallint)
  to service_role;

comment on function public.phase1_typing_round_create(uuid, uuid, text, smallint, bigint, jsonb)
  is 'SOURCE ONLY: create one server-owned active Typing Initial/Middle round with a persisted prompt queue.';
comment on function public.phase1_typing_round_append_prompts(uuid, uuid, text, uuid, bigint, jsonb)
  is 'SOURCE ONLY: atomically append server-owned replacement prompts without an invented Skip cap.';
comment on function public.phase1_typing_round_append_event(uuid, uuid, text, uuid, bigint, bigint, text, text)
  is 'SOURCE ONLY: atomically persist one idempotent server-confirmed Typing event and advance round cursors.';
comment on function public.phase1_typing_round_load(uuid, uuid, bigint, bigint, smallint)
  is 'SOURCE ONLY: load a protected Typing round plus bounded prompt/event pages for Edge reduction.';

commit;
