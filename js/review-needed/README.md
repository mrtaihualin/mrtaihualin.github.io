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
- Definition of Done: reusable module and adapter; Day 0/1/8 plus empty/loading/error/access-denied fixtures; feature flag defaults OFF; preview is localhost-only, unlinked, hidden before enable, and `noindex`; no write path; targeted regression, site gate, write-set, secret/PII, and Git checks pass.
- Verification: `node scripts/tests-review-needed-hidden-candidate.js`, existing SRS regression, and `node scripts/check-site.js`.
- Authorization: local hidden preparation and a local checkpoint commit only. No public activation, Production/Staging mutation, push, PR, merge, deploy, shared UI/navigation, or Phase PASS.

```text
Result: READY — hidden/local Review Needed candidate
Blocker: NONE
Decision needed: NONE
Next action: Implement only the isolated write-set below
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

## Stop boundary

Stop before touching shared UI/font, game runtime, Login/Auth/session, navigation, analytics, service worker, sitemap, robots, Supabase, SRS automation/checklists/identity/namespaces, Central/Phase shared authority, or any public activation path.
