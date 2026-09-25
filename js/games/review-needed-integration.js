/* Hidden bridge from the existing RoundReport event to the one atomic learning-state owner.
 * Default OFF. This module performs no storage, network, Supabase, Auth, or SRS mutation itself.
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ReviewNeededIntegration = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var FEATURE_DEFAULT_ENABLED = false;
  var GAME_ALIASES = { tone: 'tone', reading: 'reading', listening: 'listening', typing: 'typing', wordorder: 'wordorder', word_order: 'wordorder' };
  var LEVEL_ALIASES = { '1': '1', '2': '2', '3': '3', '初': '1', '中': '2', '高': '3' };

  function fail(code, message) {
    var error = new Error(message || code);
    error.code = code;
    throw error;
  }

  function requireString(value, code) {
    if (value === null || value === undefined || String(value) === '') fail(code);
    return String(value);
  }

  function normalizeGame(value) {
    var game = GAME_ALIASES[String(value || '').toLowerCase()];
    if (!game) fail('UNKNOWN_GAME');
    return game;
  }

  function normalizeLevel(value) {
    var level = LEVEL_ALIASES[String(value == null ? '' : value)];
    if (!level) fail('UNKNOWN_LEVEL');
    return level;
  }

  function normalizeLearningScore(value) {
    if (typeof value !== 'number' || !isFinite(value) || Math.floor(value) !== value || value < 0 || value > 10) {
      fail('MISSING_CANONICAL_LEARNING_SCORE', 'an explicit integer learning_score from 0 to 10 is required');
    }
    return value;
  }

  function normalizeContentRef(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail('MISSING_CONTENT_REF');
    var source = value.source;
    var key = value.key;
    if (source !== 'game_words' && source !== 'game_sentences') fail('UNKNOWN_CONTENT_REF_SOURCE');
    if (typeof key !== 'string' || !key || key.trim() !== key) fail('MISSING_CONTENT_REF_KEY');
    return { source: source, key: key };
  }

  function reportItems(report) {
    if (!report || report.schema_version !== 'round-report-v1' || !Array.isArray(report.items)) fail('INVALID_ROUND_REPORT');
    requireString(report.round_id, 'MISSING_ROUND_ID');
    return report.items;
  }

  async function resultEvidence(report, item, index, context, owner) {
    var game = normalizeGame(report.game_type);
    var level = normalizeLevel(item.learning_level == null ? report.difficulty : item.learning_level);
    var contentRef = normalizeContentRef(item.content_ref);
    var ownerKey = requireString(context && context.ownerKey, 'MISSING_OWNER_KEY');
    var occurredOn = requireString(context && context.occurredOn, 'MISSING_CALENDAR_DATE');
    var ordinal = Number(item.ordinal == null ? index + 1 : item.ordinal);
    if (!isFinite(ordinal) || ordinal < 1 || Math.floor(ordinal) !== ordinal) fail('INVALID_ITEM_ORDINAL');
    var resolved = await owner.resolveContentRef({
      ownerKey: ownerKey, game: game, level: level, contentRef: contentRef
    });
    if (!resolved || resolved.matchCount !== 1 || !resolved.itemId || !resolved.contentRef) fail('CONTENT_REF_NOT_UNIQUE');
    var canonicalContentRef = normalizeContentRef(resolved.contentRef);
    if (canonicalContentRef.source !== contentRef.source || canonicalContentRef.key !== contentRef.key) fail('CONTENT_REF_IDENTITY_MISMATCH');
    var verified = await owner.verifyLearningScore({
      ownerKey: ownerKey, game: game, level: level, contentRef: contentRef,
      report: report, item: item, ordinal: ordinal
    });
    if (!verified || verified.serverVerified !== true ||
        !/^edge:[a-z0-9][a-z0-9_-]{0,63}:v[0-9]+$/.test(String(verified.verifiedBy || ''))) {
      fail('UNVERIFIED_LEARNING_SCORE');
    }
    return {
      identity: { ownerKey: ownerKey, game: game, level: level, itemId: requireString(resolved.itemId, 'MISSING_STABLE_ITEM_ID') },
      evidence: {
        score: normalizeLearningScore(verified.score),
        scoreVerifiedBy: String(verified.verifiedBy),
        contentRef: canonicalContentRef,
        occurredOn: occurredOn,
        actionToken: String(report.round_id) + ':' + String(ordinal)
      }
    };
  }

  function entersSrs(candidate, state, score) {
    if (!state || state.state === 'srs') return false;
    return candidate.scoreBand(score) === '10';
  }

  function create(options) {
    options = options || {};
    if (options.enabled !== true) fail('FEATURE_DISABLED');
    if (options.tier && options.tier !== 'free') fail('PAID_RUNTIME_DISABLED');
    var candidate = options.candidate;
    var owner = options.owner;
    if (!candidate || typeof candidate.buildTransitionDirective !== 'function' || typeof candidate.scoreBand !== 'function') {
      fail('CANDIDATE_UNAVAILABLE');
    }
    if (!owner || typeof owner.readSnapshot !== 'function' || typeof owner.commitTransition !== 'function' ||
        typeof owner.commitSrsEvidence !== 'function' || typeof owner.resolveContentRef !== 'function' ||
        typeof owner.verifyLearningScore !== 'function') fail('ATOMIC_OWNER_UNAVAILABLE');
    if (owner.atomicAcrossPreSrsAndSrs !== true || owner.idempotentByActionToken !== true || owner.compareAndSwapStateToken !== true) {
      fail('UNSAFE_OWNER_CONTRACT');
    }

    async function processItem(report, item, index, context) {
      var mapped = await resultEvidence(report, item, index, context, owner);
      var snapshot = await owner.readSnapshot(mapped.identity);
      if (!snapshot || !snapshot.activeState) fail('ACTIVE_STATE_UNAVAILABLE');
      if (snapshot.activeState.state === 'srs') {
        return owner.commitSrsEvidence({
          identity: mapped.identity,
          evidence: mapped.evidence,
          expectedStateToken: snapshot.activeState.stateToken,
          noBackflow: true
        });
      }
      if (entersSrs(candidate, snapshot.activeState, mapped.evidence.score)) {
        if (snapshot.canonicalSrsStatus !== 'absent' && snapshot.canonicalSrsStatus !== 'present') fail('UNKNOWN_CANONICAL_SRS_PRESENCE');
        mapped.evidence.srsStateStatus = snapshot.canonicalSrsStatus;
        if (snapshot.canonicalSrsStatus === 'present') mapped.evidence.existingSrsState = snapshot.canonicalSrsState;
      }
      var directive = candidate.buildTransitionDirective(snapshot.activeState, mapped.evidence, { tier: 'free' });
      return owner.commitTransition({
        identity: mapped.identity,
        directive: directive,
        expectedStateToken: snapshot.activeState.stateToken,
        actionToken: mapped.evidence.actionToken,
        atomicAcrossPreSrsAndSrs: true
      });
    }

    async function processReport(report, context) {
      var items = reportItems(report);
      var results = [];
      for (var index = 0; index < items.length; index += 1) {
        results.push(await processItem(report, items[index], index, context));
      }
      return results;
    }

    return { processReport: processReport, processItem: processItem };
  }

  return {
    FEATURE_DEFAULT_ENABLED: FEATURE_DEFAULT_ENABLED,
    normalizeGame: normalizeGame,
    normalizeLevel: normalizeLevel,
    normalizeContentRef: normalizeContentRef,
    normalizeLearningScore: normalizeLearningScore,
    resultEvidence: resultEvidence,
    create: create
  };
});
