-- Phase 1 account audit integrity hardening (source-only until explicitly applied).
-- `log_account_audit` is SECURITY DEFINER and writes a private audit table, so it
-- is an internal service boundary, not a browser-callable RPC. Postgres grants
-- EXECUTE to PUBLIC on new functions by default; revoke every browser role and
-- retain only the Edge/service role on the exact existing signature.

alter function public.log_account_audit(uuid, text, jsonb, jsonb, text, uuid, text)
  set search_path = '';

revoke execute on function public.log_account_audit(uuid, text, jsonb, jsonb, text, uuid, text)
  from public, anon, authenticated;

grant execute on function public.log_account_audit(uuid, text, jsonb, jsonb, text, uuid, text)
  to service_role;

-- Abort rollout if any browser role can still execute or if the service role lost
-- its required internal capability. This changes no account or audit-row data.
do $verify$
begin
  if exists (
    select 1
    from pg_catalog.pg_proc as p
    join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
    cross join lateral pg_catalog.aclexplode(coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))) as acl
    where n.nspname = 'public'
      and p.proname = 'log_account_audit'
      and pg_catalog.pg_get_function_identity_arguments(p.oid) = 'p_user_id uuid, p_event_type text, p_before_state jsonb, p_after_state jsonb, p_actor_type text, p_actor_id uuid, p_provider text'
      and acl.grantee = 0
      and acl.privilege_type = 'EXECUTE'
  )
     or has_function_privilege('anon', 'public.log_account_audit(uuid,text,jsonb,jsonb,text,uuid,text)', 'execute')
     or has_function_privilege('authenticated', 'public.log_account_audit(uuid,text,jsonb,jsonb,text,uuid,text)', 'execute') then
    raise exception 'log_account_audit remains executable by a browser role';
  end if;

  if not has_function_privilege('service_role', 'public.log_account_audit(uuid,text,jsonb,jsonb,text,uuid,text)', 'execute') then
    raise exception 'service_role cannot execute log_account_audit';
  end if;
end
$verify$;
