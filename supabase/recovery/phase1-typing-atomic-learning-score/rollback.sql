-- SOURCE ONLY emergency deactivation. Stop the Edge writer first.
-- This preserves every round, prompt, Retry obligation, learning row and score.
begin;

do $$ begin
  if exists (select 1 from public.phase1_typing_rounds where status='active') then
    raise exception 'typing atomic rollback requires zero active rounds';
  end if;
end $$;

revoke all on function public.phase1_typing_round_commit_event(
  uuid,uuid,text,uuid,bigint,bigint,text,text,smallint,text,integer,text,jsonb
) from public,anon,authenticated,service_role;

-- Keep the additive schema and export reader so completed evidence remains
-- recoverable. Restore only the prior reviewed issuance/refill/load entrypoints.
drop function public.phase1_typing_round_issue(uuid,uuid,text,smallint,bigint,jsonb,jsonb);
alter function public.phase1_typing_round_issue_prelearning(uuid,uuid,text,smallint,bigint,jsonb,jsonb)
  rename to phase1_typing_round_issue;
drop function public.phase1_typing_round_append_reserve(uuid,uuid,text,uuid,bigint,jsonb);
alter function public.phase1_typing_round_append_reserve_prelearning(uuid,uuid,text,uuid,bigint,jsonb)
  rename to phase1_typing_round_append_reserve;
drop function public.phase1_typing_round_refill(uuid,uuid,text,uuid,bigint,bigint,bigint,smallint,bigint,bigint,bigint,jsonb);
alter function public.phase1_typing_round_refill_prelearning(uuid,uuid,text,uuid,bigint,bigint,bigint,smallint,bigint,bigint,bigint,jsonb)
  rename to phase1_typing_round_refill;
drop function public.phase1_typing_round_load(uuid,uuid,bigint,bigint,smallint);
alter function public.phase1_typing_round_load_prelearning(uuid,uuid,bigint,bigint,smallint)
  rename to phase1_typing_round_load;

revoke all on function public.phase1_typing_round_issue(uuid,uuid,text,smallint,bigint,jsonb,jsonb)
  from public,anon,authenticated;
revoke all on function public.phase1_typing_round_append_reserve(uuid,uuid,text,uuid,bigint,jsonb)
  from public,anon,authenticated;
revoke all on function public.phase1_typing_round_refill(uuid,uuid,text,uuid,bigint,bigint,bigint,smallint,bigint,bigint,bigint,jsonb)
  from public,anon,authenticated;
revoke all on function public.phase1_typing_round_load(uuid,uuid,bigint,bigint,smallint)
  from public,anon,authenticated;
grant execute on function public.phase1_typing_round_issue(uuid,uuid,text,smallint,bigint,jsonb,jsonb) to service_role;
grant execute on function public.phase1_typing_round_append_reserve(uuid,uuid,text,uuid,bigint,jsonb) to service_role;
grant execute on function public.phase1_typing_round_refill(uuid,uuid,text,uuid,bigint,bigint,bigint,smallint,bigint,bigint,bigint,jsonb) to service_role;
grant execute on function public.phase1_typing_round_load(uuid,uuid,bigint,bigint,smallint) to service_role;

commit;
