-- SOURCE ONLY / DESTRUCTIVE IF APPLIED.
-- Stop all Typing round writers and preserve/export active round evidence before
-- an explicitly authorized rollback. Never run this against Production without
-- Lin's exact HIGH-risk database authorization.

begin;

drop function if exists public.phase1_typing_round_load(uuid, uuid, bigint, bigint, smallint);
drop function if exists public.phase1_typing_round_append_event(uuid, uuid, text, uuid, bigint, bigint, text, text);
drop function if exists public.phase1_typing_round_append_prompts(uuid, uuid, text, uuid, bigint, jsonb);
drop function if exists public.phase1_typing_round_create(uuid, uuid, text, smallint, bigint, jsonb);

drop table if exists public.phase1_typing_round_operations;
drop table if exists public.phase1_typing_round_events;
drop table if exists public.phase1_typing_round_prompts;
drop table if exists public.phase1_typing_rounds;

commit;
