import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migrationName = fs.readdirSync(path.join(root, 'supabase/migrations'))
  .find((name) => name.endsWith('_phase1_free_gamification_streak.sql'));
assert(migrationName, 'D08 migration missing');
const playedMigrationName = fs.readdirSync(path.join(root, 'supabase/migrations'))
  .find((name) => name.endsWith('_phase1_practice_event_idempotency.sql'));
assert(playedMigrationName, 'Played migration missing');
const neutralMigrationName = fs.readdirSync(path.join(root, 'supabase/migrations'))
  .find((name) => name.endsWith('_phase1_practice_event_neutral_results.sql'));
assert(neutralMigrationName, 'neutral Played migration missing');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'phase1-d08-pg-'));
const data = path.join(tmp, 'data');
const socket = path.join(tmp, 'socket');
fs.mkdirSync(socket);
const port = String(55439);

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', ...options });
  if (result.status !== 0) {
    throw new Error(`${command} failed\n${result.stdout || ''}\n${result.stderr || ''}`);
  }
  return result.stdout || '';
}

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
  item_id uuid references public.learning_items(item_id),
  session_id uuid,
  surface_code text not null references public.practice_surfaces(code),
  is_correct boolean,
  result text,
  evidence_source text not null default 'game',
  meta jsonb,
  created_at timestamptz not null default now()
);
grant select, insert on public.practice_events to service_role;
create table public.tone_round_operations(
  operation_id uuid primary key, user_id uuid not null, game text not null,
  level smallint not null, word text not null, request_hash text not null,
  response jsonb not null, created_at timestamptz not null default now()
);
create table public.tone_srs_state(
  user_id uuid not null, game text not null, level smallint not null, word text not null,
  stage smallint not null, due_date text not null, ever_failed boolean not null,
  mastered boolean not null, updated_at timestamptz not null default now(),
  primary key(user_id, game, level, word)
);
`;

const tests = `
insert into auth.users(id)
select ('00000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid
from generate_series(1, 10) i;

do $$
declare
  d date := (clock_timestamp() at time zone 'Asia/Taipei')::date;
  r jsonb;
  u uuid;
begin
  -- first day, same-day repeat, and replay
  u := '00000000-0000-4000-8000-000000000001';
  insert into practice_events(user_id,session_id,surface_code,meta,created_at) values
    (u,'10000000-0000-4000-8000-000000000001','reading','{"schema_version":"played-evidence-v1"}',d::timestamp at time zone 'Asia/Taipei');
  r := phase1_free_gamification_apply(u,'10000000-0000-4000-8000-000000000001','reading');
  if (r->>'current_streak')::int <> 1 or (r->>'counted_today')::boolean is not true then raise exception 'first day failed %', r; end if;
  insert into practice_events(user_id,session_id,surface_code,meta,created_at) values
    (u,'10000000-0000-4000-8000-000000000002','typing','{"schema_version":"played-evidence-v1"}',d::timestamp at time zone 'Asia/Taipei');
  r := phase1_free_gamification_apply(u,'10000000-0000-4000-8000-000000000002','typing');
  if (r->>'current_streak')::int <> 1 or (r->>'counted_today')::boolean is not false then raise exception 'same day failed %', r; end if;
  r := phase1_free_gamification_apply(u,'10000000-0000-4000-8000-000000000001','reading');
  if (r->>'current_streak')::int <> 1 or (r->>'counted_today')::boolean is not false then raise exception 'replay failed %', r; end if;

  -- consecutive next day
  u := '00000000-0000-4000-8000-000000000002';
  insert into practice_events(user_id,session_id,surface_code,meta,created_at) values
    (u,'20000000-0000-4000-8000-000000000001','reading','{"schema_version":"played-evidence-v1"}',(d-1)::timestamp at time zone 'Asia/Taipei'),
    (u,'20000000-0000-4000-8000-000000000002','reading','{"schema_version":"played-evidence-v1"}',d::timestamp at time zone 'Asia/Taipei');
  perform phase1_free_gamification_apply(u,'20000000-0000-4000-8000-000000000001','reading');
  r := phase1_free_gamification_apply(u,'20000000-0000-4000-8000-000000000002','reading');
  if (r->>'current_streak')::int <> 2 then raise exception 'next day failed %', r; end if;

  -- uncovered gap resets
  u := '00000000-0000-4000-8000-000000000003';
  insert into practice_events(user_id,session_id,surface_code,meta,created_at) values
    (u,'30000000-0000-4000-8000-000000000001','reading','{"schema_version":"played-evidence-v1"}',(d-3)::timestamp at time zone 'Asia/Taipei'),
    (u,'30000000-0000-4000-8000-000000000002','reading','{"schema_version":"played-evidence-v1"}',d::timestamp at time zone 'Asia/Taipei');
  perform phase1_free_gamification_apply(u,'30000000-0000-4000-8000-000000000001','reading');
  r := phase1_free_gamification_apply(u,'30000000-0000-4000-8000-000000000002','reading');
  if (r->>'current_streak')::int <> 1 then raise exception 'uncovered gap failed %', r; end if;

  -- every missing day must have confirmed responsible evidence
  insert into phase1_streak_outage_days(outage_day,dependency_kind,incident_ref,confirmed,confirmed_at) values
    (d-2,'platform','incident-platform-1',true,clock_timestamp()),
    (d-1,'responsible_dependency','incident-dependency-1',true,clock_timestamp());
  u := '00000000-0000-4000-8000-000000000004';
  insert into practice_events(user_id,session_id,surface_code,meta,created_at) values
    (u,'40000000-0000-4000-8000-000000000001','reading','{"schema_version":"played-evidence-v1"}',(d-3)::timestamp at time zone 'Asia/Taipei'),
    (u,'40000000-0000-4000-8000-000000000002','reading','{"schema_version":"played-evidence-v1"}',d::timestamp at time zone 'Asia/Taipei');
  perform phase1_free_gamification_apply(u,'40000000-0000-4000-8000-000000000001','reading');
  r := phase1_free_gamification_apply(u,'40000000-0000-4000-8000-000000000002','reading');
  if (r->>'current_streak')::int <> 2 then raise exception 'covered outage failed %', r; end if;

  -- partial coverage and unconfirmed evidence both reset
  u := '00000000-0000-4000-8000-000000000005';
  insert into practice_events(user_id,session_id,surface_code,meta,created_at) values
    (u,'50000000-0000-4000-8000-000000000001','reading','{"schema_version":"played-evidence-v1"}',(d-4)::timestamp at time zone 'Asia/Taipei'),
    (u,'50000000-0000-4000-8000-000000000002','reading','{"schema_version":"played-evidence-v1"}',d::timestamp at time zone 'Asia/Taipei');
  perform phase1_free_gamification_apply(u,'50000000-0000-4000-8000-000000000001','reading');
  r := phase1_free_gamification_apply(u,'50000000-0000-4000-8000-000000000002','reading');
  if (r->>'current_streak')::int <> 1 then raise exception 'partial outage failed %', r; end if;
  insert into phase1_streak_outage_days(outage_day,dependency_kind,incident_ref,confirmed) values
    (d-3,'platform','unconfirmed-incident',false);
  u := '00000000-0000-4000-8000-000000000006';
  insert into practice_events(user_id,session_id,surface_code,meta,created_at) values
    (u,'60000000-0000-4000-8000-000000000001','reading','{"schema_version":"played-evidence-v1"}',(d-4)::timestamp at time zone 'Asia/Taipei'),
    (u,'60000000-0000-4000-8000-000000000002','reading','{"schema_version":"played-evidence-v1"}',d::timestamp at time zone 'Asia/Taipei');
  perform phase1_free_gamification_apply(u,'60000000-0000-4000-8000-000000000001','reading');
  r := phase1_free_gamification_apply(u,'60000000-0000-4000-8000-000000000002','reading');
  if (r->>'current_streak')::int <> 1 then raise exception 'unconfirmed outage failed %', r; end if;

  -- no completed report never counts
  r := phase1_free_gamification_apply('00000000-0000-4000-8000-000000000009','90000000-0000-4000-8000-000000000001','reading');
  if r->>'reason' <> 'completed_report_required' then raise exception 'unfinished failed %', r; end if;

  -- browser roles have neither table nor RPC privileges
  if has_table_privilege('authenticated','public.phase1_free_streak_status','select')
     or has_function_privilege('authenticated','public.phase1_free_gamification_apply(uuid,uuid,text)','execute')
  then raise exception 'browser privilege leak'; end if;
end $$;

-- two accounts remain isolated and the concurrent fixture starts empty
insert into practice_events(user_id,session_id,surface_code,meta) values
  ('00000000-0000-4000-8000-000000000007','70000000-0000-4000-8000-000000000001','tone_finder','{"schema_version":"played-evidence-v1"}'),
  ('00000000-0000-4000-8000-000000000008','80000000-0000-4000-8000-000000000001','listening','{"schema_version":"played-evidence-v1"}'),
  ('00000000-0000-4000-8000-000000000010','a0000000-0000-4000-8000-000000000001','reading','{"schema_version":"played-evidence-v1"}'),
  ('00000000-0000-4000-8000-000000000010','a0000000-0000-4000-8000-000000000002','typing','{"schema_version":"played-evidence-v1"}');
select phase1_free_gamification_apply('00000000-0000-4000-8000-000000000007','70000000-0000-4000-8000-000000000001','tone_finder');
select phase1_free_gamification_apply('00000000-0000-4000-8000-000000000008','80000000-0000-4000-8000-000000000001','listening');
`;

let started = false;
try {
  run('initdb', ['-D', data, '--no-locale', '--encoding=UTF8', '--auth=trust']);
  console.log('PostgreSQL fixture: initdb PASS');
  run('pg_ctl', ['-D', data, '-l', path.join(tmp, 'postgres.log'), '-o', `-F -c listen_addresses='' -p ${port} -k ${socket}`, '-w', 'start']);
  started = true;
  console.log('PostgreSQL fixture: start PASS');
  psql(prelude);
  console.log('PostgreSQL fixture: prelude PASS');
  run('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-h', socket, '-p', port, '-d', 'postgres', '-f', path.join(root, 'supabase/migrations', playedMigrationName)]);
  console.log('PostgreSQL fixture: Played migration PASS');
  run('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-h', socket, '-p', port, '-d', 'postgres', '-f', path.join(root, 'supabase/migrations', migrationName)]);
  console.log('PostgreSQL fixture: migration PASS');
  run('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-h', socket, '-p', port, '-d', 'postgres', '-f', path.join(root, 'supabase/migrations', neutralMigrationName)]);
  console.log('PostgreSQL fixture: neutral Played migration PASS');
  psql(tests);
  console.log('PostgreSQL fixture: sequential cases PASS');

  psql(`
    insert into auth.users(id) values ('00000000-0000-4000-8000-000000000011');
    insert into learning_items(item_id) values
      ('11000000-0000-4000-8000-000000000001'),
      ('11000000-0000-4000-8000-000000000002'),
      ('11000000-0000-4000-8000-000000000003'),
      ('11000000-0000-4000-8000-000000000004');
    set role service_role;
    select phase1_practice_events_record(
      '00000000-0000-4000-8000-000000000011',
      '11000000-0000-4000-8000-000000000011',
      'tone_finder', pg_catalog.now(), repeat('a', 64),
      '[{"item_id":"11000000-0000-4000-8000-000000000001","ordinal":1,"is_correct":true,"is_practice":true,"is_skipped":false,"wrong_count":0,"hint_used":true,"listen_count":null}]'::jsonb
    );
    select phase1_practice_events_record(
      '00000000-0000-4000-8000-000000000011',
      '11000000-0000-4000-8000-000000000012',
      'tone_finder', pg_catalog.now(), repeat('b', 64),
      '[{"item_id":"11000000-0000-4000-8000-000000000002","ordinal":1,"is_correct":true,"is_practice":true,"is_skipped":true,"wrong_count":0,"hint_used":true,"listen_count":null}]'::jsonb
    );
    select phase1_practice_events_record(
      '00000000-0000-4000-8000-000000000011',
      '11000000-0000-4000-8000-000000000013',
      'tone_finder', pg_catalog.now(), repeat('c', 64),
      '[{"item_id":"11000000-0000-4000-8000-000000000003","ordinal":1,"is_correct":true,"skip_reason":"user_skip","wrong_count":0,"hint_used":false,"listen_count":null}]'::jsonb
    );
    do $$ declare r jsonb; begin
      r := phase1_practice_events_record(
        '00000000-0000-4000-8000-000000000011',
        '11000000-0000-4000-8000-000000000014',
        'tone_finder', pg_catalog.now(), repeat('d', 64),
        '[{"item_id":"11000000-0000-4000-8000-000000000004","ordinal":1,"is_correct":true,"skip_reason":"unknown","wrong_count":0,"hint_used":false,"listen_count":null}]'::jsonb
      );
      if r ->> 'reason' <> 'invalid_items' then raise exception 'invalid skip_reason accepted %', r; end if;
    end $$;
    reset role;
    do $$ begin
      if not exists (
        select 1 from practice_events
        where user_id = '00000000-0000-4000-8000-000000000011'
          and result = 'practice' and is_correct is null
          and meta ->> 'is_practice' = 'true' and meta ->> 'is_skipped' = 'false'
      ) then raise exception 'neutral practice evidence missing'; end if;
      if not exists (
        select 1 from practice_events
        where user_id = '00000000-0000-4000-8000-000000000011'
          and result = 'skipped' and is_correct is null
          and meta ->> 'is_practice' = 'true' and meta ->> 'is_skipped' = 'true'
      ) then raise exception 'neutral skipped evidence missing'; end if;
      if not exists (
        select 1 from practice_events
        where user_id = '00000000-0000-4000-8000-000000000011'
          and result = 'skipped' and is_correct is null
          and meta ->> 'skip_reason' = 'user_skip' and meta ->> 'is_skipped' = 'true'
      ) then raise exception 'legacy skip_reason evidence missing'; end if;
      if exists (
        select 1 from practice_events
        where session_id = '11000000-0000-4000-8000-000000000014'
      ) then raise exception 'invalid skip_reason row inserted'; end if;
    end $$;
  `);
  console.log('PostgreSQL fixture: neutral Played outcomes PASS');

  const concurrent = [
    `select phase1_free_gamification_apply('00000000-0000-4000-8000-000000000010','a0000000-0000-4000-8000-000000000001','reading');`,
    `select phase1_free_gamification_apply('00000000-0000-4000-8000-000000000010','a0000000-0000-4000-8000-000000000002','typing');`,
  ].map((sql) => new Promise((resolve, reject) => {
    const child = spawn('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-h', socket, '-p', port, '-d', 'postgres', '-c', sql], { stdio: ['ignore', 'ignore', 'pipe'] });
    let error = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => { error += chunk; });
    child.on('error', reject);
    child.on('close', (code) => code === 0 ? resolve() : reject(new Error(error)));
  }));
  await Promise.all(concurrent);
  console.log('PostgreSQL fixture: concurrent calls PASS');

  const verify = psql(`
    do $$ declare r jsonb; n int; begin
      r := phase1_free_gamification_status('00000000-0000-4000-8000-000000000010');
      select count(*) into n from phase1_free_streak_days where user_id='00000000-0000-4000-8000-000000000010';
      if (r->>'current_streak')::int <> 1 or n <> 1 then raise exception 'concurrency failed %, %', r, n; end if;
      if (select count(*) from phase1_free_streak_status where user_id in ('00000000-0000-4000-8000-000000000007','00000000-0000-4000-8000-000000000008')) <> 2 then raise exception 'cross account failed'; end if;
    end $$;
  `);
  assert.match(verify, /DO/);
  console.log('Phase 1 Free gamification PostgreSQL: PASS');
} finally {
  if (started) spawnSync('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop'], { encoding: 'utf8' });
  fs.rmSync(tmp, { recursive: true, force: true });
}
