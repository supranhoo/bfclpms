

## Bug Fix: Two Confirmed Issues

### Bug 1: Org KPI Values Fail to Match in Self-Review (Data Bug)

**What's broken:** `SelfReviewSheet.tsx` builds org KPI lookup keys using raw `kra_name` and `kpi_name` (e.g., `"Safety"`) but the map is populated with `.toLowerCase()` keys (e.g., `"safety"`) by the parent `UnifiedScorecard.tsx`. Result: org KPI achieved values silently fail to prefill during self-review for employees. The employee sees a blank achieved value even though data exists.

**Where:** `src/components/review/SelfReviewSheet.tsx` — 6 locations (lines ~277, 280, 283, 508, 511, 514)

**Fix:** Add `.toLowerCase()` to `kra_name` and `kpi_name` in all 6 org key constructions, matching the pattern used in every other scorecard.

### Bug 2: ModuleCard Missing forwardRef (Console Warning)

**What's broken:** `ModuleHub` renders `ModuleCard` components, and React warns "Function components cannot be given refs." This happens because the Card component or a parent wrapper tries to forward a ref to ModuleCard.

**Where:** `src/components/modules/ModuleCard.tsx`

**Fix:** Wrap the component with `React.forwardRef` so it can accept refs cleanly.

### Files Modified
- `src/components/review/SelfReviewSheet.tsx` — add `.toLowerCase()` to 6 org key lookups
- `src/components/modules/ModuleCard.tsx` — wrap with `forwardRef`

### Risk
- Minimal. Both are targeted fixes matching existing patterns used elsewhere in the codebase.

