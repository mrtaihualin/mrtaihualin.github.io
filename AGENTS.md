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

## Human-owned content

- Thai game words, sentences, translations and readings come from Lin. Computed language fields require Lin's 100% review before publish.
- Detailed game-content procedure: `data/README.md`.
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
