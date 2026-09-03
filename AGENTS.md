# AGENTS.md — Repository constraints for mrtaihualin.com

> Applies to this repository only.
> Universal authority: `/Users/taihualin/Documents/Claude/Projects/AGENTS.md`
> Repository router: `00_START_HERE.md`

## Repository boundary

- The site has three Areas: student acquisition; classroom/textbook; games. `shared` is a common layer, not a fourth Area.
- Product, UX, tier, Phase and pending decisions route through the Website router. Product NEXT and backlog are not implementation authorization.
- Preserve public HTML URLs. Inspect dependencies before moving, renaming or deleting files.
- Do not edit vendor files without a proven dependency and scoped reason.
- Use existing feature/system owners before creating a parallel implementation.

## Static-site and data safety

- This is a public static client: every shipped HTML/JS value is readable by visitors. Never place a password, private key, service-role key, token, secret, student data or identifiable private-user data in source, docs, logs or evidence.
- Client-visible provider keys must remain public-client credentials with provider restrictions and server-side/RLS controls; they are never treated as secrets.
- Report a discovered sensitive value by name and location only; do not print its value.
- Real database, Auth, account/data, restore, cron/notification and other Production actions follow the canonical risk model and exact Production Safety workflow.

## Repository verification

- Choose targeted checks by changed scope. Before completing a website source change, run `node scripts/check-site.js` unless the exact task is documentation-only and cannot affect the site gate.
- Add regression protection before a refactor/move that can change behavior.
- Keep UI, logic, data and tests separated when it improves maintenance without changing locked behavior.
- Record verified code/structure evidence as a Delta in `MAINTENANCE.md`; do not copy Product or Current status there.

## Website release command boundary

- Lin's short instruction `เอาขึ้นเว็บ` (or an unqualified instruction with the same meaning) means release the complete approved public static website package to Cloudflare Production and verify the whole public package, routes and shared assets, even when the provider uploads only changed files.
- That short instruction does not by itself authorize Production SQL/database/data, Supabase Auth/RLS/Edge configuration, Google or LINE configuration, DNS/custom-domain changes, AWS failover, Git-host migration, secrets, real-user data or another external-system mutation. Each applicable action retains its own exact scope, risk and authorization gate.
- Before any release mutation, resolve the exact approved source/version, target environment, package scope, required gates and rollback. If any of these is missing, conflicting or stale, stop before mutation and warn Lin that the release instruction is unclear, stating only the smallest missing decision or approval needed.

## Human-owned content

- Thai game words, sentences, translations and readings come from Lin. Computed language fields require Lin's 100% review before publish.
- Detailed game-content procedure: `data/README.md`.
- `data/words-data.js`, `data/history/vocabulary/`, `data/approved-vocabulary-catalog.lock.json` and every copy/history/prior-chat/derivative of the former 735-word corpus are `LEGACY_CONTENT_READ_DENY`. AI must not open, search inside, parse, index, summarize, copy or use them unless Lin explicitly orders retrieval of the old/legacy corpus for the exact task. The Current player-accessible vocabulary is the server-gated 200-word set (`初 100 + 中 100`) in `supabase/functions/game-content/index.ts`.
- Visual/brand changes use the Current Brand/Product authority and applicable Human verification; do not invent new style decisions from historical repo text.

## Technical procedure pointers

- Classroom/Calendar invariants: `js/classroom/README.md`
- LINE webhook operations: `supabase/functions/line-webhook/README.md`
- Game-content Edge gate: `supabase/functions/game-content/README.md`
- Learning Foundation: `supabase/LEARNING_FOUNDATION.md`
- SQL authoring/source map: `supabase/sql/README.md` and `supabase/sql/00_ฟังก์ชันไหนอยู่ไฟล์ไหน.md`

## Repository documentation

- `00_START_HERE.md` is pointer-only.
- Phase 1 outcome/status/evidence updates belong to the Current Phase 1 Checklist selected by the Website router, never the roadmap or Master Plan.
- Deferred repository-dependent Product work stays at `_แผนงาน/ทำต่อในอนาคต.md` only.
- Audit, Plan, Spec, Status, Recovery and Handoff use the canonical Document Placement workflow. Do not create a parallel roadmap, status, handoff or global authority in this repo.
