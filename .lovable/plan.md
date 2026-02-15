

# RCA: Trigger-Based Emails Failing with 401

## Root Cause Analysis

### What Works
- In-app notifications are created correctly (26 notifications found today)
- Test emails from UI work (user JWT auth, latest log at 05:42)
- The DB trigger fires and calls `net.http_post` successfully
- The anon key is correctly stored in `system_settings` and extracted by the trigger

### What Fails
- Every `net.http_post` call from the trigger returns **HTTP 401**
- Two error variants: "Authorization required" (before migration) and "Invalid authorization" (after migration)
- The `net._http_response` table shows 10+ consecutive 401s with zero successes

### Why It Fails
The `validateCaller` function checks the `Authorization` Bearer token against `SUPABASE_ANON_KEY` env var. Despite the code being correct in the repo, the deployed edge function is not recognizing the anon key. Possible causes:

1. **Deployment timing**: The edge function may not have been fully redeployed after the anon key check was added
2. **Env var availability**: `SUPABASE_ANON_KEY` may be null or have a slightly different value in the edge runtime
3. **Single validation path**: Only checking the Bearer token in `Authorization` header, not the `apikey` header that the trigger also sends

## Fix

Make the auth check more robust by also checking the `apikey` header (which the trigger sends), add debug logging, and force a fresh deployment.

### Changes in `supabase/functions/send-email-notification/index.ts`

Update `validateCaller` to:

1. Also read the `apikey` header from the request
2. Compare the `apikey` header value against both `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY`
3. Add console.log debug lines showing token length and env var availability so future 401s can be diagnosed from logs
4. This gives the trigger TWO ways to authenticate instead of just one

```text
// Enhanced validateCaller pseudo-code
const apiKeyHeader = req.headers.get("apikey");

// Check apikey header (used by DB triggers via net.http_post)
if (apiKeyHeader) {
  if (anonKey && apiKeyHeader === anonKey) return authorized;
  if (serviceRoleKey && apiKeyHeader === serviceRoleKey) return authorized;
}
```

### Force Redeploy

Redeploy the edge function to ensure the latest code is live.

### Documentation

Update `DOCUMENTATION.md` to document the dual-header auth pattern for trigger calls.

## Files to Modify

| File | Change |
|---|---|
| `supabase/functions/send-email-notification/index.ts` | Add `apikey` header check in `validateCaller` + debug logging |
| `DOCUMENTATION.md` | Document dual-auth pattern |

## Risk Assessment
- Very low risk: only adds an additional auth check path, does not remove existing checks
- Debug logging helps diagnose any future auth issues
- No database or frontend changes needed
