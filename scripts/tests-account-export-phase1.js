#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'supabase/functions/account-export/index.ts'), 'utf8');
let passed = 0;

function test(name, fn) {
  fn();
  passed++;
  console.log(`✓ ${name}`);
}

test('export owner comes only from the verified JWT user', () => {
  assert.match(source, /userClient\.auth\.getUser\(jwt\)/);
  assert.match(source, /const callerUid = user\.id/);
  assert.match(source, /body && body\.user_id/);
  assert.doesNotMatch(source, /callerUid\s*=\s*body\./);
});

test('Phase 1 session and per-skill SRS tables are exported', () => {
  for (const table of ['tone_sessions', 'reading_sessions', 'tone_srs_state']) {
    assert.match(source, new RegExp(`from\\('${table}'\\)[\\s\\S]{0,220}eq\\('user_id', callerUid\\)`));
  }
  assert.match(source, /select\('level,word,item_id,stage,due_date,ever_failed,mastered,game,updated_at'\)/);
  assert.match(source, /history:[\s\S]+phase1_learning_review_states: learningReviewRes\.data/);
});

test('all personal saved-item vault keys are exported for the owner', () => {
  assert.match(source, /from\('learning_saved_items'\)[\s\S]{0,220}eq\('user_id', callerUid\)/);
  assert.doesNotMatch(source, /from\('learning_saved_items'\)[\s\S]{0,220}eq\('vault_key', 'linvault'\)/);
  assert.match(source, /vault_key: r\.vault_key/);
});

test('personal deletion tombstones are transparent in the export', () => {
  assert.match(source, /deleted_at/);
  assert.match(source, /active: vaultActive/);
  assert.match(source, /deleted: vaultDeleted/);
  assert.match(source, /deletion_tracking_supported/);
});

test('service-role-only queries remain explicitly owner-filtered', () => {
  for (const table of ['line_identities', 'account_audit_log', 'phase1_learning_review_states']) {
    assert.match(source, new RegExp(`admin\\.from\\('${table}'\\)[\\s\\S]{0,220}eq\\('user_id', callerUid\\)`));
  }
});

test('protected Typing export is owner-bound and excludes future answers and internal receipts', () => {
  assert.match(source, /admin\.rpc\('phase1_typing_account_export', \{ p_user_id: callerUid, p_limit: HISTORY_ROW_CAP \}\)/);
  assert.match(source, /phase1_typing_rounds: typingRoundExportRes\.data\?\.rounds \|\| \[\]/);
  const migration = fs.readFileSync(path.join(root,
    'supabase/migrations/20260923223000_phase1_typing_atomic_learning_score.sql'), 'utf8');
  const exportFn = migration.slice(migration.indexOf('create or replace function public.phase1_typing_account_export'),
    migration.indexOf('revoke all on function public.phase1_typing_round_issue'));
  assert.match(exportFn, /where user_id=p_user_id/);
  assert.doesNotMatch(exportFn, /'answer',e\.answer/);
  assert.doesNotMatch(exportFn, /request_hash/);
  assert.doesNotMatch(exportFn, /learning_state_token/);
});

test('raw internal account audit states are not selected or returned', () => {
  assert.doesNotMatch(source, /select\([^\n]*before_state/);
  assert.doesNotMatch(source, /select\([^\n]*after_state/);
  assert.match(source, /account_changes: accountHistory/);
});

test('partial data fetch fails closed instead of producing a silent partial export', () => {
  assert.match(source, /throw fetchErr/);
  assert.match(source, /error: 'data_fetch_failed'/);
});

console.log(`\n${passed} Phase 1 account-export tests passed.`);
