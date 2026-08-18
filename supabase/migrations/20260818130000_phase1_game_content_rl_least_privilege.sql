-- Phase 1 game-content rate-counter least privilege.
-- SOURCE ONLY until Lin separately approves this exact Production SQL action.
--
-- Recovery boundary: never restore PUBLIC/anon/authenticated EXECUTE. This file
-- is deliberately rerunnable and is also the ACL recovery action after partial
-- grant drift. If the postcheck passes but a server caller regresses, preserve
-- this closed ACL and recover the caller/Edge source instead.

begin;

-- PRECHECK: fail before any grant mutation unless the exact existing internal
-- SECURITY DEFINER signature and required service role are present.
do $precheck$
declare
  v_proc oid;
  v_security_definer boolean;
begin
  v_proc := pg_catalog.to_regprocedure('public.game_content_rl_check(text,integer,integer)');
  if v_proc is null then
    raise exception 'missing public.game_content_rl_check(text,integer,integer)';
  end if;

  select p.prosecdef into v_security_definer
  from pg_catalog.pg_proc as p
  where p.oid = v_proc;

  if v_security_definer is distinct from true then
    raise exception 'game_content_rl_check is not SECURITY DEFINER';
  end if;

  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'service_role') then
    raise exception 'service_role is missing';
  end if;
end
$precheck$;

revoke execute on function public.game_content_rl_check(text, integer, integer)
  from public, anon, authenticated;

grant execute on function public.game_content_rl_check(text, integer, integer)
  to service_role;

-- POSTCHECK: PUBLIC is grantee oid 0. has_function_privilege also detects an
-- inherited PUBLIC grant, so both catalog and effective browser privileges must
-- be closed while the service role remains usable.
do $postcheck$
begin
  if exists (
    select 1
    from pg_catalog.pg_proc as p
    join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
    cross join lateral pg_catalog.aclexplode(
      coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))
    ) as acl
    where p.oid = pg_catalog.to_regprocedure('public.game_content_rl_check(text,integer,integer)')
      and n.nspname = 'public'
      and acl.grantee = 0
      and acl.privilege_type = 'EXECUTE'
  )
     or has_function_privilege('anon', 'public.game_content_rl_check(text,integer,integer)', 'execute')
     or has_function_privilege('authenticated', 'public.game_content_rl_check(text,integer,integer)', 'execute') then
    raise exception 'game_content_rl_check remains executable by a browser role';
  end if;

  if not has_function_privilege(
    'service_role', 'public.game_content_rl_check(text,integer,integer)', 'execute'
  ) then
    raise exception 'service_role cannot execute game_content_rl_check';
  end if;
end
$postcheck$;

commit;
