// Internal, source-only preparation for Login Free 初/中. Not an HTTP handler.
// Inputs MUST come from the authenticated catalog/currentLearningSnapshot owners,
// never from request JSON. This function does not establish ownership or persist
// issuance. Call exactly once inside the future idempotent creation workflow;
// retries/Resume must read its saved output, not generate another plan.
import { classifyLearningState } from '../_shared/login-free-learning-engine.mjs';

const UINT32_RANGE = 0x100000000;
const RECORD_HASH = /^[0-9a-f]{64}$/;
function fail(code) { throw Object.assign(new Error(code), { code }); }
function text(value) { return typeof value === 'string' && value.length > 0 && value.trim() === value; }
function version(value) { return text(value) && value.length <= 128; }
function secureUint32() { return crypto.getRandomValues(new Uint32Array(1))[0]; }

// Rejection sampling avoids modulo bias, including at the exact 18/100 boundary.
function drawBelow(limit, randomUint32) {
  const ceiling = UINT32_RANGE - UINT32_RANGE % limit;
  for (let attempt = 0; attempt < 128; attempt++) {
    const value = randomUint32();
    if (!Number.isInteger(value) || value < 0 || value >= UINT32_RANGE) fail('invalid_typing_random');
    if (value < ceiling) return value % limit;
  }
  fail('typing_random_unavailable');
}

function shuffled(rows, randomUint32) {
  const copy = rows.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = drawBelow(i + 1, randomUint32);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function classifyTypingPromptRows({ level, today, snapshots, canonicalRows }) {
  if (![1, 2].includes(level)) fail('invalid_typing_level');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today || '') || !Number.isFinite(Date.parse(today + 'T00:00:00Z'))
      || new Date(today + 'T00:00:00Z').toISOString().slice(0, 10) !== today) fail('invalid_typing_day');
  if (!Array.isArray(snapshots) || !Array.isArray(canonicalRows)) fail('invalid_typing_catalog');
  const code = level === 1 ? '初' : '中';
  const canonical = new Map();
  for (const row of canonicalRows) {
    const record = row?.canonical_record;
    if (!text(row?.content_key) || canonical.has(row.content_key) || row.level !== code
        || row.status !== 'active' || !['guest', 'login'].includes(row.access_tier)
        || !version(row.catalog_version) || !RECORD_HASH.test(row.record_hash || '')
        || record?.contentKey !== row.content_key || record.level !== code || !text(record.word)
        || [...record.word].length > 512 || !Array.isArray(record.syllables) || !record.syllables.length) fail('invalid_typing_catalog');
    canonical.set(row.content_key, row);
  }
  const ids = new Set();
  const keys = new Set();
  const buckets = { review_due: [], srs_due: [], regular_or_new: [] };
  for (const row of snapshots) {
    const ref = row?.content_ref;
    if (!text(row?.item_id) || !text(row.state_token) || ids.has(row.item_id)
        || ref?.source !== 'game_words' || !text(ref.key) || keys.has(ref.key)
        || !canonical.has(ref.key)) fail('invalid_typing_snapshot');
    ids.add(row.item_id); keys.add(ref.key);
    // Preserve the existing owner's unresolved-legacy exclusion, without reading
    // or deriving any legacy vocabulary. Do not trust the caller's bucket label.
    if (row.state === 'legacy_identity_unresolved') continue;
    if (['srs', 'mastered'].includes(row.state) && ![0, 1, 2, 3].includes(row.stage)) fail('invalid_typing_snapshot');
    const bucket = classifyLearningState({ state: row.state, stage: row.stage, dueOn: row.due_on,
      roundId: row.round_id, reviewAttemptsUsed: row.review_attempts_used,
      mastered: row.mastered, everFailed: row.ever_failed }, today);
    // Free stage 3 is terminal; an inconsistent non-mastered stage must fail shut.
    if (row.state === 'srs' && row.stage === 3 && row.mastered !== true) fail('invalid_typing_snapshot');
    if (buckets[bucket]) buckets[bucket].push(row);
  }
  return { buckets, canonical };
}

function selectTypingPromptRows(input, randomUint32) {
  if (typeof randomUint32 !== 'function') fail('invalid_typing_catalog');
  const { buckets, canonical } = classifyTypingPromptRows(input);
  const nextDay = buckets.review_due.find((row) => row.state === 'next_day_check');
  const review = nextDay || buckets.review_due[0];
  const srs = buckets.srs_due[0];
  const required = 5 - Number(Boolean(review)) - Number(Boolean(srs));
  if (buckets.regular_or_new.length < required) fail('insufficient_eligible_items');
  // Separate one-in-five quotas. Overflow stays with the learning owner; never
  // fill a shortage using additional Due, non-due, Retry or mastered content.
  const orderedRegular = shuffled(buckets.regular_or_new, randomUint32);
  const rest = [...(review && !nextDay ? [review] : []), ...(srs ? [srs] : []),
    ...orderedRegular.slice(0, required)];
  const selected = [...(nextDay ? [nextDay] : []), ...shuffled(rest, randomUint32)];
  return { selected, reserve: orderedRegular.slice(required), canonical };
}

function prompt(row, canonical, randomUint32) {
  const source = canonical.get(row.content_ref.key);
  return {
    content_ref: { source: 'game_words', key: row.content_ref.key },
    answer: source.canonical_record.word,
    catalog_version: source.catalog_version,
    record_hash: source.record_hash,
    attempt_kind: 'primary',
    learning_state: row.state,
    learning_state_token: row.state_token,
    golden: drawBelow(100, randomUint32) < 18,
    // Eligibility only. The final atomic learning/score commit must enforce
    // once-per-stage awards; this plan does not claim that commit is integrated.
    srs_bonus: row.state === 'srs' && [1, 2].includes(row.stage),
  };
}

export function buildTypingInitialPromptPlan(input, randomUint32 = secureUint32) {
  const plan = selectTypingPromptRows(input, randomUint32);
  return plan.selected.map((row) => prompt(row, plan.canonical, randomUint32));
}

// Allocate the bounded first reserve batch in the same protected draw as the
// initial five. The remaining eligible pool stays unissued for a later bounded
// refill transaction; no browser may redraw or reorder this persisted batch.
export function buildTypingInitialRoundAllocation(input, randomUint32 = secureUint32) {
  const plan = selectTypingPromptRows(input, randomUint32);
  return {
    prompts: plan.selected.map((row) => prompt(row, plan.canonical, randomUint32)),
    reservePrompts: plan.reserve.slice(0, 64).map((row) => prompt(row, plan.canonical, randomUint32)),
  };
}

function keySet(value, code) {
  if (!Array.isArray(value)) fail(code);
  const result = new Set();
  for (const key of value) {
    if (!text(key) || key.length > 512 || result.has(key)) fail(code);
    result.add(key);
  }
  return result;
}

// Refill only the regular/new pool. Previously skipped regular identities may
// return after every never-issued eligible identity, but completed or currently
// queued identities can never be selected. Due/Retry/Mastered overflow remains
// with the learning owner and is intentionally unavailable here.
export function buildTypingReserveRefillPlan(input, randomUint32 = secureUint32) {
  const { buckets, canonical } = classifyTypingPromptRows(input);
  if (typeof randomUint32 !== 'function') fail('invalid_typing_catalog');
  const issued = keySet(input.issuedKeys, 'invalid_typing_refill_evidence');
  const completed = keySet(input.completedKeys, 'invalid_typing_refill_evidence');
  const queued = keySet(input.queuedKeys, 'invalid_typing_refill_evidence');
  if ([...completed].some((key) => !issued.has(key))
      || [...queued].some((key) => !issued.has(key) || completed.has(key))) {
    fail('invalid_typing_refill_evidence');
  }
  const eligible = buckets.regular_or_new.filter((row) => {
    const key = row.content_ref.key;
    return !completed.has(key) && !queued.has(key);
  });
  const unseen = shuffled(eligible.filter((row) => !issued.has(row.content_ref.key)), randomUint32);
  const recycled = shuffled(eligible.filter((row) => issued.has(row.content_ref.key)), randomUint32);
  const selected = [...unseen, ...recycled].slice(0, 64);
  if (!selected.length) fail('typing_refill_unavailable');
  return selected.map((row) => ({ ...prompt(row, canonical, randomUint32), srs_bonus: false }));
}
