#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import {
  LEGACY_LEGO_DEDUPE_MS,
  UUID_V4,
  legacyLegoRequestId,
  resolveLegoRequestId,
} from '../supabase/functions/_shared/phase1-rollout-compatibility.mjs';
import { resolveContentRefItemIds } from '../supabase/functions/practice-events/practice-events-engine.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const toneEdge = read('supabase/functions/tone-round/index.ts');
const legoEdge = read('supabase/functions/lego-daily-limit/index.ts');
const practiceEdge = read('supabase/functions/practice-events/index.ts');
const toneSql = read('supabase/sql/2026-08-16_phase1_tone_round_atomic.sql');
const legoSql = read('supabase/sql/2026-08-16_phase1_lego_daily_idempotency.sql');
const serverRpcAclSql = read('supabase/migrations/20260824000000_phase1_server_rpc_least_privilege.sql');
const toneClient = read('js/games/tone-server.js');
const legoClient = read('js/games/lego-game-app.js');
let passed = 0;

async function test(label, fn) {
  try { await fn(); passed++; console.log('✓ ' + label); }
  catch (error) { console.error('✗ ' + label + ': ' + error.message); process.exitCode = 1; }
}

function quotaHarness(cap = 5) {
  let used = 0;
  const committed = new Map();
  return {
    consume(requestId) {
      if (committed.has(requestId)) return { used: committed.get(requestId), idempotent: true };
      if (used >= cap) return { used, allowed: false, idempotent: false };
      used++;
      committed.set(requestId, used);
      return { used, allowed: true, idempotent: false };
    },
    used: () => used,
  };
}

await test('old Lego client without a body is accepted by the bridge parser', () => {
  assert.match(legoEdge, /let body = \{\};/);
  assert.match(legoEdge, /if \(rawText\.trim\(\)\) body = JSON\.parse\(rawText\)/);
  assert.match(legoEdge, /hasExplicitRequestId = Object\.prototype\.hasOwnProperty\.call\(body, 'request_id'\)/);
});

await test('legacy Lego request ids are stable inside the bounded retry window', async () => {
  const sample = Date.UTC(2026, 7, 16, 4, 0, 5);
  const at = Math.floor(sample / LEGACY_LEGO_DEDUPE_MS) * LEGACY_LEGO_DEDUPE_MS + 100;
  const first = await legacyLegoRequestId('user:abc', '2026-08-16', at);
  const retry = await legacyLegoRequestId('user:abc', '2026-08-16', at + LEGACY_LEGO_DEDUPE_MS - 200);
  assert.equal(first, retry);
  assert.match(first, UUID_V4);
});

await test('legacy retry crossing a time bucket reuses the recent committed bridge id', async () => {
  const createdMs = Date.UTC(2026, 7, 16, 4, 0, 29, 900);
  const requestId = await legacyLegoRequestId('ip:hash', '2026-08-16', createdMs);
  const resolved = await resolveLegoRequestId({
    hasExplicitRequestId: false,
    recentRows: [{ request_id: requestId, created_at: new Date(createdMs).toISOString() }],
    identityKey: 'ip:hash', day: '2026-08-16', nowMs: createdMs + 500,
  });
  assert.equal(resolved.requestId, requestId);
  assert.equal(resolved.legacyCompatibility, true);
  assert.equal(resolved.recentReplay, true);
});

await test('old-client retry and duplicate consume quota once', async () => {
  const now = Date.UTC(2026, 7, 16, 4, 2, 1);
  const a = await resolveLegoRequestId({ hasExplicitRequestId: false, recentRows: [], identityKey: 'user:a', day: '2026-08-16', nowMs: now });
  const b = await resolveLegoRequestId({ hasExplicitRequestId: false, recentRows: [], identityKey: 'user:a', day: '2026-08-16', nowMs: now + 1000 });
  const quota = quotaHarness();
  assert.equal(quota.consume(a.requestId).idempotent, false);
  assert.equal(quota.consume(b.requestId).idempotent, true);
  assert.equal(quota.used(), 1);
});

await test('new client keeps its explicit id across exact retries', async () => {
  const explicit = '12345678-1234-4234-8234-123456789abc';
  const request = await resolveLegoRequestId({ hasExplicitRequestId: true, explicitRequestId: explicit });
  const quota = quotaHarness();
  quota.consume(request.requestId);
  assert.equal(quota.consume(request.requestId).idempotent, true);
  assert.equal(quota.used(), 1);
  assert.equal(request.legacyCompatibility, false);
});

await test('invalid explicit ids fail closed instead of falling back to legacy mode', async () => {
  await assert.rejects(
    resolveLegoRequestId({ hasExplicitRequestId: true, explicitRequestId: 'not-a-uuid' }),
    /invalid_explicit_request_id/
  );
  assert.match(legoEdge, /idempotency_required/);
});

await test('mixed old/new Lego clients receive disjoint ids and legitimate consumes', async () => {
  const now = Date.UTC(2026, 7, 16, 4, 3, 1);
  const oldRequest = await resolveLegoRequestId({ hasExplicitRequestId: false, recentRows: [], identityKey: 'user:mixed', day: '2026-08-16', nowMs: now });
  const newRequest = await resolveLegoRequestId({ hasExplicitRequestId: true, explicitRequestId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' });
  assert.notEqual(oldRequest.requestId, newRequest.requestId);
  const quota = quotaHarness();
  quota.consume(oldRequest.requestId);
  quota.consume(newRequest.requestId);
  assert.equal(quota.used(), 2);
});

await test('Lego bridge preserves server-derived Guest/account identity and atomic RPC', () => {
  assert.match(legoEdge, /identityKey = 'user:' \+ authedUser\.user\.id/);
  assert.match(legoEdge, /identityKey = 'ip:' \+ \(await hashIp\(ip\)\)/);
  assert.match(legoEdge, /from\('lego_daily_limit_requests'\)[\s\S]+\.eq\('identity_key', identityKey\)\.eq\('day', day\)/);
  assert.match(legoEdge, /rpc\('lego_consume_daily_idempotent'/);
  assert.match(legoSql, /primary key \(identity_key, day, request_id\)/);
  assert.match(legoSql, /pg_advisory_xact_lock/);
});

await test('Played bridge sends the exact game content identity without conversion', () => {
  assert.match(practiceEdge, /key: item\.content_ref\.key/);
  assert.doesNotMatch(practiceEdge, /canonicalContentKey/);
});

await test('Played bridge resolves only an exact content identity and never a word-base substitute', () => {
  const exactRows = [{ item_id: 'item-initial', content_source: 'game_words', content_key: 'เขา@初' }];
  assert.deepEqual(
    resolveContentRefItemIds([{ source: 'game_words', key: 'เขา@初' }], exactRows),
    ['item-initial']
  );
  assert.deepEqual(
    resolveContentRefItemIds([{ source: 'game_words', key: 'เขา@高' }], exactRows),
    [null]
  );
  const ambiguousRows = [
    { item_id: 'item-a', content_source: 'game_words', content_key: 'เขา@初' },
    { item_id: 'item-b', content_source: 'game_words', content_key: 'เขา@中' },
  ];
  assert.deepEqual(
    resolveContentRefItemIds([{ source: 'game_words', key: 'เขา@高' }], ambiguousRows),
    [null]
  );
  assert.deepEqual(
    resolveContentRefItemIds([{ source: 'game_sentences', key: 'เขา@高' }], exactRows),
    [null]
  );
  assert.doesNotMatch(practiceEdge, /learningItemRows\(admin, \['game_words'\]\)/);
  assert.match(practiceEdge, /if \(resolved\.some\(\(item: any\) => !item\.item_id\)\) throw new Error\('unknown_content_ref'\)/);
});

await test('Tone accepts missing ids but rejects malformed explicit ids', () => {
  assert.match(toneEdge, /legacyCompatibility = !suppliedOperationId/);
  assert.match(toneEdge, /suppliedOperationId && !UUID_V4\.test\(suppliedOperationId\)/);
  assert.match(toneEdge, /operationId = suppliedOperationId \|\| crypto\.randomUUID\(\)/);
  assert.match(toneEdge, /compatibility: legacyCompatibility \? "legacy-no-id" : "explicit-id"/);
});

await test('Tone legacy duplicates remain transactional and cannot double-award', () => {
  assert.match(toneSql, /pg_advisory_xact_lock\(hashtextextended\('phase1-tone-account:'/);
  assert.match(toneSql, /return jsonb_build_object\('ok', false, 'reason', 'race_retry'\)/);
  assert.match(toneSql, /insert into public\.tone_round_operations/);
  assert.match(toneEdge, /p_expected_stage: srsRow\?\.stage/);
  assert.match(toneEdge, /p_expected_mastered: srsRow\?\.mastered/);
});

await test('new Tone/Lego clients still send one stable id per retry payload', () => {
  assert.strictEqual((toneClient.match(/round_id: roundId\(\)/g) || []).length, 1);
  assert.match(toneClient, /for \(var attempt=0; attempt<2; attempt\+\+\)/);
  assert.match(legoClient, /legoQuotaPendingAttempt/);
  assert.match(legoClient, /body:\{request_id:attempt\.requestId\}/);
  assert.match(legoClient, /for\(var requestAttempt=0;requestAttempt<2;requestAttempt\+\+\)/);
});

await test('server-only RPC least privilege closes browser execute without touching public RLS guards', () => {
  for (const signature of [
    'rl_check\\(uuid, text, integer, integer\\)',
    'payout_precheck\\(uuid\\)',
    'lego_consume_daily\\(text, date, integer\\)',
  ]) {
    assert.match(serverRpcAclSql, new RegExp('revoke all on function public\\.' + signature + '[\\s\\S]+from public, anon, authenticated'));
    assert.match(serverRpcAclSql, new RegExp('grant execute on function public\\.' + signature + '[\\s\\S]+to service_role'));
  }
  assert.match(serverRpcAclSql, /has_function_privilege\('anon', v_signature, 'execute'\)/);
  assert.match(serverRpcAclSql, /has_function_privilege\('authenticated', v_signature, 'execute'\)/);
  assert.match(serverRpcAclSql, /has_function_privilege\('service_role', v_signature, 'execute'\)/);
  assert.doesNotMatch(serverRpcAclSql, /revoke all on function public\.reading_sessions_rate_ok/);
  assert.doesNotMatch(serverRpcAclSql, /revoke all on function public\.tone_sessions_rate_ok/);
  assert.doesNotMatch(serverRpcAclSql, /revoke all on function public\.anon_game_events_rate_ok/);
  assert.doesNotMatch(serverRpcAclSql, /revoke all on function public\.leads_rate_ok/);
});

await test('rollout bridge remains preserved while Login Free activates account clients', () => {
  assert.match(read('tone-finder.html'), /tone-server\.js\?v=6/);
  assert.match(read('tone-finder.html'), /game-account\.js\?v=6/);
  assert.match(read('tone-finder.html'), /practice-events\.js\?v=3/);
  assert.match(read('lego.html'), /lego-game-app\.js\?v=13/);
  assert.match(legoEdge, /compatibility: request\.legacyCompatibility \? 'legacy-no-id' : 'explicit-id'/);
});

if (!process.exitCode) console.log(`\n✅ Phase 1 mixed-version rollout compatibility passed (${passed} checks)`);
