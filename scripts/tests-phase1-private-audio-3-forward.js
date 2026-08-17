#!/usr/bin/env node
'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const forward = require('./phase1-private-audio-3-forward');

const root = path.resolve(__dirname, '..');

function digest(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

async function run() {
  const plan = forward.validateSources();
  assert.strictEqual(plan.projectRef, 'qzkxlhpcputsvbqmtqfi');
  assert.strictEqual(plan.projectUrl, 'https://qzkxlhpcputsvbqmtqfi.supabase.co');
  assert.strictEqual(plan.bucket, 'game-audio-private');
  assert.strictEqual(plan.mutation, 'NONE');
  assert.strictEqual(plan.objects.length, 3);
  assert.strictEqual(new Set(plan.objects.map((item) => item.text)).size, 3);
  assert.strictEqual(new Set(plan.objects.map((item) => item.localPath)).size, 3);
  assert.strictEqual(new Set(plan.objects.map((item) => item.objectPath)).size, 3);
  assert.strictEqual(new Set(plan.objects.map((item) => item.textHash)).size, 3);
  assert.deepStrictEqual(plan.objects.map((item) => item.bytes), [20942, 23031, 23867]);
  assert.deepStrictEqual(plan.objects.map((item) => item.sha256), [
    'c6d438638609f7f46deb3b475b9ff280f456ace4868a00e6270387bba0cbb857',
    'e4ffd07b5379b9ea498130dd2b4c78abcfb99a0a8ecc8a2822544df850b35423',
    '971ce282c312607799912e05577e1ad01824dbaf9008bc375f0344d66b8f5673',
  ]);
  plan.objects.forEach((item) => {
    assert.strictEqual(item.contentType, 'audio/mpeg');
    assert.strictEqual(item.upsert, false);
    const body = fs.readFileSync(path.join(root, item.localPath));
    assert.strictEqual(body.length, item.bytes);
    assert.strictEqual(digest(body), item.sha256);
    assert.strictEqual(path.posix.basename(item.objectPath, '.mp3'), item.textHash);
  });

  const dryLogs = [];
  const dryPlan = await forward.main([], {}, {
    log: (line) => dryLogs.push(line),
    fetchImpl: async () => {
      throw new Error('dry-run must not use the network');
    },
  });
  assert.strictEqual(dryPlan.mutation, 'NONE');
  assert.strictEqual(dryLogs.length, 1);
  assert.match(dryLogs[0], /"mode": "DRY_RUN"/);

  const maskedKey = ['masked', 'test', 'key'].join('-');
  await assert.rejects(
    forward.main(['--apply-storage-upload'], {}, { log: () => {} }),
    /supported modes/
  );
  await assert.rejects(
    forward.main(['--apply-storage-upload', '--confirm=PRIVATE_AUDIO_3'], {
      SUPABASE_URL: 'https://wrong-project.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: maskedKey,
    }, { log: () => {}, fetchImpl: async () => ({ ok: true, status: 200 }) }),
    /does not match the locked PRIVATE_AUDIO_3 target/
  );
  await assert.rejects(
    forward.main(['--apply-storage-upload', '--confirm=PRIVATE_AUDIO_3'], {
      SUPABASE_URL: forward.PROJECT_URL,
    }, { log: () => {}, fetchImpl: async () => ({ ok: true, status: 200 }) }),
    /SUPABASE_SERVICE_ROLE_KEY is required/
  );

  const calls = [];
  const applyLogs = [];
  const result = await forward.main(
    ['--confirm=PRIVATE_AUDIO_3', '--apply-storage-upload'],
    { SUPABASE_URL: forward.PROJECT_URL + '/', SUPABASE_SERVICE_ROLE_KEY: maskedKey },
    {
      log: (line) => applyLogs.push(line),
      fetchImpl: async (url, options) => {
        calls.push({ url, options });
        return { ok: true, status: 200 };
      },
    }
  );
  assert.strictEqual(result.mode, 'APPLY_STORAGE_UPLOAD');
  assert.strictEqual(result.upsert, false);
  assert.deepStrictEqual(result.uploaded, forward.OBJECTS.map((item) => item.objectPath));
  assert.strictEqual(calls.length, 3);
  calls.forEach((call, index) => {
    const item = forward.OBJECTS[index];
    assert.strictEqual(
      call.url,
      forward.PROJECT_URL + '/storage/v1/object/game-audio-private/' + item.objectPath
    );
    assert.strictEqual(call.options.method, 'POST');
    assert.strictEqual(call.options.headers.apikey, maskedKey);
    assert.strictEqual(call.options.headers.Authorization, 'Bearer ' + maskedKey);
    assert.strictEqual(call.options.headers['Content-Type'], 'audio/mpeg');
    assert.strictEqual(call.options.headers['x-upsert'], 'false');
    assert.notStrictEqual(call.options.headers['x-upsert'], 'true');
    assert.ok(Buffer.isBuffer(call.options.body));
    assert.strictEqual(call.options.body.length, item.bytes);
    assert.strictEqual(digest(call.options.body), item.sha256);
    assert.doesNotMatch(call.url, /\/rest\/v1\//);
  });
  assert.strictEqual(applyLogs.length, 1);
  assert.doesNotMatch(applyLogs[0], new RegExp(maskedKey));

  const failureCalls = [];
  await assert.rejects(
    forward.uploadObjects(forward.PROJECT_URL, maskedKey, async (url) => {
      failureCalls.push(url);
      return { ok: failureCalls.length !== 2, status: failureCalls.length === 2 ? 409 : 200 };
    }),
    (error) => {
      assert.match(error.message, /HTTP 409/);
      assert.match(error.message, /uploaded before failure: 1/);
      assert.deepStrictEqual(error.uploadedObjectPaths, [forward.OBJECTS[0].objectPath]);
      return true;
    }
  );
  assert.strictEqual(failureCalls.length, 2, 'uploader must stop before the third object after a failure');

  const source = fs.readFileSync(path.join(__dirname, 'phase1-private-audio-3-forward.js'), 'utf8');
  assert.doesNotMatch(source, /x-upsert['"]?\s*:\s*['"]true['"]/i);
  assert.doesNotMatch(source, /storage\.objects/i);
  assert.doesNotMatch(source, /\/rest\/v1\//i);
  assert.doesNotMatch(source, /migrate-game-audio-private/i);
  assert.doesNotMatch(source, /\b(?:insert|update|delete|alter|create|drop)\s+(?:into\s+|from\s+)?storage\./i);

  console.log('PASS PRIVATE_AUDIO_3 forward: exact 3 objects / locked project / upsert=false / mock-only regression');
}

run().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
