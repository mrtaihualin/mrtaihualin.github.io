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
  var snapshot = candidate.buildSnapshot(fixture.rows, { today: fixture.today, roundSize: 5 });
  var rows = window.ReviewNeededCandidate.GAME_IDS.map(function (game) {
    var item = snapshot.games[game];
    return '<tr><td>' + game + '</td><td>' + item.history.length + '</td><td>' +
      item.due.length + '</td><td>' + item.selectedDue.length + '</td><td>' +
      item.masteredCount + '</td><td>' + item.maxReviewAttempts + '</td></tr>';
  }).join('');
  output.innerHTML = '<p>Tier config: <code>Due ' + (snapshot.config.dueRatio * 100) +
    '% / Review Needed ' + snapshot.config.maxReviewAttempts + '</code></p>' +
    '<table><caption>Technical fixture summary by isolated game</caption><thead><tr><th scope="col">Game</th><th scope="col">History</th><th scope="col">Due</th><th scope="col">Selected due</th><th scope="col">Mastered</th><th scope="col">Attempt limit</th></tr></thead><tbody>' +
    rows + '</tbody></table>';
})(window, document);
