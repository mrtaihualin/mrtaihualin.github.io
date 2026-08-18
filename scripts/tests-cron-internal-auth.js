#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const handlers = [
  'supabase/functions/class-reminder-cron/index.ts',
  'supabase/functions/request-sla-cron/index.ts',
  'supabase/functions/low-quota-cron/index.ts',
];
const rolloutPath = 'supabase/sql/2026-08-16_phase1_cron_internal_auth.sql';

let passed = 0;
let failed = 0;

function check(condition, label) {
  if (condition) {
    passed += 1;
    console.log('PASS ' + label);
  } else {
    failed += 1;
    console.error('FAIL ' + label);
  }
}

for (const relative of handlers) {
  const source = fs.readFileSync(path.join(root, relative), 'utf8');
  const envPos = source.indexOf("Deno.env.get('CRON_INTERNAL_SECRET')");
  const headerPos = source.indexOf("req.headers.get('x-cron-secret')");
  const denyPositions = [
    source.indexOf('status: 403'),
    source.indexOf("error: 'forbidden' }, 403"),
  ].filter((position) => position >= 0);
  const denyPos = denyPositions.length ? Math.min(...denyPositions) : -1;
  const servicePos = source.indexOf("Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')");

  check(envPos >= 0, relative + ' requires CRON_INTERNAL_SECRET');
  check(headerPos > envPos, relative + ' compares x-cron-secret');
  check(denyPos > headerPos, relative + ' fails closed with 403');
  check(servicePos > denyPos, relative + ' authorizes before service-role client');
}

const rollout = fs.readFileSync(path.join(root, rolloutPath), 'utf8');
for (const wrapper of [
  'call_request_sla_cron',
  'call_low_quota_cron',
  'call_class_reminder_cron',
]) {
  const start = rollout.indexOf('create or replace function private.' + wrapper + '()');
  const next = rollout.indexOf('create or replace function private.', start + 1);
  const body = rollout.slice(start, next === -1 ? rollout.length : next);
  check(start >= 0, rolloutPath + ' updates ' + wrapper);
  check(body.includes("where name = 'cron_shared_secret'"), wrapper + ' reuses existing Vault secret');
  check(body.includes("'x-cron-secret', v_secret"), wrapper + ' sends internal header');
  check(
    rollout.includes('revoke all on function private.' + wrapper + '() from public, anon, authenticated;'),
    wrapper + ' is not executable by public API roles'
  );
}

const classroomDir = path.join(root, 'js/classroom');
const classroomSources = fs.readdirSync(classroomDir)
  .filter((name) => name.endsWith('.js'))
  .map((name) => ({ name, source: fs.readFileSync(path.join(classroomDir, name), 'utf8') }));
const browserInvocations = classroomSources.flatMap(({ name, source }) => {
  const matches = source.match(/fetch\(LOW_QUOTA_CHECK_ENDPOINT/g) || [];
  return matches.map(() => name);
});
check(browserInvocations.length === 1 && browserInvocations[0] === 'attendance-auth.js',
  'the immediate low-quota browser behavior has exactly one active attendance caller');

const attendanceAuth = fs.readFileSync(path.join(classroomDir, 'attendance-auth.js'), 'utf8');
const browserCallStart = attendanceAuth.indexOf('fetch(LOW_QUOTA_CHECK_ENDPOINT');
const browserCallEnd = attendanceAuth.indexOf('body: JSON.stringify({ token: token })', browserCallStart);
const browserCall = attendanceAuth.slice(browserCallStart, browserCallEnd + 43);
check(browserCallStart >= 0 && browserCallEnd > browserCallStart,
  'the immediate attendance caller sends only the attended student token');
check(/Authorization['"]?:\s*['"]Bearer ['"] \+ \(await teacherAuthHeader\(\)\)/.test(browserCall),
  'the immediate attendance caller sends the verified teacher session JWT');
check(!/Authorization[^\n]*anonKey/.test(browserCall),
  'the immediate attendance caller never uses the public anon key as bearer authorization');
check(!/x-cron-secret|CRON_INTERNAL_SECRET/.test(attendanceAuth),
  'browser source never receives or sends the internal cron secret');

const lowQuota = fs.readFileSync(path.join(root, 'supabase/functions/low-quota-cron/index.ts'), 'utf8');
const lowQuotaServicePos = lowQuota.indexOf("Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')");
const lowQuotaTeacherClientPos = lowQuota.indexOf("Deno.env.get('SUPABASE_ANON_KEY')");
const lowQuotaTeacherVerifyPos = lowQuota.indexOf('.auth.getUser(jwt)');
const lowQuotaTeacherEmailPos = lowQuota.indexOf("callerEmail !== TEACHER_EMAIL");
const lowQuotaTeacherScopePos = lowQuota.indexOf("authMode === 'teacher' && !bodyToken");
check(lowQuota.includes("const TEACHER_EMAIL = 'mr.taihualin@gmail.com';")
    && lowQuotaTeacherClientPos >= 0
    && lowQuotaTeacherVerifyPos > lowQuotaTeacherClientPos
    && lowQuotaTeacherEmailPos > lowQuotaTeacherVerifyPos,
  'low-quota verifies the teacher JWT server-side and rejects every other identity');
check(lowQuotaTeacherScopePos > lowQuotaTeacherEmailPos && lowQuotaServicePos > lowQuotaTeacherScopePos,
  'teacher authorization is token-scoped before service-role access');
check(lowQuota.includes("if (req.method === 'OPTIONS')")
    && lowQuota.includes("if (req.method !== 'POST')")
    && lowQuota.includes("'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'")
    && !lowQuota.includes("'Access-Control-Allow-Origin': '*'"),
  'the browser entry has scoped CORS/preflight support without exposing the cron header');

console.log(`cron internal auth: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
