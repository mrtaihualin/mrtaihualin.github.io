#!/usr/bin/env node
'use strict';

// Exact forward uploader for the three Phase 1 private-audio objects.
// Default mode is local validation only. Production upload remains locked
// behind an exact target, explicit confirmation, and runtime credentials.

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const BUCKET = 'game-audio-private';
const CONFIRMATION = 'PRIVATE_AUDIO_3';
const CONTENT_TYPE = 'audio/mpeg';
const PROJECT_REF = 'qzkxlhpcputsvbqmtqfi';
const PROJECT_URL = 'https://' + PROJECT_REF + '.supabase.co';

const OBJECTS = Object.freeze([
  Object.freeze({
    text: 'ขอบคุณมาก',
    textHash: '133e3ff63a47df9060618d6d28be8e1760389910531041b23313016333fa3883',
    localPath: 'assets/sentence-audio/th/google-chirp3hd/13/133e3ff63a47df9060618d6d28be8e1760389910531041b23313016333fa3883.mp3',
    objectPath: 'sentences/th/google-chirp3hd/13/133e3ff63a47df9060618d6d28be8e1760389910531041b23313016333fa3883.mp3',
    bytes: 20942,
    sha256: 'c6d438638609f7f46deb3b475b9ff280f456ace4868a00e6270387bba0cbb857',
  }),
  Object.freeze({
    text: 'ขอเมนูหน่อย',
    textHash: '86c510f76a50f1fc21b1bd4c2db9073c955d0decff0055c6d673b7cae89d6cba',
    localPath: 'assets/sentence-audio/th/google-chirp3hd/86/86c510f76a50f1fc21b1bd4c2db9073c955d0decff0055c6d673b7cae89d6cba.mp3',
    objectPath: 'sentences/th/google-chirp3hd/86/86c510f76a50f1fc21b1bd4c2db9073c955d0decff0055c6d673b7cae89d6cba.mp3',
    bytes: 23031,
    sha256: 'e4ffd07b5379b9ea498130dd2b4c78abcfb99a0a8ecc8a2822544df850b35423',
  }),
  Object.freeze({
    text: 'เก็บเงินด้วย',
    textHash: '814f261e277d95b2029ac97f69e64d820c4a2ca1bff9bfc3c08bcc1f168d89ca',
    localPath: 'assets/sentence-audio/th/google-chirp3hd/81/814f261e277d95b2029ac97f69e64d820c4a2ca1bff9bfc3c08bcc1f168d89ca.mp3',
    objectPath: 'sentences/th/google-chirp3hd/81/814f261e277d95b2029ac97f69e64d820c4a2ca1bff9bfc3c08bcc1f168d89ca.mp3',
    bytes: 23867,
    sha256: '971ce282c312607799912e05577e1ad01824dbaf9008bc375f0344d66b8f5673',
  }),
]);

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function loadManifest() {
  const source = fs.readFileSync(path.join(ROOT, 'data/audio-manifest.js'), 'utf8');
  const sandbox = { window: {} };
  vm.runInNewContext(source, sandbox, { filename: 'audio-manifest.js' });
  const manifest = sandbox.window.AUDIO_MANIFEST;
  if (!manifest || !manifest.sentences || typeof manifest.sentences !== 'object') {
    throw new Error('audio manifest is missing the sentence map');
  }
  return manifest;
}

function sourcePath(item) {
  const absolute = path.resolve(ROOT, item.localPath);
  const protectedRoot = path.join(ROOT, 'assets', 'sentence-audio') + path.sep;
  if (!absolute.startsWith(protectedRoot)) {
    throw new Error('PRIVATE_AUDIO_3 local path escaped the protected sentence-audio directory');
  }
  return absolute;
}

function validateSources() {
  if (OBJECTS.length !== 3) throw new Error('PRIVATE_AUDIO_3 scope must contain exactly three objects');

  const manifest = loadManifest();
  const uniqueTexts = new Set();
  const uniqueLocalPaths = new Set();
  const uniqueObjectPaths = new Set();
  const uniqueTextHashes = new Set();
  const validated = [];

  for (const item of OBJECTS) {
    uniqueTexts.add(item.text);
    uniqueLocalPaths.add(item.localPath);
    uniqueObjectPaths.add(item.objectPath);
    uniqueTextHashes.add(item.textHash);

    const expectedObjectPath = item.localPath.replace(/^assets\/sentence-audio\//, 'sentences/');
    if (expectedObjectPath === item.localPath || item.objectPath !== expectedObjectPath) {
      throw new Error('PRIVATE_AUDIO_3 local/object path mapping mismatch for ' + item.textHash);
    }
    if (path.posix.basename(item.objectPath, '.mp3') !== item.textHash) {
      throw new Error('PRIVATE_AUDIO_3 object path/hash mismatch for ' + item.textHash);
    }
    if (manifest.sentences[item.text] !== item.localPath) {
      throw new Error('audio manifest mapping mismatch for ' + item.textHash);
    }

    const absolute = sourcePath(item);
    const stat = fs.statSync(absolute);
    if (!stat.isFile()) throw new Error('PRIVATE_AUDIO_3 source is not a file for ' + item.textHash);
    if (stat.size !== item.bytes) throw new Error('PRIVATE_AUDIO_3 byte-size mismatch for ' + item.textHash);

    const body = fs.readFileSync(absolute);
    if (sha256(body) !== item.sha256) throw new Error('PRIVATE_AUDIO_3 SHA-256 mismatch for ' + item.textHash);
    validated.push({
      text: item.text,
      textHash: item.textHash,
      localPath: item.localPath,
      objectPath: item.objectPath,
      bytes: item.bytes,
      sha256: item.sha256,
      contentType: CONTENT_TYPE,
      upsert: false,
    });
  }

  if (uniqueTexts.size !== 3 || uniqueLocalPaths.size !== 3 || uniqueObjectPaths.size !== 3 || uniqueTextHashes.size !== 3) {
    throw new Error('PRIVATE_AUDIO_3 scope contains a duplicate identity, path, or hash');
  }

  return {
    projectRef: PROJECT_REF,
    projectUrl: PROJECT_URL,
    bucket: BUCKET,
    mutation: 'NONE',
    objects: validated,
  };
}

function storageBase(baseUrl) {
  const normalized = String(baseUrl || '').replace(/\/+$/, '');
  if (normalized !== PROJECT_URL) throw new Error('SUPABASE_URL does not match the locked PRIVATE_AUDIO_3 target');
  return normalized + '/storage/v1';
}

function encodedObjectPath(objectPath) {
  return objectPath.split('/').map(encodeURIComponent).join('/');
}

function boundObject(item) {
  const expected = OBJECTS.find((candidate) => candidate.objectPath === item.objectPath);
  if (!expected || expected !== item) throw new Error('upload item is outside the exact PRIVATE_AUDIO_3 object set');
  return expected;
}

async function uploadObject(baseUrl, key, item, fetchImpl = global.fetch) {
  if (typeof fetchImpl !== 'function') throw new Error('fetch implementation is required');
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required');
  const exact = boundObject(item);
  const body = fs.readFileSync(sourcePath(exact));
  if (body.length !== exact.bytes || sha256(body) !== exact.sha256) {
    throw new Error('PRIVATE_AUDIO_3 source changed after validation for ' + exact.textHash);
  }

  let response;
  try {
    response = await fetchImpl(
      storageBase(baseUrl) + '/object/' + encodeURIComponent(BUCKET) + '/' + encodedObjectPath(exact.objectPath),
      {
        method: 'POST',
        headers: {
          apikey: key,
          Authorization: 'Bearer ' + key,
          'Content-Type': CONTENT_TYPE,
          'x-upsert': 'false',
        },
        body,
      }
    );
  } catch (_error) {
    throw new Error('Storage upload request failed before response for ' + exact.objectPath);
  }
  if (!response || !response.ok) {
    const status = response && Number.isInteger(response.status) ? response.status : 'UNKNOWN';
    throw new Error('Storage upload failed with HTTP ' + status + ' for ' + exact.objectPath);
  }
  return exact.objectPath;
}

async function uploadObjects(baseUrl, key, fetchImpl = global.fetch) {
  validateSources();
  storageBase(baseUrl);
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required');

  const uploaded = [];
  for (const item of OBJECTS) {
    try {
      uploaded.push(await uploadObject(baseUrl, key, item, fetchImpl));
    } catch (error) {
      const failure = new Error(error.message + '; uploaded before failure: ' + uploaded.length);
      failure.uploadedObjectPaths = [...uploaded];
      throw failure;
    }
  }
  return uploaded;
}

function usageError() {
  throw new Error('supported modes: dry-run (default) or --apply-storage-upload --confirm=PRIVATE_AUDIO_3');
}

async function main(argv = process.argv.slice(2), env = process.env, dependencies = {}) {
  const log = dependencies.log || console.log;
  const fetchImpl = dependencies.fetchImpl || global.fetch;
  const plan = validateSources();
  const apply = argv.includes('--apply-storage-upload');
  const confirm = argv.includes('--confirm=' + CONFIRMATION);

  if (!apply && !confirm && argv.length === 0) {
    log(JSON.stringify({ mode: 'DRY_RUN', ...plan }, null, 2));
    return plan;
  }
  if (!apply || !confirm || argv.length !== 2) usageError();

  const baseUrl = env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  storageBase(baseUrl);
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required');

  const uploaded = await uploadObjects(baseUrl, key, fetchImpl);
  const result = {
    mode: 'APPLY_STORAGE_UPLOAD',
    projectRef: PROJECT_REF,
    bucket: BUCKET,
    upsert: false,
    uploaded,
  };
  log(JSON.stringify(result, null, 2));
  return result;
}

if (require.main === module) {
  main().catch((error) => {
    console.error('PRIVATE_AUDIO_3 forward upload failed: ' + error.message);
    if (Array.isArray(error.uploadedObjectPaths) && error.uploadedObjectPaths.length) {
      console.error('Uploaded before failure (recovery approval required): ' + error.uploadedObjectPaths.join(', '));
    }
    process.exit(1);
  });
}

module.exports = {
  BUCKET,
  CONFIRMATION,
  CONTENT_TYPE,
  OBJECTS,
  PROJECT_REF,
  PROJECT_URL,
  main,
  storageBase,
  uploadObject,
  uploadObjects,
  validateSources,
};
