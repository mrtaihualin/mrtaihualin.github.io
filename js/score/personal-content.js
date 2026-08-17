// personal-content.js — Phase 1 我的內容: one page, two tabs and Login-only Personal Search.
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

  var SOURCE_LABELS = {
    'tone-finder': '聲調練習室', 'reading-game': '拼讀練習室',
    'listening-game': '聽力練習室', 'typing-game': '打字練習室',
    'word-order': '語序練習室', 'games-challenge': '綜合挑戰'
  };
  var WORD_GAMES = [
    { source: 'reading-game', label: '拼讀', href: 'reading-game.html?word=' },
    { source: 'typing-game', label: '打字', href: 'typing-game.html?word=' }
  ];
  var SENTENCE_GAMES = [
    { source: 'word-order', label: '語序', href: 'word-order.html?sentence=' }
  ];

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }
  function provenance(item) {
    var rows = Array.isArray(item && item.provenance) ? item.provenance.slice() : [];
    if (!rows.length && item && item.source) rows.push({ source: item.source, saved_at: item.saved_at });
    return rows.filter(function (row) { return row && row.source; });
  }
  function formatDate(value) {
    if (!value) return '時間未記錄';
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

  function loadPlayedStatus(items, kind) {
    if (!user || !window.PracticeEvents || typeof PracticeEvents.status !== 'function') return;
    var requestItems = items.map(function (item) { return { kind: kind, key: String(item.th || '') }; }).filter(function (item) { return item.key; });
    var key = String(user.id || '') + '|' + kind + '|' + requestItems.map(function (item) { return item.key; }).sort().join('|');
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
    panel.appendChild(el('h2', '', '登入後使用「我的內容」'));
    panel.appendChild(el('p', '', '訪客沒有個人單字庫或句子庫。成功登入後，儲存的內容才會同步到帳號。'));
    var games = el('a', 'pc-primary', '繼續免費練習'); games.href = 'games.html'; panel.appendChild(games);
    root.appendChild(panel);
  }
  function renderLimit(container, count, max) {
    var remaining = Math.max(0, max - count);
    var line = el('div', 'pc-limit' + (remaining === 0 ? ' pc-limit-full' : remaining <= 3 ? ' pc-limit-near' : ''));
    if (remaining === 0) {
      line.appendChild(el('strong', '', '已達免費儲存上限。'));
      line.appendChild(document.createTextNode(' 請刪除部分內容後再新增，或升級方案以儲存更多。'));
      var actions = el('div', 'pc-limit-actions');
      var manage = el('button', 'pc-secondary', '管理已儲存內容'); manage.type = 'button';
      manage.onclick = function () { var first = container.querySelector('.pc-item'); if (first) first.scrollIntoView({ behavior: 'smooth', block: 'center' }); };
      var upgrade = el('button', 'pc-secondary pc-disabled', '升級方案'); upgrade.type = 'button'; upgrade.disabled = true;
      upgrade.title = '付費方案尚未在 Phase 1 開放';
      actions.appendChild(manage); actions.appendChild(upgrade); line.appendChild(actions);
    } else if (remaining <= 3) {
      line.textContent = '還可以新增 ' + remaining + ' 項（' + count + '/' + max + '）';
    } else {
      line.textContent = count + '/' + max;
    }
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
  function practiceSection(item, games, kind) {
    var section = el('section', 'pc-detail-section');
    section.appendChild(el('h4', '', '練習紀錄'));
    // Save provenance records where an item was bookmarked. Only the
    // authenticated practice-events status may label this exact item Played.
    var evidence = playedFor(item, kind);
    if (evidence && evidence.played) {
      section.appendChild(el('p', 'pc-source', '已練習 · ' + formatDate(evidence.last_played_at)));
    } else if (playedRequestFailed) {
      var retry = el('button', 'pc-secondary', '重新載入練習紀錄'); retry.type = 'button';
      retry.onclick = function () { delete playedCache[playedRequestKey]; playedRequestKey = ''; playedRequestFailed = false; renderAccount(); };
      section.appendChild(retry);
    }
    games.forEach(function (game) {
      var link = el('a', 'pc-practice', (evidence && evidence.played ? '再練習 · ' : '開始練習 · ') + game.label);
      link.href = game.href + encodeURIComponent(item.th);
      section.appendChild(link);
    });
    return section;
  }
  function savedInfo(item) {
    var section = el('section', 'pc-detail-section');
    section.appendChild(el('h4', '', '儲存資訊'));
    var rows = provenance(item);
    if (!rows.length) section.appendChild(el('p', 'pc-muted', '舊資料沒有來源紀錄'));
    rows.forEach(function (row) {
      section.appendChild(el('p', 'pc-source', sourceLabel(row.source) + ' · ' + formatDate(row.saved_at || item.saved_at)));
    });
    return section;
  }
  function itemCard(item, kind) {
    var card = el('article', 'pc-item');
    var summary = el('div', 'pc-summary');
    summary.appendChild(el('div', 'pc-th', item.th));
    var open = el('button', 'pc-detail-toggle', '查看'); open.type = 'button'; summary.appendChild(open);
    card.appendChild(summary);

    var details = el('div', 'pc-details'); details.hidden = true;
    details.appendChild(infoToggle('คำอ่านไทย', item.readingTH || ''));
    details.appendChild(infoToggle('Romanization', item.en || ''));
    details.appendChild(infoToggle('中文翻譯', item.zh || ''));
    details.appendChild(practiceSection(item, kind === 'sentence' ? SENTENCE_GAMES : WORD_GAMES, kind));
    details.appendChild(savedInfo(item));
    var remove = el('button', 'pc-delete', '刪除'); remove.type = 'button';
    remove.onclick = function () {
      if (!window.confirm('只從個人收藏刪除，不會刪除學習進度。確定刪除嗎？')) return;
      if (kind === 'sentence') SentenceVault.removeSentence(item.th); else WordVault.removeWord(item.th);
      render();
    };
    details.appendChild(remove); card.appendChild(details);
    open.onclick = function () { details.hidden = !details.hidden; open.textContent = details.hidden ? '查看' : '收起'; };
    return card;
  }
  function renderList(container, items, kind, hasQuery) {
    if (!items.length) {
      var message = hasQuery
        ? '找不到符合的個人內容。請試試泰文、中文、拼音或來源名稱。'
        : kind === 'sentence' ? '還沒有儲存句子。去語序練習室，按 🔖 就能加入。' : '還沒有儲存單字。玩遊戲時按 🔖 就能加入。';
      var empty = el('div', 'pc-empty', message);
      container.appendChild(empty); return;
    }
    items.slice().sort(function (a, b) { return (b.saved_at || 0) - (a.saved_at || 0); }).forEach(function (item) {
      container.appendChild(itemCard(item, kind));
    });
  }
  function searchControls(onSearch) {
    var wrapper = el('div', 'pc-search');
    var label = el('label', 'pc-search-label', '搜尋我的內容');
    var input = el('input', 'pc-search-input');
    input.type = 'search'; input.value = searchQuery;
    input.placeholder = '輸入泰文、中文、拼音或來源';
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
  function renderAccount() {
    root.innerHTML = '';
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
    var kind = activeTab === 'sentences' ? 'sentence' : 'word';
    var items = kind === 'sentence'
      ? (window.SentenceVault ? SentenceVault.getAll() : [])
      : (window.WordVault ? WordVault.getAll() : []);
    loadPlayedStatus(items, kind);
    var list = el('section', 'pc-list'); root.appendChild(list);
    function update(status) {
      list.innerHTML = '';
      var max = kind === 'sentence' ? SentenceVault.MAX_SENTENCES : WordVault.MAX_WORDS;
      renderLimit(list, items.length, max);
      var matches = window.PersonalSearch ? PersonalSearch.filter(items, searchQuery, SOURCE_LABELS) : items.slice();
      var hasQuery = !!(window.PersonalSearch && PersonalSearch.normalize(searchQuery));
      status.textContent = hasQuery ? '找到 ' + matches.length + ' / ' + items.length + ' 項' : '共 ' + items.length + ' 項';
      renderList(list, matches, kind, hasQuery);
    }
    var controls = searchControls(update);
    root.insertBefore(controls.node, list);
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
