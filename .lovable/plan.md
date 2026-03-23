

## Add Filters and Average Column to Direct Reportees Score Trend

### Problem
The Direct Reportees monitor currently shows only the logged-in user's direct reports with no filtering. The user wants:
1. **Reporting Manager filter** — view any manager's team, not just own
2. **Business Unit filter** — filter employees by business unit
3. **Period (month/year) filter** — independent month/year selection for this widget
4. **Average column** — show the weighted average across all displayed months

### Changes

#### `src/components/management/DirectReporteesMonitor.tsx`

1. **Add filter state** — `reportingManagerId`, `businessUnitId` as local state with dropdowns. Use the existing `selectedMonths` and `fiscalStartYear` from props (already controlled by the parent dashboard).

2. **Fetch filter options** — Query `profiles` for distinct reporting managers (who have reports) and `business_units` for the BU dropdown. Only admins/management roles see the reporting manager filter; regular managers see only their own team.

3. **Update the main query**:
   - When `reportingManagerId` is set, query `profiles` with `.eq('reporting_manager_id', reportingManagerId)` instead of `user.id`.
   - When `businessUnitId` is set, join through `profiles → departments → business_units` to filter employees by BU. Specifically: fetch department IDs for the selected BU, then add `.in('department_id', deptIds)` to the profiles query.

4. **Add "Avg" column** — After the monthly columns, add a final `TableHead` "Avg". For each employee row, compute the average of non-null monthly scores and display it with the same color-coded badge. This is a simple client-side calculation from the existing `scores` object.

5. **Filter UI** — Render a compact filter bar above the table inside the card:
   ```
   [Reporting Manager ▼]  [Business Unit ▼]
   ```
   Use existing `Select` components. Keep it minimal — 1-2 lines.

6. **Sort by average** — Default sort employees by their average score (descending) so top performers appear first.

### No database or backend changes needed
All data is already accessible via existing RLS policies. The profiles and business_units tables are readable by authenticated users.

