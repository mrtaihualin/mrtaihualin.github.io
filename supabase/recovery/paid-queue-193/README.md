# Paid vocabulary 193 single-store recovery

This packet is the exact recovery boundary for `paid-queue-193-v1`. It does not authorize a Production action.

The Current owner source runtime selects Free 200 plus the exact union of Paid 189 and this Paid 193 batch: 582 semantic records (`初 469 + 中 113`) on all six game surfaces. Guest/Login Free retain their existing Free 200 boundaries in the same protected `game_words` authority. Identical spelling with a different meaning remains a distinct record by `contentKey`.

Rollback order after a failed cutover:

1. Stop verification traffic and restore the immediately prior complete Cloudflare deployment.
2. Restore the prior verified `game-content` v43 artifact. This removes the all-six Free-200-plus-Paid-382 selector before any row deletion and returns the prior owner-only Tone/Paid 189 behavior.
3. Roll back the Roman normalization with its exact recovery SQL if that migration must be reversed.
4. Apply `rollback.sql` only with Lin's separate exact HIGH-risk approval.

The Paid SQL rollback deletes only the 193 rows whose catalog version and aggregate record hash match this batch. It aborts before deletion if either Paid SRS table references any of those content keys. Free 200, the original Paid 189 IDs/hashes/ranks, the single `owner_all_access` entitlement, RLS, grants, and all existing user data remain unchanged.

Frozen artifact SHA-256 values:

- Approved 193 source: `08ec682040da7474ca7b338255172e130b9a37477b3588de5257179353627d01`
- Paid 193 forward migration: `e1ab2eb1e0e4ad76a288bb61ba5ef642c7667690e9b094d7694d3a62c2a4c2c2`
- Paid 193 rollback SQL: `3480a6ced92ee436d0a4a9c42dd6845310ccfe1b7b701b84568743e587ab0efb`
- Roman forward migration: `699442022b3e3a913e120cfb6bab6936dfa3eb2067993f01974b73321af03dfe`
- Roman rollback SQL: `9d906d33eabb6bdc19ab32e4f81c4b2dda69c7505e159184b11459c382673117`
- Superseded Paid-193-only Edge source: `38b9e1c4ffc15c813cac30632059bee52d11ec7240f5ccf2b7e0c8f7148beb99`
- Superseded Paid-382-union Edge source: `66570b391a5fbd9d6633b63696124b5e666cb10709fec550ec7fa07fbd1576d7`
- Superseded Free-200-plus-Paid-382 Edge source candidate: `ddda0eae371ca092cbb6cb27ade4d804e77eca1252a09386f9f9f223a0ffada3`
- Exact-set guarded Edge entry candidate: `b16e64b40facb2680c4f840f8756fc70ec5c908581dfd31e815158690a8dcd84`
- Exact-set integrity helper candidate: `2a1e633c6e891675fe581b7f5ee0b6a1852d7625fb48fe576f505b32ccd1dc02`
- Prior verified Edge source: `0b507e35356984c32d3fcc5a65f9f5fda791faae837963ce9e74ecb848f9ff90`

The exact static candidate commit and the immediately prior Cloudflare deployment ID must be recorded after the MR commit is frozen and before requesting Production approval. A missing identifier blocks mutation.

Local verification:

```sh
node scripts/tests-paid-vocabulary-193.js
node scripts/tests-paid-vocabulary-single-store.js
node scripts/tests-paid-vocabulary-193-db.mjs
node scripts/check-site.js
```
