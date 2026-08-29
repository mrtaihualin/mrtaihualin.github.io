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

  // Product-owned closed aliases. Search expands only these reviewed groups;
  // it does not guess spellings or call an external language service.
  var CLOSED_ALIAS_GROUPS = [
    ['คุณ', 'คุน', 'คุร', '你', '您', 'khun', 'kun']
  ];

  function closedAliases(values) {
    var normalizedValues = values.filter(Boolean).map(normalize);
    var aliases = [];
    CLOSED_ALIAS_GROUPS.forEach(function (group) {
      var matches = group.some(function (alias) {
        var needle = normalize(alias);
        return normalizedValues.some(function (value) { return value.indexOf(needle) !== -1; });
      });
      if (matches) aliases = aliases.concat(group);
    });
    return aliases;
  }

  function haystack(item, sourceLabels) {
    item = item || {};
    var values = [item.th, item.readingTH, item.en, item.zh].concat(Array.isArray(item.aliases) ? item.aliases : []);
    provenance(item).forEach(function (row) {
      if (!row || !row.source) return;
      values.push(row.source);
      values.push(sourceLabels && sourceLabels[row.source]);
    });
    values = values.concat(closedAliases(values));
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

  return { normalize: normalize, haystack: haystack, filter: filter, CLOSED_ALIAS_GROUPS: CLOSED_ALIAS_GROUPS };
});
