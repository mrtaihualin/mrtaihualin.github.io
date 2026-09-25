// Resolve the protected learning catalog through a short server-side RPC.
// The existing bounded REST connector remains a one-shot technical fallback.
const MAX_FILTER_BYTES = 1800;
const DIRECT_FILTER_BYTES = 6000;
const READ_TIMEOUT_MS = 5000;
const RPC_NAME = 'phase1_learning_catalog_resolve';

function encoded(value) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (character) =>
    '%' + character.charCodeAt(0).toString(16).toUpperCase());
}

function filterValue(value) {
  const key = String(value);
  return /[,()]/.test(key) ? '"' + key.replaceAll('"', '\\"') + '"' : key;
}

function diagnosticCode(code) {
  return /^[A-Z0-9_]{1,32}$/.test(String(code || '')) ? String(code) : 'transport_or_unknown';
}

function transportError(result) {
  return result?.error || result || {};
}

function numericStatus(result) {
  const raw = result?.status ?? result?.error?.status ?? result?.statusCode ?? result?.error?.statusCode;
  const value = Number(raw);
  return raw != null && Number.isFinite(value) ? value : null;
}

export function rpcFallbackAllowed(result) {
  const error = transportError(result);
  const status = numericStatus(result);
  const code = String(error?.code || '');
  const name = String(error?.name || '');
  if (status === 404 && ['PGRST002', 'PGRST202', 'PGRST203'].includes(code)) return true;
  if (status >= 400 && status < 500) return false;
  if (status >= 500) return true;
  // PostgREST represents a fetch failure with status 0 and an empty SQL code.
  if (status === 0 && code === '') return true;
  if (code === 'PGRST000' || code === 'PGRST001' || code === 'PGRST002') return true;
  if (/^(08|53|57P|58)/.test(code) || code === '57014') return true;
  return ['AbortError', 'TimeoutError', 'TypeError'].includes(name);
}

export function learningReadFailure(phase, result) {
  const error = transportError(result);
  const status = numericStatus(result);
  console.error('[learning-engine] read failure', {
    phase,
    status: status || null,
    code: diagnosticCode(error?.code),
  });
  return Object.assign(new Error('learning_queue_unavailable'), {
    code: 'learning_queue_unavailable', status: 503,
  });
}

function rpcReadFailure(result) {
  const error = transportError(result);
  const status = numericStatus(result);
  const fallbackAllowed = rpcFallbackAllowed(result);
  console.error('[learning-engine] catalog rpc failure', {
    status: status || null,
    code: diagnosticCode(error?.code),
    fallback: fallbackAllowed,
  });
  return Object.assign(new Error('learning_queue_unavailable'), {
    code: 'learning_queue_unavailable', status: 503, fallbackAllowed,
  });
}

export function catalogBatches(keys) {
  const unique = Array.from(new Set(keys));
  const directBytes = encoded('in.(' + unique.map(filterValue).join(',') + ')').length;
  if (directBytes <= DIRECT_FILTER_BYTES) return unique.length ? [unique] : [];

  for (const key of unique) {
    if (encoded(filterValue(key)).length + encoded('in.()').length > MAX_FILTER_BYTES) {
      throw Object.assign(new Error('catalog_key_too_long'), { code: 'catalog_key_too_long' });
    }
  }
  const batches = [];
  let batch = [];
  let bytes = encoded('in.()').length;
  for (const key of unique) {
    const extra = encoded(filterValue(key)).length + (batch.length ? encoded(',').length : 0);
    if (batch.length && bytes + extra > MAX_FILTER_BYTES) {
      batches.push(batch); batch = []; bytes = encoded('in.()').length;
    }
    bytes += encoded(filterValue(key)).length + (batch.length ? encoded(',').length : 0);
    batch.push(key);
  }
  if (batch.length) batches.push(batch);
  return batches;
}

export async function readPublicLearningItems(admin, source, keys) {
  const batches = catalogBatches(keys);
  const bounded = batches.length > 1;
  const results = await Promise.all(batches.map((batch) => {
    const query = admin.from('learning_items')
      .select('item_id,content_source,content_key').is('owner_user_id', null)
      .eq('content_source', source).in('content_key', batch).limit(2000);
    return bounded ? query.retry(false).abortSignal(AbortSignal.timeout(READ_TIMEOUT_MS)) : query;
  })).catch((error) => {
    if (!bounded) throw Object.assign(new Error('learning_queue_unavailable'), { code: 'learning_queue_unavailable' });
    throw learningReadFailure('catalog_items', { error });
  });
  const failed = results.find((result) => result.error);
  if (failed) {
    if (!bounded) throw Object.assign(new Error('learning_queue_unavailable'), { code: 'learning_queue_unavailable' });
    throw learningReadFailure('catalog_items', failed);
  }
  return results.flatMap((result) => result.data || []);
}

function catalogShape(game, level) {
  const verifier = String(game || '');
  const numericLevel = Number(level);
  if (!['tone', 'reading', 'typing', 'word_order'].includes(verifier) || ![1, 2, 3].includes(numericLevel)) {
    throw Object.assign(new Error('invalid_learning_catalog_scope'), { code: 'invalid_learning_catalog_scope' });
  }
  const sentence = verifier === 'word_order' || numericLevel === 3;
  return { verifier, level: numericLevel, sentence, source: sentence ? 'game_sentences' : 'game_words' };
}

function resolveLegacyRows(source, keys, rows) {
  const grouped = new Map();
  for (const row of rows) {
    if (row?.content_source !== source || typeof row?.content_key !== 'string') continue;
    const list = grouped.get(row.content_key) || [];
    list.push(row); grouped.set(row.content_key, list);
  }
  return keys.map((key) => {
    const matches = grouped.get(key) || [];
    if (matches.length !== 1 || !matches[0].item_id) {
      throw Object.assign(new Error('content_ref_not_unique'), { code: 'content_ref_not_unique' });
    }
    return { item_id: matches[0].item_id, content_ref: { source, key } };
  });
}

export function resolveRpcRows(rows, expectedSource) {
  if (!Array.isArray(rows) || !rows.length) {
    throw Object.assign(new Error('learning_catalog_empty'), { code: 'learning_catalog_empty' });
  }
  const seen = new Set();
  return rows.map((row) => {
    const source = String(row?.content_source || '');
    const key = String(row?.content_key || '');
    const count = Number(row?.match_count);
    if (source !== expectedSource || !key || seen.has(key) || count !== 1 || !row?.item_id) {
      throw Object.assign(new Error('content_ref_not_unique'), { code: 'content_ref_not_unique' });
    }
    seen.add(key);
    return { item_id: row.item_id, content_ref: { source, key } };
  });
}

async function readLegacyCatalog(admin, shape) {
  let content;
  if (shape.sentence) {
    content = await admin.from('game_sentences').select('th').limit(1000);
  } else {
    const levelCode = ({ 1: '初', 2: '中' })[shape.level];
    content = await admin.from('game_words').select('content_key')
      .eq('level', levelCode).eq('status', 'active').in('access_tier', ['guest', 'login']).limit(1000);
  }
  if (content.error) throw Object.assign(new Error('learning_queue_unavailable'), { code: 'learning_queue_unavailable' });
  const keys = Array.from(new Set((content.data || [])
    .map((row) => String(shape.sentence ? row.th : row.content_key || '')).filter(Boolean)));
  if (!keys.length) throw Object.assign(new Error('learning_catalog_empty'), { code: 'learning_catalog_empty' });
  const rows = await readPublicLearningItems(admin, shape.source, keys);
  return resolveLegacyRows(shape.source, keys, rows);
}

async function readRpcCatalog(admin, shape) {
  let result;
  try {
    result = await admin.rpc(RPC_NAME, { p_game: shape.verifier, p_level: shape.level })
      .retry(false).abortSignal(AbortSignal.timeout(READ_TIMEOUT_MS));
  } catch (error) {
    throw rpcReadFailure({ error });
  }
  if (result.error) throw rpcReadFailure(result);
  return resolveRpcRows(result.data, shape.source);
}

function exactCatalogEqual(left, right) {
  const identity = (row) => row.item_id + '|' + row.content_ref.source + '|' + row.content_ref.key;
  const leftIds = left.map(identity).sort();
  const rightIds = right.map(identity).sort();
  return leftIds.length === rightIds.length && leftIds.every((value, index) => value === rightIds[index]);
}

export async function readLearningCatalog(admin, game, level, mode = 'off') {
  const shape = catalogShape(game, level);
  if (mode === 'off') return readLegacyCatalog(admin, shape);

  if (mode === 'shadow') {
    let rpcRows = null;
    try { rpcRows = await readRpcCatalog(admin, shape); }
    catch (error) {
      console.error('[learning-engine] catalog shadow', { result: 'rpc_error', fallback: error?.fallbackAllowed === true });
    }
    const legacyRows = await readLegacyCatalog(admin, shape);
    const same = rpcRows ? exactCatalogEqual(rpcRows, legacyRows) : false;
    console.error('[learning-engine] catalog shadow', {
      result: same ? 'match' : 'mismatch', rpc_count: rpcRows?.length ?? null, legacy_count: legacyRows.length,
    });
    return legacyRows;
  }

  if (!['canary', 'on'].includes(mode)) {
    throw Object.assign(new Error('invalid_catalog_transport_mode'), { code: 'invalid_catalog_transport_mode' });
  }
  try { return await readRpcCatalog(admin, shape); }
  catch (error) {
    if (error?.fallbackAllowed === true) return readLegacyCatalog(admin, shape);
    throw error;
  }
}
