// Regression contract for Classroom request retirement. Keep the add-class lane live.
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const html = read('classroom/index.html');
const student = read('js/classroom/student-requests.js');
const teacher = read('js/classroom/teacher-request-admin.js');
const scheduling = read('js/classroom/add-class-scheduling.js');
const operations = read('js/classroom/teacher-operations.js');
const webhook = read('supabase/functions/line-webhook/index.ts');
const rpc = read('supabase/sql/2026-09-19_submit_add_class_only.sql');

// Baseline invariants that must pass before and after retirement.
assert.match(html, /id="addRequestModal"/);
assert.match(html, /id="addClassDayModal"/);
assert.match(student, /function openAddRequestModal\(/);
assert.match(student, /async function submitAddRequest\(/);
assert.match(student, /p_request_type: 'add_class'/);
assert.match(student, /async function studentWithdrawOwnAddRequest\(/);
assert.match(student, /function buildLineActionBtn\(/);
assert.match(teacher, /async function claimAddClassRequest\(/);
assert.match(teacher, /async function closeAddRequestAfterContact\(/);
assert.match(scheduling, /async function confirmAddClassDay/);
assert.match(operations, /async function approveSlip\(/);
assert.match(operations, /async function deletePayment\(/);
assert.match(webhook, /action === 'confirm_add_class'/);
assert.match(webhook, /action === 'start_contact_student'/);
assert.ok(rpc.includes("'add_class'"), 'RPC keeps add_class');
assert.ok(rpc.includes("and c.request_type = 'add_class'"), 'update RPC restricts mutations to add_class');
assert.ok(rpc.includes('return false;'), 'retired offer RPC cannot mutate historical requests');

if (process.env.CLASSROOM_RETIREMENT_FINAL === '1') {
  assert.doesNotMatch(student, /openCancelPickerModal\(|openReschedulePickerModal\(/);
  assert.doesNotMatch(operations, /teacherCancelClassNow\(|initiateTeacherReschedule\(|openPermanentChangeModal\(/);
  assert.doesNotMatch(html, /id="(?:cancelPickerModal|reschedulePickerModal|permanentChangeModal|pickLessonModal)"/);
  assert.match(student, /href="' \+ LINE_OA_URL/);
  assert.match(webhook, /RETIRED_CLASSROOM_POSTBACKS/);
  const retiredGuard = webhook.slice(webhook.indexOf("if (RETIRED_CLASSROOM_POSTBACKS.has(action || ''))"), webhook.indexOf("console.log('[line-webhook] 📩", webhook.indexOf("if (RETIRED_CLASSROOM_POSTBACKS.has(action || ''))")));
  assert.match(retiredGuard, /await replyLine\(channelToken, event\.replyToken/);
  assert.doesNotMatch(retiredGuard, /\.from\(|checkFreebusyConflictService\(|createCalendarEventById\(/);
  assert.doesNotMatch(webhook, /到網站按「申請取消課堂」/);
  assert.match(rpc, /Classroom cancel\/reschedule requests are retired/);
}

async function verifyRetiredPostbacks() {
  const actions = [
    'accept_offer', 'decline_offer', 'confirm_reschedule_move',
    'confirm_reschedule_pick', 'ack_teacher_cancel', 'confirm_cancel_delete',
  ];
  let handler;
  const requests = [];
  const context = {
    serve: (fn) => { handler = fn; },
    createClient: () => ({ from: () => { throw new Error('retired postback queried database'); } }),
    Deno: { env: { get: (name) => name === 'LINE_CHANNEL_ACCESS_TOKEN' || name === 'LINE_CHANNEL_SECRET' ? 'fixture-value' : '' } },
    fetch: async (url, options) => { requests.push({ url, options }); return { ok: true }; },
    Response,
    URLSearchParams,
    console: { log: () => {}, warn: () => {}, error: () => {} },
  };
  const runnable = webhook
    .replace(/^import \{ serve \}.*\n/m, '')
    .replace(/^import \{ createClient \}.*\n/m, '')
    .replace(/^import \{[\s\S]*?\} from '\.\.\/_shared\/calendar-reliability\.mjs';\n/m, '');
  vm.runInNewContext(runnable, context);
  context.verifySignature = async () => true;
  const response = await handler({
    method: 'POST', headers: { get: () => 'fixture-signature' },
    text: async () => JSON.stringify({ events: actions.map((action, index) => ({
      type: 'postback', replyToken: 'fixture-' + index,
      postback: { data: 'action=' + action + '&request=old-id' },
    })) }),
  });
  assert.equal(response.status, 200);
  assert.equal(requests.length, actions.length);
  requests.forEach(({ url, options }, index) => {
    assert.equal(url, 'https://api.line.me/v2/bot/message/reply');
    const payload = JSON.parse(options.body);
    assert.equal(payload.replyToken, 'fixture-' + index);
    assert.match(payload.messages[0].text, /已停用.*沒有變更課表/);
  });
}

verifyRetiredPostbacks().then(() => console.log('classroom retirement regression PASS'))
  .catch((error) => { console.error(error.message); process.exitCode = 1; });
