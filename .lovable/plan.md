

# Codebase Decoupling and Dead Code Deletion

## Scope

Remove approximately 2,000 lines of unreachable code and consolidate a duplicate utility file. Zero functional impact -- all targeted code is confirmed dead.

## Pre-Flight Verification (Completed)

- **SelfReview.tsx, TeamReview.tsx, ManagementReview.tsx, AuditPanel.tsx**: Not imported anywhere. Their routes in `App.tsx` are already `Navigate` redirects -- the page components are never rendered.
- **Index.tsx**: Not imported or routed anywhere.
- **tmp/reference/**: 6 files, not imported anywhere.
- **src/components/ui/use-toast.ts**: A 3-line re-export shim. Zero files import from it -- all 59 consumers already use `@/hooks/use-toast`.
- **useReviewPageState.ts**: Only referenced in its own JSDoc comment. No actual import. Safe to keep for now (it IS used as a shared hook pattern), but worth noting.

## Changes

### 1. Delete Dead Page Files

| File | Lines Removed |
|---|---|
| `src/pages/SelfReview.tsx` | ~997 |
| `src/pages/TeamReview.tsx` | ~362 |
| `src/pages/ManagementReview.tsx` | ~335 |
| `src/pages/AuditPanel.tsx` | ~345 |
| `src/pages/Index.tsx` | ~14 |
| **Total** | **~2,053** |

### 2. Delete Reference Files

| File | Reason |
|---|---|
| `tmp/reference/IndividualDashboard.tsx` | Development artifact |
| `tmp/reference/KeyStatCard.tsx` | Development artifact |
| `tmp/reference/KpiTable.tsx` | Development artifact |
| `tmp/reference/KpiTrackerModal.tsx` | Development artifact |
| `tmp/reference/OverallScoreChart.tsx` | Development artifact |
| `tmp/reference/ProfileCard.tsx` | Development artifact |

### 3. Delete Toast Shim

Delete `src/components/ui/use-toast.ts` (3 lines). No consumers exist.

### 4. Clean Up App.tsx

Remove these unused lazy imports (the routes themselves stay as `Navigate` redirects -- no routing change):

```
- const ManagementDashboard = lazy(() => import("./pages/ManagementDashboard"));
```

Wait -- `ManagementDashboard` IS still routed (line ~108 renders the component, not a redirect). Only the legacy review pages are redirects. Let me confirm: the route `/management-dashboard` renders `ManagementDashboard` directly. So that import stays.

The only lazy import to remove is: none. The dead pages (`SelfReview`, `TeamReview`, `ManagementReview`, `AuditPanel`) are NOT lazy-imported in `App.tsx` -- their routes are inline `Navigate` components. `Index.tsx` is also not imported. So App.tsx needs no import cleanup.

### 5. Update DOCUMENTATION.md

Add a note recording the deletion of these files and the rationale.

## What Does NOT Change

- All routes in `App.tsx` remain unchanged (the `Navigate` redirects stay)
- `useReviewPageState.ts` -- kept (provides shared logic for the unified dashboard)
- `MobileSelfReviewCard.tsx` -- kept (used by the unified dashboard's `SelfReviewSheet`)
- No frontend behavior changes whatsoever

## Risk: None

All deleted code is confirmed unreachable. No imports, no routes, no side effects.
