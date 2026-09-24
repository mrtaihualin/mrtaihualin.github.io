#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { prepareTypingAtomicEvent } from '../supabase/functions/score-submit/typing-round-final-commit.mjs';

const id = (n) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
const ref = (n) => ({ source: 'game_words', key: `atomic-${n}` });
const rows = Array.from({ length: 5 }, (_, i) => ({ content_key: `atomic-${i + 1}`,
  word: `คำ${i + 1}`, level: '初', syllables: [{}] }));
const prompt = (n, patch = {}) => ({ prompt_ordinal: n, content_ref: ref(n), golden: false,
  srs_bonus: false, attempt_kind: 'primary', learning_state: 'normal',
  learning_state_token: `normal:item-${n}`, ...patch });
const baseRound = { round_id: id(99), level: 1, starting_combo: 0, current_prompt_ordinal: 1,
  completed_count: 0, primary_completed_count: 0, pending_retry_count: 0 };
const completed = (n, sequence = n) => ({ operation_id: id(sequence), sequence,
  prompt_ordinal: n, content_ref: ref(n), type: 'completed', answer: `คำ${n}` });
const event = (n, sequence = n) => ({ operationId: id(sequence), sequence, promptOrdinal: n,
  type: 'completed', answer: `คำ${n}` });
let passed = 0;
async function check(name, fn) { await fn(); passed++; console.log(`PASS ${name}`); }

await check('learning score is derived from stored primitive wrong events and canonical units', async () => {
  const evidence = { round: baseRound, prompts: [prompt(1), ...[2, 3, 4, 5].map(prompt)],
    events: [{ operation_id: id(8), sequence: 1, prompt_ordinal: 1, content_ref: ref(1), type: 'wrong' },
      { operation_id: id(9), sequence: 2, prompt_ordinal: 1, content_ref: ref(1), type: 'wrong' }] };
  const result = await prepareTypingAtomicEvent({ evidence, canonicalRows: rows,
    event: event(1, 3) });
  assert.equal(result.serverLearningScore, 5);
  assert.equal(result.scoreVerifiedBy, 'edge:typing:v2');
  assert.equal(result.serverFinalScore, null);
});

await check('Hint forces learning score zero and non-final primary schedules no client score', async () => {
  const evidence = { round: baseRound, prompts: [prompt(1), ...[2, 3, 4, 5].map(prompt)],
    events: [{ operation_id: id(8), sequence: 1, prompt_ordinal: 1, content_ref: ref(1), type: 'hint_opened' }] };
  const result = await prepareTypingAtomicEvent({ evidence, canonicalRows: rows,
    event: event(1, 2) });
  assert.equal(result.serverLearningScore, 0);
  assert.equal(result.serverFinalScore, null);
  assert.equal(result.evidenceHash, null);
});

await check('fifth primary produces a protected final score and hash only when no Retry remains', async () => {
  const prompts = [1, 2, 3, 4, 5].map(prompt);
  const events = [1, 2, 3, 4].map((n) => completed(n));
  const evidence = { round: { ...baseRound, current_prompt_ordinal: 5, completed_count: 4,
    primary_completed_count: 4 }, prompts, events };
  const result = await prepareTypingAtomicEvent({ evidence, canonicalRows: rows, event: event(5, 5) });
  assert.equal(result.serverLearningScore, 10);
  assert.equal(result.serverFinalScore, 140);
  assert.match(result.evidenceHash, /^[0-9a-f]{64}$/);
  assert.deepEqual(result.mirrorItems, []);
});

await check('final Retry contributes score but does not become a sixth primary', async () => {
  const retryPrompt = prompt(1, { prompt_ordinal: 6, attempt_kind: 'retry', golden: false,
    srs_bonus: false, learning_state: 'retry_end_round', learning_state_token: 'retry-token' });
  const prompts = [...[1, 2, 3, 4, 5].map(prompt), retryPrompt];
  const events = [
    { operation_id: id(1), sequence: 1, prompt_ordinal: 1, content_ref: ref(1), type: 'wrong' },
    { operation_id: id(2), sequence: 2, prompt_ordinal: 1, content_ref: ref(1), type: 'wrong' },
    { operation_id: id(3), sequence: 3, prompt_ordinal: 1, content_ref: ref(1), type: 'wrong' },
    completed(1, 4), ...[2, 3, 4, 5].map((n, i) => completed(n, i + 5)),
  ];
  const evidence = { round: { ...baseRound, current_prompt_ordinal: 6, completed_count: 5,
    primary_completed_count: 5, pending_retry_count: 1 }, prompts, events };
  const result = await prepareTypingAtomicEvent({ evidence, canonicalRows: rows, event: {
    ...event(1, 9), promptOrdinal: 6,
  } });
  assert.equal(result.serverLearningScore, 10);
  assert.equal(typeof result.serverFinalScore, 'number');
});

await check('skip/wrong/hint preparation never accepts a client-derived score', async () => {
  const evidence = { round: baseRound, prompts: [prompt(1)], events: [] };
  const result = await prepareTypingAtomicEvent({ evidence, canonicalRows: [], event: {
    operationId: id(1), sequence: 1, promptOrdinal: 1, type: 'skipped',
  } });
  assert.deepEqual(result, { serverLearningScore: null, scoreVerifiedBy: null,
    serverFinalScore: null, evidenceHash: null, mirrorItems: null });
});

await check('service routes prepared rounds to the atomic RPC while all public gates remain OFF', () => {
  const service = fs.readFileSync(new URL('../supabase/functions/score-submit/typing-round-service.mjs', import.meta.url), 'utf8');
  assert.match(service, /phase1_typing_round_commit_event/);
  assert.doesNotMatch(service, /'phase1_typing_round_append_event'/);
  assert.ok(service.indexOf("from('phase1_typing_round_operations')")
    < service.indexOf('loadTypingRoundEvidence({ admin, userId, roundId: event.roundId'));
  assert.match(service, /checkpoint_unavailable: 'typing_canonical_changed'/);
  assert.match(service, /atomicEnabled !== true\) fail\('typing_atomic_disabled'/);
  assert.match(service, /TYPING_ROUND_ACTIONS_ENABLED = false/);
  assert.match(service, /TYPING_ATOMIC_FINAL_COMMIT_ENABLED = false/);
  for (const file of ['../typing-game.html', '../js/games/typing-game-app.js', '../js/games/typing-game-app.min.js']) {
    assert(!fs.readFileSync(new URL(file, import.meta.url), 'utf8').includes('typing-round-final-commit'));
  }
});

console.log(`TYPING_ATOMIC_FINAL_COMMIT_PASS ${passed}`);
