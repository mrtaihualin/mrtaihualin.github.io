import { classifyLearningState } from '../_shared/login-free-learning-engine.mjs';

function fail(code) {
  throw Object.assign(new Error(code), { code });
}

function learningToken(itemId, row) {
  if (row?.state_token) return String(row.state_token);
  return 'legacy-stable:' + itemId + ':' + Number(row?.stage || 0) + ':' + String(row?.due_date || '') + ':' +
    String(row?.ever_failed === true) + ':' + String(row?.mastered === true);
}

async function read(query, signal) {
  const result = signal ? await query.retry(false).abortSignal(signal) : await query;
  if (!result || result.error || !Array.isArray(result.data)) fail('learning_queue_unavailable');
  return result.data;
}

// Protected server-side learning-state owner shared by the existing queue and
// future Typing issuance. Catalog rows and user identity must never come from
// browser request JSON.
export async function readCurrentLearningSnapshot({ admin, userId, game, level, catalog, today, signal }) {
  const review = await read(admin.from('phase1_learning_review_states')
    .select('item_id,state,state_token,due_on,round_id,review_attempts_used,updated_at')
    .eq('user_id', userId).eq('game', game).eq('level', level).limit(2000), signal);
  const srs = await read(admin.from('tone_srs_state')
    .select('item_id,word,state_token,stage,due_date,ever_failed,mastered,updated_at')
    .eq('user_id', userId).eq('game', game).eq('level', level).limit(2000), signal);

  const reviewById = new Map(review.map((row) => [row.item_id, row]));
  const srsById = new Map(srs.filter((row) => row.item_id).map((row) => [row.item_id, row]));
  const blocked = new Set();
  for (const row of srs.filter((item) => !item.item_id)) {
    let matches = catalog.filter((item) => item.content_ref.key === row.word);
    if (!matches.length && row.word) {
      matches = catalog.filter((item) => item.content_ref.source === 'game_words'
        && item.content_ref.key.startsWith(String(row.word) + '@'));
    }
    if (matches.length > 1) fail('legacy_srs_identity_ambiguous');
    if (matches.length === 1) blocked.add(matches[0].item_id);
  }

  return catalog.map((item) => {
    const reviewRow = reviewById.get(item.item_id);
    const srsRow = srsById.get(item.item_id);
    if (reviewRow && srsRow) fail('state_owner_conflict');
    if (blocked.has(item.item_id)) {
      return { ...item, state: 'legacy_identity_unresolved', state_token: 'blocked:' + item.item_id,
        due_on: null, stage: null, ever_failed: null, mastered: false, bucket: 'non_due_srs' };
    }
    if (srsRow) {
      const state = srsRow.mastered ? 'mastered' : 'srs';
      const snapshot = { ...item, state, state_token: learningToken(item.item_id, srsRow),
        due_on: srsRow.due_date || null, stage: Number(srsRow.stage || 0), ever_failed: srsRow.ever_failed === true,
        mastered: srsRow.mastered === true };
      return { ...snapshot, bucket: classifyLearningState({ state, stage: snapshot.stage, dueOn: snapshot.due_on,
        everFailed: snapshot.ever_failed, mastered: snapshot.mastered }, today) };
    }
    if (reviewRow) {
      const snapshot = { ...item, state: reviewRow.state, state_token: String(reviewRow.state_token),
        due_on: reviewRow.due_on, round_id: reviewRow.round_id,
        review_attempts_used: reviewRow.review_attempts_used,
        stage: null, ever_failed: null, mastered: false };
      return { ...snapshot, bucket: classifyLearningState({ state: snapshot.state, dueOn: snapshot.due_on,
        roundId: snapshot.round_id, reviewAttemptsUsed: snapshot.review_attempts_used }, today) };
    }
    return { ...item, state: 'normal', state_token: 'normal:' + item.item_id, due_on: null,
      stage: null, ever_failed: null, mastered: false, bucket: 'regular_or_new' };
  });
}
