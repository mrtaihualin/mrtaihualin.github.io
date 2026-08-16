#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'js/core/auth-widget.js'), 'utf8');
const leaderboardSource = fs.readFileSync(path.join(root, 'js/score/leaderboard.js'), 'utf8');
const skillLeaderboardSource = fs.readFileSync(path.join(root, 'js/score/reading-leaderboard.js'), 'utf8');
const otpSource = fs.readFileSync(path.join(root, 'js/games/reading-auth.js'), 'utf8');
const LEARNING_KEYS = [
  'tf_srs_v1', 'rgv3_save', 'wo_srs_v1',
  'tf_badges_v1', 'tf_streak_v1', 'tf_word_wrong_v1', 'tf_wrong_stats_v1',
  'thai_game_acct_v1', 'linvault_v1', 'sentence_vault_v1', 'lego_vault_v1',
  'phase1_account_resume_v1', 'phase1_canonical_meta_v1'
];

function memoryStorage(initial) {
  const values = new Map(Object.entries(initial || {}));
  const removed = [];
  return {
    removed,
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { removed.push(key); values.delete(key); }
  };
}

function createHarness(getSession, initialStorage, signOut) {
  const localStorage = memoryStorage(initialStorage);
  const sessionStorage = memoryStorage();
  const warnings = [];
  const sb = {
    auth: {
      getSession,
      signOut: signOut || (() => Promise.resolve({ error: null })),
      onAuthStateChange() {}
    },
    from() {
      return {
        select() {
          return {
            eq() {
              return {
                maybeSingle() {
                  return Promise.resolve({ data: { nickname: 'Tester', avatar: null, badge_id: null }, error: null });
                }
              };
            }
          };
        }
      };
    },
    functions: { invoke() { return Promise.resolve({ data: null, error: null }); } },
    rpc() { return Promise.resolve({ data: null, error: null }); }
  };
  const document = {
    readyState: 'complete',
    getElementById() { return null; },
    querySelector() { return null; },
    addEventListener() {},
    body: { appendChild() {} }
  };
  const window = {
    SUPABASE_CONFIG: { url: 'https://example.supabase.co', anonKey: 'anon-key' },
    supabase: { createClient() { return sb; } },
    getSupabaseClient() { return sb; },
    localStorage,
    sessionStorage
  };
  const sandbox = {
    window,
    self: window,
    document,
    localStorage,
    sessionStorage,
    location: { reload() {} },
    console: { warn() { warnings.push(Array.from(arguments).join(' ')); }, error() {}, log() {} },
    setTimeout,
    clearTimeout,
    Promise
  };
  vm.runInNewContext(source, sandbox, { filename: 'auth-widget.js' });
  return { api: window.SITE_AUTH, localStorage, warnings };
}

async function settle() {
  await Promise.resolve();
  await new Promise((resolve) => setImmediate(resolve));
}

let passed = 0;
async function test(label, fn) {
  try {
    await fn();
    passed++;
    console.log('✓ ' + label);
  } catch (error) {
    console.error('✗ ' + label + ': ' + error.message);
    process.exitCode = 1;
  }
}

(async function run() {
  const user = { id: 'user-valid', email: 'mr.taihualin@gmail.com', user_metadata: {} };

  await test('normal logout is local while logout-all is explicitly global', async () => {
    assert.match(source, /function doLogout\(\)[\s\S]{0,260}signOut\(\{ scope: 'local' \}\)/);
    assert.match(source, /function doLogoutAllDevices\(\)[\s\S]{0,260}signOut\(\{ scope: 'global' \}\)/);
    assert.doesNotMatch(source, /sb\.auth\.signOut\(\);/);
  });

  await test('leaderboards reuse the shared auth client', async () => {
    [leaderboardSource, skillLeaderboardSource].forEach((boardSource) => {
      assert.match(boardSource, /window\.getSupabaseClient \? window\.getSupabaseClient\(\)/);
      assert.doesNotMatch(boardSource, /var sb = window\.supabase\.createClient/);
    });
  });

  await test('valid session is accepted and binds the verified account owner', async () => {
    const h = createHarness(() => Promise.resolve({ data: { session: { user } }, error: null }));
    await settle();
    assert.strictEqual(h.api.user.id, user.id);
    assert.strictEqual(h.api.authError, null);
    assert.strictEqual(h.localStorage.getItem('phase1_learning_owner_v1'), user.id);
  });

  await test('error-free null session is confirmed logged out and clears account learning state', async () => {
    const h = createHarness(
      () => Promise.resolve({ data: { session: null }, error: null }),
      { phase1_learning_owner_v1: 'old-user', tf_srs_v1: 'saved' }
    );
    await settle();
    assert.strictEqual(h.api.user, null);
    assert.strictEqual(h.api.authError, null);
    assert.strictEqual(h.localStorage.getItem('phase1_learning_owner_v1'), null);
    assert.strictEqual(h.localStorage.getItem('tf_srs_v1'), null);
  });

  await test('getSession rejection remains unknown and preserves account learning state', async () => {
    const h = createHarness(
      () => Promise.reject(new Error('network unavailable')),
      { phase1_learning_owner_v1: 'old-user', tf_srs_v1: 'saved' }
    );
    await settle();
    assert.strictEqual(h.api.authError, 'session_unavailable');
    assert.strictEqual(h.localStorage.getItem('phase1_learning_owner_v1'), 'old-user');
    assert.strictEqual(h.localStorage.getItem('tf_srs_v1'), 'saved');
  });

  await test('getSession resolved error remains unknown instead of confirmed logout', async () => {
    const h = createHarness(
      () => Promise.resolve({ data: { session: null }, error: new Error('verification failed') }),
      { phase1_learning_owner_v1: 'old-user', tf_srs_v1: 'saved' }
    );
    await settle();
    assert.strictEqual(h.api.user, null);
    assert.strictEqual(h.api.authError, 'session_unavailable');
    assert.strictEqual(h.localStorage.getItem('phase1_learning_owner_v1'), 'old-user');
  });

  await test('verification error never clears any account-local learning key', async () => {
    const initial = { phase1_learning_owner_v1: 'old-user' };
    LEARNING_KEYS.forEach((key) => { initial[key] = 'preserve-' + key; });
    const h = createHarness(() => Promise.resolve({ data: null, error: new Error('jwt verify failed') }), initial);
    await settle();
    LEARNING_KEYS.forEach((key) => {
      assert.strictEqual(h.localStorage.getItem(key), 'preserve-' + key, key + ' was cleared');
      assert.ok(!h.localStorage.removed.includes(key), key + ' was removed');
    });
    assert.strictEqual(h.localStorage.getItem('phase1_learning_owner_v1'), 'old-user');
  });

  await test('device logout uses local scope and clears UI caches only after success', async () => {
    const calls = [];
    const h = createHarness(
      () => Promise.resolve({ data: { session: { user } }, error: null }),
      { tf_avatar: '🐘', tf_pinned_badge: 'badge', rg_last_login_provider: 'email' },
      (options) => { calls.push(options); return Promise.resolve({ error: null }); }
    );
    await settle();
    await h.api.doLogout();
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].scope, 'local');
    assert.strictEqual(h.localStorage.getItem('tf_avatar'), null);
    assert.strictEqual(h.localStorage.getItem('tf_pinned_badge'), null);
    assert.strictEqual(h.localStorage.getItem('rg_last_login_provider'), null);
  });

  await test('failed logout preserves account UI caches and reports the failure', async () => {
    const failure = new Error('network unavailable');
    const h = createHarness(
      () => Promise.resolve({ data: { session: { user } }, error: null }),
      { tf_avatar: '🐘', tf_pinned_badge: 'badge', rg_last_login_provider: 'email' },
      () => Promise.resolve({ error: failure })
    );
    await settle();
    const result = await h.api.doLogout();
    assert.strictEqual(result.error, failure);
    assert.strictEqual(h.localStorage.getItem('tf_avatar'), '🐘');
    assert.strictEqual(h.localStorage.getItem('tf_pinned_badge'), 'badge');
    assert.strictEqual(h.localStorage.getItem('rg_last_login_provider'), 'email');
  });

  await test('logout-all remains explicitly global', async () => {
    const calls = [];
    const h = createHarness(
      () => Promise.resolve({ data: { session: { user } }, error: null }),
      {},
      (options) => { calls.push(options); return Promise.resolve({ error: null }); }
    );
    await settle();
    await h.api.doLogoutAllDevices();
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].scope, 'global');
  });

  await test('email OTP contract is six digits with duplicate-submit guards', async () => {
    assert.ok(/maxlength="6" pattern="\[0-9\]\{6\}"/.test(otpSource));
    assert.ok(/!\/\^\\d\{6\}\$\/.test\(code\)/.test(otpSource));
    assert.ok(/otpRequestPending/.test(otpSource));
    assert.ok(/otpVerifyPending/.test(otpSource));
    assert.ok(/shouldCreateUser: true/.test(otpSource));
  });

  await test('email OTP public responses do not expose provider or account-existence errors', async () => {
    const requestFlow = otpSource.slice(otpSource.indexOf('function startOtp'), otpSource.indexOf('function verifyCode'));
    assert.ok(/暫時無法寄送驗證碼，請稍後再試/.test(requestFlow));
    assert.ok(!/setMsg\([^\n]*error\.message/.test(requestFlow));
    assert.ok(/challengePromise\.then\([\s\S]*\.catch\(failRequest\)/.test(requestFlow));
    assert.ok(/sb\.functions\.invoke\('email-otp-auth'/.test(requestFlow));
  });

  await test('successful OTP binds the returned session and resumes on the same page', async () => {
    const verifyFlow = otpSource.slice(otpSource.indexOf('function verifyCode'), otpSource.indexOf('function startCooldown'));
    assert.ok(/verifyOtp\(\{ email: otpEmail, token: code, type: 'email' \}\)/.test(verifyFlow));
    assert.ok(/res\.data\.session\.user/.test(verifyFlow));
    assert.ok(!/location\.(?:href|replace|assign)/.test(verifyFlow));
    assert.ok(/window\.SITE_AUTH\.onChange\(setUser\)/.test(otpSource));
    assert.ok(/if \(API\.user\) closeGate\(\)/.test(otpSource));
  });

  if (!process.exitCode) console.log('\n✅ Phase 1 auth session verification passed (' + passed + ' checks)');
})();
