#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const migration = fs.readFileSync(
  path.join(root, 'supabase/migrations/20260904120000_game_sentence_choice_limit.sql'),
  'utf8'
);

const checks = [
  ['checks existing rows before install', /jsonb_array_length\(words\) > 16[\s\S]*GAME_SENTENCE_CHOICE_LIMIT_EXISTING_VIOLATION/],
  ['owns one named trigger function', /create or replace function public\.enforce_game_sentence_choice_limit\(\)/],
  ['runs for every insert and relevant update', /before insert or update of th, words on public\.game_sentences[\s\S]*for each row execute function public\.enforce_game_sentence_choice_limit\(\)/],
  ['reports the exact over-16 count and stops', /if v_choice_count > 16 then[\s\S]*GAME_SENTENCE_CHOICE_LIMIT_EXCEEDED[\s\S]*มี %s ตัวเลือก; ระบบรองรับสูงสุด 16/],
  ['rejects malformed words instead of bypassing the limit', /jsonb_typeof\(new\.words\) is distinct from 'array'[\s\S]*GAME_SENTENCE_WORDS_NOT_ARRAY/],
  ['keeps browser roles from invoking the trigger function', /revoke all on function public\.enforce_game_sentence_choice_limit\(\) from public, anon, authenticated/],
  ['verifies exactly one enabled trigger after install', /GAME_SENTENCE_CHOICE_LIMIT_POSTCHECK_FAILED/],
  ['includes an explicit rollback', /ROLLBACK[\s\S]*drop trigger if exists trg_game_sentence_choice_limit[\s\S]*drop function if exists public\.enforce_game_sentence_choice_limit\(\)/],
];

for (const [name, pattern] of checks) {
  assert.match(migration, pattern, name);
  console.log('✓ ' + name);
}

console.log('\n' + checks.length + ' game sentence choice-limit checks passed.');
