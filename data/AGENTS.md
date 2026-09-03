# Protected legacy vocabulary boundary

`words-data.js`, `history/vocabulary/` and `approved-vocabulary-catalog.lock.json` are historical protected material and are `LEGACY_CONTENT_READ_DENY`.

- AI must not open, read, search inside, parse, index, summarize, copy, derive from or execute/load these paths.
- Do not use scripts or tests that load them.
- Do not run a broad scanner against this directory unless it provably excludes these paths before opening files; path metadata alone is allowed for boundary enforcement.
- Only Lin's latest explicit instruction to retrieve/read the old or legacy corpus for an exact named task unlocks that exact scope.
- Current player-accessible vocabulary defaults to the server-gated 200-word set (`初 100 + 中 100`) in `../supabase/functions/game-content/index.ts`; `approved-vocabulary-catalog.json` is the Current 200 source artifact and is not part of the read deny.
- If blocked by this rule, report `LEGACY_CONTENT_READ_DENY` without inspecting the protected paths.
