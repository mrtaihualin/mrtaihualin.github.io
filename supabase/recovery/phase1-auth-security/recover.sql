-- P1-D-01/P1-D-09 inert SQL recovery source only.
-- HIGH RISK: never run against Production without Lin's exact approval for
-- this file, target, precheck, recovery action, and postcheck.
--
-- This is forward recovery, not destructive rollback. It preserves every OTP
-- table, row, event, function, sequence, and account-audit row. It disables the
-- Email-OTP database entrypoints for service_role and reasserts the privileged
-- account-audit boundary. Browser access to log_account_audit is never restored.
\set ON_ERROR_STOP on

begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Refuse to recover a partial or unknown forward state. No privilege is changed
-- before every exact additive object and required Supabase role is present.
do $precheck$
declare
  v_function regprocedure;
begin
  if pg_catalog.to_regrole('anon') is null
     or pg_catalog.to_regrole('authenticated') is null
     or pg_catalog.to_regrole('service_role') is null then
    raise exception 'AUTH_SQL_RECOVERY_PRECHECK_REQUIRED_ROLE_MISSING';
  end if;

  if pg_catalog.to_regclass('private.email_otp_challenges') is null
     or pg_catalog.to_regclass('private.email_otp_abuse_state') is null
     or pg_catalog.to_regclass('private.email_otp_security_events') is null
     or pg_catalog.to_regclass('private.email_otp_security_events_id_seq') is null then
    raise exception 'AUTH_SQL_RECOVERY_PRECHECK_EMAIL_OTP_OBJECT_MISSING';
  end if;

  foreach v_function in array array[
    pg_catalog.to_regprocedure('public.begin_email_otp_challenge_internal(uuid,text,text,text)'),
    pg_catalog.to_regprocedure('public.verify_email_otp_challenge_internal(uuid,text,text,text)'),
    pg_catalog.to_regprocedure('public.invalidate_email_otp_challenge_internal(uuid,text,text,text)'),
    pg_catalog.to_regprocedure('public.log_email_otp_security_internal(text,uuid,text,text,text)'),
    pg_catalog.to_regprocedure('public.purge_email_otp_security_internal()'),
    pg_catalog.to_regprocedure('public.log_account_audit(uuid,text,jsonb,jsonb,text,uuid,text)')
  ] loop
    if v_function is null then
      raise exception 'AUTH_SQL_RECOVERY_PRECHECK_REQUIRED_FUNCTION_MISSING';
    end if;

    if not exists (
      select 1
      from pg_catalog.pg_proc as p
      where p.oid = v_function
        and p.prosecdef
        and exists (
          select 1
          from pg_catalog.unnest(coalesce(p.proconfig, array[]::text[])) as setting(value)
          where setting.value = 'search_path=""'
        )
    ) then
      raise exception 'AUTH_SQL_RECOVERY_PRECHECK_FUNCTION_SECURITY_DRIFT: %', v_function;
    end if;
  end loop;
end
$precheck$;

lock table private.email_otp_challenges in access exclusive mode;
lock table private.email_otp_abuse_state in access exclusive mode;
lock table private.email_otp_security_events in access exclusive mode;

-- Preserve the additive schema and its evidence while denying every direct
-- browser or service-role table/sequence path.
alter table private.email_otp_challenges enable row level security;
alter table private.email_otp_challenges force row level security;
alter table private.email_otp_abuse_state enable row level security;
alter table private.email_otp_abuse_state force row level security;
alter table private.email_otp_security_events enable row level security;
alter table private.email_otp_security_events force row level security;

revoke all on table private.email_otp_challenges
  from public, anon, authenticated, service_role;
revoke all on table private.email_otp_abuse_state
  from public, anon, authenticated, service_role;
revoke all on table private.email_otp_security_events
  from public, anon, authenticated, service_role;
revoke all on sequence private.email_otp_security_events_id_seq
  from public, anon, authenticated, service_role;

-- Make the Email-OTP broker database path inert. PostgreSQL owners retain their
-- intrinsic administrative capability; no application/browser role can call it.
revoke execute on function public.begin_email_otp_challenge_internal(uuid, text, text, text)
  from public, anon, authenticated, service_role;
revoke execute on function public.verify_email_otp_challenge_internal(uuid, text, text, text)
  from public, anon, authenticated, service_role;
revoke execute on function public.invalidate_email_otp_challenge_internal(uuid, text, text, text)
  from public, anon, authenticated, service_role;
revoke execute on function public.log_email_otp_security_internal(text, uuid, text, text, text)
  from public, anon, authenticated, service_role;
revoke execute on function public.purge_email_otp_security_internal()
  from public, anon, authenticated, service_role;

-- The account-audit hardening has no safe backward ACL. Reopening this SECURITY
-- DEFINER function to a browser role would recreate the vulnerability, so the
-- safety-preserving recovery is to keep browser execution revoked and retain the
-- exact internal service capability.
alter function public.log_account_audit(uuid, text, jsonb, jsonb, text, uuid, text)
  set search_path = '';
revoke execute on function public.log_account_audit(uuid, text, jsonb, jsonb, text, uuid, text)
  from public, anon, authenticated;
grant execute on function public.log_account_audit(uuid, text, jsonb, jsonb, text, uuid, text)
  to service_role;

-- Fail the transaction if recovery did not reach the exact closed state.
do $postcheck$
declare
  v_function regprocedure;
  v_role text;
begin
  if exists (
    select 1
    from pg_catalog.pg_class as c
    join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
    where n.nspname = 'private'
      and c.relname in (
        'email_otp_challenges',
        'email_otp_abuse_state',
        'email_otp_security_events'
      )
      and (not c.relrowsecurity or not c.relforcerowsecurity)
  ) then
    raise exception 'AUTH_SQL_RECOVERY_POSTCHECK_RLS_NOT_FORCED';
  end if;

  foreach v_role in array array['anon', 'authenticated', 'service_role'] loop
    if pg_catalog.has_table_privilege(v_role, 'private.email_otp_challenges', 'select,insert,update,delete,truncate,references,trigger')
       or pg_catalog.has_table_privilege(v_role, 'private.email_otp_abuse_state', 'select,insert,update,delete,truncate,references,trigger')
       or pg_catalog.has_table_privilege(v_role, 'private.email_otp_security_events', 'select,insert,update,delete,truncate,references,trigger')
       or pg_catalog.has_sequence_privilege(v_role, 'private.email_otp_security_events_id_seq', 'usage,select,update') then
      raise exception 'AUTH_SQL_RECOVERY_POSTCHECK_DIRECT_PRIVILEGE_REMAINS: %', v_role;
    end if;
  end loop;

  foreach v_function in array array[
    pg_catalog.to_regprocedure('public.begin_email_otp_challenge_internal(uuid,text,text,text)'),
    pg_catalog.to_regprocedure('public.verify_email_otp_challenge_internal(uuid,text,text,text)'),
    pg_catalog.to_regprocedure('public.invalidate_email_otp_challenge_internal(uuid,text,text,text)'),
    pg_catalog.to_regprocedure('public.log_email_otp_security_internal(text,uuid,text,text,text)'),
    pg_catalog.to_regprocedure('public.purge_email_otp_security_internal()')
  ] loop
    if exists (
      select 1
      from pg_catalog.pg_proc as p
      cross join lateral pg_catalog.aclexplode(
        coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))
      ) as acl
      where p.oid = v_function
        and acl.grantee = 0
        and acl.privilege_type = 'EXECUTE'
    )
       or pg_catalog.has_function_privilege('anon', v_function, 'execute')
       or pg_catalog.has_function_privilege('authenticated', v_function, 'execute')
       or pg_catalog.has_function_privilege('service_role', v_function, 'execute') then
      raise exception 'AUTH_SQL_RECOVERY_POSTCHECK_EMAIL_OTP_EXECUTE_REMAINS: %', v_function;
    end if;
  end loop;

  v_function := pg_catalog.to_regprocedure(
    'public.log_account_audit(uuid,text,jsonb,jsonb,text,uuid,text)'
  );
  if exists (
    select 1
    from pg_catalog.pg_proc as p
    cross join lateral pg_catalog.aclexplode(
      coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))
    ) as acl
    where p.oid = v_function
      and acl.grantee = 0
      and acl.privilege_type = 'EXECUTE'
  )
     or pg_catalog.has_function_privilege('anon', v_function, 'execute')
     or pg_catalog.has_function_privilege('authenticated', v_function, 'execute')
     or not pg_catalog.has_function_privilege('service_role', v_function, 'execute') then
    raise exception 'AUTH_SQL_RECOVERY_POSTCHECK_ACCOUNT_AUDIT_BOUNDARY_INVALID';
  end if;
end
$postcheck$;

commit;
