import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const artifactDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(artifactDir, '../../..');
const sourceLock = JSON.parse(fs.readFileSync(path.join(artifactDir, 'source-lock.json'), 'utf8'));
const recoveryPath = path.join(artifactDir, 'recover.sql');
const recovery = fs.readFileSync(recoveryPath, 'utf8');
const runbook = fs.readFileSync(path.join(artifactDir, 'README.md'), 'utf8');

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', ...options });
  if (result.status !== 0 && !options.allowFailure) {
    throw new Error(`${command} ${args.join(' ')} failed\n${result.stdout || ''}\n${result.stderr || ''}`);
  }
  return result;
}

function output(command, args, options = {}) {
  return run(command, args, options).stdout.trim();
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function gitObjectExists(object) {
  return run('git', ['cat-file', '-e', object], { allowFailure: true }).status === 0;
}

let passed = 0;
function check(label, condition) {
  assert.ok(condition, label);
  passed += 1;
  console.log('PASS', label);
}

check('source lock scope is exact',
  sourceLock.schema_version === 'phase1-auth-security-recovery-v1' &&
  sourceLock.scope.join(',') === 'P1-D-01,P1-D-09' &&
  sourceLock.forward_sql.length === 2);

for (const source of sourceLock.forward_sql) {
  const absolute = path.join(root, source.path);
  check(`tracked source exists: ${source.name}`, fs.existsSync(absolute));
  check(`tracked SHA-256 is exact: ${source.name}`, sha256(absolute) === source.sha256);
  check(`working-tree Git blob is exact: ${source.name}`,
    output('git', ['hash-object', source.path]) === source.git_blob);
  if (gitObjectExists(`${source.source_commit}^{commit}`)) {
    check(`source commit parent is exact: ${source.name}`,
      output('git', ['show', '-s', '--format=%P', source.source_commit]) === source.source_parent);
    check(`source commit blob is exact: ${source.name}`,
      output('git', ['rev-parse', `${source.source_commit}:${source.path}`]) === source.git_blob);
  } else {
    check(`shallow checkout retains an immutable source identity: ${source.name}`,
      /^[0-9a-f]{40}$/.test(source.source_commit) && /^[0-9a-f]{40}$/.test(source.source_parent));
    check(`shallow checkout retains an immutable blob identity: ${source.name}`,
      /^[0-9a-f]{40}$/.test(source.git_blob));
  }
}

const executableRecovery = recovery.replace(/^\s*--.*$/gm, '');
check('recovery contains no destructive or row-mutating SQL',
  !/^\s*(drop|truncate|delete|update|insert)\b/im.test(executableRecovery));
check('Email-OTP service entrypoints are explicitly disabled',
  (recovery.match(/revoke execute on function public\.(?:begin|verify|invalidate|log|purge)_email_otp[\s\S]*?from public, anon, authenticated, service_role;/g) || []).length === 5);
check('account-audit browser access remains revoked',
  /revoke execute on function public\.log_account_audit[\s\S]*?from public, anon, authenticated;/i.test(recovery) &&
  /grant execute on function public\.log_account_audit[\s\S]*?to service_role;/i.test(recovery));
check('runbook documents both intentionally impossible rollbacks',
  /schema is not rolled back to “objects absent.”/.test(runbook) &&
  /migration is not rolled back to its prior browser-callable ACL/.test(runbook));
check('runbook excludes provider, Turnstile, activation, and Production authority',
  /neither chooses nor assumes a mail provider, Turnstile values, activation mode/.test(runbook) &&
  /never connects to that project/.test(runbook));

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'phase1-auth-sql-recovery-'));
const data = path.join(temp, 'data');
const socket = path.join(temp, 'socket');
const port = String(57000 + (process.pid % 2000));
fs.mkdirSync(socket);
let started = false;

function psql(database, args, options = {}) {
  return run('psql', [
    '-X', '-v', 'ON_ERROR_STOP=1', '-h', socket, '-p', port, '-d', database, ...args
  ], options);
}

function sql(database, statement) {
  return psql(database, ['-At', '-c', statement]).stdout.trim();
}

function applyForward(database) {
  psql(database, ['-f', path.join(root, 'supabase/sql/2026-08-08_account_audit_log.sql')]);
  psql(database, ['-f', path.join(root, sourceLock.forward_sql[0].path)]);
  psql(database, ['-f', path.join(root, sourceLock.forward_sql[1].path)]);
}

const authPrelude = `
create schema auth;
create function auth.role() returns text language sql stable as
  'select current_user::text';
create function auth.uid() returns uuid language sql stable as
  'select null::uuid';
`;

const fixtureRows = `
insert into private.email_otp_challenges (
  challenge_id, email_hmac, code_hmac, ip_hmac, state, attempts, issued_at, expires_at
) values (
  '10000000-0000-4000-8000-000000000001', repeat('a', 64), repeat('b', 64), repeat('c', 64),
  'pending', 0, '2026-08-18 00:00:00+00', '2026-08-18 00:10:00+00'
);
insert into private.email_otp_abuse_state (
  subject_kind, subject_hmac, last_request_at, violation_count, updated_at
) values ('email', repeat('a', 64), '2026-08-18 00:00:00+00', 0, '2026-08-18 00:00:00+00');
insert into private.email_otp_security_events (
  event_type, challenge_id, email_hmac, ip_hmac, outcome, metadata, occurred_at
) values (
  'request_accepted', '10000000-0000-4000-8000-000000000001', repeat('a', 64), repeat('c', 64),
  'accepted', '{"fixture":true}', '2026-08-18 00:00:00+00'
);
insert into public.account_audit_log (
  user_id, event_type, provider, before_state, after_state, actor_type, actor_id, created_at
) values (
  '20000000-0000-4000-8000-000000000002', 'link', 'facebook', '{}', '{"linked":true}',
  'system', null, '2026-08-18 00:00:00+00'
);
`;

const digestSql = `
select pg_catalog.md5(pg_catalog.concat_ws('|',
  (select pg_catalog.string_agg(t::text, ',' order by challenge_id) from private.email_otp_challenges as t),
  (select pg_catalog.string_agg(t::text, ',' order by subject_kind, subject_hmac) from private.email_otp_abuse_state as t),
  (select pg_catalog.string_agg(t::text, ',' order by id) from private.email_otp_security_events as t),
  (select pg_catalog.string_agg(t::text, ',' order by id) from public.account_audit_log as t)
));
`;

try {
  run('initdb', ['-D', data, '--no-locale', '--encoding=UTF8', '--auth=trust']);
  run('pg_ctl', [
    '-D', data, '-l', path.join(temp, 'postgres.log'),
    '-o', `-F -c listen_addresses='' -p ${port} -k ${socket}`, '-w', 'start'
  ]);
  started = true;

  psql('postgres', ['-c', 'create role anon nologin; create role authenticated nologin; create role service_role nologin;']);
  psql('postgres', ['-c', 'create database recovery_success;']);
  psql('postgres', ['-c', 'create database recovery_failure;']);

  for (const database of ['recovery_success', 'recovery_failure']) {
    psql(database, ['-c', authPrelude]);
    applyForward(database);
  }

  psql('recovery_failure', ['-c', `
    grant execute on function public.begin_email_otp_challenge_internal(uuid,text,text,text) to authenticated;
    drop function public.purge_email_otp_security_internal();
  `]);
  const failedRecovery = psql('recovery_failure', ['-f', recoveryPath], { allowFailure: true });
  check('missing forward object makes recovery fail closed', failedRecovery.status !== 0);
  check('failed precheck changes no existing privilege',
    sql('recovery_failure', `select has_function_privilege('authenticated', 'public.begin_email_otp_challenge_internal(uuid,text,text,text)', 'execute');`) === 't');

  psql('recovery_success', ['-c', fixtureRows]);
  const before = sql('recovery_success', digestSql);
  psql('recovery_success', ['-f', recoveryPath]);
  const afterFirst = sql('recovery_success', digestSql);
  psql('recovery_success', ['-f', recoveryPath]);
  const afterSecond = sql('recovery_success', digestSql);
  check('first recovery preserves every fixture row byte-for-byte', before === afterFirst);
  check('idempotent recovery preserves every fixture row byte-for-byte', before === afterSecond);

  check('all Email-OTP application entrypoints are inert',
    sql('recovery_success', `
      select count(*) = 0
      from (values
        ('public.begin_email_otp_challenge_internal(uuid,text,text,text)'::regprocedure),
        ('public.verify_email_otp_challenge_internal(uuid,text,text,text)'::regprocedure),
        ('public.invalidate_email_otp_challenge_internal(uuid,text,text,text)'::regprocedure),
        ('public.log_email_otp_security_internal(text,uuid,text,text,text)'::regprocedure),
        ('public.purge_email_otp_security_internal()'::regprocedure)
      ) as f(oid)
      cross join (values ('anon'), ('authenticated'), ('service_role')) as r(name)
      where has_function_privilege(r.name, f.oid, 'execute');
    `) === 't');

  check('OTP RLS remains forced and all additive objects remain present',
    sql('recovery_success', `
      select count(*) = 3
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'private'
        and c.relname in ('email_otp_challenges','email_otp_abuse_state','email_otp_security_events')
        and c.relrowsecurity and c.relforcerowsecurity;
    `) === 't');

  check('account-audit remains service-only',
    sql('recovery_success', `
      select not has_function_privilege('anon', 'public.log_account_audit(uuid,text,jsonb,jsonb,text,uuid,text)', 'execute')
         and not has_function_privilege('authenticated', 'public.log_account_audit(uuid,text,jsonb,jsonb,text,uuid,text)', 'execute')
         and has_function_privilege('service_role', 'public.log_account_audit(uuid,text,jsonb,jsonb,text,uuid,text)', 'execute');
    `) === 't');

  console.log(`Phase 1 Auth SQL recovery: ${passed}/${passed} PASS (PostgreSQL disposable fixtures)`);
} finally {
  if (started) {
    run('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop'], { allowFailure: true });
  }
  fs.rmSync(temp, { recursive: true, force: true });
}
