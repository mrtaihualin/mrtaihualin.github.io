// listening-score.js — กฎคะแนน Listening ที่ล็อกแล้ว (แยกจาก UI เพื่อทดสอบได้)
(function (global) {
  'use strict';
  function wordCount(text) {
    var parts = String(text || '').trim().split(/\s+/).filter(Boolean);
    return Math.max(1, parts.length);
  }
  function primary(mode, text, listens) {
    listens = Math.max(1, Number(listens) || 1);
    if (mode === 'mc') {
      if (listens <= 2) return 5;
      return ({ 3: 3, 4: 2, 5: 1 })[listens] || 0;
    }
    if (wordCount(text) >= 3) {
      if (listens <= 3) return 10;
      return ({ 4: 7, 5: 4, 6: 1 })[listens] || 0;
    }
    if (listens <= 2) return 10;
    return ({ 3: 7, 4: 4, 5: 1 })[listens] || 0;
  }
  function typingUnitCount(word) {
    var reading = String((word && word.readingTH) || '');
    return reading ? Math.max(1, reading.split('-').filter(Boolean).length) : wordCount(word && word.th);
  }
  function typingBonus(word, wrongCount) {
    if (!global.TYPING_SCORE || !global.TYPING_SCORE.score) return 0;
    return global.TYPING_SCORE.score(typingUnitCount(word), wrongCount);
  }
  global.LISTENING_SCORE = {
    wordCount: wordCount,
    primary: primary,
    typingUnitCount: typingUnitCount,
    typingBonus: typingBonus
  };
})(window);
