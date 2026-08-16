-- Run only after 2026-08-16_email_otp_auth_security.sql in a disposable/local DB.
-- The transaction rolls back all challenge, abuse, and log fixtures.

begin;

set local role service_role;
select public.begin_email_otp_challenge_internal(
  '00000000-0000-4000-8000-000000000000', repeat('0', 64), repeat('1', 64), repeat('2', 64)
);
reset role;

do $$
declare
  v_result jsonb;
  v_attempts integer;
  v_state text;
  v_cooldown timestamptz;
begin
  if has_function_privilege('anon', 'public.begin_email_otp_challenge_internal(uuid,text,text,text)', 'execute')
     or has_function_privilege('authenticated', 'public.verify_email_otp_challenge_internal(uuid,text,text,text)', 'execute') then
    raise exception 'browser roles can execute internal Email OTP RPCs';
  end if;
  if not has_function_privilege('service_role', 'public.begin_email_otp_challenge_internal(uuid,text,text,text)', 'execute') then
    raise exception 'service_role cannot execute internal Email OTP RPCs';
  end if;

  v_result := public.begin_email_otp_challenge_internal(
    '10000000-0000-4000-8000-000000000001', repeat('a', 64), repeat('b', 64), repeat('c', 64)
  );
  if (v_result->>'accepted')::boolean is not true then raise exception 'initial challenge rejected'; end if;

  for v_attempts in 1..4 loop
    v_result := public.verify_email_otp_challenge_internal(
      '10000000-0000-4000-8000-000000000001', repeat('a', 64), repeat('d', 64), repeat('c', 64)
    );
    if v_result->>'status' <> 'rejected' then raise exception 'wrong OTP accepted'; end if;
  end loop;
  select attempts, state into v_attempts, v_state
    from private.email_otp_challenges where challenge_id = '10000000-0000-4000-8000-000000000001';
  if v_attempts <> 4 or v_state <> 'pending' then raise exception 'attempts 1-4 did not remain pending'; end if;

  v_result := public.verify_email_otp_challenge_internal(
    '10000000-0000-4000-8000-000000000001', repeat('a', 64), repeat('b', 64), repeat('c', 64)
  );
  if v_result->>'status' <> 'verified' then raise exception 'correct OTP rejected'; end if;
  v_result := public.verify_email_otp_challenge_internal(
    '10000000-0000-4000-8000-000000000001', repeat('a', 64), repeat('b', 64), repeat('c', 64)
  );
  if v_result->>'status' <> 'rejected' then raise exception 'used OTP was reusable'; end if;

  v_result := public.begin_email_otp_challenge_internal(
    '20000000-0000-4000-8000-000000000002', repeat('e', 64), repeat('f', 64), repeat('1', 64)
  );
  if (v_result->>'accepted')::boolean is not true then raise exception 'lockout challenge rejected'; end if;
  for v_attempts in 1..5 loop
    perform public.verify_email_otp_challenge_internal(
      '20000000-0000-4000-8000-000000000002', repeat('e', 64), repeat('2', 64), repeat('1', 64)
    );
  end loop;
  select attempts, state into v_attempts, v_state
    from private.email_otp_challenges where challenge_id = '20000000-0000-4000-8000-000000000002';
  if v_attempts <> 5 or v_state <> 'invalidated' then raise exception 'fifth wrong OTP did not invalidate'; end if;
  v_result := public.verify_email_otp_challenge_internal(
    '20000000-0000-4000-8000-000000000002', repeat('e', 64), repeat('f', 64), repeat('1', 64)
  );
  if v_result->>'status' <> 'rejected' then raise exception 'locked challenge accepted correct OTP'; end if;

  perform public.begin_email_otp_challenge_internal(
    '20000000-0000-4000-8000-000000000003', repeat('e', 64), repeat('f', 64), repeat('1', 64)
  );
  select cooldown_until into v_cooldown from private.email_otp_abuse_state
   where subject_kind = 'email' and subject_hmac = repeat('e', 64);
  if v_cooldown < clock_timestamp() + interval '59 minutes' then
    raise exception 'repeated lockout abuse did not escalate to 60 minutes';
  end if;

  v_result := public.begin_email_otp_challenge_internal(
    '30000000-0000-4000-8000-000000000003', repeat('3', 64), repeat('4', 64), repeat('5', 64)
  );
  update private.email_otp_challenges
     set issued_at = clock_timestamp() - interval '11 minutes',
         expires_at = clock_timestamp() - interval '1 minute'
   where challenge_id = '30000000-0000-4000-8000-000000000003';
  v_result := public.verify_email_otp_challenge_internal(
    '30000000-0000-4000-8000-000000000003', repeat('3', 64), repeat('4', 64), repeat('5', 64)
  );
  select state into v_state from private.email_otp_challenges
   where challenge_id = '30000000-0000-4000-8000-000000000003';
  if v_result->>'status' <> 'rejected' or v_state <> 'expired' then raise exception 'expired OTP accepted'; end if;

  v_result := public.begin_email_otp_challenge_internal(
    '40000000-0000-4000-8000-000000000004', repeat('6', 64), repeat('7', 64), repeat('8', 64)
  );
  v_result := public.begin_email_otp_challenge_internal(
    '40000000-0000-4000-8000-000000000005', repeat('6', 64), repeat('7', 64), repeat('8', 64)
  );
  select cooldown_until into v_cooldown from private.email_otp_abuse_state
   where subject_kind = 'email' and subject_hmac = repeat('6', 64);
  if (v_result->>'accepted')::boolean is not false or v_cooldown < clock_timestamp() + interval '14 minutes' then
    raise exception 'same-email 15 minute cooldown missing';
  end if;
  select cooldown_until into v_cooldown from private.email_otp_abuse_state
   where subject_kind = 'ip' and subject_hmac = repeat('8', 64);
  if v_cooldown is not null then raise exception 'single-email resend blocked the shared IP'; end if;
  perform public.begin_email_otp_challenge_internal(
    '40000000-0000-4000-8000-000000000006', repeat('6', 64), repeat('7', 64), repeat('8', 64)
  );
  select cooldown_until into v_cooldown from private.email_otp_abuse_state
   where subject_kind = 'email' and subject_hmac = repeat('6', 64);
  if v_cooldown < clock_timestamp() + interval '59 minutes' then
    raise exception 'repeated request abuse did not escalate to 60 minutes';
  end if;

  for v_attempts in 1..46 loop
    perform public.verify_email_otp_challenge_internal(
      '90000000-0000-4000-8000-000000000009', repeat('9', 64), repeat('a', 64), repeat('b', 64)
    );
  end loop;
  select cooldown_until into v_cooldown from private.email_otp_abuse_state
   where subject_kind = 'ip' and subject_hmac = repeat('b', 64);
  if v_cooldown < clock_timestamp() + interval '14 minutes' then
    raise exception 'unknown-challenge verification flood did not trigger IP cooldown';
  end if;
  select count(*) into v_attempts from private.email_otp_security_events
   where ip_hmac = repeat('b', 64) and event_type = 'verify_rejected';
  if v_attempts > 27 then raise exception 'cooldown security logging can be amplified'; end if;

  if exists (
    select 1 from information_schema.columns
     where table_schema = 'private'
       and table_name in ('email_otp_challenges', 'email_otp_abuse_state', 'email_otp_security_events')
       and column_name in ('email', 'code', 'otp', 'ip')
  ) then raise exception 'raw credential column exists'; end if;
  if exists (select 1 from private.email_otp_security_events where metadata <> '{}'::jsonb) then
    raise exception 'security event metadata contains unexpected values';
  end if;
end;
$$;

rollback;
