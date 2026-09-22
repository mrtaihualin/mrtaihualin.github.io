const compareContentKey = (left, right) => (
  left.contentKey < right.contentKey ? -1 : (left.contentKey > right.contentKey ? 1 : 0)
);

const canonicalJson = (value) => {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
};

const sha256Hex = async (value) => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
};

export const OWNER_CATALOG_SPECS = Object.freeze([
  Object.freeze({
    catalogVersion: 'free-200-v1',
    statuses: Object.freeze(['active']),
    tiers: Object.freeze(['guest', 'login']),
    levels: Object.freeze({
      '初': Object.freeze({ count: 100, recordSetSha256: '9b37e68443b7966ea6d32278d8055f548fe08be4218cbecc404405dac7c7c43d' }),
      '中': Object.freeze({ count: 100, recordSetSha256: '127c191d1dfb8b112f8c52625b7f3afa118c8c50352bf227818794b5282efa2d' }),
    }),
  }),
  Object.freeze({
    catalogVersion: 'paid-queue-189-v1',
    statuses: Object.freeze(['queued']),
    tiers: Object.freeze(['paid']),
    levels: Object.freeze({
      '初': Object.freeze({ count: 183, recordSetSha256: '44a0d9839b40599df335cbc0098290ec2fd95825165f93f58fa3df8431abb45c' }),
      '中': Object.freeze({ count: 6, recordSetSha256: '6c744cac1a727dda4a73b8e4de41b87a354fbdc8afd0d646ce5ba33eb5dbbc26' }),
    }),
  }),
  Object.freeze({
    catalogVersion: 'paid-queue-193-v1',
    statuses: Object.freeze(['queued']),
    tiers: Object.freeze(['paid']),
    levels: Object.freeze({
      '初': Object.freeze({ count: 186, recordSetSha256: '78dceffb7275925bc500ce6b7fb3852c667b1bbfae12913bda533d87e8c74c53' }),
      '中': Object.freeze({ count: 7, recordSetSha256: '8e8c412f2fc234957d45cd0a25bf571400e38a5b6f2a004db1b67fcaad0ae2e9' }),
    }),
  }),
]);

export async function matchesExactCatalogSlice(rows, expected) {
  if (!Array.isArray(rows) || rows.length !== expected.count) return false;
  const records = rows.map((row) => row?.catalog);
  if (records.some((record) => !record || typeof record !== 'object' || Array.isArray(record) ||
      typeof record.contentKey !== 'string' || !record.contentKey.length)) return false;
  if (new Set(records.map((record) => record.contentKey)).size !== expected.count) return false;
  const orderedRecords = records.slice().sort(compareContentKey);
  return await sha256Hex(canonicalJson(orderedRecords)) === expected.recordSetSha256;
}
