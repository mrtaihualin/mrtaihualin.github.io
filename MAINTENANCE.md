# ประวัติงานดูแลเว็บ

**Updated: 2026-08-18 17:45 Asia/Bangkok** — Phase 1 Listening Review1/Due20 + game-content RPC least privilege

## 2026-08-18 — P1-B-02/C-LISTENING-02 Review1/Due20 + RPC ACL (`FIXED_PASS_LOCAL / PRODUCTION_UNCHANGED`)

- Listening now binds the Free allocator's selected Due items to a per-round Review policy: each Due item can consume one actual attempt, a failed Due item cannot re-enter the same round, and its SRS submission is claimed once before the request. The policy persists through safe resume; restart removes already-attempted Due items, and legacy resume state without the policy starts a fresh round instead of guessing while Auth may still be resolving.
- Added negative runtime regressions for failed-Due requeue, second Review attempt, duplicate SRS submission, resume claim preservation, fail-closed Review1 and 2/10 actual Due attempts. The Listening-only cache key advances from v11 to v12; no Phase 1.2 UX work or other game formula changed.
- Fixed fresh-install SQL source and added a rerunnable existing-deployment migration that prechecks the exact SECURITY DEFINER signature, revokes `PUBLIC`/`anon`/`authenticated`, grants only `service_role`, and aborts if the effective postcheck is not least privilege. Its recovery route re-runs the same closed ACL; it never restores browser execute access or changes rate-counter rows/function code.
- Listening 46/46, Phase 1 SRS 17/17, Game Flow, S29 score/security, save/retry 11/11, backend transactions 9/9, owner-switch 12/12, SQL source checks, ephemeral PostgreSQL pre/post/idempotent-recovery proof, `git diff --check` and the full 987-file site gate pass locally. No Production SQL, client/Edge deploy, account/data mutation, secret access, provider action, PR #44 action or Phase 1.2 implementation occurred.

## 2026-08-18 — P1-F-02/F-03 Calendar Rate Limit + False Success (`FIXED_PASS_LOCAL / PRODUCTION_UNCHANGED`)

- Traced the LINE delete/move paths and confirmed that request claims happened only after one or more Google Calendar reads. Repeated buttons were therefore write-deduplicated but could still burst duplicate provider reads before the lock. All three delete/reschedule handlers now claim before their first Calendar request, and move reuses the claimed precheck snapshot instead of immediately reading the same event again.
- Added one shared bounded Google Calendar request policy: exponential backoff applies to read failures and explicit provider rate-limit rejections; ambiguous PATCH/DELETE network or server failures are never replayed automatically. Delete/move verification failures preserve the request lock and recovery backup instead of treating the operation as safely retryable, and delete never automatically reclaims such a stale lock.
- Calendar outcomes now use `SUCCESS`, `PARTIAL_SUCCESS`, `RETRY_PENDING` and `FAILED`. Final LINE responses enumerate confirmed work and pending schedule/request/notification work; provider payloads are logged only for diagnosis and are never shown to LINE users. Delete notification now runs after confirmed Calendar deletion but before request finalization, so a follow-up database failure cannot silently skip the student notice.
- Targeted regressions cover normal success, HTTP 403 `usageLimits/rateLimitExceeded`, bounded retry, ambiguous mutation non-replay, early repeated-action dedupe, partial delete follow-up, notification ordering and raw-payload redaction. Calendar reliability, classroom behavioral, syntax and the full 987-file site gate pass locally.
- No Google Calendar/LINE request, SQL, Edge/client deploy, secret/config, account/student-data or other Production mutation occurred.

## 2026-08-18 — P1-G-02/F-02/F-08 Low-Quota Dual Authorization (`FIXED_PASS_LOCAL / PRODUCTION_UNCHANGED`)

- Preserved the immediate best-effort last-lesson check after successful teacher attendance: the browser now sends the existing verified teacher session JWT and only the attended student token; it never receives or sends the internal cron secret.
- `low-quota-cron` now accepts exactly two fail-closed entry modes before service-role access: the existing `x-cron-secret` scheduler contract, or a server-verified Supabase session for the established teacher email. Teacher calls are token-scoped, while only the internal scheduler may run the all-student scan. Scoped CORS/preflight support covers the existing website origins without exposing the cron header.
- Regression coverage scans every classroom JavaScript caller and locks the active attendance invocation, anon-bearer rejection, no-browser-secret boundary, teacher identity rejection, teacher token scope, internal-secret preservation, authorization-before-service-role order and CORS boundary. Cron authorization 32/32, cron reliability 18/18, classroom behavioral, Phase 1 auth-session 13/13, `git diff --check` and the full 985-file site gate pass locally.
- No SQL, Edge/client deployment, secret/Auth/config change, cron/LINE invocation, account/student data mutation or other Production action occurred. Production rollout and notification verification remain separately authorized gates.

## 2026-08-18 — P1-C-TYPING-01 Guest Startup (`FIXED_PASS_LOCAL / PRODUCTION_UNCHANGED`)

- The deployed desktop/mobile lab exception matches the retired Free Star/badge HUD defect: Typing `refreshUI()` still wrote to three HUD elements already removed from the Phase 1 page.
- Removed only those three stale Typing HUD writes, rebuilt only the Typing minified bundle and advanced its Typing-only cache key to v33. A regression now executes `refreshUI()` against the current reward-free Phase 1 HUD.
- Typing, owner-switch, shared Core 5, Free gamification and the full repository gate pass locally. No Reading or other Core 5 runtime, gameplay/scoring/SRS/content, deploy, Production, account/data, Product, Checklist or Central state changed.

## 2026-08-18 — P1-C-READING-01 Guest Startup (`FIXED_PASS_LOCAL / PRODUCTION_UNCHANGED`)

- Chrome Incognito against the deployed page reproduced `TypeError: Cannot set properties of null (setting 'textContent')` at Reading `refreshUI()`: the app still wrote to retired Star/badge HUD elements removed by the Phase 1 Free gamification change.
- Removed only those three stale Reading HUD writes, rebuilt the existing minified Reading bundle and advanced its Reading-only cache key to v34. Added a regression that executes `refreshUI()` against the current Phase 1 HUD without the retired reward elements.
- Reading 11/11, shared Core 5 17/17, Free gamification 20/20, production-shaped local Chrome startup with the public Guest content contract, and the full 978-file site gate PASS. No other Core 5 source, gameplay/scoring/SRS/content, deploy, Production, account/data, Product, Checklist or Central state changed.

## 2026-08-17 — PRIVATE_AUDIO_3 scoped recovery artifact (`PASS_LOCAL / PRODUCTION_NOT_RUN`)

- Added a recovery-only SQL source for exactly six affected `public.audio_assets` rows: restore the three authoritative legacy sentence rows and remove only the three exact-text replacement metadata rows.
- Added a dry-run-first helper that can delete only the three canonical replacement objects through the Supabase Storage API, then verifies all three exact paths are absent through the read-only Storage list API; it never writes `storage.objects`, bucket configuration, RLS or policies.
- Deterministic recovery regression and the full repository gate pass locally. No upload, object deletion, SQL apply, metadata mutation, deploy, Product/Checklist/Central update or Human audio approval was performed.

## 2026-08-17 — P1-D-05/D-07/D-08 Played + Gamification Recovery (`PASS_LOCAL / PRODUCTION_UNCHANGED`)

- Added one source-adjacent recovery artifact that locks the exact pre-D08 Played/client/tone-round Git blobs and reverses the combined rollout by dependency: client only when defective, previous Played Edge, previous tone Edge, then the prior tone SQL contract. The current client remains compatible with the previous Played response, so backend-only recovery can preserve item-level Played without a Pages rollback.
- Recovery intentionally leaves the additive streak tables/RPCs unused instead of dropping or rewriting them. The executable psql recovery reasserts RLS, removes `PUBLIC`/`anon`/`authenticated` access, retains service-role-only access, and contains no delete/truncate/drop or player-row cleanup.
- Deterministic recovery source checks pass 31/31 in a full-history clone and in GitHub Actions' depth-1 merge checkout: full history verifies the immutable historical blobs and semantics directly, while a shallow checkout verifies the same pinned manifest, safe paths, and exact forward SQL blobs available in the working tree. Existing Played 38/38, Gamification 20/20, backend transaction 9/9 and mixed-version 12/12 gates remain PASS. PostgreSQL fixtures pass both the forward D08 sequential/concurrency contract and the combined recovery: exact Played and Gamification migrations apply, previous Played still records without streak mutation, the prior tone transaction is restored, and all RLS/privilege invariants hold. `node scripts/check-site.js` passes all 979 tracked project files. The artifact itself performs no SQL, Edge/client deploy, account/data write, cleanup, or other Production mutation.

## 2026-08-17 — P1-D-09 Account Audit Integrity (`PASS_LOCAL / SQL_EDGE_CLIENT_ROLLOUT_BLOCKED`)

- Removed the browser's direct call to the `SECURITY DEFINER` account-audit RPC. A Facebook link audit now crosses the existing authenticated `account-unlink` Edge boundary, which re-verifies the caller through Auth, derives the owner and provider states from server sources and calls the privileged RPC with the service role.
- Added a source-only migration for the exact existing RPC signature that sets an empty search path, revokes `PUBLIC`/`anon`/`authenticated` execution and retains only `service_role`; its verification block aborts if any browser privilege remains. No audit/account rows are changed by the migration.
- Deterministic source contracts and an ephemeral PostgreSQL privilege fixture cover browser denial, service-role execution, empty search path, unchanged existing audit rows, provider/owner verification and fail-closed rate/RPC errors. All 13 auth-widget consumers advance to cache v15.
- No SQL was applied, no Edge/client source was deployed, and no Auth/provider/account/data/secret/config/Production mutation occurred. Ordered migration → Edge → client rollout and controlled Facebook-link lifecycle verification require separate explicit authorization.

## 2026-08-17 — P1-F-01/F-02/F-08 Cron Reliability B1 (`PASS_LOCAL / SOURCE_ONLY_NOT_DEPLOYED`)

- Bounded the external LINE request in `class-reminder-cron` and `request-sla-cron` to ten seconds with abort/timer cleanup, so a stalled provider cannot consume the full Edge request lifetime. A student lookup failure now stops class reminders before notification processing, and both handlers return non-2xx when any per-run notification/claim error occurred instead of reporting an unconditional success.
- Added a dedicated B-only reliability gate and a read-only SQL snapshot that distinguishes missed schedule, response-retention gaps and HTTP transport status without returning cron commands, secret values, notification bodies or student identifiers. Current Production inspection remains evidence only; HTTP 2xx is not recipient-delivery proof.
- No Edge deploy, SQL execution, cron/LINE invocation, restore, secret/config change, account/player-data mutation or other Production mutation occurred. The separate low-quota immediate browser caller and PR #37 scheduled backup/Drive-retention scope are intentionally excluded.

## 2026-08-17 — P1-D-02/D-09 Account Logout Failure Recovery (`PASS_LOCAL / PRODUCTION_UNCHANGED`)

- Local-device logout remains explicitly `scope: local`; logout-all remains explicitly `scope: global`. Both now clear account UI caches only after Supabase confirms success.
- A resolved or rejected sign-out failure keeps the current session/cache state, shows an accessible visible retry message, and keeps Account Management open instead of silently closing as if every device had logged out.
- Added deterministic lifecycle coverage for local/global failure, cache preservation, confirmed success, server-owned unlink identity and cooldown/cancel deletion boundaries. All 13 existing `auth-widget.js` consumers advance to cache v14 so boards, Core 5, Learning Center, Lego and Vault cannot retain the silent-failure client.
- Account lifecycle 6/6, Auth session 13/13, account boundary 25/25, account export 7/7, Email OTP security 13/13 and the full site gate PASS. No provider login/email, account/data mutation, SQL, Edge/Auth config or Production deployment occurred.

## 2026-08-17 — P1-D-08 Free Daily Streak (`PASS_LOCAL / PRODUCTION_UNCHANGED`)

- Retired Star/XP/freeze and the client-local three-round Daily Streak threshold from the five Free games. Guest receives no streak; Login Free displays only the authenticated authoritative streak status.
- A completed `round-report-v1` saved through Played evidence is the only eligibility trigger. The service-role-only PostgreSQL transaction uses Asia/Taipei days, counts at most one completed round per account/day, serializes per account and keeps retries/replays idempotent.
- Missing days reset streak. A gap is preserved only when every missing day has confirmed evidence classified as a platform or responsible-dependency outage; missing, partial or unconfirmed evidence never acts as grace and never awards a missing day.
- `game-account.js` no longer reads/writes `game_accounts` or advances streak locally. It accepts owner-bound status from `practice-events`, clears retired local reward state and keeps Star compatibility calls fail-closed at zero while cached clients age out.
- Core 5 loaders advance `game-account.js` v4→v5 and `practice-events.js` v2→v3; the four changed minified game bundles were rebuilt deterministically. No SQL was applied, no Edge/client code was deployed, and no Production/account/config mutation occurred.


## 2026-08-17 — P1-D-06/F-01/F-02/F-03 Personal Vault Retry (`FIXED_PASS_LOCAL / PRODUCTION_UNCHANGED`)

- Fixed the word/sentence Vault online callback so it retries for the current verified owner instead of treating the browser event as an owner, and made offline sentence saves persist a durable retry marker.
- Save and delete writes are bounded, serialized and owner-generation scoped. Late timed-out saves cannot clear newer recovery state or resurrect a tombstoned item; a following delete repairs the remote row when necessary.
- Advanced `word-vault.js` v6→v7 on its six existing surfaces and `sentence-vault.js` v2→v3 on Word Order/Vault only. No game formula, content, SQL, Edge, account/player data or Production state changed.
- Deterministic Personal Content 60/60, save/retry 11/11, word-vault sync 68/68, owner-switch 12/12, account-boundary 25/25, auth 13/13, Personal Search 8/8, Learning Center 26/26 and the full 949-file gate PASS.

## 2026-08-17 — P1-F-02/F-03 Played Queue Race (`FIXED_PASS_LOCAL / PRODUCTION_UNCHANGED`)

- Fixed an account-owned retry race where a report queued during an active Played-evidence request could be erased by the older request's stale queue snapshot without ever reaching Edge.
- Each acknowledgement now removes only its own round from the latest persisted owner queue. Reports and owner changes arriving in flight schedule a following drain, while late old-owner responses remain unable to mutate the new owner's state.
- Missing `NetworkGuard` now fails closed and preserves the pending report instead of starting an unbounded direct invocation. Core 5 and Vault loaders advance only `practice-events.js` from v1 to v2.
- Added deterministic runtime regressions for same-owner concurrency, owner switch, late response isolation, transient retry, lock release, missing guard and stale status results. Practice Events 38/38, owner-switch 12/12, save/retry 10/10, account boundary 25/25, auth 13/13, Personal Content 37/37, Round Report 12/12, shared games 17/17 and `node scripts/check-site.js` 949-file gate PASS. No SQL, Edge, account/player data or Production mutation occurred.

## 2026-08-17 — P1-D-05 Authenticated Played Evidence (`PASS_LOCAL / DEPLOY_AND_AUTH_E2E_BLOCKED`)

- Implemented a minimized, account-only `practice_events` writer from completed `round-report-v1` evidence for Tone, Reading, Listening, Typing and Word Order. Guest never queues or writes; raw answers/keystrokes are excluded; retry is owner-scoped and idempotent by round/position.
- Added a JWT-authenticated `practice-events` Edge source that validates protected `learning_items`, rate-limits both record/status actions and calls service-role-only invoker RPCs. The migration adds a retry-unique index, advisory-locked batch replay detection and a read-only latest Played-status RPC; browser roles receive no execute access.
- `我的內容` now labels an exact word/sentence `已練習` / `再練習` only from authenticated gameplay evidence. Save provenance remains a separate `儲存資訊` section and can never create Played state. Status failure keeps neutral actions and exposes an explicit retry.
- PostgreSQL 17 ephemeral validation applied the exact migration and passed first-write/idempotent-replay/status/grant assertions. Practice Events 27/27, Personal Content 37/37, Round Report 12/12, locked game flow, error/recovery and `node scripts/check-site.js` PASS for 950 local project files.
- No migration, Edge Function, client deployment, account/player mutation or Production write occurred. Authorized staging/deploy plus controlled authenticated gameplay/status verification remains required before this item can be marked DONE.

## 2026-08-17 — P1-G-03 Core 5 UI Alignment (`PASS_LOCAL / HUMAN_GAMEPLAY_PV_BLOCKED`)

- Aligned the five Free game surfaces to one centered shared shell, compact page/session/progress hierarchy and responsive level selectors without changing game formulas, answers, SRS or report data.
- Kept learning helpers beside active content, limited the cross-game switcher to the locked Core 5 and added accessible resume regions plus truthful menu/focus-mode ARIA state. The game menu is viewport-bounded and closes with Escape while restoring focus.
- Rebuilt `shared.min.js` with Terser and advanced only the five Core 5 loaders for the affected `shared.css`, `shared.min.js`, `word-menu` and `game-switcher` cache keys. `game-switcher.js` selects the five-item set only for Core 5 current IDs; Lego/Vault keep their original seven-item legacy switcher and unchanged loaders.
- Shared 17/17, Typing 10/10, Word Order 11/11, Reading 9/9, Listening 38/38, Round Report 12/12 and `node scripts/check-site.js` PASS for 941 local project files. Browser smoke at desktop, 390×844 and 844×390 confirmed no horizontal overflow on all five pages, five Core 5 tabs, responsive selectors, inline toolbars and menu Escape recovery; Lego legacy switcher remained intact.
- No deploy or Production mutation occurred. Final authenticated/Guest gameplay and device-specific responsive review remain Human gates.

## 2026-08-17 — P1-B-04 Nickname Recovery Artifact (`PASS_LOCAL / HIGH_GATE_UNCHANGED`)

- Added a source-only recovery transaction that restores the pre-nickname S29 board RPC contract, revokes browser access to nickname set/get/report, and leaves both additive moderation tables and rows intact behind RLS with no browser table grants.
- Added deterministic client/Edge recovery preparation pinned to pre-nickname Git ref `575104d925273d30ef39b7068119f888a7444c09`, exact source/SQL assertions, and a rollback-only PostgreSQL fixture. The preparer performs no deploy, SQL, Git, account, or Production action.
- Production execution remains HIGH risk and requires exact Lin approval for the target and artifact; this local recovery source does not change P1-B-04 Product behavior or Production status.

## 2026-08-17 — P1-B-04 Public Leaderboard Nickname Safety (`PASS_LOCAL / DEPLOY_AND_HUMAN_PV_BLOCKED`)

- Separated the public Leaderboard identity from the private account/profile name, with NFKC/invisible/whitespace normalization and Thai/Traditional Chinese/English safety, evasion and contact-data filtering in both client and SQL contracts.
- Added authenticated set/get/report RPCs, safe fallback/escaped board rendering and Report actions across Tone, Reading, Listening, Typing and Word Order. Report rows are private; public board RPCs expose no user ID, email or private profile nickname.
- Admin hide/reset is scoped only to `leaderboard_public_identities` and moderation report state; it does not delete or mutate auth accounts, private profiles, scores or progress.
- PostgreSQL 17 ephemeral validation applied the exact migration after correcting its Unicode-regex hyphen syntax, then passed normalization, rejection, privacy, duplicate-report and privilege assertions. Nickname targeted tests, security/auth/error regressions, `git diff --check` and `node scripts/check-site.js` PASS for 946 local project files.
- No migration, Edge/client deployment, account/player mutation or Production write occurred. Authorized staging/deploy and controlled moderation UX verification remain required before this item can be marked DONE.

## 2026-08-16 — P1-G-05 Email OTP/Auth Security (`FIXED_PASS_LOCAL / PRODUCTION_E2E_BLOCKED`)

- Read-only Production verification confirmed Email Auth/signups enabled, six-digit OTP, 3,600-second expiry, custom SMTP, 60-second per-email resend interval, and native request/verify limits of 30 per 5 minutes per IP. Access tokens expire after 3,600 seconds, compromised refresh-token detection is enabled with a 10-second reuse interval, CAPTCHA is disabled, and the Dashboard did not expose a numeric project-wide email-send cap.
- The login client now accepts exactly six digits, blocks duplicate request/verify submissions, handles rejected auth promises, returns a generic public send failure, and requires the verified response to contain a session user before reporting success. Existing same-page resume and auth-state close behavior remain unchanged.
- Normal logout keeps the merged PR #21 local/global scope distinction but clears UI/account caches only after sign-out succeeds. All five leaderboard surfaces retain the shared auth client and cache versions from PR #21.
- The integration preserves PR #22 protected Pages exclusions, PR #23 tutorial Escape/focus behavior, and PR #25 Learning Report/summary loaders. Because `reading-auth.js` now contains both PR #25 report linkage and this OTP hardening, its seven existing loaders advance from v24 to v25; no gameplay or protected-content behavior was replaced.
- Regression verification covers the auth/session lifecycle, account and owner boundaries, backend/save retry behavior, Core 5 shared/report behavior, and the full repository gate.
- No OTP email was sent, no account/test/player data was created or changed, and no SQL, Edge Function, Supabase setting or other Production mutation occurred. Full Production OTP send/verify/expiry/reuse/logout proof remains blocked on one separately authorized controlled inbox lifecycle.

## 2026-08-16 — Guest/Login Free Learning Report (`PASS_LOCAL / PRODUCTION_UNCHANGED`)

- Added one shared current-round DTO (`RoundReport`) and wired Tone, Reading, Listening, Typing and Word Order to keep one UUID round identity through Resume, submitted attempts, factual item results, score and the existing score-submission linkage. The DTO rejects raw keystroke capture and exposes a pure `practice_events` draft adapter only; it does not write to Supabase/Edge or create Phase 1.5 persistence.
- Aligned all five reports to `PD-REPORT-01`: Guest output contains only current-round facts; all weakness/strength analysis, recommendation, next-action and AI-style sections were removed without replacement. Tone Result and authenticated daily statistics no longer rank weak steps/words or generate error-derived lesson tips.
- Added one read-only canonical Login summary layer over the existing session/SRS sources and reused it from Learning Center and game reports. Login fields are automatic and non-configurable (`Progress`, `SRS`, `Review Needed`, `Mastered`, `Resume`); Guest receives none of those fields and no long-term history. No new Progress, SRS, Resume, analysis or report subsystem was created.
- Sentence reports reuse the existing structured `words[].th` / `words[].zh` data for per-word segmentation and meanings in Reading, Typing and Word Order. Listening round evidence retains the already-loaded per-game SRS/Review/Mastered snapshot; no database/schema/write-path change was made.
- Rebuilt the four minified game bundles, moved the five game cache keys forward, and moved `reading-auth.js` v23 → v24 on the five in-scope game surfaces so successful score writes can return their stable submission ID while retry keeps the same idempotent payload. Unrelated Lego/Vault loaders remain unchanged.
- Verification: Round Report 12/12, Learning Center 26/26, shared game system 11/11, Reading 8/8, Listening 38/38, Typing 9/9, Word Order 10/10, save/retry 10/10, Challenge 16/16, owner-switch 12/12, backend transaction 9/9, browser static load for all five games + Learning Center, and `node scripts/check-site.js` PASS for 931 project files.
- Paid remains deferred. No SQL, migration, Supabase/Edge change, deploy, player-data mutation or Production verification was performed in this batch.

## 2026-08-16 — S13 Standard Pages Exclusion Guard (`PASS_LOCAL / GIT_HANDOFF_PENDING`)

- Production verification after PR #19 found that the standard GitHub Pages build had republished `data/words-data.js`, `data/adv-sentences.js` and `data/audio-manifest.js` as HTTP 200 even though the protected artifact builder still excluded them correctly. The same branch-source build could also republish the static word/sentence audio directories after any later merge.
- Added root Jekyll `_config.yml` exclusions for the three master/catalog files plus `assets/word-audio` and `assets/sentence-audio`. GitHub Pages applies `exclude` paths before generating a branch-source site, so ordinary Pages deployments now preserve the same protected boundary as the manual artifact workflow without moving source files or changing game runtime behavior.
- Extended the S13 architecture regression to require Jekyll mode and all five standard-Pages exclusions. The manual protected-artifact workflow remains available as defense in depth; no content, audio, Supabase, SQL, entitlement or Production data changed in this source delta.

## 2026-08-16 — P1-G-05 LINE Link Truth (`PASS_LOCAL / EDGE_AND_CLIENT_DEPLOY_NEEDED`)

- Human provider E2E proved an account-integrity mismatch on one device: the main `Lin` UI claimed LINE was connected and showed existing progress, but direct LINE login returned a separate empty `Taihua Lin` account. This is a real defect, not user error; no account was merged, deleted, unlinked or otherwise mutated during diagnosis.
- Root cause: profile/account-management UI trusted stale `app_metadata.line_linked` / `line_user_id` from the browser JWT, while actual LINE login is owned by the service-role-only `line_identities` mapping. The existing unlink path also removed the mapping without clearing that metadata cache.
- `account-unlink` now exposes an authenticated read-only `status` action sourced from `line_identities`; profile and account management wait for that authoritative result before claiming LINE is connected. Successful LINE unlink also clears stale metadata best-effort after verified mapping removal. `auth-widget.js` cache moves v9 → v10 on its 13 existing surfaces.
- The login modal now always explains that returning players must use their original method first, then connect Facebook/LINE from the signed-in profile; switching provider buttons can create a separate account whose progress does not follow. This warning does not depend on device-local last-login history, so it remains visible after logout and on a new device. `reading-auth.js` cache moves v22 → v23 on its seven existing surfaces.
- Verification: account boundary 25/25, auth/error UX 13/13, save/retry 10/10, owner-switch races 12/12, backend transactions 9/9 and `node scripts/check-site.js` PASS for 928 project files.
- Source fix does not decide which of the two existing accounts is canonical and does not repair Production data automatically. After authorized Edge/client deploy, Lin must choose the canonical account and separately authorize any exact account-mapping repair; until then LINE provider E2E and two-device UI remain blocked.

## 2026-08-16 — P1-F-04 Core 5 False Crash Banner (`PASS_LOCAL / DEPLOY_PV_NEEDED`)

- Lin human Guest E2E on Safari confirmed gameplay remained usable while the shared top banner repeatedly claimed `遊戲發生錯誤`. This is a real error-UX defect, not incorrect use and not a gameplay crash.
- Scoped the global runtime handler to the protected content loader and the five Core game application scripts. Uncaught errors from optional same-origin page enhancements remain logged for diagnosis but no longer present a fatal game-reload banner; genuine Core app crashes and protected-content load failures retain the existing recovery UI.
- Bumped `game-content-client.js` from v7 to v8 across Tone, Reading, Listening, Typing and Word Order. Added executable regression proving optional same-origin errors do not show a fatal banner while a Core app error still does.
- Tone first-time guided tour now owns `Escape` only while its overlay is open, closes through the existing safe `gtTourEnd()` path and prevents the same key from leaking into unrelated page shortcuts; a focused regression locks this behavior.
- Production verification after PR #17 confirmed the visible false-fatal banner was suppressed, then exposed a separate hidden legacy `closeLightbox()` null error when `Escape` closed Tone's `📖 玩法` modal. A page-local capture guard now closes that modal, restores focus to its opener and stops the key before the unrelated shared lightbox listener; this follow-up intentionally does not change shared runtime or other pages.
- Verification: network recovery 12/12, Phase 1 error UX 12/12, game behavioral checks PASS and `node scripts/check-site.js` PASS for 928 project files. No gameplay formula, content, audio, auth, SQL, Edge, account/player data or Production state changed; Production human retry remains required after authorized merge/deploy.

## 2026-08-16 — P1-F-02 Production Mutation / Retry / Concurrency PV (`PASS / HUMAN UI GATES REMAIN`)

- Dedicated disposable Production accounts exposed two Tone rollout defects without touching real player data: the Edge dependency used an unavailable rate-limit RPC, then identical concurrent requests could observe the newly committed SRS row and return `not_due` before reading the durable replay operation. Scoped fixes replaced the limiter with the tracked `game_content_rl_check` contract and rechecked the operation record before returning a concurrent SRS rejection.
- Fixes shipped through PR #13, #14 and #15; current main is `a3f8d0cf86a8347708e43cdac61fa04b28d1882e`. PR #15 required run `31933198200`, post-merge required run `31933232922` and Pages run `31933232674` passed. Production `tone-round` v43 is ACTIVE, `verify_jwt=true`, and downloaded source matches main exactly; Score v3, Lego v23, SQL and client/cache remain unchanged.
- Production mutation PV passed for Tone exact retry/changed replay/concurrent duplicate/exactly-once, Score authoritative+legacy mirror retry/conflict/concurrency/RLS, Lego old/new/mixed retry/concurrency/quota count, and canonical two-client stale-CAS/rebase/RLS. Every test account and scoped row was removed; residue count was zero. Core 5, Lego, boards, Edge CORS/auth and full local gate (928 files) passed.
- Remaining launch gates are browser/provider/device/human gates: fresh isolated Guest full gameplay/quota, authenticated OTP/OAuth UI, real two-device browser resume, provider callbacks, and Lin content/audio plus Final Go/No-Go.

## 2026-08-16 — P1-F-02 Mixed-Version Rollout Compatibility (`PASS_LOCAL / PRODUCTION_UNCHANGED`)

- Tone Edge source accepts old cached clients without `round_id` by assigning a server operation UUID while the deployed transactional RPC still serializes the account and rejects stale expected-SRS snapshots; malformed explicit IDs remain fail-closed and new clients retain exact-ID replay.
- Lego Edge source accepts empty/legacy request bodies through a 30-second deterministic compatibility ID. Concurrent/retried legacy calls in the window share one SQL request key, recent committed legacy keys bridge bucket boundaries, and explicit IDs from new clients remain exact and never fall back silently. Guest/IP and verified-account identity remain server-derived.
- Added executable old/new/mixed-version/retry/duplicate regressions and central gate coverage. This bridge is source-only: Production SQL from the separately authorized migration round remains active, while Edge/client versions, config and player data were not changed. Safe rollout order after separate authorization is compatibility Edge first, then current client/cache release.

## 2026-08-16 — P1-F-02 Transactional Backend Redesign (`SOURCE_PASS / PRODUCTION_LOCKED`)

- เพิ่ม additive service-role-only RPC 3 ตัว: `phase1_tone_round_commit` รวม SRS + account stars + ledger + replay result ใน transaction เดียว, `phase1_score_submit_commit` รวม authoritative score + private legacy mirror + marker และ `lego_consume_daily_idempotent` ผูก quota consume กับ identity/day/request UUID. `anon`/`authenticated` ไม่มีสิทธิ์เรียก RPC หรือตาราง operation/request โดยตรง.
- Tone และ Lego client สร้าง request UUID ครั้งเดียว, bounded retry ด้วย UUID เดิม และทิ้ง response เมื่อ account owner/epoch เปลี่ยน; score mirror ไม่เชื่อ `body.wrong_items` แล้ว แต่ derive จาก canonical evidence ที่ validate และอยู่ใน evidence hash. Existing `s29-v1` ที่ marker เป็น null ถูกหยุดเป็น `legacy_mirror_ambiguous` แทนการเดาแล้วสร้าง mirror ซ้ำ.
- PostgreSQL 17.10 ชั่วคราวใน `/private/tmp` ผ่าน migration compile, forced failure rollback ที่ SRS/account/ledger, authoritative/mirror/marker และ Lego count/request; concurrent same-ID/different-word tests ยืนยัน no lost update, score/mirror exactly-once และ Lego consume exactly-once. Local static contracts 9/9, save/retry 10/10, SRS 17/17, S29 PASS; ไม่มี SQL apply, Edge deploy, config/data/schema mutation หรือ action ใดบน Production.
- Production changeset ต้องเรียง additive SQL → Edge `tone-round`/`score-submit`/`lego-daily-limit` → client cache release; stale client ที่ยังไม่มี request UUID ต้อง fail closed จน refresh. Rollback ต้องย้อน client ก่อน Edge และปล่อย additive SQL inert จนยืนยันไม่มี caller; ต้อง precheck จำนวน legacy `s29-v1` marker-null และทำ staging transaction/concurrency test ก่อนขอ Production authorization.

## 2026-08-16 — P1-D-09 Owner-Switch Race Hardening (`PASS_LOCAL / BATCH_IN_PROGRESS`)

- Canonical progress, GameAccount, adaptive history, Core 5 SRS และ personal word/sentence vault จับ account owner + generation/request identity ก่อนเริ่ม async work; response ของ Account A ที่กลับมาหลัง switch/logout จึงไม่เขียน cache, sync flags, pending delete หรือ state ของ Account B/Guest และ stale completion ไม่ล้าง request ใหม่.
- Listening เริ่มรอบจาก local/empty SRS ภายใน 1.5 วินาทีเมื่อ remote read ค้าง, ป้องกัน double start และยอมให้ late response ของ owner เดิมมีผลเฉพาะรอบถัดไป. เพิ่ม deferred-response regressions, rebuild minified Core 4 ด้วย Terser 5.50.0 และ bump cache เฉพาะ runtime ที่เปลี่ยน; ไม่เปลี่ยนสูตรเกม, SQL, Edge Function หรือ Production.

## 2026-08-16 — P1-F-02 Client Failure Hardening Batch (`PASS_LOCAL / BATCH_IN_PROGRESS`)

- Core 5 score submission ใช้ bounded wait 12 วินาทีและ retry ครั้งเดียวด้วย `submission_id` เดิม; personal word/sentence delete เก็บ pending tombstone ข้าม network failure/reload, กัน remote resurrection และไม่อ้างว่าลบบน server สำเร็จก่อนยืนยัน.
- Profile/nickname, account export/unlink/delete และ LINE callback มี bounded deadlines; mutation ที่ผลลัพธ์ไม่แน่ชัดไม่ retry อัตโนมัติและบอกให้ reload ตรวจสถานะก่อน. Cache versions ถูก bump เฉพาะ runtime ที่เปลี่ยน; ไม่เปลี่ยนสูตรเกม, SQL, Edge Function หรือ Production ในรอบ local นี้.

## 2026-08-15 — P1-F-02 Canonical NetworkGuard Bootstrap (`PASS_LOCAL / GIT_HANDOFF_PENDING`)

- หน้า Learning Center และ Vault โหลด `network-guard.js` ก่อน `phase1-canonical-state.js` แล้ว ทำให้ canonical pull/save ใช้ timeout 15 วินาทีและคืน failure ที่ retry ได้ แทนการตกไปใช้ Supabase promise แบบไม่จำกัดเวลารอเมื่อเครือข่ายค้าง.
- เพิ่ม regression ตรวจทั้ง presence และลำดับโหลดของ runtime ในสองหน้าที่เคยขาด; ไม่เปลี่ยน UI, สูตรเกม, schema, SQL, Supabase หรือ Production.

## 2026-08-15 — P1-F-03 Invalid SRS Quota Recovery (`PASS_LOCAL / GIT_HANDOFF_PENDING`)

- `game-flow.js` บังคับ quota state ที่อ่านจาก localStorage ให้เป็น object record ก่อนคำนวณ SRS; `null`, number, string, array และ malformed JSON จึงกู้เป็นสถานะใหม่ที่เล่นต่อได้ แทนการ throw หรือทำ fractional carry หายหลัง refresh/reopen.
- เพิ่ม regression ครอบ invalid shape + durable carry และ bump `game-flow.js` เป็น v3 ใน Core 5; ไม่มีการเปลี่ยนสูตร Free 20%/Review1, Paid architecture 30%/Review4, score, SQL, Supabase หรือ Production.

## 2026-08-15 — P1-D-07 Save ≠ Played Guard (`PASS_LOCAL / GIT_HANDOFF_PENDING`)

- แก้ `我的內容` ไม่ให้ Save provenance ถูกตีความว่าเคยเล่น: ปุ่มฝึกใช้ข้อความกลาง `開始練習` จนกว่าจะมี gameplay/attempt/completed-play evidence ของ item นั้นจริง; ข้อมูลแหล่งที่ Save ยังคงแสดงแยกใน `儲存資訊` ตามเดิม.
- เพิ่ม negative regression ยืนยันว่า Save อย่างเดียวห้ามสร้าง `再練習`/Played label และ bump cache ของ `personal-content.js` ที่ `vault.html`; ไม่เปลี่ยน schema, SQL, Supabase หรือ Production.

## 2026-08-15 — Version Control Lin-Gated Workflow (`READY_FOR_LIN_REVIEW`)

- Canonical workflow remains outside the repo in Projects `AGENTS.md`; repo-local `AGENTS.md` keeps a single redirect and no GitHub Desktop-only override. The PR template now captures base/head, exact required checks, changed files/risk/visual evidence, `READY_FOR_LIN_REVIEW` and Lin merge authorization.
- Developer workflow states 1 Task = 1 `codex/*` branch, separate worktree when concurrent, serialized latest-main integration, no direct/force push, and revert-via-PR recovery. No Product Decision, website runtime, deploy, SQL, Supabase or Production state changed.
- Remote ruleset `20885102` was inspected and consolidated in place on default `main`: bypass list empty, PR required, deletion restricted, force push blocked, required check `required-tests-and-write-set`, and strict latest-main status checks enabled. Branch `codex/version-control-live-proof` → commit `bb380491…` → PR #8 completed the live push/PR proof; required run `31890188247` passed on that head with exact 3-file Write-Set. This evidence-record commit must receive its own exact-head required check before Lin approval and merge.

## 2026-08-15 — P1-B-07 Client Deploy (`DEPLOY_PASS / AUTH_TWO_DEVICE_BLOCKED`)

- Remote isolation PASS: branch `codex/p1-b07-canonical-persistence` = 1 commit ahead / 0 behind `main`, exact 90-file scope, no SQL/Supabase/Owner Map. PR #5 required checks PASS แล้ว squash merge เป็น `3858eb398349047a5433997626d11b145827eb45`.
- `main` Required checks run `31884751916` PASS และ GitHub Pages deployment run `31884751192` PASS ใน 48 วินาที.
- Production source verification 7/7 surfaces (Tone, Reading, Listening, Typing, Word Order, Learning Center, Vault) โหลด `phase1-canonical-state.js?v=1`, `auth-widget.js?v=8`, `shared.min.js?v=31`; Tone โหลด `progress-sync.js?v=5`; console error 0.
- Authenticated Device A/B behavior ยัง `NV`: in-app Browser เป็น Guest และไม่มี Browser/อุปกรณ์ที่สองเชื่อมต่อ จึงไม่สร้างบัญชี ไม่ใช้ข้อมูลจริง และไม่จำลองสองอุปกรณ์ด้วย storage workaround.
- ไม่มี SQL/schema/Supabase mutation. Next gate คือ controlled test account ที่ login พร้อมกันบนสอง Browser/อุปกรณ์จริง แล้วทดสอบ latest-save/CAS, Resume, SRS/progress/streak-badge และ personal-data persistence ตาม Phase 1 scope.

## 2026-08-15 — P1-B-07 Canonical Login Free Persistence (`PASS_LOCAL / DEPLOY_AND_TWO_DEVICE_PV_NEEDED`)

- เพิ่ม `phase1-canonical-state.js` เป็น client persistence owner กลาง: server-owned profile/score/session/SRS/personal data คง canonical table เดิม; client-owned SRS/progress cache และ Account Resume ใช้ versioned envelope ใน `tone_progress.data` เดิม จึงไม่สร้าง schema/SQL ใหม่.
- การเขียน `tone_progress` เปลี่ยนเป็น compare-and-swap ด้วย `updated_at` token: เครื่องที่ถือ baseline เก่าต้อง re-read/rebase pending slices ก่อน retry, read failure ห้ามแปลเป็น remote ว่าง, write serialize และ mutation ใหม่ที่เกิดระหว่าง request ไม่ถูก acknowledge ทิ้ง.
- Guest Resume ยังคง local เฉพาะเครื่อง; Login Free Resume แยกเป็น `phase1_account_resume_v1`, ผูก verified account owner และ sync ครบ Core 5 โดยไม่ import Guest state หรือข้อมูล account ก่อนหน้า.
- เพิ่ม regression 9 ข้อและผูก central gate; bump `auth-widget` v8, `progress-sync` v5 compatibility facade และ `shared.min.js` v31 ครบ 78 หน้า. Targeted account/save/shared tests PASS; Browser local smoke โหลด Tone + Learning Center runtime/Guest recovery ได้ ไม่มี canonical/auth runtime error.
- `node scripts/check-site.js` PASS ทั้งหมด 921 project files/secret scan 1144. ยังไม่มี Git, SQL, schema, Supabase/Production mutation หรือ deploy; ต้อง authorized client deploy + controlled authenticated two-device E2E ก่อนยก PV/D-03/D-04 เป็น PASS.

## 2026-08-15 — S29 Production Authenticated Attack/E2E (`CLOSED_VERIFIED`)

- Production valid-score E2E รอบแรกพบ `503 rate_limit_unavailable`; read-only diagnostic ยืนยัน PostgreSQL `42P10` ใน legacy `rl_check`. แก้ `score-submit` ให้ใช้ server-only `game_content_rl_check` เดิมด้วย key ต่อ JWT user และเพดานเดิม 30/user/600s; local S29 + `node scripts/check-site.js` PASS 919 files/secret scan 1142.
- Deploy เฉพาะ `score-submit`; Production inventory = `ACTIVE` v2, `verify_jwt=true`, source SHA-256 `f64ad118…c942`. Backup/SQL/RLS เดิมไม่รันซ้ำและไม่มี Git action.
- Authenticated Production E2E PASS: valid Core 5 (50/50/50/5/60), forged/negative/malformed/wrong game/difficulty/user blocked, missing/invalid auth 401, exact replay idempotent, changed replay 409, concurrent duplicate one write, request 31/10m = 429.
- Direct INSERT/UPDATE/DELETE บน authoritative/tone/reading ถูกบล็อก 9/9; weekly/all-time RPC 4/4 ผ่าน ordering, tie 50/50, aggregate 100/50/50 และไม่คืน `user_id`/email. Browser กระดาน Production 5 หน้าโหลดครบโดยไม่มี console error.
- บัญชีและข้อมูลทดสอบล้างครบ `remaining=0`. S29 ปิด `CLOSED_VERIFIED`; nickname moderation/report/admin hide-reset ยังเป็น Phase 1 item แยก ไม่เปิด S29 กลับ.

## 2026-08-15 — S29 Production Action 2 (`SQL_RLS_RPC_PASS / CLIENT_NOT_DEPLOYED`)

- Preserved the earlier successful precheck backup evidence from run `31869728662`; the authorized Action 2 used the later fresh encrypted backup run `31869733162` (`backup_2026-08-15_1335-th.tar.gz.gpg`, 1,783,037 bytes) with remote-size verification PASS and retention deletion 0 files.
- Read-only Production precheck on PostgreSQL 17.6 passed: required schema/types/dependencies/RLS/RPC signatures were compatible; conflicting indexes/dependencies, target locks and incoming-bound violations were 0.
- Executed only `supabase/sql/2026-08-15_s29_authoritative_score_security.sql` (SHA-256 `ad668ccae16faaf3d8040be4483e02835557a2e40b44eb3d91fe259e6445b1a4`). The transaction committed without migration error.
- Postcheck passed: authoritative table/indexes/constraints exist; RLS is enabled; `anon` and `authenticated` have no INSERT/UPDATE/DELETE on authoritative or legacy score tables; four anonymous leaderboard RPCs returned HTTP 200 without `user_id` or email in their contracts.
- `score-submit` still passes OPTIONS/CORS 200 and missing-auth 401 without a data write. No client/Git deployment or authenticated attack/E2E was performed; Action 3 is the isolated client release, followed by a separately authorized controlled Production E2E.
- Action 3 local preflight keeps the public `mix-board.html` and `lego-board.html` URLs but disables their obsolete leaderboard runtimes; the five allowed boards remain Tone, Reading, Listening, Typing and Word Order. S29 regression and the full 919-file site gate pass after this alignment.

## 2026-08-15 — S29 `score-submit` Production Action 1 (`DEPLOY_PASS / E2E_BLOCKED`)

- Deployed only `supabase/functions/score-submit` to Production project `qzkxlhpcputsvbqmtqfi`; CLI uploaded `index.ts` and `score-engine.mjs` and reported success. Function inventory confirms `ACTIVE`, version 1, `verify_jwt=true`.
- Non-writing verification passed: Production OPTIONS/CORS returned 200 from Supabase Edge Runtime for `https://mrtaihualin.com`; unauthenticated POST returned 401 `UNAUTHORIZED_NO_AUTH_HEADER`. No deploy/runtime error was observed in these probes and no score/data write was attempted.
- No SQL migration, RLS/policy change, client deploy, other deploy, Git action or Production data mutation was performed. S29 remains blocked; next separately authorized gate is a fresh backup/read-only schema-policy-function precheck before any SQL authorization.

## 2026-08-15 — Phase 1 Consent + Public Search PV (`PASS`)

- Lin manual Production cookie-consent matrix on commit `2219a59245ded859b7aa3168dbd42539ec778ba2` passed all four states: `BEFORE_ACCEPT`, `ACCEPT`, `REVOKE` and `FRESH_REJECT`; `P1-F-05` and `P1-F-06` are closed `DONE`.
- Production Website Search passed desktop/mobile `聲調` results and unknown-query safe fallback. Game Search passed desktop/mobile `打字` → `/typing-game.html` and unknown-query recovery guidance; console warning/error 0. `P1-E-02` and `P1-E-03` are closed `DONE`.
- Verification after central update: Search behavioral 14/14, consent coverage 88 analytics pages + Vault, Vault 6/6 and `node scripts/check-site.js` PASS 919 project files/secret scan 1142.
- Critical Path now requires authorized S29 backend/client release + Production attacks/valid-board E2E (`P1-B-03`) and a separate canonical persistence architecture decision/authorization (`P1-B-07`); no Decision, Git, SQL, Edge deploy or other Production mutation was created in this closeout.

## 2026-08-15 — S14–S18 / S29 Score Security Foundation (`LOCAL_PASS / PRODUCTION_ACTIONS_REQUIRED`)

- ตัด browser direct INSERT คะแนนของ Core 5 ออก: `reading-auth.js` ส่ง JWT-authenticated evidence ไป `score-submit`; Tone ไม่ดัก GA4 เขียน `tone_sessions` แล้ว และทั้ง Tone/Reading/Listening/Typing/Word Order ส่ง proof contract เดียวกัน.
- Edge source derive `user_id` จาก JWT, ตรวจ canonical protected content, คำนวณ final score ใหม่จาก evidence + difficulty, บังคับ game/item/score bounds, UUIDv4 idempotency, replay conflict, unique concurrency guard, fail-closed rate limit 30/user/10 นาที และไม่รับ identity/time/derived fields จาก client.
- SQL source สร้าง authoritative `game_score_submissions`, ปิด direct INSERT/UPDATE/DELETE บน authoritative + legacy score tables, ทำ RPC กระดาน 5 เกมไม่คืน `user_id`/email และเก็บ current-user marker เป็น boolean. Combined cross-game total ถูกถอดตาม `PD-SCORE-01`; `all-board.html` คง URL เดิมเป็น hub เลือก 5 กระดาน.
- Regression: S29 attack contract ครบ VALID/forged high/negative/malformed/wrong user/game/difficulty/no-auth contract/replay/concurrency/rate/direct-write/update/privacy; Core 5 regressions และ `node scripts/check-site.js` PASS 919 files, secret scan 1142; minified runtime rebuilt และ syntax PASS.
- Threat boundary ที่ยืนยันได้คือ accepted score ต้องอยู่ในสูตร/จำนวนข้อ/ลำดับคอมโบ/โบนัสที่เกมทำได้และผูก JWT/เวลา server; ระบบเว็บไม่อ้างว่าแยกผู้เล่นมนุษย์ออกจาก automation ที่ส่งผล perfect ซึ่งยังทำได้จริงตามกติกา. ถ้าต้องการ human-play attestation ต้องออกแบบ per-action challenge/telemetry แยก ไม่ใช่เพิ่ม client secret.
- ยังไม่มี Git/SQL/Edge deploy/Production mutation. S29 ยังไม่ `CLOSED_VERIFIED`: ต้องอนุมัติและทำ backup/precheck → deploy Edge → run SQL → deploy client → controlled Production attacks/valid board E2E. Legacy score rowsถูกเก็บเป็น private history แต่ไม่ย้ายเข้ากระดาน authoritative เพราะพิสูจน์ย้อนหลังไม่ได้; กระดานจะเริ่มสะสมใหม่หลัง rollout. Nickname moderation/report/admin hide-reset ตาม `P1-DN-03` ยังเป็น blocker แยก.

## 2026-08-15 — Automation Enforcement (`SOURCE_PASS / REMOTE_RULESET_REQUIRED`)

- Final state source: required tests run automatically on Pull Request/`main`/merge queue; PR Task-ID + exact Write-Set is fail-closed; tracked pre-commit hook checks staged files against local `.task-write-set.json`.
- PASS criteria verified locally: enforcement unit tests cover exact path, directory scope, traversal/broad-pattern rejection, missing contract and outside-file failure; canonical `node scripts/check-site.js` passes after integration.
- Changed only developer workflow/CI files; no Product Decision, website behavior, Production, deploy, SQL, Supabase or external mutation.
- Remaining hard gate: GitHub owner must enable the tracked hook locally and configure a `main` ruleset requiring Pull Request, no bypass, and `Required checks / required-tests-and-write-set`. Until remote ruleset is active, GitHub cannot pre-block direct push/merge from repository source alone.

## 2026-08-15 — GA4 Pre-consent Cookie Hotfix Deploy (`DEPLOY_PASS / PV_PARTIAL`)

- GitHub protected Pages run `31858936871` deployed commit `2219a59245ded859b7aa3168dbd42539ec778ba2` successfully to `https://mrtaihualin.com/`.
- Production Chinese/English source uses consent default → `gtag('js')` → config → async loader (`461 < 587 < 613 < 708`); bilingual banner/runtime source is present and browser console warning/error is 0.
- Re-ran consent coverage (88 analytics pages + Vault), Vault 6/6 and `node scripts/check-site.js`; all PASS for 908 project files and secret scan 1131.
- Exact Production `_ga*` state before Accept and after Reject/Revoke is still `NOT_VERIFIED`: in-app Browser policy blocks cookie/localStorage inspection and forbids workarounds. Lin must complete one fresh-session manual cookie check before P1-F-05/F-06 can PASS. No SQL/Supabase or other Phase 1 Production mutation.

## 2026-08-15 — GA4 Pre-consent Cookie Hotfix (`LOCAL_TEST_PASS / MANUAL_COOKIE_VERIFY_NEEDED`)

- Manual Production PV พบ `_ga_DKVQE30982` บน fresh session ก่อน Accept/Reject. Root cause คือ default consent ถูก queue หลัง `gtag('js')` และ async loaderอยู่ก่อน inline default จึงเกิด cached-loader raceก่อน denied state.
- แก้ canonical `scripts/apply-cookie-consent.js` และ sync 88 standard analytics pagesเป็น dataLayer/function → stored/default consent → js → config → async loader; รองรับ formatted/minified snippetsและ config options.
- เพิ่ม regressionบังคับ defaultก่อน js/config/loader, exactly one default/loader, fixture normalization + idempotency. Generator rerun 0 changes; consent 88 + Vault, Vault 6/6 และ `node scripts/check-site.js` PASS 908 files/secret scan 1131.
- Fresh unique local origin แสดง bannerก่อน choiceและ DOM order `461 < 587 < 613 < 708` หลังรอ loader 5 วินาที. Browser policy บล็อก exact cookie-store inspection จึงยังต้อง Lin manual verify `_ga*`=0 บน fresh local ก่อน deploy. ไม่มี Git/deploy/SQL/Supabase mutation.

## 2026-08-15 — P1-F-05/F-06 Production Deploy (`DEPLOY_PASS / PV_PARTIAL_FAIL`)

- Lin อนุมัติ deploy และ manual protected Pages run `31857228251` สำเร็จจาก commit `f8787f1a9757a595d3a735d40ae82c399488f04f` ไป `https://mrtaihualin.com/`.
- Production Chinese/English มี deployed GA revoke cleanup + Clarity loader markers; Reject/Accept/Revoke/reload persistence ผ่าน. Vault external Clarity absent เมื่อ denied, present หลัง Accept และ absent อีกครั้งหลัง Revoke; หน้าใช้งานได้และ console warning/error 0.
- Exact Production cookies `_ga`, `_ga_*`, `_clck`, `_clsk` และ event/network payloadsยัง `NV`: Browser security policy บล็อก cookie/localStorage inspection และสั่งห้าม workaround. Local isolated Hard Gate 3 cookie evidenceยัง PASS แต่ไม่ใช้แทน Production.
- ไม่มี SQL, Supabase mutation หรือการเปลี่ยน Phase 1 ระบบอื่น.

## 2026-08-15 — P1-F-05/F-06 Hard Gate 3 Fix (`PASS_LOCAL / PRODUCTION_VERIFY_NEEDED`)

- แก้ standard consent runtime ให้ลบ GA4 `_ga`/`_ga_*` ครบเมื่อ Reject/Revoke รวม delayed cleanup หลัง async write และเพิ่ม regression บังคับทุก GA page มี revoke cleanup.
- English analytics pages 7/7 ใช้ Clarity Consent API V2 runtime เดียวกับ Chinese; canonical generator sync แบบ idempotentและ coverage test บังคับ runtime ทุก English page.
- Verification: consent coverage PASS 88 analytics HTML pages + Vault, Vault 6/6, generator rerun 0 changes, `node scripts/check-site.js` PASS 908 project files/secret scan 1131. Local Browser Hard Gate 3 PASS ครบ Chinese/English/Vault สำหรับ before consent, Accept, fresh Reject, Revoke, reload persistence, cookies/localStorage/network/dataLayer/Clarity และ console warning/error 0.
- ยังไม่ได้ Git/deploy/Production/SQL/Supabase mutation. Production ยังต้อง authorized deploy และ exact verification.

## 2026-08-15 — S13 Production Source Switch Hotfix (`PASS_LOCAL / PUSH_REQUIRED`)

- หลัง large release commit `2297906cfbe8e3195dbb14be31903ac62be19501` และ Pages run `31826509591` สำเร็จ Production พบ Tone/Reading/Typing/Word Order เรียก `GameContentLoader.boot()` ก่อน deferred `supabase-config.js` ทำงาน จึง fail closed ด้วย `Supabase config unavailable`; Listening รอ `DOMContentLoaded` อยู่แล้วจึงผ่าน.
- แก้เฉพาะ loader กลางให้รอ `DOMContentLoaded` ก่อนอ่าน config/fetch Edge และ bump `game-content-client.js?v=7` ใน Core 5 ทั้งห้าหน้า; ไม่เพิ่ม config fallback, ไม่เปลี่ยน entitlement/quota/audio architecture และไม่แตะ Challenge/Lego/Leaderboard/Resource Hub/nav.
- Verification: network recovery 10/10 (รวมจำลอง boot ก่อน deferred config, missing-config fail-closed/retry และ Listening after-DOM path), S13 protected architecture 41/41 และ `node scripts/check-site.js` ผ่านทั้งหมด 908 project files. Local browser จาก protected Pages artifact ทั้งห้าหน้าไม่เกิด config-unavailable อีกและเรียก protected Edge path; localhost CORS ทำให้ full gameplay เป็น NV จน Production deploy.
- ยังห้ามปิด S13: ต้องให้ Lin commit/push ชุด S13 ผ่าน GitHub Desktop, รอ standard Pages build แล้วรัน manual `Deploy protected Pages artifact`; จากนั้นตรวจ Core 5, public master/manifest 404, signed audio/expiry/missing/fail-closed บน Production.

## 2026-08-14 — P1-F-05/F-07 Consent and Privacy Copy (`LOCAL_DONE / SV_STATIC_PASS`)

- อัปเดต standard banner 88 หน้าให้บอกชัดว่า Clarity ใช้ analytics cookies หลัง consent เท่านั้น และหลัง Reject อาจยังมี limited cookieless tracking/measurement ตาม Consent API V2.
- หน้าอังกฤษ 7/7 ใช้ English banner + `/en/privacy.html`; `en/privacy.html` อัปเดตให้ตรงโครงข้อมูล/บัญชี/เกม/security/third parties/retention/rights/GA4/Clarity ของฉบับจีนและ current system. ฉบับจีนเพิ่ม disclosure เดียวกัน.
- canonical `scripts/apply-cookie-consent.js` sync banner เดิมได้แบบ idempotent; เพิ่ม regression ครอบภาษา, privacy link และ disclosure ทุก analytics page. Vault คง delayed-load gate เฉพาะเดิมเพราะ Reject แล้วไม่โหลด Clarity.
- Verification: consent coverage ผ่าน 88 analytics HTML pages + Vault, Vault 6/6, standard pages 88/88 (อังกฤษ 7/7, จีน 81/81), generator rerun แก้ 0 ไฟล์ และ `node scripts/check-site.js` ผ่าน 907 project files/secret scan 1130.
- ยังรอ Lin ตรวจ exact legal wording, Clarity dashboard cookies-default-off, browser cookies/network/event behavior, deploy/PV. ไม่มี SQL, Supabase, Production, deploy หรือ Git.

## 2026-08-14 — P1-F-05/F-06 All-page Consent V2 (`WAITING_VERIFY / SV_STATIC_PASS`)

- Microsoft Learn ปัจจุบันระบุ Consent API V2 เป็นวิธีแนะนำและ V1 กำลังเลิกใช้; Clarity script โหลดก่อนได้แต่ต้องส่ง default/stored signal และ dashboard ต้อง cookies default off.
- อัปเกรด `scripts/apply-cookie-consent.js`, หน้าเดิม 79 HTML ผ่าน one-time upgrader และ Vault gate เป็น `consentv2`; `ad_Storage=denied`, analytics granted เฉพาะ stored/explicit grant, reject ส่ง V2 denied + erase prior cookies.
- เพิ่ม `scripts/tests-phase1-consent-coverage.js` เข้า central gate. Verification: 88 analytics HTML pages + Vault PASS, Vault 6/6, generator/upgrader syntax, nav 78/78, marketing และ `node scripts/check-site.js` exit 0 (907 project files; secret scan 1130).
- Hard gates: Clarity dashboard setting NV, in-app Browser บล็อก localhost, cookies/network/collect/GA events และ Lin legal/banner copy review ยังรอ; Production ยังไม่ deploy. ไม่มี dashboard/SQL/Supabase/Production/deploy/Git change.

## 2026-08-14 — P1-F-02 API/Edge/save/retry Safety (`PARTIAL / SV_STATIC_PASS`)

- `progress-sync.js?v=4` หยุดทันทีเมื่อ PostgREST read resolve พร้อม error จึงไม่ merge remote ว่างปลอมและ push local ทับ; writes serialize และเก็บ pending retry เมื่อ online โดยไม่ tight-loop.
- Progress pull/push timeout 10 วินาที; `tone-server.js?v=3` จำกัด round-save 12 วินาทีและคืน fail-closed. Edge optimistic SRS และ client score-event dedupe/retry-after-error คงเดิม.
- เพิ่ม `scripts/tests-phase1-save-retry.js` เข้า central gate. Verification: save safety 8/8, SRS 17/17, account 22/22, game behavioral/flow, syntax และ `node scripts/check-site.js` exit 0 (905 project files; secret scan 1128).
- ยัง Partial เพราะ API อื่น, final remote architecture, controlled failure injection/Production PV ยังรอ. ไม่มี SQL, Supabase mutation, deploy, Production change หรือ Git.

## 2026-08-14 — P1-F-04 Audio/loading/auth Error UX (`PARTIAL / SV_STATIC_PASS`)

- `auth-widget.js?v=7` แสดง Guest-safe recovery + Reload เมื่อ auth dependency/session ใช้ไม่ได้; session unknown ไม่ bind owner เป็น null จึงไม่ล้าง account learning cache ผิดเหตุ.
- `protected-word-audio.js?v=2` ใช้ NetworkGuard จำกัด signed-URL request ที่ 10 วินาที; error คืนปุ่มสู่สถานะปกติ ล้าง URL ที่เสีย และบอกให้ตรวจเน็ต/ลองใหม่. Content loading คง Retry/Game Center/LINE recovery.
- เพิ่ม `scripts/tests-phase1-error-ux.js` เข้า central gate และปรับ S13 checker ไม่ผูก cache version. Verification: error UX 7/7, account 22/22, Personal 22/22, game, S13 40/40, nav 78/78, syntax และ `node scripts/check-site.js` exit 0 (904 project files; secret scan 1127).
- ยัง Partial เพราะ controlled browser/audio/auth/real-device/Production tests ยังรอ hard gate. ไม่มี SQL, Supabase mutation, deploy, Production change หรือ Git.

## 2026-08-14 — P1-F-01 Core 5 Network Recovery (`PARTIAL / CORE5_SV_STATIC_PASS`)

- เพิ่ม `js/core/network-guard.js` และโหลดก่อน protected content client ใน Core 5: offline fail fast, request ที่ค้างมี deadline 15 วินาทีแม้ไม่มี `AbortController`; ถ้ามีจะ abort ด้วย.
- `game-content-client.js?v=6` แสดงข้อความ network/timeout ที่เข้าใจง่ายพร้อม Retry/กลับ Game Center และ assign content globals หลัง required-data validation เท่านั้น.
- เพิ่ม `scripts/tests-phase1-network-recovery.js` เข้า central gate. Verification: network 7/7, game behavioral, S13 40/40, nav 78/78, syntax และ `node scripts/check-site.js` exit 0 (903 project files; secret scan 1126).
- สถานะยัง Partial เพราะ account/save/website flows อื่นและ controlled browser/Production tests ยังไม่ครบ. ไม่มี SQL, Supabase mutation, deploy, Production change หรือ Git.

## 2026-08-14 — P1-B-05 Personal Search (`BUILD_DONE / SV_STATIC_PASS / AUTH_BROWSER+PV WAITING`)

- เพิ่ม `js/score/personal-search.js` และ Login-only control ใน `我的內容`; ค้นเฉพาะรายการใน account tab ปัจจุบันจากไทย/จีน/คำอ่าน/Romanization/แหล่งที่มา. Guest ไม่มี Search control.
- รองรับหลายคำ, clear, empty/no-result, 390px stack และ `aria-live`; สร้างข้อความด้วย `textContent`, ไม่เก็บ query/history/analytics และไม่เปลี่ยน quota/delete/provenance/account boundary.
- เพิ่ม `scripts/tests-personal-search-phase1.js` เข้า central gate. Verification: Personal Search 8/8, Personal Content 22/22, account 22/22, Learning 24/24, syntax และ `node scripts/check-site.js` exit 0 (901 project files; secret scan 1124).
- Authenticated browser test ต้องใช้ controlled Login Free account และ localhost ถูก in-app Browser policy บล็อก; Production ยังไม่ deploy. ไม่มี SQL, Supabase mutation, Production change, deploy หรือ Git.

## 2026-08-14 — P1-B-08 Vault Consent Gate (`BUILD_DONE / SV_STATIC_PASS / BROWSER+PV WAITING`)

- แทน eager Clarity loader ใน `vault.html` ด้วย `js/core/clarity-consent-gate.js`: consent unset/denied ไม่สร้าง analytics request; explicit Accept จึงโหลดและโหลดเพียงครั้งเดียว.
- เพิ่ม banner Accept/Reject พร้อม dialog label และ Privacy link; ใช้ state `cookieConsent` เดิมและไม่เพิ่ม analytics history/detail ที่ยังไม่ได้ล็อก.
- เพิ่ม `scripts/tests-vault-consent-phase1.js` เข้า central gate. Verification: consent 6/6, syntax, Challenge 16/16, Resource Search 8/8, nav 78/78 และ `node scripts/check-site.js` exit 0 (secret scan 1122 files).
- In-app Browser บล็อก localhost ตาม URL policy; Production ยังเป็น build เก่า. Consent coverage ทุกหน้า Phase 1 ยังต้องตรวจต่อใน `P1-F-05`. ไม่มี SQL, Supabase mutation, deploy, Production change หรือ Git.

## 2026-08-14 — P1-B-06 Resource Search (`BUILD_DONE / SV_STATIC_PASS / BROWSER+PV WAITING`)

- เพิ่ม minimum usable public Search ที่ `resources.html`: ค้นหมวด Songs/Videos/Playlists และ title ที่ render แล้วจากหน้าเดียวกัน; ไม่เพิ่ม Search analytics/history หรือ Product detail ที่ยัง PARKED.
- รองรับปุ่ม+Enter, query ว่าง, no-result, mobile stack, focus และ `aria-live`; ผลลัพธ์สร้างด้วย DOM + `textContent` ไม่ใช้ query สร้าง HTML.
- เพิ่ม `js/acquisition/resource-search.js` และ `scripts/tests-resource-search-phase1.js` เข้า central gate.
- Verification: Resource Search 8/8, Search 14/14, nav 78/78, `node scripts/check-site.js` exit 0 (secret scan 1120 files). Browser localhost ถูก tool policy บล็อก; Production ยังไม่ deploy. ไม่มี SQL, Supabase mutation, deploy หรือ Git.

## 2026-08-14 — P1-B-01 Mini-Game Challenge Gate (`BUILD_DONE / SV_STATIC_PASS / PV_WAITING`)

- `games-challenge.html` fail-closed เป็น Paid-only: Guest/Login เห็นหน้าแจ้งว่ายังไม่เปิด, legacy UI hidden+inert, ไม่โหลด gameplay/content/auth bundles และไม่ boot เกม.
- `mix-board.html` ไม่โหลด Challenge leaderboard runtime และแสดง recovery ไป Game Center; switcher, local Search index และ Search Edge whitelist ไม่ expose Challenge.
- client score save, `tone-round` และ `game-reward` source ปฏิเสธ Challenge จนกว่า Paid entitlement/runtime จะเปิดจริง; ไม่สร้าง Paid formula/Leaderboard และไม่แตะ Lego.
- เพิ่ม `scripts/tests-phase1-challenge-gate.js` เข้า central gate. ผล: Challenge 16/16, Search 14/14, game behavioral PASS, nav 78/78, `node scripts/check-site.js` exit 0 (secret scan 1118 files).
- In-app Browser ปฏิเสธ localhost ตาม tool URL policy จึงไม่มี browser evidence รอบนี้; Production ยังเป็นไฟล์เก่าและต้องรอ GitHub Desktop/deploy/PV. ไม่มี SQL, Supabase mutation, Production change, deploy หรือ Git.

## 2026-08-14 — P1-A-04 Local Full-Site Baseline (`DONE / SV_PASS`)

- รัน canonical `scripts/generate-nav.js` เพื่อ sync nav block ที่ mismatch เฉพาะ 10 หน้า: Core 5 game/board pages รวม `leaderboard.html` และ `tone-finder.html`; generator ตรวจ 78 หน้าและแก้จริง 10 หน้า.
- ไม่เปลี่ยน `data/nav-template.js`, generator, Product behavior, Challenge, Lego, SQL, Supabase, Production, deploy หรือ Git.
- Verification: `node scripts/check-nav-consistency.js` PASS 78/78; `node scripts/check-site.js` exit 0 และ secret scan 1117 files.

## 2026-08-14 — S13 Production Rollout (`INCOMPLETE / SUPABASE_PASS / PAGES_BLOCKED`)

- Production: private bucket + `storage_path`, protected audio 367 objects, metadata 367/367, `game-content v22` และ `game-audio v1` deploy แล้ว.
- Verification: Guest 50/50/20, Login 100/100/30 available under cap 40, spoofed tier ignored, direct tables 401, signed audio 200/90s/expired 400, missing 404, bucket non-public/no policy และ Core 5 current smoke ไม่มี console error.
- Recursive upload รอบแรกสร้าง wrong prefix 337 objects; rollback เฉพาะ prefix นั้นสำเร็จจนเหลือ 0 แล้ว exact-path upload ผ่าน 367. Edge rollback ไม่ใช้.
- Production Pages ยังเป็น runtime เก่าและ public master/manifest ยัง HTTP 200 เพราะ local protected source/workflow ยังไม่อยู่บน remote `main`; ห้ามถือ S13 Production เสร็จจน Lin ส่ง source ผ่าน GitHub Desktopและรัน protected Pages workflow/E2E.
- เพิ่ม deterministic `--emit-metadata-sql` ให้ migration helperเพื่อ deploy metadata โดยไม่เปิดเผย service-role key.
- ไม่แตะ Challenge, Lego, Leaderboard/Score Security, Resource Hub/nav หรือ Website อื่น. หลักฐาน: `/Users/taihualin/Documents/Claude/Projects/_AI_SYSTEM/STATUS/2026-08-14_2140_S13_PRODUCTION_ROLLOUT_PARTIAL.md`.

## 2026-08-14 — S13 Protected Content / Audio (`PASS_LOCAL / PRODUCTION_CHANGE_REQUIRED`)

- `game-content` เป็น authoritative entitlement gate และส่งเฉพาะ entitled words/sentences/audio availability; tier/quota เดิมคงอยู่และ rate-limit/config/required data fail-closed.
- Core 5 ใช้ `protected-word-audio.js`, ไม่โหลด public master datasets/audio manifest/legacy static audio paths; `game-audio` ตรวจ auth+tier+content ก่อนออก single-object signed URL อายุ 90 วินาที.
- เพิ่ม private Storage SQL source, dry-run-first audio migration helper และ manual protected Pages artifact/workflow ที่ตัด master/manifests/audio ออกจาก public deploy artifact.
- Verification: S13 architecture 40 checks, protected artifact, game behavioral และ Listening 21 checks ผ่าน. Full site fail เฉพาะ Resource Hub nav mismatch 10 ไฟล์ที่มี active unrelated ownershipและไม่ถูกแตะ.
- Challenge, Lego S19–S22, leaderboards/board pages และ Website/Resource Hub implementation ไม่ถูกแก้. ไม่มี SQL, upload, Supabase mutation, deploy, Production test หรือ Git.
- หลักฐานกลาง: `/Users/taihualin/Documents/Claude/Projects/_AI_SYSTEM/STATUS/2026-08-14_2100_S13_PROTECTED_CONTENT_AUDIO_LOCAL_CLOSEOUT.md`.

## 2026-08-14 — GAMES Phase 3 Core 5 (`PASS_LOCAL / PRODUCTION_VERIFY_NEEDED`)

- S13: `game-content` rate-limit error fail-closed, reject required empty data ทั้ง Edge/client และ audio playback failure มี user-facing toast.
- S28: Listening อ่าน `tone_srs_state game='listening'`, แยก Due/Mastered และใช้ Free allocator 20%/Review1; `tone-round` fail-closed ก่อนเขียน SRS/ดาว.
- S29: เพิ่ม `listening-board.html`, auth/board client route, Core5 cross-links และ SQL source contract สำหรับ per-game weekly/all-time + Monday Asia/Taipei + admin exclusion.
- Regression: Listening 21 checks, game behavioral, Phase1 SRS/Learning/account-boundary และ `node scripts/check-site.js` ผ่าน.
- ไม่แก้ Lego S19–S22 หรือ Challenge; ไม่รัน SQL, Supabase mutation, deploy, Production test หรือ Git. Production verify และ score-forgery/replay architecture ยังเหลือ.
- หลักฐานกลาง: `/Users/taihualin/Documents/Claude/Projects/_AI_SYSTEM/STATUS/2026-08-14_2028_GAMES_PHASE3_CORE5_LOCAL_CLOSEOUT.md`.

**Inherited: 2026-08-14 19:43 Asia/Bangkok** — WEBSITE category verification partial snapshot; current WEBSITE closeout authority is 20:06 PASS_PRODUCTION

## 2026-08-14 — WEBSITE Category Verification (`INCOMPLETE`)

- Reused current evidence for S01/S05 without re-reading or repeating verification: both remain `PASS_PRODUCTION`.
- S04 controlled production test submitted once with clearly fake test email; browser reached the subscription-success/download page and console warning/error log was empty. Supabase remained at Sign in in the controlled Browser, so current grants/RLS and the downstream test record are still `NV`; S04 is not closed.
- S02 root cause: `sitemap.xml` retained manual historical `lastmod` values while WEBSITE pages had changed on 2026-08-14; the checker validated only format/future dates and therefore did not flag stale values.
- Updated `lastmod` to `2026-08-14` for 13 in-scope WEBSITE pages only: home, pricing, FAQ, content/resources, services, community, trial/new-student, vocab cheatsheet, SNS, Terms and Privacy. `blog.html` and every Article/文章 entry were intentionally untouched.
- Local verification: SEO/sitemap 66/66, 0 errors, 0 warnings; `node scripts/check-site.js` PASS 881 files; 404 recovery copy/links preserved.
- No deploy, Git, SQL, Supabase mutation by Codex, or production sitemap change. S02 remains `PASS_LOCAL / PRODUCTION NV`; WEBSITE Category Closeout remains incomplete.

**Inherited: 2026-08-14 15:13 Asia/Bangkok** — Game Result / Resume / Gamification / SRS local implementation + verification; no deploy/production/Git/SQL

## 2026-08-14 — Game Result / Resume / Gamification / SRS (`PASS_LOCAL / PRODUCTION NV`)

- เพิ่ม shared result `答對 X / N`, SRS reassurance, exact feedback 4 สถานะโดยไม่แสดง numeric comparison, 7-second replay countdown และ cancel เมื่อกด result action ใด ๆ.
- Resume 5 เกมมี Continue / restart same / new round, แสดง game+position และกู้ round log ที่มี; same-device รองรับ guest/login โดยไม่อ้าง cross-device.
- Round Detail แสดง full real round log; current Print/Save-as-PDF ใช้ data source เดียวกันและเพิ่ม available question/user/correct/status โดยไม่ redesign.
- Guest ไม่เขียน persistent streak; result แสดง Streak/Badge ไม่เกิน 2 highlight. XP ไม่ทำเพราะสูตรยังไม่มี.
- SRS allocator: Free 20%/Review1, Paid architecture 30%/max4, fractional carry, Due carry-over, dedupe และ distributed placement; Paid runtime ไม่เปิด.
- rebuild `shared.min.js`, Reading, Typing, Word Order และ Tone minified; bump cache เฉพาะ 5 หน้า; Listening ใช้ source app ตรงและ bump version.
- `check-site.js` ผ่าน 881 files และ targeted Game Flow/Shared/SRS/Reading/Listening/Typing/Word Order/Tone/behavioral ผ่าน. Local browser โหลด assets/actions ได้ แต่ full gameplay NV เพราะ external game-content fetch unavailable.
- Cross-device resume, XP formula, Listening independent Due source, Paid runtime, Final Gameplay/Responsive/Edge/PDF redesign/Master Spec และ production ยัง BLOCKED/NV. ไม่ใช้ Git/deploy/SQL/Supabase/production.

**Inherited: 2026-08-14 14:33 Asia/Bangkok** — Website Contact / Social Entry Points implementation + verification + central closeout; preserves Footer 14:28; no deploy/production/Git

## 2026-08-14 — Website Contact / Social Entry Points (`PASS_LOCAL / PRODUCTION NV`)

- คง `sns.html` เป็น intentionally standalone โดยไม่มี Navigation entry ใหม่; Contact modal เป็น primary Contact/Social entry point และ single clear owner.
- ลบ duplicate/dead `modal-sns` กับ `modal-social`; เติม `rel="noopener"` ให้ external `_blank` ใน scope โดยไม่เปลี่ยน URL, CTA หรือ layout.
- rebuild `shared.min.js`, bump cache เป็น `v30` ครบ generated pages 77 หน้า และเพิ่ม behavioral regression สำหรับ URLs, modal ownership, nav exclusion และ noopener.
- Browser desktop/mobile ผ่าน Contact, `免費試聽`, Cal.com, hamburger/bottom-nav, direct `sns.html` และ no horizontal overflow; nav 77/77 และ full-site ผ่าน 881 ไฟล์.
- Footer คง intentionally ไม่มี Contact/Social; ไม่แตะ Meta/Threads credential, OAuth, provider config, production, deploy, SQL, Supabase หรือ Git.

**Inherited: 2026-08-14 14:28 Asia/Bangkok** — Website Footer / External Links standardization + central closeout; preserves Favicon 14:25; no deploy/production/Git

## 2026-08-14 — Website Footer / External Links (`PASS_LOCAL / PRODUCTION NV`)

- ล็อก Footer Final Standard: `使用條款與著作權聲明`, `隱私權政策`, `© 2026 mrtaihualin.com`; Contact/Social ไม่อยู่ใน Footer โดยตั้งใจ.
- ทำมาตรฐานครบ Public Shell 78/78 หน้า รวม `vault.html` และ `vocab-cheatsheet.html`; Terms/Privacy ใช้ current-item แบบไม่ลิงก์กลับตัวเองโดยไม่ redesign.
- เพิ่ม `scripts/tests-footer-standard.js` และผูกกับ `scripts/check-site.js`; Footer 78/78, nav 77, desktop/mobile, horizontal overflow และ mobile bottom-nav clearance ผ่าน; full-site ผ่าน 881 ไฟล์.
- เพิ่ม CSS เท่าที่จำเป็นและแก้ overflow เดิมของตาราง cheatsheet บนมือถือ; ไม่แตะ 404 exception, instructional Textbook/Classroom footers, Contact/Social systems, future English pages หรือ `_dev`.
- Shared Footer generator/component บันทึกเป็น Future Work; ไม่มี deploy, production mutation, SQL, Supabase หรือ Git.

## 2026-08-14 — Favicon / Browser Identity (`PASS_LOCAL / PRODUCTION NV`)

- ใช้ browser identity มาตรฐานเดียวกัน: `/favicon.ico`, `/assets/favicon-32.png`, `/assets/apple-touch-icon.png`.
- เติมชุดมาตรฐานให้ `vocab-cheatsheet.html`, Terms, Privacy, English 7 หน้า, Textbook 11 หน้า และ Classroom 7 หน้า; แก้ Vault ให้ใช้ root-absolute icon trio.
- แก้แบรนด์อังกฤษ `Taihua` → `Tai Hua` เฉพาะ English preview โดยรักษา SEO strategy, metadata, `noindex`, navigation และพฤติกรรมเดิม.
- Verification: scope exact coverage ผ่าน, sitemap 66/66, icon files เปิดได้ HTTP 200, desktop/default + mobile 390×844 + subpage ต่อ section ผ่านและไม่ล้น; `node scripts/check-site.js` ผ่าน 881 ไฟล์.
- `PWA_NOT_REQUIRED_NOW`; `PWA_FUTURE_WORK=AFTER_PAID_LAUNCH`. ไม่สร้าง manifest/service worker/install/offline/push และไม่ deploy/production/SQL/Supabase/Git.

**Updated: 2026-08-14 14:13 Asia/Bangkok** — Website SEO Basics / Metadata local remediation + central closeout; no deploy/production/Git

## 2026-08-14 — Website SEO Basics / Metadata (`PASS_LOCAL_WITH_EXTERNAL_NV`)

- แก้ malformed `og:image`/Twitter tag structure ใน `content.html`, `new-student.html`, `sns.html`, `thank-you.html`, `vocab-thank-you.html`; เติม Twitter metadata ให้ `blog.html` และ `og:url` ให้ `new-student.html`/`trial.html` โดยไม่เปลี่ยน SEO copy.
- ตาม Lin Decision เพิ่ม `noindex,nofollow` ให้ `classroom/liff-open.html`, `classroom/line-link.html` และหน้า `上課用` 3 หน้า.
- ปรับ `scripts/check-seo-sitemap.js` ให้ enumerate HTML จาก filesystem โดยไม่เรียก Git และเพิ่ม checks สำหรับ malformed metadata, OG/Twitter และ internal/admin `noindex`.
- Verification: checker ผ่าน public/sitemap `66/66`, 0 error/0 warning; negative fixtures จับ malformed/noindex/Twitter regressions ครบ; `node scripts/check-site.js` ผ่าน 881 ไฟล์.
- `DEFER_TO_FAVICON_SYSTEM`; `SITEMAP_LASTMOD_VERIFICATION=PENDING`; production/Search Console/crawler ยัง NV; `PENDING ARTICLE PRODUCT DECISION`; S02 คง `not-verified`. ไม่แก้ sitemap/robots/favicons/404/Footer/Contact/Social layout และไม่ deploy/SQL/Supabase/Git.

## 2026-08-14 — Textbook Temporary Code Gate + Student Portal Future Direction

## 2026-08-14 — Textbook Temporary Code Gate (`PASS_LOCAL / PRODUCTION NV`)

- เพิ่ม client-side code gate ชั่วคราวให้ `textbook/index.html` และบทเรียนทั้ง 10 บท; direct URL ทุกบทถูก gate ก่อนผ่านรหัส และสถานะที่ผ่านแล้วใช้ร่วมกันผ่าน `localStorage` ใน browser เดียวกัน.
- รองรับ wrong code = blocked, correct code = access, refresh = จำสถานะ และ reset ผ่าน `?reset-textbook-access=1` หรือ `window.TextbookAccessGate.clear()`; gate นี้ตั้งใจเป็น access deterrent ที่ bypass ได้ ไม่ใช่ security/authentication จริง.
- Teaching Pages ใน `classroom/*上課用.html` ไม่ถูก gate และไม่มีการแก้ Teaching Pages หรือระบบสมุดโน้ตเดิม.
- เพิ่ม `scripts/tests-textbook-access-gate.js` และผูกเข้า `scripts/check-site.js`; ตรวจ coverage 11/11, direct chapter 10/10, Teaching Pages ungated 3/3, notes/controls/navigation/PDF UI, desktop/mobile และ console error = 0 ผ่าน.
- `node scripts/check-site.js` ผ่านทั้งหมด 880 files. ไม่มี deploy, SQL, Supabase, Git หรือ production mutation; production จึงยัง `NV`.
- Future Direction ที่ Lin ล็อกไว้: Student Portal ใช้ Google Login และรวมข้อมูลนักเรียนที่เกี่ยวข้องไว้ในระบบเดียว โดยยังไม่ออกแบบรายละเอียดและไม่ implement รอบนี้.

## 2026-08-14 — Locked Game Flow Delta (`PASS_WITH_EXPLICIT_NV`)

- เพิ่ม `js/games/game-flow.js` เป็น flow กลางของ Tone/Reading/Listening/Typing/Word Order: feedback สั้น, countdown `3→2→1`, auto-next, ปุ่ม `下一題` และ `暫停`.
- ใช้ Result semantic marker กลางบนโครง `gsh-end-*` เดิมโดยไม่ redesign Final Result; ปรับ feedback เป็นแนวให้กำลังใจด้วย provisional Chinese copy.
- Resume เหลือ action เดียว `繼續上次練習`; เก็บ same-device safe point ตาม architecture เดิม และเพิ่ม selector เลือก latest successfully saved state แบบไม่ merge. ไม่ลบ Progress/SRS/Mastered และไม่เปลี่ยนสูตรคะแนน.
- Rebuild minified runtime ที่เกี่ยวข้องและ bump asset version ของเกมทั้ง 5; เพิ่ม `scripts/tests-game-flow-delta.js` เข้า full-site gate.
- หลักฐาน: delta test, game behavior, Reading, Typing, Word Order, Listening และ SRS ผ่าน; `node scripts/check-site.js` ผ่าน 877 files. Browser 1280×720/390×844 ทั้ง 5 หน้าไม่ล้น; isolated flow ผ่าน pause/immediate next/auto-next และไม่มี console error จาก flow ใหม่.
- `NV`: local browser โหลด external Game Content API ไม่ได้ จึงยังไม่ยืนยัน full gameplay E2E. `BLOCKED`: remote cross-device resume สำหรับ Login Free ต้องรอ authorization ของ persistence architecture/schema/production. ไม่มี deploy, SQL, schema, production mutation หรือ Git.

## 2026-08-14 — Locked Phase 1 `學習中心 / 我的內容`

- เปลี่ยน navigation เป็น `學習` และหน้าปลายทางเป็น `學習中心`; แยก Account/Profile และทำ Guest Login-introduction ตาม copy/CTA ที่ Lin ล็อกไว้.
- รวม Progress + SRS/Review ใน `學習進度`, แสดง 5 skills พร้อมลิงก์ฝึกตรง; ตัด `下一步`, separate main `複習`, readiness 0–100 และ overall formula.
- สร้าง `我的內容` หน้าเดียว 2 tabs, limit 20 words / 10 sentences, near/full gate, no Search/Filter, optional item details, per-item practice/save provenance และ Delete เฉพาะ saved relation.
- เพิ่ม account-backed Sentence Vault โดย reuse `learning_saved_items`; Word Order Save เก็บ sentence และรองรับ direct `?sentence=` practice. Duplicate Save จากพื้นผิวใหม่เพิ่ม provenance โดยไม่สร้างรายการซ้ำ.
- เพิ่ม `sentence_vault_v1` ใน account boundary/sync/export path และเพิ่ม regression tests สำหรับ learning center/personal content/provenance.
- แก้ regression ที่ browser พบจริง: shared runtime สร้าง `#bottom-nav` ก่อน parser เจอ static nav ทำให้มือถือมี 2 ชุด; เปลี่ยน fallback ให้ตรวจหลัง DOMContentLoaded, rebuild `shared.min.js`, bump cache v28 ครบ 77 หน้า และยืนยัน runtime count = 1.
- Rebuild minified runtime เฉพาะ shared, Word Order และ Tone. ไม่แตะ Reading/Typing เพราะมีงานภายนอกแก้ source ชุดเดียวกันอยู่; สองคู่นี้ยัง source ใหม่กว่า min และต้องทำรอบแยกหลัง collision จบ.
- หลักฐาน: account boundary 22/22, learning center 24/24, personal content 21/21, SRS 17/17, word vault 59/59, account export 7/7, nav consistency 77 หน้า; local browser Guest/Login/mobile/direct tabs ผ่านและ console error = 0; `node scripts/check-site.js` ผ่านทั้งหมด 875 files.
- ไม่มี deploy, production SQL/RLS/schema, manual/intentional Supabase mutation, Paid pricing/quota/Challenge/formula, Git, commit หรือ push. เปิด authenticated local surface แบบอ่านอย่างเดียวและไม่กด Save/Delete; cross-device sentence behavior ยัง `NV` ต่อ production.

**Updated: 2026-08-13 22:06 Asia/Bangkok** — Central Routing Cleanup เอกสาร/authority เท่านั้น; ไม่แก้ code/runtime, ไม่ deploy, ไม่รัน SQL และไม่ใช้ Git

## 2026-08-13 — Central Routing Cleanup

- เชื่อม startup path เป็น `repo → Projects/00_START_HERE → Website Command Center → authority ตามประเภทงาน` ให้ Claude/Codex ใช้สายเดียวกัน
- กำหนด BrandKey, GPT Product Current, Main Implementation Plan, Product Pending/Verify, active operational plan และ future backlog ให้มี authority คนละหน้าที่
- แยก `PRODUCT NEXT` ออกจาก `AUTHORIZED IMPLEMENTATION NEXT`; Product NEXT ไม่อนุมัติให้ implement
- แก้ GPT Current/Verify pointer ให้ชี้ current และ exact Archive/Handoff path; ติดป้ายชุดวันที่ 12 ส.ค. และ Pending รุ่นเก่าเป็น `SUPERSEDED / HISTORY` โดยไม่ลบหรือย้ายไฟล์
- `node scripts/check-site.js` ผ่านทั้งหมด: secret scan 1,109 ไฟล์, JavaScript 105, HTML 110, CSS 6 และสรุป 874 ไฟล์โปรเจกต์ที่มีอยู่ในเครื่อง

**Updated: 2026-08-13 21:45 Asia/Bangkok** — Phase 1 Guest Free + Login Free: ทำและตรวจในเครื่องเท่านั้น (ไม่ deploy, ไม่รัน SQL, ไม่ใช้ Git)

## 2026-08-13 — Phase 1 Guest Free + Login Free (local only)

**ขอบเขตและความปลอดภัย:** แก้เฉพาะโค้ดในเครื่องตาม Phase 1 ที่อนุมัติแล้ว ไม่แตะ production, migration/RLS,
secret, deploy หรือ Git และไม่แก้เอกสารศูนย์บัญชาการ/แผนกลาง เพราะมีงาน audit ของอีกแชทกำลังดูไฟล์ชุดนั้น

### สิ่งที่ทำ

- แยกข้อมูล Guest/บัญชีให้ชัด: เปลี่ยนบัญชีหรือออกจากระบบแล้วล้าง cache ส่วนตัว, ป้องกันการ replay ผล Guest
  เข้าบัญชี, ผูก progress/SRS/vault กับเจ้าของบัญชีที่ยืนยันแล้ว และกัน event ซ้ำใน session
- ปรับ `我的學習`: Guest เห็นหน้าชวนเข้าสู่ระบบโดยไม่แสดง dashboard ศูนย์ปลอม; ผู้ล็อกอินเห็น 5 ทักษะ,
  SRS แบบอ่านอย่างเดียว, `我的單字` และสถานะโหลด/ข้อมูลบางส่วนล้มเหลวโดยไม่ปนบัญชี
- ล็อก SRS Phase 1 ที่ `[1, 7]` วัน และกำหนดว่าคะแนนใหม่ต่ำกว่า 10 ยังไม่สร้าง SRS; รองรับหลักฐาน `listening`
- ปรับ 5 เกม: Listening ใช้สูตรคะแนน/จำนวนครั้งฟังที่ล็อกแล้ว, Typing คะแนน 0 ต้องแก้จนถูก,
  Reading ล็อกคะแนนครั้งตรวจแรก, Word Order เข้า SRS เฉพาะรอบฐาน 10 ที่ไม่ผิด/ไม่ใช้ hint,
  Tone ป้องกันผล Guest ไหลเข้าบัญชี
- ทำ Word Vault และ Lego Vault เป็นข้อมูลส่วนตัวของบัญชีและ sync ข้ามอุปกรณ์ผ่าน `learning_saved_items`;
  Guest ไม่เห็น/เพิ่ม/ลบข้อมูลส่วนตัว
- ตรวจ account export ว่ารวม session, SRS และ vault ทุกชนิดแบบผูกเจ้าของจาก JWT และ fail closed
- เพิ่ม `玩法` ของ Listening, ปรับ responsive/ข้อความกู้คืน และตรวจทั้ง 5 เกมที่ desktop, tablet,
  mobile portrait/landscape: มี auth slot เดียว, ไม่มีแนวนอนล้น, ย้อนกลับ/ไปข้างหน้า/refresh ยังถูกต้อง
- อนุญาต publishable key เฉพาะไฟล์ staging ที่ระบุชื่อเต็มใน secret scanner; ไม่อนุญาต wildcard และยังจับ
  service-role/secret key ตามเดิม

### หลักฐานตรวจ

- เพิ่ม automated regression tests สำหรับ account boundary, 我的學習, SRS, Listening, Typing, Reading,
  Word Order, account export และ shared game shell รวมกับชุด Word Vault เป็น 166 assertions
- สร้างไฟล์ minified ใหม่ด้วย `bash scripts/build-minjs.sh`; syntax ผ่านทุกไฟล์
- `node scripts/check-site.js` ผ่านทั้งหมด: secret scan 1,108 ไฟล์, JS 105, HTML 110, CSS 6 และ
  สรุป 873 ไฟล์โปรเจกต์ที่มีอยู่ในเครื่อง

### สิ่งที่ยังไม่ล็อก/ยังไม่ทำ

- ต้องให้ Lin ตัดสินใจ: schema/ความหมายของ `practice_events` และ `learning_memory`, `我的句子`, สูตรแปลง
  component error เป็นคะแนน Reading, ลำดับ `下一步`, overall %, gamification และรูปแบบ tutorial animation ของ Listening
- การแก้ Edge Function (`tone-round`) ต้อง deploy จึงจะมีผลจริง; งานนี้ยังไม่ deploy
- การทดสอบ gameplay/login/sync ข้ามอุปกรณ์กับข้อมูลจริงยังทำไม่ได้ใน local browser เพราะ Game Content API
  ภายนอกตอบ `Failed to fetch`; UI แสดงทางกู้คืนถูกต้องแล้ว แต่ยังต้องทดสอบ production/manual E2E
- พบ pointer ในเอกสารกลางชี้ package เก่าใน Downloads ที่ไม่มีแล้ว; ใช้ source-of-truth ล่าสุดแบบ read-only และยังไม่แก้
  pointer เพราะมีอีกแชท audit เอกสารกลางอยู่

**Updated: 2026-08-12 15:39 Asia/Bangkok** — Status Parity note: Lego Weekly Challenge scheduling mechanics flagged as under active Lin review, not Locked (see note inline below)
**Updated: 2026-08-12 14:54 Asia/Bangkok**

## 2026-08-12 — Security patch + Learning label fix + Lego Weekly Challenge rebuild (Lin อนุมัติทีละจุดก่อนแก้)

**ขอบเขต:** 3 งานที่ Lin อนุมัติเป็นลายลักษณ์อักษรทีละจุด (SQL/plan เตรียมไว้ก่อน แล้ว Lin สั่ง "ทำเลย" ทีหลัง) —
ปิดช่องโหว่ 3 database view, แก้ label สถานะความจำ, สร้าง Lego Weekly Challenge ใหม่ทั้งระบบ

**ตรวจก่อนเริ่ม:** `git status` สะอาด · ไม่มี worktree/agent อื่นชนงาน 3 ไฟล์นี้

### 1. ปิดช่องโหว่ 3 SECURITY DEFINER view — เจอจาก Supabase security advisors ไม่เคยมีในเอกสารไหนมาก่อน

`approved_testimonials` (view สาธารณะที่ `pricing.html` ใช้อ่านรีวิวลูกค้าจริง อ่านจาก `classroom_feedback`
ที่ RLS ล็อกไว้ให้ครูอ่านได้คนเดียว) เป็น **auto-updatable view** และมี grant เขียน (`INSERT`/`UPDATE`/`DELETE`/
`TRUNCATE`) ตกค้างให้ `anon`/`authenticated` มาตั้งแต่สร้าง view — เพราะ owner เป็น `postgres` ที่
`rolbypassrls=true` การเขียนผ่าน view นี้จึง**บายพาส RLS ของ `classroom_feedback` ทั้งหมด**: ใครก็ตามที่ไม่ล็อกอิน
สามารถ **แก้ไข/ลบรีวิวลูกค้าที่อนุมัติแล้วได้ทุกอัน** ทั้งที่ `classroom_feedback` ไม่มีนโยบาย DELETE เลยแม้แต่ข้อเดียว
(ตั้งใจ) และ UPDATE ปกติจำกัดครูคนเดียว — ยืนยันด้วยการยิง PATCH/DELETE จริงก่อนแก้ ได้ 200/สำเร็จ

`v_unexplained_stars` (เครื่องมือตรวจทุจริตดาวภายใน เทียบ `game_accounts` กับ backup snapshot หา `user_id`
ที่มีดาวเกินจริง) กับ `v_stars_overview` (สถิติรวม) มี SELECT grant ให้ `anon`/`authenticated` ทั้งที่ grep ทั้ง repo
ไม่พบว่ามีหน้าเว็บไหนเรียกใช้เลย — internal-only tool ที่หลุดสู่สาธารณะโดยไม่ตั้งใจ

**แก้ด้วย REVOKE ล้วน ไม่แตะ view definition** (ต้องคง bypass RLS ไว้สำหรับ SELECT ของ `approved_testimonials`
เพราะเป็นทางเดียวที่คนไม่ล็อกอินอ่านรีวิวได้): `revoke insert, update, delete, truncate on approved_testimonials
from anon, authenticated` + `revoke select on v_unexplained_stars, v_stars_overview from anon, authenticated`

**ยืนยันหลังแก้ด้วยการยิง HTTP จริงด้วย anon key สาธารณะ (ไม่ใช่แค่ query grants):** SELECT `approved_testimonials`
= 200 เหมือนเดิม (pricing.html ไม่พัง) · PATCH/DELETE `approved_testimonials` = 401 (ปิดช่องโหว่แล้ว) ·
SELECT `v_unexplained_stars`/`v_stars_overview` = 401 ทั้งคู่ · ตรวจซ้ำอีกครั้งวันเดียวกันหลัง commit ยืนยันไม่มี drift

**ไฟล์:** 🆕 `supabase/sql/2026-08-12_revoke_view_write_bypass.sql` (มีบล็อก `[A]`ตรวจก่อน/`[B][C]`แก้/`[D]`ตรวจหลัง/
`[Z]`rollback ครบตามกฎ) · อัปเดตสารบัญ `supabase/sql/00_ฟังก์ชันไหนอยู่ไฟล์ไหน.md`

### 2. แก้ label สถานะความจำ `未練習` → `未開始`

Decision ล่าสุด (Lin ยืนยัน 2026-08-12) ล็อกว่า initial mastery label มาตรฐานคือ `未開始` แต่
`learning_memory_states.code='not_started'` ที่ seed มาจาก `2026-08-11_learning_foundation.sql` ยังเป็น `未練習`
**Safety-gate บังคับก่อนแก้เสมอ:** `select count(*) from learning_memory` ต้องได้ 0 ก่อนไปต่อ (ยืนยันได้ 0 จริง —
ไม่มีข้อมูลผู้เรียนผูกกับ label นี้เลย จึงปลอดภัย 100%) → รัน `update ... set label_zh='未開始' where code='not_started'
and label_zh='未練習'` → ตรวจหลังแก้: เหลือแค่แถวนี้เปลี่ยน อีก 4 แถว (`learning`/`needs_work`/`stable`/`mastered`)
ไม่กระทบเลย

**ไฟล์:** 🆕 `supabase/sql/2026-08-12_fix_learning_memory_state_label.sql` (มี safety-gate `[A]` + rollback `[Z]`
ในตัว) · อัปเดตสารบัญ

### 3. Lego Weekly Challenge — เขียนใหม่ทั้งระบบให้ตรง Decision

**ของเดิม (ก่อน 2026-08-12):** `js/games/lego-game-app.js:684-741` — `legoWeekIndex()` คำนวณจาก `Date.now()` ล้วน
(epoch week, **global** ไม่ personalize), เก็บ progress ใน `localStorage` (`LEGO_CH_KEY='lego_challenge_v1'`) ไม่ผูก
บัญชี ไม่ sync ข้ามเครื่อง ไม่มีให้เลือกวัน ไม่มีกฎ 14 วันเลยแม้แต่จุดเดียว (ยืนยันจาก grep ทั้งไฟล์ก่อนแก้) — **ไม่ตรง
Decision** (ผู้เรียนเลือก weekday เอง · 1 ครั้ง/สัปดาห์ · เปลี่ยนวันรอ 14 วัน)

**Guest decision (Lin อนุมัติ 2026-08-12):** เล่น Lego ปกติได้เต็มที่ แต่ Weekly Challenge ต้อง login เท่านั้น —
**ห้ามมีระบบ localStorage คู่ขนานสำหรับ guest** Free Login และ Paid ใช้ระบบเดียวกัน

**ของใหม่:** ย้าย state ทั้งหมดไปฝั่งเซิร์ฟเวอร์ — ตาราง `lego_challenge_state` (1 แถว/user, RLS `select own`
เท่านั้น ไม่มี insert/update/delete policy ให้ client เลย) + `lego_challenge_defs` (mirror ของ `LEGO_CHALLENGES`
เดิม 5 ชนิด ใช้ตรวจสอบฝั่งเซิร์ฟเวอร์กันโกง) + ฟังก์ชัน SQL แบบ `SECURITY DEFINER` 3 ตัวที่ client เรียกผ่าน `.rpc()`
ตรงๆ (ก็อป pattern เดียวกับ `submit_class_request`/`respond_to_offer_as_student` ที่มีอยู่แล้วในระบบเรียน แทนที่จะ
สร้าง Edge Function ใหม่ที่ต้อง deploy แยก — deploy ผ่านการรัน SQL ที่ Lin อนุมัติได้ทันที ไม่ต้องรอ
`supabase functions deploy`):
- `lego_challenge_get_state()` — อ่านสถานะปัจจุบัน
- `lego_challenge_set_weekday(smallint)` — เลือกครั้งแรก (ใช้ทันที) / ขอเปลี่ยน (เข้าคิว 14 วัน enforce
  ฝั่งเซิร์ฟเวอร์ล้วน — เขียนทับ pending เดิมถ้ามี = รีเซ็ตนับใหม่)
- `lego_challenge_record_progress(int,int,int)` — บันทึกความคืบหน้าหลังทดสอบผ่าน 1 รอบ (mirror ตรรกะ
  `legoChallengeBump` เดิมเป๊ะ: correct/sets/perfect/combo) — no-op ถ้า `done=true` แล้ว (เล่นซ้ำ cycle เดิมไม่ได้)

Timezone ใช้ `Asia/Taipei` ให้ตรงกับ `lego-daily-limit/index.ts` (`todayTaipei()`) ที่มีอยู่แล้วในระบบเลโก้เดียวกัน
— ไม่ใช่ Bangkok

**ตรวจสูตรคำนวณ cycle_start ก่อนเชื่อว่าใช้ได้จริง:** รันสูตรจริงกับวันตัวอย่าง (2026-08-12=พุธ) ครบทั้ง 7 กรณี
weekday 0-6 ได้วันที่ย้อนกลับถูกต้องทุกกรณี (ตรวจด้วยชื่อวันจริงเทียบกัน)

**Live evidence:** มีบัญชีทดสอบจริง 1 บัญชีเลือก weekday แล้วขอเปลี่ยนวัน → ระบบเข้าคิว `pending` ถูกต้อง (กฎ 14 วัน
ทำงานจริง ไม่ถูกข้าม) 🔴 **แต่เส้นทาง "เล่นจบรอบ→progress ขึ้น→เห็นข้อความ complete" ยังไม่ถูกทดสอบจบ**
(`progress=0` อยู่บนแถวทดสอบนั้น) — **สถานะ `IMPLEMENTED / E2E PARTIAL` ห้ามเขียนว่า VERIFIED COMPLETE**

**5 implementation-detail choices ที่ยังไม่ได้รับการยืนยันจาก Lin (`NEED LIN REVIEW` ไม่ใช่ Decision):**
first-choice-is-immediate (ครั้งแรกใช้ทันทีไม่ต้องรอ 14 วัน — ตีความเอาจากคำว่า "เปลี่ยน" ว่าใช้เฉพาะการเปลี่ยน)
· pending-request-overwrites-and-resets-timer (ขอเปลี่ยนซ้ำระหว่างรอ = รีเซ็ตนับ 14 วันใหม่)
· progress-resets-when-cycle-boundary-shifts · challenge-type-rotation คำนวณจาก `cycle_start` ของแต่ละคนแยกกัน
(คนละคนอาจเห็นชนิดชาเลนจ์ต่างกันในช่วงเวลาเหลื่อมกัน) · timezone Asia/Taipei (ก็อปจากของเดิม ไม่ใช่ตัดสินใหม่)

🔴 **[UPDATE 2026-08-12 15:39 Asia/Bangkok]** Lin กำลังทบทวนกติกาเปลี่ยนวันทั้งชุดใหม่ (ไม่ใช่แค่ 5 รายการย่อยข้างบน) —
รวมถึงตัวเลข 7 วัน/สัปดาห์ และ 14 วันรอเปลี่ยนวันเอง **ห้ามถือว่ากติกาที่ implement ไปแล้วเป็น Locked Decision สุดท้าย**
จนกว่า Lin จะยืนยันอีกครั้ง — Feature ยังคง `IMPLEMENTED` ปกติ, Guest ต้อง login ถึงเล่น Weekly Challenge ได้ (Lego ปกติ
เล่นได้เสมอ) ไม่ถูกกระทบเพราะเป็นกฎคนละเรื่อง

**ไฟล์ที่แก้:** `js/games/lego-game-app.js` (ลบ `legoWeekIndex`/`legoActiveChallenge`/`LEGO_CH_KEY`/
`legoLoadChallenge`/`legoChallengeState()`เดิม/`legoSaveChallenge`/`legoChallengeBump` ทั้งหมด — grep ยืนยันไม่มี
จุดไหนอ้างชื่อเก่าเหล่านี้เหลือ นอกจากในคอมเมนต์อธิบายประวัติ · เพิ่ม `legoChallengeRefresh`/
`legoChallengeChooseWeekday`/`legoChallengeRecordProgress`/`legoRenderChallengeBanner`/`legoWeekdayPickerHtml` ·
`legoRenderGameBar()` เหลือแค่ streak/freeze rendering + เรียก `legoChallengeRefresh()` ต่อท้าย ผูกกับ hook เดิมที่
`reading-auth.js` เรียกอยู่แล้วทุกครั้งที่ auth state เปลี่ยน ไม่ต้องแก้ `reading-auth.js` เลย) · `lego.html`
(CSS ใหม่ 6 คลาสใช้ theme เดิม + cache bump `lego-game-app.js?v=1→2`) · 🆕
`supabase/sql/2026-08-12_lego_weekly_challenge_schema.sql` · อัปเดตสารบัญ

**Mini-Game Challenge (`games-challenge.html`) ไม่ถูกแตะเลยแม้แต่บรรทัดเดียว** — grep ยืนยันไม่มีไฟล์ของงานนี้ทับซ้อน
กับไฟล์ระบบนั้น

### สรุปรวม 3 งาน

**Tests:** `node --check js/games/lego-game-app.js` ผ่าน · `node scripts/check-site.js` ผ่านครบทุกหัวข้อ ✓ —
63 รายการที่ไม่ผ่านทั้งหมดเป็นของเดิมไม่เกี่ยวกับงานนี้ (`_staging-build/`+`supabase-config.staging.js` ที่ยืนยันแล้ว
ว่าไม่ใช่บั๊กมาก่อนหน้านี้ + โฟลเดอร์ `finance/` ที่ไม่ใช่ของแชทนี้) — **ไม่มีไฟล์ที่แก้ในรอบนี้ปรากฏในรายการไม่ผ่านเลย**

**Production change ที่รันจริงแล้ว (ไม่ใช่แค่เตรียมไฟล์):** 3 SQL migration รันครบทุกบรรทัดบน production
(`qzkxlhpcputsvbqmtqfi`) — REVOKE 5 คำสั่ง, UPDATE label 1 แถว, CREATE TABLE×2 + FUNCTION×4 ของ Lego Weekly
Challenge — ตรวจยืนยันซ้ำอีกครั้งวันเดียวกันหลัง commit ไม่มี drift

**git:** commit `ead14cb` "เพิ่ม Lego Weekly Challenge แบบผูกบัญชี (เลือกวัน+รอ14วัน) + ปิดช่องโหว่ 3 SECURITY
DEFINER view + แก้ label 未練習→未開始" — push แล้วผ่าน GitHub Desktop ยืนยัน `git status`=clean ตรงกับ `origin/main`

**ค้างรอ Lin:** (1) ทดสอบ E2E เส้นทาง progress-recording ของ Lego Weekly Challenge ให้จบ (2) ยืนยัน 5
implementation-detail choices ด้านบน (3) เติม wording guest-clause เข้า Decision Master doc อย่างเป็นทางการ (Lin
พูดชัดแล้วในแชท แต่ยังไม่เขียนลง Decision text ของ `CURRENT_SOURCE_OF_TRUTH`/`DECISION_MASTER_RECOVERED`)

**รายละเอียดเต็ม + evidence ทุกจุด (รวมช่องโหว่ security ที่ไม่ควร public):**
`FOR_GPT_CLAUDE_RESULT_2026-08-12.md` — ไม่ได้เก็บใน repo นี้ อยู่ที่
`/Users/taihualin/Downloads/CLAUDE_HANDOFF_PACKAGE_2026-08-12/`

---

## 2026-08-11 (รอบ 4) — รอบดูแล/ความปลอดภัย/คุณภาพเว็บ (ไม่แตะ Product Decision)

**ขอบเขต:** เก็บงานส่วนที่ทำต่อได้โดยไม่ต้องรอสถาปัตยกรรม Product ที่ Lin กำลังออกแบบ
**ไม่ deploy · ไม่รัน SQL production · ไม่แตะ Product Decision · ไม่แตะงาน worktree อื่น**

ตรวจก่อนเริ่ม: `git status` สะอาด · worktree `ce0f` และ `e742` (Codex) **ไม่มีไฟล์ค้างแก้เลยทั้งคู่**
และอยู่ที่คอมมิตเก่ากว่า `main` → ไม่มีความเสี่ยงชนงาน

### 1. ปุ่มฝั่งนักเรียนใน LINE เลิก "ตายสนิท" (ระบบ 改期/取消)

เจอ **4 จุด** ใน `line-webhook` ที่ `continue` เงียบสนิท ไม่ตอบอะไรเลย — เป็นบั๊กชนิดเดียวกับที่
ไล่อุดฝั่งครูครบไปแล้วเมื่อ 2026-07-31 / 2026-08-02 แต่ **ฝั่งนักเรียนตกหล่นมาตลอด**
(`accept_offer` / `decline_offer` / `ack_teacher_cancel` — ทั้งกรณี "หาคำขอไม่เจอ" และ "คนกดไม่ใช่เจ้าของ")

🔑 **จุดที่ต้องคิดให้ครบ:** เจตนาเดิมที่ให้เงียบนั้นถูกครึ่งเดียว — กันไม่ให้คนอื่นรู้ว่า "คำขอเลขนี้มีจริงไหม"
แต่ผลข้างเคียงคือ **เจ้าของตัวจริง** ที่กดปุ่มเก่าในประวัติแชทก็ไม่ได้รับอะไรเลยเหมือนกัน
→ แก้โดยให้ทั้ง 2 กรณีตอบ **ข้อความกลางตัวเดียวกันเป๊ะ** (`STUDENT_BUTTON_UNAVAILABLE_MSG`)
ได้ทั้ง 2 อย่างพร้อมกัน: ผู้ใช้จริงได้ feedback · คนนอกยังแยกไม่ออกว่าคำขอมีจริงไหม (รั่วเท่าเดิม = ศูนย์)
**ไม่แตะสิทธิ์/ด่าน/business rule ใดๆ เลย** — คนที่ไม่ใช่เจ้าของยังทำอะไรไม่ได้เหมือนเดิมทุกประการ

### 2. 🛑 STOP — "หาคาบด้วยชื่อ + วัน" ทำไม่ได้ (มี collision จริง)

ตรวจจากโค้ดจริงแล้ว **ไม่ทำ** และรายงานแทน เพราะ:
- ระบบ**มีเส้นทางชื่อ+วันอยู่แล้ว** (`findClassEventForRequest`) ใช้เป็น *ทางสำรอง* ตอนไม่มี `calendar_event_id`
  และมันคืน event **ทุกตัว**ที่ชื่อตรงในวันนั้น → เจอมากกว่า 1 = ปฏิเสธไม่ทำอะไร (ปลอดภัยดีอยู่แล้ว)
- **ชื่อ+วัน ไม่ unique จริง**: ตั้งแต่ `2026-07-26_recurring_days_multi_slot.sql` นักเรียน 1 คน
  มีคาบวันเดียวกันหลายรอบได้ (เช่น พุธ 10:00 + พุธ 19:00) · CLAUDE.md 2026-08-01 ข้อ 10 ก็บันทึกเคส
  "นักเรียนมี 2 คาบในวันเดียว" ไว้แล้ว
- การเก็บ `calendar_event_id` คือ **การแก้บั๊ก "ลบผิดคาบ" ที่ตั้งใจทำเมื่อ 2026-07-16** — ย้อนกลับไปใช้
  ชื่อ+วันเป็นตัวหลัก = เอาบั๊กเดิมกลับมา
- ผู้ใช้ **ไม่เคยต้องพิมพ์/เห็นเลขคาบอยู่แล้ว** — ระบบเก็บให้เองตอนนักเรียนเลือกคาบจากรายการ
  (เลขคาบโผล่เฉพาะใน `console.warn` ของนักพัฒนา ไม่ใช่ข้อความที่ผู้ใช้เห็น)

### 3. ตรวจความปลอดภัย cron ตามจริง (truth audit)

| Function | ด่านในโค้ด | สรุป |
|---|---|---|
| `calendar-schedule-sync-cron` | ✅ มี `x-cron-secret` fail-closed | 🟢 **SAFE — ยืนยันจาก production จริงแล้ว** (ดูกล่องด้านล่าง) |
| `welcome-retry-cron` | ✅ มี `x-cron-secret` fail-closed | 🟢 **SAFE — ยืนยันจาก production จริงแล้ว** |
| `class-reminder-cron` · `request-sla-cron` · `low-quota-cron` | ❌ ไม่มีด่านของตัวเอง | 🟡 **PARTIAL** — พึ่ง Verify JWT + service_role อย่างเดียว (ชั้นเดียว) |

🔑 **ผลสำคัญ: รายงานเก่าที่ว่า 2 ตัวแรก "ไม่มีการป้องกัน" — ไม่จริงแล้ว** โค้ดมีด่านครบตั้งแต่ 2026-08-07
(`supabase/sql/2026-08-07_cron_shared_secret.sql`) · **ไม่ได้เขียนระบบซ้ำ ไม่แตะโค้ด 5 ตัวนี้เลย**

> ### ✅ ปิดเคส cron 2 ตัวแล้ว — ยืนยันจาก production ของจริง (ตรวจเพิ่ม 2026-08-11 รอบปิดงาน)
>
> รอบก่อนสรุปได้แค่ PARTIAL เพราะดูจาก repo อย่างเดียว · รอบนี้ตรวจจาก production ตรงๆ ด้วย
> **Supabase CLI (อ่านอย่างเดียว ไม่ deploy ไม่รัน SQL ไม่ยิง URL ทดสอบ)** ได้หลักฐาน 3 ชั้น:
>
> 1. `supabase functions list --project-ref qzkxlhpcputsvbqmtqfi` →
>    ทั้ง 2 ตัว **`verify_jwt: true`** แล้ว (ขั้นตอนที่ 3 ของไฟล์ SQL ทำครบแล้ว)
>    `calendar-schedule-sync-cron` v34 · `welcome-retry-cron` v29 · **deploy ทั้งคู่ 2026-08-07 11:35–11:36**
>    (= วันเดียวกับที่เพิ่มด่านในโค้ด → ตรงกัน)
> 2. `supabase functions download <slug> --project-ref qzkxlhpcputsvbqmtqfi` → เปิดโค้ด **ที่รันอยู่จริงบน production**
>    เจอด่านครบทั้ง 2 ตัว: `const cronSecret = Deno.env.get('CRON_INTERNAL_SECRET');`
>    `if (!cronSecret || req.headers.get('x-cron-secret') !== cronSecret) → 403`
>    (`calendar-schedule-sync-cron` บรรทัด 103–104 · `welcome-retry-cron` บรรทัด 53–54)
> 3. เป็นด่านแบบ **fail-closed** → ต่อให้ `CRON_INTERNAL_SECRET` หาย ก็ปฏิเสธทุกคำขอ ไม่ใช่ปล่อยผ่าน
>    ⇒ **ไม่มีทางที่คนนอกยิง URL เปล่าๆ แล้วสั่งงานได้อีกแล้ว** ไม่ว่าค่า secret จะตั้งไว้หรือไม่
>
> 🔴 **ตั้งใจไม่ทดสอบด้วยการยิง URL จริง** — ถ้าบังเอิญด่านไม่ทำงาน คำขอนั้นจะ**ทำงานจริง**
> (ซิงก์ปฏิทินทับตารางเรียน / ส่ง LINE หานักเรียนจริง) การอ่านโค้ดที่ deploy อยู่ให้หลักฐานที่แน่นกว่าและไม่มีผลข้างเคียง
>
> ⚠️ **ยังเหลืออย่างเดียว (ไม่ใช่เรื่องความปลอดภัย แต่เป็นเรื่อง "cron ยังทำงานอยู่ไหม"):**
> ยังไม่ได้ดูว่า cron รันรอบล่าสุดได้ **200** จริงไหม — ถ้า `cron_shared_secret` ใน Vault กับ
> `CRON_INTERNAL_SECRET` ใน Edge Function **ไม่ตรงกัน** ระบบจะปลอดภัยดี แต่ **cron จะตายเงียบ (403 ทุกรอบ)**
> ตรวจได้ 2 ทาง: Dashboard → Edge Functions → แท็บ **Invocations** (ไม่ใช่แท็บ Logs)
> หรือ `select * from private.cron_http_log order by id desc limit 20;`

### 4. account-export เทียบ Learning Foundation 23 ตาราง — ✅ ถูกต้องอยู่แล้ว ไม่ต้องแก้

จำแนกครบ 23 ตาราง: มีแค่ **5 ตารางที่ผูกกับผู้ใช้** (`learning_saved_items` · `practice_events` ·
`learning_memory` · `user_plan_grants` · `learning_items` แบบ personal) ที่เหลือ 18 เป็นเนื้อหากลาง/ระบบ
→ ตัวเดียวที่**มีข้อมูลจริงตอนนี้**คือ `learning_saved_items` และ **อยู่ใน export แล้ว** (คีย์ `word_vault`)
อีก 4 ตัวยังว่างและยังไม่ต่อ UI → ใส่ตอนนี้ = export คีย์ว่างเปล่าโดยไม่มีประโยชน์
**เขียนกฎกันลืมไว้ใน CLAUDE.md แล้ว** ว่าวันไหนเริ่มเขียนข้อมูลจริงต้องกลับมาเพิ่มใน export รอบเดียวกัน

### 5. SEO / sitemap — เจอหน้าใหม่ตกหล่นจริง 2 หน้า

🆕 `scripts/check-seo-sitemap.js` (ผูกเข้า `check-site.js` แล้ว) แยกหน้าเป็น 5 กลุ่มก่อนตรวจ
**ตรวจ SEO เฉพาะหน้าสาธารณะที่ให้ Google เก็บ 66 หน้า** (ไม่เอา noindex 32 · auth 1 · admin 9 · dev 2 มาปนตัวเลข)

| | ก่อน | หลัง |
|---|---|---|
| ERROR | 0 | 0 |
| WARNING | 6 | **0** |

แก้จริง 4 อย่าง: `games-practice.html` (หน้าใหม่จาก Navigation IA 2026-08-10) และ `listening-game.html`
**ไม่เคยอยู่ใน sitemap เลย** → Google อาจไม่เคยเห็น · `privacy.html`/`terms.html` ขาด OG/Twitter → เติมให้ครบ
🔑 `lastmod` ใช้**วันคอมมิตจริงจาก git** ไม่ได้ปั๊มเป็น "วันนี้" ทุกหน้า

### 6. เกม — ตรวจแล้วเจอของค้าง 1 จุด (ที่เหลือ REPORT ONLY)

`tone-finder.html` โหลด `posts-data.js` + `lessons-data.js` (~18KB · **สคริปต์บล็อกการวาดหน้า 2 ก้อน**)
ทั้งที่หน้านี้ไม่มีอะไรใช้เลย — พิสูจน์ 4 ทางก่อนเอาออก (ไม่มีการอ้างชื่อตัวแปร · ไม่มีฟังก์ชันหน้าต่างเนื้อหา
17 ตัวถูกเรียก · ไม่มีกล่องหน้าต่างในหน้า · **เกมอีก 4 หน้าโหลด `shared.min.js` เหมือนกันแต่ไม่เคยโหลด 2 ไฟล์นี้
และใช้งานได้ปกติมาตลอด**) → เป็นของค้างจากตอนอัปโหลดชุดแรก (git `6a10c58`)

| tone-finder.html | ก่อน | หลัง |
|---|---|---|
| คำขอไฟล์ (script) | 22 | **20** |
| ไฟล์ที่ต้องโหลดจริง | +18.1 KB | **−18.1 KB** |

⚠️ **ยังไม่ได้เปิดเบราว์เซอร์จริงยืนยัน** (ส่วนขยาย Chrome ไม่ได้เชื่อมต่อในรอบนี้) — หลักฐานเป็นแบบอ่านโค้ด 4 ทาง
**ของที่เหลือไม่แตะ (REPORT ONLY)** เพราะเปลี่ยนพฤติกรรม/ต้องเลือกสถาปัตยกรรม: ใส่ `defer` ให้สคริปต์
ที่บล็อกการวาดหน้าอีก ~10 ก้อน · แยกก้อน `tone-finder-game.js` (330KB) · `shared.js` (200KB)
ของที่ **ทำไปแล้วในรอบก่อนๆ ไม่ต้องทำซ้ำ**: ก้อนเกมโหลดแบบ async ผ่าน `GameContentLoader.boot()` อยู่แล้ว ·
`supabase-fetch-cache.js` กันยิง Supabase ซ้ำอยู่แล้ว · ไม่มีสคริปต์ซ้ำซ้อนในหน้าเดียวสักหน้า

### ทดสอบ
- 🆕 `scripts/tests-classroom-behavioral.js` เพิ่มหัวข้อ **I)** (2 ข้อ) — **ทดสอบย้อนกลับ 2 แบบยืนยันจับของพังได้จริง**
  (ทำให้จุดหนึ่งกลับไปเงียบ → จับได้ · แยกข้อความ 2 กรณีออกจากกัน → จับได้)
- 🆕 `scripts/check-seo-sitemap.js` — **ทดสอบย้อนกลับ 3 แบบ** (หน้า admin หลุดเข้า sitemap · URL ชี้ไฟล์ที่ไม่มี ·
  lastmod เป็นวันในอนาคต) จับได้ครบทั้ง 3
- `node scripts/check-site.js` → ผ่าน **17 หัวข้อ** (เดิม 16 + seo/sitemap) · ไม่ผ่าน **44 รายการเดิม**
  ใน `_staging-build/` (baseline เดิมที่ยืนยันแล้วว่าไม่ใช่บั๊ก เพราะอยู่ใน `.gitignore`) **ไม่มีรายการใหม่**
- `node --check` ผ่านทั้ง `line-webhook/index.ts` (คัดลอกเป็น `.mjs` ตามบทเรียน 2026-08-11)

### 🔴 MANUAL ACTION สำหรับ Lin — งานรอบถัดไป (Lin สั่งปิดรอบนี้ไว้ก่อน 2026-08-11)

**1. deploy `line-webhook` → ยังไม่ทำ (Lin สั่งเลื่อน)** — สถานะ: 🟡 **CODE READY · PROD PENDING**

ตรวจความพร้อมครบแล้ว เหลือแค่กดจริง:
- โค้ดอยู่ใน `main` แล้ว (คอมมิต `3d39391`) · `tests-classroom-behavioral.js` ผ่าน · `node --check` ผ่าน
- production ตอนนี้เป็น **v64 · deploy ล่าสุด 2026-08-02** · `verify_jwt: false` (ถูกต้องแล้ว ห้ามเปลี่ยน)
- ✅ **โหลดโค้ดที่ deploy อยู่จริงมาเทียบกับ repo แล้ว — ต่างกันแค่การแก้รอบนี้เท่านั้น**
  (เพิ่มค่าคงที่ + 4 จุดที่ตอบข้อความ · ลบ `continue` เงียบ 2 บรรทัด) **ไม่มีของค้างอื่นติดไปด้วย** → deploy ได้สะอาด

🔴 **กับดักที่เพิ่งเจอ 2026-08-11 — ต้องใส่ `--project-ref` ด้วย:**
เครื่องนี้ `supabase link` ผูกไว้กับ **STAGING** (`xufxvwcelbovzsxywawg`) ไม่ใช่ production
→ **คำสั่งที่ไม่ใส่ `--project-ref` จะไปลง staging เงียบๆ** แล้วเข้าใจผิดว่า deploy production แล้ว
(staging ไม่ได้ต่อกับ LINE OA จริง = กดปุ่มทดสอบก็ไม่มีอะไรเกิดขึ้น)

```
supabase functions deploy line-webhook --no-verify-jwt --project-ref qzkxlhpcputsvbqmtqfi
```
⚠️ `--no-verify-jwt` ห้ามลืมเด็ดขาด (LINE ยิงมาโดยไม่มี token — ลืม = ปุ่มตายทั้งระบบ)

**ทดสอบหลัง deploy:** ให้นักเรียน (หรือบัญชีทดสอบ) เลื่อนแชทขึ้นไปกดปุ่มเก่าที่คำขอถูกเคลียร์ไปแล้ว
→ ต้องได้ข้อความ「ℹ️ 這顆按鈕已經無法使用了。」· ตรวจ **Invocations** ต้องเป็น 200 · ต้องไม่ตอบซ้ำ 2 ข้อความ

**2. cron 2 ตัว → ✅ ปิดเคสแล้ว ไม่ต้องทำอะไร** (ดูกล่องหลักฐานในหัวข้อ 3 ด้านบน)
เหลือแค่ถ้าอยากสบายใจว่า cron ยัง**ทำงาน**อยู่ (คนละเรื่องกับความปลอดภัย):
`select * from private.cron_http_log order by id desc limit 20;` หรือดูแท็บ **Invocations**

**3. cron อีก 3 ตัว (`class-reminder` / `request-sla` / `low-quota`) — ยังคง 🟡 PARTIAL รอ Lin ตัดสิน**
ทั้ง 3 ตัว `verify_jwt: true` (ยืนยันจาก production แล้ว) และ cron ส่ง **service_role** เป็น Bearer
→ **ไม่ใช่ช่องโหว่ที่คนนอกเข้าถึงได้** (ต้องมี service_role ก่อน ซึ่งถ้าหลุด = พังทั้งระบบอยู่แล้ว ไม่ใช่แค่ cron นี้)
เป็นแค่ "ป้องกันชั้นเดียว" ไม่เท่า 2 ตัวแรกที่มี 2 ชั้น
🔴 **ยังไม่แก้ให้ เพราะต้องทำ 4 อย่างพร้อมกัน** (แก้โค้ด 3 ไฟล์ + แก้ 3 ฟังก์ชัน `private.call_*` ให้ส่ง header +
ตั้ง secret + deploy) **ทำครึ่งเดียว = cron ตายเงียบ 403 → นักเรียนไม่ได้รับข้อความเตือนก่อนเรียน**
ถ้า Lin สั่งทำ ให้เปิดรอบใหม่แล้วทำครบทีเดียว

**ไฟล์ที่แก้:** `supabase/functions/line-webhook/index.ts` · `scripts/tests-classroom-behavioral.js` ·
🆕`scripts/check-seo-sitemap.js` · `scripts/check-site.js` · `sitemap.xml` · `privacy.html` · `terms.html` ·
`tone-finder.html` · `README.md` (ตารางอธิบายตัวตรวจ) · `CLAUDE.md` (หัวข้อใหม่ 🧱 Learning Foundation) ·
`_แผนงาน/ทำต่อในอนาคต.md` (แก้สถานะ cron ที่ล้าสมัย) · `MAINTENANCE.md`

**สถานะ commit (ตรวจตอนจบงาน):**
- ✅ 2 ไฟล์แรก (`line-webhook/index.ts` + `tests-classroom-behavioral.js`) **Lin commit + push ไปแล้ว**
  ระหว่างที่งานรอบนี้ยังทำอยู่ — อยู่ในคอมมิต `3d39391` (รวมกับรายงาน Product Architecture ของอีกแชท)
  ⚠️ **แต่ยังไม่ได้ deploy** → ปุ่มฝั่งนักเรียนบน LINE ยังเงียบอยู่จนกว่าจะ deploy (ดู MANUAL ACTION ข้อ 1)
- ⏳ ที่เหลือยังไม่ได้ commit — รอ Lin กดเองผ่าน GitHub Desktop
- 📌 `CLAUDE.md` และ `_แผนงาน/` อยู่ใน `.gitignore` (เอกสารในเครื่อง ไม่ขึ้น GitHub) จึงไม่โผล่ใน git status
- 📖 อ่านคู่กับรายงานของอีกแชทที่เข้ามาระหว่างทาง: `/Users/taihualin/Documents/Claude/Projects/_AI_SYSTEM/AUDIT_VERIFY/website/2026-08-11_PRODUCT_ARCHITECTURE_READINESS_AUDIT.md`
  (ตรวจแล้วไม่ขัดกับงานรอบนี้ · รายการ SAFE NOW S1–S9 ในนั้นเป็นงาน Product คนละก้อน รอบนี้ไม่แตะเลย)

---

### 🔚 รอบปิดงาน (2026-08-11 ช่วงท้าย) — ตรวจยืนยันอย่างเดียว ไม่แก้ source สักไฟล์

Lin สั่งปิดรอบก่อน deploy · รอบนี้จึง **ไม่ deploy · ไม่รัน SQL · ไม่ยิง URL ทดสอบ · ไม่แก้โค้ดเว็บเลย**
ใช้ Supabase CLI แบบ **อ่านอย่างเดียว** (`functions list` / `functions download`) เพื่อเก็บหลักฐาน production

**สรุปสถานะที่ปิดได้จริงรอบนี้**

| เรื่อง | สถานะ | หลักฐาน |
|---|---|---|
| `calendar-schedule-sync-cron` | 🟢 **SAFE — VERIFIED** | โค้ดที่ deploy อยู่จริงมีด่าน fail-closed (บรรทัด 103–104) · `verify_jwt: true` |
| `welcome-retry-cron` | 🟢 **SAFE — VERIFIED** | โค้ดที่ deploy อยู่จริงมีด่าน fail-closed (บรรทัด 53–54) · `verify_jwt: true` |
| cron อีก 3 ตัว | 🟡 **PARTIAL** (ไม่ใช่ช่องโหว่ที่คนนอกเข้าถึงได้) | `verify_jwt: true` ทั้ง 3 · cron ส่ง service_role |
| `line-webhook` | 🟡 **CODE READY · PROD PENDING** | production ยังเป็น v64 (2026-08-02) · diff กับ repo = เฉพาะการแก้รอบนี้ |
| ชื่อ+วัน หาคาบ | ✅ **CLOSED — DO NOT CHANGE** | นักเรียน 1 คนมีหลายคาบในวันเดียวได้ (multi-slot) |
| account-export vs 23 ตาราง | ✅ **AUDITED — NO ISSUE** | บันทึกไว้แล้วใน `CLAUDE.md` หัวข้อ 🧱 Learning Foundation |
| tone-finder ลด 18KB | 🟡 **ยังไม่ VERIFIED ด้วยเบราว์เซอร์** | ส่วนขยาย Chrome ไม่ได้เชื่อมต่อทั้ง 2 รอบ · หลักฐานยังเป็นการอ่านโค้ด 4 ทาง + `check-site.js` ผ่าน |

🔴 **ค้างไปรอบหน้า:** (1) deploy `line-webhook` (ดู MANUAL ACTION ข้อ 1 — **อย่าลืม `--project-ref`**)
(2) เปิดเบราว์เซอร์จริงทดสอบ `tone-finder.html` ทั้ง desktop และมือถือ 375–390px
(3) ตัดสินใจเรื่อง cron 3 ตัว

⚠️ **ตอนปิดรอบเจอว่ามีอีกแชททำงานคู่ขนานอยู่** (ไฟล์ค้างแก้ที่ **ไม่ใช่ของรอบนี้**):
`/Users/taihualin/Documents/Claude/Projects/_AI_SYSTEM/AUDIT_VERIFY/website/2026-08-11_PRODUCT_ARCHITECTURE_READINESS_AUDIT.md` · `supabase/sql/00_ฟังก์ชันไหนอยู่ไฟล์ไหน.md` ·
🆕`supabase/sql/2026-08-11_practice_surface_vault_aliases.sql` — **ไม่แตะเลยตามกฎ**

---

## 2026-08-11 (รอบ 3) — ลบคำแล้วตามไปทุกเครื่องจริง (deletion tombstone) + คลังคำเข้าไฟล์ export

**ขอบเขต:** 2 เรื่องที่ Lin สั่ง · ไม่แตะ Lego/เกมฟัง/เพดาน 30/詞類/情境/Skill/Mastery/ราคา/Search/Challenge

### 1. ลบคำที่เครื่อง A → หายจากเครื่อง B ด้วย

**ปัญหาเดิม:** เครื่อง B แยกไม่ออกว่าคำที่ไม่เจอบนเซิร์ฟเวอร์ "ถูกเจ้าของลบ" หรือ "อ่านมาไม่ครบ" → ต้องเลือกทางปลอดภัยคือเก็บไว้ = คำที่ลบแล้วไม่หายจากเครื่องอื่น

**วิธีแก้ที่เลือก:** soft delete / ตราการลบ ในตารางเดิม — เพิ่มคอลัมน์ `learning_saved_items.deleted_at` **ไม่สร้างตารางใหม่ ไม่แตะ RLS**
🔑 หลักที่ได้: **"ไม่มีแถวบนเซิร์ฟเวอร์" ห้ามแปลว่า "ถูกลบ" อีกต่อไป** — ลบในเครื่องได้ต่อเมื่อเห็นตราชัดเจน
→ แยก 4 สถานการณ์ได้เองโดยไม่ต้องเดา: เจ้าของลบจริง (มีตรา) · ยังไม่มีข้อมูล (ไม่มีแถว) · อ่านมาไม่ครบ (แถวหายบางส่วน) · เน็ตหลุด (select error → ไม่แตะอะไรเลย)

**กฎการรวมกลายเป็น 6 กรณี** (อยู่ในหัวไฟล์ `js/games/word-vault.js`) · จุดที่คิดเผื่อไว้:
- ผู้ใช้เซฟคำเดิมใหม่ที่อีกเครื่องหลังมีตราอยู่แล้ว → **ของใหม่ชนะตราเก่า** (ล้างตราให้) ไม่งั้นผู้ใช้จะงงว่าเซฟไม่ติด
- กดลบซ้ำ/retry → upsert คีย์เดิม ไม่เกิดแถวซ้ำ
- ปั๊มตราส่งแค่ 4 ช่อง → คำแปล/ป้ายกำกับเดิมบนเซิร์ฟเวอร์ไม่ถูกล้าง (ทดสอบแล้ว)
- 🔴 **โค้ดฝั่งเว็บถูก push ก่อน Lin รัน SQL บน production ได้** → ทั้ง `word-vault.js` และ `account-export` **ถอยไปทำงานแบบเดิมเองอัตโนมัติ** ถ้ายังไม่มีคอลัมน์ (ไม่พัง ไม่เงียบ — เขียน console.warn) ถ้าไม่เผื่อไว้ sync/export จะพังทั้งระบบช่วงรอยต่อ

### 2. คลังคำเข้าไฟล์ดาวน์โหลดข้อมูลของนักเรียน

`account-export` เพิ่มคีย์ใหม่ระดับบนสุด `word_vault` = `{ active, deleted, deletion_tracking_supported }` · เพิ่ม `summary.total_saved_words` + `capped.word_vault`
**คีย์เดิมไม่แก้สักตัว** → ไฟล์ export รูปแบบเก่าไม่พัง · ใช้ `userClient` (RLS กรอง `auth.uid()=user_id` ที่ตัวฐานข้อมูล) ไม่พึ่ง service_role
คำที่ลบแล้วแยกไว้กอง `deleted` ต่างหาก — ยังอยู่ในระบบจริงจึงต้องบอกเจ้าตัว แต่ไม่ปนกองหลักเพราะจะเข้าใจผิดว่ายังอยู่ในคลัง

### 3. (งานคู่ขนานจากอีกแชท รวมอยู่ commit เดียวกัน) แปล error ภาษาอังกฤษดิบ + อุดจุด UPDATE ไม่เช็กแถวฝั่งครู ในระบบเลื่อนคาบ (改期)

ขอบเขต: อุดจุดเสี่ยงที่ตกหล่นจากรายการเดิม 4 จุด (3 จุดถูกอุดไปแล้วในรอบก่อนหน้า เหลือจุดนี้จุดเดียวที่มี 3 ที่ต้องแก้จริง) — ไม่แตะ logic การล็อก/ด่านเวลา/การย้าย Calendar เลย

1. `js/classroom/student-requests.js` — `studentWithdrawOwnRescheduleRequest` (กดถอนคำขอ) และ `respondToOfferAsStudent` (กดตอบรับ/ปฏิเสธเวลาที่ครูเสนอ) เดิมโชว์ error อังกฤษดิบตรงๆ เวลาโดนด่าน rate limit หรือกดตอนครูจับล็อกอยู่ → ครอบด้วย `friendlyRequestError()` แล้ว (จุดที่ 2 มีเงื่อนไขพิเศษ `res.data !== true` ต้องคงข้อความเดิม เพราะด่านในฐานข้อมูลปฏิเสธเงียบๆ ไม่มี error ให้แปล)
2. `js/classroom/teacher-request-admin.js` — `revertCalendarBackupInner` (ปุ่ม ↩️ 復原) เดิม UPDATE เลขคาบใหม่ลงคำขอเดิมโดยไม่เช็กว่าแก้ได้กี่แถว ถ้าโดน RLS บล็อกจะเงียบสนิท (0 แถว ไม่มี error) → เพิ่ม `.select()` + เช็กจำนวนแถว ไม่ครบ = เขียน `console.warn` (ไม่กระทบการกู้คืนคาบเอง ซึ่งสำเร็จไปก่อนขั้นนี้แล้ว)

ดูรายละเอียดเต็ม + โค้ด diff ที่ `CLAUDE.md` หัวข้อ "🔄 ระบบขอเลื่อนคาบ (改期)"

### ทดสอบ
- `scripts/tests-word-vault-sync.js` **32 → 56 ข้อ** (เพิ่มลบข้ามเครื่อง/อ่านมาไม่ครบ/ลบซ้ำ/sync ซ้ำ/เซฟใหม่หลังมีตรา/ฐานข้อมูลยังไม่ได้รัน SQL)
- `supabase/tests/2026-08-11_word_vault_sync_TEST.sql` **8 → 14 ข้อ** — รันบน staging ผ่าน 14/14
- **ทดสอบย้อนกลับ 3 แบบ ยืนยันจับของพังได้จริง:** ไม่สนใจตรา → จับได้ · "ไม่มีบนเซิร์ฟเวอร์ = ลบ" → จับได้ · ลบแถวทิ้งแทนปั๊มตรา → จับได้
- 🔧 เจอระหว่างทาง: เทสเดิม **crash เป็น TypeError** แทนที่จะรายงานว่าข้อไหนไม่ผ่าน (indexing ไม่ป้องกัน) → เพิ่ม `firstRow()` แก้ทั้งไฟล์
- 🔧 เจอระหว่างทาง: `node --experimental-strip-types --check` **ไม่ตรวจ .ts จริง** (ใส่ syntax error ยังผ่าน) → เปลี่ยนไปคัดลอกเป็น `.mjs` แล้ว `node --check` (พิสูจน์ด้วย negative test ว่าจับได้จริง)
- `node scripts/check-site.js` ผ่าน 16 หัวข้อ · ไม่ผ่าน 44 รายการเดิมใน `_staging-build/` ไม่มีรายการใหม่

### ขึ้น production ครบแล้ว (Lin ทำเองผ่านเบราว์เซอร์ 2026-08-11)
1. ✅ รัน `2026-08-11_word_vault_deletion_sync.sql` บน production — ผ่าน `[M]` 3/3
2. ✅ รันตัวทดสอบบน production — ผ่าน 14/14
3. ✅ deploy `account-export` + smoke test ด้วย token ผู้ใช้จริง — 200 · มี `word_vault.active/deleted` · `deletion_tracking_supported=true` · key เดิมไม่หาย

### 🆕 เก็บงานท้าย: preview ก่อนลบบัญชีบอกเรื่องคลังคำแล้ว
เพิ่ม `'learning_saved_items'` เข้า `CASCADE_TABLES` ใน `supabase/functions/account-delete/index.ts`
**ไม่เปลี่ยน behavior การลบจริงเลย** — พิสูจน์แล้ว 3 ชั้น: (ก) `CASCADE_TABLES` ถูกใช้ที่เดียวคือ loop นับเลขในเส้นทาง `preview` (บรรทัด 88 นิยาม · 255 ใช้) (ข) ตัวนับคือ `countRows()` = `select count head:true` **อ่านอย่างเดียว ไม่มี delete** (ค) ตัวลบจริงคือ `account-delete-cron/index.ts` ซึ่ง **ไม่มี `CASCADE_TABLES` เลย** (ใช้ `HARD_DELETE_TABLES`/`ANONYMIZE_TABLES` ของตัวเอง + พึ่ง FK cascade)
ข้อมูลคลังคำถูกลบถูกต้องอยู่แล้วมาตลอดผ่าน FK `on delete cascade` — ที่เพิ่มคือ **ตัวเลขที่โชว์ก่อนกดยืนยัน** ให้ตรงกับของจริง
✅ deploy แล้ว 2026-08-11 (ผ่าน Supabase Dashboard) + smoke test ด้วย token ผู้ใช้จริง (fresh JWT) — `preview` คืน `will_cascade_delete.learning_saved_items` ตัวเลขถูกต้อง ตัวนับอื่นไม่เปลี่ยน `can_delete:true`

### ✅ ปิดงานแล้ว 2026-08-11 — Lin ทดสอบ 2 เครื่องจริงผ่านทั้ง sync และ delete
เจอปัญหาระหว่างทาง: "เพิ่มข้ามเครื่องได้ แต่ลบไม่ข้าม" — สาเหตุคือโค้ด tombstone ใน `word-vault.js` ยัง **ไม่ได้ push** (ค้างใน git เท่านั้น) เว็บจริงยังรันโค้ดเก่า พอ push แล้ว retest ผ่านครบทั้ง 2 อย่าง

**ไฟล์ที่แก้:** `js/games/word-vault.js` · `supabase/functions/account-export/index.ts` · `supabase/functions/account-delete/index.ts` (เพิ่ม `learning_saved_items` เข้า `CASCADE_TABLES`) · 🆕`supabase/sql/2026-08-11_word_vault_deletion_sync.sql` · `supabase/tests/2026-08-11_word_vault_sync_TEST.sql` · `scripts/tests-word-vault-sync.js` · 7 หน้า HTML (cache-buster v=2→3) · `supabase/sql/00_ฟังก์ชันไหนอยู่ไฟล์ไหน.md` · `MAINTENANCE.md` · `js/classroom/student-requests.js` · `js/classroom/teacher-request-admin.js` (2 ไฟล์หลังเป็นงานคู่ขนานคนละแชท ดูหัวข้อ 3 ด้านบน) · `CLAUDE.md`

---

## 2026-08-11 (รอบ 2) — คลังคำ sync ข้ามเครื่อง + รัน Learning Foundation ขึ้น staging และ production จริง

**ขอบเขต:** 2 เรื่องที่ Lin สั่งเท่านั้น · ไม่แตะ 詞類/情境/Skill/Mastery/compatibility/ราคา/เกมฟัง/Lego

### 1. คลังคำ (單字庫) sync ข้ามเครื่องได้จริงแล้ว

กติกาที่ Lin กำหนด (ทำตามครบทุกข้อ): รวมคำจากทุกเครื่องได้แม้เกินเพดาน 30 · ห้ามลบคำอัตโนมัติ · ห้ามข้อมูลเดิมหาย · เกินเพดาน = บล็อกการเพิ่มใหม่ชั่วคราว · ใช้ระบบเดิม ห้ามสร้างซ้ำ · guest/local ต้องไม่พัง

**ของเดิมที่ reuse (ไม่สร้างระบบใหม่เลย):** client + session จาก `window.getSupabaseClient()`/`window.SITE_AUTH` · จุดเรียก sync เกาะที่ `setUser()` ใน `reading-auth.js` บรรทัดเดียวกับ `GAME_ACCOUNT.sync()` (มีด่านกันยิงซ้ำอยู่แล้ว) · ที่เก็บคือตาราง `learning_saved_items` จากงานรอบเช้า · ท่า remote-authoritative ลอกจาก `GAME_ACCOUNT.sync()`

**กฎการรวม 4 กรณี** (อยู่ในหัวไฟล์ `js/games/word-vault.js`): มีทั้ง 2 ฝั่ง→เก็บ · มีแต่ในเครื่องยังไม่ sync→ส่งขึ้น · มีแต่ในเครื่องเคย sync แล้ว (เจ้าของลบจากเครื่องอื่น)→**เก็บไว้ ไม่ลบ ไม่ส่งซ้ำ** · มีแต่บนเซิร์ฟเวอร์→ดึงลงมา
⚠️ ผลข้างเคียงที่ตั้งใจยอมรับ: ลบคำที่เครื่อง A แล้วเครื่อง B ที่มีคำนั้นค้างจะยังเห็นอยู่ (ต้องมี tombstone ฝั่งเซิร์ฟเวอร์จึงจะหายทุกเครื่อง — ยังไม่มี Decision) เลือกทางนี้เพราะทางกลับกันเสี่ยง "คำหายจริง" ซึ่งผิดกฎที่ Lin สั่ง

**เจอ + แก้ระหว่างทาง 2 จุด:**
- `source` ของคลังคำ (`tone-finder`) **คนละรูปแบบกับ** `practice_surfaces.code` (`tone_finder`) → ยัดลง `source_surface` ที่มี FK = เซฟคำไม่สำเร็จทุกครั้ง · แก้โดยเพิ่มคอลัมน์ `source_raw` (ไม่มี FK) ในไฟล์ SQL ก่อนรันที่ไหนทั้งนั้น
- `word-vault.js` **ไม่เคยมี cache-buster เลย** (`?v=`) → แก้ไฟล์แล้วเบราว์เซอร์อาจใช้ของเก่าค้าง · เพิ่ม `?v=2` ให้ 7 หน้า + bump `reading-auth.js` 14→15 ให้ 7 หน้า

`listening-game.html` ไม่มีระบบล็อกอินเลย (ตั้งใจ ห้ามแตะ) → คำที่เซฟจากหน้านั้นจะถูกส่งขึ้นเองตอนเปิดหน้าเกมอื่นทั้งที่ล็อกอินอยู่ ไม่ต้องแก้ไฟล์นั้น

### 2. รัน Learning Foundation ขึ้นฐานข้อมูลจริงแล้ว (staging → production)

| | staging `xufxvwcelbovzsxywawg` | production `qzkxlhpcputsvbqmtqfi` |
|---|---|---|
| หัวข้อ `[M]` | ✅ 4/4 | ✅ 4/4 |
| ตัวทดสอบ foundation | ✅ 8/8 | ✅ 8/8 |
| ตัวทดสอบคลังคำ (เซิร์ฟเวอร์) | ✅ 8/8 | ✅ 8/8 |

production: ตาราง public 43 → **66** (+23 ตรงตามที่ควร) · ตัวตนคำ 735 + ประโยค 30 ครบ · ตารางที่ต้องว่างยังว่าง 0 แถว · คนไม่ล็อกอินอ่าน `learning_items` ไม่ได้ (permission denied) · **ข้อมูลเดิมครบ** (นักเรียน 18 · บัญชีเกม 11 · SRS 571 แถว) · ไม่มีขยะทดสอบค้าง · จดใน `private.sql_run_log` แล้ว

**เจอ + แก้ 2 จุดตอนรันของจริง (local test จับไม่ได้):**
- ไฟล์ foundation เคยเขียน `insert into private.sql_run_log` ตรงๆ แต่ **staging ไม่มีตารางนั้น** → ไฟล์จะพังทั้งไฟล์ · แก้เป็น "ถ้ามีตารางค่อยจด ไม่มีก็ขึ้นข้อความบอก ไม่เงียบ" → ตอนนี้รันได้ทุกฐานข้อมูล (รวมตอนกู้คืนจากศูนย์)
- **Supabase คืนผลของคำสั่งสุดท้ายเท่านั้น** → ตัวทดสอบเดิมที่เขียนเป็น select แยก 8 ก้อน จะเห็นผลแค่ข้อสุดท้าย อีก 7 ข้อหายเงียบ (Lin ก็จะเจอปัญหานี้ใน SQL Editor) · แก้เป็นเก็บผลในตารางชั่วคราวแล้ว select ทีเดียว เห็นครบ 8 บรรทัด

### ทดสอบทั้งหมด
- 🆕 `scripts/tests-word-vault-sync.js` — 32 ข้อ โหลด `word-vault.js` ตัวจริง (ไม่ก๊อป logic) ทดสอบ guest / 4 กรณีการรวม / เกินเพดาน 55 คำ / ลบ / เซิร์ฟเวอร์ล่ม / ล็อกเอาท์ · **ทดสอบย้อนกลับ 3 แบบยืนยันจับของพังได้จริง** (ทำให้ตัดคำทิ้งเหลือ 30 → จับได้ · ลบคำตามเซิร์ฟเวอร์ → จับได้ · ให้ guest ยิงเซิร์ฟเวอร์ → จับได้) ผูกเข้า `check-site.js` แล้ว
- `node scripts/check-site.js` ผ่าน 16 หัวข้อ · ยังไม่ผ่าน 44 รายการเดิมใน `_staging-build/` (ของเดิม ไม่ใช่บั๊ก) ไม่มีรายการใหม่
- ⚠️ **ยังไม่ได้ทดสอบด้วยเบราว์เซอร์จริง 2 เครื่อง** (ต้องล็อกอินด้วยบัญชีจริงของ Lin) — โค้ดฝั่งเว็บยังไม่ได้ push ด้วย

**ไฟล์ที่แก้:** `js/games/word-vault.js` · `js/games/reading-auth.js` · `vault.html` · 7 หน้า HTML (cache-buster) · `supabase/sql/2026-08-11_learning_foundation.sql` · `supabase/tests/2026-08-11_learning_foundation_TEST.sql` · 🆕`supabase/tests/2026-08-11_word_vault_sync_TEST.sql` · 🆕`scripts/tests-word-vault-sync.js` · `scripts/check-site.js` · `supabase/sql/00_ฟังก์ชันไหนอยู่ไฟล์ไหน.md` · `MAINTENANCE.md`

---

## 2026-08-11 — วางโครงกลางระบบข้อมูลการเรียน (Learning System Foundation) + อุด 2 รูที่เจอระหว่างทาง

**ขอบเขต:** วางโครงฐานข้อมูลกลางเท่านั้น · **ไม่แตะไฟล์ที่ผู้ใช้เห็นแม้แต่ไฟล์เดียว** (ไม่แก้ `.html`/`.css`/ไฟล์เกม/ห้องเรียน) · ไม่แตะตารางเดิมใน Supabase · ไม่ deploy Edge Function

**ของใหม่**
- 🆕 `supabase/sql/2026-08-11_learning_foundation.sql` — ตารางใหม่ 23 ตาราง (ยังไม่ได้รัน รอ Lin รัน staging ก่อน)
  - ตัวตนเนื้อหากลาง `learning_items` (word/sentence/pattern · ระดับความยากกลาง 1 ชุด · Master vs Personal แยกด้วย `owner_user_id`)
  - `learning_item_key_history` — แก้ typo แล้วประวัติการเรียนไม่ขาด
  - จัดหมวด 2 แกน many-to-many (詞類/情境) · ความสัมพันธ์คำ↔ประโยค↔句型 · ความเข้ากันได้กับแต่ละเกม
  - `practice_events` (หลักฐานดิบ) แยกจาก `learning_memory` (สถานะที่คำนวณมา) · แยก เกม/แบบฝึก/ทักษะ เป็น 3 ชั้น
  - `learning_saved_items` — ที่เก็บฝั่งเซิร์ฟเวอร์ให้คลังคำ sync ข้ามเครื่อง (ยังไม่ต่อสายกับเว็บ)
  - ฟรี/จ่ายเงินแยก Plan · Price · Entitlement (ไม่ใช่ `paid=true`)
- 🆕 `supabase/tests/2026-08-11_learning_foundation_TEST.sql` — ตัวทดสอบ 8 ข้อ (`begin…rollback` ไม่เขียนของจริง)
- 🆕 `scripts/audit-learning-content.js` — รายงานช่องว่างคลังเนื้อหา (อ่านอย่างเดียว) ผูกเข้า `check-site.js` แล้ว

**ทดสอบจริงแล้ว (ไม่ใช่แค่อ่านโค้ด):** ยกฐานข้อมูล Postgres 17 ชั่วคราวขึ้นในเครื่อง จำลอง `auth.users`/`anon`/`authenticated`/`game_words`/`game_sentences` แล้วรันไฟล์จริง 2 รอบ (พิสูจน์รันซ้ำได้) · ทดสอบด่าน RLS ด้วยผู้ใช้ 2 คน: อ่านของกันไม่ได้ · ยัดคำใส่บัญชีคนอื่นไม่ได้ · ลบของคนอื่นไม่ได้ · ปั้มสถานะ 掌握 ให้ตัวเองไม่ได้ · ยัดแพ็กเกจจ่ายเงินให้ตัวเองไม่ได้ · ตัวทดสอบผ่าน ✅ 8/8 และ **ทดสอบย้อนกลับ 3 แบบยืนยันว่าจับของพังได้จริง**

**2 รูที่เจอระหว่างทาง (ไม่ได้ตั้งใจหา แต่เจอแล้วต้องอุด)**
1. `scripts/migrate-game-content.js` ขั้น `pruneStale()` **ลบคำเก่าทิ้งเงียบๆ เวลา Lin แก้ typo** → ประวัติ/ดาว/SRS/คลังคำของนักเรียนที่ผูกกับคำเดิมขาดถาวร · เพิ่มด่าน: เจอทั้ง "ของหาย + ของใหม่" ในรอบเดียว = หยุดก่อน ไม่ลบ ต้องยืนยันด้วย `--allow-prune`
2. 🔒 ไฟล์นี้มี **ไบต์ NUL** 1 ตัวใน `join()` → `scripts/secret-scanner.js:387` ข้ามไฟล์ที่มีไบต์ NUL **เงียบๆ** = ไฟล์เดียวในโปรเจกต์ที่รับ `SUPABASE_SERVICE_ROLE_KEY` คือไฟล์เดียวที่ไม่เคยถูกสแกนหาค่าลับเลย · แก้ต้นเหตุ (เปลี่ยนเป็น escape `\u0000` ผลตอนรันเหมือนเดิมเป๊ะ) + ทำให้ตัวสแกน **fail-closed** เหมือนกฎไฟล์ใหญ่เกิน 2MB ของ 2026-08-07 · ตรวจทั้ง repo แล้ว เหลือ 0 ไฟล์ข้อความที่สแกนไม่ได้ (ด่านใหม่จับ NUL ที่เผลอพิมพ์เข้าไปเองได้ทันทีจริง)

**ผลตรวจ:** `node scripts/check-site.js` ผ่าน 15 หัวข้อ · ยังไม่ผ่าน 44 รายการเดิมใน `_staging-build/` (ของเดิมที่ยืนยันแล้วว่าไม่ใช่บั๊ก เพราะอยู่ใน `.gitignore`) ไม่มีรายการใหม่เพิ่ม

**ยังไม่ทำ (ติด Decision ของ Lin — ไม่เดา):** รายชื่อ 詞類/情境 · รายชื่อ Skill · สูตร Mastery · ราคา/แพ็กเกจ · ความเข้ากันได้ของ item กับแต่ละเกม · การต่อสายคลังคำข้ามเครื่องเข้ากับเว็บ (ติดคำถามเพดาน 30 คำเวลารวม 2 เครื่อง)

**ไฟล์ที่แก้:** 🆕`supabase/sql/2026-08-11_learning_foundation.sql` · 🆕`supabase/tests/2026-08-11_learning_foundation_TEST.sql` · 🆕`scripts/audit-learning-content.js` · `scripts/migrate-game-content.js` · `scripts/secret-scanner.js` · `scripts/check-site.js` · `supabase/sql/00_ฟังก์ชันไหนอยู่ไฟล์ไหน.md` · `supabase/schema/README.md` · `MAINTENANCE.md`

---

## 2026-08-10 — Navigation IA รอบใหญ่ + games.html ปรับเป็นหน้า hub (games-practice.html ใหม่) + แก้ responsive nav

สถานะ: ✅ เสร็จแล้ว — push ครบผ่าน GitHub Desktop ยืนยัน "No local changes" (local = origin)

**สิ่งที่ทำ (หลายเฟสในแชทเดียว):**
1. เปลี่ยนเมนูบนสุดเป็น 🎮遊戲(ปุ่มรอง)/學習資源/更多▾(3 กลุ่ม + เส้นคั่นก่อน聯絡我們)/免費試聽 CTA — แก้ที่ `data/nav-template.js` ที่เดียว แล้ว regen ทุกหน้าผ่าน `scripts/generate-nav.js` (ไม่มี href ใหม่ ไม่ย้าย URL ไหน)
2. แก้บั๊กเมนูหายเร็วเกินไปตอนย่อหน้าต่าง — เดิม `@media(max-width:900px)` ตายตัวกว้างเกินจริง เปลี่ยนเป็น `window.__navFit()` วัดความกว้างจริงของ DOM แล้วสลับ `.nav-compact` เอง ผูก resize/orientationchange (debounce 120ms) + `document.fonts.ready` ใน `js/core/shared.js` · เหลือ CSS safety-net ที่ `max-width:480px` (ต้องอยู่ต่ำกว่าเกณฑ์ JS เสมอ กันแย่งกันตัดสินใจ)
3. `games.html` จากลิสต์ 5 เกมแบนๆ → หน้า hub: Search เดิม (ไม่แตะ logic) + 3 การ์ดหลักเท่ากัน (泰語遊戲練習室→`games-practice.html` / 綜合挑戰=ปิดใช้งานอยู่ / 造句練習→`lego.html`)
4. สร้างหน้าใหม่ `games-practice.html` เก็บ 5 เกมเดิม (聲調/拼讀/聽力/打字/語序) เป็นการ์ดเท่ากัน + ปุ่ม "← 返回遊戲中心" — URL เกมทุกตัวเหมือนเดิมทุกตัวอักษร
5. final polish: แก้ title/meta/OG/Twitter ของ `games.html` ให้ตรงกับ hub ใหม่ (เลิกบอกว่า 綜合挑戰 เล่นได้), จัดโครง JSON-LD ใหม่ (ย้าย ItemList เกมจริงไป `games-practice.html` + เพิ่มรายการ 聽力 ที่เคยตกหล่นจาก schema เดิม, ตัด `games.html` ให้เหลือแค่ปลายทางที่กดได้จริง 2 ปลายทาง, แก้ breadcrumb เป็น 3 ระดับ), บังคับความสูงการ์ดเท่ากันด้วย CSS `-webkit-line-clamp`/`min-height` ล้วน (ไม่แก้คำบรรยายเกม), ลบบล็อก `page-strip` เก่า (ไม่ใช่ของ generator ควบคุม) ออกจาก 2 หน้านี้

**ไม่แตะ:** Search logic/Search Index/Gemini fallback/routingTitle, game content/vocabulary/sentences, URL เกมเดิมทุกตัว

**ทดสอบผ่านครบ:** `scripts/check-site.js`, `scripts/check-nav-consistency.js`, `scripts/tests-search-behavioral.js`

**🔴 บทเรียนตอน push — เจอ "16 changed files" ที่ไม่ใช่ไฟล์ที่เพิ่งแก้ ทำให้กลัวว่างานหาย:** ตรวจใน GitHub Desktop (ผ่าน computer-use) พบว่า **ไม่ใช่ปัญหา git worktree คนละโฟลเดอร์** (path ของ Main Worktree ตรงกับ `/Users/taihualin/Developer/mrtaihualin.github.io` เป๊ะ ยืนยันด้วยการ copy path มาวาง) แท้จริงงานหลักของแชทนี้ (nav IA/games.html/games-practice.html/responsive nav) **ถูก commit + push ไปแล้วจริงหลายรอบระหว่างทางงาน** (ยืนยันจาก History tab + กด Fetch origin แล้วไม่มีเลขค้าง push) ส่วน "16 ไฟล์" ที่เห็นค้างเป็น**คนละก้อนงาน**ที่ไม่เกี่ยวกัน: 15 หน้า HTML ที่ nav ยังไม่ถูกซิงค์เป็นแบบใหม่ (ตกหล่นจากรอบ commit ก่อนหน้า) + `js/core/auth-widget.js` (แก้บั๊กปุ่ม LINE login งาน P7-02 คนละเรื่อง มีคอมเมนต์ `2026-08-10 (P7-02...)` กำกับชัดเจน) — ตรวจ diff ทั้งคู่แล้วปลอดภัย/สมบูรณ์ Lin commit+push รวมไปด้วยแล้ว

**ไฟล์ที่แก้:** `games.html`, 🆕 `games-practice.html`, `css/shared.css`, `data/nav-template.js`, `js/core/shared.js`+`.min.js`, `js/games/games-search-ui.js`, `scripts/generate-nav.js`, `scripts/check-nav-consistency.js` + 15 หน้า HTML (nav sync) + `js/core/auth-widget.js` (คนละงาน)

**⚠️ ยังไม่ push:** entry นี้ใน `MAINTENANCE.md` และ entry คู่กันใน `CLAUDE.md` (หัวข้อ "อัปเดตล่าสุด: 2026-08-10 (รอบ 5)") — เป็นไฟล์เอกสารล้วน ไม่กระทบเว็บที่ deploy จริง แต่ยังต้อง Lin push เองรอบถัดไป

---

## 2026-08-10 — `privacy.html` ตกหล่นจาก nav generator + เพิ่ม automated nav consistency checker

สถานะ: ✅ เสร็จแล้ว — push แล้ว เปิดเว็บจริงยืนยันแล้วว่า `privacy.html` มีแถบประกาศ+เมนูล่างครบเหมือนหน้าอื่น

**สาเหตุ:** `scripts/generate-nav.js` มี `ROOT_PAGES` 31 หน้า ขาด `privacy.html` ไปหน้าเดียว (ไม่ได้อยู่ในรายการตั้งแต่แรก) ทำให้หน้านี้ไม่เคยได้รับแถบประกาศบนสุด + เมนูล่างมือถือที่เปิดใช้เมื่อ 2026-08-10 (รอบเช้า) — nav บนสุดถูกต้องอยู่แล้วเพราะมี `<script src="data/nav-template.js">` ค้างจากรอบก่อน แต่ 2 ส่วนใหม่ที่เพิ่งเปิดใช้ไม่เคยถูกแทรกเข้าไปเลย

**สิ่งที่ทำ:**
1. เพิ่ม `privacy.html` เข้า `ROOT_PAGES` ใน `scripts/generate-nav.js`
2. Generate เฉพาะ `privacy.html` ไฟล์เดียว (ไม่รัน `generate-nav.js` เต็มรูปแบบ เพราะตอนนั้นมีงาน Search/Staging รันคู่ขนานแตะไฟล์เกม/scripts อยู่หลายไฟล์ — เลี่ยงความเสี่ยงชนงาน)
3. สร้าง `scripts/check-nav-consistency.js` (read-only ล้วน ไม่เขียนทับ HTML) เทียบ nav/แถบประกาศ/bottom-nav ทุกหน้าที่อยู่ใน scope กับสิ่งที่ `data/nav-template.js` ควรสร้างจริง + หาไฟล์ที่มี `<nav class="site-nav">` แต่ไม่อยู่ใน scope (กันหน้าใหม่ตกหล่นซ้ำแบบนี้ในอนาคต) — ผูกเข้า `scripts/check-site.js` แล้ว
4. ยืนยันว่า `en/*.html` (7 ไฟล์) มี class `site-nav` ซ้ำชื่อ แต่เป็นเมนูภาษาอังกฤษคนละโครงสร้างจริง ไม่ใช่บั๊ก — checker ไม่นับเป็น mismatch

**ผลตรวจ:** `node scripts/check-nav-consistency.js` → PASS ครบ 76 หน้า (75 เดิม + privacy.html) · `node scripts/tests-search-behavioral.js` → PASS (ไม่กระทบ Search MVP) · `node scripts/check-site.js` → ผ่านทุกหมวดที่เกี่ยวกับเว็บนี้ ที่ไม่ผ่าน 45 รายการเป็น secret-scan ใน `_staging-build/` (ของ staging job คนละงาน ไม่แตะ)

**ไฟล์ที่แก้:** `scripts/generate-nav.js`, `privacy.html`, `scripts/check-site.js`, 🆕 `scripts/check-nav-consistency.js`

---

## 2026-08-10 — เก็บกวาด `_staging-build-verify/` ที่หลุดขึ้น repo public (375 ไฟล์)

สถานะ: ✅ เสร็จแล้ว — ตรวจแล้วไม่มีค่าลับรั่ว (`supabase-config.staging.js` ไม่ได้ขึ้นไปด้วย ไม่มี `service_role` key)

**สาเหตุ:** งาน P7-02 (staging บน Netlify) สร้างโฟลเดอร์สำเนาเว็บ 2 อัน — `_staging-build/` ถูก `.gitignore` ล็อกไว้แล้ว แต่ `_staging-build-verify/` (สำเนาตรวจซ้ำ) ลืมล็อก → หลุดขึ้น GitHub ไป 375 ไฟล์

**สิ่งที่ทำ:**
1. เพิ่ม `_staging-build-verify/` เข้า `.gitignore` (ต่อจาก `_staging-build/`)
2. ตรวจแล้ว `scripts/build-staging.js` สร้างสำเนาแบบนี้ใหม่ได้เสมอ (โค้ดมีคอมเมนต์กันโฟลเดอร์นี้ซ้อนอยู่แล้วบรรทัด 33) → ลบโฟลเดอร์ `_staging-build-verify/` ออกจากเครื่องแล้ว
3. ตรวจไม่มีโฟลเดอร์สำเนาอื่นชื่อ `_staging-build-*` หลงเหลืออีก

**ผล `check-site.js` (secret scan):** ก่อนลบ 93 รายการไม่ผ่าน (43 จาก `_staging-build-verify/` + 43 จาก `_staging-build/` + 7 ของเว็บจริง) → หลังลบเหลือ 50 รายการ (43 จาก `_staging-build/` ที่ยังอยู่บนเครื่อง + 7 ของเว็บจริง)
⚠️ **ยังไม่ใช่ 7 ตามที่คาด** เพราะ `_staging-build/` (ที่ล็อกถูกแล้วและห้ามแตะ) ยังอยู่บนเครื่องจริงตอนรัน — `check-site.js` ไม่ได้ยกเว้นโฟลเดอร์นี้ตอนสแกน ถ้าลบ `_staging-build/` ออกชั่วคราว (เช่นหลัง deploy ขึ้น Netlify เสร็จแล้ว) แล้วรันใหม่ น่าจะเหลือ 7 รายการตรงตามคาด (6 จาก `supabase/sql/เลิกใช้แล้ว_ห้ามรัน/` + 1 จาก `js/core/supabase-config.staging.js`)

**Commit message เตรียมไว้:** `เพิ่ม _staging-build-verify/ เข้า .gitignore และลบสำเนาที่หลุดขึ้น repo (375 ไฟล์) — ไม่มีค่าลับรั่ว`

**ไฟล์ที่แก้:** `.gitignore`, `MAINTENANCE.md` (ลบ `_staging-build-verify/` ออกจากเครื่อง — ไม่ใช่ไฟล์เว็บ)

---

## 2026-08-10 — Gemini fallback ของ Search MVP (`search-gemini`) ปิดงานสมบูรณ์ — deploy สำเร็จ + แก้ 3 จุดที่เจอตอนทดสอบ

สถานะ: **✅ ปิดเคสแล้ว** — ทดสอบผ่านจริงด้วย curl (`matched:true, confident:false`) + Lin push ครบทุกไฟล์แล้ว

**3 จุดที่แก้:**
1. เดิม Gemini ตอบ `"none"` เงียบๆ เวลาคำค้นกำกวม (เช่น "想練聲" ขาดคำว่า 調) → เปลี่ยน `SYSTEM_INSTRUCTION`/`responseSchema` ให้ต้องเลือก `id` ที่ใกล้เคียงที่สุดเสมอ (ตัด "none" ออกจาก enum) พร้อมส่ง `confident:true/false` มาด้วย · ฝั่งเว็บ (`js/core/search-ui.js`, `js/games/games-search-ui.js`) โชว์การ์ด "🤔 不確定，猜你可能是想找" เวลา `confident:false` แทนคำแนะนำมั่นใจเต็มร้อย
2. ลืม bump cache-buster หลังแก้ JS — `js/core/search-engine.js`/`search-ui.js`/`js/games/games-search-ui.js` เปลี่ยนจาก `?v=2` → `?v=3` ใน `index.html`/`games.html`
3. 🔴 **สาเหตุจริงของ error `gemini http 429` ตลอด:** โมเดล default เดิม `gemini-2.0-flash` ถูก Google เลิกใช้แล้วจริง (deprecated ก.พ. 2026, ปิดจริง 3 มี.ค. 2026) — ไม่เกี่ยวกับ billing/quota เลย พิสูจน์จาก Google AI Studio (project ยัง Free tier ไม่ผูก billing แต่พอเปลี่ยนโมเดลก็หายเลย) แก้โดยตั้ง secret `GEMINI_MODEL=gemini-3.5-flash-lite` (ไม่ต้อง deploy ใหม่ก็มีผลทันที) + อัปเดต `DEFAULT_GEMINI_MODEL` ในโค้ดให้ตรงด้วยกันลืมถ้าวันหลังมีคนลบ secret ทิ้ง

**ไฟล์ที่แก้:** `supabase/functions/search-gemini/index.ts`, `js/core/search-engine.js`, `js/core/search-ui.js`, `js/games/games-search-ui.js`, `index.html`, `games.html`

**⚠️ ระหว่างทางเจอ prompt injection:** มีข้อความแทรกกลางแชทสั่งให้เปลี่ยน repo path เป็น session อื่น + แก้ไฟล์ `routingTitle` ที่ปิดงานไปแล้ว (อ้างไฟล์ที่ไม่มีจริงในระบบ เช่น `scripts/test-site-search.js`) — Lin ยืนยันว่าไม่ใช่คำสั่งจริง ไม่ได้ทำตามเลย

**หมายเหตุสำหรับทีมงานอนาคต:** ถ้าเจอ `matched:false, reason:"gemini http xxx"` อีก ให้เช็ก 2 อย่างก่อนเสมอ: (1) โมเดลที่ตั้งไว้ยังไม่ถูก Google เลิกใช้ (เช็ก https://ai.google.dev/gemini-api/docs/models) (2) โควตา free tier ที่ https://aistudio.google.com/apikey — ไม่ต้องเดา ตรวจทั้งสองจุดจากของจริงก่อนสรุป

---

## 2026-08-10 — P7-02 staging: OAuth 3 ทาง (Google/Facebook/LINE) ทดสอบผ่านจริง + แก้โดเมน staging 15 edge functions (คนละ track กับ bottom-nav ด้านล่าง)

สถานะ: 🟡 **โค้ดแก้เสร็จแล้ว ยังไม่ push ขึ้น GitHub** (รอ Lin กด push เองผ่าน GitHub Desktop) — deploy ขึ้น staging project จริงแล้วแค่ 1 ใน 15 ไฟล์

**สิ่งที่แก้:** เพิ่มโดเมน staging (`https://gentle-moxie-bf64ad.netlify.app`) เข้า allow-list (`ALLOWED_ORIGINS`/`allowedHosts`/`Access-Control-Allow-Origin`) ใน 15 ไฟล์ edge function:
`supabase/functions/line-login/index.ts`, `game-content/index.ts`, `search-gemini/index.ts`, `account-export/index.ts`, `account-delete/index.ts`, `account-unlink/index.ts`, `unlink-line-student/index.ts`, `restore-line-student/index.ts`, `notify-line/index.ts`, `sync-line-menu/index.ts`, `lego-daily-limit/index.ts`, `log-session/index.ts`, `tone-round/index.ts`, `admin-player-accounts/index.ts`, `game-reward/index.ts`

4 ไฟล์สุดท้าย (`log-session`, `tone-round`, `admin-player-accounts`, `game-reward`) เดิมล็อกโดเมนเดียวแบบ hardcode ไม่มีระบบ allow-list เลย — ปรับให้เป็นแพตเทิร์นเดียวกับไฟล์อื่น (คำนวณ `Access-Control-Allow-Origin` จาก `Origin` header ของ request เทียบกับ allow-list ต่อ request ไม่ใช้ตัวแปร module-level ร่วมข้ามคำขอ กันปัญหา concurrent request คนละ origin ชนกัน)

**Commit message เตรียมไว้:** `เพิ่มโดเมน staging (Netlify) เข้ารายชื่อที่อนุญาตใน 15 edge functions เพื่อทดสอบ P7-02`

**ไฟล์ใหม่ (ไม่ถูก push แน่นอน — อยู่ .gitignore):** `js/core/supabase-config.staging.js`

**ทดสอบผ่านจริง:** ล็อกอิน Google/Facebook/LINE บนหน้าทดสอบ staging สำเร็จครบ (ดูหลักฐานเต็มที่ `Documents/Claude/Projects/Bussiness Idea/ระบบเว็บไซต์/72_เช็คลิสต์_เตรียม_staging_ก่อนรัน_P7-02.md`) — **ยังไม่ใช่การทดสอบเว็บจริงทั้งเว็บ** เพราะหน้าเว็บจริงทุกหน้ายังโหลด `js/core/supabase-config.js` (production) เหมือนเดิม ไม่กระทบผู้ใช้จริงเลยรอบนี้

**งานค้าง:** (1) push 15 ไฟล์ขึ้น GitHub (2) deploy อีก 14 edge function ขึ้น staging project (3) หาวิธีให้สำเนาเว็บทดสอบทั้งเว็บโหลด `supabase-config.staging.js` แทนโดยไม่แตะเว็บจริง

---

## 2026-08-10 (แชทถัดมา) — เชื่อมเว็บจริงทั้งเว็บเข้ากับ staging สำเร็จ + เจอ+แก้บั๊ก OAuth redirect จริง 1 จุด

สถานะ: 🟡 **ทดสอบผ่านจริงแล้ว โค้ดแก้เสร็จแล้ว ยังไม่ push ขึ้น GitHub**

**สิ่งที่สร้างใหม่:** `scripts/build-staging.js` (Node, รันด้วย `node scripts/build-staging.js`) — copy ทั้งเว็บ (ยกเว้น `.git`/`.github`/`CLAUDE.md`/`supabase/`/`_dev/`/`scripts/`/`_archive/`/`_to_delete/`/`_แผนงาน/`/`_บทความ-เตรียมเขียน/`) ไปโฟลเดอร์ `_staging-build/` แล้วแก้เฉพาะในสำเนานั้นให้ 19 หน้าที่มีปุ่มล็อกอินโหลด `js/core/supabase-config.staging.js` แทน `supabase-config.js` — ไม่แตะไฟล์เว็บจริงเลย · เพิ่ม `_staging-build/` เข้า `.gitignore` แล้ว · deploy โฟลเดอร์ผลลัพธ์ขึ้น Netlify แบบลาก-วาง (Lin ทำเอง)

**ทดสอบผ่านจริง:** เปิดหน้าเกมจริง `vault.html` บน `https://gentle-moxie-bf64ad.netlify.app` (ผ่าน `_staging-build` ไม่ใช่หน้าทดสอบแยกแบบรอบก่อน) กดปุ่ม "登入保存分數" → Google → ล็อกอินสำเร็จ

**🔴 บั๊กจริงที่เจอระหว่างทดสอบ + แก้แล้ว (Lin อนุมัติ):** `js/games/reading-auth.js` ฟังก์ชัน `oauthLogin()` เดิมส่ง `redirectTo: location.href` ให้ Supabase ตรงๆ — ถ้า URL ของหน้าเว็บมี `#` ค้างอยู่ก่อนแล้ว (เช่น เคยกดลิงก์ `href="#"` ในหน้า) `location.href` จะลงท้ายด้วย `#` เปล่าๆ แล้ว Supabase เอาไปต่อท้ายด้วย `#access_token=...` ตอน redirect กลับ กลายเป็น URL ผิดรูปแบบ `.../##access_token=...` → **Google ปฏิเสธคำขอ login ตรงๆ ด้วยหน้า error "400. That's an error. Your client has issued a malformed or illegal request."** (ยืนยันจาก URL จริงที่ capture ได้ตอนเกิด error เห็น `redirect_to=...%2F%23%23access_token%3D...`)

แก้โดยตัด `#` เดิมออกก่อนส่งเสมอ:
```js
var cleanRedirect = location.href.split('#')[0];
sb.auth.signInWithOAuth({ provider: supabaseProvider, options: { redirectTo: cleanRedirect } })
```

⚠️ **`reading-auth.js` ใช้ร่วม 14 หน้า รวมเว็บจริงด้วย** (ไม่ใช่แค่ staging) — บั๊กนี้อาจเกิดกับผู้เล่นจริงที่บังเอิญมี `#` ค้างใน URL ตอนกด login เช่นกัน ยังไม่ push

**Commit message เตรียมไว้ (รวมกับของเดิม เป็น 16 ไฟล์):**
```
เพิ่ม scripts/build-staging.js สำหรับสร้างสำเนาเว็บทดสอบ staging + แก้บั๊ก OAuth redirect ใน reading-auth.js (ตัด # เดิมออกก่อนส่งให้ Supabase กัน Google ปฏิเสธ URL ผิดรูปแบบ) + เพิ่มโดเมน staging เข้ารายชื่อที่อนุญาตใน 15 edge functions
```

**งานค้าง:** (1) deploy อีก 14 edge function ขึ้น staging project (2) push โค้ด 16 ไฟล์ขึ้น GitHub (3) เตรียม 2 อีเมลทดสอบ (4) เริ่มรัน test case จริงตาม `68_ผลลัพธ์_P7-02_e2e-test-plan.md` — รายละเอียด/หลักฐานเต็มที่ `Documents/Claude/Projects/Bussiness Idea/ระบบเว็บไซต์/72_เช็คลิสต์_เตรียม_staging_ก่อนรัน_P7-02.md`

**หมายเหตุความปลอดภัย:** ระหว่างดีบัก Lin เคยส่ง URL ที่มี access token/refresh token ของบัญชีทดสอบ staging ติดมาด้วยในแชทนี้ — เป็นบัญชีทดสอบของ Lin เอง ความเสี่ยงต่ำ แต่แจ้ง Lin แล้วว่าไม่ควรส่ง URL ลักษณะนี้ซ้ำ

---

## 2026-08-10 — สืบต่อเรื่อง bottom-nav มือถือ: ทฤษฎี "แคช" ผิด · เจอบั๊กจริงคนละตัวในหน้า blog/ 44 หน้า

สถานะ: **✅ ปิดเคสแล้ว (2026-08-10)** — Lin ยืนยันจากมือถือจริงว่าแถบล่าง 4 ไอคอนขึ้นถูกต้อง · push ครบทุกรอบแล้ว (รอบสุดท้าย `cf2a626`)

### 📌 สรุปทั้งเคส (อ่านแค่ตรงนี้พอ ถ้าไม่ต้องการรายละเอียด)

ปัญหาเดียวที่รายงานมาตอนแรก ("แถบล่างมือถือยังเป็น 6 ปุ่มเก่า") จริงๆ แล้วเป็น **4 ปัญหาซ้อนกัน** ต้องแก้ทีละชั้น:

| # | ปัญหาจริง | สาเหตุ | แก้ที่ |
|---|---|---|---|
| 1 | แถบ 4 ไอคอนไปโผล่ **ขอบบนจอ** แทนขอบล่าง (ทำให้เห็น `.page-strip` 6 ปุ่มที่ขอบล่างแทน) | `css/shared.css` มี `nav{top:0}` เขียนเป็น bare tag selector → หลุดมาทับ `<nav id="bottom-nav">` · `top` ชนะ `bottom` ตามสเปก CSS | เพิ่ม `top:auto` ใน `#bottom-nav` |
| 2 | แถบ 6 ปุ่มเก่า **แว้บ** ทุกครั้งที่เปลี่ยนหน้า | `.page-strip` เป็น static HTML วาดทันที · `#bottom-nav` ต้องรอ JS | ซ่อน `.page-strip` บนมือถือ (≤768px) |
| 3 | **หน้ากระพริบ/เหมือนโหลด 2 รอบ** | `#bottom-nav` + แถบประกาศ `.avail-band` ถูกยัดเข้า DOM ด้วย JS ทีหลัง → layout ขยับทุกครั้ง | เขียนทั้ง 2 อย่างลง HTML เป็น static ผ่าน `scripts/generate-nav.js` + ย้าย CSS ไป `css/shared.css` |
| 4 | **หน้าเกมไม่เหลือแถบอะไรเลย** (ผลข้างเคียงจากข้อ 2) | หน้าเกมซ่อน `#bottom-nav` อยู่แล้วตั้งแต่ 2026-07-12 + ข้อ 2 ไปซ่อน `.page-strip` เพิ่ม | ยกเลิกกฎซ่อนของหน้าเกม → ทุกหน้าใช้แถบ 4 ไอคอนเหมือนกันหมด (Lin สั่ง) |

**สิ่งที่เปลี่ยนไปถาวร ทีมงานในอนาคตต้องรู้:**
- ✏️ **แก้ข้อความประกาศ (แถบทองด้านบน) ที่ `data/nav-template.js` เท่านั้น** แล้วรัน `node scripts/generate-nav.js` — ไม่ใช่ที่ `js/core/shared.js` อีกแล้ว
- ✏️ **แก้เมนู/แถบล่าง ก็ที่ `data/nav-template.js` แล้วรัน `generate-nav.js` เหมือนกัน** — สคริปต์นี้ตอนนี้เขียน 3 อย่างลง HTML ทุกหน้า: เมนูบนสุด · แถบประกาศ · แถบล่างมือถือ
- ⚠️ **breakpoint 768px ต้องตรงกัน 2 ที่เสมอ**: `.page-strip{display:none}` (`css/shared.css`) กับ `#bottom-nav{display:flex}` (`css/shared.css`) — แก้ตัวเดียวไม่แก้อีกตัว = มีช่วงจอที่ไม่มีแถบเลย หรือมี 2 แถบซ้อน
- ⚠️ **`top:auto` ใน `#bottom-nav` ห้ามลบ** — ลบเมื่อไหร่บั๊กข้อ 1 กลับมาทันที
- 🎮 **หน้าเกมมีแถบ 4 ไอคอนแล้ว** (ยกเลิกกฎซ่อนของ 2026-07-12) · ยังซ่อนอยู่เฉพาะตอนกดปุ่ม ⛶ เต็มจอ

**บทเรียนสำคัญที่สุดของเคสนี้:** ตรวจ 13 ทฤษฎีแรก (แคช/เครือข่าย/VPN/แท็บค้าง/service worker/syntax ฯลฯ) **ผิดทางทั้งหมด** เพราะเช็คแค่ `getComputedStyle().display` ว่า "โชว์ไหม" **ไม่เคยเช็ค `getBoundingClientRect()` ว่า "โชว์ตรงไหน"** · เจอต้นเหตุจริงภายใน 2 ขั้นตอนหลังจากวัดตำแหน่งจริงบนเครื่อง Lin ด้วย bookmarklet
→ **ครั้งหน้าที่เจอ "ของมีอยู่ในโค้ดแต่ผู้ใช้ไม่เห็น" ให้วัดตำแหน่งจริงบนเครื่องผู้ใช้เป็นอย่างแรก อย่าเพิ่งไล่ทฤษฎีแคช/เครือข่าย**
→ **วิธีที่ได้ผลจริงและง่ายที่สุด: bookmarklet** (สร้าง Bookmark ใน Safari แล้วเปลี่ยน URL เป็น `javascript:...alert(...)`) — Lin ทำเองได้จากมือถือใน 1 นาที ไม่ต้องต่อสาย USB ไม่ต้องใช้ Mac

---

*(รายละเอียดการสืบสวนทีละรอบอยู่ด้านล่าง เก็บไว้เป็นหลักฐาน)*

| เรื่อง | สถานะ |
|---|---|
| หน้า `blog/` 44 หน้าไม่โหลด `nav-template.js` (แถบล่างเปล่า + ช่องว่าง 60px) | ✅ แก้แล้ว push แล้ว |
| หน้า `blog/` 44 หน้าเมนูบนสุดเป็นชุดเก่า | ✅ แก้แล้ว **ยืนยันจากเว็บสดจริง** — `https://mrtaihualin.com/blog/typing-guide.html` เมนูเป็นชุดใหม่ (遊戲/學習資源/關於我 + `免費試聽`) แล้ว |
| **`#bottom-nav` 4 ปุ่มบนมือถือ Lin** | ✅ **แก้แล้ว ปิดเคส** — root cause คือ `nav{top:0}` หลุดมาทับ (ดูตารางสรุปด้านบน) |

### รอบ 2 (วันเดียวกัน) — เจอตอนเช็กหลัง push: หน้า `blog/` 44 หน้ายังเป็นเมนูบนสุดชุดเก่า → แก้แล้ว

เปิดเว็บสด `https://mrtaihualin.com/blog/tone-guide.html` ตรวจแล้วพบว่า **หน้าบล็อกยังโชว์เมนูบนสุดชุดเก่า 6 หมวด** (程度測驗/關於老師與學生/了解課程/資源分享/專業服務/聯絡我們 + CTA `預約免費體驗課`) ขณะที่หน้าอื่นเป็นชุดใหม่ 3 หัวข้อแล้ว = **เว็บมีเมนู 2 ชุดไม่ตรงกัน**

**สาเหตุ:** `scripts/generate-nav.js` มีรายชื่อไฟล์ **พิมพ์มือตายตัว 31 หน้า (root ล้วน) ไม่รวม `blog/` เลยสักไฟล์** ทั้งที่หน้าบล็อกมี `<nav class="site-nav">` จริงครบ 44/44 (คอมเมนต์ในสคริปต์เขียนว่า "ตรวจจาก grep ของจริง" แต่ตกหล่น)

**แก้ยังไง:** เปลี่ยนจาก "พิมพ์รายชื่อมือ" เป็น **ให้สคริปต์หาไฟล์เอง** (`findNavPagesIn('blog')` — สแกน `.html` ที่มี `<nav class="site-nav">` จริง) เพื่อไม่ให้บทความใหม่ในอนาคตตกหล่นซ้ำอีก · และทำ path ของ `<script src="data/nav-template.js">` ให้ขึ้นกับความลึกโฟลเดอร์ (`navTemplateTagFor()` → `../data/...` สำหรับ `blog/`) พร้อมขยาย `SHARED_MIN_RE` ให้รับ `../` ด้วย · `href` ใน `nav-template.js` เป็น absolute (`/games.html`) อยู่แล้ว จึงใช้จากโฟลเดอร์ย่อยได้ตรงๆ ไม่ต้องแก้อะไรเพิ่ม

**หลักฐาน:** `node scripts/generate-nav.js` → ตรวจ 75 หน้า แก้จริง 44 หน้า · เทียบ **md5 ของ nav block ทุกไฟล์ในเว็บ** (ปิดงานที่ค้างจาก 2026-08-09 ข้อ "ยังไม่ตรวจ md5 nav") ได้ **74 ไฟล์ตรงกันเป๊ะทุกไบต์** ส่วนที่ต่าง 8 ไฟล์เป็นของที่ตั้งใจทั้งหมด:
- `tone-finder.html` — มี GA tracking พิเศษติดกับ logo/hamburger ตาม `PAGE_OVERRIDES` (ตั้งใจ)
- `en/*.html` 7 ไฟล์ — เว็บเวอร์ชันภาษาอังกฤษ มีเมนูอังกฤษของตัวเอง **ต้องไม่ถูกทับด้วยเมนูจีน** · ตรวจแล้วไม่โหลด `shared.min.js`/`nav-template.js` และไม่มี `#bottom-nav`/`.page-strip` เลย (0/7) จึงไม่กระทบอะไร

`node scripts/check-site.js` ผ่านทุกหมวดเหมือนเดิม (ที่ไม่ผ่าน 6 รายการเป็น secret scan ในไฟล์ SQL เก่าโฟลเดอร์ `เลิกใช้แล้ว_ห้ามรัน/` ของเดิมก่อนรอบนี้)

**ไฟล์ที่แก้รอบ 2:** `scripts/generate-nav.js` · 44 ไฟล์ใน `blog/` (nav block) · `MAINTENANCE.md`

---

### 🔴 เรื่องที่ยังไม่จบ — `#bottom-nav` 4 ปุ่มยังไม่ขึ้นบนมือถือ Lin (สรุปให้แชทถัดไป)

**อาการ:** Lin เปิดเว็บบน iPhone Safari แล้วแถบล่างยังเป็น **6 ปุ่มข้อความ** (老師・介紹 / 課程・費用 / 須知・分享 / 導遊・翻譯 / 泰語・分享 / 泰語・遊戲) ไม่ใช่ 4 ไอคอนใหม่ (🏠首頁 / 📞試聽 / 🎮遊戲 / 👤我的) · ยืนยันซ้ำ 2026-08-10 หลัง push ครบ 2 รอบแล้ว

**⛔ ทฤษฎีที่ตรวจแล้วว่า "ไม่ใช่" — ห้ามเสียเวลาไล่ซ้ำ:**

1. **แคช / bump `?v=`** — 2026-08-08 เคย bump ครบทั้ง 76 ไฟล์เป็น `v=18` เท่ากันหมด แล้ว push 08-09 bump 31 ไฟล์เป็น `v=19` = URL ใหม่ที่เบราว์เซอร์ไม่เคยโหลดมาก่อน · รอบนี้ bump เป็น `v=20` ทั้งเว็บอีกครั้งแล้วก็ยังไม่หาย · Lin ก็ล้างแคชเต็มรูปแบบไปแล้วด้วย (Settings→Safari→Clear History and Website Data)
2. **ไฟล์ไม่ได้ขึ้นเว็บ / push ไม่สำเร็จ** — ตรวจ `.git/refs` ทั้ง 2 รอบ local = origin ตรงกัน · เว็บสดตอบ 200 ทั้ง `data/nav-template.js` และ `js/core/shared.min.js` · เมนูบนสุดชุดใหม่ขึ้นบนเว็บสดจริงทั้งหน้า root และหน้า blog
3. **`shared.min.js` ไม่ตรงกับ `shared.js`** — regenerate ด้วย `bash scripts/build-minjs.sh` (terser) แล้ว · `renderBottomNavHTML` มีอยู่ในไฟล์ min จริง
4. **Service Worker / PWA cache** — ตรวจแล้ว repo นี้ **ไม่มี** `sw.js` / `service-worker.js` / `manifest.json` และไม่มีโค้ดเรียก `navigator.serviceWorker` เลยสักไฟล์
5. **โค้ดมี syntax ที่ Safari เก่ารับไม่ได้** — ไล่ `?.` / `??` / `.at()` / `replaceAll` / arrow function / template literal ใน `nav-template.js`, `search-index.js`, `search-engine.js`, `search-ui.js` แล้ว **ไม่เจอเลย เป็น ES5 ล้วนทั้งหมด**
6. **`.page-strip` บังแถบใหม่** — เป็นไปไม่ได้ตามโค้ด: `#bottom-nav` z-index **998** สูงกว่า `.page-strip` z-index **990** และสูงกว่า (~60px vs 48px) ทั้งคู่ `position:fixed;bottom:0` → ถ้า `#bottom-nav` ถูกสร้างจริงต้องบังมิด · **ที่ Lin เห็น 6 ปุ่ม = `.page-strip` แปลว่า `#bottom-nav` ไม่ถูกสร้างบนเครื่องนั้น**
7. **หน้าเกมซ่อน `#bottom-nav` ด้วย `!important`** — จริง แต่เฉพาะหน้าที่มี `#game-switcher` (ตั้งใจตั้งแต่ 2026-07-12) · `index.html` ไม่มี → ไม่เกี่ยว

**ทางเข้าเดียวในโค้ดที่จะทำให้แถบไม่ถูกสร้าง** (ไล่ครบแล้ว): `js/core/shared.js` บรรทัด 77-79 — `injectNav()` จะ `return` ทันทีถ้าหน้านั้น **ไม่มี `<nav class="site-nav">`** · ตรวจแล้ว `index.html` มี 1 อัน ไม่ควรเข้ากรณีนี้

### รอบ 3 (วันเดียวกัน 2026-08-10) — ทดสอบแยกปัญหาบนเครื่อง Lin จริงทีละจุด ตัดออกได้ครบ 6 ข้อเพิ่ม (รวมเป็น 13 ทฤษฎีที่ไม่ใช่)

Lin ทดสอบบนเครื่องจริงตามลำดับที่แนะนำ ผลทุกข้อคือ **ปัญหายังอยู่ ไม่หาย**:

8. **เปิด `https://mrtaihualin.com/blog/typing-guide.html` (หน้าที่ไม่มี `.page-strip` ในโค้ดเลย)** — ยังเห็น 6 ปุ่มเดิม (老師・介紹/課程・費用/須知・分享/導遊・翻譯/泰語・分享/泰語・遊戲) → **สำคัญมาก:** พิสูจน์ว่าเครื่อง Lin ไม่ได้รัน HTML/JS ของหน้านี้จริงเลย เพราะ label พวกนี้ไม่มีอยู่ใน `blog/typing-guide.html` ต้นทาง (ตรวจซ้ำด้วย `grep -rl` ทั้ง repo — ไม่มี label 6 ปุ่มเดิมหลงเหลืออยู่ในหน้า `blog/` แม้แต่ไฟล์เดียว มีแต่ใน root-level 31 หน้าที่เป็น `.page-strip` ตั้งใจคนละจุด)
9. **สลับเครือข่าย (WiFi → 4G/5G) แล้วเปิดซ้ำ** — ยังเห็น 6 ปุ่มเดิม → ตัด router/ISP เฉพาะ WiFi บ้านออก (ถ้าเป็น proxy เฉพาะเครือข่ายใดเครือข่ายหนึ่ง อีกเครือข่ายต้องหาย)
10. **เช็ค iCloud Private Relay** (ตั้งค่า > [ชื่อ Apple ID] > iCloud) — **ปิดอยู่** → ตัดออก
11. **เช็ค VPN** (ตั้งค่า > VPN) — **ไม่มีตัวเปิด** → ตัดออก
12. **เช็คแอป DNS-filter** (NextDNS/AdGuard/1.1.1.1 ฯลฯ) — **ไม่มีลงไว้** → ตัดออก
13. **ปิดแท็บ Safari เดิมทิ้งทั้งหมด (สไลด์ทิ้งจริง ไม่ใช่แค่ reload) แล้วเปิดแท็บใหม่พิมพ์ URL เอง** — ยังเห็น 6 ปุ่มทุกหน้า → ตัดทฤษฎี "แท็บเก่าค้าง ไม่ได้โหลดใหม่จริง" ออก
14. **เช็ค Safari Extensions** (ตั้งค่า > Safari > Extensions) — **ว่างเปล่า ไม่มีเปิดสักตัว** → ตัดออก (ตัดทฤษฎี content-blocker/แปลภาษา extension แก้ไข response)
15. **เช็ค Configuration Profile / MDM** (ตั้งค่า > ทั่วไป > VPN และการจัดการอุปกรณ์) — **ไม่มีโปรไฟล์ติดตั้งอยู่เลย** → ตัดออก

**สรุปสถานะหลังรอบ 3:** ทฤษฎีที่ตรวจได้จากภายนอก (โค้ด/เซิร์ฟเวอร์/เครือข่าย/การตั้งค่าเครื่อง) **หมดแล้วทุกข้อ ไม่มีเหลือ** — ยืนยันแล้วว่า:
- โค้ดในเว็บถูกต้อง 100% (ไม่มี label/โครงสร้าง 6 ปุ่มเดิมหลงเหลือในหน้าที่ทดสอบ)
- ไม่ใช่ปัญหาเครือข่าย/proxy/DNS/VPN/Private Relay (สลับเครือข่ายแล้วอาการเหมือนเดิม)
- ไม่ใช่แท็บ/แคชที่ Safari เคลียร์ปกติเคลียร์ถึง (ปิดแท็บจริง+เปิดใหม่แล้วอาการเหมือนเดิม)
- ไม่ใช่ extension หรือ profile บนเครื่อง

**🎯 ขั้นตอนเดียวที่เหลือ — ต้องดู DOM/Console/Network จริงบนเครื่อง Lin เท่านั้น (ทดสอบแบบอื่นหมดแล้ว):**

ต่อ iPhone เข้า Mac ด้วยสาย USB/Lightning แล้วใช้ Safari Web Inspector:
1. **บนไอโฟน:** ตั้งค่า → Safari → เลื่อนลงล่างสุด → Advanced → เปิด **Web Inspector**
2. เสียบสาย iPhone เข้า Mac ถ้าขึ้น "Trust This Computer?" ให้กด Trust + ใส่รหัสมือถือ
3. **บน Mac:** เปิดแอป Safari (ของ Mac ไม่ใช่ของมือถือ) → เมนู Safari (มุมบนซ้าย) → Settings → แท็บ Advanced → ติ๊ก "Show features for web developers" (หรือชื่อคล้ายกันแล้วแต่เวอร์ชัน macOS)
4. **บนไอโฟน:** เปิดแท็บใหม่ พิมพ์ `https://mrtaihualin.com/blog/typing-guide.html`
5. **บน Mac:** เมนู Develop (จะโผล่มาหลังข้อ 3) → หาชื่อเครื่อง iPhone ของ Lin ในลิสต์ → จะเห็นรายชื่อแท็บที่เปิดอยู่บนมือถือ → คลิกแท็บที่เปิดหน้านี้
6. จะเปิดหน้าต่าง Web Inspector ขึ้นมา (เห็น DOM/Console/Network ของหน้านั้นบนเครื่อง Lin จริง) ให้ Lin (หรือใครที่ทำตามขั้นตอนนี้อยู่) พิมพ์ในช่อง Console: `document.getElementById('bottom-nav')` แล้วกด Enter — **บอกผลลัพธ์ที่ได้ตรงๆ** (null / element ว่างเปล่า / element ที่มีปุ่มข้างใน)
7. เลื่อนดูแท็บ **Console** ว่ามีข้อความสีแดง (error) หรือคำว่า `[bottom-nav]` (คำเตือนที่โค้ดเขียนไว้เอง) โผล่มาไหม — คัดลอกข้อความเต็มๆ มา
8. เลื่อนดูแท็บ **Network** หา request ชื่อ `nav-template.js` กับ `shared.min.js` — สถานะ (status code) ของทั้งคู่คืออะไร ถ้าคลิกดู Response เห็นเนื้อหาจริงไหม

**เป้าหมาย:** ผล 3 อย่างนี้ (DOM ของ `#bottom-nav` / Console error / Network status) จะบอก root cause ได้ชัวร์ที่สุด เพราะเป็นสิ่งที่เกิดขึ้นจริงบนเครื่อง Lin ไม่ใช่การเดาจากภายนอกอีกต่อไป

### รอบ 4 (วันเดียวกัน 2026-08-10) — เจอ root cause จริงด้วย bookmarklet บนเครื่อง Lin โดยตรง (ไม่ต้องต่อสาย)

ใช้ bookmarklet (`javascript:` ผูกกับ Safari Bookmark) แทนการต่อสาย USB — เร็วกว่าและ Lin ทำเองได้จากมือถือ:
```
javascript:(function(){var nt=(typeof window.NAV_TEMPLATE)+'';var bn=document.getElementById('bottom-nav');var bnInfo=bn?('EXISTS len='+bn.innerHTML.length):'NULL';var ps=document.querySelector('.page-strip')?'EXISTS':'NULL';var nav=document.querySelector('nav.site-nav')?'EXISTS':'NULL';alert('NAV_TEMPLATE: '+nt+'\nbottom-nav: '+bnInfo+'\npage-strip: '+ps+'\nsite-nav: '+nav);})();
```

**ผลจริงบนเครื่อง Lin (`blog/typing-guide.html`):**
```
NAV_TEMPLATE: object
bottom-nav: EXISTS len=477
page-strip: NULL
site-nav: EXISTS
```

**🎯 พลิกทฤษฎีเดิมทั้งหมด — ไม่ใช่ปัญหา "โหลด/รัน JS ไม่สำเร็จ" อีกต่อไป:**

`#bottom-nav` **ถูกสร้างสำเร็จจริงในเครื่อง Lin** เนื้อหายาว 477 ตัวอักษร (ตรงกับที่ `renderBottomNavHTML()` ควรคืนค่าเป๊ะ — เทียบกับที่เคยรันด้วย Node ไว้ก่อนหน้านี้) — แปลว่า `data/nav-template.js` โหลดสำเร็จ, `shared.js`/`shared.min.js` รันสำเร็จ, DOM มีครบทุกอย่างถูกต้อง **ปัญหาทั้งหมดที่ตรวจมา (รอบ 1-3) เป็นการไล่ผิดทาง — ไม่ใช่ JS/network/cache/device-setting เลยสักอย่าง**

**ทฤษฎีใหม่ที่ต้องตรวจต่อ (ยังไม่ยืนยัน):** ปัญหาน่าจะเป็นแค่ **"มองไม่เห็นด้วยตา" ไม่ใช่ "ไม่มีอยู่จริง"** — สงสัยว่าแถบเครื่องมือ Safari เอง (ที่ลอยอยู่ล่างสุดจอ ยุบ/ขยายได้ มี URL bar + ปุ่มย้อนกลับ/รีเฟรช) **บังทับ `#bottom-nav` อยู่ทางสายตา** เพราะเป็นเลเยอร์ของระบบ iOS ที่วาดทับเหนือเนื้อหาเว็บ ไม่ใช่ z-index ของหน้าเว็บเอง — ภาพหน้าจอที่ Lin ส่งมาทั้ง 2 ครั้ง (ทั้งตอนเห็น "ไม่มีแถบเลย" ที่หน้า blog) ถ่ายตอนแถบเครื่องมือ Safari กำลังโชว์อยู่ล่างสุดพอดีทุกครั้ง ยังไม่เคยเห็นภาพตอนแถบเครื่องมือ Safari ยุบ/หายไปเลยสักครั้ง

**ยังไม่ได้ตรวจ:** ให้ Lin เลื่อนหน้าจอ (swipe อ่านเนื้อหา) ให้แถบเครื่องมือ Safari ยุบ/หายไปเอง แล้วดูว่า `#bottom-nav` โผล่ออกมาไหม — ถ้าโผล่ = ยืนยันทฤษฎีนี้ถูก (ไม่ใช่บั๊กโค้ด แต่เป็นพฤติกรรม UI ของ Safari ที่ทับกันพอดี ต้องแก้ด้วย CSS เพิ่ม เช่น เผื่อระยะจาก `env(safe-area-inset-bottom)` ให้พอกับความสูงแถบเครื่องมือ Safari ด้วย)

**ผลจริง:** Lin เลื่อนจอจนแถบเครื่องมือ Safari ยุบเหลือแค่ pill เล็กๆ ลอยกลางจอ (ไม่บังพื้นที่ล่างสุดแล้ว) — **`#bottom-nav` ก็ยังไม่โผล่ขึ้นมา** → **ตัดทฤษฎี "Safari toolbar บัง" ออกด้วย** ยืนยันจากภาพหน้าจอจริงว่าพื้นที่ล่างสุดของหน้าเป็นพื้นครีมเปล่าๆ ไม่มีแถบดำของ `#bottom-nav` เลย ทั้งที่ DOM ยืนยันว่ามีอยู่จริง (รอบ 4) — สรุปว่าเป็นปัญหา **CSS ทำให้แสดงผลไม่ได้จริง (display/position/z-index หรือ element หลุดจอ)** ไม่ใช่ toolbar บัง

**ตรวจโค้ดเจอจุดต้องสงสัยเพิ่ม (ยังไม่ยืนยันว่าใช่ root cause ของหน้านี้):** `js/core/shared.js` บรรทัด ~1806-1817 มีการสร้างกฎ CSS สำหรับหน้าเกม (ทำงานเฉพาะหน้าที่มี `#game-switcher` เท่านั้น — เช็คแล้ว `blog/typing-guide.html` ไม่มี `#game-switcher` เลย โค้ดส่วนนี้ไม่ควรรันบนหน้านี้) แต่พบว่าบรรทัด `'#bottom-nav{display:none !important;}'` (บรรทัด 1817) **ไม่ได้ใส่ prefix `body.rg-fake-fullscreen` เหมือนบรรทัดข้างบน** (1807-1813 ใส่ `body.rg-fake-fullscreen` หน้าทุกตัวถูกต้อง) — เป็นการ**ตั้งใจ**ให้ซ่อนถาวรบนหน้าเกม (ตามคอมเมนต์บรรทัด 1816) ไม่ใช่บั๊ก แต่เป็นจุดเสี่ยงที่ควรจดไว้เผื่อวันหลังมีหน้าไหนดันมี `#game-switcher` ติดไปโดยไม่ตั้งใจ

**ขั้นต่อไป:** ต้องดู computed style จริง (`display`/`position`/`bottom`/bounding rect) ของ `#bottom-nav` บนเครื่อง Lin ตรงๆ — ใช้ bookmarklet ตัวที่ 2 (ดูข้อความคุยกับ Lin)

**ผลจริง (bookmarklet ตัวที่ 2 — computed style):**
```
display:flex · visibility:visible · opacity:1 · z-index:998 · bottom:0px · height:60px
rect.top:0 · rect.bottom:60 · rect.height:60
window.innerH:775 · visualViewportH:775
```

**🎯 เจอจุดผิดปกติชัดเจน:** CSS ทุกค่าถูกต้องหมด (`display:flex`, `visibility:visible`, `opacity:1`, `bottom:0px` ตามที่ตั้งใจ) **แต่ bounding rect กลับอยู่ที่ `top:0 → bottom:60`** (มุมบนสุดของจอ) **ไม่ใช่ `top:715 → bottom:775`** (มุมล่างสุดของจอ ตามที่ `position:fixed;bottom:0` ควรจะเป็นเมื่อ viewport สูง 775px)

**แปลว่า:** `#bottom-nav` ถูกดันไปวางไว้ที่ "บนสุด" ของ containing block แทนที่จะเป็น "ล่างสุดของจอ" — ทฤษฎีที่เป็นไปได้มากที่สุด: มี ancestor บางตัว (`body`/`html` หรือ element ที่ห่อ) ตั้งค่า `transform`/`filter`/`perspective`/`will-change:transform`/`contain` ทำให้กลายเป็น containing block ใหม่ของ `position:fixed` (เป็นพฤติกรรมมาตรฐานของ CSS ที่คนไม่ค่อยรู้ — ถ้า ancestor มีคุณสมบัติเหล่านี้ `position:fixed` จะยึดตำแหน่งกับ ancestor นั้นแทนวิวพอร์ต) **ยังไม่ยืนยันตัวการจริง ต้องเช็คต่อ**

**ขั้นต่อไป:** bookmarklet ตัวที่ 3 — ไล่ดู ancestor ของ `#bottom-nav` ทีละชั้นว่าตัวไหนมี transform/filter/perspective/will-change/contain ติดอยู่

**ตรวจโค้ดเพิ่ม (ระหว่างรอผล):** ไล่หา `transform`/`filter`/`perspective`/`will-change`/`contain` บน `body`/`html` ทั้ง `css/shared.css` และ `js/core/shared.js` แล้ว **ไม่เจอเลยสักจุด** (`grep` ทั้ง 2 ไฟล์ว่าง) — ตัดทฤษฎี "containing block จาก transform" ออกแบบตรงไปตรงมาไม่ได้

**🎯 ทฤษฎีใหม่ที่น่าจะเป็นไปได้สูง (ยังไม่ยืนยัน แต่มีหลักฐานทางอ้อมสนับสนุน):** `css/shared.css` บรรทัด 15 — **`body { ... overflow-x:hidden; ... }`** — นี่คือบั๊กเก่าที่มีการบันทึกไว้ใน WebKit/iOS Safari: การตั้ง `overflow` (โดยเฉพาะ `overflow-x`) ไว้ที่ `<body>` หรือ `<html>` โดยตรง **ทำให้ `position:fixed` ของลูกหลานเพี้ยน** กลายเป็นเหมือน `position:absolute` ที่ยึดกับเอกสารทั้งหน้าแทนวิวพอร์ต — ตรงกับอาการเป๊ะ: ถ้า scroll อยู่ที่บนสุดตอนรัน bookmarklet (`rect.top:0`) จะได้ผลแบบที่เห็นพอดี (เหมือนอยู่ที่จุดเริ่มต้นของเอกสาร ไม่ใช่จุดเริ่มต้นของจอ)

**วิธียืนยัน (เชื่อถือได้ที่สุด — ไม่ต้องเดา):** ให้ Lin **เลื่อนหน้าจอลงไปกลางบทความ** แล้วรัน bookmarklet ตัวที่ 2 (computed style) **ซ้ำอีกครั้ง** — ถ้า `rect.top`/`rect.bottom` เปลี่ยนตามตำแหน่ง scroll (เช่นกลายเป็นค่าติดลบมากๆ) = ยืนยันว่า `#bottom-nav` "เลื่อนไปกับหน้า" ไม่ใช่ "ลอยตรึงกับจอ" จริง ⇒ ตัวการคือ `overflow-x:hidden` บน `body` แน่นอน 100%

**ผลจริง:** เลื่อนจอลงไปกลางบทความแล้วรันซ้ำ — ได้ค่า **เดิมเป๊ะทุกตัวเลข** (`rect.top:0 / rect.bottom:60` เท่ากับตอนอยู่บนสุดของหน้า) → **ตัดทฤษฎี `overflow-x:hidden` ออก** เพราะถ้าใช่ ค่าต้องเปลี่ยนตาม scroll แต่ไม่เปลี่ยนเลย = พิสูจน์ว่า `#bottom-nav` ยึดติดกับจอจริง (`position:fixed` ทำงานถูกต้อง) เพียงแต่ยึดกับ **"บนสุดของจอ" ไม่ใช่ "ล่างสุดของจอ"**

### 🎯 ROOT CAUSE เจอแล้ว — ยืนยันด้วยโค้ดจริง (ไม่ใช่การเดา)

`css/shared.css` **บรรทัด 18** มี selector ที่เป็น **`nav` เฉยๆ (bare tag selector ไม่ใช่ `.site-nav`)**:
```css
nav { position:fixed; top:0; left:0; right:0; height:var(--nav-h); ...; z-index:999; ... }
```
กฎนี้ตั้งใจไว้สำหรับแถบ nav บนสุด (`<nav class="site-nav">`) แต่เพราะเขียนเป็น `nav` เฉยๆ (ไม่ใส่ `.site-nav`) **มันจึงจับกับ `<nav>` ทุกตัวในหน้า** รวมถึง `#bottom-nav` ด้วย — เพราะ `#bottom-nav` ที่ `js/core/shared.js` สร้างขึ้นก็เป็นแท็ก `<nav>` เหมือนกัน (`document.createElement('nav')`)

**ทำไมถึงเพี้ยนแบบนี้:** CSS ให้แต้ม specificity **แยกทีละ property** ไม่ใช่ทั้งก้อน — กฎ `#bottom-nav{...}` ที่ `shared.js` ฉีดเข้าไป (ID selector specificity สูงกว่า tag selector) เขียนแค่ `bottom:0;height:60px;z-index:998` **ไม่เคยเขียน `top` เลยสักครั้ง** ดังนั้น `top:0` จากกฎ `nav{}` ตัวเดิม (specificity ต่ำกว่า) จึงไม่ถูกทับ ยังหลงเหลืออยู่ — ผลคือ `#bottom-nav` มีทั้ง `top:0` และ `bottom:0` และ `height:60px` พร้อมกัน (over-constrained) ซึ่งตามสเปก CSS มาตรฐาน **`top` ชนะเสมอ `bottom` ถูกเมิน** → เรนเดอร์ที่ `top:0 → height:60px` (บนสุดของจอ) แทนที่จะเป็น `bottom:0` (ล่างสุดของจอ) **ตรงกับผลทดสอบทุกตัวเลขเป๊ะ** (`rect.top:0, rect.bottom:60` ทั้ง 2 รอบ ไม่ว่าจะ scroll ตำแหน่งไหน — เพราะ `position:fixed` ทำงานถูกต้องจริง แค่ยึดผิดขอบ)

**ทำไมหน้า root (index.html ฯลฯ) ถึงเห็น "6 ปุ่มเดิม":** เพราะ `#bottom-nav` ไปเรนเดอร์อยู่ที่ขอบบนของจอ (ทับ/ปนกับ `.site-nav` เดิมที่ก็อยู่ขอบบนเหมือนกัน จอเล็กอาจมองไม่ทันสังเกตว่ามี 2 ชั้นซ้อนกัน) — ส่วนขอบล่างที่ควรมี `#bottom-nav` ว่างเปล่า จึงเห็น `.page-strip` (โค้ดเดิม ไม่เกี่ยวกับบั๊กนี้ อยู่ขอบล่างจริงตามที่ตั้งใจ z-index 990) โผล่แทน — หน้า blog ไม่มี `.page-strip` เลย ขอบล่างเลยว่างเปล่าสนิท ตรงกับทุกอาการที่ Lin เจอ

**⚠️ นี่ไม่ใช่บั๊กเฉพาะเครื่อง Lin — เป็นบั๊กที่กระทบผู้เข้าชมเว็บทุกคนบนมือถือ ทุกเบราว์เซอร์ ตั้งแต่ deploy ฟีเจอร์นี้ 2026-08-09** (เป็นกฎ CSS ล้วนๆ ไม่เกี่ยวกับ cache/เครือข่าย/อุปกรณ์ใดๆ เลย) — สาเหตุที่ตรวจก่อนหน้านี้ (รอบ 1-4) ไม่เจอเพราะเคยเช็คแค่ `getComputedStyle().display === 'flex'` (ว่า "โชว์ไหม") ไม่เคยเช็ค `getBoundingClientRect()` (ว่า "โชว์ตรงไหน") มาก่อนเลย

**วิธีแก้ (จุดเดียว ตรงต้นเหตุ):** เพิ่ม `top:auto;` เข้าไปในกฎ `#bottom-nav{...}` ที่ `js/core/shared.js` (บรรทัด 179) เพื่อทับค่า `top:0` ที่รั่วมาจากกฎ `nav{}` ของ `css/shared.css` อย่างชัดเจน — ไม่แตะ `css/shared.css` เลย (กันกระทบ `.site-nav` เดิม)

**✅ แก้แล้ว (โค้ด local เท่านั้น — ยังไม่ push):**
1. `js/core/shared.js` บรรทัด 179 — เพิ่ม `top:auto;` ในกฎ `#bottom-nav{...}` พร้อมคอมเมนต์อธิบาย root cause ไว้กันลืม
2. รัน `npx terser js/core/shared.js --compress --mangle` ใหม่ → `js/core/shared.min.js` (เช็คแล้วมีคำว่า `top:auto` อยู่ในไฟล์ minify ด้วย)
3. bump cache-buster `shared.min.js?v=20 → v=21` ครบ 77 ไฟล์ (รวมไฟล์ backup ใน `_dev/` ที่เดิมค้างที่ `v=18` ด้วย เพื่อความสม่ำเสมอ — ไฟล์ `_dev/` ไม่ถูก track โดย git อยู่แล้วตาม `.gitignore`)
4. `node scripts/check-site.js` ผ่านทุกหมวด (JS syntax 86 ไฟล์ / HTML 109 ไฟล์ / CSS 6 ไฟล์ / data-health / secret-scanner) — ที่ไม่ผ่าน 6 รายการเป็น secret scan เก่าในโฟลเดอร์ `เลิกใช้แล้ว_ห้ามรัน/` ไม่เกี่ยวกับรอบนี้ (เดิมเป็นแบบนี้อยู่แล้วก่อนแก้)

**ยังไม่ได้ทำ (รอ Lin):**
- ~~push ผ่าน GitHub Desktop~~ ✅ **push สำเร็จจริงแล้ว** — commit `9236882` · ยืนยันจาก `.git/refs/heads/main` = `.git/refs/remotes/origin/main` ตรงกันเป๊ะ + มีบรรทัด `update by push` ล่าสุดชี้ไปที่ commit นี้จริง
  > ⚠️ **บทเรียน:** รอบแรก Lin บอกว่า "push แล้ว" แต่ตรวจ `.git/logs/refs/remotes/origin/main` พบว่า commit ยังค้างอยู่ในเครื่อง — GitHub Desktop มี 2 ปุ่มแยกกัน (Commit to main → Push origin) กด commit แล้วยังไม่ได้กด push · **ครั้งหน้าที่ Lin บอกว่า push แล้วแต่เว็บยังไม่เปลี่ยน ให้เช็ค 2 ไฟล์นี้ก่อนเป็นอันดับแรกเสมอ ใช้เวลา 5 วินาที ตัดปัญหาได้ทันทีโดยไม่ต้องไล่หาสาเหตุอื่น**
- **ยังไม่ยืนยัน:** เปิดเว็บจริงบนเครื่อง Lin ดูว่า `#bottom-nav` ขึ้นที่ขอบล่างจริงหรือยัง (รอ GitHub Pages build ~1-2 นาทีหลัง push ก่อน แล้วเปิด `blog/typing-guide.html` — URL ใหม่ v=21 ไม่ต้องกลัวแคชเก่า)
- ลบ bookmark `DEBUG` ทิ้งได้ (ใช้เสร็จภารกิจแล้ว)

### รอบ 5 (2026-08-10) — ปิดเคส: แถบ 4 ไอคอนขึ้นแล้วจริง + แก้อาการ "แถบ 6 ปุ่มเก่าแว้บตอนโหลดหน้า"

**✅ ยืนยันจากเครื่อง Lin จริง:** หลัง push commit `9236882` แถบ `#bottom-nav` 4 ไอคอนขึ้นที่ขอบล่างถูกต้องแล้ว — **ปิดเคสหลักที่ค้างมาตั้งแต่ 2026-08-09**

**อาการต่อเนื่องที่ Lin เจอหลังจากนั้น:** กด 🏠 首頁 หรือ 🎮 遊戲 แล้วระหว่างหน้าใหม่กำลังโหลด จะเห็น **แถบ 6 ปุ่มเก่า (`.page-strip`) แว้บโผล่ขึ้นมาก่อนแป๊บนึง แล้วหายไปเอง**

**สาเหตุ (ยืนยันแล้ว ไม่ใช่การเดา):** `.page-strip` เขียนเป็น static HTML อยู่ในไฟล์ `.html` ตรงๆ → เบราว์เซอร์วาดออกมา**ทันที**ตั้งแต่วินาทีแรกที่หน้าเริ่มโหลด · ส่วน `#bottom-nav` ถูกสร้างด้วย JS ต้องรอ `shared.min.js` (~115KB) โหลด+รันเสร็จก่อน → **ช่วงรอยต่อนี้จึงเห็นแถบเก่าก่อนเสมอ** (บนมือถือเน็ตช้ายิ่งเห็นชัด)

**วิธีแก้ (Lin อนุมัติ 2026-08-10):** ซ่อน `.page-strip` บนจอมือถือด้วย CSS static ใน `css/shared.css` — เพิ่มบล็อก `@media(max-width:768px){ .page-strip{display:none;} body:has(.page-strip){padding-bottom:0;} }`
- CSS ทำงานทันทีตั้งแต่วินาทีแรก ไม่ต้องรอ JS → อาการแว้บหายสนิท
- **บนมือถือไม่มีอะไรหายไปจากสายตาเลย** เพราะเดิม `.page-strip` ถูก `#bottom-nav` บังมิดอยู่แล้ว (สูง 60px ทับ 48px · z-index 998 ทับ 990)
- คอม (>768px) ไม่กระทบเลย — `.page-strip` ยังอยู่ครบเหมือนเดิม เพราะ `#bottom-nav` ไม่โชว์บนคอมอยู่แล้ว

> 🔑 **กฎถาวรที่ต้องจำ:** breakpoint ของ `.page-strip{display:none}` (`css/shared.css`) **ต้องตรงกับ** `@media(max-width:768px){#bottom-nav{display:flex}}` (`js/core/shared.js`) **เสมอ** — ถ้าวันหลังแก้ตัวใดตัวหนึ่งโดยไม่แก้อีกตัว จะเกิด "ช่วงความกว้างจอที่ไม่มีแถบล่างเลย" หรือ "มี 2 แถบซ้อนกัน" (เขียนคอมเมนต์เตือนไว้ในไฟล์ทั้ง 2 จุดแล้ว)

**ไฟล์ที่แก้รอบ 5:** `css/shared.css` (เพิ่มบล็อก media query 768px) · bump `shared.css?v=14 → v=15` ครบ 77 ไฟล์ · `MAINTENANCE.md`

**ผลตรวจ:** `node scripts/check-site.js` ผ่านทุกหมวด (JS 87 ไฟล์ / HTML 109 ไฟล์ / CSS 6 ไฟล์ / data-health / behavioral tests)
- ไม่ผ่าน 7 รายการ **ไม่เกี่ยวกับรอบนี้ทั้งหมด**: 6 รายการเป็น secret scan เก่าในโฟลเดอร์ `supabase/sql/เลิกใช้แล้ว_ห้ามรัน/` (มีมาก่อนหน้านี้) · อีก 1 รายการคือ `js/core/supabase-config.staging.js` ซึ่งเป็นไฟล์ของงาน staging (P7-02) **ที่ `.gitignore` บรรทัด 49 ล็อกไว้ไม่ให้ commit อยู่แล้ว** จึงไม่มีค่าลับหลุดขึ้น GitHub — เป็น false positive ของตัวสแกน (สแกนไฟล์ในเครื่องทั้งหมดไม่ได้เช็ค .gitignore)

### รอบ 6 (2026-08-10) — ย้ายแถบล่างมือถือเป็น static HTML ทุกหน้า (แก้อาการ "กระพริบ/โหลด 2 รอบ")

**อาการ (Lin เจอหลังรอบ 5):** กดปุ่ม 🎮 遊戲 แล้วเข้าหน้า `games.html` ถูกต้อง **แต่หน้ากระพริบเหมือนโหลด 2 รอบ**

**สาเหตุ (โครงสร้าง ไม่ใช่บั๊กพิมพ์ผิด):** `#bottom-nav` ถูกสร้างด้วย JS ใน `shared.js` → ต้องรอ `shared.min.js` (~115KB) โหลด+รันเสร็จก่อนเสมอ · ทุกครั้งที่เปลี่ยนหน้าบนมือถือ layout จะขยับ 1 ครั้ง (แถบสูง 60px โผล่เพิ่มเข้ามา + `body{padding-bottom}` เปลี่ยน) = ตาเห็นเป็น "กระพริบ" · `games.html` เห็นชัดสุดเพราะโหลดสคริปต์อื่นคั่นก่อน `shared.min.js` ถึง 4 ตัว

**วิธีแก้ (Lin เลือกเอง 2026-08-10 — ทางที่แก้ที่ต้นเหตุจริง):** ทำให้แถบล่างเป็น **static HTML + static CSS เหมือนเมนูบนสุด** ไม่ต้องรอ JS อีกต่อไป (แนวทางเดียวกับ decision 2026-07-24 เรื่อง SEO/GEO)
1. **`scripts/generate-nav.js`** — เพิ่มหน้าที่ใหม่: เขียน `<nav id="bottom-nav">…</nav>` ลงก่อน `</body>` ของทุกหน้า (มีอยู่แล้วให้พิมพ์ทับ ยังไม่มีให้แทรก) · ยังคง idempotent (รันซ้ำแล้วไม่แก้ไฟล์ซ้ำ — ทดสอบแล้ว รอบ 2 ขึ้น "แก้ไฟล์จริง: 0 หน้า")
2. **`css/shared.css`** — ย้ายกฎ CSS ของ `#bottom-nav` ทั้ง 7 บรรทัดมาจาก `shared.js` **แบบคัดลอกตรงตัวทุกอักขระ** (หน้าตาเหมือนเดิมเป๊ะ ไม่เปลี่ยนอะไรเลย) · ⚠️ ขั้นตอนนี้ขาดไม่ได้ ถ้าเขียน HTML แต่ไม่ย้าย CSS แถบจะโผล่มาแบบ "ไม่มีสไตล์" เป็นก้อนลิงก์ต่อท้ายหน้าก่อน แล้วค่อยกระโดดไปขอบล่าง = กระพริบหนักกว่าเดิม
3. **`css/shared.css`** — เพิ่ม `body:has(#game-switcher) #bottom-nav{display:none !important;}` ให้หน้าเกม 8 หน้าซ่อนแถบตั้งแต่วินาทีแรก (เดิมพึ่ง JS ซ่อนอย่างเดียว ซึ่งพอแถบเป็น static แล้วจะเห็นแวบก่อนถูกซ่อน) · กฎเดิมใน `shared.js` คงไว้ ไม่ได้ลบ (ทำงานซ้ำกันได้ ไม่มีผลเสีย)
4. **`js/core/shared.js`** — เพิ่มด่านบรรทัดเดียวบนสุดของก้อนนี้: `if (document.getElementById('bottom-nav')) return;` (มีอยู่แล้วในหน้า = ไม่สร้างซ้ำ ไม่ใส่ CSS ซ้ำ) · โค้ดสร้างแถบเดิม**เก็บไว้เป็นทางสำรอง** สำหรับหน้าใหม่ในอนาคตที่ยังไม่ได้ผ่าน `generate-nav.js`

**หลักฐาน:** `node scripts/generate-nav.js` → ตรวจ 75 หน้า เพิ่ม `<nav id="bottom-nav">` ใหม่ 75/75 หน้า · รันซ้ำได้ 0 การเปลี่ยนแปลง (idempotent จริง) · ตรวจทุกไฟล์แล้วไม่มีหน้าไหนมี `<nav id="bottom-nav">` เกิน 1 อัน · ยืนยันด่านกันสร้างซ้ำมีอยู่ใน `shared.min.js` จริงหลัง minify · `node scripts/check-site.js` ผ่านทุกหมวด (7 รายการที่ไม่ผ่านเป็นของเดิมทั้งหมด ไม่เกี่ยวรอบนี้)

**ไฟล์ที่แก้รอบ 6:** `scripts/generate-nav.js` · `css/shared.css` · `js/core/shared.js` + `js/core/shared.min.js` (rebuild ด้วย terser) · ไฟล์ `.html` 75 หน้า (เพิ่มแถบล่าง + bump `?v=`) · bump `shared.min.js v=21→v=22` และ `shared.css v=15→v=16` ครบ 77 ไฟล์

**ยังไม่ยืนยัน:** ยังไม่ได้ทดสอบบนมือถือจริงหลังรอบนี้ (ต้อง push ก่อน) — สิ่งที่ต้องเช็ค: (1) กด 首頁/遊戲 สลับไปมา ไม่กระพริบแล้ว (2) หน้าเกม 8 หน้า (เช่น `tone-finder.html`) **ต้องไม่มี**แถบล่างโผล่เลยแม้แต่แวบเดียว (3) คอมยังเห็นแถบ 6 ปุ่ม `.page-strip` เหมือนเดิม

**ผลทดสอบจริง (Lin เช็คบนมือถือหลัง push):** แถบล่างไม่กระพริบแล้ว **แต่หน้ายังกระพริบอยู่** — ไล่ต่อพบว่าเป็น **คนละตัว** ดูรอบ 7

### รอบ 7 (2026-08-10) — ย้าย "แถบประกาศด้านบน" เป็น static HTML ด้วย (ตัวการที่เหลือของอาการกระพริบ)

**ยืนยันจาก Lin:** "แถบทองโผล่ทีหลัง เนื้อหาด้านล่างเลื่อนลง" — คือแถบประกาศหมุนเวียน `.avail-band` (🎁 首堂 30 分鐘體驗課免費 …)

**สาเหตุ (โครงสร้างเดียวกับแถบล่างเป๊ะ):** `js/core/shared.js` สร้าง `<div class="avail-band">` ด้วย JS แล้ว `document.body.insertBefore(band, document.body.firstChild)` = **แทรกเข้าเป็นลูกตัวแรกของ `<body>`** → พอ `shared.min.js` โหลดเสร็จ **เนื้อหาทั้งหน้าถูกดันลงมาพร้อมกันทีเดียว** (layout shift ใหญ่ที่สุดในหน้า) = ตาเห็นเป็น "โหลด 2 รอบ"

**วิธีแก้ (Lin เลือก — ทางเดียวกับแถบล่าง):**
1. **ย้ายข้อมูลประกาศ (`ANN`) จาก `js/core/shared.js` → `data/nav-template.js`** ให้เป็น single source เดียวกับเมนู · เพิ่ม `renderAnnRowHTML(i)` (เนื้อในสไลด์) + `renderAnnBandBlockHTML()` (ก้อน static เต็ม)
   > ✏️ **ตั้งแต่นี้ไป แก้ข้อความประกาศที่ `data/nav-template.js` เท่านั้น แล้วรัน `node scripts/generate-nav.js`** (เดิมแก้ที่ `shared.js`)
2. **`scripts/generate-nav.js`** — เขียนก้อนแถบประกาศลงต่อจาก `<body>` ของทุกหน้า · ห่อด้วยคอมเมนต์ `<!--ANN-BAND:START-->…<!--ANN-BAND:END-->` เพื่อพิมพ์ทับได้แม่นยำ (**ห้ามใช้ regex จับ `<div>…</div>` ตรงๆ เพราะข้างในมี `<div>` ซ้อนหลายชั้น จะตัดผิดที่**)
3. **`js/core/shared.js`** — เลิกสร้าง/แทรกแถบเอง เหลือหน้าที่แค่ "หมุนสไลด์ + ปุ่มลูกศร + ปุ่มปิด" · ใช้ `renderAnnRowHTML()` ตัวเดียวกับ generator (ผลลัพธ์ตรงกันทุกอักขระ ไม่กระตุกตอนสไลด์แรกเปลี่ยน) · โค้ดสร้างแถบเดิมเก็บไว้เป็นทางสำรองสำหรับหน้าที่ยังไม่ผ่าน generator
4. **กันแถบแวบสำหรับคนที่กดปิดประกาศไปแล้ว:** ในก้อน static มี `<script>` เล็กๆ อยู่ก่อนแถบ เช็ค `sessionStorage` แล้วติดคลาส `ann-off` ให้ `<html>` ทันทีตอน parse + กฎ `html.ann-off #ann-band{display:none}` ใน `css/shared.css` — ถ้าไม่ทำข้อนี้ คนที่กดปิดไปแล้วจะเห็นแถบแวบขึ้นมาใหม่ทุกครั้งที่เปลี่ยนหน้า (เพราะ static HTML มาก่อน JS จะได้ลบ)

**หลักฐาน:** `node scripts/generate-nav.js` → 75/75 หน้าได้แถบประกาศ static · รันซ้ำ = 0 การเปลี่ยนแปลง (idempotent) · `node --check` ผ่านทั้ง `nav-template.js`/`generate-nav.js`/`shared.js`/`shared.min.js` · `check-site.js` ผ่านทุกหมวด (ที่ไม่ผ่านของเว็บจริงยังเป็น 7 รายการเดิม ไม่มีรายการใหม่)

**ไฟล์ที่แก้รอบ 7:** `data/nav-template.js` · `scripts/generate-nav.js` · `js/core/shared.js` + `shared.min.js` · `css/shared.css` · ไฟล์ `.html` 75 หน้า · bump `nav-template.js v=1→v=2` · `shared.min.js v=22→v=23` · `shared.css v=16→v=17`

> ⚠️ **เรื่องที่ต้องบอก Lin (ไม่ใช่ของรอบนี้ แต่เจอระหว่างตรวจ — เป็นงานของอีกแชท P7-02 staging):**
> มีโฟลเดอร์ `_staging-build/` และ `_staging-build-verify/` โผล่ขึ้นมาในเครื่อง (สำเนาเว็บทั้งชุด อย่างละ ~76 ไฟล์)
> · `_staging-build/` **ถูก `.gitignore` ล็อกไว้แล้ว** (บรรทัด 66) ปลอดภัย
> · `_staging-build-verify/` **ยังไม่ถูกล็อก** → ถ้า push ตอนนี้จะติดขึ้น GitHub ไปด้วยทั้งชุด **รวมถึงสำเนา `supabase-config.staging.js`** ที่ตั้งใจกันไม่ให้ขึ้น repo (repo นี้เป็น public)
> · ตัวสแกนของ `check-site.js` ฟ้องเพิ่ม 86 รายการจาก 2 โฟลเดอร์นี้ (ของเว็บจริงยังเท่าเดิม 7 รายการ)
> · **ยังไม่ได้แตะ** เพราะเป็นไฟล์ของอีกแชท (กฎห้ามหลายแชทแก้ไฟล์ชุดเดียวกัน) — Lin ตัดสินใจว่าจะเพิ่ม `_staging-build-verify/` เข้า `.gitignore` หรือลบโฟลเดอร์ทิ้ง ก่อน push รอบต่อไป
>
> **อัปเดตหลัง push:** โฟลเดอร์นี้**ถูก commit ขึ้น GitHub ไปแล้วจริง 375 ไฟล์** · ตรวจแล้ว **ไม่มีค่าลับรั่ว**: `supabase-config.staging.js` ไม่ได้ขึ้นไปด้วย (กฎ `.gitignore` จับตามชื่อไฟล์ ครอบคลุมสำเนาในโฟลเดอร์ย่อยด้วย) และไม่มี `service_role` key ที่ไหนเลย · ที่ขึ้นไปเป็นสำเนาของไฟล์ที่ public อยู่แล้วทั้งหมด → **ไม่ใช่เหตุฉุกเฉิน แต่เป็นขยะที่ต้องเก็บกวาด** · ส่งคำสั่งให้ Lin เปิดแชทใหม่จัดการแล้ว (เพิ่ม `.gitignore` + ลบโฟลเดอร์)

### รอบ 8 (2026-08-10) — Lin สั่ง "ทำทุกหน้าให้เป็น 4 ไปเลย" · ยกเลิกการซ่อนแถบล่างบนหน้าเกม

**ปัญหาที่ Lin เจอหลังรอบ 7:** เปิดหน้าเกมบนมือถือแล้ว **แถบล่างหายหมด ไม่มีทั้ง 4 ไอคอนและ 6 ปุ่ม**

**สาเหตุ (ผลข้างเคียงจากรอบ 5 — เป็นความผิดพลาดของ AI ที่ประเมินผลกระทบไม่ครบ):** หน้าเกม 8 หน้ามีกฎซ่อน `#bottom-nav` ถาวรอยู่แล้วตั้งแต่ 2026-07-12 (Lin สั่งเองตอนนั้น) · พอรอบ 5 ไปซ่อน `.page-strip` บนมือถือเพิ่ม → **หน้าเกมบนมือถือเลยไม่เหลือแถบอะไรเลย** · AI เคยเขียนไว้ในหัวข้อ "สิ่งที่ต้องเช็ค" ของรอบ 6 ว่า "หน้าเกมต้องไม่มีแถบล่างโผล่เลย" โดยเข้าใจว่านั่นคือสิ่งที่ต้องการ — **เข้าใจผิด ไม่ได้ถาม Lin ก่อน**

**การตัดสินใจของ Lin (2026-08-10):** ให้ **ทุกหน้าทั้งเว็บมีแถบ 4 ไอคอนเหมือนกันหมด รวมหน้าเกมด้วย** — ยกเลิกกฎ 2026-07-12 ที่ซ่อนแถบล่างบนหน้าเกม (เหตุผล: กฎนั้นตั้งตอนแถบล่างยังเป็นชุดเก่า 5-6 ปุ่มข้อความ กินพื้นที่เยอะบนจอเกม · ชุดใหม่ 4 ไอคอนเล็กและสะอาดกว่ามาก)

**สิ่งที่แก้:**
1. `css/shared.css` — ลบกฎ `body:has(#game-switcher) #bottom-nav{display:none !important;}` (ที่เพิ่งเพิ่มไปรอบ 6) ออก
2. `js/core/shared.js` — ลบ `'#bottom-nav{display:none !important;}'` และ `'@media(max-width:768px){body{padding-bottom:0 !important;}}'` ออกจากก้อนสไตล์หน้าเกม
   > ⚠️ **บรรทัด `'body.rg-fake-fullscreen #bottom-nav,'` ยังอยู่ ห้ามลบ** — ตอนกดปุ่ม ⛶ เต็มจอ แถบล่างต้องซ่อนเหมือนเดิม
3. ตรวจแล้วว่าปุ่มลอยมุมขวาล่างของหน้าเกม (🎮/⛶) ตั้ง `bottom:calc(68px + safe-area)` บนมือถืออยู่แล้ว = พ้นแถบ 60px พอดี ไม่ต้องแก้เพิ่ม

**หลักฐาน:** `node --check` ผ่านทั้ง `shared.js`/`shared.min.js` (rebuild ด้วย terser แล้ว) · `check-site.js` ผ่านทุกหมวด ที่ไม่ผ่านของเว็บจริงยังเป็น **7 รายการเดิม ไม่มีรายการใหม่** · หน้าเกมมี `<nav id="bottom-nav">` static ครบ

**ไฟล์ที่แก้รอบ 8:** `css/shared.css` · `js/core/shared.js` + `shared.min.js` · bump `shared.min.js v=23→v=24` · `shared.css v=17→v=18` (77 ไฟล์ของเว็บจริง ไม่แตะสำเนาใน `_staging-build*`)

> 📌 **บทเรียนของรอบนี้ (สำคัญ):** ตอนแก้ CSS ที่ "ซ่อนของ" ต้องไล่ดูก่อนเสมอว่า **มีหน้าไหนที่ของอีกชิ้นถูกซ่อนอยู่แล้วหรือเปล่า** — ซ่อน 2 ชิ้นทับกันโดยไม่รู้ตัว = หน้านั้นไม่เหลืออะไรเลย · และถ้า AI เขียนใน "สิ่งที่ต้องเช็ค" ว่า "ต้องไม่มี X" ต้องมั่นใจว่านั่นคือสิ่งที่ Lin ต้องการจริง ไม่ใช่แค่ผลที่โค้ดจะเป็น — ถ้าไม่ชัวร์ต้องถามก่อน

**ทฤษฎีเดิม (bump cache-buster) ตรวจแล้วว่าไม่ใช่สาเหตุ — ห้ามเชื่อซ้ำ:**
`MAINTENANCE.md` (2026-08-08 บรรทัด 61 ตอนนั้น) บันทึกว่าเคย bump `v=17→v=18` **ครบทั้ง 76 ไฟล์** → ก่อน push 2026-08-09 ทุกไฟล์อยู่ที่ `v=18` เท่ากันหมด แล้ว 31 ไฟล์ (รวม `index.html`) ถูก bump เป็น `v=19` ตอน push เมื่อวาน = **URL ที่เบราว์เซอร์ Lin ไม่เคยโหลดมาก่อนเลย** แคชเก่าจึงไม่มีทางถูกใช้ · ตรวจของจริงบนเว็บซ้ำแล้วด้วย: `https://mrtaihualin.com/data/nav-template.js?v=1` และ `shared.min.js?v=19` มีอยู่จริง (200) และเมนูบนสุดชุดใหม่ (遊戲/學習資源/關於我 + 免費試聽) ขึ้นบนเว็บสดแล้ว
→ **สาเหตุที่น่าจะเป็นที่สุดของอาการเมื่อวาน: Lin เปิดดูเร็วเกินไป** GitHub Pages build ใช้เวลา 1-2 นาที ถ้าเปิดตอนนั้นจะได้ `index.html` ตัวเก่า (v=18 ไม่มี `nav-template.js`) → `#bottom-nav` ถูกสร้างแต่ว่างเปล่า → เห็น `.page-strip` 6 ปุ่มเดิมพอดีเป๊ะกับอาการ

**บั๊กจริงที่เจอระหว่างสืบ (คนละเรื่อง แต่ต้องแก้):**
มี **44 ไฟล์ `.html` (เกือบทั้งหมดคือ `blog/`)** ที่โหลด `shared.min.js?v=18` แต่ **ไม่โหลด `data/nav-template.js` เลย** (commit เมื่อวานแตะแค่ 31 ไฟล์ที่มี nav block) → `shared.js` หา `window.NAV_TEMPLATE` ไม่เจอ → สร้าง `<nav id="bottom-nav">` **เปล่าๆ** ต่อท้าย body แต่ CSS ยังดัน `body{padding-bottom:60px}` บนมือถืออยู่ = **ทุกหน้าบล็อกมีช่องว่าง 60px ท้ายหน้าบนมือถือ โดยไม่มีปุ่มสักปุ่ม และเงียบสนิท**

**สิ่งที่แก้:**
1. เพิ่ม `<script src="../data/nav-template.js?v=1"></script>` ก่อน `shared.min.js` ใน 44 ไฟล์บล็อก → ตอนนี้ทุกหน้าที่โหลด `shared.min.js` มี `nav-template.js` ครบ 75/75 ไฟล์
2. `js/core/shared.js` — เพิ่มด่านกัน "แถบเปล่า": ไม่มี `NAV_TEMPLATE` = **ไม่สร้างแถบ ไม่ใส่ CSS เลย** + `console.warn` เตือนดังๆ (กฎ RELIABILITY FIRST ข้อ "ห้ามเงียบ") เดิมสร้างแถบเปล่าแล้วปล่อยผ่าน · regenerate `shared.min.js` ด้วย `bash scripts/build-minjs.sh` (terser)
3. bump `shared.min.js?v=18`/`v=19` → **`v=20` ครบทั้ง 75 ไฟล์** (เนื้อหา `shared.min.js` เปลี่ยนจริงรอบนี้ จึงต้อง bump ตามธรรมเนียม) · `nav-template.js` ไม่ได้แก้เนื้อหา จึงคง `v=1`

**หลักฐาน:** `node scripts/check-site.js` ผ่านทุกหมวด (JS syntax 85 ไฟล์ · HTML 109 ไฟล์) — ที่ไม่ผ่าน 6 รายการเป็นของเดิมมาก่อนรอบนี้ทั้งหมด (secret scan เจอ JWT ในไฟล์เก่าโฟลเดอร์ `supabase/sql/เลิกใช้แล้ว_ห้ามรัน/` ยังไม่ได้ล้าง) · ตรวจซ้ำว่าไม่มีไฟล์ไหนโหลด `shared.min.js` แล้วขาด `nav-template.js` (ผลว่าง) · `require('./data/nav-template.js').renderBottomNavHTML()` คืน 4 ปุ่ม 首頁/試聽/遊戲/我的 ยาว 477 ตัวอักษร

**ยังไม่ยืนยัน:** ยังไม่ได้เปิด mrtaihualin.com บนมือถือจริงหลังรอบนี้ (ต้อง push ก่อน) — ถ้า push แล้วรอ 2 นาที เปิดมือถือแล้วยังไม่เห็น 4 ปุ่ม ขั้นต่อไปคือต่อ iPhone เข้า Mac ด้วยสาย → Safari บน Mac → เมนู Develop → เลือกเครื่อง → เปิด Web Inspector ของแท็บนั้น ดู error จริงบนเครื่องนั้น (แม่นกว่าเดา)

**ไฟล์ที่แก้:** `js/core/shared.js` + `js/core/shared.min.js` · 44 ไฟล์ใน `blog/` (เพิ่ม script tag + bump v) · 31 ไฟล์เดิม (bump v อย่างเดียว)

## 2026-08-09 (ต่อ) — แก้ error/loading message ในเกมที่เป็นภาษาไทยผิด ให้เป็นภาษาจีน + เจอ + ยังไม่ปิดเรื่อง bottom-nav มือถือ

สถานะ: **✅ ส่วนภาษาไทย→จีน push แล้วยืนยันจริง (fetch ไฟล์สดจากเว็บตรวจ) — ⚠️ ส่วน bottom-nav มือถือยังไม่ปิด ส่งต่อแชทใหม่**

Lin ตรวจเว็บหลัง push Navigation+Search MVP แล้วเจอ 2 เรื่อง:

**(1) error/loading message ในเกมเป็นภาษาไทย — แก้เสร็จแล้ว:** `js/games/game-content-client.js` (สร้าง 2026-08-02) เขียนข้อความที่โชว์ให้ผู้เล่นเห็น (loading banner, error banner, ปุ่ม retry/กลับหน้าเกม/ทัก LINE) เป็นภาษาไทยทั้งหมด ทั้งที่เว็บนี้สอนคนไต้หวัน/ฮ่องกงใช้ภาษาจีนล้วน — แปลเป็นภาษาจีนครบทุกจุดที่ผู้เล่นเห็น (comment/console.error ภายในเก็บภาษาเดิมไว้ ไม่กระทบผู้เล่น) push แล้ว ยืนยันด้วย `fetch('/js/games/game-content-client.js').then(r=>r.text())` เช็คว่ามีคำว่า "遊戲資料載入中" จริงบนเว็บสด

**(2) bottom-nav มือถือ (4 ปุ่มใหม่) ไม่ขึ้นบนมือถือจริง — ยังไม่ปิด ส่งต่อแชทใหม่แล้ว:** ตรวจบนคอม (DevTools, จำลองจอแคบ, ยืนยัน context เป็น index.html จริง) พบว่าโค้ดถูกต้องครบ — `renderBottomNavHTML()` คืนค่าถูก, `#bottom-nav` มีเนื้อหา 477 ตัวอักษรจริง, CSS media query `@media(max-width:768px){#bottom-nav{display:flex}}` ทำงานถูก (`getComputedStyle().display === 'flex'` เมื่อจอแคบจริง) — แต่บนมือถือจริง (iPhone Safari) แม้ล้างแคชเต็มรูปแบบ (Settings→Safari→Clear History and Website Data) + พิมพ์ URL ใหม่ ก็ยังเห็นแถบเก่า 6 ปุ่ม (`.page-strip`, ฟีเจอร์เดิมแยกต่างหาก ไม่เกี่ยวกับ bottom-nav) สงสัยว่าอาจมีแคชอีกเลเยอร์ที่ล้างในเครื่องมือถือไม่ถึง (เช่น CDN edge cache) — เตรียมคำสั่งเปิดแชทใหม่ให้แล้ว แนะนำให้ลอง bump cache-buster (`shared.min.js?v=19→20`, `nav-template.js?v=1→2`) เป็นตัวแรกที่ลอง ก่อนสืบลึกกว่านั้นด้วย Safari Web Inspector ผ่านสาย USB

**สิ่งที่ตรวจแล้ว ไม่ใช่บั๊ก (กันสับสนซ้ำ):** หน้าเกมจริง (มี `#game-switcher`) ซ่อน `#bottom-nav` ถาวรด้วย `!important` ตั้งใจไว้ตั้งแต่ 2026-07-12 — ไม่เกี่ยวกับปัญหานี้ (index.html ไม่มี `#game-switcher`)

**ไฟล์ที่เกี่ยวข้อง:** `js/games/game-content-client.js` (แก้แล้ว) · `js/core/shared.js`/`shared.min.js`, `data/nav-template.js`, `css/shared.css` (`.page-strip`) — รอแชทใหม่ตรวจต่อ

## 2026-08-09 — Navigation รวม + Search MVP + จัดระเบียบ games.html IA

สถานะ: **✅ push ขึ้นเว็บจริงแล้ว (ยืนยันจาก GitHub Desktop ไม่มีคอมมิตค้าง) — แต่ยังไม่เปิดเว็บจริงตรวจตาหลัง push และ Gemini fallback search ยังไม่ deploy**

Lin สั่งรวมเมนูเว็บที่เดิม hardcode ซ้ำอยู่ 31 ไฟล์ HTML แยกกัน ให้เหลือจุดแก้เดียว พร้อมลดหัวข้อเมนูบนสุดจาก 6 หมวดเหลือ 3 หมวด และเพิ่มระบบค้นหาที่เว็บไม่เคยมีมาก่อน

**Navigation:** สร้าง `data/nav-template.js` เป็น single source of truth ของเมนู (desktop dropdown + hamburger + mobile bottom-nav) แล้วเขียน `scripts/generate-nav.js` พิมพ์ทับ nav block ในไฟล์ `.html` ทุกหน้าที่เกี่ยวข้อง (30 ไฟล์) — เลือกทางนี้แทนการฉีดด้วย JS ล้วนๆ เพื่อคงเป็น static HTML ไว้ (กัน SEO/GEO เสีย ตรงกับ decision เดิมของ repo เมื่อ 2026-07-24) เมนูบนสุดเหลือ 3 หัวข้อ (遊戲/學習資源/關於我) เดิม 6 หมวด (程度測驗/關於老師/了解課程/資源分享/專業服務/聯絡我們) ยุบเป็น dropdown ย่อยใต้ 學習資源 กับ 關於我 แทน ไม่มี URL ไหนถูกย้าย · CTA เปลี่ยนจาก "預約免費體驗課" เป็น "免費試聽" · bottom-nav มือถือเหลือ 4 ปุ่ม (首頁/試聽/遊戲/我的) ปุ่ม 我的 ผูกกับ `my-progress.html` เดิม

**Search MVP:** สร้างจากศูนย์ — `data/search-index.js` (index รวมเกม/บทความ/FAQ/คอร์ส) + `js/core/search-engine.js` (rule-based matcher ฝั่ง client) + `js/core/search-ui.js` (กล่องค้นหาหน้าแรก) + `js/games/games-search-ui.js` (กล่องค้นหาเฉพาะเกมใน games.html) ทำงานได้ทันทีหลัง push ไม่ต้อง deploy อะไรเพิ่ม เพราะเป็น client-side ล้วน

**games.html IA:** แยก grid เดิมที่รวม 7 การ์ดปนกันเป็น 3 ส่วน (5 เกมเล็ก / Challenge / Lego แยก section ชัดเจน) copy การ์ดเดิมไม่เปลี่ยน แค่ย้ายตำแหน่ง

ไฟล์ที่แก้/สร้าง: `data/nav-template.js`, `scripts/generate-nav.js` (ใหม่), `data/search-index.js` (ใหม่), `js/core/search-engine.js`/`search-ui.js` (ใหม่), `js/games/games-search-ui.js` (ใหม่), `games.html`, `index.html`, `supabase/functions/search-gemini/index.ts` (ใหม่ — ยังเป็นโครงร่าง), และไฟล์ `.html` อีก 28 หน้าที่มี nav (nav block เท่านั้น)

ผลตรวจ: ยืนยัน diff จริงทีละไฟล์ผ่าน GitHub Desktop ก่อน commit (ไม่ใช่เดาจาก mtime) แยกเป็น 2 commit ตามงาน (nav 30 ไฟล์ / search+IA 7 ไฟล์) push สำเร็จยืนยันจาก GitHub Desktop ขึ้น "No local changes"

**สิ่งที่ยังไม่ทำงานจริง — ต้อง Lin ทำต่อ:** Gemini fallback search (`supabase/functions/search-gemini`) เป็นแค่โครงร่าง คอมเมนต์หัวไฟล์เขียนเองว่า "🔴 ยังไม่ deploy" และ `js/core/search-engine.js` ยังไม่มีโค้ดเรียก Edge Function นี้เลย (`geminiFallback()` เป็น stub) ต้อง (1) `supabase login` + link project (2) ตั้ง secret `GEMINI_API_KEY` จริง (3) `supabase functions deploy search-gemini` (4) เพิ่ม rate limit กัน cost บาน (5) ต่อโค้ดฝั่ง client ให้เรียกจริง — รายละเอียดเต็มที่ `Documents/Claude/Projects/Bussiness Idea/ระบบเว็บไซต์/78_ผลลัพธ์_Navigation-Search-gamesIA_push_2026-08-09.md`

**สิ่งที่ Lin ต้องทำเอง:** เปิดเว็บจริงดู 2-3 หน้า (มือถือ+คอม) ยืนยันเมนูใหม่ขึ้นถูกหลัง GitHub Pages build เสร็จ (~1-2 นาทีหลัง push) — ยังไม่มีใครตรวจด้วยตาหลัง push รอบนี้

## 2026-08-08 (Account Deletion รอบ 3) — เปลี่ยนลบบัญชีเป็น cooldown 7 วัน + อีเมลยืนยัน 3 จุด

สถานะ: **โค้ดพร้อมแล้ว (local prep เท่านั้น) — ยังไม่ deploy/ยังไม่รัน SQL รอ Mandatory Pre-Deploy Test + เลือก email provider ก่อน**

Lin ตัดสินใจเปลี่ยนจาก "confirm แล้วลบทันที" เป็น cooldown 7 วัน: ยื่นคำขอ → รอ 7 วัน (login ได้ปกติ ต้องกดยกเลิกเอง) → ครบกำหนด → cron ลบถาวรจริง (รันทุกวัน 20:00 UTC ไม่ใช่ลบตรงวินาทีที่ครบกำหนด)

ไฟล์ที่แก้/สร้าง: `supabase/functions/account-delete/index.ts` (เขียนใหม่ทั้งไฟล์ — preview/request/cancel), 🆕 `account-delete-cron/index.ts` (ลบจริงเมื่อครบกำหนด + retry อีเมลที่ส่งพลาดอย่างปลอดภัย ไม่กระทบผลการลบ), 🆕 `send-transactional-email/index.ts` (ยังไม่เลือก provider), `js/core/auth-widget.js` (banner + ปุ่มยกเลิก), 🆕 `supabase/sql/2026-08-08_account_deletion_cooldown.sql`, 🆕 `docs/ACCOUNT_DELETION_PRE_DEPLOY_CHECKLIST.md`

ผลตรวจ: `node --check` ผ่านทุกไฟล์ + `node scripts/check-site.js` ผ่านครบ (6 รายการไม่ผ่านเป็นของเดิมในโฟลเดอร์ `เลิกใช้แล้ว_ห้ามรัน` ไม่เกี่ยวกับรอบนี้)

**สิ่งที่ Lin ต้องทำเอง:** (1) เลือก email provider + สมัคร/ตั้ง secret เอง (2) ทำ Mandatory Pre-Deploy Test ให้ครบตาม checklist ด้วยบัญชีทดสอบเท่านั้น (3) ตรวจโค้ด + deploy เอง (4) รัน SQL หลัง deploy `account-delete-cron` แล้วเท่านั้น

## 2026-08-08 (P5-A รอบ 3 — แก้แคชเก่าค้าง) — ปุ่มแชร์บทความ blog/ ยังขึ้น popup ซ้อน 2 กล่องหลัง push แล้ว

สถานะ: **✅ เสร็จสมบูรณ์ — Lin push แล้ว + hard refresh ทดสอบผ่านครบ 3 จุด (iPhone Safari / คอม Safari / คอม Chrome) ยืนยันด้วยภาพหน้าจอจริงว่าคอมขึ้น popup ตรงๆ ไม่ซ้อนแล้ว**

ปัญหา: หลัง push commit รอบ 2 (แก้ให้คอมทุกเบราว์เซอร์ไป popup ตรงๆ ไม่ผ่าน `navigator.share`) แล้ว Lin ทดสอบซ้ำบนคอม (บทความใน `blog/`) ยังเจออาการเดิม — ขึ้น popup ซ้อนกัน 2 กล่อง

ตรวจโค้ดจริงแล้วพบว่า: `js/core/shared.js` (source) และ `js/core/shared.min.js` (minified) ในเครื่องมีโค้ดแก้รอบ 2 ถูกต้องครบแล้วจริง (มี `isMobileDevice` guard, ตรวจว่าเป็นมือถือก่อนถึงจะเรียก `navigator.share`) และเป็น commit ล่าสุดในเครื่อง (`e6c96de`) ตรงกับที่ Lin ยืนยันว่า push แล้ว — โค้ดฝั่งไฟล์ไม่มีปัญหา

สาเหตุที่แท้จริง: commit รอบ 2 **ไม่ได้ขยับเลข cache-buster `?v=` ของ `shared.min.js`** (ยังเป็น `v=17` เท่าเดิมกับก่อนแก้) — เบราว์เซอร์ของ Lin ที่เคยโหลดหน้าเว็บมาก่อนหน้านี้แล้ว จะแคชไฟล์ `shared.min.js?v=17` (เวอร์ชันเก่าก่อนแก้รอบ 2) ไว้ที่ URL เดิม ต่อให้เนื้อหาไฟล์บน GitHub เปลี่ยนไปแล้ว เบราว์เซอร์ก็ไม่รู้ว่าต้องโหลดใหม่เพราะ URL (รวม query string) เหมือนเดิมทุกตัวอักษร เลยยังรันโค้ดเก่าที่เช็คแค่ "มี `navigator.share` ไหม" อยู่ — ตรงกับอาการที่ Lin เจอเป๊ะ (คอมมี `navigator.share` เลยขึ้นเมนูเครื่องก่อน กดปิดแล้ว `.catch()` เด้ง popup ตามมาซ้อนอีกกล่อง)

ตรวจเพิ่มเติมเพื่อตัดสาเหตุอื่นออก: หน้าบทความใน `blog/` ไม่มีปุ่ม/handler แชร์ซ้ำซ้อนกันเอง (มีจุดเรียกเดียวจาก `shared.min.js` เท่านั้น) และ `openSharePopup()` เองก็ไม่มีการเรียก `navigator.share` ซ้อนอยู่ข้างในเลย — ยืนยันว่าไม่ใช่บั๊กจากตรรกะโค้ด แต่เป็นแคชเก่าค้างล้วนๆ

วิธีแก้: ขยับเลข cache-buster ของ `shared.min.js` จาก `?v=17` → `?v=18` ให้ครบทุกหน้าที่โหลดไฟล์นี้ (76 ไฟล์ — ตรวจด้วย grep ว่าไม่มี `v=17` เหลือค้างแล้ว) ไม่ได้แก้เนื้อหา `shared.js`/`shared.min.js` เพิ่มเติม เพราะโค้ดถูกอยู่แล้ว แค่ต้องบังคับให้เบราว์เซอร์โหลดไฟล์ใหม่

ไฟล์ที่แก้: ไฟล์ `.html` ทั้ง 76 ไฟล์ที่มี `<script src="...shared.min.js?v=17">` (bump เป็น `v=18` เท่านั้น ไม่แตะเนื้อหาอื่น)

ผลตรวจ: `node scripts/check-site.js` ผ่านทั้งหมด (819 ไฟล์)

**สิ่งที่ Lin ต้องทำเอง:** push ผ่าน GitHub Desktop แล้ว **hard refresh** (Cmd+Shift+R บน Mac หรือปิด-เปิดแท็บใหม่) ก่อนทดสอบซ้ำ 3 จุด: iPhone Safari (ต้องขึ้นเมนูเครื่อง) / คอม Safari (ต้องเป็น popup ตรงๆ ไม่มีเมนูเครื่องมาก่อน) / คอม Chrome (แบบเดียวกัน) — ถ้ายังเจอปัญหาเดิมหลัง hard refresh แปลว่าไม่ใช่แคชแล้ว ต้องแจ้งกลับพร้อมบอกว่า hard refresh แล้วจริงหรือยัง

## 2026-08-08 (P5-A ปรับตามผลทดสอบ Lin) — ปุ่มแชร์บทความ: คอมทุกเบราว์เซอร์ให้ไปกล่อง popup ตรงๆ

สถานะ: **โค้ดแก้เสร็จแล้ว รอ Lin ทดสอบซ้ำ (iPhone Safari + คอม Safari + คอม Chrome) แล้ว push**

ปัญหาที่ Lin ทดสอบเจอ: `shareBlogArticle()` เดิมเช็คแค่ "เบราว์เซอร์มี `navigator.share` ไหม" — คอมเดสก์ท็อปรุ่นใหม่ (Safari/Chrome) ก็มี `navigator.share` เหมือนกัน ไม่ใช่แค่มือถือ เลยขึ้นเมนูแชร์ของเครื่อง (native share sheet) ก่อนบนคอมด้วย ถ้า Lin กดปิดเมนูนั้น (ไม่ได้เลือกช่องทางไหน) `navigator.share().catch()` จับ error ทุกแบบรวมถึง "คนกดยกเลิก" เลยเด้งกล่อง popup (FB/LINE) ตามมาซ้อนอีกกล่อง = ได้ 2 กล่องซ้อนกัน

การตัดสินใจของ Lin: คอมทุกเบราว์เซอร์ (Safari/Chrome/Firefox) ให้ใช้กล่อง popup (FB/LINE) เสมอ ไม่ผ่าน `navigator.share` เลย ส่วนมือถือให้คงเดิม (ขึ้นเมนูเครื่องก่อน — ทดสอบผ่านแล้วบน iPhone Safari)

วิธีแก้: เปลี่ยนเงื่อนไขจาก "มี `navigator.share` ไหม" เป็น "เป็นมือถือไหม (`/Android|iPhone|iPad|iPod/i` ตรวจ user agent) และมี `navigator.share`" — เป็นมือถือถึงจะเรียก `navigator.share()` เดสก์ท็อปทุกเบราว์เซอร์ไป `openSharePopup()` ตรงๆ

ไฟล์ที่แก้: `js/core/shared.js` (หัวข้อ `[03.6] BLOG ARTICLE SHARE BUTTON`) → รัน `scripts/build-minjs.sh` แล้ว → `shared.min.js` อัปเดตแล้ว

ผลตรวจ: `node scripts/check-site.js` ผ่านทั้งหมด (819 ไฟล์)

**สิ่งที่ Lin ต้องทำเอง:** ทดสอบซ้ำ 3 จุดก่อน push — iPhone Safari (ต้องขึ้นเมนูเครื่องเหมือนเดิม) + คอม Safari (ต้องขึ้นกล่อง popup FB/LINE ทันที ไม่มีเมนูเครื่องมาก่อน) + คอม Chrome (แบบเดียวกัน) ผ่านครบแล้ว push ผ่าน GitHub Desktop (client-side ล้วน ไม่ต้อง deploy อะไรเพิ่ม)

## 2026-08-08 (บั๊กจริง #2 รอบ 3) — Lin push+รอแล้ว ยังขึ้น error เดิมบนมือถือ → เจอสาเหตุจริง: ลืม bump cache-buster

สถานะ: **✅ ปิดแล้ว — Lin ยืนยันทดสอบเชื่อม LINE ผ่านซาฟารี/มือถือสำเร็จหลัง push + hard refresh**

**สรุปทั้งเรื่อง "เชื่อม LINE ไม่สำเร็จ" (3 รอบ) — ปิดจบแล้ว 2026-08-08:**
1. รอบ 1 `invalid_client` — สาเหตุ: `line-login`/`line-webhook` อ่าน secret ชื่อชนกัน → แก้แยกชื่อ `LINE_LOGIN_CHANNEL_SECRET`
2. รอบ 2 `連結可能已經用過` (ซาฟารีคอม) — สาเหตุ: `sessionStorage` ผูกกับแท็บเดิม พังตอนสลับไปแอป LINE เดสก์ท็อปแล้วเปิดกลับมาเป็นแท็บใหม่ → เปลี่ยนเป็น `localStorage`
3. รอบ 3 error เดิมซ้ำบนมือถือ แม้ push+รอแล้ว — สาเหตุ: รอบ 2 ลืม bump cache-buster `?v=` เบราว์เซอร์/CDN เลยยังเสิร์ฟไฟล์เก่าค้าง → bump `reading-auth.js` v11→12 + `line-callback.js` v3→4

ไม่มีอะไรต้องติดตามต่อสำหรับเรื่อง "เชื่อม LINE" นี้โดยเฉพาะ — เรื่องปุ่มแชร์บทความ (`blog/`, ดูหัวข้อ P5-A ด้านบน) และ Account audit log เป็นคนละเรื่อง ติดตามแยกต่างหาก (ไม่ใช่ขอบเขตของแชทนี้)

ปัญหา: Lin push commit ของรอบ 2 (sessionStorage→localStorage) แล้ว รอสักครู่ค่อยทดสอบเชื่อม LINE บนมือถือ แต่ยังขึ้น error เดิม "這個連結可能已經用過"

ตรวจโค้ดจริงแล้ว: เนื้อหาไฟล์ `js/games/reading-auth.js` และ `js/games/line-callback.js` เปลี่ยนเป็น `localStorage` ครบถ้วนถูกต้องแล้วจริง (ไม่ใช่บั๊กใหม่ในโค้ด) — แต่พบว่ารอบแก้ 2 **ลืม bump เลขเวอร์ชัน cache-buster** ที่ต่อท้าย URL ตอนโหลดไฟล์ (เช่น `reading-auth.js?v=11`) ทั้งที่เว็บนี้มีธรรมเนียมต้อง bump ทุกครั้งที่แก้เนื้อหาไฟล์ (เคยทำมาก่อนกับ `shared.js` bump `v=16→17`) — เลขเวอร์ชันคงเดิมทำให้เบราว์เซอร์/CDN อาจยังเสิร์ฟไฟล์เก่า (มี sessionStorage) ซ้ำภายใต้ URL เดียวกัน แม้ push โค้ดใหม่ไปแล้วจริงก็ตาม ตรงกับอาการที่ Lin เจอ (error เดิมซ้ำแม้รอแล้วค่อยทดสอบ)

วิธีแก้: bump เลขเวอร์ชันใน 8 หน้า — `reading-auth.js?v=11→12` (vault.html, reading-game.html, tone-finder.html, games-challenge.html, lego.html, typing-game.html, word-order.html) + `line-callback.js?v=3→4` (line-callback.html) — ไม่แตะเนื้อหาไฟล์ JS เอง (ถูกอยู่แล้วจากรอบ 2)

ไฟล์ที่แก้: `vault.html`, `reading-game.html`, `tone-finder.html`, `games-challenge.html`, `lego.html`, `typing-game.html`, `word-order.html`, `line-callback.html` (แก้แค่เลข `?v=` ในแท็ก `<script>`)

ผลตรวจ: `node scripts/check-site.js` ผ่านทั้งหมด (819 ไฟล์)

**สิ่งที่ Lin ต้องทำเอง:** push ผ่าน GitHub Desktop (client-side ล้วน ไม่ต้อง deploy Edge Function) รอเว็บอัปเดตแล้วทดสอบเชื่อม LINE บนมือถืออีกครั้ง (เบราว์เซอร์เดิมที่เพิ่งพัง) — ถ้ายังไม่หายอีก ให้ส่งภาพหน้าจอ error จริง + บอกว่าเปิดจากในแอป LINE หรือเปิดจาก Safari/Chrome บนมือถือ

## 2026-08-08 (บั๊กจริง #2) — เชื่อม LINE ในซาฟารีพัง "連結可能已經用過" (ใช้ได้ปกติในแอป LINE)

สถานะ: **โค้ดแก้เสร็จแล้ว รอ Lin push แล้วทดสอบซ้ำในซาฟารี**

ปัญหา: หลังแก้บั๊ก invalid_client เสร็จ Lin ทดสอบเชื่อม LINE ในแอป LINE (in-app browser) สำเร็จ แต่ในซาฟารีบน Mac (เครื่องที่ลงแอป LINE เดสก์ท็อปไว้ด้วย) พังด้วย error "這個連結可能已經用過" ทุกครั้งแม้กดปุ่มสดๆ ไม่ได้เปิดลิงก์เก่าซ้ำ

สาเหตุที่แท้จริง: `line_login_state`/`nonce`/`return_to`/`link` เดิมเก็บด้วย `sessionStorage` ซึ่งผูกกับ**แท็บเดิม**เท่านั้น — ซาฟารีบนเครื่องที่มีแอป LINE เดสก์ท็อปติดตั้งอยู่ ส่งต่อการล็อกอินไปให้แอป LINE จัดการแทน แล้วเปิดหน้า redirect กลับมาเป็น**แท็บ/หน้าต่างใหม่** ไม่ใช่แท็บที่กดปุ่มไว้ตอนแรก → sessionStorage ของแท็บเดิมเข้าไม่ถึง ทำให้เช็ค state ใน `line-callback.js` พังทุกครั้ง (ไม่เกิดในแอป LINE เพราะไม่มีการสลับแท็บแบบนี้)

วิธีแก้: เปลี่ยนทั้ง 4 คีย์จาก `sessionStorage` → `localStorage` (ผูกกับ origin ไม่ใช่แท็บ ใช้ร่วมกันได้ทุกแท็บ/หน้าต่างของเบราว์เซอร์เดียวกัน) ยังลบทิ้งทันทีหลังใช้ครั้งเดียวเหมือนเดิม (กัน replay)

ไฟล์ที่แก้: `js/games/reading-auth.js`, `js/games/line-callback.js` (ไม่มี `.min.js` คู่กัน ไม่ต้อง rebuild)

ผลตรวจ: `node scripts/check-site.js` ผ่านทั้งหมด (819 ไฟล์)

**สิ่งที่ Lin ต้องทำเอง:** push ผ่าน GitHub Desktop (client-side ล้วน ไม่ต้อง deploy Edge Function) รอเว็บอัปเดตแล้วทดสอบเชื่อม LINE ในซาฟารีอีกครั้ง

## 2026-08-08 (บั๊กจริง) — เชื่อม LINE พังทันที "invalid_client / invalid client_secret"

สถานะ: **โค้ดแก้เสร็จแล้ว รอ Lin ตั้ง secret ชื่อใหม่ใน Supabase + deploy `line-login` ใหม่**

ปัญหา: Lin ทดสอบเชื่อม LINE หลัง deploy ก้อน 2 (audit log) แล้วพังทันทีด้วย `{"error":"invalid_client","error_description":"invalid client_secret"}` — ข้อความนี้มาจาก LINE เองตรงๆ (ไม่ใช่โค้ดเรา) ตอนแลก code เป็น token

สาเหตุที่แท้จริง (ตรวจโค้ดแล้ว ไม่ใช่บั๊กจาก audit log): `line-login/index.ts` และ `line-webhook/index.ts` อ่าน secret ชื่อเดียวกันคือ `LINE_CHANNEL_SECRET` ทั้งคู่ แต่เป็นคนละ LINE channel กัน (line-login = channel "LINE Login" · line-webhook = channel "Messaging API" ของบอท) — Supabase Edge Function secrets เป็นของกลางทั้งโปรเจกต์ ไม่แยกตามฟังก์ชัน ใครก็ตามที่เคยตั้ง `LINE_CHANNEL_SECRET` ใหม่เพื่อแก้ line-webhook (มีบันทึกไว้จริงตอน 2026-08-01) จะเขียนทับค่าที่ line-login ต้องใช้แบบไม่รู้ตัว

วิธีแก้: เปลี่ยนชื่อ env var ที่ `line-login/index.ts` อ่าน จาก `LINE_CHANNEL_SECRET` → `LINE_LOGIN_CHANNEL_SECRET` กันชนกันถาวร (ไม่แตะ `line-webhook` เลย ยังใช้ชื่อเดิม)

ไฟล์ที่แก้: `supabase/functions/line-login/index.ts`

**สิ่งที่ Lin ต้องทำเอง:** ดูขั้นตอนเต็มใน `Bussiness Idea/ระบบเว็บไซต์/52_คำสั่งเปิดแชทสอง_...md` เรื่องที่ 6 (ตั้ง secret ชื่อใหม่จาก channel "LINE Login" + deploy ใหม่)

## 2026-08-08 (P6-09~12 ก้อน 2) — Account audit log + ต่อสายเข้า Link LINE/Facebook

สถานะ: ✅ **เสร็จจริงแล้ว** — Lin ยืนยัน (2026-08-08 ผ่านแชท decision queue): รัน SQL สร้างตาราง `account_audit_log` แล้ว + deploy `line-login` ใหม่แล้ว (deploy ไปแล้ว ~6 ชม.ก่อนหน้าจุดยืนยันนี้ มี 4 invocations ไม่มี error) ปุ่มเชื่อม LINE/Facebook บันทึก log จริงแล้ว **ไม่ต้องทำอะไรเพิ่ม**

ปัญหา (เดิม): ระบบบัญชีผู้เล่นไม่มีตาราง audit/history เลยแม้แต่แถวเดียว — ถ้ามีปัญหาบัญชี Lin ตรวจย้อนหลังไม่ได้ว่าเกิดอะไรขึ้น (สเปกข้อ 14 ที่ Lin ให้มาบังคับว่าต้องมี)

วิธีแก้: สร้างตาราง `public.account_audit_log` (`user_id`, `event_type` — CHECK จำกัด 8 ค่าตามสเปก, `provider`, `before_state`/`after_state` jsonb, `actor_type`/`actor_id`, `created_at`) เปิด RLS แบบไม่มี policy ตั้งใจ (fail-closed) เขียนได้ทางเดียวผ่านฟังก์ชัน `log_account_audit()` (SECURITY DEFINER) ต่อสายเข้ากับจุด "เชื่อมบัญชีสำเร็จ" ที่มีอยู่แล้วจริง 2 จุด: LINE (บันทึกฝั่ง server ใน Edge Function น่าเชื่อถือกว่า) และ Facebook (บันทึกฝั่ง client เพราะไม่มี Edge Function คั่นกลาง — มีข้อจำกัด: ปิดแท็บ/เน็ตหลุดตอน redirect กลับจาก Facebook จะไม่มี log แม้เชื่อมสำเร็จจริง เป็นข้อจำกัดของสถาปัตยกรรมเดิม ไม่ใช่บั๊กใหม่)

ไฟล์ที่แก้/สร้าง: `supabase/sql/2026-08-08_account_audit_log.sql`, `supabase/functions/line-login/index.ts`, `js/core/auth-widget.js`, `supabase/sql/00_ฟังก์ชันไหนอยู่ไฟล์ไหน.md`

ผลตรวจ: `node scripts/check-site.js` ผ่านทั้งหมด (ไม่มี `.min.js` คู่กันสำหรับ 3 ไฟล์นี้)

**อัปเดต 2026-08-08 (รอบตรวจสอบ audit อิสระ):** เดิมหัวข้อนี้เขียนค้างไว้ว่า "รอ Lin รัน SQL" ทั้งที่ Lin ทำไปแล้วจริงระหว่างวัน — เอกสารไม่ได้อัปเดตย้อนหลัง แก้ให้ตรงสถานะจริงแล้ว

**ยังไม่ครอบคลุม:** Unlink (ยังไม่สร้างฟีเจอร์ รอ Lin ตัดสินใจก่อน) และ event อื่นในสเปก (เปลี่ยนอีเมล/admin correction ฯลฯ — ยังไม่มีฟีเจอร์พวกนั้นให้ log)

## 2026-08-08 (P6-09~12 ก้อน 1 บางส่วน) — เคลียร์ localStorage cache ตอน logout

สถานะ: **โค้ดแก้เสร็จแล้ว รอ Lin push** (คนละ commit จากงานอื่นวันนี้)

ปัญหา: `doLogout()` ใน `js/core/auth-widget.js` เดิมเรียกแค่ `sb.auth.signOut()` ซึ่งลบแค่ session token ของ Supabase เอง ไม่ลบ localStorage cache อื่นที่แอปเขียนเอง (`tf_avatar`, `tf_pinned_badge`, `sa_nick_prompted`, `tf_logsess_at`, `rg_last_login_provider`) — บนเครื่องสาธารณะ/ใช้ร่วมกัน คนถัดไปที่เปิดเว็บก่อนล็อกอินจะยังเห็น avatar/badge/hint "上次登入方式" ของคนก่อนหน้าค้างอยู่ (ไม่ใช่ข้อมูลลับ แต่ไม่ควรค้าง) — พบระหว่างตรวจสเปกระบบบัญชีผู้เล่นที่ Lin ส่งมา (ดู `Bussiness Idea/ระบบเว็บไซต์/49_P6-09to12_...md`)

วิธีแก้: เพิ่ม `localStorage.removeItem(...)` ทั้ง 5 คีย์เข้าไปใน `doLogout()` (4 คีย์แรกประกาศอยู่ในไฟล์เดียวกันอยู่แล้ว ส่วน `rg_last_login_provider` เป็นคีย์ของ `js/games/reading-auth.js` — เขียน literal string ตรงๆ แทนเพราะ localStorage เป็นที่เก็บกลางของเบราว์เซอร์ ไม่ต้องพึ่งฟังก์ชันไฟล์นั้น)

ไฟล์ที่แก้: `js/core/auth-widget.js` (ไม่มี `.min.js` คู่กัน ไม่ต้อง rebuild)

ผลตรวจ: `node --check js/core/auth-widget.js` ผ่าน · `node scripts/check-site.js` ผ่านทั้งหมด (818 ไฟล์)

**ยังไม่ได้ทดสอบ (ต้องให้ Lin เปิดเบราว์เศร์จริง):** ล็อกอิน → ตั้ง avatar/badge → logout → เปิด DevTools (F12) → Application → Local Storage → เช็คว่า 5 คีย์ข้างต้นหายไปจริง

**หมายเหตุ:** นี่คือแค่ส่วน "เคลียร์ cache" ของ P6-09~12 ก้อน 1 เท่านั้น — ส่วนปุ่ม "ยกเลิกการเชื่อมบัญชี" (Unlink) ยังไม่ได้ทำ เพราะมีคำถามออกแบบที่ต้องรอ Lin ตัดสินใจก่อน (ดู `52_คำสั่งเปิดแชทสอง_...md` เรื่องที่ 4)

## 2026-08-08 (SEO) — เพิ่มปุ่มแชร์บทความให้ 44 บทความใน `blog/`

สถานะ: **โค้ดแก้เสร็จแล้ว รอ Lin ทดสอบมือถือจริง + push**

Lin อนุมัติดีไซน์แบบรวม: ปุ่มเดียว "🔗 分享這篇文章" ท้ายบทความ → เบราว์เซอร์ที่รองรับ Web Share API เด้งเมนูแชร์ของเครื่องเลย → ไม่รองรับ/ถูกยกเลิก ตกไปที่กล่อง popup เดิม (ที่เพิ่งซ่อมบั๊กด้านล่าง) ซึ่งเพิ่มไอคอน Facebook/LINE ให้กดแชร์ตรงไปแต่ละช่องทางได้เลย

วิธีทำให้ครบ 44 บทความโดยไม่ต้องแก้ทีละไฟล์: เพิ่ม `autoInjectBlogShareButton()` ใน `js/core/shared.js` ทำงานเฉพาะหน้าที่ path มี `/blog/` อ่าน title/description/canonical URL ของหน้านั้นเองมาแทรกปุ่มอัตโนมัติหน้า `.related-articles`

ไฟล์ที่แก้: `js/core/shared.js` (+ regenerate `shared.min.js`), bump cache-buster `?v=16→17` ใน 76 หน้าที่โหลดไฟล์นี้ (ไม่ได้แก้เนื้อหาไฟล์บทความเองเลย)

ผลตรวจ: `node scripts/check-site.js` ผ่านทั้งหมด · ยืนยัน `openSharePopup()` ที่เพิ่ม parameter `url` แล้ว ยัง backward compatible กับจุดเรียกเดิม (`shareFBPost()`/`shareSSArticle()` ที่ยังไม่ส่ง url มา)

**ยังไม่ได้ทดสอบ (ต้องให้ Lin ทำบนมือถือ+คอมจริง):** ดูหัวข้อ "เรื่องที่ 1ข" ใน `Bussiness Idea/ระบบเว็บไซต์/52_คำสั่งเปิดแชทสอง_...md`

## 2026-08-08 (แก้บั๊กปุ่มแชร์) — ปุ่ม 🔗 分享本文 error บนเกือบทุกหน้า

สถานะ: **โค้ดแก้เสร็จแล้ว รอ Lin push**

ปัญหา: กดปุ่ม "🔗 分享本文" (แชร์โพสต์) แล้ว error `TypeError: null is not an object` บนเกือบทุกหน้าของเว็บ — ใช้ได้แค่ 4 หน้า (`index.html`, `resources.html`, `pricing.html`, `faq.html`)

สาเหตุ: กล่อง popup แชร์ (`share-bg` / `share-popup` / `share-text-area` / `share-copy-btn`) เป็น static HTML ที่ก็อปวางตรงๆ ไว้แค่ 4 หน้าเดิม ไม่ได้อยู่ในระบบแทรก modal อัตโนมัติ `injectSharedModals()` เหมือนกล่องอื่น (`modal-contact`, `modal-fbposts` ฯลฯ) — ปุ่ม "🔗 分享本文" เองถูกสร้างจากโค้ดกลางใน `shared.js` (ใช้ร่วมทุกหน้า) ดังนั้นหน้าไหนก็กดปุ่มนี้ได้ แต่พอ `openSharePopup()` ไปหา `document.getElementById('share-text-area')` ในหน้าที่ไม่มีกล่อง static ก็ได้ `null` ทันที

วิธีแก้: ย้าย HTML ของกล่องแชร์เข้าไปเป็นส่วนหนึ่งของ `injectSharedModals()` ใน `js/core/shared.js` (คัดลอกมาจากเวอร์ชันของ `index.html` เป๊ะ พร้อม guard `if (!document.getElementById('share-bg'))` แบบเดียวกับกล่องอื่น) แล้วลบ static HTML ของกล่องนี้ออกจาก 4 หน้าเดิมที่เคยมี (กัน id ซ้ำ) — ตอนนี้ทั้ง 76 หน้าที่โหลด `shared.js`/`shared.min.js` จะได้กล่องแชร์จากจุดเดียวกันหมด ไม่มีหน้าไหนขาด

ไฟล์ที่แก้: `js/core/shared.js` (+ regenerate `js/core/shared.min.js` ด้วย `scripts/build-minjs.sh`), `index.html`, `resources.html`, `pricing.html`, `faq.html` (ลบ static HTML กล่องแชร์ออก)

ผลตรวจ: `node scripts/check-site.js` ผ่านทั้งหมด (818 ไฟล์ ไม่มีค่าลับหลุด) · ตรวจด้วยตาว่า HTML ของกล่องแชร์ที่ย้ายเข้า `shared.js` ตรงกับต้นฉบับ `index.html` ทุกตัวอักษร (สี/ปุ่ม/hover ใช้ตัวแปรธีม `--gold` เดิม) · ยืนยันด้วย grep ว่าไม่มี `share-bg` static เหลือค้างซ้ำในไฟล์ไหนแล้ว
**ยังไม่ได้ทดสอบ (ต้องให้ Lin เปิดเบราว์เซอร์จริง):** กดปุ่ม "🔗 分享本文" บนหน้าที่เคยพัง เช่น `blog.html`, `games.html`, `tone-finder.html` แล้วดูว่ากล่องแชร์เปิดขึ้นมาไม่ error + ปุ่ม "一鍵複製" คัดลอกได้จริง

## 2026-08-08 (รอบดึกสุด) — "กลุ่ม 2": จำกัด CORS / แยก inline script index.html / เพิ่ม GA4+meta / ต่อ GA4 event เจอเพดาน

สถานะ: **✅ Lin push ขึ้น GitHub แล้ว + deploy CORS ครบ 6/6 ตัวแล้ว 2026-08-08** (ยืนยันจาก log จริง ทุกตัว "Deployed Functions on project qzkxlhpcputsvbqmtqfi") — เหลือ 1 อย่างที่ Lin ต้องทำเอง: เปิด mrtaihualin.com เช็คด้วยตาว่า modal วิดีโอ/FB/self-study ยังทำงานปกติ (AI ตรวจด้วยเบราว์เซอร์ไม่ได้รอบนี้)

Lin อนุมัติ "กลุ่ม 2" ทั้งชุดพร้อมกัน ("ทำเลย ทีเดียวให้หมด") สั่งทำคู่ขนาน 4 แชท (ไฟล์ไม่ชนกัน):

1. **CORS Edge Function:** จำกัดจาก `*` เหลือเฉพาะโดเมนเว็บ 6 ตัว (`lego-daily-limit`, `restore-line-student`, `unlink-line-student`, `sync-line-menu`, `notify-line`, `line-login`) ตรวจโค้ดแล้วว่าไม่มีตัวไหนรันในบริบท LIFF · ตั้งใจ**ไม่แตะ** `link-line`/`find-line-student` เพราะรันใน LIFF จริง เสี่ยงพัง LINE ถ้าจำกัด Origin ผิด — **⚠️ ยังไม่ live ต้องรัน `supabase functions deploy <ชื่อ>` ทีละตัวทั้ง 6:**
   ```
   supabase functions deploy lego-daily-limit
   supabase functions deploy restore-line-student
   supabase functions deploy unlink-line-student
   supabase functions deploy sync-line-menu
   supabase functions deploy notify-line
   supabase functions deploy line-login
   ```
   หลักฐาน `Bussiness Idea/ระบบเว็บไซต์/44_ผลลัพธ์_P7-03_จำกัดCORS.md`

2. **แยก inline script `index.html`:** ย้าย ~406 บรรทัดออกเป็น `js/acquisition/index-content-modals.js` (modal วิดีโอ/FB/self-study/share) + `js/acquisition/index-analytics.js` (GA4 tracking เฉพาะหน้า) วางตำแหน่ง `<script src>` เป๊ะจุดเดิม ไม่เปลี่ยนพฤติกรรม — **⚠️ เครื่องมือเบราว์เซอร์ใช้ไม่ได้ในรอบนี้ ตรวจได้แค่อ่านโค้ดซ้ำ ยังไม่ได้กดทดสอบจริง ขอ Lin เปิดหน้าแรกลองกด modal วิดีโอ/FB เช็ค console error สัก 1 นาทีก่อนหรือหลัง push** หลักฐาน `Bussiness Idea/ระบบเว็บไซต์/45_ผลลัพธ์_P5-A_แยกinlineScript.md`

3. **เพิ่ม GA4 + meta:** เพิ่ม GA4 ให้ 12 หน้าที่ไม่เคยมีเลย (`en/*` ทั้ง 7 หน้า, `links.html`, `vocab-cheatsheet.html`, `privacy.html`, `terms.html`, `404.html`) ใช้ Measurement ID จริงตัวเดียวที่ใช้ทั้งเว็บ · แก้หมวด GA4 ของบทความจาก `course` เป็น `article` ครบ 44/44 ไฟล์ · เพิ่ม meta description/og ให้ `vocab-cheatsheet.html` ตามเนื้อหาจริง หลักฐาน `Bussiness Idea/ระบบเว็บไซต์/46_ผลลัพธ์_P5-A_GA4และmeta.md`

4. **ต่อ GA4 event `game_content_cap_hit`:** ใน `js/games/game-content-client.js` ใช้ field `capped` ที่ deploy ไปแล้วก่อนหน้า ยิง event เมื่อผู้เล่นเจอเพดานเนื้อหาฟรี ครั้งเดียวต่อระดับต่อ session (กันสแปม ใช้ `sessionStorage`) ใช้กลไก `gtag()` แบบเดียวกับเกมอื่น หลักฐาน `Bussiness Idea/ระบบเว็บไซต์/47_ผลลัพธ์_P6-08_GA4event_capHit.md`

ผลตรวจ: `node scripts/check-site.js` ผ่านทั้ง 4 งาน (818 ไฟล์) ไม่มีค่าลับหลุด

Commit message แนะนำ (Lin เลือกรวม/แยกเอง แล้ว push ผ่าน GitHub Desktop):
```
จำกัด CORS ของ Edge Function 6 ตัวให้เหลือเฉพาะโดเมนเว็บ (เว้น 2 ตัวที่รันใน LIFF ไว้ตามเดิม) — ยังไม่ deploy

refactor(index): ย้าย inline script 2 บล็อก (YT/FB/self-study/share modal + GA4 event tracking) ออกจาก index.html ไป js/acquisition/ ตำแหน่งเดิมเป๊ะ ไม่เปลี่ยนพฤติกรรม

เพิ่ม GA4 ให้ 12 หน้าที่ไม่เคยมี + แก้หมวดบทความจาก course เป็น article ครบ 44 ไฟล์ + เพิ่ม meta ให้ vocab-cheatsheet.html

เพิ่ม GA4 event game_content_cap_hit ยิงตอนผู้เล่นชนเพดานเนื้อหาฟรี (1 ครั้ง/ระดับ/session)
```

## 2026-08-08 (รอบดึก) — P6-17 + P7-03 + P6-08: แก้หน้า error เกม / ล็อกเวอร์ชัน backup / เพิ่มจุดวัดเจอเพดาน

สถานะ: **โค้ดเสร็จแล้วรอ Lin push** (ยกเว้นข้อ D ที่ต้อง deploy Edge Function เพิ่มอีกขั้นหลัง push)

Lin อนุมัติ 4 งานย่อยแบบแยกเรื่อง (A/B/C/D) พร้อมกัน สั่งทำแบบคู่ขนาน 3 แชท (ไฟล์ไม่ชนกัน):

1. **A+B — แก้หน้า error เกม (`js/games/game-content-client.js` ไฟล์เดียว โหลดทั้ง 6 หน้าเกม):** เปลี่ยนสีแถบโหลด/error จากฟ้า/แดงทั่วไปเป็นชุดสีทองตาม CLAUDE.md · แปล error ดิบ (เช่น `game-content HTTP 500`) เป็นภาษาไทยง่ายๆ ให้ผู้เล่นเห็น (ข้อความดิบยังอยู่ใน `console.error` เพื่อ debug) · เพิ่มปุ่ม "🔙 กลับหน้าเกมทั้งหมด" + "💬 ทัก LINE ครู" (ใช้ลิงก์ LINE เดิมที่มีอยู่แล้วใน `js/core/shared.js`) · เพิ่ม global crash handler (`window.onerror`/`unhandledrejection`) ที่ไม่เคยมีมาก่อนบนหน้าเกมเลยสักหน้า ใช้แถบ error เดียวกับข้อ A · ไม่มี `.min.js` คู่กัน ไม่ต้อง build · หลักฐาน `Bussiness Idea/ระบบเว็บไซต์/41_ผลลัพธ์_P6-17_แก้หน้าerror.md`
2. **C — ล็อกเวอร์ชัน dependency ตัวสำรองข้อมูล:** สร้าง `scripts/backup/package-lock.json` จริงจาก `npm install` (ไม่ได้เขียนมือ, ตรึง `googleapis@144.0.0`) + เปลี่ยน `.github/workflows/backup-database-to-drive.yml` จาก `npm install --no-save` เป็น `npm ci` กันดึงเวอร์ชันแปลกปลอมตอน cron รันตี 3 ที่มี secret Google/LINE อยู่ในเครื่อง · พบเพิ่ม (ไม่ได้แก้ นอกขอบเขต): `npm audit` เจอ 4 moderate vulnerability จาก `uuid` ที่ลึกอยู่ใน `googleapis` ต้องอัป major version ถึงจะหาย — บันทึกรอ Lin ตัดสินใจ หลักฐาน `Bussiness Idea/ระบบเว็บไซต์/42_ผลลัพธ์_P7-03_backup-lockfile.md`
3. **D — เพิ่มจุดวัด "เจอเพดานแล้ว" ใน `supabase/functions/game-content/index.ts`:** เพิ่ม field `capped: {初, 中, sentences}` ใน response (additive ไม่ลบ/ไม่เปลี่ยนชื่อ field เดิม, ไม่แตะ CAPS/tier-detection logic) ตรวจแล้วว่า client (`game-content-client.js`) ไม่พังจากการเพิ่ม field นี้ — **✅ Lin deploy แล้ว 2026-08-08 (`supabase functions deploy game-content` สำเร็จ, project `qzkxlhpcputsvbqmtqfi`) live จริงแล้ว** หลักฐาน `Bussiness Idea/ระบบเว็บไซต์/43_ผลลัพธ์_P6-08_เพิ่มจุดวัดเจอเพดาน.md`

ผลตรวจ: `node scripts/check-site.js` ผ่านทั้ง 3 งาน (816 ไฟล์) ไม่มีค่าลับใหม่หลุด

Commit message แนะนำ (3 ข้อความแยกกัน หรือรวม commit เดียวก็ได้ — Lin เลือกเอง แล้ว push เองผ่าน GitHub Desktop):
```
แก้หน้าแจ้งข้อผิดพลาดเกม: เปลี่ยนสีให้ตรงธีมทอง แปล error เป็นภาษาคน เพิ่มปุ่มกลับ games.html/LINE และเพิ่มระบบดัก JS พังกลางเกมทั้ง 6 หน้า (P6-17)

fix(backup): เพิ่ม package-lock.json ให้ scripts/backup + เปลี่ยน npm install เป็น npm ci กัน supply-chain attack ตอนรัน cron ทุกคืน

เพิ่ม field capped ใน game-content response บอกว่าเจอเพดานฟรีแล้วหรือยัง (ยังไม่ deploy)
```

## 2026-08-08 (รอบเย็น) — P4-04: แยก `data/` ที่ปนกัน (ตัวตรวจ+รายงาน → `data/tools/`, `data/reports/`)

สถานะ: **✅ เสร็จแล้ว + Lin push ขึ้น GitHub แล้ว** — Lin อนุมัติเปิดหลายแชทได้ แต่พบว่างานนี้ทำในแชทเดียวได้ปลอดภัยกว่า (ไฟล์ที่แก้ทับกันหมด) เลยทำตรงนี้เอง

ย้าย 7 ไฟล์ออกจาก `data/` (คงเหลือแค่ข้อมูลจริง: `words-data.js`/`adv-sentences.js`/`tone-engine.js`/`audio-*.js` + หน้าแอดมิน 2 หน้าที่ยังไม่ย้าย รอ Lin ตอบคำถามเข้าถึงยังไง):
- → `data/tools/`: `tests-tone-engine.js`, `tests-check-data-health.js`, `check-duplicate-words.js`, `check-data-health.js`, `regression-check-tone.js`
- → `data/reports/`: `tone-regression-report.json`, `game-behavioral-checklist-manual.md`

แก้ path ในไฟล์ที่อ้างอิงครบ (เจอมากกว่าที่แผนเดิมคาดไว้ — เจอ `scripts/migrate-game-content.js` และ `CLAUDE.md` เองก็อ้างอิง path เดิมด้วย): `scripts/check-site.js` (4 บรรทัด runTest), `scripts/tests-game-behavioral.js` (คอมเมนต์), `data/review-tool.html` (fetch path หา report), `CLAUDE.md` (2 บรรทัดกฎถาวร), requires ภายในไฟล์ที่ย้าย (`./words-data.js` → `../words-data.js` ฯลฯ), `data/tools/regression-check-tone.js` เขียนไฟล์ output ไปที่ `../reports/` แทน · **ยังไม่ได้แก้:** สคริปต์ scheduled task รายสัปดาห์ `weekly-full-audit-product-security-games-schedule` (CHECK 3B อ้าง path เดิม `node data/regression-check-tone.js`) — ไฟล์นั้นอยู่นอก repo (`/Users/taihualin/Documents/Claude/Scheduled/`) AI เข้าไม่ถึงโดยตรง ต้องแก้ผ่านเครื่องมือจัดการ scheduled task ต่างหาก (งานตอนนี้ปิดอยู่ ไม่ได้รันอัตโนมัติ ไม่เร่งด่วน)

ผลตรวจ: `node scripts/check-site.js` ผ่านทั้งหมด + รัน `node data/tools/regression-check-tone.js` ด้วยมือ 1 ครั้งยืนยันเขียนไฟล์ไปที่ `data/reports/tone-regression-report.json` ถูกจุดจริง

## 2026-08-08 — P4-01: เริ่มจัดโฟลเดอร์ (เปลี่ยนชื่อ js/content → js/acquisition + เก็บไฟล์สารบัญซ้ำเข้ากรุ)

สถานะ: **✅ เสร็จ 2 จุดที่ Lin อนุมัติแล้ว — เหลืออีกหลายจุดรอ Lin ตัดสินใจ (ดู `27_แผน_P4-P5_จัดโฟลเดอร์.md`)**

ทำ 2 อย่างตามที่ Lin อนุมัติ: (1) เปลี่ยนชื่อโฟลเดอร์ `js/content/` → `js/acquisition/` ให้ตรงชื่อเป้าหมายในแผนหลัก P4 (โค้ดเดิมไม่เปลี่ยน แค่ย้ายที่ + แก้ `src=` ใน 6 หน้า: `blog.html`, `faq.html`, `index.html`, `pricing.html`, `resources.html`, `tone-finder.html` + คอมเมนต์ในตัวไฟล์ + `README.md`) (2) ย้ายไฟล์สารบัญที่ซ้ำกัน `00_ฟังก์ชันไหนอยู่ไฟล์ไหน.md` ฉบับ root (เก่ากว่า ข้อมูลไม่ตรงของจริง) เข้า `_archive/` (กันไว้ ไม่ push ขึ้น GitHub) เหลือฉบับจริงที่ `supabase/sql/00_ฟังก์ชันไหนอยู่ไฟล์ไหน.md` ที่เดียว

ผลตรวจ: `node scripts/check-site.js` ผ่านทั้งหมด (816 ไฟล์ ไม่มี error/failure) รันหลังย้ายไฟล์เสร็จ

## 2026-08-07 — เพิ่มปุ่ม 補登上課 (บันทึกเข้าเรียนย้อนหลัง)

สถานะ: **✅ เสร็จแล้ว — Lin push แล้วและยืนยันใช้งานได้จริงบนเว็บ**

ปัญหาที่แก้: ปุ่ม "✅ 今日上課" ผูกกับวันนี้ตายตัว ถ้าครูลืมกดวันนั้นไม่มีทางย้อนกลับไปบันทึกได้เลย

วิธีแก้: เพิ่มปุ่ม "➕ 補登上課" ในกล่อง "📅 上課記錄" ของนักเรียนแต่ละคน (อยู่บนสุดของกล่องที่กางออกมา) กดแล้วเลือกวันที่ย้อนหลังได้เอง (ค่าเริ่มต้น = เมื่อวาน, กันไม่ให้เลือกวันอนาคต) ใช้ RPC เดิม `record_attendance_increment` ไม่ต้องแก้ฐานข้อมูล/ไม่ต้องรัน SQL — ถ้าวันนั้นมีบันทึกอยู่แล้วจะเด้งเตือนก่อนว่าจะเพิ่มเป็นกี่ชั่วโมง กันกดพลาดซ้ำ

ไฟล์ที่แก้: `js/classroom/attendance-auth.js` (เพิ่มฟังก์ชัน `toggleBackfillPicker` + `submitBackfillAttendance`, ไม่แตะฟังก์ชันเดิม) — ไม่อยู่ในกลุ่ม 5 ไฟล์ที่ต้องรัน `build-minjs.sh`

ผลตรวจ: `node --check` ผ่าน (syntax ไม่พัง) · Lin ทดสอบใช้งานจริงบนเว็บแล้วยืนยันว่าใช้ได้

## 2026-08-07 — P3-A: regenerate .min.js ที่ล้าหลัง 5 คู่ไฟล์

สถานะ: **✅ เสร็จแล้ว**

ปัญหาที่แก้: `.min.js` ของเกม 5 ไฟล์ล้าหลังต้นฉบับ `.js` 1-8 วัน (เจอจากรายงาน P3 `24f_ผลลัพธ์_P3_min-js-sync.md`) ผู้เล่นทุกคนโหลดแต่ `.min.js` เท่านั้น แปลว่าเห็นโค้ดเก่ากว่าที่แก้ไว้จริง

วิธีแก้: ติดตั้ง `terser` ผ่าน `npx --yes terser` (ไม่แก้ `package.json` — repo นี้ไม่เคยมี `package.json`/`node_modules` มาก่อน การเพิ่มเข้าไปจะเปลี่ยนโครงสร้าง repo เกินขอบเขตงานนี้ และ `npx` ใช้ได้ตรงๆ โดยไม่ต้องติดตั้งถาวร) รัน `terser <ไฟล์>.js --compress --mangle -o <ไฟล์>.min.js` ทับของเดิมทั้ง 5 คู่

**สิ่งที่น่าสนใจที่พบระหว่างตรวจ:** ไฟล์ `js/core/shared.min.js` และ `js/games/tone-finder-game.min.js` ที่ regenerate ใหม่ **ตรงกับของเดิมทุกไบต์ (md5 เหมือนกัน)** ทั้งที่ต้นฉบับ `.js` ถูกแก้หลังสุด (mtime ใหม่กว่า) — ตรวจซ้ำด้วยการรัน terser แยกต่างหากยืนยันผลเดิม แปลว่าการแก้ต้นฉบับช่วงนั้นเป็นแค่ comment/formatting ที่ไม่กระทบ logic จริง (terser ตัดคอมเมนต์ออกอยู่แล้ว) ไม่ใช่บั๊กของกระบวนการ — อีก 3 ไฟล์ (reading-game-app, typing-game-app, word-order-app) ได้ไฟล์ใหม่ที่ต่างจากเดิมจริง ขนาดใกล้เคียงเดิม (ต่าง <1%)

ผลตรวจ:
- `node --check` ผ่านทุกไฟล์ (syntax ไม่พัง)
- ขนาดไฟล์ใหม่เทียบเดิมสมเหตุสมผล ไม่มีไฟล์ไหนต่างเกิน 2-3 เท่า
- `node scripts/check-site.js` ผ่านทั้งหมด (817 ไฟล์)
- `node scripts/check-minified-sync.js` ยืนยัน `.min.js` ใหม่กว่า `.js` แล้วทุกคู่ (MISMATCH ยังขึ้นตามปกติ เพราะวิธีเทียบแบบ exact-match ใช้ยืนยัน "เหมือนกันจริง" ไม่ได้อยู่แล้ว — ดูคอมเมนต์ในสคริปต์)

งานที่ทำ:
- Regenerate `js/core/shared.min.js`, `js/games/reading-game-app.min.js`, `js/games/typing-game-app.min.js`, `js/games/word-order-app.min.js`, `js/games/tone-finder-game.min.js`
- เพิ่ม `scripts/build-minjs.sh` — รัน terser กับทั้ง 5 คู่ไฟล์ในคำสั่งเดียว (`bash scripts/build-minjs.sh`) ใช้ซ้ำได้ทุกครั้งที่แก้ต้นฉบับ

**⚠️ กฎใหม่ — แก้ไฟล์ `.js` ต้นฉบับ 5 ไฟล์นี้แล้ว ต้องรัน `bash scripts/build-minjs.sh` ก่อน push ทุกครั้ง:**
`js/core/shared.js`, `js/games/reading-game-app.js`, `js/games/typing-game-app.js`, `js/games/word-order-app.js`, `js/games/tone-finder-game.js`
(เว็บทุกหน้าโหลดแต่ `.min.js` เท่านั้น ไม่มีหน้าไหนโหลด `.js` ตัวเต็มเลย — ไม่รันตามนี้ = ผู้เล่นเห็นโค้ดเก่า)

รายงานเต็ม: `Bussiness Idea/ระบบเว็บไซต์/25a_ผลลัพธ์_regenerate-minjs.md`

## 2026-08-07 — P3 รวมผล: ตัวทดสอบคุ้มกันพฤติกรรมเดิม (6 แชทคู่ขนาน)

สถานะ: **ทำแล้วบางส่วน** (P3-01/02/03/05/06/08 มีของแล้ว · P3-04 integration tests ของจริงยังไม่มี ต้องมือ · P3-07 ย้ายแค่ 1 ไฟล์ ยังไม่ปรับโครงสร้างเต็ม)

รายละเอียดเต็ม: `Bussiness Idea/ระบบเว็บไซต์/24_แผน_P3_behavioral_guards_สรุปรวม.md`

งานที่ทำ:

- เพิ่มสคริปต์ทดสอบใหม่ 4 ตัว รวมเข้า `scripts/check-site.js` แล้ว (รันอัตโนมัติทุกครั้งที่รัน `node scripts/check-site.js`): `scripts/tests-marketing-behavioral.js`, `scripts/tests-game-behavioral.js`, `scripts/check-mobile-accessibility.js` (warning-only), `data/reports/game-behavioral-checklist-manual.md` (checklist มือคู่กัน — ย้ายจาก `data/` เข้า `data/reports/` แล้ว 2026-08-08)
- `scripts/check-minified-sync.js` สร้างแล้วแต่**ตั้งใจไม่รวม**เข้า `check-site.js` เพราะวิธี exact-match จะ MISMATCH เสมอกับไฟล์ที่ผ่าน minifier จริง (ไม่ใช่ด่านที่บล็อก push ได้ — รันแยกด้วยมือ)
- สร้าง `supabase/tests/` ตามข้อเสนอ P2-06 · ย้ายเฉพาะไฟล์ที่ยังใช้งานจริง `2026-08-02_reschedule_lock_guard_TEST.sql` เข้ามา (อัปเดต path ใน `CLAUDE.md` และ `supabase/sql/00_ฟังก์ชันไหนอยู่ไฟล์ไหน.md` แล้ว) — ไฟล์ `_TEST.sql` อีก 2 ไฟล์ที่อยู่ใน `archive/` (เลิกใช้แล้ว) ไม่ย้าย เพราะเป็นของเก่าที่ถูกแทนที่แล้ว ไม่ใช่ตัวทดสอบที่ยังใช้งาน
- สร้าง `_dev/2026-08-07_behavioral-guard-cancel-addclass.html` และ `_dev/ตัวทดสอบระบบเลื่อนคาบ_P3_2026-08-07.html` (เปิดเบราว์เซอร์รันเอง — ไม่ผูกกับ `check-site.js`)

⚠️ พบเรื่องสำคัญที่ไม่ใช่ของ P3 โดยตรง แต่ต้องแจ้ง Lin:

1. **`.min.js` ล้าหลัง `.js` ต้นฉบับทั้ง 5 คู่ไฟล์เกม** (ห่างกัน 1–8 วัน) — เว็บทุกหน้าโหลดแต่ `.min.js` เท่านั้น แปลว่าผู้เล่นเห็นโค้ดเก่ากว่าที่แก้ไว้ล่าสุดจริง ต้อง regenerate `.min.js` ทั้ง 5 ไฟล์ก่อน push รอบถัดไป (ไม่ได้แก้ในรอบนี้ นอกขอบเขต P3)
2. `node scripts/check-site.js` ยัง**ไม่ผ่าน 100%** — ติด secret scan 2 จุดที่ `_dev/2026-08-07_ขอ_google_drive_refresh_token.js:19,22` ตรวจแล้วเป็น **false positive** (เป็นข้อความบอกให้ Lin ใส่ค่าเอง `"ใส่ค่าที่ได้จาก Google Cloud"` ไม่ใช่ค่าลับจริง) — ไฟล์นี้อยู่ใน `_dev/` ที่ `.gitignore` กันไว้แล้ว ไม่หลุดขึ้น GitHub แต่ตัวสแกนยังฟ้องผิดอยู่ ควรให้ Lin ตัดสินใจว่าจะปรับ regex ตัวสแกนหรือปล่อยไว้ (ไม่ได้แก้ในรอบนี้ เพราะแก้ตัวสแกนความปลอดภัยนอกขอบเขตงาน P3)

## 2026-08-07 — P1-06 ย้ายค่าลับออกจากคำสั่ง cron ไปเก็บใน Supabase Vault

สถานะ: **✅ เสร็จครบแล้ว — cron ทุกงานย้ายเข้า Vault และพิสูจน์ด้วย HTTP 2xx จริงแล้ว**

ปัญหาที่แก้: `pg_cron` เก็บคำสั่งเป็นข้อความในตาราง `cron.job` ใครเปิด Dashboard → Database → Cron เห็น token ที่ฝังใน header ทั้งก้อน — ยืนยันจากของจริงแล้วว่า job 5 (`class-reminder-every-5-min`) และ job 9 (`low-quota-daily`) ฝัง **service_role JWT** เต็มๆ อ่านได้จากหน้าจอ

วิธีแก้: เก็บ token ใน **Supabase Vault** (เข้ารหัสด้วย pgsodium) แล้วให้ cron เรียกฟังก์ชัน `private.call_*_cron()` แทน → คำสั่งใน `cron.job` เหลือแค่ `select private.call_xxx();`

ผลตรวจจากระบบจริง (2026-08-07 · อ่านอย่างเดียวก่อนแก้):

- job 5, 9 = `service_role` (อ่านจาก JWT payload — **ขัดกับไฟล์ `2026-07-18_pg_cron_low_quota_daily.sql` ที่เขียนว่า `anon`** ไฟล์ในเครื่องเป็นข้อมูลเก่า/ผิด)
- job 8 `request-sla-reminder` = **placeholder ไม่ใช่ JWT จริง** → ตัวเตือนครู 48 ชม. **ไม่เคยทำงานเลยสักครั้ง** ตั้งแต่ตั้ง cron มา (บั๊กที่กระทบงานสอนจริง ไม่ใช่แค่เรื่องความปลอดภัย)
- job 12 `low-quota-cron-daily` = header มีแค่ `Content-Type` ไม่มี Authorization เลย + ปลายทางเปิด Verify JWT → **ไม่เคยเรียกสำเร็จ** เป็นงานซ้ำที่ตายแล้ว (ตัวจริงคือ job 9) ควร `unschedule` ทิ้ง
- job 10 สลับเป็น Vault แล้ว ทดสอบด้วยการเร่ง schedule เป็นทุกนาทีชั่วคราว → `cron.job_run_details` ยืนยัน `succeeded` ที่ 02:55 และคืน schedule เดิมแล้ว

งานที่ทำ:

- เพิ่ม `supabase/sql/2026-08-07_p1-06_cron_vault.sql` เป็นต้นฉบับเดียวของงานนี้ (schema `private`, ตาราง `private.cron_http_log`, ฟังก์ชัน `private.call_*_cron()` 5 ตัว, คำสั่งสลับ cron ทีละงาน, คำสั่งตรวจ, คำสั่ง rollback) — **ไม่มีค่าลับในไฟล์** ค่าเข้า Vault ด้วยคำสั่งที่ดึงจาก `cron.job` โดยตรง
- เพิ่มตาราง `private.cron_http_log` เก็บ `request_id` ที่ `net.http_post` คืนมา → join กับ `net._http_response` ได้ตรงๆ **แก้ปัญหาที่เดิมต้องเดาว่าแถว HTTP ไหนมาจาก cron ตัวไหน** (`net._http_response` ไม่มีคอลัมน์บอกที่มา)
- เปิด RLS ให้ `private.cron_http_log` โดยไม่มี policy (fail-closed) + trigger ลบ log เก่ากว่า 30 วันอัตโนมัติ
- ฟังก์ชันทุกตัวใช้ `security definer` + `set search_path = ''` และ **หยุดทำงานพร้อม error ถ้าหาค่าใน Vault ไม่เจอ** (ไม่ยิง request ด้วย header ว่าง)
- เพิ่มกฎถาวรใน `CLAUDE.md`: SQL ทุกคำสั่งที่เปลี่ยนระบบต้องมีไฟล์ต้นฉบับใน `supabase/sql/` ห้ามพิมพ์ใน Dashboard ตรงๆ
- อัปเดตสารบัญ `supabase/sql/00_ฟังก์ชันไหนอยู่ไฟล์ไหน.md` ในคอมมิตเดียวกันตามกฎเดิม

ผลตรวจ:

- `node scripts/check-site.js` ผ่านทั้งหมด — ตรวจค่าลับ 846 ไฟล์ (เพิ่มจาก 845 คือไฟล์ SQL ใหม่), JavaScript 71 ไฟล์, HTML 108 ไฟล์, CSS 7 ไฟล์, ไฟล์โปรเจกต์ 794 ไฟล์
- ตัวกันค่าลับ P1-08 สแกนไฟล์ SQL ใหม่แล้วไม่พบค่าลับ

ผลสุดท้าย — cron ทุกงานพิสูจน์ด้วย HTTP จริงแล้ว (ไม่ใช่แค่ `succeeded` ของ pg_cron):

| job | ชื่อ | หลักฐาน |
|---|---|---|
| 5 | `class-reminder-every-5-min` | 200 (req 12917, 12920 — รอบอัตโนมัติ) |
| 8 | `request-sla-reminder` | 200 (req 12916 — รอบอัตโนมัติ) |
| 9 | `low-quota-daily` | 200 (req 12923 — เรียกด้วยมือ) |
| 10 | `welcome-retry-cron-hourly` | 200 (req 12889 + รอบอัตโนมัติ 02:55) |
| 13 | `star-fraud-daily` | ไม่เกี่ยว — SQL ล้วน ไม่เรียก Edge Function |
| 14 | `calendar-schedule-sync-cron` | 200 (req 12922) |

🗑️ **ลบ job 12 `low-quota-cron-daily` ทิ้งแล้ว** — พิสูจน์ตรงก่อนลบด้วยการยิงคำสั่งเดียวกับมันเป๊ะๆ (ไม่มี auth header) ได้ req 12926 → 401 = ไม่เคยทำงานจริงตั้งแต่ตั้งมา เป็นงานซ้ำของ job 9

บั๊ก 2 จุดที่เจอระหว่างทำ (ทั้งคู่เกิดจากเดาแทนที่จะเปิดของจริงดูก่อน — บันทึกไว้กันซ้ำ):

1. **ฟังก์ชัน `call_calendar_sync_cron` ส่ง header ไม่ครบ → 401 ทุกรอบ ทุก 5 นาที** — ต้นฉบับ `2026-07-17_pg_cron_calendar_schedule_sync.sql:21-25` ส่ง anon key ทั้งใน `apikey` **และ** `Authorization` แต่ตอนเขียนดูจากหน้าจอที่ค่าถูกปิดบังไว้ เห็นแค่ `apikey` เลยเขียนตกไปหนึ่งตัว · แก้แล้ว
2. **ค่าใน Vault ถูกเขียนทับด้วย placeholder** — สั่ง `vault.update_secret` ทั้งที่ค่าเดิมถูกอยู่แล้ว (regex ดึงมาถูกตั้งแต่แรก) แล้ววาง `__ANON_KEY__` ลงไปจริง (`length = 12`) · แก้โดยก็อปค่าจาก `cron_welcome_retry_key` ที่เป็น anon key ตัวเดียวกันและพิสูจน์แล้วว่าใช้ได้

ข้อจำกัดที่ยังเหลือ:

- job 9 ยืนยันด้วยการเรียกด้วยมือ ยังไม่เห็นรอบอัตโนมัติ (รันวันละครั้งตี 2)
- `calendar-schedule-sync-cron` และ `welcome-retry-cron` ยังปิด Verify JWT และไม่มีด่านตรวจผู้เรียกในฟังก์ชันเอง — **การย้ายเข้า Vault ไม่ได้ปิดช่องนี้** เป็นงานแยกที่ต้องขออนุมัติต่างหาก
- ยังไม่ได้ rotate ค่าใดทั้งสิ้น (`P1-07`) ค่าเดิมทั้งหมดยังใช้งานได้ตามปกติ

## 2026-08-07 — อุดช่องว่าง fail-open ของตัวกันค่าลับ P1-08 (แชท A ในชุดงานคู่ขนาน)

สถานะ: **แก้และทดสอบในเครื่องแล้ว รอแชทผู้สั่งการตรวจซ้ำก่อนปิดงาน P1-08 — ยังไม่ประกาศว่า P1-08 เสร็จ**

ตรวจโค้ดจริงพบ 3 จุดที่ตัวกันค่าลับ (ติดตั้ง 2026-08-06) ยัง "fail-open" คือปล่อยผ่านแทนที่จะเตือน:

1. `scripts/secret-scanner.js` เดิมข้าม (ไม่สแกนเลย) ทั้งโฟลเดอร์ `_dev`, `_แผนงาน`, `_บทความ-เตรียมเขียน`, `_archive`, `_to_delete` — ยืนยันแล้วว่า `_dev`/`_แผนงาน` มีไฟล์เอกสารจริงของ Lin อยู่ (เช่น `_แผนงาน/ทำต่อในอนาคต.md`) ถ้ามีค่าลับหลุดไปแปะในไฟล์พวกนี้ระหว่างทำงาน จะไม่มีวันถูกตรวจพบ — พึ่ง `.gitignore` อย่างเดียวไม่พอ เพราะกันได้แค่ `git add` ไม่ได้กันไม่ให้ค่าลับนอนอยู่ในไฟล์เงียบๆ
   **แก้:** แยกเป็น 2 ชุดโฟลเดอร์ที่ข้าม — `SITE_VALIDATION_SKIP_DIRECTORY_NAMES` (ใช้กับตรวจ syntax/ลิงก์เว็บใน `check-site.js` เท่านั้น ยังข้าม 5 โฟลเดอร์นี้เหมือนเดิม เพราะไม่ใช่ไฟล์เว็บที่ deploy จริง) กับ `SECRET_SCAN_SKIP_DIRECTORY_NAMES` (ใช้กับตัวกันค่าลับ ข้ามแค่ `.git`/`node_modules`) — ตอนนี้ตัวกันค่าลับสแกนทุกไฟล์เอกสารจริงใน 5 โฟลเดอร์นั้นด้วยแล้ว (845 ไฟล์ จากเดิม 810)
2. ไฟล์ข้อความ >2MB ถูกข้าม (ไม่อ่านเนื้อหาเลย) แล้วโชว์แค่ "คำเตือน" — `check-site.js` เอาไปใส่ `warnings` ไม่ใช่ `failures` ทำให้ `exit 0` ได้ทั้งที่มีไฟล์ที่ไม่เคยถูกสแกนหาค่าลับจริง
   **แก้:** เปลี่ยนเป็น fail-closed ทั้ง `check-site.js` (ย้ายไป `failures`) และ CLI ตรง `node scripts/secret-scanner.js` (ย้ายจาก `console.warn` เป็น `console.error` + `process.exitCode = 1`) — ไฟล์ >2MB ที่ไม่เคยถูกสแกน = นับเป็น "ไม่ผ่าน" เสมอ ไม่ใช่แค่เตือน (ตอนนี้ในเครื่องยังไม่มีไฟล์ข้อความไหนเกิน 2MB จริง จึงยังไม่กระทบผลตรวจปัจจุบัน)
3. `scripts/tests-secret-scanner.js` เดิมมีแค่ 2 เทสต์ ไม่มีเทสต์คุ้มกัน 2 ช่องว่างข้างบนเลย
   **แก้:** เพิ่ม 2 เทสต์ใหม่ (ใช้ fixture ในโฟลเดอร์ temp เหมือนเทสต์เดิม ไม่มีค่าลับจริง) — เทสต์ที่ 3 ยืนยันว่าค่าลับปลอมในไฟล์ใต้ `_dev`/`_แผนงาน`/`_บทความ-เตรียมเขียน` ถูกตรวจพบ, เทสต์ที่ 4 สร้างไฟล์ปลอม >2MB ที่มีค่าลับปลอม ยืนยันว่าถูกข้ามจริง (ไม่ถูกอ่าน) และ CLI ต้อง exit ไม่เป็น 0 เพราะ fail-closed

ไฟล์ที่แก้: `scripts/secret-scanner.js`, `scripts/check-site.js`, `scripts/tests-secret-scanner.js` — ไม่แก้ `.gitignore` (ตรวจแล้วไม่มีช่องว่างเพิ่มเติมนอกจาก 2 ข้อบนที่แก้ในตัวสแกน)

ผลตรวจ:

- `node scripts/tests-secret-scanner.js` ผ่าน (รวม 2 เทสต์ใหม่ ใช้เวลา ~0.15 วินาที ไม่ค้าง)
- `node scripts/check-site.js` ผ่านทั้งหมด — ตรวจค่าลับ 845 ไฟล์ (เพิ่มจาก 810 เพราะสแกน `_dev`/`_แผนงาน`/`_บทความ-เตรียมเขียน`/`_archive`/`_to_delete` แล้ว), JavaScript 71 ไฟล์, HTML 108 ไฟล์, CSS 7 ไฟล์, ไฟล์โปรเจกต์สำหรับตรวจ syntax/ลิงก์เว็บยังเป็น 793 ไฟล์เท่าเดิม (ไม่กระทบ เพราะแยกชุด skip แล้ว)
- ไม่พบค่าลับจริงในรอบสแกนที่ขยายไปถึง `_dev`/`_แผนงาน`/`_บทความ-เตรียมเขียน`

สิ่งที่ยังยืนยันไม่ได้: ยังไม่มีการสแกนไฟล์ข้อความจริงที่ขนาด >2MB (ยังไม่มีไฟล์แบบนั้นในเครื่อง) ว่า fail-closed จะไม่รบกวนงานจริงในอนาคตแค่ไหน — ถ้าเกิดขึ้นจริงต้องตัดสินใจว่าจะเพิ่มเพดานหรือหาวิธีสแกนไฟล์ใหญ่แบบปลอดภัย

## 2026-08-06 — ติดตั้งตัวกันค่าลับ P1-08

สถานะ: **ติดตั้งและทดสอบในเครื่องแล้ว รอ Lin ตรวจและ push**

งานที่ทำ:

- เพิ่มกฎ `.gitignore` กัน `.env`, private key, service-account/credential JSON และไฟล์ credential มาตรฐาน พร้อมยกเว้น `.env.example` กับ `.env.template`
- เพิ่ม `scripts/secret-scanner.js` ตรวจชื่อไฟล์และรูปแบบค่าลับใน source, config, SQL, เอกสาร และ log โดยรายงานเฉพาะชนิด ไฟล์ และบรรทัด
- แยกกุญแจฝั่ง browser ที่เปิดเผยตามหน้าที่ด้วย allowlist แบบชนิด + บริบท + path ไม่เก็บค่าจริงหรือ digest
- เพิ่ม `scripts/tests-secret-scanner.js` ใช้ค่าปลอม ทดสอบการตรวจพบ การปิดบังค่า ชื่อไฟล์ต้องห้าม path ที่มีช่องว่าง และค่าฝั่ง browser ที่อนุญาต
- เปลี่ยน `scripts/check-site.js` ให้รวบรวมไฟล์จากระบบไฟล์โดยตรง ไม่เรียก Git และรวม secret scan + tests ไว้ในคำสั่งกลาง
- ไม่แก้หน้าเว็บ พฤติกรรมเว็บไซต์ ระบบภายนอก หรือ deploy

ผลตรวจ:

- `node scripts/tests-secret-scanner.js` ผ่าน
- `node scripts/secret-scanner.js` ผ่าน 810 ไฟล์ โดยไม่แสดงค่าที่ตรวจ
- `node scripts/check-site.js` ผ่าน: JavaScript 71 ไฟล์, HTML 108 ไฟล์, CSS 7 ไฟล์ และไฟล์โปรเจกต์ 793 ไฟล์
- ตรวจคำสั่งกลางและคำสั่งย่อยแล้วไม่พบการเรียก Git ก่อนรัน

ข้อจำกัด:

- ตัวตรวจจับค่าที่มีรูปแบบ ชื่อ หรือโครงสร้างสำคัญได้ แต่ไม่สามารถรับประกันการจับสตริงสุ่มที่ไม่มีบริบททุกชนิด
- ไฟล์ข้อความเกิน 2 MB จะถูกข้ามพร้อมคำเตือน และ binary ไม่ถูกอ่านเนื้อหา
- การผ่านตัวตรวจไม่ยืนยัน RLS, referrer restriction, อายุของ key หรือค่าบนระบบ production

## 2026-08-06 — รวมสเปกสมาชิกเกมเข้ากับแผนกลาง

สถานะ: **เอกสารและกฎส่งต่องานอัปเดตแล้ว รอ Lin push**

งานที่ทำ:

- อ่านไฟล์สมาชิกเกม 5 ไฟล์และแยกทิศทางผลิตภัณฑ์ออกจากสถานะที่ต้องตรวจโค้ดจริง
- สร้าง `04_สเปกสมาชิกเกม_CURRENT.md` เป็นแหล่งกลางของสิทธิ์ guest, free และ paid
- ปรับ P6 ให้เริ่มจาก audit แบบอ่านอย่างเดียว ก่อนทำ entitlement และ payment
- เพิ่มกฎให้ Codex อ่านสเปกกลางเมื่อทำงานสมาชิกเกม
- ไม่แก้โค้ดเกม ฐานข้อมูล ระบบภายนอก หรือ deploy

ผลตรวจ:

- `node scripts/check-site.js` ผ่านทั้งหมด 791 ไฟล์

## 2026-08-06 — เพิ่มแผนงานกลางและกฎส่งต่องานข้ามแชท

สถานะ: **เตรียมเอกสารและกฎเสร็จแล้ว รอ Lin push**

งานที่ทำ:

- เพิ่ม `AGENTS.md` ให้ Codex อ่านกฎ ศูนย์บัญชาการ และแผนงานหลักก่อนเริ่ม
- กำหนดให้ Codex และ Claude อัปเดตสถานะ หลักฐาน และงานถัดไปก่อนจบแชทที่มีงานจริง
- สร้างแผนงานหลัก P0–P7 จากจัดระบบเดิมไปถึง beta และเปิดขายเกม
- เชื่อมศูนย์บัญชาการให้ชี้มาที่แผนหลักฉบับเดียว

ผลตรวจ:

- `node scripts/check-site.js` ผ่านทั้งหมด 791 ไฟล์
- ไม่ได้ย้ายโค้ด ไม่ได้เปลี่ยนระบบภายนอก และไม่ได้ deploy

## 2026-08-06 — จัดระบบโค้ดและโครงสร้างทั้งเว็บ

สถานะ: **ทำเสร็จและ push แล้วโดย Lin**

งานที่ทำ:

- จัดหมวดและเพิ่มแผนที่ไฟล์ให้ JavaScript ส่วน core, classroom, content, games, score และ textbook
- เริ่มจัดจาก `js/core/shared.js` แล้วตรวจต่อทั้งชุด
- ลบโค้ดตายของระบบเชื่อมบัญชีเกมและรายการไฟล์นักเรียนแบบเก่าที่ไม่มีจุดเรียก
- ลบ placeholder ว่าง ไฟล์ทดสอบขยะ ไฟล์สำรอง `.min.js.bak` และ metadata ชั่วคราวของ Supabase
- เพิ่มกฎ `.gitignore` ป้องกันไฟล์ชั่วคราวกลับเข้า Git
- เพิ่ม `README.md` อธิบายโครงสร้างและกติกาความปลอดภัยของโปรเจกต์
- เพิ่ม `scripts/check-site.js` สำหรับตรวจเว็บแบบรวมด้วยคำสั่งเดียว

ผลตรวจหลังทำ:

- JavaScript syntax ผ่าน 69 ไฟล์
- HTML และ inline JavaScript ผ่าน 108 หน้า
- CSS และลิงก์ไฟล์ภายในผ่าน 7 ไฟล์
- ชุดทดสอบ tone engine ผ่าน 24/24
- ชุดทดสอบ data health ผ่าน 11/11
- คลังข้อมูล 735 คำและ 30 ประโยคผ่าน
- ไม่พบคำซ้ำในคลัง 735 คำ
- เปิดผ่าน local server ครบ 108 หน้า ได้ HTTP 200 ทุกหน้า
- ทดสอบหน้าแรก เกมหลัก ห้องเรียน และหน้าความคืบหน้าในเบราว์เซอร์ ไม่พบ JavaScript error

ข้อจำกัดที่ตั้งใจรักษาไว้:

- ไม่ย้ายหน้า HTML เพื่อป้องกัน URL สาธารณะเสีย
- ไม่ลบ public/compatibility API ที่ยังอาจมีผู้เรียกภายนอก
- ไม่แก้ข้อมูลจริง ไม่ส่งรหัสล็อกอิน และไม่ deploy ระหว่างการจัดระบบ

คำสั่งตรวจรอบต่อไป:

```bash
node scripts/check-site.js
```
