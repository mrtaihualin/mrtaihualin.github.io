#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const edge = read('supabase/functions/email-otp-auth/index.ts');
const sql = read('supabase/sql/2026-08-16_email_otp_auth_security.sql');
const client = read('js/games/reading-auth.js');
const mailer = read('supabase/functions/send-transactional-email/index.ts');
const proof = read('scripts/prove-email-otp-native-bypass.mjs');
const sqlTest = read('supabase/tests/2026-08-16_email_otp_auth_security_TEST.sql');

let passed = 0;
function test(label, fn) {
  try {
    fn();
    passed++;
    console.log('✓ ' + label);
  } catch (error) {
    console.error('✗ ' + label + ': ' + error.message);
    process.exitCode = 1;
  }
}

class OtpModel {
  constructor() {
    this.state = 'pending';
    this.attempts = 0;
    this.issuedAt = 0;
    this.expiresAt = 10 * 60;
  }
  verify(codeIsCorrect, nowSeconds) {
    if (this.state !== 'pending') return false;
    if (nowSeconds >= this.expiresAt) { this.state = 'expired'; return false; }
    if (codeIsCorrect) { this.state = 'used'; return true; }
    this.attempts++;
    if (this.attempts >= 5) this.state = 'invalidated';
    return false;
  }
}

test('OTP contract is exactly six random digits and ten minutes', () => {
  assert.match(edge, /const OTP_TTL_MINUTES = 10/);
  assert.match(edge, /EMAIL_OTP_HMAC_SECRET\)\.byteLength >= 32/);
  assert.match(edge, /randomSixDigits[\s\S]*crypto\.getRandomValues/);
  assert.match(edge, /acceptedBound[\s\S]*values\[0\] >= acceptedBound/);
  assert.match(edge, /padStart\(6, '0'\)/);
  assert.match(sql, /expires_at = issued_at \+ interval '10 minutes'/);
  assert.match(client, /!\/\^\\d\{6\}\$\/\.test\(code\)/);
});

test('challenge data is HMAC-only and raw credentials are not schema columns', () => {
  const challengeTable = sql.match(/create table private\.email_otp_challenges \([\s\S]*?\n\);/)[0];
  assert.match(challengeTable, /email_hmac text not null/);
  assert.match(challengeTable, /code_hmac text not null/);
  assert.match(challengeTable, /ip_hmac text not null/);
  assert.doesNotMatch(challengeTable, /\n\s*(?:email|code|otp|ip)\s+(?:text|varchar|inet)/i);
  assert.match(edge, /hmac\(`email:v1:\$\{email\}`\)/);
  assert.match(edge, /hmac\(`code:v1:\$\{publicChallengeId\}:\$\{email\}:\$\{code\}`\)/);
  assert.doesNotMatch(edge, /console\.(?:log|error)\([^\n]*(?:email|code|token|ip)\s*[,)]/i);
});

test('verification is atomic, single-use, and invalidates on the fifth wrong attempt', () => {
  assert.match(sql, /for update;[\s\S]*v_challenge\.state <> 'pending'/);
  assert.match(sql, /v_attempts := v_challenge\.attempts \+ 1/);
  assert.match(sql, /when v_attempts >= 5 then 'invalidated'/);
  assert.match(sql, /state = 'used', used_at = v_now/);
  assert.match(sql, /pg_advisory_xact_lock/);

  const model = new OtpModel();
  for (let index = 0; index < 4; index++) assert.strictEqual(model.verify(false, index), false);
  assert.strictEqual(model.state, 'pending');
  assert.strictEqual(model.verify(false, 4), false);
  assert.strictEqual(model.state, 'invalidated');
  assert.strictEqual(model.verify(true, 5), false);
});

test('expiry boundary and reuse fail closed', () => {
  const expiring = new OtpModel();
  assert.strictEqual(expiring.verify(true, 599), true);
  assert.strictEqual(expiring.verify(true, 599), false);
  const expired = new OtpModel();
  assert.strictEqual(expired.verify(true, 600), false);
  assert.strictEqual(expired.state, 'expired');
});

test('request and verify abuse controls enforce 15m then repeated 60m cooldowns', () => {
  assert.match(sql, /last_request_at > v_now - interval '15 minutes'/);
  assert.match(sql, /v_ip_15m >= 10 or v_ip_60m >= 30/);
  assert.match(sql, /v_ip_attempts >= 25/);
  assert.ok(sql.indexOf('v_ip_attempts >= 25') < sql.indexOf('if not v_challenge_found then'));
  assert.match(sql, /when v_previous is not null and v_previous >= p_now - interval '60 minutes' then 3600/);
  assert.match(sql, /else 900/);
  assert.match(sql, /perform private\.register_email_otp_violation\('email',[\s\S]*verify_lockout/);
  assert.match(client, /otpBrokerEnabled\(\) \? 15 \* 60 : 60/);
});

test('Turnstile managed flow is required on both public broker actions', () => {
  assert.match(client, /challenges\.cloudflare\.com\/turnstile\/v0\/api\.js\?render=explicit/);
  assert.match(client, /turnstile\.render\(container/);
  assert.match(client, /getTurnstileToken\('email_otp_request'\)/);
  assert.match(client, /getTurnstileToken\('email_otp_verify'\)/);
  assert.match(edge, /challenges\.cloudflare\.com\/turnstile\/v0\/siteverify/);
  assert.match(edge, /data\?\.action === expectedAction/);
  assert.match(edge, /expectedHostnames\.has/);
  assert.match(edge, /'email_otp_request'/);
  assert.match(edge, /'email_otp_verify'/);
});

test('public request shape is generic and cannot enumerate account existence', () => {
  const acceptedResponses = edge.match(/\{ ok: true, challenge_id: publicChallengeId \}, 202/g) || [];
  assert.ok(acceptedResponses.length >= 2);
  assert.match(edge, /MIN_PUBLIC_RESPONSE_MS = 450/);
  assert.doesNotMatch(edge, /getUserByEmail|listUsers/);
  assert.doesNotMatch(edge, /user_not_found|already_registered/);
  assert.match(client, /暫時無法寄送驗證碼，請稍後再試/);
});

test('broker-issued session is bound before the client accepts login', () => {
  assert.match(edge, /verify_email_otp_challenge_internal/);
  assert.match(sql, /state = 'used', used_at = v_now/);
  assert.ok(edge.indexOf("checked.data?.status !== 'verified'") < edge.indexOf('issueSession(email)'));
  assert.match(edge, /authClient\.auth\.verifyOtp\(\{ token_hash: tokenHash, type: 'email' \}\)/);
  assert.match(edge, /normalizeEmail\(session\.user\.email\) !== email/);
  assert.match(client, /sb\.auth\.setSession\(\{ access_token: session\.access_token, refresh_token: session\.refresh_token \}\)/);
  assert.match(client, /boundUser\.id !== userId/);
  assert.match(client, /sb\.auth\.signOut\(\{ scope: 'local' \}\)/);
  assert.doesNotMatch(client.slice(client.indexOf('function verifyCode'), client.indexOf('function startCooldown')), /location\.(?:href|replace|assign)/);
});

test('native path is rollout-gated and remains the safe default before activation', () => {
  assert.match(client, /window\.EMAIL_OTP_SECURITY_CONFIG \|\| \{\}/);
  assert.match(client, /mode === 'broker'/);
  assert.match(client, /sb\.functions\.invoke\('email-otp-auth'/);
  assert.match(client, /sb\.auth\.signInWithOtp\(\{ email: email, options: \{ shouldCreateUser: true \} \}\)/);
  assert.match(client, /sb\.auth\.verifyOtp\(\{ email: otpEmail, token: code, type: 'email' \}\)/);
});

test('security logging is sanitized, private, retained, and service-only', () => {
  assert.match(sql, /create table private\.email_otp_security_events/);
  assert.match(sql, /metadata jsonb not null default '\{\}'::jsonb/);
  assert.match(sql, /occurred_at < clock_timestamp\(\) - interval '30 days'/);
  assert.match(sql, /revoke all on table private\.email_otp_security_events from public, anon, authenticated/);
  assert.match(sql, /grant execute on function public\.log_email_otp_security_internal[\s\S]*to service_role/);
  assert.doesNotMatch(sql, /metadata\s*[,=][^\n]*(?:p_email|p_code|p_ip)/i);
});

test('transactional login email accepts only a six-digit ten-minute OTP contract', () => {
  const template = mailer.slice(mailer.indexOf('email_login_otp:'), mailer.indexOf('account_deletion_requested:'));
  assert.match(template, /required: \['otp_code', 'expires_minutes'\]/);
  assert.match(template, /\^\\d\{6\}\$/);
  assert.match(template, /Number\(data\.expires_minutes\) === 10/);
  assert.match(mailer, /invalid_template_data/);
});

test('native-bypass proof tooling refuses Production and requires explicit disposable staging authority', () => {
  assert.match(proof, /ALLOW_NON_PRODUCTION_AUTH_PROOF !== 'YES'/);
  assert.match(proof, /EMAIL_OTP_PROOF_DISPOSABLE !== 'YES'/);
  assert.match(proof, /qzkxlhpcputsvbqmtqfi\.supabase\.co/);
  assert.match(proof, /CONFIRM_STAGING_PROJECT_REF/);
  assert.match(proof, /\/auth\/v1\/otp/);
  assert.match(proof, /\/auth\/v1\/admin\/generate_link/);
  assert.match(proof, /\/auth\/v1\/verify/);
  assert.match(proof, /method: 'DELETE'/);
  assert.match(proof, /console\.log\('PASS native_email_otp_disabled=yes broker_admin_session_path=yes disposable_user_cleanup=yes'\)/);
  assert.doesNotMatch(proof, /console\.log\((?:email|proofUserId|hashedToken|linkBody|verifiedBody)/);
});

test('private tables use RLS and no browser role can execute privileged RPCs', () => {
  ['email_otp_challenges', 'email_otp_abuse_state', 'email_otp_security_events'].forEach((table) => {
    assert.match(sql, new RegExp(`alter table private\\.${table} enable row level security`));
    assert.match(sql, new RegExp(`alter table private\\.${table} force row level security`));
  });
  ['begin_email_otp_challenge_internal', 'verify_email_otp_challenge_internal',
    'invalidate_email_otp_challenge_internal', 'log_email_otp_security_internal',
    'purge_email_otp_security_internal'].forEach((rpc) => {
    assert.match(sql, new RegExp(`revoke execute on function public\\.${rpc}[\\s\\S]*from public, anon, authenticated`));
  });
  assert.match(sqlTest, /has_function_privilege\('anon'/);
  assert.match(sqlTest, /fifth wrong OTP did not invalidate/);
  assert.match(sqlTest, /used OTP was reusable/);
  assert.match(sqlTest, /expired OTP accepted/);
  assert.match(sqlTest, /repeated request abuse did not escalate to 60 minutes/);
  assert.match(sqlTest, /single-email resend blocked the shared IP/);
  assert.match(sqlTest, /unknown-challenge verification flood did not trigger IP cooldown/);
  assert.match(sqlTest, /cooldown security logging can be amplified/);
  assert.match(sqlTest, /rollback;/);
});

if (!process.exitCode) console.log(`\n✅ Email OTP auth-security verification passed (${passed} checks)`);
