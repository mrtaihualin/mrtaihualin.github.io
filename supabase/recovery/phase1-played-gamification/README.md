# Phase 1 Played + Gamification + tone-round recovery

> Scope: `P1-D-05`, `P1-D-07`, `P1-D-08` only. This is a tracked, non-Production recovery artifact, not rollout authorization or current status.

## Exact identity

- Production target when separately authorized: Supabase project `qzkxlhpcputsvbqmtqfi`.
- Forward source: `988cabf4eb546975d62f5d179411ac7c58e5086f`.
- Immediately-pre-D08 runtime: `a037ec2b3785ee720b2d2dcc826e67c8a2650689`.
- Prepared from `origin/main`: `cf1d662405a25bd24b58606a83f0d842a9b00ef3`.
- Exact Git blobs are locked in `manifest.json`; do not substitute a branch name or a moving tag.

The pre-D08 Played runtime already contains the PR #34 owner/queue race fix. Its Edge writes through `phase1_practice_events_record`, and its client ignores gamification. The current client is also backward-compatible with that Edge: an absent `gamification` response is ignored, and the optional status refresh fails closed without removing Played evidence.

## Gate before any shared/runtime action

Production SQL, Edge deployment, client release, account/player writes, cleanup, and rollback are HIGH-risk actions. Before an exact action, record:

```text
RISK=HIGH
TARGET=Supabase Production qzkxlhpcputsvbqmtqfi and/or Production Pages, exactly as applicable
ARTIFACT=<exact Git head plus manifest/source blob>
PRECHECK=<fresh backup, deployed versions, object/grant/RLS snapshot, aggregate row counts>
RECOVERY=<this artifact, locally verified>
AUTHORIZATION=<Lin approval for this exact action/version/target>
POSTCHECK=<no-account smoke, grants/RLS, then separately authorized controlled account behavior>
```

Do not expose tokens, connection strings, user IDs, item values, or row contents in evidence. Use deployed version numbers, object presence, booleans, hashes, and aggregate counts only.

## Forward dependency order

This describes the boundary that recovery reverses; it does not authorize execution.

1. Take and verify a fresh recoverable database backup.
2. Apply the Played migration `20260817041014_phase1_practice_event_idempotency.sql`.
3. Apply the gamification migration `20260817074413_phase1_free_gamification_streak.sql`.
4. Verify functions, RLS, grants, constraints, and that browser roles cannot reach the new tables/RPCs.
5. Deploy `practice-events` with JWT verification enabled, then run a no-account/invalid-token smoke that must not write.
6. Deploy `tone-round`, then run a no-account/invalid-token smoke that must not write.
7. Only after the backend is exact, verify the already-shipped client. Controlled authenticated writes and Human experience review remain separate gates.

Stop on the first failed step. Do not continue into a later layer to compensate for an earlier failure.

## Recovery order

Choose the smallest branch that restores service. Do not drop the additive D08 tables/functions or delete their rows during incident recovery.

### Backend-only recovery (preferred)

Use when the current Pages client is healthy but the gamification backend or mixed-version behavior fails.

1. Preserve read-only evidence and stop further rollout.
2. Deploy the exact previous `practice-events` directory from commit `a037ec2b3785ee720b2d2dcc826e67c8a2650689`. This retains item-level Played writes/status and removes the gamification caller.
3. Verify invalid/no-token requests fail and no row count changes; then verify Played record/status only under a separately authorized controlled account.
4. If tone-round also changed or is suspect, deploy the exact previous `tone-round/index.ts` blob from the manifest.
5. Run `restore.sql` only with exact Production SQL approval. It restores the prior tone-round SQL contract and reasserts RLS plus service-role-only access on all additive D08 objects.
6. Verify exact Edge versions, the tone RPC definition/privileges, Played behavior, and aggregate D08 row counts. Leave additive objects unused.

Restoring the previous tone Edge before the previous tone SQL avoids a mixed window in which the D08 Edge could hide a prior SQL reward write. The final pair deliberately restores the immediately-pre-D08 behavior; this is emergency recovery only, not a new Product decision.

### Client-involved recovery

Use only when verification proves a client/runtime defect.

1. Create a new recovery branch from the latest default branch.
2. Restore only the client paths listed in `manifest.json` from the immutable previous-runtime commit. Do not revert migrations, tests, documentation, or unrelated later fixes.
3. Run targeted tests and `node scripts/check-site.js`, merge through a checked PR, and verify the exact Production client hashes.
4. Continue with the backend-only order above: previous Played Edge, previous tone Edge if required, then the separately approved `restore.sql`.

The client goes first because the previous client accepts the current additive backend response, while reversing a backend before a client can expose an unverified mixed-version path. If only `practice-events` fails, the current client may remain because its optional gamification handling is fail-closed.

## Read-only postcheck

The postcheck must prove all of the following without printing data:

- `practice_events` remains available to service-owned Played RPCs and browser roles still cannot call them directly.
- `phase1_free_streak_status`, `phase1_free_streak_days`, and `phase1_streak_outage_days` all have RLS enabled.
- `anon` and `authenticated` have no table privileges and no execute privilege on D08 RPCs.
- `service_role` retains only the grants needed by the inactive additive path.
- The previous `practice-events` Edge serves record/status only; gamification absence does not delete the client queue.
- The deployed `tone-round` Edge and `phase1_tone_round_commit` both match the same previous-runtime contract.
- No cleanup, backfill, account mutation, outage-row mutation, or deletion happened as part of recovery.

Run local evidence before requesting any Production action:

```sh
node scripts/tests-phase1-played-gamification-recovery.mjs
node scripts/tests-phase1-played-gamification-recovery.mjs --postgres
node scripts/check-site.js
```

Any later cleanup of additive objects or player data is a separate destructive/high-risk action and is intentionally absent from this artifact.
