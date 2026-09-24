// Trusted preparation for the one PostgreSQL transaction that persists a
// Typing event, its learning transition, a same-round Retry obligation and the
// final per-game score. No browser-owned score or learning state enters here.
import { buildTypingResumeCheckpoint } from './typing-resume-checkpoint.mjs';

const STATES = new Set(['normal', 'retry_end_round', 'next_day_check', 'review_needed', 'weak_4d', 'srs']);
function fail(code) { throw Object.assign(new Error(code), { code }); }

function currentPrompt(evidence, event) {
  const prompt = evidence?.prompts?.[event.promptOrdinal - 1];
  if (!prompt || event.promptOrdinal !== evidence.round?.current_prompt_ordinal
      || prompt.prompt_ordinal !== event.promptOrdinal
      || prompt.content_ref?.source !== 'game_words'
      || !['primary', 'retry'].includes(prompt.attempt_kind || 'primary')
      || !STATES.has(prompt.learning_state)
      || typeof prompt.learning_state_token !== 'string' || !prompt.learning_state_token) {
    fail('invalid_typing_evidence');
  }
  return prompt;
}

function canonicalRow(rows, prompt, level) {
  const matches = (rows || []).filter((row) => row?.content_key === prompt.content_ref.key);
  const row = matches.length === 1 ? matches[0] : null;
  const units = Array.isArray(row?.syllables) ? row.syllables.length : 0;
  if (!row || row.level !== (level === 1 ? '初' : '中') || !units) fail('invalid_typing_evidence');
  return { row, units };
}

function primitiveCounts(evidence, prompt) {
  let wrong = 0; let guide = false;
  for (let index = evidence.events.length - 1; index >= 0; index--) {
    const event = evidence.events[index];
    if (event.prompt_ordinal !== prompt.prompt_ordinal) break;
    if (event.type === 'wrong') wrong++;
    if (event.type === 'hint_opened') guide = true;
  }
  return { wrong, guide };
}

function learningScore(units, counts) {
  if (counts.guide) return 0;
  const quota = Math.min(4 + Math.max(0, units - 4), 9);
  return counts.wrong >= quota ? 0 : Math.round(10 - (10 / quota) * counts.wrong);
}

async function sha256(value) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function prepareTypingAtomicEvent({ evidence, canonicalRows, event }) {
  if (!event || event.type !== 'completed') return {
    serverLearningScore: null, scoreVerifiedBy: null, serverFinalScore: null,
    evidenceHash: null, mirrorItems: null,
  };
  const prompt = currentPrompt(evidence, event);
  const canonical = canonicalRow(canonicalRows, prompt, evidence.round.level);
  if (event.answer !== canonical.row.word) fail('typing_completion_answer_mismatch');
  const counts = primitiveCounts(evidence, prompt);
  const serverLearningScore = learningScore(canonical.units, counts);
  const attemptKind = prompt.attempt_kind || 'primary';
  const schedulesRetry = attemptKind === 'primary'
    && ['normal', 'weak_4d'].includes(prompt.learning_state) && serverLearningScore <= 3;
  const primaryAfter = evidence.round.primary_completed_count + (attemptKind === 'primary' ? 1 : 0);
  const pendingAfter = evidence.round.pending_retry_count + (schedulesRetry ? 1 : 0)
    - (attemptKind === 'retry' ? 1 : 0);
  if (primaryAfter > 5 || pendingAfter < 0 || pendingAfter > 5) fail('invalid_typing_evidence');
  const noQueuedPromptAfterCurrent = event.promptOrdinal === evidence.prompts.length;
  const finalAfter = primaryAfter === 5 && pendingAfter === 0 && noQueuedPromptAfterCurrent;
  let serverFinalScore = null; let evidenceHash = null; let mirrorItems = null;
  if (finalAfter) {
    const projected = buildTypingResumeCheckpoint({
      serverRound: {
        roundId: evidence.round.round_id, game: 'typing',
        difficulty: evidence.round.level === 1 ? '初' : '中',
        startingCombo: evidence.round.starting_combo,
        prompts: evidence.prompts.map((row) => ({ contentRef: row.content_ref,
          golden: row.golden, srsBonus: row.srs_bonus, attemptKind: row.attempt_kind || 'primary' })),
      },
      canonicalRows,
      serverEvents: [...evidence.events, {
        operation_id: event.operationId, sequence: event.sequence,
        content_ref: prompt.content_ref, type: 'completed', answer: event.answer,
      }],
    });
    if (!projected.complete || projected.primaryCompletedCount !== 5) fail('invalid_typing_evidence');
    serverFinalScore = projected.finalScore;
    mirrorItems = projected.confirmedItems.filter((item) => item.outcome === 'completed'
      && (item.wrong > 0 || item.guide)).map((item) => ({
      content_ref: item.contentRef, wrong: item.wrong, guide: item.guide,
      attempt_kind: item.attemptKind,
    }));
    evidenceHash = await sha256({ version: projected.version, round_id: projected.roundId,
      score: projected.finalScore, confirmed_event_count: projected.confirmedEventCount,
      items: projected.confirmedItems });
  }
  return { serverLearningScore, scoreVerifiedBy: 'edge:typing:v2',
    serverFinalScore, evidenceHash, mirrorItems };
}
