#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createTypingRoundClient } from '../js/games/typing-round-client.mjs';
import { handleTypingRoundAction, TYPING_ROUND_ACTIONS_ENABLED } from '../supabase/functions/score-submit/typing-round-service.mjs';
import { handleTypingRoundStart } from '../supabase/functions/score-submit/typing-round-issuance.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const foundation = path.join(root, 'supabase/migrations/20260922175100_phase1_typing_server_round_event_foundation.sql');
const migration = path.join(root, 'supabase/migrations/20260923060514_phase1_typing_atomic_continuation.sql');
const rollback = path.join(root, 'supabase/recovery/phase1-typing-atomic-continuation/rollback.sql');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'typing-continuation-db-'));
const data = path.join(temp, 'data');
const socket = path.join(temp, 'socket');
const fixture = path.join(temp, 'fixture.sql');
const port = String(60000 + (process.pid % 1000));
const userId = '10000000-0000-4000-8000-000000000001';
const raceUserId = '10000000-0000-4000-8000-000000000002';

fs.mkdirSync(socket);
fs.writeFileSync(fixture, `
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users(id uuid primary key);
insert into auth.users(id) values ('${userId}'), ('${raceUserId}');
grant usage on schema public to service_role;
`);

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', ...options });
  if (result.status !== 0) {
    throw new Error(`${command} failed\n${result.stdout || ''}\n${result.stderr || ''}`);
  }
  return result.stdout || '';
}

function psql(sql) {
  return run('psql', [
    '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-h', socket, '-p', port,
    '-d', 'postgres', '-At', '-c', sql,
  ]).trim();
}

function psqlAsync(sql) {
  return new Promise((resolve, reject) => {
    const child = spawn('psql', [
      '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-h', socket, '-p', port,
      '-d', 'postgres', '-At', '-c', sql,
    ], { encoding: 'utf8' });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (status) => {
      if (status === 0) resolve(stdout.trim());
      else reject(new Error(`psql failed\n${stdout}\n${stderr}`));
    });
  });
}

function asService(sql) {
  return psql(`set role service_role; ${sql}`);
}

function json(sql) {
  return JSON.parse(asService(sql));
}

async function jsonAsync(sql) {
  return JSON.parse(await psqlAsync(`set role service_role; ${sql}`));
}

function quote(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function operationId(number) {
  return `00000000-0000-4000-8000-${number.toString(16).padStart(12, '0')}`;
}

function hash(char) {
  return char.repeat(64);
}

const basePrompts = [1, 2, 3, 4, 5].map((index) => ({
  content_ref: { source: 'game_words', key: `typing-word-${index}` },
  answer: `คำ${index}`,
  golden: index === 3,
  srs_bonus: index === 2,
}));

function createCall(op, requestHash, level, prompts = basePrompts, ownerId = userId) {
  return `select public.phase1_typing_round_create(
    ${quote(op)}::uuid, ${quote(ownerId)}::uuid, ${quote(requestHash)},
    ${level}::smallint, 4::bigint, ${quote(JSON.stringify(prompts))}::jsonb
  )::text;`;
}

function appendPromptsCall(op, requestHash, roundId, expected, prompts, ownerId = userId) {
  return `select public.phase1_typing_round_append_prompts(
    ${quote(op)}::uuid, ${quote(ownerId)}::uuid, ${quote(requestHash)},
    ${quote(roundId)}::uuid, ${expected}::bigint, ${quote(JSON.stringify(prompts))}::jsonb
  )::text;`;
}

function eventCall(op, requestHash, roundId, sequence, promptOrdinal, type, answer = null, ownerId = userId) {
  const answerSql = answer == null ? 'null::text' : `${quote(answer)}::text`;
  return `select public.phase1_typing_round_append_event(
    ${quote(op)}::uuid, ${quote(ownerId)}::uuid, ${quote(requestHash)},
    ${quote(roundId)}::uuid, ${sequence}::bigint, ${promptOrdinal}::bigint,
    ${quote(type)}, ${answerSql}
  )::text;`;
}

function reserveCall(batch, round, count, prompts, owner = userId, requestHash = hash('a')) {
  return `select public.phase1_typing_round_append_reserve(
    ${quote(batch)}::uuid, ${quote(owner)}::uuid, ${quote(requestHash)},
    ${quote(round)}::uuid, ${count}::bigint, ${quote(JSON.stringify(prompts))}::jsonb)::text;`;
}
function load(round, owner = userId) {
  return json(`select public.phase1_typing_round_load(${quote(owner)}::uuid, ${quote(round)}::uuid,
    0::bigint, 0::bigint, 64::smallint)::text;`);
}
function reserveState(round) {
  return JSON.parse(psql(`select coalesce((select to_jsonb(s) from public.phase1_typing_round_reserve_state s
    where round_id=${quote(round)}::uuid), 'null'::jsonb)::text;`));
}
function snapshot(round, includeReserve = true) {
  const tables = ['rounds', 'prompts', 'events', 'operations',
    ...(includeReserve ? ['reserve_state', 'reserve_prompts', 'reserve_batches'] : [])];
  return tables.map(suffix => {
    const table = suffix === 'rounds' ? 'phase1_typing_rounds' : 'phase1_typing_round_' + suffix;
    return psql(`select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]'::jsonb)::text
      from public.${table} t where round_id=${quote(round)}::uuid;`);
  }).join('\n');
}
let serial = 100;
const nextOp = () => operationId(serial++);
const prompt = (key, golden = false, srs_bonus = false) => ({
  content_ref: { source: 'game_words', key }, answer: 'synthetic-answer-' + key, golden, srs_bonus,
});
const event = (round, sequence, ordinal, type, answer = null, owner = userId, op = nextOp()) =>
  eventCall(op, hash('b'), round, sequence, ordinal, type, answer, owner);
function create(owner = userId, level = 1, prompts = basePrompts) {
  const result = json(createCall(nextOp(), hash('c'), level, prompts, owner));
  assert.equal(result.ok, true);
  return result.round_id;
}
let started = false;
try {
  run('initdb', ['-D', data, '--no-locale', '--encoding=UTF8', '--auth=trust']);
  run('pg_ctl', ['-D', data, '-l', path.join(temp, 'postgres.log'),
    '-o', `-F -c listen_addresses='' -p ${port} -k ${socket}`, '-w', 'start']);
  started = true;
  const apply = file => run('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-h', socket, '-p', port,
    '-d', 'postgres', '-f', file]);
  apply(fixture);
  apply(foundation);
  const eventSignature = 'public.phase1_typing_round_append_event(uuid,uuid,text,uuid,bigint,bigint,text,text)';
  const originalEvent = psql(`select pg_get_functiondef(${quote(eventSignature)}::regprocedure);`);
  apply(migration);
  apply(migration);
  assert.equal(psql(`select exists (
    select 1 from pg_index i join pg_attribute a on a.attrelid = i.indrelid
    where i.indrelid = 'public.phase1_typing_round_reserve_batches'::regclass
      and a.attname = 'user_id' and i.indkey[0] = a.attnum
      and i.indisvalid and i.indpred is null
  );`), 't');

  const tables = ['phase1_typing_round_reserve_state', 'phase1_typing_round_reserve_prompts', 'phase1_typing_round_reserve_batches'];
  for (const table of tables) {
    assert.equal(psql(`select relrowsecurity and relforcerowsecurity from pg_class where oid='public.${table}'::regclass;`), 't');
    for (const role of ['anon', 'authenticated']) {
      for (const privilege of ['select','insert','update','delete','truncate','references','trigger']) {
        assert.equal(psql(`select has_table_privilege('${role}','public.${table}','${privilege}');`), 'f');
      }
    }
  }
  const reserveSignature = 'public.phase1_typing_round_append_reserve(uuid,uuid,text,uuid,bigint,jsonb)';
  for (const role of ['anon', 'authenticated']) {
    for (const signature of [eventSignature, reserveSignature]) {
      assert.equal(psql(`select has_function_privilege('${role}', ${quote(signature)}, 'execute');`), 'f');
    }
    assert.throws(() => psql(`set role ${role}; select * from public.phase1_typing_round_reserve_prompts;`), /permission denied/);
  }
  assert.equal(psql(`select count(*) from pg_proc where oid in (${quote(eventSignature)}::regprocedure,
    ${quote(reserveSignature)}::regprocedure) and (prosecdef or proconfig is distinct from ARRAY['search_path=""']);`), '0');

  const round = create();
  const repeatedSkipped = { ...basePrompts[1], golden: true, srs_bonus: true };
  const extra = prompt('next-six', false, true);
  const reserve = [basePrompts[0], basePrompts[4], repeatedSkipped, extra, prompt('unused')];
  const batch = nextOp();
  const batchSql = reserveCall(batch, round, 0, reserve);
  assert.equal(json(batchSql).reserve_count, 5);
  assert.equal(json(batchSql).idempotent, true);
  assert.equal(json(reserveCall(batch, round, 0, [extra])).reason, 'replay_conflict');
  assert.equal(json(reserveCall(batch, round, 0, reserve, raceUserId)).reason, 'replay_conflict');
  assert.equal(json(reserveCall(nextOp(), round, 5, [extra], raceUserId)).reason, 'round_not_found');
  assert.equal(json(reserveCall(nextOp(), round, 0, [extra])).reason, 'resync_required');
  let before = snapshot(round);
  for (const invalid of [[], Array(65).fill(extra), {}, [extra, { ...extra, answer: 5 }],
      [extra, { ...extra, content_ref: { source: 'game_words', key: 5 } }]]) {
    assert.equal(json(reserveCall(nextOp(), round, 5, invalid)).ok, false);
    assert.equal(snapshot(round), before);
  }
  assert.equal(json(event(round, 1, 1, 'completed', 'คำ1')).completed_count, 1);
  assert.equal(json(event(round, 2, 2, 'skipped')).skip_count, 1);
  assert.equal(json(event(round, 3, 3, 'completed', 'คำ3')).completed_count, 2);
  assert.equal(json(event(round, 4, 4, 'skipped')).skip_count, 2);
  assert.equal(reserveState(round).reserve_cursor, 0);
  const tailOp = nextOp();
  const tailSql = event(round, 5, 5, 'completed', 'คำ5', userId, tailOp);
  const tail = json(tailSql);
  assert.equal(tail.completed_count, 3);
  assert.equal(tail.current_prompt_ordinal, 6);
  assert.equal(reserveState(round).reserve_cursor, 3);
  assert.equal(load(round).round.prompt_count, 6);
  const issued = JSON.parse(psql(`select to_jsonb(p) from public.phase1_typing_round_prompts p
    where round_id=${quote(round)}::uuid and prompt_ordinal=6;`));
  assert.equal(issued.content_key, repeatedSkipped.content_ref.key);
  assert.equal(issued.golden, true);
  assert.equal(issued.srs_bonus, true);
  before = snapshot(round);
  assert.deepEqual(json(tailSql), { ...tail, idempotent: true });
  assert.equal(snapshot(round), before);
  assert.equal(json(event(round, 5, 5, 'skipped', null, userId, tailOp)).reason, 'replay_conflict');
  assert.equal(json(event(round, 6, 6, 'completed', 'คำ2')).completed_count, 4);
  const finished = json(event(round, 7, 7, 'completed', extra.answer));
  assert.equal(finished.completed_count, 5);
  assert.equal(finished.status, 'completed');
  assert.equal(finished.skip_count, 2);
  assert.equal(reserveState(round).reserve_cursor, 4);
  assert.equal(json(batchSql).idempotent, true);
  assert.equal(json(reserveCall(nextOp(), round, 5, [extra])).reason, 'round_not_active');
  assert.equal(load(round).event_page.length, 7);
  assert.equal(Object.hasOwn(load(round).round, 'reserve_cursor'), false);
  assert.equal(Object.hasOwn(load(round), 'reserve_page'), false);
  before = snapshot(round);
  apply(migration);
  assert.equal(snapshot(round), before);

  const emptyRound = create(raceUserId, 2);
  for (let n = 1; n <= 4; n++) assert.equal(json(event(emptyRound, n, n, 'skipped', null, raceUserId)).ok, true);
  assert.equal(json(event(emptyRound, 5, 5, 'wrong', null, raceUserId)).ok, true);
  assert.equal(json(event(emptyRound, 6, 5, 'hint_opened', null, raceUserId)).ok, true);
  const exhaustedOp = nextOp();
  const exhaustedSql = event(emptyRound, 7, 5, 'skipped', null, raceUserId, exhaustedOp);
  before = snapshot(emptyRound);
  assert.equal(json(exhaustedSql).reason, 'typing_reserve_exhausted');
  assert.equal(snapshot(emptyRound), before);
  assert.equal(json(event(emptyRound, 7, 5, 'completed', 'wrong', raceUserId)).reason, 'answer_mismatch');
  assert.equal(snapshot(emptyRound), before);

  // Inject faults after tentative writes to prove that the RPC transaction unwinds all rows.
  const failedBatch = nextOp();
  psql(`create function public.test_reject_batch() returns trigger language plpgsql as $$
    begin if new.batch_id=${quote(failedBatch)}::uuid then raise exception 'injected batch failure'; end if;
    return new; end; $$;
    create trigger reject_batch before insert on public.phase1_typing_round_reserve_batches
    for each row execute function public.test_reject_batch();`);
  assert.throws(() => json(reserveCall(failedBatch, emptyRound, 0, [extra], raceUserId)), /injected batch failure/);
  assert.equal(snapshot(emptyRound), before);
  psql('drop trigger reject_batch on public.phase1_typing_round_reserve_batches; drop function public.test_reject_batch();');
  assert.equal(json(reserveCall(failedBatch, emptyRound, 0, [extra], raceUserId)).ok, true);
  before = snapshot(emptyRound);
  psql(`create function public.test_reject_event() returns trigger language plpgsql as $$
    begin if new.operation_id=${quote(exhaustedOp)}::uuid then raise exception 'injected event failure'; end if;
    return new; end; $$;
    create trigger reject_event before insert on public.phase1_typing_round_events
    for each row execute function public.test_reject_event();`);
  assert.throws(() => json(exhaustedSql), /injected event failure/);
  assert.equal(snapshot(emptyRound), before);
  psql('drop trigger reject_event on public.phase1_typing_round_events; drop function public.test_reject_event();');
  assert.equal(json(exhaustedSql).ok, true);
  assert.equal(json(exhaustedSql).idempotent, true);
  assert.equal(reserveState(emptyRound).reserve_cursor, 1);

  const concurrencyOwner = '10000000-0000-4000-8000-000000000003';
  const sameIdOwner = '10000000-0000-4000-8000-000000000004';
  psql(`insert into auth.users values (${quote(concurrencyOwner)}), (${quote(sameIdOwner)});`);
  const raceRound = create(concurrencyOwner);
  const sameRound = create(sameIdOwner, 2);
  const sameBatchSql = reserveCall(nextOp(), raceRound, 0, [extra], concurrencyOwner);
  const sameBatches = await Promise.all([jsonAsync(sameBatchSql), jsonAsync(sameBatchSql)]);
  assert.equal(sameBatches.filter(r => r.ok && !r.idempotent).length, 1);
  assert.equal(sameBatches.filter(r => r.ok && r.idempotent).length, 1);
  const differentBatches = await Promise.all([
    jsonAsync(reserveCall(nextOp(), sameRound, 0, [extra], sameIdOwner)),
    jsonAsync(reserveCall(nextOp(), sameRound, 0, [prompt('other')], sameIdOwner)),
  ]);
  assert.equal(differentBatches.filter(r => r.ok).length, 1);
  assert.equal(differentBatches.filter(r => r.reason === 'resync_required').length, 1);
  for (const [r, owner] of [[raceRound, concurrencyOwner], [sameRound, sameIdOwner]]) {
    for (let n = 1; n <= 4; n++) assert.equal(json(event(r, n, n, 'skipped', null, owner)).ok, true);
  }
  const racingEvents = await Promise.all([
    jsonAsync(event(raceRound, 5, 5, 'skipped', null, concurrencyOwner)),
    jsonAsync(event(raceRound, 5, 5, 'completed', 'คำ5', concurrencyOwner)),
  ]);
  assert.equal(racingEvents.filter(r => r.ok).length, 1);
  assert.equal(racingEvents.filter(r => r.reason === 'resync_required').length, 1);
  assert.equal(load(raceRound, concurrencyOwner).round.prompt_count, 6);
  assert.equal(reserveState(raceRound).reserve_cursor, 1);
  const identicalSql = event(sameRound, 5, 5, 'skipped', null, sameIdOwner);
  const identicalEvents = await Promise.all([jsonAsync(identicalSql), jsonAsync(identicalSql)]);
  assert.equal(identicalEvents.filter(r => r.ok && !r.idempotent).length, 1);
  assert.equal(identicalEvents.filter(r => r.ok && r.idempotent).length, 1);
  assert.equal(load(sameRound, sameIdOwner).round.prompt_count, 6);
  assert.equal(reserveState(sameRound).reserve_cursor, 1);
  before = snapshot(sameRound);
  assert.equal(json(event(sameRound, 6, 6, 'skipped', null, concurrencyOwner)).reason, 'round_not_found');
  assert.equal(snapshot(sameRound), before);

  // Bounded batches impose no general skip cap; the owner may queue skipped identities later.
  assert.equal(json(reserveCall(nextOp(), sameRound, 1, Array(64).fill(extra), sameIdOwner)).ok, true);
  assert.equal(json(reserveCall(nextOp(), sameRound, 65, [extra, extra], sameIdOwner)).ok, true);
  asService(`do $$ declare n integer; result jsonb; begin
    for n in 6..70 loop
      result := public.phase1_typing_round_append_event(
        ('00000000-0000-4000-9000-' || lpad(n::text,12,'0'))::uuid, ${quote(sameIdOwner)}::uuid,
        ${quote(hash('e'))}, ${quote(sameRound)}::uuid, n::bigint, n::bigint, 'skipped', null);
      if result->>'ok' <> 'true' then raise exception 'skip % failed: %', n, result; end if;
    end loop; end $$;`);
  assert.equal(load(sameRound, sameIdOwner).round.skip_count, 70);
  assert.equal(load(sameRound, sameIdOwner).round.completed_count, 0);
  assert.equal(load(sameRound, sameIdOwner).round.prompt_count, 71);

  // Integration added only after the backend and inactive client each passed
  // unrelated unit review. Real client -> real Edge service/reducer -> real SQL.
  // This is synthetic, with no HTTP Auth/DOM/IME or final learning-commit claim.
  assert.equal(TYPING_ROUND_ACTIONS_ENABLED, false);
  const stackOwner = '10000000-0000-4000-8000-000000000009';
  psql(`insert into auth.users values (${quote(stackOwner)});`);
  const stackPrompts = Array.from({ length: 6 }, (_, n) => prompt(`stack-${n}`));
  stackPrompts[5].golden = true;
  stackPrompts[5].srs_bonus = true;
  const stackRound = create(stackOwner, 1, stackPrompts.slice(0, 5));
  assert.equal(json(reserveCall(nextOp(), stackRound, 0, stackPrompts.slice(5), stackOwner)).ok, true);
  psql(`create table public.game_words(content_key text primary key, level text,
    canonical_record jsonb, status text, access_tier text);
    grant select on public.game_words to service_role;`);
  for (const p of stackPrompts) {
    const record = { contentKey: p.content_ref.key, word: p.answer, level: '初', syllables: [{}] };
    psql(`insert into public.game_words values (${quote(record.contentKey)}, '初',
      ${quote(JSON.stringify(record))}::jsonb, 'active', 'login');`);
  }
  function query(read) {
    return { retry(value) { assert.equal(value, false); return this; },
      abortSignal(signal) { signal.throwIfAborted(); return this; },
      then(resolve, reject) { return Promise.resolve().then(read).then(data => ({ data })).then(resolve, reject); } };
  }
  const stackAdmin = {
    rpc(name, args) {
      assert.ok(['phase1_typing_round_load', 'phase1_typing_round_append_event'].includes(name));
      const params = Object.entries(args).map(([key, value]) => `${key} => ${value === null ? 'null'
        : typeof value === 'number' ? `${value}::${key === 'p_page_size' ? 'smallint' : 'bigint'}` : quote(value)}`);
      return query(() => json(`select public.${name}(${params.join(',')})::text;`));
    },
    from(name) {
      assert.equal(name, 'game_words'); let keys; let level;
      return Object.assign(query(() => JSON.parse(asService(`select coalesce(jsonb_agg(t), '[]'::jsonb)::text
        from public.game_words t where level=${quote(level)} and content_key in (${keys.map(quote).join(',')});`))), {
        select() { return this; }, in(_field, values) { keys = values; return this; },
        eq(_field, value) { level = value; return this; },
      });
    },
  };
  const entries = new Map();
  const storage = { getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => entries.set(key, value), removeItem: (key) => entries.delete(key) };
  let loseResponse = false;
  const sent = [];
  const transport = async (body) => {
    sent.push(structuredClone(body));
    const response = await handleTypingRoundAction({ admin: stackAdmin, user: { id: stackOwner }, body, enabled: true });
    if (loseResponse) { loseResponse = false; throw new Error('synthetic lost response after SQL commit'); }
    return response;
  };
  const newClient = () => {
    const client = createTypingRoundClient({ transport, storage, createOperationId: nextOp });
    client.setOwner({ scopeId: 'fixture_stack_owner', contextToken: 'fixture_stack_session' });
    return client;
  };
  let client = newClient(); await client.resume(stackRound);
  for (let n = 0; n < 4; n++) await client.sendEvent({ type: 'skipped' });
  assert.equal(client.getState().checkpoint.completedCount, 0);
  assert.equal(reserveState(stackRound).reserve_cursor, 0);
  loseResponse = true;
  await assert.rejects(() => client.sendEvent({ type: 'skipped' }), /transport_unavailable/);
  const lostRequest = structuredClone(sent.at(-1));
  assert.equal(client.getState().checkpoint.skipCount, 4); // confirmed state never advances optimistically
  assert.equal(load(stackRound, stackOwner).round.skip_count, 5);
  assert.equal(reserveState(stackRound).reserve_cursor, 1);
  client = newClient(); await client.resume(stackRound);
  assert.deepEqual(sent.at(-1), lostRequest);
  assert.equal(client.getState().checkpoint.skipCount, 5);
  assert.equal(client.getState().currentPrompt.content_ref.key, 'stack-5');
  assert.equal(client.getState().currentPrompt.golden, true);
  assert.equal(load(stackRound, stackOwner).round.prompt_count, 6);
  before = snapshot(stackRound);
  await assert.rejects(() => client.sendEvent({ type: 'skipped' }), /typing_reserve_exhausted/);
  assert.equal(client.getState().status, 'blocked'); // definite 409; journal retained for refill/retry
  assert.equal(snapshot(stackRound), before);
  const waitingRequest = structuredClone(sent.at(-1));
  assert.equal(json(reserveCall(nextOp(), stackRound, 1, stackPrompts.slice(0, 5), stackOwner)).ok, true);
  await client.retryPending();
  assert.deepEqual(sent.at(-1), waitingRequest);
  assert.equal(client.getState().checkpoint.skipCount, 6);
  for (let n = 0; n < 5; n++) {
    assert.equal(client.getState().currentPrompt.content_ref.key, `stack-${n}`);
    await client.sendEvent({ type: 'completed', answer: stackPrompts[n].answer });
  }
  assert.equal(client.getState().status, 'complete');
  assert.equal(client.getState().checkpoint.completedCount, 5);
  assert.equal(client.getState().checkpoint.skipCount, 6);
  assert.equal(client.getState().checkpoint.finalScore, 70); // 10+10+15+15+20; no round bonuses after 6 Skips
  assert.equal(client.getState().currentPrompt, null);
  assert.equal(entries.size, 0);
  assert.equal(load(stackRound, stackOwner).round.next_event_sequence, 12);
  assert.equal(load(stackRound, stackOwner).round.prompt_count, 11);
  assert.equal(reserveState(stackRound).reserve_cursor, 6);
  console.log('Typing real client/Edge/reducer/SQL stack: lost-response reload, exhaustion/refill replay, ordered Skip and five completions: PASS');

  // Internal issuance composes the actual planner, durable operation receipt,
  // create transaction and public Resume projection. All owners are fixtures;
  // this does not pretend to implement the still-missing live context owner.
  const issuanceOwners = ['10000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000007'];
  psql(`insert into auth.users(id) values ${issuanceOwners.map(id => `(${quote(id)})`).join(',')};`);
  const trustedCatalog = stackPrompts.slice(0, 5).map(p => ({ content_key: p.content_ref.key,
    level: '初', status: 'active', access_tier: 'login', canonical_record: {
      contentKey: p.content_ref.key, word: p.answer, level: '初', syllables: [{}],
    } }));
  const trustedContext = { startingCombo: 7, today: '2026-09-23', canonicalRows: trustedCatalog,
    snapshots: trustedCatalog.map((row, i) => ({ item_id: `fixture-item-${i}`, state_token: `fixture-token-${i}`,
      content_ref: { source: 'game_words', key: row.content_key }, state: 'normal' })) };
  let contextCalls = 0;
  let createCalls = 0;
  const rawCreateResults = [];
  let loseCreateResponse = true;
  const issuanceAdmin = {
    from(name) {
      if (name !== 'phase1_typing_round_operations') return stackAdmin.from(name);
      let operation;
      return Object.assign(query(() => JSON.parse(asService(`select coalesce((select to_jsonb(t)
        from public.phase1_typing_round_operations t where operation_id=${quote(operation)}::uuid), 'null'::jsonb)::text;`))), {
        select() { return this; }, eq(field, value) { assert.equal(field, 'operation_id'); operation = value; return this; },
        maybeSingle() { return this; },
      });
    },
    rpc(name, args) {
      if (name !== 'phase1_typing_round_create') return stackAdmin.rpc(name, args);
      createCalls++;
      return query(async () => {
        const result = await jsonAsync(`select public.phase1_typing_round_create(
          ${quote(args.p_operation_id)}::uuid, ${quote(args.p_user_id)}::uuid, ${quote(args.p_request_hash)},
          ${args.p_level}::smallint, ${args.p_starting_combo}::bigint, ${quote(JSON.stringify(args.p_prompts))}::jsonb)::text;`);
        rawCreateResults.push(structuredClone(result));
        if (loseCreateResponse) { loseCreateResponse = false; throw new Error('synthetic lost create response'); }
        return result;
      });
    },
  };
  const startBody = { action: 'typing_round_start', operation_id: nextOp(), level: 1 };
  const loadTrustedContext = async ({ userId, level, signal }) => {
    assert.ok(issuanceOwners.includes(userId)); assert.equal(level, 1); signal.throwIfAborted();
    contextCalls++; return structuredClone(trustedContext);
  };
  const start = (body = startBody, owner = issuanceOwners[0], loader = loadTrustedContext) =>
    handleTypingRoundStart({ admin: issuanceAdmin, user: { id: owner }, body, loadTrustedContext: loader, enabled: true });
  const lostStart = await start();
  assert.equal(lostStart.status, 503);
  assert.equal(lostStart.body.operation_id, startBody.operation_id);
  assert.equal(lostStart.body.retry_same_operation, true);
  const issuedStart = json(`select public.phase1_typing_round_load(${quote(issuanceOwners[0])}::uuid, null::uuid,
    0::bigint, 0::bigint, 64::smallint)::text;`);
  const issuanceRound = issuedStart.round.round_id;
  const issuanceBefore = snapshot(issuanceRound);
  const resumedStart = await start();
  assert.equal(resumedStart.status, 200);
  assert.equal(resumedStart.body.idempotent, true);
  assert.equal(resumedStart.body.operation_id, startBody.operation_id);
  assert.equal(resumedStart.body.checkpoint.roundId, issuanceRound);
  assert.equal(resumedStart.body.checkpoint.combo, 7);
  assert.equal(snapshot(issuanceRound), issuanceBefore);
  assert.equal(contextCalls, 1); assert.equal(createCalls, 1);
  assert.deepEqual(Object.keys(resumedStart.body).sort(), ['ok', 'checkpoint', 'current_prompt', 'operation_id', 'idempotent'].sort());
  assert.equal(JSON.stringify(resumedStart.body).includes('synthetic-answer'), false);
  for (const conflict of [await start({ ...startBody, level: 2 }), await start(startBody, issuanceOwners[1])]) {
    assert.equal(conflict.status, 409); assert.equal(conflict.body.error, 'replay_conflict');
  }
  assert.equal(contextCalls, 1); assert.equal(createCalls, 1);
  assert.equal(snapshot(issuanceRound), issuanceBefore);
  const another = await start({ ...startBody, operation_id: nextOp() });
  assert.equal(another.status, 409); assert.equal(another.body.error, 'active_round_exists');
  assert.equal(snapshot(issuanceRound), issuanceBefore);

  // Force both requests to read absence and prepare before either create RPC.
  // Different trusted Combo candidates guarantee the strict SQL replay payloads
  // differ, independent of random shuffle/Golden draws. The durable winner wins.
  let bothReady; const barrier = new Promise(resolve => { bothReady = resolve; });
  let contenders = 0;
  const raceLoader = async () => {
    const candidate = structuredClone(trustedContext); candidate.startingCombo = 11 + contenders++;
    if (contenders === 2) bothReady();
    await barrier; return candidate;
  };
  const raceStartBody = { ...startBody, operation_id: nextOp() };
  const beforeRaceResults = rawCreateResults.length;
  const racedStarts = await Promise.all([start(raceStartBody, issuanceOwners[1], raceLoader),
    start(raceStartBody, issuanceOwners[1], raceLoader)]);
  assert.deepEqual(racedStarts.map(response => response.status), [200, 200]);
  const raceCreateResults = rawCreateResults.slice(beforeRaceResults);
  assert.equal(raceCreateResults.length, 2);
  assert.equal(raceCreateResults.filter(result => result.ok === true && result.idempotent === false).length, 1);
  assert.equal(raceCreateResults.filter(result => result.ok === false && result.reason === 'replay_conflict').length, 1);
  assert.deepEqual(racedStarts.map(response => response.body.idempotent).sort(), [false, true]);
  assert.deepEqual(racedStarts[0].body.checkpoint, racedStarts[1].body.checkpoint);
  assert.deepEqual(racedStarts[0].body.current_prompt, racedStarts[1].body.current_prompt);
  assert.ok([11, 12].includes(racedStarts[0].body.checkpoint.combo));
  const issuanceRaceRound = racedStarts[0].body.checkpoint.roundId;
  assert.equal(psql(`select count(*) from public.phase1_typing_rounds where user_id=${quote(issuanceOwners[1])}::uuid;`), '1');
  assert.equal(load(issuanceRaceRound, issuanceOwners[1]).prompt_page.length, 5);
  console.log('Typing planner/receipt/create/Resume SQL stack: uncertain replay, no redraw, owner binding, simultaneous first issuance: PASS');

  const rounds = [round, emptyRound, raceRound, sameRound, stackRound, issuanceRound, issuanceRaceRound];
  const beforeRollback = rounds.map(r => snapshot(r, false));
  apply(rollback);
  assert.equal(psql(`select pg_get_functiondef(${quote(eventSignature)}::regprocedure);`), originalEvent);
  assert.deepEqual(rounds.map(r => snapshot(r, false)), beforeRollback);
  for (const table of tables) assert.equal(psql(`select to_regclass('public.${table}') is null;`), 't');
  assert.equal(psql(`select to_regprocedure(${quote(reserveSignature)}) is null;`), 't');
  assert.equal(json(event(emptyRound, 8, 6, 'skipped', null, raceUserId)).reason, 'replacement_prompt_required');
  assert.equal(json(tailSql).idempotent, true);
  console.log('Typing ordered protected reserve, tail atomicity, category preservation, five completions: PASS');
  console.log('Typing exact replay, cross-owner/CAS/concurrency, zero partial writes, no skip cap: PASS');
  console.log('Typing forced RLS, browser denial, unchanged load API, exact rollback preserving round evidence: PASS');
  console.log('TYPING_ATOMIC_CONTINUATION_DB_PASS 5');
} finally {
  if (started) spawnSync('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop'], { encoding: 'utf8' });
  fs.rmSync(temp, { recursive: true, force: true });
}
