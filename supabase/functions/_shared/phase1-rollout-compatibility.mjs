export const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const LEGACY_LEGO_DEDUPE_MS = 30_000;

function uuidV4FromHex(hex) {
  const chars = hex.slice(0, 32).split('');
  chars[12] = '4';
  chars[16] = '8';
  const value = chars.join('');
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function legacyLegoRequestId(identityKey, day, atMs, windowMs = LEGACY_LEGO_DEDUPE_MS) {
  const timestamp = Number(atMs);
  const window = Number(windowMs);
  if (!identityKey || !day || !Number.isFinite(timestamp) || !Number.isFinite(window) || window < 1) {
    throw new Error('invalid_legacy_bridge_input');
  }
  const bucket = Math.floor(timestamp / window);
  return uuidV4FromHex(await sha256Hex(`phase1-lego-legacy:${identityKey}:${day}:${bucket}`));
}

export async function recentLegacyLegoRequestId(rows, identityKey, day, nowMs, windowMs = LEGACY_LEGO_DEDUPE_MS) {
  const now = Number(nowMs);
  for (const row of Array.isArray(rows) ? rows : []) {
    const requestId = String(row && row.request_id || '').toLowerCase();
    const createdMs = Date.parse(String(row && row.created_at || ''));
    if (!UUID_V4.test(requestId) || !Number.isFinite(createdMs)) continue;
    const age = now - createdMs;
    if (age < 0 || age > windowMs) continue;
    if (requestId === await legacyLegoRequestId(identityKey, day, createdMs, windowMs)) return requestId;
  }
  return null;
}

export async function resolveLegoRequestId(options) {
  if (options.hasExplicitRequestId) {
    const explicit = String(options.explicitRequestId || '').toLowerCase();
    if (!UUID_V4.test(explicit)) throw new Error('invalid_explicit_request_id');
    return { requestId: explicit, legacyCompatibility: false, recentReplay: false };
  }

  const recent = await recentLegacyLegoRequestId(
    options.recentRows, options.identityKey, options.day, options.nowMs, options.windowMs
  );
  return {
    requestId: recent || await legacyLegoRequestId(
      options.identityKey, options.day, options.nowMs, options.windowMs
    ),
    legacyCompatibility: true,
    recentReplay: !!recent,
  };
}
