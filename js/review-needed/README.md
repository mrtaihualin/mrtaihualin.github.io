# Review Needed hidden candidate — local technical contract

> Status: `CURRENT FOR THIS ISOLATED BRANCH / NON-PRODUCT PREVIEW / DEFAULT OFF`
> Role: minimum source-adjacent Master Plan + Full Checklist for the exact hidden candidate authorized by Lin on 2026-08-27.
> This file does not change Product WHAT, Phase status, SRS Sandbox ownership, Production, Staging, or public activation.

## Pre-Work Gate

- Current phase: original Phase 1 Guest/Login Free remains paused outside the separately authorized Login Core and Sandbox lanes; this task is a new hidden/local preparation exception only.
- Master Plan and Full Checklist: this file, limited to the candidate below.
- Decision/requirement authority: Current Product `PD-SRS-01`, `PD-MGL-01`, current Phase 1 `P1-B-02`, and the Free/Paid SRS Sandbox plans as evidence contracts only.
- Current status/handoff: Free Day 0 evidence is preserved; the SRS chat alone owns natural Day 1/Day 8 and the Paid checkpoints. This task must not write or reconcile those lanes.
- Scope: pure five-game read model, read-only adapter, dormant tier configuration, fixtures/tests, and a localhost-only developer preview.
- Applicable locked requirements: raw attempts are not SRS state; histories stay per game; Free Due 20% and one Review Needed attempt; Paid contract 30% and at most four attempts while runtime remains disabled; not-due/same-day cannot advance; Mastered is absent from the Free due queue.
- `1` and `4` are maximum Review Needed attempt counts, not day counts. This candidate defines no failure reschedule delay.
- Definition of Done: reusable module and adapter; Day 0/1/8 plus empty/loading/error/access-denied fixtures; feature flag defaults OFF; preview is localhost-only, unlinked, hidden before enable, and `noindex`; no write path; targeted regression, site gate, write-set, secret/PII, and Git checks pass.
- Verification: `node scripts/tests-review-needed-hidden-candidate.js`, existing SRS regression, and `node scripts/check-site.js`.
- Authorization: local hidden preparation and a local checkpoint commit only. No public activation, Production/Staging mutation, push, PR, merge, deploy, shared UI/navigation, or Phase PASS.

```text
Result: READY — hidden/local Review Needed candidate
Blocker: NONE
Decision needed: NONE
Next action: NONE inside hidden/local technical scope; activation remains separately gated below
```

## Master Plan

Build a view-only boundary over the current `tone_srs_state` read contract. Keep queue derivation pure and tier-configured so later verified SRS evidence can change inputs without requiring UI or persistence rewrites. The preview uses synthetic fixtures only and is not a proposed final screen, layout, or copy.

### Owned write-set

- `js/review-needed/**`
- `dev/review-needed-hidden-preview.*`
- `scripts/fixtures/review-needed-hidden-fixtures.js`
- `scripts/tests-review-needed-hidden-candidate.js`
- one verified Delta entry in `MAINTENANCE.md`

## Full Checklist

| Item | Acceptance | State |
|---|---|---|
| `RNH-A-01` | Authority, collision boundary, and exact local-only authorization resolved | `PASS` |
| `RNH-B-01` | Headless five-game SRS read contract ignores raw attempts and never mutates state | `PASS` |
| `RNH-B-02` | Read-only adapter uses only the current table/select/user filter contract | `PASS` |
| `RNH-B-03` | Tier configuration proves Free `20% / 1` and dormant Paid `30% / 4` without enabling Paid runtime | `PASS` |
| `RNH-C-01` | Day 0/1/8 and empty/loading/error/access-denied fixtures pass | `PASS` |
| `RNH-C-02` | Local preview is default OFF, localhost-only, unlinked, hidden before enable, and noindex | `PASS` |
| `RNH-V-01` | Targeted regression, current SRS regression, full site gate, write-set, and leakage checks pass | `PASS` |
| `RNH-Z-01` | Local checkpoint commit only; no push/PR/merge/deploy/runtime mutation | `PASS` |
| `RNH-H-01` | Malformed/unknown/duplicate canonical rows fail closed; stage 0 and cross-game identity remain correct | `PASS` |
| `RNH-H-02` | Exact allowlisted read mapping can accept later SRS evidence without carrying user identifiers or extra fields | `PASS` |
| `RNH-H-03` | Preview passes desktop/mobile hidden, viewport, keyboard, semantic-table and basic accessibility checks | `PASS` |
| `RNH-H-04` | Remaining activation-only dependencies are explicit without inventing placement, copy, design, or reschedule behavior | `PASS` |
| `RNH-Z-02` | Hardening Delta passes targeted/full verification and is preserved in a second local-only commit | `PASS` |

## Reusable integration seam

`review-needed-read-adapter.js` owns the allowlisted mapping from the existing `tone_srs_state` read result into the headless contract. Its boundary is fixed to:

- table `tone_srs_state`;
- selected fields `game, level, word, stage, due_date, ever_failed, mastered`;
- account filter `user_id`;
- item identity `game + level + word`;
- output record type `srs_state` and mode `read-only`.

The mapper drops any returned field outside that allowlist, including user identifiers. A later integration must provide the exact verified current read result; this candidate does not add a schema, RPC, write fallback, Auth behavior, or Staging connection.

The `dueQuota/selectedDue` values are a deterministic read-only preview projection for contract tests. They do not replace the existing game/runtime allocator, its carry behavior, attempt evidence, or transition owner. Final integration must consume and verify the owning runtime result instead of making this candidate a second state machine.

## Activation checklist — intentionally waiting

- Free public integration waits for the SRS owner's natural-time Day 1/Day 8 evidence and the owning authority's reconciliation. This candidate does not consume or alter that namespace.
- Paid remains dormant. Any Paid activation additionally waits for its owning natural-time evidence and separate Paid/runtime authorization; the `30% / maximum 4 attempts` contract alone is not activation.
- Final placement, product-facing copy/design, and Human visual acceptance require their owning Product/UI authorization.
- Integration must be verified on one exact authorized release candidate against the current account-bound read contract, access-denied/error behavior, five-game isolation, and regression gates.
- Public entry/flag/navigation, push/PR/merge/deploy, Production verification, rollback, and final activation remain separate release gates.

## Hardening verification checkpoint

- Targeted contract/adapter/hidden-boundary suite: `17/17` PASS.
- Desktop `1280×800`: default OFF rendered no visible content; explicit local flag rendered five isolated rows, remained within viewport, exposed a caption/six scoped headers/live status, had no links/forms/focus trap, and logged no warning/error.
- Mobile `390×844`: body and preview region remained contained; the technical table was horizontally scrollable inside its region, heading/five rows remained available, keyboard Tab produced no unexpected focus target, and console warning/error remained empty.
- No network mutation API, storage mutation, form, public link, navigation entry, or non-local enable path exists in the candidate write-set.

## Stop boundary

Stop before touching shared UI/font, game runtime, Login/Auth/session, navigation, analytics, service worker, sitemap, robots, Supabase, SRS automation/checklists/identity/namespaces, Central/Phase shared authority, or any public activation path.
