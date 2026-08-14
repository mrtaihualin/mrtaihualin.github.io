// Supabase Edge Function: game-audio
// Returns one short-lived signed URL only after the requested text passes the same entitlement caps as game-content.
// No list/manifest endpoint is provided.
// deno-lint-ignore-file
// @ts-nocheck
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CAPS = {
  anon: { '初': 50, '中': 50, sentences: 20 },
  login: { '初': 100, '中': 100, sentences: 40 },
};
const ALLOWED_ORIGINS = [
  'https://mrtaihualin.com', 'https://www.mrtaihualin.com',
  'https://mrtaihualin.github.io', 'https://gentle-moxie-bf64ad.netlify.app',
];
const SIGNED_SECONDS = 90;

function cors(origin: string) {
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed, 'Vary': 'Origin',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Cache-Control': 'no-store',
  };
}
function response(body: unknown, status: number, origin: string) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...cors(origin), 'Content-Type': 'application/json' },
  });
}

serve(async (req) => {
  const origin = req.headers.get('Origin') || '';
  if (origin && !ALLOWED_ORIGINS.includes(origin)) return response({ error: 'origin_not_allowed' }, 403, origin);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(origin) });
  if (req.method !== 'POST') return response({ error: 'method_not_allowed' }, 405, origin);

  try {
    const url = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const bucket = Deno.env.get('GAME_AUDIO_BUCKET') || 'game-audio-private';
    if (!url || !anonKey || !serviceKey) return response({ error: 'server_config_error' }, 503, origin);

    const authHeader = req.headers.get('Authorization') || '';
    const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: userData } = await userClient.auth.getUser();
    const user = userData?.user || null;
    const tier = user ? 'login' : 'anon';
    const caps = CAPS[tier];
    const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

    let body: any;
    try { body = await req.json(); } catch { return response({ error: 'bad_json' }, 400, origin); }
    const text = String(body?.text || '').trim();
    if (!text || text.length > 300) return response({ error: 'bad_text' }, 400, origin);

    const xff = req.headers.get('x-forwarded-for') || '';
    const ip = (xff.split(',')[0] || '').trim() || 'unknown';
    const key = user ? `audio:user:${user.id}` : `audio:ip:${ip}`;
    const [rl, words, sentence] = await Promise.all([
      admin.rpc('game_content_rl_check', { p_key: key, p_limit: 90, p_window: 60 }),
      admin.from('game_words').select('level,rank').eq('word', text),
      admin.from('game_sentences').select('rank').eq('th', text).maybeSingle(),
    ]);
    if (rl.error) return response({ error: 'rate_limit_unavailable' }, 503, origin);
    if (rl.data !== true) return response({ error: 'rate_limited' }, 429, origin);
    if (words.error || sentence.error) return response({ error: 'entitlement_unavailable' }, 503, origin);

    const wordAllowed = (words.data || []).some((row: any) =>
      (row.level === '初' || row.level === '中') && Number(row.rank) <= caps[row.level]
    );
    const sentenceAllowed = !!(sentence.data && Number(sentence.data.rank) <= caps.sentences);
    if (!wordAllowed && !sentenceAllowed) return response({ error: 'not_entitled' }, 404, origin);

    const { data: asset, error: assetError } = await admin.from('audio_assets')
      .select('storage_path,status').eq('text_th', text)
      .in('status', ['generated', 'approved']).not('storage_path', 'is', null)
      .limit(1).maybeSingle();
    if (assetError) return response({ error: 'audio_lookup_unavailable' }, 503, origin);
    if (!asset?.storage_path) return response({ error: 'audio_not_available' }, 404, origin);

    const { data: signed, error: signedError } = await admin.storage.from(bucket)
      .createSignedUrl(asset.storage_path, SIGNED_SECONDS);
    if (signedError || !signed?.signedUrl) return response({ error: 'audio_sign_failed' }, 503, origin);
    return response({ signedUrl: signed.signedUrl, expiresAt: Date.now() + SIGNED_SECONDS * 1000 }, 200, origin);
  } catch (_error) {
    return response({ error: 'audio_unavailable' }, 503, origin);
  }
});
