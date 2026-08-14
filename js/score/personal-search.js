// personal-search.js — pure, account-local search helpers for Phase 1 我的內容.
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PersonalSearch = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function normalize(value) {
    var text = String(value == null ? '' : value);
    try { text = text.normalize('NFKC'); } catch (_) {}
    return text.toLocaleLowerCase().replace(/\s+/g, ' ').trim();
  }

  function provenance(item) {
    var rows = Array.isArray(item && item.provenance) ? item.provenance : [];
    if (!rows.length && item && item.source) rows = [{ source: item.source }];
    return rows;
  }

  function haystack(item, sourceLabels) {
    item = item || {};
    var values = [item.th, item.readingTH, item.en, item.zh];
    provenance(item).forEach(function (row) {
      if (!row || !row.source) return;
      values.push(row.source);
      values.push(sourceLabels && sourceLabels[row.source]);
    });
    return normalize(values.filter(Boolean).join(' '));
  }

  function filter(items, query, sourceLabels) {
    var tokens = normalize(query).split(' ').filter(Boolean);
    if (!tokens.length) return Array.isArray(items) ? items.slice() : [];
    return (Array.isArray(items) ? items : []).filter(function (item) {
      var text = haystack(item, sourceLabels);
      return tokens.every(function (token) { return text.indexOf(token) !== -1; });
    });
  }

  return { normalize: normalize, haystack: haystack, filter: filter };
});
