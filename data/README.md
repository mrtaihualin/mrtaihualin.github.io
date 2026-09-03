# Game content authoring rules

> Content authority belongs to Lin and the Current Product/Brand sources. This file owns the source-data procedure.

- `data/words-data.js` and `data/adv-sentences.js` are Lin's authoring sources.
- `data/approved-vocabulary-catalog.json` is the single Lin-approved canonical vocabulary master under construction. It contains 389 approved semantic records and one inactive tier allocation: Guest Free 100, Login Free additional 100, and Paid approved 189. It is Source-only and inactive until a separate cutover is explicitly authorized; the current live games continue using the old system.
- `data/paid-vocabulary-review-queue.json` is a separate noncanonical, inactive queue for the 64 displaced old Free words that Lin routed to Paid but has not reviewed. Queue entries are candidates only and never count as approved catalog records.
- `data/approved-vocabulary-catalog.lock.json` is the immutable receipt for both the approved master and the Paid review queue. No AI, validator, calculator, adapter, migration, sync, runtime or other automated system may rewrite these files. A mismatch must stop and be reported to Lin; automatic repair is forbidden. Only Lin's later exact record/field approval can authorize a change. The notification channel and handling flow remain deferred until audio review and cutover.
- `scripts/check-approved-vocabulary-catalog.js` is read-only: it checks the locked bytes, schema, counts, identities, approved sense boundaries, complete tier partition, noncanonical Paid queue and Source-only state. It never edits or approves content.
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
- A source-content change does not authorize migration/deploy to server content or identity tables. That is a separate Production gate.
