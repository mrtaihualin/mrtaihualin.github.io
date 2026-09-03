-- Lin 2026-09-03: allow a new Email OTP request for the same email after
-- one minute. Keep the existing IP request windows and 15m/60m abuse
-- escalation unchanged.

begin;

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
  elsif v_email_state.last_request_at > v_now - interval '1 minute' then
    perform private.register_email_otp_violation('email', p_email_hmac, v_now);
    v_reason := 'email_1m_limit';
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

revoke execute on function public.begin_email_otp_challenge_internal(uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.begin_email_otp_challenge_internal(uuid, text, text, text)
  to service_role;

commit;
