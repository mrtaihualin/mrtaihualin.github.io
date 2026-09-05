-- Lin 2026-09-05: make the one-minute Email OTP resend window idempotent.
-- Duplicate requests never send again, never count as abuse, and never extend a
-- cooldown. Only accepted provider delivery may be reported as successful.

begin;

alter table private.email_otp_challenges
  add column if not exists delivery_confirmed_at timestamptz;

-- Challenges created before this migration were exposed to verification only
-- after the Edge function had attempted provider delivery. Preserve those
-- still-valid challenges during a rolling deployment.
update private.email_otp_challenges
   set delivery_confirmed_at = issued_at
 where delivery_confirmed_at is null
   and state in ('pending', 'used');

create or replace function public.begin_email_otp_challenge_internal(
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
  v_recent_challenge private.email_otp_challenges%rowtype;
  v_email_60m integer;
  v_ip_15m integer;
  v_ip_60m integer;
  v_reason text;
  v_status text;
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

  -- This branch must precede every cooldown/quota branch. A repeated click,
  -- tab, device, or IP within 60 seconds reuses the one current request and is
  -- never registered as a violation.
  if v_email_state.last_request_at > v_now - interval '1 minute' then
    select * into v_recent_challenge
      from private.email_otp_challenges
     where email_hmac = p_email_hmac
     order by issued_at desc
     limit 1;

    v_status := case
      when not found then 'duplicate_failed'
      when v_recent_challenge.state = 'pending'
       and v_recent_challenge.delivery_confirmed_at is not null then 'duplicate_delivered'
      when v_recent_challenge.state = 'pending' then 'duplicate_in_progress'
      else 'duplicate_failed'
    end;

    if not exists (
      select 1 from private.email_otp_security_events
       where event_type = 'request_suppressed'
         and email_hmac = p_email_hmac
         and outcome = 'duplicate_60s'
         and occurred_at >= v_now - interval '1 minute'
    ) then
      insert into private.email_otp_security_events (
        event_type, challenge_id, email_hmac, ip_hmac, outcome, occurred_at
      ) values (
        'request_suppressed', v_recent_challenge.challenge_id,
        p_email_hmac, p_ip_hmac, 'duplicate_60s', v_now
      );
    end if;

    return jsonb_strip_nulls(jsonb_build_object(
      'accepted', false,
      'status', v_status,
      'challenge_id', v_recent_challenge.challenge_id
    ));
  end if;

  -- An existing cooldown is fixed. Requests made during it are suppressed but
  -- do not create another violation and cannot lengthen the cooldown.
  if v_email_state.cooldown_until > v_now then
    v_reason := 'email_cooldown';
  elsif v_ip_state.cooldown_until > v_now then
    v_reason := 'ip_cooldown';
  end if;

  if v_reason is not null then
    if not exists (
      select 1 from private.email_otp_security_events
       where event_type = 'request_suppressed'
         and email_hmac = p_email_hmac
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
    return jsonb_build_object('accepted', false, 'status', 'blocked');
  end if;

  -- Count only provider-send attempts that won the atomic claim. Suppressed
  -- duplicate clicks are observability events, never abuse-volume inputs.
  select count(*)::integer into v_email_60m
    from private.email_otp_security_events
   where email_hmac = p_email_hmac
     and occurred_at >= v_now - interval '60 minutes'
     and event_type = 'request_accepted';
  select count(*)::integer into v_ip_15m
    from private.email_otp_security_events
   where ip_hmac = p_ip_hmac
     and occurred_at >= v_now - interval '15 minutes'
     and event_type = 'request_accepted';
  select count(*)::integer into v_ip_60m
    from private.email_otp_security_events
   where ip_hmac = p_ip_hmac
     and occurred_at >= v_now - interval '60 minutes'
     and event_type = 'request_accepted';

  if v_email_60m >= 10 then
    perform private.register_email_otp_violation('email', p_email_hmac, v_now);
    v_reason := 'email_send_limit';
  elsif v_ip_15m >= 30 or v_ip_60m >= 100 then
    perform private.register_email_otp_violation('ip', p_ip_hmac, v_now);
    v_reason := 'ip_request_limit';
  end if;

  if v_reason is not null then
    insert into private.email_otp_security_events (
      event_type, challenge_id, email_hmac, ip_hmac, outcome, occurred_at
    ) values (
      'request_suppressed', p_challenge_id, p_email_hmac, p_ip_hmac, v_reason, v_now
    );
    return jsonb_build_object('accepted', false, 'status', 'blocked');
  end if;

  -- A newly claimed code makes every older code unusable before provider I/O.
  update private.email_otp_challenges
     set state = 'invalidated', invalidated_at = v_now
   where email_hmac = p_email_hmac and state = 'pending';

  insert into private.email_otp_challenges (
    challenge_id, email_hmac, code_hmac, ip_hmac,
    state, attempts, issued_at, expires_at, delivery_confirmed_at
  ) values (
    p_challenge_id, p_email_hmac, p_code_hmac, p_ip_hmac,
    'pending', 0, v_now, v_now + interval '10 minutes', null
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
  return jsonb_build_object(
    'accepted', true,
    'status', 'claimed',
    'challenge_id', p_challenge_id
  );
end;
$$;

create or replace function public.confirm_email_otp_delivery_internal(
  p_challenge_id uuid,
  p_email_hmac text,
  p_ip_hmac text
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_confirmed boolean;
begin
  if p_email_hmac !~ '^[0-9a-f]{64}$'
     or p_ip_hmac !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_hmac_contract' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('email:' || p_email_hmac, 0));
  update private.email_otp_challenges
     set delivery_confirmed_at = coalesce(delivery_confirmed_at, clock_timestamp())
   where challenge_id = p_challenge_id
     and email_hmac = p_email_hmac
     and ip_hmac = p_ip_hmac
     and state = 'pending';

  select delivery_confirmed_at is not null into v_confirmed
    from private.email_otp_challenges
   where challenge_id = p_challenge_id
     and email_hmac = p_email_hmac
     and ip_hmac = p_ip_hmac
     and state = 'pending';
  return coalesce(v_confirmed, false);
end;
$$;

create or replace function public.get_email_otp_delivery_status_internal(
  p_challenge_id uuid,
  p_email_hmac text
) returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when c.state = 'pending' and c.delivery_confirmed_at is not null then 'delivered'
    when c.state = 'pending' then 'in_progress'
    else 'failed'
  end
  from private.email_otp_challenges c
  where c.challenge_id = p_challenge_id
    and c.email_hmac = p_email_hmac
$$;

revoke execute on function public.begin_email_otp_challenge_internal(uuid, text, text, text)
  from public, anon, authenticated;
revoke execute on function public.confirm_email_otp_delivery_internal(uuid, text, text)
  from public, anon, authenticated;
revoke execute on function public.get_email_otp_delivery_status_internal(uuid, text)
  from public, anon, authenticated;

grant execute on function public.begin_email_otp_challenge_internal(uuid, text, text, text)
  to service_role;
grant execute on function public.confirm_email_otp_delivery_internal(uuid, text, text)
  to service_role;
grant execute on function public.get_email_otp_delivery_status_internal(uuid, text)
  to service_role;

commit;
