-- SOURCE ONLY — remove the unactivated initial-reserve issuance RPC.
-- This does not delete or rewrite any round, prompt, event, operation or reserve
-- row. Production execution requires a separate exact HIGH-risk approval.
begin;
drop function if exists public.phase1_typing_round_issue(uuid,uuid,text,smallint,bigint,jsonb,jsonb);
commit;
