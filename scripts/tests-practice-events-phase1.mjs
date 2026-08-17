#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeRecordBody, normalizeStatusBody, wordBase } from '../supabase/functions/practice-events/practice-events-engine.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');
const edge = read('supabase/functions/practice-events/index.ts');
const client = read('js/games/practice-events.js');
const gameFlow = read('js/games/game-flow.js');
const authWidget = read('js/core/auth-widget.js');
const personalContent = read('js/score/personal-content.js');
const migrationName = fs.readdirSync(path.join(root, 'supabase/migrations')).find((name) => name.endsWith('_phase1_practice_event_idempotency.sql'));
const migration = migrationName ? read('supabase/migrations/' + migrationName) : '';
let pass = 0;
const failures = [];
function check(label, condition) {
  if (condition) { pass++; console.log('✓ ' + label); }
  else failures.push(label);
}
function rejects(label, fn) {
  let rejected = false;
  try { fn(); } catch { rejected = true; }
  check(label, rejected);
}

const valid = {
  action: 'record',
  round_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  game_type: 'reading',
  completed_at: '2026-08-17T03:00:00.000Z',
  items: [{
    ordinal: 1,
    content_ref: { source: 'game_words', key: 'กา@1' },
    is_correct: true,
    wrong_count: 0,
    hint_used: false,
    answer: '<script>not persisted</script>'
  }]
};
const normalized = normalizeRecordBody(valid);
check('record maps the five-game name to the canonical surface', normalized.surface === 'reading');
check('record keeps canonical item identity and outcome', normalized.items[0].content_ref.key === 'กา@1' && normalized.items[0].is_correct === true);
check('record normalization drops raw learner answers', !Object.prototype.hasOwnProperty.call(normalized.items[0], 'answer'));
rejects('record rejects non-v4 round identity', () => normalizeRecordBody({ ...valid, round_id: 'bad' }));
rejects('record rejects a noncanonical content source', () => normalizeRecordBody({ ...valid, items: [{ ...valid.items[0], content_ref: { source: 'saved_provenance', key: 'กา' } }] }));
rejects('record rejects duplicate round positions', () => normalizeRecordBody({ ...valid, items: [valid.items[0], { ...valid.items[0] }] }));
rejects('record requires completed-play evidence', () => normalizeRecordBody({ ...valid, completed_at: '' }));

const status = normalizeStatusBody({ action: 'status', items: [
  { kind: 'word', key: 'กา' }, { kind: 'word', key: 'กา' }, { kind: 'sentence', key: 'ฉันกินข้าว' }
] });
check('status request deduplicates exact personal items', status.items.length === 2);
check('word identity strips only the final level suffix', wordBase('email@example@2') === 'email@example');

check('Edge authenticates the JWT through getUser', /auth\.getUser\(\)/.test(edge));
check('Edge derives user identity and never accepts body user_id', /clients\.user\.id/.test(edge) && !/body\.user_id/.test(edge));
check('Edge validates content refs against protected learning_items', /from\('learning_items'\)/.test(edge) && /unknown_content_ref/.test(edge));
check('Edge rate-limits before record or status RPCs', /game_content_rl_check/.test(edge));
check('Edge uses the scoped service-role RPCs', /phase1_practice_events_record/.test(edge) && /phase1_practice_event_status/.test(edge));
check('Edge source pins supabase-js', /supabase-js@2\.112\.3/.test(edge));
check('migration provides retry uniqueness', /create unique index if not exists uq_practice_events_user_round_surface_ordinal/.test(migration));
check('migration serializes and detects replay conflicts', /pg_advisory_xact_lock/.test(migration) && /replay_conflict/.test(migration));
check('migration keeps RPCs invoker-scoped and revokes browser roles', /security invoker/.test(migration) && /revoke all on function public\.phase1_practice_events_record[\s\S]*from public, anon, authenticated/.test(migration));
check('client queue is account-bound and minimized', /phase1_practice_event_pending_v1/.test(client) && /function minimizedReport/.test(client) && !/user_answer/.test((client.match(/function minimizedReport[\s\S]*?\n  \}/) || [''])[0]));
check('Guest never queues Played evidence', /if \(!owner \|\| !payload\) return Promise\.resolve\(false\)/.test(client));
check('network failure keeps a retryable queue and online flush exists', /window\.addEventListener\('online', flush\)/.test(client) && /function flush\(\)/.test(client));
check('completed RoundReport submits through the Played-evidence client', /PracticeEvents\.submitReport\(options\.report\)/.test(gameFlow));
check('account switch clears pending Played evidence', /'phase1_practice_event_pending_v1'/.test(authWidget));
check('personal content derives Played copy from server evidence, never provenance', /playedFor\(item, kind\)/.test(personalContent) && /evidence && evidence\.played/.test(personalContent) && !/provenance\(item\)[\s\S]{0,200}再練習/.test(personalContent));
check('personal content exposes bounded status recovery', /PracticeEvents\.status\(requestItems\)/.test(personalContent) && /重新載入練習紀錄/.test(personalContent));
check('all Core 5 games load the recorder before the updated shared flow', ['tone-finder.html','reading-game.html','listening-game.html','typing-game.html','word-order.html'].every((name) => {
  const html = read(name);
  return /practice-events\.js\?v=1[\s\S]*game-flow\.js\?v=5/.test(html);
}));
check('personal content loads authenticated status evidence before its UI', /practice-events\.js\?v=1[\s\S]*personal-content\.js\?v=4/.test(read('vault.html')));

if (failures.length) {
  failures.forEach((label) => console.error('✗ ' + label));
  process.exit(1);
}
console.log('\nPractice Events Phase 1: ' + pass + '/' + pass + ' PASS');
