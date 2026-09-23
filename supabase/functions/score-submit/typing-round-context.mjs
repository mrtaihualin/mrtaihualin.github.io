// Protected source-only owner for initial Typing round context. It derives
// catalog/state/Combo from authenticated server storage; no browser value may
// supply or override these fields. HTTP round actions remain OFF.
import { catalogBatches, readLearningCatalog } from './learning-catalog.mjs';
import { readCurrentLearningSnapshot } from './learning-snapshot.mjs';
import { loadTypingRoundCheckpoint } from './typing-round-service.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function fail(code) { throw Object.assign(new Error(code), { code }); }
function day(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '') || !Number.isFinite(Date.parse(value + 'T00:00:00Z'))
      || new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) !== value) fail('invalid_typing_day');
  return value;
}

async function resultOf(query, signal) {
  signal?.throwIfAborted();
  const result = signal ? await query.retry(false).abortSignal(signal) : await query;
  signal?.throwIfAborted();
  if (!result || result.error) fail('typing_context_unavailable');
  return result.data;
}

async function canonicalRows(admin, catalog, level, signal) {
  const code = level === 1 ? '初' : '中';
  const keys = catalog.map((row) => row?.content_ref?.key);
  if (!keys.length || new Set(keys).size !== keys.length
      || catalog.some((row) => row?.content_ref?.source !== 'game_words'
        || typeof row.item_id !== 'string' || !row.item_id || typeof row.content_ref.key !== 'string'
        || !row.content_ref.key || row.content_ref.key.trim() !== row.content_ref.key)) fail('invalid_typing_catalog');
  const rows = [];
  for (const batch of catalogBatches(keys)) {
    const data = await resultOf(admin.from('game_words')
      .select('content_key,level,status,access_tier,catalog_version,record_hash,canonical_record')
      .in('content_key', batch).eq('level', code).limit(2000), signal);
    if (!Array.isArray(data)) fail('invalid_typing_catalog');
    rows.push(...data);
  }
  const byKey = new Map(rows.map((row) => [row?.content_key, row]));
  if (rows.length !== keys.length || byKey.size !== keys.length || keys.some((key) => !byKey.has(key))) {
    fail('invalid_typing_catalog');
  }
  return keys.map((key) => byKey.get(key));
}

async function startingCombo(admin, userId, signal) {
  const rows = await resultOf(admin.from('phase1_typing_rounds').select('round_id')
    .eq('user_id', userId).eq('status', 'completed')
    .order('completed_at', { ascending: false }).order('round_id', { ascending: false }).limit(1), signal);
  if (!Array.isArray(rows)) fail('invalid_typing_context');
  if (rows.length === 0) return 0;
  if (rows.length !== 1 || typeof rows[0]?.round_id !== 'string' || !UUID.test(rows[0].round_id)) {
    fail('invalid_typing_context');
  }
  const result = await loadTypingRoundCheckpoint({ admin, userId, roundId: rows[0].round_id.toLowerCase(), signal });
  const combo = result?.checkpoint?.combo;
  if (result?.checkpoint?.complete !== true || !Number.isSafeInteger(combo) || combo < 0) {
    fail('invalid_typing_context');
  }
  return combo;
}

export async function loadTypingInitialRoundContext({ admin, userId, level, today, catalogMode = 'off', signal }) {
  if (typeof userId !== 'string' || !UUID.test(userId)) fail('unauthorized');
  if (![1, 2].includes(level)) fail('invalid_typing_level');
  const exactDay = day(today);
  signal?.throwIfAborted();
  const catalog = await readLearningCatalog(admin, 'typing', level, catalogMode);
  signal?.throwIfAborted();
  const [snapshots, canonical, combo] = await Promise.all([
    readCurrentLearningSnapshot({ admin, userId: userId.toLowerCase(), game: 'typing', level,
      catalog, today: exactDay, signal }),
    canonicalRows(admin, catalog, level, signal),
    startingCombo(admin, userId.toLowerCase(), signal),
  ]);
  signal?.throwIfAborted();
  return { startingCombo: combo, today: exactDay, snapshots, canonicalRows: canonical };
}
