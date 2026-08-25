# KPI Data Table — Excel-parity grid, history, and employee impact

Goal: make the KPI data table behave exactly like your Excel sheet (BU · KPI · Month · Target · Achieved · Ach % · Incentive · Rating, with a totals row), keep prior-year rows as permanent history, and have the table's number drive the KPI of every employee mapped to that KPI — including employees added later.

## 1. Fix "Add column" crashing the page

Confirmed cause (read in `DatasetSchemaDialog.tsx`): **Add column** inserts a row with an empty `column_key` and type `number`. That empty key is immediately offered as an option in the Achieved / Target / Weight pickers, and a select option with an empty value throws — which is why the whole console falls to "Something went wrong".

Fix:
- Give new columns a unique placeholder key (`column_1`, `column_2`, …) instead of `""`.
- Filter out any column with a blank key before building the Achieved/Target/Weight option lists.
- Wrap the dialog in the existing error boundary so a future field error shows an inline message instead of blanking the page.
- Regression test: add a column, assert no empty-valued option and no crash.

## 2. Per-KPI shape and period rhythm

Each KPI already keeps its own table definition — its own columns, keys, units, formulas, roll-up rule and period granularity. Nothing is shared or fixed across KPIs: Production can be Target / Achieved / Ach % / Incentive / Rating, while another KPI can be a completely different set of columns with a different roll-up.

What is missing is the period rhythm. Today the choices are month, quarter, week or event, so a **bi-monthly**, **half-yearly** or **yearly** KPI cannot be expressed.

Changes:
- Extend the row rhythm to: weekly · monthly · bi-monthly · quarterly · half-yearly · yearly · per event.
- Default it from the KPI's own frequency and cycle anchor, so a bi-monthly KPI opens with bi-monthly rows already selected; the admin can still override.
- Row labels follow the rhythm (e.g. `Jul–Aug 26`, `Q2 FY26`), and entry is only offered for periods that are due — matching the existing not-due read-only rule.
- The Excel sheet is one row per period across a **fiscal year (Jul → Jun)**; today the panel's toggle shows a *calendar* year, so Jul-25…Jun-26 cannot appear together. Add a scope selector: **This period · This fiscal year (Jul–Jun) · A past fiscal year · All history**, using the existing fiscal-window helpers, sorted Jul → Jun.
- A pinned **totals row** at the bottom: sum of Target, sum of Achieved, overall Achievement % (sum ÷ sum) and the averaged Rating — matching your yellow/green summary cells.
- Show BU / KPI / Period as fixed leading columns so you don't have to configure them as data columns.
- Rating column: a derived column driven by the KPI's existing scoring bands, so 104% → 2.33 style ratings come from configuration, not hand entry.


## 3. Historical / legacy data

Rows are already stored per `review_period` + `review_year`, so history is structurally supported. To make it usable:
- **Import legacy year** action on the panel: paste or upload the old sheet (CSV/XLSX), dry-run preview showing rows to insert vs. skip, then commit. Uses the existing bulk-import RPC.
- Legacy rows are flagged `source = legacy` so they are visible but excluded from the "needs entry / approval" counters.
- History is read-only once a period is validated; every edit keeps its before/after trail.

## 4. Impact on employees mapped to the KPI

Today the table's roll-up is display-only — it computes the headline number but does not write it. The propagation machinery (central value → mapped employees) already exists separately.

Changes:
- **Use as the KPI value** action: takes the roll-up for the period and files it as the central achieved value, with the working recorded (e.g. `sum 68,737 ÷ 66,370 = 104%`). It then follows the existing approval ladder and propagates to every mapped employee's KPI for that month.
- **New employee added later**: run the existing propagation-gap repair automatically when a mapping is added, so the already-approved table number lands on their KPI for the open months. Past locked/approved months are never rewritten — they are reported as skipped.
- Weightage and per-employee scoring bands stay per employee; only the achieved value comes from the table.

## Technical notes

- Files: `DatasetSchemaDialog.tsx` (key fix), `KpiLedgerPanel.tsx` (fiscal scope, totals row, legacy import, "use as KPI value"), `src/lib/review/kpiLedgerModel.ts` (totals + fiscal grouping helpers), `src/hooks/useOrgKpiDataset.ts`.
- Server: extend the roll-up path with a write action that files the value through the existing central-value RPC (the current roll-up function is read-only by design and stays that way); add `source` to ledger rows; reuse `org_kpi_dataset_bulk_import`, `propagate_org_kpi_value`, `diagnose_org_kpi_propagation_gap` / `repair_org_kpi_entered_unpropagated_rows`.
- Access unchanged: providers/data owners write rows, Audit/HR validate, admins design columns.
- Tests: column-designer regression, fiscal grouping and totals, legacy import dry-run, roll-up → value hand-off, late-employee backfill skipping locked months.
- Docs: ADR-316 plus DOCUMENTATION.md and POLICY.md updates.

## Rollback

All four parts are additive and independently revertible; no destructive schema change (only a new nullable `source` column on ledger rows).
