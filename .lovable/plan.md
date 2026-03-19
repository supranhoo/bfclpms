

## RCA: Skip-Level Pending Shows 0 — Incorrect Stat Card for Indirect Reports

### Root Cause

The `allEmployeeIds` array (line 169-173 in `EmployeeSelectorGrid.tsx`) is used to fetch bulk workflow configurations via `useBulkEmployeeWorkflows`. For the `team` view level:

- `requiredStage` is `null` (no panel filter for team)
- `isFullAccess` is `false` for a manager
- So `source = teamMembers` — which only contains **direct reports**

However, the actual displayed members (`baseMembers`, line 204-219) merge **direct + indirect** reports. This means:

1. Sanjeeb Kumar Jena (indirect report) is displayed in the grid correctly
2. But his employee ID is **NOT** in `allEmployeeIds`
3. So `workflowMap` has no entry for him
4. `getStages(sanjeebId)` falls back to `DEFAULT_WORKFLOW_STAGES` = `[kra_set, self_review, manager_check, audit, management_review, approved]` — **no `skip_level_check`**
5. `resolveReviewableStatuses('skip_level', DEFAULT)` returns `[]`
6. None of Sanjeeb's 18 `manager_check` KPIs are counted as skip-level pending → **stat shows 0**

### Actual Data (Feb 2026, Sanjeeb)

| Status | Count |
|--------|-------|
| kra_set | 2 |
| self_review | 6 |
| manager_check | 18 |
| hr_pms_review | 1 |

His real workflow: `[kra_set, self_review, manager_check, skip_level_check, hr_pms_review, approved]`

With correct workflow resolution, `resolveReviewableStatuses('skip_level', realStages)` → `['manager_check']` → **18 KPIs should be skip-level pending**.

### Impact Analysis

This bug affects:
1. **Stat cards**: "Skip-Level Pending" count is undercounted (shows 0 instead of real number)
2. **Employee card badges**: The "reviewed" count for indirect reports may be wrong (same fallback issue)
3. **Status filtering**: Clicking "Pending (Skip-Level)" filter may not correctly filter employees
4. **Sorting**: Urgency-based auto-sort uses `getEmployeeKpiStats` which also calls `getStages` — indirect reports get wrong priority

All indirect (skip-level) employees in the merged team view are affected, not just Sanjeeb.

### Fix

**File**: `src/components/review/EmployeeSelectorGrid.tsx`

**Change**: Update `allEmployeeIds` (line 169-173) to include skip-level members when `viewLevel === 'team'`:

```typescript
const allEmployeeIds = useMemo(() => {
  if (viewLevel === 'team' && !isFullAccess) {
    // Merge direct + indirect IDs so workflowMap covers all visible employees
    const directIds = (teamMembers || []).map(p => p.id);
    const indirectIds = (skipLevelMembers || []).map(p => p.id);
    return [...new Set([...directIds, ...indirectIds])];
  }
  const source = requiredStage ? stageFilteredProfiles : (isFullAccess ? allProfiles : teamMembers);
  if (!source) return [];
  return source.map((p: { id: string }) => p.id);
}, [viewLevel, requiredStage, stageFilteredProfiles, isFullAccess, allProfiles, teamMembers, skipLevelMembers]);
```

This is a one-line-scope fix that ensures `useBulkEmployeeWorkflows` fetches the correct workflow for all visible employees, fixing all downstream calculations (stat cards, badges, filters, sorting).

