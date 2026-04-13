

## RCA: Lekhraj Cannot Update Mobile Number

### Root Cause
`ProfileSettingsTab.tsx` (lines 100-101, 119-120, 140-141) uses `supabase.functions.invoke('update-user-profile')` for all three operations (email, mobile, password). This is the **same SDK invoke pattern** that caused 401 errors in `password-rollout` and `reset-password`. The SDK fails to reliably forward the `Authorization` header to edge functions.

Evidence: Edge function logs show only `booted` events with **zero application-level logs** — the request hits the `!authHeader` check at line 27 and returns `401 Unauthorized` before any business logic runs.

### Fix
Replace all three `supabase.functions.invoke('update-user-profile')` calls in `ProfileSettingsTab.tsx` with the project-standard `invokeAdminEdgeFunction` utility (which uses raw `fetch` with explicit `Authorization` and `apikey` headers). Despite the name, this utility works for any authenticated edge function — not just admin ones.

### Files to Modify
1. **`src/components/profile/ProfileSettingsTab.tsx`** — Replace 3 `supabase.functions.invoke` calls (lines 101, 120, 141) with `invokeAdminEdgeFunction('update-user-profile', { ... })`; remove the manual session/header plumbing.
2. **`DOCUMENTATION.md`** — Version bump, changelog.
3. **`POLICY.md`** — Note alignment.

### Risk Assessment
- **Data impact**: None
- **Regression risk**: None — same proven pattern used by all other edge function calls
- **Fix confidence**: High

