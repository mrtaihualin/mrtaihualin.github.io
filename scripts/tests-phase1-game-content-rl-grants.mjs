import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Source and ephemeral-PostgreSQL privilege regression. This never connects to
// Supabase or any shared database and removes only its private temporary cluster.

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const schemaPath = path.join(root, 'supabase/sql/2026-08-02_game_content_schema.sql');
const migrationPath = path.join(root, 'supabase/migrations/20260818130000_phase1_game_content_rl_least_privilege.sql');
const mapPath = path.join(root, 'supabase/sql/00_ฟังก์ชันไหนอยู่ไฟล์ไหน.md');
const schema = fs.readFileSync(schemaPath, 'utf8');
const migration = fs.readFileSync(migrationPath, 'utf8');
const sourceMap = fs.readFileSync(mapPath, 'utf8');

assert.match(schema, /revoke execute on function public\.game_content_rl_check\(text, int, int\) from public, anon, authenticated/i);
assert.match(schema, /grant execute on function public\.game_content_rl_check\(text, int, int\) to service_role/i);
assert.match(migration, /do \$precheck\$[\s\S]*to_regprocedure\('public\.game_content_rl_check\(text,integer,integer\)'\)[\s\S]*prosecdef[\s\S]*service_role/i);
assert.match(migration, /revoke execute on function public\.game_content_rl_check\(text, integer, integer\)[\s\S]*from public, anon, authenticated/i);
assert.match(migration, /grant execute on function public\.game_content_rl_check\(text, integer, integer\)[\s\S]*to service_role/i);
assert.match(migration, /aclexplode[\s\S]*acl\.grantee = 0[\s\S]*has_function_privilege\('anon'[\s\S]*has_function_privilege\('authenticated'[\s\S]*has_function_privilege\([\s\S]*'service_role'/i);
assert.doesNotMatch(migration, /grant execute[\s\S]*to\s+(?:public|anon|authenticated)\b/i);
assert.doesNotMatch(migration, /\b(?:delete|update|insert|truncate|drop)\b\s+(?:from|into|table)?\s*public\.game_content_rl\b/i);
assert.match(sourceMap, /game_content_rl_check[\s\S]*20260818130000_phase1_game_content_rl_least_privilege\.sql/);

console.log('✅ Phase 1 game-content rate-limit grant source contracts PASS');
if (!process.argv.includes('--postgres')) process.exit(0);

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'phase1-game-content-rl-pg-'));
const data = path.join(temp, 'data');
const socket = path.join(temp, 'socket');
const port = '55443';
fs.mkdirSync(socket);

function run(command, args, allowFailure = false) {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  if (!allowFailure && result.status !== 0) {
    throw new Error(`${command} failed\n${result.stdout || ''}\n${result.stderr || ''}`);
  }
  return result;
}

function psql(sql, role) {
  const prefix = role ? `set role ${role};\n` : '';
  return run('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-h', socket, '-p', port, '-d', 'postgres', '-At', '-c', prefix + sql]);
}

function applyMigration(allowFailure = false) {
  return run('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-h', socket, '-p', port, '-d', 'postgres', '-f', migrationPath], allowFailure);
}

let started = false;
try {
  run('initdb', ['-D', data, '--no-locale', '--encoding=UTF8', '--auth=trust']);
  run('pg_ctl', ['-D', data, '-l', path.join(temp, 'postgres.log'), '-o', `-F -c listen_addresses='' -p ${port} -k ${socket}`, '-w', 'start']);
  started = true;

  psql(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin;
    create table public.game_content_rl(
      rl_key text not null,
      window_start timestamptz not null,
      cnt int not null default 0,
      primary key (rl_key, window_start)
    );
    create or replace function public.game_content_rl_check(
      p_key text, p_limit int default 60, p_window int default 60
    ) returns boolean
    language plpgsql security definer set search_path = public as $function$
    declare
      v_bucket timestamptz;
      v_cnt int;
    begin
      v_bucket := to_timestamp(floor(extract(epoch from now()) / p_window) * p_window);
      insert into public.game_content_rl (rl_key, window_start, cnt)
      values (p_key, v_bucket, 1)
      on conflict (rl_key, window_start)
      do update set cnt = public.game_content_rl.cnt + 1
      returning cnt into v_cnt;
      return v_cnt <= p_limit;
    end; $function$;
  `);

  assert.strictEqual(psql("select has_function_privilege('anon','public.game_content_rl_check(text,integer,integer)','execute');").stdout.trim(), 't');
  const beforeDefinition = psql("select md5(pg_get_functiondef('public.game_content_rl_check(text,integer,integer)'::regprocedure));").stdout.trim();

  applyMigration();
  applyMigration();

  const privileges = psql(`
    select concat_ws(',',
      exists (
        select 1 from pg_proc p
        cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
        where p.oid='public.game_content_rl_check(text,integer,integer)'::regprocedure
          and acl.grantee=0 and acl.privilege_type='EXECUTE'
      ),
      has_function_privilege('anon','public.game_content_rl_check(text,integer,integer)','execute'),
      has_function_privilege('authenticated','public.game_content_rl_check(text,integer,integer)','execute'),
      has_function_privilege('service_role','public.game_content_rl_check(text,integer,integer)','execute')
    );
  `).stdout.trim();
  assert.strictEqual(privileges, 'f,f,f,t');
  assert.strictEqual(psql("select md5(pg_get_functiondef('public.game_content_rl_check(text,integer,integer)'::regprocedure));").stdout.trim(), beforeDefinition);
  assert.strictEqual(psql('select count(*) from public.game_content_rl;').stdout.trim(), '0');

  const anonDenied = run('psql', [
    '-X', '-v', 'ON_ERROR_STOP=1', '-h', socket, '-p', port, '-d', 'postgres', '-c',
    "set role anon; select public.game_content_rl_check('anon', 60, 60);"
  ], true);
  assert.notStrictEqual(anonDenied.status, 0);
  assert.match(anonDenied.stderr, /permission denied for function game_content_rl_check/);

  assert.match(psql("select public.game_content_rl_check('service', 60, 60);", 'service_role').stdout.trim(), /(?:^|\n)t$/);
  assert.strictEqual(psql('select count(*) from public.game_content_rl;').stdout.trim(), '1');

  // Recovery proof: even after deliberate ACL drift, rerunning the exact artifact
  // closes browser access and restores service_role without changing function/data.
  psql(`
    grant execute on function public.game_content_rl_check(text,integer,integer) to anon;
    revoke execute on function public.game_content_rl_check(text,integer,integer) from service_role;
  `);
  applyMigration();
  assert.strictEqual(psql(`select concat_ws(',',
    has_function_privilege('anon','public.game_content_rl_check(text,integer,integer)','execute'),
    has_function_privilege('authenticated','public.game_content_rl_check(text,integer,integer)','execute'),
    has_function_privilege('service_role','public.game_content_rl_check(text,integer,integer)','execute'));
  `).stdout.trim(), 'f,f,t');
  assert.strictEqual(psql('select count(*) from public.game_content_rl;').stdout.trim(), '1');

  // Negative precheck: a missing exact signature fails before any grant mutation.
  psql('drop function public.game_content_rl_check(text,integer,integer);');
  const missing = applyMigration(true);
  assert.notStrictEqual(missing.status, 0);
  assert.match(missing.stderr, /missing public\.game_content_rl_check/);

  console.log('✅ Phase 1 game-content rate-limit PostgreSQL pre/post/recovery PASS');
} finally {
  if (started) spawnSync('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop'], { encoding: 'utf8' });
  fs.rmSync(temp, { recursive: true, force: true });
}
