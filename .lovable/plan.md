

## Add Frequency Column to KPI Journey Timeline Report

The `frequency` field exists on the `kpis` table but the `get_kpi_journey_report` RPC function does not select or return it. Three layers need changes.

### Plan

| # | Layer | Change |
|---|-------|--------|
| 1 | **Database RPC** | Alter `get_kpi_journey_report` to add `k.frequency` in the `filtered_kpis` CTE and include `'frequency', COALESCE(pg.frequency, '—')` in the `jsonb_build_object` output |
| 2 | **Hook type** (`useKpiJourneyReport.ts`) | Add `frequency: string` to the `KpiJourneyRow` interface |
| 3 | **Report page** (`KpiJourneyReport.tsx`) | Add a "Frequency" `<TableHead>` + `<TableCell>` column in the table (after KPI column, before Type), and add `'Frequency': r.frequency` to the Excel export mapping |

### Details

**RPC migration** — In the `filtered_kpis` CTE, add `k.frequency` to the SELECT list. In `rows_data`, add `'frequency', COALESCE(pg.frequency, '—')` to the `jsonb_build_object`. This pulls from the existing `kpis.frequency` column with no new joins needed.

**UI** — The new column goes between "KPI" and "Type" in the table, and between "KPI" and "Month" in the Excel export, matching the established column order pattern from other reports.

