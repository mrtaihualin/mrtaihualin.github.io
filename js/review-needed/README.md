# Review Needed hidden candidate — pre-SRS state-machine contract

> Status: `CURRENT FOR THIS ISOLATED BRANCH / NON-PRODUCT PREVIEW / DEFAULT OFF`
> Role: minimum source-adjacent Master Plan + Full Checklist for this hidden candidate.
> This file does not authorize public activation, Production, Staging, Supabase, SRS Sandbox mutation, or Phase PASS.

## Current Product authority

Lin's final 2026-08-27 Decision replaces the earlier candidate's Review-attempt interpretation. One opaque owner plus `game + level + item` has exactly one active state. The five game histories remain isolated.

| Current state | Score | Replacement state | Due/group |
|---|---:|---|---|
| `NORMAL` | `10` | `SRS` canonical initial route | owner-derived stage `0`; not Day 1 passed |
| `NORMAL` | `4–9` | `WEAK_4D` | `+4` calendar days |
| `NORMAL` | `0–3` | `RETRY_END_ROUND` | once, at end of the round |
| `RETRY_END_ROUND` | `10` | `NEXT_DAY_CHECK` | `+1` calendar day; front priority group |
| `RETRY_END_ROUND` | `0–9` | `REVIEW_NEEDED` | `+1` calendar day |
| `NEXT_DAY_CHECK` or `REVIEW_NEEDED` | `10` | `SRS` canonical initial route | owner-derived stage `0`; not Day 1 passed |
| `NEXT_DAY_CHECK` or `REVIEW_NEEDED` | `4–9` | `WEAK_4D` | `+4` calendar days |
| `NEXT_DAY_CHECK` or `REVIEW_NEEDED` | `0–3` | `REVIEW_NEEDED` | `+1` calendar day |
| `WEAK_4D` | `10` | `SRS` canonical initial route | owner-derived stage `0`; not Day 1 passed |
| `WEAK_4D` | `4–9` | `WEAK_4D` | `+4` calendar days |
| `WEAK_4D` | `0–3` | `RETRY_END_ROUND` | once, at end of the round; then retry rules |

Multiple next-day items form a priority group; no item is assigned a literal final question position. A transition must atomically and idempotently close/replace the prior state. The candidate emits only deterministic owner directives and never mutates SRS or storage. If canonical SRS state exists, reuse it; if presence is unknown/conflicting, fail closed. After SRS entry, all later pass/fail/reset behavior belongs to the SRS owner and cannot backflow into these pre-SRS states. Saved Word remains manual-only.

The prior Free `1` / dormant Paid `4` Review-attempt maximum is superseded wherever it conflicts with this state machine. Paid remains runtime-disabled. The candidate creates no Paid state machine, entitlement, payment, weakness percentage, or public path.

## Pre-Work Gate

- Current phase: original Phase 1 remains paused outside separately authorized lanes; this is hidden/local preparation only.
- Decision authority: Current Product `PD-SRS-01` plus Lin's latest explicit Decision above.
- Scope: pure state normalizer, transition/queue directives, schema-neutral read adapter, synthetic fixtures/tests, and localhost-only technical preview.
- Out of scope: SRS Sandbox, database/event schema, Supabase, Auth/Login, shared UI/navigation, game runtime, Central/Phase shared checklist, public activation, Production/Staging, and remote Git action.
- Definition of Done: all locked transitions; exact `+1/+4`; priority group semantics; one-active-state/dedupe/idempotency/race; five-game isolation; SRS no-backflow and stage-0 owner-only boundary; malformed fail-closed; hidden/default-OFF/read-only proof; regressions, browser technical checks, leakage and write-set checks.
- Authorization: owned hidden candidate files, the exact Current Product/member-summary Delta, and a local corrective commit only.

## Architecture and integration seam

`review-needed-candidate.js` is a pure UMD module. It accepts normalized active states and SRS Due snapshots, validates them, composes a technical queue plan, and creates read-only transition directives. `applyDirectives` is an in-memory owner-contract simulator used only to prove compare-and-swap, idempotency, race rejection, and one-active-state behavior.

`review-needed-read-adapter.js` has no table, event, account, timezone, endpoint, Supabase, RPC, or storage binding. A later owner integration must map its authorized schema into these allowlists:

- Active state: `sourceType, ownerKey, game, level, itemId, state, stateToken, dueOn, roundToken, retryOrdinal`.
- SRS Due snapshot: `sourceType, ownerKey, game, level, itemId, due, mastered`.
- Existing canonical SRS state: `sourceType, ownerKey, game, level, itemId, stateToken, stage, dueDate, mastered`.
- Result evidence for a pure directive: exact numeric `score`, explicit calendar `occurredOn`, opaque `actionToken`, and `roundToken` only when the target is the once-per-round retry. SRS entry additionally requires explicit `absent`/`present` canonical-state status.

`ownerKey` is an opaque identity component. Fixtures use only synthetic values; the preview does not render it. Exact account/storage identity remains an owner integration decision.

## Owned write-set

- `js/review-needed/**`
- `dev/review-needed-hidden-preview.*`
- `scripts/fixtures/review-needed-hidden-fixtures.js`
- `scripts/tests-review-needed-hidden-candidate.js`
- Current Product `PD-SRS-01` and the membership summary Delta explicitly authorized for this Decision

Central, Phase 1, Free/Paid SRS Sandbox Master Plans/Checklists and automation/evidence namespaces remain read-only. Their prior Review `1/4` wording is an owner reconciliation Delta, not this lane's write-set.

## Full Checklist

| Item | Acceptance | State |
|---|---|---|
| `RNH-SM-01` | Current Product and candidate authority replace the conflicting Review `1/4` attempt interpretation | `PASS` |
| `RNH-SM-02` | All Normal/Retry/Next-day/Review/Weak transitions match exact `0–3 / 4–9 / 10` bands | `PASS` |
| `RNH-SM-03` | Calendar due dates are exactly `+1`/`+4`, including month/year/leap boundaries | `PASS` |
| `RNH-SM-04` | One owner+game+level+item has one active state; transitions close/replace atomically and idempotently | `PASS` |
| `RNH-SM-05` | Retry is once at end of round; multiple next-day items are a group, not literal question 1 | `PASS` |
| `RNH-SM-06` | Five-game/owner isolation, dedupe, duplicate-token conflict and race loser rejection | `PASS` |
| `RNH-SM-07` | SRS entry emits only stage-0/reuse owner directive; no Day-1 pass, duplicate SRS, mutation, or backflow | `PASS` |
| `RNH-SM-08` | Day 0/1/8 plus empty/loading/error/access-denied and malformed/unknown fixtures | `PASS` |
| `RNH-SM-09` | Adapter is allowlisted/schema-neutral; no invented raw/storage/timezone/weakness rule | `PASS` |
| `RNH-SM-10` | Paid remains dormant; Saved Word manual-only; default OFF/local-only/noindex/unlinked/read-only | `PASS (source)` |
| `RNH-SM-V` | Targeted, relevant regressions, site gate, desktop/mobile browser, leakage and write-set checks | `PASS` |
| `RNH-SM-Z` | New local corrective commit; no push/PR/merge/deploy | `PASS (this local checkpoint)` |

Historical `RNH-B`, `RNH-CFX`, Free-one/Paid-four, and SRS-derived Review projection rows from commits `2761659`, `472f8e5`, and `56596f9` are superseded; they are history, not the current contract.

## Verification checkpoint

- Candidate state-machine suite: `23/23` PASS, covering every transition boundary, exact calendar `+1/+4`, front priority group, once-per-round retry, one-active-state, dedupe/idempotency/race, five-game/owner isolation, SRS stage-0/reuse/no-backflow, Day 0/1/8, malformed fail-closed, adapter and hidden boundary.
- Preserved regressions: Phase 1 SRS `17/17`, Listening `55/55`, shared game system `29/29`, game-flow and behavioral suites PASS. These existing owner suites still assert the earlier runtime Review-one behavior; they are preserved evidence and require owner reconciliation before activation, not authority for this candidate.
- Full site gate: `1,022` project files PASS, including syntax, secret scanner, Phase 1 suites, navigation, accessibility warning-only and SEO/sitemap checks.
- Browser technical check: Desktop `1280×800` and Mobile `390×844` PASS. Default OFF is blank and inaccessible; explicit loopback flag renders six synthetic rows, stage-0 owner directive, managed mobile table overflow and a focus-visible scroll region, with no links/forms, owner identity, console warning/error, storage, network or mutation.
- Repository write-set remains seven candidate-owned files. The only outside-repository authority Delta is Current Product `PD-SRS-01` plus the central membership summary explicitly authorized by Lin.

## Hidden developer preview

`dev/review-needed-hidden-preview.html` is a synthetic non-product technical view. It has no public link, form, storage, or network path; carries `noindex,nofollow,noarchive`; begins hidden; and requires loopback plus `?review-needed-preview=1`. It displays state/source/group fields and a sample read-only stage-0 owner directive. Its row order, copy, and styling do not define final Product placement, question order, copy, or visual design.

## Activation checklist — intentionally waiting

- Exact authorized account/state/event/storage mapping and atomic persistence implementation by the owning integration.
- SRS owner's reconciliation of current Sandbox plans/checklists and natural-time evidence against the latest Product Decision without mutating this candidate lane.
- Integration proof that one active state survives retries, concurrency, session/device boundaries, and canonical SRS-state reuse.
- Product/UI authorization for final placement, copy, design, Saved Word interaction, and Human visual acceptance.
- Paid/runtime authorization and its separate implementation/evidence.
- Separate authorization for public flag/entry/navigation, push/PR/merge/deploy, Production verification, rollback, and activation.

## Stop boundary

Stop before shared UI/font, game runtime, Login/Auth/session, navigation, analytics, service worker, sitemap, robots, Supabase, SRS automation/checklists/identity/namespaces, Central/Phase shared authority, Production/Staging, or any public activation path.
