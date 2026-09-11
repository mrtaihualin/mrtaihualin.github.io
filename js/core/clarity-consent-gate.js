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
  var COOKIE_KEY = 'mrtCookieConsent';
  var SHARED_COOKIE_KEY = 'mrtCookieConsentSharedV1';
  var SCRIPT_ID = 'clarity-consent-script';

  function createController(win, doc, siteId) {
    function isSiteHost() {
      var hostname = win.location && String(win.location.hostname || '').toLowerCase();
      return hostname === 'mrtaihualin.com' || hostname === 'www.mrtaihualin.com';
    }

    function cookieValue(name) {
      try {
        var match = String(doc.cookie || '').match(new RegExp('(?:^|;\\s*)' + name + '=(granted|denied)(?:;|$)'));
        return match ? match[1] : null;
      } catch (_) { return null; }
    }

    function state() {
      var value = isSiteHost() ? cookieValue(SHARED_COOKIE_KEY) : null;
      if (value === 'granted' || value === 'denied') {
        try { win.localStorage.setItem(STORAGE_KEY, value); } catch (_) {}
        return value;
      }
      try {
        value = win.localStorage.getItem(STORAGE_KEY);
        if (value === 'granted' || value === 'denied') {
          persist(value);
          return value;
        }
      } catch (_) {}
      value = cookieValue(COOKIE_KEY);
      if (value === 'granted' || value === 'denied') {
        persist(value);
        return value;
      }
      return 'unset';
    }

    function persist(value) {
      try { win.localStorage.setItem(STORAGE_KEY, value); } catch (_) {}
      try {
        var secure = win.location && win.location.protocol === 'https:' ? ';Secure' : '';
        doc.cookie = COOKIE_KEY + '=' + value + ';Max-Age=31536000;path=/;SameSite=Lax' + secure;
        if (isSiteHost()) {
          doc.cookie = SHARED_COOKIE_KEY + '=' + value + ';Max-Age=31536000;path=/;domain=.mrtaihualin.com;SameSite=Lax' + secure;
        }
      } catch (_) {}
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
      persist(value);
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

  return { STORAGE_KEY: STORAGE_KEY, COOKIE_KEY: COOKIE_KEY, SHARED_COOKIE_KEY: SHARED_COOKIE_KEY, SCRIPT_ID: SCRIPT_ID, createController: createController };
});
