#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const recovery = require('./phase1-private-audio-3-recovery');

const root = path.resolve(__dirname, '..');

async function run() {
  const plan = recovery.validateSources();
  assert.strictEqual(plan.bucket, 'game-audio-private');
  assert.strictEqual(plan.objectPaths.length, 3);
  assert.strictEqual(new Set(plan.objectPaths).size, 3);
  assert.strictEqual(plan.metadataRowsMaximum, 6);
  assert.deepStrictEqual(plan.order, ['metadata_sql', 'storage_api_delete', 'storage_absence_postcheck']);
  assert.strictEqual(recovery.FORWARD_HASHES.length, 3);
  assert.strictEqual(recovery.LEGACY_HASHES.length, 3);
  assert.strictEqual(new Set(recovery.FORWARD_HASHES.concat(recovery.LEGACY_HASHES)).size, 6);

  const metadataSql = fs.readFileSync(path.join(root, recovery.METADATA_SQL), 'utf8');
  assert.match(metadataSql, /SOURCE ONLY \/ HIGH-RISK PRODUCTION ACTION/);
  assert.match(metadataSql, /update public\.audio_assets/);
  assert.match(metadataSql, /delete from public\.audio_assets/);
  assert.doesNotMatch(metadataSql, /insert into public\.audio_assets/i);
  assert.doesNotMatch(metadataSql, /\bstorage\.objects\b/i);
  assert.doesNotMatch(metadataSql, /\b(?:insert|update|delete)\s+(?:into\s+|from\s+)?storage\./i);
  assert.doesNotMatch(metadataSql, /alter table|create policy|drop policy|storage\.buckets/i);
  recovery.FORWARD_HASHES.concat(recovery.LEGACY_HASHES).forEach((hash) => assert.ok(metadataSql.includes(hash)));

  const calls = [];
  const fetchDelete = async (url, options) => {
    calls.push({ url, options });
    return { ok: true, status: 200, json: async () => [] };
  };
  await recovery.removeObjects(recovery.PROJECT_URL + '/', 'masked-test-key', fetchDelete);
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0].url, recovery.PROJECT_URL + '/storage/v1/object/game-audio-private');
  assert.strictEqual(calls[0].options.method, 'DELETE');
  assert.deepStrictEqual(JSON.parse(calls[0].options.body), { prefixes: recovery.OBJECT_PATHS });
  assert.strictEqual(calls[0].options.headers.apikey, 'masked-test-key');

  const listCalls = [];
  const fetchAbsent = async (url, options) => {
    listCalls.push({ url, options });
    return { ok: true, status: 200, json: async () => [] };
  };
  const absent = await recovery.verifyObjectsAbsent(recovery.PROJECT_URL, 'masked-test-key', fetchAbsent);
  assert.strictEqual(absent.length, 3);
  assert.strictEqual(listCalls.length, 3);
  listCalls.forEach((call) => {
    assert.strictEqual(call.url, recovery.PROJECT_URL + '/storage/v1/object/list/game-audio-private');
    assert.strictEqual(call.options.method, 'POST');
    const body = JSON.parse(call.options.body);
    assert.strictEqual(body.limit, 100);
    assert.ok(body.prefix.startsWith('sentences/th/google-chirp3hd/'));
    assert.ok(body.search.endsWith('.mp3'));
  });

  await assert.rejects(
    recovery.verifyObjectsAbsent(recovery.PROJECT_URL, 'masked-test-key', async (_url, options) => ({
      ok: true,
      status: 200,
      json: async () => [{ name: JSON.parse(options.body).search }],
    })),
    /absence postcheck failed/
  );

  await assert.rejects(
    recovery.removeObjects('https://wrong-project.supabase.co', 'masked-test-key', fetchDelete),
    /does not match the locked PRIVATE_AUDIO_3 target/
  );

  console.log('PASS PRIVATE_AUDIO_3 recovery: exact 3 objects / maximum 6 metadata rows / Storage API only');
}

run().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
