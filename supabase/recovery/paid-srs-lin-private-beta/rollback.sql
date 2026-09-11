begin;

do $$
begin
  if exists (select 1 from public.phase2_paid_srs_states)
     or exists (select 1 from public.phase2_paid_srs_operations) then
    raise exception 'Paid private-beta rows exist; export and explicitly approve their removal before rollback';
  end if;
end
$$;

drop function if exists public.phase2_paid_srs_commit(uuid,uuid,text,text,smallint,text,text,date);
drop table if exists public.phase2_paid_srs_operations;
drop table if exists public.phase2_paid_srs_states;

notify pgrst, 'reload schema';
commit;
