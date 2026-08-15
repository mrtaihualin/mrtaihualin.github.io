#!/usr/bin/env node
'use strict';

const assert = require('assert');
const {
  isAllowed,
  normalizePattern,
  parsePullRequestBody,
  pathsFromNameStatus,
  pathsFromPullRequestBatch,
  validateTaskContract,
} = require('./check-task-write-set');

assert.strictEqual(isAllowed('scripts/check-site.js', ['scripts/check-site.js']), true);
assert.strictEqual(isAllowed('scripts/tests/example.js', ['scripts/**']), true);
assert.strictEqual(isAllowed('README.md', ['scripts/**']), false);
assert.throws(() => normalizePattern('**'), /กว้างทั้ง repository/);
assert.throws(() => normalizePattern('scripts/*.js'), /รองรับเฉพาะ/);
assert.throws(() => normalizePattern('../outside'), /ไม่ใช่ repository-relative/);
assert.deepStrictEqual(
  pathsFromNameStatus('R100\0outside.txt\0inside.txt\0D\0deleted.txt\0'),
  ['outside.txt', 'inside.txt', 'deleted.txt'],
);
assert.throws(
  () => validateTaskContract('AE-RENAME', ['inside.txt'], pathsFromNameStatus('R100\0outside.txt\0inside.txt\0')),
  /outside\.txt/,
);
assert.deepStrictEqual(
  pathsFromPullRequestBatch([{ filename: 'inside.txt', previous_filename: 'outside.txt' }]),
  ['outside.txt', 'inside.txt'],
);

const contract = parsePullRequestBody(`
Task-ID: AE-2026-08-15
Write-Set:
- \`.github/workflows/required-checks.yml\`
- scripts/**

Summary: automation enforcement
`);
assert.deepStrictEqual(contract, {
  taskId: 'AE-2026-08-15',
  writeSet: ['.github/workflows/required-checks.yml', 'scripts/**'],
});

assert.deepStrictEqual(
  validateTaskContract(contract.taskId, contract.writeSet, [
    '.github/workflows/required-checks.yml',
    'scripts/check-task-write-set.js',
  ]),
  { taskId: 'AE-2026-08-15', patterns: contract.writeSet, files: 2 },
);
assert.throws(
  () => validateTaskContract(contract.taskId, contract.writeSet, ['README.md']),
  /พบไฟล์นอก Write-Set/,
);
assert.throws(() => validateTaskContract('', ['README.md'], ['README.md']), /Task-ID/);
assert.throws(() => validateTaskContract('AE-1', [], []), /อย่างน้อย 1 path/);

console.log('✓ task Write-Set enforcement tests');
