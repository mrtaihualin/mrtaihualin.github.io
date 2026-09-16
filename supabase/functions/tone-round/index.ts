// Supabase Edge Function: tone-round
// Language authority: public.game_words.canonical_record only.
// This file contains no Thai spelling, tone, consonant, vowel or exception rules.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.112.3";

function normalizeGuess(value) {
  return Number.isInteger(value) && value >= 0 && value <= 5 ? value : -1;
}
function taipeiDay(ms = Date.now()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(new Date(ms));
}

function paidOutcome(input: any) {
  const opts = input.opts || {};
  if (opts.knownCheck) return { ok: false, reason: 'known_check_disabled' };
  if (opts.spellingGame) return { ok: true, outcome: opts.spellingClean === true ? 'clean' : 'fail' };
  const approved = input.approvedToneNumbers;
  if (!Array.isArray(approved) || !approved.length || approved.some(function (tone) {
    return !Number.isInteger(tone) || tone < 1 || tone > 5;
  })) return { ok: false, reason: 'catalog_authority_incomplete' };
  let clean = false;
  if (approved.length === 1) clean = normalizeGuess(input.initialGuess) === approved[0];
  else {
    const guesses = Array.isArray(input.guesses) ? input.guesses : [];
    if (guesses.length !== approved.length) return { ok: false, reason: 'bad_guesses_len' };
    clean = approved.every(function (tone, index) { return normalizeGuess(guesses[index]) === tone; });
  }
  return { ok: true, outcome: clean ? 'clean' : 'fail' };
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(stableJson).join(',') + ']';
  if (value && typeof value === 'object') {
    return '{' + Object.keys(value).sort().map((key) => JSON.stringify(key) + ':' + stableJson(value[key])).join(',') + '}';
  }
  return JSON.stringify(value);
}
async function sha256(value: unknown) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(stableJson(value)));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SB_SVC = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ALLOWED_ORIGINS = [
  "https://mrtaihualin.com",
  "https://gentle-moxie-bf64ad.netlify.app",
  "https://mrtaihualin-preview-learning-e4ea92c.mrtaihualin.workers.dev",
];

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("Origin") || "";
  const allowOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  const CORS = { "Access-Control-Allow-Origin": allowOrigin, "Vary": "Origin",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS" };
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
    status, headers: { ...CORS, "Content-Type": "application/json" }
  });
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const authHeader = req.headers.get("Authorization") || "";
  const userClient = createClient(SB_URL, SB_ANON, { global: { headers: { Authorization: authHeader } } });
  const { data: userData } = await userClient.auth.getUser();
  const user = userData?.user;
  if (!user) return json({ error: "unauthorized" }, 401);
  const admin = createClient(SB_URL, SB_SVC, { auth: { persistSession: false } });

  let body: any;
  try { body = await req.json(); } catch (_) { return json({ error: "bad json" }, 400); }
  if (body?.action === 'paid_state') {
    const entitlement = await admin.from('phase1_product_entitlements').select('entitlement')
      .eq('user_id', user.id).eq('entitlement', 'owner_all_access').limit(2);
    if (entitlement.error) return json({ error: 'entitlement_unavailable' }, 503);
    if (!entitlement.data || entitlement.data.length !== 1) return json({ error: 'feature_disabled' }, 404);
    const state = await admin.from('phase2_paid_srs_states')
      .select('game,level,content_key,phase,next_checkpoint,due_on,mastered,active_challenge,ever_failed,reschedule_pending')
      .eq('user_id', user.id).eq('game', 'tone');
    if (state.error) return json({ error: 'paid_srs_state_unavailable' }, 503);
    return json({ ok: true, tier: 'paid', items: state.data || [] });
  }
  const suppliedOperationId = String(body.round_id || "").toLowerCase();
  const legacyCompatibility = !suppliedOperationId;
  if (suppliedOperationId && !UUID_V4.test(suppliedOperationId)) return json({ error: "invalid_round_id" }, 400);
  const operationId = suppliedOperationId || crypto.randomUUID();
  const word = String(body.word || "");
  const level = Number(body.level);
  const contentKey = String(body.content_key || "");
  const game = String(body.game || "tone");
  if (!word || word.trim() !== word || !contentKey || contentKey.trim() !== contentKey || ![1, 2, 3].includes(level)) {
    return json({ error: "bad content identity/level" }, 400);
  }
  if (!["tone", "reading", "typing", "wordorder"].includes(game)) return json({ error: "bad game" }, 400);
  if (game === "tone" && level === 3) return json({ error: "catalog_authority_incomplete" }, 503);
  if ((game === "wordorder" || level === 3) && contentKey !== word) return json({ error: "bad content_key" }, 400);
  const levelCode = ({ 1: "初", 2: "中", 3: "高" } as Record<number, string>)[level];
  const stateWord = contentKey;
  const spellingGame = game !== "tone";

  const requestHash = await sha256({ game, word, contentKey, level, clean: body.clean === true,
    starClean: typeof body.starClean === "boolean" ? body.starClean : null,
    initialGuess: body.initialGuess ?? null, guesses: Array.isArray(body.guesses) ? body.guesses : null,
    knownCheck: body.knownCheck === true });

  async function committedReplayResponse() {
    const replay = await admin.from("tone_round_operations")
      .select("user_id,game,level,word,request_hash,response")
      .eq("operation_id", operationId).maybeSingle();
    if (replay.error) return json({ error: "round_replay_unavailable" }, 503);
    if (!replay.data) return null;
    const same = replay.data.user_id === user.id && replay.data.game === game && Number(replay.data.level) === level &&
      replay.data.word === stateWord && replay.data.request_hash === requestHash;
    if (!same) return json({ error: "replay_conflict" }, 409);
    return json(Object.assign({}, replay.data.response || {}, { idempotent: true, stars: 0, totalStars: 0 }));
  }
  const earlyReplay = await committedReplayResponse();
  if (earlyReplay) return earlyReplay;

  const { data: rlOk, error: rlErr } = await admin.rpc("game_content_rl_check", {
    p_key: `tone-round:${user.id}`, p_limit: 60, p_window: 60
  });
  if (rlErr) return json({ error: "rate_limit_unavailable" }, 503);
  if (rlOk !== true) return json({ error: "rate_limited" }, 429);

  let approvedToneNumbers: number[] | null = null;
  let paidPrivateBeta = false;
  const vocabularyRound = game !== "wordorder" && level !== 3;
  if (vocabularyRound) {
    const authority = await admin.from("game_words").select("content_key,word,level,status,access_tier,canonical_record")
      .eq("level", levelCode)
      .eq("content_key", contentKey).limit(2);
    if (authority.error) return json({ error: "catalog_authority_unavailable" }, 503);
    if (!authority.data || authority.data.length !== 1) return json({ error: "catalog_authority_ambiguous" }, 503);
    const row = authority.data[0];
    const freeContent = row.status === 'active' && ['guest', 'login'].includes(row.access_tier);
    const paidContent = row.status === 'queued' && row.access_tier === 'paid';
    if (!freeContent && !paidContent) return json({ error: 'catalog_authority_ambiguous' }, 503);
    if (paidContent) {
      if (game !== 'tone') return json({ error: 'feature_disabled' }, 404);
      const entitlement = await admin.from('phase1_product_entitlements').select('entitlement')
        .eq('user_id', user.id).eq('entitlement', 'owner_all_access').limit(2);
      if (entitlement.error) return json({ error: 'entitlement_unavailable' }, 503);
      if (!entitlement.data || entitlement.data.length !== 1) return json({ error: 'feature_disabled' }, 404);
      paidPrivateBeta = true;
    }
    const catalog = row.canonical_record;
    if (!catalog || catalog.contentKey !== row.content_key || catalog.word !== row.word || catalog.level !== row.level ||
        catalog.contentKey !== contentKey || catalog.word !== word || catalog.level !== levelCode ||
        !Array.isArray(catalog.syllables) || !catalog.syllables.length) {
      return json({ error: "catalog_authority_incomplete" }, 503);
    }
    if (!spellingGame) {
      approvedToneNumbers = catalog.syllables.map((syllable: any) => syllable?.toneNumber);
      if (approvedToneNumbers.some((tone) => !Number.isInteger(tone) || tone < 1 || tone > 5)) {
        return json({ error: "catalog_authority_incomplete" }, 503);
      }
    }
  }

  if (paidPrivateBeta) {
    const evaluated = paidOutcome({ initialGuess: body.initialGuess, guesses: body.guesses,
      approvedToneNumbers, opts: { knownCheck: !!body.knownCheck, spellingGame, spellingClean: !!body.clean } });
    if (!evaluated.ok) return json({ ok: false, reason: evaluated.reason, tier: 'paid', stars: 0, totalStars: 0 }, 400);
    const committed = await admin.rpc('phase2_paid_srs_commit', {
      p_operation_id: operationId, p_user_id: user.id, p_request_hash: requestHash,
      p_game: game, p_level: level, p_content_key: contentKey,
      p_outcome: evaluated.outcome, p_occurred_on: taipeiDay()
    });
    if (committed.error) return json({ error: 'paid_srs_write_unavailable' }, 503);
    const result = committed.data;
    if (!result || typeof result !== 'object') return json({ error: 'paid_srs_write_unavailable' }, 503);
    if (result.ok !== true && result.reason === 'replay_conflict') return json({ error: 'replay_conflict' }, 409);
    return json(Object.assign({}, result, { roundId: operationId, stars: 0, totalStars: 0,
      compatibility: legacyCompatibility ? 'legacy-no-id' : 'explicit-id' }));
  }

  // Login Free progress is owned by score-submit/phase1_login_free_learning_commit.
  // Keep tone-round available only for the separately gated Paid private beta so
  // a stale client can never write the retired Free transition path.
  return json({ error: 'learning_engine_required' }, 409);
});
