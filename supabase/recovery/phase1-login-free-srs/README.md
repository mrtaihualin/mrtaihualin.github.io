# Phase 1 Login Free SRS rollback

The preferred client rollback is to revert the release commit, which turns the
public SRS flag off and removes `tone-server.js` from the five game pages.

The database migration is a least-privilege repair and changes no player rows.
Leave it applied during a client rollback. `rollback.sql` exists only for an
exact full rollback to the pre-release ACL/policy snapshot and requires a fresh
Production approval because it restores broad `anon`/`authenticated` grants.

The prior active Edge Function is Production `tone-round` v49. Its retrieved
source is byte-identical to commit `988cabf`, Git blob
`9b66f6d01c984a2f5590205138e1039fc9dfead0`. If the current source must be
deployed for content-key compatibility, rollback by restoring that tracked v49
source with `verify_jwt=true`; never copy or log its injected service-role
environment value.
