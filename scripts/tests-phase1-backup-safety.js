#!/usr/bin/env node

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.resolve(__dirname, '..');
const {
  isManagedBackupName,
  parseBackupOnly,
  parseRetentionDays,
  uploadAndRotate,
} = require(path.join(root, 'scripts/backup/upload-and-rotate.js'));

let passed = 0;
let failed = 0;

async function check(label, fn) {
  try {
    await fn();
    passed += 1;
    console.log('PASS ' + label);
  } catch (err) {
    failed += 1;
    console.error('FAIL ' + label + ': ' + (err && err.stack ? err.stack : err));
  }
}

function makeDrive({ localSize, localMd5, pages = [[]], verify = {}, listError = null }) {
  const calls = { create: [], get: [], list: [], delete: [] };
  return {
    calls,
    files: {
      async create(args) {
        calls.create.push(args);
        await new Promise((resolve, reject) => {
          args.media.body.on('error', reject);
          args.media.body.on('end', resolve);
          args.media.body.resume();
        });
        return { data: { id: 'new-id' } };
      },
      async get(args) {
        calls.get.push(args);
        if (verify.error) throw verify.error;
        return {
          data: {
            id: 'new-id',
            size: String(verify.size == null ? localSize : verify.size),
            md5Checksum: verify.md5 == null ? localMd5 : verify.md5,
          },
        };
      },
      async list(args) {
        calls.list.push(args);
        if (listError) throw listError;
        const index = calls.list.length - 1;
        return {
          data: {
            files: pages[index] || [],
            nextPageToken: index + 1 < pages.length ? 'page-' + (index + 2) : undefined,
          },
        };
      },
      async delete(args) {
        calls.delete.push(args);
        return { data: {} };
      },
    },
  };
}

(async () => {
  await check('managed backup name accepts only encrypted timestamped artifacts', () => {
    assert.strictEqual(isManagedBackupName('backup_2026-08-17_0315-th.tar.gz.gpg'), true);
    for (const name of [
      'backup_2026-08-17_0315-th.tar.gz',
      'notes.txt',
      'backup_old.tar.gz.gpg',
      '../backup_2026-08-17_0315-th.tar.gz.gpg',
      'backup_2026-08-17_0315-th.tar.gz.gpg.tmp',
    ]) {
      assert.strictEqual(isManagedBackupName(name), false, name);
    }
  });

  await check('retention days accepts bounded integers only', () => {
    assert.strictEqual(parseRetentionDays(undefined), 30);
    assert.strictEqual(parseRetentionDays('1'), 1);
    assert.strictEqual(parseRetentionDays('3650'), 3650);
    for (const value of ['0', '-1', '1.5', 'thirty', '3651', '']) {
      assert.throws(() => parseRetentionDays(value), /RETENTION_DAYS/);
    }
  });

  await check('backup-only accepts an explicit boolean string only', () => {
    assert.strictEqual(parseBackupOnly(undefined), true);
    assert.strictEqual(parseBackupOnly('false'), false);
    assert.strictEqual(parseBackupOnly('TRUE'), true);
    for (const value of ['1', 'yes', 'no', '']) {
      assert.throws(() => parseBackupOnly(value), /BACKUP_ONLY/);
    }
  });

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'phase1-backup-safety-'));
  const filePath = path.join(tempDir, 'backup_2026-08-17_0315-th.tar.gz.gpg');
  const content = Buffer.alloc(512, 0x5a);
  fs.writeFileSync(filePath, content);
  const localMd5 = crypto.createHash('md5').update(content).digest('hex');
  const localSize = content.length;
  const now = Date.parse('2026-08-17T12:00:00Z');
  const old = '2026-07-01T00:00:00Z';
  const recent = '2026-08-16T00:00:00Z';

  try {
    await check('verified upload paginates and deletes only old managed encrypted backups', async () => {
      const drive = makeDrive({
        localSize,
        localMd5,
        pages: [
          [
            { id: 'old-1', name: 'backup_2026-07-01_0300-th.tar.gz.gpg', createdTime: old },
            { id: 'plain-old', name: 'backup_2026-07-01_0300-th.tar.gz', createdTime: old },
            { id: 'unrelated-old', name: 'family-photo.jpg', createdTime: old },
            { id: 'recent', name: 'backup_2026-08-16_0300-th.tar.gz.gpg', createdTime: recent },
          ],
          [
            { id: 'old-2', name: 'backup_2026-06-30_0300-th.tar.gz.gpg', createdTime: old },
            { id: 'new-id', name: 'backup_2026-08-17_0315-th.tar.gz.gpg', createdTime: old },
            { id: 'bad-time', name: 'backup_2026-06-29_0300-th.tar.gz.gpg', createdTime: 'invalid' },
          ],
        ],
      });
      const result = await uploadAndRotate({
        drive,
        filePath,
        folderId: 'folder-id',
        retentionDays: 30,
        now,
        logger: { log() {}, error() {} },
      });
      assert.deepStrictEqual(result, {
        uploadedId: 'new-id', uploaded: true, retentionComplete: true, deletedCount: 2,
      });
      assert.strictEqual(drive.calls.list.length, 2);
      assert.strictEqual(drive.calls.list[1].pageToken, 'page-2');
      assert.match(drive.calls.list[0].fields, /nextPageToken/);
      assert.deepStrictEqual(drive.calls.delete.map((call) => call.fileId), ['old-1', 'old-2']);
      assert.match(drive.calls.get[0].fields, /md5Checksum/);
    });

    await check('backup-only verified upload never lists or deletes Drive files', async () => {
      const drive = makeDrive({ localSize, localMd5 });
      const result = await uploadAndRotate({
        drive,
        filePath,
        folderId: 'folder-id',
        retentionDays: 30,
        backupOnly: true,
        logger: { log() {}, error() {} },
      });
      assert.deepStrictEqual(result, {
        uploadedId: 'new-id',
        uploaded: true,
        retentionComplete: false,
        deletedCount: 0,
        backupOnly: true,
      });
      assert.strictEqual(drive.calls.create.length, 1);
      assert.strictEqual(drive.calls.get.length, 1);
      assert.strictEqual(drive.calls.list.length, 0);
      assert.strictEqual(drive.calls.delete.length, 0);
    });

    await check('backup-only checksum failure never deletes the new Drive file', async () => {
      const drive = makeDrive({ localSize, localMd5, verify: { md5: '0'.repeat(32) } });
      await assert.rejects(
        uploadAndRotate({
          drive,
          filePath,
          folderId: 'folder-id',
          retentionDays: 30,
          backupOnly: true,
          logger: { log() {}, error() {} },
        }),
        /ไม่ตรงกับต้นทาง/
      );
      assert.strictEqual(drive.calls.list.length, 0);
      assert.strictEqual(drive.calls.delete.length, 0);
    });

    await check('backup-only verification lookup failure never deletes the new Drive file', async () => {
      const drive = makeDrive({ localSize, localMd5, verify: { error: new Error('verify unavailable') } });
      await assert.rejects(
        uploadAndRotate({
          drive,
          filePath,
          folderId: 'folder-id',
          retentionDays: 30,
          backupOnly: true,
          logger: { log() {}, error() {} },
        }),
        /ตรวจสอบไฟล์บน Drive ไม่สำเร็จ/
      );
      assert.strictEqual(drive.calls.list.length, 0);
      assert.strictEqual(drive.calls.delete.length, 0);
    });

    await check('checksum mismatch deletes only the new incomplete upload and aborts retention', async () => {
      const drive = makeDrive({ localSize, localMd5, verify: { md5: '0'.repeat(32) } });
      await assert.rejects(
        uploadAndRotate({
          drive, filePath, folderId: 'folder-id', retentionDays: 30,
          logger: { log() {}, error() {} },
        }),
        /ไม่ตรงกับต้นทาง/
      );
      assert.deepStrictEqual(drive.calls.delete.map((call) => call.fileId), ['new-id']);
      assert.strictEqual(drive.calls.list.length, 0);
    });

    await check('size mismatch deletes only the new incomplete upload and aborts retention', async () => {
      const drive = makeDrive({ localSize, localMd5, verify: { size: localSize - 1 } });
      await assert.rejects(
        uploadAndRotate({
          drive, filePath, folderId: 'folder-id', retentionDays: 30,
          logger: { log() {}, error() {} },
        }),
        /ไม่ตรงกับต้นทาง/
      );
      assert.deepStrictEqual(drive.calls.delete.map((call) => call.fileId), ['new-id']);
      assert.strictEqual(drive.calls.list.length, 0);
    });

    await check('verification lookup failure removes the new unverifiable upload', async () => {
      const drive = makeDrive({ localSize, localMd5, verify: { error: new Error('verify unavailable') } });
      await assert.rejects(
        uploadAndRotate({
          drive, filePath, folderId: 'folder-id', retentionDays: 30,
          logger: { log() {}, error() {} },
        }),
        /ตรวจสอบไฟล์บน Drive ไม่สำเร็จ/
      );
      assert.deepStrictEqual(drive.calls.delete.map((call) => call.fileId), ['new-id']);
    });

    await check('retention listing failure preserves the verified new backup and reports partial cleanup', async () => {
      const drive = makeDrive({ localSize, localMd5, listError: new Error('list unavailable') });
      const result = await uploadAndRotate({
        drive, filePath, folderId: 'folder-id', retentionDays: 30,
        logger: { log() {}, error() {} },
      });
      assert.deepStrictEqual(result, {
        uploadedId: 'new-id', uploaded: true, retentionComplete: false, deletedCount: 0,
      });
      assert.deepStrictEqual(drive.calls.delete, []);
    });

    await check('plaintext backup is rejected before any Drive mutation', async () => {
      const plainPath = path.join(tempDir, 'backup_2026-08-17_0315-th.tar.gz');
      fs.writeFileSync(plainPath, content);
      const drive = makeDrive({ localSize, localMd5 });
      await assert.rejects(
        uploadAndRotate({
          drive, filePath: plainPath, folderId: 'folder-id', retentionDays: 30,
          logger: { log() {}, error() {} },
        }),
        /encrypted managed backup/
      );
      assert.strictEqual(drive.calls.create.length, 0);
      assert.strictEqual(drive.calls.delete.length, 0);
    });

    await check('workflow fails closed when encryption secret is missing', () => {
      const workflow = fs.readFileSync(
        path.join(root, '.github/workflows/backup-database-to-drive.yml'), 'utf8'
      );
      const guard = workflow.indexOf('if [ -z "${PASSPHRASE:-}" ]');
      const archive = workflow.indexOf('tar -czf "$ARCHIVE"');
      const upload = workflow.indexOf('node scripts/backup/upload-and-rotate.js');
      assert.ok(guard >= 0 && guard < archive && archive < upload);
      assert.ok(workflow.includes('BACKUP_ENCRYPT_PASSPHRASE'));
      assert.ok(!workflow.includes('ไม่ได้เข้ารหัส'));
      assert.ok(!workflow.includes('FINAL_FILE=backup_${STAMP}.tar.gz"'));
    });

    await check('manual workflow is hard-bound to no-delete backup-only with encrypted archive verification', () => {
      const workflow = fs.readFileSync(
        path.join(root, '.github/workflows/backup-database-to-drive.yml'), 'utf8'
      );
      assert.ok(workflow.includes(
        "BACKUP_ONLY: ${{ github.event_name == 'workflow_dispatch' && 'true' || 'false' }}"
      ));
      assert.ok(workflow.includes('--output "$VERIFY_DIR/verify.tar.gz" --decrypt "$ENCRYPTED"'));
      assert.ok(workflow.includes('gzip -t "$VERIFY_DIR/verify.tar.gz"'));
      assert.ok(workflow.includes('EXPECTED=(roles.sql schema.sql data.sql)'));
      assert.ok(workflow.includes('SOURCE_HASH=$(sha256sum "dump/${EXPECTED[$i]}"'));
      assert.ok(workflow.includes('ARCHIVE_HASH=$(tar -xOzf "$VERIFY_DIR/verify.tar.gz"'));
    });
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }

  console.log(`Phase 1 backup safety: ${passed} passed, ${failed} failed`);
  if (failed) process.exitCode = 1;
})();
