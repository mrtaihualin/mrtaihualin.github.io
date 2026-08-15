// Pure score-submission validator shared by the Edge Function and local tests.
// The caller never supplies user_id/created_at. The server derives identity and time.

export const CORE_GAMES = Object.freeze(['tone', 'reading', 'listening', 'typing', 'word_order']);

const SCORE_CAP = Object.freeze({
  tone: 3000,
  reading: 5000,
  listening: 2000,
  typing: 5000,
  word_order: 5000,
});

const ITEM_CAP = Object.freeze({
  tone: 60,
  reading: 500,
  listening: 20,
  typing: 200,
  word_order: 60,
});

const DIFFICULTY_WEIGHT = Object.freeze({ '初': 1, '中': 1.5, '高': 2, mixed: 1 });
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function fail(code) {
  const err = new Error(code);
  err.code = code;
  throw err;
}

function finiteInt(value, code, min, max) {
  if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value)) fail(code);
  if (value < min || value > max) fail(code);
  return value;
}

function difficultyFor(game, raw) {
  const value = String(raw || '');
  if (game === 'listening') {
    if (value !== 'mixed') fail('invalid_difficulty');
    return value;
  }
  if (game === 'word_order') {
    if (value !== '高') fail('invalid_difficulty');
    return value;
  }
  if (!Object.prototype.hasOwnProperty.call(DIFFICULTY_WEIGHT, value) || value === 'mixed') fail('invalid_difficulty');
  return value;
}

function validateRoundSize(game, difficulty, total) {
  if (game === 'tone') {
    if (difficulty === '高' ? (total < 1 || total > 20) : total !== 5) fail('invalid_total');
    return;
  }
  if (game === 'reading' || game === 'typing') {
    if (total !== (difficulty === '高' ? 1 : 5)) fail('invalid_total');
    return;
  }
  if (game === 'word_order' && total !== 3) fail('invalid_total');
  if (game === 'listening' && (total < 10 || total > 100)) fail('invalid_total');
}

function comboMultiplier(streak) {
  return streak >= 8 ? 3 : streak >= 5 ? 2 : streak >= 3 ? 1.5 : 1;
}

function listeningPoints(item) {
  const mode = item.mode === 'type' ? 'type' : item.mode === 'mc' ? 'mc' : fail('invalid_listening_mode');
  const listens = finiteInt(item.listens, 'invalid_listens', 1, 100);
  const correct = item.correct === true;
  let primary = 0;
  if (correct) {
    if (mode === 'mc') primary = listens <= 2 ? 5 : ({ 3: 3, 4: 2, 5: 1 }[listens] || 0);
    else {
      const words = finiteInt(item.wordCount, 'invalid_word_count', 1, 100);
      if (words >= 3) primary = listens <= 3 ? 10 : ({ 4: 7, 5: 4, 6: 1 }[listens] || 0);
      else primary = listens <= 2 ? 10 : ({ 3: 7, 4: 4, 5: 1 }[listens] || 0);
    }
  }
  let typingBonus = 0;
  if (mode === 'type') {
    const units = finiteInt(item.unitCount, 'invalid_unit_count', 1, 100);
    const wrong = finiteInt(item.typingWrong, 'invalid_typing_wrong', 0, 100);
    const quota = Math.min(4 + Math.max(0, units - 4), 9);
    typingBonus = wrong >= quota ? 0 : Math.round(10 - (10 / quota) * wrong);
  }
  return primary + typingBonus;
}

function normalizeItem(game, item) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) fail('invalid_item');
  const key = String(item.key || '').trim();
  if (!key || key.length > 200) fail('invalid_content_key');
  const points = finiteInt(item.points, 'invalid_item_points', 0, ITEM_CAP[game]);
  const wrong = finiteInt(item.wrong, 'invalid_wrong_count', 0, 100);
  const guide = item.guide === true;
  const failed = item.failed === true;
  const mastered = item.mastered === true;

  if (game === 'listening') {
    const expected = listeningPoints(item);
    if (points !== expected) fail('score_evidence_mismatch');
  } else {
    if (guide && points !== 0) fail('score_evidence_mismatch');
    if (game !== 'reading' && game !== 'tone' && failed && points !== 0) fail('score_evidence_mismatch');
  }

  return {
    key,
    points,
    wrong,
    guide,
    failed,
    mastered,
    mode: game === 'listening' ? item.mode : undefined,
    listens: game === 'listening' ? item.listens : undefined,
    correct: game === 'listening' ? item.correct === true : undefined,
    wordCount: game === 'listening' ? item.wordCount : undefined,
    unitCount: game === 'listening' ? item.unitCount : undefined,
    typingWrong: game === 'listening' ? item.typingWrong : undefined,
  };
}

export function validateScoreSubmission(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) fail('invalid_payload');
  if (['user_id', 'userId', 'created_at', 'score', 'total'].some((key) => Object.prototype.hasOwnProperty.call(body, key))) {
    fail('forbidden_derived_field');
  }
  if (!UUID_V4.test(String(body.submission_id || ''))) fail('invalid_submission_id');
  const game = String(body.game || '');
  if (!CORE_GAMES.includes(game)) fail('invalid_game');
  const difficulty = difficultyFor(game, body.difficulty);
  const rawItems = body.evidence && body.evidence.items;
  if (!Array.isArray(rawItems) || rawItems.length < 1 || rawItems.length > 100) fail('invalid_total');
  validateRoundSize(game, difficulty, rawItems.length);
  const items = rawItems.map((item) => normalizeItem(game, item));

  const seen = new Map();
  items.forEach((item) => {
    const count = (seen.get(item.key) || 0) + 1;
    seen.set(item.key, count);
    if (game !== 'listening' && count > 1) fail('duplicate_content_item');
    if (game === 'listening' && count > 10) fail('excessive_content_replay');
  });

  const roundBonus = finiteInt(body.evidence.roundBonus, 'invalid_round_bonus', 0, 70);
  if (![0, 20, 70].includes(roundBonus)) fail('invalid_round_bonus');
  const srsBonus = finiteInt(body.evidence.srsBonus, 'invalid_srs_bonus', 0, items.length * 3);
  const cleanItems = items.filter((item) => item.wrong === 0 && !item.guide && !item.failed).length;
  const perfectEligible = cleanItems === items.length;
  if (roundBonus === 70 && !perfectEligible) fail('invalid_perfect_bonus');
  if ((game === 'reading' || game === 'typing') && items.some((item) => item.guide) && roundBonus !== 0) {
    fail('invalid_round_bonus');
  }
  if ((game === 'reading' || game === 'typing' || game === 'listening') && srsBonus !== 0) fail('invalid_srs_bonus');
  if ((game === 'tone' || game === 'word_order') && srsBonus > cleanItems * 3) fail('invalid_srs_bonus');
  const rawScore = items.reduce((sum, item) => sum + item.points, 0) + roundBonus + srsBonus;
  const score = Math.round(rawScore * DIFFICULTY_WEIGHT[difficulty]);
  finiteInt(score, 'invalid_computed_score', 0, SCORE_CAP[game]);
  const clientScore = finiteInt(body.client_score, 'invalid_client_score', 0, SCORE_CAP[game]);
  if (clientScore !== score) fail('score_evidence_mismatch');

  return {
    submissionId: String(body.submission_id).toLowerCase(),
    game,
    difficulty,
    score,
    total: items.length,
    evidence: { items, roundBonus, srsBonus },
  };
}

// Second-stage validation after the Edge Function loads protected canonical content.
// This rejects an item score outside the formula's attainable envelope; the final score is
// always recalculated above and never copied from client_score.
export function validateCanonicalScoreEvidence(accepted, canonicalRows) {
  const rows = Array.isArray(canonicalRows) ? canonicalRows : [];
  const byKey = new Map(rows.map((row) => [String(row.th || row.word || ''), row]));
  let cleanStreak = 0;
  accepted.evidence.items.forEach((item) => {
    const row = byKey.get(item.key);
    if (!row) fail('invalid_content_evidence');
    const clean = item.wrong === 0 && !item.guide && !item.failed;
    cleanStreak = clean ? cleanStreak + 1 : 0;
    const combo = clean ? comboMultiplier(cleanStreak) : 1;
    const golden = clean ? 2 : 1;
    let baseMax = 10;
    let embeddedSrsMax = 0;
    if (accepted.game === 'tone') baseMax = 10;
    if (accepted.game === 'typing') {
      const units = Array.isArray(row.read_syls) && row.read_syls.length
        ? row.read_syls.length
        : Array.isArray(row.syls) && row.syls.length ? row.syls.length
        : finiteInt(row.wc, 'invalid_canonical_units', 1, 100);
      const quota = Math.min(4 + Math.max(0, units - 4), 9);
      baseMax = item.wrong >= quota ? 0 : Math.round(10 - (10 / quota) * item.wrong);
      embeddedSrsMax = clean ? 3 : 0;
    }
    if (accepted.game === 'word_order') {
      const wrongDeduction = [0, 3, 6, 9, 10][Math.min(item.wrong, 4)];
      baseMax = Math.max(0, 10 - wrongDeduction - (item.guide ? 2 : 0));
    }
    if (accepted.game === 'reading') {
      const units = accepted.difficulty === '高'
        ? finiteInt(row.wc, 'invalid_canonical_units', 1, 100)
        : 7;
      baseMax = 10 + Math.max(0, units - 7) * 2;
      embeddedSrsMax = clean ? 3 : 0;
    }
    const maxPoints = Math.round(baseMax * golden * combo) + embeddedSrsMax;
    if (item.points > maxPoints) fail('impossible_item_score');
  });
  return accepted;
}
