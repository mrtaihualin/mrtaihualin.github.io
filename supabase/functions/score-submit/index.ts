// Supabase Edge Function: authenticated, idempotent Core-5 score submission.
// Direct browser writes to leaderboard source tables are revoked by the S29 SQL migration.
// deno-lint-ignore-file
// @ts-nocheck

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { validateCanonicalScoreEvidence, validateScoreSubmission } from './score-engine.mjs';
import { HIDDEN_REVIEW_SCORE_DEFAULT_ENABLED, verifyLearningScore, verifyRoundLearningScores } from './learning-score-verifier.mjs';

const LOGIN_FREE_REVIEW_ACTIONS_ENABLED = true;
const REVIEW_STAGING_PROJECT_REF = 'xufxvwcelbovzsxywawg';
const REVIEW_STAGING_TEST_SCOPE = 'srs-sandbox-day0';
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REVIEW_GAMES = new Set(['tone', 'reading', 'listening', 'typing', 'word_order']);

const ALLOWED_ORIGINS = [
  'https://mrtaihualin.com',
  'https://www.mrtaihualin.com',
  'https://mrtaihualin.github.io',
  'https://gentle-moxie-bf64ad.netlify.app',
];

function cors(origin: string) {
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Vary': 'Origin',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

function reply(origin: string, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(origin), 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(stableJson).join(',') + ']';
  if (value && typeof value === 'object') {
    return '{' + Object.keys(value).sort().map((key) => JSON.stringify(key) + ':' + stableJson(value[key])).join(',') + '}';
  }
  return JSON.stringify(value);
}

async function sha256(value: unknown) {
  const bytes = new TextEncoder().encode(stableJson(value));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function canonicalMirrorItems(accepted: any) {
  const keyName = accepted.game === 'tone' ? 'word' : 'th';
  return accepted.evidence.items
    .filter((item: any) => item.wrong > 0 || item.failed === true)
    .map((item: any) => ({ [keyName]: item.key, wrong: item.wrong }));
}

function taipeiDay() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

function reviewGame(value: unknown) {
  const game = String(value || '');
  if (!REVIEW_GAMES.has(game)) throw Object.assign(new Error('invalid_game'), { code: 'invalid_game' });
  return { verifier: game, database: game === 'word_order' ? 'wordorder' : game };
}

function reviewLevel(value: unknown) {
  const level = Number(value);
  if (![1, 2, 3].includes(level)) throw Object.assign(new Error('invalid_learning_level'), { code: 'invalid_learning_level' });
  return level;
}

function reviewCallerAllowed(user: any, url: string) {
  if (!url.includes(REVIEW_STAGING_PROJECT_REF)) return true;
  return user?.app_metadata?.test_scope === REVIEW_STAGING_TEST_SCOPE;
}

async function reviewCanonical(admin: any, game: string, level: number, item: any) {
  const ref = item && (item.contentRef || item.content_ref);
  if (!ref || !['game_words', 'game_sentences'].includes(String(ref.source || '')) || !String(ref.key || '').trim()) {
    throw Object.assign(new Error('missing_content_ref'), { code: 'missing_content_ref' });
  }
  let result;
  if (ref.source === 'game_words') {
    result = await admin.from('game_words')
      .select('content_key,word,level,syls,read_syls,reading_th')
      .eq('content_key', String(ref.key)).limit(2);
  } else {
    result = await admin.from('game_sentences')
      .select('th,wc,reading_th,words').eq('th', String(ref.key)).limit(2);
  }
  if (result.error) throw Object.assign(new Error('content_validation_unavailable'), { code: 'content_validation_unavailable' });
  const normalizedItem = {
    ...item,
    key: item.key || item.question,
    skipped: item.skipped === true || item.is_skipped === true,
    guide: item.guide === true || item.hint_used === true,
    failed: item.failed === true || (item.is_correct === false && Number(item.item_score) <= 0),
    wrong: item.wrong == null ? Number(item.wrong_count || 0) : item.wrong,
    correct: item.correct == null ? item.is_correct === true : item.correct,
    listens: item.listens == null ? Number(item.listen_count || 0) : item.listens,
    mode: item.mode || item.linguistic?.answer_mode,
    learningEvidence: item.learningEvidence || item.learning_evidence,
  };
  return verifyLearningScore({
    game, difficulty: ({ 1: '初', 2: '中', 3: '高' })[level], item: normalizedItem,
    canonicalRows: result.data || [], requireExplicitContentRef: true,
  });
}

async function handleReviewAction(origin: string, body: any, user: any, admin: any) {
  if (!LOGIN_FREE_REVIEW_ACTIONS_ENABLED) return reply(origin, { error: 'feature_disabled' }, 404);
  const action = String(body.action || '');
  const game = reviewGame(body.game);
  const level = reviewLevel(body.level);
  const today = taipeiDay();

  if (action === 'review_queue') {
    const playSetSize = Number(body.play_set_size);
    if (!Number.isInteger(playSetSize) || playSetSize < 1 || playSetSize > 100) {
      return reply(origin, { error: 'invalid_play_set_size' }, 400);
    }
    const states = await admin.from('phase1_learning_review_states')
      .select('item_id,state,due_on,updated_at')
      .eq('user_id', user.id).eq('game', game.database).eq('level', level)
      .in('state', ['next_day_check', 'review_needed', 'weak_4d'])
      .lte('due_on', today).order('due_on', { ascending: true }).order('updated_at', { ascending: true })
      .limit(Math.min(100, playSetSize * 5));
    if (states.error) return reply(origin, { error: 'review_queue_unavailable' }, 503);
    const itemIds = Array.from(new Set((states.data || []).map((row: any) => row.item_id).filter(Boolean)));
    let refs: any = { data: [], error: null };
    if (itemIds.length) {
      refs = await admin.from('learning_items').select('item_id,content_source,content_key').in('item_id', itemIds);
    }
    if (refs.error) return reply(origin, { error: 'review_queue_unavailable' }, 503);
    const byId = new Map((refs.data || []).map((row: any) => [row.item_id, row]));
    const items = (states.data || []).map((row: any) => {
      const ref: any = byId.get(row.item_id);
      return ref ? {
        content_ref: { source: ref.content_source, key: ref.content_key },
        state: row.state, due_on: row.due_on,
      } : null;
    }).filter(Boolean);
    return reply(origin, { ok: true, game: game.verifier, level, today, items });
  }

  if (action !== 'review_commit') return reply(origin, { error: 'invalid_review_action' }, 400);
  const operationId = String(body.operation_id || '').toLowerCase();
  const roundId = String(body.round_id || '').toLowerCase();
  if (!UUID_V4.test(operationId) || !UUID_V4.test(roundId)) return reply(origin, { error: 'invalid_operation_id' }, 400);
  const item = body.item;
  let verified;
  try { verified = await reviewCanonical(admin, game.verifier, level, item); }
  catch (error) {
    const code = error?.code || 'invalid_learning_evidence';
    return reply(origin, { error: code }, code === 'content_validation_unavailable' ? 503 : 400);
  }
  const ref = verified.contentRef;
  const learning = await admin.from('learning_items').select('item_id')
    .is('owner_user_id', null).eq('content_source', ref.source).eq('content_key', ref.key).limit(2);
  if (learning.error) return reply(origin, { error: 'review_state_unavailable' }, 503);
  if (!learning.data || learning.data.length !== 1) return reply(origin, { error: 'content_ref_not_unique' }, 400);
  const current = await admin.from('phase1_learning_review_states').select('state,state_token')
    .eq('user_id', user.id).eq('game', game.database).eq('level', level)
    .eq('item_id', learning.data[0].item_id).maybeSingle();
  if (current.error) return reply(origin, { error: 'review_state_unavailable' }, 503);
  const expectedState = current.data?.state || 'normal';
  const expectedToken = current.data?.state_token || null;
  const requestHash = await sha256({ user_id: user.id, game: game.database, level, round_id: roundId, item, verified });
  const committed = await admin.rpc('phase1_learning_review_commit', {
    p_operation_id: operationId, p_user_id: user.id, p_request_hash: requestHash,
    p_game: game.database, p_level: level, p_content_source: ref.source, p_content_key: ref.key,
    p_server_learning_score: verified.score, p_score_verified_by: verified.verifiedBy,
    p_round_id: roundId, p_expected_state: expectedState, p_expected_state_token: expectedToken,
    p_occurred_on: today, p_tier: 'free',
  });
  if (committed.error) return reply(origin, { error: 'review_write_unavailable' }, 503);
  const result = committed.data;
  if (!result || typeof result !== 'object') return reply(origin, { error: 'review_write_unavailable' }, 503);
  if (result.ok !== true) {
    const status = result.reason === 'replay_conflict' ? 409 : 400;
    return reply(origin, { error: result.reason || 'review_write_unavailable' }, status);
  }
  return reply(origin, { ok: true, idempotent: result.idempotent === true, from_state: result.from_state,
    to_state: result.to_state, due_on: result.due_on, review_attempts_used: result.review_attempts_used });
}

serve(async (req) => {
  const origin = req.headers.get('Origin') || '';
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(origin) });
  if (req.method !== 'POST') return reply(origin, { error: 'method_not_allowed' }, 405);
  if (origin && !ALLOWED_ORIGINS.includes(origin)) return reply(origin, { error: 'origin_not_allowed' }, 403);

  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const authHeader = req.headers.get('Authorization') || '';
    if (!/^Bearer\s+\S+$/i.test(authHeader)) return reply(origin, { error: 'unauthorized' }, 401);

    const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    const user = userData?.user;
    if (userError || !user) return reply(origin, { error: 'unauthorized' }, 401);

    const rawText = await req.text();
    if (!rawText || rawText.length > 64_000) return reply(origin, { error: 'invalid_payload_size' }, 400);
    let body;
    try { body = JSON.parse(rawText); } catch { return reply(origin, { error: 'malformed_json' }, 400); }

    const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
    const isReviewAction = String(body.action || '').startsWith('review_');
    if (isReviewAction && !reviewCallerAllowed(user, url)) return reply(origin, { error: 'feature_disabled' }, 404);
    const rateArgs = isReviewAction
      ? { p_key: `learning-review:${user.id}`, p_limit: 120, p_window: 600 }
      : { p_key: `score-submit:${user.id}`, p_limit: 30, p_window: 600 };
    const { data: rateOk, error: rateError } = await admin.rpc('game_content_rl_check', rateArgs);
    if (rateError) return reply(origin, { error: 'rate_limit_unavailable' }, 503);
    if (rateOk !== true) return reply(origin, { error: 'rate_limited' }, 429);

    if (isReviewAction) {
      try { return await handleReviewAction(origin, body, user, admin); }
      catch (error) { return reply(origin, { error: error?.code || 'invalid_review_request' }, 400); }
    }

    let accepted;
    try { accepted = validateScoreSubmission(body); }
    catch (error) { return reply(origin, { error: error?.code || 'invalid_score_evidence' }, 400); }

    // Verify every evidence key against protected canonical game content. The client cannot add
    // invented questions or change the game/difficulty to enlarge a round.
    const keys = Array.from(new Set(accepted.evidence.items.map((item) => item.key)));
    const isSentence = accepted.difficulty === '高' || accepted.game === 'word_order';
    let canonical;
    if (accepted.game === 'tone' && accepted.difficulty === '高') {
      const sentenceRows = await admin.from('game_sentences').select('words');
      canonical = sentenceRows.error ? sentenceRows : {
        data: (sentenceRows.data || []).flatMap((row) => Array.isArray(row.words)
          ? row.words.map((word) => ({ word: word.th })) : []),
        error: null,
      };
    } else if (isSentence) {
      canonical = await admin.from('game_sentences').select('th,wc').in('th', keys);
    } else {
      let query = admin.from('game_words').select('content_key,word,level,syls,read_syls,reading_th').in('content_key', keys);
      if (accepted.difficulty !== 'mixed') query = query.eq('level', accepted.difficulty);
      canonical = await query;
    }
    if (canonical.error) return reply(origin, { error: 'content_validation_unavailable' }, 503);
    const canonicalKeys = new Set((canonical.data || []).map((row) => row.content_key || row.th || row.word));
    if (keys.some((key) => !canonicalKeys.has(key))) return reply(origin, { error: 'invalid_content_evidence' }, 400);
    try { validateCanonicalScoreEvidence(accepted, canonical.data || []); }
    catch (error) { return reply(origin, { error: error?.code || 'invalid_content_evidence' }, 400); }

    // Hidden pre-SRS source seam. It is deliberately compile-time OFF and performs no Review/SRS
    // mutation. Activation requires a separately authorized release and the atomic owner RPC.
    if (HIDDEN_REVIEW_SCORE_DEFAULT_ENABLED) {
      try {
        let learningCanonical = canonical.data || [];
        if (accepted.game === 'tone' && accepted.difficulty === '高') {
          const sentenceRows = await admin.from('game_sentences').select('th,wc,reading_th,words');
          if (sentenceRows.error) return reply(origin, { error: 'content_validation_unavailable' }, 503);
          learningCanonical = sentenceRows.data || [];
        }
        verifyRoundLearningScores({
          game: accepted.game,
          difficulty: accepted.difficulty,
          items: body.evidence.items,
          canonicalRows: learningCanonical,
          requireExplicitContentRef: true,
        });
      } catch (error) {
        return reply(origin, { error: error?.code || 'invalid_learning_evidence' }, 400);
      }
    }

    const evidenceHash = await sha256({
      game: accepted.game,
      difficulty: accepted.difficulty,
      score: accepted.score,
      total: accepted.total,
      evidence: accepted.evidence,
    });

    // One SECURITY DEFINER RPC owns the authoritative row, private legacy mirror and marker.
    // Any failure rolls the whole PostgreSQL transaction back. Raw body.wrong_items is ignored;
    // mirror input is derived only from validated/hash-covered canonical evidence.
    const committed = await admin.rpc('phase1_score_submit_commit', {
      p_submission_id: accepted.submissionId,
      p_user_id: user.id,
      p_game: accepted.game,
      p_difficulty: accepted.difficulty,
      p_score: accepted.score,
      p_total: accepted.total,
      p_evidence_hash: evidenceHash,
      p_mirror_items: canonicalMirrorItems(accepted),
    });
    if (committed.error) return reply(origin, { error: 'score_write_unavailable' }, 503);
    const result = committed.data;
    if (!result || typeof result !== 'object') return reply(origin, { error: 'score_write_unavailable' }, 503);
    if (result.ok !== true) {
      if (result.reason === 'replay_conflict') return reply(origin, { error: 'replay_conflict' }, 409);
      if (result.reason === 'legacy_mirror_ambiguous') return reply(origin, { error: 'legacy_mirror_ambiguous' }, 409);
      return reply(origin, { error: 'score_write_unavailable' }, 503);
    }

    return reply(origin, {
      ok: true,
      idempotent: result.idempotent === true,
      score: result.score,
      total: result.total,
    });
  } catch (error) {
    return reply(origin, { error: 'score_submit_unavailable' }, 503);
  }
});
