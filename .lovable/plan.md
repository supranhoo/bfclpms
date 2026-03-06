

# RCA: Dashboard "Something went wrong" Crash for All Users

## Root Cause Analysis

The previous fix added `!profile` to the Dashboard's `isLoading` guard. However, the **actual root cause is in `AuthContext.tsx`**, and the fix was incomplete.

### The Real Bug (AuthContext Race Condition)

In `AuthContext.tsx`, when a user session is detected:

```
setSession(session);
setUser(session.user);
fetchProfile(session.user.id);   // async, no await
fetchRole(session.user.id);       // async, no await
setLoading(false);                // fires IMMEDIATELY
```

`setLoading(false)` fires **before** `fetchProfile` and `fetchRole` complete. This means:
1. `DashboardLayout` sees `loading = false` and renders `<Outlet />`
2. Dashboard renders with `profile = null` and `role = null`
3. Child components or hooks that depend on profile data crash during render

The previous fix (`!profile` in Dashboard's `isLoading`) works **only if** the Dashboard re-renders when profile arrives. But there's a timing window where the component tree can crash before that re-render.

Additionally, even with the Dashboard guard, other pages (QueryInbox, ManagementDashboard, etc.) that are also rendered inside `<DashboardLayout>` may have the same vulnerability.

### Why "all users" are affected

This isn't related to today's Scheduled Lock changes. It's a pre-existing race condition that manifests based on network timing. Slower profile/role fetch = higher crash probability.

## Fix Plan

### 1. Fix AuthContext to properly await profile + role before `setLoading(false)`

**File:** `src/contexts/AuthContext.tsx`

Change the auth state handler to `await` both `fetchProfile` and `fetchRole` before calling `setLoading(false)`. This ensures no downstream component ever sees `loading = false` with `profile = null`.

```typescript
// Before:
fetchProfile(session.user.id);
fetchRole(session.user.id);
setLoading(false);

// After:
await Promise.all([
  fetchProfile(session.user.id),
  fetchRole(session.user.id),
]);
setLoading(false);
```

This requires making the `fetchProfile` and `fetchRole` functions return promises (they already do, they're just not being awaited).

### 2. Keep the Dashboard guard as a safety net

The `!profile` guard in Dashboard.tsx stays as defense-in-depth, but the primary fix is in AuthContext.

### 3. Add global unhandled rejection handler in App.tsx

As a safety net for any remaining async errors, add a global `unhandledrejection` listener to prevent white-screen crashes.

### Files to Modify

| File | Change |
|------|--------|
| `src/contexts/AuthContext.tsx` | Await fetchProfile + fetchRole before setLoading(false) in both the onAuthStateChange handler and getSession callback |
| `src/App.tsx` | Add global unhandledrejection safety net |

### Risk Assessment
- **Data Impact**: None — no schema or RLS changes
- **Regression Risk**: Low — only changes the timing of when `loading` flips to `false`
- **UI Impact**: Users may see the loading spinner ~100-200ms longer (waiting for profile), which is correct behavior

