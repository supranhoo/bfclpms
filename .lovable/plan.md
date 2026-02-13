

# Fix: Enable Skip-Level and HR PMS Review Modes in Dashboard

## Problem

The workflow template for Purnima Pathak has been changed to include skip-level review, but her skip-level reporting manager (Jaspal) cannot see the "Review" button because:

1. **Dashboard.tsx** never adds `skip_level` or `hr_pms` to the available view modes
2. **EmployeeSelectorGrid** doesn't fetch the correct employees for these view levels (skip-level needs employees whose RM reports to the current user; HR PMS needs all employees)
3. **EmployeeSelectorGrid** filtering, stats, and badge logic has no branches for `skip_level` or `hr_pms`

## Changes

### 1. Dashboard.tsx — Add skip_level and hr_pms to available modes

Update the `availableModes` logic (~line 170) to:
- Add `skip_level` mode for managers who have skip-level subordinates (query: any profiles where `reporting_manager_id` is in the set of profiles that report to `auth.uid()`)
- Add `hr_pms` mode for users with the `hr_pms` role

Update the `viewLevelForScorecard` mapping (~line 345) to pass `skip_level` and `hr_pms` directly (currently it only handles `team`, `audit`, `management`).

### 2. Dashboard.tsx — Add a hook to detect skip-level subordinates

Create a small query hook (or inline query) that checks if any employees exist whose RM's RM is the current user. This determines whether to show the `skip_level` toggle. This can be a simple RPC call or a profiles query.

### 3. EmployeeSelectorGrid — Employee fetching for new view levels

Update the `baseMembers` logic (~line 124-127) to handle:
- **skip_level**: Fetch employees whose `reporting_manager_id` is in the set of profiles where `reporting_manager_id = currentUserId` (two-level lookup)
- **hr_pms**: Full access to all profiles (similar to auditor/management)

Update `isFullAccess` to include `hr_pms` role.

### 4. EmployeeSelectorGrid — Status filtering for new levels

Add `skip_level` and `hr_pms` branches to:
- **displayMembers filter** (~line 180-207): Filter by `skip_level_check` and `hr_pms_review` statuses respectively
- **stats calculation** (~line 216-249): Count pending/reviewed KPIs for each new level
- **getEmployeeKpiStats** (~line 252-278): Return appropriate badge counts
- **renderStatsCards** (~line 332-362): Add stat card layouts for the two new views
- **renderEmployeeBadges** (~line 365-427): Add badge rendering for the new levels

### 5. useOrganization.ts — Add skip-level team members hook

Create `useSkipLevelTeamMembers(userId)` that fetches profiles where the employee's RM reports to the given user:

```sql
SELECT p.* FROM profiles p
JOIN profiles rm ON p.reporting_manager_id = rm.id
WHERE rm.reporting_manager_id = :userId
```

### 6. DOCUMENTATION.md

Update to document the skip-level and HR PMS dashboard integration.

## Files to Modify

| File | Change |
|---|---|
| `src/hooks/useOrganization.ts` | Add `useSkipLevelTeamMembers` hook |
| `src/pages/Dashboard.tsx` | Add `skip_level` and `hr_pms` to `availableModes`, fix `viewLevelForScorecard` mapping |
| `src/components/review/EmployeeSelectorGrid.tsx` | Handle employee fetching, filtering, stats, badges for new view levels |
| `DOCUMENTATION.md` | Update with new view modes |

