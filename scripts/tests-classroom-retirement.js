// Regression contract for Classroom request retirement. Keep the add-class lane live.
const fs = require('fs');
const path = require('path');
const assert = require('assert');
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
  assert.match(rpc, /Classroom cancel\/reschedule requests are retired/);
}

console.log('classroom retirement regression PASS');
