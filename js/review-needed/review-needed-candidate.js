/* Headless, read-only Review Needed candidate. Not loaded by public runtime. */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ReviewNeededCandidate = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var FEATURE_DEFAULT_ENABLED = false;
  var GAME_IDS = ['tone', 'reading', 'listening', 'typing', 'wordorder'];
  var VIEW_STATES = ['loading', 'ready', 'empty', 'error', 'access-denied'];
  var TIER_CONFIGS = {
    free: { id: 'free', dueRatio: 0.20, maxReviewAttempts: 1, runtimeEnabled: true },
    paid: { id: 'paid', dueRatio: 0.30, maxReviewAttempts: 4, runtimeEnabled: false }
  };

  function copy(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function errorWithCode(code, message) {
    var error = new Error(message || code);
    error.code = code;
    return error;
  }

  function normalizeGame(value) {
    var game = String(value || '').toLowerCase();
    if (game === 'word_order') game = 'wordorder';
    return GAME_IDS.indexOf(game) >= 0 ? game : null;
  }

  function itemKey(row) {
    var explicit = row && (row.item_key || row.itemKey || row.id);
    if (explicit != null && String(explicit)) return String(explicit);
    var word = row && row.word;
    if (word == null || String(word) === '') return null;
    return String(row.level == null ? '' : row.level) + '|' + String(word);
  }

  function normalizeStateRow(row) {
    if (!row || typeof row !== 'object') return null;
    var recordType = row.record_type || row.recordType;
    if (recordType && recordType !== 'srs_state') return null;
    if (!Object.prototype.hasOwnProperty.call(row, 'stage') ||
        !Object.prototype.hasOwnProperty.call(row, 'mastered')) return null;
    var game = normalizeGame(row.game);
    var key = itemKey(row);
    if (!game || !key) return null;
    var stage = Number(row.stage);
    if (!isFinite(stage) || stage < 0) return null;
    return {
      recordType: 'srs_state',
      game: game,
      itemKey: key,
      level: row.level == null ? null : row.level,
      word: row.word == null ? null : String(row.word),
      stage: Math.floor(stage),
      dueDate: String(row.due_date || row.dueDate || ''),
      mastered: row.mastered === true,
      everFailed: row.ever_failed === true || row.everFailed === true
    };
  }

  function tierConfig(tier) {
    var id = String(tier || 'free').toLowerCase();
    if (!TIER_CONFIGS[id]) throw errorWithCode('UNKNOWN_TIER');
    return copy(TIER_CONFIGS[id]);
  }

  function emptyGames() {
    var games = {};
    GAME_IDS.forEach(function (game) {
      games[game] = {
        game: game,
        history: [],
        due: [],
        selectedDue: [],
        notDueCount: 0,
        masteredCount: 0,
        dueQuota: 0,
        maxReviewAttempts: 0
      };
    });
    return games;
  }

  function sortRows(rows) {
    return rows.sort(function (a, b) {
      var byDate = String(a.dueDate).localeCompare(String(b.dueDate));
      return byDate || String(a.itemKey).localeCompare(String(b.itemKey));
    });
  }

  function buildSnapshot(rows, options) {
    options = options || {};
    var today = String(options.today || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) throw errorWithCode('INVALID_TODAY');
    var config = tierConfig(options.tier || 'free');
    if (!config.runtimeEnabled && options.allowDormantTier !== true) {
      throw errorWithCode('TIER_DISABLED', 'Dormant tier cannot be activated');
    }

    var games = emptyGames();
    var ignoredRows = 0;
    (rows || []).forEach(function (raw) {
      var row = normalizeStateRow(raw);
      if (!row) { ignoredRows += 1; return; }
      games[row.game].history.push(row);
    });

    var totals = { history: 0, due: 0, selectedDue: 0, notDue: 0, mastered: 0 };
    GAME_IDS.forEach(function (game) {
      var bucket = games[game];
      var roundSize = Number(options.roundSizeByGame && options.roundSizeByGame[game]);
      if (!isFinite(roundSize)) roundSize = Number(options.roundSize);
      if (!isFinite(roundSize)) roundSize = 5;
      roundSize = Math.max(0, Math.floor(roundSize));
      bucket.dueQuota = Math.floor(roundSize * config.dueRatio + 0.0000001);
      bucket.maxReviewAttempts = config.maxReviewAttempts;
      sortRows(bucket.history);
      bucket.history.forEach(function (row) {
        if (row.mastered) bucket.masteredCount += 1;
        else if (row.dueDate && row.dueDate <= today) bucket.due.push(row);
        else bucket.notDueCount += 1;
      });
      bucket.selectedDue = bucket.due.slice(0, Math.min(bucket.dueQuota, bucket.due.length));
      totals.history += bucket.history.length;
      totals.due += bucket.due.length;
      totals.selectedDue += bucket.selectedDue.length;
      totals.notDue += bucket.notDueCount;
      totals.mastered += bucket.masteredCount;
    });

    return {
      readOnly: true,
      tier: config.id,
      config: config,
      today: today,
      games: games,
      totals: totals,
      ignoredRows: ignoredRows
    };
  }

  function viewState(status, payload) {
    if (VIEW_STATES.indexOf(status) < 0) throw errorWithCode('UNKNOWN_VIEW_STATE');
    payload = payload || {};
    return {
      status: status,
      snapshot: payload.snapshot || null,
      error: payload.error || null
    };
  }

  function createCandidate(options) {
    options = options || {};
    if (options.enabled !== true) throw errorWithCode('FEATURE_DISABLED');
    var tier = options.tier || 'free';
    var config = tierConfig(tier);
    if (!config.runtimeEnabled && options.allowDormantTier !== true) throw errorWithCode('TIER_DISABLED');
    return {
      buildSnapshot: function (rows, snapshotOptions) {
        snapshotOptions = snapshotOptions || {};
        snapshotOptions.tier = tier;
        snapshotOptions.allowDormantTier = options.allowDormantTier === true;
        return buildSnapshot(rows, snapshotOptions);
      }
    };
  }

  return {
    FEATURE_DEFAULT_ENABLED: FEATURE_DEFAULT_ENABLED,
    GAME_IDS: GAME_IDS.slice(),
    VIEW_STATES: VIEW_STATES.slice(),
    getTierConfig: tierConfig,
    normalizeGame: normalizeGame,
    normalizeStateRow: normalizeStateRow,
    buildSnapshot: buildSnapshot,
    viewState: viewState,
    createCandidate: createCandidate
  };
});
