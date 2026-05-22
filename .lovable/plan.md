## Goal

Reshape the left (frozen) pane of `/reports/kpi-employee-matrix` into a 3-level hierarchy — **Category → KRA → KPI** — matching the reference. Category becomes the top group (sticky band, as today), KRA sits as a collapsible sub-group under it, and each KPI row shows name + one-line description. Employee score columns continue to scroll horizontally; the left pane stays frozen.

## Risk & Impact Report

- **Data Impact**: Additive. `rpc_kpi_employee_matrix_rows` gains a `description text` column; hook adds `description` to `MatrixKpiRow`. No schema, RLS, or scoring change.
- **Workflow Impact**: None — presentation only.
- **UI/UX Impact**: Left pane widens from 224px → ~300px (Sr 44 + KRA/KPI 256). Category column is removed (Category becomes the top sticky band only). KRA becomes a collapsible sub-band. Per-row chevron and global "Show KRA · Wt%" switch are retired.
- **Regression Risk**: Sticky offsets and z-index stacking (Category band > KRA band > rows). Excel export unchanged (still flat KRA + KPI columns).
- **Scalability**: Description is `text`; payload grows ~10–15%. No new queries.
- **Mitigation**: Type-check, smoke on Commercial-Plant Accounts, Safety & Health, Support Function (50 emp/page). Tooltip still carries full KRA, KPI, description, base weightage, category.

## Layout (left pane only)

```text
┌────┬─────────────────────────────────────┬──── employees ───▶
│ Sr │ KRA / KPI                           │ (scroll-x)
├────┴─────────────────────────────────────┼────────────────────
│ ● EXCELLENCE & PROCESS IMPROVEMENT  · 6  │   ← Category band (sticky top)
│   ▼ KRA: PMS                              │   ← KRA sub-band (sticky top, indent)
│ 1   On-time Completion (HR-PMS)          │ … scores …
│       Ensures all monthly reviews…        │   ← description (muted, truncate)
│ 2   On-time Completion (Director's)      │ … scores …
│   ▼ KRA: Reporting                        │
│ 3   Monthly Scorecard Submission         │ … scores …
│ ● QUALITY · 4                             │
│   ▼ KRA: First-Pass Yield                 │
│ 4   FPY %                                 │ … scores …
└──────────────────────────────────────────┴────────────────────
```

- **Category band** (level 1): existing sticky band — top of group, full-width, dot + uppercase label + KPI count. `top: COL.headerH`, `z-25`.
- **KRA sub-band** (level 2, NEW): sticky `left-0`, indented, chevron toggles collapse of the KRA's KPIs. Stacks below the Category band visually but does NOT need to stick simultaneously — only `left` sticky so it stays visible during horizontal scroll. Light divider, slightly tinted `bg-muted/30`.
- **KPI row** (level 3): Sr + KPI cell. KPI cell shows name (bold, truncate 1 line) and description (`text-[10px] text-muted-foreground` truncate 1 line). Indented to align under the KRA band.

## Implementation

### 1. `src/hooks/useKpiEmployeeMatrix.ts`
- Add `description: string` to `MatrixKpiRow`.
- Read `kpi.description` from RPC; first-occurrence wins (same pattern as `weightage`).

### 2. Migration: `rpc_kpi_employee_matrix_rows`
- `CREATE OR REPLACE FUNCTION` adding `description text` to `RETURNS TABLE` and `SELECT k.description`. Pure additive; no caller breakage.

### 3. `src/pages/reports/KpiEmployeeMatrix.tsx`
- `COL` update: `kpi: 180 → 256`. Keep `sr: 44`. Drop any Category column.
- New state: `collapsedKras: Set<string>` keyed by `${categoryName}|${kraName}`.
- Retire `expandedRows`, `expandAll`, and the "Show KRA · Wt%" switch in the filter bar.
- `<tbody>` render order:
  1. On `categoryName` change → existing sticky Category band row (kept).
  2. On `kraName` change within category → new sticky-left **KRA sub-band** with chevron, KRA name, KPI count.
  3. KPI rows under that KRA (skip if collapsed).
- KPI sticky `<td>`: `KPI name` + muted `description` (truncate). Tooltip retains KRA, Category, Base Weightage, full description.
- Z-index discipline preserved: thead `z-30`, header intersection `z-40`, Category band `z-25`, body sticky cells `z-20`.

### 4. Docs / memory
- `mem/features/reports/kpi-employee-matrix-report.md` — replace layout invariants block: 3-level Category → KRA → KPI hierarchy, KRA collapse, description, `COL.kpi=256`.
- `DOCUMENTATION.md` — version history entry `v2026-05-22b`.
- `POLICY.md` — N/A.

### 5. Tests
- Extend `useKpiEmployeeMatrix` fixtures (or add a focused unit test) asserting `description` flows into `MatrixKpiRow`.

## Out of scope

Matrix pivot, Excel format, scoring, RLS, mobile redesign, new filters.

## Verification

1. `bunx tsc --noEmit` clean.
2. Preview `/reports/kpi-employee-matrix` at 1681px — confirm Category band > KRA sub-band > KPI rows stack correctly; KRA collapse toggles only its KPIs; employee columns scroll horizontally with left pane frozen.
3. Spot-check Support Function (50 emp/page) and Commercial-Plant Accounts.
