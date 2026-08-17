#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
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
  return /practice-events\.js\?v=3[\s\S]*game-flow\.js\?v=5/.test(html);
}));
check('personal content loads authenticated status evidence before its UI', /practice-events\.js\?v=2[\s\S]*personal-content\.js\?v=4/.test(read('vault.html')));

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((ok, fail) => { resolve = ok; reject = fail; });
  return { promise, resolve, reject };
}
function memoryStorage() {
  const values = new Map();
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
  };
}
function report(roundId) {
  return {
    schema_version: 'round-report-v1',
    round_id: roundId,
    game_type: 'reading',
    ended_at: '2026-08-17T03:00:00.000Z',
    items: [{
      content_ref: { source: 'game_words', key: 'กา@1' },
      is_correct: true,
      wrong_count: 0,
      hint_used: false,
      listen_count: 1,
    }],
  };
}
function runtimeHarness({ withNetworkGuard = true } = {}) {
  const localStorage = memoryStorage();
  const invocations = [];
  const authListeners = [];
  const eventListeners = {};
  const context = {
    Promise,
    JSON,
    Object,
    Number,
    String,
    Math,
    localStorage,
    console: { warn() {} },
    SITE_AUTH: {
      user: { id: 'owner-a' },
      learningOwnerEpoch: 1,
      onChange(listener) { authListeners.push(listener); },
    },
    getSupabaseClient() {
      return { functions: { invoke(_name, options) {
        const pending = deferred();
        invocations.push({ payload: options.body, ...pending });
        return pending.promise;
      } } };
    },
    addEventListener(name, listener) { eventListeners[name] = listener; },
  };
  if (withNetworkGuard) context.NetworkGuard = { request(request) { return request(); } };
  context.window = context;
  vm.runInNewContext(client, context, { filename: 'practice-events.js' });
  return {
    context,
    invocations,
    setOwner(id, epoch, emit = false) {
      context.SITE_AUTH.user = id ? { id } : null;
      context.SITE_AUTH.learningOwnerEpoch = epoch;
      if (emit) authListeners.forEach((listener) => listener(context.SITE_AUTH.user));
    },
  };
}
async function tick() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}
async function waitFor(predicate) {
  for (let attempt = 0; attempt < 20; attempt++) {
    if (predicate()) return true;
    await new Promise((resolve) => setImmediate(resolve));
  }
  return predicate();
}

{
  const h = runtimeHarness();
  const first = h.context.PracticeEvents.submitReport(report('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'));
  await tick();
  const second = h.context.PracticeEvents.submitReport(report('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'));
  check('one in-flight owner queue starts only the first report', h.invocations.length === 1 && h.context.PracticeEvents.pendingCount() === 2);
  h.invocations[0].resolve({ data: { ok: true }, error: null });
  const secondStarted = await waitFor(() => h.invocations.length === 2);
  check('a report queued during an active flush is drained next instead of deleted', secondStarted && h.invocations[1].payload.round_id === 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' && h.context.PracticeEvents.pendingCount() === 1);
  if (secondStarted) h.invocations[1].resolve({ data: { ok: true }, error: null });
  await Promise.all([first, second]);
  check('same-owner concurrent queue drains without residue', h.context.PracticeEvents.pendingCount() === 0);
}

{
  const h = runtimeHarness();
  const first = h.context.PracticeEvents.submitReport(report('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'));
  await tick();
  h.setOwner('owner-b', 2, true);
  const second = h.context.PracticeEvents.submitReport(report('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'));
  h.invocations[0].resolve({ data: { ok: true }, error: null });
  const secondStarted = await waitFor(() => h.invocations.length === 2);
  check('owner switch schedules the new owner queue after the old request', secondStarted && h.invocations[1].payload.round_id === 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
  check('late old-owner acknowledgement cannot delete the new owner report', h.context.PracticeEvents.pendingCount() === 1);
  if (secondStarted) h.invocations[1].resolve({ data: { ok: true }, error: null });
  await Promise.all([first, second]);
  check('new owner queue drains without an external online event', h.context.PracticeEvents.pendingCount() === 0);
}

{
  const h = runtimeHarness();
  const first = h.context.PracticeEvents.submitReport(report('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'));
  await tick();
  h.invocations[0].reject(new Error('offline'));
  await first;
  check('transient failure preserves the queued report and releases the flush lock', h.context.PracticeEvents.pendingCount() === 1);
  const retry = h.context.PracticeEvents.flush();
  const retryStarted = await waitFor(() => h.invocations.length === 2);
  check('explicit retry starts a new bounded invocation', retryStarted);
  if (retryStarted) h.invocations[1].resolve({ data: { ok: true }, error: null });
  await retry;
  check('successful retry removes only its acknowledged report', h.context.PracticeEvents.pendingCount() === 0);
}

{
  const h = runtimeHarness({ withNetworkGuard: false });
  await h.context.PracticeEvents.submitReport(report('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'));
  check('missing NetworkGuard fails closed without an unbounded Edge invocation', h.invocations.length === 0 && h.context.PracticeEvents.pendingCount() === 1);
}

{
  const h = runtimeHarness();
  const request = h.context.PracticeEvents.status([{ kind: 'word', key: 'กา' }]);
  await tick();
  h.setOwner('owner-b', 2);
  h.invocations[0].resolve({ data: { ok: true, items: { 'word:กา': { played: true } } }, error: null });
  const result = await request;
  check('late Played status from an old owner is discarded', Object.keys(result).length === 0);
}

if (failures.length) {
  failures.forEach((label) => console.error('✗ ' + label));
  process.exit(1);
}
console.log('\nPractice Events Phase 1: ' + pass + '/' + pass + ' PASS');
