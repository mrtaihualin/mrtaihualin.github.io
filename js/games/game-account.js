// Phase 1 Free gamification account facade.
// Star/XP/freeze awards are retired. Daily Streak is read only from the
// authenticated practice-events server contract and is never advanced here.
(function () {
  'use strict';

  var PREF_KEY = 'thai_game_acct_v1';

  function currentUserId() {
    try {
      var user = (window.SITE_AUTH && SITE_AUTH.user) || (window.READING_AUTH && READING_AUTH.user);
      return user && user.id ? String(user.id) : '';
    } catch (e) { return ''; }
  }

  function readJson(key) {
    try { return JSON.parse(localStorage.getItem(key) || '{}') || {}; }
    catch (e) { return {}; }
  }

  function writeJson(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
  }

  function cleanLegacyRewards() {
    var prefs = readJson(PREF_KEY);
    ['stars', 'streak', 'lastPlay', 'hardWordsByLevel'].forEach(function (key) { delete prefs[key]; });
    if (Object.keys(prefs).length) writeJson(PREF_KEY, prefs);
    else { try { localStorage.removeItem(PREF_KEY); } catch (e) {} }
    try { localStorage.removeItem('tf_streak_v1'); } catch (e) {}
  }

  function readStatus() {
    var ownerId = currentUserId();
    if (!ownerId) return null;
    var value = readJson(PREF_KEY);
    if (value.gamification_owner_id !== ownerId || !value.gamification_status || value.gamification_status.ok !== true) return null;
    return value.gamification_status;
  }

  function consumeStatus(status, ownerId) {
    ownerId = String(ownerId || currentUserId());
    if (!ownerId || ownerId !== currentUserId() || !status || status.ok !== true) return false;
    var streak = Number(status.current_streak);
    if (!Number.isInteger(streak) || streak < 0 || streak > 1000000) return false;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(status.status_as_of || ''))) return false;
    var prefs = readJson(PREF_KEY);
    prefs.gamification_owner_id = ownerId;
    prefs.gamification_status = {
        ok: true,
        current_streak: streak,
        last_eligible_day: status.last_eligible_day || null,
        status_as_of: String(status.status_as_of),
        preserved_by_outage: status.preserved_by_outage === true
    };
    writeJson(PREF_KEY, prefs);
    ['tf-streak-num', 'rg-streak-num'].forEach(function (id) {
      try { var el = document.getElementById(id); if (el) el.textContent = streak; } catch (e) {}
    });
    try { window.dispatchEvent(new CustomEvent('phase1-gamification-status', { detail: { current_streak: streak } })); }
    catch (e) {}
    return true;
  }

  function requestStatus() {
    try {
      if (window.PracticeEvents && typeof PracticeEvents.gamificationStatus === 'function') {
        return PracticeEvents.gamificationStatus();
      }
    } catch (e) {}
    return Promise.resolve(null);
  }

  cleanLegacyRewards();

  window.GAME_ACCOUNT = {
    // Free has no Star or XP. Compatibility methods fail closed at zero while
    // old cached game code ages out.
    getStars: function () { return 0; },
    addStars: function () { return 0; },
    starsForRound: function () { return 0; },
    addHardStars: function () { return { stars: 0, capped: false, retired: true }; },
    starBadges: [],
    earnedBadges: function () { return []; },
    seedIfEmpty: function () { cleanLegacyRewards(); return 0; },

    getStreak: function () {
      var status = readStatus();
      return status ? status.current_streak : 0;
    },
    bumpStreakToday: function () { return this.getStreak(); },
    consumeStatus: consumeStatus,
    refreshStatus: requestStatus,

    markLevelSeen: function (game, level, totalCount) {
      if (!game) return 0;
      var prefs = readJson(PREF_KEY);
      prefs.seen = prefs.seen || {};
      prefs.seen[game] = prefs.seen[game] || {};
      prefs.seen[game][level] = totalCount || 0;
      writeJson(PREF_KEY, prefs);
      return prefs.seen[game][level];
    },
    newWordsCount: function (game, level, currentCount) {
      var prefs = readJson(PREF_KEY);
      var seen = prefs.seen && prefs.seen[game] && prefs.seen[game][level];
      if (seen == null) return 0;
      return Math.max(0, (currentCount || 0) - seen);
    },

    // The client never reads or writes game_accounts. Authentication and the
    // service-role Edge/RPC contract own every Daily Streak status transition.
    sync: function (_client, userId) {
      if (!userId || String(userId) !== currentUserId()) return;
      requestStatus().catch(function () {});
    }
  };
})();
