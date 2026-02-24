

# Fix: Employee Name and Code Missing in Pending Report (v1.46.0)

## Root Cause

After the v1.45.99 migration changed all org-level KPI scopes to `employee`, the Pending Report generation logic correctly enters the employee branch. However, there are two potential issues:

1. **Stale React Query cache**: If the page was open during the migration, the cached KPI data still has the old `org_level_scope` values (`organization` or `department`). The report code branches on this value -- the `organization` and `department` branches explicitly set `employee: ''` and `employeeCode: ''`.

2. **Fallback safety**: If `allProfiles` hasn't loaded yet when the memo runs, the entire employee branch is skipped (due to the `&& allProfiles` guard), producing zero rows.

## Fix

### 1. Force scope to `employee` in report generation (`src/pages/admin/OrgKpiDataEntry.tsx`)

Since all org-level KPIs are now employee-scoped by policy, the report generation should default to `employee` scope rather than falling back to `organization`. Change line 656:

```typescript
// Before:
const scope = ((kpi as any).org_level_scope as string) || 'organization';

// After:
const scope = ((kpi as any).org_level_scope as string) || 'employee';
```

This ensures that even with cached data, the employee branch is used.

### 2. Ensure `allProfiles` dependency is ready

Add a guard at the start of `pendingReportRows` memo: if `allProfiles` is not yet loaded, return an empty array early. This prevents partial reports from being generated. (This is already handled by the `&& allProfiles` check, but we should also disable the download button until profiles are loaded.)

### 3. Ensure `getKpiStatus` also defaults correctly

The `getKpiStatus` callback at line 161 also uses `|| 'organization'` as default scope. Update this to `|| 'employee'` for consistency.

## Changes Summary

| File | Change |
|------|--------|
| `src/pages/admin/OrgKpiDataEntry.tsx` | Change default scope fallback from `'organization'` to `'employee'` in `pendingReportRows` memo (line 656) and `getKpiStatus` (line 161) |
| `DOCUMENTATION.md` | Bump to v1.46.0 |

## Risk Assessment

| Aspect | Risk | Mitigation |
|--------|------|-----------|
| Data impact | None | Read-only UI change, no DB modifications |
| Regression | Very low | Only changes default fallback value; since all KPIs are now `employee` scope, this aligns code with data |
| Existing functionality | None | Organization and department branches still exist if scope is explicitly set to those values |

