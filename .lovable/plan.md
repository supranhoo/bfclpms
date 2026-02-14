
# Architectural Stability and Race Condition Fixes

## Overview

Two targeted fixes: (1) eliminate the AuthContext race condition that can cause "forever loading" or duplicate fetches, and (2) wrap all unmemoized `submissionMap` / `queryMap` instances in `useMemo` to prevent unnecessary re-renders.

## Change 1: AuthContext Refactor

**File**: `src/contexts/AuthContext.tsx`

**Problem**: Both `onAuthStateChange` and `getSession()` run concurrently on mount. If both fire for the same user, `fetchProfile` and `fetchRole` execute twice. If either fetch fails silently, the user sees a forever-loading state or gets null profile/role with no feedback.

**Fix**:
- Add a `useRef` flag (`initializedRef`) set to `true` after the first successful processing
- `getSession()` sets user/session and calls fetch only if `initializedRef` is still `false`
- `onAuthStateChange` always processes (it handles login/logout/token refresh events throughout the session lifetime), but the `setTimeout` workaround is removed -- fetches are called directly since they don't call Supabase Auth APIs
- Wrap `fetchProfile` and `fetchRole` in try/catch blocks. On failure, show a toast: "Failed to load user profile. Please refresh." and set `loading` to `false` so the UI doesn't hang

**Before (simplified)**:
```text
useEffect:
  onAuthStateChange -> setUser, setTimeout(fetchProfile, fetchRole)
  getSession        -> setUser, fetchProfile, fetchRole
  // Both can fire for same user = double fetch
  // No error handling = silent failure
```

**After (simplified)**:
```text
useEffect:
  initializedRef = false

  onAuthStateChange -> if not initialized: mark initialized, setUser, fetchProfile, fetchRole
                       if already initialized: handle event normally (login/logout/refresh)

  getSession        -> if not initialized: mark initialized, setUser, fetchProfile, fetchRole
                       if already initialized: skip (subscription already handled it)

  fetchProfile/fetchRole -> try/catch with toast on failure
```

This guarantees exactly one initialization path fires, while ongoing auth events (token refresh, sign-out) continue to work normally.

## Change 2: Memoization Fixes

Four components create `submissionMap` and/or `queryMap` on every render without `useMemo`. These need wrapping:

| File | Variable(s) | Fix |
|---|---|---|
| `src/components/review/AuditScorecard.tsx` | `submissionMap`, `queryMap` | Wrap in `useMemo` |
| `src/components/review/ManagementScorecard.tsx` | `submissionMap`, `queryMap` | Wrap in `useMemo` |
| `src/pages/reports/PerformanceReport.tsx` | `submissionMap` | Wrap in `useMemo` |
| `src/components/dashboard/KpiTrackerModal.tsx` | `submissionMap` | Wrap in `useMemo` |

**Already correct** (no changes needed):
- `Dashboard.tsx` -- already uses `useMemo`
- `UnifiedScorecard.tsx` -- already uses `useMemo`
- `EmployeeScorecard.tsx` -- already uses `useMemo`
- `useReviewPageState.ts` -- already uses `useMemo`
- `KpiHistoryCard.tsx` -- computed inside a `useMemo` callback (derived data)
- `MonthlyScorecardReport.tsx` -- computed inside a `useMemo` callback

## Change 3: Documentation

Update `DOCUMENTATION.md` to record the AuthContext fix and memoization improvements.

## Files Modified

| File | Change |
|---|---|
| `src/contexts/AuthContext.tsx` | Add ref guard, try/catch with toast, remove setTimeout |
| `src/components/review/AuditScorecard.tsx` | Wrap submissionMap + queryMap in useMemo |
| `src/components/review/ManagementScorecard.tsx` | Wrap submissionMap + queryMap in useMemo |
| `src/pages/reports/PerformanceReport.tsx` | Wrap submissionMap in useMemo |
| `src/components/dashboard/KpiTrackerModal.tsx` | Wrap submissionMap in useMemo |
| `DOCUMENTATION.md` | Record changes |

## Risk

- **AuthContext**: Low risk. The ref guard is additive -- it prevents duplicate processing but doesn't change the auth flow. Sign-in, sign-out, and token refresh continue to work via `onAuthStateChange`.
- **Memoization**: Zero risk. Wrapping in `useMemo` only prevents unnecessary recalculation; the output is identical.
