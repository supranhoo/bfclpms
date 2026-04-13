

## RCA: Password Rollout 401 Unauthorized

### Root Cause

The `usePasswordRolloutMutation` hook invokes the edge function via `supabase.functions.invoke()` (SDK method), while the project's own security policy documents that **SDK-level invocation can strip or fail to forward the `Authorization` header reliably**.

All other admin edge functions in this project use `invokeAdminEdgeFunction()` from `src/lib/adminEdgeFunction.ts`, which explicitly sets `Authorization: Bearer <token>` and `apikey` headers via raw `fetch`. The password-rollout function is the only admin function still using the SDK invoke pattern.

The edge function logs confirm: the function boots but produces zero application-level logs — meaning the request hits the `!authHeader` check at line 161 and returns 401 immediately, before any business logic runs.

### Fix

**File: `src/hooks/usePasswordRollout.ts`** — Replace `supabase.functions.invoke` with `invokeAdminEdgeFunction`:

```typescript
import { invokeAdminEdgeFunction } from '@/lib/adminEdgeFunction';

// In mutationFn:
const data = await invokeAdminEdgeFunction<{
  total: number; succeeded: number; failed: number; details: any[];
}>('password-rollout', { user_ids: userIds, send_email: sendEmail });
return data;
```

**File: `DOCUMENTATION.md` / `POLICY.md`** — Version bump and changelog entry.

### Risk Assessment
- **Data impact**: None
- **Regression risk**: None — aligns with the pattern every other admin function already uses
- **Fix confidence**: High — this is the exact same fix applied to other admin functions previously

