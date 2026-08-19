#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const workflow = fs.readFileSync(
  path.join(root, '.github/workflows/backup-database-to-drive.yml'),
  'utf8'
);

let passed = 0;

function check(label, test) {
  try {
    test();
    passed += 1;
    console.log(`PASS ${label}`);
  } catch (error) {
    console.error(`FAIL ${label}`);
    console.error(error.message);
    process.exitCode = 1;
  }
}

check('pins the package-owned PostgreSQL 17 binary directory', () => {
  assert.ok(workflow.includes('PG_BIN=/usr/lib/postgresql/17/bin'));
  assert.ok(workflow.includes('echo "PG_BIN=$PG_BIN" >> "$GITHUB_ENV"'));
});

check('fails closed when either pinned executable is missing', () => {
  assert.ok(workflow.includes('for tool in pg_dump pg_dumpall; do'));
  assert.ok(workflow.includes('if [ ! -x "${PG_BIN}/${tool}" ]; then'));
});

check('requires both pinned executables to report PostgreSQL 17.x', () => {
  assert.ok(workflow.includes('VERSION_OUTPUT=$("${PG_BIN}/${tool}" --version)'));
  assert.ok(workflow.includes('if [[ "$VERSION_OUTPUT" != *"(PostgreSQL) 17."* ]]'));
});

check('rechecks the pinned directory before the Production read', () => {
  const guard = workflow.indexOf('if [ "${PG_BIN:-}" != "/usr/lib/postgresql/17/bin" ]');
  const firstDump = workflow.indexOf('"${PG_BIN}/pg_dumpall" --roles-only');
  assert.ok(guard >= 0);
  assert.ok(firstDump > guard);
});

check('uses the pinned pg_dumpall executable for roles', () => {
  assert.ok(workflow.includes('"${PG_BIN}/pg_dumpall" --roles-only  -f dump/roles.sql'));
});

check('uses the pinned pg_dump executable for schema', () => {
  assert.ok(workflow.includes('"${PG_BIN}/pg_dump"    --schema-only -f dump/schema.sql'));
});

check('uses the pinned pg_dump executable for data', () => {
  assert.ok(workflow.includes('"${PG_BIN}/pg_dump"    --data-only   -f dump/data.sql'));
});

check('contains no PATH-dependent dump command', () => {
  assert.ok(!/^\s+pg_dump(?:all)?(?:\s|$)/m.test(workflow));
});

check('hard-binds manual dispatch to backup-only and schedule to rotation', () => {
  assert.ok(workflow.includes('case "${GITHUB_EVENT_NAME:-}" in'));
  assert.match(workflow, /workflow_dispatch\)\s+BACKUP_ONLY=true/);
  assert.match(workflow, /schedule\)\s+BACKUP_ONLY=false/);
  assert.ok(workflow.includes('echo "BACKUP_ONLY=$BACKUP_ONLY" >> "$GITHUB_ENV"'));
});

check('missing or ambiguous mode fails closed to backup-only', () => {
  assert.match(workflow, /\*\)\s+[\s\S]*?BACKUP_ONLY=true/);
  assert.ok(workflow.includes('MODE="${BACKUP_ONLY:-true}"'));
  assert.ok(workflow.includes('BACKUP_ONLY ไม่ชัดเจน'));
});

check('scheduled rotation requires both false mode and scheduled event', () => {
  const modeGuard = workflow.indexOf('if [ "$MODE" = "false" ]');
  const eventGuard = workflow.indexOf('if [ "${GITHUB_EVENT_NAME:-}" != "schedule" ]');
  const rotate = workflow.indexOf('node scripts/backup/upload-and-rotate.js');
  assert.ok(modeGuard >= 0 && eventGuard > modeGuard && rotate > eventGuard);
});

check('manual backup-only performs create then remote size and checksum verification', () => {
  const start = workflow.indexOf("node <<'BACKUP_ONLY_NODE'");
  const end = workflow.indexOf('\n          BACKUP_ONLY_NODE', start);
  assert.ok(start >= 0 && end > start);
  const manual = workflow.slice(start, end);
  const create = manual.indexOf('drive.files.create');
  const get = manual.indexOf('drive.files.get');
  const verify = manual.indexOf("remoteMd5 !== localMd5");
  assert.ok(create >= 0 && get > create && verify > get);
  assert.ok(manual.includes("fields: 'id,size,md5Checksum'"));
});

check('manual backup-only contains no Drive list, delete, or retention path', () => {
  const start = workflow.indexOf("node <<'BACKUP_ONLY_NODE'");
  const end = workflow.indexOf('\n          BACKUP_ONLY_NODE', start);
  const manual = workflow.slice(start, end);
  assert.ok(!manual.includes('drive.files.list'));
  assert.ok(!manual.includes('drive.files.delete'));
  assert.ok(!manual.includes('RETENTION_DAYS'));
  assert.ok(!manual.includes('upload-and-rotate.js'));
});

check('LINE notifications are schedule-only and require explicit rotation mode', () => {
  assert.ok(workflow.includes(
    "if: ${{ failure() && github.event_name == 'schedule' && env.BACKUP_ONLY == 'false' }}"
  ));
  assert.ok(workflow.includes(
    "if: ${{ success() && github.event_name == 'schedule' && env.BACKUP_ONLY == 'false' }}"
  ));
});

if (!process.exitCode) {
  console.log(`\nBackup PostgreSQL runtime pin/manual guard: ${passed}/14 PASS`);
}
