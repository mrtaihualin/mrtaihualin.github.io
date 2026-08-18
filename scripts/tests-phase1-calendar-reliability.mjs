#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CALENDAR_TERMINAL_STATE,
  GOOGLE_CALENDAR_LIMIT_MESSAGE,
  classifyGoogleCalendarFailure,
  formatCalendarTerminalMessage,
  googleCalendarRequest,
  terminalStateForCalendarFailure,
} from '../supabase/functions/_shared/calendar-reliability.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const webhook = fs.readFileSync(path.join(root, 'supabase/functions/line-webhook/index.ts'), 'utf8');

function response(status, body = '', headers = {}) {
  return new Response(body, { status, headers: { 'content-type': 'application/json', ...headers } });
}

assert.equal(GOOGLE_CALENDAR_LIMIT_MESSAGE, 'ระบบ Google Calendar กำลังจำกัดการใช้งาน กรุณาลองใหม่อีกครั้งภายหลัง');
assert.equal(classifyGoogleCalendarFailure(403, JSON.stringify({
  error: { errors: [{ domain: 'usageLimits', reason: 'rateLimitExceeded' }] },
})).rateLimited, true);
assert.equal(classifyGoogleCalendarFailure(403, JSON.stringify({ error: { errors: [{ reason: 'forbidden' }] } })).rateLimited, false);

{
  let calls = 0;
  const result = await googleCalendarRequest(async () => {
    calls += 1;
    return response(200, JSON.stringify({ id: 'event-normal' }));
  }, 'https://calendar.test/event-normal', { method: 'GET' }, { sleep: async () => {} });
  assert.equal(result.ok, true, 'normal Calendar success must be confirmed');
  assert.equal(result.json.id, 'event-normal');
  assert.equal(calls, 1, 'normal success must not create duplicate calls');
}

{
  let calls = 0;
  const sleeps = [];
  const result = await googleCalendarRequest(async () => {
    calls += 1;
    if (calls < 3) return response(403, JSON.stringify({ error: { errors: [{ reason: 'rateLimitExceeded' }] } }));
    return response(200, JSON.stringify({ id: 'event-1' }));
  }, 'https://calendar.test/event-1', { method: 'PATCH' }, { sleep: async (ms) => sleeps.push(ms) });
  assert.equal(result.ok, true, 'explicit Google rate limit should recover with bounded retry');
  assert.equal(calls, 3);
  assert.deepEqual(sleeps, [250, 500]);
}

{
  let calls = 0;
  const result = await googleCalendarRequest(async () => {
    calls += 1;
    return response(403, JSON.stringify({ error: { errors: [{ domain: 'usageLimits', reason: 'rateLimitExceeded' }] } }));
  }, 'https://calendar.test/event-2', { method: 'DELETE' }, { maxAttempts: 3, sleep: async () => {} });
  assert.equal(result.ok, false);
  assert.equal(result.rateLimited, true);
  assert.equal(result.attempts, 3);
  assert.equal(calls, 3, 'retry must remain bounded');
  assert.equal(terminalStateForCalendarFailure(result), CALENDAR_TERMINAL_STATE.RETRY_PENDING);
  const lineText = formatCalendarTerminalMessage({ state: CALENDAR_TERMINAL_STATE.RETRY_PENDING });
  assert.match(lineText, /Google Calendar/);
  assert.doesNotMatch(lineText, /usageLimits|rateLimitExceeded|\{"error"/);
}

{
  let calls = 0;
  const result = await googleCalendarRequest(async () => {
    calls += 1;
    throw new Error('connection reset after write');
  }, 'https://calendar.test/event-3', { method: 'PATCH' }, { sleep: async () => {} });
  assert.equal(result.ok, false);
  assert.equal(result.ambiguousMutation, true);
  assert.equal(calls, 1, 'ambiguous mutation must never be replayed automatically');
  assert.equal(terminalStateForCalendarFailure(result), CALENDAR_TERMINAL_STATE.RETRY_PENDING);
}

{
  const partial = formatCalendarTerminalMessage({
    state: CALENDAR_TERMINAL_STATE.PARTIAL_SUCCESS,
    completed: ['Calendar 已刪除'],
    pending: ['課表同步', '學生通知'],
  });
  assert.match(partial, /已完成：Calendar 已刪除/);
  assert.match(partial, /仍待處理：課表同步、學生通知/);
}

assert.match(webhook, /CALENDAR_TERMINAL_STATE/);
assert.match(webhook, /googleCalendarRequest/);
assert.match(webhook, /terminalStateForCalendarFailure/);
assert.match(webhook, /formatCalendarTerminalMessage/);
assert.doesNotMatch(webhook, /replyLine\([^\n]+usageLimits/);
assert.match(webhook, /eventDeletedButUnverified[\s\S]{0,900}CALENDAR_TERMINAL_STATE\.RETRY_PENDING/,
  'delete accepted but follow-up verification failed must remain pending, not report success');
assert.match(webhook, /scheduleCleanupPendingCancel[\s\S]{0,1800}CALENDAR_TERMINAL_STATE\.PARTIAL_SUCCESS/,
  'delete follow-up sync failure must be an explicit partial success');
assert.doesNotMatch(webhook, /claimCalendarOperation\(supabase, requestIdCancel, true\)/,
  'delete must not reclaim a stale lock when an earlier DELETE may have reached Google');
assert.match(webhook, /moveCalendarEventById\([\s\S]{0,180}preMove\.preEvent\)/,
  'move must reuse its claimed precheck snapshot instead of issuing an immediate duplicate event GET');
assert.match(webhook, /moveCalendarEventById\([\s\S]{0,180}prePick\.preEvent\)/,
  'picked move must reuse its claimed precheck snapshot instead of issuing an immediate duplicate event GET');

{
  const cancelStart = webhook.indexOf("if (action === 'confirm_cancel_delete')");
  const cancelEnd = webhook.indexOf("if (action === '", cancelStart + 20);
  const cancelBlock = webhook.slice(cancelStart, cancelEnd);
  assert.ok(cancelBlock.indexOf('notifyStudentOfCalendarCancel(') < cancelBlock.indexOf("update({ status: 'acknowledged'"),
    'student notification must be attempted before request finalization can fail');
}

for (const suffix of ['Move', 'Pick']) {
  const notifyAt = webhook.indexOf('pushRes' + suffix + ' = await pushLineChecked');
  const finalizeAt = webhook.indexOf("const { error: updErr" + suffix + ", count: updCount" + suffix + " }");
  assert.ok(notifyAt >= 0 && finalizeAt > notifyAt, `reschedule ${suffix.toLowerCase()} notification must precede finalization`);
}

for (const action of ['confirm_reschedule_move', 'confirm_reschedule_pick', 'confirm_cancel_delete']) {
  const start = webhook.indexOf("if (action === '" + action + "')");
  assert.notEqual(start, -1, `${action} handler must exist`);
  const end = webhook.indexOf("if (action === '", start + 20);
  const block = webhook.slice(start, end === -1 ? webhook.length : end);
  const claimAt = block.indexOf('claimCalendarOperation(');
  const firstCalendarRead = Math.min(...['precheckRescheduleMoveTarget(', 'fetchCalendarEventById(', 'deleteCalendarEventById(']
    .map((needle) => block.indexOf(needle)).filter((index) => index >= 0));
  assert.ok(claimAt >= 0 && claimAt < firstCalendarRead, `${action} must dedupe before its first Calendar API read`);
}

console.log('PASS Phase 1 Calendar reliability: terminal states, rate-limit backoff, redaction, early dedupe, idempotent retry');
