# Paid SRS Lin-only private beta recovery

Disable the Paid Tone routes in `game-content` and `tone-round` before database rollback.
The rollback is deliberately fail-closed while any real private-beta state or operation row exists.
Export and obtain separate approval before removing real rows.
