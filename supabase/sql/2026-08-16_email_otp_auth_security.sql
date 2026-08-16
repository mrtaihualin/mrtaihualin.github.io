-- SOURCE ONLY — DO NOT APPLY WITHOUT LIN'S PRODUCTION SQL AUTHORIZATION.
-- Server-controlled Email OTP challenges: 10 minute expiry, single use,
-- five wrong attempts, 15m/60m abuse cooldowns, and sanitized security events.

begin;

create schema if not exists private;

create table private.email_otp_challenges (
  challenge_id uuid primary key,
  email_hmac text not null check (email_hmac ~ '^[0-9a-f]{64}$'),
  code_hmac text not null check (code_hmac ~ '^[0-9a-f]{64}$'),
  ip_hmac text not null check (ip_hmac ~ '^[0-9a-f]{64}$'),
  state text not null default 'pending'
    check (state in ('pending', 'used', 'expired', 'invalidated')),
  attempts smallint not null default 0 check (attempts between 0 and 5),
  issued_at timestamptz not null,
  expires_at timestamptz not null,
  last_attempt_at timestamptz,
  used_at timestamptz,
  invalidated_at timestamptz,
  check (expires_at = issued_at + interval '10 minutes'),
  check ((state = 'used') = (used_at is not null))
);

create table private.email_otp_abuse_state (
  subject_kind text not null check (subject_kind in ('email', 'ip')),
  subject_hmac text not null check (subject_hmac ~ '^[0-9a-f]{64}$'),
  last_request_at timestamptz,
  last_violation_at timestamptz,
  violation_count integer not null default 0 check (violation_count >= 0),
  cooldown_until timestamptz,
  updated_at timestamptz not null,
  primary key (subject_kind, subject_hmac)
);

create table private.email_otp_security_events (
  id bigint generated always as identity primary key,
  event_type text not null check (event_type in (
    'request_accepted', 'request_suppressed', 'delivery_failed',
    'verify_failed', 'verify_lockout', 'verify_rejected', 'verify_success',
    'session_issued', 'session_issue_failed', 'verify_internal_error'
  )),
  challenge_id uuid,
  email_hmac text check (email_hmac is null or email_hmac ~ '^[0-9a-f]{64}$'),
  ip_hmac text check (ip_hmac is null or ip_hmac ~ '^[0-9a-f]{64}$'),
  outcome text not null check (char_length(outcome) between 1 and 48),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  occurred_at timestamptz not null
);

create index email_otp_challenges_email_state_issued_idx
  on private.email_otp_challenges (email_hmac, state, issued_at desc);
create index email_otp_challenges_expiry_idx
  on private.email_otp_challenges (expires_at)
  where state = 'pending';
create index email_otp_security_events_ip_time_idx
  on private.email_otp_security_events (ip_hmac, occurred_at desc)
  where ip_hmac is not null;
create index email_otp_security_events_email_time_idx
  on private.email_otp_security_events (email_hmac, occurred_at desc)
  where email_hmac is not null;
create index email_otp_security_events_type_time_idx
  on private.email_otp_security_events (event_type, occurred_at desc);

alter table private.email_otp_challenges enable row level security;
alter table private.email_otp_challenges force row level security;
alter table private.email_otp_abuse_state enable row level security;
alter table private.email_otp_abuse_state force row level security;
alter table private.email_otp_security_events enable row level security;
alter table private.email_otp_security_events force row level security;

revoke all on table private.email_otp_challenges from public, anon, authenticated;
revoke all on table private.email_otp_abuse_state from public, anon, authenticated;
revoke all on table private.email_otp_security_events from public, anon, authenticated;
revoke all on sequence private.email_otp_security_events_id_seq from public, anon, authenticated;

create function private.register_email_otp_violation(
  p_subject_kind text,
  p_subject_hmac text,
  p_now timestamptz
) returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_previous timestamptz;
  v_count integer;
  v_seconds integer;
begin
  insert into private.email_otp_abuse_state (
    subject_kind, subject_hmac, updated_at
  ) values (
    p_subject_kind, p_subject_hmac, p_now
  ) on conflict (subject_kind, subject_hmac) do nothing;

  select last_violation_at, violation_count
    into v_previous, v_count
    from private.email_otp_abuse_state
   where subject_kind = p_subject_kind and subject_hmac = p_subject_hmac
   for update;

  v_seconds := case
    when v_previous is not null and v_previous >= p_now - interval '60 minutes' then 3600
    else 900
  end;

  update private.email_otp_abuse_state
     set last_violation_at = p_now,
         violation_count = case
           when v_previous is not null and v_previous >= p_now - interval '60 minutes' then v_count + 1
           else 1
         end,
         cooldown_until = greatest(
           coalesce(cooldown_until, '-infinity'::timestamptz),
           p_now + make_interval(secs => v_seconds)
         ),
         updated_at = p_now
   where subject_kind = p_subject_kind and subject_hmac = p_subject_hmac;

  return v_seconds;
end;
$$;

revoke execute on function private.register_email_otp_violation(text, text, timestamptz) from public, anon, authenticated;

create function public.begin_email_otp_challenge_internal(
  p_challenge_id uuid,
  p_email_hmac text,
  p_code_hmac text,
  p_ip_hmac text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_email_state private.email_otp_abuse_state%rowtype;
  v_ip_state private.email_otp_abuse_state%rowtype;
  v_ip_15m integer;
  v_ip_60m integer;
  v_reason text;
begin
  if p_email_hmac !~ '^[0-9a-f]{64}$'
     or p_code_hmac !~ '^[0-9a-f]{64}$'
     or p_ip_hmac !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_hmac_contract' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('email:' || p_email_hmac, 0));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('ip:' || p_ip_hmac, 0));

  insert into private.email_otp_abuse_state (subject_kind, subject_hmac, updated_at)
  values ('email', p_email_hmac, v_now), ('ip', p_ip_hmac, v_now)
  on conflict (subject_kind, subject_hmac) do nothing;

  select * into v_email_state from private.email_otp_abuse_state
   where subject_kind = 'email' and subject_hmac = p_email_hmac for update;
  select * into v_ip_state from private.email_otp_abuse_state
   where subject_kind = 'ip' and subject_hmac = p_ip_hmac for update;

  select count(*)::integer into v_ip_15m
    from private.email_otp_security_events
   where ip_hmac = p_ip_hmac
     and occurred_at >= v_now - interval '15 minutes'
     and event_type in ('request_accepted', 'request_suppressed');
  select count(*)::integer into v_ip_60m
    from private.email_otp_security_events
   where ip_hmac = p_ip_hmac
     and occurred_at >= v_now - interval '60 minutes'
     and event_type in ('request_accepted', 'request_suppressed');

  if v_email_state.cooldown_until > v_now then
    perform private.register_email_otp_violation('email', p_email_hmac, v_now);
    v_reason := 'email_cooldown';
  elsif v_ip_state.cooldown_until > v_now then
    perform private.register_email_otp_violation('ip', p_ip_hmac, v_now);
    v_reason := 'ip_cooldown';
  elsif v_email_state.last_request_at > v_now - interval '15 minutes' then
    perform private.register_email_otp_violation('email', p_email_hmac, v_now);
    v_reason := 'email_15m_limit';
  elsif v_ip_15m >= 10 or v_ip_60m >= 30 then
    perform private.register_email_otp_violation('ip', p_ip_hmac, v_now);
    v_reason := 'ip_request_limit';
  end if;

  if v_reason is not null then
    if not exists (
      select 1 from private.email_otp_security_events
       where event_type = 'request_suppressed'
         and ip_hmac = p_ip_hmac
         and outcome = v_reason
         and occurred_at >= v_now - interval '1 minute'
    ) then
      insert into private.email_otp_security_events (
        event_type, challenge_id, email_hmac, ip_hmac, outcome, occurred_at
      ) values (
        'request_suppressed', p_challenge_id, p_email_hmac, p_ip_hmac, v_reason, v_now
      );
    end if;
    return jsonb_build_object('accepted', false);
  end if;

  update private.email_otp_challenges
     set state = 'invalidated', invalidated_at = v_now
   where email_hmac = p_email_hmac and state = 'pending';

  insert into private.email_otp_challenges (
    challenge_id, email_hmac, code_hmac, ip_hmac,
    state, attempts, issued_at, expires_at
  ) values (
    p_challenge_id, p_email_hmac, p_code_hmac, p_ip_hmac,
    'pending', 0, v_now, v_now + interval '10 minutes'
  );

  update private.email_otp_abuse_state
     set last_request_at = v_now, updated_at = v_now
   where (subject_kind = 'email' and subject_hmac = p_email_hmac)
      or (subject_kind = 'ip' and subject_hmac = p_ip_hmac);

  insert into private.email_otp_security_events (
    event_type, challenge_id, email_hmac, ip_hmac, outcome, occurred_at
  ) values (
    'request_accepted', p_challenge_id, p_email_hmac, p_ip_hmac, 'accepted', v_now
  );
  return jsonb_build_object('accepted', true);
end;
$$;

create function public.verify_email_otp_challenge_internal(
  p_challenge_id uuid,
  p_email_hmac text,
  p_code_hmac text,
  p_ip_hmac text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_challenge private.email_otp_challenges%rowtype;
  v_email_state private.email_otp_abuse_state%rowtype;
  v_ip_state private.email_otp_abuse_state%rowtype;
  v_subject_email_hmac text;
  v_challenge_found boolean;
  v_ip_attempts integer;
  v_attempts integer;
begin
  if p_email_hmac !~ '^[0-9a-f]{64}$'
     or p_code_hmac !~ '^[0-9a-f]{64}$'
     or p_ip_hmac !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_hmac_contract' using errcode = '22023';
  end if;

  select * into v_challenge
    from private.email_otp_challenges
   where challenge_id = p_challenge_id;
  v_challenge_found := found;
  v_subject_email_hmac := case when v_challenge_found then v_challenge.email_hmac else p_email_hmac end;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('email:' || v_subject_email_hmac, 0));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('ip:' || p_ip_hmac, 0));

  insert into private.email_otp_abuse_state (subject_kind, subject_hmac, updated_at)
  values ('email', v_subject_email_hmac, v_now), ('ip', p_ip_hmac, v_now)
  on conflict (subject_kind, subject_hmac) do nothing;
  select * into v_email_state from private.email_otp_abuse_state
   where subject_kind = 'email' and subject_hmac = v_subject_email_hmac for update;
  select * into v_ip_state from private.email_otp_abuse_state
   where subject_kind = 'ip' and subject_hmac = p_ip_hmac for update;

  select count(*)::integer into v_ip_attempts
    from private.email_otp_security_events
   where ip_hmac = p_ip_hmac
     and occurred_at >= v_now - interval '15 minutes'
     and event_type in ('verify_failed', 'verify_lockout', 'verify_rejected', 'verify_success');

  if v_email_state.cooldown_until > v_now or v_ip_state.cooldown_until > v_now then
    if not exists (
      select 1 from private.email_otp_security_events
       where event_type = 'verify_rejected' and ip_hmac = p_ip_hmac
         and outcome = 'cooldown' and occurred_at >= v_now - interval '1 minute'
    ) then
      insert into private.email_otp_security_events (
        event_type, challenge_id, email_hmac, ip_hmac, outcome, occurred_at
      ) values ('verify_rejected', p_challenge_id, v_subject_email_hmac, p_ip_hmac, 'cooldown', v_now);
    end if;
    return jsonb_build_object('status', 'rejected');
  end if;
  if v_ip_attempts >= 25 then
    perform private.register_email_otp_violation('ip', p_ip_hmac, v_now);
    if not exists (
      select 1 from private.email_otp_security_events
       where event_type = 'verify_rejected' and ip_hmac = p_ip_hmac
         and outcome = 'ip_verify_limit' and occurred_at >= v_now - interval '1 minute'
    ) then
      insert into private.email_otp_security_events (
        event_type, challenge_id, email_hmac, ip_hmac, outcome, occurred_at
      ) values ('verify_rejected', p_challenge_id, v_subject_email_hmac, p_ip_hmac, 'ip_verify_limit', v_now);
    end if;
    return jsonb_build_object('status', 'rejected');
  end if;
  if not v_challenge_found then
    insert into private.email_otp_security_events (
      event_type, challenge_id, email_hmac, ip_hmac, outcome, occurred_at
    ) values ('verify_rejected', p_challenge_id, p_email_hmac, p_ip_hmac, 'unknown_challenge', v_now);
    return jsonb_build_object('status', 'rejected');
  end if;

  select * into v_challenge
    from private.email_otp_challenges
   where challenge_id = p_challenge_id
   for update;
  if v_challenge.state <> 'pending' then
    insert into private.email_otp_security_events (
      event_type, challenge_id, email_hmac, ip_hmac, outcome, occurred_at
    ) values ('verify_rejected', p_challenge_id, v_challenge.email_hmac, p_ip_hmac, 'not_pending', v_now);
    return jsonb_build_object('status', 'rejected');
  end if;
  if v_challenge.expires_at <= v_now then
    update private.email_otp_challenges
       set state = 'expired', invalidated_at = v_now
     where challenge_id = p_challenge_id;
    insert into private.email_otp_security_events (
      event_type, challenge_id, email_hmac, ip_hmac, outcome, occurred_at
    ) values ('verify_rejected', p_challenge_id, v_challenge.email_hmac, p_ip_hmac, 'expired', v_now);
    return jsonb_build_object('status', 'rejected');
  end if;

  if v_challenge.email_hmac = p_email_hmac and v_challenge.code_hmac = p_code_hmac then
    update private.email_otp_challenges
       set state = 'used', used_at = v_now, last_attempt_at = v_now
     where challenge_id = p_challenge_id;
    insert into private.email_otp_security_events (
      event_type, challenge_id, email_hmac, ip_hmac, outcome, occurred_at
    ) values ('verify_success', p_challenge_id, v_challenge.email_hmac, p_ip_hmac, 'consumed', v_now);
    return jsonb_build_object('status', 'verified');
  end if;

  v_attempts := v_challenge.attempts + 1;
  update private.email_otp_challenges
     set attempts = v_attempts,
         last_attempt_at = v_now,
         state = case when v_attempts >= 5 then 'invalidated' else state end,
         invalidated_at = case when v_attempts >= 5 then v_now else invalidated_at end
   where challenge_id = p_challenge_id;

  if v_attempts >= 5 then
    perform private.register_email_otp_violation('email', v_challenge.email_hmac, v_now);
    perform private.register_email_otp_violation('ip', p_ip_hmac, v_now);
    insert into private.email_otp_security_events (
      event_type, challenge_id, email_hmac, ip_hmac, outcome, occurred_at
    ) values ('verify_lockout', p_challenge_id, v_challenge.email_hmac, p_ip_hmac, 'five_wrong_attempts', v_now);
    return jsonb_build_object('status', 'rejected');
  end if;

  insert into private.email_otp_security_events (
    event_type, challenge_id, email_hmac, ip_hmac, outcome, occurred_at
  ) values ('verify_failed', p_challenge_id, v_challenge.email_hmac, p_ip_hmac, 'wrong_code', v_now);
  return jsonb_build_object('status', 'rejected');
end;
$$;

create function public.invalidate_email_otp_challenge_internal(
  p_challenge_id uuid,
  p_email_hmac text,
  p_ip_hmac text,
  p_reason text
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
begin
  if p_reason not in ('delivery_failed', 'session_issue_failed') then
    raise exception 'invalid_invalidation_reason' using errcode = '22023';
  end if;
  update private.email_otp_challenges
     set state = 'invalidated', invalidated_at = v_now
   where challenge_id = p_challenge_id
     and email_hmac = p_email_hmac
     and ip_hmac = p_ip_hmac
     and state = 'pending';
  insert into private.email_otp_security_events (
    event_type, challenge_id, email_hmac, ip_hmac, outcome, occurred_at
  ) values (p_reason, p_challenge_id, p_email_hmac, p_ip_hmac, 'failed_closed', v_now);
end;
$$;

create function public.log_email_otp_security_internal(
  p_event_type text,
  p_challenge_id uuid,
  p_email_hmac text,
  p_ip_hmac text,
  p_outcome text
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_event_type not in ('session_issued', 'session_issue_failed', 'verify_internal_error')
     or p_outcome not in ('success', 'failed_closed') then
    raise exception 'invalid_security_event' using errcode = '22023';
  end if;
  insert into private.email_otp_security_events (
    event_type, challenge_id, email_hmac, ip_hmac, outcome, occurred_at
  ) values (
    p_event_type, p_challenge_id, p_email_hmac, p_ip_hmac, p_outcome, clock_timestamp()
  );
end;
$$;

create function public.purge_email_otp_security_internal()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_events integer;
  v_challenges integer;
  v_abuse integer;
begin
  delete from private.email_otp_security_events
   where occurred_at < clock_timestamp() - interval '30 days';
  get diagnostics v_events = row_count;
  delete from private.email_otp_challenges
   where issued_at < clock_timestamp() - interval '24 hours'
     and (state <> 'pending' or expires_at <= clock_timestamp());
  get diagnostics v_challenges = row_count;
  delete from private.email_otp_abuse_state
   where updated_at < clock_timestamp() - interval '24 hours'
     and coalesce(cooldown_until, '-infinity'::timestamptz) < clock_timestamp();
  get diagnostics v_abuse = row_count;
  return jsonb_build_object('events', v_events, 'challenges', v_challenges, 'abuse_states', v_abuse);
end;
$$;

revoke execute on function public.begin_email_otp_challenge_internal(uuid, text, text, text) from public, anon, authenticated;
revoke execute on function public.verify_email_otp_challenge_internal(uuid, text, text, text) from public, anon, authenticated;
revoke execute on function public.invalidate_email_otp_challenge_internal(uuid, text, text, text) from public, anon, authenticated;
revoke execute on function public.log_email_otp_security_internal(text, uuid, text, text, text) from public, anon, authenticated;
revoke execute on function public.purge_email_otp_security_internal() from public, anon, authenticated;

grant execute on function public.begin_email_otp_challenge_internal(uuid, text, text, text) to service_role;
grant execute on function public.verify_email_otp_challenge_internal(uuid, text, text, text) to service_role;
grant execute on function public.invalidate_email_otp_challenge_internal(uuid, text, text, text) to service_role;
grant execute on function public.log_email_otp_security_internal(text, uuid, text, text, text) to service_role;
grant execute on function public.purge_email_otp_security_internal() to service_role;

commit;
