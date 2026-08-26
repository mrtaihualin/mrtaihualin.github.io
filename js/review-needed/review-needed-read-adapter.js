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

  var SELECT_FIELDS = 'game,level,word,stage,due_date,ever_failed,mastered';

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
    var query = client.from('tone_srs_state').select(SELECT_FIELDS).eq('user_id', String(userId));
    return Promise.resolve(query).then(function (result) {
      if (result && result.error) throw result.error;
      return (result && result.data || []).map(function (row) {
        var copy = Object.assign({}, row);
        copy.record_type = 'srs_state';
        return copy;
      });
    });
  }

  function load(client, userId, options) {
    options = options || {};
    return readRows(client, userId).then(function (rows) {
      var snapshot = contract.buildSnapshot(rows, options);
      return contract.viewState(snapshot.totals.history ? 'ready' : 'empty', { snapshot: snapshot });
    }).catch(function (error) {
      return contract.viewState(classifyError(error), { error: String(error && error.message || error) });
    });
  }

  return {
    SELECT_FIELDS: SELECT_FIELDS,
    classifyError: classifyError,
    readRows: readRows,
    load: load
  };
});
