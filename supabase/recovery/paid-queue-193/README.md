# Paid vocabulary 193 recovery

This packet is an exact, additive rollback for `paid-queue-193-v1`. It does not authorize a Production action.

Before any Production rollback, first restore the prior verified `game-content` version so the owner-only Tone path returns the original Paid 189 cap (`初 183 / 中 6`). Then apply `rollback.sql` only with Lin's separate exact HIGH-risk approval.

The SQL deletes only the 193 rows whose catalog version and aggregate record hash match this batch. It aborts before deletion if either Paid SRS table references any of those content keys. Free 200, the original Paid 189 IDs/hashes/ranks, the single `owner_all_access` entitlement, RLS, grants, and all existing user data remain unchanged.

Immutable artifact SHA-256 values:

- Approved 193 source: `1c496779e3f0aabb4b031d8892bef44f71041495b18daf0d7201fd6415e05a72`
- Forward migration: `e1ab2eb1e0e4ad76a288bb61ba5ef642c7667690e9b094d7694d3a62c2a4c2c2`
- Rollback SQL: `3480a6ced92ee436d0a4a9c42dd6845310ccfe1b7b701b84568743e587ab0efb`
- Owner-only Edge source: `0b507e35356984c32d3fcc5a65f9f5fda791faae837963ce9e74ecb848f9ff90`

Local verification:

```sh
node scripts/tests-paid-vocabulary-193.js
node scripts/tests-paid-vocabulary-193-db.mjs
node scripts/check-site.js
```
