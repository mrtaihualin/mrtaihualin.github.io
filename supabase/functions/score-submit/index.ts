// Supabase Edge Function: authenticated, idempotent Core-5 score submission.
// Direct browser writes to leaderboard source tables are revoked by the S29 SQL migration.
// deno-lint-ignore-file
// @ts-nocheck

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { validateCanonicalScoreEvidence, validateScoreSubmission } from './score-engine.mjs';

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

    let accepted;
    try { accepted = validateScoreSubmission(body); }
    catch (error) { return reply(origin, { error: error?.code || 'invalid_score_evidence' }, 400); }

    const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
    const { data: rateOk, error: rateError } = await admin.rpc('game_content_rl_check', {
      p_key: `score-submit:${user.id}`,
      p_limit: 30,
      p_window: 600,
    });
    if (rateError) return reply(origin, { error: 'rate_limit_unavailable' }, 503);
    if (rateOk !== true) return reply(origin, { error: 'rate_limited' }, 429);

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
      let query = admin.from('game_words').select('word,level,syls,read_syls,reading_th').in('word', keys);
      if (accepted.difficulty !== 'mixed') query = query.eq('level', accepted.difficulty);
      canonical = await query;
    }
    if (canonical.error) return reply(origin, { error: 'content_validation_unavailable' }, 503);
    const canonicalKeys = new Set((canonical.data || []).map((row) => row.th || row.word));
    if (keys.some((key) => !canonicalKeys.has(key))) return reply(origin, { error: 'invalid_content_evidence' }, 400);
    try { validateCanonicalScoreEvidence(accepted, canonical.data || []); }
    catch (error) { return reply(origin, { error: error?.code || 'invalid_content_evidence' }, 400); }

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
