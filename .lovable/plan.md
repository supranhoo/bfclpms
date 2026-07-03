## Problem
On the Audit dashboard (`?view=audit`) mobile view, the month/period selector is not visible. The Team view still shows it because Team has fewer action buttons.

## Root Cause
In `src/components/review/EmployeeSelectorGrid.tsx` (~line 1994), the header actions container is:

```tsx
<div className="flex items-center gap-2">
  {/* Refresh, Bulk Review, Export Pending, Manage Assignments (audit only),
      Explore All (audit only), then Period Selector */}
</div>
```

The container has no `flex-wrap`, no horizontal scroll, and no responsive stacking. On the Audit view the row contains 5–6 items plus the Period Selector wrapper. At 390px width, the Period Selector (last child) overflows outside the visible area and gets clipped by the parent card.

Team view has fewer buttons so the selector still fits — which is why the issue is only reported on Audit mobile.

## Risk & Impact Report
- Data Impact: None — purely presentational.
- Workflow Impact: None.
- UI/UX: Restores month picker visibility on mobile for Audit (and future dense action bars).
- Regression Risk: Very low — CSS-only, scoped to the header action row of `EmployeeSelectorGrid`.
- Mitigation: Verify on 360/390/768/desktop that no button overlaps and the selector remains reachable; keep desktop layout unchanged.

## Fix (Surgical, UI-only)
Update the header actions row so it wraps on small screens and the Period Selector always occupies its own full-width row on mobile:

1. Add `flex-wrap justify-end` to the action row so overflow items wrap instead of clipping.
2. Wrap the `ReviewPeriodSelectorEnhanced` container with `w-full md:w-auto order-last` so on mobile it drops to a new line spanning full width; on `md+` it stays inline as today.
3. No changes to props, state, hooks, queries, or business logic.

## Verification
- Mobile (390×844) `/dashboard?view=audit`: month picker visible below the action buttons, tappable, `h-10` target preserved.
- Mobile Team/HR/Management views: unchanged (still visible, may now wrap gracefully).
- Desktop ≥ md: layout identical to current.
- Existing tests in `src/test/` for the grid continue to pass (no logic change).

## Docs
- POLICY.md: Not Applicable (no policy change).
- DOCUMENTATION.md: append a v-bump line noting the audit header wraps period selector on mobile.
