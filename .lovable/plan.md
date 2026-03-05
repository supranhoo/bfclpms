

# Fix: Management Dashboard goes blank on month selection

## Root Cause Analysis

The `queryFn` in the main `useQuery` hook (line 156) lacks a `try-catch` wrapper. When toggling a month, the query refetches with new parameters. If the Supabase query encounters any error (network timeout, malformed response, etc.), the unhandled rejection can crash the component, causing the ErrorBoundary to show a blank/error state.

Additionally, the component has **no error state handling** — when the query errors, `isLoading` is false and `dashboardData` is undefined, but the component proceeds to render, potentially causing null-reference crashes on nested property access (e.g., `dashboardData?.trends`).

## Changes

### File: `src/pages/ManagementDashboard.tsx`

1. **Wrap `queryFn` in try-catch** (lines 156-417) — Catch any thrown errors inside the async function and return a safe default object so the dashboard renders with zeroed-out data instead of crashing.

2. **Add error state from `useQuery`** (line 154) — Destructure `isError` from the query result.

3. **Add error UI** (after line 501) — Before the main return, check `isError` and render a user-friendly error card with a "Retry" button instead of a blank page.

4. **Guard child component props** — Ensure all child components receive safe defaults (already mostly done with `|| []` and `?? 0`, but verify `TrainingGapSummary` receives correct calendar year for the selected month, not the fiscal start year).

## Risk Assessment
- **Data Impact**: None — read-only fix, no schema changes
- **Regression Risk**: Very low — only adds error handling, no logic changes
- **UI Impact**: Positive — users will see a retry option instead of a blank page

