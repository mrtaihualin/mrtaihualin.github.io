# Phase 1 Auth SQL recovery preparation

Scope: `P1-D-01` and `P1-D-09` only. These are inert recovery artifacts for the exact merged Email-OTP security SQL and account-audit hardening migration. They do not authorize or perform Production SQL, Edge deployment, client activation, provider selection, mail/Turnstile configuration, account/data mutation, or cleanup.

## Exact forward identity

`source-lock.json` pins both forward SQL files to immutable source commits, parents, Git blobs, and SHA-256 digests. A branch name, moving tag, regenerated migration, or similar-looking SQL is not an acceptable substitute.

The target is Supabase project `qzkxlhpcputsvbqmtqfi` only if a later, separate exact Production authorization names it. This preparation never connects to that project.

## Recovery contract

`recover.sql` is forward recovery for a failed or cancelled SQL rollout:

1. It aborts before changing privileges unless every exact Email-OTP table, sequence, function, Supabase role, and hardened account-audit function exists with the required `SECURITY DEFINER` and empty `search_path` posture.
2. It locks only the three additive Email-OTP tables for the short recovery transaction.
3. It preserves every additive table, function, sequence, challenge, abuse-state row, security event, and account-audit row.
4. It makes the Email-OTP database entrypoints inert by revoking execution from `PUBLIC`, `anon`, `authenticated`, and `service_role`, while reasserting forced RLS and zero direct table/sequence privileges for application roles.
5. It keeps `log_account_audit` unavailable to browser roles and available only to `service_role`.
6. It verifies the closed state inside the same transaction and rolls everything back on any mismatch.

The SQL intentionally contains no `DROP`, `TRUNCATE`, `DELETE`, `UPDATE`, or `INSERT` statement.

## Intentionally impossible rollback

Two backward operations are intentionally absent because they would weaken safety or destroy evidence:

- The Email-OTP schema is not rolled back to “objects absent.” Dropping additive tables/functions or deleting OTP security rows could destroy incident and rate-limit evidence. Recovery instead leaves the exact schema/data present but unusable by application roles.
- The account-audit migration is not rolled back to its prior browser-callable ACL. Restoring `PUBLIC`, `anon`, or `authenticated` execution on the privileged `SECURITY DEFINER` RPC would recreate the security defect. Recovery therefore reapplies the hardened boundary even if another rollout component is reverted.

Reactivation, schema cleanup, data retention cleanup, or any previous Edge/client deployment is a separate action with its own exact artifact, precheck, recovery, postcheck, and approval. This packet neither chooses nor assumes a mail provider, Turnstile values, activation mode, or service-to-service authentication mode.

## Required ordering for a later authorized incident action

1. Stop the rollout and preserve masked read-only evidence.
2. Confirm the deployed SQL matches both pinned forward artifacts and that a usable fresh recovery point exists.
3. Stop or revert the calling Email-OTP Edge/client layer under its separately approved exact artifact before changing database privileges.
4. Run `recover.sql` only with exact Production SQL approval.
5. Verify aggregate row counts/digests are unchanged, all three OTP tables still force RLS, no browser or service role can call OTP RPCs, and browser roles still cannot call `log_account_audit` while `service_role` can.
6. Do not clean up objects/data or reopen access as part of incident recovery.

Stop at the first failed precheck or postcheck. Do not compensate by relaxing a grant, disabling RLS, deleting evidence, or bypassing the transaction.

## Disposable local verification

Run only the standalone fixture below. It creates two temporary PostgreSQL databases under a temporary directory, applies the exact tracked forward SQL, proves missing-object recovery fails before changing any privilege, proves recovery and its rerun preserve deterministic fixture digests, and removes the entire temporary cluster.

```sh
node supabase/recovery/phase1-auth-security/test.mjs
git diff --check
```

No live Supabase project, provider, account, inbox, secret, or external service is used.
