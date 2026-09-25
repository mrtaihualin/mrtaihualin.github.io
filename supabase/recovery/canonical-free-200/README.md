# Canonical Free 200 recovery

Rollback is preserved in `rollback.sql` but is not authorized. The Production migration stores every prior `game_words` record and rank before activating the exact 200-record catalog. The rollback also restores any generic `word@level` learning-item keys changed by this cutover while preserving `item_id` and user history. Execute rollback only after a separate Lin approval and redeploy the pre-cutover `game-content` Edge Function.
