

## RCA: Skip-Level Manager Cannot Review KPIs at `manager_check` Status

### Root Cause

**The `viewLevel` for the UnifiedScorecard resolves to `manager` instead of `skip_level` because the `relationship` tag is unreliable or missing.**

In `Dashboard.tsx` (line 301-306), the ONLY way to get `viewLevel = 'skip_level'` is:
```
if (viewMode === 'team' && selectedEmployee.relationship === 'indirect') {
  viewLevelForScorecard = 'skip_level';
}
```

The `relationship` property is set by `EmployeeSelectorGrid.baseMembers` (line 266-273), which tags employees based on `skipLevelMembers` data. However, this tagging fails in multiple scenarios:

1. **URL restoration / refresh**: When the page is refreshed with `?employee=<id>&view=team`, the Dashboard fetches the employee profile directly from the database (line 233-237). This fetch does NOT include the `relationship` property. So `selectedEmployee.relationship` is `undefined` → viewLevel falls back to `manager`.

2. **Deep-link paths**: Both deep-link handlers (lines 112-126, 157-170) fetch the employee profile from the DB without the `relationship` tag.

3. **Race condition**: For admin users, `allProfiles` renders immediately but `skipLevelMembers` may still be loading. If the user clicks before skip-level data loads, `skipIds` is empty → `relationship` is `undefined`.

**Consequence**: When `viewLevel = 'manager'`, the `viewType` becomes `'team-review'`, and `canReviewKpi('manager_check', 'team-review')` returns `false` (manager only reviews `self_review` status). This is why the "Reviewed" badge with eye-only icon appears instead of the "Review" action button.

### Fix — Dynamically determine viewLevel from reporting chain

Instead of relying on the fragile `relationship` tag, determine the correct `viewLevel` by checking the actual reporting chain at the point where the scorecard is rendered.

#### Part 1: Add reporting chain check in Dashboard

When `viewMode === 'team'` and an employee is selected, determine `viewLevelForScorecard` by checking:
- If the logged-in user is the employee's **direct manager** (`reporting_manager_id === user.id`) → `'manager'`
- If the logged-in user is the employee's **skip-level manager** (employee's manager's manager === user.id) → `'skip_level'`
- Fallback: check if the employee's workflow includes `skip_level_check` AND the user is the skip-level manager

This check uses `selectedEmployee.reporting_manager_id` (already fetched) and `profile.id` (already available from auth). For the skip-level check, we need the employee's manager's `reporting_manager_id`, which can be fetched once.

**Implementation approach**: Create a small helper that, given the selected employee and the logged-in user's profile, returns the correct viewLevel. For the `team` view:

```text
1. If employee.reporting_manager_id === currentUser.id → 'manager'
2. Else, fetch employee's manager's reporting_manager_id
   If that === currentUser.id → 'skip_level'  
3. Else → use 'manager' as default (admin viewing non-chain employee)
```

This logic runs once when an employee is selected (including URL restoration), and the result is cached alongside the `selectedEmployee` state.

#### Part 2: Fix URL restoration to include relationship resolution

Update all three employee-fetch paths in Dashboard:
- Deep-link with KPI (line 112)
- Deep-link without KPI (line 157)  
- Mount restoration (line 233)

After fetching the employee profile, also fetch the manager's `reporting_manager_id` to determine relationship, and set it on the employee object before calling `setSelectedEmployee`.

#### Part 3: Fix the `handleSelectEmployee` callback

Update `handleSelectEmployee` to also resolve the relationship if not already set, so even if the grid passes an employee without the tag (race condition), it gets resolved.

### Files to Change

| File | Change |
|------|--------|
| `src/pages/Dashboard.tsx` | Add relationship resolution logic in all employee selection/restoration paths; replace fragile `relationship` check with reporting-chain-based viewLevel determination |
| `DOCUMENTATION.md` | Version bump |
| `POLICY.md` | Add policy: viewLevel must be determined from reporting chain, not from grid-only metadata |

### Risk Assessment
- **No data changes**: Pure UI logic fix.
- **Fixes all paths**: Direct click, deep-link, URL restoration, and refresh all resolve correctly.
- **Backward compatible**: Employees already tagged with `relationship` by the grid continue to work; the new logic is additive.
- **Covers all affected users**: Any user who is a skip-level manager (by reporting chain) will see correct review actions for indirect reports, regardless of their role (admin, manager, skip_level, etc.).

