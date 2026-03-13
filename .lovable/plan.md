

# Plan: Unify "My Dashboard" with the Reviewer Dashboard Layout

## Problem

You're right — there are two completely separate dashboard implementations:

1. **My Dashboard** (self view): ~450 lines of custom layout in `Dashboard.tsx` (lines 517–961) with its own KPI table, charts, and `SelfReviewSheet`
2. **Reviewer Dashboard** (team/audit/management/hr_pms): Uses `UnifiedScorecard` component with `KpiDetailsTable`, `KpiReviewPanel`, and the same chart components

Both render nearly identical structures (profile row → 1:5 chart grid → workflow tracker → KPI table), but with duplicated code and slightly different styling/behavior.

## Approach

Add `'self'` as a new view level to `UnifiedScorecard`, making it handle all views including the employee's own dashboard. The self view would use the same layout but with self-review-specific behavior.

### Changes

**`src/components/review/UnifiedScorecard.tsx`**
- Add `'self'` to the `ScorecardViewLevel` type
- Add self-view static config (title: "My KPIs", scoreFieldPrefix: "self", etc.)
- When `viewLevel === 'self'`, use `useMyKpis()` instead of `useKpisByEmployee()`
- When `viewLevel === 'self'`, open `SelfReviewSheet` instead of the reviewer Sheet
- Show category filter dropdown (already used in self view) for all modes
- Support cumulative mode for self view (pass through `periodSelection`)

**`src/pages/Dashboard.tsx`**
- Remove the entire self-view rendering block (~400 lines: charts, KPI table, SelfReviewSheet inline)
- When `viewMode === 'self'`, render `UnifiedScorecard` with `viewLevel="self"` and `employee={profile}` (the logged-in user's own profile)
- Keep: ViewModeToggle, EmployeeSelectorGrid for reviewer modes, pending period alerts, cumulative mode state, MentionedKpiSheet
- The self-view specific features (cumulative summary, pending period alerts) would be passed as props or handled within UnifiedScorecard

**`src/components/review/KpiDetailsTable.tsx`**
- Add `'self-review'` to the existing `viewType` options (if not already there)
- Self-review columns: Category, KRA/KPI, Target, Weightage, Achieved, Rating, Status, Actions (Review/View/Logic/Tracker)

**`src/components/review/ViewModeToggle.tsx`**
- No changes needed — `'self'` is already handled as the default mode

### What stays the same for all views
- 1:5 chart grid (Overall + Category)
- WorkflowProgressTracker with stage filtering
- KPI sort control + KRA export menu
- Period selector (enhanced with cumulative support)
- Mobile responsive cards

### Self-view-specific behavior within UnifiedScorecard
- Profile card shows logged-in user (no back button)
- Review action opens `SelfReviewSheet` instead of reviewer Sheet
- Category filter dropdown visible
- Cumulative mode summary card shown when active
- Pending period alerts shown above the profile row

### Files Modified
| File | Change |
|------|--------|
| `src/components/review/UnifiedScorecard.tsx` | Add `'self'` view level with self-specific data fetching and review behavior |
| `src/pages/Dashboard.tsx` | Remove ~400 lines of self-view rendering; delegate to `UnifiedScorecard` |
| `src/components/review/KpiDetailsTable.tsx` | Add `'self-review'` view type for action column rendering |

### Risk Mitigation
- All existing reviewer flows remain unchanged — only adding a new view level
- SelfReviewSheet continues to be the review mechanism for self-view (not the reviewer Sheet)
- Cumulative mode and pending period alerts are preserved

