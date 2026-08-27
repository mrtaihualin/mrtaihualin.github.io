# Review Needed hidden candidate — local technical contract

> Status: `CURRENT FOR THIS ISOLATED BRANCH / NON-PRODUCT PREVIEW / DEFAULT OFF`
> Role: minimum source-adjacent Master Plan + Full Checklist for the exact hidden candidate authorized by Lin on 2026-08-27.
> This file does not change Product WHAT, Phase status, SRS ownership, Production, Staging, or public activation.

## Correction authority

Lin's latest explicit Product clarification supersedes the earlier candidate interpretation preserved in commits `2761659` and `472f8e5`:

- Review Needed is not SRS Due.
- Review Needed trigger/eligibility is not locked here: the candidate accepts only an already-valid upstream Review Needed queue item and does not decide which wrong-result type or date creates it.
- Free permits at most one Review Needed correction attempt. Dormant Paid permits at most four attempts; these are attempt counts, not day counts.
- SRS Due is a separate owner-provided snapshot. This candidate never mutates SRS state itself.
- When the same `game + level + item` is both Review Needed and SRS Due, the composer emits one Review item first and routes its one result to Review resolution plus the SRS owner only because it is due.
- Latest replacement Decision: when Review Needed is answered correctly, close the wrong-item queue and request the SRS owner's canonical initial route. If canonical SRS state is absent, that route begins at derived stage `0` and resolves the first checkpoint from current SRS authority; it is not stage `1`, stage `2`, or a passed Day 1. If state already exists, reuse it unchanged and never create a duplicate. Unknown presence fails closed.
- Saved Word remains a separate manual action. There is no auto-save or Day 3/Day 5 messaging.

The previous `tone_srs_state`-derived Review projection and its `dueQuota/selectedDue` preview were a conflation. They are removed from the current contract, adapter, fixture, preview, and tests. Their old PASS rows below are historical evidence only and no longer describe the candidate.

## Pre-Work Gate

- Current phase: original Phase 1 Guest/Login Free remains paused outside separately authorized lanes; this task is a hidden/local preparation exception only.
- Master Plan and Full Checklist: this README, limited to the candidate below.
- Decision authority: Lin's latest explicit clarification above is binding for this Delta and is reconciled into Current Product `PD-SRS-01`. Phase 1, Central, and Free/Paid SRS plans/checklists remain read-only authority/evidence inputs.
- Current status/handoff: SRS owners retain natural-time evidence, state, schedule, and transition ownership. This candidate must not write or reconcile those lanes.
- Scope: pure five-game queue composer, schema-neutral normalized input adapter, dormant Paid attempt-limit contract, synthetic fixtures/tests, and localhost-only developer preview.
- Definition of Done: separate valid Review queue/SRS inputs without defining a trigger; Free `1` and dormant Paid `4`; identity dedupe and Review-first ordering; correct Review closes its queue and emits only canonical stage-0 entry or existing-state reuse; five-game isolation; Mastered exclusion; fail-closed malformed/presence input; read-only directives; hidden/default-OFF boundary; targeted and risk-based regression; browser technical checks; leakage and write-set checks; local corrective commit.
- Authorization: local hidden preparation and local corrective commit only. No public activation, Production/Staging mutation, push, PR, merge, deploy, shared UI/navigation, SRS namespace, or Phase PASS.

## Master Plan

Keep all upstream storage and event details outside this candidate until their owning schema is locked. Consume two normalized read-only arrays, validate them strictly, and compose a deterministic queue without emitting mutations:

1. `reviewQueueItems`: already-valid Review Needed items and attempt status supplied by the owning upstream authority.
2. `srsDueSnapshot`: the SRS owner's already-evaluated `due/mastered` snapshot.
3. Deduplicate by `game + level + itemId`, retain Review priority, and preserve remaining Due items.
4. Expose read-only directives only: Review resolution, conditional SRS-owner evaluation, canonical initial-entry request after a correct Review, existing-state reuse, no candidate mutation, Saved Word manual-only.

### Owned write-set

- `js/review-needed/**`
- `dev/review-needed-hidden-preview.*`
- `scripts/fixtures/review-needed-hidden-fixtures.js`
- `scripts/tests-review-needed-hidden-candidate.js`

## Full Checklist

| Item | Acceptance | State |
|---|---|---|
| `RNH-A-01` | Earlier local-only authority/collision boundary resolved | `PASS (historical)` |
| `RNH-B-01..03` | Earlier SRS-derived headless projection/adapter/tier proof | `SUPERSEDED — conflation corrected` |
| `RNH-C-01..02` | Earlier fixtures and hidden preview boundary | `PASS (historical; fixtures/preview replaced)` |
| `RNH-H-01..04` | Earlier hardening, adapter, browser, and activation dependency audit | `PASS (historical; corrected contract reverified below)` |
| `RNH-Z-01..02` | Earlier two local commits with no remote action | `PASS (historical)` |
| `RNH-CFX-01` | Valid Review queue items and SRS Due snapshot are distinct normalized sources with no storage binding | `PASS` |
| `RNH-CFX-02` | Candidate defines no wrong-type/date trigger; it accepts only valid upstream Review queue items and keeps resolved items out | `PASS` |
| `RNH-CFX-03` | Free max `1`; dormant Paid max `4` without retry-day/delay rule or runtime activation | `PASS` |
| `RNH-CFX-04` | Same Review+Due identity emits once as Review; remaining Due follows; one result routes to the correct owners | `PASS` |
| `RNH-CFX-05` | Five-game isolation, duplicate/action identity, malformed/date/unknown fail-closed, and Mastered exclusion | `PASS` |
| `RNH-CFX-06` | Day 0/1/8 and empty/loading/error/access-denied synthetic fixtures cover corrected sources | `PASS` |
| `RNH-CFX-07` | Preview visibly distinguishes source/type while remaining technical, hidden, local, unlinked, and noindex | `PASS` |
| `RNH-CFX-08` | Correct Review closes only its wrong queue, requests canonical derived stage `0` when SRS is absent, reuses existing state unchanged, and fails closed on unknown/mismatched presence | `PASS` |
| `RNH-CFX-V` | Targeted, SRS/game/listening regression, site, browser, leakage, write-set, and Git checks | `PASS` |
| `RNH-CFX-Z` | Corrective Delta preserved in a new local commit; no remote action | `PASS` |

## Normalized integration seam

`review-needed-read-adapter.js` deliberately contains no table, event, account, Supabase, RPC, endpoint, timezone, or environment binding. Upstream owners must provide exact normalized fields:

- Valid Review Needed queue item: `sourceType, game, level, itemId, attemptsUsed, resolved, actionToken`.
- SRS Due snapshot: `sourceType, game, level, itemId, due, mastered`.
- Existing canonical SRS state, only when resolving a correct Review against `present`: `sourceType, game, level, itemId, stage, dueDate, mastered`.

The adapter drops fields outside these allowlists and validation fails closed. It has no `outcome`, `occurredDate`, `eligibleOn`, wrong-type, date, timezone, storage, or event trigger contract. Correct-result resolution requires explicit `absent` or `present` SRS-state status. Unknown status fails closed. A later integration may map an authorized owning schema into this seam, but this candidate does not guess that mapping.

The pure resolution directive never writes. For `absent`, it requests `derivedStage: 0`, records `day1Passed: false`, leaves the checkpoint to current SRS authority, and forbids duplicate creation. For `present`, it returns the normalized existing stage/due unchanged and requests reuse. The owning integration must make the canonical, idempotent transition; this hidden candidate cannot perform it.

SRS Due ratios and scheduling remain entirely with the SRS owner. The Review tier contract contains only `maxReviewAttempts` and runtime enablement; no SRS quota is projected here. Paid is dormant and the contract intentionally defines no scheduling rule for attempts two through four.

## Hidden developer preview

`dev/review-needed-hidden-preview.html` is synthetic and non-product. It has no public link, form, storage, or network path; carries `noindex,nofollow,noarchive`; begins hidden; requires localhost or loopback plus `?review-needed-preview=1`; and shows technical source/type fields only. It is not final placement, copy, design, or Human visual approval evidence.

## Activation checklist — intentionally waiting

- A Product Decision and owner contract for which wrong-result types/dates create a valid Review Needed item; this candidate intentionally stops before that trigger.
- Exact authorized mappings from the owning valid Review queue, SRS Due snapshot, and canonical SRS-state presence/read schemas into this normalized seam.
- SRS owner's required natural-time evidence and integration verification on the exact release candidate; this task does not consume or alter that evidence namespace.
- Product/UI authorization for final placement, copy, design, Saved Word interaction, and Human visual acceptance.
- A separate Product decision for any Paid retry scheduling after its first attempt, plus Paid/runtime authorization and evidence.
- Account/access behavior, one-result routing, five-game isolation, and no-duplicate identity verified in the authorized integration environment.
- Separate authorization for public flag/entry/navigation, push/PR/merge/deploy, Production verification, rollback, and activation.

## Corrective verification checkpoint

- Corrected candidate suite: `20/20` PASS, including no trigger inference, Review/SRS dedupe, correct-result queue close, canonical derived-stage-0 request, existing-state reuse, five-game isolation, Free `1`, dormant Paid `4`, and fail-closed presence/identity/date validation.
- Preserved regressions: Phase 1 SRS `17/17`, Listening `55/55`, shared game system `29/29`, game-flow and behavioral suites PASS.
- Full site gate: `1,022` project files PASS, including JavaScript/HTML/CSS, secret scan, Phase 1 suites, navigation, mobile/accessibility warning-only gate, and SEO/sitemap.
- Browser: Desktop `1280×800` and Mobile `390×844` PASS; default OFF renders no visible text; explicit localhost flag renders six deduplicated technical rows, stage-0 directive, scoped headers/live status, contained/scrollable mobile table, no trigger copy, no link/form/focus target, and no console warning/error.
- Write-set remains seven candidate-owned files. No Supabase, Auth, Login, game runtime, shared UI/navigation, service worker, sitemap, robots, SRS Sandbox, Production, or Staging file/path is changed.

## Stop boundary

Stop before touching shared UI/font, game runtime, Login/Auth/session, navigation, analytics, service worker, sitemap, robots, Supabase, SRS automation/checklists/identity/namespaces, Central/Phase shared authority, or any public activation path.
