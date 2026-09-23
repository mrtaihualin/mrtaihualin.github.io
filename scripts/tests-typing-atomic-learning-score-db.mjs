#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = [
  'supabase/migrations/20260922175100_phase1_typing_server_round_event_foundation.sql',
  'supabase/migrations/20260923060514_phase1_typing_atomic_continuation.sql',
  'supabase/migrations/20260923143000_phase1_typing_initial_reserve_issuance.sql',
  'supabase/migrations/20260923170000_phase1_typing_canonical_version_pinning.sql',
  'supabase/migrations/20260923200000_phase1_typing_bounded_reserve_refill.sql',
  'supabase/migrations/20260915165150_phase1_login_free_learning_engine_v2.sql',
  'supabase/sql/2026-08-16_phase1_score_submit_atomic.sql',
  'supabase/migrations/20260923223000_phase1_typing_atomic_learning_score.sql',
].map((file) => path.join(root, file));
const rollback = path.join(root, 'supabase/recovery/phase1-typing-atomic-learning-score/rollback.sql');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'typing-atomic-learning-'));
const data = path.join(temp, 'data'); const socket = path.join(temp, 'socket');
const port = String(61000 + process.pid % 1000); const fixture = path.join(temp, 'fixture.sql');
const user = '10000000-0000-4000-8000-000000000001';
fs.mkdirSync(socket);
fs.writeFileSync(fixture, `
create extension if not exists pgcrypto;
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth; create table auth.users(id uuid primary key); insert into auth.users values ('${user}');
create table public.game_words(content_key text primary key,level text,status text,access_tier text,
  catalog_version text,record_hash text,canonical_record jsonb);
create table public.learning_items(item_id uuid primary key,owner_user_id uuid,content_source text,content_key text);
create unique index learning_item_key on public.learning_items(content_source,content_key) where owner_user_id is null;
create table public.phase1_learning_review_states(user_id uuid,game text,level smallint,item_id uuid,state text,
  state_token uuid,due_on date,round_id uuid,retry_ordinal smallint,review_attempts_used smallint default 0,
  updated_at timestamptz default clock_timestamp(),primary key(user_id,game,level,item_id));
create table public.phase1_learning_review_operations(operation_id uuid primary key,user_id uuid,game text,
  level smallint,content_source text,content_key text,item_id uuid,request_hash text,response jsonb,
  created_at timestamptz default clock_timestamp());
create table public.tone_srs_state(user_id uuid,level smallint,word text,stage smallint default 0,
  due_date text default '',ever_failed boolean default false,mastered boolean default false,
  updated_at timestamptz default clock_timestamp(),game text default 'tone',item_id uuid,state_token uuid);
create unique index tone_srs_item on public.tone_srs_state(user_id,game,level,item_id) where item_id is not null;
create table public.game_score_submissions(submission_id uuid primary key,user_id uuid,game text,difficulty text,
  score integer,total integer,evidence_hash text,score_version text,created_at timestamptz default now(),legacy_mirrored_at timestamptz);
create table public.reading_sessions(id bigint generated always as identity,user_id uuid,score integer,games integer,
  game text,wrong_items jsonb,created_at timestamptz default now());
grant usage on schema public to service_role;
grant select,insert,update,delete on all tables in schema public to service_role;
`);

function run(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`${command} failed\n${result.stdout}\n${result.stderr}`);
  return result.stdout.trim();
}
const psql = (sql) => run('psql', ['-X','-q','-v','ON_ERROR_STOP=1','-h',socket,'-p',port,'-d','postgres','-At','-c',sql]);
const apply = (file) => run('psql', ['-X','-v','ON_ERROR_STOP=1','-h',socket,'-p',port,'-d','postgres','-f',file]);
const q = (value) => `'${String(value).replaceAll("'", "''")}'`;
const hash = (value) => createHash('sha256').update(value).digest('hex');
const op = (n) => `00000000-0000-4000-8000-${n.toString(16).padStart(12,'0')}`;
const call = ({ n, sequence, ordinal, type, answer = null, learning = null, final = null }) => `
  select public.phase1_typing_round_commit_event(${q(op(n))}::uuid,${q(user)}::uuid,${q(hash('event-'+n))},
    (select round_id from public.phase1_typing_rounds where user_id=${q(user)}::uuid),${sequence}::bigint,
    ${ordinal}::bigint,${q(type)},${answer == null ? 'null' : q(answer)},
    ${learning == null ? 'null' : learning + '::smallint'},${learning == null ? 'null' : q('edge:typing:v2')},
    ${final == null ? 'null' : final + '::integer'},${final == null ? 'null' : q(hash('final'))},
    ${final == null ? 'null' : q(JSON.stringify([{ content_ref: { source: 'game_words', key: 'atomic-1' }, wrong: 3 }])) + '::jsonb'})::text;`;
let started = false;
try {
  run('initdb', ['-D',data,'--no-locale','--encoding=UTF8','--auth=trust',
    '--set=shared_memory_type=mmap','--set=dynamic_shared_memory_type=mmap']);
  run('pg_ctl', ['-D',data,'-l',path.join(temp,'postgres.log'),'-o',`-F -c listen_addresses='' -p ${port} -k ${socket}`,'-w','start']);
  started = true; apply(fixture);
  for (const file of files.slice(0, 5)) apply(file);

  const prompts = Array.from({ length: 5 }, (_, i) => {
    const n = i + 1; const key = `atomic-${n}`; const item = op(100 + n);
    psql(`insert into public.game_words values(${q(key)},'初','active','login','atomic-v1',${q(hash(key))},
      ${q(JSON.stringify({ contentKey: key, word: `คำ${n}`, level: '初', syllables: [{}] }))}::jsonb);
      insert into public.learning_items values(${q(item)}::uuid,null,'game_words',${q(key)});`);
    return { content_ref: { source: 'game_words', key }, answer: `คำ${n}`, catalog_version: 'atomic-v1',
      record_hash: hash(key), attempt_kind: 'primary', learning_state: 'normal',
      learning_state_token: `normal:${item}`, golden: false, srs_bonus: false };
  });
  for (const file of files.slice(5)) apply(file);
  apply(files.at(-1)); // idempotent reapply

  const issued = JSON.parse(psql(`select public.phase1_typing_round_issue(${q(op(1))}::uuid,${q(user)}::uuid,
    ${q(hash('issue'))},1::smallint,0::bigint,${q(JSON.stringify(prompts))}::jsonb,'[]'::jsonb)::text;`));
  assert.equal(issued.ok, true);
  const round = issued.round_id;
  assert.equal(psql(`select count(*) from public.phase1_typing_round_prompts where round_id=${q(round)}::uuid
    and learning_state='normal' and learning_state_token is not null;`), '5');

  for (let n = 1; n <= 3; n++) {
    const result = JSON.parse(psql(call({ n: n + 1, sequence: n, ordinal: 1, type: 'wrong' })));
    assert.equal(result.ok, true);
  }
  let result = JSON.parse(psql(call({ n: 5, sequence: 4, ordinal: 1, type: 'completed', answer: 'คำ1', learning: 3 })));
  assert.equal(result.pending_retry_count, 1);
  assert.equal(result.primary_completed_count, 1);
  assert.equal(psql(`select count(*) from public.phase1_typing_round_prompts where round_id=${q(round)}::uuid and attempt_kind='retry';`), '0');
  for (let n = 2; n <= 4; n++) {
    result = JSON.parse(psql(call({ n: n + 4, sequence: n + 3, ordinal: n,
      type: 'completed', answer: `คำ${n}`, learning: 10 })));
    assert.equal(result.status, 'active');
  }
  result = JSON.parse(psql(call({ n: 9, sequence: 8, ordinal: 5, type: 'completed', answer: 'คำ5', learning: 10 })));
  assert.equal(result.primary_completed_count, 5); assert.equal(result.pending_retry_count, 1);
  assert.equal(psql(`select attempt_kind||':'||content_key from public.phase1_typing_round_prompts
    where round_id=${q(round)}::uuid and prompt_ordinal=6;`), 'retry:atomic-1');
  const finalSql = call({ n: 10, sequence: 9, ordinal: 6, type: 'completed', answer: 'คำ1', learning: 10, final: 93 });
  result = JSON.parse(psql(finalSql));
  assert.equal(result.status, 'completed'); assert.equal(result.completed_count, 6);
  assert.equal(result.primary_completed_count, 5); assert.equal(result.pending_retry_count, 0);
  assert.equal(JSON.parse(psql(finalSql)).idempotent, true);
  assert.equal(psql(`select score||':'||total from public.game_score_submissions where submission_id=${q(round)}::uuid;`), '93:1');
  assert.equal(psql(`select state from public.phase1_learning_review_states where user_id=${q(user)}::uuid
    and game='typing' and item_id=${q(op(101))}::uuid;`), 'next_day_check');
  assert.equal(psql(`select status from public.phase1_typing_round_retry_queue where round_id=${q(round)}::uuid;`), 'resolved');

  const exported = JSON.parse(psql(`set role service_role; select public.phase1_typing_account_export(${q(user)}::uuid,1000)::text;`));
  assert.equal(exported.ok, true); assert.equal(exported.rounds.length, 1);
  const serialized = JSON.stringify(exported);
  assert(!serialized.includes('คำ1')); assert(!serialized.includes(hash('event-10')));
  for (const role of ['anon','authenticated']) {
    assert.equal(psql(`select has_function_privilege('${role}',
      'public.phase1_typing_round_commit_event(uuid,uuid,text,uuid,bigint,bigint,text,text,smallint,text,integer,text,jsonb)','execute');`), 'f');
    assert.equal(psql(`select has_function_privilege('${role}',
      'public.phase1_typing_account_export(uuid,integer)','execute');`), 'f');
  }
  console.log('Typing atomic event/learning/Retry/score and safe account export: PASS');

  apply(rollback);
  assert.equal(psql(`select score from public.game_score_submissions where submission_id=${q(round)}::uuid;`), '93');
  assert.equal(psql(`select count(*) from public.phase1_typing_round_retry_queue where round_id=${q(round)}::uuid;`), '1');
  assert.equal(psql(`select to_regprocedure('public.phase1_typing_round_issue_prelearning(uuid,uuid,text,smallint,bigint,jsonb,jsonb)') is null;`), 't');
  console.log('Typing atomic rollback deactivates writers and preserves completed evidence: PASS');
} finally {
  if (started) spawnSync('pg_ctl', ['-D',data,'-m','immediate','-w','stop'], { encoding: 'utf8' });
  fs.rmSync(temp, { recursive: true, force: true });
}
