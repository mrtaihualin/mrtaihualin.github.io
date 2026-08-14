/* =====================================================================
   access-gate.js — temporary client-side gate for /textbook/

   IMPORTANT: This is an access deterrent only. It is intentionally
   bypassable and must never be treated as authentication or security.
   Real Google Login / student authentication remains Future Work.
   ===================================================================== */
(function () {
  'use strict';

  var STORAGE_KEY = 'textbook-temp-access-v1';
  var ACCESS_VERSION = '2026-08-14-v1';
  var RESET_PARAM = 'reset-textbook-access';
  var EXPECTED_HASH = '1ae315d9c328079467acc014090acf8f40aa62ca7223f132867956fddc6dab69';
  var root = document.documentElement;

  root.classList.add('textbook-gate-pending');

  function clearAccess() {
    try { window.localStorage.removeItem(STORAGE_KEY); } catch (e) {}
  }

  function hasAccess() {
    try { return window.localStorage.getItem(STORAGE_KEY) === ACCESS_VERSION; }
    catch (e) { return false; }
  }

  function rememberAccess() {
    try { window.localStorage.setItem(STORAGE_KEY, ACCESS_VERSION); } catch (e) {}
  }

  function consumeResetRequest() {
    try {
      var url = new URL(window.location.href);
      if (url.searchParams.get(RESET_PARAM) !== '1') return;
      clearAccess();
      url.searchParams.delete(RESET_PARAM);
      window.history.replaceState(null, '', url.pathname + url.search + url.hash);
    } catch (e) {}
  }

  function normalizeCode(value) {
    return String(value || '').trim().toUpperCase();
  }

  function bytesToHex(buffer) {
    return Array.from(new Uint8Array(buffer)).map(function (value) {
      return value.toString(16).padStart(2, '0');
    }).join('');
  }

  function hashCode(value) {
    if (!window.crypto || !window.crypto.subtle || !window.TextEncoder) {
      return Promise.reject(new Error('Web Crypto unavailable'));
    }
    return window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalizeCode(value)))
      .then(bytesToHex);
  }

  function grantAccess(gate) {
    rememberAccess();
    root.classList.remove('textbook-gate-pending');
    root.classList.add('textbook-gate-granted');
    if (gate && gate.parentNode) gate.parentNode.removeChild(gate);
  }

  function buildGate() {
    var gate = document.createElement('main');
    gate.className = 'textbook-access-gate';
    gate.setAttribute('aria-labelledby', 'textbookAccessTitle');
    gate.innerHTML =
      '<section class="textbook-access-card">' +
        '<div class="textbook-access-mark" aria-hidden="true">🔐</div>' +
        '<h1 id="textbookAccessTitle">輸入教材通行碼</h1>' +
        '<p>這是暫時的教材入口，請輸入老師提供的通行碼。</p>' +
        '<form novalidate>' +
          '<label for="textbookAccessCode">教材通行碼</label>' +
          '<input id="textbookAccessCode" name="textbookAccessCode" type="password" ' +
            'autocomplete="one-time-code" autocapitalize="characters" spellcheck="false" required>' +
          '<button class="textbook-access-submit" type="submit">進入教材</button>' +
          '<p class="textbook-access-error" role="alert" aria-live="polite"></p>' +
        '</form>' +
        '<p class="textbook-access-note">通過後，此瀏覽器會記住使用權限。</p>' +
      '</section>';

    var form = gate.querySelector('form');
    var input = gate.querySelector('input');
    var error = gate.querySelector('.textbook-access-error');
    var submit = gate.querySelector('.textbook-access-submit');

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      error.textContent = '';
      submit.disabled = true;

      hashCode(input.value).then(function (actualHash) {
        if (actualHash !== EXPECTED_HASH) {
          error.textContent = '通行碼不正確，請再試一次。';
          input.select();
          return;
        }
        grantAccess(gate);
      }).catch(function () {
        error.textContent = '此瀏覽器無法驗證通行碼，請更新瀏覽器後再試。';
      }).finally(function () {
        submit.disabled = false;
      });
    });

    document.body.appendChild(gate);
    window.setTimeout(function () { input.focus(); }, 0);
  }

  consumeResetRequest();

  window.TextbookAccessGate = Object.freeze({
    clear: function () {
      clearAccess();
      window.location.reload();
    }
  });

  if (hasAccess()) {
    root.classList.remove('textbook-gate-pending');
    root.classList.add('textbook-gate-granted');
    return;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', buildGate, { once: true });
  else buildGate();
})();
