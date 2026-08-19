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

if (!process.exitCode) {
  console.log(`\nBackup PostgreSQL runtime pin: ${passed}/8 PASS`);
}
