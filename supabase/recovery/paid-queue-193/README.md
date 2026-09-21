# Paid vocabulary 193 recovery

This packet is an exact, additive rollback for `paid-queue-193-v1`. It does not authorize a Production action.

Before any Production rollback, first restore the prior verified `game-content` version so the owner-only Tone path returns the original Paid 189 cap (`初 183 / 中 6`). Then apply `rollback.sql` only with Lin's separate exact HIGH-risk approval.

The SQL deletes only the 193 rows whose catalog version and aggregate record hash match this batch. It aborts before deletion if either Paid SRS table references any of those content keys. Free 200, the original Paid 189 IDs/hashes/ranks, the single `owner_all_access` entitlement, RLS, grants, and all existing user data remain unchanged.

Immutable artifact SHA-256 values:

- Approved 193 source: `1c496779e3f0aabb4b031d8892bef44f71041495b18daf0d7201fd6415e05a72`
- Forward migration: `43e2f2e5291f79e4fa6d612d3065b96b658970551b10ddf2b66a0c070d89a26d`
- Rollback SQL: `aae0e7e3b5c8df8bce0458180fee3e453e5b86e7b9a3212f2fb0afc2ef4f511f`
- Owner-only Edge source: `0b507e35356984c32d3fcc5a65f9f5fda791faae837963ce9e74ecb848f9ff90`

Local verification:

```sh
node scripts/tests-paid-vocabulary-193.js
node scripts/tests-paid-vocabulary-193-db.mjs
node scripts/check-site.js
```
