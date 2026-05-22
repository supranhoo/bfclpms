# Bulk Scoring → KPI-Employee Matrix Redesign

Inspired by `/reports/kpi-employee-matrix`. Pure UI/composition change. **Zero changes to RPCs, hooks, write paths, RLS, or the existing `KpiReviewPanel` drawer.**

Locked design tokens (Navy Trust · Space Grotesk + DM Sans · dashboard shell):
- `--background` paper `#e8edf3`, surface white, navy text `#0f1b3d`, accent `#3b6fa0`.
- All score cells `tabular-nums`. Sticky thead `z-30`, header corner `z-40`, body sticky `z-20`.

## Direction

Default to **Reviewer Cockpit Matrix** (rows = KPI/KRA, columns = Employees) — the most direct mirror of the KPI-Employee Matrix screenshot the user pointed at. If you'd rather build **Inverse Employee Matrix** (rows = Employees, columns = stages per KPI) or **Heat Grid** (dense colored cells, no avatars), say so before I start and I'll swap.

## What changes visually

Top scope strip (compact, single row):
- Period · Year · My Stage selects · scope counts (`emp · KPI · KB`) · `Load Scope` CTA · `Refresh` pill.
- Tile row collapses into the strip — no more 4 big tile cards.

Matrix surface (replaces the flat `BulkReviewVirtualGrid`):
- **Sticky left pane** (`min-w-[280px]`): KPI name (bold) · KRA · Weightage % muted second line. Global "Show KRA · Wt%" switch + per-row chevron, mirroring the matrix report.
- **Sticky thead**: Employee column headers — initials avatar circle + name + employee code. Width `min-w-[140px]`.
- **Category bands**: sticky-left rows grouping by KRA category (collapsible).
- **Cells**: viewer-stage score in `tabular-nums`, variance dot top-right (`emerald` ≤ 1.0 spread, `amber` 1.0–2.0, `red` > 2.0), `Pending` dashed placeholder when null. Click → opens existing `BulkCellDrawer` (no changes to it).
- **Selection**: checkbox on each employee column header selects every cell for that employee in scope; checkbox in the corner = select-all. Selected cells get a navy ring.
- **Frozen right-edge action rail** appears when selection > 0: shows count + "Bulk Approve (Mgmt)" (gated by `canApprove`, unchanged logic). Same `ConfirmDestructiveDialog` and `handleBulkApprove`.
- **Pagination footer**: `Page X / Y`, Prev/Next, page-size unchanged (200 rows from snapshot).

## What stays identical (non-negotiable)

- All hooks: `useBulkReviewFlag`, `useBulkScopePreview`, `useBulkReviewSnapshot`, `useBulkManagementApprove`, `useBulkReopenCells`, `useKpiCellDetail`.
- `bulk_scope_preview`, `bulk_review_snapshot`, `bulk_write_stage_scores`, `bulk_management_approve`, `bulk_reopen_cells`, `kpi_cell_detail` RPCs — no signature changes.
- Click-to-load gate, 25k cell cap, no realtime, Refresh-only.
- `BulkCellDrawer` + `KpiReviewPanel` parity untouched.
- Feature flag `feature_bulk_review_dashboard` gating, role-based viewer-stage default.

## Files

- **Edit** `src/pages/review/BulkReviewDashboard.tsx` — replace the scope card + tile grid + `BulkReviewVirtualGrid` block with the new matrix shell (scope strip + `<BulkReviewMatrixGrid />`).
- **Create** `src/components/review/BulkReviewMatrixGrid.tsx` — new component that pivots the existing flat `BulkReviewRow[]` (already returned by `bulk_review_snapshot`) into `(kraName + kpiName) × employee` cells in-memory. Sticky panes, category bands, variance dot, selection model. Props: `rows`, `viewerStage`, `selectedSubmissionIds`, `onToggleSubmission`, `onToggleEmployee`, `onCellClick`.
- **Leave alone** `BulkReviewVirtualGrid.tsx` (kept as fallback / linked from elsewhere) — delete only if grep shows no other consumer.

## Risk & Impact

- **Data**: none. No schema, RLS, or RPC changes.
- **Workflow**: none. Same write paths, same approvals, same drawer.
- **UI/UX**: significant — flat table → pivot grid. Mitigation: pivot is computed client-side from the same `snapshot.rows` payload already loaded; no extra fetches. Same pagination semantics (page of *KPI rows*, not employees, to keep payload cap honest).
- **Performance**: pivot is `O(rows)` over ≤ 25k cells, already capped. Sticky columns use `position: sticky` (not virtualization) — acceptable for the 200-row page; if a future bigger page is needed we add `@tanstack/react-virtual` row windowing.
- **Regression**: low. The drawer, write RPCs, ConfirmDestructiveDialog, and feature flag stay byte-identical. Worst case: revert one component import.

## Out of scope (v1)

- Inline cell editing (still opens drawer to write).
- Heat-grid color scale, vertical employee headers (Heat Grid direction).
- Inverse-matrix orientation (Inverse Employee direction).
- Stage-by-stage column expansion inside a KPI cell.
- Export-to-Excel of the matrix.

## Verification

- Load `/review/bulk-scoring`, click Load Scope on a populated period → matrix paints with sticky KPI pane + sticky employee header.
- Click a cell → existing `KpiReviewPanel` drawer opens with rating-scale, evidence, history (unchanged).
- Select cells → bottom-right action rail shows; Bulk Approve → confirm dialog → toast (unchanged path).
- Scope-too-large badge still disables Load.
- Flag OFF still renders the disabled alert.
