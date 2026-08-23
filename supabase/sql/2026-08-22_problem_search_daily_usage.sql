-- Problem Search daily quota (Login Free: 1 successful analysis/day, Asia/Taipei).
-- Server-only table; browser cannot read/write it directly.

create table if not exists public.problem_search_daily_usage (
  user_id uuid not null,
  day date not null,
  request_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (user_id, day)
);

alter table public.problem_search_daily_usage enable row level security;

create or replace function public.problem_search_consume_daily(
  p_user_id uuid,
  p_day date,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing uuid;
  v_inserted uuid;
begin
  if p_user_id is null or p_day is null or p_request_id is null then
    return jsonb_build_object('ok', false, 'reason', 'invalid_input');
  end if;

  insert into public.problem_search_daily_usage (user_id, day, request_id)
  values (p_user_id, p_day, p_request_id)
  on conflict (user_id, day) do nothing
  returning request_id into v_inserted;

  if v_inserted is not null then
    return jsonb_build_object(
      'ok', true,
      'allowed', true,
      'used', 1,
      'remaining', 0,
      'idempotent', false
    );
  end if;

  select request_id
    into v_existing
    from public.problem_search_daily_usage
   where user_id = p_user_id and day = p_day;

  if v_existing = p_request_id then
    return jsonb_build_object(
      'ok', true,
      'allowed', true,
      'used', 1,
      'remaining', 0,
      'idempotent', true
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'allowed', false,
    'reason', 'limit',
    'used', 1,
    'remaining', 0,
    'idempotent', false
  );
end;
$$;

revoke all on table public.problem_search_daily_usage from public, anon, authenticated;
revoke all on function public.problem_search_consume_daily(uuid, date, uuid) from public, anon, authenticated;
grant execute on function public.problem_search_consume_daily(uuid, date, uuid) to service_role;

-- Optional manual retention cleanup:
-- delete from public.problem_search_daily_usage where day < (current_date - interval '30 days');
