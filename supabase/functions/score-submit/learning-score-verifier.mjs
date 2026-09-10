// Hidden pre-SRS learning-score verifier for the five Core games.
// Source-only and default OFF. It never accepts a client-computed learning score.

export const HIDDEN_REVIEW_SCORE_DEFAULT_ENABLED = false;
export const LEARNING_SCORE_VERIFIER_VERSION = 'phase1-learning-score-v1';

const GAMES = Object.freeze(['tone', 'reading', 'listening', 'typing', 'word_order']);
const LADDER = Object.freeze([10, 7, 4, 1, 0]);
const LEVEL_NUMBER = Object.freeze({ '初': 1, '中': 2, '高': 3 });

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

function string(value, code) {
  const result = String(value == null ? '' : value).trim();
  if (!result) fail(code);
  return result;
}

function exactString(value, code) {
  if (typeof value !== 'string' || !value || value.trim() !== value) fail(code);
  return value;
}

function assertNoClientScore(item) {
  ['learning_score', 'learningScore', 'canonical_learning_score', 'canonicalLearningScore'].forEach((key) => {
    if (own(item, key)) fail('client_learning_score_forbidden');
  });
}

function canonicalContentRefKey(row, source) {
  const field = source === 'game_sentences' ? 'th' : 'content_key';
  return exactString(row && row[field], 'canonical_content_identity_missing');
}

function itemContentRef(item) {
  const raw = item.contentRef || item.content_ref;
  if (!raw) fail('missing_content_ref');
  const source = String(raw.source || '');
  const key = exactString(raw.key, 'invalid_content_ref');
  if (source !== 'game_words' && source !== 'game_sentences') fail('invalid_content_ref');
  return { source, key };
}

function exactCanonicalRow(game, difficulty, item, rows) {
  const ref = itemContentRef(item);
  const itemKey = exactString(item && item.key, 'invalid_content_key');
  const matches = (Array.isArray(rows) ? rows : []).filter((row) => {
    return canonicalContentRefKey(row, ref.source) === ref.key;
  });
  if (matches.length !== 1) fail('content_ref_not_unique');
  const row = matches[0];
  if (ref.source === 'game_words') {
    if (itemKey !== ref.key || !own(row, 'word') || ref.key !== canonicalContentRefKey(row, ref.source)) {
      fail('content_ref_identity_mismatch');
    }
  } else {
    if (!own(row, 'th') || ref.key !== canonicalContentRefKey(row, ref.source)) fail('content_ref_identity_mismatch');
    if (itemKey !== ref.key) fail('content_ref_identity_mismatch');
  }
  return { row, ref };
}

function levelNumber(difficulty, row) {
  const level = String(row && row.level || difficulty || '');
  const number = LEVEL_NUMBER[level];
  if (!number) fail('invalid_learning_level');
  return number;
}

function canonicalUnitCount(row) {
  if (Array.isArray(row && row.syllables) && row.syllables.length) return row.syllables.length;
  return integer(row && row.wc, 'invalid_canonical_units', 1, 100);
}

function ladderScore(wrong) {
  return LADDER[Math.min(integer(wrong, 'invalid_wrong_count', 0, 100), LADDER.length - 1)];
}

function toneScore(item) {
  if (item.skipped === true || item.guide === true || item.failed === true) return 0;
  const learning = item.learningEvidence || item.learning_evidence;
  const components = learning && learning.componentWrongCounts;
  if (components !== undefined) {
    if (!Array.isArray(components) || !components.length || components.length > 100) fail('invalid_tone_components');
    for (let index = 0; index < components.length; index += 1) {
      if (!own(components, index)) fail('invalid_tone_components');
    }
    return Math.round(components.reduce((sum, count) => sum + ladderScore(count), 0) / components.length);
  }
  return ladderScore(item.wrong);
}

function readingScore(item, row) {
  if (item.skipped === true || item.guide === true) return 0;
  const learning = item.learningEvidence || item.learning_evidence;
  const counts = learning && learning.firstCheckSyllableWrongCounts;
  if (!Array.isArray(counts) || !counts.length || counts.length > 100) fail('missing_reading_first_check_evidence');
  if (counts.length !== canonicalUnitCount(row)) fail('reading_unit_count_mismatch');
  const scored = counts.slice(0, 7);
  return Math.round(scored.reduce((sum, count) => sum + ladderScore(count), 0) / scored.length);
}

function typingScore(item, row) {
  if (item.skipped === true || item.guide === true) return 0;
  const units = canonicalUnitCount(row);
  const quota = Math.min(4 + Math.max(0, units - 4), 9);
  const wrong = integer(item.wrong, 'invalid_wrong_count', 0, 100);
  return wrong >= quota ? 0 : Math.round(10 - (10 / quota) * wrong);
}

function listeningScore(item, row) {
  if (item.skipped === true || item.correct !== true) return 0;
  const mode = item.mode === 'type' ? 'type' : item.mode === 'mc' ? 'mc' : fail('invalid_listening_mode');
  const listens = integer(item.listens, 'invalid_listens', 1, 100);
  if (mode === 'mc') return listens <= 2 ? 5 : ({ 3: 3, 4: 2, 5: 1 }[listens] || 0);
  const words = string(row && row.word, 'canonical_word_missing').split(/\s+/).filter(Boolean).length || 1;
  if (words >= 3) return listens <= 3 ? 10 : ({ 4: 7, 5: 4, 6: 1 }[listens] || 0);
  return listens <= 2 ? 10 : ({ 3: 7, 4: 4, 5: 1 }[listens] || 0);
}

function wordOrderScore(item) {
  if (item.skipped === true) return 0;
  const wrong = integer(item.wrong, 'invalid_wrong_count', 0, 100);
  const learning = item.learningEvidence || item.learning_evidence;
  const hints = integer(learning && learning.hintCount, 'invalid_hint_count', 0, 100);
  if ((item.guide === true) !== (hints > 0)) fail('hint_evidence_mismatch');
  const wrongLoss = [0, 3, 6, 9, 10][Math.min(wrong, 4)];
  const score = Math.max(0, 10 - wrongLoss - hints * 2);
  if (item.failed === true && score !== 0) fail('word_order_failure_mismatch');
  return score;
}

function scoreFor(game, item, row) {
  if (game === 'tone') return toneScore(item);
  if (game === 'reading') return readingScore(item, row);
  if (game === 'typing') return typingScore(item, row);
  if (game === 'listening') return listeningScore(item, row);
  if (game === 'word_order') return wordOrderScore(item);
  fail('invalid_game');
}

export function verifyLearningScore(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('invalid_learning_evidence');
  const game = String(input.game || '');
  if (!GAMES.includes(game)) fail('invalid_game');
  const item = input.item;
  if (!item || typeof item !== 'object' || Array.isArray(item)) fail('invalid_item');
  assertNoClientScore(item);
  const canonical = exactCanonicalRow(game, input.difficulty, item, input.canonicalRows);
  const row = canonical.row;
  const score = integer(scoreFor(game, item, row), 'invalid_verified_learning_score', 0, 10);
  return {
    serverVerified: true,
    verifiedBy: 'edge:' + game + ':v1',
    score,
    contentRef: canonical.ref,
  };
}

export function verifyRoundLearningScores(input) {
  if (!input || !Array.isArray(input.items) || !input.items.length || input.items.length > 100) {
    fail('invalid_learning_items');
  }
  const grouped = new Map();
  input.items.forEach((item) => {
    const result = verifyLearningScore({
      game: input.game,
      difficulty: input.difficulty,
      item,
      canonicalRows: input.canonicalRows,
    });
    const identity = result.contentRef.source + ':' + result.contentRef.key;
    const old = grouped.get(identity);
    if (old) {
      if (input.game !== 'tone' || result.contentRef.source !== 'game_sentences') fail('duplicate_stable_item_in_round');
      old.scores.push(result.score);
    } else grouped.set(identity, { result, scores: [result.score] });
  });
  return Array.from(grouped.values()).map(({ result, scores }) => ({
    ...result,
    score: Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length),
  }));
}
