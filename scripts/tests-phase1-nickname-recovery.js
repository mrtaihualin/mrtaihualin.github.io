'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const sql = fs.readFileSync(path.join(root, 'supabase/sql/2026-08-17_phase1_nickname_recovery.sql'), 'utf8');
const fixture = fs.readFileSync(path.join(root, 'supabase/tests/2026-08-17_phase1_nickname_recovery_TEST.sql'), 'utf8');
const sourceMap = fs.readFileSync(path.join(root, 'supabase/sql/00_ฟังก์ชันไหนอยู่ไฟล์ไหน.md'), 'utf8');
const preparer = fs.readFileSync(path.join(root, 'scripts/prepare-phase1-nickname-recovery.js'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'supabase/recovery/p1-b-04_nickname_recovery_manifest.json'), 'utf8'));

assert.match(sql, /NICKNAME_RECOVERY_BASE_SCORE_SCHEMA_MISSING/, 'recovery fails closed on the wrong score baseline');
assert.match(sql, /NICKNAME_RECOVERY_ADDITIVE_TABLES_MISSING/, 'recovery requires the exact additive schema');
assert.match(sql, /NICKNAME_RECOVERY_ROLLOUT_RPC_MISSING/, 'recovery requires the exact rollout RPCs');
assert.doesNotMatch(sql, /drop\s+table|truncate\s|delete\s+from/i, 'recovery never deletes nickname tables or rows');
assert.match(sql, /alter table public\.leaderboard_public_identities enable row level security/, 'identity RLS remains enabled');
assert.match(sql, /alter table public\.leaderboard_nickname_reports enable row level security/, 'report RLS remains enabled');
assert.match(sql, /revoke all on table public\.leaderboard_public_identities\s+from public, anon, authenticated/, 'identity table is browser-inaccessible');
assert.match(sql, /revoke all on table public\.leaderboard_nickname_reports\s+from public, anon, authenticated/, 'report table is browser-inaccessible');

for (const signature of [
  'set_leaderboard_nickname\\(text\\)',
  'get_my_leaderboard_identity\\(\\)',
  'report_leaderboard_nickname\\(uuid\\)',
]) {
  assert.match(sql, new RegExp(`revoke execute on function public\\.${signature}[\\s\\S]*?from public, anon, authenticated`), `${signature} is disabled for browsers`);
}

for (const signature of [
  { create: 'leaderboard_weekly\\(\\)', grant: 'leaderboard_weekly\\(\\)' },
  { create: 'leaderboard_alltime\\(\\)', grant: 'leaderboard_alltime\\(\\)' },
  { create: 'reading_leaderboard_weekly\\(p_game text\\)', grant: 'reading_leaderboard_weekly\\(text\\)' },
  { create: 'reading_leaderboard_alltime\\(p_game text\\)', grant: 'reading_leaderboard_alltime\\(text\\)' },
]) {
  assert.match(sql, new RegExp(`create function public\\.${signature.create}`), `${signature.create} is restored`);
  assert.match(sql, new RegExp(`grant execute on function public\\.${signature.grant} to anon, authenticated`), `${signature.grant} keeps the prior public board grant`);
}

assert.strictEqual((sql.match(/returns table\(nickname text, avatar text, badge_id text, total_score bigint, games bigint, is_current_user boolean\)/g) || []).length, 4, 'all four RPCs restore the six-column S29 contract');
assert.doesNotMatch(sql.match(/-- Restore the pre-nickname S29 board contract[\s\S]*?commit;/)?.[0] || '', /public_identity_id|leaderboard_public_identities/, 'restored board RPCs do not expose or consume the additive public identity');
assert.match(sql, /security definer set search_path = ''/g, 'security-definer board RPCs use an empty search_path');
assert.match(fixture, /Fixture private A/, 'Postgres fixture distinguishes prior private nickname behavior');
assert.match(fixture, /Fixture public A/, 'Postgres fixture creates a distinct additive public nickname');
assert.match(fixture, /has_function_privilege\('authenticated', 'public\.set_leaderboard_nickname\(text\)'/, 'fixture checks browser RPC denial');
assert.match(fixture, /has_table_privilege\('authenticated', 'public\.leaderboard_public_identities'/, 'fixture checks direct table denial');
assert.match(fixture, /pg_get_function_result\('public\.leaderboard_alltime\(\)'::regprocedure\)/, 'fixture checks exact prior RPC signature');
assert.match(fixture, /rollback;/, 'Postgres fixture leaves no data');
assert.match(sourceMap, /2026-08-17_phase1_nickname_recovery\.sql/, 'SQL source map routes the recovery artifact');

assert.match(preparer, /575104d925273d30ef39b7068119f888a7444c09/, 'client/Edge recovery is pinned to the pre-nickname ref');
assert.match(preparer, /mode !== '--check' && mode !== '--apply'/, 'preparer exposes only check/apply source modes');
assert.match(preparer, /priorBlobPaths = \[[\s\S]*admin-player-accounts\.html[\s\S]*js\/score\/leaderboard\.js[\s\S]*js\/score\/reading-leaderboard\.js[\s\S]*supabase\/functions\/admin-player-accounts\/index\.ts/, 'prior client and Edge owners are exact');
assert.strictEqual((preparer.match(/'(?:leaderboard|listening-board|reading-board|typing-board|word-order-board)\.html': \[/g) || []).length, 5, 'all five board pages are in the recovery write-set');
assert.match(preparer, /if \(mode === '--apply'\) \{[\s\S]*fs\.writeFileSync/, 'check mode cannot write source');
assert.doesNotMatch(preparer, /supabase\s+functions\s+deploy|psql\s|git\s+(?:commit|push)|execFileSync\(['"]supabase['"]|execFileSync\(['"]psql['"]/, 'preparer has no deploy, SQL, commit, or push action');
assert.match(preparer, /productionAction: 'NONE'/, 'preparer reports no Production action');
assert.strictEqual(manifest.source_baseline, 'cf1d662405a25bd24b58606a83f0d842a9b00ef3', 'manifest pins the exact origin/main preparation baseline');
assert.strictEqual(manifest.pre_nickname_ref, '575104d925273d30ef39b7068119f888a7444c09', 'manifest pins the exact prior client/Edge ref');
assert.strictEqual(manifest.production_action, 'NONE', 'manifest performs no Production action');
assert.deepStrictEqual(manifest.preserve_objects.sort(), [
  'public.leaderboard_nickname_reports',
  'public.leaderboard_public_identities',
], 'manifest preserves both additive moderation tables');
assert.strictEqual(Object.keys(manifest.generated_source_sha256).length, 10, 'manifest covers the exact ten-path recovery write-set');
assert.ok(Object.values(manifest.generated_source_sha256).every((hash) => /^[0-9a-f]{64}$/.test(hash)), 'manifest pins every generated recovery source hash');

console.log('✓ Phase 1 nickname recovery source/SQL tests');
