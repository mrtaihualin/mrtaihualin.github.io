#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const oldMigration = path.join(root, 'supabase/migrations/20260903090000_phase1_learning_review_atomic_source.sql');
const newMigration = path.join(root, 'supabase/migrations/20260915165150_phase1_login_free_learning_engine_v2.sql');
assert.ok(fs.existsSync(oldMigration) && fs.existsSync(newMigration));

const temp = fs.mkdtempSync('/private/tmp/login-free-learning-v2-pg-');
const data = path.join(temp, 'data');
const socket = path.join(temp, 'socket');
fs.mkdirSync(socket);
const port = String(58000 + (process.pid % 1000));
let started = false;

function run(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`${command} failed\n${result.stdout || ''}\n${result.stderr || ''}`);
  return (result.stdout || '').trim();
}
function psql(sql, role = '') {
  const prefix = role ? `set role ${role}; ` : '';
  return run('psql', ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-h', socket, '-p', port, '-d', 'postgres', '-At', '-c', prefix + sql]);
}

const user = '00000000-0000-4000-8000-000000000001';
const round = '10000000-0000-4000-8000-000000000001';
const day = '2026-09-15';
const itemIds = {
  flow: '30000000-0000-4000-8000-000000000001',
  srs: '30000000-0000-4000-8000-000000000002',
  known: '30000000-0000-4000-8000-000000000003',
  legacy: '30000000-0000-4000-8000-000000000004',
  conflict: '30000000-0000-4000-8000-000000000005',
};
let operation = 1;
function uuid() { return `20000000-0000-4000-8000-${String(operation++).padStart(12, '0')}`; }
function hash(n) { return Number(n).toString(16).slice(-1).repeat(64); }
function call({ op = uuid(), key, score, expected = 'normal', token, occurred = day, action = 'answer', requestHash }) {
  const actualToken = token || `normal:${Object.entries(itemIds).find(([name]) => key.startsWith(name))?.[1]}`;
  return {
    op,
    sql: `select public.phase1_login_free_learning_commit(
      '${op}'::uuid, '${user}'::uuid, '${requestHash || hash(operation)}', 'tone', 1::smallint,
      'game_words', '${key}', ${score}::smallint, 'edge:tone:v1', '${round}'::uuid,
      '${expected}', '${actualToken}', '${occurred}'::date, 'free', '${action}'
    )::text;`,
  };
}
function rpc(input) { return JSON.parse(psql(call(input).sql, 'service_role')); }
function token(result) { return result.snapshot.state_token; }

const prelude = `
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users(id uuid primary key);
create table public.learning_items(
  item_id uuid primary key default gen_random_uuid(), owner_user_id uuid references auth.users(id),
  content_source text not null, content_key text not null
);
create table public.tone_srs_state(
  user_id uuid not null references auth.users(id) on delete cascade, game text not null,
  level smallint not null, word text not null, stage smallint not null default 0,
  due_date text not null default '', ever_failed boolean not null default false,
  mastered boolean not null default false, updated_at timestamptz not null default now(),
  primary key(user_id, game, level, word)
);
alter table public.tone_srs_state enable row level security;
grant usage on schema public to service_role, authenticated, anon;
grant select on table public.learning_items to service_role;
grant select, insert, update, delete on table public.tone_srs_state to service_role;
insert into auth.users(id) values ('${user}');
insert into public.learning_items(item_id,content_source,content_key) values
  ('${itemIds.flow}','game_words','flow@初'),
  ('${itemIds.srs}','game_words','srs@初'),
  ('${itemIds.known}','game_words','known@初'),
  ('${itemIds.legacy}','game_words','legacy@初'),
  ('${itemIds.conflict}','game_words','conflict@初');
insert into public.tone_srs_state(user_id,game,level,word) values ('${user}','tone',1,'legacy');
`;

try {
  run('initdb', ['-D', data, '--no-locale', '--encoding=UTF8', '--auth=trust']);
  run('pg_ctl', ['-D', data, '-l', path.join(temp, 'postgres.log'), '-o', `-F -c listen_addresses='' -p ${port} -k ${socket}`, '-w', 'start']);
  started = true;
  psql(prelude);
  for (const migration of [oldMigration, newMigration]) {
    run('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-h', socket, '-p', port, '-d', 'postgres', '-f', migration]);
  }
  console.log('Login Free Learning Engine migrations compile: PASS');

  const signature = 'public.phase1_login_free_learning_commit(uuid,uuid,text,text,smallint,text,text,smallint,text,uuid,text,text,date,text,text)';
  assert.equal(psql(`select has_function_privilege('authenticated','${signature}','execute');`), 'f');
  assert.equal(psql(`select has_function_privilege('service_role','${signature}','execute');`), 't');
  assert.match(psql(`select pg_get_functiondef('${signature}'::regprocedure);`), /SET search_path TO ''/i);
  assert.equal(psql("select data_type from information_schema.columns where table_schema='public' and table_name='tone_srs_state' and column_name='state_token';"), 'uuid');
  console.log('Deny-by-default RPC and state token: PASS');

  const legacy = rpc({ key: 'legacy@初', score: 10 });
  assert.equal(legacy.reason, 'legacy_srs_identity_unresolved');
  assert.equal(psql("select count(*) from public.tone_srs_state where word='legacy' and item_id is null;"), '1');
  console.log('Legacy identity remains untouched and fails closed: PASS');

  const retry = rpc({ key: 'flow@初', score: 0 });
  assert.equal(retry.to_state, 'retry_end_round');
  const nextDay = rpc({ key: 'flow@初', score: 10, expected: 'retry_end_round', token: token(retry) });
  assert.equal(nextDay.to_state, 'next_day_check');
  assert.equal(nextDay.snapshot.due_on, '2026-09-16');
  const early = rpc({ key: 'flow@初', score: 10, expected: 'next_day_check', token: token(nextDay) });
  assert.equal(early.reason, 'not_due');
  const weak = rpc({ key: 'flow@初', score: 3, expected: 'next_day_check', token: token(nextDay), occurred: '2026-09-16' });
  assert.equal(weak.to_state, 'weak_4d');
  assert.equal(weak.snapshot.due_on, '2026-09-20');
  const backToRetry = rpc({ key: 'flow@初', score: 0, expected: 'weak_4d', token: token(weak), occurred: '2026-09-20' });
  assert.equal(backToRetry.to_state, 'retry_end_round');
  console.log('Normal, Retry, next-day and Weak transitions: PASS');

  const entered = rpc({ key: 'srs@初', score: 10 });
  assert.equal(entered.to_state, 'srs'); assert.equal(entered.snapshot.stage, 0);
  const day1 = rpc({ key: 'srs@初', score: 10, expected: 'srs', token: token(entered) });
  assert.equal(day1.snapshot.stage, 1); assert.equal(day1.snapshot.due_on, '2026-09-16');
  const day7 = rpc({ key: 'srs@初', score: 10, expected: 'srs', token: token(day1), occurred: '2026-09-16' });
  assert.equal(day7.snapshot.stage, 2); assert.equal(day7.snapshot.due_on, '2026-09-23');
  const mastered = rpc({ key: 'srs@初', score: 10, expected: 'srs', token: token(day7), occurred: '2026-09-23' });
  assert.equal(mastered.to_state, 'mastered'); assert.equal(mastered.snapshot.mastered, true);
  console.log('SRS Day 1, Day 7 and Mastered path: PASS');

  const knownEntered = rpc({ key: 'known@初', score: 10 });
  const knownReset = rpc({ key: 'known@初', score: 9, expected: 'srs', token: token(knownEntered), action: 'known_check' });
  assert.equal(knownReset.reason, 'known_reset'); assert.equal(knownReset.snapshot.ever_failed, true);
  const knownMaster = rpc({ key: 'known@初', score: 10, expected: 'srs', token: token(knownReset), action: 'known_check' });
  assert.equal(knownMaster.reason, 'known_master'); assert.equal(knownMaster.snapshot.mastered, true);
  console.log('Known-check uses the same atomic owner: PASS');

  const stale = rpc({ key: 'flow@初', score: 10, expected: 'retry_end_round', token: token(retry), occurred: '2026-09-20' });
  assert.equal(stale.reason, 'resync_required'); assert.equal(stale.snapshot.state, 'retry_end_round');
  const replayOp = uuid();
  const replayHash = 'a'.repeat(64);
  const firstReplay = rpc({ op: replayOp, requestHash: replayHash, key: 'flow@初', score: 10,
    expected: 'retry_end_round', token: token(backToRetry), occurred: '2026-09-20' });
  const replay = rpc({ op: replayOp, requestHash: replayHash, key: 'flow@初', score: 10,
    expected: 'retry_end_round', token: token(backToRetry), occurred: '2026-09-20' });
  assert.equal(firstReplay.ok, true); assert.equal(replay.idempotent, true);
  console.log('CAS resync and idempotent replay: PASS');

  psql(`insert into public.phase1_learning_review_states(user_id,game,level,item_id,state,state_token,due_on,round_id,retry_ordinal,review_attempts_used)
    values ('${user}','tone',1,'${itemIds.conflict}','weak_4d',gen_random_uuid(),'2026-09-15',null,null,0);
    insert into public.tone_srs_state(user_id,game,level,word,item_id,state_token)
    values ('${user}','tone',1,'conflict@初','${itemIds.conflict}',gen_random_uuid());`);
  const conflictToken = psql(`select state_token from public.phase1_learning_review_states where item_id='${itemIds.conflict}';`);
  const conflict = rpc({ key: 'conflict@初', score: 10, expected: 'weak_4d', token: conflictToken });
  assert.equal(conflict.reason, 'state_owner_conflict');
  console.log('Review/SRS XOR conflict fails closed: PASS');

  console.log('PHASE1_LOGIN_FREE_LEARNING_ENGINE_DB_PASS 8');
} finally {
  if (started) spawnSync('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop'], { encoding: 'utf8' });
  fs.rmSync(temp, { recursive: true, force: true });
}
