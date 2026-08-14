// network-guard.js — deterministic browser request timeout without mutating saved state.
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.NetworkGuard = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function timeoutError() {
    var error = new Error('NETWORK_TIMEOUT');
    error.code = 'NETWORK_TIMEOUT';
    return error;
  }

  function request(fetchImpl, url, options, timeoutMs, AbortCtor) {
    if (typeof fetchImpl !== 'function') return Promise.reject(new Error('NETWORK_FETCH_UNAVAILABLE'));
    var ms = Math.max(1, Number(timeoutMs) || 15000);
    var Controller = AbortCtor === undefined
      ? (typeof AbortController !== 'undefined' ? AbortController : null)
      : AbortCtor;
    var controller = Controller ? new Controller() : null;
    var requestOptions = {};
    Object.keys(options || {}).forEach(function (key) { requestOptions[key] = options[key]; });
    if (controller) requestOptions.signal = controller.signal;

    return new Promise(function (resolve, reject) {
      var settled = false;
      var timer = setTimeout(function () {
        if (settled) return;
        settled = true;
        if (controller) try { controller.abort(); } catch (_) {}
        reject(timeoutError());
      }, ms);
      Promise.resolve().then(function () {
        return fetchImpl(url, requestOptions);
      }).then(function (value) {
        if (settled) return;
        settled = true; clearTimeout(timer); resolve(value);
      }, function (error) {
        if (settled) return;
        settled = true; clearTimeout(timer); reject(error);
      });
    });
  }

  return { request: request, timeoutError: timeoutError };
});
