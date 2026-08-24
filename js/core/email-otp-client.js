// Shared Email OTP client for non-game surfaces.
// Safe rollout: native remains the default until the coordinated Production activation; broker mode fails closed.
(function () {
  'use strict';

  var turnstileWidgetId = null;
  var turnstileLoader = null;

  function config() {
    return window.EMAIL_OTP_SECURITY_CONFIG || {};
  }

  function isBrokerEnabled() {
    return config().mode === 'broker';
  }

  function normalizeEmail(value) {
    return String(value || '').trim().toLowerCase();
  }

  function clear() {
    if (turnstileWidgetId !== null && window.turnstile && window.turnstile.remove) {
      try { window.turnstile.remove(turnstileWidgetId); } catch (e) {}
    }
    turnstileWidgetId = null;
  }

  function loadTurnstile() {
    if (window.turnstile && window.turnstile.render) return Promise.resolve(window.turnstile);
    if (turnstileLoader) return turnstileLoader;
    turnstileLoader = new Promise(function (resolve, reject) {
      var existing = document.querySelector && document.querySelector('script[data-email-otp-turnstile]');
      var script = existing || document.createElement('script');
      var timer = setTimeout(function () { reject(new Error('turnstile_load_timeout')); }, 10000);
      function ready() {
        if (!(window.turnstile && window.turnstile.render)) return;
        clearTimeout(timer);
        resolve(window.turnstile);
      }
      script.addEventListener('load', ready);
      script.addEventListener('error', function () {
        clearTimeout(timer);
        reject(new Error('turnstile_load_failed'));
      });
      if (!existing) {
        script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
        script.async = true;
        script.defer = true;
        script.setAttribute('data-email-otp-turnstile', '1');
        document.head.appendChild(script);
      }
      ready();
    }).catch(function (error) {
      turnstileLoader = null;
      throw error;
    });
    return turnstileLoader;
  }

  function getTurnstileToken(container, action) {
    var siteKey = String(config().turnstileSiteKey || '');
    if (!isBrokerEnabled() || !siteKey) return Promise.reject(new Error('turnstile_not_configured'));
    if (!container) return Promise.reject(new Error('turnstile_container_missing'));
    return loadTurnstile().then(function (turnstile) {
      clear();
      container.innerHTML = '';
      return new Promise(function (resolve, reject) {
        turnstileWidgetId = turnstile.render(container, {
          sitekey: siteKey,
          action: action,
          theme: 'light',
          size: 'flexible',
          callback: function (token) { resolve(token); },
          'error-callback': function () { reject(new Error('turnstile_failed')); },
          'expired-callback': function () { reject(new Error('turnstile_expired')); },
          'timeout-callback': function () { reject(new Error('turnstile_timeout')); }
        });
      });
    });
  }

  function request(sb, options) {
    var email = normalizeEmail(options && options.email);
    if (!isBrokerEnabled()) {
      return sb.auth.signInWithOtp({ email: email, options: { shouldCreateUser: true } });
    }
    return getTurnstileToken(options && options.turnstileContainer, 'email_otp_request')
      .then(function (turnstileToken) {
        return sb.functions.invoke('email-otp-auth', {
          body: { action: 'request', email: email, turnstile_token: turnstileToken }
        });
      })
      .then(function (res) {
        if (res && res.error) return res;
        var challengeId = res && res.data && res.data.challenge_id;
        if (!(res && res.data && res.data.ok &&
          /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(String(challengeId || '')))) {
          return { error: new Error('invalid_broker_response') };
        }
        return { data: { challenge_id: challengeId }, error: null };
      });
  }

  function verify(sb, options) {
    var email = normalizeEmail(options && options.email);
    var code = String(options && options.code || '').trim();
    if (!isBrokerEnabled()) {
      return sb.auth.verifyOtp({ email: email, token: code, type: 'email' });
    }
    var challengeId = String(options && options.challengeId || '');
    if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(challengeId)) {
      return Promise.resolve({ error: new Error('invalid_challenge_id') });
    }
    return getTurnstileToken(options && options.turnstileContainer, 'email_otp_verify')
      .then(function (turnstileToken) {
        return sb.functions.invoke('email-otp-auth', {
          body: {
            action: 'verify',
            challenge_id: challengeId,
            email: email,
            code: code,
            turnstile_token: turnstileToken
          }
        });
      })
      .then(function (res) {
        if (res && res.error) return res;
        var data = res && res.data;
        var session = data && data.session;
        var userId = data && data.user_id;
        if (!(data && data.ok && session && session.access_token && session.refresh_token && userId)) {
          return { error: new Error('invalid_broker_session') };
        }
        return sb.auth.setSession({
          access_token: session.access_token,
          refresh_token: session.refresh_token
        }).then(function (setResult) {
          var boundUser = setResult && setResult.data && setResult.data.session &&
            setResult.data.session.user;
          var boundEmail = normalizeEmail(boundUser && boundUser.email);
          if ((setResult && setResult.error) || !boundUser ||
            boundUser.id !== userId || boundEmail !== email) {
            return Promise.resolve(sb.auth.signOut({ scope: 'local' })).then(function () {
              return {
                error: (setResult && setResult.error) ||
                  new Error('session_binding_failed')
              };
            });
          }
          return setResult;
        });
      });
  }

  window.EmailOtpClient = Object.freeze({
    isBrokerEnabled: isBrokerEnabled,
    request: request,
    verify: verify,
    clear: clear
  });
})();
