import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');

const content = read('supabase/functions/game-content/index.ts');
const round = read('supabase/functions/tone-round/index.ts');
const score = read('supabase/functions/score-submit/index.ts');
const loader = read('js/games/game-content-client.js');
const review = read('js/games/learning-review.js');
const tone = read('js/games/tone-finder-game.js');
const page = read('tone-finder.html');

assert.match(content, /requestBody\?\.paid_beta === true/);
assert.match(content, /entitlement', 'owner_all_access'/);
assert.match(content, /wordStatuses = paidTone \? \['queued'\] : \['active'\]/);
assert.match(content, /paidSrsState: paidTone \? paidSrsState : undefined/);
assert.match(round, /phase2_paid_srs_commit/);
assert.match(round, /paidContent[\s\S]+owner_all_access/);
assert.match(score, /row\?\.status !== 'active'/);
assert.match(review, /root\.GAME_CONTENT_TIER !== 'paid'/);
assert.match(loader, /paid-beta=1/);
assert.match(tone, /tf_paid_srs_v1/);
assert.match(tone, /Paid progress is server-authoritative/);
assert.match(tone, /paidUnavailable\s*=\s*n === '3' && !!window\.PAID_SRS_PRIVATE_BETA/);
assert.match(tone, /window\.PAID_SRS_PRIVATE_BETA && Number\(level\) === 3/);
assert.match(tone, /if \(_paidRecord\.reschedulePending\) _paidRecord\.mastered = true/);
assert.match(page, /game-content-client\.js\?v=17/);
assert.match(page, /learning-review\.js\?v=2/);
assert.match(page, /tone-finder-game\.min\.js\?v=84/);
console.log('Private-beta source and server gates: PASS');

const migration = path.join(root, 'supabase/migrations/20260911120000_paid_srs_lin_private_beta_tone.sql');
const rollback = path.join(root, 'supabase/recovery/paid-srs-lin-private-beta/rollback.sql');
const temp = fs.mkdtempSync('/private/tmp/paid-srs-lin-beta-pg-');
const data = path.join(temp, 'data');
const socket = path.join(temp, 'socket');
fs.mkdirSync(socket);
const port = String(58000 + (process.pid % 1000));

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', ...options });
  if (result.status !== 0) throw new Error(`${command} failed\n${result.stdout || ''}\n${result.stderr || ''}`);
  return result.stdout || '';
}
function psql(sql, role = '') {
  const prefix = role ? `set role ${role}; ` : '';
  return run('psql', ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-h', socket, '-p', port, '-d', 'postgres', '-At', '-c', prefix + sql]).trim();
}
const owner = '00000000-0000-4000-8000-000000000001';
const other = '00000000-0000-4000-8000-000000000002';
const key = 'paid-1@初';
function uuid(n) { return `20000000-0000-4000-8000-${String(n).padStart(12, '0')}`; }
function rpc({ op, user = owner, item = key, outcome = 'clean', day = '2026-09-11', hash = 'a'.repeat(64) }) {
  const sql = `select public.phase2_paid_srs_commit('${op}'::uuid,'${user}'::uuid,'${hash}','tone',1::smallint,'${item}','${outcome}','${day}'::date)::text;`;
  return JSON.parse(psql(sql, 'service_role'));
}

let started = false;
try {
  run('initdb', ['-D', data, '--no-locale', '--encoding=UTF8', '--auth=trust']);
  run('pg_ctl', ['-D', data, '-l', path.join(temp, 'postgres.log'), '-o', `-F -c listen_addresses='' -p ${port} -k ${socket}`, '-w', 'start']);
  started = true;
  psql(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key);
    create table public.game_words(content_key text primary key, level text not null, status text not null, access_tier text);
    create table public.phase1_product_entitlements(user_id uuid not null references auth.users(id), entitlement text not null, granted_at timestamptz not null default now(), primary key(user_id,entitlement));
    grant usage on schema public to anon, authenticated, service_role;
    grant select on public.game_words, public.phase1_product_entitlements to service_role;
    insert into auth.users values ('${owner}'),('${other}');
    insert into public.phase1_product_entitlements(user_id,entitlement) values ('${owner}','owner_all_access');
    insert into public.game_words(content_key,level,status,access_tier)
    select 'paid-'||g::text||'@初','初','queued','paid' from generate_series(1,189) g;
  `);
  run('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-h', socket, '-p', port, '-d', 'postgres', '-f', migration]);
  console.log('Paid SRS migration compile: PASS');

  assert.equal(psql("select has_table_privilege('authenticated','public.phase2_paid_srs_states','select');"), 'f');
  assert.equal(psql("select has_function_privilege('authenticated','public.phase2_paid_srs_commit(uuid,uuid,text,text,smallint,text,text,date)','execute');"), 'f');
  assert.equal(psql("select relrowsecurity and relforcerowsecurity from pg_class where oid='public.phase2_paid_srs_states'::regclass;"), 't');
  assert.equal(psql(`select public.phase2_paid_srs_commit('${uuid(99)}'::uuid,'${owner}'::uuid,null,'tone',1::smallint,'${key}','clean','2026-09-11'::date)->>'reason';`, 'service_role'), 'invalid_arguments');
  assert.equal(rpc({ op: uuid(1), user: other }).reason, 'feature_disabled');
  console.log('Owner-only and direct-access denial: PASS');

  const d0 = rpc({ op: uuid(2) });
  assert.equal(d0.newSrsRecord.nextCheckpoint, 1);
  assert.equal(d0.newSrsRecord.dueDate, '2026-09-12');
  assert.equal(rpc({ op: uuid(2) }).idempotent, true);
  assert.equal(rpc({ op: uuid(2), hash: 'b'.repeat(64) }).reason, 'replay_conflict');
  assert.equal(rpc({ op: uuid(3) }).reason, 'not_due');
  const d1 = rpc({ op: uuid(4), day: '2026-09-12' });
  const d8 = rpc({ op: uuid(5), day: '2026-09-19' });
  const d16 = rpc({ op: uuid(6), day: '2026-09-27' });
  const d30 = rpc({ op: uuid(7), day: '2026-10-11' });
  const d60 = rpc({ op: uuid(8), day: '2026-11-10' });
  const d90 = rpc({ op: uuid(9), day: '2026-12-10' });
  assert.deepEqual([d1.newSrsRecord.nextCheckpoint, d8.newSrsRecord.nextCheckpoint, d16.newSrsRecord.nextCheckpoint,
    d30.newSrsRecord.nextCheckpoint, d60.newSrsRecord.nextCheckpoint, d90.newSrsRecord.nextCheckpoint], [8,16,30,60,90,null]);
  assert.equal(d16.newSrsRecord.activeChallenge, true);
  assert.equal(d90.newSrsRecord.mastered, true);
  console.log('Natural-date 0→1→8→16→30→60→90 path: PASS');

  const failKey = 'paid-2@初';
  rpc({ op: uuid(10), item: failKey });
  rpc({ op: uuid(11), item: failKey, day: '2026-09-12' });
  rpc({ op: uuid(12), item: failKey, day: '2026-09-19' });
  rpc({ op: uuid(13), item: failKey, day: '2026-09-27' });
  const failed = rpc({ op: uuid(14), item: failKey, day: '2026-10-11', outcome: 'fail' });
  assert.equal(failed.reason, 'challenge_reset');
  assert.equal(failed.newSrsRecord.nextCheckpoint, 30);
  assert.equal(failed.newSrsRecord.reschedulePending, true);
  assert.equal(failed.newSrsRecord.dueDate, '');
  assert.equal(rpc({ op: uuid(15), item: failKey, day: '2026-10-12' }).reason, 'challenge_reschedule_pending');
  console.log('Challenge failure stays isolated and pending Product reschedule: PASS');

  const raceKey = 'paid-3@初';
  const calls = [16,17].map((n) => new Promise((resolve, reject) => {
    const sql = `set role service_role; select public.phase2_paid_srs_commit('${uuid(n)}'::uuid,'${owner}'::uuid,'${String(n).repeat(64).slice(0,64)}','tone',1::smallint,'${raceKey}','clean','2026-09-11'::date)::text;`;
    const child = spawn('psql', ['-X','-q','-v','ON_ERROR_STOP=1','-h',socket,'-p',port,'-d','postgres','-At','-c',sql], { stdio:['ignore','pipe','pipe'] });
    let out='', err=''; child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    child.stdout.on('data', (v) => out += v); child.stderr.on('data', (v) => err += v);
    child.on('close', (code) => code === 0 ? resolve(JSON.parse(out.trim())) : reject(new Error(err)));
  }));
  const race = await Promise.all(calls);
  assert.equal(race.filter((r) => r.ok === true).length, 1);
  assert.equal(race.filter((r) => r.reason === 'not_due').length, 1);
  assert.equal(psql(`select count(*) from public.phase2_paid_srs_states where content_key='${raceKey}';`), '1');
  console.log('Concurrent item mutation exactly once: PASS');

  const blocked = spawnSync('psql', ['-X','-v','ON_ERROR_STOP=1','-h',socket,'-p',port,'-d','postgres','-f',rollback], { encoding:'utf8' });
  assert.notEqual(blocked.status, 0);
  assert.match((blocked.stdout || '') + (blocked.stderr || ''), /Paid private-beta rows exist/);
  psql('truncate public.phase2_paid_srs_operations, public.phase2_paid_srs_states;');
  run('psql', ['-X','-v','ON_ERROR_STOP=1','-h',socket,'-p',port,'-d','postgres','-f',rollback]);
  assert.equal(psql("select to_regclass('public.phase2_paid_srs_states') is null;"), 't');
  console.log('Fail-closed recovery: PASS');
  console.log('PAID_SRS_LIN_PRIVATE_BETA_PASS 6');
} finally {
  if (started) spawnSync('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop'], { encoding: 'utf8' });
  fs.rmSync(temp, { recursive: true, force: true });
}
