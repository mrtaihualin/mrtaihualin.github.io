// Read the existing public item connector with bounded URLs and read latency.
// This module does not resolve legacy identity or change learning eligibility.
const MAX_FILTER_BYTES = 1800;
const READ_TIMEOUT_MS = 5000;

function encoded(value) {
  return encodeURIComponent(value).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());
}
function filterValue(key) { return /[,()]/.test(key) ? '"' + key + '"' : key; }

export function learningReadFailure(phase, result) {
  // Upstream messages/details/hints may contain query values or account data.
  const candidate = String(result?.error?.code || '');
  const code = /^[A-Z0-9_]{1,40}$/.test(candidate) ? candidate : 'transport_or_unknown';
  const status = Number.isInteger(result?.status) ? result.status : 0;
  console.error('[learning-engine] read unavailable', { phase, code, status });
  return Object.assign(new Error('learning_queue_unavailable'), { code: 'learning_queue_unavailable', status: 503 });
}

export function catalogBatches(keys) {
  const batches = [];
  let batch = [];
  let bytes = encoded('in.()').length;
  for (const key of new Set(keys)) {
    const extra = encoded(filterValue(key)).length + (batch.length ? encoded(',').length : 0);
    if (batch.length && bytes + extra > MAX_FILTER_BYTES) {
      batches.push(batch); batch = []; bytes = encoded('in.()').length;
    }
    if (encoded(filterValue(key)).length + encoded('in.()').length > MAX_FILTER_BYTES) {
      throw Object.assign(new Error('catalog_key_too_long'), { code: 'catalog_key_too_long' });
    }
    bytes += encoded(filterValue(key)).length + (batch.length ? encoded(',').length : 0);
    batch.push(key);
  }
  if (batch.length) batches.push(batch);
  return batches;
}

export async function readPublicLearningItems(admin, source, keys) {
  const batches = catalogBatches(keys);
  const results = await Promise.all(batches.map(batch => admin.from('learning_items')
    .select('item_id,content_source,content_key').is('owner_user_id', null)
    .eq('content_source', source).in('content_key', batch).limit(2000)
    .retry(false).abortSignal(AbortSignal.timeout(READ_TIMEOUT_MS))))
    .catch(error => { throw learningReadFailure('catalog_items', { error }); });
  const failed = results.find(result => result.error);
  if (failed) throw learningReadFailure('catalog_items', failed);
  return results.flatMap(result => result.data || []);
}
