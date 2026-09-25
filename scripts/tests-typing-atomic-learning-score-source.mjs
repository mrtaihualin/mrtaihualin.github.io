#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration = fs.readFileSync(new URL('../supabase/migrations/20260923223000_phase1_typing_atomic_learning_score.sql', import.meta.url), 'utf8');
const rollback = fs.readFileSync(new URL('../supabase/recovery/phase1-typing-atomic-learning-score/rollback.sql', import.meta.url), 'utf8');
let passed = 0;
function check(name, fn) { fn(); passed++; console.log(`PASS ${name}`); }

check('one service-only RPC owns event, learning transition, Retry and final score transaction', () => {
  assert.match(migration, /create or replace function public\.phase1_typing_round_commit_event/);
  assert.match(migration, /language plpgsql security invoker set search_path = ''/);
  assert.match(migration, /phase1_login_free_learning_commit\(/);
  assert.match(migration, /phase1_score_submit_commit\(/);
  assert.match(migration, /insert into public\.phase1_typing_round_events/);
  assert.match(migration, /insert into public\.phase1_typing_round_operations/);
  assert.match(migration, /typing_atomic_learning_rejected/);
  assert.match(migration, /typing_atomic_score_rejected/);
  assert.match(migration, /grant execute on function public\.phase1_typing_round_commit_event[\s\S]+to service_role/);
  assert.doesNotMatch(migration, /grant execute on function public\.phase1_typing_round_commit_event[\s\S]{0,260}to (public|anon|authenticated)/);
  assert.match(migration, /revoke all on function public\.phase1_typing_round_append_event[\s\S]+service_role/);
  assert.match(migration, /revoke all on function public\.phase1_typing_round_create[\s\S]+service_role/);
  assert.match(migration, /revoke all on function public\.phase1_typing_round_append_prompts[\s\S]+service_role/);
  assert.match(migration, /revoke all on function public\.phase1_typing_round_issue_prelearning[\s\S]+service_role/);
});

check('atomic event locks and revalidates current plus every unconsumed canonical pin', () => {
  assert.match(migration, /perform word\.content_key[\s\S]+for share of word/);
  assert.match(migration, /phase1_typing_round_reserve_prompts reserve[\s\S]+reserve\.reserve_ordinal>state\.reserve_cursor/);
  assert.match(migration, /word\.catalog_version is distinct from reserve\.catalog_version/);
  assert.match(migration, /word\.record_hash is distinct from reserve\.record_hash/);
});

check('learning score is recomputed from protected primitives and canonical syllable count', () => {
  assert.match(migration, /event_type='wrong'/);
  assert.match(migration, /event_type='hint_opened'/);
  assert.match(migration, /jsonb_array_length\(v_word\.canonical_record->'syllables'\)/);
  assert.match(migration, /learning_score_mismatch/);
  assert.match(migration, /p_score_verified_by is distinct from 'edge:typing:v2'/);
  assert.match(migration, /time zone 'Asia\/Taipei'/);
  assert.doesNotMatch(migration, /time zone 'Asia\/Bangkok'/);
});

check('Retry obligations stay private until five primaries and skipped Retry is requeued', () => {
  assert.match(migration, /phase1_typing_round_retry_queue/);
  assert.match(migration, /v_primary=5 and v_pending>0/);
  assert.match(migration, /v_prompt\.attempt_kind='retry'[\s\S]+p_event_type='skipped'/);
  assert.match(migration, /golden,srs_bonus[\s\S]+false,false/);
  assert.match(migration, /pending_retry_count/);
});

check('issuance pins the exact learning CAS snapshot and excludes Retry from regular refill', () => {
  assert.match(migration, /learning_state_token/);
  assert.match(migration, /v_prompt ->> 'attempt_kind' is distinct from 'primary'/);
  assert.match(migration, /learning_state' not in \('normal','next_day_check','review_needed','weak_4d','srs'\)/);
  assert.doesNotMatch(migration, /learning_state' not in \([^\n]*retry_end_round/);
});

check('account export is owner-bound and omits answers, future queue, hashes and tokens', () => {
  const exportFn = migration.slice(migration.indexOf('create or replace function public.phase1_typing_account_export'),
    migration.indexOf('revoke all on function public.phase1_typing_round_issue'));
  assert.match(exportFn, /where user_id=p_user_id/);
  assert.match(exportFn, /phase1_typing_round_events/);
  for (const forbidden of ['canonical_answer', 'reserve', 'request_hash', 'learning_state_token', "'answer'"]) {
    assert(!exportFn.includes(forbidden), forbidden);
  }
});

check('rollback requires no active round, deactivates every issue/write owner and preserves additive evidence', () => {
  assert.match(rollback, /where status='active'/);
  assert.match(rollback, /revoke all on function public\.phase1_typing_round_commit_event/);
  assert.match(rollback, /revoke all on function public\.phase1_typing_round_append_event/);
  assert.match(rollback, /revoke all on function public\.phase1_typing_round_create/);
  assert.match(rollback, /revoke all on function public\.phase1_typing_round_append_prompts/);
  assert.match(rollback, /revoke all on function public\.phase1_typing_round_issue/);
  assert.match(rollback, /revoke all on function public\.phase1_typing_round_append_reserve/);
  assert.match(rollback, /revoke all on function public\.phase1_typing_round_refill/);
  assert.doesNotMatch(rollback, /grant execute/);
  assert.doesNotMatch(rollback, /drop table/);
  assert.doesNotMatch(rollback, /drop function/);
  assert.doesNotMatch(rollback, /delete from/);
  assert.match(rollback, /preserves every round, prompt, Retry obligation, learning row and score/i);
});

console.log(`TYPING_ATOMIC_LEARNING_SCORE_SOURCE_PASS ${passed}`);
