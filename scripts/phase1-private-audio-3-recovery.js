#!/usr/bin/env node
'use strict';

// PRIVATE_AUDIO_3 recovery helper. Default mode is deterministic/read-only.
// Production object deletion remains locked behind an exact confirmation.
// Metadata recovery stays in the reviewed SQL source below; this helper never
// writes public.audio_assets or storage metadata.

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const BUCKET = 'game-audio-private';
const CONFIRMATION = 'PRIVATE_AUDIO_3';
const PROJECT_URL = 'https://qzkxlhpcputsvbqmtqfi.supabase.co';
const METADATA_SQL = 'supabase/sql/2026-08-17_phase1_private_audio_3_recovery.sql';
const FORWARD_SQL = 'supabase/migrations/20260816131431_phase1_sentence_audio_exact_text_fix.sql';
const BUCKET_SQL = 'supabase/sql/2026-08-14_private_game_audio.sql';

const OBJECT_PATHS = Object.freeze([
  'sentences/th/google-chirp3hd/13/133e3ff63a47df9060618d6d28be8e1760389910531041b23313016333fa3883.mp3',
  'sentences/th/google-chirp3hd/86/86c510f76a50f1fc21b1bd4c2db9073c955d0decff0055c6d673b7cae89d6cba.mp3',
  'sentences/th/google-chirp3hd/81/814f261e277d95b2029ac97f69e64d820c4a2ca1bff9bfc3c08bcc1f168d89ca.mp3',
]);

const FORWARD_HASHES = Object.freeze(OBJECT_PATHS.map((item) => path.basename(item, '.mp3')));
const LEGACY_HASHES = Object.freeze([
  'b10b6562a52cb21557cee22a77c1088ec13bb793634985c7ea8dc8819cbecdb5',
  '6fb9042903b141f32e29772be134ecbce2ec8a8d72045f2e7f74f426c3caa172',
  'bec9003ffc07c92952f1ab7fbcd909cb1bec529cf4b56d0f8be61a69851be263',
]);

function read(relative) {
  return fs.readFileSync(path.join(ROOT, relative), 'utf8');
}

function validateSources() {
  const forward = read(FORWARD_SQL);
  const metadata = read(METADATA_SQL);
  const bucket = read(BUCKET_SQL);
  const sentenceSource = read('supabase/sql/2026-07-17_audio_assets_sentences_insert.sql');

  if (new Set(OBJECT_PATHS).size !== 3) throw new Error('PRIVATE_AUDIO_3 object scope must be exactly three unique paths');
  if (new Set(FORWARD_HASHES.concat(LEGACY_HASHES)).size !== 6) throw new Error('PRIVATE_AUDIO_3 metadata scope must be six unique hashes');
  OBJECT_PATHS.forEach((item) => {
    if (!forward.includes(item)) throw new Error('forward source no longer owns object path: ' + item);
  });
  FORWARD_HASHES.forEach((hash) => {
    if (!metadata.includes(hash)) throw new Error('metadata recovery missing forward hash: ' + hash);
  });
  LEGACY_HASHES.forEach((hash) => {
    if (!sentenceSource.includes(hash)) throw new Error('legacy authoritative source missing hash: ' + hash);
    if (!metadata.includes(hash)) throw new Error('metadata recovery missing legacy hash: ' + hash);
  });
  if (!/values\s*\('game-audio-private',\s*'game-audio-private',\s*false/i.test(bucket)) {
    throw new Error('private bucket invariant no longer matches');
  }
  if (/\bstorage\.objects\b/i.test(metadata)) throw new Error('metadata recovery must not mutate storage.objects');
  if (/\b(insert|update|delete)\s+(?:into\s+|from\s+)?storage\./i.test(metadata)) {
    throw new Error('metadata recovery must not mutate the storage schema');
  }
  return {
    bucket: BUCKET,
    objectPaths: [...OBJECT_PATHS],
    metadataRowsMaximum: 6,
    metadataSql: METADATA_SQL,
    order: ['metadata_sql', 'storage_api_delete', 'storage_absence_postcheck'],
  };
}

function storageHeaders(key) {
  return { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' };
}

function storageBase(baseUrl) {
  const normalized = String(baseUrl || '').replace(/\/+$/, '');
  if (normalized !== PROJECT_URL) throw new Error('SUPABASE_URL does not match the locked PRIVATE_AUDIO_3 target');
  return normalized + '/storage/v1';
}

async function removeObjects(baseUrl, key, fetchImpl = global.fetch) {
  if (typeof fetchImpl !== 'function') throw new Error('fetch implementation is required');
  const response = await fetchImpl(storageBase(baseUrl) + '/object/' + encodeURIComponent(BUCKET), {
    method: 'DELETE',
    headers: storageHeaders(key),
    body: JSON.stringify({ prefixes: OBJECT_PATHS }),
  });
  if (!response.ok) throw new Error('Storage API removal failed with HTTP ' + response.status);
  return response.json();
}

async function verifyObjectsAbsent(baseUrl, key, fetchImpl = global.fetch) {
  const results = [];
  for (const objectPath of OBJECT_PATHS) {
    const directory = path.posix.dirname(objectPath);
    const filename = path.posix.basename(objectPath);
    const response = await fetchImpl(
      storageBase(baseUrl) + '/object/list/' + encodeURIComponent(BUCKET),
      {
        method: 'POST',
        headers: storageHeaders(key),
        body: JSON.stringify({
          prefix: directory,
          limit: 100,
          offset: 0,
          sortBy: { column: 'name', order: 'asc' },
          search: filename,
        }),
      }
    );
    if (!response.ok) throw new Error('Storage API absence check failed with HTTP ' + response.status);
    const rows = await response.json();
    if (!Array.isArray(rows)) throw new Error('Storage API absence check returned an invalid list');
    const present = rows.some((item) => item && (item.name === filename || item.name === objectPath));
    results.push({ objectPath, present });
  }
  const unexpected = results.filter((item) => item.present);
  if (unexpected.length) throw new Error('Storage absence postcheck failed for ' + unexpected.length + ' PRIVATE_AUDIO_3 object(s)');
  return results;
}

function usageError() {
  throw new Error('supported modes: dry-run (default), --verify-storage-absent, or --apply-storage-delete --confirm=PRIVATE_AUDIO_3');
}

async function main(argv = process.argv.slice(2), env = process.env) {
  const plan = validateSources();
  const apply = argv.includes('--apply-storage-delete');
  const verify = argv.includes('--verify-storage-absent');
  const confirm = argv.find((item) => item.startsWith('--confirm='));

  if (apply && verify) usageError();
  if (!apply && !verify) {
    if (argv.length) usageError();
    console.log(JSON.stringify({ mode: 'DRY_RUN', mutation: 'NONE', plan }, null, 2));
    return;
  }

  const baseUrl = env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!baseUrl || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');

  if (verify) {
    const results = await verifyObjectsAbsent(baseUrl, key);
    console.log(JSON.stringify({ mode: 'VERIFY_ONLY', mutation: 'NONE', results }, null, 2));
    return;
  }

  if (confirm !== '--confirm=' + CONFIRMATION || argv.length !== 2) usageError();
  await removeObjects(baseUrl, key);
  const results = await verifyObjectsAbsent(baseUrl, key);
  console.log(JSON.stringify({ mode: 'APPLY_STORAGE_DELETE', deleted: OBJECT_PATHS.length, results }, null, 2));
}

if (require.main === module) {
  main().catch((error) => {
    console.error('PRIVATE_AUDIO_3 recovery failed: ' + error.message);
    process.exit(1);
  });
}

module.exports = {
  BUCKET,
  CONFIRMATION,
  FORWARD_HASHES,
  LEGACY_HASHES,
  METADATA_SQL,
  OBJECT_PATHS,
  PROJECT_URL,
  main,
  removeObjects,
  validateSources,
  verifyObjectsAbsent,
};
