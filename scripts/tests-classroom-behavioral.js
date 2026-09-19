// Classroom request retirement behavior: old rows stay invisible while add-class works.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.resolve(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');

async function run() {
  const elements = {
    nextClassInfo: { innerHTML: '' },
    pendingRequestCard: { innerHTML: '', nextSibling: null },
  };
  elements.pendingRequestCard.parentNode = {
    insertBefore(node) { elements[node.id] = node; },
  };
  const rpcCalls = [];
  let scheduleRows = [{ lesson_date: '2030-01-01', start_time: '10:00', end_time: '11:00' }];
  const student = {
    document: {
      getElementById: (id) => elements[id] || null,
      createElement: () => ({ id: '', innerHTML: '' }),
    },
    window: {},
    sb: { rpc: async (name, args) => {
      rpcCalls.push({ name, args });
      if (name === 'get_student_schedule') return { data: scheduleRows, error: null };
      if (name === 'student_get_own_requests') return { data: [
        { id: 'add-one', token: 'student', request_type: 'add_class', initiated_by: 'student', requested_date: '2030-01-02', requested_time: '12:00', created_at: new Date().toISOString() },
        { id: 'old-cancel', token: 'student', request_type: 'cancel', initiated_by: 'student', created_at: new Date().toISOString() },
      ], error: null };
      throw new Error('unexpected RPC ' + name);
    } },
    studentsCache: { student: { name: 'Test' } },
    escHtml: (s) => String(s),
    teacherTimeToDate: (d, t) => new Date(d + 'T' + t + ':00+07:00'),
    TEACHER_TZ: 'Asia/Bangkok',
    console,
    Date,
  };
  vm.runInNewContext(read('js/classroom/student-requests.js'), student);
  await student.loadStudentNextClass('student');
  assert.match(elements.nextClassInfo.innerHTML, /聯絡老師/);
  assert.match(elements.nextClassInfo.innerHTML, /申請加課/);
  assert.doesNotMatch(elements.nextClassInfo.innerHTML, /取消課堂|申請改期/);
  scheduleRows = [];
  await student.loadStudentNextClass('student');
  assert.match(elements.nextClassInfo.innerHTML, /聯絡老師/);
  assert.match(elements.nextClassInfo.innerHTML, /申請加課/);
  await student.loadStudentPendingRequestStatus('student');
  assert.equal(elements.pendingRequestCard.innerHTML, '');
  assert.match(elements.pendingAddRequestCard.innerHTML, /加課申請處理中/);
  assert.match(elements.pendingAddRequestCard.innerHTML, /add-one/);
  assert.doesNotMatch(elements.pendingAddRequestCard.innerHTML, /old-cancel/);
  assert.equal(rpcCalls.find((x) => x.name === 'student_get_own_requests').args.p_request_type, 'add_class');
  assert.ok(rpcCalls.every((x) => x.name.startsWith('get_') || x.name.startsWith('student_get_')));

  let rosterRefreshes = 0;
  let teacherRows = [
    { id: 'add-one', token: 'student', request_type: 'add_class', student_name: 'Test', requested_date: '2030-01-02', requested_time: '12:00' },
    { id: 'old-cancel', token: 'student', request_type: 'cancel', student_name: 'Test' },
  ];
  const teacher = {
    window: {},
    sb: { from: (table) => {
      assert.equal(table, 'classroom_requests');
      const query = { select: () => query, eq: (column, value) => { if (column === 'request_type') assert.equal(value, 'add_class'); return query; },
        order: async () => ({ data: teacherRows, error: null }) };
      return query;
    } },
    refreshAllRosterMeta: () => { rosterRefreshes++; },
    currentTeacherPanelToken: null,
    escHtml: (s) => String(s),
    console,
    Date,
  };
  vm.runInNewContext(read('js/classroom/teacher-request-admin.js'), teacher);
  await teacher.loadPendingClassRequests();
  assert.equal(rosterRefreshes, 1);
  assert.equal(teacher.window._pendingRequestsByToken.student.length, 1);
  assert.equal(teacher.window._pendingRequestsByToken.student[0].type, 'add_class');
  assert.equal(teacher.window._classRequestCache['old-cancel'], undefined);
  assert.match(teacher.window._pendingRequestsByToken.student[0].html, /handleAddClassRequest/);
  assert.match(teacher.window._pendingRequestsByToken.student[0].html, /closeAddRequestAfterContact/);
  teacherRows = [{ ...teacherRows[0], processing_started_at: new Date().toISOString() }];
  await teacher.loadPendingClassRequests();
  assert.doesNotMatch(teacher.window._pendingRequestsByToken.student[0].html, /unlockStuckRequest/);
  teacherRows = [{ ...teacherRows[0], processing_started_at: new Date(Date.now() - 11 * 60000).toISOString() }];
  await teacher.loadPendingClassRequests();
  assert.match(teacher.window._pendingRequestsByToken.student[0].html, /unlockStuckRequest/);

  const teacherSource = read('js/classroom/teacher-request-admin.js');
  const addLock = teacherSource.slice(teacherSource.indexOf('async function claimAddClassRequest('), teacherSource.indexOf('async function unlockStuckRequest('));
  assert.ok(addLock.includes(".is('processing_started_at', null)"), 'add-class cannot steal an existing lock');
  const webhook = read('supabase/functions/line-webhook/index.ts');
  assert.ok(webhook.includes("action === 'confirm_add_class'"));
  assert.ok(webhook.includes('checkFreebusyConflictService'));
  assert.ok(webhook.includes('createCalendarEventById'));
  assert.ok(webhook.includes('RETIRED_CLASSROOM_POSTBACKS.has(action'));
  assert.ok(read('js/classroom/teacher-operations.js').includes('async function approveSlip('));
  assert.ok(read('js/classroom/teacher-operations.js').includes('function setRruleUntil('));
  console.log('classroom behavioral PASS');
}
run().catch((error) => { console.error(error.message); process.exitCode = 1; });
