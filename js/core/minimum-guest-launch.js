// Minimum Guest Launch (PD-MGL-01).
// This reversible client gate keeps the existing account/SRS/personal systems
// intact while the public launch exposes only the six Guest game loops.
(function (window, document) {
  'use strict';

  // OAuth may fall back to the Production Site URL when a preview redirect is
  // not allow-listed. Keep the fragment cleaner for any future fail-closed
  // configuration; Login Core currently remains the only public account entry.
  function clearAuthCallbackFragment() {
    var fragment = String(window.location.hash || '').replace(/^#/, '');
    var hasAuthPayload = /(?:^|&)(?:access_token|refresh_token|provider_token|provider_refresh_token|expires_at|expires_in|token_type|error|error_code|error_description)=/.test(fragment);
    if (!hasAuthPayload) return;

    var cleanUrl = String(window.location.pathname || '/') + String(window.location.search || '');
    try {
      window.history.replaceState(window.history.state, document.title, cleanUrl);
    } catch (error) {
      window.location.replace(cleanUrl);
    }
  }

  // Login Core, SRS, Review and the Phase 1 Login Free account surfaces are
  // independently reversible. Paid and Challenge remain parked.
  window.LOGIN_CORE_PUBLIC_ENTRY = true;
  window.LOGIN_FREE_SRS_PUBLIC_ENTRY = true;
  window.LOGIN_FREE_REVIEW_PUBLIC_ENTRY = true;
  window.LOGIN_FREE_ACCOUNT_PUBLIC_ENTRY = true;
  if (window.LOGIN_CORE_PUBLIC_ENTRY !== true) clearAuthCallbackFragment();
  window.MRT_MINIMUM_GUEST_LAUNCH = true;
  document.documentElement.classList.add('minimum-guest-launch');
  if (window.LOGIN_FREE_ACCOUNT_PUBLIC_ENTRY === true) {
    document.documentElement.classList.add('login-free-account-entry');
  }

  // Load the presentation layer early enough to avoid a small-to-large Login flash.
  if (!document.querySelector('link[href*="login-surface.css"]')) {
    var loginStylesheet = document.createElement('link');
    loginStylesheet.rel = 'stylesheet';
    loginStylesheet.href = 'css/login-surface.css?v=12';
    document.head.appendChild(loginStylesheet);
  }
  if (!document.querySelector('script[src*="login-surface.js"]')) {
    var loginController = document.createElement('script');
    loginController.src = 'js/core/login-surface.js?v=12';
    loginController.defer = true;
    document.head.appendChild(loginController);
  }

  var path = String(window.location.pathname || '').toLowerCase();
  var parked = window.LOGIN_FREE_ACCOUNT_PUBLIC_ENTRY === true
    ? /\/(?:games-challenge|mix)\.html$/
    : /\/(?:my-progress|all-board|leaderboard|reading-board|listening-board|typing-board|word-order-board|games-challenge|mix)\.html$/;
  window.MRT_PARKED_ACCOUNT_SURFACE = parked.test(path);

  var style = document.createElement('style');
  style.setAttribute('data-minimum-guest-launch', '1');
  var accountParkedCss = window.LOGIN_FREE_ACCOUNT_PUBLIC_ENTRY === true ? '' : [
    '#tf-streak-chip,#rg-streak-chip,',
    'a[href="/my-progress.html"],a[href="my-progress.html"],',
    'a[href="all-board.html"],a[href="leaderboard.html"],',
    'a[href="reading-board.html"],a[href="listening-board.html"],a[href="typing-board.html"],',
    'a[href="word-order-board.html"]{display:none!important}'
  ].join('');
  style.textContent = [
    '#rg-cta-login,#tf-cta-login,#tf-challenge-banner,[data-mgl-parked],',
    'a[href="games-challenge.html"]{display:none!important}',
    accountParkedCss,
    '.minimum-guest-launch .gh-main-grid{grid-template-columns:repeat(4,minmax(0,1fr))}',
    '@media(max-width:959px){.minimum-guest-launch .gh-main-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}',
    '@media(max-width:760px){.minimum-guest-launch .gh-main-grid{grid-template-columns:1fr}}'
  ].join('');
  document.head.appendChild(style);

  function hideParkedUi() {
    var selectors = [
      '.gh-main-card.gh-disabled',
      '#tf-challenge-banner',
      '.tf-challenge-banner'
    ];
    if (window.LOGIN_FREE_ACCOUNT_PUBLIC_ENTRY !== true) {
      selectors.push('#tf-streak-chip', '#rg-streak-chip');
    }
    selectors.forEach(function (selector) {
      Array.prototype.forEach.call(document.querySelectorAll(selector), function (node) {
        node.setAttribute('hidden', '');
        node.setAttribute('aria-hidden', 'true');
      });
    });

    if (window.LOGIN_FREE_ACCOUNT_PUBLIC_ENTRY !== true) {
      Array.prototype.forEach.call(document.querySelectorAll('a[href="/my-progress.html"],a[href="my-progress.html"]'), function (link) {
        var navItem = link.closest && link.closest('li');
        if (navItem) navItem.setAttribute('hidden', '');
      });

      Array.prototype.forEach.call(document.querySelectorAll('.gh-section-label'), function (label) {
        if (/排行榜|收藏/.test(label.textContent || '')) label.setAttribute('hidden', '');
      });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', hideParkedUi, { once: true });
  else hideParkedUi();
})(window, document);
