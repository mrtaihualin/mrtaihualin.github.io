#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const handlers = [
  'supabase/functions/class-reminder-cron/index.ts',
  'supabase/functions/request-sla-cron/index.ts',
];
const readinessPath = 'supabase/sql/2026-08-17_phase1_reliability_readiness_READ_ONLY.sql';

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
  const secretPos = source.indexOf("Deno.env.get('CRON_INTERNAL_SECRET')");
  const headerPos = source.indexOf("req.headers.get('x-cron-secret')");
  const denyPos = source.indexOf('status: 403');
  const serviceRolePos = source.indexOf("Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')");

  check(secretPos >= 0 && headerPos > secretPos && denyPos > headerPos,
    relative + ' preserves fail-closed internal cron authorization');
  check(serviceRolePos > denyPos,
    relative + ' authorizes before creating its service-role client');
  check(source.includes('const LINE_TIMEOUT_MS = 10000;'),
    relative + ' uses the locked ten-second LINE deadline');
  check(source.includes('const controller = new AbortController();')
      && source.includes('signal: controller.signal')
      && source.includes('clearTimeout(timeout);'),
    relative + ' aborts a stalled LINE request and clears its timer');
  check(/ok: errCount === 0/.test(source) && /errCount > 0 \? 500 : 200/.test(source),
    relative + ' exposes partial notification failures as non-2xx');
}

const classReminder = fs.readFileSync(
  path.join(root, 'supabase/functions/class-reminder-cron/index.ts'), 'utf8'
);
check(/data: students, error: studentsError/.test(classReminder)
    && /if \(studentsError\)/.test(classReminder)
    && /error: 'student query failed'/.test(classReminder),
  'class reminder fails closed when its student lookup fails');
check(/releaseReminderIds\(supabase, 'line_reminder24h_sent', claimed24h\)/.test(classReminder),
  'class reminder releases claimed rows after a notification failure');

const requestSla = fs.readFileSync(
  path.join(root, 'supabase/functions/request-sla-cron/index.ts'), 'utf8'
);
check(requestSla.includes("if (!teacherUserId)")
    && requestSla.indexOf("if (!teacherUserId)") < requestSla.indexOf("Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')"),
  'request SLA stops before data access when teacher notification identity is absent');
check(/await pushLine[\s\S]{0,900}await markReminderSent/.test(requestSla),
  'request SLA marks completion only after its LINE attempt');

const readiness = fs.readFileSync(path.join(root, readinessPath), 'utf8');
const executableSql = readiness
  .replace(/--[^\n]*/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '');
check(!/\b(insert|update|delete|alter|drop|truncate|create|grant|revoke|perform|call)\b/i.test(executableSql),
  readinessPath + ' remains read-only');
check(['class-reminder-every-5-min', 'request-sla-reminder', 'low-quota-daily']
    .every((name) => readiness.includes(name)),
  readinessPath + ' covers all three Phase 1 schedules without invoking them');
check(readiness.includes('HTTP_2XX_TRANSPORT_ONLY')
    && readiness.includes('RESPONSE_UNAVAILABLE')
    && readiness.includes('MISSED_SCHEDULE'),
  readinessPath + ' distinguishes transport, retention, and missed schedules');
check(!/select\s+command\b/i.test(executableSql)
    && /command\s*!~\s*'Bearer\|apikey\|eyJ'/.test(readiness),
  readinessPath + ' reports credential cleanliness without returning cron commands');

console.log(`Phase 1 cron reliability: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
