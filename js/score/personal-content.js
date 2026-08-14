// personal-content.js — Phase 1 我的內容: one page, two tabs, no search/filter.
(function () {
  'use strict';

  var root = document.getElementById('personal-content-root');
  if (!root) return;
  var user = null;
  var activeTab = 'words';
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
  function practiceSection(item, games) {
    var section = el('section', 'pc-detail-section');
    section.appendChild(el('h4', '', '練習紀錄'));
    var rows = provenance(item);
    games.forEach(function (game) {
      var played = rows.some(function (row) { return row.source === game.source; });
      var link = el('a', 'pc-practice', (played ? '再練習 · ' : '開始練習 · ') + game.label);
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
    details.appendChild(practiceSection(item, kind === 'sentence' ? SENTENCE_GAMES : WORD_GAMES));
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
  function renderList(container, items, kind) {
    if (!items.length) {
      var empty = el('div', 'pc-empty', kind === 'sentence' ? '還沒有儲存句子。去語序練習室，按 🔖 就能加入。' : '還沒有儲存單字。玩遊戲時按 🔖 就能加入。');
      container.appendChild(empty); return;
    }
    items.slice().sort(function (a, b) { return (b.saved_at || 0) - (a.saved_at || 0); }).forEach(function (item) {
      container.appendChild(itemCard(item, kind));
    });
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
    var list = el('section', 'pc-list'); root.appendChild(list);
    if (activeTab === 'sentences') {
      var sentences = window.SentenceVault ? SentenceVault.getAll() : [];
      renderLimit(list, sentences.length, SentenceVault.MAX_SENTENCES);
      renderList(list, sentences, 'sentence');
    } else {
      var words = window.WordVault ? WordVault.getAll() : [];
      renderLimit(list, words.length, WordVault.MAX_WORDS);
      renderList(list, words, 'word');
    }
  }
  function render() { if (!user) renderGuest(); else renderAccount(); }
  function applyUser(nextUser) { user = nextUser || null; render(); }

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
