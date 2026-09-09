# Game content authoring rules

> Content authority belongs to Lin and the Current Product/Brand sources. This file owns the source-data procedure.

- `data/words-data.js` is a historical corpus and is not Current content. It is `LEGACY_CONTENT_READ_DENY`: AI must not open, search inside, parse, index, summarize, copy, derive from or run any script that loads it unless Lin explicitly orders retrieval of the old/legacy corpus for the exact task.
- `data/history/vocabulary/` and `data/approved-vocabulary-catalog.lock.json` preserve protected legacy evidence and are also `LEGACY_CONTENT_READ_DENY`; path metadata may be inspected only to enforce the boundary.
- `data/adv-sentences.js` remains Lin's sentence-authoring source; this does not authorize access to the protected legacy word corpus.
- `data/approved-vocabulary-catalog.json` is the single active Lin-approved canonical vocabulary master. Version `free-200-v1` contains exactly 200 semantic records: Guest Free 50 `初` + 50 `中`, and Login Free adds 50 `初` + 50 `中`. Paid content is not active.
- Protected history and its former combined lock/checker are retired from default AI and CI access. Reactivation requires Lin's explicit old/legacy-corpus instruction and a separately authorized release.
- `data/approved-paid-vocabulary-queue.json` indexes the exact 189-record payload rebound from local evidence commit `9200d15`. The migration embeds the immutable reviewed fields, while default AI/CI verification uses only that commit-bound payload and must not open protected history.
- The Paid queue remains `queued-inactive` and unavailable to every game until a separate Product entitlement decision and Production HIGH approval. The separate 64 unreviewed records remain outside this queue.
- AI may not invent, add, remove or change words, sentences, translations or readings. Computed decomposition fields require Lin to review every word and every field before publish.
- Builders such as `buildWordsForPhonicsGames` and `buildSentencesForPhonicsGames` must preserve every field used by games, including `readingTH`.
- Reviewed verb rows require explicit `word`, `spellingTH` and `readingTH`. Split both authority strings on `-`; their part counts must equal `syls.length`, and the `spellingTH` parts must join exactly to `word`. A mismatch fails closed for manual review.
- Do not store per-syllable written/read text redundantly for reviewed verbs. Runtime adapters derive `syls[].th` from `spellingTH`; synced verb JSON must omit that derived field.
- Reviewed verbs carry no image/object-use metadata. Real audio remains `audioStatus: 'ยังไม่เช็ก'` until separately verified; never infer PASS from a filename or generated asset.
- Run only checks that do not load a protected legacy path unless Lin explicitly unlocks that corpus. When `data/tone-engine.js` changes, do not run the legacy-corpus regression path without that authorization.
- Lin-authored content and `tone_name` are the authority over a calculator result.
- Do not reintroduce `CONS_SOUND` or `FINAL_SOUND` transformation. `CONS_GROUPS`, `VOWEL_GROUPS` and `FINAL_GROUPS` remain distractor-group data, not pronunciation conversion.
- Stored `cons` and `final` values must satisfy the existing data checks and preserve the written form expected by the games.
- In the established advanced-sentence data rule, `นะ` uses `politeF: 'คะ'`.
- A source-content change does not authorize migration/deploy to server content or identity tables. The `free-200-v1` cutover has its own explicit Lin authorization; every later release still requires a separate Production gate.
- Legacy-loading tools are forbidden by default, including `scripts/migrate-game-content.js`, `scripts/audit-learning-content.js`, `scripts/check-approved-vocabulary-catalog.js`, `scripts/tests-approved-vocabulary-catalog.js`, `scripts/tests-vocab-sense-scope.js`, `data/tools/check-data-health.js`, `data/tools/check-duplicate-words.js` and `data/tools/regression-check-tone.js`.
