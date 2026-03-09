

# Plan: Add Frequency Column to KPI Status Tracker

## Problem
The KPI Status Tracker report is missing the **Frequency** column (e.g., Monthly, Quarterly, Bi-Monthly), which is stored in `kpis.frequency`.

## Changes

### File: `src/pages/reports/KpiStatusTracker.tsx`

1. **Add `frequency` to the `StatusTrackerRow` interface** (around line 69)
2. **Add `frequency` to the Supabase select query** (line 119) — just append `, frequency` to the existing fields
3. **Map `frequency` in the result builder** (around line 155) — `frequency: kpi.frequency ?? '—'`
4. **Add a table column header** between "Weightage" and "Status" columns — `<TableHead>Frequency</TableHead>`
5. **Add the table cell** in the row rendering — `<TableCell className="text-xs">{row.frequency}</TableCell>`
6. **Add to Excel export** — insert `'Frequency': r.frequency` after Weightage in the export mapping, and add a column width entry

No database or RLS changes needed — `kpis.frequency` already exists.

