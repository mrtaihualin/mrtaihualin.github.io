// Authenticated Phase 1 item-level Played evidence. Raw answers are never persisted.
// deno-lint-ignore-file
// @ts-nocheck

import { createClient } from 'npm:@supabase/supabase-js@2.112.3';
import {
  normalizeGamificationStatusBody,
  normalizeRecordBody,
  normalizeStatusBody,
  wordBase,
} from './practice-events-engine.mjs';

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
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(stableJson(value)));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function authenticatedClients(req: Request) {
  const url = Deno.env.get('SUPABASE_URL') || '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const authHeader = req.headers.get('Authorization') || '';
  if (!url || !anonKey || !serviceKey || !/^Bearer\s+\S+$/i.test(authHeader)) return null;
  const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data, error } = await userClient.auth.getUser();
  if (error || !data?.user?.id) return null;
  return {
    user: data.user,
    admin: createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } }),
  };
}

async function learningItemRows(admin: any, sources: string[], keys?: string[]) {
  let query = admin.from('learning_items').select('item_id,content_source,content_key').in('content_source', sources);
  if (keys?.length) query = query.in('content_key', keys);
  const result = await query;
  if (result.error) throw new Error('learning_items_unavailable');
  return result.data || [];
}

async function record(admin: any, userId: string, normalized: any) {
  const refs = normalized.items.map((item: any) => item.content_ref);
  const sources = Array.from(new Set(refs.map((ref: any) => ref.source)));
  const keys = Array.from(new Set(refs.map((ref: any) => ref.key)));
  const rows = await learningItemRows(admin, sources, keys);
  const byRef = new Map(rows.map((row: any) => [row.content_source + ':' + row.content_key, row.item_id]));
  const resolved = normalized.items.map((item: any) => ({
    item_id: byRef.get(item.content_ref.source + ':' + item.content_ref.key),
    ordinal: item.ordinal,
    is_correct: item.is_correct,
    wrong_count: item.wrong_count,
    hint_used: item.hint_used,
    listen_count: item.listen_count,
  }));
  if (resolved.some((item: any) => !item.item_id)) throw new Error('unknown_content_ref');
  const batchHash = await sha256({
    round_id: normalized.round_id,
    surface: normalized.surface,
    completed_at: normalized.completed_at,
    items: resolved,
  });
  const committed = await admin.rpc('phase1_practice_events_record_and_gamification', {
    p_user_id: userId,
    p_round_id: normalized.round_id,
    p_surface_code: normalized.surface,
    p_client_completed_at: normalized.completed_at,
    p_batch_hash: batchHash,
    p_items: resolved,
  });
  if (committed.error) throw new Error('practice_event_write_unavailable');
  if (!committed.data?.ok) {
    if (committed.data?.reason === 'replay_conflict') return { error: 'replay_conflict', status: 409 };
    throw new Error(committed.data?.reason || 'practice_event_write_unavailable');
  }
  return {
    ok: true,
    idempotent: committed.data.idempotent === true,
    recorded: Number(committed.data.recorded) || 0,
    gamification: committed.data.gamification,
  };
}

async function gamificationStatus(admin: any, userId: string) {
  const result = await admin.rpc('phase1_free_gamification_status', { p_user_id: userId });
  if (result.error || !result.data?.ok) throw new Error('gamification_status_unavailable');
  return { ok: true, gamification: result.data };
}

async function status(admin: any, userId: string, normalized: any) {
  const rows = await learningItemRows(admin, ['game_words', 'game_sentences']);
  const byRequest = new Map(normalized.items.map((item: any) => [item.id, []]));
  rows.forEach((row: any) => {
    const id = row.content_source === 'game_sentences'
      ? 'sentence:' + row.content_key
      : 'word:' + wordBase(row.content_key);
    if (byRequest.has(id)) byRequest.get(id).push(row.item_id);
  });
  const ids = Array.from(new Set(Array.from(byRequest.values()).flat()));
  const evidence = ids.length
    ? await admin.rpc('phase1_practice_event_status', { p_user_id: userId, p_item_ids: ids })
    : { data: [], error: null };
  if (evidence.error) throw new Error('practice_event_status_unavailable');
  const latest = new Map((evidence.data || []).map((row: any) => [row.item_id, row]));
  const result: Record<string, unknown> = {};
  normalized.items.forEach((item: any) => {
    const matches = (byRequest.get(item.id) || []).map((id: string) => latest.get(id)).filter(Boolean)
      .sort((a: any, b: any) => String(b.last_played_at).localeCompare(String(a.last_played_at)));
    result[item.id] = matches.length
      ? { played: true, last_played_at: matches[0].last_played_at, surface: matches[0].surface_code }
      : { played: false };
  });
  return { ok: true, items: result };
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('Origin') || '';
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(origin) });
  if (req.method !== 'POST') return reply(origin, { error: 'method_not_allowed' }, 405);
  if (origin && !ALLOWED_ORIGINS.includes(origin)) return reply(origin, { error: 'origin_not_allowed' }, 403);

  const clients = await authenticatedClients(req);
  if (!clients) return reply(origin, { error: 'unauthorized' }, 401);
  const raw = await req.text();
  if (!raw || raw.length > 64_000) return reply(origin, { error: 'invalid_payload_size' }, 400);
  let body;
  try { body = JSON.parse(raw); } catch { return reply(origin, { error: 'malformed_json' }, 400); }

  try {
    const rate = await clients.admin.rpc('game_content_rl_check', {
      p_key: `practice-events:${clients.user.id}`,
      p_limit: 60,
      p_window: 600,
    });
    if (rate.error) return reply(origin, { error: 'rate_limit_unavailable' }, 503);
    if (rate.data !== true) return reply(origin, { error: 'rate_limited' }, 429);
    if (body.action === 'record') {
      const result: any = await record(clients.admin, clients.user.id, normalizeRecordBody(body));
      return result.error ? reply(origin, { error: result.error }, result.status) : reply(origin, result);
    }
    if (body.action === 'status') return reply(origin, await status(clients.admin, clients.user.id, normalizeStatusBody(body)));
    if (body.action === 'gamification_status') {
      normalizeGamificationStatusBody(body);
      return reply(origin, await gamificationStatus(clients.admin, clients.user.id));
    }
    return reply(origin, { error: 'invalid_action' }, 400);
  } catch (error) {
    const code = String(error?.message || 'practice_events_unavailable');
    const clientError = /^invalid_|^duplicate_|^unknown_content_ref$/.test(code);
    return reply(origin, { error: code }, clientError ? 400 : 503);
  }
});
