#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const root = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const toneSql = read('supabase/sql/2026-08-16_phase1_tone_round_atomic.sql');
const scoreSql = read('supabase/sql/2026-08-16_phase1_score_submit_atomic.sql');
const legoSql = read('supabase/sql/2026-08-16_phase1_lego_daily_idempotency.sql');
const toneEdge = read('supabase/functions/tone-round/index.ts');
const scoreEdge = read('supabase/functions/score-submit/index.ts');
const legoEdge = read('supabase/functions/lego-daily-limit/index.ts');
const toneClient = read('js/games/tone-server.js');
const scoreClient = read('js/games/reading-auth.js');
const legoClient = read('js/games/lego-game-app.js');
let passed = 0;

function test(label, fn) {
  try { fn(); passed++; console.log('✓ ' + label); }
  catch (error) { console.error('✗ ' + label + ': ' + error.message); process.exitCode = 1; }
}

function serviceOnly(sql, signature) {
  assert.match(sql, /language plpgsql\s+security definer\s+set search_path = public, pg_temp/i);
  assert.match(sql, new RegExp('revoke all on function public\\.' + signature));
  assert.match(sql, /from public, anon, authenticated/);
  assert.match(sql, /grant execute on function[\s\S]+to service_role/);
}

test('tone-round transaction serializes per account and persists an exact replay result', () => {
  assert.match(toneSql, /create table if not exists public\.tone_round_operations/);
  assert.match(toneSql, /operation_id uuid primary key/);
  assert.match(toneSql, /pg_advisory_xact_lock\(hashtextextended\('phase1-tone-account:'/);
  assert.match(toneSql, /from public\.tone_round_operations[\s\S]+for update/);
  assert.match(toneSql, /from public\.tone_srs_state[\s\S]+for update/);
  assert.match(toneSql, /from public\.game_accounts[\s\S]+for update/);
  assert.match(toneSql, /insert into public\.star_ledger/);
  assert.match(toneSql, /insert into public\.tone_round_operations/);
  assert.match(toneSql, /return v_operation\.response \|\| jsonb_build_object\([\s\S]+?'idempotent', true,[\s\S]+?'totalStars', v_account\.stars/);
  serviceOnly(toneSql, 'phase1_tone_round_commit');
});

test('tone-round Edge fails closed on reads/commit and never performs split writes', () => {
  assert.match(toneEdge, /if \(accountRead\.error\).*account_read_unavailable/);
  assert.match(toneEdge, /if \(srsRead\.error\).*srs_read_unavailable/);
  assert.match(toneEdge, /admin\.rpc\("phase1_tone_round_commit"/);
  assert.match(toneEdge, /tone_round_operations[\s\S]+request_hash,response/);
  assert.match(toneEdge, /const earlyReplay = await committedReplayResponse\(\)/);
  assert.match(toneEdge, /if \(!R\.ok\) \{[\s\S]{0,120}const concurrentReplay = await committedReplayResponse\(\)/);
  assert.doesNotMatch(toneEdge, /from\("tone_srs_state"\)\s*\.update/);
  assert.doesNotMatch(toneEdge, /from\("game_accounts"\)\.upsert/);
  assert.doesNotMatch(toneEdge, /from\("star_ledger"\)\.insert/);
});

test('tone-round client retries once with the same generated round id', () => {
  assert.strictEqual((toneClient.match(/round_id: roundId\(\)/g) || []).length, 1);
  assert.match(toneClient, /var payload = \{/);
  assert.match(toneClient, /for \(var attempt=0; attempt<2; attempt\+\+\)/);
  assert.match(toneClient, /functions\.invoke\('tone-round', \{ body: payload \}\)/);
  assert.match(toneClient, /NetworkGuard\.request[\s\S]+12000/);
});

test('score submission is one atomic authoritative+mirror+marker transaction', () => {
  assert.match(scoreSql, /pg_advisory_xact_lock\(hashtextextended\('phase1-score:'/);
  assert.match(scoreSql, /insert into public\.game_score_submissions/);
  assert.match(scoreSql, /insert into public\.tone_sessions/);
  assert.match(scoreSql, /insert into public\.reading_sessions/);
  assert.match(scoreSql, /set legacy_mirrored_at = now\(\)/);
  assert.match(scoreSql, /score_version = 's29-v2-atomic'/);
  assert.match(scoreSql, /legacy_mirror_ambiguous/);
  serviceOnly(scoreSql, 'phase1_score_submit_commit');
});

test('score Edge derives mirror history from validated hash-covered evidence only', () => {
  assert.match(scoreEdge, /function canonicalMirrorItems\(accepted/);
  assert.match(scoreEdge, /accepted\.evidence\.items/);
  assert.match(scoreEdge, /admin\.rpc\('phase1_score_submit_commit'/);
  assert.doesNotMatch(scoreEdge, /Array\.isArray\(body\.wrong_items\)/);
  assert.doesNotMatch(scoreEdge, /from\('game_score_submissions'\)\.insert/);
  assert.doesNotMatch(scoreEdge, /from\('tone_sessions'\)\.insert/);
  assert.doesNotMatch(scoreEdge, /from\('reading_sessions'\)\.insert/);
  assert.doesNotMatch(scoreClient, /wrong_items\s*:/);
});

test('Lego quota records one successful consume per identity/day/request id', () => {
  assert.match(legoSql, /primary key \(identity_key, day, request_id\)/);
  assert.match(legoSql, /pg_advisory_xact_lock\(hashtextextended\('phase1-lego:'/);
  assert.match(legoSql, /from public\.lego_daily_limit_requests[\s\S]+for update/);
  assert.match(legoSql, /from public\.lego_daily_limits[\s\S]+for update/);
  assert.match(legoSql, /return jsonb_build_object\([\s\S]+?'idempotent', true/);
  serviceOnly(legoSql, 'lego_consume_daily_idempotent');
});

test('Lego Edge bridges missing legacy ids while invalid explicit ids fail closed', () => {
  assert.match(legoEdge, /hasExplicitRequestId/);
  assert.match(legoEdge, /resolveLegoRequestId/);
  assert.match(legoEdge, /idempotency_required/);
  assert.match(legoEdge, /legacy_bridge_unavailable/);
  assert.match(legoEdge, /supabase\.auth\.getUser\(accessToken\)/);
  assert.match(legoEdge, /identityKey = 'user:' \+ authedUser\.user\.id/);
  assert.match(legoEdge, /identityKey = 'ip:' \+ \(await hashIp\(ip\)\)/);
  assert.match(legoEdge, /rpc\('lego_consume_daily_idempotent'/);
});

test('Lego client reuses uncertain request id and rejects stale owner completions', () => {
  assert.match(legoClient, /legoQuotaPendingAttempt/);
  assert.match(legoClient, /uid:owner\.uid,epoch:owner\.epoch/);
  assert.match(legoClient, /body:\{request_id:attempt\.requestId\}/);
  assert.match(legoClient, /for\(var requestAttempt=0;requestAttempt<2;requestAttempt\+\+\)/);
  assert.match(legoClient, /if\(!legoQuotaSameOwner\(owner\)\) return \{ok:false,reason:'owner_changed'\}/);
  assert.match(legoClient, /if\(legoQuotaPendingAttempt===attempt\) legoQuotaPendingAttempt=null/);
  assert.match(legoClient, /if\(quota\._owner&&!legoQuotaSameOwner\(quota\._owner\)\) quota=\{ok:false,reason:'owner_changed'\}/);
});

test('current pages ship the transaction-aware clients in dependency order', () => {
  for (const page of ['tone-finder.html','reading-game.html','listening-game.html','typing-game.html','word-order.html']) {
    const html = read(page);
    assert.match(html, /tone-server\.js\?v=4/, page);
    assert.match(html, /reading-auth\.js\?v=23/, page);
  }
  const lego = read('lego.html');
  assert.match(lego, /network-guard\.js\?v=1[\s\S]+lego-game-app\.js\?v=3/);
  assert.match(lego, /reading-auth\.js\?v=23/);
  assert.match(read('vault.html'), /reading-auth\.js\?v=23/);
});

if (!process.exitCode) console.log('\n✅ Phase 1 backend transaction contracts passed (' + passed + ' checks)');
