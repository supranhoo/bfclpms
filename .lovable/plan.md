

## Add Pending KPI Excel Export to All Dashboard Views

### What
Add an "Export Pending KPIs" button next to the period selector on every reviewer dashboard (Self Review, Manager Review, Skip Mgr Review, HR PMS, Audit, Management). The export generates an Excel file with only the KPIs that are "pending" for that specific view level.

### Columns in Export
| Column | Source |
|--------|--------|
| Employee Code | `profiles.employee_code` |
| Employee Name | `profiles.full_name` |
| Designation | `profiles.designation` |
| PMS Grade | `profiles.pms_grade` |
| Department | `departments.name` via `profiles.department_id` |
| Category | `kra_categories.name` |
| KRA Name | `kpis.kra_name` |
| KPI Name | `kpis.kpi_name` |
| Month | `kpis.review_period` |
| Reporting Manager | `profiles.full_name` via `reporting_manager_id` |
| Skip Manager | Manager's `reporting_manager_id` → `profiles.full_name` |

### Pending KPI Logic Per View
- **pending_self_review**: `status === 'kra_set'`
- **pending_manager_review**: `status === 'self_review'`
- **pending_skip_review**: `status === 'manager_check'`
- **team** (Manager Review): `status === 'self_review'` (direct) or skip-level reviewable (indirect)
- **skip_level**: `resolveReviewableStatuses('skip_level', stages)`
- **hr_pms**: `resolveReviewableStatuses('hr_pms', stages)` excluding already at `hr_pms_review`
- **audit**: `resolveReviewableStatuses('auditor', stages)` excluding already at `audit`
- **management**: `status === 'management_review'`

### Implementation

#### File: `src/components/review/EmployeeSelectorGrid.tsx`

**1. Add export function** (~line 695, before `renderStatsCards`)
- Import `* as XLSX from 'xlsx'` and `Download` icon
- Create `handleExportPendingKpis()` that:
  - Iterates `displayMembers` and their KPIs from `periodKpis`
  - Filters to only "pending" KPIs using the same logic as `getEmployeeKpiStats`
  - Builds a profile lookup map for reporting manager and skip manager names (manager's manager from `allProfiles`)
  - Builds department lookup from the `departments` array
  - Maps each pending KPI to a row with the 11 columns above
  - Creates an XLSX workbook and triggers download

**2. Add Export button** (~line 1035, next to period selector)
- Add a `Button` with `Download` icon labeled "Export Pending" in the header actions area, visible on all view levels
- Disabled when no pending KPIs exist

### No database changes needed

