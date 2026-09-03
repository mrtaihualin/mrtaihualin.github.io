import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migration = path.join(root, 'supabase/migrations/20260903075852_phase1_login_free_srs_least_privilege.sql');
const tmp = fs.mkdtempSync('/private/tmp/login-free-srs-acl-pg-');
const data = path.join(tmp, 'data');
const socket = path.join(tmp, 'socket');
fs.mkdirSync(socket);
const port = '55483';

function run(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`${command} failed\n${result.stdout || ''}\n${result.stderr || ''}`);
  return result.stdout || '';
}

function psql(sql) {
  return run('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-h', socket, '-p', port, '-d', 'postgres', '-c', sql]);
}

const prelude = `
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create function auth.uid() returns uuid language sql stable
as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;

create table public.tone_srs_state(
  user_id uuid not null, game text not null, level smallint not null, word text not null,
  stage smallint not null, due_date text not null, ever_failed boolean not null,
  mastered boolean not null, updated_at timestamptz not null default now(),
  primary key(user_id, game, level, word)
);
create table public.tone_round_operations(
  operation_id uuid primary key, user_id uuid not null, game text not null,
  level smallint not null, word text not null, request_hash text not null,
  response jsonb not null, created_at timestamptz not null default now()
);
create function public.phase1_tone_round_commit(
  uuid,uuid,text,text,smallint,text,boolean,smallint,text,boolean,boolean,
  smallint,text,boolean,boolean,text,boolean,boolean,boolean
) returns jsonb language sql security invoker as $$ select '{}'::jsonb $$;

alter table public.tone_srs_state enable row level security;
alter table public.tone_round_operations enable row level security;
create policy tone_srs_select_own on public.tone_srs_state for select to public using (auth.uid() = user_id);
grant all on public.tone_srs_state to anon, authenticated, service_role;
grant all on public.tone_round_operations to service_role;
grant execute on function public.phase1_tone_round_commit(
  uuid,uuid,text,text,smallint,text,boolean,smallint,text,boolean,boolean,
  smallint,text,boolean,boolean,text,boolean,boolean,boolean
) to public, anon, authenticated, service_role;
`;

let started = false;
try {
  run('initdb', ['-D', data, '--no-locale', '--encoding=UTF8', '--auth=trust']);
  run('pg_ctl', ['-D', data, '-l', path.join(tmp, 'postgres.log'), '-o', `-F -c listen_addresses='' -p ${port} -k ${socket}`, '-w', 'start']);
  started = true;
  psql(prelude);
  run('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-h', socket, '-p', port, '-d', 'postgres', '-f', migration]);

  const result = psql(`
    do $$
    declare
      signature text := 'public.phase1_tone_round_commit(uuid,uuid,text,text,smallint,text,boolean,smallint,text,boolean,boolean,smallint,text,boolean,boolean,text,boolean,boolean,boolean)';
      policy_roles name[];
    begin
      if not has_table_privilege('authenticated','public.tone_srs_state','select') then raise exception 'authenticated select missing'; end if;
      if has_table_privilege('authenticated','public.tone_srs_state','insert,update,delete,truncate') then raise exception 'authenticated mutation leaked'; end if;
      if has_table_privilege('anon','public.tone_srs_state','select,insert,update,delete,truncate') then raise exception 'anon privilege leaked'; end if;
      if has_table_privilege('anon','public.tone_round_operations','select,insert,update,delete,truncate') then raise exception 'anon replay privilege leaked'; end if;
      if has_table_privilege('authenticated','public.tone_round_operations','select,insert,update,delete,truncate') then raise exception 'authenticated replay privilege leaked'; end if;
      if has_function_privilege('anon',signature,'execute') or has_function_privilege('authenticated',signature,'execute') then raise exception 'browser RPC execute leaked'; end if;
      if not has_function_privilege('service_role',signature,'execute') then raise exception 'service RPC execute missing'; end if;
      select roles into policy_roles from pg_policies where schemaname='public' and tablename='tone_srs_state' and policyname='tone_srs_select_own';
      if policy_roles is distinct from array['authenticated']::name[] then raise exception 'policy roles invalid %', policy_roles; end if;
    end $$;

    set role service_role;
    insert into public.tone_srs_state(user_id,game,level,word,stage,due_date,ever_failed,mastered) values
      ('00000000-0000-4000-8000-000000000001','tone',1,'own',1,'2026-09-04',false,false),
      ('00000000-0000-4000-8000-000000000002','tone',1,'other',1,'2026-09-04',false,false);
    reset role;
    set request.jwt.claim.sub='00000000-0000-4000-8000-000000000001';
    set role authenticated;
    do $$ begin
      if (select count(*) from public.tone_srs_state) <> 1 then raise exception 'owner RLS isolation failed'; end if;
    end $$;
    reset role;
  `);
  assert.match(result, /DO/);
  console.log('LOGIN_FREE_SRS_ACL_POSTGRES_PASS');
} finally {
  if (started) spawnSync('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop'], { encoding: 'utf8' });
  fs.rmSync(tmp, { recursive: true, force: true });
}
