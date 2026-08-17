# Game content authoring rules

> Content authority belongs to Lin and the Current Product/Brand sources. This file owns the source-data procedure.

- `data/words-data.js` and `data/adv-sentences.js` are Lin's authoring sources.
- AI may not invent, add, remove or change words, sentences, translations or readings. Computed decomposition fields require Lin to review every word and every field before publish.
- Builders such as `buildWordsForPhonicsGames` and `buildSentencesForPhonicsGames` must preserve every field used by games, including `readingTH`.
- Run the repository data-health checks whenever game data changes. When `data/tone-engine.js` changes, also run `node data/tools/regression-check-tone.js`.
- Lin-authored content and `tone_name` are the authority over a calculator result.
- Do not reintroduce `CONS_SOUND` or `FINAL_SOUND` transformation. `CONS_GROUPS`, `VOWEL_GROUPS` and `FINAL_GROUPS` remain distractor-group data, not pronunciation conversion.
- Stored `cons` and `final` values must satisfy the existing data checks and preserve the written form expected by the games.
- In the established advanced-sentence data rule, `นะ` uses `politeF: 'คะ'`.
- A source-content change does not authorize migration/deploy to server content or identity tables. That is a separate Production gate.
