#!/usr/bin/env node

// Controlled NON-PRODUCTION proof only. It intentionally calls Auth endpoints,
// may send one staging-native OTP if staging is misconfigured, creates/uses one
// explicitly disposable staging user, and removes that user before exit.

import crypto from 'node:crypto';

const required = [
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'EMAIL_OTP_PROOF_EMAIL',
];
for (const name of required) {
  if (!process.env[name]) throw new Error(`Missing required environment variable: ${name}`);
}
if (process.env.ALLOW_NON_PRODUCTION_AUTH_PROOF !== 'YES' ||
    process.env.EMAIL_OTP_PROOF_DISPOSABLE !== 'YES') {
  throw new Error('Refusing mutation: require ALLOW_NON_PRODUCTION_AUTH_PROOF=YES and EMAIL_OTP_PROOF_DISPOSABLE=YES');
}

const baseUrl = new URL(process.env.SUPABASE_URL);
const blockedHosts = new Set([
  'qzkxlhpcputsvbqmtqfi.supabase.co',
  'mrtaihualin.com',
  'www.mrtaihualin.com',
]);
if (blockedHosts.has(baseUrl.hostname.toLowerCase()) || /mrtaihualin\.com$/i.test(baseUrl.hostname)) {
  throw new Error('Refusing to run against the Production Auth project/domain');
}
if (process.env.CONFIRM_STAGING_PROJECT_REF !== baseUrl.hostname.split('.')[0]) {
  throw new Error('CONFIRM_STAGING_PROJECT_REF must exactly match the non-Production project ref');
}

const email = String(process.env.EMAIL_OTP_PROOF_EMAIL).trim().toLowerCase();
if (!/^[^\s@]+\+[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  throw new Error('EMAIL_OTP_PROOF_EMAIL must be an explicit plus-addressed disposable staging email');
}

const anonKey = process.env.SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const timeoutMs = 12000;
let proofUserId = '';

async function call(path, { key, method = 'POST', body } = {}) {
  return fetch(new URL(path, baseUrl), {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
}

async function jsonOrEmpty(response) {
  return response.json().catch(() => ({}));
}

async function cleanup() {
  if (!proofUserId) return;
  const result = await call(`/auth/v1/admin/users/${encodeURIComponent(proofUserId)}`, {
    key: serviceKey,
    method: 'DELETE',
  });
  proofUserId = '';
  if (!result.ok) throw new Error('Disposable staging user cleanup failed');
}

try {
  const native = await call('/auth/v1/otp', {
    key: anonKey,
    body: { email, create_user: true },
  });
  const nativeBody = await jsonOrEmpty(native);
  const nativeFailureCode = String(nativeBody.code || nativeBody.error_code || '').toLowerCase();
  const nativeFailureMessage = String(nativeBody.msg || nativeBody.message || nativeBody.error_description || '').toLowerCase();
  const providerDisabled = !native.ok && (
    nativeFailureCode.includes('provider') ||
    nativeFailureCode.includes('signup_disabled') ||
    /email.+disabled|provider.+disabled|signups.+disabled/.test(nativeFailureMessage)
  );
  let link = await call('/auth/v1/admin/generate_link', {
    key: serviceKey,
    body: { type: 'magiclink', email },
  });
  let linkBody = await jsonOrEmpty(link);
  function hashedToken(value) { return value?.hashed_token || value?.properties?.hashed_token || ''; }
  if (!link.ok || !hashedToken(linkBody)) {
    const created = await call('/auth/v1/admin/users', {
      key: serviceKey,
      body: {
        email,
        email_confirm: true,
        password: crypto.randomBytes(32).toString('base64url'),
      },
    });
    const createdBody = await jsonOrEmpty(created);
    if (!created.ok || !createdBody.id) throw new Error('Broker-equivalent staging user creation failed');
    proofUserId = createdBody.id;
    link = await call('/auth/v1/admin/generate_link', {
      key: serviceKey,
      body: { type: 'magiclink', email },
    });
    linkBody = await jsonOrEmpty(link);
  }
  if (!link.ok || !hashedToken(linkBody)) throw new Error('Admin generateLink path failed');

  const verified = await call('/auth/v1/verify', {
    key: anonKey,
    body: { token_hash: hashedToken(linkBody), type: 'email' },
  });
  const verifiedBody = await jsonOrEmpty(verified);
  proofUserId = proofUserId || verifiedBody.user?.id || '';
  if (!verified.ok || !verifiedBody.access_token || !verifiedBody.refresh_token || !proofUserId) {
    throw new Error('Admin-generated token could not issue a bound staging session');
  }

  await cleanup();
  if (!providerDisabled) {
    throw new Error('FAIL: public native /auth/v1/otp is not proven disabled (a staging email may have been sent; disposable user was cleaned)');
  }
  console.log('PASS native_email_otp_disabled=yes broker_admin_session_path=yes disposable_user_cleanup=yes');
} catch (error) {
  try { await cleanup(); } catch (_) {
    throw new Error(`${error.message}; cleanup=FAILED`);
  }
  throw error;
}
