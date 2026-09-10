// Supabase Edge Function: tone-round
// Language authority: public.game_words.canonical_record only.
// This file contains no Thai spelling, tone, consonant, vowel or exception rules.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/* ===== srsEngine ===== */
var TF_SRS_CFG = { INTERVALS: [1, 7], CLEAN_ROUNDS_TO_MASTER: 3 };
var TF_SRS = {
  cfg: TF_SRS_CFG,
  twDate: function (ms) {
    var d = ms == null ? new Date() : new Date(ms);
    try { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(d); }
    catch (_) { return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  },
  twDatePlusDays: function (ms, days) { return this.twDate((ms == null ? Date.now() : ms) + (days || 0) * 86400000); },
  blank: function () { return { stage: 0, dueDate: '', dueAt: 0, everFailed: false, mastered: false, firstPassSoftAwarded: false }; },
  isDue: function (rec, nowMs) {
    if (!rec || rec.mastered) return false;
    if (rec.dueDate) return this.twDate(nowMs || Date.now()) >= rec.dueDate;
    return !rec.dueAt || (nowMs || Date.now()) >= rec.dueAt;
  },
  advanceOnClean: function (rec, nowMs) {
    var out = JSON.parse(JSON.stringify(rec || this.blank()));
    out.stage = (out.stage || 0) + 1;
    if (out.stage >= this.cfg.CLEAN_ROUNDS_TO_MASTER) {
      out.mastered = true; out.dueDate = ''; out.dueAt = 0;
      return { rec: out, justMastered: true, clean: !out.everFailed };
    }
    out.dueDate = this.twDatePlusDays(nowMs, this.cfg.INTERVALS[out.stage - 1] || 1);
    out.dueAt = 0;
    return { rec: out, justMastered: false, clean: !out.everFailed };
  },
  resetOnFail: function (rec) {
    var out = JSON.parse(JSON.stringify(rec || this.blank()));
    out.stage = 0; out.dueDate = ''; out.dueAt = 0; out.mastered = false; out.everFailed = true;
    return out;
  }
};

/* ===== scoreEngine ===== */
function normalizeLevel(level) {
  var n = Number(level);
  return n === 1 || n === 2 || n === 3 ? n : null;
}
function normalizeGuess(value) {
  return Number.isInteger(value) && value >= 0 && value <= 5 ? value : -1;
}
function reject(reason, account, extra) {
  return Object.assign({ ok: false, reason: reason, correct: false, justMastered: false,
    starsAwarded: 0, capped: false, newSrsRecord: null, newAccount: account }, extra || {});
}
function ok(reason, correct, justMastered, rec, account) {
  return { ok: true, reason: reason, correct: correct, justMastered: justMastered,
    starsAwarded: 0, capped: false, newSrsRecord: rec, newAccount: account };
}

// The only accepted correct answers are toneNumber values already stored in the
// reviewed canonical catalog. Missing authority is an error, never a calculation.
function resolveRound(input) {
  var account = input.account || { stars: 0, hardWordsByLevel: {} };
  var level = normalizeLevel(input.level);
  var word = String(input.word == null ? '' : input.word);
  var opts = input.opts || {};
  var nowMs = typeof input.nowMs === 'number' ? input.nowMs : Date.now();
  if (!level) return reject('bad_level', account);
  if (!word) return reject('bad_word', account);

  var hadSrsRecord = !!input.srsRecord;
  var rec = hadSrsRecord ? JSON.parse(JSON.stringify(input.srsRecord)) : TF_SRS.blank();
  if (rec.mastered) return reject('already_mastered', account, { newSrsRecord: rec });
  if (!TF_SRS.isDue(rec, nowMs)) return reject('not_due', account, { newSrsRecord: rec });

  var correctClean = false;
  if (opts.spellingGame) {
    correctClean = opts.spellingClean === true;
  } else {
    var approved = input.approvedToneNumbers;
    if (!Array.isArray(approved) || !approved.length || approved.some(function (tone) {
      return !Number.isInteger(tone) || tone < 1 || tone > 5;
    })) return reject('catalog_authority_incomplete', account, { newSrsRecord: rec });
    if (approved.length === 1) {
      correctClean = normalizeGuess(input.initialGuess) === approved[0];
    } else {
      var guesses = Array.isArray(input.guesses) ? input.guesses : [];
      if (guesses.length !== approved.length) return reject('bad_guesses_len', account, { newSrsRecord: rec });
      correctClean = approved.every(function (tone, index) { return normalizeGuess(guesses[index]) === tone; });
    }
  }

  if (opts.knownCheck) {
    if (correctClean) { rec.mastered = true; return ok('known_master', true, false, rec, account); }
    return ok('known_reset', false, false, TF_SRS.resetOnFail(rec), account);
  }
  if (correctClean) {
    var advanced = TF_SRS.advanceOnClean(rec, nowMs);
    return ok(advanced.justMastered ? 'mastered' : 'advanced', true, advanced.justMastered, advanced.rec, account);
  }
  if (!hadSrsRecord) return reject('below_entry_score', account, { newSrsRecord: null });
  return ok('reset', false, false, TF_SRS.resetOnFail(rec), account);
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
const ALLOWED_ORIGINS = ["https://mrtaihualin.com", "https://gentle-moxie-bf64ad.netlify.app"];

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
  if (!["tone", "reading", "listening", "typing", "wordorder"].includes(game)) return json({ error: "bad game" }, 400);
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
  const vocabularyRound = game !== "wordorder" && level !== 3;
  if (vocabularyRound) {
    const authority = await admin.from("game_words").select("content_key,word,level,canonical_record")
      .eq("status", "active").eq("level", levelCode).in("access_tier", ["guest", "login"])
      .eq("content_key", contentKey).limit(2);
    if (authority.error) return json({ error: "catalog_authority_unavailable" }, 503);
    if (!authority.data || authority.data.length !== 1) return json({ error: "catalog_authority_ambiguous" }, 503);
    const row = authority.data[0];
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

  const srsRead = await admin.from("tone_srs_state").select("stage, due_date, ever_failed, mastered")
    .eq("user_id", user.id).eq("game", game).eq("level", level).eq("word", stateWord).maybeSingle();
  if (srsRead.error) return json({ error: "srs_read_unavailable" }, 503);
  const srsRow = srsRead.data;
  const account = { stars: 0, hardWordsByLevel: {} };
  const srsRecord = srsRow ? { stage: srsRow.stage, dueDate: srsRow.due_date, dueAt: 0,
    everFailed: srsRow.ever_failed, mastered: srsRow.mastered } : null;
  const R = resolveRound({ account, srsRecord, word, level, initialGuess: body.initialGuess,
    guesses: body.guesses, approvedToneNumbers, nowMs: Date.now(),
    opts: { knownCheck: !!body.knownCheck, spellingGame, spellingClean: !!body.clean } });
  if (!R.ok) {
    const concurrentReplay = await committedReplayResponse();
    if (concurrentReplay) return concurrentReplay;
    return json({ ok: false, reason: R.reason, stars: 0, totalStars: 0 });
  }

  const rec = R.newSrsRecord;
  const committed = await admin.rpc("phase1_tone_round_commit", {
    p_operation_id: operationId, p_user_id: user.id, p_request_hash: requestHash,
    p_game: game, p_level: level, p_word: stateWord, p_expected_exists: !!srsRow,
    p_expected_stage: srsRow?.stage ?? null, p_expected_due_date: srsRow?.due_date ?? null,
    p_expected_ever_failed: srsRow?.ever_failed ?? null, p_expected_mastered: srsRow?.mastered ?? null,
    p_next_stage: rec.stage, p_next_due_date: rec.dueDate, p_next_ever_failed: rec.everFailed,
    p_next_mastered: rec.mastered, p_reason: R.reason, p_correct: R.correct,
    p_just_mastered: R.justMastered, p_reward_clean: false
  });
  if (committed.error) return json({ error: "round_commit_unavailable" }, 503);
  const result = committed.data;
  if (!result || typeof result !== "object") return json({ error: "round_commit_unavailable" }, 503);
  if (result.ok !== true && result.reason === "replay_conflict") return json({ error: "replay_conflict" }, 409);
  return json(Object.assign({}, result, { roundId: operationId,
    compatibility: legacyCompatibility ? "legacy-no-id" : "explicit-id" }));
});
