# Root Cause

Password generation succeeds, but the email dispatch from `password-rollout` → `send-email-notification` is rejected with `{"error":"Invalid authorization"}`.

Edge logs from `send-email-notification` (11:21:57 UTC):
```
authHeader present: true   apikey header present: false
SUPABASE_ANON_KEY len: 46  SERVICE_ROLE_KEY len: 41  PUBLISHABLE_KEY len: 0
All auth checks failed. Bearer token length: 386
```

What this means:
- `password-rollout` sends only `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>` (no `apikey` header).
- The runtime env `SUPABASE_SERVICE_ROLE_KEY` is **41 chars** (the new asymmetric "secret reference" placeholder), but the actual JWT Supabase mints into the request is **386 chars**. They don't match, so `validKeys.has(token)` fails.
- `validateCaller` then falls through to `supabase.auth.getUser(token)` — which also fails because a service-role JWT isn't a user JWT.
- No `apikey` header is sent, so the system_settings fallback (which stores the 208-char publishable key) never runs.

Net effect: every dispatch since the key rotation returns 401, password is set but `email_sent = false`.

The earlier `update-user-email` fix is unrelated; this is a separate auth-key mismatch.

# Plan

**1. `supabase/functions/password-rollout/index.ts` — fix dispatch headers**

Replace the raw `fetch` with the canonical pattern that always validates:
- Add `apikey: <SUPABASE_ANON_KEY>` header alongside `Authorization: Bearer <serviceRoleKey>`.
- Prefer using the existing `adminClient.functions.invoke('send-email-notification', { body })` — it injects the correct `apikey` automatically and handles the new asymmetric-key format.

Switching to `functions.invoke` removes the brittle string comparison entirely.

**2. No changes to `send-email-notification`** — its `validateCaller` already accepts a matching `apikey` header; we just have to send one.

**3. Regression guard**

Add a tiny unit test (or extend `src/test/adminEdgeFunction.test.ts`) asserting that any internal edge-to-edge dispatch helper sends both `Authorization` AND `apikey` headers. This prevents future regressions when other functions copy this pattern.

**4. Docs**

- Append POLICY entry §114: "Edge-to-edge calls must use `adminClient.functions.invoke()` (or include both `Authorization` + `apikey` headers). Bearer-only calls break under the new asymmetric service-role keys."
- Add `docs/adr/ADR-064.md` summarizing the auth-key length mismatch and the canonical dispatch pattern.
- Update `mem/architecture/notification-and-dispatch-engine` with the new dispatch rule.

## Risk & Impact

- **Data**: None. Header-only change.
- **Workflow**: Restores password rollout email delivery. No change to password generation itself.
- **UI**: None.
- **Regression**: Low — `functions.invoke` is already used elsewhere in the codebase. Test added.
- **Other dispatchers to audit (separate follow-up if you confirm symptoms)**: `send-monthly-review-reminder`, `send-pending-report-reminder`, `send-query-observation-reminders`, `send-scheduled-emails` — any that also call `send-email-notification` via raw fetch with Bearer-only will have the same bug.

## Verification

1. Re-run "Generate & Send" for one user.
2. Check `password_rollout_logs` → `email_sent = true`, `email_error IS NULL`.
3. Check `send-email-notification` logs for `Authorized via apikey header match`.
