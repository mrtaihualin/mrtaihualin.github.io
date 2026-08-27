(function (root, factory) {
  'use strict';
  var fixtures = factory();
  if (typeof module === 'object' && module.exports) module.exports = fixtures;
  else root.ReviewNeededHiddenFixtures = fixtures;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var games = ['tone', 'reading', 'listening', 'typing', 'wordorder'];

  function reviewQueueItems(label) {
    return games.map(function (game, index) {
      return {
        sourceType: 'review_queue_item', game: game, level: String(index + 1),
        itemId: 'fixture-' + game, attemptsUsed: 0, resolved: false,
        actionToken: 'review-' + game + '-' + label
      };
    });
  }

  var day1Review = reviewQueueItems('day1-valid-upstream');
  var day1Srs = [
    { sourceType: 'srs_due_snapshot', game: 'tone', level: '1', itemId: 'fixture-tone', due: true, mastered: false },
    { sourceType: 'srs_due_snapshot', game: 'tone', level: '1', itemId: 'due-only-tone', due: true, mastered: false }
  ];
  var day8Srs = games.map(function (game, index) {
    return { sourceType: 'srs_due_snapshot', game: game, level: String(index + 1), itemId: 'due-' + game, due: true, mastered: false };
  }).concat(games.map(function (game, index) {
    return { sourceType: 'srs_due_snapshot', game: game, level: String(index + 1), itemId: 'mastered-' + game, due: true, mastered: true };
  }));

  return {
    day0: { status: 'ready', reviewQueueItems: [], srsDueSnapshot: [] },
    day1: { status: 'ready', reviewQueueItems: day1Review, srsDueSnapshot: day1Srs },
    day8: {
      status: 'ready', reviewQueueItems: reviewQueueItems('day8-valid-upstream'), srsDueSnapshot: day8Srs
    },
    reviewCorrectToInitialSrs: {
      result: { outcome: 'correct', srsStateStatus: 'absent' },
      expected: { reviewQueue: 'close', srsAction: 'request-canonical-initial-route', derivedStage: 0 }
    },
    reviewCorrectExistingSrs: {
      result: {
        outcome: 'correct', srsStateStatus: 'present',
        existingSrsState: {
          sourceType: 'canonical_srs_state', game: 'tone', level: '1', itemId: 'fixture-tone',
          stage: 2, dueDate: '2026-09-03', mastered: false
        }
      }
    },
    empty: { status: 'empty', reviewQueueItems: [], srsDueSnapshot: [] },
    loading: { status: 'loading', reviewQueueItems: [], srsDueSnapshot: [] },
    error: { status: 'error', error: 'FIXTURE_READ_ERROR', reviewQueueItems: [], srsDueSnapshot: [] },
    accessDenied: { status: 'access-denied', error: 'FIXTURE_ACCESS_DENIED', reviewQueueItems: [], srsDueSnapshot: [] }
  };
});
