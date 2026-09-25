-- Exact ACL/policy rollback to the pre-release Production snapshot.
-- HIGH RISK: restores broad table privileges observed before hardening.
-- Do not run unless Lin explicitly authorizes this exact rollback.

begin;

drop policy if exists tone_srs_select_own on public.tone_srs_state;
create policy tone_srs_select_own
on public.tone_srs_state
for select
to public
using (auth.uid() = user_id);

grant all on table public.tone_srs_state to anon, authenticated;
revoke all on table public.tone_round_operations from public, anon, authenticated;

commit;
