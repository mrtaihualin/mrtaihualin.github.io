#!/usr/bin/env node
'use strict';

// Uploads current local game audio to the private bucket and writes storage_path metadata.
// Default is validation-only. Production mutation requires explicit --apply plus service-role env vars.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const APPLY = process.argv.includes('--apply');
const BUCKET = process.env.GAME_AUDIO_BUCKET || 'game-audio-private';
const EMIT_SQL_INDEX = process.argv.indexOf('--emit-metadata-sql');
const EMIT_SQL_PATH = EMIT_SQL_INDEX >= 0 ? process.argv[EMIT_SQL_INDEX + 1] : '';

function loadManifest() {
  const source = fs.readFileSync(path.join(ROOT, 'data/audio-manifest.js'), 'utf8');
  const sandbox = { window: {} };
  vm.runInNewContext(source, sandbox, { filename: 'audio-manifest.js' });
  const manifest = sandbox.window.AUDIO_MANIFEST;
  if (!manifest || !manifest.words || !manifest.sentences) throw new Error('invalid audio manifest');
  return manifest;
}
function contentType(file) {
  const ext = path.extname(file).toLowerCase();
  if (ext === '.mp3') return 'audio/mpeg';
  if (ext === '.m4a' || ext === '.mp4') return 'audio/mp4';
  throw new Error('unsupported audio type: ' + ext);
}
function entries(manifest) {
  const output = [];
  [['word', manifest.words], ['sentence', manifest.sentences]].forEach(([type, map]) => {
    Object.keys(map).forEach((text) => {
      const relative = String(map[text]).replace(/^\/+/, '');
      const source = path.join(ROOT, relative);
      if (!fs.existsSync(source)) throw new Error('missing audio file for ' + type + ': ' + relative);
      const suffix = relative.replace(/^assets\/(word-audio|sentence-audio)\//, '');
      if (suffix === relative) throw new Error('audio outside protected source directories: ' + relative);
      output.push({ type, text, source, objectPath: type + 's/' + suffix, mime: contentType(source) });
    });
  });
  return output;
}
function encodedObjectPath(objectPath) {
  return objectPath.split('/').map(encodeURIComponent).join('/');
}
function sqlLiteral(value) {
  return "'" + String(value).replace(/'/g, "''") + "'";
}
function emitMetadataSql(list, outputPath) {
  if (!outputPath || outputPath.startsWith('-')) {
    throw new Error('--emit-metadata-sql requires an output path');
  }
  const rows = list.map((item) =>
    '  (' + sqlLiteral(item.text) + ', ' + sqlLiteral(item.objectPath) + ')'
  );
  const sql = [
    'begin;',
    'update public.audio_assets as asset',
    'set storage_path = mapped.storage_path',
    'from (values',
    rows.join(',\n'),
    ') as mapped(text_th, storage_path)',
    'where asset.text_th = mapped.text_th;',
    'commit;',
    "select count(*) as assets_missing_private_path from public.audio_assets where status in ('generated', 'approved') and storage_path is null;",
    '',
  ].join('\n');
  fs.writeFileSync(path.resolve(outputPath), sql, { encoding: 'utf8', mode: 0o600 });
  console.log('Wrote private audio metadata SQL: ' + path.resolve(outputPath));
}
async function upload(baseUrl, key, item) {
  const response = await fetch(baseUrl + '/storage/v1/object/' + encodeURIComponent(BUCKET) + '/' + encodedObjectPath(item.objectPath), {
    method: 'POST',
    headers: { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': item.mime, 'x-upsert': 'true' },
    body: fs.readFileSync(item.source),
  });
  if (!response.ok) throw new Error('upload failed HTTP ' + response.status + ' for ' + item.objectPath);
  const update = await fetch(baseUrl + '/rest/v1/audio_assets?text_th=eq.' + encodeURIComponent(item.text), {
    method: 'PATCH',
    headers: {
      apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({ storage_path: item.objectPath }),
  });
  if (!update.ok) throw new Error('metadata update failed HTTP ' + update.status + ' for one ' + item.type);
}

async function main() {
  const list = entries(loadManifest());
  const unique = new Set(list.map((item) => item.objectPath));
  if (unique.size !== list.length) throw new Error('duplicate private object paths');
  console.log('Validated private audio migration inputs: ' + list.length + ' files');
  if (EMIT_SQL_INDEX >= 0) {
    emitMetadataSql(list, EMIT_SQL_PATH);
    return;
  }
  if (!APPLY) {
    console.log('DRY RUN only — no network or Production change. Use --apply only after SQL review/authorization.');
    return;
  }
  const baseUrl = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!baseUrl || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for --apply');
  for (let index = 0; index < list.length; index++) await upload(baseUrl, key, list[index]);
  console.log('Uploaded and linked private audio: ' + list.length + ' files');
}
main().catch((error) => { console.error('Private audio migration failed:', error.message); process.exit(1); });
