-- Phase 1 Email OTP retention schedule.
-- SOURCE ONLY until Lin separately authorizes this exact Production migration.
--
-- Dependency: `supabase/sql/2026-08-16_email_otp_auth_security.sql` must already
-- be applied and verified. That forward SQL owns the retention semantics:
--   * security events older than 30 days are removed;
--   * completed/expired challenges older than 24 hours are removed;
--   * stale abuse-state rows older than 24 hours are removed once cooldown ended.
-- This migration only makes that already-locked purge run automatically.
--
-- The job runs once daily at 20:30 UTC, after the existing 20:00 UTC account
-- deletion job and away from the existing 19:00 UTC backup window. It does not
-- call an Edge Function, send mail/LINE, contain a secret, or touch Auth config.

begin;

-- Fail before changing cron state if the dependency or scheduler is missing, or
-- if a same-named job exists with any different schedule/command/state.
do $precheck$
declare
  v_purge regprocedure := pg_catalog.to_regprocedure('public.purge_email_otp_security_internal()');
  v_existing_count integer;
  v_exact_count integer;
begin
  if v_purge is null then
    raise exception 'EMAIL_OTP_RETENTION_PRECHECK_PURGE_RPC_MISSING';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_extension where extname = 'pg_cron'
  ) then
    raise exception 'EMAIL_OTP_RETENTION_PRECHECK_PG_CRON_MISSING';
  end if;

  if not pg_catalog.has_function_privilege(current_user, v_purge, 'execute') then
    raise exception 'EMAIL_OTP_RETENTION_PRECHECK_CALLER_CANNOT_EXECUTE_PURGE';
  end if;

  select count(*)::integer
    into v_existing_count
    from cron.job
   where jobname = 'email-otp-retention-daily';

  select count(*)::integer
    into v_exact_count
    from cron.job
   where jobname = 'email-otp-retention-daily'
     and schedule = '30 20 * * *'
     and active
     and pg_catalog.btrim(command) = 'select public.purge_email_otp_security_internal();';

  if v_existing_count > 1 then
    raise exception 'EMAIL_OTP_RETENTION_PRECHECK_DUPLICATE_JOB: %', v_existing_count;
  end if;

  if v_existing_count = 1 and v_exact_count <> 1 then
    raise exception 'EMAIL_OTP_RETENTION_PRECHECK_EXISTING_JOB_DRIFT';
  end if;
end
$precheck$;

-- Idempotent only for the exact already-approved state. Never overwrite or
-- silently repair a same-name drifted job.
do $schedule$
begin
  if not exists (
    select 1 from cron.job where jobname = 'email-otp-retention-daily'
  ) then
    perform cron.schedule(
      'email-otp-retention-daily',
      '30 20 * * *',
      'select public.purge_email_otp_security_internal();'
    );
  end if;
end
$schedule$;

-- Fail the transaction unless exactly one active job has the exact contract.
do $postcheck$
declare
  v_exact_count integer;
begin
  select count(*)::integer
    into v_exact_count
    from cron.job
   where jobname = 'email-otp-retention-daily'
     and schedule = '30 20 * * *'
     and active
     and pg_catalog.btrim(command) = 'select public.purge_email_otp_security_internal();';

  if v_exact_count <> 1 then
    raise exception 'EMAIL_OTP_RETENTION_POSTCHECK_INVALID_JOB_COUNT: %', v_exact_count;
  end if;
end
$postcheck$;

commit;

-- INCIDENT / ROLLBACK NOTE — NOT EXECUTED BY THIS MIGRATION:
-- If the Email OTP calling layer must be stopped, disable this scheduler before
-- changing the OTP database entrypoint privileges so retention cannot race with
-- incident evidence collection. This requires its own exact Production approval:
--   select cron.unschedule('email-otp-retention-daily');
-- Never delete OTP rows manually as a substitute for recovery.
