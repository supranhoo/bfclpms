

## Revert HR PMS 7 Tiles + Add Dedicated Dashboard Views

### What Changes
1. **Revert HR PMS tiles** back to standard 5-tile pattern (Total Employees, Pending Review, In HR PMS Review, Reviewed, Total KPIs) — "Pending Review" shows only KPIs at the stage immediately before `hr_pms_review` (not the broad sum of all earlier stages)
2. **Add 3 new ViewMode tabs** visible to HR PMS / admin roles: "Self Review", "Manager Review", "Skip Mgr Review" — each showing only employees whose KPIs are pending at that specific workflow stage

### Files Modified

#### 1. `src/components/review/ViewModeToggle.tsx`
- Add 3 new `ViewMode` values to the type: `'pending_self_review' | 'pending_manager_review' | 'pending_skip_review'`
- Add `modeConfig` entries with labels "Self Review", "Manager Review", "Skip Mgr Review" and appropriate icons

#### 2. `src/pages/Dashboard.tsx`
- Add the 3 new modes to `availableModes` for `hr_pms` and `admin` roles
- Map these modes to appropriate `viewLevel` values when passing to `EmployeeSelectorGrid` and `UnifiedScorecard`

#### 3. `src/components/review/EmployeeSelectorGrid.tsx`

**a) Revert HR PMS stats** (line 545-560):
- Go back to using `resolveReviewableStatuses('hr_pms', stages)` for the "Pending" count (only KPIs at the stage just before `hr_pms_review`)
- Standard 5-tile layout: Total Employees, Pending Review, In HR PMS Review, Reviewed, Total KPIs

**b) Revert HR PMS status options** (line 59-66):
- Back to: `all`, `pending`, `in_review`, `reviewed`

**c) Revert HR PMS filter logic** (line 417-432):
- `pending`: use `resolveReviewableStatuses` (not broad sub-stage matching)
- `in_review`: `hr_pms_review`
- `reviewed`: after `hr_pms_review`

**d) Add 3 new viewLevel handlers** for `pending_self_review`, `pending_manager_review`, `pending_skip_review`:
- Each fetches all employees (like HR PMS does — all profiles)
- Stats: Total Employees, Pending (at that stage), Total KPIs
- Filter: `pending` matches `kpi.status === 'self_review'` / `'manager_check'` / `'skip_level_check'` respectively
- Simple 3-tile layout: Total Employees, Pending at Level, Total KPIs

**e) Data fetching**: These new views use the same `useProfilesByWorkflowStage` / `useProfiles` as HR PMS (all employees visible), so add them to the existing conditional that enables full-org fetch.

### No database changes needed

