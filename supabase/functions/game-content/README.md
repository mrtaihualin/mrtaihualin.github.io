# Game-content Edge gate

> Current commercial quotas and Product tiers come from Current Product authority. Numbers in source are implementation baselines, not future Product decisions.

- `game_words` and `game_sentences` must not be directly readable by `anon` or `authenticated` clients.
- The Edge Function is the entitlement gate. Determine identity/tier from verified server-side authentication; never trust a tier supplied by request body or client state.
- Return only rows and audio availability within the verified entitlement. Do not expose private storage paths or full protected catalogs.
- Required-data, audio, rate-limit and authorization failures fail closed with a recoverable client error.
- Keep JWT verification enabled for this function.
- Current source caps must be read from the deployed/source version and treated as implementation state only.
- Test/deploy results belong in the Current Checklist or `MAINTENANCE.md`, not in this invariant file.
