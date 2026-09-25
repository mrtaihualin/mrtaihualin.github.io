export const LOGIN_FREE_LEARNING_ENGINE_VERSION = 'phase1-login-free-learning-v2';

const GAMES = new Set(['tone', 'reading', 'typing', 'word_order']);
const PRE_SRS = new Set(['retry_end_round', 'next_day_check', 'review_needed', 'weak_4d']);

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function exactDay(value) {
  const day = String(value || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || Number.isNaN(Date.parse(day + 'T00:00:00Z'))) fail('invalid_day');
  return day;
}

function addDays(value, days) {
  const date = new Date(Date.parse(exactDay(value) + 'T00:00:00Z'));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function normalize(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('invalid_state');
  const state = String(input.state || '');
  if (state === 'normal') return { state: 'normal' };
  if (PRE_SRS.has(state)) {
    return {
      state,
      dueOn: input.dueOn == null ? null : exactDay(input.dueOn),
      roundId: input.roundId == null ? null : String(input.roundId),
      reviewAttemptsUsed: Number.isInteger(input.reviewAttemptsUsed) ? input.reviewAttemptsUsed : 0,
    };
  }
  if (state === 'srs' || state === 'mastered') {
    const stage = Number(input.stage);
    if (!Number.isInteger(stage) || stage < 0 || stage > 3) fail('invalid_srs_stage');
    return {
      state: input.mastered === true || state === 'mastered' ? 'mastered' : 'srs',
      stage,
      dueOn: input.dueOn == null || input.dueOn === '' ? null : exactDay(input.dueOn),
      everFailed: input.everFailed === true,
      mastered: input.mastered === true || state === 'mastered',
    };
  }
  fail('invalid_state');
}

export function classifyLearningState(input, todayValue) {
  const today = exactDay(todayValue);
  const state = normalize(input);
  if (state.state === 'normal') return 'regular_or_new';
  if (state.state === 'mastered') return 'mastered';
  if (state.state === 'srs') return !state.dueOn || state.dueOn <= today ? 'srs_due' : 'non_due_srs';
  if (state.state === 'retry_end_round') return 'retry_end_round';
  return state.dueOn && state.dueOn <= today ? 'review_due' : 'non_due_review';
}

function unchanged(state, reason) {
  return { mutated: false, reason, fromState: state.state, toState: state.state, state };
}

export function transitionLearningState(input) {
  const game = String(input && input.game || '');
  if (!GAMES.has(game)) fail('invalid_game');
  const today = exactDay(input.today);
  const score = Number(input.score);
  if (!Number.isInteger(score) || score < 0 || score > 10) fail('invalid_score');
  const action = input.action == null ? 'answer' : String(input.action);
  if (action !== 'answer' && action !== 'known_check') fail('invalid_action');
  const state = normalize(input.state);
  const band = score === 10 ? '10' : score >= 4 ? '4-9' : '0-3';

  if (state.state === 'mastered') return unchanged(state, 'already_mastered');
  if ((PRE_SRS.has(state.state) && state.state !== 'retry_end_round' && (!state.dueOn || state.dueOn > today)) ||
      (state.state === 'srs' && state.dueOn && state.dueOn > today)) {
    return unchanged(state, 'not_due');
  }
  if (state.state === 'retry_end_round' && String(input.roundId || '') !== state.roundId) {
    return unchanged(state, 'retry_round_mismatch');
  }
  if (action === 'known_check' && state.state !== 'srs') return unchanged(state, 'known_check_not_available');

  if (state.state === 'srs') {
    if (action === 'known_check' && score === 10) {
      const srs = { stage: 3, dueOn: null, everFailed: state.everFailed, mastered: true };
      return { mutated: true, reason: 'known_master', fromState: 'srs', toState: 'mastered', srs };
    }
    if (score !== 10) {
      const srs = { stage: 0, dueOn: null, everFailed: true, mastered: false };
      return { mutated: true, reason: action === 'known_check' ? 'known_reset' : 'srs_reset', fromState: 'srs', toState: 'srs', srs };
    }
    const nextStage = state.stage + 1;
    if (nextStage >= 3) {
      const srs = { stage: 3, dueOn: null, everFailed: state.everFailed, mastered: true };
      return { mutated: true, reason: 'srs_mastered', fromState: 'srs', toState: 'mastered', srs };
    }
    const srs = {
      stage: nextStage,
      dueOn: addDays(today, state.stage === 0 ? 1 : 7),
      everFailed: state.everFailed,
      mastered: false,
    };
    return { mutated: true, reason: 'srs_advanced', fromState: 'srs', toState: 'srs', srs };
  }

  let target;
  if (state.state === 'normal') target = band === '10' ? 'srs' : band === '4-9' ? 'weak_4d' : 'retry_end_round';
  else if (state.state === 'retry_end_round') target = band === '10' ? 'next_day_check' : 'review_needed';
  else if (state.state === 'next_day_check' || state.state === 'review_needed') target = band === '10' ? 'srs' : 'weak_4d';
  else if (state.state === 'weak_4d') target = band === '10' ? 'srs' : band === '4-9' ? 'weak_4d' : 'retry_end_round';

  if (target === 'srs') {
    const srs = { stage: 0, dueOn: null, everFailed: false, mastered: false };
    return { mutated: true, reason: 'entered_srs', fromState: state.state, toState: 'srs', scoreBand: band, srs };
  }
  const dueOn = target === 'weak_4d' ? addDays(today, 4)
    : target === 'next_day_check' || target === 'review_needed' ? addDays(today, 1) : null;
  return {
    mutated: true,
    reason: 'transitioned',
    fromState: state.state,
    toState: target,
    scoreBand: band,
    dueOn,
    roundId: target === 'retry_end_round' ? String(input.roundId || '') : null,
    reviewAttemptsUsed: state.state === 'next_day_check' || state.state === 'review_needed'
      ? Math.min(1, state.reviewAttemptsUsed + 1) : 0,
  };
}
