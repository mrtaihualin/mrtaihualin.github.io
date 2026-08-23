-- Phase 1 server-only SECURITY DEFINER RPC least privilege.
-- SOURCE ONLY until Lin separately approves this exact Production SQL action.
--
-- Scope is intentionally narrow. These three RPCs are service-role/server helpers
-- in current source. Do NOT include public RLS guards such as
-- reading_sessions_rate_ok/tone_sessions_rate_ok, public leaderboard readers, or
-- token-bound student RPCs in this migration.

begin;

do $precheck$
declare
  v_signature text;
  v_proc oid;
  v_security_definer boolean;
  v_signatures text[] := array[
    'public.rl_check(uuid,text,integer,integer)',
    'public.payout_precheck(uuid)',
    'public.lego_consume_daily(text,date,integer)'
  ];
begin
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'service_role') then
    raise exception 'service_role is missing';
  end if;

  foreach v_signature in array v_signatures loop
    v_proc := pg_catalog.to_regprocedure(v_signature);
    if v_proc is null then
      raise exception 'missing server-only function: %', v_signature;
    end if;

    select p.prosecdef into v_security_definer
    from pg_catalog.pg_proc p
    where p.oid = v_proc;

    if v_security_definer is distinct from true then
      raise exception '% is not SECURITY DEFINER', v_signature;
    end if;
  end loop;
end
$precheck$;

revoke all on function public.rl_check(uuid, text, integer, integer)
  from public, anon, authenticated;
revoke all on function public.payout_precheck(uuid)
  from public, anon, authenticated;
revoke all on function public.lego_consume_daily(text, date, integer)
  from public, anon, authenticated;

grant execute on function public.rl_check(uuid, text, integer, integer) to service_role;
grant execute on function public.payout_precheck(uuid) to service_role;
grant execute on function public.lego_consume_daily(text, date, integer) to service_role;

do $postcheck$
declare
  v_signature text;
  v_signatures text[] := array[
    'public.rl_check(uuid,text,integer,integer)',
    'public.payout_precheck(uuid)',
    'public.lego_consume_daily(text,date,integer)'
  ];
begin
  foreach v_signature in array v_signatures loop
    if has_function_privilege('anon', v_signature, 'execute')
       or has_function_privilege('authenticated', v_signature, 'execute') then
      raise exception '% remains executable by a browser role', v_signature;
    end if;

    if not has_function_privilege('service_role', v_signature, 'execute') then
      raise exception 'service_role cannot execute %', v_signature;
    end if;
  end loop;
end
$postcheck$;

commit;
