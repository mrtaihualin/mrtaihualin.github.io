import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migrationName = fs.readdirSync(path.join(root, 'supabase/migrations'))
  .find((name) => name.endsWith('_phase1_learning_review_atomic_source.sql'));
assert(migrationName, 'learning Review migration missing');

const temp = fs.mkdtempSync('/private/tmp/phase1-learning-review-pg-');
const data = path.join(temp, 'data');
const socket = path.join(temp, 'socket');
fs.mkdirSync(socket);
const port = String(56000 + (process.pid % 2000));

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', ...options });
  if (result.status !== 0) {
    throw new Error(`${command} failed\n${result.stdout || ''}\n${result.stderr || ''}`);
  }
  return result.stdout || '';
}

function psql(sql, role = '') {
  const prefix = role ? `set role ${role}; ` : '';
  return run('psql', ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-h', socket, '-p', port, '-d', 'postgres', '-At', '-c', prefix + sql]).trim();
}

const user1 = '00000000-0000-4000-8000-000000000001';
const user2 = '00000000-0000-4000-8000-000000000002';
const day = '2026-08-27';
const round = '10000000-0000-4000-8000-000000000001';
const rollbackPath = path.join(root, 'supabase/recovery/phase1-learning-review/rollback-empty-schema.sql');

function uuid(n) {
  return `20000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
}

function hash(char) {
  return String(char).repeat(64);
}

function call({ op, user = user1, requestHash = hash('a'), game = 'tone', level = 1,
  source = 'game_words', key, score, verifier, roundId = round,
  expected = 'normal', token = null, occurredOn = day, tier = 'free' }) {
  const tokenSql = token ? `'${token}'::uuid` : 'null::uuid';
  return `select public.phase1_learning_review_commit(
    '${op}'::uuid, '${user}'::uuid, '${requestHash}', '${game}', ${level}::smallint,
    '${source}', '${key}', ${score}::smallint, '${verifier || `edge:${game}:v1`}',
    '${roundId}'::uuid, '${expected}', ${tokenSql}, '${occurredOn}'::date, '${tier}'
  )::text;`;
}

function rpc(args) {
  return JSON.parse(psql(call(args), 'service_role'));
}

const prelude = `
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users(id uuid primary key);
create table public.learning_items(
  item_id uuid primary key default gen_random_uuid(),
  owner_user_id uuid references auth.users(id),
  content_source text not null,
  content_key text not null
);
create table public.tone_srs_state(
  user_id uuid not null references auth.users(id) on delete cascade,
  game text not null,
  level smallint not null,
  word text not null,
  stage smallint not null default 0,
  due_date text not null default '',
  ever_failed boolean not null default false,
  mastered boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key(user_id, game, level, word)
);
alter table public.tone_srs_state enable row level security;
grant usage on schema public to service_role, authenticated, anon;
grant select on table public.learning_items to service_role;
grant select, insert, update, delete on table public.tone_srs_state to service_role;
insert into auth.users(id) values ('${user1}'), ('${user2}');
insert into public.learning_items(item_id,content_source,content_key) values
  ('30000000-0000-4000-8000-000000000001','game_words','weak@初'),
  ('30000000-0000-4000-8000-000000000002','game_words','review@初'),
  ('30000000-0000-4000-8000-000000000003','game_words','master@初'),
  ('30000000-0000-4000-8000-000000000004','game_words','race@初'),
  ('30000000-0000-4000-8000-000000000005','game_words','shared@初'),
  ('30000000-0000-4000-8000-000000000006','game_words','duplicate@初'),
  ('30000000-0000-4000-8000-000000000007','game_words','duplicate@初'),
  ('30000000-0000-4000-8000-000000000008','game_words','legacy@初'),
  ('30000000-0000-4000-8000-000000000009','game_words','เขา@初#noun-mountain');
insert into public.tone_srs_state(user_id,game,level,word)
values ('${user1}','tone',1,'legacy');
`;

let started = false;
try {
  run('initdb', ['-D', data, '--no-locale', '--encoding=UTF8', '--auth=trust']);
  run('pg_ctl', ['-D', data, '-l', path.join(temp, 'postgres.log'), '-o', `-F -c listen_addresses='' -p ${port} -k ${socket}`, '-w', 'start']);
  started = true;
  psql(prelude);
  run('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-h', socket, '-p', port, '-d', 'postgres',
    '-f', path.join(root, 'supabase/migrations', migrationName)]);
  console.log('Learning Review migration compile: PASS');

  assert.equal(psql("select has_function_privilege('authenticated','public.phase1_learning_review_commit(uuid,uuid,text,text,smallint,text,text,smallint,text,uuid,text,uuid,date,text)','execute');"), 'f');
  assert.equal(psql("select has_table_privilege('authenticated','public.phase1_learning_review_states','select');"), 'f');
  assert.equal(psql("select has_table_privilege('authenticated','public.phase1_learning_review_states','insert');"), 'f');
  assert.equal(psql("select has_table_privilege('authenticated','public.tone_srs_state','insert');"), 'f');
  assert.match(psql("select pg_get_functiondef('public.phase1_learning_review_commit(uuid,uuid,text,text,smallint,text,text,smallint,text,uuid,text,uuid,date,text)'::regprocedure);"), /phase1-tone-account:/);
  console.log('Deny-by-default privileges: PASS');

  const missing = rpc({ op: uuid(1), key: 'missing@初', score: 10 });
  const duplicate = rpc({ op: uuid(2), key: 'duplicate@初', score: 10 });
  const legacy = rpc({ op: uuid(33), key: 'legacy@初', score: 4, requestHash: hash('d') });
  assert.equal(missing.reason, 'content_ref_not_unique');
  assert.equal(duplicate.reason, 'content_ref_not_unique');
  assert.equal(legacy.reason, 'legacy_srs_identity_unresolved');
  assert.equal(psql('select count(*) from public.phase1_learning_review_states;'), '0');
  console.log('Exact content_ref fail-closed: PASS');

  const first = rpc({ op: uuid(3), key: 'weak@初', score: 7, requestHash: hash('b') });
  assert.equal(first.to_state, 'weak_4d');
  assert.equal(first.due_on, '2026-08-31');
  const replay = rpc({ op: uuid(3), key: 'weak@初', score: 7, requestHash: hash('b') });
  assert.equal(replay.idempotent, true);
  const changedReplay = rpc({ op: uuid(3), key: 'weak@初', score: 7, requestHash: hash('c') });
  assert.equal(changedReplay.reason, 'replay_conflict');
  const staleCas = rpc({ op: uuid(4), key: 'weak@初', score: 7, requestHash: hash('d'),
    expected: 'weak_4d', token: '40000000-0000-4000-8000-000000000001', occurredOn: '2026-08-31' });
  assert.equal(staleCas.reason, 'race_retry');
  console.log('Idempotency, changed replay and CAS: PASS');

  const retry = rpc({ op: uuid(5), key: 'review@初', score: 0, requestHash: hash('e') });
  assert.equal(retry.to_state, 'retry_end_round');
  const review = rpc({ op: uuid(6), key: 'review@初', score: 9, requestHash: hash('f'),
    expected: 'retry_end_round', token: retry.state_token });
  assert.equal(review.to_state, 'review_needed');
  assert.equal(review.due_on, '2026-08-28');
  const early = rpc({ op: uuid(7), key: 'review@初', score: 0, requestHash: hash('1'),
    expected: 'review_needed', token: review.state_token });
  assert.equal(early.reason, 'not_due');
  const exhausted = rpc({ op: uuid(8), key: 'review@初', score: 0, requestHash: hash('2'),
    expected: 'review_needed', token: review.state_token, occurredOn: '2026-08-28' });
  assert.equal(exhausted.to_state, 'weak_4d');
  assert.equal(exhausted.due_on, '2026-09-01');
  console.log('Free retry, next-day Review, not-due and exhaustion: PASS');

  const masteredRoute = rpc({ op: uuid(9), key: 'master@初', score: 10, requestHash: hash('3') });
  assert.equal(masteredRoute.to_state, 'srs');
  assert.equal(psql("select concat(stage,':',due_date,':',item_id) from public.tone_srs_state where word='master';"),
    '0::30000000-0000-4000-8000-000000000003');
  const noBackflow = rpc({ op: uuid(10), key: 'master@初', score: 0, requestHash: hash('4') });
  assert.equal(noBackflow.reason, 'srs_owner_only');
  assert.equal(psql("select count(*) from public.phase1_learning_review_states where item_id='30000000-0000-4000-8000-000000000003';"), '0');
  console.log('Atomic stage-0 entry and no SRS backflow: PASS');

  const stableSense = rpc({ op: uuid(34), key: 'เขา@初#noun-mountain', score: 10, requestHash: hash('e') });
  assert.equal(stableSense.to_state, 'srs');
  assert.equal(psql("select concat(word,':',item_id) from public.tone_srs_state where item_id='30000000-0000-4000-8000-000000000009';"),
    'เขา@初#noun-mountain:30000000-0000-4000-8000-000000000009');
  console.log('Canonical Free200 sense identity: PASS');

  for (const [index, game] of ['tone', 'reading', 'listening', 'typing', 'wordorder'].entries()) {
    const result = rpc({ op: uuid(20 + index), key: 'shared@初', score: 4,
      requestHash: hash(String(5 + index)), game, verifier: `edge:${game}:v1` });
    assert.equal(result.to_state, 'weak_4d');
  }
  assert.equal(psql("select count(distinct game) from public.phase1_learning_review_states where item_id='30000000-0000-4000-8000-000000000005';"), '5');
  console.log('Five-game state isolation: PASS');

  const race = rpc({ op: uuid(30), key: 'race@初', score: 4, requestHash: hash('a') });
  const calls = [
    call({ op: uuid(31), key: 'race@初', score: 4, requestHash: hash('b'), expected: 'weak_4d', token: race.state_token, occurredOn: '2026-08-31' }),
    call({ op: uuid(32), key: 'race@初', score: 4, requestHash: hash('c'), expected: 'weak_4d', token: race.state_token, occurredOn: '2026-08-31' })
  ].map((sql) => new Promise((resolve, reject) => {
    const child = spawn('psql', ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-h', socket, '-p', port, '-d', 'postgres', '-At', '-c', `set role service_role; ${sql}`],
      { stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    let error = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.on('data', (chunk) => { error += chunk; });
    child.on('error', reject);
    child.on('close', (code) => code === 0 ? resolve(JSON.parse(output.trim())) : reject(new Error(error)));
  }));
  const raceResults = await Promise.all(calls);
  assert.equal(raceResults.filter((row) => row.ok === true).length, 1);
  assert.equal(raceResults.filter((row) => row.reason === 'race_retry').length, 1);
  assert.equal(psql("select count(*) from public.phase1_learning_review_operations where operation_id in ('20000000-0000-4000-8000-000000000031','20000000-0000-4000-8000-000000000032');"), '1');
  console.log('Concurrent commit exactly once: PASS');

  const blockedRollback = spawnSync('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-h', socket, '-p', port, '-d', 'postgres', '-f', rollbackPath], { encoding: 'utf8' });
  assert.notEqual(blockedRollback.status, 0);
  assert.match((blockedRollback.stdout || '') + (blockedRollback.stderr || ''), /rollback blocked:/);
  psql('truncate table public.phase1_learning_review_operations, public.phase1_learning_review_states; delete from public.tone_srs_state where item_id is not null;');
  run('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-h', socket, '-p', port, '-d', 'postgres', '-f', rollbackPath]);
  assert.equal(psql("select pg_catalog.to_regclass('public.phase1_learning_review_states') is null;"), 't');
  assert.equal(psql("select not exists(select 1 from pg_catalog.pg_attribute where attrelid='public.tone_srs_state'::regclass and attname='item_id' and not attisdropped);"), 't');
  console.log('Rollback blocks data loss and removes only empty schema: PASS');

  console.log('PHASE1_LEARNING_REVIEW_DB_PASS 10');
} finally {
  if (started) spawnSync('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop'], { encoding: 'utf8' });
  fs.rmSync(temp, { recursive: true, force: true });
}
