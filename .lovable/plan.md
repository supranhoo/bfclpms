

# Fix: Incorrect Org KPI Values Across All Views (v1.46.1-hotfix)

## Root Cause

The v1.45.99 migration changed all org-level KPI scopes to `employee`, and v1.46.0 fixed the default fallback in `OrgKpiDataEntry.tsx`. However, **10+ other locations** in the codebase still use `|| 'organization'` as the scope fallback. This causes the org KPI value lookup to build the wrong cache key.

When viewing Debadutta Sahoo in HR PMS Review:
- The `UnifiedScorecard` builds the lookup key as `categoryId||kraName||kpiName||null||null` (organization scope)
- But the actual `org_kpi_values` records are stored with `employee_id = {Debadutta's ID}` (employee scope)
- Result: wrong or missing values are displayed

## Files to Fix

All occurrences of `|| 'organization'` scope fallback need to change to `|| 'employee'`:

| File | Lines | Context |
|------|-------|---------|
| `src/pages/Dashboard.tsx` | ~120 | Self-view org KPI value lookup |
| `src/components/review/UnifiedScorecard.tsx` | ~239 | HR PMS / Team / Audit / Management review |
| `src/components/review/EmployeeScorecard.tsx` | ~116 | Employee scorecard org KPI lookup |
| `src/components/review/ManagementScorecard.tsx` | ~117 | Management scorecard org KPI lookup |
| `src/components/review/SelfReviewSheet.tsx` | ~235, ~442 | Self-review submission logic |
| `src/pages/admin/OrgKpiDataEntry.tsx` | ~226, ~270, ~389, ~472, ~634 | Data entry (missed in v1.46.0) |
| `src/components/review/KpiHeaderSection.tsx` | ~22 | KPI header badge display |
| `src/components/admin/OrgKpiMappingDashboard.tsx` | ~107 | Mapping dashboard |

## Change Pattern

Each fix is identical -- replace the fallback value:

```typescript
// Before (broken):
const scope = (kpi as any).org_level_scope || 'organization';

// After (correct):
const scope = (kpi as any).org_level_scope || 'employee';
```

## Risk Assessment

| Aspect | Risk | Mitigation |
|--------|------|-----------|
| Data impact | None | Read-only display logic only |
| Regression | Very low | All org KPIs in DB already have scope = 'employee'; this just aligns fallbacks |
| Scope | Low | The `organization` and `department` branches still exist for any future use |

## Documentation

- Update `DOCUMENTATION.md` to note the comprehensive scope fallback fix

