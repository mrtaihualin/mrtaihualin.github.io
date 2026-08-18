#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import {
  EMAIL_MAILER_SECRET_NAME,
  isEmailMailerRequestAuthorized,
  isEmailMailerTemplateAuthorized,
  isLegacyAccountMailerRequestAuthorized,
  readEmailMailerSecret,
} from '../supabase/functions/_shared/email-mailer-auth.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const broker = read('supabase/functions/email-otp-auth/index.ts');
const mailer = read('supabase/functions/send-transactional-email/index.ts');
const client = read('js/games/reading-auth.js');
const config = read('js/core/supabase-config.js');
const expectedConsumers = [
  'lego.html',
  'listening-game.html',
  'reading-game.html',
  'tone-finder.html',
  'typing-game.html',
  'vault.html',
  'word-order.html',
];

let passed = 0;
function test(label, fn) {
  try {
    fn();
    passed += 1;
    console.log(`✓ ${label}`);
  } catch (error) {
    console.error(`✗ ${label}: ${error.message}`);
    process.exitCode = 1;
  }
}

const testSecret = ['sb', 'secret', 'contract', 'test', 'only', '0123456789'].join('_');
const otherSecret = ['sb', 'secret', 'other', 'test', 'only', '9876543210'].join('_');
const secretKeys = JSON.stringify({
  [EMAIL_MAILER_SECRET_NAME]: testSecret,
  'unrelated-caller': otherSecret,
});

test('exact named Supabase secret key authorizes the server caller', () => {
  assert.equal(EMAIL_MAILER_SECRET_NAME, 'email-otp-mailer');
  assert.equal(readEmailMailerSecret(secretKeys), testSecret);
  assert.equal(isEmailMailerRequestAuthorized(new Headers({ apikey: testSecret }), secretKeys), true);
});

test('missing, malformed, publishable, legacy JWT, and alternate keys fail closed', () => {
  const malformedCases = [
    undefined,
    '',
    '{',
    '[]',
    '{}',
    JSON.stringify({ [EMAIL_MAILER_SECRET_NAME]: '' }),
    JSON.stringify({ [EMAIL_MAILER_SECRET_NAME]: 'sb_publishable_browser_key' }),
    JSON.stringify({ [EMAIL_MAILER_SECRET_NAME]: 'header.payload.signature' }),
    JSON.stringify({ [EMAIL_MAILER_SECRET_NAME]: 'sb_secret_short' }),
    JSON.stringify({ [EMAIL_MAILER_SECRET_NAME]: ` ${testSecret}` }),
  ];
  for (const candidate of malformedCases) assert.equal(readEmailMailerSecret(candidate), '');

  assert.equal(isEmailMailerRequestAuthorized(new Headers(), secretKeys), false);
  assert.equal(isEmailMailerRequestAuthorized(new Headers({ apikey: otherSecret }), secretKeys), false);
  assert.equal(isEmailMailerRequestAuthorized(new Headers({ apikey: 'sb_publishable_browser_key' }), secretKeys), false);
  assert.equal(isEmailMailerRequestAuthorized(new Headers({
    authorization: ['Bearer', 'header.payload.signature'].join(' '),
  }), secretKeys), false);
  assert.equal(isEmailMailerRequestAuthorized(new Headers({
    apikey: testSecret,
    authorization: `Bearer ${testSecret}`,
  }), secretKeys), false);
});

test('broker sends only the named key in apikey and never a browser or Bearer secret', () => {
  const send = broker.slice(broker.indexOf('async function sendOtpEmail'), broker.indexOf('async function issueSession'));
  assert.match(broker, /readEmailMailerSecret\(Deno\.env\.get\('SUPABASE_SECRET_KEYS'\)\)/);
  assert.match(send, /if \(!EMAIL_MAILER_API_KEY\) return false/);
  assert.match(send, /'apikey': EMAIL_MAILER_API_KEY/);
  assert.doesNotMatch(send, /Authorization|SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(config, /EMAIL_MAILER_API_KEY|SUPABASE_SECRET_KEYS|email-otp-mailer/);
});

test('mailer binds the OTP caller before body parsing without JWT decoding', () => {
  assert.match(mailer, /verify_jwt=false/);
  assert.match(mailer, /isEmailMailerRequestAuthorized\(req\.headers, Deno\.env\.get\('SUPABASE_SECRET_KEYS'\)\)/);
  assert.ok(mailer.indexOf('isEmailMailerRequestAuthorized(req.headers') < mailer.indexOf('await req.json()'));
  assert.doesNotMatch(mailer, /decodeJwtPayloadUnsafe|isServiceRoleCaller/);
});

test('existing account recovery callers remain isolated from the OTP template', () => {
  const legacyKey = 'legacy-service-role-test-only';
  const legacyHeaders = new Headers({
    authorization: `Bearer ${legacyKey}`,
    apikey: legacyKey,
  });
  assert.equal(isLegacyAccountMailerRequestAuthorized(legacyHeaders, legacyKey), true);
  assert.equal(isLegacyAccountMailerRequestAuthorized(new Headers({ apikey: legacyKey }), legacyKey), false);
  assert.equal(isEmailMailerTemplateAuthorized('account-recovery', 'account_deletion_requested'), true);
  assert.equal(isEmailMailerTemplateAuthorized('account-recovery', 'account_deletion_cancelled'), true);
  assert.equal(isEmailMailerTemplateAuthorized('account-recovery', 'account_deletion_completed'), true);
  assert.equal(isEmailMailerTemplateAuthorized('account-recovery', 'email_login_otp'), false);
  assert.equal(isEmailMailerTemplateAuthorized('email-otp', 'email_login_otp'), true);
  assert.equal(isEmailMailerTemplateAuthorized('email-otp', 'account_deletion_requested'), false);

  for (const file of ['supabase/functions/account-delete/index.ts', 'supabase/functions/account-delete-cron/index.ts']) {
    const source = read(file);
    assert.match(source, /Authorization: 'Bearer ' \+ SERVICE_KEY, apikey: SERVICE_KEY/);
  }
});

test('shared config owns a frozen native/off Email OTP activation artifact', () => {
  const sandbox = { window: {} };
  vm.runInNewContext(config, sandbox, { filename: 'js/core/supabase-config.js' });
  assert.equal(sandbox.window.EMAIL_OTP_SECURITY_CONFIG.mode, 'native');
  assert.equal(sandbox.window.EMAIL_OTP_SECURITY_CONFIG.turnstileSiteKey, '');
  assert.equal(Object.isFrozen(sandbox.window.EMAIL_OTP_SECURITY_CONFIG), true);
  assert.match(client, /window\.EMAIL_OTP_SECURITY_CONFIG \|\| \{\}/);
  assert.match(client, /return otpSecurityConfig\(\)\.mode === 'broker'/);
});

test('only the exact seven Auth consumers advance the config cache binding', () => {
  const actual = fs.readdirSync(root)
    .filter((file) => file.endsWith('.html'))
    .filter((file) => /js\/core\/supabase-config\.js\?v=6/.test(read(file)))
    .sort();
  assert.deepEqual(actual, expectedConsumers);
  for (const file of expectedConsumers) {
    const html = read(file);
    assert.match(html, /js\/core\/supabase-config\.js\?v=6/);
    assert.match(html, /js\/games\/reading-auth\.js\?v=26/);
  }
});

if (!process.exitCode) console.log(`\n✅ Email OTP service/client contract verification passed (${passed} checks)`);
