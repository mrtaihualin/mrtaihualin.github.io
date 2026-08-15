// Phase 1 canonical Login Free state runtime.
//
// Architecture boundary:
// - Server-owned scores/history/SRS/profile/personal content keep their existing canonical tables.
// - Client-owned learning caches + account Resume use the existing tone_progress.data JSON envelope.
// - tone_progress.updated_at is an opaque compare-and-swap token. A stale device must re-read,
//   rebase its pending slices, then retry; it may never blindly overwrite a newer successful save.
// - Guest Resume stays device-local and is never promoted into an account after login.
(function (global) {
  'use strict';

  var TABLE = 'tone_progress';
  var ENVELOPE_KEY = '_phase1Canonical';
  var META_KEY = 'phase1_canonical_meta_v1';
  var ACCOUNT_RESUME_KEY = 'phase1_account_resume_v1';
  var SYNC_KEYS = [
    'tf_srs_v1', 'rgv3_save', 'wo_srs_v1',
    'tf_badges_v1', 'tf_streak_v1', 'tf_word_wrong_v1', 'tf_wrong_stats_v1',
    ACCOUNT_RESUME_KEY
  ];
  var MANIFEST = {
    profile: { authority: 'profiles', mode: 'server-row' },
    score: { authority: 'game_score_submissions', mode: 'server-authoritative' },
    sessions: { authority: 'tone_sessions/reading_sessions', mode: 'server-authoritative' },
    listening_srs: { authority: 'tone_srs_state(game=listening)', mode: 'server-authoritative' },
    personal_words_sentences: { authority: 'learning_saved_items', mode: 'server-row+tombstone' },
    learning_memory: { authority: 'learning_memory/practice_events', mode: 'server-authoritative' },
    client_learning_cache: { authority: 'tone_progress.data.' + ENVELOPE_KEY, mode: 'cas-slices' },
    account_resume: { authority: 'tone_progress.data.' + ENVELOPE_KEY + '.' + ACCOUNT_RESUME_KEY, mode: 'cas-replace' }
  };

  var cfg = global.SUPABASE_CONFIG || {};
  var sb = null;
  var user = null;
  var remoteData = {};
  var pushTimer = null;
  var pushInFlight = false;
  var pushAgain = false;
  var retryPending = false;
  var booted = false;
  var ownerGeneration = 0;
  var requestSequence = 0;
  var boundOwnerEpoch = 0;
  var latestPullRequest = 0;

  function storageGet(key) { try { return localStorage.getItem(key); } catch (e) { return null; } }
  function storageSet(key, value) { try { localStorage.setItem(key, value); return true; } catch (e) { return false; } }
  function storageRemove(key) { try { localStorage.removeItem(key); } catch (e) {} }
  function clone(value) { return value == null ? value : JSON.parse(JSON.stringify(value)); }
  function parse(raw, fallback) { try { return raw == null ? fallback : JSON.parse(raw); } catch (e) { return fallback; } }
  function stable(value) {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
    return '{' + Object.keys(value).sort().map(function (key) {
      return JSON.stringify(key) + ':' + stable(value[key]);
    }).join(',') + '}';
  }
  function mutationId() {
    return String(Date.now()) + '-' + Math.random().toString(36).slice(2, 12);
  }
  function emptyMeta(owner) {
    return { schema: 1, owner: owner || '', baseToken: null, ack: {}, pending: {} };
  }
  function loadMeta() {
    var owner = user && String(user.id) || '';
    var meta = parse(storageGet(META_KEY), emptyMeta(owner));
    if (!meta || meta.schema !== 1 || meta.owner !== owner) meta = emptyMeta(owner);
    meta.ack = meta.ack || {};
    meta.pending = meta.pending || {};
    return meta;
  }
  function saveMeta(meta) { storageSet(META_KEY, JSON.stringify(meta)); }
  function ownerReady() {
    if (!user || !global.PHASE1_ACCOUNT_BOUNDARY) return false;
    try {
      global.PHASE1_ACCOUNT_BOUNDARY.bind(user);
      return storageGet(global.PHASE1_ACCOUNT_BOUNDARY.ownerKey) === String(user.id);
    } catch (e) { return false; }
  }
  function ownerEpoch() {
    return Number(global.SITE_AUTH && global.SITE_AUTH.learningOwnerEpoch) || 0;
  }
  function ownerContext() {
    return {
      ownerId: user && String(user.id) || '',
      ownerEpoch: ownerEpoch(),
      generation: ownerGeneration,
      requestId: ++requestSequence
    };
  }
  function contextIsCurrent(context) {
    if (!context || !user || String(user.id) !== context.ownerId || ownerGeneration !== context.generation) return false;
    if (ownerEpoch() !== context.ownerEpoch) return false;
    try {
      return !!(global.PHASE1_ACCOUNT_BOUNDARY &&
        storageGet(global.PHASE1_ACCOUNT_BOUNDARY.ownerKey) === context.ownerId);
    } catch (e) { return false; }
  }
  function localValue(key) {
    var raw = storageGet(key);
    return raw == null ? null : parse(raw, null);
  }
  function scanLocal(meta) {
    SYNC_KEYS.forEach(function (key) {
      var value = localValue(key);
      var hash = stable(value);
      if (meta.ack[key] !== hash) {
        var old = meta.pending[key];
        if (!old || stable(old.value) !== hash) {
          meta.pending[key] = { mutationId: mutationId(), value: clone(value), deleted: value == null };
        }
      }
    });
    saveMeta(meta);
    return meta;
  }
  function hasPending(meta) { return Object.keys(meta.pending || {}).length > 0; }
  function remoteEnvelope(data) {
    var env = data && data[ENVELOPE_KEY];
    if (!env || env.schema !== 1 || !env.slices) env = { schema: 1, slices: {} };
    return clone(env);
  }
  function remoteSliceValue(data, env, key) {
    if (Object.prototype.hasOwnProperty.call(env.slices, key)) {
      return env.slices[key] && !env.slices[key].deleted ? clone(env.slices[key].value) : null;
    }
    // One-time compatibility with the old progress-sync JSON shape.
    return data && Object.prototype.hasOwnProperty.call(data, key) ? clone(data[key]) : null;
  }
  function applyRemote(data, token) {
    var meta = loadMeta();
    var env = remoteEnvelope(data || {});
    SYNC_KEYS.forEach(function (key) {
      if (meta.pending[key]) return;
      var value = remoteSliceValue(data || {}, env, key);
      if (value == null) storageRemove(key); else storageSet(key, JSON.stringify(value));
      meta.ack[key] = stable(value);
    });
    meta.baseToken = token || null;
    saveMeta(meta);
    try { global.dispatchEvent(new CustomEvent('phase1canonical:changed')); } catch (e) {}
    return meta;
  }
  function buildWrite(meta) {
    var data = clone(remoteData || {});
    var env = remoteEnvelope(data);
    Object.keys(meta.pending).forEach(function (key) {
      var item = meta.pending[key];
      env.slices[key] = {
        mutationId: item.mutationId,
        deleted: !!item.deleted,
        value: item.deleted ? null : clone(item.value)
      };
    });
    data[ENVELOPE_KEY] = env;
    return data;
  }
  function guarded(promiseFactory, label) {
    if (global.NetworkGuard) return global.NetworkGuard.request(promiseFactory, label, {}, 10000, null);
    try { return Promise.resolve(promiseFactory()); } catch (e) { return Promise.reject(e); }
  }
  function warn(where, error) {
    try { console.warn('[phase1-canonical] ' + where + ':', error && error.message || error); } catch (e) {}
  }
  function finishPush(error, result, sent, context, flight) {
    if (pushInFlight !== flight || !contextIsCurrent(context)) return;
    pushInFlight = null;
    if (error) {
      retryPending = true;
      if (error.code === '23505') pull(true);
      else warn('save failed; waiting for online/manual retry', error);
    } else if (!result || !result.data) {
      // CAS miss: another device saved first. Re-read and rebase pending slices.
      retryPending = true;
      pull(true);
    } else {
      retryPending = false;
      remoteData = clone(result.data.data || {});
      var meta = loadMeta();
      Object.keys(sent || {}).forEach(function (key) {
        var current = meta.pending[key];
        if (!current || current.mutationId !== sent[key].mutationId) return;
        meta.ack[key] = stable(sent[key].deleted ? null : sent[key].value);
        delete meta.pending[key];
      });
      meta.baseToken = result.data.updated_at || null;
      saveMeta(meta);
    }
    if (pushAgain) { pushAgain = false; flush(); }
  }
  function push(meta) {
    if (!sb || !user || !ownerReady() || !hasPending(meta)) return;
    if (pushInFlight) { pushAgain = true; return; }
    var context = ownerContext();
    var flight = { requestId: context.requestId, ownerId: context.ownerId, generation: context.generation };
    pushInFlight = flight;
    var sent = clone(meta.pending);
    var updatedAt = new Date().toISOString();
    var row = { user_id: context.ownerId, data: buildWrite(meta), updated_at: updatedAt };
    var request;
    if (meta.baseToken) {
      request = function () {
        return sb.from(TABLE).update(row).eq('user_id', context.ownerId).eq('updated_at', meta.baseToken)
          .select('data,updated_at').maybeSingle();
      };
    } else {
      request = function () {
        return sb.from(TABLE).insert(row).select('data,updated_at').maybeSingle();
      };
    }
    guarded(request, 'phase1-canonical-push').then(function (res) {
      finishPush(res && res.error, res, sent, context, flight);
    }, function (error) { finishPush(error, null, sent, context, flight); });
  }
  function flush() {
    if (!sb || !user || !ownerReady()) return;
    var meta = scanLocal(loadMeta());
    push(meta);
  }
  function schedule() {
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = setTimeout(flush, 800);
  }
  function pull(fromConflict) {
    if (!sb || !user || !ownerReady()) return;
    var context = ownerContext();
    latestPullRequest = context.requestId;
    var request = function () {
      return sb.from(TABLE).select('data,updated_at').eq('user_id', context.ownerId).maybeSingle();
    };
    guarded(request, 'phase1-canonical-pull').then(function (res) {
      if (!contextIsCurrent(context) || latestPullRequest !== context.requestId) return;
      if (!res || res.error) { retryPending = true; warn('read failed', res && res.error); return; }
      remoteData = clone(res.data && res.data.data || {});
      var meta = applyRemote(remoteData, res.data && res.data.updated_at);
      meta = scanLocal(meta);
      if (hasPending(meta)) push(meta);
      else if (fromConflict) retryPending = false;
    }, function (error) {
      if (!contextIsCurrent(context) || latestPullRequest !== context.requestId) return;
      retryPending = true; warn('read failed', error);
    });
  }
  function resetOwnerRuntime() {
    ownerGeneration += 1;
    latestPullRequest = ++requestSequence;
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = null;
    pushInFlight = null;
    pushAgain = false;
    retryPending = false;
    remoteData = {};
  }
  function bind(nextUser) {
    var next = nextUser && nextUser.id ? nextUser : null;
    var before = user && String(user.id) || '';
    var after = next && String(next.id) || '';
    user = next;
    var nextEpoch = ownerEpoch();
    if (before !== after || boundOwnerEpoch !== nextEpoch) resetOwnerRuntime();
    boundOwnerEpoch = nextEpoch;
    if (!user) return;
    if (!ownerReady()) return;
    nextEpoch = ownerEpoch();
    if (boundOwnerEpoch !== nextEpoch) {
      resetOwnerRuntime();
      boundOwnerEpoch = nextEpoch;
    }
    pull(false);
  }
  function init() {
    if (booted) return;
    booted = true;
    var canInit = cfg.url && cfg.anonKey && global.supabase && global.supabase.createClient;
    sb = canInit ? (global.getSupabaseClient ? global.getSupabaseClient() : global.supabase.createClient(cfg.url, cfg.anonKey)) : null;
    if (!sb) return;
    if (global.SITE_AUTH && global.SITE_AUTH.onChange) global.SITE_AUTH.onChange(bind);
    else sb.auth.getSession().then(function (res) {
      bind(res && res.data && res.data.session && res.data.session.user);
    }, function () {});
    global.addEventListener('online', function () { if (retryPending) pull(false); else schedule(); });
    global.addEventListener('pagehide', flush);
    global.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') flush(); });
    setInterval(function () { if (user) flush(); }, 5000);
  }

  global.PHASE1_CANONICAL = {
    init: init,
    pull: function () { pull(false); },
    flush: flush,
    schedule: schedule,
    resumeKey: ACCOUNT_RESUME_KEY,
    manifest: function () { return clone(MANIFEST); },
    status: function () {
      var meta = loadMeta();
      return { owner: meta.owner || null, baseToken: meta.baseToken, pending: Object.keys(meta.pending || {}), retryPending: retryPending };
    },
    _test: { stable: stable, emptyMeta: emptyMeta, applyRemote: applyRemote, buildWrite: buildWrite, syncKeys: SYNC_KEYS.slice() }
  };
  init();
})(window);
