// Game Problem Search V2.3
// Six-game classifier + Product 1+1 recommender.
// INPUT C direct routing and Product recommendation slots are intentionally separate.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(
      require('../../data/search-index.js'),
      require('../../data/game-problem-corpus-v2_3.js')
    );
  } else {
    root.GameProblemSearch = factory(root.SEARCH_INDEX, root.GAME_PROBLEM_CORPUS);
  }
})(typeof self !== 'undefined' ? self : this, function (SEARCH_INDEX, CORPUS) {
  'use strict';

  var GAME_ORDER = ['Tone', 'Reading', 'Listening', 'Typing', 'Word Order', 'Lego'];
  var GAME_TO_ID = {
    'Tone': 'game-tone',
    'Reading': 'game-reading',
    'Listening': 'game-listening',
    'Typing': 'game-typing',
    'Word Order': 'game-word-order',
    'Lego': 'game-lego'
  };
  var ID_TO_GAME = {};
  Object.keys(GAME_TO_ID).forEach(function (name) { ID_TO_GAME[GAME_TO_ID[name]] = name; });

  var DIRECT_ALIASES = {
    '聲調': 'Tone', '拼讀': 'Reading', '聽力': 'Listening',
    '打字': 'Typing', '語序': 'Word Order', '造句': 'Lego',
    '泰語聲調練習室': 'Tone', '泰語拼讀練習室': 'Reading',
    '泰語聽力練習室': 'Listening', '泰語打字練習室': 'Typing',
    '泰語語序練習室': 'Word Order', '泰語造句練習室': 'Lego'
  };

  // Locked Product examples from INPUT A. These are natural-language Problem
  // Search phrases (not unlimited direct-game aliases), so they still require
  // Problem Search entitlement in the UI. Product authority outranks fuzzy
  // corpus similarity when one of these exact normalized examples is entered.
  var LOCKED_PRODUCT_PRIMARY = {
    '聲調一直念錯': { primary: 'Tone', secondary: 'Listening' },
    '五個聲調分不出來': { primary: 'Tone', secondary: 'Listening' },
    '長短音分不出來': { primary: 'Tone', secondary: 'Listening' },
    '尾音常常念錯': { primary: 'Tone', secondary: 'Listening' },
    'ผันวรรณยุกต์ไม่เป็น': { primary: 'Tone', secondary: 'Listening' },
    'แยกเสียงวรรณยุกต์ไม่ได้': { primary: 'Tone', secondary: 'Listening' },
    '泰文字看不懂': { primary: 'Reading', secondary: 'Typing' },
    '看到泰文字不知道怎麼讀': { primary: 'Reading', secondary: 'Typing' },
    '子音母音不知道怎麼拼': { primary: 'Reading', secondary: 'Typing' },
    '字母都認得，但合起來不會讀': { primary: 'Reading', secondary: 'Typing' },
    '不會斷詞': { primary: 'Reading', secondary: 'Typing' },
    '泰文字全部黏在一起': { primary: 'Reading', secondary: 'Typing' },
    'อ่านประสมไม่เป็น': { primary: 'Reading', secondary: 'Typing' },
    'ไม่รู้ว่าตรงไหนเป็นคำ': { primary: 'Reading', secondary: 'Typing' },
    '泰國人講話太快': { primary: 'Listening', secondary: 'Tone' },
    '沒有字幕就聽不懂': { primary: 'Listening', secondary: 'Tone' },
    '抓不到單字': { primary: 'Listening', secondary: 'Tone' },
    '看到知道，聽到認不出來': { primary: 'Listening', secondary: 'Tone' },
    '聽起來全部黏在一起': { primary: 'Listening', secondary: 'Tone' },
    'ฟังคนไทยไม่ทัน': { primary: 'Listening', secondary: 'Tone' },
    'ฟังแล้วแยกคำไม่ออก': { primary: 'Listening', secondary: 'Tone' },
    'รู้คำนี้แต่พอได้ยินแล้วไม่รู้ว่าเป็นคำอะไร': { primary: 'Listening', secondary: 'Tone' },
    '不會打泰文': { primary: 'Typing', secondary: 'Reading' },
    '泰文鍵盤不會用': { primary: 'Typing', secondary: 'Reading' },
    '不知道字母在哪裡': { primary: 'Typing', secondary: 'Reading' },
    '會說但是不會寫': { primary: 'Typing', secondary: 'Reading' },
    '不知道這個字怎麼拼': { primary: 'Typing', secondary: 'Reading' },
    '常常拼錯': { primary: 'Typing', secondary: 'Reading' },
    '不會寫': { primary: 'Typing', secondary: 'Reading' },
    'สะกดไม่เป็น': { primary: 'Typing', secondary: 'Reading' },
    'รู้ว่าอ่านยังไงแต่เขียนไม่ถูก': { primary: 'Typing', secondary: 'Reading' },
    'พิมพ์ไทยช้ามาก': { primary: 'Typing', secondary: 'Reading' },
    '不知道單字怎麼排': { primary: 'Word Order', secondary: 'Lego' },
    '句子順序不會': { primary: 'Word Order', secondary: 'Lego' },
    '不知道哪個字要放前面': { primary: 'Word Order', secondary: 'Lego' },
    '每個單字都知道，但不知道怎麼排列': { primary: 'Word Order', secondary: 'Lego' },
    '照中文順序講泰文': { primary: 'Word Order', secondary: 'Lego' },
    '每個字都對，但整句很奇怪': { primary: 'Word Order', secondary: 'Lego' },
    'เรียงคำไม่เป็น': { primary: 'Word Order', secondary: 'Lego' },
    'รู้ศัพท์แต่เรียงประโยคไม่ถูก': { primary: 'Word Order', secondary: 'Lego' },
    'ไม่รู้คำไหนต้องอยู่ก่อน': { primary: 'Word Order', secondary: 'Lego' },
    '背很多單字還是不會說': { primary: 'Lego', secondary: 'Word Order' },
    '單字都知道，但不會組成句子': { primary: 'Lego', secondary: 'Word Order' },
    '只會單字，不會講完整句子': { primary: 'Lego', secondary: 'Word Order' },
    '不知道要用什麼單字': { primary: 'Lego', secondary: 'Word Order' },
    '想表達但不知道泰文怎麼說': { primary: 'Lego', secondary: 'Word Order' },
    '腦中先想中文再翻成泰文': { primary: 'Lego', secondary: 'Word Order' },
    'รู้ศัพท์แต่พูดไม่ได้': { primary: 'Lego', secondary: 'Word Order' },
    'จำศัพท์ได้แต่เอามาใช้ไม่เป็น': { primary: 'Lego', secondary: 'Word Order' },
    'ไม่รู้จะเริ่มประโยคยังไง': { primary: 'Lego', secondary: 'Word Order' },
    'แต่งประโยคไม่เป็น': { primary: 'Lego', secondary: 'Word Order' },
    '不會造句': { primary: 'Lego', secondary: 'Word Order' }
  };
  var segmenter = null;
  if (typeof Intl !== 'undefined' && Intl.Segmenter) {
    try { segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' }); } catch (_) {}
  }

  function normalize(value) {
    var text = String(value == null ? '' : value);
    try { text = text.normalize('NFKC'); } catch (_) {}
    return text.toLocaleLowerCase()
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      .replace(/[“”‘’"'`´]/g, '')
      .replace(/[，。！？、；：,.!?;:()[\]{}<>《》【】]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function splitGraphemes(text) {
    if (!text) return [];
    if (segmenter) {
      try { return Array.from(segmenter.segment(text), function (x) { return x.segment; }); } catch (_) {}
    }
    return Array.from(text);
  }

  function makeBigrams(units) {
    var out = [];
    for (var i = 0; i < units.length - 1; i++) out.push(units[i] + units[i + 1]);
    return out;
  }

  function prepareText(value) {
    var norm = normalize(value);
    var compact = norm.replace(/\s+/g, '');
    var units = splitGraphemes(compact);
    return {
      norm: norm,
      compact: compact,
      units: units,
      bigrams: makeBigrams(units),
      tokens: norm.split(' ').filter(Boolean)
    };
  }

  function compact(value) { return prepareText(value).compact; }

  function multisetDicePrepared(a, b) {
    if (!a.bigrams.length || !b.bigrams.length) return 0;
    var counts = Object.create(null), hit = 0;
    for (var i = 0; i < b.bigrams.length; i++) counts[b.bigrams[i]] = (counts[b.bigrams[i]] || 0) + 1;
    for (var j = 0; j < a.bigrams.length; j++) {
      var g = a.bigrams[j];
      if (counts[g] > 0) { hit++; counts[g]--; }
    }
    return (2 * hit) / (a.bigrams.length + b.bigrams.length);
  }

  function tokenJaccardPrepared(a, b) {
    if (!a.tokens.length || !b.tokens.length) return 0;
    var aa = Object.create(null), bb = Object.create(null), union = Object.create(null), inter = 0;
    a.tokens.forEach(function (x) { aa[x] = true; union[x] = true; });
    b.tokens.forEach(function (x) { bb[x] = true; union[x] = true; });
    Object.keys(aa).forEach(function (x) { if (bb[x]) inter++; });
    return inter / Math.max(1, Object.keys(union).length);
  }

  function boundedEditDistanceUnits(aa, bb, maxDistance) {
    if (Math.abs(aa.length - bb.length) > maxDistance) return maxDistance + 1;
    var prev = new Array(bb.length + 1);
    for (var j = 0; j <= bb.length; j++) prev[j] = j;
    for (var i = 1; i <= aa.length; i++) {
      var cur = new Array(bb.length + 1);
      cur[0] = i;
      var rowMin = cur[0];
      for (var k = 1; k <= bb.length; k++) {
        var cost = aa[i - 1] === bb[k - 1] ? 0 : 1;
        cur[k] = Math.min(cur[k - 1] + 1, prev[k] + 1, prev[k - 1] + cost);
        if (i > 1 && k > 1 && aa[i - 1] === bb[k - 2] && aa[i - 2] === bb[k - 1]) {
          var diag2 = (i === 2 || k === 2) ? Math.max(i - 2, k - 2) : prev[k - 2];
          cur[k] = Math.min(cur[k], diag2 + 1);
        }
        if (cur[k] < rowMin) rowMin = cur[k];
      }
      if (rowMin > maxDistance) return maxDistance + 1;
      prev = cur;
    }
    return prev[bb.length];
  }

  function conservativeTypoPrepared(a, b) {
    if (!a.compact || !b.compact || a.compact === b.compact) return a.compact === b.compact ? 1 : 0;
    var len = Math.max(a.units.length, b.units.length);
    if (len <= 3) return 0;
    var maxDistance = len <= 7 ? 1 : 2;
    var d = boundedEditDistanceUnits(a.units, b.units, maxDistance);
    return d <= maxDistance ? 1 - (d / len) : 0;
  }

  function similarityPrepared(a, b) {
    if (!a.compact || !b.compact) return 0;
    if (a.compact === b.compact) return 1;
    var minLen = Math.min(a.units.length, b.units.length);
    var maxLen = Math.max(a.units.length, b.units.length);
    var containment = 0;
    if (minLen >= 4 && (a.compact.indexOf(b.compact) !== -1 || b.compact.indexOf(a.compact) !== -1)) {
      containment = 0.88 + 0.12 * (minLen / maxLen);
    }
    var dice = multisetDicePrepared(a, b);
    var token = tokenJaccardPrepared(a, b);
    var best = Math.max(containment, dice, token);
    // Expensive edit distance is only needed near the conservative typo boundary.
    if (best < 0.90 && Math.abs(a.units.length - b.units.length) <= 2) {
      best = Math.max(best, conservativeTypoPrepared(a, b));
    }
    return best;
  }

  function similarity(a, b) { return similarityPrepared(prepareText(a), prepareText(b)); }

  function gameEntryByName(name) {
    var id = GAME_TO_ID[name];
    var pool = SEARCH_INDEX && Array.isArray(SEARCH_INDEX.GAMES) ? SEARCH_INDEX.GAMES : [];
    for (var i = 0; i < pool.length; i++) if (pool[i].id === id) return pool[i];
    return null;
  }

  var aliasKeys = Object.keys(DIRECT_ALIASES).map(function (alias) {
    return { key: prepareText(alias).compact, game: DIRECT_ALIASES[alias] };
  });

  var lockedProductKeys = Object.create(null);
  Object.keys(LOCKED_PRODUCT_PRIMARY).forEach(function (phrase) {
    lockedProductKeys[prepareText(phrase).compact] = LOCKED_PRODUCT_PRIMARY[phrase];
  });

  function directGame(query) {
    var key = prepareText(query).compact;
    for (var i = 0; i < aliasKeys.length; i++) {
      if (aliasKeys[i].key === key) return gameEntryByName(aliasKeys[i].game);
    }
    return null;
  }

  var prepared = (Array.isArray(CORPUS) ? CORPUS : []).map(function (row, index) {
    return { row: row, index: index, q: prepareText(row.query), m: prepareText(row.meaning) };
  });
  var exactMap = Object.create(null);
  prepared.forEach(function (item) {
    [item.q.compact, item.m.compact].forEach(function (key) {
      if (!key) return;
      if (!exactMap[key]) exactMap[key] = [];
      exactMap[key].push(item);
    });
  });

  function chooseExact(candidates) {
    if (!candidates || !candidates.length) return null;
    var signatures = Object.create(null);
    candidates.forEach(function (item) {
      var r = item.row;
      var sig = [r.primary || 'NONE', r.secondary || 'NONE', r.status || '', r.confidence || ''].join('|');
      signatures[sig] = (signatures[sig] || 0) + 1;
    });
    var keys = Object.keys(signatures).sort(function (a, b) { return signatures[b] - signatures[a]; });
    if (keys.length > 1 && signatures[keys[0]] === signatures[keys[1]]) return null;
    var winning = keys[0];
    for (var i = 0; i < candidates.length; i++) {
      var r = candidates[i].row;
      var sig = [r.primary || 'NONE', r.secondary || 'NONE', r.status || '', r.confidence || ''].join('|');
      if (sig === winning) return candidates[i];
    }
    return candidates[0];
  }

  function nearestCorpusPrepared(qp, limit) {
    var out = [];
    for (var i = 0; i < prepared.length; i++) {
      var item = prepared[i];
      var s = Math.max(similarityPrepared(qp, item.q), similarityPrepared(qp, item.m));
      if (s > 0) out.push({ item: item, similarity: s });
    }
    out.sort(function (a, b) {
      if (b.similarity !== a.similarity) return b.similarity - a.similarity;
      return a.item.index - b.item.index;
    });
    return out.slice(0, limit || 12);
  }

  function rowToClassification(row, matchType, score) {
    return {
      matched: true, matchType: matchType, similarity: score,
      caseId: row.caseId || null, language: row.language || null,
      primary: row.primary || 'NONE', secondary: row.secondary || 'NONE',
      confidence: row.confidence || 'LOW', status: row.status || 'AMBIGUOUS',
      discriminator: row.discriminator || '',
      directRoute: !!row.primary && row.primary !== 'NONE'
    };
  }

  function classify(query) {
    var qp = prepareText(query);
    if (!qp.compact) return { matched: false, matchType: 'empty', directRoute: false };
    var exact = chooseExact(exactMap[qp.compact]);
    if (exact) return rowToClassification(exact.row, 'exact-corpus', 1);

    var lockedRoute = lockedProductKeys[qp.compact];
    if (lockedRoute) {
      return {
        matched: true, matchType: 'locked-product', similarity: 1,
        caseId: null, language: null,
        primary: lockedRoute.primary, secondary: lockedRoute.secondary || 'NONE',
        confidence: 'HIGH', status: 'SUPPORTED_NOW',
        discriminator: 'Locked Product mapping from INPUT A.',
        directRoute: true
      };
    }

    var nearest = nearestCorpusPrepared(qp, 2);
    if (!nearest.length) return { matched: false, matchType: 'none', directRoute: false };
    var best = nearest[0], runner = nearest[1];
    var margin = runner ? best.similarity - runner.similarity : best.similarity;
    if (best.similarity >= 0.90 && margin >= 0.03) {
      return rowToClassification(best.item.row, 'near-corpus', best.similarity);
    }
    return {
      matched: false, matchType: 'uncertain', directRoute: false,
      similarity: best.similarity, suggestion: best.item.row.query || null
    };
  }

  function recommend(query, classification) {
    var qp = prepareText(query);
    var scores = Object.create(null);
    GAME_ORDER.forEach(function (name, idx) { scores[name] = -idx * 0.0001; });

    // Product examples also define the intended boundary pair for the 1+1
    // recommendation slot. This does not mutate INPUT C direct secondary data.
    var lockedRoute = lockedProductKeys[qp.compact];
    if (lockedRoute) {
      if (scores[lockedRoute.primary] != null) scores[lockedRoute.primary] += 200;
      if (lockedRoute.secondary && scores[lockedRoute.secondary] != null) scores[lockedRoute.secondary] += 190;
    }

    if (classification && classification.directRoute && scores[classification.primary] != null) scores[classification.primary] += 100;
    if (classification && classification.secondary && classification.secondary !== 'NONE' && scores[classification.secondary] != null) scores[classification.secondary] += 90;

    var near = nearestCorpusPrepared(qp, 50);
    near.forEach(function (match) {
      var row = match.item.row, name = row.primary;
      if (!name || name === 'NONE' || scores[name] == null) return;
      if (row.status === 'UNSUPPORTED_NOW' || row.status === 'AMBIGUOUS') return;
      var cw = row.confidence === 'HIGH' ? 1 : row.confidence === 'MEDIUM' ? 0.85 : 0.7;
      var sw = row.status === 'SUPPORTED_NOW' ? 1 : 0.8;
      var v = match.similarity * cw * sw * 10;
      if (v > scores[name]) scores[name] = v;
    });

    var ranked = GAME_ORDER.slice().sort(function (a, b) {
      if (scores[b] !== scores[a]) return scores[b] - scores[a];
      return GAME_ORDER.indexOf(a) - GAME_ORDER.indexOf(b);
    });

    return ranked.slice(0, 2).map(function (name) {
      return { game: name, entry: gameEntryByName(name), score: scores[name] };
    }).filter(function (x) { return !!x.entry; });
  }

  function analyze(query) {
    var direct = directGame(query);
    if (direct) {
      return {
        kind: 'direct-game', directEntry: direct, classification: null,
        recommendations: [{ game: ID_TO_GAME[direct.id], entry: direct, score: Infinity }]
      };
    }
    var classification = classify(query);
    return {
      kind: 'problem', directEntry: null, classification: classification,
      recommendations: recommend(query, classification)
    };
  }

  return {
    GAME_ORDER: GAME_ORDER.slice(),
    GAME_TO_ID: Object.assign({}, GAME_TO_ID),
    normalize: normalize, compact: compact, similarity: similarity,
    directGame: directGame, classify: classify, recommend: recommend, analyze: analyze
  };
});
