// Supabase Edge Function: problem-search-daily-limit
// Login Free only: one successful Problem Search analysis per Asia/Taipei day.
// Never receives or stores the raw search query.
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ALLOWED_ORIGINS = [
  'https://mrtaihualin.com',
  'https://www.mrtaihualin.com',
  'https://mrtaihualin.github.io',
  'https://gentle-moxie-bf64ad.netlify.app',
];

function todayTaipei() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

serve(async (req) => {
  const origin = req.headers.get('Origin') || '';
  const allowOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];

  const corsHeaders = {
    'Access-Control-Allow-Origin': allowOrigin,
    'Vary': 'Origin',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  const json = (body: Record<string, unknown>, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });

  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405);
  if (origin && !ALLOWED_ORIGINS.includes(origin)) return json({ ok: false, error: 'origin_not_allowed' }, 403);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceRoleKey) return json({ ok: false, error: 'server_config_missing' }, 500);

    const service = createClient(supabaseUrl, serviceRoleKey);
    const authHeader = req.headers.get('Authorization') || '';
    const accessToken = authHeader.replace(/^Bearer\s+/i, '');
    if (!accessToken) return json({ ok: false, error: 'auth_required' }, 401);

    const { data: authData, error: authError } = await service.auth.getUser(accessToken);
    const user = authData?.user || null;
    if (authError || !user?.id) return json({ ok: false, error: 'auth_required' }, 401);

    const raw = await req.text();
    if (raw.length > 1000) return json({ ok: false, error: 'invalid_payload_size' }, 400);

    let parsed: unknown = {};
    try { parsed = raw.trim() ? JSON.parse(raw) : {}; }
    catch { return json({ ok: false, error: 'malformed_json' }, 400); }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return json({ ok: false, error: 'invalid_payload' }, 400);
    }
    const body = parsed as Record<string, unknown>;
    const keys = Object.keys(body);
    if (keys.length !== 1 || keys[0] !== 'request_id') {
      return json({ ok: false, error: 'invalid_payload' }, 400);
    }

    const requestId = String(body.request_id || '');
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) {
      return json({ ok: false, error: 'invalid_request_id' }, 400);
    }

    const day = todayTaipei();
    const { data, error } = await service.rpc('problem_search_consume_daily', {
      p_user_id: user.id,
      p_day: day,
      p_request_id: requestId,
    });

    if (error) return json({ ok: false, error: 'db_error' }, 500);
    if (!data || data.ok !== true) return json({ ok: false, error: 'db_result_invalid' }, 500);

    if (data.allowed !== true) {
      return json({
        ok: true,
        allowed: false,
        reason: 'limit',
        used: 1,
        cap: 1,
        remaining: 0,
      }, 429);
    }

    return json({
      ok: true,
      allowed: true,
      used: 1,
      cap: 1,
      remaining: 0,
      idempotent: data.idempotent === true,
      day,
    });
  } catch {
    return json({ ok: false, error: 'internal_error' }, 500);
  }
});
