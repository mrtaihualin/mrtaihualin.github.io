(function (window, document) {
  'use strict';
  var local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(String(window.location.hostname || ''));
  var params = new URLSearchParams(window.location.search || '');
  var enabled = params.get('review-needed-preview') === '1';
  if (!local || !enabled) return;

  var root = document.getElementById('review-needed-preview');
  var stateNode = document.getElementById('preview-state');
  var output = document.getElementById('preview-output');
  root.hidden = false;
  root.setAttribute('aria-hidden', 'false');

  var key = params.get('state') || 'day1';
  var fixture = window.ReviewNeededHiddenFixtures[key] || window.ReviewNeededHiddenFixtures.day1;
  stateNode.textContent = 'Fixture: ' + key + ' · state: ' + fixture.status;
  if (fixture.status !== 'ready') {
    output.textContent = fixture.error || fixture.status;
    return;
  }

  var candidate = window.ReviewNeededCandidate.createCandidate({ enabled: true, tier: 'free' });
  var snapshot = candidate.composeQueue({
    reviewQueueItems: fixture.reviewQueueItems,
    srsDueSnapshot: fixture.srsDueSnapshot
  });
  var rows = snapshot.queue.map(function (item) {
    return '<tr><td>' + item.game + '</td><td>' + item.level + '</td><td>' + item.itemId +
      '</td><td><code>' + item.sourceType + '</code></td><td>' + (item.alsoSrsDue ? 'yes' : 'no') +
      '</td><td>' + (item.attemptsRemaining == null ? 'n/a' : item.attemptsRemaining) + '</td></tr>';
  }).join('');
  var reviewOnly = snapshot.queue.filter(function (item) {
    return item.sourceType === 'review_needed' && !item.alsoSrsDue;
  })[0];
  var initialDirective = reviewOnly ? window.ReviewNeededCandidate.buildReviewResolutionDirective(reviewOnly, {
    outcome: 'correct', srsStateStatus: 'absent'
  }) : null;
  output.innerHTML = '<p>Technical sources stay separate. Review rows precede remaining SRS Due rows; this preview performs no resolution or SRS transition.</p>' +
    (initialDirective ? '<p>Read-only correct-result directive: <code>' + initialDirective.reviewQueue +
      ' Review queue → ' + initialDirective.srsAction + ' → derived stage ' +
      initialDirective.srsInitialRoute.derivedStage + '</code>. The SRS owner resolves its first checkpoint.</p>' : '') +
    '<table><caption>Composed read-only fixture queue</caption><thead><tr><th scope="col">Game</th><th scope="col">Level</th><th scope="col">Item</th><th scope="col">Source/type</th><th scope="col">Also SRS Due</th><th scope="col">Review attempts remaining</th></tr></thead><tbody>' +
    rows + '</tbody></table>';
})(window, document);
