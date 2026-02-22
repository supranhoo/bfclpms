

# KPI Mapping Matrix Dashboard

## Overview

Build a new **KPI Mapping Matrix** page at `/admin/kpi-mapping` that gives admins a bird's-eye view of which employees have KPIs mapped for each month of a selected year. The page shows a 12-month matrix (Jan-Dec) with green/red badges per employee, plus cascading org-hierarchy filters, text search, pagination, and one-click Excel export.

## New Files

### 1. `src/hooks/useAdminReports.ts` -- Data Layer Hook

- Fetches all profiles with hierarchy (reuses `useProfilesWithHierarchy` pattern) plus `pms_grade` and `designation` fields.
- Fetches all KPIs for the selected `review_year` with `review_period` and `employee_id`.
- Transforms into a per-employee 12-month matrix: `{ employeeId, name, code, grade, designation, department, months: { jan: boolean, feb: boolean, ... } }`.
- Computes "First Mapped Month" as the earliest month with a KPI.
- Accepts filters (division, business unit, department, PMS grade, designation, text search) and applies them client-side.
- Returns paginated results (20 per page).

### 2. `src/pages/admin/KpiMappingMatrix.tsx` -- Page Component

**Header**: PageHeader with title "KPI Mapping Matrix" and back-to `/admin`.

**Filter Bar** (horizontal toolbar):
- Year selector (select dropdown, defaults to current year).
- Cascading org filters: Division, Business Unit, Department (reuses `useKpiFilters` pattern).
- PMS Grade dropdown, Designation dropdown (from `useEmployeeFilterOptions` pattern).
- Text search input (filters by Name or Employee Code).
- Reset Filters button.
- Export Excel button (right-aligned).

**Matrix Table**:
- Columns: Employee Code | Name | Grade | Designation | Department | First Mapped | Jan | Feb | Mar | Apr | May | Jun | Jul | Aug | Sep | Oct | Nov | Dec
- Month cells: Green check icon for mapped, muted X icon for gap.
- Summary row at top showing total employees and mapping coverage percentage.

**Pagination**: Client-side, 20 rows per page, using existing Pagination components.

**Loading/Empty States**: Skeleton loader while fetching; empty state card when no employees match filters.

## Changes to Existing Files

### 3. `src/App.tsx` -- Route Registration

Add lazy import for `KpiMappingMatrix` and register route `/admin/kpi-mapping` inside admin-protected routes.

### 4. `src/pages/admin/AdminDashboard.tsx` -- Quick Action Shortcut

Add a new Quick Action button: "KPI Mapping Matrix" with a `Grid3X3` icon, navigating to `/admin/kpi-mapping`.

### 5. `src/pages/reports/ReportsHub.tsx` -- Report Card Entry

Add a new report card: "KPI Mapping Matrix" with description "12-month view of KPI mapping status per employee with org-hierarchy filters" linking to `/admin/kpi-mapping`.

### 6. `src/components/layout/AppSidebar.tsx` -- Sidebar Entry

Add `{ title: 'KPI Mapping', icon: Grid3X3, path: '/admin/kpi-mapping', roles: ['admin'] }` to the admin menu items.

### 7. `DOCUMENTATION.md` -- Version Bump

Version bump to 1.45.67.

## Technical Details

### Data Query Strategy

```text
Profiles query:
  SELECT id, full_name, employee_code, pms_grade, designation, department_id,
         departments(name, business_units(name, divisions(name)))
  FROM profiles
  ORDER BY full_name

KPIs query:
  SELECT employee_id, review_period
  FROM kpis
  WHERE review_year = <selectedYear>
```

The `review_period` values (e.g., "January", "February") are mapped to month indices. For each employee, a boolean array of 12 months is built. All filtering and pagination happen client-side since the dataset is bounded by employee count.

### Excel Export

Uses the existing `xlsx` library. Mirrors the filtered view exactly:
- Columns: Employee Code, Name, Grade, Designation, Department, First Mapped, Jan-Dec (Yes/No).
- Filename: `KPI_Mapping_Matrix_<year>.xlsx`.

### Risk Assessment

| Risk | Mitigation |
|------|-----------|
| Data Impact | Read-only; no schema changes needed |
| Workflow Impact | None; purely additive reporting feature |
| UI/UX Consistency | Follows existing PageHeader + filter bar + table pattern |
| Regression Risk | Low; new route, new hook, no mutations |
| Performance | Client-side pagination caps DOM to 20 rows; profile query is cached |

