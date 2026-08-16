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
  const denyPos = source.indexOf('status: 403');
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

const teacherAdmin = fs.readFileSync(path.join(root, 'js/classroom/student-admin.js'), 'utf8');
const lowQuotaRefs = teacherAdmin.match(/LOW_QUOTA_CHECK_ENDPOINT/g) || [];
check(lowQuotaRefs.length === 1, 'low-quota endpoint has no active browser invocation to preserve');

console.log(`cron internal auth: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
