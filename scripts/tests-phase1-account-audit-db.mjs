import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Ephemeral PostgreSQL privilege fixture. It never connects to Supabase or a
// project database and deletes only the private temporary cluster it creates.

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migrationName = fs.readdirSync(path.join(root, 'supabase/migrations'))
  .find((name) => name.endsWith('_phase1_account_audit_rpc_hardening.sql'));
assert.ok(migrationName, 'account-audit hardening migration exists');

const tmp = fs.mkdtempSync('/private/tmp/phase1-account-audit-pg-');
const data = path.join(tmp, 'data');
const socket = path.join(tmp, 'socket');
const port = '55440';
fs.mkdirSync(socket);

function run(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`${command} failed\n${result.stdout || ''}\n${result.stderr || ''}`);
  }
  return result.stdout || '';
}

function psql(sql, role) {
  const prefix = role ? `set role ${role};\n` : '';
  return run('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-h', socket, '-p', port, '-d', 'postgres', '-c', prefix + sql]);
}

let started = false;
try {
  run('initdb', ['-D', data, '--no-locale', '--encoding=UTF8', '--auth=trust']);
  run('pg_ctl', ['-D', data, '-l', path.join(tmp, 'postgres.log'), '-o', `-F -c listen_addresses='' -p ${port} -k ${socket}`, '-w', 'start']);
  started = true;

  psql(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin;
    create table public.account_audit_log(
      id bigint generated always as identity primary key,
      user_id uuid not null,
      event_type text not null,
      provider text,
      before_state jsonb,
      after_state jsonb,
      actor_type text not null,
      actor_id uuid,
      created_at timestamptz not null default now()
    );
    create or replace function public.log_account_audit(
      p_user_id uuid,
      p_event_type text,
      p_before_state jsonb,
      p_after_state jsonb,
      p_actor_type text,
      p_actor_id uuid,
      p_provider text default null
    ) returns void
      language sql
      security definer
      set search_path = 'public'
    as $function$
      insert into public.account_audit_log(user_id,event_type,provider,before_state,after_state,actor_type,actor_id)
      values (p_user_id,p_event_type,p_provider,p_before_state,p_after_state,p_actor_type,p_actor_id)
    $function$;
    insert into public.account_audit_log(user_id,event_type,actor_type)
    values ('00000000-0000-4000-8000-000000000001','link','system');
  `);

  run('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-h', socket, '-p', port, '-d', 'postgres', '-f', path.join(root, 'supabase/migrations', migrationName)]);

  const privileges = psql(`
    do $verify$
    declare
      public_execute boolean;
      config text[];
    begin
      select exists (
        select 1
        from pg_proc as p
        join pg_namespace as n on n.oid = p.pronamespace
        cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) as acl
        where n.nspname='public' and p.proname='log_account_audit'
          and acl.grantee=0 and acl.privilege_type='EXECUTE'
      ) into public_execute;
      if public_execute
         or has_function_privilege('anon','public.log_account_audit(uuid,text,jsonb,jsonb,text,uuid,text)','execute')
         or has_function_privilege('authenticated','public.log_account_audit(uuid,text,jsonb,jsonb,text,uuid,text)','execute')
      then raise exception 'browser execute privilege remains'; end if;
      if not has_function_privilege('service_role','public.log_account_audit(uuid,text,jsonb,jsonb,text,uuid,text)','execute')
      then raise exception 'service role execute missing'; end if;
      select proconfig into config from pg_proc where oid='public.log_account_audit(uuid,text,jsonb,jsonb,text,uuid,text)'::regprocedure;
      if config is distinct from array['search_path=""'] then raise exception 'unsafe search_path %', config; end if;
      if (select count(*) from public.account_audit_log) <> 1 then raise exception 'migration changed audit rows'; end if;
    end
    $verify$;
  `);
  assert.match(privileges, /DO/);

  const anonDenied = spawnSync('psql', [
    '-X', '-v', 'ON_ERROR_STOP=1', '-h', socket, '-p', port, '-d', 'postgres', '-c',
    "set role anon; select public.log_account_audit('00000000-0000-4000-8000-000000000001','link','{}','{}','user','00000000-0000-4000-8000-000000000001','facebook');",
  ], { encoding: 'utf8' });
  assert.notStrictEqual(anonDenied.status, 0);
  assert.match(anonDenied.stderr, /permission denied for function log_account_audit/);

  psql("select public.log_account_audit('00000000-0000-4000-8000-000000000001','link','{}','{}','user','00000000-0000-4000-8000-000000000001','facebook');", 'service_role');
  const rows = psql('select count(*) from public.account_audit_log;');
  assert.match(rows, /\b2\b/);

  console.log('✅ Phase 1 account audit PostgreSQL privileges PASS');
} finally {
  if (started) spawnSync('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop'], { encoding: 'utf8' });
  fs.rmSync(tmp, { recursive: true, force: true });
}
