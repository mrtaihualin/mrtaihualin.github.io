# Phase 1 Login Free Review recovery

The first and safest rollback is runtime-only: keep the public Review entry and
`HIDDEN_REVIEW_SCORE_DEFAULT_ENABLED` off, or redeploy the last verified
`score-submit` version with Review disabled. Leave the Review tables intact so
no learning history is lost.

`rollback-empty-schema.sql` is only for a pre-activation or zero-data rollback.
It fails closed if any Review operation/state or stable-item SRS row exists.
Exported evidence and a separately approved data migration are required before
removing an in-use schema.

