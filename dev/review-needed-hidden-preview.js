(function (window, document) {
  'use strict';
  var local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(String(window.location.hostname || ''));
  var params = new URLSearchParams(window.location.search || '');
  var enabled = params.get('review-needed-preview') === '1';
  if (!local || !enabled) return;

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (character) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character];
    });
  }

  var root = document.getElementById('review-needed-preview');
  var stateNode = document.getElementById('preview-state');
  var output = document.getElementById('preview-output');
  root.hidden = false;
  root.setAttribute('aria-hidden', 'false');
  output.setAttribute('tabindex', '0');

  var key = params.get('state') || 'day1';
  var fixture = window.ReviewNeededHiddenFixtures[key] || window.ReviewNeededHiddenFixtures.day1;
  stateNode.textContent = 'Fixture: ' + key + ' · state: ' + fixture.status;
  if (fixture.status !== 'ready') {
    output.textContent = fixture.error || fixture.status;
    return;
  }

  var candidate = window.ReviewNeededCandidate.createCandidate({ enabled: true, tier: 'free' });
  var plan = candidate.composeQueuePlan({
    activeStates: fixture.activeStates,
    srsDueSnapshot: fixture.srsDueSnapshot
  }, { today: fixture.today });
  var rows = plan.technicalRows.map(function (item) {
    return '<tr><td>' + escapeHtml(item.game) + '</td><td>' + escapeHtml(item.level) + '</td><td>' +
      escapeHtml(item.itemId) + '</td><td><code>' + escapeHtml(item.sourceType) + '</code></td><td>' +
      escapeHtml(item.priorityGroup) + '</td><td>' + escapeHtml(item.dueOn || 'n/a') + '</td></tr>';
  }).join('');
  var reviewState = fixture.activeStates.filter(function (item) { return item.state === 'review_needed'; })[0];
  var directive = reviewState ? candidate.buildTransitionDirective(reviewState, {
    score: 10, occurredOn: fixture.today, actionToken: 'preview-review-correct', srsStateStatus: 'absent'
  }) : null;
  output.innerHTML = '<p>Technical state groups only. The display order is diagnostic; it does not define final question placement or copy.</p>' +
    (directive ? '<p>Read-only owner directive: <code>' + escapeHtml(directive.fromState) + ' → ' +
      escapeHtml(directive.toState) + ' · derived stage ' +
      escapeHtml(directive.srsOwnerDirective.derivedStage) + '</code>. No storage or SRS mutation occurs here.</p>' : '') +
    '<table><caption>Normalized active-state queue plan</caption><thead><tr><th scope="col">Game</th><th scope="col">Level</th><th scope="col">Item</th><th scope="col">State/source</th><th scope="col">Technical group</th><th scope="col">Due on</th></tr></thead><tbody>' +
    rows + '</tbody></table>';
})(window, document);
