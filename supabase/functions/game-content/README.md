# Game-content Edge gate

> Current commercial quotas and Product tiers come from Current Product authority. Numbers in source are implementation baselines, not future Product decisions.

- `game_words` and `game_sentences` must not be directly readable by `anon` or `authenticated` clients.
- The Edge Function is the entitlement gate. Determine identity/tier from verified server-side authentication; never trust a tier supplied by request body or client state.
- Return only rows and audio availability within the verified entitlement. Do not expose private storage paths or full protected catalogs.
- Required-data, audio, rate-limit and authorization failures fail closed with a recoverable client error.
- Keep JWT verification enabled for this function.
- Current source caps must be read from the deployed/source version and treated as implementation state only.
- Test/deploy results belong in the Current Checklist or `MAINTENANCE.md`, not in this invariant file.

## Current Paid vocabulary selector

- For the existing `owner_all_access` entitlement, the source runtime selects `free-200-v1` plus the exact union of `paid-queue-189-v1` and `paid-queue-193-v1` on Tone, Reading, Typing, Word Order, Listening and Lego.
- The owner read checks each catalog version and level independently, requests one row beyond its reviewed count, and verifies the canonical-record set hash. Missing, extra, substituted or altered rows fail closed; combined totals alone are not sufficient.
- The owner catalog contains 582 semantic records (`初 469 + 中 113`) and 575 distinct written forms. The seven intentional same-written/multi-sense forms are `ผม`, `เขา`, `หนู`, `เงิน`, `ร้อง`, `อุ่น` and `คัน`.
- Identical Thai spelling is not a duplicate when meaning differs. Runtime identity, deduplication and history linkage must preserve each reviewed `contentKey`; no game may collapse records by `word` alone.
- Guest and Login Free retain their existing boundaries inside `free-200-v1`. The browser may choose only the game surface; it may not choose a Paid batch, catalog version or tier.
- This source contract does not authorize a Production Edge deployment, database migration, Cloudflare release or traffic change.

## Central sentence library transition

- `game_sentences` remains the one physical sentence catalog. Do not create a second per-game sentence store.
- The source-only `central_sentence_library_v1` migration adds immutable `content_key`, canonical metadata, per-game readiness, and legacy-text aliases without deleting or rewriting Learning Items, saved items, scores, or history.
- A sentence may be released to one game only when that game's exact required fields are complete and its readiness is `ready`. Missing data blocks only that surface and must never be inferred by the Edge Function.
- The first installed readiness contract is Word Order. Typing remains `incomplete` until the vocabulary-parity syllable fields are explicit and reviewed; Tone, Reading, and Listening remain `pending_contract`.
- Existing Edge/static behavior stays unchanged until a separate compatibility cutover proves old text keys and new canonical keys resolve to the same stable sentence. Production database apply and every runtime cutover remain separate approval gates.

## Sense-scoped vocabulary rollout

The source candidate in `20260902003107_vocab_sense_safe_game_scope.sql` is not permission to
change Production. After a fresh HIGH approval, release in this order so cached pages remain safe:

1. Take read-only counts/backups and check whether `ร้องไห้` has SRS rows at level 1 or 2. Stop for
   exact reconciliation if both exist; do not merge real-user history by inference.
2. Apply the additive database migration and verify `game_words` remains unreadable by `anon` and
   `authenticated`. Do not run the content sync yet.
3. Deploy the backward-compatible `game-content` and `tone-round` functions. Prove an empty request
   body still receives only the `legacy` surface before continuing.
4. Apply only the reviewed canonical catalog migration. The former local content importer is retired
   because it could synthesize parallel language fields. Verify every active row has one complete
   `canonical_record`; incomplete rows must stop the release instead of being repaired automatically.
5. Deploy the five protected-content pages last so every page receives the authority-validation client;
   Tone, Reading and Typing additionally name their game surface, and their reports, SRS calls, and
   Resume snapshots carry `contentKey`.

Rollback in reverse: restore the prior five static pages, then the prior Edge versions. Keep the
additive columns and identity/audit rows; deleting them would destroy history. Hiding the seven rows
(`status='legacy'`, `surfaces='{}'`) or reconciling user-linked SRS is a separate HIGH data mutation
and requires an exact approved statement plus pre/post counts. Never restore the combined legacy
`ร้อง@初` row to an active game surface.
