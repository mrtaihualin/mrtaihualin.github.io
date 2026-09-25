-- Production Login Free SRS least-privilege repair.
-- This migration changes privileges/policy only; it does not update or delete SRS rows.

begin;

alter table public.tone_srs_state enable row level security;
alter table public.tone_round_operations enable row level security;

revoke all on table public.tone_srs_state from public, anon, authenticated;
revoke all on table public.tone_round_operations from public, anon, authenticated;

grant select on table public.tone_srs_state to authenticated;
grant select, insert, update, delete on table public.tone_srs_state to service_role;
grant select, insert, update, delete on table public.tone_round_operations to service_role;

drop policy if exists tone_srs_select_own on public.tone_srs_state;
create policy tone_srs_select_own
on public.tone_srs_state
for select
to authenticated
using ((select auth.uid()) = user_id);

revoke all on function public.phase1_tone_round_commit(
  uuid, uuid, text, text, smallint, text, boolean, smallint, text, boolean, boolean,
  smallint, text, boolean, boolean, text, boolean, boolean, boolean
) from public, anon, authenticated;
grant execute on function public.phase1_tone_round_commit(
  uuid, uuid, text, text, smallint, text, boolean, smallint, text, boolean, boolean,
  smallint, text, boolean, boolean, text, boolean, boolean, boolean
) to service_role;

commit;
