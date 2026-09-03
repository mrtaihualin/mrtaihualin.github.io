-- Strict server-confirmed global logout for the authenticated account owner.
-- SOURCE ONLY until the exact Production Auth/SQL rollout is approved.
-- Deletes only Auth session material; it never changes auth.users or application data.

begin;

do $precheck$
begin
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'service_role') then
    raise exception 'service_role is missing';
  end if;
end
$precheck$;

create or replace function public.phase1_auth_revoke_all_sessions(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_deleted_refresh_tokens integer := 0;
  v_deleted_sessions integer := 0;
  v_remaining_refresh_tokens integer := 0;
  v_remaining_sessions integer := 0;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise insufficient_privilege using message = 'service_role required';
  end if;

  delete from auth.refresh_tokens
  where user_id = p_user_id::text;
  get diagnostics v_deleted_refresh_tokens = row_count;

  delete from auth.sessions
  where user_id = p_user_id;
  get diagnostics v_deleted_sessions = row_count;

  select count(*)::integer into v_remaining_refresh_tokens
  from auth.refresh_tokens
  where user_id = p_user_id::text;

  select count(*)::integer into v_remaining_sessions
  from auth.sessions
  where user_id = p_user_id;

  return jsonb_build_object(
    'deleted_refresh_tokens', v_deleted_refresh_tokens,
    'deleted_sessions', v_deleted_sessions,
    'remaining_refresh_tokens', v_remaining_refresh_tokens,
    'remaining_sessions', v_remaining_sessions
  );
end
$function$;

revoke all on function public.phase1_auth_revoke_all_sessions(uuid)
  from public, anon, authenticated;
grant execute on function public.phase1_auth_revoke_all_sessions(uuid)
  to service_role;

do $postcheck$
begin
  if has_function_privilege('anon', 'public.phase1_auth_revoke_all_sessions(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.phase1_auth_revoke_all_sessions(uuid)', 'execute') then
    raise exception 'phase1_auth_revoke_all_sessions remains browser-executable';
  end if;

  if not has_function_privilege('service_role', 'public.phase1_auth_revoke_all_sessions(uuid)', 'execute') then
    raise exception 'service_role cannot execute phase1_auth_revoke_all_sessions';
  end if;
end
$postcheck$;

commit;
