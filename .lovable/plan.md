

## Add Reporting Manager Column to KPI Journey Report

### What Changes

Add a "Reporting Manager" column to both the on-screen table and the Excel export.

### 1. Database Migration — Update `get_kpi_journey_report` RPC

Modify the SQL function to join the manager's profile and include `reportingManager` in the JSON output.

In the `filtered_kpis` CTE, add:
```sql
LEFT JOIN profiles mgr ON mgr.id = p.reporting_manager_id
```
Select `mgr.full_name AS manager_name`.

In `rows_data`, add to the `jsonb_build_object`:
```sql
'reportingManager', COALESCE(pg.manager_name, '—')
```

### 2. Frontend Hook — `src/hooks/useKpiJourneyReport.ts`

Add `reportingManager: string` to the `KpiJourneyRow` interface.

### 3. Report Page — `src/pages/reports/KpiJourneyReport.tsx`

**Table**: Add a `<TableHead>` for "Manager" after the "Dept" column, and a corresponding `<TableCell>` displaying `row.reportingManager`.

**Excel Export**: Add a `'Reporting Manager': r.reportingManager` field to the export mapping object, positioned after the "Department" column.

### Files Changed

| File | Change |
|------|--------|
| New migration | `CREATE OR REPLACE FUNCTION get_kpi_journey_report` — add manager join + output field |
| `src/hooks/useKpiJourneyReport.ts` | Add `reportingManager` to `KpiJourneyRow` interface |
| `src/pages/reports/KpiJourneyReport.tsx` | Add Manager table column + Excel export column |

