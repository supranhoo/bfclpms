

# Fix: Non-functional Filters on Admin KPI Dashboard

## Problem

Three filters on the Admin KPI Dashboard (/admin/kpis) are broken: **Manager**, **Department**, and **Division**. They appear to work (dropdown populates, selection changes) but never actually filter the table.

## Root Cause

The KPI queries (`useAllKpis` and `useKpisByPeriod`) fetch employee profiles with only 4 fields:

```
profiles:employee_id (id, full_name, email, employee_code)
```

The filter logic needs `department_id` and `reporting_manager_id`, but these fields are **not included** in the select. So `employee?.department_id` and `employee?.reporting_manager_id` are always `undefined`, and filters never match.

The Division filter has a secondary issue: it traverses `dept?.business_units?.divisions?.id` by looking up the department from the `departments` hook. This works only if `employee?.department_id` is present -- which it isn't, so the lookup also fails.

## Fix

### 1. Update `useAllKpis` and `useKpisByPeriod` in `src/hooks/useKpis.ts`

Add `department_id` and `reporting_manager_id` to the profiles select:

```
profiles:employee_id (id, full_name, email, employee_code, department_id, reporting_manager_id)
```

This is a 2-line change (one per query). No new database calls or schema changes needed.

### 2. Update `DOCUMENTATION.md`

Version bump to 1.45.47 with a note about the fix.

## Impact

- Manager filter will correctly match `employee.reporting_manager_id`
- Department filter will correctly match `employee.department_id`
- Division filter will correctly resolve via `departments -> business_units -> divisions` lookup
- Period and Year filters were already working (they filter on KPI fields, not profile fields)
- No database migration needed
- No breaking changes

