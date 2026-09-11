#!/usr/bin/env node
'use strict';

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { verifyLearningScore } from '../supabase/functions/score-submit/learning-score-verifier.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const roundReportSource = fs.readFileSync(path.join(root, 'js/games/round-report.js'), 'utf8');
const learningReviewSource = fs.readFileSync(path.join(root, 'js/games/learning-review.js'), 'utf8');

function runtimeFor(fixture) {
  const listeners = Object.create(null);
  const retryItems = [];
  const commitBodies = [];
  const verifierErrors = [];
  let authChange = null;
  let transportMode = 'success';
  let releaseCommit = null;

  const context = {
    console,
    Uint8Array,
    Date,
    Math,
    JSON,
    Intl,
    Promise,
    setTimeout,
    clearTimeout,
    crypto: globalThis.crypto,
    localStorage: { getItem() { return null; }, setItem() {} },
    LOGIN_FREE_REVIEW_PUBLIC_ENTRY: true,
    GAME_CONTENT_TIER: 'login',
    SITE_AUTH: { user: { id: 'fixture-owner' }, learningOwnerEpoch: 1, onChange(listener) { authChange = listener; } },
    NetworkGuard: { request(fn) { return Promise.resolve().then(fn); } },
    CustomEvent: function CustomEvent(type, options) { this.type = type; this.detail = options.detail; },
    addEventListener(type, listener) { (listeners[type] || (listeners[type] = [])).push(listener); },
    dispatchEvent(event) { (listeners[event.type] || []).slice().forEach(listener => listener(event)); },
  };
  context.window = context;
  context.globalThis = context;
  context.getSupabaseClient = () => ({
    functions: {
      invoke(name, options) {
        assert.equal(name, 'score-submit');
        const body = options.body;
        if (body.action === 'review_queue') return Promise.resolve({ data: { ok: true, items: [] }, error: null });
        commitBodies.push(body);
        let verified;
        try {
          const verifierItem = {
            ...body.item,
            wrong: Number(body.item.wrong_count || 0),
            guide: body.item.hint_used === true,
            failed: body.item.is_correct === false && Number(body.item.item_score) <= 0,
            correct: body.item.is_correct === true,
          };
          verified = verifyLearningScore({
            game: fixture.game,
            difficulty: fixture.difficulty,
            item: verifierItem,
            canonicalRows: [fixture.canonical],
          });
        } catch (error) {
          verifierErrors.push(error.code || error.message);
          return Promise.resolve({ data: null, error: { context: { status: 400 }, code: error.code } });
        }
        if (transportMode === 'failure') {
          return Promise.resolve({ data: null, error: { context: { status: 503 }, code: 'review_write_unavailable' } });
        }
        if (transportMode === 'delayed') {
          return new Promise(resolve => {
            releaseCommit = () => resolve({
              data: { ok: true, from_state: 'normal', to_state: verified.score <= 3 ? 'retry_end_round' : 'weak_4d' },
              error: null,
            });
          });
        }
        return Promise.resolve({
          data: { ok: true, from_state: 'normal', to_state: verified.score <= 3 ? 'retry_end_round' : 'weak_4d' },
          error: null,
        });
      },
    },
  });

  vm.runInNewContext(roundReportSource, context, { filename: 'round-report.js' });
  vm.runInNewContext(learningReviewSource, context, { filename: 'learning-review.js' });

  const report = context.RoundReport.create({ game_type: fixture.reportGame, difficulty: fixture.difficulty });
  const original = { id: fixture.key, ref: { source: fixture.source, key: fixture.key } };
  context.LearningReview.registerRound({
    report,
    game: fixture.game,
    level: fixture.level,
    allItems: [original],
    srsOwned: [],
    selectedReview: [],
    idOf: item => item.id,
    contentRefOf: item => item.ref,
    retry: item => retryItems.push(item),
  });

  return {
    context,
    report,
    retryItems,
    commitBodies,
    verifierErrors,
    setTransportMode(value) { transportMode = value; },
    switchOwner(id) {
      context.SITE_AUTH.user = id ? { id } : null;
      context.SITE_AUTH.learningOwnerEpoch += 1;
      if (authChange) authChange(context.SITE_AUTH.user);
    },
    releaseCommit() { assert.ok(releaseCommit, 'delayed commit is pending'); releaseCommit(); },
  };
}

const fixtures = [
  {
    game: 'tone', reportGame: 'tone', difficulty: '初', level: 1,
    source: 'game_words', key: 'tone-fixture@1',
    canonical: { content_key: 'tone-fixture@1', word: 'tone-fixture', level: '初', syllables: [{}] },
    item: { wrong_count: 3, learning_evidence: { componentWrongCounts: [3] } },
  },
  {
    game: 'reading', reportGame: 'reading', difficulty: '初', level: 1,
    source: 'game_words', key: 'reading-fixture@1',
    canonical: { content_key: 'reading-fixture@1', word: 'reading-fixture', level: '初', syllables: [{}] },
    item: { wrong_count: 3, learning_evidence: { firstCheckSyllableWrongCounts: [3] } },
  },
  {
    game: 'typing', reportGame: 'typing', difficulty: '初', level: 1,
    source: 'game_words', key: 'typing-fixture@1',
    canonical: { content_key: 'typing-fixture@1', word: 'typing-fixture', level: '初', syllables: [{}] },
    item: { wrong_count: 4, linguistic: { syls: [{}] } },
  },
  {
    game: 'word_order', reportGame: 'wordorder', difficulty: '高', level: 3,
    source: 'game_sentences', key: 'word-order-fixture',
    canonical: { th: 'word-order-fixture', wc: 3 },
    item: { wrong_count: 3, item_score: 1, learning_evidence: { hintCount: 0 } },
  },
];

for (const fixture of fixtures) {
  const runtime = runtimeFor(fixture);
  runtime.setTransportMode('delayed');
  const row = runtime.context.RoundReport.addItem(runtime.report, {
    content_ref: { source: fixture.source, key: fixture.key },
    question: fixture.key,
    is_correct: false,
    item_score: 0,
    ...fixture.item,
  });

  assert.equal(row.key, row.content_ref.key, fixture.game + ' preserves the exact verifier identity');
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(runtime.retryItems.length, 0, fixture.game + ' never schedules a ghost Retry before acknowledgement');
  assert.equal(runtime.commitBodies.length, 1, fixture.game + ' reaches score-submit before acknowledgement');
  assert.deepEqual(runtime.verifierErrors, [], fixture.game + ' passes the real verifier');
  let advanced = 0;
  const advancePromise = runtime.context.LearningReview.advance(runtime.report, () => { advanced += 1; });
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(advanced, 0, fixture.game + ' holds the next-question boundary before acknowledgement');
  runtime.releaseCommit();
  await advancePromise;
  assert.equal(advanced, 1, fixture.game + ' advances exactly once after acknowledgement');
  assert.equal(runtime.retryItems.length, 1, fixture.game + ' schedules Retry only after server acknowledgement');
  assert.equal(runtime.commitBodies[0].item.key, fixture.key, fixture.game + ' sends the canonical key to score-submit');
}

{
  const fixture = fixtures[0];
  const runtime = runtimeFor(fixture);
  assert.throws(() => runtime.context.RoundReport.addItem(runtime.report, {
    key: 'mismatch', content_ref: { source: fixture.source, key: fixture.key },
  }), /CONTENT_REF_IDENTITY_MISMATCH/);
  assert.throws(() => runtime.context.RoundReport.addItem(runtime.report, {
    content_ref: { source: fixture.source, key: '' },
  }), /CONTENT_REF_KEY_INVALID/);
}

{
  const fixture = fixtures[3];
  const runtime = runtimeFor(fixture);
  runtime.setTransportMode('failure');
  runtime.context.RoundReport.addItem(runtime.report, {
    content_ref: { source: fixture.source, key: fixture.key },
    question: fixture.key,
    is_correct: false,
    item_score: 0,
    ...fixture.item,
  });
  await assert.rejects(runtime.context.LearningReview.settle(runtime.report), /REVIEW_REQUEST_FAILED/);
  assert.equal(runtime.retryItems.length, 0, 'failed commit cannot create a ghost Retry');
  const operationId = runtime.commitBodies[0].operation_id;
  runtime.setTransportMode('success');
  await runtime.context.LearningReview.settle(runtime.report);
  assert.equal(runtime.retryItems.length, 1, 'round recovery schedules Retry after the recovered acknowledgement');
  assert.ok(runtime.commitBodies.every(body => body.operation_id === operationId), 'recovery reuses the same idempotency key');
}

{
  const runtime = runtimeFor(fixtures[0]);
  assert.equal(runtime.context.LearningReview.runtimeEnabled(), true);
  runtime.context.GAME_CONTENT_TIER = 'paid';
  assert.equal(runtime.context.LearningReview.runtimeEnabled(), false, 'Paid never enters the Free Review owner');
  runtime.context.GAME_CONTENT_TIER = 'login';
  runtime.context.SITE_AUTH.user = null;
  assert.equal(runtime.context.LearningReview.runtimeEnabled(), false, 'Guest never enters the Login Free Review owner');
}

{
  const fixture = fixtures[0];
  const runtime = runtimeFor(fixture);
  runtime.setTransportMode('delayed');
  runtime.context.RoundReport.addItem(runtime.report, {
    content_ref: { source: fixture.source, key: fixture.key },
    question: fixture.key,
    is_correct: false,
    item_score: 0,
    ...fixture.item,
  });
  await new Promise(resolve => setTimeout(resolve, 0));
  runtime.switchOwner('other-owner');
  runtime.releaseCommit();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(runtime.retryItems.length, 0, 'a stale acknowledgement cannot leak Retry across accounts');
  assert.equal((await runtime.context.LearningReview.settle(runtime.report)).length, 0);
}

console.log('LOGIN_FREE_LEARNING_CONTRACT_E2E_PASS 4_GAMES');
