// Public Email OTP broker. Deploy only after the SQL/RPC source, transactional
// template, Turnstile widget/secrets, and native-provider bypass proof are ready.
// This function must be deployed with JWT verification disabled because callers
// are signed out; Turnstile plus the service-only RPCs are the security boundary.
// deno-lint-ignore-file no-explicit-any

import { createClient } from 'npm:@supabase/supabase-js@2.112.3';
import { readEmailMailerSecret } from '../_shared/email-mailer-auth.mjs';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const EMAIL_OTP_HMAC_SECRET = Deno.env.get('EMAIL_OTP_HMAC_SECRET') || '';
const TURNSTILE_SECRET_KEY = Deno.env.get('TURNSTILE_SECRET_KEY') || '';
const EMAIL_MAILER_API_KEY = readEmailMailerSecret(Deno.env.get('SUPABASE_SECRET_KEYS'));

const OTP_TTL_MINUTES = 10;
const MIN_PUBLIC_RESPONSE_MS = 450;
const hmacSecretReady = new TextEncoder().encode(EMAIL_OTP_HMAC_SECRET).byteLength >= 32;
const DEFAULT_ORIGINS = [
  'https://mrtaihualin.com',
  'https://gentle-moxie-bf64ad.netlify.app',
];
const allowedOrigins = new Set(
  (Deno.env.get('EMAIL_OTP_ALLOWED_ORIGINS') || DEFAULT_ORIGINS.join(','))
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean),
);
const expectedHostnames = new Set(
  (Deno.env.get('TURNSTILE_EXPECTED_HOSTNAMES') || 'mrtaihualin.com')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean),
);

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function corsHeaders(origin: string) {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Cache-Control': 'no-store, max-age=0',
    'Pragma': 'no-cache',
    'Vary': 'Origin',
  };
  if (origin && allowedOrigins.has(origin)) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}

function response(origin: string, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function normalizeEmail(value: unknown) {
  const email = String(value || '').trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return '';
  return email;
}

function clientIp(req: Request) {
  const cfIp = (req.headers.get('cf-connecting-ip') || '').trim();
  const forwarded = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim();
  const realIp = (req.headers.get('x-real-ip') || '').trim();
  return (cfIp || forwarded || realIp || 'unknown').slice(0, 128);
}

function randomSixDigits() {
  const upperBound = 0x100000000;
  const acceptedBound = Math.floor(upperBound / 1000000) * 1000000;
  const values = new Uint32Array(1);
  do crypto.getRandomValues(values); while (values[0] >= acceptedBound);
  return String(values[0] % 1000000).padStart(6, '0');
}

function hex(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes), (value) => value.toString(16).padStart(2, '0')).join('');
}

let hmacKeyPromise: Promise<CryptoKey> | null = null;
function hmacKey() {
  if (!hmacKeyPromise) {
    hmacKeyPromise = crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(EMAIL_OTP_HMAC_SECRET),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
  }
  return hmacKeyPromise;
}

async function hmac(value: string) {
  const signature = await crypto.subtle.sign('HMAC', await hmacKey(), new TextEncoder().encode(value));
  return hex(signature);
}

async function waitForPublicFloor(startedAt: number) {
  const jitter = crypto.getRandomValues(new Uint8Array(1))[0] % 101;
  const remaining = MIN_PUBLIC_RESPONSE_MS + jitter - (Date.now() - startedAt);
  if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
}

async function verifyTurnstile(token: unknown, expectedAction: string, ip: string) {
  const value = String(token || '');
  if (!value || value.length > 4096 || !TURNSTILE_SECRET_KEY) return false;
  const form = new FormData();
  form.set('secret', TURNSTILE_SECRET_KEY);
  form.set('response', value);
  if (ip !== 'unknown') form.set('remoteip', ip);
  try {
    const result = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(8000),
    });
    const data = await result.json();
    return result.ok && data?.success === true &&
      data?.action === expectedAction &&
      expectedHostnames.has(String(data?.hostname || '').toLowerCase());
  } catch (_) {
    return false;
  }
}

async function logSecurityEvent(
  eventType: string,
  challengeId: string,
  emailHmac: string,
  ipHmac: string,
  outcome: string,
) {
  try {
    await admin.rpc('log_email_otp_security_internal', {
      p_event_type: eventType,
      p_challenge_id: challengeId || null,
      p_email_hmac: emailHmac || null,
      p_ip_hmac: ipHmac || null,
      p_outcome: outcome,
    });
  } catch (_) {}
}

async function invalidateChallenge(challengeId: string, emailHmac: string, ipHmac: string, reason: string) {
  try {
    await admin.rpc('invalidate_email_otp_challenge_internal', {
      p_challenge_id: challengeId,
      p_email_hmac: emailHmac,
      p_ip_hmac: ipHmac,
      p_reason: reason,
    });
  } catch (_) {}
}

async function sendOtpEmail(email: string, code: string) {
  if (!EMAIL_MAILER_API_KEY) return false;
  const result = await fetch(`${SUPABASE_URL}/functions/v1/send-transactional-email`, {
    method: 'POST',
    headers: {
      'apikey': EMAIL_MAILER_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      template: 'email_login_otp',
      to: email,
      data: { otp_code: code, expires_minutes: OTP_TTL_MINUTES },
    }),
    signal: AbortSignal.timeout(12000),
  });
  return result.ok;
}

async function issueSession(email: string) {
  let link = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  if (link.error || !link.data?.properties?.hashed_token) {
    const created = await admin.auth.admin.createUser({ email, email_confirm: true });
    if (created.error && !/already|registered|exists/i.test(created.error.message || '')) {
      throw new Error('auth_user_issue_failed');
    }
    link = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  }
  const tokenHash = link.data?.properties?.hashed_token;
  if (link.error || !tokenHash) throw new Error('auth_link_issue_failed');

  const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const verified = await authClient.auth.verifyOtp({ token_hash: tokenHash, type: 'email' });
  const session = verified.data?.session;
  if (verified.error || !session?.access_token || !session?.refresh_token || !session?.user?.id) {
    throw new Error('auth_session_issue_failed');
  }
  if (normalizeEmail(session.user.email) !== email) throw new Error('auth_session_binding_failed');
  return {
    userId: session.user.id,
    session: {
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at: session.expires_at,
      expires_in: session.expires_in,
      token_type: session.token_type,
    },
  };
}

async function requestOtp(req: Request, origin: string, body: any, startedAt: number) {
  const publicChallengeId = crypto.randomUUID();
  const ip = clientIp(req);
  if (!await verifyTurnstile(body?.turnstile_token, 'email_otp_request', ip)) {
    await waitForPublicFloor(startedAt);
    return response(origin, { ok: false, error: 'request_rejected' }, 400);
  }

  const email = normalizeEmail(body?.email);
  if (!email || !hmacSecretReady || !SUPABASE_SERVICE_ROLE_KEY || !EMAIL_MAILER_API_KEY) {
    await waitForPublicFloor(startedAt);
    return response(origin, { ok: true, challenge_id: publicChallengeId }, 202);
  }

  try {
    const code = randomSixDigits();
    const [emailHmac, ipHmac, codeHmac] = await Promise.all([
      hmac(`email:v1:${email}`),
      hmac(`ip:v1:${ip}`),
      hmac(`code:v1:${publicChallengeId}:${email}:${code}`),
    ]);
    const begun = await admin.rpc('begin_email_otp_challenge_internal', {
      p_challenge_id: publicChallengeId,
      p_email_hmac: emailHmac,
      p_code_hmac: codeHmac,
      p_ip_hmac: ipHmac,
    });
    if (!begun.error && begun.data?.accepted === true) {
      let delivered = false;
      try { delivered = await sendOtpEmail(email, code); } catch (_) { delivered = false; }
      if (!delivered) await invalidateChallenge(publicChallengeId, emailHmac, ipHmac, 'delivery_failed');
    }
  } catch (_) {
    console.error('[email-otp-auth] request internal failure');
  }

  await waitForPublicFloor(startedAt);
  return response(origin, { ok: true, challenge_id: publicChallengeId }, 202);
}

async function verifyOtp(req: Request, origin: string, body: any, startedAt: number) {
  const ip = clientIp(req);
  if (!await verifyTurnstile(body?.turnstile_token, 'email_otp_verify', ip)) {
    await waitForPublicFloor(startedAt);
    return response(origin, { ok: false, error: 'verification_failed' }, 400);
  }

  const challengeId = String(body?.challenge_id || '');
  const email = normalizeEmail(body?.email);
  const code = String(body?.code || '').trim();
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(challengeId) || !email || !/^\d{6}$/.test(code) ||
      !hmacSecretReady || !SUPABASE_SERVICE_ROLE_KEY) {
    await waitForPublicFloor(startedAt);
    return response(origin, { ok: false, error: 'verification_failed' }, 400);
  }

  let emailHmac = '';
  let ipHmac = '';
  try {
    [emailHmac, ipHmac] = await Promise.all([
      hmac(`email:v1:${email}`),
      hmac(`ip:v1:${ip}`),
    ]);
    const codeHmac = await hmac(`code:v1:${challengeId}:${email}:${code}`);
    const checked = await admin.rpc('verify_email_otp_challenge_internal', {
      p_challenge_id: challengeId,
      p_email_hmac: emailHmac,
      p_code_hmac: codeHmac,
      p_ip_hmac: ipHmac,
    });
    if (checked.error || checked.data?.status !== 'verified') {
      await waitForPublicFloor(startedAt);
      return response(origin, { ok: false, error: 'verification_failed' }, 400);
    }

    try {
      const issued = await issueSession(email);
      await logSecurityEvent('session_issued', challengeId, emailHmac, ipHmac, 'success');
      await waitForPublicFloor(startedAt);
      return response(origin, { ok: true, user_id: issued.userId, session: issued.session });
    } catch (_) {
      await logSecurityEvent('session_issue_failed', challengeId, emailHmac, ipHmac, 'failed_closed');
      await waitForPublicFloor(startedAt);
      return response(origin, { ok: false, error: 'verification_failed' }, 400);
    }
  } catch (_) {
    console.error('[email-otp-auth] verification internal failure');
    if (emailHmac && ipHmac) await logSecurityEvent('verify_internal_error', challengeId, emailHmac, ipHmac, 'failed_closed');
    await waitForPublicFloor(startedAt);
    return response(origin, { ok: false, error: 'verification_failed' }, 400);
  }
}

Deno.serve(async (req: Request) => {
  const startedAt = Date.now();
  const origin = req.headers.get('origin') || '';
  if (origin && !allowedOrigins.has(origin)) return response('', { ok: false, error: 'origin_rejected' }, 403);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(origin) });
  if (req.method !== 'POST') return response(origin, { ok: false, error: 'method_not_allowed' }, 405);

  let body: any;
  try { body = await req.json(); } catch (_) {
    await waitForPublicFloor(startedAt);
    return response(origin, { ok: false, error: 'invalid_request' }, 400);
  }
  if (body?.action === 'request') return requestOtp(req, origin, body, startedAt);
  if (body?.action === 'verify') return verifyOtp(req, origin, body, startedAt);
  await waitForPublicFloor(startedAt);
  return response(origin, { ok: false, error: 'invalid_request' }, 400);
});
