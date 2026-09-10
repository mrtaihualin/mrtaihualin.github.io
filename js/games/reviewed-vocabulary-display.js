/**
 * Presentation helpers for Lin-reviewed vocabulary records.
 *
 * This module deliberately contains no Thai spelling, consonant-class, vowel-length,
 * live/dead, or tone rules. It only displays fields already present in the canonical
 * catalog. Missing authority stays missing; callers must fail closed instead of guessing.
 */
(function (global) {
  'use strict';

  var TONE_ZH = {
    'สามัญ': '第一聲',
    'เอก': '第二聲',
    'โท': '第三聲',
    'ตรี': '第四聲',
    'จัตวา': '第五聲'
  };
  var ARROW = ' <span class="rule-arrow">→</span> ';

  function present(value) {
    return value != null && String(value).trim() !== '' && value !== 'ไม่มี';
  }

  function reviewedSyllable(value) {
    var record = value && value.catalog;
    if (record && Array.isArray(record.syllables)) {
      if (record.syllables.length !== 1) throw new Error('CATALOG_AUTHORITY_INCOMPLETE: syllable selection required');
      record = record.syllables[0];
    }
    if (!record || typeof record !== 'object' || Array.isArray(record)) {
      throw new Error('CATALOG_AUTHORITY_INCOMPLETE: reviewed syllable missing');
    }
    return record;
  }

  function getAnswerSyls(entry) {
    if (!entry || !Array.isArray(entry.syls) || !entry.syls.length) {
      throw new Error('CATALOG_AUTHORITY_INCOMPLETE: reviewed syllables missing');
    }
    return entry.syls;
  }

  function buildAnswerHeader(syllable) {
    var record = reviewedSyllable(syllable);
    var spelling = syllable.th;
    if (!spelling) throw new Error('CATALOG_AUTHORITY_INCOMPLETE: reviewed spelling missing');
    var toneName = record.toneName;
    var toneLabel = present(toneName) ? (TONE_ZH[toneName] || toneName) : '';
    return spelling + (toneLabel ? '（' + toneLabel + '）' : '');
  }

  function buildAnswerRows(syllable) {
    var record = reviewedSyllable(syllable);
    var rows = [];
    var lead = record.lead;
    var consonant = record.consonant;
    var cluster = record.cluster;
    var vowel = record.vowel;
    var writtenFinal = record.writtenFinal;
    var toneMark = record.toneMark;
    var toneName = record.toneName;
    var consonantDifference = record.consonantReadDifference;
    var finalDifference = record.finalReadDifference;
    var silent = record.silent;

    if (present(lead)) rows.push({ tag: '前引字', text: lead + ' 置於 ' + (present(consonant) ? consonant : '') + ' 前' });
    if (present(consonant)) rows.push({ tag: '子音', text: present(consonantDifference) ? consonantDifference : consonant });
    if (present(cluster)) rows.push({ tag: '連音', text: (present(consonant) ? consonant : '') + cluster + '（兩個子音一起發音）' });
    if (present(vowel)) rows.push({ tag: '母音', text: vowel });
    if (present(writtenFinal)) rows.push({ tag: '尾音', text: present(finalDifference) ? finalDifference : writtenFinal });
    if (present(silent)) rows.push({ tag: '消音', text: silent + ' 不發音' });
    if (present(toneMark)) {
      var toneLabel = present(toneName) ? (TONE_ZH[toneName] || toneName) : '';
      rows.push({ tag: '聲調符', text: '◌' + toneMark + (toneLabel ? ARROW + toneLabel : '') });
    }
    return rows;
  }

  global.getAnswerSyls = getAnswerSyls;
  global.buildAnswerHeader = buildAnswerHeader;
  global.buildAnswerRows = buildAnswerRows;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { getAnswerSyls: getAnswerSyls, buildAnswerHeader: buildAnswerHeader, buildAnswerRows: buildAnswerRows };
  }
})(typeof window !== 'undefined' ? window : global);
