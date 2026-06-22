## Fix: Password rollout emails failing with "Invalid authorization"

### Root cause
`supabase/functions/password-rollout/index.ts` calls the internal `send-email-notification` function using the **anon key** in `Authorization` + `apikey` headers. The receiving function's `validateCaller` (in `supabase/functions/send-email-notification/index.ts`) was hardened to *reject* anon/publishable keys (since anon is shipped in every browser) and only accept the service-role key, an admin JWT, or a key matching `system_settings.supabase_anon_key`. The caller's comment is stale; the contract changed.

This is unrelated to today's Wave A–G security migrations — the same failure exists in rows from June 18 and 20.

### Risk & Impact Report
- **Data**: None. Only fixes the auth header used on an internal server-to-server fetch.
- **Workflow**: Restores password-rollout email delivery. `Generate & Send` will once again email the generated password to users with real (non-synthetic) addresses. No change for synthetic-email users (still correctly skipped).
- **Security**: Improved. Stops sending the anon key over server-to-server hops; uses the service-role key (already available in the edge-function env), which `send-email-notification` is designed to accept.
- **Regression risk**: Very low. Single 3-line change inside one `try` block, no schema/type/UI impact.
- **Mitigation**: After deploy, trigger one password rollout for a test user (or re-run for `dinesh.chaudhary@bfclalloys.com`) and confirm `password_rollout_logs.email_sent = true` and a new row reaches the inbox.

### Plan
1. Edit `supabase/functions/password-rollout/index.ts` lines ~186–206:
   - Replace the anon-key block with the service-role key in both headers (`Authorization: Bearer ${serviceRoleKey}`, `apikey: serviceRoleKey`).
   - Update the stale comment to document the actual contract (service-role required because the receiver rejects public keys).
   - Keep the existing fallback chain only as a hard guard: if `serviceRoleKey` is somehow unset, fail fast with a clear `emailError` instead of silently downgrading to anon.
2. Deploy the function: `supabase--deploy_edge_functions` for `password-rollout`.
3. Verify:
   - Re-run `Generate & Send` for one row from `pms.bfclalloys.com/admin/settings?section=passwords`.
   - Query `password_rollout_logs` ordered by `created_at desc limit 1` — expect `email_sent = true`, `email_error = null`.

### Not changing
- `send-email-notification` validateCaller logic (correct as-is — it should reject anon).
- Synthetic-email skip path (working correctly).
- Wave G migration / any other security work.

### Rollback
- Revert the single edit in `password-rollout/index.ts` and redeploy. No data, schema, or policy change to undo.

### Documentation / Policy
- Note in `mem://security/auth-email-delivery-strategy` (already exists per index) that internal callers of `send-email-notification` must use the service-role key, never anon.
