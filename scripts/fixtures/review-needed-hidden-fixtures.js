(function (root, factory) {
  'use strict';
  var fixtures = factory();
  if (typeof module === 'object' && module.exports) module.exports = fixtures;
  else root.ReviewNeededHiddenFixtures = fixtures;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var games = ['tone', 'reading', 'listening', 'typing', 'wordorder'];

  function rows(stage, dueDate) {
    var result = games.map(function (game, index) {
      return {
        record_type: 'srs_state', game: game, level: index + 1,
        word: 'fixture-' + game, stage: stage, due_date: dueDate,
        ever_failed: false, mastered: false
      };
    });
    result.push({ record_type: 'attempt', game: 'tone', word: 'raw-attempt-is-not-state' });
    return result;
  }

  var day8Rows = rows(2, '2026-09-03');
  games.forEach(function (game, index) {
    day8Rows.push({
      record_type: 'srs_state', game: game, level: index + 1,
      word: 'mastered-' + game, stage: 3, due_date: '2026-09-03',
      ever_failed: false, mastered: true
    });
  });

  return {
    day0: { status: 'ready', today: '2026-08-26', rows: rows(1, '2026-08-27') },
    day1: { status: 'ready', today: '2026-08-27', rows: rows(1, '2026-08-27') },
    day8: { status: 'ready', today: '2026-09-03', rows: day8Rows },
    empty: { status: 'empty', today: '2026-08-27', rows: [] },
    loading: { status: 'loading', today: '2026-08-27', rows: [] },
    error: { status: 'error', today: '2026-08-27', error: 'FIXTURE_READ_ERROR', rows: [] },
    accessDenied: { status: 'access-denied', today: '2026-08-27', error: 'FIXTURE_ACCESS_DENIED', rows: [] }
  };
});
