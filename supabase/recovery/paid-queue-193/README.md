# Paid vocabulary 193 single-store recovery

This packet is the exact recovery boundary for `paid-queue-193-v1`. It does not authorize a Production action.

The Current owner runtime selects exactly this 193-record catalog on all six game surfaces. Free 200 remains the Guest/Login Free catalog in the same protected `game_words` authority. Paid 189 remains only as inactive recovery/history rows and is not an alternate Current runtime catalog.

Rollback order after a failed cutover:

1. Stop verification traffic and restore the immediately prior complete Cloudflare deployment.
2. Restore the prior verified `game-content` v43 artifact. This removes the all-six Paid 193 selector before any row deletion and returns the prior owner-only Tone/Paid 189 behavior.
3. Roll back the Roman normalization with its exact recovery SQL if that migration must be reversed.
4. Apply `rollback.sql` only with Lin's separate exact HIGH-risk approval.

The Paid SQL rollback deletes only the 193 rows whose catalog version and aggregate record hash match this batch. It aborts before deletion if either Paid SRS table references any of those content keys. Free 200, the original Paid 189 IDs/hashes/ranks, the single `owner_all_access` entitlement, RLS, grants, and all existing user data remain unchanged.

Frozen artifact SHA-256 values:

- Approved 193 source: `08ec682040da7474ca7b338255172e130b9a37477b3588de5257179353627d01`
- Paid 193 forward migration: `e1ab2eb1e0e4ad76a288bb61ba5ef642c7667690e9b094d7694d3a62c2a4c2c2`
- Paid 193 rollback SQL: `3480a6ced92ee436d0a4a9c42dd6845310ccfe1b7b701b84568743e587ab0efb`
- Roman forward migration: `699442022b3e3a913e120cfb6bab6936dfa3eb2067993f01974b73321af03dfe`
- Roman rollback SQL: `9d906d33eabb6bdc19ab32e4f81c4b2dda69c7505e159184b11459c382673117`
- All-six Paid 193 Edge source: `38b9e1c4ffc15c813cac30632059bee52d11ec7240f5ccf2b7e0c8f7148beb99`
- Prior verified Edge source: `0b507e35356984c32d3fcc5a65f9f5fda791faae837963ce9e74ecb848f9ff90`

The exact static candidate commit and the immediately prior Cloudflare deployment ID must be recorded after the MR commit is frozen and before requesting Production approval. A missing identifier blocks mutation.

Local verification:

```sh
node scripts/tests-paid-vocabulary-193.js
node scripts/tests-paid-vocabulary-single-store.js
node scripts/tests-paid-vocabulary-193-db.mjs
node scripts/check-site.js
```
