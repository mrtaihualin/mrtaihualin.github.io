#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Ephemeral PostgreSQL fixture only. It never connects to Supabase or any
// project database and removes only the private temporary cluster it creates.

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'phase1-private-audio-3-pg-'));
const data = path.join(temp, 'data');
const socket = path.join(temp, 'socket');
const port = String(56000 + (process.pid % 1000));
fs.mkdirSync(socket);

function run(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`${command} failed\n${result.stdout || ''}\n${result.stderr || ''}`);
  }
  return result.stdout || '';
}

function psql(sql) {
  return run('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-h', socket, '-p', port, '-d', 'postgres', '-At', '-c', sql]);
}

let started = false;
try {
  run('initdb', ['-D', data, '--no-locale', '--encoding=UTF8', '--auth=trust']);
  run('pg_ctl', ['-D', data, '-l', path.join(temp, 'postgres.log'), '-o', `-F -c listen_addresses='' -p ${port} -k ${socket}`, '-w', 'start']);
  started = true;

  psql(`
    create table public.audio_assets (
      id bigint generated always as identity primary key,
      content_type text not null,
      content_id text not null,
      text_th text not null,
      text_hash text not null,
      voice_engine text not null,
      voice_id text not null,
      source text not null,
      file_path text not null,
      storage_path text,
      status text not null,
      duration_ms integer,
      updated_at timestamptz not null default now(),
      unique (text_hash, voice_id)
    );
    insert into public.audio_assets
      (content_type, content_id, text_th, text_hash, voice_engine, voice_id, source, file_path, storage_path, status, duration_ms)
    values
      ('sentence', 'sent-18', 'ขอบคุณมากครับ', 'b10b6562a52cb21557cee22a77c1088ec13bb793634985c7ea8dc8819cbecdb5',
       'google-chirp3hd', 'th-TH-Chirp3-HD-Leda', 'ai',
       'assets/sentence-audio/th/google-chirp3hd/b1/b10b6562a52cb21557cee22a77c1088ec13bb793634985c7ea8dc8819cbecdb5.mp3',
       'sentences/th/google-chirp3hd/b1/b10b6562a52cb21557cee22a77c1088ec13bb793634985c7ea8dc8819cbecdb5.mp3', 'generated', 1224),
      ('sentence', 'sent-21', 'ขอเมนูหน่อยครับ', '6fb9042903b141f32e29772be134ecbce2ec8a8d72045f2e7f74f426c3caa172',
       'google-chirp3hd', 'th-TH-Chirp3-HD-Leda', 'ai',
       'assets/sentence-audio/th/google-chirp3hd/6f/6fb9042903b141f32e29772be134ecbce2ec8a8d72045f2e7f74f426c3caa172.mp3',
       'sentences/th/google-chirp3hd/6f/6fb9042903b141f32e29772be134ecbce2ec8a8d72045f2e7f74f426c3caa172.mp3', 'generated', 1536),
      ('sentence', 'sent-25', 'เก็บเงินด้วยครับ', 'bec9003ffc07c92952f1ab7fbcd909cb1bec529cf4b56d0f8be61a69851be263',
       'google-chirp3hd', 'th-TH-Chirp3-HD-Leda', 'ai',
       'assets/sentence-audio/th/google-chirp3hd/be/bec9003ffc07c92952f1ab7fbcd909cb1bec529cf4b56d0f8be61a69851be263.mp3',
       'sentences/th/google-chirp3hd/be/bec9003ffc07c92952f1ab7fbcd909cb1bec529cf4b56d0f8be61a69851be263.mp3', 'generated', 1536);
  `);

  run('psql', [
    '-X', '-v', 'ON_ERROR_STOP=1', '-h', socket, '-p', port, '-d', 'postgres',
    '-f', path.join(root, 'supabase/migrations/20260816131431_phase1_sentence_audio_exact_text_fix.sql'),
  ]);
  assert.strictEqual(psql("select count(*) from public.audio_assets; ").trim(), '6');
  assert.strictEqual(psql("select count(*) from public.audio_assets where status='needs_fix' and storage_path is null;").trim(), '3');

  const recoverySql = path.join(root, 'supabase/sql/2026-08-17_phase1_private_audio_3_recovery.sql');
  run('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-h', socket, '-p', port, '-d', 'postgres', '-f', recoverySql]);
  assert.strictEqual(psql("select count(*) from public.audio_assets;").trim(), '3');
  assert.strictEqual(psql("select count(*) from public.audio_assets where status='generated' and storage_path is not null;").trim(), '3');

  run('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-h', socket, '-p', port, '-d', 'postgres', '-f', recoverySql]);
  assert.strictEqual(psql("select count(*) from public.audio_assets;").trim(), '3');

  console.log('PASS PRIVATE_AUDIO_3 PostgreSQL recovery fixture: forward state -> exact recovery -> idempotent rerun');
} finally {
  if (started) spawnSync('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop'], { encoding: 'utf8' });
  fs.rmSync(temp, { recursive: true, force: true });
}
