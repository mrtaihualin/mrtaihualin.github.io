# Source, CI and release route

## Fixed architecture

- GitLab is the canonical Git repository and CI authority.
- Cloudflare is the Production host. A source merge never authorizes a Production release.
- GitHub is a read-only downstream mirror. Do not commit, merge, or resolve divergence there.
- AWS is an independent static backup and is not a prerequisite for normal source work.

## Source change

1. Start an isolated `codex/*` branch from the current GitLab `main`.
2. Define the exact Task-ID and Write-Set. Preserve unrelated worktrees and checkpoints.
3. Run the targeted checks and `node scripts/check-site.js` locally.
4. Open a GitLab Merge Request containing `Task-ID` and `Write-Set` in its description.
5. Merge only after `required-tests-and-write-set` passes on the exact head and the branch is still based on current `main`.
6. Verify GitLab `main`, then verify that the downstream GitHub mirror reaches the same commit. Do not enable GitHub deployment workflows.

## Production release

1. Resolve the exact Human-approved source SHA, Cloudflare target, complete public static package, verification gates and rollback version.
2. Require separate Production authorization. A merge or the phrase `เอาขึ้นเว็บ` does not authorize provider, backend, database, data, DNS, AWS or secret changes beyond its exact approved scope.
3. Build the immutable public package and run the secret, route, byte and runtime gates before deploy.
4. Deploy only the approved public static package to Cloudflare and verify the whole public package after deploy.
5. If verification fails, restore the preserved prior Cloudflare version/package. Never rewrite Git history to roll back Production.

## Repository recovery

- If a GitLab merge is wrong but Production is unchanged, create a revert branch and Merge Request; do not force-push `main`.
- If GitLab is temporarily unavailable, preserve local immutable refs and use GitHub only to recover history. Do not accept new canonical changes on the mirror.
- If the GitHub mirror diverges, stop mirroring, preserve both refs, and repair the downstream mirror only after the GitLab canonical ref is verified.
