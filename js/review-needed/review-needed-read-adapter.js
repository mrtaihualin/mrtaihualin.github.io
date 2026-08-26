/* Read-only adapter for the current tone_srs_state contract. */
(function (root, factory) {
  'use strict';
  var contract = root.ReviewNeededCandidate;
  if (typeof module === 'object' && module.exports) {
    contract = require('./review-needed-candidate.js');
    module.exports = factory(contract);
  } else root.ReviewNeededReadAdapter = factory(contract);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (contract) {
  'use strict';

  var READ_MAPPING = {
    table: 'tone_srs_state',
    selectFields: ['game', 'level', 'word', 'stage', 'due_date', 'ever_failed', 'mastered'],
    userFilter: 'user_id',
    identityFields: ['game', 'level', 'word'],
    recordType: 'srs_state',
    mode: 'read-only'
  };
  var SELECT_FIELDS = READ_MAPPING.selectFields.join(',');

  function copy(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function getReadMapping() {
    return copy(READ_MAPPING);
  }

  function mapReadRow(row) {
    row = row || {};
    return {
      record_type: READ_MAPPING.recordType,
      game: row.game,
      level: row.level,
      word: row.word,
      stage: row.stage,
      due_date: row.due_date,
      ever_failed: row.ever_failed,
      mastered: row.mastered
    };
  }

  function classifyError(error) {
    var status = Number(error && (error.status || error.statusCode));
    var code = String(error && error.code || '').toUpperCase();
    if (status === 401 || status === 403 || code === 'PGRST301' || code === '42501') return 'access-denied';
    return 'error';
  }

  function readRows(client, userId) {
    if (!client || typeof client.from !== 'function') return Promise.reject(new Error('READ_CLIENT_UNAVAILABLE'));
    if (!userId) {
      var denied = new Error('READ_ACCESS_DENIED');
      denied.status = 403;
      return Promise.reject(denied);
    }
    var query = client.from(READ_MAPPING.table).select(SELECT_FIELDS).eq(READ_MAPPING.userFilter, String(userId));
    return Promise.resolve(query).then(function (result) {
      if (result && result.error) throw result.error;
      if (!result || !Array.isArray(result.data)) throw new Error('READ_RESULT_INVALID');
      return result.data.map(mapReadRow);
    });
  }

  function load(client, userId, options) {
    options = options || {};
    return Promise.resolve().then(function () {
      return readRows(client, userId);
    }).then(function (rows) {
      var snapshot = contract.buildSnapshot(rows, options);
      return contract.viewState(snapshot.totals.history ? 'ready' : 'empty', { snapshot: snapshot });
    }).catch(function (error) {
      return contract.viewState(classifyError(error), { error: String(error && error.message || error) });
    });
  }

  return {
    SELECT_FIELDS: SELECT_FIELDS,
    getReadMapping: getReadMapping,
    mapReadRow: mapReadRow,
    classifyError: classifyError,
    readRows: readRows,
    load: load
  };
});
