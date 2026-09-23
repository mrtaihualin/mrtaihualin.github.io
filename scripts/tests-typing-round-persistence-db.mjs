#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { handleTypingRoundAction } from '../supabase/functions/score-submit/typing-round-service.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migration = path.join(root, 'supabase/migrations/20260922175100_phase1_typing_server_round_event_foundation.sql');
const rollback = path.join(root, 'supabase/recovery/phase1-typing-round-event/rollback.sql');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'typing-round-db-'));
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
  catalog_version: 'free-canonical-v1',
  record_hash: createHash('sha256').update(`typing-word-${index}`).digest('hex'),
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

function loadCall(roundId, promptAfter = 0, eventAfter = 0, pageSize = 64, ownerId = userId) {
  return `select public.phase1_typing_round_load(
    ${quote(ownerId)}::uuid, ${quote(roundId)}::uuid,
    ${promptAfter}::bigint, ${eventAfter}::bigint, ${pageSize}::smallint
  )::text;`;
}

let started = false;
try {
  run('initdb', ['-D', data, '--no-locale', '--encoding=UTF8', '--auth=trust']);
  run('pg_ctl', [
    '-D', data, '-l', path.join(temp, 'postgres.log'),
    '-o', `-F -c listen_addresses='' -p ${port} -k ${socket}`, '-w', 'start',
  ]);
  started = true;
  run('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-h', socket, '-p', port, '-d', 'postgres', '-f', fixture]);
  run('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-h', socket, '-p', port, '-d', 'postgres', '-f', migration]);

  assert.equal(psql(`select count(*) from pg_class where relname in (
    'phase1_typing_rounds','phase1_typing_round_prompts',
    'phase1_typing_round_events','phase1_typing_round_operations'
  ) and relrowsecurity and relforcerowsecurity;`), '4');
  assert.equal(psql(`select count(*) from
    (values ('anon'), ('authenticated')) roles(role_name)
    cross join (values
      ('public.phase1_typing_rounds'),
      ('public.phase1_typing_round_prompts'),
      ('public.phase1_typing_round_events'),
      ('public.phase1_typing_round_operations')
    ) tables(table_name)
    cross join (values
      ('select'), ('insert'), ('update'), ('delete'),
      ('truncate'), ('references'), ('trigger')
    ) privileges(privilege_name)
    where has_table_privilege(role_name, table_name, privilege_name);`), '0');
  assert.equal(psql(`select count(*) from
    (values ('anon'), ('authenticated')) roles(role_name)
    cross join (values ('usage'), ('select'), ('update')) privileges(privilege_name)
    where has_sequence_privilege(
      role_name, 'public.phase1_typing_round_events_event_id_seq', privilege_name
    );`), '0');
  assert.equal(psql(`select count(*) from
    (values ('anon'), ('authenticated')) roles(role_name)
    cross join (values
      ('public.phase1_typing_round_create(uuid,uuid,text,smallint,bigint,jsonb)'),
      ('public.phase1_typing_round_append_prompts(uuid,uuid,text,uuid,bigint,jsonb)'),
      ('public.phase1_typing_round_append_event(uuid,uuid,text,uuid,bigint,bigint,text,text)'),
      ('public.phase1_typing_round_load(uuid,uuid,bigint,bigint,smallint)')
    ) functions(signature)
    where has_function_privilege(role_name, signature, 'execute');`), '0');
  assert.equal(psql(`select count(*)
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'phase1_typing_round_create', 'phase1_typing_round_append_prompts',
        'phase1_typing_round_append_event', 'phase1_typing_round_load'
      ) and p.prosecdef;`), '0');

  const createOp = operationId(1);
  const created = json(createCall(createOp, hash('a'), 1));
  assert.equal(created.ok, true);
  assert.equal(created.idempotent, false);
  assert.equal(created.level, 1);
  assert.equal(created.prompt_count, 5);
  const roundId = created.round_id;

  const createReplay = json(createCall(createOp, hash('a'), 1));
  assert.equal(createReplay.ok, true);
  assert.equal(createReplay.idempotent, true);
  assert.equal(createReplay.round_id, roundId);
  assert.equal(json(createCall(createOp, hash('b'), 1)).reason, 'replay_conflict');
  assert.equal(json(createCall(createOp, hash('a'), 2)).reason, 'replay_conflict');
  assert.equal(json(createCall(operationId(2), hash('c'), 1)).reason, 'active_round_exists');
  assert.equal(json(createCall(operationId(3), hash('d'), 3)).reason, 'invalid_arguments');
  assert.equal(json(`select public.phase1_typing_round_create(
    ${quote(operationId(30))}::uuid, ${quote(userId)}::uuid, ${quote(hash('e'))},
    1::smallint, 0::bigint, '{}'::jsonb
  )::text;`).reason, 'invalid_arguments');
  assert.equal(json(createCall(operationId(32), hash('e'), 1, Array(65).fill(basePrompts[0]))).reason, 'invalid_arguments');

  const repeatedSkippedPrompt = [{
    content_ref: { source: 'game_words', key: 'typing-word-2' },
    answer: 'คำ2', golden: false, srs_bonus: false,
  }];
  const appendOp = operationId(4);
  const appended = json(appendPromptsCall(appendOp, hash('e'), roundId, 5, repeatedSkippedPrompt));
  assert.equal(appended.ok, true);
  assert.equal(appended.prompt_count, 6);
  assert.equal(json(appendPromptsCall(appendOp, hash('e'), roundId, 5, repeatedSkippedPrompt)).idempotent, true);
  assert.equal(json(appendPromptsCall(appendOp, hash('e'), roundId, 5, [basePrompts[2]])).reason, 'replay_conflict');
  assert.equal(json(appendPromptsCall(operationId(5), hash('f'), roundId, 5, repeatedSkippedPrompt)).reason, 'resync_required');
  assert.equal(json(`select public.phase1_typing_round_append_prompts(
    ${quote(operationId(31))}::uuid, ${quote(userId)}::uuid, ${quote(hash('f'))},
    ${quote(roundId)}::uuid, 6::bigint, '{}'::jsonb
  )::text;`).reason, 'invalid_arguments');
  assert.equal(json(appendPromptsCall(operationId(33), hash('f'), roundId, 6, Array(65).fill(basePrompts[0]))).reason, 'invalid_arguments');

  const wrongOp = operationId(10);
  assert.equal(json(eventCall(wrongOp, hash('1'), roundId, 1, 1, 'wrong')).ok, true);
  assert.equal(json(eventCall(wrongOp, hash('1'), roundId, 1, 1, 'wrong')).idempotent, true);
  assert.equal(json(eventCall(wrongOp, hash('2'), roundId, 1, 1, 'wrong')).reason, 'replay_conflict');
  assert.equal(json(eventCall(wrongOp, hash('1'), roundId, 1, 1, 'hint_opened')).reason, 'replay_conflict');
  assert.equal(json(eventCall(operationId(11), hash('3'), roundId, 2, 1, 'completed', 'คำปลอม')).reason, 'answer_mismatch');
  assert.equal(json(eventCall(operationId(12), hash('4'), roundId, 2, 1, 'hint_opened')).ok, true);
  assert.equal(json(eventCall(operationId(13), hash('5'), roundId, 3, 1, 'completed', 'คำ1')).completed_count, 1);
  assert.equal(json(eventCall(operationId(14), hash('6'), roundId, 4, 2, 'skipped')).skip_count, 1);
  assert.equal(json(eventCall(operationId(15), hash('7'), roundId, 5, 3, 'completed', 'คำ3')).completed_count, 2);
  assert.equal(json(eventCall(operationId(16), hash('8'), roundId, 6, 4, 'completed', 'คำ4')).completed_count, 3);
  assert.equal(json(eventCall(operationId(17), hash('9'), roundId, 7, 5, 'completed', 'คำ5')).completed_count, 4);
  const finished = json(eventCall(operationId(18), hash('0'), roundId, 8, 6, 'completed', 'คำ2'));
  assert.equal(finished.status, 'completed');
  assert.equal(finished.completed_count, 5);
  assert.equal(finished.skip_count, 1);
  assert.equal(json(eventCall(operationId(19), hash('a'), roundId, 9, 7, 'wrong')).reason, 'round_not_active');

  const loaded1 = json(loadCall(roundId, 0, 0, 3));
  const loaded2 = json(loadCall(roundId, loaded1.next_prompt_after, loaded1.next_event_after, 3));
  const loaded3 = json(loadCall(roundId, loaded2.next_prompt_after, loaded2.next_event_after, 3));
  const loadedPrompts = [...loaded1.prompt_page, ...loaded2.prompt_page, ...loaded3.prompt_page];
  const loadedEvents = [...loaded1.event_page, ...loaded2.event_page, ...loaded3.event_page];
  assert.equal(loaded1.ok, true);
  assert.equal(loaded1.round.status, 'completed');
  assert.equal(loadedPrompts.length, 6);
  assert.equal(loadedEvents.length, 8);
  assert.deepEqual(loadedEvents.map((item) => item.sequence), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.equal(Object.hasOwn(loadedEvents[0], 'answer'), false);
  assert.equal(loadedEvents[2].answer, 'คำ1');
  assert.equal(loaded1.has_more_prompts, true);
  assert.equal(loaded3.has_more_events, false);
  assert.equal(json(loadCall(roundId, 0, 0, 65)).reason, 'invalid_arguments');
  assert.equal(json(loadCall(roundId, 7, 0, 3)).reason, 'resync_required');

  const duplicatePrompts = [basePrompts[0], basePrompts[0], ...basePrompts.slice(1, 4)];
  const second = json(createCall(operationId(20), hash('b'), 2, duplicatePrompts));
  assert.equal(second.ok, true);
  const secondRoundId = second.round_id;
  assert.equal(json(eventCall(operationId(21), hash('c'), secondRoundId, 1, 1, 'completed', 'คำ1')).ok, true);
  assert.equal(json(eventCall(operationId(22), hash('d'), secondRoundId, 2, 2, 'completed', 'คำ1')).reason, 'duplicate_completed_content');

  const concurrentCreates = await Promise.all([
    jsonAsync(createCall(operationId(40), hash('4'), 1, basePrompts, raceUserId)),
    jsonAsync(createCall(operationId(41), hash('5'), 2, basePrompts, raceUserId)),
  ]);
  assert.equal(concurrentCreates.filter((result) => result.ok).length, 1);
  assert.equal(concurrentCreates.filter((result) => result.reason === 'active_round_exists').length, 1);
  const raceRoundId = concurrentCreates.find((result) => result.ok).round_id;

  const concurrentPrompts = await Promise.all([
    jsonAsync(appendPromptsCall(operationId(42), hash('6'), raceRoundId, 5, [basePrompts[0]], raceUserId)),
    jsonAsync(appendPromptsCall(operationId(43), hash('7'), raceRoundId, 5, [basePrompts[1]], raceUserId)),
  ]);
  assert.equal(concurrentPrompts.filter((result) => result.ok).length, 1);
  assert.equal(concurrentPrompts.filter((result) => result.reason === 'resync_required').length, 1);

  const concurrentEvents = await Promise.all([
    jsonAsync(eventCall(operationId(44), hash('8'), raceRoundId, 1, 1, 'wrong', null, raceUserId)),
    jsonAsync(eventCall(operationId(45), hash('9'), raceRoundId, 1, 1, 'hint_opened', null, raceUserId)),
  ]);
  assert.equal(concurrentEvents.filter((result) => result.ok).length, 1);
  assert.equal(concurrentEvents.filter((result) => result.reason === 'resync_required').length, 1);
  assert.equal(psql(`select count(*) from public.phase1_typing_round_events where round_id=${quote(raceRoundId)}::uuid;`), '1');

  assert.equal(psql(`select count(*) from public.phase1_typing_round_events where round_id=${quote(roundId)}::uuid;`), '8');
  assert.equal(psql(`select count(*) from public.phase1_typing_round_operations where round_id=${quote(roundId)}::uuid;`), '10');

  // Exercise the actual SQL -> Edge bridge -> reducer shapes, using the same
  // disposable PostgreSQL server and a synthetic canonical catalog only.
  psql(`create table public.game_words(content_key text primary key, level text,
    canonical_record jsonb, status text, access_tier text, catalog_version text, record_hash text);
    grant select on public.game_words to service_role;`);
  for (const prompt of basePrompts) {
    const record = { contentKey: prompt.content_ref.key, word: prompt.answer, level: '初', syllables: [{}] };
    psql(`insert into public.game_words values (${quote(record.contentKey)}, '初',
      ${quote(JSON.stringify(record))}::jsonb, 'active', 'login',
      ${quote(prompt.catalog_version)}, ${quote(prompt.record_hash)});`);
  }
  function bridgeQuery(read) {
    return { retry(value) { assert.equal(value, false); return this; },
      abortSignal(signal) { signal.throwIfAborted(); return this; },
      then(resolve, reject) { return Promise.resolve().then(() => ({ data: read() })).then(resolve, reject); } };
  }
  const bridgeAdmin = {
    rpc(name, args) {
      assert.ok(['phase1_typing_round_load', 'phase1_typing_round_append_event'].includes(name));
      const parameters = Object.entries(args).map(([key, value]) =>
        `${key} => ${value === null ? 'null' : typeof value === 'number'
          ? `${value}::${key === 'p_page_size' ? 'smallint' : 'bigint'}` : quote(value)}`);
      return bridgeQuery(() => {
        const result = json(`select public.${name}(${parameters.join(',')})::text;`);
        // This older foundation migration predates pin columns. Decorate only
        // the synthetic bridge shape; the canonical migration DB suite proves
        // that the real replacement load RPC reads persisted pins.
        if (name === 'phase1_typing_round_load' && result.ok === true) {
          result.prompt_page = result.prompt_page.map((prompt) => {
            const source = basePrompts.find((row) => row.content_ref.key === prompt.content_ref.key);
            return { ...prompt, catalog_version: source.catalog_version, record_hash: source.record_hash };
          });
        }
        return result;
      });
    },
    from(name) {
      assert.equal(name, 'game_words');
      let keys; let level;
      return Object.assign(bridgeQuery(() => JSON.parse(asService(`select coalesce(jsonb_agg(t), '[]'::jsonb)::text
        from public.game_words t where level=${quote(level)} and content_key in (${keys.map(quote).join(',')});`))), {
        select() { return this; }, in(_field, values) { keys = values; return this; },
        eq(_field, value) { level = value; return this; },
      });
    },
  };
  const actualResume = await handleTypingRoundAction({ admin: bridgeAdmin, user: { id: userId }, enabled: true,
    body: { action: 'typing_round_resume', round_id: roundId } });
  assert.equal(actualResume.status, 200);
  assert.equal(actualResume.body.checkpoint.complete, true);
  assert.equal(actualResume.body.checkpoint.stateVersion, 8);
  assert.equal(actualResume.body.checkpoint.completedCount, 5);
  assert.equal(actualResume.body.current_prompt, null);
  const actualReplay = await handleTypingRoundAction({ admin: bridgeAdmin, user: { id: userId }, enabled: true,
    body: { action: 'typing_round_event', round_id: raceRoundId, operation_id: operationId(60),
      expected_sequence: 2, prompt_ordinal: 1, type: 'wrong' } });
  // This account does not own raceRoundId: service credentials cannot bypass the
  // verified caller's p_user_id filter inside the RPC.
  assert.equal(actualReplay.status, 404);

  const currentEvent = await handleTypingRoundAction({ admin: bridgeAdmin, user: { id: raceUserId }, enabled: true,
    body: { action: 'typing_round_event', round_id: raceRoundId, operation_id: operationId(61),
      expected_sequence: 2, prompt_ordinal: 1, type: 'wrong' } });
  // Either racing create may have selected Middle. Populate its exact level
  // before asking the bridge to return a checkpoint for a committed event.
  const raceLevel = psql(`select level from public.phase1_typing_rounds where round_id=${quote(raceRoundId)}::uuid;`);
  if (raceLevel === '2') {
    assert.equal(currentEvent.status, 503);
    assert.equal(currentEvent.body.event_committed, true);
    psql(`update public.game_words set level='中', canonical_record=jsonb_set(canonical_record, '{level}', '"中"'::jsonb);`);
  } else assert.equal(currentEvent.status, 200);
  const retried = await handleTypingRoundAction({ admin: bridgeAdmin, user: { id: raceUserId }, enabled: true,
    body: { action: 'typing_round_event', round_id: raceRoundId, operation_id: operationId(61),
      expected_sequence: 2, prompt_ordinal: 1, type: 'wrong' } });
  assert.equal(retried.status, 200);
  assert.equal(retried.body.idempotent, true);
  assert.equal(retried.body.checkpoint.stateVersion, 2);
  assert.equal(psql(`select count(*) from public.phase1_typing_round_events where round_id=${quote(raceRoundId)}::uuid;`), '2');
  console.log('Typing SQL/Edge/reducer bridge, cross-owner denial and durable replay: PASS');
  console.log('Typing server-owned round/event atomic persistence: PASS');
  console.log('Typing round replay, sequence, canonical answer and replacement guards: PASS');
  console.log('Typing round concurrency, bounded paging, RLS and browser-role denial: PASS');

  run('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-h', socket, '-p', port, '-d', 'postgres', '-f', rollback]);
  assert.equal(psql(`select count(*) from (values
    (to_regclass('public.phase1_typing_rounds')),
    (to_regclass('public.phase1_typing_round_prompts')),
    (to_regclass('public.phase1_typing_round_events')),
    (to_regclass('public.phase1_typing_round_operations')),
    (to_regclass('public.phase1_typing_round_events_event_id_seq'))
  ) removed(object_id) where object_id is not null;`), '0');
  assert.equal(psql(`select count(*) from (values
    (to_regprocedure('public.phase1_typing_round_create(uuid,uuid,text,smallint,bigint,jsonb)')),
    (to_regprocedure('public.phase1_typing_round_append_prompts(uuid,uuid,text,uuid,bigint,jsonb)')),
    (to_regprocedure('public.phase1_typing_round_append_event(uuid,uuid,text,uuid,bigint,bigint,text,text)')),
    (to_regprocedure('public.phase1_typing_round_load(uuid,uuid,bigint,bigint,smallint)'))
  ) removed(object_id) where object_id is not null;`), '0');
  console.log('Typing round source rollback: PASS');
  console.log('TYPING_ROUND_PERSISTENCE_DB_PASS 5');
} finally {
  if (started) spawnSync('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop'], { encoding: 'utf8' });
  fs.rmSync(temp, { recursive: true, force: true });
}
