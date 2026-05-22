## Goal

Replace the bulk drawer's basic "Stage scores" strip + JSON dump with the full `KpiReviewPanel` used by "View KPI Details" — so reviewers see:
- KPI header (category, frequency, UoM, scale thresholds)
- Rating scale display (e.g. "5 if value = 20")
- Per-stage cards with **Value → computed Rating** + **Evidence file links** + remarks
- KPI history (last few months)
- Queries / observations / timeline

…while keeping the bulk write/re-open fast-path that already lives in the drawer, and **without** pre-fetching panel data for the whole grid (preserves ADR-064 lean-load).

## Risk & Impact

- **Data**: no schema changes. Existing `review_submissions` already stores per-stage `*_achieved_value`, `*_rating`, `*_evidence_urls`. Extra read happens only when a row is opened.
- **Workflow**: none. Drawer write/re-open paths unchanged.
- **UI/UX**: drawer becomes the same rich panel reviewers know — consistent mental model. Same Sheet width (`sm:max-w-xl`) widens to `sm:max-w-[1100px]` to fit the two-column panel.
- **Regression risk**: low. `KpiReviewPanel` is rendered read-only (no editing inside it). Bulk write button remains the only mutation path in the drawer.
- **Scalability**: per-click RPC only — grid load is unchanged. Cell detail RPC stays cached 60 s.

## Plan

### 1. DB — extend `kpi_cell_detail` RPC
Augment the existing RPC (already returns `kpi`, `submission`, `revisions`) to also return everything `KpiReviewPanel` needs for one cell:

- `employee`: `id, full_name, employee_code, reporting_manager_id` + `reporting_manager_name`
- `kpi_history`: same `kra_name + kpi_name + employee_id`, last 6 review_periods, joined with their submissions (for `KpiHistoryCard`)
- `queries`: rows from `kpi_queries` for this `kpi_id`
- `workflow_stages`: result of `resolve_workflow_for_employee_period(employee_id, period, year)` (already used elsewhere)
- `org_kpi`: matching `org_kpi_values` row (entered_by_name, achieved_value, data_owner_names) when `kpi.is_org_kpi`

All in one `SECURITY DEFINER` call. No new tables, no RLS changes.

### 2. Hook — extend `useKpiCellDetail`
Type the response so it returns:
```ts
{ kpi, submission, revisions, employee, kpi_history, queries, workflow_stages, org_kpi }
```
Stay on the same 60 s `staleTime`.

### 3. Drawer — replace stage strip + JSON with `<KpiReviewPanel>`
In `src/components/review/BulkCellDrawer.tsx`:
- Widen the `SheetContent` to `sm:max-w-[1100px]`.
- When `detail.data` is loaded, render `<KpiReviewPanel>` with:
  - `kpi = detail.data.kpi`
  - `submission = detail.data.submission`
  - `allKpis = detail.data.kpi_history`
  - `allSubmissions = (history submissions)`
  - `queries = detail.data.queries`
  - `viewLevel = viewerStage` (mapped to ViewLevel)
  - `selectedPeriod`, `selectedYear` from row
  - `employeeName/Code`, `workflowStages`, `orgKpi*` from the new fields
  - **no edit callbacks** (timeline/history modals only open inline if we wire them — out of scope for v1)
- Keep the existing "Write as Manager/Skip/HR/Auditor" form + "Re-open" block below the panel.
- Drop the `<pre>{JSON.stringify(detail.data)}</pre>` dump and the basic stage scores grid (now redundant with `KpiJourneySection`).
- Keep variance / final / N/A badges in the header strip.

### 4. Tests
- Unit test `kpi_cell_detail` returns the new keys (mock kpi + submission + history rows) — extend `src/test/bulkReview/*` if present, otherwise add `src/test/bulkReview/kpiCellDetail.test.ts`.
- Component test: render `BulkCellDrawer` with a mocked detail response and assert that `KpiReviewPanel` renders (look for a header element it owns, e.g. KPI name) and the Write form is still present.

### 5. Docs / Policy
- Update `mem/features/review/bulk-review-dashboard` — note that the cell drawer reuses `KpiReviewPanel` for parity with "View KPI Details", and that detail is per-click only (lean-load preserved).
- Append POLICY.md entry under the Bulk Review section: "Bulk drawer must match View KPI Details parity — Value, computed Rating from scale, Evidence links, history, queries."
- Add ADR-066: "Bulk Review cell drawer parity with View KPI Details" (rationale: avoid two divergent review surfaces).

## Out of scope (v1)

- Inline editing of org KPI values, queries, or observations from inside the bulk drawer (still done via the normal scorecard route).
- Timeline / full-history modals inside the drawer (links can be added in a follow-up).
- Changing the bulk grid itself.

## Rollback

Revert the migration (drop-and-recreate prior `kpi_cell_detail` body) and revert `BulkCellDrawer.tsx` + `useBulkReview.ts` to the previous commit. No data destroyed.
