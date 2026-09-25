#!/usr/bin/env node

import assert from 'node:assert/strict';
import { runOtpRequestFlow } from '../supabase/functions/email-otp-auth/request-flow.mjs';

const firstId = '10000000-0000-4000-8000-000000000001';
const secondId = '20000000-0000-4000-8000-000000000002';

async function run(options = {}) {
  const calls = { send: 0, confirm: 0, wait: 0, invalidate: 0 };
  const result = await runOtpRequestFlow({
    challengeId: options.challengeId || firstId,
    beginChallenge: async () => options.begin || {
      accepted: true,
      status: 'claimed',
      challenge_id: firstId,
    },
    sendEmail: async () => { calls.send++; return options.send !== false; },
    confirmDelivery: async () => { calls.confirm++; return options.confirm !== false; },
    waitForDelivery: async () => { calls.wait++; return options.wait !== false; },
    invalidateDelivery: async () => { calls.invalidate++; },
  });
  return { result, calls };
}

{
  const { result, calls } = await run();
  assert.deepEqual(result, { status: 202, body: { ok: true, challenge_id: firstId } });
  assert.deepEqual(calls, { send: 1, confirm: 1, wait: 0, invalidate: 0 });
}

{
  const { result, calls } = await run({
    challengeId: secondId,
    begin: { accepted: false, status: 'duplicate_delivered', challenge_id: firstId },
  });
  assert.deepEqual(result, { status: 202, body: { ok: true, challenge_id: firstId } });
  assert.deepEqual(calls, { send: 0, confirm: 0, wait: 0, invalidate: 0 });
}

{
  const { result, calls } = await run({
    challengeId: secondId,
    begin: { accepted: false, status: 'duplicate_in_progress', challenge_id: firstId },
  });
  assert.deepEqual(result, { status: 202, body: { ok: true, challenge_id: firstId } });
  assert.deepEqual(calls, { send: 0, confirm: 0, wait: 1, invalidate: 0 });
}

{
  const { result, calls } = await run({
    challengeId: secondId,
    begin: { accepted: false, status: 'duplicate_in_progress', challenge_id: firstId },
    wait: false,
  });
  assert.deepEqual(result, { status: 503, body: { ok: false, error: 'request_failed' } });
  assert.deepEqual(calls, { send: 0, confirm: 0, wait: 1, invalidate: 0 });
}

{
  const { result, calls } = await run({ send: false });
  assert.deepEqual(result, { status: 503, body: { ok: false, error: 'request_failed' } });
  assert.deepEqual(calls, { send: 1, confirm: 0, wait: 0, invalidate: 1 });
}

{
  const { result, calls } = await run({ confirm: false });
  assert.deepEqual(result, { status: 503, body: { ok: false, error: 'request_failed' } });
  assert.deepEqual(calls, { send: 1, confirm: 1, wait: 0, invalidate: 0 });
}

{
  const { result, calls } = await run({
    begin: { accepted: false, status: 'blocked' },
  });
  assert.deepEqual(result, { status: 429, body: { ok: false, error: 'request_rejected' } });
  assert.deepEqual(calls, { send: 0, confirm: 0, wait: 0, invalidate: 0 });
}

{
  const { result, calls } = await run({
    begin: { accepted: true, status: 'claimed', challenge_id: secondId },
  });
  assert.deepEqual(result, { status: 503, body: { ok: false, error: 'request_failed' } });
  assert.deepEqual(calls, { send: 0, confirm: 0, wait: 0, invalidate: 0 });
}

{
  let state = 'new';
  let sends = 0;
  const beginChallenge = async () => {
    if (state === 'new') {
      state = 'sending';
      return { accepted: true, status: 'claimed', challenge_id: firstId };
    }
    return { accepted: false, status: 'duplicate_in_progress', challenge_id: firstId };
  };
  const waitForDelivery = async () => {
    for (let attempt = 0; attempt < 50 && state === 'sending'; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 2));
    }
    return state === 'delivered';
  };
  const common = {
    beginChallenge,
    waitForDelivery,
    invalidateDelivery: async () => { state = 'failed'; },
  };
  const [first, duplicate] = await Promise.all([
    runOtpRequestFlow({
      ...common,
      challengeId: firstId,
      sendEmail: async () => { sends++; await new Promise((resolve) => setTimeout(resolve, 15)); return true; },
      confirmDelivery: async () => { state = 'delivered'; return true; },
    }),
    runOtpRequestFlow({
      ...common,
      challengeId: secondId,
      sendEmail: async () => { sends++; return true; },
      confirmDelivery: async () => true,
    }),
  ]);
  assert.equal(sends, 1);
  assert.deepEqual(first, { status: 202, body: { ok: true, challenge_id: firstId } });
  assert.deepEqual(duplicate, { status: 202, body: { ok: true, challenge_id: firstId } });
}

console.log('✅ Email OTP idempotent resend flow passed (9 scenarios)');
