#!/usr/bin/env node
'use strict';

// Phase 1 account-audit trust-boundary regression. Static source contracts are
// intentional: this suite never calls Auth, an Edge Function, or a database.

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const authWidget = read('js/core/auth-widget.js');
const accountUnlink = read('supabase/functions/account-unlink/index.ts');
const migrationName = fs.readdirSync(path.join(root, 'supabase/migrations'))
  .find((name) => name.endsWith('_phase1_account_audit_rpc_hardening.sql'));
assert.ok(migrationName, 'account-audit hardening migration exists');
const migration = read('supabase/migrations/' + migrationName);

let passed = 0;
function check(name, fn) {
  fn();
  passed++;
  console.log('✓ ' + name);
}

check('browser never calls privileged account-audit RPC directly', () => {
  assert.doesNotMatch(authWidget, /\.rpc\(\s*['"]log_account_audit['"]/);
  assert.match(authWidget, /callAccountFn\('account-unlink',\s*\{\s*action: 'audit_link',\s*provider: 'facebook'\s*\}\)/);
});

check('browser audit request cannot choose owner, actor, or before/after state', () => {
  const call = authWidget.match(/callAccountFn\('account-unlink',\s*\{\s*action: 'audit_link',[\s\S]*?\}\)\.catch\(function \(e\) \{ console\.error\('account audit failed/);
  assert.ok(call, 'trusted Edge audit call exists');
  assert.doesNotMatch(call[0], /user_id|actor|before_state|after_state|providers_before/);
});

check('Edge recognizes only the locked Facebook link-audit provider', () => {
  assert.match(accountUnlink, /const AUDITABLE_LINK_PROVIDERS = \['facebook'\]/);
  assert.match(accountUnlink, /action === 'audit_link' && !AUDITABLE_LINK_PROVIDERS\.includes\(provider\)/);
});

check('Edge re-verifies JWT owner against Auth before audit processing', () => {
  assert.match(accountUnlink, /asUser\.auth\.getUser\(jwt\)/);
  assert.match(accountUnlink, /const userId = user\.id/);
  assert.doesNotMatch(accountUnlink, /const userId = body/);
});

check('Edge verifies the provider is currently attached to the verified owner', () => {
  assert.match(accountUnlink, /const providersAfter = Array\.from\(new Set\(\(user\.identities \|\| \[\]\)/);
  assert.match(accountUnlink, /if \(!providersAfter\.includes\(provider\)\)[\s\S]{0,260}provider_not_linked/);
});

check('Edge derives both audit states and actor identity server-side', () => {
  assert.match(accountUnlink, /const providersBefore = providersAfter\.filter\(\(name\) => name !== provider\)/);
  assert.match(accountUnlink, /admin\.rpc\('log_account_audit',[\s\S]{0,520}p_user_id: userId[\s\S]{0,520}p_actor_id: userId/);
  assert.match(accountUnlink, /p_before_state: \{ providers: providersBefore \}/);
  assert.match(accountUnlink, /p_after_state: \{ providers: providersAfter \}/);
});

check('audit abuse guard and RPC failures are fail-closed', () => {
  assert.match(accountUnlink, /p_fn: 'account-audit-link', p_limit: 5, p_window: 600/);
  assert.match(accountUnlink, /audit_guard_unavailable/);
  assert.match(accountUnlink, /audit_log_failed/);
  assert.match(accountUnlink, /return json\(\{ ok: true, action: 'audit_link', provider, audit_logged: true \}\)/);
});

check('migration hardens the exact existing function signature and search path', () => {
  assert.match(migration, /alter function public\.log_account_audit\(uuid, text, jsonb, jsonb, text, uuid, text\)\s+set search_path = ''/i);
});

check('migration revokes every browser execution path', () => {
  assert.match(migration, /revoke execute on function public\.log_account_audit\(uuid, text, jsonb, jsonb, text, uuid, text\)[\s\S]*?from public, anon, authenticated/i);
  const grants = Array.from(migration.matchAll(/grant execute on function[\s\S]*?\bto\s+([a-z_]+)\s*;/gi), (match) => match[1].toLowerCase());
  assert.deepStrictEqual(grants, ['service_role']);
});

check('migration retains service-role-only execution and verifies privileges', () => {
  assert.match(migration, /grant execute on function public\.log_account_audit\(uuid, text, jsonb, jsonb, text, uuid, text\)[\s\S]*?to service_role/i);
  assert.match(migration, /pg_catalog\.aclexplode[\s\S]*?acl\.grantee = 0[\s\S]*?acl\.privilege_type = 'EXECUTE'/);
  for (const role of ['anon', 'authenticated', 'service_role']) {
    assert.match(migration, new RegExp("has_function_privilege\\('" + role + "'"));
  }
});

console.log('\n✅ Phase 1 account audit integrity passed (' + passed + ' checks)');
