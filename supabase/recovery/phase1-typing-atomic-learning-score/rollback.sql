-- SOURCE ONLY emergency deactivation. Stop the Edge writer first.
-- This preserves every round, prompt, Retry obligation, learning row and score.
-- The rollback is deliberately fail-closed: it does not issue a round that the
-- restored pre-atomic completion path cannot finish safely.
begin;

do $$ begin
  if exists (select 1 from public.phase1_typing_rounds where status='active') then
    raise exception 'typing atomic rollback requires zero active rounds';
  end if;
end $$;

revoke all on function public.phase1_typing_round_commit_event(
  uuid,uuid,text,uuid,bigint,bigint,text,text,smallint,text,integer,text,jsonb
) from public,anon,authenticated,service_role;

revoke all on function public.phase1_typing_round_append_event(
  uuid,uuid,text,uuid,bigint,bigint,text,text
) from public,anon,authenticated,service_role;
revoke all on function public.phase1_typing_round_issue(
  uuid,uuid,text,smallint,bigint,jsonb,jsonb
) from public,anon,authenticated,service_role;
revoke all on function public.phase1_typing_round_append_reserve(
  uuid,uuid,text,uuid,bigint,jsonb
) from public,anon,authenticated,service_role;
revoke all on function public.phase1_typing_round_refill(
  uuid,uuid,text,uuid,bigint,bigint,bigint,smallint,bigint,bigint,bigint,jsonb
) from public,anon,authenticated,service_role;

-- Keep the additive schema, owner-bound export and current read-only load so
-- completed evidence remains recoverable. Reapply the forward migration to
-- restore the single atomic writer; never reactivate a predecessor writer.

commit;
