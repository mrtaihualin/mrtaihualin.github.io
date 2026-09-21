import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');
const extract = (sql, tag) => JSON.parse(sql.match(new RegExp(`jsonb_to_recordset\\(\\$${tag}\\$(\\[[\\s\\S]*?\\])\\$${tag}\\$::jsonb\\)`))[1]);

const free = extract(read('supabase/migrations/20260903072554_canonical_free_200_catalog.sql'), 'catalog');
const paid189 = extract(read('supabase/migrations/20260905085037_queue_approved_paid_vocabulary_189.sql'), 'paidqueue');
const migration = path.join(root, 'supabase/migrations/20260921155538_queue_approved_paid_vocabulary_193.sql');
const rollback = path.join(root, 'supabase/recovery/paid-queue-193/rollback.sql');
assert.equal(free.length, 200);
assert.equal(paid189.length, 189);

const temp = fs.mkdtempSync('/private/tmp/paid-193-db-');
const data = path.join(temp, 'data');
const socket = path.join(temp, 'socket');
const fixture = path.join(temp, 'fixture.sql');
fs.mkdirSync(socket);
const port = String(59000 + (process.pid % 1000));

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', ...options });
  if (result.status !== 0) throw new Error(`${command} failed\n${result.stdout || ''}\n${result.stderr || ''}`);
  return result.stdout || '';
}
function psql(sql) {
  return run('psql', ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-h', socket, '-p', port, '-d', 'postgres', '-At', '-c', sql]).trim();
}

const fixtureRows = JSON.stringify([...free.map((row) => ({ ...row, status: 'active' })), ...paid189.map((row) => ({ ...row, status: 'queued' }))]);
fs.writeFileSync(fixture, `
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create table public.game_words (
  id bigint generated always as identity primary key,
  content_key text not null unique,
  word text not null,
  en text,
  zh text,
  level text not null,
  category text,
  syls jsonb,
  reading_th text,
  read_syls jsonb,
  rank integer not null,
  spelling_th text,
  audio_status text,
  type text,
  subcategory text,
  status text not null,
  access_tier text not null,
  catalog_version text not null,
  record_hash text not null,
  canonical_record jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.phase1_product_entitlements (
  user_id uuid not null,
  entitlement text not null,
  primary key(user_id, entitlement)
);
insert into public.phase1_product_entitlements values ('00000000-0000-4000-8000-000000000001','owner_all_access');
insert into public.game_words(
  content_key,word,en,zh,level,category,syls,reading_th,read_syls,rank,spelling_th,audio_status,type,subcategory,
  status,access_tier,catalog_version,record_hash,canonical_record
)
select content_key,word,en,zh,level,category,syls,reading_th,null,rank,spelling_th,audio_status,type,subcategory,
       status,access_tier,catalog_version,record_hash,canonical_record
from jsonb_to_recordset($fixture$${fixtureRows}$fixture$::jsonb) as x(
  content_key text, word text, en text, zh text, level text, category text, type text, subcategory text,
  syls jsonb, spelling_th text, reading_th text, audio_status text, rank integer, access_tier text,
  catalog_version text, record_hash text, canonical_record jsonb, status text
);
create table public.phase2_paid_srs_states(content_key text not null references public.game_words(content_key) on delete restrict);
create table public.phase2_paid_srs_operations(content_key text not null references public.game_words(content_key) on delete restrict);
create table public._paid_193_baseline as select id,content_key,record_hash,rank,status,access_tier,catalog_version from public.game_words;
alter table public.game_words enable row level security;
revoke all on table public.game_words from public,anon,authenticated;
grant usage on schema public to service_role;
grant select on table public.game_words to service_role;
`);

let started = false;
try {
  run('initdb', ['-D', data, '--no-locale', '--encoding=UTF8', '--auth=trust']);
  run('pg_ctl', ['-D', data, '-l', path.join(temp, 'postgres.log'), '-o', `-F -c listen_addresses='' -p ${port} -k ${socket}`, '-w', 'start']);
  started = true;
  run('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-h', socket, '-p', port, '-d', 'postgres', '-f', fixture]);
  run('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-h', socket, '-p', port, '-d', 'postgres', '-f', migration]);

  assert.equal(psql("select count(*) from public.game_words where status='active';"), '200');
  assert.equal(psql("select count(*) from public.game_words where status='queued' and access_tier='paid';"), '382');
  assert.equal(psql("select count(*) from public.game_words where catalog_version='paid-queue-189-v1';"), '189');
  assert.equal(psql("select count(*) from public.game_words where catalog_version='paid-queue-193-v1';"), '193');
  assert.equal(psql("select count(*) from public.game_words where catalog_version='paid-queue-193-v1' and level='初';"), '186');
  assert.equal(psql("select count(*) from public.game_words where catalog_version='paid-queue-193-v1' and level='中';"), '7');
  assert.equal(psql("select count(*) from public.game_words g join public._paid_193_baseline b using(content_key) where row(g.id,g.record_hash,g.rank,g.status,g.access_tier,g.catalog_version) is distinct from row(b.id,b.record_hash,b.rank,b.status,b.access_tier,b.catalog_version);"), '0');
  assert.equal(psql("select relrowsecurity from pg_class where oid='public.game_words'::regclass;"), 't');
  assert.equal(psql("select has_table_privilege('anon','public.game_words','select') or has_table_privilege('authenticated','public.game_words','select');"), 'f');
  assert.equal(psql("select count(*) from public.phase1_product_entitlements where entitlement='owner_all_access';"), '1');
  console.log('Paid 193 additive migration and immutable 389 baseline: PASS');

  const protectedKey = psql("select content_key from public.game_words where catalog_version='paid-queue-193-v1' order by content_key collate \"C\" limit 1;");
  psql(`insert into public.phase2_paid_srs_states values ('${protectedKey}');`);
  const blocked = spawnSync('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-h', socket, '-p', port, '-d', 'postgres', '-f', rollback], { encoding: 'utf8' });
  assert.notEqual(blocked.status, 0);
  assert.match((blocked.stdout || '') + (blocked.stderr || ''), /user-linked SRS data exists/);
  assert.equal(psql("select count(*) from public.game_words where catalog_version='paid-queue-193-v1';"), '193');
  console.log('Paid 193 rollback protects user-linked SRS data: PASS');

  psql('delete from public.phase2_paid_srs_states;');
  run('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-h', socket, '-p', port, '-d', 'postgres', '-f', rollback]);
  assert.equal(psql("select count(*) from public.game_words where catalog_version='paid-queue-193-v1';"), '0');
  assert.equal(psql("select count(*) from public.game_words where status='active';"), '200');
  assert.equal(psql("select count(*) from public.game_words where status='queued' and access_tier='paid';"), '189');
  assert.equal(psql("select count(*) from public.game_words g join public._paid_193_baseline b using(content_key) where row(g.id,g.record_hash,g.rank,g.status,g.access_tier,g.catalog_version) is distinct from row(b.id,b.record_hash,b.rank,b.status,b.access_tier,b.catalog_version);"), '0');
  assert.equal(psql("select has_table_privilege('anon','public.game_words','select') or has_table_privilege('authenticated','public.game_words','select');"), 'f');
  console.log('Paid 193 exact rollback restores protected 389 baseline: PASS');
  console.log('PAID_VOCABULARY_193_DB_PASS 3');
} finally {
  if (started) spawnSync('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop'], { encoding: 'utf8' });
  fs.rmSync(temp, { recursive: true, force: true });
}
