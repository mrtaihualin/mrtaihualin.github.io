-- Roll back only the exact Paid 193 additive batch.
-- Fail closed when any Paid SRS state/operation references the batch so user history is never deleted.

begin;
lock table public.game_words in share row exclusive mode;

do $precheck$
begin
  if (select count(*) from public.game_words where catalog_version='paid-queue-193-v1') <> 193
     or (select md5(string_agg(record_hash, E'\n' order by content_key collate "C")) from public.game_words where catalog_version='paid-queue-193-v1') <> '906441641a315015fbf64d1ebf78d863' then
    raise exception 'Paid 193 rollback target invariant failed';
  end if;
  if exists (
    select 1 from public.phase2_paid_srs_states s
    join public.game_words w using(content_key)
    where w.catalog_version='paid-queue-193-v1'
  ) or exists (
    select 1 from public.phase2_paid_srs_operations o
    join public.game_words w using(content_key)
    where w.catalog_version='paid-queue-193-v1'
  ) then
    raise exception 'Paid 193 rollback stopped: user-linked SRS data exists';
  end if;
end
$precheck$;

delete from public.game_words where catalog_version='paid-queue-193-v1';

do $postcheck$
begin
  if exists(select 1 from public.game_words where catalog_version='paid-queue-193-v1')
     or (select count(*) from public.game_words where status='active') <> 200
     or (select md5(string_agg(record_hash, E'\n' order by content_key collate "C")) from public.game_words where status='active') <> '4be1d6442da1c2980b1e084aafc45394'
     or (select count(*) from public.game_words where status='queued' and access_tier='paid') <> 189
     or (select md5(string_agg(record_hash, E'\n' order by content_key collate "C")) from public.game_words where status='queued' and access_tier='paid') <> '2719d0ca5647c7b7ad52c5d12ac421c8'
     or (select count(*) from public.phase1_product_entitlements where entitlement='owner_all_access') <> 1 then
    raise exception 'Paid 193 rollback postcheck failed';
  end if;
  if has_table_privilege('anon','public.game_words','select') or has_table_privilege('authenticated','public.game_words','select') then
    raise exception 'browser role can read protected vocabulary catalog';
  end if;
end
$postcheck$;

notify pgrst,'reload schema';
commit;
