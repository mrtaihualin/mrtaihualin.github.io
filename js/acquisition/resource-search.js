// resource-search.js — Phase 1 minimum usable public search for resources.html.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ResourceSearch = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var BASE = [
    { id: 'songs', title: '用歌曲學泰語', description: '泰語歌曲、歌詞、發音、中文解釋', href: '#songs', keywords: ['歌曲', '歌詞', '唱歌', '發音', '音樂', 'song'] },
    { id: 'videos', title: '泰語教學影片', description: '泰語教學影片與最新影音內容', href: '#videos', keywords: ['影片', '影音', '教學', '視頻', 'youtube', 'video'] },
    { id: 'playlists', title: '全部播放清單', description: '依主題整理的 YouTube 泰語播放清單', href: '#playlists', keywords: ['播放清單', '清單', '主題', '系列', 'playlist'] }
  ];

  function normalize(value) {
    return String(value || '').toLowerCase().replace(/\s+/g, '').trim();
  }

  function searchCatalog(query, catalog) {
    var q = normalize(query);
    if (!q) return [];
    return (catalog || []).filter(function (entry) {
      var haystack = [entry.title, entry.description].concat(entry.keywords || []).map(normalize);
      return haystack.some(function (value) { return value.indexOf(q) !== -1 || q.indexOf(value) !== -1; });
    }).slice(0, 8);
  }

  function dynamicCatalog(doc) {
    var out = BASE.slice();
    var seen = {};
    out.forEach(function (entry) { seen[entry.href + '|' + entry.title] = true; });

    function addFrom(selector, href, description) {
      Array.prototype.forEach.call(doc.querySelectorAll(selector), function (element) {
        var title = String(element.textContent || '').trim();
        var key = href + '|' + title;
        if (!title || seen[key]) return;
        seen[key] = true;
        out.push({ title: title, description: description, href: href, keywords: [] });
      });
    }

    addFrom('#p4-song-select option', '#songs', '泰語歌曲');
    addFrom('#p4-video-grid .p4-vc-title', '#videos', '泰語教學影片');
    addFrom('#p4-playlist-grid .p4-pl-title', '#playlists', '播放清單');
    return out;
  }

  function openSection(doc, href) {
    var id = String(href || '').replace(/^#/, '');
    var section = id ? doc.getElementById(id) : null;
    var details = section && section.querySelector ? section.querySelector('details') : null;
    if (details) details.open = true;
  }

  function renderResults(doc, output, results) {
    output.textContent = '';
    output.classList.add('is-open');
    if (!results.length) {
      var empty = doc.createElement('div');
      empty.className = 'resource-search-empty';
      empty.textContent = '找不到相符的影音資源。請換一個關鍵字，或使用上方三個分類入口。';
      output.appendChild(empty);
      return;
    }
    results.forEach(function (entry) {
      var link = doc.createElement('a');
      link.className = 'resource-search-result';
      link.href = entry.href;
      var title = doc.createElement('strong');
      title.textContent = entry.title;
      var desc = doc.createElement('span');
      desc.textContent = entry.description || '';
      link.appendChild(title);
      link.appendChild(desc);
      link.addEventListener('click', function () { openSection(doc, entry.href); });
      output.appendChild(link);
    });
  }

  function init(doc) {
    var input = doc.getElementById('resource-search-input');
    var button = doc.getElementById('resource-search-button');
    var output = doc.getElementById('resource-search-results');
    if (!input || !button || !output) return false;

    function run() {
      var query = input.value.trim();
      if (!query) {
        output.textContent = '';
        output.classList.remove('is-open');
        return;
      }
      renderResults(doc, output, searchCatalog(query, dynamicCatalog(doc)));
    }

    button.addEventListener('click', run);
    input.addEventListener('keydown', function (event) {
      if (event.key === 'Enter') { event.preventDefault(); run(); }
    });
    input.addEventListener('search', run);
    return true;
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { init(document); });
    else init(document);
  }

  return { BASE: BASE, normalize: normalize, searchCatalog: searchCatalog, init: init };
});
