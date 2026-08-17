-- Run only in a disposable/local PostgreSQL fixture after applying:
--   1) 20260817041659_phase1_nickname_safety.sql
--   2) 2026-08-17_phase1_nickname_recovery.sql
-- Everything created here is rolled back.

begin;

insert into auth.users (id, email)
values
  ('10000000-0000-4000-8000-000000000001', 'nickname-recovery-a@example.invalid'),
  ('20000000-0000-4000-8000-000000000002', 'nickname-recovery-b@example.invalid');

insert into public.profiles (user_id, nickname, avatar, badge_id)
values
  ('10000000-0000-4000-8000-000000000001', 'Fixture private A', 'avatar-a', 'badge-a'),
  ('20000000-0000-4000-8000-000000000002', 'Fixture private B', 'avatar-b', 'badge-b');

insert into public.game_score_submissions
  (submission_id, user_id, game, difficulty, score, total, evidence_hash, score_version, created_at)
values
  ('30000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', 'tone', '初', 40, 5, repeat('a', 64), 'fixture', now()),
  ('40000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000002', 'tone', '初', 20, 5, repeat('b', 64), 'fixture', now()),
  ('50000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000001', 'reading', '中', 30, 5, repeat('c', 64), 'fixture', now());

insert into public.leaderboard_public_identities
  (user_id, public_identity_id, nickname, nickname_key, nickname_updated_at)
values
  ('10000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000006', 'Fixture public A', 'fixture public a', now()),
  ('20000000-0000-4000-8000-000000000002', '70000000-0000-4000-8000-000000000007', 'Fixture public B', 'fixture public b', now());

insert into public.leaderboard_nickname_reports
  (report_id, reporter_user_id, target_public_identity_id, reported_nickname)
values
  ('80000000-0000-4000-8000-000000000008', '10000000-0000-4000-8000-000000000001',
   '70000000-0000-4000-8000-000000000007', 'Fixture public B');

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);

do $$
declare
  v_tone record;
  v_reading record;
  v_result text;
begin
  if not (
    select bool_and(c.relrowsecurity)
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in ('leaderboard_public_identities', 'leaderboard_nickname_reports')
  ) then
    raise exception 'nickname additive tables are not RLS-enabled';
  end if;

  if has_table_privilege('anon', 'public.leaderboard_public_identities', 'select')
     or has_table_privilege('authenticated', 'public.leaderboard_public_identities', 'select')
     or has_table_privilege('anon', 'public.leaderboard_nickname_reports', 'select')
     or has_table_privilege('authenticated', 'public.leaderboard_nickname_reports', 'select') then
    raise exception 'browser role retains direct additive-table access';
  end if;

  if has_function_privilege('anon', 'public.set_leaderboard_nickname(text)', 'execute')
     or has_function_privilege('authenticated', 'public.set_leaderboard_nickname(text)', 'execute')
     or has_function_privilege('anon', 'public.get_my_leaderboard_identity()', 'execute')
     or has_function_privilege('authenticated', 'public.get_my_leaderboard_identity()', 'execute')
     or has_function_privilege('anon', 'public.report_leaderboard_nickname(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.report_leaderboard_nickname(uuid)', 'execute') then
    raise exception 'nickname rollout RPC remains executable by a browser role';
  end if;

  if not has_function_privilege('anon', 'public.leaderboard_alltime()', 'execute')
     or not has_function_privilege('authenticated', 'public.leaderboard_alltime()', 'execute')
     or not has_function_privilege('anon', 'public.reading_leaderboard_alltime(text)', 'execute')
     or not has_function_privilege('authenticated', 'public.reading_leaderboard_alltime(text)', 'execute') then
    raise exception 'prior board RPC execute grant missing';
  end if;

  v_result := pg_get_function_result('public.leaderboard_alltime()'::regprocedure);
  if v_result <> 'TABLE(nickname text, avatar text, badge_id text, total_score bigint, games bigint, is_current_user boolean)' then
    raise exception 'tone board signature not restored: %', v_result;
  end if;
  v_result := pg_get_function_result('public.reading_leaderboard_alltime(text)'::regprocedure);
  if v_result <> 'TABLE(nickname text, avatar text, badge_id text, total_score bigint, games bigint, is_current_user boolean)' then
    raise exception 'reading-family board signature not restored: %', v_result;
  end if;

  select * into v_tone from public.leaderboard_alltime() limit 1;
  if v_tone.nickname <> 'Fixture private A'
     or v_tone.total_score <> 40
     or v_tone.games <> 1
     or v_tone.is_current_user is not true then
    raise exception 'prior tone board behavior mismatch: %', row_to_json(v_tone);
  end if;

  select * into v_reading from public.reading_leaderboard_alltime('reading') limit 1;
  if v_reading.nickname <> 'Fixture private A'
     or v_reading.total_score <> 30
     or v_reading.games <> 1
     or v_reading.is_current_user is not true then
    raise exception 'prior reading-family board behavior mismatch: %', row_to_json(v_reading);
  end if;

  if (select count(*) from public.leaderboard_public_identities) <> 2
     or (select count(*) from public.leaderboard_nickname_reports) <> 1 then
    raise exception 'additive nickname evidence rows were not preserved';
  end if;
end;
$$;

rollback;
