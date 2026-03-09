

# Plan: KPI Status Tracker Report

## What It Is
A new **"KPI Status Tracker"** report at `/reports/kpi-status-tracker` that gives admins a single flat table showing every KPI row for a selected month/year, with employee details and the exact workflow stage where each KPI currently sits. This accelerates data collection by making it immediately clear who is pending at which level.

## Columns
| # | Column | Source |
|---|--------|--------|
| 1 | Employee Code | `profiles.employee_code` |
| 2 | Employee Name | `profiles.full_name` |
| 3 | Designation | `profiles.designation` |
| 4 | Department | `departments.name` |
| 5 | Division | `divisions.name` (via dept → BU → division) |
| 6 | Category | `kra_categories.name` |
| 7 | KRA | `kpis.kra_name` |
| 8 | KPI | `kpis.kpi_name` |
| 9 | Weightage | `kpis.weightage` |
| 10 | Current Status | `kpis.status` (human-readable label) |
| 11 | Pending At Level | Derived: next actor stage name (e.g. "Manager Check", "HR PMS Review") |
| 12 | Days in Current Stage | Derived from `kpis.updated_at` |
| 13 | Is Org-Level | `kpis.is_org_level` badge |

## Features
- **Filters**: Month, Year, Department, Status, Search (name/code)
- **Summary cards**: Total KPIs, by-status breakdown (KRA Set, Self Review, Manager Check, Skip-Level, HR PMS, Audit, Management, Approved) with counts and percentages
- **Color-coded status badges**: Green (Approved), Blue (in-progress stages), Amber (early stages), Red (KRA Set / stuck)
- **Pagination**: 50 rows per page
- **Excel export**: Full dataset with all columns
- **Sorting**: By employee name, department, status, days pending

## Files to Create/Modify

### 1. New file: `src/pages/reports/KpiStatusTracker.tsx`
- Main report page following the existing pattern from `KpiDetailReport.tsx`
- Fetches KPIs with joined profiles and departments using batched queries (same pattern as KpiDetailReport)
- Filters, summary cards, paginated table, Excel export

### 2. Modify: `src/pages/reports/ReportsHub.tsx`
- Add a new card entry for "KPI Status Tracker" with `reportKey: 'kpi-status-tracker'` and route `/reports/kpi-status-tracker`

### 3. Modify: `src/App.tsx`
- Add lazy import for `KpiStatusTracker`
- Add route `/reports/kpi-status-tracker` wrapped in `<ReportRoute reportKey="kpi-status-tracker">`

### 4. No database changes needed
- All data comes from existing `kpis`, `profiles`, `departments` tables
- Status labels derived from the existing `review_status` enum

## Status Label Mapping
```text
kra_set          → "KRA Set"
self_review      → "Self Review"
manager_check    → "Manager Check"
skip_level_check → "Skip-Level Check"
hr_pms_review    → "HR PMS Review"
audit            → "Audit"
management_review→ "Management Review"
approved         → "Approved"
```

## Impact Assessment
- **Data**: Read-only, no schema changes
- **Workflow**: No changes to existing processes
- **UI/UX**: New report card added to Reports Hub; consistent with existing report patterns
- **Regression Risk**: None — entirely additive

