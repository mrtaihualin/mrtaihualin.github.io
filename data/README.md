# Game content authoring rules

> Content authority belongs to Lin and the Current Product/Brand sources. This file owns the source-data procedure.

- `data/words-data.js` and `data/adv-sentences.js` are Lin's authoring sources.
- `data/approved-vocabulary-catalog.json` is the single active Lin-approved canonical vocabulary master. Version `free-200-v1` contains exactly 200 semantic records: Guest Free 50 `初` + 50 `中`, and Login Free adds 50 `初` + 50 `中`. Paid content is not active.
- `data/history/vocabulary/2026-09-03-pre-free-200/` preserves the 189 formerly approved surplus records and the 64 unreviewed surplus candidates outside the active catalog. Neither file may be consumed by runtime. Reactivation requires review of the complete intended batch and a separately authorized release.
- `data/approved-vocabulary-catalog.lock.json` is the immutable receipt for the active 200 and both history files. No AI, validator, calculator, adapter, migration, sync, runtime or other automated system may rewrite these files. A mismatch must stop and be reported to Lin; automatic repair is forbidden. Only Lin's later exact record/field approval can authorize a change. The notification channel and handling flow remain deferred until audio review.
- `scripts/check-approved-vocabulary-catalog.js` is read-only: it checks locked bytes, schema, counts, identities, the complete Guest/Login Free allocation, corrections and disjoint inactive history. It never edits or approves content.
- AI may not invent, add, remove or change words, sentences, translations or readings. Computed decomposition fields require Lin to review every word and every field before publish.
- Builders such as `buildWordsForPhonicsGames` and `buildSentencesForPhonicsGames` must preserve every field used by games, including `readingTH`.
- Reviewed verb rows require explicit `word`, `spellingTH` and `readingTH`. Split both authority strings on `-`; their part counts must equal `syls.length`, and the `spellingTH` parts must join exactly to `word`. A mismatch fails closed for manual review.
- Do not store per-syllable written/read text redundantly for reviewed verbs. Runtime adapters derive `syls[].th` from `spellingTH`; synced verb JSON must omit that derived field.
- Reviewed verbs carry no image/object-use metadata. Real audio remains `audioStatus: 'ยังไม่เช็ก'` until separately verified; never infer PASS from a filename or generated asset.
- Run the repository data-health checks whenever game data changes. When `data/tone-engine.js` changes, also run `node data/tools/regression-check-tone.js`.
- Lin-authored content and `tone_name` are the authority over a calculator result.
- Do not reintroduce `CONS_SOUND` or `FINAL_SOUND` transformation. `CONS_GROUPS`, `VOWEL_GROUPS` and `FINAL_GROUPS` remain distractor-group data, not pronunciation conversion.
- Stored `cons` and `final` values must satisfy the existing data checks and preserve the written form expected by the games.
- In the established advanced-sentence data rule, `นะ` uses `politeF: 'คะ'`.
- A source-content change does not authorize migration/deploy to server content or identity tables. The `free-200-v1` cutover has its own explicit Lin authorization; every later release still requires a separate Production gate.
