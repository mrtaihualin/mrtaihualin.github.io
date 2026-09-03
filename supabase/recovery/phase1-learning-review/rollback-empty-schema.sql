-- PRE-ACTIVATION / ZERO-DATA ONLY.
-- Disable the Review runtime first. This script refuses to delete learning data.

begin;

do $rollback_guard$
declare
  v_has_rows boolean := false;
begin
  if pg_catalog.to_regclass('public.phase1_learning_review_operations') is not null then
    execute 'select exists(select 1 from public.phase1_learning_review_operations)'
      into v_has_rows;
    if v_has_rows then
      raise exception 'rollback blocked: Review operations exist';
    end if;
  end if;

  if pg_catalog.to_regclass('public.phase1_learning_review_states') is not null then
    execute 'select exists(select 1 from public.phase1_learning_review_states)'
      into v_has_rows;
    if v_has_rows then
      raise exception 'rollback blocked: Review states exist';
    end if;
  end if;

  if exists (
    select 1 from pg_catalog.pg_attribute
    where attrelid = 'public.tone_srs_state'::regclass
      and attname = 'item_id' and not attisdropped
  ) then
    execute 'select exists(select 1 from public.tone_srs_state where item_id is not null)'
      into v_has_rows;
    if v_has_rows then
      raise exception 'rollback blocked: stable-item SRS rows exist';
    end if;
  end if;
end
$rollback_guard$;

drop function if exists public.phase1_learning_review_commit(
  uuid, uuid, text, text, smallint, text, text, smallint, text, uuid,
  text, uuid, date, text
);
drop table if exists public.phase1_learning_review_operations;
drop table if exists public.phase1_learning_review_states;
drop index if exists public.uq_tone_srs_state_stable_item;
drop index if exists public.tone_srs_state_item_id_idx;
alter table public.tone_srs_state
  drop constraint if exists tone_srs_state_item_id_fkey,
  drop column if exists item_id;

notify pgrst, 'reload schema';
commit;

