-- Time Plan daily quota: 1 successful plan start/day for Guest or Login, Asia/Taipei.
-- Server-only. identity_key is user:<uuid> or ip:<sha256>, never a raw IP.
create table if not exists public.time_plan_daily_usage (
  identity_key text not null,
  day date not null,
  request_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (identity_key, day)
);

alter table public.time_plan_daily_usage enable row level security;

create or replace function public.time_plan_consume_daily(
  p_identity_key text,
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
  if coalesce(trim(p_identity_key),'')='' or p_day is null or p_request_id is null then
    return jsonb_build_object('ok',false,'reason','invalid_input');
  end if;

  insert into public.time_plan_daily_usage(identity_key,day,request_id)
  values(p_identity_key,p_day,p_request_id)
  on conflict(identity_key,day) do nothing
  returning request_id into v_inserted;

  if v_inserted is not null then
    return jsonb_build_object('ok',true,'allowed',true,'used',1,'remaining',0,'idempotent',false);
  end if;

  select request_id into v_existing
  from public.time_plan_daily_usage
  where identity_key=p_identity_key and day=p_day;

  if v_existing=p_request_id then
    return jsonb_build_object('ok',true,'allowed',true,'used',1,'remaining',0,'idempotent',true);
  end if;

  return jsonb_build_object('ok',true,'allowed',false,'reason','limit','used',1,'remaining',0,'idempotent',false);
end;
$$;

revoke all on table public.time_plan_daily_usage from public,anon,authenticated;
revoke all on function public.time_plan_consume_daily(text,date,uuid) from public,anon,authenticated;
grant execute on function public.time_plan_consume_daily(text,date,uuid) to service_role;

-- Optional manual retention cleanup:
-- delete from public.time_plan_daily_usage where day < (current_date - interval '30 days');
