# Bulk Sign-off dialog — N/A toggle + KRA·KPI hoisting

Targets the "Bulk sign off N cells as <stage>" dialog (`BulkApproveDialog` + `BulkSignoffPreview`). Both changes are presentation-layer; the DB/RPC already supports N/A.

## 1. Add N/A option per row (admin override mode)

### Why it works today without DB changes
`useBulkStageWrite` already accepts `is_na: Record<submission_id, boolean>` and `na_reasons: Record<submission_id, string>` and forwards them to `bulk_write_stage_scores`. Only the UI is missing.
(Management bulk-approve RPC does **not** accept N/A — for that mode we keep the toggle hidden.)

### UI
- Extend `CellInputs` (`src/lib/carriedScoreResolver.ts`) with optional `isNa?: boolean`.
  - When `isNa === true`, `resolveWithInputs` returns `{ score: null, source: 'none' }` and the Achieved-override input is disabled.
- `BulkSignoffPreview` (`CellTable`):
  - Add a small "N/A" checkbox in the existing **Override** column cell, beside the Achieved input. Visible only when `editable` AND (`isRowEditable` OR `isOverride`).
  - When ticked: hide the numeric/qualitative input, dim Resolved to "—", show a muted "N/A" pill in Source column, and the row contributes `0` weight to the per-employee rollup (`bulkSignoffImpact` already excludes `is_na: true` rows from totals — we just need to feed it the live override).
- `BulkApproveDialog`:
  - In `handleConfirm`, build two extra maps from `inputs`:
    - `isNaMap[sid] = true` for every row whose `isNa === true`
    - `naReasonsMap[sid] = reason.trim()` (reuse the mandatory shared remark; ≥10 chars already enforced)
  - Pass via the new payload fields `isNa` and `naReasons`.
- `BulkReviewDashboard.handleBulkApprove`:
  - For sign-off mode (`bulkAction.kind !== 'mgmt'`), pass `is_na: extras?.isNa` and `na_reasons: extras?.naReasons` to `stageWrite.mutateAsync`.
  - For management approve mode, the N/A column stays hidden (mode prop already known to `BulkSignoffPreview`).
- Live impact: `bulkSignoffImpact.computeImpact` already treats `is_na: true` rows as excluded from weighted totals. Wire the override map through (`overrideIsNa: Set<submission_id>`) so the per-employee rollup updates instantly.

### Edge cases
- Cannot mark N/A while the cell has an Achieved override entered — checking N/A clears `achievedOverride`.
- Required-unfilled counter: a row marked N/A is **not** counted as `requiredUnfilled` (it's intentionally blank).
- Disabled in `mode === 'approve'` (Management) because the RPC has no `p_is_na` parameter.

## 2. Hoist shared KRA · KPI to the top of the per-cell preview

In `BulkSignoffPreview`, before rendering `CellTable`:
1. Compute `sharedKra = cells.every(c => c.kra_name === cells[0].kra_name) ? cells[0].kra_name : null`.
2. Same for `sharedKpi`.
3. If **both** are shared and `cells.length > 1`:
   - Render a banner above the table:
     ```
     ┌─ TIMELY SUBMISSION OF REPORTS ─────────────────────────────┐
     │ On-Time Submission of Daily & Monthly Reports              │
     └────────────────────────────────────────────────────────────┘
     ```
     (small uppercase KRA + KPI title, muted background, gap-2)
   - Hide the **KRA · KPI** column in the desktop table (set `hideKraKpiCol` prop) and hide the KRA·KPI block in the mobile card.
4. If mixed (different KPIs across rows), behave exactly as today — banner not rendered, column stays.

This gives back ~220px of horizontal space on the common case (one bulk action = one KPI across multiple employees).

## Files touched
- `src/lib/carriedScoreResolver.ts` — add `isNa` to `CellInputs`, short-circuit in `resolveWithInputs`.
- `src/lib/bulkSignoffImpact.ts` — accept optional `overrideIsNa: Set<string>` and treat those rows as `is_na` for totals.
- `src/components/review/BulkSignoffPreview.tsx` — banner hoist + N/A checkbox + column hiding.
- `src/components/review/BulkApproveDialog.tsx` — payload extension (`isNa`, `naReasons`), passthrough to confirm.
- `src/pages/review/BulkReviewDashboard.tsx` — forward `isNa` + `naReasons` to `stageWrite`.
- Tests: add cases to `bulkApproveDialogSignoffMode.test.tsx` covering (a) N/A toggle emits `isNa` + `naReasons` in confirm payload; (b) approve mode hides the N/A column.

## Out of scope
- DB / RPC changes (already support N/A).
- Mgmt bulk-approve N/A (server doesn't accept it; would need separate RPC change).
- Per-row remark for N/A (reuses the shared dialog remark by design).
- Changes to non-bulk sign-off flows.

## Acceptance
1. As HR PMS in override mode, tick "N/A" on 1 of 3 rows → Resolved shows "—", per-employee rollup excludes that row, and Sign off confirms successfully; DB row has `is_na = true`, `hr_pms_score = NULL`, `na_marked_by_role = 'hr_pms'`.
2. All 3 rows share KPI → banner appears at the top, the KRA·KPI column disappears from the table.
3. Mixed-KPI batch → banner hidden, table unchanged.
4. Management approve mode → N/A column hidden, no regression.
