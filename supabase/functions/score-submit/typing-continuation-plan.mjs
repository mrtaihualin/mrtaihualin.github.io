// Internal preparation only; not connected to the OFF HTTP routes.
// The authenticated issuance owner must load the round, events and an ordered,
// quota-approved reserve from protected storage. A browser must never supply
// these inputs. Persist reserve consumption + appended prompt + terminal event
// atomically/idempotently before returning success. That integration is pending.
import { buildTypingResumeCheckpoint } from './typing-resume-checkpoint.mjs';

const RECORD_HASH = /^[0-9a-f]{64}$/;
function fail(code) { throw Object.assign(new Error(code), { code }); }
function identity(ref) {
  if (ref?.source !== 'game_words' || typeof ref.key !== 'string' || !ref.key || ref.key.trim() !== ref.key) {
    fail('invalid_typing_reserve');
  }
  return ref.key;
}

export function planTypingContinuation({ serverRound, canonicalRows, serverEvents, serverReserve, nextEventType }) {
  if (!['wrong', 'hint_opened', 'completed', 'skipped'].includes(nextEventType)) fail('invalid_typing_event_type');
  // Reduce only persisted events, never treat the proposed event as confirmed.
  const checkpoint = buildTypingResumeCheckpoint({ serverRound, canonicalRows, serverEvents });
  if (checkpoint.complete) fail('round_not_active');
  if (!serverReserve || !Array.isArray(serverReserve.prompts)
      || !Number.isSafeInteger(serverReserve.cursor) || serverReserve.cursor < 0
      || serverReserve.cursor > serverReserve.prompts.length) fail('invalid_typing_reserve');
  const result = { expectedPromptCount: serverRound.prompts.length,
    expectedEventSequence: checkpoint.confirmedEventCount + 1,
    expectedReserveCursor: serverReserve.cursor, nextReserveCursor: serverReserve.cursor, prompts: [] };
  const terminal = nextEventType === 'completed' || nextEventType === 'skipped';
  const closesRound = nextEventType === 'completed' && checkpoint.completedCount === 4;
  // Existing next prompt always wins. No reallocation, category matching or
  // random redraw is allowed just because the current prompt was skipped.
  if (!terminal || closesRound || checkpoint.consumedPromptCount + 1 < serverRound.prompts.length) return result;

  const completed = new Set(checkpoint.confirmedItems
    .filter((item) => item.outcome === 'completed').map((item) => identity(item.contentRef)));
  if (nextEventType === 'completed') {
    const current = serverRound.prompts[checkpoint.currentPromptIndex];
    completed.add(identity(current.contentRef || current.content_ref));
  }
  // Only already-completed identities are excluded. A previously skipped item
  // may occur again if the protected queue owner placed it later in the queue.
  // There is deliberately no same-category or regular-only replacement rule.
  for (let cursor = serverReserve.cursor; cursor < serverReserve.prompts.length; cursor++) {
    const prompt = serverReserve.prompts[cursor];
    const key = identity(prompt?.content_ref);
    if (typeof prompt.golden !== 'boolean' || typeof prompt.srs_bonus !== 'boolean'
        || typeof prompt.answer !== 'string' || !prompt.answer || prompt.answer.trim() !== prompt.answer
        || typeof prompt.catalog_version !== 'string' || !prompt.catalog_version
        || prompt.catalog_version.trim() !== prompt.catalog_version || prompt.catalog_version.length > 128
        || !RECORD_HASH.test(prompt.record_hash || '')
        || [...prompt.answer].length > 512) fail('invalid_typing_reserve');
    const matches = canonicalRows.filter((row) => row.content_key === key);
    if (matches.length !== 1 || matches[0].level !== checkpoint.difficulty || matches[0].word !== prompt.answer
        || matches[0].catalog_version !== prompt.catalog_version || matches[0].record_hash !== prompt.record_hash) {
      fail('typing_reserve_canonical_mismatch');
    }
    if (completed.has(key)) continue;
    const selected = { content_ref: { source: 'game_words', key }, answer: prompt.answer,
      catalog_version: prompt.catalog_version, record_hash: prompt.record_hash,
      golden: prompt.golden, srs_bonus: prompt.srs_bonus };
    // Reuse the canonical/entitlement validator on the extended protected queue.
    // This still reduces ONLY the original persisted events.
    buildTypingResumeCheckpoint({ serverRound: { ...serverRound,
      prompts: [...serverRound.prompts, { contentRef: selected.content_ref,
        golden: selected.golden, srsBonus: selected.srs_bonus }] }, canonicalRows, serverEvents });
    return { ...result, nextReserveCursor: cursor + 1, prompts: [selected] };
  }
  // No success or fabricated round completion when the owner has no continuation.
  // Refill/replay/Resume must be handled by the protected issuance owner.
  fail('typing_reserve_exhausted');
}
