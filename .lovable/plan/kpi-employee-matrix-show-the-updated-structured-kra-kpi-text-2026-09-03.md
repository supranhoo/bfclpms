# KPI-Employee Matrix — show the updated (structured) KRA / KPI text

## What I verified

- `rpc_kpi_employee_matrix_rows` returns only `kra_name, kpi_name, criteria (as description), weightage, category`. It does **not** return the structured columns, so the report has nothing newer to render.
- The structured columns **do exist and are populated** on `kpis` for FY2026: of 20,378 rows in review_year 2026, 17,496 have `kpi_title`, 12,804 `kpi_description`, 17,400 `kpi_formula`, 17,461 `kpi_scoring_logic`.
- The report page (`src/pages/reports/KpiEmployeeMatrix.tsx`) renders `row.kpiName` / `row.kraName` raw and its field registry has only 6 prefix fields (Sr, Category, KRA, KPI, Weightage, Employee Count).
- The hook groups rows by `kra_name|kpi_name`, which is exactly why legacy name variants of one KPI appear as separate rows.
- A shared resolver already exists (`src/lib/kpiTextSplit.ts`, `src/components/kpi/KpiText.tsx`) and is used by the scorecard/review surfaces — the matrix is the surface still on the pre-ADR-269b path.

## Fix

### 1. Backend (additive, read-only)
Replace `rpc_kpi_employee_matrix_rows` (DROP + CREATE, per POLICY §DB-FUNCTION-SIGNATURE-CHANGES — same argument list, widened `RETURNS TABLE`) to also select
`kpi_title, kpi_description, kpi_formula, kpi_scoring_logic`.
No schema, RLS, grant or filter change; the WHERE clause stays identical.

### 2. Resolver-backed display text
In `useKpiEmployeeMatrix`, resolve each row once:

```text
title    = kpi_title    ?? splitKpiText(kpi_name).title    ?? kpi_name
descr    = kpi_description ?? split.description ?? criteria
formula  = kpi_formula  ?? split.formula
scoring  = kpi_scoring_logic ?? split.scoring_logic
```

So structured KPIs show the clean title/blocks, and any KPI without structured
fields falls back to the legacy `kpi_name` text exactly as today.

### 3. De-duplication of the row key
Group rows by `category + kra_name + normalized(resolved title)` instead of raw
`kpi_name`. Legacy variants of one KPI that resolve to the same title collapse
into a single row (weightages/scores merge per employee, as they already do for
the canonical mode). Raw `kpi_name` stays available on the row for tooltips and
for the existing ADR-330 canonical registry lookup — matching logic is untouched.

### 4. Columns
Add four registry fields to `MATRIX_FIELD_DEFAULTS`: `kpi_title`, `kpi_description`,
`kpi_formula`, `kpi_scoring_logic` (sorted after KPI, before Weightage). They appear
in the Excel export as their own columns and are renamable/hideable through the
report field registry like every other column.

On screen the left pane stays compact (`COL.kpi = 180`): the KPI cell shows the
resolved title, and the existing hover tooltip is extended to show Description /
Formula / Scoring Logic blocks. No layout, sticky-column or pagination change.

## What changes visually

Matrix rows show the clean KPI title instead of the long pasted blob; duplicate
variant rows for the same KPI collapse into one; the hover card gains labelled
Description / Formula / Scoring Logic blocks; the Excel file gains four columns.
Legacy KPIs look exactly as today.

## Risk & impact

- Data: none — read-only RPC widening; no writes anywhere.
- Workflow / scoring: none; the weighted-score fallback chain, cap and click-to-load are untouched.
- Regression risk: medium-low, concentrated in the row key change (row counts drop where variants merge). Mitigated by keeping merge behaviour identical to the existing canonical-mode merge and by tests.
- Performance: same query shape, four extra text columns per row; export width +4.
- Rollback: restore the previous RPC body and revert the hook/page; both are self-contained.

## Tests

`src/tests/kpiEmployeeMatrixStructuredText.test.ts`
- structured row resolves title/description/formula/scoring from the columns;
- legacy row (all four null) falls back to the split of `kpi_name`, and to `kpi_name` itself when unparsed;
- two legacy variants resolving to the same title merge into one row with both employees' weightages;
- export prefix includes the four new field keys in registry order.

Plus re-run the existing matrix/report suites, `npx tsgo --noEmit` and a build.

## Docs

`docs/adr/ADR-358.md`, a DOCUMENTATION.md version entry, and POLICY.md
§KPI-TEXT-DISPLAY-SSOT extended to name the matrix report as a covered surface.
