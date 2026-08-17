-- P1-D-05/P1-D-07/P1-D-08 recovery source only.
-- HIGH RISK: do not run against Production without Lin's exact authorization.
-- Run with psql from this tracked path; \ir is intentionally path-relative.
\set ON_ERROR_STOP on

-- Restore the exact immediately-pre-D08 tone-round database contract. This
-- source is already the single tracked owner of the prior function definition.
\ir ../../sql/2026-08-16_phase1_tone_round_atomic.sql

-- Keep D08 additive objects inert and least-privileged. No table/function is
-- dropped and no player row is read, rewritten, copied, or deleted here.
begin;

do $$
begin
  if pg_catalog.to_regclass('public.phase1_free_streak_status') is null
     or pg_catalog.to_regclass('public.phase1_free_streak_days') is null
     or pg_catalog.to_regclass('public.phase1_streak_outage_days') is null then
    raise exception 'phase1_gamification_recovery_precheck_failed';
  end if;
end;
$$;

alter table public.phase1_free_streak_status enable row level security;
alter table public.phase1_free_streak_days enable row level security;
alter table public.phase1_streak_outage_days enable row level security;

revoke all on table public.phase1_free_streak_status from public, anon, authenticated;
revoke all on table public.phase1_free_streak_days from public, anon, authenticated;
revoke all on table public.phase1_streak_outage_days from public, anon, authenticated;
grant select, insert, update on table public.phase1_free_streak_status to service_role;
grant select, insert on table public.phase1_free_streak_days to service_role;
grant select, insert, update, delete on table public.phase1_streak_outage_days to service_role;

revoke all on function public.phase1_free_gamification_status(uuid)
  from public, anon, authenticated;
grant execute on function public.phase1_free_gamification_status(uuid) to service_role;

revoke all on function public.phase1_free_gamification_apply(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.phase1_free_gamification_apply(uuid, uuid, text) to service_role;

revoke all on function public.phase1_practice_events_record_and_gamification(
  uuid, uuid, text, timestamptz, text, jsonb
) from public, anon, authenticated;
grant execute on function public.phase1_practice_events_record_and_gamification(
  uuid, uuid, text, timestamptz, text, jsonb
) to service_role;

commit;
