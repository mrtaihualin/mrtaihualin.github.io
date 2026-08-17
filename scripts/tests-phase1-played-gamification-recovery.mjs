import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const artifactDir = path.join(root, 'supabase/recovery/phase1-played-gamification');
const manifest = JSON.parse(fs.readFileSync(path.join(artifactDir, 'manifest.json'), 'utf8'));
const restore = fs.readFileSync(path.join(artifactDir, 'restore.sql'), 'utf8');
const runbook = fs.readFileSync(path.join(artifactDir, 'README.md'), 'utf8');

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', ...options });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed\n${result.stdout || ''}\n${result.stderr || ''}`);
  }
  return (result.stdout || '').trim();
}

function gitBlob(commit, file) {
  return run('git', ['rev-parse', `${commit}:${file}`]);
}

function gitText(commit, file) {
  return run('git', ['show', `${commit}:${file}`]);
}

function gitObjectExists(object) {
  return spawnSync('git', ['cat-file', '-e', object], {
    cwd: root,
    encoding: 'utf8'
  }).status === 0;
}

function workingTreeBlob(file) {
  return run('git', ['hash-object', file]);
}

let passed = 0;
function check(label, condition) {
  assert.ok(condition, label);
  passed += 1;
  console.log('PASS', label);
}

check('manifest locks the exact forward and previous commits',
  manifest.forward_source_commit === '988cabf4eb546975d62f5d179411ac7c58e5086f' &&
  manifest.previous_runtime_commit === 'a037ec2b3785ee720b2d2dcc826e67c8a2650689');

const forceShallow = process.env.PHASE1_TEST_FORCE_SHALLOW === '1';
const hasForwardHistory = !forceShallow && gitObjectExists(`${manifest.forward_source_commit}^{commit}`);
const hasPreviousHistory = !forceShallow && gitObjectExists(`${manifest.previous_runtime_commit}^{commit}`);

if (hasForwardHistory) {
  run('git', ['merge-base', '--is-ancestor', manifest.forward_source_commit, 'HEAD']);
  check('current branch contains the forward source commit', true);
} else {
  check('shallow checkout retains the exact forward SQL payload',
    Object.values(manifest.sql).every((item) =>
      fs.existsSync(path.join(root, item.path)) && workingTreeBlob(item.path) === item.blob));
}

for (const item of manifest.previous_runtime) {
  if (hasPreviousHistory) {
    check(`previous blob is immutable: ${item.path}`,
      gitBlob(manifest.previous_runtime_commit, item.path) === item.blob);
  } else {
    check(`previous blob is exactly pinned for shallow checkout: ${item.path}`,
      /^[a-f0-9]{40}$/.test(item.blob) &&
      !path.isAbsolute(item.path) &&
      !item.path.split('/').includes('..'));
  }
}
for (const item of Object.values(manifest.sql)) {
  check(`SQL blob is immutable: ${item.path}`,
    (hasForwardHistory
      ? gitBlob(manifest.forward_source_commit, item.path)
      : workingTreeBlob(item.path)) === item.blob);
}

const currentPracticeClient = fs.readFileSync(path.join(root, 'js/games/practice-events.js'), 'utf8');
const currentToneEdge = fs.readFileSync(path.join(root, 'supabase/functions/tone-round/index.ts'), 'utf8');

if (hasPreviousHistory) {
  const previousPracticeEdge = gitText(manifest.previous_runtime_commit, 'supabase/functions/practice-events/index.ts');
  const previousPracticeClient = gitText(manifest.previous_runtime_commit, 'js/games/practice-events.js');
  const previousToneEdge = gitText(manifest.previous_runtime_commit, 'supabase/functions/tone-round/index.ts');

  check('previous Played Edge preserves Played without a gamification caller',
    /admin\.rpc\('phase1_practice_events_record'/.test(previousPracticeEdge) &&
    !/phase1_practice_events_record_and_gamification/.test(previousPracticeEdge) &&
    !/gamification_status/.test(previousPracticeEdge));
  check('previous Played client includes the queue-race recovery',
    /removeQueuedRound\(owner, roundId\)/.test(previousPracticeClient) &&
    /activeFlush\.then\(function \(\) \{ return flush\(\); \}/.test(previousPracticeClient) &&
    !/gamificationStatus/.test(previousPracticeClient));
  check('tone recovery restores the exact prior reward-aware pair',
    /admin\.from\("game_accounts"\)/.test(previousToneEdge) &&
    !/admin\.from\("game_accounts"\)/.test(currentToneEdge) &&
    /stars: 0,[\s\S]*totalStars: 0/.test(currentToneEdge));
} else {
  const pinnedPaths = new Set(manifest.previous_runtime.map((item) => item.path));
  check('shallow manifest pins the previous Played Edge',
    pinnedPaths.has('supabase/functions/practice-events/index.ts'));
  check('shallow manifest pins the previous Played client',
    pinnedPaths.has('js/games/practice-events.js'));
  check('shallow manifest pins the previous tone Edge',
    pinnedPaths.has('supabase/functions/tone-round/index.ts'));
}
check('current client tolerates the previous Played response',
  /consumeGamification\(owner, result\.data\.gamification\)/.test(currentPracticeClient) &&
  /if \(!ownerIsCurrent\(owner\) \|\| !value \|\| value\.ok !== true\) return/.test(currentPracticeClient) &&
  /gamificationStatus\(\)\.catch\(function \(\) \{\}\)/.test(currentPracticeClient));
check('restore is psql fail-closed and reuses the single prior tone SQL owner',
  /\\set ON_ERROR_STOP on/.test(restore) &&
  /\\ir \.\.\/\.\.\/sql\/2026-08-16_phase1_tone_round_atomic\.sql/.test(restore));
check('restore leaves additive tables in place with RLS and browser revocation',
  (restore.match(/enable row level security/g) || []).length === 3 &&
  (restore.match(/revoke all on table/g) || []).length === 3 &&
  (restore.match(/revoke all on function/g) || []).length === 3 &&
  !/drop table|drop function|delete from|truncate/i.test(restore));
check('runbook locks client-before-Edge and previous-Edge-before-previous-SQL ordering',
  /The client goes first/.test(runbook) &&
  /previous tone Edge before the previous tone SQL/.test(runbook));
check('runbook keeps Production and destructive cleanup behind separate gates',
  /HIGH-risk actions/.test(runbook) &&
  /separate destructive\/high-risk action/.test(runbook));

if (!process.argv.includes('--postgres')) {
  console.log(`Phase 1 Played/Gamification recovery source: ${passed}/${passed} PASS`);
  process.exit(0);
}

const tmp = fs.mkdtempSync('/private/tmp/phase1-played-gamification-recovery-');
const data = path.join(tmp, 'data');
const socket = path.join(tmp, 'socket');
const port = String(56000 + (process.pid % 3000));
fs.mkdirSync(socket);
let started = false;

function psql(sql) {
  return run('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-h', socket, '-p', port, '-d', 'postgres', '-c', sql]);
}

const prelude = `
create role anon nologin;
create role authenticated nologin;
create role service_role nologin;
create schema auth;
create table auth.users(id uuid primary key);
create table public.practice_surfaces(code text primary key);
insert into public.practice_surfaces(code) values
  ('tone_finder'),('reading'),('listening'),('typing'),('word_order');
create table public.learning_items(item_id uuid primary key);
create table public.practice_events(
  event_id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete cascade,
  item_id uuid not null references public.learning_items(item_id),
  surface_code text not null references public.practice_surfaces(code),
  is_correct boolean not null,
  result text not null,
  evidence_source text not null default 'game',
  session_id uuid,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default pg_catalog.now()
);
grant select, insert on public.practice_events to service_role;
create table public.tone_round_operations(
  operation_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  game text not null,
  level smallint not null,
  word text not null,
  request_hash text not null,
  response jsonb not null,
  created_at timestamptz not null default pg_catalog.now()
);
create table public.tone_srs_state(
  user_id uuid not null references auth.users(id) on delete cascade,
  game text not null,
  level smallint not null,
  word text not null,
  stage smallint not null,
  due_date text not null,
  ever_failed boolean not null,
  mastered boolean not null,
  updated_at timestamptz not null default pg_catalog.now(),
  primary key(user_id, game, level, word)
);
create table public.game_accounts(
  user_id uuid primary key references auth.users(id) on delete cascade,
  stars integer not null default 0,
  hard_words_by_level jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default pg_catalog.now()
);
create table public.star_ledger(
  ledger_id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  game text not null,
  word text not null,
  level smallint not null,
  stars integer not null,
  reason text not null,
  clean boolean not null,
  created_at timestamptz not null default pg_catalog.now()
);
`;

try {
  run('initdb', ['-D', data, '--no-locale', '--encoding=UTF8', '--auth=trust']);
  run('pg_ctl', ['-D', data, '-l', path.join(tmp, 'postgres.log'), '-o', `-F -c listen_addresses='' -p ${port} -k ${socket}`, '-w', 'start']);
  started = true;
  psql(prelude);
  run('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-h', socket, '-p', port, '-d', 'postgres', '-f', path.join(root, manifest.sql.played_migration.path)]);
  run('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-h', socket, '-p', port, '-d', 'postgres', '-f', path.join(root, manifest.sql.gamification_migration.path)]);
  run('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-h', socket, '-p', port, '-d', 'postgres', '-f', path.join(artifactDir, 'restore.sql')]);

  psql(`
    insert into auth.users(id) values ('00000000-0000-4000-8000-000000000001');
    insert into learning_items(item_id) values ('10000000-0000-4000-8000-000000000001');
    set role service_role;
    select phase1_practice_events_record(
      '00000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000001',
      'reading', pg_catalog.now(), repeat('a', 64),
      '[{"item_id":"10000000-0000-4000-8000-000000000001","ordinal":1,"is_correct":true,"wrong_count":0,"hint_used":false,"listen_count":null}]'::jsonb
    );
    reset role;
    do $$
    declare r jsonb;
    begin
      if (select count(*) from practice_events) <> 1 then raise exception 'previous Played path failed'; end if;
      if (select count(*) from phase1_free_streak_days) <> 0 then raise exception 'inactive gamification wrote a day'; end if;
      set local role service_role;
      r := phase1_tone_round_commit(
        '30000000-0000-4000-8000-000000000001',
        '00000000-0000-4000-8000-000000000001', repeat('b', 64),
        'tone', 1::smallint, 'กา', false, null::smallint, null, null, null,
        3::smallint, '2099-01-01', false, true, 'mastered', true, true, true
      );
      reset role;
      if (r->>'stars')::integer <> 3 or (r->>'totalStars')::integer <> 3 then
        raise exception 'prior tone contract not restored %', r;
      end if;
      if (select count(*) from star_ledger) <> 1 then raise exception 'prior tone ledger missing'; end if;
    end $$;
  `);

  psql(`
    do $$
    declare n integer;
    begin
      select count(*) into n
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace nsp on nsp.oid = c.relnamespace
      where nsp.nspname = 'public'
        and c.relname in ('phase1_free_streak_status','phase1_free_streak_days','phase1_streak_outage_days')
        and c.relrowsecurity;
      if n <> 3 then raise exception 'RLS not preserved %', n; end if;
      if has_table_privilege('anon','public.phase1_free_streak_status','select')
         or has_table_privilege('authenticated','public.phase1_free_streak_days','insert')
         or has_function_privilege('anon','public.phase1_free_gamification_status(uuid)','execute')
         or has_function_privilege('authenticated','public.phase1_practice_events_record_and_gamification(uuid,uuid,text,timestamptz,text,jsonb)','execute')
      then raise exception 'browser privilege leak'; end if;
      if not has_function_privilege('service_role','public.phase1_free_gamification_status(uuid)','execute')
         or not has_function_privilege('service_role','public.phase1_practice_events_record_and_gamification(uuid,uuid,text,timestamptz,text,jsonb)','execute')
         or not has_function_privilege('service_role','public.phase1_tone_round_commit(uuid,uuid,text,text,smallint,text,boolean,smallint,text,boolean,boolean,smallint,text,boolean,boolean,text,boolean,boolean,boolean)','execute')
      then raise exception 'service recovery privilege missing'; end if;
    end $$;
  `);
  console.log('Phase 1 Played/Gamification recovery PostgreSQL: PASS');
} finally {
  if (started) spawnSync('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop'], { encoding: 'utf8' });
  fs.rmSync(tmp, { recursive: true, force: true });
}
