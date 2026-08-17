const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SOURCES = new Set(['game_words', 'game_sentences']);
const SURFACES = Object.freeze({
  tone: 'tone_finder',
  tone_finder: 'tone_finder',
  reading: 'reading',
  listening: 'listening',
  typing: 'typing',
  wordorder: 'word_order',
  word_order: 'word_order',
});

function text(value, max) {
  const output = String(value == null ? '' : value).trim();
  if (!output || output.length > max) throw new Error('invalid_text');
  return output;
}

function iso(value) {
  const output = text(value, 64);
  const parsed = new Date(output);
  if (!Number.isFinite(parsed.getTime())) throw new Error('invalid_completed_at');
  return parsed.toISOString();
}

function integer(value, min, max) {
  const output = Number(value);
  if (!Number.isInteger(output) || output < min || output > max) throw new Error('invalid_integer');
  return output;
}

function normalizeRef(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid_content_ref');
  const source = text(value.source, 32);
  if (!SOURCES.has(source)) throw new Error('invalid_content_source');
  return { source, key: text(value.key, 512) };
}

export function normalizeRecordBody(body) {
  if (!body || body.action !== 'record') throw new Error('invalid_action');
  if (!UUID_V4.test(String(body.round_id || ''))) throw new Error('invalid_round_id');
  const gameType = text(body.game_type, 32);
  const surface = SURFACES[gameType];
  if (!surface) throw new Error('invalid_game_type');
  if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 100) throw new Error('invalid_items');
  const completedAt = iso(body.completed_at);
  const seen = new Set();
  const items = body.items.map((raw, index) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('invalid_item');
    const ordinal = integer(raw.ordinal == null ? index + 1 : raw.ordinal, 1, 100);
    if (seen.has(ordinal)) throw new Error('duplicate_ordinal');
    seen.add(ordinal);
    return {
      ordinal,
      content_ref: normalizeRef(raw.content_ref),
      is_correct: !!raw.is_correct,
      wrong_count: integer(raw.wrong_count == null ? 0 : raw.wrong_count, 0, 1000),
      hint_used: raw.hint_used == null ? null : !!raw.hint_used,
      listen_count: raw.listen_count == null ? null : integer(raw.listen_count, 0, 1000),
    };
  });
  return {
    action: 'record',
    schema_version: 'played-evidence-v1',
    round_id: String(body.round_id).toLowerCase(),
    game_type: gameType,
    surface,
    completed_at: completedAt,
    items,
  };
}

export function normalizeStatusBody(body) {
  if (!body || body.action !== 'status') throw new Error('invalid_action');
  if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 30) throw new Error('invalid_items');
  const seen = new Set();
  const items = [];
  body.items.forEach((raw) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('invalid_item');
    const kind = raw.kind === 'sentence' ? 'sentence' : (raw.kind === 'word' ? 'word' : '');
    if (!kind) throw new Error('invalid_kind');
    const key = text(raw.key, 512);
    const id = kind + ':' + key;
    if (seen.has(id)) return;
    seen.add(id);
    items.push({ kind, key, id });
  });
  if (!items.length) throw new Error('invalid_items');
  return { action: 'status', items };
}

export function wordBase(contentKey) {
  const value = String(contentKey || '');
  const marker = value.lastIndexOf('@');
  return marker > 0 ? value.slice(0, marker) : value;
}
