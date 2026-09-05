# Email OTP idempotent resend rollback

Use rollback only after an exact Production approval. The safe order is:

1. Redeploy the immediately previous verified `email-otp-auth` Edge deployment:
   Production version 3, JWT verification disabled, whose repository source was
   last changed by commit `0a4d4a9bb82f9314002fa935a973eb2e4c5ceea8`.
   Do not change secrets or any other function.
2. Apply `rollback.sql` to restore the prior one-minute database entrypoint and
   remove only the two delivery helper RPCs and confirmation column introduced
   by `20260905043843_email_otp_idempotent_resend.sql`.
3. Verify the active Edge version, RPC privileges, and one masked request-path
   smoke. Do not send a real email unless that separate Human action is approved.

This rollback intentionally restores the prior duplicate-request behavior, so it
is an emergency compatibility route rather than the desired steady state.

## Immutable artifact checksums

- Forward migration: `c548544e198510f75cbb3eddd490ad430af0c298bc13ae614852474caf6b8c4f`
- Edge entrypoint: `f1e3f0597d3f235a7703be4ffff4cb33eff57c709dd8944778065018b0a635b1`
- Edge request-flow helper: `1685eec6cfa14018d7888f2b966a45da33de2f8e978280cd097f3dc169e7fa89`
- SQL rollback: `1da3dc3cb36e8f7d5f5d16aeb5c0a5635759b2b8a6b500cefcb6d03a9c41a3fd`
