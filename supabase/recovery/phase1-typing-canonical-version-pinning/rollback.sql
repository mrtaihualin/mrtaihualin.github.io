-- DATA-PRESERVING SOURCE-ONLY rollback for the canonical pin wrapper unit.
-- Pin columns and their evidence are deliberately retained.
begin;

drop function if exists public.phase1_typing_round_issue(uuid,uuid,text,smallint,bigint,jsonb,jsonb);
drop function if exists public.phase1_typing_round_append_reserve(uuid,uuid,text,uuid,bigint,jsonb);
drop function if exists public.phase1_typing_round_append_event(uuid,uuid,text,uuid,bigint,bigint,text,text);
drop function if exists public.phase1_typing_round_load(uuid,uuid,bigint,bigint,smallint);

alter function public.phase1_typing_round_issue_unversioned(uuid,uuid,text,smallint,bigint,jsonb,jsonb)
  rename to phase1_typing_round_issue;
alter function public.phase1_typing_round_append_reserve_unversioned(uuid,uuid,text,uuid,bigint,jsonb)
  rename to phase1_typing_round_append_reserve;
alter function public.phase1_typing_round_append_event_unversioned(uuid,uuid,text,uuid,bigint,bigint,text,text)
  rename to phase1_typing_round_append_event;
alter function public.phase1_typing_round_load_unversioned(uuid,uuid,bigint,bigint,smallint)
  rename to phase1_typing_round_load;

revoke all on function public.phase1_typing_round_issue(uuid,uuid,text,smallint,bigint,jsonb,jsonb) from public,anon,authenticated;
revoke all on function public.phase1_typing_round_append_reserve(uuid,uuid,text,uuid,bigint,jsonb) from public,anon,authenticated;
revoke all on function public.phase1_typing_round_append_event(uuid,uuid,text,uuid,bigint,bigint,text,text) from public,anon,authenticated;
revoke all on function public.phase1_typing_round_load(uuid,uuid,bigint,bigint,smallint) from public,anon,authenticated;
grant execute on function public.phase1_typing_round_issue(uuid,uuid,text,smallint,bigint,jsonb,jsonb) to service_role;
grant execute on function public.phase1_typing_round_append_reserve(uuid,uuid,text,uuid,bigint,jsonb) to service_role;
grant execute on function public.phase1_typing_round_append_event(uuid,uuid,text,uuid,bigint,bigint,text,text) to service_role;
grant execute on function public.phase1_typing_round_load(uuid,uuid,bigint,bigint,smallint) to service_role;

commit;
