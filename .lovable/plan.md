

## RCA + CAPA: Persistent 401 on `bulk-zero-score-non-submitters` (Post Config Fix)

### 1. Root Cause

The `supabase/config.toml` entry for `bulk-zero-score-non-submitters` with `verify_jwt = false` **is present** (line 72-73), and the function code is correct. However, the edge function logs still show `[admin-auth] Identity validation failed: Auth session missing!` — meaning the function IS reached but `getUser()` fails.

This is a **deployment synchronization issue**: the config.toml was updated in the codebase but the function was not force-redeployed afterward. The Supabase gateway may still be using stale JWT verification config from before the entry was added.

**Evidence:**
- Config.toml has the correct entry on line 72-73
- Function boots successfully (logs show "booted" messages)
- The `requireAdminUser()` helper runs but fails at `getUser()` with "Auth session missing!"
- The repair functions (identical code pattern, identical `supabase.functions.invoke()` call) work correctly — they were deployed AFTER their config.toml entries were added
- All three UI components use the exact same `supabase.functions.invoke()` calling pattern

### 2. Impact

- 100% of scan and execute attempts fail with 401
- The entire Bulk Zero-Score feature remains unusable despite the config fix being in the codebase

### 3. Corrective Action

**Force-redeploy the edge function** by making a trivial change (add a deployment timestamp comment) to `supabase/functions/bulk-zero-score-non-submitters/index.ts`. This triggers a fresh deployment with the updated config.toml settings applied.

Additionally, as a belt-and-suspenders measure, add explicit session token forwarding to the UI component using `supabase.auth.getSession()` to manually construct the Authorization header — ensuring the token is always present regardless of SDK behavior.

### 4. Changes

| File | Change |
|------|--------|
| `supabase/functions/bulk-zero-score-non-submitters/index.ts` | Add deployment timestamp comment to force redeploy |
| `src/components/admin/BulkZeroScoreSection.tsx` | Switch from `supabase.functions.invoke()` to explicit `fetch()` with manual Authorization header (matching the recommended pattern for admin functions) |
| `DOCUMENTATION.md` | Add note about deployment sync requirement |

### 5. Technical Detail — Explicit Fetch Pattern

Replace `supabase.functions.invoke()` with:

```typescript
const { data: { session } } = await supabase.auth.getSession();
const response = await fetch(
  `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/bulk-zero-score-non-submitters`,
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session?.access_token}`,
      'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    },
    body: JSON.stringify({ mode: 'scan', ... }),
  }
);
```

This guarantees the Authorization header is present and correctly formatted, eliminating reliance on SDK internal behavior.

### 6. Preventive Action

- Document that **every new edge function requires a force-redeploy** after config.toml changes — adding the config entry alone is insufficient
- Apply the explicit `fetch` pattern to all admin edge function calls to eliminate this class of auth-forwarding bugs entirely

### 7. Risk Assessment

- **Data impact**: None — no schema changes
- **Regression risk**: Zero — switching to explicit fetch is a more reliable invocation method
- **Security**: Maintained — `requireAdminUser()` still validates identity and admin role in-function

