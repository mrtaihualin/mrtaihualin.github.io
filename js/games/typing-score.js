// typing-score.js — สูตรคะแนนการพิมพ์ `無提示` ชุดเดียวสำหรับ Typing และ Listening Typing Bonus
(function (global) {
  'use strict';
  function quotaFor(unitCount) {
    return Math.min(4 + Math.max(0, (unitCount || 1) - 4), 9);
  }
  function score(unitCount, wrongCount) {
    var quota = quotaFor(unitCount);
    if ((wrongCount || 0) >= quota) return 0;
    return Math.round(10 - (10 / quota) * (wrongCount || 0));
  }
  global.TYPING_SCORE = { quotaFor: quotaFor, score: score };
})(window);
