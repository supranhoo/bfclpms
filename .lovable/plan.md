

# Performance Optimizations

## Overview
Four targeted changes to improve load time, reduce API calls, and improve error resilience -- all with minimal code modifications.

## 1. Code Splitting with React.lazy

**Current state:** All 30+ page components are eagerly imported in `App.tsx`, meaning the entire app ships in one bundle even though most users only visit a few pages.

**Change:** Replace all static page imports with `React.lazy()` and wrap routes in a `Suspense` boundary with a spinner fallback.

- Convert ~28 page imports to lazy (Auth, Dashboard, QueryInbox, all admin/*, reports/*, etc.)
- Keep layout components (`DashboardLayout`, `ProtectedRoute`, `DataOwnerRoute`) as eager imports since they're needed on every route
- Add a single `Suspense` wrapper inside `DashboardLayout` and around standalone routes

**Impact:** Each page becomes its own chunk, loaded only when navigated to. Initial bundle drops significantly.

## 2. QueryClient Default Configuration

**Current state:** `const queryClient = new QueryClient()` -- no defaults. Every query refetches on mount and on window focus, causing redundant API calls.

**Change:**
```
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,    // 5 minutes
      gcTime: 10 * 60 * 1000,      // 10 minutes (garbage collection)
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});
```

**Impact:** Cached data reused for 5 minutes; no refetch on tab switch; fewer redundant network requests.

## 3. Memoization in Heavy Components

Target the two largest pages: `Dashboard.tsx` (~695 lines) and `QueryInbox.tsx` (~697 lines).

- Wrap expensive derived data (filtered lists, stats calculations, chart data) with `useMemo` where not already done
- Wrap event handler callbacks with `useCallback` where they're passed as props to child components
- Both files already import `useMemo`/`useCallback`, so this is about auditing for missed opportunities (e.g., inline arrow functions passed to child components)

**Note:** This will be a targeted audit -- I'll only add memoization where it provides real benefit (lists, computed stats), not blanket-wrap everything.

## 4. Error Boundaries

**Current state:** There is already one `ErrorBoundary` wrapping the `Outlet` inside `DashboardLayout`. No boundary around the top-level App or standalone routes (Auth, ModuleHub, ResetPassword).

**Change:**
- Add a top-level `ErrorBoundary` wrapping the entire app in `App.tsx` (catches catastrophic errors in providers, router, etc.)
- The existing per-route boundary in `DashboardLayout` already covers all dashboard routes -- no change needed there

**Impact:** If Auth, ModuleHub, or a provider crashes, users see a recovery screen instead of a white page.

---

## Files Modified

| File | Change |
|------|--------|
| `src/App.tsx` | Lazy imports, Suspense, QueryClient config, top-level ErrorBoundary |
| `src/components/layout/DashboardLayout.tsx` | Add Suspense inside existing ErrorBoundary |
| `src/pages/Dashboard.tsx` | Audit and add targeted useMemo/useCallback |
| `src/pages/QueryInbox.tsx` | Audit and add targeted useMemo/useCallback |
| `DOCUMENTATION.md` | Document performance optimizations |

No new dependencies required. No database changes.

