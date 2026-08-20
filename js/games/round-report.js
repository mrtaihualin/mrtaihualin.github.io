/* Learning Report / Data Foundation — current-round DTO only.
 * Phase 1.5 persistence is intentionally absent from this module.
 */
(function (root) {
  'use strict';

  var FORBIDDEN_KEYS = {
    rawKeystrokes: true, raw_keystrokes: true, keystrokes: true,
    keypresses: true, keyEvents: true, key_events: true
  };
  var DAILY_KEY = 'gsh_game_daily_activity_v1';
  var PRINT_COPY = {
    summary: '本輪摘要', activity: '今日活動', detail: '本輪詳細紀錄', account: '帳號學習資料',
    score: '本輪得分', completed: '完成', firstCorrect: '首次答對', question: '題目', meaning: '意思',
    answer: '作答', correctAnswer: '正解', result: '結果', correct: '答對', incorrect: '待加強',
    wrongCount: '錯誤次數', itemScore: '本題得分', hintEffect: '提示影響', hintScore: '使用提示後本題得分',
    listenCount: '聆聽次數', words: '逐字', choiceMode: '選擇答案', typedMode: '輸入答案',
    listeningScore: '聽力分數', typingScore: 'Typing 分數', noItems: '本輪沒有可列印的紀錄',
    customDisclaimer: '自訂內容由玩家自行輸入，系統不會檢查或修正內容。'
  };
  var DAILY_LABELS = {
    tone: ['今日聲調練習', '字'], reading: ['今日拼讀', '字'], listening: ['今日聆聽', '題'],
    typing: ['今日打字', '字'], wordorder: ['今日語序練習', '句'], lego: ['今日完成造句', '句']
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
    recordDailyActivity(report.game_type, report.total_items, report.round_id);
    return report;
  }

  function taipeiDay(value) {
    var date = value ? new Date(value) : new Date();
    try {
      var parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
      var out = {};
      parts.forEach(function (part) { if (part.type !== 'literal') out[part.type] = part.value; });
      if (out.year && out.month && out.day) return out.year + '-' + out.month + '-' + out.day;
    } catch (e) {}
    return date.toISOString().slice(0, 10);
  }

  function readDaily() {
    var day = taipeiDay();
    var data = null;
    try { data = JSON.parse(root.localStorage && root.localStorage.getItem(DAILY_KEY) || 'null'); } catch (e) {}
    if (!data || data.day !== day || !data.games || typeof data.games !== 'object') data = { day: day, games: {} };
    return data;
  }

  function writeDaily(data) {
    try { if (root.localStorage) root.localStorage.setItem(DAILY_KEY, JSON.stringify(data)); } catch (e) {}
  }

  function recordDailyActivity(gameType, count, roundId) {
    gameType = String(gameType || '');
    count = Math.max(0, number(count, 0));
    if (!gameType || !count) return dailyActivity(gameType);
    var data = readDaily();
    var row = data.games[gameType] || { count: 0, rounds: {} };
    if (!row.rounds || typeof row.rounds !== 'object') row.rounds = {};
    var identity = String(roundId || '');
    if (identity && row.rounds[identity]) return Math.max(0, number(row.count, 0));
    row.count = Math.max(0, number(row.count, 0)) + count;
    if (identity) row.rounds[identity] = true;
    data.games[gameType] = row;
    writeDaily(data);
    return row.count;
  }

  function dailyActivity(gameType) {
    var row = readDaily().games[String(gameType || '')];
    return row ? Math.max(0, number(row.count, 0)) : 0;
  }

  function dailyActivityText(gameType, count) {
    gameType = String(gameType || '');
    var label = DAILY_LABELS[gameType] || ['今日完成', '題'];
    var total = count == null ? dailyActivity(gameType) : Math.max(0, number(count, 0));
    return label[0] + '：' + total + ' ' + label[1];
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

  function itemMode(row) {
    var mode = row && row.linguistic && row.linguistic.answer_mode;
    if (!mode && row && row.attempts && row.attempts.length) mode = row.attempts[row.attempts.length - 1].mode;
    return mode === 'type' ? 'type' : 'mc';
  }

  function firstCorrectCount(report) {
    return (report && report.items || []).filter(function (row) {
      var first = row && row.attempts && row.attempts[0];
      return !!(row && row.is_correct && !row.hint_used && Number(row.wrong_count || 0) === 0 && (!first || first.is_correct));
    }).length;
  }

  function printSummaryRows(config, report) {
    if (Array.isArray(config.summaryRows)) return config.summaryRows;
    var total = report && report.items ? report.items.length : 0;
    return [
      { label: PRINT_COPY.score, value: number(report && report.score, 0) + ' 分', primary: true },
      { label: PRINT_COPY.completed, value: total + ' / ' + total },
      { label: PRINT_COPY.firstCorrect, value: firstCorrectCount(report) + ' / ' + total }
    ];
  }

  function printDetailRows(items, config) {
    if (!items.length) return '<div class="rr-empty">' + PRINT_COPY.noItems + '</div>';
    return '<table class="rr-detail-table"><thead><tr><th>#</th><th>' + PRINT_COPY.question + '</th><th>' + PRINT_COPY.meaning + '</th><th>' + PRINT_COPY.result + '</th></tr></thead><tbody>'
      + items.map(function (row, index) {
        var extra = [];
        if (row.user_answer) extra.push(PRINT_COPY.answer + '：' + esc(row.user_answer));
        if (row.correct_answer) extra.push(PRINT_COPY.correctAnswer + '：' + esc(row.correct_answer));
        if (row.linguistic && row.linguistic.reading_th && config.gameType !== 'lego') extra.push('讀音：' + esc(row.linguistic.reading_th));
        if (row.listen_count != null) extra.push(PRINT_COPY.listenCount + '：' + Math.max(0, number(row.listen_count, 0)));
        if (row.wrong_count != null) extra.push(PRINT_COPY.wrongCount + '：' + Math.max(0, number(row.wrong_count, 0)));
        extra.push(PRINT_COPY.itemScore + '：' + number(row.item_score, 0));
        if (row.hint_used) extra.push(PRINT_COPY.hintEffect + '：' + PRINT_COPY.hintScore + ' ' + number(row.item_score, 0));
        if (row.words && row.words.length) extra.push(PRINT_COPY.words + '：' + row.words.map(function (word) { return esc(word.th) + '＝' + esc(word.zh); }).join('・'));
        if (row.linguistic && row.linguistic.custom) extra.push(PRINT_COPY.customDisclaimer);
        return '<tr><td>' + (index + 1) + '</td><td><strong>' + esc(row.question) + '</strong><div class="rr-item-extra">' + extra.join('<br>') + '</div></td>'
          + '<td>' + esc(row.meaning || '') + '</td><td class="rr-status ' + (row.is_correct ? 'ok' : 'bad') + '">' + (row.is_correct ? PRINT_COPY.correct : PRINT_COPY.incorrect) + '</td></tr>';
      }).join('') + '</tbody></table>';
  }

  function modeSections(report, config) {
    if (!config.groupListeningModes) return printDetailRows(report.items || [], config);
    return ['mc', 'type'].map(function (mode) {
      var items = (report.items || []).filter(function (row) { return itemMode(row) === mode; });
      if (!items.length) return '';
      var listening = 0, typing = 0;
      items.forEach(function (row) {
        listening += number(row.linguistic && row.linguistic.listening_score, mode === 'mc' ? row.item_score : 0);
        typing += number(row.linguistic && row.linguistic.typing_score, 0);
      });
      return '<div class="rr-mode"><h3>' + (mode === 'type' ? PRINT_COPY.typedMode : PRINT_COPY.choiceMode) + '</h3>'
        + '<div class="rr-mode-score">' + PRINT_COPY.listeningScore + '：' + listening + (mode === 'type' ? '・' + PRINT_COPY.typingScore + '：' + typing : '') + '</div>'
        + printDetailRows(items, config) + '</div>';
    }).join('');
  }

  function printDocument(config) {
    config = config || {};
    var report = config.report || create({ game_type: config.gameType || '' });
    var gameType = String(config.gameType || report.game_type || '');
    var today = new Date().toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' });
    var summary = printSummaryRows(config, report).map(function (row) {
      return '<div class="rr-summary-row"><span>' + esc(row.label) + '</span><strong' + (row.primary ? ' class="primary"' : '') + '>' + esc(row.value) + '</strong></div>';
    }).join('');
    var difficulty = config.showDifficulty === false ? '' : String(config.difficulty == null ? (report.difficulty || '') : config.difficulty);
    var dailyCount = config.dailyCount == null ? dailyActivity(gameType) : config.dailyCount;
    var account = loginSectionsHtml(report);
    return '<!DOCTYPE html><html lang="zh-TW"><head><meta charset="utf-8"><title>' + esc(config.documentTitle || config.title || '本輪學習紀錄') + '</title>'
      + '<style>@page{size:A4 portrait;margin:10mm}*{box-sizing:border-box}body{margin:0;background:#fff;color:#1c1c1c;font-family:"Noto Sans TC","PingFang TC",sans-serif}.rr-page{max-width:190mm;margin:0 auto;background:#fbf5e7;padding:8mm}.rr-card{background:#fff;border:1px solid #c8973a}.rr-head{display:flex;justify-content:space-between;gap:10mm;background:#1c1c1c;border-bottom:3px solid #c8973a;color:#fff;padding:7mm}.rr-head h1{margin:0;font:700 20px "Noto Serif TC","PingFang TC",serif}.rr-brand{color:#c8973a;font-size:9px;letter-spacing:.2em;margin-top:4px}.rr-head-meta{text-align:right;color:#c8973a;font-size:11px;white-space:nowrap}.rr-body{padding:6mm}.rr-section{margin:0 0 6mm;break-inside:avoid-page;page-break-inside:avoid}.rr-section.rr-detail{break-inside:auto;page-break-inside:auto}.rr-section h2{font-size:15px;color:#8b6310;border-bottom:1px solid rgba(139,99,16,.25);padding-bottom:3px;margin:0 0 3mm}.rr-summary-row{display:flex;justify-content:space-between;gap:12px;font-size:12px;padding:2px 0}.rr-summary-row strong.primary{font-size:19px;color:#5a3e0a}.rr-activity{font-weight:700;color:#5a3e0a}.rr-detail-table{width:100%;border-collapse:collapse;font-size:11px}.rr-detail-table th{color:#8b6310;text-align:left;border-bottom:1.5px solid #c8973a;padding:5px}.rr-detail-table td{padding:6px 5px;border-bottom:1px solid #eadfc9;vertical-align:top;overflow-wrap:anywhere}.rr-detail-table tr{break-inside:avoid;page-break-inside:avoid}.rr-item-extra{font-size:9.5px;color:#666;line-height:1.45;margin-top:3px}.rr-status.ok{color:#2e7d32}.rr-status.bad{color:#c62828}.rr-mode{margin:0 0 5mm}.rr-mode h3{font-size:13px;color:#5a3e0a;margin:0 0 2px}.rr-mode-score{font-size:10px;color:#8b6310;margin-bottom:2mm}.rr-empty{font-size:12px;color:#777}.gsh-login-summary{font-size:11px;line-height:1.55}.rr-footer{text-align:center;color:#8b6310;font-size:9px;letter-spacing:.15em;padding:5mm 2mm 1mm}@media print{.rr-page{padding:0;background:#fff}}</style>'
      + '</head><body><main class="rr-page"><div class="rr-card"><header class="rr-head"><div><h1>' + esc(config.title || '本輪學習紀錄') + '</h1><div class="rr-brand">mrtaihualin.com</div></div><div class="rr-head-meta"><div>' + esc(today) + '</div>' + (difficulty ? '<div>' + esc(difficulty) + '</div>' : '') + '</div></header><div class="rr-body">'
      + '<section class="rr-section" data-print-section="summary"><h2>' + PRINT_COPY.summary + '</h2>' + summary + '</section>'
      + '<section class="rr-section" data-print-section="activity"><h2>' + PRINT_COPY.activity + '</h2><div class="rr-activity">' + esc(dailyActivityText(gameType, dailyCount)) + '</div></section>'
      + '<section class="rr-section rr-detail" data-print-section="detail"><h2>' + PRINT_COPY.detail + '</h2>' + modeSections(report, { gameType: gameType, groupListeningModes: !!config.groupListeningModes }) + '</section>'
      + (account ? '<section class="rr-section" data-print-section="account">' + account + '</section>' : '')
      + '</div></div><footer class="rr-footer">泰華眼裡的泰語教學　·　mrtaihualin.com</footer></main></body></html>';
  }

  function openPrint(config) {
    var win = root.open ? root.open('', '_blank') : null;
    if (!win) return false;
    win.document.open();
    win.document.write(printDocument(config));
    win.document.close();
    win.focus();
    root.setTimeout(function () { try { win.print(); } catch (e) {} }, 600);
    return true;
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
    recordDailyActivity: recordDailyActivity,
    dailyActivity: dailyActivity,
    dailyActivityText: dailyActivityText,
    printDocument: printDocument,
    openPrint: openPrint,
    uuid: uuid
  };
})(typeof window !== 'undefined' ? window : globalThis);
