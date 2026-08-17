# LINE webhook operations

> Production changes follow Canonical Workflow v1 Production Safety and require the exact applicable authorization.

- LINE calls this public webhook without a Supabase user JWT; keep this function configured with `verify_jwt=false` and deploy it with the explicit intended project ref.
- `LINE_CHANNEL_SECRET` is the Messaging API channel secret and is distinct from any LINE Login channel secret. Never expose either value.
- Diagnose delivery in this order: LINE Developers Verify HTTP result → configured Messaging channel secret → OA response mode.
- Use Edge Function **Invocations** to prove requests reached runtime. System Logs alone are not request evidence.
- Ordinary teacher text without a pending contact state may be silent by design. Button actions, malformed payloads and rejected signatures must keep the established safe response/log behavior.
- If `GOOGLE_CALENDAR_ID`, LINE configuration or credentials change, perform controlled parity/invocation verification before claiming the integration works.
- Stale LINE buttons remain in chat history. Keep safe compatibility handlers; do not delete a handler and leave old buttons silent.
