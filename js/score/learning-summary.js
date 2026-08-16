/* Canonical read-only Login Free learning summary shared by Progress and Round Report. */
(function (root) {
  'use strict';

  var SKILL_CODES = ['tone', 'reading', 'listening', 'typing', 'wordorder'];

  function normalizeGame(value) {
    if (value === 'word_order') return 'wordorder';
    return value || 'reading';
  }

  function emptySkillData() {
    var result = {};
    SKILL_CODES.forEach(function (code) { result[code] = { sessions: [], srs: [], lastAt: null }; });
    return result;
  }

  function queryData(client, userId) {
    if (!client || !userId) return Promise.reject(new Error('login summary unavailable'));
    var tone = client.from('tone_sessions').select('created_at,mode,score,total,wrong_words').eq('user_id', userId).order('created_at', { ascending: true }).limit(200);
    var sessions = client.from('reading_sessions').select('created_at,score,games,game,wrong_items').eq('user_id', userId).order('created_at', { ascending: true }).limit(500);
    var srs = client.from('tone_srs_state').select('game,stage,due_date,mastered').eq('user_id', userId);
    return Promise.all([Promise.resolve(tone), Promise.resolve(sessions), Promise.resolve(srs)]);
  }

  function organize(toneRows, sessionRows, srsRows) {
    var result = emptySkillData();
    (toneRows || []).forEach(function (row) { result.tone.sessions.push(row); });
    (sessionRows || []).forEach(function (row) {
      var code = normalizeGame(row.game);
      if (result[code]) result[code].sessions.push(row);
    });
    (srsRows || []).forEach(function (row) {
      var code = normalizeGame(row.game === 'wordorder' ? 'word_order' : row.game);
      if (result[code]) result[code].srs.push(row);
    });
    Object.keys(result).forEach(function (code) {
      var rows = result[code].sessions;
      result[code].lastAt = rows.length ? rows[rows.length - 1].created_at : null;
    });
    return result;
  }

  function taipeiDay() {
    try { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(new Date()); }
    catch (e) { return new Date().toISOString().slice(0, 10); }
  }

  function summarize(data, resumeGameId) {
    data = data || { sessions: [], srs: [], lastAt: null };
    var counts = { new_count: 0, day1_count: 0, day7_count: 0 };
    var review = 0, mastered = 0, today = taipeiDay();
    (data.srs || []).forEach(function (row) {
      if (row.mastered) mastered++;
      else if (Number(row.stage) >= 2) counts.day7_count++;
      else if (Number(row.stage) === 1) counts.day1_count++;
      else counts.new_count++;
      if (!row.mastered && row.due_date && row.due_date <= today) review++;
    });
    var resume = null;
    try { resume = root.GameResume && root.GameResume.load(resumeGameId); } catch (e) {}
    return {
      progress: { sessions: (data.sessions || []).length, last_at: data.lastAt || null },
      srs: counts,
      review_needed: review,
      mastered: mastered,
      resume: { available: !!resume, saved_at: resume && resume._savedAt || null },
      error: null
    };
  }

  function rows(result) {
    result = result || [];
    for (var i = 0; i < result.length; i++) if (result[i] && result[i].error) throw result[i].error;
    return [result[0] && result[0].data || [], result[1] && result[1].data || [], result[2] && result[2].data || []];
  }

  function loadForGame(game, resumeGameId, options) {
    options = options || {};
    var user = options.user || (root.READING_AUTH && root.READING_AUTH.user) || (root.SITE_AUTH && root.SITE_AUTH.user);
    if (!user) return Promise.resolve(null);
    var client = options.client;
    try { if (!client && root.getSupabaseClient) client = root.getSupabaseClient(); } catch (e) {}
    return queryData(client, user.id).then(function (result) {
      var r = rows(result);
      var all = organize(r[0], r[1], r[2]);
      return summarize(all[normalizeGame(game)] || null, resumeGameId);
    }).catch(function () {
      var empty = summarize(null, resumeGameId);
      empty.error = 'unavailable';
      return empty;
    });
  }

  root.LearningSummary = {
    normalizeGame: normalizeGame,
    emptySkillData: emptySkillData,
    queryData: queryData,
    organize: organize,
    summarize: summarize,
    loadForGame: loadForGame
  };
})(typeof window !== 'undefined' ? window : globalThis);
