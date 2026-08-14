// clarity-consent-gate.js — do not request Microsoft Clarity before explicit stored consent.
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (typeof document !== 'undefined') {
    var current = document.currentScript;
    var siteId = current && current.getAttribute('data-clarity-id');
    root.AnalyticsConsent = api.createController(root, document, siteId);
    root.AnalyticsConsent.loadIfGranted();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var STORAGE_KEY = 'cookieConsent';
  var SCRIPT_ID = 'clarity-consent-script';

  function createController(win, doc, siteId) {
    function state() {
      try {
        var value = win.localStorage.getItem(STORAGE_KEY);
        return value === 'granted' || value === 'denied' ? value : 'unset';
      } catch (_) { return 'unset'; }
    }

    function loadIfGranted() {
      if (state() !== 'granted' || !siteId) return false;
      if (doc.getElementById(SCRIPT_ID)) return true;
      win.clarity = win.clarity || function () { (win.clarity.q = win.clarity.q || []).push(arguments); };
      var script = doc.createElement('script');
      script.id = SCRIPT_ID;
      script.async = true;
      script.src = 'https://www.clarity.ms/tag/' + encodeURIComponent(siteId);
      var first = doc.getElementsByTagName('script')[0];
      if (first && first.parentNode) first.parentNode.insertBefore(script, first);
      else if (doc.head) doc.head.appendChild(script);
      else return false;
      win.clarity('consentv2', { ad_Storage: 'denied', analytics_Storage: 'granted' });
      return true;
    }

    function decide(granted) {
      var value = granted ? 'granted' : 'denied';
      try { win.localStorage.setItem(STORAGE_KEY, value); } catch (_) {}
      if (granted) return loadIfGranted();
      if (typeof win.clarity === 'function') {
        try {
          win.clarity('consentv2', { ad_Storage: 'denied', analytics_Storage: 'denied' });
          win.clarity('consent', false);
        } catch (_) {}
      }
      return false;
    }

    return { state: state, loadIfGranted: loadIfGranted, decide: decide };
  }

  return { STORAGE_KEY: STORAGE_KEY, SCRIPT_ID: SCRIPT_ID, createController: createController };
});
