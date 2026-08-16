-- Phase 1: extend the existing internal cron-secret contract to the three
-- service-role cron handlers that still relied on platform verify_jwt alone.
--
-- No secret value is stored here. The existing Vault secret
-- `cron_shared_secret` and Edge secret `CRON_INTERNAL_SECRET` are reused.
--
-- Authorized Production order (do not skip or reorder):
--   1. Run [A] and confirm every row is PASS.
--   2. Run [B] to add x-cron-secret to the three existing wrappers.
--      Current Edge versions ignore the added header, so this is backward-safe.
--   3. Run [C] and confirm 3/3 wrappers include the internal header.
--   4. Deploy request-sla-cron, low-quota-cron, then class-reminder-cron.
--   5. Confirm the next scheduled invocation of each returns 2xx before closeout.
--
-- Production SQL, Edge deploys and invocations require separate explicit Lin
-- authorization. Never invoke these notification handlers as a smoke test.

-- [A] READ-ONLY PRECHECK
select
  exists(select 1 from vault.secrets where name = 'cron_shared_secret')
    as shared_secret_present,
  (select count(*)
   from pg_proc p
   join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'private'
     and p.proname in (
       'call_request_sla_cron',
       'call_low_quota_cron',
       'call_class_reminder_cron'
     )) = 3 as wrappers_present;

-- [B] APPLY ONLY AFTER [A] RETURNS true / true
create or replace function private.call_request_sla_cron()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key        text;
  v_secret     text;
  v_request_id bigint;
begin
  select decrypted_secret into v_key
  from vault.decrypted_secrets where name = 'cron_request_sla_key';
  select decrypted_secret into v_secret
  from vault.decrypted_secrets where name = 'cron_shared_secret';

  if v_key is null then
    raise exception 'missing cron_request_sla_key; request not sent';
  end if;
  if v_secret is null then
    raise exception 'missing cron_shared_secret; request not sent';
  end if;

  select net.http_post(
    url     := 'https://qzkxlhpcputsvbqmtqfi.supabase.co/functions/v1/request-sla-cron',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'Authorization', 'Bearer ' || v_key,
                 'x-cron-secret', v_secret
               ),
    body    := '{}'::jsonb
  ) into v_request_id;

  insert into private.cron_http_log(job_name, request_id)
  values ('request-sla-reminder', v_request_id);
end;
$$;
revoke all on function private.call_request_sla_cron() from public, anon, authenticated;

create or replace function private.call_low_quota_cron()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key        text;
  v_secret     text;
  v_request_id bigint;
begin
  select decrypted_secret into v_key
  from vault.decrypted_secrets where name = 'cron_low_quota_key';
  select decrypted_secret into v_secret
  from vault.decrypted_secrets where name = 'cron_shared_secret';

  if v_key is null then
    raise exception 'missing cron_low_quota_key; request not sent';
  end if;
  if v_secret is null then
    raise exception 'missing cron_shared_secret; request not sent';
  end if;

  select net.http_post(
    url     := 'https://qzkxlhpcputsvbqmtqfi.supabase.co/functions/v1/low-quota-cron',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'Authorization', 'Bearer ' || v_key,
                 'x-cron-secret', v_secret
               ),
    body    := '{}'::jsonb
  ) into v_request_id;

  insert into private.cron_http_log(job_name, request_id)
  values ('low-quota-daily', v_request_id);
end;
$$;
revoke all on function private.call_low_quota_cron() from public, anon, authenticated;

create or replace function private.call_class_reminder_cron()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key        text;
  v_secret     text;
  v_request_id bigint;
begin
  select decrypted_secret into v_key
  from vault.decrypted_secrets where name = 'cron_class_reminder_key';
  select decrypted_secret into v_secret
  from vault.decrypted_secrets where name = 'cron_shared_secret';

  if v_key is null then
    raise exception 'missing cron_class_reminder_key; request not sent';
  end if;
  if v_secret is null then
    raise exception 'missing cron_shared_secret; request not sent';
  end if;

  select net.http_post(
    url     := 'https://qzkxlhpcputsvbqmtqfi.supabase.co/functions/v1/class-reminder-cron',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'Authorization', 'Bearer ' || v_key,
                 'x-cron-secret', v_secret
               ),
    body    := '{}'::jsonb
  ) into v_request_id;

  insert into private.cron_http_log(job_name, request_id)
  values ('class-reminder-every-5-min', v_request_id);
end;
$$;
revoke all on function private.call_class_reminder_cron() from public, anon, authenticated;

-- [C] READ-ONLY POSTCHECK: expected wrappers_with_internal_header = 3
select count(*) as wrappers_with_internal_header
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'private'
  and p.proname in (
    'call_request_sla_cron',
    'call_low_quota_cron',
    'call_class_reminder_cron'
  )
  and position('x-cron-secret' in pg_get_functiondef(p.oid)) > 0;

-- [Z] ROLLBACK
-- The safe rollback is to redeploy the preceding Git versions of the affected
-- Edge handlers. The wrappers may keep sending x-cron-secret because preceding
-- handlers ignore unknown headers. Do not remove the header first: doing so
-- while guarded Edge versions are active would stop the scheduled jobs at 403.
