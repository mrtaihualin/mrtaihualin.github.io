# Game content authoring rules

> Content authority belongs to Lin and the Current Product/Brand sources. This file owns the source-data procedure.

- `data/words-data.js` is a historical corpus and is not Current content. It is `LEGACY_CONTENT_READ_DENY`: AI must not open, search inside, parse, index, summarize, copy, derive from or run any script that loads it unless Lin explicitly orders retrieval of the old/legacy corpus for the exact task.
- The retired `data/history/vocabulary/` and `data/approved-vocabulary-catalog.lock.json` evidence is quarantined at `/Users/taihualin/Documents/Claude/Projects/04_WORKING/99_ARCHIVE/AI_READ_DENY_LEGACY_VOCABULARY_EVIDENCE_2026-09-11/`. That quarantine, its former Git-history paths, and all copies remain `LEGACY_CONTENT_READ_DENY`; path and permission metadata may be inspected only to enforce the boundary.
- `data/adv-sentences.js` remains Lin's sentence-authoring source; this does not authorize access to the protected legacy word corpus.
- `data/approved-vocabulary-catalog.json` is the single active Lin-approved canonical vocabulary master. Version `free-200-v1` contains exactly 200 semantic records: Guest Free 50 `初` + 50 `中`, and Login Free adds 50 `初` + 50 `中`. Paid content is not active.
- Protected history and its former combined lock/checker are retired from default AI and CI access. Reactivation requires Lin's explicit old/legacy-corpus instruction and a separately authorized release.
- `data/approved-paid-vocabulary-queue.json` indexes the exact 189-record payload rebound from local evidence commit `9200d15`. The migration embeds the immutable reviewed fields, while default AI/CI verification uses only that commit-bound payload and must not open protected history.
- The Paid queue remains `queued-inactive` and unavailable to every game until a separate Product entitlement decision and Production HIGH approval. The separate 64 unreviewed records remain outside this queue.
- AI may not invent, add, remove or change words, sentences, translations or readings. Computed decomposition fields require Lin to review every word and every field before publish.
- Builders such as `buildWordsForPhonicsGames` and `buildSentencesForPhonicsGames` must preserve every field used by games, including `readingTH`.
- Reviewed verb rows require explicit `word`, `spellingTH`, `readingTH`, canonical `syllables`, and `spellingSyllables`. Some reviewed words intentionally have written grouping that differs from phonological syllables, so runtime must never split these strings to manufacture display parts. A mismatch fails closed for manual review.
- Every active catalog record contains `spellingSyllables`, the exact already-reviewed written-syllable objects used by the UI. The cleanup migration promotes the complete explicit catalog record and then drops the retired parallel column; it must not read or repair from that column. Runtime copies this field exactly and may not infer Thai boundaries or fall back to another record.
- Reviewed verbs carry no image/object-use metadata. Real audio remains `audioStatus: 'ยังไม่เช็ก'` until separately verified; never infer PASS from a filename or generated asset.
- Run only checks that do not load a protected legacy path unless Lin explicitly unlocks that corpus. Runtime language calculators are forbidden; validate reviewed catalog fields instead.
- Every field in Lin's approved `canonical_record`, including `toneNumber` and `toneName`, is final authority. There is no calculator result to compare with or override it.
- Do not reintroduce `CONS_SOUND` or `FINAL_SOUND` transformation. `CONS_GROUPS`, `VOWEL_GROUPS` and `FINAL_GROUPS` remain distractor-group data, not pronunciation conversion.
- Stored `cons` and `final` values must satisfy the existing data checks and preserve the written form expected by the games.
- In the established advanced-sentence data rule, `นะ` uses `politeF: 'คะ'`.
- A source-content change does not authorize migration/deploy to server content or identity tables. The `free-200-v1` cutover has its own explicit Lin authorization; every later release still requires a separate Production gate.
- Legacy-loading/import/calculation tools have been deleted. Do not restore them. Current checks may read only the authorized canonical catalog and must validate stored fields without deriving language answers.
