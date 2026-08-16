/* Learning Report / Data Foundation — current-round DTO only.
 * Phase 1.5 persistence is intentionally absent from this module.
 */
(function (root) {
  'use strict';

  var FORBIDDEN_KEYS = {
    rawKeystrokes: true, raw_keystrokes: true, keystrokes: true,
    keypresses: true, keyEvents: true, key_events: true
  };

  function clone(value) {
    if (value == null) return value;
    return JSON.parse(JSON.stringify(value));
  }

  function uuid() {
    try { if (root.crypto && root.crypto.randomUUID) return root.crypto.randomUUID(); } catch (e) {}
    var bytes = new Uint8Array(16);
    try { root.crypto.getRandomValues(bytes); }
    catch (e) { for (var i = 0; i < 16; i++) bytes[i] = (Math.random() * 256) | 0; }
    bytes[6] = (bytes[6] & 15) | 64;
    bytes[8] = (bytes[8] & 63) | 128;
    var h = Array.prototype.map.call(bytes, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
  }

  function iso(value) {
    var d = value ? new Date(value) : new Date();
    return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
  }

  function number(value, fallback) {
    value = Number(value);
    return isFinite(value) ? value : (fallback || 0);
  }

  function contentRef(input) {
    input = input || {};
    var source = input.source === 'game_sentences' ? 'game_sentences' : 'game_words';
    var key = String(input.key || '').trim();
    return { source: source, key: key };
  }

  function attempt(input) {
    input = input || {};
    var row = {
      answer: String(input.answer == null ? '' : input.answer),
      is_correct: !!input.is_correct,
      submitted_at: iso(input.submitted_at)
    };
    if (input.syllable != null) row.syllable = number(input.syllable, 0);
    if (input.mode) row.mode = String(input.mode);
    return row;
  }

  function item(input) {
    input = input || {};
    var attempts = Array.isArray(input.attempts) ? input.attempts.map(attempt) : [];
    var words = input.words && Array.isArray(input.words) ? input.words.map(function (word) {
      return { th: String(word && word.th || ''), zh: String(word && word.zh || '') };
    }) : [];
    var row = {
      item_id: input.item_id || null,
      content_ref: contentRef(input.content_ref),
      content_version: input.content_version || null,
      ordinal: Math.max(1, number(input.ordinal, 1)),
      question: String(input.question || ''),
      meaning: String(input.meaning || ''),
      user_answer: String(input.user_answer != null ? input.user_answer : (attempts.length ? attempts[attempts.length - 1].answer : '')),
      correct_answer: String(input.correct_answer || ''),
      is_correct: !!input.is_correct,
      wrong_count: Math.max(0, number(input.wrong_count, 0)),
      item_score: number(input.item_score, 0),
      attempts: attempts,
      hint_used: input.hint_used == null ? null : !!input.hint_used,
      listen_count: input.listen_count == null ? null : Math.max(0, number(input.listen_count, 0)),
      linguistic: input.linguistic ? clone(input.linguistic) : null,
      words: words,
      srs_state: input.srs_state || null,
      review_state: input.review_state || null,
      mastered_state: input.mastered_state == null ? null : !!input.mastered_state
    };
    return row;
  }

  function create(input) {
    input = input || {};
    return {
      schema_version: 'round-report-v1',
      round_id: input.round_id || uuid(),
      game_type: String(input.game_type || ''),
      difficulty: input.difficulty == null ? null : String(input.difficulty),
      mode: input.mode == null ? null : String(input.mode),
      started_at: iso(input.started_at),
      ended_at: input.ended_at ? iso(input.ended_at) : null,
      score: number(input.score, 0),
      correct_count: Math.max(0, number(input.correct_count, 0)),
      wrong_count: Math.max(0, number(input.wrong_count, 0)),
      total_items: Math.max(0, number(input.total_items, 0)),
      submission_id: input.submission_id || null,
      items: Array.isArray(input.items) ? input.items.map(item) : [],
      login_summary: input.login_summary ? clone(input.login_summary) : null
    };
  }

  function restore(snapshot, defaults) {
    var merged = clone(snapshot || {});
    defaults = defaults || {};
    Object.keys(defaults).forEach(function (key) {
      if (merged[key] == null) merged[key] = defaults[key];
    });
    return create(merged);
  }

  function addItem(report, input) {
    if (!report || !Array.isArray(report.items)) throw new Error('invalid round report');
    var row = item(input);
    row.ordinal = report.items.length + 1;
    report.items.push(row);
    report.total_items = report.items.length;
    return row;
  }

  function finish(report, input) {
    input = input || {};
    if (!report) throw new Error('invalid round report');
    report.ended_at = iso(input.ended_at);
    if (input.score != null) report.score = number(input.score, 0);
    if (input.submission_id !== undefined) report.submission_id = input.submission_id || null;
    report.total_items = report.items.length;
    report.correct_count = report.items.filter(function (row) { return row.is_correct; }).length;
    report.wrong_count = report.total_items - report.correct_count;
    return report;
  }

  function setLoginSummary(report, summary) {
    if (!report) return null;
    report.login_summary = summary ? clone(summary) : null;
    return report.login_summary;
  }

  function scanForbidden(value, path, errors) {
    if (!value || typeof value !== 'object') return;
    Object.keys(value).forEach(function (key) {
      var next = path ? path + '.' + key : key;
      if (FORBIDDEN_KEYS[key]) errors.push('forbidden field: ' + next);
      scanForbidden(value[key], next, errors);
    });
  }

  function validate(report) {
    var errors = [];
    if (!report || report.schema_version !== 'round-report-v1') errors.push('invalid schema_version');
    if (!report || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(report.round_id || '')) errors.push('invalid round_id');
    if (!report || !report.game_type) errors.push('game_type required');
    if (!report || !Array.isArray(report.items)) errors.push('items required');
    if (report && Array.isArray(report.items)) report.items.forEach(function (row, index) {
      if (!row.content_ref || !row.content_ref.key) errors.push('content_ref required at item ' + index);
      if (!Array.isArray(row.attempts)) errors.push('attempts required at item ' + index);
    });
    scanForbidden(report, '', errors);
    return { ok: errors.length === 0, errors: errors };
  }

  // Pure Phase 1.5 handoff shape. It deliberately omits user identity and every write mechanism.
  function toPracticeEventDraft(report) {
    var check = validate(report);
    if (!check.ok) throw new Error(check.errors.join('; '));
    return report.items.map(function (row) {
      return {
        session_id: report.round_id,
        item_id: row.item_id,
        content_ref: clone(row.content_ref),
        surface: 'game',
        practice_mode: report.mode || report.difficulty || null,
        skill: report.game_type,
        is_correct: row.is_correct,
        result: row.is_correct ? 'correct' : 'incorrect',
        score_earned: row.item_score,
        wrong_count: row.wrong_count,
        attempts: clone(row.attempts),
        hint_used: row.hint_used,
        listen_count: row.listen_count,
        meta: {
          submission_id: report.submission_id,
          ordinal: row.ordinal,
          content_version: row.content_version
        }
      };
    });
  }

  function esc(value) {
    return String(value == null ? '' : value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function loginSectionsHtml(report) {
    var s = report && report.login_summary;
    if (!s) return '';
    var progress = s.progress || {};
    var srs = s.srs || {};
    var resume = s.resume || {};
    var error = s.error ? '<div class="gsh-login-summary-error">資料暫時無法讀取</div>' : '';
    return '<section class="gsh-login-summary" data-fixed-login-sections="true">'
      + '<h3>帳號學習資料</h3>' + error
      + '<div><b>Progress：</b>' + esc(progress.sessions || 0) + ' 回' + (progress.last_at ? '・最近 ' + esc(progress.last_at) : '') + '</div>'
      + '<div><b>SRS：</b>New ' + esc(srs.new_count || 0) + '・Day 1 ' + esc(srs.day1_count || 0) + '・Day 7 ' + esc(srs.day7_count || 0) + '</div>'
      + '<div><b>Review Needed：</b>' + esc(s.review_needed || 0) + '</div>'
      + '<div><b>Mastered：</b>' + esc(s.mastered || 0) + '</div>'
      + '<div><b>Resume：</b>' + (resume.available ? '有進行中的本機回合' : '目前沒有進行中的回合') + '</div>'
      + '</section>';
  }

  root.RoundReport = {
    create: create,
    restore: restore,
    snapshot: clone,
    addItem: addItem,
    item: item,
    attempt: attempt,
    finish: finish,
    setLoginSummary: setLoginSummary,
    validate: validate,
    toPracticeEventDraft: toPracticeEventDraft,
    loginSectionsHtml: loginSectionsHtml,
    uuid: uuid
  };
})(typeof window !== 'undefined' ? window : globalThis);
