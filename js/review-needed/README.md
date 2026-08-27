# Review Needed hidden candidate — Free/Paid pre-SRS contract

> Status: `CURRENT FOR THIS ISOLATED BRANCH / NON-PRODUCT PREVIEW / DEFAULT OFF`
> Scope owner: this hidden candidate only.
> Shared Product/SRS authority and integration owner: task `01a03cd8-210f-7dc2-998b-45d56cb66d6f`.
> This file does not authorize public activation, Production, Staging, Supabase, SRS Sandbox mutation, or Phase PASS.

## Latest locked candidate rules

One opaque owner plus `game + level + item` has exactly one active state. Five-game histories remain isolated. Free and Paid use the same score transitions; only Review attempt and allocation limits differ.

`item` means only `learning_items.item_id` resolved through the existing `content_ref` connector. A missing or ambiguous match fails closed; the client cannot nominate an item id. `score` means the integer `0–10` produced by that game's server-verifiable item rule before combo, golden, level, end-round and SRS bonuses. Client score fields are ignored, and no cross-game score normalization is performed.

| Current state | Score | Replacement state | Due/group |
|---|---:|---|---|
| `NORMAL` | `10` | `SRS` canonical initial route | owner stage `0`; not Day 1 passed |
| `NORMAL` | `4–9` | `WEAK_4D` | `+4` calendar days |
| `NORMAL` | `0–3` | `RETRY_END_ROUND` | once at end of round |
| `RETRY_END_ROUND` | `10` | `NEXT_DAY_CHECK` | `+1` calendar day; front-priority group |
| `RETRY_END_ROUND` | `0–9` | `REVIEW_NEEDED` | `+1` calendar day |
| `NEXT_DAY_CHECK` or `REVIEW_NEEDED` | `10` | `SRS` canonical initial route | owner stage `0`; not Day 1 passed |
| `NEXT_DAY_CHECK` or `REVIEW_NEEDED` | `4–9` | `WEAK_4D` | `+4` calendar days |
| `NEXT_DAY_CHECK` or `REVIEW_NEEDED` | `0–3`, attempt remains | `REVIEW_NEEDED` | `+1` calendar day |
| `NEXT_DAY_CHECK` or `REVIEW_NEEDED` | `0–3`, attempt exhausted | `WEAK_4D` | `+4` calendar days |
| `WEAK_4D` | `10` | `SRS` canonical initial route | owner stage `0`; not Day 1 passed |
| `WEAK_4D` | `4–9` | `WEAK_4D` | `+4` calendar days |
| `WEAK_4D` | `0–3` | `RETRY_END_ROUND` | once at end of round, then Retry rules |

`reviewAttemptsUsed` is the number of completed `NEXT_DAY_CHECK`/`REVIEW_NEEDED` evaluations before the current one. The current evaluation consumes one attempt. Free allows `1`; dormant Paid allows `3`. Retry itself does not consume a Review attempt and initializes the next-day state at `0`. When a low result consumes the last attempt, the replacement is `WEAK_4D +4`, not another Review state.

Review allocation per explicit play-set size is capped with `floor(playSetSize × rate)`: Free `20%`, dormant Paid `30%`. Only eligible due `NEXT_DAY_CHECK`/`REVIEW_NEEDED` states consume this allocation. SRS Due is a separate owner snapshot and does not consume Review slots. The candidate preserves normalized input order for allocation but does not define final within-group question order or placement. Overflow remains an active state for the next set; an unplayed item remains active and reappears on later calendar days until an owner transition clears/replaces it.

SRS routes are owner contracts only:

- Free: `stage 0 → Day 1 → Day 7 → Mastered`.
- Paid: `stage 0 → Day 1 → Day 7 → Day 16 → Mastered → Challenge Day 30/60/90`.

The candidate emits deterministic/idempotent directives and never mutates SRS or storage. Existing canonical SRS state is reused; unknown/conflicting presence fails closed. After SRS entry there is no backflow into Review/Weak. Saved Word remains manual-only. No weakness percentage exists.

## Pre-Work Gate

- Current phase: hidden/local preparation only; public SRS/Review remains off.
- Decision authority: Lin's latest explicit delegated rules for this candidate; shared authority reconciliation belongs to the named SRS owner task.
- Scope: pure state normalizer, tier-bound transition/queue directives, schema-neutral read adapter, synthetic fixtures/tests, and localhost-only technical preview.
- Out of scope: Product authority, Central, Phase/SRS Master Plans or Checklists, SRS Sandbox/automation/identity, database/event schema, Supabase, Auth/Login, shared UI/navigation, game runtime, Production/Staging, remote Git, and public activation.
- Definition of Done: both tier matrices; exact attempt exhaustion and `+1/+4`; `20%/30%` allocation and carry-forward; one-active-state/dedupe/idempotency/race; five-game isolation; SRS owner routes/no-backflow; malformed fail-closed; hidden/default-OFF/read-only proof; regressions, browser, leakage and write-set checks; local commit.
- Authorization: seven existing candidate-owned files and one new local commit only.

## Architecture and integration seam

`review-needed-candidate.js` is a pure UMD module. It validates active-state and SRS snapshots, computes a play-set allocation plan, builds transition directives, and provides an in-memory compare-and-swap simulator for tests. Paid planning requires `allowDormantTier: true`; Paid runtime remains disabled.

`review-needed-read-adapter.js` has no table, event, account, timezone, endpoint, Supabase, RPC, or storage binding. The SRS owner integration must map its authorized schema into:

- Active state: `sourceType, ownerKey, game, level, itemId, state, stateToken, dueOn, roundToken, retryOrdinal, reviewAttemptsUsed`.
- SRS Due snapshot: `sourceType, ownerKey, game, level, itemId, due, mastered`.
- Existing canonical SRS state: `sourceType, ownerKey, game, level, itemId, stateToken, stage, dueDate, mastered`.
- Result evidence: server-verified per-game numeric `score`, exact canonical `content_ref`, explicit calendar `occurredOn`, opaque unique `actionToken`, and `roundToken` only when the replacement is the once-per-round retry.
- Queue options: explicit `tier`, calendar `today`, positive integer `playSetSize`, and explicit dormant-tier allowance for Paid verification.
- SRS entry: explicit canonical-state status `absent` or `present`; unknown/conflict fails closed.

The integration owner must persist the directive atomically with compare-and-swap on `expectedStateToken`, enforce `actionToken` idempotency across requests, close/replace exactly one active state, preserve upstream allocation order, and never create a second SRS/raw-action record. This candidate performs none of those writes.

## Owned write-set

- `js/review-needed/**`
- `dev/review-needed-hidden-preview.*`
- `scripts/fixtures/review-needed-hidden-fixtures.js`
- `scripts/tests-review-needed-hidden-candidate.js`

No Product authority, Central, Phase/SRS Plan/Checklist, Supabase, automation, identity, runtime, UI/navigation, sitemap, robots, service worker, Production, or Staging file is in this write-set.

## Full Checklist

| Item | Acceptance | State |
|---|---|---|
| `RNH-TP-01` | Reuse HEAD `c3b0d78`; candidate-only ownership/write-set remains isolated | `PASS` |
| `RNH-TP-02` | Free/Paid Normal, Retry and Weak transitions match every locked band edge | `PASS` |
| `RNH-TP-03` | Free consumes exactly 1 Review attempt; Paid consumes exactly 3 | `PASS` |
| `RNH-TP-04` | Low score repeats Review only while an attempt remains; exhaustion goes Weak `+4` | `PASS` |
| `RNH-TP-05` | Free `20%` and Paid `30%` allocation are separate from SRS Due | `PASS` |
| `RNH-TP-06` | Overflow moves to the next set; unplayed items persist across calendar days without loss/duplicate | `PASS` |
| `RNH-TP-07` | Exact calendar `+1/+4`, front-priority group and no literal question-one assignment | `PASS` |
| `RNH-TP-08` | One-active-state, five-game/owner isolation, dedupe/idempotency/race | `PASS` |
| `RNH-TP-09` | Free/Paid SRS owner routes, stage-0 entry/reuse, no mutation/backflow | `PASS` |
| `RNH-TP-10` | Day 0/1/8, empty/loading/error/access-denied, malformed/unknown fail closed | `PASS` |
| `RNH-TP-11` | Adapter is schema-neutral; Saved Word manual-only; no weakness percentage | `PASS` |
| `RNH-TP-12` | Default OFF, local-only, noindex, unlinked, no public/network/write path | `PASS (source)` |
| `RNH-TP-V` | Targeted, relevant regressions, site gate, desktop/mobile browser, leakage and write-set checks | `PASS` |
| `RNH-TP-Z` | New local corrective commit; no push/PR/merge/deploy | `PASS (this local checkpoint)` |

Earlier commits and checklist rows remain history. This Delta starts at `c3b0d78` and does not amend or erase them.

## Verification checkpoint

- Candidate suite: `29/29` PASS for both tiers, every score-band edge, Free `1`/Paid `3` attempt exhaustion, Free `20%`/Paid `30%` allocation, overflow next-set, unplayed next-day persistence, SRS separation/routes/no-backflow, one-active-state, race/idempotency, five-game isolation, malformed fail-closed, adapter and hidden/public boundary.
- Preserved regressions: Phase 1 SRS `17/17`, Listening `55/55`, shared game system `29/29`, game-flow and behavioral suites PASS.
- Full site gate: `1,022` project files PASS, including syntax, secret scanner, Phase 1 suites, navigation, mobile/accessibility warning-only and SEO/sitemap checks.
- Browser technical check: Desktop `1280×800` and Mobile `390×844` PASS. Default OFF is blank/inaccessible. Free shows `20% · 2 selected · 2 carry-forward`; dormant Paid shows `30% · 3 selected · 1 carry-forward`; mobile keeps page width contained with a focus-visible horizontal table region. Both have no links/forms, fixture owner display, console warning/error, storage, network mutation or public entry.
- Repository Delta is six candidate-owned files; the existing hidden HTML boundary remains unchanged. No Product authority, Central, SRS Plan/Checklist/Sandbox, Supabase, runtime, shared UI/navigation, Production or Staging file/path changed.

## Hidden developer preview

`dev/review-needed-hidden-preview.html` is synthetic and non-product. It begins hidden, is `noindex,nofollow,noarchive`, has no public link/form/storage/network/write path, and requires loopback plus `?review-needed-preview=1`. Optional `&tier=paid` displays the dormant Paid contract. It shows tier, allocation selected/carry-forward status, attempts used, state/source and a sample stage-0 owner directive. It does not define final Product placement, question order, copy, or visual design.

## Integration gates intentionally waiting for SRS owner

- Reconcile shared Product/Central/Phase/SRS authority and owner checklists to the latest Free `1` / Paid `3`, Review `20%/30%`, exhaustion and carry-forward rules.
- Bind the normalized seam to the authorized identity/state/event schema and persistent idempotency/compare-and-swap implementation.
- Verify exact integration concurrency, session/device continuity, allocation carry-forward and canonical SRS reuse with owner evidence.
- Complete SRS natural-time evidence and any required Human/Product UI/public-release gates.
- Obtain separate authorization for public flag/entry/navigation, push/PR/merge/deploy, Production/Staging and activation.

## Integration source checkpoint — 2026-08-27

- The hidden bridge now requires two server-owner seams before reading state: exact `content_ref` resolution to one stable item and a per-game server-verified learning score. It never reads client `item_id` or `learning_score` as authority.
- `supabase/migrations/20260827111028_phase1_learning_review_atomic_source.sql` prepares the Free-only atomic owner, CAS, durable idempotency, exact replay/conflict handling, stable-id SRS stage-0 entry and deny-by-default privileges.
- The source is committed preparation only. It is not applied anywhere and must wait for Free SRS Day 8 PASS plus fresh Pre-Work, Security, migration-collision and rollback gates. Paid/Public/Production remain disabled.
- The five-game server verifier source is now prepared under `score-submit` with a hard default-OFF constant. Tone recomputes the raw ladder/component average, Reading recomputes the first-check syllable average, Listening keeps primary listening score only, Typing derives its quota from protected canonical units, and Word Order derives remaining life from wrong/hint primitives. Every path excludes combo/golden/level/end-round/SRS bonuses, rejects client learning-score authority and fails closed on missing/ambiguous content. No Review/RPC mutation is wired or activated.

## Stop boundary

Stop before Product/shared authority, SRS Plans/Checklists/Sandbox/automation/identity, Supabase, Auth/Login, shared UI/navigation, game runtime, sitemap, robots, service worker, Production/Staging, or public activation.
