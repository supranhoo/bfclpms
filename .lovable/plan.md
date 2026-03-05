

# Fix: Management Dashboard Stuck in Loading State

## Root Cause

The dashboard query is getting **restarted mid-flight**, creating an apparent infinite loading loop:

1. Component mounts with `filtersLoading = true`. The `filteredEmployeeIds` array is empty `[]`.
2. The management-dashboard query starts immediately (no `enabled` guard) with the empty array in the query key.
3. The query is slow — it paginates sequentially across 2 calendar years (5-6 HTTP requests, ~15-20 seconds total).
4. While the query is mid-flight, the profiles-hierarchy query completes. `filteredEmployeeIds` changes from `[]` to `[...454 ids]`.
5. React Query detects the query key changed and **cancels and restarts** the entire query from scratch.
6. The cycle can repeat if any other key dependency updates during execution.

## Fix Plan

### `src/pages/ManagementDashboard.tsx`

**Change 1 — Add `enabled: !filtersLoading`** to the `useQuery` call (line 153). This prevents the query from starting before profiles are loaded, eliminating the restart.

**Change 2 — Remove `filteredEmployeeIds` from query key.** Replace it with a stable string representation: `filteredEmployeeIds.join(',')`. This prevents array reference changes from triggering restarts while still properly cache-busting when the actual filter values change.

**Change 3 — Parallelize calendar year fetches.** Change the `for...of` loop (line 169) to use `Promise.all` so both calendar years fetch concurrently instead of sequentially, cutting load time roughly in half.

### Risk Assessment
- No schema changes. Read-only display fix.
- Low regression risk — only affects query timing and caching behavior.

