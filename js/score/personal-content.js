// personal-content.js — Login-only 泰語單字庫: words, sentences and zero-write search.
(function () {
  'use strict';

  var root = document.getElementById('personal-content-root');
  if (!root) return;
  var user = null;
  var activeTab = 'words';
  var searchQuery = '';
  var playedItems = {};
  var playedCache = {};
  var playedRequestKey = '';
  var playedRequestFailed = false;
  try { activeTab = sessionStorage.getItem('personal_content_tab') || 'words'; } catch (e) {}
  if (location.hash === '#sentences') activeTab = 'sentences';
  if (location.hash === '#words') activeTab = 'words';

  var SOURCE_ORDER = ['tone-finder', 'reading-game', 'listening-game', 'typing-game', 'lego', 'lego-user-created', 'word-order'];
  var SOURCE_LABELS = {
    'tone-finder': '泰語聲調練習室',
    'reading-game': '泰語拼讀練習室',
    'listening-game': '泰語聽力練習室',
    'typing-game': '泰語打字練習室',
    'lego': '泰語造句練習室',
    'lego-user-created': '泰語造句練習室',
    'word-order': '泰語語序練習室'
  };
  var PRACTICE_GAMES = {
    'tone-finder': { label: '聲調', href: 'tone-finder.html' },
    'reading-game': { label: '拼讀', href: 'reading-game.html', wordParam: 'word' },
    'listening-game': { label: '聽力', href: 'listening-game.html' },
    'typing-game': { label: '打字', href: 'typing-game.html', wordParam: 'word' },
    'lego': { label: '造句', href: 'lego.html' },
    'lego-user-created': { label: '造句', href: 'lego.html' },
    'word-order': { label: '語序', href: 'word-order.html', sentenceParam: 'sentence' }
  };

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }
  function provenance(item) {
    var rows = Array.isArray(item && item.provenance) ? item.provenance.slice() : [];
    if (!rows.length && item && item.source) rows.push({ source: item.source, saved_at: item.saved_at });
    return rows.filter(function (row) { return row && row.source; }).sort(function (a, b) {
      var ai = SOURCE_ORDER.indexOf(a.source); var bi = SOURCE_ORDER.indexOf(b.source);
      return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi);
    });
  }
  function formatDate(value) {
    if (!value) return '未記錄';
    try {
      return new Intl.DateTimeFormat('zh-TW', {
        timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit'
      }).format(new Date(value));
    } catch (e) { return String(value); }
  }
  function sourceLabel(source) { return SOURCE_LABELS[source] || source || '來源未記錄'; }
  function playedKey(item, kind) { return (kind === 'sentence' ? 'sentence:' : 'word:') + String(item && item.th || ''); }
  function playedFor(item, kind) { return playedItems[playedKey(item, kind)] || null; }

  function loadPlayedStatus(entries) {
    if (!user || !window.PracticeEvents || typeof PracticeEvents.status !== 'function') return;
    var requestItems = entries.map(function (entry) {
      return { kind: entry.kind, key: String(entry.item && entry.item.th || '') };
    }).filter(function (item) { return item.key; });
    var key = String(user.id || '') + '|' + requestItems.map(function (item) { return item.kind + ':' + item.key; }).sort().join('|');
    if (!requestItems.length) return;
    if (playedCache[key]) { playedItems = playedCache[key]; return; }
    if (key === playedRequestKey) return;
    playedRequestKey = key;
    playedRequestFailed = false;
    var ownerId = String(user.id || '');
    PracticeEvents.status(requestItems).then(function (result) {
      if (!user || String(user.id || '') !== ownerId || playedRequestKey !== key) return;
      playedItems = result || {};
      playedCache[key] = playedItems;
      renderAccount();
    }, function () {
      if (!user || String(user.id || '') !== ownerId || playedRequestKey !== key) return;
      playedRequestFailed = true;
      renderAccount();
    });
  }

  function renderGuest() {
    root.innerHTML = '';
    var panel = el('section', 'pc-guest');
    panel.appendChild(el('div', 'pc-guest-icon', '🔐'));
    panel.appendChild(el('h2', '', '登入後使用「泰語單字庫」'));
    panel.appendChild(el('p', '', '訪客不會讀取或顯示個人內容。登入後才能查看此帳號儲存的單字與句子。'));
    var games = el('a', 'pc-primary', '繼續免費練習'); games.href = 'games.html'; panel.appendChild(games);
    root.appendChild(panel);
  }
  function renderLimit(container, count, max) {
    var remaining = Math.max(0, max - count);
    var line = el('div', 'pc-limit' + (remaining === 0 ? ' pc-limit-full' : remaining <= 3 ? ' pc-limit-near' : ''));
    if (remaining === 0) line.textContent = '單字庫已滿，請先刪除不需要的內容';
    else if (remaining <= 3) line.textContent = '還可以新增 ' + remaining + ' 項（' + count + '/' + max + '）';
    else line.textContent = count + '/' + max;
    container.appendChild(line);
  }
  function infoToggle(label, value) {
    var wrapper = el('div', 'pc-info-row');
    var button = el('button', 'pc-info-toggle', label); button.type = 'button';
    var valueNode = el('span', 'pc-info-value', value || '尚無資料'); valueNode.hidden = true;
    button.onclick = function () { valueNode.hidden = !valueNode.hidden; button.setAttribute('aria-expanded', valueNode.hidden ? 'false' : 'true'); };
    button.setAttribute('aria-expanded', 'false');
    wrapper.appendChild(button); wrapper.appendChild(valueNode); return wrapper;
  }
  function practiceHref(game, item, kind) {
    var param = kind === 'sentence' ? game.sentenceParam : game.wordParam;
    return game.href + (param ? '?' + param + '=' + encodeURIComponent(item.th) : '');
  }
  function practiceSection(item, kind) {
    var section = el('section', 'pc-detail-section');
    section.appendChild(el('h4', '', '練習紀錄'));
    var evidence = playedFor(item, kind);
    if (evidence && evidence.played) {
      section.appendChild(el('p', 'pc-source', '已練習 · 最後練習時間：' + formatDate(evidence.last_played_at)));
    } else if (playedRequestFailed) {
      var retry = el('button', 'pc-secondary', '重新載入練習紀錄'); retry.type = 'button';
      retry.onclick = function () { delete playedCache[playedRequestKey]; playedRequestKey = ''; playedRequestFailed = false; renderAccount(); };
      section.appendChild(retry);
    } else {
      section.appendChild(el('p', 'pc-muted', '尚無已練習紀錄'));
    }
    var seen = {};
    provenance(item).forEach(function (row) {
      var game = PRACTICE_GAMES[row.source];
      if (!game || seen[game.href]) return;
      seen[game.href] = true;
      var link = el('a', 'pc-practice', '返回' + game.label + '練習');
      link.href = practiceHref(game, item, kind);
      section.appendChild(link);
    });
    if (!Object.keys(seen).length) {
      var fallback = el('a', 'pc-practice', '返回遊戲練習室'); fallback.href = 'games-practice.html'; section.appendChild(fallback);
    }
    return section;
  }
  function savedInfo(item) {
    var section = el('section', 'pc-detail-section');
    section.appendChild(el('h4', '', '來源與儲存時間'));
    var rows = provenance(item);
    if (!rows.length) section.appendChild(el('p', 'pc-muted', '舊資料沒有來源紀錄'));
    rows.forEach(function (row) {
      section.appendChild(el('p', 'pc-source', '來源：' + sourceLabel(row.source) + ' · 儲存時間：' + formatDate(row.saved_at || item.saved_at)));
    });
    return section;
  }
  function itemCard(item, kind) {
    var card = el('article', 'pc-item');
    var summary = el('div', 'pc-summary');
    summary.appendChild(el('div', 'pc-th', item.th));
    var open = el('button', 'pc-detail-toggle', '查看詳細'); open.type = 'button'; summary.appendChild(open);
    card.appendChild(summary);

    var details = el('div', 'pc-details'); details.hidden = true;
    details.appendChild(infoToggle('泰語讀音', item.readingTH || ''));
    details.appendChild(infoToggle('羅馬拼音', item.en || ''));
    details.appendChild(infoToggle('中文翻譯', item.zh || ''));
    details.appendChild(practiceSection(item, kind));
    details.appendChild(savedInfo(item));
    var remove = el('button', 'pc-delete', '刪除'); remove.type = 'button';
    remove.onclick = function () {
      if (!window.confirm('只會從泰語單字庫移除，不會刪除學習進度。確定刪除嗎？')) return;
      if (kind === 'sentence') SentenceVault.removeSentence(item.th); else WordVault.removeWord(item.th);
      render();
    };
    details.appendChild(remove); card.appendChild(details);
    open.onclick = function () { details.hidden = !details.hidden; open.textContent = details.hidden ? '查看詳細' : '收起詳細'; };
    return card;
  }
  function renderList(container, items, kind) {
    items.slice().sort(function (a, b) { return (b.saved_at || 0) - (a.saved_at || 0); }).forEach(function (item) {
      container.appendChild(itemCard(item, kind));
    });
  }
  function searchControls(onSearch) {
    var wrapper = el('div', 'pc-search');
    var label = el('label', 'pc-search-label', '搜尋泰語單字庫');
    var input = el('input', 'pc-search-input');
    input.type = 'search'; input.value = searchQuery;
    input.placeholder = '輸入泰文、泰語讀音、羅馬拼音、中文或來源';
    input.setAttribute('autocomplete', 'off');
    label.appendChild(input); wrapper.appendChild(label);
    var clear = el('button', 'pc-search-clear', '清除'); clear.type = 'button';
    clear.hidden = !searchQuery;
    var status = el('p', 'pc-search-status'); status.setAttribute('aria-live', 'polite');
    function apply() {
      searchQuery = input.value;
      clear.hidden = !searchQuery;
      onSearch(status);
    }
    input.addEventListener('input', apply);
    clear.onclick = function () { input.value = ''; apply(); input.focus(); };
    wrapper.appendChild(clear); wrapper.appendChild(status);
    return { node: wrapper, status: status };
  }
  function resultGroup(container, title, items, kind) {
    if (!items.length) return;
    container.appendChild(el('h3', 'pc-result-group-title', title + '（' + items.length + '）'));
    renderList(container, items, kind);
  }
  function renderAccount() {
    root.innerHTML = '';
    var words = window.WordVault ? WordVault.getAll() : [];
    var sentences = window.SentenceVault ? SentenceVault.getAll() : [];
    loadPlayedStatus(words.map(function (item) { return { item: item, kind: 'word' }; }).concat(
      sentences.map(function (item) { return { item: item, kind: 'sentence' }; })
    ));

    var list = el('section', 'pc-list');
    function update(status) {
      list.innerHTML = '';
      var hasQuery = !!(window.PersonalSearch && PersonalSearch.normalize(searchQuery));
      if (hasQuery) {
        var wordMatches = PersonalSearch.filter(words, searchQuery, SOURCE_LABELS);
        var sentenceMatches = PersonalSearch.filter(sentences, searchQuery, SOURCE_LABELS);
        var total = wordMatches.length + sentenceMatches.length;
        status.textContent = '找到 ' + total + ' 項：單字 ' + wordMatches.length + '、句子 ' + sentenceMatches.length;
        if (!total) list.appendChild(el('div', 'pc-empty', '找不到符合的內容。請試試泰文、泰語讀音、羅馬拼音、中文或來源名稱。'));
        else {
          resultGroup(list, '我的單字', wordMatches, 'word');
          resultGroup(list, '我的句子', sentenceMatches, 'sentence');
        }
        return;
      }
      var kind = activeTab === 'sentences' ? 'sentence' : 'word';
      var items = kind === 'sentence' ? sentences : words;
      var max = kind === 'sentence' ? SentenceVault.MAX_SENTENCES : WordVault.MAX_WORDS;
      status.textContent = '共 ' + items.length + ' 項';
      renderLimit(list, items.length, max);
      if (!items.length) {
        list.appendChild(el('div', 'pc-empty', kind === 'sentence'
          ? '還沒有儲存句子。可從聲調、拼讀、聽力、打字、造句或語序練習加入。'
          : '還沒有儲存單字。可從聲調、拼讀、聽力或打字練習加入。'));
      } else renderList(list, items, kind);
    }

    var controls = searchControls(update); root.appendChild(controls.node);
    var tabs = el('div', 'pc-tabs');
    var wordsButton = el('button', 'pc-tab' + (activeTab === 'words' ? ' active' : ''), '我的單字');
    var sentencesButton = el('button', 'pc-tab' + (activeTab === 'sentences' ? ' active' : ''), '我的句子');
    function select(tab) {
      activeTab = tab;
      try { sessionStorage.setItem('personal_content_tab', tab); } catch (e) {}
      try { history.replaceState(null, '', '#' + tab); } catch (e) {}
      renderAccount();
    }
    wordsButton.onclick = function () { select('words'); }; sentencesButton.onclick = function () { select('sentences'); };
    tabs.appendChild(wordsButton); tabs.appendChild(sentencesButton); root.appendChild(tabs);
    root.appendChild(list);
    update(controls.status);
  }
  function render() { if (!user) renderGuest(); else renderAccount(); }
  function applyUser(nextUser) {
    var previousId = user && user.id ? String(user.id) : '';
    var nextId = nextUser && nextUser.id ? String(nextUser.id) : '';
    user = nextUser || null;
    if (previousId !== nextId) {
      playedItems = {};
      playedCache = {};
      playedRequestKey = '';
      playedRequestFailed = false;
    }
    render();
  }

  window.addEventListener('wordvault:changed', render);
  window.addEventListener('sentencevault:changed', render);
  window.addEventListener('hashchange', function () {
    if (location.hash === '#words' || location.hash === '#sentences') {
      activeTab = location.hash.slice(1);
      render();
    }
  });
  function bindAuth(remaining) {
    if (window.SITE_AUTH && SITE_AUTH.onChange) { SITE_AUTH.onChange(applyUser); return; }
    if (window.READING_AUTH && READING_AUTH.user) { applyUser(READING_AUTH.user); return; }
    if (remaining > 0) { setTimeout(function () { bindAuth(remaining - 1); }, 100); return; }
    renderGuest();
  }
  renderGuest();
  bindAuth(50);
})();
