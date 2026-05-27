
# Management Bulk Approve — Parity with Sign-off UI

## Goal
Bring Management's `Bulk Approve` dialog to visual + informational parity with the `Bulk Sign-off` dialog (wide shell, all 6 stage scores per cell, per-employee rollup). Management currently sees a narrow remark-only dialog and cannot verify *which* stage will be stamped as final.

UI/presentation only. No RPC, schema, RLS, or business-logic changes. Final-score stamping rules (Policy §88, highest-priority completed stage, immutability) are untouched.

## Assumptions
- Management's terminal `bulk_management_approve` write payload is unchanged. We only surface what the server already computes.
- The existing `BulkSignoffPreview` data source (`useBulkSignoffPreviewData` → `buildBulkSignoffImpact`) is reusable for approve mode — it already returns all 6 stage scores plus the resolved final.
- The parent (`BulkReviewMatrixGrid`) already runs the preview hook when sign-off mode is active; for approve mode we'll enable the same hook gated on `mode === 'approve' && cellCount > 0`.

## Risk & Impact Report
- **Data:** None — read-only preview reuses existing query.
- **Workflow:** None — Management still calls `bulk_management_approve` with the same payload (remark + URLs).
- **UI/UX:** Approve dialog widens from `sm:max-w-3xl` → `w-[98vw] sm:max-w-[1400px]` with sticky header/footer. Mobile falls back to the same 3×2 stage mini-grid used in sign-off mode. The "Final" column gets the active-stage highlight instead of an intermediate column.
- **Regression risk:** Low — sign-off mode unchanged; admin override toggle stays gated to sign-off; the only branch we touch is approve mode's dialog shell.
- **Scalability:** Same as sign-off — preview already paginates via the existing hook; no extra round-trips.
- **Mitigation:** Keep approve-mode override toggle hidden; add a single render test asserting (a) Management dialog renders the wide shell + preview table, (b) override toggle is absent, (c) "Final" column carries the highlight.

## UI Changes (exact)
**File: `src/components/review/BulkApproveDialog.tsx`**
- Replace the `isSignoff`-only branch on `DialogContent` so the wide shell + sticky header/body/footer apply when `mode === 'signoff' || mode === 'approve'`.
- Render `<BulkSignoffPreview>` for both modes. Pass new prop `mode={mode}`.
- Keep the admin Override card **only** when `isSignoff && isAdmin` (unchanged).
- Approve-mode copy (title, description, button label "Approve N cells", §88 footer text) stays exactly as today.

**File: `src/components/review/BulkSignoffPreview.tsx`**
- Accept new prop `mode: 'signoff' | 'approve'` (default `'signoff'` for back-compat).
- When `mode === 'approve'`:
  - Active-stage column highlight (`bg-primary/10`) moves from the current stage to the **Final** column.
  - Per-row "Resolved score" header label switches from `Carried to {stage}` → `Final score`.
  - Per-cell `achievedOverride` inputs are hidden (Management does not override per-row Achieved on terminal approval).
  - Stage-aware help text under the matrix swaps to: *"Final score is stamped from the highest-priority completed stage (Auditor > HR PMS > Skip-Level > Manager) per Policy §88."*
- All sizing, sticky thead, mobile mini-grid, and `EmployeeRollupTable` (Self avg / Mgr avg) behavior stays identical.

**File: `src/components/review/BulkReviewMatrixGrid.tsx`**
- Enable the existing `useBulkSignoffPreviewData` call when `action.kind === 'mgmt'` too (currently only for `'stage'`). Pass its result + loading/error props into `BulkApproveDialog` regardless of mode.

No other files touched. No new dependencies.

## Step-by-Step Plan
1. **Extend `BulkSignoffPreview`** with `mode` prop → final-column highlight, label swap, hide override inputs, swap helper text. *Verify:* existing sign-off snapshot unchanged when `mode` omitted.
2. **Update `BulkApproveDialog`** → wide shell for both modes; render preview + pass `mode`; keep approve-mode override hidden. *Verify:* approve dialog matches sign-off width; admin override card absent in approve mode.
3. **Update `BulkReviewMatrixGrid`** → run preview hook for `'mgmt'` action too; thread `preview`, `previewLoading`, `previewError` into the dialog for both kinds. *Verify:* Management opening Bulk Approve sees the matrix populated.
4. **Tests** (`src/test/bulkApproveDialogSignoffMode.test.tsx` + new sibling spec):
   - Approve mode renders `max-w-[1400px]` shell.
   - Approve mode renders the 6 stage columns + Final, with Final column highlighted.
   - Approve mode does **not** render override toggle, even when `isAdmin`.
   - Sign-off mode tests untouched (regression guard).
5. Run `bunx vitest run` for the touched specs.

## Out of Scope
- Per-row Achieved override for Management (intentional — terminal approval derives from stage scores).
- `bulk_management_approve` RPC, backup, RLS, migrations.
- Mobile redesign beyond the existing 3×2 fallback.

## Documentation / Policy Updates
- `DOCUMENTATION.md` → "Bulk Review Dashboard" section: note approve-mode dialog now mirrors sign-off shell and surfaces all stage scores + final-column highlight.
- `POLICY.md` → no policy change; add a one-line note under §111.7 clarifying that Management's Bulk Approve dialog *displays* the §88 fallback chain (Auditor > HR PMS > Skip-Level > Manager) but does not alter it.

## Rollback
Single revert of the three edited components restores prior narrow approve dialog. No DB or contract changes to undo.
