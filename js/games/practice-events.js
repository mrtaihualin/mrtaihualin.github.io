/* Phase 1 authenticated Played evidence. Save provenance is never used as gameplay proof. */
(function (window) {
  'use strict';

  var QUEUE_KEY = 'phase1_practice_event_pending_v1';
  var activeFlush = null;

  function currentUser() {
    return (window.SITE_AUTH && window.SITE_AUTH.user) || (window.READING_AUTH && window.READING_AUTH.user) || null;
  }
  function ownerSnapshot() {
    var user = currentUser();
    return user ? { id: String(user.id), epoch: Number(window.SITE_AUTH && SITE_AUTH.learningOwnerEpoch) || 0 } : null;
  }
  function ownerIsCurrent(owner) {
    var current = ownerSnapshot();
    return !!(owner && current && owner.id === current.id && owner.epoch === current.epoch);
  }
  function readQueue(owner) {
    if (!owner) return { owner_id: '', entries: {} };
    try {
      var value = JSON.parse(localStorage.getItem(QUEUE_KEY) || '{}');
      if (!value || value.owner_id !== owner.id || !value.entries || typeof value.entries !== 'object') {
        return { owner_id: owner.id, entries: {} };
      }
      return value;
    } catch (e) { return { owner_id: owner.id, entries: {} }; }
  }
  function writeQueue(owner, queue) {
    if (!ownerIsCurrent(owner)) return;
    try {
      if (Object.keys(queue.entries).length) localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
      else localStorage.removeItem(QUEUE_KEY);
    } catch (e) {}
  }
  function client() {
    try { return window.getSupabaseClient ? window.getSupabaseClient() : null; }
    catch (e) { return null; }
  }
  function invoke(payload) {
    var sb = client();
    if (!sb || !sb.functions || !sb.functions.invoke) return Promise.reject(new Error('practice_events_client_unavailable'));
    if (!window.NetworkGuard || !NetworkGuard.request) return Promise.reject(new Error('practice_events_network_guard_unavailable'));
    var request = function () { return sb.functions.invoke('practice-events', { body: payload }); };
    return NetworkGuard.request(request, 'practice-events', {}, 12000, null);
  }
  function minimizedReport(report) {
    if (!report || report.schema_version !== 'round-report-v1' || !report.round_id || !report.ended_at || !Array.isArray(report.items) || !report.items.length) return null;
    return {
      action: 'record',
      round_id: String(report.round_id),
      game_type: String(report.game_type || ''),
      completed_at: String(report.ended_at),
      items: report.items.map(function (item, index) {
        return {
          ordinal: index + 1,
          content_ref: {
            source: String(item && item.content_ref && item.content_ref.source || ''),
            key: String(item && item.content_ref && item.content_ref.key || '')
          },
          is_correct: !!(item && item.is_correct),
          wrong_count: Math.max(0, Number(item && item.wrong_count) || 0),
          hint_used: item && item.hint_used == null ? null : !!item.hint_used,
          listen_count: item && item.listen_count == null ? null : Math.max(0, Number(item.listen_count) || 0)
        };
      })
    };
  }
  function permanentError(result) {
    var code = String(result && result.data && result.data.error || result && result.error && result.error.message || '');
    return /^(?:invalid_|duplicate_|unknown_content_ref|replay_conflict)/.test(code);
  }
  function removeQueuedRound(owner, roundId) {
    if (!ownerIsCurrent(owner)) return;
    var latest = readQueue(owner);
    if (!latest.entries[roundId]) return;
    delete latest.entries[roundId];
    writeQueue(owner, latest);
  }
  function flush() {
    var owner = ownerSnapshot();
    if (!owner) return Promise.resolve(false);
    // A report or owner change may arrive while a previous owner/round is in
    // flight. Chain another drain after the active one instead of returning
    // the old promise; otherwise the newly queued evidence can wait forever.
    if (activeFlush) return activeFlush.then(function () { return flush(); }, function () { return flush(); });
    var queue = readQueue(owner);
    var ids = Object.keys(queue.entries);
    activeFlush = ids.reduce(function (chain, roundId) {
      return chain.then(function () {
        if (!ownerIsCurrent(owner) || !queue.entries[roundId]) return;
        return invoke(queue.entries[roundId]).then(function (result) {
          if (!ownerIsCurrent(owner)) return;
          if (result && !result.error && result.data && result.data.ok) {
            // Merge the acknowledgement into the latest persisted queue. A
            // stale snapshot must never erase reports queued during this call.
            removeQueuedRound(owner, roundId);
          } else if (permanentError(result)) {
            removeQueuedRound(owner, roundId);
            if (window.console && console.warn) console.warn('[practice-events] rejected:', result && (result.data || result.error));
          }
        }, function () {});
      });
    }, Promise.resolve()).then(function () { return ownerIsCurrent(owner); });
    activeFlush = activeFlush.then(function (value) { activeFlush = null; return value; }, function () { activeFlush = null; return false; });
    return activeFlush;
  }
  function submitReport(report) {
    var owner = ownerSnapshot();
    var payload = minimizedReport(report);
    if (!owner || !payload) return Promise.resolve(false);
    var queue = readQueue(owner);
    queue.entries[payload.round_id] = payload;
    writeQueue(owner, queue);
    return flush();
  }
  function status(items) {
    var owner = ownerSnapshot();
    if (!owner || !Array.isArray(items) || !items.length) return Promise.resolve({});
    var payload = { action: 'status', items: items.slice(0, 30).map(function (item) {
      return { kind: item.kind === 'sentence' ? 'sentence' : 'word', key: String(item.key || '') };
    }) };
    return invoke(payload).then(function (result) {
      if (!ownerIsCurrent(owner)) return {};
      if (result && !result.error && result.data && result.data.ok) return result.data.items || {};
      throw new Error(String(result && result.data && result.data.error || 'practice_event_status_unavailable'));
    });
  }

  window.PracticeEvents = {
    submitReport: submitReport,
    status: status,
    flush: flush,
    pendingCount: function () {
      var owner = ownerSnapshot();
      return owner ? Object.keys(readQueue(owner).entries).length : 0;
    },
    queueKey: QUEUE_KEY
  };

  window.addEventListener('online', flush);
  try { if (window.SITE_AUTH && SITE_AUTH.onChange) SITE_AUTH.onChange(function (user) { if (user) flush(); }); } catch (e) {}
})(window);
