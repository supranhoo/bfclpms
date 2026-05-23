## Three targeted fixes on `/review/bulk-scoring`

### Issue 1 — Matrix UI overlap (KRA bands clash with avatar headers)

**Root cause:** In `BulkReviewMatrixGrid.tsx`, the KRA band rows are wrapped in a bare React `<>` fragment inside `.map()` without a `key`, which makes React mis-reconcile siblings on re-render. Combined with the `sticky left-0` on the band `<td colspan=N+1>`, this causes collapsed bands to visually stack/overlap with the sticky avatar header row.

**Fix (presentation only, in `src/components/review/BulkReviewMatrixGrid.tsx`):**
- Replace `<>...</>` with `<React.Fragment key={kraName}>...</React.Fragment>`.
- Drop redundant `sticky left-0 z-20` on the band `<td>` so the band scrolls horizontally with the row (no more z-fighting with the avatar header).
- Give the band row a solid `bg-muted` (no transparency) so even if it ever did stack against the header, content wouldn't bleed through.
- Bump the avatar-header `<th>` z-index from `z-30` to `z-40` (and the top-left corner from `z-40` to `z-50`) so the header is unambiguously on top.

### Issue 2 — Full-page view not utilising space

**Root cause:** `BulkReviewDashboard.tsx` wraps the page in `max-w-[1800px] mx-auto`, and the matrix viewport is `max-h-[calc(100vh-360px)]`. On wide screens (user is on 1628px CSS, but custom 1920+ users will also be affected) the dashboard caps width artificially and the grid wastes vertical room.

**Fix (presentation only, in `src/pages/review/BulkReviewDashboard.tsx` + `BulkReviewMatrixGrid.tsx`):**
- Remove the `max-w-[1800px] mx-auto` cap; use `w-full` so the dashboard fills the available shell width.
- Tighten outer paddings (`p-4 md:p-6` → `p-3 md:p-4`) to recover horizontal pixels.
- Change matrix viewport from `max-h-[calc(100vh-360px)]` to `max-h-[calc(100vh-260px)]` so the grid uses the freed vertical room.

### Issue 3 — Every employee shows the same Self → Manager → Auditor → Management

**Root cause:** `kpi_cell_detail` already resolves per-employee workflow via `get_employee_workflow(emp, period, year)`, **but that function returns the stages JSONB array directly** (e.g. `["self","manager","auditor","management"]`). `BulkCellDrawer.tsx` reads `detail.data.workflow?.stages` / `?.workflow_stages`, both of which are `undefined` on an array — so `KpiReviewPanel` falls back to its default 4-stage strip for **every** employee. The per-employee data is there; the drawer just looks at the wrong key.

**Fix (presentation only, in `src/components/review/BulkCellDrawer.tsx`):**
- Replace the `workflowStages` prop derivation with:
  ```ts
  workflowStages={
    Array.isArray(detail.data.workflow) ? (detail.data.workflow as string[])
    : Array.isArray(detail.data.workflow?.stages) ? (detail.data.workflow.stages as string[])
    : Array.isArray(detail.data.workflow?.workflow_stages) ? (detail.data.workflow.workflow_stages as string[])
    : undefined
  }
  ```
- No RPC change — the data is already returned correctly.

## Out of scope
- No DB / RPC / RLS / policy / write-path changes.
- No new tables, no migration.
- No changes to scoring, variance, or approval logic.
- No virtualization work (still pending in PRD §Polish).

## Risk & Impact
- **Data:** none — no schema or query change.
- **Workflow / Policy:** none — Policy §88, RLS, and bulk RPCs untouched.
- **UI/UX:** wider dashboard, fixed band overlap, accurate per-employee stage strip in drawer. Other pages unaffected (changes scoped to bulk-scoring components only).
- **Regression risk:** very low; all edits are presentational or a single prop-derivation fix. Existing tests for the matrix grid/drawer (if any) continue to pass since data contracts are unchanged.
- **Rollback:** revert the three files; flag-OFF path still hides the route entirely.

## Files touched
- `src/pages/review/BulkReviewDashboard.tsx` — width / padding tweaks.
- `src/components/review/BulkReviewMatrixGrid.tsx` — Fragment key, band sticky/z-index, viewport height.
- `src/components/review/BulkCellDrawer.tsx` — workflowStages derivation (array-aware).
