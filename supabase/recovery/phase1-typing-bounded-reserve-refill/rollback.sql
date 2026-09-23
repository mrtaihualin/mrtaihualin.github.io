-- DATA-PRESERVING SOURCE-ONLY rollback for bounded Typing reserve refill.
begin;

drop function if exists public.phase1_typing_round_refill(
  uuid,uuid,text,uuid,bigint,bigint,bigint,smallint,bigint,bigint,bigint,jsonb
);
drop function if exists public.phase1_typing_round_reserve_load(uuid,uuid,bigint,smallint);

commit;
