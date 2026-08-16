-- Phase 1 SOURCE ONLY — idempotent/concurrent-safe Lego daily quota consumption.
-- Production execution is locked until Lin separately authorizes SQL + Edge deployment.

begin;

create table if not exists public.lego_daily_limit_requests (
  identity_key text not null,
  day date not null,
  request_id uuid not null,
  cap integer not null,
  used integer not null,
  created_at timestamptz not null default now(),
  primary key (identity_key, day, request_id),
  constraint lego_daily_limit_requests_cap_check check (cap between 1 and 20),
  constraint lego_daily_limit_requests_used_check check (used between 1 and cap)
);

create index if not exists lego_daily_limit_requests_created_idx
  on public.lego_daily_limit_requests (created_at);

alter table public.lego_daily_limit_requests enable row level security;
revoke all on table public.lego_daily_limit_requests from public, anon, authenticated;

create or replace function public.lego_consume_daily_idempotent(
  p_key text,
  p_day date,
  p_cap integer,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_request public.lego_daily_limit_requests%rowtype;
  v_count integer;
begin
  if nullif(btrim(p_key), '') is null or length(p_key) > 200
     or p_day is null or p_cap is null or p_cap not between 1 and 20 or p_request_id is null then
    raise exception 'invalid_lego_daily_request';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('phase1-lego:' || p_key || ':' || p_day::text, 0));

  select * into v_request
  from public.lego_daily_limit_requests
  where identity_key = p_key and day = p_day and request_id = p_request_id
  for update;

  if found then
    if v_request.cap is distinct from p_cap then
      return jsonb_build_object('ok', false, 'reason', 'replay_conflict');
    end if;
    return jsonb_build_object(
      'ok', true,
      'allowed', true,
      'used', v_request.used,
      'cap', v_request.cap,
      'remaining', greatest(0, v_request.cap - v_request.used),
      'idempotent', true
    );
  end if;

  insert into public.lego_daily_limits (identity_key, day, count, updated_at)
  values (p_key, p_day, 0, now())
  on conflict (identity_key, day) do nothing;

  select count into strict v_count
  from public.lego_daily_limits
  where identity_key = p_key and day = p_day
  for update;

  if v_count >= p_cap then
    return jsonb_build_object(
      'ok', true,
      'allowed', false,
      'used', v_count,
      'cap', p_cap,
      'remaining', 0,
      'idempotent', false
    );
  end if;

  v_count := v_count + 1;
  update public.lego_daily_limits
  set count = v_count, updated_at = now()
  where identity_key = p_key and day = p_day;

  insert into public.lego_daily_limit_requests
    (identity_key, day, request_id, cap, used)
  values (p_key, p_day, p_request_id, p_cap, v_count);

  return jsonb_build_object(
    'ok', true,
    'allowed', true,
    'used', v_count,
    'cap', p_cap,
    'remaining', greatest(0, p_cap - v_count),
    'idempotent', false
  );
end;
$$;

revoke all on function public.lego_consume_daily_idempotent(text, date, integer, uuid)
  from public, anon, authenticated;
grant execute on function public.lego_consume_daily_idempotent(text, date, integer, uuid)
  to service_role;

commit;
