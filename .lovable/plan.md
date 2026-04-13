

## Fix: Password Rollout Edge Function Still Using Inline Auth

### Root Cause
The previous fix only updated the **client-side** hook (`usePasswordRollout.ts`) to use `invokeAdminEdgeFunction`. However, the **edge function itself** (`supabase/functions/password-rollout/index.ts`) was never refactored to use the shared `requireAdminUser` helper.

It still has ~40 lines of inline auth logic (lines 159-199) using `supabase.auth.getUser()`, while the proven shared helper uses `getClaims(token)`. Every other admin function (`reset-password`, `update-user-email`, `bulk-zero-score-non-submitters`, etc.) has already been migrated to the shared helper.

### Fix

**File: `supabase/functions/password-rollout/index.ts`**

Replace lines 155-199 (the entire inline auth block) with:

```typescript
import { requireAdminUser } from "../_shared/admin-auth.ts";

// Inside handler, after OPTIONS check:
const auth = await requireAdminUser(req);
if (!auth.authorized || !auth.adminClient) {
  return new Response(JSON.stringify({ error: auth.error }), {
    status: auth.status || 401,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const supabaseAdmin = auth.adminClient;
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
```

Then use `auth.user!.id` as `generatedBy` instead of the old `user.id`.

Remove the old `createClient` import (the shared helper handles it). Keep the `createClient` import from npm only if `processOneUser` still needs it for email dispatch — but the admin client from the helper can be reused.

**File: `DOCUMENTATION.md`** — Version bump, changelog entry.

**File: `POLICY.md`** — Note password-rollout alignment.

### Files Modified
1. `supabase/functions/password-rollout/index.ts` — replace inline auth with `requireAdminUser`
2. `DOCUMENTATION.md` — changelog
3. `POLICY.md` — changelog

### Risk Assessment
- **Data impact**: None
- **Regression risk**: None — identical pattern to all other working admin functions
- **Fix confidence**: High — `requireAdminUser` is battle-tested across 5+ functions

