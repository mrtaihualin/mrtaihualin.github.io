#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');
const { scanProject } = require('./secret-scanner');

function base64Url(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function fakeJwt(role) {
  return `${base64Url({ alg: 'HS256', typ: 'JWT' })}.${base64Url({ role, iss: 'test-only' })}.${'s'.repeat(32)}`;
}

function write(root, relative, content) {
  const target = path.join(root, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, 'utf8');
}

function newFixtureRoot(label) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `p1-08 ${label} `));
}

function findingTypes(result) {
  return result.findings.map((finding) => finding.type);
}

function testDetectsFakeSecretsAndForbiddenNames() {
  const root = newFixtureRoot('detect fake secrets');
  const embedded = 'L'.repeat(32);
  const serviceRoleJwt = fakeJwt('service_role');
  const privateKeyHeader = ['-----BEGIN ', 'PRIVATE KEY-----'].join('');
  const privateKeyFooter = ['-----END ', 'PRIVATE KEY-----'].join('');
  const githubToken = ['gh', 'p_', 'A'.repeat(24)].join('');
  const stripeToken = ['sk_', 'test_', 'B'.repeat(24)].join('');
  const slackToken = ['xox', 'b-', 'C'.repeat(24)].join('');
  const awsToken = ['AK', 'IA', 'D'.repeat(16)].join('');
  const supabaseSecret = ['sb_', 'secret_', 'E'.repeat(24)].join('');
  const googleOauthSecret = ['GOC', 'SPX-', 'F'.repeat(24)].join('');
  const refreshToken = ['refresh-', 'G'.repeat(24)].join('');

  write(root, '.env.production', 'SAFE_TEST_PLACEHOLDER=1\n');
  write(root, '.npmrc', 'SAFE_TEST_PLACEHOLDER=1\n');
  write(root, 'config/credentials-prod.json', '{"placeholder":true}\n');
  write(root, 'source/app.js', `const LINE_CHANNEL_SECRET = "${embedded}";\n`);
  write(root, 'js/core/supabase-config.js', `const publicCandidate = "${serviceRoleJwt}";\n`);
  write(root, 'keys/test.pem', `${privateKeyHeader}\nTEST-ONLY\n${privateKeyFooter}\n`);
  write(root, 'credentials/service account.json', JSON.stringify({
    type: 'service_account',
    private_key_id: 'test-only-id',
    private_key: `${privateKeyHeader}\nTEST-ONLY\n${privateKeyFooter}`,
    client_email: 'fixture@example.invalid'
  }, null, 2));
  write(root, 'config/app settings.yaml', `refresh_token: ${refreshToken}\n`);
  write(root, 'logs with spaces/auth leak.log', [
    `github=${githubToken}`,
    `stripe=${stripeToken}`,
    `slack=${slackToken}`,
    `aws=${awsToken}`,
    `supabase=${supabaseSecret}`,
    `google=${googleOauthSecret}`
  ].join('\n'));

  const result = scanProject(root);
  const types = findingTypes(result);
  assert(types.includes('ไฟล์ environment ที่อาจมีค่าลับ'));
  assert(types.includes('ไฟล์ credential configuration'));
  assert(types.includes('ไฟล์ service-account/credential JSON'));
  assert(types.includes('ค่าฝังของ LINE_CHANNEL_SECRET'));
  assert(types.includes('Supabase service-role JWT'));
  assert(types.includes('private key'));
  assert(types.includes('Google service-account JSON'));
  assert(types.includes('GitHub token'));
  assert(types.includes('Stripe secret key'));
  assert(types.includes('Slack token'));
  assert(types.includes('AWS access key'));
  assert(types.includes('Supabase server secret'));
  assert(types.includes('Google OAuth client secret'));
  assert(types.includes('ค่า refresh_token ที่ฝังในไฟล์'));
  assert(result.findings.some((finding) => finding.file === 'logs with spaces/auth leak.log'));

  const cli = cp.spawnSync(process.execPath, [path.join(__dirname, 'secret-scanner.js'), root], { encoding: 'utf8' });
  const output = `${cli.stdout}${cli.stderr}`;
  assert.notStrictEqual(cli.status, 0);
  for (const forbiddenValue of [embedded, serviceRoleJwt, githubToken, stripeToken, slackToken, awsToken, supabaseSecret, googleOauthSecret, refreshToken, 'TEST-ONLY']) {
    assert(!output.includes(forbiddenValue), 'output leaked a fake secret value');
  }
}

function testAllowsApprovedBrowserValuesAndReferences() {
  const root = newFixtureRoot('allow public browser values');
  const anonJwt = fakeJwt('anon');
  const youtubeKey = ['AI', 'za', 'Y'.repeat(35)].join('');
  const web3formsKey = ['11111111', '2222', '4333', '8444', '555555555555'].join('-');
  const supabasePublishable = ['sb_', 'publishable_', 'P'.repeat(24)].join('');

  write(root, '.env.example', 'LINE_CHANNEL_SECRET=YOUR_SECRET_HERE\n');
  write(root, '.env.template', 'GOOGLE_CLIENT_SECRET=<secret>\n');
  write(root, 'js/core/supabase-config.js', [
    `const SUPABASE_ANON_KEY = "${anonJwt}";`,
    `const SUPABASE_PUBLISHABLE_KEY = "${supabasePublishable}";`
  ].join('\n'));
  write(root, 'index.html', `<script>const API_KEY = "${youtubeKey}"; fetch("https://www.googleapis.com/youtube/v3/search");</script>\n`);
  write(root, 'community.html', `<form action="https://api.web3forms.com/submit"><input name="access_key" value="${web3formsKey}"></form>\n`);
  write(root, 'supabase/functions/example/index.ts', [
    "const secret = Deno.env.get('LINE_CHANNEL_SECRET');",
    "const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;"
  ].join('\n'));
  write(root, 'docs/security.md', 'ชื่อที่ระบบอ้างถึง: SUPABASE_SERVICE_ROLE_KEY และ GOOGLE_CLIENT_SECRET\n');

  const result = scanProject(root);
  assert.deepStrictEqual(result.findings, []);
}

function testDetectsSecretsInsidePreviouslySkippedDocumentFolders() {
  const root = newFixtureRoot('scan previously skipped dirs');
  const devToken = ['gh', 'p_', 'H'.repeat(24)].join('');
  const planToken = ['sk_', 'test_', 'K'.repeat(24)].join('');
  const articleToken = ['gh', 'p_', 'N'.repeat(24)].join('');

  // ก่อน 2026-08-07 โฟลเดอร์เหล่านี้ถูกข้ามทั้งโฟลเดอร์ ไฟล์ข้างในไม่เคยถูกสแกนเลย
  write(root, '_dev/สมุดทดสอบ.md', `token=${devToken}\n`);
  write(root, '_แผนงาน/ทำต่อในอนาคต.md', `stripe=${planToken}\n`);
  write(root, '_บทความ-เตรียมเขียน/draft.md', `token=${articleToken}\n`);

  const result = scanProject(root);
  const files = result.findings.map((finding) => finding.file);
  assert(files.includes('_dev/สมุดทดสอบ.md'), 'secret inside _dev/ must be detected (2026-08-07 fail-open fix)');
  assert(files.includes('_แผนงาน/ทำต่อในอนาคต.md'), 'secret inside _แผนงาน/ must be detected (2026-08-07 fail-open fix)');
  assert(files.includes('_บทความ-เตรียมเขียน/draft.md'), 'secret inside _บทความ-เตรียมเขียน/ must be detected (2026-08-07 fail-open fix)');
}

function testFailsClosedWhenTextFileIsTooLargeToScan() {
  const root = newFixtureRoot('fail closed oversized file');
  const embeddedSecret = `LINE_CHANNEL_SECRET=${'Q'.repeat(32)}`;
  const oversizedContent = `${'A'.repeat(2 * 1024 * 1024 + 1024)}\n${embeddedSecret}\n`;
  write(root, 'notes/big-history.log', oversizedContent);

  const result = scanProject(root);
  assert(result.skippedLargeFiles.includes('notes/big-history.log'), 'oversized text file must be reported as skipped, not silently passed');
  assert(!result.findings.some((finding) => finding.file === 'notes/big-history.log'), 'oversized file content must not be read/scanned');

  const cli = cp.spawnSync(process.execPath, [path.join(__dirname, 'secret-scanner.js'), root], { encoding: 'utf8' });
  assert.notStrictEqual(cli.status, 0, 'CLI must exit non-zero (fail-closed) when a text file was skipped for being oversized, even with zero findings');
  assert(!`${cli.stdout}${cli.stderr}`.includes(embeddedSecret), 'output must not leak the unscanned secret value');
}

testDetectsFakeSecretsAndForbiddenNames();
testAllowsApprovedBrowserValuesAndReferences();
testDetectsSecretsInsidePreviouslySkippedDocumentFolders();
testFailsClosedWhenTextFileIsTooLargeToScan();
console.log('✓ secret-scanner tests: ตรวจพบ/ปิดบังค่า/allowlist/path ช่องว่าง/โฟลเดอร์ที่เคยถูกข้าม/ไฟล์ใหญ่เกิน ผ่าน');
