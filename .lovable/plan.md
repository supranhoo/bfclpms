

## Root Cause Analysis: HR PMS Pending Review — 194 Count but Empty Employee List

### The Bug

Two different counting logics are used for the same "Pending Review" concept in the HR PMS view:

**Stat card** (line 538-555) counts "pending" broadly:
- All KPIs in stages *before* `hr_pms_review` (excluding `kra_set`)
- This includes: `self_review`, `manager_check`, `skip_level_check`
- Result: **194 KPIs**

**Employee list filter** (line 415-417) counts "pending" narrowly:
- Uses `resolveReviewableStatuses('hr_pms', stages)` which returns `[skip_level_check, hr_pms_review]`
- Then excludes `hr_pms_review` itself
- So only matches KPIs at exactly `skip_level_check`
- Result: **0 employees** (all 194 are at `self_review` or `manager_check`, not `skip_level_check`)

### The Fix

Align the `displayMembers` filter logic (line 415-417) with the stat card logic (line 538-555). When `statusFilter === 'pending'` for HR PMS:

**Modified: `src/components/review/EmployeeSelectorGrid.tsx`**

Replace the HR PMS pending filter (line 415-417):
```typescript
// CURRENT (broken): only matches skip_level_check
if (statusFilter === 'pending' && reviewableStatuses.includes(kpi.status || '') && kpi.status !== 'hr_pms_review') {

// FIX: match all stages before hr_pms_review, excluding kra_set (same as stat card)
if (statusFilter === 'pending') {
  const hrIdx = stages.indexOf('hr_pms_review');
  if (hrIdx >= 0) {
    const beforeHr = stages.slice(0, hrIdx);
    if (beforeHr.includes(kpi.status || '') && kpi.status !== 'kra_set') {
      employeeIds.add(kpi.employee_id);
    }
  }
}
```

### No other files changed
This is a single-location fix in the `displayMembers` memo of `EmployeeSelectorGrid.tsx`.

