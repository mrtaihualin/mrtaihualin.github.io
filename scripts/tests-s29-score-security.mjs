#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateCanonicalScoreEvidence, validateScoreSubmission } from '../supabase/functions/score-submit/score-engine.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const uuid = '123e4567-e89b-42d3-a456-426614174000';

function item(key, points, extra = {}) {
  return { key, points, wrong: 0, guide: false, failed: false, mastered: false, ...extra };
}
function payload(game, difficulty, points, roundBonus = 20, extraItem = {}) {
  const total = game === 'listening' ? 10
    : game === 'word_order' ? 3
    : (game === 'reading' || game === 'typing') && difficulty === '高' ? 1
    : game === 'tone' && difficulty === '高' ? 3 : 5;
  const items = Array.from({ length: total }, (_, index) => item(
    game === 'listening' ? 'กา' : `กา${index + 1}`,
    points,
    extraItem,
  ));
  const score = Math.round((points * total + roundBonus) * ({ 初: 1, 中: 1.5, 高: 2, mixed: 1 })[difficulty]);
  return {
    submission_id: uuid,
    game,
    difficulty,
    client_score: score,
    evidence: { items, roundBonus, srsBonus: 0 },
  };
}
function rejects(body, code) {
  assert.throws(() => validateScoreSubmission(body), (error) => error && error.code === code);
}

const validCases = [
  payload('tone', '初', 10),
  payload('reading', '初', 10),
  payload('typing', '初', 10),
  payload('word_order', '高', 10),
  payload('listening', 'mixed', 5, 0, {
    mode: 'mc', listens: 1, correct: true, wordCount: 1, unitCount: 1, typingWrong: 0,
  }),
];
validCases.forEach((body) => assert.equal(validateScoreSubmission(body).score, body.client_score));
console.log('VALID_SCORE=PASS (CORE5)');

const forged = payload('reading', '初', 10);
forged.client_score = 5000;
rejects(forged, 'score_evidence_mismatch');
console.log('FORGED_HIGH_SCORE=REJECT');

const negative = payload('typing', '初', 10);
negative.client_score = -1;
rejects(negative, 'invalid_client_score');
console.log('NEGATIVE_SCORE=REJECT');

const malformed = payload('tone', '初', 10);
malformed.client_score = 30.5;
rejects(malformed, 'invalid_client_score');
console.log('MALFORMED_SCORE=REJECT');

const wrongUser = { ...payload('reading', '初', 10), user_id: '00000000-0000-4000-8000-000000000000' };
rejects(wrongUser, 'forbidden_derived_field');
console.log('WRONG_USER_ID=REJECT');

const wrongGame = payload('reading', '初', 10);
wrongGame.game = 'lego';
rejects(wrongGame, 'invalid_game');
const wrongDifficulty = payload('typing', '初', 10);
wrongDifficulty.difficulty = '高';
wrongDifficulty.client_score = 30;
rejects(wrongDifficulty, 'invalid_total');
console.log('GAME_AND_DIFFICULTY_TAMPER=REJECT');

const listeningForge = payload('listening', 'mixed', 20, 0, {
  mode: 'mc', listens: 1, correct: true, wordCount: 1, unitCount: 1, typingWrong: 0,
});
rejects(listeningForge, 'score_evidence_mismatch');
console.log('GAME_FORMULA_RECALCULATION=PASS');

const impossibleItem = payload('reading', '高', 500, 0);
const impossibleAccepted = validateScoreSubmission(impossibleItem);
assert.throws(
  () => validateCanonicalScoreEvidence(impossibleAccepted, [{ th: 'กา1', wc: 8 }]),
  (error) => error && error.code === 'impossible_item_score',
);
validCases.forEach((body) => {
  const accepted = validateScoreSubmission(body);
  const rows = Array.from(new Set(accepted.evidence.items.map((entry) => entry.key))).map((key) =>
    body.difficulty === '高' ? { th: key, wc: 8 } : { word: key, level: body.difficulty, syls: [{}] });
  validateCanonicalScoreEvidence(accepted, rows);
});
console.log('GAME_SPECIFIC_ITEM_BOUNDS=ENFORCED');

const impossibleSequence = validateScoreSubmission(payload('tone', '初', 60));
assert.throws(
  () => validateCanonicalScoreEvidence(impossibleSequence, impossibleSequence.evidence.items.map((entry) => ({ word: entry.key, level: '初' }))),
  (error) => error && error.code === 'impossible_item_score',
);
console.log('IMPOSSIBLE_COMBO_SEQUENCE=REJECT');

const fakePerfect = payload('typing', '初', 7, 70);
fakePerfect.evidence.items[0].wrong = 1;
rejects(fakePerfect, 'invalid_perfect_bonus');
const fakeSrs = payload('tone', '初', 10);
fakeSrs.evidence.srsBonus = 15;
fakeSrs.evidence.items.forEach((entry) => { entry.wrong = 1; });
rejects(fakeSrs, 'invalid_srs_bonus');
console.log('FORGED_ROUND_AND_SRS_BONUS=REJECT');

const edge = read('supabase/functions/score-submit/index.ts');
assert.match(edge, /auth\.getUser\(\)/);
assert.match(edge, /if \(userError \|\| !user\).*unauthorized/);
assert.match(edge, /user_id: user\.id/);
assert.doesNotMatch(edge, /user_id:\s*body\./);
assert.match(edge, /p_limit:\s*30/);
assert.match(edge, /p_window:\s*600/);
assert.match(edge, /rate_limit_unavailable/);
assert.match(edge, /inserted\.error\.code !== '23505'/);
assert.match(edge, /evidence_hash/);
assert.match(edge, /replay_conflict/);
assert.match(edge, /idempotent: true/);
console.log('NO_AUTH=REJECT (handler contract)');
console.log('EXPIRED_OR_INVALID_AUTH=REJECT (getUser contract)');
console.log('REPLAY_SUBMISSION=REJECT_OR_IDEMPOTENT');
console.log('CONCURRENT_DUPLICATE=SAFE (UUID PK + 23505 path)');
console.log('RATE_LIMIT=ENFORCED (30/user/600s fail-closed)');

const sql = read('supabase/sql/2026-08-15_s29_authoritative_score_security.sql');
assert.match(sql, /submission_id uuid primary key/);
assert.match(sql, /revoke all on table public\.game_score_submissions from public, anon, authenticated/);
assert.match(sql, /revoke insert, update, delete on table public\.reading_sessions from public, anon, authenticated/);
assert.match(sql, /revoke insert, update, delete on table public\.tone_sessions from public, anon, authenticated/);
assert.match(sql, /tone_sessions_score_sane check \(score between 0 and 3000\) not valid/);
assert.match(sql, /reading_sessions_games_sane check \(games between 1 and 10\) not valid/);
assert.match(sql, /for select to authenticated\s+using \(auth\.uid\(\) = user_id\)/);
assert.doesNotMatch(sql, /create function public\.combined_leaderboard_/);
for (const signature of sql.matchAll(/returns table\(([^)]+)\)/g)) {
  assert.doesNotMatch(signature[1], /\buser_id\b|\bemail\b/);
  assert.match(signature[1], /is_current_user boolean/);
}
console.log('DIRECT_DB_WRITE=BLOCKED (migration contract)');
console.log('UNAUTHORIZED_UPDATE=BLOCKED (migration contract)');
console.log('LEADERBOARD_READ=PASS (safe RPC contract)');
console.log('PRIVATE_DATA_EXPOSURE=NONE (no user_id/email in RPC returns)');

const authClient = read('js/games/reading-auth.js');
const toneCompanion = read('js/games/tone-companion.js');
assert.doesNotMatch(authClient, /from\(['"]reading_sessions['"]\)\.insert/);
assert.doesNotMatch(toneCompanion, /from\(['"]tone_sessions['"]\)\.insert/);
assert.match(authClient, /functions\.invoke\(['"]score-submit['"]/);
for (const file of [
  'js/games/tone-finder-game.js', 'js/games/reading-game-app.js',
  'js/games/listening-game-app.js', 'js/games/typing-game-app.js', 'js/games/word-order-app.js',
]) {
  const source = read(file);
  assert.match(source, /READING_AUTH\.saveScore/);
  assert.match(source, /items\s*:/);
}
console.log('CORE5_CLIENT_INTEGRATION=PASS');

const publicBoard = read('js/score/leaderboard.js') + read('js/score/reading-leaderboard.js');
assert.doesNotMatch(publicBoard, /r\.user_id/);
assert.match(publicBoard, /r\.is_current_user === true/);
console.log('LEADERBOARD_PRIVACY_CLIENT=PASS');

const boardHub = read('all-board.html');
assert.doesNotMatch(boardHub, /LB_COMBINED|combined_leaderboard|全部加起來/);
for (const page of ['leaderboard.html', 'reading-board.html', 'listening-board.html', 'typing-board.html', 'word-order-board.html']) {
  assert.match(boardHub, new RegExp(page.replace('.', '\\.')));
}
for (const page of ['mix-board.html', 'lego-board.html']) {
  const legacyBoard = read(page);
  assert.match(legacyBoard, /data-phase1-access="no-(?:challenge|lego)-leaderboard"/);
  assert.doesNotMatch(legacyBoard, /<script[^>]+reading-leaderboard\.js/);
}
console.log('NO_CROSS_GAME_TOTAL=PASS (PD-SCORE-01)');

console.log('\n✅ S29 local score-security contract ผ่านทั้งหมด');
