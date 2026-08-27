(function (root, factory) {
  'use strict';
  var fixtures = factory();
  if (typeof module === 'object' && module.exports) module.exports = fixtures;
  else root.ReviewNeededHiddenFixtures = fixtures;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function active(state, overrides) {
    var row = Object.assign({
      sourceType: 'active_learning_state', ownerKey: 'fixture-owner', game: 'tone', level: '1',
      itemId: 'fixture-item', state: state, stateToken: 'state-' + state,
      dueOn: '', roundToken: '', retryOrdinal: null
    }, overrides || {});
    if (state === 'retry_end_round' && !(overrides && Object.prototype.hasOwnProperty.call(overrides, 'roundToken'))) {
      row.roundToken = 'fixture-round';
      row.retryOrdinal = 1;
    }
    return row;
  }

  var day1States = [
    active('next_day_check', { game: 'tone', itemId: 'next-tone', dueOn: '2026-08-28' }),
    active('review_needed', { game: 'reading', level: '2', itemId: 'review-reading', dueOn: '2026-08-28' }),
    active('weak_4d', { game: 'listening', level: '3', itemId: 'weak-listening', dueOn: '2026-08-28' }),
    active('normal', { game: 'typing', level: '4', itemId: 'normal-typing' }),
    active('retry_end_round', { game: 'wordorder', level: '5', itemId: 'retry-wordorder', roundToken: 'round-day1', retryOrdinal: 1 }),
    active('srs', { game: 'tone', level: '2', itemId: 'srs-tone', stateToken: 'srs-tone-state' }),
    active('review_needed', { game: 'reading', level: '3', itemId: 'future-review', dueOn: '2026-08-29' })
  ];

  return {
    active: active,
    day0: { status: 'ready', today: '2026-08-27', activeStates: [], srsDueSnapshot: [] },
    day1: {
      status: 'ready', today: '2026-08-28', activeStates: day1States,
      srsDueSnapshot: [{
        sourceType: 'srs_due_snapshot', ownerKey: 'fixture-owner', game: 'tone', level: '2',
        itemId: 'srs-tone', due: true, mastered: false
      }]
    },
    day8: {
      status: 'ready', today: '2026-09-04',
      activeStates: [
        active('review_needed', { game: 'tone', itemId: 'review-day8', dueOn: '2026-09-04' }),
        active('weak_4d', { game: 'reading', level: '2', itemId: 'weak-day8', dueOn: '2026-09-04' }),
        active('srs', { game: 'listening', level: '3', itemId: 'srs-due-day8' }),
        active('srs', { game: 'typing', level: '4', itemId: 'srs-mastered-day8' })
      ],
      srsDueSnapshot: [
        { sourceType: 'srs_due_snapshot', ownerKey: 'fixture-owner', game: 'listening', level: '3', itemId: 'srs-due-day8', due: true, mastered: false },
        { sourceType: 'srs_due_snapshot', ownerKey: 'fixture-owner', game: 'typing', level: '4', itemId: 'srs-mastered-day8', due: true, mastered: true }
      ]
    },
    existingSrs: {
      sourceType: 'canonical_srs_state', ownerKey: 'fixture-owner', game: 'tone', level: '1',
      itemId: 'fixture-item', stateToken: 'canonical-srs-existing', stage: 2,
      dueDate: '2026-09-03', mastered: false
    },
    empty: { status: 'empty', activeStates: [], srsDueSnapshot: [] },
    loading: { status: 'loading', activeStates: [], srsDueSnapshot: [] },
    error: { status: 'error', error: 'FIXTURE_READ_ERROR', activeStates: [], srsDueSnapshot: [] },
    accessDenied: { status: 'access-denied', error: 'FIXTURE_ACCESS_DENIED', activeStates: [], srsDueSnapshot: [] }
  };
});
