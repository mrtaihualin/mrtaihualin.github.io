/* Schema-neutral, read-only normalized input adapter. Contains no storage or network binding. */
(function (root, factory) {
  'use strict';
  var contract = root.ReviewNeededCandidate;
  if (typeof module === 'object' && module.exports) {
    contract = require('./review-needed-candidate.js');
    module.exports = factory(contract);
  } else root.ReviewNeededReadAdapter = factory(contract);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (contract) {
  'use strict';

  var INPUT_CONTRACT = {
    mode: 'normalized-read-only',
    storageBinding: null,
    activeStateFields: [
      'sourceType', 'ownerKey', 'game', 'level', 'itemId', 'state', 'stateToken',
      'dueOn', 'roundToken', 'retryOrdinal'
    ],
    srsDueSnapshotFields: [
      'sourceType', 'ownerKey', 'game', 'level', 'itemId', 'due', 'mastered'
    ],
    canonicalSrsStateFields: [
      'sourceType', 'ownerKey', 'game', 'level', 'itemId', 'stateToken',
      'stage', 'dueDate', 'mastered'
    ]
  };

  function copy(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function pick(row, fields) {
    var mapped = {};
    fields.forEach(function (field) {
      if (Object.prototype.hasOwnProperty.call(row || {}, field)) mapped[field] = row[field];
    });
    return mapped;
  }

  function getInputContract() {
    return copy(INPUT_CONTRACT);
  }

  function mapActiveState(row) {
    var mapped = pick(row, INPUT_CONTRACT.activeStateFields);
    contract.normalizeActiveState(mapped);
    return mapped;
  }

  function mapSrsDueSnapshot(row) {
    var mapped = pick(row, INPUT_CONTRACT.srsDueSnapshotFields);
    contract.normalizeSrsDueSnapshot(mapped);
    return mapped;
  }

  function mapCanonicalSrsState(row) {
    var mapped = pick(row, INPUT_CONTRACT.canonicalSrsStateFields);
    contract.normalizeCanonicalSrsState(mapped);
    return mapped;
  }

  function adapt(payload) {
    if (!payload || !Array.isArray(payload.activeStates) || !Array.isArray(payload.srsDueSnapshot)) {
      var error = new Error('NORMALIZED_INPUT_INVALID');
      error.code = 'NORMALIZED_INPUT_INVALID';
      throw error;
    }
    return {
      activeStates: payload.activeStates.map(mapActiveState),
      srsDueSnapshot: payload.srsDueSnapshot.map(mapSrsDueSnapshot)
    };
  }

  function classifyError(error) {
    var status = Number(error && (error.status || error.statusCode));
    var code = String(error && error.code || '').toUpperCase();
    if (status === 401 || status === 403 || code === 'ACCESS_DENIED') return 'access-denied';
    return 'error';
  }

  return {
    getInputContract: getInputContract,
    mapActiveState: mapActiveState,
    mapSrsDueSnapshot: mapSrsDueSnapshot,
    mapCanonicalSrsState: mapCanonicalSrsState,
    adapt: adapt,
    classifyError: classifyError
  };
});
