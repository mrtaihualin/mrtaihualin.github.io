// ===================================================================
// GLOBAL SEARCH ↔ GAME SEARCH ADAPTER
// Reuses GameProblemSearch for every game result in Global Search.
// Generic SearchEngine ranking is restricted to non-game public entries so
// legacy game keywords cannot create a second, conflicting game classifier.
// ===================================================================
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(
      require('./search-engine.js'),
      require('../games/game-problem-search.js'),
      require('../../data/search-index.js')
    );
  } else {
    root.GlobalSearchGameAdapter = factory(root.SearchEngine, root.GameProblemSearch, root.SEARCH_INDEX);
  }
})(typeof self !== 'undefined' ? self : this, function (SearchEngine, GameProblemSearch, SEARCH_INDEX) {
  'use strict';

  var GAME_HUB_ENTRY = {
    id: 'game-hub',
    category: 'game-hub',
    access: 'free',
    title: '泰語遊戲中心',
    desc: '登入後可搜尋遊戲名稱或輸入你的學習問題。',
    href: '/games.html'
  };

  function nonGamePool() {
    var all = SEARCH_INDEX && Array.isArray(SEARCH_INDEX.ALL) ? SEARCH_INDEX.ALL : [];
    return all.filter(function (entry) { return entry && entry.category !== 'practice'; });
  }

  function analyze(query) {
    var gameAnalysis = GameProblemSearch && typeof GameProblemSearch.analyze === 'function'
      ? GameProblemSearch.analyze(query)
      : null;
    var publicResults = SearchEngine && typeof SearchEngine.search === 'function'
      ? SearchEngine.search(query, { pool: nonGamePool() })
      : [];

    return {
      query: String(query == null ? '' : query),
      gameAnalysis: gameAnalysis,
      publicResults: Array.isArray(publicResults) ? publicResults : []
    };
  }

  function gameIntent(plan) {
    var analysis = plan && plan.gameAnalysis;
    if (!analysis) return 'none';
    if (analysis.kind === 'direct-game' && analysis.directEntry) return 'direct';
    var cls = analysis.classification;
    if (analysis.kind === 'problem' && cls && cls.directRoute) return 'problem';
    return 'none';
  }

  function addUnique(out, seen, entry, source) {
    if (!entry || !entry.id || seen[entry.id]) return;
    seen[entry.id] = true;
    out.push({ entry: entry, source: source });
  }

  // Related Results contract for the Global public area: max 3.
  // Every direct/problem game intent is intentionally collapsed to the single
  // public Game Hub. Per-game destinations stay behind the Login Free quota on
  // games.html and can never leak from legacy public ranking.
  function related(plan) {
    var out = [], seen = Object.create(null);
    var intent = gameIntent(plan);

    if (intent === 'direct' || intent === 'problem') addUnique(out, seen, GAME_HUB_ENTRY, 'game-hub');

    (plan && plan.publicResults || []).forEach(function (row) {
      if (out.length >= 3) return;
      addUnique(out, seen, row && row.entry, 'public');
    });

    return out.slice(0, 3);
  }

  return {
    analyze: analyze,
    gameIntent: gameIntent,
    related: related,
    nonGamePool: nonGamePool,
    gameHubEntry: GAME_HUB_ENTRY
  };
});
