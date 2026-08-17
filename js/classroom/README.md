# Classroom technical invariants

> Product behavior, thresholds and wording come from the Current Website Product authority. This file owns implementation safety invariants only.

- Add, Reschedule and Cancel are different lifecycles. Do not reuse their lock or time-threshold behavior without an explicit Product/technical authority.
- Cancel may reclaim its defined stale processing lock; Add and Reschedule must not reclaim a lock automatically because a Calendar mutation may already have occurred. Teacher unlock is the recovery path.
- Apply the same guard at every Web, RPC and LINE entry point. A caller cannot enable/disable a database guard.
- LINE buttons remain usable from chat history. Old handlers must fail safely, validate actor/request/status and current payload (`d/t` where used), and return a response instead of going silent.
- A Calendar mutation requires a successful backup first. If the mutation fails, remove an unused backup so Restore cannot create a duplicate event.
- After create/move/delete, read back the result. If a mutation may have been sent but cannot be verified, preserve the lock and report an ambiguous state.
- Reschedule conflict checks use event listing and exclude the current event by id. Add checks use the established free/busy path. A failed conflict check is never equivalent to no conflict.
- Keep `classroom_schedule` synchronized with Calendar after change and after revert; restore reminder state as required by the established implementation.
- Notification failure must be reported truthfully. Never claim that a student was notified when delivery was not verified.
- For multi-step database writes, expose partial failure and use only data that was actually persisted.
- Supabase updates that RLS may silently reduce to zero rows must verify affected rows.
- Translate known user errors through the established friendly-error path. Preserve unknown errors for diagnosis rather than hiding them.
- In a confirmation dialog, Esc/false must select the safe branch.
- Reverify Web/LINE Calendar parity after Calendar id or credential changes.

Behavior history and implementation evidence belong in `MAINTENANCE.md`, not this file.
