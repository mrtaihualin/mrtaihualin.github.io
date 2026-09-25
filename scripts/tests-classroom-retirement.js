// Regression contract for Classroom request retirement. Keep the add-class lane live.
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');
const { pathToFileURL } = require('url');
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const html = read('classroom/index.html');
const student = read('js/classroom/student-requests.js');
const teacher = read('js/classroom/teacher-request-admin.js');
const scheduling = read('js/classroom/add-class-scheduling.js');
const operations = read('js/classroom/teacher-operations.js');
const webhook = read('supabase/functions/line-webhook/index.ts');
const notifyLine = read('supabase/functions/notify-line/index.ts');
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
assert.match(webhook, /forwardLineEventToSocialInbox\(\s*fetch, SOCIAL_INBOX_WEBHOOK_URL, rawBody, sig/);
assert.doesNotMatch(notifyLine, /gentle-moxie-bf64ad\.netlify\.app/);
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
  const { forwardLineEventToSocialInbox } = await import(pathToFileURL(path.join(root, 'supabase/functions/_shared/line-social-inbox-forward.mjs')).href);
  const actions = [
    'accept_offer', 'decline_offer', 'confirm_reschedule_move',
    'confirm_reschedule_pick', 'ack_teacher_cancel', 'confirm_cancel_delete',
  ];
  let handler;
  const requests = [];
  const backgroundWork = [];
  let inboxUnavailable = false;
  const context = {
    serve: (fn) => { handler = fn; },
    createClient: () => ({ from: () => { throw new Error('retired postback queried database'); } }),
    forwardLineEventToSocialInbox,
    EdgeRuntime: { waitUntil: (promise) => backgroundWork.push(promise) },
    Deno: { env: { get: (name) => name === 'LINE_CHANNEL_ACCESS_TOKEN' || name === 'LINE_CHANNEL_SECRET' ? 'fixture-value' : '' } },
    fetch: async (url, options) => {
      requests.push({ url, options });
      return url === 'https://line-hook.mrtaihualin.com/webhooks/line' && inboxUnavailable
        ? { ok: false, status: 503 }
        : { ok: true, status: 200 };
    },
    Response,
    URLSearchParams,
    console: { log: () => {}, warn: () => {}, error: () => {} },
  };
  const runnable = webhook
    .replace(/^import \{ serve \}.*\n/m, '')
    .replace(/^import \{ createClient \}.*\n/m, '')
    .replace(/^import \{ forwardLineEventToSocialInbox \}.*\n/m, '')
    .replace(/^import \{[\s\S]*?\} from '\.\.\/_shared\/calendar-reliability\.mjs';\n/m, '');
  vm.runInNewContext(runnable, context);
  context.verifySignature = async () => true;
  const rawBody = JSON.stringify({ events: actions.map((action, index) => ({
    type: 'postback', replyToken: 'fixture-' + index,
    postback: { data: 'action=' + action + '&request=old-id' },
  })) });
  const response = await handler({
    method: 'POST', headers: { get: () => 'fixture-signature' },
    text: async () => rawBody,
  });
  await Promise.all(backgroundWork);
  assert.equal(response.status, 200);
  const inboxRequests = requests.filter(({ url }) => url === 'https://line-hook.mrtaihualin.com/webhooks/line');
  assert.equal(inboxRequests.length, 1, 'signed LINE payload is forwarded once to Social Inbox');
  assert.equal(inboxRequests[0].options.body, rawBody);
  assert.equal(inboxRequests[0].options.headers['X-Line-Signature'], 'fixture-signature');
  const replyRequests = requests.filter(({ url }) => url === 'https://api.line.me/v2/bot/message/reply');
  assert.equal(replyRequests.length, actions.length);
  replyRequests.forEach(({ url, options }, index) => {
    assert.equal(url, 'https://api.line.me/v2/bot/message/reply');
    const payload = JSON.parse(options.body);
    assert.equal(payload.replyToken, 'fixture-' + index);
    assert.match(payload.messages[0].text, /已停用.*沒有變更課表/);
  });
  context.verifySignature = async () => false;
  const rejected = await handler({
    method: 'POST', headers: { get: () => 'bad-signature' }, text: async () => rawBody,
  });
  assert.equal(rejected.status, 401);
  assert.equal(requests.length, 1 + actions.length, 'invalid signature causes no forwarding or replies');
  context.verifySignature = async () => true;
  inboxUnavailable = true;
  const stillProcessed = await handler({
    method: 'POST', headers: { get: () => 'fixture-signature' },
    text: async () => JSON.stringify({ events: [] }),
  });
  await Promise.all(backgroundWork);
  assert.equal(stillProcessed.status, 200, 'Social Inbox failure does not block the Classroom webhook');
}

verifyRetiredPostbacks().then(() => console.log('classroom retirement regression PASS'))
  .catch((error) => { console.error(error.message); process.exitCode = 1; });
