// Pure server-side Typing checkpoint reducer for Initial/Middle rounds.
//
// Trust boundary: `serverRound`, `canonicalRows`, and `serverEvents` must be
// loaded by the Edge Function from protected server storage. A request event is
// persisted first with a contiguous server sequence; this reducer never accepts
// a client score, wrong-count summary, Hint summary, Combo, Golden flag, SRS
// entitlement, queue, or round summary.

export const TYPING_RESUME_CHECKPOINT_VERSION = 'typing-resume-checkpoint-v2';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LEVEL_MULTIPLIER = Object.freeze({ '初': 1, '中': 2 });
const TARGET_COMPLETED = 5;
const FORBIDDEN_DERIVED_FIELDS = Object.freeze([
  'points',
  'score',
  'roundScore',
  'round_score',
  'clientScore',
  'client_score',
  'combo',
  'streak',
  'maxCombo',
  'max_combo',
  'clean',
  'golden',
  'srsBonus',
  'srs_bonus',
  'roundBonus',
  'round_bonus',
  'wrong',
  'guide',
  'correct',
  'completed',
]);

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function own(object, key) {
  return Object.prototype.hasOwnProperty.call(object || {}, key);
}

function integer(value, code, min, max) {
  if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value)) fail(code);
  if (value < min || value > max) fail(code);
  return value;
}

function exactString(value, code) {
  if (typeof value !== 'string' || !value || value.trim() !== value) fail(code);
  return value;
}

function gcd(a, b) {
  let left = Math.abs(a);
  let right = Math.abs(b);
  while (right) {
    const next = left % right;
    left = right;
    right = next;
  }
  return left || 1;
}

function fraction(numerator, denominator = 1) {
  if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator) || denominator <= 0) {
    fail('unsafe_score_fraction');
  }
  const divisor = gcd(numerator, denominator);
  return { numerator: numerator / divisor, denominator: denominator / divisor };
}

function add(left, right) {
  return fraction(
    left.numerator * right.denominator + right.numerator * left.denominator,
    left.denominator * right.denominator,
  );
}

function multiply(left, right) {
  return fraction(left.numerator * right.numerator, left.denominator * right.denominator);
}

function publicFraction(value) {
  return Object.freeze({
    numerator: value.numerator,
    denominator: value.denominator,
    decimal: value.numerator / value.denominator,
  });
}

function roundHalfUp(value) {
  return Math.floor((2 * value.numerator + value.denominator) / (2 * value.denominator));
}

function contentRef(value, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(code);
  const source = String(value.source || '');
  const key = exactString(value.key, code);
  if (source !== 'game_words') fail(code);
  return { source, key };
}

function sameRef(left, right) {
  return left.source === right.source && left.key === right.key;
}

function canonicalUnitCount(row) {
  if (Array.isArray(row && row.syllables) && row.syllables.length) return row.syllables.length;
  return integer(row && row.wc, 'invalid_canonical_units', 1, 100);
}

function comboMultiplier(combo) {
  if (combo >= 8) return fraction(3);
  if (combo >= 5) return fraction(2);
  if (combo >= 3) return fraction(3, 2);
  return fraction(1);
}

function assertNoDerivedFields(object) {
  FORBIDDEN_DERIVED_FIELDS.forEach((field) => {
    if (own(object, field)) fail('client_derived_state_forbidden');
  });
}

function normalizeServerRound(serverRound) {
  if (!serverRound || typeof serverRound !== 'object' || Array.isArray(serverRound)) fail('invalid_server_round');
  if (String(serverRound.game || '') !== 'typing') fail('invalid_game');
  const difficulty = String(serverRound.difficulty || '');
  if (!own(LEVEL_MULTIPLIER, difficulty)) fail('unsupported_typing_checkpoint_level');
  const roundId = String(serverRound.roundId || serverRound.round_id || '').toLowerCase();
  if (!UUID_V4.test(roundId)) fail('invalid_round_id');
  const startingCombo = integer(serverRound.startingCombo, 'invalid_starting_combo', 0, Number.MAX_SAFE_INTEGER);
  if (!Array.isArray(serverRound.prompts) || serverRound.prompts.length < TARGET_COMPLETED) {
    fail('invalid_server_prompt_queue');
  }

  const prompts = serverRound.prompts.map((prompt) => {
    if (!prompt || typeof prompt !== 'object' || Array.isArray(prompt)) fail('invalid_server_prompt');
    const ref = contentRef(prompt.contentRef || prompt.content_ref, 'invalid_server_prompt_ref');
    if (typeof prompt.golden !== 'boolean' || typeof prompt.srsBonus !== 'boolean') {
      fail('incomplete_server_prompt_entitlement');
    }
    const attemptKind = prompt.attemptKind || prompt.attempt_kind || 'primary';
    if (!['primary', 'retry'].includes(attemptKind)
        || (attemptKind === 'retry' && (prompt.golden || prompt.srsBonus))) {
      fail('invalid_server_prompt_attempt');
    }
    return { contentRef: ref, golden: prompt.golden, srsBonus: prompt.srsBonus, attemptKind };
  });
  return { roundId, difficulty, startingCombo, prompts };
}

function canonicalRowsByKey(rows, difficulty, prompts) {
  if (!Array.isArray(rows)) fail('invalid_canonical_rows');
  const promptKeys = new Set(prompts.map((prompt) => prompt.contentRef.key));
  const byKey = new Map();
  rows.forEach((row) => {
    const key = exactString(row && row.content_key, 'invalid_canonical_content_key');
    if (!promptKeys.has(key)) return;
    if (byKey.has(key)) fail('canonical_content_not_unique');
    if (String(row.level || '') !== difficulty) fail('canonical_level_mismatch');
    canonicalUnitCount(row);
    exactString(row.word, 'canonical_typing_answer_missing');
    byKey.set(key, row);
  });
  prompts.forEach((prompt) => {
    if (!byKey.has(prompt.contentRef.key)) fail('canonical_content_missing');
  });
  return byKey;
}

function normalizeEvents(rawEvents) {
  if (!Array.isArray(rawEvents)) fail('invalid_checkpoint_events');
  const operationIds = new Set();
  return rawEvents.map((event, index) => {
    if (!event || typeof event !== 'object' || Array.isArray(event)) fail('invalid_checkpoint_event');
    assertNoDerivedFields(event);
    const operationId = String(event.operationId || event.operation_id || '').toLowerCase();
    if (!UUID_V4.test(operationId)) fail('invalid_operation_id');
    if (operationIds.has(operationId)) fail('duplicate_operation_id');
    operationIds.add(operationId);
    const sequence = integer(event.sequence, 'invalid_server_event_sequence', 1, Number.MAX_SAFE_INTEGER);
    if (sequence !== index + 1) fail('non_contiguous_server_event_sequence');
    const ref = contentRef(event.contentRef || event.content_ref, 'invalid_event_content_ref');
    const type = String(event.type || '');
    if (type === 'wrong' || type === 'hint_opened' || type === 'skipped') {
      if (own(event, 'answer')) fail('unexpected_answer_evidence');
      return { operationId, sequence, contentRef: ref, type };
    }
    if (type !== 'completed') fail('invalid_checkpoint_event_type');
    return {
      operationId,
      sequence,
      contentRef: ref,
      type,
      answer: exactString(event.answer, 'missing_typing_completion_answer'),
    };
  });
}

function typingBaseScore(row, wrong) {
  const units = canonicalUnitCount(row);
  const quota = Math.min(4 + Math.max(0, units - 4), 9);
  if (wrong >= quota) return { quota, score: fraction(0) };
  return { quota, score: fraction(10 * (quota - wrong), quota) };
}

export function buildTypingResumeCheckpoint(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('invalid_checkpoint_input');
  assertNoDerivedFields(input);
  if (own(input, 'events')) fail('unconfirmed_event_log_forbidden');
  const round = normalizeServerRound(input.serverRound);
  const rows = canonicalRowsByKey(input.canonicalRows, round.difficulty, round.prompts);
  const events = normalizeEvents(input.serverEvents);

  let combo = round.startingCombo;
  let maxCombo = combo;
  let completedCount = 0;
  let primaryCompletedCount = 0;
  let cleanCount = 0;
  let skipCount = 0;
  let hadGuide = false;
  let perfectSoFar = true;
  let scoreBeforeRoundBonus = fraction(0);
  let promptIndex = 0;
  let currentWrongCount = 0;
  let currentGuide = false;
  const completedPrimaryContent = new Set();
  const completedRetryContent = new Set();
  const confirmedItems = [];

  events.forEach((event) => {
    const prompt = round.prompts[promptIndex];
    if (!prompt) fail('replacement_queue_exhausted');
    if (!sameRef(event.contentRef, prompt.contentRef)) fail('event_prompt_order_mismatch');
    const row = rows.get(event.contentRef.key);

    if (event.type === 'wrong') {
      currentWrongCount += 1;
      perfectSoFar = false;
      if (!currentGuide) combo = 0;
      return;
    }
    if (event.type === 'hint_opened') {
      currentGuide = true;
      hadGuide = true;
      perfectSoFar = false;
      return;
    }
    if (event.type === 'skipped') {
      skipCount += 1;
      perfectSoFar = false;
      if (skipCount >= 3) combo = 0;
      confirmedItems.push({
        operationId: event.operationId,
        contentRef: event.contentRef,
        outcome: 'skipped',
        attemptKind: prompt.attemptKind,
        completedOrdinal: null,
        combo,
        awardedScore: publicFraction(fraction(0)),
      });
      promptIndex += 1;
      currentWrongCount = 0;
      currentGuide = false;
      return;
    }

    if (event.answer !== row.word) fail('typing_completion_answer_mismatch');
    const completedIdentity = event.contentRef.source + ':' + event.contentRef.key;
    if (prompt.attemptKind === 'primary') {
      if (completedPrimaryContent.has(completedIdentity)) fail('duplicate_completed_content');
      completedPrimaryContent.add(completedIdentity);
      primaryCompletedCount += 1;
      if (primaryCompletedCount > TARGET_COMPLETED) fail('too_many_primary_completions');
    } else {
      if (!completedPrimaryContent.has(completedIdentity)
          || completedRetryContent.has(completedIdentity)) fail('invalid_retry_completion');
      completedRetryContent.add(completedIdentity);
    }
    completedCount += 1;
    const clean = currentWrongCount === 0 && !currentGuide;
    if (clean) {
      combo += 1;
      cleanCount += 1;
      maxCombo = Math.max(maxCombo, combo);
    }

    const base = typingBaseScore(row, currentWrongCount);
    let awarded = fraction(0);
    const goldenAwarded = clean && prompt.golden;
    const srsBonusAwarded = clean && prompt.srsBonus;
    if (!currentGuide) {
      awarded = multiply(base.score, fraction(LEVEL_MULTIPLIER[round.difficulty]));
      awarded = multiply(awarded, comboMultiplier(clean ? combo : 0));
      if (goldenAwarded) awarded = multiply(awarded, fraction(2));
      if (srsBonusAwarded) awarded = add(awarded, fraction(1));
      scoreBeforeRoundBonus = add(scoreBeforeRoundBonus, awarded);
    }
    confirmedItems.push({
      operationId: event.operationId,
      contentRef: event.contentRef,
      outcome: 'completed',
      attemptKind: prompt.attemptKind,
      completedOrdinal: completedCount,
      wrong: currentWrongCount,
      guide: currentGuide,
      quota: base.quota,
      clean,
      combo,
      goldenAwarded,
      srsBonusAwarded,
      baseScore: publicFraction(base.score),
      awardedScore: publicFraction(awarded),
    });
    promptIndex += 1;
    currentWrongCount = 0;
    currentGuide = false;
  });

  if (promptIndex === round.prompts.length && primaryCompletedCount < TARGET_COMPLETED) {
    fail('replacement_queue_exhausted');
  }
  const complete = primaryCompletedCount === TARGET_COMPLETED && promptIndex === round.prompts.length;
  const completionBonus = complete && skipCount <= 2 && !hadGuide ? 20 : 0;
  const perfectBonus = complete && perfectSoFar && cleanCount === completedCount && skipCount === 0 ? 50 : 0;
  const roundBonus = completionBonus + perfectBonus;
  const confirmedScore = add(scoreBeforeRoundBonus, fraction(roundBonus));

  return Object.freeze({
    version: TYPING_RESUME_CHECKPOINT_VERSION,
    serverVerified: true,
    game: 'typing',
    difficulty: round.difficulty,
    roundId: round.roundId,
    stateVersion: events.length,
    confirmedThroughOperationId: events.length ? events[events.length - 1].operationId : null,
    targetCompleted: TARGET_COMPLETED,
    confirmedEventCount: events.length,
    consumedPromptCount: promptIndex,
    currentPromptIndex: complete ? null : promptIndex,
    currentWrongCount,
    currentGuide,
    completedCount,
    primaryCompletedCount,
    skipCount,
    hadGuide,
    cleanCount,
    combo,
    maxCombo,
    complete,
    perfectEligible: perfectSoFar && skipCount === 0,
    scoreBeforeRoundBonus: publicFraction(scoreBeforeRoundBonus),
    roundBonus: Object.freeze({ completion: completionBonus, perfect: perfectBonus, total: roundBonus }),
    confirmedScore: publicFraction(confirmedScore),
    finalScore: complete ? roundHalfUp(confirmedScore) : null,
    confirmedItems: Object.freeze(confirmedItems),
  });
}
