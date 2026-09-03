# Learning Foundation invariants

> Product semantics and rollout status route through the Website Current authorities. This file owns stable architecture constraints.

- Reuse the existing Learning Item/Memory/Skill/content model. Do not create a parallel model; route a claimed gap to Current Product/architecture authority.
- `learning_items.item_id` is stable identity. When a content key changes, preserve its history in `learning_item_key_history`.
- `practice_events` is append-only raw evidence; `learning_memory` is derived state.
- The locked pre-SRS Review route is operational state, not a second Learning Item or Skill/Memory model: it uses `learning_items.item_id` resolved from the existing `content_ref`, keeps game histories isolated, and enters the existing `tone_srs_state` owner atomically. Missing or ambiguous identity fails closed.
- The canonical 0–10 learning score is decided per item by that game's server-verifiable rules before combo, golden, level, end-round or SRS bonuses. Client-provided score values are never authoritative and scores are not normalized across games.
- `score-submit/learning-score-verifier.mjs` is the hidden/default-OFF server source for all five games. It recomputes only from primitive attempt evidence plus protected canonical content, rejects a client learning-score field, resolves exact existing `content_ref`, and collapses Tone sentence components to one stable sentence item. It performs no state write and is not deployed or enabled.
- Saved/Vault, Played evidence and Learning Memory are distinct concepts and may not be inferred from one another.
- Personal learning items are owner-only. System content has no personal owner. Preserve RLS isolation.
- Empty lookup tables may be intentional. Do not invent Skill/tag/formula/price/quota/game-compatibility values that Product authority has not locked.
- Plan, Price, Entitlement and Grant remain separate models; do not collapse them into a `paid=true` flag.
- Content changes must inspect downstream evidence/state and synchronize the established game-content plus item-identity pipelines under their separate authorization gates.
- When a user-linked table begins storing real data, add it to account export in the same authorized change.
- Production counts, deploy status and open work belong in the Current Checklist/evidence, not here.
