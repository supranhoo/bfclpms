

# Add Reporting Manager Name to KPI Header

## Problem
The KPI detail panel (visible in all review scorecards) doesn't show who the employee's reporting manager is. The user wants it displayed below the Timeline button in the top-right corner.

## Approach
Fetch the reporting manager name directly inside `KpiHeaderSection` using `kpi.employee_id`. This avoids adding a new prop to `KpiReviewPanel` and all 7+ consumer components.

**Self-contained query**: Use a single Supabase query joining the employee profile to their manager's profile via `reporting_manager_id`, cached by react-query.

## Changes

### File: `src/components/review/KpiHeaderSection.tsx`
1. Import `useQuery` from `@tanstack/react-query` and `supabase` client
2. Add a query that fetches the reporting manager's `full_name` for the given `kpi.employee_id`:
   - Query `profiles` for `reporting_manager_id` where `id = kpi.employee_id`
   - Then fetch the manager's `full_name` from `profiles` where `id = reporting_manager_id`
   - Cache key: `['kpi-reporting-manager', kpi.employee_id]`
3. Display the manager name as a small text line below the badges row, right-aligned, showing: `👤 Reporting Manager: [Name]`
   - Uses `text-xs text-muted-foreground` styling, positioned in the top-right area after the badges/Timeline row
   - Only renders when manager name is available (not null)

No database changes, no new props needed. The query is lightweight and cached per employee.

