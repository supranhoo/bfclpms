

# RCA and CAPA: Admin Data Entry Not Persisting + Workflow-Dependent Data Visibility

---

## Part A: Admin Data Entry Not Persisting

### Root Cause 1: Cache Key Mismatch (CRITICAL)

The `AdminDataEntryDialog` fetches existing submission data using:
```text
queryKey: ['review-submission-admin', kpi.id]
```

But the mutation's `onSuccess` only invalidates:
```text
queryClient.invalidateQueries({ queryKey: ['review-submissions'] })
```

Since `review-submissions` does NOT prefix-match `review-submission-admin`, the dialog continues showing stale data after saving, making it appear the update never happened.

### Root Cause 2: Zero-Value Bug (HIGH)

In `AdminDataEntryDialog.tsx` line 161:
```text
achieved_value: achievedValue ? parseFloat(achievedValue) : null
score: score ? parseFloat(score) : null
```

JavaScript treats `"0"` as falsy. Any legitimate zero entry is silently converted to `null`.

### Fix for Part A

**File: `src/hooks/useAdminDataEntry.ts`** (line 192)
- Add `review-submission-admin` to the cache invalidation list in `onSuccess`

**File: `src/components/admin/AdminDataEntryDialog.tsx`** (lines 161-163)
- Replace `achievedValue ? parseFloat(...)` with `achievedValue !== '' ? parseFloat(...)`
- Same for `score`

---

## Part B: Data Not Visible as Per New Workflows (CRITICAL)

### Root Cause: Hardcoded Status Filters in EmployeeSelectorGrid

The `EmployeeSelectorGrid.tsx` component uses **hardcoded status values** for filtering and stat calculations instead of resolving them dynamically from each employee's workflow template.

For example, the audit "pending" filter (line 199) checks:
```text
kpi.status === 'manager_check' || kpi.status === 'self_review'
```

But for employees on the 8-stage workflow (Self -> L1 -> L2 -> HR PMS -> Audit -> ...), the status preceding audit is `hr_pms_review`, NOT `manager_check`. So KPIs at `hr_pms_review` or `skip_level_check` are invisible to their respective reviewers in the grid.

Current database confirms:
- 6 KPIs stuck at `skip_level_check` (invisible to skip-level reviewers using "pending" filter)
- 20 KPIs at `manager_check` (visible only because they match the hardcoded default)

### Impact

| View Level | Hardcoded "Pending" Status | Should Be (for 8-stage) | Result |
|---|---|---|---|
| Skip-Level | `manager_check` | `manager_check` | Correct (by coincidence) |
| HR PMS | `skip_level_check` | `skip_level_check` | Correct (by coincidence) |
| Audit | `manager_check`, `self_review` | `hr_pms_review` | **WRONG -- employees on 8-stage workflow are invisible** |

The real problem becomes apparent when employees have mixed workflows. The grid does a global filter across all employees but each employee may have a different workflow. The grid cannot use the workflow engine functions because it processes KPIs in bulk without per-employee workflow lookups.

### Fix for Part B

The fix requires fetching workflow stages per employee and using them for status resolution. Two approaches:

**Approach: Batch workflow resolution**

1. Fetch all unique employee IDs from `periodKpis`
2. Batch-fetch workflow info for all those employees using a new RPC or by joining workflow data
3. Use `resolveReviewableStatuses()` per employee to determine if their KPIs are "pending" for the current view level

**File: `src/components/review/EmployeeSelectorGrid.tsx`**
- Add a batch query to fetch workflow stages for all employees shown in the grid
- Replace hardcoded status checks in the filtering logic (lines 186-225) with dynamic resolution using each employee's workflow stages
- Replace hardcoded status checks in the stats calculation (lines 234-283) with the same dynamic resolution
- Replace hardcoded status checks in the per-employee badge stats (lines 286-326)

**New database function (migration)**
- Create `get_bulk_employee_workflows(employee_ids UUID[])` that returns `(employee_id, stages)` for a batch of employees, to avoid N+1 queries

---

## Files to Modify

| File | Change |
|---|---|
| `src/hooks/useAdminDataEntry.ts` | Add `review-submission-admin` to cache invalidation |
| `src/components/admin/AdminDataEntryDialog.tsx` | Fix zero-value falsy bug |
| `src/components/review/EmployeeSelectorGrid.tsx` | Replace hardcoded status filters with workflow-aware dynamic resolution |
| `src/hooks/useWorkflowConfig.ts` | Add `useBulkEmployeeWorkflows` hook |
| Database migration | Create `get_bulk_employee_workflows` RPC function |
| `DOCUMENTATION.md` | Document both fixes |

---

## Risk Assessment

- **Part A**: Very Low -- only cache key and value parsing changes
- **Part B**: Medium -- changes the core filtering logic of the employee grid, but uses the existing tested workflow engine functions. The batch RPC avoids performance regression from N+1 queries.

