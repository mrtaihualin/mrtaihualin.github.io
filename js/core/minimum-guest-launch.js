// Minimum Guest Launch (PD-MGL-01).
// This reversible client gate keeps the existing account/SRS/personal systems
// intact while the public launch exposes only the six Guest game loops.
(function (window, document) {
  'use strict';

  window.MRT_MINIMUM_GUEST_LAUNCH = true;
  document.documentElement.classList.add('minimum-guest-launch');

  var path = String(window.location.pathname || '').toLowerCase();
  var parked = /\/(?:my-progress|vault|all-board|leaderboard|reading-board|listening-board|typing-board|word-order-board|lego-board|mix-board|games-challenge|mix)\.html$/;
  if (parked.test(path)) {
    window.location.replace('/games.html?guest_launch=1');
    return;
  }

  var style = document.createElement('style');
  style.setAttribute('data-minimum-guest-launch', '1');
  style.textContent = [
    '#rg-login-slot,#rg-cta-login,#tf-cta-login,#tf-challenge-banner,',
    '#tf-streak-chip,#rg-streak-chip,[id*="vault-btn-slot"],',
    '[data-mgl-parked],a[href="/my-progress.html"],a[href="my-progress.html"],',
    'a[href="vault.html"],a[href="all-board.html"],a[href="leaderboard.html"],',
    'a[href="reading-board.html"],a[href="listening-board.html"],a[href="typing-board.html"],',
    'a[href="word-order-board.html"],a[href="lego-board.html"],a[href="mix-board.html"],',
    'a[href="games-challenge.html"]{display:none!important}',
    '.minimum-guest-launch .gh-main-grid{grid-template-columns:repeat(2,minmax(0,1fr))}',
    '@media(max-width:760px){.minimum-guest-launch .gh-main-grid{grid-template-columns:1fr}}'
  ].join('');
  document.head.appendChild(style);

  function hideParkedUi() {
    var selectors = [
      '#gameSearchGate',
      '.gh-main-card.gh-disabled',
      '#tf-challenge-banner',
      '.tf-challenge-banner',
      '#tf-streak-chip',
      '#rg-streak-chip',
      '[id*="vault-btn-slot"]'
    ];
    selectors.forEach(function (selector) {
      Array.prototype.forEach.call(document.querySelectorAll(selector), function (node) {
        node.setAttribute('hidden', '');
        node.setAttribute('aria-hidden', 'true');
      });
    });

    Array.prototype.forEach.call(document.querySelectorAll('a[href="/my-progress.html"],a[href="my-progress.html"]'), function (link) {
      var navItem = link.closest && link.closest('li');
      if (navItem) navItem.setAttribute('hidden', '');
    });

    Array.prototype.forEach.call(document.querySelectorAll('.gh-section-label'), function (label) {
      if (/排行榜|收藏/.test(label.textContent || '')) label.setAttribute('hidden', '');
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', hideParkedUi, { once: true });
  else hideParkedUi();
})(window, document);
