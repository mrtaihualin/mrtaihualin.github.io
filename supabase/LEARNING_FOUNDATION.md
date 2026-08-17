# Learning Foundation invariants

> Product semantics and rollout status route through the Website Current authorities. This file owns stable architecture constraints.

- Reuse the existing Learning Item/Memory/Skill/content model. Do not create a parallel model; route a claimed gap to Current Product/architecture authority.
- `learning_items.item_id` is stable identity. When a content key changes, preserve its history in `learning_item_key_history`.
- `practice_events` is append-only raw evidence; `learning_memory` is derived state.
- Saved/Vault, Played evidence and Learning Memory are distinct concepts and may not be inferred from one another.
- Personal learning items are owner-only. System content has no personal owner. Preserve RLS isolation.
- Empty lookup tables may be intentional. Do not invent Skill/tag/formula/price/quota/game-compatibility values that Product authority has not locked.
- Plan, Price, Entitlement and Grant remain separate models; do not collapse them into a `paid=true` flag.
- Content changes must inspect downstream evidence/state and synchronize the established game-content plus item-identity pipelines under their separate authorization gates.
- When a user-linked table begins storing real data, add it to account export in the same authorized change.
- Production counts, deploy status and open work belong in the Current Checklist/evidence, not here.
