# SQL authoring and source ownership

> Production SQL/database/schema/RLS mutation is HIGH risk and requires Lin for the exact action. This file governs source preparation only.

- Every runtime-changing SQL action has a source file in `supabase/sql/` before apply. Do not author an untracked Dashboard-only mutation.
- Every active function has one current source owner. Update `00_ฟังก์ชันไหนอยู่ไฟล์ไหน.md` in the same source change.
- A function signature change must handle old overloads explicitly and verify that only the intended definitions remain.
- Make SQL rerunnable/idempotent where the operation permits it.
- Never store a secret in repo SQL, cron command text, logs or chat evidence. Use Vault/private wrappers and masked inspection.
- Divide multi-step operations into explicit ordered sections; do not leave an ambiguous “run all” path.
- Destructive SQL requires a stated backup/recovery rationale and an executable rollback or recovery block where technically possible.
- Inspect cron metadata without selecting/copying full secret-bearing command text.
- Design SELECT/INSERT/UPDATE/DELETE policies from the actual access model. Do not assume every table needs all four commands; verify UPDATE `USING`/`WITH CHECK`, readback behavior and intentional omissions against current schema/evidence.
- Files under `supabase/schema/` are reconstruction snapshots and follow `supabase/schema/README.md`; they are not Production migrations.
