'use strict';

const assert = require('assert');
const Candidate = require('../js/review-needed/review-needed-candidate.js');
const Integration = require('../js/games/review-needed-integration.js');

let passed = 0;
async function check(name, fn) {
  await fn();
  passed += 1;
  process.stdout.write('PASS ' + name + '\n');
}

function state(identity, name, token, extra) {
  return Object.assign({
    sourceType: 'active_learning_state', ownerKey: identity.ownerKey, game: identity.game,
    level: identity.level, itemId: identity.itemId, state: name, stateToken: token,
    dueOn: '', roundToken: '', retryOrdinal: null, reviewAttemptsUsed: null
  }, extra || {});
}

function canonical(identity, token) {
  return {
    sourceType: 'canonical_srs_state', ownerKey: identity.ownerKey, game: identity.game,
    level: identity.level, itemId: identity.itemId, stateToken: token,
    stage: 1, dueDate: '2026-08-28', mastered: false
  };
}

function report(game, clientScore, ordinal) {
  const normalized = Integration.normalizeGame(game);
  return {
    schema_version: 'round-report-v1', round_id: 'round-' + game, game_type: game,
    difficulty: '初', items: [{
      content_ref: { source: 'game_words', key: 'word-' + normalized + '@1' },
      ordinal: ordinal || 1,
      learning_score: clientScore
    }]
  };
}

function fakeOwner(initialByGame, verifiedScores, resolutionCounts) {
  const commits = new Map();
  const srsCalls = [];
  verifiedScores = verifiedScores || {};
  resolutionCounts = resolutionCounts || {};
  return {
    atomicAcrossPreSrsAndSrs: true,
    idempotentByActionToken: true,
    compareAndSwapStateToken: true,
    async resolveContentRef(input) {
      const count = Object.prototype.hasOwnProperty.call(resolutionCounts, input.game) ? resolutionCounts[input.game] : 1;
      return {
        matchCount: count,
        itemId: count === 1 ? 'item-' + input.game : null,
        contentRef: count === 1 ? { source: input.contentRef.source, key: input.contentRef.key.replace(/@1$/, '@初') } : null
      };
    },
    async verifyLearningScore(input) {
      const score = Object.prototype.hasOwnProperty.call(verifiedScores, input.game) ? verifiedScores[input.game] : 7;
      return { serverVerified: true, verifiedBy: 'edge:' + input.game + ':v1', score };
    },
    async readSnapshot(identity) {
      const row = initialByGame[identity.game];
      return {
        activeState: row,
        canonicalSrsStatus: row.state === 'srs' ? 'present' : 'absent',
        canonicalSrsState: row.state === 'srs' ? canonical(identity, row.stateToken) : null
      };
    },
    async commitTransition(input) {
      const old = commits.get(input.actionToken);
      if (old) return Object.assign({}, old, { idempotent: true });
      assert.strictEqual(input.expectedStateToken, input.directive.expectedStateToken);
      assert.strictEqual(input.atomicAcrossPreSrsAndSrs, true);
      const out = { idempotent: false, target: input.directive.toState, game: input.identity.game };
      commits.set(input.actionToken, out);
      return out;
    },
    async commitSrsEvidence(input) {
      assert.strictEqual(input.noBackflow, true);
      srsCalls.push(input);
      return { owner: 'srs', game: input.identity.game, score: input.evidence.score };
    },
    commits,
    srsCalls
  };
}

(async function () {
  await check('feature is default OFF and rejects non-atomic owners', async () => {
    assert.strictEqual(Integration.FEATURE_DEFAULT_ENABLED, false);
    assert.throws(() => Integration.create({ enabled: false }), /FEATURE_DISABLED/);
    assert.throws(() => Integration.create({ enabled: true, candidate: Candidate, owner: {} }), /ATOMIC_OWNER_UNAVAILABLE/);
  });

  await check('existing content_ref is mandatory and zero/multiple stable matches fail closed', async () => {
    const identity = { ownerKey: 'owner', game: 'tone', level: '1', itemId: 'item-tone' };
    const owner = fakeOwner({ tone: state(identity, 'normal', 'n1') });
    const bridge = Integration.create({ enabled: true, candidate: Candidate, owner });
    await assert.rejects(() => bridge.processReport({ schema_version: 'round-report-v1', round_id: 'r', game_type: 'tone', difficulty: '初', items: [{}] }, { ownerKey: 'owner', occurredOn: '2026-08-27' }), error => error.code === 'MISSING_CONTENT_REF');
    const missing = Integration.create({ enabled: true, candidate: Candidate, owner: fakeOwner({ tone: state(identity, 'normal', 'n1') }, {}, { tone: 0 }) });
    const duplicate = Integration.create({ enabled: true, candidate: Candidate, owner: fakeOwner({ tone: state(identity, 'normal', 'n1') }, {}, { tone: 2 }) });
    await assert.rejects(() => missing.processReport(report('tone', 10), { ownerKey: 'owner', occurredOn: '2026-08-27' }), error => error.code === 'CONTENT_REF_NOT_UNIQUE');
    await assert.rejects(() => duplicate.processReport(report('tone', 10), { ownerKey: 'owner', occurredOn: '2026-08-27' }), error => error.code === 'CONTENT_REF_NOT_UNIQUE');
  });

  await check('client score is ignored and only a server-verified per-game score is routed', async () => {
    const identity = { ownerKey: 'owner', game: 'tone', level: '1', itemId: 'item-tone' };
    const owner = fakeOwner({ tone: state(identity, 'normal', 'n1') }, { tone: 10 });
    const bridge = Integration.create({ enabled: true, candidate: Candidate, owner });
    const out = await bridge.processReport(report('tone', 0), { ownerKey: 'owner', occurredOn: '2026-08-27' });
    assert.strictEqual(out[0].target, 'srs');
    owner.verifyLearningScore = async () => ({ serverVerified: false, verifiedBy: 'client', score: 10 });
    await assert.rejects(() => bridge.processReport(report('tone', 10, 2), { ownerKey: 'owner', occurredOn: '2026-08-27' }), error => error.code === 'UNVERIFIED_LEARNING_SCORE');
  });

  await check('all five real game aliases map to isolated owner identities', async () => {
    const games = ['tone', 'reading', 'listening', 'typing', 'word_order'];
    const rows = {};
    games.forEach(game => {
      const normalized = Integration.normalizeGame(game);
      const identity = { ownerKey: 'owner', game: normalized, level: '1', itemId: 'item-' + normalized };
      rows[normalized] = state(identity, 'normal', 'token-' + normalized);
    });
    const scores = {};
    Object.keys(rows).forEach(game => { scores[game] = 7; });
    const owner = fakeOwner(rows, scores);
    const bridge = Integration.create({ enabled: true, candidate: Candidate, owner });
    for (const game of games) {
      const out = await bridge.processReport(report(game, 7), { ownerKey: 'owner', occurredOn: '2026-08-27' });
      assert.deepStrictEqual(out.map(row => row.target), ['weak_4d']);
    }
    assert.strictEqual(owner.commits.size, 5);
  });

  await check('normal 10 emits the canonical stage-0 owner transition and replay is idempotent', async () => {
    const identity = { ownerKey: 'owner', game: 'tone', level: '1', itemId: 'item-tone' };
    const owner = fakeOwner({ tone: state(identity, 'normal', 'normal-token') }, { tone: 10 });
    const bridge = Integration.create({ enabled: true, candidate: Candidate, owner });
    const first = await bridge.processReport(report('tone', 10), { ownerKey: 'owner', occurredOn: '2026-08-27' });
    const replay = await bridge.processReport(report('tone', 10), { ownerKey: 'owner', occurredOn: '2026-08-27' });
    assert.strictEqual(first[0].target, 'srs');
    assert.strictEqual(replay[0].idempotent, true);
    assert.strictEqual(owner.commits.size, 1);
  });

  await check('in-SRS evidence bypasses pre-SRS candidate and cannot backflow', async () => {
    const identity = { ownerKey: 'owner', game: 'listening', level: '1', itemId: 'item-listening' };
    const owner = fakeOwner({ listening: state(identity, 'srs', 'srs-token') }, { listening: 0 });
    const bridge = Integration.create({ enabled: true, candidate: Candidate, owner });
    const out = await bridge.processReport(report('listening', 0), { ownerKey: 'owner', occurredOn: '2026-08-27' });
    assert.deepStrictEqual(out, [{ owner: 'srs', game: 'listening', score: 0 }]);
    assert.strictEqual(owner.commits.size, 0);
    assert.strictEqual(owner.srsCalls.length, 1);
  });

  await check('paid runtime and noncanonical score ranges fail closed', async () => {
    const identity = { ownerKey: 'owner', game: 'typing', level: '1', itemId: 'item-typing' };
    const owner = fakeOwner({ typing: state(identity, 'normal', 'n') }, { typing: 11 });
    assert.throws(() => Integration.create({ enabled: true, tier: 'paid', candidate: Candidate, owner }), /PAID_RUNTIME_DISABLED/);
    const bridge = Integration.create({ enabled: true, candidate: Candidate, owner });
    await assert.rejects(() => bridge.processReport(report('typing', 11), { ownerKey: 'owner', occurredOn: '2026-08-27' }), error => error.code === 'MISSING_CANONICAL_LEARNING_SCORE');
  });

  process.stdout.write('REVIEW_NEEDED_INTEGRATION_PASS ' + passed + '\n');
})().catch(error => {
  console.error(error && error.stack || error);
  process.exit(1);
});
