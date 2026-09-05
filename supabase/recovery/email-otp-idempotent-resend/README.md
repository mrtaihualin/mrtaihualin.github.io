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
