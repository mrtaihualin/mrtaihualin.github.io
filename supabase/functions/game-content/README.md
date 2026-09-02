# Game-content Edge gate

> Current commercial quotas and Product tiers come from Current Product authority. Numbers in source are implementation baselines, not future Product decisions.

- `game_words` and `game_sentences` must not be directly readable by `anon` or `authenticated` clients.
- The Edge Function is the entitlement gate. Determine identity/tier from verified server-side authentication; never trust a tier supplied by request body or client state.
- Return only rows and audio availability within the verified entitlement. Do not expose private storage paths or full protected catalogs.
- Required-data, audio, rate-limit and authorization failures fail closed with a recoverable client error.
- Keep JWT verification enabled for this function.
- Current source caps must be read from the deployed/source version and treated as implementation state only.
- Test/deploy results belong in the Current Checklist or `MAINTENANCE.md`, not in this invariant file.

## Sense-scoped vocabulary rollout

The source candidate in `20260902003107_vocab_sense_safe_game_scope.sql` is not permission to
change Production. After a fresh HIGH approval, release in this order so cached pages remain safe:

1. Take read-only counts/backups and check whether `ร้องไห้` has SRS rows at level 1 or 2. Stop for
   exact reconciliation if both exist; do not merge real-user history by inference.
2. Apply the additive database migration and verify `game_words` remains unreadable by `anon` and
   `authenticated`. Do not run the content sync yet.
3. Deploy the backward-compatible `game-content` and `tone-round` functions. Prove an empty request
   body still receives only the `legacy` surface before continuing.
4. Run `scripts/migrate-game-content.js`, then verify only the seven approved records are prioritized
   on `tone`, `reading`, and `typing`; none appears on `legacy`, `listening`, or `word_order`.
5. Deploy the three static pages last. Their requests name the game surface and their reports, SRS
   calls, and Resume snapshots carry `contentKey`.

Rollback in reverse: restore the prior three static pages, then the prior Edge versions. Keep the
additive columns and identity/audit rows; deleting them would destroy history. Hiding the seven rows
(`status='legacy'`, `surfaces='{}'`) or reconciling user-linked SRS is a separate HIGH data mutation
and requires an exact approved statement plus pre/post counts. Never restore the combined legacy
`ร้อง@初` row to an active game surface.
