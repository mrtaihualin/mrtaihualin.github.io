#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const ci = fs.readFileSync(path.join(root, '.gitlab-ci.yml'), 'utf8');
const runner = fs.readFileSync(path.join(root, 'scripts/backup/run-database-backup.sh'), 'utf8');
const uploadOnly = fs.readFileSync(path.join(root, 'scripts/backup/upload-only.js'), 'utf8');
const rotate = fs.readFileSync(path.join(root, 'scripts/backup/upload-and-rotate.js'), 'utf8');
const notify = fs.readFileSync(path.join(root, 'scripts/backup/notify-line.js'), 'utf8');

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

function section(source, startLabel, endLabel) {
  const start = source.indexOf(startLabel);
  const end = endLabel ? source.indexOf(endLabel, start + startLabel.length) : source.length;
  assert.ok(start >= 0 && end > start, `missing section ${startLabel}`);
  return source.slice(start, end);
}

check('retires the GitHub backup workflow', () => {
  assert.equal(fs.existsSync(path.join(root, '.github/workflows/backup-database-to-drive.yml')), false);
});

check('registers GitLab schedule and operations stage', () => {
  assert.ok(ci.includes('- operations'));
  assert.ok(ci.includes('CI_PIPELINE_SOURCE == "schedule"'));
});

check('keeps the full repository verifier out of scheduled backup pipelines', () => {
  const required = section(ci, 'required-tests-and-write-set:', '.production-backup-template:');
  assert.match(required, /CI_PIPELINE_SOURCE == "schedule"[\s\S]*?when: never/);
});

check('serializes Production backup jobs and disables interruption', () => {
  const template = section(ci, '.production-backup-template:', 'backup-production-manual:');
  assert.ok(template.includes('interruptible: false'));
  assert.ok(template.includes('resource_group: production-database-backup'));
  assert.ok(template.includes('needs: []'));
});

check('manual GitLab job is default-branch web-only and backup-only', () => {
  const manual = section(ci, 'backup-production-manual:', 'backup-production-scheduled:');
  assert.ok(manual.includes('CI_PIPELINE_SOURCE == "web"'));
  assert.ok(manual.includes('CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH'));
  assert.ok(manual.includes('when: manual'));
  assert.ok(manual.includes('manual_confirmation:'));
  assert.ok(manual.includes('run-database-backup.sh backup-only'));
});

check('scheduled job requires the dedicated schedule flag', () => {
  const scheduled = section(ci, 'backup-production-scheduled:');
  assert.ok(scheduled.includes('CI_PIPELINE_SOURCE == "schedule"'));
  assert.ok(scheduled.includes('CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH'));
  assert.ok(scheduled.includes('BACKUP_SCHEDULE == "true"'));
  assert.ok(scheduled.includes('run-database-backup.sh scheduled-rotate'));
});

check('installs and pins PostgreSQL client 17', () => {
  assert.ok(ci.includes('postgresql-client-17'));
  assert.ok(runner.includes('pg_bin="/usr/lib/postgresql/17/bin"'));
  assert.ok(runner.includes('"(PostgreSQL) 17."'));
});

check('hard-binds runtime mode to the GitLab pipeline source', () => {
  assert.match(runner, /backup-only\)[\s\S]*?CI_PIPELINE_SOURCE:-}" != "web"/);
  assert.match(runner, /scheduled-rotate\)[\s\S]*?CI_PIPELINE_SOURCE:-}" != "schedule"/);
  assert.ok(runner.includes('"${BACKUP_SCHEDULE:-}" != "true"'));
});

check('requires protected variables before the first Production dump', () => {
  const required = runner.indexOf('for variable_name in "${required_variables[@]}"');
  const firstDump = runner.indexOf('"$pg_bin/pg_dumpall" --roles-only');
  assert.ok(required >= 0 && firstDump > required);
});

check('locks the exact Production pooler target before reading', () => {
  const targetGuard = runner.indexOf('Production database target does not match the locked project');
  const firstDump = runner.indexOf('"$pg_bin/pg_dumpall" --roles-only');
  assert.ok(runner.includes('postgres.qzkxlhpcputsvbqmtqfi'));
  assert.ok(targetGuard >= 0 && firstDump > targetGuard);
});

check('uses only package-owned PostgreSQL 17 dump executables', () => {
  assert.ok(runner.includes('"$pg_bin/pg_dumpall" --roles-only'));
  assert.ok(runner.includes('"$pg_bin/pg_dump" --schema-only'));
  assert.ok(runner.includes('"$pg_bin/pg_dump" --data-only'));
  assert.ok(!/^\s*pg_dump(?:all)?(?:\s|$)/m.test(runner));
});

check('requires encryption and removes the plaintext archive before upload', () => {
  const encrypt = runner.indexOf('gpg --batch --yes --pinentry-mode loopback');
  const removePlaintext = runner.indexOf('rm -f -- "$archive_path"');
  const uploadOnlyCall = runner.indexOf('node scripts/backup/upload-only.js');
  assert.ok(runner.includes('BACKUP_ENCRYPT_PASSPHRASE'));
  assert.ok(encrypt >= 0 && removePlaintext > encrypt && uploadOnlyCall > removePlaintext);
});

check('manual upload performs one create then size and checksum verification', () => {
  const create = uploadOnly.indexOf('drive.files.create');
  const get = uploadOnly.indexOf('drive.files.get');
  const verify = uploadOnly.indexOf('remoteMd5 !== localMd5');
  assert.ok(create >= 0 && get > create && verify > get);
  assert.ok(uploadOnly.includes("fields: 'id,size,md5Checksum'"));
});

check('manual backup-only has no list, delete, retention, rotation, or LINE path', () => {
  assert.ok(!uploadOnly.includes('drive.files.list'));
  assert.ok(!uploadOnly.includes('drive.files.delete'));
  assert.ok(!uploadOnly.includes('RETENTION_DAYS'));
  const manualRuntime = section(runner, 'if [[ "$mode" == "backup-only" ]]', 'export RETENTION_DAYS=30');
  assert.ok(!manualRuntime.includes('upload-and-rotate.js'));
  assert.ok(!manualRuntime.includes('notify-line.js'));
});

check('scheduled rotation verifies checksum before listing or deleting', () => {
  const get = rotate.indexOf('drive.files.get');
  const checksum = rotate.indexOf('verifyRes.data.md5Checksum !== localMd5');
  const list = rotate.indexOf('drive.files.list');
  const remove = rotate.indexOf('drive.files.delete');
  assert.ok(get >= 0 && checksum > get && list > checksum && remove > checksum);
});

check('LINE notification contains no secret values and is schedule-only', () => {
  assert.ok(notify.includes('BACKUP_LINE_CHANNEL_ACCESS_TOKEN'));
  assert.ok(notify.includes('BACKUP_LINE_TEACHER_USER_ID'));
  assert.ok(!notify.includes('console.log(token'));
  assert.ok(!notify.includes('console.log(userId'));
  assert.match(runner, /scheduled-rotate\)[\s\S]*?trap notify_failure ERR/);
});

check('does not print secrets or the Drive folder identifier', () => {
  assert.ok(!runner.includes('set -x'));
  assert.ok(!runner.includes('printenv'));
  assert.ok(!/console\.(?:log|error)\([^)]*folderId/.test(rotate));
  assert.ok(!/console\.(?:log|error)\([^)]*folderId/.test(uploadOnly));
});

check('uses a private temporary directory and bounded cleanup', () => {
  assert.ok(runner.includes('umask 077'));
  assert.ok(runner.includes('backup_tmp_dir=$(mktemp -d)'));
  assert.ok(runner.includes('"$backup_tmp_dir" == /tmp/*'));
  assert.ok(runner.includes('rm -rf -- "$backup_tmp_dir"'));
});

if (!process.exitCode) {
  console.log(`\nGitLab backup migration safety: ${passed}/18 PASS`);
}
