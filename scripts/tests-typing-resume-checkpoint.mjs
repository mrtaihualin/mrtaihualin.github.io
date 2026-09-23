#!/usr/bin/env node

import assert from 'node:assert/strict';
import {
  TYPING_RESUME_CHECKPOINT_VERSION,
  buildTypingResumeCheckpoint,
} from '../supabase/functions/score-submit/typing-resume-checkpoint.mjs';

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  process.stdout.write('PASS ' + name + '\n');
}

function rejects(code, fn) {
  assert.throws(fn, (error) => error && error.code === code);
}

function operationId(sequence) {
  return '00000000-0000-4000-8000-' + sequence.toString(16).padStart(12, '0');
}

function word(index, level = '初', syllables = 1) {
  return {
    content_key: 'typing-' + level + '-' + index,
    word: 'คำ' + index,
    level,
    syllables: new Array(syllables).fill({ roman: 'kham' }),
  };
}

function ref(row) {
  return { source: 'game_words', key: row.content_key };
}

function prompt(row, extra = {}) {
  return { contentRef: ref(row), golden: false, srsBonus: false, ...extra };
}

function event(row, sequence, type, extra = {}) {
  return { operationId: operationId(sequence), sequence, type, contentRef: ref(row), ...extra };
}

function completed(row, sequence, extra = {}) {
  return event(row, sequence, 'completed', { answer: row.word, ...extra });
}

function wrong(row, sequence) {
  return event(row, sequence, 'wrong');
}

function hint(row, sequence) {
  return event(row, sequence, 'hint_opened');
}

function skipped(row, sequence) {
  return event(row, sequence, 'skipped');
}

function fixture({ level = '初', rows, prompts, serverEvents, startingCombo = 0 } = {}) {
  const canonicalRows = rows || [1, 2, 3, 4, 5].map((index) => word(index, level));
  return {
    serverRound: {
      roundId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      game: 'typing',
      difficulty: level,
      startingCombo,
      prompts: prompts || canonicalRows.map((row) => prompt(row)),
    },
    canonicalRows,
    serverEvents: serverEvents || [],
  };
}

check('contract is versioned and supports only Initial/Middle', () => {
  assert.equal(TYPING_RESUME_CHECKPOINT_VERSION, 'typing-resume-checkpoint-v2');
  const rows = [1, 2, 3, 4, 5].map((index) => word(index, '高'));
  rejects('unsupported_typing_checkpoint_level', () => buildTypingResumeCheckpoint(fixture({ level: '高', rows })));
});

check('empty checkpoint preserves the server-issued starting Combo', () => {
  const result = buildTypingResumeCheckpoint(fixture({ startingCombo: 4 }));
  assert.equal(result.serverVerified, true);
  assert.equal(result.completedCount, 0);
  assert.equal(result.combo, 4);
  assert.deepEqual(result.confirmedScore, { numerator: 0, denominator: 1, decimal: 0 });
  assert.equal(result.finalScore, null);
});

check('score and Combo are reduced from sequenced primitive events, not summaries', () => {
  const rows = [1, 2, 3, 4, 5].map((index) => word(index, '中'));
  const prompts = rows.map((row, index) => prompt(row, { golden: index === 2, srsBonus: index === 1 }));
  const serverEvents = [
    completed(rows[0], 1),
    completed(rows[1], 2),
    completed(rows[2], 3),
    hint(rows[3], 4),
    wrong(rows[3], 5),
    completed(rows[3], 6),
    wrong(rows[4], 7),
    completed(rows[4], 8),
  ];
  const result = buildTypingResumeCheckpoint(fixture({ level: '中', rows, prompts, serverEvents }));
  assert.equal(result.combo, 0);
  assert.equal(result.maxCombo, 3);
  assert.equal(result.cleanCount, 3);
  assert.equal(result.hadGuide, true);
  assert.deepEqual(result.scoreBeforeRoundBonus, { numerator: 116, denominator: 1, decimal: 116 });
  assert.deepEqual(result.roundBonus, { completion: 0, perfect: 0, total: 0 });
  assert.equal(result.finalScore, 116);
  assert.equal(result.confirmedItems[2].goldenAwarded, true);
  assert.equal(result.confirmedItems[1].srsBonusAwarded, true);
  assert.equal(result.confirmedItems[3].awardedScore.decimal, 0);

  rejects('unconfirmed_event_log_forbidden', () => buildTypingResumeCheckpoint({
    ...fixture({ level: '中', rows, prompts }),
    events: serverEvents,
  }));
  rejects('client_derived_state_forbidden', () => buildTypingResumeCheckpoint(fixture({
    level: '中', rows, prompts,
    serverEvents: [{ ...completed(rows[0], 1), wrong: 0, guide: false, correct: true }],
  })));
  rejects('client_derived_state_forbidden', () => buildTypingResumeCheckpoint({
    ...fixture({ level: '中', rows, prompts, serverEvents: [completed(rows[0], 1)] }),
    score: 999,
  }));
});

check('completion requires the exact canonical answer', () => {
  const rows = [1, 2, 3, 4, 5].map((index) => word(index));
  rejects('missing_typing_completion_answer', () => buildTypingResumeCheckpoint(fixture({
    rows,
    serverEvents: [event(rows[0], 1, 'completed')],
  })));
  rejects('typing_completion_answer_mismatch', () => buildTypingResumeCheckpoint(fixture({
    rows,
    serverEvents: [completed(rows[0], 1, { answer: 'คำตอบปลอม' })],
  })));
});

check('fractional Typing base remains exact and is rounded only after round completion', () => {
  const rows = [word(1, '初', 6), word(2), word(3), word(4), word(5)];
  const first = buildTypingResumeCheckpoint(fixture({
    rows,
    serverEvents: [wrong(rows[0], 1), completed(rows[0], 2)],
  }));
  assert.deepEqual(first.confirmedItems[0].baseScore, { numerator: 25, denominator: 3, decimal: 25 / 3 });
  assert.deepEqual(first.confirmedScore, { numerator: 25, denominator: 3, decimal: 25 / 3 });
  assert.equal(first.finalScore, null);

  const serverEvents = [wrong(rows[0], 1), completed(rows[0], 2)];
  rows.slice(1).forEach((row, index) => serverEvents.push(completed(row, index + 3)));
  const complete = buildTypingResumeCheckpoint(fixture({ rows, serverEvents }));
  assert.deepEqual(complete.scoreBeforeRoundBonus, { numerator: 175, denominator: 3, decimal: 175 / 3 });
  assert.deepEqual(complete.confirmedScore, { numerator: 235, denominator: 3, decimal: 235 / 3 });
  assert.equal(complete.finalScore, 78);
});

check('Hint practice scores zero and preserves Combo even when wrong events follow', () => {
  const rows = [1, 2, 3, 4, 5].map((index) => word(index));
  const result = buildTypingResumeCheckpoint(fixture({
    rows,
    startingCombo: 4,
    serverEvents: [hint(rows[0], 1), wrong(rows[0], 2), completed(rows[0], 3)],
  }));
  assert.equal(result.combo, 4);
  assert.equal(result.maxCombo, 4);
  assert.equal(result.confirmedItems[0].wrong, 1);
  assert.equal(result.confirmedItems[0].awardedScore.decimal, 0);
  assert.equal(result.hadGuide, true);
});

check('a counted wrong event resets Combo immediately and the next clean unit starts at one', () => {
  const rows = [1, 2, 3, 4, 5].map((index) => word(index));
  const paused = buildTypingResumeCheckpoint(fixture({
    rows,
    startingCombo: 4,
    serverEvents: [wrong(rows[0], 1)],
  }));
  assert.equal(paused.combo, 0);
  assert.equal(paused.currentWrongCount, 1);
  assert.equal(paused.completedCount, 0);

  const result = buildTypingResumeCheckpoint(fixture({
    rows,
    startingCombo: 4,
    serverEvents: [wrong(rows[0], 1), completed(rows[0], 2), completed(rows[1], 3)],
  }));
  assert.equal(result.confirmedItems[0].combo, 0);
  assert.equal(result.confirmedItems[1].combo, 1);
  assert.equal(result.combo, 1);
});

check('the third Skip resets Combo and a replacement remains required', () => {
  const rows = [1, 2, 3, 4, 5, 6, 7].map((index) => word(index));
  const prompts = rows.map((row) => prompt(row));
  const serverEvents = [
    skipped(rows[0], 1),
    skipped(rows[1], 2),
    skipped(rows[2], 3),
    completed(rows[3], 4),
  ];
  const result = buildTypingResumeCheckpoint(fixture({ rows, prompts, serverEvents, startingCombo: 5 }));
  assert.equal(result.skipCount, 3);
  assert.equal(result.confirmedItems[0].combo, 5);
  assert.equal(result.confirmedItems[1].combo, 5);
  assert.equal(result.confirmedItems[2].combo, 0);
  assert.equal(result.combo, 1);

  const shortRows = rows.slice(0, 5);
  rejects('replacement_queue_exhausted', () => buildTypingResumeCheckpoint(fixture({
    rows: shortRows,
    prompts: shortRows.map((row) => prompt(row)),
    serverEvents: [
      skipped(shortRows[0], 1),
      completed(shortRows[1], 2),
      completed(shortRows[2], 3),
      completed(shortRows[3], 4),
      completed(shortRows[4], 5),
    ],
  })));
});

check('Skip has no catalog-size cap and ninety-six skips can still receive five replacements', () => {
  const rows = Array.from({ length: 100 }, (_, index) => word(index + 1));
  const promptRows = [...rows, rows[0]];
  const serverEvents = promptRows.map((row, index) => index < 96
    ? skipped(row, index + 1)
    : completed(row, index + 1));
  const result = buildTypingResumeCheckpoint(fixture({
    rows,
    prompts: promptRows.map((row) => prompt(row)),
    serverEvents,
    startingCombo: 4,
  }));
  assert.equal(result.skipCount, 96);
  assert.equal(result.completedCount, 5);
  assert.equal(result.combo, 5);
  assert.equal(result.complete, true);
  assert.equal(result.finalScore, 70);
});

check('a skipped prompt may repeat but one completed content item cannot count twice', () => {
  const rows = [1, 2, 3, 4, 5].map((index) => word(index));
  const promptRows = [rows[0], rows[0], rows[1], rows[2], rows[3], rows[4]];
  const accepted = buildTypingResumeCheckpoint(fixture({
    rows,
    prompts: promptRows.map((row) => prompt(row)),
    serverEvents: [skipped(rows[0], 1), completed(rows[0], 2)],
  }));
  assert.equal(accepted.skipCount, 1);
  assert.equal(accepted.completedCount, 1);

  rejects('duplicate_completed_content', () => buildTypingResumeCheckpoint(fixture({
    rows,
    prompts: promptRows.map((row) => prompt(row)),
    serverEvents: [completed(rows[0], 1), completed(rows[0], 2)],
  })));
});

check('two skipped prompts can be replaced without granting Perfect', () => {
  const rows = [1, 2, 3, 4, 5, 6, 7].map((index) => word(index));
  const serverEvents = [
    skipped(rows[0], 1),
    skipped(rows[1], 2),
    ...rows.slice(2).map((row, index) => completed(row, index + 3)),
  ];
  const result = buildTypingResumeCheckpoint(fixture({
    rows,
    prompts: rows.map((row) => prompt(row)),
    serverEvents,
  }));
  assert.equal(result.complete, true);
  assert.equal(result.completedCount, 5);
  assert.equal(result.skipCount, 2);
  assert.deepEqual(result.roundBonus, { completion: 20, perfect: 0, total: 20 });
  assert.equal(result.finalScore, 90);
});

check('server Golden and SRS flags cannot award a non-clean unit', () => {
  const rows = [1, 2, 3, 4, 5].map((index) => word(index, '中'));
  const prompts = rows.map((row) => prompt(row, { golden: true, srsBonus: true }));
  const result = buildTypingResumeCheckpoint(fixture({
    level: '中', rows, prompts,
    serverEvents: [wrong(rows[0], 1), completed(rows[0], 2)],
  }));
  assert.equal(result.confirmedItems[0].goldenAwarded, false);
  assert.equal(result.confirmedItems[0].srsBonusAwarded, false);
  assert.equal(result.confirmedItems[0].awardedScore.decimal, 15);
});

check('one protected end-of-round Retry may repeat a primary identity without becoming a sixth primary', () => {
  const rows = [1, 2, 3, 4, 5].map((index) => word(index, '初'));
  const prompts = rows.map((row) => prompt(row));
  prompts.push({ ...prompt(rows[0]), attemptKind: 'retry', golden: false, srsBonus: false });
  const raw = [
    wrong(rows[0], 1), wrong(rows[0], 2), wrong(rows[0], 3),
    completed(rows[0], 4),
    ...rows.slice(1).map((row, index) => completed(row, index + 5)),
    completed(rows[0], 9),
  ];
  const result = buildTypingResumeCheckpoint(fixture({ rows, prompts, serverEvents: raw }));
  assert.equal(result.complete, true);
  assert.equal(result.primaryCompletedCount, 5);
  assert.equal(result.completedCount, 6);
  assert.equal(result.confirmedItems.at(-1).attemptKind, 'retry');
  assert.equal(result.confirmedItems.at(-1).completedOrdinal, 6);
});

check('Retry prompts fail closed unless the same primary completed first and can complete only once', () => {
  const rows = [1, 2, 3, 4, 5].map((index) => word(index, '初'));
  const retry = { ...prompt(rows[0]), attemptKind: 'retry', golden: false, srsBonus: false };
  assert.throws(() => buildTypingResumeCheckpoint(fixture({ rows,
    prompts: [retry, ...rows.slice(1).map((row) => prompt(row))],
    serverEvents: [completed(rows[0], 1)] })), /invalid_retry_completion/);
  const prompts = [...rows.map((row) => prompt(row)), retry, retry];
  const events = rows.map((row, index) => completed(row, index + 1));
  events.push(completed(rows[0], 6));
  events.push(completed(rows[0], 7));
  assert.throws(() => buildTypingResumeCheckpoint(fixture({ rows, prompts, serverEvents: events })),
    /invalid_retry_completion/);
});

check('completion and Perfect bonuses are derived after five clean units', () => {
  const rows = [1, 2, 3, 4, 5].map((index) => word(index));
  const result = buildTypingResumeCheckpoint(fixture({
    rows,
    serverEvents: rows.map((row, index) => completed(row, index + 1)),
  }));
  assert.equal(result.complete, true);
  assert.deepEqual(result.roundBonus, { completion: 20, perfect: 50, total: 70 });
  assert.equal(result.confirmedScore.decimal, 140);
  assert.equal(result.finalScore, 140);
});

check('queue identity, sequence, canonical level, and idempotency fail closed', () => {
  const rows = [1, 2, 3, 4, 5].map((index) => word(index));
  rejects('event_prompt_order_mismatch', () => buildTypingResumeCheckpoint(fixture({
    rows,
    serverEvents: [completed(rows[1], 1)],
  })));
  rejects('duplicate_operation_id', () => buildTypingResumeCheckpoint(fixture({
    rows,
    serverEvents: [completed(rows[0], 1), { ...completed(rows[1], 2), operationId: operationId(1) }],
  })));
  rejects('non_contiguous_server_event_sequence', () => buildTypingResumeCheckpoint(fixture({
    rows,
    serverEvents: [{ ...completed(rows[0], 1), sequence: 2 }],
  })));
  rejects('canonical_level_mismatch', () => buildTypingResumeCheckpoint(fixture({
    rows: [{ ...rows[0], level: '中' }, ...rows.slice(1)],
  })));
  rejects('canonical_content_missing', () => buildTypingResumeCheckpoint({
    ...fixture({ rows }),
    canonicalRows: rows.slice(0, 4),
  }));

  const extraRows = [...rows, word(6)];
  rejects('too_many_primary_completions', () => buildTypingResumeCheckpoint(fixture({
    rows: extraRows,
    prompts: extraRows.map((row) => prompt(row)),
    serverEvents: extraRows.map((row, index) => completed(row, index + 1)),
  })));
});

process.stdout.write('TYPING_RESUME_CHECKPOINT_PASS ' + passed + '\n');
