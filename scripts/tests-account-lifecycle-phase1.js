#!/usr/bin/env node
'use strict';

// Phase 1 account/provider lifecycle regression. This test uses fake browser
// and Supabase objects only; it never calls a provider, Edge Function, or DB.

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const authSource = fs.readFileSync(path.join(root, 'js/core/auth-widget.js'), 'utf8');
const unlinkSource = fs.readFileSync(path.join(root, 'supabase/functions/account-unlink/index.ts'), 'utf8');
const deleteSource = fs.readFileSync(path.join(root, 'supabase/functions/account-delete/index.ts'), 'utf8');
const logoutSqlSource = fs.readFileSync(path.join(root, 'supabase/migrations/20260903163000_phase1_auth_global_logout_strict.sql'), 'utf8');

function memoryStorage(initial) {
  const values = new Map(Object.entries(initial || {}));
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); }
  };
}

function makeNode(tagName, nodes) {
  return {
    tagName,
    id: '',
    style: {},
    parentNode: null,
    textContent: '',
    setAttribute() {},
    remove() {
      if (this.id) nodes.delete(this.id);
      this.parentNode = null;
    }
  };
}

function createHarness(signOut, accountResponse) {
  const localStorage = memoryStorage({
    tf_avatar: '🐘',
    tf_pinned_badge: 'badge',
    rg_last_login_provider: 'email'
  });
  const sessionStorage = memoryStorage();
  const nodes = new Map();
  const body = {
    appendChild(node) {
      node.parentNode = body;
      if (node.id) nodes.set(node.id, node);
      return node;
    }
  };
  const document = {
    readyState: 'complete',
    body,
    createElement(tag) { return makeNode(tag, nodes); },
    getElementById(id) { return nodes.get(id) || null; },
    querySelector() { return null; },
    addEventListener() {}
  };
  const user = { id: 'account-owner', email: 'student@example.com', user_metadata: {} };
  const calls = [];
  const sb = {
    auth: {
      getSession() { return Promise.resolve({ data: { session: { user, access_token: 'test-access-token' } }, error: null }); },
      signOut(options) { calls.push({ type: 'signOut', options }); return signOut(options); },
      onAuthStateChange() {}
    },
    from() {
      return { select() { return { eq() { return { maybeSingle() {
        return Promise.resolve({ data: { nickname: 'Tester' }, error: null });
      } }; } }; } };
    },
    functions: { invoke() { return Promise.resolve({ data: null, error: null }); } },
    rpc() { return Promise.resolve({ data: null, error: null }); }
  };
  const window = {
    SUPABASE_CONFIG: { url: 'https://example.supabase.co', anonKey: 'public-anon-key' },
    supabase: { createClient() { return sb; } },
    getSupabaseClient() { return sb; },
    localStorage,
    sessionStorage
  };
  function fetch(url, options) {
    calls.push({ type: 'fetch', url, body: JSON.parse(options.body) });
    const response = typeof accountResponse === 'function' ? accountResponse(url, options) : accountResponse;
    if (response instanceof Error) return Promise.reject(response);
    const value = response || {
      ok: true,
      status: 200,
      body: { ok: true, revoked: true, remaining_sessions: 0, remaining_refresh_tokens: 0 }
    };
    return Promise.resolve({
      ok: value.ok !== false,
      status: value.status || (value.ok === false ? 500 : 200),
      json() { return Promise.resolve(value.body); }
    });
  }
  vm.runInNewContext(authSource, {
    window, self: window, document, localStorage, sessionStorage,
    location: { reload() {} }, console,
    fetch, setTimeout() {}, clearTimeout() {}, Promise
  }, { filename: 'auth-widget.js' });
  return { api: window.SITE_AUTH, document, localStorage, calls };
}

async function settle() {
  await Promise.resolve();
  await new Promise((resolve) => setImmediate(resolve));
}

let passed = 0;
async function test(name, fn) {
  await fn();
  passed++;
  console.log('✓ ' + name);
}

(async function run() {
  await test('failed local logout stays visible and preserves account UI caches', async () => {
    const failure = new Error('offline');
    const h = createHarness(() => Promise.resolve({ error: failure }));
    await settle();
    const res = await h.api.doLogout();
    assert.strictEqual(res.error, failure);
    assert.strictEqual(h.localStorage.getItem('tf_avatar'), '🐘');
    assert.ok(h.document.getElementById('sa-auth-action-fail-toast'));
    assert.match(h.document.getElementById('sa-auth-action-fail-toast').textContent, /登出失敗/);
  });

  await test('failed server revocation never performs local logout and preserves caches', async () => {
    const h = createHarness(() => Promise.resolve({ error: null }), {
      ok: false, status: 500, body: { error: 'logout_failed', message: 'not confirmed' }
    });
    await settle();
    const res = await h.api.doLogoutAllDevices();
    assert.ok(res.error);
    assert.deepStrictEqual(h.calls.map((call) => call.type), ['fetch']);
    assert.strictEqual(h.localStorage.getItem('tf_pinned_badge'), 'badge');
    assert.ok(h.document.getElementById('sa-auth-action-fail-toast'));
    assert.match(h.document.getElementById('sa-auth-action-fail-toast').textContent, /所有裝置/);
  });

  await test('server-confirmed zero revokes first, then local logout clears caches', async () => {
    const h = createHarness(() => Promise.resolve({ error: null }));
    await settle();
    const res = await h.api.doLogoutAllDevices();
    assert.strictEqual(res.error, null);
    assert.strictEqual(res.revoked, true);
    assert.deepStrictEqual(h.calls.map((call) => call.type), ['fetch', 'signOut']);
    assert.strictEqual(h.calls[0].body.action, 'logout_all');
    assert.strictEqual(h.calls[1].options.scope, 'local');
    assert.strictEqual(h.localStorage.getItem('tf_avatar'), null);
    assert.strictEqual(h.document.getElementById('sa-auth-action-fail-toast'), null);
  });

  await test('nonzero server proof is rejected and never clears local state', async () => {
    const h = createHarness(() => Promise.resolve({ error: null }), {
      ok: true,
      status: 200,
      body: { ok: true, revoked: true, remaining_sessions: 1, remaining_refresh_tokens: 0 }
    });
    await settle();
    const res = await h.api.doLogoutAllDevices();
    assert.ok(res.error);
    assert.deepStrictEqual(h.calls.map((call) => call.type), ['fetch']);
    assert.strictEqual(h.localStorage.getItem('tf_avatar'), '🐘');
  });

  await test('local cleanup failure remains visible after server revocation', async () => {
    const failure = new Error('local cleanup failed');
    const h = createHarness(() => Promise.resolve({ error: failure }));
    await settle();
    const res = await h.api.doLogoutAllDevices();
    assert.strictEqual(res.error, failure);
    assert.deepStrictEqual(h.calls.map((call) => call.type), ['fetch', 'signOut']);
    assert.strictEqual(h.localStorage.getItem('tf_avatar'), '🐘');
  });

  await test('account management closes only after confirmed global logout', async () => {
    assert.match(authSource, /doLogoutAllDevices\(\)\.then\(function \(res\) \{[\s\S]{0,500}if \(res && res\.error\)[\s\S]{0,500}closeM\(\)/);
    assert.doesNotMatch(authSource, /doLogoutAllDevices\(\)\.then\(closeM\)/);
  });

  await test('unlink owner and session freshness come from verified JWT only', async () => {
    assert.match(unlinkSource, /asUser\.auth\.getUser\(jwt\)/);
    assert.match(unlinkSource, /const userId = user\.id/);
    assert.match(unlinkSource, /if \(action === 'unlink'\)[\s\S]{0,500}const iat = claims\?\.iat/);
    assert.match(unlinkSource, /if \(remainingAfter < 1\)/);
  });

  await test('delete request is cooldown-only and cancel remains recoverable', async () => {
    assert.match(deleteSource, /action !== 'preview' && action !== 'request' && action !== 'cancel' && action !== 'logout_all'/);
    assert.match(deleteSource, /asUser\.auth\.getUser\(jwt\)/);
    assert.match(deleteSource, /if \(body\?\.confirm !== true\)/);
    assert.match(deleteSource, /status: 'pending', scheduled_delete_at: scheduledDeleteAt/);
    assert.match(deleteSource, /if \(action === 'cancel'\)/);
    assert.match(deleteSource, /\.update\(\{ status: 'cancelled', cancelled_at:/);
    assert.doesNotMatch(deleteSource, /auth\.admin\.deleteUser/);
  });

  await test('logout-all owner is verified server-side and revocation must prove zero', async () => {
    assert.match(deleteSource, /const userId = userData\.user\.id/);
    assert.match(deleteSource, /if \(action === 'logout_all'\)[\s\S]{0,500}admin\.rpc\('phase1_auth_revoke_all_sessions'/);
    assert.match(deleteSource, /p_user_id: userId/);
    assert.match(deleteSource, /revoked\.remaining_sessions !== 0 \|\| revoked\.remaining_refresh_tokens !== 0/);
    assert.doesNotMatch(deleteSource, /body\?\.user_id|body\.user_id/);
  });

  await test('logout-all SQL is service-role-only and deletes exact auth rows', async () => {
    assert.match(logoutSqlSource, /security definer\s+set search_path = ''/i);
    assert.match(logoutSqlSource, /auth\.jwt\(\) ->> 'role'[\s\S]{0,100}'service_role'/);
    assert.match(logoutSqlSource, /delete from auth\.refresh_tokens\s+where user_id = p_user_id::text/i);
    assert.match(logoutSqlSource, /delete from auth\.sessions\s+where user_id = p_user_id/i);
    assert.match(logoutSqlSource, /revoke all on function public\.phase1_auth_revoke_all_sessions\(uuid\)\s+from public, anon, authenticated/i);
    assert.match(logoutSqlSource, /grant execute on function public\.phase1_auth_revoke_all_sessions\(uuid\)\s+to service_role/i);
    assert.doesNotMatch(logoutSqlSource, /delete from auth\.users|delete from public\./i);
  });

  console.log('\n✅ Phase 1 account lifecycle passed (' + passed + ' checks)');
})().catch((error) => {
  console.error('✗ ' + error.stack);
  process.exit(1);
});
